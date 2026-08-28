import { DIR_N, DIR_E, DIR_S, DIR_W, MAP_WIDTH, MAP_HEIGHT, EVENT_TYPES, TRAP_TYPES } from "./data.js";
import { createRng } from "./seed_rng.js";

// Directions helper
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
const OPPOSITE_DIR = [DIR_S, DIR_W, DIR_N, DIR_E];

const PITFALL_PROBABILITIES = {
  // Pitfall is a shallow-only floor hazard. Keep it separate from biome
  // trapSet because triggering it forces a one-floor descent.
  1: 0.05,
  2: 0.08,
  3: 0.12
};

// trapSet is a biome preference, not an exclusion list. Keep undeclared
// regular types possible so the existing depth curve remains continuous.
const TRAP_SET_WEIGHT_MULTIPLIER = 2;

const REGULAR_TRAP_TYPES = [
  TRAP_TYPES.DAMAGE,
  TRAP_TYPES.MP_DRAIN,
  TRAP_TYPES.ALARM
];

function getRegularTrapWeights(floor) {
  if (floor <= 2) {
    return {
      [TRAP_TYPES.DAMAGE]: 0.70,
      [TRAP_TYPES.MP_DRAIN]: 0.15,
      [TRAP_TYPES.ALARM]: 0.15
    };
  }
  if (floor <= 4) {
    return {
      [TRAP_TYPES.DAMAGE]: 0.30,
      [TRAP_TYPES.MP_DRAIN]: 0.40,
      [TRAP_TYPES.ALARM]: 0.30
    };
  }
  return {
    [TRAP_TYPES.DAMAGE]: 0.20,
    [TRAP_TYPES.MP_DRAIN]: 0.40,
    [TRAP_TYPES.ALARM]: 0.40
  };
}

function selectTrapType(floor, rng, trapSet) {
  const pitfallProb = PITFALL_PROBABILITIES[floor] || 0;
  const roll = rng();
  if (roll < pitfallProb) return TRAP_TYPES.PITFALL;

  const r2 = pitfallProb > 0 ? (roll - pitfallProb) / (1 - pitfallProb) : roll;
  const regularWeights = getRegularTrapWeights(floor);
  const preferredTypes = new Set(
    Array.isArray(trapSet) ? trapSet.filter(type => REGULAR_TRAP_TYPES.includes(type)) : []
  );
  const weightedTypes = REGULAR_TRAP_TYPES.map(type => ({
    type,
    weight: regularWeights[type] * (
      preferredTypes.has(type) ? TRAP_SET_WEIGHT_MULTIPLIER : 1
    )
  }));
  const totalWeight = weightedTypes.reduce((sum, entry) => sum + entry.weight, 0);
  let threshold = r2 * totalWeight;
  for (const entry of weightedTypes) {
    if (threshold < entry.weight) return entry.type;
    threshold -= entry.weight;
  }
  return weightedTypes.at(-1).type;
}

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


function isWalkableCell(cell) {
  return cell.walls.some(w => !w) || cell.secretDoor.some(Boolean);
}

function getMapWidth(grid) {
  return grid[0]?.length ?? 0;
}

function getMapHeight(grid) {
  return grid.length;
}

class ReachableCellSet {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.visited = new Uint8Array(width * height);
    this.versions = new Uint32Array(width * height);
    this.order = [];
    this.orderVersions = [];
  }

  has(x, y) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height &&
      this.visited[y * this.width + x] === 1;
  }

  hasKey(key) {
    const separator = key.indexOf(",");
    if (separator === -1) return false;
    return this.has(
      Number(key.slice(0, separator)),
      Number(key.slice(separator + 1))
    );
  }

  add(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
    const index = y * this.width + x;
    if (this.visited[index]) return false;
    this.visited[index] = 1;
    this.versions[index]++;
    this.order.push(index);
    this.orderVersions.push(this.versions[index]);
    return true;
  }

  delete(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
    const index = y * this.width + x;
    if (!this.visited[index]) return false;
    this.visited[index] = 0;
    this.versions[index]++;
    return true;
  }

  *[Symbol.iterator]() {
    for (let index = 0; index < this.order.length; index++) {
      const cellIndex = this.order[index];
      if (!this.visited[cellIndex] || this.orderVersions[index] !== this.versions[cellIndex]) continue;
      const y = Math.floor(cellIndex / this.width);
      const x = cellIndex - y * this.width;
      yield `${x},${y}`;
    }
  }
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

