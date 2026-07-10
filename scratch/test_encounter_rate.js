import assert from "assert";
import { state } from "../src/state.js";
import {
  getCurrentFloorExplorationSteps,
  getEncounterChance,
  recordExplorationSteps
} from "../src/movement.js";

const original = {
  floor: state.floor,
  currentRun: state.currentRun,
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

function resetRun(floorSteps, lightTurns = 0, lightPower = "") {
  state.floor = 2;
  state.currentRun = {
    steps: floorSteps,
    floorSteps: { 2: floorSteps }
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

state.floor = original.floor;
state.currentRun = original.currentRun;
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
