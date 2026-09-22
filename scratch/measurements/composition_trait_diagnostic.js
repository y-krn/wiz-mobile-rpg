// sim-scope: run — Phase 2c fixed production composition trait diagnostic
/* global console, process */

import "../simulations/simulation_preflight.js";
import fs from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { MONSTERS } from "../../src/data/monsters.js";
import { getCombatTierForStartFloor } from "../../src/rules/combat_tier.js";
import { simulateRun } from "../simulations/sim_depth_material_ev.js";
import {
  ARMOR_CANDIDATES,
  resolveEffectiveTempoModifier,
  resolveVNextLoadCandidate,
  SHIELD_CANDIDATES,
  tierMultiplier,
  WEAPON_CANDIDATES
} from "./equipment_vnext_combat_diagnostic.js";
import { requireRunnerProvenance } from "./measurement_provenance.js";
import { printEnvSignatureBanner, readSimScopeDeclaration } from "./measurement_env_signature.js";

export const RUNNER_VERSION = "issue1608-buff-physical-def-diagnostic-v1";
export const SCHEMA_VERSION = 3;
export const DEFAULT_RUNS = 200;
export const DEFAULT_SEED = 1599;
export const MIN_CONFIDENT_RUNS = 30;
export const DEPTHS = Object.freeze([5, 10, 20, 30]);
export const REFLECT_PHYSICAL_DIAGNOSTIC_RATE = 0.20;

export const PLAYER_FIXTURE = Object.freeze({
  id: "phase1-freeze-candidate",
  startingKit: "vanguard",
  maxHp: 100,
  weapon: "sword",
  armor: "mediumArmor",
  shield: "smallShield",
  guardTiming: "declared",
  loadPolicy: "aggregate",
  loadCandidateId: "cappedHalfStep",
  actionPlan: "attack-defend",
  weaponPowerBase: 100,
  armorMitigation: ARMOR_CANDIDATES.mediumArmor.mitigation,
  guardMultiplier: SHIELD_CANDIDATES.smallShield.guard.physical
});

export const TRAIT_FIXTURES = Object.freeze([
  Object.freeze({
    id: "guardAdjacent",
    label: "guardAdjacent",
    ownerName: "石像兵",
    neutralAllyName: "オークの戦士"
  }),
  Object.freeze({
    id: "buffAtk",
    label: "buffAtk",
    ownerName: "骨の鼓手",
    neutralAllyName: "オークの戦士"
  }),
  Object.freeze({
    id: "buffPhysicalDef",
    label: "buffPhysicalDef",
    ownerName: "鉄皮のゴブリン",
    neutralAllyName: "オークの戦士"
  }),
  Object.freeze({
    id: "summonAlly",
    label: "summonAlly",
    ownerName: "召喚する悪魔",
    neutralAllyName: "オークの戦士"
  })
]);

export const CONDITIONS = Object.freeze([
  Object.freeze({ id: "trait-absent", label: "traitなし", removeTrait: "fixture-trait" }),
  Object.freeze({ id: "production", label: "current flat DEF +2", removeTrait: null }),
  Object.freeze({ id: "candidate", label: "diagnostic candidate", removeTrait: null })
]);

const SUPPORT_ACTION_TRAITS = new Set(["buffAtk", "buffPhysicalDef", "summonAlly"]);

function conditionsForTrait(traitId) {
  return SUPPORT_ACTION_TRAITS.has(traitId)
    ? CONDITIONS
    : CONDITIONS.filter(condition => condition.id !== "candidate");
}

const RUNNER_PATH = "scratch/measurements/composition_trait_diagnostic.js";
const SIMULATION_PATH = "scratch/simulations/sim_depth_material_ev.js";
const PRODUCTION_PATHS = Object.freeze([
  "src/data/monsters.js",
  "src/rules/combat_tier.js",
  "src/combat_logic/monster_traits.js",
  "src/combat_logic/round.js",
  "src/combat_logic/damage.js",
  "src/combat_logic/targeting.js"
]);
const DIAGNOSTIC_PATHS = Object.freeze([
  RUNNER_PATH,
  SIMULATION_PATH,
  "scratch/measurements/measurement_provenance.js",
  ...PRODUCTION_PATHS
]);

