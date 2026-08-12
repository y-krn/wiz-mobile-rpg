// sim-scope: run — Issue #538 upper-spell usage and Mage passive sweep
/* global console, process */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

import { CLASS_PASSIVES } from "../src/data/classes.js";
import { resolveSimParallelism, runSimTasks } from "./sim_parallel.js";

const SMOKE = process.env.ISSUE538_SMOKE === "1";
const RUNS = SMOKE ? 2 : Math.max(1, Number(process.env.SIM_RUNS || 500));
const CALIBRATION_RUNS = SMOKE
  ? 1
  : Math.max(1, Number(process.env.SIM_CALIBRATION_RUNS || 100));
const SEED = Number(process.env.SIM_SEED || 461) >>> 0;
const TARGET_DEPTH = 21;
const CLASSES = Object.freeze(["Fighter", "Thief", "Priest", "Mage"]);
const CLASS_LABELS = Object.freeze({ Fighter: "戦士", Thief: "盗賊", Priest: "僧侶", Mage: "魔術師" });
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
const WORKSHOP_TOTAL = WORKSHOP_DISTRIBUTION.reduce((sum, [, count]) => sum + count, 0);
const ENDPOINTS = Object.freeze(["b5", "b10"]);
const SPELL_IDS = Object.freeze([
  "HALITO", "LAHALITO", "MAHALITO", "MADALTO", "TILTOWAIT",
  "KATINO", "BADIOS", "DIOS", "MADIOS"
]);
const BASE_MAGE_PASSIVES = Object.freeze({ ...CLASS_PASSIVES.Mage.bonuses });

if (process.env.SIM_PARALLEL !== undefined) {
  throw new Error("SIM_PARALLEL must be omitted for Issue #538 measurement");
}

const ENV_DEFAULTS = Object.freeze({
  SIM_SEED: String(SEED),
  SIM_RUNS: String(RUNS),
  SIM_CALIBRATION_RUNS: String(CALIBRATION_RUNS),
  DEPARTURE_CRAFT_IDS: "TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION",
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
  SIM_SCENARIOS: SCENARIO_IDS.join(",")
});

for (const [key, value] of Object.entries(ENV_DEFAULTS)) {
  if (process.env[key] === undefined) process.env[key] = value;
}

const simulationModule = await import("./sim_depth_material_ev.js");
const {
  calibrateCoreScoringProfile,
  getScenarioById,
  MEASUREMENT_PROVENANCE,
  resetSimulationRandom,
  simulateRun,
  SIM_CLASSES
} = simulationModule;

if (!SMOKE && JSON.stringify(SIM_CLASSES) !== JSON.stringify(CLASSES)) {
  throw new Error(`unexpected SIM_CLASSES: ${SIM_CLASSES.join(",")}`);
}

const CASES = Object.freeze([
  { id: "current", label: `現行 ${BASE_MAGE_PASSIVES.trapGuard}/${BASE_MAGE_PASSIVES.killHeal}/${BASE_MAGE_PASSIVES.mpWard}`, mage: {} },
  { id: "trapguard-60", label: "trapGuard60 / killHeal10 / mpWard10", mage: { trapGuard: 60 } },
  { id: "trapguard-55", label: "trapGuard55 / killHeal10 / mpWard10", mage: { trapGuard: 55 } },
  { id: "trapguard-50", label: "trapGuard50 / killHeal10 / mpWard10", mage: { trapGuard: 50 } },
  { id: "killheal-8", label: "trapGuard70 / killHeal8 / mpWard10", mage: { killHeal: 8 } },
  { id: "killheal-6", label: "trapGuard70 / killHeal6 / mpWard10", mage: { killHeal: 6 } },
  { id: "killheal-4", label: "trapGuard70 / killHeal4 / mpWard10", mage: { killHeal: 4 } },
  { id: "mpward-8", label: "trapGuard70 / killHeal10 / mpWard8", mage: { mpWard: 8 } },
  { id: "mpward-6", label: "trapGuard70 / killHeal10 / mpWard6", mage: { mpWard: 6 } },
  { id: "mpward-4", label: "trapGuard70 / killHeal10 / mpWard4", mage: { mpWard: 4 } },
  { id: "combined-60-8-8", label: "trapGuard60 / killHeal8 / mpWard8", mage: { trapGuard: 60, killHeal: 8, mpWard: 8 } },
  { id: "combined-55-8-8", label: "trapGuard55 / killHeal8 / mpWard8", mage: { trapGuard: 55, killHeal: 8, mpWard: 8 } },
  { id: "combined-55-6-8", label: "trapGuard55 / killHeal6 / mpWard8", mage: { trapGuard: 55, killHeal: 6, mpWard: 8 } },
  { id: "combined-50-6-6", label: "trapGuard50 / killHeal6 / mpWard6", mage: { trapGuard: 50, killHeal: 6, mpWard: 6 } },
  { id: "combined-40-4-4", label: "trapGuard40 / killHeal4 / mpWard4", mage: { trapGuard: 40, killHeal: 4, mpWard: 4 } }
]);
const CASE_FILTER = process.env.ISSUE538_CASE_FILTER
  ? new Set(process.env.ISSUE538_CASE_FILTER.split(",").filter(Boolean))
  : null;
