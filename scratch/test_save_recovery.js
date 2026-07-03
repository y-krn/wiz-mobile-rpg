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
