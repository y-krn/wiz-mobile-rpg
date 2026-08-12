// sim-scope: run — Issue #275 phase 3 B5-B10 step-purpose decomposition
/* global console, process */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

import { resolveSimParallelism, runSimTasks } from "./sim_parallel.js";

const SMOKE = process.env.ISSUE275_PHASE3_SMOKE === "1";
const DEFAULT_RUNS_PER_CLASS = 500;
const DEFAULT_CALIBRATION_RUNS = 100;
const RUNS_PER_CLASS = SMOKE
  ? 2
  : Math.max(1, Number(process.env.SIM_RUNS || DEFAULT_RUNS_PER_CLASS));
const CALIBRATION_RUNS = SMOKE
  ? 1
  : Math.max(1, Number(process.env.SIM_CALIBRATION_RUNS || DEFAULT_CALIBRATION_RUNS));
const SEED = Number(process.env.SIM_SEED || 461) >>> 0;
// The owner decision forbids touching B15/B20. Sweep only the suspected bend.
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
const EXPLORATION_FACTOR = 1.4;
const CHEST_PICKUP_RATE = 0.7;
const R95 = 1.959963984540054;
const RESULT_STEM = process.env.SIM_RESULT_BASENAME ||
  (SMOKE ? "issue-275-phase3-steps-smoke" : "issue-275-phase3-steps");

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
    throw new Error("Issue #275 phase 3 omits SIM_PARALLEL");
  }
  if (process.env.SIM_MAP_CACHE_ENTRIES !== undefined) {
    throw new Error("Issue #275 phase 3 omits SIM_MAP_CACHE_ENTRIES");
  }
  for (const [key, value] of Object.entries(ENV_DEFAULTS)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
      continue;
    }
    if (process.env[key] !== value) {
      throw new Error(
        `Issue #275 phase 3 fixed env mismatch: ${key}=${process.env[key]} != ${value}`
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

const ROUTE_DIRECTIONS = Object.freeze([
  { dx: 0, dy: -1, dir: 0 },
  { dx: 1, dy: 0, dir: 1 },
  { dx: 0, dy: 1, dir: 2 },
  { dx: -1, dy: 0, dir: 3 }
]);

function routeKey(coord) {
  return `${coord.x},${coord.y}`;
}

function edgeKey(left, right) {
  const first = routeKey(left);
  const second = routeKey(right);
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}

function canTraverse(grid, current, direction) {
  const cell = grid[current.y]?.[current.x];
  const nextX = current.x + direction.dx;
  const nextY = current.y + direction.dy;
  const next = grid[nextY]?.[nextX];
  if (!cell || !next) return false;
  if (cell.walls?.[direction.dir]) return false;
  return !next.blockEnter?.[(direction.dir + 2) % 4];
}

function neighbors(grid, current) {
  return ROUTE_DIRECTIONS
    .filter(direction => canTraverse(grid, current, direction))
    .map(direction => ({
      x: current.x + direction.dx,
      y: current.y + direction.dy
    }));
}

function findCell(grid, predicate) {
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (predicate(grid[y][x])) return { x, y };
    }
  }
  return null;
}

function findShortestPath(grid, start, target) {
  if (!start || !target) return null;
  const startKey = routeKey(start);
  const targetKey = routeKey(target);
  const queue = [{ ...start }];
  const previous = new Map([[startKey, null]]);
  for (const current of queue) {
    const currentKey = routeKey(current);
    if (currentKey === targetKey) break;
    for (const next of neighbors(grid, current)) {
      const nextKey = routeKey(next);
      if (previous.has(nextKey)) continue;
      previous.set(nextKey, currentKey);
      queue.push(next);
    }
  }
  if (!previous.has(targetKey)) return null;
  return reconstructPath(previous, targetKey);
}

function reconstructPath(previous, targetKey) {
  const path = [];
  let cursor = targetKey;
  while (cursor !== null) {
    const [x, y] = cursor.split(",").map(Number);
    path.push({ x, y });
    cursor = previous.get(cursor) ?? null;
  }
  return path.reverse();
}

function findPathToKeySet(grid, start, targetKeys) {
  const startKey = routeKey(start);
  if (targetKeys.has(startKey)) return [start];
  const queue = [{ ...start }];
  const previous = new Map([[startKey, null]]);
  for (const current of queue) {
    for (const next of neighbors(grid, current)) {
      const nextKey = routeKey(next);
      if (previous.has(nextKey)) continue;
      previous.set(nextKey, routeKey(current));
      if (targetKeys.has(nextKey)) return reconstructPath(previous, nextKey);
      queue.push(next);
    }
  }
  return null;
}

