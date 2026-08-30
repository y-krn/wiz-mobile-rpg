// sim-scope: run — production-backed combat-policy sensitivity measurement
/* global console, process */

import "../simulations/simulation_preflight.js";
import fs from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  calibrateCoreScoringProfile,
  COMBAT_POLICY_IDS,
  getScenarioById,
  selectSimulationCombatActionForPolicy,
  simulateRun
} from "../simulations/sim_depth_material_ev.js";
import { PERSONA_POLICIES, describe, percentile } from "./issue990_phase3_stage1.js";
import { requireRunnerProvenance } from "./measurement_provenance.js";
import { printEnvSignatureBanner } from "./measurement_env_signature.js";

export const RUNNER_VERSION = "issue990-phase3-stage2-v1";
export const SCHEMA_VERSION = 4;
export const DEFAULT_SEED = "issue990-phase3-stage1";
export const DEFAULT_RUNS = 500;
export const TARGET_DEPTH = 30;
export const FLOORS = Object.freeze(Array.from({ length: TARGET_DEPTH }, (_, index) => index + 1));
export const POLICIES = COMBAT_POLICY_IDS;
export const DEATH_CATEGORIES = Object.freeze([
  "pure_raw_damage",
  "mechanic_mediated_raw_lethal",
  "direct_mechanic_death",
  "unknown_or_mixed"
]);
const MIN_REPORT_SAMPLE = 5;

