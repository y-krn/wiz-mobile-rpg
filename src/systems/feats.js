// balance-impact: none — feat progress, completion, and one-time rewards
// (#2007). Feats replace the run quests; they never change a combat, drop, or
// generation rule.

import { FEATS, FEAT_BY_ID } from "../data/feats.js";
import {
  createDefaultFeatsState,
  normalizeAnnouncedFeatIds,
  normalizeFeatCounters,
  normalizeFeatsState
} from "../state/feats_state.js";
import { STARTING_KIT_IDS } from "../state/starting_kit.js";
import { normalizeCompanions } from "../state/facilities_state.js";
import { COMPANIONS } from "../data/facilities.js";

const count = value => Math.max(0, Math.floor(Number(value) || 0));

/**
 * Count role-carrying defeats on the run. Feats read these totals at the end
 * of the run (and live, for the progress shown during it).
 */
export function recordRoleDefeats(run, monsters, increment = 1) {
  if (!run) return;
  const defeatsByRole = run.defeatsByRole ||= {};
  (Array.isArray(monsters) ? monsters : [])
    .filter(monster => monster && !monster.fled && !monster.hasSplit)
    .forEach(monster => {
      if (!monster.role) return;
      defeatsByRole[monster.role] = (defeatsByRole[monster.role] || 0) + increment;
    });
}

/**
 * Add what a run did to the stored counters. `outcome` is only needed for the
 * safe-return count; pass null while the run is still going.
 */
export function addRunToFeatCounters(counters, run, outcome = null) {
  const next = normalizeFeatCounters(counters);
  if (!run) return next;
  const deepest = count(run.deepestFloor);
  const startedAtTop = count(run.startFloor) <= 1;
  next.bestDepth = Math.max(next.bestDepth, deepest);
  const defeatedMilestones = Array.isArray(run.defeatedMilestones) ? run.defeatedMilestones : [];
  next.guardianDepth = defeatedMilestones.reduce(
    (deepestGuardian, floor) => Math.max(deepestGuardian, count(floor)),
    next.guardianDepth
  );
  next.elitesKilled += count(run.elitesKilled);
  next.disruptorsKilled += count(run.defeatsByRole?.disruptor);
  next.amplifiersKilled += count(run.defeatsByRole?.amplifier);
  next.chestsOpened += count(run.chestsOpened);
  if (outcome === "retreat") {
    next.safeReturns += 1;
    // A companion is rescued only by walking out: the Portal or the Wing.
    normalizeCompanions(run.companions).forEach(companionId => {
      next[COMPANIONS[companionId].counterKey] = 1;
    });
  }
  // Starting from a milestone floor would hand these out for free, so only
  // descents from B1F count.
  if (startedAtTop) {
    if (count(run.trapsTriggered) === 0) next.traplessDepth = Math.max(next.traplessDepth, deepest);
    if (STARTING_KIT_IDS.includes(run.startingKit)) {
      next.kitDepths[run.startingKit] = Math.max(next.kitDepths[run.startingKit], deepest);
    }
  }
  return next;
}

/** Progress of one feat against a set of counters. */
export function getFeatProgress(feat, counters) {
  const metric = feat.metric;
  let current = 0;
  if (metric.kind === "counter") {
    current = count(counters?.[metric.key]);
  } else if (metric.kind === "kits") {
    current = STARTING_KIT_IDS.filter(kitId => count(counters?.kitDepths?.[kitId]) >= metric.minDepth).length;
  }
  const target = metric.target;
  const capped = Math.min(current, target);
  return { current: capped, target, ratio: target > 0 ? capped / target : 0, done: current >= target };
}

/**
 * "B3F / B5F" for depths, "3 / 5" for counts. A rescue reads as a state; pass
 * the running run to show that the person is being led out right now.
 */
export function formatFeatProgress(feat, progress, run = null) {
  if (feat.metric.unit === "rescue") {
    if (progress.current >= progress.target) return "救出";
    return run && !run.returnReason && normalizeCompanions(run.companions).includes(feat.metric.companion)
      ? "同行中"
      : "未救出";
  }
  if (feat.metric.unit === "floor") {
    return `${progress.current > 0 ? `B${progress.current}F` : "未到達"} / B${progress.target}F`;
  }
  return `${progress.current} / ${progress.target}`;
}

export function formatFeatReward(feat) {
  return [
    ...Object.entries(feat.reward?.materials || {}).map(([name, quantity]) => `${name}×${quantity}`),
    feat.reward?.unlock
  ].filter(Boolean).join("・");
}

/** Counters as they stand right now: stored progress plus the running run. */
export function getLiveFeatCounters(featsState, run = null) {
  const stored = normalizeFeatsState(featsState).counters;
  return run && !run.returnReason ? addRunToFeatCounters(stored, run) : stored;
}

