// balance-impact: none — equipped-item safety predicate only; game rules and economy are unchanged.
// Runtime-neutral equipped-item inspection shared by UI and discard guards.
// A malformed party/equipment payload is unsafe to treat as unequipped.
export function getItemEquippedStatus(stateLike, itemKey) {
  try {
    const party = stateLike?.party;
    if (!Array.isArray(party)) throw new TypeError("party must be an array");

    for (const character of party) {
      try {
        if (Object.values(character.equipment || {}).some(equippedKey => equippedKey === itemKey)) {
          return { equipped: true };
        }
      } catch (error) {
        return { equipped: true, error, scope: "character-equipment" };
      }
    }
    return { equipped: false };
  } catch (error) {
    return { equipped: true, error, scope: "party" };
  }
}
