import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { generateRunFloor } from "../../../src/run_map_generator.js";

const cases = [
  ["ISSUE-453-BASE-10", 1, "b56d26f4da3cb0d25ede3d4844c3ba8a81bd65e1f2b0ac0a243adaeeb4f699e1"],
  ["ISSUE-453-BASE-10", 11, "9142327febe8e33c90498e04b92500c1a91acba9cf62a24bd713853c7d074575"],
  ["ISSUE-453-BASE-10", 21, "d63a4789f22fa48dc1025f38fcd16dbaf768f4e7953d0fdb92742f43396e1122"],
  ["ISSUE-453-BASE-11", 1, "25a944a1cf97c09a1a26bc950ecbd28f0e0c45a9327a8df1e77e50758b1c9d29"],
  ["ISSUE-453-BASE-11", 11, "4cba5091beef08bc6589c1d8da08bb26246a9afb6abc9267aa30cf6fb41157b0"],
  ["ISSUE-453-BASE-11", 21, "581408cdba86ca2442fac2bb5a893706f8fec2a017d27711578e5cb97f37acee"],
  ["ISSUE-453-BASE-46", 1, "031d06b030ca83bf0f2b79440d9738fff3c9bbc1a7bb74c8d4e9a69939901a1a"],
  ["ISSUE-453-BASE-46", 11, "e9a9a318584331cf428579fbc0faf8c43e42a0a901ff1f2cd63f95848861d160"],
  ["ISSUE-453-BASE-46", 21, "228744ec698f584e5dc32218e3e0a5697c21f89fd9d5e16cd6c335e3451de00b"]
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
