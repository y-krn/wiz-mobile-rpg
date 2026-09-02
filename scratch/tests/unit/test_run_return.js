import assert from "node:assert/strict";

const { createDefaultCodex, createDefaultCurrentRun, createSoloCharacter } =
  await import("../../../src/state/initial_state.js");
const { processRunReturn } = await import("../../../src/systems/run_return.js");
const { recordDungeonObjectLoot } = await import("../../../src/state/run_loot.js");
const { applyAutomaticWorkshopUnlock, getWorkshopGrants } = await import("../../../src/systems/workshop.js");
const { generateRandomAccessory } = await import("../../../src/systems/equipment_generation.js");

function setupRun(deepestFloor = 5) {
  const sword = {
    baseId: "LONG_SWORD",
    instanceId: `sword-${deepestFloor}`,
    rarity: "rare",
    identified: true,
    affixes: [{ id: "CORE_OPENER" }]
  };
  const potion = "GREATER_HEAL";
  const state = {
    party: [createSoloCharacter("Fighter")],
    currentRun: {
      ...createDefaultCurrentRun(),
      startedAt: 100,
      deepestFloor,
      returnReason: deepestFloor >= 5 ? "milestone_portal" : "gameover",
      itemsFound: [potion, sword],
      equipmentFound: [sword],
      townInventory: ["HEAL_POTION"],
      unbankedObjectLoot: [],
      bankedObjectLoot: [],
      lostObjectLoot: []
    },
    codex: createDefaultCodex(),
    workshop: { ranks: {}, lateralUnlocks: [] },
    storage: [],
    inventory: ["HEAL_POTION", potion, sword],
    floor: deepestFloor
  };
  state.party[0].equipment.weapon = sword;
  recordDungeonObjectLoot(state, potion);
  recordDungeonObjectLoot(state, sword);
  return { state, sword, potion };
}

{
  const { state, sword } = setupRun(5);
  const result = processRunReturn(state, "retreat");
  assert.equal(result.representativeItem.baseId, "LONG_SWORD");
  assert.equal(result.representativeItem.status, "returned");
  assert.equal(result.representativeItem.wasEquipped, true);
  assert.equal(result.meaningfulItemHistory.length, 2);
  assert.equal(Object.hasOwn(result.representativeItem, "atk"), false);
  assert.equal(Object.hasOwn(result.representativeItem, "affixes"), false);
  assert.deepEqual(state.workshop.lateralUnlocks, ["pool_opener"]);
  assert.ok(getWorkshopGrants(state.workshop).affixIds.includes("CORE_OPENER"));
  assert.equal(state.party[0].equipment.weapon, null);
  assert.equal(state.storage.includes(sword), false, "recovered dungeon equipment is not permanent storage");
  assert.equal(state.storage.includes("HEAL_POTION"), true, "unused Town preparation returns to storage");
  assert.equal(state.storage.includes("GREATER_HEAL"), true, "recovered dungeon consumables return to preparation storage");
  assert.ok(result.insights.some(insight => insight.id === "variantEquipment"));
  console.log("[PASS] portal return records compact Castle/Codex facts and opens one lateral Workshop possibility");
}

{
  const { state, sword } = setupRun(4);
  state.currentRun.returnReason = "gameover";
  const result = processRunReturn(state, "death");
  assert.equal(result.representativeItem.baseId, "LONG_SWORD");
  assert.equal(result.representativeItem.status, "lost");
  assert.equal(state.storage.includes(sword), false);
  assert.deepEqual(state.workshop.lateralUnlocks, []);
  assert.ok(result.insights.length > 0, "knowledge survives object loss");
  console.log("[PASS] death records a lost representative without recovering equipment or unlocking Workshop");
}

