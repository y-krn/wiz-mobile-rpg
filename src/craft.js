import { state, saveAutosave, addLog, addInventoryItem } from "./state.js";
import { getItemData, getItemBaseId } from "./data.js";
import { playSound } from "./audio.js";
import { TAG_EFFECT_MAP } from "./data/tags.js";
import { CURSE_EFFECTS } from "./data/items.js";

export const CRAFT_RECIPES = [
  {
    resultId: "HEAL_POTION",
    name: "傷薬 (回復薬)",
    mats: { "硬い皮": 1, "獣の牙": 1 },
    gold: 40,
    desc: "使用するとHPを15回復する。"
  },
  {
    resultId: "ANTIDOTE",
    name: "解毒薬",
    mats: { "毒腺": 1 },
    gold: 50,
    desc: "使用すると毒状態を解除する。"
  },
  {
    resultId: "HOLY_WATER",
    name: "祝福の聖水",
    mats: { "霊粉": 1, "骨片": 1 },
    gold: 100,
    desc: "HPを15回復し、毒状態も治療する。"
  },
  {
    resultId: "MANA_POTION",
    name: "魔力草",
    mats: { "魔石片": 3, "呪布": 1 },
    gold: 250,
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
  let eqItem;
  let isEquipped = false;
  let actorIdx, slot;

  if (itemIdx && typeof itemIdx === "object") {
    if (itemIdx.type === "equipped") {
      isEquipped = true;
      actorIdx = itemIdx.actorIdx;
      slot = itemIdx.slot;
      eqItem = state.party[actorIdx].equipment[slot];
    } else {
      eqItem = state.inventory[itemIdx.index];
    }
  } else {
    eqItem = state.inventory[itemIdx];
  }

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

  // 更新
  if (isEquipped) {
    state.party[actorIdx].equipment[slot] = upgradedItem;
  } else {
    const idx = (itemIdx && typeof itemIdx === "object") ? itemIdx.index : itemIdx;
    state.inventory[idx] = upgradedItem;
  }

  playSound("level_up");
  const itemData = getItemData(upgradedItem);
  addLog(`[工房] 装備を強化しました！➔ [${itemData.name}]`);
  saveAutosave();
  return true;
}

export function getDismantleResults(eqItem) {
  const item = getItemData(eqItem);
  if (!item || !["weapon", "shield", "armor", "accessory"].includes(item.type)) return null;

  // 未鑑定装備の場合は分解不可
  if (typeof eqItem === "object" && eqItem.identified === false) {
    return null;
  }

  const baseId = getItemBaseId(eqItem);
  const rarity = (typeof eqItem === "object" ? eqItem.rarity : null) || "magic";

  let mainMat = "鉄片";
  let midMat = "骨片";
  let highMat = "竜鱗";

  if (["SHORT_SWORD", "LONG_SWORD", "CLAYMORE", "KATANA", "HOLY_BLADE", "RAPIER", "NINJA_BLADE", "MOONSHADOW", "FLAME_SWORD", "SEALED_EXCALIBUR", "EXCALIBUR_FRAGMENT"].includes(baseId)) {
    mainMat = "鉄片"; midMat = "骨片"; highMat = "竜鱗";
  } else if (["DAGGER", "NINJA_DAGGER", "VENOM_FANG"].includes(baseId)) {
    mainMat = "硬い皮"; midMat = "毒腺"; highMat = "黒角";
  } else if (["WAND", "SAGE_STAFF", "ARCH_WAND", "SACRED_MACE", "HOLY_STAFF", "MACE"].includes(baseId)) {
    mainMat = "魔石片"; midMat = "霊粉"; highMat = "黒角";
  } else if (["ROBE", "MAGE_CLOAK", "ARCANE_ROBE", "SORCERER_ROBE", "PRIEST_ROBE"].includes(baseId)) {
    mainMat = "呪布"; midMat = "霊粉"; highMat = "黒角";
  } else if (["LEATHER_ARMOR", "EXPLORER_CLOAK", "NINJA_SUIT"].includes(baseId)) {
    mainMat = "硬い皮"; midMat = "獣の牙"; highMat = "竜鱗";
  } else if (["SCALE_MAIL", "CHAIN_MAIL", "PLATE_MAIL", "BATTLE_GARB"].includes(baseId)) {
    mainMat = "鉄片"; midMat = "骨片"; highMat = "竜鱗";
  } else if (["SMALL_SHIELD", "BUCKLER", "LARGE_SHIELD", "KNIGHT_SHIELD", "MAGIC_SHIELD"].includes(baseId)) {
    mainMat = "鉄片"; midMat = "骨片"; highMat = "竜鱗";
  } else if (["DRAGON_SCALE", "DRAGON_CHARM"].includes(baseId)) {
    mainMat = "竜鱗"; midMat = "竜鱗"; highMat = "竜鱗";
  } else if (["AMULET_HP", "WARD_CHARM"].includes(baseId)) {
    mainMat = "霊粉"; midMat = "魔石片"; highMat = "黒角";
  } else if (["AMULET_MP"].includes(baseId)) {
    mainMat = "魔石片"; midMat = "霊粉"; highMat = "黒角";
  } else if (["RING_STR", "RING_AGI", "RING_LUK"].includes(baseId)) {
    mainMat = "鉄片"; midMat = "霊粉"; highMat = "黒角";
  } else if (["THIEF_EYE"].includes(baseId)) {
    mainMat = "硬い皮"; midMat = "毒腺"; highMat = "黒角";
  } else if (["DRAGON_RING"].includes(baseId)) {
    mainMat = "竜鱗"; midMat = "竜鱗"; highMat = "竜鱗";
  } else if (["HOLY_BAND"].includes(baseId)) {
    mainMat = "霊粉"; midMat = "骨片"; highMat = "黒角";
  } else if (["SWIFT_BAND"].includes(baseId)) {
    mainMat = "鉄片"; midMat = "獣の牙"; highMat = "黒角";
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

export function executeTagInscription(itemIdx, matName, tagToApply, overwriteTagIdx, actionType = "add") {
  let eqItem;
  let isEquipped = false;
  let actorIdx, slot;

  if (itemIdx && typeof itemIdx === "object") {
    if (itemIdx.type === "equipped") {
      isEquipped = true;
      actorIdx = itemIdx.actorIdx;
      slot = itemIdx.slot;
      eqItem = state.party[actorIdx].equipment[slot];
    } else {
      eqItem = state.inventory[itemIdx.index];
    }
  } else {
    eqItem = state.inventory[itemIdx];
  }

  if (!eqItem) return false;

  const item = getItemData(eqItem);
  if (!item || !["weapon", "shield", "armor"].includes(item.type)) {
    addLog("このアイテムには刻印できません。");
    return false;
  }

  // 未鑑定装備は刻印不可
  if (typeof eqItem === "object" && eqItem.identified === false) {
    addLog("未鑑定の装備には刻印できません。");
    return false;
  }

  // コスト取得
  const effectInfo = actionType === "seal" ? { gold: 150, matCost: 3 } : TAG_EFFECT_MAP[tagToApply];
  if (!effectInfo) {
    addLog("無効な刻印効果です。");
    return false;
  }

  const goldCost = effectInfo.gold;
  const matCost = effectInfo.matCost;

  // ゴールドチェック
  if (state.gold < goldCost) {
    addLog("ゴールドが不足しています。");
    return false;
  }

  // 素材チェック＆消費
  if ((state.materials[matName] || 0) < matCost) {
    addLog(`素材 [${matName}] が不足しています。`);
    return false;
  }

  state.gold -= goldCost;
  state.materials[matName] -= matCost;

  // 刻印付与
  const upgradedItem = convertToEquipObject(eqItem);
  if (!upgradedItem.tags) upgradedItem.tags = [];

  if (actionType === "seal") {
    // 呪いの封印
    upgradedItem.tags = upgradedItem.tags.filter(t => t !== "curse");
    if (upgradedItem.curseEffectId) {
      upgradedItem.sealedCurseEffectId = upgradedItem.curseEffectId;
      upgradedItem.curseEffectId = null;
    }
    upgradedItem.inscription = {
      type: "sealed",
      value: 0,
      name: "封印印",
      tag: "holy"
    };
    addLog(`[工房] [${item.name}] の呪いを封印しました！`);
  } else {
    // タグの付与/上書き
    const effectInfo = TAG_EFFECT_MAP[tagToApply];
    if (overwriteTagIdx !== undefined && overwriteTagIdx >= 0 && overwriteTagIdx < upgradedItem.tags.length) {
      const oldTag = upgradedItem.tags[overwriteTagIdx];
      upgradedItem.tags[overwriteTagIdx] = tagToApply;
      addLog(`[工房] タグ [${oldTag}] を [${tagToApply}] で上書きしました。`);
    } else {
      if (upgradedItem.tags.length >= 3) {
        upgradedItem.tags.shift();
      }
      upgradedItem.tags.push(tagToApply);
    }

    if (tagToApply === "curse") {
      const curseKeys = Object.keys(CURSE_EFFECTS);
      upgradedItem.curseEffectId = curseKeys[Math.floor(Math.random() * curseKeys.length)];
    }

    upgradedItem.inscription = {
      type: effectInfo.type,
      value: effectInfo.value,
      name: effectInfo.name,
      tag: tagToApply
    };
    addLog(`[工房] [${item.name}] に [${effectInfo.name}] (${effectInfo.desc}) を施しました！`);
  }

  // 更新
  if (isEquipped) {
    state.party[actorIdx].equipment[slot] = upgradedItem;
  } else {
    const idx = (itemIdx && typeof itemIdx === "object") ? itemIdx.index : itemIdx;
    state.inventory[idx] = upgradedItem;
  }

  playSound("level_up");
  saveAutosave();
  return true;
}
