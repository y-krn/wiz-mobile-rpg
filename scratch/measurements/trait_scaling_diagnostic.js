// sim-scope: run — Phase 2a generic scaling with isolated production traits
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

export const RUNNER_VERSION = "issue1586-trait-scaling-diagnostic-v4";
export const SCHEMA_VERSION = 4;
export const DEFAULT_RUNS = 200;
export const DEFAULT_SEED = 1586;
export const MIN_CONFIDENT_RUNS = 30;
export const DEPTHS = Object.freeze([5, 10, 20, 30]);
export const BUILD_FIXTURE_ID = null;
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
  Object.freeze({ id: "evasive", label: "evasive", templateName: "這い寄る影" }),
  Object.freeze({ id: "multiAction", label: "multiAction", templateName: "双頭の番犬" }),
  Object.freeze({ id: "regen", label: "regen", templateName: "竜血の再生者" }),
  Object.freeze({ id: "reflectPhysical", label: "reflectPhysical", templateName: "鋼殻ビートル" })
]);

export const CONDITIONS = Object.freeze([
  Object.freeze({ id: "trait-present", label: "traitあり", removeTrait: null }),
  Object.freeze({ id: "trait-absent", label: "traitなし", removeTrait: "fixture-trait" })
]);

const RUNNER_PATH = "scratch/measurements/trait_scaling_diagnostic.js";
const SIMULATION_PATH = "scratch/simulations/sim_depth_material_ev.js";
const PRODUCTION_PATHS = Object.freeze([
  "src/data/monsters.js",
  "src/rules/combat_tier.js",
  "src/combat_logic/monster_traits.js",
  "src/combat_logic/round.js",
  "src/combat_logic/damage.js"
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
  if (sorted.length === 0) return null;
  const position = (sorted.length - 1) * ratio;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return lower === upper
    ? sorted[lower]
    : sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function summarize(values) {
  const numeric = values.filter(Number.isFinite);
  if (numeric.length === 0) return { count: 0, average: null, p50: null, min: null, max: null };
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
  if (!fixture) throw new Error(`unknown trait fixture: ${traitId}`);
  const template = MONSTERS.find(monster => monster.name === fixture.templateName);
  if (!template) throw new Error(`missing production monster template: ${fixture.templateName}`);
  if (!(template.traits || []).includes(traitId)) {
    throw new Error(`${fixture.templateName} does not declare production trait ${traitId}`);
  }
  return { fixture, template };
}

function resolvePlayerFixture(depth) {
  const candidate = {
    weapon: PLAYER_FIXTURE.weapon,
    armor: PLAYER_FIXTURE.armor,
    shield: PLAYER_FIXTURE.shield
  };
  const load = resolveVNextLoadCandidate(candidate, PLAYER_FIXTURE.loadPolicy);
  return {
    ...PLAYER_FIXTURE,
    combatTier: getCombatTierForStartFloor(depth),
    attackPower: PLAYER_FIXTURE.weaponPowerBase * tierMultiplier(getCombatTierForStartFloor(depth)),
    weaponProfile: { ...WEAPON_CANDIDATES[PLAYER_FIXTURE.weapon] },
    armorProfile: { ...ARMOR_CANDIDATES[PLAYER_FIXTURE.armor] },
    shieldProfile: { ...SHIELD_CANDIDATES[PLAYER_FIXTURE.shield] },
    load: {
      class: load.class,
      aggregateScore: load.aggregateScore,
      effectiveTempoModifier: resolveEffectiveTempoModifier(
        load,
        PLAYER_FIXTURE.loadCandidateId
      )
    }
  };
}

function createScenario({ fixture, condition, depth }) {
  const playerFixture = resolvePlayerFixture(depth);
  return {
    startingKit: playerFixture.startingKit,
    hpBaseBonus: playerFixture.maxHp - 20,
    measurementCombatPlan: playerFixture.actionPlan,
    measurementGuardTiming: playerFixture.guardTiming,
    measurementCombatTier: playerFixture.combatTier,
    measurementPlayerWeaponCandidate: playerFixture.weaponProfile,
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
      monsterNames: [fixture.templateName],
      entryHpRatio: 1,
      entryMpRatio: 0,
      scalingPolicy: "phase2a",
      playerCandidate: playerFixture,
      removeTrait: condition.removeTrait === "fixture-trait" ? fixture.id : null
    }
  };
}

function extractAmounts(logs, pattern) {
  return logs.flatMap(message => {
    const match = message.match(pattern);
    return match ? [Number(match[1])] : [];
  });
}

function observeTraitEffect(result, traitId) {
  const encounters = result.diagnostics?.encounters || [];
  const rounds = encounters.flatMap(encounter => encounter.rounds || []);
  const enemyActions = rounds.flatMap(round => round.enemyActionEvents || []);
  const logs = rounds.flatMap(round => round.log || []);
  const evasionMisses = (result.combatFormula?.physicalPlayerMisses || [])
    .filter(miss => miss.measurementWeaponCandidateId
      ? miss.measurementWeaponEvasionMiss === true
      : miss.isEvasionMiss === true);
  if (traitId === "evasive") {
    return {
      activationCount: evasionMisses.length,
      effectAmount: evasionMisses.length,
      effectUnit: "player attacks evaded"
    };
  }
  if (traitId === "multiAction") {
    const extraActions = enemyActions.filter(action => action.extraMultiAction === true).length;
    return {
      activationCount: extraActions,
      effectAmount: extraActions,
      effectUnit: "extra enemy actions"
    };
  }
  if (traitId === "regen") {
    const healed = extractAmounts(logs, /再生し、HPが(\d+)回復/);
    return {
      activationCount: healed.length,
      effectAmount: healed.reduce((sum, value) => sum + value, 0),
      effectUnit: "enemy HP restored"
    };
  }
  const reflected = extractAmounts(logs, /(\d+)の反射ダメージ/);
  return {
    activationCount: reflected.length,
    effectAmount: reflected.reduce((sum, value) => sum + value, 0),
    effectUnit: "reflected damage"
  };
}

function observeRun(result, traitId, conditionId, depth) {
  const effect = observeTraitEffect(result, traitId);
  const freezeApplication = observeFreezeApplication(result, depth);
  return {
    conditionId,
    outcome: result.fixedCombatResult,
    rounds: result.diagnostics?.encounters?.[0]?.rounds?.length || 0,
    damageTaken: result.combatDamageHp || 0,
    enemyActions: result.normalCombatTelemetry?.enemyActions || 0,
    survival: Number(result.fixedCombatResult === "victory"),
    traitEffect: effect,
    evasionMisses: (result.combatFormula?.physicalPlayerMisses || [])
      .filter(miss => miss.measurementWeaponCandidateId
        ? miss.measurementWeaponEvasionMiss === true
        : miss.isEvasionMiss === true).length,
    freezeApplication,
    observedTraits: result.diagnostics?.encounters?.[0]?.monsters?.[0]?.traits || []
  };
}

function observeFreezeApplication(result, depth) {
  const formula = result.combatFormula || {};
  const playerHit = formula.physicalPlayerHits?.find(hit =>
    hit.measurementWeaponCandidateId === PLAYER_FIXTURE.weapon
  ) || null;
  const playerMiss = formula.physicalPlayerMisses?.find(miss =>
    miss.measurementWeaponCandidateId === PLAYER_FIXTURE.weapon
  ) || null;
  const playerAttack = playerHit || playerMiss;
  const monsterHit = formula.physicalMonsterHits?.find(hit => hit.attackType === "normal") || null;
  const guard = formula.mitigations?.find(mitigation =>
    mitigation.type === "guardAction" && mitigation.attackType === "physical"
  ) || null;
  const declaredGuardRound = (result.diagnostics?.encounters?.[0]?.rounds || []).some(round =>
    round.action === "defend" &&
    round.enemyActionEvents?.some(event => event.order < round.playerActionOrder)
  );
  const enemy = result.diagnostics?.encounters?.[0]?.monsters?.[0] || null;
  return {
    combatTier: getCombatTierForStartFloor(depth),
    enemyMaxHp: enemy?.maxHp ?? null,
    enemyAtk: enemy?.atk ?? null,
    weaponBehaviorProfileId: playerHit?.weaponBehaviorProfileId ?? null,
    weaponBehaviorDamageMultiplier: playerHit?.weaponBehaviorDamageMultiplier ?? null,
    weaponCandidateId: playerAttack?.measurementWeaponCandidateId ?? null,
    weaponCandidateMultiplier: playerAttack?.measurementWeaponMultiplier ?? null,
    weaponCandidateHitChance: playerAttack?.measurementWeaponHitChance ?? null,
    weaponCandidateHighDefPenetration: playerAttack?.measurementWeaponHighDefPenetration ?? null,
    weaponTargetEvasionChance: playerAttack?.targetEvasionChance ?? null,
    weaponHitChance: playerAttack?.hitChance ?? null,
    evasionMissObserved: playerMiss?.measurementWeaponEvasionMiss === true,
    weaponBaseRaw: playerHit?.measurementWeaponBaseRaw ?? null,
    weaponFormulaRaw: playerHit?.formulaRaw ?? null,
    weaponEffectiveDefense: playerHit?.measurementWeaponEffectiveDefense ?? null,
    weaponDefenseInput: playerHit?.def ?? null,
    armorDefResistance: monsterHit?.defResistance ?? null,
    guardBefore: guard?.before ?? null,
    guardAfter: guard?.after ?? null,
    guardResolvedMultiplier: guard
      ? guard.after === Math.max(1, Math.round(guard.before * PLAYER_FIXTURE.guardMultiplier))
      : false,
    declaredGuardTimingObserved: declaredGuardRound
  };
}

function summarizeRuns(rows, traitId, depth, conditionId) {
  const effectRows = rows.map(row => row.traitEffect.effectAmount);
  const activationRows = rows.map(row => row.traitEffect.activationCount);
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
    survivalRate: rows.reduce((sum, row) => sum + row.survival, 0) / rows.length,
    evasionMisses: rows.reduce((sum, row) => sum + row.evasionMisses, 0),
    freezeApplication: rows[0]?.freezeApplication || null,
    traitEffect: {
      activationCount: summarize(activationRows),
      effectAmount: summarize(effectRows),
      effectUnit: rows[0]?.traitEffect.effectUnit || (conditionId === "trait-absent" ? "unobserved" : null)
    },
    observedTraitPresence: [...new Set(rows.flatMap(row => row.observedTraits))]
  };
}

