import { FLOOR_TEMPLATES } from "../src/data/floor_templates.js";
import { getBiomeForFloor } from "../src/data/biomes.js";
import { generateRunFloor } from "../src/run_map_generator.js";

const SEEDS_PER_FLOOR = 10;
const MAX_FLOOR = 30;
const DIRECTIONS = [
  { dx: 0, dy: -1, dir: 0 },
  { dx: 1, dy: 0, dir: 1 },
  { dx: 0, dy: 1, dir: 2 },
  { dx: -1, dy: 0, dir: 3 }
];
// 24/27/30 map baseline with run-floor-template-{floor}-{seed}; limits allow roughly 20% shape variance.
const SHAPE_LIMITS = Object.freeze({
  shallow: { minimumMeanDeadEnds: 13, maximumMeanTightUTurns: 23 },
  middle: { minimumMeanDeadEnds: 18, maximumMeanTightUTurns: 30 },
  deep: { minimumMeanDeadEnds: 22, maximumMeanTightUTurns: 35 }
});
const MINIMUM_ONE_WAY_PLACEMENT_RATE = 0.75;
const failures = [];
const summaries = new Map(FLOOR_TEMPLATES.map(template => [template.id, {
  generated: 0,
  attempts: 0,
  minimumPath: Infinity,
  maximumPath: -Infinity,
  totalPath: 0,
  totalReachableCells: 0,
  totalDeadEnds: 0,
  totalTightUTurns: 0,
  placedOneWays: 0,
  requestedOneWays: 0
}]));

function canTraverse(cell, next, dir) {
  const canReveal = cell.secretDoor?.[dir] || cell.sealedGate?.[dir];
  return (!cell.walls[dir] || canReveal) && !next.blockEnter?.[(dir + 2) % 4];
}

