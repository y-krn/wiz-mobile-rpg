import { generateRandomMap, openWall } from "../src/map_generator.js";
import { state } from "../src/state/state_core.js";
import { applySavePayload, createSavePayload } from "../src/state/save_payload.js";
import { migrateSavePayload } from "../src/state/save_migrations.js";
import { applyDungeonMemoryToMaps } from "../src/state/dungeon_state.js";
import { applyOpenedGatesToMap, findMapCellByType, findWardenGate, getWardenGateId } from "../src/state/warden_gates.js";
import { menuContext } from "../src/navigation.js";
import { START_X, START_Y } from "../src/data.js";

const DIRS = [
  { dx: 0, dy: -1, dir: 0 },
  { dx: 1, dy: 0, dir: 1 },
  { dx: 0, dy: 1, dir: 2 },
  { dx: -1, dy: 0, dir: 3 }
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function distance(grid, start, target) {
  const queue = [{ ...start, dist: 0 }];
  const seen = new Set([`${start.x},${start.y}`]);
  const targetKey = `${target.x},${target.y}`;

  for (const pos of queue) {
    if (`${pos.x},${pos.y}` === targetKey) return pos.dist;
    const cell = grid[pos.y]?.[pos.x];
    if (!cell) continue;
    for (const { dx, dy, dir } of DIRS) {
      if (cell.walls[dir]) continue;
      const nx = pos.x + dx;
      const ny = pos.y + dy;
      const next = grid[ny]?.[nx];
      if (!next) continue;
      if (next.blockEnter?.[(dir + 2) % 4]) continue;
      const key = `${nx},${ny}`;
      if (!seen.has(key)) {
        seen.add(key);
        queue.push({ x: nx, y: ny, dist: pos.dist + 1 });
      }
    }
  }

  return Infinity;
}

function generateMaps(seed) {
  const b1 = generateRandomMap(1, null, seed);
  const b2 = generateRandomMap(2, b1.stairsDownCoord, seed);
  const b3 = generateRandomMap(3, b2.stairsDownCoord, seed);
  return [b1, b2, b3];
}

function assertGateShortcut(seed) {
  const maps = generateMaps(seed);
  maps.forEach((mapData, index) => {
    const floor = index + 1;
    const grid = mapData.grid;
    const gate = findWardenGate(grid, floor);
    assert(gate, `${seed} B${floor}F gate missing`);
    assert(gate.id === getWardenGateId(floor), `${seed} B${floor}F gate id mismatch`);
    assert(mapData.wardenGate?.id === gate.id, `${seed} B${floor}F metadata missing`);

    const start = floor === 1 ? { x: START_X, y: START_Y } : findMapCellByType(grid, "stairs-up");
    const stairsDown = findMapCellByType(grid, "stairs-down");
    const closedDistance = distance(grid, start, stairsDown);
    const openedGrid = JSON.parse(JSON.stringify(grid));
    applyOpenedGatesToMap(openedGrid, [gate.id]);
    const openedDistance = distance(openedGrid, start, stairsDown);
    assert(Number.isFinite(closedDistance), `${seed} B${floor}F closed route unreachable`);
    assert(Number.isFinite(openedDistance), `${seed} B${floor}F opened route unreachable`);
    assert(closedDistance - openedDistance >= 0, `${seed} B${floor}F shortcut regresses distance: ${closedDistance - openedDistance}`);
  });
}

function assertOldSaveBackfill() {
  const seed = "CASTLE-BBBB0000";
  const maps = generateMaps(seed);
  const oldMaps = maps.map(mapData => JSON.parse(JSON.stringify(mapData.grid)));
  oldMaps.forEach((grid, index) => {
    const gate = maps[index].wardenGate;
    if (gate) openWall(grid, gate.x, gate.y, gate.dir);
    grid.forEach(row => row.forEach(cell => {
      delete cell.sealedGate;
    }));
  });

  const migrated = migrateSavePayload({
    version: 5,
    x: 1,
    y: 1,
    dir: 0,
    party: [],
    roster: [],
    gold: 150,
    inventory: [],
    seed,
    floor: 1,
    maps: [...oldMaps, null, null],
    visitedMaps: oldMaps.map(grid => grid.map(row => row.map(() => false))),
    roamingMonsters: [],
    logs: []
  });
  applySavePayload(migrated);
  applyDungeonMemoryToMaps();
  for (let floor = 1; floor <= 3; floor++) {
    assert(findWardenGate(state.maps[floor - 1], floor), `old save B${floor}F gate not backfilled`);
    assert(state.roamingMonsters.some(rm => rm.kind === "warden" && rm.floor === floor), `old save B${floor}F warden not backfilled`);
  }
}

function assertOpenedGateRestores() {
  const seed = "WARDEN-OPENED";
  const maps = generateMaps(seed);
  state.maps = maps.map(mapData => mapData.grid);
  state.openedGates = [getWardenGateId(1)];
  applyDungeonMemoryToMaps();
  const gate = findWardenGate(state.maps[0], 1);
  assert(gate, "opened gate metadata missing");
  assert(!state.maps[0][gate.y][gate.x].walls[gate.dir], "opened gate wall not opened");
}

function assertWardenConfirmSaveCollapses() {
  state.gameState = "submenu";
  menuContext.type = "warden_confirm";
  menuContext.prevGameState = "explore";
  const payload = createSavePayload();
  assert(payload.gameState === "explore", `warden confirm persisted as ${payload.gameState}`);
}

["CASTLE-TEST-0", "CASTLE-TEST-4", "CASTLE-TEST-5", "CASTLE-TEST-10", "CASTLE-TEST-11"].forEach(assertGateShortcut);
assertOldSaveBackfill();
assertOpenedGateRestores();
assertWardenConfirmSaveCollapses();

console.log("[PASS] warden gates");
