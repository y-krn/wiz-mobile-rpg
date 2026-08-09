// sim-scope: run
// Issue #404: sweep affix volume between current data and the #447 upper bound.

/* global console, process */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { performance } from "node:perf_hooks";
import { isMainThread } from "node:worker_threads";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runSimTasks, resolveSimParallelism } from "./sim_parallel.js";
import {
  AFFIX_VOLUME_PROFILES,
  applyAffixVolumeProfile
} from "./issue_404_affix_profiles.js";

const SCENARIO_IDS = Object.freeze([
  "workshop-empty",
  "workshop-stats",
  "workshop-gear",
  "workshop-blood-wand",
  "workshop-blood-wand-spells",
  "workshop-core-pools",
  "workshop-complete"
]);
const BASIC_CLASSES = Object.freeze(["Fighter", "Thief", "Priest", "Mage"]);
const B5 = 5;
const TARGET_DEPTH = 21;
const R95 = 1.959963984540054;
const PROFILE_ID = String(process.env.SIM_ISSUE404_PROFILE || "base").trim();
const ISSUE409_SLOT_MODE = String(process.env.SIM_ISSUE409_SLOT_MODE || "").trim();
const PROFILE = AFFIX_VOLUME_PROFILES[PROFILE_ID];

if (!PROFILE) {
  throw new Error(
    `SIM_ISSUE404_PROFILE must be ${Object.keys(AFFIX_VOLUME_PROFILES).join("|")}: ${PROFILE_ID}`
  );
}
if (ISSUE409_SLOT_MODE && !["standard", "second-accessory"].includes(ISSUE409_SLOT_MODE)) {
  throw new Error(`SIM_ISSUE409_SLOT_MODE must be standard|second-accessory: ${ISSUE409_SLOT_MODE}`);
}

const ENV_DEFAULTS = Object.freeze({
  SIM_SEED: "444",
  SIM_RUNS: "6600",
  SIM_CALIBRATION_RUNS: "100",
  DEPARTURE_CRAFT_IDS:
    "TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION",
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
  FLEE_POLICY: "threshold",
  FLEE_HP_THRESHOLD: "0.35",
  PORTAL_HP_THRESHOLD: "0.35",
  PORTAL_MAX_HEAL_POTIONS: "0",
  PORTAL_MIN_FLOOR: "3",
  ELITE_POLICY: "avoid",
  BLOOD_WAND_HP_PAYMENT_MIN_RATE: "0.50",
  SIM_CORE_SCORE_DROP_TOLERANCE: "0",
  SIM_440_CONDITION: "current",
  SIM_SCENARIOS: SCENARIO_IDS.join(","),
  SIM_SUPPORT_SUPPLY_CEILING: "none",
  SIM_EQUIPMENT_POLICY: "individual-score",
  SIM_MATCHING_DEFINITION: "exact"
});

for (const [key, value] of Object.entries(ENV_DEFAULTS)) {
  if (process.env[key] === undefined) process.env[key] = value;
}
if (process.env.SIM_PARALLEL) {
  throw new Error("SIM_PARALLEL must be omitted for Issue #404 measurement");
}
if (process.env.IDENTIFICATION_POLICY !== "powder") {
  throw new Error("IDENTIFICATION_POLICY must be powder for Issue #404");
}
if (process.env.FLEE_POLICY !== "threshold") {
  throw new Error("FLEE_POLICY must be threshold for Issue #404");
}
if (!SCENARIO_IDS.every(id => process.env.SIM_SCENARIOS.split(",").includes(id))) {
  throw new Error(`SIM_SCENARIOS must include all seven scenarios: ${SCENARIO_IDS.join(",")}`);
}

process.env.SIM_EQUIPMENT_SLOT_MODE = ISSUE409_SLOT_MODE || "standard";
process.env.SIM_EQUIPMENT_SLOT_AFFIX_MODE = "retain";

const RUNS = Math.max(1, Number(process.env.SIM_RUNS));
const CALIBRATION_RUNS = Math.max(1, Number(process.env.SIM_CALIBRATION_RUNS));
const SEED = Number(process.env.SIM_SEED) >>> 0;
const FLEE_HP_THRESHOLD = Math.max(
  0,
  Math.min(1, Number(process.env.FLEE_HP_THRESHOLD))
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

function meanInterval(values, digits = 4) {
  if (!values.length) return { n: 0, estimate: null, low: null, high: null };
  const estimate = mean(values);
  const standardError = values.length > 1
    ? Math.sqrt(sampleVariance(values) / values.length)
    : null;
  return {
    n: values.length,
    estimate,
    low: standardError === null ? null : estimate - R95 * standardError,
    high: standardError === null ? null : estimate + R95 * standardError,
    digits
  };
}

function wilson(successes, trials) {
  if (trials <= 0) {
    return { successes, trials, estimate: null, low: null, high: null };
  }
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
    high: Math.min(1, center + halfWidth),
    nStatus: trials < 30 ? "未確定（N<30）" : "確定"
  };
}

