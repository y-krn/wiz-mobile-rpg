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

// The forge seal has nothing behind it in the workshop yet, so the line
// promises nothing there.
assert.deepEqual(logs, [
  "B5Fから冒険を始められるようになった。",
  "鍛造殿の印を手に入れた。"
]);
assert.equal(stateLike.map[0][0].event, null);
assert.equal(stateLike.map[0][0].type, "stairs-down");
assert.equal(stateLike.map[0][0].message, "階層守護者を倒した。階段への短絡路が開いた。");
assert.deepEqual(stateLike.currentRun.defeatedMilestones, [5]);
assert.deepEqual(stateLike.unlockedMilestones, [5]);
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
assert.deepEqual(applyPendingOutcomeRewards(deepState, { kind: "milestoneVictory", floor: 10 }), [
  "B10Fから冒険を始められるようになった。",
  "深淵の印を手に入れた。工房に「深淵の型」が並ぶようになった。"
]);

console.log("[PASS] milestone boss victory opens a local stairs-down shortcut");
