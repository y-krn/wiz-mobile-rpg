import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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

const {
  state,
  initNewGame,
  createSoloCharacter,
  createSavePayload,
  applySavePayload
} = await import("../../../src/state.js");
const { createDefaultCurrentRun } = await import("../../../src/state/initial_state.js");
const { menuContext } = await import("../../../src/navigation.js");
const { ITEMS } = await import("../../../src/data.js");
const { MILESTONE_MERCHANT_STOCK } = await import("../../../src/data/milestone_merchant.js");
const {
  CHEST_SMASH_REWARD_LOSS_CHANCE_BY_CATEGORY,
  getChestSmashRewardCategory,
  getChestSmashRewardLossChance,
  resolveChestSmashRewardLosses
} = await import("../../../src/rules/chest_rules.js");
const {
  executeDisarm,
  CHEST_PHASES,
  CHEST_PHASE_TRANSITIONS,
  leaveChest,
  openChestDirectly,
  setupChestState,
  smashChest,
  triggerChestTrap,
  useTrapKit
} = await import("../../../src/chest.js");
const {
  __setTelemetryClientForTests,
  trackRunStart
} = await import("../../../src/telemetry.js");

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
  fromDrop = false,
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
    lootHint: null,
    fromDrop
  };
  state.map[state.y][state.x].event = "chest";
  telemetryEvents.length = 0;
  startTelemetryRun();
}

const telemetryEvents = [];
__setTelemetryClientForTests({
  capture: (name, properties) => telemetryEvents.push({ name, properties })
});

function startTelemetryRun() {
  trackRunStart(state.currentRun, state.party[0]);
}

function chestTelemetryEvents() {
  return telemetryEvents.filter(event => event.name.startsWith("chest_"));
}

await test("宝箱の合法フェーズ遷移表を固定する", () => {
  assert.deepEqual(CHEST_PHASE_TRANSITIONS[CHEST_PHASES.MENU], [
    CHEST_PHASES.MENU,
    CHEST_PHASES.RESOLVING,
    CHEST_PHASES.TERMINAL
  ]);
  assert.deepEqual(CHEST_PHASE_TRANSITIONS[CHEST_PHASES.DISARM_SELECT], [
    CHEST_PHASES.MENU,
    CHEST_PHASES.RESOLVING
  ]);
  assert.deepEqual(CHEST_PHASE_TRANSITIONS[CHEST_PHASES.OPEN_SELECT], [
    CHEST_PHASES.MENU,
    CHEST_PHASES.RESOLVING
  ]);
  assert.deepEqual(CHEST_PHASE_TRANSITIONS[CHEST_PHASES.RESOLVING], [
    CHEST_PHASES.REWARD,
    CHEST_PHASES.MENU,
    CHEST_PHASES.TERMINAL
  ]);
  assert.deepEqual(CHEST_PHASE_TRANSITIONS[CHEST_PHASES.REWARD], [CHEST_PHASES.TERMINAL]);
  assert.deepEqual(CHEST_PHASE_TRANSITIONS[CHEST_PHASES.TERMINAL], []);
});

await test("開封はmenuからrewardを経てterminalになり検査状態を残さない", () => {
  resetChest({ trap: "none", item: "HEAL_POTION" });
  state.chestState.inspected = true;
  state.chestState.identifiedTrap = "none";
  state.chestState.inspectChance = 0.85;

  assert.equal(openChestDirectly(state.party[0], () => 0.99), true);
  assert.equal(state.chestState, null);
  assert.equal(state.gameState, "explore");
  assert.equal(state.inventory.includes("HEAL_POTION"), true);
  assert.equal(openChestDirectly(state.party[0], () => 0.99), false);
});

