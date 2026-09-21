import assert from "node:assert/strict";

import {
  isNormalizedEventObservation,
  isNormalizedEventObservations,
  normalizeEventObservations
} from "../../../src/state/event_observation.js";
import { createDefaultCurrentRun } from "../../../src/state/initial_state.js";
import { normalizeSavePayload } from "../../../src/state/save_migrations.js";
import { isNormalizedCurrentRun } from "../../../src/state/run_state.js";

const activeEntry = {
  key: "future:observation:α",
  scope: "future-scope",
  text: "未解決イベント",
  side: "left",
  presentationKind: "warning",
  kind: "unresolved",
  lifecycle: "active"
};
const resolvedEntry = {
  key: "historical-observation",
  scope: "historical-scope",
  text: "解決済みイベント",
  side: "right",
  presentationKind: "result",
  kind: "result",
  lifecycle: "resolved"
};

assert.deepEqual(normalizeEventObservations({
  [activeEntry.key]: activeEntry,
  [resolvedEntry.key]: resolvedEntry
}), {
  [activeEntry.key]: activeEntry,
  [resolvedEntry.key]: resolvedEntry
});
assert.equal(isNormalizedEventObservation(activeEntry), true);
assert.equal(isNormalizedEventObservations({}), true);
assert.equal(isNormalizedEventObservations({ [activeEntry.key]: activeEntry }), true);

assert.deepEqual(normalizeEventObservations(null), {});
assert.deepEqual(normalizeEventObservations([]), {});
assert.deepEqual(normalizeEventObservations({ valid: activeEntry }), {});
assert.deepEqual(normalizeEventObservations({
  "": { ...activeEntry, key: "" },
  "drop:object": null,
  "drop:key": { ...activeEntry, key: "other" },
  "drop:missing-key": { ...activeEntry, key: undefined },
  "drop:text": { ...activeEntry, key: "drop:text", text: 1 },
  "drop:lifecycle": { ...activeEntry, key: "drop:lifecycle", lifecycle: "" },
  "drop:missing-lifecycle": { ...activeEntry, key: "drop:missing-lifecycle", lifecycle: undefined },
  "keep:defaults": {
    key: "keep:defaults",
    text: "defaults",
    lifecycle: "resolved",
    scope: undefined,
    side: null,
    presentationKind: 1,
    kind: "invalid"
  },
  "keep:unknown-namespace": {
    key: "keep:unknown-namespace",
    scope: "unknown:scope",
    text: "exact key  ",
    side: "neutral",
    presentationKind: "neutral",
    kind: "result",
    lifecycle: "active"
  }
}), {
  "keep:defaults": {
    key: "keep:defaults",
    scope: "run",
    text: "defaults",
    side: "neutral",
    presentationKind: "neutral",
    kind: "unresolved",
    lifecycle: "resolved"
  },
  "keep:unknown-namespace": {
    key: "keep:unknown-namespace",
    scope: "unknown:scope",
    text: "exact key  ",
    side: "neutral",
    presentationKind: "neutral",
    kind: "result",
    lifecycle: "active"
  }
});

const baseRun = createDefaultCurrentRun();
const rawObservations = {
  ...baseRun.eventObservations,
  "future:key": { ...activeEntry, key: "future:key", scope: "future:scope" },
  "resolved:key": { ...resolvedEntry, key: "resolved:key" },
  "stale:key": { ...activeEntry, key: "stale:key", lifecycle: undefined },
  "mismatch:key": { ...activeEntry, key: "other:key" }
};
const normalizedRun = normalizeSavePayload({
  currentRun: { ...baseRun, eventObservations: rawObservations },
  logs: ["ordinary log must not create an observation"]
}).currentRun;

assert.deepEqual(normalizedRun.eventObservations, {
  "future:key": { ...activeEntry, key: "future:key", scope: "future:scope" },
  "resolved:key": { ...resolvedEntry, key: "resolved:key" }
});
assert.equal(isNormalizedCurrentRun(normalizedRun), true);
assert.equal(isNormalizedCurrentRun({ ...normalizedRun, eventObservations: {
  "bad:key": { ...activeEntry, key: "other:key" }
} }), false, "currentRun guard delegates identity validation");
assert.equal(isNormalizedCurrentRun({ ...normalizedRun, eventObservations: {
  "bad:key": { ...activeEntry, key: "bad:key", lifecycle: "invalid" }
} }), false, "currentRun guard delegates lifecycle validation");
assert.equal(Object.hasOwn(normalizedRun.eventObservations, "ordinary log must not create an observation"), false);

const roundTrip = normalizeSavePayload(JSON.parse(JSON.stringify({ currentRun: normalizedRun }))).currentRun;
assert.deepEqual(roundTrip, normalizedRun);
assert.deepEqual(normalizeEventObservations(normalizeEventObservations(rawObservations)),
  normalizeEventObservations(rawObservations));
assert.equal(normalizedRun.eventObservations["resolved:key"].lifecycle, "resolved");
assert.equal(normalizeSavePayload({ currentRun: normalizedRun }).currentRun.eventObservations["resolved:key"].lifecycle,
  "resolved");

console.log("[PASS] #1509 canonical event observation contract, save normalization, and lifecycle preservation verified.");
