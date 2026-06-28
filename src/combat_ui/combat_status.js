import { state } from "../state.js";
import { combatSelection } from "./combat_state.js";
import { advanceActionSelection } from "./action_selection.js";
import { triggerGameOver } from "./game_over.js";

export function checkCombatStatus() {
  if (!state.combatState) return;

  const monsters = state.combatState.monsters;
  const allMonstersDead = monsters.every(m => m.hp <= 0);
  const allPartyDead = state.party.every(c => c.status === "dead");

  if (allMonstersDead) {
    // 勝利時の処理は resolveCombatRound のログ再生を通して非同期に実行されているため、
    // 二重処理を防ぐために早期リターンします。
    return;
  } else if (allPartyDead) {
    // 全滅
    triggerGameOver();
  } else {
    // 次のターンへ
    state.combatState.phase = "choose_actions";
    combatSelection.charIdx = 0;
    combatSelection.actions = [];
    advanceActionSelection();
  }
}
