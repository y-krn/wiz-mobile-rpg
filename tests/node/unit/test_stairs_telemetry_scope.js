import assert from "node:assert/strict";
import { createDefaultCurrentRun, createStartingKitCharacter, state } from "../../../src/state.js";
import { applyStairsHeal } from "../../../src/movement.js";
import {
  __resetTelemetryForTests,
  __setTelemetryClientForTests,
  trackFloorExploration,
  trackStairsDiscovery,
  trackRunStart
} from "../../../src/telemetry.js";

const original = {
  floor: state.floor,
  party: state.party,
  currentRun: state.currentRun,
  x: state.x,
  y: state.y
};

try {
  const events = [];
  const character = createStartingKitCharacter("vanguard");
  state.floor = 2;
  state.x = 3;
  state.y = 4;
  state.party = [character];
  state.currentRun = {
    ...createDefaultCurrentRun(),
    startedAt: 100,
    steps: 18,
    floorSteps: { "1": 9, "2": 9 }
  };
  __setTelemetryClientForTests({ capture: (name, properties) => events.push({ name, properties }) });
  trackRunStart(state.currentRun, character, state);

  applyStairsHeal({ type: "stairs-down" });
  trackStairsDiscovery({
    state,
    floor: 2,
    stairsType: "stairs-down",
    stepsAtDiscovery: 1,
    stepsBeforeDiscovery: 1
  });
  state.currentRun.floorSteps["2"] = 12;
  trackFloorExploration({ state, floor: 2, stairsDiscovered: true, floorCompleted: true });

  const stairs = events.find(event => event.name === "stairs_discovered").properties;
  const exploration = events.find(event => event.name === "floor_exploration").properties;
  assert.equal(stairs.stepsAtDiscovery, 9, "stairs discovery must use floor-local steps on B2+");
  assert.equal(stairs.stepsBeforeDiscovery, 9, "stairs pre-discovery steps must use the same floor-local basis");
  assert.equal(exploration.stepsBeforeStairs, 9);
  assert.equal(exploration.stepsAfterStairs, 3);

  const duplicateExploration = { floor: "2" };
  for (const key of [
    "state", "character", "stepsBeforeStairs", "stepsAfterStairs", "stairsDiscovered",
    "floorCompleted", "chestsDiscovered", "chestsSkipped", "explorationMode"
  ]) {
    Object.defineProperty(duplicateExploration, key, {
      get() { throw new Error(`duplicate exploration evaluated ${key}`); }
    });
  }
  assert.doesNotThrow(() => trackFloorExploration(duplicateExploration));
  assert.equal(events.filter(event => event.name === "floor_exploration").length, 1);

  for (const [floor, explicitValue, discoverySteps] of [
    [3, false, 8],
    [4, 0, 9],
    [5, "", 10]
  ]) {
    state.currentRun.floorSteps[String(floor)] = discoverySteps + 5;
    trackStairsDiscovery({ state, floor, stairsType: "stairs-down", stepsAtDiscovery: discoverySteps });
    trackFloorExploration({
      state,
      floor,
      stepsBeforeStairs: explicitValue,
      stepsAfterStairs: explicitValue
    });
    const explicitExploration = events.filter(event => event.name === "floor_exploration").at(-1).properties;
    assert.equal(explicitExploration.stepsBeforeStairs, 0);
    assert.equal(explicitExploration.stepsAfterStairs, 0);
  }
  console.log("[PASS] B2+ stairs telemetry uses floor-local exploration steps");
} finally {
  __resetTelemetryForTests();
  state.floor = original.floor;
  state.party = original.party;
  state.currentRun = original.currentRun;
  state.x = original.x;
  state.y = original.y;
}
