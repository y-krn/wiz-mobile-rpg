// balance-impact: none — review-only enemy presentation prototypes.
// These deliberately use the same small graphical vocabulary as the original
// Pixi combat renderer. They are not production assets or a new art pipeline.
import { Container, Graphics } from "pixi.js";

export const SIMPLE_ENEMY_PROTOTYPE_MODE = Object.freeze({
  primitive: "primitive",
  simpleRich: "simple-rich"
});

const COLORS = Object.freeze({
  black: 0x05070a,
  // The corridor remains the reference dark. These two broad planes are
  // raised just enough to keep the enemy readable without turning it into a
  // bright icon or making the rim carry the silhouette.
  body: 0x1a2e33,
  bodyLight: 0x2e4a4d,
  teal: 0x4f9ca0,
  cyan: 0x8be6df,
  rust: 0x8b5c45,
  mud: 0x695842,
  violet: 0x766884,
  white: 0xffffff
});

export const SIMPLE_ENEMY_VALUE_TOKENS = Object.freeze({
  background: 0x0c0c0e,
  main: COLORS.body,
  secondary: COLORS.bodyLight,
  accent: COLORS.cyan
});

const PROTOTYPE_PRESENTATION = Object.freeze({ width: 140, height: 125, maxWidth: 140, maxHeight: 125, scale: 1 });

function addEllipse(container, x, y, radiusX, radiusY, color, alpha = 1, stroke = null) {
  const graphic = new Graphics();
  graphic.ellipse(x, y, radiusX, radiusY).fill({ color, alpha });
  if (stroke) graphic.stroke(stroke);
  container.addChild(graphic);
  return graphic;
}

function addRect(container, x, y, width, height, color, alpha = 1, stroke = null) {
  const graphic = new Graphics();
  graphic.rect(x, y, width, height).fill({ color, alpha });
  if (stroke) graphic.stroke(stroke);
  container.addChild(graphic);
  return graphic;
}

function addPolygon(container, points, color, alpha = 1, stroke = null) {
  const graphic = new Graphics();
  graphic.poly(points.flatMap(({ x, y }) => [x, y])).fill({ color, alpha });
  if (stroke) graphic.stroke(stroke);
  container.addChild(graphic);
  return graphic;
}

function addLine(container, points, stroke) {
  const graphic = new Graphics();
  graphic.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach(({ x, y }) => graphic.lineTo(x, y));
  graphic.stroke(stroke);
  container.addChild(graphic);
  return graphic;
}

function addPoint(container, x, y, radius, color, alpha = 1) {
  return addEllipse(container, x, y, radius, radius, color, alpha);
}

function getPrototypeKind(monster) {
  if (monster?.name === "フラッシュバット" || monster?.spriteType === "bat") return "bat";
  if (monster?.name === "マッドスライム") return "slime";
  if (monster?.name === "ゴブリンの呪術師") return "caster";
  if (monster?.name === "錆びた盾兵") return "shield";
  if (monster?.spriteType === "mage") return "caster";
  if (monster?.spriteType === "skeleton" || monster?.spriteType === "kobold") return "shield";
  return "slime";
}

function createPrimitiveBat(container, scale, color) {
  addEllipse(container, 0, -42 * scale, 10 * scale, 10 * scale, color, 0.34, { color, width: Math.max(1, 3 * scale), alpha: 0.9 });
  addLine(container, [
    { x: -10 * scale, y: -42 * scale }, { x: -55 * scale, y: -68 * scale },
    { x: -38 * scale, y: -34 * scale }, { x: -20 * scale, y: -52 * scale }
  ], { color, width: Math.max(1, 3 * scale), alpha: 0.9 });
  addLine(container, [
    { x: 10 * scale, y: -42 * scale }, { x: 55 * scale, y: -68 * scale },
    { x: 38 * scale, y: -34 * scale }, { x: 20 * scale, y: -52 * scale }
  ], { color, width: Math.max(1, 3 * scale), alpha: 0.9 });
}

function createPrimitiveOrb(container, scale, color) {
  addEllipse(container, 0, -40 * scale, 25 * scale, 25 * scale, color, 0.34, { color, width: Math.max(1, 3 * scale), alpha: 0.9 });
  addEllipse(container, 0, -40 * scale, 8 * scale, 8 * scale, COLORS.white, 0.82);
  addLine(container, [{ x: -15 * scale, y: -40 * scale }, { x: 15 * scale, y: -40 * scale }], { color: COLORS.white, width: Math.max(1, scale), alpha: 0.7 });
}

