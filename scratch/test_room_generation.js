import assert from "node:assert/strict";
import { generateRandomMap, ROOM_COUNT_RANGE, ROOM_SIZES } from "../src/map_generator.js";
import { EVENT_TYPES } from "../src/data.js";

const DIRS = [
  { dx: 0, dy: -1, opposite: 2 },
  { dx: 1, dy: 0, opposite: 3 },
  { dx: 0, dy: 1, opposite: 0 },
  { dx: -1, dy: 0, opposite: 1 }
];

function reachableKeys(grid, start) {
  const queue = [start];
  const seen = new Set([`${start.x},${start.y}`]);
  for (const { x, y } of queue) {
    const cell = grid[y][x];
    DIRS.forEach(({ dx, dy, opposite }, dir) => {
      const nx = x + dx;
      const ny = y + dy;
      const next = grid[ny]?.[nx];
      const canOpen = cell.secretDoor?.[dir] || cell.sealedGate?.[dir];
      if (!next || (cell.walls[dir] && !canOpen) || next.blockEnter?.[opposite]) return;
      const key = `${nx},${ny}`;
      if (!seen.has(key)) {
        seen.add(key);
        queue.push({ x: nx, y: ny });
      }
    });
  }
  return seen;
}

function findCell(grid, predicate) {
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (predicate(grid[y][x])) return { x, y };
    }
  }
  return null;
}

function isInsideRoom(room, x, y) {
  return x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h;
}

// Entrances may have been converted into a warden gate or secret door after
// carving; both are openable in play, so count them as entrances.
function countOpenableEntrances(grid, room) {
  let entrances = 0;
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      const cell = grid[y][x];
      DIRS.forEach(({ dx, dy }, dir) => {
        if (isInsideRoom(room, x + dx, y + dy)) return;
        if (!cell.walls[dir] || cell.sealedGate?.[dir] || cell.secretDoor?.[dir]) entrances++;
      });
    }
  }
  return entrances;
}

function assertRoomGeometry(grid, room, label) {
  const sizeOk = ROOM_SIZES.some(size => size.w === room.w && size.h === room.h);
  assert(sizeOk, `${label} unexpected room size ${room.w}x${room.h}`);
  assert(room.x >= 1 && room.y >= 1 && room.x + room.w <= grid[0].length - 1 && room.y + room.h <= grid.length - 1,
    `${label} room touches outer ring`);

  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      const cell = grid[y][x];
      DIRS.forEach(({ dx, dy }, dir) => {
        if (!isInsideRoom(room, x + dx, y + dy)) return;
        // A warden gate may seal an internal edge after carving; anything else must stay open.
        assert(!cell.walls[dir] || cell.sealedGate?.[dir],
          `${label} internal wall closed at ${x},${y} dir ${dir}`);
      });
    }
  }
  assert(countOpenableEntrances(grid, room) >= 2, `${label} has fewer than 2 entrances`);
}

function countEvents(grid) {
  const counts = {};
  grid.flat().forEach(cell => {
    if (cell.event) counts[cell.event] = (counts[cell.event] || 0) + 1;
  });
  return counts;
}

let missingGates = 0;
for (let seedIndex = 0; seedIndex < 100; seedIndex++) {
  const seed = `room-carving-${seedIndex}`;
  let parentStairsCoord = null;
  for (let floor = 1; floor <= 5; floor++) {
    const label = `${seed}/B${floor}F`;
    const generated = generateRandomMap(floor, parentStairsCoord, seed);
    const { grid, rooms } = generated;

    assert(rooms.length >= ROOM_COUNT_RANGE[0] && rooms.length <= ROOM_COUNT_RANGE[1],
      `${label} room count ${rooms.length} out of range`);
    rooms.forEach(room => assertRoomGeometry(grid, room, label));

    const start = findCell(grid, cell => cell.type === "stairs-up");
    assert(start, `${label} stairs-up missing`);
    const reachable = reachableKeys(grid, start);
    rooms.forEach(room => {
      for (let y = room.y; y < room.y + room.h; y++) {
        for (let x = room.x; x < room.x + room.w; x++) {
          assert(reachable.has(`${x},${y}`), `${label} room cell unreachable at ${x},${y}`);
        }
      }
    });
    if (generated.stairsDownCoord) {
      assert(reachable.has(`${generated.stairsDownCoord.x},${generated.stairsDownCoord.y}`),
        `${label} stairs-down unreachable`);
    }
    if (generated.bossCoord) {
      assert(reachable.has(`${generated.bossCoord.x},${generated.bossCoord.y}`), `${label} boss unreachable`);
    }
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        if (grid[y][x].event || grid[y][x].trap) {
          assert(reachable.has(`${x},${y}`), `${label} event unreachable at ${x},${y}`);
        }
      }
    }

    if (!generated.wardenGate) missingGates++;

    const events = countEvents(grid);
    assert((events[EVENT_TYPES.CHEST] || 0) >= 6, `${label} chest count ${events[EVENT_TYPES.CHEST]}`);
    assert.equal(events[EVENT_TYPES.SPRING] || 0, 2, `${label} spring count`);
    assert((events[EVENT_TYPES.TABLET] || 0) >= 2, `${label} tablet count ${events[EVENT_TYPES.TABLET]}`);
    assert.equal(events[EVENT_TYPES.MERCHANT] || 0, 1, `${label} merchant count`);

    parentStairsCoord = generated.stairsDownCoord;
  }
}

assert.equal(missingGates, 0, `gate placement regressed with rooms: ${missingGates}/500 missing`);

const first = generateRandomMap(1, null, "room-repeatability");
const second = generateRandomMap(1, null, "room-repeatability");
assert.deepEqual(first, second, "same seed must reproduce the same map and rooms");

console.log("[PASS] 100 seeds x 5 floors carve 2-4 reachable small halls without breaking events or gates.");
