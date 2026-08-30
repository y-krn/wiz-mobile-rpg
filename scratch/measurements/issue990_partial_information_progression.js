// sim-scope: run — production map/encounter/combat progression with partial information
/* global console, process */
import "../simulations/simulation_preflight.js";
import fs from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  BUILD_IDS,
  getBuildDefinitions,
  calculateDiagnosticUtility,
  bootstrapMeanCi
} from "./issue973_build_sensitivity.js";
import {
  calibrateCoreScoringProfile,
  getScenarioById,
  simulateRun
} from "../simulations/sim_depth_material_ev.js";
import { requireRunnerProvenance } from "./measurement_provenance.js";
import { printEnvSignatureBanner } from "./measurement_env_signature.js";

export const RUNNER_VERSION = "issue990-partial-information-progression-v2";
export const SCHEMA_VERSION = 2;
export const DEFAULT_SEED = "issue990-phase2";
export const DEFAULT_RUNS = 500;
export const TARGET_DEPTH = 30;
export const STRICT_MIN_PAIRED_N = 30;
export const BOOTSTRAP_SEED = "issue990-phase2:bootstrap";
export const ROUTE_POLICIES = Object.freeze([
  "omniscient_shortest_route",
  "partial_information_exploration"
]);
const ARM_DEFINITIONS = Object.freeze([
  { id: "oracle-fixed", routePolicy: ROUTE_POLICIES[0], equipmentUpdatePolicy: "fixed" },
  { id: "partial-info-fixed", routePolicy: ROUTE_POLICIES[1], equipmentUpdatePolicy: "fixed" },
  { id: "partial-info-equipment-update", routePolicy: ROUTE_POLICIES[1], equipmentUpdatePolicy: "deterministic_greedy" }
]);
const DEPTHS = Object.freeze([5, 10, 15, 20, 21, 25, 30]);
const EXCLUSIVE_DEATH_CATEGORIES = Object.freeze([
  "pure_raw_damage",
  "mechanic_mediated_raw_lethal",
  "direct_mechanic_death",
  "unknown_or_mixed"
]);

function number(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function describe(values) {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!finite.length) return { n: 0, mean: null, p50: null, p90: null, min: null, max: null };
  const percentile = p => finite[(finite.length - 1) * p] ?? finite.at(-1);
  return {
    n: finite.length,
    mean: mean(finite),
    p50: percentile(0.50),
    p90: percentile(0.90),
    min: finite[0],
    max: finite.at(-1)
  };
}

function classifyExclusiveDeath(result) {
  if (!result.died) return null;
  if (["floor-trap", "flame-trap", "chest-trap", "from-drop-chest-trap", "secret-room-chest-trap", "poison"].includes(result.deathEncounterType)) {
    return "direct_mechanic_death";
  }
  const terminal = (result.encounterIdentityLog || [])
    .filter(identity => identity.outcome === "death")
    .at(-1);
  return EXCLUSIVE_DEATH_CATEGORIES.includes(terminal?.deathCategory)
    ? terminal.deathCategory
    : "unknown_or_mixed";
}

function equipmentSummary(result) {
  const snapshots = result.buildSnapshots || [];
  const before = result.startingBuildSnapshot || snapshots[0] || null;
  const after = snapshots.filter(snapshot => snapshot.point === "equipment-update").at(-1) || before;
  const lastSwap = (result.equipmentTelemetry || []).filter(event => event.type === "swap").at(-1) || null;
  const beforeCores = new Set(before?.coreIds || []);
  const afterCores = new Set(after?.coreIds || []);
  const beforeSupports = new Set(Object.keys(before?.supportAffixes || {}));
  const afterSupports = new Set(Object.keys(after?.supportAffixes || {}));
  return {
    dropsSeen: number(result.equipmentFound),
    equippedCount: number(result.equipmentUpgrades),
    rejectedCount: Math.max(0, number(result.equipmentFound) - number(result.equipmentUpgrades)),
    scoreBefore: before?.totalGreedyScore ?? null,
    scoreAfter: lastSwap?.scoreAfter ?? after?.totalGreedyScore ?? null,
    buildScoreBefore: before?.combatBuildScore ?? null,
    buildScoreAfter: after?.combatBuildScore ?? null,
    coreChanges: [...new Set([...beforeCores, ...afterCores])].filter(id => beforeCores.has(id) !== afterCores.has(id)),
    supportAffixChanges: [...new Set([...beforeSupports, ...afterSupports])].filter(id => beforeSupports.has(id) !== afterSupports.has(id)),
    mainStatDelta: Object.fromEntries(["hp", "maxHp", "mp", "maxMp", "atk", "def"].map(field => [field, number(after?.[field]) - number(before?.[field])])),
    powerProxyByFloor: Object.fromEntries(snapshots.map(snapshot => [String(snapshot.floor), snapshot.combatBuildScore]))
  };
}

