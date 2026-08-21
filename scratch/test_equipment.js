// 装備/クラフト 統合テスト
// 集約元: test_craft_equipped.js, test_equipment_variety_plan_a.js, test_accessory_slot.js
// 各テストは同名ローカル定義の衝突回避と Math.random 差し替え隔離のため IIFE でスコープ分離。
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

import assert from "assert";
import { calculatePhysicalAttackFormula, getCharAgi, getCharAffixSum, getCharMaxHp, getCharMaxMp, getCharStr, getCharTrapBonus, generateRandomAccessory, getItemData } from "../src/data.js";
import { migrateSavePayload, SAVE_VERSION } from "../src/state/save_migrations.js";
import { createSoloCharacter } from "../src/state.js";

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
      replaceChildren: () => {},
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

    await (async () => {
      const { state, initNewGame } = await import("../src/state.js");
      const { getEnhanceCost, executeEnhance, getPolishCost, executePolish } = await import("../src/craft.js");

      console.log("=== STARTING EQUIPPED CRAFT VERIFICATION ===");
      initNewGame();
      state.party = [createSoloCharacter("Fighter")];

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
      state.metaMaterials = {
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

      // 1b. アクセサリは強化対象外
      char.equipment.accessory = {
        kind: "equipment",
        instanceId: "eq_test_accessory_123",
        baseId: "AMULET_HP",
        rarity: "magic",
        level: 1,
        identified: true,
        enhanceLevel: 0,
        affixes: []
      };
      assert.strictEqual(getEnhanceCost(char.equipment.accessory), null);
      const accessoryEnhance = executeEnhance({ type: "equipped", actorIdx: 0, slot: "accessory" });
      assert.strictEqual(accessoryEnhance, false, "Accessory enhancement should stay disabled");
      assert.strictEqual(char.equipment.accessory.enhanceLevel, 0);

      console.log("-> [PASS] Accessory enhancement disabled");

      // 1c. 識別状態の境界値は強化・研磨対象外で、素材を消費しない
      for (const [label, identified] of [["欠落", undefined], ["null", null], ["false", false]]) {
        const enhanceTarget = {
          kind: "equipment",
          instanceId: `eq_test_unidentified_weapon_${label}`,
          baseId: "SHORT_SWORD",
          rarity: "magic",
          level: 1,
          enhanceLevel: 0,
          affixes: []
        };
        if (identified !== undefined) enhanceTarget.identified = identified;
        state.inventory = [enhanceTarget];
        state.metaMaterials = { "鉄片": 10, "魔石片": 10 };
        assert.strictEqual(getEnhanceCost(enhanceTarget), null);
        assert.strictEqual(executeEnhance(0), false, `${label} identified enhancement should be rejected`);
        assert.strictEqual(enhanceTarget.enhanceLevel, 0);
        assert.deepStrictEqual(state.metaMaterials, { "鉄片": 10, "魔石片": 10 });

        const polishTarget = {
          kind: "equipment",
          instanceId: `eq_test_unidentified_polish_${label}`,
          baseId: "DAGGER",
          rarity: "magic",
          level: 1,
          affixes: [{ id: "atk", type: "atk", kind: "support", value: 3 }]
        };
        if (identified !== undefined) polishTarget.identified = identified;
        state.inventory = [polishTarget];
        state.metaMaterials = { "魔石片": 10 };
        assert.strictEqual(getPolishCost(polishTarget), null);
        assert.strictEqual(executePolish(0, 0), false, `${label} identified polish should be rejected`);
        assert.strictEqual(polishTarget.affixes[0].value, 3);
        assert.strictEqual(polishTarget.polished, undefined);
        assert.deepStrictEqual(state.metaMaterials, { "魔石片": 10 });
      }
      console.log("-> [PASS] Missing/null/false identified enhancement and polish rejected without material consumption");

      console.log("\n=== ALL EQUIPPED CRAFT VERIFICATION TESTS PASSED SUCCESSFULLY! ===");
    })();
  })();

  // ========================================================================
  // 装備生成・鑑定・呪いの統合確認
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
      replaceChildren: () => {},
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
      const { identifyEquipment, revealEquipmentOnEquip } = await import("../src/systems/identification.js");

      console.log("=== STARTING INTEGRATED EQUIPMENT SYSTEM VERIFICATION ===");
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

      // Test 2: In-run identification flow
      console.log("\n[Test 2] In-run Identification Flow...");
      state.inventory = [eq];
      state.identifyTickets = 1;
      
      const itemDataUnidentified = getItemData(eq);
      console.log("Unidentified Description:", itemDataUnidentified.desc);
      if (!itemDataUnidentified.desc.includes("鑑定粉を使うか")) {
        throw new Error("Unidentified description mismatch");
      }

      console.log("Consuming identification powder...");
      identifyEquipment(state, eq);
      const eqFull = state.inventory[0];
      if (!eqFull.identified || state.identifyTickets !== 0) {
        throw new Error("Identification should reveal equipment and consume one powder");
      }
      const itemDataFull = getItemData(eqFull);
      console.log("Fully Identified Name:", itemDataFull.name);
      console.log("Fully Identified Description:", itemDataFull.desc);
      if (!itemDataFull.desc.includes("<タグ:")) {
        throw new Error("Fully identified tags not rendered in description");
      }
      console.log("-> [PASS] Test 2: In-run Identification Flow verified");

      // Test 3: Curse Debuffs Application
      console.log("\n[Test 3] Curse Debuffs Application...");
      initNewGame();
      state.party = [createSoloCharacter("Fighter")];
      
      // Make a cursed wand manually
      const cursedWand = {
        kind: "equipment",
        instanceId: "curse_wand_123",
        baseId: "WAND",
        rarity: "epic",
        identified: false,
        halfIdentified: false,
        tags: ["curse", "spirit"],
        curseEffectId: "curse_blood_thirst", // atk+22.5, devotion-20
        cursePower: 1,
        affixes: [{ type: "atk", value: 7.5 }]
      };

      const char = state.party[0]; // Fighter
      const reveal = revealEquipmentOnEquip(cursedWand);
      char.equipment.weapon = cursedWand;

      if (reveal.revealed || !reveal.cursed || !cursedWand.curseLocked || cursedWand.identified !== false || cursedWand.halfIdentified !== false) {
        throw new Error("Blind equip should preserve unidentified state and lock cursed equipment");
      }

      // Unidentified cursed equip: Both benefits (affix: atk+7.5, curse: atk+22.5) and debuffs apply
      const atkSumIdentified = getCharAffixSum(char, "atk");
      const devotionSumIdentified = getCharAffixSum(char, "devotion");
      console.log("Unidentified wear - atkSum:", atkSumIdentified, "(expected 30 = 7.5 + 22.5)");
      console.log("Unidentified wear - devotionSum:", devotionSumIdentified, "(expected -20)");

      if (atkSumIdentified !== 30) throw new Error("Atk benefits failed to apply after identification");
      if (devotionSumIdentified !== -20) throw new Error("Devotion debuff failed to apply after identification");

      console.log("-> [PASS] Test 3: Curse Debuffs Application verified");

      console.log("\n=== ALL INTEGRATED EQUIPMENT SYSTEM VERIFICATION TESTS PASSED SUCCESSFULLY! ===");
    })();
  })();

  // ========================================================================
  // 元: test_equipment_variety_plan_a.js
  // ========================================================================
  await (async () => {
    const { ITEMS } = await import("../src/data/items.js");
    const { EQUIPMENT_CANDIDATES_BY_FLOOR, RESTRICTED_CHEST_BASES } = await import("../src/data/equipment_tables.js");
    const { generateRandomEquipment } = await import("../src/systems/equipment_generation.js");
    const craftModule = await import("../src/craft.js");
    assert.ok(!Object.hasOwn(craftModule, "getDismantleResults"));
    assert.ok(!Object.hasOwn(craftModule, "executeDismantle"));

    const additions = {
      SAGE_STAFF: { floor: 3, type: "weapon", stat: "atk", value: 3, classes: ["Priest", "Mage", "Bishop"], namePart: "杖" },
      ARCH_WAND: { floor: 5, type: "weapon", stat: "atk", value: 4.5, classes: ["Mage", "Bishop"], namePart: "杖" },
      SORCERER_ROBE: { floor: 5, type: "armor", stat: "def", value: 6, classes: ["Mage", "Bishop"], namePart: "ローブ" },
      VENOM_FANG: { floor: 3, type: "weapon", stat: "atk", value: 13.5, classes: ["Thief", "Ninja"], namePart: "短剣" },
      NINJA_BLADE: { floor: 4, type: "weapon", stat: "atk", value: 21, classes: ["Thief", "Ninja"], namePart: "剣" },
      MOONSHADOW: { floor: 5, type: "weapon", stat: "atk", value: 30, classes: ["Thief", "Ninja"], namePart: "剣" },
      HOLY_STAFF: { floor: 4, type: "weapon", stat: "atk", value: 9, classes: ["Priest", "Bishop"], namePart: "杖" },
      FLAME_SWORD: { floor: 4, type: "weapon", stat: "atk", value: 21, classes: ["Fighter", "Samurai", "Ranger"], namePart: "剣" }
    };

    const expectedAffixes = {
      SAGE_STAFF: ["mp", "arcane", "spellPower"],
      ARCH_WAND: ["mp", "arcane", "spellGuard", "spellPower"],
      SORCERER_ROBE: ["mp", "arcane", "spellGuard", "spellPower"],
      VENOM_FANG: ["trapBonus", "followUp", "treasureSense"],
      NINJA_BLADE: ["trapBonus", "followUp", "treasureSense", "firstStrike"],
      MOONSHADOW: ["trapBonus", "followUp", "treasureSense", "firstStrike"],
      HOLY_STAFF: ["arcane", "devotion", "antiUndead", "spellPower"],
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

    const mageParty = [{
      class: "Mage",
      status: "ok",
      equipment: { weapon: null, shield: null, armor: null }
    }];
    const mageDrop = generateRandomEquipment(4, {
      forceRarity: "magic",
      rng: () => 0.99,
      party: mageParty,
      allowCores: false
    });
    const mageDropData = ITEMS[mageDrop.baseId];
    assert.ok(
      mageDropData && (!mageDropData.classes || mageDropData.classes.some(cls => mageParty.some(char => char.class === cls))),
      `class filter must stay active when the 70% priority roll misses: ${mageDrop.baseId}`
    );

    const unsupportedParty = [{
      class: "UnsupportedClass",
      status: "ok",
      equipment: { weapon: null, shield: null, armor: null }
    }];
    const fallbackDrop = generateRandomEquipment(4, {
      forceRarity: "magic",
      rng: () => 0.99,
      party: unsupportedParty,
      allowCores: false
    });
    assert.ok(fallbackDrop, "zero class-filter candidates must fall back to the base pool");
    assert.ok(
      EQUIPMENT_CANDIDATES_BY_FLOOR[4].includes(fallbackDrop.baseId),
      `fallback must return an item from the floor pool: ${fallbackDrop.baseId}`
    );

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

    }

    assert.ok(RESTRICTED_CHEST_BASES.includes("MOONSHADOW"), "MOONSHADOW should stay out of standard high-end chest generation");

    const ninjaDps = estimateDps({ effectiveAtk: 30, str: 14, def: 12, classRate: 0.95, followUp: 15 });
    const fighterDps = estimateDps({ effectiveAtk: 60, str: 15, def: 12, classRate: 1.0, followUp: 15 });
    assert.ok(ninjaDps < fighterDps * 0.65, `MOONSHADOW effective DPS ${ninjaDps.toFixed(2)} should stay well below Fighter ceiling ${fighterDps.toFixed(2)}`);
    console.log(`MOONSHADOW estimated DPS: ${ninjaDps.toFixed(2)} (Fighter ceiling sample: ${fighterDps.toFixed(2)})`);

    console.log("Equipment variety plan A checks passed.");

    function estimateDps({ effectiveAtk, str, def, classRate, followUp }) {
      let total = 0;
      const iterations = 10000;
      for (let i = 0; i < iterations; i++) {
        const mainRand = i % 6;
        const followRand = i % 3;
        // Keep this estimate on the production physical formula. Weapon and
        // STR inputs are effective units; DEF is the bounded resistance pool.
        const main = Math.max(1, Math.floor(calculatePhysicalAttackFormula({
          weaponAtk: effectiveAtk,
          str,
          randRoll: mainRand,
          def,
          meleeMod: classRate
        })));
        const extra = Math.max(1, Math.floor(calculatePhysicalAttackFormula({
          weaponAtk: effectiveAtk,
          str,
          randRoll: followRand,
          def,
          meleeMod: 0.7 * classRate
        })));
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
    assert.strictEqual(getCharAffixSum(unidentWard, "spellGuard"), 15);

    assert.throws(
      () => migrateSavePayload({ version: SAVE_VERSION - 1 }),
      error => error.name === "IncompatibleSaveVersionError"
    );

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
      trapBonus: 15,
      spellGuard: 15,
      antiDragon: 15,
      antiUndead: 15,
      antiDemon: 25,
      poisonWard: 25,
      treasureSense: 8,
      hearRange: 2,
      arcaneSense: 3,
      traceRead: 3,
      deepAssault: 15,
      fullHpDamage: 15,
      antiBeast: 25,
      antiSpirit: 25,
      lastSurvivorStats: 3,
      statusResistance: 20,
      spellAccuracy: 15,
      killHeal: 2,
      followUpMp: 1,
      hitFlinch: 15
    };

    ["magic", "rare", "epic"].forEach((rarity, rarityIndex) => {
      const rng = lcg(100 + rarityIndex);
      const accessory = generateRandomAccessory(5, rarity, rng, [baseChar], false);
      assert.strictEqual(accessory.kind, "equipment");
      assert.strictEqual(accessory.identified, false);
      assert.ok(accessory.affixes.every(affix => affix.kind !== "core"));
      if (accessory.curseEffectId) assert.strictEqual(accessory.curseSuspected, true);
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
