import assert from "node:assert/strict";
import { BIOMES } from "../../../src/data/biomes.js";
import {
  FLOOR_PATTERNS,
  TRAP_DECAL_STYLES,
  WALL_DECOR,
  WALL_PATTERNS,
  getPixelScenePalette,
  getPixelSurfaceKey,
  paintSurfacePattern,
  paintTrapDecal,
  paintWallDecor
} from "../../../src/pixel_art_painters.js";
import { WALL_DECOR_DENSITY, getWallDecorIndex } from "../../../src/rules/wall_decor.js";

// #1964: each biome paints its own wall/floor pattern, mounts its own wall
// decor at deterministic faces, and draws discovered traps in its trapStyle.

function recordPaint(paint) {
  const ops = [];
  const ctx = {
    fillStyle: "#000000",
    globalAlpha: 1,
    imageSmoothingEnabled: false,
    fillRect(x, y, w, h) {
      ops.push(`${this.fillStyle}@${this.globalAlpha}:${x},${y},${w},${h}`);
    }
  };
  paint(ctx);
  return ops;
}

const signature = ops => ops.join(";");

// Every biome names known painters and a trap style with a decal.
for (const biome of BIOMES) {
  const { surfaces, landmarks } = biome.visualSignature;
  assert.ok(WALL_PATTERNS[surfaces.wall], `${biome.id} wall pattern ${surfaces.wall}`);
  assert.ok(FLOOR_PATTERNS[surfaces.floor], `${biome.id} floor pattern ${surfaces.floor}`);
  assert.ok(surfaces.decor.length >= 2, `${biome.id} has at least two wall decor kinds`);
  surfaces.decor.forEach(id => assert.ok(WALL_DECOR[id], `${biome.id} decor ${id}`));
  assert.ok(TRAP_DECAL_STYLES.includes(landmarks.trapStyle), `${biome.id} trapStyle ${landmarks.trapStyle} has a decal`);
}
assert.equal(new Set(BIOMES.map(biome => biome.visualSignature.surfaces.wall)).size, BIOMES.length, "wall patterns are unique per biome");
assert.equal(new Set(BIOMES.map(biome => biome.visualSignature.surfaces.floor)).size, BIOMES.length, "floor patterns are unique per biome");
assert.equal(new Set(BIOMES.flatMap(biome => biome.visualSignature.surfaces.decor)).size, BIOMES.length * 2, "decor kinds are not shared between biomes");
assert.ok(!BIOMES.some(biome => biome.visualSignature.surfaces.wall === "brick"), "no biome keeps the shared brick wall");

// Painting is deterministic and visibly different between biomes.
const wallSignatures = new Set();
const floorSignatures = new Set();
for (const biome of BIOMES) {
  const palette = getPixelScenePalette(biome.visualSignature.wallColor);
  const { surfaces } = biome.visualSignature;
  const wall = signature(recordPaint(ctx => paintSurfacePattern(ctx, "wall", surfaces.wall, palette)));
  const floor = signature(recordPaint(ctx => paintSurfacePattern(ctx, "floor", surfaces.floor, palette)));
  assert.equal(wall, signature(recordPaint(ctx => paintSurfacePattern(ctx, "wall", surfaces.wall, palette))), `${biome.id} wall paint is deterministic`);
  assert.ok(wall.length > 0 && floor.length > 0, `${biome.id} paints its surfaces`);
  wallSignatures.add(wall);
  floorSignatures.add(floor);

  // Floors stay dry and grate-free: the flood puddle and heat grate colors
  // from #1963 never appear in a floor pattern.
  const floorOps = recordPaint(ctx => paintSurfacePattern(ctx, "floor", surfaces.floor, palette));
  ["#3d9be9", "#bfe8ff", "#ff7a2f", "#ffb347"].forEach(color => {
    assert.ok(!floorOps.some(op => op.startsWith(`${color}@`)), `${biome.id} floor avoids gimmick color ${color}`);
  });

  const decorOps = surfaces.decor.map(id => signature(recordPaint(ctx => paintWallDecor(ctx, id, palette))));
  decorOps.forEach((ops, index) => assert.ok(ops.length > 0, `${biome.id} decor ${surfaces.decor[index]} paints`));
  assert.notEqual(decorOps[0], decorOps[1], `${biome.id} decor kinds differ`);
}
assert.equal(wallSignatures.size, BIOMES.length, "every biome wall paints differently");
assert.equal(floorSignatures.size, BIOMES.length, "every biome floor paints differently");

// Trap decals differ by style and always carry the red warning ring.
const decalSignatures = new Set();
for (const style of TRAP_DECAL_STYLES) {
  const ops = recordPaint(ctx => paintTrapDecal(ctx, style, getPixelScenePalette("#58d6e8")));
  assert.ok(ops.some(op => op.startsWith("#ff3b30@")), `${style} keeps the red warning ring`);
  decalSignatures.add(signature(ops));
}
assert.equal(decalSignatures.size, TRAP_DECAL_STYLES.length, "each trap style paints a distinct decal");

// Texture cache keys separate biomes that would otherwise share an accent.
const palette = getPixelScenePalette("#58d6e8");
assert.notEqual(
  getPixelSurfaceKey(palette, { wall: "rock_face", floor: "gravel", decor: ["lantern"] }),
  getPixelSurfaceKey(palette, { wall: "bookshelf", floor: "planks", decor: ["lantern"] }),
  "surface cache key includes the pattern set"
);

// Wall decor placement is a pure function of seed, floor, and wall face.
{
  const faces = [];
  for (let y = 0; y < 30; y += 1) for (let x = 0; x < 30; x += 1) for (let dir = 0; dir < 4; dir += 1) faces.push({ x, y, dir });
  const indices = faces.map(face => getWallDecorIndex({ seed: "run-a", floor: 3, ...face, count: 2 }));
  assert.deepEqual(indices, faces.map(face => getWallDecorIndex({ seed: "run-a", floor: 3, ...face, count: 2 })), "same face, same decor");
  const decorated = indices.filter(index => index >= 0);
  const share = decorated.length / faces.length;
  assert.ok(Math.abs(share - WALL_DECOR_DENSITY) < 0.03, `decor density ${share.toFixed(3)} tracks ${WALL_DECOR_DENSITY}`);
  assert.ok(decorated.includes(0) && decorated.includes(1), "both decor kinds appear");
  const otherRun = faces.map(face => getWallDecorIndex({ seed: "run-b", floor: 3, ...face, count: 2 }));
  assert.notDeepEqual(indices, otherRun, "a different run seed moves the decor");
  const otherFloor = faces.map(face => getWallDecorIndex({ seed: "run-a", floor: 4, ...face, count: 2 }));
  assert.notDeepEqual(indices, otherFloor, "a different floor moves the decor");
  assert.equal(getWallDecorIndex({ seed: "run-a", floor: 3, x: 1, y: 1, dir: 0, count: 0 }), -1, "no decor kinds, no decor");
}

console.log("[PASS] Issue #1964 biome surfaces, wall decor, and trap decals are distinct and deterministic.");
