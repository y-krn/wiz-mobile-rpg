import assert from "assert";
import {
  ENEMY_ARCHETYPES,
  ENEMY_RECIPE_KEYS,
  ENEMY_UNIQUE_ASSETS,
  ENEMY_UNIQUE_RECIPES,
  getEnemyArchetype,
  getEnemyPresentation,
  getEnemyRecipeKey
} from "../../../src/enemy_presentation.js";
import { ENEMY_RECIPE_PALETTES } from "../../../src/enemy_presentation_palette.js";
import assertStrict from "node:assert/strict";
import * as facade from "../../../src/enemy_presentation.js";
import * as owner from "../../../src/enemy_presentation.ts";

const exportNames = ["ENEMY_ARCHETYPES", "ENEMY_RECIPE_KEYS", "ENEMY_UNIQUE_ASSETS", "ENEMY_UNIQUE_RECIPES", "getEnemyArchetype", "getEnemyPresentation", "getEnemyRecipeKey"];
assertStrict.deepEqual(Object.keys(facade), exportNames);
assertStrict.deepEqual(Object.keys(owner), exportNames);
for (const name of exportNames) assertStrict.strictEqual(facade[name], owner[name], `${name} facade identity`);
assertStrict.strictEqual(ENEMY_UNIQUE_ASSETS, ENEMY_UNIQUE_RECIPES);

const expectedRecipeKeys = [
  ["flashBat", "flash-bat"], ["powderBat", "powder-bat"], ["biter", "biter"],
  ["mudSlime", "mud-slime"], ["splitSlime", "split-slime"], ["ratPack", "rat-pack"],
  ["sleepSpore", "sleep-spore"], ["mudCursedChild", "mud-cursed-child"],
  ["koboldScout", "kobold-scout"], ["goblinCaster", "goblin-caster"],
  ["rustedShield", "rusted-shield"], ["small", "small"], ["humanoid", "humanoid"],
  ["brute", "brute"], ["caster", "caster"], ["boss", "boss"]
];
assertStrict.deepEqual(Object.entries(ENEMY_RECIPE_KEYS), expectedRecipeKeys);

const expectedProfiles = [
  ["small", [150, 100, 150, 170, 0.55, "small", "small"]],
  ["humanoid", [136, 190, 183, 256, 0.75, "humanoid", "humanoid"]],
  ["brute", [170, 210, 170, 256, 0.82, "brute", "brute"]],
  ["caster", [150, 182, 150, 256, 0.72, "caster", "caster"]],
  ["boss", [190, 220, 210, 256, 0.82, "boss", "boss"]]
];
assertStrict.deepEqual(Object.keys(ENEMY_ARCHETYPES), expectedProfiles.map(([key]) => key));
assertStrict.equal(Object.isFrozen(ENEMY_RECIPE_KEYS), true);
assertStrict.equal(Object.isFrozen(ENEMY_ARCHETYPES), true);
for (const [key, values] of expectedProfiles) {
  const profile = ENEMY_ARCHETYPES[key];
  assertStrict.equal(Object.isFrozen(profile), true, `${key} profile freeze`);
  assertStrict.deepEqual(Object.keys(profile), ["width", "height", "maxWidth", "maxHeight", "scale", "label", "recipe"]);
  assertStrict.deepEqual([profile.width, profile.height, profile.maxWidth, profile.maxHeight, profile.scale, profile.label, profile.recipe], values);
}

const expectedUniqueRecipes = [
  ["フラッシュバット", "flash-bat"], ["火薬コウモリ", "powder-bat"], ["かみつき蟲", "biter"],
  ["マッドスライム", "mud-slime"], ["分裂スライム", "split-slime"], ["群れネズミ", "rat-pack"],
  ["まどろみ胞子", "sleep-spore"], ["泥の呪い子", "mud-cursed-child"],
  ["コボルトの斥候", "kobold-scout"], ["ゴブリンの呪術師", "goblin-caster"],
  ["錆びた盾兵", "rusted-shield"]
];
assertStrict.deepEqual(Object.entries(ENEMY_UNIQUE_RECIPES), expectedUniqueRecipes);
assertStrict.equal(Object.isFrozen(ENEMY_UNIQUE_RECIPES), true);

