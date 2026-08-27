// sim-scope: run — Issue #713 real-run trap calibration and progression sweep
/* global console, process */

import "./simulation_preflight.js";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

import {
  calibrateCoreScoringProfile,
  generateSharedRunFloor,
  getScenarioById,
  resetSimulationRandom,
  simulateRun,
  SIM_CLASSES
} from "./sim_depth_material_ev.js";
import { resolveSimParallelism, runSimTasks } from "./sim_parallel.js";

const RUNS_PER_CLASS = Math.max(1, Number(process.env.SIM_RUNS || 500));
const CALIBRATION_RUNS = Math.max(1, Number(process.env.SIM_CALIBRATION_RUNS || 100));
const SIM_SEED = Number(process.env.SIM_SEED || 231) >>> 0;
const TARGET_DEPTH = 21;
const SERIES_ID = "issue612-exp-pace";
const CLASSES = Object.freeze(["Fighter", "Thief", "Priest", "Mage"]);
const WORKSHOP_DISTRIBUTION = Object.freeze([
  ["workshop-empty", 30],
  ["workshop-stats", 74],
  ["workshop-gear", 69],
  ["workshop-blood-wand", 216],
  ["workshop-blood-wand-spells", 47],
  ["workshop-complete", 764]
]);
const SCENARIO_IDS = WORKSHOP_DISTRIBUTION.map(([id]) => id);
const SOURCE_ADJUSTED = process.env.ISSUE713_SOURCE_ADJUSTED === "1";
const CASES = Object.freeze(SOURCE_ADJUSTED ? [
  { id: "before-control", label: "fresh before control: apt max 90", trapOverride: { trapBonus: { className: "Thief", maxApt: 90 } } },
  { id: "after-source", label: "after source: apt max 100", trapOverride: null },
  { id: "equipment-off", label: "paired equipment value control: trapBonus equipment off", trapOverride: { trapBonus: { className: "Thief", equipmentScale: 0 } } }
] : [
  { id: "before", label: "before (current source)", trapOverride: null },
  { id: "max-95", label: "max axis: apt max 95", trapOverride: { trapBonus: { className: "Thief", maxApt: 95 } } },
  { id: "max-100", label: "max axis: apt max 100", trapOverride: { trapBonus: { className: "Thief", maxApt: 100 } } },
  { id: "base-75", label: "base axis: apt base 75", trapOverride: { trapBonus: { className: "Thief", baseApt: 75 } } },
  { id: "base-70", label: "base axis: apt base 70", trapOverride: { trapBonus: { className: "Thief", baseApt: 70 } } },
  { id: "passive-10", label: "trapBonus axis: Thief passive 10", trapOverride: { trapBonus: { className: "Thief", passiveApt: 10 } } },
  { id: "passive-5", label: "trapBonus axis: Thief passive 5", trapOverride: { trapBonus: { className: "Thief", passiveApt: 5 } } },
  { id: "equipment-off", label: "paired equipment value control: trapBonus equipment off", trapOverride: { trapBonus: { className: "Thief", equipmentScale: 0 } } }
]);
export { generateSharedRunFloor };
const RAW_PATH = "evidence/results/issue-713-trap-calibration.raw.jsonl";
const SUMMARY_PATH = "evidence/results/issue-713-trap-calibration.md";

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
  const total = WORKSHOP_DISTRIBUTION.reduce((sum, [, weight]) => sum + weight, 0);
  const position = ((runIndex * 37) % RUNS_PER_CLASS + 0.5) / RUNS_PER_CLASS * total;
  let cumulative = 0;
  for (const [scenarioId, weight] of WORKSHOP_DISTRIBUTION) {
    cumulative += weight;
    if (position < cumulative) return scenarioId;
  }
  return WORKSHOP_DISTRIBUTION.at(-1)[0];
}

function makeScenario(scenarioId, trapOverride) {
  const base = getScenarioById(scenarioId);
  return trapOverride
    ? { ...base, trapOverride }
    : base;
}

function makeTasks() {
  return CLASSES.flatMap(className =>
    Array.from({ length: RUNS_PER_CLASS }, (_, runIndex) => {
      const scenarioId = scenarioForRun(runIndex);
      return {
        className,
        runIndex,
        scenarioId,
        randomSequenceId: `${scenarioId}:${className}:${runIndex}`
      };
    })
  );
}

function compactResult(task, result, caseId) {
  return {
    caseId,
    className: task.className,
    runIndex: task.runIndex,
    scenarioId: task.scenarioId,
    randomSequenceId: task.randomSequenceId,
    reachedFloor: result.reachedFloor,
    survived: Boolean(result.survived),
    died: Boolean(result.died),
    deathFloor: result.deathFloor,
    b5Entrant: Boolean(result.b5Entrant),
    finalLevel: result.finalLevel,
    trapDisarmObservations: result.trapDisarmObservations
  };
}

