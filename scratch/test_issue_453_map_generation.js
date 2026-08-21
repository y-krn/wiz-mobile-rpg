import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { generateRunFloor } from "../src/run_map_generator.js";

const cases = [
  ["ISSUE-453-BASE-10", 1, "998a03af1306f4a697d6d74101436f7fb766b5ec50cea333ff42ae436ad9dddb"],
  ["ISSUE-453-BASE-10", 11, "4a340cd8f6f59c7b4ba35ba8ad4590b8faccbe830f0e9a4b1d53346f62ba0983"],
  ["ISSUE-453-BASE-10", 21, "11ec5191fd68593671b6735aea59e9e68744ca144b5991d4f2c80f29c4ce8cc2"],
  ["ISSUE-453-BASE-11", 1, "7a8a578005bf48eca733dee91d27a21591b3cf78e2b263d9d6c57644867c469e"],
  ["ISSUE-453-BASE-11", 11, "d0f5132172c27988d902e045e7b08d62de61be96386c777e989b04c252736609"],
  ["ISSUE-453-BASE-11", 21, "57b07f20f2e06661006b5a5112cca8513f8ec862c500aeb5614740d75eba643a"],
  ["ISSUE-453-BASE-46", 1, "332fcb9f22dd87b40a8cd93bbe478a64fd97a84587acd95bbdaf96a80d7428c8"],
  ["ISSUE-453-BASE-46", 11, "2dd331d40338dc346f02b0d2797e0ed82488ca862c672d4f8532715bee4329f8"],
  ["ISSUE-453-BASE-46", 21, "658b6e012326d8e8162d66ace45143ccd3cf86917c8d3001e60736182f03bc67"]
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
