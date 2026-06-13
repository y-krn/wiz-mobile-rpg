import { DIR_N, DIR_E, DIR_S, DIR_W, START_X, START_Y, MAP_WIDTH, MAP_HEIGHT } from "./data.js";

// Directions helper
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

export function generateRandomMap() {
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

  // Start digging from START_X, START_Y
  let cx = START_X;
  let cy = START_Y;
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
      const next = neighbors[Math.floor(Math.random() * neighbors.length)];
      
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

  // 2. Open additional walls to create loops (15% probability)
  for (let y = 1; y < MAP_HEIGHT - 1; y++) {
    for (let x = 1; x < MAP_WIDTH - 1; x++) {
      if (grid[y][x].walls.some(w => !w)) {
        for (let dir = 0; dir < 4; dir++) {
          const nx = x + DX[dir];
          const ny = y + DY[dir];
          if (isValid(nx, ny) && grid[y][x].walls[dir]) {
            if (grid[ny][nx].walls.some(w => !w) && Math.random() < 0.15) {
              grid[y][x].walls[dir] = false;
              grid[ny][nx].walls[(dir + 2) % 4] = false;
            }
          }
        }
      }
    }
  }

  // 3. Make sure start position and boss position are connected and exist
  const bossX = MAP_WIDTH - 2;
  const bossY = 1;

  if (grid[START_Y][START_X].walls.every(w => w)) {
    grid[START_Y][START_X].walls[DIR_N] = false;
    grid[START_Y - 1][START_X].walls[DIR_S] = false;
  }
  grid[bossY][bossX].walls[DIR_W] = false;
  grid[bossY][bossX - 1].walls[DIR_E] = false;

  // 4. Place doors (8% probability on linear corridors)
  for (let y = 1; y < MAP_HEIGHT - 1; y++) {
    for (let x = 1; x < MAP_WIDTH - 1; x++) {
      const cell = grid[y][x];
      const openCount = cell.walls.filter(w => !w).length;
      if (openCount === 2 && Math.random() < 0.08) {
        if ((x !== START_X || y !== START_Y) && (x !== bossX || y !== bossY)) {
          cell.type = "door";
          for (let dir = 0; dir < 4; dir++) {
            if (!cell.walls[dir]) {
              const nx = x + DX[dir];
              const ny = y + DY[dir];
              if (isValid(nx, ny)) {
                grid[ny][nx].type = "door";
              }
            }
          }
        }
      }
    }
  }

  // 5. Setup Stairs Up (Start)
  grid[START_Y][START_X].type = "stairs-up";
  grid[START_Y][START_X].message = "街へと戻る階段です。一歩進むとリルガミンの街に戻ります。";

  // 6. Setup Boss room
  grid[bossY][bossX].type = "empty";
  grid[bossY][bossX].event = "boss";
  grid[bossY][bossX].message = "周囲にただならぬ気配が漂っている…！いにしえの竜が姿を現した！";
  grid[bossY][bossX - 1].type = "door"; // Ensure boss room entry door

  // 7. Place chest events randomly at dead ends
  const deadEnds = [];
  for (let y = 1; y < MAP_HEIGHT - 1; y++) {
    for (let x = 1; x < MAP_WIDTH - 1; x++) {
      if ((x === START_X && y === START_Y) || (x === bossX && y === bossY)) continue;
      const cell = grid[y][x];
      const openCount = cell.walls.filter(w => !w).length;
      if (openCount === 1) {
        deadEnds.push({ x, y });
      }
    }
  }

  // Shuffle array utility
  const shuffle = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  };
  shuffle(deadEnds);

  const chestCount = Math.min(6, deadEnds.length);
  for (let i = 0; i < chestCount; i++) {
    const spot = deadEnds[i];
    grid[spot.y][spot.x].event = "chest";
  }

  // Fallback to place chests on regular passages if dead ends are sparse
  if (chestCount < 6) {
    const passages = [];
    for (let y = 1; y < MAP_HEIGHT - 1; y++) {
      for (let x = 1; x < MAP_WIDTH - 1; x++) {
        if ((x === START_X && y === START_Y) || (x === bossX && y === bossY)) continue;
        if (grid[y][x].event) continue;
        if (grid[y][x].walls.some(w => !w)) {
          passages.push({ x, y });
        }
      }
    }
    shuffle(passages);
    const remaining = 6 - chestCount;
    for (let i = 0; i < Math.min(remaining, passages.length); i++) {
      const spot = passages[i];
      grid[spot.y][spot.x].event = "chest";
    }
  }

  return grid;
}
