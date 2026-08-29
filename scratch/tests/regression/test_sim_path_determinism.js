import assert from "node:assert/strict";

process.env.SIM_SKIP_PROVENANCE = "1";
process.env.SIM_SEED = "894";
process.env.SIM_INDEPENDENT_RUN_RANDOM = "1";

const { simulateRun } = await import("../../simulations/sim_depth_material_ev.js");
const {
  CHEST_ITEM_CANDIDATES_BY_FLOOR,
  CHEST_ITEM_CANDIDATES_BY_FLOOR_FROM_DROP
} = await import("../../../src/rules/chest_rules.js");

const noEncounter = () => 0;
const secretRun = simulateRun({
  className: "Fighter",
  startFloor: 1,
  targetDepth: 12,
  runIndex: 0,
  seriesId: "issue-894-secret",
  scoringProfile: null,
  scenario: { chestTrapPolicy: "disabled", trapPolicy: "disabled" },
  encounterRateOverride: noEncounter
});
const secretRunRepeat = simulateRun({
  className: "Fighter",
  startFloor: 1,
  targetDepth: 12,
  runIndex: 0,
  seriesId: "issue-894-secret",
  scoringProfile: null,
  scenario: { chestTrapPolicy: "disabled", trapPolicy: "disabled" },
  encounterRateOverride: noEncounter
});

assert.deepEqual(
  {
    secretDoorCandidates: secretRun.secretDoorCandidates,
    secretSearchAttempts: secretRun.secretSearchAttempts,
    secretRoomDiscoveries: secretRun.secretRoomDiscoveries,
    secretRoomRewardChests: secretRun.secretRoomRewardChests,
    secretSearchExtraSteps: secretRun.secretSearchExtraSteps
  },
  {
    secretDoorCandidates: secretRunRepeat.secretDoorCandidates,
    secretSearchAttempts: secretRunRepeat.secretSearchAttempts,
    secretRoomDiscoveries: secretRunRepeat.secretRoomDiscoveries,
    secretRoomRewardChests: secretRunRepeat.secretRoomRewardChests,
    secretSearchExtraSteps: secretRunRepeat.secretSearchExtraSteps
  }
);
assert.ok(secretRun.secretDoorCandidates > 0);
assert.ok(secretRun.secretSearchAttempts >= secretRun.secretSearchSuccesses);
assert.ok(secretRun.secretSearchExtraSteps > 0);

// In the production special-reward mode ordinary chests do not use the legacy
// Return Wing main pool, while a combat-generated fromDrop chest does.
assert.ok(CHEST_ITEM_CANDIDATES_BY_FLOOR[2].includes("HEAL_POTION"));
assert.ok(!CHEST_ITEM_CANDIDATES_BY_FLOOR[2].includes("TOWN_PORTAL"));
assert.ok(CHEST_ITEM_CANDIDATES_BY_FLOOR_FROM_DROP[2].includes("TOWN_PORTAL"));

const dropRun = simulateRun({
  className: "Thief",
  startFloor: 1,
  targetDepth: 6,
  runIndex: 0,
  seriesId: "issue-894-drop",
  scoringProfile: null,
  scenario: { chestTrapPolicy: "legacy" }
});
assert.ok(dropRun.chestDropGenerated > 0);
assert.equal(dropRun.chestDropGenerated, dropRun.chestPath.fromDrop.generated);
assert.equal(dropRun.chestPath.fromDrop.specialTownPortalRewards, 0);
for (const action of ["inspect", "open", "disarm", "trap_kit", "smash", "leave"]) {
  assert.equal(typeof dropRun.chestPath.fromDrop.actions[action], "number");
}

console.log("[PASS] issue #894 secret search and fromDrop chest paths are deterministic and instrumented");
