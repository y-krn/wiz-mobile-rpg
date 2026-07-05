// 帰還印システム（TICKET-041）検証テスト

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
    appendChild: () => createDummyElement(),
    addEventListener: (event, callback) => {
      listeners[event] = callback;
    },
    click: () => {
      if (listeners["click"]) listeners["click"]();
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
  const { triggerRunResult } = await import("../src/result.js");
  const { renderEnterDungeonSelect } = await import("../src/menu/explore_actions.js");

  console.log("=== 帰還印システム検証テスト開始 ===");

  let failed = 0;
  // console.assert は失敗しても後続の [PASS] ログを止めない。
  // 実際に結果へ反映させるため、成否を集計しつつラベルを出し分ける。
  const check = (cond, label, detail) => {
    if (cond) {
      console.log(`-> [PASS] ${label}`);
    } else {
      failed++;
      console.error(`-> [FAIL] ${label}${detail ? ` (${detail})` : ""}`);
    }
  };

  // triggerRunResult は currentRun が無いと即 return するため、
  // 各ケースで最低限のラン状態を用意する。
  const setupRun = (floor) => {
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
  };

  // テスト1: B1F階段帰還（城帰還）では帰還印が失効すること
  // 表面へ完全帰還＝仕切り直しなので、前ランのスクロール印は残さない。
  setupRun(1);
  state.lastReturnedFloor = 3;
  state.floor = 1; // 1Fの階段から帰る
  state.inventory = [];
  triggerRunResult("stairs");
  check(state.lastReturnedFloor === null, "B1F階段帰還で帰還印が失効", `actual: ${state.lastReturnedFloor}`);

  // テスト2: スクロール帰還（escape_scroll）で、現在階（上限B4F）が保存されること
  // B3Fからのスクロール帰還
  setupRun(3);
  state.lastReturnedFloor = null;
  state.floor = 3;
  state.inventory = [];
  triggerRunResult("escape_scroll");
  check(state.lastReturnedFloor === 3, "B3Fスクロール帰還で3Fが保存", `actual: ${state.lastReturnedFloor}`);

  // B5Fからのスクロール帰還（上限B4Fの検証）
  setupRun(5);
  state.lastReturnedFloor = null;
  state.floor = 5;
  state.inventory = [];
  triggerRunResult("escape_scroll");
  check(state.lastReturnedFloor === 4, "B5Fスクロール帰還で4Fが保存（上限）", `actual: ${state.lastReturnedFloor}`);

  // テスト3: 全滅（gameover）で帰還印が null になること
  setupRun(3);
  state.lastReturnedFloor = 3;
  state.floor = 3;
  state.inventory = [];
  triggerRunResult("gameover");
  check(state.lastReturnedFloor === null, "全滅時に帰還印がnull", `actual: ${state.lastReturnedFloor}`);

  // テスト4: ボス撃破（クリスタル所持）時、帰還印が null になること
  // クリスタル所持状態でのスクロール帰還
  setupRun(5);
  state.lastReturnedFloor = 3;
  state.floor = 5;
  state.inventory = ["ANTIGRAVITY_CRYSTAL"];
  triggerRunResult("escape_scroll");
  check(state.lastReturnedFloor === null, "クリスタル所持スクロール帰還で帰還印がnull", `actual: ${state.lastReturnedFloor}`);

  // テスト5: 「地下N階から再開」選択時に帰還印が消費（null）されること
  state.lastReturnedFloor = 3;
  state.maps = [
    null, // B1F
    null, // B2F
    [ // B3F
      [{ type: "stairs-up", x: 0, y: 0 }]
    ],
    null, // B4F
    null  // B5F
  ];
  state.visitedMaps = [
    null,
    null,
    [[false]], // B3F visited map
    null,
    null
  ];
  
  const dummyGrid = createDummyElement();
  let resumeButton = null;
  dummyGrid.appendChild = (child) => {
    if (child.textContent && child.textContent.includes("再開")) {
      resumeButton = child;
    }
    return child;
  };
  renderEnterDungeonSelect(dummyGrid);
  
  if (resumeButton) {
    resumeButton.click();
    check(state.lastReturnedFloor === null, "再開選択時に帰還印が消費（null）", `actual: ${state.lastReturnedFloor}`);
  } else {
    failed++;
    console.error("-> [FAIL] 再開ボタンが生成されなかった");
  }

  console.log("=== 全テスト完了 ===");
  if (failed > 0) {
    console.error(`${failed} 件のテストが失敗しました`);
    process.exit(1);
  }
})();
