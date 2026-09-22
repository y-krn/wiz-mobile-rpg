// sim-scope: run — Phase 2d fixed milestone-boss decision-pressure diagnostic
/* global console, process */

import "../simulations/simulation_preflight.js";
import fs from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { getBiomeForFloor } from "../../src/data/biomes.js";
import {
  MONSTERS,
  MONSTER_STATUS_ATTACK_PATTERNS
} from "../../src/data/monsters.js";
import { getMilestoneBossRule } from "../../src/rules/boss_rules.js";
import {
  PLAYER_FIXTURE,
  resolvePlayerFixture
} from "./composition_trait_diagnostic.js";
import { simulateRun } from "../simulations/sim_depth_material_ev.js";
import { requireRunnerProvenance } from "./measurement_provenance.js";
import { printEnvSignatureBanner, readSimScopeDeclaration } from "./measurement_env_signature.js";

export const RUNNER_VERSION = "issue1629-b30-hard-wall-diagnostic-v3";
export const SCHEMA_VERSION = 3;
export const DEFAULT_RUNS = 200;
export const DEFAULT_SEED = 1613;
export const MIN_CONFIDENT_RUNS = 30;
export const REFLECT_PHYSICAL_DIAGNOSTIC_RATE = 0.20;
const B30_ACTION_CATEGORIES = Object.freeze(["normal", "breath", "MADALTO", "TILTOWAIT", "guardian-pressure", "other"]);

export const BOSS_FIXTURES = Object.freeze([
  Object.freeze({ floor: 5, bossName: "デーモンガード" }),
  Object.freeze({ floor: 10, bossName: "ストーンガード" }),
  Object.freeze({ floor: 15, bossName: "ポイズンジャイアント" }),
  Object.freeze({ floor: 20, bossName: "マスターデーモン" }),
  Object.freeze({ floor: 25, bossName: "レッドドラゴン" }),
  Object.freeze({ floor: 30, bossName: "いにしえの竜" })
]);

const SPELL_ACTIONS = new Set(["HALITO", "LAHALITO", "MADALTO", "TILTOWAIT"]);

// Inventory only. Execution remains in src/combat_logic/boss_actions.js and
// src/combat_logic/round.js; this map is not a second boss implementation.
const CUSTOM_BOSS_ACTIONS = Object.freeze({
  "デーモンガード": Object.freeze({
    actions: Object.freeze(["B5 guard break", "B5 exposure window"]),
    warnings: Object.freeze(["LAHALITO queued / next-turn spell telegraph"]),
    activationCondition: "LAHALITO queued and HP <= 80% max HP",
    guardInteraction: "queued LAHALITO is interrupted; boss cannot attack for 4 exposure turns"
  }),
  "いにしえの竜": Object.freeze({
    actions: Object.freeze(["炎の息", "MADALTO", "TILTOWAIT"]),
    warnings: Object.freeze([
      "breath telegraph / next-turn breath",
      "MADALTO telegraph / next-turn MADALTO",
      "TILTOWAIT telegraph / next-turn TILTOWAIT"
    ]),
    activationCondition: "production turn cycle; silence suppresses queued spell branches",
    guardInteraction: "breath uses Guard breath mitigation; MADALTO uses spell mitigation; TILTOWAIT gets extra Guard reduction"
  })
});