function finite(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function sum(values) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

function ratio(numerator, denominator) {
  return denominator ? numerator / denominator : null;
}

function percent(value) {
  return value === null || value === undefined ? "n/a" : `${(Number(value) * 100).toFixed(1)}%`;
}

function fmt(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? "n/a"
    : Number(value).toFixed(2);
}

function classifyDeath(result) {
  if (!result.died) return null;
  if (["floor-trap", "flame-trap", "chest-trap", "from-drop-chest-trap", "secret-room-chest-trap", "poison"].includes(result.deathEncounterType)) {
    return "direct_mechanic_death";
  }
  const terminal = (result.encounterIdentityLog || []).filter(event => event.outcome === "death").at(-1);
  return DEATH_CATEGORIES.includes(terminal?.deathCategory) ? terminal.deathCategory : "unknown_or_mixed";
}

function compactRun(result, { policy, runIndex, worldSeed }) {
  return {
    policy,
    runIndex,
    worldSeed,
    reachedDepth: Math.min(TARGET_DEPTH, Number(result.reachedFloor) || 0),
    died: Boolean(result.died),
    deathDepth: result.died ? finite(result.deathFloor) : null,
    deathCategory: classifyDeath(result),
    terminationReason: result.terminationReason || null,
    finalHpRate: finite(result.finalHpRate),
    finalMpRate: finite(result.finalMpRate),
    rounds: finite(result.normalCombatTelemetry?.rounds) || 0,
    enemyActions: finite(result.normalCombatTelemetry?.enemyActions) || 0,
    normalDamage: finite(result.normalCombatTelemetry?.incomingDamage) || 0,
    stage15Diagnostics: result.stage15Diagnostics
  };
}

function aggregateFloor(records, floor) {
  const observed = records
    .map(record => record.stage15Diagnostics?.byFloor?.[String(floor)])
    .filter(Boolean);
  const sums = field => sum(observed.map(record => record[field]));
  const values = side => field => describe(observed.map(record => finite(record[`${side}${field[0].toUpperCase()}${field.slice(1)}`])).filter(value => value !== null));
  const entered = observed.length;
  const reachedNextFloor = sums("reachedNextFloor");
  const died = sums("died");
  const incomplete = sums("incomplete");
  if (entered !== reachedNextFloor + died + incomplete) {
    throw new Error(`floor invariant failed for B${floor}: ${entered} != ${reachedNextFloor}+${died}+${incomplete}`);
  }
  const incompleteReasons = {};
  const incompleteTerminationReasons = {};
  observed.forEach(record => {
    Object.entries(record.incompleteReasons || {}).forEach(([reason, count]) => {
      incompleteReasons[reason] = (incompleteReasons[reason] || 0) + Number(count || 0);
    });
    Object.entries(record.incompleteTerminationReasons || {}).forEach(([reason, count]) => {
      incompleteTerminationReasons[reason] = (incompleteTerminationReasons[reason] || 0) + Number(count || 0);
    });
  });
  if (sum(Object.values(incompleteReasons)) !== incomplete || sum(Object.values(incompleteTerminationReasons)) !== incomplete) {
    throw new Error(`incomplete reason invariant failed for B${floor}`);
  }
  const entry = values("entry");
  const exit = values("exit");
  const total = field => sums(field);
  return {
    floor,
    status: entered ? "observed" : "unobserved",
    entered,
    reachedNextFloor,
    died,
    incomplete,
    nextFloorReachRate: ratio(reachedNextFloor, entered),
    incompleteReasons,
    incompleteTerminationReasons,
    entry: { hpRatio: entry("hpRatio"), mpRatio: entry("mpRatio") },
    exit: { hpRatio: exit("hpRatio"), mpRatio: exit("mpRatio") },
    mpSpent: total("mpSpent"),
    mpRecovered: total("mpRecovered"),
    damageTaken: total("damageTaken"),
    healing: total("healing"),
    equipmentChanges: total("equipmentChanges"),
    encounters: total("encounters"),
    combatActions: total("combatActions"),
    spellCasts: total("spellActions"),
    normalAttacks: total("normalAttackActions"),
    itemActions: total("itemActions"),
    rounds: total("rounds"),
    enemyActions: total("enemyActions"),
    normalHits: total("normalHits"),
    normalDamage: total("normalDamage"),
    insufficientMpDecisions: total("insufficientMpDecisionCount"),
    insufficientMpRounds: total("insufficientMpRounds"),
    perEncounter: {
      spellCasts: ratio(total("spellActions"), total("encounters")),
      mpSpent: ratio(total("combatMpSpent"), total("encounters")),
      normalAttacks: ratio(total("normalAttackActions"), total("encounters")),
      rounds: ratio(total("rounds"), total("encounters")),
      enemyActions: ratio(total("enemyActions"), total("encounters")),
      normalDamage: ratio(total("normalDamage"), total("encounters"))
    }
  };
}

function aggregateMpBuckets(records) {
  const buckets = {};
  records.forEach(record => Object.entries(record.stage15Diagnostics?.mpBuckets || {}).forEach(([bucket, value]) => {
    const target = buckets[bucket] ||= { encounters: 0, clear: 0, death: 0, pureRawDeaths: 0, rounds: 0, enemyActions: 0, normalHits: 0, normalDamage: 0, spellCasts: 0, normalAttacks: 0 };
    Object.keys(target).forEach(field => { target[field] += Number(value[field] || 0); });
  }));
  return Object.fromEntries(Object.entries(buckets).map(([bucket, value]) => [bucket, {
    ...value,
    clearRate: ratio(value.clear, value.encounters),
    deathRate: ratio(value.death, value.encounters),
    pureRawDeathRate: ratio(value.pureRawDeaths, value.encounters),
    meanRounds: ratio(value.rounds, value.encounters),
    meanEnemyActions: ratio(value.enemyActions, value.encounters),
    meanNormalHits: ratio(value.normalHits, value.encounters),
    meanNormalDamage: ratio(value.normalDamage, value.encounters),
    spellCastsPerEncounter: ratio(value.spellCasts, value.encounters),
    normalAttacksPerEncounter: ratio(value.normalAttacks, value.encounters)
  }]));
}

function aggregateSpells(records) {
  const spells = {};
  records.forEach(record => Object.entries(record.stage15Diagnostics?.spellUsage || {}).forEach(([spellId, usage]) => {
    const target = spells[spellId] ||= { spellId, castCount: 0, successfulCasts: 0, totalMpSpent: 0, targetTypes: {} };
    target.castCount += Number(usage.castCount || 0);
    target.successfulCasts += Number(usage.successfulCasts || 0);
    target.totalMpSpent += Number(usage.totalMpSpent || 0);
    Object.entries(usage.targetTypes || {}).forEach(([type, count]) => { target.targetTypes[type] = (target.targetTypes[type] || 0) + Number(count || 0); });
  }));
  const castTotal = sum(Object.values(spells).map(value => value.castCount));
  Object.values(spells).forEach(value => { value.castShare = ratio(value.castCount, castTotal); });
  return spells;
}

function deathSummary(records) {
  const deaths = records.filter(record => record.died);
  return Object.fromEntries(DEATH_CATEGORIES.map(category => {
    const count = deaths.filter(record => record.deathCategory === category).length;
    return [category, { count, rate: ratio(count, deaths.length) }];
  }));
}

function aggregatePolicy(records) {
  const reached = describe(records.map(record => record.reachedDepth));
  const reach = Object.fromEntries(FLOORS.map(floor => [String(floor), {
    count: records.filter(record => record.reachedDepth >= floor).length,
    rate: ratio(records.filter(record => record.reachedDepth >= floor).length, records.length)
  }]));
  const floors = Object.fromEntries(FLOORS.map(floor => [String(floor), aggregateFloor(records, floor)]));
  const encounters = sum(Object.values(floors).map(value => value.encounters));
  const totals = field => sum(Object.values(floors).map(value => value[field]));
  return {
    runs: records.length,
    reachedDepth: reached,
    reach,
    floors,
    deathCategories: deathSummary(records),
    totals: {
      encounters,
      spellCasts: totals("spellCasts"),
      normalAttacks: totals("normalAttacks"),
      rounds: totals("rounds"),
      enemyActions: totals("enemyActions"),
      normalDamage: totals("normalDamage"),
      mpSpent: totals("mpSpent"),
      equipmentChanges: totals("equipmentChanges")
    },
    perEncounter: {
      spellCasts: ratio(totals("spellCasts"), encounters),
      mpSpent: ratio(totals("mpSpent"), encounters),
      normalAttacks: ratio(totals("normalAttacks"), encounters),
      rounds: ratio(totals("rounds"), encounters),
      enemyActions: ratio(totals("enemyActions"), encounters),
      normalDamage: ratio(totals("normalDamage"), encounters)
    },
    mpBuckets: aggregateMpBuckets(records),
    spellUsage: aggregateSpells(records),
    representativeSamples: Object.fromEntries(FLOORS.map(floor => [String(floor), records
      .filter(record => record.stage15Diagnostics?.byFloor?.[String(floor)])
      .slice(0, 10)
      .map(record => ({ policy: record.policy, runIndex: record.runIndex, worldSeed: record.worldSeed, snapshot: record.stage15Diagnostics.byFloor[String(floor)] }))]))
  };
}

function pairComparison(rowsByPolicy) {
  const pairs = [];
  for (let leftIndex = 0; leftIndex < POLICIES.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < POLICIES.length; rightIndex++) {
      const left = POLICIES[leftIndex];
      const right = POLICIES[rightIndex];
      const rightRows = new Map(rowsByPolicy[right].map(row => [row.runIndex, row]));
      const deltas = [];
      let leftReachedDeeper = 0;
      let sameDepth = 0;
      let rightReachedDeeper = 0;
      rowsByPolicy[left].forEach(leftRow => {
        const rightRow = rightRows.get(leftRow.runIndex);
        if (!rightRow) return;
        if (leftRow.reachedDepth > rightRow.reachedDepth) leftReachedDeeper++;
        else if (leftRow.reachedDepth < rightRow.reachedDepth) rightReachedDeeper++;
        else sameDepth++;
        deltas.push({
          reachedDepth: rightRow.reachedDepth - leftRow.reachedDepth,
          deathDepth: (rightRow.deathDepth ?? rightRow.reachedDepth) - (leftRow.deathDepth ?? leftRow.reachedDepth),
          finalMpRate: (rightRow.finalMpRate ?? 0) - (leftRow.finalMpRate ?? 0),
          rounds: rightRow.rounds - leftRow.rounds,
          enemyActions: rightRow.enemyActions - leftRow.enemyActions,
          normalDamage: rightRow.normalDamage - leftRow.normalDamage
        });
      });
      pairs.push({
        left,
        right,
        pairedRuns: deltas.length,
        leftReachedDeeper,
        sameDepth,
        rightReachedDeeper,
        deltas: Object.fromEntries(["reachedDepth", "deathDepth", "finalMpRate", "rounds", "enemyActions", "normalDamage"].map(field => [field, describe(deltas.map(value => value[field]))]))
      });
    }
  }
  return pairs;
}

