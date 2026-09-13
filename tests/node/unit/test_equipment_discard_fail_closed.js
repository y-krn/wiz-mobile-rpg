import assert from "node:assert/strict";
import { discardEquipmentItems } from "../../../src/systems/equipment_discard.js";
import { getItemEquippedStatus } from "../../../src/rules/equipment_equipped.js";
import { configureSentry } from "../../../src/sentry.js";

const captured = [];
configureSentry({
  addBreadcrumb() {},
  captureMessage() {},
  captureException(error, context) {
    captured.push({ error, context });
  }
}, true);

const originalConfirm = globalThis.confirm;
let confirmCalled = false;
globalThis.confirm = () => {
  confirmCalled = true;
  return true;
};

try {
  const equippedCheck = getItemEquippedStatus({
    party: [{ equipment: { weapon: "SHORT_SWORD" } }]
  }, "SHORT_SWORD");
  assert.equal(equippedCheck.equipped, true);
  assert.equal(equippedCheck.error, undefined);

  const unequippedCheck = getItemEquippedStatus({
    party: [{ equipment: { weapon: "DAGGER" } }]
  }, "SHORT_SWORD");
  assert.equal(unequippedCheck.equipped, false);
  assert.equal(unequippedCheck.error, undefined);

  const brokenEquipment = new Error("broken equipment payload");
  const stateLike = {
    inventory: ["SHORT_SWORD"],
    party: [{
      get equipment() {
        throw brokenEquipment;
      }
    }]
  };

  const uiCheck = getItemEquippedStatus(stateLike, "SHORT_SWORD");
  assert.equal(uiCheck.equipped, true, "malformed equipment must be unsafe for UI filtering");
  assert.equal(uiCheck.error, brokenEquipment);
  assert.equal(uiCheck.scope, "character-equipment");
  assert.equal(captured.length, 0, "the pure check must not report to Sentry");

  const result = discardEquipmentItems([{ index: 0, expectedItemKey: "SHORT_SWORD" }], { stateLike });

  assert.deepEqual(result, { ok: false, count: 0 });
  assert.equal(confirmCalled, false, "unsafe discard must be blocked before confirmation");
  assert.deepEqual(stateLike.inventory, ["SHORT_SWORD"], "inventory must remain unchanged");
  assert.equal(captured.length, 1);
  assert.equal(captured[0].error, brokenEquipment);
  assert.equal(captured[0].context.level, "warning");
  assert.deepEqual(captured[0].context.tags, {
    subsystem: "equipment",
    op: "discard-equipped-check",
    recovery: "block-discard",
    scope: "character-equipment"
  });

  const brokenParty = new Error("broken party payload");
  let malformedPartyState = {
    inventory: ["SHORT_SWORD"],
    get party() {
      throw brokenParty;
    }
  };
  const malformedPartyCheck = getItemEquippedStatus(malformedPartyState, "SHORT_SWORD");
  assert.equal(malformedPartyCheck.equipped, true, "malformed party must fail closed");
  assert.equal(malformedPartyCheck.error, brokenParty);
  assert.equal(malformedPartyCheck.scope, "party");

  confirmCalled = false;
  const malformedPartyResult = discardEquipmentItems(
    [{ index: 0, expectedItemKey: "SHORT_SWORD" }],
    { stateLike: malformedPartyState }
  );
  assert.deepEqual(malformedPartyResult, { ok: false, count: 0 });
  assert.equal(confirmCalled, false, "malformed party must stop before confirmation");
  assert.deepEqual(malformedPartyState.inventory, ["SHORT_SWORD"], "malformed party must not mutate inventory");
  assert.equal(captured.length, 2, "one discard check failure must produce one Sentry event");
  assert.equal(captured[1].error, brokenParty);
  assert.deepEqual(captured[1].context.tags, {
    subsystem: "equipment",
    op: "discard-equipped-check",
    recovery: "block-discard",
    scope: "party"
  });
} finally {
  configureSentry(null, false);
  if (originalConfirm === undefined) delete globalThis.confirm;
  else globalThis.confirm = originalConfirm;
}

console.log("[PASS] equipment discard fails closed and reports malformed equipment state");
