import { ITEMS } from "../data/items.js";
import { generateRandomAccessory, generateRandomEquipment } from "../systems/equipment_generation.js";
import { getCharAffixSum } from "./item_rules.js";

// 宝箱の抽選ルール。`src/chest.js` の UI/state 遷移とバランスsimの双方がここを叩く。
// sim 側で写経すると src の変更に追随せず、深層のバランスを無音で誤って測るため
// （#273）、抽選は必ずこのモジュールを唯一の出所とする。
//
// 乱数の消費順が仕様の一部である点に注意。呼び出し順を変えると同一seedでも
// 結果が変わり、以後の before/after 比較が成立しなくなる。

// 宝箱の装身具は B2、本体装備は B3 から core を解禁する（#270）。
export const CHEST_ACCESSORY_CORE_MIN_FLOOR = 2;
export const CHEST_EQUIPMENT_CORE_MIN_FLOOR = 3;
// src/chest.jsのsmashChestとsimの内容損失判定で共有する。
export const CHEST_USABLE_BREAK_CHANCE = 0.30;

function getChestItemData(item) {
  if (!item) return null;
  const itemId = typeof item === "object"
    ? item.baseId || item.key || item.id
    : item;
  return ITEMS[itemId] || (typeof item === "object" ? item : null);
}

// item品質を共通通貨へ換算する既存ルールはないため、生成済みmain itemの存在を
// 1 content unitとして扱う。内容の有無とusable破損率だけを方針へ渡す。
export function calculateChestMainItemExpectedValue(item) {
  return getChestItemData(item) ? 1 : 0;
}

export function calculateChestMainItemForcedLossRate(item) {
  return getChestItemData(item)?.type === "usable"
    ? CHEST_USABLE_BREAK_CHANCE
    : 0;
}

export const CHEST_ITEM_CANDIDATES_BY_FLOOR = Object.freeze({
  1: ["DAGGER", "WAND", "MACE", "RAPIER", "BUCKLER", "SMALL_SHIELD", "ROBE", "LEATHER_ARMOR", "EXPLORER_CLOAK", "HEAL_POTION", "ANTIDOTE", "EYE_DROPS", "WAKE_POWDER"],
  2: ["DAGGER", "WAND", "SHORT_SWORD", "RAPIER", "MACE", "SACRED_MACE", "SMALL_SHIELD", "BUCKLER", "ROBE", "LEATHER_ARMOR", "EXPLORER_CLOAK", "SCALE_MAIL", "MAGE_CLOAK", "HEAL_POTION", "ANTIDOTE", "EYE_DROPS", "PARALYZE_CURE", "WAKE_POWDER", "MANA_POTION", "HOLY_WATER", "TOWN_PORTAL", "TRAP_KIT", "STR_POTION", "HASTE_POTION"],
  3: ["SHORT_SWORD", "RAPIER", "NINJA_DAGGER", "VENOM_FANG", "LONG_SWORD", "MACE", "SACRED_MACE", "SAGE_STAFF", "SMALL_SHIELD", "LARGE_SHIELD", "MAGIC_SHIELD", "LEATHER_ARMOR", "EXPLORER_CLOAK", "NINJA_SUIT", "SCALE_MAIL", "CHAIN_MAIL", "ARCANE_ROBE", "HEAL_POTION", "GREATER_HEAL", "MANA_POTION", "ETHER", "HOLY_WATER", "PANACEA", "TOWN_PORTAL", "TRAP_KIT", "STR_POTION", "HASTE_POTION"],
  // B4F: 標準宝箱は上位の店売り装備のみを落とす
  4: ["CLAYMORE", "PLATE_MAIL", "PRIEST_ROBE", "KNIGHT_SHIELD", "MAGIC_SHIELD", "NINJA_DAGGER", "VENOM_FANG", "NINJA_BLADE", "HOLY_STAFF", "FLAME_SWORD", "NINJA_SUIT", "CHAIN_MAIL", "ARCANE_ROBE", "BATTLE_GARB", "GREATER_HEAL", "ETHER", "HOLY_WATER", "PANACEA", "TRAP_KIT", "STR_POTION", "HASTE_POTION"],
  5: ["CLAYMORE", "PLATE_MAIL", "PRIEST_ROBE", "KNIGHT_SHIELD", "MAGIC_SHIELD", "NINJA_BLADE", "HOLY_STAFF", "FLAME_SWORD", "ARCH_WAND", "BATTLE_GARB", "SORCERER_ROBE", "GREATER_HEAL", "ETHER", "HOLY_WATER", "PANACEA", "TOWN_PORTAL", "TRAP_KIT", "STR_POTION", "HASTE_POTION"]
});

const DANGEROUS_TRAPS = ["poison needle", "gas bomb", "teleporter"];

export function rollChestTrap(floor, rng) {
  if (floor === 1) {
    const r = rng();
    if (r < 0.35) return "none";
    if (r < 0.60) return "poison needle";
    if (r < 0.85) return "flash bomb";
    return "gas bomb";
  }

  let traps = ["poison needle", "gas bomb", "teleporter", "flash bomb", "none"];
  if (floor === 2) {
    // B2F: 毒針を中程度（約28%）に抑える
    traps = ["poison needle", "poison needle", "gas bomb", "teleporter", "flash bomb", "none", "none"];
  } else if (floor === 4) {
    // B4F: テレポーター・ガス爆弾を増やし、none は 12.5%(1/8)
    traps = ["gas bomb", "gas bomb", "teleporter", "teleporter", "flash bomb", "poison needle", "poison needle", "none"];
  } else if (floor === 5) {
    // B5F: 極めて危険。テレポーター偏重で none は 8.3%(1/12)
    traps = ["gas bomb", "gas bomb", "teleporter", "teleporter", "teleporter", "teleporter", "poison needle", "poison needle", "flash bomb", "flash bomb", "flash bomb", "none"];
  }
  return traps[Math.floor(rng() * traps.length)];
}

