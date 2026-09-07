// sim-scope: run — production-backed fixed B1F composition × entry-resource diagnostic
/* global console, process */

import "../simulations/simulation_preflight.js";
import fs from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { requireRunnerProvenance } from "./measurement_provenance.js";
import { printEnvSignatureBanner, readSimScopeDeclaration } from "./measurement_env_signature.js";

export const RUNNER_VERSION = "issue1151-fixed-combat-composition-v1";
export const SCHEMA_VERSION = 1;
export const STARTING_KIT = "vanguard";
export const ENTRY_MP_RATIO = 1;
export const HP_BANDS = Object.freeze([
  Object.freeze({ id: "100", label: "HP 100%", ratio: 1 }),
  Object.freeze({ id: "75", label: "HP 75%", ratio: 0.75 }),
  Object.freeze({ id: "50", label: "HP 50%", ratio: 0.50 }),
  Object.freeze({ id: "25", label: "HP 25%", ratio: 0.25 })
]);
export const POLICIES = Object.freeze(["fight", "immediate-flee"]);
export const COMPOSITIONS = Object.freeze([
  Object.freeze({
    id: "high-kobold-scout-rusted-shield",
    risk: "high",
    names: Object.freeze(["コボルトの斥候", "錆びた盾兵"])
  }),
  Object.freeze({
    id: "high-kobold-scout-mad-slime",
    risk: "high",
    names: Object.freeze(["コボルトの斥候", "マッドスライム"])
  }),
  Object.freeze({
    id: "high-mad-slime-mud-curse-child",
    risk: "high",
    names: Object.freeze(["マッドスライム", "泥の呪い子"])
  }),
  Object.freeze({
    id: "low-swarm-rat-rusted-shield",
    risk: "low",
    names: Object.freeze(["群れネズミ", "錆びた盾兵"])
  }),
  Object.freeze({
    id: "low-biting-insect-split-slime",
    risk: "low",
    names: Object.freeze(["かみつき蟲", "分裂スライム"])
  }),
  Object.freeze({
    id: "low-mud-curse-child-gunpowder-bat",
    risk: "low",
    names: Object.freeze(["泥の呪い子", "火薬コウモリ"])
  })
]);

const RUNNER_PATH = "scratch/measurements/fixed_combat_composition_diagnostic.js";
const PRODUCTION_PATHS = Object.freeze([
  "scratch/simulations/sim_depth_material_ev.js",
  "src/state/initial_state.js",
  "src/data/monsters.js",
  "src/data/encounters.js",
  "src/combat_ui/encounter.js",
  "src/combat_logic/round.js",
  "src/combat_logic/monster_traits.js",
  "src/combat_logic/targeting.js",
  "src/combat_logic/damage.js"
]);
const DEFAULT_RUNS = 1000;
const DEFAULT_SEED = 1151;

const { resetSimulationRandom, simulateRun } =
  await import("../simulations/sim_depth_material_ev.js");

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

function summarize(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) {
    return { count: 0, average: null, p50: null, p95: null, min: null, max: null };
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
    p50: percentile(0.5),
    p95: percentile(0.95),
    min: sorted[0],
    max: sorted.at(-1)
  };
}

function wilson(successes, trials) {
  if (!trials) return null;
  const z = 1.96;
  const p = successes / trials;
  const denominator = 1 + (z * z) / trials;
  const centre = p + (z * z) / (2 * trials);
  const spread = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * trials)) / trials);
  return [(centre - spread) / denominator, (centre + spread) / denominator];
}

function increment(map, key, amount = 1) {
  map[key] = (map[key] || 0) + amount;
}

function createAccumulator(definition) {
  return {
    ...definition,
    outcomes: {},
    clear: 0,
    death: 0,
    rounds: distribution(),
    damageReceived: distribution(),
    hpAfterClear: distribution(),
    hpAfterCombat: distribution(),
    mpSpent: distribution(),
    mpAfter: distribution(),
    enemyActionCount: distribution(),
    firstPlayerActionExecutionTiming: {},
    fleeSelected: 0,
    fleeExecuted: 0,
    fleeSelectedButNotExecuted: 0,
    fleePartingAttackCount: 0,
    fleeSurvived: 0,
    fleeDiedFromPartingAttack: 0,
    partingAttackDamage: distribution(),
    guardAdjacentTriggers: 0,
    guardedCount: 0,
    splitOnDeathTriggers: 0,
    splitOnDeathSpawned: 0
  };
}

