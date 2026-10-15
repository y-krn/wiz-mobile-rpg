import assert from "assert";
import { state } from "../../../src/state.js";
import { getOrdinaryHeft } from "../../../src/rules/dungeons.js";
import {
  getCurrentFloorExplorationSteps,
  getEncounterChance,
  recordExplorationSteps
} from "../../../src/movement.js";

const original = {
  floor: state.floor,
  currentRun: state.currentRun,
  inventory: state.inventory,
  party: state.party,
  lightTurns: state.lightTurns,
  lightPower: state.lightPower
};

const results = [];

function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error });
  }
}

// The first floor of a dungeon carries no ordinary-fight heft (#2115), so the
// base rates read as authored there.
function resetRun(floorSteps, lightTurns = 0, lightPower = "", floor = 1) {
  state.floor = floor;
  state.currentRun = {
    steps: floorSteps,
    floorSteps: { [floor]: floorSteps }
  };
  state.lightTurns = lightTurns;
  state.lightPower = lightPower;
}

function assertChance(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 0.000001, `${actual} !== ${expected}`);
}

test("encounter rate stays high through floor step 30", () => {
  resetRun(30);
  assert.equal(getCurrentFloorExplorationSteps(), 30);
  assertChance(getEncounterChance(), 0.10);
});

test("encounter rate decays after floor step 30", () => {
  resetRun(31);
  assertChance(getEncounterChance(), 0.04);
});

test("deeper floors of a dungeon meet fewer, heavier fights (#2115)", () => {
  resetRun(30, 0, "", 2);
  assertChance(getEncounterChance(), 0.10 * getOrdinaryHeft(2).encounters);
  resetRun(30, 0, "", 3);
  assertChance(getEncounterChance(), 0.10 * getOrdinaryHeft(3).encounters);
  assert.ok(getOrdinaryHeft(3).encounters < getOrdinaryHeft(2).encounters && getOrdinaryHeft(2).encounters < 1);
});

test("MILWA and LOMILWA reduce the active base rate", () => {
  resetRun(30, 10, "milwa");
  assertChance(getEncounterChance(), 0.07);
  resetRun(31, 10, "milwa");
  assertChance(getEncounterChance(), 0.01);
  resetRun(30, 10, "lomilwa");
  assertChance(getEncounterChance(), 0.05);
  resetRun(31, 10, "lomilwa");
  assertChance(getEncounterChance(), 0);
});

test("recordExplorationSteps updates total and current floor only", () => {
  state.floor = 3;
  state.currentRun = { steps: 4, floorSteps: { 2: 9, 3: 4 } };
  recordExplorationSteps(2);
  assert.equal(state.currentRun.steps, 6);
  assert.deepEqual(state.currentRun.floorSteps, { 2: 9, 3: 6 });
});

test("carried observation does not reveal every tag in a few steps", () => {
  const item = {
    kind: "equipment",
    identified: false,
    knowledgeStage: "discovery",
    tags: ["blade", "fire_rite", "curse", "iron", "ward"],
    hintTags: ["blade"],
    observedHintTags: []
  };
  state.floor = 1;
  state.currentRun = { steps: 0, floorSteps: { 1: 0 } };
  state.inventory = [item];
  state.party = [];

  recordExplorationSteps();
  assert.equal(item.knowledgeStage, "observation");
  assert.equal(item.observedHintTags.length, 2);

  recordExplorationSteps(6);
  assert.equal(item.observedHintTags.length, 2, "ordinary steps do not add more signs");

  recordExplorationSteps();
  assert.equal(item.observedHintTags.length, 3, "the low-frequency pulse adds one sign");
  assert.ok(item.observedHintTags.length < item.tags.length, "a few steps do not disclose every tag");
});

state.floor = original.floor;
state.currentRun = original.currentRun;
state.inventory = original.inventory;
state.party = original.party;
state.lightTurns = original.lightTurns;
state.lightPower = original.lightPower;

const failures = results.filter(result => !result.ok);
results.forEach(result => {
  console.log(`${result.ok ? "[PASS]" : "[FAIL]"} ${result.name}`);
  if (!result.ok) console.error(result.error);
});

if (failures.length > 0) {
  process.exit(1);
}
