import { generateRandomMap, ONE_WAY_MIN_DETOUR } from "../src/map_generator.js";

const DIRS = [
  { dx: 0, dy: -1, dir: 0 },
  { dx: 1, dy: 0, dir: 1 },
  { dx: 0, dy: 1, dir: 2 },
  { dx: -1, dy: 0, dir: 3 }
];

function findCell(grid, predicate) {
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (predicate(grid[y][x], x, y)) return { x, y };
    }
  }
  return null;
}

function canReach(grid, start, target) {
  if (!start || !target) return false;
  const queue = [start];
  const seen = new Set([`${start.x},${start.y}`]);

  for (const pos of queue) {
    if (pos.x === target.x && pos.y === target.y) return true;
    const cell = grid[pos.y][pos.x];

    for (let i = 0; i < 4; i++) {
      const { dx, dy, dir } = DIRS[i];
      const nx = pos.x + dx;
      const ny = pos.y + dy;
      const next = grid[ny]?.[nx];
      if (!next || cell.walls[dir]) continue;
      if (next.blockEnter?.[(dir + 2) % 4]) continue;

      const key = `${nx},${ny}`;
      if (!seen.has(key)) {
        seen.add(key);
        queue.push({ x: nx, y: ny });
      }
    }
  }

  return false;
}

function canReachWithoutEdge(grid, edge) {
  const queue = [{ x: edge.x, y: edge.y }];
  const targetKey = `${edge.nx},${edge.ny}`;
  const seen = new Set([`${edge.x},${edge.y}`]);

  for (const pos of queue) {
    if (`${pos.x},${pos.y}` === targetKey) return true;
    const cell = grid[pos.y][pos.x];

    for (const { dx, dy, dir } of DIRS) {
      const nx = pos.x + dx;
      const ny = pos.y + dy;
      const next = grid[ny]?.[nx];
      if (!next || cell.walls[dir]) continue;

      const isSameEdge = (pos.x === edge.x && pos.y === edge.y && dir === edge.dir) ||
        (pos.x === edge.nx && pos.y === edge.ny && dir === (edge.dir + 2) % 4);
      if (isSameEdge) continue;

      const key = `${nx},${ny}`;
      if (!seen.has(key)) {
        seen.add(key);
        queue.push({ x: nx, y: ny });
      }
    }
  }

  return false;
}

function getOneWayReverseDetourDistance(grid, x, y, dir) {
  const start = { x: x + DIRS[dir].dx, y: y + DIRS[dir].dy, dist: 0 };
  const targetKey = `${x},${y}`;
  const queue = [start];
  const seen = new Set([`${start.x},${start.y}`]);

  for (const pos of queue) {
    if (`${pos.x},${pos.y}` === targetKey) return pos.dist;
    const cell = grid[pos.y]?.[pos.x];
    if (!cell) continue;

    for (const { dx, dy, dir: moveDir } of DIRS) {
      const nx = pos.x + dx;
      const ny = pos.y + dy;
      const next = grid[ny]?.[nx];
      if (!next || cell.walls[moveDir]) continue;
      if (next.blockEnter?.[(moveDir + 2) % 4]) continue;

      const key = `${nx},${ny}`;
      if (!seen.has(key)) {
        seen.add(key);
        queue.push({ x: nx, y: ny, dist: pos.dist + 1 });
      }
    }
  }

  return Infinity;
}

function assertOneWayPassagesAreLoopEdges(grid, floorName) {
  let count = 0;
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const cell = grid[y][x];
      if (!Array.isArray(cell.blockEnter) || cell.blockEnter.length !== 4) {
        throw new Error(`${floorName} blockEnter missing at ${x},${y}`);
      }

      cell.blockEnter.forEach((blocked, dir) => {
        if (!blocked) return;
        count++;
        const nx = x + DIRS[dir].dx;
        const ny = y + DIRS[dir].dy;
        const next = grid[ny]?.[nx];
        if (!next || cell.walls[dir] || next.walls[(dir + 2) % 4]) {
          throw new Error(`${floorName} one-way flag is not on an open edge at ${x},${y}`);
        }
        if (!canReachWithoutEdge(grid, { x, y, nx, ny, dir })) {
          throw new Error(`${floorName} one-way flag is on a bridge at ${x},${y}`);
        }
        const reverseDetour = getOneWayReverseDetourDistance(grid, x, y, dir);
        if (reverseDetour < ONE_WAY_MIN_DETOUR) {
          throw new Error(`${floorName} one-way reverse detour too short at ${x},${y}: ${reverseDetour}`);
        }
      });
    }
  }
  if (count === 0) {
    throw new Error(`${floorName} one-way passages not generated`);
  }
}

