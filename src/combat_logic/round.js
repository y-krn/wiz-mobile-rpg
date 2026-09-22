import {
  MONSTERS,
  MONSTER_STATUS_ATTACK_PATTERNS,

  getPhysicalHitChance, getMonsterEvasionChance, PHYSICAL_HIT_CHANCE_MIN,
  getCharWeaponAtk, getCharDef,
  rollCharWeaponPhysicalRandom,
  PHYSICAL_DEF_RESISTANCE_SCALE_INCOMING,
  getCharAffixSum, getCharMaxHp, getCharMaxMp, getCharTrapEaterBonus,
  calculatePhysicalAttackRawFormula, combinePhysicalResistances,
  resolveWeaponAttack,
  calculatePhysicalDefenseFormula, applyPhysicalResistance,
  getPhysicalDefenseResistance
} from "../data.js";
import {
  canMeleeTargetEnemy,
  findMeleeFallbackTarget,
  findAdjacentGuard,
  getLivingTargetCandidates,
  pickTarget
} from "./targeting.js";
import {
  getMeleeModifiers,
  getEffectiveDef,
  getEffectiveAtk,
  applyTargetedDamageBonus,
  reduceIncomingDamage,
  applyPartyDamage,
  recordReceivedDamage,
  applyKillAffixEffects,
  tryApplyHitFlinch,
  tryThornCounter
} from "./damage.js";
import {
  addMonsterBuff,
  tickMonsterBuffs,
  wakeSleepingMonsterOnDamage,
  wakeSleepingCharOnDamage,
  consumeCharIncapacitation,
  getBuffTotal,
  tickCharBuffs,
  applyStatusEffect,
  hasStatusEffect,
  removeStatusEffect,
  clearBleedingStatus,
  tickStatusEffects,
  STATUS_EFFECT_IDS,
  BLEEDING_DURATION_TURNS,
  BLEEDING_PAYOFF_DAMAGE,
  getStatusEffectRemainingTurns
} from "./status_effects.js";
import {
  consumeVulnerableDamage,
  recordVulnerableExpiry,
  clearVulnerableOnDefeat
} from "./vulnerable.js";
import {
  hasTrait,
  processMonsterDefeat,
  getEliteAttackMultiplier
} from "./monster_traits.js";

import { applyCombatRewards } from "./rewards.js";
import {
  recordCharDeath,
  queueCharDeathLog,
  recordMonsterResistanceDiscovery,
  recordMonsterAction,
  recordMonsterCondition
} from "../state.js";
import { trackBleedingEvent } from "../telemetry.js";
import { COMBAT_LOG_PRESENTATION_KINDS } from "../combat_log_semantics.js";

import { resolveBossAction } from "./boss_actions.js";
import { resolvePlayerItem } from "./item_resolution.js";
import { resolvePlayerSpell } from "./spell_resolution.js";
import {
  getFollowUpChance,
  getStatusEffectChance,
  tryApplyExecutionerSetup
} from "../rules/affix_rules.js";

function resolveMeasurementWeaponCandidate(candidate) {
  if (!candidate) return null;
  const resolved = {
    id: String(candidate.id || "measurement-weapon"),
    multiplier: Number(candidate.multiplier),
    hitChance: Number(candidate.hitChance),
    highDefPenetration: Number(candidate.highDefPenetration)
  };
  if (!Number.isFinite(resolved.multiplier) || resolved.multiplier < 0 ||
      !Number.isFinite(resolved.hitChance) || resolved.hitChance < 0 || resolved.hitChance > 1 ||
      !Number.isFinite(resolved.highDefPenetration) ||
      resolved.highDefPenetration < 0 || resolved.highDefPenetration > 1) {
    throw new Error("invalid measurement weapon candidate");
  }
  return resolved;
}

function resolveMeasurementWeaponAttack({
  candidate,
  weaponAtk = 0,
  buffAtk = 0,
  randRoll = 0,
  def = 0,
  physResist = 0,
  meleeMod = 1,
  fixedDamageBonus = 0
} = {}) {
  if (!candidate) return null;
  const baseRaw = calculatePhysicalAttackRawFormula({
    weaponAtk,
    buffAtk,
    randRoll,
    meleeMod
  });
  const formulaRaw = baseRaw * candidate.multiplier + fixedDamageBonus;
  const effectiveDefense = Math.max(0, Number(def) * (1 - candidate.highDefPenetration));
  const defenseMultiplier = Math.max(0.20, 1 - effectiveDefense / 100);
  const defResistance = 1 - defenseMultiplier;
  const physicalResistance = combinePhysicalResistances(defResistance, physResist);
  const damage = Math.max(1, Math.floor(formulaRaw * (1 - physicalResistance)));
  return {
    behavior: {
      id: candidate.id,
      hitChanceBonus: 0,
      physicalDefenseScale: null,
      rawDamageMultiplier: candidate.multiplier
    },
    behaviorProfileId: candidate.id,
    baseRaw,
    formulaRaw,
    defResistance,
    physicalResistance,
    damage,
    measurementWeaponCandidate: candidate,
    measurementWeaponEffectiveDefense: effectiveDefense
  };
}
import { resolveGuardMitigation, resolveGuardStatusChance } from "../rules/guard_rules.js";
import { buildCombatTurnQueue } from "./turn_order.js";

function findMonsterTemplate(name) {
  return MONSTERS.find(m => m.name === name);
}

function recordBleedingEvent(state, event, target, metadata = {}, measurement = null) {
  const bleeding = measurement?.bleeding;
  if (bleeding) {
    bleeding[event] = (bleeding[event] || 0) + 1;
    if (metadata.damageContribution) {
      bleeding.damageContribution = (bleeding.damageContribution || 0) + metadata.damageContribution;
    }
    if (metadata.source) {
      bleeding.sources[metadata.source] = (bleeding.sources[metadata.source] || 0) + 1;
    }
    if (metadata.buildKey) {
      bleeding.builds[metadata.buildKey] = (bleeding.builds[metadata.buildKey] || 0) + 1;
    }
    if (event === "cleared" && metadata.reason) {
      bleeding.clearReasons ||= {};
      bleeding.clearReasons[metadata.reason] = (bleeding.clearReasons[metadata.reason] || 0) + 1;
    }
    if (target?.isBoss || state?.combatState?.isBoss) bleeding.bossEvents++;
    if (target?.isMidboss || state?.combatState?.isMidboss) bleeding.midbossEvents++;
  }
  trackBleedingEvent(event, {
    floor: state?.floor,
    character: state?.party?.[0],
    enemyId: target?.name,
    isBoss: Boolean(target?.isBoss || state?.combatState?.isBoss),
    isMidboss: Boolean(target?.isMidboss || state?.combatState?.isMidboss),
    remainingTurns: getStatusEffectRemainingTurns(target, STATUS_EFFECT_IDS.BLEEDING),
    payoffDamage: state?.bleedingPayoffDamage ?? BLEEDING_PAYOFF_DAMAGE,
    ...metadata
  });
}

function getBleedingPayoffDamage(state, target, directDamage) {
  const configured = Number(state?.bleedingPayoffDamage ?? BLEEDING_PAYOFF_DAMAGE);
  const payoff = Number.isFinite(configured) ? Math.max(0, Math.floor(configured)) : BLEEDING_PAYOFF_DAMAGE;
  return Math.min(payoff, Math.max(0, target.hp - directDamage));
}

function tryApplyBleeding(char, target, state, logQueue, rng = Math.random, measurement = null) {
  const chance = getCharAffixSum(char, "bleedingAtk") / 100;
  if (chance <= 0 || target.hp <= 0) return false;
  const alreadyBleeding = hasStatusEffect(target, STATUS_EFFECT_IDS.BLEEDING);
  if (rng() >= chance) {
    recordBleedingEvent(state, "failed", target, {
      reason: "trigger-roll",
      source: "bleedingAtk",
      buildKey: `bleedingAtk:${getCharAffixSum(char, "bleedingAtk")}`
    }, measurement);
    return false;
  }
  applyStatusEffect(target, STATUS_EFFECT_IDS.BLEEDING, {
    remainingTurns: BLEEDING_DURATION_TURNS,
    stacks: 1,
    source: "bleedingAtk"
  });
  const event = alreadyBleeding ? "refresh" : "applied";
  recordBleedingEvent(state, event, target, {
    source: "bleedingAtk",
    buildKey: `bleedingAtk:${getCharAffixSum(char, "bleedingAtk")}`
  }, measurement);
  logQueue.push({
    msg: alreadyBleeding
      ? `[味方] ${char.name}の裂傷が${target.name}の出血を更新した！（あと${BLEEDING_DURATION_TURNS}回）`
      : `[味方] [!] ${target.name}は出血した！（あと${BLEEDING_DURATION_TURNS}回、次の通常攻撃で追加ダメージ）`,
    presentationKind: COMBAT_LOG_PRESENTATION_KINDS.STATUS_GOOD,
    sound: "hit",
    bleeding: event
  });
  return true;
}

function clearBleedingOnDefeat(state, target, reason, measurement = null) {
  if (!clearBleedingStatus(target)) return;
  recordBleedingEvent(state, "cleared", target, { reason }, measurement);
}

function clearCombatVulnerableOnDefeat(state, target, reason, measurement = null) {
  clearVulnerableOnDefeat(state, target, reason, measurement);
}

function recordEnemyStatusPattern(state, event, monster, target, metadata = {}, measurement = null) {
  const telemetry = measurement?.enemyStatusGrammar;
  if (!telemetry) return;
  const floor = Math.max(1, Number(state.floor) || 1);
  const enemy = monster?.name || "unknown";
  const key = `B${floor}:${enemy}`;
  if (event.endsWith("ByEnemyFloor")) {
    telemetry[event][key] = (telemetry[event][key] || 0) + 1;
  } else {
    telemetry[event] = (telemetry[event] || 0) + 1;
  }
  if (metadata.damage) {
    telemetry.payoffDamage += metadata.damage;
    telemetry.payoffDamageByEnemy[enemy] = (telemetry.payoffDamageByEnemy[enemy] || 0) + metadata.damage;
  }
  if (metadata.latency !== undefined) {
    telemetry.payoffLatencyTotal += Math.max(0, Number(metadata.latency) || 0);
    telemetry.payoffLatencyCount++;
  }
  if (metadata.response) {
    telemetry.responses[metadata.response] = (telemetry.responses[metadata.response] || 0) + 1;
    const floorResponses = telemetry.responsesByFloor[String(floor)] ||= {};
    floorResponses[metadata.response] = (floorResponses[metadata.response] || 0) + 1;
  }
  if (monster?.isBoss || state.combatState?.isBoss) telemetry.bossEvents++;
  if (monster?.isMidboss || state.combatState?.isMidboss) telemetry.midbossEvents++;
  if (target?.name) {
    const targetKey = `${key}:${target.name}`;
    telemetry.targets[targetKey] = (telemetry.targets[targetKey] || 0) + 1;
  }
}