function positiveInteger(value, label, minimum = 1) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(`${label} must be an integer >= ${minimum}: ${value}`);
  }
  return parsed;
}

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * ratio;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return lower === upper
    ? sorted[lower]
    : sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function summarize(values) {
  const numeric = values.filter(Number.isFinite);
  if (!numeric.length) return { count: 0, average: null, p50: null, min: null, max: null };
  return {
    count: numeric.length,
    average: numeric.reduce((sum, value) => sum + value, 0) / numeric.length,
    p50: percentile(numeric, 0.5),
    min: Math.min(...numeric),
    max: Math.max(...numeric)
  };
}

function findFixture(traitId) {
  const fixture = TRAIT_FIXTURES.find(candidate => candidate.id === traitId);
  if (!fixture) throw new Error(`unknown composition trait fixture: ${traitId}`);
  const owner = MONSTERS.find(monster => monster.name === fixture.ownerName);
  const neutralAlly = MONSTERS.find(monster => monster.name === fixture.neutralAllyName);
  if (!owner) throw new Error(`missing production trait owner: ${fixture.ownerName}`);
  if (!neutralAlly) throw new Error(`missing production neutral ally: ${fixture.neutralAllyName}`);
  if (!(owner.traits || []).includes(traitId)) {
    throw new Error(`${fixture.ownerName} does not declare production trait ${traitId}`);
  }
  if ((neutralAlly.traits || []).includes(traitId)) {
    throw new Error(`neutral ally ${fixture.neutralAllyName} must not declare ${traitId}`);
  }
  if (traitId === "summonAlly") {
    if (!owner.summon?.name || !Number.isInteger(owner.summon?.maxAllies)) {
      throw new Error(`${fixture.ownerName} must retain production summon target and cap`);
    }
    if (!MONSTERS.some(monster => monster.name === owner.summon.name)) {
      throw new Error(`missing production summon target: ${owner.summon.name}`);
    }
  }
  return { fixture, owner, neutralAlly };
}

export function resolvePlayerFixture(depth) {
  const candidate = {
    weapon: PLAYER_FIXTURE.weapon,
    armor: PLAYER_FIXTURE.armor,
    shield: PLAYER_FIXTURE.shield
  };
  const load = resolveVNextLoadCandidate(candidate, PLAYER_FIXTURE.loadPolicy);
  const tier = getCombatTierForStartFloor(depth);
  return {
    ...PLAYER_FIXTURE,
    combatTier: tier,
    attackPower: PLAYER_FIXTURE.weaponPowerBase * tierMultiplier(tier),
    weaponProfile: { ...WEAPON_CANDIDATES[PLAYER_FIXTURE.weapon] },
    armorProfile: { ...ARMOR_CANDIDATES[PLAYER_FIXTURE.armor] },
    shieldProfile: { ...SHIELD_CANDIDATES[PLAYER_FIXTURE.shield] },
    load: {
      class: load.class,
      aggregateScore: load.aggregateScore,
      effectiveTempoModifier: resolveEffectiveTempoModifier(load, PLAYER_FIXTURE.loadCandidateId)
    }
  };
}

function createScenario({ fixture, condition, depth }) {
  const playerFixture = resolvePlayerFixture(depth);
  const measurementSupportActionContinuation = condition.id === "candidate" ||
    (fixture.id === "buffPhysicalDef" && condition.id === "production");
  return {
    startingKit: playerFixture.startingKit,
    hpBaseBonus: playerFixture.maxHp - 20,
    measurementCombatPlan: playerFixture.actionPlan,
    measurementGuardTiming: playerFixture.guardTiming,
    measurementCombatTier: playerFixture.combatTier,
    measurementPlayerWeaponCandidate: playerFixture.weaponProfile,
    measurementBuffPhysicalDefMitigation:
      fixture.id === "buffPhysicalDef" && condition.id === "candidate"
        ? playerFixture.armorMitigation
        : null,
    measurementSupportActionContinuation,
    measurementInitiative: {
      playerLoadModifier: playerFixture.load.effectiveTempoModifier
    },
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
    simDiagnosticLevel: "full",
    fleePolicy: "never",
    consumablesAtDeparture: "none",
    fixedCombat: {
      // The trait owner is adjacent to the same neutral ally in both paired conditions.
      monsterNames: [fixture.neutralAllyName, fixture.ownerName],
      entryHpRatio: 1,
      entryMpRatio: 0,
      scalingPolicy: "phase2a",
      summonScalingPolicy: fixture.id === "summonAlly" ? "phase2a" : null,
      playerCandidate: playerFixture,
      removeTrait: condition.removeTrait === "fixture-trait" ? fixture.id : null
    }
  };
}

