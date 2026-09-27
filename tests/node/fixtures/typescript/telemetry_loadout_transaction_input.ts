import type { LoadoutTransactionInput } from "../../../../src/telemetry_loadout_transaction.js";

export const loadoutTransactionInputFixture: LoadoutTransactionInput = {
  runId: "run-fixture",
  context: { floor: 2 },
  action: "commit",
  equipmentChanges: 1,
  runeChanges: 0,
  discardedItems: 0,
  mode: "loadout",
  turnCost: 1,
  equipmentChangeCountMax: 40,
  discardedItemCountMax: 20
};
