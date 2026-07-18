import { MAP_HEIGHT, MAP_WIDTH } from "../constants/map.js";

export const FLOOR_TEMPLATES = Object.freeze([
  Object.freeze({
    id: "shallow",
    minDepth: 1,
    maxDepth: 10,
    size: Object.freeze({ width: 18, height: 18 }),
    roomCountRange: Object.freeze([2, 3]),
    mazeProfile: Object.freeze({
      straightBias: Object.freeze([0.35, 0.60]),
      loopRate: Object.freeze([0.18, 0.32])
    }),
    gimmickDensity: Object.freeze({
      oneWayPassages: 1,
      secretDoors: Object.freeze({ shortcut: 1, room: 1 }),
      traps: 5
    }),
    criticalPathRange: Object.freeze([20, 30])
  }),
  Object.freeze({
    id: "middle",
    minDepth: 11,
    maxDepth: 20,
    size: Object.freeze({ width: 21, height: 21 }),
    roomCountRange: Object.freeze([3, 4]),
    mazeProfile: Object.freeze({
      straightBias: Object.freeze([0.20, 0.50]),
      loopRate: Object.freeze([0.14, 0.28])
    }),
    gimmickDensity: Object.freeze({
      oneWayPassages: 2,
      secretDoors: Object.freeze({ shortcut: 2, room: 1 }),
      traps: 7
    }),
    criticalPathRange: Object.freeze([20, 30])
  }),
  Object.freeze({
    id: "deep",
    minDepth: 21,
    maxDepth: Infinity,
    size: Object.freeze({ width: MAP_WIDTH, height: MAP_HEIGHT }),
    roomCountRange: Object.freeze([4, 5]),
    mazeProfile: Object.freeze({
      straightBias: Object.freeze([0.10, 0.40]),
      loopRate: Object.freeze([0.10, 0.24])
    }),
    gimmickDensity: Object.freeze({
      oneWayPassages: 3,
      secretDoors: Object.freeze({ shortcut: 2, room: 2 }),
      traps: 9
    }),
    criticalPathRange: Object.freeze([20, 30])
  })
]);

export function getFloorTemplate(depth) {
  if (!Number.isInteger(depth) || depth < 1) {
    throw new TypeError(`depth must be a positive integer: ${depth}`);
  }

  return FLOOR_TEMPLATES.find(template =>
    depth >= template.minDepth && depth <= template.maxDepth
  ) || FLOOR_TEMPLATES[FLOOR_TEMPLATES.length - 1];
}
