import assert from "node:assert/strict";
import { buildPortalDecisionPayload } from "../../../src/telemetry_portal_decision.ts";

const input = {
  runId: "run-1",
  context: {
    runId: "context-run",
    portalType: "context-portal",
    decision: "context-decision",
    hpRate: "context-hp",
    customContext: "context-value"
  },
  portalType: "return_wing",
  decision: "continue",
  hpRate: false,
  mpRate: "",
  freeInventorySlots: "17",
  unbankedObjectLootCount: 3,
  unbankedObjectLootValueProxy: 8,
  wingOwned: 0,
  wingSalvageCount: "5",
  nextBandMainId: "short_battle",
  nextBandSubId: "invalid",
  stakeSnapshotFields: {
    decision: "stake-decision",
    stakeSnapshotPoint: "stake-point",
    customContext: "stake-value"
  },
  safePortalTypes: new Set(["milestone_portal", "town_portal", "return_wing"]),
  safePortalDecisions: new Set(["push", "return"]),
  safeBandTrialIds: new Set(["short_battle"])
};

const payload = buildPortalDecisionPayload(input);
assert.deepEqual(Object.keys(payload), [
  "runId", "portalType", "decision", "hpRate", "customContext", "mpRate",
  "freeInventorySlots", "unbankedObjectLootCount", "unbankedObjectLootValueProxy",
  "wingOwned", "wingSalvageCount", "nextBandMainId", "nextBandSubId",
  "stakeSnapshotPoint"
]);
assert.equal(payload.runId, "context-run");
assert.equal(payload.portalType, "return_wing");
assert.equal(payload.decision, "stake-decision");
assert.equal(payload.hpRate, 0);
assert.equal(payload.mpRate, 0);
assert.equal(payload.freeInventorySlots, "17");
assert.equal(payload.unbankedObjectLootCount, 3);
assert.equal(payload.unbankedObjectLootValueProxy, 8);
assert.equal(payload.wingOwned, 0);
assert.equal(payload.wingSalvageCount, 2);
assert.equal(payload.nextBandMainId, "short_battle");
assert.equal(payload.nextBandSubId, "other");
assert.equal(payload.stakeSnapshotPoint, "stake-point");
assert.equal(payload.customContext, "stake-value");

const normalized = buildPortalDecisionPayload({
  ...input,
  context: {},
  decision: "continue",
  hpRate: -1,
  mpRate: 1.5,
  wingOwned: "yes",
  wingSalvageCount: "invalid",
  nextBandMainId: "",
  nextBandSubId: null,
  stakeSnapshotFields: {}
});
assert.equal(normalized.decision, "push");
assert.equal(normalized.hpRate, 0);
assert.equal(normalized.mpRate, 1);
assert.equal(normalized.wingOwned, "yes");
assert.equal(normalized.wingSalvageCount, null);
assert.equal(normalized.nextBandMainId, null);
assert.equal(normalized.nextBandSubId, null);

for (const decision of [" Continue ", "PUSH", "invalid"]) {
  assert.equal(buildPortalDecisionPayload({
    ...input,
    context: {},
    decision,
    stakeSnapshotFields: {}
  }).decision, "other");
}

for (const portalType of [" return_wing ", "RETURN_WING", "invalid"]) {
  assert.equal(buildPortalDecisionPayload({
    ...input,
    context: {},
    portalType,
    stakeSnapshotFields: {}
  }).portalType, "other");
}

assert.equal(buildPortalDecisionPayload({
  ...input,
  context: {},
  portalType: "invalid",
  stakeSnapshotFields: {}
}).portalType, "other");

console.log("[PASS] TypeScript portal decision payload preserves legacy normalization and spread semantics");
