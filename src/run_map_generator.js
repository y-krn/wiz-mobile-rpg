import { getFloorTemplate } from "./data/floor_templates.js";
import { generateRandomMap } from "./map_generator.js";
import { deriveFloorAttemptSeed, deriveFloorSeed } from "./seed_rng.js";

const DIRECTIONS = [
  { dx: 0, dy: -1, dir: 0 },
  { dx: 1, dy: 0, dir: 1 },
  { dx: 0, dy: 1, dir: 2 },
  { dx: -1, dy: 0, dir: 3 }
];

export const MAX_FLOOR_GENERATION_ATTEMPTS = 12;

function keyOf({ x, y }) {
  return `${x},${y}`;
}

function findCell(grid, predicate) {
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (predicate(grid[y][x])) return { x, y };
    }
  }
  return null;
}

function isWalkable(cell) {
  return cell.walls.some(wall => !wall) ||
    cell.secretDoor?.some(Boolean) ||
    cell.sealedGate?.some(Boolean) ||
    cell.type !== "empty" ||
    Boolean(cell.event) ||
    Boolean(cell.trap);
}

function getDistances(grid, start, { revealGimmicks = false } = {}) {
  if (!start) return new Map();
  const queue = [{ ...start, distance: 0 }];
  const distances = new Map([[keyOf(start), 0]]);

  for (const pos of queue) {
    const cell = grid[pos.y]?.[pos.x];
    if (!cell) continue;

    for (const { dx, dy, dir } of DIRECTIONS) {
      const nx = pos.x + dx;
      const ny = pos.y + dy;
      const next = grid[ny]?.[nx];
      if (!next || next.blockEnter?.[(dir + 2) % 4]) continue;
      const canReveal = revealGimmicks &&
        (cell.secretDoor?.[dir] || cell.sealedGate?.[dir]);
      if (cell.walls[dir] && !canReveal) continue;

      const key = `${nx},${ny}`;
      if (distances.has(key)) continue;
      const distance = pos.distance + 1;
      distances.set(key, distance);
      queue.push({ x: nx, y: ny, distance });
    }
  }

  return distances;
}

export function validateGeneratedFloor(mapData, template) {
  const { grid, rooms = [] } = mapData;
  const errors = [];
  const hasExpectedSize = grid.length === template.size.height &&
    grid.every(row => row.length === template.size.width);
  if (!hasExpectedSize) {
    errors.push(`floor size does not match ${template.size.width}x${template.size.height}`);
  }
  if (rooms.length < template.roomCountRange[0] || rooms.length > template.roomCountRange[1]) {
    errors.push(
      `room count ${rooms.length} outside ${template.roomCountRange[0]}-${template.roomCountRange[1]}`
    );
  }
  const start = findCell(grid, cell => cell.type === "stairs-up");
  const stairsDown = findCell(grid, cell => cell.type === "stairs-down");
  if (!start) errors.push("stairs-up missing");
  if (!stairsDown) errors.push("stairs-down missing");

  const naturalDistances = getDistances(grid, start);
  const revealedDistances = getDistances(grid, start, { revealGimmicks: true });
  const walkableKeys = [];
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (isWalkable(grid[y][x])) walkableKeys.push(`${x},${y}`);
    }
  }

  const unreachableKeys = walkableKeys.filter(key => !revealedDistances.has(key));
  if (unreachableKeys.length > 0) {
    errors.push(`${unreachableKeys.length} walkable cells unreachable`);
  }

  const criticalPath = stairsDown
    ? naturalDistances.get(keyOf(stairsDown)) ?? Infinity
    : Infinity;
  const [minimumPath, maximumPath] = template.criticalPathRange;
  if (criticalPath < minimumPath || criticalPath > maximumPath) {
    errors.push(`critical path ${criticalPath} outside ${minimumPath}-${maximumPath}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    criticalPath,
    reachableCells: revealedDistances.size,
    walkableCells: walkableKeys.length
  };
}

export function generateRunFloor({
  runSeed,
  floor,
  parentStairsCoord = null,
  maxAttempts = MAX_FLOOR_GENERATION_ATTEMPTS
}) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new TypeError(`maxAttempts must be a positive integer: ${maxAttempts}`);
  }

  const template = getFloorTemplate(floor);
  const floorSeed = deriveFloorSeed(runSeed, floor);
  let lastErrors = [];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const generationSeed = deriveFloorAttemptSeed(floorSeed, attempt);
    try {
      const generated = generateRandomMap(floor, parentStairsCoord, generationSeed, {
        size: template.size,
        roomCountRange: template.roomCountRange,
        mazeProfile: template.mazeProfile,
        oneWayPassageCount: template.gimmickDensity.oneWayPassages,
        secretDoorCounts: template.gimmickDensity.secretDoors,
        trapCount: template.gimmickDensity.traps,
        criticalPathRange: template.criticalPathRange,
        generateStairsDown: true,
        legacyMilestones: false,
        generateWardenGate: false
      });
      const validation = validateGeneratedFloor(generated, template);
      if (validation.valid) {
        return {
          ...generated,
          runSeed,
          floor,
          floorSeed,
          generationSeed,
          generationAttempt: attempt,
          templateId: template.id,
          validation
        };
      }
      lastErrors = validation.errors;
    } catch (error) {
      lastErrors = [error.message];
    }
  }

  throw new Error(
    `B${floor}F generation failed after ${maxAttempts} attempts: ${lastErrors.join(", ")}`
  );
}
