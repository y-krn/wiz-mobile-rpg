import assert from "node:assert/strict";
import { buildExplorationDecisionPayload } from "../../../src/telemetry_exploration_decision.ts";

const safeCellEvents = new Set(["event_camp"]);
const safeSpellTargetTypes = new Set(["single_ally", "all_allies"]);
const safeDirections = new Set([0, 1, 2, 3]);
const base = {
  runId: "run-1",
  context: { floor: 2 },
  action: "rest",
  source: "event_camp",
  safeCellEvents,
  spellId: null,
  targetIdx: 2,
  partySize: 3,
  targetType: undefined,
  spellTarget: "single_ally",
  safeSpellTargetTypes,
  itemId: null,
  itemCategory: "other",
  direction: 1,
  safeDirections
};

const payload = buildExplorationDecisionPayload(base);
assert.equal(payload.action, "heal");
assert.equal(payload.source, "event_camp");
assert.equal(payload.targetIndex, 2);
assert.equal(payload.targetType, "single_ally");
assert.deepEqual(Object.keys(payload), [
  "runId", "floor", "action", "source", "spellId", "targetIndex", "targetType",
  "itemId", "itemCategory", "direction"
]);

for (const targetType of [null, undefined]) {
  assert.equal(buildExplorationDecisionPayload({ ...base, targetType, spellTarget: "all_allies" }).targetType, "all_allies");
}
assert.equal(buildExplorationDecisionPayload({ ...base, targetType: "" }).targetType, null);
assert.equal(buildExplorationDecisionPayload({ ...base, targetType: "invalid", spellTarget: "all_allies" }).targetType, "other");
assert.equal(buildExplorationDecisionPayload({ ...base, source: "invalid" }).source, "other");
assert.equal(buildExplorationDecisionPayload({ ...base, action: "unknown" }).action, "other");
assert.equal(buildExplorationDecisionPayload({ ...base, targetIdx: -1, spellTarget: "all_allies" }).targetIndex, null);
assert.equal(buildExplorationDecisionPayload({ ...base, targetIdx: 3 }).targetIndex, null);
assert.equal(buildExplorationDecisionPayload({ ...base, targetIdx: 1, partySize: "2" }).targetIndex, 1);
assert.equal(buildExplorationDecisionPayload({ ...base, targetIdx: 7, partySize: 20 }).targetIndex, 7);
assert.equal(buildExplorationDecisionPayload({ ...base, targetIdx: 7, partySize: "bad" }).targetIndex, null);
assert.equal(buildExplorationDecisionPayload({ ...base, direction: "1" }).direction, null);
assert.equal(buildExplorationDecisionPayload({ ...base, direction: 1.5 }).direction, null);
assert.equal(buildExplorationDecisionPayload({ ...base, direction: 8 }).direction, null);
assert.equal(buildExplorationDecisionPayload({ ...base, context: { runId: "context-run", action: "context-action" } }).runId, "context-run");
assert.equal(buildExplorationDecisionPayload({ ...base, context: { action: "context-action" } }).action, "heal");

console.log("[PASS] TypeScript exploration decision owner preserves payload and normalization semantics");
