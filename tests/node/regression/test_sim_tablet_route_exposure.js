import assert from "node:assert/strict";

process.env.SIM_INDEPENDENT_RUN_RANDOM = "1";

const {
  advanceSimulationFloorRoute,
  createTabletMovementEvent,
  findShortestFloorPath,
  generateSharedRunFloor,
  getScenarioById,
  recordTabletExposure,
  resolveSimulationTabletEncounter,
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

const readScenario = {
  ...scenario,
  tabletPolicy: "read-first-reached",
  simDiagnosticLevel: "full"
};
for (const floor of [1, 20]) {
  const seed = `tablet-e2-${floor}-${floor === 1 ? 0 : 2}`;
  for (const candidate of ["current", "fixed-c"]) {
    const result = simulateRun({
      ...runOptions,
      startFloor: floor,
      targetDepth: floor + 1,
      worldSeed: seed,
      seriesId: "phase4j-e2-read-first-reached",
      scenario: { ...readScenario, tabletOutcomeCandidate: candidate }
    });
    assert.equal(result.tabletExposure.policy, "read-first-reached");
    assert.equal(result.tabletExposure.outcomeCandidate, candidate);
    assert.equal(result.tabletExposure.readCount, 1,
      `${candidate} B${floor} partial-information N=1 reaches and Reads a tablet`);
    const read = result.tabletExposure.encounters.find(entry => entry.selection === "read");
    assert.ok(read?.consumed, `${candidate} B${floor} Read consumes its reached cell`);
    assert.ok(["success", "trap", "miss"].includes(read.outcome));
    assert.equal(read.combatLedgerBefore, read.combatLedgerAfter);
    assert.equal(read.stateBefore.length, read.stateAfter.length);
    assert.ok(read.stateBefore.every((character, index) =>
      character.level === read.stateAfter[index].level), "Read performs no immediate Level check");
    if (read.outcome === "success") assert.ok(read.expGained > 0);
    if (read.outcome === "trap") assert.ok(read.damage > 0);
    if (read.outcome === "miss") assert.equal(read.expGained, 0);
    assert.equal(read.rngBoundary.after - read.rngBoundary.before,
      0x6D2B79F5 * read.rngCalls);
    assert.equal(result.tabletCombatLedgerDelta, 0,
      "tablet EXP leaves the combat-only ledger unchanged");
    assert.equal(result.expGainedBySource.tablet, result.tabletExposure.expGained);
    assert.equal(result.expGainedBySource.combat, result.expGained);
    assert.equal(result.characterExpGained,
      result.expGainedBySource.combat + result.expGainedBySource.tablet,
      "character EXP delta equals source-attributed run EXP");
    assert.equal(result.tabletExposure.encounters.filter(entry => entry.selection === "read").length, 1);
    assert.ok(result.tabletExposure.encounters.filter(entry => entry.selection !== "read")
      .every(entry => entry.selection === "leave"), "every later reached tablet is Leave");
  }
}

const noReachedTablet = simulateRun({
  ...runOptions,
  worldSeed: "e2-1-false-current",
  seriesId: "phase4j-e2-no-tablet-reached",
  scenario: { ...readScenario, routePolicy: "omniscient_shortest_route" }
});
assert.ok(noReachedTablet.tabletExposure.generatedCount > 0);
assert.equal(noReachedTablet.tabletExposure.readCount, 0,
  "generated but unreached tablets do not trigger a Read");
assert.equal(noReachedTablet.tabletExposure.encounters.length, 0);

const trapDeath = simulateRun({
  ...runOptions,
  startFloor: 20,
  targetDepth: 21,
  worldSeed: "tablet-e2-death-4",
  seriesId: "phase4j-e2-tablet-trap-death",
  scenario: { ...readScenario, tabletOutcomeCandidate: "current" }
});
assert.equal(trapDeath.died, true);
assert.equal(trapDeath.deathSnapshot?.source, "tablet-trap",
  "lethal tablet trap finishes the run through the existing death path");
assert.equal(trapDeath.tabletExposure.encounters.find(entry => entry.selection === "read")?.outcome, "trap");
assert.equal(trapDeath.tabletExposure.encounters.find(entry => entry.selection === "read")?.stateAfter[0]?.status, "dead");
assert.equal(trapDeath.tabletExposure.encounters.find(entry => entry.selection === "read")?.stateAfter[0]?.deathCause, "石碑の罠");

for (const floor of [1, 20]) {
  let movementSeed;
  let map;
  let tablet;
  let startCell;
  let path;
  for (let seedIndex = 0; seedIndex < 100 && !path; seedIndex++) {
    movementSeed = `tablet-e2-route-floor-${floor}-${seedIndex}`;
    map = generateSharedRunFloor({ runSeed: movementSeed, floor });
    tablet = map.grid.flatMap((row, y) => row.map((cell, x) =>
      cell?.event === "event_tablet" ? { x, y } : null
    )).find(Boolean);
    startCell = map.grid.flatMap((row, y) => row.map((cell, x) =>
      cell?.type === "stairs-up" ? { x, y } : null
    )).find(Boolean);
    path = findShortestFloorPath(map.grid, startCell, tablet);
    if (path?.slice(1, -1).some(coord => map.grid[coord.y][coord.x]?.event)) path = null;
  }
  assert.ok(path?.length > 1, `B${floor} generated fixture has a reached tablet path`);
  for (const partialInformation of [false]) {
    const route = {
      current: { ...path[0] },
      path: path.map(coord => ({ ...coord })),
      nextMoveAt: 1,
      targets: [],
      targetIndex: 0,
      knownTrapKeys: new Set(),
      processedEventKeys: new Set(),
      replanStates: new Set(),
      partialInformation,
      knownCellKeys: new Set([`${path[0].x},${path[0].y}`]),
      discoveredStairs: null,
      postStairsExplorationRemaining: 0,
      floorComplete: false,
      personaPolicy: { exploration: { afterStairsSteps: 0 } }
    };
    const movementState = { x: route.current.x, y: route.current.y, simPolicy: { trapPolicy: "disabled" } };
    const movementMetrics = {
      trapRoute: { detourActive: false }, exploredCells: 0, exploredCellsByFloor: {},
      stairsDiscoveryStepByFloor: {}, bossDiscoveryStepByFloor: {}
    };
    let move;
    for (let step = 1; step <= 1_000; step++) {
      move = advanceSimulationFloorRoute(route, map, movementState, floor, movementMetrics, step);
      if (move.event) break;
    }
    assert.equal(move.event?.type, "event_tablet",
      `B${floor} actual movement reaches tablet in ${partialInformation ? "partial" : "oracle"} mode; current=${JSON.stringify(route.current)}, target=${JSON.stringify(tablet)}, remaining=${route.path.length}`);
    const party = [{ name: "N=1", status: "alive", exp: 0, level: 1, hp: 1000, maxHp: 1000 }];
    const tabletState = { floor, party, currentRun: { expGained: 0, deathLogs: [] } };
    const exposure = {
      _reachedLocationKeys: new Set(), uniqueReachedLocationCount: 0,
      revisitEntryCount: 0, encounters: [], readCount: 0, expGained: 0,
      combatLedgerDelta: 0
    };
    const read = resolveSimulationTabletEncounter({
      state: tabletState, generated: map, tabletExposure: exposure, event: move.event,
      seriesId: "phase4j-e2-route-fixture", runIndex: 0, runSeed: movementSeed,
      floor, step: 1, policy: "read-first-reached", candidate: "current",
      rng: () => 0.7, rngStateBefore: 123, getRngState: () => 123 + 0x6D2B79F5
    });
    assert.equal(read.selection, "read");
    assert.equal(read.outcome, "miss");
    assert.equal(read.rngCalls, 1);
    assert.equal(read.rngBoundary.after - read.rngBoundary.before, 0x6D2B79F5);
    assert.equal(read.consumed, true);
    assert.equal(exposure.readCount, 1);
    assert.equal(tabletState.currentRun.expGained, 0);
  }
}

console.log("[PASS] Phase 4j-E2 N=1 tablet read outcome, route exposure, and EXP ledger");
