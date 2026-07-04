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
