import { generateRandomMap, openWall } from "../src/map_generator.js";
import { state } from "../src/state/state_core.js";
import { applySavePayload, createSavePayload } from "../src/state/save_payload.js";
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

function assertGatePlacementConstraints() {
  let missingGates = 0;

  for (let seedIndex = 0; seedIndex < 100; seedIndex++) {
    const seed = `WARDEN-DISTANCE-${seedIndex}`;
    let parentStairs = null;
    let repeatedParentStairs = null;

    for (let floor = 1; floor <= 5; floor++) {
      const mapData = generateRandomMap(floor, parentStairs, seed);
      const repeated = generateRandomMap(floor, repeatedParentStairs, seed);
      const gate = mapData.wardenGate;

      assert(JSON.stringify(mapData) === JSON.stringify(repeated), `${seed} B${floor}F generation is not reproducible`);
      if (!gate) {
        missingGates++;
      } else {
        const start = floor === 1 ? { x: START_X, y: START_Y } : findMapCellByType(mapData.grid, "stairs-up");
        const destination = mapData.stairsDownCoord || mapData.bossCoord;
        const openedGrid = JSON.parse(JSON.stringify(mapData.grid));
        applyOpenedGatesToMap(openedGrid, [gate.id]);
        const openedDistance = distance(openedGrid, start, destination);
        const minStartDistance = Math.max(5, Math.floor(openedDistance * 0.3));
        const endpointDistances = [
          distance(openedGrid, start, { x: gate.x, y: gate.y }),
          distance(openedGrid, start, { x: gate.nx, y: gate.ny })
        ];
        assert(endpointDistances.every(value => value >= minStartDistance),
          `${seed} B${floor}F gate too close: ${endpointDistances.join(",")} < ${minStartDistance}`);
      }

      parentStairs = mapData.stairsDownCoord;
      repeatedParentStairs = repeated.stairsDownCoord;
    }
  }

  assert(missingGates === 0, `gate placement regressed: ${missingGates}/500 missing`);
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
assertGatePlacementConstraints();
assertOpenedGateRestores();
assertWardenConfirmSaveCollapses();

console.log("[PASS] warden gates");
