import assert from "node:assert/strict";

import { createDefaultCurrentRun } from "../../../src/state/initial_state.js";
import { isNormalizedCurrentRun } from "../../../src/state/run_state.js";
import { normalizeSavePayload } from "../../../src/state/save_migrations.js";
import {
  isNormalizedReturnItemRecord,
  isNormalizedReturnItemHistory,
  isNormalizedRunInsight,
  isNormalizedWorkshopUnlock,
  isNormalizedReturnProcessing,
  normalizeReturnItemRecord,
  normalizeReturnItemHistory,
  normalizeRunInsights,
  isNormalizedRunInsights,
  normalizeWorkshopUnlocks,
  normalizeReturnProcessing
} from "../../../src/state/run_return_state.js";

const rawItem = {
  baseId: "LONG_SWORD",
  type: "invalid",
  rarity: "invalid",
  status: "invalid",
  wasEquipped: "yes",
  depth: -2,
  extra: "drop me"
};
const normalizedItem = normalizeReturnItemRecord(rawItem);
assert.deepEqual(normalizedItem, {
  baseId: "LONG_SWORD",
  name: "LONG_SWORD",
  type: "item",
  rarity: "common",
  knowledgeStage: "unknown",
  status: "observed",
  wasEquipped: false,
  depth: 1
});
assert.equal(isNormalizedReturnItemRecord(normalizedItem), true);
assert.equal(Object.hasOwn(normalizedItem, "extra"), false);
assert.equal(normalizeReturnItemRecord(null), null);
assert.equal(normalizeReturnItemRecord({ baseId: 1 }), null);

const historyInput = [
  { baseId: "A", depth: 2 },
  { nope: true },
  { baseId: "B", status: "lost" },
  { baseId: "C" },
  { baseId: "D" },
  { baseId: "E" },
  { baseId: "F" }
];
const history = normalizeReturnItemHistory(historyInput);
assert.deepEqual(history.map(item => item.baseId), ["A", "B", "C", "D", "E"]);
assert.equal(isNormalizedReturnItemHistory(history), true);
assert.equal(isNormalizedReturnItemHistory([...history, history[0]]), false);
assert.deepEqual(normalizeReturnItemHistory("not an array"), []);

const insights = normalizeRunInsights([
  { id: "first", label: 123, extra: true },
  { id: "", label: "empty" },
  { id: 2, label: "invalid id" },
  { id: "second", label: "Second" },
  ...Array.from({ length: 20 }, (_, index) => ({ id: `tail-${index}`, label: String(index) }))
]);
assert.deepEqual(insights[0], { id: "first", label: "" });
assert.deepEqual(insights[1], { id: "second", label: "Second" });
assert.equal(insights.length, 20);
assert.equal(insights.at(-1).id, "tail-17");
assert.equal(isNormalizedRunInsight(insights[0]), true);
assert.equal(isNormalizedRunInsights([...insights, { id: "overflow", label: "" }]), false);
assert.deepEqual(normalizeRunInsights(null), []);

const unlocks = normalizeWorkshopUnlocks([
  {
    nodeId: "pool_trap_eater",
    name: "Trap Eater",
    description: "A lateral path",
    matchedSignals: ["tag", 1, "knowledge", "type", "a", "b", "c", "d"],
    extra: true
  },
  { nodeId: "", name: "drop" },
  { nodeId: "pool_second", matchedSignals: "invalid" }
]);
assert.deepEqual(unlocks, [
  {
    nodeId: "pool_trap_eater",
    name: "Trap Eater",
    description: "A lateral path",
    matchedSignals: ["tag", "knowledge", "type", "a", "b", "c"]
  },
  {
    nodeId: "pool_second",
    name: "",
    description: "",
    matchedSignals: []
  }
]);
assert.equal(isNormalizedWorkshopUnlock(unlocks[0]), true);

const processing = normalizeReturnProcessing({
  outcome: "historical-outcome",
  returnedObjectCount: -1,
  lostObjectCount: "invalid",
  recoveredEquipmentCount: 2.5,
  extra: true
});
assert.deepEqual(processing, {
  outcome: "historical-outcome",
  returnedObjectCount: 0,
  lostObjectCount: 0,
  recoveredEquipmentCount: 0
});
assert.equal(isNormalizedReturnProcessing(processing), true);
assert.equal(normalizeReturnProcessing([]), null);

const baseRun = createDefaultCurrentRun();
assert.equal(isNormalizedCurrentRun(baseRun), true);
assert.equal(isNormalizedCurrentRun({ ...baseRun, representativeItem: { baseId: "A" } }), false);
assert.equal(isNormalizedCurrentRun({ ...baseRun, meaningfulItemHistory: [normalizedItem] }), true);
assert.equal(isNormalizedCurrentRun({ ...baseRun, codexInsights: [{ id: "x", label: "X" }] }), true);
assert.equal(isNormalizedCurrentRun({
  ...baseRun,
  workshopUnlocks: [unlocks[0]],
  returnProcessing: processing
}), true);
for (const field of [
  "representativeItem", "meaningfulItemHistory", "codexInsights", "workshopUnlocks", "returnProcessing"
]) {
  const missing = { ...baseRun };
  delete missing[field];
  assert.equal(isNormalizedCurrentRun(missing), false, `${field} remains required`);
}

const normalizedSave = normalizeSavePayload({
  runHistory: [{
    representativeItem: rawItem,
    meaningfulItemHistory: historyInput,
    returnProcessing: { outcome: "history-outcome", returnedObjectCount: -1, extra: true }
  }],
  currentRun: {
    ...baseRun,
    representativeItem: { ...rawItem },
    meaningfulItemHistory: historyInput,
    codexInsights: [{ id: "preserved", label: "Before" }],
    workshopUnlocks: unlocks,
    returnProcessing: { outcome: "legacy-outcome", returnedObjectCount: -1 },
    itemsFound: ["HEAL_POTION"]
  }
});
const normalized = normalizedSave.currentRun;
assert.equal(normalized.representativeItem.baseId, "LONG_SWORD");
assert.deepEqual(normalized.meaningfulItemHistory.map(item => item.baseId), ["A", "B", "C", "D", "E"]);
assert.deepEqual(normalized.codexInsights, [{ id: "preserved", label: "Before" }]);
assert.equal(normalized.workshopUnlocks[0].matchedSignals.length, 6);
assert.deepEqual(normalized.returnProcessing, {
  outcome: "legacy-outcome",
  returnedObjectCount: 0,
  lostObjectCount: 0,
  recoveredEquipmentCount: 0
});
assert.equal(normalizedSave.runHistory[0].representativeItem.baseId, "LONG_SWORD");
assert.deepEqual(normalizedSave.runHistory[0].meaningfulItemHistory.map(item => item.baseId), ["A", "B", "C", "D", "E"]);
assert.deepEqual(normalizedSave.runHistory[0].returnProcessing, {
  outcome: "history-outcome",
  returnedObjectCount: 0,
  lostObjectCount: 0,
  recoveredEquipmentCount: 0
});
assert.deepEqual(normalized.itemsFound, ["HEAL_POTION"]);
assert.deepEqual(normalizeSavePayload(JSON.parse(JSON.stringify({ currentRun: normalized }))).currentRun, normalized);
assert.equal(normalized.representativeItem.baseId, "LONG_SWORD");
assert.equal(normalized.meaningfulItemHistory[0].baseId, "A");
assert.equal(Object.hasOwn(normalized.representativeItem, "extra"), false);

console.log("[PASS] #1518 canonical run-return types, guards, normalizers, delegation, and save invariants");
