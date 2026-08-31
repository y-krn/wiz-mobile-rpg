import { state, saveAutosave, addLog } from "./state.js";
import { getItemData } from "./data.js";
import { playSound } from "./audio.js";
import { AFFIX_BALANCE, getAffixDefinition } from "./data/affixes.js";
import { replaceRunObjectLoot } from "./state/run_loot.js";

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
    resultId: "NOISE_BALL",
    name: "鳴らし玉",
    mats: { "獣の牙": 1, "魔石片": 1 },
    desc: "指定方向へ投げると、次の数歩以内に通常の魔物を呼び寄せる。"
  },
  {
    resultId: "SILENCE_INCENSE",
    name: "静寂の香",
    mats: { "霊粉": 1, "呪布": 1 },
    desc: "焚くと、しばらく通常の魔物に気づかれにくくなる。"
  },
  {
    resultId: "TOWN_PORTAL",
    name: "帰還の翼",
    departureCost: { mode: "any", total: 8 },
    desc: "任意のフロアから安全に撤退し、未確定戦果を選んで持ち帰る。素材は100%持ち帰る。"
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
  if (typeof eqItem === "object" && eqItem.identified !== true) return null;

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
  replaceRunObjectLoot(state, eqItem, upgradedItem);
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

export function getPolishCost(eqItem) {
  if (!eqItem || typeof eqItem !== "object" || eqItem.identified !== true || eqItem.polished) return null;
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
  replaceRunObjectLoot(state, eqItem, polishedItem);
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