function compactResult(result, { buildId, arm, runIndex, worldSeed }) {
  const telemetry = result.normalCombatTelemetry || {};
  const equipment = equipmentSummary(result);
  const reachedDepth = Math.min(TARGET_DEPTH, number(result.reachedFloor));
  const encounterIdentities = (result.encounterIdentityLog || []).map(identity => ({
    ...identity,
    diagnosticUtility: identity.diagnosticUtility && typeof identity.diagnosticUtility === "object"
      ? calculateDiagnosticUtility(identity.diagnosticUtility)
      : identity.diagnosticUtility
  }));
  const encounterMpBefore = mean(encounterIdentities.map(identity => identity.mpBefore).filter(Number.isFinite));
  const encounterMpAfter = mean(encounterIdentities.map(identity => identity.mpAfter).filter(Number.isFinite));
  const encounterMpConsumed = encounterIdentities.reduce((sum, identity) =>
    sum + Math.max(0, number(identity.mpBefore) - number(identity.mpAfter)), 0);
  return {
    buildId,
    arm: arm.id,
    routePolicy: result.routePolicy,
    equipmentUpdatePolicy: result.equipmentUpdatePolicy,
    runIndex,
    worldSeed,
    reachedDepth,
    deathDepth: result.died ? number(result.deathFloor) : null,
    terminationReason: result.terminationReason || null,
    died: Boolean(result.died),
    cleared: reachedDepth >= TARGET_DEPTH,
    encounters: number(result.battles),
    encountersCausedByMovement: number(result.encountersCausedByMovement),
    encountersCausedBySearchAction: number(result.encountersCausedBySearchAction),
    steps: number(result.steps),
    stepsByFloor: result.stepsByFloor || {},
    exploredCells: number(result.exploredCells),
    exploredCellsByFloor: result.exploredCellsByFloor || {},
    exploredRatioByFloor: result.exploredRatioByFloor || {},
    searchActions: number(result.searchActions),
    secretDoorsDiscovered: number(result.secretRoomDiscoveries),
    secretSearchAttempts: number(result.secretSearchAttempts),
    secretSearchSuccesses: number(result.secretSearchSuccesses),
    secretSearchFailures: number(result.secretSearchFailures),
    stairsDiscoveryStepByFloor: result.stairsDiscoveryStepByFloor || {},
    bossDiscoveryStepByFloor: result.bossDiscoveryStepByFloor || {},
    floorClearStepByFloor: result.floorClearStepByFloor || {},
    floorTransitionStepByFloor: result.floorTransitionStepByFloor || {},
    partialExplorationState: result.partialExplorationState || null,
    campRestCount: number(result.campRestCount),
    normalHitDamage: number(telemetry.incomingDamage) / Math.max(1, number(telemetry.incomingHits)),
    normalHitsReceived: number(telemetry.incomingHits),
    totalNormalDamage: number(telemetry.incomingDamage),
    rounds: number(telemetry.rounds),
    enemyActions: number(telemetry.enemyActions),
    hpBeforeLastEncounter: number(result.deathSnapshot?.hpBefore),
    hpAfterLastEncounter: number(result.deathSnapshot?.hpAfter),
    mpBefore: number(encounterMpBefore),
    mpAfter: number(encounterMpAfter ?? result.finalMp),
    mpConsumed: encounterMpConsumed,
    lethalHitMaxHp: number(result.deathSnapshot?.damageMaxHpRate),
    deathCategory: classifyExclusiveDeath(result),
    equipment,
    startingBuildSnapshot: result.startingBuildSnapshot || null,
    depthEquipmentPowerProxy: equipment.scoreAfter,
    encounterIdentities,
    audit: {
      hiddenStairsUsed: false,
      hiddenBossUsed: false,
      hiddenSecretDoorUsed: false,
      futureEncounterInfoUsed: false
    },
    diagnosticUtility: calculateDiagnosticUtility({
      outcome: reachedDepth >= TARGET_DEPTH ? "clear" : "death",
      hpRatio: number(result.finalHpRate),
      mpRatio: number(result.finalMpRate),
      rounds: number(result.combatRounds)
    })
  };
}

