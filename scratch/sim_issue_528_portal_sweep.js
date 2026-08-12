// sim-scope: run — Issue #528 phase 1 portal-policy sweep
/* global console, process */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isMainThread } from "node:worker_threads";

import { resolveSimParallelism, runSimTasks } from "./sim_parallel.js";

const IS_SINGLE = process.env.ISSUE528_SINGLE === "1";
const SMOKE = process.env.ISSUE528_SMOKE === "1";
const OUTPUT_STEM = process.env.SIM_RESULT_BASENAME ||
  (SMOKE ? "issue-528-portal-sweep-smoke" : "issue-528-portal-sweep");
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
const WORKSHOP_SCENARIOS = Object.freeze(
  WORKSHOP_DISTRIBUTION.map(row => row.scenarioId)
);
const R95 = 1.959963984540054;
const CURRENT_CONFIG = Object.freeze({
  hpThreshold: 0.35,
  maxHealPotions: 0,
  minFloor: 3
});
const SWEEP_DEFINITIONS = Object.freeze([
  {
    id: "PORTAL_HP_THRESHOLD",
    label: "HP閾値",
    values: [0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75],
    config: value => ({ ...CURRENT_CONFIG, hpThreshold: value })
  },
  {
    id: "PORTAL_MAX_HEAL_POTIONS",
    label: "回復薬上限",
    values: [0, 1, 2, 3, 4],
    config: value => ({ ...CURRENT_CONFIG, maxHealPotions: value })
  },
  {
    id: "PORTAL_MIN_FLOOR",
    label: "最低floor",
    values: [1, 2, 3, 4, 5, 6, 8, 99],
    config: value => ({ ...CURRENT_CONFIG, minFloor: value })
  }
]);
const ENV_FIXED_DEFAULTS = Object.freeze({
  SIM_PRESET: "",
  SIM_SEED: "461",
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
  FLEE_POLICY: "ev",
  FLEE_HP_THRESHOLD: "0.20",
  HEAL_POTION_THRESHOLD: "0.55",
  ELITE_POLICY: "avoid",
  BLOOD_WAND_HP_PAYMENT_MIN_RATE: "0.50",
  SIM_CORE_SCORE_DROP_TOLERANCE: "0",
  SIM_440_CONDITION: "current",
  SIM_SCENARIOS: WORKSHOP_SCENARIOS.join(",")
});

function configId(config) {
  return [
    `hp-${config.hpThreshold.toFixed(2)}`,
    `pots-${config.maxHealPotions}`,
    `floor-${config.minFloor}`
  ].join("-");
}

function configLabel(config) {
  return `HP<=${Math.round(config.hpThreshold * 100)}% / ` +
    `薬<=${config.maxHealPotions} / B${config.minFloor}`;
}

function createSweepConditions() {
  const conditions = new Map();
  for (const definition of SWEEP_DEFINITIONS) {
    for (const value of definition.values) {
      const config = definition.config(value);
      const id = configId(config);
      if (!conditions.has(id)) {
        conditions.set(id, Object.freeze({
          id,
          config,
          label: configLabel(config)
        }));
      }
    }
  }
  return [...conditions.values()];
}

const SWEEP_CONDITIONS = Object.freeze(createSweepConditions());
const CONDITION_BY_ID = new Map(SWEEP_CONDITIONS.map(condition => [condition.id, condition]));

function assertNoParallelOverrides() {
  if (process.env.SIM_PARALLEL !== undefined) {
    throw new Error("Issue #528 measurement omits SIM_PARALLEL");
  }
  if (process.env.SIM_MAP_CACHE_ENTRIES !== undefined) {
    throw new Error("Issue #528 measurement omits SIM_MAP_CACHE_ENTRIES");
  }
}

