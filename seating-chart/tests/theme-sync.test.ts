// Verifies that the JS theme tokens used by Konva (which can't read CSS
// variables) stay in sync with the canonical CSS tokens defined in
// /shared/desk.css, in BOTH light and dark mode.
//
// If this test fails, update theme-tokens.ts (or desk.css) so the two
// remain authoritative pairs.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  CHANNELS,
  darkTokens,
  lightTokens,
  type ThemeTokens,
} from "../src/lib/theme-tokens";

const here = path.dirname(fileURLToPath(import.meta.url));
const deskCssPath = path.resolve(here, "..", "..", "shared", "desk.css");
const deskCss = readFileSync(deskCssPath, "utf8");

/** Extract the body of a CSS block beginning with `selector {` and ending
 *  with the matching `}`. Brace-nesting safe (we don't use nested rules,
 *  but the implementation is robust regardless). */
function extractBlock(selector: string): string {
  const start = deskCss.indexOf(selector);
  if (start === -1) throw new Error(`Block ${selector} not found in desk.css`);
  const open = deskCss.indexOf("{", start);
  if (open === -1) throw new Error(`No opening brace after ${selector}`);
  let depth = 1;
  let i = open + 1;
  while (i < deskCss.length && depth > 0) {
    const c = deskCss[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    i++;
  }
  return deskCss.slice(open + 1, i - 1);
}

/** Parse a `--token: R G B;` line and return the channel string, or undefined. */
function readChannel(block: string, name: string): string | undefined {
  const re = new RegExp(`--${name}:\\s*([0-9]+\\s+[0-9]+\\s+[0-9]+)\\s*;`);
  const m = block.match(re);
  if (!m) return undefined;
  return m[1].split(/\s+/).join(" ");
}

function rgbToHex(channel: string): string {
  const [r, g, b] = channel.split(/\s+/).map((n) => Number(n));
  const hex = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

const lightBlock = extractBlock(":root");
const darkBlock = extractBlock('[data-theme="dark"]');

interface FlipCase {
  cssName: string;
  jsKey: keyof ThemeTokens;
}

// Suite tokens that flip between light and dark.
const FLIP_CASES: FlipCase[] = [
  { cssName: "paper-cream",     jsKey: "paperCream" },
  { cssName: "paper-edge",      jsKey: "paperEdge" },
  { cssName: "desk-wood",       jsKey: "deskWood" },
  { cssName: "desk-wood-dark",  jsKey: "deskWoodDark" },
];

describe("theme-tokens.ts light palette mirrors :root in desk.css", () => {
  for (const { cssName, jsKey } of FLIP_CASES) {
    it(`lightTokens.${jsKey} matches --${cssName}`, () => {
      const ch = readChannel(lightBlock, cssName);
      expect(ch, `--${cssName} not found in :root`).toBeDefined();
      expect(rgbToHex(ch!).toUpperCase()).toBe(lightTokens[jsKey].toUpperCase());
    });
  }

  it("CHANNELS strings match :root values verbatim", () => {
    expect(CHANNELS.PAPER_CREAM).toBe(readChannel(lightBlock, "paper-cream"));
    expect(CHANNELS.PAPER_EDGE).toBe(readChannel(lightBlock, "paper-edge"));
    expect(CHANNELS.ACCENT_BLUE).toBe(readChannel(lightBlock, "accent-blue"));
    expect(CHANNELS.ACCENT_YELLOW).toBe(readChannel(lightBlock, "accent-yellow"));
    expect(CHANNELS.DESK_WOOD).toBe(readChannel(lightBlock, "desk-wood"));
  });
});

describe('theme-tokens.ts dark palette mirrors [data-theme="dark"] in desk.css', () => {
  for (const { cssName, jsKey } of FLIP_CASES) {
    it(`darkTokens.${jsKey} matches dark --${cssName}`, () => {
      const ch = readChannel(darkBlock, cssName);
      expect(ch, `--${cssName} not found in [data-theme="dark"] block`).toBeDefined();
      expect(rgbToHex(ch!).toUpperCase()).toBe(darkTokens[jsKey].toUpperCase());
    });
  }
});

describe("non-flipping tokens are identical in light and dark", () => {
  it("accentBlue stays the same (saturated blue reads on either backdrop)", () => {
    expect(darkTokens.accentBlue).toBe(lightTokens.accentBlue);
  });
  it("accentYellow stays the same", () => {
    expect(darkTokens.accentYellow).toBe(lightTokens.accentYellow);
  });
  it("functional colors (frontRow / door / marquee) are semantic — never flip", () => {
    expect(darkTokens.frontRow).toBe(lightTokens.frontRow);
    expect(darkTokens.doorFill).toBe(lightTokens.doorFill);
    expect(darkTokens.doorStroke).toBe(lightTokens.doorStroke);
    expect(darkTokens.marqueeStroke).toBe(lightTokens.marqueeStroke);
  });
});
