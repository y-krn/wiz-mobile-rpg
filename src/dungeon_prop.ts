// balance-impact: none — dungeon world-object geometry only; event, movement,
// save, and effect semantics remain unchanged.
// Renderer-neutral screen-space geometry for non-chest dungeon landmarks.

import type { ProjectionColumn, WorldObjectProjection } from "./rules/renderer_projection.js";

type DungeonPropPlane = Partial<ProjectionColumn> & {
  worldObject?: Partial<WorldObjectProjection["worldObject"]> | null;
};

type Point = Readonly<{ x: number; y: number }>;
type Base = { corridorWidth: number; width: number; centerX: number; baseY: number };

const DEFAULT_STAIR_STYLE = "rough_stone";

export const STAIR_PROP_STYLES = Object.freeze({
  rough_stone: Object.freeze({ stepCount: 4, slope: 0.92 }),
  catacomb_arch: Object.freeze({ stepCount: 5, slope: 0.82 }),
  broken_ledge: Object.freeze({ stepCount: 3, slope: 1.08 }),
  flooded_steps: Object.freeze({ stepCount: 5, slope: 0.76 }),
  forge_stair: Object.freeze({ stepCount: 4, slope: 1.12 }),
  impossible_stair: Object.freeze({ stepCount: 6, slope: 0.68 })
});

function freezePoints(points: Point[]): readonly Point[] {
  return Object.freeze(points.map(({ x, y }) => Object.freeze({ x, y })));
}

function safeStairStyle(style: string): keyof typeof STAIR_PROP_STYLES {
  return Object.hasOwn(STAIR_PROP_STYLES, style) ? style as keyof typeof STAIR_PROP_STYLES : DEFAULT_STAIR_STYLE;
}

export function getDungeonPropBase(plane: DungeonPropPlane | null | undefined, widthRatio: number): Base {
  const left = Number(plane?.leftBottom) || 0;
  const right = Number(plane?.rightBottom) || left;
  const bottom = Number(plane?.bottom) || 0;
  const corridorWidth = Math.max(1, Number(plane?.worldObject?.objectWidth) || right - left);
  const width = Math.max(8, corridorWidth * widthRatio);
  const baseY = Number(plane?.worldObject?.floorContactY) ||
    bottom - Math.max(1, corridorWidth * 0.005);
  return {
    corridorWidth,
    width,
    centerX: (left + right) / 2,
    baseY
  };
}

export function getSpringPropGeometry(plane: DungeonPropPlane | null | undefined) {
  const { width, centerX, baseY } = getDungeonPropBase(plane, 0.42);
  const basinY = baseY - width * 0.13;
  const fountainTop = basinY - width * 0.34;
  const pedestalTop = basinY + width * 0.01;
  const pedestalBottom = baseY - width * 0.02;
  const shadow = Object.freeze({ x: centerX, y: baseY + width * 0.045, radiusX: width * 0.48, radiusY: Math.max(1.5, width * 0.085) });
  return Object.freeze({
    centerX,
    baseY,
    width,
    basin: Object.freeze({ x: centerX, y: basinY, radiusX: width * 0.45, radiusY: Math.max(2, width * 0.115) }),
    water: Object.freeze({ x: centerX, y: basinY - width * 0.012, radiusX: width * 0.31, radiusY: Math.max(1.5, width * 0.064) }),
    fountain: freezePoints([
      { x: centerX - width * 0.075, y: basinY + width * 0.015 },
      { x: centerX + width * 0.075, y: basinY + width * 0.015 },
      { x: centerX + width * 0.055, y: fountainTop + width * 0.07 },
      { x: centerX, y: fountainTop },
      { x: centerX - width * 0.055, y: fountainTop + width * 0.07 }
    ]),
    fountainDrop: Object.freeze({ x: centerX, y: fountainTop - width * 0.035, radiusX: width * 0.035, radiusY: width * 0.055 }),
    pedestal: freezePoints([
      { x: centerX - width * 0.17, y: pedestalTop },
      { x: centerX + width * 0.17, y: pedestalTop },
      { x: centerX + width * 0.12, y: pedestalBottom },
      { x: centerX - width * 0.12, y: pedestalBottom }
    ]),
    rim: Object.freeze({ left: centerX - width * 0.35, right: centerX + width * 0.35, y: basinY - width * 0.015 }),
    shadow
  });
}

