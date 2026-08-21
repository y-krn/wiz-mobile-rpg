import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { generateRunFloor } from "../src/run_map_generator.js";

const cases = [
  ["ISSUE-453-BASE-10", 1, "647a5accaac7a32989c5b75ccff28d497bc17f9df7c138c407bd754431e70b00"],
  ["ISSUE-453-BASE-10", 11, "bb95aff50fa438e70866f549ea7653e9f505758994a5a98a64bc7c494ef322b8"],
  ["ISSUE-453-BASE-10", 21, "041dbdff474d4c588904644c208dd878298a7071c917dcfe258caf1706b4fb33"],
  ["ISSUE-453-BASE-11", 1, "0bd23b61f41ac1db371de3ca9cf8c6992ec6007ece7e2aab730799e12b7c10f7"],
  ["ISSUE-453-BASE-11", 11, "d815c6ee95343e6a7bc5700e92673ce8e6509ad0cb63b5a0cd1c0d8d04509027"],
  ["ISSUE-453-BASE-11", 21, "1568dbbd6283f440277903fda7e50b8769c69c17858514a6ecb19ecf47d05465"],
  ["ISSUE-453-BASE-46", 1, "1be7f77a5a37da7ac215563d542dac757077756cfe2d2744e81dfe394f2e553d"],
  ["ISSUE-453-BASE-46", 11, "7822d6d1fdd6ad3abe2e5497e9ce4ca4cac9658ee45b17913614d5898cbd7d68"],
  ["ISSUE-453-BASE-46", 21, "6938f693b1e403e2c3264e2dd3aef47c0724935aa8f9721c560460ce36f677e5"]
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
