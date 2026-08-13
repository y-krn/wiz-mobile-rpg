// sim-scope: run — Issue #275 phase 5 boss-exit candidate sweep
/* global console, process */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

import { resolveSimParallelism, runSimTasks } from "./sim_parallel.js";

const SMOKE = process.env.ISSUE275_PHASE5_SMOKE === "1";
const SEED = 461;
const DEFAULT_RUNS_PER_CLASS = 500;
const DEFAULT_CALIBRATION_RUNS = 100;
const RUNS_PER_CLASS = SMOKE
  ? 2
  : Math.max(1, Number(process.env.SIM_RUNS || DEFAULT_RUNS_PER_CLASS));
const CALIBRATION_RUNS = SMOKE
  ? 1
  : Math.max(1, Number(process.env.SIM_CALIBRATION_RUNS || DEFAULT_CALIBRATION_RUNS));
const TARGET_DEPTHS = Object.freeze([5, 6, 7, 8, 9, 10]);
const BASIC_CLASSES = Object.freeze(["Fighter", "Thief", "Priest", "Mage"]);
const SCENARIO_IDS = Object.freeze([
  "workshop-empty",
  "workshop-stats",
  "workshop-gear",
  "workshop-blood-wand",
  "workshop-blood-wand-spells",
  "workshop-complete"
]);
const POLICIES = Object.freeze([
  "baseline",
  "near-stairs",
  "shortcut-0",
  "shortcut-1",
  "shortcut-2",
  "shortcut-4",
  "shortcut-8",
  "shortcut-16"
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
const RESULT_STEM = process.env.SIM_RESULT_BASENAME ||
  (SMOKE ? "issue-275-phase5-boss-exit-smoke" : "issue-275-phase5-boss-exit");
const R95 = 1.959963984540054;

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
  SIM_SCENARIOS: SCENARIO_IDS.join(","),
  SIM_EXPLORATION_FACTOR: "1.4"
});

