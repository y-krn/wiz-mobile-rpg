// sim-scope: diagnostic — current production depth scaling and vNext generic candidate only
/* global console, process */

import fs from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { MONSTERS } from "../../src/data/monsters.js";
import { getCombatTierForStartFloor } from "../../src/rules/combat_tier.js";
import { getDepthScaling, scaleEnemyForDepth } from "../../src/rules/depth_scaling.js";
import { createRng } from "../../src/seed_rng.js";
import {
  ARMOR_CANDIDATES,
  resolveEffectiveTempoModifier,
  resolveVNextLoadCandidate,
  SHIELD_CANDIDATES,
  WEAPON_CANDIDATES,
  tierMultiplier
} from "./equipment_vnext_combat_diagnostic.js";
import { requireRunnerProvenance } from "./measurement_provenance.js";
import { printEnvSignatureBanner, readSimScopeDeclaration } from "./measurement_env_signature.js";

export const RUNNER_VERSION = "issue1582-depth-scaling-diagnostic-v1";
export const SCHEMA_VERSION = 1;
export const DEFAULT_RUNS = 200;
export const DEFAULT_SEED = 1582;
export const MIN_CONFIDENT_RUNS = 30;
export const DEPTHS = Object.freeze([1, 5, 10, 20, 30]);
export const PLAYER_HP = 100;
export const RUNE_ACTION = Object.freeze({ id: "rune-bolt", baseDamage: 48, mpCost: 1 });

export const ENEMY_FIXTURES = Object.freeze({
  standardPhysical: Object.freeze({ id: "standardPhysical", label: "standard physical", templateName: "オークの戦士" }),
  highDefense: Object.freeze({ id: "highDefense", label: "high DEF", templateName: "石像兵" }),
  arcanePressure: Object.freeze({ id: "arcanePressure", label: "arcane pressure", templateName: "黒曜の魔導士" })
});

export const SCENARIOS = Object.freeze([
  Object.freeze({
    id: "standard-physical",
    label: "standard physical",
    enemyFixtureId: "standardPhysical",
    attackType: "physical",
    defenseProfile: "normal",
    candidates: Object.freeze([
      Object.freeze({ id: "sword", weapon: "sword", armor: "mediumArmor", shield: "noShield", actionPlan: "attack" })
    ])
  }),
  Object.freeze({
    id: "high-def-sword-vs-mace",
    label: "high DEF: Sword vs Mace",
    enemyFixtureId: "highDefense",
    attackType: "physical",
    defenseProfile: "high",
    candidates: Object.freeze([
      Object.freeze({ id: "sword", weapon: "sword", armor: "mediumArmor", shield: "noShield", actionPlan: "attack" }),
      Object.freeze({ id: "mace", weapon: "mace", armor: "mediumArmor", shield: "noShield", actionPlan: "attack" })
    ])
  }),
  Object.freeze({
    id: "physical-small-vs-large-shield",
    label: "physical: small vs large shield",
    enemyFixtureId: "standardPhysical",
    attackType: "physical",
    defenseProfile: "normal",
    candidates: Object.freeze([
      Object.freeze({ id: "smallShield", weapon: "sword", armor: "mediumArmor", shield: "smallShield", actionPlan: "attack-defend" }),
      Object.freeze({ id: "largeShield", weapon: "sword", armor: "mediumArmor", shield: "largeShield", actionPlan: "attack-defend" })
    ])
  }),
  Object.freeze({
    id: "arcane-small-vs-magic-shield",
    label: "arcane: small vs magic shield",
    enemyFixtureId: "arcanePressure",
    attackType: "spell",
    defenseProfile: "normal",
    candidates: Object.freeze([
      Object.freeze({ id: "smallShield", weapon: "wand", armor: "mediumArmor", shield: "smallShield", actionPlan: "rune-defend" }),
      Object.freeze({ id: "magicShield", weapon: "wand", armor: "mediumArmor", shield: "magicShield", actionPlan: "rune-defend" })
    ])
  })
]);

