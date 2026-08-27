// sim-scope: run — Issue #599 stage 2 exploration spell before/after comparison
/* global console, process */

import "./simulation_preflight.js";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { resolveMeasurementProvenance } from "../measurements/measurement_provenance.js";
import { resolveSimParallelism, runSimTasks } from "./sim_parallel.js";

const IS_CHILD = process.env.ISSUE599_EXPLORE_CHILD === "1";
const SMOKE = process.env.ISSUE599_SMOKE === "1";
const EXPLORE_MODE = process.env.SIM_EXPLORE_SPELLS === "on" ? "after" : "before";
const EXPLORE_ENV_VALUE = EXPLORE_MODE === "before" ? "<unset>" : "on";
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const BASIC_CLASSES = Object.freeze(["Fighter", "Thief", "Priest", "Mage"]);
const MEASURED_CLASSES = BASIC_CLASSES;
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
const RESULT_BASENAME = "issue-599-explore-spells";
const EXPLORATION_SPELLS = Object.freeze(["MILWA", "LOMILWA", "MASFEAL"]);
const METRIC_DEFINITIONS = Object.freeze([
  ["steps", "探索歩数"],
  ["battles", "遭遇回数"],
  ["lightActiveSteps", "明かり有効ターン数"],
  ["masfealActiveSteps", "MASFEAL有効ターン数"]
]);
const SUBSET_DEFINITIONS = Object.freeze([
  ["all", "全run", () => true],
  ["b5", "B5到達run", row => row.reachedFloor >= 5],
  ["b10", "B10到達run", row => row.reachedFloor >= 10]
]);