assertStrict.equal(getEnemyArchetype({ isBoss: true, name: "ジャイアント", spriteType: "mage" }), "boss");
assertStrict.equal(getEnemyArchetype({ name: "巨躯", spriteType: "mage" }), "brute");
assertStrict.equal(getEnemyArchetype({ spriteType: "mage", tags: ["dragon"] }), "caster");
assertStrict.equal(getEnemyArchetype({ spriteType: "biter", spell: "HALITO" }), "caster");
assertStrict.equal(getEnemyArchetype({ spriteType: "kobold", spell: "HALITO" }), "caster");
assertStrict.equal(getEnemyArchetype({ spriteType: "unknown", tags: ["demon"] }), "brute");
assertStrict.equal(getEnemyArchetype({ tags: ["dragon"] }), "brute");
assertStrict.equal(getEnemyArchetype({ name: 42, spriteType: "dragon" }), "boss");
assertStrict.equal(getEnemyArchetype({ name: "plain", spriteType: 42 }), "small");

const uniquePresentation = getEnemyPresentation({ name: "フラッシュバット" });
assertStrict.deepEqual(Object.keys(uniquePresentation), ["width", "height", "maxWidth", "maxHeight", "scale", "label", "recipe", "archetype", "assetKey", "asset", "uniqueName"]);
assertStrict.deepEqual([uniquePresentation.width, uniquePresentation.height, uniquePresentation.maxWidth, uniquePresentation.maxHeight, uniquePresentation.scale], [140, 125, 140, 125, 1]);
assertStrict.equal(uniquePresentation.label, "flash-bat");
assertStrict.equal(uniquePresentation.assetKey, "recipe:flash-bat");
assertStrict.equal(uniquePresentation.asset, null);
assertStrict.equal(uniquePresentation.uniqueName, "フラッシュバット");
assertStrict.equal(getEnemyPresentation({ name: "フラッシュバットの分裂体2" }).uniqueName, "フラッシュバット");
const fallbackPresentation = getEnemyPresentation({ name: "unknown", spriteType: "orc" });
assertStrict.equal(fallbackPresentation.width, ENEMY_ARCHETYPES.humanoid.width);
assertStrict.equal(fallbackPresentation.height, ENEMY_ARCHETYPES.humanoid.height);
assertStrict.equal(fallbackPresentation.recipe, ENEMY_RECIPE_KEYS.humanoid);
assertStrict.equal(fallbackPresentation.assetKey, `recipe:${ENEMY_RECIPE_KEYS.humanoid}`);
assertStrict.equal(fallbackPresentation.asset, null);
assertStrict.equal(fallbackPresentation.uniqueName, null);
const input = Object.freeze({ name: "unknown", spriteType: "biter" });
const firstReturn = getEnemyPresentation(input);
const secondReturn = getEnemyPresentation(input);
assertStrict.notStrictEqual(firstReturn, secondReturn);
assertStrict.equal(Object.isFrozen(firstReturn), false);
firstReturn.width = 1;
assertStrict.equal(secondReturn.width, 150);
assertStrict.equal(input.name, "unknown");

let nameReads = 0;
assertStrict.equal(getEnemyPresentation({ get name() { nameReads += 1; return "unknown"; } }).uniqueName, null);
assertStrict.equal(nameReads, 4, "name is read twice during archetype selection and twice during unique lookup");
const getterFailure = new Error("name getter failure");
assertStrict.throws(() => getEnemyPresentation({ get name() { throw getterFailure; } }), error => error === getterFailure);
const includesFailure = new Error("includes failure");
assertStrict.throws(() => getEnemyArchetype({ traits: { includes() { throw includesFailure; } } }), error => error === includesFailure);

assert.equal(getEnemyArchetype({ spriteType: "biter" }), "small");
assert.equal(getEnemyArchetype({ spriteType: "kobold" }), "humanoid");
assert.equal(getEnemyArchetype({ spriteType: "mage" }), "caster");
assert.equal(getEnemyArchetype({ name: "石像兵", spriteType: "zombie" }), "brute");
assert.equal(getEnemyArchetype({ name: "デーモンガード", isBoss: true }), "boss");
assert.equal(getEnemyArchetype({ spriteType: "dragon" }), "boss");

