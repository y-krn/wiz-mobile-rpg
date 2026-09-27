import assert from "node:assert/strict";
import { buildEquipmentDecisionPayload } from "../../../src/telemetry_equipment_decision.ts";
import { EQUIPMENT_SLOTS } from "../../../src/rules/equipment_slots.js";
import { MAX_TELEMETRY_RESOURCE_VALUE } from "../../../src/telemetry_normalization.ts";
import { equipmentDecisionInputFixture } from "../fixtures/typescript/telemetry_equipment_decision_input.ts";

const base = {
  ...equipmentDecisionInputFixture,
  safeEquipmentSlots: new Set(EQUIPMENT_SLOTS.map(entry => entry.id)),
  safeComparisonStatKeys: new Set(["attack", "defense"]),
  maxResourceValue: MAX_TELEMETRY_RESOURCE_VALUE
};

const payload = buildEquipmentDecisionPayload(base);
assert.deepEqual(Object.keys(payload), [
  "runId", "floor", "action", "candidateId", "currentEquipmentId", "candidateBuildRole",
  "currentBuildRole", "buildDecision", "slot", "candidateRarity", "candidateIdentified",
  "candidateEnhancementLevel", "primaryDiff", "comparisonStatKeys", "comparisonDiffs",
  "comparisonAvailable"
]);
assert.equal(payload.action, "equip");
assert.equal(payload.slot, "weapon");
assert.equal(payload.comparisonAvailable, true);

const precedence = buildEquipmentDecisionPayload({
  ...base,
  context: { runId: "context-run", action: "context-action", slot: "context-slot" },
  action: "fight",
  slot: "invalid"
});
assert.equal(precedence.runId, "context-run");
assert.equal(precedence.action, "attack");
assert.equal(precedence.slot, "other");

for (const [slot, expected] of [[null, null], [undefined, null], ["", null], ["unknown", "other"]]) {
  assert.equal(buildEquipmentDecisionPayload({ ...base, slot }).slot, expected);
}
for (const action of ["compare", "equip", "trial", "unequip", "discard"]) {
  assert.equal(buildEquipmentDecisionPayload({ ...base, action }).action, action);
}
assert.equal(buildEquipmentDecisionPayload({ ...base, action: "unknown" }).action, "other");

for (const [candidateEnhancementLevel, primaryDiff, expectedEnhancement, expectedDiff] of [
  [null, null, 0, 0], ["", "", 0, 0], ["2.5", "-2.5", 2.5, -2.5], [-3.25, -3.25, -3.25, -3.25],
  ["invalid", Number.POSITIVE_INFINITY, null, null], [MAX_TELEMETRY_RESOURCE_VALUE + 1, 0, MAX_TELEMETRY_RESOURCE_VALUE, 0]
]) {
  const numeric = buildEquipmentDecisionPayload({ ...base, candidateEnhancementLevel, primaryDiff });
  assert.equal(numeric.candidateEnhancementLevel, expectedEnhancement);
  assert.equal(numeric.primaryDiff, expectedDiff);
}

const rows = Array.from({ length: 26 }, (_, index) => ({
  key: index < 25 ? "attack" : "invalid",
  diff: index === 1 ? "1.25" : index === 2 ? "invalid" : index
}));
const capped = buildEquipmentDecisionPayload({ ...base, diffRows: rows });
assert.equal(capped.comparisonAvailable, true);
assert.equal(capped.comparisonStatKeys.length, 24);
assert.equal(capped.comparisonDiffs.length, 24);
assert.deepEqual(capped.comparisonStatKeys.slice(0, 3), ["attack", "attack", "attack"]);
assert.deepEqual(capped.comparisonDiffs.slice(0, 4), [0, 1.25, null, 3]);
assert.equal(capped.comparisonStatKeys[23], "attack");
const invalidRows = buildEquipmentDecisionPayload({ ...base, diffRows: [{ key: "invalid", diff: 1 }, null] });
assert.deepEqual(invalidRows.comparisonStatKeys, ["other", "other"]);
assert.deepEqual(invalidRows.comparisonDiffs, [1, null]);
assert.equal(buildEquipmentDecisionPayload({ ...base, diffRows: [] }).comparisonAvailable, false);

for (const [candidateIdentified, candidateRarity] of [[false, null], [true, "rare"]]) {
  const identified = buildEquipmentDecisionPayload({ ...base, candidateIdentified, candidateRarity });
  assert.equal(identified.candidateIdentified, candidateIdentified);
  assert.equal(identified.candidateRarity, candidateRarity);
}

console.log("[PASS] TypeScript equipment decision owner preserves payload normalization semantics");
