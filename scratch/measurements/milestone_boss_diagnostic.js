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
import { scaleEnemyForDepth } from "../../src/rules/depth_scaling.js";
import {
  PLAYER_FIXTURE,
  resolvePlayerFixture
} from "./composition_trait_diagnostic.js";
import { simulateRun } from "../simulations/sim_depth_material_ev.js";
import { requireRunnerProvenance } from "./measurement_provenance.js";
import { printEnvSignatureBanner, readSimScopeDeclaration } from "./measurement_env_signature.js";

export const RUNNER_VERSION = "issue1674-b10-crush-strike-opening-v1";
export const SCHEMA_VERSION = 14;
export const DEFAULT_RUNS = 200;
export const DEFAULT_SEED = 1613;
export const MIN_CONFIDENT_RUNS = 30;
export const REFLECT_PHYSICAL_DIAGNOSTIC_RATE = 0.20;
const B30_ACTION_CATEGORIES = Object.freeze(["normal", "breath", "MADALTO", "TILTOWAIT", "砕岩打ち", "guardian-pressure", "round-end-status", "other"]);
const PRESSURE_STATUS_BEHAVIOR = Object.freeze({
  isPoisonous: "poison",
  isParalyzing: "paralyze",
  isBlinding: "blind",
  isSleepInflicting: "sleep",
  statusAttackPattern: "statusPattern"
});

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
  "src/rules/depth_scaling.js",
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

export function resolveGuardianPressureMechanisms(action, bossName, pressures) {
  const mechanisms = [];
  const pressureTraits = new Set(pressures.flatMap(pressure => pressure.additionalTraits || []));
  const pressureBehaviors = new Set(pressures.flatMap(pressure => Object.keys(pressure.additionalBehavior || {})));
  const actionTraits = new Set(action.traitSources || []);
  if (action.extraMultiAction && pressureTraits.has("multiAction")) actionTraits.add("multiAction");
  if (action.monsterName !== bossName && pressureTraits.has("summonAlly")) {
    mechanisms.push("summonedAlly");
  }
  if ([...actionTraits].some(trait => pressureTraits.has(trait) || pressureBehaviors.has(trait))) {
    mechanisms.push("pressureTraitAction");
  }
  const pressureStatuses = new Set([
    ...pressureTraits,
    ...pressures.flatMap(pressure => Object.entries(pressure.additionalBehavior || {})
      .map(([key, value]) => value ? PRESSURE_STATUS_BEHAVIOR[key] : null)
      .filter(Boolean))
  ]);
  if ((action.statusSources || []).some(source => pressureStatuses.has(source))) {
    mechanisms.push("pressureStatusAction");
  }
  return [...new Set(mechanisms)];
}

export function resolveGuardianPressureSources(action, bossName, pressures) {
  const pressureTraits = new Set(pressures.flatMap(pressure => pressure.additionalTraits || []));
  const pressureBehaviors = new Set(pressures.flatMap(pressure => Object.keys(pressure.additionalBehavior || {})));
  const pressureStatusSources = new Set(pressures.flatMap(pressure => [
    ...(pressure.additionalTraits || []),
    ...Object.entries(pressure.additionalBehavior || {})
      .map(([key, value]) => value ? PRESSURE_STATUS_BEHAVIOR[key] : null)
      .filter(Boolean)
  ]));
  const sources = [
    ...(action.traitSources || [])
      .filter(trait => pressureTraits.has(trait) || pressureBehaviors.has(trait))
      .map(trait => `trait:${trait}`),
    ...(action.statusSources || [])
      .filter(source => pressureStatusSources.has(source))
      .map(source => `status:${source}`)
  ];
  if (action.extraMultiAction && pressureTraits.has("multiAction")) sources.push("trait:multiAction");
  if (action.monsterName !== bossName && pressureTraits.has("summonAlly")) {
    sources.push(`summonedAlly:${action.monsterName || "unknown"}`);
  }
  return [...new Set(sources)];
}

export function isGuardianPressureStatusDamage(statusSource, pressures, observedPressureStatuses = []) {
  if (observedPressureStatuses.includes(statusSource)) return true;
  return pressures.some(pressure =>
    (pressure.additionalTraits || []).includes(statusSource) ||
    Object.entries(pressure.additionalBehavior || {}).some(([key, value]) =>
      value && PRESSURE_STATUS_BEHAVIOR[key] === statusSource
    )
  );
}

export function observeRoundEndStatusDamage(event, pressures, observedPressureStatuses, roundIndex) {
  const source = event.statusSource || event.source || "status";
  const pressureLinked = isGuardianPressureStatusDamage(source, pressures, observedPressureStatuses);
  return {
    category: "round-end-status",
    actionName: source,
    sourceName: event.monsterName || null,
    damage: Number(event.damage || 0),
    defended: false,
    lethal: event.lethal === true,
    roundIndex,
    pressureMechanisms: pressureLinked ? ["roundEndStatusDamage"] : [],
    pressureSources: pressureLinked ? [`status:${source}`] : []
  };
}