export function runIssue713Task(task, context) {
  const scenario = makeScenario(task.scenarioId, context.trapOverride);
  resetSimulationRandom(hashSeed(`${SIM_SEED}:issue612:${task.randomSequenceId}`));
  const result = simulateRun({
    className: task.className,
    startFloor: 1,
    targetDepth: TARGET_DEPTH,
    runIndex: task.runIndex,
    seriesId: SERIES_ID,
    scoringProfile: context.scoringProfiles[task.scenarioId],
    scenario,
    workshop: scenario.workshop,
    collectDiagnostics: false
  });
  return compactResult(task, result, context.caseId);
}

function calibrateProfiles(trapOverride) {
  const scoringProfiles = {};
  for (const scenarioId of SCENARIO_IDS) {
    const scenario = makeScenario(scenarioId, trapOverride);
    resetSimulationRandom(SIM_SEED);
    scoringProfiles[scenarioId] = calibrateCoreScoringProfile(
      CALIBRATION_RUNS,
      scenario,
      "powder",
      scenario.workshop
    );
  }
  return scoringProfiles;
}

function aggregateCase(rows) {
  const byClass = Object.fromEntries(CLASSES.map(className => [className, {
    runs: 0,
    reached: 0,
    b5Entrants: 0,
    b5Breakthroughs: 0,
    b10Entrants: 0,
    b10Breakthroughs: 0,
    cap: { total: 0, hits: 0, byFloor: {}, byLevel: {} },
    equipment: { observations: 0, points: 0, active: 0 }
  }]));
  for (const row of rows) {
    const target = byClass[row.className];
    target.runs++;
    target.reached += row.reachedFloor;
    if (row.b5Entrant) {
      target.b5Entrants++;
      target.b5Breakthroughs += Number(row.reachedFloor > 5);
    }
    if (row.reachedFloor >= 10) {
      target.b10Entrants++;
      target.b10Breakthroughs += Number(row.reachedFloor > 10);
    }
    for (const observation of row.trapDisarmObservations || []) {
      const cap = target.cap;
      cap.total++;
      cap.hits += Number(observation.capBinding);
      const floor = String(observation.floor);
      const level = String(observation.level);
      cap.byFloor[floor] ||= { total: 0, hits: 0 };
      cap.byFloor[floor].total++;
      cap.byFloor[floor].hits += Number(observation.capBinding);
      cap.byLevel[level] ||= { total: 0, hits: 0 };
      cap.byLevel[level].total++;
      cap.byLevel[level].hits += Number(observation.capBinding);
      target.equipment.observations++;
      target.equipment.points += observation.equipmentTrapBonus;
      target.equipment.active += Number(observation.equipmentTrapBonus > 0 && !observation.capBinding);
    }
  }
  return Object.fromEntries(Object.entries(byClass).map(([className, value]) => [className, {
    runs: value.runs,
    averageReachedFloor: value.reached / value.runs,
    b5EntrantRate: value.b5Entrants / value.runs,
    b5BreakthroughRate: value.b5Breakthroughs / Math.max(1, value.b5Entrants),
    b10EntrantRate: value.b10Entrants / value.runs,
    b10BreakthroughRate: value.b10Breakthroughs / Math.max(1, value.b10Entrants),
    capBindingRate: value.cap.hits / Math.max(1, value.cap.total),
    capBinding: value.cap,
    averageEquipmentTrapBonusPoints: value.equipment.points / Math.max(1, value.equipment.observations),
    equipmentActiveRate: value.equipment.active / Math.max(1, value.equipment.observations)
  }]));
}