export const SCALING_POLICIES = Object.freeze({
  currentProduction: Object.freeze({ id: "currentProduction", label: "current production" }),
  vNextCandidate: Object.freeze({ id: "vNextCandidate", label: "vNext candidate" })
});

const DIAGNOSTIC_PATHS = Object.freeze([
  "scratch/measurements/depth_scaling_diagnostic.js",
  "scratch/measurements/equipment_vnext_combat_diagnostic.js",
  "src/data/monsters.js",
  "src/rules/combat_tier.js",
  "src/rules/depth_scaling.js",
  "src/seed_rng.js"
]);

function positiveInteger(value, label, minimum = 1) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) throw new Error(`${label} must be an integer >= ${minimum}: ${value}`);
  return parsed;
}

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * ratio;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return lower === upper ? sorted[lower] : sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
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

function findFixture(fixtureId) {
  const fixture = ENEMY_FIXTURES[fixtureId];
  if (!fixture) throw new Error(`unknown enemy fixture: ${fixtureId}`);
  const template = MONSTERS.find(monster => monster.name === fixture.templateName);
  if (!template) throw new Error(`missing production monster template: ${fixture.templateName}`);
  return { fixture, template };
}

export function resolveScaling(policyId, floor) {
  const tier = getCombatTierForStartFloor(floor);
  if (policyId === "currentProduction") {
    const scaling = getDepthScaling(floor);
    return Object.freeze({
      policyId,
      floor,
      tier,
      hp: scaling.enemy,
      atk: 1 + (scaling.enemy - 1) * 0.58,
      def: 1 + (scaling.enemy - 1) * 0.34,
      reward: scaling.reward,
      source: "getDepthScaling + scaleEnemyForDepth"
    });
  }
  if (policyId === "vNextCandidate") {
    return Object.freeze({
      policyId,
      floor,
      tier,
      hp: 1 + 0.20 * tier,
      atk: 1 + 0.10 * tier,
      def: 1.0,
      reward: null,
      source: "diagnostic policy: 1 + HP 0.20 × Tier; ATK 0.10 × Tier; DEF fixed"
    });
  }
  throw new Error(`unknown scaling policy: ${policyId}`);
}

function roundStats(template, scaling) {
  return {
    hp: Math.max(1, Math.round(template.hp * scaling.hp)),
    atk: Math.max(1, Math.round(template.atk * scaling.atk)),
    def: Math.max(0, Math.round(template.def * scaling.def))
  };
}

export function resolveEnemyStats(policyId, floor, template) {
  const scaling = resolveScaling(policyId, floor);
  const productionInstance = policyId === "currentProduction" ? scaleEnemyForDepth(template, floor) : null;
  const stats = productionInstance
    ? { hp: productionInstance.maxHp, atk: productionInstance.atk, def: productionInstance.def }
    : roundStats(template, scaling);
  return { scaling, stats };
}

function resolvePlayerAttack({ candidate, scenario, depth, enemyDef, rng, mp }) {
  const weapon = WEAPON_CANDIDATES[candidate.weapon];
  const tier = getCombatTierForStartFloor(depth);
  if (scenario.attackType === "spell" && candidate.actionPlan === "rune-defend" && mp >= RUNE_ACTION.mpCost) {
    return {
      damage: Math.max(1, RUNE_ACTION.baseDamage * tierMultiplier(tier) * (0.92 + rng() * 0.16)),
      mpSpent: RUNE_ACTION.mpCost,
      usedRune: true,
      hit: true
    };
  }
  const hit = rng() <= weapon.hitChance;
  if (!hit) return { damage: 0, mpSpent: 0, usedRune: false, hit: false };
  const raw = 100 * tierMultiplier(tier) * weapon.multiplier * (0.92 + rng() * 0.16);
  const normalDefense = 8;
  const excessDefense = Math.max(0, enemyDef - normalDefense);
  const effectiveDefense = weapon.highDefOnly
    ? Math.max(0, enemyDef - excessDefense * weapon.highDefPenetration)
    : enemyDef * (1 - weapon.highDefPenetration);
  return {
    damage: Math.max(1, raw * Math.max(0.20, 1 - effectiveDefense / 100)),
    mpSpent: 0,
    usedRune: false,
    hit: true
  };
}

