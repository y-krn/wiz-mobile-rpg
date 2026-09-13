// sim-scope: run — production-backed B1F-B5F trap causal diagnostic
/* global console, process */

import "../simulations/simulation_preflight.js";
import fs from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { requireRunnerProvenance } from "./measurement_provenance.js";
import { printEnvSignatureBanner, readSimScopeDeclaration } from "./measurement_env_signature.js";

export const RUNNER_VERSION = "first-band-trap-diagnostic-v1";
export const SCHEMA_VERSION = 1;
export const DEFAULT_RUNS = 1000;
export const DEFAULT_SEED = 1233;
export const FIRST_BAND_TARGET_DEPTH = 6;

const RUNNER_PATH = "scratch/measurements/first_band_trap_diagnostic.js";
const MEASUREMENT_HELPER_PATH = "scratch/measurements/starting_kit_diagnostic.js";
const PRODUCTION_PATHS = Object.freeze([
  "scratch/simulations/sim_depth_material_ev.js",
  "scratch/measurements/starting_kit_diagnostic.js",
  "src/state/initial_state.js",
  "src/data/encounters.js",
  "src/data/floor_templates.js",
  "src/map_generator.js",
  "src/run_map_generator.js",
  "src/rules/chest_rules.js",
  "src/rules/trap_rules.js",
  "src/rules/trap_effect_rules.js",
  "src/chest/chest_domain.js",
  "src/movement.js",
  "src/combat_logic/round.js",
  "src/combat_logic/damage.js"
]);

const CONDITION_DEFINITIONS = Object.freeze([
  { id: "C0", label: "current production", scenario: {} },
  { id: "C1", label: "no floor or chest traps in B1F-B5F", scenario: {
    trapPolicy: "disabled",
    chestTrapPolicy: "disabled"
  } },
  { id: "C2", label: "no chest traps in B1F-B5F", scenario: {
    chestTrapPolicy: "disabled"
  } },
  { id: "C3", label: "no floor traps in B1F-B5F", scenario: {
    trapPolicy: "disabled",
    chestTrapPolicy: "legacy"
  } }
]);

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    options[key] = inlineValue ?? argv[++index];
  }
  return options;
}

function positiveInteger(value, label, minimum = 1) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(`${label} must be an integer >= ${minimum}: ${value}`);
  }
  return parsed;
}

function distribution() {
  return [];
}

function addDistribution(values, value) {
  if (Number.isFinite(value)) values.push(value);
}

function summarize(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) {
    return { count: 0, average: null, p25: null, p50: null, p75: null, p95: null, min: null, max: null };
  }
  const percentile = rate => {
    const position = (sorted.length - 1) * rate;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    return lower === upper
      ? sorted[lower]
      : sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  };
  return {
    count: sorted.length,
    average: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    p25: percentile(0.25),
    p50: percentile(0.50),
    p75: percentile(0.75),
    p95: percentile(0.95),
    min: sorted[0],
    max: sorted.at(-1)
  };
}

function increment(map, key, amount = 1) {
  const normalized = key ?? "unknown";
  map[normalized] = (map[normalized] || 0) + amount;
}

function addObject(target, source) {
  Object.entries(source || {}).forEach(([key, value]) => {
    target[key] = (target[key] || 0) + (Number(value) || 0);
  });
}

function firstEvent(events, predicate) {
  return events.find(predicate) || null;
}

function followUpDamage(rounds) {
  let count = 0;
  let damage = 0;
  rounds.forEach(round => {
    if (!round.fleePartingAttack) return;
    count++;
    (round.log || []).forEach(message => {
      const match = String(message).match(/追撃！.*?(\d+)のダメージ/);
      if (match) damage += Number(match[1]);
    });
  });
  return { count, damage };
}

function encounterRows(result) {
  const identities = result.encounterIdentityLog || [];
  const diagnostics = result.diagnostics?.encounters || [];
  return identities.map((identity, index) => ({
    ...identity,
    ...(diagnostics[index] || {}),
    ordinal: index + 1
  }));
}

