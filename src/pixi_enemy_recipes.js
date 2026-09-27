// balance-impact: none — procedural enemy presentation geometry only.
//
// Production enemy recipes. The style target is a deformed (chibi) monster:
// an oversized head or body mass, big glowing eyes, and one or two
// unmistakable monster cues (fangs, horns, ears, claws, tails, extra legs).
// Every recipe stays a small set of flat Pixi shapes drawn around the feet
// origin (x = 0, y = 0, up is negative) so the shared silhouette outline in
// `pixi_enemy_prototypes.js` can reuse each part's geometry context.
import { Graphics } from "pixi.js";
import { ENEMY_RECIPE_PALETTES } from "./enemy_presentation_palette.js";

const DEFAULT_PALETTE = ENEMY_RECIPE_PALETTES["flash-bat"];
const IVORY = 0xf1e9d2;
const GLINT = 0xffffff;

// A tiny drawing pen. Recipes use unscaled design coordinates; the pen
// applies the renderer's visual scale so geometry and stroke widths stay
// proportional across mobile layouts.
function createPen(container, scale, palette) {
  const add = (graphic) => {
    container.addChild(graphic);
    return graphic;
  };
  const scaled = (points) => points.map(value => value * scale);
  const strokeWidth = (width) => Math.max(1, width * scale);

  function traceSmooth(graphic, points, closed) {
    const p = scaled(points);
    const count = p.length / 2;
    const at = (index) => [p[(index % count) * 2], p[(index % count) * 2 + 1]];
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (closed) {
      const start = mid(at(count - 1), at(0));
      graphic.moveTo(start[0], start[1]);
      for (let index = 0; index < count; index += 1) {
        const control = at(index);
        const end = mid(control, at(index + 1));
        graphic.quadraticCurveTo(control[0], control[1], end[0], end[1]);
      }
      graphic.closePath();
      return graphic;
    }
    graphic.moveTo(p[0], p[1]);
    for (let index = 1; index < count - 1; index += 1) {
      const control = at(index);
      const end = index === count - 2 ? at(count - 1) : mid(control, at(index + 1));
      graphic.quadraticCurveTo(control[0], control[1], end[0], end[1]);
    }
    if (count === 2) graphic.lineTo(p[2], p[3]);
    return graphic;
  }

  return {
    palette,
    ellipse(x, y, radiusX, radiusY, color, alpha = 1) {
      const graphic = new Graphics();
      graphic.ellipse(x * scale, y * scale, radiusX * scale, radiusY * scale).fill({ color, alpha });
      return add(graphic);
    },
    circle(x, y, radius, color, alpha = 1) {
      return this.ellipse(x, y, radius, radius, color, alpha);
    },
    poly(points, color, alpha = 1) {
      const graphic = new Graphics();
      graphic.poly(scaled(points)).fill({ color, alpha });
      return add(graphic);
    },
    blob(points, color, alpha = 1) {
      const graphic = traceSmooth(new Graphics(), points, true);
      graphic.fill({ color, alpha });
      return add(graphic);
    },
    line(points, color, width, alpha = 1) {
      const graphic = new Graphics();
      const p = scaled(points);
      graphic.moveTo(p[0], p[1]);
      for (let index = 2; index < p.length; index += 2) graphic.lineTo(p[index], p[index + 1]);
      graphic.stroke({ color, width: strokeWidth(width), alpha, cap: "round", join: "round" });
      return add(graphic);
    },
    curve(points, color, width, alpha = 1) {
      const graphic = traceSmooth(new Graphics(), points, false);
      graphic.stroke({ color, width: strokeWidth(width), alpha, cap: "round", join: "round" });
      return add(graphic);
    }
  };
}

// ---------------------------------------------------------------------------
// Shared facial and anatomical cues
// ---------------------------------------------------------------------------

// A glowing eye with a highlight. `mood` > 0 slants a brow down toward the
// face center (angry); `side` is -1 for the viewer's left eye, +1 for right.
function eye(pen, x, y, radius, { color = pen.palette.accent, side = 0, mood = 1, brow = pen.palette.main, glow = true } = {}) {
  if (glow) pen.ellipse(x, y, radius * 1.7, radius * 1.5, color, 0.22);
  pen.ellipse(x, y, radius, radius * 1.08, color, 1);
  pen.circle(x - radius * 0.32, y - radius * 0.36, Math.max(0.8, radius * 0.34), GLINT, 0.9);
  if (mood > 0 && side !== 0) {
    const inner = -side;
    pen.poly([
      x - radius * 1.5, y - radius * 1.6,
      x + radius * 1.5, y - radius * 1.6,
      x + inner * radius * 1.5, y - radius * (0.05 + 0.25 * (1 - mood)),
      x - inner * radius * 1.5, y - radius * 1.05
    ], brow, 1);
  }
}

function eyePair(pen, x, y, gap, radius, options = {}) {
  eye(pen, x - gap, y, radius, { ...options, side: -1 });
  eye(pen, x + gap, y, radius, { ...options, side: 1 });
}

// Downward-pointing teeth along a mouth line.
function fangs(pen, x, y, width, count, height, color = IVORY) {
  const step = width / count;
  for (let index = 0; index < count; index += 1) {
    const left = x - width / 2 + index * step;
    const h = (index === 0 || index === count - 1) ? height : height * 0.7;
    pen.poly([left, y, left + step, y, left + step / 2, y + h], color, 1);
  }
}

function upFangs(pen, x, y, width, count, height, color = IVORY) {
  const step = width / count;
  for (let index = 0; index < count; index += 1) {
    const left = x - width / 2 + index * step;
    pen.poly([left, y, left + step, y, left + step / 2, y - height], color, 1);
  }
}

function horn(pen, baseX, baseY, tipX, tipY, width, color) {
  pen.blob([
    baseX - width, baseY,
    (baseX + tipX) / 2 - width * 0.4, (baseY + tipY) / 2 + width * 0.2,
    tipX, tipY,
    (baseX + tipX) / 2 + width * 0.6, (baseY + tipY) / 2 + width * 0.4,
    baseX + width, baseY
  ], color, 1);
}

