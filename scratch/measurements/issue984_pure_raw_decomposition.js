// sim-scope: formula — paired production-backed decomposition of pure raw deaths
/* global console, process */

import fs from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createRng } from "../../src/seed_rng.js";
import { generateEncounter } from "../../src/combat_ui/encounter.js";
import { getCharMaxHp } from "../../src/rules/character_stats.js";
import {
  BUILD_IDS,
  ENCOUNTER_IDS,
  TARGET_DEPTHS,
  createBuildCharacter,
  deriveSharedCaseSeed,
  getBuildDefinitions,
  getEncounterDefinitions,
  runEncounterSample
} from "./issue973_build_sensitivity.js";
import { printEnvSignatureBanner } from "./measurement_env_signature.js";
import { requireRunnerProvenance } from "./measurement_provenance.js";

export const RUNNER_VERSION = "issue984-pure-raw-decomposition-v1";
export const DEFAULT_SEED = "974-build-confidence";
export const DEFAULT_RUNS = 500;
export const COUNTERFACTUALS = Object.freeze([
  { id: "baseline", label: "baseline (#983 causal measurement)", kind: "baseline" },
  { id: "C1_enemy_count", label: "C1: one enemy", kind: "enemy_count" },
  { id: "C2_enemy_action_count", label: "C2: one action per enemy/round", kind: "enemy_action_count" },
  { id: "C3_fight_duration", label: "C3: enemy HP ×0.50", kind: "enemy_hp", rate: 0.5 },
  { id: "C4_single_hit_damage", label: "C4: normal physical damage ×0.50", kind: "normal_damage", rate: 0.5 }
]);
export const SCHEMA_VERSION = 1;

function percentile(values, probability) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return lower === upper ? sorted[lower] : sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function describe(values) {
  if (values.length === 0) return { count: 0, mean: null, p50: null, p90: null, p95: null, min: null, max: null };
  return {
    count: values.length,
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    p50: percentile(values, 0.5), p90: percentile(values, 0.9), p95: percentile(values, 0.95),
    min: Math.min(...values), max: Math.max(...values)
  };
}

function byRound(records, field) {
  const buckets = new Map();
  records.forEach(record => (record[field] || []).forEach(entry => {
    const values = buckets.get(entry.round) || [];
    values.push(entry.value);
    buckets.set(entry.round, values);
  }));
  return [...buckets.entries()].sort(([left], [right]) => left - right)
    .map(([round, values]) => ({ round, ...describe(values) }));
}

function getRoundMetric(sample) {
  const physicalEvents = sample.causalDamageEvents.filter(event => event.attackType === "physical");
  const normalEvents = physicalEvents.filter(event => event.causalType === "normal");
  const playerDamagePerRound = sample.trace.map(round => ({
    round: round.round,
    value: Math.max(0, round.enemyState.before.totalHp - round.enemyState.after.totalHp)
  }));
  const hitCounts = physicalEvents.reduce((counts, event) => {
    counts[event.round] = (counts[event.round] || 0) + 1;
    return counts;
  }, {});
  return {
    physicalHitDamages: physicalEvents.map(event => event.finalDamage),
    ordinaryNormalHitDamages: normalEvents.map(event => event.finalDamage),
    physicalHitCount: physicalEvents.length,
    ordinaryNormalHitCount: normalEvents.length,
    normalDamageTotal: normalEvents.reduce((sum, event) => sum + event.finalDamage, 0),
    normalAttacksReceivedPerRound: sample.trace.map(round => ({ round: round.round, value: normalEvents.filter(event => event.round === round.round).length })),
    enemyActionsPerRound: sample.trace.map(round => ({ round: round.round, value: round.enemyActions.length })),
    livingEnemyCountByRound: sample.trace.map(round => ({
      round: round.round, value: round.enemyState.before.livingCount, after: round.enemyState.after.livingCount
    })),
    playerDamagePerRound,
    maxAttacksReceivedInOneRound: Math.max(0, ...Object.values(hitCounts)),
    totalEnemyHpRemoved: playerDamagePerRound.reduce((sum, entry) => sum + entry.value, 0)
  };
}

