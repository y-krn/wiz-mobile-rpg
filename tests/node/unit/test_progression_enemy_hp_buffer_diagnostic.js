import assert from "node:assert/strict";
import {
  PROGRESSION_ENEMY_HP_BUFFER_ARMS as arms,
  PROGRESSION_ENEMY_HP_BUFFER_CANDIDATE as candidate,
  PROGRESSION_ENEMY_DIAGNOSTIC_CONTEXTS as contexts,
  deriveProgressionEnemyRunSeed,
  resolveProgressionEnemyDiagnosticContext as resolve
} from "../../../scratch/measurements/progression_enemy_hp_buffer_contract.js";
import { createStartingKitCharacter } from "../../../src/state/initial_state.js";
import { getCharDef, getCharMaxHp } from "../../../src/rules/character_stats.js";
import { applyMeasurementPlayerCandidate, resetSimulationRandom } from "../../../scratch/simulations/sim_depth_material_ev.js";
import { applyProductionDiagnosticLevelDelta } from "../../../scratch/measurements/progression_enemy_candidate_level.js";

assert.deepEqual(arms.map(arm => arm.id), ["v1", "hp-plus-one-capped"]);
assert.deepEqual([0, 1, 2, 3, 4, 5].map(baseline => arms[0].hpBuffer(baseline)), [0, 0, 0, 0, 0, 0]);
assert.deepEqual([0, 1, 2, 3, 4, 5].map(baseline => arms[1].hpBuffer(baseline)), [0, 1, 1, 1, 1, 1]);
for (const arm of arms) assert.deepEqual([0, 1, 2, 3, 4, 5].map(baseline => arm.rawDefenseBonus(baseline)), [0, 0, 0, 0, 0, 0]);
assert.equal(candidate.playerPhysicalMultiplier(5), 1.8);
assert.equal(candidate.playerSpellMultiplier(5), 1.8);
assert.equal(candidate.playerLevel1MaxHp(0), 20);
assert.equal(candidate.playerLevel1MaxHp(5), 30);
assert.equal(candidate.enemyHpMultiplier(5), 2);
assert.equal(candidate.enemyAttackMultiplier(5), 1.5);
assert.equal(candidate.enemyDefenseMultiplier, 1);

assert.equal(contexts.length, 11);
assert.deepEqual(contexts.map(context => context.floor), [1, 5, 5, 6, 10, 10, 11, 20, 20, 21, 30]);
for (const [milestoneFloor, preBaseline, selectedBaseline, postFloor] of [[15, 2, 3, 16], [25, 4, 5, 26]]) {
  assert.equal(resolve({ kind: "pre-milestone", milestoneFloor, highestEarlierDefeatedMilestone: milestoneFloor - 5 }).baseline, preBaseline);
  assert.equal(resolve({ kind: "selected-deep-start", milestoneFloor, selectedStartFloor: milestoneFloor }).baseline, selectedBaseline);
  assert.equal(resolve({ kind: "post-milestone", milestoneFloor, selectedStartFloor: 1 }).floor, postFloor);
}

for (const baseline of [0, 1, 3, 5]) {
  for (const arm of arms) {
    for (const [kit, fixtureId] of [["vanguard", "physical"], ["arcana", "spell"], ["devotion", "defensive-guard"]]) {
      const character = createStartingKitCharacter(kit);
      const rawDefense = getCharDef(character);
      const targetHp = candidate.playerLevel1MaxHp(baseline) + arm.hpBuffer(baseline);
      const restore = applyMeasurementPlayerCandidate(character, {
        physicalPowerMultiplier: candidate.playerPhysicalMultiplier(baseline),
        spellPowerMultiplier: candidate.playerSpellMultiplier(baseline),
        maxHpTarget: targetHp,
        rawDefenseBonus: arm.rawDefenseBonus(baseline)
      });
      assert.equal(character.maxHp, targetHp, `${fixtureId} ${arm.id} baseline ${baseline} Lv1 HP`);
      assert.equal(getCharDef(character), rawDefense, `${fixtureId} ${arm.id} raw DEF control`);
      const resolvedLv1MaxHp = getCharMaxHp(character);
      assert.equal(applyProductionDiagnosticLevelDelta(character), true);
      assert.equal(character.level, 2);
      assert.equal(character.maxHp, targetHp + 5, `${fixtureId} ${arm.id} Level delta follows the HP buffer`);
      assert.equal(getCharMaxHp(character), resolvedLv1MaxHp + 5);
      restore();
    }
  }
}

const seedContext = { kind: "pre-milestone", floor: 20 };
const pairedSeed = deriveProgressionEnemyRunSeed({ rootSeed: 1696, context: seedContext, fixtureId: "physical", runIndex: 0 });
assert.equal(pairedSeed, deriveProgressionEnemyRunSeed({ rootSeed: 1696, context: seedContext, fixtureId: "physical", runIndex: 0 }));
resetSimulationRandom(pairedSeed);
const firstDraw = Math.random();
resetSimulationRandom(pairedSeed);
assert.equal(Math.random(), firstDraw, "v1 and candidate reset to the same paired RNG stream");
assert.notEqual(pairedSeed, deriveProgressionEnemyRunSeed({ rootSeed: 1696, context: seedContext, fixtureId: "physical", runIndex: 1 }));

console.log("progression enemy HP buffer diagnostic unit tests passed");
