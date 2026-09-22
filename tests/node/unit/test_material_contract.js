import assert from "node:assert/strict";

import {
  isNormalizedBankedMaterials,
  isNormalizedCodexRewards,
  isNormalizedMaterialRecord,
  isNormalizedRunMaterials,
  normalizeBankedMaterials,
  normalizeCodexRewards,
  normalizeMaterialRecord,
  normalizeRunMaterials
} from "../../../src/state/material_state.js";
import { createDefaultCurrentRun } from "../../../src/state/initial_state.js";
import { normalizeSavePayload } from "../../../src/state/save_migrations.js";
import { isNormalizedCurrentRun } from "../../../src/state/run_state.js";
import {
  canAffordMaterials,
  getBankedMaterials,
  normalizeMaterialBalance as normalizeMaterialBalanceFromRules,
  spendMaterials
} from "../../../src/rules/material_rules.js";
import { MATERIAL_TYPES } from "../../../src/data/materials.js";
import {
  isNormalizedMetaMaterialBalance,
  normalizeMaterialBalance
} from "../../../src/state/material_balance.js";

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
const expectedCodexRewards = expectedMaterials;
const saveCodexRewards = { "codex-only": 4, "霊粉": 0 };
const expectedMetaMaterials = Object.fromEntries(MATERIAL_TYPES.map(name => [name, 0]));
const allZeroMetaMaterials = Object.fromEntries(MATERIAL_TYPES.map(name => [name, 0]));
const normalizedMetaMaterials = normalizeMaterialBalance({
  [MATERIAL_TYPES[0]]: 4.9,
  [MATERIAL_TYPES[1]]: "2.8",
  [MATERIAL_TYPES[2]]: -1,
  [MATERIAL_TYPES[3]]: Number.NaN,
  [MATERIAL_TYPES[4]]: Number.POSITIVE_INFINITY,
  [MATERIAL_TYPES[5]]: Symbol("unsupported"),
  unknown: 8
});
expectedMetaMaterials[MATERIAL_TYPES[0]] = 4;
expectedMetaMaterials[MATERIAL_TYPES[1]] = 2;

assert.deepEqual(normalizedMetaMaterials, expectedMetaMaterials,
  "meta material normalizer keeps exact known keys and safe numeric coercion");
assert.deepEqual(normalizeMaterialBalance(null), allZeroMetaMaterials,
  "malformed meta material input becomes all-zero canonical balance");
assert.doesNotThrow(() => normalizeMaterialBalance({ [MATERIAL_TYPES[0]]: Symbol("unsupported") }),
  "Symbol material values use the safe zero fallback");
assert.deepEqual(Object.keys(normalizedMetaMaterials), MATERIAL_TYPES,
  "canonical meta material key order follows MATERIAL_TYPES");
assert.equal(isNormalizedMetaMaterialBalance(normalizedMetaMaterials), true,
  "canonical meta material balance satisfies its dedicated guard");
assert.equal(isNormalizedMetaMaterialBalance({ ...normalizedMetaMaterials, unknown: 1 }), false,
  "extra material key rejects the canonical guard");
assert.equal(isNormalizedMetaMaterialBalance(Object.fromEntries(MATERIAL_TYPES.slice(1).map(name => [name, 0]))), false,
  "missing material key rejects the canonical guard");
assert.equal(isNormalizedMetaMaterialBalance({ ...normalizedMetaMaterials, [MATERIAL_TYPES[0]]: 1.5 }), false,
  "fractional material value rejects the canonical guard");
assert.equal(isNormalizedMetaMaterialBalance({ ...normalizedMetaMaterials, [MATERIAL_TYPES[0]]: -1 }), false,
  "negative material value rejects the canonical guard");
assert.deepEqual(normalizeMaterialBalance(normalizedMetaMaterials), normalizedMetaMaterials,
  "meta material normalization is idempotent");
assert.deepEqual(normalizeMaterialBalance(JSON.parse(JSON.stringify(normalizedMetaMaterials))), normalizedMetaMaterials,
  "meta material normalization survives JSON roundtrip");
