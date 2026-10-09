// Noise on a dungeon floor (#2063). Noise has always drawn the roaming strong
// enemy (systems/elite_perception.js). The collapsed mine's rule makes it
// extreme: there noise lingers longer and brings ordinary monsters too, and a
// drawn-out fight makes noise of its own.
import { getDungeonNoiseRule } from "../rules/dungeons.js";

const DEFAULT_NOISE_TURNS = 4;

/**
 * Leave a noise at x, y on the current floor. `source` names what made it;
 * the noise of a fight breaking out ("encounter") only draws the strong enemy,
 * as before, so it is never counted as the mine's loud noise.
 */
export function addNoise(stateLike, x, y, ttl = DEFAULT_NOISE_TURNS, { source = "action" } = {}) {
  if (!stateLike) return null;
  const rule = getDungeonNoiseRule(stateLike.floor);
  const turns = rule && source !== "encounter" ? Math.max(ttl, rule.noiseTurns) : ttl;
  const event = { floor: stateLike.floor, x, y, ttl: turns, source };
  (stateLike.noiseEvents ||= []).push(event);
  return event;
}

/** Whether noise that brings monsters still hangs on `floor`. */
export function hasLoudNoise(noiseEvents, floor) {
  return (Array.isArray(noiseEvents) ? noiseEvents : [])
    .some(event => event.floor === floor && event.ttl > 0 && event.source !== "encounter");
}

/**
 * The mine's encounter chance while loud noise hangs on the floor: at least the
 * rule's rate. Light and silence incense still lower it afterwards.
 */
export function applyNoiseToEncounterChance(rate, { floor, noiseEvents } = {}) {
  const rule = getDungeonNoiseRule(floor);
  if (!rule || !hasLoudNoise(noiseEvents, floor)) return rate;
  return Math.max(rate, rule.noiseEncounterChance);
}

/**
 * A fight that ran long makes noise where it was fought. Call before the
 * combat state is cleared. Returns true when it made noise.
 */
export function noteFightNoise(stateLike) {
  const rule = getDungeonNoiseRule(stateLike?.floor);
  const roundsFought = Math.max(0, (stateLike?.combatState?.roundNumber || 1) - 1);
  if (!rule || roundsFought < rule.longFightRounds) return false;
  addNoise(stateLike, stateLike.x, stateLike.y, rule.noiseTurns, { source: "fight" });
  return true;
}
