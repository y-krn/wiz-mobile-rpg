import { generateRunFloor } from "../run_map_generator.js";
import { createFloorElite, markEliteEntryRollResolved } from "../systems/roaming_elites.js";
import { getFloorTemplate } from "../data/floor_templates.js";
import { getBandIndexForFloor, getBandTrialForFloor, getStoredBandTrial } from "../rules/floor_trials.js";
import { markMapChanged } from "./state_core.js";

function createVisitedGrid(grid) {
  return grid.map(row => row.map(() => false));
}

function countChests(grid) {
  return grid.reduce((total, row) => total + row.filter(cell => cell.event === "chest").length, 0);
}

function isFourBooleanArray(value) {
  return Array.isArray(value) && value.length === 4 && value.every(entry => typeof entry === "boolean");
}

export function isUsableFloorCell(cell) {
  return cell && typeof cell === "object" &&
    typeof cell.type === "string" &&
    isFourBooleanArray(cell.walls) &&
    isFourBooleanArray(cell.blockEnter) &&
    isFourBooleanArray(cell.secretDoor) &&
    isFourBooleanArray(cell.secretFound);
}

function isUsableVisitedMap(grid, visitedMap) {
  if (!Array.isArray(visitedMap) || visitedMap.length !== grid.length) return false;
  for (let y = 0; y < grid.length; y++) {
    if (!Object.hasOwn(visitedMap, y)) return false;
    const row = visitedMap[y];
    if (!Array.isArray(row) || row.length !== grid[y].length) return false;
    for (let x = 0; x < grid[y].length; x++) {
      if (!Object.hasOwn(row, x) || typeof row[x] !== "boolean") return false;
    }
  }
  return true;
}

function areStairsConnected(grid, width, height) {
  let stairsUp = null;
  let stairsDown = null;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const type = grid[y][x].type;
      if (type === "stairs-up") stairsUp = { x, y };
      if (type === "stairs-down") stairsDown = { x, y };
    }
  }
  if (!stairsUp || !stairsDown) return false;

  const queue = [stairsUp];
  const visited = new Set([`${stairsUp.x},${stairsUp.y}`]);
  const directions = [
    { dx: 0, dy: -1, dir: 0 },
    { dx: 1, dy: 0, dir: 1 },
    { dx: 0, dy: 1, dir: 2 },
    { dx: -1, dy: 0, dir: 3 }
  ];
  for (const position of queue) {
    if (position.x === stairsDown.x && position.y === stairsDown.y) return true;
    const cell = grid[position.y][position.x];
    for (const { dx, dy, dir } of directions) {
      const nextX = position.x + dx;
      const nextY = position.y + dy;
      if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
      const next = grid[nextY][nextX];
      if (cell.walls[dir] || next.blockEnter[(dir + 2) % 4]) continue;
      const key = `${nextX},${nextY}`;
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push({ x: nextX, y: nextY });
    }
  }
  return false;
}

export function isUsableFloorMap(grid, floor = null) {
  if (!Array.isArray(grid)) return false;
  const expectedSize = Number.isInteger(floor) && floor > 0
    ? getFloorTemplate(floor).size
    : null;
  const width = expectedSize?.width ?? grid[0]?.length;
  const height = expectedSize?.height ?? grid.length;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return false;
  if (grid.length !== height) return false;

  let hasStairsUp = false;
  let hasStairsDown = false;
  for (let y = 0; y < height; y++) {
    const row = grid[y];
    if (!Array.isArray(row) || row.length !== width) return false;
    for (let x = 0; x < width; x++) {
      const cell = row[x];
      if (!isUsableFloorCell(cell)) return false;
      if (cell.type === "stairs-up") hasStairsUp = true;
      if (cell.type === "stairs-down") hasStairsDown = true;
    }
  }
  return hasStairsUp && hasStairsDown && areStairsConnected(grid, width, height);
}

export class RunFloorRecoveryError extends Error {
  constructor(floor) {
    super(`B${floor}F map recovery is unsafe because saved floor progress cannot be reconstructed.`);
    this.name = "RunFloorRecoveryError";
    this.floor = floor;
    this.userMessage = `地下${floor}階のマップを安全に復旧できないため、探索を停止しました。進行を守るためセーブデータは保持されています。`;
  }
}

