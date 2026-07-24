/* global console, process */

// Mock localStorage for the Node.js simulation environment before imports.
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  },
  configurable: true
});

const {
  SOLO_CLASSES,
  createDefaultCurrentRun,
  createSoloCharacter
} = await import("../src/state/initial_state.js");
const { ELITE_CLASSES } = await import("../src/data/classes.js");
const { generateEncounter } = await import("../src/combat_ui/encounter.js");
const { runCombatRoundCalculation } = await import("../src/combat_logic.js");
const { applyCombatRewards } = await import("../src/combat_logic/rewards.js");
const { checkCharLevelUp } = await import("../src/systems/leveling.js");
const { SPELL_EFFECTS } = await import("../src/systems/spell_effects.js");
const { assignRunQuests, updateRunQuests } = await import("../src/systems/run_quests.js");
const { generateRunFloor } = await import("../src/run_map_generator.js");
const { getFloorTemplate } = await import("../src/data/floor_templates.js");
const { EVENT_TYPES } = await import("../src/constants/events.js");
const { generateChestMaterials } = await import("../src/chest.js");
const { AFFIX_BALANCE, CORE_AFFIXES } = await import("../src/data/affixes.js");
const { ITEMS } = await import("../src/data/items.js");
const { MATERIAL_DROP_BALANCE } = await import("../src/data/materials.js");
const { IDENTIFICATION_BALANCE } = await import("../src/rules/identification_rules.js");
const {
  canEquipCoreAffix,
  getEquippedCoreAffixes,
  hasCoreAffix
} = await import("../src/rules/affix_rules.js");
const { bankRunMaterials, getBankedMaterials } = await import("../src/rules/material_rules.js");
const { addInventoryItemToState } = await import("../src/state/inventory_state.js");
const {
  generateRandomAccessory,
  generateRandomEquipment,
  getCharAffixSum,
  getCharAgi,
  getCharDef,
  getCharInt,
  getCharMaxHp,
  getCharPie,
  getCharStr,
  getCharVit,
  getCharWeaponAtk,
  getItemData
} = await import("../src/data.js");
const { ITEM_EFFECTS } = await import("../src/systems/item_effects.js");

const RUNS_PER_CASE = Math.max(1, Number(process.env.SIM_RUNS || 500));
const SIM_SEED = Number(process.env.SIM_SEED || 231) >>> 0;
const TARGET_DEPTHS = [5, 10, 15, 20];
const MAX_COMBAT_TURNS = 50;

// 仮値・感度分析対象: critical pathに対する寄り道込み歩数を1.4倍と置く。
const EXPLORATION_FACTOR = 1.4;
// 仮値・感度分析対象: 探索係数1.4に対応し、配置宝箱の70%を拾えると置く。
const CHEST_PICKUP_RATE = 0.7;
// 仮値・感度分析対象: 戦闘1ターンを探索3歩相当と置く。
const COMBAT_TURN_WEIGHT = 3;
// 実run開始準拠: 傷薬2個のみ補給対象とし、宝箱・商人からの追加補給はモデル化しない。
const INITIAL_HEAL_POTIONS = 2;
// 仮値・感度分析対象: 戦闘中/戦闘後HPが最大HPの35%以下なら傷薬を1個使う。
const HEAL_POTION_THRESHOLD = 0.35;
// 仮値・感度分析対象: 最大HPの35%以下なら次の自ターンで逃走する。
const FLEE_HP_THRESHOLD = 0.35;
const SIM_CLASSES = SOLO_CLASSES.filter(className => !ELITE_CLASSES.includes(className));
const CORE_AFFIX_IDS = new Set(CORE_AFFIXES.map(affix => affix.id));
const EARLY_BUILD_MAX_FLOOR = 10;
// 仮定: 装備スコアは攻防を主軸に、HP・主要能力・戦闘affixを下記重みで合算する。
const EQUIPMENT_SCORE_WEIGHTS = Object.freeze({
  weaponAtk: 2,
  defense: 2,
  maxHp: 0.25,
  str: 1,
  vit: 1,
  int: 0.5,
  pie: 0.5,
  agi: 0.25,
  guardian: 0.2,
  spellGuard: 0.15,
  followUp: 0.15,
  firstStrike: 0.1,
  arcane: 0.1,
  devotion: 0.1
});
// #231では素材EV比較に集中するため、ドロップ装備は鑑定済み・呪いなしとして評価する。
// 未鑑定・呪いリスクは#236の対象。コア1個制限は実canEquipCoreAffixで維持する。

