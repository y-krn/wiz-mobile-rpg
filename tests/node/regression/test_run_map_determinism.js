import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { generateRunFloor } from "../../../src/run_map_generator.js";

const cases = [
  ["ISSUE-453-BASE-10", 1, "e620cb4d69941ec1333652f5f392f1f5f9c677c8042d4c0d5be98f55f442615a"],
  ["ISSUE-453-BASE-10", 11, "5667ffe7c765e6aaf81785c53510e51a367f1177b6a9715275359f3a183db4cf"],
  ["ISSUE-453-BASE-10", 21, "1fd5c8aef2a2af1bd078d63ec2fb3d572a592b32749137bf2637b20a1f1ffe25"],
  ["ISSUE-453-BASE-11", 1, "25a944a1cf97c09a1a26bc950ecbd28f0e0c45a9327a8df1e77e50758b1c9d29"],
  ["ISSUE-453-BASE-11", 11, "7a73f82f97964dcb7e94117ea144947c6e697eaaf580e45597b98f89e7f2b7e6"],
  ["ISSUE-453-BASE-11", 21, "6de5433d00b6be2bfb2bb48fdd6e129a5c7ce597c138e6aab89f5d4e5be098d4"],
  ["ISSUE-453-BASE-46", 1, "3748ec49c69c036c6118e60c9185b2d607089efa48a410411fbf0a10a17d9f14"],
  ["ISSUE-453-BASE-46", 11, "3e09d816abca7c16fa0745168ccd6f1fb9c8a6f6f3cbacdab3d133fee1722b85"],
  ["ISSUE-453-BASE-46", 21, "37430564976e88550eb38c3d77fec163bf9bcd732e08372a92144c94687ad290"]
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
