// sim-scope: run
/* global console, process */

import { pathToFileURL } from "node:url";
import { runSimTasks } from "./sim_parallel.js";

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
  createDefaultCodex,
  createDefaultCurrentRun,
  createSoloCharacter
} = await import("../src/state/initial_state.js");
const { ELITE_CLASSES } = await import("../src/data/classes.js");
const { generateEncounter } = await import("../src/combat_ui/encounter.js");
const { applyPendingOutcomeRewards } = await import("../src/combat_ui/outcome_rewards.js");
const { runCombatRoundCalculation } = await import("../src/combat_logic.js");
const { SPELL_EFFECTS } = await import("../src/systems/spell_effects.js");
const { assignRunQuests, updateRunQuests } = await import("../src/systems/run_quests.js");
const { generateRunFloor } = await import("../src/run_map_generator.js");
const { isMilestoneFloor } = await import("../src/run_map_generator.js");
const { createFloorElite } = await import("../src/systems/roaming_elites.js");
const { getFloorTemplate } = await import("../src/data/floor_templates.js");
const { EVENT_TYPES } = await import("../src/constants/events.js");
const { generateChestMaterials } = await import("../src/chest.js");
// 宝箱の抽選は src と同一の出所を叩く（#273）。写経すると src 変更に追随しない。
const {
  CHEST_ACCESSORY_CORE_MIN_FLOOR,
  CHEST_EQUIPMENT_CORE_MIN_FLOOR,
  rollChestAccessory,
  rollChestReward,
  rollChestTrap
} = await import("../src/rules/chest_rules.js");
const {
  calculateChestDisarmChance,
  calculateDetectRate,
  calculateFloorTrapSuccessRate,
  resolveTrapAction
} = await import("../src/rules/trap_rules.js");
const {
  resolveChestTrapEffect,
  resolveFloorTrapEffect
} = await import("../src/rules/trap_effect_rules.js");
const { AFFIX_BALANCE, CORE_AFFIXES } = await import("../src/data/affixes.js");
const { ITEMS } = await import("../src/data/items.js");
const { MATERIAL_DROP_BALANCE } = await import("../src/data/materials.js");
const {
  IDENTIFICATION_BALANCE,
  isCurseLocked
} = await import("../src/rules/identification_rules.js");
const {
  identifyEquipment,
  revealEquipmentOnEquip
} = await import("../src/systems/identification.js");
const {
  getEquippedCurseCount,
  getEquippedCoreAffixes,
  getCharCoreParams,
  hasCoreAffix
} = await import("../src/rules/affix_rules.js");
const {
  bankRunMaterials,
  getBankedMaterials,
  getDepthMaterialDropChance,
  getDepthMaterialExpectedQuantity
} = await import("../src/rules/material_rules.js");
const { addInventoryItemToState } = await import("../src/state/inventory_state.js");
const {
  generateRandomAccessory,
  generateRandomEquipment,
  getCharAffixSum,
  getCharAgi,
  getCharDef,
  getCharInt,
  getCharMaxHp,
  getCharMaxMp,
  getCharPie,
  getCharStr,
  getCharTrapBonus,
  getTrapEaterBonusAfterDisarm,
  getCharVit,
  getCharWeaponAtk,
  getItemData,
  SPELLS
} = await import("../src/data.js");
const { ITEM_EFFECTS } = await import("../src/systems/item_effects.js");
const {
  clearCharIncapacitationOnDamage,
  getBuffTotal
} = await import("../src/combat_logic/status_effects.js");
const {
  applyWorkshopToCharacter,
  getDepartureKitGrants,
  getWorkshopGrants
} = await import("../src/systems/workshop.js");
const { purchaseMilestoneStock } = await import("../src/systems/milestone_merchant.js");
const { getStartingHealPotionCount } = await import("../src/rules/recovery_rules.js");

const RUNS_PER_CASE = Math.max(1, Number(process.env.SIM_RUNS || 500));
const SIM_SEED = Number(process.env.SIM_SEED || 231) >>> 0;
const TARGET_DEPTHS = [5, 10, 15, 20];
const MAX_COMBAT_TURNS = 50;

const IDENTIFICATION_POLICY_DEFINITIONS = Object.freeze({
  legacy: Object.freeze({
    id: "legacy",
    label: "既定（鑑定済み・呪いなし）"
  }),
  powder: Object.freeze({
    id: "powder",
    label: "方針A（粉があれば鑑定、なければ保持）"
  }),
  gamble: Object.freeze({
    id: "gamble",
    label: "方針B（更新候補を即着用）"
  })
});

function resolveIdentificationPolicies() {
  const requested = String(process.env.IDENTIFICATION_POLICY || "legacy")
    .trim()
    .toLowerCase();
  const policyIds = requested === "compare"
    ? ["powder", "gamble"]
    : requested.split(",").map(value => value.trim()).filter(Boolean);
  const invalid = policyIds.filter(id => !IDENTIFICATION_POLICY_DEFINITIONS[id]);
  if (invalid.length > 0 || policyIds.length === 0) {
    throw new Error(
      `IDENTIFICATION_POLICY must be legacy|powder|gamble|compare: ${requested}`
    );
  }
  return [...new Set(policyIds)].map(id => IDENTIFICATION_POLICY_DEFINITIONS[id]);
}

const ACTIVE_IDENTIFICATION_POLICIES = resolveIdentificationPolicies();

// 仮値・感度分析対象: critical pathに対する寄り道込み歩数を1.4倍と置く。
const EXPLORATION_FACTOR = 1.4;
// 仮値・感度分析対象: 探索係数1.4に対応し、配置宝箱の70%を拾えると置く。
const CHEST_PICKUP_RATE = 0.7;
// 仮値・感度分析対象: 戦闘1ターンを探索3歩相当と置く。
const COMBAT_TURN_WEIGHT = 3;
// 実run開始準拠: src/rules/recovery_rules.js と同じ開始傷薬数。
const INITIAL_HEAL_POTIONS = getStartingHealPotionCount();
// 実run開始準拠: 解毒薬1個。
const INITIAL_ANTIDOTES = 1;
// 実run開始準拠: 守りの薬1個（#271の確実供給）。
const INITIAL_GUARD_POTIONS = 1;
// 仮値・感度分析対象: 戦闘中/戦闘後HPが最大HPの35%以下なら傷薬を1個使う。
const HEAL_POTION_THRESHOLD = 0.35;
// 仮値・感度分析対象: 最大HPの指定割合以下なら次の自ターンで逃走する。
const DEFAULT_FLEE_HP_THRESHOLD = process.env.FLEE_POLICY === "never"
  ? null
  : Math.max(0, Math.min(1, Number(process.env.FLEE_HP_THRESHOLD || 0.35)));
const DEFAULT_STATUS_CURE_HP_THRESHOLD = Math.max(
  0,
  Math.min(1, Number(process.env.STATUS_CURE_HP_THRESHOLD || 1))
);
const DEFAULT_STATUS_CURE_POLICY = process.env.STATUS_CURE_POLICY === "never"
  ? "never"
  : "smart";
const DEFAULT_STATUS_CURE_MERCHANT_POLICY =
  process.env.STATUS_CURE_MERCHANT_POLICY === "never" ? "never" : "missing";
const DEFAULT_HEAL_POTION_MERCHANT_POLICY =
  process.env.HEAL_POTION_MERCHANT_POLICY === "never" ? "never" : "missing";
const DEFAULT_ELITE_POLICY = process.env.ELITE_POLICY === "engage" ? "engage" : "avoid";
const TRAP_POLICY_DEFINITIONS = Object.freeze({
  legacy: Object.freeze({
    id: "legacy",
    label: "従来（罠効果なし）"
  }),
  conservative: Object.freeze({
    id: "conservative",
    label: "保守（キット優先・回避優先）"
  })
});
export const DEFAULT_TRAP_POLICY_ID = process.env.TRAP_POLICY || "conservative";
if (!TRAP_POLICY_DEFINITIONS[DEFAULT_TRAP_POLICY_ID]) {
  throw new Error(
    `TRAP_POLICY must be legacy|conservative: ${DEFAULT_TRAP_POLICY_ID}`
  );
}
const CHEST_DISARM_POLICY_MIN_CHANCE = 0.50;
const FLOOR_DISARM_POLICY_MIN_RATE = 50;
// 仮値・感度分析対象: 危険域で傷薬が尽きていれば帰還の翼を使う。
const PORTAL_HP_THRESHOLD = Number(process.env.PORTAL_HP_THRESHOLD || 0.35);
const PORTAL_MAX_HEAL_POTIONS = Math.max(
  0,
  Number(process.env.PORTAL_MAX_HEAL_POTIONS || 0)
);
const PORTAL_MIN_FLOOR = Math.max(1, Number(process.env.PORTAL_MIN_FLOOR || 3));
const SCENARIOS = Object.freeze([
  {
    id: "workshop-locked",
    label: "工房未解放",
    workshopReturnItem: null,
    useTownPortal: true
  },
  {
    id: "workshop-unlocked",
    label: "工房解放済",
    workshopReturnItem: "TOWN_PORTAL",
    useTownPortal: true
  },
  {
    id: "legacy-no-portal",
    label: "従来(翼不使用)",
    workshopReturnItem: null,
    useTownPortal: false
  }
]);
const SCENARIO_FILTER = new Set(
  String(process.env.SIM_SCENARIOS || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean)
);
const ACTIVE_SCENARIOS = SCENARIO_FILTER.size === 0
  ? SCENARIOS
  : SCENARIOS.filter(scenario => SCENARIO_FILTER.has(scenario.id));
const SIM_CLASSES = SOLO_CLASSES.filter(className => !ELITE_CLASSES.includes(className));
const ENABLED_CORE_AFFIXES = CORE_AFFIXES.filter(affix => affix.enabled);
const CORE_AFFIX_IDS = new Set(ENABLED_CORE_AFFIXES.map(affix => affix.id));
const CORE_AFFIX_BY_ID = new Map(ENABLED_CORE_AFFIXES.map(affix => [affix.id, affix]));
const COMBAT_CORE_IDS = new Set(
  ENABLED_CORE_AFFIXES.filter(affix => affix.poolGroup === "combat").map(affix => affix.id)
);
const ECONOMY_CORE_IDS = new Set(
  ENABLED_CORE_AFFIXES.filter(affix => affix.poolGroup === "economy").map(affix => affix.id)
);
const EARLY_BUILD_MAX_FLOOR = 10;
const ECONOMY_CORE_KEEP_RATIO = 0.95;
const HOLD_ONLY_ECONOMY_CORE_IDS = new Set(["CORE_SNEAK_STEP", "CORE_KEEN_EYE"]);
// 素材1個のrun EVを装備score 1点へ換算する感度分析用の基準。
const MATERIAL_EV_SCORE_WEIGHT = 1;
// 盗掘王の素材EVは、罠被害を測定する既定経路でも感度分析として50%割引を残す。
const TOMB_RAIDER_TRAP_RISK_DISCOUNT = 0.5;
const CAMP_FLOORS = new Set([2, 4]);
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

function createCoreObservations() {
  return {
    offensiveTurns: 0,
    fightTurns: 0,
    lowHpOffensiveTurns: 0,
    giantTargetTurns: 0,
    statusTargetTurns: 0,
    openerFirstStrikeFightTurns: 0,
    bloodWandSpellOpportunities: 0,
    bloodWandHealOpportunities: 0,
    purifyKillsWithMpRoom: 0,
    totalKills: 0,
    killsWithMpRoom: 0,
    purifyTagKills: 0,
    purifyTagKillsByCaster: 0,
    incomingPhysicalAttempts: 0,
    incomingPhysicalHits: 0,
    fightDamage: 0,
    spellDamage: 0,
    fightDamageActions: 0,
    spellDamageActions: 0,
    diosHealing: 0,
    diosHealActions: 0,
    trappedChests: 0,
    expectedTrapDisarms: 0,
    expectedTrapDisarmsByFloor: Array(21).fill(0),
    pickedChestsByFloor: Array(21).fill(0),
    campBonusHpByFloor: Array(21).fill(0),
    campBonusMpByFloor: Array(21).fill(0),
    scholarMaterialBonusByFloor: Array(21).fill(0),
    disruptorKills: 0,
    amplifierKills: 0,
    bountyBonusMaterials: 0,
    curseSamples: 0,
    equippedCurseTotal: 0
  };
}

function createTrapAggregate() {
  return {
    runs: 0,
    activations: 0,
    damageHp: 0,
    healPotionsUsed: 0,
    healPotionShortages: 0,
    disarms: 0,
    avoided: 0,
    forced: 0,
    kitsAcquired: 0,
    kitsUsed: 0,
    detections: 0,
    runsWithHealPotionShortage: 0,
    combatDamageHp: 0,
    stairsHealingHp: 0,
    campHealingHp: 0,
    diosHealingHp: 0,
    healPotionsAcquiredBySource: {
      starting: 0,
      chest: 0,
      merchant: 0,
      other: 0
    },
    healPotionsConsumedBySource: {
      starting: 0,
      chest: 0,
      merchant: 0,
      other: 0
    }
  };
}

function addTrapAggregate(target, result) {
  target.runs++;
  target.activations += result.trapActivations;
  target.damageHp += result.trapDamageHp;
  target.healPotionsUsed += result.trapHealPotionsUsed;
  target.healPotionShortages += result.trapHealPotionShortages;
  target.disarms += result.trapDisarms;
  target.avoided += result.trapAvoided;
  target.forced += result.trapForced;
  target.kitsAcquired += result.trapKitsAcquired;
  target.kitsUsed += result.trapKitsUsed;
  target.detections += result.trapDetections;
  target.runsWithHealPotionShortage += Number(result.trapHealPotionShortages > 0);
  target.combatDamageHp += result.combatDamageHp;
  target.stairsHealingHp += result.stairsHealingHp;
  target.campHealingHp += result.campHealingHp;
  target.diosHealingHp += result.diosHealingHp;
  Object.entries(result.healPotionsAcquiredBySource).forEach(([source, amount]) => {
    target.healPotionsAcquiredBySource[source] =
      (target.healPotionsAcquiredBySource[source] || 0) + amount;
  });
  Object.entries(result.healPotionsConsumedBySource).forEach(([source, amount]) => {
    target.healPotionsConsumedBySource[source] =
      (target.healPotionsConsumedBySource[source] || 0) + amount;
  });
}

function finalizeTrapAggregate(aggregate) {
  const runs = Math.max(1, aggregate.runs);
  return {
    runs: aggregate.runs,
    averageTrapActivations: aggregate.activations / runs,
    averageTrapDamageHp: aggregate.damageHp / runs,
    averageTrapHealPotionsUsed: aggregate.healPotionsUsed / runs,
    averageTrapHealPotionShortages: aggregate.healPotionShortages / runs,
    trapHealPotionShortageRunRate: aggregate.runsWithHealPotionShortage / runs,
    averageTrapDisarms: aggregate.disarms / runs,
    averageTrapAvoided: aggregate.avoided / runs,
    averageTrapForced: aggregate.forced / runs,
    averageTrapKitsAcquired: aggregate.kitsAcquired / runs,
    averageTrapKitsUsed: aggregate.kitsUsed / runs,
    averageTrapDetections: aggregate.detections / runs,
    averageCombatDamageHp: aggregate.combatDamageHp / runs,
    averageStairsHealingHp: aggregate.stairsHealingHp / runs,
    averageCampHealingHp: aggregate.campHealingHp / runs,
    averageDiosHealingHp: aggregate.diosHealingHp / runs,
    averageHealPotionsAcquiredBySource: Object.fromEntries(
      Object.entries(aggregate.healPotionsAcquiredBySource).map(([source, amount]) => [
        source,
        amount / runs
      ])
    ),
    averageHealPotionsConsumed: Object.values(aggregate.healPotionsConsumedBySource)
      .reduce((sum, amount) => sum + amount, 0) / runs,
    averageHealPotionsConsumedBySource: Object.fromEntries(
      Object.entries(aggregate.healPotionsConsumedBySource).map(([source, amount]) => [
        source,
        amount / runs
      ])
    )
  };
}

function addCoreObservations(target, additions) {
  Object.keys(target).forEach(key => {
    if (Array.isArray(target[key])) {
      target[key] = target[key].map((value, index) => value + (additions[key]?.[index] || 0));
    } else {
      target[key] += additions[key] || 0;
    }
  });
}
// 既定legacyは#231の既存比較を再現する。#236のpowder/gambleでは、
// 実生成された未鑑定装備と呪いをそのまま評価する。コアの装備個数制限は撤廃済み（#311）。

const HOLY_TAGS = new Set(["undead", "spirit", "demon"]);
const STATUS_CURE_ITEMS = Object.freeze({
  poisoned: ["ANTIDOTE", "HOLY_WATER", "PANACEA"],
  blind: ["EYE_DROPS", "PANACEA"],
  paralyze: ["PARALYZE_CURE", "PANACEA"],
  paralyzed: ["PARALYZE_CURE", "PANACEA"],
  sleep: ["WAKE_POWDER", "PANACEA"]
});
const STATUS_CURE_ITEM_IDS = new Set(Object.values(STATUS_CURE_ITEMS).flat());
const MERCHANT_STATUS_CURE_STOCK = Object.freeze([
  { stockId: "antidote", itemId: "ANTIDOTE" },
  { stockId: "wake_powder", itemId: "WAKE_POWDER" },
  { stockId: "paralyze_cure", itemId: "PARALYZE_CURE" }
]);
let randomState = SIM_SEED;
Math.random = () => {
  randomState += 0x6D2B79F5;
  let value = randomState;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
};

function equipBestWorkshopStartingGear(character, workshop) {
  const candidates = getWorkshopGrants(workshop).startingGear
    .map(itemId => ITEMS[itemId])
    .filter(item => item && (!item.classes || item.classes.includes(character.class)))
    .sort((left, right) => (right.atk || 0) - (left.atk || 0));
  const best = candidates[0];
  const equipped = ITEMS[character.equipment.weapon];
  if (best && (best.atk || 0) > (equipped?.atk || 0)) {
    character.equipment[best.type] = best.id;
  }
}

