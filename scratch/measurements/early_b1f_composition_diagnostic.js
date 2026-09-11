// sim-scope: run — production-backed B1F composition pool, ordering, and cadence comparison
/* global console, process */

import "../simulations/simulation_preflight.js";
import fs from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  getEncounterPoolForFloor,
  getEncounterSizeWeightsForFloor,
  MONSTERS
} from "../../src/data.js";
import { isEncounterCompositionAllowed } from "../../src/rules/encounter_rules.js";
import { requireRunnerProvenance } from "./measurement_provenance.js";
import { printEnvSignatureBanner, readSimScopeDeclaration } from "./measurement_env_signature.js";
import { runDiagnostic } from "./starting_kit_diagnostic.js";
import { runFixedCombatDiagnostic } from "./fixed_combat_composition_diagnostic.js";

export const RUNNER_VERSION = "issue1192-early-b1f-composition-v2";
export const SCHEMA_VERSION = 2;
export const DEFAULT_RUNS = 1000;
export const DEFAULT_FIXED_RUNS = 1000;
export const DEFAULT_SEED = 2192;
export const DEFAULT_SELECTION_RUNS = 5000;
export const DEFAULT_SELECTION_SEED = 1192;
export const DEFAULT_FIXED_SEED = 1151;
export const CANDIDATE_IDS = Object.freeze([
  "baseline",
  "cadence-first-single",
  "composition-pool-redistribution",
  "ordering-defer"
]);

const RUNNER_PATH = "scratch/measurements/early_b1f_composition_diagnostic.js";
const PRODUCTION_PATHS = Object.freeze([
  "scratch/simulations/sim_depth_material_ev.js",
  "scratch/measurements/starting_kit_diagnostic.js",
  "scratch/measurements/fixed_combat_composition_diagnostic.js",
  "src/data/encounters.js",
  "src/rules/encounter_rules.js",
  "src/combat_ui/encounter.js",
  "src/combat_logic/round.js",
  "src/combat_logic/targeting.js",
  "src/combat_logic/damage.js"
]);

function positiveInteger(value, label, minimum = 1) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(`${label} must be an integer >= ${minimum}: ${value}`);
  }
  return parsed;
}

function compositionKey(names) {
  return names.map(name => String(name).replace(/\s[A-Z]$/, "")).sort().join(" + ");
}

function pairId(index) {
  return `b1f-pair-${String(index + 1).padStart(2, "0")}`;
}

function summarize(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) return { count: 0, p50: null, p95: null, average: null };
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
    p50: percentile(0.5),
    p95: percentile(0.95),
    average: sorted.reduce((sum, value) => sum + value, 0) / sorted.length
  };
}

function enumerateLegalPairs(floor = 1) {
  const names = [...new Set(getEncounterPoolForFloor(floor))];
  const templates = names.map(name => MONSTERS.find(monster => monster.name === name)).filter(Boolean);
  const pairs = [];
  for (let left = 0; left < templates.length; left++) {
    for (let right = left; right < templates.length; right++) {
      const monsterNames = [templates[left].name, templates[right].name];
      if (!isEncounterCompositionAllowed(
        [templates[left], templates[right]],
        2
      )) continue;
      pairs.push({
        id: pairId(pairs.length),
        names: monsterNames,
        key: compositionKey(monsterNames)
      });
    }
  }
  return pairs;
}

function buildProductionPairDistribution(surface, floor = 1) {
  const poolTemplates = getEncounterPoolForFloor(floor)
    .map(name => MONSTERS.find(monster => monster.name === name))
    .filter(Boolean);
  const weights = new Map();
  for (const firstTemplate of poolTemplates) {
    const candidates = poolTemplates.filter(template =>
      isEncounterCompositionAllowed([firstTemplate, template], 2)
    );
    for (const secondTemplate of candidates) {
      const key = compositionKey([firstTemplate.name, secondTemplate.name]);
      const probability = 1 / poolTemplates.length / candidates.length;
      weights.set(key, (weights.get(key) || 0) + probability);
    }
  }
  return surface.map(pair => ({
    key: pair.key,
    names: [...pair.names],
    weight: weights.get(pair.key) || 0
  }));
}

