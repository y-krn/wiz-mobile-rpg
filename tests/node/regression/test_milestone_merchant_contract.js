import assert from "node:assert/strict";
import * as merchantFacade from "../../../src/systems/milestone_merchant.js";
import * as merchantOwner from "../../../src/systems/milestone_merchant.ts";
import { MILESTONE_MERCHANT_STOCK, MILESTONE_UNCURSE_COST } from "../../../src/data/milestone_merchant.js";
import { createPartialMerchantState, createPartialUncurseState } from "../fixtures/typescript/milestone_merchant_partial_input.ts";

for (const exportName of ["purchaseMilestoneStock", "getCursedEquipment", "purchaseMilestoneUncurse"]) {
  assert.strictEqual(merchantFacade[exportName], merchantOwner[exportName],
    `merchant facade preserves ${exportName} identity`);
}

assert.deepEqual(merchantFacade.purchaseMilestoneStock(createPartialMerchantState(), "missing"), {
  ok: false,
  reason: "unknown_stock"
});

const identifyState = createPartialMerchantState();
const identifyResult = merchantFacade.purchaseMilestoneStock(identifyState, "identify_powder");
assert.equal(identifyResult.ok, true);
assert.equal(identifyState.identifyTickets, 1);
assert.equal(identifyState.currentRun.materials["霊粉"], 0);
assert.strictEqual(identifyResult.entry, MILESTONE_MERCHANT_STOCK[0]);

const itemState = {
  currentRun: { materials: { "霊粉": 1 } },
  inventory: []
};
assert.deepEqual(merchantFacade.purchaseMilestoneStock(itemState, "eye_drops"), {
  ok: true,
  entry: MILESTONE_MERCHANT_STOCK.find(entry => entry.id === "eye_drops")
});
assert.deepEqual(itemState.inventory, ["EYE_DROPS"]);
assert.equal(itemState.currentRun.materials["霊粉"], 0);

const fullState = {
  currentRun: { materials: { "霊粉": 1 } },
  inventory: Array(20).fill("HEAL_POTION")
};
assert.deepEqual(merchantFacade.purchaseMilestoneStock(fullState, "eye_drops"), {
  ok: false,
  reason: "inventory_full"
});
assert.equal(fullState.currentRun.materials["霊粉"], 1);

const portalCost = MILESTONE_MERCHANT_STOCK.find(entry => entry.itemId === "TOWN_PORTAL").cost;
for (const ownedPortal of ["TOWN_PORTAL", { baseId: "TOWN_PORTAL" }]) {
  const portalState = {
    currentRun: { materials: { ...portalCost } },
    inventory: [ownedPortal]
  };
  assert.deepEqual(merchantFacade.purchaseMilestoneStock(portalState, "return_wing"), {
    ok: false,
    reason: "already_owned"
  });
  assert.deepEqual(portalState.currentRun.materials, portalCost);
}

const cursedLegacyItem = {
  baseId: "LEGACY_BLADE",
  instanceId: "legacy-blade-1",
  affixes: [],
  curseEffectId: "curse_hollow_soul",
  curseLocked: true,
  curseSuspected: true,
  tags: ["curse"]
};
const cursedModernItem = {
  kind: "equipment",
  instanceId: "modern-blade-1",
  baseId: "MODERN_BLADE",
  rarity: "rare",
  level: 1,
  identified: true,
  affixes: [],
  curseEffectId: "curse_hollow_soul",
  curseLocked: true,
  curseSuspected: true,
  tags: ["curse"]
};
const cursedEntries = merchantFacade.getCursedEquipment({
  equipment: { legacy_slot: cursedLegacyItem, weapon: cursedModernItem }
});
assert.deepEqual(cursedEntries.map(entry => entry.slot), ["legacy_slot", "weapon"]);
assert.strictEqual(cursedEntries[0].item, cursedLegacyItem);
assert.strictEqual(cursedEntries[1].item, cursedModernItem);

const notCursedState = createPartialUncurseState({ curseLocked: false });
assert.deepEqual(merchantFacade.purchaseMilestoneUncurse(notCursedState, "legacy_slot"), {
  ok: false,
  reason: "not_cursed"
});

const poorUncurseState = createPartialUncurseState(cursedLegacyItem);
poorUncurseState.currentRun.materials = {};
assert.deepEqual(merchantFacade.purchaseMilestoneUncurse(poorUncurseState, "legacy_slot"), {
  ok: false,
  reason: "insufficient_materials"
});
assert.equal(cursedLegacyItem.curseEffectId, "curse_hollow_soul");

const richUncurseState = createPartialUncurseState(cursedLegacyItem);
const uncurseResult = merchantFacade.purchaseMilestoneUncurse(richUncurseState, "legacy_slot");
assert.equal(uncurseResult.ok, true);
assert.strictEqual(uncurseResult.item, cursedLegacyItem);
assert.equal(cursedLegacyItem.curseEffectId, null);
for (const material of Object.keys(MILESTONE_UNCURSE_COST)) {
  assert.equal(richUncurseState.currentRun.materials[material], 0);
}

console.log("[PASS] milestone merchant facade, partial boundary, identity, and purchase contracts");