const HOLY_TAGS = new Set(["undead", "spirit", "demon"]);
const CHEST_ITEM_CANDIDATES_BY_FLOOR = Object.freeze({
  1: ["DAGGER", "WAND", "MACE", "RAPIER", "BUCKLER", "SMALL_SHIELD", "ROBE", "LEATHER_ARMOR", "EXPLORER_CLOAK", "HEAL_POTION", "ANTIDOTE", "EYE_DROPS", "WAKE_POWDER"],
  2: ["DAGGER", "WAND", "SHORT_SWORD", "RAPIER", "MACE", "SACRED_MACE", "SMALL_SHIELD", "BUCKLER", "ROBE", "LEATHER_ARMOR", "EXPLORER_CLOAK", "SCALE_MAIL", "MAGE_CLOAK", "HEAL_POTION", "ANTIDOTE", "EYE_DROPS", "PARALYZE_CURE", "WAKE_POWDER", "MANA_POTION", "HOLY_WATER", "TOWN_PORTAL", "TRAP_KIT"],
  3: ["SHORT_SWORD", "RAPIER", "NINJA_DAGGER", "VENOM_FANG", "LONG_SWORD", "MACE", "SACRED_MACE", "SAGE_STAFF", "SMALL_SHIELD", "LARGE_SHIELD", "MAGIC_SHIELD", "LEATHER_ARMOR", "EXPLORER_CLOAK", "NINJA_SUIT", "SCALE_MAIL", "CHAIN_MAIL", "ARCANE_ROBE", "HEAL_POTION", "GREATER_HEAL", "MANA_POTION", "ETHER", "HOLY_WATER", "PANACEA", "TOWN_PORTAL", "TRAP_KIT"],
  4: ["CLAYMORE", "PLATE_MAIL", "PRIEST_ROBE", "KNIGHT_SHIELD", "MAGIC_SHIELD", "NINJA_DAGGER", "VENOM_FANG", "NINJA_BLADE", "HOLY_STAFF", "FLAME_SWORD", "NINJA_SUIT", "CHAIN_MAIL", "ARCANE_ROBE", "BATTLE_GARB", "GREATER_HEAL", "ETHER", "HOLY_WATER", "PANACEA", "TRAP_KIT"],
  5: ["CLAYMORE", "PLATE_MAIL", "PRIEST_ROBE", "KNIGHT_SHIELD", "MAGIC_SHIELD", "NINJA_BLADE", "HOLY_STAFF", "FLAME_SWORD", "ARCH_WAND", "BATTLE_GARB", "SORCERER_ROBE", "GREATER_HEAL", "ETHER", "HOLY_WATER", "PANACEA", "TOWN_PORTAL", "TRAP_KIT"]
});

let randomState = SIM_SEED;
Math.random = () => {
  randomState += 0x6D2B79F5;
  let value = randomState;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
};

function createSimulationState(className, startFloor, runSeed) {
  const currentRun = createDefaultCurrentRun();
  currentRun.runSeed = runSeed;
  currentRun.startFloor = startFloor;
  currentRun.deepestFloor = startFloor;
  currentRun.characterClass = className;
  currentRun.floorsVisited = [startFloor];
  assignRunQuests(currentRun);

  return {
    party: [createSoloCharacter(className)],
    combatState: null,
    inventory: [
      ...Array(INITIAL_HEAL_POTIONS).fill("HEAL_POTION"),
      "ANTIDOTE"
    ],
    firstKills: [],
    codex: null,
    currentRun,
    roamingMonsters: [],
    floorChestsTotal: [],
    metaMaterials: {},
    identifyTickets: 0,
    gold: 0,
    firstChestUnidentifiedGuaranteed: false,
    floor: startFloor
  };
}

function isAlive(character) {
  return character.status !== "dead" && character.hp > 0;
}

function hasSpell(character, spellName) {
  return character.spells?.includes(spellName) === true;
}

function getLowestHpEnemyIndex(monsters, predicate = () => true) {
  let selectedIdx = -1;
  let selectedHp = Infinity;
  monsters.forEach((monster, idx) => {
    if (monster.hp > 0 && predicate(monster) && monster.hp < selectedHp) {
      selectedIdx = idx;
      selectedHp = monster.hp;
    }
  });
  return selectedIdx;
}

function hasHolyTag(monster) {
  return monster.tags?.some(tag => HOLY_TAGS.has(tag)) === true;
}

function selectCombatAction(state) {
  const character = state.party[0];
  const monsters = state.combatState.monsters;
  const lowestHpIdx = getLowestHpEnemyIndex(monsters);

  if (character.hp <= getCharMaxHp(character) * FLEE_HP_THRESHOLD) {
    return { type: "run", actorIdx: 0 };
  }

  if (
    character.hp <= getCharMaxHp(character) * HEAL_POTION_THRESHOLD &&
    state.inventory.includes("HEAL_POTION")
  ) {
    return { type: "item", actorIdx: 0, targetIdx: 0, itemKey: "HEAL_POTION" };
  }

  if (hasSpell(character, "DIOS") && character.hp < getCharMaxHp(character) * 0.35 && character.mp >= 1) {
    return { type: "spell", actorIdx: 0, targetIdx: 0, spellName: "DIOS" };
  }

  const reserveMp = hasSpell(character, "DIOS") ? 1 : 0;
  if (character.mp > reserveMp) {
    if (character.class === "Priest" && hasSpell(character, "BADIOS")) {
      const holyTargetIdx = monsters.findIndex(monster => monster.hp > 0 && hasHolyTag(monster));
      const firstLivingIdx = monsters.findIndex(monster => monster.hp > 0);
      return {
        type: "spell",
        actorIdx: 0,
        targetIdx: holyTargetIdx >= 0 ? holyTargetIdx : firstLivingIdx,
        spellName: "BADIOS"
      };
    }

    if (character.class === "Bishop") {
      const holyTargetIdx = getLowestHpEnemyIndex(monsters, hasHolyTag);
      if (holyTargetIdx >= 0 && hasSpell(character, "BADIOS")) {
        return { type: "spell", actorIdx: 0, targetIdx: holyTargetIdx, spellName: "BADIOS" };
      }
      if (hasSpell(character, "HALITO")) {
        return { type: "spell", actorIdx: 0, targetIdx: lowestHpIdx, spellName: "HALITO" };
      }
    }

    if ((character.class === "Mage" || character.class === "Samurai") && hasSpell(character, "HALITO")) {
      return { type: "spell", actorIdx: 0, targetIdx: lowestHpIdx, spellName: "HALITO" };
    }

    if (character.class === "Ranger" && hasSpell(character, "BADIOS")) {
      const holyTargetIdx = getLowestHpEnemyIndex(monsters, hasHolyTag);
      return {
        type: "spell",
        actorIdx: 0,
        targetIdx: holyTargetIdx >= 0 ? holyTargetIdx : lowestHpIdx,
        spellName: "BADIOS"
      };
    }
  }

  return { type: "fight", actorIdx: 0, targetIdx: lowestHpIdx };
}

