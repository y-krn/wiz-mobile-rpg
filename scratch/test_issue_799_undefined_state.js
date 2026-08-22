import assert from "node:assert/strict";
import { generateRunFloor } from "../src/run_map_generator.js";
import {
  createDefaultCurrentRun,
  initNewGame,
  loadGame,
  saveAutosave,
  state
} from "../src/state.js";
import { ensureRunFloor, isUsableFloorMap, resetRunFloors } from "../src/state/run_floor_state.js";

globalThis.localStorage = (() => {
  let values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    clear: () => { values = new Map(); }
  };
})();

function createRunState(runSeed = "ISSUE-799-RUN") {
  state.currentRun = createDefaultCurrentRun();
  state.currentRun.runSeed = runSeed;
  state.currentRun.startFloor = 1;
  state.gameState = "explore";
  state.floor = 1;
  state.logs = [];
}

// New-start path: resetRunFloors intentionally clears generated run maps, then
// ensureRunFloor must provide the first playable map before the first render.
initNewGame();
createRunState();
resetRunFloors(state);
ensureRunFloor(state, 1);
assert.ok(isUsableFloorMap(state.maps[0]), "new run restores a complete first-floor map");
assert.ok(state.visitedMaps[0], "new run restores visited state with the map");

// Transition path: an unvisited floor is generated deterministically on entry.
ensureRunFloor(state, 2);
assert.ok(isUsableFloorMap(state.maps[1]), "floor transition creates a complete destination map");

// Resume path: a save may contain other run floors while the active floor is
// missing. The load must regenerate that floor from runSeed before exploration
// can reach direct state.map[y][x] callers.
const expected = generateRunFloor({ runSeed: "ISSUE-799-RESUME", floor: 3 }).grid;
initNewGame();
createRunState("ISSUE-799-RESUME");
state.floor = 3;
state.x = 3;
state.y = 13;
state.maps = [generateRunFloor({ runSeed: "ISSUE-799-RESUME", floor: 1 }).grid, null, null, null, null];
state.visitedMaps = [state.maps[0].map(row => row.map(() => false)), null, null, null, null];
saveAutosave();

const corrupt = JSON.parse(localStorage.getItem("mobile_wiz_rpg_autosave"));
corrupt.maps[2] = expected.map(row => row.slice());
corrupt.maps[2][13].splice(3, 1);
corrupt.visitedMaps[2] = corrupt.maps[2].map(row => row.map(() => false));
localStorage.setItem("mobile_wiz_rpg_autosave", JSON.stringify(corrupt));
loadGame();

assert.ok(isUsableFloorMap(state.maps[2]), "resume repairs a missing active-floor map");
assert.deepEqual(state.maps[2], expected, "resume regeneration is deterministic for the saved run");
assert.match(state.logs.join("\n"), /マップデータが欠落していたため/, "resume exposes map recovery to the player");

console.log("[PASS] #799 map recovery covers new start, floor transition, and active-run resume");
