import { DIR_N, DIR_E, DIR_S, DIR_W, MAP_WIDTH, MAP_HEIGHT, EVENT_TYPES, TRAP_TYPES } from "./data.js";
import { createRng } from "./seed_rng.js";

// Directions helper
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
const OPPOSITE_DIR = [DIR_S, DIR_W, DIR_N, DIR_E];

const PITFALL_PROBABILITIES = {
  1: 0.05,
  2: 0.08,
  3: 0.12
};

const ONE_WAY_PASSAGE_COUNTS = {
  1: 2,
  2: 3,
  3: 4,
  4: 5,
  5: 5
};
export const ONE_WAY_MIN_DETOUR = 6;
export const ONE_WAY_MAX_DETOUR = 64;
export const CHEST_COUNT_RANGE = [8, 12];

const SECRET_DOOR_COUNTS = {
  1: { shortcut: 1, room: 1 },
  2: { shortcut: 2, room: 1 },
  3: { shortcut: 2, room: 1 },
  4: { shortcut: 2, room: 2 },
  5: { shortcut: 3, room: 2 }
};

// Preserve the existing sparse/dense profile split while bounding endpoint counts.
const DEAD_END_TARGET_RANGE = [15, 38];

export const WARDEN_GATE_FLOORS = [1, 2, 3, 4, 5];
export const WARDEN_GATE_DETOUR_STAGES = [8, 6, 4];
const WARDEN_GATE_CANDIDATE_LIMIT = 40;
const WARDEN_GATE_CANDIDATE_LIMIT_RETRY = 80;

function isWalkableCell(cell) {
  return cell.walls.some(w => !w) || cell.secretDoor.some(Boolean);
}

function getMapWidth(grid) {
  return grid[0]?.length ?? 0;
}

function getMapHeight(grid) {
  return grid.length;
}

function isPassageCell(grid, x, y) {
  return x >= 0 &&
    x < getMapWidth(grid) &&
    y >= 0 &&
    y < getMapHeight(grid) &&
    grid[y][x].walls.some(w => !w);
}

function countOpenFaceEdges(grid, centerX, centerY) {
  return [
    grid[centerY - 1]?.[centerX],
    grid[centerY]?.[centerX + 1],
    grid[centerY + 1]?.[centerX],
    grid[centerY]?.[centerX - 1]
  ].filter(cell => cell?.walls.some(wall => !wall)).length;
}

function countCreatedTightUTurns(grid, x, y, dir) {
  const middleX = x + DX[dir];
  const middleY = y + DY[dir];
  const faceCenters = DX[dir] === 0
    ? [{ x: middleX - 1, y: middleY }, { x: middleX + 1, y: middleY }]
    : [{ x: middleX, y: middleY - 1 }, { x: middleX, y: middleY + 1 }];

  return faceCenters.filter(center =>
    center.x > 0 && center.x < getMapWidth(grid) - 1 &&
    center.y > 0 && center.y < getMapHeight(grid) - 1 &&
    grid[center.y][center.x].walls.every(Boolean) &&
    countOpenFaceEdges(grid, center.x, center.y) === 2
  ).length;
}

function collectReachableDeadEnds(grid, start, protectedKeys) {
  const reachableKeys = getReachableCellKeys(grid, start);
  const deadEnds = [];
  for (let y = 1; y < getMapHeight(grid) - 1; y++) {
    for (let x = 1; x < getMapWidth(grid) - 1; x++) {
      if (protectedKeys.has(`${x},${y}`) || !reachableKeys.has(`${x},${y}`)) continue;
      if (grid[y][x].walls.filter(wall => !wall).length === 1) deadEnds.push({ x, y });
    }
  }
  return deadEnds;
}

function isNubDeadEnd(grid, leaf) {
  const openDirs = grid[leaf.y][leaf.x].walls
    .map((wall, dir) => wall ? -1 : dir)
    .filter(dir => dir !== -1);
  if (openDirs.length !== 1) return false;

  const openDir = openDirs[0];
  const neighbor = grid[leaf.y + DY[openDir]]?.[leaf.x + DX[openDir]];
  return neighbor?.walls.filter(wall => !wall).length >= 3;
}

function isSealedCell(grid, x, y, protectedKeys) {
  return x > 0 &&
    x < getMapWidth(grid) - 1 &&
    y > 0 &&
    y < getMapHeight(grid) - 1 &&
    !protectedKeys.has(`${x},${y}`) &&
    grid[y][x].walls.every(Boolean);
}

function collectBranchGrowthCandidates(grid, protectedKeys, reachableKeys) {
  const candidates = [];
  for (let y = 1; y < getMapHeight(grid) - 1; y++) {
    for (let x = 1; x < getMapWidth(grid) - 1; x++) {
      if (!isSealedCell(grid, x, y, protectedKeys)) continue;

      const passageNeighborDirs = [];
      for (let dir = 0; dir < 4; dir++) {
        if (isPassageCell(grid, x + DX[dir], y + DY[dir])) passageNeighborDirs.push(dir);
      }
      if (passageNeighborDirs.length !== 1) continue;

      const attachDir = passageNeighborDirs[0];
      const attachX = x + DX[attachDir];
      const attachY = y + DY[attachDir];
      const attachCell = grid[attachY][attachX];
      if (!reachableKeys.has(`${attachX},${attachY}`) || attachCell.walls.filter(wall => !wall).length < 2) continue;

      for (let extendDir = 0; extendDir < 4; extendDir++) {
        if (extendDir === attachDir) continue;
        const bx = x + DX[extendDir];
        const by = y + DY[extendDir];
        if (!isSealedCell(grid, bx, by, protectedKeys)) continue;

        let touchesPassage = false;
        for (let dir = 0; dir < 4; dir++) {
          if (isPassageCell(grid, bx + DX[dir], by + DY[dir])) {
            touchesPassage = true;
            break;
          }
        }
        if (touchesPassage) continue;

        candidates.push({
          a: { x, y },
          attachDir,
          extendDir,
          straight: extendDir === OPPOSITE_DIR[attachDir]
        });
      }
    }
  }
  return candidates;
}

function normalizeDeadEndCount(grid, start, protectedKeys, target, rng) {
  let deadEnds = collectReachableDeadEnds(grid, start, protectedKeys);

  while (deadEnds.length > target) {
    const prunableDeadEnds = deadEnds.filter(leaf => {
      const openDir = grid[leaf.y][leaf.x].walls.findIndex(wall => !wall);
      const neighborX = leaf.x + DX[openDir];
      const neighborY = leaf.y + DY[openDir];
      const closesStartEdge = neighborX === start.x && neighborY === start.y;
      return !closesStartEdge || grid[start.y][start.x].walls.filter(wall => !wall).length > 2;
    });
    if (prunableDeadEnds.length === 0) break;
    const nubDeadEnds = prunableDeadEnds.filter(leaf => isNubDeadEnd(grid, leaf));
    const prunePool = nubDeadEnds.length > 0 ? nubDeadEnds : prunableDeadEnds;
    const leaf = prunePool[Math.floor(rng() * prunePool.length)];
    const openDir = leaf && grid[leaf.y][leaf.x].walls.findIndex(wall => !wall);
    if (openDir === -1) break;
    closeWall(grid, leaf.x, leaf.y, openDir);
    deadEnds = collectReachableDeadEnds(grid, start, protectedKeys);
  }

  while (deadEnds.length < target) {
    const reachableKeys = getReachableCellKeys(grid, start);
    const branchCandidates = collectBranchGrowthCandidates(grid, protectedKeys, reachableKeys);
    if (branchCandidates.length > 0) {
      const straightCandidates = branchCandidates.filter(candidate => candidate.straight);
      const growthPool = straightCandidates.length > 0 ? straightCandidates : branchCandidates;
      const candidate = growthPool[Math.floor(rng() * growthPool.length)];
      openWall(grid, candidate.a.x, candidate.a.y, candidate.attachDir);
      openWall(grid, candidate.a.x, candidate.a.y, candidate.extendDir);
      deadEnds = collectReachableDeadEnds(grid, start, protectedKeys);
      continue;
    }

    const candidates = [];
    for (let y = 1; y < getMapHeight(grid) - 1; y++) {
      for (let x = 1; x < getMapWidth(grid) - 1; x++) {
        if (protectedKeys.has(`${x},${y}`) || !grid[y][x].walls.every(Boolean)) continue;
        const attachmentDirs = [];
        const passageNeighborDirs = [];
        for (let dir = 0; dir < 4; dir++) {
          const nx = x + DX[dir];
          const ny = y + DY[dir];
          const next = grid[ny]?.[nx];
          if (next && next.walls.some(wall => !wall)) passageNeighborDirs.push(dir);
          if (next && reachableKeys.has(`${nx},${ny}`) && next.walls.filter(wall => !wall).length >= 2) {
            attachmentDirs.push(dir);
          }
        }
        if (passageNeighborDirs.length !== 1) continue;
        if (!attachmentDirs.includes(passageNeighborDirs[0])) continue;
        candidates.push({ x, y, attachmentDirs: [passageNeighborDirs[0]] });
      }
    }
    if (candidates.length === 0) break;
    const candidate = candidates[Math.floor(rng() * candidates.length)];
    const dir = candidate.attachmentDirs[Math.floor(rng() * candidate.attachmentDirs.length)];
    openWall(grid, candidate.x, candidate.y, dir);
    deadEnds = collectReachableDeadEnds(grid, start, protectedKeys);
  }

  return deadEnds;
}

