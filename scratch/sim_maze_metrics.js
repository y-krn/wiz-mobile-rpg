import { generateRandomMap } from "../src/map_generator.js";

const SEED_COUNT = 100;
const FLOOR_COUNT = 5;
const DIRS = [
  { dx: 0, dy: -1, opposite: 2 },
  { dx: 1, dy: 0, opposite: 3 },
  { dx: 0, dy: 1, opposite: 0 },
  { dx: -1, dy: 0, opposite: 1 }
];

function isPassage(cell) {
  return cell.walls.some(wall => !wall);
}

function countDeadEnds(grid) {
  return grid.flat().filter(cell => isPassage(cell) && cell.walls.filter(wall => !wall).length === 1).length;
}

function getStraightRuns(grid) {
  const runs = [];
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      for (const dir of [1, 2]) {
        const cell = grid[y][x];
        const previous = grid[y - DIRS[dir].dy]?.[x - DIRS[dir].dx];
        if (!isPassage(cell) || cell.walls[dir] || (previous && !previous.walls[dir])) continue;

        let length = 0;
        let cx = x;
        let cy = y;
        while (!grid[cy]?.[cx]?.walls[dir]) {
          length++;
          cx += DIRS[dir].dx;
          cy += DIRS[dir].dy;
        }
        if (length > 0) runs.push(length);
      }
    }
  }
  return runs;
}

function countLoops(grid) {
  let vertices = 0;
  let edges = 0;
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const cell = grid[y][x];
      if (!isPassage(cell)) continue;
      vertices++;
      for (const dir of [1, 2]) {
        const nx = x + DIRS[dir].dx;
        const ny = y + DIRS[dir].dy;
        const next = grid[ny]?.[nx];
        if (next && !cell.walls[dir] && !next.walls[DIRS[dir].opposite]) edges++;
      }
    }
  }
  return Math.max(0, edges - vertices + 1);
}

function summarize(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return { mean, cv: mean === 0 ? 0 : Math.sqrt(variance) / mean };
}

const rows = [];
for (let index = 0; index < SEED_COUNT; index++) {
  const seed = `maze-metrics-${index}`;
  let parentStairsCoord = null;
  for (let floor = 1; floor <= FLOOR_COUNT; floor++) {
    const generated = generateRandomMap(floor, parentStairsCoord, seed);
    const straightRuns = getStraightRuns(generated.grid);
    rows.push({
      floor,
      deadEnds: countDeadEnds(generated.grid),
      averageStraightLength: straightRuns.reduce((sum, length) => sum + length, 0) / straightRuns.length,
      loops: countLoops(generated.grid)
    });
    parentStairsCoord = generated.stairsDownCoord;
  }
}

for (const floor of Array.from({ length: FLOOR_COUNT }, (_, index) => index + 1)) {
  const floorRows = rows.filter(row => row.floor === floor);
  console.log(`B${floor}F`);
  for (const metric of ["deadEnds", "averageStraightLength", "loops"]) {
    const summary = summarize(floorRows.map(row => row[metric]));
    console.log(`  ${metric}: mean=${summary.mean.toFixed(3)} cv=${summary.cv.toFixed(3)}`);
  }
}

console.log("ALL FLOORS");
for (const metric of ["deadEnds", "averageStraightLength", "loops"]) {
  const summary = summarize(rows.map(row => row[metric]));
  console.log(`  ${metric}: mean=${summary.mean.toFixed(3)} cv=${summary.cv.toFixed(3)}`);
}
