import { ITEMS } from "../data.js";

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
  const target = state.party[act.targetIdx];
  const oldHp = target.hp;
  const log = item.effect(target);
  state.inventory.splice(inventoryIdx, 1);
  let floatText = undefined;
  let floatColor = "#00ff66";
  if (act.itemKey === "HEAL_POTION") {
    floatText = `+${Math.max(0, target.hp - oldHp)}`;
  } else if (act.itemKey === "ANTIDOTE") {
    floatText = "CURED";
  } else if (act.itemKey === "HOLY_WATER") {
    floatText = `+${Math.max(0, target.hp - oldHp)}`;
  } else if (act.itemKey === "MANA_POTION") {
    floatText = (target.class === "Priest" || target.class === "Mage") ? "+3 MP" : "無効";
  }
  logQueue.push({
    msg: `[味方] ${log}`,
    sound: "heal",
    floatText,
    floatColor
  });
  return { escaped: false };
}
