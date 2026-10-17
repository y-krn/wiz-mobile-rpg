import { GUARD_PROFILES, UNIVERSAL_GUARD_PROFILE_ID } from "../data/guard_profiles.js";
import { getItemData } from "./item_rules.js";

function getEquippedShield(char) {
  return getItemData(char?.equipment?.shield);
}

export function getGuardProfile(char) {
  const shield = getEquippedShield(char);
  const profileId = shield?.guardProfile || UNIVERSAL_GUARD_PROFILE_ID;
  return GUARD_PROFILES[profileId] || GUARD_PROFILES[UNIVERSAL_GUARD_PROFILE_ID];
}

export function getGuardProfileId(char) {
  return getGuardProfile(char).id;
}

function getAttackType({ attackType, spell = false, dragon = false } = {}) {
  if (attackType) return attackType;
  if (dragon) return "breath";
  if (spell) return "spell";
  return "physical";
}

/**
 * Resolve the active 防御 verb for every incoming damage path.
 * `baseMultiplier` preserves a special attack's explicit stronger/weaker
 * guard rule while still letting the equipped shield improve it.
 */
export function resolveGuardMitigation(
  char,
  damage,
  { isDefending = false, attackType, spell = false, dragon = false, baseMultiplier = null, telemetry = null } = {}
) {
  const rawDamage = Number(damage);
  if (!Number.isFinite(rawDamage)) return 1;
  // A technique stance (守り打ち, 捨て身; #2135) scales every incoming hit
  // until it runs out, whether or not the character also guards.
  const stance = char?.techStance;
  const stanceMultiplier = stance && stance.turnsLeft > 0 ? Number(stance.incomingDamageMultiplier) || 1 : 1;
  const numericDamage = stanceMultiplier === 1 ? rawDamage : Math.max(1, Math.round(rawDamage * stanceMultiplier));
  if (!isDefending) return Math.max(1, numericDamage);

  const profile = getGuardProfile(char);
  const type = getAttackType({ attackType, spell, dragon });
  const profileMultiplier = Number(
    profile.damageMultipliers[type] ?? profile.damageMultipliers.special ?? 0.5
  );
  const explicitMultiplier = baseMultiplier === null || baseMultiplier === undefined
    ? null
    : Number(baseMultiplier);
  const multiplier = Number.isFinite(explicitMultiplier)
    ? Math.min(profileMultiplier, explicitMultiplier)
    : profileMultiplier;
  const resolvedDamage = Math.max(1, Math.round(numericDamage * multiplier));
  if (telemetry && isDefending && resolvedDamage < numericDamage) {
    telemetry.mitigations ||= [];
    telemetry.mitigations.push({
      type: "guardAction",
      attackType: type,
      before: numericDamage,
      after: resolvedDamage,
      reduction: numericDamage - resolvedDamage
    });
  }
  return resolvedDamage;
}

export function resolveGuardStatusChance(
  char,
  baseChance,
  { isDefending = false, telemetry = null } = {}
) {
  const chance = Number(baseChance);
  const normalizedChance = Number.isFinite(chance) ? Math.max(0, Math.min(1, chance)) : 0;
  if (!isDefending) return normalizedChance;
  const resolvedChance = Math.max(0, Math.min(1, normalizedChance * getGuardProfile(char).statusChanceMultiplier));
  if (telemetry && resolvedChance < normalizedChance) {
    telemetry.statusMitigations ||= [];
    telemetry.statusMitigations.push({
      type: "guardStatus",
      before: normalizedChance,
      after: resolvedChance,
      reduction: normalizedChance - resolvedChance
    });
  }
  return resolvedChance;
}
