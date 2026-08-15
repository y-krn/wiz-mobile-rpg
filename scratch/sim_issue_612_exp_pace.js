// sim-scope: run — Issue #612 experience supply, encounter-rate sweep, and level pace
/* global console, process */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { isMainThread } from "node:worker_threads";
import { fileURLToPath, pathToFileURL } from "node:url";

import { EXP_LEVELS } from "../src/data/progression.js";
import { resolveSimParallelism, runSimTasks } from "./sim_parallel.js";

const SMOKE = process.env.ISSUE612_SMOKE === "1";
const BASIC_CLASSES = Object.freeze(["Fighter", "Thief", "Priest", "Mage"]);
const CLASS_LABELS = Object.freeze({
  Fighter: "戦士",
  Thief: "盗賊",
  Priest: "僧侶",
  Mage: "魔術師"
});
const WORKSHOP_DISTRIBUTION = Object.freeze([
  ["workshop-empty", 30],
  ["workshop-stats", 74],
  ["workshop-gear", 69],
  ["workshop-blood-wand", 216],
  ["workshop-blood-wand-spells", 47],
  ["workshop-complete", 764]
]);
const WORKSHOP_TOTAL = WORKSHOP_DISTRIBUTION.reduce(
  (sum, [, weight]) => sum + weight,
  0
);
const FULL_SCENARIO_IDS = Object.freeze(WORKSHOP_DISTRIBUTION.map(([id]) => id));
const SCENARIO_IDS = Object.freeze(
  SMOKE ? ["workshop-complete"] : FULL_SCENARIO_IDS
);
const TARGET_DEPTH = 21;
const TARGET_FLOORS = Object.freeze([5, 10, 20]);
const BUILD_AUDIT_FLOORS = Object.freeze([3, 5, 10]);
const RUNS_PER_CLASS = SMOKE ? 1 : 500;
const WORKSHOP_AUDIT_RUNS_PER_CLASS = SMOKE ? 1 : 100;
const CALIBRATION_RUNS = SMOKE ? 1 : 100;
const RATE_MULTIPLIERS = Object.freeze(
  SMOKE ? [1] : [0, 0.25, 0.5, 1, 2, 5, 10, 25]
);
const RATE_LABELS = Object.freeze(
  Object.fromEntries(RATE_MULTIPLIERS.map(value => [String(value), `${value}x`]))
);
const R95 = 1.959963984540054;
const RESULT_BASENAME = "issue-612-exp-pace";
const LEVEL_BUCKETS = Object.freeze([
  "lv1",
  "lv2",
  "lv3",
  "lv4",
  "lv5",
  "lv6",
  "lv7",
  "lv8",
  "lv9-11",
  "lv12+"
]);
const LEVEL_BANDS = Object.freeze([
  ["L1", 1, 1],
  ["L2-3", 2, 3],
  ["L4-5", 4, 5],
  ["L6+", 6, Infinity]
]);
const XP_SOURCES = Object.freeze(["normal", "boss", "other"]);
const FIXED_ENV = Object.freeze({
  BLOOD_WAND_HP_PAYMENT_MIN_RATE: "0.50",
  DEPARTURE_CRAFT_IDS:
    "TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION",
  ELITE_POLICY: "avoid",
  FLEE_HP_THRESHOLD: "0.20",
  FLEE_POLICY: "ev",
  HEAL_POTION_MERCHANT_POLICY: "missing",
  HEAL_POTION_THRESHOLD: "0.55",
  IDENTIFICATION_COST_OVERRIDE: "1",
  IDENTIFICATION_POLICY: "powder",
  IDENTIFICATION_STARTING_POWDER: "2",
  PORTAL_HP_THRESHOLD: "0.35",
  PORTAL_MAX_HEAL_POTIONS: "0",
  PORTAL_MIN_FLOOR: "3",
  SIM_440_CONDITION: "current",
  SIM_CORE_SCORE_DROP_TOLERANCE: "0",
  SIM_DIALMA_CANDIDATE: "1",
  SIM_EQUIPMENT_POLICY: "individual-score",
  SIM_EQUIPMENT_SLOT_AFFIX_MODE: "retain",
  SIM_EQUIPMENT_SLOT_MODE: "standard",
  SIM_INDEPENDENT_RUN_RANDOM: "0",
  SIM_MATCHING_DEFINITION: "exact",
  SIM_MADI_COST: "",
  SIM_MADI_HEAL_MAX: "",
  SIM_MADI_HEAL_MIN: "",
  SIM_PRESET: "",
  SIM_RACE_BIAS: "",
  SIM_RUNS: String(RUNS_PER_CLASS),
  SIM_SEED: "461",
  SIM_SCENARIOS: SCENARIO_IDS.join(","),
  SIM_SUPPORT_SUPPLY_CEILING: "none",
  STATUS_CURE_HP_THRESHOLD: "0.35",
  STATUS_CURE_MERCHANT_POLICY: "missing",
  STATUS_CURE_POLICY: "smart",
  TRAP_AVOIDANCE_POLICY: "ev",
  TRAP_DAMAGE_MULTIPLIER: "1",
  TRAP_POLICY: "conservative",
  SIM_EXPLORATION_FACTOR: "1.4",
  SIM_MAP_STATS: "0",
  SIM_DAMAGE_PROBE: "0"
});

for (const key of ["SIM_PARALLEL", "SIM_MAP_CACHE_ENTRIES", "SIM_SKIP_PROVENANCE"]) {
  if (process.env[key] !== undefined) {
    throw new Error(`${key} must be omitted for Issue #612 measurement`);
  }
}
for (const key of ["SIM_EXPLORE_SPELLS", "SIM_ALLOW_STALE_TREE"]) {
  if (process.env[key] !== undefined) {
    throw new Error(`${key} must be omitted for Issue #612 measurement`);
  }
}
const forbiddenOverrides = [
  "SIM_CORE_ENCOUNTER_CEILING",
  "SIM_CORE_WORKSHOP_GATE",
  "SIM_AFFIXLESS_DUPLICATE_COUNT",
  "SIM_AFFIXLESS_DUPLICATE_SLOT",
  "SIM_HEALING_SPELL_PROFILE",
  "SIM_MADI_HEAL_MIN",
  "SIM_MADI_HEAL_MAX",
  "SIM_MADI_COST",
  "SIM_SUPPORT_SUPPLY_CEILING",
  "SIM_EQUIPMENT_SLOT_MODE",
  "SIM_EQUIPMENT_SLOT_AFFIX_MODE",
  "SIM_EQUIPMENT_POLICY",
  "SIM_MATCHING_DEFINITION",
  "SIM_CURSE_LOCK_MODE",
  "TRAP_BONUS_OVERRIDE",
  "TRAP_SENSE_OVERRIDE"
];
for (const key of forbiddenOverrides) {
  if (process.env[key] !== undefined && !Object.hasOwn(FIXED_ENV, key)) {
    throw new Error(`${key} must remain unset for Issue #612 measurement`);
  }
}

for (const [key, value] of Object.entries(FIXED_ENV)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
    continue;
  }
  if (process.env[key] !== value) {
    throw new Error(`Issue #612 fixed env mismatch: ${key}=${process.env[key]}`);
  }
}

const SIM_SEED = Number(process.env.SIM_SEED) >>> 0;
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(SCRIPT_PATH);
const SOURCE_HELPER_PATH = join(SCRIPT_DIR, "sim_depth_material_ev.js");
const INSTRUMENTED_HELPER_PATH = join(
  SCRIPT_DIR,
  ".issue-612-sim-depth-material-ev.js"
);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function countOccurrences(source, needle) {
  return source.split(needle).length - 1;
}