function runEncounter(state) {
  const { monsters } = generateEncounter(state, false, false, false, null);
  state.combatState = {
    monsters,
    isBoss: false,
    isMidboss: false,
    isRoamingFlack: false,
    allParalyzedTurns: 0,
    phase: "choose_actions",
    roundNumber: 1
  };

  let rounds = 0;
  let healPotionsUsed = 0;
  for (; rounds < MAX_COMBAT_TURNS; rounds++) {
    const character = state.party[0];
    if (!isAlive(character)) return { result: "death", rounds, healPotionsUsed, state };
    if (state.combatState.monsters.every(monster => monster.hp <= 0)) {
      return { result: "victory", rounds, healPotionsUsed, state };
    }

    const action = selectCombatAction(state);
    const potionCountBefore = state.inventory.filter(item => item === "HEAL_POTION").length;
    const roundResult = runCombatRoundCalculation(state, {
      actions: [action]
    });
    state = roundResult.state;
    const potionCountAfter = state.inventory.filter(item => item === "HEAL_POTION").length;
    healPotionsUsed += potionCountBefore - potionCountAfter;
    const fled = roundResult.logQueue.some(entry => entry.runEscape);

    if (!isAlive(state.party[0])) {
      return { result: "death", rounds: rounds + 1, healPotionsUsed, state };
    }
    if (fled) {
      return { result: "flee", rounds: rounds + 1, healPotionsUsed, state };
    }
    if (state.combatState.monsters.every(monster => monster.hp <= 0)) {
      return { result: "victory", rounds: rounds + 1, healPotionsUsed, state };
    }
  }

  return { result: "stalemate", rounds, healPotionsUsed, state };
}

function applyPostCombatRecovery(character) {
  while (hasSpell(character, "DIOS") && character.mp > 0 && character.hp < getCharMaxHp(character) * 0.70) {
    character.mp -= 1;
    SPELL_EFFECTS.DIOS({ caster: character, target: character });
  }
}

function useHealPotionIfNeeded(state) {
  const character = state.party[0];
  const maxHp = getCharMaxHp(character);
  if (!isAlive(character) || character.hp > maxHp * HEAL_POTION_THRESHOLD) return false;
  const potionIndex = state.inventory.indexOf("HEAL_POTION");
  if (potionIndex < 0) return false;
  state.inventory.splice(potionIndex, 1);
  ITEM_EFFECTS.HEAL_POTION({ char: character });
  return true;
}

function identifyWithoutCurse(item) {
  if (!item || typeof item !== "object") return item;
  return {
    ...item,
    identified: true,
    halfIdentified: false,
    curseEffectId: null,
    cursePower: 0,
    curseSuspected: false
  };
}

function isEquipment(item) {
  return ["weapon", "shield", "armor", "accessory"].includes(item?.type);
}

function canEquipForSimulation(character, item) {
  const itemData = getItemData(item);
  if (!isEquipment(itemData)) return false;
  if (itemData.classes && !itemData.classes.includes(character.class)) return false;
  return canEquipCoreAffix(character, item, itemData.type);
}

function getEquipmentScore(character) {
  return (
    getCharWeaponAtk(character) * EQUIPMENT_SCORE_WEIGHTS.weaponAtk +
    getCharDef(character) * EQUIPMENT_SCORE_WEIGHTS.defense +
    getCharMaxHp(character) * EQUIPMENT_SCORE_WEIGHTS.maxHp +
    getCharStr(character) * EQUIPMENT_SCORE_WEIGHTS.str +
    getCharVit(character) * EQUIPMENT_SCORE_WEIGHTS.vit +
    getCharInt(character) * EQUIPMENT_SCORE_WEIGHTS.int +
    getCharPie(character) * EQUIPMENT_SCORE_WEIGHTS.pie +
    getCharAgi(character) * EQUIPMENT_SCORE_WEIGHTS.agi +
    getCharAffixSum(character, "guardian") * EQUIPMENT_SCORE_WEIGHTS.guardian +
    getCharAffixSum(character, "spellGuard") * EQUIPMENT_SCORE_WEIGHTS.spellGuard +
    getCharAffixSum(character, "followUp") * EQUIPMENT_SCORE_WEIGHTS.followUp +
    getCharAffixSum(character, "firstStrike") * EQUIPMENT_SCORE_WEIGHTS.firstStrike +
    getCharAffixSum(character, "arcane") * EQUIPMENT_SCORE_WEIGHTS.arcane +
    getCharAffixSum(character, "devotion") * EQUIPMENT_SCORE_WEIGHTS.devotion
  );
}

function equipGreedyUpgrades(state) {
  const character = state.party[0];
  let upgrades = 0;

  while (true) {
    const currentScore = getEquipmentScore(character);
    let best = null;

    state.inventory.forEach((inventoryItem, index) => {
      const candidate = identifyWithoutCurse(inventoryItem);
      const itemData = getItemData(candidate);
      if (!canEquipForSimulation(character, candidate)) return;

      const slot = itemData.type;
      const oldEquipment = character.equipment[slot];
      character.equipment[slot] = candidate;
      const candidateScore = getEquipmentScore(character);
      character.equipment[slot] = oldEquipment;

      if (candidateScore <= currentScore || (best && candidateScore <= best.score)) return;
      best = { candidate, index, oldEquipment, score: candidateScore, slot };
    });

    if (!best) break;
    character.equipment[best.slot] = best.candidate;
    if (best.oldEquipment) {
      state.inventory[best.index] = best.oldEquipment;
    } else {
      state.inventory.splice(best.index, 1);
    }
    character.hp = Math.min(character.hp, getCharMaxHp(character));
    upgrades++;
  }

  // 現装備を上回らない装備は将来も使わない、という貪欲仮定で破棄しバッグ枯渇を防ぐ。
  state.inventory = state.inventory.filter(item => !isEquipment(getItemData(item)));
  return upgrades;
}

