import assert from "node:assert/strict";
import fs from "node:fs";
import { resolve } from "node:path";

import {
  ARMOR_CANDIDATES,
  DEPTHS,
  LOAD_FIXTURES,
  RUNE_ACTION,
  REPRESENTATIVE_CONDITIONS,
  SHIELD_CANDIDATES,
  WEAPON_CANDIDATES,
  buildReport,
  formulaTable,
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
assert.ok(resolveFormula({ weaponId: "mace", depth: 5, defense: "high" }).expectedDamage > resolveFormula({ weaponId: "sword", depth: 5, defense: "high" }).expectedDamage);
assert.ok(resolveFormula({ weaponId: "greatsword", depth: 10 }).expectedDamage > resolveFormula({ weaponId: "sword", depth: 10 }).expectedDamage);
assert.equal(RUNE_ACTION.id, "rune-bolt");
assert.equal(RUNE_ACTION.mpCost, 1);
assert.equal(RUNE_ACTION.baseDamage, 48);
assert.equal(WEAPON_CANDIDATES.wand.runeSlots, 1);
assert.equal(WEAPON_CANDIDATES.staff.runeSlots, 2);
assert.ok(WEAPON_CANDIDATES.wand.mpCapacity < WEAPON_CANDIDATES.staff.mpCapacity);
assert.notEqual(WEAPON_CANDIDATES.wand.hands, WEAPON_CANDIDATES.staff.hands);

assert.deepEqual(Object.keys(ARMOR_CANDIDATES), ["lightArmor", "mediumArmor", "heavyArmor"]);
assert.deepEqual(Object.keys(SHIELD_CANDIDATES), ["noShield", "smallShield", "largeShield", "magicShield"]);
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
assert.equal(result.fixedCombat.length, 27);
assert.equal(result.fixedCombat.length, new Set(result.fixedCombat.map(row => `${row.conditionId}:${row.candidateId}`)).size);
assert.equal(result.fixedCombat.every(row => row.runs === 3 && row.invariant), true);
assert.equal(result.fixedCombat.every(row => row.confidence === "runner-correctness-only"), true);
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
const runeRows = result.fixedCombat.filter(row => row.conditionId === "wand-vs-staff-rune");
assert.equal(runeRows.every(row => row.runeActions.average > 0 && row.runeDamage.average > 0), true);

const source = fs.readFileSync(resolve("scratch/measurements/equipment_vnext_combat_diagnostic.js"), "utf8");
assert.doesNotMatch(source, /src\/(combat|state|systems|ui|data\/items|data\/monsters|rules\/equipment_load)/);
assert.deepEqual(REPRESENTATIVE_CONDITIONS.map(condition => condition.id), result.configuration.representativeConditionIds);
assert.equal(buildReport(result, null, "bounded smoke").measurement.productionPaths.length, 0);

console.log("[PASS] Issue #1544 vNext combat diagnostic candidates, bounded runner, and production boundary");