function instrumentSimulationHelper() {
  const original = readFileSync(SOURCE_HELPER_PATH, "utf8");
  let instrumented = original;
  const encounterNeedle = "Math.random() < getEncounterChance(step, state);";
  if (countOccurrences(instrumented, encounterNeedle) !== 1) {
    throw new Error("Issue #612 helper instrumentation: encounter call site changed");
  }
  instrumented = instrumented.replace(
    encounterNeedle,
    "issue612EncounterRoll(getEncounterChance(step, state), state);"
  );

  const encounterFunctionNeedle =
    "function getEncounterChance(floorStep, state = null) {";
  if (countOccurrences(instrumented, encounterFunctionNeedle) !== 1) {
    throw new Error("Issue #612 helper instrumentation: encounter function changed");
  }
  instrumented = instrumented.replace(
    encounterFunctionNeedle,
    `function issue612EncounterRoll(baseRate, state = null) {
  const override = globalThis.__issue612EncounterRateOverride;
  const requestedRate = typeof override === "function"
    ? override(baseRate, state)
    : baseRate;
  const rate = Math.max(0, Math.min(1, Number(requestedRate)));
  return Math.random() < rate;
}

${encounterFunctionNeedle}`
  );

  const startNeedle =
    "        startMp: state.party[0].mp,\n        startHealPotions:";
  if (countOccurrences(instrumented, startNeedle) !== 1) {
    throw new Error("Issue #612 helper instrumentation: encounter diagnostics changed");
  }
  instrumented = instrumented.replace(
    startNeedle,
    "        startMp: state.party[0].mp,\n" +
      "        startLevel: state.party[0].level,\n" +
      "        startExp: state.party[0].exp,\n" +
      "        startRunExp: state.currentRun?.expGained || 0,\n" +
      "        startHealPotions:"
  );

  const finishNeedle =
    "      encounterDiagnostic.result = result;\n      if (fullDiagnostics) {";
  if (countOccurrences(instrumented, finishNeedle) !== 1) {
    throw new Error("Issue #612 helper instrumentation: encounter finish changed");
  }
  instrumented = instrumented.replace(
    finishNeedle,
    "      encounterDiagnostic.result = result;\n" +
      "      encounterDiagnostic.endLevel = state.party[0].level;\n" +
      "      encounterDiagnostic.endExp = state.party[0].exp;\n" +
      "      encounterDiagnostic.endRunExp = state.currentRun?.expGained || 0;\n" +
      "      encounterDiagnostic.expGained = Math.max(\n" +
      "        0,\n" +
      "        encounterDiagnostic.endRunExp - encounterDiagnostic.startRunExp\n" +
      "      );\n" +
      "      if (fullDiagnostics) {"
  );

  const sourceSha256 = sha256(original);
  const instrumentedSha256 = sha256(instrumented);
  writeFileSync(INSTRUMENTED_HELPER_PATH, instrumented);
  return { sourceSha256, instrumentedSha256 };
}

function readExistingHelperInfo() {
  const original = readFileSync(SOURCE_HELPER_PATH, "utf8");
  const instrumented = readFileSync(INSTRUMENTED_HELPER_PATH, "utf8");
  return {
    sourceSha256: sha256(original),
    instrumentedSha256: sha256(instrumented)
  };
}

const HELPER_SOURCE_INFO = isMainThread
  ? instrumentSimulationHelper()
  : readExistingHelperInfo();
const simulationModule = await import(
  `${pathToFileURL(INSTRUMENTED_HELPER_PATH).href}?issue612=${HELPER_SOURCE_INFO.instrumentedSha256.slice(0, 16)}`
);
const {
  calibrateCoreScoringProfile,
  generateSharedRunFloor: generateSharedRunFloorSource,
  getResolvedSimulationEnv,
  getScenarioById,
  MEASUREMENT_PROVENANCE,
  resetSimulationRandom,
  simulateRun,
  SIM_CLASSES
} = simulationModule;

if (
  SIM_CLASSES.length < BASIC_CLASSES.length ||
  BASIC_CLASSES.some(className => !SIM_CLASSES.includes(className))
) {
  throw new Error(`basic class set mismatch: ${SIM_CLASSES.join(",")}`);
}
if (EXP_LEVELS.length < 13) {
  throw new Error(`EXP_LEVELS max level is below lv12: ${EXP_LEVELS.length - 1}`);
}

function hashSeed(text) {
  let seed = 2166136261;
  for (let index = 0; index < text.length; index++) {
    seed ^= text.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

function scenarioForRun(runIndex) {
  if (SMOKE) return SCENARIO_IDS[0];
  const position = ((runIndex * 37) % RUNS_PER_CLASS + 0.5) /
    RUNS_PER_CLASS * WORKSHOP_TOTAL;
  let cumulative = 0;
  for (const [scenarioId, weight] of WORKSHOP_DISTRIBUTION) {
    cumulative += weight;
    if (position < cumulative) return scenarioId;
  }
  return WORKSHOP_DISTRIBUTION.at(-1)[0];
}

export function generateSharedRunFloor(args) {
  return generateSharedRunFloorSource(args);
}

function createXpCell() {
  return {
    encounters: 0,
    awardedEncounters: 0,
    xpSum: 0,
    xpSumSquares: 0
  };
}

function createFloorSupply() {
  return Object.fromEntries(
    Array.from({ length: TARGET_DEPTH }, (_, floor) => [
      floor + 1,
      Object.fromEntries(XP_SOURCES.map(source => [source, createXpCell()]))
    ])
  );
}

function sourceForEncounter(type) {
  if (type === "normal") return "normal";
  if (type === "boss") return "boss";
  return "other";
}

function summarizeDiagnostics(diagnostics, result) {
  if (!diagnostics || diagnostics.level !== "full") {
    throw new Error("Issue #612 baseline run did not produce full diagnostics");
  }
  const byFloor = createFloorSupply();
  let totalExp = 0;
  let totalEncounters = 0;
  const levelTransitions = [];
  for (const encounter of diagnostics.encounters || []) {
    const floor = Number(encounter.floor);
    const source = sourceForEncounter(encounter.type);
    const cell = byFloor[floor]?.[source];
    if (!cell) throw new Error(`diagnostic floor out of range: ${floor}`);
    const xp = Number(encounter.expGained);
    if (!Number.isFinite(xp) || xp < 0) {
      throw new Error(`diagnostic exp delta is invalid at B${floor}: ${xp}`);
    }
    cell.encounters++;
    cell.awardedEncounters += Number(xp > 0);
    cell.xpSum += xp;
    cell.xpSumSquares += xp * xp;
    totalExp += xp;
    totalEncounters++;
    if (Number(encounter.endLevel) > Number(encounter.startLevel)) {
      levelTransitions.push({
        floor,
        from: encounter.startLevel,
        to: encounter.endLevel,
        exp: encounter.endExp
      });
    }
  }
  if (totalExp !== Number(result.expGained)) {
    throw new Error(
      `diagnostic XP mismatch: encounter=${totalExp}, result=${result.expGained}`
    );
  }
  const buildSnapshots = (diagnostics.buildSnapshots || [])
    .filter(snapshot => snapshot.point === "floor-start")
    .map(snapshot => ({
      floor: snapshot.floor,
      level: snapshot.level,
      hp: snapshot.hp,
      maxHp: snapshot.maxHp,
      mp: snapshot.mp,
      maxMp: snapshot.maxMp,
      atk: snapshot.atk,
      def: snapshot.def,
      equipmentStatScore: snapshot.equipmentStatScore,
      combatCoreScore: snapshot.combatCoreScore,
      combatCoreScoreAll: snapshot.combatCoreScoreAll,
      combatBuildScore: snapshot.combatBuildScore,
      totalGreedyScore: snapshot.totalGreedyScore,
      coreIds: [...(snapshot.coreIds || [])],
      combatCoreIds: [...(snapshot.combatCoreIds || [])]
    }));
  return {
    byFloor,
    totalExp,
    totalEncounters,
    levelTransitions,
    buildSnapshots
  };
}

function compactDeathSnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    source: snapshot.source,
    floor: snapshot.floor,
    round: snapshot.round,
    cause: snapshot.cause,
    damageMaxHpRate: snapshot.damageMaxHpRate
  };
}

