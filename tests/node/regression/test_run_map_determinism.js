import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { generateRunFloor } from "../../../src/run_map_generator.js";

const cases = [
  ["ISSUE-453-BASE-10", 1, "b2ca08f37a3a64fbc2aeb036c6712c7f6acdc34e040e3371f8313188449f2183"],
  // Floors 11 and 21 are the first floor of a dungeon (#2060): they are now
  // generated as an entrance, with traps as hard as any first floor's. The
  // first dungeon's floors are unchanged. Floor 11 is the rift nest's first
  // floor: it takes the shallow template and the nest's ledges (#2064).
  ["ISSUE-453-BASE-10", 11, "fd13403e513f2855cfd994d03402ed59a771455fb4db4a74fea157e11d8d5d3e"],
  ["ISSUE-453-BASE-10", 21, "83be2b9ffff851f277d830eaac9fd81aaafda021a1df25845ae149a2caee0156"],
  ["ISSUE-453-BASE-11", 1, "7247dbef5a95f2dba3ad84ed9ecd560720e9d1b5286d1957d69e30f4ec532f51"],
  ["ISSUE-453-BASE-11", 11, "f56e6042fd2d1d3e7875b262de26ab54b1aacea678bece0fe455b8fe918f7412"],
  ["ISSUE-453-BASE-11", 21, "a42d8519b488e13ff57d088c93eab4a84e1588dd066789c38590fbc8070a3357"],
  ["ISSUE-453-BASE-46", 1, "e7ac2d85d0d7bb908fc565ca1263d9e9f88d771077bdbbbe7b37a6f900635b6f"],
  ["ISSUE-453-BASE-46", 11, "f734354aafd15221bc63c46ec3320e51b986bfa4a8c19459f2502fd08d2c909a"],
  ["ISSUE-453-BASE-46", 21, "1929eebccf9eaef27e91661833f1c90f319c8742eb7491aac24467abd03af5c7"]
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
