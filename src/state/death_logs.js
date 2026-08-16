export const DEATH_TYPES = Object.freeze({
  COMBAT: "combat",
  TRAP: "trap",
  STATUS: "status"
});

export const DEATH_TYPE_LABELS = Object.freeze({
  combat: "戦闘",
  trap: "罠",
  status: "状態異常"
});

export function normalizeDeathSource(source) {
  return String(source || "").replace(/\s[A-Z]$/, "");
}

export function summarizeDeathLogs(deathLogs = []) {
  const groups = new Map();

  (Array.isArray(deathLogs) ? deathLogs : []).forEach(log => {
    if (!log?.type || !log?.source || !Number.isFinite(Number(log.floor))) return;

    const floor = Math.max(1, Math.floor(Number(log.floor)));
    const type = String(log.type);
    const source = normalizeDeathSource(log.source);
    const key = `${floor}\u0000${type}\u0000${source}`;
    const current = groups.get(key);
    if (current) {
      current.count++;
      return;
    }

    groups.set(key, {
      floor,
      type,
      source,
      cause: log.cause || source,
      count: 1
    });
  });

  return [...groups.values()].sort((a, b) => (
    b.count - a.count ||
    b.floor - a.floor ||
    a.source.localeCompare(b.source, "ja")
  ));
}
