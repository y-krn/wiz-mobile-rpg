import assert from "node:assert/strict";

const facade = await import("../../../src/rules/map_movement.js");
const owner = await import("../../../src/rules/map_movement.ts");
const { DX, DY } = await import("../../../src/constants/directions.js");
const { isMapDirectionBlocked } = facade;

assert.equal(facade.isMapDirectionBlocked, owner.isMapDirectionBlocked, "JS facade preserves owner function identity");

function makeCell(walls = [false, false, false, false], blockEnter = [false, false, false, false]) {
  return { walls, blockEnter, type: "floor" };
}

function makeMap() {
  return Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => makeCell()));
}

for (let dir = 0; dir < 4; dir += 1) {
  const map = makeMap();
  const x = 2;
  const y = 2;
  const nextX = x + DX[dir];
  const nextY = y + DY[dir];
  assert.equal(isMapDirectionBlocked(map, x, y, dir), false, `direction ${dir} remains open`);

  map[y][x].walls[dir] = true;
  assert.equal(isMapDirectionBlocked(map, x, y, dir), true, `direction ${dir} source wall blocks`);
  map[y][x].walls[dir] = false;

  map[nextY][nextX].blockEnter[(dir + 2) % 4] = true;
  assert.equal(isMapDirectionBlocked(map, x, y, dir), true, `direction ${dir} destination entry block blocks`);
}

const sourceEntryOnly = makeMap();
sourceEntryOnly[2][2].blockEnter[0] = true;
assert.equal(isMapDirectionBlocked(sourceEntryOnly, 2, 2, 0), false, "source blockEnter is ignored");

const destinationWallOnly = makeMap();
destinationWallOnly[1][2].walls[2] = true;
assert.equal(isMapDirectionBlocked(destinationWallOnly, 2, 2, 0), false, "destination opposite wall remains ignored");

assert.equal(isMapDirectionBlocked(undefined, 0, 0, 0), true, "missing map is closed");
assert.equal(isMapDirectionBlocked([], 0, 0, 0), true, "missing source row is closed");
assert.equal(isMapDirectionBlocked([[makeCell()]], 1, 0, 0), true, "missing source cell is closed");
assert.equal(isMapDirectionBlocked([[makeCell()]], 0, 0, 0), true, "missing destination is closed");

const malformedProperties = [
  ["missing walls", cell => { delete cell.walls; }],
  ["short walls", cell => { cell.walls = [false, false, false]; }],
  ["long walls", cell => { cell.walls = [false, false, false, false, false]; }],
  ["non-boolean wall", cell => { cell.walls[0] = 0; }],
  ["missing blockEnter", cell => { delete cell.blockEnter; }],
  ["short blockEnter", cell => { cell.blockEnter = [false, false, false]; }],
  ["long blockEnter", cell => { cell.blockEnter = [false, false, false, false, false]; }],
  ["non-boolean blockEnter", cell => { cell.blockEnter[0] = 1; }],
];

for (const [name, corrupt] of malformedProperties) {
  const sourceMap = makeMap();
  corrupt(sourceMap[2][2]);
  assert.equal(isMapDirectionBlocked(sourceMap, 2, 2, 0), true, `malformed source ${name} is closed`);

  const destinationMap = makeMap();
  corrupt(destinationMap[1][2]);
  assert.equal(isMapDirectionBlocked(destinationMap, 2, 2, 0), true, `malformed destination ${name} is closed`);
}

const shortCircuitSource = makeCell();
shortCircuitSource.walls[0] = true;
let destinationReads = 0;
const shortCircuitMap = new Proxy({ 0: { 0: shortCircuitSource } }, {
  get(target, property, receiver) {
    if (property === "-1") destinationReads += 1;
    return Reflect.get(target, property, receiver);
  },
});
assert.equal(isMapDirectionBlocked(shortCircuitMap, 0, 0, 0), true);
assert.equal(destinationReads, 0, "source wall short-circuits destination access");

assert.equal(isMapDirectionBlocked(makeMap(), 2, 2, 4), true, "out-of-range direction remains closed");
assert.equal(isMapDirectionBlocked(makeMap(), 2, 2, "0"), false, "numeric-string direction keeps legacy property semantics");

const sparseArraysMap = makeMap();
sparseArraysMap[2][2].walls = Array(4);
sparseArraysMap[1][2].blockEnter = Array(4);
assert.equal(isMapDirectionBlocked(sparseArraysMap, 2, 2, 0), false, "sparse arrays retain Array.every legacy behavior");

const unchangedMap = makeMap();
const before = JSON.stringify(unchangedMap);
isMapDirectionBlocked(unchangedMap, 2, 2, 0);
assert.equal(JSON.stringify(unchangedMap), before, "movement query does not mutate its input");

console.log("[PASS] TypeScript map-movement owner preserves legacy movement semantics");
