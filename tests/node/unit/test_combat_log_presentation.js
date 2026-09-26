import assert from "node:assert/strict";
import { runCombatRoundCalculation } from "../../../src/combat_logic/round.js";
import {
  COMBAT_LOG_DELAYS,
  COMBAT_LOG_SIDES,
  COMBAT_LOG_PRESENTATION_KINDS,
  formatCombatLogMessage,
  getCombatLogSide,
  getCombatLogDelay,
  getCombatLogPace,
  groupCombatLogEntries,
  isImportantCombatResult
} from "../../../src/combat_ui/combat_log_presentation.js";
import * as facade from "../../../src/combat_ui/combat_log_presentation.js";
import * as owner from "../../../src/combat_ui/combat_log_presentation.ts";

const runtimeExports = [
  "COMBAT_LOG_DELAYS",
  "COMBAT_LOG_PRESENTATION_KINDS",
  "COMBAT_LOG_SIDES",
  "formatCombatLogMessage",
  "getCombatLogDelay",
  "getCombatLogPace",
  "getCombatLogSide",
  "groupCombatLogEntries",
  "isImportantCombatResult"
];
assert.deepEqual(Object.keys(facade).sort(), [...runtimeExports].sort());
assert.deepEqual(Object.keys(owner).sort(), [...runtimeExports].sort());
for (const name of runtimeExports) assert.equal(facade[name], owner[name], `${name} facade identity`);
assert.equal(facade.COMBAT_LOG_PRESENTATION_KINDS, COMBAT_LOG_PRESENTATION_KINDS);
assert.ok(Object.isFrozen(COMBAT_LOG_DELAYS));
assert.ok(Object.isFrozen(COMBAT_LOG_SIDES));
assert.deepEqual(Object.keys(COMBAT_LOG_DELAYS), ["normal", "important", "transition", "chest", "milestone"]);
assert.deepEqual(Object.values(COMBAT_LOG_DELAYS), [500, 850, 750, 950, 1900]);
assert.deepEqual(Object.keys(COMBAT_LOG_SIDES), ["ALLY", "ENEMY", "NEUTRAL"]);
const nonStringLog = { toString() { throw new Error("must not coerce"); } };
assert.equal(formatCombatLogMessage(nonStringLog), nonStringLog);
assert.equal(getCombatLogSide(nonStringLog), COMBAT_LOG_SIDES.NEUTRAL);
assert.equal(isImportantCombatResult(nonStringLog), false);

assert.equal(getCombatLogDelay({ msg: "ゴブリンに8のダメージ。" }), COMBAT_LOG_DELAYS.normal);
assert.equal(getCombatLogDelay({ msg: "弱点を突いた。12ダメージ。" }), COMBAT_LOG_DELAYS.important);
assert.equal(getCombatLogDelay({ endCombat: true, msg: "周囲に静寂が戻った。" }), COMBAT_LOG_DELAYS.transition);
assert.equal(getCombatLogDelay({ triggerChest: true, msg: "宝箱が現れた。" }), COMBAT_LOG_DELAYS.chest);
assert.equal(getCombatLogDelay({ milestoneVictory: 2, msg: "階層守護者を撃破した。" }), COMBAT_LOG_DELAYS.milestone);

assert.equal(getCombatLogDelay({ msg: "通常結果" }, { isAuto: true }), 50);
assert.equal(getCombatLogDelay({ msg: "弱点を突いた。" }, { isAuto: true }), 50);
assert.equal(getCombatLogDelay({ endCombat: true }, { isAuto: true }), 150);
assert.equal(getCombatLogDelay({ triggerChest: true }, { isAuto: true }), 150);
assert.equal(getCombatLogDelay({ milestoneVictory: 2 }, { isAuto: true }), 300);
assert.equal(getCombatLogPace({ pace: "normal", milestoneVictory: true, triggerChest: true, endCombat: true }), "normal");
assert.equal(getCombatLogPace({ milestoneVictory: true, triggerChest: true, endCombat: true }), "milestone");
assert.equal(getCombatLogPace({ triggerChest: true, endCombat: true }), "chest");
assert.equal(getCombatLogPace({ endCombat: true, msg: "撃破した！" }), "transition");
assert.equal(getCombatLogPace({ pace: "unsupported", msg: "弱点を突いた。" }), "important");
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
assert.equal(formatCombatLogMessage("[味方] [!] 通常ログ  \n"), "通常ログ");
assert.equal(formatCombatLogMessage("冒険者は身を固めて防御している。"), "冒険者は身を固め、次の一撃に備えた。");
assert.deepEqual(groupCombatLogEntries(null), []);
assert.deepEqual(groupCombatLogEntries({ forEach() { throw new Error("must not call"); } }), []);