export function summarizeSpecialDamageByDefense(events) {
  return Object.fromEntries(["breath", "MADALTO", "TILTOWAIT"].map(category => {
    const hits = events.filter(event => event.category === category);
    const defended = hits.filter(event => event.defended);
    const undefended = hits.filter(event => !event.defended);
    return [category, {
      defendedHitCount: defended.length,
      undefendedHitCount: undefended.length,
      defendedDamagePerHit: summarize(defended.map(event => event.damage)),
      undefendedDamagePerHit: summarize(undefended.map(event => event.damage))
    }];
  }));
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
    productionScaledStats: (() => {
      const scaled = scaleEnemyForDepth(template, fixture.floor, { boss: true });
      return { hp: scaled.hp, atk: scaled.atk, def: scaled.def };
    })(),
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

function createScenario(fixture, actionPlan = null, {
  b30GuardRecoveryCandidate = false,
  b30HpScalingRemoved = false,
  b30AtkScalingRemoved = false,
  crushStrikeResponse = null
} = {}) {
  const playerFixture = resolvePlayerFixture(fixture.floor);
  return {
    startingKit: playerFixture.startingKit,
    hpBaseBonus: playerFixture.maxHp - 20,
    measurementCombatPlan: actionPlan || playerFixture.actionPlan,
    b10CrushStrikeResponse: crushStrikeResponse,
    measurementGuardTiming: playerFixture.guardTiming,
    b30TiltowaitGuardRecoveryCandidate: b30GuardRecoveryCandidate,
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
    ...(fixture.floor === 30 && (b30HpScalingRemoved || b30AtkScalingRemoved) ? {
      bossOverride: {
        floor: 30,
        ...(b30HpScalingRemoved ? { hpMultiplier: 0.5 } : {}),
        ...(b30AtkScalingRemoved ? { atkMultiplier: 2 / 3 } : {})
      }
    } : {}),
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
  const bossEndState = encounter.endEnemyHp?.find(monster => monster.name === fixture.bossName) || null;
  const bossInitialState = encounter.monsters?.find(monster => monster.name === fixture.bossName) || null;
  const endBossHp = bossEndState?.hp ?? null;
  const endBossMaxHp = bossEndState?.maxHp ?? null;
  const endBossHpRate = Number.isFinite(endBossHp) && Number.isFinite(endBossMaxHp) && endBossMaxHp > 0
    ? endBossHp / endBossMaxHp
    : null;
  const inventory = resolveBossInventory(fixture);
  const logs = rounds.flatMap(round => round.log || []);
  const allEnemyActions = rounds.flatMap((round, roundIndex) =>
    (round.enemyActionEvents || []).map(action => ({
      ...action,
      roundIndex,
      defended: round.action === "defend",
      queuedSpecials: round.measurementQueuedSpecials || []
    }))
  );
  const enemyActions = allEnemyActions.filter(action => action.monsterName === fixture.bossName);
  const actionNames = enemyActions.flatMap(action => action.actionNames || []);
  const statusSources = enemyActions.flatMap(action => action.statusSources || []);
  const spellActions = actionNames.filter(action => SPELL_ACTIONS.has(action));
  const trialPressures = encounter.monsters?.[0]?.trialPressures || [];
  const pressureStatusSources = new Set(trialPressures.flatMap(pressure => [
    ...Object.entries(pressure.additionalBehavior || {})
      .map(([key, value]) => value ? PRESSURE_STATUS_BEHAVIOR[key] : null)
      .filter(Boolean),
    ...(pressure.additionalTraits || [])
  ]));
  const pressureMechanismsByAction = new Map();
  allEnemyActions.forEach(action => {
    const mechanisms = resolveGuardianPressureMechanisms(action, fixture.bossName, trialPressures);
    pressureMechanismsByAction.set(action, mechanisms);
    if (mechanisms.includes("pressureStatusAction") || mechanisms.includes("summonedAlly")) {
      (action.statusSources || []).forEach(source => pressureStatusSources.add(source));
    }
  });
  const damageObservations = allEnemyActions.flatMap(action => (action.damageEvents || []).map(event => {
    const pressureMechanisms = pressureMechanismsByAction.get(action) || [];
    const pressureSources = resolveGuardianPressureSources(action, fixture.bossName, trialPressures);
    const isGuardianPressure = pressureMechanisms.includes("summonedAlly");
    const category = isGuardianPressure
      ? "guardian-pressure"
      : action.actionNames.includes("TILTOWAIT")
        ? "TILTOWAIT"
        : action.actionNames.includes("MADALTO")
          ? "MADALTO"
          : action.actionNames.includes("炎の息")
            ? "breath"
            : action.actionNames.includes("砕岩打ち")
              ? "砕岩打ち"
            : event.source === "crushStrike" ? "砕岩打ち"
              : event.source === "normal" ? "normal" : "other";
    return {
      category,
      actionName: action.actionNames.join("+") || "通常攻撃",
      sourceName: action.monsterName,
      damage: Number(event.damage || 0),
      defended: action.defended,
      lethal: action.lethal === true,
      roundIndex: action.roundIndex,
      pressureMechanisms,
      pressureSources
    };
  }));
  const statusDamageObservations = rounds.flatMap((round, roundIndex) =>
    (round.statusDamageEvents || []).map(event =>
      observeRoundEndStatusDamage(event, trialPressures, [...pressureStatusSources], roundIndex)
    )
  );
  const allDamageObservations = [...damageObservations, ...statusDamageObservations];
  const guardianPressureDamageObservations = allDamageObservations
    .filter(event => event.pressureMechanisms.length > 0);
  const guardianPressureDamageByMechanism = Object.fromEntries([
    "pressureTraitAction", "summonedAlly", "pressureStatusAction", "roundEndStatusDamage"
  ].map(mechanism => {
    const events = guardianPressureDamageObservations.filter(event => event.pressureMechanisms.includes(mechanism));
    return [mechanism, {
      hitCount: events.length,
      totalDamage: events.reduce((sum, event) => sum + event.damage, 0),
      lethal: events.some(event => event.lethal)
    }];
  }));
  const guardianPressureDamageBySource = Object.fromEntries([...new Set(
    guardianPressureDamageObservations.flatMap(event => event.pressureSources)
  )].sort().map(source => {
    const events = guardianPressureDamageObservations.filter(event => event.pressureSources.includes(source));
    return [source, {
      hitCount: events.length,
      totalDamage: events.reduce((sum, event) => sum + event.damage, 0),
      lethal: events.some(event => event.lethal)
    }];
  }));
  const deathLog = rounds.flatMap(round => round.log || [])
    .find(message => /倒れた|力尽きた/.test(String(message)));
  const deathSource = deathLog?.match(/で(.+?)により倒れた/)?.[1] || null;
  const lethalAction = allEnemyActions.find(action => action.lethal) || null;
  const lethalStatusDamage = statusDamageObservations.find(event => event.lethal) || null;
  const lethalActionName = lethalAction?.actionNames?.join("+") || null;
  let warningBeforeDeath = null;
  let warningBeforeDeathMessages = null;
  let matchingWarningBeforeDeath = null;
  let matchingWarningRoundsBeforeDeath = null;
  if (fixture.floor !== 30) {
    const deathRoundIndex = lethalAction?.roundIndex ?? lethalStatusDamage?.roundIndex ?? null;
    const warningsBeforeDeath = deathRoundIndex === null ? [] : rounds.slice(0, deathRoundIndex).flatMap((round, roundIndex) =>
      (round.log || [])
        .filter(message => String(message).includes("[警告]"))
        .map(message => ({ message, roundsBeforeDeath: deathRoundIndex - roundIndex }))
    );
    const warningKeyword = lethalActionName === "TILTOWAIT" ? "ティルトウェイト"
      : lethalActionName === "MADALTO" ? "マダルト"
        : lethalActionName === "炎の息" ? "炎の息"
          : lethalActionName === "仲間を呼ぶ" ? "召喚" : null;
    const matchingWarningsBeforeDeath = warningKeyword
      ? warningsBeforeDeath.filter(warning => String(warning.message).includes(warningKeyword))
      : [];
    warningBeforeDeath = warningsBeforeDeath.length > 0;
    warningBeforeDeathMessages = warningsBeforeDeath.map(warning => warning.message);
    matchingWarningBeforeDeath = matchingWarningsBeforeDeath.length > 0;
    matchingWarningRoundsBeforeDeath = matchingWarningsBeforeDeath.map(warning => warning.roundsBeforeDeath);
  }
  const warningCount = fixture.floor === 30 ? null : countLogs(logs, /\[警告\]/);
  const telegraphCount = fixture.floor === 30 ? null : countLogs(logs, /\[警告\]|予兆/);
  const queuedSpecialCorrespondence = rounds.flatMap((round, roundIndex) => {
    const queued = round.measurementQueuedSpecials || [];
    if (!queued.length) return [];
    const resolved = allEnemyActions
      .filter(action => action.roundIndex === roundIndex)
      .flatMap(action => action.actionNames.map(name =>
        name === "炎の息" ? "breath" : ["MADALTO", "TILTOWAIT"].includes(name) ? name : null
      ).filter(Boolean));
    return queued.map(special => ({
        special,
        guarded: round.action === "defend",
        resolved: resolved.includes(special),
        round: round.round
      }));
  });
  const perActionDamage = Object.fromEntries(B30_ACTION_CATEGORIES.map(category => {
    const events = allDamageObservations.filter(event => event.category === category);
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
  const crushStrikeActions = enemyActions
    .map(action => action.measurementCrushStrike)
    .filter(Boolean)
    .map(event => ({
      ...event,
      responseAction: rounds.find(round => round.round === event.round)?.action || null
    }));
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
    lethalAction: lethalActionName || (lethalAction ? "guardian-pressure" : lethalStatusDamage ? `round-end-status:${lethalStatusDamage.actionName}` : null),
    warningBeforeDeath,
    warningBeforeDeathMessages,
    matchingWarningBeforeDeath,
    matchingWarningRoundsBeforeDeath,
    warningCount,
    telegraphCount,
    queuedSpecialCorrespondence,
    rounds: rounds.length,
    damageTaken: result.combatDamageHp || 0,
    normalActionCount: actionNames.filter(action => action === "通常攻撃").length,
    crushStrike: {
      queued: crushStrikeActions.filter(event => event.phase === "queued").length,
      resolved: crushStrikeActions.filter(event => event.phase === "resolved").length,
      guarded: crushStrikeActions.filter(event => event.phase === "resolved" && event.guarded).length,
      unguarded: crushStrikeActions.filter(event => event.phase === "resolved" && !event.guarded).length,
      cooldownTurns: crushStrikeActions.filter(event => event.phase === "cooldown").length,
      events: crushStrikeActions
    },
    recoveryActivations: actionNames.filter(action => action === "Guard recovery").length,
    survival: Number(result.fixedCombatResult === "victory"),
    bossActionCount: enemyActions.length,
    actionNames: countBy(actionNames),
    damageObservations: allDamageObservations,
    guardianPressureDamage: {
      hitCount: guardianPressureDamageObservations.length,
      totalDamage: guardianPressureDamageObservations.reduce((sum, event) => sum + event.damage, 0),
      lethal: guardianPressureDamageObservations.some(event => event.lethal),
      byMechanism: guardianPressureDamageByMechanism,
      bySource: guardianPressureDamageBySource
    },
    damageByAction: perActionDamage,
    specialDamageByDefense: Object.fromEntries(["breath", "MADALTO", "TILTOWAIT"].map(category => {
      const events = damageObservations.filter(event => event.category === category);
      const defended = events.filter(event => event.defended).map(event => event.damage);
      const undefended = events.filter(event => !event.defended).map(event => event.damage);
      return [category, {
        defendedDamages: defended,
        undefendedDamages: undefended,
        defendedTotal: defended.reduce((sum, damage) => sum + damage, 0),
        undefendedTotal: undefended.reduce((sum, damage) => sum + damage, 0)
      }];
    })),
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
    endBossHp,
    endBossMaxHp,
    bossAtk: bossInitialState?.atk ?? null,
    bossDef: bossInitialState?.def ?? inventory.productionScaledStats.def,
    endBossHpRate,
    executedFightRounds: rounds.filter(round => round.action === "fight" && round.playerActionExecuted === true).length,
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
  const specialDamageByDefense = summarizeSpecialDamageByDefense(rows.flatMap(row => row.damageObservations));
  Object.keys(specialDamageByDefense).forEach(category => {
    specialDamageByDefense[category].defendedDamagePerRun = summarize(
      rows.map(row => row.specialDamageByDefense[category].defendedTotal)
    );
    specialDamageByDefense[category].undefendedDamagePerRun = summarize(
      rows.map(row => row.specialDamageByDefense[category].undefendedTotal)
    );
  });
  const guardianPressureDamage = {
    hitCount: summarize(rows.map(row => row.guardianPressureDamage.hitCount)),
    observedHitCount: rows.reduce((sum, row) => sum + row.guardianPressureDamage.hitCount, 0),
    totalDamage: rows.reduce((sum, row) => sum + row.guardianPressureDamage.totalDamage, 0),
    totalDamagePerRun: summarize(rows.map(row => row.guardianPressureDamage.totalDamage)),
    lethalRuns: rows.filter(row => row.guardianPressureDamage.lethal).length,
    byMechanism: Object.fromEntries([
      "pressureTraitAction", "summonedAlly", "pressureStatusAction", "roundEndStatusDamage"
    ].map(mechanism => [mechanism, {
      hitCount: summarize(rows.map(row => row.guardianPressureDamage.byMechanism[mechanism].hitCount)),
      observedHitCount: rows.reduce((sum, row) => sum + row.guardianPressureDamage.byMechanism[mechanism].hitCount, 0),
      totalDamage: rows.reduce((sum, row) => sum + row.guardianPressureDamage.byMechanism[mechanism].totalDamage, 0),
      totalDamagePerRun: summarize(rows.map(row => row.guardianPressureDamage.byMechanism[mechanism].totalDamage)),
      lethalRuns: rows.filter(row => row.guardianPressureDamage.byMechanism[mechanism].lethal).length
    }])),
    bySource: Object.fromEntries([...new Set(rows.flatMap(row => Object.keys(row.guardianPressureDamage.bySource)))].sort().map(source => [source, {
      hitCount: summarize(rows.map(row => row.guardianPressureDamage.bySource[source]?.hitCount || 0)),
      observedHitCount: rows.reduce((sum, row) => sum + (row.guardianPressureDamage.bySource[source]?.hitCount || 0), 0),
      totalDamage: rows.reduce((sum, row) => sum + (row.guardianPressureDamage.bySource[source]?.totalDamage || 0), 0),
      totalDamagePerRun: summarize(rows.map(row => row.guardianPressureDamage.bySource[source]?.totalDamage || 0)),
      lethalRuns: rows.filter(row => row.guardianPressureDamage.bySource[source]?.lethal).length
    }]))
  };
  return {
    floor: fixture.floor,
    bossName: fixture.bossName,
    encounterTypes: [...new Set(rows.map(row => row.encounterType))],
    runs: rows.length,
    outcomes: countBy(rows.map(row => row.outcome)),
    deathSources: countBy(rows.map(row => row.deathSource).filter(Boolean)),
    deaths: rows.filter(row => row.outcome === "death").length,
    lethalActions: countBy(rows.map(row => row.lethalAction).filter(Boolean)),
    warningBeforeDeathRuns: fixture.floor === 30 ? null : rows.filter(row => row.outcome === "death" && row.warningBeforeDeath).length,
    deathsWithoutPriorWarning: fixture.floor === 30 ? null : rows.filter(row => row.outcome === "death" && !row.warningBeforeDeath).length,
    deathsWithMatchingWarning: fixture.floor === 30 ? null : rows.filter(row => row.outcome === "death" && row.matchingWarningBeforeDeath).length,
    deathsWithoutMatchingWarning: fixture.floor === 30 ? null : rows.filter(row => row.outcome === "death" && !row.matchingWarningBeforeDeath).length,
    matchingWarningRoundsBeforeDeath: fixture.floor === 30 ? null : summarize(rows.flatMap(row => row.matchingWarningRoundsBeforeDeath)),
    queuedSpecialCorrespondence: Object.fromEntries(["breath", "MADALTO", "TILTOWAIT"].map(special => {
      const observations = rows.flatMap(row => row.queuedSpecialCorrespondence).filter(item => item.special === special);
      return [special, {
        queuedTurns: observations.length,
        guardedTurns: observations.filter(item => item.guarded).length,
        addedGuardTurns: observations.filter(item => item.guarded && item.round % 2 !== 0).length,
        resolvedTurns: observations.filter(item => item.resolved).length,
        guardedAndResolvedTurns: observations.filter(item => item.guarded && item.resolved).length,
        guardedButUnresolvedTurns: observations.filter(item => item.guarded && !item.resolved).length
      }];
    })),
    guardianPressureDamage,
    damageByAction: Object.fromEntries(B30_ACTION_CATEGORIES.map(category => [category, {
      hitCount: summarize(rows.map(row => row.damageByAction[category].hitCount)),
      totalDamagePerRun: summarize(rows.map(row => row.damageByAction[category].totalDamage)),
      defendedDamagePerRun: summarize(rows.map(row => row.damageByAction[category].defendedDamage)),
      undefendedDamagePerRun: summarize(rows.map(row => row.damageByAction[category].undefendedDamage)),
      lethalRuns: rows.filter(row => row.damageByAction[category].lethal).length
    }])),
    specialDamageByDefense,
    rounds: summarize(rows.map(row => row.rounds)),
    damageTaken: summarize(rows.map(row => row.damageTaken)),
    endBossHp: summarize(rows.map(row => row.endBossHp)),
    endBossMaxHp: summarize(rows.map(row => row.endBossMaxHp)),
    bossAtk: summarize(rows.map(row => row.bossAtk)),
    bossDef: summarize(rows.map(row => row.bossDef)),
    endBossHpRate: summarize(rows.map(row => row.endBossHpRate)),
    deathEndBossHp: summarize(rows.filter(row => row.outcome === "death").map(row => row.endBossHp)),
    deathEndBossHpRate: summarize(rows.filter(row => row.outcome === "death").map(row => row.endBossHpRate)),
    executedFightRounds: summarize(rows.map(row => row.executedFightRounds)),
    normalActionCount: summarize(rows.map(row => row.normalActionCount)),
    crushStrike: {
      queued: rows.reduce((sum, row) => sum + row.crushStrike.queued, 0),
      resolved: rows.reduce((sum, row) => sum + row.crushStrike.resolved, 0),
      guarded: rows.reduce((sum, row) => sum + row.crushStrike.guarded, 0),
      unguarded: rows.reduce((sum, row) => sum + row.crushStrike.unguarded, 0),
      cooldownTurns: rows.reduce((sum, row) => sum + row.crushStrike.cooldownTurns, 0),
      events: rows.flatMap(row => row.crushStrike.events)
    },
    normalLethalRuns: rows.filter(row => row.lethalAction === "通常攻撃").length,
    recoveryActivations: summarize(rows.map(row => row.recoveryActivations)),
    survivalRate: rows.reduce((sum, row) => sum + row.survival, 0) / rows.length,
    warningCount: fixture.floor === 30 ? null : summarize(rows.map(row => row.warningCount)),
    telegraphCount: fixture.floor === 30 ? null : summarize(rows.map(row => row.telegraphCount)),
    bossActionCount: summarize(rows.map(row => row.bossActionCount)),
    actionNames: Object.fromEntries(actionNames.map(name => [
      name,
      summarize(rows.map(row => row.actionNames[name] || 0))
    ])),
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

export function runBossArm({
  fixture,
  runs,
  seed,
  actionPlan,
  b30GuardRecoveryCandidate = false,
  b30HpScalingRemoved = false,
  b30AtkScalingRemoved = false,
  crushStrikeResponse = null
}) {
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
      scenario: createScenario(fixture, actionPlan, {
        b30GuardRecoveryCandidate,
        b30HpScalingRemoved,
        b30AtkScalingRemoved,
        crushStrikeResponse
      }),
      workshop: { ranks: {} },
      worldSeed: resolveWorldSeed({ seed, floor: fixture.floor, runIndex }),
      collectDiagnostics: true,
      collectCombatFormula: true
    });
    rows.push(observeRun(result, fixture));
  }
  return { rows, summary: summarizeRows(rows, fixture) };
}

function pairedComparison(baseline, candidate) {
  const delta = key => summarize(candidate.rows.map((row, index) => row[key] - baseline.rows[index][key]));
  const pairedOutcomes = countBy(candidate.rows.map((row, index) => `${baseline.rows[index].outcome}->${row.outcome}`));
  const actionDamageDelta = Object.fromEntries(["normal", "breath", "MADALTO", "TILTOWAIT", "砕岩打ち"].map(special => {
    const values = key => candidate.rows.map((row, index) => {
      const before = baseline.rows[index].damageByAction[special][key];
      const after = row.damageByAction[special][key];
      return after - before;
    });
    return [special, {
      hitCountPerRun: summarize(values("hitCount")),
      defendedDamagePerRun: summarize(candidate.rows.map((row, index) =>
        row.damageByAction[special].defendedDamage - baseline.rows[index].damageByAction[special].defendedDamage
      )),
      undefendedDamagePerRun: summarize(candidate.rows.map((row, index) =>
        row.damageByAction[special].undefendedDamage - baseline.rows[index].damageByAction[special].undefendedDamage
      ))
    }];
  }));
  return {
    pairing: "same worldSeed per runIndex; baseline and candidate independently execute production combat",
    pairedOutcomes,
    survivalRateDelta: delta("survival"),
    deathCountDelta: candidate.summary.deaths - baseline.summary.deaths,
    roundsDelta: delta("rounds"),
    endBossHpDelta: delta("endBossHp"),
    endBossHpRateDelta: delta("endBossHpRate"),
    executedFightRoundsDelta: delta("executedFightRounds"),
    damageTakenDelta: delta("damageTaken"),
    normalActionCountDelta: delta("normalActionCount"),
    normalLethalRunsDelta: candidate.summary.normalLethalRuns - baseline.summary.normalLethalRuns,
    recoveryActivationsDelta: delta("recoveryActivations"),
    lethalActions: {
      baseline: baseline.summary.lethalActions,
      candidate: candidate.summary.lethalActions
    },
    damageByActionDelta: actionDamageDelta,
    guardianPressureDamageDelta: summarize(candidate.rows.map((row, index) =>
      row.guardianPressureDamage.totalDamage - baseline.rows[index].guardianPressureDamage.totalDamage
    )),
    guardianPressureLethalRuns: {
      baseline: baseline.summary.guardianPressureDamage.lethalRuns,
      candidate: candidate.summary.guardianPressureDamage.lethalRuns
    }
  };
}

function runBossCell({ fixture, runs, seed, dedicatedB30AtkPressure = false }) {
  if (fixture.floor === 10) {
    const unread = runBossArm({ fixture, runs, seed, crushStrikeResponse: "unread" });
    const read = runBossArm({ fixture, runs, seed, crushStrikeResponse: "read" });
    return {
      ...unread.summary,
      arms: { unread: unread.summary, read: read.summary },
      pairedComparison: pairedComparison(unread, read)
    };
  }
  const baseline = runBossArm({
    fixture,
    runs,
    seed,
    actionPlan: "tiltowait-queued-guard",
    b30GuardRecoveryCandidate: fixture.floor === 30,
    b30HpScalingRemoved: fixture.floor === 30 && dedicatedB30AtkPressure,
  });
  const candidate = fixture.floor === 30
    ? runBossArm({
      fixture,
      runs,
      seed,
      actionPlan: "tiltowait-queued-guard",
      b30GuardRecoveryCandidate: true,
      b30HpScalingRemoved: true,
      b30AtkScalingRemoved: dedicatedB30AtkPressure,
    })
    : null;
  return {
    ...baseline.summary,
    arms: { baseline: baseline.summary, candidate: candidate?.summary || null },
    pairedComparison: candidate ? pairedComparison(baseline, candidate) : null
  };
}

export async function runMilestoneBossDiagnostic({
  runs = DEFAULT_RUNS,
  seed = DEFAULT_SEED,
  floor = null,
  profile = "default",
  allowSmallRunCount = false
} = {}) {
  const normalizedRuns = positiveInteger(runs, "runs", allowSmallRunCount ? 1 : MIN_CONFIDENT_RUNS);
  const normalizedSeed = positiveInteger(seed, "seed");
  if (profile !== "default") {
    throw new Error(`unsupported milestone boss profile: ${profile}`);
  }
  const fixtures = floor === null ? BOSS_FIXTURES : BOSS_FIXTURES.filter(fixture => fixture.floor === positiveInteger(floor, "floor"));
  if (!fixtures.length) throw new Error(`unsupported milestone boss floor: ${floor}`);
  return {
    schemaVersion: SCHEMA_VERSION,
    runnerVersion: RUNNER_VERSION,
    measurementId: floor === 30 ? "b30-atk-pressure-diagnostic" : "milestone-boss-diagnostic",
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
        "total damage taken and damage by action",
        ...(fixtures.some(fixture => fixture.floor === 30) ? ["ending boss HP / rate, death ending boss HP / rate, executed Fight rounds; paired arm deltas"] : []),
        "survival",
        "boss action count / normal action count / lethal action / recovery activations",
        ...(fixtures.some(fixture => fixture.floor !== 30) ? ["warning / telegraph count"] : []),
        ...(fixtures.some(fixture => fixture.floor === 30) ? ["queued-special Guard resolution correspondence"] : []),
        ...(fixtures.some(fixture => fixture.floor === 10) ? ["B10砕岩打ち queue/resolve/Guard/debuff/fixed-cycle correspondence"] : []),
        "spell / status / special action count",
        "Guard mitigation observation",
        "production boss-specific mechanic activation"
      ],
      omitted: [
        "production mutation",
        "boss tuning or new mechanic",
        ...(fixtures.length === 1 && fixtures[0].floor === 30 ? ["production warning-text analysis"] : []),
        "loot, UI, save, map traversal",
        "full build Cartesian product",
        "Heavy run; merge後 Actions N=200 is the bounded diagnostic"
      ]
    },
    cells: fixtures.map(fixture => runBossCell({
      fixture,
      runs: normalizedRuns,
      seed: normalizedSeed,
      dedicatedB30AtkPressure: floor === 30
    }))
  };
}

function buildReport(result, provenance, options) {
  const dedicatedB30AtkPressure = result.measurementId === "b30-atk-pressure-diagnostic";
  const environmentHash = printEnvSignatureBanner({
    runnerVersion: RUNNER_VERSION,
    schemaVersion: SCHEMA_VERSION,
    measurementId: result.measurementId,
    seed: result.configuration.seed,
    runs: result.configuration.runs,
    depths: result.configuration.depths
  }, { label: result.measurementId === "b30-atk-pressure-diagnostic"
      ? "issue1664 B30 generic ATK scaling diagnostic env"
    : "issue1613 milestone boss diagnostic env" });
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
    diagnosticMechanic: result.configuration.depths.includes(10)
      ? {
          id: "crush-strike",
          displayName: "砕岩打ち",
          enabledOnlyByMeasurementOptIn: true,
          productionDefault: "no-op",
          b10StoneGuardOnly: true,
          pairedSeedPolicy: "same worldSeed; both arms enable the mechanic; read response is the only policy difference",
          arms: ["unread", "read"]
        }
      : null,
    candidatePolicy: {
      scaling: "Phase 2a: HP 1 + 0.20 × Tier; ATK 1 + 0.10 × Tier; DEF 1.0",
      player: "measurement-only Phase 1 freeze candidate: vanguard=sword/mediumArmor/smallShield; declared Guard; capped half-step Load",
      actions: result.configuration.depths.includes(10)
        ? "B10 unread and read arms share the existing action policy; only queued-target Guard response differs"
        : dedicatedB30AtkPressure
        ? "B30 baseline and candidate share the recovery opening + opening Fight policy from #1653; candidate removes only generic Tier ATK scaling"
        : "B30 baseline and candidate share the recovery opening + opening Fight policy from #1653; candidate removes only generic Tier HP scaling",
      reflectPhysical: "freeze reference 0.20; no milestone boss template declares reflectPhysical, so no synthetic reflection is applied",
      behavior: "production boss template, production isBoss combat path, production boss action / warning / status / Guard resolution",
      status: result.configuration.depths.includes(10)
        ? "B10 read and unread compare responses to the production Stone Guard rule; only queued-target Guard behavior differs"
        : dedicatedB30AtkPressure
        ? "diagnostic-only; both B30 arms apply the same 0.5 HP multiplier after Phase 2a measurement scaling; candidate also applies a 2/3 ATK multiplier; production monster data and production scaling remain unchanged"
        : "diagnostic-only; only the B30 candidate applies a 0.5 HP multiplier after Phase 2a measurement scaling; production monster data and production scaling remain unchanged"
    }
  };
}

function format(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "-";
}

export function buildSummary(report) {
  const dedicatedB30AtkPressure = report.measurementId === "b30-atk-pressure-diagnostic";
  const b10Only = report.configuration.depths.length === 1 && report.configuration.depths[0] === 10;
  const lines = [
    dedicatedB30AtkPressure
      ? "# B30 generic ATK scaling diagnostic (#1664)"
      : b10Only
        ? "# B10 砕岩打ち opening diagnostic (#1674)"
      : report.configuration.depths.length === 1 && report.configuration.depths[0] === 30
      ? "# B30 generic Tier HP scaling diagnostic (#1662)"
      : "# milestone Boss decision-pressure diagnostic (#1613)",
    "",
    `- runner: ${report.runnerVersion}; schema: ${report.schemaVersion}; source SHA: ${report.measurement.sourceCommit || "not recorded"}`,
    `- N=${report.configuration.runs}; seed=${report.configuration.seed}; depths=B${report.configuration.depths.join(", B")}`,
    `- player fixture: ${report.configuration.playerFixture.id}; ${report.configuration.playerFixture.weapon}/${report.configuration.playerFixture.armor}/${report.configuration.playerFixture.shield}; Guard=${report.configuration.playerFixture.guardTiming}; Load=${report.configuration.playerFixture.loadCandidateId}`,
    "- scaling: HP 1 + 0.20 × Tier; ATK 1 + 0.10 × Tier; DEF 1.0",
    "- fixed boss encounter: production boss path with `isBoss=true`; diagnostic candidate enabled only by explicit B10 measurement opt-in",
    b10Only
      ? "- B10 unread/read arms share the frozen Phase 1 fixture, Phase 2a scaling, and existing policy; only response to the queued target differs."
      : dedicatedB30AtkPressure
      ? "- B30 baseline and candidate share recovery opening + opening Fight; both use HP 640, while candidate changes only ATK scaling (39→26)."
      : "- B30 baseline and candidate share recovery opening + opening Fight; baseline HP=1280 / ATK=39, candidate HP=640 / ATK=39.",
    ""
  ];
  const b10Cell = report.cells.find(cell => cell.floor === 10);
  if (b10Cell) {
    lines.push(
      `- B10 paired 砕岩打ち: same seed=${report.configuration.seed}; both arms enabled; unread=${JSON.stringify(b10Cell.arms.unread.crushStrike)}; read=${JSON.stringify(b10Cell.arms.read.crushStrike)}; paired=${JSON.stringify(b10Cell.pairedComparison)}`
    );
  }
  for (const cell of report.cells) {
    lines.push(
      `- B${cell.floor} ${cell.bossName} ${cell.floor === 10 ? "unread" : "baseline"}: outcome=${JSON.stringify(cell.outcomes)}; ` +
      `rounds=${format(cell.rounds.average)}; damage=${format(cell.damageTaken.average)}; ` +
      `actions=${format(cell.bossActionCount.average)}; normal=${format(cell.normalActionCount.average)}; normal lethal=${cell.normalLethalRuns}; recovery=${format(cell.recoveryActivations.average)}; ` +
      (cell.warningCount ? `warnings=${format(cell.warningCount.average)}; warning before death=${cell.warningBeforeDeathRuns}/${cell.deaths}; matching warning=${cell.deathsWithMatchingWarning}/${cell.deaths}; ` : "") +
      `spells=${format(cell.spellActionCount.average)}; status=${format(cell.statusActionCount.average)}; ` +
      `trial=${cell.trialBands.map(trial => `${trial.mainId}/${trial.subId}`).join(",")}; ` +
      `pressures=${cell.guardianPressures.map(pressure => `${pressure.role}:${pressure.sourceName}`).join(",")}; ` +
      `pressureDetails=${JSON.stringify(cell.guardianPressures.map(({ role, sourceName, additionalTraits, additionalBehavior }) => ({ role, sourceName, additionalTraits, additionalBehavior })))}; ` +
      `non-raw pressure runs=${cell.nonRawDecisionPressureObservedRuns}/${cell.runs}; ` +
      `deaths=${JSON.stringify(cell.deathSources)}; lethal actions=${JSON.stringify(cell.lethalActions)}; ` +
      `damage by action=${JSON.stringify(Object.fromEntries(Object.entries(cell.damageByAction).map(([action, values]) => [action, { totalDamagePerRun: values.totalDamagePerRun.average, defended: values.defendedDamagePerRun.average, undefended: values.undefendedDamagePerRun.average }])))}; ` +
      `special defended/undefended=${JSON.stringify(cell.specialDamageByDefense)}; ` +
      `guardian-pressure overlay=${JSON.stringify(cell.guardianPressureDamage)}; ` +
      (cell.arms.baseline && cell.arms.candidate ? `baseline boss remaining=${JSON.stringify({ hp: cell.arms.baseline.endBossHp, maxHp: cell.arms.baseline.endBossMaxHp, atk: cell.arms.baseline.bossAtk, rate: cell.arms.baseline.endBossHpRate, deathHp: cell.arms.baseline.deathEndBossHp, deathRate: cell.arms.baseline.deathEndBossHpRate, executedFightRounds: cell.arms.baseline.executedFightRounds })}; candidate=${JSON.stringify({ outcomes: cell.arms.candidate.outcomes, survivalRate: cell.arms.candidate.survivalRate, deaths: cell.arms.candidate.deaths, lethalActions: cell.arms.candidate.lethalActions, normalActionCount: cell.arms.candidate.normalActionCount, normalLethalRuns: cell.arms.candidate.normalLethalRuns, recoveryActivations: cell.arms.candidate.recoveryActivations, rounds: cell.arms.candidate.rounds, damageTaken: cell.arms.candidate.damageTaken, endBossHp: cell.arms.candidate.endBossHp, endBossMaxHp: cell.arms.candidate.endBossMaxHp, bossAtk: cell.arms.candidate.bossAtk, endBossHpRate: cell.arms.candidate.endBossHpRate, deathEndBossHp: cell.arms.candidate.deathEndBossHp, deathEndBossHpRate: cell.arms.candidate.deathEndBossHpRate, executedFightRounds: cell.arms.candidate.executedFightRounds, guard: cell.arms.candidate.guard, damageByAction: cell.arms.candidate.damageByAction, queuedSpecialCorrespondence: cell.arms.candidate.queuedSpecialCorrespondence, specialDamageByDefense: cell.arms.candidate.specialDamageByDefense, guardianPressureDamage: cell.arms.candidate.guardianPressureDamage })}; paired delta=${JSON.stringify(cell.pairedComparison)}; ` : "") +
      `confidence=${cell.confidence}`
    );
  }
  lines.push(
    "",
    "## Inventory and gate",
    "",
    "- Inventory source: production biome boss mapping, monster templates, boss rules, boss actions, round status/spell/Guard path.",
    "- B5: production LAHALITO telegraph / guard-break / four-turn exposure; activation is measured from production logs.",
    "- B10 production: guardAdjacent remains inventory-only in a fixed single-boss encounter; adjacent-Guard redirect is not exercised.",
    "- B10 砕岩打ち: production Stone Guard rule. The first normal action has no telegraph; the next normal action queues the strike, which resolves on the next boss turn against the queued living target. After resolution, one normal turn passes before retelegraph. An invalid/dead target clears the queue and falls through to the ordinary action.",
    "- B10 read Guards the queued target only; unread has no crush-strike response. Both arms use identical Phase 1 fixture, Phase 2a scaling, stats, trial pressure, equipment, Load, and underlying action policy.",
    "- Guard uses existing physical Guard mitigation and applies no tempDefDown. Unguarded resolution applies +2 tempDefDown, capped at 6.",
    "- B15: `isPoisonous=true` keeps the legacy poison fallback active on the production Boss path; template-defined `poison_payoff` is inactive there. Runtime status observation uses existing `statusSources`.",
    "- B20/B25: production MADALTO path and Guard mitigation are observed when the fixed action schedule reaches them.",
    "- B30 candidate Guards only for existing `tiltowaitQueued === true`; only a fully Guarded TILTOWAIT resolution queues one recovery replacement for the next plain-normal slot. Breath/MADALTO and warning text do not activate it.",
    "- Queue→Guard→special correspondence uses the queued state captured at player action selection and the existing same-round enemy action record.",
    "- B30 deaths are attributed from the production terminal death log and lethal enemy action event; action damage uses existing round diagnostics.",
    "- Guardian-pressure damage is a separate overlay: added trait/behavior actions, summoned allies, pressure-linked status actions, and matching round-end status ticks; overlay can overlap action categories.",
    "- Defended means the Phase 1 player selected Guard in that production combat round.",
    "- Reported per-run damage separates normal, breath, MADALTO, TILTOWAIT, guardian-pressure, round-end status, and uncategorized evidence.",
    "- N<30 is correctness-only; merge後 GitHub Actions N=200 is the gate evidence.",
    "",
    "## Scope and limits",
    "",
    "- Production `runEncounter` / `runCombatRoundCalculation` path is used.",
    "- Production default remains no-op. No production monster data/scaling, B10 stats, Phase 1 / Phase 2a, trial pressure, equipment, Load, other Boss, loot, UI, or save change. Only explicit B10 measurement opt-in activates the diagnostic candidate.",
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
  const allowSmallRunCount = options["allow-small-run-count"] === "true";
  const runs = positiveInteger(options.runs || DEFAULT_RUNS, "runs", allowSmallRunCount ? 1 : MIN_CONFIDENT_RUNS);
  const seed = positiveInteger(options.seed || DEFAULT_SEED, "seed");
  if (!options.output || !options.summary) throw new Error("--output and --summary are required");
  const provenance = requireRunnerProvenance({
    fetchOriginMain: false,
    measurementRunnerPaths: [...DIAGNOSTIC_PATHS]
  });
  const floor = options.floor ? positiveInteger(options.floor, "floor") : null;
  const result = await runMilestoneBossDiagnostic({ runs, seed, floor, profile: options.profile || "default", allowSmallRunCount });
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
