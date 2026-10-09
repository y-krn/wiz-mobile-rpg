import assert from "node:assert/strict";
import { applyPendingOutcomeRewards } from "../../../src/combat_ui/outcome_rewards.js";

const stateLike = {
  floor: 5,
  x: 0,
  y: 0,
  map: [[{ type: "empty", event: "boss", milestoneFloor: 5 }]],
  currentRun: { defeatedMilestones: [] },
  unlockedMilestones: [],
  keyItems: [],
  mapRevision: 0
};

const logs = applyPendingOutcomeRewards(stateLike, {
  kind: "milestoneVictory",
  floor: 5
});

// The next dungeon opens when the run comes home, so the line says so (#2060).
// The forge seal has nothing behind it in the workshop yet, so the line
// promises nothing there.
assert.deepEqual(logs, [
  "生きて帰れば、忘れられた地下墓地への道が開く。",
  "鍛造殿の印を手に入れた。"
]);
assert.equal(stateLike.map[0][0].event, null);
assert.equal(stateLike.map[0][0].type, "stairs-down");
assert.equal(stateLike.map[0][0].message, "階層守護者を倒した。階段への短絡路が開いた。");
assert.deepEqual(stateLike.currentRun.defeatedMilestones, [5]);
assert.deepEqual(stateLike.unlockedMilestones, [], "the dungeon is cleared only when the run comes home");
assert.deepEqual(stateLike.keyItems, ["FORGE_SEAL"]);
assert.equal(stateLike.mapRevision, 1);

// The abyss seal opens a workshop shelf, named as the workshop names it.
const deepState = {
  floor: 10,
  x: 0,
  y: 0,
  map: [[{ type: "empty", event: "boss", milestoneFloor: 10 }]],
  currentRun: { defeatedMilestones: [5] },
  unlockedMilestones: [5],
  keyItems: ["FORGE_SEAL"],
  mapRevision: 0
};
// Beating the catacomb's guardian promises the rift nest (#2064).
assert.deepEqual(applyPendingOutcomeRewards(deepState, { kind: "milestoneVictory", floor: 10 }), [
  "生きて帰れば、大裂溝の巣窟への道が開く。",
  "深淵の印を手に入れた。工房に「深淵の型」が並ぶようになった。"
]);

console.log("[PASS] milestone boss victory opens a local stairs-down shortcut");
