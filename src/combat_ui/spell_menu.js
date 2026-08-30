import { state } from "../state.js";
import { menuContext, openSubmenu } from "../navigation.js";
import { bindCombatCallback, combatCallbacks } from "./combat_state.js";
import { getLivingAllyTargetIndices, getSpellAllyTargetIndices, isSpellAvailableInContext } from "../rules/spell_targeting.js";

export { getSpellCombatSummary } from "./spell_summary.js";

export function openCombatSpellMenu(char, callback) {
  // Find actor index
  const actorIdx = state.party.findIndex(c => c.name === char.name);
  menuContext.actorIdx = actorIdx;
  menuContext.targetType = "";
  menuContext.spellName = "";
  combatCallbacks.activeSpellCallback = bindCombatCallback(callback, {
    type: "combat_spell",
    actorIdx,
    actor: state.party?.[actorIdx],
    actorName: state.party?.[actorIdx]?.name,
    targetType: "",
    spellName: ""
  });
  openSubmenu("combat_spell", "呪文を唱える");
}

export function isSpellTargetAvailable(spell, spellKey, party = state.party) {
  // 1. Use the shared target/context rule so combat and exploration do not diverge.
  if (!isSpellAvailableInContext(spell, "combat")) return false;

  // 2. 敵対象呪文：生存している敵がいるか
  if (spell.target === "single_enemy" || spell.target === "all_enemies") {
    const hasLivingEnemy = state.combatState && state.combatState.monsters.some(m => m.hp > 0);
    if (!hasLivingEnemy) return false;
  }

  // 3. 味方対象呪文：共通の有効対象条件で候補を確認
  if (spell.target === "single_ally") {
    return getSpellAllyTargetIndices(spellKey, party).length > 0;
  }
  if (spell.target === "all_allies") {
    return getLivingAllyTargetIndices(party).length > 0;
  }

  return true;
}
