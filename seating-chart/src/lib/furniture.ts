import type { Furniture, FurnitureKind } from "@/types";

const uid = () => crypto.randomUUID();

export interface FurnitureDefault {
  width: number;
  height: number;
  label: string;
  fill: string;
  stroke: string;
}

/** Default visual + dimension presets for each furniture kind. */
export const FURNITURE_DEFAULTS: Record<FurnitureKind, FurnitureDefault> = {
  "teacher-desk": {
    width: 180,
    height: 80,
    label: "Teacher",
    fill: "#d6b288", // matches the bookshelf tan — wood-toned, reads as a desk
    stroke: "#8a5a2c",
  },
  bookshelf: {
    width: 140,
    height: 36,
    label: "",
    fill: "#d6b288", // tan
    stroke: "#8a5a2c",
  },
  window: {
    width: 220,
    height: 14,
    label: "",
    fill: "#bfdcec", // light blue
    stroke: "#5a8aa9",
  },
  whiteboard: {
    width: 280,
    height: 16,
    label: "",
    fill: "#ffffff",
    stroke: "#94a3b8",
  },
  door: {
    width: 64,
    height: 64,
    label: "",
    fill: "#f5f5f5",
    stroke: "#94a3b8",
  },
  plant: {
    width: 50,
    height: 50,
    label: "",
    fill: "#a7d8a3",
    stroke: "#3f7a3a",
  },
  tv: {
    width: 80,
    height: 14,
    label: "",
    fill: "#1f2937", // dark slate (TV face)
    stroke: "#0f172a",
  },
  screen: {
    width: 200,
    height: 12,
    label: "",
    fill: "#f5f5f4", // pull-down projection screen
    stroke: "#737373",
  },
  box: {
    width: 80,
    height: 80,
    label: "",
    fill: "#e7e5e4", // neutral, expects user to recolor + label
    stroke: "#78716c",
  },
  circle: {
    width: 80,
    height: 80,
    label: "",
    fill: "#e7e5e4",
    stroke: "#78716c",
  },
};

export const FURNITURE_KINDS: FurnitureKind[] = [
  "teacher-desk",
  "bookshelf",
  "window",
  "whiteboard",
  "door",
  "plant",
  "tv",
  "screen",
  "box",
  "circle",
];

export function furnitureLabel(kind: FurnitureKind): string {
  switch (kind) {
    case "teacher-desk": return "Teacher desk";
    case "bookshelf": return "Bookshelf";
    case "window": return "Window";
    case "whiteboard": return "Whiteboard";
    case "door": return "Door";
    case "plant": return "Plant";
    case "tv": return "TV";
    case "screen": return "Screen";
    case "box": return "Box";
    case "circle": return "Circle";
  }
}

export interface FurnitureOptions {
  /** Window-only: number of sashes. */
  paneCount?: number;
  /** Box / circle: initial label. */
  label?: string;
}

export function makeFurniture(
  kind: FurnitureKind,
  x: number,
  y: number,
  options: FurnitureOptions = {},
): Furniture {
  const def = FURNITURE_DEFAULTS[kind];
  const f: Furniture = {
    id: uid(),
    kind,
    x,
    y,
    rotation: 0,
    width: def.width,
    height: def.height,
  };
  if (kind === "window" && options.paneCount != null) {
    f.paneCount = options.paneCount;
  }
  if ((kind === "box" || kind === "circle") && options.label != null) {
    f.label = options.label;
  }
  return f;
}

/** Clone a furniture piece with a fresh ID and an applied position offset. */
export function cloneFurnitureWithFreshId(f: Furniture, dx: number, dy: number): Furniture {
  return { ...f, id: uid(), x: f.x + dx, y: f.y + dy };
}
