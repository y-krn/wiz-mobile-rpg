import assert from "node:assert/strict";
import { recordCharDeath, state } from "../src/state.js";

let failures = 0;

function test(name, fn) {
  try {
    state.logs = [];
    fn();
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failures++;
    console.error(`[FAIL] ${name}: ${error.message}`);
  }
}

function createState(combatState) {
  return {
    currentRun: { deathLogs: [] },
    combatState,
    floor: 3
  };
}

test("records the combat round number in the death log", () => {
  const stateObj = createState({ roundNumber: 4 });

  recordCharDeath(stateObj, { name: "アレス" }, "ゴブリンの攻撃");

  assert.deepEqual(stateObj.currentRun.deathLogs, [{
    charName: "アレス",
    cause: "ゴブリンの攻撃",
    floor: 3,
    turn: 4
  }]);
  assert.equal(state.logs.at(-1), "☠️ [!] アレスは B3F でゴブリンの攻撃により倒れた。 (ターン 4)");
});

test("records null and omits the turn text outside combat", () => {
  const stateObj = createState(null);

  recordCharDeath(stateObj, { name: "ミア" }, "落とし穴");

  assert.deepEqual(stateObj.currentRun.deathLogs, [{
    charName: "ミア",
    cause: "落とし穴",
    floor: 3,
    turn: null
  }]);
  assert.equal(state.logs.at(-1), "☠️ [!] ミアは B3F で落とし穴により倒れた。");
  assert.ok(!state.logs.at(-1).includes("ターン"));
});

if (failures > 0) {
  process.exit(1);
}