await test("無効・反復入力はphaseと報酬を変更しない", () => {
  resetChest({ trap: "none", item: "HEAL_POTION" });
  state.chestState.phase = CHEST_PHASES.REWARD;
  state.transitioning = true;

  assert.equal(openChestDirectly(null, () => 0), false);
  assert.equal(smashChest(() => 0), false);
  assert.equal(leaveChest(), false);
  assert.equal(useTrapKit(), false);
  assert.equal(state.chestState.phase, CHEST_PHASES.REWARD);
  assert.equal(state.inventory.includes("HEAL_POTION"), false);

  state.gameState = "submenu";
  menuContext.type = "chest_menu";
  state.chestState = null;
  state.transitioning = false;
  assert.equal(openChestDirectly(null, () => 0), false);
  assert.equal(state.gameState, "submenu");
  assert.equal(menuContext.type, "chest_menu");
  assert.equal(smashChest(() => 0), false);
  assert.equal(leaveChest(), false);
  assert.equal(useTrapKit(), false);
});

await test("phase途中の宝箱はsave payloadへ漏れず、load後は探索へ戻る", () => {
  resetChest({ trap: "poison needle", item: "HEAL_POTION" });
  state.gameState = "submenu";
  state.chestState.phase = CHEST_PHASES.DISARM_SELECT;
  state.chestState.inspectChance = 0.85;

  const payload = createSavePayload();
  assert.equal(payload.gameState, "explore");
  assert.equal(payload.chestState, null);

  applySavePayload(JSON.parse(JSON.stringify(payload)));
  assert.equal(state.gameState, "explore");
  assert.equal(state.chestState, null);
});

await test("fromDrop宝箱はsave/load後も同じ未開封報酬を保持する", () => {
  resetChest();
  setupChestState("none", null, "HEAL_POTION", () => 0.99, { fromDrop: true });
  const expectedChest = {
    trap: state.chestState.trap,
    item: state.chestState.item,
    fromDrop: state.chestState.fromDrop
  };

  const payload = JSON.parse(JSON.stringify(createSavePayload()));
  assert.equal(payload.gameState, "submenu");
  assert.deepEqual(
    {
      trap: payload.chestState.trap,
      item: payload.chestState.item,
      fromDrop: payload.chestState.fromDrop,
      phase: payload.chestState.phase
    },
    { ...expectedChest, phase: CHEST_PHASES.MENU }
  );

  applySavePayload(payload);
  assert.equal(state.gameState, "submenu");
  assert.equal(menuContext.type, "chest_menu");
  assert.deepEqual(
    {
      trap: state.chestState.trap,
      item: state.chestState.item,
      fromDrop: state.chestState.fromDrop,
      phase: state.chestState.phase
    },
    { ...expectedChest, phase: CHEST_PHASES.MENU }
  );

  assert.equal(openChestDirectly(state.party[0], () => 0.99), true);
  assert.equal(state.inventory.includes(expectedChest.item), true);
});

await test("欠損・死亡・非partyのactorはtrackingとphase変更前に拒否する", () => {
  resetChest({ trap: "poison needle", item: "HEAL_POTION" });
  state.chestState.phase = CHEST_PHASES.DISARM_SELECT;
  const chest = state.chestState;
  const before = {
    phase: chest.phase,
    trap: chest.trap,
    gameState: state.gameState,
    menuType: menuContext.type,
    mapEvent: state.map[state.y][state.x].event,
    telemetry: chestTelemetryEvents().length
  };
  const dead = makeCharacter("Fighter", "Dead");
  dead.status = "dead";
  const foreign = makeCharacter("Thief", "Foreign");

  for (const actor of [null, dead, foreign]) {
    assert.equal(executeDisarm(actor), false);
    assert.equal(openChestDirectly(actor), false);
  }

  assert.deepEqual({
    phase: chest.phase,
    trap: chest.trap,
    gameState: state.gameState,
    menuType: menuContext.type,
    mapEvent: state.map[state.y][state.x].event,
    telemetry: chestTelemetryEvents().length
  }, before);
  assert.equal(state.inventory.includes("HEAL_POTION"), false);
});

