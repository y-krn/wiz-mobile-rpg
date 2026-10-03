import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { generateRunFloor } from "../../../src/run_map_generator.js";

const cases = [
  ["ISSUE-453-BASE-10", 1, "97db683817c0e1268740978963705f08c4afbd37d8a49617647cb0900e21fdeb"],
  ["ISSUE-453-BASE-10", 11, "a5ead67466e5534ce2c9b6f29f172e8eb62a8c235e5f1ec9a2292eab1ee1826a"],
  ["ISSUE-453-BASE-10", 21, "abb3463184772abfcfcfe86745b433660c41332a909d8dd09c27c6bae728c5cb"],
  ["ISSUE-453-BASE-11", 1, "97d1176f595d962dc47af4e18e7e4de397468fbed91e54262c55680b79ee3008"],
  ["ISSUE-453-BASE-11", 11, "d111f2374fcc98899bdbf4cfdd265f1890df5ca12857c037f2545fdee6efd677"],
  ["ISSUE-453-BASE-11", 21, "ee293268b200c0e9a373d35f2fda0df58783b014c427452ed3ca32436d7382b0"],
  ["ISSUE-453-BASE-46", 1, "68f091a93fb5a619d8c89cef8ed782f01e86def5e77a8c050fb7342e2fe594f4"],
  ["ISSUE-453-BASE-46", 11, "b5c4882e55ca720e36e1a7081aea5106238c644a94a3a27d24d43037c68dd1bc"],
  ["ISSUE-453-BASE-46", 21, "69d2a9fdf6020b0fdf128e9f49db89dc17179eb47fa2758a98a155720d9d5ec9"]
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
