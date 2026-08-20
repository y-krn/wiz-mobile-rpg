import { runCombatRoundCalculation } from "../src/combat_logic/round.js";

// 相互全滅（味方全滅と最後の敵撃破が同一ラウンド）で、勝利報酬(endCombat)を出さず
// checkCombatStatus 相当が GAMEOVER を選ぶことを検証する回帰テスト。
// バグ: checkCombatStatus が allMonstersDead を先に判定し早期returnするため、
//       相互全滅が「勝利」扱いになりゲームオーバーが発火しなかった。

console.log("=== MUTUAL ANNIHILATION / POISON WIPE -> GAME OVER TEST ===");

let failed = 0;
function check(cond, label, detail = "") {
  if (cond) {
    console.log(`[PASS] ${label}`);
  } else {
    console.error(`[FAIL] ${label} ${detail}`);
    failed++;
  }
}

function mkChar(name, hp, status = "ok") {
  return {
    name, hp, maxHp: 5, status, level: 1, class: "Fighter",
    str: 5, int: 5, pie: 5, vit: 1, agi: 1, luk: 5,
    equipment: {}, spells: [], mp: 0, maxMp: 0, exp: 0
  };
}
function baseState(party, monsters) {
  return {
    party,
    inventory: [],
    combatState: { monsters, isAuto: false },
    currentRun: { itemsFound: [], equipmentFound: [], materialsFound: {}, kills: 0, chestsOpened: 0, deepestFloor: 1 },
    codex: null, firstKills: [], roamingMonsters: [], floorChestsTotal: [0, 0, 0, 0, 0],
    gold: 0, floor: 1, materials: {}, identifyTickets: 0
  };
}
// battle_log_player + checkCombatStatus の終端判定を再現。
// 勝利報酬(endCombat/triggerChest/giveCrystal/giveKey)が queue にあれば戦闘は
// checkCombatStatus に到達する前に「勝利」で終わる。無ければ末尾で checkCombatStatus。
function terminalDecision(ns, logQueue) {
  const hasVictoryEnd = logQueue.some(l => l.endCombat || l.triggerChest || l.giveCrystal || l.giveKey);
  const allMonstersDead = ns.combatState.monsters.every(m => m.hp <= 0);
  const allPartyDead = ns.party.every(c => c.status === "dead");
  if (hasVictoryEnd) return "VICTORY";
  // checkCombatStatus（修正後: 全滅を勝利より優先）
  if (allPartyDead) return "GAMEOVER";
  if (allMonstersDead) return "VICTORY";
  return "NEXT_TURN";
}

// --- Case A: 相互全滅（敵が味方を攻撃で倒し、敵は自分の毒で同ラウンド死亡） ---
{
  let gotGameOver = 0;
  const N = 300;
  for (let i = 0; i < N; i++) {
    const party = [mkChar("Solo", 2)];
    const monster = { name: "Reaper", hp: 2, maxHp: 2, atk: 99, def: 0, status: "poisoned", row: "front", exp: 10, gold: 5 };
    const s = baseState(party, [monster]);
    const { logQueue, state: ns } = runCombatRoundCalculation(s, { actions: [{ actorIdx: 0, type: "defend" }] });
    if (terminalDecision(ns, logQueue) === "GAMEOVER") gotGameOver++;
  }
  check(gotGameOver === N, "相互全滅は常に GAMEOVER（勝利扱いにしない）", `-> ${gotGameOver}/${N}`);
}

// --- Case B: 純毒で味方全滅（敵は生存） ---
{
  let gotGameOver = 0;
  const N = 300;
  for (let i = 0; i < N; i++) {
    const party = [mkChar("A", 2, "poisoned"), mkChar("B", 2, "poisoned")];
    const monster = { name: "Slime", hp: 50, maxHp: 50, atk: 0, def: 0, status: "ok", row: "front", exp: 5, gold: 1 };
    const s = baseState(party, [monster]);
    const { logQueue, state: ns } = runCombatRoundCalculation(s, { actions: party.map((c, i2) => ({ actorIdx: i2, type: "defend" })) });
    if (terminalDecision(ns, logQueue) === "GAMEOVER") gotGameOver++;
  }
  check(gotGameOver === N, "純毒による味方全滅は常に GAMEOVER", `-> ${gotGameOver}/${N}`);
}

// --- Case C: 通常勝利（味方生存で敵撃破）は勝利のまま ---
{
  let gotVictory = 0;
  const N = 100;
  for (let i = 0; i < N; i++) {
    const party = [mkChar("Hero", 100)];
    const monster = { name: "Slime", hp: 1, maxHp: 1, atk: 0, def: 0, status: "ok", row: "front", exp: 5, gold: 1 };
    const s = baseState(party, [monster]);
    const { logQueue, state: ns } = runCombatRoundCalculation(s, { actions: [{ actorIdx: 0, type: "fight", targetIdx: 0 }] });
    if (terminalDecision(ns, logQueue) === "VICTORY") gotVictory++;
  }
  check(gotVictory === N, "通常勝利は VICTORY のまま（誤ってゲームオーバーにしない）", `-> ${gotVictory}/${N}`);
}

if (failed > 0) {
  console.error(`\n${failed} 件のチェックに失敗しました。`);
  process.exit(1);
}
console.log("\n=== ALL MUTUAL ANNIHILATION TESTS PASSED ===");
