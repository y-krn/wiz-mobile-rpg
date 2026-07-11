// サブメニュー中に保存 → 再開時に基底画面へ畳まれることの検証。
// 回帰: お城(城サブメニュー)でゲームをやめて再開すると、gameState="submenu" が
// そのまま復元される一方 menuContext は初期化されるため、renderer が街と判定できず
// floor=1/START座標(=地下1F登り階段)のダンジョンを描画してしまうバグ。
// createSavePayload が submenu を親画面へ畳んで保存することを検証する。

const dummyEl = () => ({
  style: {},
  children: [],
  appendChild() {},
  replaceChildren() {},
  addEventListener() {},
  classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
  setAttribute() {},
  getAttribute: () => "",
  removeAttribute() {},
  innerHTML: "",
  textContent: "",
  cloneNode: () => dummyEl()
});

globalThis.document = {
  getElementById: () => dummyEl(),
  querySelector: () => dummyEl(),
  querySelectorAll: () => [],
  createElement: () => dummyEl(),
  body: dummyEl()
};
globalThis.window = { innerWidth: 375, innerHeight: 667, addEventListener() {} };
globalThis.localStorage = (() => {
  let store = {};
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { store = {}; }
  };
})();

(async () => {
  const assert = (await import("assert")).default;
  const { state, initNewGame, saveAutosave, loadGame, createDefaultCurrentRun } = await import("../src/state.js");
  const { openSubmenu } = await import("../src/navigation.js");

  console.log("=== SUBMENU SAVE COLLAPSE VERIFICATION ===");

  // [A] お城サブメニュー中に保存 → 再開で town へ畳まれる
  localStorage.clear();
  initNewGame(); // gameState="town", floor=1, x/y=START(地下1F登り階段)
  openSubmenu("castle_main", "おしろ"); // gameState="submenu", prevGameState="town"
  assert.strictEqual(state.gameState, "submenu", "precondition: in submenu");
  saveAutosave();
  state.gameState = "explore"; // メモリを汚し、ロードで上書きされるか確認
  loadGame();
  assert.strictEqual(
    state.gameState,
    "town",
    "town submenu should resume as town, not explore(地下1F登り階段)"
  );
  console.log("-> [PASS] 城サブメニュー保存→再開でtown復帰");

  // [B] 探索中サブメニュー(キャンプ等)は explore へ畳まれる
  localStorage.clear();
  initNewGame();
  state.gameState = "explore";
  state.floor = 2;
  state.currentRun = createDefaultCurrentRun();
  state.currentRun.campRested = { 2: true };
  openSubmenu("event_camp", "野営地"); // prevGameState="explore"
  saveAutosave();
  state.gameState = "town";
  loadGame();
  assert.strictEqual(state.gameState, "explore", "explore submenu should resume as explore");
  assert.deepStrictEqual(state.currentRun.campRested, { 2: true }, "camp usage should survive roundtrip");
  console.log("-> [PASS] 探索サブメニュー保存→再開でexplore復帰");

  // [C] 罠遭遇中(activeTrapState未保存)は explore へ畳まれる
  localStorage.clear();
  initNewGame();
  state.gameState = "explore";
  state.floor = 1;
  state.gameState = "trap_encounter";
  state.activeTrapState = { trap: { id: "DUMMY" }, successRate: 50, expectedEffect: "" };
  saveAutosave();
  state.gameState = "town";
  loadGame();
  assert.strictEqual(
    state.gameState,
    "explore",
    "trap_encounter should resume as explore, not a broken trap panel"
  );
  console.log("-> [PASS] 罠遭遇中保存→再開でexplore復帰");

  // [D] submenu以外のgameStateはそのまま保存される (回帰防止)
  localStorage.clear();
  initNewGame();
  state.gameState = "town";
  saveAutosave();
  state.gameState = "explore";
  loadGame();
  assert.strictEqual(state.gameState, "town", "non-submenu state persists unchanged");
  console.log("-> [PASS] 非submenu状態はそのまま保存");

  // [E] ダンジョンイベントの結果フェーズも explore へ畳まれる
  localStorage.clear();
  initNewGame();
  state.gameState = "explore";
  state.floor = 2;
  openSubmenu("event_tablet_result", "石碑の結果：");
  saveAutosave();
  state.gameState = "town";
  loadGame();
  assert.strictEqual(
    state.gameState,
    "explore",
    "event result submenu should resume as explore, not a transient result screen"
  );
  console.log("-> [PASS] ダンジョンイベント結果保存→再開でexplore復帰");

  console.log("\n[TEST_SUBMENU_RESUME PASSED]");
})();
