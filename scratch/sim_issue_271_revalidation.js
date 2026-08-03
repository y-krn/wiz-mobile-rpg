// sim-scope: run
/* global console, process */

import { isMainThread } from "node:worker_threads";
import { runSimTasks } from "./sim_parallel.js";

// Issue #264/#271 と同じ測定条件を、未指定時の既定値として固定する。
process.env.SIM_SEED ||= "271";
process.env.SIM_RUNS ||= "2000";
process.env.SIM_CALIBRATION_RUNS ||= "1000";
process.env.DEPARTURE_CRAFT_IDS ||= [
  "TOWN_PORTAL",
  "HEAL_POTION",
  "HEAL_POTION",
  "HEAL_POTION",
  "HEAL_POTION",
  "ANTIDOTE",
  "GUARD_POTION"
].join(",");
process.env.TRAP_POLICY ||= "conservative";
process.env.TRAP_AVOIDANCE_POLICY ||= "ev";
process.env.TRAP_DAMAGE_MULTIPLIER ||= "1";
process.env.IDENTIFICATION_POLICY ||= "legacy";
process.env.STATUS_CURE_POLICY ||= "smart";
process.env.STATUS_CURE_HP_THRESHOLD ||= "0.35";
process.env.STATUS_CURE_MERCHANT_POLICY ||= "missing";
process.env.FLEE_HP_THRESHOLD ||= "0.35";
process.env.PORTAL_HP_THRESHOLD ||= "0.35";
process.env.PORTAL_MAX_HEAL_POTIONS ||= "0";
process.env.PORTAL_MIN_FLOOR ||= "3";
process.env.ELITE_POLICY ||= "avoid";

const RUNS = Math.max(1, Number(process.env.SIM_RUNS));
const CALIBRATION_RUNS = Math.max(1, Number(process.env.SIM_CALIBRATION_RUNS));
const SEED = Number(process.env.SIM_SEED) >>> 0;
const RAW_SCENARIO_IDS = String(
  process.env.SIM_SCENARIOS || "workshop-complete,workshop-empty"
)
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);
const SCENARIO_ALIASES = Object.freeze({
  "workshop-unlocked": "workshop-empty",
  "workshop-locked": "workshop-empty-no-portal"
});
const SCENARIO_IDS = [...new Set(
  RAW_SCENARIO_IDS.map(id => SCENARIO_ALIASES[id] || id)
)];
process.env.SIM_SCENARIOS = SCENARIO_IDS.join(",");

const FLEE_POLICY = process.env.FLEE_POLICY === "never" ? "never" : "threshold";
const FLEE_HP_THRESHOLD = FLEE_POLICY === "never"
  ? null
  : Math.max(0, Math.min(1, Number(process.env.FLEE_HP_THRESHOLD)));
const bossOverrideFloor = Number(process.env.BOSS_OVERRIDE_FLOOR);
const BOSS_OVERRIDE = Number.isFinite(bossOverrideFloor) && bossOverrideFloor >= 1
  ? {
      floor: Math.floor(bossOverrideFloor),
      ...(Number.isFinite(Number(process.env.BOSS_HP_MULTIPLIER))
        ? { hpMultiplier: Number(process.env.BOSS_HP_MULTIPLIER) }
        : {}),
      ...(Number.isFinite(Number(process.env.BOSS_ATK_MULTIPLIER))
        ? { atkMultiplier: Number(process.env.BOSS_ATK_MULTIPLIER) }
        : {}),
      ...(process.env.BOSS_DISABLE_SPELL === "1" ? { disableSpell: true } : {})
    }
  : null;
const SCENARIO_PATCH = Object.freeze({
  trapPolicy: process.env.TRAP_POLICY,
  trapAvoidancePolicy: process.env.TRAP_AVOIDANCE_POLICY,
  identificationPolicy: "legacy",
  fleeHpThreshold: FLEE_HP_THRESHOLD,
  statusCurePolicy: process.env.STATUS_CURE_POLICY,
  statusCureHpThreshold: Math.max(
    0,
    Math.min(1, Number(process.env.STATUS_CURE_HP_THRESHOLD))
  ),
  statusCureMerchantPolicy: process.env.STATUS_CURE_MERCHANT_POLICY,
  elitePolicy: process.env.ELITE_POLICY,
  bossOverride: BOSS_OVERRIDE
});

