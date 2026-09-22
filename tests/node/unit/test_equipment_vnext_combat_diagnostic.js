import assert from "node:assert/strict";
import fs from "node:fs";
import { resolve } from "node:path";

import {
  ARMOR_CANDIDATES,
  DEPTHS,
  LOAD_INITIATIVE_CANDIDATES,
  LOAD_FIXTURES,
  RUNE_ACTION,
  REPRESENTATIVE_CONDITIONS,
  SHIELD_CANDIDATES,
  THRESHOLD_FIXTURES,
  WEAPON_CANDIDATES,
  buildReport,
  buildSummary,
  comparisonGroupForCondition,
  comparisonRunSeed,
  formulaTable,
  resolveEffectiveTempoModifier,
  resolveFormula,
  resolveVNextLoadCandidate,
  runEquipmentVNextCombatDiagnostic,
  simulateOne
} from "../../../scratch/measurements/equipment_vnext_combat_diagnostic.js";
import { getCombatTierForStartFloor } from "../../../src/rules/combat_tier.js";
import { MEASUREMENT_IDS, resolveRunnerInvocation } from "../../../scratch/measurements/run_balance_measurement.js";

assert.deepEqual(DEPTHS.map(getCombatTierForStartFloor), [0, 1, 2, 4, 5]);
assert.deepEqual(Object.keys(WEAPON_CANDIDATES), ["dagger", "sword", "mace", "greatsword", "wand", "staff"]);
assert.equal(formulaTable().length, DEPTHS.length * Object.keys(WEAPON_CANDIDATES).length);
assert.ok(resolveFormula({ weaponId: "dagger", depth: 1 }).expectedDamage < resolveFormula({ weaponId: "sword", depth: 1 }).expectedDamage);
const maceNormalFormula = resolveFormula({ weaponId: "mace", depth: 5, defense: "normal" });
const maceHighFormula = resolveFormula({ weaponId: "mace", depth: 5, defense: "high" });
const swordNormalFormula = resolveFormula({ weaponId: "sword", depth: 5, defense: "normal" });
const swordHighFormula = resolveFormula({ weaponId: "sword", depth: 5, defense: "high" });
assert.ok(maceNormalFormula.expectedDamagePerAttempt < swordNormalFormula.expectedDamagePerAttempt);
assert.ok(maceHighFormula.expectedDamagePerAttempt > swordHighFormula.expectedDamagePerAttempt);
assert.ok(maceHighFormula.expectedDamagePerAttempt <= maceNormalFormula.expectedDamagePerAttempt, "Mace high DEF must not exceed its normal DEF damage");
assert.ok(maceHighFormula.effectiveDefense >= maceNormalFormula.effectiveDefense, "Mace high DEF effective DEF must not fall below normal DEF");
assert.ok(maceHighFormula.expectedDamage > swordHighFormula.expectedDamage);
assert.ok(resolveFormula({ weaponId: "greatsword", depth: 10 }).expectedDamage > resolveFormula({ weaponId: "sword", depth: 10 }).expectedDamage);
assert.equal(WEAPON_CANDIDATES.mace.multiplier, 1.02);
assert.ok(WEAPON_CANDIDATES.mace.hitChance < WEAPON_CANDIDATES.sword.hitChance, "Mace hitChance must remain below Sword");
assert.equal(WEAPON_CANDIDATES.mace.highDefPenetration, 1.00);
assert.ok(WEAPON_CANDIDATES.mace.highDefPenetration > WEAPON_CANDIDATES.sword.highDefPenetration);
assert.equal(WEAPON_CANDIDATES.greatsword.multiplier, 1.36);
assert.equal(WEAPON_CANDIDATES.greatsword.hitChance, 0.82);
assert.equal(RUNE_ACTION.id, "rune-bolt");
assert.equal(RUNE_ACTION.mpCost, 1);
assert.equal(RUNE_ACTION.baseDamage, 48);
assert.equal(WEAPON_CANDIDATES.wand.runeSlots, 1);
assert.equal(WEAPON_CANDIDATES.staff.runeSlots, 2);
assert.ok(WEAPON_CANDIDATES.wand.mpCapacity < WEAPON_CANDIDATES.staff.mpCapacity);
assert.notEqual(WEAPON_CANDIDATES.wand.hands, WEAPON_CANDIDATES.staff.hands);