function observeResult(accumulator, result) {
  const identity = result.encounterIdentityLog?.[0];
  const diagnostic = result.diagnostics?.encounters?.[0];
  if (!identity || !diagnostic) throw new Error("fixed combat result omitted encounter diagnostics");
  const rounds = diagnostic.rounds || [];
  const selected = rounds.filter(round => round.fleeSelected).length;
  const executed = rounds.filter(round => round.fleeExecuted).length;
  const parting = rounds.filter(round => round.fleePartingAttack).length;
  const outcome = result.fixedCombatResult || identity.outcome;
  increment(accumulator.outcomes, outcome);
  accumulator.clear += Number(outcome === "victory");
  accumulator.death += Number(outcome === "death");
  accumulator.rounds.push(identity.rounds);
  accumulator.damageReceived.push(identity.totalNormalDamage);
  accumulator.hpAfterCombat.push(identity.hpAfter);
  if (outcome === "victory") accumulator.hpAfterClear.push(identity.hpAfter);
  accumulator.mpSpent.push(identity.mpSpent);
  accumulator.mpAfter.push(identity.mpAfter);
  accumulator.enemyActionCount.push(identity.enemyActions);
  accumulator.fleeSelected += selected;
  accumulator.fleeExecuted += executed;
  accumulator.fleeSelectedButNotExecuted += Math.max(0, selected - executed);
  accumulator.fleePartingAttackCount += parting;
  accumulator.fleeSurvived += Number(executed > 0 && outcome === "flee");
  accumulator.fleeDiedFromPartingAttack += Number(
    executed > 0 && parting > 0 && outcome === "death"
  );
  const firstTiming = rounds[0]?.playerActionExecutionTiming || "unobserved";
  increment(accumulator.firstPlayerActionExecutionTiming, firstTiming);
  for (const message of rounds.flatMap(round => round.log || [])) {
    if (message.includes("庇った！")) {
      accumulator.guardAdjacentTriggers++;
      accumulator.guardedCount++;
    }
    const split = message.match(/(\d+)体に分裂/);
    if (split) {
      accumulator.splitOnDeathTriggers++;
      accumulator.splitOnDeathSpawned += Number(split[1]);
    }
    const partingDamage = message.match(/追撃！.*?(\d+)のダメージ/);
    if (partingDamage) accumulator.partingAttackDamage.push(Number(partingDamage[1]));
  }
}

function finalizeAccumulator(accumulator, runs) {
  const clearRate = accumulator.clear / runs;
  const deathRate = accumulator.death / runs;
  return {
    compositionId: accumulator.compositionId,
    risk: accumulator.risk,
    monsterNames: [...accumulator.monsterNames],
    hpBandId: accumulator.hpBandId,
    entryHpRatio: accumulator.entryHpRatio,
    entryMpRatio: ENTRY_MP_RATIO,
    policy: accumulator.policy,
    runs,
    outcomes: { ...accumulator.outcomes },
    clearRate,
    clearRate95Ci: wilson(accumulator.clear, runs),
    deathRate,
    deathRate95Ci: wilson(accumulator.death, runs),
    rounds: summarize(accumulator.rounds),
    damageReceived: summarize(accumulator.damageReceived),
    hpAfterClear: summarize(accumulator.hpAfterClear),
    hpAfterCombat: summarize(accumulator.hpAfterCombat),
    mpSpent: summarize(accumulator.mpSpent),
    mpAfter: summarize(accumulator.mpAfter),
    enemyActionCount: summarize(accumulator.enemyActionCount),
    firstPlayerActionExecutionTiming: { ...accumulator.firstPlayerActionExecutionTiming },
    fleeSelected: accumulator.fleeSelected,
    fleeExecuted: accumulator.fleeExecuted,
    fleeSelectedButNotExecuted: accumulator.fleeSelectedButNotExecuted,
    fleePartingAttackCount: accumulator.fleePartingAttackCount,
    fleeSurvived: accumulator.fleeSurvived,
    fleeDiedFromPartingAttack: accumulator.fleeDiedFromPartingAttack,
    fleeSurvivalRate: accumulator.fleeExecuted > 0
      ? accumulator.fleeSurvived / accumulator.fleeExecuted
      : null,
    fleeSurvivalRate95Ci: wilson(accumulator.fleeSurvived, accumulator.fleeExecuted),
    partingAttackDamage: summarize(accumulator.partingAttackDamage),
    productionTraitFiring: {
      guardAdjacent: {
        triggers: accumulator.guardAdjacentTriggers,
        guardedCount: accumulator.guardedCount
      },
      splitOnDeath: {
        triggers: accumulator.splitOnDeathTriggers,
        spawnedCount: accumulator.splitOnDeathSpawned
      }
    }
  };
}

