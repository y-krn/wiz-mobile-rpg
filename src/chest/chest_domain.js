import { getCharAffixSum } from "../data.js";
import {
  CHEST_ITEM_CANDIDATES_BY_FLOOR_FROM_DROP,
  rollChestAccessory,
  rollChestReward,
  rollChestSpecialReward,
  rollChestTrap
} from "../rules/chest_rules.js";
import { getChestMaterialPool } from "../rules/material_rules.js";
import { createRng } from "../seed_rng.js";

// Chest formulas remain owned by the existing chest/rule balance mapping;
// this module exposes them through explicit inputs without changing values.
export const CHEST_PHASES = Object.freeze({
  MENU: "menu",
  DISARM_SELECT: "disarm_select",
  OPEN_SELECT: "open_select",
  RESOLVING: "resolving",
  REWARD: "reward",
  TERMINAL: "terminal"
});

export const CHEST_PHASE_TRANSITIONS = Object.freeze({
  [CHEST_PHASES.MENU]: [CHEST_PHASES.MENU, CHEST_PHASES.RESOLVING, CHEST_PHASES.TERMINAL],
  // Kept for compatibility with stale in-memory states from the former
  // party-selection flow. New chest actions never enter these phases.
  [CHEST_PHASES.DISARM_SELECT]: [CHEST_PHASES.MENU, CHEST_PHASES.RESOLVING],
  [CHEST_PHASES.OPEN_SELECT]: [CHEST_PHASES.MENU, CHEST_PHASES.RESOLVING],
  [CHEST_PHASES.RESOLVING]: [CHEST_PHASES.REWARD, CHEST_PHASES.MENU, CHEST_PHASES.TERMINAL],
  [CHEST_PHASES.REWARD]: [CHEST_PHASES.TERMINAL],
  [CHEST_PHASES.TERMINAL]: []
});

const ELIGIBLE_STATUSES = new Set(["ok", "poisoned", "blind"]);
const FALSE_TRAPS = ["poison needle", "gas bomb", "teleporter", "flash bomb", "none"];
const CHEST_TAG_LABELS = Object.freeze({
  followUp: "連撃",
  spellPower: "術力",
  arcane: "秘術",
  devotion: "神聖",
  guardian: "守護",
  treasureSense: "宝探",
  trapBonus: "技巧",
  antiUndead: "不死祓い",
  antiDragon: "竜殺し",
  spellGuard: "魔除け",
  poisonWard: "毒避け",
  firstStrike: "先制"
});

export function getChestPhase(chest) {
  return chest?.phase || CHEST_PHASES.MENU;
}

export function canTransitionChestPhase(chest, nextPhase) {
  return Boolean(CHEST_PHASE_TRANSITIONS[getChestPhase(chest)]?.includes(nextPhase));
}

export function isChestActionAllowed(chest, phases, transitioning = false, { allowTransition = false } = {}) {
  if (!chest || (transitioning && !allowTransition)) return false;
  return phases.includes(getChestPhase(chest));
}

export function isEligibleChestCharacter(char, party = []) {
  return Boolean(char && party.includes(char) && ELIGIBLE_STATUSES.has(char.status));
}

export function getActiveChestCharacter(party = []) {
  return party.find(char => isEligibleChestCharacter(char, party)) || null;
}

export function getChestRewardEntries(chest) {
  return [
    { role: "main", item: chest?.item },
    { role: "special", item: chest?.specialItem },
    { role: "accessory", item: chest?.accessoryItem }
  ];
}

export function calculateChestInspectionChance({ party = [], lightPower = "", lightTurns = 0 } = {}) {
  const thief = party.find(char => char.class === "Thief" && ELIGIBLE_STATUSES.has(char.status));
  let chance = thief ? 0.85 : 0.30;
  if (thief?.status === "blind") {
    chance /= 2;
  } else if (!thief && party.some(char => ELIGIBLE_STATUSES.has(char.status) && char.status === "blind")) {
    chance /= 2;
  }
  const lightBonus = lightPower === "lomilwa" ? 0.25 : (lightTurns > 0 ? 0.15 : 0);
  return {
    chance: Math.min(0.95, chance + lightBonus),
    lightBonus
  };
}