function isCoreAffix(affix, coreIds) {
  return affix?.kind === "core" || coreIds.has(affix?.id || affix?.type);
}

function compactSnapshot(snapshot, coreIds) {
  if (!snapshot) return null;
  const equipment = Array.isArray(snapshot.equipment) ? snapshot.equipment : [];
  const affixes = equipment.flatMap(item => item.affixes || []);
  const coreAffixes = affixes.filter(affix => isCoreAffix(affix, coreIds));
  const supportAffixes = affixes.filter(affix => !isCoreAffix(affix, coreIds));
  const coreIdList = [...new Set(coreAffixes.map(affix => affix.id || affix.type))];
  const supportSums = {};
  supportAffixes.forEach(affix => {
    const id = affix.id || affix.type;
    supportSums[id] = (supportSums[id] || 0) + (affix.value || 0);
  });
  return {
    floor: snapshot.floor,
    point: snapshot.point,
    level: snapshot.level,
    equipmentStatScore: snapshot.equipmentStatScore,
    combatCoreScore: snapshot.combatCoreScore,
    combatBuildScore: snapshot.combatBuildScore,
    coreIds: coreIdList,
    supportAffixes: supportSums,
    totalAffixCount: affixes.length,
    coreAffixCount: coreAffixes.length,
    supportAffixCount: supportAffixes.length,
    equippedItemCount: equipment.length,
    virtualSlotItemCount: equipment.filter(item => item.slot?.includes("#")).length
  };
}

function buildScenario(getScenarioById, scenarioId) {
  const base = getScenarioById(scenarioId);
  return {
    ...base,
    identificationPolicy: "powder",
    trapPolicy: process.env.TRAP_POLICY,
    trapAvoidancePolicy: process.env.TRAP_AVOIDANCE_POLICY,
    statusCurePolicy: process.env.STATUS_CURE_POLICY,
    statusCureHpThreshold: Number(process.env.STATUS_CURE_HP_THRESHOLD),
    statusCureMerchantPolicy: process.env.STATUS_CURE_MERCHANT_POLICY,
    fleeHpThreshold: FLEE_HP_THRESHOLD,
    elitePolicy: process.env.ELITE_POLICY
  };
}

function getB5Snapshot(result, coreIds) {
  return compactSnapshot(
    result.diagnostics?.buildSnapshots?.find(
      snapshot => snapshot.floor === B5 && snapshot.point === "floor-start"
    ) || null,
    coreIds
  );
}

function compactRow(task, result, coreIds) {
  const b5 = getB5Snapshot(result, coreIds);
  const b6 = result.diagnostics?.buildSnapshots?.some(
    snapshot => snapshot.floor === B5 + 1 && snapshot.point === "floor-start"
  );
  const finalCoreCount = Array.isArray(result.finalCoreIds)
    ? result.finalCoreIds.length
    : Number(result.coreEquipped);
  return {
    scenarioId: task.scenarioId,
    runIndex: task.runIndex,
    className: task.className,
    survived: Boolean(result.survived),
    died: Boolean(result.died),
    reachedFloor: Number(result.reachedFloor),
    deathFloor: result.deathFloor === null ? null : Number(result.deathFloor),
    bankedMaterials: Number(result.bankedMaterials || 0),
    materialAcquired: Number(result.materialAcquired || 0),
    materialConsumed: Number(result.materialConsumed || 0),
    timeCost: Number(result.timeCost || 0),
    materialEvPerTime: result.timeCost > 0
      ? Number(result.bankedMaterials || 0) / result.timeCost
      : 0,
    identificationPowderAcquired: Number(result.identificationPowderAcquired || 0),
    identificationPowderUsed: Number(result.identificationPowderUsed || 0),
    identificationPowderRemaining: Number(result.identificationPowderRemaining || 0),
    identificationPowderDepleted: Boolean(result.identificationPowderDepleted),
    identificationPowderAcquiredBySource: {
      ...result.identificationPowderAcquiredBySource
    },
    finalCoreCount,
    finalCoreEquipped: finalCoreCount > 0,
    finalCoreTwoPlus: finalCoreCount >= 2,
    b5,
    b5Death: Boolean(b5 && result.died && result.deathFloor === B5),
    b5Breakthrough: Boolean(b5 && b6),
    finalCoreIds: [...(result.finalCoreIds || [])]
  };
}

