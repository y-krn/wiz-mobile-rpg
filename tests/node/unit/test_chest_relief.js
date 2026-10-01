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
  createStartingKitCharacter,
  createSavePayload,
  applySavePayload
} = await import("../../../src/state.js");
const { createDefaultCurrentRun } = await import("../../../src/state/initial_state.js");
const { menuContext } = await import("../../../src/navigation.js");
const { ITEMS } = await import("../../../src/data.js");
const { MILESTONE_MERCHANT_STOCK } = await import("../../../src/data/milestone_merchant.js");
const { getChestRewardCategory } = await import("../../../src/rules/chest_rules.js");
const {
  CHEST_PHASES,
  CHEST_PHASE_TRANSITIONS,
  leaveChest,
  openChest,
  openChestMenu,
  setupChestState,
  setupPostCombatChest,
  triggerChestTrap
} = await import("../../../src/chest.js");
const { resolvePendingRewardBundle } = await import("../../../src/pending_rewards.js");
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

function makeCharacter(kitId = "vanguard", name = kitId) {
  const startingKitByLegacyClass = {
    Fighter: "vanguard",
    Thief: "scout",
    Ranger: "scout",
    Priest: "devotion",
    Bishop: "devotion",
    Mage: "arcana",
    Samurai: "vanguard",
    Ninja: "scout"
  };
  kitId = startingKitByLegacyClass[kitId] || kitId;
  const char = createStartingKitCharacter(kitId);
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
    trapSign: "none",
    trapSignAccuracy: 0.7,
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

function resolveAllPendingRewards() {
  const bundle = state.currentRun?.pendingRewardBundle;
  if (!bundle) return null;
  bundle.entries.forEach(entry => { entry.decision = "take"; });
  bundle.discardIndexes = [];
  return resolvePendingRewardBundle(state);
}

function openAndResolve(rng, options) {
  const result = openChest(rng, options);
  if (result) resolveAllPendingRewards();
  return result;
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

await test("開封はmenuからrewardを経てterminalになる", () => {
  resetChest({ trap: "none", item: "HEAL_POTION" });

  assert.equal(openAndResolve(() => 0.99), true);
  assert.equal(state.chestState, null);
  resolveAllPendingRewards();
  assert.equal(state.gameState, "explore");
  assert.equal(state.inventory.includes("HEAL_POTION"), true);
  assert.equal(openAndResolve(() => 0.99), false);
});

await test("無効・反復入力はphaseと報酬を変更しない", () => {
  resetChest({ trap: "none", item: "HEAL_POTION" });
  state.chestState.phase = CHEST_PHASES.REWARD;
  state.transitioning = true;

  assert.equal(openChest(() => 0), false);
  assert.equal(openChest(() => 0, { useKit: true }), false);
  assert.equal(leaveChest(), false);
  assert.equal(state.chestState.phase, CHEST_PHASES.REWARD);
  assert.equal(state.inventory.includes("HEAL_POTION"), false);

  state.gameState = "submenu";
  menuContext.type = "chest_menu";
  state.chestState = null;
  state.transitioning = false;
  assert.equal(openChest(() => 0), false);
  assert.equal(state.gameState, "submenu");
  assert.equal(menuContext.type, "chest_menu");
  assert.equal(openChest(() => 0, { useKit: true }), false);
  assert.equal(leaveChest(), false);
});

await test("phase途中の宝箱はsave payloadへ漏れず、load後は探索へ戻る", () => {
  resetChest({ trap: "poison needle", item: "HEAL_POTION" });
  state.gameState = "submenu";
  state.chestState.phase = CHEST_PHASES.DISARM_SELECT;

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

  assert.equal(openAndResolve(() => 0.99), true);
  assert.equal(state.inventory.includes(expectedChest.item), true);
});

await test("旧セーブのfromDrop宝箱は再表示時に罠の気配を読み、調査状態を捨てる", () => {
  resetChest({ trap: "poison needle", item: "HEAL_POTION", fromDrop: true });
  const legacyChest = { ...state.chestState, inspected: true, identifiedTrap: "gas bomb", inspectChance: 0.3 };
  delete legacyChest.trapSign;
  delete legacyChest.trapSignAccuracy;
  const payload = JSON.parse(JSON.stringify(createSavePayload()));
  payload.chestState = { ...legacyChest, phase: CHEST_PHASES.MENU };

  applySavePayload(payload);
  openChestMenu();

  assert.ok(["none", "trap", "danger"].includes(state.chestState.trapSign));
  assert.equal(state.chestState.trapSignAccuracy, 0.7);
  for (const field of ["inspected", "identifiedTrap", "inspectChance"]) {
    assert.equal(field in state.chestState, false, field);
  }
});

await test("有効な開封者がいない場合は宝箱状態を変更しない", () => {
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

  assert.equal(openChest(() => 0), false);
  assert.equal(openChest(() => 0, { useKit: true }), false);
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

await test("毒針は正のダメージ後に必ず毒を付与する", () => {
  const poisoned = makeCharacter("Fighter", "Poisoned");
  resetChest({ trap: "poison needle", party: [poisoned] });
  const poisonedHpBefore = poisoned.hp;
  triggerChestTrap(poisoned, () => 0.99);
  assert.ok(poisoned.hp < poisonedHpBefore && poisoned.hp >= 0);
  assert.equal(poisoned.status, "poisoned");
  assert.match(state.logs.at(-2), /^Poisonedは毒に侵された。$/);
  assert.equal(state.logs.at(-1), "毒はそれほど深くない。やがて体から抜けるだろう。");
  assert.equal(state.logs.some(log => /10歩|残り\d+歩/.test(log)), false);
});

await test("閃光は盲目率60%", () => {
  const blinded = makeCharacter("Fighter", "Blinded");
  resetChest({ trap: "flash bomb", party: [blinded] });
  triggerChestTrap(blinded, () => 0.599);
  assert.equal(blinded.status, "blind");

  const safe = makeCharacter("Fighter", "Safe");
  resetChest({ trap: "flash bomb", party: [safe] });
  triggerChestTrap(safe, () => 0.60);
  assert.equal(safe.status, "ok");
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

  triggerChestTrap(char, () => 0);

  assert.deepEqual({ x: state.x, y: state.y }, destination);
  assert.ok(state.logs.includes("テレポーターが作動！冒険者は別の場所にテレポートした！"));
});

await test("転移先候補がある場合はRNG上限値でも現在地に留まらない", () => {
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

  triggerChestTrap(char, () => 1);

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

  // The automatic disarm fails, then the teleporter picks the only destination.
  openChest(sequence([0.99, 0, 0, 0, 0]));

  assert.deepEqual({ x: state.x, y: state.y }, destination);
  assert.equal(state.chestState, null);
  assert.equal(state.gameState, "explore");
  assert.ok(state.logs.includes("解除失敗！宝箱を開けた瞬間、罠 [テレポーター] が作動した！"));
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

  triggerChestTrap(char, () => 0);

  assert.deepEqual({ x: state.x, y: state.y }, origin);
  assert.ok(state.logs.includes("テレポーターは行き先を見つけられず、その場に留まった。"));
});

await test("24x24の浅層でもテレポート先はその階の範囲内の通行可能セル", () => {
  const char = makeCharacter();
  resetChest({ trap: "teleporter", party: [char] });
  // B1-B10 floors are 24x24, smaller than MAP_WIDTH/MAP_HEIGHT (#1819).
  state.maps[state.floor - 1] = state.map.slice(0, 24).map(row => row.slice(0, 24));
  assert.equal(state.map.length, 24);
  const origin = { x: 2, y: 2 };
  state.x = origin.x;
  state.y = origin.y;
  state.map.forEach(row => row.forEach(cell => {
    cell.walls = [false, false, false, false];
    cell.event = null;
  }));

  // An upper-bound roll selects the last candidate, which is the far corner.
  assert.doesNotThrow(() => triggerChestTrap(char, () => 0.999));

  assert.notDeepEqual({ x: state.x, y: state.y }, origin);
  assert.ok(state.y >= 1 && state.y < state.map.length - 1);
  assert.ok(state.x >= 1 && state.x < state.map[state.y].length - 1);
  assert.ok(state.map[state.y][state.x].walls.some(closed => !closed));
  assert.deepEqual({ x: state.x, y: state.y }, { x: 22, y: 22 });
});

await test("開封・自動解除成功・解除失敗・キット開封はどれも報酬を失わない", () => {
  resetChest({ trap: "none", item: "HEAL_POTION", accessoryItem: "AMULET_HP" });
  openAndResolve(() => 0);
  assert.equal(state.inventory.includes("HEAL_POTION"), true);
  assert.equal(state.inventory.includes("AMULET_HP"), true);

  resetChest({ trap: "poison needle", item: "HEAL_POTION", accessoryItem: "AMULET_HP" });
  openAndResolve(() => 0);
  assert.equal(state.inventory.includes("HEAL_POTION"), true);
  assert.equal(state.inventory.includes("AMULET_HP"), true);

  resetChest({ trap: "poison needle", item: "HEAL_POTION", accessoryItem: "AMULET_HP" });
  openAndResolve(sequence([0.99, 0.99]));
  assert.ok(state.party[0].hp < state.party[0].maxHp, "the failed disarm fires the trap");
  assert.equal(state.inventory.includes("HEAL_POTION"), true);
  assert.equal(state.inventory.includes("AMULET_HP"), true);

  resetChest({ trap: "poison needle", item: "HEAL_POTION", accessoryItem: "AMULET_HP" });
  state.inventory = ["TRAP_KIT"];
  openAndResolve(() => 0.99, { useKit: true });
  assert.equal(state.inventory.includes("TRAP_KIT"), false);
  assert.equal(state.inventory.includes("HEAL_POTION"), true);
  assert.equal(state.inventory.includes("AMULET_HP"), true);
});

await test("宝箱の選択を1回だけ記録し、表示中の罠の気配と自動解除結果を残す", () => {
  resetChest({ trap: "none", item: "DAGGER" });
  openAndResolve(() => 0.99);
  assert.deepEqual(chestTelemetryEvents().map(event => event.properties.action), ["open"]);
  assert.equal(chestTelemetryEvents()[0].properties.trapSign, "none");

  resetChest({ trap: "poison needle", item: "DAGGER" });
  state.chestState.trapSign = "danger";
  openChest(() => 0);
  const disarmAction = chestTelemetryEvents().filter(event => event.name === "chest_action");
  assert.deepEqual(disarmAction.map(event => event.properties.action), ["open"]);
  assert.equal(disarmAction[0].properties.trapSign, "danger");
  const disarmed = telemetryEvents.find(event => event.name === "trap_resolution");
  assert.equal(disarmed.properties.outcome, "disarmed");
  assert.equal(disarmed.properties.action, "open");

  resetChest({ trap: "poison needle", item: "DAGGER" });
  state.chestState.trapSign = "trap";
  openChest(() => 0.99);
  const triggered = telemetryEvents.find(event => event.name === "trap_resolution");
  assert.equal(triggered.properties.outcome, "triggered");
  assert.equal(triggered.properties.action, "open");

  resetChest({ trap: "poison needle", item: "DAGGER" });
  state.inventory = ["TRAP_KIT"];
  assert.equal(openChest(() => 0.99, { useKit: true }), true);
  assert.deepEqual(chestTelemetryEvents().map(event => event.properties.action), ["trap_kit"]);

  resetChest({ trap: "none", item: "DAGGER" });
  assert.equal(leaveChest(), true);
  assert.deepEqual(chestTelemetryEvents().map(event => event.properties.action), ["leave"]);
  assert.equal(telemetryEvents.some(event => event.name === "chest_smash_result"), false);
});

await test("fromDrop の実生成・dispatch 経路は開封を source 分離して記録する", () => {
  const combatStart = readFileSync(new URL("../../../src/combat_ui/combat_start.js", import.meta.url), "utf8");
  const battleLogPlayer = readFileSync(new URL("../../../src/combat_ui/battle_log_player.js", import.meta.url), "utf8");
  const chestSource = readFileSync(new URL("../../../src/chest.js", import.meta.url), "utf8");
  assert.match(combatStart, /setupPostCombatChest\(mimicChest\)/);
  assert.match(battleLogPlayer, /setupPostCombatChest\(mimicChest\)/);
  assert.match(chestSource, /setupChestState\(null, null, null, null, \{ fromDrop: true \}\)/);

  resetChest({ trap: "none" });
  setupChestState("none", null, "DAGGER", () => 0.99, { fromDrop: true });
  assert.equal(state.chestState.fromDrop, true);
  openChest(() => 0.99);
  const action = chestTelemetryEvents().find(event => event.name === "chest_action");
  assert.equal(action.properties.chestSource, "fromDrop");
  assert.equal(action.properties.fromDrop, true);
});

await test("報酬カテゴリは特殊報酬を通常品から分ける", () => {
  assert.equal(getChestRewardCategory("DAGGER"), "weapon");
  assert.equal(getChestRewardCategory("HEAL_POTION"), "usable");
  assert.equal(getChestRewardCategory("TOWN_PORTAL"), "special");
  assert.equal(getChestRewardCategory("HEAL_POTION", "special"), "special");
  assert.equal(getChestRewardCategory(null), null);
});

await test("致死的な通常解除失敗は未確定の宝箱報酬を失ってゲームオーバーへ進む", () => {
  const doomed = makeCharacter("Ninja");
  doomed.hp = 1;
  resetChest({ trap: "poison needle", item: "HEAL_POTION", party: [doomed] });
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = () => 0;
  try {
    // The universal 25% chest disarm boundary fails; the full trap then deals lethal damage.
    assert.equal(openChest(sequence([0.70, 0, 0, 0, 0])), true);
  } finally {
    global.setTimeout = originalSetTimeout;
  }
  assert.equal(doomed.status, "dead");
  assert.equal(state.inventory.includes("HEAL_POTION"), false);
  assert.equal(state.currentRun.lostObjectLoot.length, 0, "unopened lethal chests never create an adopted loot entry");
  assert.equal(state.currentRun.itemsFound.includes("HEAL_POTION"), true);
  assert.ok(Object.values(state.currentRun.materials).some(quantity => quantity > 0));
});

await test("キットは1個消費して確定解除し、解除数を増やさない", () => {
  resetChest({ trap: "teleporter" });
  const origin = { x: state.x, y: state.y };
  state.inventory = ["TRAP_KIT", "HEAL_POTION"];
  state.currentRun.trapsDisarmed = 4;
  assert.equal(openChest(() => 0.99, { useKit: true }), true);
  assert.deepEqual(state.inventory, ["HEAL_POTION"]);
  assert.deepEqual({ x: state.x, y: state.y }, origin);
  assert.equal(state.currentRun.trapsDisarmed, 4);
  assert.equal(state.currentRun.trapsTriggered, 0);
});

await test("Town所持の重複キットは戦利品lifecycleを出さず、Dungeon取得キットだけ追跡する", () => {
  resetChest({ trap: "teleporter" });
  state.inventory = ["TRAP_KIT"];
  state.currentRun.townInventory = ["TRAP_KIT"];
  state.currentRun.unbankedObjectLoot = [{ id: "run:loot:9", item: "TRAP_KIT" }];
  assert.equal(openChest(() => 0.99, { useKit: true }), true);
  assert.equal(telemetryEvents.filter(event => event.name === "loot_lifecycle").length, 0);

  resetChest({ trap: "teleporter" });
  state.inventory = ["TRAP_KIT"];
  state.currentRun.townInventory = [];
  state.currentRun.unbankedObjectLoot = [{ id: "run:loot:10", item: "TRAP_KIT" }];
  assert.equal(openChest(() => 0.99, { useKit: true }), true);
  const lifecycle = telemetryEvents.filter(event => event.name === "loot_lifecycle");
  assert.deepEqual(lifecycle.map(event => event.properties.lifecycleStage), ["consumed"]);
  assert.equal(lifecycle[0].properties.lootSequence, 10);
});

await test("罠なし宝箱ではキットを消費せずに開ける", () => {
  resetChest({ trap: "none", item: "HEAL_POTION" });
  state.inventory = ["TRAP_KIT"];
  assert.equal(openAndResolve(() => 0.99, { useKit: true }), true);
  assert.equal(state.inventory.includes("TRAP_KIT"), true);
  assert.equal(state.inventory.includes("HEAL_POTION"), true);
  assert.ok(state.logs.includes("罠は仕掛けられていなかった。キットは使わずに済んだ。"));

  resetChest({ trap: "poison needle" });
  assert.equal(openChest(() => 0.99, { useKit: true }), false, "a kit open needs a kit");
  assert.equal(state.chestState.trap, "poison needle");
});

await test("開封時の自動解除率はクラスによらず0.25", () => {
  const successNinja = makeCharacter("Ninja", "Success Ninja");
  resetChest({ trap: "poison needle", party: [successNinja] });
  openChest(() => 0.249);
  assert.equal(state.currentRun.trapsDisarmed, 1);
  assert.equal(state.currentRun.trapsTriggered, 0);

  const failedNinja = makeCharacter("Ninja", "Failed Ninja");
  resetChest({ trap: "poison needle", party: [failedNinja] });
  openChest(() => 0.25);
  assert.equal(state.currentRun.trapsDisarmed, 0);
  assert.equal(state.currentRun.trapsTriggered, 1);
});

await test("腐食の罠は手持ちの消耗品を1つ壊し、帰還手段は守る", () => {
  resetChest({ trap: "corrosion" });
  state.inventory = ["TOWN_PORTAL", "ANTIDOTE"];
  const char = state.party[0];
  const hpBefore = char.hp;
  triggerChestTrap(char, () => 0);
  assert.deepEqual(state.inventory, ["TOWN_PORTAL"]);
  assert.equal(char.hp, hpBefore, "corrosion deals no HP damage");
  assert.ok(state.logs.some(log => log.includes("腐り落ちた")));
  assert.equal(state.codex.events.traps["chest:corrosion"].triggered, 1);

  resetChest({ trap: "corrosion" });
  state.inventory = ["TOWN_PORTAL"];
  triggerChestTrap(state.party[0], () => 0);
  assert.deepEqual(state.inventory, ["TOWN_PORTAL"]);
  assert.ok(state.logs.some(log => log.includes("腐らせる物は持っていなかった")));
});

await test("ミミックは解除もキットも効かず、戦闘になる。勝てば強化された宝箱が残る", () => {
  resetChest({ trap: "mimic", item: "HEAL_POTION", accessoryItem: "AMULET_HP" });
  state.floor = 4;
  state.inventory = ["TRAP_KIT"];
  assert.equal(openChest(() => 0, { useKit: true }), true);
  assert.equal(state.gameState, "combat");
  assert.equal(state.inventory.includes("TRAP_KIT"), true, "a kit is not spent on a mimic");
  assert.equal(state.chestState, null);
  assert.equal(state.map[state.y][state.x].event, null, "the mimic chest cannot be reopened");
  assert.equal(state.combatState.isMimic, true);
  assert.equal(state.combatState.isRoamingFlack, false);
  assert.equal(state.combatState.monsters[0].name, "ミミック");
  assert.equal(state.combatState.mimicChest.item, "HEAL_POTION");
  assert.equal(state.currentRun.trapsDisarmed, 0);
  assert.equal(state.currentRun.trapsTriggered, 1);
  assert.equal(state.codex.events.traps["chest:mimic"].triggered, 1);

  const mimicChest = state.combatState.mimicChest;
  state.combatState = null;
  state.gameState = "chest";
  setupPostCombatChest(mimicChest);
  assert.equal(state.chestState.trap, "none");
  assert.equal(state.chestState.fromDrop, true, "the restored chest persists like a dropped chest");
  assert.equal(typeof state.chestState.item, "object");
  assert.ok(["rare", "epic"].includes(state.chestState.item.rarity), "the main reward is upgraded");
  assert.equal(state.chestState.accessoryItem, "AMULET_HP");
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
