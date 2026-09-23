import {
  getItemAllyTargetIndices,
  getLivingAllyTargetIndices,
  getSpellAllyTargetIndices,
  getSpellAllyTargetStatus,
  isSpellAvailableInContext
} from "../../../../src/rules/spell_targeting";

export function exerciseLegacySpellTargetInputs(
  spell: unknown,
  context: unknown,
  spellKey: unknown,
  party: unknown,
  mixedParty: unknown[]
) {
  const sparseParty: unknown[] = [];
  sparseParty[2] = null;
  sparseParty[4] = { status: "blind" };

  return [
    isSpellAvailableInContext(spell, context),
    isSpellAvailableInContext("primitive spell", "combat"),
    getSpellAllyTargetStatus(spellKey, 7),
    getSpellAllyTargetStatus("DIOS", "primitive character"),
    getSpellAllyTargetIndices(spellKey, party),
    getLivingAllyTargetIndices(mixedParty),
    getItemAllyTargetIndices(sparseParty)
  ];
}
