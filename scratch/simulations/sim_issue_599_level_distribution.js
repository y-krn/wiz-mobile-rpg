// sim-scope: run — Issue #599 level distribution, level unlocks, and Priest healing
/* global console, process */

import "./simulation_preflight.js";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

import { EXP_LEVELS } from "../../src/data/progression.js";
import { SPELLS } from "../../src/data/spells.js";
import { resolveSimParallelism, runSimTasks } from "./sim_parallel.js";

const SMOKE = process.env.ISSUE599_SMOKE === "1";
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
const WORKSHOP_TOTAL = WORKSHOP_DISTRIBUTION.reduce((sum, [, count]) => sum + count, 0);
const FULL_SCENARIO_IDS = Object.freeze(WORKSHOP_DISTRIBUTION.map(([id]) => id));
const SCENARIO_IDS = Object.freeze(
  SMOKE ? ["workshop-complete"] : FULL_SCENARIO_IDS
);
const TARGET_DEPTH = 20;
const RUNS_PER_CLASS = SMOKE ? 1 : 500;
const CALIBRATION_RUNS = SMOKE ? 1 : 100;
const R95 = 1.959963984540054;
const RESULT_BASENAME = "issue-599-level-distribution";
const LEVEL_BIN_TARGETS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8]);
const RECOVERY_SPELLS = Object.freeze(["DIOS", "MADIOS", "MADI", "DIALMA"]);
const LOW_RATE_THRESHOLD = 0.5;
const MADIOS_MAX_HEAL = 70;
const MAX_LEVEL = EXP_LEVELS.length - 1;
const STAT_GROWTH_LEVELS = Object.freeze(
  Array.from({ length: Math.floor(MAX_LEVEL / 3) }, (_, index) => (index + 1) * 3)
);
const HP_GROWTH_RANGES = Object.freeze({
  Fighter: "7-9",
  Thief: "5-7",
  Priest: "4-6",
  Mage: "4-6"
});
const SPELL_UNLOCKS = Object.freeze({
  Priest: Object.freeze([
    [2, "MADIOS"], [2, "DIALKO"], [2, "LATUMOFIS"],
    [3, "LOMILWA"], [4, "MABARRIER"], [4, "WEAKEN"],
    [5, "MADI"], [8, "DIALMA"]
  ]),
  Mage: Object.freeze([
    [2, "LAHALITO"], [3, "KATINO"], [3, "MAHALITO"],
    [4, "MASFEAL"], [4, "MONTINO"], [5, "MORLIS"],
    [6, "MADALTO"], [8, "TILTOWAIT"]
  ])
});

for (const key of ["SIM_PARALLEL", "SIM_MAP_CACHE_ENTRIES", "SIM_SKIP_PROVENANCE"]) {
  if (process.env[key] !== undefined) {
    throw new Error(`${key} must be omitted for Issue #599 measurement`);
  }
}
for (const key of [
  "SIM_DIALMA_CANDIDATE",
  "SIM_MADI_CANDIDATE",
  "SIM_MADI_HEAL_MIN",
  "SIM_MADI_HEAL_MAX",
  "SIM_MADI_COST"
]) {
  if (process.env[key] !== undefined) {
    throw new Error(`${key} must remain unset for Issue #599 measurement`);
  }
}

const ENV_DEFAULTS = Object.freeze({
  SIM_PRESET: "",
  SIM_SEED: "461",
  SIM_RUNS: String(RUNS_PER_CLASS),
  SIM_CALIBRATION_RUNS: String(CALIBRATION_RUNS),
  DEPARTURE_CRAFT_IDS:
    "TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION",
  IDENTIFICATION_POLICY: "powder",
  IDENTIFICATION_STARTING_POWDER: "2",
  IDENTIFICATION_COST_OVERRIDE: "1",
  TRAP_POLICY: "conservative",
  TRAP_AVOIDANCE_POLICY: "ev",
  TRAP_DAMAGE_MULTIPLIER: "1",
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
  SIM_INDEPENDENT_RUN_RANDOM: "0",
  SIM_SCENARIOS: SCENARIO_IDS.join(",")
});