function batWing(pen, side, rootX, rootY, span, height, palette) {
  const s = side;
  pen.poly([
    s * rootX, rootY - 6,
    s * (rootX + span * 0.45), rootY - height,
    s * (rootX + span), rootY - height * 0.8,
    s * (rootX + span * 0.86), rootY - height * 0.2,
    s * (rootX + span * 0.66), rootY - height * 0.38,
    s * (rootX + span * 0.52), rootY + height * 0.1,
    s * (rootX + span * 0.34), rootY - height * 0.12,
    s * (rootX + span * 0.18), rootY + height * 0.28,
    s * rootX, rootY + 8
  ], palette.main, 1);
  pen.line([s * rootX, rootY - 4, s * (rootX + span * 0.45), rootY - height + 3, s * (rootX + span * 0.95), rootY - height * 0.78], palette.secondary, 2.2, 0.9);
  pen.line([s * (rootX + span * 0.45), rootY - height + 3, s * (rootX + span * 0.62), rootY - height * 0.36], palette.secondary, 1.6, 0.8);
  pen.line([s * (rootX + span * 0.45), rootY - height + 3, s * (rootX + span * 0.33), rootY - height * 0.1], palette.secondary, 1.6, 0.8);
}

// ---------------------------------------------------------------------------
// Named recipes
// ---------------------------------------------------------------------------

function drawBat(pen, palette, cy = -56) {
  batWing(pen, -1, 12, cy + 4, 58, 34, palette);
  batWing(pen, 1, 12, cy + 4, 58, 34, palette);
  // Ears
  pen.poly([-15, cy - 8, -19, cy - 30, -4, cy - 14], palette.main, 1);
  pen.poly([15, cy - 8, 19, cy - 30, 4, cy - 14], palette.main, 1);
  pen.poly([-14, cy - 11, -16, cy - 24, -8, cy - 14], palette.secondary, 0.9);
  pen.poly([14, cy - 11, 16, cy - 24, 8, cy - 14], palette.secondary, 0.9);
  // Round body-head
  pen.circle(0, cy, 19, palette.main, 1);
  pen.ellipse(0, cy + 7, 11, 9, palette.secondary, 0.85);
  eyePair(pen, 0, cy - 4, 7.5, 4.4, { brow: palette.main });
  // Grin with fangs
  pen.ellipse(0, cy + 7, 7, 3, palette.dark, 1);
  fangs(pen, 0, cy + 5, 12, 2, 6);
  // Little feet
  pen.line([-6, cy + 18, -8, cy + 25], palette.main, 3);
  pen.line([6, cy + 18, 8, cy + 25], palette.main, 3);
}

function createFlashBat(container, scale, palette = DEFAULT_PALETTE) {
  const pen = createPen(container, scale, palette);
  drawBat(pen, palette);
}

function createPowderBat(container, scale, palette = DEFAULT_PALETTE) {
  const pen = createPen(container, scale, palette);
  drawBat(pen, palette, -62);
  // Powder keg clutched in the feet.
  pen.ellipse(0, -22, 13, 15, palette.material, 1);
  pen.line([-12, -28, 12, -28], palette.dark, 2, 0.8);
  pen.line([-12, -16, 12, -16], palette.dark, 2, 0.8);
  pen.ellipse(0, -36, 9, 3, palette.secondary, 1);
  pen.curve([2, -37, 8, -44, 14, -42], palette.dark, 1.8);
  pen.circle(15, -43, 5, palette.accent, 0.35);
  pen.circle(15, -43, 2.6, 0xffd27a, 1);
  pen.circle(15, -43, 1.2, GLINT, 1);
}

function createBiter(container, scale, palette = DEFAULT_PALETTE) {
  const pen = createPen(container, scale, palette);
  // Segmented grub body curling behind the head.
  pen.circle(44, -16, 12, palette.main, 1);
  pen.circle(30, -22, 15, palette.main, 1);
  pen.line([30, -36, 30, -8], palette.secondary, 2, 0.7);
  pen.line([44, -27, 44, -6], palette.secondary, 2, 0.7);
  // Little legs
  [[24, -8], [34, -8], [44, -5]].forEach(([x, y]) => pen.line([x, y, x - 3, y + 8], palette.dark, 2.4));
  // Big head with gaping jaw.
  pen.blob([-40, -30, -30, -60, 0, -68, 22, -52, 22, -18, 0, -4, -30, -6], palette.main, 1);
  pen.blob([-28, -52, -8, -62, 12, -54, -6, -46], palette.secondary, 0.8);
  // Mouth
  pen.blob([-40, -24, -16, -36, 6, -26, -8, -10, -34, -10], palette.dark, 1);
  fangs(pen, -17, -32, 34, 5, 7);
  upFangs(pen, -20, -11, 26, 4, 6);
  // Mandibles
  pen.blob([-40, -26, -58, -38, -54, -22, -44, -16], palette.material, 1);
  pen.blob([-38, -12, -56, -4, -48, -18], palette.material, 1);
  // Cluster eyes
  eye(pen, -12, -50, 4.8, { side: -1, brow: palette.main });
  eye(pen, 4, -52, 4.2, { side: 1, brow: palette.main });
  eye(pen, -24, -46, 2.4, { glow: false, mood: 0 });
}

function slimeBody(pen, palette, x, y, width, height, lean = 0) {
  const w = width;
  const h = height;
  pen.blob([
    x - w, y,
    x - w * 1.05, y - h * 0.45,
    x - w * 0.55, y - h * 0.9,
    x + lean, y - h * 1.08,
    x + w * 0.55, y - h * 0.9,
    x + w * 1.05, y - h * 0.45,
    x + w, y
  ], palette.main, 1);
  pen.blob([x - w * 0.62, y - h * 0.58, x - w * 0.35, y - h * 0.86, x - w * 0.05, y - h * 0.78, x - w * 0.4, y - h * 0.48], palette.secondary, 0.75);
  pen.ellipse(x - w * 0.42, y - h * 0.72, w * 0.08, h * 0.08, GLINT, 0.6);
}

function createMudSlime(container, scale, palette = DEFAULT_PALETTE) {
  const pen = createPen(container, scale, palette);
  // Puddle base with drips.
  pen.ellipse(0, -3, 56, 8, palette.material, 1);
  pen.ellipse(-50, -2, 9, 5, palette.material, 1);
  pen.ellipse(52, -3, 7, 4, palette.material, 1);
  slimeBody(pen, palette, 0, -4, 46, 78, 6);
  eyePair(pen, 0, -46, 15, 7.5, { brow: palette.main });
  // Wide toothy grin
  pen.blob([-24, -28, 0, -32, 24, -28, 12, -14, -12, -14], palette.dark, 1);
  fangs(pen, 0, -30, 40, 6, 7);
  pen.line([-36, -10, -38, 2], palette.material, 4, 0.9);
  pen.line([30, -12, 32, 0], palette.material, 4, 0.9);
}

