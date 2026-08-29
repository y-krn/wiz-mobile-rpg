import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { generateRunFloor } from "../../../src/run_map_generator.js";

const cases = [
  ["ISSUE-453-BASE-10", 1, "efcfa6ac79445ebab5f4ee1e0a26c88975ea6decc097896055d3fefb2dec3be3"],
  ["ISSUE-453-BASE-10", 11, "4e340eecca047bb6a1e183f4bfd6a607cddf82bd73e1e956829e3fe0469c49fd"],
  ["ISSUE-453-BASE-10", 21, "876a55c433c6f8054e101df567e33775f111bfe1a6707abcf5cb13712e07602e"],
  ["ISSUE-453-BASE-11", 1, "f90cf2b5572ed6d08f863894acd37698c7f74033620c0813684ef99d108b3b1a"],
  ["ISSUE-453-BASE-11", 11, "faebc3f44a7c2d5f900ca47e3a6d1e022f56efa180d65b13cd0dd476e2d3e5a3"],
  ["ISSUE-453-BASE-11", 21, "16bed7f7b2d3885bde9074ab4939cd9184c96f3a11ffb191bf8a4e188ba83cb0"],
  ["ISSUE-453-BASE-46", 1, "327fb28c99e3b521b580871a884426a4ae684912cf0504f476c5a59983c2af78"],
  ["ISSUE-453-BASE-46", 11, "209ffc46ef75c85fd6556a11158711016f7485528176fbcd9eb7c7be4c7b5b51"],
  ["ISSUE-453-BASE-46", 21, "2250da997fd0816146dd017407b7d674753d1f0b4fdbba721706c18b501b0b6a"]
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
