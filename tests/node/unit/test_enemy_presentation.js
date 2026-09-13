import assert from "assert";
import {
  ENEMY_ARCHETYPES,
  ENEMY_RECIPE_KEYS,
  ENEMY_UNIQUE_RECIPES,
  getEnemyArchetype,
  getEnemyPresentation,
  getEnemyRecipeKey
} from "../../../src/enemy_presentation.js";

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
