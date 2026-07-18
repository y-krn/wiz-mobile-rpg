export const createDefaultRecords = () => ({
  deepestRetreat: 0,
  deepestDeath: 0,
  deepestByClass: {},
  totalRuns: 0
});

export function normalizeRecords(records = {}) {
  return {
    deepestRetreat: Math.max(0, Math.floor(Number(records.deepestRetreat) || 0)),
    deepestDeath: Math.max(0, Math.floor(Number(records.deepestDeath) || 0)),
    deepestByClass: Object.fromEntries(Object.entries(records.deepestByClass || {}).map(([className, floor]) => [
      className,
      Math.max(0, Math.floor(Number(floor) || 0))
    ])),
    totalRuns: Math.max(0, Math.floor(Number(records.totalRuns) || 0))
  };
}

export function finalizeRunRecords(records, run, outcome, className) {
  const next = normalizeRecords(records);
  const depth = Math.max(1, Math.floor(Number(run?.deepestFloor) || 1));
  const updates = [];
  const outcomeKey = outcome === "death" ? "deepestDeath" : "deepestRetreat";

  if (depth > next[outcomeKey]) {
    next[outcomeKey] = depth;
    updates.push(outcome === "death" ? "死亡最深" : "撤退最深");
  }
  if (className && depth > (next.deepestByClass[className] || 0)) {
    next.deepestByClass[className] = depth;
    updates.push(`${className}最深`);
  }
  next.totalRuns++;
  return { records: next, updated: updates.length > 0, updates, depth, outcome, className };
}
