// sim-scope: run
// Issue #271 Phase 2b: spellGuard replication with N>=200 target.

/* global console, process */

import { createHash } from "node:crypto";
import {
  closeSync,
  createReadStream,
  mkdirSync,
  openSync,
  readFileSync,
  writeSync,
  writeFileSync
} from "node:fs";
import { availableParallelism } from "node:os";
import { isMainThread } from "node:worker_threads";
import { performance } from "node:perf_hooks";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveSimParallelism, runSimTasks } from "./sim_parallel.js";

const PRIMARY_SCENARIO = "workshop-core-pools";
const AFFIX_TYPE = "spellGuard";
const DEFAULT_STRENGTHS = Object.freeze([1, 5, 10]);
const STRENGTHS = Object.freeze(String(
  process.env.SG_STRENGTHS || DEFAULT_STRENGTHS.join(",")
).split(",").map(value => Number(value.trim())).filter(Number.isFinite));
const CURE_POLICIES = Object.freeze(["smart", "never"]);
const BASIC_CLASSES = Object.freeze(["Fighter", "Thief", "Priest", "Mage"]);
const CALIBRATION_RUNS = 100;
const TARGET_DEPTH = 21;
const COUNTERMEASURE_START_FLOOR = 3;
const MIN_GROUP_N = 200;
const PILOT_RUNS = 14000;
const PILOT_MATCHED_N = Object.freeze([21, 25, 45, 50, 36, 47]);
const MIN_PILOT_GROUP_RATE = Math.min(...PILOT_MATCHED_N) / PILOT_RUNS;
const REQUIRED_RUNS = Math.ceil(MIN_GROUP_N / MIN_PILOT_GROUP_RATE);
const PLANNED_RUNS = Math.ceil(REQUIRED_RUNS / 10000) * 10000;
const RUNS = Math.max(1, Number(process.env.SIM_RUNS || PLANNED_RUNS));
const SEED = Number(process.env.SIM_SEED || 271) >>> 0;
const IDENTIFICATION_POLICY = "powder";
const FLEE_HP_THRESHOLD = Number(process.env.FLEE_HP_THRESHOLD || 0.35);
const RESULT_BASENAME = process.env.SIM_RESULT_BASENAME || "issue-271-spellguard-remeasure";

if (!STRENGTHS.length || !STRENGTHS.includes(5)) {
  throw new Error("SG_STRENGTHS must be non-empty and include 5");
}

if (process.env.SIM_PARALLEL) {
  throw new Error("SIM_PARALLEL must be omitted for Issue #271 measurement");
}

process.env.SIM_CALIBRATION_RUNS = String(CALIBRATION_RUNS);
process.env.SIM_SEED = String(SEED);
process.env.SIM_RUNS = String(RUNS);
process.env.CM_SCENARIOS = PRIMARY_SCENARIO;
process.env.CM_ATTACK_STRENGTHS = "1";
process.env.CM_DEFENSE_STRENGTHS = "1";
process.env.IDENTIFICATION_POLICY = IDENTIFICATION_POLICY;
process.env.FLEE_POLICY = "threshold";
process.env.FLEE_HP_THRESHOLD = String(FLEE_HP_THRESHOLD);
process.env.SIM_DAMAGE_PROBE = "0";

const {
  CLASS_NAMES: HARNESS_CLASSES,
  buildScenario,
  conditionKey,
  runCountermeasureStrengthTask,
  summarizeCase
} = await import("./sim_issue_271_countermeasure_strength.js");
const {
  SIM_CLASSES,
  calibrateCoreScoringProfile,
  resetSimulationRandom
} = await import("./sim_depth_material_ev.js");

const CLASS_NAMES = SIM_CLASSES.filter(className => BASIC_CLASSES.includes(className));
if (CLASS_NAMES.length !== BASIC_CLASSES.length ||
  HARNESS_CLASSES.length !== BASIC_CLASSES.length) {
  throw new Error(`basic classes missing: ${BASIC_CLASSES.join(",")}`);
}

const DEFENSE_CONFIG = Object.freeze({
  label: "呪文軽減",
  threatOverride: {
    startFloor: COUNTERMEASURE_START_FLOOR,
    normalOnly: true,
    forceSpell: true,
    spellName: "HALITO",
    spellChance: 1
  }
});