for (const [key, value] of Object.entries(ENV_DEFAULTS)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
    continue;
  }
  if (process.env[key] !== value) {
    throw new Error(`Issue #599 fixed env mismatch: ${key}=${process.env[key]}`);
  }
}

const simulationModule = await import("./sim_depth_material_ev.js");
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
  SIM_CLASSES.length !== BASIC_CLASSES.length ||
  BASIC_CLASSES.some(className => !SIM_CLASSES.includes(className))
) {
  throw new Error(`basic class set mismatch: ${SIM_CLASSES.join(",")}`);
}
if (MAX_LEVEL < 8) throw new Error(`EXP_LEVELS max level is below 8: ${MAX_LEVEL}`);

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

function scenarioForRun(runIndex) {
  if (SMOKE) return SCENARIO_IDS[0];
  const position = ((runIndex * 37) % RUNS_PER_CLASS + 0.5) /
    RUNS_PER_CLASS * WORKSHOP_TOTAL;
  let cumulative = 0;
  for (const [scenarioId, count] of WORKSHOP_DISTRIBUTION) {
    cumulative += count;
    if (position < cumulative) return scenarioId;
  }
  return WORKSHOP_DISTRIBUTION.at(-1)[0];
}

export function generateSharedRunFloor(args) {
  return generateSharedRunFloorSource(args);
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

export function runIssue599Task(task, context) {
  const scenario = getScenarioById(task.scenarioId);
  const scoringProfile = context.scoringProfiles[task.scenarioId];
  if (!scoringProfile) throw new Error(`missing scoring profile: ${task.scenarioId}`);

  const randomSequenceId = `${task.scenarioId}:${task.className}:${task.runIndex}`;
  resetSimulationRandom(hashSeed(`461:issue599:${randomSequenceId}`));
  const collectDiagnostics = task.className === "Priest";
  const result = simulateRun({
    className: task.className,
    startFloor: 1,
    targetDepth: TARGET_DEPTH,
    runIndex: task.runIndex,
    seriesId: "issue599-level-distribution",
    scoringProfile,
    scenario,
    workshop: scenario.workshop,
    collectDiagnostics
  });
  const finalBuild = result.diagnostics?.finalBuild || null;
  if (collectDiagnostics) {
    if (result.diagnostics?.level !== "full") {
      throw new Error(
        `Priest finalBuild requires full diagnostics: ${task.scenarioId}:${task.runIndex}`
      );
    }
    if (!finalBuild || !Number.isFinite(finalBuild.maxHp)) {
      throw new Error(`Priest finalBuild.maxHp missing: ${task.scenarioId}:${task.runIndex}`);
    }
  }

  return {
    className: task.className,
    runIndex: task.runIndex,
    scenarioId: task.scenarioId,
    randomSequenceId,
    reachedFloor: result.reachedFloor,
    deathFloor: result.deathFloor,
    survived: Boolean(result.survived),
    died: Boolean(result.died),
    finalLevel: result.finalLevel,
    finalMaxHp: finalBuild?.maxHp ?? null,
    finalHp: finalBuild?.hp ?? null,
    diagnosticLevel: result.diagnostics?.level ?? null,
    endpoints: {
      b5: endpoint(result, 5),
      b10: endpoint(result, 10)
    },
    spellUsage: Object.fromEntries(
      RECOVERY_SPELLS.map(spellName => [
        spellName,
        { ...(result.spellUsage?.[spellName] || {}) }
      ])
    )
  };
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
    status: trials < 30 ? "未確定（N<30）" : "確定"
  };
}

function quantile(values, probability) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function numericSummary(values) {
  if (values.length === 0) return null;
  return {
    count: values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    p25: quantile(values, 0.25),
    p50: quantile(values, 0.50),
    p75: quantile(values, 0.75),
    p90: quantile(values, 0.90)
  };
}

function formatNumber(value, digits = 1) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : Number(value).toFixed(digits);
}

