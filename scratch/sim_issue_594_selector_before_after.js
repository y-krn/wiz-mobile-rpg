// sim-scope: run — Issue #594 healing selector before/after depth comparison
/* global console, process */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isMainThread } from "node:worker_threads";

import { resolveSimParallelism, runSimTasks } from "./sim_parallel.js";

const SMOKE = process.env.ISSUE594_SMOKE === "1";
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
const MODES = Object.freeze(["before", "after"]);
const RECOVERY_SPELLS = Object.freeze(["DIALMA", "MADI", "MADIOS", "DIOS"]);
const TARGET_DEPTH = 20;
const RUNS_PER_CLASS = SMOKE ? 1 : 500;
const CALIBRATION_RUNS = SMOKE ? 1 : 100;
const R95 = 1.959963984540054;
const RESULT_BASENAME = "issue-594-selector-before-after";
const MADI_OVERRIDE_KEYS = Object.freeze([
  "SIM_MADI_CANDIDATE",
  "SIM_MADI_HEAL_MIN",
  "SIM_MADI_HEAL_MAX",
  "SIM_MADI_COST"
]);

if (process.env.SIM_PARALLEL !== undefined) {
  throw new Error("SIM_PARALLEL must be omitted for Issue #594 measurement");
}
if (process.env.SIM_MAP_CACHE_ENTRIES !== undefined) {
  throw new Error("SIM_MAP_CACHE_ENTRIES must be omitted for Issue #594 measurement");
}
if (process.env.SIM_SKIP_PROVENANCE !== undefined) {
  throw new Error("SIM_SKIP_PROVENANCE must be omitted for Issue #594 measurement");
}
for (const key of MADI_OVERRIDE_KEYS) {
  if (process.env[key] !== undefined) {
    throw new Error(`${key} must remain unset for Issue #594 measurement`);
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
    throw new Error(`Issue #594 fixed env mismatch: ${key}=${process.env[key]}`);
  }
}

// This is the only temporary source gate used by the measurement. The source
// branch is restored after the two modes have been measured.
if (isMainThread) process.env.ISSUE594_LEGACY_SELECTOR = "0";