function summarizeRiskDistribution(values) {
  const summary = summarize(values);
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  return {
    ...summary,
    p75: sorted.length > 0 ? sorted[Math.floor((sorted.length - 1) * 0.75)] : null,
    p90: sorted.length > 0 ? sorted[Math.floor((sorted.length - 1) * 0.90)] : null,
    p99: sorted.length > 0 ? sorted[Math.floor((sorted.length - 1) * 0.99)] : null,
    max: sorted.length > 0 ? sorted.at(-1) : null,
    atLeast50Percent: sorted.filter(value => value >= 0.5).length,
    atLeast75Percent: sorted.filter(value => value >= 0.75).length,
    atLeast90Percent: sorted.filter(value => value >= 0.9).length
  };
}

function summarizeFixedRiskDistribution(fixed, surface) {
  const byId = new Map(surface.map(pair => [pair.id, pair]));
  const groups = {};
  for (const hpBandId of ["100", "75", "50", "25"]) {
    for (const policy of ["fight", "immediate-flee"]) {
      const values = fixed.cases
        .filter(testCase => testCase.hpBandId === hpBandId && testCase.policy === policy)
        .map(testCase => testCase.deathRate)
        .filter(Number.isFinite);
      groups[`${hpBandId}:${policy}`] = {
        compositionCount: values.length,
        risk: summarizeRiskDistribution(values),
        highestRiskPairs: fixed.cases
          .filter(testCase => testCase.hpBandId === hpBandId && testCase.policy === policy)
          .sort((left, right) => right.deathRate - left.deathRate || left.compositionId.localeCompare(right.compositionId))
          .slice(0, 5)
          .map(testCase => ({
            compositionKey: byId.get(testCase.compositionId)?.key || testCase.compositionId,
            deathRate: testCase.deathRate
          }))
      };
    }
  }
  return groups;
}

function indexFixedCases(fixed, surface) {
  const byId = new Map(surface.map(pair => [pair.id, pair]));
  return new Map(
    fixed.cases
      .filter(testCase => testCase.hpBandId === "100" && testCase.policy === "fight")
      .map(testCase => [byId.get(testCase.compositionId)?.key, testCase])
      .filter(([key]) => key)
  );
}