function deltaSummary(present, absent) {
  const subtract = (left, right) => ({
    average: left.average - right.average,
    p50: left.p50 - right.p50,
    min: left.min - right.min,
    max: left.max - right.max
  });
  return {
    rounds: subtract(present.rounds, absent.rounds),
    damageTaken: subtract(present.damageTaken, absent.damageTaken),
    enemyActions: subtract(present.enemyActions, absent.enemyActions),
    survivalRate: present.survivalRate - absent.survivalRate,
    traitEffectAmount: subtract(present.traitEffect.effectAmount, absent.traitEffect.effectAmount)
  };
}

function resolveScaling(depth) {
  const tier = getCombatTierForStartFloor(depth);
  return {
    depth,
    tier,
    hp: 1 + 0.20 * tier,
    atk: 1 + 0.10 * tier,
    def: 1.0
  };
}

function runCell({ traitId, depth, conditionId, runs, seed }) {
  const { fixture } = findFixture(traitId);
  const condition = CONDITIONS.find(candidate => candidate.id === conditionId);
  const rows = [];
  for (let runIndex = 0; runIndex < runs; runIndex++) {
    const worldSeed = resolveWorldSeed({ seed, traitId, depth, runIndex });
    const result = simulateRun({
      className: "Fighter",
      fixtureId: BUILD_FIXTURE_ID,
      startFloor: depth,
      targetDepth: depth + 1,
      runIndex,
      seriesId: `issue1586:${traitId}:B${depth}`,
      scoringProfile: null,
      scenario: createScenario({ fixture, condition, depth }),
      workshop: { ranks: {} },
      worldSeed,
      collectDiagnostics: true,
      collectCombatFormula: true
    });
    rows.push(observeRun(result, traitId, conditionId, depth));
  }
  return summarizeRuns(rows, traitId, depth, conditionId);
}

