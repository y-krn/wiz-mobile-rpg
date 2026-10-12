import assert from "node:assert/strict";
import { MONSTERS } from "../../../src/data/monsters.js";
import { getEnemyRecipeKey, ENEMY_RECIPE_KEYS } from "../../../src/enemy_presentation.js";

const facade = await import("../../../src/enemy_presentation_palette.js");
const owner = await import("../../../src/enemy_presentation_palette.ts");
assert.deepEqual(Object.keys(facade), ["ENEMY_RECIPE_PALETTES"]);
assert.deepEqual(Object.keys(owner), ["ENEMY_RECIPE_PALETTES"]);
assert.strictEqual(facade.ENEMY_RECIPE_PALETTES, owner.ENEMY_RECIPE_PALETTES);
const palettes = owner.ENEMY_RECIPE_PALETTES;
const fields = ["main", "secondary", "rim", "accent", "material", "dark"];
assert.equal(Object.isFrozen(palettes), true);
for (const recipe of [...MONSTERS.map(getEnemyRecipeKey), ...Object.values(ENEMY_RECIPE_KEYS)]) {
  const palette = palettes[recipe];
  assert.ok(palette, `${recipe} palette exists`);
  assert.equal(Object.isFrozen(palette), true);
  assert.deepEqual(Object.keys(palette), fields);
  for (const field of fields) {
    assert.ok(Number.isInteger(palette[field]) && palette[field] >= 0 && palette[field] <= 0xffffff, `${recipe}.${field} RGB`);
  }
  assert.notEqual(palette.main, palette.secondary, `${recipe} has separate shade planes`);
  assert.notEqual(palette.main, palette.dark, `${recipe} body remains visible`);
}
assert.equal(palettes["flash-bat"].main, 0x486ca4);
assert.equal(palettes["powder-bat"].main, 0x8a5655);
assert.equal(palettes["demon-guard"].material, 0xc39c68);
assert.notDeepEqual(palettes.flack, palettes["demon-guard"]);
assert.ok(new Set(MONSTERS.map(monster => palettes[getEnemyRecipeKey(monster)].main)).size > 60, "species retain material identity");
assert.equal(palettes["missing-recipe"], undefined);
console.log("ENEMY PRESENTATION PALETTE CONTRACT TEST PASSED");
