import type {
  SocketRuneFromInventoryInput,
  UnsocketRuneToInventoryInput
} from "../../../../src/systems/magic_actions.js";

export const socketRuneInputFixture: SocketRuneFromInventoryInput = {
  actorIdx: 0,
  inventoryIndex: 0
};

export const unsocketRuneInputFixture: UnsocketRuneToInventoryInput = {
  actorIdx: 0,
  spellKey: "HALITO"
};