assert.deepEqual(normalizeMaterialBalanceFromRules({ [MATERIAL_TYPES[0]]: "3.8", unknown: 9 }),
  normalizeMaterialBalance({ [MATERIAL_TYPES[0]]: "3.8", unknown: 9 }),
  "material_rules normalizer delegates to the canonical owner");

assert.deepEqual(normalizeMaterialRecord(rawMaterials), expectedMaterials,
  "shared material normalizer keeps valid values and exact non-empty keys");
assert.deepEqual(normalizeRunMaterials(rawMaterials), expectedMaterials,
  "run-material normalizer delegates to the shared record normalizer");
assert.deepEqual(normalizeBankedMaterials(rawMaterials), expectedMaterials,
  "banked-material normalizer delegates to the shared record normalizer");
assert.deepEqual(normalizeCodexRewards(rawMaterials), expectedCodexRewards,
  "codex reward normalizer delegates to the shared material record normalizer");
assert.deepEqual(normalizeCodexRewards(null), {}, "non-record codex rewards become empty");
assert.equal(isNormalizedCodexRewards(expectedCodexRewards), true, "canonical codex rewards accepted");
assert.equal(isNormalizedCodexRewards(rawMaterials), false, "invalid codex reward quantity rejects the record");
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
    bankedMaterials: { "banked-only": 5, "霊粉": 0 },
    codexRewards: saveCodexRewards,
    codexDiscoveries: ["codex-state-only"]
  }
}).currentRun;
assert.deepEqual(normalized.materials, expectedMaterials, "save boundary canonicalizes materials");
assert.deepEqual(normalized.bankedMaterials, { "banked-only": 5, "霊粉": 0 },
  "save boundary canonicalizes bankedMaterials independently");
assert.deepEqual(normalized.codexRewards, saveCodexRewards,
  "save boundary canonicalizes codexRewards independently");
assert.equal(Object.hasOwn(normalized, "firstKills"), false, "retired currentRun.firstKills is omitted");
assert.deepEqual(normalized.codexDiscoveries, ["codex-state-only"], "codex state remains independent");
assert.equal(normalized.materials["banked-only"], undefined,
  "materials are not repaired from bankedMaterials");
assert.equal(normalized.bankedMaterials["removed-material"], undefined,
  "bankedMaterials are not repaired from materials");
assert.equal(normalized.materials["codex-only"], undefined,
  "materials are not repaired from codexRewards");
assert.equal(normalized.bankedMaterials["codex-only"], undefined,
  "bankedMaterials are not repaired from codexRewards");
assert.equal(normalized.codexRewards["banked-only"], undefined,
  "codexRewards are not repaired from bankedMaterials");
assert.equal(normalized.codexRewards["meta-only"], undefined,
  "codexRewards are not repaired from metaMaterials");
assert.equal(normalized.codexRewards["history-only"], undefined,
  "codexRewards are not inferred from firstKills");
assert.deepEqual(normalizeSavePayload({
  metaMaterials: { "meta-only": 8 },
  workshop: { ranks: {}, lateralUnlocks: [] },
  currentRun: { ...baseRun, materials: {}, bankedMaterials: { "banked-only": 5 } }
}).metaMaterials, allZeroMetaMaterials, "metaMaterials remain isolated and canonical");

assert.equal(isNormalizedCurrentRun(normalized), true, "currentRun guard accepts canonical material fields");
assert.equal(isNormalizedCurrentRun({ ...normalized, materials: { "獣の牙": "2" } }), false,
  "currentRun guard delegates materials validation");
assert.equal(isNormalizedCurrentRun({ ...normalized, bankedMaterials: { "獣の牙": -1 } }), false,
  "currentRun guard delegates bankedMaterials validation");
assert.equal(isNormalizedCurrentRun({ ...normalized, codexRewards: { "獣の牙": "2" } }), false,
  "currentRun guard delegates codex reward validation");
assert.deepEqual(normalizeSavePayload({ currentRun: normalized }).currentRun, normalized,
  "material and codex reward normalization is idempotent");
assert.deepEqual(
  normalizeSavePayload({ currentRun: JSON.parse(JSON.stringify(normalized)) }).currentRun,
  normalized,
  "canonical material and codex reward fields survive JSON roundtrip"
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