function sumObjectValues(value) {
  return Object.values(value || {}).reduce(
    (sum, amount) => sum + (Number(amount) || 0),
    0
  );
}

function causeBucket(row) {
  const type = String(row.deathEncounterType || "");
  const cause = String(row.deathCause || "");
  if (type.includes("trap") || cause.includes("罠")) return "trap";
  if (type === "boss") return "boss";
  if (type === "normal") return "normal-combat";
  if (["elite", "midboss"].includes(type)) return "other-combat";
  return "other";
}

function levelBucket(level) {
  const value = Number(level) || 1;
  if (value <= 1) return "lv1";
  if (value <= 2) return "lv2";
  if (value <= 3) return "lv3";
  if (value <= 4) return "lv4";
  if (value <= 5) return "lv5";
  if (value <= 6) return "lv6";
  if (value <= 7) return "lv7";
  if (value <= 8) return "lv8";
  if (value <= 11) return "lv9-11";
  return "lv12+";
}

function levelBand(level) {
  const value = Number(level) || 1;
  return LEVEL_BANDS.find(([, min, max]) => value >= min && value <= max)?.[0] || "L6+";
}

function endpoint(result, floor) {
  const entrant = result.reachedFloor >= floor;
  if (floor === 20) {
    return {
      entrant,
      breakthrough: result.survived && entrant,
      death: entrant && result.deathFloor === floor,
      survived: result.survived && entrant
    };
  }
  return {
    entrant,
    breakthrough: result.reachedFloor > floor,
    death: entrant && result.deathFloor === floor,
    survived: result.survived && entrant
  };
}

export function runIssue612Task(task, context) {
  const scenario = getScenarioById(task.scenarioId);
  const scoringProfile = context.scoringProfiles[task.scenarioId];
  if (!scoringProfile) {
    throw new Error(`missing scoring profile: ${task.scenarioId}`);
  }
  const randomSequenceId = `${task.scenarioId}:${task.className}:${task.runIndex}`;
  resetSimulationRandom(hashSeed(`${SIM_SEED}:issue612:${randomSequenceId}`));
  const previousOverride = globalThis.__issue612EncounterRateOverride;
  globalThis.__issue612EncounterRateOverride = task.rateMultiplier === null
    ? null
    : baseRate => baseRate * task.rateMultiplier;
  try {
    const runScenario = task.collectDiagnostics
      ? { ...scenario, simDiagnosticLevel: "full" }
      : scenario;
    const result = simulateRun({
      className: task.className,
      startFloor: 1,
      targetDepth: TARGET_DEPTH,
      runIndex: task.runIndex,
      seriesId: "issue612-exp-pace",
      scoringProfile,
      scenario: runScenario,
      workshop: scenario.workshop,
      collectDiagnostics: task.collectDiagnostics
    });
    const supply = task.collectDiagnostics
      ? summarizeDiagnostics(result.diagnostics, result)
      : null;
    const statusCuresUsed = sumObjectValues(result.statusCureItemsUsed);
    return {
      className: task.className,
      runIndex: task.runIndex,
      scenarioId: task.scenarioId,
      sampleSet: task.sampleSet,
      conditionId: task.conditionId,
      rateMultiplier: task.rateMultiplier,
      randomSequenceId,
      reachedFloor: result.reachedFloor,
      endFloor: result.endFloor,
      deathFloor: result.deathFloor,
      survived: Boolean(result.survived),
      died: Boolean(result.died),
      outcome: result.outcome,
      finalLevel: result.finalLevel,
      expGained: result.expGained,
      finalMp: result.finalMp,
      finalMaxMp: result.finalMaxMp,
      deathCause: result.deathCause,
      deathEncounterType: result.deathEncounterType,
      deathSnapshot: compactDeathSnapshot(result.deathSnapshot),
      b5DeathCause: result.b5DeathCause,
      normalEncounterCount: result.normalCombatTelemetry?.encounters || 0,
      battles: result.battles,
      fleeCount: result.fleeCount,
      townPortalsUsed: result.townPortalsUsed,
      recoveryPotionsUsed: result.recoveryPotionsUsed,
      trapEncounterCount: result.trapEncounterCount,
      trapDamageHp: result.trapDamageHp,
      statusCuresUsed,
      mpDepleted: Boolean(result.mpDepleted),
      workshopEffects: result.workshopEffects,
      coreEncountered: result.coreEncounteredIds.length > 0,
      coreEquipped: Boolean(result.coreEquipped),
      coreEverEquipped: result.coreEverEquippedIds.length > 0,
      coreEncounteredIds: [...result.coreEncounteredIds],
      finalCoreIds: [...result.finalCoreIds],
      equipmentUpgrades: result.equipmentUpgrades,
      equipmentFound: result.equipmentFound,
      supply,
      buildSnapshots: supply?.buildSnapshots || null,
      endpoints: Object.fromEntries(
        TARGET_FLOORS.map(floor => [String(floor), endpoint(result, floor)])
      )
    };
  } finally {
    globalThis.__issue612EncounterRateOverride = previousOverride;
  }
}

function buildTasks() {
  const tasks = [];
  for (const className of BASIC_CLASSES) {
    for (let runIndex = 0; runIndex < RUNS_PER_CLASS; runIndex++) {
      tasks.push({
        className,
        runIndex,
        scenarioId: scenarioForRun(runIndex),
        sampleSet: "baseline-weighted",
        conditionId: "baseline",
        rateMultiplier: null,
        collectDiagnostics: true
      });
    }
  }
  for (const scenarioId of SCENARIO_IDS) {
    for (const className of BASIC_CLASSES) {
      for (let runIndex = 0; runIndex < WORKSHOP_AUDIT_RUNS_PER_CLASS; runIndex++) {
        tasks.push({
          className,
          runIndex,
          scenarioId,
          sampleSet: "workshop-audit",
          conditionId: "baseline",
          rateMultiplier: null,
          collectDiagnostics: true
        });
      }
    }
  }
  for (const rateMultiplier of RATE_MULTIPLIERS) {
    for (const className of BASIC_CLASSES) {
      for (let runIndex = 0; runIndex < RUNS_PER_CLASS; runIndex++) {
        tasks.push({
          className,
          runIndex,
          scenarioId: scenarioForRun(runIndex),
          sampleSet: "rate-sweep",
          conditionId: `rate-${rateMultiplier}x`,
          rateMultiplier,
          collectDiagnostics: false
        });
      }
    }
  }
  return tasks;
}

function calibrateProfiles() {
  const scoringProfiles = {};
  globalThis.__issue612EncounterRateOverride = null;
  for (const scenarioId of SCENARIO_IDS) {
    const scenario = getScenarioById(scenarioId);
    resetSimulationRandom(SIM_SEED);
    scoringProfiles[scenarioId] = calibrateCoreScoringProfile(
      CALIBRATION_RUNS,
      scenario,
      "powder",
      scenario.workshop
    );
  }
  return scoringProfiles;
}

function auditRows(rows, tasks) {
  if (rows.length !== tasks.length) {
    throw new Error(`raw result audit failed: rows=${rows.length}/${tasks.length}`);
  }
  const keys = new Set();
  for (const row of rows) {
    const key = [
      row.sampleSet,
      row.conditionId,
      row.className,
      row.scenarioId,
      row.runIndex
    ].join(":");
    if (keys.has(key)) throw new Error(`duplicate run key: ${key}`);
    keys.add(key);
    if (Number(row.survived) + Number(row.died) !== 1) {
      throw new Error(`non-terminal run result: ${JSON.stringify(row)}`);
    }
    if (!Number.isFinite(row.expGained) || row.expGained < 0) {
      throw new Error(`invalid expGained: ${JSON.stringify(row)}`);
    }
    if (row.sampleSet !== "rate-sweep" && !row.supply) {
      throw new Error(`missing supply diagnostics: ${key}`);
    }
  }
}

