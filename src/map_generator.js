import { DIR_N, DIR_E, DIR_S, DIR_W, START_X, START_Y, MAP_WIDTH, MAP_HEIGHT, EVENT_TYPES } from "./data.js";
import { createRng } from "./seed_rng.js";

// Directions helper
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
const OPPOSITE_DIR = [DIR_S, DIR_W, DIR_N, DIR_E];

function isPassageCell(grid, x, y) {
  return x >= 0 &&
    x < MAP_WIDTH &&
    y >= 0 &&
    y < MAP_HEIGHT &&
    grid[y][x].walls.some(w => !w);
}

function getInternalWallEdges(grid) {
  const edges = [];

  for (let y = 1; y < MAP_HEIGHT - 1; y++) {
    for (let x = 1; x < MAP_WIDTH - 1; x++) {
      if (!isPassageCell(grid, x, y)) continue;

      if (grid[y][x].walls[DIR_E] && isPassageCell(grid, x + 1, y)) {
        edges.push({
          x,
          y,
          dir: DIR_E,
          a: `${x + 1},${y}`,
          b: `${x + 1},${y + 1}`
        });
      }

      if (grid[y][x].walls[DIR_S] && isPassageCell(grid, x, y + 1)) {
        edges.push({
          x,
          y,
          dir: DIR_S,
          a: `${x},${y + 1}`,
          b: `${x + 1},${y + 1}`
        });
      }
    }
  }

  return edges;
}

function openWall(grid, x, y, dir) {
  const nx = x + DX[dir];
  const ny = y + DY[dir];
  if (nx < 0 || nx >= MAP_WIDTH || ny < 0 || ny >= MAP_HEIGHT) return;

  grid[y][x].walls[dir] = false;
  grid[ny][nx].walls[OPPOSITE_DIR[dir]] = false;
}

function getReachableCellKeys(grid, start) {
  const queue = [start];
  const seen = new Set([`${start.x},${start.y}`]);

  for (const pos of queue) {
    const cell = grid[pos.y]?.[pos.x];
    if (!cell) continue;

    for (let dir = 0; dir < 4; dir++) {
      if (cell.walls[dir]) continue;

      const nx = pos.x + DX[dir];
      const ny = pos.y + DY[dir];
      if (nx < 0 || nx >= MAP_WIDTH || ny < 0 || ny >= MAP_HEIGHT) continue;

      const key = `${nx},${ny}`;
      if (!seen.has(key)) {
        seen.add(key);
        queue.push({ x: nx, y: ny });
      }
    }
  }

  return seen;
}

export function removeIsolatedInternalWalls(grid) {
  let removed = 0;
  let changed = true;

  while (changed) {
    changed = false;
    const edges = getInternalWallEdges(grid);
    const degree = new Map();

    edges.forEach(edge => {
      degree.set(edge.a, (degree.get(edge.a) || 0) + 1);
      degree.set(edge.b, (degree.get(edge.b) || 0) + 1);
    });

    const isolated = edges.find(edge => degree.get(edge.a) === 1 && degree.get(edge.b) === 1);
    if (isolated) {
      openWall(grid, isolated.x, isolated.y, isolated.dir);
      removed++;
      changed = true;
    }
  }

  return removed;
}

