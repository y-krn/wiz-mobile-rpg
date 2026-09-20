import assert from "node:assert/strict";
import {
  applySavePayload,
  createDefaultCurrentRun,
  createSavePayload,
  createStartingKitCharacter,
  state
} from "../../../src/state.js";
import { normalizeSavePayload } from "../../../src/state/save_migrations.js";
import {
  isNormalizedPendingRewardBundle
} from "../../../src/state/pending_reward.js";
import { isNormalizedCurrentRun } from "../../../src/state/run_state.js";

state.party = [createStartingKitCharacter("vanguard")];
state.gameState = "town";
const basePayload = createSavePayload();

function normalizeBundle(bundle) {
  const normalized = normalizeSavePayload({
    ...basePayload,
    currentRun: { ...createDefaultCurrentRun(), pendingRewardBundle: bundle }
  });
  return normalized.currentRun.pendingRewardBundle;
}

const validBundle = {
  id: "pending-1",
  source: "chest",
  floor: 2,
  x: -3,
  y: null,
  entries: [{
    id: "reward-1",
    role: "main",
    item: "UNKNOWN_ITEM_ID",
    decision: null,
    loadoutAction: { type: "", actorIdx: -1, requestedSlot: "" }
  }],
  discardIndexes: [0, 99]
};

assert.equal(isNormalizedPendingRewardBundle(validBundle), true, "valid normalized bundle is accepted");
assert.equal(isNormalizedPendingRewardBundle(null), false, "null is outside the bundle contract");
assert.equal(isNormalizedPendingRewardBundle({ ...validBundle, entries: [] }), false,
  "empty entries are rejected");
assert.equal(isNormalizedPendingRewardBundle({
  ...validBundle,
  entries: Object.assign([], { 1: validBundle.entries[0], length: 2 })
}), false, "sparse entries are rejected");
assert.equal(isNormalizedPendingRewardBundle({ ...validBundle, discardIndexes: [0, 0] }), false,
  "duplicate discard indexes are rejected");
assert.equal(isNormalizedPendingRewardBundle({ ...validBundle, discardIndexes: [-1] }), false,
  "negative discard indexes are rejected");
assert.equal(isNormalizedPendingRewardBundle({
  ...validBundle,
  entries: [{ ...validBundle.entries[0], item: { baseId: "WAND", instanceId: 1, affixes: [] } }]
}), false, "malformed RuntimeItemRef is rejected");

assert.equal(normalizeBundle({ ...validBundle, entries: [] }), null,
  "empty entries normalize to null");

const normalized = normalizeBundle({
  ...validBundle,
  floor: 0,
  x: "bad",
  y: 1.5,
  discardIndexes: [0, 0, -1, 99, 2],
  entries: [
    { id: "malformed", item: null },
    {
      id: "normalized",
      role: 42,
      item: "UNKNOWN_ITEM_ID",
      decision: "invalid",
      loadoutAction: { type: "unknown", actorIdx: "bad", requestedSlot: 42 }
    }
  ]
});
assert.ok(normalized);
assert.equal(normalized.floor, 1, "invalid floor falls back to one");
assert.equal(normalized.x, null, "malformed x falls back to null");
assert.equal(normalized.y, null, "malformed y falls back to null");
assert.deepEqual(normalized.discardIndexes, [0, 99, 2],
  "discard indexes dedupe and retain values beyond current inventory length");
assert.equal(normalized.entries.length, 1, "malformed entries are filtered");
assert.equal(normalized.entries[0].role, "object");
assert.equal(normalized.entries[0].decision, null, "invalid decision falls back to null");
assert.deepEqual(normalized.entries[0].loadoutAction, {
  type: "",
  actorIdx: 0,
  requestedSlot: ""
}, "invalid action fields keep normalizer fallbacks");
assert.equal(isNormalizedPendingRewardBundle(normalized), true,
  "normalizer output with invalid action type is accepted by the guard");

const negativeActorBundle = normalizeBundle({
  ...validBundle,
  entries: [{
    ...validBundle.entries[0],
    loadoutAction: { type: "equip", actorIdx: -2, requestedSlot: "weapon" }
  }]
});
assert.equal(negativeActorBundle.entries[0].loadoutAction.actorIdx, -2,
  "negative integer actorIdx remains compatible");

const legacyEquipment = normalizeBundle({
  ...validBundle,
  entries: [{ ...validBundle.entries[0], item: { baseId: "WAND", affixes: [] } }]
});
assert.equal(typeof legacyEquipment.entries[0].item.instanceId, "string",
  "legacy equipment receives an instanceId before final validation");
assert.equal(isNormalizedPendingRewardBundle(legacyEquipment), true,
  "supported legacy equipment is accepted after backfill");

const filteredMalformedItem = normalizeBundle({
  ...validBundle,
  entries: [
    { ...validBundle.entries[0], id: "malformed", item: { baseId: "WAND", instanceId: 1, affixes: [] } },
    validBundle.entries[0]
  ]
});
assert.equal(filteredMalformedItem.entries.length, 1,
  "malformed RuntimeItemRef is filtered after normalization");
assert.equal(filteredMalformedItem.entries[0].id, "reward-1");

const roundTrip = JSON.parse(JSON.stringify(normalized));
assert.equal(isNormalizedPendingRewardBundle(roundTrip), true,
  "unresolved bundle survives JSON roundtrip");

const normalizedRun = normalizeSavePayload({ ...basePayload, currentRun: createDefaultCurrentRun() }).currentRun;
assert.equal(isNormalizedCurrentRun({ ...normalizedRun, pendingRewardBundle: { ...validBundle, entries: [] } }), false,
  "currentRun delegates pending bundle validation");

const before = { party: state.party, inventory: state.inventory, currentRun: state.currentRun };
assert.throws(
  () => applySavePayload({
    ...basePayload,
    currentRun: { ...createDefaultCurrentRun(), pendingRewardBundle: {
      ...validBundle,
      entries: [{ ...validBundle.entries[0], item: Symbol("malformed-item") }]
    } }
  }),
  error => error?.name === "MalformedSavePayloadError",
  "malformed pending bundle rejects before live mutation"
);
assert.strictEqual(state.party, before.party);
assert.strictEqual(state.inventory, before.inventory);
assert.strictEqual(state.currentRun, before.currentRun);

console.log("[PASS] pending reward canonical contract, normalization compatibility, and atomic apply");