function applyFixedEnvironment(runsPerClass, calibrationRuns, config) {
  const desired = {
    ...ENV_FIXED_DEFAULTS,
    SIM_RUNS: String(runsPerClass),
    SIM_CALIBRATION_RUNS: String(calibrationRuns),
    PORTAL_HP_THRESHOLD: String(config.hpThreshold),
    PORTAL_MAX_HEAL_POTIONS: String(config.maxHealPotions),
    PORTAL_MIN_FLOOR: String(config.minFloor)
  };
  for (const [key, value] of Object.entries(desired)) {
    if (SMOKE && ["SIM_RUNS", "SIM_CALIBRATION_RUNS"].includes(key)) {
      process.env[key] = value;
      continue;
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
      continue;
    }
    if (process.env[key] !== value) {
      throw new Error(`Issue #528 fixed env mismatch: ${key}=${process.env[key]} != ${value}`);
    }
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hashSeed(text) {
  let seed = 2166136261;
  for (let index = 0; index < text.length; index++) {
    seed ^= text.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

function scenarioForRun(runIndex, runsPerClass) {
  const position = ((runIndex * 37) % runsPerClass + 0.5) /
    runsPerClass * WORKSHOP_TOTAL;
  let cumulative = 0;
  for (const row of WORKSHOP_DISTRIBUTION) {
    cumulative += row.observedRuns;
    if (position < cumulative) return row.scenarioId;
  }
  return WORKSHOP_DISTRIBUTION.at(-1).scenarioId;
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

function compactRun(result, task) {
  const recoveryHealing = result.recoveryHealing?.total || {};
  return {
    className: task.className,
    scenarioId: task.scenarioId,
    runIndex: task.runIndex,
    survived: Boolean(result.survived),
    died: Boolean(result.died),
    reachedFloor: result.reachedFloor,
    deathFloor: result.deathFloor,
    endpoints: {
      b5: endpoint(result, 5),
      b10: endpoint(result, 10)
    },
    bankedMaterials: result.bankedMaterials,
    timeCost: result.timeCost,
    materialEvPerTime: result.timeCost > 0
      ? result.bankedMaterials / result.timeCost
      : 0,
    recoveryPotionsUsed: result.recoveryPotionsUsed || 0,
    healPotionsUsed: result.healPotionsUsed || 0,
    greaterHealPotionsUsed: result.greaterHealPotionsUsed || 0,
    recoveryPotionDepletedFloor: result.recoveryPotionDepletedFloor ?? null,
    recoveryPotionShortageFloor: result.recoveryPotionShortageFloor ?? null,
    recoveryPotionShortages: result.recoveryPotionShortages || 0,
    requestedHealingHp: recoveryHealing.requestedHp || 0,
    actualHealingHp: recoveryHealing.actualHp || 0,
    overhealHp: recoveryHealing.overhealHp || 0,
    townPortalsUsed: result.townPortalsUsed || 0
  };
}

function createStats() {
  return { n: 0, sum: 0, sumSquares: 0 };
}

function addStats(stats, value) {
  if (!Number.isFinite(value)) return;
  stats.n++;
  stats.sum += value;
  stats.sumSquares += value * value;
}

function summarizeStats(stats) {
  if (!stats || stats.n === 0) {
    return { n: 0, mean: null, ci95: null, status: "未観測" };
  }
  const mean = stats.sum / stats.n;
  if (stats.n < 2) {
    return { n: stats.n, mean, ci95: null, status: "未確定" };
  }
  const variance = Math.max(
    0,
    (stats.sumSquares - stats.sum * stats.sum / stats.n) / (stats.n - 1)
  );
  const margin = R95 * Math.sqrt(variance / stats.n);
  return {
    n: stats.n,
    mean,
    ci95: [mean - margin, mean + margin],
    status: stats.n < 30 ? "未確定" : "監査"
  };
}

function wilson(successes, trials) {
  if (trials <= 0) {
    return { successes, trials, rate: null, ci95: null, status: "未観測" };
  }
  const rate = successes / trials;
  const z2 = R95 * R95;
  const denominator = 1 + z2 / trials;
  const center = (rate + z2 / (2 * trials)) / denominator;
  const margin = R95 * Math.sqrt(
    (rate * (1 - rate) + z2 / (4 * trials)) / trials
  ) / denominator;
  return {
    successes,
    trials,
    rate,
    ci95: [Math.max(0, center - margin), Math.min(1, center + margin)],
    status: trials < 30 ? "未確定" : "監査"
  };
}

function summarizeEndpoint(rows, endpointId) {
  const entrants = rows.filter(row => row.endpoints[endpointId].entrant);
  const breakthroughs = entrants.filter(row => row.endpoints[endpointId].breakthrough).length;
  const deaths = entrants.filter(row => row.endpoints[endpointId].death).length;
  const retreats = entrants.filter(row => row.endpoints[endpointId].retreat).length;
  if (breakthroughs + deaths + retreats !== entrants.length) {
    throw new Error(`${endpointId} outcome split does not sum to entrants`);
  }
  return {
    entrant: wilson(entrants.length, rows.length),
    breakthrough: wilson(breakthroughs, entrants.length),
    death: wilson(deaths, entrants.length),
    retreat: wilson(retreats, entrants.length),
    splitSumsTo100: breakthroughs + deaths + retreats === entrants.length
  };
}

function summarizeRows(rows) {
  const depleted = rows.filter(row => row.recoveryPotionDepletedFloor !== null);
  const shortages = rows.filter(row => row.recoveryPotionShortages > 0);
  const statsFor = field => {
    const stats = createStats();
    rows.forEach(row => addStats(stats, row[field]));
    return summarizeStats(stats);
  };
  const conditionalStats = field => {
    const stats = createStats();
    rows.forEach(row => {
      if (row[field] !== null && row[field] !== undefined) addStats(stats, row[field]);
    });
    return summarizeStats(stats);
  };
  return {
    runs: rows.length,
    b5: summarizeEndpoint(rows, "b5"),
    b10: summarizeEndpoint(rows, "b10"),
    averageReachedFloor: statsFor("reachedFloor"),
    survivalRate: wilson(rows.filter(row => row.survived).length, rows.length),
    materialEvPerTime: statsFor("materialEvPerTime"),
    recoveryPotionsUsed: statsFor("recoveryPotionsUsed"),
    healPotionsUsed: statsFor("healPotionsUsed"),
    greaterHealPotionsUsed: statsFor("greaterHealPotionsUsed"),
    depletionRate: wilson(depleted.length, rows.length),
    depletionFloor: conditionalStats("recoveryPotionDepletedFloor"),
    shortageRate: wilson(shortages.length, rows.length),
    shortageFloor: conditionalStats("recoveryPotionShortageFloor"),
    requestedHealingHp: statsFor("requestedHealingHp"),
    actualHealingHp: statsFor("actualHealingHp"),
    overhealHp: statsFor("overhealHp"),
    townPortalUses: statsFor("townPortalsUsed"),
    townPortalUseRate: wilson(
      rows.filter(row => row.townPortalsUsed > 0).length,
      rows.length
    )
  };
}

function formatNumber(value, digits = 3) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : Number(value).toFixed(digits);
}

function formatStat(stat, digits = 3) {
  if (!stat || stat.mean === null) return "—";
  const suffix = stat.status === "未確定" ? " 未確定" : "";
  return stat.ci95
    ? `${formatNumber(stat.mean, digits)} [${formatNumber(stat.ci95[0], digits)}, ${formatNumber(stat.ci95[1], digits)}]${suffix}`
    : `${formatNumber(stat.mean, digits)}${suffix}`;
}

function formatRate(rate, digits = 1) {
  if (!rate || rate.rate === null) return "—";
  const suffix = rate.status === "未確定" ? " 未確定" : "";
  return `${formatNumber(rate.rate * 100, digits)}% [${formatNumber(rate.ci95[0] * 100, digits)}, ${formatNumber(rate.ci95[1] * 100, digits)}]${suffix}`;
}

function formatEndpoint(value) {
  return [
    formatRate(value.entrant),
    formatRate(value.breakthrough),
    formatRate(value.death),
    formatRate(value.retreat)
  ].join(" / ");
}

function environmentForHash(getResolvedSimulationEnv, condition) {
  return {
    ...Object.fromEntries(Object.entries(getResolvedSimulationEnv())),
    ISSUE528_MODE: SMOKE ? "smoke" : "sweep",
    ISSUE528_CONFIG: condition.id,
    ISSUE528_CONFIG_LABEL: condition.label,
    ISSUE528_WORKSHOP_DISTRIBUTION: WORKSHOP_DISTRIBUTION
      .map(row => `${row.scenarioId}:${row.observedRuns}/${WORKSHOP_TOTAL}`)
      .join(","),
    SIM_PARALLEL: "<omitted; runtime default>",
    SIM_MAP_CACHE_ENTRIES: "<omitted; runtime default 1024>"
  };
}

function canonicalEnvironment(environment) {
  return Object.entries(environment)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n") + "\n";
}

async function runSingle() {
  const conditionId = process.env.ISSUE528_CONFIG_ID;
  const condition = CONDITION_BY_ID.get(conditionId);
  if (!condition) throw new Error(`unknown Issue #528 config: ${conditionId}`);
  assertNoParallelOverrides();
  const runsPerClass = SMOKE ? 2 : Number(process.env.SIM_RUNS || 500);
  const calibrationRuns = SMOKE ? 2 : Number(process.env.SIM_CALIBRATION_RUNS || 100);
  if (!Number.isInteger(runsPerClass) || runsPerClass < 1) {
    throw new Error(`SIM_RUNS must be a positive integer: ${runsPerClass}`);
  }
  if (!Number.isInteger(calibrationRuns) || calibrationRuns < 1) {
    throw new Error(`SIM_CALIBRATION_RUNS must be a positive integer: ${calibrationRuns}`);
  }
  applyFixedEnvironment(runsPerClass, calibrationRuns, condition.config);

  const {
    calibrateCoreScoringProfile,
    getResolvedSimulationEnv,
    getScenarioById,
    MEASUREMENT_PROVENANCE: measurementProvenance,
    resetSimulationRandom,
    simulateRun,
    SIM_CLASSES
  } = await import("./sim_depth_material_ev.js");
  if (JSON.stringify(SIM_CLASSES) !== JSON.stringify(BASIC_CLASSES)) {
    throw new Error(`basic class set mismatch: ${SIM_CLASSES.join(",")}`);
  }

  const scoringProfiles = {};
  const calibrationStarted = performance.now();
  const calibrationCpuStarted = process.cpuUsage();
  for (const scenarioId of WORKSHOP_SCENARIOS) {
    const scenario = getScenarioById(scenarioId);
    resetSimulationRandom(Number(process.env.SIM_SEED) >>> 0);
    scoringProfiles[scenarioId] = calibrateCoreScoringProfile(
      calibrationRuns,
      scenario,
      "powder",
      scenario.workshop
    );
  }
  const calibrationCpu = process.cpuUsage(calibrationCpuStarted);
  const calibrationWallSeconds = (performance.now() - calibrationStarted) / 1000;
  const tasks = BASIC_CLASSES.flatMap(className =>
    Array.from({ length: runsPerClass }, (_, runIndex) => ({
      className,
      runIndex,
      scenarioId: scenarioForRun(runIndex, runsPerClass)
    }))
  );
  const resolvedParallelism = resolveSimParallelism(tasks.length);
  const simulationStarted = performance.now();
  const simulationCpuStarted = process.cpuUsage();
  const rows = await runSimTasks({
    moduleUrl: pathToFileURL(fileURLToPath(import.meta.url)).href,
    exportName: "runIssue528Task",
    runTask: runIssue528Task,
    tasks,
    context: { condition, scoringProfiles }
  });
  const simulationCpu = process.cpuUsage(simulationCpuStarted);
  const simulationWallSeconds = (performance.now() - simulationStarted) / 1000;
  if (rows.length !== tasks.length) {
    throw new Error(`raw result audit failed: rows=${rows.length}/${tasks.length}`);
  }
  rows.sort((left, right) =>
    left.className.localeCompare(right.className) || left.runIndex - right.runIndex
  );
  const raw = `${rows.map(row => JSON.stringify(row)).join("\n")}\n`;
  const environment = environmentForHash(getResolvedSimulationEnv, condition);
  const summary = {
    issue: 528,
    condition,
    environment,
    envHash: sha256(canonicalEnvironment(environment)),
    rawSha256: sha256(raw),
    measurement: measurementProvenance,
    runsPerClass,
    calibrationRuns,
    rawRows: rows.length,
    resolvedParallelism,
    calibration: {
      wallSeconds: calibrationWallSeconds,
      cpuSeconds: (calibrationCpu.user + calibrationCpu.system) / 1e6
    },
    runtime: {
      wallSeconds: simulationWallSeconds,
      cpuSeconds: (simulationCpu.user + simulationCpu.system) / 1e6
    },
    byClass: Object.fromEntries(
      BASIC_CLASSES.map(className => [
        className,
        summarizeRows(rows.filter(row => row.className === className))
      ])
    )
  };
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

export async function runIssue528Task(task, context) {
  const { getScenarioById, resetSimulationRandom, simulateRun } =
    await import("./sim_depth_material_ev.js");
  const scenario = getScenarioById(task.scenarioId);
  resetSimulationRandom(hashSeed(
    `${process.env.SIM_SEED}:baseline:${task.scenarioId}:${task.className}:${task.runIndex}`
  ));
  const result = simulateRun({
    className: task.className,
    startFloor: 1,
    targetDepth: 21,
    runIndex: task.runIndex,
    seriesId: "issue461-baseline",
    scoringProfile: context.scoringProfiles[task.scenarioId],
    scenario,
    workshop: scenario.workshop
  });
  return compactRun(result, task);
}

function getConditionRows(summary, conditionId) {
  const condition = CONDITION_BY_ID.get(conditionId);
  if (!condition) throw new Error(`unknown condition: ${conditionId}`);
  return summary.conditions.find(item => item.condition.id === conditionId);
}

function findBestByEv(summary, definition, className) {
  const candidates = definition.values.map(value => {
    const config = definition.config(value);
    const item = getConditionRows(summary, configId(config));
    return {
      value,
      config,
      metric: item.byClass[className].materialEvPerTime
    };
  });
  return candidates.reduce((best, candidate) => {
    if (!best || candidate.metric.mean === null) return candidate;
    if (best.metric.mean === null || candidate.metric.mean > best.metric.mean) return candidate;
    return best;
  }, null);
}

function formatSweepValue(definition, value) {
  if (definition.id === "PORTAL_HP_THRESHOLD") return `${Math.round(value * 100)}%`;
  if (definition.id === "PORTAL_MIN_FLOOR") return value === 99 ? "B99(無効)" : `B${value}`;
  return String(value);
}

function buildMarkdown(summary) {
  const currentId = configId(CURRENT_CONFIG);
  const hpBest = BASIC_CLASSES.map(className =>
    `${CLASS_LABELS[className]}=${formatSweepValue(
      SWEEP_DEFINITIONS[0],
      findBestByEv(summary, SWEEP_DEFINITIONS[0], className).value
    )}`
  ).join(" / ");
  const potionBest = BASIC_CLASSES.map(className =>
    `${CLASS_LABELS[className]}=${formatSweepValue(
      SWEEP_DEFINITIONS[1],
      findBestByEv(summary, SWEEP_DEFINITIONS[1], className).value
    )}`
  ).join(" / ");
  const floorBest = BASIC_CLASSES.map(className =>
    `${CLASS_LABELS[className]}=${formatSweepValue(
      SWEEP_DEFINITIONS[2],
      findBestByEv(summary, SWEEP_DEFINITIONS[2], className).value
    )}`
  ).join(" / ");
  const lines = [
    "# Issue #528 フェーズ1: 撤退条件の測定側掃引",
    "",
    "## 結論",
    "",
    "- ゲーム側コード・`src/`・設計値は変更せず、`PORTAL_HP_THRESHOLD` / `PORTAL_MAX_HEAL_POTIONS` / `PORTAL_MIN_FLOOR`だけを既存simの子プロセス単位で掃引した。",
    "- EV分岐点は、各職・各パラメータ掃引で `素材EV/時間` の点推定が最大となる値として表示。CI重複時は正式な差なしとして扱い、点推定だけで採用しない。",
    `- 現行値（HP35% / 薬0 / B3）との点推定一致: HP閾値 ${hpBest}、回復薬上限 ${potionBest}、最低floor ${floorBest}。HP閾値・最低floorは現行値と一致しない。`,
    "- `素材EV/時間` は帰還runのbank素材/時間で、早期帰還を高く評価しうる。EV最大点をそのまま採用せず、B5撤退率と盗賊・僧侶B10 entrant制約を併読する。",
    "- B5撤退率は主判定（戦士・魔術師）。盗賊・僧侶 B10 entrant は非悪化制約として併記。",
    "- 率はWilson 95% CI、平均は正規近似95% CI。`N<30` は未確定。B5/B10の順序は entrant / breakthrough / death / retreat。",
    "",
    "## EV分岐点サマリ",
    "",
    "|掃引|現在値|職|EV最大点|現在EV/時間|最大EV/時間|B5撤退 現在→最大|",
    "|---|---|---|---|---:|---:|---|"
  ];
  for (const definition of SWEEP_DEFINITIONS) {
    for (const className of BASIC_CLASSES) {
      const current = getConditionRows(summary, currentId).byClass[className];
      const best = findBestByEv(summary, definition, className);
      const bestValue = formatSweepValue(definition, best.value);
      const currentValue = formatSweepValue(
        definition,
        definition.values.find(value => configId(definition.config(value)) === currentId)
      );
      lines.push(
        `|${definition.label}|${currentValue}|${CLASS_LABELS[className]}|${bestValue}|` +
        `${formatStat(current.materialEvPerTime, 4)}|${formatStat(best.metric, 4)}|` +
        `${formatRate(current.b5.retreat)}→${formatRate(getConditionRows(summary, configId(best.config)).byClass[className].b5.retreat)}|`
      );
    }
  }
  lines.push(
    "",
    "EV最大点は職ごとに異なるため、単一の撤退値へ自動採用しない。候補の採否は主判定・非悪化制約・CIをまとめて判断する。",
    "",
    "## 職業別全指標",
    "",
    "|掃引|設定|職|B5 E/X/D/R|B10 E/X/D/R|平均floor|生還率|素材EV/時間|回復薬使用/run|枯渇率|枯渇floor|過剰回復HP/run|",
    "|---|---|---|---|---|---:|---|---:|---|---|---:|---|"
  );
  for (const definition of SWEEP_DEFINITIONS) {
    for (const value of definition.values) {
      const conditionId = configId(definition.config(value));
      const condition = getConditionRows(summary, conditionId);
      for (const className of BASIC_CLASSES) {
        const item = condition.byClass[className];
        lines.push(
          `|${definition.label}|${formatSweepValue(definition, value)}|${CLASS_LABELS[className]}|` +
          `${formatEndpoint(item.b5)}|${formatEndpoint(item.b10)}|` +
          `${formatStat(item.averageReachedFloor, 2)}|${formatRate(item.survivalRate)}|` +
          `${formatStat(item.materialEvPerTime, 4)}|${formatStat(item.recoveryPotionsUsed, 2)}|` +
          `${formatRate(item.depletionRate)}|${formatStat(item.depletionFloor, 2)}|` +
          `${formatStat(item.overhealHp, 2)}|`
        );
      }
    }
  }
  lines.push(
    "",
    "枯渇floorは `recoveryPotionDepletedFloor` が観測されたrunだけの平均。過剰回復は要求HP−実HP増分。生還率はsimの撤退終了率。",
    "",
    "## 現行条件の職業別確認",
    "",
    "|職|B5 E/X/D/R|B10 E/X/D/R|平均floor|素材EV/時間|回復薬使用/run|枯渇率 / floor|過剰回復HP/run|盗賊・僧侶B10制約|",
    "|---|---|---|---:|---:|---:|---|---:|---|"
  );
  for (const className of BASIC_CLASSES) {
    const item = getConditionRows(summary, currentId).byClass[className];
    const constraint = ["Thief", "Priest"].includes(className)
      ? formatRate(item.b10.entrant)
      : "主判定職";
    lines.push(
      `|${CLASS_LABELS[className]}|${formatEndpoint(item.b5)}|${formatEndpoint(item.b10)}|` +
      `${formatStat(item.averageReachedFloor, 2)}|${formatStat(item.materialEvPerTime, 4)}|` +
      `${formatStat(item.recoveryPotionsUsed, 2)}|${formatRate(item.depletionRate)} / ${formatStat(item.depletionFloor, 2)}|` +
      `${formatStat(item.overhealHp, 2)}|${constraint}|`
    );
  }
  lines.push(
    "",
    "## 測定条件・再現",
    "",
    `- seed=${summary.seed}、各条件・職 N=${summary.runsPerClass}、calibration N=${summary.calibrationRuns}。対象=Fighter/Thief/Priest/Mage。`,
    "- 工房分布: empty 30 / stats 74 / gear 69 / blood-wand 216 / blood-wand+deep-spells 47 / complete 764（1200分率）。",
    "- `DEPARTURE_CRAFT_IDS=TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION`、`FLEE_POLICY=ev`、`TRAP_POLICY=conservative`、`TRAP_AVOIDANCE_POLICY=ev`、状態治療smart。",
    "- 同一 `(scenario,class,runIndex)` を全条件へ使用。ポータル閾値変更で経路が分岐するため、条件差CIは独立2標本扱い。",
    "- `SIM_PARALLEL` / `SIM_MAP_CACHE_ENTRIES` は未指定。runtime既定値を使用。各条件のenv hash/raw SHAはsummary JSONへ保存。",
    "- 再現: `node --check scratch/sim_issue_528_portal_sweep.js`、`SIM_RUNS=500 SIM_CALIBRATION_RUNS=100 node scratch/sim_issue_528_portal_sweep.js`",
    `- source commit: \`${summary.measurement.sourceCommit}\`、origin/main ancestor: ${summary.measurement.originMainAncestor ? "yes" : "no"}、stale override: ${summary.measurement.staleTreeAllowed ? "SIM_ALLOW_STALE_TREE=1" : "none"}`,
    "",
    "## チェックリスト",
    "",
    "- 適用: `.agents/balance-simulation.md`。実run経路、portal、状態治療、回復薬、Wilson CI、N<30注記、職業別指標を確認。",
    "- ゲーム側コード変更なし。フェーズ2の機構設計・balance値更新は未実施。"
  );
  return `${lines.join("\n")}\n`;
}

function runChild(condition, runsPerClass, calibrationRuns) {
  const childEnv = {
    ...process.env,
    ISSUE528_SINGLE: "1",
    ISSUE528_CONFIG_ID: condition.id,
    SIM_RUNS: String(runsPerClass),
    SIM_CALIBRATION_RUNS: String(calibrationRuns),
    PORTAL_HP_THRESHOLD: String(condition.config.hpThreshold),
    PORTAL_MAX_HEAL_POTIONS: String(condition.config.maxHealPotions),
    PORTAL_MIN_FLOOR: String(condition.config.minFloor)
  };
  delete childEnv.SIM_PARALLEL;
  delete childEnv.SIM_MAP_CACHE_ENTRIES;
  const child = spawnSync(
    process.execPath,
    [fileURLToPath(import.meta.url)],
    {
      cwd: process.cwd(),
      env: childEnv,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024
    }
  );
  if (child.error) throw child.error;
  if (child.status !== 0) {
    throw new Error(
      `Issue #528 child failed (${condition.id}) exit=${child.status}\n` +
      child.stderr.slice(-4000)
    );
  }
  const output = child.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
  if (!output) throw new Error(`Issue #528 child returned no summary: ${condition.id}`);
  return JSON.parse(output);
}

function buildParentSummary(conditionSummaries, runsPerClass, calibrationRuns) {
  const first = conditionSummaries[0];
  const measurement = first.measurement;
  if (conditionSummaries.some(item => item.measurement.sourceCommit !== measurement.sourceCommit)) {
    throw new Error("source commit changed between sweep conditions");
  }
  return {
    issue: 528,
    mode: SMOKE ? "smoke" : "sweep",
    seed: 461,
    runsPerClass,
    calibrationRuns,
    rawRows: conditionSummaries.reduce((sum, item) => sum + item.rawRows, 0),
    measurement,
    conditions: conditionSummaries,
    reproductionCommand: "SIM_RUNS=500 SIM_CALIBRATION_RUNS=100 node scratch/sim_issue_528_portal_sweep.js"
  };
}

function runSweep() {
  assertNoParallelOverrides();
  const runsPerClass = SMOKE ? 2 : Number(process.env.SIM_RUNS || 500);
  const calibrationRuns = SMOKE ? 2 : Number(process.env.SIM_CALIBRATION_RUNS || 100);
  if (!Number.isInteger(runsPerClass) || runsPerClass < 1) {
    throw new Error(`SIM_RUNS must be a positive integer: ${runsPerClass}`);
  }
  if (!Number.isInteger(calibrationRuns) || calibrationRuns < 1) {
    throw new Error(`SIM_CALIBRATION_RUNS must be a positive integer: ${calibrationRuns}`);
  }
  const conditions = SWEEP_CONDITIONS;
  const conditionSummaries = [];
  for (const condition of conditions) {
    conditionSummaries.push(runChild(condition, runsPerClass, calibrationRuns));
  }
  const summary = buildParentSummary(conditionSummaries, runsPerClass, calibrationRuns);
  const resultDir = join(process.cwd(), "scratch", "results");
  mkdirSync(resultDir, { recursive: true });
  const summaryJson = `${JSON.stringify(summary, null, 2)}\n`;
  summary.summarySha256 = sha256(summaryJson);
  writeFileSync(join(resultDir, `${OUTPUT_STEM}.json`), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(join(resultDir, `${OUTPUT_STEM}.md`), buildMarkdown(summary));
  process.stdout.write(JSON.stringify({
    output: `scratch/results/${OUTPUT_STEM}.md`,
    summaryOutput: `scratch/results/${OUTPUT_STEM}.json`,
    conditions: conditionSummaries.length,
    runsPerClass,
    calibrationRuns,
    rawRows: summary.rawRows,
    sourceCommit: summary.measurement.sourceCommit,
    originMainAncestor: summary.measurement.originMainAncestor,
    summarySha256: summary.summarySha256
  }, null, 2) + "\n");
}

function reaggregate() {
  const resultDir = join(process.cwd(), "scratch", "results");
  const summaryPath = join(resultDir, `${OUTPUT_STEM}.json`);
  const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
  writeFileSync(join(resultDir, `${OUTPUT_STEM}.md`), buildMarkdown(summary));
  process.stdout.write(JSON.stringify({
    output: `scratch/results/${OUTPUT_STEM}.md`,
    summarySha256: summary.summarySha256,
    reaggregated: true
  }, null, 2) + "\n");
}

if (isMainThread && process.env.ISSUE528_REAGGREGATE === "1") {
  reaggregate();
} else if (isMainThread && IS_SINGLE) {
  await runSingle();
} else if (isMainThread) {
  runSweep();
}