function resolveEnemyAttack({ enemyAtk, candidate, attackType, defending, rng }) {
  const armorMitigation = 1 - ARMOR_CANDIDATES.mediumArmor.mitigation;
  const incoming = enemyAtk * (0.92 + rng() * 0.16);
  const guard = SHIELD_CANDIDATES[candidate.shield].guard[attackType] ?? SHIELD_CANDIDATES[candidate.shield].guard.physical;
  const taken = Math.max(1, incoming * armorMitigation * (defending ? guard : 1));
  return { taken, guardReduction: defending ? Math.max(0, incoming * armorMitigation - taken) : 0 };
}

function resolveInitiative(candidate, rng) {
  const load = resolveVNextLoadCandidate(candidate, "aggregate");
  const effectiveTempoModifier = resolveEffectiveTempoModifier(load, "cappedHalfStep");
  const playerDraw = rng();
  const enemyDraw = rng();
  return {
    loadClass: load.class,
    rawBurden: load.aggregateScore,
    effectiveTempoModifier,
    playerFirst: 10 + effectiveTempoModifier + playerDraw * 4 >= 10 + enemyDraw * 4
  };
}

export function simulateOne({ policyId, scenario, candidate, depth, runSeed }) {
  const { template } = findFixture(scenario.enemyFixtureId);
  const { scaling, stats: enemy } = resolveEnemyStats(policyId, depth, template);
  const rng = createRng(String(runSeed));
  const tier = getCombatTierForStartFloor(depth);
  const initiative = resolveInitiative(candidate, rng);
  const mpCapacity = candidate.weapon === "wand" ? 2 + tier : 0;
  let mp = mpCapacity;
  let playerHp = PLAYER_HP;
  let enemyHp = enemy.hp;
  let rounds = 0;
  let damageDealt = 0;
  let damageTaken = 0;
  let enemyActions = 0;
  let playerActions = 0;
  let guardedEnemyActions = 0;
  let guardReduction = 0;
  let runeActions = 0;
  let mpSpent = 0;
  while (playerHp > 0 && enemyHp > 0 && rounds < 30) {
    rounds++;
    const defending = candidate.actionPlan.endsWith("defend") && rounds % 2 === 0;
    const playerFirst = initiative.playerFirst;
    const playerAction = defending ? "defend" : "attack";
    const takePlayerAction = () => {
      if (playerAction === "defend") return;
      const attack = resolvePlayerAttack({ candidate, scenario, depth, enemyDef: enemy.def, rng, mp });
      playerActions++;
      mp -= attack.mpSpent;
      mpSpent += attack.mpSpent;
      runeActions += Number(attack.usedRune);
      enemyHp -= attack.damage;
      damageDealt += attack.damage;
    };
    const takeEnemyAction = () => {
      if (enemyHp <= 0) return;
      const attack = resolveEnemyAttack({ enemyAtk: enemy.atk, candidate, attackType: scenario.attackType, defending, rng });
      playerHp -= attack.taken;
      damageTaken += attack.taken;
      enemyActions++;
      guardedEnemyActions += Number(defending);
      guardReduction += attack.guardReduction;
    };
    if (playerFirst) {
      takePlayerAction();
      takeEnemyAction();
    } else {
      takeEnemyAction();
      takePlayerAction();
    }
  }
  const outcome = enemyHp <= 0 && playerHp > 0 ? "victory" : playerHp <= 0 ? "death" : "timeout";
  return {
    outcome,
    rounds,
    damageDealt,
    damageTaken,
    enemyActions,
    playerActions,
    guardedEnemyActions,
    guardReduction,
    runeActions,
    mpSpent,
    playerFirst: initiative.playerFirst,
    loadClass: initiative.loadClass,
    rawBurden: initiative.rawBurden,
    effectiveTempoModifier: initiative.effectiveTempoModifier,
    survival: Number(outcome === "victory"),
    scaling,
    enemy
  };
}