function createPrimitiveCaster(container, scale, color) {
  addPolygon(container, [
    { x: 0, y: -75 * scale }, { x: -20 * scale, y: -45 * scale }, { x: 20 * scale, y: -45 * scale }
  ], color, 0.34, { color, width: Math.max(1, 3 * scale), alpha: 0.9 });
  addPolygon(container, [
    { x: -25 * scale, y: -45 * scale }, { x: -35 * scale, y: 0 },
    { x: 35 * scale, y: 0 }, { x: 25 * scale, y: -45 * scale }
  ], color, 0.24, { color, width: Math.max(1, 3 * scale), alpha: 0.9 });
  addLine(container, [{ x: -25 * scale, y: 0 }, { x: -25 * scale, y: -65 * scale }], { color, width: Math.max(1, 3 * scale), alpha: 0.9 });
  addEllipse(container, -25 * scale, -70 * scale, 7 * scale, 7 * scale, COLORS.white, 0.82);
}

function createPrimitiveShield(container, scale, color) {
  addRect(container, -19 * scale, -64 * scale, 38 * scale, 52 * scale, color, 0.34, { color, width: Math.max(1, 3 * scale), alpha: 0.9 });
  addEllipse(container, 0, -45 * scale, 8 * scale, 8 * scale, COLORS.white, 0.82);
  addLine(container, [{ x: -15 * scale, y: -45 * scale }, { x: 15 * scale, y: -45 * scale }], { color: COLORS.white, width: Math.max(1, scale), alpha: 0.7 });
}

function createPrimitivePrototype(monster, visualScale, color) {
  const container = new Container();
  container.label = "enemy-primitive";
  const kind = getPrototypeKind(monster);
  if (kind === "bat") createPrimitiveBat(container, visualScale, color);
  else if (kind === "caster") createPrimitiveCaster(container, visualScale, color);
  else if (kind === "shield") createPrimitiveShield(container, visualScale, color);
  else createPrimitiveOrb(container, visualScale, color);
  return container;
}

function createSimpleRichBat(container, scale) {
  addPolygon(container, [
    { x: -8 * scale, y: -42 * scale }, { x: -68 * scale, y: -75 * scale },
    { x: -49 * scale, y: -36 * scale }, { x: -28 * scale, y: -52 * scale },
    { x: -17 * scale, y: -25 * scale }, { x: -8 * scale, y: -32 * scale }
  ], COLORS.body, 0.96, { color: COLORS.teal, width: Math.max(1, 1.8 * scale), alpha: 0.62 });
  addPolygon(container, [
    { x: 8 * scale, y: -42 * scale }, { x: 68 * scale, y: -75 * scale },
    { x: 49 * scale, y: -36 * scale }, { x: 28 * scale, y: -52 * scale },
    { x: 17 * scale, y: -25 * scale }, { x: 8 * scale, y: -32 * scale }
  ], COLORS.body, 0.96, { color: COLORS.teal, width: Math.max(1, 1.8 * scale), alpha: 0.62 });
  addLine(container, [{ x: -49 * scale, y: -36 * scale }, { x: -28 * scale, y: -52 * scale }], { color: COLORS.bodyLight, width: Math.max(2, 4 * scale), alpha: 0.8 });
  addLine(container, [{ x: 49 * scale, y: -36 * scale }, { x: 28 * scale, y: -52 * scale }], { color: COLORS.bodyLight, width: Math.max(2, 4 * scale), alpha: 0.8 });
  addEllipse(container, 0, -42 * scale, 11 * scale, 12 * scale, COLORS.black, 0.98);
  addPoint(container, -4 * scale, -44 * scale, Math.max(1, 2 * scale), COLORS.cyan, 0.86);
  addPoint(container, 4 * scale, -44 * scale, Math.max(1, 2 * scale), COLORS.cyan, 0.86);
}

function createSimpleRichSlime(container, scale) {
  addPolygon(container, [
    { x: -54 * scale, y: -18 * scale }, { x: -48 * scale, y: -58 * scale },
    { x: -25 * scale, y: -75 * scale }, { x: 4 * scale, y: -70 * scale },
    { x: 30 * scale, y: -78 * scale }, { x: 53 * scale, y: -48 * scale },
    { x: 47 * scale, y: -10 * scale }, { x: 28 * scale, y: 0 },
    { x: -31 * scale, y: 0 }
  ], COLORS.body, 0.96, { color: COLORS.mud, width: Math.max(1, 1.8 * scale), alpha: 0.72 });
  addPolygon(container, [
    { x: -38 * scale, y: -49 * scale }, { x: -18 * scale, y: -65 * scale },
    { x: 6 * scale, y: -60 * scale }, { x: 26 * scale, y: -67 * scale },
    { x: 38 * scale, y: -45 * scale }, { x: 18 * scale, y: -34 * scale },
    { x: -21 * scale, y: -35 * scale }
  ], COLORS.bodyLight, 0.72);
  addLine(container, [{ x: -32 * scale, y: -14 * scale }, { x: 22 * scale, y: -14 * scale }], { color: COLORS.mud, width: Math.max(2, 3 * scale), alpha: 0.62 });
  addPoint(container, -13 * scale, -43 * scale, Math.max(1, 2 * scale), COLORS.cyan, 0.52);
  addPoint(container, 14 * scale, -43 * scale, Math.max(1, 2 * scale), COLORS.cyan, 0.52);
}

