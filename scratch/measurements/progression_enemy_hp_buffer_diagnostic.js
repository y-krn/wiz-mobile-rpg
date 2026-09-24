// sim-scope: run — paired fixed-combat milestone HP buffer diagnostic
/* global console, process */

import "../simulations/simulation_preflight.js";
import fs from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { deriveProgressionEnemyRunSeed, PROGRESSION_ENEMY_HP_BUFFER_ARMS as ARMS, PROGRESSION_ENEMY_HP_BUFFER_CANDIDATE as CANDIDATE, PROGRESSION_ENEMY_DIAGNOSTIC_CONTEXTS } from "./progression_enemy_hp_buffer_contract.js";
import { MONSTERS } from "../../src/data/monsters.js";
import { requireRunnerProvenance } from "./measurement_provenance.js";
import { printEnvSignatureBanner, readSimScopeDeclaration } from "./measurement_env_signature.js";

export const RUNNER_VERSION = "progression-enemy-hp-buffer-diagnostic-v1";
export const SCHEMA_VERSION = 1;
export const RUNNER_PATH = "scratch/measurements/progression_enemy_hp_buffer_diagnostic.js";
const DEFAULT_RUNS = 200;
const DEFAULT_SEED = 1696;
const FIXTURES = Object.freeze([
  Object.freeze({ id: "physical", className: "Fighter", startingKit: "vanguard", fixtureId: null, guard: false }),
  Object.freeze({ id: "spell", className: "Mage", startingKit: "arcana", fixtureId: null, guard: false }),
  Object.freeze({ id: "defensive-guard", className: "Priest", startingKit: "devotion", fixtureId: null, guard: true })
]);
const { resetSimulationRandom, simulateRun } = await import("../simulations/sim_depth_material_ev.js");

const MOBS = Object.freeze({
  physical: "コボルトの斥候",
  spell: "ゴブリンの呪術師",
  "defensive-guard": "錆びた盾兵"
});

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const [key, inline] = argv[i].slice(2).split("=", 2);
    out[key] = inline ?? argv[++i];
  }
  return out;
}

function positiveInteger(value, name, min) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min) throw new Error(`${name} must be an integer >= ${min}`);
  return number;
}

export function isPlayerBeforeAnyEnemy(rounds) {
  return rounds?.[0]?.playerActionExecutionTiming === "player-before-any-enemy";
}

function summarize(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const quantile = p => {
    if (!sorted.length) return null;
    const position = (sorted.length - 1) * p;
    const lower = Math.floor(position);
    return sorted[lower] + (sorted[Math.ceil(position)] - sorted[lower]) * (position - lower);
  };
  return {
    count: sorted.length,
    mean: sorted.length ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length : null,
    p50: quantile(0.5), p95: quantile(0.95), min: sorted[0] ?? null, max: sorted.at(-1) ?? null
  };
}

