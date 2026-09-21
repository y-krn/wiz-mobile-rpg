import assert from "node:assert/strict";

import {
  isNormalizedRunCodexDiscoveries,
  isNormalizedRunFirstKillsBefore,
  isNormalizedRunKeyItemsBefore,
  isNormalizedRunWorkshopDiscoveries,
  normalizeRunCodexDiscoveries,
  normalizeRunFirstKillsBefore,
  normalizeRunKeyItemsBefore,
  normalizeRunWorkshopDiscoveries
} from "../../../src/state/run_discovery_state.js";
import { createDefaultCurrentRun } from "../../../src/state/initial_state.js";
import { isNormalizedCurrentRun } from "../../../src/state/run_state.js";
import { normalizeSavePayload } from "../../../src/state/save_migrations.js";

const raw = [" A ", 3, " A ", "", null, "unknown"];
const expected = [" A ", " A ", "", "unknown"];

for (const normalize of [
  normalizeRunFirstKillsBefore,
  normalizeRunKeyItemsBefore,
  normalizeRunCodexDiscoveries,
  normalizeRunWorkshopDiscoveries
]) {
  assert.deepEqual(normalize(raw), expected, "discovery strings preserve exact order, duplicates, and empty strings");
  assert.deepEqual(normalize("not-an-array"), [], "non-array discovery input becomes empty");
  assert.deepEqual(normalize(normalize(raw)), expected, "discovery normalization is idempotent");
  assert.deepEqual(normalize(JSON.parse(JSON.stringify(normalize(raw)))), expected,
    "discovery normalization survives JSON roundtrip");
}

for (const guard of [
  isNormalizedRunFirstKillsBefore,
  isNormalizedRunKeyItemsBefore,
  isNormalizedRunCodexDiscoveries,
  isNormalizedRunWorkshopDiscoveries
]) {
  assert.equal(guard(expected), true);
  assert.equal(guard(["valid", 1]), false, "malformed discovery entry is rejected");
  assert.equal(guard("invalid"), false);
}

const baseRun = createDefaultCurrentRun();
assert.equal(Object.hasOwn(baseRun, "firstKills"), false, "default currentRun retires firstKills");
assert.equal(isNormalizedCurrentRun(baseRun), true);
for (const field of ["firstKillsBefore", "keyItemsBefore", "codexDiscoveries", "workshopDiscoveries"]) {
  const missing = { ...baseRun };
  delete missing[field];
  assert.equal(isNormalizedCurrentRun(missing), false, `${field} remains required`);
}
assert.equal(isNormalizedCurrentRun({ ...baseRun, codexDiscoveries: ["valid", 1] }), false);

const normalized = normalizeSavePayload({
  currentRun: {
    ...baseRun,
    firstKills: ["legacy-only"],
    firstKillsBefore: raw,
    keyItemsBefore: "invalid",
    codexDiscoveries: ["A", 2, "", "A"],
    workshopDiscoveries: ["WORKSHOP", null, "WORKSHOP"]
  },
  firstKills: ["global-before"],
  keyItems: ["global-key"],
  runHistory: [
    { codexDiscoveries: [" history ", 7, "", " history "], workshopDiscoveries: "invalid" },
    { outcome: "death" }
  ]
});

assert.deepEqual(normalized.currentRun.firstKillsBefore, expected);
assert.deepEqual(normalized.currentRun.keyItemsBefore, []);
assert.deepEqual(normalized.currentRun.codexDiscoveries, ["A", "", "A"]);
assert.deepEqual(normalized.currentRun.workshopDiscoveries, ["WORKSHOP", "WORKSHOP"]);
assert.equal(Object.hasOwn(normalized.currentRun, "firstKills"), false,
  "legacy currentRun.firstKills is discarded");
assert.deepEqual(normalized.firstKills, ["global-before"], "legacy currentRun.firstKills does not alter global firstKills");
assert.deepEqual(normalized.currentRun.firstKillsBefore, expected,
  "legacy currentRun.firstKills does not populate firstKillsBefore");
assert.deepEqual(normalized.currentRun.codexDiscoveries, ["A", "", "A"],
  "legacy currentRun.firstKills does not populate codexDiscoveries");
assert.deepEqual(normalized.runHistory[0].codexDiscoveries, [" history ", "", " history "]);
assert.deepEqual(normalized.runHistory[0].workshopDiscoveries, []);
assert.equal(Object.hasOwn(normalized.runHistory[1], "codexDiscoveries"), false,
  "missing historical discoveries are not reconstructed");
assert.equal(Object.hasOwn(normalized.runHistory[1], "workshopDiscoveries"), false);
assert.deepEqual(
  normalizeSavePayload(JSON.parse(JSON.stringify(normalized))).currentRun,
  normalized.currentRun,
  "canonical current-run discovery state is stable after JSON roundtrip"
);

console.log("[PASS] canonical run-discovery types, guards, normalization, retirement, and migration invariants");
