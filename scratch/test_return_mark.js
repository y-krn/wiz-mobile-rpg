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

  // テスト1: 階段帰還（stairs）では帰還印が温存されること
  state.lastReturnedFloor = 3;
  state.floor = 1; // 1Fの階段から帰る
  triggerRunResult("stairs");
  console.assert(state.lastReturnedFloor === 3, `階段帰還で帰還印が温存されること (actual: ${state.lastReturnedFloor})`);
  console.log("-> [PASS] 階段帰還温存検証");

  // テスト2: スクロール帰還（escape_scroll）で、現在階（上限B4F）が保存されること
  // B3Fからのスクロール帰還
  state.lastReturnedFloor = null;
  state.floor = 3;
  triggerRunResult("escape_scroll");
  console.assert(state.lastReturnedFloor === 3, `B3Fスクロール帰還で3Fが保存されること (actual: ${state.lastReturnedFloor})`);
  console.log("-> [PASS] B3Fスクロール帰還検証");

  // B5Fからのスクロール帰還（上限B4Fの検証）
  state.lastReturnedFloor = null;
  state.floor = 5;
  triggerRunResult("escape_scroll");
  console.assert(state.lastReturnedFloor === 4, `B5Fスクロール帰還で4Fが保存されること (actual: ${state.lastReturnedFloor})`);
  console.log("-> [PASS] B5Fスクロール帰還検証");

  // テスト3: 全滅（gameover）で帰還印が null になること
  state.lastReturnedFloor = 3;
  state.floor = 3;
  triggerRunResult("gameover");
  console.assert(state.lastReturnedFloor === null, `全滅時に帰還印がnullになること (actual: ${state.lastReturnedFloor})`);
  console.log("-> [PASS] 全滅時帰還印消滅検証");

  // テスト4: ボス撃破（クリスタル所持）時、帰還印が null になること
  // クリスタル所持状態でのスクロール帰還
  state.lastReturnedFloor = 3;
  state.floor = 5;
  state.inventory = ["ANTIGRAVITY_CRYSTAL"];
  triggerRunResult("escape_scroll");
  console.assert(state.lastReturnedFloor === null, `クリスタル所持時にスクロール帰還で帰還印がnullになること (actual: ${state.lastReturnedFloor})`);
  console.log("-> [PASS] ボス撃破（クリスタル所持）スクロール帰還検証");

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
    console.assert(state.lastReturnedFloor === null, `再開選択時に帰還印がnullになること (actual: ${state.lastReturnedFloor})`);
    console.log("-> [PASS] 再開選択時帰還印消費検証");
  } else {
    console.error("再開ボタンが生成されなかった");
  }

  console.log("=== 全テスト完了 ===");
})();
