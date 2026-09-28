import assert from "node:assert/strict";
import { EVENT_TYPES } from "../../../src/data.js";
import { FULL_MAP_LEGEND, drawFullMap, getFullMapModel } from "../../../src/ui/full_map.js";
import {
  clampFullMapView,
  getFullMapInitialView,
  zoomFullMapView
} from "../../../src/ui/full_map_overlay.js";

function makeCell(overrides = {}) {
  return { walls: [true, true, true, true], blockEnter: [false, false, false, false], type: "empty", ...overrides };
}

function makeInput(overrides = {}) {
  const size = 12;
  return {
    kind: "renderer-input",
    view: { hasMap: true },
    sceneVisibility: {},
    floor: 2,
    x: 1,
    y: 1,
    dir: 1,
    map: Array.from({ length: size }, () => Array.from({ length: size }, () => makeCell())),
    visitedMap: Array.from({ length: size }, () => Array(size).fill(false)),
    mapFragments: [],
    lightTurns: 0,
    lightPower: null,
    roamingMonsters: [],
    hasArcaneSense: false,
    ...overrides
  };
}

const kindsAt = (model, x, y) => model.markers.filter(marker => marker.x === x && marker.y === y).map(marker => marker.kind);

// Visited, fragment, and lit cells are classified; unknown cells are not drawn.
const input = makeInput({ mapFragments: ["6,6"] });
input.visitedMap[1][1] = true;
input.visitedMap[1][2] = true;
input.map[1][2].type = "stairs-up";
input.map[6][6].type = "stairs-down";
input.map[6][6].event = EVENT_TYPES.CHEST;
input.map[1][2].trap = { state: "disabled" };
input.map[9][9].trap = { state: "discovered" };
input.map[10][10].event = EVENT_TYPES.CHEST;
input.map[10][11].event = EVENT_TYPES.BOSS;
input.map[3][1].event = EVENT_TYPES.CAMP;
input.map[2][2].event = EVENT_TYPES.SPRING;
let model = getFullMapModel(input);
assert.equal(model.width, 12);
assert.equal(model.height, 12);
assert.deepEqual(model.player, { x: 1, y: 1, dir: 1 });
const reveal = Object.fromEntries(model.cells.map(({ x, y, reveal: kind }) => [`${x},${y}`, kind]));
assert.deepEqual(reveal, { "1,1": "visited", "2,1": "visited", "6,6": "fragment", "9,9": "fragment" });
assert.deepEqual(kindsAt(model, 2, 1), ["stairs-up", "trap-disabled"]);
assert.deepEqual(kindsAt(model, 6, 6), ["stairs-down", "chest"]);
assert.deepEqual(kindsAt(model, 9, 9), ["trap"]);
// A chest or spring is shown only on a revealed cell; facilities within the
// minimap's sense radius are shown even before they are seen; far bosses are not.
assert.deepEqual(kindsAt(model, 10, 10), []);
assert.deepEqual(kindsAt(model, 2, 2), []);
assert.deepEqual(kindsAt(model, 1, 3), ["camp"]);
assert.deepEqual(kindsAt(model, 11, 10), []);
assert.deepEqual(model.bounds, { minX: 1, minY: 1, maxX: 9, maxY: 9 });

// Light reveals nearby cells as their own style.
model = getFullMapModel(makeInput({ lightTurns: 5 }));
assert.equal(model.cells.find(cell => cell.x === 4 && cell.y === 1).reveal, "light");
assert.equal(model.cells.some(cell => cell.x === 5 && cell.y === 1), false);

