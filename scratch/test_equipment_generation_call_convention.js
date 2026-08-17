import assert from "node:assert/strict";
import {
  generateRandomAccessory,
  generateRandomEquipment
} from "../src/systems/equipment_generation.js";

const failures = [];

function check(label, assertion) {
  try {
    assertion();
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
  }
}

check("accessory rejects positional arguments", () => {
  assert.throws(
    () => generateRandomAccessory(5, "epic", () => 0.5, []),
    /positional arguments are not supported/
  );
});

check("equipment rejects positional arguments", () => {
  assert.throws(
    () => generateRandomEquipment(5, "epic", () => 0.5, []),
    /positional arguments are not supported/
  );
});

if (failures.length > 0) {
  failures.forEach(failure => console.error(`[FAIL] ${failure}`));
  process.exit(1);
}

console.log("[PASS] equipment generators accept object options only");