function deriveCandidateProfile(selectionBaseline, fixed, surface, { selectionSeed } = {}) {
  const fixedByKey = indexFixedCases(fixed, surface);
  const rows = selectionBaseline.encounterExposure.encounterRows.filter(row =>
    row.encounterOrdinal <= 2 && row.rawInitialVisibleEnemyCount >= 2
  );
  const observed = new Map();
  for (const row of rows) {
    const key = row.generatedCompositionKey || row.initialCompositionKey;
    const current = observed.get(key) || {
      key,
      encounters: 0,
      deaths: 0,
      entryHpRates: [],
      normalDamages: []
    };
    current.encounters++;
    current.deaths += Number(row.outcome === "death");
    if (Number.isFinite(row.hpRateBeforeEncounter)) current.entryHpRates.push(row.hpRateBeforeEncounter);
    if (Number.isFinite(row.normalDamage)) current.normalDamages.push(row.normalDamage);
    observed.set(key, current);
  }
  const scored = [...observed.values()].map(row => {
    const fixedHp100FightDeathRate = fixedByKey.get(row.key)?.deathRate ?? null;
    const averageEntryHpRate = summarize(row.entryHpRates).average;
    const entryHpRiskMultiplier = Number.isFinite(averageEntryHpRate)
      ? 2 - averageEntryHpRate
      : 1;
    return {
      ...row,
      fixedHp100FightDeathRate,
      averageEntryHpRate,
      averageNormalDamage: summarize(row.normalDamages).average,
      riskExposureScore: Number.isFinite(fixedHp100FightDeathRate)
        ? row.encounters * fixedHp100FightDeathRate * entryHpRiskMultiplier
        : 0
    };
  });
  const ranked = scored
    .filter(row => row.deaths > 0 && row.fixedHp100FightDeathRate !== null)
    .sort((left, right) =>
      right.riskExposureScore - left.riskExposureScore ||
      right.fixedHp100FightDeathRate - left.fixedHp100FightDeathRate ||
      left.key.localeCompare(right.key)
    );
  const fallback = [...observed.values()].sort(
    (left, right) => right.encounters - left.encounters || left.key.localeCompare(right.key)
  );
  const targets = (ranked.length > 0 ? ranked : fallback).slice(0, 3);
  if (targets.length === 0) {
    throw new Error("baseline did not observe a pair in encounter ordinal 1/2");
  }

  const targetKeys = new Set(targets.map(target => target.key));
  const productionPairDistribution = buildProductionPairDistribution(surface);
  const replacementPairs = productionPairDistribution.filter(pair =>
    !targetKeys.has(pair.key) && pair.weight > 0
  );
  if (replacementPairs.length === 0) throw new Error("no legal residual production pair remains outside target set");
  return {
    selection: {
      seed: selectionSeed ?? null,
      runs: selectionBaseline.runs,
      method: "fixed HP100 fight death rate × early pair exposure × (2 - average entry HP rate)",
      source: "holdout profile selection; candidate effects are measured on a separate evaluation seed"
    },
    targetCompositionKeys: targets.map(target => target.key),
    targetEvidence: targets.map(target => ({
      compositionKey: target.key,
      earlyEncounters: target.encounters,
      earlyDeaths: target.deaths,
      earlyDeathRate: target.encounters > 0 ? target.deaths / target.encounters : null,
      averageEntryHpRate: target.averageEntryHpRate ?? null,
      averageNormalDamage: target.averageNormalDamage ?? null,
      fixedHp100FightDeathRate: target.fixedHp100FightDeathRate,
      riskExposureScore: target.riskExposureScore
    })),
    productionPairDistribution,
    replacementPairs,
    replacementMass: replacementPairs.reduce((sum, pair) => sum + pair.weight, 0),
    targetMass: productionPairDistribution
      .filter(pair => targetKeys.has(pair.key))
      .reduce((sum, pair) => sum + pair.weight, 0)
  };
}

function candidateFor(kind, profile) {
  if (kind === "baseline" || kind === "cadence-first-single") return null;
  return {
    id: kind,
    kind: kind === "composition-pool-redistribution" ? "pool-redistribution" : "ordering-defer",
    targetCompositionKeys: profile.targetCompositionKeys,
    replacementPairs: profile.replacementPairs
  };
}