function comparisonSeed(seed, scenario, depth, runIndex) {
  return `${seed}:${scenario.id}:B${depth}:${runIndex}`;
}

function summarizeRows(rows) {
  const outcomes = rows.reduce((counts, row) => {
    counts[row.outcome] = (counts[row.outcome] || 0) + 1;
    return counts;
  }, {});
  return {
    runs: rows.length,
    outcomes,
    survivalRate: rows.reduce((sum, row) => sum + row.survival, 0) / rows.length,
    rounds: summarize(rows.map(row => row.rounds)),
    damageTaken: summarize(rows.map(row => row.damageTaken)),
    enemyActions: summarize(rows.map(row => row.enemyActions)),
    damageDealt: summarize(rows.map(row => row.damageDealt)),
    playerFirstRate: rows.reduce((sum, row) => sum + Number(row.playerFirst), 0) / rows.length,
    guardedEnemyActions: summarize(rows.map(row => row.guardedEnemyActions)),
    guardReduction: summarize(rows.map(row => row.guardReduction)),
    runeActions: summarize(rows.map(row => row.runeActions)),
    mpSpent: summarize(rows.map(row => row.mpSpent)),
    invariant: rows.length > 0 && Object.values(outcomes).reduce((sum, value) => sum + value, 0) === rows.length,
    confidence: rows.length >= MIN_CONFIDENT_RUNS ? "eligible-for-bounded-interpretation" : "runner-correctness-only"
  };
}

function runScenario({ policyId, scenario, depth, runs, seed }) {
  const summaryRows = scenario.candidates.map(candidate => {
    const rows = [];
    for (let runIndex = 0; runIndex < runs; runIndex++) {
      rows.push(simulateOne({
        policyId,
        scenario,
        candidate,
        depth,
        runSeed: comparisonSeed(seed, scenario, depth, runIndex)
      }));
    }
    const { scaling, stats } = resolveEnemyStats(policyId, depth, findFixture(scenario.enemyFixtureId).template);
    return {
      policyId,
      policyLabel: SCALING_POLICIES[policyId].label,
      scenarioId: scenario.id,
      scenarioLabel: scenario.label,
      candidateId: candidate.id,
      candidate,
      depth,
      tier: scaling.tier,
      enemyMultipliers: { hp: scaling.hp, atk: scaling.atk, def: scaling.def },
      enemyStats: stats,
      loadClass: rows[0]?.loadClass || null,
      rawBurden: rows[0]?.rawBurden ?? null,
      effectiveTempoModifier: rows[0]?.effectiveTempoModifier ?? null,
      ...summarizeRows(rows)
    };
  });
  return summaryRows;
}

function difference(left, right) {
  return {
    policyId: left.policyId,
    scenarioId: left.scenarioId,
    depth: left.depth,
    from: left.candidateId,
    to: right.candidateId,
    survivalRateDelta: right.survivalRate - left.survivalRate,
    roundsP50Delta: right.rounds.p50 - left.rounds.p50,
    damageTakenAverageDelta: right.damageTaken.average - left.damageTaken.average,
    enemyActionsAverageDelta: right.enemyActions.average - left.enemyActions.average,
    damageDealtAverageDelta: right.damageDealt.average - left.damageDealt.average
  };
}

