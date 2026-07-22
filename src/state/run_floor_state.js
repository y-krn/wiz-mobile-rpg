import { generateRunFloor } from "../run_map_generator.js";
import { markMapChanged } from "./state_core.js";

function createVisitedGrid(grid) {
  return grid.map(row => row.map(() => false));
}

function countChests(grid) {
  return grid.reduce((total, row) => total + row.filter(cell => cell.event === "chest").length, 0);
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
  markMapChanged(stateLike);
}