function createSplitSlime(container, scale, palette = DEFAULT_PALETTE) {
  const pen = createPen(container, scale, palette);
  pen.ellipse(0, -3, 62, 7, palette.material, 0.9);
  // Small offspring in back, big parent in front.
  slimeBody(pen, palette, 36, -3, 24, 42, 4);
  eyePair(pen, 36, -24, 8, 4.4, { brow: palette.main });
  pen.ellipse(36, -12, 6, 3, palette.dark, 1);
  slimeBody(pen, palette, -14, -3, 38, 70, -4);
  eyePair(pen, -14, -40, 12, 6.5, { brow: palette.main });
  pen.blob([-30, -22, -14, -26, 2, -22, -6, -12, -22, -12], palette.dark, 1);
  fangs(pen, -14, -24, 28, 4, 6);
  // The splitting bridge between them.
  pen.blob([16, -8, 20, -20, 26, -10, 20, -2], palette.main, 1);
}

function drawRat(pen, palette, x, y, size, flip = 1) {
  const s = size;
  const f = flip;
  pen.curve([x - f * 20 * s, y - 6 * s, x - f * 34 * s, y - 2 * s, x - f * 42 * s, y - 14 * s], palette.secondary, 2.6 * s);
  pen.blob([x - f * 24 * s, y - 2 * s, x - f * 20 * s, y - 20 * s, x, y - 26 * s, x + f * 16 * s, y - 16 * s, x + f * 14 * s, y - 2 * s], palette.main, 1);
  // Head with pointed snout
  pen.blob([x + f * 6 * s, y - 16 * s, x + f * 14 * s, y - 30 * s, x + f * 28 * s, y - 22 * s, x + f * 34 * s, y - 12 * s, x + f * 16 * s, y - 6 * s], palette.main, 1);
  pen.circle(x + f * 12 * s, y - 32 * s, 7 * s, palette.main, 1);
  pen.circle(x + f * 12 * s, y - 32 * s, 4 * s, palette.secondary, 0.9);
  pen.circle(x + f * 34 * s, y - 13 * s, 2.2 * s, palette.dark, 1);
  eye(pen, x + f * 21 * s, y - 20 * s, 3.4 * s, { side: f, brow: palette.main, color: 0xe06a55 });
  fangs(pen, x + f * 28 * s, y - 9 * s, 5 * s, 1, 5 * s);
  pen.line([x - f * 12 * s, y - 2 * s, x - f * 13 * s, y + 1 * s], palette.dark, 2.4 * s);
  pen.line([x + f * 8 * s, y - 3 * s, x + f * 9 * s, y + 1 * s], palette.dark, 2.4 * s);
}

function createRatPack(container, scale, palette = DEFAULT_PALETTE) {
  const pen = createPen(container, scale, palette);
  drawRat(pen, palette, -34, -18, 0.78, 1);
  drawRat(pen, palette, 36, -16, 0.72, -1);
  drawRat(pen, palette, -2, -1, 1.02, 1);
}

function createSleepSpore(container, scale, palette = DEFAULT_PALETTE) {
  const pen = createPen(container, scale, palette);
  // Stalk body with stubby arms.
  pen.blob([-20, 0, -22, -30, -14, -48, 14, -48, 22, -30, 20, 0], palette.secondary, 1);
  pen.line([-20, -26, -32, -18], palette.secondary, 5);
  pen.line([20, -26, 32, -18], palette.secondary, 5);
  // Big cap
  pen.blob([-58, -44, -46, -76, -10, -92, 26, -88, 54, -70, 60, -46, 0, -40], palette.main, 1);
  pen.circle(-30, -66, 7, palette.accent, 0.7);
  pen.circle(4, -80, 5, palette.accent, 0.7);
  pen.circle(34, -64, 8, palette.accent, 0.7);
  pen.circle(-6, -58, 4, palette.accent, 0.6);
  // Sleepy, heavy-lidded eyes and a slack mouth.
  pen.ellipse(-9, -30, 5.5, 3.2, palette.accent, 1);
  pen.ellipse(9, -30, 5.5, 3.2, palette.accent, 1);
  pen.poly([-16, -36, -2, -36, -2, -30, -16, -30], palette.secondary, 1);
  pen.poly([2, -36, 16, -36, 16, -30, 2, -30], palette.secondary, 1);
  pen.line([-15, -30, -3, -30], palette.dark, 1.6);
  pen.line([3, -30, 15, -30], palette.dark, 1.6);
  pen.ellipse(0, -17, 5, 4, palette.dark, 1);
  // Drifting spores and a sleep glyph.
  pen.circle(-44, -30, 2.4, palette.accent, 0.8);
  pen.circle(46, -28, 2, palette.accent, 0.8);
  pen.circle(40, -94, 2.2, palette.accent, 0.8);
  pen.line([46, -104, 56, -104, 46, -94, 56, -94], palette.accent, 2);
}

function createMudCursedChild(container, scale, palette = DEFAULT_PALETTE) {
  const pen = createPen(container, scale, palette);
  // Drippy mound body with long reaching arms.
  pen.blob([-34, 0, -38, -34, -26, -60, 0, -70, 26, -60, 36, -34, 34, 0], palette.main, 1);
  pen.blob([-26, -40, -52, -30, -58, -12, -50, -8, -44, -22, -24, -24], palette.main, 1);
  pen.blob([26, -40, 50, -34, 60, -16, 52, -12, 44, -24, 24, -26], palette.main, 1);
  [[-58, -10], [-52, -6], [-46, -8]].forEach(([x, y]) => pen.line([x, y, x - 1, y + 6], palette.main, 2.6));
  [[58, -14], [52, -10], [46, -12]].forEach(([x, y]) => pen.line([x, y, x + 1, y + 6], palette.main, 2.6));
  // Oversized cursed head.
  pen.blob([-30, -64, -32, -94, -10, -112, 16, -110, 32, -90, 28, -62, 0, -56], palette.main, 1);
  pen.blob([-24, -92, -10, -106, 6, -104, -8, -94], palette.secondary, 0.7);
  // Hollow eyes with pinpoint glow, sewn mouth.
  pen.ellipse(-12, -84, 8, 10, palette.dark, 1);
  pen.ellipse(12, -84, 8, 10, palette.dark, 1);
  pen.circle(-12, -83, 3, palette.accent, 1);
  pen.circle(12, -83, 3, palette.accent, 1);
  pen.line([-12, -67, 12, -67], palette.dark, 2.2);
  [-8, -2, 4, 10].forEach(x => pen.line([x - 1, -71, x + 1, -63], palette.accent, 1.2, 0.8));
  // Mud drips.
  pen.ellipse(-20, -52, 3, 6, palette.material, 1);
  pen.ellipse(18, -50, 3, 7, palette.material, 1);
  pen.ellipse(0, -2, 44, 5, palette.material, 0.9);
}

