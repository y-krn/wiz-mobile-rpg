import assert from "node:assert/strict";
import {
  buildLootLifecyclePayload,
  normalizeLootOwnership,
  normalizeLootSource,
  normalizeLootStage
} from "../../../src/telemetry_loot_lifecycle.ts";

const reads = [];
const itemKey = {
  get identified() { reads.push("identified"); return true; },
  get rarity() { reads.push("rarity"); return "rare"; }
};
const safeStages = new Set(["banked"]);
const safeSources = new Set(["dungeon"]);
const safeOwnerships = new Set(["town"]);
assert.equal(normalizeLootStage("banked", safeStages), "banked");
assert.equal(normalizeLootStage("invalid", safeStages), "other");
assert.equal(normalizeLootSource("invalid", safeSources), "other");
assert.equal(normalizeLootOwnership("invalid", safeOwnerships), "other");

const payload = buildLootLifecyclePayload({
  runId: "run-fixture",
  context: {
    lifecycleStage: "context-value",
    floor: 3,
    get contextValue() { reads.push("context"); return "kept"; }
  },
  lifecycleStage: "banked",
  lootSequence: 4,
  safeSources,
  safeOwnerships,
  getItemKey() { reads.push("itemKey"); return itemKey; },
  get source() { reads.push("source"); return ""; },
  get ownership() { reads.push("ownership"); return ""; },
  getStateFloor() { reads.push("floor"); return 3; },
  getSafeItemId(value) { reads.push("itemId"); assert.equal(value, itemKey); return "DAGGER"; },
  getItemCategory(value) { reads.push("category"); assert.equal(value, itemKey); return "equipment"; },
  getEquipmentBuildRole(value) { reads.push("buildRole"); assert.equal(value, itemKey); return null; },
  getLootSupplyFields(value, floor) {
    reads.push("supply");
    assert.equal(value, itemKey);
    assert.equal(floor, 3);
    return { lootRole: null, lootTier: "B1_5", runeSupplyBand: null };
  },
  getLootValueProxy(value) { reads.push("valueProxy"); assert.equal(value, itemKey); return 5; },
  normalizeRarity(value) { reads.push("normalizeRarity"); return value; },
  summary: { count: 1, valueProxy: 5 }
});

assert.equal(payload.lifecycleStage, "banked");
assert.equal(payload.source, "dungeon");
assert.equal(payload.ownership, "town");
assert.equal(payload.rarity, "rare");
assert.equal(payload.contextValue, "kept");
assert.deepEqual(
  reads.slice(0, 4),
  ["context", "itemKey", "itemId", "itemKey"]
);
assert.ok(reads.indexOf("source") < reads.indexOf("ownership"));
assert.ok(reads.indexOf("ownership") < reads.indexOf("identified"));
assert.ok(reads.indexOf("buildRole") < reads.indexOf("floor"));
assert.ok(reads.indexOf("floor") < reads.indexOf("supply"));
assert.ok(reads.indexOf("supply") < reads.indexOf("valueProxy"));
assert.deepEqual(
  Object.keys(payload).slice(0, 4),
  ["runId", "lifecycleStage", "floor", "contextValue"]
);
assert.deepEqual(
  Object.keys(payload).slice(4),
  [
    "lootSequence", "itemId", "itemCategory", "source", "ownership", "identified",
    "rarity", "buildRole", "lootRole", "lootTier", "runeSupplyBand", "valueProxy",
    "unbankedObjectLootCount", "unbankedObjectLootValueProxy"
  ]
);

console.log("[PASS] loot lifecycle typed payload preserves evaluation order and output shape");
