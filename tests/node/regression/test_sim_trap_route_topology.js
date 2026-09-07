import assert from "node:assert/strict";

process.env.SIM_SKIP_PROVENANCE = "1";

const { findShortestFloorPath } =
  await import("../../simulations/sim_depth_material_ev.js");

function grid(width, height) {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => ({
    walls: [true, true, true, true],
    blockEnter: {},
    secretDoor: {},
    secretFound: {}
  })));
}

function connect(cells, left, right, direction, options = {}) {
  const opposite = (direction + 2) % 4;
  cells[left.y][left.x].walls[direction] = Boolean(options.secret);
  cells[right.y][right.x].walls[opposite] = Boolean(options.secret);
  if (options.oneWay) cells[left.y][left.x].blockEnter[direction] = true;
  if (options.secret) cells[left.y][left.x].secretDoor[direction] = true;
}

const corridor = grid(5, 1);
for (let x = 0; x < 4; x++) connect(corridor, { x, y: 0 }, { x: x + 1, y: 0 }, 1);
assert.equal(findShortestFloorPath(corridor, { x: 0, y: 0 }, { x: 4, y: 0 }).length, 5);

const loop = grid(3, 3);
connect(loop, { x: 0, y: 1 }, { x: 1, y: 1 }, 1);
connect(loop, { x: 1, y: 1 }, { x: 2, y: 1 }, 1);
connect(loop, { x: 2, y: 1 }, { x: 2, y: 2 }, 2);
connect(loop, { x: 2, y: 2 }, { x: 1, y: 2 }, 3);
connect(loop, { x: 1, y: 2 }, { x: 0, y: 2 }, 3);
connect(loop, { x: 0, y: 2 }, { x: 0, y: 1 }, 0);
assert.ok(findShortestFloorPath(loop, { x: 0, y: 1 }, { x: 2, y: 2 }));
assert.equal(
  findShortestFloorPath(loop, { x: 0, y: 1 }, { x: 2, y: 2 }, new Set(["1,1", "2,1", "0,2", "1,2"])),
  null,
  "multiple known blocked trap cells can make the alternate route unavailable"
);

const oneWay = grid(2, 1);
connect(oneWay, { x: 0, y: 0 }, { x: 1, y: 0 }, 1, { oneWay: true });
assert.ok(findShortestFloorPath(oneWay, { x: 0, y: 0 }, { x: 1, y: 0 }));
assert.equal(findShortestFloorPath(oneWay, { x: 1, y: 0 }, { x: 0, y: 0 }), null);

const hiddenDoor = grid(2, 1);
connect(hiddenDoor, { x: 0, y: 0 }, { x: 1, y: 0 }, 1, { secret: true });
assert.equal(
  findShortestFloorPath(hiddenDoor, { x: 0, y: 0 }, { x: 1, y: 0 }),
  null,
  "an undiscovered secret door must remain unavailable to route selection"
);
hiddenDoor[0][0].secretFound[1] = true;
hiddenDoor[0][1].secretFound[3] = true;
assert.ok(findShortestFloorPath(hiddenDoor, { x: 0, y: 0 }, { x: 1, y: 0 }));

console.log("[PASS] #933 route topology handles corridors, loops, multiple traps, one-way passages, and secret doors");
