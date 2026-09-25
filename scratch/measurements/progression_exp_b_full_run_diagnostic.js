// sim-scope: run — Phase 4c v1 baseline with production vs fixed Phase 4j-B EXP
/* global console, process */

import "../simulations/simulation_preflight.js";
import fs from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { EXP_LEVELS } from "../../src/data/progression.js";
import { PROGRESSION_ENEMY_CANDIDATE as PHASE4C_V1 } from "./progression_enemy_candidate_contract.js";
import { requireRunnerProvenance } from "./measurement_provenance.js";
import { readSimScopeDeclaration } from "./measurement_env_signature.js";

export const RUNNER_VERSION = "progression-exp-b-full-run-diagnostic-v1";
export const SCHEMA_VERSION = 1;
export const RUNNER_PATH = "scratch/measurements/progression_exp_b_full_run_diagnostic.js";
export const DEFAULT_SEED = 1735;
const PRODUCTION_PATHS = Object.freeze([
  RUNNER_PATH,
  "scratch/simulations/sim_depth_material_ev.js",
  "scratch/measurements/progression_enemy_candidate_contract.js",
  "scratch/measurements/progression_exp_award_integration.js",
  "scratch/measurements/progression_exp_award_lifecycle.js",
  "scratch/measurements/progression_exp_award_paired_inventory.js",
  "src/combat_ui/encounter.js",
  "src/data/biomes.js",
  "src/data/encounters.js",
  "src/data/floor_trials.js",
  "src/data/monsters.js",
  "src/data/progression.js",
  "src/rules/depth_scaling.js",
  "src/rules/floor_trials.js",
  "src/systems/leveling.ts"
]);
export const CONTEXTS = Object.freeze([
  Object.freeze({ id: "continuous-B1", startFloor: 1, targetDepth: 21 }),
  Object.freeze({ id: "selected-B10", startFloor: 10, targetDepth: 11 }),
  Object.freeze({ id: "selected-B20", startFloor: 20, targetDepth: 21 })
]);
export const ARMS = Object.freeze(["production", "phase4j-b"]);
const { resetSimulationRandom, simulateRun, getScenarioById } = await import("../simulations/sim_depth_material_ev.js");

function positiveInteger(value, name, minimum = 1) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) throw new Error(`${name} must be an integer >= ${minimum}`);
  return parsed;
}

function countPrefundedLevels(level, exp) {
  let count = 0;
  for (let nextLevel = level + 1; nextLevel < EXP_LEVELS.length; nextLevel++) {
    if (exp < EXP_LEVELS[nextLevel]) break;
    count++;
  }
  return count;
}

function stableFirstCombat(observations) {
  const first = observations[0];
  if (!first) return null;
  const preRewardState = {
    floor: first.floor,
    baseline: first.phase4cV1Baseline,
    enemyBand: first.phase4cV1EnemyBand,
    level: first.preRewardState.level,
    exp: first.preRewardState.exp,
    hp: first.preRewardState.hp,
    rawMaxHp: first.preRewardState.rawMaxHp,
    enemies: first.preRewardState.enemies.map(({ name, hp, maxHp, atk, def, isBoss }) => ({ name, hp, maxHp, atk, def, isBoss }))
  };
  return { preRewardState, outcome: first.result };
}

