import { state } from "../src/state.js";
import { armControlsGuard, CONTROLS_GUARD_MS, isControlsGuarded } from "../src/controls_guard.js";

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

armControlsGuard(1_000);
expect(state.controlsGuardUntil === 1_000 + CONTROLS_GUARD_MS, "ガード終了時刻が350ms後になる");
expect(isControlsGuarded(1_349), "遷移直後350ms未満の入力を抑止する");
expect(!isControlsGuarded(1_350), "350ms経過後の入力を許可する");

state.controlsGuardUntil = 0;
expect(!isControlsGuarded(1_000), "ガード未設定時は入力を許可する");

if (failures.length > 0) {
  failures.forEach((failure) => console.error(`[FAIL] ${failure}`));
  process.exit(1);
}

console.log("[PASS] transition input guard");
