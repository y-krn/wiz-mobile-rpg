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
  CHEST_SMASH_REWARD_LOSS_CHANCE_BY_CATEGORY,
  getChestSmashRewardCategory,
  getChestSmashRewardLossChance,
  resolveChestSmashRewardLosses
} = await import("../src/rules/chest_rules.js");
const {
  executeDisarm,
  openChestDirectly,
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

function resetChest({
  trap = "none",
  item = null,
  specialItem = null,
  accessoryItem = null,
  party = null
} = {}) {
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
    specialItem,
    accessoryItem,
    inspected: false,
    identifiedTrap: "",
    lootHint: null
  };
  state.map[state.y][state.x].event = "chest";
}

await test("弱体毒針は正のダメージ後に毒付与率50%", () => {
  const poisoned = makeCharacter("Fighter", "Poisoned");
  resetChest({ trap: "poison needle", party: [poisoned] });
  const poisonedHpBefore = poisoned.hp;
  triggerChestTrap(poisoned, true, () => 0.49);
  assert.ok(poisoned.hp < poisonedHpBefore && poisoned.hp >= 0);
  assert.equal(poisoned.status, "poisoned");

  const safe = makeCharacter("Fighter", "Safe");
  resetChest({ trap: "poison needle", party: [safe] });
  const safeHpBefore = safe.hp;
  triggerChestTrap(safe, true, () => 0.50);
  assert.ok(safe.hp < safeHpBefore && safe.hp >= 0);
  assert.equal(safe.status, "ok");
});