function formatRate(stat) {
  if (stat.estimate === null) return "未観測（N=0; CIなし）";
  const status = stat.status === "確定" ? "" : `; ${stat.status}`;
  return `${(stat.estimate * 100).toFixed(1)}% ` +
    `[${(stat.low * 100).toFixed(1)}, ${(stat.high * 100).toFixed(1)}] ` +
    `(${stat.successes}/${stat.trials})${status}`;
}

function classRowsByName(rows) {
  return Object.fromEntries(
    BASIC_CLASSES.map(className => [
      className,
      rows.filter(row => row.className === className)
    ])
  );
}

function levelRate(rows, level) {
  return wilson(rows.filter(row => row.finalLevel >= level).length, rows.length);
}

function finalLevelStats(rows) {
  return numericSummary(rows.map(row => row.finalLevel));
}

function makeUnlockRows() {
  const rows = [];
  for (const className of BASIC_CLASSES) {
    rows.push({
      className,
      unlockLevel: 2,
      element: `HP成長ロール ${HP_GROWTH_RANGES[className]}（lv2以降）`
    });
    for (const level of STAT_GROWTH_LEVELS) {
      rows.push({
        className,
        unlockLevel: level,
        element: "成長ステータス+1（level % 3 === 0）"
      });
    }
    if (className === "Priest" || className === "Mage") {
      rows.push({
        className,
        unlockLevel: 2,
        element: className === "Priest" ? "MP +2 / level（lv2以降）" : "MP +3 / level（lv2以降）"
      });
    }
    for (const [unlockLevel, spellName] of SPELL_UNLOCKS[className] || []) {
      rows.push({ className, unlockLevel, element: `${spellName} 習得` });
    }
  }
  return rows;
}

const LEVEL_UNLOCK_ROWS = Object.freeze(makeUnlockRows());

function buildTasks() {
  return BASIC_CLASSES.flatMap(className =>
    Array.from({ length: RUNS_PER_CLASS }, (_, runIndex) => ({
      className,
      runIndex,
      scenarioId: scenarioForRun(runIndex)
    }))
  );
}

function calibrateProfiles() {
  const scoringProfiles = {};
  for (const scenarioId of SCENARIO_IDS) {
    const scenario = getScenarioById(scenarioId);
    resetSimulationRandom(Number(process.env.SIM_SEED) >>> 0);
    scoringProfiles[scenarioId] = calibrateCoreScoringProfile(
      CALIBRATION_RUNS,
      scenario,
      "powder",
      scenario.workshop
    );
  }
  return scoringProfiles;
}

async function measure(scoringProfiles) {
  const tasks = buildTasks();
  const resolvedParallelism = resolveSimParallelism(tasks.length);
  const started = performance.now();
  const cpuStarted = process.cpuUsage();
  const rows = await runSimTasks({
    moduleUrl: pathToFileURL(fileURLToPath(import.meta.url)).href,
    exportName: "runIssue599Task",
    runTask: runIssue599Task,
    tasks,
    context: { scoringProfiles },
    mapGeneratorExportName: "generateSharedRunFloor"
  });
  const cpu = process.cpuUsage(cpuStarted);
  if (rows.length !== tasks.length) {
    throw new Error(`raw result audit failed: rows=${rows.length}/${tasks.length}`);
  }
  const keys = new Set();
  rows.forEach(row => {
    const key = `${row.className}:${row.runIndex}:${row.scenarioId}`;
    if (keys.has(key)) throw new Error(`duplicate run key: ${key}`);
    keys.add(key);
    if (Number(row.survived) + Number(row.died) !== 1) {
      throw new Error(`non-terminal run result: ${JSON.stringify(row)}`);
    }
    if (!Number.isInteger(row.finalLevel) || row.finalLevel < 1 || row.finalLevel > MAX_LEVEL) {
      throw new Error(`invalid finalLevel: ${JSON.stringify(row)}`);
    }
  });
  return {
    rows,
    resolvedParallelism,
    wallSeconds: (performance.now() - started) / 1000,
    cpuSeconds: (cpu.user + cpu.system) / 1e6
  };
}