const simulationModule = await import("./sim_depth_material_ev.js");
const {
  calibrateCoreScoringProfile,
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

export function generateSharedRunFloor(args) {
  return simulationModule.generateSharedRunFloor(args);
}

export function runIssue594Task(task, context) {
  const expectedGate = task.mode === "before" ? "1" : "0";
  if (process.env.ISSUE594_LEGACY_SELECTOR !== expectedGate) {
    throw new Error(
      `selector gate mismatch: mode=${task.mode} env=${process.env.ISSUE594_LEGACY_SELECTOR}`
    );
  }
  const scenario = getScenarioById(task.scenarioId);
  const scoringProfile = context.scoringProfiles[task.scenarioId];
  if (!scoringProfile) {
    throw new Error(`missing scoring profile: ${task.scenarioId}`);
  }
  const randomSequenceId = `${task.scenarioId}:${task.className}:${task.runIndex}`;
  resetSimulationRandom(hashSeed(`461:issue594:${randomSequenceId}`));
  const result = simulateRun({
    className: task.className,
    startFloor: 1,
    targetDepth: TARGET_DEPTH,
    runIndex: task.runIndex,
    seriesId: "issue594-selector",
    scoringProfile,
    scenario,
    workshop: scenario.workshop,
    collectDiagnostics: false
  });
  return {
    className: task.className,
    runIndex: task.runIndex,
    scenarioId: task.scenarioId,
    randomSequenceId,
    reachedFloor: result.reachedFloor,
    deathFloor: result.deathFloor,
    survived: Boolean(result.survived),
    died: Boolean(result.died),
    spellUsage: Object.fromEntries(
      RECOVERY_SPELLS.map(spellName => [
        spellName,
        { ...(result.spellUsage?.[spellName] || {}) }
      ])
    ),
    endpoints: {
      b5: endpoint(result, 5),
      b10: endpoint(result, 10)
    }
  };
}

// Reused verbatim from scratch/sim_issue_538_upper_spells.js.
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

function summarizeRows(rows) {
  const result = {};
  for (const floor of [5, 10]) {
    const key = `b${floor}`;
    const entrants = rows.filter(row => row.endpoints[key].entrant);
    result[key] = {
      entrant: wilson(entrants.length, rows.length),
      breakthrough: wilson(
        entrants.filter(row => row.endpoints[key].breakthrough).length,
        entrants.length
      ),
      death: wilson(
        entrants.filter(row => row.endpoints[key].death).length,
        entrants.length
      ),
      retreat: wilson(
        entrants.filter(row => row.endpoints[key].retreat).length,
        entrants.length
      )
    };
  }
  result.b20 = {
    survival: wilson(rows.filter(row => row.survived).length, rows.length),
    death: wilson(rows.filter(row => row.died).length, rows.length)
  };
  return result;
}

function summarizeSpellUsage(rows) {
  return Object.fromEntries(RECOVERY_SPELLS.map(spellName => {
    const totals = rows.reduce((sum, row) => {
      const usage = row.spellUsage?.[spellName] || {};
      Object.keys(sum).forEach(key => {
        sum[key] += Number(usage[key] || 0);
      });
      return sum;
    }, {
      knownRounds: 0,
      castableRounds: 0,
      selected: 0,
      applied: 0,
      failed: 0,
      postCombatCasts: 0,
      postCombatHealingHp: 0
    });
    return [spellName, totals];
  }));
}

const METRIC_SPECS = Object.freeze([
  ["b5", "entrant", "B5 到達率（全run分母）"],
  ["b5", "breakthrough", "B5 突破率（到達run分母）"],
  ["b5", "death", "B5 死亡率（到達run分母）"],
  ["b5", "retreat", "B5 撤退率（到達run分母）"],
  ["b10", "entrant", "B10 到達率（全run分母）"],
  ["b10", "breakthrough", "B10 突破率（到達run分母）"],
  ["b10", "death", "B10 死亡率（到達run分母）"],
  ["b10", "retreat", "B10 撤退率（到達run分母）"],
  ["b20", "survival", "B20 生還率（全run分母）"],
  ["b20", "death", "B20 死亡率（全run分母）"]
]);

function formatRate(stat) {
  if (stat.estimate === null) return "未観測 [N=0; CIなし]";
  const uncertain = stat.status === "確定" ? "" : ` ${stat.status}`;
  return `${(stat.estimate * 100).toFixed(1)}% ` +
    `[${(stat.low * 100).toFixed(1)}, ${(stat.high * 100).toFixed(1)}; ` +
    `N=${stat.trials}]${uncertain}`;
}

function compareRates(before, after) {
  if (before.estimate === null || after.estimate === null) return "未観測";
  const overlaps = before.low <= after.high && after.low <= before.high;
  const delta = (after.estimate - before.estimate) * 100;
  if (overlaps) return "CI重複（有意な変化なし）";
  const direction = delta > 0 ? "after増" : delta < 0 ? "after減" : "差なし";
  return `CI非重複（${direction}, ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}pt）`;
}

function getMetric(summary, section, metric) {
  return summary[section][metric];
}

function buildMetricRows(beforeSummary, afterSummary) {
  return METRIC_SPECS.map(([section, metric, label]) => {
    const before = getMetric(beforeSummary, section, metric);
    const after = getMetric(afterSummary, section, metric);
    return { section, metric, label, before, after };
  });
}

function buildTasks(mode) {
  return BASIC_CLASSES.flatMap(className =>
    Array.from({ length: RUNS_PER_CLASS }, (_, runIndex) => ({
      mode,
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

async function measureMode(mode, scoringProfiles) {
  process.env.ISSUE594_LEGACY_SELECTOR = mode === "before" ? "1" : "0";
  console.log(`Issue #594 ${mode}: selector gate=${process.env.ISSUE594_LEGACY_SELECTOR}`);
  const tasks = buildTasks(mode);
  const resolvedParallelism = resolveSimParallelism(tasks.length);
  const simulationStarted = performance.now();
  const simulationCpuStarted = process.cpuUsage();
  const rows = await runSimTasks({
    moduleUrl: pathToFileURL(fileURLToPath(import.meta.url)).href,
    exportName: "runIssue594Task",
    runTask: runIssue594Task,
    tasks,
    context: { scoringProfiles },
    mapGeneratorExportName: "generateSharedRunFloor"
  });
  const simulationCpu = process.cpuUsage(simulationCpuStarted);
  const simulationWallSeconds = (performance.now() - simulationStarted) / 1000;
  if (rows.length !== tasks.length) {
    throw new Error(`raw result audit failed: rows=${rows.length}/${tasks.length}`);
  }
  rows.forEach(row => {
    if (Number(row.survived) + Number(row.died) !== 1) {
      throw new Error(`non-terminal run result: ${JSON.stringify(row)}`);
    }
  });
  const rawText = rows.map(row => JSON.stringify(row)).join("\n") + "\n";
  const summaries = Object.fromEntries(BASIC_CLASSES.map(className => {
    const classRows = rows.filter(row => row.className === className);
    return [className, {
      runs: classRows.length,
      metrics: summarizeRows(classRows),
      spellUsage: summarizeSpellUsage(classRows),
      scenarioCounts: Object.fromEntries(SCENARIO_IDS.map(scenarioId => [
        scenarioId,
        classRows.filter(row => row.scenarioId === scenarioId).length
      ]))
    }];
  }));
  return {
    mode,
    rows,
    rawSha256: sha256(rawText),
    summaries,
    measurement: {
      simulationWallSeconds,
      simulationCpuSeconds: (simulationCpu.user + simulationCpu.system) / 1e6,
      resolvedParallelism
    }
  };
}

function calibrateCommonProfiles() {
  // Calibration uses the current selector once, then the resulting profile is
  // shared by both endpoint runs. Recalibrating per selector would let the
  // Priest's changed random-consumption path alter other classes' profiles.
  process.env.ISSUE594_LEGACY_SELECTOR = "0";
  const calibrationStarted = performance.now();
  const calibrationCpuStarted = process.cpuUsage();
  const scoringProfiles = calibrateProfiles();
  const calibrationCpu = process.cpuUsage(calibrationCpuStarted);
  return {
    scoringProfiles,
    wallSeconds: (performance.now() - calibrationStarted) / 1000,
    cpuSeconds: (calibrationCpu.user + calibrationCpu.system) / 1e6,
    sha256: sha256(JSON.stringify(scoringProfiles))
  };
}

function environmentForHash() {
  return {
    ...getResolvedSimulationEnv(),
    SIM_PRESET: "",
    SIM_PARALLEL: "<omitted; runtime default>",
    SIM_MAP_CACHE_ENTRIES: "<omitted; runtime default 1024>",
    SIM_SKIP_PROVENANCE: "<omitted>",
    SIM_MADI_OVERRIDE_INPUTS: "<unset>",
    ISSUE594_TARGET_DEPTH: String(TARGET_DEPTH),
    ISSUE594_RUNS_PER_CLASS: String(RUNS_PER_CLASS),
    ISSUE594_CALIBRATION_RUNS: String(CALIBRATION_RUNS),
    ISSUE594_WORKSHOP_DISTRIBUTION: WORKSHOP_DISTRIBUTION
      .map(([scenarioId, count]) => `${scenarioId}:${count}/${WORKSHOP_TOTAL}`)
      .join(","),
    ISSUE594_SCENARIOS: SCENARIO_IDS.join(","),
    ISSUE594_MANUAL_RANDOM_SEQUENCE:
      "hash(SIM_SEED:issue594:scenarioId:className:runIndex)"
  };
}

function canonicalEnvironment(environment) {
  return Object.entries(environment)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n") + "\n";
}

function mapByKey(rows) {
  return new Map(rows.map(row => [
    `${row.className}:${row.runIndex}:${row.scenarioId}`,
    row
  ]));
}

function outcomeForAudit(row) {
  return {
    className: row.className,
    runIndex: row.runIndex,
    scenarioId: row.scenarioId,
    randomSequenceId: row.randomSequenceId,
    reachedFloor: row.reachedFloor,
    deathFloor: row.deathFloor,
    survived: row.survived,
    died: row.died,
    endpoints: row.endpoints
  };
}

function auditPair(beforeRows, afterRows) {
  const before = mapByKey(beforeRows);
  const after = mapByKey(afterRows);
  const keys = [...before.keys()];
  const missing = keys.filter(key => !after.has(key));
  const extra = [...after.keys()].filter(key => !before.has(key));
  const byClass = Object.fromEntries(BASIC_CLASSES.map(className => {
    const classKeys = keys.filter(key => key.startsWith(`${className}:`));
    const changed = classKeys.filter(key =>
      JSON.stringify(outcomeForAudit(before.get(key))) !==
      JSON.stringify(outcomeForAudit(after.get(key)))
    );
    return [className, {
      runs: classKeys.length,
      identical: classKeys.length - changed.length,
      changed: changed.length,
      examples: changed.slice(0, 3).map(key => ({
        key,
        before: outcomeForAudit(before.get(key)),
        after: outcomeForAudit(after.get(key))
      }))
    }];
  }));
  return {
    commonKeys: keys.filter(key => after.has(key)).length,
    beforeRows: beforeRows.length,
    afterRows: afterRows.length,
    missing,
    extra,
    byClass
  };
}

function renderComparisonTable(lines, className, before, after) {
  lines.push(`## ${CLASS_LABELS[className]}（${className}）`);
  lines.push("");
  lines.push("B5/B10 は `到達率=全run分母`、突破/死亡/撤退は `到達run分母`。B20 は生還/死亡とも全run分母。");
  lines.push("");
  lines.push("| 指標 | before（配列順 find） | after（欠損量/cost/expected-waste） | 判定 |");
  lines.push("| --- | --- | --- | --- |");
  buildMetricRows(before.metrics, after.metrics).forEach(row => {
    lines.push(
      `| ${row.label} | ${formatRate(row.before)} | ${formatRate(row.after)} | ` +
      `${compareRates(row.before, row.after)} |`
    );
  });
  lines.push("");
}

function formatSpellUsage(usage) {
  return [
    `known=${usage.knownRounds}`,
    `castable=${usage.castableRounds}`,
    `selected=${usage.selected}`,
    `applied=${usage.applied}`,
    `failed=${usage.failed}`,
    `post=${usage.postCombatCasts}`,
    `postHp=${usage.postCombatHealingHp}`
  ].join("<br>");
}

function renderSpellUsageTable(lines, before, after) {
  lines.push(
    "### 僧侶の回復呪文使用監査",
    "",
    "`selected/applied` は既存simの呪文使用メトリクス。`post/postHp` は戦闘後回復の回数/HP。",
    "",
    "| 呪文 | before | after |",
    "| --- | --- | --- |"
  );
  RECOVERY_SPELLS.forEach(spellName => {
    lines.push(
      `| ${spellName} | ${formatSpellUsage(before[spellName])} | ${formatSpellUsage(after[spellName])} |`
    );
  });
  lines.push("");
}

function renderMarkdown({
  environment,
  envHash,
  provenance,
  commonCalibration,
  before,
  after,
  pairAuditResult
}) {
  const allMetricRows = BASIC_CLASSES.flatMap(className =>
    buildMetricRows(
      before.summaries[className].metrics,
      after.summaries[className].metrics
    ).map(row => ({ ...row, className }))
  );
  const significant = allMetricRows.filter(row =>
    row.before.estimate !== null && row.after.estimate !== null &&
    !(row.before.low <= row.after.high && row.after.low <= row.before.high)
  );
  const nonPriestChanged = BASIC_CLASSES
    .filter(className => className !== "Priest")
    .reduce((sum, className) => sum + pairAuditResult.byClass[className].changed, 0);
  const lines = [
    "# Issue #594 回復selector before/after深度比較",
    "",
    "## 結論",
    "",
    significant.length === 0
      ? "B5/B10/B20 の全率で before/after の Wilson 95% CI が重なった。点推定の差はあっても、今回のNでは有意な変化なし（isn't a significant move）と判定する。"
      : `Wilson 95% CI が重ならない指標が ${significant.length} 件ある。方向・大きさは下表の CI 非重複行に従う。`,
    `他3職の対応run監査: ${nonPriestChanged === 0 ? "Fighter/Thief/Mage は全行一致。選択selector由来の動きなし。" : `一致しない行が ${nonPriestChanged} 件あり、測定側の乱数消費・calibration・共有seedを追加調査する。`}`,
    "",
    "## 固定条件・実行記録",
    "",
    `- target depth: B${TARGET_DEPTH}（B5/B10 endpointとB20 survivalRateを同じtarget-depth runから集計）`,
    `- env hash（before/after共通）: \`${envHash}\``,
    `- source commit: \`${provenance.sourceCommit}\``,
    `- origin/main ancestor: \`${provenance.originMainAncestor}\`、stale tree allowed: \`${provenance.staleTreeAllowed}\``,
    `- before raw row SHA-256（保存なし）: \`${before.rawSha256}\``,
    `- after raw row SHA-256（保存なし）: \`${after.rawSha256}\``,
    `- common calibration（after selectorで1回、両条件へ共有）: ${commonCalibration.wallSeconds.toFixed(3)}s; CPU ${commonCalibration.cpuSeconds.toFixed(3)}s; profile SHA-256 \`${commonCalibration.sha256}\``,
    `- before simulation: ${before.measurement.simulationWallSeconds.toFixed(3)}s; CPU ${before.measurement.simulationCpuSeconds.toFixed(3)}s; parallelism ${before.measurement.resolvedParallelism}`,
    `- after simulation: ${after.measurement.simulationWallSeconds.toFixed(3)}s; CPU ${after.measurement.simulationCpuSeconds.toFixed(3)}s; parallelism ${after.measurement.resolvedParallelism}`,
    "- `SIM_PARALLEL` は未指定（runtime default）、`SIM_MAP_CACHE_ENTRIES` は未指定（default 1024）、`SIM_SKIP_PROVENANCE` は未使用。",
    "- `SIM_MADI_CANDIDATE` / `SIM_MADI_HEAL_MIN` / `SIM_MADI_HEAL_MAX` / `SIM_MADI_COST` は入力envで未設定。",
    "",
    "固定env（selector gateを除く）:",
    "",
    "```text",
    canonicalEnvironment(environment).trimEnd(),
    "```",
    "",
    ""
  ];
  renderComparisonTable(lines, "Priest", before.summaries.Priest, after.summaries.Priest);
  renderSpellUsageTable(
    lines,
    before.summaries.Priest.spellUsage,
    after.summaries.Priest.spellUsage
  );
  lines.push("## 他3職");
  lines.push("");
  for (const className of ["Fighter", "Thief", "Mage"]) {
    renderComparisonTable(lines, className, before.summaries[className], after.summaries[className]);
  }
  lines.push(
    "## 対応run・endpoint監査",
    "",
    `- common keys: ${pairAuditResult.commonKeys}/${pairAuditResult.beforeRows} before / ${pairAuditResult.afterRows} after`,
    `- missing keys: ${pairAuditResult.missing.length}; extra keys: ${pairAuditResult.extra.length}`,
    `- Priest: ${pairAuditResult.byClass.Priest.identical}/${pairAuditResult.byClass.Priest.runs} 行一致、${pairAuditResult.byClass.Priest.changed} 行差分`,
    `- Fighter: ${pairAuditResult.byClass.Fighter.identical}/${pairAuditResult.byClass.Fighter.runs} 行一致、${pairAuditResult.byClass.Fighter.changed} 行差分`,
    `- Thief: ${pairAuditResult.byClass.Thief.identical}/${pairAuditResult.byClass.Thief.runs} 行一致、${pairAuditResult.byClass.Thief.changed} 行差分`,
    `- Mage: ${pairAuditResult.byClass.Mage.identical}/${pairAuditResult.byClass.Mage.runs} 行一致、${pairAuditResult.byClass.Mage.changed} 行差分`,
    "",
    "## 再現コマンド",
    "",
    "```sh",
    "node --check scratch/sim_issue_594_selector_before_after.js",
    "ISSUE594_SMOKE=1 node scratch/sim_issue_594_selector_before_after.js",
    "node scratch/sim_issue_594_selector_before_after.js",
    "```",
    "",
    "このrunnerは測定時に `src/combat_logic/auto_action.js` の一時envゲートを必要とする。測定完了後はゲートを削除し、現行PR差分へ戻した。",
    "シミュレーションは `generateRunFloor`、現行戦闘/報酬/装備更新、TOWN_PORTAL、状態異常治療、鑑定粉、現行departure kitを通す。任意商人行動・人間の敵別判断・MP/強化アイテムの能動使用は既存simの範囲どおりモデル外。"
  );
  return lines.join("\n") + "\n";
}

async function main() {
  const commonCalibration = calibrateCommonProfiles();
  const modeResults = {};
  for (const mode of MODES) {
    modeResults[mode] = await measureMode(mode, commonCalibration.scoringProfiles);
  }
  process.env.ISSUE594_LEGACY_SELECTOR = "0";
  const environment = environmentForHash();
  const envHash = sha256(canonicalEnvironment(environment));
  const provenance = MEASUREMENT_PROVENANCE || {
    sourceCommit: "test",
    originMainAncestor: null,
    staleTreeAllowed: null
  };
  const pairAuditResult = auditPair(modeResults.before.rows, modeResults.after.rows);
  if (pairAuditResult.missing.length > 0 || pairAuditResult.extra.length > 0) {
    throw new Error(`paired run key mismatch: ${JSON.stringify(pairAuditResult)}`);
  }
  const markdown = renderMarkdown({
    environment,
    envHash,
    provenance,
    commonCalibration,
    before: modeResults.before,
    after: modeResults.after,
    pairAuditResult
  });
  const resultDir = new URL("./results/", new URL("./", import.meta.url));
  mkdirSync(resultDir, { recursive: true });
  const markdownPath = new URL(`${RESULT_BASENAME}.md`, resultDir);
  writeFileSync(markdownPath, markdown);
  const summarySha256 = sha256(readFileSync(markdownPath));
  console.log(`summary: ${fileURLToPath(markdownPath)}`);
  console.log(`summary SHA-256: ${summarySha256}`);
  console.log(`env hash: ${envHash}`);
  console.log(`before raw row SHA-256: ${modeResults.before.rawSha256}`);
  console.log(`after raw row SHA-256: ${modeResults.after.rawSha256}`);
  console.log(JSON.stringify(pairAuditResult.byClass, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