for (const presentation of Object.values(ENEMY_ARCHETYPES)) {
  assert.equal(presentation.asset, null, "production registry has no enemy texture URL");
  assert.ok(presentation.maxWidth <= 256 && presentation.maxHeight <= 256, "recipe stays bounded for mobile");
  assert.ok(presentation.scale > 0 && presentation.scale <= 1, "recipe has a bounded display scale");
  assert.ok(presentation.recipe, "fallback has a procedural recipe");
}

assert.equal(Object.keys(ENEMY_UNIQUE_RECIPES).length, 11);
assert.equal(new Set(Object.values(ENEMY_UNIQUE_RECIPES)).size, 11, "each named enemy has a distinct recipe");
assert.equal(Object.keys(ENEMY_RECIPE_PALETTES).length, Object.keys(ENEMY_RECIPE_KEYS).length);
for (const recipe of Object.values(ENEMY_RECIPE_KEYS)) {
  const palette = ENEMY_RECIPE_PALETTES[recipe];
  assert.ok(palette, `palette exists for ${recipe}`);
  for (const field of ["main", "secondary", "rim", "accent", "material", "dark"]) {
    assert.equal(typeof palette[field], "number", `${recipe} palette has ${field}`);
  }
}
assert.ok(new Set(Object.values(ENEMY_UNIQUE_RECIPES).map(recipe => ENEMY_RECIPE_PALETTES[recipe].main)).size >= 7, "named enemies are not universal cyan-bodied pieces");
assert.equal(ENEMY_RECIPE_PALETTES[ENEMY_RECIPE_KEYS.flashBat].main, 0x274147);
assert.equal(ENEMY_RECIPE_PALETTES[ENEMY_RECIPE_KEYS.powderBat].material, 0x865b43);
assert.equal(ENEMY_RECIPE_PALETTES[ENEMY_RECIPE_KEYS.ratPack].main, 0x4b4139);
for (const [name, recipe] of Object.entries(ENEMY_UNIQUE_RECIPES)) {
  const presentation = getEnemyPresentation({ name });
  assert.equal(presentation.recipe, recipe);
  assert.equal(presentation.assetKey, `recipe:${recipe}`);
  assert.equal(presentation.asset, null);
}

assert.equal(getEnemyRecipeKey({ name: "フラッシュバット", spriteType: "bat" }), ENEMY_RECIPE_KEYS.flashBat);
assert.equal(getEnemyRecipeKey({ name: "ゴブリンの呪術師", spriteType: "kobold", spell: "HALITO" }), ENEMY_RECIPE_KEYS.goblinCaster);
assert.equal(getEnemyRecipeKey({ name: "錆びた盾兵", spriteType: "skeleton" }), ENEMY_RECIPE_KEYS.rustedShield);
assert.equal(getEnemyRecipeKey({ name: "分裂スライムの分裂体1", spriteType: "biter" }), ENEMY_RECIPE_KEYS.splitSlime);
assert.equal(getEnemyRecipeKey({ name: "不明な敵", spriteType: "biter" }), ENEMY_RECIPE_KEYS.small);

assert.equal(getEnemyPresentation({ name: "unknown-small" }).recipe, ENEMY_RECIPE_KEYS.small);
assert.equal(getEnemyPresentation({ name: "unknown-humanoid", spriteType: "orc" }).recipe, ENEMY_RECIPE_KEYS.humanoid);
assert.equal(getEnemyPresentation({ name: "unknown-brute", nameHint: "巨躯" }).recipe, ENEMY_RECIPE_KEYS.small);
assert.equal(getEnemyPresentation({ name: "巨躯" }).recipe, ENEMY_RECIPE_KEYS.brute);
assert.equal(getEnemyPresentation({ name: "unknown-caster", spriteType: "mage" }).recipe, ENEMY_RECIPE_KEYS.caster);
assert.equal(getEnemyPresentation({ name: "unknown-boss", isBoss: true }).recipe, ENEMY_RECIPE_KEYS.boss);

console.log("ENEMY PROCEDURAL PRESENTATION TEST PASSED");
