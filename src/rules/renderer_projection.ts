// balance-impact: none — renderer projection only; gameplay rules and state mutation are unchanged.
// Shared screen-space projection contract consumed by Pixi.
// Gameplay topology remains canonical; only the presentation profile changes
// with the measured viewport aspect ratio.

export interface ProjectionProfile {
  readonly width: number;
  readonly height: number;
  readonly aspect: number;
  readonly orientation: "portrait" | "wide";
  readonly xScale: number;
  readonly yScale: number;
  readonly vanishingPoint: Readonly<{ x: number; y: number }>;
  readonly coverage: readonly number[];
  readonly edgeBlend: Readonly<Record<string, number>> | null;
  readonly base: Readonly<{ xl: readonly number[]; xr: readonly number[]; yt: readonly number[]; yb: readonly number[] }>;
  readonly columnLayout: readonly Readonly<{ span: number; weights: readonly number[] }>[] | null;
}

export interface ProjectionColumn {
  leftTop: number;
  leftBottom: number;
  rightTop: number;
  rightBottom: number;
  top: number;
  bottom: number;
  viewport: ProjectionProfile;
}

export interface ProjectionPlanes {
  readonly xl: readonly number[];
  readonly xr: readonly number[];
  readonly yt: readonly number[];
  readonly yb: readonly number[];
  readonly leftTop: readonly number[];
  readonly leftBottom: readonly number[];
  readonly rightTop: readonly number[];
  readonly rightBottom: readonly number[];
  readonly ceilingStyle: string;
  readonly viewport: ProjectionProfile;
  readonly columnLayout: Array<Readonly<{ span: number; weights: readonly number[] }>> | null;
}

export type WorldObjectProjection = Readonly<ProjectionColumn> & {
  readonly worldObject: Readonly<{ depth: number; corridorWidth: number; objectWidth: number; floorContactY: number; scale: number }>;
};

export interface CombatMonsterHitRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
  shape: "ellipse";
}

export interface CombatMonsterLayoutEntry {
  monster: object;
  monsterIndex: number;
  row: number;
  column: number;
  cx: number;
  cy: number;
  scale: number;
  slotWidth: number;
  hitRegion: CombatMonsterHitRegion;
}

interface ProjectionGeometry {
  corridorWidth?: unknown;
  ceilingHeight?: unknown;
  wallLean?: unknown;
  ceilingStyle?: unknown;
}

interface ProfileCandidate {
  width?: unknown;
  height?: unknown;
  base?: { xl?: unknown } | null;
}

interface MonsterCandidate {
  hp?: unknown;
  name?: unknown;
  spriteType?: unknown;
}

interface MonsterVisualBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface ColumnLayoutEntry {
  span: number;
  weights: readonly number[];
}

interface ProjectionInput extends Record<string, unknown> {
  xl: ArrayLike<number>;
  xr: ArrayLike<number>;
  yt: ArrayLike<number>;
  yb: ArrayLike<number>;
  leftTop: ArrayLike<number>;
  leftBottom: ArrayLike<number>;
  rightTop: ArrayLike<number>;
  rightBottom: ArrayLike<number>;
  columnLayout?: ArrayLike<ColumnLayoutEntry> | null;
  viewport: ProjectionProfile;
}

interface ColumnInput {
  leftTop: number;
  leftBottom: number;
  rightTop: number;
  rightBottom: number;
  top: number;
  bottom: number;
  viewport: ProjectionProfile;
}

export const CANONICAL_VIEW = Object.freeze({ width: 400, height: 260 });
export const PORTRAIT_NEAR_COVERAGE_MIN = 0.80;
export const WORLD_OBJECT_CELL_DEPTH = 0.5;
export const WORLD_OBJECT_SCALE_EXPONENT = 0.70;

export const BASE_PROJECTION = Object.freeze({
  xl: Object.freeze([0, 100, 145, 170, 184]),
  xr: Object.freeze([400, 300, 255, 230, 216]),
  yt: Object.freeze([0, 52, 86, 106, 118]),
  yb: Object.freeze([260, 208, 174, 154, 142])
});

export const BASE_GEOMETRY = Object.freeze({
  corridorWidth: 1,
  ceilingHeight: 1,
  wallLean: 0,
  ceilingStyle: "flat"
});