// Elites stay floor-wide (#1814); ordinary monsters only near; afterimages need arcane sense.
const monsters = [
  { floor: 2, x: 11, y: 11, kind: "elite", perception: "standard" },
  { floor: 2, x: 10, y: 0, kind: "normal", perception: "standard" },
  { floor: 2, x: 2, y: 2, kind: "normal", perception: "sound" },
  { floor: 3, x: 1, y: 2, kind: "elite", perception: "standard" },
  { floor: 2, x: 0, y: 11, kind: "elite", perception: "afterimage" }
];
model = getFullMapModel(makeInput({ roamingMonsters: monsters }));
assert.deepEqual(model.markers.map(({ kind, x, y }) => `${kind}@${x},${y}`), ["elite@11,11", "monster@2,2"]);
model = getFullMapModel(makeInput({ roamingMonsters: monsters, hasArcaneSense: true }));
assert.equal(model.markers.some(({ kind, x, y }) => kind === "elite" && x === 0 && y === 11), true);

// Unusable maps produce no model.
assert.equal(getFullMapModel(makeInput({ map: [] })), null);
assert.equal(getFullMapModel(makeInput({ map: [[makeCell()], null] })), null);

// Every drawn marker kind has a legend row.
const legendKinds = new Set(FULL_MAP_LEGEND.map(({ kind }) => kind));
for (const kind of ["player", "visited", "unvisited", "unvisited-light", "stairs-down", "stairs-up", "trap", "trap-disabled",
  "chest", "spring", "camp", "merchant", "portal", "boss", "elite", "monster"]) {
  assert.equal(legendKinds.has(kind), true, kind);
}

// Drawing tolerates a recording context and touches every revealed cell.
const recorded = [];
const ctx = new Proxy({}, {
  get: (target, name) => (name in target ? target[name] : (...args) => recorded.push([name, args])),
  set: (target, name, value) => { target[name] = value; return true; }
});
drawFullMap(ctx, getFullMapModel(input), { cellSize: 20, padding: 10 });
assert.equal(recorded.filter(([name, args]) => name === "fillRect" && args[2] === 20 && args[3] === 20).length, 4);
assert.equal(recorded.some(([name, args]) => name === "fillText" && args[0] === "野"), true);

// View math: fit the known area, clamp zoom, keep content reachable.
const viewport = { width: 360, height: 480 };
const wide = { ...getFullMapModel(makeInput({ map: Array.from({ length: 30 }, () => Array.from({ length: 30 }, () => makeCell())) })) };
const initial = getFullMapInitialView({ ...wide, bounds: { minX: 1, minY: 1, maxX: 1, maxY: 1 } }, viewport);
assert.equal(initial.contentSize.width, 30 * 24 + 24);
assert.ok(Math.abs(initial.limits.min - 360 / 744) < 1e-9);
assert.equal(initial.limits.max, 64 / 24);
assert.equal(initial.view.scale, 2);
assert.ok(initial.view.x <= 0 && initial.view.y <= 0);
const fitAll = getFullMapInitialView({ ...wide, bounds: { minX: 0, minY: 0, maxX: 29, maxY: 29 } }, viewport);
assert.equal(fitAll.view.scale, fitAll.limits.min);
// Content narrower than the viewport is centred on that axis.
assert.ok(Math.abs(fitAll.view.x) < 1e-9);
assert.ok(Math.abs(fitAll.view.y - (480 - 744 * fitAll.view.scale) / 2) < 1e-9);

const limits = { min: 0.5, max: 2 };
const content = { width: 1000, height: 1000 };
assert.deepEqual(clampFullMapView({ scale: 5, x: 100, y: -5000 }, content, viewport, limits), { scale: 2, x: 0, y: 480 - 2000 });
const zoomed = zoomFullMapView({ scale: 1, x: -100, y: -100 }, 1.5, { x: 180, y: 240 }, content, viewport, limits);
assert.equal(zoomed.scale, 1.5);
// The anchor stays over the same content point.
assert.ok(Math.abs((180 - zoomed.x) / zoomed.scale - (180 + 100)) < 1e-9);
assert.ok(Math.abs((240 - zoomed.y) / zoomed.scale - (240 + 100)) < 1e-9);
assert.equal(zoomFullMapView({ scale: 0.5, x: 0, y: 0 }, 0.1, { x: 0, y: 0 }, content, viewport, limits).scale, 0.5);

console.log("test_full_map: ok");