function projectRun(context, arm, runIndex, worldSeed, result) {
  const observations = result.combatExpCandidate.observations;
  const settlements = observations.map(observation => {
    const prefundedLevels = countPrefundedLevels(observation.levelAfter, observation.characterExpAfter);
    const valid = observation.settlementCoverageValid === true;
    const sourceAccounted = observation.combatOnlyLedgerDelta === observation.characterCombatExpDelta;
    return {
      floor: observation.floor,
      combatNumber: observation.combatNumber,
      awardMode: observation.awardMode,
      productionTotalAward: observation.productionTotalAward,
      candidateTotalAward: observation.candidateExp,
      selectedAwardExp: observation.selectedAwardExp,
      kind: observation.kind,
      result: observation.result,
      levelBefore: observation.levelBefore,
      levelAfter: observation.levelAfter,
      expBefore: observation.characterExpBefore,
      expEarned: observation.characterExpDelta,
      expAfter: observation.characterExpAfter,
      nextThreshold: EXP_LEVELS[observation.levelAfter + 1] ?? null,
      prefundedLevels,
      levelUpRecoveryHp: observation.levelUpRecoveryHp,
      levelDerivedRawMaxHp: Math.max(0, observation.rawMaxHpAfter - 20 - 2 * (observation.phase4cV1Baseline || 0)),
      baseline: observation.phase4cV1Baseline,
      enemyBand: observation.phase4cV1EnemyBand,
      settlement: {
        valid,
        coverageGaps: observation.settlementCoverageGaps,
        expectedLifecycleBudget: observation.expectedCandidateSettlementBudget,
        combatLedgerDelta: observation.combatOnlyLedgerDelta,
        characterCombatExpDelta: observation.characterCombatExpDelta,
        sourceAccounted,
        initialFledIndices: observation.initialFledIndices,
        descendantCount: observation.descendantCount,
        descendantCandidateExp: observation.descendantCandidateExp,
        descendants: observation.descendantStats || []
      },
      lifecycle: {
        initialCount: observation.initialEncounterSize,
        splitCapable: observation.initialEnemies.some(enemy => enemy.hasSplit),
        summonCapable: observation.initialEnemies.some(enemy => enemy.hasSummon),
        initialFledCount: observation.initialFledIndices.length
      }
    };
  });
  const levelArrivalCombatCount = {};
  for (const settlement of settlements) {
    for (let level = settlement.levelBefore + 1; level <= settlement.levelAfter; level++) {
      levelArrivalCombatCount[level] ??= settlement.combatNumber;
    }
  }
  const firstCombat = stableFirstCombat(observations);
  if (!firstCombat) throw new Error(`${context.id}/${arm}/${runIndex}: no eligible generated combat for first-combat regression`);
  return {
    context: context.id,
    arm,
    runIndex,
    worldSeed,
    outcome: result.died ? "death" : /flee/i.test(result.terminationReason || "") ? "flee" : "return",
    targetReached: result.reachedFloor >= context.targetDepth,
    terminationReason: result.terminationReason,
    reachedFloor: result.reachedFloor,
    deathFloor: result.deathFloor,
    deathCause: result.deathCause,
    battles: result.battles,
    settlementCounts: {
      valid: settlements.filter(settlement => settlement.settlement.valid).length,
      nonVictory: settlements.filter(settlement => settlement.result !== "victory").length,
      flee: settlements.filter(settlement => settlement.result === "flee").length,
      lifecycleGaps: observations.reduce((sum, observation) => sum + observation.settlementCoverageGaps.length, 0),
      splitCapable: settlements.filter(settlement => settlement.lifecycle.splitCapable).length,
      summonCapable: settlements.filter(settlement => settlement.lifecycle.summonCapable).length
    },
    levelArrivalCombatCount,
    finalLevel: result.finalLevel,
    expGained: result.expGained,
    characterExpGained: result.characterExpGained,
    combatExpCandidateId: result.combatExpCandidate.id,
    candidateCoverageGaps: result.combatExpCandidate.coverageGaps,
    settlements,
    firstCombat
  };
}

export function comparePreDeathProgress(control, candidate) {
  const deathCombatNumber = candidate.settlements.find(settlement => settlement.result === "death")?.combatNumber;
  const deathOccurred = candidate.outcome === "death" || Number.isInteger(deathCombatNumber);
  // Exclude a combat that caused death; otherwise include all combats completed by death.
  const lastIncludedCombatNumber = !deathOccurred
    ? 0
    : Number.isInteger(deathCombatNumber)
      ? Math.max(0, deathCombatNumber - 1)
      : Math.max(0, Number.isInteger(candidate.battles) ? candidate.battles : 0);
  const summarize = row => row.settlements
    .filter(settlement => settlement.combatNumber <= lastIncludedCombatNumber)
    .reduce((totals, settlement) => ({
      levels: totals.levels + Math.max(0, settlement.levelAfter - settlement.levelBefore),
      recoveryHp: totals.recoveryHp + settlement.levelUpRecoveryHp
    }), { levels: 0, recoveryHp: 0 });
  const controlBeforeDeath = summarize(control);
  const candidateBeforeDeath = summarize(candidate);
  return {
    deathCombatNumber: Number.isInteger(deathCombatNumber) ? deathCombatNumber : null,
    deathBoundary: !deathOccurred
      ? "none"
      : Number.isInteger(deathCombatNumber)
        ? "combat-exclusive"
        : "noncombat-inclusive",
    lastIncludedCombatNumber,
    controlBeforeDeath,
    candidateBeforeDeath,
    controlOnlyProgress: deathOccurred && (
      controlBeforeDeath.levels > candidateBeforeDeath.levels ||
      controlBeforeDeath.recoveryHp > candidateBeforeDeath.recoveryHp
    )
  };
}

