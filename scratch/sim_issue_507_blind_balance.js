// sim-scope: run
// Issue #507: blind coverage, impact, and A/B/C comparison.

/* global console, process */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { performance } from "node:perf_hooks";
import { isMainThread } from "node:worker_threads";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveSimParallelism, runSimTasks } from "./sim_parallel.js";

const VARIANT = String(process.env.SIM_VARIANT || "baseline").trim();
const VARIANTS = new Set(["baseline", "a-miss-only", "b-battle-end", "c-kit"]);
if (!VARIANTS.has(VARIANT)) {
  throw new Error(`SIM_VARIANT must be ${[...VARIANTS].join("|")}: ${VARIANT}`);
}

const SCENARIO_WEIGHTS = Object.freeze([
  ["workshop-empty", 30],
  ["workshop-stats", 74],
  ["workshop-gear", 69],
  ["workshop-blood-wand", 216],
  ["workshop-blood-wand-spells", 47],
  ["workshop-complete", 764]
]);
const SCENARIO_SEQUENCE = Object.freeze(
  SCENARIO_WEIGHTS.flatMap(([scenarioId, count]) => Array(count).fill(scenarioId))
);
const SCENARIO_IDS = Object.freeze(SCENARIO_WEIGHTS.map(([scenarioId]) => scenarioId));
const BASIC_CLASSES = Object.freeze(["Fighter", "Thief", "Priest", "Mage"]);
const FLOORS = Object.freeze([5, 10]);
const R95 = 1.959963984540054;
const MIN_GROUP_N = 30;

const KIT_BY_VARIANT = Object.freeze({
  baseline: [
    "TOWN_PORTAL", "HEAL_POTION", "HEAL_POTION", "HEAL_POTION",
    "HEAL_POTION", "ANTIDOTE", "GUARD_POTION"
  ],
  "a-miss-only": [
    "TOWN_PORTAL", "HEAL_POTION", "HEAL_POTION", "HEAL_POTION",
    "HEAL_POTION", "ANTIDOTE", "GUARD_POTION"
  ],
  "b-battle-end": [
    "TOWN_PORTAL", "HEAL_POTION", "HEAL_POTION", "HEAL_POTION",
    "HEAL_POTION", "ANTIDOTE", "GUARD_POTION"
  ],
  "c-kit": [
    "TOWN_PORTAL", "HEAL_POTION", "HEAL_POTION", "HEAL_POTION",
    "ANTIDOTE", "GUARD_POTION", "EYE_DROPS"
  ]
});

const ENV_DEFAULTS = Object.freeze({
  SIM_SEED: "507",
  SIM_RUNS: "500",
  SIM_CALIBRATION_RUNS: "1000",
  DEPARTURE_CRAFT_IDS: KIT_BY_VARIANT[VARIANT].join(","),
  TRAP_POLICY: "conservative",
  TRAP_AVOIDANCE_POLICY: "ev",
  TRAP_DAMAGE_MULTIPLIER: "1",
  IDENTIFICATION_POLICY: "powder",
  IDENTIFICATION_STARTING_POWDER: "2",
  IDENTIFICATION_COST_OVERRIDE: "1",
  STATUS_CURE_POLICY: "smart",
  STATUS_CURE_HP_THRESHOLD: "0.35",
  STATUS_CURE_MERCHANT_POLICY: "missing",
  HEAL_POTION_MERCHANT_POLICY: "missing",
  FLEE_POLICY: "ev",
  FLEE_HP_THRESHOLD: "0.20",
  HEAL_POTION_THRESHOLD: "0.55",
  PORTAL_HP_THRESHOLD: "0.35",
  PORTAL_MAX_HEAL_POTIONS: "0",
  PORTAL_MIN_FLOOR: "3",
  ELITE_POLICY: "avoid",
  BLOOD_WAND_HP_PAYMENT_MIN_RATE: "0.50",
  SIM_CORE_SCORE_DROP_TOLERANCE: "0",
  SIM_440_CONDITION: "current",
  SIM_SCENARIOS: SCENARIO_IDS.join(",")
});
for (const [key, value] of Object.entries(ENV_DEFAULTS)) {
  if (process.env[key] === undefined) process.env[key] = value;
}

const RUNS_PER_CLASS = Math.max(1, Math.floor(Number(process.env.SIM_RUNS)));
const CALIBRATION_RUNS = Math.max(1, Math.floor(Number(process.env.SIM_CALIBRATION_RUNS)));
const SEED = Number(process.env.SIM_SEED) >>> 0;