const ACTIVE_CASES = CASE_FILTER
  ? CASES.filter(item => CASE_FILTER.has(item.id))
  : CASES;
if (CASE_FILTER && ACTIVE_CASES.length !== CASE_FILTER.size) {
  const known = new Set(CASES.map(item => item.id));
  throw new Error(`unknown ISSUE538_CASE_FILTER: ${[...CASE_FILTER].filter(id => !known.has(id)).join(",")}`);
}
if (!ACTIVE_CASES.some(item => item.id === "current")) {
  throw new Error("Issue #538 measurement requires the current case");
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

function scenarioForRun(runIndex) {
  const position = ((runIndex * 37) % RUNS + 0.5) / RUNS * WORKSHOP_TOTAL;
  let cumulative = 0;
  for (const [scenarioId, count] of WORKSHOP_DISTRIBUTION) {
    cumulative += count;
    if (position < cumulative) return scenarioId;
  }
  return WORKSHOP_DISTRIBUTION.at(-1)[0];
}

function getCase(caseId) {
  const item = CASES.find(candidate => candidate.id === caseId);
  if (!item) throw new Error(`unknown case: ${caseId}`);
  return item;
}

function applyCasePatch(caseInfo) {
  Object.assign(CLASS_PASSIVES.Mage.bonuses, BASE_MAGE_PASSIVES, caseInfo.mage);
}

export function generateSharedRunFloor(args) {
  return simulationModule.generateSharedRunFloor(args);
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
    caseId: task.caseId,
    className: task.className,
    runIndex: task.runIndex,
    scenarioId: task.scenarioId,
    survived: result.survived,
    died: result.died,
    reachedFloor: result.reachedFloor,
    deathFloor: result.deathFloor,
    endpoints: Object.fromEntries(ENDPOINTS.map(endpointId => [
      endpointId,
      endpoint(result, Number(endpointId.slice(1)))
    ])),
    averageFloor: result.reachedFloor,
    materialEvPerTime: result.timeCost > 0 ? result.bankedMaterials / result.timeCost : 0,
    combatRounds: result.combatRounds || 0,
    incomingHits: result.incomingHits || 0,
    incomingHitTurns: result.incomingHitTurns || 0,
    finalMp: result.finalMp || 0,
    spellUsage: result.spellUsage,
    mpDepleted: Boolean(result.mpDepleted),
    mpZeroCombatRounds: result.mpZeroCombatRounds || 0,
    reserveMpViolations: result.reserveMpViolations || 0
  };
}

export function runIssue538Task(task, context) {
  const caseInfo = getCase(task.caseId);
  applyCasePatch(caseInfo);
  resetSimulationRandom(hashSeed(
    `${SEED}:issue538:${task.scenarioId}:${task.className}:${task.runIndex}`
  ));
  const baseScenario = getScenarioById(task.scenarioId);
  const result = simulateRun({
    className: task.className,
    startFloor: 1,
    targetDepth: TARGET_DEPTH,
    runIndex: task.runIndex,
    seriesId: `issue538:${task.scenarioId}`,
    scoringProfile: context.scoringProfiles[task.scenarioId],
    scenario: baseScenario,
    workshop: baseScenario.workshop,
    collectDiagnostics: false
  });
  return projectResult(result, task);
}

