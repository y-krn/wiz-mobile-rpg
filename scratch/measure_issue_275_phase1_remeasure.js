// sim-scope: run — Issue #275 phase 1 current-baseline remeasurement
/* global console, process */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

import { resolveSimParallelism, runSimTasks } from "./sim_parallel.js";

const SMOKE = process.env.ISSUE275_PHASE1_SMOKE === "1";
const DEFAULT_RUNS_PER_CLASS = 500;
const DEFAULT_CALIBRATION_RUNS = 100;
const RUNS_PER_CLASS = SMOKE
  ? 2
  : Math.max(1, Number(process.env.SIM_RUNS || DEFAULT_RUNS_PER_CLASS));
const CALIBRATION_RUNS = SMOKE
  ? 1
  : Math.max(1, Number(process.env.SIM_CALIBRATION_RUNS || DEFAULT_CALIBRATION_RUNS));
const SEED = Number(process.env.SIM_SEED || 461) >>> 0;
const TARGET_DEPTHS = Object.freeze([5, 10, 15, 20]);
const BASIC_CLASSES = Object.freeze(["Fighter", "Thief", "Priest", "Mage"]);
const SCENARIO_IDS = Object.freeze([
  "workshop-empty",
  "workshop-stats",
  "workshop-gear",
  "workshop-blood-wand",
  "workshop-blood-wand-spells",
  "workshop-complete"
]);
const WORKSHOP_DISTRIBUTION = Object.freeze([
  ["workshop-empty", 30],
  ["workshop-stats", 74],
  ["workshop-gear", 69],
  ["workshop-blood-wand", 216],
  ["workshop-blood-wand-spells", 47],
  ["workshop-complete", 764]
]);
const WORKSHOP_TOTAL = WORKSHOP_DISTRIBUTION.reduce(
  (sum, [, count]) => sum + count,
  0
);
const R95 = 1.959963984540054;
const RESULT_STEM = process.env.SIM_RESULT_BASENAME ||
  (SMOKE ? "issue-275-phase1-remeasure-smoke" : "issue-275-phase1-remeasure");

const ENV_DEFAULTS = Object.freeze({
  SIM_PRESET: "",
  SIM_SEED: String(SEED),
  SIM_RUNS: String(RUNS_PER_CLASS),
  SIM_CALIBRATION_RUNS: String(CALIBRATION_RUNS),
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
  PORTAL_HP_THRESHOLD: "0.35",
  PORTAL_MAX_HEAL_POTIONS: "0",
  PORTAL_MIN_FLOOR: "3",
  ELITE_POLICY: "avoid",
  BLOOD_WAND_HP_PAYMENT_MIN_RATE: "0.50",
  SIM_CORE_SCORE_DROP_TOLERANCE: "0",
  SIM_440_CONDITION: "current",
  SIM_SCENARIOS: SCENARIO_IDS.join(",")
});

function applyFixedEnvironment() {
  if (process.env.SIM_PARALLEL !== undefined) {
    throw new Error("Issue #275 phase 1 omits SIM_PARALLEL");
  }
  if (process.env.SIM_MAP_CACHE_ENTRIES !== undefined) {
    throw new Error("Issue #275 phase 1 omits SIM_MAP_CACHE_ENTRIES");
  }
  for (const [key, value] of Object.entries(ENV_DEFAULTS)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
      continue;
    }
    if (process.env[key] !== value) {
      throw new Error(
        `Issue #275 phase 1 fixed env mismatch: ${key}=${process.env[key]} != ${value}`
      );
    }
  }
}

applyFixedEnvironment();

const simulationModule = await import("./sim_depth_material_ev.js");
const {
  calibrateCoreScoringProfile,
  getScenarioById,
  resetSimulationRandom,
  simulateRun,
  SIM_CLASSES
} = simulationModule;

if (!SMOKE && JSON.stringify(SIM_CLASSES) !== JSON.stringify(BASIC_CLASSES)) {
  throw new Error(`unexpected SIM_CLASSES: ${SIM_CLASSES.join(",")}`);
}

export function generateSharedRunFloor(args) {
  return simulationModule.generateSharedRunFloor(args);
}