const [
  {
    SIM_CLASSES,
    calibrateCoreScoringProfile,
    getScenarioById,
    resetSimulationRandom,
    simulateRun,
    getResolvedSimulationEnv,
    generateSharedRunFloor
  }
] = await Promise.all([import("./sim_depth_material_ev.js")]);

export { generateSharedRunFloor };

const CLASS_NAMES = SIM_CLASSES.filter(className => BASIC_CLASSES.includes(className));
if (CLASS_NAMES.length !== BASIC_CLASSES.length) {
  throw new Error(`basic classes missing: ${BASIC_CLASSES.join(",")}`);
}

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

function wilson(successes, trials) {
  if (trials <= 0) return { successes, trials, estimate: null, low: null, high: null };
  const p = successes / trials;
  const denominator = 1 + (R95 ** 2) / trials;
  const center = (p + (R95 ** 2) / (2 * trials)) / denominator;
  const halfWidth = R95 * Math.sqrt(
    (p * (1 - p)) / trials + (R95 ** 2) / (4 * trials ** 2)
  ) / denominator;
  return {
    successes,
    trials,
    estimate: p,
    low: Math.max(0, center - halfWidth),
    high: Math.min(1, center + halfWidth)
  };
}

function meanInterval(values) {
  if (!values.length) return { n: 0, estimate: null, low: null, high: null };
  const estimate = mean(values);
  const standardError = values.length > 1
    ? Math.sqrt(sampleVariance(values) / values.length)
    : null;
  return {
    n: values.length,
    estimate,
    low: standardError === null ? null : estimate - R95 * standardError,
    high: standardError === null ? null : estimate + R95 * standardError
  };
}

function normalDifference(left, right) {
  if (!left.length || !right.length) {
    return { leftN: left.length, rightN: right.length, estimate: null, low: null, high: null };
  }
  const estimate = mean(left) - mean(right);
  const standardError = Math.sqrt(
    sampleVariance(left) / left.length + sampleVariance(right) / right.length
  );
  return {
    leftN: left.length,
    rightN: right.length,
    estimate,
    low: estimate - R95 * standardError,
    high: estimate + R95 * standardError
  };
}

function normalizeStatus(status) {
  return status === "paralyze" ? "paralyzed" : status;
}

function sumDamage(log = []) {
  return log.reduce((sum, message) => {
    if (!message.startsWith("[味方]") || !message.includes("ダメージ")) return sum;
    if (!/(攻撃|必殺の一撃|素早い追加攻撃)/.test(message)) return sum;
    return sum + Number(message.match(/に(\d+)の[^！。]*ダメージ/)?.[1] || 0);
  }, 0);
}

function countEnemyAttacks(log = [], blindMonsterNames) {
  return log.filter(message => {
    if (!message.startsWith("[ 敵 ]") || !/の(?:攻撃|狙撃)！/.test(message)) return false;
    return [...blindMonsterNames].some(name => message.includes(`${name}の`));
  }).length;
}

function addCount(target, key, amount = 1) {
  target[key] = (target[key] || 0) + amount;
}

