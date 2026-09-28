import assert from "node:assert/strict";
import { buildTrapResolutionPayload } from "../../../src/telemetry_trap_resolution.ts";
import { trapResolutionPayloadInputFixture } from "../fixtures/typescript/telemetry_trap_resolution_input.ts";

const fixturePayload = buildTrapResolutionPayload(trapResolutionPayloadInputFixture);
assert.deepEqual(Object.keys(fixturePayload), [
  "runId", "contextOnly", "floor", "trapBonus", "source", "trapType", "outcome", "action",
  "successRate", "trapDifficulty", "partialSuccess", "identified", "x", "y", "toolId", "toolUsed",
  "trapGuard", "detectionSupport", "treasureSense", "hearRange", "traceRead", "trapKitCount",
  "availableToolIds", "coreIds", "coreTrapEater", "coreTombRaider"
]);
assert.equal(fixturePayload.floor, 3);
assert.equal(fixturePayload.trapBonus, 11);
assert.equal(fixturePayload.action, "disarm");
assert.equal(fixturePayload.successRate, 55.5);
assert.equal(fixturePayload.trapDifficulty, 42);
assert.equal(fixturePayload.partialSuccess, true);
assert.equal(fixturePayload.identified, false);
assert.equal(fixturePayload.toolId, "TRAP_KIT");
assert.equal(fixturePayload.contextOnly, "kept");
assert.equal(Object.hasOwn(fixturePayload, "unknownDetail"), false);

const order = [];
const details = {};
for (const [key, value] of Object.entries({ action: "invalid", successRate: Infinity, trapDifficulty: 1001, toolId: "invalid", toolUsed: 0 })) {
  Object.defineProperty(details, key, { get() { order.push(key); return value; } });
}
Object.defineProperty(details, "trap", {
  get() { order.push("trap"); return { get difficulty() { order.push("difficulty"); return undefined; } }; }
});
let partialSuccessReads = 0;
Object.defineProperty(details, "partialSuccess", { get() { order.push("partialSuccess"); return ++partialSuccessReads === 1 ? false : true; } });
let identifiedReads = 0;
Object.defineProperty(details, "identified", { get() { order.push("identified"); return ++identifiedReads === 1 ? 0 : 1; } });

const payload = buildTrapResolutionPayload({
  ...trapResolutionPayloadInputFixture,
  context: { runId: "context-run", floor: "context-floor", contextOnly: true },
  x: null,
  y: 0,
  details,
  build: { ...trapResolutionPayloadInputFixture.build, extra: "not spread" }
});
assert.deepEqual(order, [
  "action", "successRate", "trap", "difficulty", "trapDifficulty",
  "partialSuccess", "partialSuccess", "identified", "identified", "toolId", "toolUsed"
]);
assert.equal(partialSuccessReads, 2);
assert.equal(identifiedReads, 2);
assert.equal(payload.runId, "context-run");
assert.equal(payload.floor, 3);
assert.equal(payload.action, "other");
assert.equal(payload.successRate, null);
assert.equal(payload.trapDifficulty, 1000);
assert.equal(payload.partialSuccess, true);
assert.equal(payload.identified, true);
assert.equal(payload.x, null);
assert.equal(payload.y, 0);
assert.equal(payload.toolId, "other");
assert.equal(payload.toolUsed, false);
assert.equal(Object.hasOwn(payload, "extra"), false);

for (const [key, reads] of [["partialSuccess", 1], ["identified", 1]]) {
  let count = 0;
  const optionalDetails = { action: "inspect", toolId: null };
  Object.defineProperty(optionalDetails, key, { get() { count++; return undefined; } });
  const optionalPayload = buildTrapResolutionPayload({ ...trapResolutionPayloadInputFixture, details: optionalDetails });
  assert.equal(count, reads);
  assert.equal(Object.hasOwn(optionalPayload, key), true);
  assert.equal(optionalPayload[key], undefined);
}

console.log("[PASS] TypeScript trap resolution owner preserves payload order and normalization");
