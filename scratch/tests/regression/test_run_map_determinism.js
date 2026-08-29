import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { generateRunFloor } from "../../../src/run_map_generator.js";

const cases = [
  ["ISSUE-453-BASE-10", 1, "3fea96326e8928ca73bf769bc669d4e801c494ea4d7ee8362d9c4789713342af"],
  ["ISSUE-453-BASE-10", 11, "565ac3f80d719657f17281672a37969583bf413f90bce7f09e03701e2551192b"],
  ["ISSUE-453-BASE-10", 21, "db3877448365f8ee0f9d9fbed165c07a20df7f7b5b7b5edef03031094c99ce53"],
  ["ISSUE-453-BASE-11", 1, "4eddfc671916dbea299f8adc4e73c8bddce4b5ea0cd30a6f19b485e6e7ad8527"],
  ["ISSUE-453-BASE-11", 11, "0ac261d9f093972d9394764d336ca717f186dcc53cae8432579358fdf2af22f7"],
  ["ISSUE-453-BASE-11", 21, "6554d553b13c69498a2f09e63d0972104232aa58562526ef8ac3391fd963c24c"],
  ["ISSUE-453-BASE-46", 1, "e7cc8bdb989eb6cad43ee8a1271e80561bf803b8d2d58a8e65f355339cb9545c"],
  ["ISSUE-453-BASE-46", 11, "cb726958184e4ae3bd37190a4d93bc1c9c6f48e7502c583af7527d121593c7e5"],
  ["ISSUE-453-BASE-46", 21, "ef070a975298562a2997ddd530c3cbe11b0d2a9f583a35a6d5f5de8ec3f8c368"]
];

const failures = [];
for (const [runSeed, floor, expectedSha] of cases) {
  try {
    const generated = generateRunFloor({ runSeed, floor });
    const actualSha = createHash("sha256")
      .update(JSON.stringify(generated))
      .digest("hex");
    assert.equal(actualSha, expectedSha, `${runSeed}/B${floor} map output changed`);
  } catch (error) {
    failures.push(`${runSeed}/B${floor}: ${error.message}`);
  }
}

if (failures.length > 0) {
  failures.forEach(failure => console.error(`[FAIL] ${failure}`));
  process.exit(1);
}

console.log(`[PASS] ${cases.length} fixed-seed generateRunFloor outputs are bit-stable.`);