function collectStatusMetrics(result) {
  const statusApplications = { poisoned: 0, blind: 0, paralyzed: 0, sleep: 0 };
  const statusOpportunities = { blind: 0 };
  const statusDurationTurns = { poisoned: 0, blind: 0, paralyzed: 0, sleep: 0 };
  const fightDamage = { blind: 0, other: 0 };
  const fightTurns = { blind: 0, other: 0 };
  let statusEncounterCount = 0;
  let normalEncounterCount = 0;
  let blindMisses = 0;
  let statusActiveIncomingDamage = 0;
  let statusActiveIncomingHits = 0;
  const encounters = result.diagnostics?.encounters || [];

  encounters.forEach(encounter => {
    if (encounter.type !== "normal") return;
    normalEncounterCount++;
    const blindMonsterNames = new Set(
      encounter.monsters
        .filter(monster => monster.statuses?.includes("blind"))
        .map(monster => monster.name)
    );
    if (blindMonsterNames.size > 0) statusEncounterCount++;
    encounter.rounds.forEach(round => {
      const before = normalizeStatus(round.statusBefore);
      const after = normalizeStatus(round.statusAfter);
      const active = [before, after].includes("blind");
      if (active) statusDurationTurns.blind++;
      if ([before, after].includes("poisoned")) statusDurationTurns.poisoned++;
      if ([before, after].includes("paralyzed")) statusDurationTurns.paralyzed++;
      if ([before, after].includes("sleep")) statusDurationTurns.sleep++;
      statusOpportunities.blind += countEnemyAttacks(round.log, blindMonsterNames);
      if (round.log.some(message => message.includes("毒を受け、毒状態になった"))) {
        statusApplications.poisoned++;
      }
      if (round.log.some(message => message.includes("盲目状態になった"))) {
        statusApplications.blind++;
      }
      if (round.log.some(message => message.includes("麻痺を受け、麻痺状態になった"))) {
        statusApplications.paralyzed++;
      }
      if (round.log.some(message => message.includes("眠りに落ちた"))) {
        statusApplications.sleep++;
      }
      blindMisses += round.log.filter(message => message.includes("目がくらんで空振りした")).length;
      const incoming = round.log
        .filter(message => message.startsWith("[ 敵 ]") && message.includes("ダメージ"))
        .map(message => Number(message.match(/(?:は|に)(\d+)の[^！。]*ダメージ/)?.[1] || 0))
        .filter(damage => damage > 0);
      if (before === "blind") {
        statusActiveIncomingHits += incoming.length;
        statusActiveIncomingDamage += incoming.reduce((sum, damage) => sum + damage, 0);
      }
      if (round.action === "fight") {
        const damage = sumDamage(round.log);
        if (before === "blind") {
          fightTurns.blind++;
          fightDamage.blind += damage;
        } else {
          fightTurns.other++;
          fightDamage.other += damage;
        }
      }
    });
  });

  const statusCureItemsUsed = { ...(result.statusCureItemsUsed || {}) };
  const statusCureItemsAcquired = {};
  Object.values(result.statusCureItemsAcquired || {}).forEach(source => {
    Object.entries(source || {}).forEach(([itemId, count]) => addCount(statusCureItemsAcquired, itemId, count));
  });
  return {
    statusApplications,
    statusOpportunities,
    statusDurationTurns,
    normalEncounterCount,
    statusEncounterCount,
    blindMisses,
    statusActiveIncomingDamage,
    statusActiveIncomingHits,
    fightDamage,
    fightTurns,
    blindEver: statusApplications.blind > 0 || statusDurationTurns.blind > 0,
    statusCureItemsUsed,
    statusCureItemsAcquired,
    blindCureUsed: statusCureItemsUsed.EYE_DROPS || 0,
    blindCureAcquired: statusCureItemsAcquired.EYE_DROPS || 0,
    blindCureUnavailable: result.statusCureUnavailableStatuses?.blind || 0,
    blindCured: result.statusesCured?.blind || 0,
    finalStatusCureInventory: { ...(result.finalStatusCureInventory || {}) }
  };
}

function compactRow(task, result) {
  return {
    variant: VARIANT,
    className: task.className,
    runIndex: task.runIndex,
    scenarioId: task.scenarioId,
    survived: Boolean(result.survived),
    died: Boolean(result.died),
    reachedFloor: Number(result.reachedFloor),
    deathFloor: result.deathFloor === null ? null : Number(result.deathFloor),
    bankedMaterials: Number(result.bankedMaterials),
    timeCost: Number(result.timeCost),
    materialEvPerTime: result.timeCost > 0 ? result.bankedMaterials / result.timeCost : 0,
    status: collectStatusMetrics(result),
    departureCraft: result.departureCraft,
    trap: {
      chestDisarmAttempts: result.chestDisarmAttempts,
      chestDisarmSuccesses: result.chestDisarmSuccesses,
      chestDisarmRateCounts: result.trapDisarmRateCounts
    }
  };
}

function binnedEndpoint(rows, floor) {
  const entrants = rows.filter(row => row.reachedFloor >= floor);
  const breakthrough = entrants.filter(row => row.reachedFloor > floor).length;
  const death = entrants.filter(row => row.deathFloor === floor).length;
  const retreat = entrants.length - breakthrough - death;
  return {
    entrants: wilson(entrants.length, rows.length),
    breakthrough: wilson(breakthrough, entrants.length),
    death: wilson(death, entrants.length),
    retreat: wilson(retreat, entrants.length),
    counts: { entrants: entrants.length, breakthrough, death, retreat }
  };
}

