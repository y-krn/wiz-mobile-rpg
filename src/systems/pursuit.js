// A fled pack follows (#2114), but only the monsters that hunt (#2128). Escaping
// an ordinary fight leaves the slow and the mindless behind; the pursuers left
// standing keep their wounds and catch up after a few turns on the same floor.
// They chase once: escaping them again after they catch up makes them give up.
// Taking the stairs shakes them off. A guaranteed flee (from a hunter,
// mid-boss or boss) leaves no pack behind; those have their own rules.
import { MONSTER_PURSUERS } from "../data/monsters.js";

export const PURSUIT_TURNS = 6;

/** Whether this monster follows a party that fled from it. */
export function isPursuer(monster) {
  const name = String(monster?.name || "").replace(/\s[A-Z]$/, "");
  return MONSTER_PURSUERS.has(name);
}

/**
 * Remember the pursuers among the pack that was fled from on `floor`.
 * A pack that already caught up once (`caughtUp`) gives up instead. A pack
 * already following on this floor is kept, and new pursuers join it.
 * Returns the monsters that now follow, or [] when none do.
 */
export function recordFleePursuit(stateLike, monsters, floor = stateLike?.floor, { caughtUp = false } = {}) {
  const run = stateLike?.currentRun;
  if (!run || !Number.isInteger(floor)) return [];
  const following = getPursuit(stateLike);
  const pursuers = caughtUp
    ? []
    : (monsters || []).filter(monster => monster && monster.hp > 0 && !monster.fled && isPursuer(monster));
  if (pursuers.length === 0) return [];
  const clones = pursuers.map(monster => structuredClone(monster));
  if (following) {
    following.monsters.push(...clones);
    following.turns = Math.min(following.turns, PURSUIT_TURNS);
  } else {
    run.pursuit = { floor, turns: PURSUIT_TURNS, monsters: clones };
  }
  return clones;
}

/** The pack still following on this floor, or null. */
export function getPursuit(stateLike) {
  const pursuit = stateLike?.currentRun?.pursuit;
  if (!pursuit || pursuit.floor !== stateLike.floor || !Array.isArray(pursuit.monsters)) return null;
  return pursuit;
}

/** One turn passes on the floor. Returns true when the pack has caught up. */
export function tickPursuit(stateLike, count = 1) {
  const pursuit = getPursuit(stateLike);
  if (!pursuit) return false;
  pursuit.turns = Math.max(0, pursuit.turns - count);
  return pursuit.turns === 0;
}

export function isPursuitDue(stateLike) {
  const pursuit = getPursuit(stateLike);
  return Boolean(pursuit && pursuit.turns <= 0);
}

/** Hand over the pack that caught up and forget it. */
export function takePursuitMonsters(stateLike) {
  const pursuit = getPursuit(stateLike);
  if (!pursuit) return null;
  stateLike.currentRun.pursuit = null;
  return pursuit.monsters;
}

/** Leaving the floor loses the pack. Returns true when one was following. */
export function shakeOffPursuit(stateLike, floor = stateLike?.floor) {
  const pursuit = stateLike?.currentRun?.pursuit;
  if (!pursuit || pursuit.floor === floor) return false;
  stateLike.currentRun.pursuit = null;
  return true;
}
