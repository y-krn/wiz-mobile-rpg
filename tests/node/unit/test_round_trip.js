// Round-trip prototype rule (#2066): pursuit, waking the dungeon, the
// treasure, and the saved state of a round-trip run.
import { strict as assert } from "node:assert";
import {
  HUNTER_COMBAT_SPEED,
  HUNTER_ENTRY_DELAY,
  HUNTER_FALL_BACK,
  HUNTER_MAX_CARRY,
  HUNTER_SPEED,
  ROUND_TRIP_BOTTOM_FLOOR,
  canChooseRoundTrip,
  findHunterStep,
  getHunterAlertLevel,
  isRoundTripRun,
  mapHunterReach
} from "../../../src/rules/round_trip.js";
import {
  createRunRoundTrip,
  isNormalizedRunRoundTrip,
  normalizeRunRoundTrip
} from "../../../src/state/run_round_trip.js";
import {
  arriveOnFloor,
  dropHunterBack,
  getFloorHunter,
  isHunted,
  isRoundTripBottom,
  markHunterSlain,
  noteCombatRound,
  takeTreasure,
  tickHunter,
  wakeDungeon
} from "../../../src/systems/round_trip.js";
import { normalizeLastPreparation } from "../../../src/state/last_preparation.js";
import { resolveLastPreparation } from "../../../src/systems/departure_preparation.js";
import { createDefaultCurrentRun } from "../../../src/state.js";
import { isNormalizedCurrentRun } from "../../../src/state/run_state.js";
import { progressEliteThreat } from "../../../src/systems/roaming_elites.js";

let failures = 0;
function check(label, test) {
  try {
    test();
    console.log(`[PASS] ${label}`);
  } catch (error) {
    failures++;
    console.error(`[FAIL] ${label}`);
    console.error(error);
  }
}

// A grid of open cells from rows of characters. "#" is solid rock; every other
// cell opens onto its open neighbours. "<" and ">" are the up and down stairs.
function makeGrid(rows) {
  const open = (x, y) => rows[y]?.[x] !== undefined && rows[y][x] !== "#";
  return rows.map((row, y) => [...row].map((char, x) => ({
    type: char === "<" ? "stairs-up" : char === ">" ? "stairs-down" : "empty",
    walls: [!open(x, y - 1), !open(x + 1, y), !open(x, y + 1), !open(x - 1, y)].map(wall => wall || char === "#"),
    blockEnter: [false, false, false, false],
    secretDoor: [false, false, false, false],
    secretFound: [false, false, false, false]
  })));
}

function makeState(rows, { floor = 2, x = 0, y = 0 } = {}) {
  const run = createDefaultCurrentRun();
  run.runSeed = "round-trip-unit";
  run.roundTrip = createRunRoundTrip();
  const maps = [];
  maps[floor - 1] = makeGrid(rows);
  return { currentRun: run, floor, x, y, maps, roamingMonsters: [] };
}

function pass(stateLike, actions) {
  const messages = [];
  let contact = false;
  for (let i = 0; i < actions; i++) {
    const result = tickHunter(stateLike);
    messages.push(...result.messages);
    contact ||= result.contact;
  }
  return { messages, contact };
}

check("the hunter follows open corridors around a wall", () => {
  const grid = makeGrid([
    "...",
    ".#.",
    "..."
  ]);
  // From the left of the rock to its right: the way leads round, not through.
  const first = findHunterStep(grid, { x: 0, y: 1 }, { x: 2, y: 1 });
  assert.equal(first.distance, 4);
  assert.notDeepEqual(first.step, { x: 1, y: 1 });
  assert.ok([0, 2].includes(first.step.y) && first.step.x === 0);
});

check("the hunter never steps onto stairs, and closes in on a player standing there", () => {
  const grid = makeGrid([">...<"]);
  const reach = mapHunterReach(grid, { x: 0, y: 0 });
  assert.equal(reach.has("4,0"), false, "the up stairs are out of its reach");
  const next = findHunterStep(grid, { x: 0, y: 0 }, { x: 4, y: 0 });
  assert.equal(next.distance, Infinity);
  assert.deepEqual(next.step, { x: 1, y: 0 });
  const beside = findHunterStep(grid, { x: 3, y: 0 }, { x: 4, y: 0 });
  assert.equal(beside.step, null, "next to the stairs it can only wait");
});

