import {
  getPendingRewardFinalBagCount,
  resolvePendingRewardPlan
} from "../../../../src/rules/pending_reward_bundle.js";

export function exercisePendingRewardPlanTypes(): number {
  const numericStringPlan = resolvePendingRewardPlan({
    bagCount: "18",
    rewardCount: "3",
    takeCount: "2",
    discardCount: "1",
    loadoutChanged: "changed"
  });
  const unknownCounts: unknown = 2;
  const unknownPlan = resolvePendingRewardPlan({ bagCount: unknownCounts });
  const legacyBagPlan = {
    bagCount: "4",
    discardCount: "1",
    takeCount: "2"
  };
  let nullPlanThrowsAtRuntime = false;
  try {
    resolvePendingRewardPlan(null);
  } catch {
    nullPlanThrowsAtRuntime = true;
  }
  return numericStringPlan.turnCost + unknownPlan.turnCost +
    getPendingRewardFinalBagCount(legacyBagPlan) + Number(nullPlanThrowsAtRuntime);
}