await test("有効な解除者がいない場合は宝箱状態を変更しない", () => {
  resetChest({ trap: "poison needle", item: "HEAL_POTION" });
  const chest = state.chestState;
  state.gameState = "submenu";
  menuContext.type = "chest_menu";
  state.chestState.phase = CHEST_PHASES.MENU;
  state.party[0].status = "dead";
  const before = {
    phase: chest.phase,
    trap: chest.trap,
    inventory: [...state.inventory],
    gameState: state.gameState,
    menuType: menuContext.type,
    mapEvent: state.map[state.y][state.x].event,
    telemetry: chestTelemetryEvents().length
  };

  assert.equal(executeDisarm(state.party[0], () => 0), false);
  assert.equal(openChestDirectly(state.party[0], () => 0), false);
  assert.deepEqual({
    phase: chest.phase,
    trap: chest.trap,
    inventory: [...state.inventory],
    gameState: state.gameState,
    menuType: menuContext.type,
    mapEvent: state.map[state.y][state.x].event,
    telemetry: chestTelemetryEvents().length
  }, before);
});

await test("弱体毒針は正のダメージ後に毒付与率50%", () => {
  const poisoned = makeCharacter("Fighter", "Poisoned");
  resetChest({ trap: "poison needle", party: [poisoned] });
  const poisonedHpBefore = poisoned.hp;
  triggerChestTrap(poisoned, true, () => 0.49);
  assert.ok(poisoned.hp < poisonedHpBefore && poisoned.hp >= 0);
  assert.equal(poisoned.status, "poisoned");
  assert.equal(poisoned.statusEffects.poisoned.remainingTurns, 9);
  assert.match(state.logs.at(-2), /^Poisonedは毒に侵された。$/);
  assert.equal(state.logs.at(-1), "毒はそれほど深くない。やがて体から抜けるだろう。");
  assert.equal(state.logs.some(log => /10歩|残り\d+歩/.test(log)), false);

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

await test("テレポート先の抽選から現在地を除外する", () => {
  const char = makeCharacter();
  resetChest({ trap: "teleporter", party: [char] });
  const origin = { x: 2, y: 2 };
  const destination = { x: 3, y: 2 };
  state.x = origin.x;
  state.y = origin.y;
  state.map.forEach(row => row.forEach(cell => {
    cell.walls = [true, true, true, true];
  }));
  state.map[origin.y][origin.x].walls = [false, true, true, true];
  state.map[destination.y][destination.x].walls = [false, true, true, true];

  triggerChestTrap(char, false, () => 0);

  assert.deepEqual({ x: state.x, y: state.y }, destination);
  assert.ok(state.logs.includes("テレポーターが作動！冒険者は別の場所にテレポートした！"));
});

await test("通常開封の成功テレポートは別座標へ移動して探索へ戻る", () => {
  const char = makeCharacter();
  resetChest({ trap: "teleporter", party: [char] });
  const origin = { x: 2, y: 2 };
  const destination = { x: 3, y: 2 };
  state.x = origin.x;
  state.y = origin.y;
  state.chestState.x = origin.x;
  state.chestState.y = origin.y;
  state.map.forEach(row => row.forEach(cell => {
    cell.walls = [true, true, true, true];
  }));
  state.map[origin.y][origin.x].walls = [false, true, true, true];
  state.map[origin.y][origin.x].event = "chest";
  state.map[destination.y][destination.x].walls = [false, true, true, true];

  openChestDirectly(char, sequence([0, 0, 0, 0]));

  assert.deepEqual({ x: state.x, y: state.y }, destination);
  assert.equal(state.chestState, null);
  assert.equal(state.gameState, "explore");
  assert.ok(state.logs.includes("宝箱を開けた瞬間、罠 [テレポーター] が作動した！"));
  assert.ok(state.logs.includes("テレポーターが作動！冒険者は別の場所にテレポートした！"));
});

await test("現在地しか転移先候補がない場合はその場に留まる", () => {
  const char = makeCharacter();
  resetChest({ trap: "teleporter", party: [char] });
  const origin = { x: state.x, y: state.y };
  state.map.forEach(row => row.forEach(cell => {
    cell.walls = [true, true, true, true];
  }));
  state.map[origin.y][origin.x].walls = [false, true, true, true];

  triggerChestTrap(char, false, () => 0);

  assert.deepEqual({ x: state.x, y: state.y }, origin);
  assert.ok(state.logs.includes("テレポーターは行き先を見つけられず、その場に留まった。"));
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

  for (const item of [
    "LEGENDARY_SWORD",
    "LEGENDARY_SHIELD",
    { baseId: "LEGENDARY_SWORD", type: "weapon" },
    { baseId: "LEGENDARY_SHIELD", type: "shield" }
  ]) {
    assert.equal(getChestSmashRewardLossChance(item), 0);
    assert.deepEqual(resolveChestSmashRewardLosses([{ item }], () => 0), []);
  }
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
  openChestDirectly(state.party[0], () => 0);
  assert.equal(state.inventory.includes("HEAL_POTION"), true);
  assert.equal(state.inventory.includes("AMULET_HP"), true);

  const originalSetTimeout = global.setTimeout;
  global.setTimeout = callback => { callback(); return 0; };
  try {
    const disarmer = makeCharacter("Ninja");
    resetChest({ trap: "poison needle", item: "HEAL_POTION", accessoryItem: "AMULET_HP", party: [disarmer] });
    state.chestState.phase = CHEST_PHASES.DISARM_SELECT;
    executeDisarm(disarmer, () => 0);
    assert.equal(state.inventory.includes("HEAL_POTION"), true);
    assert.equal(state.inventory.includes("AMULET_HP"), true);

    resetChest({ trap: "poison needle", item: "HEAL_POTION", accessoryItem: "AMULET_HP" });
    state.inventory = ["TRAP_KIT"];
    assert.equal(useTrapKit(), true);
    openChestDirectly(state.party[0], () => 0);
    assert.equal(state.inventory.includes("HEAL_POTION"), true);
    assert.equal(state.inventory.includes("AMULET_HP"), true);
  } finally {
    global.setTimeout = originalSetTimeout;
  }
});

await test("宝箱の実アクションを選択単位で記録し、自動開封を二重計上しない", () => {
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = callback => { callback(); return 0; };
  try {
    resetChest({ trap: "none", item: "DAGGER" });
    openChestDirectly(state.party[0], () => 0.99);
    assert.deepEqual(chestTelemetryEvents().map(event => event.properties.action), ["open"]);

    const disarmer = makeCharacter("Ninja");
    resetChest({ trap: "poison needle", item: "DAGGER", party: [disarmer] });
    state.chestState.phase = CHEST_PHASES.DISARM_SELECT;
    executeDisarm(disarmer, () => 0);
    assert.deepEqual(chestTelemetryEvents().map(event => event.properties.action), ["disarm"]);

    resetChest({ trap: "poison needle", item: "DAGGER" });
    state.inventory = ["TRAP_KIT"];
    assert.equal(useTrapKit(), true);
    assert.deepEqual(chestTelemetryEvents().map(event => event.properties.action), ["trap_kit"]);

    resetChest({ trap: "none", item: "DAGGER" });
    smashChest(() => 0.99);
    assert.deepEqual(chestTelemetryEvents().filter(event => event.name === "chest_action").map(event => event.properties.action), ["smash"]);

    resetChest({ trap: "none", item: "DAGGER" });
    assert.equal(leaveChest(), true);
    assert.deepEqual(chestTelemetryEvents().map(event => event.properties.action), ["leave"]);
  } finally {
    global.setTimeout = originalSetTimeout;
  }
});

await test("叩き壊し結果は報酬役割・カテゴリと実付与数を記録する", () => {
  resetChest({
    trap: "none",
    item: "DAGGER",
    specialItem: "TOWN_PORTAL",
    accessoryItem: "AMULET_HP"
  });
  smashChest(sequence([0.249, 0.249, 0.99, 0.99, 0.99]));

  const result = chestTelemetryEvents().find(event => event.name === "chest_smash_result");
  assert.ok(result);
  assert.equal(result.properties.chestSource, "ordinary");
  assert.equal(result.properties.trapFired, false);
  assert.equal(result.properties.partyDied, false);
  assert.equal(result.properties.rewardCount, 3);
  assert.equal(result.properties.lostRewardCount, 2);
  assert.deepEqual(result.properties.lostRewardRoles, ["main", "accessory"]);
  assert.deepEqual(result.properties.lostRewardCategories, ["weapon", "accessory"]);
  assert.equal(result.properties.remainingRewardCount, 1);
  assert.equal(result.properties.awardedRewardCount, 1);
  assert.equal(result.properties.unawardedRewardCount, 0);
});

await test("fromDrop の実生成・dispatch 経路は手動叩き壊しを source 分離して記録する", () => {
  const combatStart = readFileSync(new URL("../../../src/combat_ui/combat_start.js", import.meta.url), "utf8");
  const battleLogPlayer = readFileSync(new URL("../../../src/combat_ui/battle_log_player.js", import.meta.url), "utf8");
  assert.match(combatStart, /setupChestState\(null, null, null, null, \{ fromDrop: true \}\)/);
  assert.match(battleLogPlayer, /setupChestState\(null, null, null, null, \{ fromDrop: true \}\)/);

  resetChest({ trap: "none", item: "DAGGER", fromDrop: true });
  smashChest(() => 0.99);
  const action = chestTelemetryEvents().find(event => event.name === "chest_action");
  const result = chestTelemetryEvents().find(event => event.name === "chest_smash_result");
  assert.equal(action.properties.chestSource, "fromDrop");
  assert.equal(action.properties.fromDrop, true);
  assert.equal(result.properties.chestSource, "fromDrop");
  assert.equal(result.properties.fromDrop, true);

  resetChest({ trap: "none" });
  setupChestState("none", null, "DAGGER", () => 0.99, { fromDrop: true });
  assert.equal(state.chestState.fromDrop, true);
  smashChest(() => 0.99);
  assert.equal(chestTelemetryEvents().find(event => event.name === "chest_smash_result").properties.chestSource, "fromDrop");
});

await test("致死的な通常解除失敗は既存どおり報酬を付与してからゲームオーバーへ進む", () => {
  const doomed = makeCharacter("Ninja");
  doomed.hp = 1;
  resetChest({ trap: "poison needle", item: "HEAL_POTION", party: [doomed] });
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = callback => { callback(); return 0; };
  try {
    // Ninja's 70% disarm boundary fails; the full trap then deals lethal damage.
    state.chestState.phase = CHEST_PHASES.DISARM_SELECT;
    executeDisarm(doomed, sequence([0.70, 0, 0, 0, 0]));
  } finally {
    global.setTimeout = originalSetTimeout;
  }
  assert.equal(doomed.status, "dead");
  assert.equal(state.inventory.includes("HEAL_POTION"), true);
  assert.equal(state.currentRun.itemsFound.includes("HEAL_POTION"), true);
  assert.ok(Object.values(state.currentRun.materials).some(quantity => quantity > 0));
});

await test("叩き壊すは罠で全滅したら報酬判定・付与を行わない", () => {
  const doomed = makeCharacter();
  doomed.hp = 1;
  resetChest({ trap: "poison needle", item: "DAGGER", accessoryItem: "AMULET_HP", party: [doomed] });
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = () => 0;
  try {
    assert.equal(smashChest(sequence([0, 0, 0, 0, 0])), true);
    assert.equal(smashChest(() => 0), false);
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
    state.chestState.phase = CHEST_PHASES.DISARM_SELECT;
    executeDisarm(successNinja, () => 0.699);
    assert.equal(state.currentRun.trapsDisarmed, 1);
    assert.equal(state.currentRun.trapsTriggered, 0);

    const failedNinja = makeCharacter("Ninja", "Failed Ninja");
    resetChest({ trap: "poison needle", party: [failedNinja] });
    state.chestState.phase = CHEST_PHASES.DISARM_SELECT;
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
