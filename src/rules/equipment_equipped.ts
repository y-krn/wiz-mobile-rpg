// balance-impact: none — equipped-item safety predicate only; game rules and economy are unchanged.
// Runtime-neutral equipped-item inspection shared by UI and discard guards.
// A malformed party/equipment payload is unsafe to treat as unequipped.

type EquippedStateLike = {
  party?: unknown;
} | null | undefined;

type EquippedStatus =
  | { equipped: true; error?: undefined; scope?: undefined }
  | { equipped: false; error?: undefined; scope?: undefined }
  | { equipped: true; error: unknown; scope: "party" | "character-equipment" };

export function getItemEquippedStatus(stateLike: unknown, itemKey: unknown): EquippedStatus {
  try {
    const party = (stateLike as EquippedStateLike)?.party;
    if (!Array.isArray(party)) throw new TypeError("party must be an array");

    for (const character of party as unknown[]) {
      try {
        if (Object.values((character as { equipment?: unknown }).equipment || {}).some(equippedKey => equippedKey === itemKey)) {
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
