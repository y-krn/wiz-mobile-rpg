// sim-scope: run
/* global console, process */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runSimTasks } from "./sim_parallel.js";

const MODE = process.env.B5_MODE || "baseline";
const BASELINE_RUNS = Math.max(1, Number(process.env.B5_RUNS || 8000));
const WHAT_IF_RUNS = Math.max(1, Number(process.env.B5_WHAT_IF_RUNS || 3000));
const CALIBRATION_RUNS = Math.max(1, Number(process.env.B5_CALIBRATION_RUNS || 500));
const BATCH_SIZE = Math.max(1, Number(process.env.B5_BATCH_SIZE || 1000));
const SEED = Number(process.env.B5_SEED || 2715) >>> 0;
process.env.SIM_SEED = String(SEED);

const {
  REFERENCE_SCENARIOS,
  SIM_CLASSES,
  calibrateCoreScoringProfile,
  resetSimulationRandom,
  simulateRun
} = await import("./sim_depth_material_ev.js");

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(SCRIPT_DIR, "results");
const PREFIX = process.env.B5_PREFIX || "issue-271-resistance-integrity-baseline";
const RAW_PATH = path.join(RESULTS_DIR, `${PREFIX}.raw.txt`);
const ROWS_PATH = path.join(RESULTS_DIR, `${PREFIX}-${MODE}-rows.jsonl`);
const PROGRESS_PATH = path.join(RESULTS_DIR, `${PREFIX}-progress.jsonl`);
const PHASE1_PATH = path.join(RESULTS_DIR, `${PREFIX}-phase1.md`);
const PHASE2_PATH = path.join(RESULTS_DIR, `${PREFIX}-phase2.md`);
const PHASE3_PATH = path.join(RESULTS_DIR, `${PREFIX}-phase3.md`);
const PHASE4_PATH = path.join(RESULTS_DIR, `${PREFIX}-phase4.md`);

const BASE_SCENARIO = REFERENCE_SCENARIOS.find(scenario => scenario.id === "workshop-empty");
const BASELINE = Object.freeze({
  id: process.env.B5_CONDITION_ID || "baseline",
  label: process.env.B5_CONDITION_LABEL || "現行",
  runs: BASELINE_RUNS
});
const WHAT_IF_CONDITIONS = Object.freeze([
  { id: "hp-10", label: "boss HP -10%", runs: WHAT_IF_RUNS, bossOverride: { floor: 5, hpMultiplier: 0.90 } },
  { id: "hp-20", label: "boss HP -20%", runs: WHAT_IF_RUNS, bossOverride: { floor: 5, hpMultiplier: 0.80 } },
  { id: "hp-30", label: "boss HP -30%", runs: WHAT_IF_RUNS, bossOverride: { floor: 5, hpMultiplier: 0.70 } },
  { id: "atk-20", label: "boss ATK -20%", runs: WHAT_IF_RUNS, bossOverride: { floor: 5, atkMultiplier: 0.80 } },
  { id: "no-lahalito", label: "LAHALITOなし", runs: WHAT_IF_RUNS, bossOverride: { floor: 5, disableSpell: true } },
  {
    id: "spellguard-20",
    label: "全到達buildへspellGuard +20",
    runs: WHAT_IF_RUNS,
    forcedBossAffixes: { floor: 5, values: { spellGuard: 20 } }
  },
  {
    id: "guardian-15",
    label: "全到達buildへguardian +15",
    runs: WHAT_IF_RUNS,
    forcedBossAffixes: { floor: 5, values: { guardian: 15 } }
  },
  {
    id: "antidemon-20",
    label: "全到達buildへantiDemon +20",
    runs: WHAT_IF_RUNS,
    forcedBossAffixes: { floor: 5, values: { antiDemon: 20 } }
  },
  { id: "hp-50", label: "boss HP -50%", runs: WHAT_IF_RUNS, bossOverride: { floor: 5, hpMultiplier: 0.50 } },
  {
    id: "hp-30-no-lahalito",
    label: "boss HP -30% + LAHALITOなし",
    runs: WHAT_IF_RUNS,
    bossOverride: { floor: 5, hpMultiplier: 0.70, disableSpell: true }
  },
  {
    id: "hp-30-antidemon-20",
    label: "boss HP -30% + antiDemon +20",
    runs: WHAT_IF_RUNS,
    bossOverride: { floor: 5, hpMultiplier: 0.70 },
    forcedBossAffixes: { floor: 5, values: { antiDemon: 20 } }
  },
  {
    id: "no-lahalito-antidemon-20",
    label: "LAHALITOなし + antiDemon +20",
    runs: WHAT_IF_RUNS,
    bossOverride: { floor: 5, disableSpell: true },
    forcedBossAffixes: { floor: 5, values: { antiDemon: 20 } }
  },
  {
    id: "hp-30-no-lahalito-antidemon-20",
    label: "boss HP -30% + LAHALITOなし + antiDemon +20",
    runs: WHAT_IF_RUNS,
    bossOverride: { floor: 5, hpMultiplier: 0.70, disableSpell: true },
    forcedBossAffixes: { floor: 5, values: { antiDemon: 20 } }
  },
  {
    id: "atk-20-no-lahalito",
    label: "boss ATK -20% + LAHALITOなし",
    runs: WHAT_IF_RUNS,
    bossOverride: { floor: 5, atkMultiplier: 0.80, disableSpell: true }
  }
]);

