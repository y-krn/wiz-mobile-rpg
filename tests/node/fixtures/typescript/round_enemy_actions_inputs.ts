import {
  getRoundEnemyActions as getFromFacade,
  recordRoundEnemyAction as recordFromFacade,
  resetRoundEnemyActions as resetFromFacade
} from "../../../../src/combat_ui/round_enemy_actions.js";

export function exerciseRoundEnemyActionInputs(
  message: unknown,
  owner: unknown
): string[] {
  resetFromFacade(owner);
  recordFromFacade(message, owner);
  const facadeResult: string[] = getFromFacade(owner);
  return facadeResult;
}
