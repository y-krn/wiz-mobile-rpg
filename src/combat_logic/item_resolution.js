import { ITEMS } from "../data.js";
import { getCharAgi } from "../rules/character_stats.js";
import { getBuffTotal } from "./status_effects.js";

/**
 * Resolves player item usage.
 * Returns { escaped: boolean } indicating if a town portal escape occurred.
 */
export function resolvePlayerItem(char, act, state, logQueue) {
  const item = ITEMS[act.itemKey];
  const inventoryIdx = state.inventory.findIndex(key => key === act.itemKey);
  if (inventoryIdx === -1) {
    logQueue.push({ msg: `[味方] ${char.name}は道具を使おうとしたが、もうバッグに残っていない！` });
    return { escaped: false };
  }
  if (act.itemKey === "TOWN_PORTAL") {
    state.inventory.splice(inventoryIdx, 1);
    logQueue.push({
      msg: `[味方] ${char.name}は帰還のスクロールを読んだ！パーティ全員がお城へ導かれる！`,
      sound: "cast_spell",
      escapeToTown: true
    });
    return { escaped: true };
  }
  if (act.itemKey === "ESCAPE_SCROLL") {
    state.inventory.splice(inventoryIdx, 1);
    const charAgi = getCharAgi(char) + getBuffTotal(char, "agi");
    const avgEnemyAgi = 10;
    const baseChance = 0.75;
    const chance = Math.max(0.40, Math.min(0.95, baseChance + (charAgi - avgEnemyAgi) * 0.03));
    const success = Math.random() < chance;
    if (success) {
      logQueue.push({
        msg: `[味方] ${char.name}は離脱のスクロールを使った！煙に紛れて戦闘から離脱する！`,
        sound: "miss",
        fleeCombat: true
      });
      return { escaped: true };
    } else {
      logQueue.push({
        msg: `[味方] ${char.name}は離脱のスクロールを使ったが、失敗した！`,
        sound: "miss"
      });
      return { escaped: false };
    }
  }
  const target = state.party[act.targetIdx];
  const oldHp = target.hp;
  const oldMp = target.mp;
  const oldStatus = target.status;
  const log = item.effect(target, state.party);
  state.inventory.splice(inventoryIdx, 1);
  let floatText = undefined;
  let floatColor = "#00ff66";
  if (act.itemKey === "HEAL_POTION" || act.itemKey === "GREATER_HEAL" || act.itemKey === "HOLY_WATER") {
    floatText = `+${Math.max(0, target.hp - oldHp)}`;
  } else if (act.itemKey === "MANA_POTION" || act.itemKey === "ETHER") {
    const restored = Math.max(0, target.mp - oldMp);
    floatText = restored > 0 ? `+${restored} MP` : "無効";
  } else if (["ANTIDOTE", "EYE_DROPS", "PARALYZE_CURE", "WAKE_POWDER", "PANACEA"].includes(act.itemKey)) {
    floatText = oldStatus !== target.status ? "CURED" : "無効";
  }
  logQueue.push({
    msg: `[味方] ${log}`,
    sound: "heal",
    floatText,
    floatColor
  });
  return { escaped: false };
}
