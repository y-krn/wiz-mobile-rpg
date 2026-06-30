import { state } from "../state.js";
import { getItemBaseId, getItemData, getCharAffixSum, getCharDerivedStats, getClassPassive } from "../data.js";

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

  const rarity = eqItem.rarity || "magic";
  const rarityCoeff = { magic: 0.5, rare: 1.0, epic: 1.5 }[rarity] || 0.5;
  const baseCost = Math.floor((item.price || 0) * rarityCoeff);

  const bestDiscount = state.party.reduce((max, char) => {
    if (char.status === "dead") return max;
    return Math.max(max, getCharAffixSum(char, "identifyDiscount"));
  }, 0);
  return Math.max(1, Math.floor(baseCost * (1 - bestDiscount / 100)));
}

const DERIVED_COMPARE_ROWS = [
  { key: "attack", label: "攻撃" },
  { key: "defense", label: "防御" },
  { key: "magic", label: "魔力" },
  { key: "healing", label: "回復" },
  { key: "speed", label: "速度" },
  { key: "trap", label: "罠解除" },
  { key: "treasure", label: "探宝" }
];

const SYNERGY_AFFIX_LABELS = {
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

export function getEquipmentPreview(char, eqItem) {
  const item = getItemData(eqItem);
  if (!item || !["weapon", "shield", "armor"].includes(item.type)) return null;

  const current = getCharDerivedStats(char);
  const slot = item.type;
  const oldEq = char.equipment[slot];
  char.equipment[slot] = eqItem;
  const next = getCharDerivedStats(char);
  char.equipment[slot] = oldEq;

  const diffs = DERIVED_COMPARE_ROWS
    .map(row => ({ ...row, diff: next[row.key] - current[row.key] }))
    .filter(row => row.diff !== 0);

  const passive = getClassPassive(char);
  const itemAffixTypes = new Set((eqItem.affixes || []).map(aff => aff.type));
  if (eqItem.inscription) {
    itemAffixTypes.add(eqItem.inscription.type);
  }
  const synergies = Object.keys(passive.bonuses)
    .filter(type => itemAffixTypes.has(type) && SYNERGY_AFFIX_LABELS[type])
    .map(type => SYNERGY_AFFIX_LABELS[type]);

  return { diffs, synergies };
}

export function formatEquipmentPreview(preview) {
  if (!preview) return "差分なし";
  const diffText = preview.diffs.length > 0
    ? preview.diffs.slice(0, 4).map(row => `${row.label}${row.diff > 0 ? "+" : ""}${row.diff}`).join(" / ")
    : "主要差分なし";
  if (preview.synergies.length === 0) return diffText;
  return `${diffText} / ${preview.synergies.join(" / ")}`;
}
