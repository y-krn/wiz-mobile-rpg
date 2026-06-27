// Mock localStorage for Node.js test environment before imports
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

import assert from "assert";
import { runCombatRoundCalculation } from "../src/combat_logic.js";

function createParalyzedState(partyStatuses, allParalyzedTurns = 0) {
  const party = partyStatuses.map((status, idx) => ({
    name: `Char${idx}`,
    class: "Fighter",
    level: 1,
    hp: status === "dead" ? 0 : 30,
    maxHp: 30,
    mp: 0,
    maxMp: 0,
    status: status,
    str: 10,
    int: 10,
    pie: 10,
    vit: 10,
    agi: 10,
    luk: 10,
    equipment: { weapon: null, shield: null, armor: null },
    spells: [],
    exp: 0
  }));

  return {
    party: party,
    combatState: {
      monsters: [
        { name: "Dummy Monster", hp: 10, maxHp: 10, atk: 1, def: 0, exp: 1, gold: 1, row: "front" }
      ],
      isBoss: false,
      isMidboss: false,
      isRoamingFlack: false,
      allParalyzedTurns: allParalyzedTurns
    },
    inventory: [],
    firstKills: [],
    codex: null,
    currentRun: { itemsFound: [], equipmentFound: [] },
    roamingMonsters: [],
    floorChestsTotal: [],
    gold: 0,
    floor: 1
  };
}

console.log("Starting Combat Paralyze Verification Tests...");

// 1. 全員麻痺時の警告ログとカウント増加の検証
// Math.random を常に 0.99 にして、麻痺の自然回復（20%未満）が起きないようにする。
const originalRandom = Math.random;
Math.random = () => 0.99;

try {
  // 1ターン目 (allParalyzedTurns: 0)
  const state1 = createParalyzedState(["paralyzed", "dead", "dead", "dead"], 0);
  const result1 = runCombatRoundCalculation(state1, { actions: [] });

  assert.ok(result1.logQueue.some(log => log.msg?.includes("全員が麻痺して動けない")), "全員麻痺時の警告ログ(動けない)が出力されること");
  assert.ok(result1.logQueue.some(log => log.msg?.includes("敵の攻撃を受けるしかない")), "全員麻痺時の警告ログ(受けるしかない)が出力されること");
  assert.strictEqual(result1.state.combatState.allParalyzedTurns, 1, "全員麻痺カウントが1になること");

  // 2ターン目 (allParalyzedTurns: 1)
  const state2 = createParalyzedState(["paralyzed", "dead", "dead", "dead"], 1);
  const result2 = runCombatRoundCalculation(state2, { actions: [] });
  assert.strictEqual(result2.state.combatState.allParalyzedTurns, 2, "全員麻痺カウントが2になること");

  // 3ターン目 (allParalyzedTurns: 2 -> 3に達して全滅)
  const state3 = createParalyzedState(["paralyzed", "dead", "dead", "dead"], 2);
  const result3 = runCombatRoundCalculation(state3, { actions: [] });
  assert.strictEqual(result3.state.combatState.allParalyzedTurns, 3, "全員麻痺カウントが3になること");
  assert.ok(result3.logQueue.some(log => log.msg?.includes("全員が麻痺したまま力尽きた")), "全滅ログが出力されること");
  assert.ok(result3.state.party.every(c => c.status === "dead"), "パーティ全員が死亡状態になること");

} finally {
  Math.random = originalRandom;
}

// 2. 麻痺の自然回復とカウントリセットの検証
// Math.random を 0.05 にして、20%の確率の自然回復が確実に発生するようにする。
Math.random = () => 0.05;

try {
  const state = createParalyzedState(["paralyzed", "dead", "dead", "dead"], 1);
  const result = runCombatRoundCalculation(state, { actions: [] });

  assert.ok(result.logQueue.some(log => log.msg?.includes("麻痺から回復した")), "回復ログが出力されること");
  assert.strictEqual(result.state.party[0].status, "ok", "キャラクターのステータスが ok になること");
  assert.strictEqual(result.state.combatState.allParalyzedTurns, 0, "全員麻痺カウントがリセットされること");
} finally {
  Math.random = originalRandom;
}

// 3. 一部が麻痺で、行動可能キャラがいる場合
// 行動可能なキャラクター(ok)がいるのでカウントは進まない/リセットされること
try {
  const state = createParalyzedState(["paralyzed", "ok", "dead", "dead"], 1);
  const result = runCombatRoundCalculation(state, { actions: [] });

  assert.strictEqual(result.state.combatState.allParalyzedTurns, 0, "行動可能なキャラクターがいる場合はカウントがリセットされること");
} finally {
  Math.random = originalRandom;
}

// 4. 非全員麻痺から全員麻痺への状態遷移テスト
// ターン開始時は麻痺+毒(生存)であり、ターン終了時の毒ダメージで毒キャラが死亡。
// 結果として生存メンバーが全員麻痺になり、allParalyzedTurns が 1 に増えることを検証。
try {
  Math.random = () => 0.99;
  const state = createParalyzedState(["paralyzed", "poisoned", "dead", "dead"], 0);
  // 毒キャラのHPを2に設定し、確実に毒ダメージ(2-4)で死亡するようにする
  state.party[1].hp = 2;

  // 毒ダメージが確実に発生するように Math.random を固定
  const result = runCombatRoundCalculation(state, { actions: [] });

  assert.strictEqual(result.state.party[1].status, "dead", "毒キャラが死亡していること");
  assert.strictEqual(result.state.combatState.allParalyzedTurns, 1, "毒キャラ死亡により全員麻痺になり、カウントが1になること");
} finally {
  Math.random = originalRandom;
}

// 5. 全員麻痺状態での戦闘終了（勝利）時の検証
// 味方が全員麻痺しているが、敵が全滅(逃亡/毒など)して戦闘勝利になった場合、敗北ではなく勝利で終わることを検証。
try {
  const state = createParalyzedState(["paralyzed", "dead", "dead", "dead"], 1);
  // 敵のHPを0にして最初から全滅状態にする
  state.combatState.monsters[0].hp = 0;

  const result = runCombatRoundCalculation(state, { actions: [] });

  assert.ok(result.logQueue.some(log => log.msg?.includes("戦闘に勝利した") || log.msg?.includes("静寂が戻った")), "戦闘勝利または静寂ログが出力されること");
  assert.strictEqual(result.state.party[0].status, "paralyzed", "キャラクターは麻痺状態のままであること");
} finally {
  Math.random = originalRandom;
}

console.log("All Combat Paralyze verification tests passed successfully!");
