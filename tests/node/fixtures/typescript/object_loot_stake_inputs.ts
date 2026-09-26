export function exerciseObjectLootStakeInputs(
  snapshot: (stateLike: unknown) => unknown
): unknown[] {
  const sparseLedger: unknown[] = [];
  sparseLedger.length = 3;
  sparseLedger[1] = null;
  sparseLedger[2] = { item: "HEAL_POTION" };

  const malformed: unknown = {
    currentRun: { unbankedObjectLoot: sparseLedger },
    party: [{ mediumState: { socketedRunes: [null, "RUNE_HALITO"] } }],
    inventory: ["HEAL_POTION", undefined]
  };

  return [snapshot(undefined), snapshot(null), snapshot(7), snapshot(malformed)];
}