function applyFloorTransitionHeal(character) {
  if (!isAlive(character)) return 0;
  const maxHp = getCharMaxHp(character);
  const healed = Math.min(
    maxHp - character.hp,
    Math.max(1, Math.floor(maxHp * 0.15))
  );
  character.hp += healed;
  return healed;
}

function getEncounterChance(floorStep) {
  return floorStep <= 30 ? 0.10 : 0.04;
}

function getFloorStepCount(generated, floor) {
  const template = getFloorTemplate(floor);
  const fallback = (template.criticalPathRange[0] + template.criticalPathRange[1]) / 2;
  const criticalPath = Number.isFinite(generated.validation?.criticalPath)
    ? generated.validation.criticalPath
    : fallback;
  return Math.max(1, Math.round(criticalPath * EXPLORATION_FACTOR));
}

function countFloorChests(grid) {
  return grid.flat().filter(cell => cell.event === EVENT_TYPES.CHEST).length;
}

function schedulePickedUpChests(chestCount, floorSteps) {
  const schedule = new Map();
  for (let index = 0; index < chestCount; index++) {
    if (Math.random() >= CHEST_PICKUP_RATE) continue;
    const step = 1 + Math.floor(Math.random() * floorSteps);
    schedule.set(step, (schedule.get(step) || 0) + 1);
  }
  return schedule;
}

function rollChestTrap(floor, rng) {
  if (floor === 1) {
    const roll = rng();
    if (roll < 0.35) return "none";
    if (roll < 0.60) return "poison needle";
    if (roll < 0.85) return "flash bomb";
    return "gas bomb";
  }

  let traps = ["poison needle", "gas bomb", "teleporter", "flash bomb", "none"];
  if (floor === 2) {
    traps = ["poison needle", "poison needle", "gas bomb", "teleporter", "flash bomb", "none", "none"];
  } else if (floor === 4) {
    traps = ["gas bomb", "gas bomb", "teleporter", "teleporter", "flash bomb", "poison needle", "poison needle", "none"];
  } else if (floor === 5) {
    traps = ["gas bomb", "gas bomb", "teleporter", "teleporter", "teleporter", "teleporter", "poison needle", "poison needle", "flash bomb", "flash bomb", "flash bomb", "none"];
  }
  return traps[Math.floor(rng() * traps.length)];
}

function rollChestAccessory(floor, rng, party) {
  const chance = floor >= 5 ? 0.16 : (floor === 4 ? 0.14 : (floor === 3 ? 0.12 : 0.08));
  if (rng() >= chance) return null;
  const rarityRoll = rng();
  let rarity = null;
  if (floor >= 4 && rarityRoll < 0.10) {
    rarity = "epic";
  } else if (rarityRoll < 0.35) {
    rarity = "rare";
  }
  return generateRandomAccessory(floor, rarity, rng, party, floor >= 3);
}

// setupChestStateの装備供給分岐をNode sim用stateで再現する。
function rollChestItems(state, floor, rng) {
  const trap = rollChestTrap(floor, rng);
  if (floor === 1) {
    state.currentRun.b1ChestsOpened = (state.currentRun.b1ChestsOpened || 0) + 1;
  }

  let item = null;
  let isGuaranteed = false;
  if (floor === 1) {
    const b1Opened = state.currentRun.b1ChestsOpened || 0;
    const b1Found = state.currentRun.b1EquipFound || 0;
    if (b1Opened >= 3 && b1Found === 0) isGuaranteed = true;
    if (!isGuaranteed && !state.firstChestUnidentifiedGuaranteed) isGuaranteed = true;
  }

  let itemChance = floor >= 5 ? 0.85 : (floor === 4 ? 0.75 : 0.50);
  if (floor === 1 && (state.currentRun.b1EquipFound || 0) === 0) {
    const b1Opened = state.currentRun.b1ChestsOpened || 1;
    itemChance += (b1Opened - 1) * 0.15;
  }

  if (isGuaranteed || rng() < itemChance) {
    if (isGuaranteed) {
      item = generateRandomEquipment(floor, "magic", rng, state.party, true, floor >= 3);
      state.firstChestUnidentifiedGuaranteed = true;
    } else {
      const candidates = CHEST_ITEM_CANDIDATES_BY_FLOOR[floor]
        || Object.keys(ITEMS).filter(key => key !== "ANTIGRAVITY_CRYSTAL");
      item = candidates[Math.floor(rng() * candidates.length)];
      const itemData = ITEMS[item];
      if (itemData && ["weapon", "armor", "shield"].includes(itemData.type)) {
        const dangerousTrap = ["poison needle", "gas bomb", "teleporter"].includes(trap);
        let equipmentChance;
        if (floor === 4) {
          equipmentChance = dangerousTrap ? 0.80 : 0.70;
        } else if (floor === 5) {
          equipmentChance = 0.90;
        } else {
          equipmentChance = dangerousTrap ? 0.70 : 0.50;
        }
        if (state.currentRun.equipmentFound.length === 0 && state.currentRun.chestsOpened >= 2) {
          equipmentChance += 0.20;
        }
        const treasureSense = state.party.reduce((sum, character) => {
          return character.status === "dead"
            ? sum
            : sum + getCharAffixSum(character, "treasureSense");
        }, 0);
        equipmentChance = Math.min(0.90, equipmentChance + Math.min(25, treasureSense) / 100);
        if (rng() < equipmentChance) {
          item = generateRandomEquipment(floor, null, rng, state.party, true, floor >= 3);
        }
      }
    }
  }

  return [item, rollChestAccessory(floor, rng, state.party)].filter(Boolean);
}