check("standing rubble and one-way steps stop the hunter; a found secret door is the run's alone", () => {
  const grid = makeGrid(["....."]);
  grid[0][2].obstacle = { kind: "rubble", state: "intact" };
  const blocked = findHunterStep(grid, { x: 0, y: 0 }, { x: 4, y: 0 }, cell => cell.obstacle?.state === "intact");
  assert.equal(blocked.distance, Infinity);
  assert.deepEqual(blocked.step, { x: 1, y: 0 });
  grid[0][2].obstacle.state = "cleared";
  assert.equal(findHunterStep(grid, { x: 0, y: 0 }, { x: 4, y: 0 }, cell => cell.obstacle?.state === "intact").distance, 4);

  const oneWay = makeGrid(["..."]);
  oneWay[0][1].blockEnter[3] = true; // cannot be entered from the west
  assert.equal(findHunterStep(oneWay, { x: 0, y: 0 }, { x: 2, y: 0 }).distance, Infinity);

  const secret = makeGrid([".#."]);
  secret[0][0].secretDoor[1] = true;
  secret[0][0].secretFound[1] = true;
  assert.equal(findHunterStep(secret, { x: 0, y: 0 }, { x: 2, y: 0 }).distance, Infinity);
});

check("alert levels follow the two announced distances", () => {
  assert.equal(getHunterAlertLevel(20), 0);
  assert.equal(getHunterAlertLevel(8), 1);
  assert.equal(getHunterAlertLevel(3), 2);
  assert.equal(getHunterAlertLevel(Infinity), 0);
});

check("the rule is offered only from the top, and only a round-trip run carries its state", () => {
  assert.equal(canChooseRoundTrip(1), true);
  assert.equal(canChooseRoundTrip(5), false);
  assert.equal(isRoundTripRun(createDefaultCurrentRun()), false);
  assert.equal(isRoundTripRun({ roundTrip: createRunRoundTrip() }), true);
  assert.equal(ROUND_TRIP_BOTTOM_FLOOR, 5);
});

check("an ordinary run is never hunted", () => {
  const stateLike = makeState([">....<"]);
  stateLike.currentRun.roundTrip = null;
  assert.equal(wakeDungeon(stateLike), false);
  assert.equal(takeTreasure(stateLike), false);
  assert.deepEqual(pass(stateLike, 20), { messages: [], contact: false });
  assert.equal(isHunted(stateLike), false);
  assert.equal(isRoundTripBottom({ currentRun: stateLike.currentRun, floor: 5 }), false);
});

check("waking the dungeon removes the floor's own elite and schedules the hunter at the down stairs", () => {
  const stateLike = makeState([">....<"], { x: 5 });
  stateLike.roamingMonsters = [
    { id: "elite:2", floor: 2, x: 3, y: 0, kind: "elite" },
    { id: "elite:3", floor: 3, x: 1, y: 0, kind: "elite" }
  ];
  assert.equal(wakeDungeon(stateLike), true);
  assert.equal(wakeDungeon(stateLike), false, "it wakes once");
  assert.deepEqual(stateLike.roamingMonsters.map(monster => monster.id), ["elite:3"]);
  assert.deepEqual(stateLike.currentRun.roundTrip.hunterEntry, { x: 0, y: 0 });
  assert.equal(stateLike.currentRun.roundTrip.hunterDelay, HUNTER_ENTRY_DELAY);
  assert.equal(isHunted(stateLike), true);
});

check("the hunter steps out after the delay, not onto the run, and then keeps pace", () => {
  const stateLike = makeState([">..............<"], { x: 0 });
  wakeDungeon(stateLike);
  // The run is still standing on the stairs: the hunter waits below.
  pass(stateLike, HUNTER_ENTRY_DELAY + 3);
  assert.equal(getFloorHunter(stateLike), null);
  stateLike.x = 10;
  const stepped = pass(stateLike, 1);
  const hunter = getFloorHunter(stateLike);
  assert.ok(hunter, "it steps out once the stairs are clear");
  assert.deepEqual({ x: hunter.x, y: hunter.y, kind: hunter.kind, floor: hunter.floor }, { x: 0, y: 0, kind: "elite", floor: 2 });
  assert.ok(stepped.messages.some(message => message.includes("下の階から上がってきた")));

  pass(stateLike, 4);
  assert.equal(hunter.x, Math.floor(4 * HUNTER_SPEED), "three cells in four actions");
});