const ACTIVATION_ACTION_NAMES = Object.freeze({
  buffAtk: "仲間を鼓舞",
  buffPhysicalDef: "物理防御を強化",
  summonAlly: "仲間を呼ぶ"
});

function countActivationActions(actions, traitId) {
  const actionName = ACTIVATION_ACTION_NAMES[traitId];
  return actionName
    ? actions.filter(action => action.actionNames?.includes(actionName)).length
    : 0;
}

function observeTraitEffect(result, traitId) {
  const encounter = result.diagnostics?.encounters?.[0];
  const rounds = encounter?.rounds || [];
  const actions = rounds.flatMap(round => round.enemyActionEvents || []);
  const logs = rounds.flatMap(round => round.log || []);
  const activationCount = countActivationActions(actions, traitId);
  if (traitId === "guardAdjacent") {
    const redirectCount = logs.filter(message => message.includes("庇った！")).length;
    return {
      activationCount: redirectCount,
      effectAmount: redirectCount,
      effectUnit: "redirects"
    };
  }
  if (traitId === "summonAlly") {
    const spawnedAllies = logs.filter(message => message.includes("召喚した！")).length;
    return {
      activationCount,
      effectAmount: spawnedAllies,
      effectUnit: "spawned allies"
    };
  }
  return {
    activationCount,
    effectAmount: activationCount,
    effectUnit: "buff activations"
  };
}

function observeRun(result, traitId, conditionId) {
  const encounter = result.diagnostics?.encounters?.[0];
  const rounds = encounter?.rounds || [];
  const effect = observeTraitEffect(result, traitId);
  const physicalMitigationHits = (result.combatFormula?.physicalPlayerHits || [])
    .filter(hit => Number(hit.measurementPhysicalMitigation) > 0);
  const initialMonsters = encounter?.monsters || [];
  const endEnemyHp = encounter?.endEnemyHp || [];
  const spawnedAllies = Math.max(0, endEnemyHp.length - initialMonsters.length);
  const ownerName = TRAIT_FIXTURES.find(fixture => fixture.id === traitId)?.ownerName;
  const normalActionContinuation = rounds.reduce((count, round) => count +
    (round.enemyActionEvents || []).filter(action => {
      if (action.monsterName !== ownerName) return false;
      const supportAction = action.actionNames?.includes(ACTIVATION_ACTION_NAMES[traitId]);
      const summonWarning = traitId === "summonAlly" &&
        (round.log || []).some(message => message.includes("召喚の予兆"));
      return (supportAction || summonWarning) && action.actionNames?.includes("通常攻撃");
    }).length, 0);
  return {
    conditionId,
    outcome: result.fixedCombatResult,
    rounds: rounds.length,
    damageTaken: result.combatDamageHp || 0,
    enemyActions: result.normalCombatTelemetry?.enemyActions || 0,
    normalActionContinuation,
    survival: Number(result.fixedCombatResult === "victory"),
    traitEffect: effect,
    physicalMitigationHits: physicalMitigationHits.length,
    physicalMitigationConsumed: physicalMitigationHits.some(hit =>
      Number(hit.physicalResistance) > Number(hit.measurementPhysicalResistanceWithoutMitigation)
    ),
    spawnedAllies,
    summonedAllies: result.fixedCombat?.summonedAllies || [],
    observedTraits: [...new Set(initialMonsters.flatMap(monster => monster.traits || []))],
    finalEnemyCount: endEnemyHp.length
  };
}

function summarizeRuns(rows, traitId, depth, conditionId) {
  const summonedAllies = [...new Map(
    rows.flatMap(row => row.summonedAllies || [])
      .map(snapshot => [JSON.stringify(snapshot), snapshot])
  ).values()];
  return {
    traitId,
    depth,
    conditionId,
    runs: rows.length,
    outcomes: rows.reduce((counts, row) => {
      counts[row.outcome] = (counts[row.outcome] || 0) + 1;
      return counts;
    }, {}),
    rounds: summarize(rows.map(row => row.rounds)),
    damageTaken: summarize(rows.map(row => row.damageTaken)),
    enemyActions: summarize(rows.map(row => row.enemyActions)),
    normalActionContinuation: summarize(rows.map(row => row.normalActionContinuation)),
    survivalRate: rows.reduce((sum, row) => sum + row.survival, 0) / rows.length,
    spawnedAllies: summarize(rows.map(row => row.spawnedAllies)),
    summonedAllies,
    finalEnemyCount: summarize(rows.map(row => row.finalEnemyCount)),
    traitEffect: {
      activationCount: summarize(rows.map(row => row.traitEffect.activationCount)),
      effectAmount: summarize(rows.map(row => row.traitEffect.effectAmount)),
      effectUnit: rows[0]?.traitEffect.effectUnit || "unobserved"
    },
    physicalMitigationHits: summarize(rows.map(row => row.physicalMitigationHits)),
    physicalMitigationConsumed: rows.some(row => row.physicalMitigationConsumed),
    observedTraitPresence: [...new Set(rows.flatMap(row => row.observedTraits))]
  };
}