function wilson(successes, trials) {
  if (trials <= 0) return { estimate: null, low: null, high: null, trials, status: "未観測" };
  const z = 1.959963984540054;
  const p = successes / trials;
  const denominator = 1 + z ** 2 / trials;
  const center = (p + z ** 2 / (2 * trials)) / denominator;
  const halfWidth = z * Math.sqrt(p * (1 - p) / trials + z ** 2 / (4 * trials ** 2)) / denominator;
  return {
    successes,
    trials,
    estimate: p,
    low: Math.max(0, center - halfWidth),
    high: Math.min(1, center + halfWidth),
    status: trials < 30 ? "未確定（N<30）" : "確定"
  };
}

function meanStats(values) {
  if (!values.length) return { mean: null, low: null, high: null, trials: 0, status: "未観測" };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (values.length < 2) return { mean, low: null, high: null, trials: values.length, status: "未確定（N<30）" };
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  const margin = 1.959963984540054 * Math.sqrt(variance / values.length);
  return {
    mean,
    low: mean - margin,
    high: mean + margin,
    trials: values.length,
    status: values.length < 30 ? "未確定（N<30）" : "確定"
  };
}

function endpointStats(rows, endpointId) {
  const entrants = rows.filter(row => row.endpoints[endpointId].entrant);
  return {
    entrant: wilson(entrants.length, rows.length),
    breakthrough: wilson(entrants.filter(row => row.endpoints[endpointId].breakthrough).length, entrants.length),
    death: wilson(entrants.filter(row => row.endpoints[endpointId].death).length, entrants.length),
    retreat: wilson(entrants.filter(row => row.endpoints[endpointId].retreat).length, entrants.length)
  };
}

function summarizeSpellUsage(rows) {
  return Object.fromEntries(SPELL_IDS.map(spellName => {
    const totals = rows.reduce((sum, row) => {
      const usage = row.spellUsage?.[spellName] || {};
      sum.knownRounds += usage.knownRounds || 0;
      sum.castableRounds += usage.castableRounds || 0;
      sum.selected += usage.selected || 0;
      sum.applied += usage.applied || 0;
      sum.failed += usage.failed || 0;
      sum.knownRuns += Number((usage.knownRounds || 0) > 0);
      sum.appliedRuns += Number((usage.applied || 0) > 0);
      return sum;
    }, {
      knownRounds: 0,
      castableRounds: 0,
      selected: 0,
      applied: 0,
      failed: 0,
      knownRuns: 0,
      appliedRuns: 0
    });
    return [spellName, {
      ...totals,
      coverageKnown: wilson(totals.applied, totals.knownRounds),
      coverageCastable: wilson(totals.applied, totals.castableRounds),
      applicationRate: wilson(totals.applied, totals.selected)
    }];
  }));
}

function summarizeClass(rows, caseId, className) {
  const selected = rows.filter(row => row.caseId === caseId && row.className === className);
  return {
    caseId,
    className,
    runs: selected.length,
    b5: endpointStats(selected, "b5"),
    b10: endpointStats(selected, "b10"),
    averageFloor: meanStats(selected.map(row => row.averageFloor)),
    survivalRate: wilson(selected.filter(row => row.survived).length, selected.length),
    materialEvPerTime: meanStats(selected.map(row => row.materialEvPerTime)),
    combatRounds: meanStats(selected.map(row => row.combatRounds)),
    incomingHits: meanStats(selected.map(row => row.incomingHits)),
    incomingHitTurns: meanStats(selected.map(row => row.incomingHitTurns)),
    finalMp: meanStats(selected.map(row => row.finalMp)),
    mpDepletionRate: wilson(selected.filter(row => row.mpDepleted).length, selected.length),
    mpZeroCombatRounds: meanStats(selected.map(row => row.mpZeroCombatRounds)),
    reserveMpViolations: wilson(
      selected.filter(row => row.reserveMpViolations > 0).length,
      selected.length
    ),
    spellUsage: summarizeSpellUsage(selected)
  };
}

