import assert from "node:assert/strict";
import { buildEliteDecisionPayload } from "../../../src/telemetry_elite_decision.ts";
import { eliteDecisionInputFixture } from "../fixtures/typescript/telemetry_elite_decision_input.ts";

const base = eliteDecisionInputFixture;
const payload = buildEliteDecisionPayload(base);
assert.deepEqual(Object.keys(payload), [
  "runId", "floor", "decision", "eliteId", "contactMode", "distance", "detected",
  "elitePolicy", "unbankedObjectLootCount"
]);
assert.equal(payload.decision, "avoid");
assert.equal(payload.contactMode, "combat");
assert.equal(payload.distance, 3.5);
assert.equal(payload.elitePolicy, "avoid");
assert.equal(payload.unbankedObjectLootCount, 1);

const safeDecisions = new Set(["avoid"]);
const safeContactModes = new Set(["combat"]);
const build = (overrides = {}) => buildEliteDecisionPayload({
  ...base, safeDecisions, safeContactModes, ...overrides
});

assert.equal(build({ decision: "Avoid" }).decision, "other");
assert.equal(build({ contactMode: " combat " }).contactMode, "other");
assert.equal(build({ floor: null }).floor, 0);
assert.equal(build({ floor: "" }).floor, 0);
assert.equal(build({ floor: "bad" }).floor, null);
assert.equal(build({ floor: 2.5 }).floor, 2.5);
assert.equal(build({ distance: -2 }).distance, 0);
assert.equal(build({ distance: 101 }).distance, 100);
assert.equal(build({ distance: "4.25" }).distance, 4.25);
assert.equal(build({ distance: "bad" }).distance, null);
assert.equal(build({ detected: false }).detected, false);
assert.equal(build({ elitePolicy: null }).elitePolicy, null);
assert.equal(build({ elitePolicy: "" }).elitePolicy, null);
assert.equal(build({ elitePolicy: "unknown" }).elitePolicy, "unknown");
assert.equal(build({ elitePolicy: "ENGAGE" }).elitePolicy, "other");

const overwritten = build({ context: { runId: "context-run", decision: "context" } });
assert.equal(overwritten.runId, "context-run");
assert.equal(overwritten.decision, "avoid");
console.log("[PASS] TypeScript elite decision owner preserves payload and normalization semantics");