export async function runProgressionExpBFullRunDiagnostic({ runs = 1, seed = DEFAULT_SEED } = {}) {
  const count = positiveInteger(runs, "runs");
  if (![1, 30, 200].includes(count)) throw new Error("runs must be exactly 1 (smoke), 30 (coverage), or 200 (final evidence)");
  const rootSeed = positiveInteger(seed, "seed");
  if (rootSeed !== DEFAULT_SEED) throw new Error(`seed is frozen at ${DEFAULT_SEED}`);
  const rows = [];
  for (const context of CONTEXTS) {
    for (let runIndex = 0; runIndex < count; runIndex++) {
      const worldSeed = `phase4j-b:${rootSeed}:${context.id}:${runIndex}`;
      for (const arm of ARMS) {
        resetSimulationRandom(worldSeed);
        const scenario = {
          ...getScenarioById("legacy-no-portal"),
          startingKit: "arcana",
          phase4cV1GeneratedRun: true,
          expAwardCandidate: arm
        };
        const result = simulateRun({
          className: "Mage",
          startFloor: context.startFloor,
          targetDepth: context.targetDepth,
          runIndex,
          seriesId: `phase4j-b-full-run:${context.id}:${arm}`,
          worldSeed,
          scoringProfile: null,
          scenario
        });
        rows.push(projectRun(context, arm, runIndex, worldSeed, result));
      }
    }
  }
  const pairs = CONTEXTS.map(context => {
    const control = rows.filter(row => row.context === context.id && row.arm === "production");
    const candidate = rows.filter(row => row.context === context.id && row.arm === "phase4j-b");
    if (control.length !== count || candidate.length !== count) throw new Error(`${context.id}: sample count mismatch`);
    for (let index = 0; index < count; index++) {
      if (control[index].worldSeed !== candidate[index].worldSeed) throw new Error(`${context.id}: matched-seed mismatch`);
      if (JSON.stringify(control[index].firstCombat) !== JSON.stringify(candidate[index].firstCombat)) {
        throw new Error(`${context.id}/${index}: first combat pre-reward state/outcome differs between EXP arms`);
      }
    }
    return {
      context: context.id,
      matchedSeedDescriptiveOnly: true,
      transitions: control.map((row, index) => {
        const attribution = comparePreDeathProgress(row, candidate[index]);
        const newDeath = candidate[index].outcome === "death" && row.outcome !== "death";
        return {
          runIndex: index,
          from: row.outcome,
          to: candidate[index].outcome,
          reachedFloorDelta: candidate[index].reachedFloor - row.reachedFloor,
          finalLevelDelta: candidate[index].finalLevel - row.finalLevel,
          newDeath,
          deathAvoided: row.outcome === "death" && candidate[index].outcome !== "death",
          newDeathHadEarlierControlLevelOrRecovery: newDeath && attribution.controlOnlyProgress,
          newDeathAttribution: newDeath ? attribution : null
        };
      })
    };
  });
  const invalidCandidatePrefund = rows.filter(row => row.arm === "phase4j-b")
    .flatMap(row => row.settlements.filter(settlement => settlement.prefundedLevels > 0)
      .map(settlement => ({ context: row.context, runIndex: row.runIndex, floor: settlement.floor, prefundedLevels: settlement.prefundedLevels })));
  const invalidCandidateSettlements = rows.filter(row => row.arm === "phase4j-b")
    .flatMap(row => row.settlements.filter(settlement => settlement.result === "victory" && !settlement.settlement.valid)
      .map(settlement => ({ context: row.context, runIndex: row.runIndex, floor: settlement.floor, gaps: settlement.settlement.coverageGaps })));
  const sourceMismatches = rows.flatMap(row => row.settlements
    .filter(settlement => !settlement.settlement.sourceAccounted)
    .map(settlement => ({ context: row.context, arm: row.arm, runIndex: row.runIndex, floor: settlement.floor })));
  return {
    runnerVersion: RUNNER_VERSION,
    schemaVersion: SCHEMA_VERSION,
    status: "diagnostic-only",
    configuration: {
      runs: count,
      seed: rootSeed,
      contexts: CONTEXTS,
      arms: ARMS,
      build: "Mage / arcana",
      phase4cV1: {
        playerPhysical: "1 + 0.16 × baseline",
        playerSpell: "1 + 0.16 × baseline",
        level1MaxHp: "20 × (1 + 0.10 × baseline)",
        enemyHp: "1 + 0.20 × band",
        enemyAttack: "1 + 0.10 × band",
        enemyDefense: 1,
        authoredBossExceptions: "production owner"
      },
      phase4jB: "fixed candidate via production EXP award allocation and lifecycle",
      comparison: "same root seed/context/runIndex; matched-seed descriptive comparison only after divergence",
      productionDefaultOptIn: "phase4cV1GeneratedRun=true; absent/false leaves simulator path unchanged",
      expThresholds: EXP_LEVELS
    },
    validity: {
      firstCombatPreRewardStateAndOutcomeMatch: true,
      candidatePrefundedLevelViolations: invalidCandidatePrefund,
      invalidCandidateSettlements,
      sourceAccountingMismatches: sourceMismatches,
      valid: invalidCandidatePrefund.length === 0 && invalidCandidateSettlements.length === 0 && sourceMismatches.length === 0
    },
    rows,
    matchedSeedSummaries: pairs
  };
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index++) {
    const [key, inline] = argv[index].replace(/^--/, "").split("=", 2);
    values[key] = inline ?? argv[++index];
  }
  return values;
}

