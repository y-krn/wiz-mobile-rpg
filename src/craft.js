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

export function getDismantleResults(eqItem) {
  const item = getItemData(eqItem);
  if (!item || !["weapon", "shield", "armor"].includes(item.type)) return null;

  // 未鑑定装備の場合は分解不可
  if (typeof eqItem === "object" && eqItem.identified === false) {
    return null;
  }

  const baseId = getItemBaseId(eqItem);
  const rarity = (typeof eqItem === "object" ? eqItem.rarity : null) || "magic";

  let mainMat = "鉄片";
  let midMat = "骨片";
  let highMat = "竜鱗";

  if (["SHORT_SWORD", "LONG_SWORD", "CLAYMORE", "KATANA", "HOLY_BLADE", "RAPIER", "SEALED_EXCALIBUR", "EXCALIBUR_FRAGMENT"].includes(baseId)) {
    mainMat = "鉄片"; midMat = "骨片"; highMat = "竜鱗";
  } else if (["DAGGER", "NINJA_DAGGER"].includes(baseId)) {
    mainMat = "硬い皮"; midMat = "毒腺"; highMat = "黒角";
  } else if (["WAND", "SACRED_MACE", "MACE"].includes(baseId)) {
    mainMat = "魔石片"; midMat = "霊粉"; highMat = "黒角";
  } else if (["ROBE", "MAGE_CLOAK", "ARCANE_ROBE", "PRIEST_ROBE"].includes(baseId)) {
    mainMat = "呪布"; midMat = "霊粉"; highMat = "黒角";
  } else if (["LEATHER_ARMOR", "EXPLORER_CLOAK", "NINJA_SUIT"].includes(baseId)) {
    mainMat = "硬い皮"; midMat = "獣の牙"; highMat = "竜鱗";
  } else if (["SCALE_MAIL", "CHAIN_MAIL", "PLATE_MAIL", "BATTLE_GARB"].includes(baseId)) {
    mainMat = "鉄片"; midMat = "骨片"; highMat = "竜鱗";
  } else if (["SMALL_SHIELD", "BUCKLER", "LARGE_SHIELD", "KNIGHT_SHIELD", "MAGIC_SHIELD"].includes(baseId)) {
    mainMat = "鉄片"; midMat = "骨片"; highMat = "竜鱗";
  } else if (["DRAGON_SCALE", "DRAGON_CHARM"].includes(baseId)) {
    mainMat = "竜鱗"; midMat = "竜鱗"; highMat = "竜鱗";
  }

  const results = {};
  if (rarity === "magic") {
    results[mainMat] = 1;
  } else if (rarity === "rare") {
    results[mainMat] = 2;
    results[midMat] = (results[midMat] || 0) + 1;
  } else if (rarity === "epic") {
    results[mainMat] = 2;
    results[highMat] = (results[highMat] || 0) + 1;
  }

  return results;
}

export function executeDismantle(itemIdx) {
  const eqItem = state.inventory[itemIdx];
  if (!eqItem) return false;

  const results = getDismantleResults(eqItem);
  if (!results) {
    addLog("このアイテムは分解できません。");
    return false;
  }

  const itemData = getItemData(eqItem);
  const itemName = itemData.name;

  // インベントリから削除
  state.inventory.splice(itemIdx, 1);

  // 素材追加
  const gainedMats = [];
  for (const [mat, qty] of Object.entries(results)) {
    state.materials[mat] = (state.materials[mat] || 0) + qty;
    gainedMats.push(`${mat}x${qty}`);
  }

  playSound("level_up");
  addLog(`[工房] [${itemName}] を分解し、[${gainedMats.join(", ")}] を獲得しました！`);
  saveAutosave();
  return true;
}