const { BANKING_RATES } = await import("../src/rules/material_rules.js");
const {
  DEPTH_SCENARIOS,
  SIM_CLASSES,
  calibrateCoreScoringProfile,
  resetSimulationRandom,
  simulateRun
} = await import("./sim_depth_material_ev.js");
const { CORE_AFFIXES } = await import("../src/data/affixes.js");

const SCENARIOS = new Map(DEPTH_SCENARIOS.map(scenario => [scenario.id, scenario]));
SCENARIO_IDS.forEach(id => {
  if (!SCENARIOS.has(id)) throw new Error(`unknown scenario: ${id}`);
});

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
const ENABLED_CORE_COUNT = CORE_AFFIXES.filter(core => core.enabled).length;
const TOTAL_CORE_COUNT = CORE_AFFIXES.length;
const COMBAT_CORE_IDS = new Set(
  CORE_AFFIXES
    .filter(core => core.enabled && core.poolGroup === "combat")
    .map(core => core.id)
);

function hashSeed(text) {
  let seed = 2166136261;
  for (let index = 0; index < text.length; index++) {
    seed ^= text.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
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

function rate(count, denominator) {
  return denominator > 0 ? count / denominator : null;
}

function wilson95(successes, trials) {
  if (trials <= 0) return null;
  const z = 1.96;
  const p = successes / trials;
  const denominator = 1 + (z * z) / trials;
  const center = (p + (z * z) / (2 * trials)) / denominator;
  const halfWidth = z * Math.sqrt(
    (p * (1 - p)) / trials + (z * z) / (4 * trials * trials)
  ) / denominator;
  return [Math.max(0, center - halfWidth), Math.min(1, center + halfWidth)];
}

function formatInterval(interval) {
  return interval ? `[${formatRate(interval[0])},${formatRate(interval[1])}]` : "NA";
}

function formatCounts(counts, denominator = null) {
  return Object.entries(counts)
    .map(([key, count]) => `${key}=${count}${denominator ? `(${formatRate(rate(count, denominator))})` : ""}`)
    .join(" ");
}

function compactSnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    floor: snapshot.floor,
    level: snapshot.level,
    equipmentStatScore: snapshot.equipmentStatScore,
    combatCoreScore: snapshot.combatCoreScore,
    combatBuildScore: snapshot.combatBuildScore,
    coreIds: [...(snapshot.coreIds || [])],
    supportAffixes: { ...(snapshot.supportAffixes || {}) },
    effectiveAffixes: { ...(snapshot.effectiveAffixes || {}) },
    resistanceScore: snapshot.resistanceScore || 0
  };
}

function getSnapshot(result, floor) {
  return compactSnapshot(
    result.diagnostics?.buildSnapshots?.find(
      snapshot => snapshot.floor === floor && snapshot.point === "floor-start"
    ) || null
  );
}

function getLastEncounter(result) {
  return result.diagnostics?.encounters?.at(-1) || null;
}

function classifyDeath(result) {
  if (!result.died) return null;
  const deathLog = result.diagnostics?.deathLogs?.at(-1) || null;
  const encounter = getLastEncounter(result);
  const round = encounter?.rounds?.at(-1) || null;
  const cause = deathLog?.cause || (result.stalemate ? "50ターン上限" : "不明");
  const joined = (round?.log || []).join("\n");
  const encounterType = result.deathEncounterType || encounter?.type || "normal";
  let source = ["trap", "normal", "elite", "boss", "other"].includes(result.fatalSource)
    ? result.fatalSource
    : "other";
  if (encounterType === "floor-trap" || encounterType === "chest-trap") source = "trap";

  // #271 の死に方軸。boss はここに混ぜず、source 軸との joint で分解する。
  let mechanism = "normal-cumulative";
  if (source === "trap") {
    mechanism = "trap";
  } else if (result.stalemate) {
    mechanism = "resource";
  } else if (cause.includes("逃走追撃")) {
    mechanism = "flee-retaliation";
  } else if (
    cause.includes("毒のダメージ") ||
    ["sleep", "paralyze", "paralyzed", "blind", "poisoned"].includes(round?.statusBefore)
  ) {
    mechanism = "status";
  } else if (source === "elite") {
    mechanism = "elite";
  } else if (
    /狙撃|反射|ハリト|ラハリト|マダルト|ティルトウェイト|魔術|ブレス|自爆|破滅の波動/.test(
      `${cause}\n${joined}`
    )
  ) {
    mechanism = "special";
  }
  const rawFloor = Number(deathLog?.floor || result.terminationFloor || result.reachedFloor || 1);
  return {
    floor: Math.max(1, Math.min(20, rawFloor)),
    cause,
    source,
    mechanism,
    encounterType,
    statusBefore: round?.statusBefore || null
  };
}

