import assert from "node:assert/strict";
import {
  applyAutomaticWorkshopUnlock,
  applyWorkshopToCharacter,
  canAffordDepartureCraft,
  createDefaultWorkshopState,
  getDepartureCraftRecipes,
  getWorkshopGrants,
  isNormalizedWorkshopState,
  isWorkshopNodeAvailableInVNext,
  isWorkshopNodeUnlocked,
  normalizeWorkshopState,
  purchaseDepartureCraft,
  purchaseWorkshopNode
} from "../../../src/systems/workshop.js";
import { normalizeSavePayload } from "../../../src/state/save_migrations.js";
import { RETIRED_WORKSHOP_NODES, WORKSHOP_NODES } from "../../../src/data/workshop.js";
import { isNormalizedMetaMaterialBalance } from "../../../src/state/material_balance.js";

assert.deepEqual(createDefaultWorkshopState(), { ranks: {}, lateralUnlocks: [] });
assert.equal(isNormalizedWorkshopState(createDefaultWorkshopState()), true);
assert.equal(isNormalizedWorkshopState({ ranks: {}, lateralUnlocks: [], extra: true }), false);
assert.equal(isNormalizedWorkshopState({ ranks: { node: 1 }, lateralUnlocks: ["node", "node"] }), false);

const legacy = {
  ranks: {
    unknown_historical_node: 2.9,
    negative: -4,
    numericString: "3.8",
    malformed: "not-a-rank",
    stat_str: 8,
    [RETIRED_WORKSHOP_NODES[0].id]: 2
  },
  lateralUnlocks: ["unknown-lateral", 7, "unknown-lateral", "second-lateral"],
  extra: "discard"
};
const normalized = normalizeWorkshopState(legacy);
assert.deepEqual(normalized, {
  ranks: {
    unknown_historical_node: 2,
    negative: 0,
    numericString: 3,
    malformed: 0
  },
  lateralUnlocks: ["unknown-lateral", "second-lateral"]
});
assert.equal(isNormalizedWorkshopState(normalized), true);
assert.deepEqual(normalizeWorkshopState(JSON.parse(JSON.stringify(normalized))), normalized);

const migrated = normalizeSavePayload({
  workshop: { ranks: { [RETIRED_WORKSHOP_NODES[0].id]: 2, unknown_historical_node: 1, stat_str: 9 } },
  metaMaterials: { "霊粉": 1 }
});
assert.equal(migrated.workshop.ranks[RETIRED_WORKSHOP_NODES[0].id], undefined);
assert.equal(migrated.workshop.ranks.stat_str, undefined);
assert.equal(migrated.workshop.ranks.unknown_historical_node, 1);
assert.equal(migrated.metaMaterials["霊粉"], 11);
assert.equal(isNormalizedMetaMaterialBalance(migrated.metaMaterials), true,
  "retired Workshop refund leaves a canonical meta material balance");
assert.equal(isNormalizedWorkshopState(migrated.workshop), true);

const sourceWorkshop = { ranks: {}, lateralUnlocks: [] };
const sourceMaterials = { "獣の牙": 4, "鉄片": 2 };
assert.equal(purchaseWorkshopNode(sourceMaterials, sourceWorkshop, "missing_node").reason, "unknown_node");
assert.equal(purchaseWorkshopNode(sourceMaterials, { ranks: {}, lateralUnlocks: ["gear_rapier"] }, "gear_rapier").reason, "already_unlocked");
assert.equal(purchaseWorkshopNode(sourceMaterials, { ranks: {}, lateralUnlocks: [] }, "pool_thin_ice_pact").reason, "not_available_in_vnext");
assert.equal(purchaseWorkshopNode(sourceMaterials, { ranks: { gear_rapier: 1 } }, "gear_rapier").reason, "max_rank");
assert.equal(purchaseWorkshopNode({ "獣の牙": 1 }, sourceWorkshop, "gear_rapier").reason, "insufficient_materials");
const purchased = purchaseWorkshopNode(sourceMaterials, sourceWorkshop, "gear_rapier");
assert.equal(purchased.ok, true);
assert.deepEqual(sourceWorkshop, { ranks: {}, lateralUnlocks: [] });
assert.deepEqual(sourceMaterials, { "獣の牙": 4, "鉄片": 2 });
assert.equal(purchased.workshop.ranks.gear_rapier, 1);
assert.equal(purchased.metaMaterials["獣の牙"], 0);