function getInternalWallEdges(grid) {
  const edges = [];

  for (let y = 1; y < getMapHeight(grid) - 1; y++) {
    for (let x = 1; x < getMapWidth(grid) - 1; x++) {
      if (!isPassageCell(grid, x, y)) continue;

      if (grid[y][x].walls[DIR_E] && !grid[y][x].secretDoor?.[DIR_E] && !grid[y][x].sealedGate?.[DIR_E] && isPassageCell(grid, x + 1, y)) {
        edges.push({
          x,
          y,
          dir: DIR_E,
          a: `${x + 1},${y}`,
          b: `${x + 1},${y + 1}`
        });
      }

      if (grid[y][x].walls[DIR_S] && !grid[y][x].secretDoor?.[DIR_S] && !grid[y][x].sealedGate?.[DIR_S] && isPassageCell(grid, x, y + 1)) {
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

export function openWall(grid, x, y, dir) {
  const nx = x + DX[dir];
  const ny = y + DY[dir];
  if (nx < 0 || nx >= getMapWidth(grid) || ny < 0 || ny >= getMapHeight(grid)) return;

  grid[y][x].walls[dir] = false;
  grid[ny][nx].walls[OPPOSITE_DIR[dir]] = false;
}

function setSecretDoor(grid, x, y, dir) {
  const nx = x + DX[dir];
  const ny = y + DY[dir];
  const next = grid[ny]?.[nx];
  if (!next) return false;

  const cell = grid[y][x];
  cell.secretDoor[dir] = true;
  cell.secretFound[dir] = false;
  next.secretDoor[OPPOSITE_DIR[dir]] = true;
  next.secretFound[OPPOSITE_DIR[dir]] = false;
  cell.walls[dir] = true;
  next.walls[OPPOSITE_DIR[dir]] = true;
  return true;
}

function ensureSealedGateArrays(cell) {
  if (!Array.isArray(cell.sealedGate) || cell.sealedGate.length !== 4) {
    cell.sealedGate = [null, null, null, null];
  }
}

function setSealedGate(grid, floor, edge, start) {
  const id = `B${floor}_WARDEN_GATE`;
  const cell = grid[edge.y][edge.x];
  const next = grid[edge.ny][edge.nx];
  ensureSealedGateArrays(cell);
  ensureSealedGateArrays(next);

  const startToA = getDirectedDistance(grid, start, { x: edge.x, y: edge.y });
  const startToB = getDirectedDistance(grid, start, { x: edge.nx, y: edge.ny });
  const home = edge.home || (startToB >= startToA ? { x: edge.nx, y: edge.ny } : { x: edge.x, y: edge.y });

  const gate = {
    id,
    floor,
    x: edge.x,
    y: edge.y,
    dir: edge.dir,
    nx: edge.nx,
    ny: edge.ny,
    homeX: home.x,
    homeY: home.y,
    shortcutDelta: edge.shortcutDelta
  };

  cell.walls[edge.dir] = true;
  next.walls[OPPOSITE_DIR[edge.dir]] = true;
  cell.sealedGate[edge.dir] = { id, open: false };
  next.sealedGate[OPPOSITE_DIR[edge.dir]] = { id, open: false };
  return gate;
}

function closeWall(grid, x, y, dir) {
  const nx = x + DX[dir];
  const ny = y + DY[dir];
  const next = grid[ny]?.[nx];
  if (!next) return;
  grid[y][x].walls[dir] = true;
  next.walls[OPPOSITE_DIR[dir]] = true;
}

function canEnterFrom(grid, x, y, dir) {
  const nx = x + DX[dir];
  const ny = y + DY[dir];
  const next = grid[ny]?.[nx];
  if (!next) return false;
  return !next.blockEnter?.[OPPOSITE_DIR[dir]];
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
      if (nx < 0 || nx >= getMapWidth(grid) || ny < 0 || ny >= getMapHeight(grid)) continue;

      const key = `${nx},${ny}`;
      if (!seen.has(key)) {
        seen.add(key);
        queue.push({ x: nx, y: ny });
      }
    }
  }

  return seen;
}

// そのマスを塞ぐと下り階段へ到達できなくなるならチョークポイント。
// Tarjanの関節点は「グラフ全体を切る点」であって「スタートと階段を切る点」
// ではないため使わない。30x30・歩行可能セル数百なら総当たりBFSで足りる。
export function isChokeCell(grid, cell, start, stairsDown) {
  if (!stairsDown) return false;
  if (cell.x === start.x && cell.y === start.y) return false;

  const blocked = `${cell.x},${cell.y}`;
  const startKey = `${start.x},${start.y}`;
  if (blocked === startKey) return false;

  const queue = [start];
  const seen = new Set([startKey]);
  const targetKey = `${stairsDown.x},${stairsDown.y}`;

  for (const pos of queue) {
    const current = grid[pos.y]?.[pos.x];
    if (!current) continue;

    for (let dir = 0; dir < 4; dir++) {
      if (current.walls[dir] || !canEnterFrom(grid, pos.x, pos.y, dir)) continue;

      const nx = pos.x + DX[dir];
      const ny = pos.y + DY[dir];
      if (nx < 0 || nx >= getMapWidth(grid) || ny < 0 || ny >= getMapHeight(grid)) continue;

      const key = `${nx},${ny}`;
      if (key === blocked || seen.has(key)) continue;
      if (key === targetKey) return false;

      seen.add(key);
      queue.push({ x: nx, y: ny });
    }
  }

  return !seen.has(targetKey);
}

// 深度は無限スケールなので、B5でカンストする段階分類は使わず連続式にする。
// 上限0.55は必須。全てを関所にすると回避判断が消える。
export function getTrapChokeRate(floor) {
  const depth = Math.max(1, Math.floor(Number(floor) || 1));
  const raw = depth >= 12 ? 0.55 : 0.10 + 0.04 * (depth - 1);
  return Math.round(Math.min(0.55, raw) * 1000) / 1000;
}

function getDistanceMap(grid, start) {
  const queue = [{ ...start, distance: 0 }];
  const distances = new Map([[`${start.x},${start.y}`, 0]]);

  for (const pos of queue) {
    const cell = grid[pos.y]?.[pos.x];
    if (!cell) continue;

    for (let dir = 0; dir < 4; dir++) {
      if (cell.walls[dir]) continue;
      const nx = pos.x + DX[dir];
      const ny = pos.y + DY[dir];
      const key = `${nx},${ny}`;
      if (!grid[ny]?.[nx] || distances.has(key)) continue;
      const distance = pos.distance + 1;
      distances.set(key, distance);
      queue.push({ x: nx, y: ny, distance });
    }
  }

  return distances;
}

function getDirectedReachableCellKeys(grid, start) {
  const queue = [start];
  const seen = new Set([`${start.x},${start.y}`]);

  for (const pos of queue) {
    const cell = grid[pos.y]?.[pos.x];
    if (!cell) continue;

    for (let dir = 0; dir < 4; dir++) {
      if (cell.walls[dir] || !canEnterFrom(grid, pos.x, pos.y, dir)) continue;

      const nx = pos.x + DX[dir];
      const ny = pos.y + DY[dir];
      if (nx < 0 || nx >= getMapWidth(grid) || ny < 0 || ny >= getMapHeight(grid)) continue;

      const key = `${nx},${ny}`;
      if (!seen.has(key)) {
        seen.add(key);
        queue.push({ x: nx, y: ny });
      }
    }
  }

  return seen;
}

function getDirectedDistance(grid, start, target) {
  const targetKey = `${target.x},${target.y}`;
  const queue = [{ ...start, dist: 0 }];
  const seen = new Set([`${start.x},${start.y}`]);

  for (const pos of queue) {
    if (`${pos.x},${pos.y}` === targetKey) return pos.dist;
    const cell = grid[pos.y]?.[pos.x];
    if (!cell) continue;

    for (let dir = 0; dir < 4; dir++) {
      if (cell.walls[dir] || !canEnterFrom(grid, pos.x, pos.y, dir)) continue;

      const nx = pos.x + DX[dir];
      const ny = pos.y + DY[dir];
      if (nx < 0 || nx >= getMapWidth(grid) || ny < 0 || ny >= getMapHeight(grid)) continue;

      const key = `${nx},${ny}`;
      if (!seen.has(key)) {
        seen.add(key);
        queue.push({ x: nx, y: ny, dist: pos.dist + 1 });
      }
    }
  }

  return Infinity;
}

function getDirectedDistanceMap(grid, start) {
  const queue = [{ ...start, dist: 0 }];
  const distances = new Map([[`${start.x},${start.y}`, 0]]);

  for (const pos of queue) {
    const cell = grid[pos.y]?.[pos.x];
    if (!cell) continue;

    for (let dir = 0; dir < 4; dir++) {
      if (cell.walls[dir] || !canEnterFrom(grid, pos.x, pos.y, dir)) continue;

      const nx = pos.x + DX[dir];
      const ny = pos.y + DY[dir];
      if (nx < 0 || nx >= getMapWidth(grid) || ny < 0 || ny >= getMapHeight(grid)) continue;

      const key = `${nx},${ny}`;
      if (!distances.has(key)) {
        const distance = pos.dist + 1;
        distances.set(key, distance);
        queue.push({ x: nx, y: ny, dist: distance });
      }
    }
  }

  return distances;
}

function getUndirectedEdgeKey(x, y, nx, ny) {
  return y < ny || (y === ny && x < nx)
    ? `${x},${y}:${nx},${ny}`
    : `${nx},${ny}:${x},${y}`;
}

function getNonBridgePassageEdges(grid) {
  const edges = [];
  const discovery = new Map();
  const lowLink = new Map();
  const bridges = new Set();
  let nextDiscovery = 0;

  function visit(x, y, parentKey = null) {
    const key = `${x},${y}`;
    const discoveredAt = nextDiscovery++;
    discovery.set(key, discoveredAt);
    lowLink.set(key, discoveredAt);

    const cell = grid[y][x];
    for (let dir = 0; dir < 4; dir++) {
      if (cell.walls[dir]) continue;
      const nx = x + DX[dir];
      const ny = y + DY[dir];
      if (!isPassageCell(grid, nx, ny)) continue;

      const neighborKey = `${nx},${ny}`;
      if (neighborKey === parentKey) continue;

      if (!discovery.has(neighborKey)) {
        visit(nx, ny, key);
        lowLink.set(key, Math.min(lowLink.get(key), lowLink.get(neighborKey)));
        if (lowLink.get(neighborKey) > discoveredAt) {
          bridges.add(getUndirectedEdgeKey(x, y, nx, ny));
        }
      } else {
        lowLink.set(key, Math.min(lowLink.get(key), discovery.get(neighborKey)));
      }
    }
  }

  for (let y = 0; y < getMapHeight(grid); y++) {
    for (let x = 0; x < getMapWidth(grid); x++) {
      const key = `${x},${y}`;
      if (isPassageCell(grid, x, y) && !discovery.has(key)) visit(x, y);
    }
  }

  for (let y = 1; y < getMapHeight(grid) - 1; y++) {
    for (let x = 1; x < getMapWidth(grid) - 1; x++) {
      const cell = grid[y][x];
      if (!isPassageCell(grid, x, y)) continue;

      [DIR_E, DIR_S].forEach(dir => {
        if (cell.walls[dir]) return;
        const nx = x + DX[dir];
        const ny = y + DY[dir];
        if (!isPassageCell(grid, nx, ny)) return;

        const edge = { x, y, nx, ny, dir };
        if (!bridges.has(getUndirectedEdgeKey(x, y, nx, ny))) edges.push(edge);
      });
    }
  }

  return edges;
}

function getOpenPassageEdges(grid) {
  const edges = [];

  for (let y = 1; y < getMapHeight(grid) - 1; y++) {
    for (let x = 1; x < getMapWidth(grid) - 1; x++) {
      const cell = grid[y][x];
      if (!isPassageCell(grid, x, y)) continue;

      [DIR_E, DIR_S].forEach(dir => {
        if (cell.walls[dir] || cell.blockEnter?.[dir]) return;
        const nx = x + DX[dir];
        const ny = y + DY[dir];
        const next = grid[ny]?.[nx];
        if (!next || next.walls[OPPOSITE_DIR[dir]] || next.blockEnter?.[OPPOSITE_DIR[dir]]) return;
        if (!isPassageCell(grid, nx, ny)) return;
        edges.push({ x, y, nx, ny, dir });
      });
    }
  }

  return edges;
}

function getCarvedShortcutEdges(grid) {
  const edges = [];

  for (let y = 1; y < getMapHeight(grid) - 1; y++) {
    for (let x = 1; x < getMapWidth(grid) - 1; x++) {
      const cell = grid[y][x];
      if (cell.type !== "empty" || cell.event || cell.walls.some(w => !w)) continue;

      const adjacent = [];
      for (let dir = 0; dir < 4; dir++) {
        const nx = x + DX[dir];
        const ny = y + DY[dir];
        if (isPassageCell(grid, nx, ny)) adjacent.push({ x: nx, y: ny, dir });
      }
      if (adjacent.length !== 2) continue;

      for (let i = 0; i < adjacent.length; i++) {
        for (let j = 0; j < adjacent.length; j++) {
          if (i === j) continue;
          const gateSide = adjacent[i];
          const openSide = adjacent[j];
          edges.push({
            x,
            y,
            nx: gateSide.x,
            ny: gateSide.y,
            dir: gateSide.dir,
            carveDir: openSide.dir,
            home: { x: openSide.x, y: openSide.y }
          });
        }
      }
    }
  }

  return edges;
}

function getRequiredReachableKeys(grid, stairsDownCoord, bossCoord) {
  const keys = new Set();

  if (stairsDownCoord) keys.add(`${stairsDownCoord.x},${stairsDownCoord.y}`);
  if (bossCoord) keys.add(`${bossCoord.x},${bossCoord.y}`);

  for (let y = 1; y < getMapHeight(grid) - 1; y++) {
    for (let x = 1; x < getMapWidth(grid) - 1; x++) {
      const cell = grid[y][x];
      if (cell.event || cell.type === "stairs-down") keys.add(`${x},${y}`);
    }
  }

  return keys;
}

function canReachAllRequired(grid, start, requiredKeys) {
  const reachable = getDirectedReachableCellKeys(grid, start);
  return [...requiredKeys].every(key => reachable.has(key));
}

function shuffleInPlace(array, rng) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function getOneWayReverseDetourDistance(grid, option) {
  const reverseStart = {
    x: option.x + DX[option.blockDir],
    y: option.y + DY[option.blockDir]
  };
  return getDirectedDistance(grid, reverseStart, { x: option.x, y: option.y });
}

function hasValidOneWayReverseDetours(grid) {
  for (let y = 1; y < getMapHeight(grid) - 1; y++) {
    for (let x = 1; x < getMapWidth(grid) - 1; x++) {
      for (let blockDir = 0; blockDir < 4; blockDir++) {
        if (!grid[y][x].blockEnter[blockDir]) continue;
        const distance = getOneWayReverseDetourDistance(grid, { x, y, blockDir });
        if (!Number.isFinite(distance) || distance < ONE_WAY_MIN_DETOUR || distance > ONE_WAY_MAX_DETOUR) {
          return false;
        }
      }
    }
  }
  return true;
}

function removeInvalidOneWayPassages(grid, start) {
  let removed;
  do {
    removed = false;
    for (let y = 1; y < getMapHeight(grid) - 1 && !removed; y++) {
      for (let x = 1; x < getMapWidth(grid) - 1 && !removed; x++) {
        for (let blockDir = 0; blockDir < 4; blockDir++) {
          if (!grid[y][x].blockEnter[blockDir]) continue;
          const distance = getOneWayReverseDetourDistance(grid, { x, y, blockDir });
          const crossed = { x: x + DX[blockDir], y: y + DY[blockDir] };
          if (Number.isFinite(distance) &&
              distance >= ONE_WAY_MIN_DETOUR &&
              distance <= ONE_WAY_MAX_DETOUR &&
              Number.isFinite(getDirectedDistance(grid, crossed, start))) continue;
          grid[y][x].blockEnter[blockDir] = false;
          removed = true;
          break;
        }
      }
    }
  } while (removed);
}

function placeSecretShortcuts(grid, targetCount, protectedRoomKeys, rng) {
  const candidates = [];

  for (let y = 1; y < getMapHeight(grid) - 1; y++) {
    for (let x = 1; x < getMapWidth(grid) - 1; x++) {
      const cell = grid[y][x];
      if (cell.type !== "empty" || cell.event || cell.walls.some(w => !w) || cell.secretDoor.some(Boolean)) continue;
      if ([0, 1, 2, 3].some(dir => protectedRoomKeys.has(`${x + DX[dir]},${y + DY[dir]}`))) continue;

      const adjacentDirs = [];
      for (let dir = 0; dir < 4; dir++) {
        const nx = x + DX[dir];
        const ny = y + DY[dir];
        const next = grid[ny]?.[nx];
        if (next && isWalkableCell(next)) adjacentDirs.push(dir);
      }
      if (adjacentDirs.length === 2) candidates.push({ x, y });
    }
  }

  shuffleInPlace(candidates, rng);
  let placed = 0;
  for (const candidate of candidates) {
    if (placed >= targetCount) break;
    const cell = grid[candidate.y][candidate.x];
    if (cell.type !== "empty" || cell.event || cell.walls.some(w => !w) || cell.secretDoor.some(Boolean)) continue;
    if ([0, 1, 2, 3].some(dir => protectedRoomKeys.has(`${candidate.x + DX[dir]},${candidate.y + DY[dir]}`))) continue;

    const adjacentDirs = [];
    for (let dir = 0; dir < 4; dir++) {
      const next = grid[candidate.y + DY[dir]]?.[candidate.x + DX[dir]];
      if (next && isWalkableCell(next)) adjacentDirs.push(dir);
    }
    if (adjacentDirs.length !== 2) continue;

    adjacentDirs.forEach(dir => setSecretDoor(grid, candidate.x, candidate.y, dir));
    placed++;
  }
  return placed;
}

function getSecretRoomCandidates(grid, requiredKeys, start) {
  const candidates = [];
  const reachableKeys = getDirectedReachableCellKeys(grid, start);

  for (let y = 1; y < getMapHeight(grid) - 1; y++) {
    for (let x = 1; x < getMapWidth(grid) - 1; x++) {
      const roomCell = grid[y][x];
      if (!roomCell.walls.every(Boolean) || roomCell.event || roomCell.type !== "empty") continue;
      if (requiredKeys.has(`${x},${y}`)) continue;

      const walkableDirs = [];
      for (let dir = 0; dir < 4; dir++) {
        const neighbor = grid[y + DY[dir]]?.[x + DX[dir]];
        if (neighbor && isWalkableCell(neighbor)) walkableDirs.push(dir);
      }
      if (walkableDirs.length !== 1) continue;

      for (const dir of walkableDirs) {
        const px = x + DX[dir];
        const py = y + DY[dir];
        const passage = grid[py]?.[px];
        if (!passage || !isPassageCell(grid, px, py)) continue;
        if (!reachableKeys.has(`${px},${py}`)) continue;
        if (passage.event || passage.type !== "empty") continue;
        const passageDir = OPPOSITE_DIR[dir];
        if (!passage.walls[passageDir] || !roomCell.walls[dir]) continue;
        candidates.push({ roomX: x, roomY: y, passageX: px, passageY: py, passageDir });
      }
    }
  }

  return candidates;
}

function ensureSecretRoomCandidates(grid, targetCount, requiredKeys, start, rng) {
  let candidates = getSecretRoomCandidates(grid, requiredKeys, start);
  let protectedCount = selectProtectedSecretRoomKeys(candidates, targetCount).size;
  while (protectedCount < targetCount) {
    const reachableKeys = getDirectedReachableCellKeys(grid, start);
    const deadEnds = [];
    for (let y = 1; y < getMapHeight(grid) - 1; y++) {
      for (let x = 1; x < getMapWidth(grid) - 1; x++) {
        const cell = grid[y][x];
        const openDir = cell.walls.findIndex(wall => !wall);
        if (cell.walls.filter(wall => !wall).length !== 1 || cell.event || cell.trap || cell.type !== "empty") continue;
        if (cell.secretDoor.some(Boolean) || cell.blockEnter.some(Boolean) || requiredKeys.has(`${x},${y}`)) continue;
        if (!reachableKeys.has(`${x},${y}`)) continue;

        const nx = x + DX[openDir];
        const ny = y + DY[openDir];
        const neighbor = grid[ny]?.[nx];
        if (!neighbor || neighbor.event || neighbor.type !== "empty" || neighbor.blockEnter.some(Boolean)) continue;
        deadEnds.push({ x, y, openDir });
      }
    }

    shuffleInPlace(deadEnds, rng);
    let created = false;
    for (const deadEnd of deadEnds) {
      closeWall(grid, deadEnd.x, deadEnd.y, deadEnd.openDir);
      const nextCandidates = getSecretRoomCandidates(grid, requiredKeys, start);
      const nextProtectedCount = selectProtectedSecretRoomKeys(nextCandidates, targetCount).size;
      if (nextProtectedCount > protectedCount) {
        candidates = nextCandidates;
        protectedCount = nextProtectedCount;
        created = true;
        break;
      }
      openWall(grid, deadEnd.x, deadEnd.y, deadEnd.openDir);
    }
    if (!created) break;
  }
  return candidates;
}

function selectProtectedSecretRoomKeys(candidates, targetCount, initialKeys = new Set()) {
  const keys = new Set(initialKeys);
  for (const candidate of candidates) {
    if (keys.size >= targetCount) break;
    const touchesProtected = [...keys].some(key => {
      const [x, y] = key.split(",").map(Number);
      return Math.abs(candidate.roomX - x) + Math.abs(candidate.roomY - y) === 1;
    });
    if (!touchesProtected) keys.add(`${candidate.roomX},${candidate.roomY}`);
  }
  return keys;
}

function placeSecretRooms(grid, targetCount, requiredKeys, start, protectedRoomKeys, rng) {
  const candidates = getSecretRoomCandidates(grid, requiredKeys, start);

  shuffleInPlace(candidates, rng);
  candidates.sort((a, b) =>
    Number(protectedRoomKeys.has(`${b.roomX},${b.roomY}`)) -
    Number(protectedRoomKeys.has(`${a.roomX},${a.roomY}`))
  );
  let placed = 0;
  for (const candidate of candidates) {
    if (placed >= targetCount) break;

    const room = grid[candidate.roomY][candidate.roomX];
    if (!room.walls.every(Boolean) || room.event || room.type !== "empty") continue;

    const walkableDirs = [];
    for (let dir = 0; dir < 4; dir++) {
      const neighbor = grid[candidate.roomY + DY[dir]]?.[candidate.roomX + DX[dir]];
      if (neighbor && isWalkableCell(neighbor)) walkableDirs.push(dir);
    }
    if (walkableDirs.length !== 1 || walkableDirs[0] !== OPPOSITE_DIR[candidate.passageDir]) continue;
    if (!setSecretDoor(grid, candidate.passageX, candidate.passageY, candidate.passageDir)) continue;

    room.event = rng() < 0.75 ? EVENT_TYPES.CHEST : EVENT_TYPES.TABLET;
    placed++;
  }
  return placed;
}

function placeSecretDoors(grid, floor, start, stairsDownCoord, bossCoord, rng, counts = null) {
  counts ||= SECRET_DOOR_COUNTS[floor] || { shortcut: 0, room: 0 };
  const requiredKeys = getRequiredReachableKeys(grid, stairsDownCoord, bossCoord);
  const initialRoomCandidates = getSecretRoomCandidates(grid, requiredKeys, start);
  let protectedRoomKeys = selectProtectedSecretRoomKeys(initialRoomCandidates, counts.room);
  const shortcuts = placeSecretShortcuts(grid, counts.shortcut, protectedRoomKeys, rng);
  const roomCandidates = ensureSecretRoomCandidates(grid, counts.room, requiredKeys, start, rng);
  protectedRoomKeys = selectProtectedSecretRoomKeys(roomCandidates, counts.room, protectedRoomKeys);
  const rooms = placeSecretRooms(grid, counts.room, requiredKeys, start, protectedRoomKeys, rng);

  if (!canReachAllRequired(grid, start, requiredKeys)) {
    throw new Error(`B${floor}F required path blocked by secret doors`);
  }

  return { shortcuts, rooms };
}

function placeOneWayPassages(grid, floor, start, stairsDownCoord, bossCoord, rng, requestedCount = null) {
  const requiredKeys = getRequiredReachableKeys(grid, stairsDownCoord, bossCoord);
  const edges = getNonBridgePassageEdges(grid);
  const targetCount = Math.min(requestedCount ?? ONE_WAY_PASSAGE_COUNTS[floor] ?? 0, edges.length);
  let placed = 0;
  const usedEdges = new Set();

  for (let i = edges.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [edges[i], edges[j]] = [edges[j], edges[i]];
  }

  const candidates = edges.map(edge => ({
    key: `${edge.x},${edge.y},${edge.dir}`,
    options: rng() < 0.5
      ? [
          { x: edge.x, y: edge.y, blockDir: edge.dir },
          { x: edge.nx, y: edge.ny, blockDir: OPPOSITE_DIR[edge.dir] }
        ]
      : [
          { x: edge.nx, y: edge.ny, blockDir: OPPOSITE_DIR[edge.dir] },
          { x: edge.x, y: edge.y, blockDir: edge.dir }
        ]
  }));

  for (const candidate of candidates) {
    if (placed >= targetCount) break;
    if (usedEdges.has(candidate.key)) continue;

    for (const option of candidate.options) {
      const cell = grid[option.y][option.x];
      if (cell.blockEnter[option.blockDir]) continue;

      cell.blockEnter[option.blockDir] = true;
      if (hasValidOneWayReverseDetours(grid) && canReachAllRequired(grid, start, requiredKeys)) {
        usedEdges.add(candidate.key);
        placed++;
        break;
      }
      cell.blockEnter[option.blockDir] = false;
    }
  }

  return placed;
}

export function placeWardenGate(grid, floor, start, stairsDownCoord, rng = Math.random, candidateLimit = WARDEN_GATE_CANDIDATE_LIMIT) {
  if (!WARDEN_GATE_FLOORS.includes(floor) || !stairsDownCoord) return null;

  const startDistances = getDirectedDistanceMap(grid, start);
  const openedDistance = startDistances.get(`${stairsDownCoord.x},${stairsDownCoord.y}`) ?? Infinity;
  if (!Number.isFinite(openedDistance)) return null;
  const minStartDistance = Math.max(5, Math.floor(openedDistance * 0.3));
  const requiredKeys = getRequiredReachableKeys(grid, stairsDownCoord, null);

  const openEdgeCandidates = getOpenPassageEdges(grid)
    .map(edge => ({
      ...edge,
      roughPotential: -(manhattan(start, { x: edge.x, y: edge.y }) + manhattan({ x: edge.nx, y: edge.ny }, stairsDownCoord))
    }))
    .sort((a, b) => b.roughPotential - a.roughPotential);
  const openEdges = openEdgeCandidates.slice(0, candidateLimit);
  const carvedEdgeCandidates = getCarvedShortcutEdges(grid)
    .filter(edge => !grid[edge.y][edge.x].secretDoor.some(Boolean) &&
      [0, 1, 2, 3].every(dir =>
        !grid[edge.y + DY[dir]][edge.x + DX[dir]].secretDoor.some(Boolean)
      ))
    .map(edge => ({
      ...edge,
      roughPotential: openedDistance - (manhattan(start, { x: edge.nx, y: edge.ny }) + 2 + manhattan(edge.home, stairsDownCoord))
    }))
    .sort((a, b) => b.roughPotential - a.roughPotential);
  const carvedEdges = carvedEdgeCandidates.slice(0, candidateLimit);

  const candidates = [...openEdges, ...carvedEdges]
    .map(edge => {
      let candidateDistance;
      let requiredReachable;
      let shortcutDelta;
      let startToA;
      let startToB;
      if (edge.carveDir !== undefined) {
        openWall(grid, edge.x, edge.y, edge.carveDir);
        openWall(grid, edge.x, edge.y, edge.dir);
        candidateDistance = getDirectedDistance(grid, start, stairsDownCoord);
        shortcutDelta = openedDistance - candidateDistance;
        requiredReachable = Number.isFinite(openedDistance);
        startToA = getDirectedDistance(grid, start, { x: edge.x, y: edge.y });
        startToB = getDirectedDistance(grid, start, { x: edge.nx, y: edge.ny });
        closeWall(grid, edge.x, edge.y, edge.dir);
        closeWall(grid, edge.x, edge.y, edge.carveDir);
      } else {
        closeWall(grid, edge.x, edge.y, edge.dir);
        candidateDistance = getDirectedDistance(grid, start, stairsDownCoord);
        requiredReachable = canReachAllRequired(grid, start, requiredKeys);
        shortcutDelta = candidateDistance - openedDistance;
        openWall(grid, edge.x, edge.y, edge.dir);
        startToA = startDistances.get(`${edge.x},${edge.y}`) ?? Infinity;
        startToB = startDistances.get(`${edge.nx},${edge.ny}`) ?? Infinity;
      }
      return {
        ...edge,
        openedDistance,
        candidateDistance,
        requiredReachable,
        shortcutDelta,
        startToA,
        startToB
      };
    })
    .filter(edge => {
      return edge.requiredReachable &&
        Number.isFinite(edge.candidateDistance) &&
        edge.shortcutDelta >= 0 &&
        edge.startToA >= minStartDistance &&
        edge.startToB >= minStartDistance;
    });

  for (const minDetour of WARDEN_GATE_DETOUR_STAGES) {
    const stageCandidates = candidates.filter(edge => edge.shortcutDelta >= minDetour);
    const candidate = stageCandidates.length > 0
      ? stageCandidates[Math.floor(rng() * stageCandidates.length)]
      : null;
    if (candidate) {
      if (candidate.carveDir !== undefined) {
        openWall(grid, candidate.x, candidate.y, candidate.carveDir);
      }
      return setSealedGate(grid, floor, candidate, start);
    }
  }

  const fallbackCandidates = candidates.filter(edge => edge.carveDir !== undefined);
  const fallback = fallbackCandidates.length > 0
    ? fallbackCandidates[Math.floor(rng() * fallbackCandidates.length)]
    : null;
  if (fallback) {
    if (fallback.carveDir !== undefined) {
      openWall(grid, fallback.x, fallback.y, fallback.carveDir);
    }
    return setSealedGate(grid, floor, fallback, start);
  }
  const candidatesWereTruncated = openEdgeCandidates.length > candidateLimit ||
    carvedEdgeCandidates.length > candidateLimit;
  if (candidateLimit < WARDEN_GATE_CANDIDATE_LIMIT_RETRY && candidatesWereTruncated) {
    return placeWardenGate(grid, floor, start, stairsDownCoord, rng, WARDEN_GATE_CANDIDATE_LIMIT_RETRY);
  }
  return null;
}

export function placeWardenGateWithStairFallback(grid, floor, start, stairsDownCoord, rng = Math.random) {
  const firstGate = placeWardenGate(grid, floor, start, stairsDownCoord, rng);
  if (firstGate || !WARDEN_GATE_FLOORS.includes(floor) || !stairsDownCoord) {
    return { gate: firstGate, stairsDownCoord };
  }

  const reachable = getDirectedReachableCellKeys(grid, start);
  const candidates = [...reachable]
    .map(key => {
      const [x, y] = key.split(",").map(Number);
      return {
        x,
        y,
        dist: Math.abs(x - start.x) + Math.abs(y - start.y)
      };
    })
    .filter(pos => {
      const cell = grid[pos.y]?.[pos.x];
      if (!cell) return false;
      if (pos.x === start.x && pos.y === start.y) return false;
      if (cell.type !== "empty" || cell.event || cell.trap) return false;
      return cell.walls.some(w => !w);
    })
    .sort((a, b) => b.dist - a.dist)
    .slice(0, 8);

  for (const candidate of candidates) {
    const trial = JSON.parse(JSON.stringify(grid));
    const oldStairs = trial[stairsDownCoord.y]?.[stairsDownCoord.x];
    if (oldStairs?.type === "stairs-down") {
      oldStairs.type = "empty";
      oldStairs.message = null;
    }
    trial[candidate.y][candidate.x].type = "stairs-down";
    trial[candidate.y][candidate.x].message = `【下り階段】地下${floor + 1}階へ進む階段です。`;
    const gate = placeWardenGate(trial, floor, start, candidate, rng);
    if (!gate) continue;
    for (let y = 0; y < getMapHeight(grid); y++) {
      grid[y] = trial[y];
    }
    return { gate, stairsDownCoord: { x: candidate.x, y: candidate.y } };
  }

  return { gate: null, stairsDownCoord };
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

export const ROOM_COUNT_RANGE = [2, 4];
export const ROOM_SIZES = [
  { w: 2, h: 2 },
  { w: 2, h: 3 },
  { w: 3, h: 2 },
  { w: 3, h: 3 }
];

function isInsideRoom(room, x, y) {
  return x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h;
}

function countRoomEntrances(grid, room) {
  let entrances = 0;
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      for (let dir = 0; dir < 4; dir++) {
        const nx = x + DX[dir];
        const ny = y + DY[dir];
        if (!isInsideRoom(room, nx, ny) && !grid[y][x].walls[dir]) entrances++;
      }
    }
  }
  return entrances;
}

function hasClosedWallBesideWalkableCell(grid, room) {
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      for (let dir = 0; dir < 4; dir++) {
        const nx = x + DX[dir];
        const ny = y + DY[dir];
        if (isInsideRoom(room, nx, ny)) continue;
        const outside = grid[ny]?.[nx];
        if (outside && isWalkableCell(outside) && grid[y][x].walls[dir]) return true;
      }
    }
  }
  return false;
}