export function validatePolicyFixture() {
  const character = { class: "Mage", spells: ["HALITO", "MAHALITO", "LAHALITO", "TILTOWAIT"], mp: 10, maxMp: 10 };
  const enemies = [{ hp: 18, status: "ok" }];
  const canCastSpell = spellName => ["HALITO", "MAHALITO", "LAHALITO", "TILTOWAIT"].includes(spellName);
  const actions = Object.fromEntries(POLICIES.map(combatPolicy => [combatPolicy, selectSimulationCombatActionForPolicy({ combatPolicy, character, enemies, roundNumber: 1, canCastSpell })]));
  if (actions["mp-conserving"].type !== "fight") throw new Error("mp-conserving fixture did not conserve MP");
  if (actions["burst-combat"].spellName !== "MAHALITO") throw new Error("burst fixture did not select high damage spell");
  if (actions["balanced-combat"].spellName !== "HALITO") throw new Error("balanced fixture changed unexpectedly");
  return { fixture: "single enemy hp=18, Mage MP=10, known HALITO/MAHALITO/LAHALITO/TILTOWAIT", actions };
}

function runMeasurement({ seed = DEFAULT_SEED, runs = DEFAULT_RUNS, policies = POLICIES, provenance = null, environmentSignature = null } = {}) {
  if (!Number.isInteger(runs) || runs < 1) throw new Error(`runs must be a positive integer: ${runs}`);
  const selected = [...new Set(policies)];
  if (!selected.length || selected.some(policy => !POLICIES.includes(policy))) throw new Error(`policies must be ${POLICIES.join(",")}`);
  const baseScenario = getScenarioById("legacy-no-portal");
  const balancedExploration = PERSONA_POLICIES.balanced;
  const scoringProfile = calibrateCoreScoringProfile(
    Math.min(10, runs),
    { routePolicy: "partial_information_exploration", equipmentUpdatePolicy: "deterministic_greedy", fleePolicy: "never", useTownPortal: false },
    "powder",
    baseScenario.workshop,
    ["Mage"]
  );
  const rowsByPolicy = Object.fromEntries(selected.map(policy => [policy, []]));
  for (const combatPolicy of selected) {
    for (let runIndex = 0; runIndex < runs; runIndex++) {
      const worldSeed = `${seed}:world:${runIndex}`;
      const result = simulateRun({
        className: "Mage",
        startFloor: 1,
        targetDepth: TARGET_DEPTH + 1,
        runIndex,
        seriesId: "issue990-phase3-stage2",
        worldSeed,
        scoringProfile: { ...scoringProfile, personaEquipmentWeights: balancedExploration.equipmentWeights },
        scenario: {
          ...baseScenario,
          routePolicy: "partial_information_exploration",
          equipmentUpdatePolicy: "deterministic_greedy",
          personaId: "stage2-balanced-exploration",
          personaPolicy: balancedExploration,
          combatPolicy,
          fleePolicy: "never",
          useTownPortal: false,
          healPotionThreshold: balancedExploration.resourcePolicy.healPotionThreshold,
          manaPotionThreshold: balancedExploration.resourcePolicy.manaPotionThreshold,
          healPriorityPolicy: balancedExploration.resourcePolicy.healPriorityPolicy,
          identificationPolicy: "powder",
          collectEncounterIdentities: true,
          collectStage15Diagnostics: true
        },
        workshop: baseScenario.workshop,
        collectEquipmentTelemetry: true
      });
      rowsByPolicy[combatPolicy].push(compactRun(result, { policy: combatPolicy, runIndex, worldSeed }));
    }
  }
  const policySummaries = Object.fromEntries(selected.map(policy => [policy, aggregatePolicy(rowsByPolicy[policy])]));
  return {
    schemaVersion: SCHEMA_VERSION,
    measurement: {
      issue: 990,
      phase: 3,
      stage: 2,
      runnerVersion: RUNNER_VERSION,
      sourceCommit: provenance?.sourceCommit || null,
      mainBaselineSha: provenance?.baseCommit || null,
      measurementRunnerDiffSha256: provenance?.measurementRunnerDiffSha256 || null,
      environmentSignature,
      configuration: {
        seed,
        runs,
        policies: selected,
        className: "Mage",
        startFloor: 1,
        targetDepth: TARGET_DEPTH,
        floors: FLOORS,
        routePolicy: "partial_information_exploration",
        equipmentUpdatePolicy: "deterministic_greedy",
        forcedPush: true,
        retreatModeled: false,
        runnerPath: "scratch/measurements/issue990_phase3_stage2_combat_personas.js"
      },
      seedPolicy: `runIndex i uses ${seed}:world:i for every combat policy; only combat policy input differs`,
      worldSeedTemplate: `${seed}:world:{runIndex}`,
      productionBalanceChanged: false,
      productionCombatSelectorChanged: false,
      N: runs,
      seed
    },
    policyDefinitions: selected.map(id => ({
      id,
      label: id === "balanced-combat" ? "current Stage 1.5 selector" : id === "mp-conserving" ? "current-state threat gate, physical attack by default" : "highest currently payable damage spell"
    })),
    commonScenario: {
      className: "Mage",
      startFloor: 1,
      exploration: "balanced Stage 1.5 equivalent partial-information exploration",
      equipment: "balanced deterministic greedy scoring",
      recovery: "balanced potion thresholds and production recovery",
      forcedPush: true,
      retreat: false
    },
    modeledSystems: ["production map generation and movement", "production partial-information exploration and secret search", "production encounter generation", "production combat round/enemy behavior", "measurement-only combat policy selector", "production loot/equipment/Core/Support/curse/unidentified rules", "production HP/MP carry-over, camp, transition recovery, milestone boss", "#983 exclusive death categories"],
    omittedSystems: ["real-player behavior distribution", "checkpoint continuation/resampling", "future simulation/oracle/RL", "retreat judgment", "full raw encounter history"],
    policyBehaviorAudit: validatePolicyFixture(),
    policies: policySummaries,
    comparison: { personaPairs: pairComparison(rowsByPolicy) },
    audit: {
      hiddenStairsUsed: false,
      hiddenBossUsed: false,
      hiddenSecretDoorUsed: false,
      futureEncounterInfoUsed: false,
      futureLootUsed: false,
      unidentifiedHiddenAffixUsed: false,
      futureCombatInfoUsed: false,
      retreatDecisionUsed: false,
      forcedPush: true,
      rawEncounterHistoryStored: false,
      productionBalanceChanged: false,
      productionCombatSelectorChanged: false,
      deathCategories: [...DEATH_CATEGORIES],
      deathCategoryContract: "every death receives exactly one exclusive category; mechanic-mediated requires state-degradation evidence from production causal classifier"
    }
  };
}

