import assert from "node:assert/strict";
import {
  PROGRESSION_ENEMY_DEFENSE_ARMS,
  PROGRESSION_ENEMY_DEFENSE_CANDIDATE as candidate,
  PROGRESSION_ENEMY_DIAGNOSTIC_CONTEXTS,
  deriveProgressionEnemyRunSeed,
  resolveProgressionEnemyDiagnosticContext
} from "../../../scratch/measurements/progression_enemy_defense_contract.js";
import { createStartingKitCharacter } from "../../../src/state/initial_state.js";
import { getCharDef, getPhysicalDefenseResistance, PHYSICAL_DEF_RESISTANCE_SCALE_INCOMING } from "../../../src/rules/character_stats.js";
import { getItemBaseId } from "../../../src/rules/item_rules.js";
import { applyMeasurementPlayerCandidate } from "../../../scratch/simulations/sim_depth_material_ev.js";
import { applyProductionDiagnosticLevelDelta } from "../../../scratch/measurements/progression_enemy_candidate_level.js";

assert.deepEqual(PROGRESSION_ENEMY_DEFENSE_ARMS.map(arm => arm.id), ["v1", "def-plus-one"]);
assert.equal(PROGRESSION_ENEMY_DEFENSE_ARMS[0].rawDefenseBonus(5), 0);
assert.equal(PROGRESSION_ENEMY_DEFENSE_ARMS[1].rawDefenseBonus(5), 5);
assert.equal(candidate.playerPhysicalMultiplier(5), 1.8);
assert.equal(candidate.playerSpellMultiplier(5), 1.8);
assert.equal(candidate.playerLevel1MaxHp(5), 30);
assert.equal(candidate.enemyHpMultiplier(5), 2);
assert.equal(candidate.enemyAttackMultiplier(5), 1.5);
assert.equal(candidate.enemyDefenseMultiplier, 1);
assert.equal(PROGRESSION_ENEMY_DIAGNOSTIC_CONTEXTS.length, 11);
for (const [milestoneFloor, preBaseline, selectedBaseline, postFloor] of [[15, 2, 3, 16], [25, 4, 5, 26]]) {
  assert.equal(resolveProgressionEnemyDiagnosticContext({
    kind: "pre-milestone", milestoneFloor, highestEarlierDefeatedMilestone: milestoneFloor - 5
  }).baseline, preBaseline);
  assert.equal(resolveProgressionEnemyDiagnosticContext({
    kind: "selected-deep-start", milestoneFloor, selectedStartFloor: milestoneFloor
  }).baseline, selectedBaseline);
  assert.equal(resolveProgressionEnemyDiagnosticContext({
    kind: "post-milestone", milestoneFloor, selectedStartFloor: 1
  }).floor, postFloor);
}

const context = { kind: "pre-milestone", floor: 20 };
const pairedSeed = deriveProgressionEnemyRunSeed({ rootSeed: 1690, context, fixtureId: "defensive-guard", runIndex: 0 });
assert.equal(pairedSeed, deriveProgressionEnemyRunSeed({ rootSeed: 1690, context, fixtureId: "defensive-guard", runIndex: 0 }));

for (const arm of PROGRESSION_ENEMY_DEFENSE_ARMS) {
  const character = createStartingKitCharacter("devotion");
  const armorBaseId = getItemBaseId(character.equipment.armor);
  const shieldBaseId = getItemBaseId(character.equipment.shield);
  const baseDefense = getCharDef(character);
  const bonus = arm.rawDefenseBonus(3);
  const restore = applyMeasurementPlayerCandidate(character, {
    physicalPowerMultiplier: candidate.playerPhysicalMultiplier(3),
    spellPowerMultiplier: candidate.playerSpellMultiplier(3),
    maxHpTarget: candidate.playerLevel1MaxHp(3),
    rawDefenseBonus: bonus
  });
  assert.equal(getCharDef(character), baseDefense + bonus);
  assert.equal(getPhysicalDefenseResistance(
    getCharDef(character), PHYSICAL_DEF_RESISTANCE_SCALE_INCOMING
  ), (baseDefense + bonus) / (baseDefense + bonus + 4));
  assert.equal(getItemBaseId(character.equipment.armor), armorBaseId);
  assert.equal(getItemBaseId(character.equipment.shield), shieldBaseId);
  if (typeof character.equipment.armor === "object") {
    assert.equal(character.equipment.armor.baseId, armorBaseId);
  }
  restore();
  assert.equal(getCharDef(character), baseDefense);
}

const levelCharacter = createStartingKitCharacter("devotion");
assert.equal(levelCharacter.level, 1);
assert.equal(applyProductionDiagnosticLevelDelta(levelCharacter), true);
assert.equal(levelCharacter.level, 2);

console.log("progression enemy defensive baseline unit tests passed");
