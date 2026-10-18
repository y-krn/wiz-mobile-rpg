// Noise on a dungeon floor (#2063). Noise has always drawn the roaming strong
// enemy (systems/elite_perception.js). The collapsed mine's rule makes it
// extreme: there noise lingers longer and brings ordinary monsters too, and a
// drawn-out fight makes noise of its own.
//
// Since #2144 the mine's noise stacks: a loud noise made while another still
// hangs on the floor raises the noise stage, and at the top stage the floor's
// roaming strong enemy walks straight at the party for a while. The stage
// falls back to nothing once the floor is quiet again.
import { getDungeonNoiseRule } from "../rules/dungeons.js";

const DEFAULT_NOISE_TURNS = 4;
export const NOISE_STAGE_MAX = 3;
// Turns the strong enemy walks straight at the party at the top stage. Noise
// made meanwhile starts the count again.
export const NOISE_HUNT_TURNS = 20;
// A fight breaking out only draws the strong enemy, and a thrown decoy is the
// player's own tool: neither raises the stage.
const UNSTACKED_SOURCES = new Set(["encounter", "decoy"]);

function stacks(event) {
  return event.ttl > 0 && !UNSTACKED_SOURCES.has(event.source);
}

function getAlarm(stateLike) {
  const alarm = stateLike?.currentRun?.noiseAlarm;
  return alarm && alarm.floor === stateLike.floor ? alarm : null;
}

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
  if (rule && stateLike.currentRun && !UNSTACKED_SOURCES.has(source)) raiseNoiseStage(stateLike);
  (stateLike.noiseEvents ||= []).push(event);
  return event;
}

function raiseNoiseStage(stateLike) {
  const floor = stateLike.floor;
  const lingering = (stateLike.noiseEvents || []).some(event => event.floor === floor && stacks(event));
  const alarm = getAlarm(stateLike) || { floor, stage: 0, announced: 0, huntTurns: 0 };
  alarm.stage = lingering ? Math.min(NOISE_STAGE_MAX, alarm.stage + 1) : Math.max(1, alarm.stage);
  if (alarm.stage >= NOISE_STAGE_MAX) alarm.huntTurns = NOISE_HUNT_TURNS;
  stateLike.currentRun.noiseAlarm = alarm;
}

/** The noise stage on the current floor for the HUD, or null off the mine. */
export function getNoiseStatus(stateLike) {
  if (!getDungeonNoiseRule(stateLike?.floor) || !stateLike.currentRun) return null;
  const alarm = getAlarm(stateLike);
  return { stage: alarm?.stage || 0, maxStage: NOISE_STAGE_MAX, huntTurns: alarm?.huntTurns || 0 };
}

/** Whether the floor's strong enemy is walking straight at the party now. */
export function isNoiseHunting(stateLike) {
  return (getAlarm(stateLike)?.huntTurns || 0) > 0;
}

/**
 * The log line for a stage the player has not been told about yet, or null.
 * Stage 1 needs none: the noise that made it already says so.
 */
export function takeNoiseStageMessage(stateLike) {
  const alarm = getAlarm(stateLike);
  if (!alarm || alarm.announced >= alarm.stage) return null;
  alarm.announced = alarm.stage;
  if (alarm.stage >= NOISE_STAGE_MAX) {
    return `【騒音】坑道じゅうに音が響いた！強敵がまっすぐこちらへ向かってくる（${NOISE_HUNT_TURNS}手番）。`;
  }
  if (alarm.stage === 2) return "【騒音】音が重なり、坑道がざわめいている（騒音2/3）。音が残るうちにもう一度立てれば、強敵が来る。";
  return null;
}

/**
 * One turn of the noise stage: the hunt counts down, and once no stacking
 * noise hangs on the floor the stage falls back to nothing. Returns a log
 * line when something the player should hear changed.
 */
export function tickNoiseStage(stateLike) {
  const alarm = getAlarm(stateLike);
  if (!alarm || alarm.stage === 0) return null;
  if (alarm.huntTurns > 0) {
    alarm.huntTurns -= 1;
    if (alarm.huntTurns > 0) return null;
  }
  const lingering = (stateLike.noiseEvents || []).some(event => event.floor === stateLike.floor && stacks(event));
  if (lingering && alarm.stage < NOISE_STAGE_MAX) return null;
  const was = alarm.stage;
  alarm.stage = 0;
  alarm.announced = 0;
  if (was >= NOISE_STAGE_MAX) return "坑道の音が静まり、強敵は追うのをやめた。";
  return was >= 2 ? "坑道の音が静まった。" : null;
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