function formatLevelDistributionCell(rows, level) {
  return formatRate(levelRate(rows, level));
}

function renderLevelDistributionTable(lines, title, classRows, subsetLabel, selectRows) {
  lines.push(
    `### ${title}`,
    "",
    `各セルは「lvN以上」到達率。Wilson 95% CI、分母=${subsetLabel}。` +
      "括弧内は到達run数/分母。lv8はlv8以上。",
    "",
    "| 職業 | 分母 | lv1 | lv2 | lv3 | lv4 | lv5 | lv6 | lv7 | lv8+ |",
    "| --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- |"
  );
  for (const className of BASIC_CLASSES) {
    const allRows = classRows[className];
    const rows = selectRows(allRows);
    lines.push(
      `| ${CLASS_LABELS[className]} | ${rows.length} | ` +
      LEVEL_BIN_TARGETS.map(level => formatLevelDistributionCell(rows, level)).join(" | ") +
      " |"
    );
  }
  lines.push("");
}

function renderLv5Lv8Table(lines, classRows) {
  lines.push(
    "### lv5 / lv8 到達率",
    "",
    "分母は全run。MADIはlv5、DIALMAはlv8で習得する。Wilson 95% CI付き。",
    "",
    "| 職業 | lv5到達率 | lv8到達率 |",
    "| --- | --- | --- |"
  );
  for (const className of BASIC_CLASSES) {
    lines.push(
      `| ${CLASS_LABELS[className]} | ${formatRate(levelRate(classRows[className], 5))} | ` +
      `${formatRate(levelRate(classRows[className], 8))} |`
    );
  }
  lines.push("");
}

function renderQuantileTable(lines, title, classRows, subsetLabel, selectRows) {
  lines.push(
    `### ${title}`,
    "",
    `finalLevel の分位点。対象runの分母=${subsetLabel}。p50は中央値。`,
    "",
    "| 職業 | 対象run N | p25 | p50（中央値） | p75 | p90 |",
    "| --- | ---: | ---: | ---: | ---: | ---: |"
  );
  for (const className of BASIC_CLASSES) {
    const rows = selectRows(classRows[className]);
    const stats = finalLevelStats(rows);
    lines.push(
      `| ${CLASS_LABELS[className]} | ${rows.length} | ${formatNumber(stats?.p25)} | ` +
      `${formatNumber(stats?.p50)} | ${formatNumber(stats?.p75)} | ${formatNumber(stats?.p90)} |`
    );
  }
  lines.push("");
}

function renderUnlockTable(lines, classRows) {
  lines.push(
    "## レベル依存要素",
    "",
    "一次情報源は `src/systems/leveling.js` のレベルアップ判定関数。" +
      "到達率は実際の `finalLevel >= 解放lv`、分母は各職の全run。",
    `EXP_LEVELS の最大レベル上限は lv${MAX_LEVEL}（配列長=${EXP_LEVELS.length}）。`,
    "Fighter/Thiefには同関数上のレベル依存呪文はなく、共通のHP・ステータス成長のみ。",
    `低到達率の記述フラグは点推定<${LOW_RATE_THRESHOLD * 100}%（設計判断ではない）。`,
    "",
    "| 職業 | 要素 | 解放lv | 到達率（Wilson 95%; 分母=全run） | フラグ |",
    "| --- | --- | ---: | --- | --- |"
  );
  for (const unlock of LEVEL_UNLOCK_ROWS) {
    const stat = levelRate(classRows[unlock.className], unlock.unlockLevel);
    const flag = stat.estimate !== null && stat.estimate < LOW_RATE_THRESHOLD
      ? "低到達率（点推定<50%）"
      : "—";
    lines.push(
      `| ${CLASS_LABELS[unlock.className]} | ${unlock.element} | lv${unlock.unlockLevel} | ` +
      `${formatRate(stat)} | ${flag} |`
    );
  }
  lines.push("");
}

