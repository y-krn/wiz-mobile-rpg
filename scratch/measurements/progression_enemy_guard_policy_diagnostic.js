// sim-scope: run — paired fixed-combat Guard action-cost diagnostic
/* global console, process */

import "../simulations/simulation_preflight.js";
import fs from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  deriveProgressionEnemyRunSeed,
  PROGRESSION_ENEMY_DIAGNOSTIC_CONTEXTS,
  PROGRESSION_ENEMY_GUARD_POLICY_ARMS as ARMS,
  PROGRESSION_ENEMY_GUARD_POLICY_CANDIDATE as CANDIDATE
} from "./progression_enemy_guard_policy_contract.js";
import { MONSTERS } from "../../src/data/monsters.js";
import { requireRunnerProvenance } from "./measurement_provenance.js";
import { readSimScopeDeclaration } from "./measurement_env_signature.js";

export const RUNNER_VERSION = "progression-enemy-guard-policy-diagnostic-v1";
export const SCHEMA_VERSION = 1;
export const RUNNER_PATH = "scratch/measurements/progression_enemy_guard_policy_diagnostic.js";
const DEFAULT_RUNS = 200;
const DEFAULT_SEED = 1698;
const FIXTURE = Object.freeze({
  id: "defensive-guard",
  className: "Priest",
  startingKit: "devotion",
  monsterName: "錆びた盾兵"
});
const { resetSimulationRandom, simulateRun } = await import("../simulations/sim_depth_material_ev.js");

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

function describe(result, { context, level, arm, seed, runIndex }) {
  const identity = result.encounterIdentityLog?.[0];
  const encounter = result.diagnostics?.encounters?.[0];
  const rounds = encounter?.rounds || [];
  if (!identity || !rounds.length) throw new Error("production fixed-combat diagnostic omitted encounter metrics");
  const selectedAttack = rounds.filter(round => round.action === "fight").length;
  const selectedDefend = rounds.filter(round => round.action === "defend").length;
  const selectedOther = rounds.filter(round => !["fight", "defend"].includes(round.action)).length;
  const executedAttack = rounds.filter(round => round.action === "fight" && round.playerActionExecuted).length;
  const executedDefend = rounds.filter(round => round.action === "defend" && round.playerActionExecuted).length;
  const executedOther = rounds.filter(round => round.playerActionExecuted && !["fight", "defend"].includes(round.action)).length;
  const guardOpportunities = rounds.filter(round => round.hpBefore > 0)
    .reduce((sum, round) => sum + (round.enemyActionEvents || []).filter(event => event.executed).length, 0);
  const guardedEnemyActions = rounds.filter(round => round.action === "defend" && round.playerActionExecuted)
    .reduce((sum, round) => sum + (round.enemyActionEvents || []).filter(event => event.executed).length, 0);
  const enemyHpStart = (encounter.monsters || []).reduce((sum, monster) => sum + Number(monster.maxHp || monster.hp || 0), 0);
  const enemyHpEnd = (encounter.endEnemyHp || []).reduce((sum, entry) => sum + Number(entry?.hp || 0), 0);
  const template = MONSTERS.find(monster => monster.name === FIXTURE.monsterName);
  const resolvedEnemy = encounter.monsters?.[0] || {};
  const maxHp = encounter.startMaxHp;
  const enemyActions = identity.enemyActions;
  const damageTaken = identity.totalNormalDamage;
  return {
    contextId: `${context.kind}-B${context.floor}`,
    timing: context.kind,
    floor: context.floor,
    baselineIndex: context.baseline,
    baselineSource: context.kind,
    enemyBandIndex: context.enemyBand,
    fixtureId: FIXTURE.id,
    level,
    levelSource: level === 2 ? "production EXP_LEVELS[2] threshold through checkCharLevelUp" : "Level 1 starting state",
    arm: arm.id,
    runIndex,
    seed,
    survival: result.fixedCombatResult !== "death",
    death: result.fixedCombatResult === "death",
    outcome: result.fixedCombatResult,
    rounds: rounds.length,
    enemyActions,
    damageDealt: Math.max(0, enemyHpStart - enemyHpEnd),
    damageTaken,
    damagePerEnemyAction: enemyActions > 0 ? damageTaken / enemyActions : 0,
    damagePerRound: rounds.length > 0 ? damageTaken / rounds.length : 0,
    postCombatHp: identity.hpAfter,
    maxHp,
    rawDefense: result.fixedCombat?.playerResolved?.rawDefense ?? null,
    incomingPhysicalResistance: result.fixedCombat?.playerResolved?.incomingPhysicalResistance ?? null,
    playerPhysicalMultiplier: CANDIDATE.playerPhysicalMultiplier(context.baseline),
    playerSpellMultiplier: CANDIDATE.playerSpellMultiplier(context.baseline),
    selectedActions: { attack: selectedAttack, defend: selectedDefend, other: selectedOther },
    executedActions: { attack: executedAttack, defend: executedDefend, other: executedOther },
    guardOpportunities,
    guardedEnemyActions,
    enemyMultipliers: {
      hp: template ? Number(resolvedEnemy.maxHp) / template.hp : null,
      attack: template ? Number(resolvedEnemy.atk) / template.atk : null,
      defense: template?.def ? Number(resolvedEnemy.def) / template.def : 1
    }
  };
}