function createSimpleRichCaster(container, scale) {
  addPolygon(container, [
    { x: -7 * scale, y: -94 * scale }, { x: -43 * scale, y: -23 * scale },
    { x: -30 * scale, y: 0 }, { x: 25 * scale, y: 0 },
    { x: 42 * scale, y: -24 * scale }, { x: 17 * scale, y: -60 * scale }
  ], COLORS.body, 0.97, { color: COLORS.teal, width: Math.max(1, 1.8 * scale), alpha: 0.55 });
  addPolygon(container, [
    { x: -7 * scale, y: -94 * scale }, { x: -27 * scale, y: -54 * scale },
    { x: 12 * scale, y: -55 * scale }, { x: 17 * scale, y: -60 * scale }
  ], COLORS.bodyLight, 0.46);
  addLine(container, [{ x: -37 * scale, y: 1 * scale }, { x: -40 * scale, y: -105 * scale }], { color: COLORS.bodyLight, width: Math.max(3, 5 * scale), alpha: 0.96 });
  addLine(container, [{ x: -40 * scale, y: -105 * scale }, { x: -31 * scale, y: -112 * scale }, { x: -47 * scale, y: -112 * scale }], { color: COLORS.teal, width: Math.max(1, 2 * scale), alpha: 0.7 });
  addPoint(container, 25 * scale, -45 * scale, Math.max(2, 4 * scale), COLORS.cyan, 0.84);
  addPoint(container, 25 * scale, -45 * scale, Math.max(1, 2 * scale), COLORS.white, 0.58);
}

function createSimpleRichShield(container, scale) {
  addPolygon(container, [
    { x: -58 * scale, y: -100 * scale }, { x: 20 * scale, y: -92 * scale },
    { x: 43 * scale, y: -57 * scale }, { x: 38 * scale, y: -6 * scale },
    { x: 8 * scale, y: 1 * scale }, { x: -45 * scale, y: -17 * scale },
    { x: -64 * scale, y: -58 * scale }
  ], COLORS.body, 0.98, { color: COLORS.rust, width: Math.max(1, 2 * scale), alpha: 0.72 });
  addPolygon(container, [
    { x: -49 * scale, y: -88 * scale }, { x: 13 * scale, y: -82 * scale },
    { x: 29 * scale, y: -54 * scale }, { x: 22 * scale, y: -22 * scale },
    { x: -38 * scale, y: -30 * scale }, { x: -52 * scale, y: -59 * scale }
  ], COLORS.bodyLight, 0.74);
  addPolygon(container, [
    { x: -18 * scale, y: -83 * scale }, { x: 13 * scale, y: -82 * scale },
    { x: 29 * scale, y: -54 * scale }, { x: 4 * scale, y: -50 * scale }
  ], COLORS.teal, 0.22);
  addLine(container, [{ x: -31 * scale, y: -44 * scale }, { x: 11 * scale, y: -37 * scale }], { color: COLORS.rust, width: Math.max(2, 4 * scale), alpha: 0.72 });
  addEllipse(container, 13 * scale, -105 * scale, 13 * scale, 10 * scale, COLORS.black, 0.98, { color: COLORS.teal, width: Math.max(1, 1.5 * scale), alpha: 0.45 });
  addLine(container, [{ x: 43 * scale, y: -10 * scale }, { x: 66 * scale, y: -66 * scale }], { color: COLORS.bodyLight, width: Math.max(2, 4 * scale), alpha: 0.9 });
  addPoint(container, 17 * scale, -106 * scale, Math.max(1, 2 * scale), COLORS.cyan, 0.6);
}

function createSimpleRichPrototype(monster, visualScale) {
  const container = new Container();
  container.label = "enemy-simple-rich";
  const kind = getPrototypeKind(monster);
  if (kind === "bat") createSimpleRichBat(container, visualScale);
  else if (kind === "caster") createSimpleRichCaster(container, visualScale);
  else if (kind === "shield") createSimpleRichShield(container, visualScale);
  else createSimpleRichSlime(container, visualScale);
  return container;
}

export function getEnemyPrototypePresentation(monster) {
  return { ...PROTOTYPE_PRESENTATION, kind: getPrototypeKind(monster) };
}

export function createEnemyPrototype(mode, monster, visualScale, color) {
  if (mode === SIMPLE_ENEMY_PROTOTYPE_MODE.primitive) return createPrimitivePrototype(monster, visualScale, color);
  return createSimpleRichPrototype(monster, visualScale);
}