function hashSeed(text) {
  let seed = 2166136261;
  for (let index = 0; index < text.length; index++) {
    seed ^= text.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function scenarioForRun(runIndex) {
  const position = ((runIndex * 37) % RUNS_PER_CLASS + 0.5) /
    RUNS_PER_CLASS * WORKSHOP_TOTAL;
  let cumulative = 0;
  for (const [scenarioId, count] of WORKSHOP_DISTRIBUTION) {
    cumulative += count;
    if (position < cumulative) return scenarioId;
  }
  return WORKSHOP_DISTRIBUTION.at(-1)[0];
}

function endpoint(result, floor) {
  const entrant = result.reachedFloor >= floor;
  const outcome = !entrant
    ? null
    : result.reachedFloor > floor
      ? "breakthrough"
      : result.deathFloor === floor
        ? "death"
        : "retreat";
  return {
    entrant,
    outcome,
    breakthrough: outcome === "breakthrough",
    death: outcome === "death",
    retreat: outcome === "retreat"
  };
}

function projectResult(result, task) {
  return {
    targetDepth: task.targetDepth,
    className: task.className,
    runIndex: task.runIndex,
    scenarioId: task.scenarioId,
    outcome: result.outcome,
    survived: Boolean(result.survived),
    died: Boolean(result.died),
    reachedFloor: result.reachedFloor,
    deathFloor: result.deathFloor,
    finalLevel: result.finalLevel,
    fleeCount: result.fleeCount,
    fleeRun: result.fleeCount > 0,
    targetReached: result.reachedFloor >= task.targetDepth,
    townPortalsUsed: result.townPortalsUsed,
    bankedMaterials: result.bankedMaterials,
    timeCost: result.timeCost,
    materialEvPerTime: result.timeCost > 0
      ? result.bankedMaterials / result.timeCost
      : 0,
    endpoints: Object.fromEntries(
      TARGET_DEPTHS.map(floor => [floor, endpoint(result, floor)])
    )
  };
}

export function runIssue275Phase1Task(task, context) {
  const scenario = getScenarioById(task.scenarioId);
  resetSimulationRandom(hashSeed(
    `${SEED}:issue275-phase1:${task.scenarioId}:${task.className}:${task.runIndex}`
  ));
  const result = simulateRun({
    className: task.className,
    startFloor: 1,
    targetDepth: task.targetDepth,
    runIndex: task.runIndex,
    seriesId: `issue275-phase1:${task.scenarioId}`,
    scoringProfile: context.scoringProfiles[task.scenarioId],
    scenario,
    workshop: scenario.workshop,
    collectDiagnostics: false
  });
  return projectResult(result, task);
}

function wilson(successes, trials) {
  if (trials <= 0) {
    return { estimate: null, low: null, high: null, trials, uncertain: true };
  }
  const p = successes / trials;
  const z2 = R95 * R95;
  const denominator = 1 + z2 / trials;
  const center = (p + z2 / (2 * trials)) / denominator;
  const margin = R95 * Math.sqrt(
    (p * (1 - p) + z2 / (4 * trials)) / trials
  ) / denominator;
  return {
    estimate: p,
    low: Math.max(0, center - margin),
    high: Math.min(1, center + margin),
    trials,
    uncertain: trials < 30
  };
}

function meanStats(values) {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) {
    return { mean: null, low: null, high: null, trials: 0, uncertain: true };
  }
  const mean = finite.reduce((sum, value) => sum + value, 0) / finite.length;
  if (finite.length < 2) {
    return { mean, low: null, high: null, trials: finite.length, uncertain: true };
  }
  const variance = finite.reduce(
    (sum, value) => sum + (value - mean) ** 2,
    0
  ) / (finite.length - 1);
  const margin = R95 * Math.sqrt(variance / finite.length);
  return {
    mean,
    low: mean - margin,
    high: mean + margin,
    trials: finite.length,
    uncertain: finite.length < 30
  };
}

function endpointStats(rows, endpointId) {
  const entrants = rows.filter(row => row.endpoints[endpointId].entrant);
  return {
    entrant: wilson(entrants.length, rows.length),
    breakthrough: wilson(
      entrants.filter(row => row.endpoints[endpointId].breakthrough).length,
      entrants.length
    ),
    death: wilson(
      entrants.filter(row => row.endpoints[endpointId].death).length,
      entrants.length
    ),
    retreat: wilson(
      entrants.filter(row => row.endpoints[endpointId].retreat).length,
      entrants.length
    )
  };
}

function summarizeRows(rows, targetDepth, className) {
  const selected = rows.filter(
    row => row.targetDepth === targetDepth &&
      (className === null || row.className === className)
  );
  const runs = selected.length;
  return {
    targetDepth,
    className,
    runs,
    averageFinalLevel: meanStats(selected.map(row => row.finalLevel)),
    averageReachedFloor: meanStats(selected.map(row => row.reachedFloor)),
    averageFleeCount: meanStats(selected.map(row => row.fleeCount)),
    materialEvPerTime: meanStats(selected.map(row => row.materialEvPerTime)),
    bankedMaterialEv: meanStats(selected.map(row => row.bankedMaterials)),
    averageTimeCost: meanStats(selected.map(row => row.timeCost)),
    survivalRate: wilson(selected.filter(row => row.survived).length, runs),
    deathRate: wilson(selected.filter(row => row.died).length, runs),
    fleeRunRate: wilson(selected.filter(row => row.fleeRun).length, runs),
    targetReachedRate: wilson(selected.filter(row => row.targetReached).length, runs),
    townPortalUseRate: wilson(
      selected.filter(row => row.townPortalsUsed > 0).length,
      runs
    ),
    endpoints: Object.fromEntries(
      TARGET_DEPTHS.map(floor => [floor, endpointStats(selected, floor)])
    )
  };
}

function indexRows(rows, className) {
  const selected = className === null
    ? rows
    : rows.filter(row => row.className === className);
  return new Map(selected.map(row => [
    `${row.className}:${row.runIndex}:${row.targetDepth}`,
    row
  ]));
}

function pairedDepthDelta(rows, className, fromDepth, toDepth, field) {
  const indexed = indexRows(rows, className);
  const values = [];
  const classes = className === null ? BASIC_CLASSES : [className];
  for (const currentClass of classes) {
    for (let runIndex = 0; runIndex < RUNS_PER_CLASS; runIndex++) {
      const from = indexed.get(`${currentClass}:${runIndex}:${fromDepth}`);
      const to = indexed.get(`${currentClass}:${runIndex}:${toDepth}`);
      if (!from || !to) continue;
      values.push(to[field] - from[field]);
    }
  }
  return meanStats(values);
}

function classifyDelta(stat) {
  if (!stat || stat.mean === null) return "未観測";
  if (stat.high < 0) return "統計的低下";
  if (stat.low > 0) return "統計的上昇";
  return "CI重複";
}

function buildCurveDiagnostics(rows, className, summaries) {
  const points = TARGET_DEPTHS.map(targetDepth =>
    summaries.find(item => item.targetDepth === targetDepth)
  );
  const adjacent = TARGET_DEPTHS.slice(1).map((toDepth, index) => {
    const fromDepth = TARGET_DEPTHS[index];
    const delta = pairedDepthDelta(
      rows,
      className,
      fromDepth,
      toDepth,
      "materialEvPerTime"
    );
    return {
      fromDepth,
      toDepth,
      delta,
      direction: classifyDelta(delta)
    };
  });
  const peak = [...points]
    .filter(item => item?.materialEvPerTime?.mean !== null)
    .sort((left, right) =>
      right.materialEvPerTime.mean - left.materialEvPerTime.mean
    )[0] || null;
  const firstPointDecline = adjacent.find(item => item.delta.mean < 0) || null;
  const statisticallySignificantDecline = adjacent.find(
    item => item.delta.high < 0
  ) || null;
  return {
    peakDepth: peak?.targetDepth || null,
    peakEvPerTime: peak?.materialEvPerTime || null,
    firstPointDecline: firstPointDecline
      ? `${firstPointDecline.fromDepth}→${firstPointDecline.toDepth}`
      : null,
    statisticallySignificantDecline: statisticallySignificantDecline
      ? `${statisticallySignificantDecline.fromDepth}→${statisticallySignificantDecline.toDepth}`
      : null,
    adjacent
  };
}

function buildSummaryByGroup(rows, className) {
  const summaries = TARGET_DEPTHS.map(targetDepth =>
    summarizeRows(rows, targetDepth, className)
  );
  return {
    className,
    summaries,
    curve: buildCurveDiagnostics(rows, className, summaries),
    targetResponse: {
      b5ToB20AverageReachedFloor: pairedDepthDelta(
        rows,
        className,
        5,
        20,
        "reachedFloor"
      ),
      b5ToB20AverageFinalLevel: pairedDepthDelta(
        rows,
        className,
        5,
        20,
        "finalLevel"
      ),
      b5ToB20FleeCount: pairedDepthDelta(
        rows,
        className,
        5,
        20,
        "fleeCount"
      )
    }
  };
}

function formatPercent(stat, digits = 1) {
  if (!stat || stat.estimate === null) return "未観測";
  const suffix = stat.uncertain ? " 未確定" : "";
  return `${(stat.estimate * 100).toFixed(digits)}% ` +
    `[${(stat.low * 100).toFixed(digits)},${(stat.high * 100).toFixed(digits)}; ` +
    `N=${stat.trials}]${suffix}`;
}

function formatMean(stat, digits = 2) {
  if (!stat || stat.mean === null) return "未観測";
  if (stat.low === null) return `${stat.mean.toFixed(digits)} [未確定; N=${stat.trials}]`;
  const suffix = stat.uncertain ? " 未確定" : "";
  return `${stat.mean.toFixed(digits)} ` +
    `[${stat.low.toFixed(digits)},${stat.high.toFixed(digits)}; ` +
    `N=${stat.trials}]${suffix}`;
}

function formatDelta(stat, digits = 4) {
  return `${formatMean(stat, digits)} (${classifyDelta(stat)})`;
}

function renderEndpoint(stat) {
  return [
    `E ${formatPercent(stat.entrant)}`,
    `X ${formatPercent(stat.breakthrough)}`,
    `D ${formatPercent(stat.death)}`,
    `R ${formatPercent(stat.retreat)}`
  ].join(" / ");
}

function buildMarkdown(summary) {
  const all = summary.groups.all;
  const lines = [
    "# Issue #275 フェーズ1 現行基準線再測定",
    "",
    "## 判定",
    "",
    "- 2026-08-13オーナー判断に従い、設計・balance・`src/`を変更せず、現行実src経路だけを測定した。",
    `- 対象深度 B5/B10/B15/B20、各職 N=${summary.runsPerClass}、seed=${summary.seed}。` +
      "平均Lv・逃走run率・素材EV/時間・目標深度応答を職業別に集計した。",
    `- 全職合算の素材EV/時間ピーク: B${all.curve.peakDepth} ` +
      `(${formatMean(all.curve.peakEvPerTime, 4)})。` +
      ` 点推定で最初の低下: ${all.curve.firstPointDecline || "なし"}。` +
      ` paired差CIで統計的低下: ${all.curve.statisticallySignificantDecline || "なし"}。`,
    "- 点推定ピークだけで設計判断せず、隣接深度のpaired差95% CIを併記。N<30は未確定扱い。",
    "- ここは観測フェーズ。フェーズ2のEXP・逃走・報酬レバー切り分け、実装、PRは未実施。",
    "",
    "## 全職合算 深度カーブ",
    "",
    "| 目標 | 平均Lv | 逃走run率 | 素材EV/時間 | 平均到達階 | 目標到達率 | 生還率 | 死亡率 | 平均時間 | bank素材EV |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"
  ];
  for (const item of all.summaries) {
    lines.push(
      `| B${item.targetDepth} | ${formatMean(item.averageFinalLevel)} | ` +
      `${formatPercent(item.fleeRunRate)} | ${formatMean(item.materialEvPerTime, 4)} | ` +
      `${formatMean(item.averageReachedFloor)} | ${formatPercent(item.targetReachedRate)} | ` +
      `${formatPercent(item.survivalRate)} | ${formatPercent(item.deathRate)} | ` +
      `${formatMean(item.averageTimeCost)} | ${formatMean(item.bankedMaterialEv)} |`
    );
  }
  lines.push(
    "",
    "### EV/時間 隣接差（paired、後深度−前深度）",
    "",
    "| 区間 | ΔEV/時間95%CI | 判定 |",
    "| --- | --- | --- |"
  );
  for (const item of all.curve.adjacent) {
    lines.push(
      `| B${item.fromDepth}→B${item.toDepth} | ${formatDelta(item.delta)} | ${item.direction} |`
    );
  }

  lines.push(
    "",
    "## 職業別 全指標",
    "",
    "各職・各深度 N は各職のrun数。率はWilson 95% CI、平均は正規近似95% CI。",
    ""
  );
  for (const className of BASIC_CLASSES) {
    const group = summary.groups[className];
    lines.push(
      `### ${className}`,
      "",
      "| 目標 | 平均Lv | 逃走run率 | 平均逃走回数 | 素材EV/時間 | 平均到達階 | 目標到達率 | 生還率 | 死亡率 | 平均時間 | bank素材EV |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"
    );
    for (const item of group.summaries) {
      lines.push(
        `| B${item.targetDepth} | ${formatMean(item.averageFinalLevel)} | ` +
        `${formatPercent(item.fleeRunRate)} | ${formatMean(item.averageFleeCount)} | ` +
        `${formatMean(item.materialEvPerTime, 4)} | ${formatMean(item.averageReachedFloor)} | ` +
        `${formatPercent(item.targetReachedRate)} | ${formatPercent(item.survivalRate)} | ` +
        `${formatPercent(item.deathRate)} | ${formatMean(item.averageTimeCost)} | ` +
        `${formatMean(item.bankedMaterialEv)} |`
      );
    }
    lines.push(
      "",
      `EV/時間ピーク: B${group.curve.peakDepth}。` +
        ` 点推定の最初の低下=${group.curve.firstPointDecline || "なし"}、` +
        `paired差CIで統計的低下=${group.curve.statisticallySignificantDecline || "なし"}。`,
      `B5→B20 paired差: 到達階=${formatDelta(group.targetResponse.b5ToB20AverageReachedFloor, 2)}、` +
        `最終Lv=${formatDelta(group.targetResponse.b5ToB20AverageFinalLevel, 2)}、` +
        `逃走回数=${formatDelta(group.targetResponse.b5ToB20FleeCount, 2)}。`,
      ""
    );
  }

  lines.push(
    "## 目標深度への反応",
    "",
    "| 職 | B5→B20 平均到達階差 | B5→B20 最終Lv差 | B5→B20 逃走回数差 | EVピーク |",
    "| --- | --- | --- | --- | --- |",
    `| 全職合算 | ${formatDelta(all.targetResponse.b5ToB20AverageReachedFloor, 2)} | ` +
      `${formatDelta(all.targetResponse.b5ToB20AverageFinalLevel, 2)} | ` +
      `${formatDelta(all.targetResponse.b5ToB20FleeCount, 2)} | B${all.curve.peakDepth} |`
  );
  for (const className of BASIC_CLASSES) {
    const group = summary.groups[className];
    lines.push(
      `| ${className} | ${formatDelta(group.targetResponse.b5ToB20AverageReachedFloor, 2)} | ` +
      `${formatDelta(group.targetResponse.b5ToB20AverageFinalLevel, 2)} | ` +
      `${formatDelta(group.targetResponse.b5ToB20FleeCount, 2)} | B${group.curve.peakDepth} |`
    );
  }

  lines.push(
    "",
    "## 測定条件",
    "",
    `- seed=${summary.seed}、各深度・職 N=${summary.runsPerClass}、calibration N=${summary.calibrationRuns}。`,
    `- 対象職=${BASIC_CLASSES.join("/")}。工房分布=${WORKSHOP_DISTRIBUTION.map(([id, count]) => `${id}:${count}/${WORKSHOP_TOTAL}`).join(", ")}。`,
    "- 現行固定env: departure kit `TOWN_PORTAL + HEAL_POTION×4 + ANTIDOTE + GUARD_POTION`、powder鑑定、`FLEE_POLICY=ev`、`HEAL_POTION_THRESHOLD=0.55`、`TRAP_POLICY=conservative`、`TRAP_AVOIDANCE_POLICY=ev`、状態治療smart、portal `HP<=35% / 薬<=0 / B3以降`。",
    "- `SIM_PARALLEL` / `SIM_MAP_CACHE_ENTRIES` は未指定。runtime既定値を使用。",
    "- 各target depthで同一 `(scenario,class,runIndex)` を対応させ、EV/時間の隣接差はpaired正規近似95% CI。分岐後の軌跡を同一とは解釈しない。",
    "- `generateRunFloor`、現行戦闘/報酬/装備更新、罠、状態治療、回復薬、`TOWN_PORTAL`、現行killHeal、core判定を実経路でモデル化。",
    "- 非モデル化: 任意商人購入、MP/強化アイテムの能動使用、任意寄り道、テレポーター再経路化、徘徊エリートの移動後接触、人間の敵別判断。固定policyで代理した現行基準線であり、what-ifではない。",
    "",
    "## 監査・再現",
    "",
    `- source commit: ${summary.measurement.sourceCommit}`,
    `- origin/main ancestor: ${summary.measurement.originMainAncestor}`,
    `- stale tree allowed: ${summary.measurement.staleTreeAllowed}`,
    `- env hash: ${summary.envHash}`,
    `- raw JSONL SHA-256: ${summary.rawSha256}`,
    `- summary JSON SHA-256: ${summary.summarySha256}`,
    `- resolved parallelism: ${summary.measurement.resolvedParallelism}（SIM_PARALLEL未指定）`,
    `- calibration wall-clock: ${summary.measurement.calibrationWallSeconds.toFixed(3)}s`,
    `- simulation wall-clock: ${summary.measurement.simulationWallSeconds.toFixed(3)}s`,
    `- total CPU（user+system）: ${summary.measurement.totalCpuSeconds.toFixed(3)}s`,
    `- raw: scratch/results/${RESULT_STEM}.raw.jsonl`,
    `- summary: scratch/results/${RESULT_STEM}.json`,
    "",
    "再現:",
    "",
    "```sh",
    `node --check scratch/measure_issue_275_phase1_remeasure.js`,
    "ISSUE275_PHASE1_SMOKE=1 node scratch/measure_issue_275_phase1_remeasure.js",
    "node scratch/measure_issue_275_phase1_remeasure.js",
    "```",
    "",
    "## プレイヤー影響",
    "",
    "- 本フェーズは観測のみ。ゲームコード・balance値・設計canonへの変更なし。プレイヤー影響なし。",
    "- フェーズ2の候補優先順位は、この職業別深度カーブと目標深度応答を根拠に別途決める。"
  );
  return `${lines.join("\n")}\n`;
}

async function main() {
  const scoringProfiles = {};
  const calibrationStarted = performance.now();
  const calibrationCpuStarted = process.cpuUsage();
  for (const scenarioId of SCENARIO_IDS) {
    const scenario = getScenarioById(scenarioId);
    resetSimulationRandom(SEED);
    scoringProfiles[scenarioId] = calibrateCoreScoringProfile(
      CALIBRATION_RUNS,
      scenario,
      "powder",
      scenario.workshop
    );
  }
  const calibrationCpu = process.cpuUsage(calibrationCpuStarted);
  const calibrationWallSeconds = (performance.now() - calibrationStarted) / 1000;

  const tasks = TARGET_DEPTHS.flatMap(targetDepth =>
    BASIC_CLASSES.flatMap(className =>
      Array.from({ length: RUNS_PER_CLASS }, (_, runIndex) => ({
        targetDepth,
        className,
        runIndex,
        scenarioId: scenarioForRun(runIndex)
      }))
    )
  );
  const resolvedParallelism = resolveSimParallelism(tasks.length);
  const simulationStarted = performance.now();
  const simulationCpuStarted = process.cpuUsage();
  const rows = await runSimTasks({
    moduleUrl: pathToFileURL(fileURLToPath(import.meta.url)).href,
    exportName: "runIssue275Phase1Task",
    runTask: runIssue275Phase1Task,
    tasks,
    context: { scoringProfiles },
    mapGeneratorExportName: "generateSharedRunFloor"
  });
  const simulationCpu = process.cpuUsage(simulationCpuStarted);
  const simulationWallSeconds = (performance.now() - simulationStarted) / 1000;
  if (rows.length !== tasks.length) {
    throw new Error(`raw result audit failed: rows=${rows.length}/${tasks.length}`);
  }
  rows.sort((left, right) =>
    left.className.localeCompare(right.className) ||
    left.runIndex - right.runIndex ||
    left.targetDepth - right.targetDepth
  );

  const rawText = `${rows.map(row => JSON.stringify(row)).join("\n")}\n`;
  const rawSha256 = sha256(rawText);
  const measurementProvenance = simulationModule.MEASUREMENT_PROVENANCE || {
    sourceCommit: "test",
    originMainAncestor: null,
    staleTreeAllowed: null
  };
  const environment = {
    ...ENV_DEFAULTS,
    ISSUE275_PHASE1_MODE: SMOKE ? "smoke" : "measurement",
    ISSUE275_PHASE1_TARGET_DEPTHS: TARGET_DEPTHS.join(","),
    ISSUE275_PHASE1_CLASSES: BASIC_CLASSES.join(","),
    ISSUE275_PHASE1_WORKSHOP_DISTRIBUTION: WORKSHOP_DISTRIBUTION
      .map(([id, count]) => `${id}:${count}/${WORKSHOP_TOTAL}`)
      .join(","),
    SIM_PARALLEL: "<omitted; runtime default>",
    SIM_MAP_CACHE_ENTRIES: "<omitted; runtime default 1024>"
  };
  const envCanonical = Object.entries(environment)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n") + "\n";
  const envHash = sha256(envCanonical);
  const measurement = {
    sourceCommit: measurementProvenance.sourceCommit,
    originMainAncestor: measurementProvenance.originMainAncestor,
    staleTreeAllowed: measurementProvenance.staleTreeAllowed,
    resolvedParallelism,
    calibrationWallSeconds,
    simulationWallSeconds,
    totalCpuSeconds: (
      calibrationCpu.user + calibrationCpu.system +
      simulationCpu.user + simulationCpu.system
    ) / 1e6
  };
  const groups = Object.fromEntries([
    ["all", buildSummaryByGroup(rows, null)],
    ...BASIC_CLASSES.map(className => [
      className,
      buildSummaryByGroup(rows, className)
    ])
  ]);
  const summaryWithoutHash = {
    issue: 275,
    phase: "phase1",
    mode: SMOKE ? "smoke" : "measurement",
    seed: SEED,
    runsPerClass: RUNS_PER_CLASS,
    calibrationRuns: CALIBRATION_RUNS,
    targetDepths: TARGET_DEPTHS,
    classes: BASIC_CLASSES,
    workshopDistribution: WORKSHOP_DISTRIBUTION,
    environment,
    envHash,
    rawSha256,
    rows: rows.length,
    measurement,
    groups,
    reproductionCommand: "node scratch/measure_issue_275_phase1_remeasure.js"
  };
  const summaryPreHash = `${JSON.stringify(summaryWithoutHash, null, 2)}\n`;
  const summarySha256 = sha256(summaryPreHash);
  const summary = { ...summaryWithoutHash, summarySha256 };
  const resultDir = new URL("./results/", new URL("./", import.meta.url));
  mkdirSync(resultDir, { recursive: true });
  writeFileSync(new URL(`${RESULT_STEM}.raw.jsonl`, resultDir), rawText);
  writeFileSync(
    new URL(`${RESULT_STEM}.json`, resultDir),
    `${JSON.stringify(summary, null, 2)}\n`
  );
  writeFileSync(new URL(`${RESULT_STEM}.md`, resultDir), buildMarkdown(summary));
  process.stdout.write(JSON.stringify({
    output: `scratch/results/${RESULT_STEM}.md`,
    summaryOutput: `scratch/results/${RESULT_STEM}.json`,
    rawOutput: `scratch/results/${RESULT_STEM}.raw.jsonl`,
    rows: rows.length,
    runsPerClass: RUNS_PER_CLASS,
    calibrationRuns: CALIBRATION_RUNS,
    envHash,
    rawSha256,
    summarySha256,
    sourceCommit: measurement.sourceCommit,
    originMainAncestor: measurement.originMainAncestor,
    resolvedParallelism,
    wallClockSeconds: calibrationWallSeconds + simulationWallSeconds,
    cpuTotalSeconds: measurement.totalCpuSeconds
  }, null, 2) + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
