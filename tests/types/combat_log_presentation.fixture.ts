import {
  formatCombatLogMessage as formatFromOwner,
  getCombatLogDelay as delayFromOwner,
  groupCombatLogEntries as groupFromOwner
} from "../../src/combat_ui/combat_log_presentation";
import {
  formatCombatLogMessage as formatFromFacade,
  getCombatLogDelay as delayFromFacade,
  groupCombatLogEntries as groupFromFacade
} from "../../src/combat_ui/combat_log_presentation.js";

const rawInput: unknown = [{ msg: "[味方] 冒険者の攻撃！敵に3のダメージ。", groupId: "fixture" }];
const rawMessage: unknown = "通常ログ";

groupFromOwner(rawInput);
groupFromFacade(rawInput);
delayFromOwner(rawInput);
delayFromFacade(rawInput);
formatFromOwner(rawMessage);
formatFromFacade(rawMessage);
