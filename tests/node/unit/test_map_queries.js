import assert from "node:assert/strict";
import * as facade from "../../../src/rules/map_queries.js";
import * as owner from "../../../src/rules/map_queries.ts";

assert.strictEqual(facade.findMapCellByType, owner.findMapCellByType);
const { findMapCellByType } = facade;

for (const grid of [null, undefined, false, 0, "", []]) {
  assert.equal(findMapCellByType(grid, "stairs-up"), null);
}

const singleMatch = [[{ type: "stairs-up" }]];
assert.deepEqual(findMapCellByType(singleMatch, "stairs-up"), { x: 0, y: 0 });

const multipleMatches = [
  [{ type: "other" }, { type: "stairs-up" }],
  [{ type: "stairs-up" }, { type: "stairs-up" }]
];
assert.deepEqual(findMapCellByType(multipleMatches, "stairs-up"), { x: 1, y: 0 });
assert.equal(findMapCellByType([[{ type: "other" }]], "stairs-up"), null);

const objectType = { value: "stairs-up" };
assert.equal(findMapCellByType([[{ type: objectType }]], { value: "stairs-up" }), null);
assert.deepEqual(findMapCellByType([[{ type: objectType }]], objectType), { x: 0, y: 0 });
for (const falseyType of [undefined, null, false, 0, ""]) {
  assert.deepEqual(findMapCellByType([[{ type: "other" }, { type: falseyType }]], falseyType), { x: 1, y: 0 });
}

const sparseRow = [];
sparseRow.length = 3;
sparseRow[2] = { type: "stairs-up" };
assert.deepEqual(findMapCellByType([sparseRow], "stairs-up"), { x: 2, y: 0 });

const cell = { type: "stairs-up", metadata: { retained: true } };
const grid = [[cell]];
const before = structuredClone(grid);
const result = findMapCellByType(grid, "stairs-up");
assert.deepEqual(grid, before);
assert.strictEqual(grid[0][0], cell);
assert.deepEqual(result, { x: 0, y: 0 });
assert.notStrictEqual(result, cell);
assert.notStrictEqual(findMapCellByType(grid, "stairs-up"), result);

console.log("[PASS] map query facade identity, scan order, strict matching, sparse cells, and immutability");
