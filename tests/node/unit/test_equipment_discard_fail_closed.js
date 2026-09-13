import assert from "node:assert/strict";
import { discardEquipmentItems } from "../../../src/systems/equipment_discard.js";
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
  const brokenEquipment = new Error("broken equipment payload");
  const stateLike = {
    inventory: ["SHORT_SWORD"],
    party: [{
      get equipment() {
        throw brokenEquipment;
      }
    }]
  };

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
} finally {
  configureSentry(null, false);
  if (originalConfirm === undefined) delete globalThis.confirm;
  else globalThis.confirm = originalConfirm;
}

console.log("[PASS] equipment discard fails closed and reports malformed equipment state");
