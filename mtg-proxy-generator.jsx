import { useState, useRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import html2canvas from "html2canvas";
import posthog from "posthog-js";
import "mana-font/css/mana.css";

const CARD_W = 252;    // 63mm at 4px/mm — exact MTG card trim width
const CARD_H = 352;    // 88mm at 4px/mm — exact MTG card trim height (ratio 63:88 exactly)
const BLEED_PX = 13;   // 3.25mm per side at 4px/mm — MPC requires 1/8" (3.175mm); 13px gives 3.25mm, safely over the minimum
const FULL_W = CARD_W + 2 * BLEED_PX;  // 278px — full print width including bleed
const FULL_H = CARD_H + 2 * BLEED_PX;  // 378px — full print height including bleed
// Export scale: 6 → 24px/mm output = ~610 DPI.
// At scale 6: bleed=78px each side, trim=1512×2112px, full-bleed=1668×2268px.
const EXPORT_SCALE = 6;
// Safe area: 36px at scale 3 (= BLEED_PX in screen units). No rendered text should
// appear within this margin of the trim/cut boundary (bleed | border | safe | text).
const SAFE_PX = BLEED_PX;

const COLOR_PALETTES = {
  W: { bg: ["#f5f0e8", "#e8ddc8"], accent: "#c8a84b", text: "#2a1f0e", border: "#d4b896", name: "Plains" },
  U: { bg: ["#1a2a4a", "#0d1a33"], accent: "#5ba3d9", text: "#d0e8ff", border: "#2a4a7a", name: "Island" },
  B: { bg: ["#1a0d1a", "#0d0a0d"], accent: "#8b5cf6", text: "#e8d0f0", border: "#3a1a3a", name: "Swamp" },
  R: { bg: ["#3a0d0d", "#1a0505"], accent: "#ef4444", text: "#ffe0d0", border: "#6a1a1a", name: "Mountain" },
  G: { bg: ["#0d2a0d", "#061406"], accent: "#22c55e", text: "#d0f0d8", border: "#1a4a1a", name: "Forest" },
  GOLD: { bg: ["#2a1f0a", "#1a1205"], accent: "#f5c842", text: "#fff0c0", border: "#6a4a10", name: "Multicolor" },
  C: { bg: ["#1a1a2a", "#0d0d1a"], accent: "#a0a0c0", text: "#e0e0f0", border: "#3a3a5a", name: "Colorless" },
};

function getPalette(colors) {
  if (!colors || colors.length === 0) return COLOR_PALETTES.C;
  if (colors.length > 1) return COLOR_PALETTES.GOLD;
  return COLOR_PALETTES[colors[0]] || COLOR_PALETTES.C;
}

// Mana font pips (mana.andrewgioia.com — MIT licensed fan-made symbols)
function ManaSymbol({ symbol, size = 9 }) {
  const s = symbol.replace(/[{}]/g, "").toLowerCase();
  return (
    <i
      className={`ms ms-cost ms-${s}`}
      style={{ fontSize: size, verticalAlign: "middle", margin: "0 1px" }}
    />
  );
}

function renderManaText(text) {
  if (!text) return null;
  const parts = text.split(/(\{[^}]+\})/g);
  return parts.map((part, i) =>
    part.match(/^\{[^}]+\}$/) ? <ManaSymbol key={i} symbol={part} /> : <span key={i}>{part}</span>
  );
}

