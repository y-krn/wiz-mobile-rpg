import assert from "node:assert/strict";
import { buildChestActionPayload } from "../../../src/telemetry_chest_action.ts";
import { chestActionInputFixture } from "../fixtures/typescript/telemetry_chest_action_input.ts";

const fixturePayload = buildChestActionPayload(chestActionInputFixture);
assert.deepEqual(Object.keys(fixturePayload), [
  "runId", "contextOnly", "floor", "inventoryCount", "chestSource", "fromDrop", "action", "trap",
  "inspected", "hasTrapKit", "rewardCount", "rewardCategories", "lootAura"
]);
assert.equal(fixturePayload.floor, 2);
assert.equal(fixturePayload.inventoryCount, 4.5);
assert.equal(fixturePayload.chestSource, "fromDrop");
assert.equal(fixturePayload.fromDrop, true);
assert.equal(fixturePayload.trap, "poison needle");
assert.equal(fixturePayload.rewardCount, 0);
assert.deepEqual(fixturePayload.rewardCategories, ["weapon", "other"]);
assert.equal(fixturePayload.lootAura, "strong");
assert.equal(fixturePayload.contextOnly, "kept");

const order = [];
const details = {};
const detailValues = {
  floor: "",
  trap: null,
  inventoryCount: -1.25,
  hasTrapKit: "false",
  rewardCount: Infinity,
  rewardCategories: ["weapon", " WEAPON ", "removed", "armor", "usable"]
};
for (const [name, value] of Object.entries(detailValues)) {
  Object.defineProperty(details, name, {
    get() { order.push(name); return value; }
  });
}
let fromDropReads = 0;
const chest = {
  get fromDrop() {
    order.push(`fromDrop${++fromDropReads}`);
    return fromDropReads === 1 ? "drop" : 0;
  },
  get inspected() { order.push("inspected"); return 1; },
  get lootHint() { order.push("lootHint"); return { get aura() { order.push("aura"); return "moved"; } }; }
};
const ordered = buildChestActionPayload({
  ...chestActionInputFixture,
  context: { floor: "context floor", runId: "context run", contextOnly: true },
  chest,
  action: "OPEN",
  details
});
assert.deepEqual(order, [
  "floor", "fromDrop1", "fromDrop2", "trap", "inspected", "inventoryCount", "hasTrapKit", "rewardCount",
  "rewardCategories", "lootHint", "aura"
]);
assert.equal(fromDropReads, 2);
assert.equal(ordered.chestSource, "fromDrop");
assert.equal(ordered.fromDrop, false);
assert.equal(ordered.floor, 0);
assert.equal(ordered.runId, "context run");
assert.equal(ordered.action, "other");
assert.equal(ordered.trap, "none");
assert.equal(ordered.inspected, true);
assert.equal(ordered.inventoryCount, 0);
assert.equal(ordered.hasTrapKit, true);
assert.equal(ordered.rewardCount, null);
assert.deepEqual(ordered.rewardCategories, ["weapon", "other", "other"]);
assert.equal(ordered.lootAura, "other");

for (const trap of ["", false, 0, "Poison needle", " poison needle "]) {
  assert.equal(buildChestActionPayload({
    ...chestActionInputFixture,
    details: { ...chestActionInputFixture.details, trap }
  }).trap, "other");
}
for (const trap of [null, undefined]) {
  assert.equal(buildChestActionPayload({
    ...chestActionInputFixture,
    details: { ...chestActionInputFixture.details, trap }
  }).trap, "none");
}

const sparse = ["weapon"];
sparse.length = 4;
Object.defineProperty(sparse, 2, { get() { return "armor"; } });
const sparsePayload = buildChestActionPayload({
  ...chestActionInputFixture,
  details: { ...chestActionInputFixture.details, rewardCategories: sparse }
});
assert.equal(sparsePayload.rewardCategories.length, 3);
assert.equal(1 in sparsePayload.rewardCategories, false);
assert.equal(sparsePayload.rewardCategories[2], "armor");

const beyondSetCap = ["weapon", "usable", "armor"];
beyondSetCap.length = 4;
Object.defineProperty(beyondSetCap, 3, { get() { throw new Error("read beyond production set cap"); } });
assert.equal(buildChestActionPayload({
  ...chestActionInputFixture,
  details: { ...chestActionInputFixture.details, rewardCategories: beyondSetCap }
}).rewardCategories.length, 3);

for (const aura of [null, undefined, ""]) {
  assert.equal(buildChestActionPayload({
    ...chestActionInputFixture,
    chest: { lootHint: { aura } }
  }).lootAura, null);
}
for (const chestValue of [null, undefined]) {
  assert.equal(buildChestActionPayload({
    ...chestActionInputFixture,
    chest: chestValue
  }).lootAura, null);
}

console.log("[PASS] TypeScript chest action owner preserves payload order and normalization");