function createScenario(composition, hpBand, policy) {
  return {
    startingKit: STARTING_KIT,
    startingHealPotions: 0,
    startingGreaterHeals: 0,
    startingManaPotions: 0,
    startingHolyWater: 0,
    startingAntidotes: 0,
    startingGuardPotions: 0,
    departureCraft: [],
    ignoreWorkshopReturnItems: true,
    useTownPortal: false,
    allowChestTownPortal: false,
    collectEncounterIdentities: true,
    collectStage15Diagnostics: true,
    simDiagnosticLevel: "full",
    fleePolicy: policy === "fight" ? "never" : "visible-multi-enemy-flee",
    fleeHpThreshold: null,
    consumablesAtDeparture: "none",
    fixedCombat: {
      monsterNames: [...composition.names],
      entryHpRatio: hpBand.ratio,
      entryMpRatio: ENTRY_MP_RATIO
    }
  };
}

export async function runFixedCombatDiagnostic({
  runs = DEFAULT_RUNS,
  seed = DEFAULT_SEED,
  allowSmallRunCount = false
} = {}) {
  const normalizedRuns = positiveInteger(
    runs,
    "runs",
    allowSmallRunCount ? 1 : DEFAULT_RUNS
  );
  const normalizedSeed = positiveInteger(seed, "seed");
  resetSimulationRandom(normalizedSeed);
  const cases = [];
  for (const hpBand of HP_BANDS) {
    for (const composition of COMPOSITIONS) {
      for (const policy of POLICIES) {
        const accumulator = createAccumulator({
          compositionId: composition.id,
          risk: composition.risk,
          monsterNames: composition.names,
          hpBandId: hpBand.id,
          entryHpRatio: hpBand.ratio,
          policy
        });
        const scenario = createScenario(composition, hpBand, policy);
        for (let runIndex = 0; runIndex < normalizedRuns; runIndex++) {
          const worldSeed = `issue-1151:${normalizedSeed}:${hpBand.id}:${composition.id}:${runIndex}`;
          const result = simulateRun({
            className: "Fighter",
            startFloor: 1,
            targetDepth: 2,
            runIndex,
            seriesId: `issue-1151:${hpBand.id}:${composition.id}`,
            scoringProfile: null,
            scenario,
            workshop: { ranks: {} },
            worldSeed,
            collectDiagnostics: true
          });
          observeResult(accumulator, result);
        }
        cases.push(finalizeAccumulator(accumulator, normalizedRuns));
      }
    }
  }
  const contrasts = HP_BANDS.flatMap(hpBand => POLICIES.map(policy => {
    const selected = cases.filter(testCase =>
      testCase.hpBandId === hpBand.id && testCase.policy === policy
    );
    const highRisk = selected.filter(testCase => testCase.risk === "high");
    const lowRisk = selected.filter(testCase => testCase.risk === "low");
    return {
      hpBandId: hpBand.id,
      policy,
      highRiskCaseIds: highRisk.map(testCase => testCase.compositionId),
      lowRiskCaseIds: lowRisk.map(testCase => testCase.compositionId),
      highRiskAverageClearRate: highRisk.reduce((sum, testCase) => sum + testCase.clearRate, 0) / highRisk.length,
      lowRiskAverageClearRate: lowRisk.reduce((sum, testCase) => sum + testCase.clearRate, 0) / lowRisk.length,
      lowMinusHighClearRate: lowRisk.reduce((sum, testCase) => sum + testCase.clearRate, 0) / lowRisk.length -
        highRisk.reduce((sum, testCase) => sum + testCase.clearRate, 0) / highRisk.length
    };
  }));
  return {
    schemaVersion: SCHEMA_VERSION,
    runnerVersion: RUNNER_VERSION,
    question: "固定したvanguard開始状態・B1F敵2体編成で、composition × entry HP × fight/flee のCost差が分離するか",
    evidenceScope: "run",
    configuration: {
      startingKit: STARTING_KIT,
      floor: 1,
      initialMpRatio: ENTRY_MP_RATIO,
      hpBands: HP_BANDS.map(({ id, ratio }) => ({ id, ratio })),
      policyIds: [...POLICIES],
      compositionIds: COMPOSITIONS.map(composition => composition.id),
      runs: normalizedRuns,
      seed: normalizedSeed,
      seedPolicy: "matched policy-independent worldSeed per HP band × composition × run index",
      worldSeedTemplate: "issue-1151:{seed}:{hpBandId}:{compositionId}:{runIndex}",
      enemyDefinitions: "production MONSTERS + production depth scaling at B1F",
      combatResolver: "production runEncounter -> production runCombatRoundCalculation",
      fightActionPolicy: "production-auto",
      immediateFleeActionPolicy: "production visible-multi-enemy-flee -> run on first selectable action",
      omitted: [
        "production map traversal and encounter frequency",
        "loot/reward settlement after the isolated combat",
        "consumables (none at departure)"
      ]
    },
    compositions: COMPOSITIONS.map(composition => ({
      id: composition.id,
      risk: composition.risk,
      monsterNames: [...composition.names]
    })),
    cases,
    contrasts
  };
}