function hasBuildCoreAffix(item) {
  if (!hasCoreAffix(item)) return false;
  return item.affixes.some(affix => CORE_AFFIX_IDS.has(affix.id || affix.type));
}

function hasEquippedBuildCore(character) {
  return getEquippedCoreAffixes(character)
    .some(affix => CORE_AFFIX_IDS.has(affix.id || affix.type));
}

function recordEquipmentAcquisitions(metrics, equipmentItems, floor) {
  equipmentItems.forEach(item => {
    metrics.equipmentFound++;
    if (floor <= EARLY_BUILD_MAX_FLOOR) metrics.earlyEquipmentFound++;
    else metrics.deepEquipmentFound++;
    if (!hasBuildCoreAffix(item)) return;
    metrics.coreEquipmentFound++;
    if (metrics.firstCoreDepth === null) metrics.firstCoreDepth = floor;
  });
}

function recordEquipmentUpgrades(metrics, upgrades, floor) {
  metrics.equipmentUpgrades += upgrades;
  if (floor <= EARLY_BUILD_MAX_FLOOR) metrics.earlyEquipmentUpgrades += upgrades;
  else metrics.deepEquipmentUpgrades += upgrades;
}

function addMaterials(target, additions) {
  Object.entries(additions).forEach(([name, quantity]) => {
    target[name] = (target[name] || 0) + quantity;
  });
}

function totalMaterials(materials) {
  return Object.values(materials).reduce((sum, quantity) => sum + quantity, 0);
}

function finishRun(state, outcome, metrics) {
  const { banked, balance } = bankRunMaterials(
    state.metaMaterials,
    state.currentRun.materials,
    outcome
  );
  state.currentRun.bankedMaterials = banked;
  state.metaMaterials = balance;

  // getBankedMaterialsも同じ実ルール結果を返すことを、集計経路で明示的に確認する。
  const checkedBanked = getBankedMaterials(state.currentRun.materials, outcome);
  if (totalMaterials(checkedBanked) !== totalMaterials(banked)) {
    throw new Error("bank material calculation mismatch");
  }

  return {
    survived: outcome === "retreat",
    died: outcome === "death",
    bankedMaterials: totalMaterials(banked),
    timeCost: metrics.steps + COMBAT_TURN_WEIGHT * metrics.combatRounds,
    reachedFloor: state.currentRun.deepestFloor,
    stalemate: metrics.stalemate,
    finalLevel: state.party[0].level,
    equipmentUpgrades: metrics.equipmentUpgrades,
    earlyEquipmentUpgrades: metrics.earlyEquipmentUpgrades,
    deepEquipmentUpgrades: metrics.deepEquipmentUpgrades,
    equipmentFound: metrics.equipmentFound,
    earlyEquipmentFound: metrics.earlyEquipmentFound,
    deepEquipmentFound: metrics.deepEquipmentFound,
    coreEquipmentFound: metrics.coreEquipmentFound,
    firstCoreDepth: metrics.firstCoreDepth,
    coreEquipped: hasEquippedBuildCore(state.party[0]),
    healPotionsUsed: metrics.healPotionsUsed,
    fleeCount: metrics.fleeCount
  };
}

function descendToNextFloor(state, nextFloor) {
  state.floor = nextFloor;
  state.currentRun.deepestFloor = Math.max(state.currentRun.deepestFloor, nextFloor);
  state.currentRun.floorsVisited.push(nextFloor);
  updateRunQuests(state.currentRun);
  applyFloorTransitionHeal(state.party[0]);
}

