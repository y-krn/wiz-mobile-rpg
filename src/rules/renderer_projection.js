// balance-impact: none — renderer projection only; gameplay rules and state mutation are unchanged.
// Shared screen-space projection contract for Canvas and Pixi.
// Gameplay topology remains canonical; only the presentation profile changes
// with the measured viewport aspect ratio.

export const CANONICAL_VIEW = Object.freeze({ width: 400, height: 260 });
export const PORTRAIT_NEAR_COVERAGE_MIN = 0.55;

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
  Object.freeze({ span: 0.96, weights: Object.freeze([0.15, 0.70, 0.15]) }),
  Object.freeze({ span: 0.72, weights: Object.freeze([0.17, 0.66, 0.17]) }),
  Object.freeze({ span: 0.48, weights: Object.freeze([0.12, 0.16, 0.44, 0.16, 0.12]) }),
  Object.freeze({ span: 0.30, weights: Object.freeze([0.12, 0.18, 0.40, 0.18, 0.12]) }),
  Object.freeze({ span: 0.18, weights: Object.freeze([0.12, 0.18, 0.40, 0.18, 0.12]) })
]);

const GEOMETRY_STYLES = new Set(["flat", "arch"]);

function finitePositive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function finiteOr(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function freezeArray(values) {
  return Object.freeze(values.map(value => Number(value)));
}

/**
 * C strategy: preserve the canonical horizontal topology and choose vertical
 * depth framing from the viewport aspect. Portrait planes occupy the stage;
 * they are generated geometry, never a stretched 400x260 bitmap.
 */
export function getProjectionProfile(width = CANONICAL_VIEW.width, height = CANONICAL_VIEW.height) {
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
    base: Object.freeze({
      xl: freezeArray(portrait ? portraitXl : BASE_PROJECTION.xl.map(value => value * xScale)),
      xr: freezeArray(portrait ? portraitXr : BASE_PROJECTION.xr.map(value => value * xScale)),
      yt: freezeArray(yt),
      yb: freezeArray(yb)
    }),
    columnLayout: portrait ? PORTRAIT_COLUMN_LAYOUT : null
  });
}

function normalizeProfile(profile) {
  if (profile?.base?.xl && Number.isFinite(profile.width) && Number.isFinite(profile.height)) return profile;
  return getProjectionProfile(profile?.width, profile?.height);
}

export function getProjectionPlanes(geometry = BASE_GEOMETRY, profile = getProjectionProfile()) {
  const viewport = normalizeProfile(profile);
  const corridorWidth = finiteOr(geometry?.corridorWidth, BASE_GEOMETRY.corridorWidth);
  const ceilingHeight = finiteOr(geometry?.ceilingHeight, BASE_GEOMETRY.ceilingHeight);
  const wallLean = finiteOr(geometry?.wallLean, BASE_GEOMETRY.wallLean);
  const ceilingStyle = GEOMETRY_STYLES.has(geometry?.ceilingStyle)
    ? geometry.ceilingStyle
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
    const baseWidth = viewport.base.xr[z] - viewport.base.xl[z];
    const width = baseWidth * corridorWidth;
    const center = (viewport.base.xr[z] + viewport.base.xl[z]) / 2;
    const projectedLeft = center - width / 2;
    const projectedRight = center + width / 2;
    const horizon = (viewport.base.yb[z] + viewport.base.yt[z]) / 2;
    const projectedTop = horizon - (horizon - viewport.base.yt[z]) * ceilingHeight;
    const projectedBottom = horizon + (viewport.base.yb[z] - horizon) * ceilingHeight;
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
      ? viewport.columnLayout.map(({ span, weights }) => Object.freeze({ span: span * corridorWidth, weights }))
      : null
  });
}

export function getProjectionColumn(projection, z, column = 0) {
  const layout = projection.columnLayout?.[z];
  if (layout) {
    const index = column + Math.floor(layout.weights.length / 2);
    if (index >= 0 && index < layout.weights.length) {
      const centerTop = (projection.leftTop[z] + projection.rightTop[z]) / 2;
      const centerBottom = (projection.leftBottom[z] + projection.rightBottom[z]) / 2;
      const centerIndex = Math.floor(layout.weights.length / 2);
      const totalTop = (projection.rightTop[z] - projection.leftTop[z]) / layout.weights[centerIndex];
      const totalBottom = (projection.rightBottom[z] - projection.leftBottom[z]) / layout.weights[centerIndex];
      const topStart = layout.weights.slice(0, index).reduce((sum, value) => sum + value, 0);
      const topEnd = topStart + layout.weights[index];
      return {
        leftTop: centerTop - totalTop / 2 + totalTop * topStart,
        leftBottom: centerBottom - totalBottom / 2 + totalBottom * topStart,
        rightTop: centerTop - totalTop / 2 + totalTop * topEnd,
        rightBottom: centerBottom - totalBottom / 2 + totalBottom * topEnd,
        top: projection.yt[z],
        bottom: projection.yb[z]
      };
    }
  }
  const topWidth = projection.rightTop[z] - projection.leftTop[z];
  const bottomWidth = projection.rightBottom[z] - projection.leftBottom[z];
  return {
    leftTop: projection.leftTop[z] + topWidth * column,
    leftBottom: projection.leftBottom[z] + bottomWidth * column,
    rightTop: projection.leftTop[z] + topWidth * (column + 1),
    rightBottom: projection.leftBottom[z] + bottomWidth * (column + 1),
    top: projection.yt[z],
    bottom: projection.yb[z]
  };
}

export function getCombatMonsterLayout(monsters, profile = getProjectionProfile()) {
  if (!Array.isArray(monsters)) return [];
  const viewport = normalizeProfile(profile);
  const alive = monsters
    .map((monster, index) => ({ monster, index }))
    .filter(({ monster }) => monster && typeof monster === "object" && monster.hp > 0);
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

const MONSTER_VISUAL_BOUNDS = Object.freeze({
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

function getMonsterSpriteType(monster) {
  if (monster?.spriteType) return monster.spriteType;
  const name = monster?.name || "";
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

function getMonsterScaleMultiplier(monster) {
  const name = monster?.name || "";
  if (name.includes("ジャイアント") || name.includes("巨躯")) return 1.18;
  if (name.includes("ゴーレム") || name.includes("アーマー") || name.includes("ストーン") || name.includes("石像")) return 1.08;
  return 1;
}

function getCombatMonsterHitRegion(monster, cx, cy, scale) {
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
