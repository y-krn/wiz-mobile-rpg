// 装備/クラフト 統合テスト
// 集約元: test_craft_equipped.js, test_dismantle.js, test_inscription.js, test_synergy.js, test_equipment_variety_plan_a.js, test_accessory_slot.js
// 各テストは同名ローカル定義の衝突回避と Math.random 差し替え隔離のため IIFE でスコープ分離。
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

import assert from "assert";
import { getCharAgi, getCharAffixSum, getCharMaxHp, getCharMaxMp, getCharStr, getCharTrapBonus, generateRandomAccessory, getItemData } from "../src/data.js";
import { migrateSavePayload } from "../src/state/save_migrations.js";

(async () => {

  // ========================================================================
  // 元: test_craft_equipped.js
  // ========================================================================
  await (async () => {
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
      const { executeEnhance, executeTagInscription } = await import("../src/craft.js");
      const { renderCraftEnhance, renderCraftInscriptionSelectEquip } = await import("../src/menu/town_actions.js");

      console.log("=== STARTING EQUIPPED CRAFT VERIFICATION ===");
      initNewGame();
      state.party = [ ...state.roster.slice(0, 4) ];

      // キャラクターと装備の初期化
      const char = state.party[0];
      if (!char) throw new Error("No party member found");

      // 1. 装備中装備の強化テスト
      console.log("\n[Test 1] Enhancing equipped weapon...");
      
      // 装備を設定
      char.equipment.weapon = {
        kind: "equipment",
        instanceId: "eq_test_weapon_123",
        baseId: "SHORT_SWORD",
        rarity: "magic",
        level: 1,
        identified: true,
        enhanceLevel: 0,
        tags: ["iron"]
      };

      // ゴールドと素材を付与 (武器強化コスト: 鉄片x2, 魔石片x1, 200G)
      state.gold = 1000;
      state.materials = {
        "鉄片": 10,
        "魔石片": 10
      };

      // 装備中武器の強化実行
      const successEnhance = executeEnhance({ type: "equipped", actorIdx: 0, slot: "weapon" });
      if (!successEnhance) {
        throw new Error("Failed to executeEnhance on equipped weapon");
      }

      // 状態検証
      const weapon = char.equipment.weapon;
      if (!weapon || weapon.enhanceLevel !== 1) {
        throw new Error(`Expected weapon enhanceLevel to be 1, got ${weapon?.enhanceLevel}`);
      }
      console.log("-> [PASS] Equipped weapon successfully enhanced. Level: " + weapon.enhanceLevel);


      // 2. 装備中装備の刻印テスト
      console.log("\n[Test 2] Inscribing equipped armor...");

      // 防具を設定
      char.equipment.armor = {
        kind: "equipment",
        instanceId: "eq_test_armor_123",
        baseId: "LEATHER_ARMOR",
        rarity: "magic",
        level: 1,
        identified: true,
        enhanceLevel: 0,
        tags: ["leather"]
      };

      // ゴールドと素材を付与 (毒避刻印コスト: 毒腺x2, 硬い皮x2, 100G)
      state.gold = 1000;
      state.materials = {
        "毒腺": 10,
        "硬い皮": 10
      };

      // 装備中防具に刻印を付与 (毒避刻印: 毒耐性+25%)
      const successInscription = executeTagInscription(
        { type: "equipped", actorIdx: 0, slot: "armor" },
        "毒腺",
        "poison",
        undefined,
        "add"
      );

      if (!successInscription) {
        throw new Error("Failed to executeTagInscription on equipped armor");
      }

      // 状態検証
      const armor = char.equipment.armor;
      if (!armor || !armor.inscription) {
        throw new Error("Expected armor to have an inscription");
      }
      if (armor.inscription.tag !== "poison" || !armor.tags.includes("poison")) {
        throw new Error("Expected armor to have poison tag and inscription applied");
      }
      console.log("-> [PASS] Equipped armor successfully inscribed. Inscription tag: " + armor.inscription.tag);


      // 3. UI 描画関数の煙幕テスト (Smoke Test)
      console.log("\n[Test 3] UI Rendering Smoke Test...");
      const dummyGrid = createDummyElement();
      
      // エラーなく呼び出せることを確認
      renderCraftEnhance(dummyGrid);
      renderCraftInscriptionSelectEquip(dummyGrid);
      console.log("-> [PASS] UI Render functions executed without throwing errors");

      console.log("\n=== ALL EQUIPPED CRAFT VERIFICATION TESTS PASSED SUCCESSFULLY! ===");
    })();
  })();

  // ========================================================================
  // 元: test_dismantle.js
  // ========================================================================
  await (async () => {
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
      const { executeDismantle, getDismantleResults } = await import("../src/craft.js");
      const assert = await import("assert");

      console.log("Starting Workshop Dismantle Verification Tests...");

      // Initialize
      initNewGame();
      state.inventory = [];
      state.materials = {};

      // Test 1: getDismantleResults mapping
      const mockWeaponMagic = {
        kind: "equipment",
        instanceId: "test_eq_1",
        baseId: "SHORT_SWORD",
        rarity: "magic",
        identified: true,
        affixes: []
      };
      const res1 = getDismantleResults(mockWeaponMagic);
      assert.deepStrictEqual(res1, { "鉄片": 1 }, "Magic Short Sword should yield 1 Iron Scrap");

      const mockWeaponRare = {
        kind: "equipment",
        instanceId: "test_eq_2",
        baseId: "SHORT_SWORD",
        rarity: "rare",
        identified: true,
        affixes: []
      };
      const res2 = getDismantleResults(mockWeaponRare);
      assert.deepStrictEqual(res2, { "鉄片": 2, "骨片": 1 }, "Rare Short Sword should yield 2 Iron Scrap, 1 Bone Fragment");

      const mockArmorEpic = {
        kind: "equipment",
        instanceId: "test_eq_3",
        baseId: "ROBE",
        rarity: "epic",
        identified: true,
        affixes: []
      };
      const res3 = getDismantleResults(mockArmorEpic);
      assert.deepStrictEqual(res3, { "呪布": 2, "黒角": 1 }, "Epic Robe should yield 2 Cursed Cloth, 1 Demon Horn");

      console.log("-> [PASS] Dismantle mapping verified");

      // Test 2: executeDismantle execution and inventory deletion
      state.inventory = [mockWeaponMagic, mockWeaponRare, mockArmorEpic];
      state.materials = {};

      const success1 = executeDismantle(0); // Short Sword (magic)
      assert.strictEqual(success1, true, "Dismantle should succeed");
      assert.strictEqual(state.inventory.length, 2, "Inventory size should decrease");
      assert.strictEqual(state.materials["鉄片"], 1, "Should gain 1 Iron Scrap");

      const success2 = executeDismantle(0); // Short Sword (rare) - index shifted
      assert.strictEqual(success2, true);
      assert.strictEqual(state.inventory.length, 1);
      assert.strictEqual(state.materials["鉄片"], 3, "Should have 3 Iron Scrap total");
      assert.strictEqual(state.materials["骨片"], 1, "Should gain 1 Bone Fragment");

      console.log("-> [PASS] executeDismantle execution verified");
      console.log("All Workshop Dismantle Verification Tests PASSED!");
    })();
  })();

  // ========================================================================
  // 元: test_inscription.js
  // ========================================================================
  await (async () => {
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
      const { executeTagInscription } = await import("../src/craft.js");
      const { getCharAffixSum, getItemData } = await import("../src/rules/item_rules.js");
      const { applyTargetedDamageBonus } = await import("../src/combat_logic/damage.js");
      const assert = await import("assert");

      console.log("Starting Inscription Verification Tests...");

      // Initialize
      initNewGame();
      state.inventory = [];
      state.materials = {};
      state.gold = 1000;

      const mockSword = {
        kind: "equipment",
        instanceId: "eq_sword_1",
        baseId: "SHORT_SWORD",
        rarity: "magic",
        identified: true,
        enhanceLevel: 0,
        affixes: []
      };

      const mockUnidentifiedSword = {
        kind: "equipment",
        instanceId: "eq_sword_2",
        baseId: "SHORT_SWORD",
        rarity: "magic",
        identified: false,
        enhanceLevel: 0,
        affixes: []
      };

      // Test 1: 素材・ゴールド不足のチェック
      state.inventory = [mockSword];
      state.materials = { "霊粉": 0 }; // 聖印には 霊粉3 が必要
      state.gold = 1000;

      let success = executeTagInscription(0, "霊粉", "holy", undefined, "add");
      assert.strictEqual(success, false, "Should fail when materials are missing");

      state.materials = { "霊粉": 3 };
      state.gold = 50; // 聖印には 150G 必要
      success = executeTagInscription(0, "霊粉", "holy", undefined, "add");
      assert.strictEqual(success, false, "Should fail when gold is insufficient");

      console.log("-> [PASS] Material and gold insufficiency validation verified");

      // Test 2: 未鑑定装備への刻印不可チェック
      state.inventory = [mockUnidentifiedSword];
      state.materials = { "霊粉": 3 };
      state.gold = 1000;
      success = executeTagInscription(0, "霊粉", "holy", undefined, "add");
      assert.strictEqual(success, false, "Should not allow inscription on unidentified items");

      console.log("-> [PASS] Unidentified items protection verified");

      // Test 3: 正常な刻印実行と、複数刻印（3枠制限）
      state.inventory = [{ ...mockSword }]; // clone to prevent mutating original mock
      state.materials = { "霊粉": 3 };
      state.gold = 1000;
      
      success = executeTagInscription(0, "霊粉", "holy", undefined, "add");
      assert.strictEqual(success, true, "Inscription should succeed with enough materials and gold");
      assert.strictEqual(state.gold, 850, "Gold should be deducted (1000 - 150)");
      assert.strictEqual(state.materials["霊粉"], 0, "Materials should be consumed");

      const inscribedItem = state.inventory[0];
      assert.ok(inscribedItem.inscription, "Item should have inscription field");
      assert.strictEqual(inscribedItem.inscription.type, "antiUndead");
      assert.strictEqual(inscribedItem.inscription.value, 20);

      // 2つ目の刻印が許可されること (複数刻印のサポート)
      state.materials = { "霊粉": 3 };
      state.gold = 1000;
      success = executeTagInscription(0, "霊粉", "holy", undefined, "add");
      assert.strictEqual(success, true, "Should allow multiple inscriptions");

      console.log("-> [PASS] Successful inscription and multiple inscription support verified");

      // Test 4: 刻印済み装備の売却益のチェック（金策ループ防止）
      const normalItemData = getItemData(mockSword); // 刻印なし
      const inscribedItemData = getItemData(inscribedItem); // 刻印あり
      assert.strictEqual(normalItemData.price, inscribedItemData.price, "Sale price should not increase with inscription");

      console.log("-> [PASS] Sale price verification (no money loop) verified");

      // Test 5: 戦闘効果への反映
      const char = {
        class: "Fighter",
        equipment: {
          weapon: inscribedItem
        }
      };
      const val = getCharAffixSum(char, "antiUndead");
      assert.strictEqual(val, 20, "Should get 20% bonus from the inscription");

      const targetUndead = { tags: ["undead"] };
      const targetDragon = { tags: ["dragon"] };
      const baseDmg = 10;
      const dmgUndead = applyTargetedDamageBonus(char, targetUndead, baseDmg);
      assert.strictEqual(dmgUndead, 12, "Should apply +20% damage to undead (10 * 1.2 = 12)");

      const dmgDragon = applyTargetedDamageBonus(char, targetDragon, baseDmg);
      assert.strictEqual(dmgDragon, 10, "Should NOT apply bonus to dragon");

      console.log("-> [PASS] Combat calculation integration verified");

      console.log("All Inscription Verification Tests PASSED!");
    })();
  })();

  // ========================================================================
  // 元: test_synergy.js
  // ========================================================================
  await (async () => {
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
  })();

  // ========================================================================
  // 元: test_equipment_variety_plan_a.js
  // ========================================================================
  await (async () => {
    const { ITEMS } = await import("../src/data/items.js");
    const { EQUIPMENT_CANDIDATES_BY_FLOOR, RESTRICTED_CHEST_BASES } = await import("../src/data/equipment_tables.js");
    const { generateRandomEquipment } = await import("../src/systems/equipment_generation.js");
    const { getDismantleResults } = await import("../src/craft.js");

    const additions = {
      SAGE_STAFF: { floor: 3, type: "weapon", stat: "atk", value: 2, classes: ["Priest", "Mage", "Bishop"], namePart: "杖", mats: { "魔石片": 1 } },
      ARCH_WAND: { floor: 5, type: "weapon", stat: "atk", value: 3, classes: ["Mage", "Bishop"], namePart: "杖", mats: { "魔石片": 1 } },
      SORCERER_ROBE: { floor: 5, type: "armor", stat: "def", value: 6, classes: ["Mage", "Bishop"], namePart: "ローブ", mats: { "呪布": 1 } },
      VENOM_FANG: { floor: 3, type: "weapon", stat: "atk", value: 9, classes: ["Thief", "Ninja"], namePart: "短剣", mats: { "硬い皮": 1 } },
      NINJA_BLADE: { floor: 4, type: "weapon", stat: "atk", value: 14, classes: ["Thief", "Ninja"], namePart: "剣", mats: { "鉄片": 1 } },
      MOONSHADOW: { floor: 5, type: "weapon", stat: "atk", value: 20, classes: ["Thief", "Ninja"], namePart: "剣", mats: { "鉄片": 1 } },
      HOLY_STAFF: { floor: 4, type: "weapon", stat: "atk", value: 6, classes: ["Priest", "Bishop"], namePart: "杖", mats: { "魔石片": 1 } },
      FLAME_SWORD: { floor: 4, type: "weapon", stat: "atk", value: 14, classes: ["Fighter", "Samurai", "Ranger"], namePart: "剣", mats: { "鉄片": 1 } }
    };

    const expectedAffixes = {
      SAGE_STAFF: ["mp", "arcane"],
      ARCH_WAND: ["mp", "arcane", "spellGuard"],
      SORCERER_ROBE: ["mp", "arcane", "spellGuard"],
      VENOM_FANG: ["trapBonus", "followUp", "treasureSense"],
      NINJA_BLADE: ["trapBonus", "followUp", "treasureSense", "firstStrike"],
      MOONSHADOW: ["trapBonus", "followUp", "treasureSense", "firstStrike"],
      HOLY_STAFF: ["arcane", "devotion", "antiUndead"],
      FLAME_SWORD: ["followUp"]
    };

    function makeRng(baseIndex, candidateCount, seed) {
      let calls = 0;
      let state = seed;
      return () => {
        calls++;
        if (calls === 1) {
          return 0.99;
        }
        if (calls === 2) {
          return (baseIndex + 0.01) / candidateCount;
        }
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 0x100000000;
      };
    }

    function collectAffixTypes(baseId, floor, runs = 800) {
      const candidates = EQUIPMENT_CANDIDATES_BY_FLOOR[floor];
      const baseIndex = candidates.indexOf(baseId);
      assert.ok(baseIndex >= 0, `${baseId} must be registered for B${floor}F`);

      const found = new Set();
      let unidentifiedName = "";
      for (let seed = 1; seed <= runs; seed++) {
        const item = generateRandomEquipment(floor, {
          forceRarity: "epic",
          rng: makeRng(baseIndex, candidates.length, seed)
        });
        assert.strictEqual(item.baseId, baseId);
        unidentifiedName = item.unidentifiedName;
        item.affixes.forEach(aff => found.add(aff.type));
      }
      return { found, unidentifiedName };
    }

    console.log("Running equipment variety plan A checks...");

    for (const [baseId, expected] of Object.entries(additions)) {
      const item = ITEMS[baseId];
      assert.ok(item, `${baseId} must exist in ITEMS`);
      assert.strictEqual(item.type, expected.type);
      assert.strictEqual(item[expected.stat], expected.value);
      assert.deepStrictEqual(item.classes, expected.classes);
      assert.ok(EQUIPMENT_CANDIDATES_BY_FLOOR[expected.floor].includes(baseId), `${baseId} must drop on B${expected.floor}F`);

      const { found, unidentifiedName } = collectAffixTypes(baseId, expected.floor);
      expectedAffixes[baseId].forEach(type => {
        assert.ok(found.has(type), `${baseId} should be eligible for ${type}`);
      });
      assert.ok(unidentifiedName.includes(expected.namePart), `${baseId} unidentified name should include ${expected.namePart}`);

      const dismantle = getDismantleResults({ kind: "equipment", baseId, rarity: "magic", identified: true, affixes: [] });
      assert.deepStrictEqual(dismantle, expected.mats, `${baseId} should use explicit dismantle materials`);
    }

    assert.ok(RESTRICTED_CHEST_BASES.includes("MOONSHADOW"), "MOONSHADOW should stay out of standard high-end chest generation");

    const ninjaDps = estimateDps({ atk: 20, str: 14, def: 12, classRate: 0.95, followUp: 15 });
    const fighterDps = estimateDps({ atk: 40, str: 15, def: 12, classRate: 1.0, followUp: 15 });
    assert.ok(ninjaDps < fighterDps * 0.65, `MOONSHADOW effective DPS ${ninjaDps.toFixed(2)} should stay well below Fighter ceiling ${fighterDps.toFixed(2)}`);
    console.log(`MOONSHADOW estimated DPS: ${ninjaDps.toFixed(2)} (Fighter ceiling sample: ${fighterDps.toFixed(2)})`);

    console.log("Equipment variety plan A checks passed.");

    function estimateDps({ atk, str, def, classRate, followUp }) {
      let total = 0;
      const iterations = 10000;
      for (let i = 0; i < iterations; i++) {
        const mainRand = i % 6;
        const followRand = i % 3;
        const main = Math.max(1, Math.floor((atk * 1.5 + (str - 10) + mainRand - Math.floor(def / 2)) * classRate));
        const extra = Math.max(1, Math.floor((atk * 1.5 + (str - 10) + followRand - Math.floor(def / 2)) * 0.7 * classRate));
        total += main + extra * (followUp / 100);
      }
      return total / iterations;
    }
  })();

  // ========================================================================
  // 元: test_accessory_slot.js
  // ========================================================================
  await (async () => {
    const baseChar = {
      name: "Tester",
      class: "Fighter",
      level: 1,
      hp: 20,
      maxHp: 20,
      mp: 0,
      maxMp: 0,
      str: 10,
      int: 10,
      pie: 10,
      vit: 10,
      agi: 10,
      luk: 10,
      status: "ok",
      equipment: { weapon: null, shield: null, armor: null, accessory: null }
    };

    assert.strictEqual(getItemData("AMULET_HP").type, "accessory");

    const hpChar = { ...baseChar, equipment: { ...baseChar.equipment, accessory: "AMULET_HP" } };
    assert.strictEqual(getCharMaxHp(hpChar), 30);

    const mpChar = { ...baseChar, maxMp: 4, equipment: { ...baseChar.equipment, accessory: "AMULET_MP" } };
    assert.strictEqual(getCharMaxMp(mpChar), 7);

    const strChar = { ...baseChar, equipment: { ...baseChar.equipment, accessory: "RING_STR" } };
    assert.strictEqual(getCharStr(strChar), 12);

    const agiChar = { ...baseChar, equipment: { ...baseChar.equipment, accessory: "RING_AGI" } };
    assert.strictEqual(getCharAgi(agiChar), 11);

    const trapChar = { ...baseChar, equipment: { ...baseChar.equipment, accessory: "THIEF_EYE" } };
    assert.strictEqual(getCharTrapBonus(trapChar), 0.1);

    const wardChar = { ...baseChar, equipment: { ...baseChar.equipment, accessory: "WARD_CHARM" } };
    assert.strictEqual(getCharAffixSum(wardChar, "spellGuard"), 15);

    const unidentWard = {
      ...baseChar,
      equipment: {
        ...baseChar.equipment,
        accessory: { baseId: "WARD_CHARM", identified: false }
      }
    };
    assert.strictEqual(getCharAffixSum(unidentWard, "spellGuard"), 0);

    const migrated = migrateSavePayload({
      version: 1,
      party: [{ ...baseChar, equipment: { weapon: "DAGGER", shield: null, armor: null } }],
      roster: [{ ...baseChar, equipment: {} }],
      remains: [{ ...baseChar, equipment: { weapon: null, shield: null, armor: null } }]
    });

    assert.strictEqual(migrated.version, 2);
    assert.deepStrictEqual(migrated.party[0].equipment, {
      weapon: "DAGGER",
      shield: null,
      armor: null,
      accessory: null
    });
    assert.strictEqual(migrated.roster[0].equipment.accessory, null);
    assert.strictEqual(migrated.remains[0].equipment.accessory, null);

    function lcg(seed) {
      let value = seed;
      return () => {
        value = (value * 1664525 + 1013904223) >>> 0;
        return value / 0x100000000;
      };
    }

    const bannedAccessoryAffixes = new Set(["atk", "def", "followUp", "firstStrike"]);
    const accessoryCaps = {
      hp: 8,
      mp: 2,
      str: 2,
      int: 2,
      pie: 2,
      vit: 2,
      agi: 2,
      luk: 2,
      trapBonus: 10,
      spellGuard: 15,
      antiDragon: 15,
      antiUndead: 15,
      poisonWard: 25,
      treasureSense: 8
    };

    ["magic", "rare", "epic"].forEach((rarity, rarityIndex) => {
      const rng = lcg(100 + rarityIndex);
      const accessory = generateRandomAccessory(5, rarity, rng, [baseChar]);
      assert.strictEqual(accessory.kind, "equipment");
      assert.strictEqual(accessory.identified, false);
      assert.strictEqual(accessory.curseEffectId, null);
      assert.strictEqual(accessory.curseSuspected, false);
      assert.strictEqual(getItemData(accessory).type, "accessory");
      assert.ok(accessory.unidentifiedName.includes("未鑑定"));
      assert.ok(accessory.affixes.length <= (rarity === "epic" ? 2 : 1));
      accessory.affixes.forEach(affix => {
        assert.ok(!bannedAccessoryAffixes.has(affix.type), `banned affix: ${affix.type}`);
        assert.ok(affix.value <= accessoryCaps[affix.type], `affix cap exceeded: ${affix.type}=${affix.value}`);
      });
    });

    console.log("[PASS] accessory slot");
  })();

  console.log("\n[TEST_EQUIPMENT PASSED]");
})();