function renderFloorTable(report) {
  const lines = ["## Table A — Floor survival", "", "`reached next floor` is the old `survived` count; it means the run completed this floor and entered the next one. `incomplete` means neither death nor next-floor reach.", "", "| policy | floor | entered | reached next floor | died | incomplete | next-floor reach | incomplete reasons |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |"];
  for (const policy of report.measurement.configuration.policies) {
    for (const floor of report.measurement.configuration.floors) {
      const value = report.policies[policy].floors[String(floor)];
      const reasons = Object.entries(value.incompleteReasons).filter(([, count]) => count).map(([reason, count]) => `${reason}:${count}`).join(", ") || "none";
      lines.push(`| ${policy} | B${floor} | ${value.entered} | ${value.reachedNextFloor} | ${value.died} | ${value.incomplete} | ${percent(value.nextFloorReachRate)} | ${reasons} |`);
    }
  }
  return lines;
}

function renderSummary(report) {
  const policies = report.measurement.configuration.policies;
  const lines = [
    "# Issue #990 Phase 3 Stage 2 — combat policy sensitivity",
    "",
    `- runner: \`${RUNNER_VERSION}\` / schema \`${SCHEMA_VERSION}\``,
    `- seed: \`${report.measurement.configuration.seed}\`; N: **${report.measurement.configuration.runs} / policy**`,
    "- production-backed, B1-start, same-seed, forced-push; retreat behavior is not modeled",
    "",
    "These are measurement policies, not claims about human player behavior. Combat policy is the independent variable; exploration, equipment, recovery, and identification are fixed to the balanced Stage 1.5-equivalent baseline.",
    "Production combat behavior was not changed. The balanced policy delegates to the existing Stage 1.5 Mage selector; mp-conserving and burst are simulation-only selectors receiving only current combat state.",
    "",
    ...renderFloorTable(report),
    "",
    "## Table B — HP/MP progression",
    "",
    "| policy | floor | entry HP% | exit HP% | entry MP% | exit MP% | MP spent | MP recovered | damage taken | healing |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...policies.flatMap(policy => report.measurement.configuration.floors.map(floor => { const value = report.policies[policy].floors[String(floor)]; return `| ${policy} | B${floor} | ${percent(value.entry.hpRatio.mean)} | ${percent(value.exit.hpRatio.mean)} | ${percent(value.entry.mpRatio.mean)} | ${percent(value.exit.mpRatio.mean)} | ${fmt(value.mpSpent)} | ${fmt(value.mpRecovered)} | ${fmt(value.damageTaken)} | ${fmt(value.healing)} |`; })),
    "",
    "## Table C — Combat actions",
    "",
    "| policy | floor | encounters | spell casts | normal attacks | item actions | rounds | enemy actions | normal hits | normal damage | insufficient MP decisions |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...policies.flatMap(policy => report.measurement.configuration.floors.map(floor => { const value = report.policies[policy].floors[String(floor)]; return `| ${policy} | B${floor} | ${value.encounters} | ${value.spellCasts} | ${value.normalAttacks} | ${value.itemActions} | ${value.rounds} | ${value.enemyActions} | ${value.normalHits} | ${value.normalDamage} | ${value.insufficientMpDecisions} |`; })),
    "",
    "## Table D — Spell usage",
    "",
    "| policy | spell ID | casts | successful | total MP spent | cast share |",
    "| --- | --- | ---: | ---: | ---: | ---: |",
    ...policies.flatMap(policy => Object.values(report.policies[policy].spellUsage).map(value => `| ${policy} | ${value.spellId} | ${value.castCount} | ${value.successfulCasts} | ${value.totalMpSpent} | ${percent(value.castShare)} |`)),
    "",
    "## Table E — Combat-entry MP bucket",
    "",
    "| policy | bucket | encounters | clear | death | pure raw death | rounds | enemy actions | normal hits | normal damage | spell casts | normal attacks |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...policies.flatMap(policy => Object.entries(report.policies[policy].mpBuckets).map(([bucket, value]) => `| ${policy} | ${bucket} | ${value.encounters} | ${percent(value.clearRate)} | ${percent(value.deathRate)} | ${percent(value.pureRawDeathRate)} | ${fmt(value.meanRounds)} | ${fmt(value.meanEnemyActions)} | ${fmt(value.meanNormalHits)} | ${fmt(value.meanNormalDamage)} | ${fmt(value.spellCastsPerEncounter)} | ${fmt(value.normalAttacksPerEncounter)} |`)),
    "",
    "## Table F — Policy comparison",
    "",
    "| policy | mean reached depth | B5 | B6 | B10 | B15 | pure raw death share | B3 MP% | B4 MP% | B5 MP% | rounds/encounter | enemy actions/encounter | normal damage/encounter |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...policies.map(policy => { const value = report.policies[policy]; return `| ${policy} | ${fmt(value.reachedDepth.mean)} | ${percent(value.reach["5"].rate)} | ${percent(value.reach["6"].rate)} | ${percent(value.reach["10"].rate)} | ${percent(value.reach["15"].rate)} | ${percent(value.deathCategories.pure_raw_damage.rate)} | ${percent(value.floors["3"].entry.mpRatio.mean)} | ${percent(value.floors["4"].entry.mpRatio.mean)} | ${percent(value.floors["5"].entry.mpRatio.mean)} | ${fmt(value.perEncounter.rounds)} | ${fmt(value.perEncounter.enemyActions)} | ${fmt(value.perEncounter.normalDamage)} |`; }),
    "",
    "## Table G — Same-seed pair comparison",
    "",
    "| left | right | left deeper | same depth | right deeper | paired N | mean reached-depth delta (right-left) | mean final MP delta (right-left) |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...report.comparison.personaPairs.map(pair => `| ${pair.left} | ${pair.right} | ${pair.leftReachedDeeper} | ${pair.sameDepth} | ${pair.rightReachedDeeper} | ${pair.pairedRuns} | ${fmt(pair.deltas.reachedDepth.mean)} | ${fmt(pair.deltas.finalMpRate.mean)} |`),
    "",
    "## Death categories",
    "",
    "| policy | pure raw | mechanic-mediated | direct mechanic | unknown/mixed |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...policies.map(policy => { const value = report.policies[policy].deathCategories; return `| ${policy} | ${value.pure_raw_damage.count} (${percent(value.pure_raw_damage.rate)}) | ${value.mechanic_mediated_raw_lethal.count} (${percent(value.mechanic_mediated_raw_lethal.rate)}) | ${value.direct_mechanic_death.count} (${percent(value.direct_mechanic_death.rate)}) | ${value.unknown_or_mixed.count} (${percent(value.unknown_or_mixed.rate)}) |`; }),
    "",
    "## Interpretation",
    "",
    "- `entered = reached next floor + died + incomplete` is asserted for every observed policy × floor; incomplete reason totals are asserted to equal incomplete.",
    "- B1 onward uses partial-information exploration with the same balanced route baseline for every policy. Incomplete runs are not deaths and are reported separately.",
    "- Any association between low MP, longer combat, exposure, and pure-raw death is diagnostic rather than causal proof.",
    "- Stage 2 is measurement-only: no production balance, production combat selector, retreat behavior, or checkpoint resampling was changed.",
    "",
    "## Answers",
    "",
    "1. This experiment tests whether combat action selection alone changes natural reach; see Tables A/F and paired deltas.",
    "2. MP depletion floor is compared from the entry/exit progression in Table B; no artificial checkpoint continuation is used.",
    "3. mp-conserving uses physical attacks in low-risk current encounters; burst selects the highest currently payable damage spell. Fixture regression verifies the policies differ.",
    "4. The result does not claim human behavior; these are explainable measurement policies.",
    "5. If policy reach remains similar while incomplete dominates, exploration budget remains the controlling censoring mechanism.",
    "6. #973 Build Confidence remains **Revise**; #990 remains **open**; production tuning is **not recommended from this measurement alone**.",
    "",
    "## Reproduction",
    "",
    "```sh",
    `node scratch/measurements/issue990_phase3_stage2_combat_personas.js --runs ${report.measurement.configuration.runs} --seed ${report.measurement.configuration.seed} --policies ${policies.join(",")} --output evidence/results/issue-990-phase3-stage2.json --summary evidence/results/issue-990-phase3-stage2.md`,
    "```",
    ""
  ];
  return lines.join("\n");
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (["--runs", "--seed", "--policies", "--output", "--summary"].includes(arg)) options[arg.slice(2)] = argv[++index];
    else if (arg === "--help") { console.log("Usage: node scratch/measurements/issue990_phase3_stage2_combat_personas.js --runs 500 --seed issue990-phase3-stage1.5 --policies balanced-combat,mp-conserving,burst-combat --output evidence/results/issue-990-phase3-stage2.json --summary evidence/results/issue-990-phase3-stage2.md"); process.exit(0); }
    else throw new Error(`unknown option: ${arg}`);
  }
  return {
    runs: options.runs === undefined ? DEFAULT_RUNS : Number(options.runs),
    seed: options.seed || DEFAULT_SEED,
    policies: options.policies ? options.policies.split(",").map(value => value.trim()).filter(Boolean) : [...POLICIES],
    output: options.output || null,
    summary: options.summary || null
  };
}

