import assert from "node:assert/strict";
import {
  PROGRESSION_ENEMY_CANDIDATE as candidate,
  PROGRESSION_ENEMY_DIAGNOSTIC_CONTEXTS,
  deriveProgressionEnemyRunSeed,
  resolveProgressionEnemyDiagnosticContext as resolve
} from "../../../scratch/measurements/progression_enemy_candidate_contract.js";
import { createStartingKitCharacter } from "../../../src/state/initial_state.js";
import { getCharWeaponAtk } from "../../../src/rules/character_stats.js";
import { getItemBaseId } from "../../../src/rules/item_rules.js";
import { getActiveRuneSpellKeys, getEquippedMedium } from "../../../src/rules/magic_rules.js";
import { applyMeasurementPlayerCandidate, resetSimulationRandom } from "../../../scratch/simulations/sim_depth_material_ev.js";

assert.equal(candidate.playerPhysicalMultiplier(0), 1);
assert.equal(candidate.playerPhysicalMultiplier(5), 1.8);
assert.equal(candidate.playerSpellMultiplier(5), 1.8);
assert.equal(candidate.playerLevel1MaxHp(0), 20);
assert.equal(candidate.playerLevel1MaxHp(5), 30);
assert.equal(candidate.playerRawDefenseMilestoneBonus, 0);
assert.equal(candidate.enemyHpMultiplier(5), 2);
assert.equal(candidate.enemyAttackMultiplier(5), 1.5);
assert.equal(candidate.enemyDefenseMultiplier, 1);

assert.deepEqual(resolve({
  kind: "pre-milestone",
  milestoneFloor: 10,
  selectedStartFloor: 1,
  highestEarlierDefeatedMilestone: 5
}), { kind: "pre-milestone", floor: 10, baseline: 1, enemyBand: 2 });
assert.deepEqual(resolve({
  kind: "pre-milestone",
  milestoneFloor: 10,
  selectedStartFloor: 20,
  highestEarlierDefeatedMilestone: 5
}), { kind: "pre-milestone", floor: 10, baseline: 4, enemyBand: 2 });
assert.deepEqual(resolve({
  kind: "pre-milestone",
  milestoneFloor: 10,
  selectedStartFloor: 1,
  highestEarlierDefeatedMilestone: 5
}), { kind: "pre-milestone", floor: 10, baseline: 1, enemyBand: 2 }, "floor entry alone does not grant B10 entitlement");
assert.deepEqual(resolve({ kind: "b1-start", selectedStartFloor: 30 }), {
  kind: "b1-start", floor: 1, baseline: 0, enemyBand: 0
});
assert.deepEqual(resolve({ kind: "b30-reference" }), {
  kind: "b30-reference", floor: 30, baseline: 5, enemyBand: 5
});

for (const [milestoneFloor, preBaseline, selectedBaseline, postFloor] of [
  [5, 0, 1, 6], [10, 1, 2, 11], [15, 2, 3, 16], [20, 3, 4, 21], [25, 4, 5, 26]
]) {
  const earlier = milestoneFloor <= 5 ? null : milestoneFloor - 5;
  const pre = resolve({ kind: "pre-milestone", milestoneFloor, highestEarlierDefeatedMilestone: earlier });
  assert.equal(pre.baseline, preBaseline, `B${milestoneFloor} pre baseline`);
  assert.equal(pre.enemyBand, milestoneFloor / 5, `B${milestoneFloor} band`);
  const selected = resolve({ kind: "selected-deep-start", milestoneFloor, selectedStartFloor: milestoneFloor });
  assert.equal(selected.baseline, selectedBaseline, `B${milestoneFloor} selected baseline`);
  assert.equal(selected.level, 1);
  const post = resolve({ kind: "post-milestone", milestoneFloor, selectedStartFloor: 1 });
  assert.equal(post.floor, postFloor, `B${milestoneFloor} post floor`);
  assert.equal(post.baseline, selectedBaseline, `B${milestoneFloor} post baseline`);
}
assert.equal(PROGRESSION_ENEMY_DIAGNOSTIC_CONTEXTS.length, 11);
assert.throws(() => resolve({ kind: "selected-deep-start", milestoneFloor: 15, selectedStartFloor: 1 }), /must match/);

const seedContext = { kind: "pre-milestone", floor: 10 };
const pairSeed = deriveProgressionEnemyRunSeed({ rootSeed: 1688, context: seedContext, fixtureId: "physical", runIndex: 7 });
assert.equal(pairSeed, deriveProgressionEnemyRunSeed({ rootSeed: 1688, context: seedContext, fixtureId: "physical", runIndex: 7 }));
assert.notEqual(pairSeed, deriveProgressionEnemyRunSeed({ rootSeed: 1688, context: seedContext, fixtureId: "physical", runIndex: 8 }));
resetSimulationRandom(pairSeed);
const pairStream = Math.random();
resetSimulationRandom(pairSeed);
assert.equal(Math.random(), pairStream, "paired current/candidate arms share the same run stream");
resetSimulationRandom(deriveProgressionEnemyRunSeed({ rootSeed: 1688, context: seedContext, fixtureId: "physical", runIndex: 8 }));
assert.notEqual(Math.random(), pairStream, "different runIndex derives a distinct combat RNG stream");

const fighter = createStartingKitCharacter("vanguard");
const fighterBaseId = getItemBaseId(fighter.equipment.weapon);
assert.equal(typeof fighter.equipment.weapon, "string", "starting weapon slot is an item ID");
const baseWeaponAtk = getCharWeaponAtk(fighter);
const restoreFighter = applyMeasurementPlayerCandidate(fighter, { physicalPowerMultiplier: 1.16 });
assert.deepEqual(fighter.equipment.weapon.baseId, fighterBaseId);
assert.equal(fighter.equipment.weapon.identified, true);
assert.equal(getItemBaseId(fighter.equipment.weapon), fighterBaseId);
assert.equal(getCharWeaponAtk(fighter), baseWeaponAtk + Math.round(baseWeaponAtk * 0.16));
restoreFighter();

const mage = createStartingKitCharacter("arcana");
const restoreMage = applyMeasurementPlayerCandidate(mage, { physicalPowerMultiplier: 1.16, spellPowerMultiplier: 1.16 });
assert.equal(mage.equipment.weapon.baseId, "WAND");
assert.equal(getEquippedMedium(mage)?.id, "WAND");
assert.deepEqual(getActiveRuneSpellKeys(mage), ["HALITO"]);
restoreMage();

console.log("progression enemy candidate diagnostic unit tests passed");