async function measure(scoringProfiles) {
  const tasks = buildTasks();
  const resolvedParallelism = resolveSimParallelism(tasks.length);
  const started = performance.now();
  const cpuStarted = process.cpuUsage();
  const rows = await runSimTasks({
    moduleUrl: pathToFileURL(SCRIPT_PATH).href,
    exportName: "runIssue612Task",
    runTask: runIssue612Task,
    tasks,
    context: { scoringProfiles },
    mapGeneratorExportName: "generateSharedRunFloor"
  });
  const cpu = process.cpuUsage(cpuStarted);
  auditRows(rows, tasks);
  return {
    rows,
    resolvedParallelism,
    wallSeconds: (performance.now() - started) / 1000,
    cpuSeconds: (cpu.user + cpu.system) / 1e6
  };
}

function meanInterval(values) {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) {
    return { n: 0, estimate: null, low: null, high: null, status: "未観測" };
  }
  const estimate = finite.reduce((sum, value) => sum + value, 0) / finite.length;
  if (finite.length < 2) {
    return {
      n: finite.length,
      estimate,
      low: null,
      high: null,
      status: "未確定（N<30）"
    };
  }
  const variance = finite.reduce(
    (sum, value) => sum + (value - estimate) ** 2,
    0
  ) / (finite.length - 1);
  const margin = R95 * Math.sqrt(variance / finite.length);
  return {
    n: finite.length,
    estimate,
    low: estimate - margin,
    high: estimate + margin,
    status: finite.length < 30 ? "未確定（N<30）" : "確定"
  };
}

function wilson(successes, trials) {
  if (trials <= 0) {
    return {
      successes,
      trials,
      estimate: null,
      low: null,
      high: null,
      status: "未観測"
    };
  }
  const p = successes / trials;
  const denominator = 1 + R95 ** 2 / trials;
  const center = (p + R95 ** 2 / (2 * trials)) / denominator;
  const halfWidth = R95 * Math.sqrt(
    p * (1 - p) / trials + R95 ** 2 / (4 * trials ** 2)
  ) / denominator;
  return {
    successes,
    trials,
    estimate: p,
    low: Math.max(0, center - halfWidth),
    high: Math.min(1, center + halfWidth),
    status: trials < 30 ? "未確定（N<30）" : "確定"
  };
}

function meanFromMoments(sum, sumSquares, n) {
  if (n <= 0) return meanInterval([]);
  const estimate = sum / n;
  if (n < 2) {
    return {
      n,
      estimate,
      low: null,
      high: null,
      status: "未確定（N<30）"
    };
  }
  const variance = Math.max(0, (sumSquares - sum * sum / n) / (n - 1));
  const margin = R95 * Math.sqrt(variance / n);
  return {
    n,
    estimate,
    low: estimate - margin,
    high: estimate + margin,
    status: n < 30 ? "未確定（N<30）" : "確定"
  };
}

function formatNumber(value, digits = 2) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : Number(value).toFixed(digits);
}

function formatMean(stat, digits = 2) {
  if (!stat || stat.n === 0 || stat.estimate === null) return "未観測";
  const interval = stat.low === null
    ? "CI未算出"
    : `${formatNumber(stat.low, digits)}, ${formatNumber(stat.high, digits)}`;
  const status = stat.n < 30 ? "; 未確定" : "";
  return `${formatNumber(stat.estimate, digits)} [${interval}; N=${stat.n}${status}]`;
}

function formatRate(stat, digits = 1) {
  if (!stat || stat.trials === 0 || stat.estimate === null) return "未観測";
  const status = stat.trials < 30 ? "; 未確定" : "";
  return `${formatNumber(stat.estimate * 100, digits)}% [` +
    `${formatNumber(stat.low * 100, digits)}%, ${formatNumber(stat.high * 100, digits)}%; ` +
    `${stat.successes}/${stat.trials}${status}]`;
}

function formatCountRate(successes, trials) {
  return formatRate(wilson(successes, trials));
}

function formatMultiplier(value) {
  return RATE_LABELS[String(value)] || `${value}x`;
}

function meanForRows(rows, selector) {
  return meanInterval(rows.map(selector));
}

function sourceStats(rows, floor, source, entrantOnly = false) {
  const selected = entrantOnly
    ? rows.filter(row => row.reachedFloor >= floor)
    : rows;
  const values = selected.map(row => row.supply.byFloor[floor][source].xpSum);
  return {
    runMean: meanInterval(values),
    encounterMoments: selected.reduce((acc, row) => {
      const cell = row.supply.byFloor[floor][source];
      acc.n += cell.encounters;
      acc.sum += cell.xpSum;
      acc.sumSquares += cell.xpSumSquares;
      acc.awarded += cell.awardedEncounters;
      return acc;
    }, { n: 0, sum: 0, sumSquares: 0, awarded: 0 })
  };
}

function encounterStats(rows, floor, entrantOnly = false) {
  const selected = entrantOnly
    ? rows.filter(row => row.reachedFloor >= floor)
    : rows;
  return selected.reduce((acc, row) => {
    XP_SOURCES.forEach(source => {
      const cell = row.supply.byFloor[floor][source];
      acc.n += cell.encounters;
      acc.sum += cell.xpSum;
      acc.sumSquares += cell.xpSumSquares;
      acc.awarded += cell.awardedEncounters;
    });
    return acc;
  }, { n: 0, sum: 0, sumSquares: 0, awarded: 0 });
}

function aggregateEndpoints(rows, floor) {
  const entrants = rows.filter(row => row.reachedFloor >= floor);
  const passCount = floor === 20
    ? rows.filter(row => row.survived && row.reachedFloor >= floor).length
    : rows.filter(row => row.reachedFloor > floor).length;
  const passEntrantCount = floor === 20
    ? entrants.filter(row => row.survived).length
    : entrants.filter(row => row.reachedFloor > floor).length;
  const deathAtFloor = rows.filter(row => row.deathFloor === floor).length;
  const deathAtFloorEntrant = entrants.filter(row => row.deathFloor === floor).length;
  return {
    reached: wilson(entrants.length, rows.length),
    breakthroughAll: wilson(passCount, rows.length),
    breakthroughEntrant: wilson(passEntrantCount, entrants.length),
    deathAll: wilson(deathAtFloor, rows.length),
    deathEntrant: wilson(deathAtFloorEntrant, entrants.length),
    survivedAll: wilson(
      rows.filter(row => row.survived && row.reachedFloor >= floor).length,
      rows.length
    ),
    survivedEntrant: wilson(
      entrants.filter(row => row.survived).length,
      entrants.length
    )
  };
}

function snapshotAtFloor(row, floor) {
  return row.buildSnapshots?.find(snapshot => snapshot.floor === floor) || null;
}

function renderTable(lines, headers, rows) {
  lines.push(`| ${headers.join(" | ")} |`);
  lines.push(`| ${headers.map(() => "---").join(" | ")} |`);
  rows.forEach(row => lines.push(`| ${row.join(" | ")} |`));
  lines.push("");
}

