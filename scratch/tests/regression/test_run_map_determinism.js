import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { generateRunFloor } from "../../../src/run_map_generator.js";

const cases = [
  ["ISSUE-453-BASE-10", 1, "3927b31d10669493ea66a098e430f5f54c2fc0d42353e680fd67eb57d537a5cf"],
  ["ISSUE-453-BASE-10", 11, "296763fbdcbefdf79458d6c984e54717ebfb1e3979fada405210df8c2e130397"],
  ["ISSUE-453-BASE-10", 21, "17bb77669fd6c9f1d72a5b665c8d504ef7bd32d6e4eed65b634239ac44993c2d"],
  ["ISSUE-453-BASE-11", 1, "3cae3075b89182feb66d833e219e0ca73d6e6128a222948c5451e061359183e2"],
  ["ISSUE-453-BASE-11", 11, "db054eedc906719bf60b6d65a56e69a2ccb596bbaaa7085f4bf1c8da6a73e71a"],
  ["ISSUE-453-BASE-11", 21, "330935e1c157c89d022c186a04bd091e7ed20bfb59d5e8aeeef63eb2b3e02201"],
  ["ISSUE-453-BASE-46", 1, "92c7c7459a4183ff87559240eb78bacab72a7bbee5ff8d266f14b83d49e9a0c1"],
  ["ISSUE-453-BASE-46", 11, "c95e8e688f15248193411b8399883893471c7435094f502b7c306536358c40a7"],
  ["ISSUE-453-BASE-46", 21, "16e2306d304633256e82b613aead55b1c136881ca48884cecac9cc4b3206431c"]
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
