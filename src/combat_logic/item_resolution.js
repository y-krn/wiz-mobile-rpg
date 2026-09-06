import { ITEMS, getCharAffixSum } from "../data.js";
import { consumeRunObjectLoot, findRunObjectLootEntry } from "../state/run_loot.js";
import { trackLootLifecycle, trackPortalDecision } from "../telemetry.js";

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
  const lootEntry = findRunObjectLootEntry(state, act.itemKey);
  const lootId = lootEntry?.id || null;
  if (lootId) {
    trackLootLifecycle("tried", {
      state,
      character: char,
      itemKey: act.itemKey,
      lootId,
      source: "combat"
    });
  }
  if (act.itemKey === "TOWN_PORTAL") {
    trackPortalDecision("return", {
      state,
      character: char,
      portalType: "return_wing",
      wingOwned: true,
      wingSalvageCount: 0
    });
    state.inventory.splice(inventoryIdx, 1);
    consumeRunObjectLoot(state, act.itemKey);
    if (lootId) trackLootLifecycle("consumed", {
      state,
      character: char,
      itemKey: act.itemKey,
      lootId,
      source: "combat"
    });
    logQueue.push({
      msg: `[味方] ${char.name}は帰還のスクロールを読んだ！冒険者はお城へ導かれる！`,
      sound: "cast_spell",
      escapeToTown: true
    });
    return { escaped: true };
  }
  if (act.itemKey === "ESCAPE_SCROLL") {
    state.inventory.splice(inventoryIdx, 1);
    consumeRunObjectLoot(state, act.itemKey);
    if (lootId) trackLootLifecycle("consumed", {
      state,
      character: char,
      itemKey: act.itemKey,
      lootId,
      source: "combat"
    });
    const escapeChance = getCharAffixSum(char, "escapeChance") / 100;
    const chance = Math.max(0.40, Math.min(0.95, 0.75 + escapeChance));
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
  consumeRunObjectLoot(state, act.itemKey);
  if (lootId) trackLootLifecycle("consumed", {
    state,
    character: char,
    itemKey: act.itemKey,
    lootId,
    source: "combat"
  });
  let floatText = undefined;
  let floatColor = "#00ff66";
  if (act.itemKey === "HEAL_POTION" || act.itemKey === "GREATER_HEAL" || act.itemKey === "HOLY_WATER") {
    floatText = `+${Math.max(0, target.hp - oldHp)}`;
  } else if (act.itemKey === "MANA_POTION" || act.itemKey === "ETHER") {
    const restored = Math.max(0, target.mp - oldMp);
    floatText = restored > 0 ? `+${restored} MP` : "無効";
  } else if (["ANTIDOTE", "EYE_DROPS", "PARALYZE_CURE", "WAKE_POWDER", "PANACEA"].includes(act.itemKey)) {
    floatText = oldStatus !== target.status ? "CURED" : "無効";
  } else if (act.itemKey === "GUARD_POTION") {
    floatText = "GUARD";
  }
  logQueue.push({
    msg: `[味方] ${log}`,
    sound: "heal",
    floatText,
    floatColor
  });
  return { escaped: false };
}
