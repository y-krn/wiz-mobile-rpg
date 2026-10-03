import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { generateRunFloor } from "../../../src/run_map_generator.js";

const cases = [
  ["ISSUE-453-BASE-10", 1, "dc300c58def15dbaae7a57eb35880b2ebabee5296117928e6ab3065486d04993"],
  ["ISSUE-453-BASE-10", 11, "ea5311537fb431c7c129cae23f4c866cbb8d07bd4c59c2e2760c06f71f6849f4"],
  ["ISSUE-453-BASE-10", 21, "66ba153aac805577b82570a8f722d0eff4f04a8193e61b242b072e72ff371a2c"],
  ["ISSUE-453-BASE-11", 1, "27a9662fa0c1db0ef54f8411d59500538f53b15dbd728d9286ad844414517cdf"],
  ["ISSUE-453-BASE-11", 11, "7c8880b9e96b38ddc1873b0aa37056d3f6c321e80e472e3670b58402ad0e1fe7"],
  ["ISSUE-453-BASE-11", 21, "bfd474e7b6fb6a68c5fa2c02539b22db061ff57d91a345b58be7721048116262"],
  ["ISSUE-453-BASE-46", 1, "6b812b931f643a7130cd6c1dc7c208d7ee20ab7489823823e37146f294ebb7c8"],
  ["ISSUE-453-BASE-46", 11, "b8e52a1f62d53abac9e3b564c01a1865274a0cc2d9777cccb8ac73811b708962"],
  ["ISSUE-453-BASE-46", 21, "d6d22628489e351054baba73d60530e33807eec20ee6039ef92207c2652da14b"]
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
