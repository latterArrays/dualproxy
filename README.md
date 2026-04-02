# DualProxy

A clean, browser-based MTG proxy card generator with a focus on double-faced and dual-sided cards. Built with React + Vite, deployed on Cloudflare Pages.

**Live site:** [dualproxy.app](https://dualproxy.app)

Vibe coded by Matt Winchester with a healthy dose of Claude :)
---

## Features

- Search cards via Scryfall API
- Color-accurate card rendering with mana symbol support
- Double-faced / dual-sided card layout
- Print-ready proxy output

---

## Roadmap

### Known bugs
- P/T can overlap the middle bar if text is too big
- Tap icon isn't rendering correctly
- PDF Export is brokwn

### Next Up / TODOs / Other ideas
- Bleed probably needs some adjustments for test printing
- Make sure new edit/preview looks good on mobile
- Export card list as txt for easy copy/paste
- Custom xml export to save which art/custom art URL
- **Per-card edit mode**
  - Reposition image
- **Custom Images** 
  - Upload your own backgrounds (works with URL/file, but drag and drop would be nice)
- **Version hash**
- **Contact info for feedback**
- Better look for any NON dual cards

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

DualProxy is a fan-made tool for personal use. Card data and images are sourced from [Scryfall](https://scryfall.com). Magic: The Gathering is property of Wizards of the Coast.