export function resolveWorldSeed({ seed, traitId, depth, runIndex }) {
  return `${seed}:issue1586:${traitId}:B${depth}:${runIndex}`;
}

export async function runTraitScalingDiagnostic({
  runs = DEFAULT_RUNS,
  seed = DEFAULT_SEED,
  allowSmallRunCount = false
} = {}) {
  const normalizedRuns = positiveInteger(runs, "runs", allowSmallRunCount ? 1 : MIN_CONFIDENT_RUNS);
  const normalizedSeed = positiveInteger(seed, "seed");
  const cells = [];
  for (const trait of TRAIT_FIXTURES) {
    for (const depth of DEPTHS) {
      for (const condition of CONDITIONS) {
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
    const present = cells.find(cell => cell.traitId === trait.id && cell.conditionId === "trait-present" && cell.depth === depth);
    const absent = cells.find(cell => cell.traitId === trait.id && cell.conditionId === "trait-absent" && cell.depth === depth);
    return { traitId: trait.id, depth, present, absent, delta: deltaSummary(present, absent) };
  }));
  return {
    schemaVersion: SCHEMA_VERSION,
    runnerVersion: RUNNER_VERSION,
    measurementId: "trait-scaling-diagnostic",
    evidenceScope: "diagnostic",
    confidencePolicy: {
      minimumConfidentRuns: MIN_CONFIDENT_RUNS,
      belowMinimum: "runner-correctness-only; no balance conclusion"
    },
    configuration: {
      runs: normalizedRuns,
      seed: normalizedSeed,
      depths: [...DEPTHS],
      buildFixtureId: BUILD_FIXTURE_ID,
      playerFixture: {
        ...PLAYER_FIXTURE,
        weaponProfile: PLAYER_FIXTURE.weapon,
        armorProfile: PLAYER_FIXTURE.armor,
        shieldProfile: PLAYER_FIXTURE.shield
      },
      traits: TRAIT_FIXTURES.map(trait => ({ ...trait })),
      conditions: CONDITIONS.map(condition => ({ ...condition })),
      scaling: "HP = 1 + 0.20 × Tier; ATK = 1 + 0.10 × Tier; DEF = 1.0",
      seedPolicy: "trait/depth/runIndex keyed worldSeed; trait-present/trait-absent pairs share the same initial RNG state",
      omitted: [
        "production mutation",
        "Phase 1 freeze value changes",
        "trait value tuning",
        "composition, bosses, status attacks, spell scripts",
        "loot, UI, save, map traversal, full Cartesian product",
        "Heavy run"
      ]
    },
    scaling: DEPTHS.map(resolveScaling),
    freezeApplication: cells[0]?.freezeApplication || null,
    cells,
    comparisons
  };
}