const PORTRAIT_COLUMN_LAYOUT = Object.freeze([
  // Total spans and centre weights intentionally diverge: the near plane
  // expands across the camera while depth still contracts quickly.
  // The cell you stand in spans the whole screen: its walls run off both
  // edges, like the canonical wide view, so no pale band frames the world.
  Object.freeze({ span: 1.17, weights: Object.freeze([0.07, 0.86, 0.07]) }),
  Object.freeze({ span: 0.92, weights: Object.freeze([0.12, 0.76, 0.12]) }),
  Object.freeze({ span: 0.78, weights: Object.freeze([0.10, 0.15, 0.64, 0.15, 0.10]) }),
  Object.freeze({ span: 0.72, weights: Object.freeze([0.11, 0.19, 0.40, 0.19, 0.11]) }),
  Object.freeze({ span: 0.45, weights: Object.freeze([0.13, 0.17, 0.40, 0.17, 0.13]) })
]);

const PORTRAIT_EDGE_BLEND = Object.freeze({
  sideFadeStart: 0.01,
  sideFadeEnd: 0.20,
  topFadeEnd: 0.16,
  bottomFadeStart: 0.84,
  vignetteAlpha: 0.18,
  particleCount: 10
});

const GEOMETRY_STYLES = new Set(["flat", "arch"]);