function summarizeRows(rows) {
  const n = rows.length;
  const statusApplications = { poisoned: 0, blind: 0, paralyzed: 0, sleep: 0 };
  const statusOpportunities = { blind: 0 };
  const statusDurationTurns = { poisoned: 0, blind: 0, paralyzed: 0, sleep: 0 };
  const fightDamage = { blind: 0, other: 0 };
  const fightTurns = { blind: 0, other: 0 };
  const statusCureItemsUsed = {};
  const statusCureItemsAcquired = {};
  let normalEncounterCount = 0;
  let statusEncounterCount = 0;
  let blindMisses = 0;
  let statusActiveIncomingDamage = 0;
  let statusActiveIncomingHits = 0;
  let blindRuns = 0;
  let blindCureUnavailable = 0;
  let blindCured = 0;
  let blindCureUsed = 0;
  let blindCureAcquired = 0;
  rows.forEach(row => {
    const status = row.status;
    Object.keys(statusApplications).forEach(key => {
      statusApplications[key] += status.statusApplications[key] || 0;
      statusDurationTurns[key] += status.statusDurationTurns[key] || 0;
    });
    statusOpportunities.blind += status.statusOpportunities.blind || 0;
    Object.keys(fightDamage).forEach(key => {
      fightDamage[key] += status.fightDamage[key] || 0;
      fightTurns[key] += status.fightTurns[key] || 0;
    });
    Object.entries(status.statusCureItemsUsed).forEach(([key, value]) => addCount(statusCureItemsUsed, key, value));
    Object.entries(status.statusCureItemsAcquired).forEach(([key, value]) => addCount(statusCureItemsAcquired, key, value));
    normalEncounterCount += status.normalEncounterCount;
    statusEncounterCount += status.statusEncounterCount;
    blindMisses += status.blindMisses;
    statusActiveIncomingDamage += status.statusActiveIncomingDamage;
    statusActiveIncomingHits += status.statusActiveIncomingHits;
    blindRuns += Number(status.blindEver);
    blindCureUnavailable += status.blindCureUnavailable;
    blindCured += status.blindCured;
    blindCureUsed += status.blindCureUsed;
    blindCureAcquired += status.blindCureAcquired;
  });
  const blindRows = rows.filter(row => row.status.blindEver);
  const otherRows = rows.filter(row => !row.status.blindEver);
  const perRunStatus = {
    application: statusApplications.blind / n,
    opportunity: statusOpportunities.blind / n,
    durationTurns: statusDurationTurns.blind / n,
    misses: blindMisses / n,
    activeIncomingHits: statusActiveIncomingHits / n,
    activeIncomingDamage: statusActiveIncomingDamage / n,
    cureUsed: blindCureUsed / n,
    cureAcquired: blindCureAcquired / n,
    cureUnavailable: blindCureUnavailable / n,
    cured: blindCured / n
  };
  return {
    runs: n,
    classes: Object.fromEntries(CLASS_NAMES.map(className => [
      className,
      rows.filter(row => row.className === className).length
    ])),
    scenarioCounts: Object.fromEntries(SCENARIO_IDS.map(scenarioId => [
      scenarioId,
      rows.filter(row => row.scenarioId === scenarioId).length
    ])),
    averageReachedFloor: meanInterval(rows.map(row => row.reachedFloor)),
    averageBankedMaterials: meanInterval(rows.map(row => row.bankedMaterials)),
    averageTimeCost: meanInterval(rows.map(row => row.timeCost)),
    materialEvPerTime: meanInterval(rows.map(row => row.materialEvPerTime)),
    survivalRate: wilson(rows.filter(row => row.survived).length, n),
    endpoints: Object.fromEntries(FLOORS.map(floor => [String(floor), binnedEndpoint(rows, floor)])),
    status: {
      normalEncounterCount,
      statusEncounterCount,
      statusEncounterRate: wilson(statusEncounterCount, normalEncounterCount),
      statusApplications,
      statusApplicationsPerRun: Object.fromEntries(
        Object.entries(statusApplications).map(([key, value]) => [key, value / n])
      ),
      statusOpportunities,
      statusOpportunitiesPerRun: { blind: statusOpportunities.blind / n },
      statusDurationTurns,
      statusDurationTurnsPerRun: Object.fromEntries(
        Object.entries(statusDurationTurns).map(([key, value]) => [key, value / n])
      ),
      blindRuns: wilson(blindRuns, n),
      blindMisses,
      blindMissesPerRun: blindMisses / n,
      statusActiveIncomingHits,
      statusActiveIncomingHitsPerRun: statusActiveIncomingHits / n,
      statusActiveIncomingDamage,
      statusActiveIncomingDamagePerRun: statusActiveIncomingDamage / n,
      effectiveFightDamagePerAction: {
        blind: fightDamage.blind / Math.max(1, fightTurns.blind),
        other: fightDamage.other / Math.max(1, fightTurns.other)
      },
      fightDamage,
      fightTurns,
      statusCureItemsUsed,
      statusCureItemsAcquired,
      blindCureUsed,
      blindCureAcquired,
      blindCureUnavailable,
      blindCured,
      statusCureInventoryDepleted: wilson(
        rows.filter(row => Object.values(row.status.finalStatusCureInventory).every(count => count === 0)).length,
        n
      )
    },
    blindedVsOther: {
      blindedN: blindRows.length,
      otherN: otherRows.length,
      reachedFloor: normalDifference(
        blindRows.map(row => row.reachedFloor),
        otherRows.map(row => row.reachedFloor)
      ),
      survival: wilson(blindRows.filter(row => row.survived).length, blindRows.length),
      otherSurvival: wilson(otherRows.filter(row => row.survived).length, otherRows.length),
      endpoints: Object.fromEntries(FLOORS.map(floor => [String(floor), {
        blinded: binnedEndpoint(blindRows, floor),
        other: binnedEndpoint(otherRows, floor)
      }]))
    },
    trap: {
      chestDisarmAttempts: rows.reduce((sum, row) => sum + (row.trap.chestDisarmAttempts || 0), 0),
      chestDisarmSuccesses: rows.reduce((sum, row) => sum + (row.trap.chestDisarmSuccesses || 0), 0),
      chestDisarmRateCounts: rows.reduce((total, row) => {
        Object.entries(row.trap.chestDisarmRateCounts || {}).forEach(([key, value]) => addCount(total, key, value));
        return total;
      }, {})
    }
  };
}