function createKoboldScout(container, scale, palette = DEFAULT_PALETTE) {
  const pen = createPen(container, scale, palette);
  // Tail
  pen.curve([-14, -18, -34, -14, -42, -30], palette.main, 6);
  // Spear held across the body
  pen.line([34, -2, 52, -104], palette.material, 3.4);
  pen.poly([49, -102, 58, -118, 56, -100], IVORY, 1);
  // Body + legs in a scarf
  pen.blob([-18, -8, -20, -38, 0, -50, 20, -38, 18, -8], palette.main, 1);
  pen.line([-10, -8, -12, 0], palette.main, 7);
  pen.line([10, -8, 12, 0], palette.main, 7);
  pen.ellipse(-14, 0, 7, 3, palette.main, 1);
  pen.ellipse(14, 0, 7, 3, palette.main, 1);
  pen.blob([-18, -46, 0, -40, 20, -46, 18, -36, 0, -32, -18, -36], palette.accent, 0.9);
  pen.blob([4, -38, 12, -38, 14, -20, 8, -22], palette.accent, 0.9);
  // Arm gripping the spear
  pen.line([16, -34, 38, -44], palette.main, 6);
  pen.circle(40, -45, 5, palette.secondary, 1);
  // Big dog head: skull, pointed ears, long snout.
  pen.poly([-26, -80, -36, -118, -10, -92], palette.main, 1);
  pen.poly([22, -82, 34, -118, 6, -94], palette.main, 1);
  pen.poly([-26, -86, -31, -108, -16, -92], palette.secondary, 0.8);
  pen.poly([20, -88, 28, -108, 11, -95], palette.secondary, 0.8);
  pen.circle(-2, -78, 28, palette.main, 1);
  pen.blob([4, -76, 22, -80, 42, -70, 44, -58, 22, -52, 4, -58], palette.secondary, 1);
  pen.circle(43, -67, 4, palette.dark, 1);
  eyePair(pen, -4, -84, 11, 5.5, { brow: palette.main });
  // Snarl
  pen.line([12, -58, 40, -60], palette.dark, 2);
  fangs(pen, 22, -59, 16, 3, 6);
}

function createGoblinCaster(container, scale, palette = DEFAULT_PALETTE) {
  const pen = createPen(container, scale, palette);
  // Staff with glowing crystal
  pen.line([-38, 0, -42, -108], palette.material, 4);
  pen.curve([-42, -106, -50, -116, -42, -122, -34, -114], palette.material, 3);
  pen.circle(-42, -116, 12, palette.accent, 0.28);
  pen.poly([-42, -126, -48, -116, -42, -106, -36, -116], palette.accent, 1);
  pen.circle(-44, -118, 1.8, GLINT, 0.9);
  // Robe
  pen.blob([-30, 0, -26, -34, -14, -56, 14, -56, 26, -34, 32, 0], palette.secondary, 1);
  pen.poly([-4, -50, 4, -50, 8, 0, -8, 0], palette.main, 0.8);
  pen.line([-20, -38, -38, -52], palette.secondary, 7);
  pen.circle(-38, -54, 5, palette.main, 1);
  // Long pointy ears
  pen.poly([-22, -80, -58, -96, -24, -70], palette.main, 1);
  pen.poly([22, -80, 58, -96, 24, -70], palette.main, 1);
  pen.poly([-26, -80, -48, -90, -26, -74], palette.rim, 0.8);
  pen.poly([26, -80, 48, -90, 26, -74], palette.rim, 0.8);
  // Head
  pen.circle(0, -76, 25, palette.main, 1);
  // Hood with pointed tip
  pen.blob([-28, -78, -26, -100, -8, -114, 14, -118, 30, -126, 24, -104, 28, -78, 0, -92], palette.secondary, 1);
  // Hooked nose, eyes, snaggle teeth
  eyePair(pen, 0, -78, 10, 5, { brow: palette.main, color: 0xe6d86a });
  pen.poly([-3, -76, 3, -76, 7, -62, 0, -66], palette.rim, 1);
  pen.line([-12, -58, 12, -58], palette.dark, 2.2);
  fangs(pen, -8, -58, 5, 1, 5);
  fangs(pen, 9, -58, 5, 1, 5);
}

function drawSkull(pen, palette, x, y, r, bone, { helmet = null } = {}) {
  pen.circle(x, y, r, bone, 1);
  pen.blob([x - r * 0.72, y + r * 0.4, x + r * 0.72, y + r * 0.4, x + r * 0.6, y + r * 1.02, x - r * 0.6, y + r * 1.02], bone, 1);
  pen.ellipse(x - r * 0.4, y + r * 0.05, r * 0.3, r * 0.34, palette.dark, 1);
  pen.ellipse(x + r * 0.4, y + r * 0.05, r * 0.3, r * 0.34, palette.dark, 1);
  pen.circle(x - r * 0.4, y + r * 0.08, r * 0.13, palette.accent, 1);
  pen.circle(x + r * 0.4, y + r * 0.08, r * 0.13, palette.accent, 1);
  pen.circle(x - r * 0.4, y + r * 0.08, r * 0.3, palette.accent, 0.25);
  pen.circle(x + r * 0.4, y + r * 0.08, r * 0.3, palette.accent, 0.25);
  pen.poly([x, y + r * 0.34, x - r * 0.1, y + r * 0.52, x + r * 0.1, y + r * 0.52], palette.dark, 1);
  pen.line([x - r * 0.5, y + r * 0.72, x + r * 0.5, y + r * 0.72], palette.dark, Math.max(1.2, r * 0.07));
  [-0.3, -0.1, 0.1, 0.3].forEach(dx => pen.line([x + r * dx, y + r * 0.6, x + r * dx, y + r * 0.9], palette.dark, Math.max(1, r * 0.05)));
  if (helmet) {
    pen.blob([x - r * 1.08, y - r * 0.1, x - r * 0.9, y - r * 0.9, x, y - r * 1.18, x + r * 0.9, y - r * 0.9, x + r * 1.08, y - r * 0.1, x, y - r * 0.32], helmet, 1);
    pen.line([x, y - r * 1.16, x, y - r * 0.36], palette.dark, Math.max(1, r * 0.07), 0.6);
  }
}