function clearQueuedStatusPattern(monster) {
  const queued = monster?.statusPayoffQueued;
  delete monster.statusPayoffQueued;
  return queued;
}

function isStatusCureAction(action, status) {
  if (!action) return false;
  const cureItems = status === STATUS_EFFECT_IDS.POISONED
    ? ["ANTIDOTE", "HOLY_WATER", "PANACEA", "ELIXIR"]
    : status === STATUS_EFFECT_IDS.BLIND
      ? ["EYE_DROPS", "PANACEA", "ELIXIR"]
      : [];
  const cureSpells = status === STATUS_EFFECT_IDS.POISONED
    ? ["LATUMOFIS"]
    : status === STATUS_EFFECT_IDS.BLIND
      ? ["DIURCO"]
      : [];
  return action.type === "item"
    ? cureItems.includes(action.itemKey)
    : action.type === "spell" && cureSpells.includes(action.spellName || action.spell);
}

function getCombatGuardedStatusChance(char, baseChance, combatSelection, actorIdx, telemetry = null) {
  const isDefending = combatSelection.actions.some(action =>
    action.actorIdx === actorIdx && action.type === "defend"
  );
  return resolveGuardStatusChance(char, baseChance, { isDefending, telemetry });
}

function resolveEnemyStatusPattern(monster, state, monsters, combatSelection, logQueue, roundNumber, rng = Math.random, measurement = null) {
  const pattern = MONSTER_STATUS_ATTACK_PATTERNS[monster.statusAttackPattern];
  const patternActive = pattern && !monster.isBoss && !monster.isMidboss &&
    !state.combatState?.isBoss && !state.combatState?.isMidboss;
  if (!patternActive) return null;

  if (monster.statusPatternPayoffConsumed) {
    const consumedTarget = state.party[monster.statusPatternPayoffConsumed.targetIdx];
    if (consumedTarget?.status === pattern.status) return null;
    delete monster.statusPatternPayoffConsumed;
  }

  const queued = monster.statusPayoffQueued;
  if (queued) {
    const target = state.party[queued.targetIdx];
    const targetSelect = target && target.hp > 0 && target.status !== "dead"
      ? { c: target, i: queued.targetIdx }
      : null;
    if (targetSelect && target.status === pattern.status) {
      recordEnemyStatusPattern(state, "payoffAttempts", monster, target, {}, measurement);
      return {
        payoff: {
          pattern,
          targetSelect,
          queued,
          defended: combatSelection.actions.some(action =>
            action.actorIdx === targetSelect.i && action.type === "defend"
          )
        }
      };
    }

    const response = combatSelection.actions.some(action =>
      action.actorIdx === queued.targetIdx && isStatusCureAction(action, pattern.status)
    ) ? "cureBeforePayoff" : "statusLostBeforePayoff";
    recordEnemyStatusPattern(state, response, monster, target, { response }, measurement);
    clearQueuedStatusPattern(monster);
    return null;
  }

  const candidates = getLivingTargetCandidates(state.party);
  if (candidates.length === 0) return { handled: true };
  const active = candidates.find(candidate => candidate.c.status === pattern.status);
  if (active) {
    recordEnemyStatusPattern(state, "payoffAttempts", monster, active.c, {}, measurement);
    return {
      payoff: {
        pattern,
        targetSelect: active,
        queued: { setupRound: roundNumber },
        defended: combatSelection.actions.some(action =>
          action.actorIdx === active.i && action.type === "defend"
        )
      }
    };
  }

  const targetSelect = candidates[Math.floor(rng() * candidates.length)];
  if (rng() >= pattern.setupChance) return null;
  recordEnemyStatusPattern(state, "attemptsByEnemyFloor", monster, targetSelect.c, {}, measurement);
  if (rng() >= getCombatGuardedStatusChance(
    targetSelect.c,
    getStatusEffectChance(targetSelect.c, 1, { telemetry: state.combatFormulaTelemetry }),
    combatSelection,
    targetSelect.i,
    state.combatFormulaTelemetry
  )) {
    recordEnemyStatusPattern(state, "resistedByEnemyFloor", monster, targetSelect.c, {}, measurement);
    logQueue.push({ msg: `[ 敵 ] ${targetSelect.c.name}は不屈の意志で${pattern.status === "poisoned" ? "毒" : "盲目"}を退けた！`, sound: "miss" });
    return { handled: true };
  }
  if (
    pattern.status === STATUS_EFFECT_IDS.POISONED &&
    getCharAffixSum(targetSelect.c, "poisonWard") > 0 &&
    rng() * 100 < getCharAffixSum(targetSelect.c, "poisonWard")
  ) {
    recordEnemyStatusPattern(state, "resistedByEnemyFloor", monster, targetSelect.c, {}, measurement);
    logQueue.push({ msg: `[ 敵 ] ${targetSelect.c.name}は防毒の備えで毒を退けた！`, sound: "miss" });
    return { handled: true };
  }

  applyStatusEffect(targetSelect.c, pattern.status, {
    source: `monster:${monster.name}`,
    remainingTurns: pattern.status === STATUS_EFFECT_IDS.SLEEP ? 2 : null
  });
  monster.statusPayoffQueued = {
    pattern: monster.statusAttackPattern,
    targetIdx: targetSelect.i,
    setupRound: roundNumber
  };
  recordEnemyStatusPattern(state, "successesByEnemyFloor", monster, targetSelect.c, {}, measurement);
  recordMonsterCondition(monster, `${pattern.status === "poisoned" ? "毒" : "盲目"}を受けた`, state, measurement);
  logQueue.push({
    msg: `[警告] ${monster.name}は${targetSelect.c.name}に${pattern.setupMessage}`,
    sound: "cast_spell"
  });
  return { handled: true };
}

function recordQueuedPatternDeaths(state, monsters, measurement = null) {
  monsters.forEach(monster => {
    if (monster.hp > 0 || !monster.statusPayoffQueued) return;
    clearQueuedStatusPattern(monster);
    recordEnemyStatusPattern(state, "killBeforePayoff", monster, null, { response: "killBeforePayoff" }, measurement);
  });
}

function recordQueuedPatternResponse(state, monsters, response, measurement = null) {
  monsters.forEach(monster => {
    if (!monster.statusPayoffQueued) return;
    clearQueuedStatusPattern(monster);
    recordEnemyStatusPattern(state, response, monster, null, { response }, measurement);
  });
}

function applyFleePartingAttack(state, monsters, logQueue, rng = Math.random, measurement = null) {
  const attacker = monsters.find(mon => mon.hp > 0);
  const target = state.party.find(char => char.status !== "dead");
  if (!attacker || !target) return false;

  const finalAtk = getEffectiveAtk(attacker) + Math.floor(rng() * 4);
  const finalDef = calculatePhysicalDefenseFormula({
    baseDef: getCharDef(target),
  });
  const formulaRaw = finalAtk;
  const defResistance = getPhysicalDefenseResistance(
    finalDef,
    PHYSICAL_DEF_RESISTANCE_SCALE_INCOMING
  );
  const formulaDmg = Math.max(1, Math.floor(applyPhysicalResistance(formulaRaw, defResistance)));
  let dmg = formulaDmg;
  const preMitigationDmg = dmg;
  const playerHpBefore = target.hp;
  dmg = resolveGuardMitigation(target, dmg, {
    attackType: "physical",
    telemetry: state.combatFormulaTelemetry
  });
  dmg = reduceIncomingDamage(target, dmg, { logQueue, state });
  state.combatFormulaTelemetry?.physicalMonsterHits.push({
    floor: state.floor,
    finalAtk, finalDef, defResistance, formulaRaw, formulaDmg,
    isDefending: false, isBlindTargetApplied: false, isSnipeAttack: false,
    preMitigationDmg, finalDmg: dmg, attackType: "flee"
  });
  target.hp = Math.max(0, target.hp - dmg);
  recordReceivedDamage(state, target, attacker.name, preMitigationDmg, dmg, playerHpBefore, {
    attackType: "flee",
    finalDef,
    defResistance,
    measurement
  });
  const recovered = wakeSleepingCharOnDamage(target);
  logQueue.push({
    msg: `[ 敵 ] ${attacker.name}の追撃！${target.name}は${dmg}のダメージを受けた。${recovered ? `${target.name}は状態異常から回復した！` : ""}`,
    fleePartingAttack: true,
    presentationKind: COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_TAKEN,
    sound: "hit",
    shake: 8,
    floatText: `${dmg}`,
    floatColor: "#ff3b30"
  });
  if (target.hp === 0) {
    target.status = "dead";
    const deathLog = recordCharDeath(state, target, `${attacker.name}の逃走追撃`, { type: "combat", source: attacker.name });
    queueCharDeathLog(logQueue, deathLog);
    logQueue.push({ msg: `[ 敵 ] [!] ${target.name}は倒れた！` });
  }
  return true;
}

function applyFleeRetreat(state) {
  const retreat = state.combatState.retreatPosition;
  if (!retreat) return false;
  state.x = retreat.x;
  state.y = retreat.y;
  return true;
}

function cloneCodexMonsterRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return record;
  return {
    ...record,
    observedActions: Array.isArray(record.observedActions) ? [...record.observedActions] : record.observedActions,
    observedConditions: Array.isArray(record.observedConditions) ? [...record.observedConditions] : record.observedConditions,
    observedLoot: Array.isArray(record.observedLoot) ? [...record.observedLoot] : record.observedLoot,
    encounterFloors: record.encounterFloors && typeof record.encounterFloors === "object" && !Array.isArray(record.encounterFloors)
      ? { ...record.encounterFloors }
      : record.encounterFloors
  };
}

function cloneCodexEquipmentRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return record;
  return {
    ...record,
    affixesSeen: Array.isArray(record.affixesSeen) ? [...record.affixesSeen] : record.affixesSeen,
    foundFloors: record.foundFloors && typeof record.foundFloors === "object" && !Array.isArray(record.foundFloors)
      ? { ...record.foundFloors }
      : record.foundFloors,
    tagObservations: record.tagObservations && typeof record.tagObservations === "object" && !Array.isArray(record.tagObservations)
      ? { ...record.tagObservations }
      : record.tagObservations
  };
}

function cloneCombatCodex(codex) {
  if (!codex) return null;
  const cloned = { ...codex };
  if (codex.stats && typeof codex.stats === "object" && !Array.isArray(codex.stats)) {
    cloned.stats = { ...codex.stats };
  }
  if (codex.monsters && typeof codex.monsters === "object" && !Array.isArray(codex.monsters)) {
    cloned.monsters = Object.fromEntries(
      Object.entries(codex.monsters).map(([name, record]) => [name, cloneCodexMonsterRecord(record)])
    );
  }
  if (codex.equipment && typeof codex.equipment === "object" && !Array.isArray(codex.equipment)) {
    cloned.equipment = Object.fromEntries(
      Object.entries(codex.equipment).map(([baseId, record]) => [baseId, cloneCodexEquipmentRecord(record)])
    );
  }
  return cloned;
}

function cloneCombatCurrentRun(currentRun) {
  if (!currentRun) return null;
  const cloned = { ...currentRun };
  if (Array.isArray(currentRun.deathLogs)) cloned.deathLogs = [...currentRun.deathLogs];
  if (Array.isArray(currentRun.equipmentFound)) cloned.equipmentFound = [...currentRun.equipmentFound];
  if (Array.isArray(currentRun.townInventory)) cloned.townInventory = [...currentRun.townInventory];
  if (Array.isArray(currentRun.unbankedObjectLoot)) cloned.unbankedObjectLoot = [...currentRun.unbankedObjectLoot];
  if (Array.isArray(currentRun.eliteDefeatedFloors)) cloned.eliteDefeatedFloors = [...currentRun.eliteDefeatedFloors];
  if (Array.isArray(currentRun.quests)) cloned.quests = currentRun.quests.map(quest => ({ ...quest }));
  ["codexRewards", "defeatsByRole", "materials"].forEach(field => {
    if (currentRun[field] && typeof currentRun[field] === "object" && !Array.isArray(currentRun[field])) {
      cloned[field] = { ...currentRun[field] };
    }
  });
  if (currentRun.eliteFloors && typeof currentRun.eliteFloors === "object" && !Array.isArray(currentRun.eliteFloors)) {
    cloned.eliteFloors = { ...currentRun.eliteFloors };
  }
  return cloned;
}

export function cloneCombatStateForRound(originalState) {
  const party = originalState.party.map(c => ({
    ...c,
    equipment: { ...c.equipment },
    buffs: c.buffs ? c.buffs.map(buff => ({ ...buff })) : undefined,
    mediumState: c.mediumState && typeof c.mediumState === "object"
      ? { ...c.mediumState, socketedRunes: [...(c.mediumState.socketedRunes || [])] }
      : c.mediumState
  }));
  const monsters = originalState.combatState.monsters.map(m => ({
    ...m,
    buffs: m.buffs ? m.buffs.map(buff => ({ ...buff })) : undefined
  }));
  const clonedState = { ...originalState };
  ["simPolicy", "simTelemetry"].forEach(field => delete clonedState[field]);
  return {
    ...clonedState,
    party,
    combatState: {
      ...originalState.combatState,
      monsters,
      loggedCoreActivations: originalState.combatState.loggedCoreActivations
        ? [...originalState.combatState.loggedCoreActivations]
        : originalState.combatState.loggedCoreActivations
    },
    inventory: [...originalState.inventory],
    firstKills: originalState.firstKills ? [...originalState.firstKills] : [],
    codex: cloneCombatCodex(originalState.codex),
    currentRun: cloneCombatCurrentRun(originalState.currentRun),
    metaMaterials: { ...(originalState.metaMaterials || {}) },
    roamingMonsters: originalState.roamingMonsters ? originalState.roamingMonsters.map(rm => ({ ...rm })) : [],
    floorChestsTotal: originalState.floorChestsTotal ? [...originalState.floorChestsTotal] : []
  };
}