assert.deepEqual(Object.keys(ARMOR_CANDIDATES), ["lightArmor", "mediumArmor", "heavyArmor"]);
assert.deepEqual(Object.keys(SHIELD_CANDIDATES), ["noShield", "smallShield", "largeShield", "magicShield"]);
assert.deepEqual(SHIELD_CANDIDATES, {
  noShield: { id: "noShield", label: "盾なし", guard: { physical: 0.72, spell: 0.72, breath: 0.72 } },
  smallShield: { id: "smallShield", label: "小盾", load: "light", guard: { physical: 0.50, spell: 0.50, breath: 0.50 } },
  largeShield: { id: "largeShield", label: "大盾", load: "heavy", guard: { physical: 0.35, spell: 0.50, breath: 0.50 } },
  magicShield: { id: "magicShield", label: "魔法盾", load: "standard", guard: { physical: 0.50, spell: 0.35, breath: 0.35 } }
});
assert.ok(SHIELD_CANDIDATES.noShield.guard.physical > SHIELD_CANDIDATES.smallShield.guard.physical);
assert.ok(SHIELD_CANDIDATES.largeShield.guard.physical < SHIELD_CANDIDATES.smallShield.guard.physical);
assert.equal(SHIELD_CANDIDATES.largeShield.guard.spell, SHIELD_CANDIDATES.smallShield.guard.spell);
assert.equal(SHIELD_CANDIDATES.magicShield.guard.physical, SHIELD_CANDIDATES.smallShield.guard.physical);
assert.ok(SHIELD_CANDIDATES.magicShield.guard.spell < SHIELD_CANDIDATES.smallShield.guard.spell);
assert.ok(SHIELD_CANDIDATES.magicShield.guard.breath < SHIELD_CANDIDATES.smallShield.guard.breath);
assert.equal(SHIELD_CANDIDATES.largeShield.load, "heavy");
assert.deepEqual(Object.keys(LOAD_FIXTURES), ["heavyArmorSword", "heavyArmorGreatsword", "lightArmorGreatsword"]);
assert.equal(SHIELD_CANDIDATES.noShield.load, undefined, "no-shield must not add load burden");
assert.deepEqual(Object.fromEntries(Object.entries(LOAD_FIXTURES).map(([id, fixture]) => [
  id,
  [resolveVNextLoadCandidate(fixture, "max-burden").class, resolveVNextLoadCandidate(fixture, "aggregate").class]
])), {
  heavyArmorSword: ["heavy", "heavy"],
  heavyArmorGreatsword: ["heavy", "heavy"],
  lightArmorGreatsword: ["heavy", "heavy"]
});
assert.equal(resolveVNextLoadCandidate(LOAD_FIXTURES.heavyArmorGreatsword, "max-burden").score, resolveVNextLoadCandidate(LOAD_FIXTURES.heavyArmorSword, "max-burden").score);
assert.ok(resolveVNextLoadCandidate(LOAD_FIXTURES.heavyArmorGreatsword, "aggregate").aggregateScore > resolveVNextLoadCandidate(LOAD_FIXTURES.heavyArmorSword, "aggregate").aggregateScore);
assert.equal(Object.values(LOAD_FIXTURES).every(fixture => resolveVNextLoadCandidate(fixture, "aggregate").score >= resolveVNextLoadCandidate(fixture, "max-burden").score), true);
assert.equal(Object.values(ARMOR_CANDIDATES).every(armor => !Object.hasOwn(armor, "initiative")), true);

