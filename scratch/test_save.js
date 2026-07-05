// セーブ/復旧 統合テスト
// 集約元: test_remains_save.js, test_save_recovery.js, test_recovery_audit.js
// 各テストは同名ローカル定義の衝突回避と Math.random 差し替え隔離のため IIFE でスコープ分離。
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};



(async () => {

  // ========================================================================
  // 元: test_remains_save.js
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
      const assert = await import("assert");
      const { state, initNewGame, saveAutosave, loadGame } = await import("../src/state.js");
      const { triggerRunResult } = await import("../src/menu.js");
      const { enterDungeon } = await import("../src/movement.js");

      console.log("=== STARTING REMAINS AND SAVE/DUNGEON ENTER VERIFICATION TESTS ===");

      // 1. Initial State Setup
      initNewGame();
      state.seed = "TEST-REMAINS-SEED";
      state.gold = 1000;
      const char = { name: "Arthur", class: "Fighter", level: 3, hp: 20, maxHp: 20, status: "ok", equipment: { weapon: null, armor: null, shield: null } };
      state.roster = [char];
      state.party = [char];
      state.inventory = ["HEAL_POTION", "DRAGON_KEY"]; // DRAGON_KEYは重要品なので100%遺留品になる

      // 2. Trigger GameOver (triggerRunResult)
      console.log("Test 1: triggerRunResult('gameover') should generate remains and wipedFloor coordinates...");
      enterDungeon();
      triggerRunResult("gameover");

      assert.default.ok(state.remains.length > 0, "Remains should be generated");
      const latestRemains = state.remains[0];
      assert.default.strictEqual(latestRemains.floor, 1, "Remains floor should match");
      assert.default.strictEqual(latestRemains.items.includes("DRAGON_KEY"), true, "DRAGON_KEY should be preserved in remains");
      assert.default.strictEqual(state.party[0].status, "dead", "Party member should be dead");
      assert.default.strictEqual(state.currentRun.wipedFloor, 1, "wipedFloor coordinates should be saved in currentRun");
      assert.default.strictEqual(state.currentRun.wipedX, latestRemains.x, "wipedX should match remains x");
      assert.default.strictEqual(state.currentRun.wipedY, latestRemains.y, "wipedY should match remains y");
      console.log("-> [PASS] remains generation and wipedFloor variables verified");

      // 3. Save & Load (saveAutosave & loadGame)
      console.log("Test 2: Remains should persist after saveAutosave() and loadGame()...");
      saveAutosave();

      // Clear remains in memory
      state.remains = [];
      assert.default.strictEqual(state.remains.length, 0, "Memory remains should be cleared for test");

      loadGame();
      assert.default.strictEqual(state.remains.length, 1, "Remains should be loaded back from save");
      assert.default.strictEqual(state.remains[0].items.includes("DRAGON_KEY"), true, "DRAGON_KEY should persist in loaded remains");
      console.log("-> [PASS] remains persistence verified");

      // 4. enterDungeon with all dead party members
      console.log("Test 3: enterDungeon() with all dead party members should not enter explore state...");
      state.gameState = "town";
      state.floor = 1;
      // party is already dead from the gameover test
      assert.default.strictEqual(state.party.every(c => c.status === "dead"), true, "All party members should be dead");

      enterDungeon();
      assert.default.strictEqual(state.gameState, "town", "Should remain in town state when party is all dead");
      console.log("-> [PASS] dead party dungeon enter restriction verified");

      // 5. enterDungeon with living party members
      console.log("Test 4: enterDungeon() with a living party member should enter explore state...");
      state.party[0].status = "ok";
      state.party[0].hp = 20;

      enterDungeon();
      assert.default.strictEqual(state.gameState, "explore", "Should enter explore state when there is a living member");
      console.log("-> [PASS] living party dungeon enter verified");

      console.log("=== ALL REMAINS AND DUNGEON ENTER TESTS PASSED SUCCESSFULLY! ===");
    })();
  })();

  // ========================================================================
  // 元: test_save_recovery.js
  // ========================================================================
  await (async () => {
    // セーブ破損時のバックアップ復旧とデータ退避を検証する。

    const SAVE_KEY = "mobile_wiz_rpg_autosave";
    const OLD_SAVE_KEY = "mobile_wiz_rpg_save";
    const BACKUP_KEY = "mobile_wiz_rpg_backup";
    const CORRUPT_KEY = "mobile_wiz_rpg_corrupt";

    // localStorageモック
    globalThis.localStorage = {
      _d: {},
      getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
      setItem(k, v) { this._d[k] = String(v); },
      removeItem(k) { delete this._d[k]; },
      clear() { this._d = {}; }
    };
    globalThis.window = {};

    const { state } = await import("../src/state/state_core.js");
    const { initNewGame, saveAutosave, loadGame } = await import("../src/state/save_storage.js");

    let failed = false;
    function assert(cond, msg) {
      if (cond) {
        console.log(`-> [PASS] ${msg}`);
      } else {
        console.error(`-> [FAIL] ${msg}`);
        failed = true;
      }
    }

    console.log("=== SAVE RECOVERY VERIFICATION ===");

    // [1] 正常なセーブ/ロードの往復
    console.log("\n[1] Normal save/load roundtrip:");
    localStorage.clear();
    initNewGame();
    state.gold = 777;
    saveAutosave();
    state.gold = 0;
    loadGame();
    assert(state.gold === 777, "normal roundtrip preserves gold (777)");

    // [2] SAVE破損 + 有効なBACKUP → バックアップから復旧、SAVEは初期化上書きされない
    console.log("\n[2] Corrupt SAVE, valid BACKUP -> recover from backup:");
    localStorage.clear();
    initNewGame();
    state.gold = 500;
    saveAutosave();       // SAVE = gold500
    state.gold = 600;
    saveAutosave();       // SAVE = gold600, BACKUP = gold500
    // SAVEを破損させる(BACKUPは gold500 のまま有効)
    localStorage.setItem(SAVE_KEY, "{ this is not valid json ]");
    state.gold = 0;
    loadGame();
    assert(state.gold === 500, `recovered gold from backup (got ${state.gold}, expected 500)`);
    assert(localStorage.getItem(CORRUPT_KEY) === null, "no corrupt-preserve needed when backup succeeds");

    // [3] SAVE破損 + BACKUPなし + 有効なOLDセーブ → 旧キーから復旧
    console.log("\n[3] Corrupt SAVE, no BACKUP, valid OLD save -> recover from legacy:");
    localStorage.clear();
    initNewGame();
    state.gold = 321;
    saveAutosave();
    const goodPayload = localStorage.getItem(SAVE_KEY); // 直近の正常payload(gold321)
    localStorage.setItem(OLD_SAVE_KEY, goodPayload);
    localStorage.setItem(SAVE_KEY, "corrupt###");
    localStorage.removeItem(BACKUP_KEY);
    state.gold = 0;
    loadGame();
    assert(state.gold === 321, `recovered gold from legacy key (got ${state.gold}, expected 321)`);

    // [4] 全滅 -> 新規開始 + 破損データはCORRUPT_KEYへ退避(消えない)
    console.log("\n[4] All sources corrupt -> new game, corrupt data preserved:");
    localStorage.clear();
    const corruptRaw = "TOTALLY_BROKEN_SAVE_DATA_%%%";
    localStorage.setItem(SAVE_KEY, corruptRaw);
    loadGame();
    assert(localStorage.getItem(CORRUPT_KEY) === corruptRaw, "corrupt raw preserved under CORRUPT_KEY");
    assert(state.gold === 150, `fresh new game started (gold ${state.gold}, expected 150)`);

    // [5] バックアップのローテーション: 2回セーブでBACKUP=1つ前
    console.log("\n[5] Backup rotation holds previous generation:");
    localStorage.clear();
    initNewGame();
    state.gold = 100;
    saveAutosave();  // SAVE=100
    state.gold = 200;
    saveAutosave();  // SAVE=200, BACKUP=100
    const backup = JSON.parse(localStorage.getItem(BACKUP_KEY));
    const current = JSON.parse(localStorage.getItem(SAVE_KEY));
    assert(current.gold === 200 && backup.gold === 100, `SAVE=200/BACKUP=100 (got SAVE=${current.gold} BACKUP=${backup.gold})`);

    if (failed) {
      console.error("\nSAVE RECOVERY TESTS FAILED");
      process.exit(1);
    } else {
      console.log("\n=== ALL SAVE RECOVERY TESTS PASSED ===");
    }
  })();

  // ========================================================================
  // 元: test_recovery_audit.js
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

    const createDummyElement = () => {
      const element = {
        style: {},
        children: [],
        listeners: {},
        appendChild: (child) => {
          element.children.push(child);
          return child;
        },
        addEventListener: (event, handler) => {
          element.listeners[event] = handler;
        },
        click: () => {
          if (element.listeners.click) element.listeners.click();
        },
        classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
        setAttribute: () => {},
        getAttribute: () => "",
        removeAttribute: () => {},
        innerHTML: "",
        textContent: "",
        disabled: false,
        cloneNode: () => createDummyElement()
      };
      return element;
    };

    const elements = new Map();
    const getElement = (id) => {
      if (!elements.has(id)) elements.set(id, createDummyElement());
      return elements.get(id);
    };

    global.document = {
      getElementById: getElement,
      querySelector: () => createDummyElement(),
      querySelectorAll: () => [],
      createElement: () => createDummyElement(),
      body: createDummyElement()
    };

    global.window = {
      innerWidth: 375,
      innerHeight: 667,
      addEventListener: () => {},
      AudioContext: class {
        constructor() {
          this.currentTime = 0;
          this.destination = {};
        }
        createOscillator() {
          return {
            type: "",
            frequency: {
              setValueAtTime: () => {},
              linearRampToValueAtTime: () => {},
              exponentialRampToValueAtTime: () => {}
            },
            connect: () => {},
            start: () => {},
            stop: () => {}
          };
        }
        createGain() {
          return {
            gain: {
              setValueAtTime: () => {},
              linearRampToValueAtTime: () => {},
              exponentialRampToValueAtTime: () => {}
            },
            connect: () => {}
          };
        }
      },
      webkitAudioContext: class {}
    };

    Object.defineProperty(global, "navigator", {
      value: { userAgent: "node" },
      writable: true,
      configurable: true
    });

    (async () => {
      const assert = await import("assert");
      const { state, initNewGame, addInventoryItem } = await import("../src/state.js");
      const { ITEMS, getCharMaxHp, getCharMaxMp } = await import("../src/data.js");
      const { SHOP_STOCK } = await import("../src/shop/shop_stock.js");
      const { CRAFT_RECIPES } = await import("../src/craft.js");
      const { SPELLS } = await import("../src/data/spells.js");
      const { ITEM_EFFECTS } = await import("../src/systems/item_effects.js");
      const { SPELL_EFFECTS } = await import("../src/systems/spell_effects.js");
      const { setupChestState } = await import("../src/chest.js");
      const { generateMerchantStock } = await import("../src/menu/merchant.js");
      const { renderCastleMain } = await import("../src/menu/town_actions.js");
      const { getItemUseStatus } = await import("../src/equip.js");

      console.log("Starting recovery/resurrection scarcity audit...");

      const fullRecoveryIds = ["ELIXIR"];
      const resurrectionIds = ["SACRED_ASHES", "LIFE_WATER"];
      const highImpactIds = [...fullRecoveryIds, ...resurrectionIds];
      const shopKeys = SHOP_STOCK.map(stock => stock.key);
      const craftResultIds = CRAFT_RECIPES.map(recipe => recipe.resultId);

      assert.strictEqual(ITEMS.ELIXIR.price, 1500, "ELIXIR price must stay a major gold sink.");
      assert.strictEqual(ITEMS.SACRED_ASHES.price, 2500, "SACRED_ASHES price must stay above temple revive costs.");
      assert.strictEqual(ITEMS.SACRED_ASHES.campOnly, true, "SACRED_ASHES must remain camp-only.");
      assert.strictEqual(ITEMS.LIFE_WATER.price, 4000, "LIFE_WATER price must stay above SACRED_ASHES.");
      assert.strictEqual(ITEMS.LIFE_WATER.campOnly, true, "LIFE_WATER must remain camp-only.");
      assert.ok(!highImpactIds.some(id => shopKeys.includes(id)), "Normal shop must not sell ELIXIR or resurrection items.");
      assert.ok(!highImpactIds.some(id => craftResultIds.includes(id)), "Crafting must not create ELIXIR or resurrection items.");
      assert.ok(!craftResultIds.includes("TOWN_PORTAL"), "Crafting must not create easy return scrolls.");
      assert.deepStrictEqual(
        {
          GREATER_HEAL: ITEMS.GREATER_HEAL.price,
          ETHER: ITEMS.ETHER.price,
          EYE_DROPS: ITEMS.EYE_DROPS.price,
          PARALYZE_CURE: ITEMS.PARALYZE_CURE.price,
          WAKE_POWDER: ITEMS.WAKE_POWDER.price,
          PANACEA: ITEMS.PANACEA.price
        },
        {
          GREATER_HEAL: 180,
          ETHER: 700,
          EYE_DROPS: 80,
          PARALYZE_CURE: 120,
          WAKE_POWDER: 80,
          PANACEA: 300
        },
        "New consumable prices must match the C-1 economy plan."
      );

      const manaRecipe = CRAFT_RECIPES.find(recipe => recipe.resultId === "MANA_POTION");
      assert.ok(manaRecipe, "MANA_POTION recipe should exist as limited MP recovery.");
      assert.ok(manaRecipe.gold >= 250, "MANA_POTION craft gold cost must remain meaningful.");
      assert.strictEqual(manaRecipe.mats["魔石片"], 3, "MANA_POTION craft must keep a material gate.");

      const healer = {
        name: "Bishop",
        class: "Bishop",
        level: 9,
        hp: 1,
        maxHp: 32,
        mp: 0,
        maxMp: 12,
        status: "poisoned",
        equipment: {}
      };
      ITEM_EFFECTS.ELIXIR({ char: healer });
      assert.strictEqual(healer.hp, getCharMaxHp(healer), "ELIXIR should remain the only audited full HP recovery item.");
      assert.strictEqual(healer.mp, getCharMaxMp(healer), "ELIXIR should remain the only audited full MP recovery item.");
      assert.strictEqual(healer.status, "ok", "ELIXIR should keep its full-cure impact, so supply must stay scarce.");

      const deadTarget = { name: "Dead", status: "dead", hp: 0 };
      ITEM_EFFECTS.SACRED_ASHES({ char: deadTarget });
      assert.deepStrictEqual(
        { status: deadTarget.status, hp: deadTarget.hp },
        { status: "ok", hp: 1 },
        "SACRED_ASHES must revive only to HP1."
      );

      const fullReviveTarget = { name: "FullRevive", status: "dead", hp: 0, maxHp: 42, equipment: {} };
      ITEM_EFFECTS.LIFE_WATER({ char: fullReviveTarget });
      assert.deepStrictEqual(
        { status: fullReviveTarget.status, hp: fullReviveTarget.hp },
        { status: "ok", hp: 42 },
        "LIFE_WATER must revive to full HP."
      );

      const greaterHealTarget = { name: "Hurt", status: "ok", hp: 10, maxHp: 60, equipment: {} };
      ITEM_EFFECTS.GREATER_HEAL({ char: greaterHealTarget });
      assert.strictEqual(greaterHealTarget.hp, 50, "GREATER_HEAL must restore 40 HP before max cap.");

      const etherTarget = { name: "Mage", class: "Mage", status: "ok", mp: 1, maxMp: 12, equipment: {} };
      ITEM_EFFECTS.ETHER({ char: etherTarget });
      assert.strictEqual(etherTarget.mp, 9, "ETHER must restore 8 MP to spellcasters.");

      const statusCases = [
        ["EYE_DROPS", "blind"],
        ["PARALYZE_CURE", "paralyzed"],
        ["WAKE_POWDER", "sleep"],
        ["PANACEA", "poisoned"]
      ];
      for (const [itemId, status] of statusCases) {
        const target = { name: itemId, status, hp: 10, maxHp: 10, equipment: {} };
        ITEM_EFFECTS[itemId]({ char: target });
        assert.strictEqual(target.status, "ok", `${itemId} must cure ${status}.`);
      }

      initNewGame();
      state.inventory = [];
      assert.strictEqual(addInventoryItem("SACRED_ASHES"), true, "First SACRED_ASHES should fit in inventory.");
      assert.strictEqual(addInventoryItem("SACRED_ASHES"), false, "Duplicate SACRED_ASHES must be blocked.");
      assert.strictEqual(addInventoryItem("LIFE_WATER"), true, "First LIFE_WATER should fit in inventory.");
      assert.strictEqual(addInventoryItem("LIFE_WATER"), false, "Duplicate LIFE_WATER must be blocked.");

      assert.strictEqual(getItemUseStatus({ name: "Blind", status: "blind", hp: 10, maxHp: 10, equipment: {} }, "EYE_DROPS").usable, true);
      assert.strictEqual(getItemUseStatus({ name: "Ok", status: "ok", hp: 10, maxHp: 10, equipment: {} }, "EYE_DROPS").usable, false);
      assert.strictEqual(getItemUseStatus({ name: "Dead", status: "dead", hp: 0, maxHp: 10, equipment: {} }, "LIFE_WATER").usable, true);
      assert.strictEqual(getItemUseStatus({ name: "Alive", status: "ok", hp: 10, maxHp: 10, equipment: {} }, "LIFE_WATER").usable, false);

      initNewGame();
      state.floor = 3;
      state.x = 1;
      state.y = 1;
      state.seed = "";
      state.inventory = [];
      state.party = [{ name: "Scout", class: "Thief", status: "ok", equipment: {} }];
      state.currentRun = { chestsOpened: 0, equipmentFound: [] };
      setupChestState(null, null, null, () => 0);
      assert.strictEqual(state.chestState.item, "SACRED_ASHES", "B3+ chest can only grant SACRED_ASHES through the rare branch.");

      initNewGame();
      state.floor = 3;
      state.x = 1;
      state.y = 1;
      state.seed = "";
      state.inventory = ["SACRED_ASHES"];
      state.party = [{ name: "Scout", class: "Thief", status: "ok", equipment: {} }];
      state.currentRun = { chestsOpened: 0, equipmentFound: [] };
      setupChestState(null, null, null, () => 0);
      assert.notStrictEqual(state.chestState.item, "SACRED_ASHES", "Chest must not grant a second SACRED_ASHES.");

      const originalRandom = Math.random;
      Math.random = () => 0;
      try {
        const merchantStock = generateMerchantStock(4, []);
        assert.ok(!merchantStock.some(stock => stock.key === "ELIXIR"), "Dungeon merchant must not sell ELIXIR.");
      } finally {
        Math.random = originalRandom;
      }

      assert.deepStrictEqual(
        {
          level: SPELLS.KADORTO.level,
          cost: SPELLS.KADORTO.cost,
          campOnly: SPELLS.KADORTO.campOnly
        },
        { level: 9, cost: 8, campOnly: true },
        "KADORTO must remain late, expensive, and camp-only."
      );

      const targetSuccess = { name: "DeadGuy", status: "dead", vit: 10, hp: 0 };
      const resultSuccess = SPELL_EFFECTS.KADORTO({ caster: { name: "Bishop" }, target: targetSuccess, rng: () => 0.5 });
      assert.strictEqual(targetSuccess.status, "ok", "KADORTO should revive on success.");
      assert.strictEqual(targetSuccess.hp, 1, "KADORTO success should revive to HP1.");
      assert.ok(resultSuccess.log.includes("息を吹き返した"), "KADORTO success log should indicate revival.");

      const targetFailure = { name: "DeadGuy2", status: "dead", vit: 10, hp: 0 };
      const resultFailure = SPELL_EFFECTS.KADORTO({ caster: { name: "Bishop" }, target: targetFailure, rng: () => 0.95 });
      assert.strictEqual(targetFailure.status, "ash", "KADORTO failure should turn target to ash.");
      assert.strictEqual(targetFailure.hp, 0, "KADORTO failure should leave HP at 0.");
      assert.ok(resultFailure.log.includes("灰になってしまった"), "KADORTO failure log should indicate ash risk.");

      initNewGame();
      state.party = [
        { name: "Fighter", class: "Fighter", level: 3, hp: 5, maxHp: 30, mp: 0, maxMp: 0, status: "ok", equipment: {} },
        { name: "Mage", class: "Mage", level: 2, hp: 2, maxHp: 12, mp: 0, maxMp: 6, status: "ok", equipment: {} },
        { name: "Dead Priest", class: "Priest", level: 4, hp: 0, maxHp: 20, mp: 0, maxMp: 10, status: "dead", equipment: {} }
      ];
      state.gold = 100;

      const castleGrid = createDummyElement();
      renderCastleMain(castleGrid);
      const stableButton = castleGrid.children[0];
      const innButton = castleGrid.children[1];
      assert.strictEqual(stableButton.textContent.includes("無料 / MP回復"), true, "Stable must be free MP-only recovery.");
      assert.strictEqual(innButton.textContent.includes("50G / HP・MP全回復"), true, "Inn full recovery must scale by alive levels.");

      stableButton.click();
      assert.strictEqual(state.gold, 100, "Stable must not spend gold.");
      assert.strictEqual(state.party[0].hp, 5, "Stable must not recover HP.");
      assert.strictEqual(state.party[1].mp, 6, "Stable should recover MP.");

      renderCastleMain(castleGrid);
      castleGrid.children[1].click();
      assert.strictEqual(state.gold, 50, "Inn must deduct alive-level cost.");
      assert.strictEqual(state.party[0].hp, 30, "Inn should recover living member HP.");
      assert.strictEqual(state.party[1].mp, 6, "Inn should recover living member MP.");
      assert.strictEqual(state.party[2].hp, 0, "Inn must not revive dead members.");

      console.log("Recovery/resurrection scarcity audit passed.");
    })();
  })();

  console.log("\n[TEST_SAVE PASSED]");
})();
