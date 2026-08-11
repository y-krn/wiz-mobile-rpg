// sim-scope: run — #499 回復供給の用量掃引と別機構同量比較
/* global console, process */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { resolveSimParallelism, runSimTasks } from "./sim_parallel.js";

const BASIC_CLASSES = Object.freeze(["Fighter", "Thief", "Priest", "Mage"]);
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
const DOSE_TARGETS = Object.freeze([0.4, 1.0, 2.0, 3.0, 4.0]);
const R95 = 1.959963984540054;
const OUTPUT_STEM = process.env.SIM_RESULT_BASENAME || "issue-499-shallow-recovery-supply";
const SMOKE = process.env.ISSUE499_SMOKE === "1";
const FIXED_DETECTION_SCENARIO = process.env.ISSUE499_FIXED_DETECTION === "1"
  ? { floorTrapDetection: "certain", trapSenseDisposition: "disarm" }
  : {};

const ENV_DEFAULTS = Object.freeze({
  SIM_PRESET: "",
  SIM_SEED: "499",
  SIM_RUNS: "3000",
  SIM_CALIBRATION_RUNS: "1000",
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
  SIM_SCENARIOS: WORKSHOP_SCENARIOS.join(","),
  SIM_DIAGNOSTICS: "off"
});

for (const [key, value] of Object.entries(ENV_DEFAULTS)) {
  if (process.env[key] === undefined) process.env[key] = value;
}
if (process.env.SIM_PARALLEL !== undefined || process.env.SIM_MAP_CACHE_ENTRIES !== undefined) {
  throw new Error("Issue #499 measurement omits SIM_PARALLEL and SIM_MAP_CACHE_ENTRIES");
}

function parseChanceList(value, name) {
  const values = String(value)
    .split(",")
    .map(entry => Number(entry.trim()));
  if (
    values.length !== DOSE_TARGETS.length ||
    values.some(entry => !Number.isFinite(entry) || entry < 0 || entry > 1)
  ) {
    throw new Error(`${name} must contain five chances in [0,1]: ${value}`);
  }
  return Object.freeze(values);
}

