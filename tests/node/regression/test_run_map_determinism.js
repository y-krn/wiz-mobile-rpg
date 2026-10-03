import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { generateRunFloor } from "../../../src/run_map_generator.js";

const cases = [
  ["ISSUE-453-BASE-10", 1, "b2ca08f37a3a64fbc2aeb036c6712c7f6acdc34e040e3371f8313188449f2183"],
  ["ISSUE-453-BASE-10", 11, "4e0c41f0a1f13ca56395ce536c483c534e2a45ad18d850a150f827a81bf80b75"],
  ["ISSUE-453-BASE-10", 21, "335d2c7daf4f2ed1d250a72c91e0a1ed61c4e79438c4d09cdaf5eff05adb70e9"],
  ["ISSUE-453-BASE-11", 1, "7247dbef5a95f2dba3ad84ed9ecd560720e9d1b5286d1957d69e30f4ec532f51"],
  ["ISSUE-453-BASE-11", 11, "817b82431406a1cc31f5b7de2e8b7b0163d4f188f0c24a446141d8b6984b6294"],
  ["ISSUE-453-BASE-11", 21, "87da45d8780e3df960eb77023036b8338eec3f8d935553b6b84c4eae00f6a1a1"],
  ["ISSUE-453-BASE-46", 1, "e7ac2d85d0d7bb908fc565ca1263d9e9f88d771077bdbbbe7b37a6f900635b6f"],
  ["ISSUE-453-BASE-46", 11, "3d00e6c60addb280bb1d5d17e30961a761ee6c178a8bf2dc83bcee57912c8059"],
  ["ISSUE-453-BASE-46", 21, "17a15a9859cd4f0aac27327d117e8dc3032bd6177c50f126c4ef9bb23ec568ef"]
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