function describe(result, { context, fixture, arm, seed, runIndex }) {
  const identity = result.encounterIdentityLog?.[0];
  const encounter = result.diagnostics?.encounters?.[0];
  const rounds = encounter?.rounds || [];
  if (!identity || !rounds.length) throw new Error("production fixed-combat diagnostic omitted encounter metrics");
  const playerActions = rounds.filter(round => round.playerActionExecuted).length;
  const guardOpportunities = rounds.filter(round => round.hpBefore > 0 && round.enemyActionEvents?.length > 0).length;
  const enemyHpStart = (encounter.monsters || []).reduce((sum, monster) => sum + Number(monster.maxHp || monster.hp || 0), 0);
  const enemyHpEnd = (encounter.endEnemyHp || []).reduce((sum, entry) => sum + Number(entry?.hp || 0), 0);
  const template = MONSTERS.find(monster => monster.name === MOBS[fixture.id]);
  const resolvedEnemy = encounter.monsters?.[0] || {};
  const actualHpMultiplier = template ? Number(resolvedEnemy.maxHp) / template.hp : null;
  const actualAttackMultiplier = template ? Number(resolvedEnemy.atk) / template.atk : null;
  const actualDefenseMultiplier = CANDIDATE.enemyDefenseMultiplier;
  return {
    contextId: `${context.kind}-B${context.floor}`,
    timing: context.kind,
    floor: context.floor,
    baselineIndex: context.baseline,
    baselineSource: context.kind,
    enemyBandIndex: context.enemyBand,
    fixtureId: fixture.id,
    layer: fixture.level === 2 ? "run-local-level-delta" : "fixed-generic-combat",
    level: fixture.level,
    arm: arm.id,
    runIndex,
    seed,
    survival: result.fixedCombatResult !== "death",
    death: result.fixedCombatResult === "death",
    outcome: result.fixedCombatResult,
    rounds: identity.rounds,
    damageDealt: Math.max(0, enemyHpStart - enemyHpEnd),
    damageTaken: identity.totalNormalDamage,
    postCombatHp: identity.hpAfter,
    maxHp: encounter.startMaxHp,
    enemyActions: identity.enemyActions,
    playerActions,
    playerBeforeAnyEnemy: isPlayerBeforeAnyEnemy(rounds),
    guardOpportunity: fixture.guard ? guardOpportunities : null,
    guardedActions: fixture.guard ? rounds.filter(round => round.action === "defend" && round.playerActionExecuted).length : null,
    spellActions: rounds.filter(round => round.spellName && round.playerActionExecuted).length,
    mpSpent: identity.mpSpent,
    resolved: {
      playerHpMultiplier: encounter.startMaxHp / 20,
      resolvedLevel1BaselineMaxHp: CANDIDATE.playerLevel1MaxHp(context.baseline),
      appliedMilestoneHpBuffer: arm.hpBuffer(context.baseline),
      resolvedLevel: fixture.level,
      resolvedFinalMaxHp: encounter.startMaxHp,
      productionLevelHpDelta: encounter.startMaxHp - CANDIDATE.playerLevel1MaxHp(context.baseline) - arm.hpBuffer(context.baseline),
      playerPhysicalMultiplier: CANDIDATE.playerPhysicalMultiplier(context.baseline),
      playerSpellMultiplier: CANDIDATE.playerSpellMultiplier(context.baseline),
      resolvedRawDefense: result.fixedCombat?.playerResolved?.rawDefense ?? null,
      resolvedIncomingPhysicalResistance: result.fixedCombat?.playerResolved?.incomingPhysicalResistance ?? null,
      appliedMilestoneRawDefenseBonus: result.fixedCombat?.playerResolved?.appliedMilestoneRawDefenseBonus ?? null,
      enemyHpMultiplier: actualHpMultiplier,
      enemyAttackMultiplier: actualAttackMultiplier,
      enemyDefenseMultiplier: actualDefenseMultiplier
    },
    levelSource: fixture.level === 2 ? "production EXP_LEVELS[2] threshold through checkCharLevelUp" : "Level 1 starting state"
  };
}