function simulateRun({ className, startFloor, targetDepth, runIndex, seriesId }) {
  const runSeed = `${SIM_SEED}:${seriesId}:${className}:${runIndex}`;
  let state = createSimulationState(className, startFloor, runSeed);
  const metrics = {
    steps: 0,
    combatRounds: 0,
    stalemate: false,
    equipmentUpgrades: 0,
    earlyEquipmentUpgrades: 0,
    deepEquipmentUpgrades: 0,
    equipmentFound: 0,
    earlyEquipmentFound: 0,
    deepEquipmentFound: 0,
    coreEquipmentFound: 0,
    firstCoreDepth: null,
    healPotionsUsed: 0,
    fleeCount: 0
  };

  // 目標階へ到着した時点で撤退するため、探索するのはtargetDepthの1階手前まで。
  for (let floor = startFloor; floor < targetDepth; floor++) {
    state.floor = floor;
    const generated = generateRunFloor({ runSeed, floor });
    const floorSteps = getFloorStepCount(generated, floor);
    const chestSchedule = schedulePickedUpChests(countFloorChests(generated.grid), floorSteps);

    for (let step = 1; step <= floorSteps; step++) {
      metrics.steps++;
      state.currentRun.steps++;
      state.currentRun.floorSteps[String(floor)] =
        (state.currentRun.floorSteps[String(floor)] || 0) + 1;

      const pickedUpChests = chestSchedule.get(step) || 0;
      for (let chest = 0; chest < pickedUpChests; chest++) {
        addMaterials(state.currentRun.materials, generateChestMaterials(floor, Math.random, 0));
        const chestItems = rollChestItems(state, floor, Math.random);
        const acquiredEquipment = [];
        chestItems.forEach(item => {
          if (!addInventoryItemToState(state, item)) return;
          const itemData = getItemData(item);
          if (!isEquipment(itemData)) {
            state.currentRun.itemsFound.push(item);
            return;
          }
          acquiredEquipment.push(item);
          if (typeof item === "string") {
            state.currentRun.itemsFound.push(item);
          } else {
            state.currentRun.equipmentFound.push(item);
            if (floor === 1) {
              state.currentRun.b1EquipFound = (state.currentRun.b1EquipFound || 0) + 1;
            }
          }
        });
        recordEquipmentAcquisitions(metrics, acquiredEquipment, floor);
        state.currentRun.chestsOpened++;
        recordEquipmentUpgrades(metrics, equipGreedyUpgrades(state), floor);
      }

      if (Math.random() >= getEncounterChance(step)) continue;

      state.currentRun.battles++;
      const combatResult = runEncounter(state);
      state = combatResult.state;
      metrics.combatRounds += combatResult.rounds;
      metrics.healPotionsUsed += combatResult.healPotionsUsed;

      if (combatResult.result === "flee") {
        metrics.fleeCount++;
        applyPostCombatRecovery(state.party[0]);
        metrics.healPotionsUsed += Number(useHealPotionIfNeeded(state));
        if (!isAlive(state.party[0])) return finishRun(state, "death", metrics);
        continue;
      }

      if (combatResult.result !== "victory") {
        metrics.stalemate = combatResult.result === "stalemate";
        return finishRun(state, "death", metrics);
      }

      const equipmentFoundBeforeRewards = state.currentRun.equipmentFound.length;
      applyCombatRewards(state, state.combatState.monsters, [], Math.random);
      recordEquipmentAcquisitions(
        metrics,
        state.currentRun.equipmentFound.slice(equipmentFoundBeforeRewards),
        floor
      );
      while (checkCharLevelUp(state.party[0])) {
        // applyCombatRewards performs the first possible level-up.
      }
      recordEquipmentUpgrades(metrics, equipGreedyUpgrades(state), floor);
      applyPostCombatRecovery(state.party[0]);
      metrics.healPotionsUsed += Number(useHealPotionIfNeeded(state));
      if (!isAlive(state.party[0])) return finishRun(state, "death", metrics);
    }

    descendToNextFloor(state, floor + 1);
  }

  return finishRun(state, "retreat", metrics);
}

function simulateCase({ startFloor, targetDepth, label, seriesId }) {
  const totals = {
    survived: 0,
    died: 0,
    bankedMaterials: 0,
    timeCost: 0,
    reachedFloor: 0,
    stalemates: 0,
    finalLevels: 0,
    equipmentUpgrades: 0,
    earlyEquipmentUpgrades: 0,
    deepEquipmentUpgrades: 0,
    equipmentFound: 0,
    earlyEquipmentFound: 0,
    deepEquipmentFound: 0,
    coreEquipmentFound: 0,
    runsWithCoreEncounter: 0,
    runsWithEarlyCoreEncounter: 0,
    runsWithCoreEquipped: 0,
    firstCoreDepthCounts: {},
    healPotionsUsed: 0,
    fleeCount: 0,
    runsWithFlee: 0
  };

  for (let runIndex = 0; runIndex < RUNS_PER_CASE; runIndex++) {
    const className = SIM_CLASSES[runIndex % SIM_CLASSES.length];
    const result = simulateRun({ className, startFloor, targetDepth, runIndex, seriesId });
    totals.survived += Number(result.survived);
    totals.died += Number(result.died);
    totals.bankedMaterials += result.bankedMaterials;
    totals.timeCost += result.timeCost;
    totals.reachedFloor += result.reachedFloor;
    totals.stalemates += Number(result.stalemate);
    totals.finalLevels += result.finalLevel;
    totals.equipmentUpgrades += result.equipmentUpgrades;
    totals.earlyEquipmentUpgrades += result.earlyEquipmentUpgrades;
    totals.deepEquipmentUpgrades += result.deepEquipmentUpgrades;
    totals.equipmentFound += result.equipmentFound;
    totals.earlyEquipmentFound += result.earlyEquipmentFound;
    totals.deepEquipmentFound += result.deepEquipmentFound;
    totals.coreEquipmentFound += result.coreEquipmentFound;
    totals.runsWithCoreEncounter += Number(result.firstCoreDepth !== null);
    totals.runsWithEarlyCoreEncounter += Number(
      result.firstCoreDepth !== null && result.firstCoreDepth <= EARLY_BUILD_MAX_FLOOR
    );
    totals.runsWithCoreEquipped += Number(result.coreEquipped);
    const firstCoreDepthKey = result.firstCoreDepth === null ? "none" : String(result.firstCoreDepth);
    totals.firstCoreDepthCounts[firstCoreDepthKey] =
      (totals.firstCoreDepthCounts[firstCoreDepthKey] || 0) + 1;
    totals.healPotionsUsed += result.healPotionsUsed;
    totals.fleeCount += result.fleeCount;
    totals.runsWithFlee += Number(result.fleeCount > 0);
  }

  const bankedMaterialEv = totals.bankedMaterials / RUNS_PER_CASE;
  const averageTimeCost = totals.timeCost / RUNS_PER_CASE;
  return {
    label,
    startFloor,
    targetDepth,
    survivalRate: totals.survived / RUNS_PER_CASE,
    deathRate: totals.died / RUNS_PER_CASE,
    bankedMaterialEv,
    averageTimeCost,
    materialEvPerTime: bankedMaterialEv / averageTimeCost,
    averageReachedFloor: totals.reachedFloor / RUNS_PER_CASE,
    stalemateRate: totals.stalemates / RUNS_PER_CASE,
    averageFinalLevel: totals.finalLevels / RUNS_PER_CASE,
    averageEquipmentUpgrades: totals.equipmentUpgrades / RUNS_PER_CASE,
    averageEarlyEquipmentUpgrades: totals.earlyEquipmentUpgrades / RUNS_PER_CASE,
    averageDeepEquipmentUpgrades: totals.deepEquipmentUpgrades / RUNS_PER_CASE,
    averageEquipmentFound: totals.equipmentFound / RUNS_PER_CASE,
    averageEarlyEquipmentFound: totals.earlyEquipmentFound / RUNS_PER_CASE,
    averageDeepEquipmentFound: totals.deepEquipmentFound / RUNS_PER_CASE,
    coreEquipmentShare: totals.equipmentFound > 0
      ? totals.coreEquipmentFound / totals.equipmentFound
      : 0,
    coreEncounterRate: totals.runsWithCoreEncounter / RUNS_PER_CASE,
    earlyCoreEncounterRate: totals.runsWithEarlyCoreEncounter / RUNS_PER_CASE,
    coreEquippedRate: totals.runsWithCoreEquipped / RUNS_PER_CASE,
    firstCoreDepthCounts: totals.firstCoreDepthCounts,
    averageHealPotionsUsed: totals.healPotionsUsed / RUNS_PER_CASE,
    averageFleeCount: totals.fleeCount / RUNS_PER_CASE,
    runsWithFleeRate: totals.runsWithFlee / RUNS_PER_CASE
  };
}