function renderRate(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function renderSummary({ sourceCommit, baseCommit, rawSha256, cases }) {
  const lines = [
    "# Issue #713 trapBonus calibration",
    "",
    `- source commit: \`${sourceCommit}\``,
    `- base/origin-main: \`${baseCommit}\``,
    `- real-run path: \`scratch/simulations/sim_issue_713_trap_calibration.js\` → \`simulateRun\` → \`generateRunFloor\``,
    `- conditions: N=${RUNS_PER_CLASS}/class, SIM_SEED=${SIM_SEED}, SIM_CALIBRATION_RUNS=${CALIBRATION_RUNS}, SIM_PARALLEL=omitted`,
    `- raw JSONL SHA-256: \`${rawSha256}\``,
    "",
    "## Four-class progression and gates",
    "",
    "| case | Fighter avg / B5→B6 / B10→B11 | Thief avg / B5→B6 / B10→B11 | Priest avg / B5→B6 / B10→B11 | Mage avg / B5→B6 / B10→B11 |",
    "| --- | --- | --- | --- | --- |",
    ...cases.map(({ id, label, summary }) => `| ${id} (${label}) | ${summary.Fighter.averageReachedFloor.toFixed(4)} / ${renderRate(summary.Fighter.b5BreakthroughRate)} / ${renderRate(summary.Fighter.b10BreakthroughRate)} | ${summary.Thief.averageReachedFloor.toFixed(4)} / ${renderRate(summary.Thief.b5BreakthroughRate)} / ${renderRate(summary.Thief.b10BreakthroughRate)} | ${summary.Priest.averageReachedFloor.toFixed(4)} / ${renderRate(summary.Priest.b5BreakthroughRate)} / ${renderRate(summary.Priest.b10BreakthroughRate)} | ${summary.Mage.averageReachedFloor.toFixed(4)} / ${renderRate(summary.Mage.b5BreakthroughRate)} / ${renderRate(summary.Mage.b10BreakthroughRate)} |`),
    "",
    "## Cap binding and equipment value",
    "",
    "`capBindingRate` is measured floor-trap plan observations with the uncapped disarm rate at or above the applicable max. Equipment active rate is the share of observations where measured equipment trapBonus points were positive and capBinding was false.",
    "",
    "| case | class | cap binding | observations | floor distribution (binding/total) | level distribution (binding/total) | avg equipment points | equipment active |",
    "| --- | --- | ---: | ---: | --- | --- | ---: | ---: |",
    ...cases.flatMap(({ id, summary }) => CLASSES.map(className => {
      const value = summary[className];
      const floor = Object.entries(value.capBinding.byFloor).sort((a, b) => Number(a[0]) - Number(b[0])).map(([key, item]) => `B${key}:${item.hits}/${item.total}`).join(", ");
      const level = Object.entries(value.capBinding.byLevel).sort((a, b) => Number(a[0]) - Number(b[0])).map(([key, item]) => `L${key}:${item.hits}/${item.total}`).join(", ");
      return `| ${id} | ${className} | ${renderRate(value.capBindingRate)} | ${value.capBinding.total} | ${floor || "—"} | ${level || "—"} | ${value.averageEquipmentTrapBonusPoints.toFixed(2)} | ${renderRate(value.equipmentActiveRate)} |`;
    })),
    "",
    "## Reproduction",
    "",
    "```sh",
    "SIM_RUNS=500 SIM_SEED=231 SIM_CALIBRATION_RUNS=100 env -u SIM_PARALLEL node scratch/simulations/sim_issue_713_trap_calibration.js",
    "```",
    "",
    "Modeled: current real map generation, trap policy, TOWN_PORTAL retreat, status-cure EV path, complete equipment scoring, and real round/reward/level-up flow. Omitted: no player UI interaction and no optional merchant purchase outside the existing sim policy. Calibration overrides are simulation-only and change one requested axis per case."
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  if (process.env.SIM_PARALLEL !== undefined) {
    throw new Error("SIM_PARALLEL must be omitted for Issue #713 measurement");
  }
  const sourceCommit = process.env.CODEX_SOURCE_SHA || "unknown";
  const baseCommit = process.env.CODEX_BASE_SHA || "unknown";
  const tasks = makeTasks();
  const cases = [];
  for (const candidate of CASES) {
    const started = performance.now();
    const scoringProfiles = calibrateProfiles(candidate.trapOverride);
    const rows = await runSimTasks({
      moduleUrl: import.meta.url,
      exportName: "runIssue713Task",
      runTask: runIssue713Task,
      tasks,
      context: {
        caseId: candidate.id,
        trapOverride: candidate.trapOverride,
        scoringProfiles
      },
      mapGeneratorExportName: "generateSharedRunFloor"
    });
    if (rows.length !== tasks.length) throw new Error(`${candidate.id}: row count ${rows.length}/${tasks.length}`);
    cases.push({
      id: candidate.id,
      label: candidate.label,
      trapOverride: candidate.trapOverride,
      summary: aggregateCase(rows),
      rows,
      wallSeconds: (performance.now() - started) / 1000,
      resolvedParallelism: resolveSimParallelism(tasks.length)
    });
  }
  const rawText = `${cases.flatMap(item => item.rows.map(row => JSON.stringify({ sourceCommit, baseCommit, ...row }))).join("\n")}\n`;
  mkdirSync("evidence/results", { recursive: true });
  writeFileSync(RAW_PATH, rawText);
  const summary = renderSummary({
    sourceCommit,
    baseCommit,
    rawSha256: sha256(rawText),
    cases
  });
  writeFileSync(SUMMARY_PATH, summary);
  console.log(`summary: ${SUMMARY_PATH}`);
  console.log(`raw JSONL: ${RAW_PATH}`);
  console.log(`raw SHA-256: ${sha256(rawText)}`);
  console.log(JSON.stringify({ sourceCommit, baseCommit, cases: cases.map(item => ({ id: item.id, summary: item.summary, wallSeconds: item.wallSeconds, resolvedParallelism: item.resolvedParallelism })) }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