export async function runDepthScalingDiagnostic({ runs = DEFAULT_RUNS, seed = DEFAULT_SEED, allowSmallRunCount = false } = {}) {
  const normalizedRuns = positiveInteger(runs, "runs", allowSmallRunCount ? 1 : MIN_CONFIDENT_RUNS);
  const normalizedSeed = positiveInteger(seed, "seed");
  const rows = [];
  for (const depth of DEPTHS) {
    for (const policyId of Object.keys(SCALING_POLICIES)) {
      for (const scenario of SCENARIOS) {
        rows.push(...runScenario({ policyId, scenario, depth, runs: normalizedRuns, seed: normalizedSeed }));
      }
    }
  }
  const pairs = rows.filter(row => row.scenarioId !== "standard-physical").reduce((result, row) => {
    const key = `${row.policyId}:${row.scenarioId}:${row.depth}`;
    (result[key] ||= []).push(row);
    return result;
  }, {});
  const specializationDiffs = Object.values(pairs).map(pair => difference(pair[0], pair[1]));
  return {
    schemaVersion: SCHEMA_VERSION,
    runnerVersion: RUNNER_VERSION,
    measurementId: "depth-scaling-diagnostic",
    evidenceScope: "diagnostic",
    confidencePolicy: { minimumConfidentRuns: MIN_CONFIDENT_RUNS, belowMinimum: "runner-correctness-only; no balance conclusion" },
    configuration: {
      runs: normalizedRuns,
      seed: normalizedSeed,
      depths: [...DEPTHS],
      tiers: DEPTHS.map(depth => ({ depth, tier: getCombatTierForStartFloor(depth) })),
      scalingPolicies: Object.values(SCALING_POLICIES),
      scenarios: SCENARIOS,
      playerHp: PLAYER_HP,
      playerTierMultiplier: "1 + 0.16 × Tier (Phase 1 freeze)",
      guardTiming: "declared",
      loadPolicy: "aggregate",
      loadCandidateId: "cappedHalfStep",
      runeAction: RUNE_ACTION,
      omitted: [
        "production combat/enemy mutation",
        "monster traits, composition, bosses, loot, UI, save",
        "full Cartesian product",
        "non-generic spell scripts and status effects",
        "Heavy run"
      ]
    },
    scaling: DEPTHS.flatMap(depth => Object.keys(SCALING_POLICIES).map(policyId => resolveScaling(policyId, depth))),
    rows,
    specializationDiffs
  };
}

function buildReport(result, provenance, purpose) {
  const environmentHash = printEnvSignatureBanner({
    runnerVersion: RUNNER_VERSION,
    schemaVersion: SCHEMA_VERSION,
    measurementId: result.measurementId,
    seed: result.configuration.seed,
    runs: result.configuration.runs,
    depths: result.configuration.depths,
    scenarios: result.configuration.scenarios.map(scenario => scenario.id),
    scalingPolicies: Object.keys(SCALING_POLICIES)
  }, { label: "issue1582 depth scaling diagnostic env" });
  return {
    ...result,
    purpose,
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
      productionPaths: ["src/data/monsters.js", "src/rules/combat_tier.js", "src/rules/depth_scaling.js"],
      diagnosticPaths: [...DIAGNOSTIC_PATHS],
      environmentHash
    },
    candidatePolicy: {
      currentProduction: "Production getDepthScaling / scaleEnemyForDepth; floor-linear + milestone HP, derived ATK/DEF.",
      vNextCandidate: "HP = 1 + 0.20 × Tier; ATK = 1 + 0.10 × Tier; DEF = 1.0; same-Tier floors share generic multipliers.",
      player: "Phase 1 frozen player tier multiplier 1 + 0.16 × Tier; Sword/Mace, medium armor, declared Guard timing, capped-half-step load, Guard profiles and Rune action imported from existing diagnostic vocabulary.",
      pressure: "Enemy damage uses scaled production-template ATK as normalized generic pressure for both physical and arcane shield comparisons; real spell scripts are omitted.",
      status: "diagnostic-only; no production values or paths changed"
    }
  };
}

function formatNumber(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "-";
}

