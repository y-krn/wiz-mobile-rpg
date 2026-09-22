import assert from "node:assert/strict";
import * as perceptionFacade from "../../../src/systems/elite_perception.js";
import * as perceptionOwner from "../../../src/systems/elite_perception.ts";

for (const exportName of [
  "ELITE_PERCEPTIONS",
  "ELITE_PERCEPTION_HINTS",
  "getPerceptionIntent",
  "isInPlayerLineOfSight"
]) {
  assert.strictEqual(perceptionFacade[exportName], perceptionOwner[exportName],
    `elite perception facade preserves ${exportName} identity`);
}

assert.deepEqual(
  perceptionFacade.ELITE_PERCEPTIONS,
  ["sound", "blind_charge", "vibration", "standard", "afterimage"]
);
assert.deepEqual(
  Object.keys(perceptionFacade.ELITE_PERCEPTION_HINTS),
  ["sound", "blind_charge", "vibration", "standard", "afterimage"]
);
assert.deepEqual(perceptionFacade.ELITE_PERCEPTION_HINTS, {
  sound: "音に反応するようだ",
  blind_charge: "完全に盲目だが、音へ激しく突進する",
  vibration: "床の振動を捉え、静止した相手を見失う",
  standard: "距離で獲物を捉える",
  afterimage: "正面から見られている間は動けない"
});
assert.equal(Object.isFrozen(perceptionFacade.ELITE_PERCEPTIONS), false);
assert.equal(Object.isFrozen(perceptionFacade.ELITE_PERCEPTION_HINTS), false);

const openGrid = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => ({
  walls: [false, false, false, false]
})));
const player = { x: 3, y: 3, dir: 0, dx: [0, 1, 0, -1], dy: [-1, 0, 1, 0] };
const elite = (perception, x = 3, y = 1) => ({ perception, floor: 1, x, y });
const noise = { floor: 1, x: 1, y: 1, ttl: 3 };

const soundPlayerIntent = perceptionFacade.getPerceptionIntent({
  monster: elite("sound", 3, 2), player, noise: null, playerMoved: true, grid: openGrid
});
assert.equal(soundPlayerIntent.target, player);
assert.equal(soundPlayerIntent.detected, true);

const soundNoiseIntent = perceptionFacade.getPerceptionIntent({
  monster: elite("sound", 6, 6), player, noise, playerMoved: false, grid: openGrid
});
assert.equal(soundNoiseIntent.target, noise);
assert.equal(soundNoiseIntent.detected, true);

const blindChargeIntent = perceptionFacade.getPerceptionIntent({
  monster: elite("blind_charge", 6, 6), player, noise, playerMoved: false, grid: openGrid
});
assert.equal(blindChargeIntent.target, noise);
assert.equal(blindChargeIntent.speed, 2);

assert.equal(perceptionFacade.getPerceptionIntent({
  monster: elite("vibration", 3, 7), player, noise: null, playerMoved: true, grid: openGrid
}).target, player);
assert.equal(perceptionFacade.getPerceptionIntent({
  monster: elite("vibration", 3, 7), player, noise: null, playerMoved: false, grid: openGrid
}).detected, false);

for (const perception of [undefined, "unknown"]) {
  const intent = perceptionFacade.getPerceptionIntent({
    monster: elite(perception, 3, 5), player, noise: null, playerMoved: true, grid: openGrid
  });
  assert.equal(intent.target, player);
  assert.equal(intent.speed, 1);
  assert.equal(intent.detected, true);
}

assert.equal(perceptionFacade.isInPlayerLineOfSight(player, elite("afterimage"), openGrid), true);
const blockedGrid = openGrid.map(row => row.map(cell => ({ walls: [...cell.walls] })));
blockedGrid[3][3].walls[0] = true;
assert.equal(perceptionFacade.isInPlayerLineOfSight(player, elite("afterimage"), blockedGrid), false);
const watchedIntent = perceptionFacade.getPerceptionIntent({
  monster: elite("afterimage"), player, noise: null, playerMoved: true, grid: openGrid
});
assert.equal(watchedIntent.target, null);
assert.equal(watchedIntent.speed, 0);
const unseenIntent = perceptionFacade.getPerceptionIntent({
  monster: elite("afterimage", 4, 3), player, noise: null, playerMoved: true, grid: openGrid
});
assert.equal(unseenIntent.target, player);
assert.equal(unseenIntent.speed, 2);

assert.equal(perceptionFacade.getPerceptionIntent({
  monster: elite("standard", 3, 6), player, noise: null, playerMoved: true, grid: openGrid, rangeMultiplier: 0.5
}).detected, false);
assert.equal(perceptionFacade.getPerceptionIntent({
  monster: elite("standard", 4, 3), player, noise: null, playerMoved: true, grid: openGrid, rangeMultiplier: 0.1
}).detected, true);

console.log("[PASS] elite perception facade and boundary contract");
