import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { generateRunFloor } from "../../../src/run_map_generator.js";

const cases = [
  ["ISSUE-453-BASE-10", 1, "97db683817c0e1268740978963705f08c4afbd37d8a49617647cb0900e21fdeb"],
  ["ISSUE-453-BASE-10", 11, "eae9f55bc8477ead2a6e25f6bf43c1d8943cb1daf3218ad42e5d29445605c19c"],
  ["ISSUE-453-BASE-10", 21, "7479fd481869fe129acdcb1d029fe11910ad17484a0d6cd107d845f1ab0c7508"],
  ["ISSUE-453-BASE-11", 1, "97d1176f595d962dc47af4e18e7e4de397468fbed91e54262c55680b79ee3008"],
  ["ISSUE-453-BASE-11", 11, "4a69c7babc871cf515d82e34e8c4fea9ce97a354a7c937b83e7bef755b5cff0f"],
  ["ISSUE-453-BASE-11", 21, "bbd8ed24b627077b55d04dd1e2217c07b4ff568cc2ac78b131b14a29ad5f5925"],
  ["ISSUE-453-BASE-46", 1, "68f091a93fb5a619d8c89cef8ed782f01e86def5e77a8c050fb7342e2fe594f4"],
  ["ISSUE-453-BASE-46", 11, "923f5166f72695e736d3ca4e6dd29ddc416d69f2b747c4f6338d8b2aa169228a"],
  ["ISSUE-453-BASE-46", 21, "93f55ce96db4ea38b59bb3b0283167525d248bb80342face7c0b23ae002dc6f9"]
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