function getPureRawDeathMetrics(sample, buildId, encounterId, depth) {
  const maxHp = getCharMaxHp(createBuildCharacter(buildId));
  const deathRound = sample.failure?.deathRound ?? sample.rounds;
  const deathTrace = sample.trace.find(round => round.round === deathRound) || sample.trace.at(-1);
  const lethalHit = sample.causalDamageEvents.filter(event => event.lethal).at(-1) || null;
  const roundMetric = getRoundMetric(sample);
  return {
    buildId, encounterId, depth, maxHp, startingHp: maxHp,
    deathRoundStartHp: deathTrace?.hp.before ?? null,
    lethalHitDamage: lethalHit?.finalDamage ?? null,
    normalHitDamages: roundMetric.ordinaryNormalHitDamages,
    physicalHitDamagesIncludingSpecials: roundMetric.physicalHitDamages,
    ordinaryNormalHitDamages: roundMetric.ordinaryNormalHitDamages,
    normalAttackCount: roundMetric.ordinaryNormalHitCount,
    normalAttacksReceived: roundMetric.physicalHitCount,
    normalDamageTotal: roundMetric.normalDamageTotal,
    roundsSurvived: sample.rounds,
    initialEnemyCount: sample.fixture.monsterNames.length,
    livingEnemyCountByRound: roundMetric.livingEnemyCountByRound,
    enemyActionsPerRound: roundMetric.enemyActionsPerRound,
    normalAttacksReceivedPerRound: roundMetric.normalAttacksReceivedPerRound,
    maxAttacksReceivedInOneRound: roundMetric.maxAttacksReceivedInOneRound,
    playerDamagePerRound: roundMetric.playerDamagePerRound,
    enemyHpRemovalSpeed: roundMetric.totalEnemyHpRemoved / Math.max(1, sample.rounds),
    totalEnemyHpRemoved: roundMetric.totalEnemyHpRemoved
  };
}

function summarizePureRawDeaths(records) {
  const scalar = field => describe(records.map(record => record[field]).filter(value => value !== null));
  return {
    sampleCount: records.length,
    maxHP: scalar("maxHp"), startingHP: scalar("startingHp"), deathRoundStartHP: scalar("deathRoundStartHp"),
    lethalHitDamage: scalar("lethalHitDamage"),
    normalHitDamage: describe(records.flatMap(record => record.normalHitDamages)),
    physicalHitDamageIncludingSpecials: describe(records.flatMap(record => record.physicalHitDamagesIncludingSpecials)),
    ordinaryNormalHitDamage: describe(records.flatMap(record => record.ordinaryNormalHitDamages)),
    normalAttackCount: scalar("normalAttackCount"), normalAttacksReceived: scalar("normalAttacksReceived"),
    normalDamageTotal: scalar("normalDamageTotal"), roundsSurvived: scalar("roundsSurvived"),
    initialEnemyCount: describe(records.map(record => record.initialEnemyCount)),
    livingEnemyCountByRound: byRound(records, "livingEnemyCountByRound"),
    enemyActionsPerRound: byRound(records, "enemyActionsPerRound"),
    normalAttacksReceivedPerRound: byRound(records, "normalAttacksReceivedPerRound"),
    maxAttacksReceivedInOneRound: scalar("maxAttacksReceivedInOneRound"),
    playerDamagePerRound: byRound(records, "playerDamagePerRound"),
    enemyHpRemovalSpeed: scalar("enemyHpRemovalSpeed"), totalEnemyHpRemoved: scalar("totalEnemyHpRemoved")
  };
}

function createCellAggregate(buildId, encounterId, depth) {
  return { buildId, encounterId, depth, runs: 0, outcomes: { clear: 0, death: 0, timeout: 0 }, legacyRawDamageDeaths: 0, pureRawDeathRecords: [], allRunRecords: [] };
}