function buildSummary(report) {
  const lines = [
    "# Generic enemy depth scaling diagnostic (#1582)",
    "",
    `- measurement: ${report.measurementId}; runner: ${report.runnerVersion}; source SHA: ${report.measurement.sourceCommit || "not recorded"}`,
    `- N=${report.configuration.runs}; seed=${report.configuration.seed}; confidence: ${report.confidencePolicy.belowMinimum} below N=${MIN_CONFIDENT_RUNS}`,
    "- production: unchanged; this report compares current production reference with a diagnostic vNext policy.",
    "",
    "## Scaling reference",
    "",
    "| depth | tier | policy | HP multiplier | ATK multiplier | DEF multiplier |",
    "| ---: | ---: | --- | ---: | ---: | ---: |",
    ...report.scaling.map(row => `| B${row.floor} | T${row.tier} | ${SCALING_POLICIES[row.policyId].label} | ${row.hp.toFixed(3)}x | ${row.atk.toFixed(3)}x | ${row.def.toFixed(3)}x |`),
    "",
    "## Fixed combat diagnostics",
    "",
    "- Metrics: rounds p50, damage taken average, enemy actions average, survival, enemy HP/ATK/DEF multipliers.",
    "- Conditions: one standard physical row; Sword/Mace high DEF pair; small/large physical shield pair; small/magic arcane shield pair.",
    "",
    "| policy | depth | condition | candidate | enemy HP/ATK/DEF | rounds p50 | damage taken | enemy actions | survival |",
    "| --- | ---: | --- | --- | --- | ---: | ---: | ---: | ---: |",
    ...report.rows.map(row => `| ${row.policyLabel} | B${row.depth} | ${row.scenarioLabel} | ${row.candidateId} | ${row.enemyMultipliers.hp.toFixed(2)}x/${row.enemyMultipliers.atk.toFixed(2)}x/${row.enemyMultipliers.def.toFixed(2)}x | ${formatNumber(row.rounds.p50)} | ${formatNumber(row.damageTaken.average)} | ${formatNumber(row.enemyActions.average)} | ${(row.survivalRate * 100).toFixed(1)}% |`),
    "",
    "## Specialization differences",
    "",
    "- Delta = to - from. Survival is percentage-point equivalent when multiplied by 100; other deltas use the same units as the row metrics.",
    "",
    "| policy | depth | condition | from -> to | rounds p50 Δ | damage taken Δ | enemy actions Δ | survival Δ |",
    "| --- | ---: | --- | --- | ---: | ---: | ---: | ---: |",
    ...report.specializationDiffs.map(row => `| ${SCALING_POLICIES[row.policyId].label} | B${row.depth} | ${row.scenarioId} | ${row.from} -> ${row.to} | ${formatNumber(row.roundsP50Delta)} | ${formatNumber(row.damageTakenAverageDelta)} | ${formatNumber(row.enemyActionsAverageDelta)} | ${(row.survivalRateDelta * 100).toFixed(1)}pp |`),
    "",
    "## Boundary",
    "",
    "- Phase 1 player values unchanged: Combat Tier, Weapon, medium Armor, Guard倍率, declared Guard timing, capped load. No production combat, enemy, loot, UI, save, trait, composition, boss, or Heavy changes.",
    "- Arcane rows isolate generic ATK pressure and Guard profile; production spell scripts, spell chances, and status effects are omitted.",
    "- N=200 is a reference diagnostic, not a freeze decision by itself; merge後 artifact remains the measurement source."
  ];
  return `${lines.join("\n")}\n`;
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
  const runs = positiveInteger(options.runs || DEFAULT_RUNS, "runs", MIN_CONFIDENT_RUNS);
  const seed = positiveInteger(options.seed || DEFAULT_SEED, "seed");
  if (!options.output || !options.summary) throw new Error("--output and --summary are required");
  const provenance = requireRunnerProvenance({ fetchOriginMain: false, measurementRunnerPaths: [...DIAGNOSTIC_PATHS] });
  const result = await runDepthScalingDiagnostic({ runs, seed });
  const report = buildReport(result, provenance, options.purpose || process.env.MEASUREMENT_PURPOSE || "");
  fs.writeFileSync(resolve(options.output), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(resolve(options.summary), buildSummary(report));
  console.log(`Wrote Issue #1582 depth scaling diagnostic: ${resolve(options.output)}`);
}

export { buildReport, buildSummary };

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
