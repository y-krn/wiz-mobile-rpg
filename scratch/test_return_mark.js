// 帰還印撤去（TICKET-075）検証テスト

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
  const listeners = {};
  return {
    style: {},
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    replaceChildren() {
      this.children = [];
    },
    addEventListener: (event, callback) => {
      listeners[event] = callback;
    },
    click: () => {
      if (listeners.click) listeners.click();
    },
    classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
    setAttribute: () => {},
    getAttribute: () => "",
    removeAttribute: () => {},
    innerHTML: "",
    textContent: "",
    cloneNode: () => createDummyElement()
  };
};

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
  const { state } = await import("../src/state.js");
  const { applySavePayload } = await import("../src/state/save_payload.js");
  const { triggerRunResult } = await import("../src/result.js");
  const { enterDungeon } = await import("../src/movement.js");
  const { renderEnterDungeonSelect } = await import("../src/menu/explore_actions.js");
  const { MAP_WIDTH, MAP_HEIGHT, START_X, START_Y } = await import("../src/data.js");

  console.log("=== 帰還印撤去検証テスト開始 ===");

  let failed = 0;
  const check = (cond, label, detail) => {
    if (cond) {
      console.log(`-> [PASS] ${label}`);
    } else {
      failed++;
      console.error(`-> [FAIL] ${label}${detail ? ` (${detail})` : ""}`);
    }
  };

  const createVisitedMaps = () => Array.from({ length: 5 }, () =>
    Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false))
  );

  const setupRun = (floor) => {
    delete state.lastReturnedFloor;
    state.currentRun = {
      returnReason: null,
      startFloor: floor,
      deepestFloor: floor,
      floorsVisited: [floor],
      kills: 0, battles: 0, elitesKilled: 0, bossesKilled: 0,
      chestsOpened: 0, trapsTriggered: 0, goldGained: 0,
      itemsFound: [], equipmentFound: [], materialsFound: {}, deathLogs: []
    };
    state.party = [{ name: "A", class: "Fighter", level: 1, status: "ok", hp: 10, maxHp: 10 }];
    state.roster = [{ name: "A", class: "Fighter", level: 1, status: "ok", hp: 10, maxHp: 10 }];
    state.materials = {};
    state.remains = [];
    state.gold = 1000;
    state.inventory = [];
    state.maps = Array.from({ length: 5 }, () =>
      Array.from({ length: MAP_HEIGHT }, () => Array.from({ length: MAP_WIDTH }, () => ({ type: "floor" })))
    );
    state.visitedMaps = createVisitedMaps();
  };

  setupRun(3);
  state.floor = 3;
  triggerRunResult("escape_scroll");
  check(!Object.hasOwn(state, "lastReturnedFloor"), "スクロール帰還で帰還印を書かない", `actual: ${state.lastReturnedFloor}`);
  check(state.gameState === "result" && state.floor === 1, "スクロール帰還は町帰還結果へ進む", `state: ${state.gameState}, floor: ${state.floor}`);

  setupRun(5);
  state.floor = 5;
  triggerRunResult("gameover");
  check(!Object.hasOwn(state, "lastReturnedFloor"), "全滅で帰還印を書かない", `actual: ${state.lastReturnedFloor}`);
  check(state.gameState === "result" && state.floor === 1, "全滅後もB1F基点へ戻る", `state: ${state.gameState}, floor: ${state.floor}`);

  const oldSave = {
    x: START_X,
    y: START_Y,
    dir: 0,
    prevX: START_X,
    prevY: START_Y,
    party: [{ name: "A", class: "Fighter", status: "ok" }],
    roster: [{ name: "A", class: "Fighter", status: "ok" }],
    gold: 1000,
    inventory: [],
    seed: 1,
    floor: 1,
    maps: state.maps,
    visitedMaps: createVisitedMaps(),
    lightTurns: 0,
    lightPower: "",
    repelTurns: 0,
    dumapicTurns: 0,
    dumapicHint: "",
    eventCooldownTurns: 0,
    activeMerchantStock: [],
    gameState: "town",
    combatState: null,
    chestState: null,
    logs: [],
    floorChestsOpened: [0, 0, 0, 0, 0],
    floorChestsTotal: [0, 0, 0, 0, 0],
    firstKills: [],
    lastReturnedFloor: 4,
    currentRun: null,
    runHistory: [],
    deathLogs: [],
    remains: [],
    codex: {},
    roamingMonsters: [],
    firstChestUnidentifiedGuaranteed: false,
    roamingMovementStepCount: 0,
    contracts: [],
    activeContract: null,
    completedContracts: [],
    storage: [],
    storageMax: 30,
    identifyTickets: 0,
    cleared: false,
    materials: {},
    dungeonMemory: { traps: {} }
  };
  delete state.lastReturnedFloor;
  applySavePayload(oldSave);
  check(!Object.hasOwn(state, "lastReturnedFloor"), "旧セーブの帰還印をロード時に読まない", `actual: ${state.lastReturnedFloor}`);

  state.party = [{ name: "A", class: "Fighter", status: "ok" }];
  state.visitedMaps = createVisitedMaps();
  enterDungeon();
  check(state.gameState === "explore" && state.floor === 1, "旧帰還印があっても進入はB1F固定", `state: ${state.gameState}, floor: ${state.floor}`);
  check(state.visitedMaps[0][START_Y][START_X] === true, "B1F入口から探索開始", "start cell not visited");

  state.lastReturnedFloor = 4;
  const dummyGrid = createDummyElement();
  renderEnterDungeonSelect(dummyGrid);
  check(dummyGrid.children.length === 1, "進入UIは単一導線", `buttons: ${dummyGrid.children.length}`);
  check(!dummyGrid.children.some(child => child.textContent.includes("再開")), "進入UIに再開選択肢なし");

  console.log("=== 全テスト完了 ===");
  if (failed > 0) {
    console.error(`${failed} 件のテストが失敗しました`);
    process.exit(1);
  }
})();