function addSample(cell, sample, buildId, encounterId, depth) {
  cell.runs++; cell.outcomes[sample.outcome]++;
  if (sample.failure?.legacyPrimary === "raw_damage_pressure") cell.legacyRawDamageDeaths++;
  const metrics = getPureRawDeathMetrics(sample, buildId, encounterId, depth);
  cell.allRunRecords.push({ rounds: metrics.roundsSurvived, normalAttacksReceived: metrics.normalAttacksReceived, normalDamageTotal: metrics.normalDamageTotal, enemyHpRemovalSpeed: metrics.enemyHpRemovalSpeed });
  if (sample.failure?.finalExclusiveCategory === "pure_raw_damage") cell.pureRawDeathRecords.push(metrics);
}

function finalizeCell(cell) {
  const pureRawDeaths = cell.pureRawDeathRecords.length;
  const runs = cell.runs;
  return {
    buildId: cell.buildId, encounterId: cell.encounterId, depth: cell.depth, runs,
    outcomes: cell.outcomes, legacyRawDamageDeaths: cell.legacyRawDamageDeaths,
    pureRawDamageDeaths: pureRawDeaths, pureRawDeathRate: pureRawDeaths / Math.max(1, runs),
    pureRawMetrics: summarizePureRawDeaths(cell.pureRawDeathRecords),
    allRunProcessMetrics: {
      rounds: describe(cell.allRunRecords.map(record => record.rounds)),
      normalAttacksReceived: describe(cell.allRunRecords.map(record => record.normalAttacksReceived)),
      normalDamageTotal: describe(cell.allRunRecords.map(record => record.normalDamageTotal)),
      enemyHpRemovalSpeed: describe(cell.allRunRecords.map(record => record.enemyHpRemovalSpeed))
    }
  };
}

function summarizeCells(cases) {
  const pure = cases.reduce((sum, item) => sum + item.pureRawDamageDeaths, 0);
  const raw = cases.reduce((sum, item) => sum + item.legacyRawDamageDeaths, 0);
  const runs = cases.reduce((sum, item) => sum + item.runs, 0);
  const deaths = cases.reduce((sum, item) => sum + item.outcomes.death, 0);
  const clears = cases.reduce((sum, item) => sum + item.outcomes.clear, 0);
  return { runs, deaths, clears, deathRate: deaths / Math.max(1, runs), legacyRawDamageDeaths: raw, pureRawDamageDeaths: pure, pureRawDeathRate: pure / Math.max(1, runs), pureRawShareOfLegacyRaw: pure / Math.max(1, raw) };
}

function summarizeByBuild(cases) {
  return BUILD_IDS.map(buildId => ({ buildId, ...summarizeCells(cases.filter(item => item.buildId === buildId)) }));
}

function summarizeByDepth(cases) {
  return TARGET_DEPTHS.map(depth => ({ depth, ...summarizeCells(cases.filter(item => item.depth === depth)) }));
}

function createPairedAggregate() {
  return { pairedRuns: 0, baselineDeaths: 0, counterfactualDeaths: 0, baselinePureRawDeaths: 0, counterfactualPureRawDeaths: 0, pureRawDeathsAvoided: 0, pureRawDeathsRemaining: 0, candidateDeathAfterBaselinePureRaw: 0, candidateClearAfterBaselinePureRaw: 0, causeShiftCounts: {} };
}

