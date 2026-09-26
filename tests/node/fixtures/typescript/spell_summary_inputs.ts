import { getSpellCombatSummary as getFromOwner } from "../../../../src/combat_ui/spell_summary";
import { getSpellCombatSummary as getFromFacade } from "../../../../src/combat_ui/spell_summary.js";

export function exerciseSpellSummaryInputs(): void {
  const inputs: unknown[] = ["HALITO", undefined, null, 1, Symbol("HALITO"), { toString: () => "HALITO" }];
  for (const input of inputs) {
    getFromOwner(input);
    getFromFacade(input);
  }
}