function subtract(left, right) {
  return {
    average: left.average - right.average,
    p50: left.p50 - right.p50,
    min: left.min - right.min,
    max: left.max - right.max
  };
}

function deltaSummary(present, absent) {
  return {
    rounds: subtract(present.rounds, absent.rounds),
    damageTaken: subtract(present.damageTaken, absent.damageTaken),
    enemyActions: subtract(present.enemyActions, absent.enemyActions),
    normalActionContinuation: subtract(present.normalActionContinuation, absent.normalActionContinuation),
    survivalRate: present.survivalRate - absent.survivalRate,
    spawnedAllies: subtract(present.spawnedAllies, absent.spawnedAllies),
    finalEnemyCount: subtract(present.finalEnemyCount, absent.finalEnemyCount),
    traitEffectAmount: subtract(present.traitEffect.effectAmount, absent.traitEffect.effectAmount)
  };
}

function resolveScaling(depth) {
  const tier = getCombatTierForStartFloor(depth);
  return { depth, tier, hp: 1 + 0.20 * tier, atk: 1 + 0.10 * tier, def: 1.0 };
}

function resolveTraitConfiguration() {
  return TRAIT_FIXTURES.map(trait => {
    const { owner } = findFixture(trait.id);
    return {
      ...trait,
      productionTraits: [...(owner.traits || [])],
      productionSummon: owner.summon
        ? { name: owner.summon.name, maxAllies: owner.summon.maxAllies }
        : null
    };
  });
}

export function resolveWorldSeed({ seed, traitId, depth, runIndex }) {
  return `${seed}:issue1608:${traitId}:B${depth}:${runIndex}`;
}

function runCell({ traitId, depth, conditionId, runs, seed }) {
  const { fixture } = findFixture(traitId);
  const condition = conditionsForTrait(traitId).find(candidate => candidate.id === conditionId);
  if (!condition) throw new Error(`unknown diagnostic condition: ${conditionId}`);
  const rows = [];
  for (let runIndex = 0; runIndex < runs; runIndex++) {
    const result = simulateRun({
      className: "Fighter",
      fixtureId: null,
      startFloor: depth,
      targetDepth: depth + 1,
      runIndex,
      seriesId: `issue1605:${traitId}:B${depth}`,
      scoringProfile: null,
      scenario: createScenario({ fixture, condition, depth }),
      workshop: { ranks: {} },
      worldSeed: resolveWorldSeed({ seed, traitId, depth, runIndex }),
      collectDiagnostics: true,
      collectCombatFormula: true
    });
    rows.push(observeRun(result, traitId, conditionId));
  }
  return summarizeRuns(rows, traitId, depth, conditionId);
}