const unavailableCoreNodeIds = ["pool_thorn_shield", "pool_scholar_eye", "pool_thin_ice_pact"];
const thinIceNode = WORKSHOP_NODES.find(entry => entry.id === "pool_thin_ice_pact");
assert.equal(isWorkshopNodeUnlocked(thinIceNode, []), false);
assert.equal(isWorkshopNodeUnlocked(thinIceNode, ["ABYSS_SEAL"]), true);
for (const nodeId of unavailableCoreNodeIds) {
  const node = WORKSHOP_NODES.find(entry => entry.id === nodeId);
  assert.ok(node);
  assert.equal(isWorkshopNodeAvailableInVNext(node), false);
  assert.deepEqual(purchaseWorkshopNode({}, sourceWorkshop, nodeId, ["abyss_seal"]), {
    ok: false,
    reason: "not_available_in_vnext"
  });
}
const previouslyUnlocked = applyWorkshopToCharacter({ unlockedAffixIds: [] }, {
  ranks: Object.fromEntries(unavailableCoreNodeIds.map(nodeId => [nodeId, 1])),
  lateralUnlocks: []
});
assert.deepEqual(previouslyUnlocked.unlockedAffixIds.sort(), [
  "CORE_SCHOLAR_EYE", "CORE_THIN_ICE_PACT", "CORE_THORN_SHIELD"
]);

assert.equal(canAffordDepartureCraft({}, [123]), false);
assert.equal(purchaseDepartureCraft({}, [123]).reason, "unknown_recipe");
assert.deepEqual(
  getDepartureCraftRecipes([123, "HEAL_POTION", 456, "HEAL_POTION"]).map(recipe => recipe.resultId),
  ["HEAL_POTION", "HEAL_POTION"]
);

const beforeCharacter = { unlockedAffixIds: ["old"], marker: true };
const character = applyWorkshopToCharacter(beforeCharacter, { ranks: { pool_blood_wand: 1 } });
assert.equal(character, beforeCharacter);
assert.deepEqual(character.unlockedAffixIds, ["CORE_BLOOD_WAND"]);
assert.equal(character.marker, true);
assert.deepEqual(getWorkshopGrants({ ranks: { pool_blood_wand: 1 }, lateralUnlocks: ["pool_blood_wand"] }), {
  startingGear: [],
  affixIds: ["CORE_BLOOD_WAND"],
  lateralAffixIds: ["CORE_BLOOD_WAND"],
  spellIds: [],
  identifyPowder: 0,
  returnItems: []
});

const unlockInput = { ranks: {}, lateralUnlocks: [] };
const unlock = applyAutomaticWorkshopUnlock(unlockInput, {
  deepestFloor: 10,
  recoveredEquipment: [{ baseId: "AMULET_HP", tags: ["trap"], knowledgeStage: "observation" }]
});
assert.equal(unlock.unlocked?.id, "pool_trap_eater");
assert.deepEqual(unlockInput, { ranks: {}, lateralUnlocks: [] });
assert.equal(unlock.workshop.lateralUnlocks.length, 1);
assert.deepEqual(applyAutomaticWorkshopUnlock({ ranks: {}, lateralUnlocks: [] }, {
  deepestFloor: 9,
  recoveredEquipment: [{ baseId: "AMULET_HP", tags: ["trap"], knowledgeStage: "observation" }]
}).workshop, { ranks: {}, lateralUnlocks: [] });

console.log("[PASS] Workshop canonical state, save migration, progression, grants, and automatic unlock contract");