function createRustedShield(container, scale, palette = DEFAULT_PALETTE) {
  const pen = createPen(container, scale, palette);
  const bone = 0xa59d86;
  // Spear behind
  pen.line([36, 0, 44, -112], palette.secondary, 3.4);
  pen.poly([41, -110, 47, -128, 50, -108], palette.rim, 1);
  // Bony legs
  pen.line([-8, -20, -12, 0], bone, 4);
  pen.line([12, -20, 16, 0], bone, 4);
  // Skull with dented helm
  drawSkull(pen, palette, 10, -84, 20, bone, { helmet: palette.material });
  // Arm to spear
  pen.line([22, -54, 40, -60], bone, 4);
  pen.circle(41, -60, 4, bone, 1);
  // Huge rusted kite shield in front
  pen.blob([-44, -84, 16, -84, 22, -52, 6, -16, -18, -2, -40, -18, -52, -52], palette.material, 1);
  pen.blob([-38, -78, 10, -78, 14, -52, 2, -22, -18, -10, -34, -22, -44, -52], palette.main, 1);
  pen.circle(-15, -48, 9, palette.material, 1);
  pen.circle(-15, -48, 4, palette.rim, 0.7);
  [[-34, -72], [4, -72], [-34, -28], [2, -30]].forEach(([x, y]) => pen.circle(x, y, 2.2, palette.rim, 0.9));
  // Rust streaks
  pen.line([-26, -76, -30, -60], palette.material, 2.4, 0.9);
  pen.line([0, -64, 4, -50], palette.material, 2.4, 0.9);
}

// ---------------------------------------------------------------------------
// Family recipes (spriteType-level, used when there is no named recipe)
// ---------------------------------------------------------------------------

function createSkeleton(container, scale, palette = DEFAULT_PALETTE) {
  const pen = createPen(container, scale, palette);
  const bone = palette.main;
  // Rusty sword raised
  pen.line([30, -48, 44, -104], palette.material, 4);
  pen.line([24, -52, 36, -46], palette.rim, 3);
  // Legs and pelvis
  pen.line([-8, -24, -12, 0], bone, 4);
  pen.line([8, -24, 12, 0], bone, 4);
  pen.ellipse(-13, 0, 6, 2.6, bone, 1);
  pen.ellipse(13, 0, 6, 2.6, bone, 1);
  pen.ellipse(0, -26, 12, 5, bone, 1);
  // Spine and ribs
  pen.line([0, -26, 0, -58], bone, 3.4);
  [-54, -47, -40].forEach((y, index) => pen.curve([-14 + index * 2, y + 4, 0, y - 3, 14 - index * 2, y + 4], bone, 3));
  // Arms
  pen.line([-12, -56, -26, -40, -24, -26], bone, 3.4);
  pen.line([12, -56, 24, -52, 30, -48], bone, 3.4);
  pen.circle(30, -48, 4, bone, 1);
  // Oversized skull
  drawSkull(pen, palette, 0, -86, 22, bone);
}

function createZombie(container, scale, palette = DEFAULT_PALETTE) {
  const pen = createPen(container, scale, palette);
  // Shambling legs
  pen.line([-10, -26, -14, 0], palette.secondary, 8);
  pen.line([10, -26, 12, -2], palette.secondary, 8);
  // Torn shirt torso, hunched forward
  pen.blob([-22, -24, -24, -56, -4, -66, 20, -58, 24, -24], palette.material, 1);
  pen.poly([-22, -24, -14, -16, -8, -24, 0, -14, 8, -24, 16, -16, 24, -24], palette.material, 1);
  pen.line([-10, -40, 6, -36], palette.dark, 1.8, 0.7);
  // Arms stretched toward the party
  pen.line([-18, -54, -40, -60, -54, -58], palette.main, 7);
  pen.line([18, -54, 36, -62, 50, -60], palette.main, 7);
  [[-58, -62], [-58, -56], [54, -64], [54, -58]].forEach(([x, y]) => pen.line([x + (x < 0 ? 4 : -4), y, x, y + 2], palette.main, 2.4));
  // Lopsided big head
  pen.blob([-26, -74, -24, -100, 0, -110, 24, -100, 28, -78, 12, -62, -14, -62], palette.main, 1);
  pen.blob([-18, -94, -2, -104, 14, -98, -2, -90], palette.secondary, 0.8);
  // Mismatched eyes: one bulging, one squint.
  eye(pen, -10, -86, 7, { mood: 0, color: 0xd9e36a });
  pen.circle(-10, -86, 2.4, palette.dark, 1);
  pen.line([6, -86, 16, -84], palette.dark, 2.4);
  // Stitches
  pen.line([4, -104, 16, -92], palette.dark, 1.6);
  [[7, -98], [12, -94]].forEach(([x, y]) => pen.line([x - 3, y - 2, x + 3, y + 2], palette.dark, 1.2));
  // Groaning mouth
  pen.blob([-12, -72, 2, -76, 10, -70, 0, -64, -10, -66], palette.dark, 1);
  fangs(pen, -2, -74, 10, 2, 4);
}

function createOrc(container, scale, palette = DEFAULT_PALETTE) {
  const pen = createPen(container, scale, palette);
  // Axe
  pen.line([34, -4, 40, -94], palette.material, 4);
  pen.blob([38, -96, 60, -104, 62, -76, 40, -80], palette.rim, 1);
  // Stocky legs
  pen.line([-12, -20, -14, 0], palette.main, 11);
  pen.line([12, -20, 14, 0], palette.main, 11);
  // Big chest with belt
  pen.blob([-36, -22, -40, -58, -20, -72, 20, -72, 40, -58, 36, -22], palette.main, 1);
  pen.blob([-22, -58, 0, -66, 22, -58, 16, -38, -16, -38], palette.secondary, 0.7);
  pen.poly([-34, -28, 34, -28, 34, -20, -34, -20], palette.material, 1);
  pen.circle(0, -24, 4, palette.accent, 1);
  // Arms
  pen.line([-34, -58, -44, -34], palette.main, 11);
  pen.line([34, -58, 38, -44], palette.main, 11);
  pen.circle(-44, -30, 7, palette.main, 1);
  pen.circle(38, -44, 7, palette.main, 1);
  // Shoulder pad
  pen.blob([-44, -60, -36, -74, -20, -70, -26, -56], palette.material, 1);
  // Head: pointed ears, heavy brow, tusks.
  pen.poly([-22, -84, -42, -96, -24, -74], palette.main, 1);
  pen.poly([22, -84, 42, -96, 24, -74], palette.main, 1);
  pen.circle(0, -84, 25, palette.main, 1);
  pen.blob([-22, -96, 0, -104, 22, -96, 18, -90, -18, -90], palette.secondary, 0.6);
  eyePair(pen, 0, -88, 10, 5, { brow: palette.main, color: 0xf0c050 });
  pen.ellipse(0, -80, 7, 4, palette.dark, 0.7);
  pen.blob([-16, -70, 0, -74, 16, -70, 10, -62, -10, -62], palette.dark, 1);
  upFangs(pen, -11, -66, 7, 1, 13);
  upFangs(pen, 11, -66, 7, 1, 13);
}

