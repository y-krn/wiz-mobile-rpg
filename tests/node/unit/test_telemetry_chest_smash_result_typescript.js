import assert from "node:assert/strict";
import {
  buildChestSmashResultPayload
} from "../../../src/telemetry_chest_smash_result.ts";
import { DEFAULT_TELEMETRY_ENUM_ARRAY_CAP } from "../../../src/telemetry_normalization.ts";
import { chestSmashResultInputFixture } from "../fixtures/typescript/telemetry_chest_smash_result_input.ts";

const fixturePayload = buildChestSmashResultPayload(chestSmashResultInputFixture);
assert.deepEqual(Object.keys(fixturePayload), [
  "runId", "floor", "chestSource", "fromDrop", "trapFired", "partyDied", "rewardCount",
  "lostRewardCount", "lostRewardRoles", "lostRewardCategories", "remainingRewardCount",
  "awardedRewardCount", "unawardedRewardCount"
]);
assert.equal(fixturePayload.chestSource, "fromDrop");
assert.equal(fixturePayload.fromDrop, true);

const order = [];
const orderedDetails = {};
for (const [name, value] of Object.entries({
  floor: "",
  trapFired: 1,
  partyDied: 0,
  rewardCount: null,
  lostRewardCount: -2.5,
  lostRewardRoles: ["main", " MAIN ", "invalid"],
  lostRewardCategories: "usable",
  remainingRewardCount: Infinity,
  awardedRewardCount: "2.5",
  unawardedRewardCount: false
})) {
  Object.defineProperty(orderedDetails, name, {
    get() { order.push(name); return value; }
  });
}
let chestReads = 0;
const chest = { get fromDrop() { order.push(`fromDrop${++chestReads}`); return chestReads === 1 ? "first" : 0; } };
const payload = buildChestSmashResultPayload({
  get runId() { order.push("runId"); return "ordered-run"; },
  chest,
  details: orderedDetails,
  safeRewardRoles: new Set(["main"]),
  safeRewardCategories: new Set(["usable"])
});
assert.deepEqual(order, [
  "runId", "floor", "fromDrop1", "fromDrop2", "trapFired", "partyDied", "rewardCount", "lostRewardCount",
  "lostRewardRoles", "lostRewardCategories", "remainingRewardCount", "awardedRewardCount", "unawardedRewardCount"
]);
assert.equal(chestReads, 2);
assert.equal(payload.chestSource, "fromDrop");
assert.equal(payload.fromDrop, false);
assert.equal(payload.floor, 0);
assert.equal(payload.trapFired, true);
assert.equal(payload.partyDied, false);
assert.equal(payload.rewardCount, 0);
assert.equal(payload.lostRewardCount, 0);
assert.deepEqual(payload.lostRewardRoles, ["main", "other", "other"]);
assert.deepEqual(payload.lostRewardCategories, []);
assert.equal(payload.remainingRewardCount, null);
assert.equal(payload.awardedRewardCount, 2.5);
assert.equal(payload.unawardedRewardCount, 0);

for (const nullishChest of [null, undefined]) {
  const noChestPayload = buildChestSmashResultPayload({
    ...chestSmashResultInputFixture,
    chest: nullishChest
  });
  assert.equal(noChestPayload.chestSource, "ordinary");
  assert.equal(noChestPayload.fromDrop, false);
}

const numericPayload = buildChestSmashResultPayload({
  ...chestSmashResultInputFixture,
  details: {
    floor: undefined,
    rewardCount: "invalid",
    lostRewardCount: Number.NaN,
    remainingRewardCount: 1_000_001,
    awardedRewardCount: -2.5,
    unawardedRewardCount: true
  }
});
assert.equal(numericPayload.floor, null);
assert.equal(numericPayload.rewardCount, null);
assert.equal(numericPayload.lostRewardCount, null);
assert.equal(numericPayload.remainingRewardCount, 1_000_000);
assert.equal(numericPayload.awardedRewardCount, 0);
assert.equal(numericPayload.unawardedRewardCount, 1);

const capped = buildChestSmashResultPayload({
  ...chestSmashResultInputFixture,
  details: {
    ...chestSmashResultInputFixture.details,
    lostRewardRoles: Array(25).fill("main"),
    lostRewardCategories: Array(25).fill("usable")
  }
});
assert.equal(DEFAULT_TELEMETRY_ENUM_ARRAY_CAP, 24);
assert.equal(capped.lostRewardRoles.length, 24);
assert.equal(capped.lostRewardCategories.length, 24);

const sparse = ["main"];
sparse.length = 3;
Object.defineProperty(sparse, 2, { get() { return "main"; } });
const sparsePayload = buildChestSmashResultPayload({
  ...chestSmashResultInputFixture,
  details: { ...chestSmashResultInputFixture.details, lostRewardRoles: sparse }
});
assert.equal(sparsePayload.lostRewardRoles.length, 3);
assert.equal(sparsePayload.lostRewardRoles[0], "main");
assert.equal(1 in sparsePayload.lostRewardRoles, false);
assert.equal(sparsePayload.lostRewardRoles[2], "main");

const accessorBeyondCap = Array(24).fill("main");
accessorBeyondCap.length = 25;
Object.defineProperty(accessorBeyondCap, 24, { get() { throw new Error("read beyond normalization slice"); } });
const accessorPayload = buildChestSmashResultPayload({
  ...chestSmashResultInputFixture,
  details: { ...chestSmashResultInputFixture.details, lostRewardRoles: accessorBeyondCap }
});
assert.equal(accessorPayload.lostRewardRoles.length, 24);

console.log("[PASS] TypeScript chest smash telemetry owner preserves payload, normalization, and getter order");