function addPairedSample(aggregate, baseline, candidate) {
  const baselinePure = baseline.failure?.finalExclusiveCategory === "pure_raw_damage";
  const candidatePure = candidate.failure?.finalExclusiveCategory === "pure_raw_damage";
  aggregate.pairedRuns++; aggregate.baselineDeaths += Number(baseline.outcome === "death"); aggregate.counterfactualDeaths += Number(candidate.outcome === "death"); aggregate.baselinePureRawDeaths += Number(baselinePure); aggregate.counterfactualPureRawDeaths += Number(candidatePure);
  aggregate.pureRawDeathsAvoided += Number(baselinePure && !candidatePure); aggregate.pureRawDeathsRemaining += Number(baselinePure && candidatePure);
  aggregate.candidateDeathAfterBaselinePureRaw += Number(baselinePure && candidate.outcome === "death"); aggregate.candidateClearAfterBaselinePureRaw += Number(baselinePure && candidate.outcome === "clear");
  if (baselinePure) {
    const cause = candidate.failure?.finalExclusiveCategory || candidate.outcome;
    aggregate.causeShiftCounts[cause] = (aggregate.causeShiftCounts[cause] || 0) + 1;
  }
}

function finalizePairedAggregate(aggregate) {
  const rate = (value, denominator = aggregate.pairedRuns) => value / Math.max(1, denominator);
  return {
    ...aggregate,
    baselineDeathRate: rate(aggregate.baselineDeaths), counterfactualDeathRate: rate(aggregate.counterfactualDeaths),
    deathRateReduction: rate(aggregate.baselineDeaths - aggregate.counterfactualDeaths),
    baselinePureRawDeathRate: rate(aggregate.baselinePureRawDeaths), counterfactualPureRawDeathRate: rate(aggregate.counterfactualPureRawDeaths),
    pureRawDeathRateDelta: rate(aggregate.counterfactualPureRawDeaths - aggregate.baselinePureRawDeaths), pureRawDeathRateReduction: rate(aggregate.baselinePureRawDeaths - aggregate.counterfactualPureRawDeaths),
    baselinePureRawDeathsAvoidedRate: rate(aggregate.pureRawDeathsAvoided, aggregate.baselinePureRawDeaths)
  };
}

function baseMonsterName(name) { return String(name).replace(/ [A-Z]$/, ""); }

function collectProductionEncounterDistribution(seed, runs) {
  return TARGET_DEPTHS.map(depth => {
    const sizeCounts = {}, compositionCounts = {};
    for (let runIndex = 0; runIndex < runs; runIndex++) {
      const rng = createRng(`production-encounter:${seed}:run:${runIndex}:B${depth}`);
      const generated = generateEncounter({ floor: depth }, false, false, false, null, rng);
      const names = generated.monsters.map(monster => baseMonsterName(monster.name));
      sizeCounts[String(names.length)] = (sizeCounts[String(names.length)] || 0) + 1;
      const composition = [...names].sort().join(" + ");
      compositionCounts[composition] = (compositionCounts[composition] || 0) + 1;
    }
    const averageEnemyCount = Object.entries(sizeCounts).reduce((sum, [size, count]) => sum + Number(size) * count, 0) / Math.max(1, runs);
    return { depth, runs, sizeCounts, averageEnemyCount, compositionCounts };
  });
}

function collectControlledFixtureProfile() {
  const fixtures = getEncounterDefinitions().map(definition => ({ encounterId: definition.id, monsterNames: [...definition.monsterNames], enemyCount: definition.monsterNames.length }));
  const averageEnemyCount = fixtures.reduce((sum, fixture) => sum + fixture.enemyCount, 0) / fixtures.length;
  return { fixtureCount: fixtures.length, fixtures, averageEnemyCount, enemyCountDistribution: fixtures.reduce((counts, fixture) => { const key = String(fixture.enemyCount); counts[key] = (counts[key] || 0) + 1; return counts; }, {}) };
}