export function generateRandomMap(floor = 1, parentStairsCoord = null, seed = null) {
  const rng = seed ? createRng(`${seed}:map:B${floor}`) : Math.random;
  // 1. Initialize grid with all walls closed
  const grid = Array.from({ length: MAP_HEIGHT }, () =>
    Array.from({ length: MAP_WIDTH }, () => ({
      walls: [true, true, true, true], // N, E, S, W starts closed
      type: "empty",
      event: null,
      message: null
    }))
  );

  // Helper to check boundaries for maze generation
  const isValid = (x, y) => x > 0 && x < MAP_WIDTH - 1 && y > 0 && y < MAP_HEIGHT - 1;

  // DFS Digging algorithm
  const visited = Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false));
  const stack = [];

  // Start digging from START_X, START_Y (or parent stairs-up position)
  const digStartX = (floor > 1 && parentStairsCoord) ? parentStairsCoord.x : START_X;
  const digStartY = (floor > 1 && parentStairsCoord) ? parentStairsCoord.y : START_Y;
  
  let cx = digStartX;
  let cy = digStartY;
  visited[cy][cx] = true;
  stack.push({ x: cx, y: cy });

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const neighbors = [];

    // Look for unvisited neighbors at distance 2
    for (let i = 0; i < 4; i++) {
      const nx = current.x + DX[i] * 2;
      const ny = current.y + DY[i] * 2;

      if (isValid(nx, ny) && !visited[ny][nx]) {
        neighbors.push({ dir: i, x: nx, y: ny });
      }
    }

    if (neighbors.length > 0) {
      // Pick random neighbor
      const next = neighbors[Math.floor(rng() * neighbors.length)];
      
      // Dig passage to the next cell
      const wallDir = next.dir;
      const oppDir = (wallDir + 2) % 4;

      // Break wall at current cell
      grid[current.y][current.x].walls[wallDir] = false;
      
      // Break wall at intermediate cell
      const mx = current.x + DX[wallDir];
      const my = current.y + DY[wallDir];
      grid[my][mx].walls[oppDir] = false;
      grid[my][mx].walls[wallDir] = false;
      
      // Break wall at next cell
      grid[next.y][next.x].walls[oppDir] = false;

      // Mark visited
      visited[next.y][next.x] = true;
      visited[my][mx] = true; // intermediate is also part of passage

      stack.push({ x: next.x, y: next.y });
    } else {
      stack.pop();
    }
  }

  // 2. Open additional walls to create loops (25% probability of connecting visited cells at distance 2)
  for (let y = 1; y < MAP_HEIGHT - 1; y++) {
    for (let x = 1; x < MAP_WIDTH - 1; x++) {
      if (visited[y][x]) {
        for (let dir = 0; dir < 4; dir++) {
          const nx = x + DX[dir] * 2;
          const ny = y + DY[dir] * 2;
          if (isValid(nx, ny) && visited[ny][nx]) {
            const mx = x + DX[dir];
            const my = y + DY[dir];
            // Check if the intermediate cell is not dug (all walls closed)
            if (grid[my][mx].walls.every(w => w)) {
              if (rng() < 0.25) {
                const wallDir = dir;
                const oppDir = (wallDir + 2) % 4;

                grid[y][x].walls[wallDir] = false;
                grid[my][mx].walls[oppDir] = false;
                grid[my][mx].walls[wallDir] = false;
                grid[ny][nx].walls[oppDir] = false;
                
                // Mark intermediate cell as visited/passage
                visited[my][mx] = true;
              }
            }
          }
        }
      }
    }
  }

  removeIsolatedInternalWalls(grid);

  // 3. Setup floor specific connections & detect dead ends
  // Make sure start position is connected
  if (floor === 1) {
    if (grid[START_Y][START_X].walls.every(w => w)) {
      grid[START_Y][START_X].walls[DIR_N] = false;
      grid[START_Y - 1][START_X].walls[DIR_S] = false;
    }
  } else if (floor > 1 && parentStairsCoord) {
    if (grid[parentStairsCoord.y][parentStairsCoord.x].walls.every(w => w)) {
      // Find any valid neighbor to open wall to
      for (let dir = 0; dir < 4; dir++) {
        const nx = parentStairsCoord.x + DX[dir];
        const ny = parentStairsCoord.y + DY[dir];
        if (isValid(nx, ny)) {
          grid[parentStairsCoord.y][parentStairsCoord.x].walls[dir] = false;
          grid[ny][nx].walls[(dir + 2) % 4] = false;
          break;
        }
      }
    }
  }

  // Find all reachable dead ends (cells with exactly 1 open wall)
  // exclude start position (and stairsUpCoord for floor > 1)
  let deadEnds = [];
  const startX = START_X;
  const startY = START_Y;
  const stairsUpCoord = (floor > 1) ? (parentStairsCoord || { x: MAP_WIDTH - 2, y: 1 }) : null;
  const suCoord = floor > 1 ? (stairsUpCoord || { x: MAP_WIDTH - 2, y: 1 }) : { x: START_X, y: START_Y };
  const reachableKeys = getReachableCellKeys(grid, suCoord);

  for (let y = 1; y < MAP_HEIGHT - 1; y++) {
    for (let x = 1; x < MAP_WIDTH - 1; x++) {
      if (floor === 1 && x === startX && y === startY) continue;
      if (floor > 1 && stairsUpCoord && x === stairsUpCoord.x && y === stairsUpCoord.y) continue;

      const cell = grid[y][x];
      const openCount = cell.walls.filter(w => !w).length;
      if (openCount === 1) {
        deadEnds.push({ x, y });
      }
    }
  }
  deadEnds = deadEnds.filter(de => reachableKeys.has(`${de.x},${de.y}`));

  let stairsDownCoord = null;
  let bossCoord = null;

  // 4. Setup Stairs & Boss / Midboss
  if (floor > 1) {
    grid[suCoord.y][suCoord.x].type = "stairs-up";
    grid[suCoord.y][suCoord.x].message = `【上り階段】地下${floor - 1}階へ戻る階段です。`;
  } else {
    grid[START_Y][START_X].type = "stairs-up";
    grid[START_Y][START_X].message = "【上り階段】街へ戻る階段です。";
  }

  // Set stairs-down for B1F - B4F
  if (floor < 5) {
    if (deadEnds.length > 0) {
      const idx = Math.floor(rng() * deadEnds.length);
      stairsDownCoord = deadEnds[idx];
      deadEnds.splice(idx, 1);
    } else {
      stairsDownCoord = [...reachableKeys]
        .map(key => {
          const [x, y] = key.split(",").map(Number);
          return { x, y, dist: Math.abs(x - suCoord.x) + Math.abs(y - suCoord.y) };
        })
        .filter(cell => cell.x !== suCoord.x || cell.y !== suCoord.y)
        .sort((a, b) => b.dist - a.dist)[0] || { x: suCoord.x, y: suCoord.y };
    }
    grid[stairsDownCoord.y][stairsDownCoord.x].type = "stairs-down";
    grid[stairsDownCoord.y][stairsDownCoord.x].message = `【下り階段】地下${floor + 1}階へ進む階段です。`;
  }

  // Place Midboss on Floor 3, Boss on Floor 5
  if (floor === 3) {
    if (deadEnds.length > 0) {
      deadEnds.forEach(de => {
        de.dist = Math.abs(de.x - suCoord.x) + Math.abs(de.y - suCoord.y);
      });
      deadEnds.sort((a, b) => b.dist - a.dist);
      const candidates = deadEnds.slice(0, Math.min(3, deadEnds.length));
      const chosen = candidates[Math.floor(rng() * candidates.length)];
      bossCoord = { x: chosen.x, y: chosen.y };

      const removeIdx = deadEnds.findIndex(de => de.x === bossCoord.x && de.y === bossCoord.y);
      if (removeIdx !== -1) {
        deadEnds.splice(removeIdx, 1);
      }
    } else {
      bossCoord = [...reachableKeys]
        .map(key => {
          const [x, y] = key.split(",").map(Number);
          return { x, y, dist: Math.abs(x - suCoord.x) + Math.abs(y - suCoord.y) };
        })
        .filter(cell => (cell.x !== suCoord.x || cell.y !== suCoord.y) && (cell.x !== stairsDownCoord?.x || cell.y !== stairsDownCoord?.y))
        .sort((a, b) => b.dist - a.dist)[0] || { x: suCoord.x, y: suCoord.y };
    }
    grid[bossCoord.y][bossCoord.x].type = "empty";
    grid[bossCoord.y][bossCoord.x].event = "midboss";
    grid[bossCoord.y][bossCoord.x].message = "不気味な魔力の気配を感じる…！デーモンガードが立ち塞がった！";
  } else if (floor === 5) {
    if (deadEnds.length > 0) {
      deadEnds.forEach(de => {
        de.dist = Math.abs(de.x - suCoord.x) + Math.abs(de.y - suCoord.y);
      });
      deadEnds.sort((a, b) => b.dist - a.dist);
      const candidates = deadEnds.slice(0, Math.min(3, deadEnds.length));
      const chosen = candidates[Math.floor(rng() * candidates.length)];
      bossCoord = { x: chosen.x, y: chosen.y };

      const removeIdx = deadEnds.findIndex(de => de.x === bossCoord.x && de.y === bossCoord.y);
      if (removeIdx !== -1) {
        deadEnds.splice(removeIdx, 1);
      }
    } else {
      bossCoord = [...reachableKeys]
        .map(key => {
          const [x, y] = key.split(",").map(Number);
          return { x, y, dist: Math.abs(x - suCoord.x) + Math.abs(y - suCoord.y) };
        })
        .filter(cell => cell.x !== suCoord.x || cell.y !== suCoord.y)
        .sort((a, b) => b.dist - a.dist)[0] || { x: suCoord.x, y: suCoord.y };
    }
    grid[bossCoord.y][bossCoord.x].type = "empty";
    grid[bossCoord.y][bossCoord.x].event = "boss";
    grid[bossCoord.y][bossCoord.x].message = "周囲にただならぬ気配が漂っている…！いにしえの竜が姿を現した！";
  }

  // 6. Place chest events randomly at dead ends
  // Shuffle array utility
  const shuffle = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  };
  shuffle(deadEnds);

  const chestCount = Math.min(6, deadEnds.length);
  for (let i = 0; i < chestCount; i++) {
    const spot = deadEnds[i];
    grid[spot.y][spot.x].event = EVENT_TYPES.CHEST;
  }

  let springCount = 0;
  for (let i = chestCount; i < Math.min(chestCount + 2, deadEnds.length); i++) {
    const spot = deadEnds[i];
    grid[spot.y][spot.x].event = EVENT_TYPES.SPRING;
    springCount++;
  }

  let tabletCount = 0;
  for (let i = chestCount + 2; i < Math.min(chestCount + 4, deadEnds.length); i++) {
    const spot = deadEnds[i];
    grid[spot.y][spot.x].event = EVENT_TYPES.TABLET;
    tabletCount++;
  }

  let merchantCount = 0;
  for (let i = chestCount + 4; i < Math.min(chestCount + 5, deadEnds.length); i++) {
    const spot = deadEnds[i];
    grid[spot.y][spot.x].event = EVENT_TYPES.MERCHANT;
    merchantCount++;
  }

  // Fallback if sparse
  let totalChestNeeded = 6 - chestCount;
  let totalSpringNeeded = 2 - springCount;
  let totalTabletNeeded = 2 - tabletCount;
  let totalMerchantNeeded = 1 - merchantCount;

  if (totalChestNeeded > 0 || totalSpringNeeded > 0 || totalTabletNeeded > 0 || totalMerchantNeeded > 0) {
    const passages = [];
    for (let y = 1; y < MAP_HEIGHT - 1; y++) {
      for (let x = 1; x < MAP_WIDTH - 1; x++) {
        const isStart = (x === START_X && y === START_Y);
        const isStairs = (stairsUpCoord && x === stairsUpCoord.x && y === stairsUpCoord.y) || (stairsDownCoord && x === stairsDownCoord.x && y === stairsDownCoord.y);
        const isBossCell = (bossCoord && x === bossCoord.x && y === bossCoord.y);
        if (isStart || isStairs || isBossCell || grid[y][x].event) continue;

        if (reachableKeys.has(`${x},${y}`) && grid[y][x].walls.some(w => !w)) {
          passages.push({ x, y });
        }
      }
    }
    shuffle(passages);
    
    let pIdx = 0;
    for (let i = 0; i < totalChestNeeded && pIdx < passages.length; i++) {
      const spot = passages[pIdx++];
      grid[spot.y][spot.x].event = EVENT_TYPES.CHEST;
    }
    for (let i = 0; i < totalSpringNeeded && pIdx < passages.length; i++) {
      const spot = passages[pIdx++];
      grid[spot.y][spot.x].event = EVENT_TYPES.SPRING;
    }
    for (let i = 0; i < totalTabletNeeded && pIdx < passages.length; i++) {
      const spot = passages[pIdx++];
      grid[spot.y][spot.x].event = EVENT_TYPES.TABLET;
    }
    for (let i = 0; i < totalMerchantNeeded && pIdx < passages.length; i++) {
      const spot = passages[pIdx++];
      grid[spot.y][spot.x].event = EVENT_TYPES.MERCHANT;
    }
  }

  return {
    grid,
    stairsDownCoord,
    bossCoord
  };
}