assert.ok(MEASUREMENT_IDS.includes("equipment-vnext-combat-diagnostic"));
const invocation = resolveRunnerInvocation({
  measurement: "equipment-vnext-combat-diagnostic",
  purpose: "bounded smoke",
  output_dir: "/tmp/issue-1544-test"
});
assert.equal(invocation.runner, "scratch/measurements/equipment_vnext_combat_diagnostic.js");
assert.ok(invocation.args.includes("--purpose"));

const result = await runEquipmentVNextCombatDiagnostic({ runs: 3, seed: 1544, allowSmallRunCount: true });
assert.equal(result.measurementId, "equipment-vnext-combat-diagnostic");
assert.equal(result.formulaTable.length, 30);
assert.deepEqual(result.configuration.weaponProfiles.filter(row => row.runeSlots > 0), [
  { id: "wand", hands: 1, runeSlots: 1, mpCapacity: 2 },
  { id: "staff", hands: 2, runeSlots: 2, mpCapacity: 4 }
]);
assert.equal(result.fixedCombat.length, 37);
assert.equal(result.fixedCombat.length, new Set(result.fixedCombat.map(row => `${row.conditionId}:${row.candidateId}`)).size);
assert.equal(result.fixedCombat.every(row => row.runs === 3 && row.invariant), true);
assert.equal(result.fixedCombat.every(row => row.confidence === "runner-correctness-only"), true);
const greatswordCondition = REPRESENTATIVE_CONDITIONS.find(condition => condition.id === "sword-vs-greatsword");
assert.deepEqual(
  { actionPlan: greatswordCondition.actionPlan, swordShield: greatswordCondition.shield, greatswordShield: greatswordCondition.compareShield },
  { actionPlan: "attack-defend", swordShield: "smallShield", greatswordShield: "noShield" }
);
assert.equal(greatswordCondition.enemyHpMultiplier, 1.35);
const greatswordRows = result.fixedCombat.filter(row => row.conditionId === "sword-vs-greatsword");
assert.deepEqual(greatswordRows.map(row => row.candidate.shield), ["smallShield", "noShield"]);
assert.equal(greatswordRows.every(row => Number.isFinite(row.oneRoundKillRate) && row.guardOpportunityLoss.count === 3), true);
const largeShieldRows = result.fixedCombat.filter(row => row.comparisonGroup === "shield-physical" && row.conditionId === "large-shield-physical");
assert.deepEqual(largeShieldRows.map(row => row.candidateId), ["largeShield", "largeShieldHeavyMinusOne", "largeShieldStandardTempo"]);
assert.deepEqual(largeShieldRows.map(row => [row.candidate.shield, row.candidate.initiativeLoad]), [
  ["largeShield", "heavy"],
  ["largeShield", "heavy"],
  ["largeShield", "standard"]
]);
const smallShieldRow = result.fixedCombat.find(row => row.conditionId === "small-shield-physical");
assert.deepEqual(largeShieldRows.map(row => row.initiativeDraws), [smallShieldRow.initiativeDraws, smallShieldRow.initiativeDraws, smallShieldRow.initiativeDraws]);
assert.ok(largeShieldRows.every(row => row.guardedEnemyActions.count === 3));
assert.deepEqual(result.configuration.largeShieldDiagnostic, {
  comparisonGroup: "shield-physical",
  baseline: { candidateId: "smallShield", guardPhysical: 0.50, initiativeLoad: "light" },
  candidates: [
    { candidateId: "largeShield", guardPhysical: 0.35, initiativeLoad: "heavy" },
    { candidateId: "largeShieldHeavyMinusOne", guardPhysical: 0.35, initiativeLoad: "heavy", loadCandidateId: "heavyMinusOne" },
    { candidateId: "largeShieldStandardTempo", guardPhysical: 0.35, initiativeLoad: "standard" }
  ],
  omitted: "heavy + stronger Guard; non-initiative cost; full Cartesian product"
});
assert.deepEqual(LOAD_INITIATIVE_CANDIDATES.current.modifiers, { light: 2, standard: 0, heavy: -2 });
assert.deepEqual(LOAD_INITIATIVE_CANDIDATES.heavyMinusOne.modifiers, { light: 2, standard: 0, heavy: -1 });
assert.deepEqual(LOAD_INITIATIVE_CANDIDATES.cappedHalfStep.modifiers, { light: 2, standard: 0, heavy: -1 });
assert.equal(LOAD_INITIATIVE_CANDIDATES.cappedHalfStep.rawBurdenFloor, 2);
assert.equal(LOAD_INITIATIVE_CANDIDATES.cappedHalfStep.additionalHeavyCostPerBurden, 0.5);
assert.equal(LOAD_INITIATIVE_CANDIDATES.cappedHalfStep.additionalHeavyCostCap, 1);
assert.deepEqual(Object.fromEntries(Object.entries(LOAD_FIXTURES).map(([fixtureId, fixture]) => {
  const load = resolveVNextLoadCandidate(fixture, "aggregate");
  return [fixtureId, resolveEffectiveTempoModifier(load, "cappedHalfStep")];
})), {
  heavyArmorSword: -1.5,
  heavyArmorGreatsword: -2,
  lightArmorGreatsword: -1
});
assert.equal(resolveEffectiveTempoModifier(
  resolveVNextLoadCandidate(LOAD_FIXTURES.heavyArmorGreatsword, "aggregate"),
  "cappedHalfStep",
  "standard"
), 0, "non-heavy isolation must not receive raw-burden heavy cost");
assert.deepEqual(THRESHOLD_FIXTURES.maceHighDef.map(fixture => fixture.enemyHpMultiplier), [0.95, 1.00, 1.05]);
assert.deepEqual(THRESHOLD_FIXTURES.greatsword.map(fixture => fixture.enemyHpMultiplier), [1.30, 1.35, 1.40]);
for (const fixture of [...THRESHOLD_FIXTURES.maceHighDef, ...THRESHOLD_FIXTURES.greatsword]) {
  const rows = result.fixedCombat.filter(row => row.thresholdFixtureId === fixture.id);
  assert.equal(rows.length, 2, `${fixture.id} must have a paired threshold comparison`);
  assert.equal(rows.every(row => row.enemyHpMultiplier === fixture.enemyHpMultiplier), true);
  assert.deepEqual(rows[0].initiativeDraws, rows[1].initiativeDraws, `${fixture.id} must share common random draws`);
}
assert.deepEqual(result.configuration.comparisonGroups, [
  "dagger-vs-sword",
  "sword-vs-mace-normal",
  "sword-vs-mace-high-def",
  "sword-vs-greatsword",
  "wand-vs-staff-rune",
  "armor",
  "shield-physical",
  "shield-arcane",
  "load-heavyArmorSword",
  "load-heavyArmorGreatsword",
  "load-lightArmorGreatsword"
]);
assert.equal(result.configuration.seedFormat, "<base seed>:<comparison group>:<run index>; candidate ID excluded; common random numbers");
assert.equal(comparisonGroupForCondition(REPRESENTATIVE_CONDITIONS[1]), "sword-vs-mace-normal");
assert.equal(comparisonRunSeed(1544, REPRESENTATIVE_CONDITIONS[1], 0), "1544:sword-vs-mace-normal:0");
assert.deepEqual(result.loadComparison.map(row => `${row.fixtureId}:${row.policy}`), [
  "heavyArmorSword:max-burden",
  "heavyArmorSword:aggregate",
  "heavyArmorGreatsword:max-burden",
  "heavyArmorGreatsword:aggregate",
  "lightArmorGreatsword:max-burden",
  "lightArmorGreatsword:aggregate"
]);
assert.equal(result.loadComparison.every(row => row.invariant && row.resolved.score >= row.maxBurdenScore), true);
assert.equal(result.loadComparison.find(row => row.fixtureId === "heavyArmorGreatsword" && row.policy === "aggregate").resolved.aggregateScore, 4);
assert.deepEqual(result.fixedCombat.filter(row => row.comparisonGroup.startsWith("load-")).map(row => `${row.conditionId}:${row.loadCandidateId}`), [
  "load-heavyArmorSword:heavyMinusOne",
  "load-heavyArmorSword:cappedHalfStep",
  "load-heavyArmorGreatsword:heavyMinusOne",
  "load-heavyArmorGreatsword:cappedHalfStep",
  "load-lightArmorGreatsword:heavyMinusOne",
  "load-lightArmorGreatsword:cappedHalfStep"
]);
assert.equal(result.fixedCombat.filter(row => row.comparisonGroup.startsWith("load-")).every(row => row.rawBurden >= row.maxBurdenScore), true);
assert.deepEqual(result.configuration.loadTempoComparison, {
  baselineCandidateId: "heavyMinusOne",
  candidateId: "cappedHalfStep",
  rawBurdenFloor: 2,
  additionalHeavyCostPerBurden: 0.5,
  additionalHeavyCostCap: 1,
  fixtureIds: ["heavyArmorSword", "heavyArmorGreatsword", "lightArmorGreatsword"]
});