{
  const { state, sword } = setupRun(5);
  sword.identified = false;
  sword.unidentifiedName = "未鑑定の長剣";
  const result = processRunReturn(state, "retreat");
  assert.equal(result.representativeItem.name, "未鑑定の長剣");
  assert.equal(result.meaningfulItemHistory[0].name, "未鑑定の長剣");
  console.log("[PASS] unidentified return records keep the representative name concealed");
}

{
  const first = applyAutomaticWorkshopUnlock({ ranks: {}, lateralUnlocks: [] }, {
    deepestFloor: 4,
    recoveredEquipment: [{ baseId: "LONG_SWORD", tags: ["ambush"], knowledgeStage: "discovery" }]
  });
  assert.equal(first.unlocked, null);
  const second = applyAutomaticWorkshopUnlock({ ranks: {}, lateralUnlocks: [] }, {
    deepestFloor: 10,
    recoveredEquipment: [{ baseId: "LONG_SWORD", tags: ["ambush"], knowledgeStage: "discovery" }]
  });
  assert.equal(second.unlocked.id, "pool_opener");
  assert.equal(second.workshop.lateralUnlocks.length, 1);
  assert.deepEqual(second.matchedSignals.sort(), ["knowledge", "tag", "type"].sort());
  const pivotResult = applyAutomaticWorkshopUnlock({ ranks: {}, lateralUnlocks: [] }, {
    deepestFloor: 15,
    recoveredEquipment: [{ baseId: "LONG_SWORD", tags: ["iron", "blade"], lootRole: "pivot", knowledgeStage: "observation" }]
  });
  assert.equal(pivotResult.unlocked.id, "pool_giant_slayer", "the returned role selects a related side-grade");
  const searchResult = applyAutomaticWorkshopUnlock({ ranks: {}, lateralUnlocks: [] }, {
    deepestFloor: 25,
    recoveredEquipment: [{ baseId: "RING_LUK", tags: ["search"], lootRole: "convert", knowledgeStage: "trial" }]
  });
  assert.equal(searchResult.unlocked.id, "pool_tomb_raider", "the returned search signal selects a different side-grade");
  const unrelated = applyAutomaticWorkshopUnlock(second.workshop, {
    deepestFloor: 10,
    recoveredEquipment: [{ baseId: "LONG_SWORD", tags: ["iron", "blade"], lootRole: "pivot", knowledgeStage: "discovery" }]
  });
  assert.equal(unrelated.unlocked, null, "a returned result cannot advance an unrelated fixed chain");
  const noReservedShieldSlot = applyAutomaticWorkshopUnlock({
    ranks: {},
    lateralUnlocks: ["pool_opener", "pool_trap_eater", "pool_giant_slayer"]
  }, {
    deepestFloor: 20,
    recoveredEquipment: [{ baseId: "LONG_SWORD", tags: ["iron", "blade"], lootRole: "pivot", knowledgeStage: "observation" }]
  });
  assert.equal(noReservedShieldSlot.unlocked, null);
  console.log("[PASS] lateral unlock gates are depth-based, one-per-return, and do not require a target build");
}

function coreIdsFor(unlockedAffixIds) {
  let seed = 1011;
  const rng = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const party = [createSoloCharacter("Fighter")];
  party[0].unlockedAffixIds = unlockedAffixIds;
  party[0].lateralUnlockAffixIds = unlockedAffixIds;
  const ids = new Set();
  for (let index = 0; index < 1200; index++) {
    const item = generateRandomAccessory(5, { forceRarity: "magic", rng, party });
    item?.affixes?.filter(affix => affix.kind === "core").forEach(affix => ids.add(affix.id));
  }
  return ids;
}

{
  const baseline = coreIdsFor([]);
  const openerUnlocked = coreIdsFor(["CORE_OPENER"]);
  assert.equal(openerUnlocked.size, baseline.size, "lateral unlock keeps the authored core candidate count");
  assert.equal(openerUnlocked.has("CORE_OPENER"), true);
  console.log("[PASS] lateral core unlock replaces a reserved same-slot candidate instead of diluting the pool");
}
