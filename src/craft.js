import { state, saveAutosave, addLog, addInventoryItem } from "./state.js";
import { getItemData, getItemBaseId } from "./data.js";
import { playSound } from "./audio.js";
import { AFFIX_BALANCE, getAffixDefinition } from "./data/affixes.js";

export const CRAFT_RECIPES = [
  {
    resultId: "HEAL_POTION",
    name: "傷薬 (回復薬)",
    mats: { "硬い皮": 1, "獣の牙": 1 },
    desc: "使用するとHPを15回復する。"
  },
  {
    resultId: "ANTIDOTE",
    name: "解毒薬",
    mats: { "毒腺": 1 },
    desc: "使用すると毒状態を解除する。"
  },
  {
    resultId: "HOLY_WATER",
    name: "祝福の聖水",
    mats: { "霊粉": 1, "骨片": 1 },
    desc: "HPを15回復し、毒状態も治療する。"
  },
  {
    resultId: "MANA_POTION",
    name: "魔力草",
    mats: { "魔石片": 3, "呪布": 1 },
    desc: "使用するとMPを3回復する。"
  },
  {
    resultId: "TRAP_KIT",
    name: "罠外しキット",
    mats: { "鉄片": 2, "硬い皮": 1 },
    desc: "宝箱の罠を1つ確実に外す。"
  },
  {
    resultId: "TOWN_PORTAL",
    name: "帰還の翼",
    departureCost: { mode: "any", total: 8 },
    desc: "任意のフロアから撤退し、素材を100%持ち帰る。"
  },
  {
    resultId: "GREATER_HEAL",
    name: "上薬",
    mats: { "黒角": 2, "骨片": 2 },
    desc: "使用するとHPを40回復する。"
  },
  {
    resultId: "GUARD_POTION",
    name: "守りの薬",
    mats: { "竜鱗": 1, "鉄片": 2 },
    desc: "その戦闘の間、物理ダメージを40%軽減する。"
  },
  {
    resultId: "IDENTIFY_POWDER",
    name: "鑑定粉",
    departureCost: { mode: "any", total: 7 },
    identifyPowder: 1,
    desc: "未鑑定装備を1つ鑑定する。"
  },
  {
    resultId: "EYE_DROPS",
    name: "目薬",
    mats: { "霊粉": 1 },
    desc: "使用すると盲目状態を解除する。"
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
      mats: { "鉄片": 2, "魔石片": 1 }
    };
  } else if (item.type === "shield" || item.type === "armor") {
    return {
      mats: { "鉄片": 1, "硬い皮": 2 }
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

  // 鑑定粉はITEMSに存在しない出発クラフト専用の疑似レシピ。
  if (recipe.identifyPowder) {
    addLog("鑑定粉は出発時のクラフトでのみ作成できます。");
    return false;
  }

  // バッグ空きチェック
  if (state.inventory.length >= 20) {
    addLog("バッグがいっぱいです。");
    return false;
  }

  if (!recipe.mats) {
    addLog("このレシピは出発時のクラフトでのみ作成できます。");
    return false;
  }

  // 素材チェック
  for (const [mat, reqQty] of Object.entries(recipe.mats)) {
    const curQty = state.metaMaterials[mat] || 0;
    if (curQty < reqQty) {
      addLog(`素材 [${mat}] が不足しています。`);
      return false;
    }
  }

  // 消費
  for (const [mat, reqQty] of Object.entries(recipe.mats)) {
    state.metaMaterials[mat] -= reqQty;
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

  // 素材チェック
  for (const [mat, reqQty] of Object.entries(cost.mats)) {
    const curQty = state.metaMaterials[mat] || 0;
    if (curQty < reqQty) {
      addLog(`素材 [${mat}] が不足しています。`);
      return false;
    }
  }

  // 消費
  for (const [mat, reqQty] of Object.entries(cost.mats)) {
    state.metaMaterials[mat] -= reqQty;
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

  const hasCore = typeof eqItem === "object" && (eqItem.affixes || []).some(affix => {
    const definition = getAffixDefinition(affix);
    return (affix.kind || definition?.kind) === "core";
  });
  if (hasCore) return null;

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
  addLog("工房はアンロック専用です。装備の分解は廃止されました。");
  return false;
}

export function getPolishCost(eqItem) {
  if (!eqItem || typeof eqItem !== "object" || eqItem.identified === false || eqItem.polished) return null;
  const hasSupport = (eqItem.affixes || []).some(affix => {
    const definition = getAffixDefinition(affix);
    return (affix.kind || definition?.kind || "support") === "support" && definition?.enabled;
  });
  return hasSupport ? AFFIX_BALANCE.polishCost : null;
}

export function polishSupportAffix(eqItem, affixIdx) {
  if (!getPolishCost(eqItem)) return false;
  const affix = eqItem.affixes?.[affixIdx];
  const definition = getAffixDefinition(affix);
  if (!affix || (affix.kind || definition?.kind || "support") !== "support" || !definition?.enabled) {
    return false;
  }
  affix.value = Math.ceil(affix.value * 1.5);
  eqItem.polished = true;
  return true;
}

export function executePolish(itemIdx, affixIdx) {
  let eqItem;
  let isEquipped = false;
  let actorIdx;
  let slot;

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

  const cost = getPolishCost(eqItem);
  if (!cost) {
    addLog("この装備は研磨できません。");
    return false;
  }
  for (const [mat, reqQty] of Object.entries(cost.mats)) {
    if ((state.metaMaterials[mat] || 0) < reqQty) {
      addLog(`素材 [${mat}] が不足しています。`);
      return false;
    }
  }

  const polishedItem = {
    ...eqItem,
    affixes: (eqItem.affixes || []).map(affix => ({ ...affix }))
  };
  if (!polishSupportAffix(polishedItem, affixIdx)) {
    addLog("コアは研磨できません。");
    return false;
  }

  for (const [mat, reqQty] of Object.entries(cost.mats)) {
    state.metaMaterials[mat] -= reqQty;
  }
  if (isEquipped) {
    state.party[actorIdx].equipment[slot] = polishedItem;
  } else {
    const idx = itemIdx && typeof itemIdx === "object" ? itemIdx.index : itemIdx;
    state.inventory[idx] = polishedItem;
  }

  const item = getItemData(polishedItem);
  const affix = polishedItem.affixes[affixIdx];
  addLog(`[工房] [${item.name}] の [${getAffixDefinition(affix)?.jpName || affix.type}] を研磨しました！`);
  playSound("level_up");
  saveAutosave();
  return true;
}