export { runMeasurement, renderSummary };

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (!options.output || !options.summary) throw new Error("--output and --summary are required");
  const provenance = requireRunnerProvenance({
    fetchOriginMain: false,
    measurementRunnerPaths: ["scratch/measurements/issue990_phase3_stage2_combat_personas.js", "scratch/simulations/sim_depth_material_ev.js", "scratch/measurements/issue990_phase3_stage1.js", "scratch/measurements/measurement_provenance.js"]
  });
  const environmentSignature = printEnvSignatureBanner({ runnerVersion: RUNNER_VERSION, seed: options.seed, runs: options.runs, policies: options.policies, floors: FLOORS, targetDepth: TARGET_DEPTH }, { label: "issue990 phase3 stage2 env" });
  const report = runMeasurement({ ...options, provenance, environmentSignature });
  const outputPath = resolve(options.output);
  const summaryPath = resolve(options.summary);
  fs.mkdirSync(dirname(outputPath), { recursive: true });
  fs.mkdirSync(dirname(summaryPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report)}\n`);
  fs.writeFileSync(summaryPath, renderSummary(report));
  console.log(`Wrote Issue #990 Phase 3 Stage 2 JSON evidence: ${outputPath}`);
  console.log(`Wrote Issue #990 Phase 3 Stage 2 Markdown evidence: ${summaryPath}`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