for (const fixtureId of Object.keys(LOAD_FIXTURES)) {
  const rows = result.fixedCombat.filter(row => row.comparisonGroup === `load-${fixtureId}`);
  assert.equal(rows.length, 2, `${fixtureId} must have a paired load comparison`);
  assert.deepEqual(rows[0].initiativeDraws, rows[1].initiativeDraws, `${fixtureId} load candidates must share common random draws`);
  assert.equal(rows[0].loadClass, rows[1].loadClass, `${fixtureId} load candidates must preserve load class`);
  assert.equal(rows[0].rawBurden, rows[1].rawBurden, `${fixtureId} load candidates must preserve raw burden`);
  assert.equal(rows[0].effectiveTempoModifier, -1, `${fixtureId} fixed heavy -1 must remain fixed`);
}
assert.deepEqual(Object.fromEntries(result.fixedCombat
  .filter(row => row.loadCandidateId === "cappedHalfStep")
  .map(row => [row.rawBurden, row.effectiveTempoModifier])), {
  2: -1,
  3: -1.5,
  4: -2
});

for (const comparisonGroup of ["sword-vs-mace-normal", "wand-vs-staff-rune"]) {
  const rows = result.fixedCombat.filter(row => row.comparisonGroup === comparisonGroup);
  assert.equal(rows.length, 2, `${comparisonGroup} must have two weapon candidates`);
  assert.deepEqual(rows[0].initiativeDraws, rows[1].initiativeDraws, `${comparisonGroup} must share initiative draws`);
}
for (const comparisonGroup of ["armor", "shield-physical", "shield-arcane"]) {
  const rows = result.fixedCombat.filter(row => row.comparisonGroup === comparisonGroup);
  assert.ok(rows.length >= 2, `${comparisonGroup} must have paired candidates`);
  assert.ok(rows.every(row => JSON.stringify(row.initiativeDraws) === JSON.stringify(rows[0].initiativeDraws)), `${comparisonGroup} must use one common random stream`);
}