function compactRow(task, result) {
  const death = classifyDeath(result);
  return {
    scenarioId: task.scenarioId,
    runIndex: task.runIndex,
    className: task.className,
    outcome: result.outcome,
    died: result.died,
    survived: result.survived,
    depth: Math.min(20, result.reachedFloor),
    terminationFloor: Math.min(20, Number(result.terminationFloor || result.reachedFloor)),
    terminationReason: result.terminationReason,
    fleeCount: result.fleeCount,
    fatalSource: result.fatalSource,
    death,
    b5: getSnapshot(result, 5),
    b10: getSnapshot(result, 10),
    floorMaterialSnapshots: result.floorMaterialSnapshots,
    statusCureItemsAcquired: result.statusCureItemsAcquired,
    statusCureItemsUsed: result.statusCureItemsUsed,
    statusCureDecisions: result.statusCureDecisions,
    finalStatusCureInventory: result.finalStatusCureInventory,
    specialCellsDetected: result.specialCellsDetected
  };
}

export function runRevalidationTask(task, context) {
  const scenarioBase = SCENARIOS.get(task.scenarioId);
  const scenario = {
    ...scenarioBase,
    ...context.scenarioPatch,
    id: task.scenarioId,
    identificationPolicy: "legacy"
  };
  resetSimulationRandom(hashSeed(`${context.seed}:${task.scenarioId}:${task.runIndex}`));
  const result = simulateRun({
    className: task.className,
    startFloor: 1,
    targetDepth: 21,
    runIndex: task.runIndex,
    seriesId: "issue271-revalidation",
    scoringProfile: context.scoringProfiles[task.scenarioId],
    scenario,
    workshop: scenario.workshop,
    collectDiagnostics: true
  });
  return compactRow(task, result);
}

function createTasks() {
  return SCENARIO_IDS.flatMap(scenarioId =>
    Array.from({ length: RUNS }, (_, runIndex) => ({
      scenarioId,
      runIndex,
      className: SIM_CLASSES[runIndex % SIM_CLASSES.length]
    }))
  );
}

