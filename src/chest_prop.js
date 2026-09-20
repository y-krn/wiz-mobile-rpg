// balance-impact: none — dungeon chest presentation only; gameplay state and
// loot/trap semantics remain unchanged.
// Shared screen-space geometry for the dungeon chest prop.
// Geometry stays renderer-neutral; Pixi owns the production presentation.

export const CHEST_PROP_STYLES = Object.freeze({
  wood_crate: Object.freeze({ body: "#6b3a00", lid: "#9a5d16", metal: "#f1c45b", outline: "#ffe29a", glow: "#ffd166", mark: "bands" }),
  stone_ossuary: Object.freeze({ body: "#5f5a58", lid: "#8c8580", metal: "#d8c9a5", outline: "#eee3c5", glow: "#d5c7a0", mark: "cross" }),
  bone_cache: Object.freeze({ body: "#4d3e55", lid: "#725b78", metal: "#e7c4a1", outline: "#f4d7ba", glow: "#dca8c0", mark: "cross" }),
  sealed_book_coffer: Object.freeze({ body: "#174c56", lid: "#27727a", metal: "#f0c96a", outline: "#b9f0df", glow: "#54d6c5", mark: "runes" }),
  iron_strongbox: Object.freeze({ body: "#514747", lid: "#71605b", metal: "#e4b75f", outline: "#f4d79b", glow: "#d8aa5d", mark: "rivets" }),
  abyss_reliquary: Object.freeze({ body: "#30233e", lid: "#583d69", metal: "#d7a8ff", outline: "#e6c8ff", glow: "#b979ff", mark: "runes" })
});

const DEFAULT_STYLE = "wood_crate";

export function getChestPropStyle(style) {
  return Object.hasOwn(CHEST_PROP_STYLES, style) ? style : DEFAULT_STYLE;
}

export function getChestPropPalette(style) {
  return CHEST_PROP_STYLES[getChestPropStyle(style)];
}

function freezePoints(points) {
  return Object.freeze(points.map(({ x, y }) => Object.freeze({ x, y })));
}

function makeLidPoints(x, y, width, height, style) {
  const variant = getChestPropStyle(style);
  const pointsByStyle = {
    wood_crate: [[0, 0.08], [0.12, 0.74], [0.22, 1], [0.78, 1], [0.88, 0.74], [1, 0.08]],
    stone_ossuary: [[0, 0.04], [0.08, 0.80], [0.18, 1], [0.82, 1], [0.92, 0.80], [1, 0.04]],
    bone_cache: [[0, 0.10], [0.18, 0.58], [0.50, 1], [0.82, 0.58], [1, 0.10]],
    sealed_book_coffer: [[0, 0.06], [0.18, 0.74], [0.84, 0.92], [1, 0.06]],
    iron_strongbox: [[0, 0.04], [0.08, 0.76], [0.16, 1], [0.84, 1], [0.92, 0.76], [1, 0.04]],
    abyss_reliquary: [[0, 0.08], [0.24, 0.68], [0.42, 1], [0.72, 0.82], [1, 0.10]]
  }[variant] || pointsByStyle[DEFAULT_STYLE];
  return freezePoints(pointsByStyle.map(([xRatio, heightRatio]) => ({
    x: x + width * xRatio,
    y: y - height * heightRatio
  })));
}

export function getChestPropGeometry(plane, style = DEFAULT_STYLE) {
  const left = Number(plane?.leftBottom) || 0;
  const right = Number(plane?.rightBottom) || left;
  const bottom = Number(plane?.bottom) || 0;
  const corridorWidth = Math.max(1, right - left);
  const width = corridorWidth * 0.30;
  const bodyHeight = Math.max(4, width * 0.43);
  const lidHeight = Math.max(3, width * 0.25);
  const centerX = (left + right) / 2;
  const baseY = bottom - Math.max(1, width * 0.018);
  const bodyX = centerX - width / 2;
  const bodyY = baseY - bodyHeight;
  const safeStyle = getChestPropStyle(style);
  const body = freezePoints([
    { x: bodyX + width * 0.04, y: bodyY },
    { x: bodyX + width * 0.90, y: bodyY },
    { x: bodyX + width * 0.97, y: baseY },
    { x: bodyX + width * 0.04, y: baseY }
  ]);
  const side = freezePoints([
    { x: bodyX + width * 0.90, y: bodyY },
    { x: bodyX + width, y: bodyY + width * 0.05 },
    { x: bodyX + width, y: baseY - width * 0.04 },
    { x: bodyX + width * 0.97, y: baseY }
  ]);
  const lid = makeLidPoints(bodyX, bodyY, width, lidHeight, safeStyle);
  const band = Object.freeze({ x: bodyX + width * 0.445, y: bodyY - lidHeight * 0.05, width: width * 0.11, height: baseY - bodyY + lidHeight * 0.05 });
  const lock = Object.freeze({ x: centerX - width * 0.09, y: bodyY + bodyHeight * 0.10, width: width * 0.18, height: Math.max(2, bodyHeight * 0.19) });
  const keyhole = Object.freeze({ x: centerX, y: lock.y + lock.height * 0.57, radius: Math.max(1, width * 0.025) });
  const shadow = Object.freeze({ x: centerX, y: baseY + width * 0.045, radiusX: width * 0.48, radiusY: Math.max(1.5, width * 0.085) });
  const feet = Object.freeze([
    Object.freeze({ x: bodyX + width * 0.13, y: baseY - width * 0.015, width: width * 0.14, height: Math.max(1, width * 0.045) }),
    Object.freeze({ x: bodyX + width * 0.74, y: baseY - width * 0.015, width: width * 0.14, height: Math.max(1, width * 0.045) })
  ]);
  const marks = Object.freeze({
    left: bodyX + width * 0.14,
    right: bodyX + width * 0.84,
    top: bodyY + bodyHeight * 0.12,
    bottom: baseY - bodyHeight * 0.08,
    centerX
  });
  return Object.freeze({
    style: safeStyle,
    centerX,
    baseY,
    bodyY,
    width,
    bodyHeight,
    lidHeight,
    body,
    side,
    lid,
    band,
    lock,
    keyhole,
    shadow,
    feet,
    marks
  });
}
