// Verifies that the JS theme constants used by Konva (which can't read CSS
// variables) stay in sync with the canonical CSS tokens defined in
// /shared/desk.css. If this test fails, update theme-tokens.ts to match
// the new CSS values.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { CHANNELS, PAPER_CREAM, PAPER_EDGE, ACCENT_BLUE, ACCENT_YELLOW, DESK_WOOD } from "../src/lib/theme-tokens";

const here = path.dirname(fileURLToPath(import.meta.url));
const deskCssPath = path.resolve(here, "..", "..", "shared", "desk.css");
const deskCss = readFileSync(deskCssPath, "utf8");

/**
 * Parse a `--token: R G B;` line from desk.css and return the channel
 * string (e.g. "248 238 214"). Returns undefined if not found.
 */
function readChannel(name: string): string | undefined {
  const re = new RegExp(`--${name}:\\s*([0-9]+\\s+[0-9]+\\s+[0-9]+)\\s*;`);
  const m = deskCss.match(re);
  if (!m) return undefined;
  return m[1].split(/\s+/).join(" ");
}

function rgbToHex(channel: string): string {
  const [r, g, b] = channel.split(/\s+/).map((n) => Number(n));
  const hex = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

describe("theme-tokens.ts mirrors /shared/desk.css", () => {
  const cases: { token: keyof typeof CHANNELS; cssName: string; jsHex: string }[] = [
    { token: "PAPER_CREAM",  cssName: "paper-cream",  jsHex: PAPER_CREAM },
    { token: "PAPER_EDGE",   cssName: "paper-edge",   jsHex: PAPER_EDGE },
    { token: "ACCENT_BLUE",  cssName: "accent-blue",  jsHex: ACCENT_BLUE },
    { token: "ACCENT_YELLOW",cssName: "accent-yellow",jsHex: ACCENT_YELLOW },
    { token: "DESK_WOOD",    cssName: "desk-wood",    jsHex: DESK_WOOD },
  ];

  for (const { token, cssName, jsHex } of cases) {
    it(`${token} matches --${cssName}`, () => {
      const channels = readChannel(cssName);
      expect(channels, `--${cssName} not found in desk.css`).toBeDefined();
      // CHANNELS string in JS matches CSS channel string verbatim.
      expect(CHANNELS[token]).toBe(channels);
      // Hex constant equals the same RGB rendered as #RRGGBB (case-insensitive).
      expect(rgbToHex(channels!)).toBe(jsHex.toUpperCase());
    });
  }
});