export async function runProgressionEnemyHpBufferDiagnostic({ runs = DEFAULT_RUNS, seed = DEFAULT_SEED } = {}) {
  const count = positiveInteger(runs, "runs", 1);
  const rootSeed = positiveInteger(seed, "seed", 1);
  const observations = [];
  for (const context of PROGRESSION_ENEMY_DIAGNOSTIC_CONTEXTS) {
    for (const fixture of FIXTURES) {
      for (const level of [1, 2]) for (let runIndex = 0; runIndex < count; runIndex++) {
        const pairedSeed = deriveProgressionEnemyRunSeed({ rootSeed, context, fixtureId: fixture.id, runIndex });
        for (const arm of ARMS) {
          resetSimulationRandom(pairedSeed);
          const playerCandidate = {
            physicalPowerMultiplier: CANDIDATE.playerPhysicalMultiplier(context.baseline),
            spellPowerMultiplier: CANDIDATE.playerSpellMultiplier(context.baseline),
            maxHpTarget: CANDIDATE.playerLevel1MaxHp(context.baseline) + arm.hpBuffer(context.baseline),
            rawDefenseBonus: arm.rawDefenseBonus(context.baseline)
          };
          const fixtureAtLevel = { ...fixture, level };
          const result = simulateRun({
            ...(fixture.fixtureId ? { fixtureId: fixture.fixtureId } : { className: fixture.className }),
            startFloor: context.floor,
            targetDepth: context.floor + 1,
            runIndex,
            seriesId: `progression-enemy:${context.kind}:${context.floor}:${fixture.id}`,
            scoringProfile: null,
            scenario: {
              startingKit: fixture.startingKit,
              fleePolicy: "never",
              consumablesAtDeparture: "none",
              ...(fixture.guard ? { measurementCombatPlan: "attack-defend", measurementGuardTiming: "declared" } : {}),
              collectEncounterIdentities: true,
              collectStage15Diagnostics: true,
              simDiagnosticLevel: "full",
              fixedCombat: {
                monsterNames: [MOBS[fixture.id]],
                entryHpRatio: 1,
                entryMpRatio: 1,
                scalingPolicy: "phase2a",
                ...(level === 2 ? { productionLevelDelta: 1 } : {}),
                ...(playerCandidate ? { playerCandidate } : {})
              }
            },
            workshop: { ranks: {} },
            worldSeed: pairedSeed,
            collectDiagnostics: true,
            collectCombatFormula: true
          });
          observations.push(describe(result, { context, fixture: fixtureAtLevel, arm, seed: pairedSeed, runIndex }));
        }
      }
    }
  }
  const groups = new Map();
  for (const row of observations) {
    const key = `${row.layer}/${row.contextId}/L${row.level}/${row.fixtureId}/${row.arm}`;
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }
  const summary = [...groups].map(([key, rows]) => ({
    key,
    n: rows.length,
    survivalRate: rows.filter(row => row.survival).length / rows.length,
    deathRate: rows.filter(row => row.death).length / rows.length,
    rounds: summarize(rows.map(row => row.rounds)),
    damageDealt: summarize(rows.map(row => row.damageDealt)),
    damageTaken: summarize(rows.map(row => row.damageTaken)),
    postCombatHp: summarize(rows.map(row => row.postCombatHp)),
    enemyActions: summarize(rows.map(row => row.enemyActions)),
    playerActions: summarize(rows.map(row => row.playerActions)),
    playerBeforeAnyEnemyRate: rows.filter(row => row.playerBeforeAnyEnemy).length / rows.length,
    guardOpportunity: summarize(rows.map(row => row.guardOpportunity)),
    guardedActions: summarize(rows.map(row => row.guardedActions)),
    spellActions: summarize(rows.map(row => row.spellActions)),
    mpSpent: summarize(rows.map(row => row.mpSpent))
  }));
  return {
    runnerVersion: RUNNER_VERSION,
    schemaVersion: SCHEMA_VERSION,
    status: "diagnostic-only",
    configuration: { runs: count, seed: rootSeed, pairedSeedKey: ["root seed", "milestone context", "fixture", "runIndex"], pairedArmsShareSeed: true, contexts: PROGRESSION_ENEMY_DIAGNOSTIC_CONTEXTS, fixtures: FIXTURES, arms: ARMS.map(arm => ({ id: arm.id, hpBuffer: arm.id === "v1" ? 0 : "baseline > 0 ? 1 : 0", rawDefenseBonus: 0 })), candidate: CANDIDATE.id },
    observations,
    summary
  };
}