// 徘徊エリートは階生成時のseed抽選に通った場合だけ置く。撃破済みの階は
// mapsが残るためここまで来ず、長居による追加出現はmovement側から判定する。
function spawnFloorElite(stateLike, floor, runSeed, mapData) {
  const floorState = markEliteEntryRollResolved(stateLike, floor);
  if (floorState.spawned || floorState.defeated) return;
  const elite = createFloorElite({ runSeed, floor, mapData, spawnReason: "entry" });
  if (!elite) return;
  stateLike.roamingMonsters ||= [];
  if (stateLike.roamingMonsters.some(monster => monster.id === elite.id)) return;
  stateLike.roamingMonsters.push(elite);
  floorState.spawned = true;
}

function cacheBandTrial(stateLike, floor) {
  const runSeed = stateLike.currentRun?.runSeed;
  if (!runSeed || !stateLike.currentRun || stateLike.currentRun.returnReason) return;
  const bandIndex = getBandIndexForFloor(floor);
  stateLike.currentRun.trialBands ||= {};
  const existingTrial = stateLike.currentRun.trialBands[bandIndex];
  const trial = getBandTrialForFloor(runSeed, floor, existingTrial);
  const storedTrial = getStoredBandTrial(trial);
  if (storedTrial && (
    existingTrial?.bandIndex !== storedTrial.bandIndex ||
    existingTrial?.mainId !== storedTrial.mainId ||
    existingTrial?.subId !== storedTrial.subId
  )) {
    stateLike.currentRun.trialBands[bandIndex] = storedTrial;
  }
}

export function ensureRunFloor(stateLike, floor) {
  const index = floor - 1;
  const existingMap = stateLike.maps?.[index];
  const isActiveRun = Boolean(stateLike.currentRun?.runSeed && !stateLike.currentRun.returnReason);
  const isActiveFloor = floor === stateLike.floor;
  cacheBandTrial(stateLike, floor);
  if (isUsableFloorMap(existingMap, isActiveRun ? floor : null)) {
    if (isActiveRun) markEliteEntryRollResolved(stateLike, floor);
    const visitedMap = stateLike.visitedMaps?.[index];
    if (!isUsableVisitedMap(existingMap, visitedMap)) {
      if (isActiveRun && isActiveFloor && stateLike._freshRunFloor !== floor) {
        throw new RunFloorRecoveryError(floor);
      }
      stateLike.visitedMaps ||= [];
      stateLike.visitedMaps[index] = createVisitedGrid(existingMap);
      markMapChanged(stateLike);
    }
    return existingMap;
  }

  if (isActiveRun && isActiveFloor && stateLike._freshRunFloor !== floor) {
    throw new RunFloorRecoveryError(floor);
  }

  const runSeed = stateLike.currentRun?.runSeed;
  if (!runSeed) throw new Error("currentRun.runSeed is required before floor generation");
  const generated = generateRunFloor({ runSeed, floor });
  stateLike.maps ||= [];
  stateLike.visitedMaps ||= [];
  stateLike.floorChestsOpened ||= [];
  stateLike.floorChestsTotal ||= [];
  spawnFloorElite(stateLike, floor, runSeed, generated);
  stateLike.maps[index] = generated.grid;
  stateLike.visitedMaps[index] = createVisitedGrid(generated.grid);
  stateLike.floorChestsOpened[index] = 0;
  stateLike.floorChestsTotal[index] = countChests(generated.grid);
  if (stateLike._freshRunFloor === floor) delete stateLike._freshRunFloor;
  markMapChanged(stateLike);
  return generated.grid;
}

export function resetRunFloors(stateLike) {
  stateLike.maps = [];
  stateLike.visitedMaps = [];
  stateLike.floorChestsOpened = [];
  stateLike.floorChestsTotal = [];
  // 床を捨てる以上、前ランの座標を持つ徘徊エリートと騒音も一緒に捨てる。
  stateLike.roamingMonsters = [];
  stateLike.noiseEvents = [];
  stateLike._freshRunFloor = stateLike.floor;
  markMapChanged(stateLike);
}
