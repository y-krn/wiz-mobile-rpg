import assert from "assert";
import { ENEMY_ARCHETYPES, ENEMY_UNIQUE_ASSETS, getEnemyArchetype, getEnemyPresentation } from "../../../src/enemy_presentation.js";

assert.equal(getEnemyArchetype({ spriteType: "biter" }), "small");
assert.equal(getEnemyArchetype({ spriteType: "kobold" }), "humanoid");
assert.equal(getEnemyArchetype({ spriteType: "mage" }), "caster");
assert.equal(getEnemyArchetype({ name: "石像兵", spriteType: "zombie" }), "brute");
assert.equal(getEnemyArchetype({ name: "デーモンガード", isBoss: true }), "boss");
assert.equal(getEnemyArchetype({ spriteType: "dragon" }), "boss");

for (const [archetype, presentation] of Object.entries(ENEMY_ARCHETYPES)) {
  assert.ok(presentation.asset.endsWith(`${archetype}.webp`), `${archetype} uses a local transparent asset`);
  assert.ok(presentation.maxWidth <= 256 && presentation.maxHeight <= 256, `${archetype} stays bounded for mobile`);
  assert.ok(presentation.scale > 0 && presentation.scale <= 1, `${archetype} has a bounded display scale`);
}

assert.equal(getEnemyPresentation({ spriteType: "orc" }).archetype, "humanoid");
assert.equal(getEnemyPresentation({ spell: "LAHALITO" }).archetype, "caster");
assert.equal(getEnemyPresentation({ name: "フラッシュバット", spriteType: "bat" }).assetKey, "enemy:フラッシュバット");
assert.ok(getEnemyPresentation({ name: "フラッシュバット", spriteType: "bat" }).asset.endsWith("flash-bat.png"));
assert.equal(Object.keys(ENEMY_UNIQUE_ASSETS).length, 11);
console.log("ENEMY PRESENTATION TEST PASSED");
