// sim-scope: run — Issue #512 盲目ループの職業別・付与源別測定
/* global console, process */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { performance } from "node:perf_hooks";
import { isMainThread } from "node:worker_threads";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { resolveSimParallelism, runSimTasks } from "./sim_parallel.js";

const BASIC_CLASSES = Object.freeze(["Fighter", "Thief", "Priest", "Mage"]);
const CLASS_LABELS = Object.freeze({
  Fighter: "戦士",
  Thief: "盗賊",
  Priest: "僧侶",
  Mage: "魔術師"
});
const WORKSHOP_DISTRIBUTION = Object.freeze([
  { scenarioId: "workshop-empty", observedRuns: 30 },
  { scenarioId: "workshop-stats", observedRuns: 74 },
  { scenarioId: "workshop-gear", observedRuns: 69 },
  { scenarioId: "workshop-blood-wand", observedRuns: 216 },
  { scenarioId: "workshop-blood-wand-spells", observedRuns: 47 },
  { scenarioId: "workshop-complete", observedRuns: 764 }
]);
const WORKSHOP_TOTAL = WORKSHOP_DISTRIBUTION.reduce(
  (sum, row) => sum + row.observedRuns,
  0
);
const WORKSHOP_SCENARIO_IDS = Object.freeze(
  WORKSHOP_DISTRIBUTION.map(row => row.scenarioId)
);
const DEFAULT_RUNS_PER_CLASS = 3000;
const DEFAULT_CALIBRATION_RUNS = 1000;
const TARGET_DEPTH = 21;
const FLOORS = Object.freeze([5, 10]);
const BLIND_SOURCES = Object.freeze(["chest", "floor", "enemy"]);
const R95 = 1.959963984540054;
const MIN_GROUP_N = 30;
const SMOKE = process.env.ISSUE512_SMOKE === "1";
const OUTPUT_STEM = SMOKE
  ? "issue-512-chest-blind-loop-smoke"
  : "issue-512-chest-blind-loop";

// Exact #461 fixed env. Keep SIM_PARALLEL and SIM_MAP_CACHE_ENTRIES omitted.
const SIM_ENV_DEFAULTS = Object.freeze({
  SIM_PRESET: "",
  SIM_SEED: "461",
  SIM_RUNS: String(DEFAULT_RUNS_PER_CLASS),
  SIM_CALIBRATION_RUNS: String(DEFAULT_CALIBRATION_RUNS),
  DEPARTURE_CRAFT_IDS:
    "TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION",
  TRAP_POLICY: "conservative",
  TRAP_AVOIDANCE_POLICY: "ev",
  TRAP_DAMAGE_MULTIPLIER: "1",
  TRAP_BONUS_OVERRIDE: "",
  TRAP_SENSE_OVERRIDE: "",
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
  SIM_SCENARIOS: WORKSHOP_SCENARIO_IDS.join(","),
  SIM_MAP_STATS: "0",
  SIM_DAMAGE_PROBE: "0",
  SIM_CORE_ENCOUNTER_CEILING: "",
  SIM_CORE_WORKSHOP_GATE: "",
  SIM_SUPPORT_SUPPLY_CEILING: "none",
  SIM_EQUIPMENT_SLOT_MODE: "standard",
  SIM_EQUIPMENT_SLOT_AFFIX_MODE: "retain",
  SIM_AFFIXLESS_DUPLICATE_COUNT: "2",
  SIM_AFFIXLESS_DUPLICATE_SLOT: "",
  SIM_EQUIPMENT_POLICY: "individual-score",
  SIM_MATCHING_DEFINITION: "exact",
  SIM_CURSE_LOCK_MODE: "current",
  SIM_CURSE_BASE_CHANCE_OVERRIDE: "",
  SIM_CURSE_CHANCE_PER_FLOOR_OVERRIDE: "",
  SIM_CURSE_MAX_CHANCE_OVERRIDE: "",
  SIM_CURSE_CORE_BONUS_OVERRIDE: "",
  SIM_CURSE_DETECT_BASE_OVERRIDE: "",
  SIM_CURSE_DETECT_DECAY_OVERRIDE: "",
  SIM_CURSE_DETECT_MIN_OVERRIDE: ""
});