function summarize(values) {
  const ordered = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!ordered.length) return "no observations";
  const quantile = p => {
    const position = (ordered.length - 1) * p;
    const lower = Math.floor(position);
    return ordered[lower] + (ordered[Math.ceil(position)] - ordered[lower]) * (position - lower);
  };
  return `n=${ordered.length}, mean=${(ordered.reduce((sum, value) => sum + value, 0) / ordered.length).toFixed(2)}, p10=${quantile(0.1)}, p50=${quantile(0.5)}, p90=${quantile(0.9)}, min=${ordered[0]}, max=${ordered.at(-1)}`;
}

function makeSummary(report) {
  const lines = [
    "# Phase 4c v1 / Phase 4j-B full-run diagnostic",
    "",
    `- Runs/context/arm: ${report.configuration.runs}; root seed: ${report.configuration.seed}; build: Mage / arcana.`,
    "- Same world seed/context/run index per EXP arm. Post-divergence outcomes are matched-seed descriptive evidence, not paired causal estimates.",
    "- Production default: no-op unless `phase4cV1GeneratedRun=true` is set in the simulator scenario.",
    ""
  ];
  for (const context of CONTEXTS) {
    lines.push(`## ${context.id}`, "");
    for (const arm of ARMS) {
      const rows = report.rows.filter(row => row.context === context.id && row.arm === arm);
      const outcomes = Object.fromEntries(["death", "flee", "return"].map(outcome => [
        outcome,
        rows.filter(row => row.outcome === outcome).length
      ]));
      const settlements = rows.flatMap(row => row.settlements);
      const descendants = settlements.flatMap(settlement => settlement.settlement.descendants);
      const levelIds = [...new Set(rows.flatMap(row => Object.keys(row.levelArrivalCombatCount)))].sort((a, b) => Number(a) - Number(b));
      const levelArrivalCombatCount = Object.fromEntries(levelIds.map(level => [
        level,
        summarize(rows.map(row => row.levelArrivalCombatCount[level]))
      ]));
      const kindCounts = settlements.reduce((counts, settlement) => {
        counts[settlement.kind] = (counts[settlement.kind] || 0) + 1;
        return counts;
      }, {});
      lines.push(
        `### ${arm}`,
        `- Outcomes: ${JSON.stringify(outcomes)}; target reached=${rows.filter(row => row.targetReached).length}; reached floor: ${summarize(rows.map(row => row.reachedFloor))}; death floor: ${summarize(rows.map(row => row.deathFloor))}.`,
        `- Battles: ${summarize(rows.map(row => row.battles))}; final Level: ${summarize(rows.map(row => row.finalLevel))}; combat EXP: ${summarize(rows.map(row => row.expGained))}; character EXP: ${summarize(rows.map(row => row.characterExpGained))}.`,
        `- Level arrival combat count: ${JSON.stringify(levelArrivalCombatCount)}; level-up recovery HP: ${summarize(rows.map(row => row.settlements.reduce((sum, item) => sum + item.levelUpRecoveryHp, 0)))}; cumulative Level-derived raw maxHP: ${summarize(rows.map(row => Math.max(0, ...row.settlements.map(item => item.levelDerivedRawMaxHp))))}.`,
        `- Valid settlements: ${rows.reduce((sum, row) => sum + row.settlementCounts.valid, 0)}; non-victory: ${rows.reduce((sum, row) => sum + row.settlementCounts.nonVictory, 0)}; flee: ${rows.reduce((sum, row) => sum + row.settlementCounts.flee, 0)}; lifecycle gaps: ${rows.reduce((sum, row) => sum + row.settlementCounts.lifecycleGaps, 0)}.`,
        `- Encounter kinds: ${JSON.stringify(kindCounts)}; candidate lifecycle triggers: split=${rows.reduce((sum, row) => sum + row.settlementCounts.splitCapable, 0)}, summon=${rows.reduce((sum, row) => sum + row.settlementCounts.summonCapable, 0)}; candidate prefund violations: ${report.validity.candidatePrefundedLevelViolations.length}; source accounting mismatches: ${report.validity.sourceAccountingMismatches.length}.`,
        `- Descendant lifecycle: split=${descendants.filter(monster => monster.isSplit).length}; summon=${descendants.filter(monster => monster.isSummoned).length}; summoned generic HP/ATK/DEF captured=${descendants.filter(monster => monster.isSummoned).length}.`,
        ""
      );
    }
  }
  for (const group of report.matchedSeedSummaries) {
    const transitions = group.transitions;
    lines.push(
      `## Matched-seed description: ${group.context}`,
      `- Outcome transitions: ${JSON.stringify(transitions.reduce((counts, row) => { const key = `${row.from}->${row.to}`; counts[key] = (counts[key] || 0) + 1; return counts; }, {}))}.`,
      `- New deaths: ${transitions.filter(row => row.newDeath).length}; deaths avoided: ${transitions.filter(row => row.deathAvoided).length}; new deaths where control had earlier Level/recovery and candidate did not: ${transitions.filter(row => row.newDeathHadEarlierControlLevelOrRecovery).length}.`,
      ""
    );
  }
  lines.push(`Validity: ${report.validity.valid ? "PASS" : "FAIL"}. This diagnostic does not establish a balance conclusion.`);
  return `${lines.join("\n")}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.output || !options.summary || !options.manifest) throw new Error("--output, --summary, and --manifest are required");
  const runs = positiveInteger(options.runs || 30, "runs");
  if (![30, 200].includes(runs)) throw new Error("Actions measurement runs must be exactly 30 or 200");
  const seed = positiveInteger(options.seed || DEFAULT_SEED, "seed");
  if (seed !== DEFAULT_SEED) throw new Error(`Actions measurement seed is frozen at ${DEFAULT_SEED}`);
  const provenance = requireRunnerProvenance({ fetchOriginMain: false, measurementRunnerPaths: PRODUCTION_PATHS });
  const report = await runProgressionExpBFullRunDiagnostic({ runs, seed });
  report.measurement = {
    scope: readSimScopeDeclaration(import.meta.url)?.name || "run",
    sourceCommit: provenance?.sourceCommit || null,
    gameplaySourceCommit: provenance?.gameplaySourceCommit || null,
    measurementRunnerCommit: provenance?.measurementRunnerCommit || null,
    measurementRunnerPaths: provenance?.measurementRunnerPaths || PRODUCTION_PATHS,
    measurementRunnerDiffSha256: provenance?.measurementRunnerDiffSha256 || null,
    originMainAncestor: provenance?.originMainAncestor ?? null,
    workingTreeClean: provenance?.workingTreeClean ?? null,
    workflow: {
      repository: process.env.MEASUREMENT_REPOSITORY || null,
      runId: process.env.MEASUREMENT_WORKFLOW_RUN_ID || null,
      runAttempt: process.env.MEASUREMENT_RUN_ATTEMPT || null,
      runUrl: process.env.MEASUREMENT_WORKFLOW_RUN_URL || null
    }
  };
  fs.writeFileSync(resolve(options.output), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(resolve(options.summary), makeSummary(report));
  fs.writeFileSync(resolve(options.manifest), `${JSON.stringify({ schemaVersion: SCHEMA_VERSION, status: report.validity.valid ? "success" : "invalid", runner: RUNNER_VERSION, source: report.measurement, configuration: report.configuration }, null, 2)}\n`);
  if (!report.validity.valid) throw new Error("Phase 4j-B full-run diagnostic validity gate failed");
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
}