function createGhost(container, scale, palette = DEFAULT_PALETTE) {
  const pen = createPen(container, scale, palette);
  // Wispy sheet body floating above the floor.
  pen.blob([
    -34, -58, -30, -92, 0, -110, 30, -92, 36, -56,
    40, -30, 30, -18, 22, -26, 12, -10, 2, -24, -8, -8, -18, -22, -30, -12, -38, -30
  ], palette.main, 0.92);
  pen.blob([-22, -86, -4, -100, 14, -94, -6, -80], palette.secondary, 0.7);
  // Trailing arms
  pen.blob([-32, -62, -54, -58, -62, -44, -48, -50, -34, -46], palette.main, 0.92);
  pen.blob([34, -60, 54, -66, 64, -52, 50, -52, 36, -46], palette.main, 0.92);
  // Hollow eyes and wailing mouth.
  pen.ellipse(-12, -76, 8, 11, palette.dark, 1);
  pen.ellipse(12, -76, 8, 11, palette.dark, 1);
  pen.circle(-12, -74, 3, palette.accent, 1);
  pen.circle(12, -74, 3, palette.accent, 1);
  pen.ellipse(0, -52, 7, 10, palette.dark, 1);
  // Cold motes
  pen.circle(-44, -24, 2.4, palette.accent, 0.7);
  pen.circle(46, -30, 2, palette.accent, 0.7);
}

function createWisp(container, scale, palette = DEFAULT_PALETTE) {
  const pen = createPen(container, scale, palette);
  pen.circle(0, -58, 40, palette.accent, 0.14);
  // Flame body
  pen.blob([-28, -48, -26, -76, -12, -88, -6, -112, 6, -90, 18, -104, 22, -78, 30, -54, 22, -30, 0, -22, -20, -30], palette.main, 1);
  pen.blob([-16, -46, -14, -68, -2, -78, 4, -94, 10, -72, 16, -50, 8, -36, -8, -36], palette.secondary, 1);
  // Face
  eyePair(pen, 0, -58, 8, 4.5, { brow: palette.secondary, color: GLINT, glow: false });
  pen.blob([-7, -46, 0, -48, 7, -46, 0, -40], palette.dark, 1);
  // Orbiting sparks
  pen.circle(-40, -80, 4, palette.accent, 1);
  pen.circle(38, -36, 3.2, palette.accent, 1);
  pen.circle(34, -94, 2.4, palette.accent, 1);
  pen.circle(-34, -28, 2, palette.accent, 1);
  pen.ellipse(0, -6, 18, 3, palette.accent, 0.3);
}

function createSpider(container, scale, palette = DEFAULT_PALETTE) {
  const pen = createPen(container, scale, palette);
  // Eight jointed legs
  [[-1, 0], [-1, 1], [-1, 2], [-1, 3], [1, 0], [1, 1], [1, 2], [1, 3]].forEach(([side, index]) => {
    const rootY = -36 + index * 4;
    const kneeX = side * (30 + index * 8);
    const kneeY = -64 + index * 8;
    const footX = side * (40 + index * 10);
    pen.line([side * 10, rootY, kneeX, kneeY, footX, 0], palette.main, 4.2);
  });
  // Abdomen with marking
  pen.ellipse(0, -52, 30, 26, palette.main, 1);
  pen.blob([-8, -64, 8, -64, 4, -54, 10, -44, -10, -44, -4, -54], palette.material, 1);
  // Head
  pen.circle(0, -28, 17, palette.main, 1);
  pen.ellipse(0, -30, 12, 8, palette.secondary, 0.6);
  // Many eyes
  eyePair(pen, 0, -32, 6, 4.2, { brow: palette.main, color: 0xe0584c });
  eye(pen, -13, -38, 2.2, { glow: false, mood: 0, color: 0xe0584c });
  eye(pen, 13, -38, 2.2, { glow: false, mood: 0, color: 0xe0584c });
  // Fangs
  pen.blob([-8, -20, -4, -10, -2, -20], IVORY, 1);
  pen.blob([8, -20, 4, -10, 2, -20], IVORY, 1);
}

function createRabbit(container, scale, palette = DEFAULT_PALETTE) {
  // The ears already carry the height, so only the body mass is boosted.
  const pen = createPen(container, scale * 1.08, palette);
  // Long ears, one bent.
  pen.blob([-18, -58, -24, -104, -14, -114, -6, -100, -8, -60], palette.main, 1);
  pen.blob([-16, -68, -18, -100, -12, -104, -10, -70], palette.material, 0.9);
  pen.blob([8, -60, 12, -96, 34, -108, 40, -100, 18, -86, 18, -60], palette.main, 1);
  pen.blob([13, -70, 16, -92, 32, -102, 20, -84, 16, -66], palette.material, 0.9);
  // Round body and fat head
  pen.circle(-4, -24, 26, palette.main, 1);
  pen.ellipse(20, -8, 11, 6, palette.main, 1);
  pen.ellipse(-26, -6, 10, 6, palette.main, 1);
  pen.circle(-30, -30, 7, palette.secondary, 1);
  pen.circle(0, -52, 24, palette.main, 1);
  pen.ellipse(2, -42, 12, 9, palette.secondary, 0.9);
  // Bloodshot angry eyes and oversized buck teeth.
  eyePair(pen, 0, -56, 10, 5.4, { brow: palette.main, color: 0xe0584c });
  pen.ellipse(2, -46, 3.2, 2.4, palette.dark, 1);
  pen.poly([-6, -40, 10, -40, 8, -28, -4, -28], IVORY, 1);
  pen.line([2, -40, 2, -28], palette.dark, 1.4);
}