function buildReport(result, provenance, options) {
  const scope = readSimScopeDeclaration(import.meta.url)?.name || "run";
  const environmentHash = printEnvSignatureBanner({
    runnerVersion: RUNNER_VERSION,
    schemaVersion: SCHEMA_VERSION,
    seed: result.configuration.seed,
    runs: result.configuration.runs,
    startingKit: STARTING_KIT,
    hpBands: result.configuration.hpBands,
    policies: POLICIES,
    compositions: COMPOSITIONS.map(composition => composition.id)
  }, { label: "issue1151 fixed-combat env" });
  return {
    ...result,
    measurement: {
      scope,
      purpose: options.purpose || null,
      requestedRef: options.ref || null,
      sourceCommit: provenance?.sourceCommit || null,
      gameplaySourceCommit: provenance?.gameplaySourceCommit || null,
      measurementRunnerCommit: provenance?.measurementRunnerCommit || null,
      measurementRunnerPaths: provenance?.measurementRunnerPaths || [RUNNER_PATH, ...PRODUCTION_PATHS],
      measurementRunnerDiffSha256: provenance?.measurementRunnerDiffSha256 || null,
      originMainAncestor: provenance?.originMainAncestor ?? null,
      staleTreeAllowed: provenance?.staleTreeAllowed ?? null,
      workingTreeClean: provenance?.workingTreeClean ?? null,
      productionPaths: [...PRODUCTION_PATHS],
      environmentHash
    }
  };
}

function formatRate(rate) {
  return `${(rate * 100).toFixed(2)}%`;
}

