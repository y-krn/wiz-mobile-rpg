import { state } from "../state.js";
import {
  getItemBaseId,
  getItemData,
  getCharAffixSum,
  getCharAgi,
  getCharDerivedStats,
  getCharInt,
  getCharLuk,
  getCharMaxHp,
  getCharMaxMp,
  getCharPie,
  getCharStr,
  getCharVit,
  getClassPassive
} from "../data.js";

export function getItemOwnership(key) {
  let bagCount = 0;
  let equippedCount = 0;

  state.inventory.forEach(item => {
    if (item) {
      if (getItemBaseId(item) === key) bagCount++;
    }
  });

  state.party.forEach(char => {
    if (char && char.equipment) {
      Object.values(char.equipment).forEach(eq => {
        if (eq) {
          if (getItemBaseId(eq) === key) equippedCount++;
        }
      });
    }
  });

  const total = bagCount + equippedCount;
  return { total, bagCount, equippedCount };
}

export function getAppraisalCost(eqItem) {
  const item = getItemData(eqItem);
  if (!item) return 30;
  const valuedItem = typeof eqItem === "object" && eqItem !== null
    ? getItemData({ ...eqItem, identified: true })
    : item;

  const rarity = eqItem.rarity || "magic";
  const rarityCoeff = { magic: 0.5, rare: 1.0, epic: 1.5 }[rarity] || 0.5;
  const baseCost = Math.floor((valuedItem?.price || item.price || 0) * rarityCoeff);

  const bestDiscount = state.party.reduce((max, char) => {
    if (char.status === "dead") return max;
    return Math.max(max, getCharAffixSum(char, "identifyDiscount"));
  }, 0);
  return Math.max(1, Math.floor(baseCost * (1 - bestDiscount / 100)));
}

export function isDisposalSaleItem(itemVal) {
  return typeof itemVal === "object" && itemVal !== null && itemVal.halfIdentified && !itemVal.identified;
}

export function canSellItem(itemVal) {
  return !(typeof itemVal === "object" && itemVal !== null && !itemVal.identified && !itemVal.halfIdentified);
}

export function getSalePrice(itemVal) {
  const item = getItemData(itemVal);
  if (!item) return 0;
  const valuedItem = typeof itemVal === "object" && itemVal !== null
    ? getItemData({ ...itemVal, identified: true })
    : item;
  const basePrice = valuedItem?.price || item.price || 0;
  if (isDisposalSaleItem(itemVal)) return Math.min(Math.floor(basePrice * 0.1), 10);
  return Math.floor(basePrice * 0.5);
}

const DERIVED_COMPARE_ROWS = [
  { key: "attack", label: "攻撃" },
  { key: "defense", label: "防御" },
  { key: "maxHp", label: "最大HP" },
  { key: "maxMp", label: "最大MP" },
  { key: "str", label: "力" },
  { key: "int", label: "知恵" },
  { key: "pie", label: "信仰" },
  { key: "vit", label: "生命" },
  { key: "agi", label: "素早さ" },
  { key: "luk", label: "運" },
  { key: "magic", label: "魔力" },
  { key: "healing", label: "回復" },
  { key: "speed", label: "速度" },
  { key: "trap", label: "罠解除" },
  { key: "treasure", label: "探宝" },
  { key: "spellGuard", label: "魔法耐性" },
  { key: "antiDragon", label: "竜特効" },
  { key: "antiUndead", label: "不死特効" },
  { key: "firstStrike", label: "先制" },
  { key: "poisonWard", label: "毒耐性" }
];

const AFFINITY_AFFIX_LABELS = {
  followUp: "追撃適性あり",
  arcane: "魔導適性あり",
  devotion: "祈祷適性あり",
  guardian: "守護適性あり",
  treasureSense: "探宝適性あり",
  trapBonus: "罠解除適性あり",
  antiUndead: "不死祓い適性あり",
  antiDemon: "悪魔祓い適性あり",
  antiDragon: "竜殺し適性あり",
  spellGuard: "魔除け適性あり",
  poisonWard: "毒避け適性あり",
  firstStrike: "先制適性あり"
};

function getCompareStats(char) {
  const derived = getCharDerivedStats(char);
  return {
    ...derived,
    maxHp: getCharMaxHp(char),
    maxMp: getCharMaxMp(char),
    str: getCharStr(char),
    int: getCharInt(char),
    pie: getCharPie(char),
    vit: getCharVit(char),
    agi: getCharAgi(char),
    luk: getCharLuk(char),
    spellGuard: getCharAffixSum(char, "spellGuard"),
    antiDragon: getCharAffixSum(char, "antiDragon"),
    antiUndead: getCharAffixSum(char, "antiUndead"),
    firstStrike: getCharAffixSum(char, "firstStrike"),
    poisonWard: getCharAffixSum(char, "poisonWard")
  };
}

export function getEquipmentPreview(char, eqItem) {
  const item = getItemData(eqItem);
  if (!item || !["weapon", "shield", "armor", "accessory"].includes(item.type)) return null;

  const current = getCompareStats(char);
  const slot = item.type;
  const oldEq = char.equipment[slot];
  char.equipment[slot] = eqItem;
  const next = getCompareStats(char);
  char.equipment[slot] = oldEq;

  const diffs = DERIVED_COMPARE_ROWS
    .map(row => ({ ...row, diff: next[row.key] - current[row.key] }))
    .filter(row => row.diff !== 0);

  const passive = getClassPassive(char);
  const itemAffixTypes = new Set((eqItem.affixes || []).map(aff => aff.type));
  if (eqItem.inscription) {
    itemAffixTypes.add(eqItem.inscription.type);
  }
  const affinities = Object.keys(passive.bonuses)
    .filter(type => itemAffixTypes.has(type) && AFFINITY_AFFIX_LABELS[type])
    .map(type => AFFINITY_AFFIX_LABELS[type]);

  return { diffs, affinities };
}

export function formatEquipmentPreview(preview) {
  if (!preview) return "差分なし";
  const diffText = preview.diffs.length > 0
    ? preview.diffs.slice(0, 4).map(row => `${row.label}${row.diff > 0 ? "+" : ""}${row.diff}`).join(" / ")
    : "主要差分なし";
  if (preview.affinities.length === 0) return diffText;
  return `${diffText} / ${preview.affinities.join(" / ")}`;
}
