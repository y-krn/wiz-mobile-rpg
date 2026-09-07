// balance-impact: none — combat result presentation only; resolution remains in combat_logic.
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

const IMPORTANT_COMBAT_RESULT_RE = /反射|効かな|無効|状態異常|毒状態|毒に|毒が消え|盲目|麻痺|睡眠|出血|脆弱|耐性|弱点|レジスト|倒れた|倒した|力尽きた|撃破|逃走|逃げ|MP不足|かわした|回避|空振り|動けない|庇った|怯んだ|沈黙|呪い|防毒|守りが崩|魔法に弱く/;

export function isImportantCombatResult(message) {
  return typeof message === "string" && IMPORTANT_COMBAT_RESULT_RE.test(message);
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

export function formatCombatLogMessage(message) {
  if (typeof message !== "string") return message;
  const side = message.match(/^\[(味方|\s*敵\s*)\]/)?.[1]?.trim();
  let text = stripPresentationMarkers(message);

  if (side === "味方") {
    text = text.replace(/^(.+?)の攻撃！(.+?)に(\d+)のダメージ[。！]$/, "$2を斬りつけた。$3ダメージ。");
  } else if (side === "敵") {
    text = text.replace(/^(.+?)の攻撃！(.+?)に(\d+)のダメージ[。！]$/, "$1の一撃を受けた。$3ダメージ。");
  }

  return text.replace(/^(.+?)は身を固めて防御している。$/, "$1は身を固め、次の一撃に備えた。");
}

function mergeEntries(entries) {
  const first = entries[0];
  const merged = { ...first };
  const messages = entries
    .map(entry => formatCombatLogMessage(entry.msg))
    .filter(Boolean);
  if (messages.length > 0) merged.msg = messages.join(" ");
  entries.slice(1).forEach(entry => {
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
    const previous = grouped[grouped.length - 1];
    if (entry?.groupId && previous?.groupId === entry.groupId) {
      const entries = previous.effects || [previous];
      grouped[grouped.length - 1] = mergeEntries([...entries, entry]);
      return;
    }
    grouped.push({ ...entry, msg: formatCombatLogMessage(entry?.msg) });
  });
  return grouped;
}