function deathOrdinal(rows) {
  return rows.find(row => row.outcome === "death")?.ordinal ?? rows.length;
}

function eventPoint(event) {
  return event
    ? { floor: event.floor ?? null, steps: event.step ?? null, combatOrdinal: event.encounterOrdinal ?? null }
    : null;
}

function createAccumulator(runs) {
  return {
    runs,
    outcomes: {},
    deathFloors: {},
    deathEncounterOrdinal: {},
    deepestFloor: distribution(),
    steps: distribution(),
    combats: distribution(),
    combatDamageHp: distribution(),
    floorTrapDamageHp: distribution(),
    chestTrapDamageHp: distribution(),
    floorTrapMpDrain: distribution(),
    fleeFollowUpDamage: distribution(),
    trapActivationCounts: { floor: 0, chest: 0 },
    trapEncounterCounts: { floor: 0, chest: 0 },
    floorTrapActivationTypes: {},
    chestTrapActivationTypes: {},
    floorTrapAlarms: 0,
    floorTrapPitfalls: 0,
    chestTrapPoisonApplications: 0,
    chestTrapBlindApplications: 0,
    chestTrapTeleports: 0,
    fleeSelected: 0,
    fleeExecuted: 0,
    fleeFollowUpCount: 0,
    opportunities: {
      meaningfulLoot: { runs: 0, steps: distribution(), combatOrdinal: distribution(), deathsBefore: 0 },
      equipment: { runs: 0, steps: distribution(), combatOrdinal: distribution(), deathsBefore: 0 },
      buildChange: { runs: 0, steps: distribution(), combatOrdinal: distribution(), deathsBefore: 0 }
    },
    transition: {
      e1ToE2: { eligible: 0, survived: 0 },
      e2ToE3: { eligible: 0, survived: 0 }
    },
    deathCost: {
      deaths: 0,
      combatDamageHp: 0,
      floorTrapDamageHp: 0,
      chestTrapDamageHp: 0,
      poisonDamageHp: 0,
      floorTrapMpDrain: 0,
      fleeFollowUpDamage: 0
    },
    b2Arrivals: 0,
    b5Arrivals: 0,
    rows: []
  };
}

function observeOpportunity(record, event, died) {
  if (!event) {
    if (died) record.deathsBefore++;
    return;
  }
  record.runs++;
  addDistribution(record.steps, Number(event.step));
  addDistribution(record.combatOrdinal, Number(event.encounterOrdinal));
}

function finalizeOpportunity(record, runs, deaths) {
  return {
    runsWithOpportunity: record.runs,
    opportunityRate: record.runs / runs,
    firstStep: summarize(record.steps),
    firstCombatOrdinal: summarize(record.combatOrdinal),
    deathsBeforeOpportunity: record.deathsBefore,
    deathBeforeOpportunityRate: deaths > 0 ? record.deathsBefore / deaths : null
  };
}

