import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { generateRunFloor } from "../src/run_map_generator.js";

const cases = [
  ["ISSUE-453-BASE-10", 1, "3a7541c63b37a0145ed269e162aabc3f462a2be891469a22fd5dc8e1f16ababa"],
  ["ISSUE-453-BASE-10", 11, "3b74a195779ea1211d7429d3a060e51d57213ae6991aebf2bc24056ec6fb9c58"],
  ["ISSUE-453-BASE-10", 21, "8b7d3ab24432694cf29b55b7ccb07c19e47a2e6e67b4bc1cdaeab04df95a4d4c"],
  ["ISSUE-453-BASE-11", 1, "6ce6f46fd10191546d552263c57c55ce137214fb698c67fac201736c3251f1ef"],
  ["ISSUE-453-BASE-11", 11, "9bded23fd7ace6d887d455b866b7d89ad4b6c783e668bbb2e2b1698a74ae414b"],
  ["ISSUE-453-BASE-11", 21, "9a352b446f2423e0c1b0212549909413a890ffc99182eed3904cc66c28d2d959"],
  ["ISSUE-453-BASE-46", 1, "247b3b685c6694e2385249aeb9530c44b243c7c941e29fb2d62d5e4beb93ae20"],
  ["ISSUE-453-BASE-46", 11, "7423e53d96a8e93977cff3f59183778193d760bf3015bf151bfbe1a270d402cd"],
  ["ISSUE-453-BASE-46", 21, "8923b8589738b6d490a7e10b5af2c731c83360e4f3ec7365849d727b38b0fb34"]
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
