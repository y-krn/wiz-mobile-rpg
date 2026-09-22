import assert from "node:assert/strict";
import * as discardFacade from "../../../src/systems/equipment_discard.js";
import * as discardOwner from "../../../src/systems/equipment_discard.ts";
import { state } from "../../../src/state.js";
import {
  __resetTelemetryForTests,
  __setTelemetryClientForTests,
  trackRunStart
} from "../../../src/telemetry.js";
import {
  discardEntriesFixture,
  discardOptionsFixture
} from "../fixtures/typescript/equipment_discard_input.ts";

assert.strictEqual(discardFacade.discardEquipmentItems, discardOwner.discardEquipmentItems);
assert.strictEqual(discardFacade.getDiscardRisk, discardOwner.getDiscardRisk);
assert.deepEqual(discardFacade.getDiscardRisk(null), []);
assert.deepEqual(discardFacade.getDiscardRisk("DAGGER"), []);
assert.deepEqual(discardFacade.getDiscardRisk({ identified: false }), ["未鑑定"]);
assert.deepEqual(discardFacade.getDiscardRisk({ identified: true, rarity: "rare" }), ["Rare以上"]);
assert.deepEqual(discardFacade.getDiscardRisk({ identified: true, enhanceLevel: 1 }), ["強化済み"]);
assert.deepEqual(discardFacade.getDiscardRisk({ identified: true, affixes: [{}] }), ["Affix付き"]);
assert.deepEqual(
  discardFacade.getDiscardRisk({ identified: false, rarity: "legendary", enhanceLevel: 2, affixes: [{}] }),
  ["未鑑定", "Rare以上", "強化済み", "Affix付き"]
);
assert.equal(discardEntriesFixture[0].index, 0);
assert.equal(discardOptionsFixture.stateLike.inventory[0], "DAGGER");

const originalConfirm = globalThis.confirm;
const previousLogs = state.logs;
const previousLogEntries = state.logEntries;
const previousLocalStorage = globalThis.localStorage;
const capturedEvents = [];
globalThis.confirm = () => true;
globalThis.localStorage = {
  getItem: () => null,
  setItem() {},
  removeItem() {}
};

function equipment(baseId, fields = {}) {
  return { baseId, identified: true, ...fields };
}

function createState(inventory) {
  return {
    inventory,
    party: [{ equipment: {} }],
    currentRun: {
      unbankedObjectLoot: inventory.map((item, index) => ({ id: `loot:${index}`, item })),
      townInventory: []
    }
  };
}