export async function runCompositionTraitDiagnostic({
  runs = DEFAULT_RUNS,
  seed = DEFAULT_SEED,
  allowSmallRunCount = false
} = {}) {
  const normalizedRuns = positiveInteger(runs, "runs", allowSmallRunCount ? 1 : MIN_CONFIDENT_RUNS);
  const normalizedSeed = positiveInteger(seed, "seed");
  const cells = [];
  for (const trait of TRAIT_FIXTURES) {
    for (const depth of DEPTHS) {
      for (const condition of conditionsForTrait(trait.id)) {
        cells.push(runCell({
          traitId: trait.id,
          depth,
          conditionId: condition.id,
          runs: normalizedRuns,
          seed: normalizedSeed
        }));
      }
    }
  }
  const comparisons = TRAIT_FIXTURES.flatMap(trait => DEPTHS.map(depth => {
    const noTrait = cells.find(cell => cell.traitId === trait.id && cell.depth === depth && cell.conditionId === "trait-absent");
    const production = cells.find(cell => cell.traitId === trait.id && cell.depth === depth && cell.conditionId === "production");
    const candidate = cells.find(cell => cell.traitId === trait.id && cell.depth === depth && cell.conditionId === "candidate") || null;
    return {
      traitId: trait.id,
      depth,
      noTrait,
      production,
      candidate,
      deltas: {
        productionVsNoTrait: deltaSummary(production, noTrait),
        candidateVsNoTrait: candidate ? deltaSummary(candidate, noTrait) : null,
        candidateVsProduction: candidate ? deltaSummary(candidate, production) : null
      }
    };
  }));
  return {
    schemaVersion: SCHEMA_VERSION,
    runnerVersion: RUNNER_VERSION,
    measurementId: "composition-trait-diagnostic",
    evidenceScope: "diagnostic",
    confidencePolicy: {
      minimumConfidentRuns: MIN_CONFIDENT_RUNS,
      belowMinimum: "runner-correctness-only; no balance conclusion"
    },
    configuration: {
      runs: normalizedRuns,
      seed: normalizedSeed,
      depths: [...DEPTHS],
      playerFixture: {
        ...PLAYER_FIXTURE,
        weaponProfile: PLAYER_FIXTURE.weapon,
        armorProfile: PLAYER_FIXTURE.armor,
        shieldProfile: PLAYER_FIXTURE.shield
      },
      traits: resolveTraitConfiguration(),
      conditions: CONDITIONS.map(condition => ({ ...condition })),
      traitConditionPolicy: "guardAdjacent retains no-trait/production only; buffAtk/buffPhysicalDef/summonAlly use all three conditions",
      metrics: ["rounds", "damageTaken", "enemyActions", "survival", "trait activation/effect", "normal action continuation", "candidate physical mitigation consumption"],
      scaling: "HP = 1 + 0.20 × Tier; ATK = 1 + 0.10 × Tier; DEF = 1.0",
      reflectPhysicalDiagnosticFreeze: REFLECT_PHYSICAL_DIAGNOSTIC_RATE,
      seedPolicy: "trait/depth/runIndex keyed worldSeed; no-trait/production/candidate rows share the same initial RNG state",
      compositionPolicy: "production trait owner + the same production neutral ally; absent removes only the selected trait",
      omitted: [
        "production mutation",
        "Phase 1 freeze value changes",
        "trait chance/value tuning",
        "support action rate/cadence/value scans",
        "cleanseAlly, buffMagicDef, targetLowHp",
        "status, spell, boss behavior",
        "loot, UI, save, map traversal, full Cartesian product",
        "Heavy run"
      ]
    },
    scaling: DEPTHS.map(resolveScaling),
    cells,
    comparisons
  };
}

function format(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "-";
}

function buildReport(result, provenance, options) {
  const environmentHash = printEnvSignatureBanner({
    runnerVersion: RUNNER_VERSION,
    schemaVersion: SCHEMA_VERSION,
    measurementId: result.measurementId,
    seed: result.configuration.seed,
    runs: result.configuration.runs,
    depths: result.configuration.depths,
    traits: result.configuration.traits.map(trait => trait.id)
  }, { label: "issue1599 composition trait diagnostic env" });
  return {
    ...result,
    purpose: options.purpose || process.env.MEASUREMENT_PURPOSE || "",
    measurement: {
      scope: readSimScopeDeclaration(import.meta.url)?.name || "diagnostic",
      sourceCommit: provenance?.sourceCommit || null,
      gameplaySourceCommit: provenance?.gameplaySourceCommit || null,
      measurementRunnerCommit: provenance?.measurementRunnerCommit || null,
      measurementRunnerPaths: provenance?.measurementRunnerPaths || [...DIAGNOSTIC_PATHS],
      measurementRunnerDiffSha256: provenance?.measurementRunnerDiffSha256 || null,
      originMainAncestor: provenance?.originMainAncestor ?? null,
      staleTreeAllowed: provenance?.staleTreeAllowed ?? null,
      workingTreeClean: provenance?.workingTreeClean ?? null,
      productionPaths: [...PRODUCTION_PATHS],
      diagnosticPaths: [...DIAGNOSTIC_PATHS],
      environmentHash
    },
    candidatePolicy: {
      scaling: "diagnostic-only Phase 2a: HP 1 + 0.20 × Tier; ATK 1 + 0.10 × Tier; DEF 1.0",
      player: "measurement-only Phase 1 freeze candidate: vanguard=sword/mediumArmor/smallShield; declared Guard; capped half-step Load",
      traits: "production trait owners, values, summon target, and summon cap retained; absent condition removes only the selected trait in the fixed composition",
      supportAction: "buffPhysicalDef current flat DEF +2 and candidate rows continue with a normal action; buffAtk and summonAlly continue only for candidate; default production path remains false/no-op",
      buffPhysicalDef: "candidate-only temporary physical mitigation 0.20 from the Phase 1 medium armor freeze; raw DEF, activation chance, and duration remain production values",
      reflectPhysical: "diagnostic freeze reference 0.20; no reflectPhysical fixture in this scope",
      status: "diagnostic-only; production combat/enemy/loot/UI/save unchanged"
    }
  };
}

