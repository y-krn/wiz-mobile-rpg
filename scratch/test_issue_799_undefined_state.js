import assert from "node:assert/strict";
import { generateRunFloor } from "../src/run_map_generator.js";
import {
  createDefaultCurrentRun,
  initNewGame,
  loadGame,
  saveAutosave,
  state
} from "../src/state.js";
import { ensureRunFloor, isUsableFloorMap, resetRunFloors, RunFloorRecoveryError } from "../src/state/run_floor_state.js";
import { getCurrentExplorationCell } from "../src/movement.js";

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

// A rectangular map with an incomplete cell must fail the active-map boundary
// before movement or rendering can dereference cell.walls/secretFound.
initNewGame();
createRunState("ISSUE-799-CELL-SCHEMA");
const malformedCellMap = generateRunFloor({ runSeed: "ISSUE-799-CELL-SCHEMA", floor: 1 }).grid;
malformedCellMap[0][0] = {};
state.maps = [malformedCellMap];
state.visitedMaps = [malformedCellMap.map(row => row.map(() => false))];
state.x = 0;
state.y = 0;
state.prevX = 0;
state.prevY = 0;
delete state._freshRunFloor;
assert.equal(isUsableFloorMap(malformedCellMap), false, "malformed cells are not usable floor maps");
assert.throws(() => ensureRunFloor(state, 1), error => error instanceof RunFloorRecoveryError, "malformed active cell fails closed");
state.logs = [];
state.gameState = "explore";
assert.equal(getCurrentExplorationCell(), null, "movement/Search rejects a malformed current cell");
assert.equal(state.gameState, "town", "malformed current cell stops movement/Search");
assert.match(state.logs.join("\n"), /安全に復旧できない/, "malformed current cell exposes a recovery error");

// Active-floor corruption must fail closed rather than replace the map and
// reset chest/trap/secret/milestone progress.
initNewGame();
createRunState("ISSUE-799-MUTATION");
const mutationMap = generateRunFloor({ runSeed: "ISSUE-799-MUTATION", floor: 1 }).grid;
state.maps = [mutationMap];
state.visitedMaps = [mutationMap.map(row => row.map(() => false))];
state.floorChestsOpened = [2];
state.floorChestsTotal = [7];
state.currentRun.floorSteps = { 1: 12 };
state.currentRun.defeatedMilestones = [5];
delete state._freshRunFloor;
const damagedMap = state.maps[0];
damagedMap[0].splice(0, 1);
assert.throws(() => ensureRunFloor(state, 1), error => error instanceof RunFloorRecoveryError, "active-floor damage fails closed");
assert.strictEqual(state.maps[0], damagedMap, "active-floor damage is not silently replaced");
assert.equal(state.floorChestsOpened[0], 2, "active-floor chest progress is retained on failure");

// The Search action shares this guarded preflight with movement, so a broken
// active map becomes an explicit recovery stop instead of a TypeError.
state.logs = [];
state.gameState = "explore";
state.maps[0] = null;
assert.equal(getCurrentExplorationCell(), null, "broken active map has no exploration cell");
assert.equal(state.gameState, "town", "broken active map stops exploration");
assert.match(state.logs.join("\n"), /安全に復旧できない/, "broken active map exposes a recovery error");

// An existing active floor with missing or malformed visited data must not be
// replaced by an all-false grid, which would erase exploration progress.
initNewGame();
createRunState("ISSUE-799-VISITED-DATA");
const visitedDataMap = generateRunFloor({ runSeed: "ISSUE-799-VISITED-DATA", floor: 1 }).grid;
state.maps = [visitedDataMap];
state.visitedMaps = [null];
delete state._freshRunFloor;
assert.throws(() => ensureRunFloor(state, 1), error => error instanceof RunFloorRecoveryError, "missing active visited data fails closed");
state.visitedMaps[0] = visitedDataMap.map(row => row.map(() => false));
state.visitedMaps[0][0].pop();
assert.throws(() => ensureRunFloor(state, 1), error => error instanceof RunFloorRecoveryError, "corrupt active visited data fails closed");

