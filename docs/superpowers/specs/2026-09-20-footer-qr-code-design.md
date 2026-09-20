# Footer QR code — design

2026-09-20. Approved by Ray in brainstorming (mockup variant B: QR only, no caption).

## What

A QR code encoding `https://pools.thinkdesign.com/` appears in the footer of the
homepage and of all 13 static pool pages. Left-aligned, `min(190px, 50vw)` wide
(half a phone screen on mobile, ~190px elsewhere), placed above the existing
Privacy · Think Design links. No caption. Alt text on all copies:
`QR code for pools.thinkdesign.com`.

## The asset

- One committed file: `public/qr-code.svg` (~1.7 KB).
- Generated once with `npx qrcode -t svg -o public/qr-code.svg "https://pools.thinkdesign.com/"`.
  The exact command is recorded in an XML comment at the top of the SVG, so it
  can be regenerated if the domain ever changes.
- Keeps the generator's default white background and 4-module quiet zone so it
  scans against the site's slate background. The hairline border and slight
  corner radius seen in the approved mockup are applied by the *consumers* via
  CSS, never baked into the SVG.
- Referenced by absolute path `/qr-code.svg` from every template. No import;
  Vite serves `public/` at the site root in dev and build alike.
- The service worker precaches it automatically (`**/*.svg` is already in
  `globPatterns` in `vite.config.js`) — correct, since the footer must render
  offline. No `globIgnores` / `navigateFallbackDenylist` changes: this is an
  asset fetch, not a navigation.

## Placement — three templates, identical markup intent

| Template | Where | Styling mechanism |
|---|---|---|
| `src/App.jsx` footer (~line 388) | Above the Privacy · Think Design line | Tailwind: `w-[min(190px,50vw)] h-auto` + hairline border/radius |
| SEO fallback footer, `vite-plugin-seo.js` (~line 272) | Same position | New rule in `FALLBACK_STYLE` (`#seo-fallback` scope) — Tailwind is purged there |
| Pool-page footer, `pool-page.js` (~line 259) | Same position | New rule in `STYLE` (`.pp` scope) |

The homepage React footer and the SEO fallback footer are subject to the
fallback-parity invariant (CLAUDE.md): both must carry the image with the same
`src` and alt text.

## Docs

One line in HANDOFF.md: what `public/qr-code.svg` is, what it encodes, and the
regeneration command.

## Housekeeping (bundled into the same change)

Add `.superpowers/` to `.gitignore` — brainstorming session artifacts should
never land in a commit.

## Out of scope

- Per-pool QR codes (each pool page's QR encodes the homepage, not the pool URL).
- Captions, print-only styling, runtime QR generation.

## Verification (no test suite exists)

1. `npm run dev` — homepage footer shows the QR, left-aligned, sized correctly
   at phone and desktop widths.
2. `npm run build && npm run preview` — view-source of `/` confirms the fallback
   footer carries the same `<img>`; `/pool/<slug>/` pages show it too.
3. Scan the rendered QR with a phone camera; it must open
   `https://pools.thinkdesign.com/`.
4. Stop for Ray's local check before any commit (per global workflow rule).