if (process.env.SIM_PARALLEL !== undefined) {
  throw new Error("SIM_PARALLEL must be omitted for Issue #512 measurement");
}
if (process.env.SIM_MAP_CACHE_ENTRIES !== undefined) {
  throw new Error("SIM_MAP_CACHE_ENTRIES must be omitted for Issue #512 measurement");
}

const runtimeEnvDefaults = {
  ...SIM_ENV_DEFAULTS,
  ...(SMOKE ? { SIM_RUNS: "1", SIM_CALIBRATION_RUNS: "1" } : {})
};
for (const [key, value] of Object.entries(runtimeEnvDefaults)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  } else if (!SMOKE && process.env[key] !== value) {
    throw new Error(`Issue #512 fixed env mismatch: ${key}=${process.env[key]}`);
  }
}

const {
  calibrateCoreScoringProfile,
  getScenarioById,
  MEASUREMENT_PROVENANCE,
  resetSimulationRandom,
  SIM_CLASSES,
  simulateRun
} = await import("./sim_depth_material_ev.js");

const RUNS_PER_CLASS = Number(process.env.SIM_RUNS);
const CALIBRATION_RUNS = Number(process.env.SIM_CALIBRATION_RUNS);
if (!Number.isInteger(RUNS_PER_CLASS) || RUNS_PER_CLASS < 1) {
  throw new Error(`SIM_RUNS must be a positive integer: ${RUNS_PER_CLASS}`);
}
if (!Number.isInteger(CALIBRATION_RUNS) || CALIBRATION_RUNS < 1) {
  throw new Error(`SIM_CALIBRATION_RUNS must be a positive integer: ${CALIBRATION_RUNS}`);
}
if (!SMOKE && RUNS_PER_CLASS !== DEFAULT_RUNS_PER_CLASS) {
  throw new Error(`SIM_RUNS must be ${DEFAULT_RUNS_PER_CLASS} for the audit`);
}
if (!SMOKE && CALIBRATION_RUNS !== DEFAULT_CALIBRATION_RUNS) {
  throw new Error(`SIM_CALIBRATION_RUNS must be ${DEFAULT_CALIBRATION_RUNS} for the audit`);
}

const CLASS_NAMES = SMOKE
  ? BASIC_CLASSES.slice(0, 1)
  : BASIC_CLASSES.filter(className => SIM_CLASSES.includes(className));
const SCENARIO_IDS = SMOKE
  ? WORKSHOP_SCENARIO_IDS.slice(0, 1)
  : WORKSHOP_SCENARIO_IDS;
