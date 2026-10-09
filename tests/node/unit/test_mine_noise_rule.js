// The mine's rule (#2063): digging and drawn-out fights make noise, noise
// lingers there, and while it does ordinary monsters come too. Elsewhere noise
// only draws the roaming strong enemy, as before.
import { strict as assert } from "node:assert";
import { DUNGEONS } from "../../../src/data/dungeons.js";
import { getDungeonEntryFloor, getDungeonNoiseRule, getDungeonRule } from "../../../src/rules/dungeons.js";
import { addNoise, applyNoiseToEncounterChance, hasLoudNoise, noteFightNoise } from "../../../src/systems/dungeon_noise.js";
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

console.log("[PASS] the mine's noise lingers, brings ordinary monsters, and a long fight makes noise");