await test("弱体ガスは全体へ正のダメージを適用する", () => {
  const low = makeCharacter("Fighter", "Low");
  const high = makeCharacter("Mage", "High");
  resetChest({ trap: "gas bomb", party: [low, high] });
  const lowHpBefore = low.hp;
  const highHpBefore = high.hp;
  triggerChestTrap(low, true, sequence([0, 0.999]));
  assert.ok(low.hp < lowHpBefore && low.hp >= 0);
  assert.ok(high.hp < highHpBefore && high.hp >= 0);
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

await test("テレポート罠付き宝箱を叩き壊しても探索へ復帰する", () => {
  const char = makeCharacter();
  resetChest({ trap: "teleporter", party: [char] });
  const chestCoord = { x: state.x, y: state.y };

  smashChest(sequence([0.50, 0.10, 0, 0, 0, 0.99]));

  assert.equal(state.gameState, "explore");
  assert.equal(state.transitioning, false);
  assert.equal(state.chestState, null);
  assert.equal(state.map[chestCoord.y][chestCoord.x].event, null);
});

await test("弱体テレポート不発の宝箱破壊も探索へ復帰する", () => {
  const char = makeCharacter();
  resetChest({ trap: "teleporter", party: [char] });
  const chestCoord = { x: state.x, y: state.y };

  smashChest(sequence([0.49, 0, 0, 0.99]));

  assert.equal(state.gameState, "explore");
  assert.equal(state.transitioning, false);
  assert.equal(state.chestState, null);
  assert.equal(state.map[chestCoord.y][chestCoord.x].event, null);
});

await test("テレポート先が空でも宝箱破壊の操作ロックを残さない", () => {
  const char = makeCharacter();
  resetChest({ trap: "teleporter", party: [char] });
  const chestCoord = { x: state.x, y: state.y };
  state.map.forEach(row => row.forEach(cell => {
    cell.walls = [true, true, true, true];
  }));

  smashChest(sequence([0.50, 0, 0, 0.99]));

  assert.equal(state.gameState, "explore");
  assert.equal(state.transitioning, false);
  assert.equal(state.chestState, null);
  assert.deepEqual({ x: state.x, y: state.y }, chestCoord);
  assert.equal(state.map[chestCoord.y][chestCoord.x].event, null);
});

await test("叩き壊すの各報酬カテゴリは指定率と境界を使う", () => {
  const cases = [
    ["DAGGER", "main", "weapon"],
    ["LEATHER_ARMOR", "main", "armor"],
    ["SMALL_SHIELD", "main", "shield"],
    ["AMULET_HP", "accessory", "accessory"],
    ["HEAL_POTION", "main", "usable"]
  ];
  for (const [item, role, category] of cases) {
    const chance = CHEST_SMASH_REWARD_LOSS_CHANCE_BY_CATEGORY[category];
    assert.equal(getChestSmashRewardCategory(item, role), category);
    assert.equal(getChestSmashRewardLossChance(item, role), chance);
    assert.equal(resolveChestSmashRewardLosses([{ item, role }], () => chance - 0.001).length, 1);
    assert.equal(resolveChestSmashRewardLosses([{ item, role }], () => chance).length, 0);
  }
  assert.equal(getChestSmashRewardCategory("TOWN_PORTAL", "special"), "special");
  assert.equal(getChestSmashRewardLossChance("TOWN_PORTAL", "special"), 0);
  assert.equal(resolveChestSmashRewardLosses([
    { item: "TOWN_PORTAL", role: "special" },
    { item: "EXCALIBUR_FRAGMENT", role: "main" }
  ], () => 0).length, 0);
});

await test("叩き壊すの複数報酬はmain・special・accessoryを独立判定する", () => {
  const rewards = [
    { role: "main", item: "DAGGER" },
    { role: "special", item: "TOWN_PORTAL" },
    { role: "accessory", item: "AMULET_HP" }
  ];
  assert.deepEqual(
    resolveChestSmashRewardLosses(rewards, sequence([0.249, 0.249])),
    [{ role: "main", category: "weapon" }, { role: "accessory", category: "accessory" }]
  );
  assert.deepEqual(
    resolveChestSmashRewardLosses(rewards, sequence([0.249, 0.251])),
    [{ role: "main", category: "weapon" }]
  );
  assert.deepEqual(
    resolveChestSmashRewardLosses(rewards, sequence([0.249, 0.251])),
    resolveChestSmashRewardLosses(rewards, sequence([0.249, 0.251]))
  );
});

await test("叩き壊すはusableを50%で破損し、境界では残る", () => {
  resetChest({ trap: "none", item: "HEAL_POTION", accessoryItem: "AMULET_HP" });
  smashChest(sequence([0.499, 0.99, 0.99, 0.99]));
  assert.equal(state.inventory.includes("HEAL_POTION"), false);
  assert.equal(state.inventory.includes("AMULET_HP"), true);
  assert.ok(Object.values(state.currentRun.materials).reduce((sum, qty) => sum + qty, 0) > 0);

  resetChest({ trap: "none", item: "HEAL_POTION" });
  smashChest(sequence([0.50, 0.99, 0.99, 0.99]));
  assert.equal(state.inventory.includes("HEAL_POTION"), true);

  resetChest({ trap: "none", item: "DAGGER" });
  smashChest(sequence([0.25, 0.99, 0.99]));
  assert.equal(state.inventory.includes("DAGGER"), true);
  assert.ok(state.logs.includes("叩き壊した衝撃に耐え、報酬は無事だった。"));
});

await test("叩き壊すの装備品1件損失ログは名前を含めない", () => {
  resetChest({ trap: "none", item: "DAGGER" });
  smashChest(sequence([0, 0.99, 0.99]));
  assert.equal(state.inventory.includes("DAGGER"), false);
  assert.ok(state.logs.includes("叩き壊した衝撃で、装備品が壊れていた。"));
  assert.equal(state.logs.some(log => log.includes("ダガー")), false);
});

await test("叩き壊すは報酬破壊を記録へ残さず、特殊報酬を保護する", () => {
  resetChest({
    trap: "none",
    item: "DAGGER",
    specialItem: "TOWN_PORTAL",
    accessoryItem: "AMULET_HP"
  });
  smashChest(sequence([0.249, 0.249, 0.99, 0.99, 0.99]));
  assert.equal(state.inventory.includes("DAGGER"), false);
  assert.equal(state.inventory.includes("AMULET_HP"), false);
  assert.equal(state.inventory.includes("TOWN_PORTAL"), true);
  assert.equal(state.currentRun.itemsFound.includes("DAGGER"), false);
  assert.equal(state.currentRun.equipmentFound.includes("AMULET_HP"), false);
  assert.equal(state.currentRun.itemsFound.includes("TOWN_PORTAL"), true);
  assert.ok(state.logs.includes("叩き壊した衝撃で、複数の報酬が失われた。"));
});

await test("通常開封・成功解除・キット解除は報酬を失わない", () => {
  resetChest({ trap: "none", item: "HEAL_POTION", accessoryItem: "AMULET_HP" });
  openChestDirectly(null, () => 0);
  assert.equal(state.inventory.includes("HEAL_POTION"), true);
  assert.equal(state.inventory.includes("AMULET_HP"), true);

  const originalSetTimeout = global.setTimeout;
  global.setTimeout = callback => { callback(); return 0; };
  try {
    const disarmer = makeCharacter("Ninja");
    resetChest({ trap: "poison needle", item: "HEAL_POTION", accessoryItem: "AMULET_HP", party: [disarmer] });
    executeDisarm(disarmer, () => 0);
    assert.equal(state.inventory.includes("HEAL_POTION"), true);
    assert.equal(state.inventory.includes("AMULET_HP"), true);

    resetChest({ trap: "poison needle", item: "HEAL_POTION", accessoryItem: "AMULET_HP" });
    state.inventory = ["TRAP_KIT"];
    assert.equal(useTrapKit(), true);
    openChestDirectly(null, () => 0);
    assert.equal(state.inventory.includes("HEAL_POTION"), true);
    assert.equal(state.inventory.includes("AMULET_HP"), true);
  } finally {
    global.setTimeout = originalSetTimeout;
  }
});

await test("叩き壊すは罠で全滅したら報酬判定・付与を行わない", () => {
  const doomed = makeCharacter();
  doomed.hp = 1;
  resetChest({ trap: "poison needle", item: "DAGGER", accessoryItem: "AMULET_HP", party: [doomed] });
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = () => 0;
  try {
    smashChest(sequence([0, 0, 0, 0, 0]));
  } finally {
    global.setTimeout = originalSetTimeout;
  }
  assert.equal(doomed.status, "dead");
  assert.equal(state.inventory.includes("DAGGER"), false);
  assert.equal(state.inventory.includes("AMULET_HP"), false);
  assert.equal(state.currentRun.equipmentFound.length, 0);
  assert.equal(state.map[state.y][state.x].event, null);
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
