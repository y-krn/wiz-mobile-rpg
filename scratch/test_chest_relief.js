import assert from "node:assert/strict";

global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

const createDummyElement = () => ({
  style: {},
  dataset: {},
  children: [],
  className: "",
  textContent: "",
  innerHTML: "",
  disabled: false,
  appendChild(child) { this.children.push(child); return child; },
  replaceChildren(...children) { this.children = children; },
  addEventListener: () => {},
  removeEventListener: () => {},
  setAttribute: () => {},
  removeAttribute: () => {},
  getAttribute: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  closest: () => null,
  getContext: () => null,
  classList: {
    add: () => {},
    remove: () => {},
    toggle: () => {},
    contains: () => false
  }
});

global.document = {
  body: createDummyElement(),
  documentElement: createDummyElement(),
  getElementById: () => createDummyElement(),
  querySelector: () => createDummyElement(),
  querySelectorAll: () => [],
  createElement: () => createDummyElement(),
  addEventListener: () => {}
};

global.window = {
  innerWidth: 390,
  innerHeight: 844,
  addEventListener: () => {},
  removeEventListener: () => {},
  scrollTo: () => {},
  matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
};

Object.defineProperty(global, "navigator", {
  value: { userAgent: "node" },
  configurable: true
});

const { state, initNewGame, createSoloCharacter } = await import("../src/state.js");
const { createDefaultCurrentRun } = await import("../src/state/initial_state.js");
const { ITEMS } = await import("../src/data.js");
const { MILESTONE_MERCHANT_STOCK } = await import("../src/data/milestone_merchant.js");
const {
  executeDisarm,
  smashChest,
  triggerChestTrap,
  useTrapKit
} = await import("../src/chest.js");

const failures = [];

async function test(name, fn) {
  try {
    await fn();
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`[FAIL] ${name}: ${error.message}`);
  }
}

function sequence(values, fallback = 0.99) {
  let index = 0;
  return () => index < values.length ? values[index++] : fallback;
}

function makeCharacter(className = "Fighter", name = className) {
  const char = createSoloCharacter(className);
  char.name = name;
  char.hp = 30;
  char.maxHp = 30;
  char.status = "ok";
  char.equipment ||= {};
  return char;
}

function resetChest({ trap = "none", item = null, accessoryItem = null, party = null } = {}) {
  initNewGame();
  state.floor = 2;
  state.party = party || [makeCharacter()];
  state.inventory = [];
  state.currentRun = createDefaultCurrentRun();
  state.floorChestsOpened = [0, 0, 0, 0, 0];
  state.chestState = {
    x: state.x,
    y: state.y,
    trap,
    item,
    accessoryItem,
    inspected: false,
    identifiedTrap: "",
    lootHint: null
  };
  state.map[state.y][state.x].event = "chest";
}

await test("弱体毒針は6ダメージ、毒付与率50%", () => {
  const poisoned = makeCharacter("Fighter", "Poisoned");
  resetChest({ trap: "poison needle", party: [poisoned] });
  triggerChestTrap(poisoned, true, () => 0.49);
  assert.equal(poisoned.hp, 24);
  assert.equal(poisoned.status, "poisoned");

  const safe = makeCharacter("Fighter", "Safe");
  resetChest({ trap: "poison needle", party: [safe] });
  triggerChestTrap(safe, true, () => 0.50);
  assert.equal(safe.hp, 24);
  assert.equal(safe.status, "ok");
});

await test("弱体ガスは全体2〜6ダメージ", () => {
  const low = makeCharacter("Fighter", "Low");
  const high = makeCharacter("Mage", "High");
  resetChest({ trap: "gas bomb", party: [low, high] });
  triggerChestTrap(low, true, sequence([0, 0.999]));
  assert.equal(low.hp, 28);
  assert.equal(high.hp, 24);
});