function addPathEdges(target, path, excludedKeys) {
  if (!path) return;
  for (let index = 1; index < path.length; index++) {
    const left = path[index - 1];
    const right = path[index];
    if (excludedKeys.has(routeKey(left)) && excludedKeys.has(routeKey(right))) continue;
    target.add(edgeKey(left, right));
  }
}

function countNaturalNeighbors(grid, coord) {
  return neighbors(grid, coord).length;
}

function createEmptyMapPurpose() {
  return {
    stairsSearchSteps: 0,
    treasureBranchSteps: 0,
    backtrackDeadEndSteps: 0,
    modeledRouteSteps: 0,
    baselineSimulationSteps: 0,
    naturalTreasureBranchEdges: 0,
    naturalBacktrackDeadEndEdges: 0,
    criticalPathSteps: 0,
    chestCount: 0,
    chestOnCriticalPath: 0,
    chestOffCriticalPath: 0,
    deadEndCount: 0,
    reachableMapCells: 0,
    floorCount: 0,
    floorsWithNoStairsPath: 0
  };
}

/*
 * Structural attribution, not a claim that the sim has a human movement trace.
 *
 * 1. The natural shortest path from stairs-up to stairs-down is stair search.
 * 2. The existing floor budget is split into critical-path stair steps and
 *    an exploration surplus. The surplus is weighted by chest-branch edges
 *    (with the sim's 70% pickup rate) versus non-chest dead-end edges.
 * 3. Structural edge totals are retained as audit values, but the reported
 *    purpose steps partition only that existing synthetic floor budget.
 *
 * This produces a conservative map-shape decomposition from the exact floor
 * generated by generateRunFloor. The sim's synthetic step count is reported
 * separately because it uses EXPLORATION_FACTOR and scheduled chest pickups.
 */
function analyzeGeneratedFloor(generated) {
  const purpose = createEmptyMapPurpose();
  purpose.floorCount = 1;
  const grid = generated.grid;
  const start = findCell(grid, cell => cell.type === "stairs-up");
  const stairs = findCell(grid, cell => cell.type === "stairs-down");
  const stairsPath = findShortestPath(grid, start, stairs);
  const reachable = new Set();
  if (start) {
    const queue = [{ ...start }];
    reachable.add(routeKey(start));
    for (const current of queue) {
      for (const next of neighbors(grid, current)) {
        const nextKey = routeKey(next);
        if (reachable.has(nextKey)) continue;
        reachable.add(nextKey);
        queue.push(next);
      }
    }
  }
  purpose.reachableMapCells = reachable.size;
  if (!stairsPath) {
    purpose.floorsWithNoStairsPath = 1;
    return purpose;
  }

  const mainKeys = new Set(stairsPath.map(routeKey));
  purpose.criticalPathSteps = Math.max(0, stairsPath.length - 1);
  purpose.stairsSearchSteps = purpose.criticalPathSteps;
  purpose.baselineSimulationSteps = Math.max(
    1,
    Math.round(purpose.criticalPathSteps * EXPLORATION_FACTOR)
  );

  const chestCells = [];
  const deadEndCells = [];
  grid.forEach((row, y) => row.forEach((cell, x) => {
    const coord = { x, y };
    const key = routeKey(coord);
    if (!reachable.has(key)) return;
    if (cell.event === "chest") chestCells.push(coord);
    if (
      !mainKeys.has(key) &&
      cell.type !== "stairs-up" &&
      cell.type !== "stairs-down" &&
      countNaturalNeighbors(grid, coord) === 1
    ) {
      deadEndCells.push(coord);
    }
  }));
  purpose.chestCount = chestCells.length;
  purpose.chestOnCriticalPath = chestCells.filter(cell =>
    mainKeys.has(routeKey(cell))
  ).length;
  purpose.chestOffCriticalPath = purpose.chestCount - purpose.chestOnCriticalPath;
  purpose.deadEndCount = deadEndCells.length;

  const treasureEdges = new Set();
  const deadEndEdges = new Set();
  for (const chest of chestCells) {
    addPathEdges(
      treasureEdges,
      findPathToKeySet(grid, chest, mainKeys),
      mainKeys
    );
  }
  for (const deadEnd of deadEndCells) {
    addPathEdges(
      deadEndEdges,
      findPathToKeySet(grid, deadEnd, mainKeys),
      mainKeys
    );
  }
  const offPathEdges = new Set([...treasureEdges, ...deadEndEdges]);
  const deadEndOnlyEdges = new Set(
    [...deadEndEdges].filter(edge => !treasureEdges.has(edge))
  );
  purpose.naturalTreasureBranchEdges = treasureEdges.size;
  purpose.naturalBacktrackDeadEndEdges = offPathEdges.size + deadEndOnlyEdges.size;
  const explorationSurplus = Math.max(
    0,
    purpose.baselineSimulationSteps - purpose.stairsSearchSteps
  );
  const treasureWeight = treasureEdges.size * CHEST_PICKUP_RATE;
  const deadEndWeight = Math.max(0, deadEndEdges.size);
  const totalWeight = treasureWeight + deadEndWeight;
  purpose.treasureBranchSteps = totalWeight > 0
    ? explorationSurplus * treasureWeight / totalWeight
    : 0;
  purpose.backtrackDeadEndSteps = explorationSurplus - purpose.treasureBranchSteps;
  purpose.modeledRouteSteps = purpose.stairsSearchSteps +
    purpose.treasureBranchSteps + purpose.backtrackDeadEndSteps;
  return purpose;
}

