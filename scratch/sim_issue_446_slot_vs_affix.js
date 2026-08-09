// sim-scope: run
// Issue #446: separate virtual equipment slots from equipped affix volume.

/* global console, process */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { performance } from "node:perf_hooks";
import { isMainThread } from "node:worker_threads";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveSimParallelism, runSimTasks } from "./sim_parallel.js";

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

const CONDITION_DEFINITIONS = Object.freeze({
  base: Object.freeze({
    label: "base",
    slotMode: "standard",
    slotAffixMode: "retain",
    affixVolume: "current"
  }),
  unlimited: Object.freeze({
    label: "unlimited slots",
    slotMode: "unlimited",
    slotAffixMode: "retain",
    affixVolume: "current"
  }),
  "slots-affix-capped": Object.freeze({
    label: "(1) slots↑ / affix総量据え置き",
    slotMode: "affixless-duplicates",
    slotAffixMode: "none",
    affixVolume: "current"
  }),
  "affix-volume": Object.freeze({
    label: "(2) slots据え置き / affix総量↑",
    slotMode: "standard",
    slotAffixMode: "retain",
    affixVolume: "increased-composition"
  })
});

// Pilot after N was fixed. The target is the measured B5 composition of
// unlimited slots; these values are a sim-only mutation of the imported data
// object, never a src/ balance change.
const AFFIX_VOLUME_PROFILE = Object.freeze({
  budgetsByRarityAndFloor: Object.freeze({
    magic: Object.freeze([0, 30, 32, 34, 36, 38]),
    rare: Object.freeze([0, 30, 32, 34, 36, 38]),
    epic: Object.freeze([0, 45, 48, 51, 54, 57])
  }),
  rollComposition: Object.freeze({
    magic: Object.freeze({ support: 5, core: 3, coreChance: 0.80 }),
    rare: Object.freeze({ support: 6, core: 3, coreChance: 0.80 }),
    epic: Object.freeze({ support: 7, core: 3 })
  })
});