// Overlapping or directly adjacent rooms would merge into one large hall.
function roomsTooClose(a, b) {
  return a.x <= b.x + b.w && b.x <= a.x + a.w &&
    a.y <= b.y + b.h && b.y <= a.y + a.h;
}

// Carve small halls into the finished maze by opening every wall inside the
// rectangle. The rectangle always contains existing passage cells, so the
// hall stays connected to the main maze; never-dug pillar cells inside the
// rectangle simply become hall floor.
export function carveRooms(grid, rng, visited = null, roomCountRange = ROOM_COUNT_RANGE) {
  const targetCount = roomCountRange[0] +
    Math.floor(rng() * (roomCountRange[1] - roomCountRange[0] + 1));

  const candidates = [];
  for (const size of ROOM_SIZES) {
    for (let y = 1; y <= getMapHeight(grid) - 1 - size.h; y++) {
      for (let x = 1; x <= getMapWidth(grid) - 1 - size.w; x++) {
        candidates.push({ x, y, w: size.w, h: size.h });
      }
    }
  }
  shuffleInPlace(candidates, rng);

  const rooms = [];
  for (const candidate of candidates) {
    if (rooms.length >= targetCount) break;
    if (candidate.w === 3 && candidate.h === 3 &&
      rooms.some(room => room.w === 3 && room.h === 3)) continue;
    if (rooms.some(room => roomsTooClose(room, candidate))) continue;
    if (countRoomEntrances(grid, candidate) < 2) continue;
    if (hasClosedWallBesideWalkableCell(grid, candidate)) continue;

    for (let y = candidate.y; y < candidate.y + candidate.h; y++) {
      for (let x = candidate.x; x < candidate.x + candidate.w; x++) {
        if (x + 1 < candidate.x + candidate.w) openWall(grid, x, y, DIR_E);
        if (y + 1 < candidate.y + candidate.h) openWall(grid, x, y, DIR_S);
        if (visited) visited[y][x] = true;
      }
    }
    rooms.push(candidate);
  }
  return rooms;
}