function summarizeEncounterRows(result, runs) {
  const rows = result.encounterExposure.encounterRows.filter(row => row.encounterOrdinal <= 2);
  const byOrdinal = {};
  for (const ordinal of [1, 2]) {
    const ordinalRows = rows.filter(row => row.encounterOrdinal === ordinal);
    byOrdinal[String(ordinal)] = {};
    for (const group of ["all", "single", "pair"]) {
      const selected = ordinalRows.filter(row =>
        group === "all" || (group === "single"
          ? row.rawInitialVisibleEnemyCount === 1
          : row.rawInitialVisibleEnemyCount >= 2)
      );
      const runExposure = new Set(selected.map(row => row.runIndex)).size;
      byOrdinal[String(ordinal)][group] = {
        encounters: selected.length,
        runExposure,
        exposureRate: runExposure / runs,
        deaths: selected.filter(row => row.outcome === "death").length,
        deathRate: selected.length > 0
          ? selected.filter(row => row.outcome === "death").length / selected.length
          : null,
        entryHpRate: summarize(selected.map(row => row.hpRateBeforeEncounter)),
        normalDamage: summarize(selected.map(row => row.normalDamage)),
        survivorPostCombatHp: summarize(selected
          .filter(row => row.outcome === "clear")
          .map(row => row.hpAfterEncounter)),
        firstActionNotExecuted: selected.filter(row => !row.firstPlayerActionExecuted).length,
        firstActionNotExecutedRate: selected.length > 0
          ? selected.filter(row => !row.firstPlayerActionExecuted).length / selected.length
          : null
      };
    }
    const generatedPairRows = ordinalRows.filter(row => row.rawInitialVisibleEnemyCount >= 2);
    const effectivePairRows = ordinalRows.filter(row => row.initialVisibleEnemyCount >= 2);
    byOrdinal[String(ordinal)].generatedPairExposureRate = new Set(
      generatedPairRows.map(row => row.runIndex)
    ).size / runs;
    byOrdinal[String(ordinal)].effectivePairExposureRate = new Set(
      effectivePairRows.map(row => row.runIndex)
    ).size / runs;
    byOrdinal[String(ordinal)].generatedPairEncounters = generatedPairRows.length;
    byOrdinal[String(ordinal)].effectivePairEncounters = effectivePairRows.length;
  }
  byOrdinal["1"].nextEntryHpRate = byOrdinal["2"].all.entryHpRate;
  byOrdinal["2"].nextEntryHpRate = null;

  const compositionCounts = new Map();
  for (const row of rows) {
    const key = row.effectiveCompositionKey || row.initialCompositionKey;
    const current = compositionCounts.get(key) || { compositionKey: key, encounters: 0, deaths: 0 };
    current.encounters++;
    current.deaths += Number(row.outcome === "death");
    compositionCounts.set(key, current);
  }
  const compositionIdentity = [...compositionCounts.values()]
    .sort((left, right) => right.encounters - left.encounters || left.compositionKey.localeCompare(right.compositionKey))
    .slice(0, 10);
  const pairCompositionCounts = new Map();
  for (const row of rows.filter(candidate => candidate.initialVisibleEnemyCount >= 2)) {
    const key = row.effectiveCompositionKey || row.initialCompositionKey;
    const current = pairCompositionCounts.get(key) || { compositionKey: key, encounters: 0, deaths: 0 };
    current.encounters++;
    current.deaths += Number(row.outcome === "death");
    pairCompositionCounts.set(key, current);
  }
  const pairCompositionIdentity = [...pairCompositionCounts.values()]
    .sort((left, right) => right.encounters - left.encounters || left.compositionKey.localeCompare(right.compositionKey))
    .slice(0, 10);
  const pairEncounterTotal = [...pairCompositionCounts.values()]
    .reduce((sum, row) => sum + row.encounters, 0);
  const pairCompositionDistribution = [...pairCompositionCounts.values()]
    .sort((left, right) => right.encounters - left.encounters || left.compositionKey.localeCompare(right.compositionKey));
  const pairConcentration = count => pairEncounterTotal > 0
    ? pairCompositionDistribution.slice(0, count).reduce((sum, row) => sum + row.encounters, 0) / pairEncounterTotal
    : null;
  const reward = result.rewardOpportunity.byType;
  const ordinal2 = result.encounterExposure.encounterRows.filter(row => row.encounterOrdinal === 2);
  return {
    byEncounterOrdinal: byOrdinal,
    compositionIdentity,
    pairCompositionIdentity,
    diversity: {
      uniqueEffectiveCompositions: compositionCounts.size,
      uniqueEffectivePairCompositions: pairCompositionCounts.size,
      effectivePairEncounters: pairEncounterTotal,
      top1EffectivePairConcentrationRate: pairConcentration(1),
      top3EffectivePairConcentrationRate: pairConcentration(3)
    },
    encounter2ReachRate: ordinal2.length / runs,
    b1DeathRate: result.runOutcome.b1DeathRate,
    b2ArrivalRate: result.runOutcome.b2ArrivalRate,
    meaningfulRewardRate: reward.meaningfulReward.opportunityRate,
    buildOpportunityRate: reward.buildChangeOpportunity.opportunityRate,
    trapDamageHp: result.runOutcome.trapDamageHp,
    poisonApplications: result.runOutcome.poisonApplications,
    normalDamage: summarize(rows.map(row => row.normalDamage)),
    flee: null
  };
}