function renderXpSummary(lines, baselineRows) {
  lines.push(
    "## 1. 経験値供給の分解",
    "",
    "通常遭遇 / ボス / その他（中ボス・任意エリート等）を、実報酬の `expGained` delta で分類した。" +
      " run平均は全run分母と当該階到達run分母を分け、遭遇平均は実遭遇回数分母を併記する。" +
      " 平均値の括弧は正規近似95% CI、率はWilson 95% CI。",
    "",
    "### 1-1. 1 runあたり獲得経験値（全run分母）",
    ""
  );
  const totalRows = [];
  for (const className of BASIC_CLASSES) {
    const rows = baselineRows.filter(row => row.className === className);
    const total = meanForRows(rows, row => row.expGained);
    const sourceMeans = Object.fromEntries(
      XP_SOURCES.map(source => [source, meanForRows(rows, row =>
        Object.values(row.supply.byFloor).reduce(
          (sum, floor) => sum + floor[source].xpSum,
          0
        )
      )])
    );
    const normalEncounters = meanForRows(rows, row =>
      Object.values(row.supply.byFloor).reduce(
        (sum, floor) => sum + floor.normal.encounters,
        0
      )
    );
    totalRows.push([
      CLASS_LABELS[className],
      formatMean(total, 1),
      formatMean(sourceMeans.normal, 1),
      formatMean(sourceMeans.boss, 1),
      formatMean(sourceMeans.other, 1),
      formatMean(normalEncounters, 2)
    ]);
  }
  const allRows = baselineRows;
  const allTotal = meanForRows(allRows, row => row.expGained);
  const allSourceMeans = Object.fromEntries(
    XP_SOURCES.map(source => [source, meanForRows(allRows, row =>
      Object.values(row.supply.byFloor).reduce(
        (sum, floor) => sum + floor[source].xpSum,
        0
      )
    )])
  );
  totalRows.push([
    "4職合計",
    formatMean(allTotal, 1),
    formatMean(allSourceMeans.normal, 1),
    formatMean(allSourceMeans.boss, 1),
    formatMean(allSourceMeans.other, 1),
    formatMean(meanForRows(allRows, row =>
      Object.values(row.supply.byFloor).reduce(
        (sum, floor) => sum + floor.normal.encounters,
        0
      )
    ), 2)
  ]);
  renderTable(
    lines,
    ["職", "総EXP/run", "通常EXP/run", "ボスEXP/run", "その他EXP/run", "通常遭遇/run"],
    totalRows
  );

  lines.push("### 1-2. 階層別供給と遭遇1回あたり平均（職別）", "");
  const floorRows = [];
  for (const className of BASIC_CLASSES) {
    const classRows = baselineRows.filter(row => row.className === className);
    for (let floor = 1; floor < TARGET_DEPTH; floor++) {
      const normal = sourceStats(classRows, floor, "normal");
      const boss = sourceStats(classRows, floor, "boss");
      const other = sourceStats(classRows, floor, "other");
      const entrantRows = classRows.filter(row => row.reachedFloor >= floor);
      const allEncounterMoments = encounterStats(classRows, floor);
      const entrantEncounterMoments = encounterStats(classRows, floor, true);
      const normalEntrant = sourceStats(classRows, floor, "normal", true);
      const encounterMean = meanFromMoments(
        normal.encounterMoments.sum,
        normal.encounterMoments.sumSquares,
        normal.encounterMoments.n
      );
      const allEncounterMean = meanFromMoments(
        allEncounterMoments.sum,
        allEncounterMoments.sumSquares,
        allEncounterMoments.n
      );
      const entrantEncounterMean = meanFromMoments(
        entrantEncounterMoments.sum,
        entrantEncounterMoments.sumSquares,
        entrantEncounterMoments.n
      );
      const encounterMeanEntrant = meanFromMoments(
        normalEntrant.encounterMoments.sum,
        normalEntrant.encounterMoments.sumSquares,
        normalEntrant.encounterMoments.n
      );
      floorRows.push([
        CLASS_LABELS[className],
        `B${floor}`,
        `N=${classRows.length}/${entrantRows.length}`,
        formatMean(normal.runMean, 1),
        formatMean(boss.runMean, 1),
        formatMean(other.runMean, 1),
        `${formatMean(allEncounterMean, 1)} (${allEncounterMoments.n}回)`,
        `${formatMean(entrantEncounterMean, 1)} (${entrantEncounterMoments.n}回)`,
        `${formatMean(encounterMean, 1)} (${normal.encounterMoments.n}回)`,
        `${formatMean(encounterMeanEntrant, 1)} (${normalEntrant.encounterMoments.n}回)`
      ]);
    }
  }
  renderTable(
    lines,
    [
      "職",
      "階",
      "N 全run/到達run",
      "通常EXP/run 全run",
      "ボスEXP/run 全run",
      "その他EXP/run 全run",
      "全遭遇1回EXP 全run",
      "全遭遇1回EXP 到達run",
      "通常1回EXP 全run",
      "通常1回EXP 到達run"
    ],
    floorRows
  );

  lines.push(
    "### 1-3. 経験値曲線と実獲得ペース（最終到達レベル）",
    "",
    "`EXP_LEVELS` の累積必要量を正本として、最終EXPが各閾値へ届いた率を出す。" +
      " `lv12+` の分母も明示し、N=0は未観測として扱う。",
    ""
  );
  const curveRows = [];
  for (const className of BASIC_CLASSES) {
    const rows = baselineRows.filter(row => row.className === className);
    for (let level = 1; level <= 12; level++) {
      const threshold = EXP_LEVELS[level] || 0;
      const reached = rows.filter(row => row.finalLevel >= level).length;
      curveRows.push([
        CLASS_LABELS[className],
        `lv${level}`,
        String(threshold),
        formatCountRate(reached, rows.length),
        formatMean(meanForRows(rows, row => row.expGained), 1)
      ]);
    }
  }
  renderTable(
    lines,
    ["職", "閾値", "累積必要EXP", "最終lv以上率（全run分母）", "最終EXP平均"],
    curveRows
  );

  lines.push("### 1-4. どのレベルで詰まるか", "");
  const stallRows = [];
  for (const className of BASIC_CLASSES) {
    const rows = baselineRows.filter(row => row.className === className);
    for (let level = 1; level <= 12; level++) {
      const exactRows = rows.filter(row => row.finalLevel === level);
      const nextThreshold = EXP_LEVELS[level + 1] ?? null;
      const gap = nextThreshold === null
        ? meanInterval([])
        : meanForRows(exactRows, row => Math.max(0, nextThreshold - row.expGained));
      stallRows.push([
        CLASS_LABELS[className],
        `lv${level}`,
        `N=${exactRows.length}/${rows.length}`,
        formatMean(meanForRows(exactRows, row => row.expGained), 1),
        nextThreshold === null ? "上限" : String(nextThreshold),
        formatMean(gap, 1)
      ]);
    }
  }
  renderTable(
    lines,
    ["職", "最終lv", "該当N/全N", "該当runのEXP", "次lv必要EXP", "次lvまでの不足EXP"],
    stallRows
  );
}