/**
 * Every feat with its progress. `completed` means recorded as achieved;
 * `offered` marks the feats currently put in front of the player: within a
 * chain, only the first one whose condition is not met yet.
 */
export function listFeats(featsState, counters = null) {
  const state = normalizeFeatsState(featsState);
  const live = counters || state.counters;
  const offeredChains = new Set();
  return FEATS.map(feat => {
    const completed = Object.hasOwn(state.completed, feat.id);
    const progress = getFeatProgress(feat, live);
    const pending = !completed && !progress.done;
    const offered = pending && !offeredChains.has(feat.chain);
    if (pending) offeredChains.add(feat.chain);
    return { feat, completed, offered, progress };
  });
}

/**
 * The unachieved feats closest to completion, at most one per chain. Ties
 * keep the authored order, so depth goals lead when nothing has progressed.
 */
export function getNearestFeats(featsState, counters = null, limit = 3) {
  return listFeats(featsState, counters)
    .filter(entry => entry.offered)
    .map((entry, index) => ({ ...entry, index }))
    .sort((left, right) => right.progress.ratio - left.progress.ratio || left.index - right.index)
    .slice(0, limit)
    .map(({ feat, progress }) => ({ feat, progress }));
}

/**
 * Feats whose condition the running run has just met and that the log has
 * not announced yet. They are settled (and rewarded) when the run ends.
 */
export function collectFeatAnnouncements(featsState, run) {
  if (!run) return [];
  const state = normalizeFeatsState(featsState);
  const announced = new Set(normalizeAnnouncedFeatIds(run.featsAnnounced));
  const live = addRunToFeatCounters(state.counters, run);
  const fresh = FEATS.filter(feat =>
    !Object.hasOwn(state.completed, feat.id) && !announced.has(feat.id) && getFeatProgress(feat, live).done
  );
  if (fresh.length > 0) run.featsAnnounced = [...announced, ...fresh.map(feat => feat.id)];
  return fresh;
}

/**
 * Settle a finished run: fold it into the counters, mark every feat whose
 * condition now holds, and total the one-time rewards. `rewardBonusPercent`
 * is the 任務巧者 support worn when the run ends. Pure: returns the next feat
 * state and the run's feat result without touching its inputs.
 */
export function settleRunFeats(featsState, run, outcome, runNumber = 0, rewardBonusPercent = 0) {
  const before = featsState ? normalizeFeatsState(featsState) : createDefaultFeatsState();
  const counters = addRunToFeatCounters(before.counters, run, outcome);
  const completed = { ...before.completed };
  const newlyCompleted = [];
  const rewards = {};
  FEATS.forEach(feat => {
    if (Object.hasOwn(completed, feat.id) || !getFeatProgress(feat, counters).done) return;
    completed[feat.id] = { runNumber: count(runNumber) };
    newlyCompleted.push(feat.id);
    Object.entries(feat.reward?.materials || {}).forEach(([name, quantity]) => {
      rewards[name] = (rewards[name] || 0) + Math.ceil(count(quantity) * (1 + count(rewardBonusPercent) / 100));
    });
  });
  const next = { counters, completed };
  // What moved this run among the feats still ahead: the closest ones first.
  const progress = getNearestFeats(next, counters, 3).map(({ feat, progress: after }) => ({
    id: feat.id,
    before: getFeatProgress(feat, before.counters).current,
    after: after.current,
    target: after.target
  }));
  return {
    feats: next,
    result: newlyCompleted.length > 0 || progress.length > 0
      ? { completed: newlyCompleted, rewards, progress }
      : null
  };
}

/** Log lines for feats the running run has just achieved. */
export function getFeatAnnouncementLines(featsState, run) {
  return collectFeatAnnouncements(featsState, run)
    .map(feat => `【偉業達成】${feat.name}（${feat.condition}）。報酬は街で受け取る。`);
}

/**
 * Settle feats outside a run, for progress made in the town (decoding a
 * guidebook page). `changeCounters` receives a copy of the counters to
 * update. Pure: returns the next feat state, the feats newly achieved, and
 * their one-time rewards.
 */
export function settleTownFeats(featsState, changeCounters, runNumber = 0) {
  const before = normalizeFeatsState(featsState);
  const counters = normalizeFeatCounters(before.counters);
  changeCounters?.(counters);
  const completed = { ...before.completed };
  const newlyCompleted = [];
  const rewards = {};
  FEATS.forEach(feat => {
    if (Object.hasOwn(completed, feat.id) || !getFeatProgress(feat, counters).done) return;
    completed[feat.id] = { runNumber: count(runNumber) };
    newlyCompleted.push(feat);
    Object.entries(feat.reward?.materials || {}).forEach(([name, quantity]) => {
      rewards[name] = (rewards[name] || 0) + count(quantity);
    });
  });
  return { feats: { counters, completed }, completed: newlyCompleted, rewards };
}

export function getFeat(featId) {
  return FEAT_BY_ID.get(featId) || null;
}
