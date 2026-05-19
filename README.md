# The Teacher's Desk

A small, growing suite of free classroom tools. Static, private, no accounts, no tracking — everything lives in your browser's localStorage and travels with you via export/import.

Today the suite includes:

- **Math Bingo** — load a CSV problem set, call problems on screen, generate printable bingo cards.
- **Seating Chart Designer** — design a classroom layout, manage rosters, randomize seats with constraints (front row, keep-apart pairs).
- **Wheel of Names** — 1970s game-show wheel for picking a random student.

See [`briefs/`](briefs/) for the year-1 plan; more tools are on the way.

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

GitHub Pages, via `.github/workflows/deploy.yml`. Every push to `main` runs the workflow: it builds the seating chart with `npm run build`, assembles `_site/` from the static roots (`index.html`, `about.html`, `bingo/`, `wheel/`, `rosters/`, `shared/`, `assets/`, plus the seating-chart's `dist/` mounted at `/seating-chart/`), and publishes via `actions/deploy-pages`. Currently live at https://ben0sb0rne.github.io/teachers-desk/. The seating chart's `VITE_BASE` is set from the Pages `base_path` so absolute asset URLs work on the project-page subpath.

## Repo conventions

See [`CLAUDE.md`](CLAUDE.md) for design tokens, storage rules, and the "do not" list.
