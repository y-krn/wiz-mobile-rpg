import type { MilestoneMerchantStateLike } from "../../../../src/systems/milestone_merchant.js";

export function createPartialMerchantState(): MilestoneMerchantStateLike {
  return {
    currentRun: { materials: { "霊粉": 2 } },
    inventory: [],
    identifyTickets: 0
  };
}

export function createPartialUncurseState(item: Record<string, unknown>): MilestoneMerchantStateLike {
  return {
    party: [{ equipment: { legacy_slot: item } }],
    currentRun: { materials: { "霊粉": 5, "呪布": 3, "黒角": 1 } }
  };
}
