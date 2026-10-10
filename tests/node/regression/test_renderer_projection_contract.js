import assert from "node:assert/strict";
import * as facade from "../../../src/rules/renderer_projection.js";
import * as owner from "../../../src/rules/renderer_projection.ts";
import { getEnemyPresentation } from "../../../src/enemy_presentation.js";

const runtimeExports = [
  "CANONICAL_VIEW",
  "PORTRAIT_NEAR_COVERAGE_MIN",
  "WORLD_OBJECT_CELL_DEPTH",
  "WORLD_OBJECT_SCALE_EXPONENT",
  "BASE_PROJECTION",
  "BASE_GEOMETRY",
  "getProjectionProfile",
  "getProjectionPlanes",
  "getProjectionColumn",
  "getWorldObjectProjection",
  "getCombatMonsterLayout"
];

assert.deepEqual(Object.keys(facade).sort(), [...runtimeExports].sort());
assert.deepEqual(Object.keys(owner).sort(), [...runtimeExports].sort());
for (const name of runtimeExports) assert.strictEqual(facade[name], owner[name], `${name} facade identity`);

assert.deepEqual(facade.CANONICAL_VIEW, { width: 400, height: 260 });
assert.equal(facade.PORTRAIT_NEAR_COVERAGE_MIN, 0.8);
assert.equal(facade.WORLD_OBJECT_CELL_DEPTH, 0.5);
assert.equal(facade.WORLD_OBJECT_SCALE_EXPONENT, 0.7);
assert.deepEqual(Object.keys(facade.BASE_PROJECTION), ["xl", "xr", "yt", "yb"]);
assert.deepEqual(facade.BASE_GEOMETRY, { corridorWidth: 1, ceilingHeight: 1, wallLean: 0, ceilingStyle: "flat" });
assert.ok(Object.isFrozen(facade.CANONICAL_VIEW));
assert.ok(Object.isFrozen(facade.BASE_PROJECTION.xl));
assert.ok(Object.isFrozen(facade.BASE_GEOMETRY));

for (const [width, height, orientation] of [[400, 260, "wide"], [320, 568, "portrait"], ["390", "844", "portrait"], [0, -1, "wide"]]) {
  const profile = facade.getProjectionProfile(width, height);
  assert.equal(profile.orientation, orientation);
  assert.ok(Object.isFrozen(profile) && Object.isFrozen(profile.base) && Object.isFrozen(profile.coverage));
  const projection = facade.getProjectionPlanes(facade.BASE_GEOMETRY, profile);
  assert.strictEqual(projection.viewport, profile);
  assert.ok(Object.isFrozen(projection) && Object.isFrozen(projection.xl));
}
assert.deepEqual(Object.keys(facade.getProjectionProfile()), ["width", "height", "aspect", "orientation", "xScale", "yScale", "vanishingPoint", "coverage", "edgeBlend", "base", "columnLayout"]);
assert.equal(facade.getProjectionProfile(-320, 568).width, 400);

const portrait = facade.getProjectionProfile(320, 568);
let conversions = 0;
const planes = facade.getProjectionPlanes(facade.BASE_GEOMETRY, portrait);
assert.strictEqual(facade.getProjectionPlanes(undefined, portrait).viewport, portrait);
assert.equal(planes.columnLayout, null);
assert.equal(portrait.columnLayout, null);
const narrowPlanes = facade.getProjectionPlanes({ corridorWidth: 0.2, ceilingHeight: 0.5 }, portrait);
// The camera plane extends the corridor's rays until it covers the screen frame.
assert.ok(narrowPlanes.xl[0] <= 0 && narrowPlanes.xr[0] >= portrait.width);
assert.ok(narrowPlanes.yt[0] <= 0 && narrowPlanes.yb[0] >= portrait.height);
assert.ok(Math.abs((narrowPlanes.xr[1] - narrowPlanes.xl[1]) - (portrait.base.xr[1] - portrait.base.xl[1]) * 0.94) < 1e-9);
assert.equal(facade.getProjectionPlanes({ ceilingStyle: "invalid" }).ceilingStyle, "flat");
assert.equal(facade.getProjectionPlanes({ ceilingStyle: "arch" }).ceilingStyle, "arch");
const finiteOrInput = { [Symbol.toPrimitive]() { conversions += 1; return "0.8"; } };
facade.getProjectionPlanes({ corridorWidth: finiteOrInput }, portrait);
assert.equal(conversions, 2);

const column = facade.getProjectionColumn(planes, 0, 0);
assert.deepEqual(Object.keys(column), ["leftTop", "leftBottom", "rightTop", "rightBottom", "top", "bottom", "viewport"]);
assert.strictEqual(column.viewport, portrait);
assert.notStrictEqual(column, facade.getProjectionColumn(planes, 0, 0));
assert.equal(Object.isFrozen(column), false);
for (const lane of [-1, 1]) assert.ok(facade.getProjectionColumn(planes, 2, lane).rightTop > facade.getProjectionColumn(planes, 2, lane).leftTop);
const wide = facade.getProjectionProfile(400, 260);
const widePlanes = facade.getProjectionPlanes(facade.BASE_GEOMETRY, wide);
assert.equal(widePlanes.columnLayout, null);
assert.strictEqual(facade.getProjectionColumn(widePlanes, 1).viewport, wide);