function hashSeed(text) {
  let seed = 2166136261;
  for (let index = 0; index < text.length; index++) {
    seed ^= text.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

function countStatusCures(counts = {}) {
  return Object.values(counts).reduce((sum, value) => sum + value, 0);
}

function classifyIncomingHit(message, playerName, enemyNames) {
  const physical = message.match(/の(?:攻撃|狙撃)！.*?に(\d+)のダメージ/);
  if (
    physical &&
    message.includes(`${playerName}に`) &&
    enemyNames.some(name => message.includes(`${name}の`))
  ) {
    return { type: "physical", damage: Number(physical[1]) };
  }
  const spell = message.match(/は(\d+)の(?:炎|氷|爆裂)ダメージを受けた/);
  if (spell && message.includes(`${playerName}は`)) {
    return {
      type: /炎/.test(message) ? "LAHALITO" : "other-spell",
      damage: Number(spell[1])
    };
  }
  const poison = message.match(/毒のダメージ.*?は(\d+)のダメージを受けた/);
  if (poison && message.includes(`${playerName}は`)) {
    return { type: "poison", damage: Number(poison[1]) };
  }
  return null;
}

function compactAttempt(encounter, battle, attemptIndex) {
  const startEnemy = encounter.rounds[0]?.enemiesBefore?.[0] ||
    encounter.endEnemyHp?.[0] ||
    { hp: 0, maxHp: 0 };
  const endEnemy = encounter.endEnemyHp?.[0] || startEnemy;
  const enemyNames = encounter.monsters.map(monster => monster.name);
  const hits = encounter.rounds.flatMap(round =>
    round.log
      .map(message => classifyIncomingHit(message, encounter.startPlayerName, enemyNames))
      .filter(Boolean)
      .map(hit => ({
      ...hit,
      round: round.round,
      hpBefore: round.hpBefore,
      maxHp: round.maxHp,
      rawMaxHp: round.rawMaxHp
    }))
  );
  const damageDealt = Math.max(0, startEnemy.hp - endEnemy.hp);
  const offenseTurns = encounter.rounds.filter(round =>
    round.action === "fight" ||
    (round.action === "spell" && round.spellName !== "DIOS")
  ).length;
  return {
    attempt: attemptIndex + 1,
    result: encounter.result,
    rounds: encounter.rounds.length,
    build: encounter.startBuild || battle.firstBuild,
    startHp: encounter.startHp,
    startMaxHp: encounter.startMaxHp,
    startMp: encounter.startMp,
    endHp: encounter.endHp,
    endMp: encounter.endMp,
    startHealPotions: encounter.startHealPotions,
    endHealPotions: encounter.endHealPotions,
    startStatusCures: countStatusCures(encounter.startStatusCures),
    endStatusCures: countStatusCures(encounter.endStatusCures),
    enemyStartHp: startEnemy.hp,
    enemyMaxHp: startEnemy.maxHp,
    enemyEndHp: endEnemy.hp,
    enemyDamage: damageDealt,
    enemyDamageRate: startEnemy.maxHp ? damageDealt / startEnemy.maxHp : 0,
    damagePerTurn: encounter.rounds.length ? damageDealt / encounter.rounds.length : 0,
    damagePerOffenseTurn: offenseTurns ? damageDealt / offenseTurns : 0,
    offenseTurns,
    actionCounts: encounter.rounds.reduce((counts, round) => {
      const key = round.spellName || round.itemKey || round.action;
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {}),
    incomingHits: hits,
    guardianActivations: encounter.rounds.reduce(
      (sum, round) => sum + round.log.filter(message => /の守護.*ダメージを和らげた/.test(message)).length,
      0
    ),
    spellGuardActivations: encounter.rounds.reduce(
      (sum, round) => sum + round.log.filter(message => /魔除け.*ダメージを和らげた/.test(message)).length,
      0
    ),
    statusSeen: [...new Set(encounter.rounds.flatMap(round =>
      [round.statusBefore, round.statusAfter].filter(status =>
        status && status !== "ok" && status !== "dead"
      )
    ))]
  };
}

function createRow(task, result) {
  const battles = result.specialBattles.filter(battle =>
    battle.type === "boss" && battle.floor === 5
  );
  const encounters = result.diagnostics.encounters.filter(encounter =>
    encounter.type === "boss" && encounter.floor === 5
  );
  let encounterIndex = 0;
  const b5Battles = battles.map(battle => ({
    finalResult: battle.finalResult,
    attempts: battle.attempts.map((unused, attemptIndex) => {
      const encounter = encounters[encounterIndex++];
      if (!encounter) {
        throw new Error(`B5 encounter diagnostic missing: run=${task.runIndex}`);
      }
      return compactAttempt(encounter, battle, attemptIndex);
    })
  }));
  return {
    conditionId: task.conditionId,
    runIndex: task.runIndex,
    className: task.className,
    reachedFloor: result.reachedFloor,
    outcome: result.outcome,
    survived: result.survived,
    died: result.died,
    bankedMaterials: result.bankedMaterials,
    timeCost: result.timeCost,
    deathEncounterType: result.deathEncounterType,
    equipmentFound: result.equipmentFound,
    supportAffixFoundById: result.supportAffixFoundById,
    firstCoreDepth: result.firstCoreDepth,
    bossFloors: [...new Set(result.specialBattles
      .filter(battle => battle.type === "boss")
      .map(battle => battle.floor))],
    b5Battles
  };
}

export function runB5DiagnosisTask(task, context) {
  resetSimulationRandom(hashSeed(`${context.seed}:${task.runIndex}`));
  const scenario = {
    ...BASE_SCENARIO,
    id: task.conditionId,
    bossPolicy: "engage",
    fleeHpThreshold: 0.35,
    statusCurePolicy: "smart",
    statusCureHpThreshold: 1,
    statusCureMerchantPolicy: "missing",
    bossOverride: task.bossOverride || null,
    forcedBossAffixes: task.forcedBossAffixes || null
  };
  const result = simulateRun({
    className: task.className,
    startFloor: 1,
    targetDepth: 21,
    runIndex: task.runIndex,
    seriesId: "issue-271-b5-boss-diagnosis",
    scoringProfile: context.scoringProfile,
    scenario,
    collectDiagnostics: true
  });
  return createRow(task, result);
}

function mean(values) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function quantile(values, probability) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function formatNumber(value, digits = 2) {
  return value === null || !Number.isFinite(value) ? "NA" : value.toFixed(digits);
}

function formatRate(value) {
  return value === null || !Number.isFinite(value)
    ? "NA"
    : `${(value * 100).toFixed(1)}%`;
}

function flattenAttempts(rows) {
  return rows.flatMap(row => row.b5Battles.flatMap(battle =>
    battle.attempts.map(attempt => ({
      ...attempt,
      finalResult: battle.finalResult,
      className: row.className,
      runIndex: row.runIndex,
      conditionId: row.conditionId
    }))
  ));
}

function flattenEvents(rows) {
  return rows.flatMap(row => row.b5Battles.map(battle => ({
    ...battle,
    className: row.className,
    runIndex: row.runIndex,
    conditionId: row.conditionId,
    build: battle.attempts[0]?.build || null
  })));
}

function summarizeResources(attempts, result) {
  const selected = attempts.filter(attempt => attempt.result === result);
  const exhausted = key => mean(selected.map(attempt => Number(attempt[key] === 0)));
  return {
    n: selected.length,
    startHeal: mean(selected.map(attempt => attempt.startHealPotions)),
    endHeal: mean(selected.map(attempt => attempt.endHealPotions)),
    healExhausted: exhausted("endHealPotions"),
    startMp: mean(selected.map(attempt => attempt.startMp)),
    endMp: mean(selected.map(attempt => attempt.endMp)),
    mpExhausted: exhausted("endMp"),
    startCures: mean(selected.map(attempt => attempt.startStatusCures)),
    endCures: mean(selected.map(attempt => attempt.endStatusCures)),
    curesExhausted: exhausted("endStatusCures")
  };
}

function summarizeCondition(rows) {
  const attempts = flattenAttempts(rows);
  const events = flattenEvents(rows);
  const byResult = Object.fromEntries(["death", "flee", "victory"].map(result => {
    const selected = attempts.filter(attempt => attempt.result === result);
    return [result, {
      n: selected.length,
      rate: attempts.length ? selected.length / attempts.length : 0,
      roundsMean: mean(selected.map(attempt => attempt.rounds)),
      roundsP50: quantile(selected.map(attempt => attempt.rounds), 0.5),
      roundsP90: quantile(selected.map(attempt => attempt.rounds), 0.9),
      enemyDamageRateMean: mean(selected.map(attempt => attempt.enemyDamageRate)),
      damagePerTurn: mean(selected.map(attempt => attempt.damagePerTurn)),
      damagePerOffenseTurn: mean(selected.map(attempt => attempt.damagePerOffenseTurn))
    }];
  }));
  const hits = attempts.flatMap(attempt => attempt.incomingHits);
  const hitTypes = Object.fromEntries(["physical", "LAHALITO", "other-spell", "poison"].map(type => {
    const selected = hits.filter(hit => hit.type === type);
    return [type, {
      n: selected.length,
      share: hits.length ? selected.length / hits.length : 0,
      damageShare: hits.length
        ? selected.reduce((sum, hit) => sum + hit.damage, 0) /
          hits.reduce((sum, hit) => sum + hit.damage, 0)
        : 0,
      mean: mean(selected.map(hit => hit.damage)),
      p10: quantile(selected.map(hit => hit.damage), 0.1),
      p50: quantile(selected.map(hit => hit.damage), 0.5),
      p90: quantile(selected.map(hit => hit.damage), 0.9),
      maxHpRateMean: mean(selected.map(hit => hit.damage / hit.maxHp))
    }];
  }));
  const allDamagePerTurn = mean(attempts.map(attempt => attempt.damagePerTurn));
  return {
    runs: rows.length,
    events: events.length,
    attempts: attempts.length,
    eventVictoryRate: mean(events.map(event => Number(event.finalResult === "victory"))),
    eventRetreatRate: mean(events.map(event => Number(event.finalResult === "flee-retreat"))),
    eventDeathRate: mean(events.map(event =>
      Number(["death", "stalemate"].includes(event.finalResult))
    )),
    byResult,
    hitTypes,
    overallDamagePerTurn: allDamagePerTurn,
    overallDamagePerOffenseTurn: mean(attempts.map(attempt => attempt.damagePerOffenseTurn)),
    theoreticalTurns: allDamagePerTurn ? 230 / allDamagePerTurn : null,
    resources: Object.fromEntries(["death", "flee", "victory"].map(result =>
      [result, summarizeResources(attempts, result)]
    )),
    statusAttemptRate: mean(attempts.map(attempt => Number(attempt.statusSeen.length > 0))),
    guardianActivations: attempts.reduce((sum, attempt) => sum + attempt.guardianActivations, 0),
    spellGuardActivations: attempts.reduce((sum, attempt) => sum + attempt.spellGuardActivations, 0)
  };
}

function classAdjustedDifference(events, selector, predicate) {
  const differences = [];
  SIM_CLASSES.forEach(className => {
    const classEvents = events.filter(event => event.className === className);
    const present = classEvents.filter(predicate).map(selector);
    const absent = classEvents.filter(event => !predicate(event)).map(selector);
    if (present.length && absent.length) {
      differences.push({
        className,
        presentN: present.length,
        absentN: absent.length,
        difference: mean(present) - mean(absent)
      });
    }
  });
  const weighted = differences.reduce(
    (sum, item) => sum + item.difference * Math.min(item.presentN, item.absentN),
    0
  );
  const weight = differences.reduce(
    (sum, item) => sum + Math.min(item.presentN, item.absentN),
    0
  );
  return { difference: weight ? weighted / weight : null, classes: differences };
}

function buildFactorSummary(rows) {
  const events = flattenEvents(rows).filter(event =>
    ["victory", "death", "stalemate"].includes(event.finalResult) && event.build
  );
  const winners = events.filter(event => event.finalResult === "victory");
  const losers = events.filter(event => event.finalResult !== "victory");
  const metrics = ["level", "maxHp", "atk", "def", "equipmentStatScore", "combatBuildScore"];
  const continuous = metrics.map(key => ({
    key,
    winMean: mean(winners.map(event => event.build[key])),
    lossMean: mean(losers.map(event => event.build[key])),
    classAdjusted: classAdjustedDifference(
      events,
      event => event.build[key],
      event => event.finalResult === "victory"
    ).difference
  }));
  const affixKeys = ["guardian", "spellGuard", "poisonWard", "statusResistance", "antiDemon"];
  const affixes = affixKeys.map(key => {
    const has = event => (event.build.effectiveAffixes?.[key] || 0) > 0;
    const present = events.filter(has);
    const absent = events.filter(event => !has(event));
    const effect = classAdjustedDifference(
      events,
      event => Number(event.finalResult === "victory"),
      has
    );
    return {
      key,
      presentN: present.length,
      acquisitionRate: events.length ? present.length / events.length : 0,
      valueMean: mean(present.map(event => event.build.effectiveAffixes[key])),
      winRatePresent: mean(present.map(event => Number(event.finalResult === "victory"))),
      winRateAbsent: mean(absent.map(event => Number(event.finalResult === "victory"))),
      classAdjustedWinDifference: effect.difference
    };
  });
  const cores = new Map();
  events.forEach(event => {
    event.build.coreIds.forEach(coreId => {
      if (!cores.has(coreId)) cores.set(coreId, []);
      cores.get(coreId).push(event);
    });
  });
  const coreRows = [...cores.entries()].map(([coreId, selected]) => ({
    coreId,
    n: selected.length,
    winRate: mean(selected.map(event => Number(event.finalResult === "victory")))
  })).sort((left, right) => right.n - left.n);
  const classes = SIM_CLASSES.map(className => {
    const selected = events.filter(event => event.className === className);
    return {
      className,
      n: selected.length,
      winRate: mean(selected.map(event => Number(event.finalResult === "victory"))),
      winBuild: Object.fromEntries(metrics.map(key => [
        key,
        mean(selected.filter(event => event.finalResult === "victory").map(event => event.build[key]))
      ])),
      lossBuild: Object.fromEntries(metrics.map(key => [
        key,
        mean(selected.filter(event => event.finalResult !== "victory").map(event => event.build[key]))
      ]))
    };
  });
  const sorted = [...events].sort(
    (left, right) => left.build.equipmentStatScore - right.build.equipmentStatScore
  );
  const quartiles = Array.from({ length: 4 }, (_, index) => {
    const start = Math.floor(sorted.length * index / 4);
    const end = Math.floor(sorted.length * (index + 1) / 4);
    const selected = sorted.slice(start, end);
    return {
      quartile: index + 1,
      n: selected.length,
      scoreMean: mean(selected.map(event => event.build.equipmentStatScore)),
      winRate: mean(selected.map(event => Number(event.finalResult === "victory")))
    };
  });
  return { events: events.length, continuous, affixes, cores: coreRows, classes, quartiles };
}

function emitFactory({ reset = false } = {}) {
  if (reset) fs.writeFileSync(RAW_PATH, "");
  return (line = "") => {
    console.log(line);
    fs.appendFileSync(RAW_PATH, `${line}\n`);
  };
}

function appendProgress(phase, payload) {
  fs.appendFileSync(
    PROGRESS_PATH,
    `${JSON.stringify({ at: new Date().toISOString(), phase, ...payload })}\n`
  );
}

async function runCondition(condition, scoringProfile, emit) {
  const allRows = [];
  for (let offset = 0; offset < condition.runs; offset += BATCH_SIZE) {
    const count = Math.min(BATCH_SIZE, condition.runs - offset);
    const tasks = Array.from({ length: count }, (_, index) => {
      const runIndex = offset + index;
      return {
        ...condition,
        conditionId: condition.id,
        runIndex,
        className: SIM_CLASSES[runIndex % SIM_CLASSES.length]
      };
    });
    const batch = await runSimTasks({
      moduleUrl: import.meta.url,
      exportName: "runB5DiagnosisTask",
      runTask: runB5DiagnosisTask,
      tasks,
      context: { seed: SEED, scoringProfile }
    });
    allRows.push(...batch);
    fs.appendFileSync(
      ROWS_PATH,
      `${batch.map(row => JSON.stringify(row)).join("\n")}\n`
    );
    const batchEvents = flattenEvents(batch).length;
    appendProgress(`${MODE}-batch`, {
      condition: condition.id,
      completedRuns: offset + count,
      totalRuns: condition.runs,
      batchEvents
    });
    emit(
      `${condition.label}: ${offset + count}/${condition.runs} run完了, ` +
      `batch B5 event=${batchEvents}`
    );
  }
  return allRows;
}

function writeBaselineReport(rows, summary, factors, emit) {
  const lines = [
    "# フェーズ1: B5ボス敗因分解",
    "",
    `- run N=${summary.runs}、B5 event N=${summary.events}、attempt N=${summary.attempts}`,
    `- 試行: 勝利 ${formatRate(summary.byResult.victory.rate)} / 逃走 ${formatRate(summary.byResult.flee.rate)} / 敗北 ${formatRate(summary.byResult.death.rate)}`,
    `- event最終: 勝利 ${formatRate(summary.eventVictoryRate)} / 逃走撤退 ${formatRate(summary.eventRetreatRate)} / 敗北 ${formatRate(summary.eventDeathRate)}`,
    `- 敗北: ${formatNumber(summary.byResult.death.roundsMean)} turn、敵HP削減 ${formatRate(summary.byResult.death.enemyDamageRateMean)}`,
    `- 勝利: ${formatNumber(summary.byResult.victory.roundsMean)} turn`,
    `- 実効与damage: ${formatNumber(summary.overallDamagePerTurn)}/combat turn、${formatNumber(summary.overallDamagePerOffenseTurn)}/offense turn。HP230理論 ${formatNumber(summary.theoreticalTurns)} turn`,
    `- physical: ${summary.hitTypes.physical.n} hit、damage share ${formatRate(summary.hitTypes.physical.damageShare)}、平均 ${formatNumber(summary.hitTypes.physical.mean)}、p10/p50/p90=${formatNumber(summary.hitTypes.physical.p10)}/${formatNumber(summary.hitTypes.physical.p50)}/${formatNumber(summary.hitTypes.physical.p90)}`,
    `- LAHALITO: ${summary.hitTypes.LAHALITO.n} hit、damage share ${formatRate(summary.hitTypes.LAHALITO.damageShare)}、平均 ${formatNumber(summary.hitTypes.LAHALITO.mean)}、p10/p50/p90=${formatNumber(summary.hitTypes.LAHALITO.p10)}/${formatNumber(summary.hitTypes.LAHALITO.p50)}/${formatNumber(summary.hitTypes.LAHALITO.p90)}`,
    `- 状態異常発生attempt ${formatRate(summary.statusAttemptRate)}`,
    ""
  ];
  for (const result of ["death", "flee", "victory"]) {
    const resource = summary.resources[result];
    lines.push(
      `- ${result} resource N=${resource.n}: 傷薬 ${formatNumber(resource.startHeal)}→${formatNumber(resource.endHeal)}（枯渇 ${formatRate(resource.healExhausted)}）、` +
      `MP ${formatNumber(resource.startMp)}→${formatNumber(resource.endMp)}（枯渇 ${formatRate(resource.mpExhausted)}）、` +
      `状態薬 ${formatNumber(resource.startCures)}→${formatNumber(resource.endCures)}（枯渇 ${formatRate(resource.curesExhausted)}）`
    );
  }
  lines.push("", "## 勝敗要因（勝利−敗北、職内調整）", "");
  factors.continuous.forEach(metric => {
    lines.push(
      `- ${metric.key}: 勝利 ${formatNumber(metric.winMean)} / 敗北 ${formatNumber(metric.lossMean)} / 職内差 ${formatNumber(metric.classAdjusted)}`
    );
  });
  lines.push("", "## 装備素点 quartile", "");
  factors.quartiles.forEach(item => {
    lines.push(
      `- Q${item.quartile}: N=${item.n}、score ${formatNumber(item.scoreMean)}、勝率 ${formatRate(item.winRate)}`
    );
  });
  fs.writeFileSync(PHASE1_PATH, `${lines.join("\n")}\n`);

  const phase2 = [
    "# フェーズ2: resistance / antiDemon",
    "",
    "- 実装式: guardianはHP25%以下のみ物理軽減、spellGuardは呪文へ常時、poisonWard/statusResistanceは状態異常だけ、antiDemonはdemonタグ対象への与damage。",
    "- デーモンガードは状態異常能力なし。poisonWard/statusResistanceの戦闘寄与は0。",
    `- guardian軽減log ${summary.guardianActivations}回、spellGuard軽減log ${summary.spellGuardActivations}回。`,
    "- support cost: guardian=3、spellGuard=3、poisonWard=2、statusResistance=2、antiDemon=3。",
    ""
  ];
  factors.affixes.forEach(item => {
    phase2.push(
      `- ${item.key}: 入手 ${item.presentN}/${factors.events}=${formatRate(item.acquisitionRate)}、` +
      `平均値 ${formatNumber(item.valueMean)}、勝率 有 ${formatRate(item.winRatePresent)} / 無 ${formatRate(item.winRateAbsent)}、` +
      `職内差 ${formatRate(item.classAdjustedWinDifference)}`
    );
  });
  fs.writeFileSync(PHASE2_PATH, `${phase2.join("\n")}\n`);

  emit("\n【フェーズ1: B5敗因分解】");
  lines.slice(2).forEach(emit);
  emit("\n【フェーズ2: resistance / antiDemon】");
  phase2.slice(2).forEach(emit);
  emit("\n【職業別】");
  factors.classes.forEach(item => {
    emit(
      `${item.className}: N=${item.n}, 勝率=${formatRate(item.winRate)}, ` +
      `Lv 勝/敗=${formatNumber(item.winBuild.level)}/${formatNumber(item.lossBuild.level)}, ` +
      `HP=${formatNumber(item.winBuild.maxHp)}/${formatNumber(item.lossBuild.maxHp)}, ` +
      `ATK=${formatNumber(item.winBuild.atk)}/${formatNumber(item.lossBuild.atk)}, ` +
      `DEF=${formatNumber(item.winBuild.def)}/${formatNumber(item.lossBuild.def)}, ` +
      `装備素点=${formatNumber(item.winBuild.equipmentStatScore)}/${formatNumber(item.lossBuild.equipmentStatScore)}`
    );
  });
  emit("\n【core別】");
  factors.cores.forEach(item => {
    emit(`${item.coreId}: N=${item.n}, 勝率=${formatRate(item.winRate)}`);
  });
}

function pairedEventDifference(baselineRows, variantRows) {
  const baseline = new Map(flattenEvents(baselineRows).map(event => [
    `${event.className}:${event.runIndex}`,
    event
  ]));
  const pairs = flattenEvents(variantRows).map(event => ({
    baseline: baseline.get(`${event.className}:${event.runIndex}`),
    variant: event
  })).filter(pair => pair.baseline);
  return {
    n: pairs.length,
    baselineWinRate: mean(pairs.map(pair => Number(pair.baseline.finalResult === "victory"))),
    variantWinRate: mean(pairs.map(pair => Number(pair.variant.finalResult === "victory"))),
    winDifference: mean(pairs.map(pair =>
      Number(pair.variant.finalResult === "victory") -
      Number(pair.baseline.finalResult === "victory")
    )),
    baselineDeathRate: mean(pairs.map(pair =>
      Number(["death", "stalemate"].includes(pair.baseline.finalResult))
    )),
    variantDeathRate: mean(pairs.map(pair =>
      Number(["death", "stalemate"].includes(pair.variant.finalResult))
    ))
  };
}

function writeWhatIfReport(results, emit) {
  const baselineRows = results.get("baseline");
  const lines = [
    "# フェーズ3: what-if（scratch overrideによる試算値）",
    "",
    "- 目安: event勝率20–35%、装備素点上位quartile 40–60%、下位quartile 5–15%。深度でなくbuild選別性を評価。",
    "- overrideはsrc未変更。乱数消費順差があるため、採用値はsrc変更後に再測定必須。",
    ""
  ];
  WHAT_IF_CONDITIONS.forEach(condition => {
    const rows = results.get(condition.id);
    const summary = summarizeCondition(rows);
    const paired = pairedEventDifference(baselineRows, rows);
    lines.push(
      `- ${condition.label}: B5 event N=${summary.events}、event勝率 ${formatRate(summary.eventVictoryRate)}、` +
      `敗北 ${formatRate(summary.eventDeathRate)}。paired N=${paired.n}、` +
      `勝率 ${formatRate(paired.baselineWinRate)}→${formatRate(paired.variantWinRate)}（差 ${formatRate(paired.winDifference)}）`
    );
  });
  fs.writeFileSync(PHASE3_PATH, `${lines.join("\n")}\n`);
  emit("\n【フェーズ3: what-if】");
  lines.slice(2).forEach(emit);
}

async function main() {
  if (!["baseline", "whatif"].includes(MODE)) {
    throw new Error(`B5_MODE must be baseline or whatif: ${MODE}`);
  }
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  if (MODE === "baseline") {
    fs.writeFileSync(PROGRESS_PATH, "");
  }
  const emit = emitFactory({ reset: MODE === "baseline" });
  emit(`Issue #271 B5ボス敗因分解 mode=${MODE}`);
  emit(
    `seed=${SEED}, SIM_PARALLEL=${process.env.SIM_PARALLEL || "default"}, ` +
    `calibration N=${CALIBRATION_RUNS}, batch=${BATCH_SIZE}`
  );
  emit(
    "経路: generateRunFloor=各到達floor1回、generateEncounter=各試行1回、" +
    "runCombatRoundCalculation=各turn1回、applyCombatRewards=勝利round内部1回のみ。"
  );
  emit(
    "モデル: 実grid bossセル、実装備/消耗品/状態薬/確定逃走+追撃+再挑戦、" +
    "実combat round/outcome reward。非モデル: 人間の予兆防御判断、宝箱罠実被害、任意寄り道。"
  );

  resetSimulationRandom(SEED);
  const scoringProfile = calibrateCoreScoringProfile(CALIBRATION_RUNS, {
    statusCurePolicy: "smart",
    statusCureHpThreshold: 1,
    statusCureMerchantPolicy: "missing",
    bossPolicy: "engage"
  });
  appendProgress(`${MODE}-calibration-complete`, {
    runs: CALIBRATION_RUNS,
    seed: SEED
  });
  const requestedConditionIds = new Set(
    String(process.env.B5_WHAT_IF_FILTER || "")
      .split(",")
      .map(value => value.trim())
      .filter(Boolean)
  );
  if (MODE === "baseline" || requestedConditionIds.size === 0) {
    fs.writeFileSync(ROWS_PATH, "");
  }

  if (MODE === "baseline") {
    const rows = await runCondition(BASELINE, scoringProfile, emit);
    const summary = summarizeCondition(rows);
    const factors = buildFactorSummary(rows);
    writeBaselineReport(rows, summary, factors, emit);
    appendProgress("phase1-complete", { summary });
    appendProgress("phase2-complete", { factors });
    emit(`生行データ: ${path.relative(path.join(SCRIPT_DIR, ".."), ROWS_PATH)}`);
    emit(`生出力: ${path.relative(path.join(SCRIPT_DIR, ".."), RAW_PATH)}`);
    return;
  }

  const baselinePath = path.join(RESULTS_DIR, `${PREFIX}-baseline-rows.jsonl`);
  if (!fs.existsSync(baselinePath)) {
    throw new Error(`baseline rows missing: ${baselinePath}`);
  }
  const baselineRows = fs.readFileSync(baselinePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map(line => JSON.parse(line))
    .filter(row => row.runIndex < WHAT_IF_RUNS);
  const existingWhatIfRows = fs.existsSync(ROWS_PATH)
    ? fs.readFileSync(ROWS_PATH, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line))
    : [];
  const results = new Map([["baseline", baselineRows]]);
  WHAT_IF_CONDITIONS.forEach(condition => {
    const existing = existingWhatIfRows.filter(row => row.conditionId === condition.id);
    if (existing.length) results.set(condition.id, existing);
  });
  const selectedConditions = requestedConditionIds.size
    ? WHAT_IF_CONDITIONS.filter(condition => requestedConditionIds.has(condition.id))
    : WHAT_IF_CONDITIONS;
  if (requestedConditionIds.size) {
    const retainedRows = existingWhatIfRows.filter(
      row => !requestedConditionIds.has(row.conditionId)
    );
    fs.writeFileSync(
      ROWS_PATH,
      retainedRows.length
        ? `${retainedRows.map(row => JSON.stringify(row)).join("\n")}\n`
        : ""
    );
  }
  for (const condition of selectedConditions) {
    const rows = await runCondition(condition, scoringProfile, emit);
    results.set(condition.id, rows);
    appendProgress("whatif-condition-complete", {
      condition: condition.id,
      summary: summarizeCondition(rows)
    });
  }
  const missingConditions = WHAT_IF_CONDITIONS.filter(condition => !results.has(condition.id));
  if (missingConditions.length) {
    throw new Error(`what-if rows missing: ${missingConditions.map(condition => condition.id).join(",")}`);
  }
  writeWhatIfReport(results, emit);
  appendProgress("phase3-complete", {
    conditions: WHAT_IF_CONDITIONS.map(condition => condition.id)
  });
  emit(`生出力: ${path.relative(path.join(SCRIPT_DIR, ".."), RAW_PATH)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
