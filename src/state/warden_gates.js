import { START_X, START_Y, MAP_WIDTH, MAP_HEIGHT, DX, DY } from "../data.js";
import { openWall, placeWardenGateWithStairFallback } from "../map_generator.js";
import { getWardenPerception } from "../systems/warden_perception.js";

const OPPOSITE_DIR = [2, 3, 0, 1];

export function getWardenGateId(floor) {
  return `B${floor}_WARDEN_GATE`;
}

export function findMapCellByType(grid, type) {
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      if (grid[y]?.[x]?.type === type) return { x, y };
    }
  }
  return null;
}

export function findWardenGate(grid, floor) {
  const id = getWardenGateId(floor);
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      const cell = grid[y]?.[x];
      if (!cell?.sealedGate) continue;
      for (let dir = 0; dir < 4; dir++) {
        const gate = cell.sealedGate[dir];
        if (gate?.id === id) {
          return { id, floor, x, y, dir, nx: x + DX[dir], ny: y + DY[dir] };
        }
      }
    }
  }
  return null;
}

function getGateHome(grid, gate, start) {
  const dist = (target) => {
    const queue = [{ ...start, dist: 0 }];
    const seen = new Set([`${start.x},${start.y}`]);
    const targetKey = `${target.x},${target.y}`;
    for (const pos of queue) {
      if (`${pos.x},${pos.y}` === targetKey) return pos.dist;
      const cell = grid[pos.y]?.[pos.x];
      if (!cell) continue;
      for (let dir = 0; dir < 4; dir++) {
        if (cell.walls[dir]) continue;
        const nx = pos.x + DX[dir];
        const ny = pos.y + DY[dir];
        const next = grid[ny]?.[nx];
        if (!next) continue;
        const enterFace = OPPOSITE_DIR[dir];
        if (next.blockEnter?.[enterFace]) continue;
        const key = `${nx},${ny}`;
        if (!seen.has(key)) {
          seen.add(key);
          queue.push({ x: nx, y: ny, dist: pos.dist + 1 });
        }
      }
    }
    return Infinity;
  };

  const a = { x: gate.x, y: gate.y };
  const b = { x: gate.nx, y: gate.ny };
  return dist(b) >= dist(a) ? b : a;
}

export function ensureWardenGate(grid, floor, generatedGate = null, rng = Math.random) {
  if (!grid || floor < 1 || floor > 5) return null;
  const existing = findWardenGate(grid, floor);
  if (existing) return existing;
  if (generatedGate) return generatedGate;

  const start = floor === 1 ? { x: START_X, y: START_Y } : findMapCellByType(grid, "stairs-up");
  const stairsDown = findMapCellByType(grid, "stairs-down");
  if (!start || !stairsDown) return null;
  return placeWardenGateWithStairFallback(grid, floor, start, stairsDown, rng).gate;
}

export function applyOpenedGatesToMap(grid, openedGates = []) {
  if (!grid || !Array.isArray(openedGates)) return;
  const opened = new Set(openedGates);
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      const cell = grid[y]?.[x];
      if (!cell?.sealedGate) continue;
      for (let dir = 0; dir < 4; dir++) {
        const gate = cell.sealedGate[dir];
        if (!gate?.id || !opened.has(gate.id)) continue;
        gate.open = true;
        const nx = x + DX[dir];
        const ny = y + DY[dir];
        const next = grid[ny]?.[nx];
        if (next?.sealedGate?.[OPPOSITE_DIR[dir]]) {
          next.sealedGate[OPPOSITE_DIR[dir]].open = true;
        }
        openWall(grid, x, y, dir);
      }
    }
  }
}

export function createWardenMonster(floor, gate, grid) {
  if (!gate || floor < 1 || floor > 5) return null;
  const start = floor === 1 ? { x: START_X, y: START_Y } : findMapCellByType(grid, "stairs-up");
  const home = getGateHome(grid, gate, start || { x: gate.x, y: gate.y });
  const safeHome = grid[home.y]?.[home.x]?.event === "boss" ? { x: gate.x, y: gate.y } : home;
  return {
    id: `B${floor}_WARDEN`,
    floor,
    x: safeHome.x,
    y: safeHome.y,
    name: floor === 4 ? "フラック" : `封印門の門番 B${floor}`,
    kind: "warden",
    perception: getWardenPerception(floor),
    homeX: safeHome.x,
    homeY: safeHome.y,
    gateId: gate.id
  };
}
