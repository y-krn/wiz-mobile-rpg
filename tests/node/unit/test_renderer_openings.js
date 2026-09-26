import assert from "assert";
import { getSideOpeningPosts } from "../../../src/rules/renderer_openings.js";
import * as facade from "../../../src/rules/renderer_openings.js";
import * as owner from "../../../src/rules/renderer_openings.ts";
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

// Occlusion: the left column loops around to centre-lane cells behind the
// front wall at z=1. Their side openings sit behind that wall, so no post
// may be drawn over it.
const loopPaths = [
  [4, 4, 0], [4, 4, 3], [3, 4, 0], [3, 3, 0], [3, 2, 1],
  [4, 2, 0], [4, 2, 1], [4, 1, 3], [4, 1, 1]
];
const loopTopology = getVisibleCorridorTopology(makeGrid(loopPaths), 4, 4, 0);
assert.ok(loopTopology.some(({ z, column, valid }) => valid && column === 0 && z >= 2), "the loop reaches centre cells behind the wall");
assert.deepEqual(
  getSideOpeningPosts(loopTopology, PROJECTION).map(({ side, z }) => `${side}@${z}`).sort(),
  ["left@0", "left@1"],
  "centre cells behind the front wall produce no posts"
);

// A one-way front barrier occludes deeper posts the same way.
const oneWayLoop = makeGrid([...loopPaths, [4, 3, 0]]);
oneWayLoop[2][4].blockEnter[2] = true;
const oneWayTopology = getVisibleCorridorTopology(oneWayLoop, 4, 4, 0);
assert.ok(oneWayTopology.some(({ z, column, frontOneWayBarrier }) => z === 1 && column === 0 && frontOneWayBarrier));
assert.deepEqual(
  getSideOpeningPosts(oneWayTopology, PROJECTION).map(({ side, z }) => `${side}@${z}`).sort(),
  ["left@0", "left@1"],
  "centre cells behind a one-way front produce no posts"
);

assert.deepEqual(getSideOpeningPosts(null, PROJECTION), []);
assert.deepEqual(getSideOpeningPosts([{ valid: false, z: 0, column: 0 }], PROJECTION), []);
assert.deepEqual(getSideOpeningPosts({ 0: { valid: true, z: 0, column: 0 } }, PROJECTION), [], "non-array topology is ignored");

assert.deepEqual(Object.keys(facade), ["getSideOpeningPosts"], "facade keeps the existing runtime export surface");
assert.deepEqual(Object.keys(owner), ["getSideOpeningPosts"], "TS owner keeps the existing runtime export surface");
assert.equal(facade.getSideOpeningPosts, owner.getSideOpeningPosts, "facade and TS owner share function identity");

const duplicateTopology = [
  { valid: true, z: 0, column: 0, leftBlocked: false, rightBlocked: false, frontBlocked: true },
  { valid: true, z: 0, column: -1, backBlocked: true },
  { valid: true, z: 0, column: 1, backBlocked: true },
  { valid: true, z: 0, column: -1, backBlocked: true },
  { valid: true, z: 0, column: 0, leftBlocked: false, rightBlocked: false, frontBlocked: true }
];
const duplicatePosts = getSideOpeningPosts(duplicateTopology, PROJECTION);
assert.deepEqual(duplicatePosts.map(({ side, z }) => `${side}@${z}`), ["left@1", "right@1", "left@0", "right@0"], "duplicate keys keep one post per side in far-to-near order");
assert.ok(duplicatePosts.every(Object.isFrozen), "each post is frozen");
assert.equal(Object.isFrozen(duplicatePosts), false, "returned post array remains mutable");
assert.deepEqual(Object.keys(duplicatePosts[0]).sort(), ["bottom", "side", "top", "width", "x", "z"]);
assert.deepEqual(
  getSideOpeningPosts(duplicateTopology, { ...PROJECTION, xl: [0] }).map(({ side, z }) => `${side}@${z}`),
  ["left@0", "right@0"],
  "posts outside projection depth are skipped"
);

const sparseTopology = [];
sparseTopology[1] = duplicateTopology[0];
sparseTopology[3] = duplicateTopology[1];
sparseTopology[5] = duplicateTopology[2];
assert.deepEqual(
  getSideOpeningPosts(sparseTopology, PROJECTION).map(({ side, z }) => `${side}@${z}`),
  ["left@1", "right@1", "left@0", "right@0"],
  "sparse topology holes are skipped"
);

const replacedCentreTopology = [
  ...duplicateTopology,
  { valid: true, z: 0, column: 0, leftBlocked: true, rightBlocked: true, frontBlocked: true }
];
assert.deepEqual(getSideOpeningPosts(replacedCentreTopology, PROJECTION), [], "later duplicate cell replaces the earlier map value");

const getterError = new Error("opening topology getter");
assert.throws(
  () => getSideOpeningPosts([{ get valid() { throw getterError; } }], PROJECTION),
  error => error === getterError,
  "topology getter exceptions remain visible"
);
const proxyError = new Error("opening projection proxy");
const throwingProjection = new Proxy({}, { get() { throw proxyError; } });
assert.throws(
  () => getSideOpeningPosts([], throwingProjection),
  error => error === proxyError,
  "projection Proxy exceptions remain visible"
);

console.log("test_renderer_openings: ok");