function priestMaxHpReport(priestRows) {
  const byLevel = new Map();
  for (const row of priestRows) {
    if (!Number.isFinite(row.finalMaxHp)) continue;
    const values = byLevel.get(row.finalLevel) || [];
    values.push(row.finalMaxHp);
    byLevel.set(row.finalLevel, values);
  }
  const observed = [...byLevel.entries()].sort(([left], [right]) => left - right);
  const fullCoverageLevels = observed
    .filter(([, values]) => Math.max(...values) <= MADIOS_MAX_HEAL)
    .map(([level]) => level);
  const firstOverCap = observed.find(([, values]) => Math.max(...values) > MADIOS_MAX_HEAL)?.[0] ?? null;
  return {
    byLevel,
    allValues: observed.flatMap(([, values]) => values),
    firstFullCoverage: fullCoverageLevels[0] ?? null,
    lastFullCoverage: fullCoverageLevels.at(-1) ?? null,
    firstOverCap
  };
}

function renderPriestMaxHpTable(lines, report) {
  lines.push(
    "## 僧侶のレベル別maxHp実測分布",
    "",
    "`diagnostics.finalBuild.maxHp`（simの実測スナップショット、装備込みの実効maxHp）を" +
      "finalLevel別に集計。理論HPロールからの再計算はしていない。",
    "",
    "| lv | N | min | p25 | p50 | 平均 | p75 | p90 | max | maxHp≤70（MADIOS上限で全快） |",
    "| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |"
  );
  for (let level = 1; level <= MAX_LEVEL; level++) {
    const values = report.byLevel.get(level);
    const stats = numericSummary(values || []);
    const coverage = values
      ? wilson(values.filter(value => value <= MADIOS_MAX_HEAL).length, values.length)
      : wilson(0, 0);
    lines.push(
      `| lv${level} | ${values?.length || 0} | ${formatNumber(stats?.min)} | ` +
      `${formatNumber(stats?.p25)} | ${formatNumber(stats?.p50)} | ${formatNumber(stats?.mean)} | ` +
      `${formatNumber(stats?.p75)} | ${formatNumber(stats?.p90)} | ${formatNumber(stats?.max)} | ` +
      `${formatRate(coverage)} |`
    );
  }
  lines.push(
    "",
    `「MADIOS上限70が全快をカバー」は測定maxHp≤70と定義。全測定runがカバーされる` +
      `最小観測レベル: ${report.firstFullCoverage === null ? "なし" : `lv${report.firstFullCoverage}`}。`,
    `maxHp>70が初めて観測されるレベル: ${report.firstOverCap === null ? "未観測" : `lv${report.firstOverCap}`}。` +
      ` 全runカバーが最後に続く観測レベル: ${report.lastFullCoverage === null ? "なし" : `lv${report.lastFullCoverage}`}。`,
    ""
  );
}

function recoveryTotals(priestRows, spellName) {
  return priestRows.reduce((totals, row) => {
    const usage = row.spellUsage?.[spellName] || {};
    totals.casts += Number(usage.postCombatCasts || 0);
    totals.healingHp += Number(usage.postCombatHealingHp || 0);
    return totals;
  }, { casts: 0, healingHp: 0 });
}

function renderRecoveryTable(lines, priestRows, maxHpReport) {
  lines.push(
    "## 回復呪文の実効回復とmaxHpの関係",
    "",
    "`postCombatHealingHp / postCombatCasts` は既存simの戦闘後回復メトリクス。" +
      "終了時maxHpとの上限比較は、回復発生時点ではなく実測スナップショットに対する参考値。",
    "",
    "| 呪文 | 設定レンジ | postCombatCasts | postCombatHealingHp | 実効HP/回 | 上限 | 終了maxHp≤上限（参考） |",
    "| --- | --- | ---: | ---: | ---: | ---: | --- |"
  );
  for (const spellName of RECOVERY_SPELLS) {
    const spell = SPELLS[spellName];
    const totals = recoveryTotals(priestRows, spellName);
    const effective = totals.casts > 0 ? totals.healingHp / totals.casts : null;
    const coverage = wilson(
      maxHpReport.allValues.filter(value => value <= spell.healMax).length,
      maxHpReport.allValues.length
    );
    lines.push(
      `| ${spellName} | ${spell.healMin}-${spell.healMax} | ${totals.casts} | ` +
      `${totals.healingHp} | ${formatNumber(effective)} | ${spell.healMax} | ${formatRate(coverage)} |`
    );
  }
  lines.push("");
}

