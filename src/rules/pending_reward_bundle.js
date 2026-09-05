// Pure planning rules used by the pending-reward simulation and runtime guard.
export function getPendingRewardFinalBagCount(plan) {
  if (!plan || !Number.isFinite(plan.bagCount)) return 0;
  return Math.max(0, plan.bagCount - plan.discardCount + plan.takeCount);
}
export function resolvePendingRewardPlan({
  bagCount = 0,
  rewardCount = 0,
  takeCount = 0,
  discardCount = 0,
  loadoutChanged = false
} = {}) {
  const normalizedBag = Math.max(0, Math.floor(Number(bagCount) || 0));
  const rewards = Math.max(0, Math.floor(Number(rewardCount) || 0));
  const takes = Math.max(0, Math.min(rewards, Math.floor(Number(takeCount) || 0)));
  const discards = Math.max(0, Math.min(normalizedBag, Math.floor(Number(discardCount) || 0)));
  const finalBag = normalizedBag - discards + takes;
  return {
    ok: finalBag <= 20,
    bagCount: normalizedBag,
    rewardCount: rewards,
    takeCount: takes,
    discardCount: discards,
    turnCost: loadoutChanged && finalBag <= 20 ? 1 : 0
  };
}