export const MAZE_PROFILE_RANGES = {
  1: { straightBias: [0.20, 0.60], loopRate: [0.10, 0.40] },
  2: { straightBias: [0.10, 0.60], loopRate: [0.10, 0.37] },
  3: { straightBias: [0.00, 0.60], loopRate: [0.10, 0.34] },
  4: { straightBias: [0.00, 0.50], loopRate: [0.10, 0.31] },
  5: { straightBias: [0.00, 0.40], loopRate: [0.10, 0.28] }
};

export function createMazeProfile(floor, rng, profileRange = null, size = null) {
  const range = profileRange || MAZE_PROFILE_RANGES[floor] || MAZE_PROFILE_RANGES[5];
  const mapWidth = size?.width ?? MAP_WIDTH;
  const mapHeight = size?.height ?? MAP_HEIGHT;
  const randomInRange = ([min, max]) => min + rng() * (max - min);
  // Favor visibly sparse or dense layouts over clustering near the mean.
  const randomNearRangeEdge = ([min, max]) => {
    const roll = rng();
    const edgeRoll = roll < 0.5 ? roll * 2 : (1 - roll) * 2;
    return roll < 0.5
      ? min + edgeRoll * (max - min) * 0.25
      : max - edgeRoll * (max - min) * 0.25;
  };
  const digColumns = Math.floor((mapWidth - 1) / 2);
  const digRows = Math.floor((mapHeight - 2) / 2);

  return {
    straightBias: randomInRange(range.straightBias),
    loopRate: randomNearRangeEdge(range.loopRate),
    digStart: {
      x: 1 + Math.floor(rng() * digColumns) * 2,
      y: 2 + Math.floor(rng() * digRows) * 2
    }
  };
}