function canonicalEnvironment(environment) {
  return Object.entries(environment)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n") + "\n";
}

function environmentForHash() {
  return {
    ...getResolvedSimulationEnv(),
    SIM_PRESET: "",
    SIM_PARALLEL: "<omitted; runtime default>",
    SIM_MAP_CACHE_ENTRIES: "<omitted; runtime default 1024>",
    SIM_SKIP_PROVENANCE: "<omitted>",
    ISSUE599_TARGET_DEPTH: String(TARGET_DEPTH),
    ISSUE599_RUNS_PER_CLASS: String(RUNS_PER_CLASS),
    ISSUE599_CALIBRATION_RUNS: String(CALIBRATION_RUNS),
    ISSUE599_WORKSHOP_DISTRIBUTION: WORKSHOP_DISTRIBUTION
      .map(([scenarioId, count]) => `${scenarioId}:${count}/${WORKSHOP_TOTAL}`)
      .join(","),
    ISSUE599_SCENARIOS: SCENARIO_IDS.join(","),
    ISSUE599_MAX_LEVEL: String(MAX_LEVEL),
    ISSUE599_MANUAL_RANDOM_SEQUENCE: "hash(SIM_SEED:issue599:scenarioId:className:runIndex)",
    ISSUE599_DIAGNOSTICS: "Priest only; scenario simDiagnosticLevel fallback is full"
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
  rawSha256
}) {
  const classRows = classRowsByName(rows);
  const priestRows = classRows.Priest;
  const maxHpReport = priestMaxHpReport(priestRows);
  const diagnosticsByScenario = Object.fromEntries(
    SCENARIO_IDS.map(scenarioId => [
      scenarioId,
      [...new Set(
        priestRows
          .filter(row => row.scenarioId === scenarioId)
          .map(row => row.diagnosticLevel)
      )].join(",") || "未観測"
    ])
  );
  const lines = [
    "# Issue #599 段階1（やること1〜3）レベル分布測定",
    "",
    `実行モード: ${SMOKE ? "smoke（各職N=1、workshop-completeのみ）" : "full（各職N=500）"}。` +
      "基本4職のみ。設計変更・バランス変更は行わない。",
    `target depth: B${TARGET_DEPTH}。到達率の分母は明記し、率にはWilson 95% CIを付ける。`,
    `EXP_LEVELS の最大レベル: lv${MAX_LEVEL}。`,
    ""
  ];

  lines.push("## 到達レベル分布", "");
  renderLevelDistributionTable(
    lines,
    "全run分母",
    classRows,
    "全run",
    rowsForClass => rowsForClass
  );
  renderLv5Lv8Table(lines, classRows);
  renderLevelDistributionTable(
    lines,
    "B5到達run内のレベル分布",
    classRows,
    "B5到達run（全runからの条件付き）",
    rowsForClass => rowsForClass.filter(row => row.endpoints.b5.entrant)
  );
  renderLevelDistributionTable(
    lines,
    "B10到達run内のレベル分布",
    classRows,
    "B10到達run（全runからの条件付き）",
    rowsForClass => rowsForClass.filter(row => row.endpoints.b10.entrant)
  );

  lines.push("## 到達レベル分位点", "");
  renderQuantileTable(lines, "全run分母", classRows, "全run", rowsForClass => rowsForClass);
  renderQuantileTable(
    lines,
    "B5到達run分母",
    classRows,
    "B5到達run",
    rowsForClass => rowsForClass.filter(row => row.endpoints.b5.entrant)
  );
  renderQuantileTable(
    lines,
    "B10到達run分母",
    classRows,
    "B10到達run",
    rowsForClass => rowsForClass.filter(row => row.endpoints.b10.entrant)
  );

  renderUnlockTable(lines, classRows);
  renderPriestMaxHpTable(lines, maxHpReport);
  renderRecoveryTable(lines, priestRows, maxHpReport);

  lines.push(
    "## 固定条件・診断・再現",
    "",
    `- source commit: \`${provenance.sourceCommit}\``,
    `- origin/main ancestor: \`${provenance.originMainAncestor}\`; stale tree allowed: \`${provenance.staleTreeAllowed}\``,
    `- calibration: N=${CALIBRATION_RUNS}/scenario; ${calibration.wallSeconds.toFixed(3)}s wall, ` +
      `${calibration.cpuSeconds.toFixed(3)}s CPU; profile SHA-256 \`${calibration.sha256}\``,
    `- simulation: ${measurement.wallSeconds.toFixed(3)}s wall, ${measurement.cpuSeconds.toFixed(3)}s CPU; ` +
      `resolved parallelism=${measurement.resolvedParallelism}`,
    `- diagnosticLevel（Priest finalBuild）: ${Object.entries(diagnosticsByScenario)
      .map(([scenarioId, level]) => `${scenarioId}=${level}`).join(", ")}`,
    "- 既定workshopシナリオは `simDiagnosticLevel` 未指定時のsim実装フォールバック `full` を使用。",
    `- raw JSONL: \`${rawPath}\`; SHA-256 \`${rawSha256}\`（rawはgitignore対象）`,
    "- `SIM_PARALLEL` / `SIM_MAP_CACHE_ENTRIES` / `SIM_SKIP_PROVENANCE` は未設定（runnerのthrowガードで固定）。",
    "- `node --check scratch/simulations/sim_issue_599_level_distribution.js` 済み。",
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
    "node --check scratch/simulations/sim_issue_599_level_distribution.js",
    "ISSUE599_SMOKE=1 node scratch/simulations/sim_issue_599_level_distribution.js",
    "node scratch/simulations/sim_issue_599_level_distribution.js",
    "```",
    "",
    `env hash: \`${envHash}\``,
    ""
  );
  return lines.join("\n");
}

