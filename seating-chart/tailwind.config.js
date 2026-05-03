/** @type {import('tailwindcss').Config} */
//
// Tailwind theme for the Seating Chart Designer.
// Color values reference the suite-wide CSS custom properties defined in
// /shared/desk.css. Channels are space-separated RGB so opacity modifiers
// (`bg-accent-blue/30`, `focus:ring-accent-blue/50`) keep working.
//
// IMPORTANT: keep the values here in sync with seating-chart/src/lib/theme-tokens.ts.
// Konva renders to canvas (not the DOM) and can't read CSS variables, so we mirror
// the tokens as JS constants there and assert sync via tests/theme-sync.test.ts.
//
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // Body inherits the suite's slab stack via desk.css. Keep `sans` as a
        // fallback alias that points to the same font-family so any explicit
        // `font-sans` usage still resolves to the suite type.
        sans: 'var(--font-slab)',
        slab: 'var(--font-slab)',
      },
      colors: {
        // Suite tokens (channel form: `R G B`).
        ink: {
          DEFAULT: 'rgb(var(--paper-edge) / <alpha-value>)',
          muted:   'rgb(var(--paper-edge) / 0.65)',
        },
        paper:        'rgb(var(--paper-cream) / <alpha-value>)',
        // Light cream that does NOT theme — for text on .wood-bg, which is
        // brown in both light + dark mode. text-paper goes dark in dark mode
        // and loses contrast against dark walnut wood. Use text-paper-on-wood
        // for any heading or paragraph that sits directly on the wood surface.
        'paper-on-wood': 'rgb(var(--paper-on-wood) / <alpha-value>)',
        wood:         'rgb(var(--desk-wood) / <alpha-value>)',
        'wood-dark':  'rgb(var(--desk-wood-dark) / <alpha-value>)',
        'accent-blue':   'rgb(var(--accent-blue) / <alpha-value>)',
        'accent-yellow': 'rgb(var(--accent-yellow) / <alpha-value>)',

        // `surface` kept for backwards compat with existing components.
        surface: {
          DEFAULT: 'rgb(var(--paper-cream) / <alpha-value>)',
          alt:     'rgb(var(--paper-edge) / 0.06)',
        },

        // Functional, non-themable color: front-row highlight on the canvas.
        // Carries semantic meaning; do not unify with --accent-yellow.
        front: '#fde68a',
      },
      borderRadius: {
        DEFAULT: '6px', // suite cap
      },
      boxShadow: {
        topbar: 'var(--shadow-paper)',
        // Suite-shared shadow tokens. Names mirror shared/desk.css's
        // --shadow-paper / --shadow-lift so the design system stays unified.
        paper: 'var(--shadow-paper)',
        lift:  'var(--shadow-lift)',
      },
    },
  },
  plugins: [],
};