function finitePositive(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function finiteOr(value: unknown, fallback: number): number {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function freezeArray(values: readonly unknown[]): readonly number[] {
  return Object.freeze(values.map(value => Number(value)));
}

/**
 * Wide-frustum strategy: preserve the canonical horizontal topology while
 * making the near planes broad and the far planes converge rapidly. Portrait
 * planes are generated geometry, never a stretched 400x260 bitmap.
 */
export function getProjectionProfile(width: unknown = CANONICAL_VIEW.width, height: unknown = CANONICAL_VIEW.height): ProjectionProfile {
  const viewportWidth = Math.round(finitePositive(width, CANONICAL_VIEW.width));
  const viewportHeight = Math.round(finitePositive(height, CANONICAL_VIEW.height));
  const aspect = viewportWidth / viewportHeight;
  const portrait = aspect < 1;
  const yScale = viewportHeight / CANONICAL_VIEW.height;
  const xScale = viewportWidth / CANONICAL_VIEW.width;
  // Keep the near corridor broad enough to read as the world, while reserving
  // bounded side columns for openings without horizontal crop.
  const portraitWidths = PORTRAIT_COLUMN_LAYOUT.map(({ span, weights }) => (
    span * weights[Math.floor(weights.length / 2)] * viewportWidth
  ));
  const portraitXl = portraitWidths.map(value => (viewportWidth - value) / 2);
  const portraitXr = portraitWidths.map((value, index) => portraitXl[index] + value);
  const yt = portrait
    ? [0, 0.23, 0.34, 0.395, 0.425].map(value => value * viewportHeight)
    : BASE_PROJECTION.yt.map(value => value * yScale);
  const yb = portrait
    ? [1, 0.77, 0.61, 0.505, 0.455].map(value => value * viewportHeight)
    : BASE_PROJECTION.yb.map(value => value * yScale);

  return Object.freeze({
    width: viewportWidth,
    height: viewportHeight,
    aspect,
    orientation: portrait ? "portrait" : "wide",
    xScale,
    yScale,
    vanishingPoint: Object.freeze({
      x: viewportWidth / 2,
      y: (yt[4] + yb[4]) / 2
    }),
    coverage: Object.freeze(portrait
      ? PORTRAIT_COLUMN_LAYOUT.map(({ span, weights }) => span * weights[Math.floor(weights.length / 2)])
      : BASE_PROJECTION.xr.map((right, index) => (right - BASE_PROJECTION.xl[index]) / CANONICAL_VIEW.width)),
    edgeBlend: portrait ? PORTRAIT_EDGE_BLEND : null,
    base: Object.freeze({
      xl: freezeArray(portrait ? portraitXl : BASE_PROJECTION.xl.map(value => value * xScale)),
      xr: freezeArray(portrait ? portraitXr : BASE_PROJECTION.xr.map(value => value * xScale)),
      yt: freezeArray(yt),
      yb: freezeArray(yb)
    }),
    columnLayout: portrait ? PORTRAIT_COLUMN_LAYOUT : null
  });
}

function normalizeProfile(profile: unknown): ProjectionProfile {
  const candidate = profile as (ProfileCandidate & Partial<ProjectionProfile>) | null | undefined;
  if (candidate?.base?.xl && Number.isFinite(candidate.width) && Number.isFinite(candidate.height)) return profile as ProjectionProfile;
  return getProjectionProfile(candidate?.width, candidate?.height);
}

export function getProjectionPlanes(geometry: unknown = BASE_GEOMETRY, profile: unknown = getProjectionProfile()): ProjectionPlanes {
  const geometryInput = geometry as ProjectionGeometry | null | undefined;
  const viewport = normalizeProfile(profile);
  const corridorWidth = finiteOr(geometryInput?.corridorWidth, BASE_GEOMETRY.corridorWidth);
  // Portrait camera framing owns a minimum horizontal near-world presence.
  // Keep biome-specific vertical geometry intact, but do not let a narrow
  // biome profile recreate the old portrait tunnel at the screen edge.
  const horizontalCorridorWidth = viewport.orientation === "portrait"
    ? Math.max(corridorWidth, 0.94)
    : corridorWidth;
  const ceilingHeight = finiteOr(geometryInput?.ceilingHeight, BASE_GEOMETRY.ceilingHeight);
  const wallLean = finiteOr(geometryInput?.wallLean, BASE_GEOMETRY.wallLean);
  const ceilingStyle = GEOMETRY_STYLES.has(geometryInput?.ceilingStyle as string)
    ? geometryInput!.ceilingStyle as string
    : BASE_GEOMETRY.ceilingStyle;
  const xl = [];
  const xr = [];
  const yt = [];
  const yb = [];
  const leftTop = [];
  const leftBottom = [];
  const rightTop = [];
  const rightBottom = [];

  for (let z = 0; z < viewport.base.xl.length; z++) {
    // The plane at the camera is the screen frame itself. Biome width and
    // ceiling shape the corridor ahead, but never pull the near walls, floor,
    // or ceiling in from the screen edge.
    const nearFrame = z === 0;
    const baseWidth = viewport.base.xr[z] - viewport.base.xl[z];
    const width = baseWidth * (nearFrame ? 1 : horizontalCorridorWidth);
    const center = (viewport.base.xr[z] + viewport.base.xl[z]) / 2;
    const projectedLeft = center - width / 2;
    const projectedRight = center + width / 2;
    const horizon = (viewport.base.yb[z] + viewport.base.yt[z]) / 2;
    const verticalScale = nearFrame ? 1 : ceilingHeight;
    const projectedTop = horizon - (horizon - viewport.base.yt[z]) * verticalScale;
    const projectedBottom = horizon + (viewport.base.yb[z] - horizon) * verticalScale;
    const lean = width * wallLean * 0.5;

    xl.push(projectedLeft);
    xr.push(projectedRight);
    yt.push(projectedTop);
    yb.push(projectedBottom);
    leftTop.push(projectedLeft + lean);
    leftBottom.push(projectedLeft - lean);
    rightTop.push(projectedRight - lean);
    rightBottom.push(projectedRight + lean);
  }

  return Object.freeze({
    xl: freezeArray(xl),
    xr: freezeArray(xr),
    yt: freezeArray(yt),
    yb: freezeArray(yb),
    leftTop: freezeArray(leftTop),
    leftBottom: freezeArray(leftBottom),
    rightTop: freezeArray(rightTop),
    rightBottom: freezeArray(rightBottom),
    ceilingStyle,
    viewport: viewport,
    columnLayout: viewport.columnLayout
      ? viewport.columnLayout.map(({ span, weights }) => Object.freeze({ span: span * horizontalCorridorWidth, weights }))
      : null
  });
}

export function getProjectionColumn(projection: unknown, z: unknown, column: unknown = 0): ProjectionColumn {
  const input = projection as ProjectionInput;
  const depth = z as number;
  const lane = column as number;
  const layout = input.columnLayout?.[depth];
  if (layout) {
    const index = lane + Math.floor(layout.weights.length / 2);
    if (index >= 0 && index < layout.weights.length) {
      const centerTop = (input.leftTop[depth] + input.rightTop[depth]) / 2;
      const centerBottom = (input.leftBottom[depth] + input.rightBottom[depth]) / 2;
      const centerIndex = Math.floor(layout.weights.length / 2);
      const totalTop = (input.rightTop[depth] - input.leftTop[depth]) / layout.weights[centerIndex];
      const totalBottom = (input.rightBottom[depth] - input.leftBottom[depth]) / layout.weights[centerIndex];
      const topStart = layout.weights.slice(0, index).reduce((sum, value) => sum + value, 0);
      const topEnd = topStart + layout.weights[index];
      return {
        leftTop: centerTop - totalTop / 2 + totalTop * topStart,
        leftBottom: centerBottom - totalBottom / 2 + totalBottom * topStart,
        rightTop: centerTop - totalTop / 2 + totalTop * topEnd,
        rightBottom: centerBottom - totalBottom / 2 + totalBottom * topEnd,
        top: input.yt[depth],
        bottom: input.yb[depth],
        viewport: input.viewport
      };
    }
  }
  const topWidth = input.rightTop[depth] - input.leftTop[depth];
  const bottomWidth = input.rightBottom[depth] - input.leftBottom[depth];
  return {
    leftTop: input.leftTop[depth] + topWidth * lane,
    leftBottom: input.leftBottom[depth] + bottomWidth * lane,
    rightTop: input.leftTop[depth] + topWidth * (lane + 1),
    rightBottom: input.leftBottom[depth] + bottomWidth * (lane + 1),
    top: input.yt[depth],
    bottom: input.yb[depth],
    viewport: input.viewport
  };
}

function interpolateProjectionColumn(near: ColumnInput, far: ColumnInput, amount: number): ColumnInput {
  const lerp = (first: number, second: number) => first + (second - first) * amount;
  return {
    leftTop: lerp(near.leftTop, far.leftTop),
    leftBottom: lerp(near.leftBottom, far.leftBottom),
    rightTop: lerp(near.rightTop, far.rightTop),
    rightBottom: lerp(near.rightBottom, far.rightBottom),
    top: lerp(near.top, far.top),
    bottom: lerp(near.bottom, far.bottom),
    viewport: near.viewport
  };
}

/**
 * Shared placement for every dungeon world object.
 *
 * A prop occupies the middle of the same floor segment used by the corridor,
 * so its contact Y and centre come from the projection rather than a portrait
 * coordinate clamp. Its screen width uses one profile-derived easing curve;
 * this keeps adjacent depth steps readable without giving any object its own
 * distance tuning.
 */
export function getWorldObjectProjection(projection: unknown, z: unknown, column: unknown = 0): WorldObjectProjection {
  const input = projection as ProjectionInput;
  const maxDepth = Math.max(0, input.xl.length - 2);
  const depth = Math.max(0, Math.min(maxDepth, Math.floor(Number(z) || 0)));
  const near = getProjectionColumn(input, depth, column);
  const far = getProjectionColumn(input, depth + 1, column);
  const placement = interpolateProjectionColumn(near, far, WORLD_OBJECT_CELL_DEPTH);
  const corridorWidth = Math.max(1, placement.rightBottom - placement.leftBottom);
  const referenceWidth = Math.max(1, input.rightBottom[0] - input.leftBottom[0]);
  const objectWidth = referenceWidth * Math.pow(corridorWidth / referenceWidth, WORLD_OBJECT_SCALE_EXPONENT);
  const fullNearCenterBottom = (input.leftBottom[depth] + input.rightBottom[depth]) / 2;
  const fullFarCenterBottom = (input.leftBottom[depth + 1] + input.rightBottom[depth + 1]) / 2;
  const fullNearCenterTop = (input.leftTop[depth] + input.rightTop[depth]) / 2;
  const fullFarCenterTop = (input.leftTop[depth + 1] + input.rightTop[depth + 1]) / 2;
  const centerBottom = column === 0
    ? fullNearCenterBottom + (fullFarCenterBottom - fullNearCenterBottom) * WORLD_OBJECT_CELL_DEPTH
    : (placement.leftBottom + placement.rightBottom) / 2;
  const centerTop = column === 0
    ? fullNearCenterTop + (fullFarCenterTop - fullNearCenterTop) * WORLD_OBJECT_CELL_DEPTH
    : (placement.leftTop + placement.rightTop) / 2;
  const floorContactY = placement.bottom - Math.max(1, corridorWidth * 0.005);
  return Object.freeze({
    ...placement,
    leftTop: centerTop - objectWidth / 2,
    rightTop: centerTop + objectWidth / 2,
    leftBottom: centerBottom - objectWidth / 2,
    rightBottom: centerBottom + objectWidth / 2,
    worldObject: Object.freeze({
      depth,
      corridorWidth,
      objectWidth,
      floorContactY,
      scale: objectWidth / corridorWidth
    })
  });
}

export function getCombatMonsterLayout(monsters: unknown, profile: unknown = getProjectionProfile()): CombatMonsterLayoutEntry[] {
  if (!Array.isArray(monsters)) return [];
  const viewport = normalizeProfile(profile);
  const alive: Array<{ monster: object; index: number }> = (monsters as unknown[])
    .map((monster: unknown, index: number) => ({ monster, index }))
    .filter((entry): entry is { monster: object; index: number } => Boolean(entry.monster && typeof entry.monster === "object" && ((entry.monster as MonsterCandidate).hp as number) > 0));
  if (alive.length === 0) return [];

  const columns = alive.length >= 4 ? Math.ceil(alive.length / 2) : alive.length;
  const rows = alive.length >= 4 ? 2 : 1;
  const scale = alive.length >= 4 ? 0.52 : alive.length >= 2 ? 0.72 : 1;

  return alive.map(({ monster, index }, layoutIndex) => {
    const row = Math.floor(layoutIndex / columns);
    const rowStart = row * columns;
    const rowCount = Math.min(columns, alive.length - rowStart);
    const slotWidth = viewport.width / rowCount;
    const column = layoutIndex - rowStart;
    const cx = slotWidth * (column + 0.5);
    const cy = rows === 1
      ? viewport.height * 0.56
      : row === 0 ? viewport.height * 0.38 : viewport.height * 0.72;
    return {
      monster,
      monsterIndex: index,
      row,
      column,
      cx,
      cy,
      scale,
      slotWidth,
      hitRegion: getCombatMonsterHitRegion(monster, cx, cy, scale)
    };
  });
}

const MONSTER_VISUAL_BOUNDS: Readonly<Record<string, Readonly<MonsterVisualBounds>>> = Object.freeze({
  biter: Object.freeze({ left: -35, top: -35, right: 35, bottom: 33 }),
  kobold: Object.freeze({ left: -35, top: -50, right: 25, bottom: 30 }),
  zombie: Object.freeze({ left: -45, top: -45, right: 45, bottom: 25 }),
  skeleton: Object.freeze({ left: -18, top: -47, right: 40, bottom: 15 }),
  orc: Object.freeze({ left: -35, top: -55, right: 35, bottom: 30 }),
  mage: Object.freeze({ left: -35, top: -47, right: 20, bottom: 30 }),
  spirit: Object.freeze({ left: -24, top: -42, right: 24, bottom: 24 }),
  wisp: Object.freeze({ left: -26, top: -48, right: 26, bottom: 28 }),
  spider: Object.freeze({ left: -50, top: -47, right: 50, bottom: 22 }),
  bat: Object.freeze({ left: -55, top: -50, right: 55, bottom: 26 }),
  rabbit: Object.freeze({ left: -20, top: -78, right: 20, bottom: 28 }),
  flack: Object.freeze({ left: -45, top: -58, right: 45, bottom: 32 }),
  dragon: Object.freeze({ left: -90, top: -70, right: 90, bottom: 32 })
});

function getMonsterSpriteType(monster: object): string {
  const input = monster as MonsterCandidate | null | undefined;
  if (input?.spriteType) return input.spriteType as string;
  const name = (input?.name || "") as string;
  if (name.includes("かみつき") || name.includes("Biter")) return "biter";
  if (name.includes("コボルト") || name.includes("Kobold")) return "kobold";
  if (name.includes("ゾンビ") || name.includes("Zombie")) return "zombie";
  if (name.includes("ガイコツ") || name.includes("Skeleton")) return "skeleton";
  if (name.includes("オーク") || name.includes("Orc")) return "orc";
  if (name.includes("魔術師") || name.includes("Mage")) return "mage";
  if (name.includes("スピリット")) return "spirit";
  if (name.includes("ウィル・オー・ウィスプ")) return "wisp";
  if (name.includes("スパイダー")) return "spider";
  if (name.includes("バット")) return "bat";
  if (name.includes("フラック")) return "flack";
  if (name.includes("竜") || name.includes("Dragon")) return "dragon";
  return "biter";
}

function getMonsterScaleMultiplier(monster: object): number {
  const name = ((monster as MonsterCandidate | null | undefined)?.name || "") as string;
  if (name.includes("ジャイアント") || name.includes("巨躯")) return 1.18;
  if (name.includes("ゴーレム") || name.includes("アーマー") || name.includes("ストーン") || name.includes("石像")) return 1.08;
  return 1;
}

function getCombatMonsterHitRegion(monster: object, cx: number, cy: number, scale: number): CombatMonsterHitRegion {
  const bounds = MONSTER_VISUAL_BOUNDS[getMonsterSpriteType(monster)] || MONSTER_VISUAL_BOUNDS.biter;
  const visualScale = scale * getMonsterScaleMultiplier(monster);
  const touchPadding = Math.max(8, 12 / scale);
  const left = (bounds.left - touchPadding) * visualScale;
  const top = (bounds.top - touchPadding) * visualScale;
  const right = (bounds.right + touchPadding) * visualScale;
  const bottom = (bounds.bottom + touchPadding) * visualScale;
  return {
    x: cx + left,
    y: cy + top,
    width: right - left,
    height: bottom - top,
    centerX: cx + (left + right) / 2,
    centerY: cy + (top + bottom) / 2,
    radiusX: (right - left) / 2,
    radiusY: (bottom - top) / 2,
    shape: "ellipse"
  };
}
