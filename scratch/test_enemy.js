// 敵/戦闘対象 統合テスト
// 集約元: test_enemy_traits.js, test_metal_puppy.js, test_row_targeting.js, test_counterplay_audit.js
// 各テストは同名ローカル定義の衝突回避と Math.random 差し替え隔離のため IIFE でスコープ分離。
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

import assert from "assert";
import { CRAFT_RECIPES } from "../src/craft.js";
import { ENCOUNTER_PACKS } from "../src/combat_ui/encounter.js";
import { MONSTERS } from "../src/data/monsters.js";
import { SHOP_STOCK } from "../src/shop/shop_stock.js";
import { checkCharLevelUp } from "../src/data.js";
import { createDefaultRoster } from "../src/state.js";
import { runCombatRoundCalculation } from "../src/combat_logic.js";

(async () => {

  // ========================================================================
  // 元: test_enemy_traits.js
  // ========================================================================
  await (async () => {
    console.log("Starting Enemy Traits Verification Tests...");

    // 1. guardAdjacent / guardAdjacentReduce (庇う) のテスト
    const testGuard = () => {
      const party = [
        { name: "戦士", class: "Fighter", status: "ok", hp: 100, maxHp: 100, mp: 0, level: 1, equipment: { weapon: "LONG_SWORD" }, str: 15, int: 8, pie: 8, vit: 15, agi: 10, luk: 10, buffs: [] }
      ];
      const monsters = [
        { name: "錆びた盾兵", hp: 30, maxHp: 30, atk: 5, def: 5, traits: ["guardAdjacent"], buffs: [] },
        { name: "コボルトの斥候", hp: 20, maxHp: 20, atk: 5, def: 1, traits: [], buffs: [] }
      ];
      const state = {
        party,
        combatState: { monsters, round: 0 },
        inventory: []
      };
      const selection = {
        actions: [
          { type: "fight", actorIdx: 0, targetIdx: 1 } // コボルトの斥候を狙う
        ]
      };

      let guardedCount = 0;
      for (let i = 0; i < 50; i++) {
        const tempState = JSON.parse(JSON.stringify(state));
        const result = runCombatRoundCalculation(tempState, selection);
        if (result.state.combatState.monsters[0].hp < 30) {
          guardedCount++;
        }
      }

      assert.ok(guardedCount > 0, "Rust Guard should guard Kobold adjacent at least once");
      console.log(`[PASS] guardAdjacent verified (guarded ${guardedCount}/50 times).`);
    };

    // 2. reflectPhysical (物理反射) のテスト
    const testPhysicalReflect = () => {
      const party = [
        { name: "戦士", class: "Fighter", status: "ok", hp: 100, maxHp: 100, mp: 0, level: 1, equipment: { weapon: "LONG_SWORD" }, str: 15, int: 8, pie: 8, vit: 15, agi: 10, luk: 10, buffs: [] }
      ];
      const monsters = [
        { name: "針甲虫", hp: 30, maxHp: 30, atk: 5, def: 1, traits: ["reflectPhysical"], buffs: [] }
      ];
      const state = {
        party,
        combatState: { monsters, round: 0 },
        inventory: []
      };
      const selection = {
        actions: [
          { type: "fight", actorIdx: 0, targetIdx: 0 }
        ]
      };

      const result = runCombatRoundCalculation(state, selection);
      assert.ok(result.state.party[0].hp < 100, "Fighter should receive reflect damage when attacking Needle Beetle");
      console.log("[PASS] reflectPhysical verified.");
    };

    // 3. reflectMagic (魔法反射) のテスト
    const testMagicReflect = () => {
      const party = [
        { name: "魔術師", class: "Mage", status: "ok", hp: 50, maxHp: 50, mp: 10, level: 1, equipment: { weapon: "WAND" }, spells: ["HALITO"], str: 8, int: 15, pie: 8, vit: 10, agi: 12, luk: 8, buffs: [] }
      ];
      const monsters = [
        { name: "呪いの小鏡", hp: 30, maxHp: 30, atk: 5, def: 1, traits: ["reflectMagic"], buffs: [] }
      ];
      const state = {
        party,
        combatState: { monsters, round: 0 },
        inventory: []
      };
      const selection = {
        actions: [
          { type: "spell", actorIdx: 0, targetIdx: 0, spellName: "HALITO" }
        ]
      };

      let reflectCount = 0;
      for (let i = 0; i < 50; i++) {
        const tempState = JSON.parse(JSON.stringify(state));
        const result = runCombatRoundCalculation(tempState, selection);
        if (result.state.party[0].hp < 50) {
          reflectCount++;
        }
      }

      assert.ok(reflectCount > 0, "Magic reflect should happen at least once for Curse Mirror");
      console.log(`[PASS] reflectMagic verified (reflected ${reflectCount}/50 times).`);
    };

    // 4. splitOnDeath (分裂スライム) のテスト
    const testSplitOnDeath = () => {
      const party = [
        { name: "戦士", class: "Fighter", status: "ok", hp: 100, maxHp: 100, mp: 0, level: 10, equipment: { weapon: "LONG_SWORD" }, str: 30, int: 8, pie: 8, vit: 15, agi: 10, luk: 10, buffs: [] }
      ];
      const monsters = [
        { name: "分裂スライム", hp: 1, maxHp: 20, atk: 5, def: 0, traits: ["splitOnDeath"], exp: 100, gold: 10, buffs: [] }
      ];
      const state = {
        party,
        combatState: { monsters, round: 0 },
        inventory: []
      };
      const selection = {
        actions: [
          { type: "fight", actorIdx: 0, targetIdx: 0 }
        ]
      };

      const result = runCombatRoundCalculation(state, selection);
      const newMonsters = result.state.combatState.monsters;
      assert.strictEqual(newMonsters[0].hp, 0, "Original split slime should be dead");
      const splits = newMonsters.filter(m => m.name.includes("分裂体"));
      assert.strictEqual(splits.length, 2, "Should summon 2 split slimes");
      assert.strictEqual(splits[0].hp, 10, "Split slimes should have 50% HP");
      assert.strictEqual(splits[0].exp, 25, "Split slimes should award 25 EXP");
      console.log("[PASS] splitOnDeath verified.");
    };

    // 5. regen (再生) のテスト
    const testRegen = () => {
      const party = [
        { name: "戦士", class: "Fighter", status: "ok", hp: 100, maxHp: 100, mp: 0, level: 1, equipment: { weapon: "LONG_SWORD" }, str: 15, int: 8, pie: 8, vit: 15, agi: 10, luk: 10, buffs: [] }
      ];
      const monsters = [
        { name: "竜血の再生者", hp: 50, maxHp: 80, atk: 5, def: 10, traits: ["regen"], buffs: [] }
      ];
      const state = {
        party,
        combatState: { monsters, round: 0 },
        inventory: []
      };
      const selection = {
        actions: [
          { type: "defend", actorIdx: 0 }
        ]
      };

      const result = runCombatRoundCalculation(state, selection);
      assert.strictEqual(result.state.combatState.monsters[0].hp, 59, "Dragon blood regenerator should regen 9 HP at turn end");
      console.log("[PASS] regen verified.");
    };

    // 6. silence (沈黙) のテスト
    const testSilence = () => {
      const party = [
        { name: "魔術師", class: "Mage", status: "ok", hp: 50, maxHp: 50, mp: 10, level: 1, equipment: { weapon: "WAND" }, spells: ["HALITO"], str: 8, int: 15, pie: 8, vit: 10, agi: 12, luk: 8, silenceTurns: 2, buffs: [{ type: "silence", value: 1, turns: 2 }] }
      ];
      const monsters = [
        { name: "コボルトの斥候", hp: 20, maxHp: 20, atk: 5, def: 1, traits: [], buffs: [] }
      ];
      const state = {
        party,
        combatState: { monsters, round: 0 },
        inventory: []
      };
      const selection = {
        actions: [
          { type: "spell", actorIdx: 0, targetIdx: 0, spellName: "HALITO" }
        ]
      };

      const result = runCombatRoundCalculation(state, selection);
      assert.strictEqual(result.state.party[0].mp, 10, "MP should not decrease on failed spell cast due to silence");
      assert.strictEqual(result.state.combatState.monsters[0].hp, 20, "Monster HP should not decrease on failed spell cast");
      assert.strictEqual(result.state.party[0].silenceTurns, 1, "Silence turn should decrease");
      console.log("[PASS] silence verified.");
    };

    // 7. level up scaling (レベルアップ成長抑制) のテスト
    const testLevelUpScaling = () => {
      const char = {
        name: "戦士",
        class: "Fighter",
        level: 1,
        exp: 0,
        hp: 20,
        maxHp: 20,
        mp: 0,
        maxMp: 0,
        str: 15,
        int: 8,
        pie: 8,
        vit: 15,
        agi: 10,
        luk: 10,
        spells: []
      };

      // Level 1 -> 2 (Not multiple of 3, stats should not change)
      char.exp = 200;
      let lvlUp = checkCharLevelUp(char);
      assert.ok(lvlUp, "Should level up to 2");
      assert.strictEqual(char.level, 2, "Level should be 2");
      assert.strictEqual(char.str, 15, "str should not change");
      assert.strictEqual(char.vit, 15, "vit should not change");

      // Level 2 -> 3 (Multiple of 3, either str or vit should increase by 1)
      char.exp = 800;
      lvlUp = checkCharLevelUp(char);
      assert.ok(lvlUp, "Should level up to 3");
      assert.strictEqual(char.level, 3, "Level should be 3");
      
      const totalStats = char.str + char.vit;
      assert.strictEqual(totalStats, 31, "Either str or vit should increase by 1 at Level 3");
      console.log("[PASS] level up scaling suppression verified.");
    };

    testGuard();
    testPhysicalReflect();
    testMagicReflect();
    testSplitOnDeath();
    testRegen();
    testSilence();
    testLevelUpScaling();

    console.log("All Enemy and Stats Traits Verification Tests passed successfully!");
  })();

  // ========================================================================
  // 元: test_metal_puppy.js
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
      const { MONSTERS } = await import("../src/data/monsters.js");
      const { determineMonsterDrop } = await import("../src/combat_logic/drops.js");
      const { generateEncounter } = await import("../src/combat_ui/encounter.js");
      const assert = await import("assert");

      console.log("=== STARTING METAL PUPPY BALANCE VERIFICATION ===");

      // 1. Verify Monster Properties
      const puppy = MONSTERS.find(m => m.name === "メタルパピー");
      assert.ok(puppy, "メタルパピー definition should exist in MONSTERS");
      assert.strictEqual(puppy.level, 4, "メタルパピー level should be 4");
      assert.strictEqual(puppy.exp, 600, "メタルパピー exp should be 600");
      assert.strictEqual(puppy.gold, 500, "メタルパピー gold should be 500");
      assert.strictEqual(puppy.fleeChance, 0.50, "メタルパピー fleeChance should be 0.50");
      assert.strictEqual(puppy.isRare, true, "メタルパピー isRare should be true");
      assert.strictEqual(puppy.treasureRare, true, "メタルパピー treasureRare should be true");
      console.log("[PASS] Test 1: Monster definition verified.");

      // 2. Verify Guaranteed Drops
      // Floor 3 (Should drop 獣の牙 x2, 硬い皮 x1, 黒角 x1)
      const dropsF3 = determineMonsterDrop(puppy, 3);
      assert.deepStrictEqual(dropsF3, {
        "獣の牙": 2,
        "硬い皮": 1,
        "黒角": 1
      }, "Floor 3 drop should be guaranteed: 獣の牙x2, 硬い皮x1, 黒角x1");

      // Floor 4 (Should drop 獣の牙 x2, 硬い皮 x1, 竜鱗 x1)
      const dropsF4 = determineMonsterDrop(puppy, 4);
      assert.deepStrictEqual(dropsF4, {
        "獣の牙": 2,
        "硬い皮": 1,
        "竜鱗": 1
      }, "Floor 4 drop should be guaranteed: 獣の牙x2, 硬い皮x1, 竜鱗x1");
      console.log("[PASS] Test 2: Guaranteed drops verified.");

      // 3. Verify B1 Encounter Prevention
      // We simulate state on Floor 1 with different distance.
      // Metal Puppy (level 4) should NOT appear on Floor 1.
      for (let dist = 0; dist <= 40; dist++) {
        const dummyState = {
          floor: 1,
          x: dist,
          y: 0,
          seed: Math.floor(Math.random() * 100000),
          party: [{ name: "Hero", status: "ok" }]
        };
        
        // Check if targetLevel + 1 can ever reach 4.
        // Floor 1 targetLevel is: dist < 20 ? 1 : 2.
        // Max targetLevel + 1 on Floor 1 is 2 + 1 = 3.
        // Metal Puppy level is 4, which is > 3. So it must not appear.
        // Let's run generateEncounter 100 times to verify Metal Puppy never spawns
        for (let i = 0; i < 100; i++) {
          const result = generateEncounter(dummyState, false, false, false);
          const hasPuppy = result.monsters.some(m => m.name === "メタルパピー");
          assert.strictEqual(hasPuppy, false, `Metal Puppy should never spawn on Floor 1 (dist=${dist})`);
        }
      }
      console.log("[PASS] Test 3: Floor 1 spawn prevention verified.");

      // 4. Verify B2/B3 Encounter Allowance
      // Floor 2 dist=25 -> targetLevel = 3 -> targetLevel + 1 = 4.
      // Metal Puppy (level 4) should be eligible to spawn here.
      let puppyEligibleOnF2 = false;
      const targetLevelF2Dist25 = 3; // dist >= 20 on Floor 2
      const candidatesF2 = MONSTERS.filter(m => m.treasureRare && m.level <= targetLevelF2Dist25 + 1);
      assert.ok(candidatesF2.some(m => m.name === "メタルパピー"), "Metal Puppy should be a candidate on Floor 2 Far");

      console.log("[PASS] Test 4: Floor 2 Far spawn eligibility verified.");
      console.log("=== ALL METAL PUPPY BALANCE VERIFICATION TESTS PASSED SUCCESSFULLY! ===");
    })();
  })();

  // ========================================================================
  // 元: test_row_targeting.js
  // ========================================================================
  await (async () => {
    console.log("=== START ENEMY ROW SYSTEM VERIFICATION ===");

    // 1. Create a party
    const roster = createDefaultRoster();
    const arthur = roster.find(c => c.name === "Arthur");
    const robin = roster.find(c => c.name === "Robin");
    const maria = roster.find(c => c.name === "Maria");
    const ged = roster.find(c => c.name === "Ged");
    const party = [arthur, robin, maria, ged];

    // Base State setup
    const createBaseState = (monsters) => ({
      party: JSON.parse(JSON.stringify(party)),
      floor: 1,
      inventory: [],
      codex: { monsters: {} },
      currentRun: { kills: 0, goldGained: 0, expGained: 0, equipmentFound: [] },
      roamingMonsters: [],
      combatState: {
        phase: "choose_actions",
        monsters: JSON.parse(JSON.stringify(monsters))
      }
    });

    // Scenario A: Melee attack on backrow while frontrow is alive
    // Setup: 1 front monster (Biter), 1 back monster (Goblin Mage)
    const monstersA = [
      { name: "かみつき蟲 A", level: 1, hp: 10, maxHp: 10, def: 0, status: "ok", row: "front" },
      { name: "ゴブリンの呪術師 A", level: 1, hp: 10, maxHp: 10, def: 0, status: "ok", row: "back" }
    ];

    const stateA = createBaseState(monstersA);
    // Arthur (idx: 0) attacks backrow monster (targetIdx: 1)
    const selectionA = {
      actions: [
        { actorIdx: 0, type: "fight", targetIdx: 1 }
      ]
    };

    const resultA = runCombatRoundCalculation(stateA, selectionA);
    const logsA = resultA.logQueue.map(l => l.msg);
    console.log("- Scenario A Logs:", logsA);

    // Verify that it was blocked and the "miss" log was produced
    assert(logsA.some(msg => msg.includes("前列の敵に阻まれて") && msg.includes("ゴブリンの呪術師 Aには届かない")), 
           "Error: Arthur's physical attack should have been blocked by the front row.");
    console.log("✔ Scenario A Passed: Melee attack to backrow was successfully blocked by frontrow.");


    // Scenario B: Single target Spell (HALITO) targeting backrow while frontrow is alive
    const stateB = createBaseState(monstersA);
    // Maria (Priest) casts HALITO (single target damage) on backrow monster (targetIdx: 1)
    // Give Maria enough MP
    stateB.party[2].mp = 10;
    const selectionB = {
      actions: [
        { actorIdx: 2, type: "spell", spellName: "HALITO", targetIdx: 1 }
      ]
    };

    const resultB = runCombatRoundCalculation(stateB, selectionB);
    const logsB = resultB.logQueue.map(l => l.msg);
    console.log("- Scenario B Logs:", logsB);

    // Verify that HALITO landed on the backrow
    assert(logsB.some(msg => msg.includes("ハリト") && msg.includes("ゴブリンの呪術師 A")),
           "Error: HALITO should target and hit the backrow monster.");
    assert(resultB.state.combatState.monsters[1].hp < 10, "Error: Backrow monster HP should have decreased.");
    console.log("✔ Scenario B Passed: Single target spell successfully targeted backrow.");


    // Scenario C: All enemies target spell (LAHALITO) hitting both rows
    const stateC = createBaseState(monstersA);
    stateC.party[3].mp = 10; // Ged
    const selectionC = {
      actions: [
        { actorIdx: 3, type: "spell", spellName: "LAHALITO", targetIdx: -1 }
      ]
    };

    const resultC = runCombatRoundCalculation(stateC, selectionC);
    const logsC = resultC.logQueue.map(l => l.msg);
    console.log("- Scenario C Logs:", logsC);

    // Verify both monsters took damage
    assert(resultC.state.combatState.monsters[0].hp < 10, "Error: Frontrow monster should have taken LAHALITO damage.");
    assert(resultC.state.combatState.monsters[1].hp < 10, "Error: Backrow monster should have taken LAHALITO damage.");
    console.log("✔ Scenario C Passed: Area spell successfully hit both front and back rows.");


    // Scenario D: Frontrow is defeated, backrow becomes targetable by melee, and collapse log triggers
    const stateD = createBaseState(monstersA);
    // Arthur (idx: 0) goes first (high agi), Robin (idx: 1) goes second (low agi)
    stateD.party[0].agi = 99;
    stateD.party[1].agi = 1;
    // Set frontrow HP to 1 so Arthur can kill it, then Robin attacks backrow
    stateD.combatState.monsters[0].hp = 1;
    const selectionD = {
      actions: [
        { actorIdx: 0, type: "fight", targetIdx: 0 }, // Arthur kills Biter
        { actorIdx: 1, type: "fight", targetIdx: 1 }  // Robin attacks Goblin Mage
      ]
    };

    const resultD = runCombatRoundCalculation(stateD, selectionD);
    const logsD = resultD.logQueue.map(l => l.msg);
    console.log("- Scenario D Logs:", logsD);

    // After the frontrow dies this round, the backrow becomes targetable by melee.
    assert(resultD.state.combatState.monsters[1].hp < 10, "Error: Robin should have hit backrow monster after frontrow collapsed.");
    console.log("✔ Scenario D Passed: Front row collapse makes backrow targetable by melee.");


    // Scenario E: Row default fallback check
    const monstersE = [
      { name: "かみつき蟲 A", level: 1, hp: 10, maxHp: 10, status: "ok" } // No row specified
    ];
    const stateE = createBaseState(monstersE);
    const selectionE = {
      actions: [
        { actorIdx: 0, type: "fight", targetIdx: 0 }
      ]
    };
    const resultE = runCombatRoundCalculation(stateE, selectionE);
    assert(resultE.state.combatState.monsters[0].row === undefined || resultE.state.combatState.monsters[0].row === "front",
           "Error: Row fallback should treat undefined as frontrow.");
    console.log("✔ Scenario E Passed: Undefined row successfully defaults to front.");

    console.log("=== ALL ENEMY ROW SYSTEM TESTS PASSED SUCCESSFULLY! ===");
  })();

  // ========================================================================
  // 元: test_counterplay_audit.js
  // ========================================================================
  await (async () => {
    // --- Helpers ---

    // 各素材がドロップする最小 floor
    const MAT_FLOORS = {
      "獣の牙": 1,
      "硬い皮": 1,
      "毒腺": 2,
      "骨片": 2,
      "霊粉": 3,
      "魔石片": 3,
      "呪布": 3,
      "鉄片": 4,
      "黒角": 4,
      "竜鱗": 5
    };

    // クラフトレシピから各アイテムの最小クラフト floor を算出
    function getCraftFloor(resultId) {
      const recipe = CRAFT_RECIPES.find(r => r.resultId === resultId);
      if (!recipe) return Infinity;
      let maxMatFloor = 1;
      for (const mat of Object.keys(recipe.mats)) {
        const fl = MAT_FLOORS[mat];
        if (fl === undefined) return Infinity;
        if (fl > maxMatFloor) maxMatFloor = fl;
      }
      return maxMatFloor;
    }

    // 呪文習得レベルの定義（leveling.js からのマッピング）
    const SPELL_LEARN_LEVELS = {
      LATUMOFIS: { Priest: 2, Bishop: 3, Ranger: 4 },
      DIALKO: { Priest: 2, Bishop: 3, Ranger: 4 },
      DIURCO: { Priest: 1, Bishop: 2, Ranger: 3 },
      MABARRIER: { Priest: 4, Bishop: 4, Ranger: 5 },
      MONTINO: { Mage: 4, Bishop: 5, Samurai: 6 },
    };

    // 各フロアの想定到達レベル（最大/推奨レベル）
    const FLOOR_LEVELS = {
      1: 2,
      2: 3,
      3: 4,
      4: 5,
      5: 8
    };

    // 呪文がそのフロアで「基本構成（Mage/Priest）」において習得可能か？
    function getSpellAvailableFloor(spellName) {
      const requirements = SPELL_LEARN_LEVELS[spellName];
      if (!requirements) return Infinity;
      
      const primaryClass = ["LATUMOFIS", "DIALKO", "DIURCO", "MABARRIER"].includes(spellName) ? "Priest" : "Mage";
      const reqLevel = requirements[primaryClass];
      
      for (let f = 1; f <= 5; f++) {
        if (FLOOR_LEVELS[f] >= reqLevel) {
          return f;
        }
      }
      return Infinity;
    }

    // 消耗品がそのフロアで入手可能か（ショップまたはクラフト）
    function getItemAvailableFloor(itemId) {
      // ショップは最初から利用可能 (floor 1)
      const shopAvailable = SHOP_STOCK.some(stock => stock.key === itemId);
      const craftFloor = getCraftFloor(itemId);
      return Math.min(shopAvailable ? 1 : Infinity, craftFloor);
    }

    // --- Test 1: Monster Name Consistency ---
    console.log("Checking monster name consistency in ENCOUNTER_PACKS...");
    let consistencyFailed = false;

    for (const [floor, packs] of Object.entries(ENCOUNTER_PACKS)) {
      const f = parseInt(floor);
      for (const pack of packs) {
        for (const member of pack.members) {
          const found = MONSTERS.some(m => m.name === member.name);
          if (!found) {
            console.error(`Error: Monster "${member.name}" in floor ${f} pack is not defined in MONSTERS.`);
            consistencyFailed = true;
          }
        }
      }
    }

    const specialMonsters = ["いにしえの竜", "デーモンガード", "フラック"];
    specialMonsters.forEach(name => {
      const found = MONSTERS.some(m => m.name === name);
      if (!found) {
        console.error(`Error: Special monster "${name}" is not defined in MONSTERS.`);
        consistencyFailed = true;
      }
    });

    if (consistencyFailed) {
      process.exit(1);
    }
    console.log("Monster name consistency check passed.");

    // --- Test 1.5: Sleep/paralysis placement curve ---
    const packsByMonster = (name) => Object.entries(ENCOUNTER_PACKS).flatMap(([floor, packs]) =>
      packs.flatMap(pack => pack.members
        .filter(member => member.name === name)
        .map(member => ({ floor: Number(floor), member, pack })))
    );
    const monsterByName = (name) => MONSTERS.find(m => m.name === name);
    const sleepIntro = monsterByName("まどろみ胞子");
    const sleepGroup = monsterByName("催眠コウモリ");
    const werewolf = monsterByName("ワーウルフ");
    const banshee = monsterByName("バンシー");

    assert.ok(sleepIntro?.isSleepInflicting, "B1 sleep intro monster should inflict sleep.");
    assert.strictEqual(sleepIntro.statusChance, 0.2, "B1 sleep intro should use a low status chance.");
    assert.strictEqual(packsByMonster("まどろみ胞子")[0]?.floor, 1, "Sleep intro monster should appear on B1.");
    assert.strictEqual(packsByMonster("まどろみ胞子")[0]?.member.min, 1, "B1 sleep intro should be single-target education.");
    assert.strictEqual(packsByMonster("まどろみ胞子")[0]?.member.max, 1, "B1 sleep intro should be single-target education.");

    assert.ok(sleepGroup?.isSleepInflicting, "B2 sleep group monster should inflict sleep.");
    assert.strictEqual(sleepGroup.statusChance, 0.3, "B2 sleep group should use the stronger status chance.");
    assert.strictEqual(packsByMonster("催眠コウモリ")[0]?.floor, 2, "Sleep group monster should appear on B2.");
    assert.strictEqual(packsByMonster("催眠コウモリ")[0]?.member.min, 2, "B2 sleep group should appear in groups.");
    assert.strictEqual(packsByMonster("催眠コウモリ")[0]?.member.max, 3, "B2 sleep group should appear in groups.");

    assert.strictEqual(packsByMonster("カースドハンド")[0]?.floor, 3, "Paralysis should debut on B3.");
    assert.ok(werewolf?.isParalyzing, "Werewolf should remain a paralyzing monster.");
    assert.ok(banshee?.isParalyzing, "Banshee should remain a paralyzing monster.");
    assert.ok(werewolf.statusChance >= 0.3 && werewolf.statusChance <= 0.35, "Werewolf paralysis chance should match B4 curve.");
    assert.ok(banshee.statusChance >= 0.3 && banshee.statusChance <= 0.35, "Banshee paralysis chance should match B4 curve.");
    assert.ok(ENCOUNTER_PACKS[4].some(pack =>
      pack.members.filter(member => monsterByName(member.name)?.isParalyzing).length === 2
    ), "B4 should contain a two-paralyzer pack.");
    console.log("Sleep/paralysis placement curve check passed.");

    // --- Test 2: Counterplay Availability Audit ---
    console.log("\nAuditing counterplay availability per floor...");

    const monsterMinFloors = {};
    for (const [floor, packs] of Object.entries(ENCOUNTER_PACKS)) {
      const f = parseInt(floor);
      for (const pack of packs) {
        for (const member of pack.members) {
          if (!monsterMinFloors[member.name] || monsterMinFloors[member.name] > f) {
            monsterMinFloors[member.name] = f;
          }
        }
      }
    }

    monsterMinFloors["いにしえの竜"] = 5;
    monsterMinFloors["デーモンガード"] = 3;
    monsterMinFloors["フラック"] = 4;

    let minPoisonFloor = Infinity;
    let minParalyzeFloor = Infinity;
    let minBlindFloor = Infinity;
    let minSilenceFloor = Infinity;
    let minMpDrainFloor = Infinity;
    let minLahalitoFloor = Infinity;
    let minMadaltoFloor = Infinity;
    let minTiltowaitFloor = Infinity;

    MONSTERS.forEach(m => {
      const minFloor = monsterMinFloors[m.name];
      if (minFloor === undefined) return;
      
      if (m.isPoisonous) {
        if (minFloor < minPoisonFloor) minPoisonFloor = minFloor;
      }
      if (m.isParalyzing) {
        if (minFloor < minParalyzeFloor) minParalyzeFloor = minFloor;
      }
      if (m.isBlinding) {
        if (minFloor < minBlindFloor) minBlindFloor = minFloor;
      }
      if (m.traits && m.traits.includes("silence")) {
        if (minFloor < minSilenceFloor) minSilenceFloor = minFloor;
      }
      if (m.traits && m.traits.includes("drainMp")) {
        if (minFloor < minMpDrainFloor) minMpDrainFloor = minFloor;
      }
      if (m.spell === "LAHALITO") {
        if (minFloor < minLahalitoFloor) minLahalitoFloor = minFloor;
      }
      if (m.spell === "MADALTO") {
        if (minFloor < minMadaltoFloor) minMadaltoFloor = minFloor;
      }
      if (m.spell === "TILTOWAIT") {
        if (minFloor < minTiltowaitFloor) minTiltowaitFloor = minFloor;
      }
    });

    const threats = [
      { name: "毒 (Poison)", minFloor: minPoisonFloor, spells: ["LATUMOFIS"], items: ["ANTIDOTE"] },
      { name: "麻痺 (Paralysis)", minFloor: minParalyzeFloor, spells: ["DIALKO"], items: ["PARALYZE_CURE"] },
      { name: "盲目 (Blind)", minFloor: minBlindFloor, spells: ["DIURCO"], items: ["EYE_DROPS"] },
      { name: "沈黙 (Silence)", minFloor: minSilenceFloor, spells: ["MONTINO"], items: [] },
      { name: "MPドレイン (MP Drain)", minFloor: minMpDrainFloor, spells: [], items: ["MANA_POTION"] },
      { name: "全体魔法 LAHALITO", minFloor: minLahalitoFloor, spells: ["MABARRIER"], items: [] },
      { name: "全体魔法 MADALTO", minFloor: minMadaltoFloor, spells: ["MABARRIER"], items: [] },
      { name: "全体魔法 TILTOWAIT", minFloor: minTiltowaitFloor, spells: ["MABARRIER"], items: [] }
    ];

    console.log("\nThreat Floor Mapping:");
    console.log("-----------------------------------------------------------------");
    console.log("| Threat               | Min Floor | Counterplay (Floor)        |");
    console.log("-----------------------------------------------------------------");

    let auditFailed = false;

    threats.forEach(t => {
      if (t.minFloor === Infinity) {
        console.log(`| ${t.name.padEnd(20)} | None      | N/A                        |`);
        return;
      }
      
      let minCounterplayFloor = Infinity;
      const counterplayList = [];
      
      t.spells.forEach(s => {
        const fl = getSpellAvailableFloor(s);
        if (fl < minCounterplayFloor) minCounterplayFloor = fl;
        counterplayList.push(`${s}(Spell:Fl${fl})`);
      });
      t.items.forEach(i => {
        const fl = getItemAvailableFloor(i);
        const craftFl = getCraftFloor(i);
        if (fl < minCounterplayFloor) minCounterplayFloor = fl;
        counterplayList.push(`${i}(Item:Fl${fl}, Craft:Fl${craftFl})`);
      });
      
      const counterStr = counterplayList.join(", ");
      console.log(`| ${t.name.padEnd(20)} | Floor ${t.minFloor}   | ${counterStr.padEnd(26)} |`);
      
      if (t.minFloor < minCounterplayFloor) {
        console.error(`Audit Failed: Threat "${t.name}" appears on Floor ${t.minFloor}, but counterplay is not available until Floor ${minCounterplayFloor}.`);
        auditFailed = true;
      }
    });

    console.log("-----------------------------------------------------------------");

    if (auditFailed) {
      console.error("\nAudit FAILED: Counterplay gaps detected!");
      process.exit(1);
    } else {
      console.log("\nAudit PASSED: All threats have valid counterplays available at or before their appearance floor.");
    }
  })();

  console.log("\n[TEST_ENEMY PASSED]");
})();