const rerun = await runEquipmentVNextCombatDiagnostic({ runs: 3, seed: 1544, allowSmallRunCount: true });
assert.deepEqual(rerun, result, "same seed and run count must be deterministic");

const attackCondition = { id: "initiative-attack", depth: 1, attackType: "physical", actionPlan: "attack" };
const playerFirstResult = simulateOne(attackCondition, "sword", {
  weapon: "sword", armor: "mediumArmor", shield: "smallShield", policy: "max-burden", actionPlan: "attack"
}, 1544, { initiativeOverride: true });
const enemyFirstResult = simulateOne(attackCondition, "sword", {
  weapon: "sword", armor: "mediumArmor", shield: "smallShield", policy: "max-burden", actionPlan: "attack"
}, 1544, { initiativeOverride: false });
assert.equal(playerFirstResult.actionTrace[0][0], "player:attack");
assert.equal(enemyFirstResult.actionTrace[0][0], "enemy");
assert.equal(playerFirstResult.actionTrace.every(actions => actions.filter(action => action.startsWith("player:")).length <= 1), true);
assert.equal(playerFirstResult.actionTrace.every(actions => actions.filter(action => action === "enemy").length <= 1), true);
assert.equal(enemyFirstResult.playerActions <= enemyFirstResult.rounds, true);