function summarizeFlee(result, runs) {
  const rows = result.encounterExposure.encounterRows;
  return {
    selected: result.runOutcome.fleeSelected,
    executed: result.runOutcome.fleeExecuted,
    selectedButNotExecuted: result.runOutcome.fleeSelectedButNotExecuted,
    survived: result.runOutcome.fleeSurvived,
    partingAttackDeaths: result.runOutcome.fleeDiedFromPartingAttack,
    encounter2ReachRate: rows.filter(row => row.encounterOrdinal === 2).length / runs,
    executionSurvivalRate: result.runOutcome.fleeSurvivalRate
  };
}

export async function runEarlyB1FCompositionDiagnostic({
  runs = DEFAULT_RUNS,
  fixedRuns = DEFAULT_FIXED_RUNS,
  seed = DEFAULT_SEED,
  selectionRuns = DEFAULT_SELECTION_RUNS,
  selectionSeed = DEFAULT_SELECTION_SEED,
  fixedSeed = DEFAULT_FIXED_SEED,
  allowSmallRunCount = false
} = {}) {
  const minimum = allowSmallRunCount ? 1 : DEFAULT_RUNS;
  const normalizedRuns = positiveInteger(runs, "runs", minimum);
  const normalizedFixedRuns = positiveInteger(fixedRuns, "fixedRuns", minimum);
  const normalizedSeed = positiveInteger(seed, "seed");
  const normalizedSelectionRuns = positiveInteger(selectionRuns, "selectionRuns", allowSmallRunCount ? 1 : DEFAULT_SELECTION_RUNS);
  const normalizedSelectionSeed = positiveInteger(selectionSeed, "selectionSeed");
  const normalizedFixedSeed = positiveInteger(fixedSeed, "fixedSeed");
  const surface = enumerateLegalPairs(1);
  const fixed = await runFixedCombatDiagnostic({
    runs: normalizedFixedRuns,
    seed: normalizedFixedSeed,
    startingKit: "vanguard",
    compositions: surface,
    includeContrasts: false,
    allowSmallRunCount: true
  });
  const selectionBaseline = await runDiagnostic({
    startingKit: "vanguard",
    policy: "fight",
    runs: normalizedSelectionRuns,
    seed: normalizedSelectionSeed,
    allowSmallRunCount: true
  });
  const profile = deriveCandidateProfile(selectionBaseline, fixed, surface, {
    selectionSeed: normalizedSelectionSeed
  });
  const baseline = await runDiagnostic({
    startingKit: "vanguard",
    policy: "fight",
    runs: normalizedRuns,
    seed: normalizedSeed,
    allowSmallRunCount: true
  });
  const cases = { baseline };
  for (const candidate of ["cadence-first-single", "composition-pool-redistribution", "ordering-defer"]) {
    cases[candidate] = await runDiagnostic({
      startingKit: "vanguard",
      policy: "fight",
      earlyCompositionPolicy: candidate === "cadence-first-single" ? "suppress-first-multi" : "baseline",
      earlyCompositionCandidate: candidateFor(candidate, profile),
      runs: normalizedRuns,
      seed: normalizedSeed,
      allowSmallRunCount: true
    });
  }
  const flee = await runDiagnostic({
    startingKit: "vanguard",
    policy: "visible-multi-enemy-flee",
    runs: normalizedRuns,
    seed: normalizedSeed,
    allowSmallRunCount: true
  });
  return {
    question: "fresh B1F の early pair exposure について、composition pool・ordering・cadence のどの最小候補が first-action opportunity と Build opportunity を改善するか",
    evidenceScope: "run",
    configuration: {
      startingKit: "vanguard",
      floorStart: 1,
      targetFloor: 2,
      encounterSizeWeights: [...getEncounterSizeWeightsForFloor(1)],
      runs: normalizedRuns,
      fixedCombatRuns: normalizedFixedRuns,
      seed: normalizedSeed,
      selectionRuns: normalizedSelectionRuns,
      selectionSeed: normalizedSelectionSeed,
      fixedCombatSeed: normalizedFixedSeed,
      worldSeedTemplate: "issue-1176:{seed}:{runIndex}",
      fixedWorldSeedTemplate: "issue-1151:{fixedSeed}:{hpBandId}:{compositionId}:{runIndex}",
      matchedCondition: "same production runner, starting state, evaluation world seed, policy, and vanguard; only named measurement candidate differs; target selection uses a separate holdout seed",
      playerPolicy: "production-auto fight; no departure consumables or craft",
      omitted: [
        "manual comprehension and next-trial hypothesis",
        "production candidate values; no source balance values are changed",
        "merchant and deeper-floor policy"
      ]
    },
    legalPairSurface: surface.map(pair => ({ id: pair.id, names: [...pair.names], key: pair.key })),
    fixedCombat: {
      configuration: fixed.configuration,
      cases: fixed.cases,
      compositions: fixed.compositions,
      riskDistribution: summarizeFixedRiskDistribution(fixed, surface)
    },
    candidateProfile: profile,
    cases: Object.fromEntries(
      Object.entries(cases).map(([id, result]) => [id, {
        configuration: result.configuration,
        metrics: summarizeEncounterRows(result, normalizedRuns)
      }])
    ),
    flee: summarizeFlee(flee, normalizedRuns)
  };
}

