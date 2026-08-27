import assert from "node:assert/strict";
import { applyPendingOutcomeRewards } from "../../../src/combat_ui/outcome_rewards.js";

const failures = [];

function check(label, fn) {
  try {
    fn();
    console.log(`[PASS] ${label}`);
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
    console.error(`[FAIL] ${label}: ${error.message}`);
  }
}

function milestoneState(floor) {
  return {
    floor,
    x: 0,
    y: 0,
    map: [[{ type: "floor", event: "boss", milestoneFloor: floor }]],
    currentRun: { defeatedMilestones: [] },
    unlockedMilestones: [],
    keyItems: []
  };
}

check("B5初回撃破が鍛造殿の印を1回だけ付与", () => {
  const state = milestoneState(5);
  const first = applyPendingOutcomeRewards(state, { kind: "milestoneVictory", floor: 5 });
  const second = applyPendingOutcomeRewards(state, { kind: "milestoneVictory", floor: 5 });

  assert.deepEqual(state.keyItems, ["FORGE_SEAL"]);
  assert.equal(first.filter(message => message.includes("鍛造殿の印")).length, 1);
  assert.equal(second.filter(message => message.includes("鍛造殿の印")).length, 0);
  assert.equal(state.map[0][0].event, null);
});

check("B10初回撃破が深淵の印を付与", () => {
  const state = milestoneState(10);
  applyPendingOutcomeRewards(state, { kind: "milestoneVictory", floor: 10 });
  assert.deepEqual(state.keyItems, ["ABYSS_SEAL"]);
});

check("守護者報酬の装備が図鑑へ記録される", () => {
  const state = {
    floor: 3,
    x: 0,
    y: 0,
    map: [[{ event: "midboss" }]],
    party: [],
    inventory: [],
    codex: { equipment: {} },
    currentRun: { itemsFound: [], equipmentFound: [], materials: {} },
    keyItems: [],
    unlockedMilestones: []
  };

  applyPendingOutcomeRewards(state, { kind: "giveKey" }, () => 0.1);
  const reward = state.currentRun.equipmentFound[0];
  assert.ok(reward, "The reward equipment should be added");
  assert.equal(state.codex.equipment[reward.baseId].foundCount, 1, "The reward equipment should be registered");
  assert.deepEqual(state.codex.equipment[reward.baseId].affixesSeen, [], "The unidentified reward affixes should stay hidden");
});

if (failures.length > 0) {
  console.error(`${failures.length} key item test(s) failed.`);
  process.exit(1);
}