const ENV_DEFAULTS = Object.freeze({
  SIM_SEED: "444",
  SIM_RUNS: "2200",
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
  throw new Error("SIM_PARALLEL must be omitted for Issue #446 measurement");
}
if (process.env.IDENTIFICATION_POLICY !== "powder") {
  throw new Error("IDENTIFICATION_POLICY must be powder for Issue #446");
}
if (!SCENARIO_IDS.every(id => process.env.SIM_SCENARIOS.split(",").includes(id))) {
  throw new Error(`SIM_SCENARIOS must include all seven scenarios: ${SCENARIO_IDS.join(",")}`);
}

const CONDITION_ID = String(
  process.env.SIM_ISSUE446_CONDITION || "base"
).trim();
const CONDITION = CONDITION_DEFINITIONS[CONDITION_ID];
if (!CONDITION) {
  throw new Error(
    `SIM_ISSUE446_CONDITION must be ${Object.keys(CONDITION_DEFINITIONS).join("|")}: ${CONDITION_ID}`
  );
}
process.env.SIM_EQUIPMENT_SLOT_MODE = CONDITION.slotMode;
process.env.SIM_EQUIPMENT_SLOT_AFFIX_MODE = CONDITION.slotAffixMode;

const RUNS = Math.max(1, Number(process.env.SIM_RUNS));
const CALIBRATION_RUNS = Math.max(1, Number(process.env.SIM_CALIBRATION_RUNS));
const SEED = Number(process.env.SIM_SEED) >>> 0;
const FLEE_POLICY = process.env.FLEE_POLICY === "never" ? "never" : "threshold";
const FLEE_HP_THRESHOLD = FLEE_POLICY === "never"
  ? null
  : Math.max(0, Math.min(1, Number(process.env.FLEE_HP_THRESHOLD)));

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
    high: Math.min(1, center + halfWidth)
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
  return {
    scenarioId: task.scenarioId,
    runIndex: task.runIndex,
    className: task.className,
    survived: Boolean(result.survived),
    died: Boolean(result.died),
    reachedFloor: Number(result.reachedFloor),
    deathFloor: result.deathFloor === null ? null : Number(result.deathFloor),
    bankedMaterials: Number(result.bankedMaterials || 0),
    timeCost: Number(result.timeCost || 0),
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
    averageReachedFloor: meanInterval(rows.map(row => row.reachedFloor)),
    bankedMaterialsPerRun: meanInterval(rows.map(row => row.bankedMaterials))
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

let resetSimulationRandom;
let simulateRun;
let SIM_CLASSES;
let calibrateCoreScoringProfile;
let getScenarioById;
let CORE_AFFIXES;
let SUPPORT_AFFIXES;

async function initializeSimulation() {
  const { AFFIX_BALANCE, CORE_AFFIXES: coreAffixes, SUPPORT_AFFIXES: supportAffixes } =
    await import("../src/data/affixes.js");
  CORE_AFFIXES = coreAffixes;
  SUPPORT_AFFIXES = supportAffixes;
  if (CONDITION.affixVolume === "increased-composition") {
    Object.entries(AFFIX_VOLUME_PROFILE.rollComposition).forEach(([rarity, composition]) => {
      AFFIX_BALANCE.rollComposition[rarity] = { ...composition };
    });
    Object.entries(AFFIX_VOLUME_PROFILE.budgetsByRarityAndFloor).forEach(([rarity, budgets]) => {
      AFFIX_BALANCE.budgetsByRarityAndFloor[rarity] = [...budgets];
    });
  }

  const simulation = await import("./sim_depth_material_ev.js");
  resetSimulationRandom = simulation.resetSimulationRandom;
  simulateRun = simulation.simulateRun;
  SIM_CLASSES = simulation.SIM_CLASSES;
  calibrateCoreScoringProfile = simulation.calibrateCoreScoringProfile;
  getScenarioById = simulation.getScenarioById;
}

async function runMain() {
  const classNames = SIM_CLASSES.filter(className => BASIC_CLASSES.includes(className));
  if (classNames.length !== BASIC_CLASSES.length) {
    throw new Error(`basic classes missing: ${BASIC_CLASSES.join(",")}`);
  }
  const coreIds = new Set(CORE_AFFIXES.map(affix => affix.id));
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
    exportName: "runIssue446Task",
    runTask: runIssue446Task,
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
  const rawPath = join(resultDir, `issue-446-slot-vs-affix-${CONDITION_ID}.jsonl`);
  const summaryPath = join(resultDir, `issue-446-slot-vs-affix-${CONDITION_ID}.json`);
  const rawText = rows.map(row => JSON.stringify(row)).join("\n") + "\n";
  const rawSha256 = sha256(rawText);
  writeFileSync(rawPath, rawText);
  const measurement = {
    issue: 446,
    condition: CONDITION_ID,
    conditionLabel: CONDITION.label,
    seed: SEED,
    SIM_RUNS: RUNS,
    SIM_CALIBRATION_RUNS: CALIBRATION_RUNS,
    SIM_PARALLEL: "未指定",
    resolvedParallelism,
    availableParallelism: availableParallelism(),
    identificationPolicy: process.env.IDENTIFICATION_POLICY,
    fleePolicy: FLEE_POLICY,
    fleeHpThreshold: FLEE_HP_THRESHOLD,
    supportSupplyCeiling: process.env.SIM_SUPPORT_SUPPLY_CEILING,
    equipmentSlotMode: CONDITION.slotMode,
    equipmentSlotAffixMode: CONDITION.slotAffixMode,
    affixVolume: CONDITION.affixVolume,
    affixVolumeProfile: CONDITION.affixVolume === "increased-composition"
      ? AFFIX_VOLUME_PROFILE
      : null,
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
    supportAffixCount: SUPPORT_AFFIXES.length,
    coreAffixCount: CORE_AFFIXES.length
  };
  const fullSummary = { measurement, cases };
  writeFileSync(summaryPath, `${JSON.stringify(fullSummary, null, 2)}\n`);
  const summarySha256 = sha256(readFileSync(summaryPath));
  console.log(JSON.stringify({
    summaryPath: summaryPath.replace(`${process.cwd()}/`, ""),
    rawPath: rawPath.replace(`${process.cwd()}/`, ""),
    summarySha256,
    measurement,
    corePools: cases["workshop-core-pools"],
    complete: cases["workshop-complete"]
  }, null, 2));
}

export function runIssue446Task(task, context) {
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
