import assert from "node:assert/strict";
import {
  calculateSecretDoorSearchChance,
  SECRET_DOOR_SEARCH_CALIBRATION
} from "../../../src/rules/exploration_rules.js";

function assertChance(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} is not close to ${expected}`);
}

assertChance(
  calculateSecretDoorSearchChance({ floor: 1, arcaneSense: 0 }),
  SECRET_DOOR_SEARCH_CALIBRATION.universalBaseChance
);
assertChance(calculateSecretDoorSearchChance({ floor: 5, arcaneSense: 0 }), 0.15);
assertChance(
  calculateSecretDoorSearchChance({ floor: 10, arcaneSense: 0 }),
  SECRET_DOOR_SEARCH_CALIBRATION.minChance
);
assertChance(
  calculateSecretDoorSearchChance({ floor: 15, arcaneSense: 0 }),
  SECRET_DOOR_SEARCH_CALIBRATION.minChance
);
assertChance(calculateSecretDoorSearchChance({ floor: 1, arcaneSense: 3 }), 0.38);
assertChance(
  calculateSecretDoorSearchChance({ floor: 1, arcaneSense: 100 }),
  SECRET_DOOR_SEARCH_CALIBRATION.maxChance
);
assertChance(
  calculateSecretDoorSearchChance({ floor: 0, arcaneSense: -10 }),
  SECRET_DOOR_SEARCH_CALIBRATION.universalBaseChance
);
assertChance(
  calculateSecretDoorSearchChance({ floor: "invalid", arcaneSense: Number.NaN }),
  SECRET_DOOR_SEARCH_CALIBRATION.universalBaseChance
);

console.log("[PASS] secret-door search uses universal depth curve plus build modifier");