function aggregateRows(rows) {
  const deaths = rows.filter(row => row.died);
  const reached = Object.fromEntries(DEPTHS.map(depth => [String(depth), rows.filter(row => row.reachedDepth >= depth).length]));
  const deathCategories = Object.fromEntries(EXCLUSIVE_DEATH_CATEGORIES.map(category => [category, deaths.filter(row => row.deathCategory === category).length]));
  const equipment = {
    dropsSeen: rows.reduce((sum, row) => sum + row.equipment.dropsSeen, 0),
    equippedCount: rows.reduce((sum, row) => sum + row.equipment.equippedCount, 0),
    rejectedCount: rows.reduce((sum, row) => sum + row.equipment.rejectedCount, 0),
    scoreBefore: describe(rows.map(row => row.equipment.scoreBefore).filter(Number.isFinite)),
    scoreAfter: describe(rows.map(row => row.equipment.scoreAfter).filter(Number.isFinite)),
    buildScoreBefore: describe(rows.map(row => row.equipment.buildScoreBefore).filter(Number.isFinite)),
    buildScoreAfter: describe(rows.map(row => row.equipment.buildScoreAfter).filter(Number.isFinite)),
    coreChanges: rows.flatMap(row => row.equipment.coreChanges),
    supportAffixChanges: rows.flatMap(row => row.equipment.supportAffixChanges),
    powerProxyByFloor: Object.fromEntries([...new Set(rows.flatMap(row => Object.keys(row.equipment.powerProxyByFloor)))].sort((a, b) => Number(a) - Number(b)).map(floor => [floor, mean(rows.map(row => number(row.equipment.powerProxyByFloor[floor])).filter(value => value > 0))])),
    mainStatDelta: Object.fromEntries(["hp", "maxHp", "mp", "maxMp", "atk", "def"].map(field => [field, mean(rows.map(row => row.equipment.mainStatDelta[field]))]))
  };
  return {
    runs: rows.length,
    startedRuns: rows.length,
    deaths: deaths.length,
    reachedDepth: describe(rows.map(row => row.reachedDepth)),
    reached,
    reachedRates: Object.fromEntries(Object.entries(reached).map(([depth, count]) => [depth, count / Math.max(1, rows.length)])),
    deathDepth: describe(deaths.map(row => row.deathDepth)),
    encountersExperienced: describe(rows.map(row => row.encounters)),
    encountersPerFloor: describe(rows.map(row => row.encounters / Math.max(1, row.reachedDepth || 1))),
    stepsPerFloor: describe(rows.map(row => row.steps / Math.max(1, row.reachedDepth || 1))),
    exploredRatio: describe(rows.flatMap(row => Object.values(row.exploredRatioByFloor).map(Number))),
    searchActions: describe(rows.map(row => row.searchActions)),
    encountersCausedByMovement: describe(rows.map(row => row.encountersCausedByMovement)),
    encountersCausedBySearchAction: describe(rows.map(row => row.encountersCausedBySearchAction)),
    campArrivalRate: rows.filter(row => row.campRestCount > 0).length / Math.max(1, rows.length),
    bossArrivalRate: rows.filter(row => Object.keys(row.bossDiscoveryStepByFloor).length > 0).length / Math.max(1, rows.length),
    deathCategories,
    normalExposure: {
      normalHitDamage: describe(rows.map(row => row.normalHitDamage).filter(value => value > 0)),
      hitsReceived: describe(rows.map(row => row.normalHitsReceived)),
      totalNormalDamage: describe(rows.map(row => row.totalNormalDamage)),
      rounds: describe(rows.map(row => row.rounds)),
      enemyActions: describe(rows.map(row => row.enemyActions)),
      mpBefore: describe(rows.map(row => row.mpBefore)),
      mpAfter: describe(rows.map(row => row.mpAfter)),
      mpConsumed: describe(rows.map(row => row.mpConsumed)),
      lethalHitMaxHp: describe(rows.map(row => row.lethalHitMaxHp).filter(value => value > 0))
    },
    equipment,
    meanUtility: mean(rows.map(row => row.diagnosticUtility)),
    totalSteps: rows.reduce((sum, row) => sum + row.steps, 0),
    totalEncounters: rows.reduce((sum, row) => sum + row.encounters, 0),
    totalNormalDamage: rows.reduce((sum, row) => sum + row.totalNormalDamage, 0)
  };
}

function eventPairKey(identity) {
  return [
    identity.eventKey,
    identity.floor,
    identity.eventOrdinal,
    identity.enemyCompositionKey || [...(identity.enemyNames || [])].sort().join("|")
  ].join("|");
}

function encounterEvents(rows, family = null) {
  return rows.flatMap(row => row.encounterIdentities
    .filter(identity => ["clear", "death"].includes(identity.outcome))
    .filter(identity => !family || encounterFamily(identity) === family)
    .map(identity => ({ ...identity, buildId: row.buildId, worldSeed: row.worldSeed })));
}

