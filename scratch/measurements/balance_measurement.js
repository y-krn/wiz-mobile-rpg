// sim-scope: infra — standard statistical balance measurement and comparison helpers
/* global process */

import { createHash } from "node:crypto";

export const BALANCE_MEASUREMENT_SCHEMA_VERSION = 1;
export const BALANCE_MEASUREMENT_RUNNER_VERSION = "standard-v1";
export const STANDARD_BALANCE_CONFIG = Object.freeze({
  profile: BALANCE_MEASUREMENT_RUNNER_VERSION,
  seed: 843,
  runs: 500,
  calibrationRuns: 100,
  identificationPolicy: "powder",
  classNames: Object.freeze(["Fighter", "Thief", "Priest", "Mage"]),
  scenarioIds: Object.freeze(["workshop-empty", "workshop-complete"]),
  targetDepths: Object.freeze([5, 10, 15, 20]),
  seedPolicy: "Each scenario/class task resets the canonical simulator to seed; run index is deterministic."
});

const Z95 = 1.959963984540054;
const RATE_METRIC_NAMES = new Set([
  "reachedRate",
  "breakthroughRate",
  "deathRate",
  "retreatRate"
]);

// Tolerances are practical guardrails, not claims that a smaller difference is
// impossible. A result outside the guardrail is only a failure when its
// conservative difference interval is also outside the guardrail.
export const REGRESSION_RULES = Object.freeze({
  reachedRate: Object.freeze({ direction: "higher", tolerance: { kind: "absolute", value: 0.05 } }),
  breakthroughRate: Object.freeze({ direction: "higher", tolerance: { kind: "absolute", value: 0.05 } }),
  deathRate: Object.freeze({ direction: "lower", tolerance: { kind: "absolute", value: 0.05 } }),
  retreatRate: Object.freeze({ direction: "higher", tolerance: { kind: "absolute", value: 0.05 } }),
  bankedMaterialsPerRun: Object.freeze({ direction: "higher", tolerance: { kind: "relative", value: 0.10 } }),
  materialEvPerTime: Object.freeze({ direction: "higher", tolerance: { kind: "relative", value: 0.10 } })
});

