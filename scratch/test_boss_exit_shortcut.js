import assert from "node:assert/strict";
import { applyPendingOutcomeRewards } from "../src/combat_ui/outcome_rewards.js";

const stateLike = {
  floor: 5,
  x: 0,
  y: 0,
  map: [[{ type: "empty", event: "boss", milestoneFloor: 5 }]],
  currentRun: { defeatedMilestones: [] },
  unlockedMilestones: [],
  mapRevision: 0
};

const logs = applyPendingOutcomeRewards(stateLike, {
  kind: "milestoneVictory",
  floor: 5
});

assert.deepEqual(logs, ["B5F開始を恒久アンロックした。"]);
assert.equal(stateLike.map[0][0].event, null);
assert.equal(stateLike.map[0][0].type, "stairs-down");
assert.equal(stateLike.map[0][0].message, "【節目ボス撃破】階段への短絡路が開いた。");
assert.deepEqual(stateLike.currentRun.defeatedMilestones, [5]);
assert.deepEqual(stateLike.unlockedMilestones, [5]);
assert.equal(stateLike.mapRevision, 1);

console.log("[PASS] milestone boss victory opens a local stairs-down shortcut");