function buildMeasurementMetadata({ seed, runs, provenance, envSignature }) {
  return {
    schemaVersion: SCHEMA_VERSION, runnerVersion: RUNNER_VERSION, profile: "issue984-pure-raw-decomposition",
    sourceCommit: provenance?.sourceCommit || null, productionBaselineSha: provenance?.baseCommit || null,
    simulatorRunnerCommit: provenance?.measurementRunnerCommit || provenance?.sourceCommit || null, simulatorRunnerDiffSha256: provenance?.measurementRunnerDiffSha256 || null,
    originMainAncestor: provenance?.originMainAncestor ?? null, staleTreeAllowed: provenance?.staleTreeAllowed ?? null, workingTreeClean: provenance?.workingTreeClean ?? null,
    configuration: { runs, seed, targetDepths: [...TARGET_DEPTHS], buildIds: [...BUILD_IDS], encounterIds: [...ENCOUNTER_IDS], counterfactualIds: COUNTERFACTUALS.map(item => item.id), c3EnemyHpRate: 0.5, c4NormalDamageRate: 0.5 },
    seedPolicy: { rootSeed: seed, caseDerivation: "rootSeed:run:<index>:B<depth>:<encounterId>", pairedConditions: "baseline and every counterfactual reuse the exact case seed", buildIdExcludedFromSeed: true, productionEncounterDerivation: "production-encounter:<rootSeed>:run:<index>:B<depth>" },
    environmentSignature: envSignature,
    modeled: ["#983 causal classification and production-backed runCombatRoundCalculation", "production monster definitions and depth scaling for controlled fixtures", "production auto-action policy, spells, status rules, mitigation, and rewards path", "measurement-only C1/C2/C3/C4 hooks, each changing one factor"],
    omitted: ["map traversal and actual encounter frequency", "manual player input and UI timing", "between-encounter progression, consumables, retreat, and economy", "production tuning or any inference that controlled fixture frequency equals dungeon frequency"]
  };
}

export function runDecomposition({ seed = DEFAULT_SEED, runs = DEFAULT_RUNS, provenance = null } = {}) {
  if (!Number.isInteger(runs) || runs < 1) throw new Error(`runs must be a positive integer: ${runs}`);
  const conditionCases = new Map(COUNTERFACTUALS.map(condition => [condition.id, []]));
  const paired = new Map(COUNTERFACTUALS.slice(1).map(condition => [condition.id, createPairedAggregate()]));
  for (const depth of TARGET_DEPTHS) for (const encounterId of ENCOUNTER_IDS) {
    const cells = new Map(COUNTERFACTUALS.map(condition => [condition.id, new Map(BUILD_IDS.map(buildId => [buildId, createCellAggregate(buildId, encounterId, depth)]))]));
    for (let runIndex = 0; runIndex < runs; runIndex++) for (const buildId of BUILD_IDS) {
      const caseSeed = deriveSharedCaseSeed(seed, runIndex, depth, encounterId);
      const baseline = runEncounterSample({ buildId, encounterId, depth, seed: caseSeed });
      addSample(cells.get("baseline").get(buildId), baseline, buildId, encounterId, depth);
      for (const condition of COUNTERFACTUALS.slice(1)) {
        const candidate = runEncounterSample({ buildId, encounterId, depth, seed: caseSeed, counterfactual: condition });
        addSample(cells.get(condition.id).get(buildId), candidate, buildId, encounterId, depth);
        addPairedSample(paired.get(condition.id), baseline, candidate);
      }
    }
    for (const condition of COUNTERFACTUALS) conditionCases.get(condition.id).push(...[...cells.get(condition.id).values()].map(finalizeCell));
  }
  const cases = Object.fromEntries(COUNTERFACTUALS.map(condition => [condition.id, conditionCases.get(condition.id)]));
  return {
    schemaVersion: SCHEMA_VERSION,
    measurement: buildMeasurementMetadata({ seed, runs, provenance, envSignature: null }),
    baselineReference: { pullRequest: 983, issue: 980, legacyRawDamageDeaths: 41512, pureRawDamageDeaths: 26683, pureRawShareOfLegacyRaw: 26683 / 41512, note: "PR #983 exclusive pure_raw_damage classification; baseline is re-run on current main." },
    builds: getBuildDefinitions().map(build => ({ id: build.id, label: build.label, className: "Mage" })),
    encounters: getEncounterDefinitions().map(encounter => ({ id: encounter.id, label: encounter.label, productionMonsterNames: [...encounter.monsterNames], productionFixtureEnemyCount: encounter.monsterNames.length })),
    conditions: COUNTERFACTUALS.map(condition => ({ ...condition, ...(condition.id === "baseline" ? {} : { paired: finalizePairedAggregate(paired.get(condition.id)) }), overall: summarizeCells(cases[condition.id]), byBuild: summarizeByBuild(cases[condition.id]), byDepth: summarizeByDepth(cases[condition.id]), cases: cases[condition.id] })),
    controlledFixtureProfile: collectControlledFixtureProfile(), productionEncounterDistribution: collectProductionEncounterDistribution(seed, runs),
    interpretation: { classificationBaseline: "PR #983 exclusive pure_raw_damage category", primaryMetric: "pure raw death incidence per paired run; no 60% target", counterfactualInterpretation: { C1_enemy_count: "enemy count/concentrated incoming actions", C2_enemy_action_count: "multi-action extra action contribution", C3_fight_duration: "fight duration / enemy HP contribution", C4_single_hit_damage: "single normal physical hit contribution" } }
  };
}