function renderSweep(lines, sweepRows) {
  lines.push(
    "## 2. 遭遇率スイープ（#607以降・上下両方向）",
    "",
    "rate dial は現行の `getEncounterChance` の高率10% / 低率4%を同じ倍率で変える。" +
      " したがって 1x が現行基準線、0xがランダム遭遇なし（固定スケジュールのボス等は残る）、" +
      "25xが高率・低率とも100%へ飽和する。" +
      " 探索呪文は環境未設定（既定off）であり、呪文ロジックは変更していない。",
    "",
    "### 2-1. 到達階・B5/B10/B20 endpoint（全run分母 / 到達run分母）",
    ""
  );
  const endpointRows = [];
  for (const rateMultiplier of RATE_MULTIPLIERS) {
    const conditionRows = sweepRows.filter(
      row => row.rateMultiplier === rateMultiplier
    );
    for (const className of BASIC_CLASSES) {
      const rows = conditionRows.filter(row => row.className === className);
      for (const floor of TARGET_FLOORS) {
        const stats = aggregateEndpoints(rows, floor);
        endpointRows.push([
          formatMultiplier(rateMultiplier),
          CLASS_LABELS[className],
          `B${floor}`,
          formatRate(stats.reached),
          formatRate(stats.breakthroughAll),
          formatRate(stats.breakthroughEntrant),
          formatRate(stats.deathAll),
          formatRate(stats.deathEntrant),
          formatRate(stats.survivedAll),
          formatRate(stats.survivedEntrant),
          formatMean(meanForRows(rows, row => row.reachedFloor), 2)
        ]);
      }
    }
  }
  renderTable(
    lines,
    [
      "遭遇倍率",
      "職",
      "目標",
      "到達率 全run",
      "突破率 全run",
      "突破率 到達run",
      "死亡率 全run",
      "死亡率 到達run",
      "生還率 全run",
      "生還率 到達run",
      "到達階平均"
    ],
    endpointRows
  );

  lines.push("### 2-2. 全run死亡率と到達レベル分布（全run分母）", "");
  const overallRows = [];
  const levelRows = [];
  for (const rateMultiplier of RATE_MULTIPLIERS) {
    const conditionRows = sweepRows.filter(
      row => row.rateMultiplier === rateMultiplier
    );
    for (const className of BASIC_CLASSES) {
      const rows = conditionRows.filter(row => row.className === className);
      overallRows.push([
        formatMultiplier(rateMultiplier),
        CLASS_LABELS[className],
        formatRate(wilson(rows.filter(row => row.died).length, rows.length)),
        formatMean(meanForRows(rows, row => row.finalLevel), 2),
        formatMean(meanForRows(rows, row => row.expGained), 1),
        formatMean(meanForRows(rows, row => row.normalEncounterCount), 2)
      ]);
      levelRows.push([
        formatMultiplier(rateMultiplier),
        CLASS_LABELS[className],
        ...LEVEL_BUCKETS.map(bucket => formatRate(
          wilson(rows.filter(row => levelBucket(row.finalLevel) === bucket).length, rows.length)
        ))
      ]);
    }
  }
  renderTable(
    lines,
    ["遭遇倍率", "職", "死亡率 全run", "最終lv平均", "EXP/run平均", "通常遭遇/run"],
    overallRows
  );
  renderTable(
    lines,
    ["遭遇倍率", "職", ...LEVEL_BUCKETS.map(bucket => bucket.replace("lv", "lv"))],
    levelRows
  );

  lines.push(
    "### 2-3. 到達run内の到達レベル分布（B5 entrant / B10 entrant 分母）",
    "",
    "到達run分母のレベル分布。低遭遇率で到達run自体が30未満のセルは「条件に到達しない」" +
      "のか「N不足」なのかを分けるため、Nを表に残す。",
    ""
  );
  const entrantLevelRows = [];
  for (const rateMultiplier of RATE_MULTIPLIERS) {
    const conditionRows = sweepRows.filter(
      row => row.rateMultiplier === rateMultiplier
    );
    for (const className of BASIC_CLASSES) {
      const classRows = conditionRows.filter(row => row.className === className);
      for (const floor of [5, 10]) {
        const entrants = classRows.filter(row => row.reachedFloor >= floor);
        entrantLevelRows.push([
          formatMultiplier(rateMultiplier),
          CLASS_LABELS[className],
          `B${floor} N=${entrants.length}/${classRows.length}`,
          ...LEVEL_BUCKETS.map(bucket => formatRate(
            wilson(
              entrants.filter(row => levelBucket(row.finalLevel) === bucket).length,
              entrants.length
            )
          ))
        ]);
      }
    }
  }
  renderTable(
    lines,
    ["遭遇倍率", "職", "分母", ...LEVEL_BUCKETS],
    entrantLevelRows
  );

  lines.push(
    "### 2-4. 点推定がbit単位で一致したセル",
    "",
    "同じ点推定が出た場合は「差が無い」ではなく「その指標に効果が発生していない」と読む。" +
      " 以下は隣接倍率間で、到達階平均または主要endpointの推定値が `Object.is` で一致したもの。",
    ""
  );
  const identicalRows = [];
  for (let index = 1; index < RATE_MULTIPLIERS.length; index++) {
    const leftRate = RATE_MULTIPLIERS[index - 1];
    const rightRate = RATE_MULTIPLIERS[index];
    for (const className of BASIC_CLASSES) {
      const left = sweepRows.filter(row =>
        row.rateMultiplier === leftRate && row.className === className
      );
      const right = sweepRows.filter(row =>
        row.rateMultiplier === rightRate && row.className === className
      );
      const leftFloor = meanForRows(left, row => row.reachedFloor).estimate;
      const rightFloor = meanForRows(right, row => row.reachedFloor).estimate;
      const metrics = [
        ["到達階平均", leftFloor, rightFloor],
        ...TARGET_FLOORS.flatMap(floor => {
          const leftStats = aggregateEndpoints(left, floor);
          const rightStats = aggregateEndpoints(right, floor);
          return [
            [`B${floor}到達率`, leftStats.reached.estimate, rightStats.reached.estimate],
            [`B${floor}突破率全run`, leftStats.breakthroughAll.estimate, rightStats.breakthroughAll.estimate]
          ];
        })
      ];
      metrics.forEach(([metric, leftValue, rightValue]) => {
        if (leftValue !== null && Object.is(leftValue, rightValue)) {
          identicalRows.push([
            `${formatMultiplier(leftRate)}→${formatMultiplier(rightRate)}`,
            CLASS_LABELS[className],
            metric,
            formatNumber(leftValue, 6),
            "効果が発生していない"
          ]);
        }
      });
    }
  }
  if (identicalRows.length === 0) {
    lines.push("隣接倍率間にbit単位で一致する主要点推定は観測されなかった。", "");
  } else {
    renderTable(
      lines,
      ["倍率変化", "職", "指標", "一致値", "読み"],
      identicalRows
    );
  }
}

function renderDeathAnalysis(lines, baselineRows) {
  lines.push(
    "## 3. 「レベル不足で死ぬ」vs「レベルが上がる前に死ぬ」",
    "",
    "死亡runの最終levelは死亡時level、生還runの最終levelは撤退時levelである。" +
      " 同じ階層・同じlevelは、full diagnosticsのfloor-start snapshotで階層到達時点を固定して比較した。",
    "",
    "### 3-1. 死亡run / 生還runのレベル分布",
    ""
  );
  const distributionRows = [];
  for (const className of BASIC_CLASSES) {
    const classRows = baselineRows.filter(row => row.className === className);
    for (const [label, predicate] of [
      ["死亡", row => row.died],
      ["生還", row => row.survived]
    ]) {
      const rows = classRows.filter(predicate);
      distributionRows.push([
        CLASS_LABELS[className],
        label,
        `N=${rows.length}/${classRows.length}`,
        ...LEVEL_BUCKETS.map(bucket => formatRate(
          wilson(rows.filter(row => levelBucket(row.finalLevel) === bucket).length, rows.length)
        ))
      ]);
    }
  }
  renderTable(
    lines,
    ["職", "outcome", "分母", ...LEVEL_BUCKETS],
    distributionRows
  );

  lines.push(
    "### 3-2. 同じ階層・同じlevelで到達したrunの生存率",
    "",
    "level帯ではなくexact levelで分け、同じ階層・同じlevelに到達したrunの" +
      "最終生還率と次階層到達率を併記する。N=0はその条件に到達しないことを示す。",
    ""
  );
  const sameFloorRows = [];
  for (const className of BASIC_CLASSES) {
    const classRows = baselineRows.filter(row => row.className === className);
    for (const floor of BUILD_AUDIT_FLOORS) {
      for (let level = 1; level <= 12; level++) {
        const records = classRows.flatMap(row => {
          const snapshot = snapshotAtFloor(row, floor);
          return snapshot && Number(snapshot.level) === level
            ? [{ row, snapshot }]
            : [];
        });
        const passed = records.filter(item => item.row.reachedFloor > floor).length;
        const survived = records.filter(item => item.row.survived).length;
        sameFloorRows.push([
          CLASS_LABELS[className],
          `B${floor}`,
          `lv${level}`,
          formatRate(wilson(survived, records.length)),
          formatRate(wilson(passed, records.length)),
          `N=${records.length}`
        ]);
      }
    }
  }
  renderTable(
    lines,
    ["職", "到達階", "到達時exact level", "最終生還率", "次階層到達率", "同階層run N"],
    sameFloorRows
  );

  lines.push("### 3-3. 死因内訳（死亡run内、level帯別）", "");
  const deathCauseRows = [];
  const causeBuckets = ["normal-combat", "boss", "trap", "other-combat", "other"];
  for (const className of BASIC_CLASSES) {
    const deaths = baselineRows.filter(row => row.className === className && row.died);
    for (const [band] of LEVEL_BANDS) {
      const bandDeaths = deaths.filter(row => levelBand(row.finalLevel) === band);
      deathCauseRows.push([
        CLASS_LABELS[className],
        band,
        `N=${bandDeaths.length}/${deaths.length}`,
        ...causeBuckets.map(bucket => formatRate(
          wilson(bandDeaths.filter(row => causeBucket(row) === bucket).length, bandDeaths.length)
        ))
      ]);
    }
  }
  renderTable(
    lines,
    ["職", "死亡時level帯", "分母", "通常戦闘", "ボス", "罠", "その他戦闘", "その他"],
    deathCauseRows
  );
}

