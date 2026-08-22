import { generateRunFloor } from "../run_map_generator.js";
import { createFloorElite } from "../systems/roaming_elites.js";
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
  return Array.isArray(visitedMap) && visitedMap.length === grid.length && visitedMap.every((row, y) =>
    Array.isArray(row) && row.length === grid[y].length && row.every(cell => typeof cell === "boolean")
  );
}

export function isUsableFloorMap(grid) {
  if (!Array.isArray(grid) || grid.length === 0) return false;
  const width = grid[0]?.length;
  return Number.isInteger(width) && width > 0 && grid.every(row =>
    Array.isArray(row) && row.length === width && row.every(isUsableFloorCell)
  );
}

export class RunFloorRecoveryError extends Error {
  constructor(floor) {
    super(`B${floor}F map recovery is unsafe because saved floor progress cannot be reconstructed.`);
    this.name = "RunFloorRecoveryError";
    this.floor = floor;
    this.userMessage = `地下${floor}階のマップを安全に復旧できないため、探索を停止しました。進行を守るためセーブデータは保持されています。`;
  }
}

// 徘徊エリートは階を生成した瞬間に置く。撃破済みの階はmapsが残るためここまで来ない。
function spawnFloorElite(stateLike, floor, runSeed, mapData) {
  const elite = createFloorElite({ runSeed, floor, mapData });
  if (!elite) return;
  stateLike.roamingMonsters ||= [];
  if (stateLike.roamingMonsters.some(monster => monster.id === elite.id)) return;
  stateLike.roamingMonsters.push(elite);
}

export function ensureRunFloor(stateLike, floor) {
  const index = floor - 1;
  const existingMap = stateLike.maps?.[index];
  const isActiveRun = Boolean(stateLike.currentRun?.runSeed && !stateLike.currentRun.returnReason);
  const isActiveFloor = floor === stateLike.floor;
  if (isUsableFloorMap(existingMap)) {
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
