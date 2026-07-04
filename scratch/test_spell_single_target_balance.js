import assert from "assert";
import { SPELL_EFFECTS } from "../src/systems/spell_effects.js";

const caster = { name: "Caster", int: 10, pie: 10, equipment: {} };
const target = { name: "Target", hp: 100, tags: [] };

function damage(spellName, rngValue, nextTarget = target) {
  return SPELL_EFFECTS[spellName]({
    caster,
    target: nextTarget,
    rng: () => rngValue
  }).damage;
}

assert.strictEqual(damage("HALITO", 0), 8, "HALITO minimum should be 8.");
assert.strictEqual(damage("HALITO", 0.999), 18, "HALITO maximum should be 18.");
assert.strictEqual(damage("MAHALITO", 0), 30, "MAHALITO minimum should be 30.");
assert.strictEqual(damage("MAHALITO", 0.999), 50, "MAHALITO maximum should be 50.");
assert.strictEqual(damage("BADIOS", 0), 8, "BADIOS minimum should be 8.");
assert.strictEqual(damage("BADIOS", 0.999), 18, "BADIOS maximum should be 18.");

const undeadDamage = damage("BADIOS", 0.5, { ...target, tags: ["undead"] });
assert.strictEqual(undeadDamage, 20, "BADIOS should keep its undead bonus.");

const mahalitoAvg = (30 + 50) / 2;
const lahalitoAvg = (15 + 35) / 2;
const madaltoAvg = (30 + 60) / 2;

assert(
  mahalitoAvg > lahalitoAvg,
  "MAHALITO should beat LAHALITO against one high-HP target."
);
assert(
  lahalitoAvg * 2 > mahalitoAvg,
  "LAHALITO should remain better against multiple targets."
);
assert(
  mahalitoAvg / 3 > madaltoAvg / 4,
  "MAHALITO should have better single-target MP efficiency than MADALTO."
);

console.log("Single-target spell balance checks passed.");
