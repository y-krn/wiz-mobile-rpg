// balance-impact: combat, maps — round-trip prototype rule (#2066). Opt-in at departure; ordinary runs are untouched.
//
// State changes of the round-trip prototype: waking the dungeon, the hunter
// that follows from below, and the treasure. Movement and menus call in here;
// nothing in this module touches the DOM.
import { getBiomeForFloor } from "../data/biomes.js";
import { isTraversalObstacleBlocking } from "../rules/traversal_gimmicks.js";
import {
  HUNTER_COMBAT_SPEED,
  HUNTER_ENTRY_DELAY,
  HUNTER_FALL_BACK,
  HUNTER_MAX_CARRY,
  HUNTER_SPEED,
  ROUND_TRIP_BOTTOM_FLOOR,
  findHunterStep,
  findHunterStepAway,
  getHunterAlertLevel
} from "../rules/round_trip.js";

function getRoundTrip(stateLike) {
  return stateLike?.currentRun?.roundTrip || null;
}

function findCell(grid, type) {
  for (let y = 0; y < (grid?.length || 0); y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x]?.type === type) return { x, y };
    }
  }
  return null;
}

export function getHunterName(floor) {
  return getBiomeForFloor(floor).eliteName;
}

export function getFloorHunter(stateLike, floor = stateLike?.floor) {
  return (stateLike?.roamingMonsters || []).find(monster => monster.hunter && monster.floor === floor) || null;
}

/** True while the round-trip dungeon is awake and something still follows. */
export function isHunted(stateLike) {
  const roundTrip = getRoundTrip(stateLike);
  return Boolean(roundTrip?.awake && !roundTrip.hunterSlain);
}

/** The floor below the bottom is closed in a round-trip run. */
export function isRoundTripBottom(stateLike, floor = stateLike?.floor) {
  return Boolean(getRoundTrip(stateLike)) && floor >= ROUND_TRIP_BOTTOM_FLOOR;
}

/**
 * What the explore screen says about the hunt (#2069), or null when nothing
 * follows. `level` is the alert level of the distance (0 far, 1 near, 2 close).
 * - arriving: it has not stepped out yet; `actions` are left.
 * - shaken: the run fled it; it stands still for `actions` more.
 * - following: it is `distance` steps behind along open corridors.
 * - lost: it cannot reach the run from where it stands (stairs, a secret door).
 */
export function getHuntStatus(stateLike) {
  const roundTrip = getRoundTrip(stateLike);
  if (!roundTrip?.awake || roundTrip.hunterSlain) return null;
  const name = getHunterName(stateLike.floor);
  const hunter = getFloorHunter(stateLike);
  if (!hunter) {
    if (!roundTrip.hunterEntry) return null;
    return { phase: "arriving", name, actions: Math.max(1, roundTrip.hunterDelay), level: 0 };
  }
  const grid = stateLike.maps?.[stateLike.floor - 1];
  if (!grid) return null;
  const { distance } = findHunterStep(grid, hunter, { x: stateLike.x, y: stateLike.y }, isTraversalObstacleBlocking);
  if (hunter.fleeGraceTicks > 0) {
    return { phase: "shaken", name, actions: Math.ceil(hunter.fleeGraceTicks * 2), distance, level: 0 };
  }
  if (!Number.isFinite(distance)) return { phase: "lost", name, level: 0 };
  return { phase: "following", name, distance, level: getHunterAlertLevel(distance) };
}

/**
 * The hunter will step out of `entry` on `floor` after the entry delay. While
 * the dungeon is awake the floor's own roaming elite stands down: one threat,
 * always from behind.
 */
function scheduleHunter(stateLike, floor, entry) {
  const roundTrip = getRoundTrip(stateLike);
  if (!roundTrip?.awake) return;
  stateLike.roamingMonsters = (stateLike.roamingMonsters || [])
    .filter(monster => !monster.hunter && monster.floor !== floor);
  roundTrip.hunterCarry = 0;
  roundTrip.alert = 0;
  if (roundTrip.hunterSlain || !entry) {
    roundTrip.hunterEntry = null;
    roundTrip.hunterDelay = 0;
    return;
  }
  roundTrip.hunterEntry = { x: entry.x, y: entry.y };
  roundTrip.hunterDelay = HUNTER_ENTRY_DELAY;
}

/**
 * Wake the dungeon on the current floor. Returns true the first time.
 * The hunter comes up this floor's down stairs.
 */
export function wakeDungeon(stateLike) {
  const roundTrip = getRoundTrip(stateLike);
  if (!roundTrip || roundTrip.awake) return false;
  roundTrip.awake = true;
  scheduleHunter(stateLike, stateLike.floor, findCell(stateLike.maps?.[stateLike.floor - 1], "stairs-down"));
  return true;
}

/** The run arrived on `floor` at `entry` (the stairs it just used). */
export function arriveOnFloor(stateLike, floor, entry) {
  scheduleHunter(stateLike, floor, entry);
}

/** The guardian fell: the run now carries the treasure and the dungeon wakes. */
export function takeTreasure(stateLike) {
  const roundTrip = getRoundTrip(stateLike);
  if (!roundTrip || roundTrip.treasure) return false;
  roundTrip.treasure = true;
  wakeDungeon(stateLike);
  return true;
}

export function markHunterSlain(stateLike) {
  const roundTrip = getRoundTrip(stateLike);
  if (!roundTrip) return;
  roundTrip.hunterSlain = true;
  roundTrip.hunterEntry = null;
  roundTrip.hunterDelay = 0;
}

