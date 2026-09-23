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
assert.match(contract.verticalPowerOwners.milestoneBaseline.source, /actually selected startFloor/);
assert.match(contract.verticalPowerOwners.milestoneBaseline.timing, /maximum of that entitlement and the highest defeated milestone in this run/);
assert.match(contract.bandSemantics, /globally unlocked but unselected milestones do not contribute/);
assert.equal(contract.equipmentBoundary.phase3.base.includes("no depth-based ATK/DEF growth"), true);
assert.match(contract.genericEnemyRawScale.policy, /do not make per-floor raw HP\/ATK\/DEF inflation/);
assert.match(contract.bossException.boundary, /separate from generic enemy band scaling/);
assert.equal(contract.rewardExpFollowUp.required, true);

assert.deepEqual(contract.milestoneTiming.map(({ point, selectedStartFloor, highestDefeatedMilestone, baseline }) => [
  point,
  selectedStartFloor,
  highestDefeatedMilestone,
  baseline
]), [
  ["B1 start, even when B20 is globally unlocked", "B1", null, "B1 entitlement (baseline 0)"],
  ["unlocked B5/B10/... start when selected", "the selected unlocked milestone floor", null, "entitlement for that selected startFloor"],
  ["B20 start", "B20", null, "B20 startFloor entitlement"],
  ["B1 progression before B5 Boss defeat", "B1", null, "B1 entitlement (baseline 0)"],
  ["after B5 Boss defeat, entering B6", "B1", "B5", "maximum of B1 startFloor entitlement and B5 defeated-milestone baseline (baseline 1)"],
  ["each later milestone M (B10, B15, ...)", "the startFloor actually selected for this run", "highest milestone defeated in this run", "maximum of selected startFloor entitlement and highest defeated-milestone baseline"]
]);

assert.equal(Object.isFrozen(contract), true);
assert.equal(Object.isFrozen(contract.milestoneTiming), true);
