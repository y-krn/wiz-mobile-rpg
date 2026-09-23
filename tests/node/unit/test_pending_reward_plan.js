import assert from "node:assert/strict";
import * as facade from "../../../src/rules/pending_reward_bundle.js";
import * as owner from "../../../src/rules/pending_reward_bundle.ts";
import { exercisePendingRewardPlanTypes } from "../fixtures/typescript/pending_reward_plan_inputs.ts";

assert.deepEqual(Object.keys(facade).sort(), Object.keys(owner).sort());
for (const name of Object.keys(owner)) {
  assert.strictEqual(facade[name], owner[name], `${name} facade identity`);
}

const { getPendingRewardFinalBagCount, resolvePendingRewardPlan } = owner;
assert.equal(getPendingRewardFinalBagCount(null), 0);
assert.equal(getPendingRewardFinalBagCount(undefined), 0);
assert.equal(getPendingRewardFinalBagCount(false), 0);
assert.equal(getPendingRewardFinalBagCount(0), 0);
assert.equal(getPendingRewardFinalBagCount(""), 0);
assert.equal(getPendingRewardFinalBagCount({ bagCount: Infinity, discardCount: 2, takeCount: 1 }), 0);
assert.equal(getPendingRewardFinalBagCount({ bagCount: 5, discardCount: 2, takeCount: 3 }), 6);
assert.equal(getPendingRewardFinalBagCount({ bagCount: 2, discardCount: 5, takeCount: 0 }), 0);
assert.equal(getPendingRewardFinalBagCount({ bagCount: 5, discardCount: "2", takeCount: "3" }), 33);
assert.equal(getPendingRewardFinalBagCount({ bagCount: "5", discardCount: 2, takeCount: 3 }), 0);
assert.ok(Number.isNaN(getPendingRewardFinalBagCount({ bagCount: 5, discardCount: 2 })));
assert.ok(Number.isNaN(getPendingRewardFinalBagCount({ bagCount: 5, takeCount: 2 })));
assert.ok(Number.isNaN(getPendingRewardFinalBagCount({ bagCount: 5, discardCount: 0, takeCount: NaN })));
const rawPlan = { bagCount: 5, discardCount: 1, takeCount: 2 };
const rawPlanBefore = { ...rawPlan };
getPendingRewardFinalBagCount(rawPlan);
assert.deepEqual(rawPlan, rawPlanBefore, "final-bag helper does not mutate input");

const defaults = { ok: true, bagCount: 0, rewardCount: 0, takeCount: 0, discardCount: 0, turnCost: 0 };
assert.deepEqual(resolvePendingRewardPlan(), defaults);
assert.deepEqual(resolvePendingRewardPlan(undefined), defaults);
assert.throws(() => resolvePendingRewardPlan(null), TypeError);
assert.deepEqual(resolvePendingRewardPlan({
  bagCount: "18", rewardCount: "4", takeCount: "2", discardCount: "1", loadoutChanged: true
}), { ok: true, bagCount: 18, rewardCount: 4, takeCount: 2, discardCount: 1, turnCost: 1 });
assert.deepEqual(resolvePendingRewardPlan({
  bagCount: -2, rewardCount: -3, takeCount: -1, discardCount: -1, loadoutChanged: false
}), { ok: true, bagCount: 0, rewardCount: 0, takeCount: 0, discardCount: 0, turnCost: 0 });
assert.deepEqual(resolvePendingRewardPlan({
  bagCount: 5.9, rewardCount: 4.8, takeCount: 2.9, discardCount: 1.9
}), { ok: true, bagCount: 5, rewardCount: 4, takeCount: 2, discardCount: 1, turnCost: 0 });
assert.deepEqual(resolvePendingRewardPlan({ bagCount: 2, rewardCount: 1, takeCount: 9 }),
  { ok: true, bagCount: 2, rewardCount: 1, takeCount: 1, discardCount: 0, turnCost: 0 });
assert.deepEqual(resolvePendingRewardPlan({ bagCount: 4, rewardCount: 0, discardCount: 9 }),
  { ok: true, bagCount: 4, rewardCount: 0, takeCount: 0, discardCount: 4, turnCost: 0 });
assert.deepEqual(resolvePendingRewardPlan({ bagCount: 19, rewardCount: 1, takeCount: 1 }),
  { ok: true, bagCount: 19, rewardCount: 1, takeCount: 1, discardCount: 0, turnCost: 0 });
assert.deepEqual(resolvePendingRewardPlan({ bagCount: 20, rewardCount: 1, takeCount: 0 }),
  { ok: true, bagCount: 20, rewardCount: 1, takeCount: 0, discardCount: 0, turnCost: 0 });
assert.deepEqual(resolvePendingRewardPlan({ bagCount: 20, rewardCount: 1, takeCount: 1 }),
  { ok: false, bagCount: 20, rewardCount: 1, takeCount: 1, discardCount: 0, turnCost: 0 });
assert.deepEqual(resolvePendingRewardPlan({ bagCount: 18, loadoutChanged: "yes" }),
  { ok: true, bagCount: 18, rewardCount: 0, takeCount: 0, discardCount: 0, turnCost: 1 });
assert.deepEqual(resolvePendingRewardPlan({ bagCount: 20, rewardCount: 1, takeCount: 1, loadoutChanged: "yes" }),
  { ok: false, bagCount: 20, rewardCount: 1, takeCount: 1, discardCount: 0, turnCost: 0 });
const orderedResult = resolvePendingRewardPlan({ bagCount: 2, loadoutChanged: true });
assert.deepEqual(Object.keys(orderedResult), ["ok", "bagCount", "rewardCount", "takeCount", "discardCount", "turnCost"]);
assert.deepEqual(orderedResult, { ok: true, bagCount: 2, rewardCount: 0, takeCount: 0, discardCount: 0, turnCost: 1 });
const input = { bagCount: "18", rewardCount: "3", takeCount: "2", discardCount: "1", loadoutChanged: true };
const inputBefore = { ...input };
resolvePendingRewardPlan(input);
assert.deepEqual(input, inputBefore, "plan resolver does not mutate input");
assert.equal(typeof exercisePendingRewardPlanTypes(), "number");
