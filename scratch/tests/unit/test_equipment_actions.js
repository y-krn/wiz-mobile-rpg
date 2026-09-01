import assert from "node:assert/strict";
import {
  discardEquipmentAt,
  equipEquipment,
  identifyEquipmentAt,
  unequipEquipment
} from "../../../src/systems/equipment_actions.js";
import { canEquipEquipment } from "../../../src/rules/equipment_rules.js";
import {
  getEquipmentPreview,
  getUnequipPreview
} from "../../../src/rules/equipment_preview.js";
import { state } from "../../../src/state/state_core.js";

const saveValues = new Map();
globalThis.localStorage = {
  getItem: key => saveValues.get(key) ?? null,
  setItem: (key, value) => saveValues.set(key, String(value)),
  removeItem: key => saveValues.delete(key)
};

function makeCharacter(equipment = {}) {
  return {
    name: "装備テスト",
    class: "Fighter",
    level: 1,
    hp: 20,
    mp: 0,
    str: 14,
    int: 10,
    pie: 10,
    vit: 10,
    agi: 10,
    luk: 10,
    status: "ok",
    equipment: {
      weapon: null,
      shield: null,
      armor: null,
      accessory: null,
      accessory2: null,
      ...equipment
    }
  };
}

function makeEquipment(baseId, overrides = {}) {
  return {
    kind: "equipment",
    instanceId: `equipment-action-${baseId}`,
    baseId,
    rarity: "rare",
    level: 1,
    identified: true,
    enhanceLevel: 0,
    affixes: [],
    ...overrides
  };
}

function resetState({ character = makeCharacter(), inventory = [] } = {}) {
  state.party = [character];
  state.inventory = inventory;
  state.floor = 1;
  state.gameState = "explore";
  state.identifyTickets = 0;
  state.logs = [];
  state.metaMaterials = {};
}

const candidate = makeEquipment("SHORT_SWORD");
const equipped = makeEquipment("LONG_SWORD");
const character = makeCharacter({ weapon: equipped });
const beforePreview = JSON.stringify(character);
const preview = getEquipmentPreview(character, candidate, "weapon", { floor: 1 });
assert.equal(preview.slot, "weapon");
assert.equal(JSON.stringify(character), beforePreview, "preview must not mutate live equipment");
const unequipPreview = getUnequipPreview(character, "weapon", { floor: 1 });
assert.equal(unequipPreview.slot, "weapon");
assert.equal(JSON.stringify(character), beforePreview, "unequip preview must not mutate live equipment");

resetState({ inventory: [candidate] });
const equipResult = equipEquipment({ inventoryIndex: 0, actorIdx: 0, requestedSlot: "weapon" });
assert.equal(equipResult.ok, true);
assert.equal(state.party[0].equipment.weapon, candidate);
assert.deepEqual(state.inventory, []);
assert.ok(saveValues.has("mobile_wiz_rpg_autosave"), "equip action must autosave");

const unequipResult = unequipEquipment({ actorIdx: 0, slot: "weapon" });
assert.equal(unequipResult.ok, true);
assert.equal(state.party[0].equipment.weapon, null);
assert.deepEqual(state.inventory, [candidate]);

const fullBagCharacter = makeCharacter({ weapon: equipped });
resetState({
  character: fullBagCharacter,
  inventory: Array.from({ length: 20 }, (_, index) => makeEquipment(
    index % 2 === 0 ? "SHORT_SWORD" : "LEATHER_ARMOR",
    { instanceId: `full-bag-${index}` }
  ))
});
const fullBagUnequip = unequipEquipment({ actorIdx: 0, slot: "weapon" });
assert.equal(fullBagUnequip.ok, false);
assert.equal(fullBagUnequip.reason, "inventory_full");
assert.equal(state.party[0].equipment.weapon, equipped, "full bag must not silently drop the equipped item");
assert.equal(state.inventory.length, 20);

const locked = makeEquipment("LONG_SWORD", { curseEffectId: "curse_hollow_soul", curseLocked: true });
const lockedCharacter = makeCharacter({ weapon: locked });
assert.equal(canEquipEquipment(lockedCharacter, candidate, "weapon").ok, false);
resetState({ character: lockedCharacter, inventory: [candidate] });
assert.equal(unequipEquipment({ actorIdx: 0, slot: "weapon" }).ok, false);
assert.equal(state.party[0].equipment.weapon, locked);
assert.deepEqual(state.inventory, [candidate]);

const unidentified = makeEquipment("SHORT_SWORD", {
  instanceId: "equipment-action-unidentified",
  identified: false,
  halfIdentified: false
});
resetState({ inventory: [unidentified] });
state.identifyTickets = 1;
const identifyResult = identifyEquipmentAt({ inventoryIndex: 0, actorIdx: 0 });
assert.equal(identifyResult.ok, true);
assert.equal(unidentified.identified, true);
assert.equal(state.identifyTickets, 0);
assert.ok(saveValues.has("mobile_wiz_rpg_autosave"), "identify action must autosave");

const originalConfirm = globalThis.confirm;
globalThis.confirm = () => true;
try {
  resetState({ inventory: [candidate] });
  const discardResult = discardEquipmentAt(0, candidate, { actorIdx: 0 });
  assert.equal(discardResult.ok, true);
  assert.deepEqual(state.inventory, []);
  assert.ok(saveValues.has("mobile_wiz_rpg_autosave"), "discard action must autosave");
} finally {
  globalThis.confirm = originalConfirm;
}

console.log("[PASS] equipment preview and action boundaries preserve state and inventory behavior");