function addMapPurpose(target, source) {
  for (const key of Object.keys(target)) target[key] += source[key] || 0;
}

function mapPurposeForRun(targetDepth, className, runIndex, enteredFloorCount = targetDepth - 1) {
  const runSeed = `${SEED}:issue275-phase3:${className}:${runIndex}`;
  const purpose = createEmptyMapPurpose();
  const floorsToAnalyze = Math.min(targetDepth - 1, Math.max(0, enteredFloorCount));
  for (let floor = 1; floor <= floorsToAnalyze; floor++) {
    const requestSharedMap = globalThis.__simSharedMapRequest;
    const generated = typeof requestSharedMap === "function"
      ? requestSharedMap({ runSeed, floor })
      : generateSharedRunFloor({ runSeed, floor });
    addMapPurpose(purpose, analyzeGeneratedFloor(generated));
  }
  return purpose;
}

function projectResult(result, task, mapPurpose) {
  const materialSources = result.materialSources || {};
  const rawSteps = result.steps || 0;
  const floorBudgetSteps = result.floorBudgetSteps || 0;
  const routePolicyExtraSteps = result.routePolicyExtraSteps || 0;
  const trapAvoidanceExtraSteps = result.trapAvoidanceExtraSteps || 0;
  const eliteExtraSteps = result.eliteExtraSteps || 0;
  const extraCampSteps = result.extraCampSteps || 0;
  const floorStepsBudget = floorBudgetSteps + routePolicyExtraSteps;
  const stepDecompositionTotal = floorStepsBudget +
    trapAvoidanceExtraSteps +
    eliteExtraSteps +
    extraCampSteps;
  const steps = Math.max(1, result.steps || 0);
  return {
    targetDepth: task.targetDepth,
    className: task.className,
    runIndex: task.runIndex,
    scenarioId: task.scenarioId,
    outcome: result.outcome,
    survived: Boolean(result.survived),
    died: Boolean(result.died),
    reachedFloor: result.reachedFloor,
    finalLevel: result.finalLevel,
    targetReached: result.reachedFloor >= task.targetDepth,
    materialAcquired: result.materialAcquired,
    materialFromChest: materialSources.chest || 0,
    materialFromCombat: materialSources.combat || 0,
    materialFromQuest: materialSources.quest || 0,
    bankedMaterials: result.bankedMaterials,
    materialEvPerTime: result.timeCost > 0
      ? result.bankedMaterials / result.timeCost
      : 0,
    materialAcquiredPerStep: result.materialAcquired / steps,
    materialFromChestPerStep: (materialSources.chest || 0) / steps,
    bankedMaterialsPerStep: result.bankedMaterials / steps,
    timeCost: result.timeCost,
    steps: result.steps,
    floorStepsBudget,
    floorBudgetSteps,
    routePolicyExtraSteps,
    trapAvoidanceExtraSteps,
    eliteExtraSteps,
    extraCampSteps,
    extraCampTimeCost: result.extraCampTimeCost || 0,
    extraCampRestCount: result.extraCampRestCount || 0,
    stepDecompositionResidual: rawSteps - stepDecompositionTotal,
    mapModelResidual: rawSteps - (mapPurpose.modeledRouteSteps || 0),
    staticBudgetModelGap: floorBudgetSteps - (mapPurpose.modeledRouteSteps || 0),
    combatRounds: result.combatRounds,
    chestsOpened: result.chestsOpened || 0,
    deathRate: Number(result.died),
    mapPurpose
  };
}

function getMapPurposeField(row, field) {
  return row.mapPurpose?.[field] ?? 0;
}