async function main() {
  const calibrationStarted = performance.now();
  const calibrationCpuStarted = process.cpuUsage();
  const scoringProfiles = calibrateProfiles();
  const calibrationCpu = process.cpuUsage(calibrationCpuStarted);
  const calibration = {
    wallSeconds: (performance.now() - calibrationStarted) / 1000,
    cpuSeconds: (calibrationCpu.user + calibrationCpu.system) / 1e6,
    sha256: sha256(JSON.stringify(scoringProfiles))
  };
  const measurement = await measure(scoringProfiles);
  const environment = environmentForHash();
  const envHash = sha256(canonicalEnvironment(environment));
  const provenance = MEASUREMENT_PROVENANCE || {
    sourceCommit: "test",
    originMainAncestor: null,
    staleTreeAllowed: null
  };
  const resultDir = new URL("./results/", new URL("./", import.meta.url));
  mkdirSync(resultDir, { recursive: true });
  const rawPath = new URL(`${RESULT_BASENAME}.jsonl`, resultDir);
  const rawText = measurement.rows.map(row => JSON.stringify(row)).join("\n") + "\n";
  writeFileSync(rawPath, rawText);
  const rawSha256 = sha256(rawText);
  const markdown = renderMarkdown({
    rows: measurement.rows,
    environment,
    envHash,
    provenance,
    calibration,
    measurement,
    rawPath: fileURLToPath(rawPath),
    rawSha256
  });
  const markdownPath = new URL(`${RESULT_BASENAME}.md`, resultDir);
  writeFileSync(markdownPath, `${markdown}\n`);
  console.log(`summary: ${fileURLToPath(markdownPath)}`);
  console.log(`summary SHA-256: ${sha256(`${markdown}\n`)}`);
  console.log(`raw JSONL: ${fileURLToPath(rawPath)}`);
  console.log(`raw SHA-256: ${rawSha256}`);
  console.log(`env hash: ${envHash}`);
  console.log(`rows: ${measurement.rows.length}; parallelism: ${measurement.resolvedParallelism}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
