export const HISTORY_LIMIT = 20;

export const createDefaultRecords = () => ({
  deepestRetreat: 0,
  deepestDeath: 0,
  deepestByClass: {},
  totalRuns: 0,
  personalBests: {
    deepestFloor: 0,
    kills: 0,
    chestsOpened: 0,
    lootCount: 0,
    goldEarned: 0
  },
  adventureStats: {
    reachedB5: 0,
    brokeB5: 0,
    reachedB10: 0,
    floorDistribution: {
      "B1-B4": 0,
      B5: 0,
      "B6-B9": 0,
      "B10+": 0
    }
  },
  firstAchievements: [],
  deathCauses: []
});

function toCount(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function normalizeFloorDistribution(distribution = {}) {
  return {
    "B1-B4": toCount(distribution["B1-B4"]),
    B5: toCount(distribution.B5),
    "B6-B9": toCount(distribution["B6-B9"]),
    "B10+": toCount(distribution["B10+"])
  };
}

function normalizeAchievement(entry) {
  if (!entry || typeof entry !== "object") return null;
  if (typeof entry.id !== "string") return null;
  return {
    id: entry.id,
    ...(typeof entry.label === "string" ? { label: entry.label } : {}),
    runNumber: toCount(entry.runNumber),
    floor: toCount(entry.floor),
    recordedAt: toCount(entry.recordedAt)
  };
}

function normalizeDeathCause(entry) {
  if (!entry || typeof entry !== "object") return null;
  if (typeof entry.type !== "string" || typeof entry.source !== "string") return null;
  return {
    floor: Math.max(1, toCount(entry.floor)),
    type: entry.type,
    source: entry.source,
    count: toCount(entry.count)
  };
}

export function normalizeRecords(records = {}, options = {}) {
  const legacy = {
    deepestRetreat: Math.max(0, Math.floor(Number(records.deepestRetreat) || 0)),
    deepestDeath: Math.max(0, Math.floor(Number(records.deepestDeath) || 0)),
    deepestByClass: Object.fromEntries(Object.entries(records.deepestByClass || {}).map(([className, floor]) => [
      className,
      Math.max(0, Math.floor(Number(floor) || 0))
    ])),
    totalRuns: Math.max(0, Math.floor(Number(records.totalRuns) || 0)),
  };
  const includeAdventure = options.includeAdventure === true || [
    "personalBests", "adventureStats", "firstAchievements", "deathCauses"
  ].some(key => Object.hasOwn(records, key));
  if (!includeAdventure) return legacy;
  return {
    ...legacy,
    personalBests: {
      deepestFloor: toCount(records.personalBests?.deepestFloor),
      kills: toCount(records.personalBests?.kills),
      chestsOpened: toCount(records.personalBests?.chestsOpened),
      lootCount: toCount(records.personalBests?.lootCount),
      goldEarned: toCount(records.personalBests?.goldEarned)
    },
    adventureStats: {
      reachedB5: toCount(records.adventureStats?.reachedB5),
      brokeB5: toCount(records.adventureStats?.brokeB5),
      reachedB10: toCount(records.adventureStats?.reachedB10),
      floorDistribution: normalizeFloorDistribution(records.adventureStats?.floorDistribution)
    },
    firstAchievements: (Array.isArray(records.firstAchievements) ? records.firstAchievements : [])
      .map(normalizeAchievement)
      .filter(Boolean),
    deathCauses: (Array.isArray(records.deathCauses) ? records.deathCauses : [])
      .map(normalizeDeathCause)
      .filter(Boolean)
  };
}

function getFloorBucket(depth) {
  if (depth <= 4) return "B1-B4";
  if (depth === 5) return "B5";
  if (depth <= 9) return "B6-B9";
  return "B10+";
}

function addFirstAchievement(records, id, label, runNumber, floor, updates, milestones) {
  if (records.firstAchievements.some(entry => entry.id === id)) return;
  records.firstAchievements.push({
    id,
    runNumber,
    floor,
    recordedAt: Date.now()
  });
  updates.push(label);
  milestones.push(id);
}

function updateDeathCause(records, run) {
  const death = run?.deathLogs?.at(-1);
  if (!death?.type || !death?.source) return;
  const floor = Math.max(1, toCount(death.floor || run.deepestFloor));
  const source = String(death.source);
  const type = String(death.type);
  const existing = records.deathCauses.find(entry => (
    entry.floor === floor && entry.type === type && entry.source === source
  ));
  if (existing) {
    existing.count++;
  } else {
    records.deathCauses.push({ floor, type, source, count: 1 });
  }
}

export function finalizeRunRecords(records, run, outcome, className) {
  const next = normalizeRecords(records, { includeAdventure: true });
  const depth = Math.max(1, Math.floor(Number(run?.deepestFloor) || 1));
  const runNumber = next.totalRuns + 1;
  const updates = [];
  const milestones = [];
  const outcomeKey = outcome === "death"
    ? "deepestDeath"
    : outcome === "abandon"
      ? null
      : "deepestRetreat";

  if (outcomeKey && depth > next[outcomeKey]) {
    next[outcomeKey] = depth;
    updates.push(outcome === "death" ? "死亡最深" : "撤退最深");
  }
  if (className && depth > (next.deepestByClass[className] || 0)) {
    next.deepestByClass[className] = depth;
    updates.push(`${className}最深`);
  }

  const bests = next.personalBests;
  const runKills = toCount(run?.kills);
  const runChests = toCount(run?.chestsOpened);
  const runGold = toCount(run?.goldEarned ?? run?.gold);
  const runLoot = toCount(run?.lootCount ?? Object.values(run?.materials || {})
    .reduce((sum, quantity) => sum + toCount(quantity), 0));
  const bestUpdates = [
    ["deepestFloor", depth, "最深到達記録"],
    ["kills", runKills, "最多撃破記録"],
    ["chestsOpened", runChests, "最多宝箱記録"],
    ["lootCount", runLoot, "最大戦利品記録"],
    ["goldEarned", runGold, "最大Gold記録"]
  ];
  bestUpdates.forEach(([key, value, label]) => {
    if (value > bests[key]) {
      bests[key] = value;
      updates.push(label);
    }
  });

  const stats = next.adventureStats;
  if (depth >= 5) stats.reachedB5++;
  if (depth > 5) stats.brokeB5++;
  if (depth >= 10) stats.reachedB10++;
  stats.floorDistribution[getFloorBucket(depth)]++;

  if (depth >= 5) addFirstAchievement(next, "first_b5_reached", "初めてB5Fへ到達", runNumber, depth, updates, milestones);
  if (depth > 5) addFirstAchievement(next, "first_b5_broken", "初めてB5Fを突破", runNumber, depth, updates, milestones);
  if (depth >= 10) addFirstAchievement(next, "first_b10_reached", "初めてB10Fへ到達", runNumber, depth, updates, milestones);
  updateDeathCause(next, run);

  next.totalRuns = runNumber;
  return {
    records: next,
    updated: updates.length > 0 || milestones.length > 0,
    updates,
    milestones,
    runNumber,
    depth,
    outcome,
    className,
    personalBestUpdates: bestUpdates
      .filter(([key, value]) => value > 0 && value === bests[key])
      .map(([, , label]) => label)
  };
}
