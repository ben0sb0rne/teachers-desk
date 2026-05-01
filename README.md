# The Teacher's Desk

A small, growing suite of free classroom tools. Static, private, no accounts, no tracking — everything lives in your browser's localStorage and travels with you via export/import.

Today the suite includes:

- **Math Bingo** — load a CSV problem set, call problems on screen, generate printable bingo cards.
- **Seating Chart Designer** — design a classroom layout, manage rosters, randomize seats with constraints (front row, keep-apart pairs).

More tools are planned (a name picker is next on the list).

## Run locally

The suite is a static site. From the repo root:

```bash
python -m http.server 8000
# then open http://localhost:8000
```

(Math Bingo loads CSV problem sets via `fetch`, which needs HTTP — opening `index.html` directly via `file://` won't work for that part.)

The Seating Chart Designer additionally has its own dev server (Vite):

```bash
cd seating-chart
npm install   # first time only
npm run dev
```

## Deploy

Cloudflare Pages, static. The seating chart requires a build:

```bash
cd seating-chart
npm run build
```

Deploy the repo root, replacing `/seating-chart/` with the contents of `seating-chart/dist/`.

## Repo conventions

See [`CLAUDE.md`](CLAUDE.md) for design tokens, storage rules, and the "do not" list.