function collectReachableDeadEnds(
  grid,
  start,
  protectedKeys,
  reachableKeys = getReachableCellKeys(grid, start)
) {
  const deadEnds = [];
  for (let y = 1; y < getMapHeight(grid) - 1; y++) {
    for (let x = 1; x < getMapWidth(grid) - 1; x++) {
      if (protectedKeys.has(`${x},${y}`) || !reachableKeys.has(x, y)) continue;
      if (grid[y][x].walls.filter(wall => !wall).length === 1) deadEnds.push({ x, y });
    }
  }
  return deadEnds;
}

function insertDeadEnd(deadEnds, candidate) {
  const existing = deadEnds.findIndex(deadEnd =>
    deadEnd.x === candidate.x && deadEnd.y === candidate.y
  );
  if (existing !== -1) return;

  const insertionPoint = deadEnds.findIndex(deadEnd =>
    deadEnd.y > candidate.y || (deadEnd.y === candidate.y && deadEnd.x > candidate.x)
  );
  if (insertionPoint === -1) deadEnds.push(candidate);
  else deadEnds.splice(insertionPoint, 0, candidate);
}

function updateDeadEndsAfterClose(grid, deadEnds, leaf, neighbor, protectedKeys, reachableKeys) {
  const updated = deadEnds.filter(deadEnd => deadEnd.x !== leaf.x || deadEnd.y !== leaf.y);
  if (!neighbor || !reachableKeys.has(neighbor.x, neighbor.y) ||
      protectedKeys.has(`${neighbor.x},${neighbor.y}`) ||
      grid[neighbor.y][neighbor.x].walls.filter(wall => !wall).length !== 1) {
    return updated;
  }

  insertDeadEnd(updated, neighbor);
  return updated;
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
      if (!reachableKeys.has(attachX, attachY) || attachCell.walls.filter(wall => !wall).length < 2) continue;

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
  const reachableKeys = getReachableCellKeys(grid, start);
  let deadEnds = collectReachableDeadEnds(grid, start, protectedKeys, reachableKeys);

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
    const neighbor = grid[leaf.y + DY[openDir]]?.[leaf.x + DX[openDir]]
      ? { x: leaf.x + DX[openDir], y: leaf.y + DY[openDir] }
      : null;
    closeWall(grid, leaf.x, leaf.y, openDir);
    if (neighbor) {
      reachableKeys.delete(leaf.x, leaf.y);
      deadEnds = updateDeadEndsAfterClose(
        grid,
        deadEnds,
        leaf,
        neighbor,
        protectedKeys,
        reachableKeys
      );
    } else {
      deadEnds = collectReachableDeadEnds(grid, start, protectedKeys, reachableKeys);
    }
  }

  const growTarget = Math.min(target, DEAD_END_TARGET_RANGE[0]);
  while (deadEnds.length < growTarget) {
    const branchCandidates = collectBranchGrowthCandidates(grid, protectedKeys, reachableKeys);
    if (branchCandidates.length > 0) {
      const straightCandidates = branchCandidates.filter(candidate => candidate.straight);
      const growthPool = straightCandidates.length > 0 ? straightCandidates : branchCandidates;
      const candidate = growthPool[Math.floor(rng() * growthPool.length)];
      openWall(grid, candidate.a.x, candidate.a.y, candidate.attachDir);
      openWall(grid, candidate.a.x, candidate.a.y, candidate.extendDir);
      const branchEnd = {
        x: candidate.a.x + DX[candidate.extendDir],
        y: candidate.a.y + DY[candidate.extendDir]
      };
      reachableKeys.add(candidate.a.x, candidate.a.y);
      reachableKeys.add(branchEnd.x, branchEnd.y);
      insertDeadEnd(deadEnds, branchEnd);
      continue;
    }

    const candidates = [];
    for (let y = 2; y < getMapHeight(grid) - 2; y++) {
      for (let x = 2; x < getMapWidth(grid) - 2; x++) {
        if (protectedKeys.has(`${x},${y}`) || !grid[y][x].walls.every(Boolean)) continue;
        const attachmentDirs = [];
        const passageNeighborDirs = [];
        for (let dir = 0; dir < 4; dir++) {
          const nx = x + DX[dir];
          const ny = y + DY[dir];
          const next = grid[ny]?.[nx];
          if (next && next.walls.some(wall => !wall)) passageNeighborDirs.push(dir);
          if (next && reachableKeys.has(nx, ny) && next.walls.filter(wall => !wall).length >= 2) {
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
    reachableKeys.add(candidate.x, candidate.y);
    insertDeadEnd(deadEnds, { x: candidate.x, y: candidate.y });
  }

  return deadEnds;
}

function getInternalWallEdges(grid) {
  const edges = [];

  for (let y = 1; y < getMapHeight(grid) - 1; y++) {
    for (let x = 1; x < getMapWidth(grid) - 1; x++) {
      if (!isPassageCell(grid, x, y)) continue;

      if (grid[y][x].walls[DIR_E] && !grid[y][x].secretDoor?.[DIR_E] && isPassageCell(grid, x + 1, y)) {
        edges.push({
          x,
          y,
          dir: DIR_E,
          a: `${x + 1},${y}`,
          b: `${x + 1},${y + 1}`
        });
      }

      if (grid[y][x].walls[DIR_S] && !grid[y][x].secretDoor?.[DIR_S] && isPassageCell(grid, x, y + 1)) {
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

function createReachableCellSet(grid, start, directed = false) {
  const width = getMapWidth(grid);
  const height = getMapHeight(grid);
  const reachable = new ReachableCellSet(width, height);
  if (!reachable.add(start.x, start.y)) return reachable;

  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 1;
  queue[0] = start.y * width + start.x;

  while (head < tail) {
    const index = queue[head++];
    const y = Math.floor(index / width);
    const x = index - y * width;
    const cell = grid[y]?.[x];
    if (!cell) continue;

    for (let dir = 0; dir < 4; dir++) {
      if (cell.walls[dir] || (directed && !canEnterFrom(grid, x, y, dir))) continue;

      const nx = x + DX[dir];
      const ny = y + DY[dir];
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      if (reachable.add(nx, ny)) queue[tail++] = ny * width + nx;
    }
  }

  return reachable;
}

function getReachableCellKeys(grid, start) {
  return createReachableCellSet(grid, start);
}

function getUndirectedChokeCells(grid, start, stairsDown) {
  if (!stairsDown) return null;
  const width = getMapWidth(grid);
  const height = getMapHeight(grid);
  const cellCount = width * height;
  const startIndex = start.y * width + start.x;
  const targetIndex = stairsDown.y * width + stairsDown.x;
  if (startIndex === targetIndex ||
      start.x < 0 || start.x >= width || start.y < 0 || start.y >= height ||
      stairsDown.x < 0 || stairsDown.x >= width || stairsDown.y < 0 || stairsDown.y >= height) {
    return null;
  }

  // Tarjan requires a symmetric graph. One-way entries are placed later, so
  // the generation path takes this fast path while arbitrary callers retain
  // the exact BFS fallback below.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = grid[y]?.[x];
      if (!cell || cell.blockEnter?.some(Boolean)) return null;
      for (let dir = 0; dir < 4; dir++) {
        if (cell.walls[dir]) continue;
        const neighbor = grid[y + DY[dir]]?.[x + DX[dir]];
        if (!neighbor || neighbor.walls[OPPOSITE_DIR[dir]]) return null;
      }
    }
  }

  const discovery = new Int32Array(cellCount);
  const lowLink = new Int32Array(cellCount);
  const targetInSubtree = new Uint8Array(cellCount);
  const choke = new Uint8Array(cellCount);
  discovery.fill(-1);
  let nextDiscovery = 0;

  function visit(index, parentIndex = -1) {
    discovery[index] = nextDiscovery;
    lowLink[index] = nextDiscovery;
    nextDiscovery++;
    targetInSubtree[index] = index === targetIndex ? 1 : 0;

    const y = Math.floor(index / width);
    const x = index - y * width;
    const cell = grid[y][x];
    for (let dir = 0; dir < 4; dir++) {
      if (cell.walls[dir]) continue;
      const neighborX = x + DX[dir];
      const neighborY = y + DY[dir];
      if (neighborX < 0 || neighborX >= width || neighborY < 0 || neighborY >= height) continue;
      const neighborIndex = neighborY * width + neighborX;
      if (neighborIndex === parentIndex) continue;

      if (discovery[neighborIndex] === -1) {
        visit(neighborIndex, index);
        if (targetInSubtree[neighborIndex]) targetInSubtree[index] = 1;
        lowLink[index] = Math.min(lowLink[index], lowLink[neighborIndex]);
        if (index !== startIndex && targetInSubtree[neighborIndex] &&
            lowLink[neighborIndex] >= discovery[index]) {
          choke[index] = 1;
        }
      } else {
        lowLink[index] = Math.min(lowLink[index], discovery[neighborIndex]);
      }
    }
  }

  visit(startIndex);
  if (discovery[targetIndex] === -1) return null;
  choke[targetIndex] = 1;
  choke[startIndex] = 0;

  return {
    has(x, y) {
      return x >= 0 && x < width && y >= 0 && y < height && choke[y * width + x] === 1;
    }
  };
}

function isChokeCellByBfs(grid, cell, start, stairsDown) {
  const width = getMapWidth(grid);
  const height = getMapHeight(grid);
  const blockedIndex = cell.y * width + cell.x;
  const startIndex = start.y * width + start.x;
  const targetIndex = stairsDown.y * width + stairsDown.x;
  if (blockedIndex === startIndex || targetIndex === startIndex) return false;

  const seen = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 1;
  seen[startIndex] = 1;
  queue[0] = startIndex;

  while (head < tail) {
    const index = queue[head++];
    const y = Math.floor(index / width);
    const x = index - y * width;
    const current = grid[y]?.[x];
    if (!current) continue;

    for (let dir = 0; dir < 4; dir++) {
      if (current.walls[dir] || !canEnterFrom(grid, x, y, dir)) continue;
      const nx = x + DX[dir];
      const ny = y + DY[dir];
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nextIndex = ny * width + nx;
      if (nextIndex === blockedIndex || seen[nextIndex]) continue;
      if (nextIndex === targetIndex) return false;
      seen[nextIndex] = 1;
      queue[tail++] = nextIndex;
    }
  }

  return !seen[targetIndex];
}

// そのマスを塞ぐと下り階段へ到達できなくなるならチョークポイント。
// 生成中は無向グラフのTarjan DFS、one-way済み等は従来と同義のBFS。
export function isChokeCell(grid, cell, start, stairsDown) {
  if (!stairsDown || (cell.x === start.x && cell.y === start.y)) return false;
  const chokeCells = getUndirectedChokeCells(grid, start, stairsDown);
  return chokeCells
    ? chokeCells.has(cell.x, cell.y)
    : isChokeCellByBfs(grid, cell, start, stairsDown);
}

// 深度は無限スケールなので、B5でカンストする段階分類は使わず連続式にする。
// 上限0.55は必須。全てを関所にすると回避判断が消える。
export function getTrapChokeRate(floor) {
  const depth = Math.max(1, Math.floor(Number(floor) || 1));
  const raw = depth >= 12 ? 0.55 : 0.10 + 0.04 * (depth - 1);
  return Math.round(Math.min(0.55, raw) * 1000) / 1000;
}

class DistanceMap {
  constructor(width, distances) {
    this.width = width;
    this.distances = distances;
  }

  get(key) {
    const separator = key.indexOf(",");
    if (separator === -1) return undefined;
    const x = Number(key.slice(0, separator));
    const y = Number(key.slice(separator + 1));
    if (!Number.isInteger(x) || !Number.isInteger(y) ||
        x < 0 || x >= this.width || y < 0 || y * this.width + x >= this.distances.length) {
      return undefined;
    }
    const distance = this.distances[y * this.width + x];
    return distance === -1 ? undefined : distance;
  }
}

function getDistanceMap(grid, start) {
  const width = getMapWidth(grid);
  const height = getMapHeight(grid);
  const distances = new Int32Array(width * height);
  distances.fill(-1);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  if (start.x >= 0 && start.x < width && start.y >= 0 && start.y < height) {
    const startIndex = start.y * width + start.x;
    distances[startIndex] = 0;
    queue[tail++] = startIndex;
  }

  while (head < tail) {
    const index = queue[head++];
    const y = Math.floor(index / width);
    const x = index - y * width;
    const cell = grid[y]?.[x];
    if (!cell) continue;

    for (let dir = 0; dir < 4; dir++) {
      if (cell.walls[dir]) continue;
      const nx = x + DX[dir];
      const ny = y + DY[dir];
      if (!grid[ny]?.[nx]) continue;
      const nextIndex = ny * width + nx;
      if (distances[nextIndex] !== -1) continue;
      distances[nextIndex] = distances[index] + 1;
      queue[tail++] = nextIndex;
    }
  }

  return new DistanceMap(width, distances);
}

function getDirectedReachableCellKeys(grid, start) {
  return createReachableCellSet(grid, start, true);
}

function getDirectedDistance(grid, start, target) {
  if (start.x === target.x && start.y === target.y) return 0;
  const width = getMapWidth(grid);
  const height = getMapHeight(grid);
  if (start.x < 0 || start.x >= width || start.y < 0 || start.y >= height ||
      target.x < 0 || target.x >= width || target.y < 0 || target.y >= height) return Infinity;

  const targetIndex = target.y * width + target.x;
  const distances = new Int32Array(width * height);
  distances.fill(-1);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 1;
  const startIndex = start.y * width + start.x;
  distances[startIndex] = 0;
  queue[0] = startIndex;

  while (head < tail) {
    const index = queue[head++];
    if (index === targetIndex) return distances[index];
    const y = Math.floor(index / width);
    const x = index - y * width;
    const cell = grid[y]?.[x];
    if (!cell) continue;

    for (let dir = 0; dir < 4; dir++) {
      if (cell.walls[dir] || !canEnterFrom(grid, x, y, dir)) continue;
      const nx = x + DX[dir];
      const ny = y + DY[dir];
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nextIndex = ny * width + nx;
      if (distances[nextIndex] !== -1) continue;
      distances[nextIndex] = distances[index] + 1;
      queue[tail++] = nextIndex;
    }
  }

  return Infinity;
}

function isCriticalPathInRange(grid, start, target, criticalPathRange) {
  if (!criticalPathRange) return true;
  const distance = getDirectedDistance(grid, start, target);
  return Number.isFinite(distance) &&
    distance >= criticalPathRange[0] &&
    distance <= criticalPathRange[1];
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

// Convert the generated cell graph into stable, machine-readable structure
// primitives. These are generation diagnostics, not player-facing trap flags.
export function getMapStructureMetrics(grid, rooms = []) {
  const width = getMapWidth(grid);
  const height = getMapHeight(grid);
  const roomKeys = new Set();
  rooms.forEach(room => {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) roomKeys.add(`${x},${y}`);
    }
  });

  const vertices = new Set();
  const adjacency = new Map();
  let edgeCount = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isPassageCell(grid, x, y)) continue;
      const key = `${x},${y}`;
      vertices.add(key);
      adjacency.set(key, []);
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isPassageCell(grid, x, y)) continue;
      const key = `${x},${y}`;
      if (!grid[y][x].walls[DIR_E] && isPassageCell(grid, x + 1, y)) {
        edgeCount++;
        adjacency.get(key).push(`${x + 1},${y}`);
        adjacency.get(`${x + 1},${y}`).push(key);
      }
      if (!grid[y][x].walls[DIR_S] && isPassageCell(grid, x, y + 1)) {
        edgeCount++;
        adjacency.get(key).push(`${x},${y + 1}`);
        adjacency.get(`${x},${y + 1}`).push(key);
      }
    }
  }

  let componentCount = 0;
  const seen = new Set();
  for (const key of vertices) {
    if (seen.has(key)) continue;
    componentCount++;
    const queue = [key];
    seen.add(key);
    for (const current of queue) {
      for (const next of adjacency.get(current) || []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
  }

  const nonBridgeEdges = getNonBridgePassageEdges(grid);
  const loopKeys = new Set();
  nonBridgeEdges.forEach(edge => {
    loopKeys.add(`${edge.x},${edge.y}`);
    loopKeys.add(`${edge.nx},${edge.ny}`);
  });

  const structureCounts = {
    corridor: 0,
    loop: 0,
    hub: 0,
    openArea: 0
  };
  const corridorKeys = new Set();
  let deadEndCount = 0;
  let junctionCount = 0;
  for (const key of vertices) {
    const degree = adjacency.get(key)?.length || 0;
    if (degree === 1) deadEndCount++;
    if (degree >= 3) junctionCount++;

    if (roomKeys.has(key)) {
      structureCounts.openArea++;
    } else if (degree >= 3) {
      structureCounts.hub++;
    } else if (loopKeys.has(key)) {
      structureCounts.loop++;
    } else {
      structureCounts.corridor++;
      corridorKeys.add(key);
    }
  }

  let corridorSegmentCount = 0;
  const seenCorridor = new Set();
  for (const key of corridorKeys) {
    if (seenCorridor.has(key)) continue;
    corridorSegmentCount++;
    const queue = [key];
    seenCorridor.add(key);
    for (const current of queue) {
      for (const next of adjacency.get(current) || []) {
        if (corridorKeys.has(next) && !seenCorridor.has(next)) {
          seenCorridor.add(next);
          queue.push(next);
        }
      }
    }
  }

  const walkableCellCount = vertices.size;
  const ratio = value => walkableCellCount === 0 ? 0 : value / walkableCellCount;
  return {
    walkableCellCount,
    edgeCount,
    componentCount,
    cycleCount: Math.max(0, edgeCount - walkableCellCount + componentCount),
    nonBridgeEdgeCount: nonBridgeEdges.length,
    alternativePathRate: edgeCount === 0 ? 0 : nonBridgeEdges.length / edgeCount,
    junctionCount,
    deadEndCount,
    deadEndRate: ratio(deadEndCount),
    corridorSegmentCount,
    corridorRatio: ratio(structureCounts.corridor),
    openAreaCount: rooms.length,
    openAreaCellCount: structureCounts.openArea,
    structureCounts
  };
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
  return [...requiredKeys].every(key => reachable.hasKey(key));
}

function shuffleInPlace(array, rng) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
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
  const candidates = [];
  for (let y = 1; y < getMapHeight(grid) - 1; y++) {
    for (let x = 1; x < getMapWidth(grid) - 1; x++) {
      for (let blockDir = 0; blockDir < 4; blockDir++) {
        if (grid[y][x].blockEnter[blockDir]) candidates.push({ x, y, blockDir });
      }
    }
  }

  let candidateIndex = 0;
  while (candidateIndex < candidates.length) {
    const option = candidates[candidateIndex];
    if (!grid[option.y][option.x].blockEnter[option.blockDir]) {
      candidateIndex++;
      continue;
    }

    const distance = getOneWayReverseDetourDistance(grid, option);
    const crossed = {
      x: option.x + DX[option.blockDir],
      y: option.y + DY[option.blockDir]
    };
    if (Number.isFinite(distance) &&
        distance >= ONE_WAY_MIN_DETOUR &&
        distance <= ONE_WAY_MAX_DETOUR &&
        Number.isFinite(getDirectedDistance(grid, crossed, start))) {
      candidateIndex++;
      continue;
    }

    grid[option.y][option.x].blockEnter[option.blockDir] = false;
    // The old scan restarted at row-major cell 0 after every removal. Keep
    // that order while avoiding a full grid scan over empty candidates.
    candidateIndex = 0;
  }
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
        if (!reachableKeys.has(px, py)) continue;
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
        if (!reachableKeys.has(x, y)) continue;

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

function placeOneWayPassages(
  grid,
  floor,
  start,
  stairsDownCoord,
  bossCoord,
  rng,
  requestedCount = null,
  criticalPathRange = null
) {
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
      if (hasValidOneWayReverseDetours(grid) &&
          canReachAllRequired(grid, start, requiredKeys) &&
          isCriticalPathInRange(grid, start, stairsDownCoord, criticalPathRange)) {
        usedEdges.add(candidate.key);
        placed++;
        break;
      }
      cell.blockEnter[option.blockDir] = false;
    }
  }

  return placed;
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
export const TERRAIN_STRUCTURE_TYPES = Object.freeze([
  "corridor",
  "loop",
  "hub",
  "openArea"
]);
const DEFAULT_STRUCTURE_PROFILE = Object.freeze({
  corridor: 0.40,
  loop: 0.25,
  hub: 0.15,
  openArea: 0.20
});
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
function normalizeStructureProfile(profile) {
  const values = TERRAIN_STRUCTURE_TYPES.map(type => Number(profile?.[type]) || 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return { ...DEFAULT_STRUCTURE_PROFILE };
  return Object.fromEntries(TERRAIN_STRUCTURE_TYPES.map((type, index) => [type, values[index] / total]));
}

function selectStructureType(profile, rng) {
  let threshold = rng();
  for (const type of TERRAIN_STRUCTURE_TYPES) {
    threshold -= profile[type];
    if (threshold < 0) return type;
  }
  return TERRAIN_STRUCTURE_TYPES.at(-1);
}

export function carveRooms(
  grid,
  rng,
  visited = null,
  roomCountRange = ROOM_COUNT_RANGE,
  structureProfile = null
) {
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

  if (structureProfile) {
    const profile = normalizeStructureProfile(structureProfile);
    candidates.sort((a, b) => {
      const areaScore = (candidate => candidate.w * candidate.h - 4);
      const entranceScore = candidate => countRoomEntrances(grid, candidate);
      const score = candidate =>
        profile.openArea * areaScore(candidate) + profile.hub * entranceScore(candidate);
      return score(b) - score(a);
    });
  }

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

export function createMazeProfile(floor, rng, profileRange = null, size = null, structureProfile = null) {
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
  const normalizedStructureProfile = structureProfile
    ? normalizeStructureProfile(structureProfile)
    : null;
  const corridorAdjustment = normalizedStructureProfile
    ? (normalizedStructureProfile.corridor - DEFAULT_STRUCTURE_PROFILE.corridor) * 0.16
    : 0;
  const loopAdjustment = normalizedStructureProfile
    ? (normalizedStructureProfile.loop - DEFAULT_STRUCTURE_PROFILE.loop) * 0.16
    : 0;

  return {
    straightBias: Math.max(0, Math.min(1, randomInRange(range.straightBias) + corridorAdjustment)),
    loopRate: Math.max(0, Math.min(1, randomNearRangeEdge(range.loopRate) + loopAdjustment)),
    structureProfile: normalizedStructureProfile,
    structureType: normalizedStructureProfile
      ? selectStructureType(normalizedStructureProfile, rng)
      : null,
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
  const mazeProfile = createMazeProfile(
    floor,
    rng,
    options.mazeProfile,
    { width: mapWidth, height: mapHeight },
    options.structureProfile
  );
  // 1. Initialize grid with all walls closed
  const grid = Array.from({ length: mapHeight }, () =>
    Array.from({ length: mapWidth }, () => ({
      walls: [true, true, true, true], // N, E, S, W starts closed
      blockEnter: [false, false, false, false],
      secretDoor: [false, false, false, false],
      secretFound: [false, false, false, false],
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

  const rooms = carveRooms(grid, rng, visited, options.roomCountRange, mazeProfile.structureProfile);

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

        if (reachableKeys.has(x, y) && grid[y][x].walls.some(w => !w)) {
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
      
      if (reachableKeys.has(x, y) && cell.walls.some(w => !w)) {
        trapCandidates.push({ x, y });
      }
    }
  }

  shuffle(trapCandidates);
  const trapCount = Math.min(options.trapCount ?? Math.min(6 + floor, 16), trapCandidates.length);

  const chokeTargeted = Math.round(trapCount * getTrapChokeRate(floor));
  const chokePool = [];
  const openPool = [];
  const chokeCells = getUndirectedChokeCells(grid, suCoord, stairsDownCoord);
  for (const candidate of trapCandidates) {
    const isChoke = chokeCells
      ? chokeCells.has(candidate.x, candidate.y)
      : isChokeCell(grid, candidate, suCoord, stairsDownCoord);
    if (chokePool.length < chokeTargeted && isChoke) {
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

    const trapType = selectTrapType(floor, rng, options.trapSet);
    
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

  placeOneWayPassages(
    grid,
    floor,
    suCoord,
    stairsDownCoord,
    bossCoord,
    rng,
    options.oneWayPassageCount,
    options.criticalPathRange
  );
  placeSecretDoors(grid, floor, suCoord, stairsDownCoord, bossCoord, rng, secretCounts);
  removeInvalidOneWayPassages(grid, suCoord);

  const structureMetrics = getMapStructureMetrics(grid, rooms);

  return {
    grid,
    stairsDownCoord,
    bossCoord,
    rooms,
    structureProfile: mazeProfile.structureProfile,
    structureType: mazeProfile.structureType,
    structureMetrics,
    trapMeta: {
      total: chosen.length,
      choke: chokePool.slice(0, chokeTargeted).length,
      chokeTargeted
    }
  };
}