function summarizeScenario(rows) {
  const entrants = rows.filter(row => row.b5);
  const values = selector => entrants
    .map(selector)
    .filter(value => Number.isFinite(value));
  const allValues = selector => rows
    .map(selector)
    .filter(value => Number.isFinite(value));
  const averageOf = selector => meanInterval(allValues(selector));
  const powderSourceTotals = {};
  rows.forEach(row => {
    Object.entries(row.identificationPowderAcquiredBySource).forEach(([source, amount]) => {
      powderSourceTotals[source] = (powderSourceTotals[source] || 0) + amount;
    });
  });
  return {
    runs: rows.length,
    b5: {
      entrantsN: entrants.length,
      endpoints: {
        breakthroughRate: wilson(
          entrants.filter(row => row.b5Breakthrough).length,
          entrants.length
        ),
        deathRate: wilson(
          entrants.filter(row => row.b5Death).length,
          entrants.length
        ),
        reachedFloor: meanInterval(values(row => row.reachedFloor))
      },
      composition: {
        totalAffixes: meanInterval(values(row => row.b5.totalAffixCount)),
        coreAffixes: meanInterval(values(row => row.b5.coreAffixCount)),
        supportAffixes: meanInterval(values(row => row.b5.supportAffixCount)),
        equippedItems: meanInterval(values(row => row.b5.equippedItemCount)),
        virtualSlotItems: meanInterval(values(row => row.b5.virtualSlotItemCount))
      },
      nStatus: entrants.length < 30 ? "未確定（N<30）" : "確定"
    },
    averageReachedFloor: averageOf(row => row.reachedFloor),
    averageBankedMaterials: averageOf(row => row.bankedMaterials),
    averageMaterialAcquired: averageOf(row => row.materialAcquired),
    averageMaterialConsumed: averageOf(row => row.materialConsumed),
    averageTimeCost: averageOf(row => row.timeCost),
    materialEvPerTime: averageOf(row => row.materialEvPerTime),
    identificationPowder: {
      acquired: averageOf(row => row.identificationPowderAcquired),
      used: averageOf(row => row.identificationPowderUsed),
      remaining: averageOf(row => row.identificationPowderRemaining),
      depletedRate: wilson(
        rows.filter(row => row.identificationPowderDepleted).length,
        rows.length
      ),
      acquiredBySourcePerRun: Object.fromEntries(
        Object.entries(powderSourceTotals).map(([source, amount]) => [source, amount / rows.length])
      )
    },
    coreEquipment: {
      equippedRate: wilson(rows.filter(row => row.finalCoreEquipped).length, rows.length),
      twoPlusRate: wilson(rows.filter(row => row.finalCoreTwoPlus).length, rows.length),
      countDistribution: Object.fromEntries(
        [...new Set(rows.map(row => row.finalCoreCount))]
          .sort((left, right) => left - right)
          .map(count => [count, rows.filter(row => row.finalCoreCount === count).length])
      )
    }
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

let resetSimulationRandom;
let simulateRun;
let simClasses;
let calibrateCoreScoringProfile;
let getScenarioById;
let coreAffixes;
let supportAffixes;

async function initializeSimulation() {
  const affixData = await import("../src/data/affixes.js");
  coreAffixes = affixData.CORE_AFFIXES;
  supportAffixes = affixData.SUPPORT_AFFIXES;
  applyAffixVolumeProfile(affixData.AFFIX_BALANCE, PROFILE_ID);
  const simulation = await import("./sim_depth_material_ev.js");
  resetSimulationRandom = simulation.resetSimulationRandom;
  simulateRun = simulation.simulateRun;
  simClasses = simulation.SIM_CLASSES;
  calibrateCoreScoringProfile = simulation.calibrateCoreScoringProfile;
  getScenarioById = simulation.getScenarioById;
}

async function runMain() {
  const classNames = simClasses.filter(className => BASIC_CLASSES.includes(className));
  if (classNames.length !== BASIC_CLASSES.length) {
    throw new Error(`basic classes missing: ${BASIC_CLASSES.join(",")}`);
  }
  const coreIds = new Set(coreAffixes.map(affix => affix.id));
  const scenarios = Object.fromEntries(
    SCENARIO_IDS.map(id => [id, buildScenario(getScenarioById, id)])
  );
  const scoringProfiles = {};
  const calibrationStarted = performance.now();
  for (const scenarioId of SCENARIO_IDS) {
    const scenario = scenarios[scenarioId];
    resetSimulationRandom(SEED);
    scoringProfiles[scenarioId] = calibrateCoreScoringProfile(
      CALIBRATION_RUNS,
      scenario,
      "powder",
      scenario.workshop
    );
  }
  const calibrationWallSeconds = (performance.now() - calibrationStarted) / 1000;
  const tasks = SCENARIO_IDS.flatMap(scenarioId =>
    Array.from({ length: RUNS }, (_, runIndex) => ({
      scenarioId,
      runIndex,
      className: classNames[runIndex % classNames.length]
    }))
  );
  const resolvedParallelism = resolveSimParallelism(tasks.length);
  const startedWall = performance.now();
  const startedCpu = process.cpuUsage();
  const rows = await runSimTasks({
    moduleUrl: pathToFileURL(fileURLToPath(import.meta.url)).href,
    exportName: "runIssue404Task",
    runTask: runIssue404Task,
    tasks,
    context: { seed: SEED, scenarios, scoringProfiles, coreIds }
  });
  const cpuUsage = process.cpuUsage(startedCpu);
  const wallClockSeconds = (performance.now() - startedWall) / 1000;
  const caseRows = Object.fromEntries(SCENARIO_IDS.map(id => [
    id,
    rows.filter(row => row.scenarioId === id)
  ]));
  const cases = Object.fromEntries(SCENARIO_IDS.map(id => [
    id,
    summarizeScenario(caseRows[id])
  ]));
  const duplicateKeys = rows.length - new Set(
    rows.map(row => `${row.scenarioId}:${row.runIndex}:${row.className}`)
  ).size;
  if (rows.length !== tasks.length || duplicateKeys !== 0) {
    throw new Error(
      `raw result audit failed: rows=${rows.length}/${tasks.length}, duplicates=${duplicateKeys}`
    );
  }

  const resultDir = join(process.cwd(), "scratch", "results");
  mkdirSync(resultDir, { recursive: true });
  const outputPrefix = ISSUE409_SLOT_MODE
    ? `issue-409-second-accessory-${ISSUE409_SLOT_MODE}`
    : `issue-404-affix-volume-${PROFILE_ID}`;
  const rawPath = join(resultDir, `${outputPrefix}.jsonl`);
  const summaryPath = join(resultDir, `${outputPrefix}.json`);
  const rawText = rows.map(row => JSON.stringify(row)).join("\n") + "\n";
  const rawSha256 = sha256(rawText);
  writeFileSync(rawPath, rawText);
  const measurement = {
    issue: ISSUE409_SLOT_MODE ? 409 : 404,
    profile: PROFILE_ID,
    profileLabel: PROFILE.label,
    profileDefinition: PROFILE,
    seed: SEED,
    SIM_RUNS: RUNS,
    SIM_CALIBRATION_RUNS: CALIBRATION_RUNS,
    SIM_PARALLEL: "未指定",
    resolvedParallelism,
    availableParallelism: availableParallelism(),
    identificationPolicy: process.env.IDENTIFICATION_POLICY,
    fleePolicy: process.env.FLEE_POLICY,
    fleeHpThreshold: FLEE_HP_THRESHOLD,
    equipmentSlotMode: process.env.SIM_EQUIPMENT_SLOT_MODE,
    scenarios: SCENARIO_IDS,
    classes: classNames,
    targetDepth: TARGET_DEPTH,
    calibrationWallSeconds,
    wallClockSeconds,
    cpuUserSeconds: cpuUsage.user / 1e6,
    cpuSystemSeconds: cpuUsage.system / 1e6,
    cpuTotalSeconds: (cpuUsage.user + cpuUsage.system) / 1e6,
    rawSha256,
    rawPath: rawPath.replace(`${process.cwd()}/`, ""),
    supportAffixCount: supportAffixes.length,
    coreAffixCount: coreAffixes.length
  };
  const fullSummary = { measurement, cases };
  writeFileSync(summaryPath, `${JSON.stringify(fullSummary, null, 2)}\n`);
  const summarySha256 = sha256(readFileSync(summaryPath));
  console.log(JSON.stringify({
    summaryPath: summaryPath.replace(`${process.cwd()}/`, ""),
    rawPath: rawPath.replace(`${process.cwd()}/`, ""),
    summarySha256,
    measurement,
    corePools: cases["workshop-core-pools"]
  }, null, 2));
}

export function runIssue404Task(task, context) {
  const scenario = context.scenarios[task.scenarioId];
  resetSimulationRandom(hashSeed(`${context.seed}:${task.scenarioId}:${task.runIndex}`));
  const result = simulateRun({
    className: task.className,
    startFloor: 1,
    targetDepth: TARGET_DEPTH,
    runIndex: task.runIndex,
    seriesId: "issue444-build-matching",
    scoringProfile: context.scoringProfiles[task.scenarioId],
    scenario,
    workshop: scenario.workshop,
    collectDiagnostics: true
  });
  return compactRow(task, result, context.coreIds);
}

await initializeSimulation();
if (isMainThread) await runMain();