function buildReport(result, provenance, options) {
  const environmentHash = printEnvSignatureBanner({
    runnerVersion: RUNNER_VERSION,
    schemaVersion: SCHEMA_VERSION,
    measurementId: result.measurementId,
    seed: result.configuration.seed,
    runs: result.configuration.runs,
    depths: result.configuration.depths,
    traits: result.configuration.traits.map(trait => trait.id),
    buildFixtureId: result.configuration.buildFixtureId
  }, { label: "issue1586 trait scaling diagnostic env" });
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
      player: "measurement-only Phase 1 freeze candidate: vanguard=sword/mediumArmor/smallShield; declared Guard; capped half-step Load; no production fixture",
      traits: "production trait values and production combat resolver retained; absent condition removes only the selected trait in the measurement fixture",
      status: "diagnostic-only; production combat/enemy/loot/UI/save unchanged"
    }
  };
}

function format(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "-";
}

function buildSummary(report) {
  const lines = [
    "# Trait scaling diagnostic (#1586)",
    "",
    `- runner: ${report.runnerVersion}; source SHA: ${report.measurement.sourceCommit || "not recorded"}`,
    `- N=${report.configuration.runs}; seed=${report.configuration.seed}; production fixture=${report.configuration.buildFixtureId || "none"}`,
    `- player fixture: ${report.configuration.playerFixture.id}; ${report.configuration.playerFixture.weapon}/${report.configuration.playerFixture.armor}/${report.configuration.playerFixture.shield}; Guard=${report.configuration.playerFixture.guardTiming}; Load=${report.configuration.playerFixture.loadCandidateId}`,
    "- scaling: HP 1 + 0.20 × Tier; ATK 1 + 0.10 × Tier; DEF 1.0",
    "- production values unchanged; trait-present/trait-absent uses the same production monster fixture and matched seed template",
    "",
    "## Paired deltas (traitあり − traitなし)",
    "",
    "- rounds / damage taken / enemy actions: average delta",
    "- survival: percentage-point delta",
    "- trait effect: average amount delta",
    ""
  ];
  for (const comparison of report.comparisons) {
    lines.push(
      `- ${comparison.traitId} B${comparison.depth}: rounds ${format(comparison.delta.rounds.average)}, ` +
      `damage ${format(comparison.delta.damageTaken.average)}, enemy actions ${format(comparison.delta.enemyActions.average)}, ` +
      `survival ${(comparison.delta.survivalRate * 100).toFixed(2)}pp, ` +
      `trait effect ${format(comparison.delta.traitEffectAmount.average)} ${comparison.present.traitEffect.effectUnit}`
    );
  }
  lines.push(
    "",
    "## Scope and limits",
    "",
    "- Production `runEncounter` / `runCombatRoundCalculation` path is used.",
    "- Trait absent is a measurement-only removal of one selected trait; no production trait value changes.",
    "- This diagnostic does not estimate full-run survival, encounter frequency, composition, boss, status, spell, or Heavy behavior.",
    "- N<30 is correctness-only; N=200 is required for the GitHub Actions measurement.",
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
  const result = await runTraitScalingDiagnostic({ runs, seed });
  const report = buildReport(result, provenance, options);
  fs.writeFileSync(resolve(options.output), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(resolve(options.summary), buildSummary(report));
  console.log(`Wrote Issue #1586 trait scaling diagnostic: ${resolve(options.output)}`);
}

export { buildReport, buildSummary, observeTraitEffect };

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