export function getStairsPropGeometry(plane: DungeonPropPlane | null | undefined, direction = "down", style = DEFAULT_STAIR_STYLE) {
  const { width, centerX, baseY } = getDungeonPropBase(plane, 0.62);
  const safeStyle = safeStairStyle(style);
  const profile = STAIR_PROP_STYLES[safeStyle];
  const stepCount = profile.stepCount;
  const rise = Math.max(2.5, width * 0.075 * profile.slope);
  const stepWidth = width * 0.82;
  const steps = Object.freeze(Array.from({ length: stepCount }, (_, index) => {
    const progress = index / Math.max(1, stepCount - 1);
    const halfWidth = stepWidth * (direction === "up" ? 0.34 + progress * 0.11 : 0.45 - progress * 0.11);
    const y = baseY - index * rise;
    const depth = Math.max(2, rise * 0.72);
    return Object.freeze({
      points: freezePoints([
        { x: centerX - halfWidth, y },
        { x: centerX + halfWidth, y },
        { x: centerX + halfWidth * 0.94, y: y - depth },
        { x: centerX - halfWidth * 0.94, y: y - depth }
      ]),
      left: centerX - halfWidth,
      right: centerX + halfWidth,
      y,
      depth
    });
  }));
  return Object.freeze({
    centerX,
    baseY,
    width,
    stepCount,
    direction,
    style: safeStyle,
    steps,
    well: freezePoints([
      { x: centerX - stepWidth * 0.50, y: baseY - rise * 0.10 },
      { x: centerX + stepWidth * 0.50, y: baseY - rise * 0.10 },
      { x: centerX + stepWidth * 0.36, y: baseY - rise * (stepCount + 0.9) },
      { x: centerX - stepWidth * 0.36, y: baseY - rise * (stepCount + 0.9) }
    ]),
    shadow: Object.freeze({ x: centerX, y: baseY + width * 0.045, radiusX: width * 0.48, radiusY: Math.max(1.5, width * 0.085) })
  });
}

