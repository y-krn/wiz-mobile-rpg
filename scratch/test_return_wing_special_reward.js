import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  CHEST_ITEM_CANDIDATES_BY_FLOOR,
  CHEST_SPECIAL_REWARD_CHANCE_BY_FLOOR,
  rollChestReward,
  rollChestSpecialReward
} from "../src/rules/chest_rules.js";

const failures = [];
function check(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.error(`[FAIL] ${name}: ${error.message}`);
  }
}

check("Return Wing is absent from every ordinary chest candidate pool", () => {
  Object.values(CHEST_ITEM_CANDIDATES_BY_FLOOR).forEach(candidates => {
    assert.equal(candidates.includes("TOWN_PORTAL"), false);
  });
});

check("special reward chance is explicit by floor", () => {
  assert.deepEqual(CHEST_SPECIAL_REWARD_CHANCE_BY_FLOOR, {
    1: 0,
    2: 0.02,
    3: 0.02,
    4: 0,
    5: 0.04
  });
  assert.equal(rollChestSpecialReward(2, () => 0.019), "TOWN_PORTAL");
  assert.equal(rollChestSpecialReward(2, () => 0.02), null);
  assert.equal(rollChestSpecialReward(4, () => 0), null);
});

check("special roll does not replace an ordinary main reward", () => {
  const reward = rollChestReward({
    floor: 2,
    rng: (() => {
      const values = [0, 0, 0];
      return () => values.shift() ?? 0;
    })(),
    party: [],
    currentRun: { b1ChestsOpened: 0, b1EquipFound: 1, chestsOpened: 0, equipmentFound: [] },
    trap: "none",
    firstChestGuaranteed: true
  });
  assert.ok(reward.item, "ordinary reward should still be present");
  assert.notEqual(reward.item, "TOWN_PORTAL");
  assert.equal(rollChestSpecialReward(2, () => 0.01), "TOWN_PORTAL");
});

check("real-run telemetry exposes acquisition, use, floor, HP band, and outcome fields", () => {
  const output = execFileSync(process.execPath, ["scratch/sim_depth_material_ev.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      SIM_SKIP_PROVENANCE: "1",
      SIM_RETURN_WING_MODE: "special",
      SIM_RUNS: "1",
      SIM_CALIBRATION_RUNS: "1",
      SIM_SCENARIOS: "workshop-empty"
    },
    encoding: "utf8"
  });
  const line = output.split("\n").find(value => value.startsWith("ISSUE791_MEASUREMENT_JSON="));
  assert.ok(line, "issue measurement output should be present");
  const measurement = JSON.parse(line.slice("ISSUE791_MEASUREMENT_JSON=".length))[0];
  [
    "chestPortalAcquisitions",
    "chestSpecialPortalAcquisitions",
    "mainRewardPortalReplacementsPerRun",
    "portalUsesPerRun",
    "portalUseFloorCounts",
    "portalUseHpBands",
    "survivalRate",
    "bankedMaterialEv",
    "b5ReachRate",
    "b10ReachRate",
    "equipmentPerRun"
  ].forEach(field => assert.ok(Object.hasOwn(measurement, field), `missing ${field}`));
});

if (failures.length > 0) {
  console.error(`\n${failures.length} Return Wing special reward test(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("[PASS] Return Wing special reward coverage");
}
