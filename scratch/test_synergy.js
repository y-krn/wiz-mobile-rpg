// Mock localStorage and basic DOM for Node.js test environment before imports
global.localStorage = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();

const createDummyElement = () => ({
  style: {},
  appendChild: () => createDummyElement(),
  addEventListener: () => {},
  classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
  setAttribute: () => {},
  getAttribute: () => "",
  removeAttribute: () => {},
  innerHTML: "",
  textContent: "",
  cloneNode: () => createDummyElement()
});

global.document = {
  getElementById: () => createDummyElement(),
  querySelector: () => createDummyElement(),
  querySelectorAll: () => [],
  createElement: () => createDummyElement(),
  body: createDummyElement()
};

global.window = {
  innerWidth: 375,
  innerHeight: 667,
  addEventListener: () => {}
};

Object.defineProperty(global, "navigator", {
  value: { userAgent: "node" },
  writable: true,
  configurable: true
});

(async () => {
  const { state, initNewGame } = await import("../src/state.js");
  const { generateRandomEquipment } = await import("../src/systems/equipment_generation.js");
  const { getItemData, getCharAffixSum } = await import("../src/rules/item_rules.js");
  const { executeHalfAppraise, executeFullAppraise } = await import("../src/shop/appraisal.js");
  const { executeTagInscription } = await import("../src/craft.js");
  const { getPartyActiveTags, getActiveSynergies } = await import("../src/data/tags.js");

  console.log("=== STARTING INTEGRATED SYNERGY SYSTEM VERIFICATION ===");
  initNewGame();

  // Test 1: Random Equipment Generation with tags & curses
  console.log("\n[Test 1] Random Equipment Generation...");
  const eq = generateRandomEquipment(3, { rng: () => 0.01 }); // Epic & Curse probability biased
  if (!eq) throw new Error("Equipment generation failed");
  console.log("Generated Equip baseId:", eq.baseId);
  console.log("rarity:", eq.rarity);
  console.log("tags:", eq.tags);
  console.log("curseEffectId:", eq.curseEffectId);
  console.log("curseSuspected:", eq.curseSuspected);
  console.log("unidentifiedName:", eq.unidentifiedName);
  
  if (eq.identified !== false || eq.halfIdentified !== false) {
    throw new Error("New equipment should be completely unidentified");
  }
  if (!eq.tags || eq.tags.length === 0) {
    throw new Error("Generated equipment should have tags");
  }
  console.log("-> [PASS] Test 1: Random Equipment Generation verified");

  // Test 2: Double Appraisal Flow
  console.log("\n[Test 2] Double Appraisal Flow...");
  state.inventory = [eq];
  state.gold = 500;
  
  const itemDataUnidentified = getItemData(eq);
  console.log("Unidentified Description:", itemDataUnidentified.desc);
  if (!itemDataUnidentified.desc.includes("未鑑定のまま装備可能")) {
    throw new Error("Unidentified description mismatch");
  }

  // 2.1. Half Appraisal
  console.log("Executing Half Appraisal...");
  executeHalfAppraise(0, 30);
  const eqHalf = state.inventory[0];
  if (!eqHalf.halfIdentified || eqHalf.identified) {
    throw new Error("State should be half-identified but not fully identified");
  }
  const itemDataHalf = getItemData(eqHalf);
  console.log("Half Identified Description:", itemDataHalf.desc);
  if (!itemDataHalf.desc.includes("気配:") || !itemDataHalf.name.includes("簡易鑑定済")) {
    throw new Error("Half-identified description mismatch");
  }

  // 2.2. Full Appraisal
  console.log("Executing Full Appraisal...");
  executeFullAppraise(0, 100, false);
  const eqFull = state.inventory[0];
  if (!eqFull.identified) {
    throw new Error("State should be fully identified");
  }
  const itemDataFull = getItemData(eqFull);
  console.log("Fully Identified Name:", itemDataFull.name);
  console.log("Fully Identified Description:", itemDataFull.desc);
  if (!itemDataFull.desc.includes("<タグ:")) {
    throw new Error("Fully identified tags not rendered in description");
  }
  console.log("-> [PASS] Test 2: Double Appraisal Flow verified");

  // Test 3: Curse Debuffs Application
  console.log("\n[Test 3] Curse Debuffs Application...");
  initNewGame();
  state.party = [ ...state.roster.slice(0, 4) ];
  
  // Make a cursed wand manually
  const cursedWand = {
    kind: "equipment",
    instanceId: "curse_wand_123",
    baseId: "WAND",
    rarity: "epic",
    identified: false,
    halfIdentified: false,
    tags: ["curse", "spirit"],
    curseEffectId: "curse_blood_thirst", // atk+15, devotion-20
    affixes: [{ type: "atk", value: 5 }]
  };

  const char = state.party[0]; // Fighter
  char.equipment.weapon = cursedWand;

  // Unidentified cursed equip: Benefits (affixes, basic stats) must be 0, but curse debuff (devotion-20) MUST apply
  const atkSumUnidentified = getCharAffixSum(char, "atk");
  const devotionSumUnidentified = getCharAffixSum(char, "devotion");
  console.log("Unidentified wear - atkSum:", atkSumUnidentified, "(expected 0)");
  console.log("Unidentified wear - devotionSum:", devotionSumUnidentified, "(expected -20)");

  if (atkSumUnidentified !== 0) throw new Error("Benefits should not apply to unidentified gear");
  if (devotionSumUnidentified !== -20) throw new Error("Curse debuff should apply to unidentified gear");

  // Fully Identified cursed equip: Both benefits (affix: atk+5, curse: atk+15) and debuffs (curse: devotion-20) apply
  cursedWand.identified = true;
  const atkSumIdentified = getCharAffixSum(char, "atk");
  const devotionSumIdentified = getCharAffixSum(char, "devotion");
  console.log("Identified wear - atkSum:", atkSumIdentified, "(expected 20 = 5 + 15)");
  console.log("Identified wear - devotionSum:", devotionSumIdentified, "(expected -20)");

  if (atkSumIdentified !== 20) throw new Error("Atk benefits failed to apply after identification");
  if (devotionSumIdentified !== -20) throw new Error("Devotion debuff failed to apply after identification");

  console.log("-> [PASS] Test 3: Curse Debuffs Application verified");

  // Test 4: Synergy Calculation
  console.log("\n[Test 4] Synergy Calculation...");
  initNewGame();
  state.party = [ ...state.roster.slice(0, 4) ];
  
  // We have Arthur (Fighter), Robin (Thief), Maria (Priest), Ged (Mage) etc. in default roster
  state.party = [
    state.roster.find(c => c.class === "Fighter"),
    state.roster.find(c => c.class === "Priest")
  ];

  // Priest has holy, heal, exorcism class tags
  const activeTagsBefore = getPartyActiveTags(state.party);
  console.log("Active tags before equipment:", activeTagsBefore);

  const activeSynsBefore = getActiveSynergies(state.party);
  console.log("Active synergies before equipment:", activeSynsBefore.map(s => s.name));

  // Equip Priest with a holy mace (identified)
  const holyMace = {
    kind: "equipment",
    baseId: "SACRED_MACE",
    identified: true,
    tags: ["holy", "spirit"]
  };
  state.party[1].equipment.weapon = holyMace;

  const activeTagsAfter = getPartyActiveTags(state.party);
  console.log("Active tags after holy weapon:", activeTagsAfter);

  const activeSynsAfter = getActiveSynergies(state.party);
  console.log("Active synergies after holy weapon:", activeSynsAfter.map(s => s.name));

  // "holy_priest" synergy requires tags ["holy", "exorcism"]. Priest class tags have exorcism. Mace has holy.
  // It should activate!
  const hasHolyPriestSynergy = activeSynsAfter.some(s => s.id === "holy_priest");
  if (!hasHolyPriestSynergy) {
    throw new Error("holy_priest synergy should be active");
  }

  // Check if synergy stat modification (antiUndead: +10%) is applied via getCharAffixSum
  const antiUndeadBonus = getCharAffixSum(state.party[1], "antiUndead");
  console.log("antiUndead Bonus:", antiUndeadBonus, "(expected 30 = 20 priest class bonus + 10 synergy)");
  if (antiUndeadBonus !== 30) {
    throw new Error("Synergy stat bonus failed to apply");
  }

  console.log("-> [PASS] Test 4: Synergy Calculation verified");

  // Test 5: Tag Inscription Crafting
  console.log("\n[Test 5] Tag Inscription Crafting...");
  initNewGame();
  state.party = [ ...state.roster.slice(0, 4) ];
  
  const testArmor = {
    kind: "equipment",
    baseId: "PLATE_MAIL",
    identified: true,
    tags: ["iron", "ward"],
    affixes: []
  };
  state.inventory = [testArmor];
  state.gold = 500;
  state.materials = { "霊粉": 5 };

  console.log("Plate Mail tags before:", testArmor.tags);

  // Inscribe "holy" tag using "霊粉". Overwrite index is undefined (add mode).
  executeTagInscription(0, "霊粉", "holy", undefined, "add");

  const inscribedArmor = state.inventory[0];
  console.log("Plate Mail tags after holy inscription:", inscribedArmor.tags);
  if (!inscribedArmor.tags.includes("holy")) {
    throw new Error("holy tag was not added");
  }
  if (inscribedArmor.tags.length !== 3) {
    throw new Error("Tags count mismatch");
  }

  // Overwrite tag at index 0 ("iron" -> "poison") using "毒腺"
  state.materials["毒腺"] = 5;
  executeTagInscription(0, "毒腺", "poison", 0, "add");
  const overwrittenArmor = state.inventory[0];
  console.log("Plate Mail tags after overwriting index 0:", overwrittenArmor.tags);
  if (overwrittenArmor.tags[0] !== "poison") {
    throw new Error("Tag overwriting failed");
  }

  // Sealing a cursed item
  console.log("Testing Curse Sealing...");
  const cursedArmor = {
    kind: "equipment",
    baseId: "PLATE_MAIL",
    identified: true,
    tags: ["iron", "curse"],
    curseEffectId: "curse_blood_thirst",
    affixes: []
  };
  state.inventory = [cursedArmor];
  state.materials["霊粉"] = 5;

  executeTagInscription(0, "霊粉", null, undefined, "seal");
  const sealedArmor = state.inventory[0];
  console.log("Sealed armor tags:", sealedArmor.tags);
  console.log("curseEffectId:", sealedArmor.curseEffectId, "(expected null)");
  console.log("sealedCurseEffectId:", sealedArmor.sealedCurseEffectId, "(expected curse_blood_thirst)");

  if (sealedArmor.tags.includes("curse")) throw new Error("Curse tag not removed");
  if (sealedArmor.curseEffectId !== null) throw new Error("curseEffectId not cleared");
  if (sealedArmor.sealedCurseEffectId !== "curse_blood_thirst") throw new Error("sealedCurseEffectId mismatch");

  console.log("-> [PASS] Test 5: Tag Inscription Crafting verified");

  console.log("\n=== ALL INTEGRATED SYNERGY SYSTEM VERIFICATION TESTS PASSED SUCCESSFULLY! ===");
})();
