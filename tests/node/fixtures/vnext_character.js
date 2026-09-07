import { createStartingKitCharacter } from "../../../src/state.js";
import { getRuneItemId, syncMediumState } from "../../../src/rules/magic_rules.js";

export const VNEXT_KIT_IDS = Object.freeze(["vanguard", "scout", "devotion", "arcana"]);

export function createVNextCharacter(kitId = "vanguard", overrides = {}) {
  const character = createStartingKitCharacter(kitId);
  if (!character) throw new Error(`unknown vNext starting kit: ${kitId}`);
  Object.assign(character, overrides);
  if (overrides.equipment) {
    character.equipment = { ...createStartingKitCharacter(kitId).equipment, ...overrides.equipment };
  }
  return character;
}

export function createSocketedRuneCharacter(spellKeys = [], { kitId = "arcana", mediumId = "ARCH_WAND", ...overrides } = {}) {
  const character = createVNextCharacter(kitId, overrides);
  character.equipment = { ...character.equipment, weapon: mediumId, shield: null };
  syncMediumState(character);
  character.mediumState.socketedRunes = spellKeys.map(getRuneItemId).filter(Boolean);
  return character;
}
