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
const { calculateCandidateAward } = await import("../../../scratch/measurements/progression_exp_award_paired_inventory.js");

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

const connectedRunOptions = { ...runOptions };
delete connectedRunOptions.encounterRateOverride;
const connectedScenario = {
  ...readScenario,
  tabletOutcomeCandidate: "fixed-c",
  expAwardCandidate: "phase4j-b"
};
const b1Connected = simulateRun({
  ...connectedRunOptions,
  worldSeed: "phase4j-e3-contiguous-1-9",
  seriesId: "phase4j-e3-b1-connected-n1",
  scenario: connectedScenario
});
const b1Production = simulateRun({
  ...connectedRunOptions,
  worldSeed: "phase4j-e3-contiguous-1-9",
  seriesId: "phase4j-e3-b1-production-n1",
  scenario: { ...connectedScenario, expAwardCandidate: "production" }
});
const b1Read = b1Connected.tabletExposure.encounters.find(entry => entry.selection === "read");
const b1ProductionRead = b1Production.tabletExposure.encounters.find(entry => entry.selection === "read");
const b1Combat = b1Connected.combatExpCandidate.observations.find(entry =>
  entry.result === "victory" && entry.combatLedgerBefore === 0
);
const b1ProductionCombat = b1Production.combatExpCandidate.observations.find(entry =>
  entry.result === "victory" && entry.combatLedgerBefore === 0
);
assert.equal(b1Read?.outcome, "success");
assert.equal(b1Read?.expGained, 80);
assert.equal(b1Read?.combatLedgerBefore, b1Read?.combatLedgerAfter,
  "the production-path Read stays outside the combat-only EXP ledger");
assert.equal(b1Read?.stateBefore[0]?.level, 1);
assert.equal(b1Read?.stateAfter[0]?.level, 1,
  "the tablet Read does not trigger a Level check");
assert.equal(b1ProductionRead?.outcome, b1Read?.outcome,
  "the matched production and candidate runs use the same tablet outcome");
assert.equal(b1ProductionRead?.expGained, b1Read?.expGained);
assert.equal(b1ProductionRead?.combatLedgerBefore, 0);
assert.ok(b1Combat, "B1 reaches a later generated single ordinary victory in the same run");
assert.equal(b1Combat.awardMode, "phase4j-b");
assert.equal(b1Combat.candidateAppliedTo, "diagnostic-enemy-instance.exp");
assert.equal(b1Combat.otherEnemyFieldsUnchanged, true);
assert.equal(b1Combat.templateUnchanged, true);
assert.equal(b1Combat.candidateExp, calculateCandidateAward({
  floor: 1,
  kind: "ordinary",
  monsters: [{ templateExp: b1Combat.templateExp }],
  encounterSize: 1
}).totalAward);
assert.equal(b1Combat.rounds > 0, true, "the candidate enemy resolves through production combat rounds");
assert.equal(b1Combat.combatOnlyLedgerDelta, b1Combat.candidateExp,
  "production reward settlement grants the candidate once");
assert.equal(b1Combat.awardMatchedSelectedExp, true);
assert.equal(b1Combat.levelUps, 1, "the following production victory performs the existing Level check");
assert.ok(b1Combat.levelUpRecoveryHp > 0, "production Level-up recovery is observed");
assert.ok(b1Combat.rawMaxHpAfter > b1Combat.rawMaxHpBefore,
  "production Level-up grows raw max HP");
assert.ok(b1Combat.hpAfterRoundSettlement > b1Combat.hpBefore,
  "production Level-up recovery raises current HP");
assert.equal(b1Connected.tabletCombatLedgerDelta, 0);
assert.equal(b1Connected.characterExpGained,
  b1Connected.expGainedBySource.combat + b1Connected.expGainedBySource.tablet);
assert.ok(b1ProductionCombat, "matched baseline reaches the corresponding ordinary victory");
assert.equal(b1ProductionCombat.encounterName, b1Combat.encounterName);
assert.equal(b1ProductionCombat.productionInstanceExp, b1Combat.productionInstanceExp);
assert.equal(b1ProductionCombat.awardMode, "production");
assert.equal(b1ProductionCombat.candidateAppliedTo, null,
  "production control records the existing EXP without replacing it");
assert.equal(b1ProductionCombat.combatOnlyLedgerDelta, b1ProductionCombat.productionInstanceExp);
assert.equal(b1ProductionCombat.awardMatchedSelectedExp, true);

const b20Connected = simulateRun({
  ...connectedRunOptions,
  startFloor: 20,
  targetDepth: 21,
  worldSeed: "tablet-e2-20-2",
  seriesId: "phase4j-e3-b20-connected-n1",
  scenario: connectedScenario
});
const b20Production = simulateRun({
  ...connectedRunOptions,
  startFloor: 20,
  targetDepth: 21,
  worldSeed: "tablet-e2-20-2",
  seriesId: "phase4j-e4-b20-production-n1",
  scenario: { ...connectedScenario, expAwardCandidate: "production" }
});
const b20Read = b20Connected.tabletExposure.encounters.find(entry => entry.selection === "read");
assert.equal(b20Read?.outcome, "success");
assert.equal(b20Read?.expGained, 90);
assert.equal(b20Read?.combatLedgerBefore, b20Read?.combatLedgerAfter);
const b20Combat = b20Connected.combatExpCandidate.observations[0];
const b20ProductionCombat = b20Production.combatExpCandidate.observations[0];
assert.ok(b20Combat, "existing B20 natural run reaches an eligible generated ordinary encounter");
assert.ok([2, 3].includes(b20Combat.initialEncounterSize), "B20 natural fixture uses initial size 2 or 3");
assert.equal(b20Combat.awardMode, "phase4j-b");
assert.equal(b20Combat.allocationSum, b20Combat.candidateExp);
assert.equal(b20Combat.result, "death",
  "the existing B20 natural encounter is eligible but this natural combat does not reach settlement victory");
assert.equal(b20Combat.settlementCoverageValid, false,
  "non-victory natural combat remains explicitly outside valid settlement evidence");
assert.equal(b20Combat.otherEnemyFieldsUnchanged, true);
assert.equal(b20Combat.templateUnchanged, true);
assert.ok(b20ProductionCombat, "matched B20 production control reproduces the natural encounter");
assert.equal(b20ProductionCombat.initialEncounterSize, b20Combat.initialEncounterSize);
assert.deepEqual(b20ProductionCombat.initialEnemies.map(enemy => enemy.encounterName),
  b20Combat.initialEnemies.map(enemy => enemy.encounterName));
assert.equal(b20Connected.tabletCombatLedgerDelta, 0,
  "B20 tablet EXP remains outside the combat ledger");

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

console.log("[PASS] Phase 4j-E2 tablet, E3 B1 single-enemy, E4 B20 natural multi-enemy eligibility/coverage");