export async function runProgressionEnemyGuardPolicyDiagnostic({ runs = DEFAULT_RUNS, seed = DEFAULT_SEED } = {}) {
  const count = positiveInteger(runs, "runs", 1);
  const rootSeed = positiveInteger(seed, "seed", 1);
  const observations = [];
  for (const context of PROGRESSION_ENEMY_DIAGNOSTIC_CONTEXTS) {
    for (const level of [1, 2]) for (let runIndex = 0; runIndex < count; runIndex++) {
      const pairedSeed = deriveProgressionEnemyRunSeed({ rootSeed, context, fixtureId: FIXTURE.id, runIndex });
      for (const arm of ARMS) {
        resetSimulationRandom(pairedSeed);
        const result = simulateRun({
          className: FIXTURE.className,
          startFloor: context.floor,
          targetDepth: context.floor + 1,
          runIndex,
          seriesId: `progression-enemy-guard-policy:${context.kind}:${context.floor}:${FIXTURE.id}`,
          scoringProfile: null,
          scenario: {
            startingKit: FIXTURE.startingKit,
            fleePolicy: "never",
            consumablesAtDeparture: "none",
            measurementCombatPlan: arm.measurementCombatPlan,
            measurementGuardTiming: "declared",
            collectEncounterIdentities: true,
            collectStage15Diagnostics: true,
            simDiagnosticLevel: "full",
            fixedCombat: {
              monsterNames: [FIXTURE.monsterName],
              entryHpRatio: 1,
              entryMpRatio: 1,
              scalingPolicy: "phase2a",
              ...(level === 2 ? { productionLevelDelta: 1 } : {}),
              playerCandidate: {
                physicalPowerMultiplier: CANDIDATE.playerPhysicalMultiplier(context.baseline),
                spellPowerMultiplier: CANDIDATE.playerSpellMultiplier(context.baseline),
                maxHpTarget: CANDIDATE.playerLevel1MaxHp(context.baseline),
                rawDefenseBonus: 0
              }
            }
          },
          workshop: { ranks: {} },
          worldSeed: pairedSeed,
          collectDiagnostics: true,
          collectCombatFormula: true
        });
        observations.push(describe(result, { context, level, arm, seed: pairedSeed, runIndex }));
      }
    }
  }
  const groups = new Map();
  for (const row of observations) {
    const key = `${row.contextId}/L${row.level}/${row.fixtureId}/${row.arm}`;
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
    enemyActions: summarize(rows.map(row => row.enemyActions)),
    damageDealt: summarize(rows.map(row => row.damageDealt)),
    damageTaken: summarize(rows.map(row => row.damageTaken)),
    damagePerEnemyAction: summarize(rows.map(row => row.damagePerEnemyAction)),
    damagePerRound: summarize(rows.map(row => row.damagePerRound)),
    postCombatHp: summarize(rows.map(row => row.postCombatHp)),
    maxHp: summarize(rows.map(row => row.maxHp)),
    rawDefense: summarize(rows.map(row => row.rawDefense)),
    selectedActions: {
      attack: summarize(rows.map(row => row.selectedActions.attack)),
      defend: summarize(rows.map(row => row.selectedActions.defend)),
      other: summarize(rows.map(row => row.selectedActions.other))
    },
    executedActions: {
      attack: summarize(rows.map(row => row.executedActions.attack)),
      defend: summarize(rows.map(row => row.executedActions.defend)),
      other: summarize(rows.map(row => row.executedActions.other))
    },
    guardOpportunities: summarize(rows.map(row => row.guardOpportunities)),
    guardedEnemyActions: summarize(rows.map(row => row.guardedEnemyActions))
  }));
  return {
    runnerVersion: RUNNER_VERSION,
    schemaVersion: SCHEMA_VERSION,
    status: "diagnostic-only",
    configuration: {
      runs: count,
      seed: rootSeed,
      pairedSeedKey: ["root seed", "milestone context", "fixture", "runIndex"],
      pairedArmsShareSeed: true,
      contexts: PROGRESSION_ENEMY_DIAGNOSTIC_CONTEXTS,
      fixture: FIXTURE,
      levels: [1, 2],
      arms: ARMS,
      candidate: CANDIDATE.id,
      phase4cV1: {
        playerPhysical: "1 + 0.16 × baseline",
        playerSpell: "1 + 0.16 × baseline",
        level1MaxHp: "20 × (1 + 0.10 × baseline)",
        hpBuffer: 0,
        rawDefenseBonus: 0,
        enemyHp: "1 + 0.20 × band",
        enemyAttack: "1 + 0.10 × band",
        enemyDefense: 1
      },
      guardedEnemyActionDefinition: "executed enemy action during an executed defend round"
    },
    observations,
    summary
  };
}

