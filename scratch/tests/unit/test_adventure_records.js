import assert from "node:assert/strict";
import { finalizeRunRecords } from "../../../src/state/records_state.js";

let failures = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failures++;
    console.error(`[FAIL] ${name}: ${error.message}`);
  }
}

check("run終了時に自己ベスト・到達分布・初回達成を事実として記録する", () => {
  const first = finalizeRunRecords({}, {
    deepestFloor: 5,
    kills: 14,
    chestsOpened: 5,
    materials: { "獣の牙": 7 },
  }, "retreat", "Fighter");

  assert.equal(first.runNumber, 1);
  assert.deepEqual(first.records.personalBests, {
    deepestFloor: 5,
    kills: 14,
    chestsOpened: 5,
    lootCount: 7,
    goldEarned: 0,
  });
  assert.deepEqual(first.records.adventureStats.floorDistribution, {
    "B1-B4": 0,
    B5: 1,
    "B6-B9": 0,
    "B10+": 0,
  });
  assert.deepEqual(first.milestones, ["first_b5_reached"]);
});

check("B5突破・B10到達と構造化死因を集計し、撤退と死亡を分離する", () => {
  const first = finalizeRunRecords({}, { deepestFloor: 5 }, "retreat", "Fighter");
  const second = finalizeRunRecords(first.records, {
    deepestFloor: 11,
    kills: 21,
    chestsOpened: 7,
    goldEarned: 1840,
    deathLogs: [{ floor: 11, type: "trap", source: "fire_trap", cause: "火炎の罠" }],
  }, "death", "Mage");

  assert.equal(second.records.deepestRetreat, 5);
  assert.equal(second.records.deepestDeath, 11);
  assert.equal(second.records.totalRuns, 2);
  assert.equal(second.records.adventureStats.reachedB5, 2);
  assert.equal(second.records.adventureStats.brokeB5, 1);
  assert.equal(second.records.adventureStats.reachedB10, 1);
  assert.deepEqual(second.milestones, ["first_b5_broken", "first_b10_reached"]);
  assert.deepEqual(second.records.deathCauses, [{
    floor: 11,
    type: "trap",
    source: "fire_trap",
    count: 1,
  }]);
  assert.equal(second.records.personalBests.goldEarned, 1840);
});

if (failures > 0) process.exit(1);
