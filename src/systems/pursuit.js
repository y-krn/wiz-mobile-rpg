// A fled pack follows (#2114). Escaping an ordinary fight only buys time: the
// monsters left standing keep their wounds and catch up after a few turns on
// the same floor. Taking the stairs shakes them off. A guaranteed flee (from a
// hunter, mid-boss or boss) leaves no pack behind; those have their own rules.

export const PURSUIT_TURNS = 6;
// A lookout that ran for help (#2115) brings a fresh pack this soon.
export const REINFORCEMENT_TURNS = 4;

/** Remember the pack that was fled from on `floor`. */
export function recordFleePursuit(stateLike, monsters, floor = stateLike?.floor) {
  const run = stateLike?.currentRun;
  if (!run || !Number.isInteger(floor)) return null;
  const standing = (monsters || []).filter(monster => monster && monster.hp > 0 && !monster.fled);
  if (standing.length === 0) {
    run.pursuit = null;
    return null;
  }
  run.pursuit = {
    floor,
    turns: PURSUIT_TURNS,
    monsters: standing.map(monster => structuredClone(monster))
  };
  return run.pursuit;
}

/**
 * A lookout ran for help: a fresh pack comes for the adventurer on this
 * floor. A pack already following keeps its place.
 */
export function callReinforcements(stateLike, floor = stateLike?.floor) {
  const run = stateLike?.currentRun;
  if (!run || !Number.isInteger(floor) || getPursuit(stateLike)) return null;
  run.pursuit = { floor, turns: REINFORCEMENT_TURNS, monsters: null, reinforcement: true };
  return run.pursuit;
}

/** The pack still following on this floor, or null. */
export function getPursuit(stateLike) {
  const pursuit = stateLike?.currentRun?.pursuit;
  if (!pursuit || pursuit.floor !== stateLike.floor) return null;
  if (!Array.isArray(pursuit.monsters) && !pursuit.reinforcement) return null;
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

/**
 * Hand over the pack that caught up and forget it: `{ monsters }` for a fled
 * pack, `{ monsters: null, reinforcement: true }` for one called by a lookout.
 */
export function takePursuitMonsters(stateLike) {
  const pursuit = getPursuit(stateLike);
  if (!pursuit) return null;
  stateLike.currentRun.pursuit = null;
  return { monsters: pursuit.monsters, reinforcement: Boolean(pursuit.reinforcement) };
}

/** Leaving the floor loses the pack. Returns true when one was following. */
export function shakeOffPursuit(stateLike, floor = stateLike?.floor) {
  const pursuit = stateLike?.currentRun?.pursuit;
  if (!pursuit || pursuit.floor === floor) return false;
  stateLike.currentRun.pursuit = null;
  return true;
}