function formatRate(value) {
  return value === null || value === undefined ? "—" : `${(value * 100).toFixed(2)}%`;
}

function formatNumber(value) {
  return value === null || value === undefined ? "—" : Number(value).toFixed(2);
}

function buildSummary(report) {
  const lines = [
    "# Issue #1192 early B1F composition diagnostic",
    "",
    `- runner: \`${report.runnerVersion}\` / schema: ${report.schemaVersion}`,
    `- source SHA: \`${report.measurement.sourceCommit || "not recorded"}\``,
    `- primary: fresh vanguard; N=${report.configuration.runs}; seed=${report.configuration.seed}`,
    `- independent profile selection: fresh vanguard; N=${report.configuration.selectionRuns}; seed=${report.configuration.selectionSeed}`,
    `- fixed #1151 panel: ${report.legalPairSurface.length} legal pairs; N=${report.configuration.fixedCombatRuns} per HP band × policy; seed=${report.configuration.fixedCombatSeed}`,
    "",
    "## Candidate profile",
    "",
    `- target early compositions: ${report.candidateProfile.targetCompositionKeys.join(" / ")}`,
    `- selection method: ${report.candidateProfile.selection.method}`,
    `- target mass / residual replacement mass: ${formatNumber(report.candidateProfile.targetMass)} / ${formatNumber(report.candidateProfile.replacementMass)}`,
    `- residual replacement pairs: ${report.candidateProfile.replacementPairs.length} weighted legal pairs; no fixed replacement identity`,
    "",
    "## Fixed-panel risk distribution",
    "",
    "Death-rate distribution across all legal pairs, grouped by entry HP and fight policy.",
    "",
    "| Panel | p50 | p90 | p95 | p99 | max | >=50% | >=75% | >=90% |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...["100:fight", "75:fight", "50:fight", "25:fight", "100:immediate-flee", "75:immediate-flee", "50:immediate-flee", "25:immediate-flee"].map(key => {
      const panel = report.fixedCombat.riskDistribution[key];
      const risk = panel.risk;
      return `| ${key} | ${formatRate(risk.p50)} | ${formatRate(risk.p90)} | ${formatRate(risk.p95)} | ${formatRate(risk.p99)} | ${formatRate(risk.max)} | ${risk.atLeast50Percent} | ${risk.atLeast75Percent} | ${risk.atLeast90Percent} |`;
    }),
    "",
    "Highest-risk fixed-panel pairs (HP100/fight):",
    ...report.fixedCombat.riskDistribution["100:fight"].highestRiskPairs.map(row =>
      `- ${row.compositionKey}: ${formatRate(row.deathRate)}`
    ),
    "",
    "## Matched run-level comparison",
    "",
    "| Candidate | B1F death | B2 arrival | E1 generated/effective pair exposure | E2 generated/effective pair exposure | E1 first action not executed | E2 first action not executed | Meaningful reward | Build opportunity |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
  ];
  for (const [id, result] of Object.entries(report.cases)) {
    const e1 = result.metrics.byEncounterOrdinal["1"];
    const e2 = result.metrics.byEncounterOrdinal["2"];
    lines.push(
      `| ${id} | ${formatRate(result.metrics.b1DeathRate)} | ${formatRate(result.metrics.b2ArrivalRate)} | ` +
      `${formatRate(e1.generatedPairExposureRate)} / ${formatRate(e1.effectivePairExposureRate)} | ` +
      `${formatRate(e2.generatedPairExposureRate)} / ${formatRate(e2.effectivePairExposureRate)} | ` +
      `${formatRate(e1.all.firstActionNotExecutedRate)} | ${formatRate(e2.all.firstActionNotExecutedRate)} | ` +
      `${formatRate(result.metrics.meaningfulRewardRate)} | ${formatRate(result.metrics.buildOpportunityRate)} |`
    );
  }
  lines.push(
    "",
    "## Composition identity and cost",
    "",
    "Each candidate reports effective composition identity; baseline rows retain the generated production identity. Pair identity is not inferred from count alone.",
    "",
    "| Candidate | Top effective compositions in ordinal 1/2 | Normal damage p50 / p95 | Survivor HP p50 / p95 | Trap damage HP | Poison applications |",
    "| --- | --- | ---: | ---: | ---: | ---: |"
  );
  for (const [id, result] of Object.entries(report.cases)) {
    lines.push(
    `| ${id} | ${result.metrics.pairCompositionIdentity.slice(0, 3).map(row => `${row.compositionKey} (${row.encounters}/${row.deaths})`).join("; ") || "(no effective pair)"} | ` +
      `${formatNumber(result.metrics.normalDamage.p50)} / ${formatNumber(result.metrics.normalDamage.p95)} | ` +
      `${formatNumber(result.metrics.byEncounterOrdinal["1"].all.survivorPostCombatHp.p50)} / ${formatNumber(result.metrics.byEncounterOrdinal["1"].all.survivorPostCombatHp.p95)} | ` +
      `${result.metrics.trapDamageHp} | ${result.metrics.poisonApplications} |`
    );
  }
  lines.push(
    "",
    "## Early transition and diversity",
    "",
    "- E1 next-entry HP is the ordinal-2 entry HP distribution among runs that reach encounter 2; pair lethality is the ordinal pair death rate.",
    ...Object.entries(report.cases).map(([id, result]) => {
      const e1 = result.metrics.byEncounterOrdinal["1"];
      const pair = e1.pair;
      const diversity = result.metrics.diversity;
      return `- ${id}: E1 entry HP ${formatNumber(e1.all.entryHpRate.p50)}/${formatNumber(e1.all.entryHpRate.p95)} → post-combat HP ${formatNumber(e1.all.survivorPostCombatHp.p50)}/${formatNumber(e1.all.survivorPostCombatHp.p95)} → E2 entry HP ${formatNumber(e1.nextEntryHpRate.p50)}/${formatNumber(e1.nextEntryHpRate.p95)}; pair lethality ${formatRate(pair.deathRate)}; effective pair diversity ${diversity.uniqueEffectivePairCompositions} unique, top1 ${formatRate(diversity.top1EffectivePairConcentrationRate)}, top3 ${formatRate(diversity.top3EffectivePairConcentrationRate)}`;
    })
  );
  lines.push(
    "",
    "## Production fight / flee reference",
    "",
    `- selected / executed / preempted: ${report.flee.selected} / ${report.flee.executed} / ${report.flee.selectedButNotExecuted}`,
    `- survived / parting-attack deaths: ${report.flee.survived} / ${report.flee.partingAttackDeaths}`,
    `- encounter 2 reach: ${formatRate(report.flee.encounter2ReachRate)}; execution survival: ${formatRate(report.flee.executionSurvivalRate)}`,
    "- flee is a production counterfactual reference, not a recommended default policy.",
    "",
    "## Measurement boundary",
    "",
    "- cadence candidate changes only opening pair exposure; pool candidate removes named early pair mass at ordinals 1/2 and re-normalizes the residual legal production pair distribution; ordering candidate applies the same residual reroll only at ordinal 1 and returns to the normal generated pool at ordinal 2+.",
    "- no global enemy nerf, blanket two-enemy removal, free recovery, initiative change, or production B1F-only combat rule is included.",
    "- this runner decides the smallest production change boundary; production edits and fresh-save manual gate remain a separate follow-up change.",
    "",
    "## Provenance",
    "",
    `- production paths: ${report.measurement.productionPaths.join(", ")}`,
    `- environment hash: \`${report.measurement.environmentHash}\``
  );
  return `${lines.join("\n")}\n`;
}

