import { trackVulnerableEvent } from "../telemetry.js";
import {
  applyStatusEffect,
  applyVulnerableDamage,
  clearVulnerableStatus,
  hasStatusEffect,
  STATUS_EFFECT_IDS,
  VULNERABLE_DAMAGE_MULTIPLIER,
  VULNERABLE_DURATION_TURNS
} from "./status_effects.js";

function ensureVulnerableTelemetry(measurement) {
  if (!measurement) return null;
  measurement.vulnerable ||= {
    attempts: 0,
    applied: 0,
    refresh: 0,
    resisted: 0,
    consumed: 0,
    expired: 0,
    damageContribution: 0,
    latencyTurns: [],
    qualifyingHitTypes: {},
    sources: {},
  };
  return measurement.vulnerable;
}

export function recordVulnerableEvent(state, event, target, metadata = {}, measurement = null) {
  const vulnerable = ensureVulnerableTelemetry(measurement);
  if (vulnerable) {
    const counterKey = event === "attempt" ? "attempts" : event;
    vulnerable[counterKey] = (vulnerable[counterKey] || 0) + 1;
    if (metadata.damageContribution) {
      vulnerable.damageContribution = (vulnerable.damageContribution || 0) + metadata.damageContribution;
    }
    if (Number.isFinite(metadata.latencyTurns)) vulnerable.latencyTurns.push(metadata.latencyTurns);
    if (metadata.qualifyingHitType) {
      vulnerable.qualifyingHitTypes[metadata.qualifyingHitType] =
        (vulnerable.qualifyingHitTypes[metadata.qualifyingHitType] || 0) + 1;
    }
    if (metadata.source) {
      vulnerable.sources[metadata.source] = (vulnerable.sources[metadata.source] || 0) + 1;
    }
    if (target?.isBoss || state?.combatState?.isBoss) vulnerable.bossEvents = (vulnerable.bossEvents || 0) + 1;
    if (target?.isMidboss || state?.combatState?.isMidboss) vulnerable.midbossEvents = (vulnerable.midbossEvents || 0) + 1;
  }

  trackVulnerableEvent(event, {
    floor: state?.floor,
     character: state?.party?.[0],
    enemyId: target?.name,
    isBoss: Boolean(target?.isBoss || state?.combatState?.isBoss),
    isMidboss: Boolean(target?.isMidboss || state?.combatState?.isMidboss),
    remainingTurns: target?.statusEffects?.[STATUS_EFFECT_IDS.VULNERABLE]?.remainingTurns,
    multiplier: state?.vulnerableDamageMultiplier ?? VULNERABLE_DAMAGE_MULTIPLIER,
    ...metadata
  });
}

export function tryApplyVulnerable(caster, target, state, logQueue, measurement = null) {
  if (!target || target.hp <= 0) return false;
  const alreadyVulnerable = hasStatusEffect(target, STATUS_EFFECT_IDS.VULNERABLE);
  recordVulnerableEvent(state, "attempt", target, {
    source: "VULNERA",
    buildKey: "VULNERA"
  }, measurement);
  applyStatusEffect(target, STATUS_EFFECT_IDS.VULNERABLE, {
    remainingTurns: VULNERABLE_DURATION_TURNS,
    stacks: 1,
    source: "VULNERA"
  });
  const event = alreadyVulnerable ? "refresh" : "applied";
  recordVulnerableEvent(state, event, target, {
    source: "VULNERA",
    buildKey: "VULNERA"
  }, measurement);
  logQueue?.push({
    msg: alreadyVulnerable
      ? `[味方] ${caster.name}のヴルネラが${target.name}の脆弱を更新した！（あと${VULNERABLE_DURATION_TURNS}回）`
      : `[味方] [!] ${target.name}は脆弱になった！（あと${VULNERABLE_DURATION_TURNS}回、次の直接攻撃で増幅）`,
    sound: "cast_spell",
    vulnerable: event
  });
  return true;
}

export function consumeVulnerableDamage(target, damage, state, qualifyingHitType, measurement = null) {
  const result = applyVulnerableDamage(target, damage, {
    multiplier: state?.vulnerableDamageMultiplier ?? VULNERABLE_DAMAGE_MULTIPLIER
  });
  if (!result.consumed) return result;
  recordVulnerableEvent(state, "consumed", target, {
    source: result.source || "VULNERA",
    buildKey: "VULNERA",
    qualifyingHitType,
    damageContribution: result.damageContribution,
    directDamage: damage,
    latencyTurns: result.latencyTurns
  }, measurement);
  return result;
}

export function recordVulnerableExpiry(state, target, measurement = null) {
  recordVulnerableEvent(state, "expired", target, {
    reason: "duration",
    source: target?.statusEffects?.[STATUS_EFFECT_IDS.VULNERABLE]?.source || "VULNERA",
    buildKey: "VULNERA"
  }, measurement);
}

export function clearVulnerableOnDefeat(state, target, reason, measurement = null) {
  if (!clearVulnerableStatus(target)) return;
  recordVulnerableEvent(state, "cleared", target, {
    reason,
    source: "VULNERA",
    buildKey: "VULNERA"
  }, measurement);
}