function renderGrowthPath(lines, workshopRows) {
  lines.push(
    "## 4. 経験値以外の成長経路（装備・工房・コア）",
    "",
    "工房状態ごとの専用N=100/職の実runを使う。B3/B5/B10は同じ深度に到達したrunの" +
      "floor-start snapshotで、levelと装備/コアの実効スコアを比較する。" +
      " これは「必要level」の観測 proxyであり、因果的な必要条件と断定しない。",
    "",
    "### 4-1. 工房状態別の到達・EXP・コア・装備",
    ""
  );
  const scenarioRows = [];
  for (const scenarioId of SCENARIO_IDS) {
    for (const className of BASIC_CLASSES) {
      const rows = workshopRows.filter(
        row => row.scenarioId === scenarioId && row.className === className
      );
      const b5 = rows.filter(row => row.reachedFloor >= 5);
      const b10 = rows.filter(row => row.reachedFloor >= 10);
      scenarioRows.push([
        scenarioId.replace("workshop-", ""),
        CLASS_LABELS[className],
        `N=${rows.length}`,
        formatMean(meanForRows(rows, row => row.finalLevel), 2),
        formatMean(meanForRows(rows, row => row.expGained), 1),
        formatMean(meanForRows(rows, row => row.reachedFloor), 2),
        formatRate(wilson(rows.filter(row => row.coreEncountered).length, rows.length)),
        formatRate(wilson(rows.filter(row => row.coreEquipped).length, rows.length)),
        formatRate(wilson(rows.filter(row => row.equipmentFound > 0).length, rows.length)),
        `B5 ${b5.length}; B10 ${b10.length}`
      ]);
    }
  }
  renderTable(
    lines,
    [
      "工房",
      "職",
      "N",
      "最終lv",
      "EXP/run",
      "到達階",
      "core遭遇run率",
      "core装備run率",
      "装備発見run率",
      "到達N"
    ],
    scenarioRows
  );

  lines.push("### 4-2. 同じ深度に到達したときのlevel・装備/コアスコア", "");
  const buildRows = [];
  for (const scenarioId of SCENARIO_IDS) {
    for (const className of BASIC_CLASSES) {
      const rows = workshopRows.filter(
        row => row.scenarioId === scenarioId && row.className === className
      );
      for (const floor of BUILD_AUDIT_FLOORS) {
        const records = rows.flatMap(row => {
          const snapshot = snapshotAtFloor(row, floor);
          return snapshot ? [{ row, snapshot }] : [];
        });
        const pass = records.filter(item => item.row.reachedFloor > floor).length;
        buildRows.push([
          scenarioId.replace("workshop-", ""),
          CLASS_LABELS[className],
          `B${floor}`,
          `N=${records.length}`,
          formatMean(meanInterval(records.map(item => item.snapshot.level)), 2),
          formatMean(meanInterval(records.map(item => item.snapshot.equipmentStatScore)), 1),
          formatMean(meanInterval(records.map(item => item.snapshot.combatCoreScore)), 1),
          formatMean(meanInterval(records.map(item => item.snapshot.combatBuildScore)), 1),
          formatRate(wilson(pass, records.length)),
          `lv帯: ${Object.entries(Object.fromEntries(LEVEL_BANDS.map(([band]) => [
            band,
            records.filter(item => levelBand(item.snapshot.level) === band).length
          ]))).map(([band, count]) => `${band}=${count}`).join(", ")}`
        ]);
      }
    }
  }
  renderTable(
    lines,
    [
      "工房",
      "職",
      "深度",
      "到達snapshot N",
      "到達時lv",
      "装備stat score",
      "combat core score",
      "combat build score",
      "次階層通過率",
      "level帯N"
    ],
    buildRows
  );

  lines.push(
    "### 4-3. 消耗品・帰還・罠を含む実 run モデル監査（基準線）",
    "",
    "実装経路で使用された消耗品・帰還の翼・罠被害を確認する。値が0の項目は" +
      "「安全」ではなく、その条件で実発動が観測されなかったことを示す。",
    ""
  );
  const auditRows = [];
  for (const className of BASIC_CLASSES) {
    const rows = workshopRows.filter(row => row.className === className);
    auditRows.push([
      CLASS_LABELS[className],
      formatMean(meanForRows(rows, row => row.recoveryPotionsUsed), 2),
      formatRate(wilson(rows.filter(row => row.townPortalsUsed > 0).length, rows.length)),
      formatMean(meanForRows(rows, row => row.trapEncounterCount), 2),
      formatMean(meanForRows(rows, row => row.trapDamageHp), 2),
      formatMean(meanForRows(rows, row => row.statusCuresUsed), 2),
      formatRate(wilson(rows.filter(row => row.fleeCount > 0).length, rows.length)),
      formatRate(wilson(rows.filter(row => row.mpDepleted).length, rows.length))
    ]);
  }
  renderTable(
    lines,
    [
      "職",
      "回復薬使用/run",
      "帰還使用run率",
      "罠遭遇/run",
      "罠被害HP/run",
      "状態薬使用/run",
      "逃走run率",
      "MP枯渇run率"
    ],
    auditRows
  );
}

function canonicalEnvironment(environment) {
  return Object.entries(environment)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n") + "\n";
}

function environmentForHash() {
  const resolved = getResolvedSimulationEnv();
  return {
    ...resolved,
    SIM_PRESET: process.env.SIM_PRESET,
    SIM_PARALLEL: "<omitted; runtime default>",
    SIM_MAP_CACHE_ENTRIES: "<omitted; runtime default 1024>",
    SIM_SKIP_PROVENANCE: "<omitted>",
    SIM_EXPLORE_SPELLS: "<omitted; default off>",
    SIM_ALLOW_STALE_TREE: "<omitted>",
    ISSUE612_RUNS_PER_CLASS: String(RUNS_PER_CLASS),
    ISSUE612_WORKSHOP_AUDIT_RUNS_PER_CLASS: String(WORKSHOP_AUDIT_RUNS_PER_CLASS),
    ISSUE612_CALIBRATION_RUNS: String(CALIBRATION_RUNS),
    ISSUE612_TARGET_DEPTH: String(TARGET_DEPTH),
    ISSUE612_CLASSES: BASIC_CLASSES.join(","),
    ISSUE612_WORKSHOP_DISTRIBUTION: WORKSHOP_DISTRIBUTION
      .map(([scenarioId, weight]) => `${scenarioId}:${weight}/${WORKSHOP_TOTAL}`)
      .join(","),
    ISSUE612_SCENARIOS: SCENARIO_IDS.join(","),
    ISSUE612_RATE_MULTIPLIERS: RATE_MULTIPLIERS.join(","),
    ISSUE612_RANDOM_SEQUENCE: "hash(SIM_SEED:issue612:scenarioId:className:runIndex)",
    ISSUE612_SERIES_ID: "issue612-exp-pace",
    ISSUE612_DIAGNOSTICS: "full baseline/workshop; off rate-sweep",
    ISSUE612_HELPER_SOURCE_SHA256: HELPER_SOURCE_INFO.sourceSha256,
    ISSUE612_HELPER_INSTRUMENTED_SHA256: HELPER_SOURCE_INFO.instrumentedSha256,
    ISSUE612_RATE_DIAL: "base encounter chance × multiplier; clamp 0..1"
  };
}