check("the hunter announces itself as it closes in, and reaching the run is a contact", () => {
  const stateLike = makeState([">..............<"], { x: 14 });
  wakeDungeon(stateLike);
  const approach = pass(stateLike, HUNTER_ENTRY_DELAY + 30);
  assert.ok(approach.messages.some(message => message.includes("足音が近づいてくる")));
  assert.ok(approach.messages.some(message => message.includes("すぐ後ろに迫っている")));
  assert.equal(approach.contact, true);
  const hunter = getFloorHunter(stateLike);
  assert.deepEqual({ x: hunter.x, y: hunter.y }, { x: 14, y: 0 });
});

check("after a flee the hunter holds still, and a slain hunter never returns", () => {
  const stateLike = makeState([">..............<"], { x: 14 });
  wakeDungeon(stateLike);
  pass(stateLike, HUNTER_ENTRY_DELAY + 1);
  const hunter = getFloorHunter(stateLike);
  hunter.fleeGraceTicks = 6;
  pass(stateLike, 12);
  assert.equal(hunter.x, 0, "twelve actions of grace");
  pass(stateLike, 4);
  assert.ok(hunter.x > 0);

  stateLike.roamingMonsters = [];
  markHunterSlain(stateLike);
  arriveOnFloor(stateLike, 2, { x: 0, y: 0 });
  assert.equal(stateLike.currentRun.roundTrip.hunterEntry, null);
  assert.deepEqual(pass(stateLike, 30), { messages: [], contact: false });
  assert.equal(isHunted(stateLike), false);
});

check("a fight with something else lets the hunter gain ground, up to a limit", () => {
  const stateLike = makeState([">..............<"], { x: 14 });
  wakeDungeon(stateLike);
  noteCombatRound(stateLike);
  assert.equal(stateLike.currentRun.roundTrip.hunterCarry, 0, "nothing gains ground before the hunter is out");
  pass(stateLike, HUNTER_ENTRY_DELAY + 1);
  const hunter = getFloorHunter(stateLike);
  const roundTrip = stateLike.currentRun.roundTrip;
  const before = { x: hunter.x, carry: roundTrip.hunterCarry };
  stateLike.combatState = { isRoamingFlack: false };
  for (let round = 0; round < 6; round++) noteCombatRound(stateLike);
  assert.equal(roundTrip.hunterCarry, before.carry + 6 * HUNTER_COMBAT_SPEED);
  pass(stateLike, 1);
  assert.equal(
    hunter.x,
    before.x + Math.floor(before.carry + 6 * HUNTER_COMBAT_SPEED + HUNTER_SPEED),
    "the ground gained in the fight is walked at once"
  );

  // Fighting the hunter itself (or any roaming elite) gains it nothing.
  stateLike.combatState = { isRoamingFlack: true };
  const held = roundTrip.hunterCarry;
  noteCombatRound(stateLike);
  assert.equal(roundTrip.hunterCarry, held);

  stateLike.combatState = { isRoamingFlack: false };
  for (let round = 0; round < 100; round++) noteCombatRound(stateLike);
  assert.equal(roundTrip.hunterCarry, HUNTER_MAX_CARRY);
});

check("fleeing the hunter shakes it off behind the run, never onto the run's own cell", () => {
  const stateLike = makeState([">..............<"], { x: 9 });
  wakeDungeon(stateLike);
  pass(stateLike, HUNTER_ENTRY_DELAY + 1);
  const hunter = getFloorHunter(stateLike);
  // It caught the run at x=10; the flee throws the run back to x=9.
  hunter.x = 10;
  stateLike.currentRun.roundTrip.hunterCarry = 0.5;
  dropHunterBack(stateLike, hunter, { x: 9, y: 0 });
  assert.equal(hunter.x, 10 - HUNTER_FALL_BACK, "it falls back toward the stairs it came from");
  assert.ok(hunter.x < 9, "and is behind the run again");
  assert.equal(stateLike.currentRun.roundTrip.hunterCarry, 0);

  // Right beside its stairs there is nowhere to fall back to.
  hunter.x = 2;
  dropHunterBack(stateLike, hunter, { x: 1, y: 0 });
  assert.notDeepEqual({ x: hunter.x, y: hunter.y }, { x: 1, y: 0 });
});

