import assert from "node:assert/strict";
import fs from "node:fs";
import { resolve } from "node:path";

import {
  ARMOR_CANDIDATES,
  DEPTHS,
  LOAD_FIXTURE,
  REPRESENTATIVE_CONDITIONS,
  SHIELD_CANDIDATES,
  WEAPON_CANDIDATES,
  buildReport,
  formulaTable,
  resolveFormula,
  resolveVNextLoadCandidate,
  runEquipmentVNextCombatDiagnostic
} from "../../../scratch/measurements/equipment_vnext_combat_diagnostic.js";
import { getCombatTierForStartFloor } from "../../../src/rules/combat_tier.js";
import { MEASUREMENT_IDS, resolveRunnerInvocation } from "../../../scratch/measurements/run_balance_measurement.js";

assert.deepEqual(DEPTHS.map(getCombatTierForStartFloor), [0, 1, 2, 4, 5]);
assert.deepEqual(Object.keys(WEAPON_CANDIDATES), ["dagger", "sword", "mace", "greatsword", "wand", "staff"]);
assert.equal(formulaTable().length, DEPTHS.length * Object.keys(WEAPON_CANDIDATES).length);
assert.ok(resolveFormula({ weaponId: "dagger", depth: 1 }).expectedDamage < resolveFormula({ weaponId: "sword", depth: 1 }).expectedDamage);
assert.ok(resolveFormula({ weaponId: "mace", depth: 5, defense: "high" }).expectedDamage > resolveFormula({ weaponId: "sword", depth: 5, defense: "high" }).expectedDamage);
assert.ok(resolveFormula({ weaponId: "greatsword", depth: 10 }).expectedDamage > resolveFormula({ weaponId: "sword", depth: 10 }).expectedDamage);
assert.ok(resolveFormula({ weaponId: "staff", depth: 10 }).runeContribution > resolveFormula({ weaponId: "wand", depth: 10 }).runeContribution);

assert.deepEqual(Object.keys(ARMOR_CANDIDATES), ["lightArmor", "mediumArmor", "heavyArmor"]);
assert.deepEqual(Object.keys(SHIELD_CANDIDATES), ["noShield", "smallShield", "largeShield", "magicShield"]);
assert.equal(resolveVNextLoadCandidate(LOAD_FIXTURE, "max-burden").class, "heavy");
assert.equal(resolveVNextLoadCandidate(LOAD_FIXTURE, "aggregate").class, "standard");

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
assert.equal(result.fixedCombat.length, 23);
assert.equal(result.fixedCombat.length, new Set(result.fixedCombat.map(row => `${row.conditionId}:${row.candidateId}`)).size);
assert.equal(result.fixedCombat.every(row => row.runs === 3 && row.invariant), true);
assert.equal(result.fixedCombat.every(row => row.confidence === "runner-correctness-only"), true);
assert.deepEqual(result.loadComparison.map(row => row.resolved.class), ["heavy", "standard"]);

const source = fs.readFileSync(resolve("scratch/measurements/equipment_vnext_combat_diagnostic.js"), "utf8");
assert.doesNotMatch(source, /src\/(combat|state|systems|ui|data\/items|data\/monsters|rules\/equipment_load)/);
assert.deepEqual(REPRESENTATIVE_CONDITIONS.map(condition => condition.id), result.configuration.representativeConditionIds);
assert.equal(buildReport(result, null, "bounded smoke").measurement.productionPaths.length, 0);

console.log("[PASS] Issue #1544 vNext combat diagnostic candidates, bounded runner, and production boundary");