function createDemon(container, scale, palette = DEFAULT_PALETTE) {
  const pen = createPen(container, scale, palette);
  // Arrow-tipped tail
  pen.curve([14, -14, 42, -8, 48, -34], palette.main, 4);
  pen.poly([44, -34, 52, -46, 56, -30], palette.main, 1);
  // Small bat wings
  batWing(pen, -1, 14, -54, 40, 26, palette);
  batWing(pen, 1, 14, -54, 40, 26, palette);
  // Body and legs
  pen.blob([-18, -12, -20, -44, 0, -54, 20, -44, 18, -12], palette.main, 1);
  pen.ellipse(0, -30, 11, 13, palette.secondary, 0.7);
  pen.line([-10, -12, -14, 0], palette.main, 7);
  pen.line([10, -12, 14, 0], palette.main, 7);
  pen.poly([-20, 0, -8, 0, -14, -6], palette.main, 1);
  pen.poly([20, 0, 8, 0, 14, -6], palette.main, 1);
  // Clawed arms
  pen.line([-16, -42, -30, -28], palette.main, 6);
  pen.line([16, -42, 30, -28], palette.main, 6);
  [-34, -30, -26].forEach(x => pen.line([x + 4, -28, x, -20], IVORY, 1.6));
  [26, 30, 34].forEach(x => pen.line([x - 4, -28, x, -20], IVORY, 1.6));
  // Horned head with wicked grin
  horn(pen, -14, -88, -30, -118, 6, palette.material);
  horn(pen, 14, -88, 30, -118, 6, palette.material);
  pen.circle(0, -76, 24, palette.main, 1);
  pen.poly([-22, -80, -38, -88, -22, -70], palette.main, 1);
  pen.poly([22, -80, 38, -88, 22, -70], palette.main, 1);
  eyePair(pen, 0, -80, 10, 5.2, { brow: palette.main, color: 0xffb040 });
  pen.blob([-16, -66, 0, -62, 16, -66, 8, -56, -8, -56], palette.dark, 1);
  fangs(pen, 0, -65, 28, 6, 5);
}

function createDragon(container, scale, palette = DEFAULT_PALETTE) {
  const pen = createPen(container, scale, palette);
  // Tail sweeping around
  pen.blob([20, -10, 52, -8, 74, -24, 70, -30, 50, -20, 22, -24], palette.main, 1);
  pen.poly([68, -24, 84, -38, 76, -20], palette.material, 1);
  // Wings
  batWing(pen, -1, 22, -64, 48, 40, palette);
  batWing(pen, 1, 22, -64, 48, 40, palette);
  // Sitting pear body with belly plates
  pen.blob([-34, 0, -38, -34, -22, -62, 22, -62, 38, -34, 34, 0], palette.main, 1);
  pen.blob([-18, -4, -22, -30, -10, -52, 10, -52, 22, -30, 18, -4], palette.secondary, 1);
  [-40, -30, -20, -10].forEach(y => pen.line([-18, y, 18, y], palette.main, 1.6, 0.6));
  // Feet with claws
  pen.ellipse(-24, -3, 12, 6, palette.main, 1);
  pen.ellipse(24, -3, 12, 6, palette.main, 1);
  [-32, -26, -20].forEach(x => pen.poly([x - 2, 0, x + 2, 0, x, 5], IVORY, 1));
  [20, 26, 32].forEach(x => pen.poly([x - 2, 0, x + 2, 0, x, 5], IVORY, 1));
  // Horned head with a snout
  horn(pen, -16, -104, -30, -130, 5, palette.material);
  horn(pen, 12, -104, 24, -132, 5, palette.material);
  pen.circle(-2, -92, 27, palette.main, 1);
  pen.blob([-4, -86, 20, -92, 40, -80, 40, -68, 16, -62, -6, -68], palette.main, 1);
  pen.ellipse(36, -80, 2.4, 2, palette.dark, 1);
  // Head spikes
  pen.poly([-28, -96, -40, -90, -28, -86], palette.material, 1);
  eye(pen, -8, -96, 6.4, { side: 1, brow: palette.main, color: 0xffc040 });
  pen.ellipse(-8, -96, 1.6, 5, palette.dark, 1);
  // Mouth line with fangs and a flicker of fire.
  pen.line([4, -70, 38, -72], palette.dark, 2);
  fangs(pen, 18, -71, 18, 3, 6);
  pen.circle(46, -70, 5, 0xffa040, 0.55);
  pen.circle(46, -70, 2.4, 0xffe080, 1);
}

// ---------------------------------------------------------------------------
// Archetype fallbacks
// ---------------------------------------------------------------------------

function createFallbackSmall(container, scale, palette = DEFAULT_PALETTE) {
  // Horned beetle critter. The small archetype renders at a reduced profile
  // scale, so the body is drawn a size up to keep its cues legible at 320px.
  const pen = createPen(container, scale * 1.3, palette);
  [[-1, -18], [-1, -8], [-1, 2], [1, -18], [1, -8], [1, 2]].forEach(([side, offset]) => {
    pen.line([side * 18, -20 + offset * 0.4, side * 34, -18 + offset, side * 38, 0], palette.dark, 3.2);
  });
  pen.ellipse(0, -30, 34, 24, palette.main, 1);
  pen.line([0, -54, 0, -8], palette.dark, 2.2, 0.8);
  pen.blob([-26, -40, -14, -50, -4, -48, -10, -38], palette.secondary, 0.8);
  pen.blob([26, -40, 14, -50, 4, -48, 10, -38], palette.secondary, 0.8);
  // Head in front with horn and mandibles.
  pen.circle(0, -18, 16, palette.main, 1);
  horn(pen, 0, -28, 4, -62, 5, palette.material);
  eyePair(pen, 0, -20, 7, 4, { brow: palette.main });
  pen.blob([-10, -8, -16, 2, -6, -4], IVORY, 1);
  pen.blob([10, -8, 16, 2, 6, -4], IVORY, 1);
}

function createFallbackHumanoid(container, scale, palette = DEFAULT_PALETTE) {
  // Goblin grunt with a club.
  const pen = createPen(container, scale, palette);
  pen.line([28, -30, 42, -84], palette.material, 5);
  pen.ellipse(44, -88, 9, 13, palette.material, 1);
  [[40, -94], [48, -86], [42, -80]].forEach(([x, y]) => pen.circle(x, y, 1.8, IVORY, 1));
  pen.line([-10, -16, -12, 0], palette.main, 7);
  pen.line([10, -16, 12, 0], palette.main, 7);
  pen.blob([-20, -14, -22, -44, 0, -54, 22, -44, 20, -14], palette.secondary, 1);
  pen.poly([-20, -20, 20, -20, 16, -12, -16, -12], palette.material, 1);
  pen.line([-18, -40, -30, -24], palette.main, 6);
  pen.line([18, -40, 28, -32], palette.main, 6);
  pen.poly([-20, -70, -52, -84, -24, -60], palette.main, 1);
  pen.poly([20, -70, 52, -84, 24, -60], palette.main, 1);
  pen.circle(0, -70, 24, palette.main, 1);
  pen.blob([-18, -84, 0, -92, 18, -84, 12, -80, -12, -80], palette.secondary, 0.6);
  eyePair(pen, 0, -72, 10, 5, { brow: palette.main, color: 0xf0d060 });
  pen.poly([-3, -70, 3, -70, 5, -60, -2, -62], palette.rim, 1);
  pen.blob([-12, -56, 0, -58, 12, -56, 6, -50, -6, -50], palette.dark, 1);
  fangs(pen, 0, -57, 20, 4, 4);
}

