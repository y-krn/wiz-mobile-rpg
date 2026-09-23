import assert from "node:assert/strict";
import { PROGRESSION_ENEMY_CONTRACT as contract } from "../../../src/data/progression_enemy_contract.js";

assert.equal(contract.status, "design-only");
assert.deepEqual(contract.verticalPowerOwners.milestoneBaseline.owns, [
  "equipment-independent physical combat baseline",
  "equipment-independent spell combat baseline",
  "equipment-independent max HP and defensive baseline"
]);
assert.deepEqual(contract.verticalPowerOwners.runLocalLevel.owns, ["small incremental max HP growth"]);
assert.equal(contract.equipmentBoundary.verticalPowerOwner, false);
assert.match(contract.bandSemantics, /not floor-entry power/);
assert.equal(contract.equipmentBoundary.phase3.base.includes("no depth-based ATK/DEF growth"), true);
assert.match(contract.genericEnemyRawScale.policy, /do not make per-floor raw HP\/ATK\/DEF inflation/);
assert.match(contract.bossException.boundary, /separate from generic enemy band scaling/);
assert.equal(contract.rewardExpFollowUp.required, true);

assert.deepEqual(contract.milestoneTiming.map(({ point, baseline }) => [point, baseline]), [
  ["B1 start", "B1 entitlement (baseline 0)"],
  ["unlocked B5/B10/... start", "the unlocked start milestone entitlement"],
  ["B1 progression before B5 Boss defeat", "B1 entitlement (baseline 0)"],
  ["after B5 Boss defeat, entering B6", "B5 defeated-milestone baseline (baseline 1)"],
  ["each later milestone M (B10, B15, ...)", "highest unlocked start entitlement or defeated milestone"]
]);

assert.equal(Object.isFrozen(contract), true);
assert.equal(Object.isFrozen(contract.milestoneTiming), true);
