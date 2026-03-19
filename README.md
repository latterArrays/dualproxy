# DualProxy

A clean, browser-based MTG proxy card generator with a focus on double-faced and dual-sided cards. Built with React + Vite, deployed on Cloudflare Pages.

**Live site:** [dualproxy.app](https://dualproxy.app)

---

## Features

- Search cards via Scryfall API
- Color-accurate card rendering with mana symbol support
- Double-faced / dual-sided card layout
- Print-ready proxy output

---

## Roadmap

### Next Up

- **Bulk import/export** — paste a decklist or import from a file; export all proxies as a print sheet or ZIP
- **Global settings** — default font, text size, card style preferences applied across all cards
- **Per-card edit mode**
  - Adjust card text manually
  - Reposition and set image opacity
  - Version selector for cards with multiple printings

### Stretch Goals

- **Ko-fi integration** — support the project, unlock cosmetic or convenience features
- **MPC Fill / proxy printer integration** — send your proxy sheet directly to a print-on-demand service

---

## Development

```bash
npm install
npm run dev
```

## Deploy

```bash
npm run build
wrangler pages deploy dist/
```

---

## Legal

DualProxy is a fan-made tool for personal, non-commercial use. Card data and images are sourced from [Scryfall](https://scryfall.com). Magic: The Gathering is property of Wizards of the Coast.