function fmtRate(stat, digits = 1) {
  if (!stat || stat.estimate === null) return "未観測";
  const suffix = stat.status === "確定" ? "" : ` ${stat.status}`;
  return `${(stat.estimate * 100).toFixed(digits)}% [${(stat.low * 100).toFixed(digits)},${(stat.high * 100).toFixed(digits)}; N=${stat.trials}]${suffix}`;
}

function fmtMean(stat, digits = 2) {
  if (!stat || stat.mean === null) return "未観測";
  if (stat.low === null) return `${stat.mean.toFixed(digits)} [${stat.status}; N=${stat.trials}]`;
  const suffix = stat.status === "確定" ? "" : ` ${stat.status}`;
  return `${stat.mean.toFixed(digits)} [${stat.low.toFixed(digits)},${stat.high.toFixed(digits)}; N=${stat.trials}]${suffix}`;
}

function renderEndpoint(stats) {
  return `E ${fmtRate(stats.entrant)} / X ${fmtRate(stats.breakthrough)} / D ${fmtRate(stats.death)} / R ${fmtRate(stats.retreat)}`;
}

function renderSpellUsage(summary, spellName) {
  const usage = summary.spellUsage[spellName];
  return `${spellName}: 実在${usage.knownRounds} / 使用${usage.selected} / 適用${usage.applied} / 失敗${usage.failed} / カバー${fmtRate(usage.coverageKnown)} / castable適用${fmtRate(usage.coverageCastable)}`;
}

