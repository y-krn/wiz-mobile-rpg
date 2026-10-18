// The mine's rule (#2063): digging and drawn-out fights make noise, noise
// lingers there, and while it does ordinary monsters come too. Elsewhere noise
// only draws the roaming strong enemy, as before.
import { strict as assert } from "node:assert";
import { DUNGEONS } from "../../../src/data/dungeons.js";
import { getDungeonEntryFloor, getDungeonNoiseRule, getDungeonRule } from "../../../src/rules/dungeons.js";
import {
  NOISE_HUNT_TURNS, NOISE_STAGE_MAX, addNoise, applyNoiseToEncounterChance, getNoiseStatus, hasLoudNoise, isNoiseHunting, noteFightNoise,
  takeNoiseStageMessage, tickNoiseStage
} from "../../../src/systems/dungeon_noise.js";
import { calculateEncounterChance } from "../../../src/movement.js";

const mine = DUNGEONS.find(dungeon => dungeon.id === "collapsed_mine");
const catacomb = DUNGEONS.find(dungeon => dungeon.id === "forgotten_catacomb");
const mineFloor = getDungeonEntryFloor(mine.index) + 1;
const catacombFloor = getDungeonEntryFloor(catacomb.index) + 1;
const rule = getDungeonNoiseRule(mineFloor);

// One rule, in one line, on the mine only.
assert.equal(getDungeonRule(mineFloor)?.id, "noise");
assert.match(getDungeonRule(mineFloor).line, /^音：/);
assert.equal(getDungeonNoiseRule(catacombFloor), null);

// In the mine, noise from what the adventurer does lingers for the rule's
// turns; the noise of a fight breaking out keeps its old length.
{
  const state = { floor: mineFloor };
  assert.equal(addNoise(state, 1, 1, 4, { source: "dig" }).ttl, rule.noiseTurns);
  assert.equal(addNoise(state, 1, 1, 4, { source: "encounter" }).ttl, 4);
  const catacombState = { floor: catacombFloor };
  assert.equal(addNoise(catacombState, 1, 1, 4, { source: "dig" }).ttl, 4);
}

// Loud noise raises the mine's encounter chance to the rule's rate; the
// noise of a fight breaking out does not, and neither does noise elsewhere.
{
  const loudOn = floor => [{ floor, ttl: 3, source: "dig" }];
  const quiet = calculateEncounterChance(40, { floor: mineFloor, noiseEvents: [] });
  const loud = calculateEncounterChance(40, { floor: mineFloor, noiseEvents: loudOn(mineFloor) });
  const encounterOnly = calculateEncounterChance(40, { floor: mineFloor, noiseEvents: [{ floor: mineFloor, ttl: 3, source: "encounter" }] });
  const otherFloor = calculateEncounterChance(40, { floor: mineFloor, noiseEvents: loudOn(mineFloor + 1) });
  const catacombLoud = calculateEncounterChance(40, { floor: catacombFloor, noiseEvents: loudOn(catacombFloor) });
  assert.ok(quiet < rule.noiseEncounterChance);
  assert.equal(loud, rule.noiseEncounterChance);
  assert.equal(encounterOnly, quiet);
  assert.equal(otherFloor, quiet);
  assert.equal(catacombLoud, quiet);
  // Silence incense still quiets the floor afterwards.
  const incense = calculateEncounterChance(40, { floor: mineFloor, silenceTurns: 5, noiseEvents: loudOn(mineFloor) });
  assert.ok(incense < loud);
  // A higher rate (the first steps of a floor) is never lowered by noise.
  assert.equal(applyNoiseToEncounterChance(0.5, { floor: mineFloor, noiseEvents: loudOn(mineFloor) }), 0.5);
  assert.equal(hasLoudNoise([{ floor: mineFloor, ttl: 0, source: "dig" }], mineFloor), false);
}

