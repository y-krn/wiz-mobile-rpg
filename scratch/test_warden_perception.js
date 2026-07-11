import assert from "node:assert/strict";
import { getPerceptionIntent, getWardenPerception, isInPlayerLineOfSight } from "../src/systems/warden_perception.js";
import { generateRandomMap } from "../src/map_generator.js";

const openGrid = Array.from({ length: 7 }, () => Array.from({ length: 7 }, () => ({ walls: [false, false, false, false] })));
const player = { x: 3, y: 3, dir: 0, dx: [0, 1, 0, -1], dy: [-1, 0, 1, 0] };
const monster = (perception, x = 3, y = 1) => ({ perception, floor: 1, x, y });

assert.deepEqual([1, 2, 3, 4, 5].map(getWardenPerception), ["sound", "blind_charge", "vibration", "standard", "afterimage"]);
assert.equal(getPerceptionIntent({ monster: monster("sound", 6, 6), player, noise: null, playerMoved: true, grid: openGrid }).detected, false);
assert.deepEqual(getPerceptionIntent({ monster: monster("sound", 6, 6), player, noise: { floor: 1, x: 1, y: 1, ttl: 3 }, playerMoved: false, grid: openGrid }).target, { floor: 1, x: 1, y: 1, ttl: 3 });
assert.equal(getPerceptionIntent({ monster: monster("blind_charge", 6, 6), player, noise: { floor: 1, x: 1, y: 1, ttl: 3 }, playerMoved: false, grid: openGrid }).speed, 2);
assert.equal(getPerceptionIntent({ monster: monster("vibration", 3, 7), player, noise: null, playerMoved: true, grid: openGrid }).detected, true);
assert.equal(getPerceptionIntent({ monster: monster("vibration", 3, 7), player, noise: null, playerMoved: false, grid: openGrid }).detected, false);
assert.equal(isInPlayerLineOfSight(player, monster("afterimage"), openGrid), true);
assert.equal(getPerceptionIntent({ monster: monster("afterimage"), player, noise: null, playerMoved: true, grid: openGrid }).speed, 0);
assert.equal(getPerceptionIntent({ monster: monster("afterimage", 4, 3), player, noise: null, playerMoved: true, grid: openGrid }).speed, 2);

let previousStairs = null;
for (let floor = 1; floor <= 5; floor++) {
  const map = generateRandomMap(floor, previousStairs, "TICKET-079");
  assert.ok(map.wardenGate, `B${floor}F must have a sealed warden gate`);
  previousStairs = map.stairsDownCoord;
}

console.log("[PASS] warden perception");