function buildSummary(report) {
  const lines = [
    "# Fixed B1F composition diagnostic (#1151)",
    "",
    `- runner: \`${report.runnerVersion}\` / schema: ${report.schemaVersion}`,
    `- source SHA: \`${report.measurement.sourceCommit || "not recorded"}\``,
    `- starting state: ${STARTING_KIT}; entry MP 100%; HP bands 100/75/50/25%; N=${report.configuration.runs}`,
    `- seed: ${report.configuration.seed}; matched worldSeed is policy-independent`,
    "",
    "## Fixed composition × resource results",
    "",
    "| HP | Policy | Composition | Risk | Clear | Death | Flee executed/survived | Enemy actions p50 | Damage p50 |",
    "| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |"
  ];
  for (const testCase of report.cases) {
    lines.push(
      `| ${testCase.hpBandId}% | ${testCase.policy} | ${testCase.compositionId} | ${testCase.risk} | ` +
      `${formatRate(testCase.clearRate)} | ${formatRate(testCase.deathRate)} | ` +
      `${testCase.fleeExecuted}/${testCase.fleeSurvived} | ${testCase.enemyActionCount.p50 ?? "—"} | ` +
      `${testCase.damageReceived.p50 ?? "—"} |`
    );
  }
  lines.push(
    "",
    "## Contrast",
    "",
    "| HP | Policy | High-risk mean clear | Low-risk mean clear | Low − high |",
    "| --- | --- | ---: | ---: | ---: |",
    ...report.contrasts.map(contrast =>
      `| ${contrast.hpBandId}% | ${contrast.policy} | ${formatRate(contrast.highRiskAverageClearRate)} | ` +
      `${formatRate(contrast.lowRiskAverageClearRate)} | ${formatRate(contrast.lowMinusHighClearRate)} |`
    ),
    "",
    "## Fidelity and limits",
    "",
    "- Fixed pairs come from production monster definitions and B1F depth scaling; no diagnostic stat clones are used.",
    "- Fight and immediate-flee cases share matched, policy-independent seeds and use production combat/initiative/parting-attack semantics.",
    "- guardAdjacent and splitOnDeath observations are reported per case; absent firing is unobserved in small samples, not proof of impossibility.",
    "- This is a fixed-combat causal diagnostic, not a production encounter-frequency or player-policy estimate.",
    "",
    "## Provenance",
    "",
    `- production paths: ${report.measurement.productionPaths.join(", ")}`,
    `- environment hash: \`${report.measurement.environmentHash}\``
  );
  return `${lines.join("\n")}\n`;
}

function buildManifest(report, options) {
  return {
    schemaVersion: report.schemaVersion,
    status: "success",
    runner: report.runnerVersion,
    source: report.measurement,
    configuration: report.configuration,
    compositions: report.compositions,
    purpose: options.purpose || null,
    workflow: {
      repository: process.env.MEASUREMENT_REPOSITORY || null,
      runId: process.env.MEASUREMENT_WORKFLOW_RUN_ID || null,
      runUrl: process.env.MEASUREMENT_WORKFLOW_RUN_URL || null,
      requestedRef: options.ref || process.env.MEASUREMENT_REQUESTED_REF || null,
      generatedAt: new Date().toISOString()
    }
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const runs = positiveInteger(options.runs || DEFAULT_RUNS, "runs", DEFAULT_RUNS);
  const seed = positiveInteger(options.seed || DEFAULT_SEED, "seed");
  if (options["starting-kit"] && options["starting-kit"] !== STARTING_KIT) {
    throw new Error(`starting-kit must be ${STARTING_KIT}: ${options["starting-kit"]}`);
  }
  if (!options.output || !options.summary || !options.manifest) {
    throw new Error("--output, --summary, and --manifest are required");
  }
  const provenance = requireRunnerProvenance({
    fetchOriginMain: false,
    measurementRunnerPaths: [RUNNER_PATH, ...PRODUCTION_PATHS]
  });
  const result = await runFixedCombatDiagnostic({ runs, seed });
  const report = buildReport(result, provenance, options);
  fs.writeFileSync(resolve(options.output), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(resolve(options.summary), buildSummary(report));
  fs.writeFileSync(resolve(options.manifest), `${JSON.stringify(buildManifest(report, options), null, 2)}\n`);
  console.log(`Wrote Issue #1151 diagnostic: ${resolve(options.output)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