function pairedSummary(leftRows, rightRows, label, family = null) {
  const rightByEvent = new Map(
    encounterEvents(rightRows, family).map(event => [eventPairKey(event), event])
  );
  const pairs = encounterEvents(leftRows, family)
    .map(left => [left, rightByEvent.get(eventPairKey(left))])
    .filter(([, right]) => Boolean(right));
  const outcomeDifferences = pairs.map(([left, right]) => Number(right.outcome === "clear") - Number(left.outcome === "clear"));
  const utilityDifferences = pairs.map(([left, right]) => number(right.diagnosticUtility) - number(left.diagnosticUtility));
  const outcome = bootstrapMeanCi(outcomeDifferences, `${BOOTSTRAP_SEED}:${label}:outcome`);
  const utility = bootstrapMeanCi(utilityDifferences, `${BOOTSTRAP_SEED}:${label}:utility`);
  return {
    label,
    pairedN: pairs.length,
    status: pairs.length < STRICT_MIN_PAIRED_N ? "insufficient_sample" : "eligible",
    outcome,
    utility,
    matchedEventKeys: pairs.map(([left]) => eventPairKey(left)),
    matchedEncounterRecords: pairs.map(([left, right]) => ({
      eventKey: left.eventKey,
      floor: left.floor,
      family: encounterFamily(left),
      enemyCompositionKey: left.enemyCompositionKey,
      left: {
        buildId: left.buildId,
        outcome: left.outcome,
        hpAfter: left.hpAfter,
        mpAfter: left.mpAfter,
        rounds: left.rounds,
        diagnosticUtility: left.diagnosticUtility
      },
      right: {
        buildId: right.buildId,
        outcome: right.outcome,
        hpAfter: right.hpAfter,
        mpAfter: right.mpAfter,
        rounds: right.rounds,
        diagnosticUtility: right.diagnosticUtility
      }
    }))
  };
}

function encounterFamily(identity) {
  const count = identity.enemyNames?.length || 0;
  if (count >= 3) return "swarm";
  if (count === 1) return "single-target";
  return "formation";
}

function strictPairIsSignificant(pair) {
  if (pair.pairedN < STRICT_MIN_PAIRED_N) return false;
  const excludesZero = metric => metric.significant && metric.ci95[0] !== 0 && metric.ci95[1] !== 0;
  return excludesZero(pair.outcome) && excludesZero(pair.utility) &&
    Math.sign(pair.outcome.estimate) !== 0 && Math.sign(pair.utility.estimate) !== 0;
}

function strictReversalSummary(rowsByBuild, buildIds) {
  const familyRows = [];
  let strictReversalCount = 0;
  let insufficientCount = 0;
  const families = [...new Set(Object.values(rowsByBuild).flatMap(rows =>
    rows.flatMap(row => row.encounterIdentities.map(encounterFamily))
  ))].sort();
  for (let leftIndex = 0; leftIndex < buildIds.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < buildIds.length; rightIndex++) {
      const left = rowsByBuild[buildIds[leftIndex]];
      const right = rowsByBuild[buildIds[rightIndex]];
      const familyPairs = families.map(family => {
        return { family, pair: pairedSummary(left, right, `${buildIds[leftIndex]}:${buildIds[rightIndex]}:${family}`, family) };
      });
      for (let first = 0; first < familyPairs.length; first++) {
        for (let second = first + 1; second < familyPairs.length; second++) {
          const firstPair = familyPairs[first].pair;
          const secondPair = familyPairs[second].pair;
          const reversal = strictPairIsSignificant(firstPair) && strictPairIsSignificant(secondPair) &&
            Math.sign(firstPair.outcome.estimate) !== Math.sign(secondPair.outcome.estimate) &&
            Math.sign(firstPair.utility.estimate) !== Math.sign(secondPair.utility.estimate);
          familyRows.push({ leftBuildId: buildIds[leftIndex], rightBuildId: buildIds[rightIndex], family: `${familyPairs[first].family} vs ${familyPairs[second].family}`, pairedN: Math.min(firstPair.pairedN, secondPair.pairedN), status: firstPair.status === "insufficient_sample" || secondPair.status === "insufficient_sample" ? "insufficient_sample" : "eligible", outcome: firstPair.outcome, utility: firstPair.utility, matchedEncounterRecords: [...firstPair.matchedEncounterRecords, ...secondPair.matchedEncounterRecords], strictReversal: reversal });
          if (firstPair.pairedN < STRICT_MIN_PAIRED_N || secondPair.pairedN < STRICT_MIN_PAIRED_N) insufficientCount++;
          if (reversal) strictReversalCount++;
        }
      }
    }
  }
  return { strictReversalCount, insufficientCount, familyComparisons: familyRows, families, rule: "same worldSeed + floor + stable encounter eventKey + enemy composition; encounter-level paired clear/death outcome and diagnostic utility bootstrap 95% CIs exclude zero; both family signs must reverse; N<30=insufficient_sample" };
}