try {
  __setTelemetryClientForTests({
    capture(name, properties) {
      capturedEvents.push({ name, properties });
    }
  });
  trackRunStart({ startFloor: 1 }, { level: 1, equipment: {} }, { inventory: [], party: [] });

  let confirmMessage = "";
  globalThis.confirm = message => {
    confirmMessage = message;
    return false;
  };
  const staleState = createState([equipment("DAGGER")]);
  assert.deepEqual(
    discardFacade.discardEquipmentItems([{ index: 0, expectedItemKey: "OTHER" }], { stateLike: staleState }),
    { ok: false, count: 0 }
  );
  assert.equal(confirmMessage, "");
  assert.equal(staleState.currentRun.unbankedObjectLoot.length, 1);

  const nonEquipmentState = createState(["HEAL_POTION"]);
  assert.deepEqual(
    discardFacade.discardEquipmentItems([{ index: 0, expectedItemKey: "HEAL_POTION" }], { stateLike: nonEquipmentState }),
    { ok: false, count: 0 }
  );
  assert.equal(confirmMessage, "");

  const missingConfirmState = createState([equipment("DAGGER")]);
  delete globalThis.confirm;
  assert.deepEqual(
    discardFacade.discardEquipmentItems([{ index: 0, expectedItemKey: missingConfirmState.inventory[0] }], {
      stateLike: missingConfirmState
    }),
    { ok: false, count: 0 }
  );
  assert.equal(missingConfirmState.inventory.length, 1);
  globalThis.confirm = () => true;

  assert.deepEqual(
    discardFacade.discardEquipmentItems([], { stateLike: missingConfirmState }),
    { ok: false, count: 0 }
  );
  assert.deepEqual(
    discardFacade.discardEquipmentItems([{ index: 0 }], { stateLike: { inventory: "broken" } }),
    { ok: false, count: 0 }
  );

  const duplicateItem = equipment("DAGGER");
  const duplicateState = createState([duplicateItem]);
  globalThis.confirm = message => {
    confirmMessage = message;
    return true;
  };
  assert.deepEqual(
    discardFacade.discardEquipmentItems([
      { index: 0, expectedItemKey: "STALE" },
      { index: 0, expectedItemKey: duplicateItem }
    ], { stateLike: duplicateState }),
    { ok: true, count: 1 }
  );
  assert.equal(confirmMessage, "「ダガー」を破棄しますか？この操作は取り消せません。");
  assert.deepEqual(duplicateState.inventory, []);

  const stringIndexItem = equipment("DAGGER");
  const stringIndexState = createState([stringIndexItem]);
  assert.deepEqual(
    discardFacade.discardEquipmentItems([{ index: "0", expectedItemKey: stringIndexItem }], {
      stateLike: stringIndexState
    }),
    { ok: true, count: 1 }
  );
  assert.deepEqual(stringIndexState.inventory, []);

  const unidentified = equipment("DAGGER", {
    identified: false,
    rarity: "rare",
    enhanceLevel: 1,
    affixes: [{}]
  });
  const multiState = createState([unidentified, equipment("SHORT_SWORD"), equipment("ROBE")]);
  globalThis.confirm = message => {
    confirmMessage = message;
    return false;
  };
  assert.deepEqual(
    discardFacade.discardEquipmentItems([
      { index: 0, expectedItemKey: unidentified },
      { index: 2, expectedItemKey: multiState.inventory[2] }
    ], { stateLike: multiState }),
    { ok: false, count: 0 }
  );
  assert.equal(
    confirmMessage,
    "選択した2件の装備を破棄しますか？この操作は取り消せません。\n注意: 未鑑定 1件、Rare以上 1件、強化済み 1件、Affix付き 1件が含まれます。"
  );
  assert.equal(multiState.inventory.length, 3);
  assert.equal(multiState.currentRun.unbankedObjectLoot.length, 3);

  const first = equipment("DAGGER");
  const second = equipment("SHORT_SWORD");
  const third = equipment("ROBE");
  const successState = createState([first, second, third]);
  state.logs = [];
  state.logEntries = [];
  capturedEvents.length = 0;
  globalThis.confirm = () => true;
  assert.deepEqual(
    discardFacade.discardEquipmentItems([
      { index: 0, expectedItemKey: first },
      { index: 2, expectedItemKey: third }
    ], { stateLike: successState }),
    { ok: true, count: 2 }
  );
  assert.deepEqual(successState.inventory, [second]);
  assert.deepEqual(successState.currentRun.unbankedObjectLoot.map(entry => entry.item), [second]);
  assert.equal(capturedEvents.filter(event => event.name === "equipment_decision").length, 2);
  assert.equal(capturedEvents.filter(event => event.name === "loot_lifecycle").length, 2);
  assert.equal(state.logs.at(-1), "[破棄] 2件の装備を破棄した。");

  __setTelemetryClientForTests({
    capture() {
      throw new Error("telemetry transport failure");
    }
  });
  const throwState = createState([equipment("DAGGER")]);
  assert.deepEqual(
    discardFacade.discardEquipmentItems([{ index: 0, expectedItemKey: throwState.inventory[0] }], { stateLike: throwState }),
    { ok: true, count: 1 }
  );
  assert.deepEqual(throwState.inventory, []);
} finally {
  __resetTelemetryForTests();
  state.logs = previousLogs;
  state.logEntries = previousLogEntries;
  if (previousLocalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = previousLocalStorage;
  if (originalConfirm === undefined) delete globalThis.confirm;
  else globalThis.confirm = originalConfirm;
}

console.log("[PASS] equipment discard facade, risk, validation, identity, multi-delete, and telemetry-throw contracts");