function makeSummary(report) {
  return [
    "# Progression enemy HP buffer diagnostic",
    "",
    `- runner: ${RUNNER_VERSION}; seed: ${report.configuration.seed}; N=${report.configuration.runs}`,
    `- Phase 4c v1 vs hp-plus-one-capped; PR N<30 is correctness evidence only`,
    "- all observations use fixed generic combat; no Boss-authored rules, loot, Support, or Core scaling",
    "- Level delta uses the production Leveling contract and is emitted as a separate layer",
    "",
    "| Context / fixture / arm | N | Survival | Death | Rounds p50 | Damage dealt p50 | Damage taken p50 | Post HP p50 | Enemy actions p50 | Player actions p50 | Player first | Guard opp. | Guarded | Spell actions | MP spent |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...report.summary.map(row => `| ${row.key} | ${row.n} | ${(row.survivalRate * 100).toFixed(1)}% | ${(row.deathRate * 100).toFixed(1)}% | ${row.rounds.p50 ?? "—"} | ${row.damageDealt.p50 ?? "—"} | ${row.damageTaken.p50 ?? "—"} | ${row.postCombatHp.p50 ?? "—"} | ${row.enemyActions.p50 ?? "—"} | ${row.playerActions.p50 ?? "—"} | ${(row.playerBeforeAnyEnemyRate * 100).toFixed(1)}% | ${row.guardOpportunity.mean ?? "—"} | ${row.guardedActions.mean ?? "—"} | ${row.spellActions.mean ?? "—"} | ${row.mpSpent.mean ?? "—"} |`),
    "",
    "## Provenance",
    "",
    "Raw per-run paired seed and resolved multipliers are in measurement.json. N<30 supports correctness only; merged workflow N=200 is balance evidence.",
    ""
  ].join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.output || !options.summary || !options.manifest) throw new Error("--output, --summary, and --manifest are required");
  const runs = positiveInteger(options.runs || DEFAULT_RUNS, "runs", 1);
  if (runs > 0 && runs < 30 && process.env.CI === "true") throw new Error("CI measurement requires N=200");
  const provenance = requireRunnerProvenance({ fetchOriginMain: false, measurementRunnerPaths: [RUNNER_PATH, "scratch/measurements/progression_enemy_hp_buffer_contract.js", "scratch/measurements/progression_enemy_candidate_contract.js", "scratch/measurements/progression_enemy_candidate_level.js", "scratch/simulations/sim_depth_material_ev.js", "src/data/progression_enemy_simulation_policy.js"] });
  const report = await runProgressionEnemyHpBufferDiagnostic({ runs, seed: options.seed || DEFAULT_SEED });
  const measurement = {
    scope: readSimScopeDeclaration(import.meta.url)?.name || "run",
    sourceCommit: provenance?.sourceCommit || null,
    gameplaySourceCommit: provenance?.gameplaySourceCommit || null,
    measurementRunnerCommit: provenance?.measurementRunnerCommit || null,
    measurementRunnerPaths: provenance?.measurementRunnerPaths || [],
    measurementRunnerDiffSha256: provenance?.measurementRunnerDiffSha256 || null,
    originMainAncestor: provenance?.originMainAncestor ?? null,
    workingTreeClean: provenance?.workingTreeClean ?? null,
    policyVersion: "phase4g-progression-enemy-hp-buffer-plus-one-capped-v1",
    candidate: { id: CANDIDATE.id, baseline0to5: [0, 5], enemyBand0to5: [0, 5], physical: "1 + 0.16 × baseline", spell: "1 + 0.16 × baseline", level1MaxHp: "20 × (1 + 0.10 × baseline)", arms: [{ id: "v1", hpBuffer: 0, rawDefenseBonus: 0 }, { id: "hp-plus-one-capped", hpBuffer: "baseline > 0 ? 1 : 0", rawDefenseBonus: 0 }], level2ProductionHpDelta: 5, enemyHp: "1 + 0.20 × band", enemyAttack: "1 + 0.10 × band", enemyDefense: 1 },
    workflow: {
      repository: process.env.MEASUREMENT_REPOSITORY || null,
      runId: process.env.MEASUREMENT_WORKFLOW_RUN_ID || null,
      runAttempt: process.env.MEASUREMENT_RUN_ATTEMPT || null,
      runUrl: process.env.MEASUREMENT_WORKFLOW_RUN_URL || null
    }
  };
  report.measurement = measurement;
  fs.writeFileSync(resolve(options.output), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(resolve(options.summary), `${makeSummary(report)}\n`);
  fs.writeFileSync(resolve(options.manifest), `${JSON.stringify({ schemaVersion: SCHEMA_VERSION, status: "success", runner: RUNNER_VERSION, source: measurement, configuration: report.configuration }, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
}
