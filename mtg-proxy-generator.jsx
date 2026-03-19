import { useState, useRef } from "react";
import posthog from "posthog-js";

const CARD_W = 250;
const CARD_H = 350;

// Color identity → palette
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

// Fancy mana symbol renderer
function ManaSymbol({ symbol }) {
  const s = symbol.replace(/[{}]/g, "");
  const colors = { W: "#f5f0d0", U: "#5ba3d9", B: "#a070c0", R: "#ef4444", G: "#22c55e", C: "#a0a0c0" };
  const bg = colors[s] || "#888";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 14, height: 14, borderRadius: "50%",
      background: bg, color: "#fff", fontSize: 8, fontWeight: "bold",
      margin: "0 1px", verticalAlign: "middle", flexShrink: 0,
      border: "1px solid rgba(0,0,0,0.3)", lineHeight: 1,
    }}>{s}</span>
  );
}

function renderManaText(text) {
  if (!text) return null;
  const parts = text.split(/(\{[^}]+\})/g);
  return parts.map((part, i) =>
    part.match(/^\{[^}]+\}$/) ? <ManaSymbol key={i} symbol={part} /> : <span key={i}>{part}</span>
  );
}

// Art background: real Scryfall art_crop at low opacity, with a color wash overlay
function ArtBackground({ artUrl, palette, isTop }) {
  if (!artUrl) return null;
  const bg0 = palette.bg[0];
  const bg1 = palette.bg[1];
  return (
    <>
      {/* The actual card art, faint */}
      <img
        src={artUrl}
        alt=""
        style={{
          position: "absolute", inset: 0,
          width: "100%", height: "100%",
          objectFit: "cover",
          objectPosition: "center top",
          opacity: 0.22,
          pointerEvents: "none",
          userSelect: "none",
        }}
      />
      {/* Color-tinted gradient overlay to keep text legible and stay on-palette */}
      <div style={{
        position: "absolute", inset: 0,
        background: `linear-gradient(${isTop ? "170deg" : "10deg"}, ${bg0}cc 0%, ${bg1}bb 60%, ${bg0}99 100%)`,
        pointerEvents: "none",
      }} />
      {/* Vignette at edges for depth */}
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.45) 100%)",
        pointerEvents: "none",
      }} />
    </>
  );
}

function CardFaceSection({ face, palette, isTop, artUrl }) {
  if (!face) return null;
  const manaCost = face.mana_cost || "";
  const manaParts = manaCost.match(/\{[^}]+\}/g) || [];
  const typeLine = face.type_line || "";
  const oracleText = face.oracle_text || "";
  const power = face.power;
  const toughness = face.toughness;
  const loyalty = face.loyalty;

  return (
    <div style={{
      position: "relative",
      flex: 1,
      overflow: "hidden",
      background: `linear-gradient(${isTop ? "175deg" : "5deg"}, ${palette.bg[0]}, ${palette.bg[1]})`,
      display: "flex",
      flexDirection: "column",
    }}>
      <ArtBackground artUrl={artUrl} palette={palette} isTop={isTop} />

      {/* Header: name + mana */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "5px 7px 3px",
        borderBottom: `1px solid ${palette.border}`,
        position: "relative", zIndex: 1,
      }}>
        <div style={{
          fontSize: 8.5, fontWeight: "700", color: palette.accent,
          fontFamily: "'Cinzel', serif",
          letterSpacing: "0.03em",
          flex: 1, minWidth: 0,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {face.name}
        </div>
        {manaParts.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0, marginLeft: 4 }}>
            {manaParts.map((m, i) => <ManaSymbol key={i} symbol={m} />)}
          </div>
        )}
      </div>

      {/* Type line */}
      <div style={{
        fontSize: 7, color: palette.text, opacity: 0.75,
        padding: "2px 7px",
        borderBottom: `1px solid ${palette.border}`,
        fontFamily: "'Crimson Text', serif",
        fontStyle: "italic",
        position: "relative", zIndex: 1,
      }}>
        {typeLine}
      </div>

      {/* Oracle text */}
      <div style={{
        flex: 1, padding: "4px 7px",
        fontSize: 7.2, lineHeight: 1.45,
        color: palette.text, opacity: 0.9,
        fontFamily: "'Crimson Text', serif",
        overflowY: "hidden",
        position: "relative", zIndex: 1,
      }}>
        {oracleText.split("\n").map((line, i) => (
          <p key={i} style={{ margin: "0 0 3px" }}>{renderManaText(line)}</p>
        ))}
      </div>

      {/* P/T or Loyalty */}
      {(power !== undefined || loyalty !== undefined) && (
        <div style={{
          display: "flex", justifyContent: "flex-end",
          padding: "2px 6px 3px",
          position: "relative", zIndex: 1,
        }}>
          <div style={{
            fontSize: 8, fontWeight: "bold", color: palette.accent,
            fontFamily: "'Cinzel', serif",
            background: `${palette.bg[1]}cc`,
            border: `1px solid ${palette.border}`,
            borderRadius: 3, padding: "1px 5px",
          }}>
            {power !== undefined ? `${power}/${toughness}` : `[${loyalty}]`}
          </div>
        </div>
      )}
    </div>
  );
}