await test("弱体閃光は盲目率30%", () => {
  const blinded = makeCharacter("Fighter", "Blinded");
  const safe = makeCharacter("Mage", "Safe");
  resetChest({ trap: "flash bomb", party: [blinded, safe] });
  triggerChestTrap(blinded, true, sequence([0.299, 0.30]));
  assert.equal(blinded.status, "blind");
  assert.equal(safe.status, "ok");
});

await test("弱体テレポーターは50%で不発", () => {
  const char = makeCharacter();
  resetChest({ trap: "teleporter", party: [char] });
  const origin = { x: state.x, y: state.y };
  triggerChestTrap(char, true, () => 0.49);
  assert.deepEqual({ x: state.x, y: state.y }, origin);

  resetChest({ trap: "teleporter", party: [char] });
  const secondOrigin = { x: state.x, y: state.y };
  triggerChestTrap(char, true, sequence([0.50, 0.999]));
  assert.notDeepEqual({ x: state.x, y: state.y }, secondOrigin);
});

await test("叩き壊すとusableだけ30%で破損し、素材と装身具は残る", () => {
  resetChest({ trap: "none", item: "HEAL_POTION", accessoryItem: "AMULET_HP" });
  smashChest(sequence([0.299, 0, 0, 0.99]));
  assert.equal(state.inventory.includes("HEAL_POTION"), false);
  assert.equal(state.inventory.includes("AMULET_HP"), true);
  assert.ok(Object.values(state.currentRun.materials).reduce((sum, qty) => sum + qty, 0) > 0);

  resetChest({ trap: "none", item: "HEAL_POTION" });
  smashChest(sequence([0.30, 0, 0, 0.99]));
  assert.equal(state.inventory.includes("HEAL_POTION"), true);

  resetChest({ trap: "none", item: "DAGGER" });
  smashChest(sequence([0, 0, 0.99]));
  assert.equal(state.inventory.includes("DAGGER"), true);
});

await test("キットは1個消費して確定解除し、解除数を増やさない", () => {
  resetChest({ trap: "teleporter" });
  state.inventory = ["TRAP_KIT", "HEAL_POTION"];
  state.currentRun.trapsDisarmed = 4;
  assert.equal(useTrapKit(), true);
  assert.deepEqual(state.inventory, ["HEAL_POTION"]);
  assert.equal(state.chestState.trap, "none");
  assert.equal(state.currentRun.trapsDisarmed, 4);
});

await test("忍者の解除率は0.70", () => {
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = () => 0;
  try {
    const successNinja = makeCharacter("Ninja", "Success Ninja");
    resetChest({ trap: "poison needle", party: [successNinja] });
    executeDisarm(successNinja, () => 0.699);
    assert.equal(state.currentRun.trapsDisarmed, 1);
    assert.equal(state.currentRun.trapsTriggered, 0);

    const failedNinja = makeCharacter("Ninja", "Failed Ninja");
    resetChest({ trap: "poison needle", party: [failedNinja] });
    executeDisarm(failedNinja, () => 0.70);
    assert.equal(state.currentRun.trapsDisarmed, 0);
    assert.equal(state.currentRun.trapsTriggered, 1);
  } finally {
    global.setTimeout = originalSetTimeout;
  }
});

await test("罠外しキットの定義と商人在庫", () => {
  assert.deepEqual(ITEMS.TRAP_KIT, {
    id: "TRAP_KIT",
    name: "罠外しキット",
    type: "usable",
    desc: "宝箱の罠を1つ確実に外す。[全員用]"
  });
  assert.ok(MILESTONE_MERCHANT_STOCK.some(entry =>
    entry.id === "trap_kit" && entry.itemId === "TRAP_KIT" && entry.cost["骨片"] === 2
  ));
});

if (failures.length > 0) {
  console.error(`\n${failures.length} chest relief test(s) failed.`);
  process.exit(1);
}

console.log("\nAll chest relief tests passed.");