function countBy(rows, selector, keys) {
  const counts = Object.fromEntries(keys.map(key => [key, 0]));
  rows.forEach(row => {
    const key = selector(row);
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

function addNestedCount(target, first, second) {
  target[first] ||= {};
  target[first][second] = (target[first][second] || 0) + 1;
}

function computeHazard(rows) {
  return Array.from({ length: 20 }, (_, index) => index + 1).map(floor => {
    const entrants = rows.filter(row => row.floorMaterialSnapshots?.[floor]);
    const completed = entrants.filter(row =>
      row.floorMaterialSnapshots[floor].completed &&
      Number.isFinite(row.floorMaterialSnapshots[floor].endTotal)
    );
    // Bn へ進む判断の EV は、Bn に到達した同一 run 群で揃える。
    // M は Bn 到着時（= B(n-1) 終了時）の累積素材、ΔM は
    // B(n-1)→Bn の到着時増分。
    // floor end の完走者だけを使うと、翼使用・死亡で母集団が混ざる。
    const decisionRuns = floor === 1
      ? entrants
      : rows.filter(row =>
          row.floorMaterialSnapshots?.[floor] &&
          row.floorMaterialSnapshots?.[floor - 1]
        );
    const deaths = rows.filter(row => row.died && row.death?.floor === floor);
    const hazard = rate(deaths.length, entrants.length);
    const hazardCi = wilson95(deaths.length, entrants.length);
    const m = floor === 1
      ? 0
      : mean(decisionRuns.map(row => row.floorMaterialSnapshots[floor].startTotal));
    const delta = floor === 1
      ? mean(decisionRuns.map(row => row.floorMaterialSnapshots[floor].startTotal))
      : mean(decisionRuns.map(row =>
          row.floorMaterialSnapshots[floor].startTotal -
          row.floorMaterialSnapshots[floor - 1].startTotal
        ));
    const mPlusDelta = m === null || delta === null ? null : m + delta;
    const breakEven = delta === null || mPlusDelta === null || mPlusDelta <= 0
      ? null
      : delta / ((1 - BANKING_RATES.death) * mPlusDelta);
    const gapCi = hazardCi && breakEven !== null
      ? [hazardCi[0] - breakEven, hazardCi[1] - breakEven]
      : null;
    return {
      floor,
      entrants: entrants.length,
      completed: completed.length,
      deaths: deaths.length,
      hazard,
      hazardCi,
      m,
      delta,
      deltaRuns: decisionRuns.length,
      breakEven,
      gap: hazard === null || breakEven === null ? null : hazard - breakEven,
      gapCi
    };
  });
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

function classCenteredCorrelation(rows, valueSelector, outcomeSelector) {
  const usable = rows.filter(row => {
    const value = valueSelector(row);
    const outcome = outcomeSelector(row);
    return Number.isFinite(value) && Number.isFinite(outcome);
  });
  const valuesByClass = new Map();
  const outcomesByClass = new Map();
  SIM_CLASSES.forEach(className => {
    const classRows = usable.filter(row => row.className === className);
    valuesByClass.set(className, mean(classRows.map(valueSelector)) || 0);
    outcomesByClass.set(className, mean(classRows.map(outcomeSelector)) || 0);
  });
  return {
    n: usable.length,
    r: pearson(
      usable.map(row => valueSelector(row) - valuesByClass.get(row.className)),
      usable.map(row => outcomeSelector(row) - outcomesByClass.get(row.className))
    )
  };
}

function binaryEffect(rows, predicate) {
  const withSignal = rows.filter(predicate);
  const withoutSignal = rows.filter(row => !predicate(row));
  const withDepth = withSignal.map(row => row.depth);
  const withoutDepth = withoutSignal.map(row => row.depth);
  const withMean = mean(withDepth);
  const withoutMean = mean(withoutDepth);
  const effect = withMean === null || withoutMean === null
    ? null
    : withMean - withoutMean;
  const standardError = effect === null
    ? null
    : Math.sqrt(
        sampleVariance(withDepth) / Math.max(1, withDepth.length) +
        sampleVariance(withoutDepth) / Math.max(1, withoutDepth.length)
      );
  return {
    withN: withSignal.length,
    withoutN: withoutSignal.length,
    effect,
    ciLow: effect === null ? null : effect - 1.96 * standardError,
    ciHigh: effect === null ? null : effect + 1.96 * standardError
  };
}

function hasMatchedSynergy(snapshot) {
  if (!snapshot) return false;
  return snapshot.coreIds.some(coreId =>
    (CORE_SUPPORT_SYNERGY[coreId] || []).some(
      key => (snapshot.supportAffixes[key] || 0) > 0
    )
  );
}

function summarize(rows) {
  const deaths = rows.filter(row => row.died);
  const sourceKeys = ["trap", "normal", "elite", "boss", "other"];
  const mechanismKeys = [
    "trap",
    "normal-cumulative",
    "elite",
    "status",
    "special",
    "flee-retaliation",
    "resource"
  ];
  const sourceCounts = countBy(deaths, row => row.death?.source || "other", sourceKeys);
  const mechanismCounts = countBy(
    deaths,
    row => row.death?.mechanism || "normal-cumulative",
    mechanismKeys
  );
  const joint = {};
  deaths.forEach(row => addNestedCount(
    joint,
    row.death?.source || "other",
    row.death?.mechanism || "normal-cumulative"
  ));
  const causeCounts = countBy(deaths, row => row.death?.cause || "不明", []);
  const statusUsed = {};
  const statusAcquired = {};
  const statusDecisions = {};
  rows.forEach(row => {
    Object.entries(row.statusCureItemsUsed || {}).forEach(([item, count]) => {
      statusUsed[item] = (statusUsed[item] || 0) + count;
    });
    Object.values(row.statusCureItemsAcquired || {}).forEach(sourceCountsForItem => {
      Object.entries(sourceCountsForItem || {}).forEach(([item, count]) => {
        statusAcquired[item] = (statusAcquired[item] || 0) + count;
      });
    });
    Object.entries(row.statusCureDecisions || {}).forEach(([kind, count]) => {
      statusDecisions[kind] = (statusDecisions[kind] || 0) + count;
    });
  });
  const b5Rows = rows.filter(row => row.b5);
  const b10Rows = rows.filter(row => row.b10);
  const effects = {
    b5Resistance: binaryEffect(b5Rows, row => row.b5.resistanceScore > 0),
    b5Core: binaryEffect(b5Rows, row => row.b5.coreIds.length > 0),
    b5CombatCore: binaryEffect(
      b5Rows,
      row => row.b5.coreIds.some(id => COMBAT_CORE_IDS.has(id))
    ),
    b5Matched: binaryEffect(b5Rows, row => hasMatchedSynergy(row.b5)),
    b5CombatBuild: classCenteredCorrelation(
      b5Rows,
      row => row.b5.combatBuildScore,
      row => row.depth
    ),
    b10Equipment: classCenteredCorrelation(
      b10Rows,
      row => row.b10.equipmentStatScore,
      row => row.depth
    )
  };
  return {
    runs: rows.length,
    deaths: deaths.length,
    survived: rows.length - deaths.length,
    survivalRate: rate(rows.length - deaths.length, rows.length),
    deathRate: rate(deaths.length, rows.length),
    averageDepth: mean(rows.map(row => row.depth)),
    averageFleeRuns: rate(rows.filter(row => row.fleeCount > 0).length, rows.length),
    sourceCounts,
    mechanismCounts,
    joint,
    causeCounts,
    statusUsed,
    statusAcquired,
    statusDecisions,
    effects,
    hazard: computeHazard(rows),
    bossSpecial: joint.boss?.special || 0,
    bossDeaths: sourceCounts.boss || 0,
    deepDeaths: deaths.filter(row => (row.death?.floor || 0) >= 16).length,
    deepSpecial: deaths.filter(row =>
      (row.death?.floor || 0) >= 16 && row.death?.mechanism === "special"
    ).length
  };
}

function printEnvironment() {
  console.log("\n【Issue #271 現行main再検証 env】");
  console.log(JSON.stringify({
    seed: SEED,
    SIM_RUNS: RUNS,
    calibrationRuns: CALIBRATION_RUNS,
    DEPARTURE_CRAFT_IDS: process.env.DEPARTURE_CRAFT_IDS,
    TRAP_POLICY: process.env.TRAP_POLICY,
    TRAP_AVOIDANCE_POLICY: process.env.TRAP_AVOIDANCE_POLICY,
    TRAP_DAMAGE_MULTIPLIER: Number(process.env.TRAP_DAMAGE_MULTIPLIER),
    IDENTIFICATION_POLICY: "legacy",
    SIM_SCENARIOS: SCENARIO_IDS,
    FLEE_POLICY,
    FLEE_HP_THRESHOLD,
    STATUS_CURE_POLICY: process.env.STATUS_CURE_POLICY,
    STATUS_CURE_HP_THRESHOLD: SCENARIO_PATCH.statusCureHpThreshold,
    STATUS_CURE_MERCHANT_POLICY: process.env.STATUS_CURE_MERCHANT_POLICY,
    PORTAL_HP_THRESHOLD: process.env.PORTAL_HP_THRESHOLD,
    PORTAL_MAX_HEAL_POTIONS: process.env.PORTAL_MAX_HEAL_POTIONS,
    PORTAL_MIN_FLOOR: process.env.PORTAL_MIN_FLOOR,
    ELITE_POLICY: process.env.ELITE_POLICY,
    BOSS_OVERRIDE,
    BANKING_RATES,
    source: "generateRunFloor -> simulateRun -> src/rules combat/reward/trap/material functions",
    classes: SIM_CLASSES
  }, null, 2));
  SCENARIO_IDS.forEach(id => {
    const scenario = SCENARIOS.get(id);
    console.log(
      `scenario=${id} label=${scenario.label} ` +
      `workshopRanks=${JSON.stringify(scenario.workshop?.ranks || {})} ` +
      `useTownPortal=${scenario.useTownPortal !== false}`
    );
  });
  RAW_SCENARIO_IDS.forEach(id => {
    if (SCENARIO_ALIASES[id]) {
      console.log(`scenario alias checked: ${id} -> ${SCENARIO_ALIASES[id]}（旧ID名ではなくlabelを採用）`);
    }
  });
  console.log(
    `enabled core=${ENABLED_CORE_COUNT}/${TOTAL_CORE_COUNT}; direct-defense core=0/${TOTAL_CORE_COUNT} ` +
    "（CORE_AFFIXES canonに直接軽減/耐性coreなし）"
  );
}

function printSummary(scenarioId, summary) {
  const deathDenominator = Math.max(1, summary.deaths);
  console.log(`\n【${scenarioId}】N=${summary.runs}`);
  console.log(
    `平均到達=${formatNumber(summary.averageDepth)} 生還率=${formatRate(summary.survivalRate)} ` +
    `死亡率=${formatRate(summary.deathRate)} 逃走run率=${formatRate(summary.averageFleeRuns)}`
  );
  console.log(`death source(#264): ${formatCounts(summary.sourceCounts, deathDenominator)}`);
  console.log(`death mechanism(#271): ${formatCounts(summary.mechanismCounts, deathDenominator)}`);
  console.log("joint source x mechanism:", JSON.stringify(summary.joint));
  const topCauses = Object.entries(summary.causeCounts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8);
  console.log(`cause top: ${topCauses.map(([cause, count]) => `${cause}=${count}`).join(" / ")}`);
  console.log(
    `status cures acquired=${JSON.stringify(summary.statusAcquired)} ` +
    `used=${JSON.stringify(summary.statusUsed)} decisions=${JSON.stringify(summary.statusDecisions)}`
  );
  console.log(
    `boss deaths=${summary.bossDeaths}/${summary.deaths} ` +
    `(${formatRate(rate(summary.bossDeaths, deathDenominator))}), ` +
    `boss classified special=${summary.bossSpecial}/${summary.bossDeaths} ` +
    `(${formatRate(rate(summary.bossSpecial, Math.max(1, summary.bossDeaths)))})`
  );
  console.log(
    `B16-20 deaths=${summary.deepDeaths}, special=${summary.deepSpecial} ` +
    `(${formatRate(rate(summary.deepSpecial, Math.max(1, summary.deepDeaths)))})`
  );
  const effects = summary.effects;
  console.log(
    `quality effects (depth floors): resistance ${formatNumber(effects.b5Resistance.effect)} ` +
    `CI[${formatNumber(effects.b5Resistance.ciLow)},${formatNumber(effects.b5Resistance.ciHigh)}] ` +
    `n=${effects.b5Resistance.withN}/${effects.b5Resistance.withoutN}; ` +
    `core ${formatNumber(effects.b5Core.effect)} ` +
    `CI[${formatNumber(effects.b5Core.ciLow)},${formatNumber(effects.b5Core.ciHigh)}]; ` +
    `matched ${formatNumber(effects.b5Matched.effect)} ` +
    `CI[${formatNumber(effects.b5Matched.ciLow)},${formatNumber(effects.b5Matched.ciHigh)}]`
  );
  console.log(
    `quality correlations (class-centered): B5 combatBuild r=${formatNumber(effects.b5CombatBuild.r, 3)} ` +
    `n=${effects.b5CombatBuild.n}; B10 equipmentStat r=${formatNumber(effects.b10Equipment.r, 3)} ` +
    `n=${effects.b10Equipment.n}`
  );
  console.log("B1-B20 hazard vs break-even:");
  summary.hazard.forEach(row => {
    console.log(
      `B${row.floor} entrants=${row.entrants} completed=${row.completed} deaths=${row.deaths} ` +
      `d=${formatRate(row.hazard)} CI=${formatInterval(row.hazardCi)} ` +
      `BE=${formatRate(row.breakEven)} gap=${formatRate(row.gap)} ` +
      `gapCI=${formatInterval(row.gapCi)} M=${formatNumber(row.m)} ` +
      `ΔM=${formatNumber(row.delta)} ΔN=${row.deltaRuns}`
    );
  });
}

async function main() {
  printEnvironment();
  const scoringProfiles = Object.fromEntries(SCENARIO_IDS.map(scenarioId => {
    const scenario = SCENARIOS.get(scenarioId);
    resetSimulationRandom(SEED);
    const profile = calibrateCoreScoringProfile(
      CALIBRATION_RUNS,
      { ...scenario, ...SCENARIO_PATCH, identificationPolicy: "legacy" },
      "legacy",
      scenario.workshop
    );
    resetSimulationRandom(SEED);
    return [scenarioId, profile];
  }));
  const rows = await runSimTasks({
    moduleUrl: import.meta.url,
    exportName: "runRevalidationTask",
    runTask: runRevalidationTask,
    tasks: createTasks(),
    context: {
      seed: SEED,
      scenarioPatch: SCENARIO_PATCH,
      scoringProfiles
    }
  });
  SCENARIO_IDS.forEach(scenarioId => {
    printSummary(scenarioId, summarize(rows.filter(row => row.scenarioId === scenarioId)));
  });
}

if (isMainThread && process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  await main();
}
