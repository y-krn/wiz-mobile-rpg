import assert from "node:assert/strict";

process.env.SIM_INDEPENDENT_RUN_RANDOM = "1";

const {
  advanceSimulationFloorRoute,
  createTabletMovementEvent,
  findShortestFloorPath,
  generateSharedRunFloor,
  getScenarioById,
  recordTabletExposure,
  simulateRun
} = await import("../../../scratch/simulations/sim_depth_material_ev.js");

const runSeed = "tablet-e1-seed-0";
const scenario = {
  ...getScenarioById("workshop-empty"),
  routePolicy: "partial_information_exploration",
  trapPolicy: "disabled",
  chestTrapPolicy: "disabled",
  fleePolicy: "never",
  personaPolicy: {
    exploration: { budgetMultiplier: 2.5, budgetExtraSteps: 10, afterStairsSteps: 4 }
  }
};
const runOptions = {
  className: "Fighter",
  startFloor: 1,
  targetDepth: 2,
  runIndex: 0,
  seriesId: "phase4j-e1-tablet-route",
  worldSeed: runSeed,
  scenario,
  workshop: scenario.workshop,
  encounterRateOverride: () => 0
};
const firstRun = simulateRun(runOptions);
const repeatedRun = simulateRun(runOptions);
assert.deepEqual(firstRun.tabletExposure, repeatedRun.tabletExposure,
  "same N=1 map and route reproduce tablet observations");

const generated = generateSharedRunFloor({ runSeed, floor: 1 });
const generatedTabletCount = generated.grid.flat()
  .filter(cell => cell?.event === "event_tablet").length;
assert.equal(firstRun.tabletExposure.generatedCount, generatedTabletCount,
  "placement count is independent of actual route exposure");
assert.equal(firstRun.tabletExposure.generatedCount, 2);
assert.equal(firstRun.tabletExposure.uniqueReachedLocationCount, 1);
assert.equal(firstRun.tabletExposure.revisitEntryCount, 0);
assert.equal(firstRun.tabletExposure.encounters.length, 1);
assert.equal(firstRun.tabletExposure.encounters[0].firstEntry, true);
assert.equal(firstRun.tabletExposure.encounters[0].selection, "leave");
assert.equal(firstRun.tabletExposure.encounters[0].consumed, false);
assert.equal(firstRun.tabletExposure.encounters[0].run.runSeed, runSeed);
assert.equal(firstRun.battles, 0, "tablet event never falls through to normal combat");
assert.equal(firstRun.normalCombatTelemetry.encounters, 0);

const tabletCoord = generated.grid.flatMap((row, y) => row.map((cell, x) =>
  cell?.event === "event_tablet" ? { x, y } : null
)).find(Boolean);
const start = generated.grid.flatMap((row, y) => row.map((cell, x) =>
  cell?.type === "stairs-up" ? { x, y } : null
)).find(Boolean);
const pathToTablet = findShortestFloorPath(generated.grid, start, tabletCoord);
assert.ok(pathToTablet?.length > 1, "fixture tablet has a traversable path from the entrance");

for (const partialInformation of [false, true]) {
  const movementMetrics = {
    trapRoute: { detourActive: false },
    exploredCells: 0,
    exploredCellsByFloor: {},
    stairsDiscoveryStepByFloor: {},
    bossDiscoveryStepByFloor: {}
  };
  const route = {
    current: { ...pathToTablet[0] },
    path: pathToTablet.map(coord => ({ ...coord })),
    nextMoveAt: 1,
    targets: [],
    targetIndex: 0,
    processedEventKeys: new Set(),
    partialInformation,
    knownCellKeys: new Set([`${pathToTablet[0].x},${pathToTablet[0].y}`]),
    discoveredStairs: null,
    postStairsExplorationRemaining: 0,
    floorComplete: false,
    personaPolicy: { exploration: { afterStairsSteps: 0 } }
  };
  const movementState = {
    x: route.current.x,
    y: route.current.y,
    simPolicy: { trapPolicy: "disabled" }
  };
  let entryEvent = null;
  let entryMove = null;
  for (let step = 1; step <= 100 && !entryEvent; step++) {
    const move = advanceSimulationFloorRoute(
      route, generated, movementState, 1, movementMetrics, step
    );
    if (move.event) {
      entryEvent = move.event;
      entryMove = move;
    }
  }
  assert.equal(entryEvent?.type, "event_tablet",
    "actual successful movement exposes the existing map event in both route modes");
  assert.deepEqual(entryEvent && { x: entryEvent.x, y: entryEvent.y }, tabletCoord);

  const observationMetrics = {
    uniqueReachedLocationCount: 0,
    revisitEntryCount: 0,
    encounters: [],
    _reachedLocationKeys: new Set()
  };
  const recordEntry = (step, event) => recordTabletExposure(observationMetrics, {
    seriesId: "phase4j-e1-tablet-route",
    runIndex: 0,
    runSeed,
    floor: 1,
    step,
    event
  });
  assert.equal(recordEntry(7, entryEvent).firstEntry, true);
  route.path = [tabletCoord, entryMove.previous];
  route.current = { ...tabletCoord };
  route.nextMoveAt = 8;
  const leaveMove = advanceSimulationFloorRoute(
    route, generated, movementState, 1, movementMetrics, 8
  );
  assert.equal(leaveMove.moved, true);
  assert.equal(leaveMove.event, null, "leaving the tablet cell has no event");
  route.path = [entryMove.previous, tabletCoord];
  route.current = { ...entryMove.previous };
  route.nextMoveAt = 9;
  const revisitMove = advanceSimulationFloorRoute(
    route, generated, movementState, 1, movementMetrics, 9
  );
  assert.equal(revisitMove.event?.type, "event_tablet");
  assert.equal(generated.grid[tabletCoord.y][tabletCoord.x].event, "event_tablet",
    "Leave does not consume the map event");
  assert.equal(recordEntry(9, revisitMove.event).firstEntry, false,
    "Leave preserves the cell and later movement is a revisit entry");
  assert.equal(observationMetrics.uniqueReachedLocationCount, 1);
  assert.equal(observationMetrics.revisitEntryCount, 1);
  assert.deepEqual(observationMetrics.encounters.map(entry => entry.step), [7, 9]);
}

assert.equal(createTabletMovementEvent({
  moved: false,
  enteredCell: generated.grid[tabletCoord.y][tabletCoord.x],
  ...tabletCoord
}), null, "floor-trap-interrupted movement does not expose the tablet");
assert.equal(createTabletMovementEvent({
  moved: true,
  enteredCell: { event: null },
  ...tabletCoord
}), null, "cell inspection without a tablet event does not expose one");
assert.ok(firstRun.tabletExposure.coverageGaps.some(gap => gap.includes("secret-room")),
  "unsupported secret-room traversal is explicit");

console.log("[PASS] Phase 4j-E1 N=1 tablet route exposure and classification");