function buildScenario(scenarioId) {
  const base = getScenarioById(scenarioId);
  return {
    ...base,
    departureCraft: [...KIT_BY_VARIANT[VARIANT]],
    identificationPolicy: "powder",
    trapPolicy: process.env.TRAP_POLICY,
    trapAvoidancePolicy: process.env.TRAP_AVOIDANCE_POLICY,
    statusCurePolicy: process.env.STATUS_CURE_POLICY,
    statusCureHpThreshold: Number(process.env.STATUS_CURE_HP_THRESHOLD),
    statusCureMerchantPolicy: process.env.STATUS_CURE_MERCHANT_POLICY,
    fleePolicy: process.env.FLEE_POLICY,
    fleeHpThreshold: Number(process.env.FLEE_HP_THRESHOLD),
    healPotionThreshold: Number(process.env.HEAL_POTION_THRESHOLD),
    elitePolicy: process.env.ELITE_POLICY,
    simDiagnosticLevel: "full"
  };
}

export function runBlindBalanceTask(task, context) {
  const scenario = context.scenarios[task.scenarioId];
  resetSimulationRandom(hashSeed(`${SEED}:${VARIANT}:${task.className}:${task.runIndex}`));
  const result = simulateRun({
    className: task.className,
    startFloor: 1,
    targetDepth: 21,
    runIndex: task.runIndex,
    seriesId: `issue507-${VARIANT}`,
    scoringProfile: context.scoringProfiles[task.scenarioId],
    scenario,
    workshop: scenario.workshop,
    collectDiagnostics: true
  });
  return compactRow(task, result);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function writeRawRows(path, rows) {
  const text = rows.map(row => JSON.stringify(row)).join("\n") + "\n";
  writeFileSync(path, text);
  return sha256(text);
}

function envSnapshot() {
  const keys = Object.keys(ENV_DEFAULTS).sort();
  return Object.fromEntries(keys.map(key => [key, process.env[key]]));
}

async function main() {
  const scenarios = Object.fromEntries(SCENARIO_IDS.map(scenarioId => [
    scenarioId,
    buildScenario(scenarioId)
  ]));
  const scoringProfiles = {};
  const calibrationStarted = performance.now();
  const calibrationCpuStarted = process.cpuUsage();
  for (const scenarioId of SCENARIO_IDS) {
    resetSimulationRandom(SEED);
    scoringProfiles[scenarioId] = calibrateCoreScoringProfile(
      CALIBRATION_RUNS,
      scenarios[scenarioId],
      "powder",
      scenarios[scenarioId].workshop
    );
  }
  const calibrationCpu = process.cpuUsage(calibrationCpuStarted);
  const calibrationWallSeconds = (performance.now() - calibrationStarted) / 1000;

  const tasks = CLASS_NAMES.flatMap(className =>
    Array.from({ length: RUNS_PER_CLASS }, (_, runIndex) => ({
      className,
      runIndex,
      scenarioId: SCENARIO_SEQUENCE[runIndex % SCENARIO_SEQUENCE.length]
    }))
  );
  const resolvedParallelism = resolveSimParallelism(tasks.length);
  const startedWall = performance.now();
  const startedCpu = process.cpuUsage();
  const rows = await runSimTasks({
    moduleUrl: import.meta.url,
    exportName: "runBlindBalanceTask",
    runTask: runBlindBalanceTask,
    tasks,
    context: { scenarios, scoringProfiles },
    mapGeneratorExportName: "generateSharedRunFloor"
  });
  const runCpu = process.cpuUsage(startedCpu);
  const wallClockSeconds = (performance.now() - startedWall) / 1000;
  if (rows.length !== tasks.length) {
    throw new Error(`raw result audit failed: rows=${rows.length}/${tasks.length}`);
  }
  const duplicateKeys = rows.length - new Set(
    rows.map(row => `${row.variant}:${row.className}:${row.runIndex}`)
  ).size;
  if (duplicateKeys !== 0) throw new Error(`raw result audit found duplicates=${duplicateKeys}`);

  const resultDir = join(process.cwd(), "scratch", "results");
  mkdirSync(resultDir, { recursive: true });
  const rawPath = join(resultDir, `issue-507-blind-balance-${VARIANT}.jsonl`);
  const summaryPath = join(resultDir, `issue-507-blind-balance-${VARIANT}.json`);
  const rawSha256 = writeRawRows(rawPath, rows);
  const summary = {
    issue: 507,
    variant: VARIANT,
    measurement: {
      seed: SEED,
      runsPerClass: RUNS_PER_CLASS,
      totalRuns: rows.length,
      calibrationRunsPerScenario: CALIBRATION_RUNS,
      classes: CLASS_NAMES,
      scenarioWeights: Object.fromEntries(SCENARIO_WEIGHTS),
      resolvedParallelism,
      availableParallelism: availableParallelism(),
      simParallelEnv: process.env.SIM_PARALLEL || "<omitted>",
      mapCacheEntries: process.env.SIM_MAP_CACHE_ENTRIES || 1024,
      calibrationWallSeconds,
      simulationWallSeconds: wallClockSeconds,
      calibrationCpuSeconds: (calibrationCpu.user + calibrationCpu.system) / 1e6,
      simulationCpuSeconds: (runCpu.user + runCpu.system) / 1e6,
      totalCpuSeconds: (
        calibrationCpu.user + calibrationCpu.system + runCpu.user + runCpu.system
      ) / 1e6,
      rawPath: rawPath.replace(`${process.cwd()}/`, ""),
      rawSha256
    },
    environment: envSnapshot(),
    resolvedSimulationEnvironment: getResolvedSimulationEnv(),
    source: {
      kit: KIT_BY_VARIANT[VARIANT],
      kitSlots: KIT_BY_VARIANT[VARIANT].length,
      statusRule: VARIANT === "baseline"
        ? "current"
        : VARIANT === "a-miss-only"
          ? "blind miss 50%; hit damage unhalved"
          : VARIANT === "b-battle-end"
            ? "blind clears at combat end"
            : "current blind rule; EYE_DROPS replaces one HEAL_POTION"
    },
    summary: summarizeRows(rows)
  };
  const summaryText = `${JSON.stringify(summary, null, 2)}\n`;
  summary.output = {
    summarySha256: sha256(summaryText),
    summaryPath: summaryPath.replace(`${process.cwd()}/`, "")
  };
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({
    variant: VARIANT,
    summaryPath: summary.output.summaryPath,
    rawPath: summary.measurement.rawPath,
    rawSha256,
    summarySha256: summary.output.summarySha256,
    runs: rows.length,
    averageReachedFloor: summary.summary.averageReachedFloor,
    b5: summary.summary.endpoints["5"],
    b10: summary.summary.endpoints["10"],
    blind: summary.summary.status,
    blindedVsOther: summary.summary.blindedVsOther,
    timing: summary.measurement
  }, null, 2));
}

if (isMainThread && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