function observeRun(acc, result, runIndex) {
  const rows = encounterRows(result);
  const rewards = result.diagnostics?.rewardEvents || [];
  const meaningfulLoot = firstEvent(rewards, event => event.meaningful === true);
  const equipment = firstEvent(rewards, event =>
    event.category === "equipment" && event.disposition === "bagged"
  );
  const buildChange = firstEvent(result.equipmentTelemetry || [], event => event.type === "swap");
  const died = result.outcome === "death";
  const allRounds = rows.flatMap(row => row.rounds || []);
  const followUp = followUpDamage(allRounds);
  const costEvents = result.diagnostics?.costEvents || [];

  increment(acc.outcomes, result.outcome);
  if (died) {
    increment(acc.deathFloors, result.deathFloor ?? "unknown");
    increment(acc.deathEncounterOrdinal, deathOrdinal(rows));
    acc.deathCost.deaths++;
  }
  addDistribution(acc.deepestFloor, result.reachedFloor);
  addDistribution(acc.steps, result.steps);
  addDistribution(acc.combats, rows.length);
  addDistribution(acc.combatDamageHp, result.combatDamageHp);
  addDistribution(acc.floorTrapDamageHp, result.trapDamageHpBySource?.floor || 0);
  addDistribution(acc.chestTrapDamageHp, result.trapDamageHpBySource?.chest || 0);
  addDistribution(acc.floorTrapMpDrain, result.trapMpDrain || 0);
  addDistribution(acc.fleeFollowUpDamage, followUp.damage);
  acc.trapActivationCounts.floor += result.trapActivationsBySource?.floor || 0;
  acc.trapActivationCounts.chest += result.trapActivationsBySource?.chest || 0;
  acc.trapEncounterCounts.floor += result.trapEncounterBySource?.floor || 0;
  acc.trapEncounterCounts.chest += result.trapEncounterBySource?.chest || 0;
  addObject(acc.floorTrapActivationTypes, Object.fromEntries(
    Object.entries(result.trapActivationsByType || {}).filter(([type]) =>
      ["damage", "mpDrain", "alarm", "pitfall"].includes(type)
    )
  ));
  addObject(acc.chestTrapActivationTypes, Object.fromEntries(
    Object.entries(result.trapActivationsByType || {}).filter(([type]) =>
      ["poison needle", "gas bomb", "teleporter", "flash bomb"].includes(type)
    )
  ));
  acc.floorTrapAlarms += result.trapActivationsByType?.alarm || 0;
  acc.floorTrapPitfalls += result.trapActivationsByType?.pitfall || 0;
  acc.chestTrapPoisonApplications += result.statusObservations?.byStatus?.poisoned?.applicationsBySource?.chest || 0;
  acc.chestTrapBlindApplications += result.statusObservations?.byStatus?.blind?.applicationsBySource?.chest || 0;
  acc.chestTrapTeleports += result.trapTeleports || 0;
  acc.fleeSelected += allRounds.filter(round => round.fleeSelected).length;
  acc.fleeExecuted += allRounds.filter(round => round.fleeExecuted).length;
  acc.fleeFollowUpCount += followUp.count;
  observeOpportunity(acc.opportunities.meaningfulLoot, meaningfulLoot, died);
  observeOpportunity(acc.opportunities.equipment, equipment, died);
  observeOpportunity(acc.opportunities.buildChange, buildChange, died);
  acc.transition.e1ToE2.eligible += Number(rows.length >= 1);
  acc.transition.e1ToE2.survived += Number(rows.length >= 2);
  acc.transition.e2ToE3.eligible += Number(rows.length >= 2);
  acc.transition.e2ToE3.survived += Number(rows.length >= 3);
  acc.b2Arrivals += Number(result.reachedFloor >= 2);
  acc.b5Arrivals += Number(result.reachedFloor >= 5);

  const deathCost = died ? {
    combatDamageHp: Number(result.combatDamageHp) || 0,
    floorTrapDamageHp: Number(result.trapDamageHpBySource?.floor) || 0,
    chestTrapDamageHp: Number(result.trapDamageHpBySource?.chest) || 0,
    poisonDamageHp: costEvents
      .filter(event => event.source === "poison")
      .reduce((sum, event) => sum + (Number(event.hpCost) || 0), 0),
    floorTrapMpDrain: Number(result.trapMpDrain) || 0,
    fleeFollowUpDamage: followUp.damage
  } : null;
  if (deathCost) {
    Object.entries(deathCost).forEach(([key, value]) => {
      acc.deathCost[key] += value;
    });
  }
  acc.rows.push({
    runIndex,
    outcome: result.outcome,
    reachedFloor: result.reachedFloor,
    deathFloor: result.deathFloor,
    deathEncounterOrdinal: died ? deathOrdinal(rows) : null,
    deathEncounterType: result.deathEncounterType,
    deathCause: result.runDiagnostics?.deathCause || null,
    firstMeaningfulLoot: eventPoint(meaningfulLoot),
    firstEquipment: eventPoint(equipment),
    firstBuildChange: eventPoint(buildChange),
    costBeforeDeath: deathCost
  });
}