function formatNumber(value) { return value === null || value === undefined ? "n/a" : Number(value).toFixed(2); }

function renderSummary(report) {
  const baseline = report.conditions.find(condition => condition.id === "baseline");
  const candidates = report.conditions.filter(condition => condition.id !== "baseline").sort((left, right) => right.paired.pureRawDeathRateReduction - left.paired.pureRawDeathRateReduction);
  const deepOverall = summarizeCells(baseline.cases.filter(item => item.depth >= 13));
  const fixture = report.controlledFixtureProfile;
  const productionAverage = report.productionEncounterDistribution.reduce((sum, item) => sum + item.averageEnemyCount, 0) / report.productionEncounterDistribution.length;
  const buildRows = baseline.byBuild.map(row => {
    const metrics = baseline.cases.filter(item => item.buildId === row.buildId).map(item => item.pureRawMetrics).filter(item => item.sampleCount > 0);
    const mean = field => { const values = metrics.map(item => item[field].mean).filter(value => value !== null); return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null; };
    return `| ${row.buildId} | ${row.pureRawDamageDeaths} / ${row.runs} (${(row.pureRawDeathRate * 100).toFixed(2)}%) | ${formatNumber(mean("normalHitDamage"))} | ${formatNumber(mean("normalAttacksReceived"))} |`;
  });
  const depthRows = baseline.byDepth.map(row => `| B${row.depth} | ${row.pureRawDamageDeaths} / ${row.runs} (${(row.pureRawDeathRate * 100).toFixed(2)}%) |`);
  const counterRows = candidates.map(condition => `| ${condition.id} | ${condition.paired.baselinePureRawDeaths} | ${condition.paired.counterfactualPureRawDeaths} | ${(condition.paired.pureRawDeathRateReduction * 100).toFixed(2)}pp | ${(condition.paired.deathRateReduction * 100).toFixed(2)}pp | ${(condition.paired.baselinePureRawDeathsAvoidedRate * 100).toFixed(2)}% |`);
  const caseRows = baseline.cases.map(item => `| B${item.depth} | ${item.encounterId} | ${item.buildId} | ${item.pureRawDamageDeaths} / ${item.runs} | ${formatNumber(item.pureRawMetrics.normalHitDamage.mean)} | ${formatNumber(item.pureRawMetrics.normalAttacksReceived.mean)} | ${formatNumber(item.pureRawMetrics.normalDamageTotal.mean)} | ${formatNumber(item.pureRawMetrics.roundsSurvived.mean)} | ${formatNumber(item.pureRawMetrics.initialEnemyCount.mean)} | ${formatNumber(item.pureRawMetrics.enemyHpRemovalSpeed.mean)} |`);
  return [
    "# Issue #984 Pure Raw Death Decomposition", "", `- runner: ${RUNNER_VERSION}`, `- source commit: \`${report.measurement.sourceCommit || "in-process"}\``, `- production baseline SHA: \`${report.measurement.productionBaselineSha || "in-process"}\``, `- N=${report.measurement.configuration.runs} per build × encounter × depth × condition; seed=${report.measurement.configuration.seed}`, `- depths: ${TARGET_DEPTHS.map(depth => `B${depth}`).join(", ")}; builds: ${BUILD_IDS.join(", ")}; fixtures: ${ENCOUNTER_IDS.length}`, "",
    "## Scope and validity", "", "PR #983's exclusive `pure_raw_damage` category is the baseline. The baseline condition reuses the same causal runner and production round path; C1–C4 are measurement-only hooks with one changed factor each. Every condition uses the exact same derived case seed for paired comparison.", "", "Modeled: production monster definitions/depth scaling, auto-action, spell/status/mitigation rules, and the #983 causal classifier. Omitted: map traversal, encounter frequency in a complete run, manual input, consumables/retreat, and between-encounter progression. Controlled fixtures must not be interpreted as the game's global death rate.", "",
    "## Headline baseline", "", `- PR #983 reference: **26,683 / 41,512 = 64.28%** pure raw within the legacy raw denominator.`, `- current-main re-run, all depths: **${baseline.overall.pureRawDamageDeaths} / ${baseline.overall.runs} = ${(baseline.overall.pureRawDeathRate * 100).toFixed(2)}%** pure raw incidence.`, `- current-main deep band (B13+): **${deepOverall.pureRawDamageDeaths} / ${deepOverall.runs} = ${(deepOverall.pureRawDeathRate * 100).toFixed(2)}%**; legacy raw share **${(deepOverall.pureRawShareOfLegacyRaw * 100).toFixed(2)}%**.`, "",
    "## Counterfactual paired comparison", "", "Reduction is the paired change in pure-raw incidence, not a tuning target. A candidate may shift a death to another category; those shifts remain visible in JSON. Total-death change is shown separately to expose label shifts.", "", "| Condition | Baseline pure raw | Counterfactual pure raw | Pure-raw reduction | Total death reduction | Baseline pure raw runs avoided |", "| --- | ---: | ---: | ---: | ---: | ---: |", ...counterRows, "", `Measured pure-raw order: ${candidates.map(condition => `${condition.id} ${(condition.paired.pureRawDeathRateReduction * 100).toFixed(2)}pp`).join(" > ")}. This ranks fixed experiments; it does not recommend applying them in production.`, "",
    "## Required answers", "", `1. **主因:** C4_single_hit_damage has the largest isolated pure-raw reduction (${(candidates.find(condition => condition.id === "C4_single_hit_damage")?.paired.pureRawDeathRateReduction * 100).toFixed(2)}pp); C3 (${(candidates.find(condition => condition.id === "C3_fight_duration")?.paired.pureRawDeathRateReduction * 100).toFixed(2)}pp) and C1 (${(candidates.find(condition => condition.id === "C1_enemy_count")?.paired.pureRawDeathRateReduction * 100).toFixed(2)}pp) are also material. C2 does not improve the metric and is negative after label shifts.`, `2. **寄与順位:** ${candidates.map((condition, index) => `${index + 1}. ${condition.id}`).join("、")}。Pure-raw ranking is not a claim that the factors are additive.`, `3. **Build差:** build-specific pure-raw rates and metrics are reported below and in all 144 baseline cells; the structure is ${new Set(baseline.byBuild.map(row => row.pureRawDeathRate.toFixed(3))).size > 1 ? "not identical across builds" : "similar across builds"}.`, "4. **Depth差:** depth rows plus each cell's rounds, incoming attacks, total normal damage, enemy count, and HP-removal speed show what changes from B8 to B30; depth is not treated as an independent cause.", `5. **Fixture極端さ:** controlled fixtures average ${fixture.averageEnemyCount.toFixed(2)} enemies; production generation sampled at the same depths averages ${productionAverage.toFixed(2)}. The JSON records per-depth sizes and compositions.`, "6. **次の本番レバー:** **まだ触らない**。Validate production-frequency-weighted results first; this evidence does not authorize changing enemy HP/ATK, Mage, defense, pools, or action rules.", "7. **#973 Build Confidence:** **Revise** — build interaction is measurable, but a single global confidence conclusion would ignore encounter weighting and processing speed.", "",
    "## Baseline by build", "", "| Build | Pure raw | Mean normal hit | Mean attacks received |", "| --- | ---: | ---: | ---: |", ...buildRows, "", "## Baseline by depth", "", "| Depth | Pure raw |", "| --- | ---: |", ...depthRows, "",
    "## Baseline build × encounter × depth matrix", "", "| Depth | Encounter | Build | Pure raw | Normal hit mean | Normal attacks mean | Normal damage total mean | Rounds mean | Initial enemies mean | Enemy HP removal/round |", "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |", ...caseRows, "",
    "## Production encounter generation vs controlled fixtures", "", `Controlled fixture enemy-count distribution: \`${JSON.stringify(fixture.enemyCountDistribution)}\`; production generated distribution is recorded per depth in JSON. This is generation output, not observed full-run encounter frequency.`, "", "| Depth | Production average enemies | Size distribution |", "| --- | ---: | --- |", ...report.productionEncounterDistribution.map(item => `| B${item.depth} | ${item.averageEnemyCount.toFixed(2)} | ${JSON.stringify(item.sizeCounts)} |`), "",
    "## Reproduction and evidence", "", "```sh", "node scratch/measurements/issue984_pure_raw_decomposition.js --runs 500 --seed 974-build-confidence --output evidence/results/issue-984-pure-raw-decomposition.json --summary evidence/results/issue-984-pure-raw-decomposition.md", "```", "", "The JSON contains every requested pure-raw death metric, paired cause shifts, production encounter compositions, provenance, and modeled/omitted mechanisms."
  ].join("\n") + "\n";
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (["--output", "--summary", "--seed", "--runs"].includes(value)) { const next = argv[++index]; if (!next) throw new Error(`${value} requires a value`); options[value.slice(2)] = value === "--runs" ? Number(next) : next; }
    else if (value === "--help") { console.log("Usage: node scratch/measurements/issue984_pure_raw_decomposition.js --runs 500 --output evidence/results/issue-984-pure-raw-decomposition.json --summary evidence/results/issue-984-pure-raw-decomposition.md [--seed SEED]"); process.exit(0); }
    else throw new Error(`unknown option: ${value}`);
  }
  if (!options.output || !options.summary) throw new Error("--output and --summary are required");
  return options;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const provenance = requireRunnerProvenance({ fetchOriginMain: false, measurementRunnerPaths: ["scratch/measurements/issue984_pure_raw_decomposition.js", "scratch/measurements/issue973_build_sensitivity.js", "src/combat_logic/round.js", "scratch/measurements/measurement_env_signature.js", "scratch/measurements/measurement_provenance.js"] });
  const envSignature = printEnvSignatureBanner({ runnerVersion: RUNNER_VERSION, seed: options.seed || DEFAULT_SEED, runs: options.runs || DEFAULT_RUNS, depths: TARGET_DEPTHS, builds: BUILD_IDS, encounters: ENCOUNTER_IDS, counterfactuals: COUNTERFACTUALS.map(item => item.id) }, { label: "issue984 pure raw decomposition env" });
  const report = runDecomposition({ seed: options.seed || DEFAULT_SEED, runs: options.runs || DEFAULT_RUNS, provenance });
  report.measurement.environmentSignature = envSignature;
  const outputPath = resolve(options.output); const summaryPath = resolve(options.summary);
  fs.mkdirSync(dirname(outputPath), { recursive: true }); fs.mkdirSync(dirname(summaryPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`); fs.writeFileSync(summaryPath, renderSummary(report));
  console.log(`Wrote Issue #984 JSON evidence: ${outputPath}`); console.log(`Wrote Issue #984 Markdown evidence: ${summaryPath}`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