const STANDARD_SIM_ENV = Object.freeze({
  SIM_SEED: String(STANDARD_BALANCE_CONFIG.seed),
  SIM_RUNS: String(STANDARD_BALANCE_CONFIG.runs),
  SIM_CALIBRATION_RUNS: String(STANDARD_BALANCE_CONFIG.calibrationRuns),
  DEPARTURE_CRAFT_IDS: "TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION",
  TRAP_POLICY: "conservative",
  TRAP_DAMAGE_MULTIPLIER: "1",
  IDENTIFICATION_POLICY: STANDARD_BALANCE_CONFIG.identificationPolicy,
  IDENTIFICATION_STARTING_POWDER: "2",
  IDENTIFICATION_COST_OVERRIDE: "1",
  STATUS_CURE_POLICY: "legacy",
  STATUS_CURE_HP_THRESHOLD: "0.35",
  STATUS_CURE_MERCHANT_POLICY: "missing",
  HEAL_POTION_MERCHANT_POLICY: "missing",
  FLEE_POLICY: "ev",
  FLEE_HP_THRESHOLD: "0.20",
  HEAL_POTION_THRESHOLD: "0.55",
  MANA_POTION_THRESHOLD: "0.55",
  PORTAL_HP_THRESHOLD: "0.35",
  PORTAL_MAX_HEAL_POTIONS: "0",
  PORTAL_MIN_FLOOR: "3",
  ELITE_POLICY: "avoid",
  BLOOD_WAND_HP_PAYMENT_MIN_RATE: "0.50",
  SIM_CORE_SCORE_DROP_TOLERANCE: "0",
  SIM_440_CONDITION: "current",
  SIM_ISSUE646_CAMP_LEVEL: "",
  SIM_INDEPENDENT_RUN_RANDOM: "1",
  SIM_737_DAMAGE_AUDIT: "0",
  SIM_728_HIT_EVASION: "0",
  SIM_DIALMA_CANDIDATE: "1",
  SIM_MADI_CANDIDATE: "1",
  SIM_MADI_HEAL_MIN: "",
  SIM_MADI_HEAL_MAX: "",
  SIM_MADI_COST: "",
  SIM_MERCHANT_MANA_COST: "",
  SIM_MERCHANT_EYE_DROPS: "0",
  SIM_MERCHANT_RETURN_WING: "0",
  SIM_MERCHANT_RETURN_WING_COST: "",
  SIM_MERCHANT_POLICY: "supply-missing",
  SIM_MILESTONE_PORTAL_POLICY: "continue",
  SIM_RETURN_WING_MODE: "special",
  SIM_SCENARIOS: STANDARD_BALANCE_CONFIG.scenarioIds.join(","),
  SIM_EXPLORATION_POISON_MODEL: "combined",
  SIM_412_POLICY: "baseline"
});

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hashConfiguration(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex").slice(0, 16);
}

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer: ${value}`);
  }
  return parsed;
}

export function resolveBalanceMeasurementConfig(options = {}, env = process.env) {
  const config = {
    ...STANDARD_BALANCE_CONFIG,
    runs: positiveInteger(options.runs ?? env.BALANCE_SIM_RUNS ?? STANDARD_BALANCE_CONFIG.runs, "runs"),
    calibrationRuns: positiveInteger(
      options.calibrationRuns ?? env.BALANCE_SIM_CALIBRATION_RUNS ?? STANDARD_BALANCE_CONFIG.calibrationRuns,
      "calibrationRuns"
    ),
    seed: positiveInteger(options.seed ?? env.BALANCE_SIM_SEED ?? STANDARD_BALANCE_CONFIG.seed, "seed")
  };
  if (config.runs < STANDARD_BALANCE_CONFIG.runs) {
    throw new Error(`standard balance measurement requires N>=${STANDARD_BALANCE_CONFIG.runs}: ${config.runs}`);
  }
  const simulationEnv = getStandardSimulationEnv(config);
  return Object.freeze({
    ...config,
    simulationEnv,
    comparisonKey: hashConfiguration({ ...config, simulationEnv })
  });
}

export function getStandardSimulationEnv(config) {
  return Object.freeze({
    ...STANDARD_SIM_ENV,
    SIM_SEED: String(config.seed),
    SIM_RUNS: String(config.runs),
    SIM_CALIBRATION_RUNS: String(config.calibrationRuns)
  });
}

export function applyStandardSimulationEnv(config, env = process.env) {
  Object.entries(getStandardSimulationEnv(config)).forEach(([key, value]) => {
    env[key] = value;
  });
  delete env.SIM_PRESET;
  return env;
}

function wilsonInterval(successes, trials) {
  if (trials <= 0) return [null, null];
  const rate = Math.max(0, Math.min(1, successes / trials));
  const z2 = Z95 ** 2;
  const denominator = 1 + z2 / trials;
  const center = (rate + z2 / (2 * trials)) / denominator;
  const margin = Z95 * Math.sqrt((rate * (1 - rate) + z2 / (4 * trials)) / trials) / denominator;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

export function rateMetric(successes, trials) {
  const estimate = trials > 0 ? successes / trials : null;
  return {
    kind: "rate",
    successes,
    trials,
    confidence: trials >= 30 ? "sufficient" : trials > 0 ? "low-n" : "unobserved",
    estimate,
    ci95: wilsonInterval(successes, trials)
  };
}

function parseMeanInterval(value, name) {
  const match = String(value || "").match(/^(-?\d+(?:\.\d+)?)\s+\[(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?);\s*N=(\d+)\]/);
  if (!match) throw new Error(`canonical simulator did not provide a numeric CI for ${name}: ${value}`);
  return {
    kind: "mean",
    estimate: Number(match[1]),
    ci95: [Number(match[2]), Number(match[3])],
    trials: Number(match[4])
  };
}

function depthMetrics(outcomeResult, resourceResult, depth) {
  const entrants = outcomeResult.entrantsByFloor?.[depth] || 0;
  const runs = outcomeResult.runs;
  return {
    reachedRate: rateMetric(entrants, runs),
    breakthroughRate: rateMetric(outcomeResult.breakthroughsByFloor?.[depth] || 0, runs),
    deathRate: rateMetric(outcomeResult.deathsByFloor?.[depth] || 0, entrants),
    retreatRate: rateMetric(outcomeResult.retreatsByFloor?.[depth] || 0, entrants),
    bankedMaterialsPerRun: parseMeanInterval(resourceResult.mean95CI.bankedMaterialEv, "bankedMaterialsPerRun"),
    materialEvPerTime: parseMeanInterval(resourceResult.mean95CI.materialEvPerTime, "materialEvPerTime"),
    materialAcquiredPerRun: parseMeanInterval(resourceResult.mean95CI.materialAcquired, "materialAcquiredPerRun"),
    materialConsumedPerRun: parseMeanInterval(resourceResult.mean95CI.materialConsumed, "materialConsumedPerRun"),
    averageReachedFloor: parseMeanInterval(resourceResult.mean95CI.reachedFloor, "averageReachedFloor")
  };
}

function summarizeClassDepths(config, classResult) {
  const results = classResult.results;
  const outcomeResult = results.find(result => result.targetDepth === Math.max(...config.targetDepths));
  if (!outcomeResult) {
    throw new Error(`canonical simulator omitted standard outcome result: ${classResult.className}`);
  }
  return Object.fromEntries(config.targetDepths.map(depth => {
    const resourceResult = results.find(result => result.targetDepth === depth);
    if (!resourceResult) {
      throw new Error(`canonical simulator omitted standard depth result: ${classResult.className}/B${depth}`);
    }
    return [depth, {
      metrics: depthMetrics(outcomeResult, resourceResult, depth),
      outcomeCounts: resourceResult.outcomeCounts,
      averageTimeCost: resourceResult.averageTimeCost,
      averageMaterialAcquired: resourceResult.averageMaterialAcquired,
      averageMaterialConsumed: resourceResult.averageMaterialConsumed,
      bankedMaterialEv: resourceResult.bankedMaterialEv,
      materialEvPerTime: resourceResult.materialEvPerTime,
      diagnostics: resourceResult.runDiagnostics
    }];
  }));
}

function formatDiagnosticCounts(counts = {}) {
  const entries = Object.entries(counts).filter(([, count]) => count > 0);
  return entries.length > 0
    ? entries.map(([key, count]) => `${key}=${count}`).join(", ")
    : "none";
}

function formatDiagnosticMean(distribution) {
  return distribution && Number.isFinite(distribution.mean)
    ? distribution.mean.toFixed(3)
    : "—";
}

function formatDiagnosticEndFloors(distribution) {
  const entries = Object.entries(distribution || {})
    .filter(([, count]) => count > 0)
    .sort(([left], [right]) => Number(left) - Number(right));
  return entries.length > 0
    ? entries.map(([floor, count]) => `B${floor}=${count}`).join(", ")
    : "none";
}

function formatDiagnosticRow({ scenarioId, className = null, depth, label, bucket, signals = false, includeClass = false }) {
  const columns = [
    scenarioId,
    ...(includeClass ? [className || "—"] : []),
    `B${depth}`,
    label,
    bucket.runs || 0,
    formatDiagnosticEndFloors(bucket.endFloors),
    ...(signals ? [formatDiagnosticCounts(bucket.retreatReasonSignals)] : []),
    formatDiagnosticMean(bucket.endingHpRate),
    formatDiagnosticMean(bucket.endingMpRate),
    formatDiagnosticMean(bucket.healPotionsRemaining),
    formatDiagnosticMean(bucket.greaterHealPotionsRemaining),
    formatDiagnosticMean(bucket.recoveryPotionsRemaining),
    formatDiagnosticMean(bucket.cureItemsRemaining),
    formatDiagnosticMean(bucket.fleeAttempts),
    formatDiagnosticCounts(bucket.statusAtEnd)
  ];
  return `| ${columns.join(" | ")} |`;
}

export function renderDiagnosticsMarkdown(cases) {
  const retreatRows = [];
  const deathRows = [];
  const includeClass = cases.some(testCase =>
    testCase.depths.some(depth => Boolean(depth.diagnosticsByClass))
  );
  cases.forEach(testCase => {
    testCase.depths.forEach(depth => {
      const diagnosticSets = depth.diagnosticsByClass
        ? Object.entries(depth.diagnosticsByClass)
        : [[null, depth.diagnostics]];
      diagnosticSets.forEach(([className, diagnostics]) => {
        if (!diagnostics) return;
        Object.entries(diagnostics.byRetreatReason || {})
          .filter(([, bucket]) => bucket.runs > 0)
          .sort(([left], [right]) => left.localeCompare(right))
          .forEach(([reason, bucket]) => {
            retreatRows.push(formatDiagnosticRow({
              scenarioId: testCase.scenarioId,
              className,
              depth: depth.depth,
              label: reason,
              bucket,
              signals: true,
              includeClass
            }));
          });
        Object.entries(diagnostics.byDeathCause || {})
          .filter(([, bucket]) => bucket.runs > 0)
          .sort(([left], [right]) => left.localeCompare(right))
          .forEach(([cause, bucket]) => {
            deathRows.push(formatDiagnosticRow({
              scenarioId: testCase.scenarioId,
              className,
              depth: depth.depth,
              label: cause,
              bucket,
              includeClass
            }));
          });
      });
    });
  });
  if (retreatRows.length === 0 && deathRows.length === 0) return [];
  return [
    "## Run-level diagnostics",
    "",
    "Retreat and death diagnostics are separated; resource columns are means for the runs in each primary-reason/cause bucket.",
    "",
    ...(retreatRows.length > 0 ? [
      "### Retreats",
      "",
      "Primary reason is the row label; reason signals may overlap and include the primary reason.",
      "",
      `| Scenario | ${includeClass ? "Class | " : ""}Target | Primary retreat reason | Runs | End floors | Reason signals (overlap) | HP rate | MP rate | Heal potions | Greater heal | Recovery potions | Cure items | Flee attempts | Status at end |`,
      `| --- | ${includeClass ? "--- | " : ""}--- | --- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |`,
      ...retreatRows,
      ""
    ] : []),
    ...(deathRows.length > 0 ? [
      "### Deaths",
      "",
      "Death rows are grouped by death cause and never mixed into retreat resource means.",
      "",
      `| Scenario | ${includeClass ? "Class | " : ""}Target | Death cause | Runs | End floors | HP rate | MP rate | Heal potions | Greater heal | Recovery potions | Cure items | Flee attempts | Status at end |`,
      `| --- | ${includeClass ? "--- | " : ""}--- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |`,
      ...deathRows,
      ""
    ] : []),
    ""
  ];
}

export function summarizeSimulationResults({ config, provenance, scenarioResults, nodeVersion = process.version, execution = null }) {
  const cases = scenarioResults.map(({ scenarioId, results, classResults }) => {
    const selectedClassResults = classResults || [{ className: null, results }];
    const summarizedByClass = selectedClassResults.map(classResult => ({
      className: classResult.className,
      depths: summarizeClassDepths(config, classResult)
    }));
    return {
      scenarioId,
      targetDepths: config.targetDepths,
      depths: config.targetDepths.map(depth => {
        const depthByClass = Object.fromEntries(
          summarizedByClass.map(({ className, depths }) => [className || "overall", depths[depth]])
        );
        const first = depthByClass.overall || depthByClass[config.classNames?.[0]];
        return {
          depth,
          runs: first?.metrics ? first.metrics.reachedRate.trials : 0,
          ...(classResults
            ? {
                metricsByClass: Object.fromEntries(
                  summarizedByClass.map(({ className, depths }) => [className, depths[depth].metrics])
                ),
                outcomeCountsByClass: Object.fromEntries(
                  summarizedByClass.map(({ className, depths }) => [className, depths[depth].outcomeCounts])
                ),
                diagnosticsByClass: Object.fromEntries(
                  summarizedByClass.map(({ className, depths }) => [className, depths[depth].diagnostics])
                )
              }
            : {
                metrics: first.metrics,
                outcomeCounts: first.outcomeCounts,
                averageTimeCost: first.averageTimeCost,
                averageMaterialAcquired: first.averageMaterialAcquired,
                averageMaterialConsumed: first.averageMaterialConsumed,
                bankedMaterialEv: first.bankedMaterialEv,
                materialEvPerTime: first.materialEvPerTime,
                diagnostics: first.diagnostics
              })
        };
      })
    };
  });
  const measurement = {
    schemaVersion: BALANCE_MEASUREMENT_SCHEMA_VERSION,
    runnerVersion: BALANCE_MEASUREMENT_RUNNER_VERSION,
    profile: config.profile,
    comparisonKey: config.comparisonKey,
    productionBaselineSha: provenance.baseCommit,
    sourceCommit: provenance.sourceCommit,
    simulatorRunnerCommit: provenance.measurementRunnerCommit,
    runnerPath: "scratch/measurements/measure_balance.js",
    simulatorRunnerPaths: provenance.measurementRunnerPaths,
    simulatorRunnerDiffSha256: provenance.measurementRunnerDiffSha256,
    originMainAncestor: provenance.originMainAncestor,
    staleTreeAllowed: provenance.staleTreeAllowed,
    workingTreeClean: provenance.workingTreeClean,
    nodeVersion,
    seedPolicy: config.seedPolicy,
    configuration: config,
    execution,
    modeledMitigations: [
      "production TOWN_PORTAL retreat policy",
      "status-cure consumables and EV policy",
      "production equipment generation and core/support scoring",
      "round-resolved rewards and level-ups"
    ],
    omittedMechanisms: [
      "manual UI choices and live analytics transport",
      "unconfigured player-policy variants",
      "PR-time Monte Carlo execution"
    ]
  };
  return { measurement, cases };
}

function compareIntervals(left, right) {
  if (!left || !right || !left.ci95 || !right.ci95) return [null, null];
  return [right.ci95[0] - left.ci95[1], right.ci95[1] - left.ci95[0]];
}

function toleranceFor(rule, baselineEstimate) {
  return rule.tolerance.kind === "relative"
    ? Math.abs(baselineEstimate || 0) * rule.tolerance.value
    : rule.tolerance.value;
}

function evaluateMetric(baseline, candidate, rule) {
  if (!Number.isFinite(baseline.estimate) || !Number.isFinite(candidate.estimate)) {
    return {
      status: "unobserved",
      reason: "metric has no observed denominator in one report"
    };
  }
  if (baseline.trials < 30 || candidate.trials < 30) {
    return {
      status: "uncertain",
      reason: "rate denominator is below N=30 in one report",
      baseline: baseline.estimate,
      candidate: candidate.estimate,
      baselineTrials: baseline.trials,
      candidateTrials: candidate.trials
    };
  }
  const delta = candidate.estimate - baseline.estimate;
  const differenceCi95 = compareIntervals(baseline, candidate);
  const adverseDelta = rule.direction === "higher" ? -delta : delta;
  const adverseCi95 = rule.direction === "higher"
    ? [-differenceCi95[1], -differenceCi95[0]]
    : differenceCi95;
  const tolerance = toleranceFor(rule, baseline.estimate);
  const status = adverseDelta <= tolerance
    ? "pass"
    : adverseCi95[0] > tolerance
      ? "fail"
      : "uncertain";
  return {
    status,
    direction: rule.direction,
    tolerance,
    baseline: baseline.estimate,
    candidate: candidate.estimate,
    delta,
    differenceCi95,
    baselineCi95: baseline.ci95,
    candidateCi95: candidate.ci95,
    baselineTrials: baseline.trials,
    candidateTrials: candidate.trials
  };
}

function measurementMetricEntries(report) {
  return report.cases.flatMap(testCase => testCase.depths.flatMap(depth => {
    const metricSets = depth.metricsByClass
      ? Object.entries(depth.metricsByClass).map(([className, metrics]) => ({ className, metrics }))
      : [{ className: null, metrics: depth.metrics }];
    return metricSets.flatMap(({ className, metrics }) =>
      Object.entries(metrics || {})
        .filter(([name]) => Object.hasOwn(REGRESSION_RULES, name))
        .map(([name, metric]) => ({
          key: [testCase.scenarioId, className, `B${depth.depth}`, name].filter(Boolean).join("."),
          name,
          metric
        }))
    );
  }));
}

export function compareBalanceMeasurements(baseline, candidate) {
  if (baseline.measurement.schemaVersion !== BALANCE_MEASUREMENT_SCHEMA_VERSION ||
      candidate.measurement.schemaVersion !== BALANCE_MEASUREMENT_SCHEMA_VERSION) {
    throw new Error("measurement schema version mismatch");
  }
  if (baseline.measurement.comparisonKey !== candidate.measurement.comparisonKey) {
    throw new Error(
      `measurement configuration mismatch: ${baseline.measurement.comparisonKey} != ${candidate.measurement.comparisonKey}`
    );
  }
  if (baseline.measurement.productionBaselineSha !== candidate.measurement.productionBaselineSha) {
    throw new Error(
      `production baseline mismatch: ${baseline.measurement.productionBaselineSha} != ${candidate.measurement.productionBaselineSha}`
    );
  }
  const baselineMetrics = new Map(measurementMetricEntries(baseline).map(entry => [entry.key, entry]));
  const candidateMetrics = new Map(measurementMetricEntries(candidate).map(entry => [entry.key, entry]));
  const keys = [...new Set([...baselineMetrics.keys(), ...candidateMetrics.keys()])].sort();
  const metrics = keys.map(key => {
    const left = baselineMetrics.get(key);
    const right = candidateMetrics.get(key);
    if (!left || !right) return { key, status: "fail", reason: "metric missing from one report" };
    return { key, ...evaluateMetric(left.metric, right.metric, REGRESSION_RULES[left.name]) };
  });
  const status = metrics.some(metric => metric.status === "fail")
    ? "fail"
    : metrics.some(metric => ["uncertain", "unobserved"].includes(metric.status))
      ? "uncertain"
      : "pass";
  return {
    schemaVersion: BALANCE_MEASUREMENT_SCHEMA_VERSION,
    runnerVersion: BALANCE_MEASUREMENT_RUNNER_VERSION,
    comparisonKey: baseline.measurement.comparisonKey,
    baseline: {
      sourceCommit: baseline.measurement.sourceCommit,
      productionBaselineSha: baseline.measurement.productionBaselineSha
    },
    candidate: {
      sourceCommit: candidate.measurement.sourceCommit,
      productionBaselineSha: candidate.measurement.productionBaselineSha
    },
    status,
    metrics
  };
}

export function renderComparisonMarkdown(comparison) {
  const lines = [
    `# Balance measurement comparison (${comparison.status})`,
    "",
    `- runner: ${comparison.runnerVersion}`,
    `- comparison key: \`${comparison.comparisonKey}\``,
    `- baseline source: \`${comparison.baseline.sourceCommit}\``,
    `- candidate source: \`${comparison.candidate.sourceCommit}\``,
    "",
    "| Metric | Status | Baseline | Candidate | Delta | Difference CI95 | Tolerance |",
    "| --- | --- | ---: | ---: | ---: | --- | ---: |",
    ...comparison.metrics.map(metric => metric.reason
      ? `| ${metric.key} | **${metric.status}** | — | — | — | ${metric.reason} | — |`
      : `| ${metric.key} | ${metric.status} | ${metric.baseline.toFixed(4)} | ${metric.candidate.toFixed(4)} | ${metric.delta.toFixed(4)} | [${metric.differenceCi95.map(value => value.toFixed(4)).join(", ")}] | ${metric.tolerance.toFixed(4)} |`),
    "",
    "`uncertain` means the observed difference exceeded the practical tolerance, but the conservative interval still overlaps the tolerance boundary; it is not treated as a confirmed regression."
  ];
  return `${lines.join("\n")}\n`;
}

export { RATE_METRIC_NAMES };