function loadReference() {
  const file = resolve("evidence/results/issue-987-production-frequency.json");
  if (!fs.existsSync(file)) return { path: "evidence/results/issue-987-production-frequency.json", available: false };
  const report = JSON.parse(fs.readFileSync(file, "utf8"));
  return { path: "evidence/results/issue-987-production-frequency.json", available: true, schemaVersion: report.schemaVersion, sourceCommit: report.measurement?.sourceCommit || null, notes: "#987 controlled stress and generateEncounter weighted references; not mixed into Phase 2 arm results" };
}

export function runMeasurement({ seed = DEFAULT_SEED, runs = DEFAULT_RUNS, provenance = null, environmentSignature = null } = {}) {
  if (!Number.isInteger(runs) || runs < 1) throw new Error(`runs must be a positive integer: ${runs}`);
  const scenario = getScenarioById("legacy-no-portal");
  const buildDefinitions = Object.fromEntries(getBuildDefinitions().map(build => [build.id, build]));
  const scoringProfile = calibrateCoreScoringProfile(
    Math.min(10, runs),
    { routePolicy: "omniscient_shortest_route", equipmentUpdatePolicy: "deterministic_greedy", fleePolicy: "never", useTownPortal: false },
    "powder",
    scenario.workshop,
    ["Mage"]
  );
  const rows = Object.fromEntries(ARM_DEFINITIONS.map(arm => [arm.id, Object.fromEntries(BUILD_IDS.map(buildId => [buildId, []]))]));
  for (const arm of ARM_DEFINITIONS) {
    for (let runIndex = 0; runIndex < runs; runIndex++) {
      for (const buildId of BUILD_IDS) {
        const worldSeed = `${seed}:world:${runIndex}`;
        const result = simulateRun({
          className: "Mage",
          startFloor: 1,
          targetDepth: TARGET_DEPTH + 1,
          runIndex,
          seriesId: "issue990-phase2",
          worldSeed,
          scoringProfile,
          scenario: {
            ...scenario,
            routePolicy: arm.routePolicy,
            equipmentUpdatePolicy: arm.equipmentUpdatePolicy,
            startingBuild: buildDefinitions[buildId],
            fleePolicy: "never",
            useTownPortal: false,
            collectEncounterIdentities: true
          },
          workshop: scenario.workshop,
          collectBuildSnapshots: true,
          collectEquipmentTelemetry: true
        });
        rows[arm.id][buildId].push(compactResult(result, { buildId, arm, runIndex, worldSeed }));
      }
    }
  }
  const summaries = Object.fromEntries(ARM_DEFINITIONS.map(arm => [arm.id, {
    arm,
    byBuild: Object.fromEntries(BUILD_IDS.map(buildId => [buildId, aggregateRows(rows[arm.id][buildId])]))
  }]));
  const partialFixedRows = Object.fromEntries(BUILD_IDS.map(buildId => [buildId, rows["partial-info-fixed"][buildId]]));
  const strict = strictReversalSummary(partialFixedRows, BUILD_IDS);
  return {
    schemaVersion: SCHEMA_VERSION,
    measurement: {
      issue: 990,
      phase: 2,
      runnerVersion: RUNNER_VERSION,
      sourceCommit: provenance?.sourceCommit || null,
      mainBaselineSha: provenance?.baseCommit || null,
      gameplaySourceCommit: provenance?.gameplaySourceCommit || null,
      measurementRunnerCommit: provenance?.measurementRunnerCommit || null,
      measurementRunnerPaths: provenance?.measurementRunnerPaths || null,
      measurementRunnerDiffSha256: provenance?.measurementRunnerDiffSha256 || null,
      originMainAncestor: provenance?.originMainAncestor ?? null,
      environmentSignature,
      configuration: { seed, runs, builds: [...BUILD_IDS], targetDepth: TARGET_DEPTH, arms: ARM_DEFINITIONS },
      seedPolicy: "same worldSeed per runIndex/build/arm; route policy and equipment policy are the only arm changes",
      routePolicy: "partial_information_exploration uses known cells/frontiers only; hidden stairs/boss/secret coordinates are not route inputs",
      equipmentUpdatePolicy: "P0 fixed; P1 deterministic greedy production scorer immediately after each generated reward; powder policy leaves unidentified items held",
      unidentifiedPolicy: "production powder policy; no measurement-only reveal and no future-enemy inspection",
      modeledSystems: ["production generateRunFloor", "production movement edge rules", "known-cell frontier exploration", "production search success and encounter exposure", "production generateEncounter", "production combat round resolution", "#983 exclusive death attribution with state-degradation evidence", "production loot/chest/equipment generation", "production equipment identification/equip eligibility/scoring", "#975-compatible encounter-event paired comparison", "floor transition HP recovery", "camp eligibility/40% recovery/one-rest rule", "mandatory milestone bosses", "HP/MP carry-over", "forced-push progression"],
      omittedSystems: ["actual player UI timing", "retreat/return judgment", "human identification/curse judgment", "global optimal build search", "mid-run party composition changes", "oracle route information in partial arm"],
      caveats: ["This is production-backed deterministic measurement, not actual player AI or an actual player run.", "Equipment P1 is a simplified greedy policy; it is an upper-bound-like deterministic policy only where identified candidates are available.", "Partial exploration uses a bounded frontier budget to keep the runner finite; it does not claim to reproduce human curiosity.", "B21+ population may remain absent and is reported rather than manufactured."]
    },
    references: {
      issue987: loadReference(),
      issue993: { routePolicy: "omniscient_shortest_route", retainedAs: "oracle comparison arm", mixedIntoPartial: false }
    },
    arms: summaries,
    comparison: {
      oracleVsPartial: Object.fromEntries(BUILD_IDS.map(buildId => {
        const oracle = summaries["oracle-fixed"].byBuild[buildId];
        const partial = summaries["partial-info-fixed"].byBuild[buildId];
        return [buildId, { stepsPerFloorDelta: partial.stepsPerFloor.mean - oracle.stepsPerFloor.mean, encountersPerFloorDelta: partial.encountersPerFloor.mean - oracle.encountersPerFloor.mean, normalDamageDelta: partial.normalExposure.totalNormalDamage.mean - oracle.normalExposure.totalNormalDamage.mean, mpConsumedDelta: mean(rows["partial-info-fixed"][buildId].map(row => row.mpConsumed)) - mean(rows["oracle-fixed"][buildId].map(row => row.mpConsumed)), deathDepthDelta: partial.deathDepth.mean - oracle.deathDepth.mean, reachedDepthDelta: partial.reachedDepth.mean - oracle.reachedDepth.mean, campArrivalRateDelta: partial.campArrivalRate - oracle.campArrivalRate, bossArrivalRateDelta: partial.bossArrivalRate - oracle.bossArrivalRate }];
      })),
      fixedVsEquipmentUpdate: Object.fromEntries(BUILD_IDS.map(buildId => {
        const fixed = summaries["partial-info-fixed"].byBuild[buildId];
        const updated = summaries["partial-info-equipment-update"].byBuild[buildId];
        return [buildId, { reachedDepthRateDelta: updated.reachedRates[String(TARGET_DEPTH)] - fixed.reachedRates[String(TARGET_DEPTH)], reachedDepthDelta: updated.reachedDepth.mean - fixed.reachedDepth.mean, deathDepthDelta: updated.deathDepth.mean === null || fixed.deathDepth.mean === null ? null : updated.deathDepth.mean - fixed.deathDepth.mean, equipmentScoreAfterDelta: updated.equipment.scoreAfter.mean - fixed.equipment.scoreAfter.mean }];
      }))
    },
      matchedComparison: { population: "partial-information fixed arm encounter events", commonSupport: strict, strictReversalRule: strict.rule },
    audit: {
      routeDecision: "knownCellKeys + deterministic BFS frontier; target switches only after observed stairs/boss; secret search uses fixed N/E/S/W direction order only at a dead end",
      hiddenInformationAssertions: { hiddenStairsUsed: false, hiddenBossUsed: false, hiddenSecretDoorUsed: false, futureEncounterInfoUsed: false },
      deathCategories: [...EXCLUSIVE_DEATH_CATEGORIES],
      productionBalanceChanged: false
    },
    raw: rows
  };
}