function formatPercent(rate) {
  return `${(rate * 100).toFixed(1)}%`;
}

function printTable(results) {
  console.log("戦略       | 生還率 | 死亡率 | bank素材EV | 平均時間 | 素材EV/時間 | 平均到達階 | 平均Lv | 平均換装 | 平均薬 | 平均逃走 | 逃走run率");
  console.log("-----------|--------|--------|------------|----------|-------------|------------|--------|----------|--------|----------|----------");
  results.forEach(result => {
    console.log(
      `${result.label.padEnd(10)} | ${formatPercent(result.survivalRate).padStart(6)} | ` +
      `${formatPercent(result.deathRate).padStart(6)} | ${result.bankedMaterialEv.toFixed(2).padStart(10)} | ` +
      `${result.averageTimeCost.toFixed(2).padStart(8)} | ${result.materialEvPerTime.toFixed(4).padStart(11)} | ` +
      `${result.averageReachedFloor.toFixed(2).padStart(10)} | ${result.averageFinalLevel.toFixed(2).padStart(6)} | ` +
      `${result.averageEquipmentUpgrades.toFixed(2).padStart(8)} | ${result.averageHealPotionsUsed.toFixed(2).padStart(6)} | ` +
      `${result.averageFleeCount.toFixed(2).padStart(8)} | ${formatPercent(result.runsWithFleeRate).padStart(8)}`
    );
  });
}

function printBuildSupplyMetrics(results) {
  console.log("戦略       | 装備入手 | 前半入手 | 深層入手 | core/装備 | core遭遇run率 | 前半core遭遇run率 | core装備run率 | 平均換装 | 前半換装 | 深層換装");
  console.log("-----------|----------|----------|----------|-----------|---------------|-------------------|-------------|----------|----------|----------");
  results.forEach(result => {
    console.log(
      `${result.label.padEnd(10)} | ${result.averageEquipmentFound.toFixed(2).padStart(8)} | ` +
      `${result.averageEarlyEquipmentFound.toFixed(2).padStart(8)} | ${result.averageDeepEquipmentFound.toFixed(2).padStart(8)} | ` +
      `${formatPercent(result.coreEquipmentShare).padStart(9)} | ${formatPercent(result.coreEncounterRate).padStart(13)} | ` +
      `${formatPercent(result.earlyCoreEncounterRate).padStart(17)} | ${formatPercent(result.coreEquippedRate).padStart(11)} | ` +
      `${result.averageEquipmentUpgrades.toFixed(2).padStart(8)} | ` +
      `${result.averageEarlyEquipmentUpgrades.toFixed(2).padStart(8)} | ${result.averageDeepEquipmentUpgrades.toFixed(2).padStart(8)}`
    );
    const depthLabels = Object.entries(result.firstCoreDepthCounts)
      .sort(([left], [right]) => {
        if (left === "none") return 1;
        if (right === "none") return -1;
        return Number(left) - Number(right);
      })
      .map(([depth, count]) => {
        const label = depth === "none" ? "未遭遇" : `B${depth}`;
        return `${label}=${count} (${formatPercent(count / RUNS_PER_CASE)})`;
      });
    console.log(`  初回core遭遇深さ: ${depthLabels.join(", ")}`);
  });
}

function isMonotonicallyIncreasing(results) {
  return results.every((result, index) =>
    index === 0 || result.materialEvPerTime >= results[index - 1].materialEvPerTime
  );
}

