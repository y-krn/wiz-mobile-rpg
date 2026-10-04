// Weapon technique availability, cooldown and Core hooks (Build vNext, #1801).
// Techniques are available during any active run.
import { TECHNIQUE_BY_PROFILE, TELEGRAPH_FLAGS } from "../data/techniques.js";
import { getWeaponBehaviorProfile } from "../data/weapon_behavior_profiles.js";
import { getCharCoreParams } from "./affix_rules.js";
import { getCharMaxHp } from "./character_stats.js";

export function isBuildVNextRun(stateLike) {
  return Boolean(stateLike?.currentRun);
}

export function getCharTechnique(char, stateLike) {
  if (!char || !isBuildVNextRun(stateLike)) return null;
  const profileId = getWeaponBehaviorProfile(char)?.id;
  return TECHNIQUE_BY_PROFILE[profileId] || null;
}

export function getTechniqueCooldownLength(char, technique) {
  if (!technique) return 0;
  const hone = getCharCoreParams(char, "CORE_TECH_HONE");
  return Math.max(1, technique.cooldown - (hone?.cooldownReduction || 0));
}

function getCooldownMap(combatState) {
  if (!combatState) return {};
  if (!combatState.techniqueCooldowns || typeof combatState.techniqueCooldowns !== "object") {
    combatState.techniqueCooldowns = {};
  }
  return combatState.techniqueCooldowns;
}

export function getTechniqueRemaining(combatState, actorIdx) {
  const value = Number(getCooldownMap(combatState)[actorIdx]);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function getTechniqueHpCost(char) {
  const blood = getCharCoreParams(char, "CORE_BLOOD_TECH");
  if (!blood) return null;
  return Math.max(1, Math.ceil(getCharMaxHp(char) * blood.maxHpShare));
}

// Player-facing status for the combat button.
export function getTechniqueStatus(stateLike, actorIdx) {
  const char = stateLike?.party?.[actorIdx];
  const technique = getCharTechnique(char, stateLike);
  if (!technique) return { technique: null, available: false, remaining: 0, hpCost: null };
  const remaining = getTechniqueRemaining(stateLike.combatState, actorIdx);
  if (remaining <= 0) return { technique, available: true, remaining: 0, hpCost: null };
  const hpCost = getTechniqueHpCost(char);
  const available = hpCost !== null && char.hp > hpCost;
  return { technique, available, remaining, hpCost: available ? hpCost : null };
}

// Called when the technique resolves: pays the Blood cost if it was used
// early and starts the cooldown (the round-end tick consumes one step).
export function commitTechniqueUse(stateLike, actorIdx) {
  const char = stateLike.party[actorIdx];
  const technique = getCharTechnique(char, stateLike);
  if (!technique) return { ok: false, hpPaid: 0 };
  const map = getCooldownMap(stateLike.combatState);
  let hpPaid = 0;
  if (getTechniqueRemaining(stateLike.combatState, actorIdx) > 0) {
    const cost = getTechniqueHpCost(char);
    if (cost === null || char.hp <= cost) return { ok: false, hpPaid: 0 };
    char.hp -= cost;
    hpPaid = cost;
  }
  map[actorIdx] = getTechniqueCooldownLength(char, technique) + 1;
  return { ok: true, hpPaid, technique };
}

export function tickTechniqueCooldowns(combatState) {
  const map = getCooldownMap(combatState);
  Object.keys(map).forEach(key => {
    map[key] = Math.max(0, (Number(map[key]) || 0) - 1);
  });
}

export function resetTechniqueCooldown(combatState, actorIdx) {
  getCooldownMap(combatState)[actorIdx] = 0;
}

export function isTelegraphing(monster) {
  return Boolean(monster) && TELEGRAPH_FLAGS.some(flag => Boolean(monster[flag]));
}

export function clearTelegraph(monster) {
  const cleared = TELEGRAPH_FLAGS.filter(flag => Boolean(monster?.[flag]));
  cleared.forEach(flag => {
    if (flag === "statusPayoffQueued") delete monster[flag];
    else monster[flag] = false;
  });
  return cleared;
}

// One-shot outgoing multipliers stored on the character for this encounter.
// They are cleared when the combat ends (see clearTechniqueCombatFlags).
export function takeNextAttackMultiplier(char, { technique = false } = {}) {
  let multiplier = 1;
  if (!technique && char.techChainReady) {
    multiplier *= getCharCoreParams(char, "CORE_TECH_CHAIN")?.nextAttackMultiplier || 1;
    char.techChainReady = false;
  }
  if (char.riposteReady) {
    multiplier *= getCharCoreParams(char, "CORE_GUARD_RIPOSTE")?.nextAttackMultiplier || 1;
    char.riposteReady = false;
  }
  return multiplier;
}

export function onTechniqueResolved(char) {
  if (getCharCoreParams(char, "CORE_TECH_CHAIN")) char.techChainReady = true;
}

export function onGuardChosen(stateLike, char, actorIdx) {
  if (!isBuildVNextRun(stateLike) || !getCharCoreParams(char, "CORE_GUARD_RIPOSTE")) return false;
  resetTechniqueCooldown(stateLike.combatState, actorIdx);
  char.riposteReady = true;
  return true;
}

export function getTechniqueDamageMultiplier(char) {
  return getCharCoreParams(char, "CORE_TECH_HONE")?.damageMultiplier || 1;
}

export function clearTechniqueCombatFlags(party) {
  (party || []).forEach(char => {
    if (!char) return;
    delete char.techChainReady;
    delete char.riposteReady;
    delete char.focusSpellMultiplier;
  });
}
