// balance-impact: none — canvas art for the Three.js explore-view prototype (#2042).
//
// Everything here paints onto a plain 2D canvas and knows nothing about
// Three.js. Surfaces and wall decor come from the same painters the Pixi view
// uses, and props are drawn from the same shared geometry, so the prototype
// shows the game's own art rather than a second art set.
import { EVENT_TYPES } from "./data.js";
import { getChestPropGeometry, getChestPropPalette, getChestPropStyle } from "./chest_prop.js";
import {
  getDungeonPropPalette,
  getLeverPropGeometry,
  getRubblePropGeometry,
  getSealPropGeometry,
  getSpecialRoomPropGeometry,
  getSpringPropGeometry,
  getStairsPropGeometry
} from "./dungeon_prop.js";
import {
  FLOOR_PATTERNS,
  PIXEL_TEXTURE_SIZE,
  TRAP_DECAL_SIZE,
  WALL_DECOR,
  WALL_DECOR_HEIGHT,
  WALL_DECOR_WIDTH,
  WALL_PATTERNS,
  createRandom,
  hashString,
  mixHex,
  paintBricks,
  paintCeiling,
  paintSlabFloor,
  paintTrapDecal,
  paintWallDecor
} from "./pixel_art_painters.js";
import { TRAVERSAL_GIMMICKS, isTraversalObstacleBlocking } from "./rules/traversal_gimmicks.js";

function createCanvas(width, height = width) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function paintCanvas(width, height, paint) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  paint(ctx);
  return canvas;
}

/**
 * Wall, floor, ceiling, wall decor, and trap decal canvases for one biome.
 * Mirrors createPixelSurfaceTextures (pixi_pixel_art.js) call for call, so
 * both views show identical pixels.
 */