export function resolveChestInspection({ chest, party = [], lightPower = "", lightTurns = 0, rng = Math.random } = {}) {
  const { chance, lightBonus } = calculateChestInspectionChance({ party, lightPower, lightTurns });
  const identifiedTrap = rng() < chance
    ? chest?.trap
    : FALSE_TRAPS[Math.floor(rng() * FALSE_TRAPS.length)];
  return { chance, lightBonus, identifiedTrap };
}

export function createChestLootHint({ item, accessoryItem, party = [], rng = Math.random } = {}) {
  let aura = "weak";
  let hasEquipmentSignal = false;
  if (item && typeof item === "object" && item.kind === "equipment") {
    hasEquipmentSignal = true;
    if (item.rarity === "epic") aura = "strong";
    else if (item.rarity === "rare") aura = "medium";
  }
  if (accessoryItem) {
    hasEquipmentSignal = true;
    if (accessoryItem.rarity === "epic") aura = "strong";
    else if (accessoryItem.rarity === "rare" && aura !== "strong") aura = "medium";
  }

  let label = hasEquipmentSignal ? "装備品の反応あり" : "消耗品または反応なし";
  if (hasEquipmentSignal) {
    const senseSum = party.reduce((sum, char) => (
      char.status === "dead" ? sum : sum + getCharAffixSum(char, "treasureSense")
    ), 0);
    const shouldRevealTag = senseSum >= 5 || rng() < 0.20;
    const hintedAffix = item?.affixes?.find(affix => CHEST_TAG_LABELS[affix.type]);
    const hintedAccessoryAffix = accessoryItem?.affixes?.find(affix => CHEST_TAG_LABELS[affix.type]);
    if (shouldRevealTag && (hintedAffix || hintedAccessoryAffix)) {
      const affixType = hintedAffix?.type || hintedAccessoryAffix.type;
      label = `${label} / 気配:${CHEST_TAG_LABELS[affixType]}`;
    }
  }
  return { hasEquipmentSignal, aura, label };
}

export function rollChestEncounter({
  floor,
  x,
  y,
  seed,
  party = [],
  currentRun = null,
  firstChestGuaranteed = false,
  forcedTrap = null,
  forcedItem = null,
  customRng = null,
  fromDrop = false
} = {}) {
  const chestSeed = `${seed}:chest:B${floor}:${x},${y}`;
  const rng = customRng || (seed ? createRng(chestSeed) : Math.random);
  const trap = forcedTrap !== null ? forcedTrap : rollChestTrap(floor, rng);
  let item;
  let consumedFirstChestGuarantee = false;
  if (forcedItem !== null) {
    item = forcedItem;
  } else {
    const reward = rollChestReward({
      floor,
      rng,
      party,
      currentRun,
      trap,
      firstChestGuaranteed,
      itemCandidates: fromDrop
        ? CHEST_ITEM_CANDIDATES_BY_FLOOR_FROM_DROP[Math.max(1, Math.min(30, Math.floor(Number(floor)) || 1))]
        : null
    });
    item = reward.item;
    consumedFirstChestGuarantee = reward.consumedFirstChestGuarantee;
  }
  const specialItem = forcedItem === null && !fromDrop
    ? rollChestSpecialReward(floor, rng)
    : null;
  const accessoryItem = forcedItem === null ? rollChestAccessory(floor, rng, party) : null;
  return {
    trap,
    item,
    specialItem,
    accessoryItem,
    consumedFirstChestGuarantee,
    lootHint: createChestLootHint({ item, accessoryItem, party, rng })
  };
}

export function generateChestMaterials(floor, rng = Math.random, bonus = 0, { materialPoolProfile } = {}) {
  const mats = {};
  const qty = Math.floor(rng() * 3) + 1 + bonus;
  const pool = getChestMaterialPool(floor, { profile: materialPoolProfile });
  for (let i = 0; i < qty; i++) {
    const mat = pool[Math.floor(rng() * pool.length)];
    mats[mat] = (mats[mat] || 0) + 1;
  }
  return mats;
}
