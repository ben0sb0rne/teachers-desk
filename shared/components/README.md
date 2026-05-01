# shared/components/

Reusable UI pieces for The Teacher's Desk.

**Today, all of the suite's components are CSS-only.** Their classes
live in [`../desk.css`](../desk.css), not in this folder. This folder
exists so that JS-driven components (web components, render helpers,
behavior modules) have a stable home when they're added.

## CSS classes available in `desk.css`

| Class            | Purpose                                                       |
|------------------|---------------------------------------------------------------|
| `.placard`       | Museum-style numbered card with title, italic subtitle, arrow |
| `.sticky-note`   | Yellow Post-it; subtle rotation; modifier classes for tilt    |
| `.print-paper`   | Cream paper card with drop shadow; opt-in slight rotation     |
| `.desk-button`   | Primary button in the suite's design system                   |
| `.tag`           | Small all-caps letterspaced label                             |
| `.off-register`  | Riso-style misregistered text effect (blue)                   |
| `.wood-bg`       | Honey-oak desk background utility (vignetted)                 |

## When to add files here

- **Behavior** — a JS module that adds interactivity to a CSS class
  (e.g. a draggable sticky-note that snaps to a grid).
- **Render helpers** — a small function that returns an HTML string
  for a complex component, so tools don't duplicate markup.
- **Web components** — `<desk-button>`, `<sticky-note>` etc. if we
  ever want them to be self-contained and reusable.

## When NOT to add files here

- A new CSS class. Put it in `desk.css` next to its peers so the
  design system stays in one place.
- Tool-specific UI. That belongs inside the tool's own folder.
- Anything that requires a build step. Suite components stay vanilla.