function buildSummary(report) {
  const lines = [
    "# buffPhysicalDef effect semantic diagnostic (#1608)",
    "",
    `- runner: ${report.runnerVersion}; source SHA: ${report.measurement.sourceCommit || "not recorded"}`,
    `- N=${report.configuration.runs}; seed=${report.configuration.seed}; depths=B${report.configuration.depths.join(", B")}`,
    `- player fixture: ${report.configuration.playerFixture.id}; ${report.configuration.playerFixture.weapon}/${report.configuration.playerFixture.armor}/${report.configuration.playerFixture.shield}; Guard=${report.configuration.playerFixture.guardTiming}; Load=${report.configuration.playerFixture.loadCandidateId}`,
    "- scaling: HP 1 + 0.20 × Tier; ATK 1 + 0.10 × Tier; DEF 1.0",
    "- production owner + same neutral ally; no-trait / production / candidate rows share paired seed",
    "",
    "## Paired deltas",
    "",
    "- rounds / damage taken / enemy actions / spawned allies / normal-action continuation: average delta",
    "- survival: percentage-point delta",
    "- guardAdjacent: redirects; buffAtk / buffPhysicalDef: activations; summonAlly: activations / spawned allies",
    "- buffPhysicalDef candidate mitigation consumption: existing physical hit formula `physicalResistance` with hit evidence",
    ""
  ];
  for (const comparison of report.comparisons) {
    const delta = comparison.deltas.candidateVsNoTrait || comparison.deltas.productionVsNoTrait;
    lines.push(
      `- ${comparison.traitId} B${comparison.depth}: candidate/no-trait rounds ${format(delta.rounds.average)}, ` +
      `damage ${format(delta.damageTaken.average)}, enemy actions ${format(delta.enemyActions.average)}, ` +
      `continuation ${format(delta.normalActionContinuation.average)}, ` +
      `survival ${(delta.survivalRate * 100).toFixed(2)}pp, ` +
      `effect ${format(delta.traitEffectAmount.average)} ${comparison.production.traitEffect.effectUnit}, ` +
      `spawned ${format(delta.spawnedAllies.average)}`
    );
  }
  lines.push(
    "",
    "## Scope and limits",
    "",
    "- Production `runEncounter` / `runCombatRoundCalculation` path is used.",
    "- No production combat, enemy, trait value, loot, UI, or save change.",
    "- This diagnostic does not estimate full-run survival, encounter frequency, status, spell, boss, or Heavy behavior.",
    "- N<30 is correctness-only; N=200 is the merge後 GitHub Actions measurement.",
    "",
    "## Provenance",
    "",
    `- production paths: ${report.measurement.productionPaths.join(", ")}`,
    `- environment hash: ${report.measurement.environmentHash}`
  );
  return `${lines.join("\n")}\n`;
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (!argument.startsWith("--")) continue;
    const [key, inlineValue] = argument.slice(2).split("=", 2);
    options[key] = inlineValue ?? argv[++index];
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const runs = positiveInteger(options.runs || DEFAULT_RUNS, "runs", MIN_CONFIDENT_RUNS);
  const seed = positiveInteger(options.seed || DEFAULT_SEED, "seed");
  if (!options.output || !options.summary) throw new Error("--output and --summary are required");
  const provenance = requireRunnerProvenance({
    fetchOriginMain: false,
    measurementRunnerPaths: [...DIAGNOSTIC_PATHS]
  });
  const result = await runCompositionTraitDiagnostic({ runs, seed });
  const report = buildReport(result, provenance, options);
  fs.writeFileSync(resolve(options.output), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(resolve(options.summary), buildSummary(report));
  console.log(`Wrote ${report.measurementId}: ${resolve(options.output)}`);
}

export { buildReport, buildSummary, observeTraitEffect };

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