export function generateRandomMap(floor = 1, parentStairsCoord = null, seed = null, options = {}) {
  const mapWidth = options.size?.width ?? MAP_WIDTH;
  const mapHeight = options.size?.height ?? MAP_HEIGHT;
  const rng = seed ? createRng(`${seed}:map:B${floor}`) : Math.random;
  const mazeProfile = createMazeProfile(floor, rng, options.mazeProfile, { width: mapWidth, height: mapHeight });
  // 1. Initialize grid with all walls closed
  const grid = Array.from({ length: mapHeight }, () =>
    Array.from({ length: mapWidth }, () => ({
      walls: [true, true, true, true], // N, E, S, W starts closed
      blockEnter: [false, false, false, false],
      secretDoor: [false, false, false, false],
      secretFound: [false, false, false, false],
      sealedGate: [null, null, null, null],
      type: "empty",
      event: null,
      message: null
    }))
  );

  // Helper to check boundaries for maze generation
  const isValid = (x, y) => x > 0 && x < mapWidth - 1 && y > 0 && y < mapHeight - 1;

  // DFS Digging algorithm
  const visited = Array.from({ length: mapHeight }, () => Array(mapWidth).fill(false));
  const stack = [];

  // Start digging from a seeded random cell on the DFS lattice.
  const { x: digStartX, y: digStartY } = mazeProfile.digStart;
  
  let cx = digStartX;
  let cy = digStartY;
  visited[cy][cx] = true;
  stack.push({ x: cx, y: cy, entryDir: null });
  let canContinueStraight = false;

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
      const candidateScores = neighbors.map(neighbor => ({
        neighbor,
        createdTightUTurns: countCreatedTightUTurns(grid, current.x, current.y, neighbor.dir)
      }));
      const minimumCreatedTightUTurns = Math.min(...candidateScores.map(candidate => candidate.createdTightUTurns));
      const shapeSafeNeighbors = candidateScores
        .filter(candidate => candidate.createdTightUTurns === minimumCreatedTightUTurns)
        .map(candidate => candidate.neighbor);
      const nonAdjacentNeighbors = shapeSafeNeighbors.filter(neighbor => {
        for (let dir = 0; dir < 4; dir++) {
          const adjacentX = neighbor.x + DX[dir] * 2;
          const adjacentY = neighbor.y + DY[dir] * 2;
          const isCurrent = adjacentX === current.x && adjacentY === current.y;
          if (!isCurrent && isValid(adjacentX, adjacentY) && visited[adjacentY][adjacentX]) {
            return false;
          }
        }
        return true;
      });
      const preferredNeighbors = nonAdjacentNeighbors.length > 0 ? nonAdjacentNeighbors : shapeSafeNeighbors;
      const straight = canContinueStraight
        ? preferredNeighbors.find(neighbor => neighbor.dir === current.entryDir)
        : null;
      const next = straight && rng() < mazeProfile.straightBias
        ? straight
        : preferredNeighbors[Math.floor(rng() * preferredNeighbors.length)];
      
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

      stack.push({ x: next.x, y: next.y, entryDir: next.dir });
      canContinueStraight = true;
    } else {
      stack.pop();
      canContinueStraight = false;
    }
  }

  // 2. Open additional walls once per undirected DFS-lattice edge.
  for (let y = 2; y < mapHeight - 1; y += 2) {
    for (let x = 1; x < mapWidth - 1; x += 2) {
      if (visited[y][x]) {
        for (const dir of [DIR_E, DIR_S]) {
          const nx = x + DX[dir] * 2;
          const ny = y + DY[dir] * 2;
          if (isValid(nx, ny) && visited[ny][nx]) {
            const mx = x + DX[dir];
            const my = y + DY[dir];
            // Check if the intermediate cell is not dug (all walls closed)
            if (grid[my][mx].walls.every(w => w)) {
              const compensatedLoopRate = Math.min(1, mazeProfile.loopRate * 3);
              if (countCreatedTightUTurns(grid, x, y, dir) === 0 && rng() < compensatedLoopRate) {
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

  const rooms = carveRooms(grid, rng, visited, options.roomCountRange);

  const b1EntryCandidates = [];
  if (floor === 1) {
    for (let y = 1; y < mapHeight - 1; y++) {
      for (let x = 1; x < mapWidth - 1; x++) {
        if (visited[y][x] && grid[y][x].walls.filter(wall => !wall).length >= 2) {
          b1EntryCandidates.push({ x, y });
        }
      }
    }
  }
  const entryCoord = floor > 1
    ? (parentStairsCoord || { x: mapWidth - 2, y: 1 })
    : b1EntryCandidates[Math.floor(rng() * b1EntryCandidates.length)];
  if (!entryCoord) throw new Error("B1F entry candidate unavailable");
  const stairsUpCoord = floor > 1 ? entryCoord : null;
  const suCoord = entryCoord;

  // 3. Setup floor specific connections & detect dead ends
  // B1F candidates already have at least two open walls.
  if (floor > 1) {
    if (grid[suCoord.y][suCoord.x].walls.every(w => w)) {
      // Find a visited (passage) neighbor first to guarantee connection to the main maze
      let opened = false;
      for (let dir = 0; dir < 4; dir++) {
        const nx = suCoord.x + DX[dir];
        const ny = suCoord.y + DY[dir];
        if (isValid(nx, ny) && visited[ny][nx]) {
          grid[suCoord.y][suCoord.x].walls[dir] = false;
          grid[ny][nx].walls[(dir + 2) % 4] = false;
          opened = true;
        }
      }
      // No dug neighbor at all (possible when the parent stairs coord sits on
      // a never-dug pillar-parity cell, e.g. inside a carved room upstairs):
      // carve a corridor to the nearest dug cell instead of opening a blind
      // wall, which could strand the stairs on an isolated island.
      if (!opened) {
        const previous = new Map();
        const queue = [suCoord];
        const seen = new Set([`${suCoord.x},${suCoord.y}`]);
        let found = null;
        for (const pos of queue) {
          if (found) break;
          for (let dir = 0; dir < 4; dir++) {
            const nx = pos.x + DX[dir];
            const ny = pos.y + DY[dir];
            const key = `${nx},${ny}`;
            if (!isValid(nx, ny) || seen.has(key)) continue;
            seen.add(key);
            previous.set(key, pos);
            if (visited[ny][nx]) {
              found = { x: nx, y: ny };
              break;
            }
            queue.push({ x: nx, y: ny });
          }
        }
        let cursor = found;
        while (cursor && (cursor.x !== suCoord.x || cursor.y !== suCoord.y)) {
          const parent = previous.get(`${cursor.x},${cursor.y}`);
          const dir = DX.findIndex((dx, i) => parent.x + dx === cursor.x && parent.y + DY[i] === cursor.y);
          openWall(grid, parent.x, parent.y, dir);
          visited[cursor.y][cursor.x] = true;
          cursor = parent;
        }
        visited[suCoord.y][suCoord.x] = true;
        // The BFS stops at the first visited neighbor, so the junction cell may
        // still share a closed wall with another passage; open every visited
        // neighbor to avoid leaving a corridor behind a zero-thickness wall.
        if (found) {
          const junction = previous.get(`${found.x},${found.y}`);
          for (let dir = 0; dir < 4; dir++) {
            const nx = junction.x + DX[dir];
            const ny = junction.y + DY[dir];
            if (isValid(nx, ny) && visited[ny][nx]) openWall(grid, junction.x, junction.y, dir);
          }
        }
      }
    }
  }

  // Keep enough meaningful endpoints for stairs and events while pruning excess branches.
  const protectedDeadEndKeys = new Set([`${suCoord.x},${suCoord.y}`]);
  for (const room of rooms) {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        protectedDeadEndKeys.add(`${x},${y}`);
        for (let dir = 0; dir < 4; dir++) {
          const nx = x + DX[dir];
          const ny = y + DY[dir];
          if (!isInsideRoom(room, nx, ny) && !grid[y][x].walls[dir]) {
            protectedDeadEndKeys.add(`${nx},${ny}`);
          }
        }
      }
    }
  }
  const loopRateMidpoint = (MAZE_PROFILE_RANGES[floor]?.loopRate || MAZE_PROFILE_RANGES[5].loopRate)
    .reduce((sum, value) => sum + value, 0) / 2;
  const deadEndTarget = mazeProfile.loopRate >= loopRateMidpoint
    ? DEAD_END_TARGET_RANGE[0]
    : DEAD_END_TARGET_RANGE[1];
  let deadEnds = normalizeDeadEndCount(grid, suCoord, protectedDeadEndKeys, deadEndTarget, rng);
  const reachableKeys = getReachableCellKeys(grid, suCoord);

  let stairsDownCoord = null;
  let bossCoord = null;

  // 4. Setup Stairs & Boss / Midboss
  if (floor > 1) {
    grid[suCoord.y][suCoord.x].type = "stairs-up";
    grid[suCoord.y][suCoord.x].message = `【上り階段】地下${floor - 1}階へ戻る階段です。`;
  } else {
    grid[suCoord.y][suCoord.x].type = "stairs-up";
    grid[suCoord.y][suCoord.x].message = "【上り階段】街へ戻る階段です。";
  }

  // Set stairs-down for B1F - B4F, or every floor in the endless-run generator.
  if (options.generateStairsDown ?? (floor < 5)) {
    const criticalPathRange = options.criticalPathRange;
    const distances = criticalPathRange ? getDistanceMap(grid, suCoord) : null;
    const isInCriticalPathRange = coord => {
      if (!criticalPathRange) return true;
      const distance = distances.get(`${coord.x},${coord.y}`);
      return distance >= criticalPathRange[0] && distance <= criticalPathRange[1];
    };
    const targetDeadEnds = deadEnds.filter(isInCriticalPathRange);

    if (targetDeadEnds.length > 0 || (!criticalPathRange && deadEnds.length > 0)) {
      const eligibleDeadEnds = targetDeadEnds.length > 0 ? targetDeadEnds : deadEnds;
      const rankedDeadEnds = eligibleDeadEnds
        .map(coord => ({
          coord,
          dist: distances?.get(`${coord.x},${coord.y}`) ??
            Math.abs(coord.x - suCoord.x) + Math.abs(coord.y - suCoord.y),
        }))
        .sort((a, b) => b.dist - a.dist);
      const topCount = Math.min(
        rankedDeadEnds.length,
        Math.max(3, Math.ceil(rankedDeadEnds.length / 2)),
      );
      const topCandidates = rankedDeadEnds.slice(0, topCount);
      const distantCandidates = topCandidates.filter(candidate => candidate.dist >= 10);
      const candidates = distantCandidates.length > 0 ? distantCandidates : topCandidates;
      const selected = candidates[Math.floor(rng() * candidates.length)];
      stairsDownCoord = selected.coord;
      const deadEndIndex = deadEnds.findIndex(coord =>
        coord.x === stairsDownCoord.x && coord.y === stairsDownCoord.y
      );
      if (deadEndIndex !== -1) deadEnds.splice(deadEndIndex, 1);
    } else {
      const reachableCandidates = [...reachableKeys]
        .map(key => {
          const [x, y] = key.split(",").map(Number);
          return {
            x,
            y,
            dist: distances?.get(key) ?? Math.abs(x - suCoord.x) + Math.abs(y - suCoord.y)
          };
        })
        .filter(cell => cell.x !== suCoord.x || cell.y !== suCoord.y)
        .filter(isInCriticalPathRange)
        .sort((a, b) => b.dist - a.dist);
      stairsDownCoord = reachableCandidates[Math.floor(rng() * reachableCandidates.length)] ||
        { x: suCoord.x, y: suCoord.y };
    }
    if (grid[stairsDownCoord.y][stairsDownCoord.x].type !== "stairs-up") {
      grid[stairsDownCoord.y][stairsDownCoord.x].type = "stairs-down";
    }
    grid[stairsDownCoord.y][stairsDownCoord.x].message = `【下り階段】地下${floor + 1}階へ進む階段です。`;
  }

  // Place Midboss on Floor 3, Boss on Floor 5
  const legacyMilestones = options.legacyMilestones ?? true;
  if (legacyMilestones && floor === 3) {
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
    if (grid[bossCoord.y][bossCoord.x].type !== "stairs-up" && grid[bossCoord.y][bossCoord.x].type !== "stairs-down") {
      grid[bossCoord.y][bossCoord.x].type = "empty";
    }
    grid[bossCoord.y][bossCoord.x].event = "midboss";
    grid[bossCoord.y][bossCoord.x].message = "不気味な魔力の気配を感じる…！デーモンガードが立ち塞がった！";
  } else if (legacyMilestones && floor === 5) {
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
    if (grid[bossCoord.y][bossCoord.x].type !== "stairs-up" && grid[bossCoord.y][bossCoord.x].type !== "stairs-down") {
      grid[bossCoord.y][bossCoord.x].type = "empty";
    }
    grid[bossCoord.y][bossCoord.x].event = "boss";
    grid[bossCoord.y][bossCoord.x].message = "周囲にただならぬ気配が漂っている…！いにしえの竜が姿を現した！";
  }

  const secretCounts = options.secretDoorCounts || SECRET_DOOR_COUNTS[floor] || { shortcut: 0, room: 0 };
  const preEventRequiredKeys = getRequiredReachableKeys(grid, stairsDownCoord, bossCoord);
  const preEventRoomCandidates = ensureSecretRoomCandidates(grid, secretCounts.room, preEventRequiredKeys, suCoord, rng);
  const reservedRoomKeys = selectProtectedSecretRoomKeys(preEventRoomCandidates, secretCounts.room);
  const reservedPassageKeys = new Set(preEventRoomCandidates
    .filter(candidate => reservedRoomKeys.has(`${candidate.roomX},${candidate.roomY}`))
    .map(candidate => `${candidate.passageX},${candidate.passageY}`));
  deadEnds = deadEnds.filter(({ x, y }) =>
    grid[y][x].walls.some(wall => !wall) &&
    !reservedRoomKeys.has(`${x},${y}`) &&
    !reservedPassageKeys.has(`${x},${y}`)
  );

  // 6. Place chest events randomly at dead ends
  const shuffle = (array) => shuffleInPlace(array, rng);
  shuffle(deadEnds);

  const targetChestCount = CHEST_COUNT_RANGE[0] +
    Math.floor(rng() * (CHEST_COUNT_RANGE[1] - CHEST_COUNT_RANGE[0] + 1));
  const chestCount = Math.min(targetChestCount, deadEnds.length);
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

  // Fallback if sparse
  let totalChestNeeded = targetChestCount - chestCount;
  let totalSpringNeeded = 2 - springCount;
  let totalTabletNeeded = 2 - tabletCount;

  if (totalChestNeeded > 0 || totalSpringNeeded > 0 || totalTabletNeeded > 0) {
    const passages = [];
    for (let y = 1; y < mapHeight - 1; y++) {
      for (let x = 1; x < mapWidth - 1; x++) {
        const isStart = (x === suCoord.x && y === suCoord.y);
        const isStairs = (stairsUpCoord && x === stairsUpCoord.x && y === stairsUpCoord.y) || (stairsDownCoord && x === stairsDownCoord.x && y === stairsDownCoord.y);
        const isBossCell = (bossCoord && x === bossCoord.x && y === bossCoord.y);
        const key = `${x},${y}`;
        if (isStart || isStairs || isBossCell || grid[y][x].event ||
            reservedRoomKeys.has(key) || reservedPassageKeys.has(key)) continue;

        if (reachableKeys.has(key) && grid[y][x].walls.some(w => !w)) {
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
  }

  // 7. Place traps randomly on passage cells
  const trapCandidates = [];
  for (let y = 1; y < mapHeight - 1; y++) {
    for (let x = 1; x < mapWidth - 1; x++) {
      const isStart = (x === suCoord.x && y === suCoord.y);
      const isStairs = (stairsUpCoord && x === stairsUpCoord.x && y === stairsUpCoord.y) || (stairsDownCoord && x === stairsDownCoord.x && y === stairsDownCoord.y);
      const isBossCell = (bossCoord && x === bossCoord.x && y === bossCoord.y);
      const cell = grid[y][x];
      
      if (isStart || isStairs || isBossCell || cell.event || cell.type !== "empty") continue;
      
      if (reachableKeys.has(`${x},${y}`) && cell.walls.some(w => !w)) {
        trapCandidates.push({ x, y });
      }
    }
  }

  shuffle(trapCandidates);
  const trapCount = Math.min(options.trapCount ?? Math.min(6 + floor, 16), trapCandidates.length);

  const chokeTargeted = Math.round(trapCount * getTrapChokeRate(floor));
  const chokePool = [];
  const openPool = [];
  for (const candidate of trapCandidates) {
    if (chokePool.length < chokeTargeted && isChokeCell(grid, candidate, suCoord, stairsDownCoord)) {
      chokePool.push(candidate);
    } else {
      openPool.push(candidate);
    }
  }

  // チョーク候補が目標に届かない迷路形状もある。足りない分は通常候補で埋める。
  const chosen = chokePool.slice(0, chokeTargeted);
  for (const candidate of openPool) {
    if (chosen.length >= trapCount) break;
    chosen.push(candidate);
  }

  for (const spot of chosen) {
    const trapId = `trap_${floor}_${spot.x}_${spot.y}`;
    
    let trapType;
    const r = rng();
    const pitfallProb = PITFALL_PROBABILITIES[floor] || 0;
    if (r < pitfallProb) {
      trapType = TRAP_TYPES.PITFALL;
    } else {
      const r2 = pitfallProb > 0 ? (r - pitfallProb) / (1 - pitfallProb) : r;
      if (floor <= 2) {
        if (r2 < 0.70) trapType = TRAP_TYPES.DAMAGE;
        else if (r2 < 0.85) trapType = TRAP_TYPES.MP_DRAIN;
        else trapType = TRAP_TYPES.ALARM;
      } else if (floor <= 4) {
        if (r2 < 0.30) trapType = TRAP_TYPES.DAMAGE;
        else if (r2 < 0.70) trapType = TRAP_TYPES.MP_DRAIN;
        else trapType = TRAP_TYPES.ALARM;
      } else {
        if (r2 < 0.20) trapType = TRAP_TYPES.DAMAGE;
        else if (r2 < 0.60) trapType = TRAP_TYPES.MP_DRAIN;
        else trapType = TRAP_TYPES.ALARM;
      }
    }
    
    const baseDifficulty = 15 + floor * 15;
    const diffNoise = Math.floor(rng() * 11) - 5;
    const difficulty = Math.max(10, baseDifficulty + diffNoise);

    grid[spot.y][spot.x].trap = {
      id: trapId,
      floorId: `B${floor}`,
      position: { x: spot.x, y: spot.y },
      type: trapType,
      state: "hidden",
      difficulty: difficulty
    };
  }

  placeOneWayPassages(grid, floor, suCoord, stairsDownCoord, bossCoord, rng, options.oneWayPassageCount);
  placeSecretDoors(grid, floor, suCoord, stairsDownCoord, bossCoord, rng, secretCounts);
  let wardenPlacement = { gate: null, stairsDownCoord };
  if (options.generateWardenGate ?? true) {
    wardenPlacement = stairsDownCoord
      ? placeWardenGateWithStairFallback(grid, floor, suCoord, stairsDownCoord, rng)
      : { gate: placeWardenGate(grid, floor, suCoord, bossCoord, rng), stairsDownCoord };
    if (!wardenPlacement.gate && bossCoord && stairsDownCoord) {
      wardenPlacement = { gate: placeWardenGate(grid, floor, suCoord, bossCoord, rng), stairsDownCoord };
    }
  }
  const wardenGate = wardenPlacement.gate;
  if (stairsDownCoord) stairsDownCoord = wardenPlacement.stairsDownCoord;
  removeInvalidOneWayPassages(grid, suCoord);

  if ((floor === 2 || floor === 4) && wardenGate) {
    const relocationReachableKeys = getDirectedReachableCellKeys(grid, suCoord);
    const endpoints = [
      { x: wardenGate.x, y: wardenGate.y },
      { x: wardenGate.nx, y: wardenGate.ny }
    ].filter(({ x, y }) => grid[y]?.[x]?.type === "empty");
    const camp = endpoints.find(({ x, y }) => !grid[y][x].event && !grid[y][x].trap) || endpoints[0];
    if (camp) {
      const cell = grid[camp.y][camp.x];
      const displacedEvent = cell.event;
      const displacedTrap = cell.trap;
      cell.event = EVENT_TYPES.CAMP;
      delete cell.trap;

      if (displacedEvent || displacedTrap) {
        const relocation = [];
        for (let y = 1; y < mapHeight - 1; y++) {
          for (let x = 1; x < mapWidth - 1; x++) {
            const candidate = grid[y][x];
            if (candidate.type === "empty" && !candidate.event && !candidate.trap &&
                candidate.walls.some(wall => !wall) && relocationReachableKeys.has(`${x},${y}`)) {
              relocation.push({ x, y });
            }
          }
        }
        shuffleInPlace(relocation, rng);
        const target = relocation[0];
        if (target && displacedEvent) grid[target.y][target.x].event = displacedEvent;
        if (target && displacedTrap) {
          grid[target.y][target.x].trap = {
            ...displacedTrap,
            id: `trap_${floor}_${target.x}_${target.y}`,
            position: { x: target.x, y: target.y }
          };
        }
      }
    }
  }
  return {
    grid,
    stairsDownCoord,
    bossCoord,
    wardenGate,
    rooms,
    trapMeta: {
      total: chosen.length,
      choke: chokePool.slice(0, chokeTargeted).length,
      chokeTargeted
    }
  };
}
