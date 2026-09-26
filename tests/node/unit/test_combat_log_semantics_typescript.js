import assert from "node:assert/strict";
import * as facade from "../../../src/combat_log_semantics.js";
import * as owner from "../../../src/combat_log_semantics.ts";
import * as presentationFacade from "../../../src/combat_ui/combat_log_presentation.js";
import * as presentationOwner from "../../../src/combat_ui/combat_log_presentation.ts";

const exportNames = [
  "COMBAT_LOG_PRESENTATION_KINDS",
  "mergeCombatLogPresentationKinds",
  "normalizeCombatLogPresentationKind"
];
assert.deepEqual(Object.keys(facade).sort(), exportNames);
assert.deepEqual(Object.keys(owner).sort(), exportNames);
for (const name of exportNames) assert.equal(facade[name], owner[name], `${name} export identity`);

const kinds = facade.COMBAT_LOG_PRESENTATION_KINDS;
assert.equal(presentationFacade.COMBAT_LOG_PRESENTATION_KINDS, kinds);
assert.equal(presentationOwner.COMBAT_LOG_PRESENTATION_KINDS, kinds);
assert.deepEqual(Object.keys(kinds), [
  "DAMAGE_DEALT", "DAMAGE_TAKEN", "HEALING", "STATUS_GOOD", "STATUS_BAD", "NEUTRAL"
]);
assert.deepEqual(Object.values(kinds), [
  "damage-dealt", "damage-taken", "healing", "status-good", "status-bad", "neutral"
]);
assert.ok(Object.isFrozen(kinds));

for (const kind of Object.values(kinds)) {
  assert.equal(facade.normalizeCombatLogPresentationKind(kind), kind);
}
for (const kind of ["unknown", 1, null, undefined, new String(kinds.HEALING)]) {
  assert.equal(facade.normalizeCombatLogPresentationKind(kind), kinds.NEUTRAL);
}

assert.equal(facade.mergeCombatLogPresentationKinds([]), kinds.NEUTRAL);
assert.equal(facade.mergeCombatLogPresentationKinds([{ presentationKind: kinds.NEUTRAL }]), kinds.NEUTRAL);
assert.equal(facade.mergeCombatLogPresentationKinds([
  { presentationKind: kinds.HEALING }, { presentationKind: kinds.HEALING }
]), kinds.HEALING);
assert.equal(facade.mergeCombatLogPresentationKinds([
  { presentationKind: kinds.HEALING }, { presentationKind: kinds.DAMAGE_TAKEN }
]), kinds.NEUTRAL);
assert.equal(facade.mergeCombatLogPresentationKinds([null, undefined, {}]), kinds.NEUTRAL);
const getterOrder = [];
assert.equal(facade.mergeCombatLogPresentationKinds([
  { get presentationKind() { getterOrder.push("first"); return kinds.HEALING; } },
  { get presentationKind() { getterOrder.push("second"); return kinds.DAMAGE_TAKEN; } }
]), kinds.NEUTRAL);
assert.deepEqual(getterOrder, ["first", "second"]);

const sparseEntries = Array(3);
sparseEntries[2] = { presentationKind: kinds.STATUS_GOOD };
assert.equal(facade.mergeCombatLogPresentationKinds(sparseEntries), kinds.STATUS_GOOD);
const unchangedEntries = [{ presentationKind: kinds.HEALING }];
const before = unchangedEntries[0].presentationKind;
facade.mergeCombatLogPresentationKinds(unchangedEntries);
assert.equal(unchangedEntries[0].presentationKind, before);
assert.throws(() => facade.mergeCombatLogPresentationKinds({}), TypeError);

assert.throws(() => facade.mergeCombatLogPresentationKinds([{
  get presentationKind() { throw new Error("presentationKind getter"); }
}]), /presentationKind getter/);
const proxyError = new Error("presentationKind proxy");
assert.throws(() => facade.mergeCombatLogPresentationKinds([
  new Proxy({}, { get() { throw proxyError; } })
]), error => error === proxyError);

console.log("[PASS] TypeScript combat-log semantics owner preserves legacy runtime contract");