check("arriving on another floor moves the hunt there", () => {
  const stateLike = makeState([">....<"], { x: 5 });
  stateLike.maps[0] = makeGrid([">......<"]);
  wakeDungeon(stateLike);
  stateLike.x = 3;
  pass(stateLike, HUNTER_ENTRY_DELAY + 2);
  assert.ok(getFloorHunter(stateLike, 2));
  stateLike.floor = 1;
  stateLike.x = 0;
  arriveOnFloor(stateLike, 1, { x: 0, y: 0 });
  assert.equal(stateLike.roamingMonsters.length, 0, "the old floor's hunter is gone");
  assert.deepEqual(stateLike.currentRun.roundTrip.hunterEntry, { x: 0, y: 0 });
  assert.equal(stateLike.currentRun.roundTrip.hunterDelay, HUNTER_ENTRY_DELAY);
});

check("the treasure is taken once and wakes the dungeon; the bottom floor is the end", () => {
  const stateLike = makeState([">....<"], { floor: 5, x: 5 });
  assert.equal(isRoundTripBottom(stateLike), true);
  assert.equal(takeTreasure(stateLike), true);
  assert.equal(takeTreasure(stateLike), false);
  assert.equal(stateLike.currentRun.roundTrip.treasure, true);
  assert.equal(stateLike.currentRun.roundTrip.awake, true);
  assert.equal(isRoundTripBottom({ ...stateLike, floor: 4 }), false);
});

check("a woken dungeon does not call a second elite for lingering", () => {
  const stateLike = makeState([">....<"], { floor: 3, x: 5 });
  stateLike.currentRun.eliteFloors = { 3: { greedScore: 999, warningStage: 0 } };
  wakeDungeon(stateLike);
  assert.deepEqual(progressEliteThreat(stateLike), { omens: [], spawned: null });
});

check("round-trip state normalizes, and saves from before the rule load as ordinary runs", () => {
  assert.equal(normalizeRunRoundTrip(undefined), null);
  assert.equal(normalizeRunRoundTrip(null), null);
  assert.equal(normalizeRunRoundTrip("yes"), null);
  assert.deepEqual(normalizeRunRoundTrip({}), createRunRoundTrip());
  assert.deepEqual(
    normalizeRunRoundTrip({ treasure: true, awake: true, hunterDelay: 4.9, hunterEntry: { x: 3, y: 7 }, hunterCarry: 0.5, hunterSlain: false, alert: 1 }),
    { treasure: true, awake: true, hunterDelay: 4, hunterEntry: { x: 3, y: 7 }, hunterCarry: 0.5, hunterSlain: false, alert: 1 }
  );
  // A delay without a place to step out of means nothing.
  assert.equal(normalizeRunRoundTrip({ hunterDelay: 5, hunterEntry: { x: -1, y: 0 } }).hunterDelay, 0);
  assert.equal(isNormalizedRunRoundTrip(null), true);
  assert.equal(isNormalizedRunRoundTrip(createRunRoundTrip()), true);
  assert.equal(isNormalizedRunRoundTrip({ treasure: "yes" }), false);

  const run = createDefaultCurrentRun();
  assert.equal(run.roundTrip, null);
  assert.equal(isNormalizedCurrentRun(run), true);
  run.roundTrip = createRunRoundTrip();
  assert.equal(isNormalizedCurrentRun(run), true);
  run.roundTrip = { treasure: 1 };
  assert.equal(isNormalizedCurrentRun(run), false);
});

check("the last preparation remembers the rule, only for a start at the top", () => {
  const base = { kitId: "vanguard", startingGear: null, recipeIds: [] };
  assert.equal(normalizeLastPreparation({ ...base, startFloor: 1 }).roundTrip, false);
  assert.equal(normalizeLastPreparation({ ...base, startFloor: 1, roundTrip: true }).roundTrip, true);
  const context = { workshop: { ranks: {} }, metaMaterials: {}, storage: {}, unlockedMilestones: [5], facilities: {} };
  assert.equal(resolveLastPreparation({ ...base, startFloor: 1, roundTrip: true }, context).roundTrip, true);
  assert.equal(resolveLastPreparation({ ...base, startFloor: 5, roundTrip: true }, context).roundTrip, false);
});

if (failures > 0) {
  console.error(`${failures} round-trip check(s) failed`);
  process.exit(1);
}
console.log("round-trip prototype checks passed");