// Resume path: a save may contain other run floors while the active floor is
// damaged. Loading must preserve the run seed, floor, and damaged payload, then
// fail closed instead of regenerating it and replaying rewards.
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
corrupt.maps[2][13][3] = {};
corrupt.visitedMaps[2] = corrupt.maps[2].map(row => row.map(() => false));
localStorage.setItem("mobile_wiz_rpg_autosave", JSON.stringify(corrupt));
localStorage.removeItem("mobile_wiz_rpg_backup");
localStorage.removeItem("mobile_wiz_rpg_save");
loadGame();

assert.equal(state.currentRun.runSeed, "ISSUE-799-RESUME", "failed recovery preserves currentRun.runSeed");
assert.equal(state.floor, 3, "failed recovery preserves active floor");
assert.equal(isUsableFloorMap(state.maps[2]), false, "failed recovery preserves the damaged active-floor map");
assert.deepEqual(state.maps[2][13][3], {}, "failed recovery preserves the malformed active cell");
assert.match(state.logs.join("\n"), /安全に復旧できない/, "resume exposes an explicit recovery error");
assert.ok(localStorage.getItem("mobile_wiz_rpg_corrupt"), "unrecoverable save is preserved for recovery");

// A structurally usable active map still requires an intact visited map on
// resume; only new/non-active floor generation may initialize that data.
initNewGame();
createRunState("ISSUE-799-VISITED-RESUME");
const visitedResumeMap = generateRunFloor({ runSeed: "ISSUE-799-VISITED-RESUME", floor: 1 }).grid;
state.maps = [visitedResumeMap];
state.visitedMaps = [null];
delete state._freshRunFloor;
saveAutosave();
const missingVisitedSave = JSON.parse(localStorage.getItem("mobile_wiz_rpg_autosave"));
localStorage.setItem("mobile_wiz_rpg_autosave", JSON.stringify(missingVisitedSave));
localStorage.removeItem("mobile_wiz_rpg_backup");
localStorage.removeItem("mobile_wiz_rpg_save");
loadGame();

assert.equal(state.currentRun.runSeed, "ISSUE-799-VISITED-RESUME", "visited-map recovery preserves currentRun.runSeed");
assert.ok(isUsableFloorMap(state.maps[0]), "usable active map remains intact when visited data is missing");
assert.equal(state.visitedMaps[0], null, "missing active visited data is preserved");
assert.match(state.logs.join("\n"), /安全に復旧できない/, "missing active visited data exposes a recovery error");
assert.ok(localStorage.getItem("mobile_wiz_rpg_corrupt"), "missing active visited data is preserved for recovery");

// Migration path: all maps missing in an active-run save must not be replaced
// by maps generated from the legacy state.seed.
initNewGame();
createRunState("ISSUE-799-ALL-MISSING");
state.seed = "LEGACY-SEED-MUST-NOT-BE-USED";
state.floor = 2;
state.maps = [null, null, null, null, null];
state.visitedMaps = [null, null, null, null, null];
saveAutosave();
const allMissing = JSON.parse(localStorage.getItem("mobile_wiz_rpg_autosave"));
allMissing.maps = [];
localStorage.setItem("mobile_wiz_rpg_autosave", JSON.stringify(allMissing));
loadGame();

assert.equal(state.currentRun.runSeed, "ISSUE-799-ALL-MISSING", "all-missing migration preserves active run seed");
assert.equal(state.floor, 2, "all-missing migration preserves active floor");
assert.equal(state.maps.every(map => map == null), true, "all-missing migration does not create legacy maps");
assert.match(state.logs.join("\n"), /安全に復旧できない/, "all-missing migration fails closed visibly");

console.log("[PASS] #799 map recovery covers fresh floors, mutation safety, Search preflight, and active-run migration");