function printFailureComment(results) {
  const b5 = results[0];
  const deepest = results.at(-1);
  const firstDeclineIndex = results.findIndex((result, index) =>
    index > 0 && result.materialEvPerTime < results[index - 1].materialEvPerTime
  );
  let commentPrinted = false;
  if (b5.deathRate < 0.10) {
    console.log(
      `機械コメント: B5死亡率 ${formatPercent(b5.deathRate)} と低く撤退が安全。` +
      "撤退コストまたは撤退条件が効きやすい。"
    );
    commentPrinted = true;
  }
  if (deepest.deathRate - b5.deathRate >= 0.20) {
    console.log(
      `機械コメント: B20死亡率 ${formatPercent(deepest.deathRate)} はB5より` +
      `${((deepest.deathRate - b5.deathRate) * 100).toFixed(1)}pt高い。死亡バンク率の影響が大きい。`
    );
    commentPrinted = true;
  }
  if (deepest.bankedMaterialEv <= b5.bankedMaterialEv) {
    console.log(
      `機械コメント: bank素材EV B5=${b5.bankedMaterialEv.toFixed(2)} / ` +
      `B20=${deepest.bankedMaterialEv.toFixed(2)}。深度別素材単価カーブまたはランクエスト報酬の深度依存が不足。`
    );
    commentPrinted = true;
  } else if (deepest.materialEvPerTime <= b5.materialEvPerTime) {
    console.log(
      `機械コメント: B20はbank素材EV ${deepest.bankedMaterialEv.toFixed(2)} を得るが` +
      `平均時間 ${deepest.averageTimeCost.toFixed(2)}。深層側の時間報酬または撤退コスト差が不足。`
    );
    commentPrinted = true;
  }
  if (!commentPrinted && firstDeclineIndex >= 1) {
    const previous = results[firstDeclineIndex - 1];
    const declined = results[firstDeclineIndex];
    console.log(
      `機械コメント: ${previous.label}→${declined.label}で素材EV/時間が` +
      `${previous.materialEvPerTime.toFixed(4)}→${declined.materialEvPerTime.toFixed(4)}。` +
      "該当深度帯の素材単価カーブまたはランクエスト報酬の深度依存が効きやすい。"
    );
  }
}

console.log("深度別 リスク調整後素材EVシミュレーション");
console.log(`試行数: 各ケース N=${RUNS_PER_CASE}（基本${SIM_CLASSES.length}職をround-robin集約）`);
console.log(`乱数seed: ${SIM_SEED}`);
console.log(
  `仮定: 探索係数=${EXPLORATION_FACTOR}, 宝箱拾得率=${CHEST_PICKUP_RATE}, ` +
  `戦闘ターン重み=${COMBAT_TURN_WEIGHT}`
);
console.log(
  `生存仮定: 初期傷薬=${INITIAL_HEAL_POTIONS}個, 使用閾値=${HEAL_POTION_THRESHOLD}, ` +
  `逃走閾値=${FLEE_HP_THRESHOLD}, 装備=実制限付き貪欲スコア更新, 鑑定済み・呪いなし`
);
console.log(
  `供給仮定: 宝箱の本体/装身具分岐を実ロジック準拠で反映、` +
  `core判定=CORE_AFFIXES ${CORE_AFFIXES.length}種+affix_rules helper`
);
console.log(
  `core呪い設定: AFFIX_BALANCE.coreCurseChance=${AFFIX_BALANCE.coreCurseChance}は現generator未参照、` +
  `実生成はIDENTIFICATION_BALANCE.coreCurseBonus=${IDENTIFICATION_BALANCE.coreCurseBonus}; ` +
  "simは#236分離のため呪い除外"
);
console.log("逃走=常時成功（自ターン到達時）、先行攻撃＋離脱時追撃1発、報酬なし、探索継続");
console.log("時間単位: 1歩=1、1戦闘ターン=3");
console.log("撤退=100% bank、死亡=30% bank");

const depthResults = TARGET_DEPTHS.map(targetDepth => simulateCase({
  startFloor: 1,
  targetDepth,
  label: `B${targetDepth}撤退`,
  seriesId: `depth-${targetDepth}`
}));

console.log("\n【B1開始 深度別系列】");
printTable(depthResults);
console.log("\n【B1開始 ビルド供給】");
printBuildSupplyMetrics(depthResults);

const monotonic = isMonotonicallyIncreasing(depthResults);
const bestDepthResult = [...depthResults].sort((a, b) => b.materialEvPerTime - a.materialEvPerTime)[0];
const b5IsBest = bestDepthResult.targetDepth === 5;
console.log(`単位時間EVは深度について単調増加: ${monotonic ? "Yes" : "No"}`);
console.log(`B5が単位時間EV最上位でない: ${b5IsBest ? "不合格" : "合格"}（最上位=${bestDepthResult.label}）`);
if (!monotonic || b5IsBest) printFailureComment(depthResults);

const milestoneResults = [
  simulateCase({
    startFloor: 10,
    targetDepth: 15,
    label: "B10→B15",
    seriesId: "milestone-10-15"
  }),
  simulateCase({
    startFloor: 1,
    targetDepth: 15,
    label: "B1→B15",
    seriesId: "baseline-1-15"
  })
];

console.log("\n【マイルストーン開始比較】");
console.log(
  `B10開始は currentRun.startFloor=10 により実ドロップ量へ ` +
  `milestoneStartMultiplier=${MATERIAL_DROP_BALANCE.milestoneStartMultiplier} を適用`
);
printTable(milestoneResults);
console.log("\n【マイルストーン開始 ビルド供給】");
printBuildSupplyMetrics(milestoneResults);
const milestoneDominated =
  milestoneResults[0].materialEvPerTime < milestoneResults[1].materialEvPerTime;
console.log(
  `Issue #237 裏取り: B10開始はB1開始より単位時間EVで劣後(dominated): ` +
  `${milestoneDominated ? "Yes" : "No"}`
);

const stalemateCases = [...depthResults, ...milestoneResults].filter(result => result.stalemateRate > 0);
if (stalemateCases.length > 0) {
  console.log(
    `注: ${MAX_COMBAT_TURNS}ターン上限到達は進行不能として死亡bank扱い: ` +
    stalemateCases.map(result => `${result.label}=${formatPercent(result.stalemateRate)}`).join(", ")
  );
}
