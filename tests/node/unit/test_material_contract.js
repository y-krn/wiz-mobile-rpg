import assert from "node:assert/strict";

import {
  isNormalizedBankedMaterials,
  isNormalizedMaterialRecord,
  isNormalizedRunMaterials,
  normalizeBankedMaterials,
  normalizeMaterialRecord,
  normalizeRunMaterials
} from "../../../src/state/material_state.js";
import { createDefaultCurrentRun } from "../../../src/state/initial_state.js";
import { normalizeSavePayload } from "../../../src/state/save_migrations.js";
import { isNormalizedCurrentRun } from "../../../src/state/run_state.js";
import { canAffordMaterials, getBankedMaterials, spendMaterials } from "../../../src/rules/material_rules.js";

const malformedValues = {
  "": 7,
  "鉄片": "2",
  "黒角": -1,
  "竜鱗": 1.5,
  "魔石片": Number.NaN,
  "呪布": Number.POSITIVE_INFINITY,
  "毒腺": null,
  "骨片": {}
};
const rawMaterials = {
  "獣の牙": 4,
  "霊粉": 0,
  "removed-material": 3,
  " 獣の牙 ": 2,
  ...malformedValues
};
const expectedMaterials = {
  "獣の牙": 4,
  "霊粉": 0,
  "removed-material": 3,
  " 獣の牙 ": 2
};

assert.deepEqual(normalizeMaterialRecord(rawMaterials), expectedMaterials,
  "shared material normalizer keeps valid values and exact non-empty keys");
assert.deepEqual(normalizeRunMaterials(rawMaterials), expectedMaterials,
  "run-material normalizer delegates to the shared record normalizer");
assert.deepEqual(normalizeBankedMaterials(rawMaterials), expectedMaterials,
  "banked-material normalizer delegates to the shared record normalizer");
assert.deepEqual(normalizeMaterialRecord(null), {}, "non-record material input becomes empty");
assert.deepEqual(normalizeMaterialRecord([]), {}, "array material input becomes empty");
assert.equal(isNormalizedMaterialRecord(expectedMaterials), true, "canonical material record accepted");
assert.equal(isNormalizedRunMaterials(expectedMaterials), true, "canonical run materials accepted");
assert.equal(isNormalizedBankedMaterials(expectedMaterials), true, "canonical banked materials accepted");
assert.equal(isNormalizedMaterialRecord(rawMaterials), false, "invalid material quantity rejects the record");

const baseRun = createDefaultCurrentRun();
const normalized = normalizeSavePayload({
  metaMaterials: { "meta-only": 8 },
  workshop: { ranks: {}, lateralUnlocks: [] },
  currentRun: {
    ...baseRun,
    materials: rawMaterials,
    bankedMaterials: { "banked-only": 5, "霊粉": 0 }
  }
}).currentRun;
assert.deepEqual(normalized.materials, expectedMaterials, "save boundary canonicalizes materials");
assert.deepEqual(normalized.bankedMaterials, { "banked-only": 5, "霊粉": 0 },
  "save boundary canonicalizes bankedMaterials independently");
assert.equal(normalized.materials["banked-only"], undefined,
  "materials are not repaired from bankedMaterials");
assert.equal(normalized.bankedMaterials["removed-material"], undefined,
  "bankedMaterials are not repaired from materials");
assert.deepEqual(normalizeSavePayload({
  metaMaterials: { "meta-only": 8 },
  workshop: { ranks: {}, lateralUnlocks: [] },
  currentRun: { ...baseRun, materials: {}, bankedMaterials: { "banked-only": 5 } }
}).metaMaterials, { "meta-only": 8 }, "metaMaterials remain unchanged");

assert.equal(isNormalizedCurrentRun(normalized), true, "currentRun guard accepts canonical material fields");
assert.equal(isNormalizedCurrentRun({ ...normalized, materials: { "獣の牙": "2" } }), false,
  "currentRun guard delegates materials validation");
assert.equal(isNormalizedCurrentRun({ ...normalized, bankedMaterials: { "獣の牙": -1 } }), false,
  "currentRun guard delegates bankedMaterials validation");
assert.deepEqual(normalizeSavePayload({ currentRun: normalized }).currentRun, normalized,
  "material normalization is idempotent");
assert.deepEqual(
  normalizeSavePayload({ currentRun: JSON.parse(JSON.stringify(normalized)) }).currentRun,
  normalized,
  "canonical material fields survive JSON roundtrip"
);

assert.equal(canAffordMaterials({ "獣の牙": 1 }, { "獣の牙": 1 }), true,
  "existing affordability semantics remain intact");
assert.equal(spendMaterials({ "獣の牙": 1 }, { "獣の牙": 1 })["獣の牙"], 0,
  "merchant spend keeps zero balance");
assert.equal(getBankedMaterials({ "獣の牙": 10 }, "retreat")["獣の牙"], 10,
  "retreat banking remains intact");
assert.equal(getBankedMaterials({ "獣の牙": 10 }, "death")["獣の牙"], 3,
  "death banking remains intact");
assert.equal(getBankedMaterials({ "獣の牙": 10 }, "abandon")["獣の牙"], 3,
  "abandon banking remains intact");

console.log("[PASS] canonical material record, save boundary, isolation, and economy regression");