const CONDITIONS = Object.freeze(STRENGTHS.map(multiplier => ({
  mode: "defense",
  id: `${AFFIX_TYPE}-${multiplier}x`,
  label: `${DEFENSE_CONFIG.label} ${multiplier}x`,
  affixType: AFFIX_TYPE,
  multiplier,
  ...DEFENSE_CONFIG
})));

function hashSeed(text) {
  let seed = 2166136261;
  for (let index = 0; index < text.length; index++) {
    seed ^= text.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

function createRawWriter(path) {
  const fd = openSync(path, "w");
  const hash = createHash("sha256");
  let rows = 0;
  return {
    write(values) {
      const text = values.map(value => `${JSON.stringify(value)}\n`).join("");
      writeSync(fd, text);
      hash.update(text);
      rows += values.length;
    },
    close() {
      closeSync(fd);
      return { rows, sha256: hash.digest("hex") };
    }
  };
}

function getCase(cases, condition, curePolicy) {
  return cases[conditionKey(condition, curePolicy, PRIMARY_SCENARIO)];
}

function summarizeThreat(rows) {
  const sum = key => rows.reduce((total, row) => total + Number(row.combat[key] || 0), 0);
  return {
    runs: rows.length,
    spellRoundCount: sum("spellRoundCount"),
    spellGuardReductions: sum("spellGuardReductions"),
    countermeasureActiveRounds: rows.reduce(
      (total, row) => total + Number(row.countermeasure?.activeRounds || 0),
      0
    )
  };
}

function formatPercent(value, digits = 1) {
  return value === null || value === undefined ? "n/a" : `${(value * 100).toFixed(digits)}%`;
}

function formatInterval(interval, digits = 1) {
  if (!interval || interval.estimate === null || interval.estimate === undefined) return "n/a";
  return `${(interval.estimate * 100).toFixed(digits)}pp ` +
    `[${(interval.low * 100).toFixed(digits)}, ${(interval.high * 100).toFixed(digits)}]`;
}

function isNonZero(interval) {
  return Boolean(interval && (interval.low > 0 || interval.high < 0));
}

function isReproduced(cases) {
  const effects = CURE_POLICIES.map(curePolicy =>
    getCase(cases, CONDITIONS.find(condition => condition.multiplier === 5), curePolicy)
      .b5.group.endpointEffects.death
  );
  return effects.every(isNonZero) &&
    new Set(effects.map(effect => Math.sign(effect.estimate))).size === 1 &&
    effects.every(effect => effect.matchedN >= MIN_GROUP_N && effect.unmatchedN >= MIN_GROUP_N);
}

function buildReport(summary, summarySha256) {
  const lines = [
    "# Issue #271 spellGuard追加再測定",
    "",
    `既存の全体掃引は再測定せず、spellGuard の ${STRENGTHS.map(value => `${value}x`).join(" / ")} × smart / never、主状態 ${PRIMARY_SCENARIO} の${STRENGTHS.length * CURE_POLICIES.length}セルだけを再測定した。`,
    "",
    "## 結論",
    "",
    `追加測定の有群・なし群Nは全${STRENGTHS.length * CURE_POLICIES.length}セルで目標N≥${MIN_GROUP_N}を満たしたか: **${summary.allGroupsMeetTarget ? "yes" : "no"}**。`,
    `5xのA（両cureのB5 entrant死亡差の95% CIが0を跨がず、同符号）再現: **${summary.reproduced5x ? "yes" : "no"}**。`,
    summary.reproduced5x
      ? "したがって spellGuard については、A=5xが追加測定で再現され、既存100xでB（対策なし生存率20%未満）が未観測だったため、A<Bの窓を `[5x, >100x]` と観測する。これは単一affixについて #271 の「質依存化と自由度の両立」が成立しうることを示す。"
      : "5xの単発Aは追加測定で再現されなかった。単発ヒットは結論から外し、spellGuardのAは未観測へ戻す。既存100xでBも未観測のため、窓は未確定である。",
    "",
    "## 機構とStep 2との整合",
    "",
    "`src/combat_logic/damage.js:136-168` の `reduceIncomingDamage` は `options.spell` のときだけ `getCharAffixSum(char, \"spellGuard\")` を読み、`spellGuard + mabarrier` を最大60%として呪文ダメージを軽減する。通常物理攻撃、初手被弾、罠、毒ダメージはこの分岐を通らない。",
    "敵側はscratch overrideでB3以降の通常遭遇を `HALITO`・発動率100%へした。full診断で呪文roundと「魔除け」軽減ログを数え、5x効果が実際にこの経路へ到達したかを確認した。",
    `全run平均のHP消耗を支配した初手・毒・罠は spellGuard の対象外であり、Step 2の「深層endpointは戦闘攻撃力ではなく、罠 + 初手 + 毒に支配され得る」という結論と整合する。spellGuardの差は、強制した通常戦の呪文被害に限って現れる。`,
    "",
    "## 追加掃引",
    "",
    "| 強度 | smart 有/なしN | smart 死亡差 | never 有/なしN | never 死亡差 | smart 呪文round全/到達・軽減全/到達 | never 呪文round全/到達・軽減全/到達 | なし群生存 smart / never |",
    "|---:|---:|---:|---:|---:|---:|---:|---:|"
  ];
  STRENGTHS.forEach(multiplier => {
    const condition = CONDITIONS.find(item => item.multiplier === multiplier);
    const smart = getCase(summary.cases, condition, "smart");
    const never = getCase(summary.cases, condition, "never");
    const smartReached = smart.exposure.reachedThreat;
    const neverReached = never.exposure.reachedThreat;
    lines.push(
      `| ${multiplier}x | ${smart.b5.group.matchedN}/${smart.b5.group.unmatchedN} | ${formatInterval(smart.b5.group.endpointEffects.death)} | ` +
      `${never.b5.group.matchedN}/${never.b5.group.unmatchedN} | ${formatInterval(never.b5.group.endpointEffects.death)} | ` +
      `${smart.exposure.threat.spellRoundCount}/${smartReached.spellRoundCount}・${smart.exposure.threat.spellGuardReductions}/${smartReached.spellGuardReductions} | ` +
      `${never.exposure.threat.spellRoundCount}/${neverReached.spellRoundCount}・${never.exposure.threat.spellGuardReductions}/${neverReached.spellGuardReductions} | ` +
      `${formatPercent(smart.b5.group.unmatchedSurvival.estimate)} / ${formatPercent(never.b5.group.unmatchedSurvival.estimate)} |`
    );
  });
  lines.push(
    "",
    "死亡差は有群−なし群。95% CIが0を跨ぐcell、またはN<200はA判定に使わない。順位の非単調やCIが重なる強度差はknee・結論反転と呼ばない。",
    "",
    "## N設計・曝露・多重比較",
    "",
    `既存14,000 runの spellGuard matched N は 1x smart/never=21/25、5x=45/50、10x=36/47。最小観測率は ${PILOT_MATCHED_N[0]}/${PILOT_RUNS}=${MIN_PILOT_GROUP_RATE.toFixed(4)}。したがって \`ceil(${MIN_GROUP_N} / ${MIN_PILOT_GROUP_RATE.toFixed(4)})=${REQUIRED_RUNS.toLocaleString()}\` run/cellが必要で、余裕を加えて ${RUNS.toLocaleString()} run/cell（${STRENGTHS.length * CURE_POLICIES.length}セル、${summary.measurement.rawRows.toLocaleString()} rows）とした。`,
    `B3到達率（全run分母）は ${STRENGTHS.map(multiplier => {
      const condition = CONDITIONS.find(item => item.multiplier === multiplier);
      return `${multiplier}x=${CURE_POLICIES.map(curePolicy => formatPercent(
        getCase(summary.cases, condition, curePolicy).exposure.reachedRate.estimate
      )).join("/")}`;
    }).join("、")}（smart/never）。呪文round・軽減回数は全run分母とB3到達run分母を分離し、表では全/到達の順に示した。B5 entrantの有/なしNも各cellに併記した。`,
    `元の全体掃引は30 conditions × 2 cure × 7 scenario × 3 endpoint = 1,260検定、α=0.05の期待偽陽性63.0本。今回の追加${STRENGTHS.length * CURE_POLICIES.length}セルはその単発ヒットの事前指定replicationであり、追加のendpoint記録は${STRENGTHS.length * CURE_POLICIES.length * 3}本である。追加結果が再現しない場合、元の5x単発は採用しない。`,
    "",
    "## 実行監査",
    "",
    `- 主状態: ${PRIMARY_SCENARIO}; smart / never; 基本4職; target depth ${TARGET_DEPTH}`,
    `- SIM_CALIBRATION_RUNS=${CALIBRATION_RUNS}; SIM_PARALLEL未指定（解決値=${summary.measurement.resolvedParallelism}); IDENTIFICATION_POLICY=${IDENTIFICATION_POLICY}; FLEE_POLICY=threshold`,
    `- full診断で forceSpell=HALITO / spellChance=1、spellGuard実測行のみ。src変更なし。`,
    `- wall-clock ${summary.measurement.wallClockSeconds.toFixed(3)}s; total CPU ${summary.measurement.totalCpuSeconds.toFixed(3)}s`,
    `- raw JSONL SHA-256: ${summary.measurement.rawSha256}`,
    `- summary JSON SHA-256: ${summarySha256}`
  );
  return `${lines.join("\n")}\n`;
}

function makeScenario(condition, curePolicy) {
  const scenario = buildScenario(PRIMARY_SCENARIO, condition, curePolicy);
  scenario.simDiagnosticLevel = "full";
  return scenario;
}

export function runSpellGuardTask(task, context) {
  return runCountermeasureStrengthTask(task, context);
}

async function runMeasurement() {
  const resultDir = `${process.cwd()}/scratch/results`;
  mkdirSync(resultDir, { recursive: true });
  const rawPath = `${resultDir}/${RESULT_BASENAME}.raw.jsonl`;
  const summaryPath = `${resultDir}/${RESULT_BASENAME}.json`;
  const reportPath = `${resultDir}/${RESULT_BASENAME}.md`;
  const rawWriter = createRawWriter(rawPath);
  const conditionMap = Object.fromEntries(CONDITIONS.map(condition => [condition.id, condition]));
  const scenarios = {};
  const scoringProfiles = {};
  const calibrationStarted = performance.now();
  const calibrationCpuStarted = process.cpuUsage();
  for (const condition of CONDITIONS) {
    for (const curePolicy of CURE_POLICIES) {
      const scenario = makeScenario(condition, curePolicy);
      const key = conditionKey(condition, curePolicy, PRIMARY_SCENARIO);
      scenarios[key] = scenario;
      resetSimulationRandom(SEED);
      scoringProfiles[key] = calibrateCoreScoringProfile(
        CALIBRATION_RUNS,
        scenario,
        IDENTIFICATION_POLICY,
        scenario.workshop
      );
    }
  }
  const calibrationCpu = process.cpuUsage(calibrationCpuStarted);
  const calibrationWallSeconds = (performance.now() - calibrationStarted) / 1000;

  const cases = {};
  const simulationStarted = performance.now();
  const simulationCpuStarted = process.cpuUsage();
  const cells = CONDITIONS.flatMap(condition =>
    CURE_POLICIES.map(curePolicy => ({ condition, curePolicy }))
  );
  for (const [index, { condition, curePolicy }] of cells.entries()) {
    const tasks = Array.from({ length: RUNS }, (_, runIndex) => ({
      conditionId: condition.id,
      curePolicy,
      scenarioId: PRIMARY_SCENARIO,
      runIndex,
      className: CLASS_NAMES[runIndex % CLASS_NAMES.length]
    }));
    const rows = await runSimTasks({
      moduleUrl: pathToFileURL(fileURLToPath(import.meta.url)).href,
      exportName: "runSpellGuardTask",
      runTask: runSpellGuardTask,
      tasks,
      context: {
        seed: SEED,
        conditions: conditionMap,
        scenarios,
        scoringProfiles,
        diagnosticMode: "full"
      }
    });
    if (rows.length !== tasks.length) {
      throw new Error(`row count mismatch: ${condition.id}/${curePolicy} ${rows.length}/${tasks.length}`);
    }
    rawWriter.write(rows);
    const caseSummary = summarizeCase(
      rows,
      condition,
      curePolicy,
      PRIMARY_SCENARIO
    );
    caseSummary.exposure.reachedThreat = summarizeThreat(
      rows.filter(row => row.reachedFloor >= COUNTERMEASURE_START_FLOOR)
    );
    cases[conditionKey(condition, curePolicy, PRIMARY_SCENARIO)] = caseSummary;
    console.error(`completed cell ${index + 1}/${cells.length}: ${condition.id}/${curePolicy}`);
  }
  const simulationCpu = process.cpuUsage(simulationCpuStarted);
  const wallClockSeconds = (performance.now() - simulationStarted) / 1000;
  const rawAudit = rawWriter.close();
  const allGroupsMeetTarget = Object.values(cases).every(caseSummary =>
    caseSummary.b5.group.matchedN >= MIN_GROUP_N &&
    caseSummary.b5.group.unmatchedN >= MIN_GROUP_N
  );
  const summary = {
    issue: 271,
    phase: "2b-spellGuard-replication",
    measurement: {
      seed: SEED,
      SIM_RUNS: RUNS,
      SIM_CALIBRATION_RUNS: CALIBRATION_RUNS,
      SIM_PARALLEL: "未指定",
      resolvedParallelism: resolveSimParallelism(RUNS),
      availableParallelism: availableParallelism(),
      identificationPolicy: IDENTIFICATION_POLICY,
      fleePolicy: "threshold",
      scenario: PRIMARY_SCENARIO,
      classes: CLASS_NAMES,
      targetDepth: TARGET_DEPTH,
      cells: cells.length,
      diagnosticMode: "full",
      calibrationWallSeconds,
      wallClockSeconds,
      calibrationCpuSeconds: (calibrationCpu.user + calibrationCpu.system) / 1e6,
      simulationCpuSeconds: (simulationCpu.user + simulationCpu.system) / 1e6,
      totalCpuSeconds: (
        calibrationCpu.user + calibrationCpu.system + simulationCpu.user + simulationCpu.system
      ) / 1e6,
      rawRows: rawAudit.rows,
      rawSha256: rawAudit.sha256
    },
    nDesign: {
      pilotRuns: PILOT_RUNS,
      pilotMatchedN: PILOT_MATCHED_N,
      minPilotGroupRate: MIN_PILOT_GROUP_RATE,
      requiredRuns: REQUIRED_RUNS,
      plannedRuns: RUNS,
      targetGroupN: MIN_GROUP_N
    },
    conditions: CONDITIONS,
    cases,
    allGroupsMeetTarget,
    reproduced5x: isReproduced(cases)
  };
  const summaryText = `${JSON.stringify(summary, null, 2)}\n`;
  writeFileSync(summaryPath, summaryText);
  const summarySha256 = createHash("sha256").update(summaryText).digest("hex");
  writeFileSync(reportPath, buildReport(summary, summarySha256));
  console.log(JSON.stringify({
    reportPath: reportPath.replace(`${process.cwd()}/`, ""),
    summaryPath: summaryPath.replace(`${process.cwd()}/`, ""),
    rawPath: rawPath.replace(`${process.cwd()}/`, ""),
    rawSha256: rawAudit.sha256,
    summarySha256,
    allGroupsMeetTarget,
    reproduced5x: summary.reproduced5x,
    measurement: summary.measurement
  }, null, 2));
}

async function regenerateReport() {
  const resultDir = `${process.cwd()}/scratch/results`;
  const summaryPath = `${resultDir}/${RESULT_BASENAME}.json`;
  const rawPath = `${resultDir}/${RESULT_BASENAME}.raw.jsonl`;
  const reportPath = `${resultDir}/${RESULT_BASENAME}.md`;
  const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
  summary.nDesign.plannedRuns = summary.measurement.SIM_RUNS;
  const reached = {};
  const rl = createInterface({ input: createReadStream(rawPath) });
  for await (const line of rl) {
    const row = JSON.parse(line);
    if (row.reachedFloor < COUNTERMEASURE_START_FLOOR) continue;
    const key = `${row.conditionId}:${row.curePolicy}:${row.scenarioId}`;
    const current = reached[key] || {
      runs: 0,
      spellRoundCount: 0,
      spellGuardReductions: 0,
      countermeasureActiveRounds: 0
    };
    current.runs++;
    current.spellRoundCount += Number(row.combat.spellRoundCount || 0);
    current.spellGuardReductions += Number(row.combat.spellGuardReductions || 0);
    current.countermeasureActiveRounds += Number(row.countermeasure?.activeRounds || 0);
    reached[key] = current;
  }
  Object.entries(summary.cases).forEach(([key, caseSummary]) => {
    caseSummary.exposure.reachedThreat = reached[key] || {
      runs: 0,
      spellRoundCount: 0,
      spellGuardReductions: 0,
      countermeasureActiveRounds: 0
    };
  });
  const summaryText = `${JSON.stringify(summary, null, 2)}\n`;
  writeFileSync(summaryPath, summaryText);
  const summarySha256 = createHash("sha256").update(summaryText).digest("hex");
  writeFileSync(reportPath, buildReport(summary, summarySha256));
  console.log(JSON.stringify({ reportPath, summarySha256 }, null, 2));
}

if (isMainThread && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.SIM_REPORT_ONLY === "1") await regenerateReport();
  else await runMeasurement();
}
