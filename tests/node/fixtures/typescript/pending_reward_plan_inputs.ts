import {
  getPendingRewardFinalBagCount,
  resolvePendingRewardPlan
} from "../../../../src/rules/pending_reward_bundle.js";

export function exercisePendingRewardPlanTypes() {
  const numericStringPlan = resolvePendingRewardPlan({
    bagCount: "18",
    rewardCount: "3",
    takeCount: "2",
    discardCount: "1",
    loadoutChanged: "changed"
  });
  const unknownCounts: unknown = 2;
  const unknownContainer: unknown = {
    bagCount: 4,
    rewardCount: "2",
    takeCount: "1",
    discardCount: "1",
    loadoutChanged: "changed"
  };
  const unknownPlan = resolvePendingRewardPlan({ bagCount: unknownCounts });
  const unknownContainerPlan = resolvePendingRewardPlan(unknownContainer);
  const unknownContainerBag = getPendingRewardFinalBagCount(unknownContainer);
  const unknownPrimitiveContainer: unknown = 7;
  const primitivePlan = resolvePendingRewardPlan(unknownPrimitiveContainer);
  const primitiveBag = getPendingRewardFinalBagCount(unknownPrimitiveContainer);
  const legacyBagPlan: unknown = {
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
  return {
    numericStringPlan,
    unknownPlan,
    unknownContainerPlan,
    unknownContainerBag,
    primitivePlan,
    primitiveBag,
    legacyBag: getPendingRewardFinalBagCount(legacyBagPlan),
    nullPlanThrowsAtRuntime
  };
}