function createSimulationState(className, startFloor, runSeed, scenario, workshop) {
  const currentRun = createDefaultCurrentRun();
  currentRun.runSeed = runSeed;
  currentRun.startFloor = startFloor;
  currentRun.deepestFloor = startFloor;
  currentRun.characterClass = className;
  currentRun.floorsVisited = [startFloor];
  assignRunQuests(currentRun);

  const character = applyWorkshopToCharacter(createSoloCharacter(className), workshop);
  const workshopGrants = getWorkshopGrants(workshop);
  const identificationPolicy = scenario.identificationPolicy || "legacy";
  // legacyは既存の鑑定済み経路と乱数列を維持し、比較対象だけ実runの初期支給を使う。
  const useRealIdentificationSupply = identificationPolicy !== "legacy";
  const departureKitPurchased = Object.hasOwn(scenario, "departureKit")
    ? scenario.departureKit
    : useRealIdentificationSupply;
  const departureKitGrants = getDepartureKitGrants(departureKitPurchased);
  const startingPowder = useRealIdentificationSupply
    ? IDENTIFICATION_BALANCE.startingPowder
    : 0;
  const departureKitPowder = useRealIdentificationSupply
    ? departureKitGrants.identifyPowder
    : 0;
  const initialIdentificationPowder = {
    starting: startingPowder,
    workshop: workshopGrants.identifyPowder,
    departureKit: departureKitPowder
  };
  // src/movement.js:669の式と同じ初期値（legacyのみ旧sim互換の工房粉だけ）。
  const initialIdentifyTickets = useRealIdentificationSupply
    ? IDENTIFICATION_BALANCE.startingPowder +
      workshopGrants.identifyPowder +
      departureKitGrants.identifyPowder
    : workshopGrants.identifyPowder;
  const workshopReturnItems = scenario.ignoreWorkshopReturnItems
    ? []
    : workshopGrants.returnItems;
  const departureKitReturnItems = departureKitPurchased
    ? departureKitGrants.returnItems
    : [];
  const scenarioReturnItems = [
    ...(scenario.workshopReturnItem ? [scenario.workshopReturnItem] : []),
    ...Array(Math.max(0, scenario.startingTownPortals || 0)).fill("TOWN_PORTAL")
  ];
  equipBestWorkshopStartingGear(character, workshop);

  return {
    party: [character],
    combatState: null,
    inventory: [
      ...Array(INITIAL_HEAL_POTIONS).fill("HEAL_POTION"),
      ...Array(INITIAL_ANTIDOTES).fill("ANTIDOTE"),
      ...Array(INITIAL_GUARD_POTIONS).fill("GUARD_POTION"),
      ...workshopReturnItems,
      ...departureKitReturnItems,
      ...scenarioReturnItems
    ],
    simHealPotionSources: Array(INITIAL_HEAL_POTIONS).fill("starting"),
    simPortalSources: [
      ...workshopReturnItems.map(() => "workshop"),
      ...departureKitReturnItems.map(() => "departure-kit"),
      ...scenarioReturnItems.map(() => scenario.startingPortalSource || "workshop-supply")
    ],
    firstKills: [],
    alarmActive: false,
    alarmWeakened: false,
    noiseEvents: [],
    // 学者の眼は永続codexの未登録判定を使うため、空codexから実更新させる。
    codex: createDefaultCodex(),
    currentRun,
    roamingMonsters: [],
    floorChestsTotal: [],
    metaMaterials: {},
    identifyTickets: initialIdentifyTickets,
    simIdentificationPowderAcquired: initialIdentificationPowder,
    gold: 0,
    firstChestUnidentifiedGuaranteed: false,
    simPolicy: {
      identificationPolicy,
      fleeHpThreshold: Object.hasOwn(scenario, "fleeHpThreshold")
        ? scenario.fleeHpThreshold
        : DEFAULT_FLEE_HP_THRESHOLD,
      statusCurePolicy: scenario.statusCurePolicy || DEFAULT_STATUS_CURE_POLICY,
      statusCureHpThreshold: Object.hasOwn(scenario, "statusCureHpThreshold")
        ? scenario.statusCureHpThreshold
        : DEFAULT_STATUS_CURE_HP_THRESHOLD,
      statusCureMerchantPolicy:
        scenario.statusCureMerchantPolicy || DEFAULT_STATUS_CURE_MERCHANT_POLICY,
      healPotionMerchantPolicy:
        scenario.healPotionMerchantPolicy || DEFAULT_HEAL_POTION_MERCHANT_POLICY,
      trapPolicy: scenario.trapPolicy || DEFAULT_TRAP_POLICY_ID,
      bossOverride: scenario.bossOverride || null,
      forcedBossAffixes: scenario.forcedBossAffixes || null,
      elitePolicy: scenario.elitePolicy || DEFAULT_ELITE_POLICY
    },
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

function countInventoryItems(inventory, itemIds = STATUS_CURE_ITEM_IDS) {
  const counts = Object.fromEntries([...itemIds].map(itemId => [itemId, 0]));
  inventory.forEach(item => {
    if (itemIds.has(item)) counts[item]++;
  });
  return counts;
}

function addItemCount(target, itemId, count = 1) {
  if (count <= 0) return;
  target[itemId] = (target[itemId] || 0) + count;
}

function recordHealPotionAcquisition(state, metrics, source, count = 1) {
  if (!metrics || count <= 0) return;
  metrics.healPotionsAcquiredBySource[source] =
    (metrics.healPotionsAcquiredBySource[source] || 0) + count;
  for (let index = 0; index < count; index++) {
    state.simHealPotionSources.push(source);
  }
}

function recordHealPotionConsumption(state, metrics, count = 1) {
  if (!metrics || count <= 0) return;
  for (let index = 0; index < count; index++) {
    const source = state.simHealPotionSources.shift() || "other";
    metrics.healPotionsConsumedBySource[source] =
      (metrics.healPotionsConsumedBySource[source] || 0) + 1;
  }
}

function recordStatusCureAcquisitions(
  metrics,
  before,
  after,
  source,
  usedBefore = null
) {
  STATUS_CURE_ITEM_IDS.forEach(itemId => {
    const consumed = usedBefore
      ? (metrics.statusCureItemsUsed[itemId] || 0) - (usedBefore[itemId] || 0)
      : 0;
    const gained = (after[itemId] || 0) - (before[itemId] || 0) + consumed;
    if (gained <= 0) return;
    addItemCount(metrics.statusCureItemsAcquired[source], itemId, gained);
  });
}

function createStatusCureDecision(state, inCombat = true) {
  const character = state.party[0];
  const status = character.status;
  const candidates = STATUS_CURE_ITEMS[status];
  if (!candidates) return null;
  const itemKey = candidates.find(candidate => state.inventory.includes(candidate)) || null;
  if (!itemKey) return { kind: "unavailable", status, itemKey: null };
  if (state.simPolicy.statusCurePolicy === "never") {
    return { kind: "policy-deferred", status, itemKey };
  }
  const hpRate = character.hp / Math.max(1, getCharMaxHp(character));
  if (hpRate > state.simPolicy.statusCureHpThreshold) {
    return { kind: "policy-deferred", status, itemKey };
  }
  if (inCombat && ["sleep", "paralyze", "paralyzed"].includes(status)) {
    return { kind: "incapacitated", status, itemKey };
  }
  return { kind: "selected", status, itemKey };
}

function recordStatusCureDecision(metrics, decision, context) {
  if (!metrics || !decision) return;
  metrics.statusCureDecisions[decision.kind] =
    (metrics.statusCureDecisions[decision.kind] || 0) + 1;
  metrics.statusCureDecisionContexts[context] =
    (metrics.statusCureDecisionContexts[context] || 0) + 1;
  if (decision.kind === "unavailable") {
    metrics.statusCureUnavailableStatuses[decision.status] =
      (metrics.statusCureUnavailableStatuses[decision.status] || 0) + 1;
  }
  if (["policy-deferred", "incapacitated"].includes(decision.kind)) {
    metrics.statusCureHeldNotUsedStatuses[decision.status] =
      (metrics.statusCureHeldNotUsedStatuses[decision.status] || 0) + 1;
  }
}

function selectCombatAction(state, metrics) {
  const character = state.party[0];
  const monsters = state.combatState.monsters;
  const statusTargetIdx = getLowestHpEnemyIndex(
    monsters,
    monster => monster.status && !["ok", "dead"].includes(monster.status)
  );
  const lowestHpIdx = statusTargetIdx >= 0 ? statusTargetIdx : getLowestHpEnemyIndex(monsters);

  const fleeThreshold = state.simPolicy.fleeHpThreshold;
  if (
    fleeThreshold !== null &&
    character.hp <= getCharMaxHp(character) * fleeThreshold
  ) {
    return { type: "run", actorIdx: 0 };
  }

  const cureDecision = createStatusCureDecision(state);
  recordStatusCureDecision(metrics, cureDecision, "combat");
  if (cureDecision?.kind === "selected") {
    return {
      type: "item",
      actorIdx: 0,
      targetIdx: 0,
      itemKey: cureDecision.itemKey,
      simStatusBefore: cureDecision.status
    };
  }

  // #271: 守りの薬はボス/中ボス戦の開幕に使う保守的方針。通常戦では温存する。
  // combat_start.js が戦闘開始時にbuffsを消すため、戦闘外の事前使用は無意味。
  if (
    state.combatState.roundNumber === 1 &&
    monsters.some(monster => monster.isBoss || monster.isMidboss) &&
    state.inventory.includes("GUARD_POTION")
  ) {
    return { type: "item", actorIdx: 0, targetIdx: 0, itemKey: "GUARD_POTION" };
  }

  // #304: 攻勢バフもボス/中ボス戦の開幕へ寄せる。1ラウンド1個で 守り → 剛力 → 疾風 の順。
  // 使用ターンは攻撃を捨てるため代価がある。実測は B5撤退 生還 87.8%→86.2%、
  // B20撤退 51.4%（+1.0pt）で、浅層では割に合わず深層では見合う。
  // なお中ボス（デーモンガード）は isBoss も持つため、isBoss だけに絞っても挙動は同じ。
  if (
    state.combatState.roundNumber === 2 &&
    monsters.some(monster => monster.isBoss || monster.isMidboss) &&
    state.inventory.includes("STR_POTION")
  ) {
    return { type: "item", actorIdx: 0, targetIdx: 0, itemKey: "STR_POTION" };
  }

  if (
    state.combatState.roundNumber === 3 &&
    monsters.some(monster => monster.isBoss || monster.isMidboss) &&
    state.inventory.includes("HASTE_POTION")
  ) {
    return { type: "item", actorIdx: 0, targetIdx: 0, itemKey: "HASTE_POTION" };
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
  const livingMonsters = monsters.filter(monster => monster.hp > 0);
  // 実ゲームのKATINOを、初手・複数敵・回復MP確保時だけ使う保守的方針。
  if (
    state.combatState.roundNumber === 1 &&
    livingMonsters.length >= 2 &&
    hasSpell(character, "KATINO") &&
    character.mp >= SPELLS.KATINO.cost + reserveMp
  ) {
    return { type: "spell", actorIdx: 0, targetIdx: lowestHpIdx, spellName: "KATINO" };
  }

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

function getPreferredOffensiveSpellName(character) {
  if (character.class === "Priest" && hasSpell(character, "BADIOS")) return "BADIOS";
  if ((character.class === "Mage" || character.class === "Samurai") && hasSpell(character, "HALITO")) {
    return "HALITO";
  }
  if (character.class === "Bishop") {
    if (hasSpell(character, "BADIOS")) return "BADIOS";
    if (hasSpell(character, "HALITO")) return "HALITO";
  }
  if (character.class === "Ranger" && hasSpell(character, "BADIOS")) return "BADIOS";
  return null;
}

function getBloodWandOpportunity(state, action) {
  if (action.type !== "fight") return null;
  const character = state.party[0];
  const hpCostMultiplier = CORE_AFFIX_BY_ID.get("CORE_BLOOD_WAND").params.hpCostMultiplier;
  if (
    hasSpell(character, "DIOS") &&
    character.hp < getCharMaxHp(character) * 0.35 &&
    !state.inventory.includes("HEAL_POTION")
  ) {
    const spell = SPELLS.DIOS;
    if (character.mp < spell.cost && character.hp >= spell.cost * hpCostMultiplier) return "heal";
  }

  const spellName = getPreferredOffensiveSpellName(character);
  if (!spellName) return null;
  const spell = SPELLS[spellName];
  return character.mp < spell.cost && character.hp >= spell.cost * hpCostMultiplier
    ? "offense"
    : null;
}

function sumLoggedDamage(logQueue, character, actionType) {
  return logQueue.reduce((sum, entry) => {
    const msg = entry.msg || "";
    if (!msg.startsWith("[味方]") || !msg.includes(character.name) || !msg.includes("ダメージ")) {
      return sum;
    }
    if (actionType === "fight" && !/(攻撃|必殺の一撃|素早い追加攻撃)/.test(msg)) return sum;
    if (actionType === "spell" && !msg.includes("唱えた")) return sum;
    const match = msg.match(/に(\d+)の[^！。]*ダメージ/);
    return sum + (match ? Number(match[1]) : 0);
  }, 0);
}

function sumLoggedIncomingDamage(logQueue, characterName) {
  const escapedName = characterName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const damagePattern = new RegExp(`${escapedName}(?:は|に)(\\d+)の[^。！]*ダメージ`, "g");
  return logQueue.reduce((result, { msg = "" }) => {
    let match;
    while ((match = damagePattern.exec(msg)) !== null) {
      result.hits++;
      result.damage += Number(match[1]);
    }
    damagePattern.lastIndex = 0;
    return result;
  }, { hits: 0, damage: 0 });
}

function getLoggedDiosHealing(logQueue, character) {
  const entry = logQueue.find(({ msg = "" }) =>
    msg.startsWith("[味方]") && msg.includes(`${character.name}はディオスを唱えた`)
  );
  const match = entry?.msg.match(/HPを(\d+)回復/);
  return match ? Number(match[1]) : 0;
}

function getHpAtOffensiveAction(logQueue, characterBefore, action) {
  const actionIndex = logQueue.findIndex(({ msg = "" }) => {
    if (!msg.startsWith("[味方]")) return false;
    if (action.type === "fight") {
      return msg.includes(characterBefore.name) && /(攻撃|必殺の一撃)/.test(msg);
    }
    return msg.includes(`${characterBefore.name}は`) && msg.includes("唱えた");
  });
  if (actionIndex < 0) return null;

  const damageBeforeAction = logQueue.slice(0, actionIndex).reduce((sum, { msg = "" }) => {
    if (!msg.startsWith("[ 敵 ]") || msg.includes("反射")) return sum;
    const match = msg.match(new RegExp(`${characterBefore.name}に(\\d+)の[^！。]*ダメージ`));
    return sum + (match ? Number(match[1]) : 0);
  }, 0);
  return Math.max(0, characterBefore.hp - damageBeforeAction);
}

function recordRoundCoreObservations(
  observations,
  characterBefore,
  action,
  targetBeforeRound,
  monstersBeforeRound,
  roundResult,
  firstStrikeSucceeded
) {
  const characterAfter = roundResult.state.party[0];
  const logQueue = roundResult.logQueue;
  const spell = action.type === "spell" ? SPELLS[action.spellName] : null;
  const offensive = action.type === "fight" ||
    (spell?.target?.includes("enemy") && action.spellName !== "KATINO");

  if (offensive) {
    observations.offensiveTurns++;
    const lastStand = CORE_AFFIX_BY_ID.get("CORE_LAST_STAND").params;
    const hpAtAction = getHpAtOffensiveAction(logQueue, characterBefore, action);
    if (
      hpAtAction !== null &&
      hpAtAction / Math.max(1, getCharMaxHp(characterBefore)) <= lastStand.hpThreshold
    ) {
      observations.lowHpOffensiveTurns++;
    }
    if (targetBeforeRound?.maxHp > getCharMaxHp(characterBefore)) {
      observations.giantTargetTurns++;
    }
    if (targetBeforeRound?.status && !["ok", "dead"].includes(targetBeforeRound.status)) {
      observations.statusTargetTurns++;
    }
    observations.curseSamples++;
    observations.equippedCurseTotal += getEquippedCurseCount(characterBefore);
  }

  if (action.type === "fight") {
    observations.fightTurns++;
    observations.fightDamageActions++;
    observations.fightDamage += sumLoggedDamage(logQueue, characterAfter, "fight");
    observations.openerFirstStrikeFightTurns += Number(firstStrikeSucceeded);
  } else if (spell?.target?.includes("enemy") && action.spellName !== "KATINO") {
    observations.spellDamageActions++;
    observations.spellDamage += sumLoggedDamage(logQueue, characterAfter, "spell");
  } else if (action.type === "spell" && action.spellName === "DIOS") {
    observations.diosHealActions++;
    observations.diosHealing += getLoggedDiosHealing(logQueue, characterAfter);
  }

  const incomingPhysicalLogs = logQueue.filter(({ msg = "" }) =>
    msg.startsWith("[ 敵 ]") && /の(?:攻撃|狙撃)！/.test(msg)
  );
  observations.incomingPhysicalAttempts += incomingPhysicalLogs.length;
  observations.incomingPhysicalHits += incomingPhysicalLogs.filter(({ msg = "" }) =>
    /に\d+のダメージ/.test(msg)
  ).length;

  // #312: 発動を潰しているのが「対象タグ」なのか「MPに空き」なのかを切り分けるため、
  // 撃破総数・タグ一致撃破・MP空きあり撃破の3段を数える。
  const newlyDefeated = monstersBeforeRound.filter(({ hp }, index) =>
    hp > 0 && roundResult.state.combatState.monsters[index]?.hp <= 0
  );
  const newlyDefeatedPurifyTargets = newlyDefeated.filter(({ tags }) =>
    CORE_AFFIX_BY_ID.get("CORE_PURIFY_RING").params.targetTags.some(tag => tags?.includes(tag))
  ).length;
  observations.totalKills += newlyDefeated.length;
  observations.purifyTagKills += newlyDefeatedPurifyTargets;
  if (characterAfter.mp < getCharMaxMp(characterAfter)) {
    observations.purifyKillsWithMpRoom += newlyDefeatedPurifyTargets;
    observations.killsWithMpRoom += newlyDefeated.length;
  }
  if (getCharMaxMp(characterAfter) > 0) {
    observations.purifyTagKillsByCaster += newlyDefeatedPurifyTargets;
  }
}

function runEncounter(
  state,
  observations,
  diagnostics = null,
  metrics = null,
  {
    isBoss = false,
    isMidboss = false,
    isElite = false,
    roamingMonster = null,
    encounterCoord = null,
    retreatCoord = null
  } = {}
) {
  const { monsters } = generateEncounter(
    state,
    isBoss,
    isMidboss,
    isElite,
    roamingMonster
  );
  if (state.alarmActive) {
    const multiplier = state.alarmWeakened ? 1.10 : 1.20;
    monsters.forEach(monster => {
      monster.maxHp = Math.round(monster.maxHp * multiplier);
      monster.hp = monster.maxHp;
      if (monster.str) monster.str = Math.round(monster.str * multiplier);
      if (monster.int) monster.int = Math.round(monster.int * multiplier);
    });
    state.alarmActive = false;
    state.alarmWeakened = false;
  }
  if (isBoss && state.simPolicy.bossOverride?.floor === state.floor) {
    const override = state.simPolicy.bossOverride;
    monsters.forEach(monster => {
      if (Number.isFinite(override.hpMultiplier)) {
        monster.maxHp = Math.max(1, Math.round(monster.maxHp * override.hpMultiplier));
        monster.hp = monster.maxHp;
      }
      if (Number.isFinite(override.atkMultiplier)) {
        monster.atk = Math.max(1, Math.round(monster.atk * override.atkMultiplier));
      }
      if (override.disableSpell) {
        monster.spell = null;
        monster.spellChance = 0;
      }
    });
  }
  if (isBoss && state.simPolicy.forcedBossAffixes?.floor === state.floor) {
    const character = state.party[0];
    character.equipment.simBossAffixes = {
      baseId: "SIM_BOSS_AFFIXES",
      identified: true,
      affixes: Object.entries(state.simPolicy.forcedBossAffixes.values || {}).map(
        ([type, value]) => ({ id: type, kind: "support", type, value })
      )
    };
  }
  monsters.forEach(monster => {
    const baseName = monster.name.replace(/\s[A-Z]$/, "");
    monster.simWasUncatalogued = (state.codex?.monsters?.[baseName]?.killed || 0) === 0;
  });
  state.combatState = {
    monsters,
    isBoss,
    isMidboss,
    isRoamingFlack: isElite,
    roamingMonsterId: roamingMonster?.id || null,
    retreatPosition: retreatCoord ? { ...retreatCoord } : null,
    allParalyzedTurns: 0,
    phase: "choose_actions",
    roundNumber: 1
  };
  if (encounterCoord) {
    state.x = encounterCoord.x;
    state.y = encounterCoord.y;
  }
  const encounterType = isBoss
    ? "boss"
    : (isMidboss ? "midboss" : (isElite ? "elite" : "normal"));
  const startBuild = (isBoss || isMidboss || isElite) && metrics?.collectSpecialBattles
    ? createBuildSnapshot(state, metrics?.scoringProfile || null, `${encounterType}-start`)
    : null;
  const telemetry = {
    type: encounterType,
    floor: state.floor,
    enemyNames: monsters.map(monster => monster.name),
    enemyAttack: Math.max(...monsters.map(monster => monster.atk || 0)),
    playerMaxHp: getCharMaxHp(state.party[0]),
    incomingHits: 0,
    incomingDamage: 0,
    maxIncomingHit: 0,
    maxIncomingHitRate: 0
  };
  const encounterDiagnostic = diagnostics
    ? {
        floor: state.floor,
        type: encounterType,
        monsters: monsters.map(monster => ({
          name: monster.name,
          atk: monster.atk,
          maxHp: monster.maxHp,
          spell: monster.spell || null,
          traits: [...(monster.traits || [])],
          statuses: [
            monster.isPoisonous ? "poison" : null,
            monster.isParalyzing ? "paralyze" : null,
            monster.isSleepInflicting ? "sleep" : null,
            monster.isBlinding ? "blind" : null
          ].filter(Boolean)
        })),
        startHp: state.party[0].hp,
        startPlayerName: state.party[0].name,
        startMaxHp: getCharMaxHp(state.party[0]),
        startRawMaxHp: state.party[0].maxHp,
        startMp: state.party[0].mp,
        startHealPotions: state.inventory.filter(item => item === "HEAL_POTION").length,
        startStatusCures: countInventoryItems(state.inventory),
        startBuild: startBuild ? structuredClone(startBuild) : null,
        rounds: []
      }
    : null;
  const finishEncounter = (result, rounds, healPotionsUsed) => {
    if (encounterDiagnostic) {
      encounterDiagnostic.result = result;
      encounterDiagnostic.endHp = state.party[0].hp;
      encounterDiagnostic.endMp = state.party[0].mp;
      encounterDiagnostic.endStatus = state.party[0].status;
      encounterDiagnostic.endHealPotions =
        state.inventory.filter(item => item === "HEAL_POTION").length;
      encounterDiagnostic.endStatusCures = countInventoryItems(state.inventory);
      encounterDiagnostic.endEnemyHp = state.combatState.monsters.map(monster => ({
        name: monster.name,
        hp: monster.hp,
        maxHp: monster.maxHp
      }));
      diagnostics.encounters.push(encounterDiagnostic);
    }
    return { result, rounds, healPotionsUsed, state, startBuild, telemetry };
  };

  let rounds = 0;
  let healPotionsUsed = 0;
  for (; rounds < MAX_COMBAT_TURNS; rounds++) {
    const character = state.party[0];
    if (!isAlive(character)) return finishEncounter("death", rounds, healPotionsUsed);
    if (state.combatState.monsters.every(monster => monster.hp <= 0)) {
      return finishEncounter("victory", rounds, healPotionsUsed);
    }

    const action = selectCombatAction(state, metrics);
    const targetBeforeRound = action.targetIdx === undefined
      ? null
      : structuredClone(state.combatState.monsters[action.targetIdx]);
    const monstersBeforeRound = structuredClone(state.combatState.monsters);
    const characterBeforeRound = structuredClone(character);
    const bloodWandOpportunity = getBloodWandOpportunity(state, action);
    observations.bloodWandSpellOpportunities += Number(bloodWandOpportunity === "offense");
    observations.bloodWandHealOpportunities += Number(bloodWandOpportunity === "heal");

    const roundNumber = state.combatState.roundNumber;
    const roundRandomDraws = [];
    const simulationRandom = Math.random;
    Math.random = () => {
      const value = simulationRandom();
      roundRandomDraws.push(value);
      return value;
    };
    const potionCountBefore = state.inventory.filter(item => item === "HEAL_POTION").length;
    const selectedCureCountBefore = action.simStatusBefore
      ? state.inventory.filter(item => item === action.itemKey).length
      : 0;
    const identifyTicketsBeforeRound = state.identifyTickets || 0;
    const itemsFoundBeforeRound = state.currentRun.itemsFound.length;
    const diagnosticCureCountsBefore = encounterDiagnostic
      ? countInventoryItems(state.inventory)
      : null;
    let roundResult;
    try {
      roundResult = runCombatRoundCalculation(state, {
        actions: [action]
      });
    } finally {
      Math.random = simulationRandom;
    }
    const characterSpeed =
      getCharAgi(character) +
      getBuffTotal(character, "agi") +
      Math.floor(roundRandomDraws[0] * 10) +
      getCharAffixSum(character, "firstStrike");
    const livingMonsterCount = monstersBeforeRound.filter(monster => monster.hp > 0).length;
    const fastestMonsterSpeed = Math.max(
      ...roundRandomDraws
        .slice(1, 1 + livingMonsterCount)
        .map(value => 10 + Math.floor(value * 10))
    );
    // round.jsは同速時、先にturnsへ入るcharacterを先行扱いする。
    const firstStrikeSucceeded =
      roundNumber === 1 &&
      (livingMonsterCount === 0 || characterSpeed >= fastestMonsterSpeed);
    recordRoundCoreObservations(
      observations,
      characterBeforeRound,
      action,
      targetBeforeRound,
      monstersBeforeRound,
      roundResult,
      firstStrikeSucceeded
    );
    state = roundResult.state;
    recordIdentificationPowderAcquisition(
      metrics,
      Math.max(0, (state.identifyTickets || 0) - identifyTicketsBeforeRound),
      "codex"
    );
    const potionCountAfter = state.inventory.filter(item => item === "HEAL_POTION").length;
    const potionDelta = potionCountBefore - potionCountAfter;
    healPotionsUsed += potionDelta;
    if (potionDelta > 0) {
      recordHealPotionConsumption(state, metrics, potionDelta);
    } else if (potionDelta < 0) {
      recordHealPotionAcquisition(state, metrics, "other", -potionDelta);
    }
    if (metrics && action.simStatusBefore) {
      const selectedCureCountAfter =
        state.inventory.filter(item => item === action.itemKey).length;
      const sameItemRewardCount = state.currentRun.itemsFound
        .slice(itemsFoundBeforeRound)
        .filter(item => item === action.itemKey)
        .length;
      const used = Math.max(
        0,
        selectedCureCountBefore + sameItemRewardCount - selectedCureCountAfter
      );
      addItemCount(metrics.statusCureItemsUsed, action.itemKey, used);
      if (used > 0) {
        metrics.statusesCured[action.simStatusBefore] =
          (metrics.statusesCured[action.simStatusBefore] || 0) + 1;
      }
    }
    const fled = roundResult.logQueue.some(entry => entry.runEscape);
    if (encounterDiagnostic) {
      encounterDiagnostic.rounds.push({
        round: roundNumber,
        action: action.type,
        spellName: action.spellName || null,
        itemKey: action.itemKey || null,
        hpBefore: characterBeforeRound.hp,
        hpAfter: state.party[0].hp,
        maxHp: getCharMaxHp(characterBeforeRound),
        rawMaxHp: characterBeforeRound.maxHp,
        mpBefore: characterBeforeRound.mp,
        mpAfter: state.party[0].mp,
        statusBefore: characterBeforeRound.status,
        statusAfter: state.party[0].status,
        healPotionsBefore: potionCountBefore,
        healPotionsAfter: potionCountAfter,
        statusCuresBefore: diagnosticCureCountsBefore,
        statusCuresAfter: countInventoryItems(state.inventory),
        enemiesBefore: monstersBeforeRound.map(monster => ({
          name: monster.name,
          hp: monster.hp,
          maxHp: monster.maxHp
        })),
        enemiesAfter: state.combatState.monsters.map(monster => ({
          name: monster.name,
          hp: monster.hp,
          maxHp: monster.maxHp
        })),
        log: roundResult.logQueue.map(entry => entry.msg || "")
      });
    }
    const incomingDamage = sumLoggedIncomingDamage(
      roundResult.logQueue,
      character.name
    );
    telemetry.incomingHits += incomingDamage.hits;
    telemetry.incomingDamage += incomingDamage.damage;
    telemetry.maxIncomingHit = Math.max(
      telemetry.maxIncomingHit,
      ...roundResult.logQueue.flatMap(({ msg = "" }) => {
        const escapedName = character.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const match = msg.match(new RegExp(`${escapedName}(?:は|に)(\\d+)の[^。！]*ダメージ`));
        return match ? [Number(match[1])] : [];
      })
    );
    telemetry.maxIncomingHitRate = Math.max(
      telemetry.maxIncomingHitRate,
      telemetry.maxIncomingHit / Math.max(1, telemetry.playerMaxHp)
    );

    if (!isAlive(state.party[0])) {
      return finishEncounter("death", rounds + 1, healPotionsUsed);
    }
    if (fled) {
      return finishEncounter("flee", rounds + 1, healPotionsUsed);
    }
    if (state.combatState.monsters.every(monster => monster.hp <= 0)) {
      return finishEncounter("victory", rounds + 1, healPotionsUsed);
    }
  }

  return finishEncounter("stalemate", rounds, healPotionsUsed);
}

function applyPostCombatRecovery(character, metrics = null) {
  while (hasSpell(character, "DIOS") && character.mp > 0 && character.hp < getCharMaxHp(character) * 0.70) {
    const hpBefore = character.hp;
    character.mp -= 1;
    SPELL_EFFECTS.DIOS({ caster: character, target: character });
    if (metrics) metrics.diosHealingHp += Math.max(0, character.hp - hpBefore);
  }
}

function useHealPotionIfNeeded(state, metrics) {
  const character = state.party[0];
  const maxHp = getCharMaxHp(character);
  if (!isAlive(character) || character.hp > maxHp * HEAL_POTION_THRESHOLD) return false;
  const potionIndex = state.inventory.indexOf("HEAL_POTION");
  if (potionIndex < 0) return false;
  state.inventory.splice(potionIndex, 1);
  recordHealPotionConsumption(state, metrics);
  ITEM_EFFECTS.HEAL_POTION({ char: character });
  return true;
}

function useStatusCureIfNeeded(state, metrics, context) {
  if (!isAlive(state.party[0])) return false;
  const decision = createStatusCureDecision(state, false);
  recordStatusCureDecision(metrics, decision, context);
  if (decision?.kind !== "selected") return false;
  const character = state.party[0];
  const itemIndex = state.inventory.indexOf(decision.itemKey);
  if (itemIndex < 0) return false;
  state.inventory.splice(itemIndex, 1);
  ITEM_EFFECTS[decision.itemKey]({ char: character });
  addItemCount(metrics.statusCureItemsUsed, decision.itemKey);
  metrics.statusesCured[decision.status] =
    (metrics.statusesCured[decision.status] || 0) + 1;
  return true;
}

function recordTrapActivation(metrics, source, type) {
  metrics.trapActivations++;
  metrics.trapActivationsBySource[source]++;
  metrics.trapActivationsByType[type] = (metrics.trapActivationsByType[type] || 0) + 1;
}

function recordTrapDamage(metrics, source, type, damage) {
  metrics.trapDamageHp += damage;
  metrics.trapDamageHpBySource[source] += damage;
  metrics.trapDamageHpByType[type] = (metrics.trapDamageHpByType[type] || 0) + damage;
}

function useTrapRecoveryIfNeeded(state, metrics) {
  const character = state.party[0];
  if (!isAlive(character)) return false;
  const needsPotion = character.hp <= getCharMaxHp(character) * HEAL_POTION_THRESHOLD;
  if (needsPotion) {
    const potionIndex = state.inventory.indexOf("HEAL_POTION");
    if (potionIndex < 0) {
      metrics.trapHealPotionShortages++;
    } else {
      state.inventory.splice(potionIndex, 1);
      recordHealPotionConsumption(state, metrics);
      ITEM_EFFECTS.HEAL_POTION({ char: character });
      metrics.healPotionsUsed++;
      metrics.trapHealPotionsUsed++;
    }
  }
  useStatusCureIfNeeded(state, metrics, "post-trap");
  return needsPotion;
}

function applyChestTrapEffect(state, trap, weakened, metrics) {
  const character = state.party[0];
  const targetIndex = Math.max(0, state.party.indexOf(character));
  const effect = resolveChestTrapEffect({
    trap,
    weakened,
    party: state.party,
    targetIndex,
    poisonWard: getCharAffixSum(character, "poisonWard"),
    rng: Math.random
  });
  recordTrapActivation(metrics, "chest", trap);

  if (trap === "poison needle") {
    character.hp = Math.max(0, character.hp - effect.targetDamage);
    clearCharIncapacitationOnDamage(character);
    if (character.hp === 0) {
      character.status = "dead";
    } else if (effect.targetPoisonTriggered && !effect.targetPoisonResisted) {
      character.status = "poisoned";
    }
    recordTrapDamage(metrics, "chest", trap, effect.targetDamage);
  } else if (trap === "gas bomb") {
    effect.partyDamage.forEach((damage, index) => {
      const target = state.party[index];
      if (damage <= 0) return;
      target.hp = Math.max(0, target.hp - damage);
      clearCharIncapacitationOnDamage(target);
      if (target.hp === 0) target.status = "dead";
      recordTrapDamage(metrics, "chest", trap, damage);
    });
  } else if (trap === "teleporter") {
    metrics.trapTeleports += Number(effect.teleported);
  } else if (trap === "flash bomb") {
    effect.partyBlind.forEach((blinded, index) => {
      if (blinded) state.party[index].status = "blind";
    });
  }

  useTrapRecoveryIfNeeded(state, metrics);
  return effect;
}

function applyFloorTrapEffect(state, trap, floor, weakened, metrics) {
  const effect = resolveFloorTrapEffect({
    trap,
    floor,
    party: state.party,
    weakened,
    rng: Math.random
  });
  recordTrapActivation(metrics, "floor", trap.type);

  effect.partyDamage.forEach((damage, index) => {
    const target = state.party[index];
    if (damage <= 0) return;
    target.hp = Math.max(0, target.hp - damage);
    clearCharIncapacitationOnDamage(target);
    if (target.hp === 0) target.status = "dead";
    recordTrapDamage(metrics, "floor", trap.type, damage);
  });
  effect.partyMpDrain.forEach((drain, index) => {
    if (drain > 0) {
      state.party[index].mp = Math.max(0, state.party[index].mp - drain);
    }
  });
  if (effect.alarm) {
    state.alarmActive = true;
    state.alarmWeakened = effect.alarmWeakened;
  }

  useTrapRecoveryIfNeeded(state, metrics);
  return effect;
}

function shouldUseTownPortal(state, scenario) {
  if (!scenario.useTownPortal || !isAlive(state.party[0])) return false;
  if (state.floor < PORTAL_MIN_FLOOR) return false;
  if (!state.inventory.includes("TOWN_PORTAL")) return false;
  const character = state.party[0];
  const hpRate = character.hp / Math.max(1, getCharMaxHp(character));
  const healPotions = state.inventory.filter(item => item === "HEAL_POTION").length;
  return hpRate <= PORTAL_HP_THRESHOLD && healPotions <= PORTAL_MAX_HEAL_POTIONS;
}

function useTownPortalIfNeeded(state, scenario, metrics, situation) {
  if (!shouldUseTownPortal(state, scenario)) return false;
  const character = state.party[0];
  const portalIndex = state.inventory.indexOf("TOWN_PORTAL");
  state.inventory.splice(portalIndex, 1);
  const source = state.simPortalSources.shift() || "unknown";
  metrics.townPortalsUsed++;
  metrics.portalUsesBySource[source] = (metrics.portalUsesBySource[source] || 0) + 1;
  metrics.portalUseEvents.push({
    floor: state.floor,
    situation,
    source,
    hpRate: character.hp / Math.max(1, getCharMaxHp(character)),
    healPotions: state.inventory.filter(item => item === "HEAL_POTION").length,
    carriedMaterials: totalMaterials(state.currentRun.materials)
  });
  return true;
}

function maybePurchaseMerchantWing(state, scenario, metrics) {
  if (!scenario.buyMerchantTownPortal || !isMilestoneFloor(state.floor)) return;
  if (state.inventory.includes("TOWN_PORTAL")) return;
  metrics.merchantWingAttempts++;
  const result = purchaseMilestoneStock(state, "return_wing");
  if (!result.ok) {
    metrics.merchantWingFailures[result.reason] =
      (metrics.merchantWingFailures[result.reason] || 0) + 1;
    return;
  }
  metrics.merchantWingsPurchased++;
  metrics.merchantPurchaseFloors.push(state.floor);
  metrics.portalAcquisitions.merchant++;
  state.simPortalSources.push("merchant");
}

function maybePurchaseMerchantStatusCures(state, metrics) {
  if (
    state.simPolicy.statusCureMerchantPolicy === "never" ||
    !isMilestoneFloor(state.floor)
  ) return;
  MERCHANT_STATUS_CURE_STOCK.forEach(({ stockId, itemId }) => {
    if (state.inventory.includes(itemId)) return;
    const result = purchaseMilestoneStock(state, stockId);
    if (!result.ok) {
      metrics.statusCureMerchantFailures[result.reason] =
        (metrics.statusCureMerchantFailures[result.reason] || 0) + 1;
      return;
    }
    addItemCount(metrics.statusCureItemsAcquired.merchant, itemId);
  });
}

function maybePurchaseMerchantHealPotion(state, metrics) {
  if (
    state.simPolicy.healPotionMerchantPolicy === "never" ||
    !isMilestoneFloor(state.floor) ||
    state.inventory.includes("HEAL_POTION")
  ) return;
  metrics.healPotionMerchantAttempts++;
  const result = purchaseMilestoneStock(state, "heal_potion");
  if (!result.ok) {
    metrics.healPotionMerchantFailures[result.reason] =
      (metrics.healPotionMerchantFailures[result.reason] || 0) + 1;
    return;
  }
  recordHealPotionAcquisition(state, metrics, "merchant");
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

function isUnidentifiedEquipment(item) {
  return Boolean(
    item &&
    typeof item === "object" &&
    item.identified === false &&
    isEquipment(getItemData(item))
  );
}

function recordIdentificationPowderAcquisition(metrics, amount, source) {
  if (!metrics || amount <= 0) return;
  metrics.identificationPowderAcquired += amount;
  metrics.identificationPowderAcquiredBySource[source] =
    (metrics.identificationPowderAcquiredBySource[source] || 0) + amount;
}

function maybeAcquireChestIdentificationPowder(state, metrics, rng = Math.random) {
  if (state.simPolicy.identificationPolicy === "legacy") return;
  // src/chest.jsのopenChestと同じ抽選位置。純粋な供給関数がないため、実定数を直接使う。
  if (rng() >= IDENTIFICATION_BALANCE.chestPowderChance) return;
  state.identifyTickets = (state.identifyTickets || 0) + 1;
  recordIdentificationPowderAcquisition(metrics, 1, "chest");
}

function identifyAvailableEquipment(state, metrics, rng = Math.random) {
  if (state.simPolicy.identificationPolicy !== "powder") return;
  for (const item of state.inventory) {
    if (!isUnidentifiedEquipment(item)) continue;
    const identifyTicketsBefore = state.identifyTickets || 0;
    const result = identifyEquipment(state, item, state.party[0], rng);
    if (!result.ok) break;
    metrics.identificationCount++;
    metrics.identificationPowderUsed += Math.max(
      0,
      identifyTicketsBefore - (state.identifyTickets || 0)
    );
  }
}

function getUnidentifiedSelectionScore(item) {
  const rarityScore = { magic: 1, rare: 2, epic: 3 }[item?.rarity] || 0;
  return (item?.level || 0) * 10 + rarityScore;
}

function isPotentialUnidentifiedUpgrade(item, oldEquipment) {
  if (isCurseLocked(oldEquipment)) return false;
  if (!oldEquipment) return true;
  return (item?.level || 0) >= (oldEquipment.level || 0);
}

function isEquipment(item) {
  return ["weapon", "shield", "armor", "accessory"].includes(item?.type);
}

function getItemCoreId(item) {
  if (!item || typeof item !== "object") return null;
  const affix = item.affixes?.find(candidate => CORE_AFFIX_IDS.has(candidate.id || candidate.type));
  return affix ? (affix.id || affix.type) : null;
}

function getBaseEquipmentScore(character) {
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

function getOffenseEquipmentScore(character) {
  return (
    getCharWeaponAtk(character) * EQUIPMENT_SCORE_WEIGHTS.weaponAtk +
    getCharStr(character) * EQUIPMENT_SCORE_WEIGHTS.str +
    getCharInt(character) * EQUIPMENT_SCORE_WEIGHTS.int +
    getCharPie(character) * EQUIPMENT_SCORE_WEIGHTS.pie
  );
}

function createCoreScoringProfile(observations, runCount) {
  const divide = (numerator, denominator) => denominator > 0 ? numerator / denominator : 0;
  const averageFightDamage = divide(observations.fightDamage, observations.fightDamageActions);
  const averageSpellDamage = divide(observations.spellDamage, observations.spellDamageActions);
  const averageDiosHealing = divide(observations.diosHealing, observations.diosHealActions);
  const expectedTrapDisarmsFromFloor = {};
  let remainingTrapDisarms = 0;
  for (let floor = observations.expectedTrapDisarmsByFloor.length - 1; floor >= 1; floor--) {
    remainingTrapDisarms += observations.expectedTrapDisarmsByFloor[floor] || 0;
    expectedTrapDisarmsFromFloor[floor] = divide(remainingTrapDisarms, runCount);
  }
  const sumRemainingByFloor = values => {
    const result = {};
    let remaining = 0;
    for (let floor = values.length - 1; floor >= 1; floor--) {
      remaining += values[floor] || 0;
      result[floor] = divide(remaining, runCount);
    }
    return result;
  };
  return {
    lowHpOffensiveRate: divide(observations.lowHpOffensiveTurns, observations.offensiveTurns),
    giantTargetRate: divide(observations.giantTargetTurns, observations.offensiveTurns),
    statusTargetRate: divide(observations.statusTargetTurns, observations.offensiveTurns),
    openerFirstStrikeRate: divide(
      observations.openerFirstStrikeFightTurns,
      observations.fightTurns
    ),
    bloodWandSpellOpportunityRate: divide(
      observations.bloodWandSpellOpportunities,
      observations.offensiveTurns
    ),
    bloodWandHealOpportunityRate: divide(
      observations.bloodWandHealOpportunities,
      observations.offensiveTurns
    ),
    purifyMpPerOffensiveTurn: divide(
      observations.purifyKillsWithMpRoom,
      observations.offensiveTurns
    ),
    // #312: 二重条件のどちらが効いているかの内訳
    purifyFunnel: {
      totalKills: observations.totalKills,
      tagKills: observations.purifyTagKills,
      tagKillsByCaster: observations.purifyTagKillsByCaster,
      killsWithMpRoom: observations.killsWithMpRoom,
      tagKillsWithMpRoom: observations.purifyKillsWithMpRoom
    },
    incomingPhysicalHitRate: divide(
      observations.incomingPhysicalHits,
      observations.incomingPhysicalAttempts
    ),
    expectedTrapDisarmsPerRun: divide(observations.expectedTrapDisarms, runCount),
    expectedTrapDisarmsFromFloor,
    expectedPickedChestsFromFloor: sumRemainingByFloor(observations.pickedChestsByFloor),
    expectedCampBonusHpFromFloor: sumRemainingByFloor(observations.campBonusHpByFloor),
    expectedCampBonusMpFromFloor: sumRemainingByFloor(observations.campBonusMpByFloor),
    expectedScholarMaterialsFromFloor: sumRemainingByFloor(
      observations.scholarMaterialBonusByFloor
    ),
    expectedBountyMaterialsPerRun: divide(observations.bountyBonusMaterials, runCount),
    averageEquippedCurseCount: divide(
      observations.equippedCurseTotal,
      observations.curseSamples
    ),
    averageFightDamage,
    averageSpellDamage,
    averageDiosHealing,
    spellDamageUplift: averageFightDamage > 0
      ? Math.max(0, averageSpellDamage / averageFightDamage - 1)
      : 0,
    observations
  };
}

function getCombatCoreScore(character, scoringProfile, floor) {
  if (!scoringProfile) return 0;
  const coreId = getEquippedCoreAffixes(character)
    .map(affix => affix.id || affix.type)
    .find(id => COMBAT_CORE_IDS.has(id));
  if (!coreId) return 0;

  const params = CORE_AFFIX_BY_ID.get(coreId).params;
  const offenseScore = getOffenseEquipmentScore(character);
  const statWeight =
    EQUIPMENT_SCORE_WEIGHTS.str +
    EQUIPMENT_SCORE_WEIGHTS.vit +
    EQUIPMENT_SCORE_WEIGHTS.int +
    EQUIPMENT_SCORE_WEIGHTS.pie +
    EQUIPMENT_SCORE_WEIGHTS.agi;

  // 倍率コアは既存攻撃スコア×calibration実測稼働率×実params増分。
  if (coreId === "CORE_LAST_STAND") {
    return offenseScore * scoringProfile.lowHpOffensiveRate * (params.damageMultiplier - 1);
  }
  if (coreId === "CORE_GIANT_SLAYER") {
    return offenseScore * scoringProfile.giantTargetRate * (params.damageMultiplier - 1);
  }
  if (coreId === "CORE_EXECUTIONER") {
    return offenseScore * scoringProfile.statusTargetRate * (params.damageMultiplier - 1);
  }
  // 追撃100%を既存followUpの%重みへ載せ、実先制成功率だけ稼働させる。
  if (coreId === "CORE_OPENER") {
    return scoringProfile.openerFirstStrikeRate *
      params.followUpChance * 100 * EQUIPMENT_SCORE_WEIGHTS.followUp;
  }
  // MP不足時の追加詠唱は、実測spell/fightダメージ差。回復詠唱は実測DIOS回復量をHP重み換算。
  if (coreId === "CORE_BLOOD_WAND") {
    return offenseScore *
      scoringProfile.bloodWandSpellOpportunityRate *
      scoringProfile.spellDamageUplift +
      EQUIPMENT_SCORE_WEIGHTS.maxHp *
      scoringProfile.bloodWandHealOpportunityRate *
      scoringProfile.averageDiosHealing;
  }
  // 対象撃破で得る1MPを追加詠唱1回とみなし、実測spell/fight差へ換算。
  if (coreId === "CORE_PURIFY_RING") {
    return offenseScore *
      scoringProfile.purifyMpPerOffensiveTurn *
      params.mpRecovery *
      scoringProfile.spellDamageUplift;
  }
  // 罠出現と実解除率からrun当たり累積攻撃を算出。上限・増分とも実params。
  if (coreId === "CORE_TRAP_EATER") {
    const expectedRemainingDisarms =
      scoringProfile.expectedTrapDisarmsFromFloor[Math.max(1, Math.floor(floor))] || 0;
    const expectedAttack = Math.min(
      params.maxAttack,
      expectedRemainingDisarms * params.attackPerDisarm
    );
    return expectedAttack * EQUIPMENT_SCORE_WEIGHTS.weaponAtk;
  }
  // legacyでは実測装備呪い数が0、powder/gambleでは実生成呪いを反映。
  if (coreId === "CORE_CURSE_KEEPER") {
    return scoringProfile.averageEquippedCurseCount * params.statsPerCurse * statWeight;
  }
  // 物理攻撃の実被弾率×反撃率×威力を既存攻撃スコアへ換算。
  if (coreId === "CORE_THORN_SHIELD") {
    return offenseScore *
      scoringProfile.incomingPhysicalHitRate *
      params.counterChance *
      params.counterPower;
  }
  return 0;
}

function getEconomyCoreScore(character, scoringProfile, floor) {
  if (!scoringProfile) return 0;
  const coreId = getEquippedCoreAffixes(character)
    .map(affix => affix.id || affix.type)
    .find(id => ECONOMY_CORE_IDS.has(id));
  if (!coreId) return 0;

  const params = CORE_AFFIX_BY_ID.get(coreId).params;
  const scoringFloor = Math.max(1, Math.floor(floor));
  if (coreId === "CORE_TOMB_RAIDER") {
    return (scoringProfile.expectedPickedChestsFromFloor[scoringFloor] || 0) *
      params.materialBonus *
      MATERIAL_EV_SCORE_WEIGHT *
      TOMB_RAIDER_TRAP_RISK_DISCOUNT;
  }
  if (coreId === "CORE_CAMP_MASTER") {
    const hpEv = (scoringProfile.expectedCampBonusHpFromFloor[scoringFloor] || 0) *
      EQUIPMENT_SCORE_WEIGHTS.maxHp;
    const mpEv = (scoringProfile.expectedCampBonusMpFromFloor[scoringFloor] || 0) *
      Math.max(0, scoringProfile.averageSpellDamage - scoringProfile.averageFightDamage);
    return hpEv + mpEv;
  }
  if (coreId === "CORE_BOUNTY_HUNTER") {
    const remainingRunShare = Math.max(0, 21 - scoringFloor) / 20;
    return scoringProfile.expectedBountyMaterialsPerRun *
      remainingRunShare *
      MATERIAL_EV_SCORE_WEIGHT;
  }
  if (coreId === "CORE_SCHOLAR_EYE") {
    return (scoringProfile.expectedScholarMaterialsFromFloor[scoringFloor] || 0) *
      MATERIAL_EV_SCORE_WEIGHT;
  }
  // 忍び足は徘徊エリート追跡、慧眼は#236の未鑑定判断が未再現。両者は保持規則のみ。
  return 0;
}

function getEquipmentScore(character, scoringProfile, floor) {
  return getBaseEquipmentScore(character) +
    getCombatCoreScore(character, scoringProfile, floor) +
    getEconomyCoreScore(character, scoringProfile, floor);
}

function createBuildSnapshot(state, scoringProfile, point) {
  const character = state.party[0];
  const withoutEquipment = {
    ...structuredClone(character),
    equipment: {}
  };
  const supportAffixes = {};
  const coreIds = [];
  const equipment = Object.entries(character.equipment || {}).map(([slot, equipped]) => {
    const item = getItemData(equipped);
    const affixes = equipped && typeof equipped === "object"
      ? (equipped.affixes || [])
      : (item?.affixes || []);
    affixes.forEach(affix => {
      const id = affix.id || affix.type;
      if (CORE_AFFIX_IDS.has(id)) {
        coreIds.push(id);
      } else {
        supportAffixes[id] = (supportAffixes[id] || 0) + (affix.value || 0);
      }
    });
    return {
      slot,
      id: equipped && typeof equipped === "object" ? equipped.baseId : equipped,
      name: item?.name || null,
      type: item?.type || null,
      rarity: equipped && typeof equipped === "object" ? equipped.rarity : null,
      atk: item?.atk || 0,
      def: item?.def || 0,
      affixes: affixes.map(affix => ({
        id: affix.id || affix.type,
        kind: affix.kind || (CORE_AFFIX_IDS.has(affix.id || affix.type) ? "core" : "support"),
        value: affix.value || 0
      }))
    };
  });
  const equipmentStatScore =
    getBaseEquipmentScore(character) - getBaseEquipmentScore(withoutEquipment);
  const combatCoreScore = getCombatCoreScore(character, scoringProfile, state.floor);

  return {
    point,
    floor: state.floor,
    level: character.level,
    hp: character.hp,
    maxHp: getCharMaxHp(character),
    mp: character.mp,
    maxMp: getCharMaxMp(character),
    atk: getCharWeaponAtk(character),
    def: getCharDef(character),
    str: getCharStr(character),
    vit: getCharVit(character),
    int: getCharInt(character),
    pie: getCharPie(character),
    agi: getCharAgi(character),
    equipmentStatScore,
    combatCoreScore,
    combatBuildScore: equipmentStatScore + combatCoreScore,
    totalGreedyScore: getEquipmentScore(character, scoringProfile, state.floor),
    coreIds: [...new Set(coreIds)],
    supportAffixes,
    effectiveAffixes: Object.fromEntries(
      ["guardian", "spellGuard", "poisonWard", "statusResistance", "antiDemon"]
        .map(id => [id, getCharAffixSum(character, id)])
    ),
    resistanceScore:
      (supportAffixes.poisonWard || 0) + (supportAffixes.statusResistance || 0),
    equipment
  };
}

function recordCoreDecision(metrics, item, reason) {
  const coreId = getItemCoreId(item);
  if (!coreId) return;
  if (!metrics.coreDecisionReasons[coreId]) metrics.coreDecisionReasons[coreId] = new Set();
  metrics.coreDecisionReasons[coreId].add(reason);
}

function equipGreedyUpgrades(state, metrics, scoringProfile) {
  const character = state.party[0];
  identifyAvailableEquipment(state, metrics, Math.random);
  let upgrades = 0;
  const maxIterations = state.inventory.length * 2 + Object.keys(character.equipment).length;

  while (true) {
    if (upgrades > maxIterations) {
      throw new Error("equipment upgrade loop did not converge");
    }
    const currentScore = getEquipmentScore(character, scoringProfile, state.floor);
    let best = null;

    state.inventory.forEach((inventoryItem, index) => {
      const itemData = getItemData(inventoryItem);
      if (!isEquipment(itemData)) return;
      recordCoreItemEncounter(metrics, inventoryItem, state.floor);
      if (itemData.classes && !itemData.classes.includes(character.class)) {
        recordCoreDecision(metrics, inventoryItem, "class-incompatible");
        return;
      }

      const slot = itemData.type;
      const oldEquipment = character.equipment[slot];
      if (isCurseLocked(oldEquipment)) {
        recordCoreDecision(metrics, inventoryItem, "current-curse-locked");
        return;
      }
      const policy = state.simPolicy.identificationPolicy;
      const candidateIsUnidentified = isUnidentifiedEquipment(inventoryItem);
      const candidate = policy === "legacy"
        ? identifyWithoutCurse(inventoryItem)
        : inventoryItem;
      const candidateCoreId = getItemCoreId(candidate);
      const oldCoreId = getItemCoreId(oldEquipment);
      const candidateIsEconomyCore = ECONOMY_CORE_IDS.has(candidateCoreId);
      const candidateIsHoldOnlyCore = HOLD_ONLY_ECONOMY_CORE_IDS.has(candidateCoreId);
      let selectionScore;
      let candidateScore = null;
      let qualifies;
      let rejectionReason;

      if (policy === "gamble" && candidateIsUnidentified) {
        // 未鑑定品は真値を見ず、同階層以上の装備なら「更新になりうる」として着用候補化。
        qualifies = isPotentialUnidentifiedUpgrade(inventoryItem, oldEquipment);
        selectionScore = getUnidentifiedSelectionScore(inventoryItem);
        rejectionReason = "unidentified-not-potential-upgrade";
      } else if (policy === "powder" && candidateIsUnidentified) {
        qualifies = false;
        selectionScore = -Infinity;
        rejectionReason = "unidentified-held";
      } else {
        character.equipment[slot] = candidate;
        candidateScore = getEquipmentScore(character, scoringProfile, state.floor);
        character.equipment[slot] = oldEquipment;
        selectionScore = candidateScore;
        qualifies = candidateScore > currentScore;
        rejectionReason = candidateCoreId && COMBAT_CORE_IDS.has(candidateCoreId)
          ? "combat-score-not-higher"
          : (candidateIsEconomyCore ? "economy-ev-not-higher" : "score-not-higher");

        // EV算出不能な探索コアだけ、従来の95%保持規則を残す。
        if (candidateIsEconomyCore && oldCoreId) {
          qualifies = candidateScore > currentScore;
          rejectionReason = "economy-core-retained";
        } else if (candidateIsHoldOnlyCore) {
          qualifies = candidateScore >= currentScore * ECONOMY_CORE_KEEP_RATIO;
          selectionScore = candidateScore / ECONOMY_CORE_KEEP_RATIO;
          rejectionReason = "economy-below-95pct";
        // 装備済みcoreは、非coreが保持幅を明確に超えた場合だけ外す。
        } else if (oldCoreId && !candidateCoreId) {
          qualifies = candidateScore > currentScore / ECONOMY_CORE_KEEP_RATIO;
          rejectionReason = "equipped-core-retained";
        }
      }

      if (!qualifies) {
        recordCoreDecision(metrics, candidate, rejectionReason);
        return;
      }
      if (best && selectionScore <= best.selectionScore) return;
      best = {
        candidate,
        candidateCoreId,
        candidateIsUnidentified,
        index,
        oldEquipment,
        oldCoreId,
        selectionScore,
        slot
      };
    });

    if (!best) break;
    const wasUnidentified = best.candidateIsUnidentified;
    character.equipment[best.slot] = best.candidate;
    if (wasUnidentified && state.simPolicy.identificationPolicy === "gamble") {
      revealEquipmentOnEquip(best.candidate);
      metrics.unidentifiedWearCount++;
    }
    if (best.candidate.curseEffectId) metrics.curseHitCount++;
    if (best.candidateCoreId) {
      metrics.coreEverEquippedIds.add(best.candidateCoreId);
      const poolGroup = ENABLED_CORE_AFFIXES.find(
        affix => affix.id === best.candidateCoreId
      )?.poolGroup;
      if (
        poolGroup &&
        metrics.coreFirstEquippedFloorByGroup[poolGroup] === null
      ) {
        metrics.coreFirstEquippedFloorByGroup[poolGroup] = state.floor;
      }
      if (metrics.firstCoreEquippedFloor === null) {
        metrics.firstCoreEquippedFloor = state.floor;
      }
      recordCoreDecision(metrics, best.candidate, "equipped");
    }
    if (best.oldCoreId) recordCoreDecision(metrics, best.oldEquipment, "replaced");
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

function applySimulatedStairsHeal(character, metrics) {
  if (!isAlive(character)) return 0;
  const amount = getCharAffixSum(character, "stairsHeal");
  if (amount <= 0) return 0;
  const before = character.hp;
  character.hp = Math.min(getCharMaxHp(character), character.hp + amount);
  const healed = character.hp - before;
  if (metrics) metrics.stairsHealingHp += healed;
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

const ROUTE_DIRECTIONS = Object.freeze([
  { dx: 0, dy: -1, dir: 0 },
  { dx: 1, dy: 0, dir: 1 },
  { dx: 0, dy: 1, dir: 2 },
  { dx: -1, dy: 0, dir: 3 }
]);

function routeKey(coord) {
  return `${coord.x},${coord.y}`;
}

function findFloorCell(grid, predicate) {
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (predicate(grid[y][x])) return { x, y };
    }
  }
  return null;
}

function canTraverseRouteEdge(grid, current, direction) {
  const cell = grid[current.y]?.[current.x];
  const nextX = current.x + direction.dx;
  const nextY = current.y + direction.dy;
  const next = grid[nextY]?.[nextX];
  if (!cell || !next) return false;
  const revealedSecret = Boolean(cell.secretDoor?.[direction.dir]);
  if (cell.walls?.[direction.dir] && !revealedSecret) return false;
  return !next.blockEnter?.[(direction.dir + 2) % 4];
}

function findShortestFloorPath(grid, start, target, blockedKeys = new Set()) {
  if (!start || !target) return null;
  const startKey = routeKey(start);
  const targetKey = routeKey(target);
  const queue = [{ ...start }];
  const previous = new Map([[startKey, null]]);

  for (const current of queue) {
    const currentKey = routeKey(current);
    if (currentKey === targetKey) break;
    for (const direction of ROUTE_DIRECTIONS) {
      if (!canTraverseRouteEdge(grid, current, direction)) continue;
      const next = {
        x: current.x + direction.dx,
        y: current.y + direction.dy
      };
      const nextKey = routeKey(next);
      if (
        previous.has(nextKey) ||
        (blockedKeys.has(nextKey) && nextKey !== targetKey)
      ) {
        continue;
      }
      previous.set(nextKey, currentKey);
      queue.push(next);
    }
  }

  if (!previous.has(targetKey)) return null;
  const reversed = [];
  let cursor = targetKey;
  while (cursor) {
    const [x, y] = cursor.split(",").map(Number);
    reversed.push({ x, y });
    cursor = previous.get(cursor);
  }
  return reversed.reverse();
}

// 徘徊AIそのものは再現せず、実配置を基準に「回避の寄り道」と「意図的な挑戦」を比較する。
// 戦闘は実round/reward経路へ流し、sim内の敵・報酬オーバーライドは使わない。
function createEliteRoutePlan(generated, floor, runSeed, policy) {
  const elite = createFloorElite({ runSeed, floor, mapData: generated });
  if (!elite) return { elite: null, extraSteps: 0, encounterStep: null, avoidNoRoute: false };

  const grid = generated.grid;
  const start = findFloorCell(grid, cell => cell.type === "stairs-up");
  const stairs = findFloorCell(grid, cell => cell.type === "stairs-down");
  const directPath = findShortestFloorPath(grid, start, stairs);
  if (!start || !stairs || !directPath) {
    return { elite, extraSteps: 0, encounterStep: 1, avoidNoRoute: true };
  }

  const directDistance = Math.max(0, directPath.length - 1);
  if (policy === "engage") {
    const toElite = findShortestFloorPath(grid, start, elite);
    const fromElite = findShortestFloorPath(grid, elite, stairs);
    if (!toElite || !fromElite) {
      return { elite, extraSteps: 0, encounterStep: 1, avoidNoRoute: true };
    }
    const challengeDistance = Math.max(0, toElite.length - 1) + Math.max(0, fromElite.length - 1);
    return {
      elite,
      extraSteps: Math.ceil(Math.max(0, challengeDistance - directDistance) * EXPLORATION_FACTOR),
      encounterStep: Math.max(1, Math.ceil((toElite.length - 1) * EXPLORATION_FACTOR)),
      avoidNoRoute: false
    };
  }

  const avoidedPath = findShortestFloorPath(grid, start, stairs, new Set([routeKey(elite)]));
  if (!avoidedPath) {
    return { elite, extraSteps: 0, encounterStep: null, avoidNoRoute: true };
  }
  return {
    elite,
    extraSteps: Math.ceil(
      Math.max(0, avoidedPath.length - directPath.length) * EXPLORATION_FACTOR
    ),
    encounterStep: null,
    avoidNoRoute: false
  };
}

function createFloorRoutePlan(generated, floor, bossPolicy = "engage") {
  const grid = generated.grid;
  const start = findFloorCell(grid, cell => cell.type === "stairs-up");
  const stairs = findFloorCell(grid, cell => cell.type === "stairs-down");
  const specialCells = [];
  grid.forEach((row, y) => row.forEach((cell, x) => {
    if (![EVENT_TYPES.BOSS, "midboss"].includes(cell.event)) return;
    specialCells.push({
      x,
      y,
      type: cell.event,
      milestone: cell.event === EVENT_TYPES.BOSS && cell.milestoneFloor === floor
    });
  }));
  const specialByKey = new Map(specialCells.map(cell => [routeKey(cell), cell]));
  const path = [];
  const routeEvents = [];
  const visitedEvents = new Set();
  const appendPath = segment => {
    if (!segment) return false;
    const offset = path.length === 0 ? 0 : 1;
    segment.slice(offset).forEach(coord => {
      path.push(coord);
      const special = specialByKey.get(routeKey(coord));
      if (!special || visitedEvents.has(routeKey(special))) return;
      visitedEvents.add(routeKey(special));
      routeEvents.push({
        ...special,
        routeDistance: Math.max(0, path.length - 1),
        retreatCoord: path.length >= 2 ? { ...path[path.length - 2] } : { ...start }
      });
    });
    if (path.length === 0) path.push(...segment);
    return true;
  };

  if (!start || !stairs) {
    return {
      path: [],
      routeEvents,
      floorSteps: getFloorStepCount(generated, floor),
      specialCells,
      avoidedPathExists: false,
      milestoneForced: false
    };
  }

  path.push({ ...start });
  let current = start;
  let avoidedPathExists = false;
  let milestoneForced = false;

  if (bossPolicy === "avoid") {
    const blocked = new Set(specialCells.map(routeKey));
    const milestone = specialCells.find(cell => cell.milestone);
    const pathToStairs = findShortestFloorPath(grid, current, stairs, blocked);
    const stairsToMilestone = milestone
      ? findShortestFloorPath(grid, stairs, milestone)
      : null;
    const milestoneToStairs = milestone
      ? findShortestFloorPath(grid, milestone, stairs)
      : null;
    const canReturnForMilestone =
      !milestone || (stairsToMilestone && milestoneToStairs);
    if (pathToStairs && canReturnForMilestone) {
      avoidedPathExists = true;
      appendPath(pathToStairs);
      current = stairs;
    } else {
      if (milestone) {
        appendPath(findShortestFloorPath(grid, current, milestone));
        current = milestone;
      }
      appendPath(findShortestFloorPath(grid, current, stairs));
      current = stairs;
    }

    const remainingMilestone = specialCells.find(
      cell => cell.milestone && !visitedEvents.has(routeKey(cell))
    );
    if (remainingMilestone) {
      milestoneForced = true;
      appendPath(findShortestFloorPath(grid, current, remainingMilestone));
      current = remainingMilestone;
      appendPath(findShortestFloorPath(grid, current, stairs));
    }
  } else {
    const pending = [...specialCells];
    while (pending.length > 0) {
      const candidates = pending
        .map(cell => ({
          cell,
          segment: findShortestFloorPath(grid, current, cell)
        }))
        .filter(candidate => candidate.segment)
        .sort((left, right) => left.segment.length - right.segment.length);
      if (candidates.length === 0) break;
      const selected = candidates[0];
      appendPath(selected.segment);
      current = selected.cell;
      pending.splice(pending.indexOf(selected.cell), 1);
    }
    appendPath(findShortestFloorPath(grid, current, stairs));
  }

  const routeDistance = Math.max(1, path.length - 1);
  return {
    path,
    routeEvents,
    floorSteps: Math.max(
      getFloorStepCount(generated, floor),
      Math.ceil(routeDistance * EXPLORATION_FACTOR)
    ),
    specialCells,
    avoidedPathExists,
    milestoneForced
  };
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

function scheduleFloorTraps(generated, routePlan, floorSteps) {
  const schedule = new Map();
  const seen = new Set();
  routePlan.path.slice(1).forEach((coord, index) => {
    const trap = generated.grid[coord.y]?.[coord.x]?.trap;
    if (!trap || seen.has(trap.id)) return;
    seen.add(trap.id);
    const step = Math.min(
      floorSteps,
      Math.max(1, Math.ceil((index + 1) * EXPLORATION_FACTOR))
    );
    if (!schedule.has(step)) schedule.set(step, []);
    schedule.get(step).push({
      trap,
      previousCoord: routePlan.path[index]
    });
  });
  return schedule;
}

function getTrapAvoidancePlan(generated, currentCoord, trap) {
  const stairs = findFloorCell(generated.grid, cell => cell.type === "stairs-down");
  const blocked = new Set([routeKey(trap.position)]);
  const directPath = findShortestFloorPath(generated.grid, currentCoord, stairs);
  const alternatePath = findShortestFloorPath(
    generated.grid,
    currentCoord,
    stairs,
    blocked
  );
  if (!directPath || !alternatePath) return null;
  return {
    extraSteps: Math.ceil(
      Math.max(0, alternatePath.length - directPath.length) * EXPLORATION_FACTOR
    )
  };
}

function resolveFloorTrapAtPath(state, generated, floor, scheduled, metrics) {
  const { trap, previousCoord } = scheduled;
  if (state.simPolicy.trapPolicy === "legacy" || trap.state === "disabled") {
    return { pitfallTriggered: false };
  }

  if (trap.state === "hidden") {
    if (Math.random() < calculateDetectRate({ floor })) {
      trap.state = "discovered";
      metrics.trapDetections++;
    }
  }

  if (trap.state === "discovered") {
    const avoidance = getTrapAvoidancePlan(generated, previousCoord, trap);
    if (avoidance) {
      metrics.trapAvoided++;
      metrics.steps += avoidance.extraSteps;
      state.currentRun.steps += avoidance.extraSteps;
      return { pitfallTriggered: false };
    }
  }

  const character = state.party[0];
  const successRate = calculateFloorTrapSuccessRate({
    trap,
    className: character.class,
    level: character.level,
    floor,
    affixBonus: Math.round(getCharTrapBonus(character) * 100)
  });
  const action = trap.state === "hidden"
    ? "trigger"
    : (successRate >= FLOOR_DISARM_POLICY_MIN_RATE ? "disarm" : "force");
  const resolution = action === "trigger"
    ? { outcome: "triggered", partialSuccess: false }
    : resolveTrapAction({
      action,
      trap,
      successRate,
      rng: Math.random
    });

  if (action === "force") metrics.trapForced++;
  if (resolution.outcome === "disarmed") {
    trap.state = "disabled";
    state.currentRun.trapsDisarmed++;
    metrics.trapDisarms++;
    recordTrapDisarmObservation(metrics.coreObservations, floor);
    return { pitfallTriggered: false };
  }

  trap.state = "disabled";
  state.currentRun.trapsTriggered++;
  if (trap.type === "pitfall") {
    descendToNextFloor(state, floor + 1);
    applyFloorTrapEffect(state, trap, state.floor, resolution.partialSuccess, metrics);
    return { pitfallTriggered: true };
  }
  applyFloorTrapEffect(state, trap, floor, resolution.partialSuccess, metrics);
  return { pitfallTriggered: false };
}

function applySimulatedCampRest(state, observations, metrics = null) {
  if (!CAMP_FLOORS.has(state.floor)) return;
  const character = state.party[0];
  if (!isAlive(character)) return;
  const maxHp = getCharMaxHp(character);
  const maxMp = getCharMaxMp(character);
  const hpDeficit = Math.max(0, maxHp - character.hp);
  const mpDeficit = Math.max(0, maxMp - character.mp);
  const normalHpGain = Math.min(hpDeficit, Math.ceil(hpDeficit * 0.4));
  const normalMpGain = Math.min(mpDeficit, Math.ceil(mpDeficit * 0.4));
  const coreHpGain = Math.min(hpDeficit, Math.ceil(hpDeficit * 0.8));
  const coreMpGain = Math.min(mpDeficit, Math.ceil(mpDeficit * 0.8));
  observations.campBonusHpByFloor[state.floor] += coreHpGain - normalHpGain;
  observations.campBonusMpByFloor[state.floor] += coreMpGain - normalMpGain;

  // camp_rest.jsと同じ回復式。門番突破して次階へ進むsimではcamp到達済みと置く。
  const multiplier = getCharCoreParams(character, "CORE_CAMP_MASTER")?.recoveryMultiplier || 1;
  const hpGain = Math.min(hpDeficit, Math.ceil(hpDeficit * 0.4 * multiplier));
  character.hp += hpGain;
  character.mp += Math.min(mpDeficit, Math.ceil(mpDeficit * 0.4 * multiplier));
  if (metrics) metrics.campHealingHp += hpGain;
}

function getScholarMaterialBonus(monsters, state) {
  return monsters.reduce((sum, monster) => {
    if (monster.fled || monster.hasSplit) return sum;
    if (!monster.simWasUncatalogued) return sum;
    const normalDropChance = monster.isBoss
      ? 1
      : (monster.isRare ? 0.9 : getDepthMaterialDropChance(state.floor));
    const quantity = getDepthMaterialExpectedQuantity(state.floor, {
      startFloor: state.currentRun?.startFloor || 1
    });
    const primaryQuantity = quantity +
      (monster.isRare ? MATERIAL_DROP_BALANCE.rareBonus : 0) +
      (monster.isBoss ? MATERIAL_DROP_BALANCE.bossBonus : 0);
    const secondaryChance = (monster.isBoss || monster.isRare)
      ? 1
      : MATERIAL_DROP_BALANCE.secondaryChance;
    const secondaryQuantity = Math.max(1, Math.floor(quantity / 2));
    return sum + (1 - normalDropChance) *
      (primaryQuantity + secondaryChance * secondaryQuantity);
  }, 0);
}

function getChestCoreMinFloor(supplyOverride, itemKind) {
  const overrideKey = itemKind === "accessory"
    ? "chestAccessoryCoreMinFloor"
    : "chestEquipmentCoreMinFloor";
  const sourceMinFloor = itemKind === "accessory"
    ? CHEST_ACCESSORY_CORE_MIN_FLOOR
    : CHEST_EQUIPMENT_CORE_MIN_FLOOR;
  return supplyOverride?.[overrideKey] ?? sourceMinFloor;
}

function rollSupplyOverrideRarity(floor, supplyOverride, rng) {
  const rarity = supplyOverride?.earlyRarity;
  if (!rarity || floor > EARLY_BUILD_MAX_FLOOR) return null;
  const transitionSteps = Math.max(1, EARLY_BUILD_MAX_FLOOR - 1);
  const progress = Math.max(0, floor - 1) / transitionSteps;
  const epicChance = rarity.epicStart +
    (rarity.epicAtB10 - rarity.epicStart) * progress;
  const rareChance = rarity.rareStart +
    (rarity.rareAtB10 - rarity.rareStart) * progress;
  const roll = rng();
  if (roll < epicChance) return "epic";
  if (roll < rareChance) return "rare";
  return "magic";
}

function rerollSupplyEquipment(item, state, floor, source, supplyOverride, rng) {
  const rarity = rollSupplyOverrideRarity(floor, supplyOverride, rng);
  if (!rarity || !isEquipment(getItemData(item))) return item;
  const itemData = getItemData(item);
  const allowCores = source === "combat" || floor >= 3;
  if (itemData.type === "accessory") {
    return generateRandomAccessory(floor, rarity, rng, state.party, allowCores);
  }
  return generateRandomEquipment(
    floor,
    rarity,
    rng,
    state.party,
    source === "chest",
    allowCores
  );
}

function generateExtraSupplyEquipment(state, floor, source, supplyOverride, rng) {
  const chance = floor <= EARLY_BUILD_MAX_FLOOR
    ? (supplyOverride?.earlyExtraEquipmentChancePerEvent || 0)
    : 0;
  if (chance <= 0 || rng() >= chance) return null;
  const rarity = rollSupplyOverrideRarity(floor, supplyOverride, rng);
  const allowCores = source === "combat" || floor >= 3;
  if (rng() < 0.15) {
    return generateRandomAccessory(floor, rarity, rng, state.party, allowCores);
  }
  return generateRandomEquipment(
    floor,
    rarity,
    rng,
    state.party,
    source === "chest",
    allowCores
  );
}

function recordTrapDisarmObservation(observations, floor) {
  observations.expectedTrapDisarms++;
  observations.expectedTrapDisarmsByFloor[floor]++;
}

function resolveChestTrapForSimulation(
  state,
  floor,
  trap,
  mainItem,
  observations,
  metrics
) {
  const character = state.party[0];
  const chance = calculateChestDisarmChance({
    className: character.class,
    trapBonus: getCharTrapBonus(character),
    blind: character.status === "blind"
  });
  observations.trappedChests++;

  if (state.simPolicy.trapPolicy === "legacy") {
    const expectedDisarm = Math.max(0, Math.min(1, chance));
    observations.expectedTrapDisarms += expectedDisarm;
    observations.expectedTrapDisarmsByFloor[floor] += expectedDisarm;
    return { mainItemLost: false };
  }

  const kitIndex = state.inventory.indexOf("TRAP_KIT");
  if (kitIndex >= 0) {
    state.inventory.splice(kitIndex, 1);
    metrics.trapKitsUsed++;
    return { mainItemLost: false };
  }

  if (chance >= CHEST_DISARM_POLICY_MIN_CHANCE) {
    if (Math.random() < chance) {
      state.currentRun.trapsDisarmed++;
      metrics.trapDisarms++;
      recordTrapDisarmObservation(observations, floor);
      const previousTrapBonus = character.runTrapAttackBonus || 0;
      character.runTrapAttackBonus = getTrapEaterBonusAfterDisarm(
        character,
        previousTrapBonus
      );
      return { mainItemLost: false };
    }
    state.currentRun.trapsTriggered++;
    applyChestTrapEffect(state, trap, false, metrics);
    return { mainItemLost: false };
  }

  metrics.trapForced++;
  state.currentRun.trapsTriggered++;
  applyChestTrapEffect(state, trap, true, metrics);
  const itemData = getItemData(mainItem);
  const mainItemLost = itemData?.type === "usable" && Math.random() < 0.30;
  return { mainItemLost };
}

// 抽選そのものは src/rules/chest_rules.js（src/chest.js と同一の出所）を叩き、
// sim 固有の what-if（core解禁階の前倒し、TOWN_PORTAL の除外）だけを引数で渡す。
function rollChestItems(
  state,
  floor,
  rng,
  observations,
  scenario,
  supplyOverride = null,
  metrics = null
) {
  const trap = rollChestTrap(floor, rng);
  maybeAcquireChestIdentificationPowder(state, metrics, rng);
  if (floor === 1) {
    state.currentRun.b1ChestsOpened = (state.currentRun.b1ChestsOpened || 0) + 1;
  }

  const reward = rollChestReward({
    floor,
    rng,
    party: state.party,
    currentRun: state.currentRun,
    trap,
    firstChestGuaranteed: state.firstChestUnidentifiedGuaranteed,
    coreMinFloor: getChestCoreMinFloor(supplyOverride, "equipment"),
    itemCandidateFilter: scenario.allowChestTownPortal === false
      ? itemId => itemId !== "TOWN_PORTAL"
      : null
  });
  const item = reward.item;
  if (reward.consumedFirstChestGuarantee) {
    state.firstChestUnidentifiedGuaranteed = true;
  }

  const baselineItems = [
    item,
    rollChestAccessory(floor, rng, state.party, getChestCoreMinFloor(supplyOverride, "accessory"))
  ]
    .filter(Boolean)
    .map(found => rerollSupplyEquipment(
      found,
      state,
      floor,
      "chest",
      supplyOverride,
      rng
    ));
  const extra = generateExtraSupplyEquipment(
    state,
    floor,
    "chest",
    supplyOverride,
    rng
  );
  const items = extra ? [...baselineItems, extra] : baselineItems;
  const trapResult = trap === "none"
    ? { mainItemLost: false }
    : resolveChestTrapForSimulation(
      state,
      floor,
      trap,
      item,
      observations,
      metrics
    );
  return {
    items,
    mainItem: item,
    mainItemLost: trapResult.mainItemLost
  };
}

function hasBuildCoreAffix(item) {
  if (!hasCoreAffix(item)) return false;
  return item.affixes.some(affix => CORE_AFFIX_IDS.has(affix.id || affix.type));
}

function createFloorSupplyStats() {
  return Array.from({ length: 21 }, () => ({
    equipment: 0,
    core: 0,
    cursed: 0,
    rarity: { magic: 0, rare: 0, epic: 0, other: 0 },
    source: { combat: 0, chest: 0, other: 0 },
    coreSource: { combat: 0, chest: 0, other: 0 }
  }));
}

function createSupportCountDistribution() {
  return { 0: 0, 1: 0, 2: 0, 3: 0, "4+": 0 };
}

function recordSupportCount(metrics, item, rarity) {
  const supportCount = Array.isArray(item?.affixes)
    ? item.affixes.filter(affix => affix.kind !== "core").length
    : 0;
  const bucket = supportCount >= 4 ? "4+" : String(supportCount);
  metrics.supportCountDistribution[bucket]++;
  metrics.supportCountByRarity[rarity][bucket]++;
  metrics.totalSupportAffixesFound += supportCount;
  if (rarity === "rare" && hasBuildCoreAffix(item)) {
    metrics.rareCoreSupportCountDistribution[bucket]++;
  }
  if (rarity === "epic" && hasBuildCoreAffix(item)) {
    metrics.epicCoreSupportCountDistribution[bucket]++;
  }
}

function recordEquipmentAcquisitions(metrics, equipmentItems, floor, source = "other") {
  equipmentItems.forEach(item => {
    const normalizedSource = ["combat", "chest"].includes(source) ? source : "other";
    const rarity = ["magic", "rare", "epic"].includes(item?.rarity)
      ? item.rarity
      : "other";
    metrics.equipmentFound++;
    metrics.equipmentFoundBySource[normalizedSource]++;
    metrics.equipmentFoundByFloor[floor]++;
    metrics.floorSupplyStats[floor].equipment++;
    metrics.floorSupplyStats[floor].source[normalizedSource]++;
    metrics.rarityFound[rarity]++;
    (item?.affixes || [])
      .filter(affix => affix.kind !== "core")
      .forEach(affix => {
        const id = affix.id || affix.type;
        metrics.supportAffixFoundById[id] =
          (metrics.supportAffixFoundById[id] || 0) + 1;
      });
    metrics.floorSupplyStats[floor].rarity[rarity]++;
    recordSupportCount(metrics, item, rarity);
    if (item?.curseEffectId) {
      metrics.cursedEquipmentFound++;
      metrics.floorSupplyStats[floor].cursed++;
    }
    if (floor <= EARLY_BUILD_MAX_FLOOR) metrics.earlyEquipmentFound++;
    else metrics.deepEquipmentFound++;
    recordCoreItemEncounter(metrics, item, floor, normalizedSource);
  });
}

function recordCoreItemEncounter(metrics, item, floor, source = null) {
  if (!hasBuildCoreAffix(item)) return;
  const instanceKey = item.instanceId || item;
  const coreId = getItemCoreId(item);
  const poolGroup = ENABLED_CORE_AFFIXES.find(affix => affix.id === coreId)?.poolGroup;
  metrics.coreEncounteredIds.add(coreId);
  metrics.coreEncounterFloors.add(floor);
  if (
    poolGroup &&
    (
      metrics.coreFirstEncounterFloorByGroup[poolGroup] === null ||
      floor < metrics.coreFirstEncounterFloorByGroup[poolGroup]
    )
  ) {
    metrics.coreFirstEncounterFloorByGroup[poolGroup] = floor;
  }
  if (!metrics.coreEquipmentInstanceIds.has(instanceKey)) {
    const normalizedSource = source || "other";
    metrics.coreEquipmentInstanceIds.add(instanceKey);
    metrics.coreEncounterSources.add(normalizedSource);
    metrics.coreEquipmentFound++;
    metrics.coreEquipmentFoundById[coreId] = (metrics.coreEquipmentFoundById[coreId] || 0) + 1;
    metrics.coreEquipmentFoundBySource[normalizedSource]++;
    metrics.coreEquipmentFoundByFloor[floor]++;
    if (poolGroup) {
      metrics.coreEquipmentFoundByGroupAndFloor[poolGroup][floor]++;
    }
    metrics.floorSupplyStats[floor].core++;
    metrics.floorSupplyStats[floor].coreSource[normalizedSource]++;
    if (item?.curseEffectId) metrics.cursedCoreEquipmentFound++;
  }
  if (metrics.firstCoreDepth === null) metrics.firstCoreDepth = floor;
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

function subtractMaterials(target, subtractions) {
  Object.entries(subtractions).forEach(([name, quantity]) => {
    target[name] = Math.max(0, (target[name] || 0) - quantity);
  });
}

function createMaterialOverrideRandom(seedText) {
  let seed = 2166136261;
  for (let index = 0; index < seedText.length; index++) {
    seed ^= seedText.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

function getMaterialDelta(before, after) {
  return Object.fromEntries(
    Object.keys({ ...before, ...after })
      .map(name => [name, Math.max(0, (after[name] || 0) - (before[name] || 0))])
      .filter(([, quantity]) => quantity > 0)
  );
}

function getNewQuestRewards(beforeCompletedIds, quests) {
  const rewards = {};
  quests
    .filter(quest => quest.completed && !beforeCompletedIds.has(quest.id))
    .forEach(quest => addMaterials(rewards, quest.reward?.materials || {}));
  return rewards;
}

function thinMaterialQuantity(quantity, keepRate, rng) {
  let kept = 0;
  for (let unit = 0; unit < quantity; unit++) kept += Number(rng() < keepRate);
  return kept;
}

function transformCombatMaterialDrops(additions, floor, override, rng) {
  if (!override || override.shape === "baseline") return additions;
  let keepRate = override.scale;
  if (override.shape === "depth-slope") {
    const baselineExpected = getDepthMaterialExpectedQuantity(floor);
    const milestoneTier = Math.floor((Math.max(1, floor) - 1) / 5);
    const overriddenExpected =
      (1 + Math.max(0, floor - 1) * override.depthQuantityPerFloor) *
      (1 + milestoneTier * 0.08);
    keepRate = Math.min(1, overriddenExpected / baselineExpected);
  }
  return Object.fromEntries(
    Object.entries(additions)
      .map(([name, quantity]) => {
        if (override.shape === "probability") {
          return [name, rng() < keepRate ? quantity : 0];
        }
        return [name, thinMaterialQuantity(quantity, keepRate, rng)];
      })
      .filter(([, quantity]) => quantity > 0)
  );
}

function totalMaterials(materials) {
  return Object.values(materials).reduce((sum, quantity) => sum + quantity, 0);
}

function finishRun(state, outcome, metrics) {
  const healPotionCount = state.inventory.filter(item => item === "HEAL_POTION").length;
  if (healPotionCount !== state.simHealPotionSources.length) {
    throw new Error(
      `heal potion provenance mismatch: inventory=${healPotionCount}, ` +
      `sources=${state.simHealPotionSources.length}`
    );
  }
  const materialsBeforeFinalQuests = { ...state.currentRun.materials };
  updateRunQuests(
    state.currentRun,
    getCharAffixSum(state.party[0], "contractReward")
  );
  metrics.materialSources.quest += totalMaterials(
    getMaterialDelta(materialsBeforeFinalQuests, state.currentRun.materials)
  );

  const roleKills = {
    disruptor: metrics.coreObservations.disruptorKills,
    amplifier: metrics.coreObservations.amplifierKills
  };
  state.currentRun.quests
    .filter(quest => quest.type === "role_kill")
    .forEach(quest => {
      const kills = roleKills[quest.role] || 0;
      if (kills < quest.targetValue && kills * 2 >= quest.targetValue) {
        metrics.coreObservations.bountyBonusMaterials += totalMaterials(quest.reward.materials);
      }
    });

  const carriedMaterials = totalMaterials(state.currentRun.materials);
  metrics.materialSources.other = Math.max(
    0,
    carriedMaterials - totalMaterials(metrics.materialSources)
  );
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

  const finalCoreId = getEquippedCoreAffixes(state.party[0])
    .map(affix => affix.id || affix.type)
    .find(id => CORE_AFFIX_IDS.has(id)) || null;
  if (metrics.diagnostics) {
    metrics.diagnostics.finalBuild = createBuildSnapshot(
      state,
      metrics.scoringProfile,
      "finish"
    );
    metrics.diagnostics.deathLogs = structuredClone(state.currentRun.deathLogs || []);
  }
  return {
    survived: outcome === "retreat",
    died: outcome === "death",
    carriedMaterials,
    bankedMaterials: totalMaterials(banked),
    carriedMaterialCounts: { ...state.currentRun.materials },
    bankedMaterialCounts: { ...banked },
    timeCost: metrics.steps + COMBAT_TURN_WEIGHT * metrics.combatRounds,
    reachedFloor: state.currentRun.deepestFloor,
    stalemate: metrics.stalemate,
    finalLevel: state.party[0].level,
    elitePolicy: metrics.elitePolicy,
    eliteEncounters: metrics.eliteEncounters,
    eliteVictories: metrics.eliteVictories,
    eliteFlees: metrics.eliteFlees,
    eliteDeaths: metrics.eliteDeaths,
    eliteLevelsGained: metrics.eliteLevelsGained,
    eliteExpGained: metrics.eliteExpGained,
    eliteAvoidDetourSteps: metrics.eliteAvoidDetourSteps,
    eliteAvoidNoRouteFloors: metrics.eliteAvoidNoRouteFloors,
    equipmentUpgrades: metrics.equipmentUpgrades,
    earlyEquipmentUpgrades: metrics.earlyEquipmentUpgrades,
    deepEquipmentUpgrades: metrics.deepEquipmentUpgrades,
    equipmentFound: metrics.equipmentFound,
    earlyEquipmentFound: metrics.earlyEquipmentFound,
    deepEquipmentFound: metrics.deepEquipmentFound,
    identificationPowderAcquired: metrics.identificationPowderAcquired,
    identificationPowderAcquiredBySource: { ...metrics.identificationPowderAcquiredBySource },
    identificationPowderUsed: metrics.identificationPowderUsed,
    identificationCount: metrics.identificationCount,
    unidentifiedWearCount: metrics.unidentifiedWearCount,
    curseHitCount: metrics.curseHitCount,
    equipmentFoundBySource: metrics.equipmentFoundBySource,
    equipmentFoundByFloor: metrics.equipmentFoundByFloor,
    supportAffixFoundById: { ...metrics.supportAffixFoundById },
    rarityFound: metrics.rarityFound,
    supportCountDistribution: metrics.supportCountDistribution,
    supportCountByRarity: metrics.supportCountByRarity,
    rareCoreSupportCountDistribution: metrics.rareCoreSupportCountDistribution,
    epicCoreSupportCountDistribution: metrics.epicCoreSupportCountDistribution,
    totalSupportAffixesFound: metrics.totalSupportAffixesFound,
    cursedEquipmentFound: metrics.cursedEquipmentFound,
    coreEquipmentFound: metrics.coreEquipmentFound,
    coreEquipmentFoundById: metrics.coreEquipmentFoundById,
    coreEquipmentFoundBySource: metrics.coreEquipmentFoundBySource,
    coreEquipmentFoundByFloor: metrics.coreEquipmentFoundByFloor,
    coreEquipmentFoundByGroupAndFloor: {
      combat: [...metrics.coreEquipmentFoundByGroupAndFloor.combat],
      economy: [...metrics.coreEquipmentFoundByGroupAndFloor.economy]
    },
    coreEncounteredIds: [...metrics.coreEncounteredIds],
    coreEncounterFloors: [...metrics.coreEncounterFloors],
    coreEncounterSources: [...metrics.coreEncounterSources],
    coreEverEquippedIds: [...metrics.coreEverEquippedIds],
    coreFirstEncounterFloorByGroup: {
      ...metrics.coreFirstEncounterFloorByGroup
    },
    coreFirstEquippedFloorByGroup: {
      ...metrics.coreFirstEquippedFloorByGroup
    },
    coreDecisionReasons: Object.fromEntries(
      Object.entries(metrics.coreDecisionReasons)
        .map(([coreId, reasons]) => [coreId, [...reasons]])
    ),
    firstCoreDepth: metrics.firstCoreDepth,
    firstCoreEquippedFloor: metrics.firstCoreEquippedFloor,
    earlyCoreEquipped: metrics.firstCoreEquippedFloor !== null &&
      metrics.firstCoreEquippedFloor <= EARLY_BUILD_MAX_FLOOR,
    cursedCoreEquipmentFound: metrics.cursedCoreEquipmentFound,
    floorSupplyStats: metrics.floorSupplyStats,
    coreEquipped: Boolean(finalCoreId),
    finalCoreId,
    coreObservations: metrics.coreObservations,
    healPotionsUsed: metrics.healPotionsUsed,
    healPotionsAcquiredBySource: { ...metrics.healPotionsAcquiredBySource },
    healPotionsConsumedBySource: { ...metrics.healPotionsConsumedBySource },
    healPotionMerchantAttempts: metrics.healPotionMerchantAttempts,
    healPotionMerchantFailures: { ...metrics.healPotionMerchantFailures },
    combatDamageHp: metrics.combatDamageHp,
    combatDamageHpByType: { ...metrics.combatDamageHpByType },
    stairsHealingHp: metrics.stairsHealingHp,
    campHealingHp: metrics.campHealingHp,
    diosHealingHp: metrics.diosHealingHp + metrics.coreObservations.diosHealing,
    trapPolicy: state.simPolicy.trapPolicy,
    trapActivations: metrics.trapActivations,
    trapActivationsBySource: { ...metrics.trapActivationsBySource },
    trapActivationsByType: { ...metrics.trapActivationsByType },
    trapDamageHp: metrics.trapDamageHp,
    trapDamageHpBySource: { ...metrics.trapDamageHpBySource },
    trapDamageHpByType: { ...metrics.trapDamageHpByType },
    trapHealPotionsUsed: metrics.trapHealPotionsUsed,
    trapHealPotionShortages: metrics.trapHealPotionShortages,
    trapDisarms: metrics.trapDisarms,
    trapAvoided: metrics.trapAvoided,
    trapForced: metrics.trapForced,
    trapKitsAcquired: metrics.trapKitsAcquired,
    trapKitsUsed: metrics.trapKitsUsed,
    trapDetections: metrics.trapDetections,
    trapTeleports: metrics.trapTeleports,
    finalHealPotions: state.inventory.filter(item => item === "HEAL_POTION").length,
    statusCureItemsAcquired: metrics.statusCureItemsAcquired,
    statusCureItemsUsed: metrics.statusCureItemsUsed,
    finalStatusCureInventory: countInventoryItems(state.inventory),
    statusCureDecisions: metrics.statusCureDecisions,
    statusCureDecisionContexts: metrics.statusCureDecisionContexts,
    statusCureUnavailableStatuses: metrics.statusCureUnavailableStatuses,
    statusCureHeldNotUsedStatuses: metrics.statusCureHeldNotUsedStatuses,
    statusesCured: metrics.statusesCured,
    statusCureMerchantFailures: metrics.statusCureMerchantFailures,
    townPortalsUsed: metrics.townPortalsUsed,
    portalUseEvents: metrics.portalUseEvents,
    portalUsesBySource: metrics.portalUsesBySource,
    portalAcquisitions: metrics.portalAcquisitions,
    merchantWingAttempts: metrics.merchantWingAttempts,
    merchantWingsPurchased: metrics.merchantWingsPurchased,
    merchantPurchaseFloors: metrics.merchantPurchaseFloors,
    merchantWingFailures: metrics.merchantWingFailures,
    milestoneDecisions: metrics.milestoneDecisions,
    outcome,
    fleeCount: metrics.fleeCount,
    bossPolicy: metrics.bossPolicy,
    specialCellsDetected: metrics.specialCellsDetected,
    specialRouteFloors: metrics.specialRouteFloors,
    specialBattles: metrics.specialBattles,
    deathEncounterType: metrics.deathEncounterType,
    dragonKeysAcquired: metrics.dragonKeysAcquired,
    dragonKeyUses: metrics.dragonKeyUses,
    normalCombatTelemetry: metrics.normalCombatTelemetry,
    materialSources: metrics.materialSources,
    combatMaterialEvents: metrics.combatMaterialEvents,
    combatMaterialHitEvents: metrics.combatMaterialHitEvents,
    diagnostics: metrics.diagnostics
  };
}

function descendToNextFloor(state, nextFloor, metrics = null, { stairsHeal = false } = {}) {
  state.floor = nextFloor;
  state.currentRun.deepestFloor = Math.max(state.currentRun.deepestFloor, nextFloor);
  state.currentRun.floorsVisited.push(nextFloor);
  updateRunQuests(
    state.currentRun,
    getCharAffixSum(state.party[0], "contractReward")
  );
  if (stairsHeal) applySimulatedStairsHeal(state.party[0], metrics);
  applyFloorTransitionHeal(state.party[0]);
}

export function simulateRun({
  className,
  startFloor,
  targetDepth,
  runIndex,
  seriesId,
  scoringProfile,
  scenario,
  workshop = { ranks: {} },
  supplyOverride = null,
  collectDiagnostics = false
}) {
  const runSeed = `${SIM_SEED}:${seriesId}:${className}:${runIndex}`;
  let state = createSimulationState(className, startFloor, runSeed, scenario, workshop);
  const materialOverrideRandom = createMaterialOverrideRandom(
    `${runSeed}:${scenario.materialDropOverride?.id || "baseline"}`
  );
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
    identificationPowderAcquired: Object.values(
      state.simIdentificationPowderAcquired || {}
    ).reduce((sum, amount) => sum + amount, 0),
    identificationPowderAcquiredBySource: {
      starting: state.simIdentificationPowderAcquired?.starting || 0,
      workshop: state.simIdentificationPowderAcquired?.workshop || 0,
      departureKit: state.simIdentificationPowderAcquired?.departureKit || 0,
      chest: 0,
      codex: 0
    },
    identificationPowderUsed: 0,
    identificationCount: 0,
    unidentifiedWearCount: 0,
    curseHitCount: 0,
    equipmentFoundBySource: { combat: 0, chest: 0, other: 0 },
    equipmentFoundByFloor: Array(21).fill(0),
    supportAffixFoundById: {},
    rarityFound: { magic: 0, rare: 0, epic: 0, other: 0 },
    supportCountDistribution: createSupportCountDistribution(),
    supportCountByRarity: {
      magic: createSupportCountDistribution(),
      rare: createSupportCountDistribution(),
      epic: createSupportCountDistribution(),
      other: createSupportCountDistribution()
    },
    rareCoreSupportCountDistribution: createSupportCountDistribution(),
    epicCoreSupportCountDistribution: createSupportCountDistribution(),
    totalSupportAffixesFound: 0,
    cursedEquipmentFound: 0,
    coreEquipmentFound: 0,
    coreEquipmentFoundById: {},
    coreEquipmentFoundBySource: { combat: 0, chest: 0, other: 0 },
    coreEquipmentFoundByFloor: Array(21).fill(0),
    coreEquipmentFoundByGroupAndFloor: {
      combat: Array(21).fill(0),
      economy: Array(21).fill(0)
    },
    coreEquipmentInstanceIds: new Set(),
    coreEncounteredIds: new Set(),
    coreEncounterFloors: new Set(),
    coreEncounterSources: new Set(),
    coreEverEquippedIds: new Set(),
    coreFirstEncounterFloorByGroup: {
      combat: null,
      economy: null
    },
    coreFirstEquippedFloorByGroup: {
      combat: null,
      economy: null
    },
    coreDecisionReasons: {},
    coreObservations: createCoreObservations(),
    firstCoreDepth: null,
    firstCoreEquippedFloor: null,
    cursedCoreEquipmentFound: 0,
    floorSupplyStats: createFloorSupplyStats(),
    healPotionsUsed: 0,
    stairsHealingHp: 0,
    campHealingHp: 0,
    diosHealingHp: 0,
    healPotionsAcquiredBySource: {
      starting: INITIAL_HEAL_POTIONS,
      chest: 0,
      merchant: 0,
      other: 0
    },
    healPotionsConsumedBySource: {
      starting: 0,
      chest: 0,
      merchant: 0,
      other: 0
    },
    trapActivations: 0,
    trapActivationsBySource: { chest: 0, floor: 0 },
    trapActivationsByType: {},
    trapDamageHp: 0,
    trapDamageHpBySource: { chest: 0, floor: 0 },
    trapDamageHpByType: {},
    trapHealPotionsUsed: 0,
    trapHealPotionShortages: 0,
    trapDisarms: 0,
    trapAvoided: 0,
    trapForced: 0,
    trapKitsAcquired: 0,
    trapKitsUsed: 0,
    trapDetections: 0,
    trapTeleports: 0,
    combatDamageHp: 0,
    combatDamageHpByType: {},
    statusCureItemsAcquired: {
      initial: countInventoryItems(state.inventory),
      chest: {},
      combat: {},
      merchant: {}
    },
    statusCureItemsUsed: {},
    statusCureDecisions: {
      selected: 0,
      unavailable: 0,
      "policy-deferred": 0,
      incapacitated: 0
    },
    statusCureDecisionContexts: {},
    statusCureUnavailableStatuses: {},
    statusCureHeldNotUsedStatuses: {},
    statusesCured: {},
    statusCureMerchantFailures: {},
    healPotionMerchantAttempts: 0,
    healPotionMerchantFailures: {},
    townPortalsUsed: 0,
    portalUseEvents: [],
    portalUsesBySource: {},
    portalAcquisitions: {
      workshop: state.simPortalSources.filter(source => source === "workshop").length,
      workshopSupply: state.simPortalSources.filter(source => source === "workshop-supply").length,
      departureKit: state.simPortalSources.filter(source => source === "departure-kit").length,
      chest: 0,
      merchant: 0
    },
    merchantWingAttempts: 0,
    merchantWingsPurchased: 0,
    merchantPurchaseFloors: [],
    merchantWingFailures: {},
    milestoneDecisions: [],
    fleeCount: 0,
    elitePolicy: state.simPolicy.elitePolicy,
    eliteEncounters: 0,
    eliteVictories: 0,
    eliteFlees: 0,
    eliteDeaths: 0,
    eliteLevelsGained: 0,
    eliteExpGained: 0,
    eliteAvoidDetourSteps: 0,
    eliteAvoidNoRouteFloors: 0,
    bossPolicy: scenario.bossPolicy || "engage",
    collectSpecialBattles: collectDiagnostics,
    specialCellsDetected: { boss: 0, midboss: 0 },
    specialRouteFloors: [],
    specialBattles: [],
    deathEncounterType: null,
    dragonKeysAcquired: 0,
    dragonKeyUses: 0,
    normalCombatTelemetry: {
      encounters: 0,
      incomingHits: 0,
      incomingDamage: 0,
      maxIncomingHit: 0,
      heavyHitCount: 0
    },
    materialSources: {
      chest: 0,
      combat: 0,
      quest: 0
    },
    combatMaterialEvents: 0,
    combatMaterialHitEvents: 0,
    scoringProfile,
    diagnostics: collectDiagnostics
      ? {
          buildSnapshots: [],
          encounters: [],
          deathLogs: [],
          finalBuild: null
        }
      : null
  };

  // 目標階へ到着した時点で撤退するため、探索するのはtargetDepthの1階手前まで。
  for (let floor = startFloor; floor < targetDepth; floor++) {
    state.floor = floor;
    if (metrics.diagnostics) {
      metrics.diagnostics.buildSnapshots.push(
        createBuildSnapshot(state, scoringProfile, "floor-start")
      );
    }
    const generated = generateRunFloor({ runSeed, floor });
    const routePlan = createFloorRoutePlan(generated, floor, metrics.bossPolicy);
    const elitePlan = createEliteRoutePlan(
      generated,
      floor,
      runSeed,
      state.simPolicy.elitePolicy
    );
    const floorSteps = routePlan.floorSteps + elitePlan.extraSteps;
    metrics.eliteAvoidDetourSteps += state.simPolicy.elitePolicy === "avoid"
      ? elitePlan.extraSteps
      : 0;
    metrics.eliteAvoidNoRouteFloors += Number(
      state.simPolicy.elitePolicy === "avoid" && elitePlan.avoidNoRoute
    );
    const specialSchedule = new Map();
    routePlan.routeEvents.forEach(event => {
      const step = Math.min(
        floorSteps,
        Math.max(1, Math.ceil(event.routeDistance * EXPLORATION_FACTOR))
      );
      if (!specialSchedule.has(step)) specialSchedule.set(step, []);
      specialSchedule.get(step).push(event);
    });
    if (elitePlan.elite) {
      state.roamingMonsters.push(elitePlan.elite);
    }
    if (elitePlan.elite && elitePlan.encounterStep !== null) {
      const step = Math.min(floorSteps, elitePlan.encounterStep);
      if (!specialSchedule.has(step)) specialSchedule.set(step, []);
      specialSchedule.get(step).push({
        ...elitePlan.elite,
        type: "elite",
        roamingMonster: elitePlan.elite,
        retreatCoord: findFloorCell(generated.grid, cell => cell.type === "stairs-up")
      });
    }
    state.map = generated.grid;
    const floorStart = findFloorCell(generated.grid, cell => cell.type === "stairs-up");
    if (floorStart) {
      state.x = floorStart.x;
      state.y = floorStart.y;
    }
    metrics.specialCellsDetected.boss += routePlan.specialCells.filter(
      cell => cell.type === EVENT_TYPES.BOSS
    ).length;
    metrics.specialCellsDetected.midboss += routePlan.specialCells.filter(
      cell => cell.type === "midboss"
    ).length;
    metrics.specialRouteFloors.push({
      floor,
      policy: metrics.bossPolicy,
      floorSteps,
      routeDistance: Math.max(0, routePlan.path.length - 1),
      detectedBosses: routePlan.specialCells.filter(
        cell => cell.type === EVENT_TYPES.BOSS
      ).length,
      detectedMidbosses: routePlan.specialCells.filter(
        cell => cell.type === "midboss"
      ).length,
      avoidedPathExists: routePlan.avoidedPathExists,
      milestoneForced: routePlan.milestoneForced
    });
    const chestSchedule = schedulePickedUpChests(countFloorChests(generated.grid), floorSteps);
    const floorTrapSchedule = scheduleFloorTraps(generated, routePlan, floorSteps);
    metrics.coreObservations.pickedChestsByFloor[floor] +=
      [...chestSchedule.values()].reduce((sum, count) => sum + count, 0);
    let floorEndedByPitfall = false;

    stepLoop: for (let step = 1; step <= floorSteps; step++) {
      metrics.steps++;
      state.currentRun.steps++;
      state.currentRun.floorSteps[String(floor)] =
        (state.currentRun.floorSteps[String(floor)] || 0) + 1;

      const scheduledFloorTraps = floorTrapSchedule.get(step) || [];
      for (const scheduledTrap of scheduledFloorTraps) {
        const trapResult = resolveFloorTrapAtPath(
          state,
          generated,
          floor,
          scheduledTrap,
          metrics
        );
        if (!isAlive(state.party[0])) {
          metrics.deathEncounterType = "floor-trap";
          return finishRun(state, "death", metrics);
        }
        if (trapResult.pitfallTriggered) {
          floorEndedByPitfall = true;
          break;
        }
      }
      if (floorEndedByPitfall) break stepLoop;

      const pickedUpChests = chestSchedule.get(step) || 0;
      for (let chest = 0; chest < pickedUpChests; chest++) {
        const tombRaider = getCharCoreParams(state.party[0], "CORE_TOMB_RAIDER");
        const chestMaterials = generateChestMaterials(
          floor,
          Math.random,
          tombRaider?.materialBonus || 0
        );
        addMaterials(state.currentRun.materials, chestMaterials);
        metrics.materialSources.chest += totalMaterials(chestMaterials);
        const chestItems = rollChestItems(
          state,
          floor,
          Math.random,
          metrics.coreObservations,
          scenario,
          supplyOverride,
          metrics
        );
        const cureCountsBeforeChest = countInventoryItems(state.inventory);
        const acquiredEquipment = [];
        chestItems.items.forEach((item, itemIndex) => {
          if (
            chestItems.mainItemLost &&
            itemIndex === 0 &&
            item === chestItems.mainItem
          ) return;
          if (item === "TOWN_PORTAL" && scenario.discardChestTownPortal) return;
          if (!addInventoryItemToState(state, item)) return;
          if (item === "HEAL_POTION") {
            recordHealPotionAcquisition(state, metrics, "chest");
          }
          if (item === "TRAP_KIT") metrics.trapKitsAcquired++;
          if (item === "TOWN_PORTAL") {
            state.simPortalSources.push("chest");
            metrics.portalAcquisitions.chest++;
          }
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
        recordStatusCureAcquisitions(
          metrics,
          cureCountsBeforeChest,
          countInventoryItems(state.inventory),
          "chest"
        );
        recordEquipmentAcquisitions(metrics, acquiredEquipment, floor, "chest");
        state.currentRun.chestsOpened++;
        recordEquipmentUpgrades(
          metrics,
          equipGreedyUpgrades(state, metrics, scoringProfile),
          floor
        );
      }
      if (!isAlive(state.party[0])) {
        metrics.deathEncounterType = "chest-trap";
        return finishRun(state, "death", metrics);
      }

      const scheduledSpecials = specialSchedule.get(step) || [];
      const hasRandomEncounter =
        scheduledSpecials.length === 0 && Math.random() < getEncounterChance(step);
      if (scheduledSpecials.length === 0 && !hasRandomEncounter) continue;
      const encountersThisStep = scheduledSpecials.length > 0
        ? scheduledSpecials
        : [null];

      for (const specialEvent of encountersThisStep) {
        const isBoss = specialEvent?.type === EVENT_TYPES.BOSS;
        const isMidboss = specialEvent?.type === "midboss";
        const isElite = specialEvent?.type === "elite";
        const encounterType = isBoss
          ? "boss"
          : (isMidboss ? "midboss" : (isElite ? "elite" : "normal"));
        const specialBattle = specialEvent && metrics.collectSpecialBattles
          ? {
              type: encounterType,
              floor,
              milestone: Boolean(specialEvent.milestone),
              policy: metrics.bossPolicy,
              attempts: [],
              firstBuild: null,
              finalResult: null
            }
          : null;

        if (isBoss && !specialEvent.milestone) {
          if (!state.inventory.includes("DRAGON_KEY")) {
            specialBattle.finalResult = "blocked-no-key";
            metrics.specialBattles.push(specialBattle);
            continue;
          }
          // movement.jsは所持確認と使用logのみで、鍵をinventoryから消費しない。
          metrics.dragonKeyUses++;
        }

        for (let attempt = 1; ; attempt++) {
          state.currentRun.battles++;
          const equipmentFoundBeforeRewards = state.currentRun.equipmentFound.length;
          const materialsBeforeRewards = { ...state.currentRun.materials };
          const completedQuestIds = new Set(
            state.currentRun.quests.filter(quest => quest.completed).map(quest => quest.id)
          );
          const cureCountsBeforeCombat = countInventoryItems(state.inventory);
          const cureItemsUsedBeforeCombat = { ...metrics.statusCureItemsUsed };
          const levelBeforeCombat = state.party[0].level;
          const expBeforeCombat = state.party[0].exp;
          const combatResult = runEncounter(
            state,
            metrics.coreObservations,
            metrics.diagnostics,
            metrics,
            {
              isBoss,
              isMidboss,
              isElite,
              roamingMonster: specialEvent?.roamingMonster || null,
              encounterCoord: specialEvent,
              retreatCoord: specialEvent?.retreatCoord || null
            }
          );
          state = combatResult.state;
          metrics.combatRounds += combatResult.rounds;
          metrics.healPotionsUsed += combatResult.healPotionsUsed;
          metrics.combatDamageHp += combatResult.telemetry.incomingDamage;
          metrics.combatDamageHpByType[combatResult.telemetry.type] =
            (metrics.combatDamageHpByType[combatResult.telemetry.type] || 0) +
            combatResult.telemetry.incomingDamage;
          metrics.eliteEncounters += Number(isElite);

          if (specialBattle) {
            specialBattle.firstBuild ||= combatResult.startBuild;
            specialBattle.attempts.push({
              attempt,
              result: combatResult.result,
              rounds: combatResult.rounds,
              telemetry: combatResult.telemetry
            });
          } else if (!isElite) {
            metrics.normalCombatTelemetry.encounters++;
            metrics.normalCombatTelemetry.incomingHits +=
              combatResult.telemetry.incomingHits;
            metrics.normalCombatTelemetry.incomingDamage +=
              combatResult.telemetry.incomingDamage;
            metrics.normalCombatTelemetry.maxIncomingHit = Math.max(
              metrics.normalCombatTelemetry.maxIncomingHit,
              combatResult.telemetry.maxIncomingHit
            );
            metrics.normalCombatTelemetry.heavyHitCount += Number(
              combatResult.telemetry.maxIncomingHitRate >= 0.5
            );
          }

          if (combatResult.result === "flee") {
            metrics.fleeCount++;
            metrics.eliteFlees += Number(isElite);
            applyPostCombatRecovery(state.party[0], metrics);
            metrics.healPotionsUsed += Number(useHealPotionIfNeeded(state, metrics));
            useStatusCureIfNeeded(state, metrics, "post-flee");
            if (!isAlive(state.party[0])) {
              metrics.deathEncounterType = encounterType;
              if (specialBattle) {
                specialBattle.finalResult = "death";
                metrics.specialBattles.push(specialBattle);
              }
              return finishRun(state, "death", metrics);
            }
            if (useTownPortalIfNeeded(state, scenario, metrics, "post-flee")) {
              if (specialBattle) {
                specialBattle.finalResult = "flee-retreat";
                metrics.specialBattles.push(specialBattle);
              }
              return finishRun(state, "retreat", metrics);
            }
            if (specialEvent && !isElite) {
              // 逃走ではeventセルが消えない。1マス後退後、同じセルへ再侵入する。
              continue;
            }
            continue stepLoop;
          }

          if (combatResult.result !== "victory") {
            metrics.stalemate = combatResult.result === "stalemate";
            metrics.deathEncounterType = encounterType;
            metrics.eliteDeaths += Number(isElite);
            if (specialBattle) {
              specialBattle.finalResult = combatResult.result;
              metrics.specialBattles.push(specialBattle);
            }
            return finishRun(state, "death", metrics);
          }

          if (isElite) {
            metrics.eliteVictories++;
            metrics.eliteLevelsGained += state.party[0].level - levelBeforeCombat;
            metrics.eliteExpGained += state.party[0].exp - expBeforeCombat;
          }

          if (specialEvent && !isElite) {
            const keyCountBefore = state.inventory.filter(
              item => (typeof item === "object" ? item.baseId : item) === "DRAGON_KEY"
            ).length;
            applyPendingOutcomeRewards(
              state,
              isBoss
                ? { kind: "milestoneVictory", floor }
                : { kind: "giveKey" },
              Math.random
            );
            const keyCountAfter = state.inventory.filter(
              item => (typeof item === "object" ? item.baseId : item) === "DRAGON_KEY"
            ).length;
            metrics.dragonKeysAcquired += Math.max(0, keyCountAfter - keyCountBefore);
          }

          recordStatusCureAcquisitions(
            metrics,
            cureCountsBeforeCombat,
            countInventoryItems(state.inventory),
            "combat",
            cureItemsUsedBeforeCombat
          );

          const scholarMaterialBonus = getScholarMaterialBonus(state.combatState.monsters, state);
          metrics.coreObservations.scholarMaterialBonusByFloor[floor] += scholarMaterialBonus;
          state.combatState.monsters.forEach(monster => {
            if (monster.fled || monster.hasSplit) return;
            if (monster.role === "disruptor") metrics.coreObservations.disruptorKills++;
            if (monster.role === "amplifier") metrics.coreObservations.amplifierKills++;
          });
          const totalRewardDelta = getMaterialDelta(
            materialsBeforeRewards,
            state.currentRun.materials
          );
          const questRewards = getNewQuestRewards(completedQuestIds, state.currentRun.quests);
          const combatDropDelta = { ...totalRewardDelta };
          subtractMaterials(combatDropDelta, questRewards);
          let transformedDrops = combatDropDelta;
          if (scenario.materialDropOverride) {
            transformedDrops = transformCombatMaterialDrops(
              combatDropDelta,
              floor,
              scenario.materialDropOverride,
              materialOverrideRandom
            );
            state.currentRun.materials = { ...materialsBeforeRewards };
            addMaterials(state.currentRun.materials, questRewards);
            addMaterials(state.currentRun.materials, transformedDrops);
          }
          metrics.materialSources.combat += totalMaterials(transformedDrops);
          metrics.materialSources.quest += totalMaterials(questRewards);
          metrics.combatMaterialEvents++;
          metrics.combatMaterialHitEvents += Number(totalMaterials(transformedDrops) > 0);
          const baselineCombatEquipment = state.currentRun.equipmentFound
            .slice(equipmentFoundBeforeRewards);
          const overriddenCombatEquipment = baselineCombatEquipment.map(item => {
            const replacement = rerollSupplyEquipment(
              item,
              state,
              floor,
              "combat",
              supplyOverride,
              Math.random
            );
            if (replacement === item) return item;
            const inventoryIndex = state.inventory.findIndex(candidate =>
              candidate === item ||
              (
                candidate?.instanceId &&
                item?.instanceId &&
                candidate.instanceId === item.instanceId
              )
            );
            if (inventoryIndex >= 0) state.inventory[inventoryIndex] = replacement;
            return replacement;
          });
          const extraCombatEquipment = generateExtraSupplyEquipment(
            state,
            floor,
            "combat",
            supplyOverride,
            Math.random
          );
          if (extraCombatEquipment && addInventoryItemToState(state, extraCombatEquipment)) {
            overriddenCombatEquipment.push(extraCombatEquipment);
          }
          state.currentRun.equipmentFound.splice(
            equipmentFoundBeforeRewards,
            state.currentRun.equipmentFound.length - equipmentFoundBeforeRewards,
            ...overriddenCombatEquipment
          );
          recordEquipmentAcquisitions(
            metrics,
            overriddenCombatEquipment,
            floor,
            "combat"
          );
          recordEquipmentUpgrades(
            metrics,
            equipGreedyUpgrades(state, metrics, scoringProfile),
            floor
          );
          applyPostCombatRecovery(state.party[0], metrics);
          metrics.healPotionsUsed += Number(useHealPotionIfNeeded(state, metrics));
          useStatusCureIfNeeded(state, metrics, "post-combat");
          if (!isAlive(state.party[0])) {
            metrics.deathEncounterType = encounterType;
            if (specialBattle) {
              specialBattle.finalResult = "death";
              metrics.specialBattles.push(specialBattle);
            }
            return finishRun(state, "death", metrics);
          }
          if (specialBattle) {
            specialBattle.finalResult = "victory";
            metrics.specialBattles.push(specialBattle);
          }
          if (useTownPortalIfNeeded(state, scenario, metrics, "post-combat")) {
            return finishRun(state, "retreat", metrics);
          }
          break;
        }
      }
    }

    if (floorEndedByPitfall) {
      continue;
    }

    applySimulatedCampRest(state, metrics.coreObservations, metrics);
    maybePurchaseMerchantWing(state, scenario, metrics);
    maybePurchaseMerchantStatusCures(state, metrics);
    maybePurchaseMerchantHealPotion(state, metrics);
    if (isMilestoneFloor(floor)) {
      metrics.milestoneDecisions.push({
        floor,
        hasTownPortal: state.inventory.includes("TOWN_PORTAL"),
        hpRate: state.party[0].hp / Math.max(1, getCharMaxHp(state.party[0])),
        carriedMaterials: totalMaterials(state.currentRun.materials)
      });
      if (
        scenario.retreatAtMilestoneWithoutTownPortal &&
        !state.inventory.includes("TOWN_PORTAL")
      ) {
        return finishRun(state, "retreat", metrics);
      }
    }
    descendToNextFloor(state, floor + 1, metrics, { stairsHeal: true });
    if (useTownPortalIfNeeded(state, scenario, metrics, "floor-transition")) {
      return finishRun(state, "retreat", metrics);
    }
  }

  return finishRun(state, "retreat", metrics);
}

function getUnequippedCoreReason(result, coreId) {
  if (result.coreEverEquippedIds.includes(coreId)) return "後続装備に置換";
  const reasons = result.coreDecisionReasons[coreId] || [];
  if (reasons.includes("class-incompatible")) return "職業制限";
  if (reasons.includes("economy-below-95pct")) return "戦闘スコア95%未満";
  if (reasons.includes("economy-ev-not-higher")) return "探索EV込みスコア不足";
  if (reasons.includes("combat-score-not-higher")) return "期待戦闘スコア不足";
  if (reasons.includes("unidentified-held")) return "粉不足で未鑑定保持";
  if (reasons.includes("current-curse-locked")) return "呪い装備を交換不能";
  if (reasons.includes("economy-core-retained")) return "装備済みeconomy coreを保持";
  return "生スコア不足";
}

function simulateCase({
  startFloor,
  targetDepth,
  label,
  seriesId,
  scoringProfile,
  scenario,
  identificationPolicy = "legacy"
}) {
  const totals = {
    survived: 0,
    died: 0,
    carriedMaterials: 0,
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
    identificationPowderAcquired: 0,
    identificationPowderAcquiredBySource: {
      starting: 0,
      workshop: 0,
      departureKit: 0,
      chest: 0,
      codex: 0
    },
    identificationPowderUsed: 0,
    identificationCount: 0,
    unidentifiedWearCount: 0,
    curseHitCount: 0,
    coreEquipmentFound: 0,
    runsWithCoreEncounter: 0,
    runsWithEarlyCoreEncounter: 0,
    runsWithCoreEquipped: 0,
    runsWithCombatCoreEncounter: 0,
    runsWithEconomyCoreEncounter: 0,
    runsWithCombatCoreEquipped: 0,
    runsWithEconomyCoreEquipped: 0,
    coreEncounterRunsById: {},
    coreEquippedRunsById: {},
    unequippedCoreReasonsById: {},
    firstCoreDepthCounts: {},
    coreObservations: createCoreObservations(),
    healPotionsUsed: 0,
    trap: createTrapAggregate(),
    townPortalsUsed: 0,
    runsUsingTownPortal: 0,
    fleeCount: 0,
    runsWithFlee: 0,
    eliteEncounters: 0,
    eliteVictories: 0,
    eliteFlees: 0,
    eliteDeaths: 0,
    eliteLevelsGained: 0,
    eliteExpGained: 0,
    eliteAvoidDetourSteps: 0,
    eliteAvoidNoRouteFloors: 0
  };
  const classTrapTotals = Object.fromEntries(
    SIM_CLASSES.map(className => [className, createTrapAggregate()])
  );

  for (let runIndex = 0; runIndex < RUNS_PER_CASE; runIndex++) {
    const className = SIM_CLASSES[runIndex % SIM_CLASSES.length];
    const result = simulateRun({
      className,
      startFloor,
      targetDepth,
      runIndex,
      seriesId,
      scoringProfile,
      scenario: {
        ...scenario,
        identificationPolicy: identificationPolicy.id || identificationPolicy
      }
    });
    addTrapAggregate(totals.trap, result);
    addTrapAggregate(classTrapTotals[className], result);
    totals.survived += Number(result.survived);
    totals.died += Number(result.died);
    totals.carriedMaterials += result.carriedMaterials;
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
    totals.identificationPowderAcquired += result.identificationPowderAcquired;
    Object.entries(result.identificationPowderAcquiredBySource).forEach(([source, amount]) => {
      totals.identificationPowderAcquiredBySource[source] =
        (totals.identificationPowderAcquiredBySource[source] || 0) + amount;
    });
    totals.identificationPowderUsed += result.identificationPowderUsed;
    totals.identificationCount += result.identificationCount;
    totals.unidentifiedWearCount += result.unidentifiedWearCount;
    totals.curseHitCount += result.curseHitCount;
    totals.coreEquipmentFound += result.coreEquipmentFound;
    totals.runsWithCoreEncounter += Number(result.firstCoreDepth !== null);
    totals.runsWithEarlyCoreEncounter += Number(
      result.firstCoreDepth !== null && result.firstCoreDepth <= EARLY_BUILD_MAX_FLOOR
    );
    totals.runsWithCoreEquipped += Number(result.coreEquipped);
    const encounteredCombat = result.coreEncounteredIds.some(id => COMBAT_CORE_IDS.has(id));
    const encounteredEconomy = result.coreEncounteredIds.some(id => ECONOMY_CORE_IDS.has(id));
    totals.runsWithCombatCoreEncounter += Number(encounteredCombat);
    totals.runsWithEconomyCoreEncounter += Number(encounteredEconomy);
    totals.runsWithCombatCoreEquipped += Number(COMBAT_CORE_IDS.has(result.finalCoreId));
    totals.runsWithEconomyCoreEquipped += Number(ECONOMY_CORE_IDS.has(result.finalCoreId));
    if (result.finalCoreId && !result.coreEncounteredIds.includes(result.finalCoreId)) {
      throw new Error(
        `final core missing from encounter metrics: ${seriesId}/${runIndex}/${result.finalCoreId}; ` +
        `encountered=${result.coreEncounteredIds.join(",")}; ` +
        `everEquipped=${result.coreEverEquippedIds.join(",")}; ` +
        `found=${JSON.stringify(result.coreEquipmentFoundById)}`
      );
    }
    result.coreEncounteredIds.forEach(coreId => {
      totals.coreEncounterRunsById[coreId] = (totals.coreEncounterRunsById[coreId] || 0) + 1;
      if (result.finalCoreId === coreId) return;
      const reason = getUnequippedCoreReason(result, coreId);
      if (!totals.unequippedCoreReasonsById[coreId]) {
        totals.unequippedCoreReasonsById[coreId] = {};
      }
      totals.unequippedCoreReasonsById[coreId][reason] =
        (totals.unequippedCoreReasonsById[coreId][reason] || 0) + 1;
    });
    if (result.finalCoreId) {
      totals.coreEquippedRunsById[result.finalCoreId] =
        (totals.coreEquippedRunsById[result.finalCoreId] || 0) + 1;
    }
    addCoreObservations(totals.coreObservations, result.coreObservations);
    const firstCoreDepthKey = result.firstCoreDepth === null ? "none" : String(result.firstCoreDepth);
    totals.firstCoreDepthCounts[firstCoreDepthKey] =
      (totals.firstCoreDepthCounts[firstCoreDepthKey] || 0) + 1;
    totals.healPotionsUsed += result.healPotionsUsed;
    totals.townPortalsUsed += result.townPortalsUsed;
    totals.runsUsingTownPortal += Number(result.townPortalsUsed > 0);
    totals.fleeCount += result.fleeCount;
    totals.runsWithFlee += Number(result.fleeCount > 0);
    totals.eliteEncounters += result.eliteEncounters;
    totals.eliteVictories += result.eliteVictories;
    totals.eliteFlees += result.eliteFlees;
    totals.eliteDeaths += result.eliteDeaths;
    totals.eliteLevelsGained += result.eliteLevelsGained;
    totals.eliteExpGained += result.eliteExpGained;
    totals.eliteAvoidDetourSteps += result.eliteAvoidDetourSteps;
    totals.eliteAvoidNoRouteFloors += result.eliteAvoidNoRouteFloors;
  }

  const bankedMaterialEv = totals.bankedMaterials / RUNS_PER_CASE;
  const averageTimeCost = totals.timeCost / RUNS_PER_CASE;
  return {
    label,
    startFloor,
    targetDepth,
    trapPolicy: scenario.trapPolicy || DEFAULT_TRAP_POLICY_ID,
    survivalRate: totals.survived / RUNS_PER_CASE,
    deathRate: totals.died / RUNS_PER_CASE,
    townPortalUseRate: totals.runsUsingTownPortal / RUNS_PER_CASE,
    bankRetentionRate: totals.carriedMaterials > 0
      ? totals.bankedMaterials / totals.carriedMaterials
      : 1,
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
    averageIdentificationPowderAcquired:
      totals.identificationPowderAcquired / RUNS_PER_CASE,
    averageIdentificationPowderAcquiredBySource: Object.fromEntries(
      Object.entries(totals.identificationPowderAcquiredBySource).map(([source, amount]) => [
        source,
        amount / RUNS_PER_CASE
      ])
    ),
    averageIdentificationPowderUsed: totals.identificationPowderUsed / RUNS_PER_CASE,
    averageIdentificationCount: totals.identificationCount / RUNS_PER_CASE,
    averageUnidentifiedWearCount: totals.unidentifiedWearCount / RUNS_PER_CASE,
    averageCurseHitCount: totals.curseHitCount / RUNS_PER_CASE,
    coreEquipmentShare: totals.equipmentFound > 0
      ? totals.coreEquipmentFound / totals.equipmentFound
      : 0,
    coreEncounterRate: totals.runsWithCoreEncounter / RUNS_PER_CASE,
    earlyCoreEncounterRate: totals.runsWithEarlyCoreEncounter / RUNS_PER_CASE,
    coreEquippedRate: totals.runsWithCoreEquipped / RUNS_PER_CASE,
    coreRetentionRate: totals.runsWithCoreEncounter > 0
      ? totals.runsWithCoreEquipped / totals.runsWithCoreEncounter
      : 0,
    combatCoreEncounterRate: totals.runsWithCombatCoreEncounter / RUNS_PER_CASE,
    economyCoreEncounterRate: totals.runsWithEconomyCoreEncounter / RUNS_PER_CASE,
    combatCoreEquippedRate: totals.runsWithCombatCoreEquipped / RUNS_PER_CASE,
    economyCoreEquippedRate: totals.runsWithEconomyCoreEquipped / RUNS_PER_CASE,
    combatCoreRetentionRate: totals.runsWithCombatCoreEncounter > 0
      ? totals.runsWithCombatCoreEquipped / totals.runsWithCombatCoreEncounter
      : 0,
    economyCoreRetentionRate: totals.runsWithEconomyCoreEncounter > 0
      ? totals.runsWithEconomyCoreEquipped / totals.runsWithEconomyCoreEncounter
      : 0,
    coreEncounterRunsById: totals.coreEncounterRunsById,
    coreEquippedRunsById: totals.coreEquippedRunsById,
    unequippedCoreReasonsById: totals.unequippedCoreReasonsById,
    coreObservations: totals.coreObservations,
    firstCoreDepthCounts: totals.firstCoreDepthCounts,
    averageHealPotionsUsed: totals.healPotionsUsed / RUNS_PER_CASE,
    ...finalizeTrapAggregate(totals.trap),
    trapMetricsByClass: Object.fromEntries(
      Object.entries(classTrapTotals).map(([className, aggregate]) => [
        className,
        finalizeTrapAggregate(aggregate)
      ])
    ),
    averageTownPortalsUsed: totals.townPortalsUsed / RUNS_PER_CASE,
    averageFleeCount: totals.fleeCount / RUNS_PER_CASE,
    runsWithFleeRate: totals.runsWithFlee / RUNS_PER_CASE,
    elitePolicy: scenario.elitePolicy || DEFAULT_ELITE_POLICY,
    averageEliteEncounters: totals.eliteEncounters / RUNS_PER_CASE,
    eliteVictoryRate: totals.eliteEncounters > 0
      ? totals.eliteVictories / totals.eliteEncounters
      : 0,
    eliteFleeRate: totals.eliteEncounters > 0 ? totals.eliteFlees / totals.eliteEncounters : 0,
    eliteDeathRate: totals.eliteEncounters > 0 ? totals.eliteDeaths / totals.eliteEncounters : 0,
    averageLevelsPerEliteVictory: totals.eliteVictories > 0
      ? totals.eliteLevelsGained / totals.eliteVictories
      : 0,
    averageExpPerEliteVictory: totals.eliteVictories > 0
      ? totals.eliteExpGained / totals.eliteVictories
      : 0,
    averageEliteAvoidDetourSteps: totals.eliteAvoidDetourSteps / RUNS_PER_CASE,
    averageEliteAvoidNoRouteFloors: totals.eliteAvoidNoRouteFloors / RUNS_PER_CASE
  };
}

function formatPercent(rate) {
  return `${(rate * 100).toFixed(1)}%`;
}

export function calibrateCoreScoringProfile(
  runCount = RUNS_PER_CASE,
  scenarioOverrides = {},
  identificationPolicy = "legacy"
) {
  const calibrationScenario = {
    ...SCENARIOS.find(scenario => scenario.id === "legacy-no-portal"),
    elitePolicy: "avoid",
    ...scenarioOverrides,
    identificationPolicy: identificationPolicy.id || identificationPolicy
  };
  const observations = createCoreObservations();
  for (let runIndex = 0; runIndex < runCount; runIndex++) {
    const className = SIM_CLASSES[runIndex % SIM_CLASSES.length];
    const result = simulateRun({
      className,
      startFloor: 1,
      targetDepth: 20,
      runIndex,
      seriesId: "core-score-calibration",
      scoringProfile: null,
      scenario: calibrationScenario
    });
    addCoreObservations(observations, result.coreObservations);
  }
  return createCoreScoringProfile(observations, runCount);
}

export function resetSimulationRandom(seed = SIM_SEED) {
  randomState = Number(seed) >>> 0;
}

export function getSimulationRandomState() {
  return randomState;
}

export { SCENARIOS, SIM_CLASSES };

function printCoreScoringProfile(profile, policy = null) {
  console.log(`\n【core期待戦闘価値 calibration（B1→B20）${policy ? ` / ${policy.label}` : ""}】`);
  console.log(
    `背水: 自攻撃直前HP${formatPercent(CORE_AFFIX_BY_ID.get("CORE_LAST_STAND").params.hpThreshold)}` +
    `以下turn率=${formatPercent(profile.lowHpOffensiveRate)}; 攻撃score×率×(1.4-1)`
  );
  console.log(
    `先手必勝: 先制成功fight率=${formatPercent(profile.openerFirstStrikeRate)}; ` +
    "率×100%追撃×followUp重み0.15"
  );
  console.log(
    `血杖: MP不足攻撃spell機会率=${formatPercent(profile.bloodWandSpellOpportunityRate)}, ` +
    `MP不足DIOS機会率=${formatPercent(profile.bloodWandHealOpportunityRate)}, ` +
    `spell/fight実測damage=${profile.averageSpellDamage.toFixed(2)}/${profile.averageFightDamage.toFixed(2)}, ` +
    `DIOS実測回復=${profile.averageDiosHealing.toFixed(2)}; ` +
    "攻撃score×攻撃機会率×damage差 + maxHP重み×回復機会率×回復量"
  );
  console.log(
    `浄化の環: MP回復可能対象撃破/攻撃turn=${profile.purifyMpPerOffensiveTurn.toFixed(4)}; ` +
    "攻撃score×対象撃破率×MP1×spell/fight実測damage差"
  );
  const funnel = profile.purifyFunnel;
  console.log(
    `  発動ファネル: 撃破${funnel.totalKills} → タグ一致${funnel.tagKills}` +
    `(${formatPercent(funnel.tagKills / Math.max(1, funnel.totalKills))}) → ` +
    `MP空きあり${funnel.tagKillsWithMpRoom}` +
    `(タグ一致の${formatPercent(funnel.tagKillsWithMpRoom / Math.max(1, funnel.tagKills))})。` +
    `MP持ち職の撃破に限ればタグ一致${funnel.tagKillsByCaster}、` +
    `全撃破のうちMP空きは${formatPercent(funnel.killsWithMpRoom / Math.max(1, funnel.totalKills))}`
  );
  console.log(
    `罠喰い: 残り罠解除実績 B1=${profile.expectedTrapDisarmsFromFloor[1].toFixed(3)}, ` +
    `B10=${profile.expectedTrapDisarmsFromFloor[10].toFixed(3)}; ` +
    "min(20, 現floor以降の解除回数×攻撃+2)×weaponAtk重み2"
  );
  console.log(
    `呪飼いの鎖: 装備呪い実測平均=${profile.averageEquippedCurseCount.toFixed(4)}; ` +
    "呪い数×全能力+3×既存能力重み合計（legacyでは0、powder/gambleでは実測）"
  );
  console.log(
    `巨人殺し: 自分よりmaxHP高い敵への攻撃turn率=${formatPercent(profile.giantTargetRate)}; ` +
    "攻撃score×率×(1.3-1)"
  );
  console.log(
    `反撃の棘: 物理被弾率=${formatPercent(profile.incomingPhysicalHitRate)}; ` +
    "攻撃score×率×反撃率0.3×威力0.5"
  );
  console.log(
    `執行人: 状態異常敵への攻撃turn率=${formatPercent(profile.statusTargetRate)}; ` +
    "実KATINO初手方針で実測、攻撃score×率×(2-1)"
  );
  console.log("殿の構え: enabled=false → 判定・スコア・集計から除外");
  console.log(
    "血杖: 実generatorのmeta解放対象。未解放simではpool外 → 遭遇0は仕様"
  );
  console.log("\n【economy探索価値 calibration（B1→B20）】");
  console.log(
    `盗掘王: 残り拾得宝箱 B1=${profile.expectedPickedChestsFromFloor[1].toFixed(2)}, ` +
    `B10=${profile.expectedPickedChestsFromFloor[10].toFixed(2)}; ` +
    `素材+1×素材score ${MATERIAL_EV_SCORE_WEIGHT}×罠risk割引 ${TOMB_RAIDER_TRAP_RISK_DISCOUNT}`
  );
  console.log(
    `野営の達人: 追加回復EV B1=` +
    `HP${profile.expectedCampBonusHpFromFloor[1].toFixed(2)}/` +
    `MP${profile.expectedCampBonusMpFromFloor[1].toFixed(2)}; ` +
    "HP重み＋MP1点当たりspell/fight実測damage差"
  );
  console.log(
    `賞金稼ぎ: 通常未達→2倍なら達成となるquest素材EV/run=` +
    `${profile.expectedBountyMaterialsPerRun.toFixed(3)}; 残りrun比で逓減`
  );
  console.log(
    `学者の眼: 未登録敵の確定化による残り素材EV ` +
    `B1=${profile.expectedScholarMaterialsFromFloor[1].toFixed(2)}, ` +
    `B10=${profile.expectedScholarMaterialsFromFloor[10].toFixed(2)}`
  );
  console.log("忍び足: 徘徊エリート追跡未再現 → 定量化保留、95%保持のみ");
  console.log("慧眼: 未鑑定判断経路を実測、未鑑定効果EVは定量化保留");
}

function printTable(results) {
  console.log("戦略       | 生還率 | 死亡率 | 翼使用率 | bank保持率 | bank素材EV | 平均時間 | 素材EV/時間 | 平均到達階 | 平均Lv | 平均換装 | 平均薬 | 平均逃走 | 逃走run率");
  console.log("-----------|--------|--------|----------|------------|------------|----------|-------------|------------|--------|----------|--------|----------|----------");
  results.forEach(result => {
    console.log(
      `${result.label.padEnd(10)} | ${formatPercent(result.survivalRate).padStart(6)} | ` +
      `${formatPercent(result.deathRate).padStart(6)} | ${formatPercent(result.townPortalUseRate).padStart(8)} | ` +
      `${formatPercent(result.bankRetentionRate).padStart(10)} | ${result.bankedMaterialEv.toFixed(2).padStart(10)} | ` +
      `${result.averageTimeCost.toFixed(2).padStart(8)} | ${result.materialEvPerTime.toFixed(4).padStart(11)} | ` +
      `${result.averageReachedFloor.toFixed(2).padStart(10)} | ${result.averageFinalLevel.toFixed(2).padStart(6)} | ` +
      `${result.averageEquipmentUpgrades.toFixed(2).padStart(8)} | ${result.averageHealPotionsUsed.toFixed(2).padStart(6)} | ` +
      `${result.averageFleeCount.toFixed(2).padStart(8)} | ${formatPercent(result.runsWithFleeRate).padStart(8)}`
    );
  });
}

function printTrapMetrics(result) {
  console.log(`\n【${result.label} 罠計測 / 職業別 / 方針=${result.trapPolicy}】`);
  console.log(
    "職業    | 発動/run | 罠被害HP | 戦闘被害HP | 罠傷薬消費 | 傷薬消費 | 不足/run | 不足率 | 開始入手 | 宝箱入手 | 商人入手 | 開始消費 | 宝箱消費 | 商人消費 | 解除 | 回避 | 強行 | kit入手 | kit使用"
  );
  console.log(
    "--------|----------|----------|------------|------------|----------|----------|--------|----------|----------|----------|----------|----------|----------|------|------|------|--------|--------"
  );
  Object.entries(result.trapMetricsByClass).forEach(([className, metrics]) => {
    const acquired = metrics.averageHealPotionsAcquiredBySource;
    const consumed = metrics.averageHealPotionsConsumedBySource;
    console.log(
      `${className.padEnd(7)} | ${metrics.averageTrapActivations.toFixed(2).padStart(8)} | ` +
      `${metrics.averageTrapDamageHp.toFixed(2).padStart(8)} | ` +
      `${metrics.averageCombatDamageHp.toFixed(2).padStart(10)} | ` +
      `${metrics.averageTrapHealPotionsUsed.toFixed(2).padStart(10)} | ` +
      `${metrics.averageHealPotionsConsumed.toFixed(2).padStart(8)} | ` +
      `${metrics.averageTrapHealPotionShortages.toFixed(2).padStart(8)} | ` +
      `${formatPercent(metrics.trapHealPotionShortageRunRate).padStart(6)} | ` +
      `${acquired.starting.toFixed(2).padStart(8)} | ${acquired.chest.toFixed(2).padStart(8)} | ` +
      `${acquired.merchant.toFixed(2).padStart(8)} | ` +
      `${consumed.starting.toFixed(2).padStart(8)} | ${consumed.chest.toFixed(2).padStart(8)} | ` +
      `${consumed.merchant.toFixed(2).padStart(8)} | ` +
      `${metrics.averageTrapDisarms.toFixed(2).padStart(4)} | ${metrics.averageTrapAvoided.toFixed(2).padStart(4)} | ` +
      `${metrics.averageTrapForced.toFixed(2).padStart(4)} | ${metrics.averageTrapKitsAcquired.toFixed(2).padStart(6)} | ` +
      `${metrics.averageTrapKitsUsed.toFixed(2).padStart(6)}`
    );
  });
  console.log("非薬回復HP/run (camp / stairsHeal / DIOS)");
  Object.entries(result.trapMetricsByClass).forEach(([className, metrics]) => {
    console.log(
      `${className.padEnd(7)} | ${metrics.averageCampHealingHp.toFixed(2).padStart(5)} / ` +
      `${metrics.averageStairsHealingHp.toFixed(2).padStart(5)} / ` +
      `${metrics.averageDiosHealingHp.toFixed(2).padStart(6)}`
    );
  });
}

function printEliteMetrics(results) {
  console.log("戦略       | 方針 | 平均遭遇 | 勝率 | 逃走率 | 死亡率 | 勝利時Lv上昇 | 勝利時EXP | 回避追加歩数 | 回避不能初期配置");
  console.log("-----------|------|----------|------|--------|--------|--------------|-----------|--------------|------------------");
  results.forEach(result => {
    console.log(
      `${result.label.padEnd(10)} | ${result.elitePolicy.padEnd(6)} | ` +
      `${result.averageEliteEncounters.toFixed(2).padStart(8)} | ` +
      `${formatPercent(result.eliteVictoryRate).padStart(4)} | ` +
      `${formatPercent(result.eliteFleeRate).padStart(6)} | ` +
      `${formatPercent(result.eliteDeathRate).padStart(6)} | ` +
      `${result.averageLevelsPerEliteVictory.toFixed(2).padStart(12)} | ` +
      `${result.averageExpPerEliteVictory.toFixed(0).padStart(9)} | ` +
      `${result.averageEliteAvoidDetourSteps.toFixed(2).padStart(12)} | ` +
      `${result.averageEliteAvoidNoRouteFloors.toFixed(2).padStart(16)}`
    );
  });
}

function printIdentificationMetrics(results, policy) {
  console.log(`\n【${policy.label} 未鑑定判断・呪い実測】`);
  console.log(
    "目標深度 | 平均到達深度 | 生還率 | EV/時間 | 粉入手/Run | 粉消費/Run | 鑑定回数/Run | 未鑑定着用/Run | 呪い被弾/Run"
  );
  console.log(
    "---------|--------------|--------|----------|------------|------------|--------------|----------------|--------------"
  );
  results.forEach(result => {
    console.log(
      `${result.label.padEnd(8)} | ${result.averageReachedFloor.toFixed(2).padStart(12)} | ` +
      `${formatPercent(result.survivalRate).padStart(6)} | ${result.materialEvPerTime.toFixed(4).padStart(8)} | ` +
      `${result.averageIdentificationPowderAcquired.toFixed(2).padStart(10)} | ` +
      `${result.averageIdentificationPowderUsed.toFixed(2).padStart(10)} | ` +
      `${result.averageIdentificationCount.toFixed(2).padStart(12)} | ` +
      `${result.averageUnidentifiedWearCount.toFixed(2).padStart(14)} | ` +
      `${result.averageCurseHitCount.toFixed(2).padStart(12)}`
    );
    const source = result.averageIdentificationPowderAcquiredBySource;
    console.log(
      `  粉入手内訳/Run: 開始=${source.starting.toFixed(2)}, 工房=${source.workshop.toFixed(2)}, ` +
      `出発準備=${source.departureKit.toFixed(2)}, 宝箱=${source.chest.toFixed(2)}, ` +
      `図鑑初撃破=${source.codex.toFixed(2)}`
    );
  });
}

function printIdentificationComparison(resultsByPolicy, scenario) {
  const powderResults = resultsByPolicy.get("powder");
  const gambleResults = resultsByPolicy.get("gamble");
  if (!powderResults || !gambleResults) return;

  console.log(`\n【${scenario.label} 方針A/B 合否判定】`);
  TARGET_DEPTHS.forEach(targetDepth => {
    const powder = powderResults.find(result => result.targetDepth === targetDepth);
    const gamble = gambleResults.find(result => result.targetDepth === targetDepth);
    const depthOk = powder.averageReachedFloor >= gamble.averageReachedFloor;
    const survivalOk = powder.survivalRate >= gamble.survivalRate;
    console.log(
      `B${targetDepth}: 到達深度 A=${powder.averageReachedFloor.toFixed(2)} / B=${gamble.averageReachedFloor.toFixed(2)}, ` +
      `生還率 A=${formatPercent(powder.survivalRate)} / B=${formatPercent(gamble.survivalRate)} -> ` +
      `${depthOk && survivalOk ? "先送り優位" : "先送り支配でない"}`
    );
  });
  const powderB20 = powderResults.find(result => result.targetDepth === 20);
  const gambleB20 = gambleResults.find(result => result.targetDepth === 20);
  const holdDominates =
    powderB20.averageReachedFloor >= gambleB20.averageReachedFloor &&
    powderB20.survivalRate >= gambleB20.survivalRate;
  console.log(
    `合否（B20基準）: ${holdDominates ? "先送りが支配戦略" : "不合格（先送りが支配戦略ではない）"}`
  );
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

function printCoreRetentionDetail(result) {
  console.log(`\n【${result.label} core定着詳細】`);
  console.log(
    `全core: 遭遇=${formatPercent(result.coreEncounterRate)}, ` +
    `終了時装備=${formatPercent(result.coreEquippedRate)}, ` +
    `遭遇→装備定着=${formatPercent(result.coreRetentionRate)}`
  );
  console.log(
    `combat: 遭遇=${formatPercent(result.combatCoreEncounterRate)}, ` +
    `終了時装備=${formatPercent(result.combatCoreEquippedRate)}, ` +
    `定着=${formatPercent(result.combatCoreRetentionRate)}`
  );
  console.log(
    `economy: 遭遇=${formatPercent(result.economyCoreEncounterRate)}, ` +
    `終了時装備=${formatPercent(result.economyCoreEquippedRate)}, ` +
    `定着=${formatPercent(result.economyCoreRetentionRate)}`
  );
  console.log("遭遇core別（run数。未装備理由は最終非装備runの主因）:");
  ENABLED_CORE_AFFIXES.forEach(affix => {
    const encountered = result.coreEncounterRunsById[affix.id] || 0;
    const equipped = result.coreEquippedRunsById[affix.id] || 0;
    const reasons = Object.entries(result.unequippedCoreReasonsById[affix.id] || {})
      .map(([reason, count]) => `${reason}=${count}`)
      .join(", ");
    console.log(
      `  ${affix.id} [${affix.poolGroup}]: 遭遇=${encountered}, 終了時装備=${equipped}, ` +
      `未装備=${Math.max(0, encountered - equipped)}${reasons ? ` (${reasons})` : ""}`
    );
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

export function runDepthSimulationTask(
  { kind, scenarioId, identificationPolicyId = "legacy" },
  { scoringProfile, scoringProfiles = {} }
) {
  resetSimulationRandom(SIM_SEED);
  const scoringProfileForPolicy =
    scoringProfiles[identificationPolicyId] || scoringProfile;
  const identificationPolicy =
    IDENTIFICATION_POLICY_DEFINITIONS[identificationPolicyId] ||
    IDENTIFICATION_POLICY_DEFINITIONS.legacy;
  if (kind === "scenario") {
    const scenario = SCENARIOS.find(candidate => candidate.id === scenarioId);
    return TARGET_DEPTHS.map(targetDepth => simulateCase({
      startFloor: 1,
      targetDepth,
      label: `B${targetDepth}撤退`,
      seriesId: `depth-${targetDepth}`,
      scoringProfile: scoringProfileForPolicy,
      scenario,
      identificationPolicy
    }));
  }

  const legacyScenario = SCENARIOS.find(scenario => scenario.id === "legacy-no-portal");
  return [
    simulateCase({
      startFloor: 10,
      targetDepth: 15,
      label: "B10→B15",
      seriesId: "milestone-10-15",
      scoringProfile: scoringProfileForPolicy,
      scenario: legacyScenario,
      identificationPolicy
    }),
    simulateCase({
      startFloor: 1,
      targetDepth: 15,
      label: "B1→B15",
      seriesId: "baseline-1-15",
      scoringProfile: scoringProfileForPolicy,
      scenario: legacyScenario,
      identificationPolicy
    })
  ];
}

export async function runDepthMaterialSimulation() {
const coreScoringProfiles = Object.fromEntries(
  ACTIVE_IDENTIFICATION_POLICIES.map(policy => {
    resetSimulationRandom(SIM_SEED);
    return [
      policy.id,
      calibrateCoreScoringProfile(RUNS_PER_CASE, {}, policy.id)
    ];
  })
);
// calibrationが本計測の乱数列をずらさないよう、baselineと同じseed先頭へ戻す。
randomState = SIM_SEED;

console.log("深度別 リスク調整後素材EVシミュレーション");
console.log(`試行数: 各ケース N=${RUNS_PER_CASE}（基本${SIM_CLASSES.length}職をround-robin集約）`);
console.log(`乱数seed: ${SIM_SEED}`);
console.log(`徘徊エリート方針: ${DEFAULT_ELITE_POLICY}`);
console.log(`罠方針: ${TRAP_POLICY_DEFINITIONS[DEFAULT_TRAP_POLICY_ID].label} / TRAP_POLICY=${DEFAULT_TRAP_POLICY_ID}`);
console.log(`傷薬商人方針: ${DEFAULT_HEAL_POTION_MERCHANT_POLICY}（マイルストーンで所持0時に1個購入）`);
console.log(`core価値calibration: B1→B20 N=${RUNS_PER_CASE} / 方針=${ACTIVE_IDENTIFICATION_POLICIES.map(policy => policy.id).join(",")}`);
console.log(`識別方針切替: IDENTIFICATION_POLICY=${process.env.IDENTIFICATION_POLICY || "legacy"}`);
console.log(
  `仮定: 探索係数=${EXPLORATION_FACTOR}, 宝箱拾得率=${CHEST_PICKUP_RATE}, ` +
  `戦闘ターン重み=${COMBAT_TURN_WEIGHT}`
);
console.log(
  `初期inventory: 傷薬=${INITIAL_HEAL_POTIONS}個, 解毒薬=${INITIAL_ANTIDOTES}個, ` +
  "工房解放済条件の既定翼=1個、方針A/Bは出発準備の翼も1個"
);
console.log(
  `生存仮定: 傷薬使用閾値=${HEAL_POTION_THRESHOLD}, ` +
  `逃走閾値=${DEFAULT_FLEE_HP_THRESHOLD ?? "逃走なし"}, ` +
  `状態回復=${DEFAULT_STATUS_CURE_POLICY}(HP<=${DEFAULT_STATUS_CURE_HP_THRESHOLD}), ` +
  "装備=識別方針別の実制限付き更新"
);
console.log(
  `帰還の翼ポリシー（仮値・感度分析対象）: B${PORTAL_MIN_FLOOR}以降, ` +
  `HP<=${PORTAL_HP_THRESHOLD}, 傷薬<=${PORTAL_MAX_HEAL_POTIONS}個で1個消費し即時撤退・100% bank`
);
console.log(
  `供給仮定: 宝箱の本体/装身具分岐を実ロジック準拠で反映、` +
  `宝箱TOWN_PORTAL/状態回復薬をinventory追加・使用対象化、` +
  `方針A/Bの鑑定粉は開始${IDENTIFICATION_BALANCE.startingPowder}個+出発準備1個を含み、` +
  `宝箱${IDENTIFICATION_BALANCE.chestPowderChance * 100}%と実applyCombatRewardsの図鑑5種ごと+1を計測、` +
  `マイルストーン商人の不足状態回復薬を実素材で購入、` +
  `core判定=enabled ${ENABLED_CORE_AFFIXES.length}/${CORE_AFFIXES.length}種+affix_rules helper`
);
console.log(
  "非モデル化: テレポーター移動先の再経路化、商人での罠外し/鑑定粉購入、" +
  "上薬・MP消費/強化アイテムの能動使用、マップ上の任意寄り道、" +
  "徘徊エリートの移動・知覚・偶発接触、人間の敵別判断（固定閾値で代理）"
);
console.log(
  "エリートモデル: generateRunFloor→実配置。avoid=初期セルを塞ぐ最短路の追加歩数、" +
  "engage=初期位置へ寄り道して実round/reward経路で各階1戦"
);
console.log(
  "感度指定: FLEE_POLICY=never / FLEE_HP_THRESHOLD, " +
  "STATUS_CURE_POLICY=smart|never / STATUS_CURE_HP_THRESHOLD / " +
  "STATUS_CURE_MERCHANT_POLICY=missing|never, " +
  "PORTAL_HP_THRESHOLD / PORTAL_MAX_HEAL_POTIONS / PORTAL_MIN_FLOOR; " +
  "ELITE_POLICY=avoid|engage / TRAP_POLICY=legacy|conservative; " +
  "SIM_SCENARIOS=workshop-locked,workshop-unlocked,legacy-no-portal"
);
console.log(
  `core呪い設定: AFFIX_BALANCE.coreCurseChance=${AFFIX_BALANCE.coreCurseChance}は現generator未参照、` +
  `実生成はIDENTIFICATION_BALANCE.coreCurseBonus=${IDENTIFICATION_BALANCE.coreCurseBonus}; ` +
  "legacyのみ呪い除外、powder/gambleは実生成呪いを適用"
);
console.log("逃走=常時成功（自ターン到達時）、先行攻撃＋離脱時追撃1発、報酬なし、探索継続");
console.log("時間単位: 1歩=1、1戦闘ターン=3");
console.log("撤退=100% bank、死亡=30% bank");
ACTIVE_IDENTIFICATION_POLICIES.forEach(policy => {
  printCoreScoringProfile(coreScoringProfiles[policy.id], policy);
});

if (ACTIVE_SCENARIOS.length === 0) {
  throw new Error(`SIM_SCENARIOSに有効な条件がない: ${[...SCENARIO_FILTER].join(",")}`);
}

const taskResults = await runSimTasks({
  moduleUrl: import.meta.url,
  exportName: "runDepthSimulationTask",
  runTask: runDepthSimulationTask,
  tasks: ACTIVE_IDENTIFICATION_POLICIES.flatMap(policy => [
    ...ACTIVE_SCENARIOS.map(scenario => ({
      kind: "scenario",
      scenarioId: scenario.id,
      identificationPolicyId: policy.id
    })),
    { kind: "milestone", identificationPolicyId: policy.id }
  ]),
  context: {
    scoringProfile: coreScoringProfiles.legacy || coreScoringProfiles[ACTIVE_IDENTIFICATION_POLICIES[0].id],
    scoringProfiles: coreScoringProfiles
  }
});
const resultsByPolicy = ACTIVE_IDENTIFICATION_POLICIES.map((policy, policyIndex) => {
  const offset = policyIndex * (ACTIVE_SCENARIOS.length + 1);
  return {
    policy,
    scenarioResults: ACTIVE_SCENARIOS.map((scenario, scenarioIndex) => ({
      scenario,
      results: taskResults[offset + scenarioIndex]
    })),
    milestoneResults: taskResults[offset + ACTIVE_SCENARIOS.length]
  };
});

resultsByPolicy.forEach(({ policy, scenarioResults, milestoneResults }) => {
  console.log(`\n【識別方針: ${policy.label}】`);
  scenarioResults.forEach(({ scenario, results }) => {
  console.log(`\n【${scenario.label} B1開始 深度別系列】`);
  printTable(results);
  results.forEach(printTrapMetrics);
  console.log(`\n【${scenario.label} 徘徊エリート】`);
  printEliteMetrics(results);
  printIdentificationMetrics(results, policy);
  console.log(`\n【${scenario.label} B1開始 ビルド供給】`);
  printBuildSupplyMetrics(results);
  printCoreRetentionDetail(results.at(-1));

  const monotonic = isMonotonicallyIncreasing(results);
  const bestDepthResult = [...results]
    .sort((a, b) => b.materialEvPerTime - a.materialEvPerTime)[0];
  const b5IsBest = bestDepthResult.targetDepth === 5;
  console.log(`単位時間EVは深度について単調増加: ${monotonic ? "Yes" : "No"}`);
  console.log(
    `B5が単位時間EV最上位でない: ${b5IsBest ? "不合格" : "合格"}` +
    `（最上位=${bestDepthResult.label}）`
  );
  if (!monotonic || b5IsBest) printFailureComment(results);
  console.log(
    `深度カーブ: bank保持率=${results.map(result => formatPercent(result.bankRetentionRate)).join(" / ")}, ` +
    `EV/時間=${results.map(result => result.materialEvPerTime.toFixed(4)).join(" / ")}`
  );
  });

  console.log("\n【マイルストーン開始比較】");
  console.log(
    `B10開始は currentRun.startFloor=10 により実ドロップ量へ ` +
    `milestoneStartMultiplier=${MATERIAL_DROP_BALANCE.milestoneStartMultiplier} を適用`
  );
  printTable(milestoneResults);
  milestoneResults.forEach(printTrapMetrics);
  console.log("\n【マイルストーン開始 徘徊エリート】");
  printEliteMetrics(milestoneResults);
  printIdentificationMetrics(milestoneResults, policy);
  console.log("\n【マイルストーン開始 ビルド供給】");
  printBuildSupplyMetrics(milestoneResults);
  const milestoneDominated =
    milestoneResults[0].materialEvPerTime < milestoneResults[1].materialEvPerTime;
  console.log(
    `Issue #237 裏取り: B10開始はB1開始より単位時間EVで劣後(dominated): ` +
    `${milestoneDominated ? "Yes" : "No"}`
  );
});

ACTIVE_SCENARIOS.forEach(scenario => {
  const scenarioPolicyResults = new Map(
    resultsByPolicy.map(({ policy, scenarioResults }) => [
      policy.id,
      scenarioResults.find(result => result.scenario.id === scenario.id)?.results
    ])
  );
  printIdentificationComparison(scenarioPolicyResults, scenario);
});

const stalemateCases = [
  ...resultsByPolicy.flatMap(({ scenarioResults, milestoneResults }) => [
    ...scenarioResults.flatMap(({ results }) => results),
    ...milestoneResults
  ])
].filter(result => result.stalemateRate > 0);
if (stalemateCases.length > 0) {
  console.log(
    `注: ${MAX_COMBAT_TURNS}ターン上限到達は進行不能として死亡bank扱い: ` +
    stalemateCases.map(result => `${result.label}=${formatPercent(result.stalemateRate)}`).join(", ")
  );
}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runDepthMaterialSimulation();
}