const sparseQueue = [];
sparseQueue[1] = { msg: "一件目", effects: nonStringLog };
sparseQueue[3] = { msg: "二件目", groupId: "same" };
sparseQueue[4] = { msg: "三件目", groupId: "same" };
const sparseGrouped = groupCombatLogEntries(sparseQueue);
assert.equal(sparseGrouped.length, 2);
assert.equal(sparseGrouped[0].effects, nonStringLog);
assert.deepEqual(Object.keys(sparseGrouped[0]), ["msg", "effects", "side", "presentationKind"]);
assert.equal(sparseGrouped[1].msg, "二件目 三件目");
assert.equal(sparseGrouped[1].effects.length, 2);
assert.equal(sparseGrouped[1].effects[0].msg, "二件目");
assert.equal(sparseGrouped[1].effects[1].msg, "三件目");
assert.notEqual(groupCombatLogEntries(sparseQueue), groupCombatLogEntries(sparseQueue));
assert.equal(sparseQueue[1].side, undefined);

const nonAdjacent = groupCombatLogEntries([
  { msg: "A", groupId: "x" },
  { msg: "間" },
  { msg: "B", groupId: "x" },
  { msg: "空", groupId: "" },
  { msg: "空2", groupId: "" }
]);
assert.deepEqual(nonAdjacent.map(entry => entry.msg), ["A", "間", "B", "空", "空2"]);

const nestedEffects = { source: "fixture" };
const mergedPayloads = groupCombatLogEntries([
  { msg: "left", groupId: "flags", payload: nestedEffects },
  {
    msg: "right",
    groupId: "flags",
    runEscape: "run",
    escapeToTown: "town",
    fleeCombat: "flee",
    milestoneVictory: 2,
    giveKey: "key",
    triggerChest: "chest",
    endCombat: "end"
  }
]);
assert.equal(mergedPayloads[0].effects[0].payload, nestedEffects);
assert.deepEqual(Object.keys(mergedPayloads[0]), ["msg", "groupId", "payload", "side", "presentationKind", "runEscape", "escapeToTown", "fleeCombat", "milestoneVictory", "giveKey", "triggerChest", "endCombat", "effects"]);
for (const [flag, value] of Object.entries({
  runEscape: "run",
  escapeToTown: "town",
  fleeCombat: "flee",
  milestoneVictory: 2,
  giveKey: "key",
  triggerChest: "chest",
  endCombat: "end"
})) {
  assert.equal(mergedPayloads[0].effects[1][flag], value);
  assert.equal(mergedPayloads[0][flag], value);
}

let paceReads = 0;
const paceGetter = Object.defineProperty({}, "pace", {
  get() {
    paceReads += 1;
    return ["normal", "important", "transition"][paceReads - 1];
  }
});
assert.equal(getCombatLogPace(paceGetter), "transition");
assert.equal(paceReads, 3);
assert.throws(() => getCombatLogPace(Object.defineProperty({}, "pace", {
  get() { throw new Error("pace getter"); }
})), /pace getter/);

let sideReads = 0;
let kindReads = 0;
const semanticGetter = {
  msg: "getter",
  get side() { sideReads += 1; return sideReads === 1 ? COMBAT_LOG_SIDES.ALLY : COMBAT_LOG_SIDES.ENEMY; },
  get presentationKind() {
    kindReads += 1;
    return kindReads === 1 ? COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_DEALT : COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_TAKEN;
  }
};
const getterResult = groupCombatLogEntries([semanticGetter]);
assert.equal(sideReads, 3);
assert.equal(kindReads, 3);
assert.equal(getterResult[0].side, COMBAT_LOG_SIDES.ENEMY);
assert.equal(getterResult[0].presentationKind, COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_TAKEN);
assert.throws(() => groupCombatLogEntries([{
  get side() { throw new Error("side getter"); }
}]), /side getter/);

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
