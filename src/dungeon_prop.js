// balance-impact: none — dungeon world-object geometry only; event, movement,
// save, and effect semantics remain unchanged.
// Renderer-neutral screen-space geometry for non-chest dungeon landmarks.

const DEFAULT_STAIR_STYLE = "rough_stone";

export const STAIR_PROP_STYLES = Object.freeze({
  rough_stone: Object.freeze({ stepCount: 4, slope: 0.92 }),
  catacomb_arch: Object.freeze({ stepCount: 5, slope: 0.82 }),
  broken_ledge: Object.freeze({ stepCount: 3, slope: 1.08 }),
  flooded_steps: Object.freeze({ stepCount: 5, slope: 0.76 }),
  forge_stair: Object.freeze({ stepCount: 4, slope: 1.12 }),
  impossible_stair: Object.freeze({ stepCount: 6, slope: 0.68 })
});

function freezePoints(points) {
  return Object.freeze(points.map(({ x, y }) => Object.freeze({ x, y })));
}

function safeStairStyle(style) {
  return Object.hasOwn(STAIR_PROP_STYLES, style) ? style : DEFAULT_STAIR_STYLE;
}

function getPlaneBase(plane, widthRatio) {
  const left = Number(plane?.leftBottom) || 0;
  const right = Number(plane?.rightBottom) || left;
  const bottom = Number(plane?.bottom) || 0;
  const corridorWidth = Math.max(1, right - left);
  const width = Math.max(8, corridorWidth * widthRatio);
  return {
    corridorWidth,
    width,
    centerX: (left + right) / 2,
    baseY: bottom - Math.max(1, width * 0.018)
  };
}

export function getSpringPropGeometry(plane) {
  const { width, centerX, baseY } = getPlaneBase(plane, 0.42);
  const basinY = baseY - width * 0.13;
  const pedestalTop = basinY + width * 0.01;
  const pedestalBottom = baseY - width * 0.02;
  const shadow = Object.freeze({ x: centerX, y: baseY + width * 0.045, radiusX: width * 0.48, radiusY: Math.max(1.5, width * 0.085) });
  return Object.freeze({
    centerX,
    baseY,
    width,
    basin: Object.freeze({ x: centerX, y: basinY, radiusX: width * 0.45, radiusY: Math.max(2, width * 0.115) }),
    water: Object.freeze({ x: centerX, y: basinY - width * 0.012, radiusX: width * 0.31, radiusY: Math.max(1.5, width * 0.064) }),
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

export function getMonumentPropGeometry(plane) {
  const { width, centerX, baseY } = getPlaneBase(plane, 0.36);
  const height = Math.max(12, width * 0.84);
  const bodyBottom = baseY - width * 0.09;
  const bodyTop = bodyBottom - height;
  const bodyHalf = width * 0.24;
  const shoulder = width * 0.08;
  const sideDepth = width * 0.06;
  const face = freezePoints([
    { x: centerX - bodyHalf + shoulder, y: bodyTop },
    { x: centerX + bodyHalf - shoulder, y: bodyTop },
    { x: centerX + bodyHalf, y: bodyTop + shoulder },
    { x: centerX + bodyHalf * 0.92, y: bodyBottom },
    { x: centerX - bodyHalf * 0.92, y: bodyBottom },
    { x: centerX - bodyHalf, y: bodyTop + shoulder }
  ]);
  const side = freezePoints([
    { x: centerX + bodyHalf - shoulder, y: bodyTop },
    { x: centerX + bodyHalf + sideDepth, y: bodyTop + shoulder },
    { x: centerX + bodyHalf * 0.98 + sideDepth, y: bodyBottom - width * 0.02 },
    { x: centerX + bodyHalf * 0.92, y: bodyBottom }
  ]);
  const plinth = freezePoints([
    { x: centerX - width * 0.31, y: bodyBottom },
    { x: centerX + width * 0.31, y: bodyBottom },
    { x: centerX + width * 0.36, y: baseY },
    { x: centerX - width * 0.36, y: baseY }
  ]);
  const inscriptionLeft = centerX - bodyHalf * 0.54;
  const inscriptionRight = centerX + bodyHalf * 0.54;
  const inscriptionTop = bodyTop + height * 0.31;
  const inscriptionLines = Object.freeze([0, 1, 2].map(index => Object.freeze({
    left: inscriptionLeft + (index % 2) * width * 0.02,
    right: inscriptionRight - (index % 2) * width * 0.02,
    y: inscriptionTop + index * height * 0.14
  })));
  return Object.freeze({
    centerX,
    baseY,
    width,
    height,
    face,
    side,
    plinth,
    inscriptionLines,
    shadow: Object.freeze({ x: centerX, y: baseY + width * 0.045, radiusX: width * 0.43, radiusY: Math.max(1.5, width * 0.085) })
  });
}

export function getStairsPropGeometry(plane, direction = "down", style = DEFAULT_STAIR_STYLE) {
  const { width, centerX, baseY } = getPlaneBase(plane, 0.62);
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

function parseColor(value, fallback = 0xffffff) {
  if (typeof value !== "string") return fallback;
  const match = value.trim().match(/^#([0-9a-f]{6})$/i);
  return match ? Number.parseInt(match[1], 16) : fallback;
}

function mixColor(first, second, amount) {
  const t = Math.max(0, Math.min(1, amount));
  const a = parseColor(first);
  const b = parseColor(second);
  const channel = shift => Math.round(((a >> shift) & 0xff) * (1 - t) + ((b >> shift) & 0xff) * t);
  return (channel(16) << 16 | channel(8) << 8 | channel(0));
}

export function getDungeonPropPalette(kind, wallColor = "#58d6e8", direction = "down") {
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
  if (kind === "monument") {
    return Object.freeze({
      stone: mixColor(base, "#26242c", 0.58),
      side: mixColor(base, "#090d13", 0.78),
      plinth: mixColor(base, "#151a20", 0.64),
      inscription: "#e8f7f4",
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
