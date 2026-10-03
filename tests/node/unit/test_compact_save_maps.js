import assert from "node:assert/strict";

// #1974: floor grids and visited maps are saved in a compact, lossless form so
// a deep run stays within localStorage, older plain saves still load, and a
// failed save is reported instead of silently dropped.
const store = new Map();
let failSaveWrites = 0;
let failBackupWrites = false;
const quota = () => Object.assign(new Error("quota"), { name: "QuotaExceededError" });
globalThis.localStorage = {
  getItem: key => store.get(key) ?? null,
  setItem: (key, value) => {
    if (key.endsWith("_backup") && failBackupWrites) throw quota();
    if (key.endsWith("_autosave") && failSaveWrites > 0) { failSaveWrites -= 1; throw quota(); }
    store.set(key, String(value));
  },
  removeItem: key => store.delete(key),
  clear: () => store.clear()
};

const {
  SAVE_GRID_FORMAT,
  decodeSaveGrid,
  decodeVisitedGrid,
  encodeSaveGrid,
  encodeVisitedGrid
} = await import("../../../src/state/map_codec.js");
const { generateRunFloor } = await import("../../../src/run_map_generator.js");
const { createDefaultCurrentRun, createSavePayload, createStartingKitCharacter, saveAutosave, state } = await import("../../../src/state.js");
const { SAVE_VERSION, migrateSavePayload } = await import("../../../src/state/save_migrations.js");
const { SAVE_KEYS } = await import("../../../src/trial_profiles.js");

const roundTrip = value => JSON.parse(JSON.stringify(value));

// Every generated floor across all biomes encodes and decodes exactly.
{
  for (let floor = 1; floor <= 30; floor += 1) {
    const grid = generateRunFloor({ runSeed: "ISSUE-1974", floor }).grid;
    const encoded = roundTrip(encodeSaveGrid(grid));
    assert.equal(encoded.format, SAVE_GRID_FORMAT, `B${floor} encodes`);
    assert.deepEqual(decodeSaveGrid(encoded), grid, `B${floor} decodes to the same grid`);
  }
}

// Played state on a floor survives: opened chests, discovered traps, found
// secret doors, resolved gimmicks, used rooms, custom cell fields.
{
  const grid = generateRunFloor({ runSeed: "ISSUE-1974-PLAY", floor: 6 }).grid;
  const cells = grid.flat();
  const chest = cells.find(cell => cell.event === "chest");
  chest.event = null;
  const trap = cells.find(cell => cell.trap);
  trap.trap.state = "discovered";
  cells[5].secretFound = [true, false, false, true];
  cells[6].blockEnter = [false, true, false, false];
  const lever = cells.find(cell => cell.lever);
  if (lever) lever.lever.state = "pulled";
  const room = cells.find(cell => cell.specialRoom);
  room.specialRoom.used = true;
  room.specialRoom.discovered = true;
  cells[7].message = "古い落書きがある";
  cells[8].milestoneFloor = 5;
  delete cells[9].message;
  assert.deepEqual(decodeSaveGrid(roundTrip(encodeSaveGrid(grid))), grid, "played state round-trips exactly");
}

// Grids that do not fit the format stay in plain form.
{
  const odd = [[{ walls: [true, true, true, true], type: "empty" }]];
  assert.equal(encodeSaveGrid(odd), odd, "a cell without every flag array stays plain");
  assert.equal(encodeSaveGrid(null), null);
  assert.deepEqual(decodeSaveGrid([[{ walls: [false, false, false, false] }]]), [[{ walls: [false, false, false, false] }]],
    "plain grids pass through decoding");
  assert.throws(() => decodeSaveGrid({ format: SAVE_GRID_FORMAT, width: 2, height: 2, cells: "00" }), { name: "MalformedSavePayloadError" });
}