function ProxyCard({ topFace, bottomFace, topPalette, bottomPalette, topArt, bottomArt }) {
  return (
    <div style={{
      width: CARD_W, height: CARD_H,
      borderRadius: 12,
      overflow: "hidden",
      border: `2px solid #444`,
      display: "flex",
      flexDirection: "column",
      boxShadow: "0 8px 32px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)",
      fontFamily: "'Crimson Text', serif",
      position: "relative",
    }}>
      {/* Top face */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <CardFaceSection face={topFace} palette={topPalette} isTop={true} artUrl={topArt} />
      </div>

      {/* Divider */}
      <div style={{
        height: 16,
        background: `linear-gradient(90deg, ${topPalette.border}, ${bottomPalette.border})`,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <div style={{
          fontSize: 7, color: "#fff", opacity: 0.6,
          letterSpacing: "0.15em", textTransform: "uppercase",
          fontFamily: "'Cinzel', serif",
        }}>✦ transforms ✦</div>
      </div>

      {/* Bottom face (rotated 180°) */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column", overflow: "hidden",
        transform: "rotate(180deg)",
      }}>
        <CardFaceSection face={bottomFace} palette={bottomPalette} isTop={false} artUrl={bottomArt} />
      </div>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div style={{ textAlign: "center", padding: 20, color: "#a0a0c0" }}>
      <div style={{
        width: 32, height: 32, border: "3px solid #2a2a4a",
        borderTopColor: "#8b5cf6", borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
        margin: "0 auto 8px",
      }} />
      <div style={{ fontSize: 12 }}>Fetching card data...</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

async function fetchCard(name) {
  const res = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`);
  if (!res.ok) {
    const fuzzy = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`);
    if (!fuzzy.ok) throw new Error(`Card not found: "${name}"`);
    return fuzzy.json();
  }
  return res.json();
}

export default function App() {
  const [cardName, setCardName] = useState("");
  const [cards, setCards] = useState([]); // [{topFace, bottomFace, topPalette, bottomPalette, id}]
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const printRef = useRef();

  async function handleAdd() {
    if (!cardName.trim()) return;
    setLoading(true);
    setError("");
    try {
      const card = await fetchCard(cardName.trim());
      const isDfc = card.card_faces && card.card_faces.length >= 2;
      let topFace, bottomFace;

      if (isDfc) {
        topFace = card.card_faces[0];
        bottomFace = card.card_faces[1];
      } else {
        // Single faced — duplicate with a note
        topFace = { ...card, name: card.name + " (Front)", oracle_text: card.oracle_text || "" };
        bottomFace = { ...card, name: card.name + " (Back)", oracle_text: "(No back face — single-faced card)", mana_cost: "" };
      }

      // Extract art_crop URLs — per-face if available, else fall back to card-level
      const getArt = (face, fallback) =>
        face?.image_uris?.art_crop || fallback?.image_uris?.art_crop || null;
      const topArt = getArt(topFace, card);
      const bottomArt = getArt(bottomFace, card);

      const topColors = topFace.colors || card.colors || [];
      const botColors = bottomFace.colors || card.colors || [];
      const topPalette = getPalette(topColors);
      const botPalette = getPalette(botColors);

      setCards(prev => [...prev, {
        id: Date.now(),
        topFace, bottomFace, topPalette, botPalette,
        topArt, bottomArt,
        cardName: card.name,
      }]);
      posthog.capture("card_added", { card_name: card.name, is_dfc: isDfc });
      setCardName("");
    } catch (e) {
      posthog.capture("card_search_failed", { card_name: cardName.trim(), error: e.message });
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function handleRemove(id) {
    const card = cards.find(c => c.id === id);
    posthog.capture("card_removed", { card_name: card?.cardName });
    setCards(prev => prev.filter(c => c.id !== id));
  }

  function handlePrint() {
    posthog.capture("print_triggered", { card_count: cards.length });
    window.print();
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0a0a14 0%, #0d0a1a 50%, #0a0f0a 100%)",
      fontFamily: "'Cinzel', serif",
      color: "#e0d0f0",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap');

        * { box-sizing: border-box; }

        .add-btn:hover { background: #7c3aed !important; }
        .remove-btn:hover { opacity: 1 !important; }
        .print-btn:hover { background: #166534 !important; }

        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          .print-grid {
            display: grid !important;
            grid-template-columns: repeat(3, ${CARD_W}px) !important;
            gap: 8px !important;
            padding: 16px !important;
            background: white !important;
          }
          .card-wrap { break-inside: avoid !important; }
        }
      `}</style>

      {/* Header */}
      <div className="no-print" style={{
        padding: "28px 32px 20px",
        borderBottom: "1px solid #2a1a4a",
        background: "rgba(30,10,50,0.6)",
        backdropFilter: "blur(10px)",
      }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h1 style={{
            fontSize: 26, fontWeight: 700, margin: "0 0 4px",
            color: "#c4a4ff",
            letterSpacing: "0.08em",
            textShadow: "0 0 20px rgba(140,90,240,0.4)",
          }}>⚑ Cube Proxy Generator</h1>
          <p style={{
            margin: "0 0 20px", fontSize: 13, color: "#8070a0",
            fontFamily: "'Crimson Text', serif", fontStyle: "italic",
          }}>
            Double-faced & transforming cards — both sides visible, no sleeve-flipping required.
          </p>

          {/* Input */}
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <input
                value={cardName}
                onChange={e => setCardName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAdd()}
                placeholder="Enter card name (e.g. Delver of Secrets)"
                style={{
                  width: "100%", padding: "10px 14px",
                  background: "#1a0f2a", border: "1px solid #4a2a7a",
                  borderRadius: 8, color: "#e0d0f0", fontSize: 14,
                  fontFamily: "'Crimson Text', serif",
                  outline: "none",
                }}
              />
              {error && (
                <div style={{ fontSize: 12, color: "#f87171", marginTop: 6, fontFamily: "'Crimson Text', serif" }}>
                  ⚠ {error}
                </div>
              )}
            </div>
            <button
              className="add-btn"
              onClick={handleAdd}
              disabled={loading}
              style={{
                padding: "10px 20px", background: "#6d28d9",
                border: "none", borderRadius: 8, color: "#fff",
                fontSize: 14, fontWeight: 600, cursor: "pointer",
                fontFamily: "'Cinzel', serif", letterSpacing: "0.05em",
                transition: "background 0.2s",
                opacity: loading ? 0.6 : 1,
              }}>
              + Add Card
            </button>
            {cards.length > 0 && (
              <button
                className="print-btn"
                onClick={handlePrint}
                style={{
                  padding: "10px 20px", background: "#15803d",
                  border: "none", borderRadius: 8, color: "#fff",
                  fontSize: 14, fontWeight: 600, cursor: "pointer",
                  fontFamily: "'Cinzel', serif", letterSpacing: "0.05em",
                  transition: "background 0.2s",
                }}>
                🖨 Print All
              </button>
            )}
          </div>

          <p style={{ fontSize: 11, color: "#5a4a7a", margin: "10px 0 0", fontFamily: "'Crimson Text', serif" }}>
            Works with any double-faced, transforming, or modal DFC card. Data pulled live from Scryfall.
          </p>
        </div>
      </div>

      {/* Card Grid */}
      <div ref={printRef} style={{
        maxWidth: 900, margin: "0 auto",
        padding: "28px 24px",
      }}>
        {loading && <LoadingSpinner />}

        {cards.length === 0 && !loading && (
          <div style={{
            textAlign: "center", padding: "60px 20px",
            color: "#3a2a5a",
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🃏</div>
            <div style={{ fontSize: 16, fontFamily: "'Crimson Text', serif", fontStyle: "italic" }}>
              Add a double-faced card to generate a proxy
            </div>
          </div>
        )}

        <div className="print-grid" style={{
          display: "flex", flexWrap: "wrap", gap: 24,
          justifyContent: "flex-start",
        }}>
          {cards.map(c => (
            <div key={c.id} className="card-wrap" style={{ position: "relative" }}>
              <ProxyCard
                topFace={c.topFace}
                bottomFace={c.bottomFace}
                topPalette={c.topPalette}
                bottomPalette={c.botPalette}
                topArt={c.topArt}
                bottomArt={c.bottomArt}
              />
              <button
                className="remove-btn no-print"
                onClick={() => handleRemove(c.id)}
                style={{
                  position: "absolute", top: -8, right: -8,
                  width: 22, height: 22, borderRadius: "50%",
                  background: "#7f1d1d", border: "none",
                  color: "#fff", fontSize: 12, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  opacity: 0.7, transition: "opacity 0.2s",
                }}>✕</button>
              <div className="no-print" style={{
                textAlign: "center", marginTop: 6,
                fontSize: 10, color: "#5a4a7a",
                fontFamily: "'Crimson Text', serif",
              }}>{c.cardName}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
