import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { generateRunFloor } from "../src/run_map_generator.js";

const cases = [
  ["ISSUE-453-BASE-10", 1, "3a7541c63b37a0145ed269e162aabc3f462a2be891469a22fd5dc8e1f16ababa"],
  ["ISSUE-453-BASE-10", 11, "f836586504dbd883b9fbd7183835393f73660e5565b096c2c337af5aa776480b"],
  ["ISSUE-453-BASE-10", 21, "5584a244939f988845d47cc0b7de2394b5f996ea77dedde77ea1f0628a679e1b"],
  ["ISSUE-453-BASE-11", 1, "6ce6f46fd10191546d552263c57c55ce137214fb698c67fac201736c3251f1ef"],
  ["ISSUE-453-BASE-11", 11, "9b9ffd7b24c3b018f17527afc38b50cbf53bdb5ec0bad0d79c6dcf283d2a6d8e"],
  ["ISSUE-453-BASE-11", 21, "3a87fa0b487a6838e7cec82178569c32272246e9840587ed18cd3916cf238844"],
  ["ISSUE-453-BASE-46", 1, "247b3b685c6694e2385249aeb9530c44b243c7c941e29fb2d62d5e4beb93ae20"],
  ["ISSUE-453-BASE-46", 11, "832c65e25ed8db2256369cbe938cff99cbb600cb743b81ba694ea64958da005a"],
  ["ISSUE-453-BASE-46", 21, "588710d83b8407f84367bc41d1dacfb0f04665f9f322f72b52805f01473f4a83"]
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