function finalizeCondition(acc) {
  const deathCount = acc.outcomes.death || 0;
  const deathRate = deathCount / acc.runs;
  const finalizeTransition = transition => ({
    eligible: transition.eligible,
    survived: transition.survived,
    survivorRate: transition.eligible > 0 ? transition.survived / transition.eligible : null
  });
  const hpCostTotal = ["combatDamageHp", "floorTrapDamageHp", "chestTrapDamageHp", "poisonDamageHp", "fleeFollowUpDamage"]
    .reduce((sum, key) => sum + acc.deathCost[key], 0);
  return {
    runs: acc.runs,
    outcomes: { ...acc.outcomes },
    deathRate,
    deathFloors: { ...acc.deathFloors },
    deathEncounterOrdinal: { ...acc.deathEncounterOrdinal },
    deepestFloor: summarize(acc.deepestFloor),
    steps: summarize(acc.steps),
    combatCount: summarize(acc.combats),
    b2ArrivalRate: acc.b2Arrivals / acc.runs,
    b5ArrivalRate: acc.b5Arrivals / acc.runs,
    survivorTransitions: {
      e1ToE2: finalizeTransition(acc.transition.e1ToE2),
      e2ToE3: finalizeTransition(acc.transition.e2ToE3)
    },
    combatCost: {
      incomingDamageHp: summarize(acc.combatDamageHp),
      fleeFollowUp: {
        count: acc.fleeFollowUpCount,
        damageHp: summarize(acc.fleeFollowUpDamage),
        averageDamagePerRun: acc.fleeFollowUpDamage.reduce((sum, value) => sum + value, 0) / acc.runs
      },
      fleeSelected: acc.fleeSelected,
      fleeExecuted: acc.fleeExecuted
    },
    floorTrapCost: {
      encounters: acc.trapEncounterCounts.floor,
      activations: acc.trapActivationCounts.floor,
      damageHp: summarize(acc.floorTrapDamageHp),
      mpDrain: summarize(acc.floorTrapMpDrain),
      activationTypes: { ...acc.floorTrapActivationTypes },
      alarmActivations: acc.floorTrapAlarms,
      pitfallActivations: acc.floorTrapPitfalls
    },
    chestTrapCost: {
      encounters: acc.trapEncounterCounts.chest,
      activations: acc.trapActivationCounts.chest,
      damageHp: summarize(acc.chestTrapDamageHp),
      activationTypes: { ...acc.chestTrapActivationTypes },
      poisonApplications: acc.chestTrapPoisonApplications,
      blindApplications: acc.chestTrapBlindApplications,
      teleports: acc.chestTrapTeleports
    },
    opportunities: Object.fromEntries(
      Object.entries(acc.opportunities).map(([key, record]) => [
        key,
        finalizeOpportunity(record, acc.runs, deathCount)
      ])
    ),
    deathCostBeforeOpportunity: {
      deaths: acc.deathCost.deaths,
      sources: { ...acc.deathCost },
      hpSourceShares: {
        combat: hpCostTotal > 0 ? acc.deathCost.combatDamageHp / hpCostTotal : null,
        floorTrap: hpCostTotal > 0 ? acc.deathCost.floorTrapDamageHp / hpCostTotal : null,
        chestTrap: hpCostTotal > 0 ? acc.deathCost.chestTrapDamageHp / hpCostTotal : null,
        poison: hpCostTotal > 0 ? acc.deathCost.poisonDamageHp / hpCostTotal : null,
        fleeFollowUp: hpCostTotal > 0 ? acc.deathCost.fleeFollowUpDamage / hpCostTotal : null
      }
    },
    conditionRows: acc.rows
  };
}

