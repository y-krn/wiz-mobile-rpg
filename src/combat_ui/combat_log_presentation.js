// balance-impact: none — combat result presentation only; resolution remains in combat_logic.
import {
  COMBAT_LOG_PRESENTATION_KINDS,
  normalizeCombatLogPresentationKind,
  mergeCombatLogPresentationKinds
} from "../combat_log_semantics.js";

export { COMBAT_LOG_PRESENTATION_KINDS };
export const COMBAT_LOG_DELAYS = Object.freeze({
  normal: 500,
  important: 850,
  transition: 750,
  chest: 950,
  milestone: 1900
});

const AUTO_DELAYS = Object.freeze({
  normal: 50,
  important: 50,
  transition: 150,
  chest: 150,
  milestone: 300
});

export const COMBAT_LOG_SIDES = Object.freeze({
  ALLY: "ally",
  ENEMY: "enemy",
  NEUTRAL: "neutral"
});

const IMPORTANT_COMBAT_RESULT_RE = /反射|効かな|無効|状態異常|毒状態|毒に|毒が消え|盲目|麻痺|睡眠|出血|脆弱|耐性|弱点|レジスト|倒れた|倒した|力尽きた|撃破|逃走|逃げ|MP不足|かわした|回避|空振り|動けない|庇った|怯んだ|沈黙|呪い|防毒|守りが崩|魔法に弱く/;

export function isImportantCombatResult(message) {
  return typeof message === "string" && IMPORTANT_COMBAT_RESULT_RE.test(message);
}

export function getCombatLogSide(message) {
  if (typeof message !== "string") return COMBAT_LOG_SIDES.NEUTRAL;
  if (/^\[味方\]/.test(message)) return COMBAT_LOG_SIDES.ALLY;
  if (/^\[\s*敵\s*\]/.test(message)) return COMBAT_LOG_SIDES.ENEMY;
  return COMBAT_LOG_SIDES.NEUTRAL;
}

function normalizeCombatLogEntry(entry) {
  const normalizedSide = Object.values(COMBAT_LOG_SIDES).includes(entry?.side)
    ? entry.side
    : getCombatLogSide(entry?.msg);
  const hasExplicitPresentationKind = Object.values(COMBAT_LOG_PRESENTATION_KINDS)
    .includes(entry?.presentationKind);
  const presentationKind = hasExplicitPresentationKind
    ? normalizeCombatLogPresentationKind(entry.presentationKind)
    : normalizedSide === COMBAT_LOG_SIDES.ALLY
      ? COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_DEALT
      : normalizedSide === COMBAT_LOG_SIDES.ENEMY
        ? COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_TAKEN
        : COMBAT_LOG_PRESENTATION_KINDS.NEUTRAL;
  return {
    ...entry,
    side: normalizedSide,
    presentationKind
  };
}

function mergeCombatLogSides(entries) {
  const sides = new Set(entries.map(entry => entry.side).filter(side => side !== COMBAT_LOG_SIDES.NEUTRAL));
  return sides.size === 1 ? [...sides][0] : COMBAT_LOG_SIDES.NEUTRAL;
}

export function getCombatLogPace(entry) {
  if (entry?.pace && ["normal", "important", "transition", "chest", "milestone"].includes(entry.pace)) {
    return entry.pace;
  }
  if (entry?.milestoneVictory || entry?.giveKey) return "milestone";
  if (entry?.triggerChest) return "chest";
  if (entry?.runEscape || entry?.escapeToTown || entry?.fleeCombat || entry?.endCombat) return "transition";
  return isImportantCombatResult(entry?.msg) ? "important" : "normal";
}

export function getCombatLogDelay(entry, { isAuto = false } = {}) {
  const pace = getCombatLogPace(entry);
  return (isAuto ? AUTO_DELAYS : COMBAT_LOG_DELAYS)[pace];
}

function stripPresentationMarkers(message) {
  return String(message ?? "")
    .replace(/^\[(?:味方|\s*敵\s*)\]\s*/, "")
    .replace(/^\[(?:!|★)\]\s*/, "")
    .replace(/\s+$/, "");
}

export function formatCombatLogMessage(message, semantic = COMBAT_LOG_PRESENTATION_KINDS.NEUTRAL) {
  if (typeof message !== "string") return message;
  let text = stripPresentationMarkers(message);
  const presentationKind = semantic === COMBAT_LOG_SIDES.ALLY
    ? COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_DEALT
    : semantic === COMBAT_LOG_SIDES.ENEMY
      ? COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_TAKEN
      : normalizeCombatLogPresentationKind(semantic);

  if (presentationKind === COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_DEALT) {
    text = text.replace(/^(.+?)の攻撃！(.+?)に(\d+)のダメージ[。！]$/, "$2に一撃を加えた。$3ダメージ。");
  } else if (presentationKind === COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_TAKEN) {
    text = text.replace(/^(.+?)の攻撃！(.+?)に(\d+)のダメージ[。！]$/, "$1の一撃を受けた。$3ダメージ。");
  }

  return text.replace(/^(.+?)は身を固めて防御している。$/, "$1は身を固め、次の一撃に備えた。");
}

function mergeEntries(entries) {
  const normalizedEntries = entries.map(normalizeCombatLogEntry);
  const first = normalizedEntries[0];
  const merged = { ...first };
  const messages = normalizedEntries
    .map(entry => formatCombatLogMessage(entry.msg, entry.side))
    .filter(Boolean);
  if (messages.length > 0) merged.msg = messages.join(" ");
  merged.side = mergeCombatLogSides(normalizedEntries);
  merged.presentationKind = mergeCombatLogPresentationKinds(normalizedEntries);
  normalizedEntries.slice(1).forEach(entry => {
    ["runEscape", "escapeToTown", "fleeCombat", "milestoneVictory", "giveKey", "triggerChest", "endCombat"]
      .forEach(flag => {
        if (entry[flag]) merged[flag] = entry[flag];
      });
  });
  merged.effects = entries;
  return merged;
}

export function groupCombatLogEntries(queue) {
  if (!Array.isArray(queue)) return [];
  const grouped = [];
  queue.forEach(entry => {
    const normalizedEntry = normalizeCombatLogEntry(entry);
    const previous = grouped[grouped.length - 1];
    if (normalizedEntry?.groupId && previous?.groupId === normalizedEntry.groupId) {
      const entries = previous.effects || [previous];
      grouped[grouped.length - 1] = mergeEntries([...entries, normalizedEntry]);
      return;
    }
    grouped.push({
      ...normalizedEntry,
      msg: formatCombatLogMessage(normalizedEntry.msg, normalizedEntry.side)
    });
  });
  return grouped;
}
