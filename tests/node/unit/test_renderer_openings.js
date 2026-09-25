import assert from "assert";
import { getSideOpeningPosts } from "../../../src/rules/renderer_openings.js";
import { getVisibleCorridorTopology } from "../../../src/rules/renderer_topology.js";
import { getProjectionColumn, getProjectionPlanes, getProjectionProfile } from "../../../src/rules/renderer_projection.js";

const DIRECTIONS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const PROJECTION = getProjectionPlanes(undefined, getProjectionProfile(390, 560));

function makeGrid(paths) {
  const grid = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ({
    walls: [true, true, true, true],
    blockEnter: [false, false, false, false],
    type: "empty"
  })));
  paths.forEach(([x, y, dir]) => {
    const [dx, dy] = DIRECTIONS[dir];
    grid[y][x].walls[dir] = false;
    grid[y + dy][x + dx].walls[(dir + 2) % 4] = false;
  });
  return grid;
}

function postsFor(paths, dir = 0) {
  return getSideOpeningPosts(getVisibleCorridorTopology(makeGrid(paths), 4, 4, dir), PROJECTION)
    .map(({ side, z }) => `${side}@${z}`)
    .sort();
}

// Same six archetypes as the Pixi topology visual gate.
assert.deepEqual(postsFor([[4, 4, 2], [4, 4, 0], [4, 3, 0], [4, 2, 0]]), [], "straight corridor has no openings");
assert.deepEqual(postsFor([]), [], "dead end has no openings");
assert.deepEqual(postsFor([[4, 4, 2], [4, 4, 3], [3, 4, 3]]), ["left@0", "left@1"], "left turn frames the left opening");
assert.deepEqual(postsFor([[4, 4, 2], [4, 4, 1], [5, 4, 1]]), ["right@0", "right@1"], "right turn frames the right opening");
assert.deepEqual(postsFor([[4, 4, 2], [4, 4, 3], [4, 4, 1]]), ["left@0", "left@1", "right@0", "right@1"], "T junction frames both openings");
assert.deepEqual(
  postsFor([[4, 4, 2], [4, 4, 0], [4, 4, 3], [4, 4, 1], [4, 3, 0], [5, 4, 1], [3, 4, 3]]),
  ["left@0", "left@1", "right@0", "right@1"],
  "cross junction frames both openings"
);

// One step ahead: a side opening at z=1 is framed at the same strength.
const aheadPosts = getSideOpeningPosts(
  getVisibleCorridorTopology(makeGrid([[4, 4, 0], [4, 3, 3], [4, 3, 1]]), 4, 4, 0),
  PROJECTION
);
assert.deepEqual(aheadPosts.map(({ side, z }) => `${side}@${z}`).sort(), ["left@1", "left@2", "right@1", "right@2"]);
aheadPosts.forEach((post) => {
  const plane = getProjectionColumn(PROJECTION, post.z, 0);
  assert.equal(post.x, post.side === "left" ? plane.leftTop : plane.rightTop, `${post.side}@${post.z} sits on the corridor corner`);
  assert.equal(post.top, plane.top);
  assert.equal(post.bottom, plane.bottom);
  assert.ok(post.width >= 3, "posts keep a visible minimum width");
});
assert.deepEqual(aheadPosts.map(({ z }) => z), [...aheadPosts.map(({ z }) => z)].sort((a, b) => b - a), "posts draw far to near");

// Rotation invariance: facing east through the same kind of T junction.
assert.deepEqual(postsFor([[4, 4, 3], [4, 4, 0], [4, 4, 2]], 1), ["left@0", "left@1", "right@0", "right@1"]);

// No leak: a wall that movement treats as closed (walls or one-way entry)
// never produces an opening post, so hidden passages stay hidden.
const oneWay = makeGrid([[4, 4, 3]]);
oneWay[4][3].blockEnter[1] = true;
assert.deepEqual(getSideOpeningPosts(getVisibleCorridorTopology(oneWay, 4, 4, 0), PROJECTION), [], "one-way entry is not an opening");

// Room edges: where an open side continues into more open floor (depth 1)
// no wall turns the corner, so no post is drawn there.
const room = makeGrid([[4, 4, 3], [4, 4, 0], [4, 3, 3], [3, 4, 0]]);
assert.deepEqual(
  getSideOpeningPosts(getVisibleCorridorTopology(room, 4, 4, 0), PROJECTION).map(({ side, z }) => `${side}@${z}`).sort(),
  ["left@0", "left@2"],
  "posts appear only where a wall turns the corner"
);

assert.deepEqual(getSideOpeningPosts(null, PROJECTION), []);
assert.deepEqual(getSideOpeningPosts([{ valid: false, z: 0, column: 0 }], PROJECTION), []);

console.log("test_renderer_openings: ok");