function ArtBackground({ artUrl, palette, isTop, artOpacity, overlayOpacity, vignetteOpacity }) {
  const bg0 = palette.bg[0];
  const bg1 = palette.bg[1];
  return (
    <>
      {artUrl && (
        <div
          style={{
            position: "absolute", inset: 0,
            backgroundImage: `url(${artUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center top",
            opacity: artOpacity,
            pointerEvents: "none",
          }}
        />
      )}
      <div style={{
        position: "absolute", inset: 0,
        background: `linear-gradient(${isTop ? "170deg" : "10deg"}, ${bg0}cc 0%, ${bg1}bb 60%, ${bg0}99 100%)`,
        opacity: overlayOpacity,
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.45) 100%)",
        opacity: vignetteOpacity,
        pointerEvents: "none",
      }} />
    </>
  );
}

// renderArt=false when ProxyCard provides full-bleed art layers (borderless mode).
// bleedExtend: how many px to push name/type line borders past the chrome boundary
//   (set to BLEED_PX when called from ProxyCard so lines reach the cut edge).
function CardFaceSection({ face, palette, isTop, artUrl, artOpacity, overlayOpacity, vignetteOpacity, fontScale = 1, renderArt = true, bleedExtend = 0 }) {
  if (!face) return null;
  const manaCost = face.mana_cost || "";
  const manaParts = manaCost.match(/\{[^}]+\}/g) || [];
  const power = face.power;
  const toughness = face.toughness;
  const loyalty = face.loyalty;

  return (
    <div style={{
      position: "relative",
      flex: 1,
      // overflow:hidden clips absolute art; without art we leave it visible so
      // negative-margin lines can extend into the bleed area.
      overflow: renderArt ? "hidden" : "visible",
      background: renderArt
        ? `linear-gradient(${isTop ? "175deg" : "5deg"}, ${palette.bg[0]}, ${palette.bg[1]})`
        : "transparent",
      display: "flex",
      flexDirection: "column",
    }}>
      {renderArt && (
        <ArtBackground artUrl={artUrl} palette={palette} isTop={isTop}
          artOpacity={artOpacity} overlayOpacity={overlayOpacity} vignetteOpacity={vignetteOpacity} />
      )}

      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        paddingTop: 5, paddingBottom: 3,
        paddingLeft: SAFE_PX + bleedExtend, paddingRight: SAFE_PX + bleedExtend,
        marginLeft: -bleedExtend, marginRight: -bleedExtend,
        borderBottom: `1px solid ${palette.border}`,
        position: "relative", zIndex: 1,
      }}>
        <div style={{
          fontSize: 8.5 * fontScale, fontWeight: "700", color: palette.accent,
          fontFamily: "'Cinzel', serif",
          letterSpacing: "0.03em",
          flex: 1, minWidth: 0,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {face.name}
        </div>
        {manaParts.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0, marginLeft: 4 }}>
            {manaParts.map((m, i) => <ManaSymbol key={i} symbol={m} size={9 * fontScale} />)}
          </div>
        )}
      </div>

      <div style={{
        fontSize: 7 * fontScale, color: palette.text, opacity: 0.75,
        paddingTop: 2, paddingBottom: 2,
        paddingLeft: SAFE_PX + bleedExtend, paddingRight: SAFE_PX + bleedExtend,
        marginLeft: -bleedExtend, marginRight: -bleedExtend,
        borderBottom: `1px solid ${palette.border}`,
        fontFamily: "'Crimson Text', serif",
        fontStyle: "italic",
        position: "relative", zIndex: 1,
      }}>
        {face.type_line || ""}
      </div>

      <div style={{
        flex: 1, padding: `4px ${SAFE_PX}px`,
        paddingBottom: (power !== undefined || loyalty !== undefined) ? `${8 * fontScale + 10}px` : "4px",
        fontSize: 7.2 * fontScale, lineHeight: 1.45,
        color: palette.text, opacity: 0.9,
        fontFamily: "'Crimson Text', serif",
        overflowY: "hidden",
        position: "relative", zIndex: 1,
      }}>
        {(face.oracle_text || "").split("\n").map((line, i) => (
          <p key={i} style={{ margin: "0 0 3px" }}>{renderManaText(line)}</p>
        ))}
        {face.flavor_text && (
          <p style={{ margin: "4px 0 0", fontStyle: "italic", opacity: 0.6, borderTop: `1px solid ${palette.border}`, paddingTop: 3 }}>
            {face.flavor_text}
          </p>
        )}
      </div>

      {(power !== undefined || loyalty !== undefined) && (
        <div style={{
          position: "absolute", bottom: 3, right: SAFE_PX,
          display: "flex", justifyContent: "flex-end",
          zIndex: 2,
        }}>
          <div style={{
            fontSize: 8 * fontScale, fontWeight: "bold", color: palette.accent,
            fontFamily: "'Cinzel', serif",
            background: `${palette.bg[1]}cc`,
            border: `1px solid ${palette.border}`,
            borderRadius: 3, padding: "1px 5px",
          }}>
            {power !== undefined ? `${power}/${toughness}` : `[${loyalty}]`}
          </div>
        </div>
      )}

      {face.artist && (
        <div style={{
          position: "absolute", bottom: 3, left: SAFE_PX,
          zIndex: 2, pointerEvents: "none",
          fontSize: 5.5 * fontScale,
          fontFamily: "'Crimson Text', serif",
          fontStyle: "italic",
          color: palette.text,
          opacity: 0.45,
          letterSpacing: "0.02em",
        }}>
          ✦ {face.artist}
        </div>
      )}
    </div>
  );
}

// ProxyCard always renders at FULL_W × FULL_H (trim + 3mm bleed on each side).
//
// BORDERLESS ARCHITECTURE:
//   Art layers fill the FULL bleed container — top face art in the top half,
//   bottom face art in the bottom half. The art genuinely extends to the bleed edge.
//   The card chrome (name, type, oracle text) sits at inset: BLEED_PX (the trim
//   boundary) with a TRANSPARENT background — text floats over the art.
//   showBorder adds an optional card frame outline at the trim boundary.
//
// Use a <TrimmedCard> wrapper to clip to the 2.5×3.5" trim size in the UI.
function ProxyCard({ topFace, bottomFace, topPalette, bottomPalette, topArt, bottomArt, artOpacity, overlayOpacity, vignetteOpacity, fontScale, flipBottom = true, dividerLabel, layout, showBleed = false, showBorder = false }) {
  const midLabel = dividerLabel ?? autoDividerLabel(layout);
  return (
    // overflow:hidden clips the art to the bleed boundary; borderRadius rounds it.
    <div style={{ width: FULL_W, height: FULL_H, position: "relative", fontFamily: "'Crimson Text', serif", overflow: "hidden", borderRadius: 12 + BLEED_PX }}>

      {/* ── FULL-BLEED ART LAYERS ───────────────────────────────────────────── */}
      {/* Top face art fills the top half of the bleed container (top edge → midpoint).
          The art, gradient overlay, and vignette all extend into the bleed margin. */}
      <div style={{
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: "50%",
        background: `linear-gradient(175deg, ${topPalette.bg[0]}, ${topPalette.bg[1]})`,
        overflow: "hidden",
      }}>
        <ArtBackground artUrl={topArt} palette={topPalette} isTop={true}
          artOpacity={artOpacity} overlayOpacity={overlayOpacity} vignetteOpacity={vignetteOpacity} />
      </div>

      {/* Bottom face art fills the bottom half (midpoint → bottom edge).
          Rotated 180° when flipBottom=true so it matches the flipped chrome face. */}
      <div style={{
        position: "absolute",
        top: "50%", left: 0, right: 0, bottom: 0,
        background: `linear-gradient(5deg, ${bottomPalette.bg[0]}, ${bottomPalette.bg[1]})`,
        overflow: "hidden",
        transform: flipBottom ? "rotate(180deg)" : "none",
        transformOrigin: "50% 50%",
      }}>
        <ArtBackground artUrl={bottomArt} palette={bottomPalette} isTop={false}
          artOpacity={artOpacity} overlayOpacity={overlayOpacity} vignetteOpacity={vignetteOpacity} />
      </div>

      {/* ── BORDER BLEED FILL ───────────────────────────────────────────────── */}
      {/* When showBorder is on, paint the border color over the entire bleed margin
          so there's no art/gradient visible past the cut line. Uses an inset box-shadow
          to fill exactly BLEED_PX inward from the outer edge. */}
      {showBorder && (
        <div style={{
          position: "absolute",
          inset: 0,
          borderRadius: 12 + BLEED_PX,
          boxShadow: `inset 0 0 0 ${BLEED_PX}px #555`,
          pointerEvents: "none",
          zIndex: 2,
        }} />
      )}

      {/* ── CARD CHROME (at trim/cut boundary, transparent background) ──────── */}
      {/* overflow:visible so negative-margin lines inside can reach the bleed edge;
          the outer ProxyCard's overflow:hidden is the final clip boundary. */}
      <div style={{
        position: "absolute",
        inset: BLEED_PX,
        borderRadius: 12,
        overflow: "visible",
        border: showBorder ? "2px solid #555" : "none",
        display: "flex",
        flexDirection: "column",
        boxShadow: showBorder ? "0 8px 32px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)" : "none",
        zIndex: 1,
      }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "visible", minHeight: 0 }}>
          <CardFaceSection face={topFace} palette={topPalette} isTop={true} artUrl={topArt}
            artOpacity={artOpacity} overlayOpacity={overlayOpacity} vignetteOpacity={vignetteOpacity}
            fontScale={fontScale} renderArt={false} bleedExtend={BLEED_PX} />
        </div>

        <div style={{
          height: 8,
          marginLeft: -BLEED_PX, marginRight: -BLEED_PX,
          background: `linear-gradient(90deg, ${topPalette.border}cc, ${bottomPalette.border}cc)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <div style={{
            fontSize: 7, color: "#fff", opacity: 0.7,
            letterSpacing: "0.15em", textTransform: "uppercase",
            fontFamily: "'Cinzel', serif",
          }}>{midLabel}</div>
        </div>

        <div style={{
          flex: 1, display: "flex", flexDirection: "column", overflow: "visible", minHeight: 0,
          transform: flipBottom ? "rotate(180deg)" : "none",
        }}>
          <CardFaceSection face={bottomFace} palette={bottomPalette} isTop={false} artUrl={bottomArt}
            artOpacity={artOpacity} overlayOpacity={overlayOpacity} vignetteOpacity={vignetteOpacity}
            fontScale={fontScale} renderArt={false} bleedExtend={BLEED_PX} />
        </div>
      </div>

      {/* ── CUT LINE GUIDE ──────────────────────────────────────────────────── */}
      {/* Dashed gold line at the trim boundary — only shown in bleed preview mode */}
      {showBleed && (
        <div style={{
          position: "absolute",
          inset: BLEED_PX,
          borderRadius: 12,
          border: "1.5px dashed rgba(255, 215, 0, 0.75)",
          pointerEvents: "none",
          zIndex: 3,
        }} />
      )}
    </div>
  );
}

// Clips a ProxyCard to the trim/cut size (CARD_W × CARD_H) for UI display.
// In the grid, cards look like finished cards. The bleed margin is rendered
// but hidden — html2canvas still captures the full bleed when exporting.
function TrimmedCard({ children, style }) {
  return (
    <div style={{ width: CARD_W, height: CARD_H, overflow: "hidden", borderRadius: 12, position: "relative", flexShrink: 0, ...style }}>
      <div style={{ position: "absolute", top: -BLEED_PX, left: -BLEED_PX }}>
        {children}
      </div>
    </div>
  );
}

// ── CSV / bulk parsing ─────────────────────────────────────────────────────────

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseManaboxCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error("CSV appears empty");
  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
  const nameIdx = headers.findIndex(h => h === "name");
  const qtyIdx = headers.findIndex(h => ["quantity", "qty", "count", "amount"].includes(h));
  if (nameIdx === -1) throw new Error("No 'Name' column found — is this a Manabox CSV?");
  return lines.slice(1).map(line => {
    const fields = parseCSVLine(line);
    const raw = fields[nameIdx]?.trim() || "";
    // DFC: "Delver of Secrets // Insectile Aberration" → use first half for lookup
    const name = raw.split(" // ")[0].trim();
    const qty = qtyIdx >= 0 ? Math.max(1, parseInt(fields[qtyIdx]) || 1) : 1;
    return name ? { name, qty } : null;
  }).filter(Boolean);
}

function parseBulkText(text) {
  return text.split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith("//") && !l.startsWith("#"))
    .map(line => {
      // "4x Card Name", "4× Card Name", "4 Card Name", or just "Card Name"
      const m = line.match(/^(\d+)\s*[x×]?\s+(.+)$/i);
      if (m && parseInt(m[1]) > 0 && m[2].trim()) return { qty: parseInt(m[1]), name: m[2].trim() };
      return { qty: 1, name: line };
    });
}

// ── Scryfall ───────────────────────────────────────────────────────────────────

async function fetchCard(name) {
  const res = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`);
  if (!res.ok) {
    const fuzzy = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`);
    if (!fuzzy.ok) throw new Error(`Card not found: "${name}"`);
    return fuzzy.json();
  }
  return res.json();
}

const LAYOUT_DIVIDER = {
  transform:   "✦ transforms ✦",
  modal_dfc:   "✦ modal ✦",
  // fallback for anything else (single-faced, etc.)
};
function autoDividerLabel(layout) {
  return LAYOUT_DIVIDER[layout] ?? "✦ // ✦";
}

// ── Export utilities ───────────────────────────────────────────────────────────

function sanitizeFilename(name) {
  return name.replace(/[^a-z0-9]/gi, "-").toLowerCase().replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// Crops a full-bleed canvas (FULL_W×FULL_H at `scale`) down to the trim size
// (CARD_W×CARD_H at `scale`) by removing the BLEED_PX margin on each side.
function cropToTrim(bleedCanvas, scale) {
  const b = Math.round(BLEED_PX * scale);
  const w = Math.round(CARD_W * scale);
  const h = Math.round(CARD_H * scale);
  const dst = document.createElement("canvas");
  dst.width = w; dst.height = h;
  dst.getContext("2d").drawImage(bleedCanvas, b, b, w, h, 0, 0, w, h);
  return dst;
}

// Renders a ProxyCard off-screen at FULL_W×FULL_H (native bleed size), then:
//   bleed=true  → returns the full bleed canvas  (FULL_W×FULL_H at scale 3)
//   bleed=false → crops to trim size             (CARD_W×CARD_H at scale 3)
async function renderCardToCanvas(card, settings, { bleed = true } = {}) {
  const container = document.createElement("div");
  container.style.cssText = "position:fixed;left:-9999px;top:0;pointer-events:none;z-index:-1;";
  document.body.appendChild(container);
  const root = createRoot(container);

  await new Promise(resolve => {
    root.render(
      <ProxyCard
        topFace={card.topFace} bottomFace={card.bottomFace}
        topPalette={card.topPalette} bottomPalette={card.botPalette}
        topArt={card.topArt} bottomArt={card.bottomArt}
        flipBottom={card.flipBottom ?? settings.flipBottomDefault}
        artOpacity={card.artOpacity ?? settings.artOpacity}
        overlayOpacity={card.overlayOpacity ?? settings.overlayOpacity}
        vignetteOpacity={card.vignetteOpacity ?? settings.vignetteOpacity}
        fontScale={card.fontScale ?? settings.fontScale}
        dividerLabel={card.dividerLabel} layout={card.layout}
        showBorder={settings.showBorder ?? false}
        showBleed={false}
      />
    );
    setTimeout(resolve, 300);
  });

  // html2canvas captures the full FULL_W×FULL_H ProxyCard (bleed included)
  const fullCanvas = await html2canvas(container.firstChild, {
    useCORS: true,
    allowTaint: false,
    scale: EXPORT_SCALE,
    backgroundColor: null,
    logging: false,
  });

  root.unmount();
  document.body.removeChild(container);
  return bleed ? fullCanvas : cropToTrim(fullCanvas, EXPORT_SCALE);
}

// MPC Fill bracket sizes (number of cards per order tier)
const MPC_BRACKETS = [18, 36, 55, 72, 90, 108, 126, 144, 162, 180, 198, 216, 234, 252, 396, 504, 612];

function generateMPCXml(cards) {
  const totalQty = cards.reduce((sum, c) => sum + (c.qty || 1), 0);
  const bracket = MPC_BRACKETS.find(b => b >= totalQty) ?? MPC_BRACKETS[MPC_BRACKETS.length - 1];

  let slotCursor = 0;
  const frontEntries = cards.map(c => {
    const qty = c.qty || 1;
    const slots = Array.from({ length: qty }, (_, i) => slotCursor + i).join(",");
    slotCursor += qty;
    const id = Math.random().toString(36).substring(2, 10);
    const filename = `${sanitizeFilename(c.cardName)}.png`;
    return `    <card>\n      <id>${id}</id>\n      <slots>${slots}</slots>\n      <name>${filename}</name>\n      <query>${c.cardName}</query>\n    </card>`;
  }).join("\n");

  const allSlots = Array.from({ length: totalQty }, (_, i) => i).join(",");
  const backId = Math.random().toString(36).substring(2, 10);

  return `<?xml version="1.0" encoding="UTF-8"?>
<order>
  <details>
    <quantity>${totalQty}</quantity>
    <bracket>${bracket}</bracket>
    <stock>(S30) Standard Smooth</stock>
    <foil>false</foil>
  </details>
  <fronts>
${frontEntries}
  </fronts>
  <backs>
    <card>
      <id>${backId}</id>
      <slots>${allSlots}</slots>
      <name>default</name>
      <query>default</query>
    </card>
  </backs>
</order>`;
}

function buildCardEntry(card) {
  let topFace, bottomFace;
  if (card.card_faces && card.card_faces.length >= 2) {
    topFace = card.card_faces[0];
    bottomFace = card.card_faces[1];
  } else {
    topFace = { ...card, name: card.name + " (Front)" };
    bottomFace = { ...card, name: card.name + " (Back)", oracle_text: "(Single-faced card — no back face)", mana_cost: "" };
  }
  const getArt = (face, fallback) => face?.image_uris?.art_crop || fallback?.image_uris?.art_crop || null;
  return {
    id: Date.now() + Math.random(),
    topFace, bottomFace,
    topPalette: getPalette(topFace.colors || card.colors || []),
    botPalette: getPalette(bottomFace.colors || card.colors || []),
    topArt: getArt(topFace, card),
    bottomArt: getArt(bottomFace, card),
    cardName: card.name,
    layout: card.layout ?? null,
    dividerLabel: null, // null = auto from layout
    qty: 1,
    flipBottom: null, // null = use global default
    // Per-card appearance overrides (null = use global)
    artOpacity: null,
    overlayOpacity: null,
    vignetteOpacity: null,
    fontScale: null,
  };
}

// ── Edit panel ─────────────────────────────────────────────────────────────────

const inputStyle = {
  width: "100%", padding: "4px 8px",
  background: "#1a0f2a", border: "1px solid #4a2a7a",
  borderRadius: 4, color: "#e0d0f0", fontSize: 11,
  fontFamily: "'Crimson Text', serif",
  outline: "none", boxSizing: "border-box", resize: "vertical",
};

function Field({ label, value, onChange, multiline }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 9, color: "#8070a0", marginBottom: 2, fontFamily: "'Cinzel', serif", letterSpacing: "0.04em" }}>{label}</div>
      {multiline
        ? <textarea value={value} onChange={e => onChange(e.target.value)} rows={3} style={inputStyle} />
        : <input value={value} onChange={e => onChange(e.target.value)} style={inputStyle} />
      }
    </div>
  );
}

function FaceFields({ label, face, setFace, art, setArt }) {
  const f = (l, key, multiline) => (
    <Field label={l} value={face[key] || ""} onChange={v => setFace(p => ({ ...p, [key]: v }))} multiline={multiline} />
  );
  return (
    <>
      <div style={{ fontSize: 9, color: "#7c3aed", fontFamily: "'Cinzel', serif", marginBottom: 6, letterSpacing: "0.06em" }}>{label}</div>
      {f("Name", "name")}
      {f("Mana Cost  (e.g. {2}{U})", "mana_cost")}
      {f("Type Line", "type_line")}
      {f("Oracle Text", "oracle_text", true)}
      {f("Flavor Text", "flavor_text", true)}
      <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
        <Field label="Power" value={face.power || ""} onChange={v => setFace(p => ({ ...p, power: v }))} />
        <Field label="Toughness" value={face.toughness || ""} onChange={v => setFace(p => ({ ...p, toughness: v }))} />
        <Field label="Loyalty" value={face.loyalty || ""} onChange={v => setFace(p => ({ ...p, loyalty: v }))} />
      </div>
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 9, color: "#8070a0", marginBottom: 2, fontFamily: "'Cinzel', serif", letterSpacing: "0.04em" }}>Custom Art URL or Upload</div>
        <div style={{ display: "flex", gap: 4 }}>
          <input value={art} onChange={e => setArt(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
          <label style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 30, flexShrink: 0, borderRadius: 4, cursor: "pointer",
            background: "#1a0f2a", border: "1px solid #4a2a7a", fontSize: 14, color: "#c4a4ff",
          }} title="Upload image from device">
            📁
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
              const file = e.target.files[0];
              if (file) setArt(URL.createObjectURL(file));
              e.target.value = "";
            }} />
          </label>
        </div>
      </div>
      <div style={{ borderTop: "1px solid #2a1a4a", margin: "10px 0 8px" }} />
    </>
  );
}

function FlipToggle({ label, value, onChange }) {
  // value: null = default, true = flipped, false = upright
  const options = [
    { val: null,  label: "Default" },
    { val: true,  label: "Flipped" },
    { val: false, label: "Upright" },
  ];
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 9, color: "#8070a0", marginBottom: 4, fontFamily: "'Cinzel', serif", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ display: "flex", gap: 4 }}>
        {options.map(o => (
          <button key={String(o.val)} onClick={() => onChange(o.val)} style={{
            flex: 1, padding: "4px 0", fontSize: 10, cursor: "pointer",
            fontFamily: "'Cinzel', serif", borderRadius: 4,
            background: value === o.val ? "#6d28d9" : "#1a0f2a",
            border: value === o.val ? "1px solid #8b5cf6" : "1px solid #4a2a7a",
            color: value === o.val ? "#fff" : "#a080c0",
          }}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

function OverrideSlider({ label, value, globalValue, onChange, min = 0, max = 1 }) {
  const isOverridden = value !== null;
  const effective = isOverridden ? value : globalValue;
  const display = min === 0 && max === 1
    ? `${Math.round(effective * 100)}%`
    : `${effective.toFixed(2)}x`;
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
        <div style={{ fontSize: 11, color: "#a090c0", fontFamily: "'Crimson Text', serif", flex: 1 }}>
          {label} <span style={{ color: "#c4a4ff" }}>{display}</span>
          {!isOverridden && <span style={{ color: "#5a4a7a", fontSize: 9, marginLeft: 4 }}>(global)</span>}
        </div>
        {isOverridden && (
          <button onClick={() => onChange(null)} style={{
            background: "none", border: "none", color: "#5a4a7a", fontSize: 9,
            cursor: "pointer", fontFamily: "'Cinzel', serif", padding: 0,
          }}>reset</button>
        )}
      </div>
      <input
        type="range" min={min} max={max} step={0.01} value={effective}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: isOverridden ? "#c4a4ff" : "#4a3a6a" }}
      />
    </div>
  );
}

const editTabStyle = (active) => ({
  flex: 1, padding: "6px 0", fontSize: 10, cursor: "pointer",
  fontFamily: "'Cinzel', serif", letterSpacing: "0.04em",
  background: active ? "#2a1a4a" : "transparent",
  border: active ? "1px solid #4a2a7a" : "1px solid transparent",
  borderBottom: active ? "1px solid #2a1a4a" : "1px solid #4a2a7a",
  borderRadius: active ? "6px 6px 0 0" : "6px 6px 0 0",
  color: active ? "#c4a4ff" : "#5a4a7a",
  marginBottom: -1,
  position: "relative", zIndex: active ? 1 : 0,
});

// ── Printing picker modal ───────────────────────────────────────────────────────

function PrintingPickerModal({ cardName, onSelect, onClose }) {
  const [printings, setPrintings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const isMobile = window.innerWidth < 600;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const url = `https://api.scryfall.com/cards/search?q=!"${encodeURIComponent(cardName)}"&unique=prints&order=released`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("No printings found");
        const data = await res.json();
        if (!cancelled) setPrintings(data.data || []);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [cardName]);

  function getArts(p) {
    if (p.card_faces?.length >= 2) {
      return {
        topArt: p.card_faces[0]?.image_uris?.art_crop || null,
        bottomArt: p.card_faces[1]?.image_uris?.art_crop || null,
      };
    }
    const art = p.image_uris?.art_crop || null;
    return { topArt: art, bottomArt: art };
  }

  function getThumb(p) {
    return p.card_faces?.[0]?.image_uris?.art_crop || p.image_uris?.art_crop || null;
  }

  function getTreatmentLabel(p) {
    const tags = [];
    if (p.border_color === "borderless") tags.push("Borderless");
    const fx = p.frame_effects || [];
    if (fx.includes("extendedart")) tags.push("Extended Art");
    if (fx.includes("showcase")) tags.push("Showcase");
    if (fx.includes("etched")) tags.push("Etched");
    return tags.join(" · ") || null;
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1200,
        background: "rgba(0,0,0,0.82)",
        display: "flex",
        alignItems: isMobile ? "flex-end" : "center",
        justifyContent: "center",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#120a1e",
          border: "1px solid #3a1a5a",
          borderRadius: isMobile ? "14px 14px 0 0" : 12,
          padding: 16,
          width: isMobile ? "100vw" : 480,
          maxWidth: "100vw",
          maxHeight: isMobile ? "88vh" : "82vh",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          color: "#e0d0f0",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#c4a4ff", fontFamily: "'Cinzel', serif", letterSpacing: "0.08em" }}>
            SELECT PRINTING
            {!loading && !error && <span style={{ color: "#5a4a7a", fontWeight: 400, fontSize: 10, marginLeft: 8 }}>{printings.length} versions</span>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#8060a0", fontSize: 16, cursor: "pointer", lineHeight: 1, padding: "4px 0 4px 8px" }}>✕</button>
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: "32px 0", color: "#5a4a7a", fontFamily: "'Crimson Text', serif", fontSize: 13 }}>Loading printings…</div>
        )}
        {error && (
          <div style={{ textAlign: "center", padding: 16, color: "#f87171", fontSize: 11, fontFamily: "'Crimson Text', serif" }}>{error}</div>
        )}
        {!loading && !error && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, overflowY: "auto", flex: 1, minHeight: 0 }}>
            {printings.map(p => {
              const thumb = getThumb(p);
              const label = getTreatmentLabel(p);
              return (
                <div
                  key={p.id}
                  onClick={() => onSelect(getArts(p))}
                  style={{
                    cursor: "pointer",
                    background: "#1a0f2a",
                    border: "1px solid #3a1a5a",
                    borderRadius: 6,
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    transition: "border-color 0.12s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "#7c3aed"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "#3a1a5a"}
                >
                  {thumb
                    ? <img src={thumb} alt={p.set_name} style={{ width: "100%", aspectRatio: "626/457", objectFit: "cover", display: "block" }} crossOrigin="anonymous" />
                    : <div style={{ width: "100%", aspectRatio: "626/457", background: "#2a1a4a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🃏</div>
                  }
                  <div style={{ padding: "5px 6px" }}>
                    <div style={{ fontSize: 9, color: "#c4a4ff", fontFamily: "'Cinzel', serif", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                      {p.set} · #{p.collector_number}
                    </div>
                    <div style={{ fontSize: 9, color: "#7060a0", fontFamily: "'Crimson Text', serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.set_name}
                    </div>
                    {label && (
                      <div style={{ fontSize: 8, color: "#f59e0b", fontFamily: "'Cinzel', serif", letterSpacing: "0.02em", marginTop: 2 }}>{label}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function EditModal({ card, onSave, onCancel, previewProps }) {
  const [top, setTop] = useState({ ...card.topFace });
  const [bot, setBot] = useState({ ...card.bottomFace });
  const [topArt, setTopArt] = useState(card.topArt || "");
  const [botArt, setBotArt] = useState(card.bottomArt || "");
  const [qty, setQty] = useState(card.qty || 1);
  const [flipBottom, setFlipBottom] = useState(card.flipBottom ?? null);
  const [dividerLabel, setDividerLabel] = useState(card.dividerLabel ?? "");
  const [tab, setTab] = useState("look");
  const [textFace, setTextFace] = useState("top");
  const [showPrintingPicker, setShowPrintingPicker] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Per-card appearance overrides
  const [localArtOpacity, setLocalArtOpacity] = useState(card.artOpacity);
  const [localOverlayOpacity, setLocalOverlayOpacity] = useState(card.overlayOpacity);
  const [localVignetteOpacity, setLocalVignetteOpacity] = useState(card.vignetteOpacity);
  const [localFontScale, setLocalFontScale] = useState(card.fontScale);

  const globals = previewProps;
  const effectiveFlip = flipBottom ?? globals.flipBottomDefault;
  const effectiveArt = localArtOpacity ?? globals.artOpacity;
  const effectiveOverlay = localOverlayOpacity ?? globals.overlayOpacity;
  const effectiveVignette = localVignetteOpacity ?? globals.vignetteOpacity;
  const effectiveFont = localFontScale ?? globals.fontScale;
  const isMobile = window.innerWidth < 600;
  const previewScale = isMobile
    ? Math.min(1.1, (window.innerWidth - 40) / CARD_W)
    : 1.2;
  const scaledW = Math.round(CARD_W * previewScale);
  const scaledH = Math.round(CARD_H * previewScale);
  const isDFC = card.bottomFace?.oracle_text !== "(Single-faced card — no back face)";

  function handleArtFile(file, face) {
    if (!file || !file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    face === "bottom" ? setBotArt(url) : setTopArt(url);
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith("image/")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const face = (isDFC && (e.clientY - rect.top) > rect.height / 2) ? "bottom" : "top";
    handleArtFile(file, face);
  }

  const savePayload = {
    topFace: top, bottomFace: bot,
    topArt: topArt || null, bottomArt: botArt || null,
    qty, flipBottom,
    dividerLabel: dividerLabel || null,
    topPalette: getPalette(top.colors || []),
    botPalette: getPalette(bot.colors || []),
    artOpacity: localArtOpacity,
    overlayOpacity: localOverlayOpacity,
    vignetteOpacity: localVignetteOpacity,
    fontScale: localFontScale,
  };

  return (
    <>
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.75)",
        display: "flex",
        alignItems: isMobile ? "flex-end" : "center",
        justifyContent: "center",
        backdropFilter: "blur(4px)",
      }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#120a1e",
          border: "1px solid #3a1a5a",
          borderRadius: isMobile ? "14px 14px 0 0" : 12,
          padding: 16,
          width: isMobile ? "100vw" : "min(92vw, 760px)",
          maxWidth: "100vw",
          maxHeight: isMobile ? "93vh" : "90vh",
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          gap: 16,
          fontSize: 11,
          color: "#e0d0f0",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.6)",
          overflow: "hidden",
        }}
      >
        {/* ── Left: preview + flip ── */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {/* Drag-and-drop card preview */}
          <div
            onDragOver={e => { e.preventDefault(); setIsDraggingOver(true); }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDraggingOver(false); }}
            onDrop={handleDrop}
            style={{
              width: scaledW, height: scaledH,
              position: "relative",
              borderRadius: Math.round(12 * previewScale),
              overflow: "hidden",
              flexShrink: 0,
              outline: isDraggingOver ? "2px dashed #8b5cf6" : "2px solid transparent",
              transition: "outline-color 0.1s",
            }}
          >
            <div style={{ transform: `scale(${previewScale})`, transformOrigin: "top left", position: "absolute", top: 0, left: 0 }}>
              <TrimmedCard>
                <ProxyCard
                  topFace={top} bottomFace={bot}
                  topPalette={getPalette(top.colors || [])}
                  bottomPalette={getPalette(bot.colors || [])}
                  topArt={topArt || card.topArt}
                  bottomArt={botArt || card.bottomArt}
                  artOpacity={effectiveArt} overlayOpacity={effectiveOverlay}
                  vignetteOpacity={effectiveVignette} fontScale={effectiveFont}
                  flipBottom={effectiveFlip}
                  dividerLabel={dividerLabel || null} layout={card.layout}
                  showBorder={globals.showBorder ?? DEFAULTS.showBorder}
                />
              </TrimmedCard>
            </div>
            {isDraggingOver && (
              <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                {isDFC ? (
                  <>
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "50%", background: "rgba(109,40,217,0.45)", display: "flex", alignItems: "center", justifyContent: "center", color: "#e0d0ff", fontSize: 9, fontFamily: "'Cinzel', serif", letterSpacing: "0.08em" }}>▲ TOP FACE</div>
                    <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: "#8b5cf6" }} />
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "50%", background: "rgba(109,40,217,0.45)", display: "flex", alignItems: "center", justifyContent: "center", color: "#e0d0ff", fontSize: 9, fontFamily: "'Cinzel', serif", letterSpacing: "0.08em" }}>▼ BOTTOM FACE</div>
                  </>
                ) : (
                  <div style={{ position: "absolute", inset: 0, background: "rgba(109,40,217,0.45)", display: "flex", alignItems: "center", justifyContent: "center", color: "#e0d0ff", fontSize: 10, fontFamily: "'Cinzel', serif", letterSpacing: "0.08em" }}>DROP ART</div>
                )}
              </div>
            )}
          </div>
          <div style={{ fontSize: 8, color: "#3a2a5a", fontFamily: "'Crimson Text', serif", fontStyle: "italic" }}>
            Drop an image onto the card to set art
          </div>
          <div style={{ width: scaledW }}>
            <FlipToggle label="Bottom face" value={flipBottom} onChange={setFlipBottom} />
          </div>
        </div>

        {/* ── Right: controls ── */}
        <div style={{
          flex: 1, minWidth: 0,
          display: "flex", flexDirection: "column",
          minHeight: 0,
        }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#c4a4ff", fontFamily: "'Cinzel', serif", letterSpacing: "0.08em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
              EDIT — {card.cardName}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 9, color: "#8070a0", fontFamily: "'Cinzel', serif" }}>Qty</span>
                <input
                  type="number" min={1} max={20} value={qty}
                  onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                  style={{ ...inputStyle, width: 48, padding: "2px 6px", fontSize: 11, textAlign: "center" }}
                />
              </div>
              <button onClick={onCancel} style={{ background: "none", border: "none", color: "#8060a0", fontSize: 16, cursor: "pointer", lineHeight: 1, padding: "4px 0 4px 4px" }}>✕</button>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 0, flexShrink: 0 }}>
            <button style={editTabStyle(tab === "look")} onClick={() => setTab("look")}>Look</button>
            <button style={editTabStyle(tab === "text")} onClick={() => setTab("text")}>Text & Art</button>
          </div>

          {/* Tab content — scrollable */}
          <div style={{
            flex: 1, minHeight: 0, overflowY: "auto",
            border: "1px solid #4a2a7a", borderTop: "none",
            borderRadius: "0 0 6px 6px",
            padding: 12, background: "#2a1a4a22",
          }}>
            {tab === "look" && (
              <>
                <div style={{ fontSize: 10, color: "#c4a4ff", fontFamily: "'Cinzel', serif", marginBottom: 6, letterSpacing: "0.06em" }}>PRINTING</div>
                <button
                  onClick={() => setShowPrintingPicker(true)}
                  style={{
                    width: "100%", padding: "7px", marginBottom: 10,
                    background: "#1a0f2a", border: "1px solid #4a2a7a",
                    borderRadius: 6, color: "#c4a4ff",
                    fontSize: 10, cursor: "pointer",
                    fontFamily: "'Cinzel', serif", letterSpacing: "0.04em",
                  }}>
                  Browse Printings →
                </button>
                <div style={{ borderTop: "1px solid #1a1030", margin: "0 0 10px" }} />
                <div style={{ fontSize: 10, color: "#c4a4ff", fontFamily: "'Cinzel', serif", marginBottom: 8, letterSpacing: "0.06em" }}>ART</div>
                <OverrideSlider label="Art Visibility" value={localArtOpacity} globalValue={globals.artOpacity} onChange={setLocalArtOpacity} />
                <OverrideSlider label="Color Wash" value={localOverlayOpacity} globalValue={globals.overlayOpacity} onChange={setLocalOverlayOpacity} />
                <OverrideSlider label="Vignette" value={localVignetteOpacity} globalValue={globals.vignetteOpacity} onChange={setLocalVignetteOpacity} />
                <div style={{ borderTop: "1px solid #1a1030", margin: "10px 0" }} />
                <div style={{ fontSize: 10, color: "#c4a4ff", fontFamily: "'Cinzel', serif", marginBottom: 8, letterSpacing: "0.06em" }}>TEXT</div>
                <OverrideSlider label="Font Size" value={localFontScale} globalValue={globals.fontScale} onChange={setLocalFontScale} min={0.5} max={1.5} />
                <div style={{ borderTop: "1px solid #1a1030", margin: "10px 0" }} />
                <div style={{ fontSize: 10, color: "#c4a4ff", fontFamily: "'Cinzel', serif", marginBottom: 8, letterSpacing: "0.06em" }}>DIVIDER</div>
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 9, color: "#8070a0", marginBottom: 2, fontFamily: "'Cinzel', serif", letterSpacing: "0.04em" }}>
                    Label — leave blank to auto-detect from card type
                  </div>
                  <input
                    value={dividerLabel}
                    onChange={e => setDividerLabel(e.target.value)}
                    placeholder={autoDividerLabel(card.layout)}
                    style={inputStyle}
                  />
                </div>
                <div style={{ fontSize: 10, color: "#5a4a7a", fontFamily: "'Crimson Text', serif", fontStyle: "italic", marginTop: 8 }}>
                  Per-card overrides. Click "reset" to use global settings.
                </div>
              </>
            )}

            {tab === "text" && (
              <>
                <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
                  {[["top", "▲ Top Face"], ["bottom", "▼ Bottom Face"]].map(([val, lbl]) => (
                    <button key={val} onClick={() => setTextFace(val)} style={{
                      flex: 1, padding: "6px 0", fontSize: 10, cursor: "pointer",
                      fontFamily: "'Cinzel', serif", letterSpacing: "0.04em",
                      background: textFace === val ? "#3a1a6a" : "transparent",
                      border: `1px solid ${textFace === val ? "#6d28d9" : "#3a2a5a"}`,
                      borderRadius: 4,
                      color: textFace === val ? "#c4a4ff" : "#5a4a7a",
                    }}>{lbl}</button>
                  ))}
                </div>
                {textFace === "top"
                  ? <FaceFields label="" face={top} setFace={setTop} art={topArt} setArt={setTopArt} />
                  : <FaceFields label="" face={bot} setFace={setBot} art={botArt} setArt={setBotArt} />
                }
              </>
            )}
          </div>

          {/* Buttons */}
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexShrink: 0 }}>
            <button
              onClick={() => onSave(savePayload)}
              style={{ flex: 1, padding: "9px", background: "#6d28d9", border: "none", borderRadius: 6, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Cinzel', serif" }}>
              Save
            </button>
            <button
              onClick={onCancel}
              style={{ flex: 1, padding: "9px", background: "#2a1a3a", border: "1px solid #4a2a6a", borderRadius: 6, color: "#c0a0e0", fontSize: 12, cursor: "pointer", fontFamily: "'Cinzel', serif" }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>

    {showPrintingPicker && (
      <PrintingPickerModal
        cardName={card.cardName}
        onSelect={({ topArt: ta, bottomArt: ba }) => {
          if (ta) setTopArt(ta);
          if (ba) setBotArt(ba);
          setShowPrintingPicker(false);
        }}
        onClose={() => setShowPrintingPicker(false)}
      />
    )}
    </>
  );
}

// ── Settings modal ─────────────────────────────────────────────────────────────

const SAMPLE_CARD_NAME = "Delver of Secrets";

function SettingsModal({ settings, onApply, onCancel }) {
  const [local, setLocal] = useState({ ...settings });
  const [sample, setSample] = useState(null);
  const [tab, setTab] = useState("visuals");

  const set = key => val => setLocal(p => ({ ...p, [key]: val }));
  const isMobile = window.innerWidth < 600;

  useEffect(() => {
    fetchCard(SAMPLE_CARD_NAME)
      .then(card => setSample(buildCardEntry(card)))
      .catch(() => {});
  }, []);

  const toggleRow = (label, key, opts) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: "#a090c0", fontFamily: "'Crimson Text', serif", marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", gap: 4 }}>
        {opts.map(o => (
          <button key={String(o.val)} onClick={() => set(key)(o.val)} style={{
            flex: 1, padding: "7px 0", fontSize: 11, cursor: "pointer",
            fontFamily: "'Cinzel', serif", borderRadius: 4,
            background: local[key] === o.val ? "#6d28d9" : "#1a0f2a",
            border: local[key] === o.val ? "1px solid #8b5cf6" : "1px solid #4a2a7a",
            color: local[key] === o.val ? "#fff" : "#a080c0",
          }}>{o.label}</button>
        ))}
      </div>
    </div>
  );

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.75)",
        display: "flex",
        alignItems: isMobile ? "flex-end" : "center",
        justifyContent: "center",
        backdropFilter: "blur(4px)",
      }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#120a1e",
          border: "1px solid #3a1a5a",
          borderRadius: isMobile ? "14px 14px 0 0" : 12,
          padding: isMobile ? "16px 14px 24px" : "20px 24px",
          width: isMobile ? "100vw" : 620,
          maxWidth: "100vw",
          maxHeight: isMobile ? "85vh" : "90vh",
          display: "flex",
          flexDirection: "column",
          fontSize: 11,
          color: "#e0d0f0",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.6)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#c4a4ff", fontFamily: "'Cinzel', serif", letterSpacing: "0.08em" }}>
            ⚙ SETTINGS
          </div>
          <button onClick={onCancel} style={{ background: "none", border: "none", color: "#8060a0", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>

        {/* Body: controls + preview side-by-side on desktop */}
        <div style={{ display: "flex", gap: 20, flex: 1, minHeight: 0, overflow: "hidden" }}>

          {/* Controls column */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            {/* Tabs */}
            <div style={{ display: "flex", gap: 0, flexShrink: 0 }}>
              <button style={editTabStyle(tab === "visuals")} onClick={() => setTab("visuals")}>Visuals</button>
              <button style={editTabStyle(tab === "layout")} onClick={() => setTab("layout")}>Layout</button>
              <button style={editTabStyle(tab === "interface")} onClick={() => setTab("interface")}>Interface</button>
            </div>
            <div style={{
              flex: 1, minHeight: 0, overflowY: "auto",
              border: "1px solid #4a2a7a", borderTop: "none",
              borderRadius: "0 0 6px 6px",
              padding: 14, background: "#2a1a4a22",
            }}>
              {tab === "visuals" && (
                <>
                  <Slider label="Art Visibility"  value={local.artOpacity}      onChange={set("artOpacity")} />
                  <Slider label="Color Wash"       value={local.overlayOpacity}  onChange={set("overlayOpacity")} />
                  <Slider label="Vignette"         value={local.vignetteOpacity} onChange={set("vignetteOpacity")} />
                  <div style={{ borderTop: "1px solid #1a1030", margin: "12px 0" }} />
                  <Slider label="Font Size" value={local.fontScale} onChange={set("fontScale")} min={0.5} max={1.5} />
                  <div style={{ fontSize: 11, color: "#5a4a7a", fontFamily: "'Crimson Text', serif", fontStyle: "italic", marginTop: 10 }}>
                    Tip: lower Color Wash + higher Art Visibility for a more painterly look.
                  </div>
                </>
              )}
              {tab === "layout" && (
                <>
                  {toggleRow("Bottom face orientation", "flipBottomDefault", [
                    { val: true, label: "Flipped" }, { val: false, label: "Upright" },
                  ])}
                  {toggleRow("Card border", "showBorder", [
                    { val: false, label: "Borderless" }, { val: true, label: "Show Border" },
                  ])}
                </>
              )}
              {tab === "interface" && (
                <Slider label="UI Scale" value={local.uiScale || DEFAULTS.uiScale} onChange={set("uiScale")} min={0.75} max={2.0} />
              )}
            </div>
          </div>

          {/* Live preview — desktop only */}
          {!isMobile && (
            <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 9, color: "#5a4a7a", fontFamily: "'Cinzel', serif", letterSpacing: "0.06em" }}>PREVIEW</div>
              {sample ? (
                <TrimmedCard>
                  <ProxyCard
                    topFace={sample.topFace} bottomFace={sample.bottomFace}
                    topPalette={sample.topPalette} bottomPalette={sample.botPalette}
                    topArt={sample.topArt} bottomArt={sample.bottomArt}
                    artOpacity={local.artOpacity}
                    overlayOpacity={local.overlayOpacity}
                    vignetteOpacity={local.vignetteOpacity}
                    fontScale={local.fontScale}
                    flipBottom={local.flipBottomDefault}
                    showBorder={local.showBorder ?? DEFAULTS.showBorder}
                  />
                </TrimmedCard>
              ) : (
                <div style={{
                  width: CARD_W, height: CARD_H,
                  borderRadius: 12, border: "1px solid #2a1a4a",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <LoadingSpinner />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", gap: 8, marginTop: 16, flexShrink: 0 }}>
          <button
            onClick={() => onApply(local)}
            style={{ flex: 1, padding: "9px", background: "#6d28d9", border: "none", borderRadius: 6, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Cinzel', serif" }}>
            Apply Changes
          </button>
          <button
            onClick={onCancel}
            style={{ flex: 1, padding: "9px", background: "#2a1a3a", border: "1px solid #4a2a6a", borderRadius: 6, color: "#c0a0e0", fontSize: 12, cursor: "pointer", fontFamily: "'Cinzel', serif" }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Settings slider ─────────────────────────────────────────────────────────────

function Slider({ label, value, onChange, min = 0, max = 1 }) {
  const display = min === 0 && max === 1
    ? `${Math.round(value * 100)}%`
    : `${value.toFixed(2)}x`;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
      <div style={{ fontSize: 12, color: "#a090c0", fontFamily: "'Crimson Text', serif", width: 160 }}>
        {label} <span style={{ color: "#c4a4ff" }}>{display}</span>
      </div>
      <input
        type="range" min={min} max={max} step={0.01} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, accentColor: "#8b5cf6" }}
      />
    </div>
  );
}

// ── Loading ────────────────────────────────────────────────────────────────────

function LoadingSpinner({ progress }) {
  return (
    <div style={{ textAlign: "center", padding: 20, color: "#a0a0c0" }}>
      <div style={{
        width: 32, height: 32, border: "3px solid #2a2a4a",
        borderTopColor: "#8b5cf6", borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
        margin: "0 auto 8px",
      }} />
      <div style={{ fontSize: 12 }}>
        {progress ? `Fetching card ${progress.done + 1} of ${progress.total}…` : "Fetching card data…"}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Export modal ───────────────────────────────────────────────────────────────

function ExportOptionRow({ icon, title, description, buttonLabel, onClick, busy, busyLabel, done }) {
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
      <div style={{ fontSize: 22, flexShrink: 0, paddingTop: 2, width: 28, textAlign: "center" }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#c4a4ff", fontFamily: "'Cinzel', serif", marginBottom: 3, letterSpacing: "0.05em" }}>
          {title}
        </div>
        <div style={{ fontSize: 11, color: "#6a5a8a", fontFamily: "'Crimson Text', serif", lineHeight: 1.5, marginBottom: 8 }}>
          {description}
        </div>
        <button
          onClick={onClick}
          disabled={busy}
          style={{
            border: "none", borderRadius: 6, color: "#fff",
            fontSize: 11, fontWeight: 600, cursor: busy ? "default" : "pointer",
            fontFamily: "'Cinzel', serif", letterSpacing: "0.04em",
            padding: "6px 14px",
            background: done ? "#065f46" : busy ? "#3a1a6a" : "#6d28d9",
            opacity: busy ? 0.7 : 1,
            transition: "background 0.15s",
          }}>
          {busy ? busyLabel : done ? "✓ Done" : buttonLabel}
        </button>
      </div>
    </div>
  );
}

function ExportModal({ cards, settings, onClose }) {
  const [imgState, setImgState] = useState({ busy: false, done: false, label: "" });
  const [xmlDone, setXmlDone] = useState(false);
  const [bleed, setBleed] = useState(true);

  async function handleExportImages() {
    setImgState({ busy: true, done: false, label: `Rendering 1 of ${cards.length}…` });
    try {
      for (let i = 0; i < cards.length; i++) {
        setImgState({ busy: true, done: false, label: `Rendering ${i + 1} of ${cards.length}…` });
        const canvas = await renderCardToCanvas(cards[i], settings, { bleed });
        await new Promise(resolve =>
          canvas.toBlob(blob => { downloadBlob(blob, `${sanitizeFilename(cards[i].cardName)}.png`); resolve(); }, "image/png")
        );
      }
      setImgState({ busy: false, done: true, label: "" });
    } catch (e) {
      console.error(e);
      setImgState({ busy: false, done: false, label: "" });
    }
  }

  function handleExportXml() {
    const xml = generateMPCXml(cards);
    downloadBlob(new Blob([xml], { type: "application/xml" }), "mpcfill-order.xml");
    setXmlDone(true);
  }

  const totalCopies = cards.reduce((s, c) => s + (c.qty || 1), 0);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#120a1e",
          border: "1px solid #3a1a5a",
          borderRadius: 12,
          padding: "22px 24px 20px",
          width: 460,
          maxWidth: "95vw",
          color: "#e0d0f0",
          boxShadow: "0 24px 64px rgba(0,0,0,0.8)",
          fontSize: 12,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#c4a4ff", fontFamily: "'Cinzel', serif", letterSpacing: "0.08em" }}>
            EXPORT
          </div>
          <div style={{ fontSize: 11, color: "#5a4a7a", fontFamily: "'Crimson Text', serif", flex: 1, marginLeft: 10 }}>
            {cards.length} unique card{cards.length !== 1 ? "s" : ""} · {totalCopies} total cop{totalCopies !== 1 ? "ies" : "y"}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#8060a0", fontSize: 18, cursor: "pointer", lineHeight: 1, padding: 0 }}>✕</button>
        </div>

        <ExportOptionRow
          icon="🖨"
          title="Print / Save as PDF"
          description="Opens the browser print dialog. Choose 'Save as PDF' to export a digital file, or send to a printer directly."
          buttonLabel="Open Print Dialog"
          onClick={() => window.print()}
          busy={false}
          done={false}
        />

        <div style={{ borderTop: "1px solid #1a1030", margin: "16px 0" }} />

        <ExportOptionRow
          icon="🖼"
          title="Export Card Images"
          description={`Downloads each unique card as a high-res PNG. One file per unique design, named by card.`}
          buttonLabel="Export Images"
          onClick={handleExportImages}
          busy={imgState.busy}
          busyLabel={imgState.label}
          done={imgState.done}
        />
        <label style={{
          display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
          marginTop: 8, marginLeft: 42,
          fontSize: 11, color: bleed ? "#c4a4ff" : "#5a4a7a",
          fontFamily: "'Crimson Text', serif",
          userSelect: "none",
        }}>
          <input
            type="checkbox" checked={bleed} onChange={e => setBleed(e.target.checked)}
            style={{ accentColor: "#8b5cf6", width: 13, height: 13, cursor: "pointer" }}
          />
          Add bleed (1/8″ per side — 2.76×3.76″ total)
          <span style={{ color: "#3a2a5a", fontSize: 10 }}>
            {bleed
              ? `${FULL_W * EXPORT_SCALE}×${FULL_H * EXPORT_SCALE}px`
              : `${CARD_W * EXPORT_SCALE}×${CARD_H * EXPORT_SCALE}px`}
          </span>
        </label>

        <div style={{ borderTop: "1px solid #1a1030", margin: "16px 0" }} />

        <ExportOptionRow
          icon="📋"
          title="Export MPC Fill XML"
          description="Generates an XML order file for MPC Fill (makeplayingcards.com). Export images first, then load both into MPC Fill to place your order."
          buttonLabel="Export XML"
          onClick={handleExportXml}
          busy={false}
          done={xmlDone}
        />
      </div>
    </div>
  );
}

// ── Default settings ───────────────────────────────────────────────────────────

const isMobile = () => typeof window !== "undefined" && window.innerWidth <= 768;

const DEFAULTS = {
  artOpacity:        0.35,  // 0–1: how visible the art image is
  overlayOpacity:    1.0,   // 0–1: strength of the color gradient wash over art
  vignetteOpacity:   1.0,   // 0–1: darkness of the radial edge vignette
  fontScale:         1.3,   // 0.5–1.5x: card text size multiplier
  flipBottomDefault: false, // true = bottom face rotated 180°, false = upright
  uiScale:           isMobile() ? 1.0 : 1.5,   // 0.75–2.0x: overall UI zoom level
  showBorder:        false, // false = borderless (art to edge); true = card frame outline
};

// ── App ────────────────────────────────────────────────────────────────────────

const btnBase = {
  border: "none", borderRadius: 8, color: "#fff",
  fontSize: 14, fontWeight: 600, cursor: "pointer",
  fontFamily: "'Cinzel', serif", letterSpacing: "0.05em",
  transition: "background 0.15s",
  padding: "9px 18px",
};

export default function App() {
  const [cardName, setCardName] = useState("");
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");
  const [importError, setImportError] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [visualizeBleed, setVisualizeBleed] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [rotatedIds, setRotatedIds] = useState(new Set());
  const toggleRotate = id => setRotatedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const [artOpacity, setArtOpacity] = useState(DEFAULTS.artOpacity);
  const [overlayOpacity, setOverlayOpacity] = useState(DEFAULTS.overlayOpacity);
  const [vignetteOpacity, setVignetteOpacity] = useState(DEFAULTS.vignetteOpacity);
  const [fontScale, setFontScale] = useState(DEFAULTS.fontScale);
  const [flipBottomDefault, setFlipBottomDefault] = useState(DEFAULTS.flipBottomDefault);
  const [uiScale, setUiScale] = useState(DEFAULTS.uiScale);
  const [showBorder, setShowBorder] = useState(DEFAULTS.showBorder);
  const fileInputRef = useRef();

  // Auto-detect mobile on mount and adjust uiScale if user hasn't changed it
  const [hasManualScale, setHasManualScale] = useState(false);
  useEffect(() => {
    if (!hasManualScale && window.innerWidth <= 768) {
      setUiScale(1.0);
    }
  }, []);

  async function processEntries(entries) {
    const newCards = [];
    for (let i = 0; i < entries.length; i++) {
      setProgress({ done: i, total: entries.length });
      try {
        const card = await fetchCard(entries[i].name);
        newCards.push({ ...buildCardEntry(card), qty: entries[i].qty });
        posthog.capture("card_added", { card_name: entries[i].name, source: "bulk" });
      } catch (e) {
        console.warn(e.message);
      }
      if (i < entries.length - 1) await new Promise(r => setTimeout(r, 80));
    }
    setProgress(null);
    return newCards;
  }

  async function handleAdd() {
    if (!cardName.trim()) return;
    setLoading(true); setError("");
    try {
      const card = await fetchCard(cardName.trim());
      setCards(prev => [...prev, buildCardEntry(card)]);
      posthog.capture("card_added", { card_name: cardName.trim(), source: "single" });
      setCardName("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleBulkImport() {
    if (!bulkText.trim()) return;
    setLoading(true); setImportError("");
    try {
      const entries = parseBulkText(bulkText);
      const newCards = await processEntries(entries);
      setCards(prev => [...prev, ...newCards]);
      setBulkText(""); setShowBulk(false);
    } catch (e) {
      setImportError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCSVImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true); setImportError("");
    try {
      const text = await file.text();
      const entries = parseManaboxCSV(text);
      const newCards = await processEntries(entries);
      setCards(prev => [...prev, ...newCards]);
      posthog.capture("csv_imported", { card_count: entries.length });
    } catch (err) {
      setImportError(err.message);
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  }

  function handleApplySettings(s) {
    setArtOpacity(s.artOpacity);
    setOverlayOpacity(s.overlayOpacity);
    setVignetteOpacity(s.vignetteOpacity);
    setFontScale(s.fontScale);
    setFlipBottomDefault(s.flipBottomDefault);
    setUiScale(s.uiScale ?? DEFAULTS.uiScale);
    setShowBorder(s.showBorder ?? DEFAULTS.showBorder);
    setShowSettingsModal(false);
  }

  function handleRemove(id) {
    setCards(prev => prev.filter(c => c.id !== id));
    if (editingId === id) setEditingId(null);
  }

  function handleSaveEdit(id, updates) {
    setCards(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    setEditingId(null);
  }

  // For print: expand qty copies per card
  const printCards = cards.flatMap(c =>
    Array.from({ length: c.qty || 1 }, (_, i) => ({ ...c, printId: `${c.id}-${i}` }))
  );

  const opacityProps = { artOpacity, overlayOpacity, vignetteOpacity, fontScale, showBorder };

  return (
    <div className="app-root" style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0a0a14 0%, #0d0a1a 50%, #0a0f0a 100%)",
      fontFamily: "'Cinzel', serif",
      color: "#e0d0f0",
      zoom: uiScale,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap');
        * { box-sizing: border-box; }
        input[type=range] { cursor: pointer; }
        input::placeholder, textarea::placeholder { color: #4a3a6a; opacity: 1; }

        @media (max-width: 768px) {
          .app-root { zoom: 1 !important; }
          .app-header { padding: 16px 12px 14px !important; }
          .header-inner { max-width: 100% !important; }
          .header-title { font-size: 20px !important; }
          .header-subtitle { font-size: 11px !important; margin-bottom: 12px !important; }
          .add-row { flex-direction: column !important; gap: 8px !important; }
          .add-row .card-input { min-width: 0 !important; width: 100% !important; flex: none !important; }
          .btn-row {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 6px !important;
            width: 100% !important;
          }
          .btn-row > button { font-size: 12px !important; padding: 8px 6px !important; width: 100% !important; }
          .screen-grid { padding: 16px 8px !important; }
          .card-grid { gap: 16px !important; justify-content: center !important; }
          .bulk-panel { padding: 10px !important; }
          .bulk-panel textarea { font-size: 11px !important; }
          .app-footer { padding: 10px 12px !important; }
        }

        @media print {
          body { background: white !important; margin: 0; }
          .no-print { display: none !important; }
          .screen-grid { display: none !important; }
          .print-grid {
            display: grid !important;
            grid-template-columns: repeat(3, ${CARD_W}px);
            gap: 8px;
            padding: 12px;
            background: white;
          }
          .card-wrap { break-inside: avoid; }
        }
      `}</style>

      {/* ── Header ── */}
      <div className="no-print app-header" style={{
        padding: "24px 32px 20px",
        borderBottom: "1px solid #2a1a4a",
        background: "rgba(30,10,50,0.6)",
        backdropFilter: "blur(10px)",
      }}>
        <div className="header-inner" style={{ maxWidth: 960, margin: "0 auto" }}>
          <h1 className="header-title" style={{
            fontSize: 24, fontWeight: 700, margin: "0 0 4px",
            color: "#c4a4ff", letterSpacing: "0.08em",
            textShadow: "0 0 20px rgba(140,90,240,0.4)",
          }}>DualProxy</h1>
          <p className="header-subtitle" style={{ margin: "0 0 18px", fontSize: 13, color: "#8070a0", fontFamily: "'Crimson Text', serif", fontStyle: "italic" }}>
            <b>Create beautiful Magic: The Gathering substitute and playtest cards with ease.</b><br></br>
            Make placeholders for Double-faced & transforming cards — both sides visible, no sleeve-flipping required. <br></br>
          </p>

          {/* Single add row */}
          <div className="add-row" style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div className="card-input" style={{ flex: 1, minWidth: 220 }}>
              <input
                value={cardName}
                onChange={e => setCardName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAdd()}
                placeholder="Card name (e.g. Delver of Secrets)"
                style={{
                  width: "100%", padding: "9px 13px",
                  background: "#1a0f2a", border: "1px solid #4a2a7a",
                  borderRadius: 8, color: "#e0d0f0", fontSize: 14,
                  fontFamily: "'Crimson Text', serif", outline: "none",
                }}
              />
              {error && <div style={{ fontSize: 12, color: "#f87171", marginTop: 5, fontFamily: "'Crimson Text', serif" }}>⚠ {error}</div>}
            </div>

            <div className="btn-row" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={handleAdd} disabled={loading} style={{ ...btnBase, background: "#6d28d9", opacity: loading ? 0.6 : 1 }}>
                + Add
              </button>
              <button onClick={() => setShowBulk(s => !s)} style={{ ...btnBase, background: showBulk ? "#1e40af" : "#1d4ed8" }}>
                ☰ Bulk
              </button>
              <button
                onClick={() => setVisualizeBleed(v => !v)}
                title="Toggle bleed preview"
                style={{ ...btnBase, background: visualizeBleed ? "#7c2d12" : "#2a1a4a", border: `1px solid ${visualizeBleed ? "#ea580c" : "#4a2a7a"}` }}>
                ✂ Bleed
              </button>
              <button onClick={() => setShowSettingsModal(true)} style={{ ...btnBase, background: "#2a1a4a", border: "1px solid #4a2a7a" }}>
                ⚙ Settings
              </button>
              {cards.length > 0 && (
                <button onClick={() => setShowExportModal(true)} style={{ ...btnBase, background: "#15803d" }}>
                  ⬆ Export
                </button>
              )}
            </div>
          </div>

          {/* Bulk import panel */}
          {showBulk && (
            <div className="bulk-panel" style={{ marginTop: 12, background: "#0d0820", border: "1px solid #2a1a4a", borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 12, color: "#8070a0", marginBottom: 4, fontFamily: "'Crimson Text', serif" }}>
                One card per line: <code style={{ color: "#c4a4ff" }}>4x Delver of Secrets</code> · <code style={{ color: "#c4a4ff" }}>2 Lightning Bolt</code> · <code style={{ color: "#c4a4ff" }}>Snapcaster Mage</code>
              </div>
              <textarea
                value={bulkText}
                onChange={e => setBulkText(e.target.value)}
                placeholder={"4x Delver of Secrets\n2 Snapcaster Mage\nLightning Bolt"}
                rows={6}
                style={{
                  width: "100%", padding: "8px 12px",
                  background: "#1a0f2a", border: "1px solid #4a2a7a",
                  borderRadius: 6, color: "#e0d0f0", fontSize: 12,
                  fontFamily: "monospace", outline: "none", resize: "vertical",
                }}
              />
              {importError && <div style={{ fontSize: 11, color: "#f87171", marginTop: 4 }}>⚠ {importError}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button onClick={handleBulkImport} disabled={loading} style={{ ...btnBase, background: "#6d28d9", fontSize: 12, padding: "7px 14px", opacity: loading ? 0.6 : 1 }}>
                  Import List
                </button>
                <label style={{ ...btnBase, background: "#0f766e", fontSize: 12, padding: "7px 14px", cursor: "pointer", display: "inline-block" }}>
                  📥 Manabox CSV
                  <input ref={fileInputRef} type="file" accept=".csv" onChange={handleCSVImport} style={{ display: "none" }} />
                </label>
                <span style={{ fontSize: 11, color: "#5a4a7a", fontFamily: "'Crimson Text', serif", fontStyle: "italic" }}>
                  Also accepts Manabox CSV exports
                </span>
              </div>
            </div>
          )}


        </div>
      </div>

      {/* ── Screen card grid ── */}
      <div className="screen-grid" style={{ maxWidth: 960, margin: "0 auto", padding: "28px 24px" }}>
        {loading && <LoadingSpinner progress={progress} />}

        {cards.length === 0 && !loading && (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#3a2a5a" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🃏</div>
            <div style={{ fontSize: 16, fontFamily: "'Crimson Text', serif", fontStyle: "italic" }}>
              Add a card above or bulk-import a list to get started
            </div>
          </div>
        )}

        <div className="card-grid" style={{ display: "flex", flexWrap: "wrap", gap: 28, justifyContent: "flex-start" }}>
          {cards.map(c => (
            <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              {/* Card + overlay buttons */}
              <div style={{ position: "relative", width: visualizeBleed ? FULL_W : CARD_W }}>
                {/* When visualizeBleed=false: clip to trim size so layout is stable.
                    When visualizeBleed=true: show full bleed area with cut line guide. */}
                <div
                  onClick={() => setEditingId(id => id === c.id ? null : c.id)}
                  style={{
                  width: visualizeBleed ? FULL_W : CARD_W,
                  height: visualizeBleed ? FULL_H : CARD_H,
                  overflow: "hidden",
                  borderRadius: 12,
                  position: "relative",
                  cursor: "pointer",
                }}>
                  <div style={{
                    position: "absolute",
                    top: visualizeBleed ? 0 : -BLEED_PX,
                    left: visualizeBleed ? 0 : -BLEED_PX,
                    transform: rotatedIds.has(c.id) ? "rotate(180deg)" : "none",
                    transformOrigin: "center center",
                    transition: "transform 0.3s ease",
                  }}>
                    <ProxyCard
                      topFace={c.topFace} bottomFace={c.bottomFace}
                      topPalette={c.topPalette} bottomPalette={c.botPalette}
                      topArt={c.topArt} bottomArt={c.bottomArt}
                      flipBottom={c.flipBottom ?? flipBottomDefault}
                      artOpacity={c.artOpacity ?? artOpacity}
                      overlayOpacity={c.overlayOpacity ?? overlayOpacity}
                      vignetteOpacity={c.vignetteOpacity ?? vignetteOpacity}
                      fontScale={c.fontScale ?? fontScale}
                      dividerLabel={c.dividerLabel} layout={c.layout}
                      showBleed={visualizeBleed}
                      showBorder={showBorder}
                    />
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5, justifyContent: "flex-end" }}>
                  <span style={{ fontSize: 10, color: "#5a4a7a", fontFamily: "'Crimson Text', serif", flex: 1 }}>
                    {c.cardName}
                    {c.qty > 1 && <span style={{ color: "#8b5cf6", marginLeft: 4 }}>×{c.qty}</span>}
                  </span>
                  <button
                    title="Flip"
                    onClick={() => toggleRotate(c.id)}
                    style={{
                      width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                      background: rotatedIds.has(c.id) ? "#065f46" : "#1e1a3a",
                      border: "1px solid #4a2a7a", color: "#6ee7b7",
                      cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      padding: 0,
                    }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 4 23 10 17 10"/>
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                    </svg>
                  </button>
                  <button
                    title="Edit"
                    onClick={() => setEditingId(id => id === c.id ? null : c.id)}
                    style={{
                      width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                      background: editingId === c.id ? "#6d28d9" : "#1e1a3a",
                      border: "1px solid #4a2a7a", color: "#c4a4ff",
                      cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      padding: 0,
                    }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                  <button
                    title="Remove"
                    onClick={() => handleRemove(c.id)}
                    style={{
                      width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                      background: "#7f1d1d", border: "none", color: "#fff",
                      fontSize: 11, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      padding: 0,
                    }}>✕</button>
                </div>
              </div>

            </div>
          ))}
        </div>
      </div>

      {/* ── Export modal ── */}
      {showExportModal && (
        <ExportModal
          cards={cards}
          settings={{ artOpacity, overlayOpacity, vignetteOpacity, fontScale, flipBottomDefault, showBorder }}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {/* ── Settings modal ── */}
      {showSettingsModal && (
        <SettingsModal
          settings={{ artOpacity, overlayOpacity, vignetteOpacity, fontScale, flipBottomDefault, uiScale, showBorder }}
          onApply={handleApplySettings}
          onCancel={() => setShowSettingsModal(false)}
        />
      )}

      {/* ── Edit modal ── */}
      {editingId && (() => { const c = cards.find(x => x.id === editingId); return c ? (
        <EditModal
          card={c}
          onSave={updates => handleSaveEdit(editingId, updates)}
          onCancel={() => setEditingId(null)}
          previewProps={{ ...opacityProps, flipBottomDefault }}
        />
      ) : null; })()}

      {/* ── Footer ── */}
      <div className="no-print app-footer" style={{
        borderTop: "1px solid #1a0f2a",
        padding: "14px 32px",
        textAlign: "center",
      }}>
        <p style={{ fontSize: 11, color: "#3a2a5a", margin: 0, fontFamily: "'Crimson Text', serif" }}>
          Created with love by <a href="https://github.com/latterArrays" target="_blank" rel="noreferrer" style={{ color: "#5a3a8a" }}>Matt Winchester</a> · Data from Scryfall · Mana pips by <a href="https://mana.andrewgioia.com" target="_blank" rel="noreferrer" style={{ color: "#5a3a8a" }}>Andrew Gioia</a> (MIT)
        </p>
      </div>

      {/* ── Print-only grid (expands qty copies) ── */}
      <div className="print-grid" style={{ display: "none" }}>
        {printCards.map(c => (
          <div key={c.printId} className="card-wrap">
            <TrimmedCard>
              <ProxyCard
                topFace={c.topFace} bottomFace={c.bottomFace}
                topPalette={c.topPalette} bottomPalette={c.botPalette}
                topArt={c.topArt} bottomArt={c.bottomArt}
                flipBottom={c.flipBottom ?? flipBottomDefault}
                artOpacity={c.artOpacity ?? artOpacity}
                overlayOpacity={c.overlayOpacity ?? overlayOpacity}
                vignetteOpacity={c.vignetteOpacity ?? vignetteOpacity}
                fontScale={c.fontScale ?? fontScale}
                dividerLabel={c.dividerLabel} layout={c.layout}
                showBorder={showBorder}
              />
            </TrimmedCard>
          </div>
        ))}
      </div>
    </div>
  );
}
