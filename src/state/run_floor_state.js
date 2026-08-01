import { generateRunFloor } from "../run_map_generator.js";
import { createFloorElite } from "../systems/roaming_elites.js";
import { markMapChanged } from "./state_core.js";

function createVisitedGrid(grid) {
  return grid.map(row => row.map(() => false));
}

function countChests(grid) {
  return grid.reduce((total, row) => total + row.filter(cell => cell.event === "chest").length, 0);
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
  if (stateLike.maps?.[floor - 1] && stateLike.visitedMaps?.[floor - 1]) {
    return stateLike.maps[floor - 1];
  }
  const runSeed = stateLike.currentRun?.runSeed;
  if (!runSeed) throw new Error("currentRun.runSeed is required before floor generation");
  const generated = generateRunFloor({ runSeed, floor });
  stateLike.maps ||= [];
  stateLike.visitedMaps ||= [];
  stateLike.floorChestsOpened ||= [];
  stateLike.floorChestsTotal ||= [];
  spawnFloorElite(stateLike, floor, runSeed, generated);
  stateLike.maps[floor - 1] = generated.grid;
  stateLike.visitedMaps[floor - 1] = createVisitedGrid(generated.grid);
  stateLike.floorChestsOpened[floor - 1] = 0;
  stateLike.floorChestsTotal[floor - 1] = countChests(generated.grid);
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
  markMapChanged(stateLike);
}