export async function runMeasurement({ runs = DEFAULT_RUNS, seed = DEFAULT_SEED } = {}) {
  const normalizedRuns = positiveInteger(runs, "runs");
  const normalizedSeed = positiveInteger(seed, "seed");
  process.env.SIM_SEED = String(normalizedSeed);
  const { createDiagnosticScenario, getDiagnosticWorldSeed } =
    await import("./starting_kit_diagnostic.js");
  const { simulateRun, resetSimulationRandom } =
    await import("../simulations/sim_depth_material_ev.js");
  const conditions = {};
  for (const definition of CONDITION_DEFINITIONS) {
    resetSimulationRandom(normalizedSeed);
    const scenario = {
      ...createDiagnosticScenario({
        startingKit: "vanguard",
        policy: "fight",
        recoveryPolicy: "production",
        fleeHpThreshold: 0.2
      }),
      ...definition.scenario
    };
    const acc = createAccumulator(normalizedRuns);
    for (let runIndex = 0; runIndex < normalizedRuns; runIndex++) {
      const result = simulateRun({
        className: "Fighter",
        startFloor: 1,
        targetDepth: FIRST_BAND_TARGET_DEPTH,
        runIndex,
        seriesId: "issue-1233:first-band",
        scoringProfile: null,
        scenario,
        workshop: { ranks: {} },
        worldSeed: getDiagnosticWorldSeed(normalizedSeed, runIndex),
        collectDiagnostics: true,
        collectEquipmentTelemetry: true
      });
      observeRun(acc, result, runIndex);
    }
    conditions[definition.id] = {
      id: definition.id,
      label: definition.label,
      trapPolicy: scenario.trapPolicy || "production-default",
      chestTrapPolicy: scenario.chestTrapPolicy || "production-default",
      result: finalizeCondition(acc)
    };
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    runnerVersion: RUNNER_VERSION,
    measurement: {
      scope: readSimScopeDeclaration(import.meta.url)?.name || "run",
      sourceCommit: null,
      baselineRef: "origin/main",
      targetDepth: FIRST_BAND_TARGET_DEPTH,
      band: "B1F-B5F",
      startingKit: "vanguard",
      policy: "fight",
      workshop: { ranks: {} },
      consumablesAtDeparture: "none",
      departureCraft: "none",
      matchedWorldSeedTemplate: "issue-1176:{seed}:{runIndex}",
      seed: normalizedSeed,
      runs: normalizedRuns,
      conditions: CONDITION_DEFINITIONS.map(({ id, label }) => ({ id, label }))
    },
    conditions
  };
}