const RUNNER_PATH = "scratch/measurements/milestone_boss_diagnostic.js";
const SIMULATION_PATH = "scratch/simulations/sim_depth_material_ev.js";
const PRODUCTION_PATHS = Object.freeze([
  "src/data/biomes.js",
  "src/data/monsters.js",
  "src/rules/boss_rules.js",
  "src/rules/guard_rules.js",
  "src/combat_logic/boss_actions.js",
  "src/combat_logic/round.js",
  "src/combat_logic/status_effects.js",
  "src/combat_ui/encounter.js"
]);
const DIAGNOSTIC_PATHS = Object.freeze([
  RUNNER_PATH,
  SIMULATION_PATH,
  "scratch/measurements/composition_trait_diagnostic.js",
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
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
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
  return {
    count: numeric.length,
    average: numeric.length ? numeric.reduce((sum, value) => sum + value, 0) / numeric.length : null,
    p50: percentile(numeric, 0.5),
    min: numeric.length ? Math.min(...numeric) : null,
    max: numeric.length ? Math.max(...numeric) : null
  };
}

function countBy(values) {
  return values.reduce((counts, value) => {
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function summarizeStructured(values) {
  const counts = new Map();
  values.forEach(value => {
    const key = JSON.stringify(value);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.entries()].map(([key, count]) => ({ ...JSON.parse(key), count }));
}

function countLogs(logs, pattern) {
  return logs.filter(message => pattern.test(String(message))).length;
}

function findBoss(fixture) {
  const biome = getBiomeForFloor(fixture.floor);
  if (biome.bossName !== fixture.bossName) {
    throw new Error(`B${fixture.floor} production boss mismatch: ${biome.bossName} != ${fixture.bossName}`);
  }
  const template = MONSTERS.find(monster => monster.name === fixture.bossName);
  if (!template) throw new Error(`missing production milestone boss: ${fixture.bossName}`);
  const custom = CUSTOM_BOSS_ACTIONS[fixture.bossName] || null;
  const statusPattern = template.statusAttackPattern
    ? MONSTER_STATUS_ATTACK_PATTERNS[template.statusAttackPattern]
    : null;
  const milestoneRule = getMilestoneBossRule(fixture.floor, fixture.bossName, { isBoss: true });
  return { biome, template, custom, statusPattern, milestoneRule };
}

export function resolveBossInventory(fixture) {
  const { biome, template, custom, statusPattern, milestoneRule } = findBoss(fixture);
  return {
    floor: fixture.floor,
    bossName: fixture.bossName,
    biome: biome.id,
    rawStats: { hp: template.hp, atk: template.atk, def: template.def },
    spell: template.spell || null,
    spellChance: template.spellChance ?? null,
    isPoisonous: template.isPoisonous === true,
    traits: [...(template.traits || [])],
    tags: [...(template.tags || [])],
    statusPattern: statusPattern
      ? {
          id: template.statusAttackPattern,
          active: false,
          status: statusPattern.status,
          setupAction: statusPattern.setupAction,
          payoffAction: statusPattern.payoffAction,
          setupChance: statusPattern.setupChance,
          payoffMultiplier: statusPattern.payoffMultiplier,
          runtimeEligibility: "excluded for boss encounters by resolveEnemyStatusPattern"
        }
      : null,
    legacyPoison: {
      active: template.isPoisonous === true,
      source: "monster.isPoisonous",
      runtimeEligibility: "active on the production Boss path as legacy poison fallback",
      metric: "existing enemyActionEvents.statusSources"
    },
    customBossAction: custom
      ? {
          actions: [...custom.actions],
          warnings: [...custom.warnings],
          activationCondition: custom.activationCondition
        }
      : null,
    warningTelegraphs: custom?.warnings || (
      template.spell && ["LAHALITO", "MADALTO"].includes(template.spell)
        ? [`${template.spell} queued / next-turn spell telegraph`]
        : []
    ),
    guardInteraction: {
      generic: template.spell ? "physical attack and spell damage use production Guard mitigation" : "physical attack uses production Guard mitigation",
      bossSpecific: custom?.guardInteraction || null,
      fixedSingleBossAdjacentGuard: template.traits?.includes("guardAdjacent")
        ? "not exercised: fixed encounter has no adjacent ally"
        : "not applicable"
    },
    productionBossRule: milestoneRule
      ? {
          id: milestoneRule.id,
          breakHpRate: milestoneRule.breakHpRate,
          exposureTurns: milestoneRule.exposureTurns,
          exposureDamageMultiplier: milestoneRule.exposureDamageMultiplier
        }
      : null
  };
}

export function resolveWorldSeed({ seed, floor, runIndex }) {
  return `${seed}:issue1613:milestone-boss:B${floor}:${runIndex}`;
}

function createScenario(fixture) {
  const playerFixture = resolvePlayerFixture(fixture.floor);
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
      monsterNames: [fixture.bossName],
      isBoss: true,
      entryHpRatio: 1,
      entryMpRatio: 0,
      scalingPolicy: "phase2a",
      playerCandidate: playerFixture
    }
  };
}

function observeRun(result, fixture) {
  const encounter = result.diagnostics?.encounters?.[0];
  if (!encounter) throw new Error(`B${fixture.floor} missing production encounter diagnostics`);
  const rounds = encounter.rounds || [];
  const logs = rounds.flatMap(round => round.log || []);
  const allEnemyActions = rounds.flatMap((round, roundIndex) =>
    (round.enemyActionEvents || []).map(action => ({
      ...action,
      roundIndex,
      defended: round.action === "defend"
    }))
  );
  const enemyActions = allEnemyActions.filter(action => action.monsterName === fixture.bossName);
  const actionNames = enemyActions.flatMap(action => action.actionNames || []);
  const statusSources = enemyActions.flatMap(action => action.statusSources || []);
  const spellActions = actionNames.filter(action => SPELL_ACTIONS.has(action));
  const inventory = resolveBossInventory(fixture);
  const trialPressures = encounter.monsters?.[0]?.trialPressures || [];
  const damageObservations = allEnemyActions.flatMap(action => (action.damageEvents || []).map(event => {
    const isGuardianPressure = action.monsterName !== fixture.bossName;
    const category = isGuardianPressure
      ? "guardian-pressure"
      : action.actionNames.includes("TILTOWAIT")
        ? "TILTOWAIT"
        : action.actionNames.includes("MADALTO")
          ? "MADALTO"
          : action.actionNames.includes("炎の息")
            ? "breath"
            : event.source === "normal" ? "normal" : "other";
    return {
      category,
      actionName: action.actionNames.join("+") || "通常攻撃",
      sourceName: action.monsterName,
      damage: Number(event.damage || 0),
      defended: action.defended,
      lethal: action.lethal === true,
      roundIndex: action.roundIndex
    };
  }));
  const deathLog = rounds.flatMap(round => round.log || [])
    .find(message => /倒れた|力尽きた/.test(String(message)));
  const deathSource = deathLog?.match(/で(.+?)により倒れた/)?.[1] || null;
  const lethalAction = allEnemyActions.find(action => action.lethal) || null;
  const warningsBeforeDeath = lethalAction
    ? rounds.slice(0, lethalAction.roundIndex).flatMap((round, roundIndex) =>
      (round.log || [])
        .filter(message => String(message).includes("[警告]"))
        .map(message => ({ message, roundsBeforeDeath: lethalAction.roundIndex - roundIndex }))
    )
    : [];
  const lethalActionName = lethalAction?.actionNames?.join("+") || null;
  const warningKeyword = lethalActionName === "TILTOWAIT" ? "ティルトウェイト"
    : lethalActionName === "MADALTO" ? "マダルト"
      : lethalActionName === "炎の息" ? "炎の息"
        : lethalActionName === "仲間を呼ぶ" ? "召喚" : null;
  const matchingWarningsBeforeDeath = warningKeyword
    ? warningsBeforeDeath.filter(warning => String(warning.message).includes(warningKeyword))
    : [];
  const perActionDamage = Object.fromEntries(B30_ACTION_CATEGORIES.map(category => {
    const events = damageObservations.filter(event => event.category === category);
    return [category, {
      hitCount: events.length,
      totalDamage: events.reduce((sum, event) => sum + event.damage, 0),
      defendedDamage: events.filter(event => event.defended).reduce((sum, event) => sum + event.damage, 0),
      undefendedDamage: events.filter(event => !event.defended).reduce((sum, event) => sum + event.damage, 0),
      lethal: events.some(event => event.lethal)
    }];
  }));
  const guardedPhysicalHits = (result.combatFormula?.physicalMonsterHits || [])
    .filter(hit => hit.isDefending === true);
  const guardRounds = rounds.filter(round => round.action === "defend" && round.playerActionExecuted).length;
  const guardMitigationLogCount = countLogs(logs, /軽減|身を守り/);
  const customActionNames = new Set(inventory.customBossAction?.actions || []);
  const customActionObservations = actionNames.filter(action => customActionNames.has(action));
  const mechanics = {
    b5GuardBreak: countLogs(logs, /装甲が砕けた/),
    b5ExposureTurnsConsumed: countLogs(logs, /攻撃できない/),
    guardAdjacentRedirect: countLogs(logs, /庇った！/),
    statusSetup: countLogs(logs, /毒液を溜め|煙幕を撒き/),
    statusPayoff: actionNames.filter(action => ["毒喰らい", "目眩まし狙撃"].includes(action)).length,
    customActionCount: customActionObservations.length + countLogs(logs, /装甲が砕けた/)
  };
  const nonRawSignals = [
    spellActions.length,
    statusSources.length,
    mechanics.customActionCount,
    mechanics.guardAdjacentRedirect,
    guardedPhysicalHits.filter(hit => hit.attackType !== "normal").length,
    guardMitigationLogCount - guardedPhysicalHits.filter(hit => hit.attackType === "normal").length
  ].some(value => value > 0);
  return {
    floor: fixture.floor,
    bossName: fixture.bossName,
    encounterType: encounter.type,
    outcome: result.fixedCombatResult,
    deathSource,
    lethalAction: lethalActionName || (lethalAction ? "guardian-pressure" : null),
    warningBeforeDeath: warningsBeforeDeath.length > 0,
    warningBeforeDeathMessages: warningsBeforeDeath.map(warning => warning.message),
    matchingWarningBeforeDeath: matchingWarningsBeforeDeath.length > 0,
    matchingWarningRoundsBeforeDeath: matchingWarningsBeforeDeath.map(warning => warning.roundsBeforeDeath),
    rounds: rounds.length,
    damageTaken: result.combatDamageHp || 0,
    survival: Number(result.fixedCombatResult === "victory"),
    bossActionCount: enemyActions.length,
    actionNames: countBy(actionNames),
    damageByAction: perActionDamage,
    specialDamageByDefense: Object.fromEntries(["breath", "MADALTO", "TILTOWAIT"].map(category => {
      const events = damageObservations.filter(event => event.category === category);
      return [category, {
        defended: events.filter(event => event.defended).reduce((sum, event) => sum + event.damage, 0),
        undefended: events.filter(event => !event.defended).reduce((sum, event) => sum + event.damage, 0)
      }];
    })),
    warningCount: countLogs(logs, /\[警告\]/),
    telegraphCount: countLogs(logs, /\[警告\]|予兆/),
    spellActionCount: spellActions.length,
    statusActionCount: statusSources.length,
    statusSources: countBy(statusSources),
    specialActionCount: actionNames.filter(action => ["炎の息", "TILTOWAIT"].includes(action)).length,
    guard: {
      guardRounds,
      guardMitigationLogCount,
      guardedPhysicalHits: guardedPhysicalHits.length,
      guardedAttackTypes: countBy(guardedPhysicalHits.map(hit => hit.attackType || "unknown")),
      meaningfulNonNormalMitigation: guardedPhysicalHits.some(hit => hit.attackType !== "normal") ||
        (guardMitigationLogCount > guardedPhysicalHits.filter(hit => hit.attackType === "normal").length)
    },
    mechanicActivation: mechanics,
    nonRawDecisionPressureObserved: nonRawSignals,
    observedActionNames: [...new Set(actionNames)],
    endPlayerHp: encounter.hpAfter ?? null,
    endBossHp: encounter.endEnemyHp?.find(monster => monster.name === fixture.bossName)?.hp ?? null,
    trial: encounter.generatedTrial || null,
    trialPressures: trialPressures.map(pressure => ({
      role: pressure.role,
      themeId: pressure.themeId,
      sourceName: pressure.sourceName,
      additionalTraits: [...(pressure.additionalTraits || [])],
      additionalBehavior: structuredClone(pressure.additionalBehavior || {})
    }))
  };
}

function summarizeRows(rows, fixture) {
  const actionNames = [...new Set(rows.flatMap(row => Object.keys(row.actionNames)))].sort();
  return {
    floor: fixture.floor,
    bossName: fixture.bossName,
    encounterTypes: [...new Set(rows.map(row => row.encounterType))],
    runs: rows.length,
    outcomes: countBy(rows.map(row => row.outcome)),
    deathSources: countBy(rows.map(row => row.deathSource).filter(Boolean)),
    deaths: rows.filter(row => row.outcome === "death").length,
    lethalActions: countBy(rows.map(row => row.lethalAction).filter(Boolean)),
    warningBeforeDeathRuns: rows.filter(row => row.outcome === "death" && row.warningBeforeDeath).length,
    deathsWithoutPriorWarning: rows.filter(row => row.outcome === "death" && !row.warningBeforeDeath).length,
    deathsWithMatchingWarning: rows.filter(row => row.outcome === "death" && row.matchingWarningBeforeDeath).length,
    deathsWithoutMatchingWarning: rows.filter(row => row.outcome === "death" && !row.matchingWarningBeforeDeath).length,
    matchingWarningRoundsBeforeDeath: summarize(rows.flatMap(row => row.matchingWarningRoundsBeforeDeath)),
    damageByAction: Object.fromEntries(B30_ACTION_CATEGORIES.map(category => [category, {
      hitCount: summarize(rows.map(row => row.damageByAction[category].hitCount)),
      totalDamagePerRun: summarize(rows.map(row => row.damageByAction[category].totalDamage)),
      defendedDamagePerRun: summarize(rows.map(row => row.damageByAction[category].defendedDamage)),
      undefendedDamagePerRun: summarize(rows.map(row => row.damageByAction[category].undefendedDamage)),
      lethalRuns: rows.filter(row => row.damageByAction[category].lethal).length
    }])),
    specialDamageByDefense: Object.fromEntries(["breath", "MADALTO", "TILTOWAIT"].map(category => [category, {
      defendedDamagePerRun: summarize(rows.map(row => row.specialDamageByDefense[category].defended)),
      undefendedDamagePerRun: summarize(rows.map(row => row.specialDamageByDefense[category].undefended))
    }])),
    rounds: summarize(rows.map(row => row.rounds)),
    damageTaken: summarize(rows.map(row => row.damageTaken)),
    survivalRate: rows.reduce((sum, row) => sum + row.survival, 0) / rows.length,
    bossActionCount: summarize(rows.map(row => row.bossActionCount)),
    actionNames: Object.fromEntries(actionNames.map(name => [
      name,
      summarize(rows.map(row => row.actionNames[name] || 0))
    ])),
    warningCount: summarize(rows.map(row => row.warningCount)),
    telegraphCount: summarize(rows.map(row => row.telegraphCount)),
    spellActionCount: summarize(rows.map(row => row.spellActionCount)),
    statusActionCount: summarize(rows.map(row => row.statusActionCount)),
    specialActionCount: summarize(rows.map(row => row.specialActionCount)),
    guard: {
      guardRounds: summarize(rows.map(row => row.guard.guardRounds)),
      guardMitigationLogCount: summarize(rows.map(row => row.guard.guardMitigationLogCount)),
      guardedPhysicalHits: summarize(rows.map(row => row.guard.guardedPhysicalHits)),
      guardedAttackTypes: countBy(rows.flatMap(row => Object.keys(row.guard.guardedAttackTypes))),
      meaningfulNonNormalMitigationRuns: rows.filter(row => row.guard.meaningfulNonNormalMitigation).length
    },
    trialBands: summarizeStructured(rows.map(row => row.trial).filter(Boolean)),
    guardianPressures: summarizeStructured(rows.flatMap(row => row.trialPressures || [])),
    mechanicActivation: Object.fromEntries(Object.keys(rows[0].mechanicActivation).map(key => [
      key,
      summarize(rows.map(row => row.mechanicActivation[key]))
    ])),
    nonRawDecisionPressureObservedRuns: rows.filter(row => row.nonRawDecisionPressureObserved).length,
    confidence: rows.length < MIN_CONFIDENT_RUNS ? "runner-correctness-only" : "bounded-diagnostic"
  };
}

function runBossCell({ fixture, runs, seed }) {
  const rows = [];
  for (let runIndex = 0; runIndex < runs; runIndex++) {
    const result = simulateRun({
      className: "Fighter",
      fixtureId: null,
      startFloor: fixture.floor,
      targetDepth: fixture.floor + 1,
      runIndex,
      seriesId: `issue1613:${fixture.bossName}:B${fixture.floor}`,
      scoringProfile: null,
      scenario: createScenario(fixture),
      workshop: { ranks: {} },
      worldSeed: resolveWorldSeed({ seed, floor: fixture.floor, runIndex }),
      collectDiagnostics: true,
      collectCombatFormula: true
    });
    rows.push(observeRun(result, fixture));
  }
  return summarizeRows(rows, fixture);
}

export async function runMilestoneBossDiagnostic({
  runs = DEFAULT_RUNS,
  seed = DEFAULT_SEED,
  floor = null,
  allowSmallRunCount = false
} = {}) {
  const normalizedRuns = positiveInteger(runs, "runs", allowSmallRunCount ? 1 : MIN_CONFIDENT_RUNS);
  const normalizedSeed = positiveInteger(seed, "seed");
  const fixtures = floor === null ? BOSS_FIXTURES : BOSS_FIXTURES.filter(fixture => fixture.floor === positiveInteger(floor, "floor"));
  if (!fixtures.length) throw new Error(`unsupported milestone boss floor: ${floor}`);
  return {
    schemaVersion: SCHEMA_VERSION,
    runnerVersion: RUNNER_VERSION,
    measurementId: floor === 30 ? "b30-hard-wall-diagnostic" : "milestone-boss-diagnostic",
    evidenceScope: "diagnostic",
    confidencePolicy: {
      minimumConfidentRuns: MIN_CONFIDENT_RUNS,
      belowMinimum: "runner-correctness-only; no balance conclusion"
    },
    configuration: {
      runs: normalizedRuns,
      seed: normalizedSeed,
      depths: fixtures.map(fixture => fixture.floor),
      playerFixture: {
        ...PLAYER_FIXTURE,
        weaponProfile: PLAYER_FIXTURE.weapon,
        armorProfile: PLAYER_FIXTURE.armor,
        shieldProfile: PLAYER_FIXTURE.shield
      },
      scaling: "HP = 1 + 0.20 × Tier; ATK = 1 + 0.10 × Tier; DEF = 1.0",
      reflectPhysicalDiagnosticFreeze: REFLECT_PHYSICAL_DIAGNOSTIC_RATE,
      compositionFreeze: "single Phase 1 vanguard fixture; production Guard semantics; no Cartesian build sweep",
      inventory: BOSS_FIXTURES.map(resolveBossInventory),
      metrics: [
        "rounds",
        "damage taken",
        "survival",
        "boss action count / actionNames",
        "warning / telegraph count",
        "spell / status / special action count",
        "Guard mitigation observation",
        "production boss-specific mechanic activation"
      ],
      omitted: [
        "production mutation",
        "boss tuning or new mechanic",
        "additional telemetry",
        "loot, UI, save, map traversal",
        "full build Cartesian product",
        "Heavy run; merge後 Actions N=200 is the bounded diagnostic"
      ]
    },
    cells: fixtures.map(fixture => runBossCell({ fixture, runs: normalizedRuns, seed: normalizedSeed }))
  };
}

function buildReport(result, provenance, options) {
  const environmentHash = printEnvSignatureBanner({
    runnerVersion: RUNNER_VERSION,
    schemaVersion: SCHEMA_VERSION,
    measurementId: result.measurementId,
    seed: result.configuration.seed,
    runs: result.configuration.runs,
    depths: result.configuration.depths
  }, { label: "issue1613 milestone boss diagnostic env" });
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
      reflectPhysical: "freeze reference 0.20; no milestone boss template declares reflectPhysical, so no synthetic reflection is applied",
      behavior: "production boss template, production isBoss combat path, production boss action / warning / status / Guard resolution",
      status: "diagnostic-only; production combat, boss, enemy, loot, UI, and save unchanged"
    }
  };
}

function format(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "-";
}

export function buildSummary(report) {
  const lines = [
    report.configuration.depths.length === 1 && report.configuration.depths[0] === 30
      ? "# B30 hard-wall cause diagnostic (#1629)"
      : "# milestone Boss decision-pressure diagnostic (#1613)",
    "",
    `- runner: ${report.runnerVersion}; source SHA: ${report.measurement.sourceCommit || "not recorded"}`,
    `- N=${report.configuration.runs}; seed=${report.configuration.seed}; depths=B${report.configuration.depths.join(", B")}`,
    `- player fixture: ${report.configuration.playerFixture.id}; ${report.configuration.playerFixture.weapon}/${report.configuration.playerFixture.armor}/${report.configuration.playerFixture.shield}; Guard=${report.configuration.playerFixture.guardTiming}; Load=${report.configuration.playerFixture.loadCandidateId}`,
    "- scaling: HP 1 + 0.20 × Tier; ATK 1 + 0.10 × Tier; DEF 1.0",
    "- fixed boss encounter: production boss path with `isBoss=true`; no boss tuning or mechanic reimplementation",
    ""
  ];
  for (const cell of report.cells) {
    lines.push(
      `- B${cell.floor} ${cell.bossName}: outcome=${JSON.stringify(cell.outcomes)}; ` +
      `rounds=${format(cell.rounds.average)}; damage=${format(cell.damageTaken.average)}; ` +
      `actions=${format(cell.bossActionCount.average)}; warnings=${format(cell.warningCount.average)}; ` +
      `spells=${format(cell.spellActionCount.average)}; status=${format(cell.statusActionCount.average)}; ` +
      `trial=${cell.trialBands.map(trial => `${trial.mainId}/${trial.subId}`).join(",")}; ` +
      `pressures=${cell.guardianPressures.map(pressure => `${pressure.role}:${pressure.sourceName}`).join(",")}; ` +
      `pressureDetails=${JSON.stringify(cell.guardianPressures.map(({ role, sourceName, additionalTraits, additionalBehavior }) => ({ role, sourceName, additionalTraits, additionalBehavior })))}; ` +
      `non-raw pressure runs=${cell.nonRawDecisionPressureObservedRuns}/${cell.runs}; ` +
      `deaths=${JSON.stringify(cell.deathSources)}; lethal actions=${JSON.stringify(cell.lethalActions)}; ` +
      `warning before death=${cell.warningBeforeDeathRuns}/${cell.deaths} deaths; matching warning=${cell.deathsWithMatchingWarning}/${cell.deaths}; ` +
      `damage by action=${JSON.stringify(Object.fromEntries(Object.entries(cell.damageByAction).map(([action, values]) => [action, { totalDamagePerRun: values.totalDamagePerRun.average, defended: values.defendedDamagePerRun.average, undefended: values.undefendedDamagePerRun.average }])))}; ` +
      `special defended/undefended=${JSON.stringify(Object.fromEntries(Object.entries(cell.specialDamageByDefense).map(([action, values]) => [action, { defended: values.defendedDamagePerRun.average, undefended: values.undefendedDamagePerRun.average }])))}; ` +
      `confidence=${cell.confidence}`
    );
  }
  lines.push(
    "",
    "## Inventory and gate",
    "",
    "- Inventory source: production biome boss mapping, monster templates, boss rules, boss actions, round status/spell/Guard path.",
    "- B5: production LAHALITO telegraph / guard-break / four-turn exposure; activation is measured from production logs.",
    "- B10: guardAdjacent is inventory-only in a fixed single-boss encounter; adjacent-Guard redirect is not exercised.",
    "- B15: `isPoisonous=true` keeps the legacy poison fallback active on the production Boss path; template-defined `poison_payoff` is inactive there. Runtime status observation uses existing `statusSources`.",
    "- B20/B25: production MADALTO path and Guard mitigation are observed when the fixed action schedule reaches them.",
    "- B30: production breath/MADALTO/TILTOWAIT cycle, warnings, and special Guard interaction are measured.",
    "- B30 deaths are attributed from the production terminal death log and lethal enemy action event; action damage uses existing round diagnostics.",
    "- Warning counts include any earlier warning in the encounter; matching-warning counts require the warning text to name the lethal queued action.",
    "- Guardian-pressure damage groups non-boss actors spawned by the fixed production boss encounter; no pressure rules are recreated.",
    "- Defended means the Phase 1 player selected Guard in that production combat round.",
    "- Reported per-run damage separates normal, breath, MADALTO, TILTOWAIT, guardian-pressure, and uncategorized evidence.",
    "- N<30 is correctness-only; merge後 GitHub Actions N=200 is the gate evidence.",
    "",
    "## Scope and limits",
    "",
    "- Production `runEncounter` / `runCombatRoundCalculation` path is used.",
    "- No production combat, boss, enemy, loot, UI, save, tuning, or telemetry change.",
    "- This is a fixed-fixture diagnostic; it does not estimate full-run survival or equalize win rates.",
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
  const floor = options.floor ? positiveInteger(options.floor, "floor") : null;
  const result = await runMilestoneBossDiagnostic({ runs, seed, floor });
  const report = buildReport(result, provenance, options);
  fs.writeFileSync(resolve(options.output), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(resolve(options.summary), buildSummary(report));
  console.log(`Wrote ${report.measurementId}: ${resolve(options.output)}`);
}

export { buildReport, observeRun };

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