const worldObject = facade.getWorldObjectProjection(planes, "99");
assert.equal(worldObject.worldObject.depth, 3);
assert.ok(Object.isFrozen(worldObject) && Object.isFrozen(worldObject.worldObject));
assert.strictEqual(worldObject.viewport, portrait);
assert.equal(facade.getWorldObjectProjection(planes, -8).worldObject.depth, 0);
assert.equal(facade.getWorldObjectProjection(planes, 1.9).worldObject.depth, 1);
assert.notEqual(facade.getWorldObjectProjection(planes, 1, 1).leftBottom, facade.getWorldObjectProjection(planes, 1, 0).leftBottom);

const monsters = [
  { name: "Biter", hp: 10 },
  { name: "dead", hp: 0 },
  { name: "ジャイアント竜", hp: "2" },
  null,
  { name: "unknown sprite", spriteType: "unknown", hp: 3 }
];
const originalMonsters = JSON.stringify(monsters);
const layout = facade.getCombatMonsterLayout(monsters, portrait);
assert.deepEqual(layout.map(entry => entry.monsterIndex), [0, 2, 4]);
assert.strictEqual(layout[0].monster, monsters[0]);
assert.equal(layout[0].hitRegion.shape, "ellipse");
assert.equal(Object.isFrozen(layout), false);
assert.equal(Object.isFrozen(layout[0]), false);
assert.equal(layout[0].hitRegion.width, layout[2].hitRegion.width);
assert.ok(layout[1].hitRegion.width > layout[0].hitRegion.width);
assert.equal(facade.getCombatMonsterLayout([{ hp: 1 }]).length, 1);
assert.equal(facade.getCombatMonsterLayout([{ hp: 1 }, { hp: 1 }])[1].cx, 300);
const fourMonsters = Array.from({ length: 4 }, (_, index) => ({ name: `Biter${index}`, hp: 2 }));
const fourLayout = facade.getCombatMonsterLayout(fourMonsters);
assert.deepEqual(fourLayout.map(entry => [entry.row, entry.column]), [[0, 0], [0, 1], [1, 0], [1, 1]]);
assert.equal(fourLayout[0].scale, 0.52);
assert.equal(JSON.stringify(monsters), originalMonsters);
assert.equal(facade.getCombatMonsterLayout(null).length, 0);

conversions = 0;
const numericInput = { [Symbol.toPrimitive]() { conversions += 1; return "320"; } };
facade.getProjectionProfile(numericInput, 568);
assert.equal(conversions, 1);

const ordinary = { name: "ゾンビ", spriteType: "zombie", hp: 32 };
const strong = { name: "フラック", spriteType: "flack", hp: 90, isRare: true };
const guardian = { name: "デーモンガード", spriteType: "flack", hp: 180, isBoss: true, isMidboss: true };
for (const [width, height] of [[390, 844], [320, 568], [400, 260], [320, 220]]) {
  const profile = facade.getProjectionProfile(width, height);
  for (const enemies of [[strong], [guardian], [ordinary, strong, guardian], [guardian, strong, ordinary, ordinary]]) {
    const layout = facade.getCombatMonsterLayout(enemies, profile);
    for (const entry of layout) {
      const presentation = getEnemyPresentation(entry.monster);
      if (!presentation.combatRole) continue;
      const { hitRegion, floorY, visualScale, slotWidth, cx, hpY } = entry;
      assert.ok(hpY >= 49, "room above the sprite for name and telegraph");
      assert.ok(floorY <= height - 8, "feet stay in the viewport");
      assert.ok(presentation.maxWidth * visualScale < slotWidth, "silhouette stays in its slot");
      assert.equal(hitRegion.centerX, cx);
      assert.equal(hitRegion.centerY, floorY - presentation.maxHeight * visualScale / 2);
      assert.ok(hitRegion.height >= presentation.maxHeight * visualScale, "tap region covers actual scaled body height");
      assert.ok(hitRegion.x >= cx - slotWidth / 2 && hitRegion.x + hitRegion.width <= cx + slotWidth / 2);
      assert.equal(facade.getCombatMonsterLayout(enemies, profile).find(other => other.monsterIndex === entry.monsterIndex).visualScale, visualScale);
    }
  }
  const soloStrong = facade.getCombatMonsterLayout([strong], profile)[0];
  const soloGuardian = facade.getCombatMonsterLayout([guardian], profile)[0];
  assert.equal(soloGuardian.cx, width / 2);
  assert.ok(soloGuardian.visualScale > soloStrong.visualScale, "guardian dominates the solo composition");
  const regular = facade.getCombatMonsterLayout([ordinary], profile)[0];
  const presentation = getEnemyPresentation(ordinary);
  assert.equal(regular.floorY, height * 0.56 + 30);
  assert.equal(regular.visualScale, Math.min(presentation.scale, regular.floorY * 0.94 / presentation.maxHeight, width * 0.82 / presentation.maxWidth));
}
const deadRoleLayout = facade.getCombatMonsterLayout([{ ...guardian, hp: 0 }, strong]);
assert.deepEqual(deadRoleLayout.map(entry => entry.monsterIndex), [1]);

console.log("[PASS] renderer projection owner/facade runtime and legacy contracts verified");