function renderMarkdown({
  rows,
  environment,
  envHash,
  provenance,
  calibration,
  measurement,
  rawPath,
  rawSha256,
  profileSha256
}) {
  const baselineRows = rows.filter(row => row.sampleSet === "baseline-weighted");
  const workshopRows = rows.filter(row => row.sampleSet === "workshop-audit");
  const sweepRows = rows.filter(row => row.sampleSet === "rate-sweep");
  const lines = [
    "# Issue #612 経験値ペースが到達レベルの律速か（測定）",
    "",
    `実行モード: ${SMOKE ? "smoke（N=1）" : "full（基準線/職N=500、工房監査/職/状態N=100、遭遇倍率/職/点N=500）"}。`,
    "設計・経験値曲線・遭遇率・敵EXP・上位呪文習得level・探索呪文ロジックは変更していない。",
    "simは`generateRunFloor`経由の既存`simulateRun`を使用し、round/reward/level-up、消耗品、帰還の翼、罠、装備、工房、coreの実経路を通した。",
    "率はWilson 95% CI、平均は正規近似95% CI。N<30は未確定として結論に使わず、到達N不足と分母N不足を表で区別した。",
    ""
  ];
  renderXpSummary(lines, baselineRows);
  renderSweep(lines, sweepRows);
  renderDeathAnalysis(lines, baselineRows);
  renderGrowthPath(lines, workshopRows);

  lines.push(
    "## 所見",
    "",
    "- 経験値供給の主経路は通常遭遇・ボス・その他に分解して判定する。通常遭遇1回あたりEXPと、階層到達runのrun平均を混同しない。",
    "- 遭遇倍率の上側でEXPとlevelが増えても、戦闘被害・回復薬・帰還発動も同じ実runで増減するため、到達率の解釈はlevel分布・死因・同階層同level表と併読する。",
    "- 工房/装備/coreの表は同じ深度に入った時点のlevelとcombat build scoreを比較する。装備やcoreの優位があっても、EXP供給そのものを増やしたとは扱わない。",
    "- 点推定がbit単位で一致するセルは、CIの重なりとは別に「効果が発生していない」と記載した。",
    "- この結果からの改善案は所見に限り、コードには実装していない。上位呪文習得levelや探索呪文使用方針も変更対象外。",
    ""
  );

  lines.push(
    "## 固定条件・出自・再現",
    "",
    `- source commit: \`${provenance?.sourceCommit || "unknown"}\``,
    `- origin/main ancestor: \`${provenance?.originMainAncestor ?? "unknown"}\`; stale tree allowed: \`${provenance?.staleTreeAllowed ?? "unknown"}\``,
    `- calibration: N=${CALIBRATION_RUNS}/scenario（4職を交互に含むrunner N）; ${calibration.wallSeconds.toFixed(3)}s wall, ` +
      `${calibration.cpuSeconds.toFixed(3)}s CPU; profile SHA-256 \`${profileSha256}\``,
    `- simulation: ${measurement.wallSeconds.toFixed(3)}s wall, ${measurement.cpuSeconds.toFixed(3)}s CPU; ` +
      `resolved parallelism=${measurement.resolvedParallelism}; rows=${rows.length}`,
    `- raw JSONL: \`${rawPath}\`; SHA-256 \`${rawSha256}\`（rawはgitignore対象・コミットしない）`,
    `- helper source SHA-256: \`${HELPER_SOURCE_INFO.sourceSha256}\`; runtime diagnostic shim SHA-256: \`${HELPER_SOURCE_INFO.instrumentedSha256}\``,
    "- `SIM_PARALLEL` / `SIM_MAP_CACHE_ENTRIES` / `SIM_SKIP_PROVENANCE` は未設定（runnerの既定値を使用）。",
    "- `SIM_EXPLORE_SPELLS` は未設定（PR #609で既定offの状態）。",
    "",
    "固定env（hash対象）:",
    "",
    "```text",
    canonicalEnvironment(environment).trimEnd(),
    "```",
    "",
    "再現コマンド:",
    "",
    "```sh",
    "node --check scratch/sim_issue_612_exp_pace.js",
    "ISSUE612_SMOKE=1 node scratch/sim_issue_612_exp_pace.js",
    "node scratch/sim_issue_612_exp_pace.js",
    "```",
    `env hash: \`${envHash}\``,
    "",
    "raw JSONLは再現コマンド実行時に `scratch/results/issue-612-exp-pace.jsonl` へ生成される。",
    ""
  );
  return lines.join("\n");
}

function writeRawJsonl(rows, rawPath) {
  const rawText = rows.map(row => JSON.stringify(row)).join("\n") + "\n";
  writeFileSync(rawPath, rawText);
  return { rawText, rawSha256: sha256(rawText) };
}

function removeTemporaryHelper() {
  if (!isMainThread || !existsSync(INSTRUMENTED_HELPER_PATH)) return;
  try {
    unlinkSync(INSTRUMENTED_HELPER_PATH);
  } catch (error) {
    console.error(`[WARN] temporary helper cleanup failed: ${error.message}`);
  }
}

async function main() {
  const calibrationStarted = performance.now();
  const calibrationCpuStarted = process.cpuUsage();
  const scoringProfiles = calibrateProfiles();
  const calibrationCpu = process.cpuUsage(calibrationCpuStarted);
  const calibration = {
    wallSeconds: (performance.now() - calibrationStarted) / 1000,
    cpuSeconds: (calibrationCpu.user + calibrationCpu.system) / 1e6
  };
  const profileSha256 = sha256(JSON.stringify(scoringProfiles));
  const measurement = await measure(scoringProfiles);
  const environment = environmentForHash();
  const envHash = sha256(canonicalEnvironment(environment));
  const resultDir = join(SCRIPT_DIR, "results");
  mkdirSync(resultDir, { recursive: true });
  const rawPath = join(resultDir, `${RESULT_BASENAME}.jsonl`);
  const { rawSha256 } = writeRawJsonl(measurement.rows, rawPath);
  const markdown = renderMarkdown({
    rows: measurement.rows,
    environment,
    envHash,
    provenance: MEASUREMENT_PROVENANCE,
    calibration,
    measurement,
    rawPath,
    rawSha256,
    profileSha256
  });
  const markdownPath = join(resultDir, `${RESULT_BASENAME}.md`);
  writeFileSync(markdownPath, `${markdown.trimEnd()}\n`);
  console.log(`summary: ${markdownPath}`);
  console.log(`summary SHA-256: ${sha256(`${markdown}\n`)}`);
  console.log(`raw JSONL: ${rawPath}`);
  console.log(`raw SHA-256: ${rawSha256}`);
  console.log(`env hash: ${envHash}`);
  console.log(`rows: ${measurement.rows.length}; parallelism: ${measurement.resolvedParallelism}`);
  console.log(
    `calibration: ${calibration.wallSeconds.toFixed(3)}s wall / ` +
      `${calibration.cpuSeconds.toFixed(3)}s CPU`
  );
  console.log(
    `measurement: ${measurement.wallSeconds.toFixed(3)}s wall / ` +
      `${measurement.cpuSeconds.toFixed(3)}s CPU`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } finally {
    removeTemporaryHelper();
  }
}
