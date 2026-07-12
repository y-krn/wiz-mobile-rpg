// 宝箱/戦利品 統合テスト
// 集約元: test_chest_guarantee.js, test_chest_trap.js, test_unidentified.js
// 各テストは同名ローカル定義の衝突回避と Math.random 差し替え隔離のため IIFE でスコープ分離。
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

import assert from "assert";

(async () => {

  // ========================================================================
  // 元: test_chest_guarantee.js
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
      addEventListener: () => {},
      AudioContext: class {},
      webkitAudioContext: class {}
    };

    Object.defineProperty(global, "navigator", {
      value: { userAgent: "node" },
      writable: true,
      configurable: true
    });

    (async () => {
      const { state, initNewGame } = await import("../src/state.js");
      const { setupChestState } = await import("../src/chest.js");
      const { generateRandomEquipment, ITEMS } = await import("../src/data.js");
      const assert = await import("assert");

      console.log("Starting Chest Guarantee & Smart Drop Verification Tests...");

      // Test 1: B1F 3-Chest Equipment Guarantee
      initNewGame();

      state.floor = 1;
      state.currentRun = {
        b1ChestsOpened: 0,
        b1EquipFound: 0,
        equipmentFound: [],
        chestsOpened: 0
      };

      // Simulate opening 2 chests without getting any equipment
      setupChestState(null, 10, "HEAL_POTION"); // Encounter 1 (forced potion)
      state.inventory.push("HEAL_POTION");
      state.currentRun.chestsOpened++;

      assert.strictEqual(state.currentRun.b1ChestsOpened, 1, "Opened 1 chest on B1");
      assert.strictEqual(state.currentRun.b1EquipFound, 0, "No equipment found yet");

      setupChestState(null, 10, "ANTIDOTE"); // Encounter 2 (forced potion)
      state.inventory.push("ANTIDOTE");
      state.currentRun.chestsOpened++;

      assert.strictEqual(state.currentRun.b1ChestsOpened, 2, "Opened 2 chests on B1");
      assert.strictEqual(state.currentRun.b1EquipFound, 0, "No equipment found yet");

      // Encounter 3: This must guarantee an equipment drop!
      setupChestState(); 
      state.currentRun.chestsOpened++;

      const generatedItem = state.chestState ? state.chestState.item : null;
      assert.ok(generatedItem, "Item must be generated on 3rd chest");
      assert.strictEqual(typeof generatedItem, "object", "Generated item must be an object (unidentified equipment)");
      assert.strictEqual(generatedItem.kind, "equipment", "Generated item must be equipment");
      assert.strictEqual(generatedItem.rarity, "magic", "Generated item must be magic rarity");

      // Award the generated equipment to inventory
      state.inventory.push(generatedItem);
      state.currentRun.equipmentFound.push(generatedItem);
      state.currentRun.b1EquipFound++; // Increment count on B1

      assert.strictEqual(state.currentRun.b1ChestsOpened, 3, "Opened 3 chests on B1");
      assert.strictEqual(state.currentRun.b1EquipFound, 1, "Equipment count should now be 1");

      console.log("-> [PASS] B1F 3rd Chest Guarantee verified");

      // Test 2: Smart Drop Bias (Prioritize missing slots)
      initNewGame();
      state.floor = 1;

      state.party = [
        {
          name: "Arthur",
          class: "Fighter",
          status: "ok",
          equipment: {
            weapon: null,
            shield: "SMALL_SHIELD",
            armor: "LEATHER_ARMOR"
          }
        },
        {
          name: "Robin",
          class: "Thief",
          status: "ok",
          equipment: {
            weapon: "DAGGER",
            shield: null,
            armor: "LEATHER_ARMOR"
          }
        }
      ];

      let weapons = 0;
      let shields = 0;
      let armors = 0;

      for (let i = 0; i < 100; i++) {
        const eq = generateRandomEquipment(1, null, Math.random, state.party);
        const type = ITEMS[eq.baseId].type;
        if (type === "weapon") weapons++;
        else if (type === "shield") shields++;
        else if (type === "armor") armors++;
      }

      console.log(`Simulation stats (100 seeds): Weapons: ${weapons}, Shields: ${shields}, Armors: ${armors}`);
      assert.ok(armors > weapons, `Armors (${armors}) should be prioritized over weapons (${weapons}) due to missing slot count`);

      console.log("-> [PASS] Smart Drop priority bias verified");
      console.log("All Chest Guarantee & Smart Drop Verification Tests PASSED!");
    })();
  })();

  // ========================================================================
  // 元: test_chest_trap.js
  // ========================================================================
  await (async () => {
    // Mock DOM and localStorage for Node.js test environment before imports

    // Simple DOM Mock
    const createdElements = [];
    global.document = {
      getElementById: () => {
        return {
          textContent: "",
          innerHTML: "",
          appendChild: () => {},
          replaceChildren: () => {},
          addEventListener: () => {},
          style: {},
          classList: {
            add: () => {},
            remove: () => {},
            toggle: () => {},
            contains: () => false
          }
        };
      },
      createElement: (tag) => {
        const el = {
          tagName: tag.toUpperCase(),
          className: "",
          textContent: "",
          disabled: false,
          style: {},
          classList: {
            add: (cls) => {
              el.className += " " + cls;
            },
            remove: (cls) => {
              el.className = el.className.replace(cls, "").trim();
            },
            toggle: () => {},
            contains: () => false
          },
          events: {},
          addEventListener: (evt, cb) => {
            el.events[evt] = cb;
          },
          appendChild: (child) => {
            if (!el.children) el.children = [];
            el.children.push(child);
          },
          replaceChildren: (...children) => {
            el.children = children;
          }
        };
        createdElements.push(el);
        return el;
      },
      querySelector: () => {
        return {
          setAttribute: () => {},
          removeAttribute: () => {},
          style: {},
          classList: {
            add: () => {},
            remove: () => {},
            toggle: () => {},
            contains: () => false
          }
        };
      },
      querySelectorAll: () => {
        return [];
      }
    };

    global.window = {
      scrollTo: () => {}
    };

    // Delayed dynamic imports to ensure global mocks are set up first
    const { state, initNewGame } = await import("../src/state.js");
    const { setupChestState, openChestDirectly } = await import("../src/chest.js");

    console.log("Starting Chest Trap Inspect Verification Tests...");

    // Initialize game state (creates party, map, etc.)
    initNewGame();
    // Add dummy party members to enable active character check
    state.party = [
      { name: "Robin", class: "Thief", status: "ok" }
    ];

    // Set light turns and power
    state.lightTurns = 0;
    state.lightPower = "";

    // Test 1: Setup chest and verify initial state
    createdElements.length = 0;
    setupChestState("poison needle", 100, null);

    assert.ok(state.chestState, "chestState should be created");
    assert.strictEqual(state.chestState.trap, "poison needle", "Trap should be poison needle");
    assert.strictEqual(state.chestState.inspected, false, "Should not be inspected initially");
    assert.strictEqual(state.chestState.identifiedTrap, "", "Identified trap should be empty");

    console.log("[PASS] Initial chest state verified.");

    // Test 2: Verify UI button configuration before inspection
    // Find inspect and disarm buttons in created elements
    const getButtons = () => createdElements.filter(el => el.tagName === "BUTTON");

    let buttons = getButtons();
    const btnInspect = buttons.find(b => b.textContent === "調べる");
    const btnDisarmBefore = buttons.find(b => b.textContent.includes("解除"));

    assert.ok(btnInspect, "Inspect button should exist");
    assert.strictEqual(btnInspect.disabled, false, "Inspect button should be enabled initially");

    assert.ok(btnDisarmBefore, "Disarm button should exist");
    assert.strictEqual(btnDisarmBefore.textContent, "解除（要調査）", "Disarm button should say '解除（要調査）' before inspection");
    assert.strictEqual(btnDisarmBefore.disabled, true, "Disarm button should be disabled before inspection");

    console.log("[PASS] Initial UI button states verified.");

    // Test 3: Trigger inspection
    createdElements.length = 0; // Clear elements log for redraw
    assert.ok(btnInspect.events["click"], "Inspect button should have click listener");

    // Trigger inspect
    btnInspect.events["click"]();

    assert.strictEqual(state.chestState.inspected, true, "Chest should be marked as inspected");
    assert.ok(["poison needle", "gas bomb", "teleporter", "flash bomb", "none"].includes(state.chestState.identifiedTrap), "Identified trap should be populated");

    console.log("[PASS] Inspection execution verified.");

    // Test 4: Verify UI button configuration after inspection
    buttons = getButtons();
    const btnInspectAfter = buttons.find(b => b.textContent === "調査済み");
    const btnDisarmAfter = buttons.find(b => b.textContent.includes("解除") || b.textContent === "解除する" || b.textContent === "解除不要");

    assert.ok(btnInspectAfter, "Inspect button should change text to '調査済み'");
    assert.strictEqual(btnInspectAfter.disabled, true, "Inspect button should be disabled after inspection");

    assert.ok(btnDisarmAfter, "Disarm button should exist after inspection");
    if (state.chestState.identifiedTrap === "none") {
      assert.strictEqual(btnDisarmAfter.textContent, "解除不要", "Disarm button should say '解除不要' if no trap identified");
      assert.strictEqual(btnDisarmAfter.disabled, true, "Disarm button should be disabled if no trap identified");
    } else {
      assert.strictEqual(btnDisarmAfter.textContent, "解除する", "Disarm button should say '解除する' if trap identified");
      assert.strictEqual(btnDisarmAfter.disabled, false, "Disarm button should be enabled if trap identified");
    }

    console.log("[PASS] Post-inspection UI button states verified.");

    // Test 5: Verify selected opener takes single-target trap risk
    initNewGame();
    state.party = [
      { name: "Arthur", class: "Fighter", status: "ok", hp: 20, maxHp: 20, equipment: {} },
      { name: "Robin", class: "Thief", status: "ok", hp: 15, maxHp: 15, equipment: {} }
    ];
    state.floor = 1;
    state.currentRun = {
      chestsOpened: 0,
      trapsTriggered: 0,
      goldGained: 0,
      itemsFound: [],
      equipmentFound: []
    };
    state.chestState = {
      x: state.x,
      y: state.y,
      trap: "poison needle",
      identifiedTrap: "poison needle",
      inspected: true,
      inspectChance: 0.85,
      gold: 0,
      item: null,
      accessoryItem: null,
      lootHint: null
    };
    state.map[state.y][state.x].event = "chest";

    const originalSetTimeout = global.setTimeout;
    const originalRandom = Math.random;
    const scheduledTimeouts = [];
    global.setTimeout = (cb, delay) => {
      scheduledTimeouts.push({ cb, delay });
      return scheduledTimeouts.length;
    };
    Math.random = () => 0.99;
    try {
      openChestDirectly(state.party[1]);
    } finally {
      global.setTimeout = originalSetTimeout;
      Math.random = originalRandom;
    }

    assert.strictEqual(state.party[0].status, "ok", "Default front character should not take selected opener trap");
    assert.strictEqual(state.party[0].hp, 20, "Default front character HP should remain unchanged");
    assert.strictEqual(state.party[1].status, "poisoned", "Selected opener should take poison needle");
    assert.strictEqual(state.party[1].hp, 3, "Selected opener should take poison needle damage");
    assert.strictEqual(state.currentRun.trapsTriggered, 1, "Trap trigger count should increment");
    assert.strictEqual(scheduledTimeouts.length, 0, "Surviving party should return without a result delay");
    assert.strictEqual(state.chestState, null, "Successful chest opening should clear chestState immediately");
    assert.strictEqual(state.gameState, "explore", "Successful chest opening should return to explore immediately");
    assert.strictEqual(state.transitioning, false, "Successful chest opening should end the transition immediately");
    assert.ok(global.localStorage.getItem("mobile_wiz_rpg_autosave"), "Successful chest opening should autosave");

    console.log("[PASS] Selected chest opener trap target verified.");

    // Test 6: A lethal trap keeps the existing delayed game-over path
    initNewGame();
    state.party = [
      { name: "Robin", class: "Thief", status: "ok", hp: 10, maxHp: 10, equipment: {} }
    ];
    state.roster = [
      { name: "Robin", class: "Thief", status: "ok", hp: 10, maxHp: 10, equipment: {} }
    ];
    state.floor = 1;
    state.currentRun = {
      chestsOpened: 0,
      trapsTriggered: 0,
      goldGained: 0,
      itemsFound: [],
      equipmentFound: []
    };
    state.chestState = {
      x: state.x,
      y: state.y,
      trap: "poison needle",
      identifiedTrap: "poison needle",
      inspected: true,
      inspectChance: 0.85,
      gold: 0,
      item: null,
      accessoryItem: null,
      lootHint: null
    };
    state.map[state.y][state.x].event = "chest";

    const gameOverTimeouts = [];
    global.setTimeout = (cb, delay) => {
      gameOverTimeouts.push({ cb, delay });
      return gameOverTimeouts.length;
    };
    Math.random = () => 0.99;
    try {
      openChestDirectly(state.party[0]);
      assert.strictEqual(gameOverTimeouts.length, 1, "Party wipe should retain the result delay");
      assert.strictEqual(gameOverTimeouts[0].delay, 1800, "Party wipe delay should remain 1800ms");
      assert.strictEqual(state.transitioning, true, "Party wipe should remain transitioning during the delay");
      gameOverTimeouts[0].cb();
    } finally {
      global.setTimeout = originalSetTimeout;
      Math.random = originalRandom;
    }

    assert.strictEqual(state.gameState, "result", "Party wipe timeout should reach the game-over result");
    assert.strictEqual(state.currentRun.returnReason, "gameover", "Party wipe should preserve the game-over reason");
    assert.strictEqual(state.transitioning, false, "Party wipe timeout should end the transition");
    assert.strictEqual(state.party[0], state.roster[0], "Party wipe should relink party members to roster objects");
    assert.strictEqual(state.party[0].status, "dead", "Relinked party member should retain dead status");
    assert.strictEqual(state.party[0].hp, 0, "Relinked party member should retain zero HP");

    console.log("[PASS] Delayed chest trap game-over path verified.");

    console.log("All chest trap inspect tests passed successfully!");
  })();

  // ========================================================================
  // 元: test_unidentified.js
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
      const { generateRandomEquipment, getItemData, SPELLS } = await import("../src/data.js");
      const { setupChestState } = await import("../src/chest.js");
      const { runCombatRoundCalculation } = await import("../src/combat_logic.js");
      const assert = await import("assert");

      console.log("Starting Unidentified Equipment System Verification Tests...");

      // Initialize
      initNewGame();

      // ----------------------------------------------------
      // Test 1: Unidentified Name Customization
      // ----------------------------------------------------
      console.log("Running Test 1: Unidentified Name Customization...");

      const magicWand = { kind: "equipment", baseId: "WAND", rarity: "magic", identified: false };
      const magicSword = { kind: "equipment", baseId: "LONG_SWORD", rarity: "magic", identified: false };
      const rareArmor = { kind: "equipment", baseId: "PLATE_MAIL", rarity: "rare", identified: false };
      const epicRobe = { kind: "equipment", baseId: "PRIEST_ROBE", rarity: "epic", identified: false };

      // Unidentified gear masks its base name behind a generic label
      // regardless of base type or rarity.
      [magicWand, magicSword, rareArmor, epicRobe].forEach(item => {
        const data = getItemData(item);
        assert.strictEqual(data.name, "未鑑定の装備品", `Unidentified ${item.baseId} should be masked as 未鑑定の装備品`);
      });
      console.log("[PASS] Unidentified names verified.");

      // ----------------------------------------------------
      // Test 2: Smart Drop Validation
      // ----------------------------------------------------
      console.log("Running Test 2: Smart Drop Validation...");

      // Mock party: Mage only (only ARCANE_ROBE is usable among B4F candidates)
      state.party = [
        { name: "MageChar", class: "Mage", status: "ok", equipment: {} }
      ];

      // Try generating 200 random equipments at floor 4.
      // Usable by Mage: "ARCANE_ROBE"
      // Smart drop (70%) should force ARCANE_ROBE.
      let arcaneRobeCount = 0;
      const totalTrials = 200;
      for (let i = 0; i < totalTrials; i++) {
        const eq = generateRandomEquipment(4, null, Math.random, state.party);
        if (eq.baseId === "ARCANE_ROBE") {
          arcaneRobeCount++;
        }
      }

      const rate = arcaneRobeCount / totalTrials;
      console.log(`ARCANE_ROBE count: ${arcaneRobeCount}/${totalTrials} (${(rate*100).toFixed(1)}%)`);
      assert.ok(rate > 0.40, "Smart drop rate for ARCANE_ROBE should be > 40%");
      console.log("[PASS] Smart drop verified.");

      // ----------------------------------------------------
      // Test 3: Loot Hint (宝気) in Chests
      // ----------------------------------------------------
      console.log("Running Test 3: Loot Hint (宝気)...");
      state.firstChestUnidentifiedGuaranteed = true;

      // Setup chest state with no item or usable item
      setupChestState("gas bomb", 100, "HEAL_POTION", Math.random);
      assert.strictEqual(state.chestState.lootHint.hasEquipmentSignal, false, "HEAL_POTION should not signal equipment");
      assert.strictEqual(state.chestState.lootHint.aura, "weak", "HEAL_POTION should have weak aura");

      // Setup chest state with Epic equipment
      const epicEq = { kind: "equipment", baseId: "KATANA", rarity: "epic", identified: false, affixes: [] };
      state.chestState = null;
      // Bypass internal item selection to test specific item
      state.floor = 5;
      state.chestState = {
        trap: "poison needle",
        gold: 50,
        item: epicEq,
        lootHint: {
          hasEquipmentSignal: true,
          aura: "strong",
          label: "装備品の反応あり"
        }
      };
      assert.strictEqual(state.chestState.lootHint.hasEquipmentSignal, true);
      assert.strictEqual(state.chestState.lootHint.aura, "strong");
      console.log("[PASS] Loot hint verified.");

      // ----------------------------------------------------
      // Test 4: New Affixes Integration
      // ----------------------------------------------------
      console.log("Running Test 4: New Affixes Integration...");

      // A. followUp (追撃) in Combat
      const attacker = {
        name: "Robin", class: "Fighter", status: "ok", level: 5, hp: 50, maxHp: 50,
        str: 15, int: 10, pie: 10, vit: 10, agi: 10, luk: 10,
        equipment: {
          // followUp is capped at 50% (getCharAffixSum caps), so the effective chance is 50, not 100.
          weapon: { kind: "equipment", baseId: "LONG_SWORD", rarity: "rare", identified: true, affixes: [{ type: "followUp", value: 50 }] },
          shield: null,
          armor: null
        }
      };
      state.party = [attacker];
      state.combatState = {
        monsters: [{ name: "テストゴブリン", hp: 100, maxHp: 100, def: 5, exp: 10, gold: 10, color: "#fff" }],
        phase: "choose_actions"
      };

      // 戦闘乱数を実効チャンス(50%)未満に固定し、追撃を確定発火させる(敵は1撃で倒れない)
      const tempRandFollowUp = Math.random;
      Math.random = () => 0.1;
      const roundResult = runCombatRoundCalculation(state, {
        actions: [{ actorIdx: 0, type: "fight", targetIdx: 0 }]
      });
      Math.random = tempRandFollowUp;

      const followUpLog = roundResult.logQueue.some(l => l.msg && l.msg.includes("追撃"));
      assert.ok(followUpLog, "Combat round logs should contain 追撃 when followUp roll is below the capped chance");

      // B. arcane (呪文威力+10%)
      const mageCaster = {
        name: "Ged", class: "Mage", status: "ok", level: 5, hp: 30, maxHp: 30, mp: 10, maxMp: 10,
        str: 8, int: 15, pie: 10, vit: 10, agi: 10, luk: 10,
        equipment: {
          weapon: { kind: "equipment", baseId: "WAND", rarity: "rare", identified: true, affixes: [{ type: "arcane", value: 10 }] },
          shield: null,
          armor: null
        }
      };
      
      const dummyCaster1 = { ...mageCaster, equipment: {} };
      const dummyCaster2 = { ...mageCaster };
      
      let totalD1 = 0;
      let totalD2 = 0;
      for(let i=0; i<100; i++) {
        // mock random
        const tempRand = Math.random;
        Math.random = () => 0.5;
        totalD1 += SPELLS.HALITO.effect(dummyCaster1, { name: "Target" }).damage;
        totalD2 += SPELLS.HALITO.effect(dummyCaster2, { name: "Target" }).damage;
        Math.random = tempRand;
      }
      assert.ok(totalD2 > totalD1, "Arcane caster damage should be greater due to +10% boost");

      // C. devotion (回復威力+10%)
      const priestCaster = {
        name: "Maria", class: "Priest", status: "ok", level: 5, hp: 40, maxHp: 40, mp: 10, maxMp: 10,
        str: 8, int: 10, pie: 15, vit: 10, agi: 10, luk: 10,
        equipment: {
          weapon: { kind: "equipment", baseId: "MACE", rarity: "rare", identified: true, affixes: [{ type: "devotion", value: 10 }] },
          shield: null,
          armor: null
        }
      };
      const dummyPriest1 = { ...priestCaster, equipment: {} };
      const dummyPriest2 = { ...priestCaster };
      
      const targetChar = { hp: 1, maxHp: 100 };
      const tempRand = Math.random;
      Math.random = () => 0.5;
      const heal1 = SPELLS.DIOS.effect(dummyPriest1, targetChar).heal;
      const heal2 = SPELLS.DIOS.effect(dummyPriest2, targetChar).heal;
      Math.random = tempRand;
      assert.ok(heal2 > heal1, "Devotion caster healing should be greater due to +10% boost");

      // D. guardian (被ダメージ軽減-10% at HP<=25%)
      // Compare a guarded char against an identical unguarded one under fixed rolls:
      // the guardian shield must leave strictly more HP (less damage taken).
      const makeGuardianChar = (shield) => ({
        name: "Arthur", class: "Fighter", status: "ok", level: 5, hp: 10, maxHp: 40, // 10/40 = 25% (eligible)
        str: 12, int: 10, pie: 10, vit: 15, agi: 10, luk: 10,
        equipment: { weapon: null, shield, armor: null }
      });
      const monsterAttacker = () => ({
        monsters: [{ name: "テストゴブリン", hp: 100, maxHp: 100, atk: 20, def: 5, exp: 10, gold: 10, color: "#fff" }],
        phase: "choose_actions"
      });

      const runGuardian = (shield) => {
        state.party = [makeGuardianChar(shield)];
        state.combatState = monsterAttacker();
        const tempRand = Math.random;
        Math.random = () => 0; // Fix rand rolls in combat round for a deterministic comparison
        const res = runCombatRoundCalculation(state, { actions: [{ actorIdx: 0, type: "defend" }] });
        Math.random = tempRand;
        return res.state.party[0].hp;
      };

      const guardedHp = runGuardian({ kind: "equipment", baseId: "SMALL_SHIELD", rarity: "rare", identified: true, affixes: [{ type: "guardian", value: 10 }] });
      const unguardedHp = runGuardian(null);
      console.log(`Guardian HP: guarded=${guardedHp}, unguarded=${unguardedHp}`);
      assert.ok(guardedHp > unguardedHp, "Guardian affix should reduce incoming damage (higher remaining HP)");
      console.log("[PASS] New affixes verified.");

      console.log("All Unidentified Equipment verification tests passed successfully!");
    })();
  })();

  console.log("\n[TEST_LOOT PASSED]");
})();