function createFallbackBrute(container, scale, palette = DEFAULT_PALETTE) {
  // Stone golem: blocky body, sunken head, giant fists.
  const pen = createPen(container, scale, palette);
  pen.poly([-26, -24, -10, -24, -8, 0, -30, 0], palette.main, 1);
  pen.poly([10, -24, 26, -24, 30, 0, 8, 0], palette.main, 1);
  pen.poly([-40, -24, -44, -70, -26, -86, 26, -86, 44, -70, 40, -24], palette.main, 1);
  pen.poly([-30, -32, -32, -66, -18, -76, 18, -76, 32, -66, 30, -32], palette.secondary, 0.7);
  // Rune core
  pen.circle(0, -54, 9, palette.accent, 0.3);
  pen.poly([0, -63, 6, -54, 0, -45, -6, -54], palette.accent, 1);
  // Cracks and moss
  pen.line([-26, -70, -18, -58, -22, -46], palette.dark, 1.8, 0.8);
  pen.line([24, -40, 16, -34, 18, -28], palette.dark, 1.8, 0.8);
  pen.ellipse(-30, -84, 10, 4, palette.material, 0.9);
  // Arms and fists
  pen.poly([-44, -76, -58, -70, -62, -34, -50, -34], palette.main, 1);
  pen.poly([44, -76, 58, -70, 62, -34, 50, -34], palette.main, 1);
  pen.blob([-66, -36, -46, -38, -44, -14, -68, -14], palette.secondary, 1);
  pen.blob([66, -36, 46, -38, 44, -14, 68, -14], palette.secondary, 1);
  // Small sunken head with glowing slit eyes
  pen.poly([-18, -86, -16, -104, 16, -104, 18, -86], palette.main, 1);
  pen.poly([-12, -98, -3, -95, -3, -92, -12, -94], palette.accent, 1);
  pen.poly([12, -98, 3, -95, 3, -92, 12, -94], palette.accent, 1);
  pen.ellipse(0, -95, 16, 6, palette.accent, 0.2);
}

function createFallbackCaster(container, scale, palette = DEFAULT_PALETTE) {
  // Hooded sorcerer: shadowed face with burning eyes.
  const pen = createPen(container, scale, palette);
  pen.line([-34, 0, -38, -104], palette.material, 4);
  pen.circle(-38, -110, 12, palette.accent, 0.3);
  pen.circle(-38, -110, 6, palette.accent, 1);
  pen.circle(-40, -112, 2, GLINT, 0.9);
  pen.blob([-32, 0, -26, -40, -18, -64, 18, -64, 26, -40, 34, 0], palette.main, 1);
  pen.poly([-6, -60, 6, -60, 12, 0, -12, 0], palette.secondary, 0.8);
  pen.line([-22, -46, -34, -58], palette.main, 9);
  pen.circle(-35, -60, 4.4, palette.secondary, 1);
  pen.line([22, -46, 30, -30], palette.main, 9);
  pen.circle(32, -26, 8, palette.accent, 0.3);
  pen.circle(32, -26, 3.6, palette.accent, 1);
  // Pointed hood with dark face
  pen.blob([-28, -62, -30, -92, -10, -116, 8, -126, 18, -106, 30, -88, 28, -62, 0, -58], palette.main, 1);
  pen.blob([-18, -68, -20, -88, 0, -98, 20, -88, 18, -68, 0, -64], palette.dark, 1);
  eyePair(pen, 0, -80, 8, 4.2, { brow: palette.dark });
}

function createFallbackBoss(container, scale, palette = DEFAULT_PALETTE) {
  // Horned archfiend with spread wings.
  const pen = createPen(container, scale, palette);
  batWing(pen, -1, 26, -80, 56, 48, palette);
  batWing(pen, 1, 26, -80, 56, 48, palette);
  pen.line([-20, -30, -26, 0], palette.main, 14);
  pen.line([20, -30, 26, 0], palette.main, 14);
  pen.poly([-40, 0, -14, 0, -28, -8], palette.main, 1);
  pen.poly([40, 0, 14, 0, 28, -8], palette.main, 1);
  pen.blob([-42, -26, -48, -70, -28, -92, 28, -92, 48, -70, 42, -26], palette.main, 1);
  pen.blob([-26, -34, -30, -66, 0, -78, 30, -66, 26, -34], palette.secondary, 0.7);
  pen.circle(0, -56, 8, palette.accent, 0.35);
  pen.circle(0, -56, 4, palette.accent, 1);
  pen.line([-44, -76, -62, -44, -58, -24], palette.main, 12);
  pen.line([44, -76, 62, -44, 58, -24], palette.main, 12);
  [-64, -58, -52].forEach(x => pen.poly([x - 2, -20, x + 2, -20, x, -10], IVORY, 1));
  [52, 58, 64].forEach(x => pen.poly([x - 2, -20, x + 2, -20, x, -10], IVORY, 1));
  horn(pen, -16, -120, -44, -150, 8, palette.material);
  horn(pen, 16, -120, 44, -150, 8, palette.material);
  pen.circle(0, -108, 28, palette.main, 1);
  eyePair(pen, 0, -112, 12, 6, { brow: palette.main, color: 0xffa040 });
  pen.blob([-18, -96, 0, -92, 18, -96, 10, -84, -10, -84], palette.dark, 1);
  fangs(pen, 0, -95, 32, 6, 6);
}

export const PROCEDURAL_RECIPE_BUILDERS = Object.freeze({
  ["flash-bat"]: createFlashBat,
  ["powder-bat"]: createPowderBat,
  biter: createBiter,
  ["mud-slime"]: createMudSlime,
  ["split-slime"]: createSplitSlime,
  ["rat-pack"]: createRatPack,
  ["sleep-spore"]: createSleepSpore,
  ["mud-cursed-child"]: createMudCursedChild,
  ["kobold-scout"]: createKoboldScout,
  ["goblin-caster"]: createGoblinCaster,
  ["rusted-shield"]: createRustedShield,
  skeleton: createSkeleton,
  zombie: createZombie,
  orc: createOrc,
  ghost: createGhost,
  wisp: createWisp,
  spider: createSpider,
  rabbit: createRabbit,
  demon: createDemon,
  dragon: createDragon,
  small: createFallbackSmall,
  humanoid: createFallbackHumanoid,
  brute: createFallbackBrute,
  caster: createFallbackCaster,
  boss: createFallbackBoss
});