const attackOnlyShield = simulateOne({ ...attackCondition, actionPlan: "attack" }, "largeShield", {
  weapon: "sword", armor: "mediumArmor", shield: "largeShield", policy: "max-burden", actionPlan: "attack"
}, 1544, { initiativeOverride: true });
const defendShield = simulateOne({ ...attackCondition, actionPlan: "attack-defend" }, "largeShield", {
  weapon: "sword", armor: "mediumArmor", shield: "largeShield", policy: "max-burden", actionPlan: "attack-defend"
}, 1544, { initiativeOverride: true });
assert.equal(attackOnlyShield.guardedEnemyActions, 0, "Attack round must not apply Guard");
assert.equal(attackOnlyShield.guardReduction, 0, "Attack round must not receive passive Guard reduction");
assert.ok(defendShield.guardedEnemyActions > 0, "Defend round must apply Guard candidate");
assert.ok(defendShield.guardReduction > 0, "Defend round must record Guard reduction");

for (const weapon of ["wand", "staff"]) {
  const runeResult = simulateOne({ id: "rune-scenario", depth: 10, attackType: "spell", actionPlan: "rune" }, weapon, {
    weapon, armor: "mediumArmor", shield: "noShield", policy: "max-burden", actionPlan: "rune"
  }, 1544, { initiativeOverride: true });
  assert.ok(runeResult.runeActions > 0, `${weapon} must execute a Rune action`);
  assert.ok(runeResult.runeDamage > 0, `${weapon} Rune action must affect combat damage`);
  assert.equal(runeResult.runeActionId, RUNE_ACTION.id, `${weapon} must use the shared Rune action`);
  assert.equal(runeResult.mpSpent, runeResult.runeActions, `${weapon} MP must come from executed Rune actions`);
}
const repeatedWandRune = simulateOne({ id: "wand-repeated-rune", depth: 1, attackType: "spell", actionPlan: "rune" }, "wand", {
  weapon: "wand", armor: "heavyArmor", shield: "noShield", policy: "max-burden", actionPlan: "rune"
}, 1544, { initiativeOverride: true });
assert.ok(repeatedWandRune.runeActions > WEAPON_CANDIDATES.wand.runeSlots, "wand must reuse the same Rune beyond its socket count");
assert.equal(repeatedWandRune.runeActions, repeatedWandRune.mpCapacity / RUNE_ACTION.mpCost, "wand Rune use must stop at MP capacity");
assert.equal(repeatedWandRune.mpSpent, repeatedWandRune.mpCapacity, "wand repeated Rune use must spend available MP");
const runeRows = result.fixedCombat.filter(row => row.conditionId === "wand-vs-staff-rune");
assert.equal(runeRows.every(row => row.runeActions.average > 0 && row.runeDamage.average > 0), true);

const source = fs.readFileSync(resolve("scratch/measurements/equipment_vnext_combat_diagnostic.js"), "utf8");
assert.doesNotMatch(source, /1664525|1013904223|stableHash/);
assert.match(source, /createSeededRng/);
assert.doesNotMatch(source, /src\/(combat|state|systems|ui|data\/items|data\/monsters|rules\/equipment_load)/);
assert.deepEqual(REPRESENTATIVE_CONDITIONS.map(condition => condition.id), result.configuration.representativeConditionIds);
const report = buildReport(result, null, "bounded smoke");
assert.equal(report.measurement.productionPaths.length, 0);
assert.match(buildSummary(report), /Guard opportunity count/);

console.log("[PASS] Issue #1576 capped raw burden tempo, fixed heavy -1, large shield Guard / tempo diagnostic, and production boundary");
