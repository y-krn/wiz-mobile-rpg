import type { ChestSmashResultInput } from "../../../../src/telemetry_chest_smash_result.js";

export const chestSmashResultInputFixture: ChestSmashResultInput = {
  runId: "run-fixture",
  chest: { fromDrop: true },
  details: {
    floor: 2,
    trapFired: false,
    partyDied: false,
    rewardCount: 3,
    lostRewardCount: 1,
    lostRewardRoles: ["main"],
    lostRewardCategories: ["usable"],
    remainingRewardCount: 0,
    awardedRewardCount: 2,
    unawardedRewardCount: 1
  },
  safeRewardRoles: new Set(["main", "special", "accessory"]),
  safeRewardCategories: new Set(["usable"])
};
