import assert from "node:assert/strict";
import { generateRunFloor } from "../../../src/run_map_generator.js";
import {
  FLOOR_ROLES,
  FLOOR_TRIALS,
  getBandClue,
  getBandIndexForFloor,
  getBandTrialForFloor,
  getFloorRole,
  getTrialAffinityWeight
} from "../../../src/rules/floor_trials.js";
import { getEncounterPoolForFloor, getEncounterWeightForFloor } from "../../../src/data/encounters.js";
import { MONSTERS } from "../../../src/data/monsters.js";
import { generateEncounter } from "../../../src/combat_ui/encounter.js";
import { createDefaultCurrentRun } from "../../../src/state/initial_state.js";
import { normalizeSavePayload } from "../../../src/state/save_migrations.js";

const seeds = ["ISSUE-1010-ALPHA", "ISSUE-1010-BETA", "ISSUE-1010-GAMMA"];

assert.equal(FLOOR_TRIALS.length, 6);
assert.deepEqual(FLOOR_ROLES.map(role => role.id), [
  "introduction", "development", "change", "temptation", "settlement"
]);

const pairs = new Set();
for (const runSeed of seeds) {
  let previousMain = null;
  for (let floor = 1; floor <= 30; floor++) {
    const trial = getBandTrialForFloor(runSeed, floor);
    assert.equal(trial.bandIndex, getBandIndexForFloor(floor));
    assert.notEqual(trial.mainId, trial.subId, `B${floor} must have two different trial themes`);
    assert.equal(getFloorRole(floor).id, FLOOR_ROLES[(floor - 1) % 5].id);
    const clue = getBandClue(trial, floor);
    assert.equal(clue, getBandClue(getBandTrialForFloor(runSeed, floor), floor));
    assert.equal(clue.includes(trial.main.label), false);
    assert.equal(clue.includes(trial.sub.label), false);
    pairs.add(`${trial.mainId}/${trial.subId}`);

    // Every band must remain a valid generated floor under several run seeds.
    const generated = generateRunFloor({ runSeed, floor });
    assert.equal(generated.validation.valid, true, `B${floor} failed generation`);
    if (floor % 5 === 0) previousMain = trial.mainId;
  }
  assert.notEqual(previousMain, null);
}
assert.ok(pairs.size > 1, "trial pair must vary between runs");

// Consecutive main themes are discouraged by a positive weight, never banned.
let sawConsecutiveMain = false;
for (let seedIndex = 0; seedIndex < 160; seedIndex++) {
  const runSeed = `ISSUE-1010-WEIGHT-${seedIndex}`;
  const first = getBandTrialForFloor(runSeed, 1);
  const second = getBandTrialForFloor(runSeed, 6);
  if (first.mainId === second.mainId) sawConsecutiveMain = true;
}
assert.equal(sawConsecutiveMain, true, "main-theme repetition must remain possible");

const runSeed = "ISSUE-1010-ENCOUNTER";
const trial = getBandTrialForFloor(runSeed, 7);
const basePool = getEncounterPoolForFloor(7);
const matching = basePool
  .map(name => MONSTERS.find(monster => monster.name === name))
  .find(monster => getTrialAffinityWeight(monster, trial) > 1);
const nonMatching = basePool
  .map(name => MONSTERS.find(monster => monster.name === name))
  .find(monster => getTrialAffinityWeight(monster, trial) === 1);
assert.ok(matching && nonMatching, "trial must classify existing enemy capabilities");
assert.ok(
  getEncounterWeightForFloor(matching.name, 7, { trial }) >
  getEncounterWeightForFloor(nonMatching.name, 7, { trial }),
  "trial must change encounter weights without removing enemies"
);
const trialPool = getEncounterPoolForFloor(7, { trial });
assert.ok(trialPool.includes(nonMatching.name), "non-matching enemies remain possible");

const guardian = generateEncounter({
  floor: 10,
  currentRun: { runSeed, trialBands: {} }
}, true, false, false, null, () => 0.5);
assert.deepEqual(guardian.monsters[0].trialThemeIds, [guardian.trial.mainId, guardian.trial.subId]);
assert.equal(guardian.monsters[0].trialDensity, "high");
assert.equal(guardian.floorRole, "settlement");

const currentRun = createDefaultCurrentRun();
currentRun.runSeed = runSeed;
currentRun.trialBands = { 1: { bandIndex: 1, mainId: trial.mainId, subId: trial.subId } };
const normalized = normalizeSavePayload({ floor: 7, currentRun });
assert.deepEqual(normalized.currentRun.trialBands, currentRun.trialBands);
assert.deepEqual(
  getBandTrialForFloor(runSeed, 7, normalized.currentRun.trialBands[1]),
  trial
);

console.log("[PASS] #1010 deterministic five-floor trials, role weights, guardian linkage, clues, and save stability verified.");