// Keep this list and its values aligned with sim_issue_599_level_distribution.js.
for (const key of ["SIM_PARALLEL", "SIM_MAP_CACHE_ENTRIES", "SIM_SKIP_PROVENANCE"]) {
  const internalChildProvenanceBypass =
    IS_CHILD && key === "SIM_SKIP_PROVENANCE" && process.env[key] === "1";
  if (process.env[key] !== undefined && !internalChildProvenanceBypass) {
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

const SIM_SEED = Number(process.env.SIM_SEED) >>> 0;
// The parent records provenance once after the required fetch. Nested child
// processes must not race on the linked worktree's FETCH_HEAD.
if (IS_CHILD) process.env.SIM_SKIP_PROVENANCE = "1";
const simulationModule = IS_CHILD
  ? await import("./sim_depth_material_ev.js")
  : null;

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

function buildTasks() {
  return MEASURED_CLASSES.flatMap(className =>
    Array.from({ length: RUNS_PER_CLASS }, (_, runIndex) => ({
      className,
      runIndex,
      scenarioId: scenarioForRun(runIndex)
    }))
  );
}

function requireChildModule() {
  if (!simulationModule) throw new Error("simulation module is only available in child mode");
  return simulationModule;
}

export function generateSharedRunFloor(args) {
  return requireChildModule().generateSharedRunFloor(args);
}

export function runIssue599ExploreTask(task, context) {
  const simulation = requireChildModule();
  const scenario = simulation.getScenarioById(task.scenarioId);
  const scoringProfile = context.scoringProfiles[task.scenarioId];
  if (!scoringProfile) throw new Error(`missing scoring profile: ${task.scenarioId}`);

  const randomSequenceId = `${task.scenarioId}:${task.className}:${task.runIndex}`;
  const randomSeed = hashSeed(`${SIM_SEED}:issue599:${randomSequenceId}`);
  simulation.resetSimulationRandom(randomSeed);
  const result = simulation.simulateRun({
    className: task.className,
    startFloor: 1,
    targetDepth: TARGET_DEPTH,
    runIndex: task.runIndex,
    seriesId: "issue599-explore-spells",
    scoringProfile,
    scenario,
    workshop: scenario.workshop
  });

  return {
    mode: EXPLORE_MODE,
    className: task.className,
    runIndex: task.runIndex,
    scenarioId: task.scenarioId,
    randomSequenceId,
    randomSeed,
    survived: Boolean(result.survived),
    died: Boolean(result.died),
    reachedFloor: result.reachedFloor,
    deathFloor: result.deathFloor,
    steps: result.steps,
    battles: result.battles,
    lightActiveSteps: result.lightActiveSteps,
    masfealActiveSteps: result.masfealActiveSteps,
    explorationSpellUsage: Object.fromEntries(
      EXPLORATION_SPELLS.map(spellName => [
        spellName,
        result.explorationSpellUsage?.[spellName] || 0
      ])
    )
  };
}

function calibrateProfiles() {
  const simulation = requireChildModule();
  const scoringProfiles = {};
  for (const scenarioId of SCENARIO_IDS) {
    const scenario = simulation.getScenarioById(scenarioId);
    simulation.resetSimulationRandom(SIM_SEED);
    scoringProfiles[scenarioId] = simulation.calibrateCoreScoringProfile(
      CALIBRATION_RUNS,
      scenario,
      "powder",
      scenario.workshop
    );
  }
  return scoringProfiles;
}

async function measureCurrentMode(scoringProfiles) {
  const tasks = buildTasks();
  const resolvedParallelism = resolveSimParallelism(tasks.length);
  const started = performance.now();
  const cpuStarted = process.cpuUsage();
  const rows = await runSimTasks({
    moduleUrl: pathToFileURL(SCRIPT_PATH).href,
    exportName: "runIssue599ExploreTask",
    runTask: runIssue599ExploreTask,
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
    if (row.mode !== EXPLORE_MODE) throw new Error(`mode mismatch: ${row.mode}`);
    if (!Number.isInteger(row.reachedFloor) || row.reachedFloor < 1) {
      throw new Error(`invalid reachedFloor: ${JSON.stringify(row)}`);
    }
    if (!Number.isInteger(row.steps) || row.steps < 0) {
      throw new Error(`invalid steps: ${JSON.stringify(row)}`);
    }
    if (!Number.isInteger(row.battles) || row.battles < 0) {
      throw new Error(`invalid battles: ${JSON.stringify(row)}`);
    }
  });

  return {
    rows,
    resolvedParallelism,
    wallSeconds: (performance.now() - started) / 1000,
    cpuSeconds: (cpu.user + cpu.system) / 1e6
  };
}

async function writeChildResult() {
  const rawPath = process.env.ISSUE599_RAW_PATH;
  const metadataPath = process.env.ISSUE599_METADATA_PATH;
  if (!rawPath || !metadataPath) {
    throw new Error("child result paths are required");
  }

  const sharedProfilePath = process.env.ISSUE599_SHARED_PROFILE_PATH || null;
  let scoringProfiles;
  let calibration;
  if (sharedProfilePath) {
    scoringProfiles = JSON.parse(readFileSync(sharedProfilePath, "utf8"));
    calibration = {
      wallSeconds: 0,
      cpuSeconds: 0,
      sha256: sha256(JSON.stringify(scoringProfiles)),
      reused: true
    };
  } else {
    const calibrationStarted = performance.now();
    const calibrationCpuStarted = process.cpuUsage();
    scoringProfiles = calibrateProfiles();
    const calibrationCpu = process.cpuUsage(calibrationCpuStarted);
    calibration = {
      wallSeconds: (performance.now() - calibrationStarted) / 1000,
      cpuSeconds: (calibrationCpu.user + calibrationCpu.system) / 1e6,
      sha256: sha256(JSON.stringify(scoringProfiles)),
      reused: false
    };
  }
  const measurement = await measureCurrentMode(scoringProfiles);
  const simulation = requireChildModule();
  const rawText = measurement.rows.map(row => JSON.stringify(row)).join("\n") + "\n";
  const environment = {
    ...simulation.getResolvedSimulationEnv(),
    SIM_PRESET: "",
    SIM_PARALLEL: "<omitted; runtime default>",
    SIM_MAP_CACHE_ENTRIES: "<omitted; runtime default 1024>",
    SIM_SKIP_PROVENANCE: "<omitted>",
    SIM_EXPLORE_SPELLS: EXPLORE_ENV_VALUE,
    ISSUE599_TARGET_DEPTH: String(TARGET_DEPTH),
    ISSUE599_RUNS_PER_CLASS: String(RUNS_PER_CLASS),
    ISSUE599_CALIBRATION_RUNS: String(CALIBRATION_RUNS),
    ISSUE599_WORKSHOP_DISTRIBUTION: WORKSHOP_DISTRIBUTION
      .map(([scenarioId, count]) => `${scenarioId}:${count}/${WORKSHOP_TOTAL}`)
      .join(","),
    ISSUE599_SCENARIOS: SCENARIO_IDS.join(","),
    ISSUE599_MANUAL_RANDOM_SEQUENCE: "hash(SIM_SEED:issue599:scenarioId:className:runIndex)",
    ISSUE599_SHARED_CALIBRATION: sharedProfilePath
      ? "after profile reused"
      : "calibrated here; shared to before",
    ISSUE599_DIAGNOSTICS: "not collected",
    ISSUE599_DUMAPIC: "not cast; no combat/depth effect"
  };
  mkdirSync(dirname(rawPath), { recursive: true });
  mkdirSync(dirname(metadataPath), { recursive: true });
  writeFileSync(rawPath, rawText);
  const profilePath = process.env.ISSUE599_PROFILE_PATH;
  if (profilePath) {
    mkdirSync(dirname(profilePath), { recursive: true });
    writeFileSync(profilePath, `${JSON.stringify(scoringProfiles)}\n`);
  }
  const { rows: measuredRows, ...measurementSummary } = measurement;
  const metadata = {
    mode: EXPLORE_MODE,
    exploreEnvValue: EXPLORE_ENV_VALUE,
    rawPath,
    rawSha256: sha256(rawText),
    rows: measuredRows.length,
    calibration,
    measurement: measurementSummary,
    profilePath: profilePath || null,
    environment,
    provenance: simulation.MEASUREMENT_PROVENANCE
  };
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(
    `[${EXPLORE_MODE}] rows=${measurement.rows.length}; ` +
    `calibration=${calibration.wallSeconds.toFixed(3)}s; ` +
    `simulation=${measurement.wallSeconds.toFixed(3)}s; ` +
    `parallelism=${measurement.resolvedParallelism}`
  );
}

function runChild(mode, resultDir, sharedProfilePath = null) {
  const rawPath = join(resultDir, `${RESULT_BASENAME}-${mode}.jsonl`);
  const metadataPath = join(resultDir, `${RESULT_BASENAME}-${mode}.json`);
  const profilePath = join(resultDir, `${RESULT_BASENAME}-calibration.json`);
  const childEnvironment = {
    ...process.env,
    ISSUE599_EXPLORE_CHILD: "1",
    ISSUE599_RAW_PATH: rawPath,
    ISSUE599_METADATA_PATH: metadataPath
  };
  delete childEnvironment.ISSUE599_PROFILE_PATH;
  delete childEnvironment.ISSUE599_SHARED_PROFILE_PATH;
  if (sharedProfilePath) {
    childEnvironment.ISSUE599_SHARED_PROFILE_PATH = sharedProfilePath;
  } else if (mode === "after") {
    childEnvironment.ISSUE599_PROFILE_PATH = profilePath;
  }
  delete childEnvironment.SIM_EXPLORE_SPELLS;
  if (mode === "after") childEnvironment.SIM_EXPLORE_SPELLS = "on";

  return new Promise((resolve, reject) => {
    const started = performance.now();
    const child = spawn(process.execPath, [SCRIPT_PATH], {
      env: childEnvironment,
      stdio: ["ignore", "inherit", "inherit"]
    });
    child.once("error", reject);
    child.once("exit", code => {
      if (code !== 0) {
        reject(new Error(`${mode} child exited with code ${code}`));
        return;
      }
      try {
        const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
        resolve({
          ...metadata,
          childWallSeconds: (performance.now() - started) / 1000
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}

function loadRows(metadata) {
  const text = readFileSync(metadata.rawPath, "utf8").trim();
  const rows = text ? text.split("\n").map(line => JSON.parse(line)) : [];
  if (rows.length !== metadata.rows) {
    throw new Error(`raw row count mismatch: ${metadata.rawPath}`);
  }
  return rows;
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

function formatRate(stat) {
  if (stat.estimate === null) return "未観測（N=0; CIなし）";
  const status = stat.status === "確定" ? "" : `; ${stat.status}`;
  return `${(stat.estimate * 100).toFixed(1)}% ` +
    `[${(stat.low * 100).toFixed(1)}, ${(stat.high * 100).toFixed(1)}] ` +
    `(${stat.successes}/${stat.trials})${status}`;
}

function meanSummary(values) {
  const finiteValues = values.filter(Number.isFinite);
  const count = finiteValues.length;
  if (count === 0) return { count, mean: null, low: null, high: null };
  const mean = finiteValues.reduce((sum, value) => sum + value, 0) / count;
  if (count < 2) return { count, mean, low: null, high: null };
  const sumSquares = finiteValues.reduce((sum, value) => sum + value * value, 0);
  const variance = Math.max(0, (sumSquares - (mean * mean * count)) / (count - 1));
  const margin = R95 * Math.sqrt(variance / count);
  return { count, mean, low: mean - margin, high: mean + margin };
}

function formatMean(values) {
  const stat = meanSummary(values);
  if (stat.mean === null) return "未観測（N=0）";
  if (stat.low === null) return `${stat.mean.toFixed(2)} [未確定; N=${stat.count}]`;
  return `${stat.mean.toFixed(2)} [${stat.low.toFixed(2)}, ${stat.high.toFixed(2)}; N=${stat.count}]`;
}

function canonicalEnvironment(environment) {
  return Object.entries(environment)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n") + "\n";
}

function classRows(modeResult, className) {
  return modeResult.rawRows.filter(row => row.className === className);
}

function endpoint(rows, floor) {
  return {
    reached: wilson(rows.filter(row => row.reachedFloor >= floor).length, rows.length),
    breakthrough: wilson(rows.filter(row => row.reachedFloor > floor).length, rows.length),
    death: wilson(rows.filter(row => row.deathFloor === floor).length, rows.length)
  };
}

function b20Survival(rows) {
  return wilson(
    rows.filter(row => row.reachedFloor >= TARGET_DEPTH && row.survived).length,
    rows.length
  );
}

function renderOutcomeTable(lines, modeResults) {
  lines.push(
    "## 到達・突破・死亡率",
    "",
    "率はすべて職業別の全run分母。Wilson 95% CI、括弧内は成功数/分母。",
    "B5/B10の突破率は `reachedFloor>5` / `reachedFloor>10`、死亡率は `deathFloor===5` / `deathFloor===10`。",
    "",
    "| 職業 | 条件 | N | B5到達率 | B5突破率 | B5死亡率 | B10到達率 | B10突破率 | B10死亡率 | B20生存率 |",
    "| --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- |"
  );
  for (const className of MEASURED_CLASSES) {
    for (const mode of ["before", "after"]) {
      const rows = classRows(modeResults[mode], className);
      const b5 = endpoint(rows, 5);
      const b10 = endpoint(rows, 10);
      lines.push(
        `| ${CLASS_LABELS[className]} | ${mode === "before" ? "before（off）" : "after（on）"} | ${rows.length} | ` +
        `${formatRate(b5.reached)} | ${formatRate(b5.breakthrough)} | ${formatRate(b5.death)} | ` +
        `${formatRate(b10.reached)} | ${formatRate(b10.breakthrough)} | ${formatRate(b10.death)} | ` +
        `${formatRate(b20Survival(rows))} |`
      );
    }
  }
  lines.push("");
}

function renderMetricTables(lines, modeResults) {
  lines.push(
    "## 探索歩数・遭遇回数・有効ターン数",
    "",
    "平均/run。率ではないため、括弧内は正規近似95% CI（N=分母）。" +
      " 列ごとに全run、B5到達run、B10到達runの分母を分離する。",
    ""
  );
  for (const [field, label] of METRIC_DEFINITIONS) {
    lines.push(
      `### ${label}`,
      "",
      "| 職業 | 条件 | 全run | B5到達run | B10到達run |",
      "| --- | --- | --- | --- | --- |"
    );
    for (const className of MEASURED_CLASSES) {
      for (const mode of ["before", "after"]) {
        const rows = classRows(modeResults[mode], className);
        const cells = SUBSET_DEFINITIONS.map(([, , predicate]) =>
          formatMean(rows.filter(predicate).map(row => row[field]))
        );
        lines.push(
        `| ${CLASS_LABELS[className]} | ${mode === "before" ? "before（off）" : "after（on）"} | ` +
          `${cells.join(" | ")} |`
        );
      }
    }
    lines.push("");
  }
}

function usageTotal(rows, spellName) {
  return rows.reduce(
    (sum, row) => sum + Number(row.explorationSpellUsage?.[spellName] || 0),
    0
  );
}

function renderUsageTable(lines, modeResults) {
  lines.push(
    "## 探索呪文の使用回数",
    "",
    "全run分母。各セルは `合計 / 平均/run（正規近似95% CI）`。DUMAPICは座標報告のみで深度指標に影響しないため詠唱対象外。",
    "",
    "| 職業 | 条件 | N | MILWA | LOMILWA | MASFEAL | 探索呪文合計 |",
    "| --- | --- | ---: | --- | --- | --- | --- |"
  );
  for (const className of MEASURED_CLASSES) {
    for (const mode of ["before", "after"]) {
      const rows = classRows(modeResults[mode], className);
      const cells = EXPLORATION_SPELLS.map(spellName => {
        const values = rows.map(row => Number(row.explorationSpellUsage?.[spellName] || 0));
        return `${usageTotal(rows, spellName)} / ${formatMean(values)}`;
      });
      const totals = rows.reduce(
        (sum, row) => sum + EXPLORATION_SPELLS.reduce(
          (spellSum, spellName) => spellSum + Number(row.explorationSpellUsage?.[spellName] || 0),
          0
        ),
        0
      );
      const totalValues = rows.map(row => EXPLORATION_SPELLS.reduce(
        (sum, spellName) => sum + Number(row.explorationSpellUsage?.[spellName] || 0),
        0
      ));
      lines.push(
        `| ${CLASS_LABELS[className]} | ${mode === "before" ? "before（off）" : "after（on）"} | ${rows.length} | ` +
        `${cells.join(" | ")} | ${totals} / ${formatMean(totalValues)} |`
      );
    }
  }
  lines.push("");
}

function rowKey(row) {
  return `${row.className}:${row.runIndex}:${row.scenarioId}`;
}

function normalizeControlRow(row) {
  return {
    className: row.className,
    runIndex: row.runIndex,
    scenarioId: row.scenarioId,
    reachedFloor: row.reachedFloor,
    deathFloor: row.deathFloor,
    survived: row.survived,
    died: row.died,
    steps: row.steps,
    battles: row.battles,
    lightActiveSteps: row.lightActiveSteps,
    masfealActiveSteps: row.masfealActiveSteps,
    explorationSpellUsage: Object.fromEntries(
      EXPLORATION_SPELLS.map(spellName => [
        spellName,
        row.explorationSpellUsage?.[spellName] || 0
      ])
    )
  };
}

function compareControlClass(beforeRows, afterRows) {
  const beforeByKey = new Map(beforeRows.map(row => [rowKey(row), row]));
  const afterByKey = new Map(afterRows.map(row => [rowKey(row), row]));
  if (beforeByKey.size !== afterByKey.size) {
    return { exact: false, paired: false, difference: "paired key count mismatch" };
  }
  for (const [key, before] of beforeByKey) {
    const after = afterByKey.get(key);
    if (!after) return { exact: false, paired: false, difference: `missing after row ${key}` };
    const beforeNormalized = normalizeControlRow(before);
    const afterNormalized = normalizeControlRow(after);
    if (JSON.stringify(beforeNormalized) !== JSON.stringify(afterNormalized)) {
      return {
        exact: false,
        paired: true,
        difference: `${key}: ${JSON.stringify(beforeNormalized)} != ${JSON.stringify(afterNormalized)}`
      };
    }
  }
  return { exact: true, paired: true, difference: null };
}

function renderControlTable(lines, modeResults) {
  lines.push(
    "## Fighter / Thief 対照チェック",
    "",
    "同一run key（scenario/class/runIndex）を突き合わせ、要求指標と探索呪文使用のraw行を比較した。差が出た場合は測定側のバグ疑いとして扱う。",
    "",
    "| 職業 | paired N | on/off raw数値 | 判定 |",
    "| --- | ---: | --- | --- |"
  );
  for (const className of ["Fighter", "Thief"]) {
    const beforeRows = classRows(modeResults.before, className);
    const afterRows = classRows(modeResults.after, className);
    const comparison = compareControlClass(beforeRows, afterRows);
    lines.push(
      `| ${CLASS_LABELS[className]} | ${beforeRows.length} | ` +
      `${comparison.exact ? "bitwise identical" : "差あり"} | ` +
      `${comparison.exact
        ? "効果が発生していない（測定側control pass）"
        : `測定側を疑う（${comparison.difference}）`} |`
    );
  }
  lines.push("");
}

function outcomePointEstimates(modeResult, className) {
  const rows = classRows(modeResult, className);
  const b5 = endpoint(rows, 5);
  const b10 = endpoint(rows, 10);
  return [
    b5.reached.estimate,
    b5.breakthrough.estimate,
    b5.death.estimate,
    b10.reached.estimate,
    b10.breakthrough.estimate,
    b10.death.estimate,
    b20Survival(rows).estimate
  ];
}

function renderInterpretation(lines, modeResults) {
  lines.push("## 点推定の読み方", "");
  for (const className of MEASURED_CLASSES) {
    const before = outcomePointEstimates(modeResults.before, className);
    const after = outcomePointEstimates(modeResults.after, className);
    const exact = before.every((value, index) => Object.is(value, after[index]));
    lines.push(
      `- ${CLASS_LABELS[className]}のB5/B10/B20到達・死亡点推定は` +
      (exact
        ? "ビット単位で一致したため、「差が無い」ではなく「効果が発生していない」と記載する。"
        : "一致しないため、効果が発生している。")
    );
  }
  lines.push(
    "- 探索呪文の使用回数・有効ターン数は、beforeでは0、afterでは対象職で発生することを別表で確認する。",
    ""
  );
}

function renderMarkdown({ modeResults, environment, envHash, provenance, totalWallSeconds, summaryPath }) {
  const lines = [
    "# Issue #599 段階2 探索呪文 before/after 測定",
    "",
    `実行モード: ${SMOKE ? "smoke（各職N=1、workshop-completeのみ）" : "full（各職N=500）"}。` +
      "Priest / Mageを主対象、Fighter / Thiefを対照とした。",
    `target depth: B${TARGET_DEPTH}。workshop分布は段階1と同じ6条件加重（合計${WORKSHOP_TOTAL}）で、` +
      "率は全run分母を明記し、Wilson 95% CIを付けた。",
    "",
    "## 実行サマリー",
    "",
    "| 条件 | SIM_EXPLORE_SPELLS | N/職 | rows | calibration wall | simulation wall | child wall | 並列度 |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |"
  ];
  for (const mode of ["before", "after"]) {
    const metadata = modeResults[mode];
    const calibrationLabel = metadata.calibration.reused
      ? `${metadata.calibration.wallSeconds.toFixed(3)}s（shared）`
      : `${metadata.calibration.wallSeconds.toFixed(3)}s`;
    lines.push(
      `| ${mode === "before" ? "before（呪文なし）" : "after（呪文あり）"} | ${metadata.exploreEnvValue} | ` +
      `${RUNS_PER_CLASS} | ${metadata.rows} | ${calibrationLabel} | ` +
      `${metadata.measurement.wallSeconds.toFixed(3)}s | ${metadata.childWallSeconds.toFixed(3)}s | ` +
      `${metadata.measurement.resolvedParallelism} |`
    );
  }
  lines.push(
    "",
    `親プロセスでのbefore+after wall: ${totalWallSeconds.toFixed(3)}s。`,
    "平均のCIは正規近似95% CI。Wilson 95% CIは二項率（到達・突破・死亡・生存）に適用した。",
    ""
  );

  renderOutcomeTable(lines, modeResults);
  renderMetricTables(lines, modeResults);
  renderUsageTable(lines, modeResults);
  renderControlTable(lines, modeResults);
  renderInterpretation(lines, modeResults);

  lines.push(
    "## 固定条件・環境ハッシュ・再現",
    "",
    `- source commit: \`${provenance.sourceCommit}\``,
    `- origin/main ancestor: \`${provenance.originMainAncestor}\`; stale tree allowed: \`${provenance.staleTreeAllowed}\``,
    `- summary path: \`${summaryPath}\``,
    `- before raw JSONL: \`${modeResults.before.rawPath}\`; SHA-256 \`${modeResults.before.rawSha256}\`（gitignore対象）`,
    `- after raw JSONL: \`${modeResults.after.rawPath}\`; SHA-256 \`${modeResults.after.rawSha256}\`（gitignore対象）`,
    `- shared calibration profile SHA-256: \`${modeResults.after.calibration.sha256}\`（afterでN=${CALIBRATION_RUNS}/scenarioを作成し、beforeが再利用）`,
    `- before environment hash: \`${sha256(canonicalEnvironment(modeResults.before.environment))}\``,
    `- after environment hash: \`${sha256(canonicalEnvironment(modeResults.after.environment))}\``,
    `- comparison environment hash: \`${envHash}\``,
    "",
    "固定env（比較hash対象。SIM_EXPLORE_SPELLSだけは下記のbefore/after差分）:",
    "",
    "```text",
    canonicalEnvironment(environment).trimEnd(),
    "```",
    "",
    "再現コマンド:",
    "",
    "```sh",
    "node --check scratch/simulations/sim_issue_599_explore_spells.js",
    "ISSUE599_SMOKE=1 node scratch/simulations/sim_issue_599_explore_spells.js",
    "node scratch/simulations/sim_issue_599_explore_spells.js",
    "```",
    "",
    "## 既知の制約",
    "",
    "- `repelTurns > 0` のガードは `(!state.repelTurns || state.repelTurns <= 0) && Math.random() < ...` の短絡評価である。"
      + "そのためMASFEAL有効中は `Math.random()` 自体が呼ばれず、同一seedでもon/offの乱数消費列は完全一致しない。",
    "- これは呪文効果そのものに起因し避けられない。各条件は同じscenario/class/runIndexのseedを起点にした疑似ペアで、"
      + "開始時の装備・マップ生成条件は揃えるが、独立ストリームより分散が低い想定として扱う。",
    "- Fighter / Thiefに差が出た場合は、探索呪文を持たない職業が動いたことになるため、測定側のバグ疑いとして報告する。",
    "- 点推定がビット単位で一致した箇所は「差が無い」ではなく「効果が発生していない」と解釈した。",
    ""
  );
  return lines.join("\n");
}

function comparisonEnvironment(modeResults) {
  const environment = { ...modeResults.after.environment };
  environment.SIM_EXPLORE_SPELLS_AFTER = "on";
  environment.SIM_EXPLORE_SPELLS_BEFORE = "<unset>";
  environment.SIM_EXPLORE_SPELLS = "<mode-specific; see above>";
  environment.ISSUE599_COMPARISON = "before=unset vs after=on; same task keys and seed base";
  return environment;
}

async function main() {
  if (IS_CHILD) {
    await writeChildResult();
    return;
  }

  const resultDir = fileURLToPath(new URL("./results/", new URL("./", import.meta.url)));
  mkdirSync(resultDir, { recursive: true });
  const started = performance.now();
  const modeResults = {};
  modeResults.after = await runChild("after", resultDir);
  modeResults.after.rawRows = loadRows(modeResults.after);
  modeResults.before = await runChild("before", resultDir, modeResults.after.profilePath);
  modeResults.before.rawRows = loadRows(modeResults.before);
  const totalWallSeconds = (performance.now() - started) / 1000;
  const environment = comparisonEnvironment(modeResults);
  const envHash = sha256(canonicalEnvironment(environment));
  const provenance = resolveMeasurementProvenance({ fetchOriginMain: false });
  const summaryPath = join(resultDir, `${RESULT_BASENAME}.md`);
  const markdown = renderMarkdown({
    modeResults,
    environment,
    envHash,
    provenance,
    totalWallSeconds,
    summaryPath
  });
  const summaryText = `${markdown.trimEnd()}\n`;
  writeFileSync(summaryPath, summaryText);
  console.log(`summary: ${summaryPath}`);
  console.log(`summary SHA-256: ${sha256(summaryText)}`);
  console.log(`comparison env hash: ${envHash}`);
  console.log(`rows: before=${modeResults.before.rawRows.length}; after=${modeResults.after.rawRows.length}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