// A fight that ran the rule's rounds leaves noise where it was fought; a short
// one does not, and nowhere but the mine does.
{
  const fight = (rounds, floor = mineFloor) => ({ floor, x: 3, y: 4, combatState: { roundNumber: rounds + 1 } });
  const long = fight(rule.longFightRounds);
  assert.equal(noteFightNoise(long), true);
  assert.deepEqual(long.noiseEvents, [{ floor: mineFloor, x: 3, y: 4, ttl: rule.noiseTurns, source: "fight" }]);
  const short = fight(rule.longFightRounds - 1);
  assert.equal(noteFightNoise(short), false);
  assert.equal(short.noiseEvents, undefined);
  assert.equal(noteFightNoise(fight(10, catacombFloor)), false);
}

// Noise stacks (#2144): every loud noise raises the stage by one; at the top
// the strong enemy hunts for NOISE_HUNT_TURNS, and every rule.noiseTurns of
// quiet lowers the stage by one.
{
  const state = { floor: mineFloor, currentRun: {} };
  const tick = () => {
    state.noiseEvents = (state.noiseEvents || []).map(event => ({ ...event, ttl: event.ttl - 1 })).filter(event => event.ttl > 0);
    return tickNoiseStage(state);
  };
  const waitQuiet = () => {
    while (state.noiseEvents?.length) assert.equal(tick(), null);
    const lines = [];
    for (let turn = 0; turn < rule.noiseTurns; turn++) lines.push(tick());
    return lines.filter(Boolean);
  };
  assert.deepEqual(getNoiseStatus(state), { stage: 0, maxStage: NOISE_STAGE_MAX, huntTurns: 0 });
  addNoise(state, 1, 1, 4, { source: "dig" });
  assert.equal(getNoiseStatus(state).stage, 1);
  assert.equal(takeNoiseStageMessage(state), null, "stage 1 needs no line of its own");
  // The noise of a fight breaking out and a thrown decoy never stack.
  addNoise(state, 1, 1, 4, { source: "encounter" });
  addNoise(state, 1, 1, 4, { source: "decoy" });
  assert.equal(getNoiseStatus(state).stage, 1);
  // Noise made after the first one has died away still stacks.
  while (state.noiseEvents.length) tick();
  addNoise(state, 1, 1, 4, { source: "fight" });
  assert.equal(getNoiseStatus(state).stage, 2);
  assert.match(takeNoiseStageMessage(state), /騒音2\/3/);
  assert.equal(takeNoiseStageMessage(state), null, "each stage is told once");
  // Quiet lowers it one stage at a time.
  assert.deepEqual(waitQuiet(), ["坑道の音が少し静まった（騒音1/3）。"]);
  assert.equal(getNoiseStatus(state).stage, 1);
  assert.deepEqual(waitQuiet(), []);
  assert.equal(getNoiseStatus(state).stage, 0);
  // Three in a row reach the top: the hunt runs on after the noise is gone.
  ["dig", "fight", "alarm"].forEach(source => addNoise(state, 1, 1, 4, { source }));
  assert.equal(getNoiseStatus(state).stage, NOISE_STAGE_MAX);
  assert.equal(isNoiseHunting(state), true);
  assert.match(takeNoiseStageMessage(state), /まっすぐこちらへ/);
  for (let turn = 0; turn < NOISE_HUNT_TURNS - 1; turn++) assert.equal(tick(), null);
  assert.equal(getNoiseStatus(state).huntTurns, 1);
  assert.match(tick(), /追うのをやめた/);
  assert.equal(isNoiseHunting(state), false);
  assert.equal(getNoiseStatus(state).stage, NOISE_STAGE_MAX - 1, "one more noise brings it back");
  addNoise(state, 1, 1, 4, { source: "dig" });
  assert.equal(isNoiseHunting(state), true);
  // Another floor keeps its own stage; elsewhere there is none.
  state.floor = mineFloor + 1;
  assert.equal(getNoiseStatus(state).stage, 0);
  assert.equal(getNoiseStatus({ floor: catacombFloor, currentRun: {} }), null);
}

console.log("[PASS] the mine's noise lingers, brings ordinary monsters, a long fight makes noise, and stacked noise sends the strong enemy");