export function rollChestAccessory(floor, rng, party, coreMinFloor = CHEST_ACCESSORY_CORE_MIN_FLOOR) {
  const chance = floor >= 5 ? 0.16 : (floor === 4 ? 0.14 : (floor === 3 ? 0.12 : 0.08));
  if (rng() >= chance) return null;
  const rarityRoll = rng();
  let rarity = null;
  if (floor >= 4 && rarityRoll < 0.10) {
    rarity = "epic";
  } else if (rarityRoll < 0.35) {
    rarity = "rare";
  }
  // #270: 宝箱の装身具のみ B2 から core を解禁。実src経路のsim（N=500、工房解放済み）で
  // 前半core遭遇 65.4%→71.6%、前半core装備 58.2%→66.8%、平均到達 B4.77→B5.04。
  // 本体装備は B3 のまま（B2両方の解禁は深層core遭遇が 2.6%→1.8% に落ち二相構造が薄れるため）。
  return generateRandomAccessory(floor, {
    forceRarity: rarity,
    rng,
    party,
    allowCores: floor >= coreMinFloor
  });
}

// 宝箱の本体報酬を1つ抽選する。`firstChestGuaranteed` はラン中に初回確定枠を
// 使い切ったかどうか（`state.firstChestUnidentifiedGuaranteed`）。呼び出し側は
// 戻り値の `consumedFirstChestGuarantee` を見てフラグを立てる。
export function rollChestReward({
  floor,
  rng,
  party,
  currentRun = null,
  trap,
  firstChestGuaranteed = false,
  coreMinFloor = CHEST_EQUIPMENT_CORE_MIN_FLOOR,
  itemCandidateFilter = null
}) {
  let isGuaranteed = false;
  if (floor === 1) {
    if (currentRun) {
      const b1Opened = currentRun.b1ChestsOpened || 0;
      const b1Found = currentRun.b1EquipFound || 0;
      if (b1Opened >= 3 && b1Found === 0) {
        isGuaranteed = true;
      }
    }
    if (!isGuaranteed && !firstChestGuaranteed) {
      isGuaranteed = true;
    }
  }

  let itemChance = floor >= 5 ? 0.85 : (floor === 4 ? 0.75 : 0.50);
  if (floor === 1 && currentRun && (currentRun.b1EquipFound || 0) === 0) {
    const b1Opened = currentRun.b1ChestsOpened || 1;
    itemChance += (b1Opened - 1) * 0.15;
  }

  if (!isGuaranteed && rng() >= itemChance) {
    return { item: null, consumedFirstChestGuarantee: false };
  }

  if (isGuaranteed) {
    const item = generateRandomEquipment(floor, {
      forceRarity: "magic",
      rng,
      party,
      excludeHighEnd: true,
      allowCores: floor >= coreMinFloor
    });
    return { item, consumedFirstChestGuarantee: floor === 1 };
  }

  const chestFloor = Math.min(5, floor);
  // 想定外の floor で候補キーが欠けても quest を出さない保険として fallback を残す。
  let candidates = CHEST_ITEM_CANDIDATES_BY_FLOOR[chestFloor]
    || Object.keys(ITEMS).filter(key => ITEMS[key].type !== "quest");
  if (itemCandidateFilter) {
    candidates = candidates.filter(itemCandidateFilter);
  }
  let item = candidates[Math.floor(rng() * candidates.length)];

  const itemData = ITEMS[item];
  if (!itemData || !["weapon", "armor", "shield"].includes(itemData.type)) {
    return { item, consumedFirstChestGuarantee: false };
  }

  const isDangerousTrap = DANGEROUS_TRAPS.includes(trap);
  let randChance;
  if (chestFloor === 4) {
    randChance = isDangerousTrap ? 0.80 : 0.70;
  } else if (chestFloor === 5) {
    randChance = 0.90;
  } else {
    // B1F/B2F/B3F
    randChance = isDangerousTrap ? 0.70 : 0.50;
  }

  // 救済: まだ装備を1つも拾っておらず、3個目以降の宝箱なら底上げする
  if (currentRun && currentRun.equipmentFound && currentRun.equipmentFound.length === 0 && currentRun.chestsOpened >= 2) {
    randChance += 0.20;
  }

  if (party) {
    const senseSum = party.reduce((sum, character) => {
      if (character.status === "dead") return sum;
      return sum + getCharAffixSum(character, "treasureSense");
    }, 0);
    randChance += Math.min(25, senseSum) / 100;
  }

  randChance = Math.min(0.90, randChance);

  if (rng() < randChance) {
    item = generateRandomEquipment(floor, {
      forceRarity: null,
      rng,
      party,
      excludeHighEnd: true,
      allowCores: floor >= coreMinFloor
    });
  }
  return { item, consumedFirstChestGuarantee: false };
}