function renderMarkdown({ summaries, measurement, rawSha256, summarySha256, provenance }) {
  const getSummary = (caseId, className) => summaries[`${caseId}:${className}`];
  const current = Object.fromEntries(CLASSES.map(className => [className, getSummary("current", className)]));
  const mageCurrent = current.Mage;
  const priestCurrent = current.Priest;
  const lines = [
    "# Issue #538 上位呪文使用・魔術師補正掃引 測定結果",
    "",
    "## 結論",
    "",
    "- 上位呪文選択を実装側・測定側の共有 `chooseAutoCombatAction` へ接続。Mageは敵数・残HP・残MP、Priestは回復要求時のMADIOS→DIOS優先で選択。",
    `- 現行値（trapGuard${BASE_MAGE_PASSIVES.trapGuard} / killHeal${BASE_MAGE_PASSIVES.killHeal} / mpWard${BASE_MAGE_PASSIVES.mpWard}）: Mage B5死亡 ${fmtRate(mageCurrent.b5.death)}、B10到達 ${fmtRate(mageCurrent.b10.entrant)}、戦闘 ${fmtMean(mageCurrent.combatRounds)}、被弾turn ${fmtMean(mageCurrent.incomingHitTurns)}、素材EV/時間 ${fmtMean(mageCurrent.materialEvPerTime, 4)}。`,
    "- #537 focused N=500（上位呪文修正前）のMageは戦闘54.27turn/run・被弾46.27turn/run・素材EV/時間0.1623。Nが違うため効果量は参考比較とし、最終採否は同一runnerの掃引と#461 N=3000で判定。",
    `- Mage MP枯渇率 ${fmtRate(mageCurrent.mpDepletionRate)}、Priest reserveMp違反run率 ${fmtRate(priestCurrent.reserveMpViolations)}。`,
    "",
    "## 現行値 職業別",
    "",
    "| 職 | B5 E/X/D/R | B10 E/X/D/R | 平均floor | 戦闘turn/run | 被弾turn/run | 素材EV/時間 | MP枯渇率 |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |"
  ];
  for (const className of CLASSES) {
    const value = current[className];
    lines.push(`| ${CLASS_LABELS[className]} | ${renderEndpoint(value.b5)} | ${renderEndpoint(value.b10)} | ${fmtMean(value.averageFloor)} | ${fmtMean(value.combatRounds)} | ${fmtMean(value.incomingHitTurns)} | ${fmtMean(value.materialEvPerTime, 4)} | ${fmtRate(value.mpDepletionRate)} |`);
  }
  lines.push(
    "",
    "E=entrant（全run分母）、X/D/Rはentrant分母で合計100%。率=Wilson 95% CI、平均=正規近似95% CI。N<30は未確定。",
    "",
    "## 呪文別 使用実績",
    "",
    "`実在`=既知action decision round数、`使用`=action選択数、`適用`=実際の詠唱ログ数、`カバー`=適用/実在、`castable適用`=適用/残MP条件を満たしたround数。",
    "",
    "### Mage",
    "",
    ...SPELL_IDS.filter(spellName => ["HALITO", "LAHALITO", "MAHALITO", "MADALTO", "TILTOWAIT", "KATINO"].includes(spellName)).map(spellName => `- ${renderSpellUsage(mageCurrent, spellName)}`),
    "",
    "### Priest",
    "",
    ...SPELL_IDS.filter(spellName => ["BADIOS", "DIOS", "MADIOS"].includes(spellName)).map(spellName => `- ${renderSpellUsage(priestCurrent, spellName)}`),
    "",
    "## 補正 sweep",
    "",
    "| 候補 | Mage B5死亡 | Mage B10到達 | 平均floor | 戦闘turn/run | 被弾turn/run | 素材EV/時間 | MP枯渇率 | reserveMp違反 | 他職B10 entrant Δ（戦/盗/僧） |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |"
  );
  for (const candidate of ACTIVE_CASES) {
    const mage = getSummary(candidate.id, "Mage");
    const deltas = ["Fighter", "Thief", "Priest"].map(className => {
      const delta = getSummary(candidate.id, className).b10.entrant.estimate - current[className].b10.entrant.estimate;
      return `${(delta * 100).toFixed(1)}pt`;
    }).join(" / ");
    lines.push(`| ${candidate.label} | ${fmtRate(mage.b5.death)} | ${fmtRate(mage.b10.entrant)} | ${fmtMean(mage.averageFloor)} | ${fmtMean(mage.combatRounds)} | ${fmtMean(mage.incomingHitTurns)} | ${fmtMean(mage.materialEvPerTime, 4)} | ${fmtRate(mage.mpDepletionRate)} | ${fmtRate(mage.reserveMpViolations)} | ${deltas} |`);
  }
  lines.push(
    "",
    "## 判定・再現",
    "",
    `- seed=${SEED}、各case・職 N=${RUNS}、calibration N=${CALIBRATION_RUNS}、target depth=${TARGET_DEPTH}、工房6状態分布=${WORKSHOP_DISTRIBUTION.map(([id, count]) => `${id}:${count}/${WORKSHOP_TOTAL}`).join(", ")}`,
    "- 出発kit `TOWN_PORTAL + HEAL_POTION×4 + ANTIDOTE + GUARD_POTION`、powder鑑定、EV逃走、conservative罠、EV罠回避、smart状態治療、商人購入なし。",
    "- case間で職業・scenario・runIndexの乱数seedを共有。非Mage 3職は介入なしのため、同一seed比較でΔ=0を確認。",
    `- source commit: ${provenance.sourceCommit}`,
    `- origin/main ancestor: ${provenance.originMainAncestor}`,
    `- stale tree allowed: ${provenance.staleTreeAllowed}`,
    `- env hash: ${measurement.envHash}`,
    `- resolved parallelism: ${measurement.resolvedParallelism}`,
    `- calibration wall-clock: ${measurement.calibrationWallSeconds.toFixed(3)}s / simulation wall-clock: ${measurement.simulationWallSeconds.toFixed(3)}s / total CPU: ${measurement.totalCpuSeconds.toFixed(3)}s`,
    `- raw JSONL SHA-256（未追跡）: ${rawSha256}`,
    `- summary JSON SHA-256（未追跡）: ${summarySha256}`,
    "- MP枯渇率=run中にspellcasterのMPが0になったrun率。reserveMp違反=DIOS保持Priestが敵攻撃呪文後にMP0となったrun率。",
    "",
    "再現コマンド:",
    "",
    "```sh",
    "node --check scratch/sim_issue_538_upper_spells.js",
    "ISSUE538_SMOKE=1 node scratch/sim_issue_538_upper_spells.js",
    `SIM_RUNS=500 SIM_CALIBRATION_RUNS=100 ISSUE538_CASE_FILTER=${CASES.map(({ id }) => id).join(",")} node scratch/sim_issue_538_upper_spells.js`,
    "```",
    ""
  );
  return lines.join("\n");
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
  const tasks = ACTIVE_CASES.flatMap(caseInfo => CLASSES.flatMap(className =>
    Array.from({ length: RUNS }, (_, runIndex) => ({
      caseId: caseInfo.id,
      className,
      runIndex,
      scenarioId: scenarioForRun(runIndex)
    }))
  ));
  const resolvedParallelism = resolveSimParallelism(tasks.length);
  const simulationStarted = performance.now();
  const simulationCpuStarted = process.cpuUsage();
  const rows = await runSimTasks({
    moduleUrl: pathToFileURL(new URL(import.meta.url).pathname).href,
    exportName: "runIssue538Task",
    runTask: runIssue538Task,
    tasks,
    context: { scoringProfiles },
    mapGeneratorExportName: "generateSharedRunFloor"
  });
  const simulationCpu = process.cpuUsage(simulationCpuStarted);
  const simulationWallSeconds = (performance.now() - simulationStarted) / 1000;
  if (rows.length !== tasks.length) throw new Error(`raw result audit failed: rows=${rows.length}/${tasks.length}`);
  const rawText = rows.map(row => JSON.stringify(row)).join("\n") + "\n";
  const rawSha256 = sha256(rawText);
  const env = {
    ...ENV_DEFAULTS,
    ISSUE538_MODE: SMOKE ? "smoke" : "measurement",
    ISSUE538_CASES: ACTIVE_CASES.map(item => item.id).join(","),
    ISSUE538_CLASSES: CLASSES.join(","),
    ISSUE538_TARGET_DEPTH: String(TARGET_DEPTH),
    ISSUE538_WORKSHOP_DISTRIBUTION: WORKSHOP_DISTRIBUTION.map(([id, count]) => `${id}:${count}/${WORKSHOP_TOTAL}`).join(","),
    SIM_PARALLEL: "<omitted; runtime default>",
    SIM_MAP_CACHE_ENTRIES: "<omitted; runtime default 1024>"
  };
  const envCanonical = Object.entries(env).sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`).join("\n") + "\n";
  const measurement = {
    envHash: sha256(envCanonical),
    resolvedParallelism,
    calibrationWallSeconds,
    simulationWallSeconds,
    totalCpuSeconds: (
      calibrationCpu.user + calibrationCpu.system + simulationCpu.user + simulationCpu.system
    ) / 1e6
  };
  const summaries = Object.fromEntries(ACTIVE_CASES.flatMap(caseInfo =>
    CLASSES.map(className => [
      `${caseInfo.id}:${className}`,
      summarizeClass(rows, caseInfo.id, className)
    ])
  ));
  const provenance = MEASUREMENT_PROVENANCE || {
    sourceCommit: "test",
    originMainAncestor: null,
    staleTreeAllowed: null
  };
  const summary = { measurement, env, cases: ACTIVE_CASES, summaries, provenance };
  const resultDir = new URL("./results/", new URL("./", import.meta.url));
  mkdirSync(resultDir, { recursive: true });
  const rawPath = new URL("issue-538-upper-spells.jsonl", resultDir);
  const summaryPath = new URL("issue-538-upper-spells.json", resultDir);
  const markdownPath = new URL("issue-538-upper-spells.md", resultDir);
  writeFileSync(rawPath, rawText);
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  const summarySha256 = sha256(readFileSync(summaryPath));
  writeFileSync(markdownPath, renderMarkdown({ summaries, measurement, rawSha256, summarySha256, provenance }));
  console.log(JSON.stringify({
    output: "scratch/results/issue-538-upper-spells.md",
    envHash: measurement.envHash,
    rawSha256,
    summarySha256,
    sourceCommit: provenance.sourceCommit,
    originMainAncestor: provenance.originMainAncestor,
    cases: ACTIVE_CASES.length,
    runsPerCaseClass: RUNS,
    calibrationRuns: CALIBRATION_RUNS,
    resolvedParallelism,
    wallClockSeconds: calibrationWallSeconds + simulationWallSeconds,
    cpuTotalSeconds: measurement.totalCpuSeconds
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