function assertSecretDoors(grid, floorName) {
  let count = 0;
  let hiddenRoomCount = 0;

  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const cell = grid[y][x];
      if (!Array.isArray(cell.secretDoor) || cell.secretDoor.length !== 4) {
        throw new Error(`${floorName} secretDoor missing at ${x},${y}`);
      }
      if (!Array.isArray(cell.secretFound) || cell.secretFound.length !== 4) {
        throw new Error(`${floorName} secretFound missing at ${x},${y}`);
      }

      cell.secretDoor.forEach((secret, dir) => {
        if (!secret) return;
        count++;
        const nx = x + DIRS[dir].dx;
        const ny = y + DIRS[dir].dy;
        const next = grid[ny]?.[nx];
        const opposite = (dir + 2) % 4;
        if (!next || !next.secretDoor?.[opposite]) {
          throw new Error(`${floorName} secret door is not symmetric at ${x},${y}`);
        }
        if (!cell.walls[dir] || !next.walls[opposite]) {
          throw new Error(`${floorName} secret door starts open at ${x},${y}`);
        }
      });

      if (cell.event && cell.walls.every(Boolean) && cell.secretDoor.some(Boolean)) {
        hiddenRoomCount++;
      }
    }
  }

  if (count === 0) {
    throw new Error(`${floorName} secret doors not generated`);
  }
  if (hiddenRoomCount === 0) {
    throw new Error(`${floorName} secret room not generated`);
  }
}

function generateDungeon(seed) {
  const b1 = generateRandomMap(1, null, seed);
  const b2 = generateRandomMap(2, b1.stairsDownCoord, seed);
  const b3 = generateRandomMap(3, null, seed);
  const b4 = generateRandomMap(4, b3.stairsDownCoord, seed);
  const b5 = generateRandomMap(5, b4.stairsDownCoord, seed);
  return { b1, b2, b3, b4, b5 };
}

console.log("Starting Loop verification of Map Reachability...");

let failCount = 0;
const ITERATIONS = 500;
for (let i = 0; i < ITERATIONS; i++) {
  const seed = `SEED-LOOP-${i}`;
  try {
    const { b1, b2, b3, b4, b5 } = generateDungeon(seed);

    // Verify each floor
    const floors = [
      { grid: b1.grid, name: "B1F", startType: "stairs-up", hasMidboss: false, hasBoss: false, down: b1.stairsDownCoord },
      { grid: b2.grid, name: "B2F", startType: "stairs-up", hasMidboss: false, hasBoss: false, down: b2.stairsDownCoord },
      { grid: b3.grid, name: "B3F", startType: "stairs-up", hasMidboss: true, hasBoss: false, down: b3.stairsDownCoord },
      { grid: b4.grid, name: "B4F", startType: "stairs-up", hasMidboss: false, hasBoss: false, down: b4.stairsDownCoord },
      { grid: b5.grid, name: "B5F", startType: "stairs-up", hasMidboss: false, hasBoss: true, down: null }
    ];

    floors.forEach(f => {
      const start = findCell(f.grid, cell => cell.type === f.startType);
      if (!start) {
        throw new Error(`${f.name} start type ${f.startType} not found`);
      }

      assertOneWayPassagesAreLoopEdges(f.grid, f.name);
      assertSecretDoors(f.grid, f.name);

      if (f.down) {
        const downCell = findCell(f.grid, cell => cell.type === "stairs-down");
        if (!downCell) {
          throw new Error(`${f.name} stairs-down not found`);
        }
        if (!canReach(f.grid, start, downCell)) {
          throw new Error(`${f.name} stairs-down is not reachable from start`);
        }
      }

      if (f.hasMidboss) {
        const midboss = findCell(f.grid, cell => cell.event === "midboss");
        if (!midboss) {
          throw new Error(`${f.name} midboss not found`);
        }
        if (!canReach(f.grid, start, midboss)) {
          throw new Error(`${f.name} midboss is not reachable from start`);
        }
      }

      if (f.hasBoss) {
        const boss = findCell(f.grid, cell => cell.event === "boss");
        if (!boss) {
          throw new Error(`${f.name} boss not found`);
        }
        if (!canReach(f.grid, start, boss)) {
          throw new Error(`${f.name} boss is not reachable from start`);
        }
      }
    });

  } catch (err) {
    console.error(`[FAIL] Seed: ${seed}, Error: ${err.message}`);
    failCount++;
    if (failCount >= 5) {
      process.exit(1);
    }
  }
}

if (failCount === 0) {
  console.log(`[PASS] ${ITERATIONS} seeds verified. No reachability bugs found in generator.`);
} else {
  console.log(`[FAIL] Total failures: ${failCount}`);
  process.exit(1);
}
