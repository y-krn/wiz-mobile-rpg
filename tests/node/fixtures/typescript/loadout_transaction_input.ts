import { commitLoadoutDraft } from "../../../../src/systems/loadout_transaction.js";

type LoadoutDraftInput = NonNullable<Parameters<typeof commitLoadoutDraft>[0]>;
type LoadoutOptionsInput = NonNullable<Parameters<typeof commitLoadoutDraft>[1]>;

const draft: LoadoutDraftInput = {
  party: [{ mp: 3 }],
  inventory: [],
  trialAction: null
};

const options: LoadoutOptionsInput = {
  stateLike: { gameState: "town", party: draft.party, inventory: draft.inventory, floor: 1 },
  turnCost: 1,
  worldAction: "explore"
};

export function commitTypedLoadoutFixture() {
  return commitLoadoutDraft(draft, options);
}