function buildSummary(report) {
  const lines = [
    "# Issue #1233 first-band trap causal measurement",
    "",
    `- runner: \`${report.runnerVersion}\` / schema: ${report.schemaVersion}`,
    `- source SHA: \`${report.measurement.sourceCommit || "not recorded"}\``,
    `- baseline: \`${report.measurement.baselineRef}\`; seed: ${report.measurement.seed}; N=${report.measurement.runs}/condition`,
    `- primary: fresh vanguard / Workshopなし / 持込回復なし / departure craftなし / fight policy / ${report.measurement.band}`,
    "- C1 is an upper-bound probe, not a production recommendation.",
    ""
  ];
  for (const condition of Object.values(report.conditions)) {
    const result = condition.result;
    lines.push(`## ${condition.id} — ${condition.label}`, "");
    lines.push(
      `- death ${result.deathRate}; B2 arrival ${result.b2ArrivalRate}; B5 arrival ${result.b5ArrivalRate}`,
      `- death floor ${JSON.stringify(result.deathFloors)}; death encounter ordinal ${JSON.stringify(result.deathEncounterOrdinal)}`,
      `- E1→E2 survivor ${JSON.stringify(result.survivorTransitions.e1ToE2)}; E2→E3 survivor ${JSON.stringify(result.survivorTransitions.e2ToE3)}`,
      `- combat damage HP p50 ${result.combatCost.incomingDamageHp.p50}; flee selected/executed/follow-up ${result.combatCost.fleeSelected}/${result.combatCost.fleeExecuted}/${result.combatCost.fleeFollowUp.count} (${result.combatCost.fleeFollowUp.damageHp.average} HP average/run)`,
      `- floor trap encounters/activations/damage HP/MP drain/alarm/pitfall ${result.floorTrapCost.encounters}/${result.floorTrapCost.activations}/${result.floorTrapCost.damageHp.average}/${result.floorTrapCost.mpDrain.average}/${result.floorTrapCost.alarmActivations}/${result.floorTrapCost.pitfallActivations}`,
      `- chest trap encounters/activations/damage HP/poison/blind/teleport ${result.chestTrapCost.encounters}/${result.chestTrapCost.activations}/${result.chestTrapCost.damageHp.average}/${result.chestTrapCost.poisonApplications}/${result.chestTrapCost.blindApplications}/${result.chestTrapCost.teleports}`,
      `- first meaningful loot ${JSON.stringify(result.opportunities.meaningfulLoot)}; first equipment ${JSON.stringify(result.opportunities.equipment)}; first Build change ${JSON.stringify(result.opportunities.buildChange)}`,
      `- death cost before opportunity ${JSON.stringify(result.deathCostBeforeOpportunity)}`,
      ""
    );
  }
  lines.push(
    "## Scope and limitations",
    "",
    "- C0-C3 share the same deterministic worldSeed per runIndex; only the requested floor/chest trap policy differs.",
    "- C1/C2/C3 use the existing simulator policy switches while targetDepth=6, so their disabled scope is B1F-B5F only in this measurement.",
    "- Combat, recovery, starting gear, loot generation, and object-loot settlement are not altered by the counterfactuals.",
    "- Trap activation type counts are activation observations; a zero in a condition means the path was disabled or unobserved, not that the production rule is absent.",
    "- Retry-hypothesis formation remains a manual player-visible gate and is not inferred from rates."
  );
  return `${lines.join("\n")}\n`;
}

function buildReport(report, provenance, seed, runs) {
  const environment = {
    scope: report.measurement.scope,
    runnerVersion: RUNNER_VERSION,
    schemaVersion: SCHEMA_VERSION,
    node: process.version,
    seed,
    runs,
    band: report.measurement.band,
    targetDepth: FIRST_BAND_TARGET_DEPTH
  };
  const environmentHash = printEnvSignatureBanner(environment, { label: "issue1233" });
  return {
    ...report,
    measurement: {
      ...report.measurement,
      ...provenance,
      sourceCommit: provenance?.sourceCommit || null,
      productionPaths: [...PRODUCTION_PATHS],
      measurementRunnerPaths: provenance?.measurementRunnerPaths || [RUNNER_PATH, MEASUREMENT_HELPER_PATH, ...PRODUCTION_PATHS],
      environmentHash
    }
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const runs = positiveInteger(options.runs || DEFAULT_RUNS, "runs");
  const seed = positiveInteger(options.seed || DEFAULT_SEED, "seed");
  if (!options.output || !options.summary || !options.manifest) {
    throw new Error("--output, --summary, and --manifest are required");
  }
  const provenance = requireRunnerProvenance({
    fetchOriginMain: false,
    measurementRunnerPaths: [RUNNER_PATH, MEASUREMENT_HELPER_PATH, ...PRODUCTION_PATHS]
  });
  const report = buildReport(await runMeasurement({ runs, seed }), provenance, seed, runs);
  fs.writeFileSync(resolve(options.output), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(resolve(options.summary), buildSummary(report));
  fs.writeFileSync(resolve(options.manifest), `${JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    status: "success",
    runner: RUNNER_VERSION,
    source: report.measurement,
    configuration: report.measurement,
    workflow: { requestedRef: options.ref || "origin/main", purpose: options.purpose || null }
  }, null, 2)}\n`);
  console.log(`Wrote Issue #1233 first-band trap measurement: ${resolve(options.output)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