function getReachableKeys(grid, start) {
  const queue = [start];
  const seen = new Set([`${start.x},${start.y}`]);
  for (const pos of queue) {
    const cell = grid[pos.y][pos.x];
    for (const { dx, dy, dir } of DIRECTIONS) {
      const nx = pos.x + dx;
      const ny = pos.y + dy;
      const next = grid[ny]?.[nx];
      const key = `${nx},${ny}`;
      if (!next || seen.has(key) || !canTraverse(cell, next, dir)) continue;
      seen.add(key);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}

function countDeadEnds(grid, reachableKeys) {
  let count = 0;
  for (const key of reachableKeys) {
    const [x, y] = key.split(",").map(Number);
    const cell = grid[y][x];
    const exits = DIRECTIONS.filter(({ dx, dy, dir }) => {
      const next = grid[y + dy]?.[x + dx];
      return next && canTraverse(cell, next, dir);
    }).length;
    if (cell.type !== "stairs-up" && exits === 1) count++;
  }
  return count;
}

function hasShortNaturalPath(grid, start, target, maximumDistance) {
  const queue = [{ ...start, distance: 0 }];
  const seen = new Set([`${start.x},${start.y}`]);
  for (const pos of queue) {
    if (pos.x === target.x && pos.y === target.y) return true;
    if (pos.distance === maximumDistance) continue;
    const cell = grid[pos.y][pos.x];
    for (const { dx, dy, dir } of DIRECTIONS) {
      const nx = pos.x + dx;
      const ny = pos.y + dy;
      const next = grid[ny]?.[nx];
      const key = `${nx},${ny}`;
      if (!next || seen.has(key) || cell.walls[dir] || next.walls[(dir + 2) % 4]) continue;
      seen.add(key);
      queue.push({ x: nx, y: ny, distance: pos.distance + 1 });
    }
  }
  return false;
}

function countTightUTurns(grid) {
  let count = 0;
  for (let y = 1; y < grid.length - 1; y++) {
    for (let x = 1; x < grid[y].length - 1; x++) {
      const cell = grid[y][x];
      if (!cell.walls.some(wall => !wall)) continue;
      for (const { dx, dy } of [{ dx: 1, dy: 0 }, { dx: 0, dy: 1 }]) {
        const middle = grid[y + dy]?.[x + dx];
        const target = grid[y + dy * 2]?.[x + dx * 2];
        if (!middle || !target || !middle.walls.every(Boolean) || !target.walls.some(wall => !wall)) continue;
        if (hasShortNaturalPath(grid, { x, y }, { x: x + dx * 2, y: y + dy * 2 }, 4)) count++;
      }
    }
  }
  return count;
}

function countFlags(grid, field) {
  return grid.flat().reduce((total, cell) => total + (cell[field]?.filter(Boolean).length ?? 0), 0);
}

function countTraps(grid) {
  return grid.flat().filter(cell => cell.trap).length;
}

function mean(total, count) {
  return count > 0 ? total / count : NaN;
}

for (let floor = 1; floor <= MAX_FLOOR; floor++) {
  const template = FLOOR_TEMPLATES.find(candidate => floor >= candidate.minDepth && floor <= candidate.maxDepth);
  const biome = getBiomeForFloor(floor);
  const summary = summaries.get(template.id);

  for (let seedIndex = 0; seedIndex < SEEDS_PER_FLOOR; seedIndex++) {
    const runSeed = `run-floor-template-${floor}-${seedIndex}`;
    try {
      const generated = generateRunFloor({ runSeed, floor });
      const { criticalPath, reachableCells, walkableCells } = generated.validation;
      if (generated.templateId !== template.id) {
        failures.push(`B${floor}/${runSeed}: template ${generated.templateId}, expected ${template.id}`);
      }
      if (criticalPath < template.criticalPathRange[0] || criticalPath > template.criticalPathRange[1]) {
        failures.push(`${template.id}/${runSeed}: critical path ${criticalPath}`);
      }
      if (reachableCells !== walkableCells) {
        failures.push(
          `${template.id}/${runSeed}: reachable ${reachableCells}/${walkableCells}`
        );
      }
      const expectedOneWays = template.gimmickDensity.oneWayPassages + biome.gimmicks.oneWayBonus;
      const expectedSecretDoors = template.gimmickDensity.secretDoors.shortcut * 2 + template.gimmickDensity.secretDoors.room;
      const expectedTraps = template.gimmickDensity.traps + biome.gimmicks.trapBonus;
      const actualOneWays = countFlags(generated.grid, "blockEnter");
      const actualSecretDoors = countFlags(generated.grid, "secretDoor") / 2;
      const actualTraps = countTraps(generated.grid);
      if (actualOneWays > expectedOneWays) {
        failures.push(`B${floor}/${runSeed}: one-way passages ${actualOneWays}, maximum ${expectedOneWays}`);
      }
      if (actualSecretDoors !== expectedSecretDoors) {
        failures.push(`B${floor}/${runSeed}: secret doors ${actualSecretDoors}, expected ${expectedSecretDoors}`);
      }
      if (actualTraps !== expectedTraps) {
        failures.push(`B${floor}/${runSeed}: traps ${actualTraps}, expected ${expectedTraps}`);
      }
      const start = generated.grid.flatMap((row, y) => row.map((cell, x) => ({ cell, x, y })))
        .find(({ cell }) => cell.type === "stairs-up");
      if (!start) throw new Error("stairs-up missing");
      const reachableKeys = getReachableKeys(generated.grid, start);
      summary.generated++;
      summary.attempts += generated.generationAttempt + 1;
      summary.minimumPath = Math.min(summary.minimumPath, criticalPath);
      summary.maximumPath = Math.max(summary.maximumPath, criticalPath);
      summary.totalPath += criticalPath;
      summary.totalReachableCells += reachableCells;
      summary.totalDeadEnds += countDeadEnds(generated.grid, reachableKeys);
      summary.totalTightUTurns += countTightUTurns(generated.grid);
      summary.placedOneWays += actualOneWays;
      summary.requestedOneWays += expectedOneWays;
    } catch (error) {
      failures.push(`B${floor}/${runSeed}: generation failed: ${error.message}`);
    }
  }
}

for (const template of FLOOR_TEMPLATES) {
  const summary = summaries.get(template.id);
  const averagePath = summary.generated > 0
    ? (summary.totalPath / summary.generated).toFixed(2)
    : "n/a";
  const meanDeadEnds = mean(summary.totalDeadEnds, summary.generated);
  const meanTightUTurns = mean(summary.totalTightUTurns, summary.generated);
  const oneWayPlacementRate = summary.placedOneWays / summary.requestedOneWays;
  const limits = SHAPE_LIMITS[template.id];
  if (meanDeadEnds < limits.minimumMeanDeadEnds) {
    failures.push(`${template.id}: mean dead ends ${meanDeadEnds.toFixed(2)} < ${limits.minimumMeanDeadEnds}`);
  }
  if (meanTightUTurns > limits.maximumMeanTightUTurns) {
    failures.push(`${template.id}: mean tight U-turns ${meanTightUTurns.toFixed(2)} > ${limits.maximumMeanTightUTurns}`);
  }
  if (oneWayPlacementRate < MINIMUM_ONE_WAY_PLACEMENT_RATE) {
    failures.push(`${template.id}: one-way placement ${(oneWayPlacementRate * 100).toFixed(1)}% < ${MINIMUM_ONE_WAY_PLACEMENT_RATE * 100}%`);
  }
  console.log(
    `${template.id}: generated=${summary.generated}, ` +
    `criticalPath=${summary.minimumPath}-${summary.maximumPath} (avg ${averagePath}), ` +
    `reachable=${mean(summary.totalReachableCells, summary.generated).toFixed(2)}, ` +
    `deadEnds=${meanDeadEnds.toFixed(2)}, tightUTurns=${meanTightUTurns.toFixed(2)}, ` +
    `oneWays=${(oneWayPlacementRate * 100).toFixed(1)}%, attempts=${summary.attempts}`
  );
}

if (failures.length > 0) {
  console.error(`[FAIL] ${failures.length} generation anomalies`);
  failures.slice(0, 20).forEach(failure => console.error(`- ${failure}`));
  if (failures.length > 20) console.error(`- ... ${failures.length - 20} more`);
  process.exit(1);
}

console.log(`[PASS] ${SEEDS_PER_FLOOR} seeds x B1-B${MAX_FLOOR}; template density and shape failures=0.`);