export function runCombatRoundCalculation(
  originalState,
  combatSelection,
  { rng = Math.random, policy = null, measurement = null } = {}
) {
  const logQueue = [];
  const state = cloneCombatStateForRound(originalState);
  const monsters = state.combatState.monsters;
  let escaped = false;
  const roundNumber = state.combatState.roundNumber || 1;
  const actionObservations = [];
  const measurementWeaponCandidate = resolveMeasurementWeaponCandidate(
    policy?.measurementPlayerWeaponCandidate
  );
  const recordAction = (monster, action) => recordMonsterAction(monster, action, state, measurement);
  const recordCondition = (monster, condition) => recordMonsterCondition(monster, condition, state, measurement);
  const recordBleed = (event, target, metadata = {}) => recordBleedingEvent(state, event, target, metadata, measurement);
  const clearBleed = (target, reason) => clearBleedingOnDefeat(state, target, reason, measurement);
  const clearVulnerable = (target, reason) => clearCombatVulnerableOnDefeat(state, target, reason, measurement);
  const recordPattern = (event, monster, target, metadata = {}) =>
    recordEnemyStatusPattern(state, event, monster, target, metadata, measurement);

  const currentLivingParty = state.party.filter(c => c.status !== "dead");
  currentLivingParty.forEach(char => {
    char.combatLastSurvivor = currentLivingParty.length === 1;
  });
  const turns = buildCombatTurnQueue(state, combatSelection, logQueue, { rng, policy, measurement });

  // Run each action
  turns.forEach((turn, index) => {
    const actionStart = logQueue.length;
    const groupId = `combat:${roundNumber}:action:${index}`;
    const actionObservation = {
      actor: turn.type,
      actionType: turn.type === "char" ? turn.action.type : "enemy",
      order: index,
      executed: false
    };
    Object.defineProperty(actionObservation, "hpBeforeExecution", {
      value: null,
      writable: true,
      enumerable: false
    });
    if (turn.type === "monster" && measurement?.measurementEnemyActionDetails) {
      Object.defineProperties(actionObservation, {
        monsterName: {
          value: turn.mon.name,
          writable: false,
          enumerable: false
        },
        monsterTraits: {
          value: [...(turn.mon.traits || [])],
          writable: false,
          enumerable: false
        },
        monsterTags: {
          value: [...(turn.mon.tags || [])],
          writable: false,
          enumerable: false
        },
        extraMultiAction: {
          value: Boolean(turn.measurementExtraMultiAction),
          writable: false,
          enumerable: false
        },
        sharedNormalSlot: {
          value: Boolean(turn.measurementSharedNormalSlot),
          writable: false,
          enumerable: false
        },
        actionNames: {
          value: [],
          writable: false,
          enumerable: false
        },
        conditions: {
          value: [],
          writable: false,
          enumerable: false
        }
      });
      measurement.measurementCurrentEnemyAction = actionObservation;
    }
    try {
      if (escaped) return;
    const livingNow = state.party.filter(char => char.status !== "dead");
    state.party.forEach(char => {
      char.combatLastSurvivor = livingNow.length === 1 && livingNow[0] === char;
    });
    if (turn.type === "char") {
      const char = turn.char;
      if (["sleep", "paralyze", "paralyzed"].includes(char.status)) {
        logQueue.push({ msg: `[味方] ${char.name}は動けない！`, sound: "miss" });
        consumeCharIncapacitation(char, logQueue);
        return;
      }
      if (char.status !== "ok" && char.status !== "poisoned" && char.status !== "blind") return; // Died/slept earlier in the round
      
      const act = turn.action;
      
      if (act.type === "fight") {
        const target = monsters[act.targetIdx];
        if (!canMeleeTargetEnemy(monsters, target)) {
          // Find the first living target if the selected target is no longer available.
          const livingTargetIdx = findMeleeFallbackTarget(monsters);
          if (livingTargetIdx === -1) return; // All dead
          act.targetIdx = livingTargetIdx;
        }

        actionObservation.executed = true;
        actionObservation.hpBeforeExecution = char.hp;

        let finalTarget = monsters[act.targetIdx];
        const guard = findAdjacentGuard(monsters, act.targetIdx, rng);
        if (guard) {
          logQueue.push({ msg: `[ 敵 ] ${guard.mon.name}が${finalTarget.name}を庇った！` });
          act.targetIdx = guard.idx;
          finalTarget = guard.mon;
        }

        recordMonsterResistanceDiscovery(finalTarget, "physical", state);
        
        let isBlindMiss = false;
        let isEvasionMiss = false;
        if (char.status === "blind" && rng() < 0.5) {
          isBlindMiss = true;
        }

        const targetEvasionChance = getMonsterEvasionChance(finalTarget);
        const hitChance = measurementWeaponCandidate
          ? Math.max(
            PHYSICAL_HIT_CHANCE_MIN,
            Math.min(1, measurementWeaponCandidate.hitChance - targetEvasionChance)
          )
          : getPhysicalHitChance(char, finalTarget);
        if (!isBlindMiss && hitChance < 1 && rng() >= hitChance) {
          isBlindMiss = true;
          isEvasionMiss = true;
        }

        let dmg;
        let msg;
        let floatText;
        let sound = "hit";
        let shake = 8;
        if (isEvasionMiss) {
          msg = `[味方] ${char.name}の攻撃！しかし${finalTarget.name}は霧のようにかわした！`;
          floatText = "AVOID";
          sound = "miss";
          shake = 0;
          state.combatFormulaTelemetry?.physicalPlayerMisses?.push({
            floor: state.floor,
            targetName: finalTarget.name,
            targetRole: finalTarget.role,
            targetEvasionChance,
            hitChance,
            ...(measurementWeaponCandidate ? {
              measurementWeaponCandidateId: measurementWeaponCandidate.id,
              measurementWeaponMultiplier: measurementWeaponCandidate.multiplier,
              measurementWeaponHitChance: measurementWeaponCandidate.hitChance,
              measurementWeaponHighDefPenetration: measurementWeaponCandidate.highDefPenetration,
              measurementWeaponEvasionMiss: targetEvasionChance > 0
            } : {}),
            isEvasionMiss: true
          });
        } else if (isBlindMiss) {
          msg = `[味方] ${char.name}の攻撃！しかし目がくらんで空振りした！`;
          floatText = "MISS";
          sound = "miss";
          shake = 0;
        } else {
          // Attack math
          const firstTurnAttack = roundNumber === 1 ? getCharAffixSum(char, "firstTurnAttack") : 0;
          const weaponAtk = getCharWeaponAtk(char) + firstTurnAttack;
          const trapEaterBonus = getCharTrapEaterBonus(char);
          const buffAtk = getBuffTotal(char, "atk");
          const randRoll = rollCharWeaponPhysicalRandom(char, rng);
          const meleeMod = getMeleeModifiers(char, turn.idx, { state, logQueue });
          const def = getEffectiveDef(finalTarget);
          const weaponAttack = resolveMeasurementWeaponAttack({
            candidate: measurementWeaponCandidate,
            weaponAtk, buffAtk, randRoll, meleeMod,
            def,
            physResist: finalTarget.physResist,
            fixedDamageBonus: trapEaterBonus
          }) || resolveWeaponAttack({
            char,
            weaponAtk, buffAtk, randRoll, meleeMod,
            def,
            physResist: finalTarget.physResist,
            fixedDamageBonus: trapEaterBonus
          });
          const { behavior } = weaponAttack;
          const { formulaRaw, physicalResistance } = weaponAttack;
          dmg = weaponAttack.damage;
          const formulaDmg = dmg;

          const isBlindApplied = char.status === "blind";

          tryApplyExecutionerSetup(char, finalTarget, { rng, logQueue });
          dmg = applyTargetedDamageBonus(char, finalTarget, dmg, { floor: state.floor, maxHp: getCharMaxHp(char), state, logQueue, measurement });
          if (guard?.mon === finalTarget && guard.mon.guard?.damageRate) {
            dmg = Math.max(1, Math.round(dmg * guard.mon.guard.damageRate));
          }

          const isCritical = false;
          const directPhysicalDmg = dmg;
          const vulnerableResult = consumeVulnerableDamage(finalTarget, directPhysicalDmg, state, "physical", measurement);
          const vulnerableDamage = vulnerableResult.consumed ? vulnerableResult.damage : directPhysicalDmg;
          const bleedingTrigger = hasStatusEffect(finalTarget, STATUS_EFFECT_IDS.BLEEDING);
          const bleedingDamage = bleedingTrigger
            ? getBleedingPayoffDamage(state, finalTarget, vulnerableDamage)
            : 0;
          const finalPhysicalDmg = vulnerableDamage + bleedingDamage;
          if (bleedingTrigger) {
            recordBleed("triggered", finalTarget, {
              damageContribution: bleedingDamage,
              directDamage: directPhysicalDmg,
              source: finalTarget.statusEffects?.bleeding?.source || "bleedingAtk"
            });
          }

          // #611: 物理攻撃(通常攻撃)式の計装。state.combatFormulaTelemetry
          // が未設定なら no-op（既定オフ）。ここまでの分岐・乱数消費は変更しない。
          state.combatFormulaTelemetry?.physicalPlayerHits.push({
            floor: state.floor,
            weaponAtk, buffAtk, randRoll, def, meleeMod,
            trapEaterBonus,
            defResistance: weaponAttack.defResistance,
            physicalResistance,
            formulaRaw, formulaDmg, isBlindApplied,
            weaponBehaviorProfileId: weaponAttack.behaviorProfileId,
            weaponBehaviorHitChanceBonus: behavior.hitChanceBonus,
            weaponBehaviorDefenseScale: behavior.physicalDefenseScale,
            weaponBehaviorDamageMultiplier: behavior.rawDamageMultiplier,
            ...(weaponAttack.measurementWeaponCandidate ? {
              measurementWeaponCandidateId: weaponAttack.measurementWeaponCandidate.id,
              measurementWeaponMultiplier: weaponAttack.measurementWeaponCandidate.multiplier,
              measurementWeaponHitChance: weaponAttack.measurementWeaponCandidate.hitChance,
              measurementWeaponHighDefPenetration:
                weaponAttack.measurementWeaponCandidate.highDefPenetration,
              measurementWeaponBaseRaw: weaponAttack.baseRaw,
              measurementWeaponEffectiveDefense: weaponAttack.measurementWeaponEffectiveDefense
            } : {}),
            physResistApplied: Boolean(finalTarget.physResist),
            targetEvasionChance,
            hitChance,
            criticalChance: null,
            isCritical,
            preCriticalDmg: dmg,
            damage: finalPhysicalDmg,
            vulnerableConsumed: vulnerableResult.consumed,
            vulnerableDamageContribution: vulnerableResult.damageContribution,
            bleedingTrigger,
            bleedingDamageContribution: bleedingDamage
          });

          if (isCritical) {
            dmg = finalPhysicalDmg;
            finalTarget.hp = Math.max(0, finalTarget.hp - dmg);
            tryApplyHitFlinch(char, finalTarget, logQueue, rng);
            msg = `[味方] 【🗡️急所攻撃！】${char.name}の必殺の一撃！${finalTarget.name}に${dmg}の大ダメージ！${bleedingDamage > 0 ? `（出血の追撃+${bleedingDamage}）` : ""}`;
            if (wakeSleepingMonsterOnDamage(finalTarget, rng)) msg += `${finalTarget.name}は目を覚ました！`;
            floatText = `${dmg}`;
            sound = "kill";
            shake = 15;
          } else {
            dmg = finalPhysicalDmg;
            finalTarget.hp = Math.max(0, finalTarget.hp - dmg);
            tryApplyHitFlinch(char, finalTarget, logQueue, rng);
            msg = `[味方] ${char.name}の攻撃！${finalTarget.name}に${dmg}のダメージ。${bleedingDamage > 0 ? `（出血の追撃+${bleedingDamage}）` : ""}`;
            if (finalTarget.physResist && dmg <= 2) {
              msg += "（攻撃が弾かれている！）";
            }
            if (wakeSleepingMonsterOnDamage(finalTarget, rng)) {
              msg += `${finalTarget.name}は目を覚ました！`;
            }
            floatText = `${dmg}`;

            // 毒脈の呪いなどによる毒付与チャンス
            if (finalTarget.hp > 0 && !hasStatusEffect(finalTarget, STATUS_EFFECT_IDS.POISONED)) {
              const poisonAtkChance = getCharAffixSum(char, "poisonAtk") / 100;
              if (poisonAtkChance > 0 && rng() < poisonAtkChance) {
                applyStatusEffect(finalTarget, STATUS_EFFECT_IDS.POISONED, { source: "poisonAtk" });
                logQueue.push({
                  msg: `[味方] [!] ${char.name}の攻撃により、${finalTarget.name}は毒に侵された！`,
                  presentationKind: COMBAT_LOG_PRESENTATION_KINDS.STATUS_GOOD,
                  sound: "poison"
                });
              }
            }
          }

          // Bleeding is deliberately a separate weapon support route.  It is
          // applied only after this successful normal hit; follow-ups below
          // never call this producer or consume the payoff.
          tryApplyBleeding(char, finalTarget, state, logQueue, rng, measurement);

          if (hasTrait(finalTarget, "reflectPhysical") && dmg > 0) {
            const reflected = Math.max(1, Math.floor(dmg * (finalTarget.physicalReflect?.rate ?? 0.3)));
            const playerHpBefore = char.hp;
            char.hp = Math.max(0, char.hp - reflected);
            recordReceivedDamage(state, char, finalTarget.name, reflected, reflected, playerHpBefore, {
              attackType: "reflect", measurement
            });
            wakeSleepingCharOnDamage(char);
            logQueue.push({
              msg: `[ 敵 ] ${finalTarget.name}の棘が${char.name}に${reflected}の反射ダメージを与えた！`,
              presentationKind: COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_TAKEN,
              sound: "hit",
              floatText: `${reflected}`,
              floatColor: "#ff3b30"
            });
            if (char.hp === 0) {
              char.status = "dead";
              const deathLog = recordCharDeath(state, char, `${finalTarget.name}の物理反射`, { type: "combat", source: finalTarget.name });
              queueCharDeathLog(logQueue, deathLog);
            }
          }

          if (hasTrait(finalTarget, "counterSpell") && finalTarget.hp > 0 && rng() < (finalTarget.counterSpell?.chance ?? 0.2)) {
            let counterDmg = Math.floor(rng() * 11) + 5;
            const rawCounterDmg = counterDmg;
            const playerHpBefore = char.hp;
            counterDmg = reduceIncomingDamage(char, counterDmg, { spell: true, logQueue, state });
            char.hp = Math.max(0, char.hp - counterDmg);
            recordReceivedDamage(state, char, finalTarget.name, rawCounterDmg, counterDmg, playerHpBefore, {
              attackType: "counter", measurement
            });
            wakeSleepingCharOnDamage(char);
            logQueue.push({
              msg: `[ 敵 ] ${finalTarget.name}はハリトで反撃した！${char.name}に${counterDmg}の炎ダメージ！`,
              presentationKind: COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_TAKEN,
              sound: "cast_spell",
              floatText: `${counterDmg}`,
              floatColor: "#ff3b30"
            });
            if (char.hp === 0) {
              char.status = "dead";
              const deathLog = recordCharDeath(state, char, `${finalTarget.name}の反撃ハリト`, { type: "combat", source: finalTarget.name });
              queueCharDeathLog(logQueue, deathLog);
            }
          }

          // followUp (追撃)
          if (!isBlindMiss && finalTarget.hp > 0) {
            const followUpChance = getFollowUpChance(
              char,
              getCharAffixSum(char, "followUp"),
              char.combatFirstStrikeActive
            );
            if (followUpChance > 0 && rng() * 100 < followUpChance) {
              const followUpDmgRand = rollCharWeaponPhysicalRandom(char, rng);
              const firstTurnAttack = roundNumber === 1 ? getCharAffixSum(char, "firstTurnAttack") : 0;
              const weaponAtk = getCharWeaponAtk(char) + firstTurnAttack;
              const trapEaterBonus = getCharTrapEaterBonus(char);
              const def = getEffectiveDef(finalTarget);
              const followUpAttack = resolveMeasurementWeaponAttack({
                candidate: measurementWeaponCandidate,
                weaponAtk,
                randRoll: followUpDmgRand,
                def,
                physResist: finalTarget.physResist,
                meleeMod: 0.7,
                fixedDamageBonus: trapEaterBonus
              }) || resolveWeaponAttack({
                char,
                weaponAtk,
                randRoll: followUpDmgRand,
                def,
                physResist: finalTarget.physResist,
                meleeMod: 0.7,
                fixedDamageBonus: trapEaterBonus
              });
              let followUpDmg = followUpAttack.damage;
              tryApplyExecutionerSetup(char, finalTarget, { rng, logQueue });
              followUpDmg = applyTargetedDamageBonus(char, finalTarget, followUpDmg, { floor: state.floor, maxHp: getCharMaxHp(char), state, logQueue, measurement });
              finalTarget.hp = Math.max(0, finalTarget.hp - followUpDmg);
              tryApplyHitFlinch(char, finalTarget, logQueue, rng);
              const followUpMp = getCharAffixSum(char, "followUpMp");
              if (followUpMp > 0) {
                char.mp = Math.min(getCharMaxMp(char), char.mp + followUpMp);
              }
              const wakeSuffix = wakeSleepingMonsterOnDamage(finalTarget, rng) ? `${finalTarget.name}は目を覚ました！` : "";
              logQueue.push({
                msg: `[味方] 【🗡️追撃】${char.name}の素早い追加攻撃！${finalTarget.name}に${followUpDmg}のダメージ。${wakeSuffix}`,
                presentationKind: COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_DEALT,
                sound: "hit",
                shake: 4,
                floatText: `${followUpDmg}`,
                floatColor: finalTarget.color
              });
            }
          }
        }
        
        logQueue.push({
          msg,
          presentationKind: isBlindMiss
            ? COMBAT_LOG_PRESENTATION_KINDS.NEUTRAL
            : COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_DEALT,
          sound,
          shake,
          floatText,
          floatColor: isBlindMiss ? "#8e8e93" : finalTarget.color
        });

        if (finalTarget.hp === 0) {
          clearBleed(finalTarget, "defeat");
          clearVulnerable(finalTarget, "defeat");
          applyKillAffixEffects(char, finalTarget, state, logQueue, { measurement });
          logQueue.push({ msg: `[味方] [!] ${finalTarget.name}を倒した！` });
          processMonsterDefeat(monsters, finalTarget, logQueue);
        }
      } else if (act.type === "spell") {
        actionObservation.executed = true;
        actionObservation.hpBeforeExecution = char.hp;
        resolvePlayerSpell(char, act, state, monsters, logQueue, {
          rng,
          measurement,
          onBleedingClear: (target, reason) => recordBleed("cleared", target, { reason })
        });
      } else if (act.type === "item") {
        const res = resolvePlayerItem(char, act, state, logQueue, { rng });
        if (res.escaped) {
          escaped = true;
          return;
        }
      } else if (act.type === "defend") {
        actionObservation.executed = true;
        actionObservation.hpBeforeExecution = char.hp;
        logQueue.push({ msg: `[味方] ${char.name}は身を固めて防御している。` });
      } else if (act.type === "run") {
        actionObservation.executed = true;
        actionObservation.hpBeforeExecution = char.hp;
        recordQueuedPatternResponse(state, monsters, "fleeBeforePayoff", measurement);
        applyFleePartingAttack(state, monsters, logQueue, rng, measurement);
        const retreated = applyFleeRetreat(state);
        logQueue.push({
          msg: retreated
            ? "[味方] 追撃を受けながら戦闘から逃れ、1マス後退した！"
            : "[味方] 追撃を受けながら戦闘から逃れた！後退先がないため、その場に留まった。",
          sound: "miss",
          runEscape: true,
          fleeExecution: true
        });
        escaped = true;
      }
    } else {
      const mon = turn.mon;
      if (mon.hp <= 0) return;

      actionObservation.executed = true;

      if (mon.flinched) {
        mon.flinched = false;
        logQueue.push({ msg: `[ 敵 ] ${mon.name}は怯んで動けない！`, sound: "miss" });
        return;
      }

      if (mon.status === "sleep" || mon.status === "paralyzed" || mon.status === "paralyze") {
        mon.chargeQueued = false;
        mon.selfDestructQueued = false;
        mon.lahalitoQueued = false;
        mon.madaltoQueued = false;
        mon.tiltowaitQueued = false;
        mon.dragonBreathQueued = false;
        mon.multiActionQueued = false;
        mon.summonQueued = false;
        mon.snipeQueued = false;
        logQueue.push({
          msg: `[ 敵 ] ${mon.name}は動けない！`,
          sound: "miss"
        });
        return;
      }

      const isMultiActionTurn = mon.multiActionQueued;
      mon.multiActionQueued = false;

      const statusPatternResult = resolveEnemyStatusPattern(
        mon,
        state,
        monsters,
        combatSelection,
        logQueue,
        roundNumber,
        rng,
        measurement
      );
      if (statusPatternResult?.handled) return;
      const statusPayoff = statusPatternResult?.payoff || null;

      if ((hasTrait(mon, "regen") || mon.combatTrait === "regenerator") && mon.hp < mon.maxHp) {
        recordAction(mon, "自己再生");
        const heal = mon.combatTrait === "regenerator"
          ? Math.max(1, Math.floor(mon.maxHp * 0.10))
          : mon.regenAmount ?? Math.max(1, Math.floor(mon.maxHp * 0.12));
        mon.hp = Math.min(mon.maxHp, mon.hp + heal);
        logQueue.push({ msg: `[ 敵 ] ${mon.name}は再生し、HPが${heal}回復した。` });
      }

      // Check if monster flees
      if (mon.fleeChance && rng() < mon.fleeChance) {
        recordAction(mon, "逃走");
        mon.hp = 0;
        mon.fled = true;
        clearBleed(mon, "flee");
        clearVulnerable(mon, "flee");
        logQueue.push({
          msg: `[ 敵 ] [!] ${mon.name}は逃げ出した！`,
          sound: "miss"
        });
        return;
      }

      if (hasTrait(mon, "selfDestruct") && mon.hp / mon.maxHp <= 0.25) {
        if (mon.selfDestructQueued) {
          recordAction(mon, "自爆");
          mon.hp = 0;
          clearBleed(mon, "self-destruct");
          clearVulnerable(mon, "self-destruct");
          logQueue.push({ msg: `[ 敵 ] ${mon.name}は火花を散らして自爆した！`, sound: "cast_spell", shake: 15, flash: true });
          applyPartyDamage(state, combatSelection, logQueue, mon.name, 4, 8, { spell: true, rng, measurement });
          return;
        }
        mon.selfDestructQueued = true;
        logQueue.push({ msg: `[警告] ${mon.name}の体が赤く膨らみ、爆ぜる寸前だ！` });
        return;
      }

      if (hasTrait(mon, "chargeAttack")) {
        if (mon.chargeQueued) {
          recordAction(mon, "溜めて大打撃");
          mon.chargeQueued = false;
          logQueue.push({ msg: `[ 敵 ] ${mon.name}は破滅の波動を放った！`, sound: "cast_spell", shake: 20, flash: true });
          applyPartyDamage(state, combatSelection, logQueue, mon.name, 18, 32, { spell: true, defendRate: 0.5, rng, measurement });
          return;
        }
        if (rng() < (mon.traitChance ?? 0.35)) {
          mon.chargeQueued = true;
          logQueue.push({ msg: `[警告] ${mon.name}が魔力を集中している！次のターンに大技が来る！`, sound: "cast_spell" });
          return;
        }
      }

      if (hasTrait(mon, "summonAlly")) {
        if (mon.summonQueued) {
          mon.summonQueued = false;
          const livingMonsterCount = monsters.filter(m => m.hp > 0).length;
          const summonLimit = mon.summon?.maxAllies ?? 5;
          if (livingMonsterCount < summonLimit) {
            const template = findMonsterTemplate(mon.summon?.name || "ゴブリンの呪術師");
            if (template) {
              recordAction(mon, "仲間を呼ぶ");
              monsters.push({ ...template, hp: template.hp, maxHp: template.hp });
              logQueue.push({ msg: `[ 敵 ] ${mon.name}は${template.name}を召喚した！` });
              return;
            }
          }
        } else {
          mon.turnCount = (mon.turnCount || 0) + 1;
          const livingMonsterCount = monsters.filter(m => m.hp > 0).length;
          const summonLimit = mon.summon?.maxAllies ?? 5;
          if (mon.turnCount % 3 === 0 && livingMonsterCount < summonLimit) {
            mon.summonQueued = true;
            logQueue.push({ msg: `[警告] ${mon.name}が怪しい声で呪文を唱え始めた！次のターン、召喚の予兆！`, sound: "cast_spell" });
            return;
          }
        }
      }

      if (hasTrait(mon, "multiAction") && policy?.measurementMaxActionsPerEnemy !== 1) {
        if (!mon.multiActionQueued && rng() < (mon.traitChance ?? 0.35)) {
          mon.multiActionQueued = true;
          logQueue.push({ msg: `[警告] ${mon.name}の目が血走り、凶暴化している！次のターン、連続攻撃の予兆！`, sound: "cast_spell" });
          return;
        }
      }

      if (hasTrait(mon, "cleanseAlly") && rng() < (mon.traitChance ?? 0.35)) {
        const target = monsters.find(m => m.hp > 0 && ((m.buffs || []).some(buff => buff.value < 0) || m.status === "sleep"));
        if (target) {
          recordAction(mon, "状態異常を治す");
          target.buffs = (target.buffs || []).filter(buff => buff.value > 0);
          if (target.status === "sleep") {
            removeStatusEffect(target, STATUS_EFFECT_IDS.SLEEP, { legacyStatus: "delete" });
          }
          logQueue.push({ msg: `[ 敵 ] ${mon.name}は${target.name}の弱体を祓った！`, sound: "heal" });
          return;
        }
      }

      if (hasTrait(mon, "drainMp") && rng() < (mon.traitChance ?? 0.25)) {
        const targetSelect = pickTarget(state.party, "random", rng);
        if (targetSelect && targetSelect.c.mp > 0) {
          recordAction(mon, "MPを吸収");
          const amount = Math.min(targetSelect.c.mp, mon.drainMpAmount ?? 1);
          targetSelect.c.mp -= amount;
          mon.hp = Math.min(mon.maxHp, mon.hp + amount * 3);
          logQueue.push({ msg: `[ 敵 ] ${mon.name}は${targetSelect.c.name}のMPを${amount}吸い取った！` });
          return;
        }
      }

      if (hasTrait(mon, "silence") && rng() < (mon.traitChance ?? 0.25)) {
        const targetSelect = pickTarget(state.party, "random", rng);
        if (targetSelect) {
          recordAction(mon, "沈黙");
          if (rng() >= getCombatGuardedStatusChance(
            targetSelect.c,
            getStatusEffectChance(targetSelect.c, 1, { telemetry: state.combatFormulaTelemetry }),
            combatSelection,
            targetSelect.i,
            state.combatFormulaTelemetry
          )) {
            logQueue.push({ msg: `[ 敵 ] ${targetSelect.c.name}は不屈の意志で沈黙を退けた！`, sound: "miss" });
          } else {
            recordCondition(mon, "沈黙を受けた");
            applyStatusEffect(targetSelect.c, STATUS_EFFECT_IDS.SILENCE, { remainingTurns: 2 });
            logQueue.push({ msg: `[ 敵 ] ${mon.name}は封呪の気配を放った！${targetSelect.c.name}は沈黙した。`, sound: "cast_spell" });
          }
          return;
        }
      }

      if (hasTrait(mon, "antiHeal") && rng() < (mon.traitChance ?? 0.3)) {
        const targetSelect = pickTarget(state.party, "lowHp", rng);
        if (targetSelect) {
          recordAction(mon, "回復を阻害");
          if (rng() >= getCombatGuardedStatusChance(
            targetSelect.c,
            getStatusEffectChance(targetSelect.c, 1, { telemetry: state.combatFormulaTelemetry }),
            combatSelection,
            targetSelect.i,
            state.combatFormulaTelemetry
          )) {
            logQueue.push({ msg: `[ 敵 ] ${targetSelect.c.name}は不屈の意志で呪いを退けた！`, sound: "miss" });
          } else {
            recordCondition(mon, "回復阻害を受けた");
            targetSelect.c.antiHealTurns = 2;
            logQueue.push({ msg: `[ 敵 ] ${mon.name}は命を喰らう呪いを刻んだ！${targetSelect.c.name}への回復量が半減する。`, sound: "cast_spell" });
          }
          return;
        }
      }

      if (hasTrait(mon, "buffPhysicalDef") && rng() < (mon.traitChance ?? 0.3)) {
        recordAction(mon, "物理防御を強化");
        monsters.filter(m => m.hp > 0).forEach(m => addMonsterBuff(m, "def", mon.buffValue ?? 2, 3));
        logQueue.push({ msg: `[ 敵 ] ${mon.name}は仲間の守りを固めた！` });
        return;
      }

      if (hasTrait(mon, "buffMagicDef") && rng() < (mon.traitChance ?? 0.3)) {
        recordAction(mon, "魔法防御を強化");
        monsters.filter(m => m.hp > 0).forEach(m => addMonsterBuff(m, "magicResist", mon.buffValue ?? 0.3, 3));
        logQueue.push({ msg: `[ 敵 ] ${mon.name}は魔法の結界を張った！` });
        return;
      }

      if (hasTrait(mon, "buffAtk") && rng() < (mon.traitChance ?? 0.3)) {
        recordAction(mon, "仲間を鼓舞");
        monsters.filter(m => m.hp > 0).forEach(m => addMonsterBuff(m, "atk", mon.buffValue ?? 3, 3));
        logQueue.push({ msg: `[ 敵 ] ${mon.name}は仲間を鼓舞した！` });
        return;
      }

      // ボス固有の行動判定と実行
      if (resolveBossAction(mon, state, combatSelection, monsters, logQueue, { rng, measurement })) {
        if (mon.hp === 0) {
          const reason = mon.fled ? "flee" : "self-destruct";
          clearBleed(mon, reason);
          clearVulnerable(mon, reason);
        }
        return;
      }

      // Check if monster heals its allies first (35% chance if spellcaster healer)
      const isSilenced = mon.silenceTurns > 0;
      if (isSilenced) {
        mon.lahalitoQueued = false;
        mon.madaltoQueued = false;
        if (mon.name === "いにしえの竜") {
          mon.tiltowaitQueued = false;
        }
      }

      const healSpellChance = mon.spellChance !== undefined ? mon.spellChance : 0.35;
      if (!isSilenced && mon.name !== "いにしえの竜" && mon.spell && ["DIOS", "DIALMA"].includes(mon.spell) && rng() < healSpellChance) {
        const woundedMonsters = monsters.filter(m => m.hp > 0 && m.hp < m.maxHp);
        if (woundedMonsters.length > 0) {
          recordAction(mon, mon.spell);
          woundedMonsters.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));
          const healTarget = woundedMonsters[0];
          const healAmount = mon.spell === "DIOS" ? (Math.floor(rng() * 6) + 10) : (Math.floor(rng() * 15) + 20);
          healTarget.hp = Math.min(healTarget.maxHp, healTarget.hp + healAmount);
          logQueue.push({
            msg: `[ 敵 ] ${mon.name}は呪文を唱えた！${healTarget.name}のHPが ${healAmount} 回復した。`,
            sound: "heal",
            floatText: `+${healAmount}`,
            floatColor: "#00ff66"
          });
          return;
        }
      }

      // Prioritize living and active characters for physical attacks
      let targetCandidates;
      let targetSelect = statusPayoff?.targetSelect || null;
      let isSnipeAttack = Boolean(statusPayoff?.pattern.isSnipe);
      const statusPayoffMultiplier = statusPayoff?.pattern.payoffMultiplier ?? 1;

      if (mon.isSniper) {
        if (mon.snipeQueued) {
          mon.snipeQueued = false;
          isSnipeAttack = true;
          const targetChar = state.party[mon.snipeTargetIdx];
          if (targetChar && targetChar.hp > 0 && targetChar.status !== "dead") {
            const idx = state.party.indexOf(targetChar);
            targetSelect = { c: targetChar, i: idx };
          } else {
            targetCandidates = getLivingTargetCandidates(state.party);
            if (targetCandidates.length > 0) {
              targetSelect = targetCandidates[Math.floor(rng() * targetCandidates.length)];
            }
          }
        } else {
          if (rng() < (mon.traitChance ?? 0.35)) {
            targetCandidates = getLivingTargetCandidates(state.party);
            if (targetCandidates.length > 0) {
              const selected = targetCandidates[Math.floor(rng() * targetCandidates.length)];
              mon.snipeQueued = true;
              mon.snipeTargetIdx = selected.i;
              logQueue.push({
                msg: `[警告] ${mon.name}が${selected.c.name}を狙い定めている！次のターン、狙撃の予兆！`,
                sound: "cast_spell"
              });
              return;
            }
          }
        }
      }

      if (!targetSelect) {
        targetCandidates = (hasTrait(mon, "targetLowHp") || mon.combatTrait === "executioner")
          ? getLivingTargetCandidates(state.party, "lowHp")
          : getLivingTargetCandidates(state.party);

        if (targetCandidates.length === 0) return;
        targetSelect = (hasTrait(mon, "targetLowHp") || mon.combatTrait === "executioner")
          ? targetCandidates[0] : targetCandidates[Math.floor(rng() * targetCandidates.length)];
      }

      const target = targetSelect.c;
      if (isMultiActionTurn) recordAction(mon, "連続攻撃");
      if (statusPayoff) {
        recordAction(mon, statusPayoff.pattern.payoffAction);
        if (statusPayoff.defended) {
          recordPattern("defendBeforePayoff", mon, target, { response: "defendBeforePayoff" });
        }
      }

      // Attack spells (HALITO, LAHALITO etc., excluding healer spells)
      const attackSpellChance = mon.spellChance !== undefined ? mon.spellChance : 0.20;
      let isLahalitoForced = !isSilenced && mon.spell === "LAHALITO" && mon.lahalitoQueued;
      let isMadaltoForced = !isSilenced && mon.spell === "MADALTO" && mon.madaltoQueued;

      if (isLahalitoForced || isMadaltoForced || (!isSilenced && mon.name !== "いにしえの竜" && mon.spell && !["DIOS", "DIALMA"].includes(mon.spell) && rng() < attackSpellChance)) {
        if (isLahalitoForced || mon.spell === "LAHALITO") {
          if (mon.lahalitoQueued) {
            recordAction(mon, "LAHALITO");
            mon.lahalitoQueued = false;
            logQueue.push({
              msg: `[ 敵 ] ${mon.name}は激しい炎の息（ラハリト）を吹き出した！`,
              sound: "cast_spell",
              shake: 15,
              flash: true
            });
            state.party.forEach((c, charIdx) => {
              if (c.status !== "dead") {
                const isDefending = combatSelection.actions.some(a => a.actorIdx === charIdx && a.type === "defend");
                const attackType = mon.tags?.includes("dragon") ? "breath" : "spell";
                let dmg = Math.floor(rng() * 15) + 10;
                dmg = resolveGuardMitigation(c, dmg, {
                  isDefending,
                  attackType,
                  telemetry: state.combatFormulaTelemetry
                });
                const rawDamage = dmg;
                const playerHpBefore = c.hp;
                dmg = reduceIncomingDamage(c, dmg, {
                  spell: true,
                  dragon: mon.tags?.includes("dragon"),
                  logQueue,
                  state
                });
                c.hp = Math.max(0, c.hp - dmg);
                recordReceivedDamage(state, c, mon.name, rawDamage, dmg, playerHpBefore, {
                  attackType,
                  isDefending,
                  measurement
                });
                wakeSleepingCharOnDamage(c);
                logQueue.push({
                  msg: `[ 敵 ] ${c.name}は${dmg}の炎ダメージを受けた。${isDefending ? "(軽減)" : ""}`,
                  presentationKind: COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_TAKEN
                });
                if (c.hp === 0) {
                  c.status = "dead";
                  const deathLog = recordCharDeath(state, c, `${mon.name}のラハリト`, { type: "combat", source: mon.name });
                  queueCharDeathLog(logQueue, deathLog);
                }
              }
            });
          } else {
            mon.lahalitoQueued = true;
            logQueue.push({
              msg: `[警告] ${mon.name}の周囲に炎が渦巻く！次のターン、ラハリトの予兆！`,
              sound: "cast_spell"
            });
          }
          return;
        } else if (isMadaltoForced || mon.spell === "MADALTO") {
          if (mon.madaltoQueued) {
            recordAction(mon, "MADALTO");
            mon.madaltoQueued = false;
            logQueue.push({
              msg: `[ 敵 ] ${mon.name}はマダルトを唱えた！氷の嵐が吹き荒れる！`,
              sound: "cast_spell",
              shake: 15,
              flash: true
            });
            state.party.forEach((c, charIdx) => {
              if (c.status !== "dead") {
                const isDefending = combatSelection.actions.some(a => a.actorIdx === charIdx && a.type === "defend");
                const attackType = "spell";
                let dmg = Math.floor(rng() * 20) + 15;
                dmg = resolveGuardMitigation(c, dmg, {
                  isDefending,
                  attackType,
                  telemetry: state.combatFormulaTelemetry
                });
                const rawDamage = dmg;
                const playerHpBefore = c.hp;
                dmg = reduceIncomingDamage(c, dmg, {
                  spell: true,
                  dragon: mon.tags?.includes("dragon"),
                  logQueue,
                  state
                });
                c.hp = Math.max(0, c.hp - dmg);
                recordReceivedDamage(state, c, mon.name, rawDamage, dmg, playerHpBefore, {
                  attackType,
                  isDefending,
                  measurement
                });
                wakeSleepingCharOnDamage(c);
                logQueue.push({
                  msg: `[ 敵 ] ${c.name}は${dmg}の氷ダメージを受けた。${isDefending ? "(軽減)" : ""}`,
                  presentationKind: COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_TAKEN
                });
                if (c.hp === 0) {
                  c.status = "dead";
                  const deathLog = recordCharDeath(state, c, `${mon.name}のマダルト`, { type: "combat", source: mon.name });
                  queueCharDeathLog(logQueue, deathLog);
                }
              }
            });
          } else {
            mon.madaltoQueued = true;
            logQueue.push({
              msg: `[警告] ${mon.name}の周囲の温度が急激に下がっていく！次のターン、マダルトの予兆！`,
              sound: "cast_spell"
            });
          }
          return;
        } else if (mon.spell === "HALITO") {
          recordAction(mon, "HALITO");
          let dmg = Math.floor(rng() * 10) + 5;
          const isDefending = combatSelection.actions.some(a => a.actorIdx === targetSelect.i && a.type === "defend");
          dmg = resolveGuardMitigation(target, dmg, {
            isDefending,
            attackType: "spell",
            telemetry: state.combatFormulaTelemetry
          });
          const rawDamage = dmg;
          const playerHpBefore = target.hp;
          dmg = reduceIncomingDamage(target, dmg, {
            spell: true,
            dragon: mon.tags?.includes("dragon"),
            logQueue,
            state
          });
          target.hp = Math.max(0, target.hp - dmg);
          recordReceivedDamage(state, target, mon.name, rawDamage, dmg, playerHpBefore, {
            attackType: "spell",
            isDefending,
            measurement
          });
          wakeSleepingCharOnDamage(target);
          logQueue.push({
            msg: `[ 敵 ] ${mon.name}はハリトを唱えた！${target.name}に${dmg}の炎ダメージ！${isDefending ? "(軽減)" : ""}`,
            presentationKind: COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_TAKEN,
            sound: "cast_spell",
            shake: 8,
            floatText: `${dmg}`,
            floatColor: "#ff3b30"
          });
        } else if (mon.spell === "TILTOWAIT") {
          recordAction(mon, "TILTOWAIT");
          logQueue.push({
            msg: `[ 敵 ] ${mon.name}はティルトウェイトを唱えた！極大爆裂が襲いかかる！`,
            sound: "cast_spell",
            shake: 25,
            flash: true
          });
          state.party.forEach((c, charIdx) => {
            if (c.status !== "dead") {
              const isDefending = combatSelection.actions.some(a => a.actorIdx === charIdx && a.type === "defend");
              const attackType = "spell";
              let dmg = Math.floor(rng() * 30) + 35; // 35-65 DMG
              dmg = resolveGuardMitigation(c, dmg, {
                isDefending,
                attackType,
                telemetry: state.combatFormulaTelemetry
              });
              const rawDamage = dmg;
              const playerHpBefore = c.hp;
              dmg = reduceIncomingDamage(c, dmg, {
                spell: true,
                dragon: mon.tags?.includes("dragon"),
                logQueue,
                state
              });
              c.hp = Math.max(0, c.hp - dmg);
              recordReceivedDamage(state, c, mon.name, rawDamage, dmg, playerHpBefore, {
                attackType,
                isDefending,
                measurement
              });
              wakeSleepingCharOnDamage(c);
              logQueue.push({
                msg: `[ 敵 ] ${c.name}は${dmg}の爆裂ダメージを受けた。${isDefending ? "(軽減)" : ""}`,
                presentationKind: COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_TAKEN
              });
              if (c.hp === 0) {
                c.status = "dead";
                const deathLog = recordCharDeath(state, c, `${mon.name}のティルトウェイト`, { type: "combat", source: mon.name });
                queueCharDeathLog(logQueue, deathLog);
              }
            }
          });
        }
      } else {
        recordAction(mon, isSnipeAttack ? "狙撃" : "通常攻撃");
        let isEvaded = false;
        const evasion = getCharAffixSum(target, "evasion") / 100;
        const rearEvasion = targetSelect.i >= 2 ? getCharAffixSum(target, "rearEvasion") / 100 : 0;
        if (
          (evasion > 0 && rng() < evasion)
          || (rearEvasion > 0 && rng() < rearEvasion)
        ) {
          isEvaded = true;
        }

        if (isEvaded) {
          logQueue.push({
            msg: `[ 敵 ] ${mon.name}の攻撃！しかし、${target.name}は身軽に回避した！`,
            sound: "miss",
            shake: 0,
            floatText: "AVOID",
            floatColor: "#00ff66"
          });
        } else {
          const isDefending = combatSelection.actions.some(a => a.actorIdx === targetSelect.i && a.type === "defend");
          const baseAtk = getEffectiveAtk(mon);
          let finalAtk;
          if (statusPayoff) {
            finalAtk = Math.round(baseAtk * statusPayoffMultiplier) + Math.floor(rng() * 4);
          } else if (isSnipeAttack) {
            finalAtk = Math.round(baseAtk * 1.5) + Math.floor(rng() * 4);
          } else {
            finalAtk = baseAtk + Math.floor(rng() * 4);
          }
          finalAtk = Math.max(1, Math.round(finalAtk * getEliteAttackMultiplier(mon, target)));
          const frontGuard = targetSelect.i < 2 ? getCharAffixSum(target, "frontGuard") : 0;
          const firstStrikeDefense = target.combatFirstStrikeActive ? getCharAffixSum(target, "firstStrikeDefense") : 0;
          const finalDef = calculatePhysicalDefenseFormula({
            baseDef: getCharDef(target),
            bonusDef: getBuffTotal(target, "def") + frontGuard + firstStrikeDefense,
            tempDefDown: target.tempDefDown || 0
          });
          const preDefDmg = finalAtk;
          const defResistance = getPhysicalDefenseResistance(
            finalDef,
            PHYSICAL_DEF_RESISTANCE_SCALE_INCOMING
          );
          const formulaRaw = finalAtk;
          let dmg = Math.max(1, Math.floor(applyPhysicalResistance(formulaRaw, defResistance)));
          const formulaDmg = dmg;
          dmg = resolveGuardMitigation(target, dmg, {
            isDefending,
            attackType: "physical",
            telemetry: state.combatFormulaTelemetry
          });

          const isBlindTargetApplied = target.status === "blind";

          const isMonDragon = mon.spriteType === "dragon" || (mon.tags && mon.tags.includes("dragon"));
          const preMitigationDmg = dmg;
          const playerHpBefore = target.hp;
          dmg = reduceIncomingDamage(target, dmg, { dragon: isMonDragon, logQueue, state });
          const measurementNormalDamageRate = Number(policy?.measurementNormalDamageRate);
          if (!statusPayoff && !isSnipeAttack && Number.isFinite(measurementNormalDamageRate) && measurementNormalDamageRate > 0 && measurementNormalDamageRate < 1) {
            dmg = Math.max(1, Math.round(dmg * measurementNormalDamageRate));
          }
          // #611: 敵→プレイヤー物理攻撃の計装。既定 no-op。
          state.combatFormulaTelemetry?.physicalMonsterHits.push({
            floor: state.floor,
            finalAtk, finalDef, defResistance, preDefDmg, formulaRaw, formulaDmg,
            isDefending, isBlindTargetApplied, isSnipeAttack,
            preMitigationDmg, finalDmg: dmg, attackType: "normal"
          });
          target.hp = Math.max(0, target.hp - dmg);
          recordReceivedDamage(state, target, mon.name, preMitigationDmg, dmg, playerHpBefore, {
            attackType: "physical",
            causalType: statusPayoff ? "status_payoff" : isSnipeAttack ? "snipe" : "normal",
            preDefDamage: preDefDmg,
            postDefDamage: formulaDmg,
            finalDef,
            defResistance,
            isDefending,
            measurement
          });
          const wakeSuffix = wakeSleepingCharOnDamage(target) ? `${target.name}は目を覚ました！` : "";
          
          const attackMsg = statusPayoff
            ? `[ 敵 ] ${mon.name}の${statusPayoff.pattern.payoffMessage}！${target.name}に${dmg}のダメージ！`
            : isSnipeAttack
              ? `[ 敵 ] ${mon.name}の狙撃！${target.name}に${dmg}のダメージ！`
            : `[ 敵 ] ${mon.name}の攻撃！${target.name}に${dmg}のダメージ！`;
          
          logQueue.push({
            msg: `${attackMsg}${wakeSuffix}`,
            presentationKind: COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_TAKEN,
            sound: "hit",
            shake: statusPayoff || isSnipeAttack ? 12 : 8,
            floatText: `${dmg}`,
            floatColor: "#ff3b30"
          });

          if (statusPayoff) {
            mon.statusPatternPayoffConsumed = { targetIdx: targetSelect.i };
            recordPattern("payoffs", mon, target, {
              damage: dmg,
              latency: Math.max(1, roundNumber - (statusPayoff.queued.setupRound || roundNumber))
            });
            clearQueuedStatusPattern(mon);
          }

          tryThornCounter(target, mon, targetSelect.i, state, logQueue, rng);
          if (mon.hp === 0) {
            clearBleed(mon, "counterattack");
            clearVulnerable(mon, "counterattack");
            applyKillAffixEffects(target, mon, state, logQueue, { measurement });
            logQueue.push({ msg: `[味方] [!] ${mon.name}を反撃で倒した！` });
            processMonsterDefeat(monsters, mon, logQueue);
            return;
          }

          if (hasTrait(mon, "debuffPhysicalDef") && target.hp > 0 && rng() < (mon.traitChance ?? 0.25)) {
            target.tempDefDown = Math.min(6, (target.tempDefDown || 0) + (mon.debuffValue ?? 2));
            logQueue.push({ msg: `[ 敵 ] ${target.name}の守りが崩された！` });
          }

          if (hasTrait(mon, "debuffMagicDef") && target.hp > 0 && rng() < (mon.traitChance ?? 0.25)) {
            target.magicVulnerableTurns = 3;
            logQueue.push({ msg: `[ 敵 ] ${target.name}は魔法に弱くなった！` });
          }

          // Apply poison effect if monster is poisonous and target survives
          const poisonChance = mon.statusChance !== undefined ? mon.statusChance : 0.35;
          const patternActive = mon.statusAttackPattern && !mon.isBoss && !mon.isMidboss &&
            !state.combatState?.isBoss && !state.combatState?.isMidboss;
          if (mon.isPoisonous && !patternActive && target.hp > 0 && target.status === "ok" && rng() < resolveGuardStatusChance(target, getStatusEffectChance(target, poisonChance, { telemetry: state.combatFormulaTelemetry }), { isDefending, telemetry: state.combatFormulaTelemetry })) {
            const ward = getCharAffixSum(target, "poisonWard");
            if (ward > 0 && rng() * 100 < ward) {
              logQueue.push({
                msg: `[ 敵 ] ${target.name}は防毒の備えで毒を退けた！`,
                sound: "miss"
              });
            } else {
              applyStatusEffect(target, STATUS_EFFECT_IDS.POISONED, { source: "monster" });
              recordCondition(mon, "毒を受けた");
              logQueue.push({
                msg: `[ 敵 ] [!] ${target.name}は毒に侵された。`,
                sound: "chest_trap"
              });
              logQueue.push({
                msg: "[ 敵 ] 毒はそれほど深くない。やがて体から抜けるだろう。"
              });
            }
          }

          // Apply paralyze effect if monster is paralyzing and target survives
          const paralyzeChance = mon.statusChance !== undefined ? mon.statusChance : 0.35;
          if (mon.isParalyzing && target.hp > 0 && target.status === "ok" && rng() < resolveGuardStatusChance(target, getStatusEffectChance(target, paralyzeChance, { telemetry: state.combatFormulaTelemetry }), { isDefending, telemetry: state.combatFormulaTelemetry })) {
            applyStatusEffect(target, STATUS_EFFECT_IDS.PARALYZED, { source: "monster" });
            recordCondition(mon, "麻痺を受けた");
            logQueue.push({
              msg: `[ 敵 ] [!] ${target.name}は麻痺を受け、麻痺状態になった！`,
              sound: "chest_trap"
            });
          }

          // Apply sleep effect if monster can induce sleep and target survives
          const sleepChance = mon.statusChance !== undefined ? mon.statusChance : 0.35;
          if (mon.isSleepInflicting && target.hp > 0 && target.status === "ok" && rng() < resolveGuardStatusChance(target, getStatusEffectChance(target, sleepChance, { telemetry: state.combatFormulaTelemetry }), { isDefending, telemetry: state.combatFormulaTelemetry })) {
            applyStatusEffect(target, STATUS_EFFECT_IDS.SLEEP, { remainingTurns: 2, source: "monster" });
            recordCondition(mon, "睡眠を受けた");
            logQueue.push({
              msg: `[ 敵 ] [!] ${target.name}は眠りに落ちた！`,
              sound: "chest_trap"
            });
          }

          // Apply blind effect if monster is blinding and target survives
          const blindChance = mon.statusChance !== undefined ? mon.statusChance : 0.35;
          if (mon.isBlinding && !patternActive && target.hp > 0 && target.status === "ok" && rng() < resolveGuardStatusChance(target, getStatusEffectChance(target, blindChance, { telemetry: state.combatFormulaTelemetry }), { isDefending, telemetry: state.combatFormulaTelemetry })) {
            applyStatusEffect(target, STATUS_EFFECT_IDS.BLIND, { source: "monster" });
            recordCondition(mon, "盲目を受けた");
            logQueue.push({
              msg: `[ 敵 ] [!] ${mon.name}の放つ閃光により、${target.name}は盲目状態になった！`,
              sound: "chest_trap"
            });
          }
        }
      }

      if (target.hp === 0) {
        target.status = "dead";
        let deathCause = `${mon.name}の攻撃`;
        if (isSnipeAttack) {
          deathCause = `${mon.name}の狙撃`;
        } else if (mon.spell) {
          deathCause = `${mon.name}の${mon.spell}`;
        }
        const deathLog = recordCharDeath(state, target, deathCause, { type: "combat", source: mon.name });
        queueCharDeathLog(logQueue, deathLog);
        logQueue.push({ msg: `[ 敵 ] [!] ${target.name}は倒れた！` });
      }
      }
    } finally {
      if (measurement?.measurementCurrentEnemyAction === actionObservation) {
        delete measurement.measurementCurrentEnemyAction;
      }
      logQueue.slice(actionStart).forEach(entry => {
        if (!entry.groupId) entry.groupId = groupId;
      });
      actionObservations.push(actionObservation);
    }
  });

  recordQueuedPatternDeaths(state, monsters, measurement);

  tickMonsterBuffs(monsters, {
    onBleedingExpire: target => recordBleed("expired", target, { reason: "duration" }),
    onVulnerableExpire: target => recordVulnerableExpiry(state, target, measurement)
  });
  tickCharBuffs(state.party);
  state.party.forEach(char => {
    if (char.tempDefDown) char.tempDefDown = Math.max(0, char.tempDefDown - 1);
    if (char.magicVulnerableTurns) char.magicVulnerableTurns = Math.max(0, char.magicVulnerableTurns - 1);
    tickStatusEffects(char, {
      tickSleep: false,
      onBleedingExpire: target => recordBleed("expired", target, { reason: "duration" }),
      onVulnerableExpire: target => recordVulnerableExpiry(state, target, measurement)
    });
    if (char.antiHealTurns) char.antiHealTurns = Math.max(0, char.antiHealTurns - 1);
    if (char.mabarrierTurns) char.mabarrierTurns = Math.max(0, char.mabarrierTurns - 1);
  });

  const clearBlindStatuses = () => {
    state.party.forEach(char => {
      if (!hasStatusEffect(char, STATUS_EFFECT_IDS.BLIND)) return;
      removeStatusEffect(char, STATUS_EFFECT_IDS.BLIND);
      logQueue.push({ msg: `[味方] ${char.name}の盲目が戦闘終了で解けた。` });
    });
  };

  const clearVulnerableStatuses = reason => {
    monsters.forEach(monster => clearVulnerable(monster, reason));
  };

  if (escaped) {
    clearVulnerableStatuses("flee");
    clearBlindStatuses();
    return { logQueue, state, actionObservations };
  }

  let allMonstersDead = monsters.every(m => m.hp <= 0);
  if (!allMonstersDead) {
    // モンスターのターン終了時毒ダメージ
    monsters.forEach(m => {
      if (m.status === "poisoned" && m.hp > 0) {
        const pDmg = Math.floor(rng() * 3) + 2; // 2-4 damage
        m.hp = Math.max(0, m.hp - pDmg);
        logQueue.push({
          msg: `[ 敵 ] [!] 毒のダメージ！${m.name}は${pDmg}のダメージを受けた。`,
          presentationKind: COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_DEALT,
          sound: "hit",
          floatText: `${pDmg}`,
          floatColor: "#ff3b30"
        });
        if (m.hp === 0) {
          clearBleed(m, "defeat");
          clearVulnerable(m, "defeat");
          logQueue.push({
            msg: `[味方] [!] ${m.name}を毒で倒した！`,
            presentationKind: COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_DEALT
          });
          processMonsterDefeat(monsters, m, logQueue);
        }
      }
    });
    allMonstersDead = monsters.every(m => m.hp <= 0);
    recordQueuedPatternDeaths(state, monsters, measurement);
  }

  const allPartyDeadNow = state.party.every(c => c.status === "dead");

  if (allPartyDeadNow) {
    // 相互全滅：最後の敵と味方全員が同一ラウンドで倒れた場合、勝利より全滅を優先する。
    // 勝利報酬(endCombat)を出すと checkCombatStatus に届く前に戦闘が「勝利」で終わり、
    // ゲームオーバーが発火しない。報酬はスキップし、後段の checkCombatStatus に委ねる。
    clearVulnerableStatuses("death");
  } else if (allMonstersDead) {
    clearVulnerableStatuses("defeat");
    applyCombatRewards(state, monsters, logQueue, rng, policy);
    clearBlindStatuses();
  } else {
    // Combat round end poison damage
    state.party.forEach(c => {
      if (c.status === "poisoned" && c.hp > 0) {
        const pDmg = Math.floor(rng() * 3) + 2; // 2-4 damage
        const playerHpBefore = c.hp;
        c.hp = Math.max(0, c.hp - pDmg);
        recordReceivedDamage(state, c, "poison", pDmg, pDmg, playerHpBefore, {
          attackType: "other", measurement
        });
        logQueue.push({
          msg: `[味方] [!] 毒のダメージ！${c.name}は${pDmg}のダメージを受けた。`,
          presentationKind: COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_TAKEN,
          sound: "hit",
          floatText: `${pDmg}`,
          floatColor: "#ff3b30"
        });
        if (c.hp === 0) {
          c.status = "dead";
          const deathLog = recordCharDeath(state, c, "毒のダメージ", { type: "status", source: "毒" });
          queueCharDeathLog(logQueue, deathLog);
          logQueue.push({
            msg: `[味方] [!] ${c.name}は毒で力尽きた！`,
            presentationKind: COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_TAKEN
          });
        }
      }
    });

    state.combatState.allParalyzedTurns = 0;
  }

  state.combatState.roundNumber = roundNumber + 1;
  state.party.forEach(char => {
    delete char.combatLastSurvivor;
    delete char.combatFirstStrikeActive;
    delete char.combatFloor;
  });
  return { logQueue, state, actionObservations };
}
