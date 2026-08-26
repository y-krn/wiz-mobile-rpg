import assert from "node:assert/strict";

process.env.SIM_SKIP_PROVENANCE = "1";
process.env.SIM_SEED = "896";
process.env.SIM_INDEPENDENT_RUN_RANDOM = "1";

const { simulateRun } = await import("./sim_depth_material_ev.js");

const run = policy => simulateRun({
  className: "Fighter",
  startFloor: 1,
  targetDepth: 12,
  runIndex: 1,
  seriesId: "issue-896",
  scoringProfile: null,
  scenario: {
    equipmentCraftPolicy: policy,
    chestTrapPolicy: "disabled",
    trapPolicy: "disabled"
  }
});

const standard = run("standard");
const standardRepeat = run("standard");
const omitted = run("omitted");

assert.deepEqual(standard.equipmentCraft, standardRepeat.equipmentCraft);
assert.equal(standard.equipmentCraftPolicy, "standard");
assert.ok(standard.equipmentCraft.enhanceAttempts > 0);
assert.ok(standard.equipmentCraft.enhanceSuccesses > 0);
assert.ok(standard.equipmentCraft.polishAttempts > 0);
assert.ok(standard.equipmentCraft.polishSuccesses > 0);
assert.equal(
  standard.equipmentCraft.enhanceSuccesses,
  standard.equipmentCraft.enhancedItems.length
);
assert.equal(
  standard.equipmentCraft.polishSuccesses,
  standard.equipmentCraft.polishedItems.length
);
assert.equal(
  standard.runtimeCalls.workshop.enhance,
  standard.equipmentCraft.enhanceAttempts
);
assert.equal(
  standard.runtimeCalls.workshop.polish,
  standard.equipmentCraft.polishAttempts
);
assert.ok(standard.equipmentCraft.equipmentPowerDelta > 0);
assert.ok(standard.equipmentCraft.materialSpent["魔石片"] > 0);
assert.ok(standard.netBankedMaterials < standard.bankedMaterials);

assert.equal(omitted.equipmentCraftPolicy, "omitted");
assert.equal(omitted.equipmentCraft.enhanceAttempts, 0);
assert.equal(omitted.equipmentCraft.polishAttempts, 0);
assert.equal(omitted.equipmentCraft.equipmentPowerDelta, 0);
assert.equal(omitted.netBankedMaterials, omitted.bankedMaterials);
assert.equal(standard.outcome, omitted.outcome);
assert.equal(standard.reachedFloor, omitted.reachedFloor);
assert.equal(standard.timeCost, omitted.timeCost);
assert.equal(standard.bankedMaterials, omitted.bankedMaterials);

console.log("[PASS] issue #896 production equipment craft actions are deterministic and policy-scoped");