export function runIssue275Phase3Task(task, context) {
  const scenarioBase = getScenarioById(task.scenarioId);
  const scenario = { ...scenarioBase };
  resetSimulationRandom(hashSeed(
    `${SEED}:issue275-phase3:${task.scenarioId}:${task.className}:${task.runIndex}`
  ));
  const result = simulateRun({
    className: task.className,
    startFloor: 1,
    targetDepth: task.targetDepth,
    runIndex: task.runIndex,
    seriesId: "issue275-phase3",
    scoringProfile: context.scoringProfiles[task.scenarioId],
    scenario,
    workshop: scenario.workshop,
    collectDiagnostics: false
  });
  const enteredFloorCount = Array.isArray(result.specialRouteFloors)
    ? result.specialRouteFloors.length
    : task.targetDepth - 1;
  const mapPurpose = mapPurposeForRun(
    task.targetDepth,
    task.className,
    task.runIndex,
    enteredFloorCount
  );
  return projectResult(result, task, mapPurpose);
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

function summarizeRows(rows, targetDepth, className) {
  const selected = rows.filter(
    row => row.targetDepth === targetDepth &&
      (className === null || row.className === className)
  );
  const mapMean = field => meanStats(selected.map(row =>
    getMapPurposeField(row, field)
  ));
  return {
    targetDepth,
    className,
    runs: selected.length,
    materialAcquired: meanStats(selected.map(row => row.materialAcquired)),
    materialFromChest: meanStats(selected.map(row => row.materialFromChest)),
    materialFromCombat: meanStats(selected.map(row => row.materialFromCombat)),
    materialFromQuest: meanStats(selected.map(row => row.materialFromQuest)),
    bankedMaterials: meanStats(selected.map(row => row.bankedMaterials)),
    materialEvPerTime: meanStats(selected.map(row => row.materialEvPerTime)),
    materialAcquiredPerStep: meanStats(selected.map(row => row.materialAcquiredPerStep)),
    materialFromChestPerStep: meanStats(selected.map(row => row.materialFromChestPerStep)),
    bankedMaterialsPerStep: meanStats(selected.map(row => row.bankedMaterialsPerStep)),
    timeCost: meanStats(selected.map(row => row.timeCost)),
    steps: meanStats(selected.map(row => row.steps)),
    floorStepsBudget: meanStats(selected.map(row => row.floorStepsBudget)),
    floorBudgetSteps: meanStats(selected.map(row => row.floorBudgetSteps)),
    routePolicyExtraSteps: meanStats(selected.map(row => row.routePolicyExtraSteps)),
    trapAvoidanceExtraSteps: meanStats(selected.map(row => row.trapAvoidanceExtraSteps)),
    eliteExtraSteps: meanStats(selected.map(row => row.eliteExtraSteps)),
    extraCampSteps: meanStats(selected.map(row => row.extraCampSteps)),
    extraCampTimeCost: meanStats(selected.map(row => row.extraCampTimeCost)),
    extraCampRestCount: meanStats(selected.map(row => row.extraCampRestCount)),
    stepDecompositionResidual: meanStats(selected.map(row => row.stepDecompositionResidual)),
    mapModelResidual: meanStats(selected.map(row => row.mapModelResidual)),
    staticBudgetModelGap: meanStats(selected.map(row => row.staticBudgetModelGap)),
    combatRounds: meanStats(selected.map(row => row.combatRounds)),
    chestsOpened: meanStats(selected.map(row => row.chestsOpened)),
    stairsSearchSteps: mapMean("stairsSearchSteps"),
    treasureBranchSteps: mapMean("treasureBranchSteps"),
    backtrackDeadEndSteps: mapMean("backtrackDeadEndSteps"),
    modeledRouteSteps: mapMean("modeledRouteSteps"),
    baselineSimulationSteps: mapMean("baselineSimulationSteps"),
    naturalTreasureBranchEdges: mapMean("naturalTreasureBranchEdges"),
    naturalBacktrackDeadEndEdges: mapMean("naturalBacktrackDeadEndEdges"),
    criticalPathSteps: mapMean("criticalPathSteps"),
    chestCount: mapMean("chestCount"),
    chestOnCriticalPath: mapMean("chestOnCriticalPath"),
    chestOffCriticalPath: mapMean("chestOffCriticalPath"),
    deadEndCount: mapMean("deadEndCount"),
    reachableMapCells: mapMean("reachableMapCells"),
    survivalRate: wilson(selected.filter(row => row.survived).length, selected.length),
    deathRate: wilson(selected.filter(row => row.died).length, selected.length),
    targetReachedRate: wilson(selected.filter(row => row.targetReached).length, selected.length)
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

function adjacentPairs(rows, className, fromDepth) {
  const indexed = indexRows(rows, className);
  const toDepth = fromDepth + 1;
  const classes = className === null ? BASIC_CLASSES : [className];
  const pairs = [];
  for (const currentClass of classes) {
    for (let runIndex = 0; runIndex < RUNS_PER_CLASS; runIndex++) {
      const from = indexed.get(`${currentClass}:${runIndex}:${fromDepth}`);
      const to = indexed.get(`${currentClass}:${runIndex}:${toDepth}`);
      if (from && to) pairs.push({ from, to });
    }
  }
  return pairs;
}

function pairedDepthDelta(rows, className, fromDepth, toDepth, selector) {
  const indexed = indexRows(rows, className);
  const classes = className === null ? BASIC_CLASSES : [className];
  const deltas = [];
  for (const currentClass of classes) {
    for (let runIndex = 0; runIndex < RUNS_PER_CLASS; runIndex++) {
      const from = indexed.get(`${currentClass}:${runIndex}:${fromDepth}`);
      const to = indexed.get(`${currentClass}:${runIndex}:${toDepth}`);
      if (from && to) deltas.push(selector(to) - selector(from));
    }
  }
  return meanStats(deltas);
}

function pairedDelta(rows, className, fromDepth, selector) {
  return meanStats(adjacentPairs(rows, className, fromDepth).map(({ from, to }) =>
    selector(to) - selector(from)
  ));
}

function buildGroup(rows, className) {
  const byDepth = Object.fromEntries(
    TARGET_DEPTHS.map(targetDepth => [
      targetDepth,
      summarizeRows(rows, targetDepth, className)
    ])
  );
  const adjacent = Object.fromEntries(
    TARGET_DEPTHS.slice(0, -1).map(fromDepth => [
      `${fromDepth}->${fromDepth + 1}`,
      {
        steps: pairedDelta(rows, className, fromDepth, row => row.steps),
        floorStepsBudget: pairedDelta(
          rows,
          className,
          fromDepth,
          row => row.floorStepsBudget
        ),
        floorBudgetSteps: pairedDelta(
          rows,
          className,
          fromDepth,
          row => row.floorBudgetSteps
        ),
        routePolicyExtraSteps: pairedDelta(
          rows,
          className,
          fromDepth,
          row => row.routePolicyExtraSteps
        ),
        trapAvoidanceExtraSteps: pairedDelta(
          rows,
          className,
          fromDepth,
          row => row.trapAvoidanceExtraSteps
        ),
        eliteExtraSteps: pairedDelta(
          rows,
          className,
          fromDepth,
          row => row.eliteExtraSteps
        ),
        extraCampSteps: pairedDelta(
          rows,
          className,
          fromDepth,
          row => row.extraCampSteps
        ),
        stepDecompositionResidual: pairedDelta(
          rows,
          className,
          fromDepth,
          row => row.stepDecompositionResidual
        ),
        mapModelResidual: pairedDelta(
          rows,
          className,
          fromDepth,
          row => row.mapModelResidual
        ),
        staticBudgetModelGap: pairedDelta(
          rows,
          className,
          fromDepth,
          row => row.staticBudgetModelGap
        ),
        stairsSearchSteps: pairedDelta(rows, className, fromDepth, row =>
          getMapPurposeField(row, "stairsSearchSteps")
        ),
        treasureBranchSteps: pairedDelta(rows, className, fromDepth, row =>
          getMapPurposeField(row, "treasureBranchSteps")
        ),
        backtrackDeadEndSteps: pairedDelta(rows, className, fromDepth, row =>
          getMapPurposeField(row, "backtrackDeadEndSteps")
        ),
        materialAcquiredPerStep: pairedDelta(
          rows,
          className,
          fromDepth,
          row => row.materialAcquiredPerStep
        ),
        materialFromChestPerStep: pairedDelta(
          rows,
          className,
          fromDepth,
          row => row.materialFromChestPerStep
        ),
        materialEvPerTime: pairedDelta(
          rows,
          className,
          fromDepth,
          row => row.materialEvPerTime
        )
      }
    ])
  );
  return { className, byDepth, adjacent };
}

function classifyDelta(stat) {
  if (!stat || stat.mean === null) return "未観測";
  if (stat.high < 0) return "統計的低下";
  if (stat.low > 0) return "統計的上昇";
  return "CI重複";
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

function formatDelta(stat, digits = 2) {
  return `${formatMean(stat, digits)} (${classifyDelta(stat)})`;
}

function formatRatio(numerator, denominator, digits = 1) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return "未算出";
  }
  return `${(numerator / denominator * 100).toFixed(digits)}%`;
}

function findSweepBest(byDepth, field) {
  return TARGET_DEPTHS.reduce((best, targetDepth) => {
    const candidate = byDepth[targetDepth][field];
    if (!candidate || candidate.mean === null) return best;
    return !best || candidate.mean > best.stat.mean
      ? { targetDepth, stat: candidate }
      : best;
  }, null);
}

function buildMarkdown(summary) {
  const all = summary.groups.all;
  const bestEv = findSweepBest(all.byDepth, "materialEvPerTime");
  const bestStep = findSweepBest(all.byDepth, "materialAcquiredPerStep");
  const paired = selector => pairedDepthDelta(summary.rowsForMarkdown, null, 5, 10, selector);
  const actualStepDelta = paired(row => row.steps);
  const floorStepsBudgetDelta = paired(row => row.floorStepsBudget);
  const mapModelDelta = paired(row => getMapPurposeField(row, "modeledRouteSteps"));
  const mapModelResidualDelta = paired(row => row.mapModelResidual);
  const staticBudgetModelGapDelta = paired(row => row.staticBudgetModelGap);
  const trapDelta = paired(row => row.trapAvoidanceExtraSteps);
  const routePolicyDelta = paired(row => row.routePolicyExtraSteps);
  const campTimeCost = all.byDepth[10].extraCampTimeCost;
  const campStatus = campTimeCost.mean === 0
    ? "0（全run）"
    : formatMean(campTimeCost);
  const trapShareOfUnexplained = formatRatio(
    trapDelta.mean,
    mapModelResidualDelta.mean
  );
  const lines = [
    "# Issue #275 フェーズ3 歩数用途分解測定",
    "",
    "## 結論",
    "",
    `- B5〜B10を掃引。全職合算の素材EV/時間最大点: ${bestEv ? `B${bestEv.targetDepth}` : "未観測"}。素材/歩最大点: ${bestStep ? `B${bestStep.targetDepth}` : "未観測"}。B15/B20は生成・測定していない。`,
    `- B5→B10の実シミュレーター歩数差: ${formatDelta(actualStepDelta)}。隣接区間の折れ点は下記掃引に記録。`,
    `- 同差の実測内訳: floorSteps予算 ${formatDelta(floorStepsBudgetDelta)}（静的floor予算 ${formatDelta(paired(row => row.floorBudgetSteps))} + routePlan追加 ${formatDelta(routePolicyDelta)}）、予算外の罠回避 ${formatDelta(trapDelta)} + elite ${formatDelta(paired(row => row.eliteExtraSteps))} + camp ${formatDelta(paired(row => row.extraCampSteps))}。`,
    `- 既存map用途モデル差 ${formatDelta(mapModelDelta)}。実歩数との差 ${formatDelta(mapModelResidualDelta)}。内訳は routePlan追加 ${formatDelta(paired(row => row.routePolicyExtraSteps))} + 罠回避 ${formatDelta(trapDelta)} + elite ${formatDelta(paired(row => row.eliteExtraSteps))} + camp ${formatDelta(paired(row => row.extraCampSteps))} + 静的floor予算−mapモデル ${formatDelta(staticBudgetModelGapDelta)}。罠回避差は未説明分の${trapShareOfUnexplained}（点推定）。`,
    `- B5/B10の1歩あたり素材収入: 総素材 ${formatMean(all.byDepth[5].materialAcquiredPerStep, 4)} → ${formatMean(all.byDepth[10].materialAcquiredPerStep, 4)}、宝箱素材 ${formatMean(all.byDepth[5].materialFromChestPerStep, 4)} → ${formatMean(all.byDepth[10].materialFromChestPerStep, 4)}、bank素材 ${formatMean(all.byDepth[5].bankedMaterialsPerStep, 4)} → ${formatMean(all.byDepth[10].bankedMaterialsPerStep, 4)}。`,
    `- map用途モデル B5→B10直接差: 階段探索 ${formatDelta(pairedDepthDelta(summary.rowsForMarkdown, null, 5, 10, row => getMapPurposeField(row, "stairsSearchSteps")))}、宝箱・分岐 ${formatDelta(pairedDepthDelta(summary.rowsForMarkdown, null, 5, 10, row => getMapPurposeField(row, "treasureBranchSteps")))}、引き返し・行き止まり ${formatDelta(pairedDepthDelta(summary.rowsForMarkdown, null, 5, 10, row => getMapPurposeField(row, "backtrackDeadEndSteps")))}。`,
    `- サニティ: floorSteps予算（static floor予算 + routePlan追加）+ 罠回避 + elite + camp と result.steps の残差 ${formatDelta(paired(row => row.stepDecompositionResidual))}（期待値0）。`,
    `- camp寄与: extraCampTimeCost ${campStatus}、extraCampSteps ${formatMean(all.byDepth[10].extraCampSteps)}。既定条件では0。`,
    `- 罠回避追加歩数は報酬非依存の「彷徨う歩数」だが、差は未説明分の${trapShareOfUnexplained}。深度差の支配要因は routePlan追加歩数。`,
    "- これは候補what-ifではなく、現行マップ形状の観測。報酬量・src・design canonは変更していない。",
    "",
    "## 深度掃引（全職合算）",
    ""
  ];
  for (const targetDepth of TARGET_DEPTHS) {
    const depth = all.byDepth[targetDepth];
    lines.push(
      `- B${targetDepth}: 実歩数 ${formatMean(depth.steps)}、時間 ${formatMean(depth.timeCost)}、EV/時間 ${formatMean(depth.materialEvPerTime, 4)}。`,
      `  - 1歩収入: 総素材 ${formatMean(depth.materialAcquiredPerStep, 4)}、宝箱 ${formatMean(depth.materialFromChestPerStep, 4)}、bank ${formatMean(depth.bankedMaterialsPerStep, 4)}。`,
      `  - 実測内訳: floorSteps予算 ${formatMean(depth.floorStepsBudget)}（静的floor ${formatMean(depth.floorBudgetSteps)} + routePlan追加 ${formatMean(depth.routePolicyExtraSteps)}）、罠回避 ${formatMean(depth.trapAvoidanceExtraSteps)}、elite ${formatMean(depth.eliteExtraSteps)}、camp ${formatMean(depth.extraCampSteps)}、分解残差 ${formatMean(depth.stepDecompositionResidual)}。`,
      `  - map用途: 階段探索 ${formatMean(depth.stairsSearchSteps)}、宝箱・分岐 ${formatMean(depth.treasureBranchSteps)}、引き返し・行き止まり ${formatMean(depth.backtrackDeadEndSteps)}、構造モデル合計 ${formatMean(depth.modeledRouteSteps)}。`,
      `  - 実歩数−静的mapモデル残差 ${formatMean(depth.mapModelResidual)}。`,
      `  - map補助: critical path ${formatMean(depth.criticalPathSteps)}、宝箱 ${formatMean(depth.chestCount)}（主経路上 ${formatMean(depth.chestOnCriticalPath)}）、非宝箱行き止まり ${formatMean(depth.deadEndCount)}、構造辺 宝箱 ${formatMean(depth.naturalTreasureBranchEdges)} / 引き返し ${formatMean(depth.naturalBacktrackDeadEndEdges)}。`,
      `  - 死亡率 ${formatPercent(depth.deathRate)}、目標到達率 ${formatPercent(depth.targetReachedRate)}。`,
      ""
    );
  }
  lines.push(
    "## B5→B10 区間掃引の折れ点",
    "",
    "- 各行は隣接 target depth の同一 `(class,runIndex)` paired差。CI上限<0を「統計的低下」、CI下限>0を「統計的上昇」とした。",
    ""
  );
  for (const [interval, values] of Object.entries(all.adjacent)) {
    lines.push(
      `- ${interval}: 実歩数 ${formatDelta(values.steps)}、floorSteps予算 ${formatDelta(values.floorStepsBudget)}（静的floor ${formatDelta(values.floorBudgetSteps)} + routePlan ${formatDelta(values.routePolicyExtraSteps)})、罠回避 ${formatDelta(values.trapAvoidanceExtraSteps)}、elite ${formatDelta(values.eliteExtraSteps)}、camp ${formatDelta(values.extraCampSteps)}。`,
      `  - 分解残差 ${formatDelta(values.stepDecompositionResidual)}。map用途: 階段探索 ${formatDelta(values.stairsSearchSteps)}、宝箱・分岐 ${formatDelta(values.treasureBranchSteps)}、引き返し・行き止まり ${formatDelta(values.backtrackDeadEndSteps)}。`,
      `  - 1歩収入差: 総素材 ${formatDelta(values.materialAcquiredPerStep, 4)}、宝箱 ${formatDelta(values.materialFromChestPerStep, 4)}、EV/時間 ${formatDelta(values.materialEvPerTime, 4)}。`,
      ""
    );
  }
  lines.push("## 職業別 B5/B10", "");
  for (const className of BASIC_CLASSES) {
    const group = summary.groups[className];
    lines.push(
      `- ${className}: EV/時間 B5 ${formatMean(group.byDepth[5].materialEvPerTime, 4)} → B10 ${formatMean(group.byDepth[10].materialEvPerTime, 4)}、歩数 ${formatMean(group.byDepth[5].steps)} → ${formatMean(group.byDepth[10].steps)}。`,
      `  - 1歩総素材 ${formatMean(group.byDepth[5].materialAcquiredPerStep, 4)} → ${formatMean(group.byDepth[10].materialAcquiredPerStep, 4)}、map用途差: 階段 ${formatDelta(group.adjacent["5->6"]?.stairsSearchSteps)} / 宝箱・分岐 ${formatDelta(group.adjacent["5->6"]?.treasureBranchSteps)} / 引き返し・行き止まり ${formatDelta(group.adjacent["5->6"]?.backtrackDeadEndSteps)}。`,
      ""
    );
  }
  lines.push(
    "## 方法・制約",
    "",
    `- seed=${summary.seed}、B5/B6/B7/B8/B9/B10、各職 N=${summary.runsPerClass}、各深度全職合算 N=${summary.runsPerClass * BASIC_CLASSES.length}、calibration N=${summary.calibrationRuns}。`,
    `- 工房分布=${WORKSHOP_DISTRIBUTION.map(([id, count]) => `${id}:${count}/${WORKSHOP_TOTAL}`).join(", ")}。`,
    "- `generateRunFloor`（`src/run_map_generator.js`）を通った生成物を使用。simulation本体も同じ実src map/reward/combat経路。報酬量・drop率・撤退・死亡bank率のoverrideなし。",
    "- 既存map用途モデルは人間の移動traceではなく、各実訪問floorの `criticalPath`=階段探索と、静的 `round(criticalPath×1.4)` floor予算の余剰を、主経路外の宝箱分岐辺×拾得率0.7 / 非宝箱行き止まり辺の比で按分した代理モデル。",
    "- 実測歩数は `floorSteps`予算（静的 `round(criticalPath×1.4)` と `createFloorRoutePlan` のroute延長）+ 罠回避 + elite route plan + camp延長コストへ分解。map用途モデルは静的構造説明として残すが、深度差の結論は実測分解を主に採用。",
    "- routePlan追加は `createFloorRoutePlan` のspecial cell（boss/midboss）経路が `floorSteps` を `max(static, ceil(routeDistance×1.4))` へ延長した実測分。",
    "- 1歩あたり収入はrun単位の `素材 / steps` の平均。括弧内CIは正規近似95% CI。死亡・到達率はWilson 95% CI。",
    "- N<30のセルは判定に使わず「未確定」と明記。今回の主集計セルはN>=30。",
    "- `SIM_PARALLEL` / `SIM_MAP_CACHE_ENTRIES`は未指定。runtime既定値を使用。",
    "- B15/B20は対象外。候補what-ifは未実施。次にwhat-ifを測る場合もsim overrideだけを使い、srcを変更しない。",
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
    "node --check scratch/sim_depth_material_ev.js",
    "node --check scratch/measure_issue_275_phase3_steps.js",
    "ISSUE275_PHASE3_SMOKE=1 node scratch/measure_issue_275_phase3_steps.js",
    "node scratch/measure_issue_275_phase3_steps.js",
    "```",
    "",
    "## プレイヤー影響",
    "",
    "- 本フェーズは観測のみ。ゲームコード・balance値・設計canonへの変更なし。プレイヤー影響なし。"
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
    exportName: "runIssue275Phase3Task",
    runTask: runIssue275Phase3Task,
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
    ISSUE275_PHASE3_MODE: SMOKE ? "smoke" : "measurement",
    ISSUE275_PHASE3_TARGET_DEPTHS: TARGET_DEPTHS.join(","),
    ISSUE275_PHASE3_CLASSES: BASIC_CLASSES.join(","),
    ISSUE275_PHASE3_WORKSHOP_DISTRIBUTION: WORKSHOP_DISTRIBUTION
      .map(([id, count]) => `${id}:${count}/${WORKSHOP_TOTAL}`)
      .join(","),
    MAP_GENERATOR: "src/run_map_generator.js:generateRunFloor",
    MAP_PURPOSE_MODEL: "critical-path+synthetic-surplus-weighted-by-offpath-edges",
    REWARD_OVERRIDE: "none",
    SIM_PARALLEL: "<omitted; runtime default>",
    SIM_MAP_CACHE_ENTRIES: "<omitted; runtime default 1024>",
    SIM_DIAGNOSTICS: "off"
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
    ["all", buildGroup(rows, null)],
    ...BASIC_CLASSES.map(className => [className, buildGroup(rows, className)])
  ]);
  const summaryWithoutHash = {
    issue: 275,
    phase: "phase3-step-purpose",
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
    reproductionCommand: "node scratch/measure_issue_275_phase3_steps.js"
  };
  const summaryPreHash = `${JSON.stringify(summaryWithoutHash, null, 2)}\n`;
  const summarySha256 = sha256(summaryPreHash);
  const summary = {
    ...summaryWithoutHash,
    summarySha256,
    rowsForMarkdown: rows
  };
  const resultDir = new URL("./results/", new URL("./", import.meta.url));
  mkdirSync(resultDir, { recursive: true });
  writeFileSync(new URL(`${RESULT_STEM}.raw.jsonl`, resultDir), rawText);
  writeFileSync(
    new URL(`${RESULT_STEM}.json`, resultDir),
    `${JSON.stringify(summaryWithoutHash, null, 2)}\n`
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
