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
import {
  DEFAULT_SEED,
  FIXTURES,
  POLICY_VERSION,
  RUNNER_VERSION,
  isPlayerBeforeAnyEnemy,
  runProgressionEnemyCandidateDiagnostic
} from "../../../scratch/measurements/progression_enemy_candidate_diagnostic.js";

assert.equal(candidate.playerPhysicalMultiplier(0), 1);
assert.equal(candidate.playerPhysicalMultiplier(5), 1.8);
assert.equal(candidate.playerSpellMultiplier(5), 1.8);
assert.equal(candidate.playerLevel1MaxHp(0), 20);
assert.equal(candidate.playerLevel1MaxHp(5), 30);
assert.equal(candidate.playerRawDefenseMilestoneBonus, 0);
assert.equal(candidate.enemyHpMultiplier(5), 2);
assert.equal(candidate.enemyAttackMultiplier(5), 1.5);
assert.equal(candidate.enemyDefenseMultiplier, 1);
assert.equal(DEFAULT_SEED, 1700);
assert.equal(RUNNER_VERSION, "progression-enemy-candidate-diagnostic-v2");
assert.equal(POLICY_VERSION, "phase4b-progression-enemy-simulation-policy-v2");
assert.deepEqual(FIXTURES.map(({ id, className, startingKit, actionPlan }) => [id, className, startingKit, actionPlan || null]), [
  ["physical", "Fighter", "vanguard", null],
  ["spell", "Mage", "arcana", null],
  ["defensive", "Priest", "devotion", "attack-only"]
]);

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

for (let baseline = 1; baseline <= 5; baseline++) {
  const fighter = createStartingKitCharacter("vanguard");
  const fighterBaseId = getItemBaseId(fighter.equipment.weapon);
  assert.equal(typeof fighter.equipment.weapon, "string", "starting weapon slot is an item ID");
  const baseWeaponAtk = getCharWeaponAtk(fighter);
  const physicalMultiplier = candidate.playerPhysicalMultiplier(baseline);
  const restoreFighter = applyMeasurementPlayerCandidate(fighter, { physicalPowerMultiplier: physicalMultiplier });
  assert.equal(fighter.equipment.weapon.baseId, fighterBaseId);
  assert.equal(fighter.equipment.weapon.identified, true);
  assert.equal(getItemBaseId(fighter.equipment.weapon), fighterBaseId);
  const expectedAtk = baseWeaponAtk * physicalMultiplier;
  assert.ok(Math.abs(getCharWeaponAtk(fighter) - expectedAtk) < 1e-10, `baseline ${baseline} retains fractional ATK multiplier`);
  assert.ok(Math.abs(getCharWeaponAtk(fighter) / baseWeaponAtk - physicalMultiplier) < 1e-12);
  restoreFighter();
}

const mage = createStartingKitCharacter("arcana");
const restoreMage = applyMeasurementPlayerCandidate(mage, { physicalPowerMultiplier: 1.16, spellPowerMultiplier: 1.16 });
assert.equal(mage.equipment.weapon.baseId, "WAND");
assert.equal(getEquippedMedium(mage)?.id, "WAND");
assert.deepEqual(getActiveRuneSpellKeys(mage), ["HALITO"]);
restoreMage();

assert.equal(isPlayerBeforeAnyEnemy([{
  playerActionExecutionTiming: "player-before-any-enemy",
  playerActionExecuted: true,
  killEvents: [{ targetName: "first-strike kill" }],
  enemyActionEvents: []
}]), true, "player-first kill remains true with zero enemy actions");
assert.equal(isPlayerBeforeAnyEnemy([{
  playerActionExecutionTiming: "after-enemy-action",
  enemyActionEvents: []
}]), false);

const smoke = await runProgressionEnemyCandidateDiagnostic({ runs: 1, seed: DEFAULT_SEED });
assert.equal(smoke.runnerVersion, RUNNER_VERSION);
assert.equal(smoke.policyVersion, POLICY_VERSION);
assert.equal(smoke.schemaVersion, 2);
assert.equal(smoke.observations.length, 132);
assert.equal(smoke.summary.length, 132);
assert.deepEqual(smoke.configuration.arms, ["current", "candidate"]);
assert.equal(smoke.configuration.seed, 1700);
assert.equal(smoke.configuration.phase4cV1.rawDefenseBonus, 0);
assert.equal(smoke.configuration.phase4cV1.hpBuffer, 0);
assert.equal(smoke.configuration.guardPolicy, "situational only; excluded from generic defensive viability");
assert.deepEqual(PROGRESSION_ENEMY_DIAGNOSTIC_CONTEXTS.map(context => context.floor), [1, 5, 5, 6, 10, 10, 11, 20, 20, 21, 30]);
assert.equal(PROGRESSION_ENEMY_DIAGNOSTIC_CONTEXTS.some(context => [15, 25].includes(context.floor)), false);
for (const context of PROGRESSION_ENEMY_DIAGNOSTIC_CONTEXTS) for (const level of [1, 2]) {
  const paired = smoke.observations.filter(row => row.contextId === `${context.kind}-B${context.floor}` && row.level === level);
  assert.equal(paired.length, 6);
  assert.equal(new Set(paired.map(row => row.seed)).size, 3, "fixture/run pair seeds remain arm-independent");
  for (const fixtureId of ["physical", "spell", "defensive"]) {
    const fixtureRows = paired.filter(row => row.fixtureId === fixtureId);
    assert.equal(fixtureRows.length, 2);
    assert.equal(fixtureRows[0].seed, fixtureRows[1].seed, "current and candidate share seed");
  }
  for (const row of paired.filter(entry => entry.fixtureId === "defensive")) {
    assert.equal(row.selectedActions.defend, 0);
    assert.equal(row.executedActions.defend, 0);
  }
  assert.equal(paired.filter(row => row.level === 2).every(row => row.levelSource.includes("production EXP_LEVELS[2]")), true);
}
for (const context of PROGRESSION_ENEMY_DIAGNOSTIC_CONTEXTS) for (const fixtureId of ["physical", "spell", "defensive"]) {
  const level1 = smoke.observations.find(row => row.contextId === `${context.kind}-B${context.floor}` && row.level === 1 && row.fixtureId === fixtureId && row.arm === "current");
  const level2 = smoke.observations.find(row => row.contextId === `${context.kind}-B${context.floor}` && row.level === 2 && row.fixtureId === fixtureId && row.arm === "current");
  assert.equal(level1.seed, level2.seed, "paired seed excludes Level");
}

console.log("progression enemy candidate diagnostic unit tests passed");