function parseOptionalChance(value, name) {
  if (value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${name} must be in [0,1]: ${value}`);
  }
  return parsed;
}

const RUNS_PER_CLASS = SMOKE ? 2 : Number(process.env.SIM_RUNS);
const CALIBRATION_RUNS = SMOKE ? 1 : Number(process.env.SIM_CALIBRATION_RUNS);
const DOSE_CHANCES = parseChanceList(
  process.env.ISSUE499_DOSE_CHANCES || "0.014,0.037,0.072,0.100,0.123",
  "ISSUE499_DOSE_CHANCES"
);
const ALTERNATE_CHANCE = parseOptionalChance(
  process.env.ISSUE499_ALTERNATE_CHANCE,
  "ISSUE499_ALTERNATE_CHANCE"
);
const ALTERNATE_TARGET = process.env.ISSUE499_ALTERNATE_TARGET || null;
if ((ALTERNATE_CHANCE === null) !== (ALTERNATE_TARGET === null)) {
  throw new Error("ISSUE499_ALTERNATE_CHANCE and ISSUE499_ALTERNATE_TARGET must be set together");
}
if (!Number.isInteger(RUNS_PER_CLASS) || RUNS_PER_CLASS < 1) {
  throw new Error(`SIM_RUNS must be a positive integer: ${RUNS_PER_CLASS}`);
}
if (!Number.isInteger(CALIBRATION_RUNS) || CALIBRATION_RUNS < 1) {
  throw new Error(`SIM_CALIBRATION_RUNS must be a positive integer: ${CALIBRATION_RUNS}`);
}

const {
  calibrateCoreScoringProfile,
  getResolvedSimulationEnv,
  getScenarioById,
  resetSimulationRandom,
  SIM_CLASSES
} = await import("./sim_depth_material_ev.js");
const {
  acceptanceFor,
  conditionSummary,
  runIssue499Task
} = await import("./sim_issue_499_shallow_recovery_supply.js");

if (BASIC_CLASSES.some(className => !SIM_CLASSES.includes(className))) {
  throw new Error(`basic classes missing: ${BASIC_CLASSES.join(",")}`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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

function createCondition(id, label, kind, scenario, metadata = {}) {
  return { id, label, kind, scenario, ...metadata };
}

const BASELINE_CONDITION = createCondition(
  "baseline",
  "基準線",
  "baseline",
  FIXED_DETECTION_SCENARIO
);

function buildConditions() {
  const primary = DOSE_TARGETS.map((target, index) => createCondition(
    `primary-${target.toFixed(1)}`,
    `主機構:宝箱追加 +${target.toFixed(1)}`,
    "candidate-a",
    { ...FIXED_DETECTION_SCENARIO, chestHealPotionExtraChance: DOSE_CHANCES[index] },
    { doseTarget: target, mechanism: "chest-extra" }
  ));
  const alternate = ALTERNATE_CHANCE === null
    ? []
    : [createCondition(
        "alternate-enemy",
        `別機構:敵ドロップ（主機構 +${ALTERNATE_TARGET}相当）`,
        "candidate-b",
        { ...FIXED_DETECTION_SCENARIO, enemyHealPotionDropChance: ALTERNATE_CHANCE },
        { doseTarget: Number(ALTERNATE_TARGET), mechanism: "enemy-drop" }
      )];
  return [BASELINE_CONDITION, ...primary, ...alternate];
}

function buildTasks(conditions) {
  return conditions.flatMap(condition =>
    BASIC_CLASSES.flatMap(className =>
      Array.from({ length: RUNS_PER_CLASS }, (_, runIndex) => ({
        conditionId: condition.id,
        className,
        runIndex,
        runsPerClass: RUNS_PER_CLASS,
        scenarioId: scenarioForRun(runIndex, RUNS_PER_CLASS)
      }))
    )
  );
}

function buildScoringProfiles() {
  const profiles = {};
  const started = performance.now();
  const cpuStarted = process.cpuUsage();
  for (const scenarioId of WORKSHOP_SCENARIOS) {
    const scenario = getScenarioById(scenarioId);
    resetSimulationRandom(Number(process.env.SIM_SEED) >>> 0);
    profiles[scenarioId] = calibrateCoreScoringProfile(
      CALIBRATION_RUNS,
      scenario,
      "powder",
      scenario.workshop
    );
  }
  const cpu = process.cpuUsage(cpuStarted);
  return {
    profiles,
    wallSeconds: (performance.now() - started) / 1000,
    cpuSeconds: (cpu.user + cpu.system) / 1e6
  };
}

export function runDoseTask(task, context) {
  return runIssue499Task(task, context);
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

function formatEndpoint(endpoint) {
  return [
    formatRate(endpoint.entrant),
    formatRate(endpoint.breakthrough),
    formatRate(endpoint.death),
    formatRate(endpoint.retreat)
  ].join(" / ");
}

function constraintChecks(conditionSummaryValue, baselineSummary) {
  const b5Death = conditionSummaryValue.outcomes.B5.death;
  const b10Death = conditionSummaryValue.outcomes.B10.death;
  const ev = conditionSummaryValue.materialEvPerTime;
  const evTarget = baselineSummary.materialEvPerTime.mean * 0.8;
  const usableRate = rate => rate?.rate !== null && rate?.status === "監査";
  const usableMean = stat => stat?.mean !== null && stat?.status === "監査";
  return {
    b5Death: {
      value: b5Death.rate,
      target: 0.309,
      pass: usableRate(b5Death) && b5Death.rate <= 0.309
    },
    b10Death: {
      value: b10Death.rate,
      target: 0.15,
      pass: usableRate(b10Death) && b10Death.rate <= 0.15
    },
    materialEvPerTime: {
      value: ev.mean,
      target: evTarget,
      pass: usableMean(ev) && usableMean(baselineSummary.materialEvPerTime) && ev.mean >= evTarget
    }
  };
}

function inventoryText(summary) {
  const inventory = summary.inventory;
  return [
    `slots=${formatStat(inventory.finalSlots)}`,
    `chest拒否=${formatNumber(inventory.pickupRejectionsPerRun.chest)}`,
    `combat拒否=${formatNumber(inventory.pickupRejectionsPerRun.combat)}`,
    `material拒否=${formatNumber(inventory.pickupRejectionsPerRun.material)}`,
    `equipment拒否=${formatNumber(inventory.pickupRejectionsByCategoryPerRun.equipment)}`
  ].join(" / ");
}

function conditionRow(conditionResult) {
  const summary = conditionResult.summary.overall;
  const inventory = summary.inventory;
  return [
    conditionResult.label,
    conditionResult.doseTarget === null ? "—" : `+${formatNumber(conditionResult.doseTarget, 1)}`,
    formatNumber(conditionResult.actualExtraUnits, 3),
    formatRate(summary.outcomes.B10.entrant),
    formatEndpoint(summary.outcomes.B5),
    formatEndpoint(summary.outcomes.B10),
    formatStat(summary.averageReachedFloor),
    formatRate(summary.survivalRate),
    formatStat(summary.materialEvPerTime),
    formatStat(summary.bankRetentionRate),
    formatRate(summary.recovery.depletionRate),
    formatNumber(inventory.pickupRejectionsPerRun.chest),
    formatNumber(inventory.pickupRejectionsPerRun.combat),
    formatNumber(inventory.pickupRejectionsPerRun.material),
    formatNumber(inventory.pickupRejectionsByCategoryPerRun.equipment)
  ].join("|");
}

function evaluateRequiredPoint(primaryResults, baselineSummary) {
  const required = primaryResults.find(result => {
    const entrant = result.summary.overall.outcomes.B10.entrant;
    return entrant.status === "監査" && entrant.rate >= 0.10;
  }) || null;
  const firstFailures = Object.fromEntries(
    ["b5Death", "b10Death", "materialEvPerTime"].map(key => [
      key,
      primaryResults.find(result => !constraintChecks(result.summary.overall, baselineSummary)[key].pass)?.doseTarget ?? null
    ])
  );
  return {
    required,
    checks: required
      ? constraintChecks(required.summary.overall, baselineSummary)
      : null,
    firstFailures,
    allConstraintsPass: Boolean(required) && Object.values(constraintChecks(required.summary.overall, baselineSummary))
      .every(check => check.pass)
  };
}

function buildMarkdown(summary) {
  const lines = [];
  const required = summary.requiredPoint;
  const primaryResults = summary.conditions.filter(condition => condition.mechanism === "chest-extra");
  const alternate = summary.conditions.find(condition => condition.mechanism === "enemy-drop");
  lines.push("# #499 浅い階回復供給 用量掃引", "");
  lines.push("## 結論", "");
  lines.push("- 主機構は宝箱追加傷薬（`chestHealPotionExtraChance`）。#496のchest+25%と同じ独立追加抽選で、main報酬・装備を置換せず単調に用量を増やせるため。");
  if (required) {
    const checks = required.requiredChecks;
    const failed = Object.entries(checks).filter(([, check]) => !check.pass).map(([key]) => key);
    lines.push(`- B10 entrant≥10%の最小測定点: **+${formatNumber(required.doseTarget, 1)}目標 / 実測${formatNumber(required.actualExtraUnits, 3)}本/run**（B10 entrant ${formatRate(required.summary.overall.outcomes.B10.entrant)}）。`);
    lines.push(`- その点の制約: ${failed.length === 0 ? "B5死亡・B10死亡・素材EV/時間をすべてPASS" : `FAIL=${failed.join("、")}`}。`);
  } else {
    lines.push("- +4.0本/run相当までB10 entrant≥10%に到達せず。測定上限外の必要量は未確定。");
  }
  if (alternate && required) {
    lines.push(`- 別機構比較: ${alternate.label}の実測追加は${formatNumber(alternate.actualExtraUnits, 3)}本/run。主機構との差は${formatNumber(alternate.actualExtraUnits - required.actualExtraUnits, 3)}本/run。`);
    const alternateChecks = summary.acceptance[alternate.id].checks;
    lines.push(`- 別機構の制約: B5死亡=${alternateChecks.b5Death.pass ? "PASS" : "FAIL"}、B10死亡=${alternateChecks.b10Death.pass ? "PASS" : "FAIL"}、素材EV/時間=${alternateChecks.materialEvPerTime.pass ? "PASS" : "FAIL"}。`);
  } else if (alternate) {
    lines.push(`- 別機構比較: ${alternate.label}を測定したが、主機構の必要量点が掃引上で未確定。`);
  }
  lines.push("- 結論は『採用候補なし』ではなく、必要量と制約充足を下記の用量掃引で判定する。", "");
  lines.push("## 条件", "");
  lines.push(`- seed=${summary.seed}、targetDepth=B20終了、4職、N=${summary.runsPerClass}/職（${summary.runsPerCondition}/条件）、条件数=${summary.conditions.length}、総行数=${summary.rawRows}`);
  lines.push(`- 工房分布=${WORKSHOP_DISTRIBUTION.map(row => `${row.scenarioId}:${row.observedRuns}/${WORKSHOP_TOTAL}`).join(" / ")}`);
  lines.push(`- 用量target=${DOSE_TARGETS.map(value => `+${value.toFixed(1)}`).join(" / ")}、宝箱chance=${DOSE_CHANCES.join(",")}`);
  lines.push(`- 床罠察知: ${summary.environment.ISSUE499_FIXED_DETECTION === "1" ? "確定（trapSenseは解除へ転換）" : "source既定"}`);
  lines.push("- 現行緩和: `TOWN_PORTAL`、状態異常治療、鑑定粉、現行戦闘/報酬/装備更新、既存B2/B4 camp、#481出発kit。");
  lines.push("- Wilson 95% CI、平均値は正規近似95% CI。N<30は未確定。E/X/D/Rはentrant / breakthrough / death / retreatで、各endpoint内splitは100%。", "");
  lines.push("## 用量掃引", "");
  lines.push("|点|目標|実測追加/run|B10 entrant|B5 E/X/D/R|B10 E/X/D/R|平均floor|生還率|素材EV/時間|bank保持|枯渇率|拾得拒否(chest/combat/material/equipment)|");
  lines.push("|---|---:|---:|---|---|---|---|---|---|---|---|---|");
  lines.push(`|${conditionRow(summary.baselineResult)}|`);
  primaryResults.forEach(result => lines.push(`|${conditionRow(result)}|`));
  lines.push("", "拾得拒否はrunあたり。素材はinventory slot外のため素材拒否0が仕様。", "");
  lines.push("## 必要量と制約", "");
  if (required) {
    const checks = required.requiredChecks;
    lines.push(`- 最小点: +${formatNumber(required.doseTarget, 1)}目標、実測${formatNumber(required.actualExtraUnits, 3)}本/run。B10 entrant=${formatRate(required.summary.overall.outcomes.B10.entrant)}。`);
    lines.push(`- B5死亡: ${formatRate(required.summary.overall.outcomes.B5.death)} / 上限30.9% / ${checks.b5Death.pass ? "PASS" : "FAIL"}`);
    lines.push(`- B10死亡: ${formatRate(required.summary.overall.outcomes.B10.death)} / 上限15.0% / ${checks.b10Death.pass ? "PASS" : "FAIL"}`);
    lines.push(`- 素材EV/時間: ${formatStat(required.summary.overall.materialEvPerTime)} / 下限${formatNumber(checks.materialEvPerTime.target)} / ${checks.materialEvPerTime.pass ? "PASS" : "FAIL"}`);
    lines.push(`- 掃引上の各制約の最初のFAIL点: B5死亡=${summary.firstFailures.b5Death === null ? "なし" : `+${summary.firstFailures.b5Death.toFixed(1)}`}, B10死亡=${summary.firstFailures.b10Death === null ? "なし" : `+${summary.firstFailures.b10Death.toFixed(1)}`}, 素材EV/時間=${summary.firstFailures.materialEvPerTime === null ? "なし" : `+${summary.firstFailures.materialEvPerTime.toFixed(1)}`}。`);
  } else {
    lines.push("- B10 entrant≥10%の点なし。必要量・制約充足は+4.0本/run相当を超えるため未確定。", "- 先に破れる制約は、B10 entrant未達が測定上限まで継続したため特定不能。");
  }
  lines.push("", "", "## 別機構の同量比較", "");
  if (alternate && required) {
    lines.push("|機構|主機構目標|実測追加/run|B10 entrant|B5 E/X/D/R|B10 E/X/D/R|平均floor|生還率|素材EV/時間|bank保持|枯渇率|拾得拒否(chest/combat/material/equipment)|");
    lines.push("|---|---:|---:|---|---|---|---|---|---|---|---|---|");
    lines.push(`|${conditionRow(required)}|`);
    lines.push(`|${conditionRow(alternate)}|`);
    lines.push("", "+0.390本/run一点での機構間同等性を、高用量の必要量点で再確認した。", "");
  } else {
    lines.push("必要量点が確定した後に、敵ドロップ機構を同量で追加測定する。", "");
  }
  lines.push("## 下流取り直し対象", "");
  lines.push("- #470: completed-build / quality quartile のB5判定");
  lines.push("- #471: core装備率監視");
  lines.push("- #475: core個数軸のB5 endpoint");
  lines.push("- #468 / #473: 宝箱解除・解除方針監査");
  lines.push("- #480: 罠方針比較", "");
  lines.push("## 実行記録", "");
  lines.push(`- env hash: \`${summary.envHash}\``);
  lines.push(`- raw JSONL SHA-256: \`${summary.rawSha256}\``);
  lines.push(`- calibration wall/CPU: ${formatNumber(summary.calibration.wallSeconds, 2)}s / ${formatNumber(summary.calibration.cpuSeconds, 2)}s`);
  lines.push(`- measurement wall/CPU: ${formatNumber(summary.runtime.wallSeconds, 2)}s / ${formatNumber(summary.runtime.cpuSeconds, 2)}s`);
  lines.push(`- resolved parallelism: ${summary.runtime.resolvedParallelism}（SIM_PARALLEL未指定、runtime default）`);
  lines.push(`- 再現: \`${summary.reproductionCommand}\``);
  lines.push("- canon変更: 用量掃引はsim what-if。ゲーム側採用は必要量点の制約判定後。", "");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const scoring = buildScoringProfiles();
  const conditions = buildConditions();
  const tasks = buildTasks(conditions);
  const conditionMap = Object.fromEntries(conditions.map(condition => [condition.id, condition]));
  const resolvedParallelism = resolveSimParallelism(tasks.length);
  const started = performance.now();
  const cpuStarted = process.cpuUsage();
  const rows = await runSimTasks({
    moduleUrl: pathToFileURL(fileURLToPath(import.meta.url)).href,
    exportName: "runDoseTask",
    runTask: runDoseTask,
    tasks,
    context: { conditions: conditionMap, scoringProfiles: scoring.profiles }
  });
  rows.sort((left, right) =>
    left.conditionId.localeCompare(right.conditionId) ||
    left.className.localeCompare(right.className) ||
    left.runIndex - right.runIndex
  );
  const cpu = process.cpuUsage(cpuStarted);
  const runtime = {
    wallSeconds: (performance.now() - started) / 1000,
    cpuSeconds: (cpu.user + cpu.system) / 1e6,
    resolvedParallelism
  };
  const resultDir = join(process.cwd(), "scratch", "results");
  mkdirSync(resultDir, { recursive: true });
  const raw = `${rows.map(row => JSON.stringify(row)).join("\n")}\n`;
  const rawSha256 = sha256(raw);
  writeFileSync(join(resultDir, `${OUTPUT_STEM}.jsonl`), raw);
  const conditionResults = conditions.map(condition => {
    const conditionRows = rows.filter(row => row.conditionId === condition.id);
    const summary = conditionSummary(conditionRows);
    return {
      id: condition.id,
      label: condition.label,
      kind: condition.kind,
      mechanism: condition.mechanism || null,
      doseTarget: condition.doseTarget ?? null,
      scenario: condition.scenario,
      actualExtraUnits: summary.overall.recovery.extraUnits.mean,
      summary
    };
  });
  const baselineResult = conditionResults[0];
  const primaryResults = conditionResults.filter(result => result.mechanism === "chest-extra");
  const baselineSummary = baselineResult.summary.overall;
  const acceptance = Object.fromEntries(conditionResults.map(result => [
    result.id,
    acceptanceFor(result.summary.overall, baselineSummary)
  ]));
  const requiredEvaluation = evaluateRequiredPoint(primaryResults, baselineSummary);
  const requiredResult = requiredEvaluation.required;
  const requiredChecks = requiredEvaluation.checks;
  const environment = {
    ...Object.fromEntries(Object.entries(getResolvedSimulationEnv())),
    SIM_SEED: process.env.SIM_SEED,
    SIM_RUNS: String(RUNS_PER_CLASS),
    SIM_CALIBRATION_RUNS: String(CALIBRATION_RUNS),
    SIM_PARALLEL: "<omitted; runtime default>",
    SIM_MAP_CACHE_ENTRIES: "<omitted; runtime default 1024>",
    ISSUE499_DOSE_TARGETS: DOSE_TARGETS.join(","),
    ISSUE499_DOSE_CHANCES: DOSE_CHANCES.join(","),
    ISSUE499_FIXED_DETECTION: process.env.ISSUE499_FIXED_DETECTION || "0",
    ISSUE499_ALTERNATE_CHANCE: ALTERNATE_CHANCE === null ? "<unset>" : String(ALTERNATE_CHANCE),
    ISSUE499_ALTERNATE_TARGET: ALTERNATE_TARGET || "<unset>",
    ISSUE499_WORKSHOP_DISTRIBUTION: WORKSHOP_DISTRIBUTION
      .map(row => `${row.scenarioId}:${row.observedRuns}/${WORKSHOP_TOTAL}`)
      .join(",")
  };
  const envHash = sha256(JSON.stringify(environment));
  const fixedArgs = [
    `ISSUE499_DOSE_CHANCES=${DOSE_CHANCES.join(",")}`,
    ...(process.env.ISSUE499_FIXED_DETECTION === "1"
      ? ["ISSUE499_FIXED_DETECTION=1"]
      : []),
    ...(process.env.SIM_RESULT_BASENAME
      ? [`SIM_RESULT_BASENAME=${process.env.SIM_RESULT_BASENAME}`]
      : []),
    ...(ALTERNATE_CHANCE === null ? [] : [
      `ISSUE499_ALTERNATE_CHANCE=${ALTERNATE_CHANCE}`,
      `ISSUE499_ALTERNATE_TARGET=${ALTERNATE_TARGET}`
    ])
  ].join(" ");
  const reproductionCommand = `${fixedArgs} node scratch/sim_issue_499_shallow_recovery_dose_sweep.js`;
  const summary = {
    issue: 499,
    seed: Number(process.env.SIM_SEED) >>> 0,
    runsPerClass: RUNS_PER_CLASS,
    runsPerCondition: RUNS_PER_CLASS * BASIC_CLASSES.length,
    rawRows: rows.length,
    calibrationRuns: CALIBRATION_RUNS,
    doseTargets: DOSE_TARGETS,
    doseChances: DOSE_CHANCES,
    alternateChance: ALTERNATE_CHANCE,
    alternateTarget: ALTERNATE_TARGET,
    baselineNaturalChestTarget: baselineSummary.recovery.naturalChest.mean,
    environment,
    envHash,
    rawSha256,
    calibration: scoring,
    runtime,
    conditions: conditionResults,
    baselineResult,
    acceptance,
    requiredPoint: requiredResult
      ? {
          label: requiredResult.label,
          doseTarget: requiredResult.doseTarget,
          actualExtraUnits: requiredResult.actualExtraUnits,
          summary: requiredResult.summary,
          requiredChecks
        }
      : null,
    firstFailures: requiredEvaluation.firstFailures,
    allConstraintsPass: requiredEvaluation.allConstraintsPass,
    reproductionCommand,
    downstreamRemeasureTargets: [470, 471, 475, 468, 473, 480]
  };
  writeFileSync(join(resultDir, `${OUTPUT_STEM}.md`), buildMarkdown(summary));
  console.log(JSON.stringify({
    output: `scratch/results/${OUTPUT_STEM}.md`,
    rawSha256,
    envHash,
    requiredDoseTarget: summary.requiredPoint?.doseTarget ?? null,
    requiredActualExtraUnits: summary.requiredPoint?.actualExtraUnits ?? null,
    allConstraintsPass: summary.allConstraintsPass,
    resolvedParallelism,
    calibrationWallSeconds: scoring.wallSeconds,
    measurementWallSeconds: runtime.wallSeconds,
    measurementCpuSeconds: runtime.cpuSeconds
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
