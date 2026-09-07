import assert from "node:assert/strict";
import { runCombatRoundCalculation } from "../../../src/combat_logic/round.js";
import {
  COMBAT_LOG_DELAYS,
  COMBAT_LOG_SIDES,
  COMBAT_LOG_PRESENTATION_KINDS,
  formatCombatLogMessage,
  getCombatLogSide,
  getCombatLogDelay,
  groupCombatLogEntries,
  isImportantCombatResult
} from "../../../src/combat_ui/combat_log_presentation.js";

assert.equal(getCombatLogDelay({ msg: "ゴブリンに8のダメージ。" }), COMBAT_LOG_DELAYS.normal);
assert.equal(getCombatLogDelay({ msg: "弱点を突いた。12ダメージ。" }), COMBAT_LOG_DELAYS.important);
assert.equal(getCombatLogDelay({ endCombat: true, msg: "周囲に静寂が戻った。" }), COMBAT_LOG_DELAYS.transition);
assert.equal(getCombatLogDelay({ triggerChest: true, msg: "宝箱が現れた。" }), COMBAT_LOG_DELAYS.chest);
assert.equal(getCombatLogDelay({ milestoneVictory: 2, msg: "階層守護者を撃破した。" }), COMBAT_LOG_DELAYS.milestone);

assert.equal(getCombatLogDelay({ msg: "通常結果" }, { isAuto: true }), 50);
assert.equal(getCombatLogDelay({ milestoneVictory: 2 }, { isAuto: true }), 300);
assert.equal(isImportantCombatResult("反射され、ダメージを与えられなかった。"), true);
assert.equal(isImportantCombatResult("ゴブリンを倒した！"), true);
assert.equal(isImportantCombatResult("毒が消え去った！"), true);
assert.equal(isImportantCombatResult("敵は沈黙した。"), true);
assert.equal(isImportantCombatResult("ゴブリンに8ダメージ。"), false);
assert.equal(getCombatLogSide("[味方] 冒険者の攻撃！"), COMBAT_LOG_SIDES.ALLY);
assert.equal(getCombatLogSide("[ 敵 ] ゴブリンの攻撃！"), COMBAT_LOG_SIDES.ENEMY);
assert.equal(getCombatLogSide("戦闘に勝利した！"), COMBAT_LOG_SIDES.NEUTRAL);
assert.equal(
  formatCombatLogMessage("[味方] 冒険者の攻撃！ゴブリンに8のダメージ。", COMBAT_LOG_SIDES.ALLY),
  "ゴブリンに一撃を加えた。8ダメージ。"
);
assert.equal(
  formatCombatLogMessage("[ 敵 ] ゴブリンの攻撃！冒険者に5のダメージ！", COMBAT_LOG_SIDES.ENEMY),
  "ゴブリンの一撃を受けた。5ダメージ。"
);

const grouped = groupCombatLogEntries([
  { msg: "[味方] 冒険者の攻撃！ゴブリンに8のダメージ。", groupId: "action:1" },
  { msg: "[味方] [!] ゴブリンを倒した！", groupId: "action:1" },
  { msg: "次の行動。", groupId: "action:2" }
]);
assert.equal(grouped.length, 2);
assert.equal(grouped[0].msg, "ゴブリンに一撃を加えた。8ダメージ。 ゴブリンを倒した！");
assert.equal(grouped[0].side, COMBAT_LOG_SIDES.ALLY);

const mixed = groupCombatLogEntries([
  { msg: "[味方] 冒険者の攻撃！ゴブリンに8のダメージ。", groupId: "action:mixed" },
  { msg: "[ 敵 ] ゴブリンの攻撃！冒険者に5のダメージ！", groupId: "action:mixed" }
]);
assert.equal(mixed[0].side, COMBAT_LOG_SIDES.NEUTRAL);
assert.equal(mixed[0].presentationKind, COMBAT_LOG_PRESENTATION_KINDS.NEUTRAL);

const poisonSemantics = groupCombatLogEntries([
  {
    msg: "[ 敵 ] [!] 毒のダメージ！コボルトは3のダメージを受けた。",
    side: COMBAT_LOG_SIDES.ENEMY,
    presentationKind: COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_DEALT
  },
  {
    msg: "[味方] [!] 毒のダメージ！冒険者は2のダメージを受けた。",
    side: COMBAT_LOG_SIDES.ALLY,
    presentationKind: COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_TAKEN
  },
  {
    msg: "[ 敵 ] 棘が冒険者に1の反射ダメージを与えた！",
    side: COMBAT_LOG_SIDES.ENEMY,
    presentationKind: COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_TAKEN
  }
]);
assert.deepEqual(poisonSemantics.map(entry => entry.presentationKind), [
  COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_DEALT,
  COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_TAKEN,
  COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_TAKEN
]);
assert.equal(
  formatCombatLogMessage("[ 敵 ] コボルトの攻撃！冒険者に4のダメージ！", COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_TAKEN),
  "コボルトの一撃を受けた。4ダメージ。"
);

function createCombatState({ characterStatus = "ok", monsterStatus = "ok", monsterHp = 1000 } = {}) {
  return {
    floor: 1,
    party: [{
      name: "冒険者",
      level: 1,
      hp: 100,
      maxHp: 100,
      mp: 0,
      maxMp: 0,
      status: characterStatus,
      equipment: {},
      spells: [],
      buffs: [{ type: "firstStrike", value: 100, turns: 99 }]
    }],
    inventory: [],
    codex: null,
    firstKills: [],
    currentRun: null,
    metaMaterials: {},
    roamingMonsters: [],
    floorChestsTotal: [],
    combatState: {
      monsters: [{ name: "コボルトの斥候", hp: monsterHp, maxHp: monsterHp, atk: 0, def: 0, status: monsterStatus }],
      phase: "resolving",
      roundNumber: 1,
      isBoss: false,
      isMidboss: false,
      isRoamingFlack: false
    }
  };
}

const normalAttack = runCombatRoundCalculation(createCombatState(), {
  actions: [{ actorIdx: 0, type: "fight", targetIdx: 0 }]
});
assert.equal(
  normalAttack.logQueue.find(entry => entry.msg.includes("攻撃！"))?.presentationKind,
  COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_DEALT
);

const enemyPoison = runCombatRoundCalculation(createCombatState({ monsterStatus: "poisoned" }), {
  actions: [{ actorIdx: 0, type: "defend" }]
});
assert.equal(
  enemyPoison.logQueue.find(entry => entry.msg.includes("毒のダメージ"))?.presentationKind,
  COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_DEALT
);

const allyPoison = runCombatRoundCalculation(createCombatState({ characterStatus: "poisoned" }), {
  actions: [{ actorIdx: 0, type: "defend" }]
});
assert.equal(
  allyPoison.logQueue.find(entry => entry.msg.includes("毒のダメージ"))?.presentationKind,
  COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_TAKEN
);

console.log("[PASS] combat log presentation pacing, wording, and grouping");