// Visited maps pack to bits and back.
{
  const visited = Array.from({ length: 7 }, (_, y) => Array.from({ length: 5 }, (_, x) => (x * 3 + y) % 4 === 0));
  assert.deepEqual(decodeVisitedGrid(roundTrip(encodeVisitedGrid(visited))), visited);
  assert.equal(encodeVisitedGrid([[true, "x"]])[0][1], "x", "non-boolean visited grids stay plain");
}

// A full save round trip through the real payload boundary.
{
  state.party = [createStartingKitCharacter("vanguard")];
  state.currentRun = createDefaultCurrentRun();
  state.currentRun.runSeed = "ISSUE-1974-SAVE";
  const maps = [];
  const visitedMaps = [];
  for (let floor = 1; floor <= 3; floor += 1) {
    const grid = generateRunFloor({ runSeed: "ISSUE-1974-SAVE", floor }).grid;
    maps.push(grid);
    visitedMaps.push(grid.map((row, y) => row.map((_, x) => (x + y) % 3 === 0)));
  }
  maps[0].flat().find(cell => cell.event === "chest").event = null;
  state.maps = maps;
  state.visitedMaps = visitedMaps;
  state.floor = 1;
  const start = maps[0].flat().indexOf(maps[0].flat().find(cell => cell.type === "stairs-up"));
  state.x = start % maps[0][0].length;
  state.y = Math.floor(start / maps[0][0].length);
  state.prevX = state.x;
  state.prevY = state.y;
  state.gameState = "explore";

  const payload = roundTrip(createSavePayload());
  assert.equal(payload.maps[0].format, SAVE_GRID_FORMAT, "the save stores the compact form");
  const restored = migrateSavePayload(payload);
  assert.deepEqual(restored.visitedMaps, visitedMaps, "visited maps round-trip through the save");
  assert.equal(restored.maps[0].flat().filter(cell => cell.event === "chest").length,
    maps[0].flat().filter(cell => cell.event === "chest").length, "the opened chest stays opened");

  // An older save with plain grids loads to exactly the same state: load-time
  // repairs see the same grids whichever form they were saved in.
  const legacy = roundTrip({ ...payload, maps, visitedMaps, version: SAVE_VERSION });
  const restoredLegacy = migrateSavePayload(legacy);
  assert.deepEqual(restored.maps, restoredLegacy.maps, "compact and plain saves load to the same maps");
  assert.deepEqual(restoredLegacy.visitedMaps, visitedMaps);
}

// A deep run stays small: thirty floors fit comfortably in localStorage.
{
  const maps = [];
  for (let floor = 1; floor <= 30; floor += 1) maps.push(generateRunFloor({ runSeed: "ISSUE-1974-DEEP", floor }).grid);
  const plain = JSON.stringify(maps).length;
  const compact = JSON.stringify(maps.map(grid => encodeSaveGrid(grid))).length;
  assert.ok(compact * 10 < plain, `compact maps (${compact}) are under a tenth of plain maps (${plain})`);
  assert.ok(compact < 400 * 1024, `thirty compact floors stay under 400 KB (${compact})`);
}

// When storage is full the primary save drops the backup and retries; a save
// that still fails is reported to the player once.
{
  state.logs = [];
  store.set(SAVE_KEYS.backup, "old-backup");
  failSaveWrites = 1;
  saveAutosave();
  assert.ok(store.has(SAVE_KEYS.save), "the primary save lands after dropping the backup");
  assert.equal(state.logs.some(log => String(log?.msg ?? log).includes("保存できませんでした")), false, "a recovered save is not reported");

  failSaveWrites = 99;
  failBackupWrites = true;
  saveAutosave();
  saveAutosave();
  const warnings = state.logs.filter(log => String(log?.msg ?? log).includes("保存できませんでした"));
  assert.equal(warnings.length, 1, "a failing save is reported once");
  failSaveWrites = 0;
  failBackupWrites = false;
}

console.log("[PASS] Issue #1974 compact save maps are lossless, small, backward compatible, and failures are reported.");