function parseColor(value: unknown, fallback = 0xffffff): number {
  if (typeof value !== "string") return fallback;
  const match = value.trim().match(/^#([0-9a-f]{6})$/i);
  return match ? Number.parseInt(match[1], 16) : fallback;
}

function mixColor(first: string, second: string, amount: number): number {
  const t = Math.max(0, Math.min(1, amount));
  const a = parseColor(first);
  const b = parseColor(second);
  const channel = (shift: number) => Math.round(((a >> shift) & 0xff) * (1 - t) + ((b >> shift) & 0xff) * t);
  return (channel(16) << 16 | channel(8) << 8 | channel(0));
}

type SpringPalette = Readonly<{ basin: number; pedestal: number; water: "#7cecff"; highlight: "#d7ffff"; shadow: "#000000" }>;
type StairPalette = Readonly<{ stone: number; edge: "#78dfff" | "#ffd27a"; well: number; shadow: "#000000" }>;

export function getDungeonPropPalette(kind: "spring", wallColor?: unknown, direction?: string): SpringPalette;
export function getDungeonPropPalette(kind: "stairs", wallColor?: unknown, direction?: string): StairPalette;
export function getDungeonPropPalette(kind: string, wallColor?: unknown, direction?: string): SpringPalette | StairPalette;
export function getDungeonPropPalette(kind: string, wallColor: unknown = "#58d6e8", direction = "down") {
  const base = typeof wallColor === "string" ? wallColor : "#58d6e8";
  if (kind === "spring") {
    return Object.freeze({
      basin: mixColor(base, "#10232b", 0.44),
      pedestal: mixColor(base, "#1d2630", 0.62),
      water: "#7cecff",
      highlight: "#d7ffff",
      shadow: "#000000"
    });
  }
  return Object.freeze({
    stone: mixColor(base, direction === "up" ? "#101c2c" : "#24190f", 0.52),
    edge: direction === "up" ? "#78dfff" : "#ffd27a",
    well: mixColor(base, "#05080d", 0.84),
    shadow: "#000000"
  });
}

/** Rubble heap that fills the corridor mouth (#1963). */
export function getRubblePropGeometry(plane: DungeonPropPlane | null | undefined) {
  const { width, centerX, baseY } = getDungeonPropBase(plane, 0.94);
  const rock = (cx: number, cy: number, rx: number, ry: number) => freezePoints([
    { x: centerX + width * (cx - rx), y: baseY - width * (cy - ry * 0.2) },
    { x: centerX + width * (cx - rx * 0.6), y: baseY - width * (cy + ry * 0.8) },
    { x: centerX + width * (cx + rx * 0.3), y: baseY - width * (cy + ry) },
    { x: centerX + width * (cx + rx), y: baseY - width * (cy + ry * 0.3) },
    { x: centerX + width * (cx + rx * 0.7), y: baseY - width * (cy - ry * 0.9) },
    { x: centerX + width * (cx - rx * 0.5), y: baseY - width * (cy - ry) }
  ]);
  return Object.freeze({
    width,
    mound: freezePoints([
      { x: centerX - width * 0.5, y: baseY },
      { x: centerX - width * 0.36, y: baseY - width * 0.3 },
      { x: centerX - width * 0.1, y: baseY - width * 0.46 },
      { x: centerX + width * 0.16, y: baseY - width * 0.42 },
      { x: centerX + width * 0.38, y: baseY - width * 0.26 },
      { x: centerX + width * 0.5, y: baseY }
    ]),
    rocks: Object.freeze([
      rock(-0.28, 0.1, 0.13, 0.08),
      rock(0.02, 0.12, 0.16, 0.1),
      rock(0.3, 0.09, 0.12, 0.08),
      rock(-0.14, 0.3, 0.12, 0.08),
      rock(0.14, 0.3, 0.11, 0.07),
      rock(0, 0.42, 0.09, 0.06)
    ]),
    shadow: Object.freeze({ x: centerX, y: baseY + width * 0.03, radiusX: width * 0.52, radiusY: Math.max(1.5, width * 0.06) })
  });
}

/** Stone seal slab with a sigil that closes the corridor (#1963). */
export function getSealPropGeometry(plane: DungeonPropPlane | null | undefined) {
  const { width, centerX, baseY } = getDungeonPropBase(plane, 0.9);
  const top = baseY - width * 1.02;
  const inset = width * 0.07;
  return Object.freeze({
    width,
    slab: freezePoints([
      { x: centerX - width * 0.5, y: top },
      { x: centerX + width * 0.5, y: top },
      { x: centerX + width * 0.5, y: baseY },
      { x: centerX - width * 0.5, y: baseY }
    ]),
    frame: freezePoints([
      { x: centerX - width * 0.5 + inset, y: top + inset },
      { x: centerX + width * 0.5 - inset, y: top + inset },
      { x: centerX + width * 0.5 - inset, y: baseY - inset * 0.4 },
      { x: centerX - width * 0.5 + inset, y: baseY - inset * 0.4 }
    ]),
    seam: freezePoints([
      { x: centerX, y: top + inset },
      { x: centerX, y: baseY - inset * 0.4 }
    ]),
    sigil: Object.freeze({ x: centerX, y: top + width * 0.42, radiusX: width * 0.17, radiusY: width * 0.17 })
  });
}

/** Floor plate with a lever; the handle swings down once pulled (#1963). */
export function getLeverPropGeometry(plane: DungeonPropPlane | null | undefined, pulled = false) {
  const { width, centerX, baseY } = getDungeonPropBase(plane, 0.34);
  const pivot = { x: centerX, y: baseY - width * 0.16 };
  const tipAngle = pulled ? Math.PI * 0.82 : Math.PI * 0.28;
  const length = width * 0.55;
  return Object.freeze({
    width,
    plate: Object.freeze({ x: centerX, y: baseY - width * 0.04, radiusX: width * 0.48, radiusY: Math.max(2, width * 0.12) }),
    post: freezePoints([
      { x: centerX - width * 0.06, y: baseY - width * 0.04 },
      { x: centerX + width * 0.06, y: baseY - width * 0.04 },
      { x: centerX + width * 0.05, y: pivot.y },
      { x: centerX - width * 0.05, y: pivot.y }
    ]),
    handle: freezePoints([
      pivot,
      { x: pivot.x + Math.cos(tipAngle) * length, y: pivot.y - Math.sin(tipAngle) * length }
    ]),
    knob: Object.freeze({
      x: pivot.x + Math.cos(tipAngle) * length,
      y: pivot.y - Math.sin(tipAngle) * length,
      radiusX: width * 0.08,
      radiusY: width * 0.08
    })
  });
}