function makeSummary(report) {
  return [
    "# Progression enemy Guard policy diagnostic",
    "",
    `- runner: ${RUNNER_VERSION}; seed: ${report.configuration.seed}; N=${report.configuration.runs}`,
    "- Phase 4c v1 values fixed; defensive-Guard fixture only; Level 2 uses production leveling",
    "- Paired seed excludes arm and Level; attack-defend is odd-round Fight / even-round Guard",
    "- Guarded enemy action counts executed enemy actions during executed defend rounds",
    "- N<30 supports correctness only; merged workflow N=200 is the measurement evidence",
    "",
    "| Context / Level / arm | N | Survival | Rounds p50 | Enemy actions p50 | Damage taken p50 | Damage / enemy action p50 | Post HP p50 | Selected attack / defend | Executed attack / defend | Guard opportunities | Guarded enemy actions | maxHP | raw DEF |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...report.summary.map(row => `| ${row.key} | ${row.n} | ${(row.survivalRate * 100).toFixed(1)}% | ${row.rounds.p50 ?? "—"} | ${row.enemyActions.p50 ?? "—"} | ${row.damageTaken.p50 ?? "—"} | ${row.damagePerEnemyAction.p50 ?? "—"} | ${row.postCombatHp.p50 ?? "—"} | ${row.selectedActions.attack.mean ?? "—"} / ${row.selectedActions.defend.mean ?? "—"} | ${row.executedActions.attack.mean ?? "—"} / ${row.executedActions.defend.mean ?? "—"} | ${row.guardOpportunities.mean ?? "—"} | ${row.guardedEnemyActions.mean ?? "—"} | ${row.maxHp.mean ?? "—"} | ${row.rawDefense.mean ?? "—"} |`),
    "",
    "Per-run paired seeds, control values, and resolved enemy multipliers are in measurement.json.",
    ""
  ].join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.output || !options.summary || !options.manifest) throw new Error("--output, --summary, and --manifest are required");
  const runs = positiveInteger(options.runs || DEFAULT_RUNS, "runs", 1);
  if (runs < 30 && process.env.CI === "true") throw new Error("CI measurement requires N=200");
  const provenance = requireRunnerProvenance({ fetchOriginMain: false, measurementRunnerPaths: [RUNNER_PATH, "scratch/measurements/progression_enemy_guard_policy_contract.js", "scratch/measurements/progression_enemy_candidate_contract.js", "scratch/measurements/progression_enemy_candidate_level.js", "scratch/simulations/sim_depth_material_ev.js", "src/data/progression_enemy_simulation_policy.js"] });
  const report = await runProgressionEnemyGuardPolicyDiagnostic({ runs, seed: options.seed || DEFAULT_SEED });
  report.measurement = {
    scope: readSimScopeDeclaration(import.meta.url)?.name || "run",
    sourceCommit: provenance?.sourceCommit || null,
    gameplaySourceCommit: provenance?.gameplaySourceCommit || null,
    measurementRunnerCommit: provenance?.measurementRunnerCommit || null,
    measurementRunnerPaths: provenance?.measurementRunnerPaths || [],
    measurementRunnerDiffSha256: provenance?.measurementRunnerDiffSha256 || null,
    originMainAncestor: provenance?.originMainAncestor ?? null,
    workingTreeClean: provenance?.workingTreeClean ?? null,
    policyVersion: RUNNER_VERSION,
    workflow: {
      repository: process.env.MEASUREMENT_REPOSITORY || null,
      runId: process.env.MEASUREMENT_WORKFLOW_RUN_ID || null,
      runAttempt: process.env.MEASUREMENT_RUN_ATTEMPT || null,
      runUrl: process.env.MEASUREMENT_WORKFLOW_RUN_URL || null
    }
  };
  fs.writeFileSync(resolve(options.output), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(resolve(options.summary), `${makeSummary(report)}\n`);
  fs.writeFileSync(resolve(options.manifest), `${JSON.stringify({ schemaVersion: SCHEMA_VERSION, status: "success", runner: RUNNER_VERSION, source: report.measurement, configuration: report.configuration }, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
}
