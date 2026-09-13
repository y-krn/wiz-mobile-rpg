function createEquipmentUiState() {
  return {
    mode: "equip",
    filter: "all",
    actorIdx: 0,
    selectedIdx: -1,
    selectedKey: null,
    selectedSlot: null,
    selectedActorIdx: -1,
    selectedIsEquipped: false,
    selectedDiscardIndices: new Set(),
    pendingUnequip: null,
    listScrollTop: 0,
    prevGameState: null,
    draft: null,
  };
}

export let equipState = createEquipmentUiState();

export function bindEquipmentUiState(nextState) {
  if (!nextState || typeof nextState !== "object") {
    throw new TypeError("equipment UI state must be an object");
  }
  equipState = nextState;
}

export function resetEquipState() {
  equipState.mode = "equip";
  equipState.filter = "all";
  equipState.actorIdx = 0;
  equipState.selectedIdx = -1;
  equipState.selectedKey = null;
  equipState.selectedSlot = null;
  equipState.selectedActorIdx = -1;
  equipState.selectedIsEquipped = false;
  if (equipState.selectedDiscardIndices instanceof Set) {
    equipState.selectedDiscardIndices.clear();
  } else {
    equipState.selectedDiscardIndices = new Set();
  }
  equipState.pendingUnequip = null;
  equipState.listScrollTop = 0;
  equipState.prevGameState = null;
  equipState.draft = null;
}