function applyFixedEnvironment() {
  if (process.env.SIM_PARALLEL !== undefined) {
    throw new Error("Issue #275 phase 5 omits SIM_PARALLEL");
  }
  if (process.env.SIM_MAP_CACHE_ENTRIES !== undefined) {
    throw new Error("Issue #275 phase 5 omits SIM_MAP_CACHE_ENTRIES");
  }
  for (const [key, value] of Object.entries(ENV_DEFAULTS)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
      continue;
    }
    if (process.env[key] !== value) {
      throw new Error(`Issue #275 phase 5 fixed env mismatch: ${key}=${process.env[key]} != ${value}`);
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
  SIM_CLASSES,
  MEASUREMENT_PROVENANCE
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

function meanStats(values) {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) {
    return { mean: null, low: null, high: null, trials: 0, uncertain: true };
  }
  const mean = finite.reduce((sum, value) => sum + value, 0) / finite.length;
  if (finite.length < 2) {
    return { mean, low: null, high: null, trials: finite.length, uncertain: true };
  }
  const variance = finite.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (finite.length - 1);
  const margin = R95 * Math.sqrt(variance / finite.length);
  return {
    mean,
    low: mean - margin,
    high: mean + margin,
    trials: finite.length,
    uncertain: finite.length < 30
  };
}

function wilson(successes, trials) {
  if (trials === 0) {
    return { estimate: null, low: null, high: null, trials: 0, uncertain: true };
  }
  const p = successes / trials;
  const z2 = R95 ** 2;
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

function formatMean(stat, digits = 2) {
  if (!stat || stat.mean === null) return "未観測";
  if (stat.low === null) return `${stat.mean.toFixed(digits)} [未確定; N=${stat.trials}]`;
  return `${stat.mean.toFixed(digits)} [${stat.low.toFixed(digits)},${stat.high.toFixed(digits)}; N=${stat.trials}]`;
}

function formatRate(stat) {
  if (!stat || stat.estimate === null) return "未観測";
  return `${(stat.estimate * 100).toFixed(1)}% [${(stat.low * 100).toFixed(1)},${(stat.high * 100).toFixed(1)}; N=${stat.trials}]`;
}

function environmentHash() {
  const values = Object.fromEntries(
    Object.keys(ENV_DEFAULTS).sort().map(key => [key, process.env[key]])
  );
  values.SIM_PARALLEL = "<omitted>";
  values.SIM_MAP_CACHE_ENTRIES = "<omitted; default=1024>";
  values.ISSUE275_PHASE5_MODE = SMOKE ? "smoke" : "measurement";
  values.POLICIES = POLICIES.join(",");
  const canonical = Object.entries(values)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n") + "\n";
  return { hash: sha256(canonical), values };
}

export function runIssue275Phase5Task(task, context) {
  const baseScenario = getScenarioById(task.scenarioId);
  const scenario = { ...baseScenario, bossExitPolicy: task.policy };
  resetSimulationRandom(hashSeed(
    `${SEED}:issue275-phase5:${task.scenarioId}:${task.className}:${task.runIndex}`
  ));
  const result = simulateRun({
    className: task.className,
    startFloor: 1,
    targetDepth: task.targetDepth,
    runIndex: task.runIndex,
    seriesId: "issue275-phase5",
    scoringProfile: context.scoringProfiles[task.scenarioId],
    scenario,
    workshop: scenario.workshop
  });
  const b5 = result.specialRouteFloors?.find(route => route.floor === 5) || null;
  return {
    policy: task.policy,
    targetDepth: task.targetDepth,
    className: task.className,
    runIndex: task.runIndex,
    scenarioId: task.scenarioId,
    survived: Boolean(result.survived),
    died: Boolean(result.died),
    reachedFloor: result.reachedFloor,
    targetReached: result.reachedFloor >= task.targetDepth,
    materialAcquired: result.materialAcquired,
    materialFromChest: result.materialSources?.chest || 0,
    bankedMaterials: result.bankedMaterials,
    timeCost: result.timeCost,
    materialEvPerTime: result.timeCost > 0
      ? result.bankedMaterials / result.timeCost
      : 0,
    steps: result.steps,
    chestsOpened: result.chestsOpened || 0,
    b5RouteDistance: b5?.routeDistance ?? null,
    b5BossToStairsDistance: b5?.bossToStairsDistance ?? null,
    b5NaturalBossToStairsDistance: b5?.naturalBossToStairsDistance ?? null,
    b5BossExitDistance: b5?.bossExitDistance ?? null,
    b5ChestsOpened: result.chestsOpenedByFloor?.[5] ?? null
  };
}

function summarizePolicyDepth(rows, policy, targetDepth) {
  const selected = rows.filter(row => row.policy === policy && row.targetDepth === targetDepth);
  const b5 = selected.filter(row => Number.isFinite(row.b5RouteDistance));
  return {
    policy,
    targetDepth,
    runs: selected.length,
    materialEvPerTime: meanStats(selected.map(row => row.materialEvPerTime)),
    materialAcquired: meanStats(selected.map(row => row.materialAcquired)),
    materialFromChest: meanStats(selected.map(row => row.materialFromChest)),
    bankedMaterials: meanStats(selected.map(row => row.bankedMaterials)),
    timeCost: meanStats(selected.map(row => row.timeCost)),
    steps: meanStats(selected.map(row => row.steps)),
    chestsOpened: meanStats(selected.map(row => row.chestsOpened)),
    deathRate: wilson(selected.filter(row => row.died).length, selected.length),
    survivalRate: wilson(selected.filter(row => row.survived).length, selected.length),
    targetReachedRate: wilson(selected.filter(row => row.targetReached).length, selected.length),
    b5RouteDistance: meanStats(b5.map(row => row.b5RouteDistance)),
    b5BossToStairsDistance: meanStats(b5.map(row => row.b5BossToStairsDistance)),
    b5NaturalBossToStairsDistance: meanStats(b5.map(row => row.b5NaturalBossToStairsDistance)),
    b5BossExitDistance: meanStats(b5.map(row => row.b5BossExitDistance)),
    b5ChestsOpened: meanStats(b5.map(row => row.b5ChestsOpened))
  };
}

function buildGroups(rows) {
  return Object.fromEntries(POLICIES.map(policy => [
    policy,
    Object.fromEntries(TARGET_DEPTHS.map(targetDepth => [
      targetDepth,
      summarizePolicyDepth(rows, policy, targetDepth)
    ]))
  ]));
}

function findBestEv(group) {
  return TARGET_DEPTHS.reduce((best, targetDepth) => {
    const candidate = group[targetDepth].materialEvPerTime;
    if (!candidate || candidate.mean === null) return best;
    return !best || candidate.mean > best.stat.mean
      ? { targetDepth, stat: candidate }
      : best;
  }, null);
}

function pairedDelta(rows, policy, fromDepth, toDepth, selector) {
  const index = new Map(rows.filter(row => row.policy === policy).map(row => [
    `${row.className}:${row.runIndex}:${row.scenarioId}:${row.targetDepth}`,
    row
  ]));
  const deltas = [];
  for (const row of rows) {
    if (row.policy !== policy || row.targetDepth !== fromDepth) continue;
    const peer = index.get(`${row.className}:${row.runIndex}:${row.scenarioId}:${toDepth}`);
    if (peer) deltas.push(selector(peer) - selector(row));
  }
  return meanStats(deltas);
}

function buildMarkdown(summary) {
  const lines = [
    "# Issue #275 フェーズ5 ボス撃破後出口の候補掃引",
    "",
    "## 判定",
    "",
    `- ${summary.mode === "smoke" ? "smoke測定。主判定不可。" : "各主集計N>=30。"} B5〜B10だけ測定。B15/B20未測定。`,
    "- `(a) near-stairs`: B5/B10のmilestone bossを、生成済みmap内で階段最近傍の空セルへ移す what-if。階段位置・critical pathは固定。",
    "- `(b) shortcut-N`: boss撃破後の階段までの実効残距離をN歩へ置換。boss前の経路・戦闘・報酬は固定。",
    `- ` + POLICIES.map(policy => {
      const best = findBestEv(summary.groups[policy]);
      return `${policy}のEV/時間最大点=B${best?.targetDepth ?? "?"}`;
    }).join(" / ") + "。",
    "",
    "## 候補比較（全職合算）",
    ""
  ];
  for (const policy of POLICIES) {
    const group = summary.groups[policy];
    const b5 = group[5];
    const b6 = group[6];
    const b10 = group[10];
    const paired = pairedDelta(summary.rows, policy, 5, 10, row => row.materialEvPerTime);
    lines.push(
      `- **${policy}**: EV/時間 B5 ${formatMean(b5.materialEvPerTime, 4)} / B6 ${formatMean(b6.materialEvPerTime, 4)} / B10 ${formatMean(b10.materialEvPerTime, 4)}。B5→B10 paired差 ${formatMean(paired, 4)}。`,
      `  - B5 boss経由 route ${formatMean(b6.b5RouteDistance)}、boss→階段 ${formatMean(b6.b5BossToStairsDistance)}（natural ${formatMean(b6.b5NaturalBossToStairsDistance)}）、B5宝箱 ${formatMean(b6.b5ChestsOpened)}。`,
      `  - B10 生還 ${formatRate(b10.survivalRate)}、死亡 ${formatRate(b10.deathRate)}、到達 ${formatRate(b10.targetReachedRate)}、素材 ${formatMean(b10.materialAcquired)}、時間 ${formatMean(b10.timeCost)}。`,
      ""
    );
  }
  lines.push(
    "## 深度別EV/時間",
    "",
    ...POLICIES.flatMap(policy => TARGET_DEPTHS.map(targetDepth =>
      `- ${policy} B${targetDepth}: ${formatMean(summary.groups[policy][targetDepth].materialEvPerTime, 4)}`
    )),
    "",
    "## 方法・制約",
    "",
    `- seed=${summary.seed}、各職N=${summary.runsPerClass}、calibration N=${summary.calibrationRuns}、各policy ${summary.rowsPerPolicy} rows。工房分布=${WORKSHOP_DISTRIBUTION.map(([id, count]) => `${id}:${count}/${WORKSHOP_TOTAL}`).join(", ")}。`,
    "- `generateRunFloor`経由の実map、現行戦闘・報酬・装備・罠・逃走・TOWN_PORTAL・状態回復・departure kitを使用。報酬量・EXPLORATION_FACTOR・B15/B20は変更なし。",
    "- route変更後も拾得宝箱を再抽選。帰路短縮で宝箱取得機会が減る影響を素材・宝箱列で確認。",
    "- EV/時間=run単位のbank素材 / timeCost。率 Wilson 95%、平均 正規近似95%。N<30は判定不可。",
    "",
    "## 監査・再現",
    "",
    `- source commit: ${summary.measurement.sourceCommit}`,
    `- origin/main ancestor: ${summary.measurement.originMainAncestor}`,
    `- env hash: ${summary.envHash}`,
    `- raw JSONL SHA-256: ${summary.rawSha256}`,
    `- summary JSON SHA-256: ${summary.summarySha256}`,
    `- resolved parallelism: ${summary.measurement.resolvedParallelism}（SIM_PARALLEL未指定）`,
    `- calibration wall-clock: ${summary.measurement.calibrationWallSeconds.toFixed(3)}s / simulation wall-clock: ${summary.measurement.simulationWallSeconds.toFixed(3)}s`,
    "",
    "```sh",
    "node --check scratch/sim_depth_material_ev.js",
    "node --check scratch/measure_issue_275_phase5_boss_exit.js",
    "ISSUE275_PHASE5_SMOKE=1 node scratch/measure_issue_275_phase5_boss_exit.js",
    "node scratch/measure_issue_275_phase5_boss_exit.js",
    "```",
    "",
    "## 判定用メモ",
    "",
    "- 主判定はEV/時間最大点がB10へ移るか。副判定はB5 boss後距離、素材・宝箱、生還/死亡。",
    "- 本実装はboss撃破後にbossセルへ追加stairs-downを開く任意shortcut（simのshortcut-0相当）。元の階段は残す。",
    "- 本掃引では主判定B10最大化は未達。実装後もB15/B20は未測定で、深度EVの追加調整は次判断へ残す。"
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
      { ...scenario, bossExitPolicy: "baseline" },
      "powder",
      scenario.workshop
    );
  }
  const calibrationCpu = process.cpuUsage(calibrationCpuStarted);
  const calibrationWallSeconds = (performance.now() - calibrationStarted) / 1000;

  const tasks = POLICIES.flatMap(policy => TARGET_DEPTHS.flatMap(targetDepth =>
    BASIC_CLASSES.flatMap(className =>
      Array.from({ length: RUNS_PER_CLASS }, (_, runIndex) => ({
        policy,
        targetDepth,
        className,
        runIndex,
        scenarioId: scenarioForRun(runIndex)
      }))
    )
  ));
  const resolvedParallelism = resolveSimParallelism(tasks.length);
  const simulationStarted = performance.now();
  const simulationCpuStarted = process.cpuUsage();
  const rows = await runSimTasks({
    moduleUrl: pathToFileURL(fileURLToPath(import.meta.url)).href,
    exportName: "runIssue275Phase5Task",
    runTask: runIssue275Phase5Task,
    tasks,
    context: { scoringProfiles },
    mapGeneratorExportName: "generateSharedRunFloor"
  });
  const simulationCpu = process.cpuUsage(simulationCpuStarted);
  const simulationWallSeconds = (performance.now() - simulationStarted) / 1000;
  if (rows.length !== tasks.length || rows.some(row => !row)) {
    throw new Error(`raw result audit failed: rows=${rows.length}/${tasks.length}`);
  }
  rows.sort((left, right) =>
    left.policy.localeCompare(right.policy) ||
    left.className.localeCompare(right.className) ||
    left.runIndex - right.runIndex ||
    left.targetDepth - right.targetDepth
  );

  const rawText = `${rows.map(row => JSON.stringify(row)).join("\n")}\n`;
  const rawSha256 = sha256(rawText);
  const env = environmentHash();
  const provenance = MEASUREMENT_PROVENANCE || {};
  const summaryWithoutHash = {
    issue: 275,
    phase: "phase5-boss-exit-candidate-sweep",
    mode: SMOKE ? "smoke" : "measurement",
    seed: SEED,
    policies: POLICIES,
    targetDepths: TARGET_DEPTHS,
    runsPerClass: RUNS_PER_CLASS,
    calibrationRuns: CALIBRATION_RUNS,
    rowsPerPolicy: TARGET_DEPTHS.length * BASIC_CLASSES.length * RUNS_PER_CLASS,
    rawSha256,
    envHash: env.hash,
    measurement: {
      sourceCommit: provenance.sourceCommit || "unknown",
      originMainAncestor: provenance.originMainAncestor ?? null,
      staleTreeAllowed: provenance.staleTreeAllowed || "none",
      resolvedParallelism,
      calibrationWallSeconds,
      simulationWallSeconds,
      totalCpuSeconds: (calibrationCpu.user + calibrationCpu.system + simulationCpu.user + simulationCpu.system) / 1e6
    },
    groups: buildGroups(rows)
  };
  const summaryPreHash = `${JSON.stringify(summaryWithoutHash, null, 2)}\n`;
  const summary = {
    ...summaryWithoutHash,
    summarySha256: sha256(summaryPreHash)
  };
  const markdown = buildMarkdown({ ...summary, rows });
  const resultDir = new URL("./results/", import.meta.url);
  mkdirSync(resultDir, { recursive: true });
  writeFileSync(new URL(`${RESULT_STEM}.raw.jsonl`, resultDir), rawText);
  writeFileSync(new URL(`${RESULT_STEM}.json`, resultDir), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(new URL(`${RESULT_STEM}.md`, resultDir), markdown);
  console.log(JSON.stringify({
    output: `scratch/results/${RESULT_STEM}.md`,
    policies: POLICIES,
    rows: rows.length,
    reportSha256: sha256(markdown),
    summarySha256: summary.summarySha256,
    rawSha256
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
