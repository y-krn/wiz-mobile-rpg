import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { generateRunFloor } from "../../../src/run_map_generator.js";

const cases = [
  ["ISSUE-453-BASE-10", 1, "647a5accaac7a32989c5b75ccff28d497bc17f9df7c138c407bd754431e70b00"],
  ["ISSUE-453-BASE-10", 11, "251b1b7e0ae31f4b9f52861f2999fccc5f71cc2c3022efee15861a51a36866d8"],
  ["ISSUE-453-BASE-10", 21, "e79ddb8f5ca018d91c7624453a4937ad4a7e09ad315f9eafd7d54dccfebbcc29"],
  ["ISSUE-453-BASE-11", 1, "0bd23b61f41ac1db371de3ca9cf8c6992ec6007ece7e2aab730799e12b7c10f7"],
  ["ISSUE-453-BASE-11", 11, "1e6ef2a3866a4cfcbaaec86f128376296d8d6e511d51829bc4c09c4ac222236d"],
  ["ISSUE-453-BASE-11", 21, "0ca425a271fd0b71667fdd59f1b0ec8cb6873557b891e75344ec3727f8ca5210"],
  ["ISSUE-453-BASE-46", 1, "1be7f77a5a37da7ac215563d542dac757077756cfe2d2744e81dfe394f2e553d"],
  ["ISSUE-453-BASE-46", 11, "6b57958172006867d1bc2e60de1663f807753e72dd67fcbe7026cd5c4277b953"],
  ["ISSUE-453-BASE-46", 21, "ef6e0a8df429c12d1c0a45e34cacb98f63f2f0cb26e2a526137e95d4ae5890ce"]
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
