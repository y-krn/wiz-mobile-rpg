import { state, saveAutosave, addLog, addInventoryItem } from "./state.js";
import { ITEMS, getItemData, getItemBaseId } from "./data.js";
import { playSound } from "./audio.js";

export const CRAFT_RECIPES = [
  {
    resultId: "HEAL_POTION",
    name: "傷薬 (回復薬)",
    mats: { "硬い皮": 1, "獣の牙": 1 },
    gold: 15,
    desc: "使用するとHPを15回復する。"
  },
  {
    resultId: "ANTIDOTE",
    name: "解毒薬",
    mats: { "毒腺": 1 },
    gold: 20,
    desc: "使用すると毒状態を解除する。"
  },
  {
    resultId: "HOLY_WATER",
    name: "祝福の聖水",
    mats: { "霊粉": 1, "骨片": 1 },
    gold: 30,
    desc: "HPを40回復し、毒状態も治療する。"
  },
  {
    resultId: "MANA_POTION",
    name: "魔力草",
    mats: { "魔石片": 2, "呪布": 1 },
    gold: 50,
    desc: "使用するとMPを3回復する。"
  }
];

export function getEnhanceCost(eqItem) {
  const item = getItemData(eqItem);
  if (!item) return null;

  // すでに強化されているか確認
  const currentEnhance = eqItem.enhanceLevel || 0;
  if (currentEnhance >= 1) return null; // 強化上限は初期+1まで

  if (item.type === "weapon") {
    return {
      mats: { "鉄片": 2, "魔石片": 1 },
      gold: 200
    };
  } else if (item.type === "shield" || item.type === "armor") {
    return {
      mats: { "鉄片": 1, "硬い皮": 2 },
      gold: 150
    };
  }
  return null;
}

export function convertToEquipObject(itemKey) {
  if (typeof itemKey === "object") return itemKey;
  
  // 文字列ベースIDからオブジェクト型への変換
  const instanceId = `eq_${Math.random().toString(36).substr(2, 9)}`;
  return {
    kind: "equipment",
    instanceId,
    baseId: itemKey,
    rarity: "magic",
    level: 1,
    identified: true,
    enhanceLevel: 0,
    affixes: []
  };
}

export function executeCraft(recipeId) {
  const recipe = CRAFT_RECIPES.find(r => r.resultId === recipeId);
  if (!recipe) return false;

  // ゴールドチェック
  if (state.gold < recipe.gold) {
    addLog("ゴールドが不足しています。");
    return false;
  }

  // バッグ空きチェック
  if (state.inventory.length >= 20) {
    addLog("バッグがいっぱいです。");
    return false;
  }

  // 素材チェック
  for (const [mat, reqQty] of Object.entries(recipe.mats)) {
    const curQty = state.materials[mat] || 0;
    if (curQty < reqQty) {
      addLog(`素材 [${mat}] が不足しています。`);
      return false;
    }
  }

  // 消費
  state.gold -= recipe.gold;
  for (const [mat, reqQty] of Object.entries(recipe.mats)) {
    state.materials[mat] -= reqQty;
  }

  // アイテム獲得
  addInventoryItem(recipe.resultId);
  playSound("heal");
  addLog(`[工房] ${recipe.name} を製作しました！`);
  saveAutosave();
  return true;
}

export function executeEnhance(itemIdx) {
  const eqItem = state.inventory[itemIdx];
  if (!eqItem) return false;

  const cost = getEnhanceCost(eqItem);
  if (!cost) {
    addLog("この装備は強化できません。");
    return false;
  }

  // ゴールドチェック
  if (state.gold < cost.gold) {
    addLog("ゴールドが不足しています。");
    return false;
  }

  // 素材チェック
  for (const [mat, reqQty] of Object.entries(cost.mats)) {
    const curQty = state.materials[mat] || 0;
    if (curQty < reqQty) {
      addLog(`素材 [${mat}] が不足しています。`);
      return false;
    }
  }

  // 消費
  state.gold -= cost.gold;
  for (const [mat, reqQty] of Object.entries(cost.mats)) {
    state.materials[mat] -= reqQty;
  }

  // 強化実行（文字列IDの場合はオブジェクトに変換）
  const upgradedItem = convertToEquipObject(eqItem);
  upgradedItem.enhanceLevel = (upgradedItem.enhanceLevel || 0) + 1;

  // インベントリの更新
  state.inventory[itemIdx] = upgradedItem;

  playSound("level_up");
  const itemData = getItemData(upgradedItem);
  addLog(`[工房] 装備を強化しました！➔ [${itemData.name}]`);
  saveAutosave();
  return true;
}