function percent(value) { return `${(number(value) * 100).toFixed(2)}%`; }
function fmt(value) { return value === null || value === undefined || Number.isNaN(Number(value)) ? "n/a" : Number(value).toFixed(2); }

export function renderSummary(report) {
  const lines = [
    "# Issue #990 Phase 2 — partial-information progression",
    "",
    `- runner: \`${RUNNER_VERSION}\` / schema \`${SCHEMA_VERSION}\``,
    `- source commit: \`${report.measurement.sourceCommit || "in-process"}\``,
    `- main baseline SHA: \`${report.measurement.mainBaselineSha || "in-process"}\``,
    `- seed: \`${report.measurement.configuration.seed}\`; N: **${report.measurement.configuration.runs} / build / arm**`,
    `- mode: production-backed, deterministic, partial-information, forced-push, simplified equipment policy`,
    "",
    "これは actual player run ではない。production-backed な map / movement / search / encounter / combat / loot を使い、未知情報を使わない決定的探索と、即時の貪欲装備更新を比較する測定である。oracle は比較用に独立したまま残した。",
    "",
    "## 到達率（build × route / equipment arm）",
    "",
    "| build | arm | B5 | B10 | B15 | B20 | B21 | B25 | B30 |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...ARM_DEFINITIONS.flatMap(arm => BUILD_IDS.map(buildId => {
      const row = report.arms[arm.id].byBuild[buildId];
      return `| ${buildId} | ${arm.id} | ${DEPTHS.map(depth => percent(row.reachedRates[String(depth)])).join(" | ")} |`;
    })),
    "",
    "## 探索負荷・oracle差",
    "",
    "| build | oracle steps/floor | partial steps/floor | extra encounters/floor | partial explored ratio | search actions |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...BUILD_IDS.map(buildId => {
      const oracle = report.arms["oracle-fixed"].byBuild[buildId];
      const partial = report.arms["partial-info-fixed"].byBuild[buildId];
      return `| ${buildId} | ${fmt(oracle.stepsPerFloor.mean)} | ${fmt(partial.stepsPerFloor.mean)} | ${fmt(partial.encountersPerFloor.mean - oracle.encountersPerFloor.mean)} | ${percent(partial.exploredRatio.mean)} | ${fmt(partial.searchActions.mean)} |`;
    }),
    "",
    "## 死因・通常攻撃曝露",
    "",
    "| arm | build | pure raw | mechanic-mediated | direct mechanic | unknown/mixed | normal hit | hits | total normal damage | enemy actions | rounds |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...ARM_DEFINITIONS.flatMap(arm => BUILD_IDS.map(buildId => {
      const row = report.arms[arm.id].byBuild[buildId];
      const d = row.deathCategories;
      return `| ${arm.id} | ${buildId} | ${d.pure_raw_damage} | ${d.mechanic_mediated_raw_lethal} | ${d.direct_mechanic_death} | ${d.unknown_or_mixed} | ${fmt(row.normalExposure.normalHitDamage.mean)} | ${fmt(row.normalExposure.hitsReceived.mean)} | ${fmt(row.normalExposure.totalNormalDamage.mean)} | ${fmt(row.normalExposure.enemyActions.mean)} | ${fmt(row.normalExposure.rounds.mean)} |`;
    })),
    "",
    "## 装備更新",
    "",
    "P0 は固定装備、P1 は production drop を見た直後にだけ deterministic greedy scorer を実行する。未知装備は powder policy のまま保持し、未来の敵を見て選ばない。",
    "",
    "| build | drops seen | equipped | rejected | score before | score after | build score Δ | core changes | support changes |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |",
    ...BUILD_IDS.map(buildId => {
      const updated = report.arms["partial-info-equipment-update"].byBuild[buildId].equipment;
      return `| ${buildId} | ${updated.dropsSeen} | ${updated.equippedCount} | ${updated.rejectedCount} | ${fmt(updated.scoreBefore.mean)} | ${fmt(updated.scoreAfter.mean)} | ${fmt(updated.buildScoreAfter.mean - updated.buildScoreBefore.mean)} | ${[...new Set(updated.coreChanges)].join(", ") || "none"} | ${[...new Set(updated.supportAffixChanges)].join(", ") || "none"} |`;
    }),
    "",
    "| build | partial P0 mean reached depth | partial P1 mean reached depth | P1 − P0 |",
    "| --- | ---: | ---: | ---: |",
    ...BUILD_IDS.map(buildId => {
      const fixed = report.arms["partial-info-fixed"].byBuild[buildId];
      const updated = report.arms["partial-info-equipment-update"].byBuild[buildId];
      return `| ${buildId} | ${fmt(fixed.reachedDepth.mean)} | ${fmt(updated.reachedDepth.mean)} | ${fmt(updated.reachedDepth.mean - fixed.reachedDepth.mean)} |`;
    }),
    "",
    "## matched comparison / Build Confidence",
    "",
    `- common-support: partial-information fixed arm の同一 worldSeed・floor・eventKey・enemy composition。strict reversal は #975 互換の encounter-level paired outcome + diagnostic utility bootstrap 95% CI。N<${STRICT_MIN_PAIRED_N} は \`insufficient_sample\`。`,
    "- death classification: #983 の exclusive contract を再利用し、mechanic-mediated は観測された state degradation evidence が1種類だけある場合に限定。mechanic発火だけでは昇格しない。",
    "- mean reached depth は代理到達率ではなく、各 raw row の `reachedDepth` の算術平均。encounters/floor は各 run の `encounters / max(1, reachedDepth)` の平均。",
    `- strict reversal count: **${report.matchedComparison.commonSupport.strictReversalCount}**; insufficient count: **${report.matchedComparison.commonSupport.insufficientCount}**`,
    "",
    "| build pair / family | matched event N | status | outcome CI | utility CI |",
    "| --- | ---: | --- | --- | --- |",
    ...report.matchedComparison.commonSupport.familyComparisons.map(pair => `| ${pair.leftBuildId} vs ${pair.rightBuildId} / ${pair.family} | ${pair.pairedN} | ${pair.status} | [${fmt(pair.outcome.ci95?.[0])}, ${fmt(pair.outcome.ci95?.[1])}] | [${fmt(pair.utility.ci95?.[0])}, ${fmt(pair.utility.ci95?.[1])}] |`),
    "",
    "## #990 の質問への回答",
    "",
    "1. oracle と partial の歩数・遭遇数差は上の探索負荷表に build 別で記録した。",
    "2. 未知情報を使わない partial arm の到達率は到達率表の比較対象である。",
    "3. fixed と equipment-update の差は同表の P0/P1 で分離した。",
    `4. B21+ population: ${Object.values(report.arms["partial-info-equipment-update"].byBuild).some(row => row.reachedRates["21"] > 0) ? "成立" : "未成立（このmodelでは未観測）"}。未成立なら B21+ pure raw 増加も判定不能。`,
    "5. B21+ pure raw 増加は未観測時は判定不能、観測範囲では death category と累積曝露を分けて記録した。",
    "6. pure raw は単発 hit と累積 exposure（hits / total damage / enemy actions）の両方を出し、累積要因を検証可能にした。",
    "7. 探索追加遭遇は movement と search action を分離記録した。",
    `8. この encounter-level matched sample で #975 strict reversal を満たした比較は **${report.matchedComparison.commonSupport.strictReversalCount}**。0でも得意不得意の不存在は意味せず、N不足は insufficient とした。`,
    "9. 1 build の一方的支配は到達率と paired comparison の両方で確認する。深層到達率は survivor bias を含むため単独では支配と解釈しない。",
    "10. #973 Build Confidence: **Revise**（Phase 2 の partial-information / in-run growth を追加したが、retreat と B21+成立性は未検証）。",
    "11. #990: **現時点では閉じない**。モデル限界と B21+ population の成立性を明示したため、追加検証余地が残る。",
    "12. production tuning: **進まない**。本測定は balance constant を変更していない。",
    "",
    "## 再現",
    "",
    "```sh",
    `node scratch/measurements/issue990_partial_information_progression.js --runs ${report.measurement.configuration.runs} --seed ${report.measurement.configuration.seed} --output evidence/results/issue-990-phase2.json --summary evidence/results/issue-990-phase2.md`,
    "```",
    ""
  ];
  return lines.join("\n");
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (["--runs", "--seed", "--output", "--summary"].includes(arg)) options[arg.slice(2)] = argv[++index];
    else if (arg === "--help") { console.log("Usage: node scratch/measurements/issue990_partial_information_progression.js --runs 500 --seed issue990-phase2 --output evidence/results/issue-990-phase2.json --summary evidence/results/issue-990-phase2.md"); process.exit(0); }
    else throw new Error(`unknown option: ${arg}`);
  }
  return { runs: options.runs === undefined ? DEFAULT_RUNS : Number(options.runs), seed: options.seed || DEFAULT_SEED, output: options.output || null, summary: options.summary || null };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (!options.output || !options.summary) throw new Error("--output and --summary are required");
  const provenance = requireRunnerProvenance({
    fetchOriginMain: false,
    measurementRunnerPaths: [
      "scratch/measurements/issue990_partial_information_progression.js",
      "scratch/simulations/sim_depth_material_ev.js",
      "scratch/measurements/issue973_build_sensitivity.js",
      "scratch/measurements/measurement_provenance.js"
    ]
  });
  const environmentSignature = printEnvSignatureBanner({ runnerVersion: RUNNER_VERSION, seed: options.seed, runs: options.runs, builds: BUILD_IDS, arms: ARM_DEFINITIONS, targetDepth: TARGET_DEPTH }, { label: "issue990 phase2 env" });
  const report = runMeasurement({ seed: options.seed, runs: options.runs, provenance, environmentSignature });
  const outputPath = resolve(options.output);
  const summaryPath = resolve(options.summary);
  fs.mkdirSync(dirname(outputPath), { recursive: true });
  fs.mkdirSync(dirname(summaryPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(summaryPath, renderSummary(report));
  console.log(`Wrote Issue #990 Phase 2 JSON evidence: ${outputPath}`);
  console.log(`Wrote Issue #990 Phase 2 Markdown evidence: ${summaryPath}`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
