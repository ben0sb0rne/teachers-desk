// =============================================================
// theme-tokens.ts — Konva mirror of suite design tokens.
//
// Konva renders to canvas (not the DOM) and can't read CSS variables, so we
// keep these JS constants in sync with `/shared/desk.css`. A vitest test
// (tests/theme-sync.test.ts) parses desk.css as text and asserts each
// suite token below matches the corresponding `--<token>` value in both
// the :root block (light) and the [data-theme="dark"] block (dark).
//
// SUITE tokens flip between light and dark. FUNCTIONAL tokens are
// semantic (front-row highlight, door amber, drag-select marquee) and
// intentionally do NOT theme — changing one shifts the meaning of a UI
// signal, so we hardcode them.
//
// Consumers should call `useThemeTokens()` from a React component so the
// canvas re-renders when the user toggles theme via shared/storage.js
// (which dispatches a 'themechange' window event).
// =============================================================

import { useEffect, useState } from "react";

export interface ThemeTokens {
  // Suite tokens (flip)
  paperCream: string;
  paperEdge: string;
  deskWood: string;
  deskWoodDark: string;
  neutralLine: string;
  // Suite tokens (don't flip; provided here for API parity)
  accentBlue: string;
  accentYellow: string;
  // Functional tokens (semantic; never flip)
  frontRow: string;
  doorFill: string;
  doorStroke: string;
  marqueeStroke: string;
}

// ── Light mode (matches :root in shared/desk.css) ──
export const lightTokens: ThemeTokens = {
  paperCream: "#F8EED6",
  paperEdge: "#1A1614",
  deskWood: "#BD9060",
  deskWoodDark: "#8C6840",
  neutralLine: "#cbd5e1", // slate-300; quiet grid lines on cream paper
  accentBlue: "#1E5BFF",
  accentYellow: "#FFE03A",
  frontRow: "#fde68a",
  doorFill: "#f59e0b",
  doorStroke: "#92400e",
  marqueeStroke: "#ec4899",
};

// ── Dark mode (matches [data-theme="dark"] in shared/desk.css) ──
export const darkTokens: ThemeTokens = {
  paperCream: "#3A2F22",
  paperEdge: "#EFE5D2",
  deskWood: "#2A2118",
  deskWoodDark: "#18130E",
  neutralLine: "#5C4E3D", // muted warm tan; reads cleanly on dark walnut
  accentBlue: "#1E5BFF",
  accentYellow: "#FFE03A",
  frontRow: "#fde68a",
  doorFill: "#f59e0b",
  doorStroke: "#92400e",
  marqueeStroke: "#ec4899",
};

/** Synchronous read — returns the token set matching the current data-theme
 *  attribute, falling back to system preference for 'auto'. Safe in SSR
 *  contexts (returns light when document is unavailable). */
export function getThemeTokens(): ThemeTokens {
  if (typeof document === "undefined") return lightTokens;
  const explicit = document.documentElement.dataset.theme;
  if (explicit === "dark") return darkTokens;
  if (explicit === "light") return lightTokens;
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? darkTokens : lightTokens;
  }
  return lightTokens;
}

/** React hook that returns the current theme tokens and re-runs when
 *  the user toggles theme (via shared/storage.setTheme, which dispatches
 *  a 'themechange' event) OR when the OS-level prefers-color-scheme
 *  changes (matchMedia 'change' event). */
export function useThemeTokens(): ThemeTokens {
  const [tokens, setTokens] = useState<ThemeTokens>(getThemeTokens);

  useEffect(() => {
    function update() {
      setTokens(getThemeTokens());
    }
    window.addEventListener("themechange", update);
    window.addEventListener("storage", update);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) mq.addEventListener("change", update);
    return () => {
      window.removeEventListener("themechange", update);
      window.removeEventListener("storage", update);
      if (mq.removeEventListener) mq.removeEventListener("change", update);
    };
  }, []);

  return tokens;
}

/** Channel-form values for tokens that need alpha composition in canvas
 *  (e.g. translucent marquee fill). Mirrors the channel-form CSS vars in
 *  desk.css. Light values; dark equivalents would be added if needed. */
export const CHANNELS = {
  PAPER_CREAM: "248 238 214",
  PAPER_EDGE: "26 22 20",
  ACCENT_BLUE: "30 91 255",
  ACCENT_YELLOW: "255 224 58",
  DESK_WOOD: "189 144 96",
} as const;