function buildReport(result, provenance, options) {
  const scope = readSimScopeDeclaration(import.meta.url)?.name || "run";
  const environmentHash = printEnvSignatureBanner({
    runnerVersion: RUNNER_VERSION,
    schemaVersion: SCHEMA_VERSION,
    seed: result.configuration.seed,
    runs: result.configuration.runs,
    selectionSeed: result.configuration.selectionSeed,
    selectionRuns: result.configuration.selectionRuns,
    fixedCombatSeed: result.configuration.fixedCombatSeed,
    fixedCombatRuns: result.configuration.fixedCombatRuns,
    legalPairCount: result.legalPairSurface.length,
    candidateIds: CANDIDATE_IDS
  }, { label: "issue1192 early-b1f composition env" });
  return {
    schemaVersion: SCHEMA_VERSION,
    runnerVersion: RUNNER_VERSION,
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
    },
    configuration: result.configuration,
    legalPairSurface: result.legalPairSurface,
    candidateProfile: result.candidateProfile,
    fixedCombat: result.fixedCombat,
    cases: result.cases,
    flee: result.flee
  };
}

function buildManifest(report, options) {
  return {
    schemaVersion: report.schemaVersion,
    status: "success",
    runner: report.runnerVersion,
    source: report.measurement,
    configuration: report.configuration,
    legalPairCount: report.legalPairSurface.length,
    candidateProfile: report.candidateProfile,
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const runs = positiveInteger(options.runs || DEFAULT_RUNS, "runs", DEFAULT_RUNS);
  const fixedRuns = positiveInteger(options["fixed-runs"] || DEFAULT_FIXED_RUNS, "fixedRuns", DEFAULT_FIXED_RUNS);
  const seed = positiveInteger(options.seed || DEFAULT_SEED, "seed");
  const selectionRuns = positiveInteger(options["selection-runs"] || DEFAULT_SELECTION_RUNS, "selectionRuns", DEFAULT_SELECTION_RUNS);
  const selectionSeed = positiveInteger(options["selection-seed"] || DEFAULT_SELECTION_SEED, "selectionSeed");
  const fixedSeed = positiveInteger(options["fixed-seed"] || DEFAULT_FIXED_SEED, "fixedSeed");
  if (!options.output || !options.summary || !options.manifest) {
    throw new Error("--output, --summary, and --manifest are required");
  }
  const provenance = requireRunnerProvenance({
    fetchOriginMain: false,
    measurementRunnerPaths: [RUNNER_PATH, ...PRODUCTION_PATHS]
  });
  const result = await runEarlyB1FCompositionDiagnostic({
    runs,
    fixedRuns,
    seed,
    selectionRuns,
    selectionSeed,
    fixedSeed
  });
  const report = buildReport(result, provenance, options);
  fs.writeFileSync(resolve(options.output), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(resolve(options.summary), buildSummary(report));
  fs.writeFileSync(resolve(options.manifest), `${JSON.stringify(buildManifest(report, options), null, 2)}\n`);
  console.log(`Wrote Issue #1192 diagnostic: ${resolve(options.output)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
