// Enemy spell damage scales with the caster's attack (#2064), so a later
// dungeon's casters are as dangerous for a fresh adventurer as the mine's.
import { strict as assert } from "node:assert";
import {
  ENEMY_SPELL_ATTACK_SCALE,
  getAttackScaledDamageRange,
  rollAttackScaledDamage
} from "../../../src/rules/enemy_spell_damage.js";

// Where the mine and the catacomb meet these spells, the old fixed rolls hold.
assert.deepEqual(getAttackScaledDamageRange(13, ENEMY_SPELL_ATTACK_SCALE.LAHALITO), { min: 10, max: 23 });
assert.deepEqual(getAttackScaledDamageRange(12, ENEMY_SPELL_ATTACK_SCALE.CRUSH_STRIKE), { min: 18, max: 32 });

// A weaker caster deals less, a stronger one more; never below 1.
for (const scale of Object.values(ENEMY_SPELL_ATTACK_SCALE)) {
  const weak = getAttackScaledDamageRange(6, scale);
  const strong = getAttackScaledDamageRange(20, scale);
  assert.ok(weak.max < strong.max && weak.min < strong.min);
  assert.ok(getAttackScaledDamageRange(0, scale).min >= 1);
  // Every roll stays inside its range.
  for (const roll of [0, 0.5, 0.999]) {
    const damage = rollAttackScaledDamage(20, scale, () => roll);
    assert.ok(damage >= strong.min && damage <= strong.max);
  }
}

console.log("[PASS] enemy spell damage scales with the caster's attack");