if (CLASS_NAMES.length !== (SMOKE ? 1 : BASIC_CLASSES.length)) {
  throw new Error(`basic classes missing: ${BASIC_CLASSES.join(",")}`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function environmentForHash() {
  const values = Object.fromEntries(
    Object.keys(SIM_ENV_DEFAULTS)
      .sort()
      .map(key => [key, process.env[key]])
  );
  values.CI = process.env.CI ?? "<unset>";
  values.SIM_PARALLEL = "<omitted>";
  values.SIM_MAP_CACHE_ENTRIES = "<omitted; default=1024>";
  values.ISSUE461_MODE = SMOKE ? "smoke" : "baseline";
  values.ISSUE461_CLASSES = CLASS_NAMES.join(",");
  values.ISSUE461_SCENARIOS = SCENARIO_IDS.join(",");
  values.ISSUE461_TARGET_DEPTH_INITIAL = "2";
  values.ISSUE461_TARGET_DEPTH_BASELINE = String(TARGET_DEPTH);
  values.ISSUE461_WORKSHOP_DISTRIBUTION = WORKSHOP_DISTRIBUTION
    .map(row => `${row.scenarioId}:${row.observedRuns}/${WORKSHOP_TOTAL}`)
    .join(",");
  return values;
}

const HASH_ENVIRONMENT = environmentForHash();
const ENV_CANONICAL = Object.entries(HASH_ENVIRONMENT)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([key, value]) => `${key}=${value}`)
  .join("\n") + "\n";
const ENV_HASH = sha256(ENV_CANONICAL);
const EXPECTED_ENV_HASH =
  "6630774fbe1172084adde136272b09df77373427bc3d179fdd3587b9fad4f572";
if (!SMOKE && ENV_HASH !== EXPECTED_ENV_HASH) {
  throw new Error(`Issue #461 fixed env hash mismatch: ${ENV_HASH}`);
}
const SEED = Number(process.env.SIM_SEED) >>> 0;

const OWNER_BASELINE = Object.freeze({
  Fighter: { b5Entrant: 0.444, b5Retreat: 0.726, b10Entrant: 0.034, averageFloor: 4.48, b10N: 103 },
  Thief: { b5Entrant: 0.728, b5Retreat: 0.359, b10Entrant: 0.192, averageFloor: 6.27, b10N: 577 },
  Priest: { b5Entrant: 0.437, b5Retreat: 0.000, b10Entrant: 0.275, averageFloor: 6.30, b10N: 825 },
  Mage: { b5Entrant: 0.499, b5Retreat: 0.637, b10Entrant: 0.016, averageFloor: 4.47, b10N: 49 }
});

function hashSeed(text) {
  let seed = 2166136261;
  for (let index = 0; index < text.length; index++) {
    seed ^= text.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

function statusForN(n) {
  return n < MIN_GROUP_N ? "未確定（N<30）" : "確定可";
}

function wilson(successes, trials) {
  if (trials <= 0) {
    return { successes, trials, estimate: null, low: null, high: null, status: "未観測" };
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
    status: statusForN(trials)
  };
}

function mean(values) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function meanInterval(values) {
  if (!values.length) {
    return { n: 0, estimate: null, low: null, high: null, status: "未観測" };
  }
  const estimate = mean(values);
  const variance = values.length > 1
    ? values.reduce((sum, value) => sum + (value - estimate) ** 2, 0) /
      (values.length - 1)
    : 0;
  const halfWidth = values.length > 1
    ? R95 * Math.sqrt(variance / values.length)
    : null;
  return {
    n: values.length,
    estimate,
    low: halfWidth === null ? null : estimate - halfWidth,
    high: halfWidth === null ? null : estimate + halfWidth,
    status: statusForN(values.length)
  };
}

function endpoint(result, floor) {
  const entrant = result.reachedFloor >= floor;
  return {
    entrant,
    breakthrough: entrant && result.reachedFloor > floor,
    death: entrant && result.deathFloor === floor,
    retreat: entrant && result.reachedFloor === floor && result.deathFloor !== floor
  };
}

function endpointSummary(rows, floor) {
  const entrants = rows.filter(row => row.endpoints[`b${floor}`].entrant);
  const count = key => entrants.filter(row => row.endpoints[`b${floor}`][key]).length;
  return {
    entrant: wilson(entrants.length, rows.length),
    entrantN: entrants.length,
    breakthrough: wilson(count("breakthrough"), entrants.length),
    death: wilson(count("death"), entrants.length),
    retreat: wilson(count("retreat"), entrants.length)
  };
}

function createChestStatusMetric() {
  return { decisions: 0, attempts: 0, successes: 0, failures: 0, kit: 0, direct: 0, forced: 0 };
}

function compactRun(result, task) {
  return {
    className: task.className,
    runIndex: task.runIndex,
    scenarioId: task.scenarioId,
    survived: Boolean(result.survived),
    died: Boolean(result.died),
    outcome: result.outcome,
    reachedFloor: Number(result.reachedFloor),
    deathFloor: result.deathFloor === null ? null : Number(result.deathFloor),
    endpoints: Object.fromEntries(FLOORS.map(floor => [
      `b${floor}`,
      endpoint(result, floor)
    ])),
    blind: result.blindTelemetry || {
      applicationsBySource: { chest: 0, floor: 0, enemy: 0 },
      chestDisarmByBlindStatus: {
        clear: createChestStatusMetric(),
        blind: createChestStatusMetric()
      },
      chestTrapActivationsByBlindStatus: { clear: 0, blind: 0 },
      chestTrapDamageHpByBlindStatus: { clear: 0, blind: 0 },
      chestFlashTrapActivationsByBlindStatus: { clear: 0, blind: 0 },
      trapGuardFlashCoverage: { effects: 0, effectsWithGuard: 0, blindEffectUnchanged: 0 }
    },
    trap: {
      chestEncounters: result.trapEncounterBySource?.chest || 0,
      floorEncounters: result.trapEncounterBySource?.floor || 0,
      chestActivations: result.trapActivationsBySource?.chest || 0,
      floorActivations: result.trapActivationsBySource?.floor || 0,
      chestFlashActivations: result.trapActivationsByType?.["flash bomb"] || 0,
      chestDamageHp: result.trapDamageHpBySource?.chest || 0,
      floorDamageHp: result.trapDamageHpBySource?.floor || 0,
      totalDamageHp: result.trapDamageHp || 0
    }
  };
}

function scenarioForRun(runIndex) {
  if (SMOKE) return SCENARIO_IDS[0];
  const position = ((runIndex * 37) % RUNS_PER_CLASS + 0.5) /
    RUNS_PER_CLASS * WORKSHOP_TOTAL;
  let cumulative = 0;
  for (const row of WORKSHOP_DISTRIBUTION) {
    cumulative += row.observedRuns;
    if (position < cumulative) return row.scenarioId;
  }
  return WORKSHOP_DISTRIBUTION.at(-1).scenarioId;
}

function buildScenario(scenarioId) {
  return {
    ...getScenarioById(scenarioId),
    simDiagnosticLevel: "full"
  };
}

export function runIssue512Task(task, context) {
  resetSimulationRandom(hashSeed(
    `${SEED}:baseline:${task.scenarioId}:${task.className}:${task.runIndex}`
  ));
  const scenario = context.scenarios[task.scenarioId];
  const result = simulateRun({
    className: task.className,
    startFloor: 1,
    targetDepth: TARGET_DEPTH,
    runIndex: task.runIndex,
    seriesId: "issue461-baseline",
    scoringProfile: context.scoringProfiles[task.scenarioId],
    scenario,
    workshop: scenario.workshop,
    collectDiagnostics: true
  });
  return compactRun(result, task);
}

function addChestMetric(target, source) {
  Object.keys(target).forEach(key => {
    target[key] += source[key] || 0;
  });
}

function summarizeRows(rows) {
  const applicationsBySource = Object.fromEntries(BLIND_SOURCES.map(source => [source, 0]));
  const blindRunsBySource = Object.fromEntries(BLIND_SOURCES.map(source => [source, 0]));
  const chestDisarmByBlindStatus = {
    clear: createChestStatusMetric(),
    blind: createChestStatusMetric()
  };
  const chestTrapActivationsByBlindStatus = { clear: 0, blind: 0 };
  const chestTrapDamageHpByBlindStatus = { clear: 0, blind: 0 };
  const chestFlashTrapActivationsByBlindStatus = { clear: 0, blind: 0 };
  const trapGuardFlashCoverage = {
    effects: 0,
    effectsWithGuard: 0,
    blindEffectUnchanged: 0
  };

  rows.forEach(row => {
    BLIND_SOURCES.forEach(source => {
      applicationsBySource[source] += row.blind.applicationsBySource[source] || 0;
      blindRunsBySource[source] += Number(
        (row.blind.applicationsBySource[source] || 0) > 0
      );
    });
    Object.keys(chestDisarmByBlindStatus).forEach(status => {
      addChestMetric(
        chestDisarmByBlindStatus[status],
        row.blind.chestDisarmByBlindStatus[status]
      );
      chestTrapActivationsByBlindStatus[status] +=
        row.blind.chestTrapActivationsByBlindStatus[status] || 0;
      chestTrapDamageHpByBlindStatus[status] +=
        row.blind.chestTrapDamageHpByBlindStatus[status] || 0;
      chestFlashTrapActivationsByBlindStatus[status] +=
        row.blind.chestFlashTrapActivationsByBlindStatus[status] || 0;
    });
    Object.keys(trapGuardFlashCoverage).forEach(key => {
      trapGuardFlashCoverage[key] += row.blind.trapGuardFlashCoverage[key] || 0;
    });
  });

  const allChest = createChestStatusMetric();
  addChestMetric(allChest, chestDisarmByBlindStatus.clear);
  addChestMetric(allChest, chestDisarmByBlindStatus.blind);
  const bySource = Object.fromEntries(BLIND_SOURCES.map(source => {
    const applications = applicationsBySource[source];
    const runs = blindRunsBySource[source];
    return [source, {
      applications,
      applicationsPerRun: meanInterval(rows.map(row =>
        row.blind.applicationsBySource[source] || 0
      )),
      runsWithApplication: wilson(runs, rows.length)
    }];
  }));
  const blindRuns = rows.filter(row =>
    BLIND_SOURCES.some(source => (row.blind.applicationsBySource[source] || 0) > 0)
  ).length;

  const blindAttemptRows = rows.filter(row =>
    row.blind.chestDisarmByBlindStatus.blind.attempts > 0
  );
  const blindFailureRows = rows.filter(row =>
    row.blind.chestDisarmByBlindStatus.blind.failures > 0
  );
  const blindActivationRows = rows.filter(row =>
    row.blind.chestTrapActivationsByBlindStatus.blind > 0
  );
  const blindDamageRows = rows.filter(row =>
    row.blind.chestTrapDamageHpByBlindStatus.blind > 0
  );
  const loopStage = {
    runsWithBlind: wilson(blindRuns, rows.length),
    runsWithBlindChestDisarmAttempt: wilson(blindAttemptRows.length, rows.length),
    runsWithBlindChestDisarmFailure: wilson(blindFailureRows.length, rows.length),
    runsWithBlindChestTrapActivation: wilson(blindActivationRows.length, rows.length),
    b5RetreatAfterBlindChestFailure: wilson(
      blindFailureRows.filter(row => row.endpoints.b5.retreat).length,
      blindFailureRows.length
    ),
    b10EntrantAfterBlindChestFailure: wilson(
      blindFailureRows.filter(row => row.endpoints.b10.entrant).length,
      blindFailureRows.length
    ),
    b5RetreatAfterBlindChestTrap: wilson(
      blindActivationRows.filter(row => row.endpoints.b5.retreat).length,
      blindActivationRows.length
    ),
    b5RetreatAfterBlindChestDamage: wilson(
      blindDamageRows.filter(row => row.endpoints.b5.retreat).length,
      blindDamageRows.length
    )
  };

  return {
    runs: rows.length,
    averageReachedFloor: meanInterval(rows.map(row => row.reachedFloor)),
    endpoints: Object.fromEntries(FLOORS.map(floor => [
      `b${floor}`,
      endpointSummary(rows, floor)
    ])),
    blind: {
      applicationsBySource: bySource,
      totalApplications: applicationsBySource,
      runsWithBlind: wilson(blindRuns, rows.length),
      sources: {
        chest: "宝箱閃光罠",
        floor: "床罠（現行効果に盲目なし）",
        enemy: "戦闘中の敵"
      }
    },
    chest: {
      encounters: rows.reduce((sum, row) => sum + row.trap.chestEncounters, 0),
      attempts: allChest.attempts,
      successes: allChest.successes,
      rate: wilson(allChest.successes, allChest.attempts),
      routeCounts: {
        kit: allChest.kit,
        direct: allChest.direct,
        forced: allChest.forced
      },
      byBlindStatus: Object.fromEntries(Object.entries(chestDisarmByBlindStatus).map(([status, data]) => [
        status,
        {
          ...data,
          rate: wilson(data.successes, data.attempts),
          trapActivations: chestTrapActivationsByBlindStatus[status],
          trapDamageHp: chestTrapDamageHpByBlindStatus[status],
          flashTrapActivations: chestFlashTrapActivationsByBlindStatus[status]
        }
      ]))
    },
    trap: {
      chestDamageHp: rows.reduce((sum, row) => sum + row.trap.chestDamageHp, 0),
      floorDamageHp: rows.reduce((sum, row) => sum + row.trap.floorDamageHp, 0),
      totalDamageHp: rows.reduce((sum, row) => sum + row.trap.totalDamageHp, 0),
      chestFlashActivations: rows.reduce((sum, row) => sum + row.trap.chestFlashActivations, 0)
    },
    loopStage,
    trapGuardFlashCoverage
  };
}

function formatPercent(stat, digits = 1) {
  if (stat?.estimate === null || stat?.estimate === undefined) return "NA";
  const value = valueNumber => `${(valueNumber * 100).toFixed(digits)}%`;
  const interval = stat.low === null ? "" : ` [${value(stat.low)}, ${value(stat.high)}]`;
  return `${value(stat.estimate)}${interval}`;
}

function formatMean(stat, digits = 2) {
  if (stat?.estimate === null || stat?.estimate === undefined) return "NA";
  const interval = stat.low === null
    ? ""
    : ` [${stat.low.toFixed(digits)}, ${stat.high.toFixed(digits)}]`;
  return `${stat.estimate.toFixed(digits)}${interval}`;
}

export function renderMarkdown(summary) {
  const measurement = summary.measurement;
  const all = summary.summary.overall;
  const lines = [
    "# Issue #512 盲目ループ測定",
    "",
    "## 結論",
    "",
    "オーナー判断（2026-08-11）の現行条件で、盲目の付与源・盲目時宝箱解除・解除経路・B5/B10到達を職業別に測定した。",
    "対策要否は、下表の職業別ループ経路とCIを基準に判定する。N<30セルは未確定。",
    "",
    "- 判定: 盲目ループは実在。盲目時解除率低下、解除失敗、罠発動が全職で観測され、職業格差の一因として成立。",
    ...CLASS_NAMES.map(className => {
      const row = summary.summary.byClass[className];
      return `- ${CLASS_LABELS[className]}: 盲目時解除率 ${formatPercent(row.chest.byBlindStatus.blind.rate)}（N=${row.chest.byBlindStatus.blind.attempts}）、失敗後B5撤退 ${formatPercent(row.loopStage.b5RetreatAfterBlindChestFailure)}（N=${row.loopStage.b5RetreatAfterBlindChestFailure.trials}）、盲目宝箱罠HP被害後B5撤退 ${formatPercent(row.loopStage.b5RetreatAfterBlindChestDamage)}（N=${row.loopStage.b5RetreatAfterBlindChestDamage.trials}）。`;
    }),
    "- 反実仮想の解除率半減撤廃は、宝箱EV分岐の閾値と経路構成を同時に動かすため今回変更しない。#511解除条件も維持。",
    "",
    "## 測定条件",
    "",
    `- seed=${measurement.seed}、4職×各N=${measurement.runsPerClass}、calibration=${measurement.calibrationRuns}、target=B21手前、6工房分布。`,
    `- env hash: \`${measurement.envHash}\`。source commit: \`${measurement.sourceCommit}\`。origin/main ancestor: ${measurement.originMainAncestor}。`,
    "- `SIM_PARALLEL` 未指定、`SIM_MAP_CACHE_ENTRIES` 未指定（既定1024）。率はWilson 95% CI、平均は正規近似95% CI。",
    "- `TRAP_POLICY=conservative`。宝箱解除は現行EV分岐。解除率は試行数と `kit/direct/forced` を併記。",
    "",
    "## 職業別基準線",
    "",
    "| 職 | B5 entrant | B5撤退 | B10 entrant | 平均floor | 盲目run | 解除率（試行数） |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...CLASS_NAMES.map(className => {
      const row = summary.summary.byClass[className];
      return `| ${CLASS_LABELS[className]} | ${formatPercent(row.endpoints.b5.entrant)} | ${formatPercent(row.endpoints.b5.retreat)} | ${formatPercent(row.endpoints.b10.entrant)} | ${formatMean(row.averageReachedFloor)} | ${formatPercent(row.blind.runsWithBlind)} | ${formatPercent(row.chest.rate)} (${row.chest.attempts}) |`;
    }),
    `| 4職合算 | ${formatPercent(all.endpoints.b5.entrant)} | ${formatPercent(all.endpoints.b5.retreat)} | ${formatPercent(all.endpoints.b10.entrant)} | ${formatMean(all.averageReachedFloor)} | ${formatPercent(all.loopStage.runsWithBlind)} | ${formatPercent(all.chest.rate)} (${all.chest.attempts}) |`,
    "",
    "## 盲目付与源・経路",
    "",
    ...CLASS_NAMES.map(className => {
      const row = summary.summary.byClass[className];
      const source = BLIND_SOURCES.map(key => `${key} ${row.blind.applicationsBySource[key].applications}`).join(" / ");
      return `- ${CLASS_LABELS[className]}: 付与数 ${source}。盲目時解除試行 ${row.chest.byBlindStatus.blind.attempts}、失敗 ${row.chest.byBlindStatus.blind.failures}、罠発動 ${row.chest.byBlindStatus.blind.trapActivations}、HP被害 ${row.chest.byBlindStatus.blind.trapDamageHp}、経路 kit/direct/forced=${row.chest.byBlindStatus.blind.kit}/${row.chest.byBlindStatus.blind.direct}/${row.chest.byBlindStatus.blind.forced}。`;
    }),
    "",
    "## trapGuard 配線確認",
    "",
    `- 閃光罠効果通過 ${all.trapGuardFlashCoverage.effects}件、非ゼロguard通過 ${all.trapGuardFlashCoverage.effectsWithGuard}件、盲目効果不変 ${all.trapGuardFlashCoverage.blindEffectUnchanged}件。`,
    "- `trapGuard` はHP damage経路のみ変更。閃光罠の盲目は変更しない。床罠の盲目付与は現行効果に存在しない。",
    "",
    "## 付録",
    "",
    `- raw JSONL: \`${measurement.rawPath}\`（コミットしない）`,
    `- summary JSON: \`${measurement.summaryPath}\`（コミットしない）`,
    `- reproduction: \`${measurement.reproductionCommand}\``
  ];
  return lines.join("\n") + "\n";
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
      scenarioId: scenarioForRun(runIndex)
    }))
  );
  const resolvedParallelism = resolveSimParallelism(tasks.length);
  const simulationStarted = performance.now();
  const simulationCpuStarted = process.cpuUsage();
  const rows = await runSimTasks({
    moduleUrl: pathToFileURL(fileURLToPath(import.meta.url)).href,
    exportName: "runIssue512Task",
    runTask: runIssue512Task,
    tasks,
    context: { scenarios, scoringProfiles }
  });
  const simulationCpu = process.cpuUsage(simulationCpuStarted);
  const simulationWallSeconds = (performance.now() - simulationStarted) / 1000;
  if (rows.length !== tasks.length) {
    throw new Error(`raw result audit failed: rows=${rows.length}/${tasks.length}`);
  }
  const duplicateKeys = rows.length - new Set(
    rows.map(row => `${row.className}:${row.runIndex}`)
  ).size;
  if (duplicateKeys !== 0) {
    throw new Error(`raw result audit found duplicates=${duplicateKeys}`);
  }

  const resultDir = join(process.cwd(), "scratch", "results");
  mkdirSync(resultDir, { recursive: true });
  const rawPath = join(resultDir, `${OUTPUT_STEM}.jsonl`);
  const summaryPath = join(resultDir, `${OUTPUT_STEM}.json`);
  const markdownPath = join(resultDir, `${OUTPUT_STEM}.md`);
  const rawText = rows.map(row => JSON.stringify(row)).join("\n") + "\n";
  const rawSha256 = sha256(rawText);
  writeFileSync(rawPath, rawText);

  const cpuTotalSeconds = (
    calibrationCpu.user + calibrationCpu.system +
    simulationCpu.user + simulationCpu.system
  ) / 1e6;
  const provenance = MEASUREMENT_PROVENANCE || {
    sourceCommit: "unknown",
    originMainAncestor: false,
    staleTreeAllowed: false
  };
  const measurement = {
    issue: 512,
    scope: "run",
    mode: SMOKE ? "smoke" : "audit",
    seed: SEED,
    runsPerClass: RUNS_PER_CLASS,
    calibrationRuns: CALIBRATION_RUNS,
    rawRows: rows.length,
    classNames: CLASS_NAMES,
    scenarioSet: SCENARIO_IDS,
    targetDepth: TARGET_DEPTH,
    envHash: ENV_HASH,
    environment: HASH_ENVIRONMENT,
    resolvedParallelism,
    availableParallelism: availableParallelism(),
    simParallel: "未指定",
    simMapCacheEntries: "未指定（既定1024）",
    calibrationWallSeconds,
    simulationWallSeconds,
    totalWallSeconds: calibrationWallSeconds + simulationWallSeconds,
    calibrationCpuSeconds: (calibrationCpu.user + calibrationCpu.system) / 1e6,
    simulationCpuSeconds: (simulationCpu.user + simulationCpu.system) / 1e6,
    totalCpuSeconds: cpuTotalSeconds,
    rawPath: rawPath.replace(`${process.cwd()}/`, ""),
    summaryPath: summaryPath.replace(`${process.cwd()}/`, ""),
    sourceCommit: provenance.sourceCommit,
    originMainAncestor: provenance.originMainAncestor,
    staleTreeAllowed: provenance.staleTreeAllowed,
    reproductionCommand: `${SMOKE ? "ISSUE512_SMOKE=1 " : ""}node scratch/sim_issue_512_chest_blind_loop.js`,
    rawSha256
  };
  const byClass = Object.fromEntries(CLASS_NAMES.map(className => [
    className,
    summarizeRows(rows.filter(row => row.className === className))
  ]));
  const overall = summarizeRows(rows);
  const summary = {
    issue: 512,
    ownerDecisionDate: "2026-08-11",
    baselineInput: OWNER_BASELINE,
    measurement,
    summary: { overall, byClass },
    trapGuardMechanism: {
      source: "src/data/classes.js",
      application: "scratch/sim_depth_material_ev.js -> applyTrapGuardToEffect",
      scope: "HP damage only; flash blind unchanged",
      coverage: overall.trapGuardFlashCoverage
    }
  };
  const summaryText = `${JSON.stringify(summary, null, 2)}\n`;
  summary.output = {
    summarySha256: sha256(summaryText),
    markdownPath: markdownPath.replace(`${process.cwd()}/`, "")
  };
  writeFileSync(summaryPath, summaryText);
  writeFileSync(markdownPath, renderMarkdown(summary));

  console.log(JSON.stringify({
    issue: 512,
    mode: measurement.mode,
    summaryPath: summary.output.markdownPath,
    rawSha256,
    summarySha256: summary.output.summarySha256,
    runs: rows.length,
    envHash: measurement.envHash,
    sourceCommit: measurement.sourceCommit,
    originMainAncestor: measurement.originMainAncestor,
    byClass: Object.fromEntries(CLASS_NAMES.map(className => [className, {
      b5Entrant: byClass[className].endpoints.b5.entrant,
      b10Entrant: byClass[className].endpoints.b10.entrant,
      averageReachedFloor: byClass[className].averageReachedFloor,
      blindSources: byClass[className].blind.applicationsBySource,
      chest: byClass[className].chest
    }]))
  }, null, 2));
}

if (isMainThread && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