/**
 * The run fled from the hunter and shakes it off. The hunter must end up
 * behind the run, never between the run and the way out: it may have come
 * round from the front, and a corridor cannot be passed while it stands there.
 *
 * So the hunter is driven away from the up stairs along the corridors it can
 * walk, and the run holds its ground instead of being thrown a cell back
 * (`holdGround`). Only when the hunter has nowhere farther from the stairs to
 * go (a dead end) does the old rule apply: the run falls back to `retreat` and
 * the hunter toward the stairs it came from.
 */
export function shakeOffHunter(stateLike, hunter, retreat = null) {
  const grid = stateLike?.maps?.[hunter.floor - 1];
  if (!grid || !hunter.hunter) return { holdGround: false };
  const roundTrip = getRoundTrip(stateLike);
  if (roundTrip) {
    roundTrip.hunterCarry = 0;
    roundTrip.alert = 0;
  }

  const exit = findCell(grid, "stairs-up");
  let driven = 0;
  while (exit && driven < HUNTER_FALL_BACK) {
    const next = findHunterStepAway(grid, hunter, exit, isTraversalObstacleBlocking);
    if (!next) break;
    hunter.x = next.x;
    hunter.y = next.y;
    driven += 1;
  }
  if (driven > 0) return { holdGround: true };

  const home = { x: hunter.homeX, y: hunter.homeY };
  const onRetreat = () => Boolean(retreat) && hunter.x === retreat.x && hunter.y === retreat.y;
  let previous = { x: hunter.x, y: hunter.y };
  for (let fallen = 0; fallen < HUNTER_FALL_BACK || onRetreat(); fallen++) {
    const next = findHunterStep(grid, hunter, home, isTraversalObstacleBlocking);
    if (!next.step) break;
    previous = { x: hunter.x, y: hunter.y };
    hunter.x = next.step.x;
    hunter.y = next.step.y;
  }
  // Nowhere further to fall back to: do not end up on the run's own cell.
  if (onRetreat()) {
    hunter.x = previous.x;
    hunter.y = previous.y;
  }
  return { holdGround: false };
}

/**
 * A round of some other fight was fought: the hunter does not wait for it.
 * The ground it gains is walked on the run's next step, so a long fight can
 * end with the hunter already there.
 */
export function noteCombatRound(stateLike) {
  const roundTrip = getRoundTrip(stateLike);
  if (!roundTrip?.awake || roundTrip.hunterSlain) return;
  if (stateLike.combatState?.isRoamingFlack) return;
  const hunter = getFloorHunter(stateLike);
  if (!hunter || hunter.fleeGraceTicks > 0) return;
  roundTrip.hunterCarry = Math.min(HUNTER_MAX_CARRY, roundTrip.hunterCarry + HUNTER_COMBAT_SPEED);
}

/**
 * One player action passes. Returns the lines to log and whether the hunter
 * reached the player's cell (the caller starts the fight).
 */
export function tickHunter(stateLike) {
  // `moved` and `level` let the caller sound its footsteps (#2069).
  const result = { messages: [], contact: false, moved: false, level: 0 };
  const roundTrip = getRoundTrip(stateLike);
  if (!roundTrip?.awake || roundTrip.hunterSlain) return result;
  const floor = stateLike.floor;
  const grid = stateLike.maps?.[floor - 1];
  if (!grid) return result;
  const player = { x: stateLike.x, y: stateLike.y };
  const name = getHunterName(floor);
  let hunter = getFloorHunter(stateLike, floor);

  if (!hunter) {
    if (!roundTrip.hunterEntry) return result;
    if (roundTrip.hunterDelay > 0) roundTrip.hunterDelay -= 1;
    if (roundTrip.hunterDelay > 0) return result;
    const entry = roundTrip.hunterEntry;
    // It does not step out onto the run: it waits until the stairs are clear.
    if (entry.x === player.x && entry.y === player.y) return result;
    hunter = {
      id: `hunter:${floor}`,
      floor,
      x: entry.x,
      y: entry.y,
      homeX: entry.x,
      homeY: entry.y,
      name,
      kind: "elite",
      perception: "standard",
      spawnReason: "hunter",
      hunter: true,
      detected: true
    };
    stateLike.roamingMonsters ||= [];
    stateLike.roamingMonsters.push(hunter);
    roundTrip.hunterEntry = null;
    roundTrip.hunterCarry = 0;
    result.messages.push(`【気配】${name}が下の階から上がってきた。後を追ってくる…`);
    return result;
  }

  // After a flee the hunter loses the run for a while (the same grace an
  // ordinary elite gives, counted here in player actions).
  if (hunter.fleeGraceTicks > 0) {
    hunter.fleeGraceTicks = Math.max(0, hunter.fleeGraceTicks - 0.5);
    return result;
  }

  roundTrip.hunterCarry = Math.min(HUNTER_MAX_CARRY, roundTrip.hunterCarry + HUNTER_SPEED);
  let distance = Infinity;
  while (roundTrip.hunterCarry >= 1) {
    roundTrip.hunterCarry -= 1;
    const next = findHunterStep(grid, hunter, player, isTraversalObstacleBlocking);
    distance = next.distance;
    if (!next.step) break;
    hunter.x = next.step.x;
    hunter.y = next.step.y;
    result.moved = true;
    distance -= 1;
    if (hunter.x === player.x && hunter.y === player.y) {
      result.contact = true;
      roundTrip.hunterCarry = 0;
      break;
    }
  }
  if (!Number.isFinite(distance)) {
    distance = findHunterStep(grid, hunter, player, isTraversalObstacleBlocking).distance;
  }

  const level = result.contact ? roundTrip.alert : getHunterAlertLevel(distance);
  if (level > roundTrip.alert) {
    result.messages.push(level >= 2
      ? `【予兆】${name}がすぐ後ろに迫っている！`
      : `【気配】${name}の足音が近づいてくる。`);
  }
  roundTrip.alert = level;
  result.level = level;
  return result;
}