export function paintSurfaceCanvases(palette, surfaces = {}) {
  const seed = hashString(palette.accent);
  const surface = (painter, tones, surfaceSeed) => paintCanvas(PIXEL_TEXTURE_SIZE, PIXEL_TEXTURE_SIZE, (ctx) => {
    painter(ctx, PIXEL_TEXTURE_SIZE, tones, createRandom(surfaceSeed), palette);
  });
  return {
    wall: surface(WALL_PATTERNS[surfaces.wall] || paintBricks, palette.wall, seed),
    floor: surface(FLOOR_PATTERNS[surfaces.floor] || paintSlabFloor, palette.floor, seed ^ 0x9e3779b9),
    ceiling: surface(paintCeiling, palette.ceiling, seed ^ 0x85ebca6b),
    decor: (surfaces.decor || []).filter((id) => WALL_DECOR[id])
      .map((id) => paintCanvas(WALL_DECOR_WIDTH, WALL_DECOR_HEIGHT, (ctx) => paintWallDecor(ctx, id, palette))),
    trap: paintCanvas(TRAP_DECAL_SIZE, TRAP_DECAL_SIZE, (ctx) => paintTrapDecal(ctx, surfaces.trapStyle, palette))
  };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** Props are painted at the corridor's texel density: one cell is 64 pixels. */
export const PROP_CANVAS_SIZE = 64;
// The shared geometry is screen-space: it stands a prop on a "plane". This
// plane is one cell wide with the floor contact near the bottom edge.
const PROP_BASE_Y = PROP_CANVAS_SIZE - 4;
const PROP_PLANE = Object.freeze({
  leftBottom: 0,
  rightBottom: PROP_CANVAS_SIZE,
  bottom: PROP_BASE_Y,
  worldObject: Object.freeze({ objectWidth: PROP_CANVAS_SIZE, floorContactY: PROP_BASE_Y })
});
/** Where a prop touches the floor, as a fraction of the canvas height from the bottom. */
export const PROP_FLOOR_ANCHOR = (PROP_CANVAS_SIZE - PROP_BASE_Y) / PROP_CANVAS_SIZE;

const SPECIAL_ROOM_EMBLEM_COLORS = Object.freeze({
  mine_vein: "#58d6e8",
  altar: "#ffe08a",
  brood_chamber: "#c58cf5",
  reading_room: "#7fe0d8",
  forge: "#ff8a3d",
  mirror_hall: "#f0a8ff"
});

function css(color) {
  return typeof color === "number" ? `#${color.toString(16).padStart(6, "0")}` : color;
}

// The same four drawing calls the Pixi props are built from. Sprites are
// alpha-tested, so soft translucent fills (shadows, glows) are left out here;
// the view adds a floor shadow of its own.
function createPen(ctx) {
  const finish = (color, alpha, stroke) => {
    if (color !== null && alpha >= 0.5) {
      ctx.fillStyle = css(color);
      ctx.fill();
    }
    if (stroke && (stroke.alpha ?? 1) >= 0.4) {
      ctx.strokeStyle = css(stroke.color);
      ctx.lineWidth = stroke.width || 1;
      ctx.stroke();
    }
  };
  return {
    poly(points, color, alpha = 1, stroke = null) {
      ctx.beginPath();
      points.forEach(({ x, y }, index) => (index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.closePath();
      finish(color, alpha, stroke);
    },
    line(points, stroke) {
      ctx.beginPath();
      points.forEach(({ x, y }, index) => (index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      finish(null, 0, stroke);
    },
    rect(x, y, width, height, color, alpha = 1, stroke = null) {
      ctx.beginPath();
      ctx.rect(x, y, width, height);
      finish(color, alpha, stroke);
    },
    ellipse(x, y, radiusX, radiusY, color, alpha = 1, stroke = null) {
      ctx.beginPath();
      ctx.ellipse(x, y, Math.max(0.5, radiusX), Math.max(0.5, radiusY), 0, 0, Math.PI * 2);
      finish(color, alpha, stroke);
    }
  };
}

const PROP_PAINTERS = {
  rubble(pen, { wallColor }) {
    const g = getRubblePropGeometry(PROP_PLANE);
    const stroke = { color: mixHex(wallColor, "#120c06", 0.7), width: Math.max(1, g.width * 0.012) };
    pen.poly(g.mound, mixHex(wallColor, "#2a1f15", 0.66), 1, stroke);
    g.rocks.forEach((rock, index) => {
      pen.poly(rock, index % 2 === 0 ? mixHex(wallColor, "#3a2c1e", 0.58) : mixHex(wallColor, "#f3e7cf", 0.45), 1, stroke);
    });
  },
  seal(pen, { wallColor }) {
    const g = getSealPropGeometry(PROP_PLANE);
    const ink = { color: mixHex(wallColor, "#100c08", 0.72), width: Math.max(1, g.width * 0.014) };
    pen.poly(g.slab, mixHex(wallColor, "#4a4238", 0.6), 1, ink);
    pen.poly(g.frame, mixHex(wallColor, "#5a5246", 0.52), 1, ink);
    pen.line(g.seam, { ...ink, alpha: 0.8 });
    pen.ellipse(g.sigil.x, g.sigil.y, g.sigil.radiusX, g.sigil.radiusY, mixHex(wallColor, "#2a241e", 0.7), 1,
      { color: "#ffd27a", width: Math.max(1.2, g.width * 0.02) });
  },
  lever(pen, { wallColor, pulled }) {
    const g = getLeverPropGeometry(PROP_PLANE, pulled);
    const metal = pulled ? "#8f8a80" : "#ffd27a";
    const ink = { color: mixHex(wallColor, "#100c08", 0.72), width: Math.max(1, g.width * 0.02) };
    pen.ellipse(g.plate.x, g.plate.y, g.plate.radiusX, g.plate.radiusY, mixHex(wallColor, "#3a3026", 0.6), 1, ink);
    pen.poly(g.post, mixHex(wallColor, "#2a221b", 0.7), 1, ink);
    pen.line(g.handle, { color: metal, width: Math.max(2, g.width * 0.06), alpha: 1 });
    pen.ellipse(g.knob.x, g.knob.y, g.knob.radiusX, g.knob.radiusY, metal, 1, ink);
  },
  room(pen, { wallColor, roomKind, used }) {
    const g = getSpecialRoomPropGeometry(PROP_PLANE);
    const emblem = used ? "#6b6460" : (SPECIAL_ROOM_EMBLEM_COLORS[roomKind] || "#ffd27a");
    const ink = { color: mixHex(wallColor, "#100c08", 0.72), width: Math.max(1, g.width * 0.014) };
    pen.poly(g.plinth, mixHex(wallColor, "#4a4238", 0.55), 1, ink);
    pen.poly(g.cap, mixHex(wallColor, "#6a6054", 0.45), 1, ink);
    pen.ellipse(g.emblem.x, g.emblem.y, g.emblem.radiusX, g.emblem.radiusY, emblem, 1,
      { color: "#fff6e0", width: Math.max(1.2, g.width * 0.02) });
  },
  stairs(pen, { wallColor, direction, style }) {
    const g = getStairsPropGeometry(PROP_PLANE, direction, style);
    const palette = getDungeonPropPalette("stairs", wallColor, direction);
    const edge = { color: palette.edge, width: Math.max(1, g.width * 0.014) };
    pen.poly(g.well, palette.well, 1, edge);
    g.steps.forEach((step) => {
      pen.poly(step.points, palette.stone, 1, edge);
      pen.line([{ x: step.left, y: step.y }, { x: step.right, y: step.y }], { color: palette.edge, width: Math.max(1, g.width * 0.016) });
    });
  },
  chest(pen, { style }) {
    const g = getChestPropGeometry(PROP_PLANE, style);
    const palette = getChestPropPalette(style);
    const outline = { color: palette.outline, width: Math.max(1, g.width * 0.018) };
    pen.poly(g.body, palette.body, 1, outline);
    pen.poly(g.side, "#241a19", 1, outline);
    pen.poly(g.lid, palette.lid, 1, outline);
    pen.rect(g.band.x, g.band.y, g.band.width, g.band.height, palette.metal, 1, outline);
    g.feet.forEach((foot) => pen.rect(foot.x, foot.y, foot.width, foot.height, "#171116"));
    pen.rect(g.lock.x, g.lock.y, g.lock.width, g.lock.height, palette.metal, 1, outline);
    pen.ellipse(g.keyhole.x, g.keyhole.y, g.keyhole.radius, g.keyhole.radius, "#21151a");
  },
  spring(pen, { wallColor }) {
    const g = getSpringPropGeometry(PROP_PLANE);
    const palette = getDungeonPropPalette("spring", wallColor);
    const rim = (width) => ({ color: palette.highlight, width: Math.max(1, g.width * width) });
    pen.poly(g.pedestal, palette.pedestal, 1, { color: css(palette.basin), width: Math.max(1, g.width * 0.016) });
    pen.poly(g.fountain, palette.pedestal, 1, rim(0.016));
    pen.ellipse(g.fountainDrop.x, g.fountainDrop.y, g.fountainDrop.radiusX, g.fountainDrop.radiusY, palette.water, 0.92, rim(0.012));
    pen.ellipse(g.basin.x, g.basin.y, g.basin.radiusX, g.basin.radiusY, palette.basin, 1, rim(0.018));
    pen.ellipse(g.water.x, g.water.y, g.water.radiusX, g.water.radiusY, palette.water, 0.9, rim(0.012));
  }
};

// Things that lie flat on the floor are painted as seen from above.
const FLOOR_PAINTERS = {
  flood(ctx) {
    ctx.fillStyle = "#3d9be9";
    ctx.strokeStyle = "#bfe8ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(32, 32, 26, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  },
  heat(ctx, { wallColor, hot }) {
    ctx.fillStyle = mixHex(wallColor, "#2a1a10", 0.7);
    ctx.strokeStyle = hot ? "#ffb347" : "#6b5a4a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(8, 8, 48, 48);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = hot ? "#ff9a3c" : "#4a3d33";
    [14, 23, 32, 41].forEach((x) => ctx.fillRect(x, 12, 4, 40));
  },
  crumble(ctx, { wallColor, collapsed }) {
    if (collapsed) {
      ctx.fillStyle = "#05060a";
      ctx.beginPath();
      ctx.ellipse(32, 32, 27, 24, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.fillStyle = mixHex(wallColor, "#5b4a3a", 0.55);
    ctx.strokeStyle = mixHex(wallColor, "#100c08", 0.72);
    ctx.lineWidth = 2;
    ctx.fillRect(5, 5, 54, 54);
    ctx.strokeRect(5, 5, 54, 54);
    ctx.beginPath();
    [[[12, 50], [24, 34], [18, 14]], [[36, 54], [44, 30], [52, 16]], [[24, 34], [44, 30]]].forEach((crack) => {
      crack.forEach(([x, y], index) => (index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    });
    ctx.stroke();
  }
};

/**
 * What stands or lies in a cell, by the same precedence the Pixi view uses
 * (drawLandmark). Returns null for an empty cell.
 *
 * `layer` is "billboard" for an upright sprite, "floor" for a flat decal, and
 * "trap" for the biome's own trap decal texture. `mapped` marks things the
 * minimap also marks, which the top-down view may keep showing on cells that
 * are remembered but out of sight.
 */
export function describeCellProp(cell, visual = {}) {
  const wallColor = typeof visual.wallColor === "string" ? visual.wallColor : "#58d6e8";
  const landmarks = visual.landmarks || {};
  if (cell.obstacle?.kind === TRAVERSAL_GIMMICKS.CRUMBLE) {
    const collapsed = cell.obstacle.state === "collapsed";
    return { layer: "floor", painter: "crumble", key: `crumble:${collapsed}:${wallColor}`, options: { wallColor, collapsed }, mapped: true };
  }
  if (isTraversalObstacleBlocking(cell)) {
    const painter = cell.obstacle.kind === TRAVERSAL_GIMMICKS.RUBBLE ? "rubble" : "seal";
    return { layer: "billboard", painter, key: `${painter}:${wallColor}`, options: { wallColor }, mapped: true };
  }
  if (cell.hazard?.kind === TRAVERSAL_GIMMICKS.FLOOD) {
    return { layer: "floor", painter: "flood", key: "flood", options: {}, mapped: true };
  }
  if (cell.hazard?.kind === TRAVERSAL_GIMMICKS.HEAT) {
    const hot = Boolean(cell.hazard.hot);
    return { layer: "floor", painter: "heat", key: `heat:${hot}:${wallColor}`, options: { wallColor, hot }, mapped: true, glow: hot ? "#ff7a2f" : null };
  }
  if (cell.lever) {
    const pulled = cell.lever.state === "pulled";
    return { layer: "billboard", painter: "lever", key: `lever:${pulled}:${wallColor}`, options: { wallColor, pulled }, mapped: true };
  }
  if (cell.specialRoom && cell.event === EVENT_TYPES.SPECIAL_ROOM) {
    const { kind: roomKind, used } = cell.specialRoom;
    return {
      layer: "billboard", painter: "room", key: `room:${roomKind}:${Boolean(used)}:${wallColor}`,
      options: { wallColor, roomKind, used: Boolean(used) }, mapped: true,
      glow: used ? null : (SPECIAL_ROOM_EMBLEM_COLORS[roomKind] || "#ffd27a")
    };
  }
  if (cell.type === "stairs-up" || cell.type === "stairs-down") {
    const direction = cell.type === "stairs-up" ? "up" : "down";
    const style = landmarks.stairsStyle;
    return {
      layer: "billboard", painter: "stairs", key: `stairs:${direction}:${style}:${wallColor}`,
      options: { wallColor, direction, style }, mapped: true, glow: direction === "up" ? "#78dfff" : "#ffd27a"
    };
  }
  if (cell.event === EVENT_TYPES.CHEST) {
    const style = getChestPropStyle(landmarks.chestStyle);
    return { layer: "billboard", painter: "chest", key: `chest:${style}`, options: { style }, mapped: false, glow: getChestPropPalette(style).glow };
  }
  if (cell.event === EVENT_TYPES.SPRING) {
    return { layer: "billboard", painter: "spring", key: `spring:${wallColor}`, options: { wallColor }, mapped: false, glow: "#7cecff" };
  }
  if (cell.trap?.state === "discovered") return { layer: "trap", key: "trap", mapped: true };
  return null;
}

export function paintPropCanvas(prop) {
  return paintCanvas(PROP_CANVAS_SIZE, PROP_CANVAS_SIZE, (ctx) => {
    if (prop.layer === "floor") FLOOR_PAINTERS[prop.painter](ctx, prop.options);
    else PROP_PAINTERS[prop.painter](createPen(ctx), prop.options);
  });
}

// ---------------------------------------------------------------------------
// Prototype-only art: placeholder pieces and light sprites
// ---------------------------------------------------------------------------

function paintPixels(rows, colors, scale = 1) {
  const width = Math.max(...rows.map((row) => row.length));
  return paintCanvas(width * scale, rows.length * scale, (ctx) => {
    rows.forEach((row, y) => {
      [...row].forEach((char, x) => {
        if (!colors[char]) return;
        ctx.fillStyle = colors[char];
        ctx.fillRect(x * scale, y * scale, scale, scale);
      });
    });
  });
}

/** The player's placeholder piece for the top-down view, seen from behind. */
export function paintPawnCanvas(palette) {
  const cloak = mixHex(palette.accent, "#2e2640", 0.42);
  return paintPixels([
    "....oooo....",
    "...ohhhho...",
    "..ohhHHhho..",
    "..ohhhhhho..",
    "..ohhhhhho..",
    "...occcco...",
    "..occCCcco..",
    ".occCppCcco.",
    ".occpppppco.",
    ".occpppppco.",
    ".occCppCcco.",
    ".occcccccco.",
    "..occcccco..",
    "..occo.occo.",
    "..obbo.obbo.",
    "..oooo.oooo."
  ], {
    o: "#2e2640",
    h: mixHex(cloak, "#2e2640", 0.25),
    H: mixHex(cloak, "#ffffff", 0.25),
    c: cloak,
    C: mixHex(cloak, "#ffffff", 0.18),
    p: "#a9743f",
    b: "#5a3d2b"
  });
}

/** A roaming enemy's placeholder piece. */
export function paintRoamerCanvas(color) {
  return paintPixels([
    "...oooooo...",
    "..obbbbbbo..",
    ".obbbbbbbbo.",
    ".obeebbeebo.",
    ".obEebbEebo.",
    "obbbbbbbbbbo",
    "obbbmmmmbbbo",
    "obbbbbbbbbbo",
    ".obbobbobbo.",
    ".oo.oo.oo.o."
  ], { o: "#2e2640", b: color, e: "#fff4dc", E: "#2e2640", m: "#2e2640" });
}

/** Only the eyes of that piece, for showing it in the dark. */
export function paintRoamerEyesCanvas() {
  return paintPixels([
    "............",
    "............",
    "............",
    "...ee..ee...",
    "...e...e....",
    "............",
    "............",
    "............",
    "............",
    "............"
  ], { e: "#ffffff" });
}

/** Two frames of a wall torch: an iron bracket and a flame. */
export function paintTorchCanvases() {
  const colors = { i: "#3b3340", I: "#5a5060", r: "#ff8a2a", y: "#ffd25a", w: "#fff6d6" };
  const bracket = ["...ii...", "..iIIi..", "...ii...", "...ii...", "..iiii.."];
  const flames = [
    ["...r....", "..ry....", "..ryr...", ".ryyr...", ".rywyr..", ".rywwyr.", "..ywwy.."],
    ["....r...", "...yr...", "..ryr...", "..ryyr..", ".rywyr..", ".rywwyr.", "..ywwy.."]
  ];
  return flames.map((flame) => paintPixels([...flame, ...bracket], colors));
}

/** Soft round falloff, used for light halos (white) and floor shadows (black). */
export function paintGlowCanvas(color = "255, 255, 255", size = 64) {
  return paintCanvas(size, size, (ctx) => {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, `rgba(${color}, 1)`);
    gradient.addColorStop(0.35, `rgba(${color}, 0.45)`);
    gradient.addColorStop(1, `rgba(${color}, 0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  });
}

/** One-way opening seen from the side that cannot pass: three chevrons. */
export function paintBarrierCanvas(accent) {
  return paintCanvas(32, 32, (ctx) => {
    ctx.fillStyle = "rgba(46, 38, 64, 0.28)";
    ctx.fillRect(0, 0, 32, 32);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    [9, 16, 23].forEach((y) => {
      ctx.beginPath();
      ctx.moveTo(10, y - 3);
      ctx.lineTo(16, y + 2);
      ctx.lineTo(22, y - 3);
      ctx.stroke();
    });
  });
}
