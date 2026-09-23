type PendingRewardBagPlanFields = {
  bagCount?: unknown;
  discardCount?: unknown;
  takeCount?: unknown;
};

type PendingRewardPlanInput = {
  bagCount?: unknown;
  rewardCount?: unknown;
  takeCount?: unknown;
  discardCount?: unknown;
  loadoutChanged?: unknown;
};

type PendingRewardPlan = {
  ok: boolean;
  bagCount: number;
  rewardCount: number;
  takeCount: number;
  discardCount: number;
  turnCost: number;
};

export function getPendingRewardFinalBagCount(plan: unknown): number {
  if (!plan) return 0;
  const planFields = plan as PendingRewardBagPlanFields;
  if (!Number.isFinite(planFields.bagCount as number)) return 0;
  return Math.max(
    0,
    (planFields.bagCount as number) - (planFields.discardCount as number) + (planFields.takeCount as number)
  );
}

export function resolvePendingRewardPlan(
  input: unknown = {}
): PendingRewardPlan {
  const {
    bagCount = 0,
    rewardCount = 0,
    takeCount = 0,
    discardCount = 0,
    loadoutChanged = false
  } = input as PendingRewardPlanInput;
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
