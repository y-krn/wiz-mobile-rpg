// sim-scope: run
/* global console, process */

import { pathToFileURL } from "node:url";
import { basename } from "node:path";
import { isMainThread } from "node:worker_threads";
import { resolveMeasurementProvenance } from "./measurement_provenance.js";
import { runSimTasks } from "./sim_parallel.js";
import { printEnvSignatureBanner, readSimScopeDeclaration } from "./measurement_env_signature.js";
import { reportMechanismFiring } from "./mechanism_wiring_report.js";

// Unit tests import this shared module for wiring checks, not measurements.
const IS_TEST_PROCESS = process.env.SIM_SKIP_PROVENANCE === "1" ||
  basename(process.argv[1] || "").startsWith("test_");
export const MEASUREMENT_PROVENANCE = isMainThread && !IS_TEST_PROCESS
  ? resolveMeasurementProvenance()
  : null;

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
const { recordCharDeath } = await import("../src/state.js");
const { calculateEncounterChance } = await import("../src/movement.js");
const { ELITE_CLASSES } = await import("../src/data/classes.js");
const { generateEncounter } = await import("../src/combat_ui/encounter.js");
const { applyPendingOutcomeRewards } = await import("../src/combat_ui/outcome_rewards.js");
const { runCombatRoundCalculation } = await import("../src/combat_logic.js");
const {
  chooseAutoCombatAction,
  getAutoHealTargetIdx,
  getPreferredHealingSpellName,
  getPreferredOffensiveSpellName
} = await import("../src/combat_logic/auto_action.js");
const { SPELL_EFFECTS } = await import("../src/systems/spell_effects.js");
const { assignRunQuests, updateRunQuests } = await import("../src/systems/run_quests.js");
const {
  generateRunFloor: generateRunFloorSource,
  floorHasCampEvent
} = await import("../src/run_map_generator.js");
const { isMilestoneFloor } = await import("../src/run_map_generator.js");
const { createFloorElite } = await import("../src/systems/roaming_elites.js");
const { getFloorTemplate } = await import("../src/data/floor_templates.js");
const { EVENT_TYPES } = await import("../src/constants/events.js");
const { DX, DY } = await import("../src/constants/directions.js");
const { generateChestMaterials } = await import("../src/chest.js");

const ISSUE538_LEGACY_SPELL_POLICY = process.env.ISSUE538_SPELL_POLICY === "legacy";

const SIM_MAP_STATS_ENABLED = process.env.SIM_MAP_STATS === "1";
const mapGenerationStats = {
  calls: 0,
  keys: new Set()
};
const requestedMapCacheEntries = Number(process.env.SIM_MAP_CACHE_ENTRIES);
const SIM_MAP_CACHE_ENTRIES = Number.isInteger(requestedMapCacheEntries) && requestedMapCacheEntries > 0
  ? requestedMapCacheEntries
  : 1_024;
let localRunFloorCache = null;

function resetMapGenerationStats() {
  if (!SIM_MAP_STATS_ENABLED) return;
  mapGenerationStats.calls = 0;
  mapGenerationStats.keys.clear();
}

function getMapGenerationStats() {
  if (!SIM_MAP_STATS_ENABLED) return null;
  return {
    calls: mapGenerationStats.calls,
    keys: [...mapGenerationStats.keys]
  };
}

function generateRunFloor({ runSeed, floor, ...options }) {
  if (SIM_MAP_STATS_ENABLED) {
    mapGenerationStats.calls++;
    mapGenerationStats.keys.add(`${runSeed}:${floor}`);
  }
  return generateRunFloorSource({ runSeed, floor, ...options });
}

function cloneGeneratedFloorForSimulation(generated) {
  return structuredClone(generated);
}

function createRunFloorCache(maxEntries = SIM_MAP_CACHE_ENTRIES) {
  const entries = new Map();
  return {
    get({ runSeed, floor }) {
      const key = `${runSeed}:${floor}`;
      const cached = entries.get(key);
      if (cached) {
        entries.delete(key);
        entries.set(key, cached);
        return cached;
      }
      const generated = generateRunFloor({ runSeed, floor });
      entries.set(key, generated);
      while (entries.size > maxEntries) {
        entries.delete(entries.keys().next().value);
      }
      return generated;
    }
  };
}

export function generateSharedRunFloor(args) {
  return generateRunFloor(args);
}

function getRunFloor(args) {
  const sharedMapRequest = globalThis.__simSharedMapRequest;
  if (typeof sharedMapRequest === "function") {
    // The broker returns a fresh v8-deserialized object, or an unretained generated object.
    return sharedMapRequest(args);
  }
  const generated = localRunFloorCache
    ? localRunFloorCache.get(args)
    : generateRunFloor(args);
  // The serial cache retains generated, so simulation mutations must not reach it.
  return cloneGeneratedFloorForSimulation(generated);
}
// 宝箱の抽選は src と同一の出所を叩く（#273）。写経すると src 変更に追随しない。
const {
  CHEST_ACCESSORY_CORE_MIN_FLOOR,
  CHEST_EQUIPMENT_CORE_MIN_FLOOR,
  calculateChestMainItemExpectedValue,
  calculateChestMainItemForcedLossRate,
  rollChestAccessory,
  rollChestReward,
  rollChestTrap
} = await import("../src/rules/chest_rules.js");
const {
  calculateChestDisarmChance,
  calculateChestDisarmActionEv,
  calculateChestDisarmEvThreshold,
  calculateDetectRate,
  calculateFloorDisarmEvThreshold,
  calculateFloorTrapActionExpectedDamage,
  calculateFloorTrapAvoidanceEv,
  calculateFloorTrapSuccessRate,
  isDisarmAptClass,
  resolveTrapAction
} = await import("../src/rules/trap_rules.js");
const {
  applyTrapGuardToEffect,
  calculateChestTrapExpectedRisk,
  calculateFloorTrapExpectedDamage,
  hasTrapScout,
  resolveChestTrapEffect,
  resolveFlameTrapEffect,
  resolveFloorTrapEffect
} = await import("../src/rules/trap_effect_rules.js");
const {
  AFFIX_BALANCE,
  CORE_AFFIXES,
  SUPPORT_AFFIXES
} = await import("../src/data/affixes.js");
const { ITEMS } = await import("../src/data/items.js");
const { MATERIAL_DROP_BALANCE, MATERIAL_TYPES } = await import("../src/data/materials.js");
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
  getCoreLogText,
  getSpellPayment,
  hasCoreAffix
} = await import("../src/rules/affix_rules.js");
const {
  isPurifyTarget,
  resolvePurifyRecovery
} = await import("../src/rules/purify_rules.js");
const {
  bankRunMaterials,
  getBankedMaterials,
  getDepthMaterialExpectedQuantity,
  getMonsterGroupClassification,
  getScholarMaterialBonus: getExpectedScholarMaterialBonus,
  spendMaterials
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
  getPartyFlameTrapWarningAvoidanceChance,
  getTrapEaterBonusAfterDisarm,
  getCharVit,
  getCharWeaponAtk,
  getItemData,
  getEquippedItemData,
  getEncounterPoolForFloor,
  MONSTERS,
  SPELLS
} = await import("../src/data.js");

// Candidate/masking list only; selection ranking lives in auto_action.js.
const PRIEST_HEALING_SPELL_IDS = Object.freeze([
  "DIALMA",
  "MADI",
  "MADIOS",
  "DIOS"
]);

// Phase 2b scratch-only probe. It observes the real damage.js call without
// changing src/. The wrapper is inactive unless the measurement opts in.
const SIM_DAMAGE_PROBE_ENABLED = process.env.SIM_DAMAGE_PROBE === "1";
if (SIM_DAMAGE_PROBE_ENABLED && !globalThis.__simDamageProbeMathRoundWrapped) {
  const originalMathRound = Math.round;
  Math.round = value => {
    const result = originalMathRound(value);
    const probe = globalThis.__simTargetedDamageProbe;
    if (!probe) return result;
    const stack = new Error().stack || "";
    if (!probe.matchLines?.some(line => stack.includes(`damage.js:${line}`))) {
      return result;
    }
    const multiplier = 1 + Number(probe.affixValueAfter || 0) / 100;
    const beforeBonus = multiplier > 0 ? value / multiplier : value;
    const counterfactual = originalMathRound(beforeBonus);
    probe.calls.push({
      beforeBonus,
      counterfactual,
      applied: result,
      ratio: counterfactual > 0 ? result / counterfactual : null
    });
    return result;
  };
  globalThis.__simDamageProbeMathRoundWrapped = true;
}
const { scaleEnemyForDepth } = await import("../src/rules/depth_scaling.js");
const { ITEM_EFFECTS } = await import("../src/systems/item_effects.js");
const { getEffectiveHealAmount } = await import("../src/rules/item_rules.js");
const { canUseManaItems } = await import("../src/rules/class_rules.js");
const {
  clearCharIncapacitationOnDamage,
  getBuffTotal
} = await import("../src/combat_logic/status_effects.js");
const {
  applyWorkshopToCharacter,
  getDepartureCraftCost,
  getDepartureCraftGrants,
  getAdditionalCraftableCount,
  purchaseDepartureCraft,
  purchaseWorkshopNode,
  getWorkshopGrants
} = await import("../src/systems/workshop.js");
const { getEnhanceCost } = await import("../src/craft.js");
const { WORKSHOP_NODE_BY_ID } = await import("../src/data/workshop.js");
const { purchaseMilestoneStock } = await import("../src/systems/milestone_merchant.js");
const {
  calculateCombatRecoveryAction,
  getStartingHealPotionCount
} = await import("../src/rules/recovery_rules.js");
const { getPerceptionIntent } = await import("../src/systems/elite_perception.js");

function getScholarMaterialBonus(monsters, state) {
  return monsters.reduce((sum, monster) => {
    if (monster.fled || monster.hasSplit || !monster.simWasUncatalogued) return sum;
    return sum + getExpectedScholarMaterialBonus(
      monster,
      state.floor,
      { startFloor: state.currentRun?.startFloor || 1 }
    );
  }, 0);
}

const SIM_ENV_KEYS = Object.freeze([
  "SIM_SEED",
  "SIM_RUNS",
  "SIM_CALIBRATION_RUNS",
  "DEPARTURE_CRAFT_IDS",
  "TRAP_POLICY",
  "TRAP_AVOIDANCE_POLICY",
  "TRAP_DAMAGE_MULTIPLIER",
  "IDENTIFICATION_POLICY",
  "IDENTIFICATION_STARTING_POWDER",
  "IDENTIFICATION_COST_OVERRIDE",
  "STATUS_CURE_POLICY",
  "STATUS_CURE_HP_THRESHOLD",
  "STATUS_CURE_MERCHANT_POLICY",
  "HEAL_POTION_MERCHANT_POLICY",
  "FLEE_POLICY",
  "FLEE_HP_THRESHOLD",
  "HEAL_POTION_THRESHOLD",
  "MANA_POTION_THRESHOLD",
  "PORTAL_HP_THRESHOLD",
  "PORTAL_MAX_HEAL_POTIONS",
  "PORTAL_MIN_FLOOR",
  "ELITE_POLICY",
  "BLOOD_WAND_HP_PAYMENT_MIN_RATE",
  "SIM_CORE_SCORE_DROP_TOLERANCE",
  "SIM_440_CONDITION",
  "SIM_ISSUE646_CAMP_LEVEL",
  "SIM_INDEPENDENT_RUN_RANDOM",
  "SIM_DIALMA_CANDIDATE",
  "SIM_MADI_CANDIDATE",
  "SIM_MADI_HEAL_MIN",
  "SIM_MADI_HEAL_MAX",
  "SIM_MADI_COST",
  "SIM_SCENARIOS"
]);
const REVALIDATION_DEPARTURE_CRAFT_IDS =
  "TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION";
const DEFAULT_DEPTH_SCENARIOS_CSV =
  "workshop-empty,workshop-stats,workshop-gear,workshop-blood-wand," +
  "workshop-blood-wand-spells,workshop-core-pools," +
  "workshop-complete";
const CURRENT_SIM_ENV_DEFAULTS = Object.freeze({
  SIM_SEED: "231",
  SIM_RUNS: "500",
  SIM_CALIBRATION_RUNS: "100",
  DEPARTURE_CRAFT_IDS: "",
  TRAP_POLICY: "legacy",
  TRAP_AVOIDANCE_POLICY: "ev",
  TRAP_DAMAGE_MULTIPLIER: "1",
  IDENTIFICATION_POLICY: "powder",
  IDENTIFICATION_STARTING_POWDER: String(IDENTIFICATION_BALANCE.startingPowder),
  IDENTIFICATION_COST_OVERRIDE: String(IDENTIFICATION_BALANCE.identifyCost),
  STATUS_CURE_POLICY: "smart",
  STATUS_CURE_HP_THRESHOLD: "1",
  STATUS_CURE_MERCHANT_POLICY: "missing",
  HEAL_POTION_MERCHANT_POLICY: "missing",
  FLEE_POLICY: "ev",
  FLEE_HP_THRESHOLD: "0.20",
  HEAL_POTION_THRESHOLD: "0.55",
  MANA_POTION_THRESHOLD: "0.55",
  PORTAL_HP_THRESHOLD: "0.35",
  PORTAL_MAX_HEAL_POTIONS: "0",
  PORTAL_MIN_FLOOR: "3",
  ELITE_POLICY: "avoid",
  BLOOD_WAND_HP_PAYMENT_MIN_RATE: "0.50",
  SIM_CORE_SCORE_DROP_TOLERANCE: "0",
  SIM_440_CONDITION: "current",
  SIM_ISSUE646_CAMP_LEVEL: "",
  SIM_INDEPENDENT_RUN_RANDOM: "1",
  SIM_DIALMA_CANDIDATE: "1",
  SIM_MADI_CANDIDATE: "1",
  SIM_MADI_HEAL_MIN: "",
  SIM_MADI_HEAL_MAX: "",
  SIM_MADI_COST: "",
  SIM_SCENARIOS: ""
});
const BALANCE_MAIN_PRESET = Object.freeze({
  SIM_SEED: "231",
  SIM_RUNS: "500",
  SIM_CALIBRATION_RUNS: "100",
  DEPARTURE_CRAFT_IDS: "",
  TRAP_POLICY: "conservative",
  TRAP_AVOIDANCE_POLICY: "ev",
  TRAP_DAMAGE_MULTIPLIER: "1",
  IDENTIFICATION_POLICY: "powder",
  IDENTIFICATION_STARTING_POWDER: String(IDENTIFICATION_BALANCE.startingPowder),
  IDENTIFICATION_COST_OVERRIDE: String(IDENTIFICATION_BALANCE.identifyCost),
  STATUS_CURE_POLICY: "smart",
  STATUS_CURE_HP_THRESHOLD: "1",
  STATUS_CURE_MERCHANT_POLICY: "missing",
  HEAL_POTION_MERCHANT_POLICY: "missing",
  FLEE_POLICY: "ev",
  FLEE_HP_THRESHOLD: "0.20",
  HEAL_POTION_THRESHOLD: "0.55",
  MANA_POTION_THRESHOLD: "0.55",
  PORTAL_HP_THRESHOLD: "0.35",
  PORTAL_MAX_HEAL_POTIONS: "0",
  PORTAL_MIN_FLOOR: "3",
  ELITE_POLICY: "avoid",
  BLOOD_WAND_HP_PAYMENT_MIN_RATE: "0.50",
  SIM_CORE_SCORE_DROP_TOLERANCE: "0",
  SIM_440_CONDITION: "current",
  SIM_INDEPENDENT_RUN_RANDOM: "1",
  SIM_DIALMA_CANDIDATE: "1",
  SIM_MADI_CANDIDATE: "1",
  SIM_MADI_HEAL_MIN: "",
  SIM_MADI_HEAL_MAX: "",
  SIM_MADI_COST: "",
  SIM_SCENARIOS: ""
});
const REVALIDATION_PRESET = Object.freeze({
  ...BALANCE_MAIN_PRESET,
  DEPARTURE_CRAFT_IDS: REVALIDATION_DEPARTURE_CRAFT_IDS,
  STATUS_CURE_HP_THRESHOLD: "0.35",
  SIM_SCENARIOS: DEFAULT_DEPTH_SCENARIOS_CSV
});
const SIM_PRESETS = Object.freeze({
  "balance-main": BALANCE_MAIN_PRESET,
  "workshop-complete": Object.freeze({
    ...BALANCE_MAIN_PRESET,
    SIM_RUNS: "2000",
    SIM_CALIBRATION_RUNS: "2000",
    SIM_SCENARIOS: "workshop-complete"
  }),
  "revalidation-main": REVALIDATION_PRESET,
  "boss-diagnosis": Object.freeze({
    ...REVALIDATION_PRESET,
    SIM_SEED: "271",
    SIM_RUNS: "2000",
    SIM_CALIBRATION_RUNS: "1000",
    SIM_SCENARIOS: "workshop-complete"
  }),
  "boss-diagnosis-no-flee": Object.freeze({
    ...REVALIDATION_PRESET,
    SIM_SEED: "271",
    SIM_RUNS: "2000",
    SIM_CALIBRATION_RUNS: "1000",
    FLEE_POLICY: "never",
    SIM_SCENARIOS: "workshop-complete"
  })
});
const SIM_PRESET_NAME = String(process.env.SIM_PRESET || "").trim();
if (SIM_PRESET_NAME && !Object.hasOwn(SIM_PRESETS, SIM_PRESET_NAME)) {
  throw new Error(
    `SIM_PRESET must be ${Object.keys(SIM_PRESETS).join("|")}: ${SIM_PRESET_NAME}`
  );
}
const ACTIVE_SIM_PRESET = SIM_PRESETS[SIM_PRESET_NAME] || null;
const SIM_ENV = Object.freeze(Object.fromEntries(
  SIM_ENV_KEYS.map(key => [
    key,
    Object.hasOwn(process.env, key)
      ? process.env[key]
      : ACTIVE_SIM_PRESET?.[key] ?? CURRENT_SIM_ENV_DEFAULTS[key]
  ])
));
const EXPLICIT_SIM_ENV_KEYS = SIM_ENV_KEYS.filter(key => Object.hasOwn(process.env, key));
const EXPLICIT_TRAP_POLICY_ID = Object.hasOwn(process.env, "TRAP_POLICY")
  ? process.env.TRAP_POLICY
  : null;

function applyIssue440Condition() {
  const condition = String(SIM_ENV.SIM_440_CONDITION || "current").trim();
  if (condition === "current") return;

  const noBudget = condition.startsWith("magic-no-budget-chance-");
  const prefix = noBudget ? "magic-no-budget-chance-" : "magic-chance-";
  if (!condition.startsWith(prefix)) {
    throw new Error(
      `SIM_440_CONDITION must be current|magic-chance-<0..1>|` +
        `magic-no-budget-chance-<0..1>: ${condition}`
    );
  }
  const chance = Number(condition.slice(prefix.length));
  if (!Number.isFinite(chance) || chance < 0 || chance > 1) {
    throw new Error(`SIM_440_CONDITIONのcoreChanceが不正: ${condition}`);
  }

  AFFIX_BALANCE.rollComposition.magic = {
    ...AFFIX_BALANCE.rollComposition.magic,
    core: 1,
    coreChance: chance
  };
  AFFIX_BALANCE.budgetsByRarityAndFloor.magic = noBudget
    ? [0, 3, 3, 3, 3, 3]
    : [0, 10, 10, 10, 10, 10];
}

applyIssue440Condition();

export function getResolvedSimulationEnv() {
  return SIM_ENV;
}

export function printResolvedSimulationEnv() {
  const source = SIM_PRESET_NAME || "(none; current defaults)";
  const overrideLabel = EXPLICIT_SIM_ENV_KEYS.length > 0
    ? EXPLICIT_SIM_ENV_KEYS.join(",")
    : "(none)";
  const lines = [
    "=== SIM_ENV_BEGIN ===",
    `# source: SIM_PRESET=${source}`,
    `# explicit overrides: ${overrideLabel}`,
    `SIM_PRESET=${SIM_PRESET_NAME}`,
    ...SIM_ENV_KEYS.map(key => `${key}=${SIM_ENV[key]}`),
    "=== SIM_ENV_END ==="
  ];
  process.stderr.write(`${lines.join("\n")}\n`);
}

const RUNS_PER_CASE = Math.max(1, Number(SIM_ENV.SIM_RUNS || 500));
const CALIBRATION_RUNS = Math.max(
  1,
  Number(SIM_ENV.SIM_CALIBRATION_RUNS || RUNS_PER_CASE)
);
const SIM_SEED = Number(SIM_ENV.SIM_SEED || 231) >>> 0;
const SIM_INDEPENDENT_RUN_RANDOM = SIM_ENV.SIM_INDEPENDENT_RUN_RANDOM === "1";
const SIM_DIALMA_CANDIDATE = SIM_ENV.SIM_DIALMA_CANDIDATE !== "0";
const SIM_MADI_CANDIDATE = SIM_ENV.SIM_MADI_CANDIDATE !== "0";
const parseOptionalSimInteger = (value, name) => {
  if (value === "" || value === undefined || value === null) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer: ${value}`);
  }
  return parsed;
};
const SIM_MADI_HEAL_MIN = parseOptionalSimInteger(SIM_ENV.SIM_MADI_HEAL_MIN, "SIM_MADI_HEAL_MIN");
const SIM_MADI_HEAL_MAX = parseOptionalSimInteger(SIM_ENV.SIM_MADI_HEAL_MAX, "SIM_MADI_HEAL_MAX");
const SIM_MADI_COST = parseOptionalSimInteger(SIM_ENV.SIM_MADI_COST, "SIM_MADI_COST");
if ((SIM_MADI_HEAL_MIN === null) !== (SIM_MADI_HEAL_MAX === null)) {
  throw new Error("SIM_MADI_HEAL_MIN and SIM_MADI_HEAL_MAX must be provided together");
}
if (
  SIM_MADI_HEAL_MIN !== null &&
  (SIM_MADI_HEAL_MIN < 1 || SIM_MADI_HEAL_MAX < SIM_MADI_HEAL_MIN)
) {
  throw new Error(
    `SIM_MADI_HEAL_MIN/MAX must satisfy 1 <= min <= max: ${SIM_MADI_HEAL_MIN}/${SIM_MADI_HEAL_MAX}`
  );
}
if (SIM_MADI_COST !== null && SIM_MADI_COST < 1) {
  throw new Error(`SIM_MADI_COST must be >= 1: ${SIM_MADI_COST}`);
}
if (SIM_MADI_COST !== null) SPELLS.MADI.cost = SIM_MADI_COST;
if (SIM_MADI_HEAL_MIN !== null) {
  const sourceMadiEffect = SPELL_EFFECTS.MADI;
  SPELL_EFFECTS.MADI = args => sourceMadiEffect({
    ...args,
    healMin: SIM_MADI_HEAL_MIN,
    healMax: SIM_MADI_HEAL_MAX
  });
}
const SIM_HEALING_SPELL_PROFILES =
  SIM_MADI_HEAL_MIN === null && SIM_MADI_COST === null
    ? null
    : {
      MADI: {
        healMin: SIM_MADI_HEAL_MIN ?? SPELLS.MADI.healMin,
        healMax: SIM_MADI_HEAL_MAX ?? SPELLS.MADI.healMax,
        cost: SIM_MADI_COST ?? SPELLS.MADI.cost
      }
    };
const CORE_ENCOUNTER_CEILING_MODE = String(
  process.env.SIM_CORE_ENCOUNTER_CEILING || ""
).trim();

function getSimulationPriestHealingSpellIds() {
  return PRIEST_HEALING_SPELL_IDS.filter(spellName => {
    if (spellName === "DIALMA" && !SIM_DIALMA_CANDIDATE) return false;
    if (spellName === "MADI" && !SIM_MADI_CANDIDATE) return false;
    return true;
  });
}
const CORE_WORKSHOP_GATE_MODE = String(
  process.env.SIM_CORE_WORKSHOP_GATE || ""
).trim();
const SUPPORT_SUPPLY_CEILING_MODE = String(
  process.env.SIM_SUPPORT_SUPPLY_CEILING || "none"
).trim();
const EQUIPMENT_SLOT_MODE = String(
  process.env.SIM_EQUIPMENT_SLOT_MODE || "standard"
).trim();
const EQUIPMENT_SLOT_AFFIX_MODE = String(
  process.env.SIM_EQUIPMENT_SLOT_AFFIX_MODE || "retain"
).trim();
const AFFIXLESS_DUPLICATE_COUNT = Number(
  process.env.SIM_AFFIXLESS_DUPLICATE_COUNT || "2"
);
const AFFIXLESS_DUPLICATE_SLOT = String(
  process.env.SIM_AFFIXLESS_DUPLICATE_SLOT || ""
).trim();
const EQUIPMENT_POLICY = String(
  process.env.SIM_EQUIPMENT_POLICY || "individual-score"
).trim();
const MATCHING_DEFINITION = String(
  process.env.SIM_MATCHING_DEFINITION || "exact"
).trim();
if (!["none", "exact"].includes(SUPPORT_SUPPLY_CEILING_MODE)) {
  throw new Error(
    `SIM_SUPPORT_SUPPLY_CEILING must be none|exact: ${SUPPORT_SUPPLY_CEILING_MODE}`
  );
}
if (!["standard", "unlimited", "affixless-duplicates", "second-accessory"].includes(EQUIPMENT_SLOT_MODE)) {
  throw new Error(
    `SIM_EQUIPMENT_SLOT_MODE must be standard|unlimited|affixless-duplicates|second-accessory: ${EQUIPMENT_SLOT_MODE}`
  );
}
if (!["retain", "none"].includes(EQUIPMENT_SLOT_AFFIX_MODE)) {
  throw new Error(
    `SIM_EQUIPMENT_SLOT_AFFIX_MODE must be retain|none: ${EQUIPMENT_SLOT_AFFIX_MODE}`
  );
}
if (
  !Number.isInteger(AFFIXLESS_DUPLICATE_COUNT) ||
  AFFIXLESS_DUPLICATE_COUNT < 0 ||
  AFFIXLESS_DUPLICATE_COUNT > 20
) {
  throw new Error(
    `SIM_AFFIXLESS_DUPLICATE_COUNT must be an integer 0..20: ${AFFIXLESS_DUPLICATE_COUNT}`
  );
}
if (AFFIXLESS_DUPLICATE_SLOT && !/^[a-z]+$/.test(AFFIXLESS_DUPLICATE_SLOT)) {
  throw new Error(
    `SIM_AFFIXLESS_DUPLICATE_SLOT must be a slot id: ${AFFIXLESS_DUPLICATE_SLOT}`
  );
}
if (!["individual-score", "compatibility-aware"].includes(EQUIPMENT_POLICY)) {
  throw new Error(
    `SIM_EQUIPMENT_POLICY must be individual-score|compatibility-aware: ${EQUIPMENT_POLICY}`
  );
}
if (!["exact", "broad"].includes(MATCHING_DEFINITION)) {
  throw new Error(
    `SIM_MATCHING_DEFINITION must be exact|broad: ${MATCHING_DEFINITION}`
  );
}
const TARGET_DEPTHS = [5, 10, 15, 20];
const MAX_COMBAT_TURNS = 50;
const ENCOUNTER_GROUPS = Object.freeze([
  "beast",
  "poison",
  "undead",
  "spirit",
  "caster",
  "armor",
  "demon",
  "dragon"
]);
const ENCOUNTER_BANDS = Object.freeze(["B1-5", "B6-10", "B11-15", "B16-20"]);

function getEncounterBand(floor) {
  const index = Math.min(
    ENCOUNTER_BANDS.length - 1,
    Math.floor((Math.max(1, Number(floor) || 1) - 1) / 5)
  );
  return ENCOUNTER_BANDS[index];
}

function createEncounterGroupCounts() {
  return Object.fromEntries(
    ENCOUNTER_BANDS.map(band => [
      band,
      Object.fromEntries(ENCOUNTER_GROUPS.map(group => [group, 0]))
    ])
  );
}

function createMaterialCountsBySource() {
  return Object.fromEntries(
    ["combat", "chest", "quest", "other"].map(source => [
      source,
      Object.fromEntries(MATERIAL_TYPES.map(material => [material, 0]))
    ])
  );
}

function cloneMaterialCountsBySource(counts) {
  return Object.fromEntries(
    Object.entries(counts).map(([source, materials]) => [source, { ...materials }])
  );
}

function createCraftMeasurementCounts() {
  return Object.fromEntries(CRAFT_MEASUREMENT_RECIPE_IDS.map(recipeId => [recipeId, 0]));
}

function createTrackedConsumableSourceCounts() {
  return Object.fromEntries(TRACKED_CONSUMABLE_SOURCE_IDS.map(source => [source, 0]));
}

function countRecipeIds(recipeIds) {
  const counts = createCraftMeasurementCounts();
  (recipeIds || []).forEach(recipeId => {
    if (Object.hasOwn(counts, recipeId)) counts[recipeId]++;
  });
  return counts;
}

function recordEncounterGroups(metrics, floor, monsters) {
  if (!metrics?.encounterGroupCounts) return;
  const band = getEncounterBand(floor);
  monsters.forEach(monster => {
    const classification = getMonsterGroupClassification(monster);
    metrics.encounterGroupCounts[band][classification.group]++;
    if (classification.source !== "fallback") return;
    const name = String(monster.name || "").replace(/\s[A-Z]$/, "");
    const current = metrics.encounterFallbacks[name] || {
      name,
      tags: [...(monster.tags || [])],
      spriteType: monster.spriteType || "",
      groups: {},
      count: 0,
      minFloor: floor,
      maxFloor: floor
    };
    current.count++;
    current.groups[classification.group] = (current.groups[classification.group] || 0) + 1;
    current.minFloor = Math.min(current.minFloor, floor);
    current.maxFloor = Math.max(current.maxFloor, floor);
    metrics.encounterFallbacks[name] = current;
  });
}

const IDENTIFICATION_POLICY_DEFINITIONS = Object.freeze({
  legacy: Object.freeze({
    id: "legacy",
    label: "反実仮想（鑑定済み・呪いなし／実装外）"
  }),
  powder: Object.freeze({
    id: "powder",
    label: "実装モデル（粉があれば鑑定、なければ保持）"
  }),
  gamble: Object.freeze({
    id: "gamble",
    label: "行動反実仮想（更新候補を即着用）"
  })
});

function resolveIdentificationPolicies() {
  const requested = String(SIM_ENV.IDENTIFICATION_POLICY || "powder")
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

const IDENTIFICATION_STARTING_POWDER_INPUT = String(
  SIM_ENV.IDENTIFICATION_STARTING_POWDER || IDENTIFICATION_BALANCE.startingPowder
).trim().toLowerCase();
const IDENTIFICATION_POWDER_UNLIMITED = IDENTIFICATION_STARTING_POWDER_INPUT === "unlimited";
const IDENTIFICATION_UNLIMITED_CAP = 1_000_000;
const parsedIdentificationStartingPowder = Number(IDENTIFICATION_STARTING_POWDER_INPUT);
const IDENTIFICATION_STARTING_POWDER = IDENTIFICATION_POWDER_UNLIMITED
  ? IDENTIFICATION_UNLIMITED_CAP
  : parsedIdentificationStartingPowder;
if (
  !IDENTIFICATION_POWDER_UNLIMITED &&
  (!Number.isInteger(IDENTIFICATION_STARTING_POWDER) || IDENTIFICATION_STARTING_POWDER < 0)
) {
  throw new Error(
    `IDENTIFICATION_STARTING_POWDER must be a non-negative integer or unlimited: ${IDENTIFICATION_STARTING_POWDER_INPUT}`
  );
}

const IDENTIFICATION_COST_INPUT = String(
  SIM_ENV.IDENTIFICATION_COST_OVERRIDE || IDENTIFICATION_BALANCE.identifyCost
).trim();
const IDENTIFICATION_COST = Number(IDENTIFICATION_COST_INPUT);
if (!Number.isInteger(IDENTIFICATION_COST) || IDENTIFICATION_COST < 0) {
  throw new Error(
    `IDENTIFICATION_COST_OVERRIDE must be a non-negative integer: ${IDENTIFICATION_COST_INPUT}`
  );
}
// identifyEquipment() remains the decision path; only its source balance is varied for sim sensitivity.
IDENTIFICATION_BALANCE.identifyCost = IDENTIFICATION_COST;

function parseSimulationRateOverride(name, fallback, { max = 1 } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > max) {
    throw new Error(`${name} must be a number in [0,${max}]: ${raw}`);
  }
  return value;
}

function parseSimulationNonNegativeOverride(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number: ${raw}`);
  }
  return value;
}

// scratch-only sensitivity knobs. The default path keeps source values unchanged.
IDENTIFICATION_BALANCE.baseCurseChance = parseSimulationRateOverride(
  "SIM_CURSE_BASE_CHANCE_OVERRIDE",
  IDENTIFICATION_BALANCE.baseCurseChance
);
IDENTIFICATION_BALANCE.curseChancePerFloor = parseSimulationNonNegativeOverride(
  "SIM_CURSE_CHANCE_PER_FLOOR_OVERRIDE",
  IDENTIFICATION_BALANCE.curseChancePerFloor
);
IDENTIFICATION_BALANCE.maxCurseChance = parseSimulationRateOverride(
  "SIM_CURSE_MAX_CHANCE_OVERRIDE",
  IDENTIFICATION_BALANCE.maxCurseChance
);
IDENTIFICATION_BALANCE.coreCurseBonus = parseSimulationRateOverride(
  "SIM_CURSE_CORE_BONUS_OVERRIDE",
  IDENTIFICATION_BALANCE.coreCurseBonus
);
IDENTIFICATION_BALANCE.baseCurseDetect = parseSimulationRateOverride(
  "SIM_CURSE_DETECT_BASE_OVERRIDE",
  IDENTIFICATION_BALANCE.baseCurseDetect
);
IDENTIFICATION_BALANCE.curseDetectDecayPerFloor = parseSimulationNonNegativeOverride(
  "SIM_CURSE_DETECT_DECAY_OVERRIDE",
  IDENTIFICATION_BALANCE.curseDetectDecayPerFloor
);
IDENTIFICATION_BALANCE.minCurseDetect = parseSimulationRateOverride(
  "SIM_CURSE_DETECT_MIN_OVERRIDE",
  IDENTIFICATION_BALANCE.minCurseDetect
);
const CORE_SCORE_DROP_TOLERANCE = parseSimulationRateOverride(
  "SIM_CORE_SCORE_DROP_TOLERANCE",
  0,
  { max: 0.95 }
);
const CURSE_LOCK_MODE = process.env.SIM_CURSE_LOCK_MODE || "current";
if (!new Set(["current", "off"]).has(CURSE_LOCK_MODE)) {
  throw new Error(`SIM_CURSE_LOCK_MODE must be current or off: ${CURSE_LOCK_MODE}`);
}

// 仮値・感度分析対象: critical pathに対する寄り道込み歩数。
const EXPLORATION_FACTOR = Number(
  String(process.env.SIM_EXPLORATION_FACTOR ?? "1.4").trim()
);
if (!Number.isFinite(EXPLORATION_FACTOR) || EXPLORATION_FACTOR <= 0) {
  throw new Error(`SIM_EXPLORATION_FACTOR must be a positive number: ${process.env.SIM_EXPLORATION_FACTOR}`);
}
const FLAME_TRAP_MODEL = Object.freeze({
  floor: 5,
  chance: 0.05,
  cooldownTurns: 5,
  minDamage: 8,
  damageRolls: 9
});
// 仮値・感度分析対象: 探索係数1.4に対応し、配置宝箱の70%を拾えると置く。
const CHEST_PICKUP_RATE = 0.7;
// 仮値・感度分析対象: 戦闘1ターンを探索3歩相当と置く。
const COMBAT_TURN_WEIGHT = 3;
// 実run開始準拠: src/rules/recovery_rules.js と同じ開始傷薬数。
const INITIAL_HEAL_POTIONS = getStartingHealPotionCount();
// 実run開始準拠: 初期持ち道具は完全ゼロ。出発クラフト分は別sourceで計測する。
const INITIAL_ANTIDOTES = 0;
const INITIAL_GUARD_POTIONS = 0;
// 仮値・感度分析対象: 戦闘中/戦闘後HPが最大HPの指定割合以下なら回復する。
const HEAL_POTION_THRESHOLD_INPUT = String(
  SIM_ENV.HEAL_POTION_THRESHOLD || "0.35"
).trim();
const HEAL_POTION_THRESHOLD = Number(HEAL_POTION_THRESHOLD_INPUT);
if (
  !Number.isFinite(HEAL_POTION_THRESHOLD) ||
  HEAL_POTION_THRESHOLD < 0 ||
  HEAL_POTION_THRESHOLD > 1
) {
  throw new Error(
    `HEAL_POTION_THRESHOLD must be a number in [0,1]: ${HEAL_POTION_THRESHOLD_INPUT}`
  );
}
const MANA_POTION_THRESHOLD_INPUT = String(
  SIM_ENV.MANA_POTION_THRESHOLD || HEAL_POTION_THRESHOLD_INPUT
).trim();
const MANA_POTION_THRESHOLD = Number(MANA_POTION_THRESHOLD_INPUT);
if (
  !Number.isFinite(MANA_POTION_THRESHOLD) ||
  MANA_POTION_THRESHOLD < 0 ||
  MANA_POTION_THRESHOLD > 1
) {
  throw new Error(
    `MANA_POTION_THRESHOLD must be a number in [0,1]: ${MANA_POTION_THRESHOLD_INPUT}`
  );
}
const HEAL_PRIORITY_POLICIES = Object.freeze(["potion-first", "dios-first"]);
const BLOOD_WAND_HEAL_POLICIES = Object.freeze([
  "reserve-potion",
  "allow-recovery-potion"
]);
const FLEE_POLICIES = Object.freeze(["threshold", "never", "ev"]);
const DEFAULT_HEAL_PRIORITY_POLICY = "potion-first";
const DEFAULT_BLOOD_WAND_HEAL_POLICY = "reserve-potion";
if (!FLEE_POLICIES.includes(SIM_ENV.FLEE_POLICY)) {
  throw new Error(`FLEE_POLICY must be ${FLEE_POLICIES.join("|")}: ${SIM_ENV.FLEE_POLICY}`);
}
const DEFAULT_FLEE_POLICY = SIM_ENV.FLEE_POLICY;
// 仮値・感度分析対象: 最大HPの指定割合以下なら次の自ターンで逃走する。
const DEFAULT_FLEE_HP_THRESHOLD = DEFAULT_FLEE_POLICY === "never"
  ? null
  : Math.max(0, Math.min(1, Number(SIM_ENV.FLEE_HP_THRESHOLD || 0.35)));
const DEFAULT_STATUS_CURE_HP_THRESHOLD = Math.max(
  0,
  Math.min(1, Number(SIM_ENV.STATUS_CURE_HP_THRESHOLD || 1))
);
const DEFAULT_STATUS_CURE_POLICY = SIM_ENV.STATUS_CURE_POLICY === "never"
  ? "never"
  : "smart";
const DEFAULT_STATUS_CURE_MERCHANT_POLICY =
  SIM_ENV.STATUS_CURE_MERCHANT_POLICY === "never" ? "never" : "missing";

export function parseHealPotionMerchantPolicy(value) {
  const policy = String(value || "missing").trim();
  if (policy === "never") {
    return { id: "never", maxPurchases: 0 };
  }
  if (policy === "missing") {
    return { id: "missing", maxPurchases: 1 };
  }
  const match = /^up-to-(\d+)$/.exec(policy);
  const maxPurchases = match ? Number(match[1]) : NaN;
  if (!Number.isInteger(maxPurchases) || maxPurchases < 0 || maxPurchases > 20) {
    throw new Error(
      `HEAL_POTION_MERCHANT_POLICY must be never|missing|up-to-0..20: ${policy}`
    );
  }
  return { id: policy, maxPurchases };
}

const DEFAULT_HEAL_POTION_MERCHANT_POLICY = String(
  SIM_ENV.HEAL_POTION_MERCHANT_POLICY || "missing"
).trim();
parseHealPotionMerchantPolicy(DEFAULT_HEAL_POTION_MERCHANT_POLICY);

function parseOptionalMerchantInventoryLimit(value) {
  if (value === undefined || value === null || value === "") return null;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 0 || limit > 20) {
    throw new Error(`healPotionMerchantHoldLimit must be an integer 0..20: ${value}`);
  }
  return limit;
}

function parseOptionalChance(value, name = "chestHealPotionExtraChance") {
  if (value === undefined || value === null || value === "") return null;
  const chance = Number(value);
  if (!Number.isFinite(chance) || chance < 0 || chance > 1) {
    throw new Error(`${name} must be a number in [0,1]: ${value}`);
  }
  return chance;
}

function parseOptionalFloorList(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error(`extraCampFloors must be an integer array: ${value}`);
  }
  const floors = [...new Set(value)];
  if (floors.some(floor => !Number.isInteger(floor) || floor < 1 || floor > 25)) {
    throw new Error(`extraCampFloors must contain integers 1..25: ${value}`);
  }
  return floors;
}

const ISSUE646_CAMP_LEVEL_DEFINITIONS = Object.freeze({
  "1": Object.freeze([]),
  "2": Object.freeze([7, 12, 17, 22]),
  "3": Object.freeze([5, 10, 15, 20])
});
const ISSUE646_CAMP_LEVEL = String(SIM_ENV.SIM_ISSUE646_CAMP_LEVEL || "").trim();
if (ISSUE646_CAMP_LEVEL && !Object.hasOwn(ISSUE646_CAMP_LEVEL_DEFINITIONS, ISSUE646_CAMP_LEVEL)) {
  throw new Error(`SIM_ISSUE646_CAMP_LEVEL must be 1|2|3: ${ISSUE646_CAMP_LEVEL}`);
}
const ISSUE646_EXTRA_CAMP_FLOORS = ISSUE646_CAMP_LEVEL
  ? ISSUE646_CAMP_LEVEL_DEFINITIONS[ISSUE646_CAMP_LEVEL]
  : null;
const DEFAULT_ELITE_POLICY = SIM_ENV.ELITE_POLICY === "engage" ? "engage" : "avoid";
const LEGACY_FLOOR_DISARM_MIN_RATE = 50;
const LEGACY_CHEST_DISARM_MIN_CHANCE = 0.50;
const TRAP_POLICY_DEFINITIONS = Object.freeze({
  disabled: Object.freeze({
    id: "disabled",
    label: "旧sim互換（罠効果なし）"
  }),
  legacy: Object.freeze({
    id: "legacy",
    label: "旧解除方針（罠効果あり・50%）",
    floorDisarmMinRate: LEGACY_FLOOR_DISARM_MIN_RATE
  }),
  conservative: Object.freeze({
    id: "conservative",
    label: "EV分岐（床罠・宝箱、キット温存価値を含む）"
  })
});
// 未指定時は宝箱だけ旧50%へ戻し、床罠は#341のEV既定を維持する。
export const DEFAULT_TRAP_POLICY_ID = SIM_ENV.TRAP_POLICY || "legacy";
export const DEFAULT_FLOOR_TRAP_POLICY_ID =
  EXPLICIT_TRAP_POLICY_ID || "conservative";
if (!TRAP_POLICY_DEFINITIONS[DEFAULT_TRAP_POLICY_ID]) {
  throw new Error(
    `TRAP_POLICY must be disabled|legacy|conservative: ${DEFAULT_TRAP_POLICY_ID}`
  );
}
if (!TRAP_POLICY_DEFINITIONS[DEFAULT_FLOOR_TRAP_POLICY_ID]) {
  throw new Error(
    `floor trap policy must be disabled|legacy|conservative: ${DEFAULT_FLOOR_TRAP_POLICY_ID}`
  );
}
const TRAP_AVOIDANCE_POLICY_DEFINITIONS = Object.freeze({
  legacy: Object.freeze({
    id: "legacy",
    label: "旧方針（迂回路があれば無条件回避）"
  }),
  ev: Object.freeze({
    id: "ev",
    label: "回避EV（追加遭遇被害と直接対応を比較）"
  })
});
export const DEFAULT_TRAP_AVOIDANCE_POLICY_ID =
  SIM_ENV.TRAP_AVOIDANCE_POLICY || "ev";
if (!TRAP_AVOIDANCE_POLICY_DEFINITIONS[DEFAULT_TRAP_AVOIDANCE_POLICY_ID]) {
  throw new Error(
    `TRAP_AVOIDANCE_POLICY must be legacy|ev: ${DEFAULT_TRAP_AVOIDANCE_POLICY_ID}`
  );
}
const trapBonusOverrideInput = process.env.TRAP_BONUS_OVERRIDE;
const TRAP_BONUS_OVERRIDE_PERCENT = trapBonusOverrideInput === undefined
  ? null
  : Number(trapBonusOverrideInput);
if (
  TRAP_BONUS_OVERRIDE_PERCENT !== null &&
  (!Number.isFinite(TRAP_BONUS_OVERRIDE_PERCENT) || TRAP_BONUS_OVERRIDE_PERCENT < 0)
) {
  throw new Error(`TRAP_BONUS_OVERRIDE must be a non-negative number: ${trapBonusOverrideInput}`);
}
const trapDamageMultiplierInput = SIM_ENV.TRAP_DAMAGE_MULTIPLIER;
const TRAP_DAMAGE_MULTIPLIER = Number(trapDamageMultiplierInput);
if (!Number.isFinite(TRAP_DAMAGE_MULTIPLIER) || TRAP_DAMAGE_MULTIPLIER < 0) {
  throw new Error(
    `TRAP_DAMAGE_MULTIPLIER must be a non-negative number: ${trapDamageMultiplierInput}`
  );
}
const CHEST_DISARM_REPRESENTATIVE_THRESHOLD = calculateChestDisarmEvThreshold();
// 仮値・感度分析対象: 危険域で傷薬が尽きていれば帰還の翼を使う。
const PORTAL_HP_THRESHOLD = Number(SIM_ENV.PORTAL_HP_THRESHOLD || 0.35);
const PORTAL_MAX_HEAL_POTIONS = Math.max(
  0,
  Number(SIM_ENV.PORTAL_MAX_HEAL_POTIONS || 0)
);
const PORTAL_MIN_FLOOR = Math.max(1, Number(SIM_ENV.PORTAL_MIN_FLOOR || 3));
// sim-only safety policy; payment eligibility remains owned by getSpellPayment.
const bloodWandHpPaymentMinRateInput = Number(SIM_ENV.BLOOD_WAND_HP_PAYMENT_MIN_RATE);
const BLOOD_WAND_HP_PAYMENT_MIN_RATE = Number.isFinite(bloodWandHpPaymentMinRateInput)
  ? Math.max(0, Math.min(1, bloodWandHpPaymentMinRateInput))
  : 0.50;
const REQUESTED_DEPARTURE_CRAFT_IDS = String(SIM_ENV.DEPARTURE_CRAFT_IDS || "")
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);
const ACTIVE_DEPARTURE_CRAFT_IDS = [...REQUESTED_DEPARTURE_CRAFT_IDS];
const WORKSHOP_STATE_RANKS = Object.freeze({
  empty: Object.freeze({}),
  stats: Object.freeze({
    stat_str: 4,
    stat_int: 1,
    stat_vit: 3,
    stat_agi: 1,
    stat_luk: 1
  }),
  statsWithConvenience: Object.freeze({
    stat_str: 4,
    stat_int: 1,
    stat_vit: 3,
    stat_agi: 1,
    stat_luk: 1,
    convenience_identify_powder: 1
  }),
  gear: Object.freeze({
    gear_rapier: 1,
    gear_fighter_saber: 1,
    stat_str: 5,
    stat_int: 2,
    stat_pie: 2,
    stat_vit: 5,
    stat_agi: 2,
    stat_luk: 3
  }),
  gearWithPure: Object.freeze({
    gear_rapier: 1,
    gear_fighter_saber: 1,
    convenience_identify_powder: 1,
    stat_str: 5,
    stat_int: 2,
    stat_pie: 2,
    stat_vit: 5,
    stat_agi: 2,
    stat_luk: 3
  }),
  bloodWand: Object.freeze({
    gear_rapier: 1,
    pool_blood_wand: 1,
    stat_str: 5,
    stat_int: 4,
    stat_pie: 4,
    stat_vit: 5,
    stat_agi: 4,
    stat_luk: 5
  }),
  bloodWandDeepSpells: Object.freeze({
    gear_rapier: 1,
    gear_sage_staff: 1,
    pool_blood_wand: 1,
    pool_deep_spells: 1,
    stat_str: 5,
    stat_int: 5,
    stat_pie: 3,
    stat_vit: 5,
    stat_agi: 5,
    stat_luk: 5
  }),
  corePools: Object.freeze({
    gear_rapier: 1,
    pool_blood_wand: 1,
    pool_opener: 1,
    pool_trap_eater: 1,
    pool_giant_slayer: 1,
    pool_thorn_shield: 1,
    pool_tomb_raider: 1,
    pool_scholar_eye: 1,
    stat_str: 5,
    stat_int: 4,
    stat_pie: 4,
    stat_vit: 5,
    stat_agi: 4,
    stat_luk: 5
  }),
  complete: Object.freeze({
    gear_rapier: 1,
    gear_sage_staff: 1,
    gear_fighter_saber: 1,
    pool_blood_wand: 1,
    pool_deep_spells: 1,
    pool_opener: 1,
    pool_trap_eater: 1,
    pool_giant_slayer: 1,
    pool_thorn_shield: 1,
    pool_tomb_raider: 1,
    pool_scholar_eye: 1,
    convenience_identify_powder: 1,
    stat_str: 5,
    stat_int: 5,
    stat_pie: 5,
    stat_vit: 5,
    stat_agi: 5,
    stat_luk: 5
  })
});

// #343: progression simの実観測stateから選んだ代表値。ゲーム設計値の変更ではない。
const SCENARIOS = Object.freeze([
  {
    id: "workshop-empty",
    label: "工房空",
    workshop: { ranks: WORKSHOP_STATE_RANKS.empty },
    useTownPortal: true
  },
  {
    id: "workshop-stats",
    label: "工房ステータス投資中",
    workshop: { ranks: WORKSHOP_STATE_RANKS.stats },
    useTownPortal: true
  },
  {
    id: "workshop-stats-plus-convenience",
    label: "工房ステータス＋鑑定粉備蓄",
    workshop: { ranks: WORKSHOP_STATE_RANKS.statsWithConvenience },
    useTownPortal: true
  },
  {
    id: "workshop-gear",
    label: "工房初期装備解放済み",
    workshop: { ranks: WORKSHOP_STATE_RANKS.gear },
    useTownPortal: true
  },
  {
    id: "workshop-gear-with-pure",
    label: "工房初期装備＋純増",
    workshop: { ranks: WORKSHOP_STATE_RANKS.gearWithPure },
    useTownPortal: true
  },
  {
    id: "workshop-blood-wand",
    label: "工房血杖解放済み",
    workshop: { ranks: WORKSHOP_STATE_RANKS.bloodWand },
    useTownPortal: true
  },
  {
    id: "workshop-blood-wand-spells",
    label: "工房血杖・深層呪文解放済み",
    workshop: { ranks: WORKSHOP_STATE_RANKS.bloodWandDeepSpells },
    useTownPortal: true
  },
  {
    id: "workshop-core-pools",
    label: "工房コアプール拡張投資中",
    workshop: { ranks: WORKSHOP_STATE_RANKS.corePools },
    useTownPortal: true
  },
  {
    id: "workshop-complete",
    label: "工房買い切り済み",
    workshop: { ranks: WORKSHOP_STATE_RANKS.complete },
    useTownPortal: true
  },
  {
    id: "workshop-empty-no-portal",
    label: "工房空・翼なし",
    workshop: { ranks: WORKSHOP_STATE_RANKS.empty },
    workshopReturnItem: null,
    useTownPortal: true
  },
  {
    id: "legacy-no-portal",
    label: "従来(翼不使用)",
    workshop: { ranks: WORKSHOP_STATE_RANKS.empty },
    workshopReturnItem: null,
    useTownPortal: false
  }
]);
const DEPTH_SCENARIOS = ISSUE646_EXTRA_CAMP_FLOORS === null
  ? SCENARIOS
  : Object.freeze(SCENARIOS.map(scenario => ({
    ...scenario,
    extraCampFloors: ISSUE646_EXTRA_CAMP_FLOORS
  })));
const DEFAULT_DEPTH_SCENARIO_IDS = new Set([
  "workshop-empty",
  "workshop-stats",
  "workshop-gear",
  "workshop-blood-wand",
  "workshop-blood-wand-spells",
  "workshop-core-pools",
  "workshop-complete"
]);
const SCENARIO_ALIASES = Object.freeze({
  "workshop-locked": "workshop-empty-no-portal",
  "workshop-unlocked": "workshop-empty"
});
const SCENARIO_BY_ID = new Map(DEPTH_SCENARIOS.map(scenario => [scenario.id, scenario]));
const REFERENCE_SCENARIO_IDS = Object.freeze([
  "workshop-empty-no-portal",
  "workshop-empty",
  "legacy-no-portal"
]);
const REFERENCE_SCENARIOS = Object.freeze(
  REFERENCE_SCENARIO_IDS.map(scenarioId => SCENARIO_BY_ID.get(scenarioId))
);

function warnDeprecatedScenarioId(scenarioId) {
  if (!Object.hasOwn(SCENARIO_ALIASES, scenarioId) || !isMainThread) return;
  console.warn(
    `[deprecated] scenarioId=${scenarioId} は ${SCENARIO_ALIASES[scenarioId]} の旧ID。` +
    "警告の上で同一挙動へ移行する。新IDへ移行すること。"
  );
}

export function getScenarioById(scenarioId) {
  warnDeprecatedScenarioId(scenarioId);
  const resolvedId = SCENARIO_ALIASES[scenarioId] || scenarioId;
  const scenario = SCENARIO_BY_ID.get(resolvedId);
  if (!scenario) throw new Error(`unknown scenarioId: ${scenarioId}`);
  return scenario;
}
const REQUESTED_SCENARIO_IDS = new Set(
  String(SIM_ENV.SIM_SCENARIOS || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean)
);
const DEPRECATED_SCENARIO_IDS = [...REQUESTED_SCENARIO_IDS]
  .filter(id => Object.hasOwn(SCENARIO_ALIASES, id));
if (isMainThread) {
  DEPRECATED_SCENARIO_IDS.forEach(id => {
    warnDeprecatedScenarioId(id);
  });
}
const RESOLVED_SCENARIO_IDS = new Set(
  [...REQUESTED_SCENARIO_IDS].map(id => SCENARIO_ALIASES[id] || id)
);
const ACTIVE_SCENARIOS = REQUESTED_SCENARIO_IDS.size === 0
  ? DEPTH_SCENARIOS.filter(scenario => DEFAULT_DEPTH_SCENARIO_IDS.has(scenario.id))
  : DEPTH_SCENARIOS.filter(scenario => RESOLVED_SCENARIO_IDS.has(scenario.id));
const SIM_CLASSES = SOLO_CLASSES.filter(className => !ELITE_CLASSES.includes(className));
const CRAFT_MEASUREMENT_RECIPE_IDS = Object.freeze([
  "MANA_POTION",
  "HEAL_POTION",
  "GREATER_HEAL",
  "HOLY_WATER"
]);
const TRACKED_CONSUMABLE_SOURCE_IDS = Object.freeze([
  "starting",
  "departureCraft",
  "chest",
  "merchant",
  "other"
]);
const MAGIC_SHARD = "魔石片";
const ENABLED_CORE_AFFIXES = CORE_AFFIXES.filter(affix => affix.enabled);
const CORE_AFFIX_IDS = new Set(ENABLED_CORE_AFFIXES.map(affix => affix.id));
const ALL_CORE_AFFIX_IDS = ENABLED_CORE_AFFIXES.map(affix => affix.id);
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
// #443の測定定義。ゲームルールではなく、core+対応support endpoint用。
const CORE_SUPPORT_SYNERGY = Object.freeze({
  CORE_LAST_STAND: ["hp", "vit", "guardian", "killHeal"],
  CORE_OPENER: ["firstStrike", "firstTurnAttack", "fullHpDamage", "followUp"],
  CORE_BLOOD_WAND: ["hp", "vit", "int", "pie", "arcane", "devotion"],
  CORE_PURIFY_RING: ["antiUndead", "antiDemon", "arcane", "devotion"],
  CORE_TRAP_EATER: ["trapBonus"],
  CORE_CURSE_KEEPER: [],
  CORE_GIANT_SLAYER: ["antiDragon", "antiBeast", "antiSpirit"],
  CORE_THORN_SHIELD: ["guardian", "def", "vit", "hitFlinch"],
  CORE_EXECUTIONER: []
});
const ENABLED_SUPPORT_AFFIXES = SUPPORT_AFFIXES.filter(affix => affix.enabled);
const ALL_ENABLED_SUPPORT_IDS = ENABLED_SUPPORT_AFFIXES.map(affix => affix.id);
const MATCHING_SUPPORT_BONUS = 1000;
// 素材1個のrun EVを装備score 1点へ換算する感度分析用の基準。
const MATERIAL_EV_SCORE_WEIGHT = 1;
// 盗掘王の素材EVは、罠被害を測定する既定経路でも感度分析として50%割引を残す。
const TOMB_RAIDER_TRAP_RISK_DISCOUNT = 0.5;

const CORE_ACTIVATION_MEASUREMENT_NOTES = Object.freeze({
  CORE_REARGUARD: "設計上無効: 既存セーブ互換用 tombstone"
});
const CORE_SCORING_COVERAGE_NOTES = Object.freeze({
  CORE_CURSE_KEEPER:
    "getBaseEquipmentScore→getCharStr/Vit/Int/Pie/Agi→getCharAllStatsAffixBonusで実効果を一度だけ反映",
  CORE_SNEAK_STEP:
    "getPerceptionIntentの実適用を別計測。combat scoreへ任意のscalarは加えず、economy core保持閾値95%を適用",
  CORE_TOMB_RAIDER:
    "getEconomyCoreScoreへ実params.materialBonus×宝箱EV×罠risk割引を反映",
  CORE_KEEN_EYE:
    "activeな慧眼下のgetEquippedItemDataで未鑑定装備の実statsをcandidate scoreへ反映。core自体は95%保持閾値"
});
const PASSIVE_CORE_IDS = new Set([
  "CORE_SNEAK_STEP",
  "CORE_CURSE_KEEPER",
  "CORE_TOMB_RAIDER",
  "CORE_KEEN_EYE",
  "CORE_TRAP_EATER"
]);

function createCoreMeasurementCounts() {
  return Object.fromEntries(CORE_AFFIXES.map(affix => [affix.id, 0]));
}
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
    bloodWandActiveRounds: 0,
    bloodWandMpEmptyRounds: 0,
    bloodWandSelectedSpellRounds: 0,
    bloodWandNoEligibleSpellRounds: 0,
    bloodWandMpInsufficientRounds: 0,
    bloodWandHpPaymentReturns: 0,
    bloodWandHpPaymentCanCast: 0,
    bloodWandSpellOpportunities: 0,
    bloodWandHealOpportunities: 0,
    bloodWandSpellActivations: 0,
    bloodWandHealActivations: 0,
    purifyKillsWithMpRoom: 0,
    purifyPotentialMpRecovered: 0,
    purifyPotentialHpRecovered: 0,
    purifyMpRecovered: 0,
    purifyHpRecovered: 0,
    purifyEffectEvents: 0,
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
    equippedCurseTotal: 0,
    curseKeeperStrGainTotal: 0,
    curseKeeperStrGainCases: 0,
    sneakStepReducedDetectionCases: 0,
    keenEyeEffectApplications: 0,
    keenEyeEffectDelta: {
      atk: 0,
      def: 0,
      hpBonus: 0,
      mpBonus: 0,
      str: 0,
      int: 0,
      pie: 0,
      vit: 0,
      agi: 0,
      luk: 0,
      trapBonus: 0,
      spellGuard: 0,
      firstStrike: 0,
      antiUndead: 0,
      antiDragon: 0
    },
    tombRaiderMaterialBonusTotal: 0,
    trapEaterAttackGainTotal: 0,
    coreOpportunityCounts: createCoreMeasurementCounts(),
    coreActivationCounts: createCoreMeasurementCounts()
  };
}

function getSimulationTrapOverride(state) {
  return state?.simPolicy?.trapOverride || null;
}

function getSimulationTrapBonus(character, state = null) {
  if (state?.simPolicy?.ignoreThiefSustain && character?.class === "Thief") {
    return 0;
  }
  const actual = Math.max(0, getCharTrapBonus(character));
  const exposureValue = Number(state?.simPolicy?.trapBonusExposureValue || 0);
  if (state?.simPolicy?.trapBonusExposureApplied && exposureValue > 0) {
    return Math.max(actual, exposureValue / 100);
  }
  const override = getSimulationTrapOverride(state)?.trapBonus;
  const overrideApplies = override &&
    (!getSimulationTrapOverride(state)?.className ||
      getSimulationTrapOverride(state).className === character?.class);
  if (overrideApplies && actual > 0) {
    const multiplier = Number(override.multiplier);
    if (Number.isFinite(multiplier) && multiplier >= 0) {
      return actual * multiplier;
    }
  }
  const trapBonus = TRAP_BONUS_OVERRIDE_PERCENT === null
    ? actual
    : TRAP_BONUS_OVERRIDE_PERCENT / 100;
  return trapBonus;
}

function getSimulationTrapParty(state) {
  if (!state?.simPolicy?.ignoreThiefSustain) return state.party;
  return state.party.map(character => character?.class === "Thief"
    ? { ...character, class: "Fighter" }
    : character
  );
}

function getSimulationDetectRate(state, floor) {
  if (state.simPolicy.floorTrapDetection === "certain") {
    return { rate: 1, cap: 1, scoutBonus: 0 };
  }
  return {
    rate: calculateDetectRate({ floor, scoutBonus: 0 }),
    cap: 1,
    scoutBonus: 0
  };
}

function getSimulationTrapBonusMax(character, state = null) {
  const override = getSimulationTrapOverride(state)?.trapBonus;
  const overrideApplies = override &&
    (!getSimulationTrapOverride(state)?.className ||
      getSimulationTrapOverride(state).className === character?.class);
  const apt = !(state?.simPolicy?.ignoreThiefSustain && character?.class === "Thief") &&
    isDisarmAptClass(character?.class);
  const value = overrideApplies ? (apt ? override?.maxApt : override?.maxNonApt) : null;
  return Number.isFinite(Number(value))
    ? Math.max(0, Number(value))
    : apt ? 90 : 60;
}

function calculateSimulationFloorTrapSuccessRate({
  state,
  trap,
  className,
  level,
  floor,
  affixBonus
} = {}) {
  const trapOverride = getSimulationTrapOverride(state);
  const override = trapOverride?.trapBonus;
  const overrideApplies = override &&
    (!trapOverride?.className || trapOverride.className === className);
  if (!overrideApplies || (!Object.hasOwn(override, "maxApt") &&
    !Object.hasOwn(override, "maxNonApt"))) {
    return calculateFloorTrapSuccessRate({
      trap,
      className,
      level,
      floor,
      affixBonus
    });
  }
  const apt = !(state?.simPolicy?.ignoreThiefSustain && className === "Thief") &&
    isDisarmAptClass(className);
  const base = apt ? 80 : 40;
  const levelGain = apt ? Math.max(1, Math.floor(Number(level) || 1)) :
    Math.max(1, Math.floor(Number(level) || 1)) * 0.5;
  const depthLoss = (Math.max(1, Math.floor(Number(floor) || 1)) - 1) * 2.0;
  const min = apt ? 20 : 5;
  const max = getSimulationTrapBonusMax({ class: className }, state);
  const raw = base + levelGain - depthLoss + (Number(affixBonus) || 0);
  const rate = Math.round(Math.max(min, Math.min(max, raw)));
  return trap?.type === "pitfall" ? Math.min(100, rate + 20) : rate;
}

function getFloorDisarmPolicyThreshold(state, trap) {
  const policy = TRAP_POLICY_DEFINITIONS[state.simPolicy.trapPolicy];
  if (Number.isFinite(policy.floorDisarmMinRate)) {
    return policy.floorDisarmMinRate;
  }
  return calculateFloorDisarmEvThreshold({
    trapType: trap?.type,
    scoutMitigated: hasTrapScout(getSimulationTrapParty(state))
  });
}

function getExpectedNormalCombatDamage(metrics) {
  const encounters = metrics.normalCombatTelemetry.encounters;
  if (encounters <= 0) return null;
  return metrics.normalCombatTelemetry.incomingDamage / encounters;
}

function getFloorTrapExpectedDamageForAction(state, trap, floor, weakened) {
  const effectFloor = trap.type === "pitfall" ? floor + 1 : floor;
  return calculateFloorTrapExpectedDamage({
    trap,
    floor: effectFloor,
    party: getSimulationTrapParty(state),
    weakened
  }).reduce((sum, damage) => sum + damage, 0);
}

function getFloorTrapActionPlan(state, trap, floor) {
  const character = state.party[0];
  const trapBonus = getSimulationTrapBonus(character, state);
  const successRate = calculateSimulationFloorTrapSuccessRate({
    state,
    trap,
    className: character.class,
    level: character.level,
    floor,
    affixBonus: Math.round(trapBonus * 100)
  });
  const baseSuccessRate = calculateSimulationFloorTrapSuccessRate({
    state,
    trap: trap.type === "pitfall" ? { ...trap, type: "damage" } : trap,
    className: character.class,
    level: character.level,
    floor,
    affixBonus: Math.round(trapBonus * 100)
  });
  const action = successRate >= getFloorDisarmPolicyThreshold(state, trap)
    ? "disarm"
    : "force";
  const fullDamage = getFloorTrapExpectedDamageForAction(state, trap, floor, false);
  const weakenedDamage = getFloorTrapExpectedDamageForAction(state, trap, floor, true);
  return {
    action,
    successRate,
    baseSuccessRate,
    maxRate: getSimulationTrapBonusMax(character, state),
    trapBonus,
    expectedDamage: calculateFloorTrapActionExpectedDamage({
      action,
      trapType: trap.type,
      successRate,
      fullDamage,
      weakenedDamage
    })
  };
}

function getTrapAvoidanceEvaluation(state, trap, floor, step, avoidance, metrics) {
  const extraSteps = Math.max(0, Math.floor(Number(avoidance.extraSteps) || 0));
  const encounterChances = Array.from(
    { length: extraSteps },
    (_, index) => getEncounterChance(step + index + 1, state)
  );
  const actionPlan = getFloorTrapActionPlan(state, trap, floor);
  const evaluation = calculateFloorTrapAvoidanceEv({
    encounterChances,
    expectedDamagePerEncounter: getExpectedNormalCombatDamage(metrics),
    directExpectedDamage: actionPlan.expectedDamage
  });
  return { ...evaluation, actionPlan, extraSteps };
}

function createTrapAggregate() {
  return {
    runs: 0,
    encounters: 0,
    encountersBySource: { chest: 0, floor: 0 },
    activations: 0,
    damageHp: 0,
    healPotionsUsed: 0,
    greaterHealPotionsUsed: 0,
    recoveryPotionsUsed: 0,
    recoveryPotionShortages: 0,
    healPotionShortages: 0,
    disarms: 0,
    disarmAttempts: 0,
    disarmSuccesses: 0,
    detectionAttempts: 0,
    avoided: 0,
    forced: 0,
    avoidanceExtraSteps: 0,
    avoidanceCandidates: 0,
    avoidanceRejected: 0,
    avoidanceNoEstimate: 0,
    avoidanceExpectedEncounterCount: 0,
    avoidanceExpectedEncounterDamage: 0,
    avoidanceExpectedDirectDamage: 0,
    kitsAcquired: 0,
    kitsUsed: 0,
    trapKitsAcquiredBySource: {
      starting: 0,
      departureCraft: 0,
      chest: 0,
      other: 0
    },
    trapKitsConsumedBySource: {
      starting: 0,
      departureCraft: 0,
      chest: 0,
      other: 0
    },
    detections: 0,
    detectionCapHits: 0,
    disarmCapHits: 0,
    planEvaluations: 0,
    runsWithHealPotionShortage: 0,
    combatDamageHp: 0,
    stairsHealingHp: 0,
    campHealingHp: 0,
    diosHealingHp: 0,
    healPotionsAcquiredBySource: {
      starting: 0,
      departureCraft: 0,
      chest: 0,
      merchant: 0,
      other: 0
    },
    healPotionsConsumedBySource: {
      starting: 0,
      departureCraft: 0,
      chest: 0,
      merchant: 0,
      other: 0
    },
    greaterHealPotionsAcquiredBySource: {
      starting: 0,
      departureCraft: 0,
      chest: 0,
      merchant: 0,
      other: 0
    },
    greaterHealPotionsConsumedBySource: {
      starting: 0,
      departureCraft: 0,
      chest: 0,
      merchant: 0,
      other: 0
    },
    manaPotionsAcquiredBySource: createTrackedConsumableSourceCounts(),
    manaPotionsConsumedBySource: createTrackedConsumableSourceCounts(),
    holyWaterAcquiredBySource: createTrackedConsumableSourceCounts(),
    holyWaterConsumedBySource: createTrackedConsumableSourceCounts(),
    departureCraftCraftedByRecipe: createCraftMeasurementCounts(),
    departureCraftPotentialByRecipe: createCraftMeasurementCounts(),
    departureCraftCraftedRunsByRecipe: createCraftMeasurementCounts(),
    departureCraftPotentialRunsByRecipe: createCraftMeasurementCounts(),
    materialSourceCounts: createMaterialCountsBySource(),
    materialCompetition: {
      shardBalanceBeforeDeparture: 0,
      weaponEnhancementAffordable: 0,
      affordableWorkshopNodeCount: 0,
      simulatedWeaponEnhancementShardSpend: 0,
      simulatedWorkshopNodeShardSpend: 0
    },
    healPotionMerchantAttempts: 0,
    healPotionMerchantFailures: {}
  };
}

function createFlameTrapAggregate() {
  return {
    runs: 0,
    activations: 0,
    damageHp: 0,
    deaths: 0,
    eligibleSteps: 0,
    warningAvoided: 0
  };
}

function addFlameTrapAggregate(target, result) {
  target.runs++;
  target.activations += result.flameTrapActivations;
  target.damageHp += result.flameTrapDamageHp;
  target.deaths += result.flameTrapDeaths;
  target.eligibleSteps += result.flameTrapEligibleSteps;
  target.warningAvoided += result.flameTrapWarningAvoided;
}

function finalizeFlameTrapAggregate(aggregate) {
  const runs = Math.max(1, aggregate.runs);
  return {
    runs: aggregate.runs,
    averageFlameTrapActivations: aggregate.activations / runs,
    averageFlameTrapDamageHp: aggregate.damageHp / runs,
    averageFlameTrapDeaths: aggregate.deaths / runs,
    averageFlameTrapEligibleSteps: aggregate.eligibleSteps / runs,
    averageFlameTrapWarningAvoided: aggregate.warningAvoided / runs
  };
}

function summarizeDistribution(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return { n: 0 };
  const quantile = rate => sorted[Math.floor((sorted.length - 1) * rate)];
  return {
    n: sorted.length,
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    min: sorted[0],
    p10: quantile(0.10),
    p25: quantile(0.25),
    median: quantile(0.50),
    p75: quantile(0.75),
    p90: quantile(0.90),
    max: sorted.at(-1)
  };
}

function createB5GateAggregate() {
  return {
    runs: 0,
    entrants: 0,
    breakthroughs: 0,
    deaths: 0,
    retreats: 0,
    activations: 0,
    damageHp: 0,
    warningAvoided: 0,
    eligibleSteps: 0,
    entrantHp: [],
    entrantHpRate: [],
    minimumHp: [],
    minimumPositiveHp: [],
    minimumPositiveHpRate: [],
    directDeaths: 0,
    deathsAfterFlame: 0,
    deathsWithoutFlame: 0,
    deathsAfterFlameWithinFiveSteps: 0,
    deathCauseCounts: {}
  };
}

function addB5GateAggregate(target, result) {
  target.runs++;
  if (!result.b5Entrant) return;
  target.entrants++;
  target.activations += result.flameTrapActivations;
  target.damageHp += result.flameTrapDamageHp;
  target.warningAvoided += result.flameTrapWarningAvoided;
  target.eligibleSteps += result.flameTrapEligibleSteps;
  target.entrantHp.push(result.b5EntrantHp);
  target.entrantHpRate.push(result.b5EntrantHpRate);
  target.minimumHp.push(result.b5MinimumHp);
  target.minimumPositiveHp.push(result.b5MinimumPositiveHp);
  target.minimumPositiveHpRate.push(result.b5MinimumPositiveHpRate);

  if (result.deathFloor === 5) {
    target.deaths++;
  } else if (result.reachedFloor > 5) {
    target.breakthroughs++;
  } else if (result.survived) {
    target.retreats++;
  }
  if (result.deathFloor !== 5) return;
  const cause = result.b5DeathCause || "不明";
  target.deathCauseCounts[cause] = (target.deathCauseCounts[cause] || 0) + 1;
  if (cause === "火炎の罠") {
    target.directDeaths++;
  } else if (result.flameTrapActivations > 0) {
    target.deathsAfterFlame++;
    target.deathsAfterFlameWithinFiveSteps += Number(
      result.b5DeathAfterFlameWithinFiveSteps
    );
  } else {
    target.deathsWithoutFlame++;
  }
}

function finalizeB5GateAggregate(aggregate) {
  const runs = Math.max(1, aggregate.runs);
  const entrants = Math.max(1, aggregate.entrants);
  return {
    runs: aggregate.runs,
    entrants: aggregate.entrants,
    entrantRate: aggregate.entrants / runs,
    breakthroughRuns: aggregate.breakthroughs,
    deathRuns: aggregate.deaths,
    retreatRuns: aggregate.retreats,
    breakthroughRate: aggregate.breakthroughs / entrants,
    deathRate: aggregate.deaths / entrants,
    retreatRate: aggregate.retreats / entrants,
    averageFlameTrapActivations: aggregate.activations / entrants,
    averageFlameTrapDamageHp: aggregate.damageHp / entrants,
    averageFlameTrapWarningAvoided: aggregate.warningAvoided / entrants,
    averageFlameTrapEligibleSteps: aggregate.eligibleSteps / entrants,
    averageFlameTrapEligibleStepsAllRuns: aggregate.eligibleSteps / runs,
    entrantHp: summarizeDistribution(aggregate.entrantHp),
    entrantHpRate: summarizeDistribution(aggregate.entrantHpRate),
    minimumHp: summarizeDistribution(aggregate.minimumHp),
    minimumPositiveHp: summarizeDistribution(aggregate.minimumPositiveHp),
    minimumPositiveHpRate: summarizeDistribution(aggregate.minimumPositiveHpRate),
    directDeaths: aggregate.directDeaths,
    deathsAfterFlame: aggregate.deathsAfterFlame,
    deathsWithoutFlame: aggregate.deathsWithoutFlame,
    deathsAfterFlameWithinFiveSteps: aggregate.deathsAfterFlameWithinFiveSteps,
    deathCauseCounts: { ...aggregate.deathCauseCounts }
  };
}

function createOutcomeAggregate() {
  return {
    runs: 0,
    survived: 0,
    died: 0,
    reachedFloor: 0,
    entrantsByFloor: Array(21).fill(0),
    deathsByFloor: Array(21).fill(0),
    retreatsByFloor: Array(21).fill(0),
    terminationReasons: {},
    finalHp: [],
    finalHpRate: [],
    finalMp: [],
    finalMpRate: [],
    mpBlockedTerminalEncounterRuns: 0,
    mpDepletionCausedEndRuns: 0,
    endResourceByReason: {}
  };
}

function addOutcomeAggregate(target, result) {
  target.runs++;
  target.survived += Number(result.survived);
  target.died += Number(result.died);
  target.reachedFloor += result.reachedFloor;
  target.terminationReasons[result.terminationReason] =
    (target.terminationReasons[result.terminationReason] || 0) + 1;
  target.finalHp.push(result.finalHp);
  target.finalHpRate.push(result.finalHpRate);
  target.finalMp.push(result.finalMp);
  target.finalMpRate.push(result.finalMpRate);
  target.mpBlockedTerminalEncounterRuns += Number(result.mpBlockedTerminalEncounter);
  target.mpDepletionCausedEndRuns += Number(result.mpDepletionCausedEnd);
  const reasonResources = target.endResourceByReason[result.terminationReason] ||= {
    runs: 0,
    finalHp: [],
    finalHpRate: [],
    finalMp: [],
    finalMpRate: []
  };
  reasonResources.runs++;
  reasonResources.finalHp.push(result.finalHp);
  reasonResources.finalHpRate.push(result.finalHpRate);
  reasonResources.finalMp.push(result.finalMp);
  reasonResources.finalMpRate.push(result.finalMpRate);
  for (let floor = 1; floor < target.entrantsByFloor.length; floor++) {
    if (result.reachedFloor < floor) continue;
    target.entrantsByFloor[floor]++;
    if (result.deathFloor === floor) target.deathsByFloor[floor]++;
  }
  if (result.survived && Number.isInteger(result.endFloor)) {
    target.retreatsByFloor[result.endFloor]++;
  }
}

function finalizeOutcomeAggregate(aggregate) {
  const runs = Math.max(1, aggregate.runs);
  return {
    runs: aggregate.runs,
    survivedRuns: aggregate.survived,
    diedRuns: aggregate.died,
    survivalRate: aggregate.survived / runs,
    retreatRate: aggregate.survived / runs,
    deathRate: aggregate.died / runs,
    averageReachedFloor: aggregate.reachedFloor / runs,
    entrantsByFloor: [...aggregate.entrantsByFloor],
    deathsByFloor: [...aggregate.deathsByFloor],
    retreatsByFloor: [...aggregate.retreatsByFloor],
    terminationReasons: { ...aggregate.terminationReasons },
    finalHp: summarizeDistribution(aggregate.finalHp),
    finalHpRate: summarizeDistribution(aggregate.finalHpRate),
    finalMp: summarizeDistribution(aggregate.finalMp),
    finalMpRate: summarizeDistribution(aggregate.finalMpRate),
    mpBlockedTerminalEncounterRuns: aggregate.mpBlockedTerminalEncounterRuns,
    mpDepletionCausedEndRuns: aggregate.mpDepletionCausedEndRuns,
    endResourceByReason: Object.fromEntries(
      Object.entries(aggregate.endResourceByReason).map(([reason, values]) => [
        reason,
        {
          runs: values.runs,
          finalHp: summarizeDistribution(values.finalHp),
          finalHpRate: summarizeDistribution(values.finalHpRate),
          finalMp: summarizeDistribution(values.finalMp),
          finalMpRate: summarizeDistribution(values.finalMpRate)
        }
      ])
    )
  };
}

function addTrapAggregate(target, result) {
  target.runs++;
  target.encounters += result.trapEncounterCount;
  Object.entries(result.trapEncounterBySource).forEach(([source, amount]) => {
    target.encountersBySource[source] =
      (target.encountersBySource[source] || 0) + amount;
  });
  target.activations += result.trapActivations;
  target.damageHp += result.trapDamageHp;
  target.healPotionsUsed += result.trapHealPotionsUsed;
  target.greaterHealPotionsUsed += result.trapGreaterHealPotionsUsed;
  target.recoveryPotionsUsed += result.recoveryPotionsUsed;
  target.recoveryPotionShortages += result.recoveryPotionShortages;
  target.healPotionShortages += result.trapHealPotionShortages;
  target.disarms += result.trapDisarms;
  target.disarmAttempts += result.trapDisarmAttempts;
  target.disarmSuccesses += result.trapDisarmSuccesses;
  target.detectionAttempts += result.trapDetectionAttempts;
  target.avoided += result.trapAvoided;
  target.forced += result.trapForced;
  target.avoidanceExtraSteps += result.trapAvoidanceExtraSteps;
  target.avoidanceCandidates += result.trapAvoidanceCandidates;
  target.avoidanceRejected += result.trapAvoidanceRejected;
  target.avoidanceNoEstimate += result.trapAvoidanceNoEstimate;
  target.avoidanceExpectedEncounterCount += result.trapAvoidanceExpectedEncounterCount;
  target.avoidanceExpectedEncounterDamage += result.trapAvoidanceExpectedEncounterDamage;
  target.avoidanceExpectedDirectDamage += result.trapAvoidanceExpectedDirectDamage;
  target.kitsAcquired += result.trapKitsAcquired;
  target.kitsUsed += result.trapKitsUsed;
  Object.entries(result.trapKitsAcquiredBySource).forEach(([source, amount]) => {
    target.trapKitsAcquiredBySource[source] =
      (target.trapKitsAcquiredBySource[source] || 0) + amount;
  });
  Object.entries(result.trapKitsConsumedBySource).forEach(([source, amount]) => {
    target.trapKitsConsumedBySource[source] =
      (target.trapKitsConsumedBySource[source] || 0) + amount;
  });
  target.detections += result.trapDetections;
  target.detectionCapHits += result.trapDetectionCapHits;
  target.disarmCapHits += result.trapDisarmCapHits;
  target.planEvaluations += result.trapPlanEvaluations;
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
  Object.entries(result.greaterHealPotionsAcquiredBySource).forEach(([source, amount]) => {
    target.greaterHealPotionsAcquiredBySource[source] =
      (target.greaterHealPotionsAcquiredBySource[source] || 0) + amount;
  });
  Object.entries(result.greaterHealPotionsConsumedBySource).forEach(([source, amount]) => {
    target.greaterHealPotionsConsumedBySource[source] =
      (target.greaterHealPotionsConsumedBySource[source] || 0) + amount;
  });
  [
    ["manaPotionsAcquiredBySource", target.manaPotionsAcquiredBySource],
    ["manaPotionsConsumedBySource", target.manaPotionsConsumedBySource],
    ["holyWaterAcquiredBySource", target.holyWaterAcquiredBySource],
    ["holyWaterConsumedBySource", target.holyWaterConsumedBySource],
    ["departureCraftCraftedByRecipe", target.departureCraftCraftedByRecipe],
    ["departureCraftPotentialByRecipe", target.departureCraftPotentialByRecipe]
  ].forEach(([field, destination]) => {
    Object.entries(result[field] || {}).forEach(([key, amount]) => {
      destination[key] = (destination[key] || 0) + amount;
    });
  });
  Object.entries(result.departureCraftCraftedByRecipe || {}).forEach(([recipeId, amount]) => {
    target.departureCraftCraftedRunsByRecipe[recipeId] += Number(amount > 0);
  });
  Object.entries(result.departureCraftPotentialByRecipe || {}).forEach(([recipeId, amount]) => {
    target.departureCraftPotentialRunsByRecipe[recipeId] += Number(amount > 0);
  });
  Object.entries(result.materialSourceCounts || {}).forEach(([source, materials]) => {
    Object.entries(materials).forEach(([material, amount]) => {
      target.materialSourceCounts[source][material] += amount;
    });
  });
  const competition = result.materialCompetition || {};
  target.materialCompetition.shardBalanceBeforeDeparture +=
    competition.shardBalanceBeforeDeparture || 0;
  target.materialCompetition.weaponEnhancementAffordable +=
    competition.weaponEnhancementAffordable || 0;
  target.materialCompetition.affordableWorkshopNodeCount +=
    competition.affordableWorkshopNodeCount || 0;
  target.materialCompetition.simulatedWeaponEnhancementShardSpend +=
    competition.simulatedWeaponEnhancementShardSpend || 0;
  target.materialCompetition.simulatedWorkshopNodeShardSpend +=
    competition.simulatedWorkshopNodeShardSpend || 0;
  target.healPotionMerchantAttempts += result.healPotionMerchantAttempts;
  Object.entries(result.healPotionMerchantFailures).forEach(([reason, count]) => {
    target.healPotionMerchantFailures[reason] =
      (target.healPotionMerchantFailures[reason] || 0) + count;
  });
}

function finalizeTrapAggregate(aggregate) {
  const runs = Math.max(1, aggregate.runs);
  return {
    runs: aggregate.runs,
    averageTrapEncounters: aggregate.encounters / runs,
    averageTrapEncountersBySource: Object.fromEntries(
      Object.entries(aggregate.encountersBySource).map(([source, amount]) => [
        source,
        amount / runs
      ])
    ),
    averageTrapActivations: aggregate.activations / runs,
    averageTrapDamageHp: aggregate.damageHp / runs,
    averageTrapHealPotionsUsed: aggregate.healPotionsUsed / runs,
    averageTrapGreaterHealPotionsUsed: aggregate.greaterHealPotionsUsed / runs,
    averageRecoveryPotionsUsed: aggregate.recoveryPotionsUsed / runs,
    averageRecoveryPotionShortages: aggregate.recoveryPotionShortages / runs,
    averageTrapHealPotionShortages: aggregate.healPotionShortages / runs,
    trapHealPotionShortageRunRate: aggregate.runsWithHealPotionShortage / runs,
    averageTrapDisarms: aggregate.disarms / runs,
    averageTrapDisarmAttempts: aggregate.disarmAttempts / runs,
    averageTrapDisarmSuccesses: aggregate.disarmSuccesses / runs,
    averageTrapDetectionAttempts: aggregate.detectionAttempts / runs,
    averageTrapAvoided: aggregate.avoided / runs,
    averageTrapForced: aggregate.forced / runs,
    averageTrapAvoidanceExtraSteps: aggregate.avoidanceExtraSteps / runs,
    averageTrapAvoidanceCandidates: aggregate.avoidanceCandidates / runs,
    averageTrapAvoidanceRejected: aggregate.avoidanceRejected / runs,
    averageTrapAvoidanceNoEstimate: aggregate.avoidanceNoEstimate / runs,
    averageTrapAvoidanceExpectedEncounterCount:
      aggregate.avoidanceExpectedEncounterCount / runs,
    averageTrapAvoidanceExpectedEncounterDamage:
      aggregate.avoidanceExpectedEncounterDamage / runs,
    averageTrapAvoidanceExpectedDirectDamage:
      aggregate.avoidanceExpectedDirectDamage / runs,
    averageTrapKitsAcquired: aggregate.kitsAcquired / runs,
    averageTrapKitsUsed: aggregate.kitsUsed / runs,
    averageTrapKitsAcquiredBySource: Object.fromEntries(
      Object.entries(aggregate.trapKitsAcquiredBySource).map(([source, amount]) => [
        source,
        amount / runs
      ])
    ),
    averageTrapKitsConsumedBySource: Object.fromEntries(
      Object.entries(aggregate.trapKitsConsumedBySource).map(([source, amount]) => [
        source,
        amount / runs
      ])
    ),
    averageTrapDetections: aggregate.detections / runs,
    trapDetectionCapHitRate: aggregate.detectionAttempts > 0
      ? aggregate.detectionCapHits / aggregate.detectionAttempts
      : 0,
    trapDisarmCapHitRate: aggregate.planEvaluations > 0
      ? aggregate.disarmCapHits / aggregate.planEvaluations
      : 0,
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
    ),
    averageGreaterHealPotionsAcquiredBySource: Object.fromEntries(
      Object.entries(aggregate.greaterHealPotionsAcquiredBySource).map(([source, amount]) => [
        source,
        amount / runs
      ])
    ),
    averageGreaterHealPotionsConsumed: Object.values(aggregate.greaterHealPotionsConsumedBySource)
      .reduce((sum, amount) => sum + amount, 0) / runs,
    averageGreaterHealPotionsConsumedBySource: Object.fromEntries(
      Object.entries(aggregate.greaterHealPotionsConsumedBySource).map(([source, amount]) => [
        source,
        amount / runs
      ])
    ),
    averageManaPotionsAcquiredBySource: Object.fromEntries(
      Object.entries(aggregate.manaPotionsAcquiredBySource).map(([source, amount]) => [
        source,
        amount / runs
      ])
    ),
    averageManaPotionsConsumed: Object.values(aggregate.manaPotionsConsumedBySource)
      .reduce((sum, amount) => sum + amount, 0) / runs,
    averageManaPotionsConsumedBySource: Object.fromEntries(
      Object.entries(aggregate.manaPotionsConsumedBySource).map(([source, amount]) => [
        source,
        amount / runs
      ])
    ),
    averageHolyWaterAcquiredBySource: Object.fromEntries(
      Object.entries(aggregate.holyWaterAcquiredBySource).map(([source, amount]) => [
        source,
        amount / runs
      ])
    ),
    averageHolyWaterConsumed: Object.values(aggregate.holyWaterConsumedBySource)
      .reduce((sum, amount) => sum + amount, 0) / runs,
    averageHolyWaterConsumedBySource: Object.fromEntries(
      Object.entries(aggregate.holyWaterConsumedBySource).map(([source, amount]) => [
        source,
        amount / runs
      ])
    ),
    averageDepartureCraftCraftedByRecipe: Object.fromEntries(
      Object.entries(aggregate.departureCraftCraftedByRecipe).map(([recipeId, amount]) => [
        recipeId,
        amount / runs
      ])
    ),
    departureCraftRunRateByRecipe: Object.fromEntries(
      Object.entries(aggregate.departureCraftCraftedRunsByRecipe).map(([recipeId, amount]) => [
        recipeId,
        amount / runs
      ])
    ),
    averageDepartureCraftPotentialByRecipe: Object.fromEntries(
      Object.entries(aggregate.departureCraftPotentialByRecipe).map(([recipeId, amount]) => [
        recipeId,
        amount / runs
      ])
    ),
    departureCraftPotentialRunRateByRecipe: Object.fromEntries(
      Object.entries(aggregate.departureCraftPotentialRunsByRecipe).map(([recipeId, amount]) => [
        recipeId,
        amount / runs
      ])
    ),
    averageMaterialSourceCounts: Object.fromEntries(
      Object.entries(aggregate.materialSourceCounts).map(([source, materials]) => [
        source,
        Object.fromEntries(Object.entries(materials).map(([material, amount]) => [
          material,
          amount / runs
        ]))
      ])
    ),
    materialCompetition: {
      averageShardBalanceBeforeDeparture:
        aggregate.materialCompetition.shardBalanceBeforeDeparture / runs,
      weaponEnhancementAffordableRate:
        aggregate.materialCompetition.weaponEnhancementAffordable / runs,
      averageAffordableWorkshopNodeCount:
        aggregate.materialCompetition.affordableWorkshopNodeCount / runs,
      simulatedWeaponEnhancementShardSpend:
        aggregate.materialCompetition.simulatedWeaponEnhancementShardSpend / runs,
      simulatedWorkshopNodeShardSpend:
        aggregate.materialCompetition.simulatedWorkshopNodeShardSpend / runs
    },
    averageHealPotionMerchantAttempts: aggregate.healPotionMerchantAttempts / runs,
    healPotionMerchantAttempts: aggregate.healPotionMerchantAttempts,
    averageHealPotionMerchantFailures: Object.fromEntries(
      Object.entries(aggregate.healPotionMerchantFailures).map(([reason, count]) => [
        reason,
        count / runs
      ])
    ),
    healPotionMerchantFailureCounts: { ...aggregate.healPotionMerchantFailures }
  };
}

function buildConsumableClassSummary(metrics) {
  return {
    runs: metrics.runs,
    averageMaterialSourceCounts: metrics.averageMaterialSourceCounts,
    averageManaPotionsAcquiredBySource: metrics.averageManaPotionsAcquiredBySource,
    averageManaPotionsConsumed: metrics.averageManaPotionsConsumed,
    averageManaPotionsConsumedBySource: metrics.averageManaPotionsConsumedBySource,
    averageHolyWaterAcquiredBySource: metrics.averageHolyWaterAcquiredBySource,
    averageHolyWaterConsumed: metrics.averageHolyWaterConsumed,
    averageHolyWaterConsumedBySource: metrics.averageHolyWaterConsumedBySource,
    averageDepartureCraftCraftedByRecipe: metrics.averageDepartureCraftCraftedByRecipe,
    departureCraftRunRateByRecipe: metrics.departureCraftRunRateByRecipe,
    averageDepartureCraftPotentialByRecipe: metrics.averageDepartureCraftPotentialByRecipe,
    departureCraftPotentialRunRateByRecipe: metrics.departureCraftPotentialRunRateByRecipe,
    materialCompetition: metrics.materialCompetition
  };
}

function createTrapBonusAggregate() {
  return {
    runs: 0,
    equipmentItems: 0,
    trapBonusItems: 0,
    trapBonusValues: {}
  };
}

function addTrapBonusAggregate(target, result) {
  target.runs++;
  target.equipmentItems += result.equipmentFound;
  target.trapBonusItems += result.trapBonusItemsFound;
  Object.entries(result.trapBonusFoundByValue).forEach(([value, count]) => {
    target.trapBonusValues[value] = (target.trapBonusValues[value] || 0) + count;
  });
}

function finalizeTrapBonusAggregate(aggregate) {
  const runs = Math.max(1, aggregate.runs);
  const totalAffixes = Object.values(aggregate.trapBonusValues)
    .reduce((sum, count) => sum + count, 0);
  return {
    equipmentItems: aggregate.equipmentItems,
    trapBonusItems: aggregate.trapBonusItems,
    trapBonusItemRate: aggregate.equipmentItems > 0
      ? aggregate.trapBonusItems / aggregate.equipmentItems
      : 0,
    averageTrapBonusItems: aggregate.trapBonusItems / runs,
    averageTrapBonusByValue: Object.fromEntries(
      Object.entries(aggregate.trapBonusValues).map(([value, count]) => [
        value,
        count / runs
      ])
    ),
    trapBonusValueDistribution: Object.fromEntries(
      Object.entries(aggregate.trapBonusValues).map(([value, count]) => [
        value,
        totalAffixes > 0 ? count / totalAffixes : 0
      ])
    ),
    totalTrapBonusAffixes: totalAffixes
  };
}

function addCoreObservations(target, additions) {
  Object.keys(target).forEach(key => {
    if (Array.isArray(target[key])) {
      target[key] = target[key].map((value, index) => value + (additions[key]?.[index] || 0));
    } else if (target[key] && typeof target[key] === "object") {
      Object.keys(target[key]).forEach(name => {
        target[key][name] += additions[key]?.[name] || 0;
      });
    } else {
      target[key] += additions[key] || 0;
    }
  });
}
// powderは実装の開始粉・鑑定・未鑑定保持経路を再現する既定モデル。
// legacyは#231の旧sim比較を再現する、鑑定済み・呪いなしの実装外反実仮想。
// gambleは#236の即着用反実仮想。コアの装備個数制限は撤廃済み（#311）。

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

function hashSimulationRunSeed(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function equipBestWorkshopStartingGear(character, workshop, config = {}) {
  const candidateIds = config.startingGearCandidatesOverride ||
    getWorkshopGrants(workshop).startingGear;
  const selectedId = config.startingGearChoice;
  const selected = selectedId ? ITEMS[selectedId] : null;
  if (selected && selected.type === "weapon" &&
    (!selected.classes || selected.classes.includes(character.class))) {
    character.equipment[selected.type] = selected.id;
    return;
  }
  const candidates = candidateIds
    .map(itemId => ITEMS[itemId])
    .filter(item => item && (!item.classes || item.classes.includes(character.class)))
    .sort((left, right) => (right.atk || 0) - (left.atk || 0));
  const best = candidates[0];
  const equipped = ITEMS[character.equipment.weapon];
  if (best && (best.atk || 0) > (equipped?.atk || 0)) {
    character.equipment[best.type] = best.id;
  }
}

function measureDepartureCraftDemand(metaMaterials, cap = 99) {
  const potentialByRecipe = createCraftMeasurementCounts();
  CRAFT_MEASUREMENT_RECIPE_IDS.forEach(recipeId => {
    const count = getAdditionalCraftableCount(metaMaterials, [], recipeId, cap);
    const purchase = purchaseDepartureCraft(
      metaMaterials,
      Array(count).fill(recipeId)
    );
    potentialByRecipe[recipeId] = purchase.ok ? count : 0;
  });
  return { potentialByRecipe };
}

function resolveDepartureCraftIds(
  scenario,
  character,
  metaMaterials = {},
  demand = null
) {
  if (Object.hasOwn(scenario, "departureCraft")) {
    return Array.isArray(scenario.departureCraft) ? [...scenario.departureCraft] : [];
  }
  if (
    scenario.departureCraftMeasurement &&
    ACTIVE_DEPARTURE_CRAFT_IDS.length === 0 &&
    canUseManaItems(character)
  ) {
    const count = demand?.potentialByRecipe.MANA_POTION ??
      getAdditionalCraftableCount(metaMaterials, [], "MANA_POTION");
    return Array(count).fill("MANA_POTION");
  }
  return [...ACTIVE_DEPARTURE_CRAFT_IDS];
}

function measureMaterialCompetition(metaMaterials, workshop, weapon) {
  const enhancementMats = getEnhanceCost(weapon)?.mats || {};
  const shardWorkshopNodes = [...WORKSHOP_NODE_BY_ID.values()]
    .filter(node => node.costs?.some(cost => (cost[MAGIC_SHARD] || 0) > 0));
  const affordableWorkshopNodes = shardWorkshopNodes
    .filter(node => purchaseWorkshopNode(metaMaterials, workshop, node.id).ok)
    .map(node => node.id);
  return {
    shardBalanceBeforeDeparture: metaMaterials[MAGIC_SHARD] || 0,
    weaponEnhancementShardCost: enhancementMats[MAGIC_SHARD] || 0,
    weaponEnhancementAffordable: Number(Boolean(
      spendMaterials(metaMaterials, enhancementMats)
    )),
    affordableWorkshopNodeIds: affordableWorkshopNodes,
    affordableWorkshopNodeCount: affordableWorkshopNodes.length,
    simulatedWeaponEnhancementShardSpend: 0,
    simulatedWorkshopNodeShardSpend: 0
  };
}

function resolveTrapPolicies(scenario = {}) {
  const sharedPolicy = scenario.trapPolicy || null;
  return {
    floor: sharedPolicy || DEFAULT_FLOOR_TRAP_POLICY_ID,
    chest: scenario.chestTrapPolicy || sharedPolicy || DEFAULT_TRAP_POLICY_ID
  };
}

function createSimulationState(
  className,
  startFloor,
  runSeed,
  scenario,
  workshop,
  keyItems = [],
  unlockedMilestones = []
) {
  const currentRun = createDefaultCurrentRun();
  currentRun.runSeed = runSeed;
  currentRun.startFloor = startFloor;
  currentRun.deepestFloor = startFloor;
  currentRun.characterClass = className;
  currentRun.floorsVisited = [startFloor];
  currentRun.campRestCount = 0;
  assignRunQuests(currentRun);

  const character = applyWorkshopToCharacter(createSoloCharacter(className), workshop);
  const hpBaseBonus = Number(scenario.hpBaseBonus) || 0;
  if (hpBaseBonus !== 0) {
    character.maxHp += hpBaseBonus;
    character.hp += hpBaseBonus;
  }
  const intBonus = Number(scenario.intBonus) || 0;
  if (intBonus !== 0) character.int += intBonus;
  if (scenario.disablePriestHealing && className === "Priest") {
    character.spells = character.spells.filter(
      spell => !PRIEST_HEALING_SPELL_IDS.includes(spell)
    );
  }
  const workshopGrants = getWorkshopGrants(workshop);
  const identificationPolicy = scenario.identificationPolicy || "powder";
  // legacyは実装外反実仮想として開始粉を使わず、powder/gambleは実runの初期支給を使う。
  const useRealIdentificationSupply = identificationPolicy !== "legacy";
  const initialDepartureCraftBank = scenario.departureCraftMaterialsAreActualBank
    ? { ...(scenario.departureCraftMaterials || {}) }
    : null;
  const departureCraftDemand = scenario.departureCraftMeasurement
    ? measureDepartureCraftDemand(initialDepartureCraftBank || {})
    : null;
  const departureCraftIds = resolveDepartureCraftIds(
    scenario,
    character,
    initialDepartureCraftBank || {},
    departureCraftDemand
  );
  const sourceDepartureCraftCost = getDepartureCraftCost(departureCraftIds);
  // 既存の単発what-ifは所要コストを検証bankへ補う。#481のrun-chainだけ実meta bankを使う。
  const departureCraftBank = initialDepartureCraftBank
    ? { ...initialDepartureCraftBank }
    : {
        ...sourceDepartureCraftCost.typed,
        ...(sourceDepartureCraftCost.any > 0
          ? {
              "獣の牙":
                (sourceDepartureCraftCost.typed["獣の牙"] || 0) + sourceDepartureCraftCost.any
            }
          : {}),
        ...(scenario.departureCraftMaterials || {})
      };
  const departureCraftPurchaseValidation = purchaseDepartureCraft(
    departureCraftBank,
    departureCraftIds
  );
  const departureCraftPurchase = departureCraftPurchaseValidation.ok
    ? {
        ...departureCraftPurchaseValidation,
        cost: scenario.departureCraftCostOverride || departureCraftPurchaseValidation.cost
      }
    : {
        ok: false,
        reason: departureCraftPurchaseValidation.ok
          ? "insufficient_materials"
          : departureCraftPurchaseValidation.reason
      };
  if (!departureCraftPurchase.ok) {
    throw new Error(
      `departure craft purchase failed: ${departureCraftPurchase.reason} ` +
      `ids=${departureCraftIds.join(",")}`
    );
  }
  const departureCraftGrants = getDepartureCraftGrants(departureCraftPurchase.recipeIds);
  const departureCraftItems = departureCraftGrants.items;
  const startingPowder = useRealIdentificationSupply
    ? IDENTIFICATION_STARTING_POWDER
    : 0;
  const initialIdentificationPowder = {
    starting: useRealIdentificationSupply && !IDENTIFICATION_POWDER_UNLIMITED
      ? startingPowder
      : 0,
    workshop: workshopGrants.identifyPowder,
    departureCraft: departureCraftGrants.identifyPowder,
    chest: 0,
    codex: 0,
    merchant: 0
  };
  // src/movement.jsと同じ初期値。legacyだけ開始時粉を旧sim互換で省略する。
  const initialIdentifyTickets = useRealIdentificationSupply
    ? startingPowder +
      workshopGrants.identifyPowder +
      departureCraftGrants.identifyPowder
    : workshopGrants.identifyPowder + departureCraftGrants.identifyPowder;
  const workshopReturnItems = scenario.ignoreWorkshopReturnItems
    ? []
    : workshopGrants.returnItems;
  const startingHealPotions = Object.hasOwn(scenario, "startingHealPotions")
    ? Math.max(0, Math.floor(Number(scenario.startingHealPotions)))
    : INITIAL_HEAL_POTIONS;
  const startingGreaterHeals = Object.hasOwn(scenario, "startingGreaterHeals")
    ? Math.max(0, Math.floor(Number(scenario.startingGreaterHeals)))
    : 0;
  const startingManaPotions = Object.hasOwn(scenario, "startingManaPotions")
    ? Math.max(0, Math.floor(Number(scenario.startingManaPotions)))
    : 0;
  const startingHolyWater = Object.hasOwn(scenario, "startingHolyWater")
    ? Math.max(0, Math.floor(Number(scenario.startingHolyWater)))
    : 0;
  const startingAntidotes = Object.hasOwn(scenario, "startingAntidotes")
    ? Math.max(0, Math.floor(Number(scenario.startingAntidotes)))
    : INITIAL_ANTIDOTES;
  const startingGuardPotions = Object.hasOwn(scenario, "startingGuardPotions")
    ? Math.max(0, Math.floor(Number(scenario.startingGuardPotions)))
    : INITIAL_GUARD_POTIONS;
  const scenarioReturnItems = [
    ...(scenario.workshopReturnItem ? [scenario.workshopReturnItem] : []),
    ...Array(Math.max(0, scenario.startingTownPortals || 0)).fill("TOWN_PORTAL")
  ];
  const startingInventory = [
    ...Array(startingHealPotions).fill("HEAL_POTION"),
    ...Array(startingGreaterHeals).fill("GREATER_HEAL"),
    ...Array(startingManaPotions).fill("MANA_POTION"),
    ...Array(startingHolyWater).fill("HOLY_WATER"),
    ...Array(startingAntidotes).fill("ANTIDOTE"),
    ...Array(startingGuardPotions).fill("GUARD_POTION"),
    ...workshopReturnItems,
    ...scenarioReturnItems
  ];
  const initialWeaponId = character.equipment.weapon;
  const startingGearConfig = {
    startingGearCandidatesOverride: scenario.startingGearCandidatesOverride,
    startingGearChoice: scenario.startingGearChoice
  };
  equipBestWorkshopStartingGear(character, workshop, startingGearConfig);
  const finalWeaponId = character.equipment.weapon;
  const materialCompetition = scenario.departureCraftMeasurement
    ? measureMaterialCompetition(departureCraftBank, workshop, finalWeaponId)
    : null;
  const trapPolicies = resolveTrapPolicies(scenario);
  const healPriorityPolicy = scenario.healPriorityPolicy || DEFAULT_HEAL_PRIORITY_POLICY;
  if (!HEAL_PRIORITY_POLICIES.includes(healPriorityPolicy)) {
    throw new Error(
      `healPriorityPolicy must be ${HEAL_PRIORITY_POLICIES.join("|")}: ${healPriorityPolicy}`
    );
  }
  const bloodWandHealPolicy =
    scenario.bloodWandHealPolicy || DEFAULT_BLOOD_WAND_HEAL_POLICY;
  if (!BLOOD_WAND_HEAL_POLICIES.includes(bloodWandHealPolicy)) {
    throw new Error(
      `bloodWandHealPolicy must be ${BLOOD_WAND_HEAL_POLICIES.join("|")}: ${bloodWandHealPolicy}`
    );
  }
  const fleePolicy = scenario.fleePolicy || DEFAULT_FLEE_POLICY;
  if (!FLEE_POLICIES.includes(fleePolicy)) {
    throw new Error(`fleePolicy must be ${FLEE_POLICIES.join("|")}: ${fleePolicy}`);
  }
  const healPotionThreshold = Object.hasOwn(scenario, "healPotionThreshold")
    ? Number(scenario.healPotionThreshold)
    : HEAL_POTION_THRESHOLD;
  if (!Number.isFinite(healPotionThreshold) || healPotionThreshold < 0 || healPotionThreshold > 1) {
    throw new Error(`healPotionThreshold must be a number in [0,1]: ${scenario.healPotionThreshold}`);
  }
  const manaPotionThreshold = Object.hasOwn(scenario, "manaPotionThreshold")
    ? Number(scenario.manaPotionThreshold)
    : MANA_POTION_THRESHOLD;
  if (!Number.isFinite(manaPotionThreshold) || manaPotionThreshold < 0 || manaPotionThreshold > 1) {
    throw new Error(`manaPotionThreshold must be a number in [0,1]: ${scenario.manaPotionThreshold}`);
  }
  const healPotionMerchantPolicy = parseHealPotionMerchantPolicy(
    scenario.healPotionMerchantPolicy || DEFAULT_HEAL_POTION_MERCHANT_POLICY
  );
  const healPotionMerchantHoldLimit = parseOptionalMerchantInventoryLimit(
    scenario.healPotionMerchantHoldLimit
  );
  const chestHealPotionExtraChance = parseOptionalChance(
    scenario.chestHealPotionExtraChance
  );
  const chestHealPotionReplacementChance = parseOptionalChance(
    scenario.chestHealPotionReplacementChance,
    "chestHealPotionReplacementChance"
  );
  const enemyHealPotionDropChance = parseOptionalChance(
    scenario.enemyHealPotionDropChance,
    "enemyHealPotionDropChance"
  );
  const extraCampFloors = parseOptionalFloorList(scenario.extraCampFloors);
  const extraCampRecoveryRate = Object.hasOwn(scenario, "extraCampRecoveryRate")
    ? parseOptionalChance(scenario.extraCampRecoveryRate, "extraCampRecoveryRate")
    : 0.4;
  const extraCampTimeCost = Object.hasOwn(scenario, "extraCampTimeCost")
    ? Number(scenario.extraCampTimeCost)
    : 0;
  if (!Number.isInteger(extraCampTimeCost) || extraCampTimeCost < 0) {
    throw new Error(`extraCampTimeCost must be a non-negative integer: ${scenario.extraCampTimeCost}`);
  }
  const floorTransitionRecoveryRate = Object.hasOwn(scenario, "floorTransitionRecoveryRate")
    ? parseOptionalChance(scenario.floorTransitionRecoveryRate, "floorTransitionRecoveryRate")
    : 0.15;
  const workshopEffects = {
    stats: { ...workshopGrants.stats },
    startingGearCandidates: [
      ...(scenario.startingGearCandidatesOverride || workshopGrants.startingGear)
    ],
    startingGearApplied: finalWeaponId !== initialWeaponId ? finalWeaponId : null,
    initialWeapon: initialWeaponId,
    finalWeapon: finalWeaponId,
    startingGearAttackDelta:
      (ITEMS[finalWeaponId]?.atk || 0) - (ITEMS[initialWeaponId]?.atk || 0),
    affixIds: [...workshopGrants.affixIds],
    spellIds: [...workshopGrants.spellIds]
  };

  return {
    party: [character],
    workshopEffects,
    keyItems: [...keyItems],
    unlockedMilestones: [...unlockedMilestones],
    combatState: null,
    inventory: [
      ...startingInventory,
      ...departureCraftItems
    ],
    simStartingInventory: startingInventory,
    simDepartureCraftItems: departureCraftItems,
    simHealPotionSources: [
      ...Array(startingHealPotions).fill("starting"),
      ...departureCraftItems
        .filter(item => item === "HEAL_POTION")
        .map(() => "departureCraft")
    ],
    simGreaterHealSources: [
      ...Array(startingGreaterHeals).fill("starting"),
      ...departureCraftItems
        .filter(item => item === "GREATER_HEAL")
        .map(() => "departureCraft")
    ],
    simManaPotionSources: [
      ...Array(startingManaPotions).fill("starting"),
      ...departureCraftItems
        .filter(item => item === "MANA_POTION")
        .map(() => "departureCraft")
    ],
    simHolyWaterSources: [
      ...Array(startingHolyWater).fill("starting"),
      ...departureCraftItems
        .filter(item => item === "HOLY_WATER")
        .map(() => "departureCraft")
    ],
    simTrapKitSources: departureCraftItems
      .filter(item => item === "TRAP_KIT")
      .map(() => "departureCraft"),
    simPortalSources: [
      ...workshopReturnItems.map(() => "workshop"),
      ...departureCraftItems
        .filter(item => item === "TOWN_PORTAL")
        .map(() => "departure-craft"),
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
    metaMaterials: scenario.departureCraftMaterialsAreActualBank
      ? { ...departureCraftPurchase.metaMaterials }
      : {},
    identifyTickets: initialIdentifyTickets,
    simIdentificationPowderAcquired: initialIdentificationPowder,
    simIdentificationPowderUnlimited:
      useRealIdentificationSupply && IDENTIFICATION_POWDER_UNLIMITED,
    simDepartureCraft: {
      recipeIds: departureCraftPurchase.recipeIds,
      cost: departureCraftPurchase.cost,
      purchaseSource: scenario.departureCraftMaterialsAreActualBank
        ? "actual-meta-bank"
        : "synthetic-validation-bank"
    },
    simDepartureCraftDemand: departureCraftDemand,
    simMaterialCompetition: materialCompetition,
    simHealPotionMerchantPurchases: 0,
    gold: 0,
    firstChestUnidentifiedGuaranteed: false,
    simPolicy: {
      identificationPolicy,
      healPotionAmountOverride: scenario.healPotionAmountOverride || null,
      healPotionSupplyNormalization: scenario.healPotionSupplyNormalization || null,
      healPotionThreshold,
      manaPotionThreshold,
      fleePolicy,
      fleeHpThreshold: Object.hasOwn(scenario, "fleeHpThreshold")
        ? scenario.fleeHpThreshold
        : DEFAULT_FLEE_HP_THRESHOLD,
      statusCurePolicy: scenario.statusCurePolicy || DEFAULT_STATUS_CURE_POLICY,
      statusCureHpThreshold: Object.hasOwn(scenario, "statusCureHpThreshold")
        ? scenario.statusCureHpThreshold
        : DEFAULT_STATUS_CURE_HP_THRESHOLD,
      statusCureMerchantPolicy:
        scenario.statusCureMerchantPolicy || DEFAULT_STATUS_CURE_MERCHANT_POLICY,
      healPotionMerchantPolicy: healPotionMerchantPolicy.id,
      healPotionMerchantMaxPurchases: healPotionMerchantPolicy.maxPurchases,
      healPotionMerchantHoldLimit,
      chestHealPotionExtraChance,
      chestHealPotionReplacementChance,
      enemyHealPotionDropChance,
      extraCampFloors,
      extraCampRecoveryRate,
      extraCampTimeCost,
      floorTransitionRecoveryRate,
      hpGrowthBonus: Number(scenario.hpGrowthBonus) || 0,
      trapGuardOverride: scenario.trapGuardOverride || null,
      trapPolicy: trapPolicies.floor,
      chestTrapPolicy: trapPolicies.chest,
      trapAvoidancePolicy:
        scenario.trapAvoidancePolicy || DEFAULT_TRAP_AVOIDANCE_POLICY_ID,
      floorTrapDetection: scenario.floorTrapDetection || "source",
      ignoreThiefSustain: Boolean(scenario.ignoreThiefSustain),
      trapOverride: scenario.trapOverride || null,
      trapBonusValueOverride: scenario.trapBonusValueOverride || null,
      trapBonusExposure: scenario.trapBonusExposure || null,
      trapBonusExposureApplied: false,
      trapBonusExposureValue: 0,
      bossOverride: scenario.bossOverride || null,
      forcedBossAffixes: scenario.forcedBossAffixes || null,
      statusScalingOverride: scenario.statusScalingOverride || null,
      raceBiasOverride: scenario.raceBiasOverride || null,
      countermeasureOverride: scenario.countermeasureOverride || null,
      threatOverride: scenario.threatOverride || null,
      elitePolicy: scenario.elitePolicy || DEFAULT_ELITE_POLICY,
      bloodWandHpPaymentMinRate: BLOOD_WAND_HP_PAYMENT_MIN_RATE,
      healPriorityPolicy,
      bloodWandHealPolicy,
      materialDropOverride: scenario.materialDropOverride || null
    },
    floor: startFloor,
    lightTurns: 0,
    lightPower: "",
    repelTurns: 0,
    flameTrapCooldownTurns: 0
  };
}

function isAlive(character) {
  return character.status !== "dead" && character.hp > 0;
}

function recordB5HpValue(metrics, hp, maxHp) {
  if (!metrics.b5FloorActive || !Number.isFinite(hp)) return;
  const currentHp = Math.max(0, hp);
  const currentMaxHp = Math.max(1, Number(maxHp) || 1);
  metrics.b5MinimumHp = metrics.b5MinimumHp === null
    ? currentHp
    : Math.min(metrics.b5MinimumHp, currentHp);
  if (currentHp <= 0) return;
  if (
    metrics.b5MinimumPositiveHp === null ||
    currentHp < metrics.b5MinimumPositiveHp
  ) {
    metrics.b5MinimumPositiveHp = currentHp;
    metrics.b5MinimumPositiveHpRate = currentHp / currentMaxHp;
  }
}

function recordB5HpSnapshot(state, metrics, step = null) {
  if (!metrics.b5FloorActive) return;
  if (Number.isFinite(step)) metrics.b5LastStep = step;
  const character = state.party[0];
  if (!character) return;
  recordB5HpValue(metrics, character.hp, getCharMaxHp(character));
}

function hasSpell(character, spellName) {
  return character.spells?.includes(spellName) === true;
}

function getSpellActionPayment(
  state,
  spellName,
  reserveMp = 0,
  { minHpAfterPaymentRate = state.simPolicy.bloodWandHpPaymentMinRate } = {}
) {
  const character = state.party[0];
  if (!hasSpell(character, spellName)) return null;
  const spell = SPELLS[spellName];
  const payment = getSpellPayment(character, spell.cost);
  if (!payment.canCast) return null;
  if (payment.resource === "mp") {
    return character.mp - reserveMp >= payment.cost ? payment : null;
  }
  if (minHpAfterPaymentRate === null) return payment;
  const minHpAfterPayment =
    getCharMaxHp(character) * minHpAfterPaymentRate;
  return character.hp - payment.cost >= minHpAfterPayment ? payment : null;
}

const AUTO_SPELL_IDS = Object.freeze([
  "HALITO",
  "LAHALITO",
  "MAHALITO",
  "MADALTO",
  "TILTOWAIT",
  "KATINO",
  "BADIOS",
  "DIALMA",
  "MADI",
  "DIOS",
  "MADIOS"
]);

function createSpellUsageMetrics() {
  return Object.fromEntries(AUTO_SPELL_IDS.map(spellName => [spellName, {
    knownRounds: 0,
    castableRounds: 0,
    selected: 0,
    applied: 0,
    failed: 0,
    postCombatCasts: 0,
    postCombatHealingHp: 0
  }]));
}

const SPELL_PRESSURE_PHASES = Object.freeze([
  "combat",
  "exploration",
  "recovery"
]);

function createSpellPressureBucket() {
  return {
    candidateChecks: 0,
    policyWanted: 0,
    policyBlocked: 0,
    mpInsufficient: 0,
    mpBlocked: 0,
    bloodWandCanCast: 0,
    bloodWandBlocked: 0,
    reserveBlocked: 0,
    safetyBlocked: 0
  };
}

function createSpellPressurePhase() {
  return {
    total: createSpellPressureBucket(),
    bySpell: {},
    byFloorAndSpell: {}
  };
}

function createSpellPressureMetrics() {
  return Object.fromEntries(
    SPELL_PRESSURE_PHASES.map(phase => [phase, createSpellPressurePhase()])
  );
}

function addSpellPressureBucket(target, additions) {
  Object.keys(createSpellPressureBucket()).forEach(key => {
    target[key] += additions[key] || 0;
  });
}

function recordSpellPressure(
  metrics,
  phase,
  floor,
  spellName,
  payment,
  actionPayment,
  { policyWanted = true } = {}
) {
  if (!metrics?.[phase] || !SPELLS[spellName] || !payment) return;
  const phaseMetrics = metrics[phase];
  const floorKey = String(Math.max(1, Number(floor) || 1));
  const key = `${floorKey}:${spellName}`;
  const event = {
    candidateChecks: 1,
    policyWanted: Number(policyWanted),
    policyBlocked: Number(policyWanted && !actionPayment),
    // getSpellPayment owns the MP/HP fallback decision. A resource of "hp"
    // means the source function observed insufficient MP without redoing it here.
    // A failed MP payment returns resource="mp" without a blood-wand fallback;
    // a fallback attempt returns resource="hp". Both mean MP was insufficient.
    mpInsufficient: Number(payment.resource === "hp" || !payment.canCast),
    mpBlocked: Number(!payment.canCast),
    bloodWandCanCast: Number(payment.resource === "hp" && payment.canCast),
    bloodWandBlocked: Number(payment.resource === "hp" && !payment.canCast),
    reserveBlocked: Number(
      policyWanted && !actionPayment && payment.resource === "mp" && payment.canCast
    ),
    safetyBlocked: Number(
      policyWanted && !actionPayment && payment.resource === "hp" && payment.canCast
    )
  };
  addSpellPressureBucket(phaseMetrics.total, event);
  const spellBucket = phaseMetrics.bySpell[spellName] ||= createSpellPressureBucket();
  addSpellPressureBucket(spellBucket, event);
  const floorSpellBucket = phaseMetrics.byFloorAndSpell[key] ||= createSpellPressureBucket();
  addSpellPressureBucket(floorSpellBucket, event);
}

function addSpellPressureMetrics(target, source) {
  SPELL_PRESSURE_PHASES.forEach(phase => {
    const targetPhase = target[phase];
    const sourcePhase = source?.[phase];
    if (!sourcePhase) return;
    addSpellPressureBucket(targetPhase.total, sourcePhase.total);
    Object.entries(sourcePhase.bySpell || {}).forEach(([spellName, bucket]) => {
      const destination = targetPhase.bySpell[spellName] ||= createSpellPressureBucket();
      addSpellPressureBucket(destination, bucket);
    });
    Object.entries(sourcePhase.byFloorAndSpell || {}).forEach(([key, bucket]) => {
      const destination = targetPhase.byFloorAndSpell[key] ||= createSpellPressureBucket();
      addSpellPressureBucket(destination, bucket);
    });
  });
}

function finalizeSpellPressureMetrics(metrics) {
  return structuredClone(metrics);
}

const EXPLORATION_SPELL_IDS = Object.freeze([
  "MILWA",
  "LOMILWA",
  "MASFEAL",
  "DUMAPIC"
]);
// DUMAPIC only reports coordinates; it has no combat/depth effect, so the policy does not cast it.

function createExplorationSpellUsageMetrics() {
  return Object.fromEntries(EXPLORATION_SPELL_IDS.map(spellName => [spellName, 0]));
}

function addExplorationSpellUsageAggregate(target, result) {
  EXPLORATION_SPELL_IDS.forEach(spellName => {
    target[spellName] += result.explorationSpellUsage?.[spellName] || 0;
  });
}

function castExplorationSpell(state, spellName, metrics) {
  const character = state.party[0];
  if (!hasSpell(character, spellName)) return false;
  const spell = SPELLS[spellName];
  const payment = getSpellPayment(character, spell.cost);
  const actionPayment = payment.canCast && payment.resource === "mp" ? payment : null;
  recordSpellPressure(
    metrics.mpPressure,
    "exploration",
    state.floor,
    spellName,
    payment,
    actionPayment
  );
  // Exploration spells are paid from MP only; do not use blood-wand HP payment.
  if (!payment.canCast || payment.resource !== "mp") return false;
  character.mp -= payment.cost;
  SPELL_EFFECTS[spellName]({ caster: character, target: state });
  metrics.explorationSpellUsage[spellName]++;
  return true;
}

function maybeCastExplorationSpells(state, metrics) {
  const character = state.party[0];
  if (character.class === "Priest" && state.lightTurns === 0) {
    const candidates = hasSpell(character, "LOMILWA")
      ? ["LOMILWA", "MILWA"]
      : ["MILWA"];
    candidates.some(spellName => castExplorationSpell(state, spellName, metrics));
  }
  if (
    character.class === "Mage" &&
    state.repelTurns === 0 &&
    hasSpell(character, "MASFEAL")
  ) {
    castExplorationSpell(state, "MASFEAL", metrics);
  }
}

const SIM_EXPLORE_SPELLS_ENABLED = process.env.SIM_EXPLORE_SPELLS === "on";

function addSpellUsageAggregate(target, result) {
  Object.entries(result.spellUsage || {}).forEach(([spellName, usage]) => {
    if (!target[spellName]) target[spellName] = createSpellUsageMetrics()[spellName];
    Object.keys(target[spellName]).forEach(key => {
      target[spellName][key] += usage[key] || 0;
    });
  });
}

function recordSpellSelectionMetrics(state, metrics, action) {
  const character = state.party[0];
  const reserveMp = hasSpell(character, "DIOS") ? 1 : 0;
  AUTO_SPELL_IDS.forEach(spellName => {
    if (!hasSpell(character, spellName)) return;
    const usage = metrics.spellUsage[spellName];
    usage.knownRounds++;
    const paymentReserve = PRIEST_HEALING_SPELL_IDS.includes(spellName)
      ? 0
      : reserveMp;
    usage.castableRounds += Number(Boolean(
      getSpellActionPayment(state, spellName, paymentReserve)
    ));
    usage.selected += Number(action.type === "spell" && action.spellName === spellName);
  });
  if (
    character.class === "Priest" &&
    hasSpell(character, "DIOS") &&
    action.type === "spell" &&
    SPELLS[action.spellName]?.target?.includes("enemy")
  ) {
    metrics.reserveMpViolations += Number(!getSpellActionPayment(state, action.spellName, 1));
  }
}

function recordSpellApplicationMetrics(metrics, action, logQueue) {
  if (action.type !== "spell" || !metrics.spellUsage[action.spellName]) return;
  const usage = metrics.spellUsage[action.spellName];
  const applied = logQueue.some(({ msg = "" }) =>
    msg.startsWith("[味方]") && msg.includes("唱えた") && !msg.includes("唱えようとした")
  );
  usage.applied += Number(applied);
  usage.failed += Number(!applied);
}

function recordSpellResourceMetrics(metrics, characterBefore, characterAfter) {
  const spellcaster = AUTO_SPELL_IDS.some(spellName => hasSpell(characterBefore, spellName));
  if (!spellcaster) return;
  metrics.mpZeroCombatRounds += Number(characterBefore.mp <= 0 || characterAfter.mp <= 0);
  metrics.mpDepleted ||= characterBefore.mp <= 0 || characterAfter.mp <= 0;
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

function recordPickupAttempt(metrics, source, category, accepted) {
  if (!metrics) return;
  metrics.pickupAttemptsBySource[source]++;
  if (accepted) return;
  metrics.pickupRejectionsBySource[source]++;
  metrics.pickupRejectionsByCategory[category]++;
}

function tryAddInventoryItem(state, item, metrics, source) {
  const itemData = getItemData(item);
  const category = isEquipment(itemData) ? "equipment" : "item";
  const accepted = addInventoryItemToState(state, item);
  recordPickupAttempt(metrics, source, category, accepted);
  if (accepted && TRACKED_CONSUMABLES[item]) {
    recordTrackedConsumableAcquisition(state, metrics, item, source);
  }
  return accepted;
}

function recordMaterialPickup(metrics, materials) {
  if (!metrics || totalMaterials(materials) <= 0) return;
  // Materials are stored outside inventory and therefore cannot be rejected by the 20-slot cap.
  metrics.pickupAttemptsBySource.material++;
}

function recordHealPotionAcquisition(state, metrics, source, count = 1) {
  if (!metrics || count <= 0) return;
  metrics.healPotionsAcquiredBySource[source] =
    (metrics.healPotionsAcquiredBySource[source] || 0) + count;
  for (let index = 0; index < count; index++) {
    state.simHealPotionSources.push(source);
  }
}

const TRACKED_CONSUMABLES = Object.freeze({
  MANA_POTION: Object.freeze({
    sourceQueue: "simManaPotionSources",
    acquired: "manaPotionsAcquiredBySource",
    consumed: "manaPotionsConsumedBySource"
  }),
  HOLY_WATER: Object.freeze({
    sourceQueue: "simHolyWaterSources",
    acquired: "holyWaterAcquiredBySource",
    consumed: "holyWaterConsumedBySource"
  })
});

function normalizeTrackedConsumableSource(source) {
  return TRACKED_CONSUMABLE_SOURCE_IDS.includes(source) ? source : "other";
}

function recordTrackedConsumableAcquisition(state, metrics, itemKey, source, count = 1) {
  const config = TRACKED_CONSUMABLES[itemKey];
  if (!metrics || !config || count <= 0) return;
  const normalizedSource = normalizeTrackedConsumableSource(source);
  metrics[config.acquired][normalizedSource] += count;
  for (let index = 0; index < count; index++) {
    state[config.sourceQueue].push(normalizedSource);
  }
}

function recordTrackedConsumableConsumption(state, metrics, itemKey, count = 1) {
  const config = TRACKED_CONSUMABLES[itemKey];
  if (!metrics || !config || count <= 0) return;
  for (let index = 0; index < count; index++) {
    const source = state[config.sourceQueue].shift() || "other";
    metrics[config.consumed][normalizeTrackedConsumableSource(source)]++;
  }
}

function recordRecoveryPotionOffer(metrics, source, itemKey) {
  if (!metrics || !["HEAL_POTION", "GREATER_HEAL"].includes(itemKey)) return;
  const bySource = metrics.recoveryPotionOffersBySource[source] ||= {
    HEAL_POTION: 0,
    GREATER_HEAL: 0
  };
  bySource[itemKey]++;
}

function shouldGrantNormalizedHealPotion(state) {
  const normalization = state.simPolicy?.healPotionSupplyNormalization;
  if (!normalization) return true;
  const baseUnit = Number(normalization.baseUnit);
  const targetUnit = Number(normalization.targetUnit);
  if (!Number.isFinite(baseUnit) || !Number.isFinite(targetUnit) || targetUnit <= baseUnit) {
    return true;
  }
  return Math.random() < baseUnit / targetUnit;
}

function recoveryLevelBand(level) {
  if (level <= 1) return "L1";
  if (level <= 3) return "L2-3";
  if (level <= 6) return "L4-6";
  return "L7+";
}

const RECOVERY_LEVEL_BANDS = Object.freeze(["L1", "L2-3", "L4-6", "L7+"]);

function createRecoveryHealingStats() {
  return { uses: 0, requestedHp: 0, actualHp: 0, overhealHp: 0 };
}

function createRecoveryHealingByLevelBand() {
  return Object.fromEntries(
    RECOVERY_LEVEL_BANDS.map(band => [
      band,
      createRecoveryHealingStats()
    ])
  );
}

function recordRecoveryHealing(metrics, itemKey, level, requestedHp, actualHp) {
  if (!metrics || !["HEAL_POTION", "GREATER_HEAL"].includes(itemKey)) return;
  const requested = Math.max(0, Number(requestedHp) || 0);
  const actual = Math.max(0, Number(actualHp) || 0);
  const target = metrics.recoveryHealing;
  const itemStats = target.byItem[itemKey];
  const levelStats = target.byLevelBand[recoveryLevelBand(Number(level) || 1)];
  [target.total, itemStats, levelStats].forEach(stats => {
    stats.uses++;
    stats.requestedHp += requested;
    stats.actualHp += actual;
    stats.overhealHp += Math.max(0, requested - actual);
  });
}

function recordHealPotionConsumption(state, metrics, count = 1) {
  if (!metrics || count <= 0) return;
  for (let index = 0; index < count; index++) {
    const source = state.simHealPotionSources.shift() || "other";
    metrics.healPotionsConsumedBySource[source] =
      (metrics.healPotionsConsumedBySource[source] || 0) + 1;
  }
}

function recordGreaterHealAcquisition(state, metrics, source, count = 1) {
  if (!metrics || count <= 0) return;
  metrics.greaterHealPotionsAcquiredBySource[source] =
    (metrics.greaterHealPotionsAcquiredBySource[source] || 0) + count;
  for (let index = 0; index < count; index++) {
    state.simGreaterHealSources.push(source);
  }
}

function recordGreaterHealConsumption(state, metrics, count = 1) {
  if (!metrics || count <= 0) return;
  for (let index = 0; index < count; index++) {
    const source = state.simGreaterHealSources.shift() || "other";
    metrics.greaterHealPotionsConsumedBySource[source] =
      (metrics.greaterHealPotionsConsumedBySource[source] || 0) + 1;
  }
}

function addRecoveryPotionUse(metrics, itemKey, count = 1) {
  if (!metrics || count <= 0 || !["HEAL_POTION", "GREATER_HEAL"].includes(itemKey)) return;
  metrics.recoveryPotionsUsed += count;
  metrics.outsideRecoveryPotionsUsed += count;
  if (itemKey === "HEAL_POTION") {
    metrics.healPotionsUsed += count;
    metrics.outsideHealPotionsUsed += count;
  }
  if (itemKey === "GREATER_HEAL") {
    metrics.greaterHealPotionsUsed += count;
    metrics.outsideGreaterHealPotionsUsed += count;
  }
}

function getRecoveryPotionItem(state) {
  const character = state.party[0];
  const maxHp = getCharMaxHp(character);
  if (
    !isAlive(character) ||
    character.hp > maxHp * state.simPolicy.healPotionThreshold
  ) return null;
  if (hasRecoveryPotion(state, "GREATER_HEAL")) return "GREATER_HEAL";
  if (hasRecoveryPotion(state, "HEAL_POTION")) return "HEAL_POTION";
  return null;
}

function useManaPotionIfNeeded(state, metrics) {
  const character = state.party[0];
  if (
    !isAlive(character) ||
    !canUseManaItems(character) ||
    character.mp > getCharMaxMp(character) * state.simPolicy.manaPotionThreshold
  ) return null;
  const itemIndex = state.inventory.indexOf("MANA_POTION");
  if (itemIndex < 0) return null;
  state.inventory.splice(itemIndex, 1);
  recordTrackedConsumableConsumption(state, metrics, "MANA_POTION");
  ITEM_EFFECTS.MANA_POTION({ char: character });
  metrics.manaPotionsUsed++;
  return "MANA_POTION";
}

function recordRecoveryPotionTiming(state, metrics) {
  const remaining = state.inventory.filter(item =>
    item === "HEAL_POTION" || item === "GREATER_HEAL"
  ).length;
  if (remaining === 0 && metrics.recoveryPotionDepletedFloor === null) {
    metrics.recoveryPotionDepletedFloor = state.floor;
  }
}

function hasRecoveryPotion(state, itemKey = null) {
  return itemKey
    ? state.inventory.includes(itemKey)
    : state.inventory.includes("GREATER_HEAL") || state.inventory.includes("HEAL_POTION");
}

function getLegacyMageCombatAction({
  character,
  monsters,
  roundNumber,
  canCastSpell = () => false
}) {
  const statusTargetIdx = getLowestHpEnemyIndex(
    monsters,
    monster => monster.status && !["ok", "dead"].includes(monster.status)
  );
  const lowestHpIdx = statusTargetIdx >= 0
    ? statusTargetIdx
    : getLowestHpEnemyIndex(monsters);
  const livingMonsters = monsters.filter(monster => monster.hp > 0);
  const reserveMp = hasSpell(character, "DIOS") ? 1 : 0;
  const canCast = spellName =>
    hasSpell(character, spellName) && canCastSpell(spellName, reserveMp);

  if (roundNumber === 1 && livingMonsters.length >= 2 && canCast("KATINO")) {
    return { type: "spell", targetIdx: lowestHpIdx, spellName: "KATINO" };
  }
  if (canCast("HALITO")) {
    return { type: "spell", targetIdx: lowestHpIdx, spellName: "HALITO" };
  }
  return { type: "fight", targetIdx: lowestHpIdx };
}

function chooseSimulationAutoCombatAction(args) {
  if (ISSUE538_LEGACY_SPELL_POLICY && args.character.class === "Mage") {
    return getLegacyMageCombatAction(args);
  }
  const isPriest = args.character.class === "Priest";
  const maskedSpellIds = isPriest ? getSimulationPriestHealingSpellIds() : null;
  if (!maskedSpellIds || !args.character.spells) return chooseAutoCombatAction(args);
  const character = {
    ...args.character,
    spells: args.character.spells.filter(spellName =>
      !PRIEST_HEALING_SPELL_IDS.includes(spellName) || maskedSpellIds.includes(spellName)
    )
  };
  return chooseAutoCombatAction({
    ...args,
    character
  });
}

function getCombatPolicyProbeAction(state) {
  const character = state.party[0];
  return chooseSimulationAutoCombatAction({
    character,
    monsters: state.combatState.monsters,
    roundNumber: state.combatState.roundNumber,
    healingTargetIdx: getAutoHealTargetIdx(
      character,
      state.simPolicy.healPotionThreshold
    ),
    // Diagnostic only: let the existing selector reveal its preferred spell,
    // then ask getSpellPayment whether the source can actually pay for it.
    canCastSpell: () => true
  });
}

function recordCombatSpellPressure(state, metrics, actualAction) {
  if (!actualAction || !["fight", "spell"].includes(actualAction.type)) return;
  const probeAction = getCombatPolicyProbeAction(state);
  if (probeAction?.type !== "spell") return;
  const spell = SPELLS[probeAction.spellName];
  if (!spell) return;
  const character = state.party[0];
  const payment = getSpellPayment(character, spell.cost);
  const reserveMp = PRIEST_HEALING_SPELL_IDS.includes(probeAction.spellName)
    ? 0
    : (hasSpell(character, "DIOS") ? 1 : 0);
  const actionPayment = getSpellActionPayment(
    state,
    probeAction.spellName,
    reserveMp
  );
  recordSpellPressure(
    metrics.mpPressure,
    "combat",
    state.floor,
    probeAction.spellName,
    payment,
    actionPayment
  );
}

function getSimulationPreferredOffensiveSpellName(character, monsters, canCastSpell) {
  if (ISSUE538_LEGACY_SPELL_POLICY && character.class === "Mage") {
    return hasSpell(character, "HALITO") ? "HALITO" : null;
  }
  return getPreferredOffensiveSpellName(character, monsters, canCastSpell);
}

function getDiosCombatAction(state) {
  const character = state.party[0];
  const healingSpellIds = getSimulationPriestHealingSpellIds();
  const healingTargetIdx = getAutoHealTargetIdx(
    character,
    state.simPolicy.healPotionThreshold
  );
  if (
    healingTargetIdx === null ||
    !character.spells?.some(spellName => healingSpellIds.includes(spellName))
  ) return null;
  const action = chooseSimulationAutoCombatAction({
    character,
    monsters: state.combatState?.monsters || [],
    roundNumber: state.combatState?.roundNumber || 1,
    healingTargetIdx,
    canCastSpell: (spellName, reserveMp) =>
      getSpellActionPayment(state, spellName, reserveMp, { minHpAfterPaymentRate: null })
  });
  return action?.type === "spell" && healingSpellIds.includes(action.spellName)
    ? { ...action, actorIdx: 0 }
    : null;
}

function getExpectedDiosHeal(state) {
  const character = structuredClone(state.party[0]);
  const action = getDiosCombatAction(state);
  const spellName = action?.spellName || "DIOS";
  return SPELL_EFFECTS[spellName]({
    caster: character,
    target: character,
    rng: () => 0.5
  }).heal || 0;
}

function recordDiosPotionPriorityCase(
  state,
  metrics,
  recoveryItem,
  diosAction,
  selectedAction
) {
  if (!metrics || !recoveryItem || !diosAction) return;
  metrics.diosPotionPriorityOpportunities++;
  if (selectedAction.type !== "item") return;
  metrics.diosPotionPriorityCases++;
  if (!metrics.diosPotionPriorityEventSamples ||
      metrics.diosPotionPriorityEventSamples.length >= 20) return;
  const character = state.party[0];
  const payment = getSpellPayment(character, SPELLS[diosAction.spellName].cost);
  metrics.diosPotionPriorityEventSamples.push({
    runSeed: state.currentRun.runSeed,
    floor: state.floor,
    round: state.combatState?.roundNumber || null,
    hp: character.hp,
    maxHp: getCharMaxHp(character),
    mp: character.mp,
    maxMp: getCharMaxMp(character),
    recoveryItem,
    diosPaymentResource: payment.resource,
    diosPaymentCost: payment.cost,
    diosSpellName: diosAction.spellName,
    selectedAction: selectedAction.type,
    selectedItem: selectedAction.itemKey
  });
}

function getEnemyAwareCombatAction(state, recoveryItem, diosAction) {
  const character = state.party[0];
  const livingMonsters = state.combatState.monsters.filter(monster => monster.hp > 0);
  const decision = calculateCombatRecoveryAction({
    currentHp: character.hp,
    maxHp: getCharMaxHp(character),
    enemyHp: livingMonsters.map(monster => monster.hp),
    enemyAttack: livingMonsters.map(monster => monster.atk || 0),
    playerDefense: getCharDef(character),
    playerDamagePerRound: getCharWeaponAtk(character),
    potionHeal: recoveryItem ? getSimulationHealAmount(state, recoveryItem) : 0,
    diosHeal: diosAction ? getExpectedDiosHeal(state) : 0,
    potionAvailable: Boolean(recoveryItem),
    diosAvailable: Boolean(diosAction),
    fleeThreshold: state.simPolicy.fleeHpThreshold ?? 0.20,
    healThreshold: state.simPolicy.healPotionThreshold
  });
  if (decision === "flee") {
    return { decision, action: { type: "run", actorIdx: 0 } };
  }
  if (decision !== "recover") return { decision, action: null };
  const action = state.simPolicy.healPriorityPolicy === "dios-first" && diosAction
    ? diosAction
    : recoveryItem
      ? { type: "item", actorIdx: 0, targetIdx: 0, itemKey: recoveryItem }
      : diosAction;
  return { decision, action };
}

export function getSimulationHealAmount(state, itemKey) {
  const character = state.party[0];
  const maxHp = getCharMaxHp(character);
  const override = itemKey === "HEAL_POTION"
    ? state.simPolicy?.healPotionAmountOverride
    : null;
  let baseAmount = itemKey === "GREATER_HEAL" ? 40 : 15;
  if (override?.kind === "fixed") {
    baseAmount = Number(override.amount);
  } else if (override?.kind === "max-hp-ratio") {
    baseAmount = Math.round(maxHp * Number(override.ratio));
  } else if (override?.kind === "floor-scale") {
    baseAmount = Number(override.base ?? 15) +
      Math.max(0, state.floor - 1) * Number(override.perFloor ?? 0);
  }
  return getEffectiveHealAmount(character, Math.max(0, Math.round(baseAmount)));
}

function applySimulationHealItem(state, itemKey, character = state.party[0]) {
  const heal = getSimulationHealAmount(state, itemKey);
  character.hp = Math.min(getCharMaxHp(character), character.hp + heal);
  return `${character.name}は${itemKey === "GREATER_HEAL" ? "上薬" : "傷薬"}を使い、HPが${heal}回復した。`;
}

function withSimulationHealEffects(state, callback) {
  const originalHealPotion = ITEM_EFFECTS.HEAL_POTION;
  const originalGreaterHeal = ITEM_EFFECTS.GREATER_HEAL;
  const healPotionOverride = state.simPolicy?.healPotionAmountOverride;
  ITEM_EFFECTS.HEAL_POTION = ({ char }) => healPotionOverride
    ? applySimulationHealItem(state, "HEAL_POTION", char)
    : originalHealPotion({ char });
  ITEM_EFFECTS.GREATER_HEAL = ({ char }) => originalGreaterHeal({ char });
  try {
    return callback();
  } finally {
    ITEM_EFFECTS.HEAL_POTION = originalHealPotion;
    ITEM_EFFECTS.GREATER_HEAL = originalGreaterHeal;
  }
}

function recordTrapKitAcquisition(state, metrics, source, count = 1) {
  if (!metrics || count <= 0) return;
  metrics.trapKitsAcquired += count;
  metrics.trapKitsAcquiredBySource[source] =
    (metrics.trapKitsAcquiredBySource[source] || 0) + count;
  for (let index = 0; index < count; index++) {
    state.simTrapKitSources.push(source);
  }
}

function recordTrapKitConsumption(state, metrics, count = 1) {
  if (!metrics || count <= 0) return;
  for (let index = 0; index < count; index++) {
    const source = state.simTrapKitSources.shift() || "other";
    metrics.trapKitsUsed++;
    metrics.trapKitsConsumedBySource[source] =
      (metrics.trapKitsConsumedBySource[source] || 0) + 1;
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
  let recoveryItem = null;
  let diosAction = null;
  let evRecoveryAction = null;
  let evShouldFight = false;
  if (state.simPolicy.fleePolicy === "ev") {
    recoveryItem = getRecoveryPotionItem(state);
    diosAction = getDiosCombatAction(state);
    const evResult = getEnemyAwareCombatAction(state, recoveryItem, diosAction);
    if (evResult.action?.type === "run") return evResult.action;
    evRecoveryAction = evResult.decision === "recover" ? evResult.action : null;
    evShouldFight = evResult.decision === "fight";
  } else if (
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

  recoveryItem ||= getRecoveryPotionItem(state);
  diosAction ||= getDiosCombatAction(state);
  const diosPriorityAction = state.simPolicy.healPriorityPolicy === "dios-first"
    ? diosAction
    : recoveryItem
      ? { type: "item", actorIdx: 0, targetIdx: 0, itemKey: recoveryItem }
      : diosAction;
  recordDiosPotionPriorityCase(
    state,
    metrics,
    recoveryItem,
    diosAction,
    evShouldFight ? { type: "fight" } : (evRecoveryAction || diosPriorityAction)
  );
  if (evRecoveryAction) return evRecoveryAction;
  if (!evShouldFight && diosPriorityAction) return diosPriorityAction;

  const reserveMp = hasSpell(character, "DIOS") ? 1 : 0;
  const sharedAutoAction = chooseSimulationAutoCombatAction({
    character,
    monsters,
    roundNumber: state.combatState.roundNumber,
    canCastSpell: (spellName, reserveMp) =>
      getSpellActionPayment(state, spellName, reserveMp)
  });
  if (sharedAutoAction?.type === "spell") return { ...sharedAutoAction, actorIdx: 0 };
  if (evShouldFight) return { type: "fight", actorIdx: 0, targetIdx: lowestHpIdx };
  if (diosPriorityAction) return diosPriorityAction;
  if (sharedAutoAction) return { ...sharedAutoAction, actorIdx: 0 };

  if (character.class === "Bishop") {
    const holyTargetIdx = getLowestHpEnemyIndex(monsters, hasHolyTag);
    if (holyTargetIdx >= 0 && getSpellActionPayment(state, "BADIOS", reserveMp)) {
      return { type: "spell", actorIdx: 0, targetIdx: holyTargetIdx, spellName: "BADIOS" };
    }
    if (getSpellActionPayment(state, "HALITO", reserveMp)) {
      return { type: "spell", actorIdx: 0, targetIdx: lowestHpIdx, spellName: "HALITO" };
    }
  }

  if (
    (character.class === "Mage" || character.class === "Samurai") &&
    getSpellActionPayment(state, "HALITO", reserveMp)
  ) {
    return { type: "spell", actorIdx: 0, targetIdx: lowestHpIdx, spellName: "HALITO" };
  }

  if (character.class === "Ranger" && getSpellActionPayment(state, "BADIOS", reserveMp)) {
    const holyTargetIdx = getLowestHpEnemyIndex(monsters, hasHolyTag);
    return {
      type: "spell",
      actorIdx: 0,
      targetIdx: holyTargetIdx >= 0 ? holyTargetIdx : lowestHpIdx,
      spellName: "BADIOS"
    };
  }

  return { type: "fight", actorIdx: 0, targetIdx: lowestHpIdx };
}

function getBloodWandOpportunity(state, action, observations = null) {
  const character = state.party[0];
  let spellName = null;
  let opportunityType = null;
  if (action.type === "fight") {
    const recoveryAction = getDiosCombatAction(state);
    if (
      character.hp < getCharMaxHp(character) * state.simPolicy.healPotionThreshold &&
      recoveryAction &&
      (state.simPolicy.bloodWandHealPolicy === "allow-recovery-potion" ||
        !hasRecoveryPotion(state))
    ) {
      spellName = recoveryAction.spellName;
      opportunityType = "heal";
    } else {
      spellName = getSimulationPreferredOffensiveSpellName(
        character,
        state.combatState.monsters,
        (name, reserveMp) => getSpellActionPayment(state, name, reserveMp)
      );
      opportunityType = spellName ? "offense" : null;
    }
  } else if (action.type === "spell") {
    if (PRIEST_HEALING_SPELL_IDS.includes(action.spellName)) {
      spellName = action.spellName;
      opportunityType = "heal";
    } else if (SPELLS[action.spellName]?.target?.includes("enemy")) {
      spellName = action.spellName;
      opportunityType = "offense";
    }
  }
  if (!spellName) return null;
  const payment = getSpellPayment(character, SPELLS[spellName].cost);
  if (observations && payment.resource === "hp") {
    observations.bloodWandHpPaymentReturns++;
    observations.bloodWandHpPaymentCanCast += Number(payment.canCast);
  }
  return payment.canCast && payment.resource === "hp" ? opportunityType : null;
}

const BLOOD_WAND_ACTIVATION_LOG = getCoreLogText("CORE_BLOOD_WAND");

function countLoggedCoreActivations(observations, logQueue) {
  const loggedCoreIds = [
    "CORE_LAST_STAND",
    "CORE_OPENER",
    "CORE_GIANT_SLAYER",
    "CORE_THORN_SHIELD",
    "CORE_BOUNTY_HUNTER",
    "CORE_EXECUTIONER"
  ];
  loggedCoreIds.forEach(coreId => {
    const message = getCoreLogText(coreId);
    observations.coreActivationCounts[coreId] += logQueue.filter(
      entry => entry.msg === message
    ).length;
  });
  observations.coreActivationCounts.CORE_PURIFY_RING += logQueue.filter(
    entry => entry.purifyRecovery &&
      (entry.purifyRecovery.mpRecovered > 0 || entry.purifyRecovery.hpRecovered > 0)
  ).length;
}

function getBloodWandActivationType(action, logQueue) {
  if (
    action.type !== "spell" ||
    !logQueue.some(entry => entry.msg === BLOOD_WAND_ACTIVATION_LOG)
  ) return null;
  if (PRIEST_HEALING_SPELL_IDS.includes(action.spellName)) return "heal";
  return SPELLS[action.spellName]?.target?.includes("enemy")
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

function getLoggedHealing(logQueue, character) {
  const entry = logQueue.find(({ msg = "" }) =>
    msg.startsWith("[味方]") &&
    msg.includes(`${character.name}は`) &&
    msg.includes("唱えた") &&
    msg.includes("HPを")
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
  stateBeforeRound,
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
  const lastStandParams = getCharCoreParams(characterBefore, "CORE_LAST_STAND");
  const giantSlayerParams = getCharCoreParams(characterBefore, "CORE_GIANT_SLAYER");
  const executionerParams = getCharCoreParams(characterBefore, "CORE_EXECUTIONER");
  const bloodWandParams = getCharCoreParams(characterBefore, "CORE_BLOOD_WAND");
  const curseKeeperParams = getCharCoreParams(characterBefore, "CORE_CURSE_KEEPER");

  if (bloodWandParams) {
    observations.bloodWandActiveRounds++;
    observations.bloodWandMpEmptyRounds += Number(characterBefore.mp <= 0);
    const spellName = action.type === "spell"
      ? action.spellName
      : getSimulationPreferredOffensiveSpellName(
        characterBefore,
        monstersBeforeRound,
        (name, reserveMp) => getSpellActionPayment(stateBeforeRound, name, reserveMp)
      );
    const spellCost = spellName ? SPELLS[spellName]?.cost : null;
    observations.bloodWandSelectedSpellRounds += Number(Number.isFinite(spellCost));
    observations.bloodWandNoEligibleSpellRounds += Number(!Number.isFinite(spellCost));
    observations.bloodWandMpInsufficientRounds += Number(
      Number.isFinite(spellCost) && characterBefore.mp < spellCost
    );
  }

  if (offensive) {
    observations.offensiveTurns++;
    const lastStand = CORE_AFFIX_BY_ID.get("CORE_LAST_STAND").params;
    const hpAtAction = getHpAtOffensiveAction(logQueue, characterBefore, action);
    if (
      hpAtAction !== null &&
      hpAtAction / Math.max(1, getCharMaxHp(characterBefore)) <= lastStand.hpThreshold
    ) {
      observations.lowHpOffensiveTurns++;
      if (lastStandParams) {
        observations.coreOpportunityCounts.CORE_LAST_STAND++;
      }
    }
    if (targetBeforeRound?.maxHp > getCharMaxHp(characterBefore)) {
      observations.giantTargetTurns++;
      if (giantSlayerParams) {
        observations.coreOpportunityCounts.CORE_GIANT_SLAYER++;
      }
    }
    if (targetBeforeRound?.status && !["ok", "dead"].includes(targetBeforeRound.status)) {
      observations.statusTargetTurns++;
      if (executionerParams) {
        observations.coreOpportunityCounts.CORE_EXECUTIONER++;
      }
    }
    observations.curseSamples++;
    const equippedCurseCount = getEquippedCurseCount(characterBefore);
    observations.equippedCurseTotal += equippedCurseCount;
    if (curseKeeperParams && equippedCurseCount > 0) {
      observations.coreOpportunityCounts.CORE_CURSE_KEEPER++;
      const strGain = Math.max(
        0,
        getCharStr(characterBefore) -
          getCharStrWithoutCore(characterBefore, "CORE_CURSE_KEEPER")
      );
      observations.curseKeeperStrGainTotal += strGain;
      observations.curseKeeperStrGainCases++;
      observations.coreActivationCounts.CORE_CURSE_KEEPER += Number(strGain > 0);
    }
  }

  if (action.type === "fight") {
    observations.fightTurns++;
    observations.fightDamageActions++;
    observations.fightDamage += sumLoggedDamage(logQueue, characterAfter, "fight");
    observations.openerFirstStrikeFightTurns += Number(firstStrikeSucceeded);
    if (
      firstStrikeSucceeded &&
      getCharCoreParams(characterBefore, "CORE_OPENER")
    ) {
      observations.coreOpportunityCounts.CORE_OPENER++;
    }
  } else if (spell?.target?.includes("enemy") && action.spellName !== "KATINO") {
    observations.spellDamageActions++;
    observations.spellDamage += sumLoggedDamage(logQueue, characterAfter, "spell");
  } else if (action.type === "spell" && PRIEST_HEALING_SPELL_IDS.includes(action.spellName)) {
    observations.diosHealActions++;
    observations.diosHealing += getLoggedHealing(logQueue, characterAfter);
  }

  const incomingPhysicalLogs = logQueue.filter(({ msg = "" }) =>
    msg.startsWith("[ 敵 ]") && /の(?:攻撃|狙撃)！/.test(msg)
  );
  observations.incomingPhysicalAttempts += incomingPhysicalLogs.length;
  observations.incomingPhysicalHits += incomingPhysicalLogs.filter(({ msg = "" }) =>
    /に\d+のダメージ/.test(msg)
  ).length;
  if (getCharCoreParams(characterBefore, "CORE_THORN_SHIELD")) {
    observations.coreOpportunityCounts.CORE_THORN_SHIELD += incomingPhysicalLogs.length;
  }

  // #312: 発動を潰しているのが「対象タグ」なのか「MPに空き」なのかを切り分けるため、
  // 撃破総数・タグ一致撃破・MP空きあり撃破の3段を数える。
  const newlyDefeated = monstersBeforeRound.filter(({ hp }, index) =>
    hp > 0 && roundResult.state.combatState.monsters[index]?.hp <= 0
  );
  const purifyParams = CORE_AFFIX_BY_ID.get("CORE_PURIFY_RING").params;
  const newlyDefeatedPurifyTargets = newlyDefeated.filter(target =>
    isPurifyTarget(target, purifyParams.targetTags)
  );
  observations.totalKills += newlyDefeated.length;
  observations.purifyTagKills += newlyDefeatedPurifyTargets.length;
  if (characterAfter.mp < getCharMaxMp(characterAfter)) {
    observations.purifyKillsWithMpRoom += newlyDefeatedPurifyTargets.length;
    observations.killsWithMpRoom += newlyDefeated.length;
  }
  if (getCharMaxMp(characterAfter) > 0) {
    observations.purifyTagKillsByCaster += newlyDefeatedPurifyTargets.length;
  }

  let potentialMp = characterAfter.mp;
  let potentialHp = characterAfter.hp;
  newlyDefeatedPurifyTargets.forEach(target => {
    const recovery = resolvePurifyRecovery({
      target,
      targetTags: purifyParams.targetTags,
      hp: potentialHp,
      maxHp: getCharMaxHp(characterAfter),
      mp: potentialMp,
      maxMp: getCharMaxMp(characterAfter),
      mpRecovery: purifyParams.mpRecovery,
      fullMpHpRecovery: purifyParams.fullMpHpRecovery
    });
    potentialMp += recovery.mpRecovered;
    potentialHp += recovery.hpRecovered;
    observations.purifyPotentialMpRecovered += recovery.mpRecovered;
    observations.purifyPotentialHpRecovered += recovery.hpRecovered;
    if (getCharCoreParams(characterAfter, "CORE_PURIFY_RING")) {
      observations.coreOpportunityCounts.CORE_PURIFY_RING++;
    }
  });
  roundResult.logQueue.forEach(entry => {
    const recovery = entry.purifyRecovery;
    if (!recovery) return;
    observations.purifyEffectEvents++;
    observations.purifyMpRecovered += recovery.mpRecovered || 0;
    observations.purifyHpRecovered += recovery.hpRecovered || 0;
  });
  countLoggedCoreActivations(observations, logQueue);
}

function isStatusCapableMonster(monster) {
  return Boolean(
    monster?.isPoisonous ||
    monster?.isBlinding ||
    monster?.isParalyzing ||
    monster?.isSleepInflicting
  );
}

function getStatusScalingProgress(floor, override) {
  const startFloor = Math.max(1, Number(override?.startFloor) || 6);
  const endFloor = Math.max(startFloor, Number(override?.endFloor) || 20);
  return Math.max(0, Math.min(1, (floor - startFloor) / (endFloor - startFloor)));
}

function addStatusEncounterMonster(monsters, floor) {
  const poolNames = getEncounterPoolForFloor(floor);
  const candidates = poolNames
    .map(name => MONSTERS.find(monster => monster.name === name))
    .filter(isStatusCapableMonster);
  if (!candidates.length) return false;
  const template = candidates[Math.floor(Math.random() * candidates.length)];
  const replacementIndex = monsters.findIndex(monster => !isStatusCapableMonster(monster));
  const index = replacementIndex >= 0 ? replacementIndex : 0;
  const replacement = scaleEnemyForDepth(template, floor);
  monsters[index] = {
    ...replacement,
    isRare: monsters[index]?.isRare || false
  };
  return true;
}

function applyStatusScalingOverride(monsters, floor, override) {
  if (!override || floor < (Number(override.startFloor) || 6)) return;

  const progress = getStatusScalingProgress(floor, override);
  const encounterProbability = override.forceStatusEncounter
    ? 1
    : progress * Math.max(0, Math.min(1, Number(override.encounterProbabilityAtMax) || 0));
  if (
    !monsters.some(isStatusCapableMonster) &&
    encounterProbability > 0 &&
    Math.random() < encounterProbability
  ) {
    addStatusEncounterMonster(monsters, floor);
  }

  monsters.filter(isStatusCapableMonster).forEach(monster => {
    const baseChance = Number.isFinite(monster.statusChance)
      ? monster.statusChance
      : 0.35;
    const scaledChance = override.forceStatusChance
      ? 1
      : baseChance * (
          1 + progress * (Math.max(1, Number(override.chanceMultiplierAtMax) || 1) - 1)
        );
    monster.statusChance = Math.max(0, Math.min(1, scaledChance));
  });
}

function isRaceBiasCandidate(monster) {
  return Boolean(monster?.tags?.length) &&
    !monster.isBoss &&
    !monster.isMidboss &&
    !monster.isRare &&
    !monster.dangerRare &&
    !monster.treasureRare;
}

function getRaceBiasCandidates(targetRace, role = null) {
  const candidates = MONSTERS.filter(monster =>
    isRaceBiasCandidate(monster) && monster.tags.includes(targetRace)
  );
  const roleCandidates = role
    ? candidates.filter(monster => monster.role === role)
    : [];
  return roleCandidates.length ? roleCandidates : candidates;
}

function applyRaceDifficultyOverride(monster, override) {
  const hpMultiplier = Number.isFinite(override?.hpMultiplier)
    ? override.hpMultiplier
    : 1;
  const atkMultiplier = Number.isFinite(override?.atkMultiplier)
    ? override.atkMultiplier
    : 1;
  const defMultiplier = Number.isFinite(override?.defMultiplier)
    ? override.defMultiplier
    : 1;
  const maxHp = Math.max(1, Math.round(monster.maxHp * hpMultiplier));
  return {
    ...monster,
    maxHp,
    hp: maxHp,
    atk: Math.max(1, Math.round(monster.atk * atkMultiplier)),
    def: Math.max(0, Math.round(monster.def * defMultiplier))
  };
}

function applyRaceBiasOverride(monsters, floor, override) {
  if (!override || !override.targetRace || floor < (Number(override.startFloor) || 3)) return;
  const bias = override.forceRaceEncounter
    ? 1
    : Math.max(0, Math.min(1, Number(override.poolBias) || 0));
  if (bias <= 0) return;

  monsters.forEach((monster, index) => {
    if (bias < 1 && Math.random() >= bias) return;
    const candidates = getRaceBiasCandidates(override.targetRace, monster.role);
    if (!candidates.length) return;
    const template = candidates[Math.floor(Math.random() * candidates.length)];
    const replacement = {
      ...scaleEnemyForDepth(template, floor),
      isRare: Boolean(monster.isRare)
    };
    monsters[index] = applyRaceDifficultyOverride(replacement, override);
  });
}

const SIM_RACE_EFFECT_SLOT = "__sim_race_bias_effect";
const SIM_COUNTERMEASURE_EFFECT_SLOT = "__sim_countermeasure_effect";

function applyRaceEffectScale(state, override) {
  const multiplier = Number(override?.antiEffectMultiplier) || 1;
  const affixType = override?.affixType;
  if (!affixType || multiplier <= 1) return [];
  const patches = [];
  state.party.forEach(character => {
    if (!character?.equipment) return;
    const currentValue = getCharAffixSum(character, affixType);
    const delta = currentValue * (multiplier - 1);
    if (delta <= 0) return;
    patches.push({
      character,
      hadPrevious: Object.hasOwn(character.equipment, SIM_RACE_EFFECT_SLOT),
      previous: character.equipment[SIM_RACE_EFFECT_SLOT]
    });
    character.equipment[SIM_RACE_EFFECT_SLOT] = {
      baseId: SIM_RACE_EFFECT_SLOT,
      identified: true,
      simOnly: true,
      affixes: [{ id: affixType, type: affixType, kind: "support", value: delta }]
    };
  });
  return patches;
}

function restoreRaceEffectScale(patches) {
  patches.forEach(({ character, hadPrevious, previous }) => {
    if (hadPrevious) character.equipment[SIM_RACE_EFFECT_SLOT] = previous;
    else delete character.equipment[SIM_RACE_EFFECT_SLOT];
  });
}

function removeRaceEffectScale(state) {
  state?.party?.forEach(character => {
    if (character?.equipment?.[SIM_RACE_EFFECT_SLOT]?.simOnly) {
      delete character.equipment[SIM_RACE_EFFECT_SLOT];
    }
  });
}

function applyCountermeasureScale(state, override) {
  const rawMultiplier = Number(override?.multiplier);
  const multiplier = Number.isFinite(rawMultiplier) ? rawMultiplier : 1;
  const affixType = override?.affixType;
  if (!affixType || multiplier < 0 || multiplier === 1) return [];
  const patches = [];
  state.party.forEach(character => {
    if (!character?.equipment) return;
    if (override?.className && override.className !== character.class) return;
    const currentValue = getCharAffixSum(character, affixType);
    const delta = currentValue * (multiplier - 1);
    if (currentValue === 0 || !Number.isFinite(delta)) return;
    patches.push({
      character,
      hadPrevious: Object.hasOwn(character.equipment, SIM_COUNTERMEASURE_EFFECT_SLOT),
      previous: character.equipment[SIM_COUNTERMEASURE_EFFECT_SLOT]
    });
    character.equipment[SIM_COUNTERMEASURE_EFFECT_SLOT] = {
      baseId: SIM_COUNTERMEASURE_EFFECT_SLOT,
      identified: true,
      simOnly: true,
      affixes: [{ id: affixType, type: affixType, kind: "support", value: delta }]
    };
  });
  return patches;
}

function restoreCountermeasureScale(patches) {
  patches.forEach(({ character, hadPrevious, previous }) => {
    if (hadPrevious) character.equipment[SIM_COUNTERMEASURE_EFFECT_SLOT] = previous;
    else delete character.equipment[SIM_COUNTERMEASURE_EFFECT_SLOT];
  });
}

function removeCountermeasureScale(state) {
  state?.party?.forEach(character => {
    if (character?.equipment?.[SIM_COUNTERMEASURE_EFFECT_SLOT]?.simOnly) {
      delete character.equipment[SIM_COUNTERMEASURE_EFFECT_SLOT];
    }
  });
}

function applyThreatOverride(monsters, floor, override, encounter = {}) {
  if (!override || floor < (Number(override.startFloor) || 3)) return;
  if (override.normalOnly && (encounter.isBoss || encounter.isMidboss || encounter.isElite)) return;
  const atkMultiplier = Number(override.atkMultiplier);
  if (Number.isFinite(atkMultiplier) && atkMultiplier > 0) {
    monsters.forEach(monster => {
      monster.atk = Math.max(1, Math.round(monster.atk * atkMultiplier));
    });
  }
  if (override.forcePoison) {
    monsters.forEach(monster => {
      monster.isPoisonous = true;
      monster.statusChance = Number.isFinite(override.statusChance)
        ? Math.max(0, Math.min(1, override.statusChance))
        : 1;
    });
  }
  if (override.forceSpell) {
    monsters.forEach(monster => {
      monster.spell = override.spellName || "HALITO";
      monster.spellChance = Number.isFinite(override.spellChance)
        ? Math.max(0, Math.min(1, override.spellChance))
        : 1;
    });
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
  const diagnosticLevel = metrics?.diagnosticLevel || "full";
  const fullDiagnostics = diagnosticLevel === "full";
  const compactDiagnostics = diagnosticLevel === "compact";
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
  if (!isBoss && !isMidboss && !isElite) {
    applyRaceBiasOverride(
      monsters,
      state.floor,
      state.simPolicy.raceBiasOverride
    );
  }
  if (!isBoss && !isMidboss && !isElite) {
    applyStatusScalingOverride(
      monsters,
      state.floor,
      state.simPolicy.statusScalingOverride
    );
  }
  applyThreatOverride(monsters, state.floor, state.simPolicy.threatOverride, {
    isBoss,
    isMidboss,
    isElite
  });
  recordEncounterGroups(metrics, state.floor, monsters);
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
  const mpBlockedAtEncounterStart = metrics?.mpPressure?.combat?.total?.mpBlocked || 0;
  const startBuild = (isBoss || isMidboss || isElite) && metrics?.collectSpecialBattles
    ? createBuildSnapshot(state, metrics?.scoringProfile || null, `${encounterType}-start`)
    : null;
  const bloodWandObservationStart = isBoss
    ? {
        spellCandidates: observations.bloodWandSpellOpportunities,
        healCandidates: observations.bloodWandHealOpportunities,
        spellActivations: observations.bloodWandSpellActivations,
        healActivations: observations.bloodWandHealActivations
      }
    : null;
  const telemetry = {
    type: encounterType,
    floor: state.floor,
    enemyNames: monsters.map(monster => monster.name),
    enemyAttack: Math.max(...monsters.map(monster => monster.atk || 0)),
    playerMaxHp: getCharMaxHp(state.party[0]),
    incomingHits: 0,
    incomingHitTurns: 0,
    incomingDamage: 0,
    maxIncomingHit: 0,
    maxIncomingHitRate: 0,
    lastIncomingDamage: 0,
    lastIncomingHits: 0,
    lastRound: null,
    lastRoundHpBefore: null,
    lastRoundHpAfter: null,
    lastRoundMaxHp: null
  };
  const encounterDiagnostic = diagnostics && (fullDiagnostics || compactDiagnostics)
    ? (fullDiagnostics
      ? {
        floor: state.floor,
        type: encounterType,
        monsters: monsters.map(monster => ({
          name: monster.name,
          atk: monster.atk,
          maxHp: monster.maxHp,
          spell: monster.spell || null,
          traits: [...(monster.traits || [])],
          tags: [...(monster.tags || [])],
          spriteType: monster.spriteType || null,
          statusChance: monster.statusChance ?? null,
          statusCapable: isStatusCapableMonster(monster),
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
        startLevel: state.party[0].level,
        startExp: state.party[0].exp,
        startHealPotions: state.inventory.filter(item => item === "HEAL_POTION").length,
        startStatusCures: countInventoryItems(state.inventory),
        startBuild: startBuild ? structuredClone(startBuild) : null,
        rounds: []
      }
      : {
          floor: state.floor,
          type: encounterType,
          monsters: monsters.map(monster => ({
            tags: [...(monster.tags || [])],
            statusCapable: isStatusCapableMonster(monster)
          })),
          rounds: []
        }
    )
    : null;
  const finishEncounter = (result, rounds, healPotionsUsed, greaterHealPotionsUsed) => {
    if (metrics && telemetry.incomingDamage > 0) {
      metrics.damageHpBySource[encounterType] += telemetry.incomingDamage;
      metrics.lastDamageEvent = {
        source: encounterType,
        floor: state.floor,
        amount: telemetry.incomingDamage
      };
    }
    if (encounterDiagnostic) {
      encounterDiagnostic.result = result;
      if (fullDiagnostics) {
        encounterDiagnostic.endHp = state.party[0].hp;
        encounterDiagnostic.endMp = state.party[0].mp;
        encounterDiagnostic.endLevel = state.party[0].level;
        encounterDiagnostic.endExp = state.party[0].exp;
        encounterDiagnostic.endStatus = state.party[0].status;
        encounterDiagnostic.endHealPotions =
          state.inventory.filter(item => item === "HEAL_POTION").length;
        encounterDiagnostic.endGreaterHeals =
          state.inventory.filter(item => item === "GREATER_HEAL").length;
        encounterDiagnostic.endStatusCures = countInventoryItems(state.inventory);
        encounterDiagnostic.endEnemyHp = state.combatState.monsters.map(monster => ({
          name: monster.name,
          hp: monster.hp,
          maxHp: monster.maxHp
        }));
      }
      diagnostics.encounters.push(encounterDiagnostic);
    }
    if (result === "death" && metrics && !metrics.deathSnapshot) {
      const deathLog = state.currentRun?.deathLogs?.at(-1) || null;
      metrics.deathSnapshot = {
        source: encounterType,
        floor: state.floor,
        round: telemetry.lastRound,
        cause: deathLog?.cause || null,
        hpBefore: telemetry.lastRoundHpBefore,
        hpAfter: telemetry.lastRoundHpAfter,
        maxHp: telemetry.lastRoundMaxHp || telemetry.playerMaxHp,
        damage: telemetry.lastIncomingDamage,
        hits: telemetry.lastIncomingHits,
        damageMaxHpRate: telemetry.lastIncomingDamage > 0
          ? telemetry.lastIncomingDamage / Math.max(1, telemetry.lastRoundMaxHp || telemetry.playerMaxHp)
          : null,
        killHealActivationsBeforeDeath: metrics.killHeal.killHealActivations,
        ...createDeathStateSnapshot(state, metrics.scoringProfile)
      };
    }
    return {
      result,
      rounds,
      healPotionsUsed,
      greaterHealPotionsUsed,
      state,
      startBuild,
      telemetry,
      bloodWandObservations: bloodWandObservationStart
        ? {
            spellCandidates:
              observations.bloodWandSpellOpportunities - bloodWandObservationStart.spellCandidates,
            healCandidates:
              observations.bloodWandHealOpportunities - bloodWandObservationStart.healCandidates,
            spellActivations:
              observations.bloodWandSpellActivations - bloodWandObservationStart.spellActivations,
            healActivations:
              observations.bloodWandHealActivations - bloodWandObservationStart.healActivations
          }
        : null,
      mpBlockedEvents: Math.max(
        0,
        (metrics?.mpPressure?.combat?.total?.mpBlocked || 0) - mpBlockedAtEncounterStart
      )
    };
  };

  let rounds = 0;
  let healPotionsUsed = 0;
  let greaterHealPotionsUsed = 0;
  for (; rounds < MAX_COMBAT_TURNS; rounds++) {
    const character = state.party[0];
    if (!isAlive(character)) return finishEncounter("death", rounds, healPotionsUsed, greaterHealPotionsUsed);
    if (state.combatState.monsters.every(monster => monster.hp <= 0)) {
      return finishEncounter("victory", rounds, healPotionsUsed, greaterHealPotionsUsed);
    }

    const action = selectCombatAction(state, metrics);
    recordCombatSpellPressure(state, metrics, action);
    recordSpellSelectionMetrics(state, metrics, action);
    const actionTarget = action.targetIdx === undefined
      ? null
      : state.combatState.monsters[action.targetIdx];
    const raceBiasOverride = state.simPolicy.raceBiasOverride;
    const raceEncountered = Boolean(
      raceBiasOverride?.targetRace &&
      state.combatState.monsters.some(monster =>
        monster.tags?.includes(raceBiasOverride.targetRace)
      )
    );
    const raceTargeted = Boolean(
      raceBiasOverride?.targetRace &&
      actionTarget?.tags?.includes(raceBiasOverride.targetRace)
    );
    const raceEffectActive = raceEncountered &&
      !isBoss && !isMidboss && !isElite &&
      state.floor >= (Number(raceBiasOverride?.startFloor) || 3);
    const raceAffixValueBefore = raceEffectActive
      ? getCharAffixSum(state.party[0], raceBiasOverride?.affixType)
      : 0;
    const raceEffectPatches = raceEffectActive
      ? applyRaceEffectScale(state, raceBiasOverride)
      : [];
    const raceAffixValueAfter = raceEffectActive
      ? getCharAffixSum(state.party[0], raceBiasOverride?.affixType)
      : 0;
    const countermeasureOverride = state.simPolicy.countermeasureOverride;
    const countermeasureMultiplier = Number(countermeasureOverride?.multiplier);
    const countermeasureActive = Boolean(
      countermeasureOverride?.affixType &&
      Number.isFinite(countermeasureMultiplier) &&
      countermeasureMultiplier >= 0 &&
      countermeasureMultiplier !== 1 &&
      state.floor >= (Number(countermeasureOverride.startFloor) || 3)
    );
    const countermeasureAffixValueBefore = countermeasureActive
      ? getCharAffixSum(state.party[0], countermeasureOverride.affixType)
      : 0;
    const countermeasurePatches = countermeasureActive
      ? applyCountermeasureScale(state, countermeasureOverride)
      : [];
    const countermeasureAffixValueAfter = countermeasureActive
      ? getCharAffixSum(state.party[0], countermeasureOverride.affixType)
      : 0;
    const targetedDamageProbe = SIM_DAMAGE_PROBE_ENABLED &&
      raceTargeted && raceEffectActive && raceBiasOverride?.affixType === "antiUndead"
      && raceBiasOverride?.damageProbe
      ? {
          affixValueAfter: raceAffixValueAfter,
          matchLines: [56],
          calls: []
        }
      : null;
    const previousTargetedDamageProbe = globalThis.__simTargetedDamageProbe;
    if (targetedDamageProbe) {
      globalThis.__simTargetedDamageProbe = targetedDamageProbe;
    }
    const targetBeforeRound = action.targetIdx === undefined
      ? null
      : structuredClone(state.combatState.monsters[action.targetIdx]);
    const monstersBeforeRound = structuredClone(state.combatState.monsters);
    const characterBeforeRound = structuredClone(character);
    const bloodWandOpportunity = getBloodWandOpportunity(state, action, observations);
    observations.bloodWandSpellOpportunities += Number(bloodWandOpportunity === "offense");
    observations.bloodWandHealOpportunities += Number(bloodWandOpportunity === "heal");
    if (bloodWandOpportunity) {
      observations.coreOpportunityCounts.CORE_BLOOD_WAND++;
    }

    const roundNumber = state.combatState.roundNumber;
    const roundRandomDraws = [];
    const simulationRandom = Math.random;
    Math.random = () => {
      const value = simulationRandom();
      roundRandomDraws.push(value);
      return value;
    };
    const potionCountBefore = state.inventory.filter(item => item === "HEAL_POTION").length;
    const greaterHealCountBefore = state.inventory.filter(item => item === "GREATER_HEAL").length;
    const selectedCureCountBefore = action.simStatusBefore
      ? state.inventory.filter(item => item === action.itemKey).length
      : 0;
    const identifyTicketsBeforeRound = state.identifyTickets || 0;
    const itemsFoundBeforeRound = state.currentRun.itemsFound.length;
    const diagnosticCureCountsBefore = encounterDiagnostic && fullDiagnostics
      ? countInventoryItems(state.inventory)
      : null;
    let roundResult;
    try {
      roundResult = withSimulationHealEffects(state, () => runCombatRoundCalculation(state, {
        actions: [action]
      }));
    } finally {
      Math.random = simulationRandom;
      if (targetedDamageProbe) {
        globalThis.__simTargetedDamageProbe = previousTargetedDamageProbe;
      }
      restoreCountermeasureScale(countermeasurePatches);
      restoreRaceEffectScale(raceEffectPatches);
    }
    recordSpellApplicationMetrics(metrics, action, roundResult.logQueue);
    removeRaceEffectScale(roundResult?.state);
    removeCountermeasureScale(roundResult?.state);
    const enemyBlindApplications = roundResult.logQueue.filter(entry =>
      entry?.msg?.startsWith("[ 敵 ]") && entry.msg.includes("盲目状態になった")
    ).length;
    recordBlindApplications(metrics, "enemy", enemyBlindApplications);
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
      state,
      characterBeforeRound,
      action,
      targetBeforeRound,
      monstersBeforeRound,
      roundResult,
      firstStrikeSucceeded
    );
    const bloodWandActivationType = getBloodWandActivationType(
      action,
      roundResult.logQueue
    );
    observations.bloodWandSpellActivations += Number(bloodWandActivationType === "offense");
    observations.bloodWandHealActivations += Number(bloodWandActivationType === "heal");
    observations.coreActivationCounts.CORE_BLOOD_WAND += Number(Boolean(bloodWandActivationType));
    state = roundResult.state;
    recordSpellResourceMetrics(metrics, characterBeforeRound, state.party[0]);
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
    const greaterHealCountAfter = state.inventory.filter(item => item === "GREATER_HEAL").length;
    const greaterHealDelta = greaterHealCountBefore - greaterHealCountAfter;
    greaterHealPotionsUsed += greaterHealDelta;
    if (greaterHealDelta > 0) {
      recordGreaterHealConsumption(state, metrics, greaterHealDelta);
    } else if (greaterHealDelta < 0) {
      recordGreaterHealAcquisition(state, metrics, "other", -greaterHealDelta);
    }
    if (potionDelta > 0 || greaterHealDelta > 0) {
      recordRecoveryPotionTiming(state, metrics);
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
        recordTrackedConsumableConsumption(state, metrics, action.itemKey, used);
        metrics.holyWaterUsed += Number(action.itemKey === "HOLY_WATER") * used;
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
        targetIdx: action.targetIdx ?? null,
        raceTargeted,
        raceAffixValueBefore,
        raceAffixValueAfter,
        raceDamageApplications: targetedDamageProbe?.calls.length || 0,
        raceDamageBeforeBonus: targetedDamageProbe
          ? targetedDamageProbe.calls.reduce((sum, call) => sum + call.beforeBonus, 0)
          : 0,
        raceDamageCounterfactual: targetedDamageProbe
          ? targetedDamageProbe.calls.reduce((sum, call) => sum + call.counterfactual, 0)
          : 0,
        raceDamageApplied: targetedDamageProbe
          ? targetedDamageProbe.calls.reduce((sum, call) => sum + call.applied, 0)
          : 0,
        raceDamageRatios: targetedDamageProbe
          ? targetedDamageProbe.calls.map(call => call.ratio)
          : [],
        countermeasureAffixType: countermeasureActive
          ? countermeasureOverride.affixType
          : null,
        countermeasureMultiplier: countermeasureActive
          ? Number(countermeasureOverride.multiplier) || 1
          : 1,
        countermeasureAffixValueBefore,
        countermeasureAffixValueAfter,
        hpBefore: fullDiagnostics ? characterBeforeRound.hp : undefined,
        hpAfter: fullDiagnostics ? state.party[0].hp : undefined,
        maxHp: fullDiagnostics ? getCharMaxHp(characterBeforeRound) : undefined,
        rawMaxHp: fullDiagnostics ? characterBeforeRound.maxHp : undefined,
        mpBefore: fullDiagnostics ? characterBeforeRound.mp : undefined,
        mpAfter: fullDiagnostics ? state.party[0].mp : undefined,
        statusBefore: fullDiagnostics ? characterBeforeRound.status : undefined,
        statusAfter: fullDiagnostics ? state.party[0].status : undefined,
        healPotionsBefore: fullDiagnostics ? potionCountBefore : undefined,
        healPotionsAfter: fullDiagnostics ? potionCountAfter : undefined,
        statusCuresBefore: diagnosticCureCountsBefore,
        statusCuresAfter: fullDiagnostics ? countInventoryItems(state.inventory) : undefined,
        enemiesBefore: fullDiagnostics ? monstersBeforeRound.map(monster => ({
          name: monster.name,
          hp: monster.hp,
          maxHp: monster.maxHp
        })) : undefined,
        enemiesAfter: fullDiagnostics ? state.combatState.monsters.map(monster => ({
          name: monster.name,
          hp: monster.hp,
          maxHp: monster.maxHp
        })) : undefined,
        log: fullDiagnostics ? roundResult.logQueue.map(entry => entry.msg || "") : []
      });
    }
    const incomingDamage = sumLoggedIncomingDamage(
      roundResult.logQueue,
      character.name
    );
    telemetry.incomingHits += incomingDamage.hits;
    telemetry.incomingDamage += incomingDamage.damage;
    if (incomingDamage.damage > 0) {
      telemetry.incomingHitTurns++;
      telemetry.lastIncomingDamage = incomingDamage.damage;
      telemetry.lastIncomingHits = incomingDamage.hits;
      telemetry.lastRound = roundNumber;
      telemetry.lastRoundHpBefore = characterBeforeRound.hp;
      telemetry.lastRoundHpAfter = state.party[0].hp;
      telemetry.lastRoundMaxHp = getCharMaxHp(characterBeforeRound);
    }
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
      return finishEncounter("death", rounds + 1, healPotionsUsed, greaterHealPotionsUsed);
    }
    if (fled) {
      return finishEncounter("flee", rounds + 1, healPotionsUsed, greaterHealPotionsUsed);
    }
    if (state.combatState.monsters.every(monster => monster.hp <= 0)) {
      return finishEncounter("victory", rounds + 1, healPotionsUsed, greaterHealPotionsUsed);
    }
  }

  return finishEncounter("stalemate", rounds, healPotionsUsed, greaterHealPotionsUsed);
}

function applyPostCombatRecovery(state, metrics = null) {
  const character = state.party[0];
  const healingSpellIds = getSimulationPriestHealingSpellIds();
  while (character.hp < getCharMaxHp(character) * 0.70) {
    const healingCharacter = {
      ...character,
      spells: character.spells?.filter(spellName => healingSpellIds.includes(spellName))
    };
    const getRecoverySpellPayment = spellName => getSpellPayment(
      character,
      SIM_HEALING_SPELL_PROFILES?.[spellName]?.cost ?? SPELLS[spellName].cost
    );
    const spellName = getPreferredHealingSpellName(
      healingCharacter,
      candidate => {
        const payment = getRecoverySpellPayment(candidate);
        recordSpellPressure(
          metrics?.mpPressure,
          "recovery",
          state.floor,
          candidate,
          payment,
          payment.resource === "mp" && payment.canCast ? payment : null
        );
        return payment.resource === "mp" && payment.canCast;
      }
    );
    if (!spellName) break;
    const payment = getRecoverySpellPayment(spellName);
    const hpBefore = character.hp;
    character.mp -= payment.cost;
    SPELL_EFFECTS[spellName]({ caster: character, target: character });
    const postCombatHealingHp = Math.max(0, character.hp - hpBefore);
    const spellUsage = metrics?.spellUsage?.[spellName];
    if (spellUsage) {
      spellUsage.postCombatCasts++;
      spellUsage.postCombatHealingHp += postCombatHealingHp;
    }
    if (metrics) {
      metrics.diosPostCombatCasts++;
      metrics.diosHealingHp += postCombatHealingHp;
    }
  }
}

function useHealPotionIfNeeded(state, metrics) {
  const itemKey = getRecoveryPotionItem(state);
  if (!itemKey) {
    const character = state.party[0];
    if (
      isAlive(character) &&
      character.hp <= getCharMaxHp(character) * state.simPolicy.healPotionThreshold
    ) {
      metrics.recoveryPotionShortages++;
      metrics.recoveryPotionShortageFloor ??= state.floor;
    }
    return null;
  }
  const itemIndex = state.inventory.indexOf(itemKey);
  const character = state.party[0];
  const hpBefore = character.hp;
  const requestedHeal = getSimulationHealAmount(state, itemKey);
  state.inventory.splice(itemIndex, 1);
  if (itemKey === "GREATER_HEAL") {
    recordGreaterHealConsumption(state, metrics);
  } else {
    recordHealPotionConsumption(state, metrics);
  }
  if (itemKey === "HEAL_POTION" && state.simPolicy?.healPotionAmountOverride) {
    applySimulationHealItem(state, itemKey);
  } else {
    ITEM_EFFECTS[itemKey]({ char: character });
  }
  recordRecoveryHealing(
    metrics,
    itemKey,
    character.level,
    requestedHeal,
    Math.max(0, character.hp - hpBefore)
  );
  recordRecoveryPotionTiming(state, metrics);
  return itemKey;
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
  recordTrackedConsumableConsumption(state, metrics, decision.itemKey);
  metrics.holyWaterUsed += Number(decision.itemKey === "HOLY_WATER");
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

function createChestDisarmBlindStatusMetric() {
  return {
    decisions: 0,
    attempts: 0,
    successes: 0,
    failures: 0,
    kit: 0,
    direct: 0,
    forced: 0
  };
}

function recordBlindApplications(metrics, source, count) {
  if (!metrics?.blindApplicationsBySource ||
      !Object.hasOwn(metrics.blindApplicationsBySource, source) ||
      count <= 0) return;
  metrics.blindApplicationsBySource[source] += count;
}

function recordTrapDamage(metrics, source, type, damage, floor, state, snapshot = null) {
  metrics.trapDamageHp += damage;
  metrics.trapDamageHpBySource[source] += damage;
  metrics.trapDamageHpByType[type] = (metrics.trapDamageHpByType[type] || 0) + damage;
  const damageSource = `${source}-trap`;
  metrics.damageHpBySource[damageSource] += damage;
  metrics.lastDamageEvent = {
    source: damageSource,
    floor,
    amount: damage,
    type,
    ...(snapshot || {})
  };
  if (snapshot?.hpAfter === 0 && !metrics.deathSnapshot) {
    metrics.deathSnapshot = {
      source: damageSource,
      floor,
      round: null,
      cause: null,
      damage,
      hits: 1,
      ...snapshot,
      damageMaxHpRate: damage / Math.max(1, snapshot.maxHp || 0),
      killHealActivationsBeforeDeath: metrics.killHeal.killHealActivations,
      ...createDeathStateSnapshot(state, metrics.scoringProfile)
    };
  }
}

function getSimulationTrapGuardByParty(state) {
  const override = state.simPolicy?.trapGuardOverride;
  const overrides = Array.isArray(override) ? override : [override];
  return state.party.map(character => {
    const matchedOverride = overrides.find(candidate =>
      candidate?.className === character.class ||
      (Array.isArray(candidate?.classNames) && candidate.classNames.includes(character.class))
    );
    if (!matchedOverride) return getCharAffixSum(character, "trapGuard");
    if (Number.isFinite(Number(matchedOverride.value))) {
      return Math.max(0, Number(matchedOverride.value));
    }
    const multiplier = Number(matchedOverride.multiplier);
    if (Number.isFinite(multiplier)) {
      return Math.max(0, getCharAffixSum(character, "trapGuard") * (1 - multiplier));
    }
    return getCharAffixSum(character, "trapGuard");
  });
}

function useTrapRecoveryIfNeeded(state, metrics) {
  const character = state.party[0];
  if (!isAlive(character)) return false;
  const needsPotion = character.hp <=
    getCharMaxHp(character) * state.simPolicy.healPotionThreshold;
  if (needsPotion) {
    const itemKey = useHealPotionIfNeeded(state, metrics);
    if (!itemKey) {
      metrics.trapHealPotionShortages++;
    } else {
      addRecoveryPotionUse(metrics, itemKey);
      metrics.trapHealPotionsUsed++;
      metrics.trapGreaterHealPotionsUsed += Number(itemKey === "GREATER_HEAL");
    }
  }
  useStatusCureIfNeeded(state, metrics, "post-trap");
  return needsPotion;
}

function applyChestTrapEffect(state, trap, weakened, metrics) {
  const character = state.party[0];
  const blindStatus = character.status === "blind" ? "blind" : "clear";
  const targetIndex = Math.max(0, state.party.indexOf(character));
  const trapGuardByParty = getSimulationTrapGuardByParty(state);
  const effect = resolveChestTrapEffect({
    trap,
    weakened,
    party: state.party,
    targetIndex,
    poisonWard: getCharAffixSum(character, "poisonWard"),
    rng: Math.random
  });
  const guardedEffect = applyTrapGuardToEffect(effect, {
    trapGuardByParty,
    targetIndex
  });
  effect.targetDamage = guardedEffect.targetDamage;
  effect.partyDamage = guardedEffect.partyDamage;
  recordTrapActivation(metrics, "chest", trap);

  if (trap === "flash bomb") {
    metrics.chestFlashTrapActivationsByBlindStatus[blindStatus]++;
    metrics.trapGuardFlashCoverage.effects++;
    metrics.trapGuardFlashCoverage.effectsWithGuard += Number(
      trapGuardByParty.some(value => Number(value) > 0)
    );
    metrics.trapGuardFlashCoverage.blindEffectUnchanged += Number(
      (effect.partyBlind || []).every((blinded, index) =>
        blinded === guardedEffect.partyBlind?.[index]
      )
    );
  }

  if (trap === "poison needle") {
    const hpBefore = character.hp;
    character.hp = Math.max(0, character.hp - effect.targetDamage);
    clearCharIncapacitationOnDamage(character);
    if (character.hp === 0) {
      character.status = "dead";
    } else if (effect.targetPoisonTriggered && !effect.targetPoisonResisted) {
      character.status = "poisoned";
    }
    recordTrapDamage(metrics, "chest", trap, effect.targetDamage, state.floor, state, {
      hpBefore,
      hpAfter: character.hp,
      maxHp: getCharMaxHp(character)
    });
    metrics.chestTrapDamageHpByBlindStatus[blindStatus] += effect.targetDamage;
  } else if (trap === "gas bomb") {
    effect.partyDamage.forEach((damage, index) => {
      const target = state.party[index];
      if (damage <= 0) return;
      const hpBefore = target.hp;
      target.hp = Math.max(0, target.hp - damage);
      clearCharIncapacitationOnDamage(target);
      if (target.hp === 0) target.status = "dead";
      recordTrapDamage(metrics, "chest", trap, damage, state.floor, state, {
        hpBefore,
        hpAfter: target.hp,
        maxHp: getCharMaxHp(target)
      });
      metrics.chestTrapDamageHpByBlindStatus[blindStatus] += damage;
    });
  } else if (trap === "teleporter") {
    metrics.trapTeleports += Number(effect.teleported);
  } else if (trap === "flash bomb") {
    effect.partyBlind.forEach((blinded, index) => {
      if (blinded) {
        state.party[index].status = "blind";
        recordBlindApplications(metrics, "chest", 1);
      }
    });
  }

  useTrapRecoveryIfNeeded(state, metrics);
  return effect;
}

function applyFloorTrapEffect(state, trap, floor, weakened, metrics) {
  const effect = applyTrapGuardToEffect(resolveFloorTrapEffect({
    trap,
    floor,
    party: getSimulationTrapParty(state),
    weakened,
    rng: Math.random
  }), { trapGuardByParty: getSimulationTrapGuardByParty(state) });
  recordTrapActivation(metrics, "floor", trap.type);

  effect.partyDamage.forEach((damage, index) => {
    const target = state.party[index];
    if (damage <= 0) return;
    const appliedDamage = Math.max(1, Math.round(damage * TRAP_DAMAGE_MULTIPLIER));
    const hpBefore = target.hp;
    target.hp = Math.max(0, target.hp - appliedDamage);
    clearCharIncapacitationOnDamage(target);
    if (target.hp === 0) target.status = "dead";
    recordTrapDamage(metrics, "floor", trap.type, appliedDamage, state.floor, state, {
      hpBefore,
      hpAfter: target.hp,
      maxHp: getCharMaxHp(target)
    });
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
  const recoveryPotions = state.inventory.filter(item =>
    item === "HEAL_POTION" || item === "GREATER_HEAL"
  ).length;
  return hpRate <= PORTAL_HP_THRESHOLD && recoveryPotions <= PORTAL_MAX_HEAL_POTIONS;
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
    greaterHealPotions: state.inventory.filter(item => item === "GREATER_HEAL").length,
    carriedMaterials: totalMaterials(state.currentRun.materials)
  });
  return true;
}

function recordMerchantMaterialSpend(metrics, before, after) {
  MATERIAL_TYPES.forEach(material => {
    metrics.materialConsumedByMerchant[material] += Math.max(
      0,
      (before?.[material] || 0) - (after?.[material] || 0)
    );
  });
}

function maybePurchaseMerchantWing(state, scenario, metrics) {
  if (!scenario.buyMerchantTownPortal || !isMilestoneFloor(state.floor)) return;
  if (state.inventory.includes("TOWN_PORTAL")) return;
  metrics.merchantWingAttempts++;
  const materialsBefore = { ...state.currentRun.materials };
  const result = purchaseMilestoneStock(state, "return_wing");
  if (!result.ok) {
    metrics.merchantWingFailures[result.reason] =
      (metrics.merchantWingFailures[result.reason] || 0) + 1;
    return;
  }
  recordMerchantMaterialSpend(metrics, materialsBefore, state.currentRun.materials);
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
    const materialsBefore = { ...state.currentRun.materials };
    const result = purchaseMilestoneStock(state, stockId);
    if (!result.ok) {
      metrics.statusCureMerchantFailures[result.reason] =
        (metrics.statusCureMerchantFailures[result.reason] || 0) + 1;
      return;
    }
    recordMerchantMaterialSpend(metrics, materialsBefore, state.currentRun.materials);
    addItemCount(metrics.statusCureItemsAcquired.merchant, itemId);
  });
}

function maybePurchaseMerchantHealPotion(state, metrics) {
  if (
    state.simPolicy.healPotionMerchantPolicy === "never" ||
    !isMilestoneFloor(state.floor)
  ) return;
  if (
    state.simPolicy.healPotionMerchantPolicy === "missing" &&
    hasRecoveryPotion(state)
  ) return;

  const remainingPurchases = state.simPolicy.healPotionMerchantPolicy === "missing"
    ? 1
    : state.simPolicy.healPotionMerchantMaxPurchases -
      state.simHealPotionMerchantPurchases;
  for (let purchase = 0; purchase < remainingPurchases; purchase++) {
    if (
      state.simPolicy.healPotionMerchantHoldLimit !== null &&
      state.inventory.filter(item => item === "HEAL_POTION").length >=
        state.simPolicy.healPotionMerchantHoldLimit
    ) {
      metrics.healPotionMerchantHoldLimitHits++;
      break;
    }
    metrics.healPotionMerchantAttempts++;
    recordRecoveryPotionOffer(metrics, "merchant", "HEAL_POTION");
    if (!shouldGrantNormalizedHealPotion(state)) break;
    const materialsBefore = { ...state.currentRun.materials };
    const result = purchaseMilestoneStock(state, "heal_potion");
    if (!result.ok) {
      metrics.healPotionMerchantFailures[result.reason] =
        (metrics.healPotionMerchantFailures[result.reason] || 0) + 1;
      break;
    }
    recordMerchantMaterialSpend(metrics, materialsBefore, state.currentRun.materials);
    recordHealPotionAcquisition(state, metrics, "merchant");
    metrics.healPotionMerchantPurchased++;
    state.simHealPotionMerchantPurchases++;
    if (state.simPolicy.healPotionMerchantPolicy === "missing") break;
  }
}

function maybePurchaseMerchantStrengthPotion(state, scenario, metrics) {
  if (!scenario.buyMerchantStrengthPotion || !isMilestoneFloor(state.floor)) return;
  metrics.strPotionMerchantAttempts++;
  const materialsBefore = { ...state.currentRun.materials };
  const result = purchaseMilestoneStock(state, "str_potion");
  if (!result.ok) {
    metrics.strPotionMerchantFailures[result.reason] =
      (metrics.strPotionMerchantFailures[result.reason] || 0) + 1;
    return;
  }
  recordMerchantMaterialSpend(metrics, materialsBefore, state.currentRun.materials);
  metrics.strPotionsPurchased++;
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
  if (isSimulationCurseLocked(oldEquipment)) return false;
  if (!oldEquipment) return true;
  return (item?.level || 0) >= (oldEquipment.level || 0);
}

function isEquipment(item) {
  return ["weapon", "shield", "armor", "accessory"].includes(item?.type);
}

function applyCoreEncounterCeiling(item) {
  if (CORE_ENCOUNTER_CEILING_MODE !== "epic-core" || !item || typeof item !== "object") {
    return item;
  }
  const itemData = getItemData(item);
  if (!isEquipment(itemData)) return item;

  const existingCore = item.affixes?.some(affix =>
    CORE_AFFIX_IDS.has(affix.id || affix.type)
  );
  const core = CORE_AFFIXES.find(affix =>
    affix.enabled && affix.slot === itemData.type
  );
  if (!core) return item;

  item.rarity = "epic";
  if (!existingCore) {
    item.affixes = [
      ...(item.affixes || []),
      { id: core.id, kind: "core", type: core.id, value: 1 }
    ];
  }
  return item;
}

function applyCoreEncounterCeilingToItems(items) {
  return items.map(applyCoreEncounterCeiling);
}

function isSimulationCurseLocked(item) {
  return CURSE_LOCK_MODE === "current" && isCurseLocked(item);
}

function getItemCoreId(item) {
  if (!item || typeof item !== "object") return null;
  const affix = item.affixes?.find(candidate => CORE_AFFIX_IDS.has(candidate.id || candidate.type));
  return affix ? (affix.id || affix.type) : null;
}

function getMatchingSupportIdsForCore(coreId) {
  if (MATCHING_DEFINITION === "broad") return ALL_ENABLED_SUPPORT_IDS;
  return CORE_SUPPORT_SYNERGY[coreId] || [];
}

function getItemSupportIds(item) {
  if (!item || typeof item !== "object") return [];
  return (item.affixes || [])
    .map(affix => affix.id || affix.type)
    .filter(id => id && !CORE_AFFIX_IDS.has(id));
}

function itemHasMatchingSupportForCore(item, coreId) {
  const matchingIds = getMatchingSupportIdsForCore(coreId);
  return getItemSupportIds(item).some(supportId => matchingIds.includes(supportId));
}

function applySupportSupplyCeiling(item) {
  if (SUPPORT_SUPPLY_CEILING_MODE !== "exact" || !item || typeof item !== "object") {
    return item;
  }
  const coreId = getItemCoreId(item);
  const matchingIds = CORE_SUPPORT_SYNERGY[coreId] || [];
  if (!coreId || matchingIds.length === 0 || !Array.isArray(item.affixes)) return item;

  let supportIndex = 0;
  item.affixes = item.affixes.map(affix => {
    const id = affix.id || affix.type;
    if (CORE_AFFIX_IDS.has(id)) return affix;
    const supportId = matchingIds[supportIndex % matchingIds.length];
    supportIndex++;
    return {
      ...affix,
      id: supportId,
      type: supportId,
      kind: "support"
    };
  });
  if (supportIndex === 0) {
    const supportId = matchingIds[0];
    item.affixes.push({
      id: supportId,
      type: supportId,
      kind: "support",
      value: 1
    });
  }
  return item;
}

function applyTrapBonusValueOverride(items, floor, override) {
  if (!override || !Number.isFinite(Number(floor))) return items;
  const depth = Math.max(1, Math.floor(Number(floor)));
  return items.map(item => {
    if (!item || typeof item !== "object" || !Array.isArray(item.affixes)) {
      return item;
    }
    const itemData = getItemData(item);
    const group = itemData?.type === "accessory" ? "accessory" : "equipment";
    const values = override[group];
    if (!Array.isArray(values)) return item;
    const band = group === "accessory"
      ? (depth >= 4 ? 1 : 0)
      : (depth >= 5 ? 2 : (depth >= 3 ? 1 : 0));
    const value = Number(values[band]);
    if (!Number.isFinite(value) || value < 0) return item;
    item.affixes = item.affixes.map(affix =>
      (affix.id || affix.type) === "trapBonus"
        ? { ...affix, value }
        : affix
    );
    return item;
  });
}

function applyEquipmentPostGenerationTransforms(items, state = null) {
  const valueAdjusted = applyTrapBonusValueOverride(
    items,
    state?.floor,
    state?.simPolicy?.trapBonusValueOverride
  );
  return applySupportSupplyCeilingToItems(
    applyCoreEncounterCeilingToItems(valueAdjusted)
  );
}

function applyTrapBonusExposureCeiling(state, floor) {
  const exposure = state?.simPolicy?.trapBonusExposure;
  if (
    floor !== 5 ||
    exposure?.mode !== "all-b5-entrants" ||
    state.simPolicy.trapBonusExposureApplied
  ) return;

  const character = state.party[0];
  const [slot, equipped] = Object.entries(character.equipment || {})
    .find(([, item]) => Boolean(item)) || [];
  if (!slot) return;

  const forcedValue = Math.max(0, Number(exposure.value || 20));
  const item = typeof equipped === "object"
    ? equipped
    : {
        baseId: equipped,
        identified: true,
        instanceId: `sim-trap-ceiling:${state.currentRun.runSeed}:${slot}`,
        affixes: []
      };
  const affixes = Array.isArray(item.affixes) ? item.affixes : [];
  const trapBonusIndex = affixes.findIndex(affix =>
    (affix.id || affix.type) === "trapBonus"
  );
  if (trapBonusIndex >= 0) {
    const existingValue = Number(affixes[trapBonusIndex].value || 0);
    if (existingValue < forcedValue) {
      item.affixes = affixes.map((affix, index) => index === trapBonusIndex
        ? { ...affix, value: forcedValue }
        : affix
      );
    }
  } else {
    item.affixes = [
      ...affixes,
      { id: "trapBonus", type: "trapBonus", kind: "support", value: forcedValue }
    ];
  }
  character.equipment[slot] = item;
  state.simPolicy.trapBonusExposureApplied = true;
  state.simPolicy.trapBonusExposureValue = forcedValue;
}

function applySupportSupplyCeilingToItems(items) {
  return items.map(applySupportSupplyCeiling);
}

function getCharStrWithoutCore(character, coreId) {
  const baseline = {
    ...character,
    equipment: { ...(character.equipment || {}) }
  };
  Object.entries(baseline.equipment || {}).forEach(([slot, item]) => {
    if (getItemCoreId(item) === coreId) baseline.equipment[slot] = null;
  });
  return getCharStr(baseline);
}

function getUnidentifiedEffectDelta(character, item) {
  const hiddenData = getItemData(item);
  const appliedData = getEquippedItemData(character, item);
  if (!hiddenData || !appliedData) return null;
  const delta = {
    atk: (appliedData.atk || 0) - (hiddenData.atk || 0),
    def: (appliedData.def || 0) - (hiddenData.def || 0),
    hpBonus: (appliedData.hpBonus || 0) - (hiddenData.hpBonus || 0),
    mpBonus: (appliedData.mpBonus || 0) - (hiddenData.mpBonus || 0),
    trapBonus: (appliedData.trapBonus || 0) - (hiddenData.trapBonus || 0),
    spellGuard: (appliedData.affixBonus?.spellGuard || 0) - (hiddenData.affixBonus?.spellGuard || 0),
    firstStrike: (appliedData.affixBonus?.firstStrike || 0) - (hiddenData.affixBonus?.firstStrike || 0),
    antiUndead: (appliedData.affixBonus?.antiUndead || 0) - (hiddenData.affixBonus?.antiUndead || 0),
    antiDragon: (appliedData.affixBonus?.antiDragon || 0) - (hiddenData.affixBonus?.antiDragon || 0)
  };
  ["str", "int", "pie", "vit", "agi", "luk"].forEach(stat => {
    delta[stat] = (appliedData.statsBonus?.[stat] || 0) -
      (hiddenData.statsBonus?.[stat] || 0);
  });
  return {
    changed: Object.values(delta).some(value => value !== 0),
    delta
  };
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
    bloodWandSpellActivationRate: divide(
      observations.bloodWandSpellActivations,
      observations.offensiveTurns
    ),
    bloodWandHealActivationRate: divide(
      observations.bloodWandHealActivations,
      observations.offensiveTurns
    ),
    bloodWandSpellCoverage: divide(
      observations.bloodWandSpellActivations,
      observations.bloodWandSpellOpportunities
    ),
    bloodWandHealCoverage: divide(
      observations.bloodWandHealActivations,
      observations.bloodWandHealOpportunities
    ),
    purifyMpPerOffensiveTurn: divide(
      observations.purifyPotentialMpRecovered,
      observations.offensiveTurns
    ),
    purifyHpPerOffensiveTurn: divide(
      observations.purifyPotentialHpRecovered,
      observations.offensiveTurns
    ),
    purifyActualMpRecovered: observations.purifyMpRecovered,
    purifyActualHpRecovered: observations.purifyHpRecovered,
    purifyActualEffectEvents: observations.purifyEffectEvents,
    // #312: 二重条件のどちらが効いているかの内訳
    purifyFunnel: {
      totalKills: observations.totalKills,
      tagKills: observations.purifyTagKills,
      tagKillsByCaster: observations.purifyTagKillsByCaster,
      killsWithMpRoom: observations.killsWithMpRoom,
      tagKillsWithMpRoom: observations.purifyKillsWithMpRoom,
      tagKillsWithFullMp: Math.max(
        0,
        observations.purifyTagKills - observations.purifyKillsWithMpRoom
      )
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

function getClassScoringProfile(scoringProfile, character) {
  return scoringProfile?.byClass?.[character.class] || scoringProfile;
}

function getCombatCoreScoreForId(character, scoringProfile, floor, coreId) {
  if (!scoringProfile || !coreId || !COMBAT_CORE_IDS.has(coreId)) return 0;
  const classScoringProfile = getClassScoringProfile(scoringProfile, character);
  const params = CORE_AFFIX_BY_ID.get(coreId).params;
  const offenseScore = getOffenseEquipmentScore(character);
  // 倍率コアは既存攻撃スコア×calibration実測稼働率×実params増分。
  if (coreId === "CORE_LAST_STAND") {
    return offenseScore * classScoringProfile.lowHpOffensiveRate * (params.damageMultiplier - 1);
  }
  if (coreId === "CORE_GIANT_SLAYER") {
    return offenseScore * classScoringProfile.giantTargetRate * (params.damageMultiplier - 1);
  }
  if (coreId === "CORE_EXECUTIONER") {
    return offenseScore * classScoringProfile.statusTargetRate * (params.damageMultiplier - 1);
  }
  // 追撃100%を既存followUpの%重みへ載せ、実先制成功率だけ稼働させる。
  if (coreId === "CORE_OPENER") {
    return classScoringProfile.openerFirstStrikeRate *
      params.followUpChance * 100 * EQUIPMENT_SCORE_WEIGHTS.followUp;
  }
  // MP不足時の追加詠唱は、実測spell/fightダメージ差。回復詠唱は実測DIOS回復量をHP重み換算。
  if (coreId === "CORE_BLOOD_WAND") {
    return offenseScore *
      classScoringProfile.bloodWandSpellActivationRate *
      classScoringProfile.spellDamageUplift +
      EQUIPMENT_SCORE_WEIGHTS.maxHp *
      classScoringProfile.bloodWandHealActivationRate *
      classScoringProfile.averageDiosHealing;
  }
  // 対象撃破で得る1MPを追加詠唱1回とみなし、実測spell/fight差へ換算。
  if (coreId === "CORE_PURIFY_RING") {
    return offenseScore * classScoringProfile.purifyMpPerOffensiveTurn *
      classScoringProfile.spellDamageUplift +
      EQUIPMENT_SCORE_WEIGHTS.maxHp * classScoringProfile.purifyHpPerOffensiveTurn;
  }
  // 罠出現と実解除率からrun当たり累積攻撃を算出。上限・増分とも実params。
  if (coreId === "CORE_TRAP_EATER") {
    const expectedRemainingDisarms =
      classScoringProfile.expectedTrapDisarmsFromFloor[Math.max(1, Math.floor(floor))] || 0;
    const expectedAttack = Math.min(
      params.maxAttack,
      expectedRemainingDisarms * params.attackPerDisarm
    );
    return expectedAttack * EQUIPMENT_SCORE_WEIGHTS.weaponAtk;
  }
  // CURSE_KEEPERの全能力+はgetBaseEquipmentScore内のgetChar*→
  // getCharAllStatsAffixBonusで既に反映済み。ここで再加算すると二重計上になる。
  if (coreId === "CORE_CURSE_KEEPER") {
    return 0;
  }
  // 物理攻撃の実被弾率×反撃率×威力を既存攻撃スコアへ換算。
  if (coreId === "CORE_THORN_SHIELD") {
    return offenseScore *
      classScoringProfile.incomingPhysicalHitRate *
      params.counterChance *
      params.counterPower;
  }
  return 0;
}

function getCombatCoreScore(character, scoringProfile, floor) {
  const coreId = getEquippedCoreAffixes(character)
    .map(affix => affix.id || affix.type)
    .find(id => COMBAT_CORE_IDS.has(id));
  return getCombatCoreScoreForId(character, scoringProfile, floor, coreId);
}

function getCombatCoreScoreById(character, scoringProfile, floor) {
  const scores = {};
  getEquippedCoreAffixes(character)
    .map(affix => affix.id || affix.type)
    .filter(id => COMBAT_CORE_IDS.has(id))
    .forEach(coreId => {
      scores[coreId] = (scores[coreId] || 0) +
        getCombatCoreScoreForId(character, scoringProfile, floor, coreId);
    });
  return scores;
}

function getEconomyCoreScore(character, scoringProfile, floor) {
  if (!scoringProfile) return 0;
  const classScoringProfile = getClassScoringProfile(scoringProfile, character);
  const coreId = getEquippedCoreAffixes(character)
    .map(affix => affix.id || affix.type)
    .find(id => ECONOMY_CORE_IDS.has(id));
  if (!coreId) return 0;

  const params = CORE_AFFIX_BY_ID.get(coreId).params;
  const scoringFloor = Math.max(1, Math.floor(floor));
  if (coreId === "CORE_TOMB_RAIDER") {
    return (classScoringProfile.expectedPickedChestsFromFloor[scoringFloor] || 0) *
      params.materialBonus *
      MATERIAL_EV_SCORE_WEIGHT *
      TOMB_RAIDER_TRAP_RISK_DISCOUNT;
  }
  if (coreId === "CORE_CAMP_MASTER") {
    const hpEv = (classScoringProfile.expectedCampBonusHpFromFloor[scoringFloor] || 0) *
      EQUIPMENT_SCORE_WEIGHTS.maxHp;
    const mpEv = (classScoringProfile.expectedCampBonusMpFromFloor[scoringFloor] || 0) *
      Math.max(0, classScoringProfile.averageSpellDamage - classScoringProfile.averageFightDamage);
    return hpEv + mpEv;
  }
  if (coreId === "CORE_BOUNTY_HUNTER") {
    const remainingRunShare = Math.max(0, 21 - scoringFloor) / 20;
    return classScoringProfile.expectedBountyMaterialsPerRun *
      remainingRunShare *
      MATERIAL_EV_SCORE_WEIGHT;
  }
  if (coreId === "CORE_SCHOLAR_EYE") {
    return (classScoringProfile.expectedScholarMaterialsFromFloor[scoringFloor] || 0) *
      MATERIAL_EV_SCORE_WEIGHT;
  }
  // 忍び足と慧眼は、実際の判定経路の発動計測を行う。現時点では
  // それぞれの探索効果をこのcoreスコアへ換算しない。
  return 0;
}

function getEquipmentScore(character, scoringProfile, floor) {
  return getBaseEquipmentScore(character) +
    getCombatCoreScore(character, scoringProfile, floor) +
    getEconomyCoreScore(character, scoringProfile, floor);
}

function qualifiesAsBuildCore(candidateScore, currentScore) {
  if (CORE_SCORE_DROP_TOLERANCE <= 0) return candidateScore > currentScore;
  return candidateScore > currentScore * (1 - CORE_SCORE_DROP_TOLERANCE);
}

function createBuildSnapshot(state, scoringProfile, point) {
  const character = state.party[0];
  const withoutEquipment = {
    ...structuredClone(character),
    equipment: {}
  };
  const supportAffixes = {};
  const coreIds = [];
  const equipment = Object.entries(character.equipment || {})
    .filter(([, equipped]) => Boolean(equipped))
    .map(([slot, equipped]) => {
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
  const combatCoreScoreById = getCombatCoreScoreById(
    character,
    scoringProfile,
    state.floor
  );
  const combatCoreScoreAll = Object.values(combatCoreScoreById)
    .reduce((sum, score) => sum + score, 0);
  const combatCoreIds = coreIds.filter(id => COMBAT_CORE_IDS.has(id));

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
    combatCoreScoreAll,
    combatCoreScoreById,
    combatBuildScore: equipmentStatScore + combatCoreScore,
    totalGreedyScore: getEquipmentScore(character, scoringProfile, state.floor),
    coreIds: [...new Set(coreIds)],
    combatCoreIds,
    supportAffixes,
    effectiveAffixes: Object.fromEntries(
      [
        "guardian",
        "spellGuard",
        "poisonWard",
        "statusResistance",
        "frontGuard",
        "antiBeast",
        "antiSpirit",
        "antiUndead",
        "antiDragon",
        "antiDemon"
      ]
        .map(id => [id, getCharAffixSum(character, id)])
    ),
    resistanceScore:
      (supportAffixes.poisonWard || 0) + (supportAffixes.statusResistance || 0),
    equipment
  };
}

function createDeathStateSnapshot(state, scoringProfile) {
  const character = state.party[0];
  const build = createBuildSnapshot(state, scoringProfile, "death");
  const inventory = [
    "TOWN_PORTAL",
    "HEAL_POTION",
    "GREATER_HEAL",
    "ANTIDOTE",
    "GUARD_POTION",
    "TRAP_KIT"
  ];
  return {
    level: character.level,
    hp: character.hp,
    maxHp: getCharMaxHp(character),
    mp: character.mp,
    maxMp: getCharMaxMp(character),
    status: character.status,
    equipment: build.equipment,
    coreIds: build.coreIds,
    combatCoreIds: build.combatCoreIds,
    combatBuildScore: build.combatBuildScore,
    totalGreedyScore: build.totalGreedyScore,
    inventory: Object.fromEntries(
      inventory.map(itemId => [
        itemId,
        state.inventory.filter(item =>
          typeof item === "string" ? item === itemId : item?.baseId === itemId
        ).length
      ])
    )
  };
}

function recordCoreDecision(metrics, item, reason) {
  const coreId = getItemCoreId(item);
  if (!coreId) return;
  if (!metrics.coreDecisionReasons[coreId]) metrics.coreDecisionReasons[coreId] = new Set();
  metrics.coreDecisionReasons[coreId].add(reason);
}

function candidateMatchesEquippedCore(character, candidate) {
  if (EQUIPMENT_POLICY !== "compatibility-aware") return false;
  // build snapshot と同じ affix metadataを使う。powder policyでも未鑑定候補は
  // 既存guardで保持されるため、実際に選択するのは鑑定済み候補だけ。
  const equippedCoreIds = Object.values(character.equipment || {})
    .map(getItemCoreId)
    .filter(Boolean);
  return equippedCoreIds.some(coreId => itemHasMatchingSupportForCore(candidate, coreId));
}

function getEquipmentTargetSlot(character, itemType) {
  if (EQUIPMENT_SLOT_MODE === "second-accessory" && itemType === "accessory") {
    if (!character.equipment.accessory) return "accessory";
    if (!character.equipment.accessory2) return "accessory2";
    return "accessory";
  }
  if (EQUIPMENT_SLOT_MODE !== "unlimited" || !character.equipment[itemType]) {
    return itemType;
  }
  if (
    EQUIPMENT_SLOT_AFFIX_MODE === "none" &&
    typeof character.equipment[itemType] === "string"
  ) {
    return itemType;
  }
  let suffix = 2;
  while (character.equipment[`${itemType}#${suffix}`]) suffix++;
  return `${itemType}#${suffix}`;
}

function isEquipmentAlreadyEquipped(character, item) {
  return Object.values(character.equipment || {}).some(equipped =>
    equipped === item || (
      equipped && item && equipped.instanceId &&
      equipped.instanceId === item.instanceId
    )
  );
}

function clearAffixlessVirtualSlots(character) {
  Object.keys(character.equipment || {})
    .filter(slot => slot.includes("#"))
    .forEach(slot => delete character.equipment[slot]);
}

function addAffixlessVirtualSlots(character) {
  const baseEquipment = Object.entries(character.equipment || {})
    .filter(([slot, equipped]) =>
      !slot.includes("#") && isEquipment(getItemData(equipped))
    );
  const duplicateSources = AFFIXLESS_DUPLICATE_SLOT
    ? baseEquipment.filter(([slot]) => slot === AFFIXLESS_DUPLICATE_SLOT).slice(0, 1)
    : baseEquipment;
  duplicateSources.forEach(([slot, equipped]) => {
    for (let suffix = 2; suffix <= 1 + AFFIXLESS_DUPLICATE_COUNT; suffix++) {
      const virtualSlot = `${slot}#${suffix}`;
      character.equipment[virtualSlot] = equipped && typeof equipped === "object"
        ? {
            ...equipped,
            affixes: [],
            curseEffectId: null,
            instanceId: `issue446-${slot}-${suffix}`
          }
        : equipped;
    }
  });
}

function equipGreedyUpgrades(state, metrics, scoringProfile) {
  const character = state.party[0];
  if (EQUIPMENT_SLOT_MODE === "affixless-duplicates") {
    clearAffixlessVirtualSlots(character);
  }
  identifyAvailableEquipment(state, metrics, Math.random);
  let upgrades = 0;
  const maxIterations = state.inventory.length * 2 + Object.keys(character.equipment).length;

  while (true) {
    if (upgrades > maxIterations) {
      throw new Error("equipment upgrade loop did not converge");
    }
    const currentScore = getEquipmentScore(character, scoringProfile, state.floor);
    let best = null;
    const keenEyeActive = Boolean(getCharCoreParams(character, "CORE_KEEN_EYE"));

    state.inventory.forEach((inventoryItem, index) => {
      const itemData = getItemData(inventoryItem);
      if (!isEquipment(itemData)) return;
      recordCoreItemEncounter(metrics, inventoryItem, state.floor);
      if (itemData.classes && !itemData.classes.includes(character.class)) {
        recordCoreDecision(metrics, inventoryItem, "class-incompatible");
        return;
      }
      if (
        EQUIPMENT_SLOT_MODE === "unlimited" &&
        isEquipmentAlreadyEquipped(character, inventoryItem)
      ) {
        recordCoreDecision(metrics, inventoryItem, "already-equipped-unlimited");
        return;
      }

      const slot = getEquipmentTargetSlot(character, itemData.type);
      const oldEquipment = EQUIPMENT_SLOT_MODE === "unlimited" &&
          slot.includes("#")
        ? null
        : character.equipment[slot];
      if (isSimulationCurseLocked(oldEquipment)) {
        const blockedCoreId = getItemCoreId(inventoryItem);
        if (blockedCoreId) metrics.coreBlockedByCurseLockIds.add(blockedCoreId);
        recordCoreDecision(metrics, inventoryItem, "current-curse-locked");
        if (metrics.equipmentTelemetry) {
          metrics.equipmentTelemetry.push({
            type: "lock-block",
            floor: state.floor,
            oldCoreId: getItemCoreId(oldEquipment),
            candidateCoreId: blockedCoreId,
            oldCursed: true
          });
        }
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
      } else if (policy === "powder" && candidateIsUnidentified && !keenEyeActive) {
        qualifies = false;
        selectionScore = -Infinity;
        rejectionReason = "unidentified-held";
      } else {
        if (policy === "powder" && candidateIsUnidentified && keenEyeActive) {
          const effectDelta = getUnidentifiedEffectDelta(character, inventoryItem);
          metrics.coreObservations.coreOpportunityCounts.CORE_KEEN_EYE++;
          metrics.coreObservations.coreActivationCounts.CORE_KEEN_EYE += Number(
            effectDelta?.changed
          );
          if (effectDelta?.changed) {
            metrics.coreObservations.keenEyeEffectApplications++;
            Object.entries(effectDelta.delta).forEach(([field, amount]) => {
              metrics.coreObservations.keenEyeEffectDelta[field] += amount;
            });
          }
        }
        character.equipment[slot] = candidate;
        candidateScore = getEquipmentScore(character, scoringProfile, state.floor);
        character.equipment[slot] = oldEquipment;
        const matchingSupport = candidateMatchesEquippedCore(character, candidate);
        const oldMatchingSupport = candidateMatchesEquippedCore(character, oldEquipment);
        const compatibilityBonus = matchingSupport ? MATCHING_SUPPORT_BONUS : 0;
        selectionScore = candidateScore + compatibilityBonus;
        const coreSwap = Boolean(oldCoreId && candidateCoreId);
        qualifies = candidateCoreId
          ? (coreSwap
            ? candidateScore > currentScore
            : qualifiesAsBuildCore(candidateScore, currentScore))
          : candidateScore > currentScore;
        if (EQUIPMENT_POLICY === "compatibility-aware" && oldMatchingSupport) {
          // 対応support同士の相互置換を防ぎ、対応装備を非対応候補で外さない。
          qualifies = matchingSupport && candidateScore > currentScore;
        } else if (matchingSupport && !candidateCoreId) {
          // 相性を狙う方針では、対応supportを個別scoreの改善条件から解放する。
          // 既存の対応装備を保持する分岐で置換ループは止める。
          qualifies = true;
        }
        rejectionReason = candidateCoreId && COMBAT_CORE_IDS.has(candidateCoreId)
          ? "combat-score-not-higher"
          : (candidateIsEconomyCore ? "economy-ev-not-higher" : "score-not-higher");

        // EV算出不能な探索コアだけ、従来の95%保持規則を残す。
        if (candidateIsEconomyCore && oldCoreId) {
          qualifies = coreSwap
            ? candidateScore > currentScore
            : qualifiesAsBuildCore(candidateScore, currentScore);
          rejectionReason = "economy-core-retained";
        } else if (candidateIsHoldOnlyCore) {
          const holdRatio = Math.min(
            ECONOMY_CORE_KEEP_RATIO,
            1 - CORE_SCORE_DROP_TOLERANCE
          );
          qualifies = coreSwap
            ? (CORE_SCORE_DROP_TOLERANCE > 0
              ? candidateScore > currentScore
              : candidateScore >= currentScore * holdRatio)
            : candidateScore >= currentScore * holdRatio;
          selectionScore = candidateScore / holdRatio;
          rejectionReason = "economy-below-95pct";
        // 装備済みcoreは、非coreが保持幅を明確に超えた場合だけ外す。
        } else if (oldCoreId && !candidateCoreId) {
          qualifies = CORE_SCORE_DROP_TOLERANCE > 0
            ? false
            : candidateScore > currentScore / ECONOMY_CORE_KEEP_RATIO;
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
        candidateScore,
        index,
        oldEquipment,
        oldCoreId,
        scoreBefore: currentScore,
        selectionScore,
        slot
      };
    });

    if (!best) break;
    const wasUnidentified = best.candidateIsUnidentified;
    const selectedCandidate = EQUIPMENT_SLOT_MODE === "unlimited" &&
        EQUIPMENT_SLOT_AFFIX_MODE === "none" &&
        best.slot.includes("#")
      ? { ...best.candidate, affixes: [] }
      : best.candidate;
    const selectedCandidateCoreId = getItemCoreId(selectedCandidate);
    character.equipment[best.slot] = selectedCandidate;
    if (wasUnidentified && state.simPolicy.identificationPolicy === "gamble") {
      revealEquipmentOnEquip(selectedCandidate);
      metrics.unidentifiedWearCount++;
    }
    if (selectedCandidate.curseEffectId) metrics.curseHitCount++;
    if (selectedCandidateCoreId && isSimulationCurseLocked(selectedCandidate)) {
      metrics.coreCursedLockedIds.add(selectedCandidateCoreId);
    }
    if (metrics.equipmentTelemetry) {
      metrics.equipmentTelemetry.push({
        type: "swap",
        floor: state.floor,
        scoreBefore: best.scoreBefore,
        scoreAfter: getEquipmentScore(character, scoringProfile, state.floor),
        oldCoreId: best.oldCoreId,
        candidateCoreId: selectedCandidateCoreId,
        oldCursed: Boolean(best.oldEquipment && isCurseLocked(best.oldEquipment)),
        candidateCursed: Boolean(isCurseLocked(best.candidate)),
        replacement: Boolean(best.oldEquipment)
      });
    }
    if (selectedCandidateCoreId) {
      metrics.coreEverEquippedIds.add(selectedCandidateCoreId);
      const poolGroup = ENABLED_CORE_AFFIXES.find(
        affix => affix.id === selectedCandidateCoreId
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
      recordCoreDecision(metrics, selectedCandidate, "equipped");
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
  if (EQUIPMENT_SLOT_MODE === "affixless-duplicates") {
    addAffixlessVirtualSlots(character);
  }
  return upgrades;
}

function applyFloorTransitionHeal(character, recoveryRate = 0.15) {
  if (!isAlive(character)) return 0;
  const maxHp = getCharMaxHp(character);
  const healed = Math.min(
    maxHp - character.hp,
    Math.max(1, Math.floor(maxHp * recoveryRate))
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

function getEncounterChance(floorStep, state = null) {
  const adjustedRate = calculateEncounterChance(floorStep, state || {});
  // #612: 遭遇率スイープ計測用。既定no-op、override未設定時は元の戻り値と一致。
  if (typeof state?.encounterRateOverride === "function") {
    return state.encounterRateOverride(adjustedRate);
  }
  return adjustedRate;
}

function tickExplorationSpellEffects(state) {
  if (state.lightTurns > 0) {
    const cost = state.floor === 2 ? 2 : 1;
    state.lightTurns = Math.max(0, state.lightTurns - cost);
    if (state.lightTurns === 0) state.lightPower = "";
  }
  if (state.repelTurns > 0) state.repelTurns--;
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

function normalizeBossExitPolicy(policy) {
  if (policy === "near-stairs") return { kind: "near-stairs", distance: null };
  const shortcut = /^shortcut-(\d+)$/.exec(String(policy || ""));
  if (shortcut) return { kind: "shortcut", distance: Number(shortcut[1]) };
  return { kind: "baseline", distance: null };
}

function moveMilestoneBossNearStairs(generated, floor) {
  const grid = generated.grid;
  const stairs = findFloorCell(grid, cell => cell.type === "stairs-down");
  let boss = findFloorCell(
    grid,
    cell => cell.event === EVENT_TYPES.BOSS && cell.milestoneFloor === floor
  );
  if (!stairs || !boss) return null;

  const candidates = [];
  grid.forEach((row, y) => row.forEach((cell, x) => {
    if (cell === grid[boss.y][boss.x] || cell.type !== "empty" || cell.event || cell.trap) return;
    const path = findShortestFloorPath(grid, { x, y }, stairs);
    if (path) candidates.push({ x, y, distance: path.length - 1 });
  }));
  candidates.sort((left, right) =>
    left.distance - right.distance || left.y - right.y || left.x - right.x
  );
  const target = candidates[0];
  if (!target) return null;

  grid[boss.y][boss.x].event = null;
  delete grid[boss.y][boss.x].milestoneFloor;
  grid[target.y][target.x].event = EVENT_TYPES.BOSS;
  grid[target.y][target.x].milestoneFloor = floor;
  boss = { x: target.x, y: target.y };
  return { boss, distanceToStairs: target.distance };
}

function applyBossExitPolicy(generated, floor, policy) {
  const config = normalizeBossExitPolicy(policy);
  if (config.kind === "near-stairs" && floor % 5 === 0) {
    config.audit = moveMilestoneBossNearStairs(generated, floor);
  }
  return config;
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

function getRouteDirection(previous, current, fallback = 0) {
  if (!previous || !current) return fallback;
  const dx = current.x - previous.x;
  const dy = current.y - previous.y;
  if (dx === 1) return 1;
  if (dy === 1) return 2;
  if (dx === -1) return 3;
  if (dy === -1) return 0;
  return fallback;
}

function isFlameTrapSpecialCell(cell) {
  return Boolean(
    cell?.type === "stairs-up" ||
    cell?.type === "stairs-down" ||
    cell?.event === "midboss" ||
    cell?.event === "boss" ||
    cell?.event === "chest" ||
    cell?.event === EVENT_TYPES.MERCHANT ||
    cell?.event === EVENT_TYPES.RETURN_PORTAL ||
    cell?.message
  );
}

function isFlameTrapSpecialStep(generated, routePlan, floorSteps, step) {
  const routePath = routePlan.path;
  if (!routePath?.length || floorSteps <= 0) return false;
  // floorSteps is an estimate; project each estimated step onto the generated route
  // so special cells suppress the independent flame-trap trial.
  const routeIndex = Math.min(
    routePath.length - 1,
    Math.floor((step / floorSteps) * Math.max(0, routePath.length - 1))
  );
  const coord = routePath[routeIndex];
  return isFlameTrapSpecialCell(generated.grid[coord.y]?.[coord.x]);
}

function observeSneakStepPerception({
  state,
  observations,
  elite,
  routePath,
  grid,
  floorSteps,
  step
}) {
  const armor = state.party[0]?.equipment?.armor;
  if (getItemCoreId(armor) !== "CORE_SNEAK_STEP") return;
  const sneakStep = getCharCoreParams(state.party[0], "CORE_SNEAK_STEP");
  if (!sneakStep || !elite || !routePath?.length || !grid || floorSteps <= 0) return;

  const routeIndex = Math.min(
    routePath.length - 1,
    Math.floor((step / floorSteps) * Math.max(0, routePath.length - 1))
  );
  const current = routePath[routeIndex];
  const previous = routePath[Math.max(0, routeIndex - 1)];
  const player = {
    x: current.x,
    y: current.y,
    dir: getRouteDirection(previous, current),
    dx: DX,
    dy: DY
  };
  const perceptionInput = {
    monster: elite,
    player,
    noise: null,
    playerMoved: true,
    grid
  };
  // Use the same helper called by movement.js; baseline is only a coverage comparator.
  const applied = getPerceptionIntent({
    ...perceptionInput,
    rangeMultiplier: sneakStep.detectionRangeMultiplier
  });
  const baseline = getPerceptionIntent({ ...perceptionInput, rangeMultiplier: 1 });
  observations.coreOpportunityCounts.CORE_SNEAK_STEP++;
  observations.coreActivationCounts.CORE_SNEAK_STEP++;
  observations.sneakStepReducedDetectionCases += Number(
    baseline.detected && !applied.detected
  );
}

function createFloorRoutePlan(
  generated,
  floor,
  bossPolicy = "engage",
  bossExitPolicy = { kind: "baseline", distance: null }
) {
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
  let bossExitDistance = null;

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
    const currentEvent = specialByKey.get(routeKey(current));
    if (bossExitPolicy.kind === "shortcut" && currentEvent?.milestone) {
      bossExitDistance = bossExitPolicy.distance;
    } else {
      appendPath(findShortestFloorPath(grid, current, stairs));
    }
  }

  const routeDistance = Math.max(1, path.length - 1 + (bossExitDistance || 0));
  const milestoneBoss = specialCells.find(cell => cell.milestone);
  const naturalBossToStairsDistance = milestoneBoss
    ? Math.max(
        0,
        (findShortestFloorPath(
          grid,
          milestoneBoss,
          stairs
        )?.length || 1) - 1
      )
    : null;
  return {
    path,
    routeEvents,
    routeDistance,
    bossToStairsDistance: bossExitDistance ?? naturalBossToStairsDistance,
    naturalBossToStairsDistance,
    floorSteps: Math.max(
      getFloorStepCount(generated, floor),
      Math.ceil(routeDistance * EXPLORATION_FACTOR)
    ),
    specialCells,
    avoidedPathExists,
    milestoneForced,
    bossExitDistance
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
      previousCoord: routePlan.path[index],
      step
    });
  });
  return schedule;
}

function resolveFlameTrapAtStep({
  state,
  generated,
  routePlan,
  floorSteps,
  step,
  metrics
}) {
  if (state.flameTrapCooldownTurns && state.flameTrapCooldownTurns > 0) {
    state.flameTrapCooldownTurns--;
  }
  const flameCooldownActive =
    state.flameTrapCooldownTurns && state.flameTrapCooldownTurns > 0;
  if (
    state.floor !== FLAME_TRAP_MODEL.floor ||
    isFlameTrapSpecialStep(generated, routePlan, floorSteps, step) ||
    flameCooldownActive
  ) {
    return false;
  }

  metrics.flameTrapEligibleSteps++;
  if (Math.random() >= FLAME_TRAP_MODEL.chance) return false;

  state.flameTrapCooldownTurns = FLAME_TRAP_MODEL.cooldownTurns;
  metrics.flameTrapActivations++;
  metrics.b5FlameActivationSteps.push(step);
  recordB5HpSnapshot(state, metrics, step);
  const warningAvoidanceChance = getPartyFlameTrapWarningAvoidanceChance(state.party);
  if (warningAvoidanceChance > 0 && Math.random() < warningAvoidanceChance) {
    metrics.flameTrapWarningAvoided++;
    recordB5HpSnapshot(state, metrics, step);
    return true;
  }
  const effect = applyTrapGuardToEffect(resolveFlameTrapEffect({
    party: state.party,
    rng: Math.random
  }), { trapGuardByParty: getSimulationTrapGuardByParty(state) });
  effect.partyDamage.forEach((damage, index) => {
    const appliedDamage = damage;
    if (appliedDamage <= 0) return;
    const character = state.party[index];
    character.hp = Math.max(0, character.hp - appliedDamage);
    clearCharIncapacitationOnDamage(character);
    metrics.flameTrapDamageHp += appliedDamage;
    if (character.hp === 0) {
      character.status = "dead";
      recordCharDeath(state, character, "火炎の罠");
      metrics.flameTrapDeaths++;
      if (!metrics.deathSnapshot) {
        metrics.deathSnapshot = {
          source: "floor-trap",
          floor: state.floor,
          round: null,
          cause: "火炎の罠",
          hpBefore: character.hp + appliedDamage,
          hpAfter: character.hp,
          maxHp: getCharMaxHp(character),
          damage: appliedDamage,
          hits: 1,
          damageMaxHpRate: appliedDamage / Math.max(1, getCharMaxHp(character)),
          killHealActivationsBeforeDeath: metrics.killHeal.killHealActivations,
          ...createDeathStateSnapshot(state, metrics.scoringProfile)
        };
      }
    }
  });
  recordB5HpSnapshot(state, metrics, step);
  return true;
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
  const { trap, previousCoord, step } = scheduled;
  metrics.trapEncounterCount++;
  metrics.trapEncounterBySource.floor++;
  if (state.simPolicy.trapPolicy === "disabled" || trap.state === "disabled") {
    return { pitfallTriggered: false };
  }

  if (trap.state === "hidden") {
    const detection = getSimulationDetectRate(state, floor);
    metrics.trapDetectionAttempts++;
    metrics.trapDetectionRateCounts[detection.rate] =
      (metrics.trapDetectionRateCounts[detection.rate] || 0) + 1;
    if (detection.scoutBonus > 0) metrics.scoutBonusDetectionAttempts++;
    if (detection.rate >= detection.cap) metrics.trapDetectionCapHits++;
    if (Math.random() < detection.rate) {
      trap.state = "discovered";
      metrics.trapDetections++;
    }
  }

  if (trap.state === "discovered") {
    const avoidance = getTrapAvoidancePlan(generated, previousCoord, trap);
    if (avoidance) {
      const evaluation = getTrapAvoidanceEvaluation(
        state,
        trap,
        floor,
        step,
        avoidance,
        metrics
      );
      metrics.trapAvoidanceCandidates++;
      metrics.trapAvoidanceExpectedEncounterCount += evaluation.expectedEncounters;
      metrics.trapAvoidanceExpectedEncounterDamage +=
        evaluation.expectedEncounterDamage || 0;
      metrics.trapAvoidanceExpectedDirectDamage += evaluation.directExpectedDamage;
      if (!evaluation.hasCombatDamageEstimate) metrics.trapAvoidanceNoEstimate++;

      const useAvoidance = state.simPolicy.trapAvoidancePolicy === "legacy"
        ? true
        : evaluation.shouldAvoid;
      if (!useAvoidance && state.simPolicy.trapAvoidancePolicy === "ev") {
        metrics.trapAvoidanceRejected++;
      } else {
        metrics.trapAvoided++;
        metrics.trapAvoidanceExtraSteps += avoidance.extraSteps;
        metrics.steps += avoidance.extraSteps;
        state.currentRun.steps += avoidance.extraSteps;
        return { pitfallTriggered: false };
      }
    }
  }

  const actionPlan = getFloorTrapActionPlan(state, trap, floor);
  metrics.trapPlanEvaluations++;
  metrics.trapDisarmRateCounts[actionPlan.baseSuccessRate] =
    (metrics.trapDisarmRateCounts[actionPlan.baseSuccessRate] || 0) + 1;
  if (actionPlan.baseSuccessRate >= actionPlan.maxRate) {
    metrics.trapDisarmCapHits++;
  }
  const action = trap.state === "hidden" ? "trigger" : actionPlan.action;
  metrics.trapPlanActionCounts[action] =
    (metrics.trapPlanActionCounts[action] || 0) + 1;
  const resolution = action === "trigger"
    ? { outcome: "triggered", partialSuccess: false }
    : resolveTrapAction({
      action,
      trap,
      successRate: actionPlan.successRate,
      rng: Math.random
    });

  if (action === "force") metrics.trapForced++;
  if (action === "disarm") metrics.trapDisarmAttempts++;
  if (resolution.outcome === "disarmed") {
    trap.state = "disabled";
    state.currentRun.trapsDisarmed++;
    metrics.trapDisarms++;
    metrics.trapDisarmSuccesses++;
    const character = state.party[0];
    const trapEater = getCharCoreParams(character, "CORE_TRAP_EATER");
    const previousTrapBonus = character.runTrapAttackBonus || 0;
    if (trapEater && previousTrapBonus < trapEater.maxAttack) {
      metrics.coreObservations.coreOpportunityCounts.CORE_TRAP_EATER++;
    }
    recordTrapDisarmObservation(metrics.coreObservations, floor);
    character.runTrapAttackBonus = getTrapEaterBonusAfterDisarm(
      character,
      previousTrapBonus
    );
    if (character.runTrapAttackBonus > previousTrapBonus) {
      recordTrapEaterEffect(
        metrics.coreObservations,
        previousTrapBonus,
        character.runTrapAttackBonus
      );
      metrics.coreObservations.coreActivationCounts.CORE_TRAP_EATER++;
    }
    return { pitfallTriggered: false };
  }

  if (action === "trigger") {
    metrics.trapActivationCauses.ambush++;
  } else if (action === "force") {
    metrics.trapActivationCauses.chosen++;
  } else {
    metrics.trapActivationCauses.disarmFailure++;
    metrics.trapDisarmFailures++;
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
  const extraCamp = state.simPolicy.extraCampFloors.includes(state.floor);
  if (!floorHasCampEvent(state.floor) && !extraCamp) return;
  const character = state.party[0];
  if (!isAlive(character)) return;
  state.currentRun.campRestCount++;
  const maxHp = getCharMaxHp(character);
  const maxMp = getCharMaxMp(character);
  const hpDeficit = Math.max(0, maxHp - character.hp);
  const mpDeficit = Math.max(0, maxMp - character.mp);
  const recoveryRate = extraCamp
    ? state.simPolicy.extraCampRecoveryRate
    : 0.4;
  const normalHpGain = Math.min(hpDeficit, Math.ceil(hpDeficit * recoveryRate));
  const normalMpGain = Math.min(mpDeficit, Math.ceil(mpDeficit * recoveryRate));
  const coreHpGain = Math.min(hpDeficit, Math.ceil(hpDeficit * 0.8));
  const coreMpGain = Math.min(mpDeficit, Math.ceil(mpDeficit * 0.8));
  const campMaster = getCharCoreParams(character, "CORE_CAMP_MASTER");
  if (campMaster) {
    observations.campBonusHpByFloor[state.floor] += coreHpGain - normalHpGain;
    observations.campBonusMpByFloor[state.floor] += coreMpGain - normalMpGain;
    observations.coreOpportunityCounts.CORE_CAMP_MASTER++;
  }

  // camp_rest.jsと同じ回復式。門番突破して次階へ進むsimではcamp到達済みと置く。
  const multiplier = campMaster?.recoveryMultiplier || 1;
  const hpGain = Math.min(hpDeficit, Math.ceil(hpDeficit * recoveryRate * multiplier));
  character.hp += hpGain;
  const mpGain = Math.min(mpDeficit, Math.ceil(mpDeficit * recoveryRate * multiplier));
  character.mp += mpGain;
  if (campMaster && (hpGain > normalHpGain ||
    mpGain > normalMpGain)) {
    observations.coreActivationCounts.CORE_CAMP_MASTER++;
  }
  if (metrics) {
    metrics.campHealingHp += hpGain;
    if (extraCamp) {
      metrics.extraCampRestCount++;
      metrics.extraCampHealingHp += hpGain;
      metrics.extraCampSteps += state.simPolicy.extraCampTimeCost;
      metrics.steps += state.simPolicy.extraCampTimeCost;
      state.currentRun.steps += state.simPolicy.extraCampTimeCost;
    }
  }
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

function recordTrapEaterEffect(observations, before, after) {
  const gain = Math.max(0, after - before);
  if (gain > 0) observations.trapEaterAttackGainTotal += gain;
}

function resolveChestTrapForSimulation(
  state,
  floor,
  trap,
  mainItem,
  observations,
  metrics,
  { futureChestCount = 0 } = {}
) {
  const character = state.party[0];
  const blindStatus = character.status === "blind" ? "blind" : "clear";
  const disarmBlindMetric = metrics.chestDisarmByBlindStatus[blindStatus];
  metrics.trapEncounterCount++;
  metrics.trapEncounterBySource.chest++;
  metrics.chestTrappedByFloor[floor]++;
  const chance = calculateChestDisarmChance({
    className: state.simPolicy.ignoreThiefSustain && character.class === "Thief"
      ? "Fighter"
      : character.class,
    trapBonus: getSimulationTrapBonus(character, state),
    blind: character.status === "blind"
  });
  observations.trappedChests++;

  if (state.simPolicy.chestTrapPolicy === "disabled") {
    const expectedDisarm = Math.max(0, Math.min(1, chance));
    observations.expectedTrapDisarms += expectedDisarm;
    observations.expectedTrapDisarmsByFloor[floor] += expectedDisarm;
    return { mainItemLost: false };
  }

  const kitCount = state.inventory.filter(item => item === "TRAP_KIT").length;
  const kitIndex = state.inventory.indexOf("TRAP_KIT");
  const action = state.simPolicy.chestTrapPolicy === "legacy"
    ? (kitIndex >= 0
      ? "kit"
      : (chance >= LEGACY_CHEST_DISARM_MIN_CHANCE ? "direct" : "force"))
    : calculateChestDisarmActionEv({
      successRate: chance,
      fullRisk: calculateChestTrapExpectedRisk({
        trap,
        party: state.party,
        targetIndex: Math.max(0, state.party.indexOf(character)),
        poisonWard: getCharAffixSum(character, "poisonWard")
      }).risk,
      weakenedRisk: calculateChestTrapExpectedRisk({
        trap,
        weakened: true,
        party: state.party,
        targetIndex: Math.max(0, state.party.indexOf(character)),
        poisonWard: getCharAffixSum(character, "poisonWard")
      }).risk,
      contentValue: calculateChestMainItemExpectedValue(mainItem),
      forcedContentLossRate: calculateChestMainItemForcedLossRate(mainItem),
      kitCount,
      futureChestCount
    }).action;
  const actionPath = action === "force" ? "forced" : action;
  disarmBlindMetric.decisions++;
  disarmBlindMetric[actionPath]++;

  if (action === "kit" && kitIndex >= 0) {
    state.inventory.splice(kitIndex, 1);
    recordTrapKitConsumption(state, metrics);
    metrics.chestDisarmAttempts++;
    metrics.chestDisarmAttemptsByFloor[floor]++;
    metrics.chestDisarmSuccesses++;
    metrics.chestDisarmSuccessesByFloor[floor]++;
    metrics.chestDisarmKitUsesByFloor[floor]++;
    metrics.trapDisarmAttempts++;
    metrics.trapDisarmSuccesses++;
    disarmBlindMetric.attempts++;
    disarmBlindMetric.successes++;
    return { mainItemLost: false };
  }

  if (action === "direct") {
    metrics.chestDisarmAttempts++;
    metrics.chestDisarmAttemptsByFloor[floor]++;
    metrics.chestDisarmDirectAttemptsByFloor[floor]++;
    metrics.trapDisarmAttempts++;
    disarmBlindMetric.attempts++;
    if (Math.random() < chance) {
      state.currentRun.trapsDisarmed++;
      metrics.trapDisarms++;
      metrics.chestDisarmSuccesses++;
      metrics.chestDisarmSuccessesByFloor[floor]++;
      metrics.trapDisarmSuccesses++;
      disarmBlindMetric.successes++;
      const previousTrapBonus = character.runTrapAttackBonus || 0;
      const trapEater = getCharCoreParams(character, "CORE_TRAP_EATER");
      if (trapEater && previousTrapBonus < trapEater.maxAttack) {
        observations.coreOpportunityCounts.CORE_TRAP_EATER++;
      }
      recordTrapDisarmObservation(observations, floor);
      character.runTrapAttackBonus = getTrapEaterBonusAfterDisarm(
        character,
        previousTrapBonus
      );
      if (character.runTrapAttackBonus > previousTrapBonus) {
        recordTrapEaterEffect(
          observations,
          previousTrapBonus,
          character.runTrapAttackBonus
        );
        observations.coreActivationCounts.CORE_TRAP_EATER++;
      }
      return { mainItemLost: false };
    }
    disarmBlindMetric.failures++;
    state.currentRun.trapsTriggered++;
    metrics.chestTrapActivationsByBlindStatus[blindStatus]++;
    applyChestTrapEffect(state, trap, false, metrics);
    return { mainItemLost: false };
  }

  metrics.trapForced++;
  metrics.chestForcedByFloor[floor]++;
  state.currentRun.trapsTriggered++;
  metrics.chestTrapActivationsByBlindStatus[blindStatus]++;
  applyChestTrapEffect(state, trap, true, metrics);
  const mainItemLossRate = calculateChestMainItemForcedLossRate(mainItem);
  const mainItemLost = mainItemLossRate > 0 && Math.random() < mainItemLossRate;
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
  metrics = null,
  { futureChestCount = 0 } = {}
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
  let item = reward.item;
  if (reward.consumedFirstChestGuarantee) {
    state.firstChestUnidentifiedGuaranteed = true;
  }
  let replacedMainItem = null;
  const replacementChance = state.simPolicy.chestHealPotionReplacementChance;
  if (
    item &&
    replacementChance !== null &&
    replacementChance > 0 &&
    rng() < replacementChance
  ) {
    replacedMainItem = item;
    item = "HEAL_POTION";
    if (metrics) {
      metrics.chestHealPotionReplacementGenerated++;
      metrics.chestEquipmentReplacedByHealPotion += Number(
        isEquipment(getItemData(replacedMainItem))
      );
    }
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
  const extraHealPotion = state.simPolicy.chestHealPotionExtraChance !== null &&
    state.simPolicy.chestHealPotionExtraChance > 0 &&
    rng() < state.simPolicy.chestHealPotionExtraChance
    ? "HEAL_POTION"
    : null;
  if (extraHealPotion && metrics) metrics.chestHealPotionExtraGenerated++;
  const items = [
    ...baselineItems,
    ...(extra ? [extra] : []),
    ...(extraHealPotion ? [extraHealPotion] : [])
  ];
  const trapResult = trap === "none"
    ? { mainItemLost: false }
    : resolveChestTrapForSimulation(
      state,
      floor,
      trap,
      item,
      observations,
      metrics,
      { futureChestCount }
    );
  return {
    items,
    mainItem: item,
    mainItemLost: trapResult.mainItemLost,
    extraHealPotion: Boolean(extraHealPotion),
    replacedMainItem
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

function createDamageHpBySource() {
  return {
    "floor-trap": 0,
    "chest-trap": 0,
    normal: 0,
    elite: 0,
    midboss: 0,
    boss: 0
  };
}

function createCurseGenerationCounts() {
  return {
    core: { generated: 0, cursed: 0 },
    nonCore: { generated: 0, cursed: 0 }
  };
}

function recordEquipmentGenerations(metrics, equipmentItems) {
  equipmentItems.forEach(item => {
    if (!isEquipment(getItemData(item))) return;
    const curseGroup = hasBuildCoreAffix(item) ? "core" : "nonCore";
    metrics.curseGeneration[curseGroup].generated++;
    if (item?.curseEffectId) metrics.curseGeneration[curseGroup].cursed++;
  });
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
    const trapBonusAffixes = (item?.affixes || []).filter(affix =>
      (affix.id || affix.type) === "trapBonus"
    );
    if (trapBonusAffixes.length > 0) metrics.trapBonusItemsFound++;
    trapBonusAffixes.forEach(affix => {
      const value = String(affix.value || 0);
      metrics.trapBonusFoundByValue[value] =
        (metrics.trapBonusFoundByValue[value] || 0) + 1;
    });
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
  if (
    !override ||
    !["baseline", "probability", "depth-slope"].includes(override.shape)
  ) return additions;
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

function finishRun(state, outcome, metrics, terminationReason = null) {
  if (metrics.b5FloorActive) {
    recordB5HpSnapshot(state, metrics, metrics.b5LastStep);
    if (metrics.deathSnapshot?.floor === FLAME_TRAP_MODEL.floor) {
      recordB5HpValue(
        metrics,
        metrics.deathSnapshot.hpBefore,
        metrics.deathSnapshot.maxHp
      );
    }
  }
  if (outcome === "death" && !metrics.deathSnapshot) {
    const deathLog = state.currentRun.deathLogs?.at(-1) || null;
    metrics.deathSnapshot = {
      source: metrics.deathEncounterType || "unknown",
      floor: state.floor,
      round: null,
      cause: deathLog?.cause || null,
      ...createDeathStateSnapshot(state, metrics.scoringProfile)
    };
  }
  const b5DeathLog = state.currentRun.deathLogs?.find(
    log => log.floor === FLAME_TRAP_MODEL.floor
  ) || null;
  const b5DeathCause = outcome === "death" && state.floor === FLAME_TRAP_MODEL.floor
    ? b5DeathLog?.cause || null
    : null;
  const b5DeathStep = b5DeathCause ? metrics.b5LastStep : null;
  const b5DeathAfterFlameWithinFiveSteps = Boolean(
    b5DeathCause &&
    b5DeathCause !== "火炎の罠" &&
    Number.isFinite(b5DeathStep) &&
    metrics.b5FlameActivationSteps.some(
      step => b5DeathStep > step && b5DeathStep - step <= 5
    )
  );
  const healPotionCount = state.inventory.filter(item => item === "HEAL_POTION").length;
  if (healPotionCount !== state.simHealPotionSources.length) {
    throw new Error(
      `heal potion provenance mismatch: inventory=${healPotionCount}, ` +
      `sources=${state.simHealPotionSources.length}`
    );
  }
  const greaterHealCount = state.inventory.filter(item => item === "GREATER_HEAL").length;
  if (greaterHealCount !== state.simGreaterHealSources.length) {
    throw new Error(
      `greater heal provenance mismatch: inventory=${greaterHealCount}, ` +
      `sources=${state.simGreaterHealSources.length}`
    );
  }
  const manaPotionCount = state.inventory.filter(item => item === "MANA_POTION").length;
  if (manaPotionCount !== state.simManaPotionSources.length) {
    throw new Error(
      `mana potion provenance mismatch: inventory=${manaPotionCount}, ` +
      `sources=${state.simManaPotionSources.length}`
    );
  }
  const holyWaterCount = state.inventory.filter(item => item === "HOLY_WATER").length;
  if (holyWaterCount !== state.simHolyWaterSources.length) {
    throw new Error(
      `holy water provenance mismatch: inventory=${holyWaterCount}, ` +
      `sources=${state.simHolyWaterSources.length}`
    );
  }
  const trapKitCount = state.inventory.filter(item => item === "TRAP_KIT").length;
  if (trapKitCount !== state.simTrapKitSources.length) {
    throw new Error(
      `trap kit provenance mismatch: inventory=${trapKitCount}, ` +
      `sources=${state.simTrapKitSources.length}`
    );
  }
  const materialsBeforeFinalQuests = { ...state.currentRun.materials };
  updateRunQuests(
    state.currentRun,
    getCharAffixSum(state.party[0], "contractReward")
  );
  const finalQuestRewards = getMaterialDelta(
    materialsBeforeFinalQuests,
    state.currentRun.materials
  );
  metrics.materialSources.quest += totalMaterials(finalQuestRewards);
  addMaterials(metrics.materialSourceCounts.quest, finalQuestRewards);

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

  const materialAcquiredBySource = {
    combat: metrics.materialSources.combat,
    chest: metrics.materialSources.chest,
    quest: metrics.materialSources.quest
  };
  const materialAcquired = totalMaterials(materialAcquiredBySource);
  const materialConsumed = totalMaterials(metrics.materialConsumedByMerchant);
  const carriedMaterials = totalMaterials(state.currentRun.materials);
  metrics.materialSources.other = Math.max(
    0,
    carriedMaterials - totalMaterials(metrics.materialSources)
  );
  MATERIAL_TYPES.forEach(material => {
    const tracked = ["combat", "chest", "quest"].reduce(
      (sum, source) => sum + metrics.materialSourceCounts[source][material],
      0
    );
    metrics.materialSourceCounts.other[material] = Math.max(
      0,
      (state.currentRun.materials[material] || 0) - tracked
    );
  });
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

  const finalCoreIds = [...new Set(
    getEquippedCoreAffixes(state.party[0])
      .map(affix => affix.id || affix.type)
      .filter(id => CORE_AFFIX_IDS.has(id))
  )];
  const finalCoreCurseLockedIds = [...new Set(
    Object.values(state.party[0].equipment || {})
      .filter(item => isSimulationCurseLocked(item))
      .map(getItemCoreId)
      .filter(Boolean)
  )];
  const finalCoreId = finalCoreIds[0] || null;
  const resolvedTerminationReason = terminationReason ||
    (outcome === "death" ? "death" : "retreat");
  const mpDepletionCausedEnd = Boolean(
    outcome === "death" && metrics.mpBlockedTerminalEncounter
  );
  if (metrics.diagnostics && metrics.diagnosticLevel === "full") {
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
    materialAcquired,
    materialAcquiredBySource,
    materialConsumed,
    carriedMaterialCounts: { ...state.currentRun.materials },
    bankedMaterialCounts: { ...banked },
    metaMaterials: { ...state.metaMaterials },
    timeCost: metrics.steps + COMBAT_TURN_WEIGHT * metrics.combatRounds,
    steps: metrics.steps,
    battles: state.currentRun.battles,
    floorBudgetSteps: metrics.floorBudgetSteps,
    routePolicyExtraSteps: metrics.routePolicyExtraSteps,
    eliteExtraSteps: metrics.eliteExtraSteps,
    extraCampSteps: metrics.extraCampSteps,
    campRestCount: state.currentRun.campRestCount,
    combatRounds: metrics.combatRounds,
    reachedFloor: state.currentRun.deepestFloor,
    endFloor: state.floor,
    deathFloor: outcome === "death" ? state.floor : null,
    stalemate: metrics.stalemate,
    finalLevel: state.party[0].level,
    expGained: state.currentRun.expGained,
    workshopEffects: state.workshopEffects,
    keyItems: [...state.keyItems],
    unlockedMilestones: [...state.unlockedMilestones],
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
    identificationCost: IDENTIFICATION_COST,
    identificationPowderRemaining: state.simIdentificationPowderUnlimited
      ? 0
      : state.identifyTickets || 0,
    identificationPowderUnlimited: Boolean(state.simIdentificationPowderUnlimited),
    identificationPowderDepleted:
      !state.simIdentificationPowderUnlimited && (state.identifyTickets || 0) === 0,
    identificationCount: metrics.identificationCount,
    unidentifiedWearCount: metrics.unidentifiedWearCount,
    curseHitCount: metrics.curseHitCount,
    equipmentFoundBySource: metrics.equipmentFoundBySource,
    equipmentFoundByFloor: metrics.equipmentFoundByFloor,
    curseGeneration: {
      core: { ...metrics.curseGeneration.core },
      nonCore: { ...metrics.curseGeneration.nonCore }
    },
    supportAffixFoundById: { ...metrics.supportAffixFoundById },
    trapBonusItemsFound: metrics.trapBonusItemsFound,
    trapBonusFoundByValue: { ...metrics.trapBonusFoundByValue },
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
    coreCursedLockedIds: [...metrics.coreCursedLockedIds],
    coreBlockedByCurseLockIds: [...metrics.coreBlockedByCurseLockIds],
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
    coreEquipped: finalCoreIds.length > 0,
    finalCoreIds,
    finalCoreCurseLockedIds,
    finalCoreId,
    coreObservations: metrics.coreObservations,
    healPriorityPolicy: state.simPolicy.healPriorityPolicy,
    bloodWandHealPolicy: state.simPolicy.bloodWandHealPolicy,
    fleePolicy: state.simPolicy.fleePolicy,
    fleeHpThreshold: state.simPolicy.fleeHpThreshold,
    healPotionThreshold: state.simPolicy.healPotionThreshold,
    manaPotionThreshold: state.simPolicy.manaPotionThreshold,
    diosCombatCastCount: metrics.coreObservations.diosHealActions,
    diosPostCombatCastCount: metrics.diosPostCombatCasts,
    diosCastCount: metrics.coreObservations.diosHealActions + metrics.diosPostCombatCasts,
    healPotionsUsed: metrics.healPotionsUsed,
    greaterHealPotionsUsed: metrics.greaterHealPotionsUsed,
    recoveryPotionsUsed: metrics.recoveryPotionsUsed,
    combatHealPotionsUsed: metrics.combatHealPotionsUsed,
    combatGreaterHealPotionsUsed: metrics.combatGreaterHealPotionsUsed,
    combatRecoveryPotionsUsed: metrics.combatRecoveryPotionsUsed,
    outsideHealPotionsUsed: metrics.outsideHealPotionsUsed,
    outsideGreaterHealPotionsUsed: metrics.outsideGreaterHealPotionsUsed,
    outsideRecoveryPotionsUsed: metrics.outsideRecoveryPotionsUsed,
    recoveryPotionShortages: metrics.recoveryPotionShortages,
    recoveryPotionOffersBySource: Object.fromEntries(
      Object.entries(metrics.recoveryPotionOffersBySource).map(([source, counts]) => [
        source,
        { ...counts }
      ])
    ),
    recoveryHealing: {
      total: { ...metrics.recoveryHealing.total },
      byItem: Object.fromEntries(
        Object.entries(metrics.recoveryHealing.byItem).map(([itemKey, stats]) => [
          itemKey,
          { ...stats }
        ])
      ),
      byLevelBand: Object.fromEntries(
        Object.entries(metrics.recoveryHealing.byLevelBand).map(([band, stats]) => [
          band,
          { ...stats }
        ])
      )
    },
    healPotionsAcquiredBySource: { ...metrics.healPotionsAcquiredBySource },
    healPotionsConsumedBySource: { ...metrics.healPotionsConsumedBySource },
    greaterHealPotionsAcquiredBySource: { ...metrics.greaterHealPotionsAcquiredBySource },
    greaterHealPotionsConsumedBySource: { ...metrics.greaterHealPotionsConsumedBySource },
    manaPotionsUsed: metrics.manaPotionsUsed,
    manaPotionsAcquiredBySource: { ...metrics.manaPotionsAcquiredBySource },
    manaPotionsConsumedBySource: { ...metrics.manaPotionsConsumedBySource },
    holyWaterUsed: metrics.holyWaterUsed,
    holyWaterAcquiredBySource: { ...metrics.holyWaterAcquiredBySource },
    holyWaterConsumedBySource: { ...metrics.holyWaterConsumedBySource },
    departureCraftCraftedByRecipe: { ...metrics.departureCraftCraftedByRecipe },
    departureCraftPotentialByRecipe: { ...metrics.departureCraftPotentialByRecipe },
    materialCompetition: state.simMaterialCompetition
      ? { ...state.simMaterialCompetition }
      : null,
    healPotionMerchantAttempts: metrics.healPotionMerchantAttempts,
    healPotionMerchantPurchased: metrics.healPotionMerchantPurchased,
    healPotionMerchantHoldLimitHits: metrics.healPotionMerchantHoldLimitHits,
    healPotionMerchantFailures: { ...metrics.healPotionMerchantFailures },
    healPotionMerchantPolicy: state.simPolicy.healPotionMerchantPolicy,
    healPotionMerchantMaxPurchases: state.simPolicy.healPotionMerchantMaxPurchases,
    healPotionMerchantHoldLimit: state.simPolicy.healPotionMerchantHoldLimit,
    strPotionMerchantAttempts: metrics.strPotionMerchantAttempts,
    strPotionsPurchased: metrics.strPotionsPurchased,
    strPotionMerchantFailures: { ...metrics.strPotionMerchantFailures },
    combatDamageHp: metrics.combatDamageHp,
    incomingHits: metrics.incomingHits,
    incomingHitTurns: metrics.incomingHitTurns,
    combatDamageHpByType: { ...metrics.combatDamageHpByType },
    damageHpBySource: { ...metrics.damageHpBySource },
    lastDamageEvent: metrics.lastDamageEvent
      ? { ...metrics.lastDamageEvent }
      : null,
    recoveryPotionDepletedFloor: metrics.recoveryPotionDepletedFloor,
    recoveryPotionShortageFloor: metrics.recoveryPotionShortageFloor,
    stairsHealingHp: metrics.stairsHealingHp,
    campHealingHp: metrics.campHealingHp,
    extraCampRestCount: metrics.extraCampRestCount,
    extraCampHealingHp: metrics.extraCampHealingHp,
    extraCampTimeCost: state.simPolicy.extraCampTimeCost,
    diosHealingHp: metrics.diosHealingHp + metrics.coreObservations.diosHealing,
    diosPotionPriorityOpportunities: metrics.diosPotionPriorityOpportunities,
    diosPotionPriorityCases: metrics.diosPotionPriorityCases,
    diosPotionPriorityEventSamples: metrics.diosPotionPriorityEventSamples || [],
    spellUsage: Object.fromEntries(
      Object.entries(metrics.spellUsage).map(([spellName, usage]) => [
        spellName,
        { ...usage }
      ])
    ),
    explorationSpellUsage: { ...metrics.explorationSpellUsage },
    lightActiveSteps: metrics.lightActiveSteps,
    masfealActiveSteps: metrics.masfealActiveSteps,
    mpDepleted: metrics.mpDepleted,
    mpZeroCombatRounds: metrics.mpZeroCombatRounds,
    reserveMpViolations: metrics.reserveMpViolations,
    trapPolicy: state.simPolicy.trapPolicy,
    chestTrapPolicy: state.simPolicy.chestTrapPolicy,
    trapAvoidancePolicy: state.simPolicy.trapAvoidancePolicy,
    floorTrapDetection: state.simPolicy.floorTrapDetection,
    trapActivations: metrics.trapActivations,
    trapActivationsBySource: { ...metrics.trapActivationsBySource },
    trapActivationsByType: { ...metrics.trapActivationsByType },
    flameTrapActivations: metrics.flameTrapActivations,
    flameTrapDamageHp: metrics.flameTrapDamageHp,
    flameTrapDeaths: metrics.flameTrapDeaths,
    flameTrapEligibleSteps: metrics.flameTrapEligibleSteps,
    flameTrapWarningAvoided: metrics.flameTrapWarningAvoided,
    trapEncounterCount: metrics.trapEncounterCount,
    trapEncounterBySource: { ...metrics.trapEncounterBySource },
    chestsOpened: metrics.chestsOpened,
    chestHealPotionExtraGenerated: metrics.chestHealPotionExtraGenerated,
    chestHealPotionReplacementGenerated: metrics.chestHealPotionReplacementGenerated,
    chestEquipmentReplacedByHealPotion: metrics.chestEquipmentReplacedByHealPotion,
    enemyHealPotionExtraGenerated: metrics.enemyHealPotionExtraGenerated,
    pickupAttemptsBySource: { ...metrics.pickupAttemptsBySource },
    pickupRejectionsBySource: { ...metrics.pickupRejectionsBySource },
    pickupRejectionsByCategory: { ...metrics.pickupRejectionsByCategory },
    chestsOpenedByFloor: [...metrics.chestsOpenedByFloor],
    chestTrappedByFloor: [...metrics.chestTrappedByFloor],
    chestDisarmAttempts: metrics.chestDisarmAttempts,
    chestDisarmAttemptsByFloor: [...metrics.chestDisarmAttemptsByFloor],
    chestDisarmSuccesses: metrics.chestDisarmSuccesses,
    chestDisarmSuccessesByFloor: [...metrics.chestDisarmSuccessesByFloor],
    chestDisarmKitUsesByFloor: [...metrics.chestDisarmKitUsesByFloor],
    chestDisarmDirectAttemptsByFloor: [...metrics.chestDisarmDirectAttemptsByFloor],
    chestForcedByFloor: [...metrics.chestForcedByFloor],
    blindTelemetry: {
      applicationsBySource: { ...metrics.blindApplicationsBySource },
      chestDisarmByBlindStatus: Object.fromEntries(
        Object.entries(metrics.chestDisarmByBlindStatus).map(([status, values]) => [
          status,
          { ...values }
        ])
      ),
      chestTrapActivationsByBlindStatus: {
        ...metrics.chestTrapActivationsByBlindStatus
      },
      chestTrapDamageHpByBlindStatus: {
        ...metrics.chestTrapDamageHpByBlindStatus
      },
      chestFlashTrapActivationsByBlindStatus: {
        ...metrics.chestFlashTrapActivationsByBlindStatus
      },
      trapGuardFlashCoverage: { ...metrics.trapGuardFlashCoverage }
    },
    trapDamageHp: metrics.trapDamageHp,
    trapDamageHpBySource: { ...metrics.trapDamageHpBySource },
    trapDamageHpByType: { ...metrics.trapDamageHpByType },
    trapHealPotionsUsed: metrics.trapHealPotionsUsed,
    trapGreaterHealPotionsUsed: metrics.trapGreaterHealPotionsUsed,
    trapHealPotionShortages: metrics.trapHealPotionShortages,
    trapDisarms: metrics.trapDisarms,
    trapDisarmAttempts: metrics.trapDisarmAttempts,
    trapDisarmSuccesses: metrics.trapDisarmSuccesses,
    trapDisarmRateCounts: { ...metrics.trapDisarmRateCounts },
    trapDisarmCapHits: metrics.trapDisarmCapHits,
    trapPlanEvaluations: metrics.trapPlanEvaluations,
    trapPlanActionCounts: { ...metrics.trapPlanActionCounts },
    trapActivationCauses: { ...metrics.trapActivationCauses },
    trapDisarmFailures: metrics.trapDisarmFailures,
    trapAvoided: metrics.trapAvoided,
    trapForced: metrics.trapForced,
    trapAvoidanceExtraSteps: metrics.trapAvoidanceExtraSteps,
    trapAvoidanceCandidates: metrics.trapAvoidanceCandidates,
    trapAvoidanceRejected: metrics.trapAvoidanceRejected,
    trapAvoidanceNoEstimate: metrics.trapAvoidanceNoEstimate,
    trapAvoidanceExpectedEncounterCount: metrics.trapAvoidanceExpectedEncounterCount,
    trapAvoidanceExpectedEncounterDamage: metrics.trapAvoidanceExpectedEncounterDamage,
    trapAvoidanceExpectedDirectDamage: metrics.trapAvoidanceExpectedDirectDamage,
    trapKitsAcquired: metrics.trapKitsAcquired,
    trapKitsUsed: metrics.trapKitsUsed,
    trapKitsAcquiredBySource: { ...metrics.trapKitsAcquiredBySource },
    trapKitsConsumedBySource: { ...metrics.trapKitsConsumedBySource },
    trapDetections: metrics.trapDetections,
    trapDetectionAttempts: metrics.trapDetectionAttempts,
    trapDetectionRateCounts: { ...metrics.trapDetectionRateCounts },
    trapDetectionCapHits: metrics.trapDetectionCapHits,
    scoutBonusDetectionAttempts: metrics.scoutBonusDetectionAttempts,
    trapTeleports: metrics.trapTeleports,
    finalHealPotions: state.inventory.filter(item => item === "HEAL_POTION").length,
    finalGreaterHeals: state.inventory.filter(item => item === "GREATER_HEAL").length,
    finalRecoveryPotions: state.inventory.filter(item =>
      item === "HEAL_POTION" || item === "GREATER_HEAL"
    ).length,
    finalInventorySlots: state.inventory.length,
    departureCraft: {
      recipeIds: [...state.simDepartureCraft.recipeIds],
      cost: { ...state.simDepartureCraft.cost },
      items: [...state.simDepartureCraftItems],
      purchaseSource: state.simDepartureCraft.purchaseSource,
      potentialByRecipe: { ...(
        state.simDepartureCraftDemand?.potentialByRecipe || createCraftMeasurementCounts()
      ) }
    },
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
    terminationReason: resolvedTerminationReason,
    finalHp: state.party[0].hp,
    finalMaxHp: getCharMaxHp(state.party[0]),
    finalHpRate: state.party[0].hp / Math.max(1, getCharMaxHp(state.party[0])),
    finalMp: state.party[0].mp,
    finalMaxMp: getCharMaxMp(state.party[0]),
    finalMpRate: state.party[0].mp / Math.max(1, getCharMaxMp(state.party[0])),
    mpBlockedTerminalEncounter: Boolean(metrics.mpBlockedTerminalEncounter),
    mpDepletionCausedEnd,
    mpPressure: finalizeSpellPressureMetrics(metrics.mpPressure),
    fleeCount: metrics.fleeCount,
    bossPolicy: metrics.bossPolicy,
    bossExitPolicy: metrics.bossExitPolicy,
    specialCellsDetected: metrics.specialCellsDetected,
    specialRouteFloors: metrics.specialRouteFloors,
    specialBattles: metrics.specialBattles,
    deathEncounterType: metrics.deathEncounterType,
    deathCause: state.currentRun.deathLogs?.at(-1)?.cause || null,
    b5Entrant: metrics.b5EntrantHp !== null,
    b5EntrantHp: metrics.b5EntrantHp,
    b5EntrantHpRate: metrics.b5EntrantHpRate,
    b5MinimumHp: metrics.b5MinimumHp,
    b5MinimumPositiveHp: metrics.b5MinimumPositiveHp,
    b5MinimumPositiveHpRate: metrics.b5MinimumPositiveHpRate,
    b5DeathCause,
    b5DeathAfterFlameWithinFiveSteps,
    deathSnapshot: metrics.deathSnapshot,
    killHeal: { ...metrics.killHeal },
    combatFormula: state.combatFormulaTelemetry || null,
    dragonKeysAcquired: metrics.dragonKeysAcquired,
    dragonKeyUses: metrics.dragonKeyUses,
    normalCombatTelemetry: metrics.normalCombatTelemetry,
    encounterGroupCounts: Object.fromEntries(
      Object.entries(metrics.encounterGroupCounts).map(([band, groups]) => [band, { ...groups }])
    ),
    encounterFallbacks: Object.values(metrics.encounterFallbacks),
    materialSources: metrics.materialSources,
    materialSourceCounts: cloneMaterialCountsBySource(metrics.materialSourceCounts),
    materialConsumedByMerchant: { ...metrics.materialConsumedByMerchant },
    combatMaterialEvents: metrics.combatMaterialEvents,
    combatMaterialHitEvents: metrics.combatMaterialHitEvents,
    diagnostics: metrics.diagnostics,
    ...(metrics.buildSnapshots ? { buildSnapshots: metrics.buildSnapshots } : {}),
    ...(metrics.equipmentTelemetry
      ? { equipmentTelemetry: metrics.equipmentTelemetry }
      : {})
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
  applyFloorTransitionHeal(
    state.party[0],
    state.simPolicy.floorTransitionRecoveryRate
  );
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
  keyItems = [],
  unlockedMilestones = [],
  supplyOverride = null,
  collectDiagnostics = false,
  encounterRateOverride = null,
  collectBuildSnapshots = false,
  collectEquipmentTelemetry = false,
  collectCombatFormula = false
}) {
  const runSeed = `${SIM_SEED}:${seriesId}:${className}:${runIndex}`;
  if (SIM_INDEPENDENT_RUN_RANDOM) {
    // Keep each class/run on an independent deterministic stream. Otherwise a
    // Priest-only spell change can shift the shared stream and make Fighter,
    // Thief, or Mage appear to change as a measurement artifact.
    randomState = hashSimulationRunSeed(runSeed);
  }
  const diagnosticLevel = scenario?.simDiagnosticLevel || "full";
  let state = createSimulationState(
    className,
    startFloor,
    runSeed,
    scenario,
    workshop,
    keyItems,
    unlockedMilestones
  );
  if (CORE_WORKSHOP_GATE_MODE === "off") {
    state.party[0].unlockedAffixIds = [...ALL_CORE_AFFIX_IDS];
  }
  if (typeof encounterRateOverride === "function") {
    state.encounterRateOverride = encounterRateOverride;
  }
  // Issue #611: 戦闘計算式の実態測定用計装。既定オフ。有効時のみ
  // src/combat_logic/{round,damage,spell_resolution}.js のフックが書き込む。
  if (collectCombatFormula) {
    state.combatFormulaTelemetry = {
      physicalPlayerHits: [],
      physicalMonsterHits: [],
      spellHits: [],
      spellMonsterHits: [],
      mitigations: [],
      mitigationCalls: [],
      targetedBonuses: []
    };
  }
  const materialOverrideRandom = createMaterialOverrideRandom(
    `${runSeed}:${scenario.materialDropOverride?.id || "baseline"}`
  );
  const metrics = {
    steps: 0,
    floorBudgetSteps: 0,
    routePolicyExtraSteps: 0,
    eliteExtraSteps: 0,
    extraCampSteps: 0,
    combatRounds: 0,
    stalemate: false,
    equipmentUpgrades: 0,
    earlyEquipmentUpgrades: 0,
    deepEquipmentUpgrades: 0,
    equipmentTelemetry: collectEquipmentTelemetry ? [] : null,
    equipmentFound: 0,
    earlyEquipmentFound: 0,
    deepEquipmentFound: 0,
    identificationPowderAcquired: Object.values(
      state.simIdentificationPowderAcquired || {}
    ).reduce((sum, amount) => sum + amount, 0),
    identificationPowderAcquiredBySource: {
      starting: state.simIdentificationPowderAcquired?.starting || 0,
      workshop: state.simIdentificationPowderAcquired?.workshop || 0,
      departureCraft: state.simIdentificationPowderAcquired?.departureCraft || 0,
      chest: 0,
      codex: 0,
      merchant: 0
    },
    identificationPowderUsed: 0,
    identificationCount: 0,
    unidentifiedWearCount: 0,
    curseHitCount: 0,
    equipmentFoundBySource: { combat: 0, chest: 0, other: 0 },
    equipmentFoundByFloor: Array(21).fill(0),
    curseGeneration: createCurseGenerationCounts(),
    supportAffixFoundById: {},
    trapBonusItemsFound: 0,
    trapBonusFoundByValue: {},
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
    coreCursedLockedIds: new Set(),
    coreBlockedByCurseLockIds: new Set(),
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
    recoveryPotionDepletedFloor: null,
    recoveryPotionShortageFloor: null,
    healPotionsUsed: 0,
    greaterHealPotionsUsed: 0,
    recoveryPotionsUsed: 0,
    combatHealPotionsUsed: 0,
    combatGreaterHealPotionsUsed: 0,
    combatRecoveryPotionsUsed: 0,
    outsideHealPotionsUsed: 0,
    outsideGreaterHealPotionsUsed: 0,
    outsideRecoveryPotionsUsed: 0,
    recoveryPotionShortages: 0,
    recoveryPotionOffersBySource: {},
    recoveryHealing: {
      total: createRecoveryHealingStats(),
      byItem: {
        HEAL_POTION: createRecoveryHealingStats(),
        GREATER_HEAL: createRecoveryHealingStats()
      },
      byLevelBand: createRecoveryHealingByLevelBand()
    },
    stairsHealingHp: 0,
    campHealingHp: 0,
    extraCampRestCount: 0,
    extraCampHealingHp: 0,
    diosHealingHp: 0,
    diosPostCombatCasts: 0,
    diosPotionPriorityOpportunities: 0,
    diosPotionPriorityCases: 0,
    diosPotionPriorityEventSamples: scenario.collectHealPriorityDiagnostics ? [] : null,
    spellUsage: createSpellUsageMetrics(),
    explorationSpellUsage: createExplorationSpellUsageMetrics(),
    mpPressure: createSpellPressureMetrics(),
    mpBlockedTerminalEncounter: false,
    lightActiveSteps: 0,
    masfealActiveSteps: 0,
    mpDepleted: false,
    mpZeroCombatRounds: 0,
    reserveMpViolations: 0,
    healPotionsAcquiredBySource: {
      starting: state.simStartingInventory.filter(item => item === "HEAL_POTION").length,
      departureCraft: state.simDepartureCraftItems.filter(item => item === "HEAL_POTION").length,
      chest: 0,
      merchant: 0,
      other: 0
    },
    healPotionsConsumedBySource: {
      starting: 0,
      departureCraft: 0,
      chest: 0,
      merchant: 0,
      other: 0
    },
    greaterHealPotionsAcquiredBySource: {
      starting: state.simStartingInventory.filter(item => item === "GREATER_HEAL").length,
      departureCraft: state.simDepartureCraftItems.filter(item => item === "GREATER_HEAL").length,
      chest: 0,
      merchant: 0,
      other: 0
    },
    greaterHealPotionsConsumedBySource: {
      starting: 0,
      departureCraft: 0,
      chest: 0,
      merchant: 0,
      other: 0
    },
    manaPotionsUsed: 0,
    holyWaterUsed: 0,
    manaPotionsAcquiredBySource: {
      ...createTrackedConsumableSourceCounts(),
      starting: state.simStartingInventory.filter(item => item === "MANA_POTION").length,
      departureCraft: state.simDepartureCraftItems.filter(item => item === "MANA_POTION").length
    },
    manaPotionsConsumedBySource: createTrackedConsumableSourceCounts(),
    holyWaterAcquiredBySource: {
      ...createTrackedConsumableSourceCounts(),
      starting: state.simStartingInventory.filter(item => item === "HOLY_WATER").length,
      departureCraft: state.simDepartureCraftItems.filter(item => item === "HOLY_WATER").length
    },
    holyWaterConsumedBySource: createTrackedConsumableSourceCounts(),
    departureCraftCraftedByRecipe: countRecipeIds(state.simDepartureCraftItems),
    departureCraftPotentialByRecipe:
      state.simDepartureCraftDemand?.potentialByRecipe || createCraftMeasurementCounts(),
    materialSourceCounts: createMaterialCountsBySource(),
    materialCompetition: {
      shardBalanceBeforeDeparture: state.simMaterialCompetition?.shardBalanceBeforeDeparture || 0,
      weaponEnhancementAffordable: state.simMaterialCompetition?.weaponEnhancementAffordable || 0,
      affordableWorkshopNodeCount: state.simMaterialCompetition?.affordableWorkshopNodeCount || 0,
      simulatedWeaponEnhancementShardSpend:
        state.simMaterialCompetition?.simulatedWeaponEnhancementShardSpend || 0,
      simulatedWorkshopNodeShardSpend:
        state.simMaterialCompetition?.simulatedWorkshopNodeShardSpend || 0
    },
    trapActivations: 0,
    trapActivationsBySource: { chest: 0, floor: 0 },
    trapActivationsByType: {},
    flameTrapActivations: 0,
    flameTrapDamageHp: 0,
    flameTrapDeaths: 0,
    flameTrapEligibleSteps: 0,
    flameTrapWarningAvoided: 0,
    b5FloorActive: false,
    b5EntrantHp: null,
    b5EntrantMaxHp: null,
    b5EntrantHpRate: null,
    b5MinimumHp: null,
    b5MinimumPositiveHp: null,
    b5MinimumPositiveHpRate: null,
    b5LastStep: null,
    b5FlameActivationSteps: [],
    trapEncounterCount: 0,
    trapEncounterBySource: { chest: 0, floor: 0 },
    chestsOpened: 0,
    chestHealPotionExtraGenerated: 0,
    chestHealPotionReplacementGenerated: 0,
    chestEquipmentReplacedByHealPotion: 0,
    enemyHealPotionExtraGenerated: 0,
    pickupAttemptsBySource: { chest: 0, combat: 0, material: 0 },
    pickupRejectionsBySource: { chest: 0, combat: 0, material: 0 },
    pickupRejectionsByCategory: { item: 0, equipment: 0, material: 0 },
    chestsOpenedByFloor: Array(21).fill(0),
    chestTrappedByFloor: Array(21).fill(0),
    chestDisarmAttempts: 0,
    chestDisarmAttemptsByFloor: Array(21).fill(0),
    chestDisarmSuccesses: 0,
    chestDisarmSuccessesByFloor: Array(21).fill(0),
    chestDisarmKitUsesByFloor: Array(21).fill(0),
    chestDisarmDirectAttemptsByFloor: Array(21).fill(0),
    chestForcedByFloor: Array(21).fill(0),
    blindApplicationsBySource: { chest: 0, floor: 0, enemy: 0 },
    chestDisarmByBlindStatus: {
      clear: createChestDisarmBlindStatusMetric(),
      blind: createChestDisarmBlindStatusMetric()
    },
    chestTrapActivationsByBlindStatus: { clear: 0, blind: 0 },
    chestTrapDamageHpByBlindStatus: { clear: 0, blind: 0 },
    chestFlashTrapActivationsByBlindStatus: { clear: 0, blind: 0 },
    trapGuardFlashCoverage: {
      effects: 0,
      effectsWithGuard: 0,
      blindEffectUnchanged: 0
    },
    trapDamageHp: 0,
    trapDamageHpBySource: { chest: 0, floor: 0 },
    trapDamageHpByType: {},
    trapHealPotionsUsed: 0,
    trapGreaterHealPotionsUsed: 0,
    trapHealPotionShortages: 0,
    trapDisarms: 0,
    trapDisarmAttempts: 0,
    trapDisarmSuccesses: 0,
    trapDisarmRateCounts: {},
    trapDisarmCapHits: 0,
    trapPlanEvaluations: 0,
    trapPlanActionCounts: {},
    trapActivationCauses: {
      ambush: 0,
      chosen: 0,
      disarmFailure: 0
    },
    trapDisarmFailures: 0,
    trapAvoided: 0,
    trapForced: 0,
    trapAvoidanceExtraSteps: 0,
    trapAvoidanceCandidates: 0,
    trapAvoidanceRejected: 0,
    trapAvoidanceNoEstimate: 0,
    trapAvoidanceExpectedEncounterCount: 0,
    trapAvoidanceExpectedEncounterDamage: 0,
    trapAvoidanceExpectedDirectDamage: 0,
    trapKitsAcquired: state.simTrapKitSources.length,
    trapKitsUsed: 0,
    trapKitsAcquiredBySource: {
      starting: 0,
      departureCraft: state.simTrapKitSources.length,
      chest: 0,
      other: 0
    },
    trapKitsConsumedBySource: {
      starting: 0,
      departureCraft: 0,
      chest: 0,
      other: 0
    },
    trapDetections: 0,
    trapDetectionAttempts: 0,
    trapDetectionRateCounts: {},
    trapDetectionCapHits: 0,
    scoutBonusDetectionAttempts: 0,
    trapTeleports: 0,
    combatDamageHp: 0,
    incomingHits: 0,
    incomingHitTurns: 0,
    combatDamageHpByType: {},
    damageHpBySource: createDamageHpBySource(),
    lastDamageEvent: null,
    deathSnapshot: null,
    killHeal: {
      killHealActivations: 0,
      killHealPotentialHp: 0,
      killHealRecoveredHp: 0
    },
    statusCureItemsAcquired: {
      initial: countInventoryItems(state.simStartingInventory),
      departureCraft: countInventoryItems(state.simDepartureCraftItems),
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
    healPotionMerchantPurchased: 0,
    healPotionMerchantHoldLimitHits: 0,
    healPotionMerchantFailures: {},
    strPotionMerchantAttempts: 0,
    strPotionsPurchased: 0,
    strPotionMerchantFailures: {},
    townPortalsUsed: 0,
    portalUseEvents: [],
    portalUsesBySource: {},
    portalAcquisitions: {
      workshop: state.simPortalSources.filter(source => source === "workshop").length,
      workshopSupply: state.simPortalSources.filter(source => source === "workshop-supply").length,
      departureCraft: state.simPortalSources.filter(source => source === "departure-craft").length,
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
    bossExitPolicy: scenario.bossExitPolicy || "shortcut-0",
    diagnosticLevel,
    collectSpecialBattles: collectDiagnostics && diagnosticLevel === "full",
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
    encounterGroupCounts: createEncounterGroupCounts(),
    encounterFallbacks: {},
    materialSources: {
      chest: 0,
      combat: 0,
      quest: 0
    },
    materialSourceCounts: createMaterialCountsBySource(),
    materialConsumedByMerchant: Object.fromEntries(
      MATERIAL_TYPES.map(material => [material, 0])
    ),
    combatMaterialEvents: 0,
    combatMaterialHitEvents: 0,
    scoringProfile,
    buildSnapshots: collectBuildSnapshots && !collectDiagnostics ? [] : null,
    diagnostics: collectDiagnostics
      ? {
          level: diagnosticLevel,
          buildSnapshots: [],
          encounters: [],
          deathLogs: [],
          finalBuild: null
        }
      : null
  };
  state.simTelemetry = metrics.killHeal;

  // 目標階へ到着した時点で撤退するため、探索するのはtargetDepthの1階手前まで。
  for (let floor = startFloor; floor < targetDepth; floor++) {
    state.floor = floor;
    applyTrapBonusExposureCeiling(state, floor);
    const buildSnapshots = metrics.diagnostics?.buildSnapshots || metrics.buildSnapshots;
    if (buildSnapshots) {
      buildSnapshots.push(createBuildSnapshot(state, scoringProfile, "floor-start"));
    }
    const generated = getRunFloor({ runSeed, floor });
    const bossExitPolicy = applyBossExitPolicy(
      generated,
      floor,
      scenario.bossExitPolicy || "shortcut-0"
    );
    const routePlan = createFloorRoutePlan(
      generated,
      floor,
      metrics.bossPolicy,
      bossExitPolicy
    );
    const elitePlan = createEliteRoutePlan(
      generated,
      floor,
      runSeed,
      state.simPolicy.elitePolicy
    );
    const staticFloorSteps = getFloorStepCount(generated, floor);
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
    if (floor === FLAME_TRAP_MODEL.floor) {
      const entrant = state.party[0];
      metrics.b5FloorActive = true;
      metrics.b5EntrantHp = entrant?.hp ?? null;
      metrics.b5EntrantMaxHp = entrant ? getCharMaxHp(entrant) : null;
      metrics.b5EntrantHpRate = entrant
        ? entrant.hp / Math.max(1, metrics.b5EntrantMaxHp)
        : null;
      recordB5HpSnapshot(state, metrics, 0);
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
      bossExitPolicy: scenario.bossExitPolicy || "shortcut-0",
      floorSteps,
      routeDistance: routePlan.routeDistance,
      bossExitDistance: routePlan.bossExitDistance,
      bossToStairsDistance: routePlan.bossToStairsDistance,
      naturalBossToStairsDistance: routePlan.naturalBossToStairsDistance,
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
      if (step <= staticFloorSteps) {
        metrics.floorBudgetSteps++;
      } else if (step <= routePlan.floorSteps) {
        metrics.routePolicyExtraSteps++;
      } else {
        metrics.eliteExtraSteps++;
      }
      state.currentRun.steps++;
      state.currentRun.floorSteps[String(floor)] =
        (state.currentRun.floorSteps[String(floor)] || 0) + 1;
      tickExplorationSpellEffects(state);
      if (SIM_EXPLORE_SPELLS_ENABLED) maybeCastExplorationSpells(state, metrics);
      metrics.lightActiveSteps += Number(state.lightTurns > 0);
      metrics.masfealActiveSteps += Number(state.repelTurns > 0);
      recordB5HpSnapshot(state, metrics, step);
      if (step % 2 === 0) {
        observeSneakStepPerception({
          state,
          observations: metrics.coreObservations,
          elite: elitePlan.elite,
          routePath: routePlan.path,
          grid: generated.grid,
          floorSteps,
          step
        });
      }

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

      const flameTrapTriggered = resolveFlameTrapAtStep({
        state,
        generated,
        routePlan,
        floorSteps,
        step,
        metrics
      });
      if (!isAlive(state.party[0])) {
        metrics.deathEncounterType = "flame-trap";
        return finishRun(state, "death", metrics);
      }
      if (flameTrapTriggered) continue stepLoop;

      const pickedUpChests = chestSchedule.get(step) || 0;
      for (let chest = 0; chest < pickedUpChests; chest++) {
        metrics.chestsOpened++;
        metrics.chestsOpenedByFloor[floor]++;
        const tombRaider = getCharCoreParams(state.party[0], "CORE_TOMB_RAIDER");
        const chestMaterials = generateChestMaterials(
          floor,
          Math.random,
          tombRaider?.materialBonus || 0,
          {
            materialPoolProfile: state.simPolicy.materialDropOverride?.chestMaterialProfile
          }
        );
        if (tombRaider) {
          metrics.coreObservations.coreOpportunityCounts.CORE_TOMB_RAIDER++;
          metrics.coreObservations.tombRaiderMaterialBonusTotal +=
            tombRaider.materialBonus || 0;
          if (totalMaterials(chestMaterials) > 0) {
            metrics.coreObservations.coreActivationCounts.CORE_TOMB_RAIDER++;
          }
        }
        addMaterials(state.currentRun.materials, chestMaterials);
        addMaterials(metrics.materialSourceCounts.chest, chestMaterials);
        metrics.materialSources.chest += totalMaterials(chestMaterials);
        recordMaterialPickup(metrics, chestMaterials);
        const chestItems = rollChestItems(
          state,
          floor,
          Math.random,
          metrics.coreObservations,
          scenario,
          supplyOverride,
          metrics,
          {
            // 次の階の宝箱はまだ生成していないため、機会費用へ数字を
            // 作らず、現在 floor で既知の次 chest だけを見る。
            futureChestCount: Math.max(0, pickedUpChests - chest - 1)
          }
        );
        chestItems.items = applyEquipmentPostGenerationTransforms(chestItems.items, state);
        const cureCountsBeforeChest = countInventoryItems(state.inventory);
        const acquiredEquipment = [];
        recordEquipmentGenerations(metrics, chestItems.items);
        chestItems.items.forEach((item, itemIndex) => {
          if (
            chestItems.mainItemLost &&
            itemIndex === 0 &&
            item === chestItems.mainItem
          ) return;
          if (item === "TOWN_PORTAL" && scenario.discardChestTownPortal) return;
          const isExtraHealPotion = chestItems.extraHealPotion &&
            itemIndex === chestItems.items.length - 1;
          const isReplacementHealPotion = Boolean(chestItems.replacedMainItem) &&
            itemIndex === 0;
          if (item === "HEAL_POTION" || item === "GREATER_HEAL") {
            recordRecoveryPotionOffer(metrics, "chest", item);
            if (
              item === "HEAL_POTION" &&
              !shouldGrantNormalizedHealPotion(state)
            ) return;
          }
          if (!tryAddInventoryItem(state, item, metrics, "chest")) return;
          if (item === "HEAL_POTION") {
            recordHealPotionAcquisition(
              state,
              metrics,
              isExtraHealPotion || isReplacementHealPotion ? "chest-extra" : "chest"
            );
          }
          if (item === "GREATER_HEAL") {
            recordGreaterHealAcquisition(state, metrics, "chest");
          }
          if (item === "TRAP_KIT") {
            recordTrapKitAcquisition(state, metrics, "chest");
          }
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
        scheduledSpecials.length === 0 &&
        (!state.repelTurns || state.repelTurns <= 0) &&
        Math.random() < getEncounterChance(step, state);
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
          if (combatResult.result === "victory") {
            const hpGrowthBonus = Number(state.simPolicy.hpGrowthBonus) || 0;
            const levelsGained = Math.max(0, state.party[0].level - levelBeforeCombat);
            if (hpGrowthBonus !== 0 && levelsGained > 0) {
              state.party[0].maxHp += hpGrowthBonus * levelsGained;
              state.party[0].hp += hpGrowthBonus * levelsGained;
            }
          }
          metrics.combatRounds += combatResult.rounds;
          metrics.healPotionsUsed += combatResult.healPotionsUsed;
          metrics.greaterHealPotionsUsed += combatResult.greaterHealPotionsUsed;
          metrics.combatHealPotionsUsed += combatResult.healPotionsUsed;
          metrics.combatGreaterHealPotionsUsed += combatResult.greaterHealPotionsUsed;
          metrics.combatRecoveryPotionsUsed +=
            combatResult.healPotionsUsed + combatResult.greaterHealPotionsUsed;
          metrics.recoveryPotionsUsed +=
            combatResult.healPotionsUsed + combatResult.greaterHealPotionsUsed;
          const bountyHunter = getCharCoreParams(
            state.party[0],
            "CORE_BOUNTY_HUNTER"
          );
          if (bountyHunter) {
            const hasRoleTarget = state.combatState.monsters.some(monster =>
              !monster.fled && !monster.hasSplit && state.currentRun.quests?.some(quest =>
                quest.type === "role_kill" && quest.role === monster.role
              )
            );
            metrics.coreObservations.coreOpportunityCounts.CORE_BOUNTY_HUNTER +=
              Number(hasRoleTarget);
          }
          metrics.combatDamageHp += combatResult.telemetry.incomingDamage;
          metrics.incomingHits += combatResult.telemetry.incomingHits;
          metrics.incomingHitTurns += combatResult.telemetry.incomingHitTurns;
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
              telemetry: combatResult.telemetry,
              bloodWandObservations: combatResult.bloodWandObservations
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
            applyPostCombatRecovery(state, metrics);
            const fleeRecoveryItem = useHealPotionIfNeeded(state, metrics);
            addRecoveryPotionUse(metrics, fleeRecoveryItem);
            useStatusCureIfNeeded(state, metrics, "post-flee");
            useManaPotionIfNeeded(state, metrics);
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
              return finishRun(state, "retreat", metrics, "town-portal");
            }
            if (specialEvent && !isElite) {
              // 逃走ではeventセルが消えない。1マス後退後、同じセルへ再侵入する。
              // 同じstep内で再侵入すると、シミュレーション上は後退が起きず
              // 無限に同じeventを試行する。次の探索stepへ進める。
              continue stepLoop;
            }
            continue stepLoop;
          }

          if (combatResult.result !== "victory") {
            metrics.stalemate = combatResult.result === "stalemate";
            metrics.mpBlockedTerminalEncounter = combatResult.mpBlockedEvents > 0;
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
          if (getCharCoreParams(state.party[0], "CORE_SCHOLAR_EYE")) {
            // src/combat_logic/rewards.jsは対象が1体以上いる戦闘につき発動ログを1件出す。
            // 分母もモンスター数ではなく、同じ戦闘単位に揃える。
            const scholarOpportunity = state.combatState.monsters.some(monster =>
            !monster.fled && !monster.hasSplit && monster.simWasUncatalogued
          );
            const scholarActivation = Number(scholarOpportunity);
            metrics.coreObservations.coreOpportunityCounts.CORE_SCHOLAR_EYE +=
              scholarActivation;
            // applyCombatRewardsのguaranteed=true経路を通った対象戦闘なので、実発動も同じ件数。
            metrics.coreObservations.coreActivationCounts.CORE_SCHOLAR_EYE +=
              scholarActivation;
          }
          state.combatState.monsters.forEach(monster => {
            if (monster.fled || monster.hasSplit) return;
            if (monster.role === "disruptor") metrics.coreObservations.disruptorKills++;
            if (monster.role === "amplifier") metrics.coreObservations.amplifierKills++;
          });
          const enemyHealPotionDropChance = state.simPolicy.enemyHealPotionDropChance;
          if (
            enemyHealPotionDropChance !== null &&
            enemyHealPotionDropChance > 0 &&
            state.combatState.monsters.some(monster => !monster.fled && !monster.hasSplit) &&
            Math.random() < enemyHealPotionDropChance
          ) {
            metrics.enemyHealPotionExtraGenerated++;
            recordRecoveryPotionOffer(metrics, "combat", "HEAL_POTION");
            if (
              shouldGrantNormalizedHealPotion(state) &&
              tryAddInventoryItem(state, "HEAL_POTION", metrics, "combat")
            ) {
              recordHealPotionAcquisition(state, metrics, "combat-extra");
            }
          }
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
          addMaterials(metrics.materialSourceCounts.combat, transformedDrops);
          recordMaterialPickup(metrics, transformedDrops);
          metrics.materialSources.quest += totalMaterials(questRewards);
          addMaterials(metrics.materialSourceCounts.quest, questRewards);
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
          if (extraCombatEquipment) {
            if (tryAddInventoryItem(state, extraCombatEquipment, metrics, "combat")) {
              overriddenCombatEquipment.push(extraCombatEquipment);
            }
          }
          const ceilingCombatEquipment = applyEquipmentPostGenerationTransforms(
            overriddenCombatEquipment,
            state
          );
          state.currentRun.equipmentFound.splice(
            equipmentFoundBeforeRewards,
            state.currentRun.equipmentFound.length - equipmentFoundBeforeRewards,
            ...ceilingCombatEquipment
          );
          recordEquipmentGenerations(metrics, ceilingCombatEquipment);
          recordEquipmentAcquisitions(
            metrics,
            ceilingCombatEquipment,
            floor,
            "combat"
          );
          recordEquipmentUpgrades(
            metrics,
            equipGreedyUpgrades(state, metrics, scoringProfile),
            floor
          );
          applyPostCombatRecovery(state, metrics);
          const combatRecoveryItem = useHealPotionIfNeeded(state, metrics);
          addRecoveryPotionUse(metrics, combatRecoveryItem);
          useStatusCureIfNeeded(state, metrics, "post-combat");
          useManaPotionIfNeeded(state, metrics);
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
            return finishRun(state, "retreat", metrics, "town-portal");
          }
          break;
        }
      }
    }

    if (floorEndedByPitfall) {
      if (floor === FLAME_TRAP_MODEL.floor) {
        recordB5HpSnapshot(state, metrics, floorSteps);
        metrics.b5FloorActive = false;
      }
      continue;
    }

    if (floor === FLAME_TRAP_MODEL.floor) {
      recordB5HpSnapshot(state, metrics, floorSteps);
      metrics.b5FloorActive = false;
    }
    applySimulatedCampRest(state, metrics.coreObservations, metrics);
    maybePurchaseMerchantWing(state, scenario, metrics);
    maybePurchaseMerchantStatusCures(state, metrics);
    maybePurchaseMerchantHealPotion(state, metrics);
    maybePurchaseMerchantStrengthPotion(state, scenario, metrics);
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
        return finishRun(state, "retreat", metrics, "milestone-retreat");
      }
    }
    descendToNextFloor(state, floor + 1, metrics, { stairsHeal: true });
    if (useTownPortalIfNeeded(state, scenario, metrics, "floor-transition")) {
      return finishRun(state, "retreat", metrics, "town-portal");
    }
  }

  return finishRun(state, "retreat", metrics, "target-depth");
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

const CORE_NON_EQUIPMENT_REASON_LABELS = Object.freeze({
  powder: "粉不足で未鑑定保持",
  score: "期待戦闘スコア不足",
  curseLock: "呪いロック",
  replacement: "後続装備に置換",
  other: "その他（職業制限等）"
});

function getCoreNonEquipmentReasonKey(result, coreId) {
  if (result.coreEverEquippedIds.includes(coreId)) return "replacement";
  const reasons = new Set(result.coreDecisionReasons[coreId] || []);
  if (
    reasons.has("current-curse-locked") ||
    result.coreBlockedByCurseLockIds.includes(coreId)
  ) return "curseLock";
  if (reasons.has("unidentified-held")) return "powder";
  if (
    reasons.has("combat-score-not-higher") ||
    reasons.has("economy-below-95pct") ||
    reasons.has("economy-ev-not-higher") ||
    reasons.has("economy-core-retained") ||
    reasons.has("score-not-higher")
  ) return "score";
  return "other";
}

function simulateCase({
  startFloor,
  targetDepth,
  label,
  seriesId,
  scoringProfile,
  scenario,
  identificationPolicy = "powder"
}) {
  const totals = {
    survived: 0,
    died: 0,
    carriedMaterials: 0,
    bankedMaterials: 0,
    materialAcquired: 0,
    materialAcquiredBySource: {
      combat: 0,
      chest: 0,
      quest: 0
    },
    materialConsumed: 0,
    timeCost: 0,
    campRestCount: 0,
    reachedFloor: 0,
    entrantsByFloor: Array(21).fill(0),
    breakthroughsByFloor: Array(21).fill(0),
    deathsByFloor: Array(21).fill(0),
    retreatsByFloor: Array(21).fill(0),
    meanStats: createMeanStats([
      "bankedMaterials",
      "materialAcquired",
      "materialConsumed",
      "timeCost",
      "materialEvPerTime",
      "reachedFloor",
      "identificationPowderAcquired",
      "identificationPowderUsed",
      "identificationPowderRemaining"
    ]),
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
      departureCraft: 0,
      chest: 0,
      codex: 0,
      merchant: 0
    },
    identificationPowderUsed: 0,
    identificationPowderRemaining: 0,
    identificationPowderUnlimited: false,
    runsWithPowderDepleted: 0,
    identificationCount: 0,
    unidentifiedWearCount: 0,
    curseHitCount: 0,
    curseGeneration: createCurseGenerationCounts(),
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
    coreCurseLockedRetentionRunsById: {},
    coreBlockedByCurseLockRunsById: {},
    coreCurseAvoidedRunsById: {},
    coreUnselectedWithoutCurseLockRunsById: {},
    coreNonEquipmentReasonTotals: Object.fromEntries(
      Object.keys(CORE_NON_EQUIPMENT_REASON_LABELS).map(reason => [reason, 0])
    ),
    coreNonEquipmentReasonCountsByGroup: Object.fromEntries(
      ["combat", "economy"].map(poolGroup => [
        poolGroup,
        Object.fromEntries(
          Object.keys(CORE_NON_EQUIPMENT_REASON_LABELS).map(reason => [reason, 0])
        )
      ])
    ),
    coreNonEquipmentReasonCountsById: {},
    coreEquippedCountDistribution: {},
    unequippedCoreReasonsById: {},
    firstCoreDepthCounts: {},
    coreObservations: createCoreObservations(),
    spellUsage: createSpellUsageMetrics(),
    explorationSpellUsage: createExplorationSpellUsageMetrics(),
    mpPressure: createSpellPressureMetrics(),
    mpBlockedTerminalEncounterRuns: 0,
    mpDepletionCausedEndRuns: 0,
    lightActiveSteps: 0,
    masfealActiveSteps: 0,
    purifyEffectsByClass: Object.fromEntries(
      SIM_CLASSES.map(className => [className, {
        runs: 0,
        runsWithCore: 0,
        tagKills: 0,
        potentialMpRecovered: 0,
        potentialHpRecovered: 0,
        actualMpRecovered: 0,
        actualHpRecovered: 0,
        actualEffectEvents: 0
      }])
    ),
    coreRetentionByClass: Object.fromEntries(
      SIM_CLASSES.map(className => [className, {
        encounteredById: {},
        equippedById: {}
      }])
    ),
    workshopEffectsByClass: Object.fromEntries(
      SIM_CLASSES.map(className => [className, {
        runs: 0,
        stats: {},
        startingGearCandidates: {},
        startingGearApplied: {},
        startingGearAttackDelta: 0
      }])
    ),
    healPotionsUsed: 0,
    trap: createTrapAggregate(),
    flameTrap: createFlameTrapAggregate(),
    b5Gate: createB5GateAggregate(),
    outcomesByClass: Object.fromEntries(
      SIM_CLASSES.map(className => [className, createOutcomeAggregate()])
    ),
    trapBonus: createTrapBonusAggregate(),
    townPortalsUsed: 0,
    runsUsingTownPortal: 0,
    portalAcquisitions: {},
    portalUsesBySource: {},
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
  const classFlameTrapTotals = Object.fromEntries(
    SIM_CLASSES.map(className => [className, createFlameTrapAggregate()])
  );
  const classB5GateTotals = Object.fromEntries(
    SIM_CLASSES.map(className => [className, createB5GateAggregate()])
  );
  const classTrapBonusTotals = Object.fromEntries(
    SIM_CLASSES.map(className => [className, createTrapBonusAggregate()])
  );
  const classMpPressureTotals = Object.fromEntries(
    SIM_CLASSES.map(className => [className, createSpellPressureMetrics()])
  );
  const departureCraftBanksByClass = Object.fromEntries(
    SIM_CLASSES.map(className => [className, {}])
  );

  for (let runIndex = 0; runIndex < RUNS_PER_CASE; runIndex++) {
    const className = SIM_CLASSES[runIndex % SIM_CLASSES.length];
    const runScenario = scenario.departureCraftMeasurement
      ? {
          ...scenario,
          departureCraftMaterialsAreActualBank: true,
          departureCraftMaterials: { ...departureCraftBanksByClass[className] }
        }
      : scenario;
    const result = simulateRun({
      className,
      startFloor,
      targetDepth,
      runIndex,
      seriesId,
      scoringProfile,
      scenario: {
        ...runScenario,
        identificationPolicy: identificationPolicy.id || identificationPolicy
      },
      workshop: scenario.workshop || { ranks: {} }
    });
    if (scenario.departureCraftMeasurement) {
      departureCraftBanksByClass[className] = { ...result.metaMaterials };
    }
    addSpellUsageAggregate(totals.spellUsage, result);
    addExplorationSpellUsageAggregate(totals.explorationSpellUsage, result);
    addSpellPressureMetrics(totals.mpPressure, result.mpPressure);
    addSpellPressureMetrics(classMpPressureTotals[className], result.mpPressure);
    totals.mpBlockedTerminalEncounterRuns += Number(result.mpBlockedTerminalEncounter);
    totals.mpDepletionCausedEndRuns += Number(result.mpDepletionCausedEnd);
    totals.lightActiveSteps += result.lightActiveSteps;
    totals.masfealActiveSteps += result.masfealActiveSteps;
    addOutcomeAggregate(totals.outcomesByClass[className], result);
    addFlameTrapAggregate(totals.flameTrap, result);
    addFlameTrapAggregate(classFlameTrapTotals[className], result);
    addB5GateAggregate(totals.b5Gate, result);
    addB5GateAggregate(classB5GateTotals[className], result);
    const workshopEffects = totals.workshopEffectsByClass[className];
    workshopEffects.runs++;
    Object.entries(result.workshopEffects.stats).forEach(([stat, amount]) => {
      workshopEffects.stats[stat] = (workshopEffects.stats[stat] || 0) + amount;
    });
    result.workshopEffects.startingGearCandidates.forEach(itemId => {
      workshopEffects.startingGearCandidates[itemId] =
        (workshopEffects.startingGearCandidates[itemId] || 0) + 1;
    });
    if (result.workshopEffects.startingGearApplied) {
      const itemId = result.workshopEffects.startingGearApplied;
      workshopEffects.startingGearApplied[itemId] =
        (workshopEffects.startingGearApplied[itemId] || 0) + 1;
    }
    workshopEffects.startingGearAttackDelta += result.workshopEffects.startingGearAttackDelta;
    addTrapAggregate(totals.trap, result);
    addTrapAggregate(classTrapTotals[className], result);
    addTrapBonusAggregate(totals.trapBonus, result);
    addTrapBonusAggregate(classTrapBonusTotals[className], result);
    totals.survived += Number(result.survived);
    totals.died += Number(result.died);
    totals.carriedMaterials += result.carriedMaterials;
    totals.bankedMaterials += result.bankedMaterials;
    totals.materialAcquired += result.materialAcquired;
    Object.entries(result.materialAcquiredBySource).forEach(([source, amount]) => {
      totals.materialAcquiredBySource[source] =
        (totals.materialAcquiredBySource[source] || 0) + amount;
    });
    totals.materialConsumed += result.materialConsumed;
    totals.timeCost += result.timeCost;
    totals.campRestCount += result.campRestCount;
    totals.reachedFloor += result.reachedFloor;
    addMeanSample(totals.meanStats.bankedMaterials, result.bankedMaterials);
    addMeanSample(totals.meanStats.materialAcquired, result.materialAcquired);
    addMeanSample(totals.meanStats.materialConsumed, result.materialConsumed);
    addMeanSample(totals.meanStats.timeCost, result.timeCost);
    addMeanSample(
      totals.meanStats.materialEvPerTime,
      result.timeCost > 0 ? result.bankedMaterials / result.timeCost : 0
    );
    addMeanSample(totals.meanStats.reachedFloor, result.reachedFloor);
    for (let floor = 1; floor < totals.entrantsByFloor.length; floor++) {
      if (result.reachedFloor < floor) continue;
      totals.entrantsByFloor[floor]++;
      if (result.reachedFloor > floor) totals.breakthroughsByFloor[floor]++;
      if (result.deathFloor === floor) totals.deathsByFloor[floor]++;
    }
    if (result.survived && Number.isInteger(result.endFloor)) {
      totals.retreatsByFloor[result.endFloor]++;
    }
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
    totals.identificationPowderRemaining += result.identificationPowderRemaining;
    totals.identificationPowderUnlimited ||= result.identificationPowderUnlimited;
    totals.runsWithPowderDepleted += Number(result.identificationPowderDepleted);
    addMeanSample(
      totals.meanStats.identificationPowderAcquired,
      result.identificationPowderAcquired
    );
    addMeanSample(totals.meanStats.identificationPowderUsed, result.identificationPowderUsed);
    addMeanSample(
      totals.meanStats.identificationPowderRemaining,
      result.identificationPowderRemaining
    );
    totals.identificationCount += result.identificationCount;
    totals.unidentifiedWearCount += result.unidentifiedWearCount;
    totals.curseHitCount += result.curseHitCount;
    Object.entries(result.curseGeneration).forEach(([group, counts]) => {
      totals.curseGeneration[group].generated += counts.generated;
      totals.curseGeneration[group].cursed += counts.cursed;
    });
    totals.coreEquipmentFound += result.coreEquipmentFound;
    totals.runsWithCoreEncounter += Number(result.firstCoreDepth !== null);
    totals.runsWithEarlyCoreEncounter += Number(
      result.firstCoreDepth !== null && result.firstCoreDepth <= EARLY_BUILD_MAX_FLOOR
    );
    const finalCoreIds = Array.isArray(result.finalCoreIds)
      ? result.finalCoreIds
      : (result.finalCoreId ? [result.finalCoreId] : []);
    const finalCoreCount = finalCoreIds.length;
    totals.coreEquippedCountDistribution[finalCoreCount] =
      (totals.coreEquippedCountDistribution[finalCoreCount] || 0) + 1;
    totals.runsWithCoreEquipped += Number(finalCoreCount > 0);
    const encounteredCombat = result.coreEncounteredIds.some(id => COMBAT_CORE_IDS.has(id));
    const encounteredEconomy = result.coreEncounteredIds.some(id => ECONOMY_CORE_IDS.has(id));
    totals.runsWithCombatCoreEncounter += Number(encounteredCombat);
    totals.runsWithEconomyCoreEncounter += Number(encounteredEconomy);
    totals.runsWithCombatCoreEquipped += Number(
      finalCoreIds.some(coreId => COMBAT_CORE_IDS.has(coreId))
    );
    totals.runsWithEconomyCoreEquipped += Number(
      finalCoreIds.some(coreId => ECONOMY_CORE_IDS.has(coreId))
    );
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
      const isFinalCore = finalCoreIds.includes(coreId);
      const reason = isFinalCore ? null : getUnequippedCoreReason(result, coreId);
      const reasonKey = isFinalCore ? null : getCoreNonEquipmentReasonKey(result, coreId);
      if (result.finalCoreCurseLockedIds.includes(coreId)) {
        totals.coreCurseLockedRetentionRunsById[coreId] =
          (totals.coreCurseLockedRetentionRunsById[coreId] || 0) + 1;
      } else if (result.coreBlockedByCurseLockIds.includes(coreId)) {
        totals.coreBlockedByCurseLockRunsById[coreId] =
          (totals.coreBlockedByCurseLockRunsById[coreId] || 0) + 1;
      } else if (!isFinalCore) {
        if (reasonKey === "powder") {
          totals.coreCurseAvoidedRunsById[coreId] =
            (totals.coreCurseAvoidedRunsById[coreId] || 0) + 1;
        } else {
          totals.coreUnselectedWithoutCurseLockRunsById[coreId] =
            (totals.coreUnselectedWithoutCurseLockRunsById[coreId] || 0) + 1;
        }
      }
      if (isFinalCore) return;
      totals.coreNonEquipmentReasonTotals[reasonKey]++;
      const poolGroup = CORE_AFFIX_BY_ID.get(coreId)?.poolGroup;
      if (poolGroup && totals.coreNonEquipmentReasonCountsByGroup[poolGroup]) {
        totals.coreNonEquipmentReasonCountsByGroup[poolGroup][reasonKey]++;
      }
      if (!totals.coreNonEquipmentReasonCountsById[coreId]) {
        totals.coreNonEquipmentReasonCountsById[coreId] = Object.fromEntries(
          Object.keys(CORE_NON_EQUIPMENT_REASON_LABELS).map(key => [key, 0])
        );
      }
      totals.coreNonEquipmentReasonCountsById[coreId][reasonKey]++;
      if (!totals.unequippedCoreReasonsById[coreId]) {
        totals.unequippedCoreReasonsById[coreId] = {};
      }
      totals.unequippedCoreReasonsById[coreId][reason] =
        (totals.unequippedCoreReasonsById[coreId][reason] || 0) + 1;
    });
    finalCoreIds.forEach(coreId => {
      totals.coreEquippedRunsById[coreId] =
        (totals.coreEquippedRunsById[coreId] || 0) + 1;
    });
    addCoreObservations(totals.coreObservations, result.coreObservations);
    const purifyEffects = totals.purifyEffectsByClass[className];
    purifyEffects.runs++;
    purifyEffects.runsWithCore += Number(
      result.coreEverEquippedIds.includes("CORE_PURIFY_RING")
    );
    purifyEffects.tagKills += result.coreObservations.purifyTagKills;
    purifyEffects.potentialMpRecovered += result.coreObservations.purifyPotentialMpRecovered;
    purifyEffects.potentialHpRecovered += result.coreObservations.purifyPotentialHpRecovered;
    purifyEffects.actualMpRecovered += result.coreObservations.purifyMpRecovered;
    purifyEffects.actualHpRecovered += result.coreObservations.purifyHpRecovered;
    purifyEffects.actualEffectEvents += result.coreObservations.purifyEffectEvents;
    const classCoreTotals = totals.coreRetentionByClass[className];
    result.coreEncounteredIds.forEach(coreId => {
      classCoreTotals.encounteredById[coreId] =
        (classCoreTotals.encounteredById[coreId] || 0) + 1;
    });
    finalCoreIds.forEach(coreId => {
      classCoreTotals.equippedById[coreId] =
        (classCoreTotals.equippedById[coreId] || 0) + 1;
    });
    const firstCoreDepthKey = result.firstCoreDepth === null ? "none" : String(result.firstCoreDepth);
    totals.firstCoreDepthCounts[firstCoreDepthKey] =
      (totals.firstCoreDepthCounts[firstCoreDepthKey] || 0) + 1;
    totals.healPotionsUsed += result.healPotionsUsed;
    totals.townPortalsUsed += result.townPortalsUsed;
    totals.runsUsingTownPortal += Number(result.townPortalsUsed > 0);
    Object.entries(result.portalAcquisitions).forEach(([source, amount]) => {
      totals.portalAcquisitions[source] =
        (totals.portalAcquisitions[source] || 0) + amount;
    });
    Object.entries(result.portalUsesBySource).forEach(([source, amount]) => {
      totals.portalUsesBySource[source] =
        (totals.portalUsesBySource[source] || 0) + amount;
    });
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
  const trapPolicies = resolveTrapPolicies(scenario);
  const trapSummary = finalizeTrapAggregate(totals.trap);
  const consumablesByClass = Object.fromEntries(
    Object.entries(classTrapTotals).map(([className, aggregate]) => [
      className,
      buildConsumableClassSummary(finalizeTrapAggregate(aggregate))
    ])
  );
  return {
    label,
    startFloor,
    targetDepth,
    workshop: scenario.workshop || { ranks: {} },
    trapPolicy: trapPolicies.floor,
    chestTrapPolicy: trapPolicies.chest,
    trapAvoidancePolicy: scenario.trapAvoidancePolicy || DEFAULT_TRAP_AVOIDANCE_POLICY_ID,
    survivalRate: totals.survived / RUNS_PER_CASE,
    deathRate: totals.died / RUNS_PER_CASE,
    survivedRuns: totals.survived,
    diedRuns: totals.died,
    townPortalUseRate: totals.runsUsingTownPortal / RUNS_PER_CASE,
    townPortalUseRuns: totals.runsUsingTownPortal,
    bankRetentionRate: totals.carriedMaterials > 0
      ? totals.bankedMaterials / totals.carriedMaterials
      : 1,
    bankedMaterialEv,
    averageMaterialAcquired: totals.materialAcquired / RUNS_PER_CASE,
    averageMaterialAcquiredBySource: Object.fromEntries(
      Object.entries(totals.materialAcquiredBySource).map(([source, amount]) => [
        source,
        amount / RUNS_PER_CASE
      ])
    ),
    averageMaterialConsumed: totals.materialConsumed / RUNS_PER_CASE,
    averageTimeCost,
    materialEvPerTime: bankedMaterialEv / averageTimeCost,
    averageReachedFloor: totals.reachedFloor / RUNS_PER_CASE,
    averageCampRestCount: totals.campRestCount / RUNS_PER_CASE,
    mean95CI: {
      bankedMaterialEv: meanInterval(totals.meanStats.bankedMaterials, RUNS_PER_CASE),
      materialAcquired: meanInterval(totals.meanStats.materialAcquired, RUNS_PER_CASE),
      materialConsumed: meanInterval(totals.meanStats.materialConsumed, RUNS_PER_CASE),
      timeCost: meanInterval(totals.meanStats.timeCost, RUNS_PER_CASE),
      materialEvPerTime: meanInterval(totals.meanStats.materialEvPerTime, RUNS_PER_CASE, 4),
      reachedFloor: meanInterval(totals.meanStats.reachedFloor, RUNS_PER_CASE),
      identificationPowderAcquired: meanInterval(
        totals.meanStats.identificationPowderAcquired,
        RUNS_PER_CASE
      ),
      identificationPowderUsed: meanInterval(
        totals.meanStats.identificationPowderUsed,
        RUNS_PER_CASE
      ),
      identificationPowderRemaining: meanInterval(
        totals.meanStats.identificationPowderRemaining,
        RUNS_PER_CASE
      )
    },
    entrantsByFloor: [...totals.entrantsByFloor],
    breakthroughsByFloor: [...totals.breakthroughsByFloor],
    deathsByFloor: [...totals.deathsByFloor],
    retreatsByFloor: [...totals.retreatsByFloor],
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
    averageIdentificationPowderRemaining:
      totals.identificationPowderRemaining / RUNS_PER_CASE,
    identificationPowderUnlimited: totals.identificationPowderUnlimited,
    identificationPowderDepletionRate:
      totals.runsWithPowderDepleted / RUNS_PER_CASE,
    averageIdentificationCount: totals.identificationCount / RUNS_PER_CASE,
    averageUnidentifiedWearCount: totals.unidentifiedWearCount / RUNS_PER_CASE,
    averageCurseHitCount: totals.curseHitCount / RUNS_PER_CASE,
    curseGeneration: {
      core: { ...totals.curseGeneration.core },
      nonCore: { ...totals.curseGeneration.nonCore }
    },
    coreEquipmentShare: totals.equipmentFound > 0
      ? totals.coreEquipmentFound / totals.equipmentFound
      : 0,
    coreEquipmentFound: totals.coreEquipmentFound,
    equipmentFound: totals.equipmentFound,
    coreEncounterRuns: totals.runsWithCoreEncounter,
    coreEquippedRuns: totals.runsWithCoreEquipped,
    combatCoreEncounterRuns: totals.runsWithCombatCoreEncounter,
    combatCoreEquippedRuns: totals.runsWithCombatCoreEquipped,
    economyCoreEncounterRuns: totals.runsWithEconomyCoreEncounter,
    economyCoreEquippedRuns: totals.runsWithEconomyCoreEquipped,
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
    coreCurseLockedRetentionRunsById: totals.coreCurseLockedRetentionRunsById,
    coreBlockedByCurseLockRunsById: totals.coreBlockedByCurseLockRunsById,
    coreCurseAvoidedRunsById: totals.coreCurseAvoidedRunsById,
    coreUnselectedWithoutCurseLockRunsById: totals.coreUnselectedWithoutCurseLockRunsById,
    coreNonEquipmentReasonTotals: { ...totals.coreNonEquipmentReasonTotals },
    coreNonEquipmentReasonCountsByGroup: Object.fromEntries(
      Object.entries(totals.coreNonEquipmentReasonCountsByGroup)
        .map(([poolGroup, counts]) => [poolGroup, { ...counts }])
    ),
    coreNonEquipmentReasonCountsById: Object.fromEntries(
      Object.entries(totals.coreNonEquipmentReasonCountsById)
        .map(([coreId, counts]) => [coreId, { ...counts }])
    ),
    coreEquippedCountDistribution: totals.coreEquippedCountDistribution,
    unequippedCoreReasonsById: totals.unequippedCoreReasonsById,
    purifyEffectsByClass: Object.fromEntries(
      Object.entries(totals.purifyEffectsByClass).map(([className, values]) => {
        const runs = Math.max(1, values.runs);
        const coreRuns = Math.max(1, values.runsWithCore);
        return [className, {
          runsWithCore: values.runsWithCore,
          averageTagKills: values.tagKills / runs,
          averagePotentialMpRecovered: values.potentialMpRecovered / runs,
          averagePotentialHpRecovered: values.potentialHpRecovered / runs,
          averageActualMpRecovered: values.actualMpRecovered / runs,
          averageActualHpRecovered: values.actualHpRecovered / runs,
          averageActualEffectEvents: values.actualEffectEvents / runs,
          averageActualMpPerCoreRun: values.actualMpRecovered / coreRuns,
          averageActualHpPerCoreRun: values.actualHpRecovered / coreRuns
        }];
      })
    ),
    coreRetentionByClass: Object.fromEntries(
      Object.entries(totals.coreRetentionByClass).map(([className, values]) => [
        className,
        Object.fromEntries(ENABLED_CORE_AFFIXES.map(affix => {
          const encountered = values.encounteredById[affix.id] || 0;
          const equipped = values.equippedById[affix.id] || 0;
          return [affix.id, {
            encountered,
            equipped,
            retentionRate: encountered > 0 ? equipped / encountered : 0
          }];
        }))
      ])
    ),
    workshopEffectsByClass: Object.fromEntries(
      Object.entries(totals.workshopEffectsByClass).map(([className, values]) => {
        const runs = Math.max(1, values.runs);
        return [className, {
          stats: Object.fromEntries(
            Object.entries(values.stats).map(([stat, amount]) => [stat, amount / runs])
          ),
          startingGearCandidates: Object.fromEntries(
            Object.entries(values.startingGearCandidates)
              .map(([itemId, count]) => [itemId, count / runs])
          ),
          startingGearApplied: Object.fromEntries(
            Object.entries(values.startingGearApplied)
              .map(([itemId, count]) => [itemId, count / runs])
          ),
          startingGearAppliedRate: Object.values(values.startingGearApplied)
            .reduce((sum, count) => sum + count, 0) / runs,
          averageStartingGearAttackDelta: values.startingGearAttackDelta / runs
        }];
      })
    ),
    coreObservations: totals.coreObservations,
    spellUsage: Object.fromEntries(
      Object.entries(totals.spellUsage).map(([spellName, usage]) => [
        spellName,
        { ...usage }
      ])
    ),
    explorationSpellUsage: { ...totals.explorationSpellUsage },
    mpPressure: finalizeSpellPressureMetrics(totals.mpPressure),
    mpPressureByClass: Object.fromEntries(
      Object.entries(classMpPressureTotals).map(([className, pressure]) => [
        className,
        finalizeSpellPressureMetrics(pressure)
      ])
    ),
    mpBlockedTerminalEncounterRuns: totals.mpBlockedTerminalEncounterRuns,
    mpDepletionCausedEndRuns: totals.mpDepletionCausedEndRuns,
    lightActiveSteps: totals.lightActiveSteps,
    masfealActiveSteps: totals.masfealActiveSteps,
    averageLightActiveSteps: totals.lightActiveSteps / RUNS_PER_CASE,
    averageMasfealActiveSteps: totals.masfealActiveSteps / RUNS_PER_CASE,
    firstCoreDepthCounts: totals.firstCoreDepthCounts,
    averageHealPotionsUsed: totals.healPotionsUsed / RUNS_PER_CASE,
    ...trapSummary,
    consumablesByClass,
    flameTrap: finalizeFlameTrapAggregate(totals.flameTrap),
    b5Gate: finalizeB5GateAggregate(totals.b5Gate),
    averageFlameTrapActivations: totals.flameTrap.activations / RUNS_PER_CASE,
    flameTrapByClass: Object.fromEntries(
      Object.entries(classFlameTrapTotals).map(([className, aggregate]) => [
        className,
        finalizeFlameTrapAggregate(aggregate)
      ])
    ),
    b5GateByClass: Object.fromEntries(
      Object.entries(classB5GateTotals).map(([className, aggregate]) => [
        className,
        finalizeB5GateAggregate(aggregate)
      ])
    ),
    outcomesByClass: Object.fromEntries(
      Object.entries(totals.outcomesByClass).map(([className, aggregate]) => [
        className,
        finalizeOutcomeAggregate(aggregate)
      ])
    ),
    trapBonusSupply: finalizeTrapBonusAggregate(totals.trapBonus),
    trapBonusSupplyByClass: Object.fromEntries(
      Object.entries(classTrapBonusTotals).map(([className, aggregate]) => [
        className,
        finalizeTrapBonusAggregate(aggregate)
      ])
    ),
    trapMetricsByClass: Object.fromEntries(
      Object.entries(classTrapTotals).map(([className, aggregate]) => [
        className,
        finalizeTrapAggregate(aggregate)
      ])
    ),
    averageTownPortalsUsed: totals.townPortalsUsed / RUNS_PER_CASE,
    averagePortalAcquisitions: Object.fromEntries(
      Object.entries(totals.portalAcquisitions).map(([source, amount]) => [
        source,
        amount / RUNS_PER_CASE
      ])
    ),
    averagePortalUsesBySource: Object.fromEntries(
      Object.entries(totals.portalUsesBySource).map(([source, amount]) => [
        source,
        amount / RUNS_PER_CASE
      ])
    ),
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

function snapshotDepthResult(result) {
  // workerが後続taskを処理する前に、深度ケースのtop-level所有権を切断する。
  // 再現した汚染はscalar top-level fieldに限られ、nested集計はケース内で生成・複製済み。
  return { ...result };
}

function formatPercent(rate) {
  return `${(rate * 100).toFixed(1)}%`;
}

function formatPowderRemaining(result) {
  return result.identificationPowderUnlimited
    ? "実質無制限"
    : result.averageIdentificationPowderRemaining.toFixed(2);
}

function formatPowderAcquired(result) {
  if (!result.identificationPowderUnlimited) {
    return result.averageIdentificationPowderAcquired.toFixed(2);
  }
  const source = result.averageIdentificationPowderAcquiredBySource;
  const runSources = Object.entries(source)
    .filter(([sourceName]) => sourceName !== "starting")
    .reduce((sum, [, amount]) => sum + amount, 0);
  return `開始=実質無制限+ラン中=${runSources.toFixed(2)}`;
}

function wilsonInterval(successes, trials, z = 1.96) {
  if (trials <= 0) return null;
  const rate = successes / trials;
  const denominator = 1 + (z * z) / trials;
  const center = (rate + (z * z) / (2 * trials)) / denominator;
  const margin = z * Math.sqrt(
    (rate * (1 - rate) + (z * z) / (4 * trials)) / trials
  ) / denominator;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

function formatWilson(successes, trials) {
  if (trials <= 0) return "未観測 [N=0; CIなし]";
  const interval = wilsonInterval(successes, trials);
  const uncertain = trials < 30 ? " 未確定" : "";
  return `${formatPercent(successes / trials)} [${formatPercent(interval[0])},${formatPercent(interval[1])}; N=${trials}]${uncertain}`;
}

function createMeanStats(names) {
  return Object.fromEntries(names.map(name => [name, { sum: 0, sumSquares: 0 }]));
}

function addMeanSample(stats, value) {
  if (!Number.isFinite(value)) return;
  stats.sum += value;
  stats.sumSquares += value * value;
}

function meanInterval(stats, trials, digits = 2) {
  if (trials <= 0) return "未観測";
  const mean = stats.sum / trials;
  if (trials < 2) return `${mean.toFixed(digits)} [未確定; N=${trials}]`;
  const variance = Math.max(
    0,
    (stats.sumSquares - (stats.sum * stats.sum) / trials) / (trials - 1)
  );
  const margin = 1.96 * Math.sqrt(variance / trials);
  return `${mean.toFixed(digits)} [${(mean - margin).toFixed(digits)},` +
    `${(mean + margin).toFixed(digits)}; N=${trials}]`;
}

export function calibrateCoreScoringProfile(
  runCount = RUNS_PER_CASE,
  scenarioOverrides = {},
  identificationPolicy = "powder",
  workshop = { ranks: {} }
) {
  const calibrationScenario = {
    ...getScenarioById("legacy-no-portal"),
    elitePolicy: "avoid",
    ...scenarioOverrides,
    identificationPolicy: identificationPolicy.id || identificationPolicy
  };
  const observations = createCoreObservations();
  const observationsByClass = Object.fromEntries(
    SIM_CLASSES.map(className => [className, createCoreObservations()])
  );
  const runCountsByClass = Object.fromEntries(SIM_CLASSES.map(className => [className, 0]));
  for (let runIndex = 0; runIndex < runCount; runIndex++) {
    const className = SIM_CLASSES[runIndex % SIM_CLASSES.length];
    const result = simulateRun({
      className,
      startFloor: 1,
      targetDepth: 20,
      runIndex,
      seriesId: "core-score-calibration",
      scoringProfile: null,
      scenario: calibrationScenario,
      workshop
    });
    addCoreObservations(observations, result.coreObservations);
    addCoreObservations(observationsByClass[className], result.coreObservations);
    runCountsByClass[className]++;
  }
  const profile = createCoreScoringProfile(observations, runCount);
  profile.byClass = Object.fromEntries(
    SIM_CLASSES.map(className => [
      className,
      createCoreScoringProfile(
        observationsByClass[className],
        runCountsByClass[className]
      )
    ])
  );
  return profile;
}

export function resetSimulationRandom(seed = SIM_SEED) {
  randomState = Number(seed) >>> 0;
}

export function getSimulationRandomState() {
  return randomState;
}

export {
  SCENARIOS,
  DEPTH_SCENARIOS,
  REFERENCE_SCENARIOS,
  SIM_CLASSES,
  IDENTIFICATION_BALANCE
};

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
    `血杖: HP支払い候補 攻撃=${formatPercent(profile.bloodWandSpellOpportunityRate)} ` +
    `→実発動=${formatPercent(profile.bloodWandSpellActivationRate)} ` +
    `(coverage=${formatPercent(profile.bloodWandSpellCoverage)}), ` +
    `DIOS=${formatPercent(profile.bloodWandHealOpportunityRate)} ` +
    `→実発動=${formatPercent(profile.bloodWandHealActivationRate)} ` +
    `(coverage=${formatPercent(profile.bloodWandHealCoverage)}), ` +
    `spell/fight実測damage=${profile.averageSpellDamage.toFixed(2)}/${profile.averageFightDamage.toFixed(2)}, ` +
    `DIOS実測回復=${profile.averageDiosHealing.toFixed(2)}; ` +
    "攻撃score×実発動率×damage差 + maxHP重み×実発動率×回復量"
  );
  console.log(
    `浄化の環: 潜在回復/攻撃turn MP=${profile.purifyMpPerOffensiveTurn.toFixed(4)}, ` +
    `HP振替=${profile.purifyHpPerOffensiveTurn.toFixed(4)}; ` +
    "MPは追加攻撃spell、HPは実回復をmaxHP重みへ換算"
  );
  const funnel = profile.purifyFunnel;
  console.log(
    `  発動ファネル: 撃破${funnel.totalKills} → タグ一致${funnel.tagKills}` +
    `(${formatPercent(funnel.tagKills / Math.max(1, funnel.totalKills))}) → ` +
    `MP空きあり${funnel.tagKillsWithMpRoom}` +
    `(タグ一致の${formatPercent(funnel.tagKillsWithMpRoom / Math.max(1, funnel.tagKills))})。` +
    `MP持ち職の撃破に限ればタグ一致${funnel.tagKillsByCaster}、` +
    `全撃破のうちMP空きは${formatPercent(funnel.killsWithMpRoom / Math.max(1, funnel.totalKills))}、` +
    `タグ一致のうちMP満タンは${formatPercent(funnel.tagKillsWithFullMp / Math.max(1, funnel.tagKills))}`
  );
  console.log(
    `罠喰い: 残り罠解除実績 B1=${profile.expectedTrapDisarmsFromFloor[1].toFixed(3)}, ` +
      `B10=${profile.expectedTrapDisarmsFromFloor[10].toFixed(3)}; ` +
      "min(20, 現floor以降の解除回数×攻撃+2)×weaponAtk重み2"
  );
  if (profile.byClass) {
    console.log("職業別calibration（全coreスコアへ適用）:");
    SIM_CLASSES.forEach(className => {
      const classProfile = profile.byClass[className];
      console.log(
        `  ${className}: 罠解除/run=${classProfile.expectedTrapDisarmsPerRun.toFixed(3)}, ` +
        `罠喰い残り B1=${classProfile.expectedTrapDisarmsFromFloor[1].toFixed(3)}, ` +
        `B10=${classProfile.expectedTrapDisarmsFromFloor[10].toFixed(3)}, ` +
        `低HP攻撃=${formatPercent(classProfile.lowHpOffensiveRate)}, ` +
        `巨人対象=${formatPercent(classProfile.giantTargetRate)}, ` +
        `先制戦闘=${formatPercent(classProfile.openerFirstStrikeRate)}, ` +
        `物理被弾=${formatPercent(classProfile.incomingPhysicalHitRate)}, ` +
        `浄化潜在MP=${classProfile.purifyMpPerOffensiveTurn.toFixed(4)}/turn, ` +
        `HP=${classProfile.purifyHpPerOffensiveTurn.toFixed(4)}/turn`
      );
    });
  }
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
  console.log("血杖: 実generatorのmeta解放対象。工房state別calibrationを使用");
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
  console.log("忍び足: src/systems/elite_perception.jsの実判定を実配置・経路へ適用。移動後の接触結果は未モデル化");
  console.log("慧眼: powderで未鑑定候補をgetEquippedItemData経由で評価。効果EVの独立換算は保留");
}

function printTable(results) {
  console.log("戦略       | 生還率(Wilson) | 死亡率(Wilson) | 翼使用率(Wilson) | bank保持率 | bank素材EV | 平均時間 | 素材EV/時間 | 平均到達階 | 平均Lv | 平均換装 | 平均薬 | 平均逃走 | 逃走run率");
  console.log("-----------|--------------|--------------|----------------|------------|------------|----------|-------------|------------|--------|----------|--------|----------|----------");
  results.forEach(result => {
    console.log(
      `${result.label.padEnd(10)} | ${formatWilson(result.survivedRuns, RUNS_PER_CASE).padStart(18)} | ` +
      `${formatWilson(result.diedRuns, RUNS_PER_CASE).padStart(18)} | ` +
      `${formatWilson(result.townPortalUseRuns, RUNS_PER_CASE).padStart(20)} | ` +
      `${formatPercent(result.bankRetentionRate).padStart(10)} | ${result.bankedMaterialEv.toFixed(2).padStart(10)} | ` +
      `${result.averageTimeCost.toFixed(2).padStart(8)} | ${result.materialEvPerTime.toFixed(4).padStart(11)} | ` +
      `${result.averageReachedFloor.toFixed(2).padStart(10)} | ${result.averageFinalLevel.toFixed(2).padStart(6)} | ` +
      `${result.averageEquipmentUpgrades.toFixed(2).padStart(8)} | ${result.averageHealPotionsUsed.toFixed(2).padStart(6)} | ` +
      `${result.averageFleeCount.toFixed(2).padStart(8)} | ${formatPercent(result.runsWithFleeRate).padStart(8)}`
    );
  });
}

function printClassOutcomeMetrics(result) {
  if (!result?.outcomesByClass) return;
  console.log(`\n【B5F gate 職業別 endpoint / ${result.label}】`);
  console.log(
    "職業 | N | B5 entrant | B5突破 | B5死亡 | B5撤退 | 全run生還率(=撤退率) | 全run死亡率 | 平均到達階"
  );
  Object.entries(result.outcomesByClass).forEach(([className, stats]) => {
    const b5Entrants = stats.entrantsByFloor[5] || 0;
    const b5Breakthroughs = stats.entrantsByFloor[6] || 0;
    const b5Deaths = stats.deathsByFloor[5] || 0;
    const b5Retreats = stats.retreatsByFloor[5] || 0;
    console.log(
      `${className.padEnd(6)} | ${String(stats.runs).padStart(3)} | ` +
      `${formatWilson(b5Entrants, stats.runs)} | ` +
      `${formatWilson(b5Breakthroughs, b5Entrants)} | ` +
      `${formatWilson(b5Deaths, b5Entrants)} | ` +
      `${formatWilson(b5Retreats, b5Entrants)} | ` +
      `${formatWilson(stats.survivedRuns, stats.runs)} | ` +
      `${formatWilson(stats.diedRuns, stats.runs)} | ` +
      `${stats.averageReachedFloor.toFixed(2)}`
    );
  });
}

function formatDistributionStats(stats, multiplier = 1, digits = 1) {
  if (!stats?.n) return "n=0";
  const format = value => (value * multiplier).toFixed(digits);
  return `n=${stats.n} p10=${format(stats.p10)} med=${format(stats.median)} p90=${format(stats.p90)}`;
}

function printB5GateDiagnostics(result) {
  if (!result?.b5GateByClass) return;
  console.log(`\n【${result.label} B5F 火炎診断（同一 B20 撤退条件）】`);
  console.log(
    "職業 | N | entrant | 試行歩/run(全) | 試行歩/entrant | 発動/entrant | 予告回避/entrant | 被害HP/entrant | B5突破 | B5死亡 | B5撤退"
  );
  Object.entries(result.b5GateByClass).forEach(([className, stats]) => {
    console.log(
      `${className.padEnd(6)} | ${String(stats.runs).padStart(3)} | ` +
      `${formatPercent(stats.entrantRate)} | ` +
      `${stats.averageFlameTrapEligibleStepsAllRuns.toFixed(2).padStart(13)} | ` +
      `${stats.averageFlameTrapEligibleSteps.toFixed(2).padStart(14)} | ` +
      `${stats.averageFlameTrapActivations.toFixed(2).padStart(12)} | ` +
      `${stats.averageFlameTrapWarningAvoided.toFixed(2).padStart(15)} | ` +
      `${stats.averageFlameTrapDamageHp.toFixed(2).padStart(14)} | ` +
      `${formatWilson(stats.breakthroughRuns, stats.entrants)} | ` +
      `${formatWilson(stats.deathRuns, stats.entrants)} | ` +
      `${formatWilson(stats.retreatRuns, stats.entrants)}`
    );
  });
  console.log("HP分布（B5 entrant、絶対HP: 入場 / 生存中の最低 / 最低HP比）");
  Object.entries(result.b5GateByClass).forEach(([className, stats]) => {
    console.log(
      `${className.padEnd(6)} | 入場 ${formatDistributionStats(stats.entrantHp)} | ` +
      `最低+ ${formatDistributionStats(stats.minimumPositiveHp)} | ` +
      `入場比 ${formatDistributionStats(stats.entrantHpRate, 100)}% | ` +
      `最低比 ${formatDistributionStats(stats.minimumPositiveHpRate, 100)}%`
    );
  });
  console.log("B5死亡の時系列分類（direct / 火炎発動後の他要因 / 火炎発動なしの他要因）");
  Object.entries(result.b5GateByClass).forEach(([className, stats]) => {
    const deathDenominator = Math.max(1, stats.deathRuns);
    const formatCause = count => `${count}/${stats.deathRuns} (${((count / deathDenominator) * 100).toFixed(1)}%)`;
    console.log(
      `${className.padEnd(6)} | direct=${formatCause(stats.directDeaths)} | ` +
      `afterFlame=${formatCause(stats.deathsAfterFlame)} | ` +
      `noFlame=${formatCause(stats.deathsWithoutFlame)} | ` +
      `afterFlame<=5steps=${stats.deathsAfterFlameWithinFiveSteps} | ` +
      `causes=${JSON.stringify(stats.deathCauseCounts)}`
    );
  });
}

function printTrapMetrics(result) {
  console.log(
    `\n【${result.label} 罠計測 / 職業別 / 床罠=${result.trapPolicy}, ` +
    `宝箱=${result.chestTrapPolicy}, ` +
    `回避=${result.trapAvoidancePolicy}】`
  );
  console.log(
    "職業    | 発動/run | 察知/run | 罠被害HP | 戦闘被害HP | 罠傷薬消費 | 傷薬消費 | 不足/run | 不足率 | 開始入手 | 出発入手 | 宝箱入手 | 商人入手 | 開始消費 | 出発消費 | 宝箱消費 | 商人消費 | 解除 | 回避 | 回避追加歩数 | 強行 | kit入手 | kit使用 | 出発kit入手 | 出発kit消費"
  );
  console.log(
    "--------|----------|----------|----------|------------|------------|----------|----------|--------|----------|----------|----------|----------|----------|----------|----------|----------|------|------|--------------|------|--------|--------|------------|------------"
  );
  Object.entries(result.trapMetricsByClass).forEach(([className, metrics]) => {
    const acquired = metrics.averageHealPotionsAcquiredBySource;
    const consumed = metrics.averageHealPotionsConsumedBySource;
    const kitsAcquired = metrics.averageTrapKitsAcquiredBySource;
    const kitsConsumed = metrics.averageTrapKitsConsumedBySource;
    console.log(
      `${className.padEnd(7)} | ${metrics.averageTrapActivations.toFixed(2).padStart(8)} | ` +
      `${metrics.averageTrapDetections.toFixed(2).padStart(8)} | ` +
      `${metrics.averageTrapDamageHp.toFixed(2).padStart(8)} | ` +
      `${metrics.averageCombatDamageHp.toFixed(2).padStart(10)} | ` +
      `${metrics.averageTrapHealPotionsUsed.toFixed(2).padStart(10)} | ` +
      `${metrics.averageHealPotionsConsumed.toFixed(2).padStart(8)} | ` +
      `${metrics.averageTrapHealPotionShortages.toFixed(2).padStart(8)} | ` +
      `${formatPercent(metrics.trapHealPotionShortageRunRate).padStart(6)} | ` +
      `${acquired.starting.toFixed(2).padStart(8)} | ${acquired.departureCraft.toFixed(2).padStart(8)} | ` +
      `${acquired.chest.toFixed(2).padStart(8)} | ` +
      `${acquired.merchant.toFixed(2).padStart(8)} | ` +
      `${consumed.starting.toFixed(2).padStart(8)} | ${consumed.departureCraft.toFixed(2).padStart(8)} | ` +
      `${consumed.chest.toFixed(2).padStart(8)} | ` +
      `${consumed.merchant.toFixed(2).padStart(8)} | ` +
      `${metrics.averageTrapDisarms.toFixed(2).padStart(4)} | ${metrics.averageTrapAvoided.toFixed(2).padStart(4)} | ` +
      `${metrics.averageTrapAvoidanceExtraSteps.toFixed(2).padStart(8)} | ` +
      `${metrics.averageTrapForced.toFixed(2).padStart(4)} | ${metrics.averageTrapKitsAcquired.toFixed(2).padStart(6)} | ` +
      `${metrics.averageTrapKitsUsed.toFixed(2).padStart(6)} | ` +
      `${kitsAcquired.departureCraft.toFixed(2).padStart(8)} | ` +
      `${kitsConsumed.departureCraft.toFixed(2).padStart(8)}`
    );
  });
  console.log("火炎の罠（B5Fのみ・既存罠経路外） | 発動/run | 予告回避/run | 被害HP/run | 死亡者/run | 試行対象歩/run");
  Object.entries(result.flameTrapByClass || {}).forEach(([className, metrics]) => {
    console.log(
      `${className.padEnd(30)} | ` +
      `${metrics.averageFlameTrapActivations.toFixed(2).padStart(8)} | ` +
      `${metrics.averageFlameTrapWarningAvoided.toFixed(2).padStart(11)} | ` +
      `${metrics.averageFlameTrapDamageHp.toFixed(2).padStart(9)} | ` +
      `${metrics.averageFlameTrapDeaths.toFixed(2).padStart(10)} | ` +
      `${metrics.averageFlameTrapEligibleSteps.toFixed(2).padStart(11)}`
    );
  });
  console.log("回避EV評価 | 候補/run | 却下/run | 観測不足/run | 追加遭遇/run | 遭遇被害HP/run | 直接対応HP/run");
  Object.entries(result.trapMetricsByClass).forEach(([className, metrics]) => {
    console.log(
      `${className.padEnd(7)} | ${metrics.averageTrapAvoidanceCandidates.toFixed(2).padStart(9)} | ` +
      `${metrics.averageTrapAvoidanceRejected.toFixed(2).padStart(8)} | ` +
      `${metrics.averageTrapAvoidanceNoEstimate.toFixed(2).padStart(11)} | ` +
      `${metrics.averageTrapAvoidanceExpectedEncounterCount.toFixed(2).padStart(11)} | ` +
      `${metrics.averageTrapAvoidanceExpectedEncounterDamage.toFixed(2).padStart(14)} | ` +
      `${metrics.averageTrapAvoidanceExpectedDirectDamage.toFixed(2).padStart(14)}`
    );
  });
  console.log("商人傷薬 | 試行/run | 失敗理由/run");
  Object.entries(result.trapMetricsByClass).forEach(([className, metrics]) => {
    const failures = Object.entries(metrics.averageHealPotionMerchantFailures)
      .map(([reason, count]) => `${reason}=${count.toFixed(2)} (${metrics.healPotionMerchantFailureCounts[reason]})`)
      .join(", ") || "なし";
    console.log(
      `${className.padEnd(7)} | ${metrics.averageHealPotionMerchantAttempts.toFixed(2).padStart(8)} ` +
      `(${metrics.healPotionMerchantAttempts}/${metrics.runs}) | ${failures}`
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

function printConsumableSummary(result) {
  const healAcquired = Object.values(result.averageHealPotionsAcquiredBySource)
    .reduce((sum, amount) => sum + amount, 0);
  const greaterHealAcquired = Object.values(result.averageGreaterHealPotionsAcquiredBySource || {})
    .reduce((sum, amount) => sum + amount, 0);
  const departureWingAcquired = result.averagePortalAcquisitions?.departureCraft || 0;
  const departureWingUsed = result.averagePortalUsesBySource?.["departure-craft"] || 0;
  console.log(
    `素材/run: 入手=${result.averageMaterialAcquired.toFixed(2)} ` +
    `(戦闘=${result.averageMaterialAcquiredBySource.combat.toFixed(2)}, ` +
    `宝箱=${result.averageMaterialAcquiredBySource.chest.toFixed(2)}, ` +
    `クエスト=${result.averageMaterialAcquiredBySource.quest.toFixed(2)}), ` +
    `節目商人消費=${result.averageMaterialConsumed.toFixed(2)}`
  );
  console.log(
    `消耗品/run: 傷薬入手/消費=${healAcquired.toFixed(2)}/${result.averageHealPotionsConsumed.toFixed(2)}, ` +
    `上薬入手/消費=${greaterHealAcquired.toFixed(2)}/${(result.averageGreaterHealPotionsConsumed || 0).toFixed(2)}, ` +
    `罠kit入手/消費=${result.averageTrapKitsAcquired.toFixed(2)}/${result.averageTrapKitsUsed.toFixed(2)}, ` +
    `翼(出発)入手/消費=${departureWingAcquired.toFixed(2)}/${departureWingUsed.toFixed(2)}, ` +
    `鑑定粉入手/消費=${formatPowderAcquired(result)}/` +
    `${result.averageIdentificationPowderUsed.toFixed(2)}, ` +
    `終了残量=${formatPowderRemaining(result)}, ` +
    `枯渇率=${formatWilson(
      result.identificationPowderDepletionRate * RUNS_PER_CASE,
      RUNS_PER_CASE
    )}`
  );
  printCraftMeasurementSummary(result);
}

function printCraftMeasurementSummary(result) {
  console.log("クラフト・素材競合/run（職業別。craft=実購入/同一bank可否）");
  console.log(
    "職業    | 魔石片 宝箱/モンスター/その他 | 魔力草 craft/率/使用 | 傷薬 可/率 | 上薬 可/率 | 聖水 可/率 | 強化可 | 工房可 | 実消費 強化/工房"
  );
  console.log(
    "--------|--------------------------|--------------------|-----------|-----------|-----------|--------|-------|------------------"
  );
  Object.entries(result.consumablesByClass || {}).forEach(([className, metrics]) => {
    const shards = metrics.averageMaterialSourceCounts?.chest?.[MAGIC_SHARD] || 0;
    const combatShards = metrics.averageMaterialSourceCounts?.combat?.[MAGIC_SHARD] || 0;
    const otherShards =
      (metrics.averageMaterialSourceCounts?.quest?.[MAGIC_SHARD] || 0) +
      (metrics.averageMaterialSourceCounts?.other?.[MAGIC_SHARD] || 0);
    const actual = metrics.averageDepartureCraftCraftedByRecipe || {};
    const actualRate = metrics.departureCraftRunRateByRecipe || {};
    const potential = metrics.averageDepartureCraftPotentialByRecipe || {};
    const potentialRate = metrics.departureCraftPotentialRunRateByRecipe || {};
    const craft = recipeId =>
      `${(actual[recipeId] || 0).toFixed(2)}/${(potential[recipeId] || 0).toFixed(2)} ` +
      `${formatPercent(actualRate[recipeId] || 0)}/${formatPercent(potentialRate[recipeId] || 0)}`;
    const competition = metrics.materialCompetition || {};
    console.log(
      `${className.padEnd(7)} | ${shards.toFixed(2)}/${combatShards.toFixed(2)}/${otherShards.toFixed(2).padStart(5)} ` +
      `| ${craft("MANA_POTION")} / ${(metrics.averageManaPotionsConsumed || 0).toFixed(2)} ` +
      `| ${craft("HEAL_POTION")} | ${craft("GREATER_HEAL")} | ${craft("HOLY_WATER")} ` +
      `| ${formatPercent(competition.weaponEnhancementAffordableRate || 0)} ` +
      `| ${(competition.averageAffordableWorkshopNodeCount || 0).toFixed(2)} ` +
      `| ${(competition.averageSimulatedWeaponEnhancementShardSpend || 0).toFixed(2)}/` +
      `${(competition.averageSimulatedWorkshopNodeShardSpend || 0).toFixed(2)}`
    );
    console.log(
      `  ${className}: 魔力草入手=${JSON.stringify(metrics.averageManaPotionsAcquiredBySource)} ` +
      `消費=${JSON.stringify(metrics.averageManaPotionsConsumedBySource)}; ` +
      `聖水入手=${JSON.stringify(metrics.averageHolyWaterAcquiredBySource)} ` +
      `消費=${JSON.stringify(metrics.averageHolyWaterConsumedBySource)}`
    );
  });
  console.log(
    "注: 魔石片は宝箱/モンスター/その他(クエスト+残差)。比較3種の craft は同じ開始bankでの非消費 affordance。"
  );
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
    "目標深度 | 平均到達深度 | 生還率(Wilson) | EV/時間 | 粉入手/Run | 粉消費/Run | 粉残量/Run | 枯渇率 | 鑑定回数/Run | 未鑑定着用/Run | 呪い被弾/Run"
  );
  console.log("---------|--------------|--------------|----------|------------|------------|------------|--------|--------------|----------------|--------------");
  results.forEach(result => {
    console.log(
      `${result.label.padEnd(8)} | ${result.averageReachedFloor.toFixed(2).padStart(12)} | ` +
      `${formatWilson(result.survivedRuns, RUNS_PER_CASE).padStart(18)} | ${result.materialEvPerTime.toFixed(4).padStart(8)} | ` +
      `${formatPowderAcquired(result).padStart(18)} | ` +
      `${result.averageIdentificationPowderUsed.toFixed(2).padStart(10)} | ` +
      `${formatPowderRemaining(result).padStart(10)} | ` +
      `${formatWilson(
        result.identificationPowderDepletionRate * RUNS_PER_CASE,
        RUNS_PER_CASE
      ).padStart(16)} | ` +
      `${result.averageIdentificationCount.toFixed(2).padStart(12)} | ` +
      `${result.averageUnidentifiedWearCount.toFixed(2).padStart(14)} | ` +
      `${result.averageCurseHitCount.toFixed(2).padStart(12)}`
    );
    const source = result.averageIdentificationPowderAcquiredBySource;
    console.log(
      `  粉入手内訳/Run: 開始=${result.identificationPowderUnlimited ? "実質無制限" : source.starting.toFixed(2)}, 工房=${source.workshop.toFixed(2)}, ` +
      `出発クラフト=${source.departureCraft.toFixed(2)}, 宝箱=${source.chest.toFixed(2)}, ` +
      `図鑑初撃破=${source.codex.toFixed(2)}, 節目商人=${source.merchant.toFixed(2)}`
    );
    console.log(
      `  平均95%CI（正規近似）: 到達=${result.mean95CI.reachedFloor}, ` +
      `bank=${result.mean95CI.bankedMaterialEv}, EV/時間=${result.mean95CI.materialEvPerTime}, ` +
      `素材入手=${result.mean95CI.materialAcquired}, 素材消費=${result.mean95CI.materialConsumed}, ` +
      `粉入手=${result.mean95CI.identificationPowderAcquired}, ` +
      `粉消費=${result.mean95CI.identificationPowderUsed}, ` +
      `粉残量=${result.identificationPowderUnlimited ? "実質無制限" : result.mean95CI.identificationPowderRemaining}`
    );
  });
}

function printCurseGenerationMetrics(result) {
  console.log(`\n【${result.label} 呪い生成率・core定着区分】`);
  [
    ["core", "コア付き"],
    ["nonCore", "非コア"]
  ].forEach(([group, label]) => {
    const counts = result.curseGeneration[group];
    console.log(
      `  ${label}: 呪い付き/生成=${formatWilson(counts.cursed, counts.generated)} ` +
      `(生成=${counts.generated}, 呪い付き=${counts.cursed})`
    );
  });
  console.log(
    "core遭遇runを分母にした区分: 呪いロック定着 / 呪いロックで候補阻止 / " +
    "呪い回避（粉不足で未鑑定保持） / その他の非ロック非装備"
  );
  CORE_AFFIXES.forEach(affix => {
    const encountered = result.coreEncounterRunsById[affix.id] || 0;
    const locked = result.coreCurseLockedRetentionRunsById[affix.id] || 0;
    const blocked = result.coreBlockedByCurseLockRunsById[affix.id] || 0;
    const avoided = result.coreCurseAvoidedRunsById[affix.id] || 0;
    const otherUnselected = result.coreUnselectedWithoutCurseLockRunsById[affix.id] || 0;
    console.log(
      `  ${affix.id}: 遭遇=${formatWilson(encountered, RUNS_PER_CASE)}, ` +
      `呪いロック定着=${formatWilson(locked, encountered)}, ` +
      `呪いロック阻止=${formatWilson(blocked, encountered)}, ` +
      `呪い回避=${formatWilson(avoided, encountered)}, ` +
      `その他非ロック非装備=${formatWilson(otherUnselected, encountered)}`
    );
  });
}

function printIdentificationComparison(resultsByPolicy, scenario) {
  const powderResults = resultsByPolicy.get("powder");
  const gambleResults = resultsByPolicy.get("gamble");
  if (!powderResults || !gambleResults) return;

  console.log(`\n【${scenario.label} 鑑定方針比較】`);
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

function printFloorMilestoneMetrics(result) {
  console.log(`\n【${result.label} B5/B10 entrant・突破・死亡・撤退】`);
  [5, 10].forEach(floor => {
    const entrants = result.entrantsByFloor[floor] || 0;
    const breakthroughs = result.breakthroughsByFloor[floor] || 0;
    const deaths = result.deathsByFloor[floor] || 0;
    const retreats = result.retreatsByFloor?.[floor] || 0;
    console.log(
      `B${floor}: entrant=${formatWilson(entrants, RUNS_PER_CASE)}, ` +
      `突破=${formatWilson(breakthroughs, entrants)}, ` +
      `死亡=${formatWilson(deaths, entrants)}, ` +
      `撤退=${formatWilson(retreats, entrants)}`
    );
  });
  const recoverySpellUsage = ["DIOS", "MADIOS", "MADI", "DIALMA"]
    .filter(spellName => result.spellUsage?.[spellName])
    .map(spellName => {
      const usage = result.spellUsage[spellName];
      return `${spellName}: known=${usage.knownRounds}, castable=${usage.castableRounds}, ` +
        `selected=${usage.selected}, applied=${usage.applied}, failed=${usage.failed}, ` +
        `post=${usage.postCombatCasts}, postHp=${usage.postCombatHealingHp}`;
    })
    .join(" / ");
  console.log(`回復呪文使用集計（全run分母 N=${RUNS_PER_CASE}; selectedはcast回数）: ${recoverySpellUsage}`);
}

function formatResourceDistribution(distribution) {
  if (!distribution || distribution.n === 0) return "n=0";
  return [
    `n=${distribution.n}`,
    `p0=${distribution.min.toFixed(3)}`,
    `p25=${distribution.p25.toFixed(3)}`,
    `p50=${distribution.median.toFixed(3)}`,
    `p75=${distribution.p75.toFixed(3)}`,
    `p100=${distribution.max.toFixed(3)}`
  ].join(" ");
}

function buildMpScarcityMeasurement(resultsByPolicy) {
  return {
    sourceCommit: MEASUREMENT_PROVENANCE?.sourceCommit || null,
    originMainAncestor: MEASUREMENT_PROVENANCE?.originMainAncestor ?? null,
    staleTreeAllowed: MEASUREMENT_PROVENANCE?.staleTreeAllowed ?? null,
    simRuns: RUNS_PER_CASE,
    calibrationRuns: CALIBRATION_RUNS,
    targetDepths: [...TARGET_DEPTHS],
    classes: [...SIM_CLASSES],
    results: resultsByPolicy.flatMap(({ policy, scenarioResults }) =>
      scenarioResults.flatMap(({ scenario, results }) => results.map(result => ({
        policy: policy.id,
        scenario: scenario.id,
        targetDepth: result.targetDepth,
        runs: RUNS_PER_CASE,
        outcomesByClass: Object.fromEntries(
          Object.entries(result.outcomesByClass).map(([className, outcome]) => [
            className,
            {
              runs: outcome.runs,
              terminationReasons: outcome.terminationReasons,
              finalHp: outcome.finalHp,
              finalHpRate: outcome.finalHpRate,
              finalMp: outcome.finalMp,
              finalMpRate: outcome.finalMpRate,
              endResourceByReason: outcome.endResourceByReason,
              mpBlockedTerminalEncounterRuns: outcome.mpBlockedTerminalEncounterRuns,
              mpDepletionCausedEndRuns: outcome.mpDepletionCausedEndRuns
            }
          ])
        ),
        mpPressureByClass: result.mpPressureByClass,
        mpPressure: result.mpPressure,
        mpBlockedTerminalEncounterRuns: result.mpBlockedTerminalEncounterRuns,
        mpDepletionCausedEndRuns: result.mpDepletionCausedEndRuns
      })))
    )
  };
}

function printMpScarcityMetrics(resultsByPolicy) {
  console.log("\n【Issue #658 MP scarcity】");
  resultsByPolicy.forEach(({ policy, scenarioResults }) => {
    scenarioResults.forEach(({ scenario, results }) => {
      results.forEach(result => {
        Object.entries(result.outcomesByClass).forEach(([className, outcome]) => {
          const pressure = result.mpPressureByClass[className];
          const combat = pressure.combat.total;
          const exploration = pressure.exploration.total;
          const recovery = pressure.recovery.total;
          console.log(
            `policy=${policy.id} scenario=${scenario.id} B${result.targetDepth} ${className} ` +
            `endMP=${formatResourceDistribution(outcome.finalMpRate)} ` +
            `endHP=${formatResourceDistribution(outcome.finalHpRate)} ` +
            `reasons=${JSON.stringify(outcome.terminationReasons)} ` +
            `mpBlockedEnd=${outcome.mpBlockedTerminalEncounterRuns} ` +
            `mpCauseEnd=${outcome.mpDepletionCausedEndRuns} ` +
            `pressure(combat=${combat.mpBlocked},explore=${exploration.mpBlocked},recovery=${recovery.mpBlocked})`
          );
        });
      });
    });
  });
  console.log(`MP_SCARCITY_JSON=${JSON.stringify(buildMpScarcityMeasurement(resultsByPolicy))}`);
}

function printBuildSupplyMetrics(results) {
  console.log("戦略       | 装備入手 | 前半入手 | 深層入手 | core/装備(95%CI) | core遭遇run率 | 前半core遭遇run率 | core装備run率 | 平均換装 | 前半換装 | 深層換装");
  console.log("-----------|----------|----------|----------|------------------|---------------|-------------------|-------------|----------|----------|----------");
  results.forEach(result => {
    console.log(
      `${result.label.padEnd(10)} | ${result.averageEquipmentFound.toFixed(2).padStart(8)} | ` +
      `${result.averageEarlyEquipmentFound.toFixed(2).padStart(8)} | ${result.averageDeepEquipmentFound.toFixed(2).padStart(8)} | ` +
      `${formatWilson(result.coreEquipmentFound, result.equipmentFound).padStart(22)} | ` +
      `${formatWilson(result.coreEncounterRuns, RUNS_PER_CASE).padStart(20)} | ` +
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
    printTrapBonusSupplyMetrics(result);
  });
}

function printTrapBonusSupplyMetrics(result) {
  const supply = result.trapBonusSupply;
  const values = Object.entries(supply.averageTrapBonusByValue)
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([value, average]) =>
      `${value}%=${average.toFixed(3)}/run (${formatPercent(supply.trapBonusValueDistribution[value])})`
    )
    .join(", ") || "なし";
  console.log(
    `  trapBonus供給: 装備${supply.equipmentItems}, 付与装備率=${formatPercent(supply.trapBonusItemRate)}, ` +
    `値別=${values}`
  );
  const classParts = Object.entries(result.trapBonusSupplyByClass)
    .map(([className, classSupply]) => {
      const classValues = Object.entries(classSupply.averageTrapBonusByValue)
        .sort(([left], [right]) => Number(left) - Number(right))
        .map(([value, average]) => `${value}%:${average.toFixed(3)}`)
        .join(", ") || "なし";
      return `${className} ${formatPercent(classSupply.trapBonusItemRate)} [${classValues}]`;
    })
    .join(" / ");
  console.log(`  trapBonus職業別: ${classParts}`);
}

function printCoreRetentionDetail(result) {
  console.log(`\n【${result.label} core定着詳細】`);
  console.log(
    `全core: 遭遇=${formatWilson(result.coreEncounterRuns, RUNS_PER_CASE)}, ` +
    `終了時装備=${formatWilson(result.coreEquippedRuns, RUNS_PER_CASE)}, ` +
    `遭遇→装備定着=${formatWilson(result.coreEquippedRuns, result.coreEncounterRuns)}`
  );
  const coreCountBuckets = { 0: 0, 1: 0, 2: 0, "3+": 0 };
  Object.entries(result.coreEquippedCountDistribution).forEach(([count, runs]) => {
    const numericCount = Number(count);
    const bucket = numericCount >= 3 ? "3+" : String(numericCount);
    coreCountBuckets[bucket] += runs;
  });
  const coreCountDistribution = Object.entries(coreCountBuckets)
    .map(([count, runs]) => `${count}個=${formatWilson(runs, RUNS_PER_CASE)}`)
    .join(" / ");
  console.log(`終了時core装備数分布（active core数/run）: ${coreCountDistribution}`);
  const nonEquipmentReasonTotal = Object.values(result.coreNonEquipmentReasonTotals)
    .reduce((sum, count) => sum + count, 0);
  const nonEquipmentReasons = Object.entries(CORE_NON_EQUIPMENT_REASON_LABELS)
    .map(([reason, label]) => {
      const count = result.coreNonEquipmentReasonTotals[reason] || 0;
      return `${label}=${formatWilson(count, nonEquipmentReasonTotal)}`;
    })
    .join(" / ");
  console.log(
    `非装備要因（全core、core-type遭遇runの非装備分母=${nonEquipmentReasonTotal}）: ` +
    nonEquipmentReasons
  );
  console.log("非装備要因（poolGroup別。分母は各groupのcore遭遇後非装備件数）:");
  ["combat", "economy"].forEach(poolGroup => {
    const counts = result.coreNonEquipmentReasonCountsByGroup?.[poolGroup] || {};
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    const reasons = Object.entries(CORE_NON_EQUIPMENT_REASON_LABELS)
      .map(([reason, label]) => `${label}=${formatWilson(counts[reason] || 0, total)}`)
      .join(" / ");
    console.log(`  ${poolGroup}: 非装備N=${total}; ${reasons}`);
  });
  console.log("装備スコア経路監査（score不足はsim方針上の判定。ゲーム制約と同一視しない）:");
  Object.entries(CORE_SCORING_COVERAGE_NOTES).forEach(([coreId, note]) => {
    console.log(`  ${coreId}: ${note}`);
  });
  console.log(
    `combat: 遭遇=${formatWilson(result.combatCoreEncounterRuns, RUNS_PER_CASE)}, ` +
    `終了時装備=${formatWilson(result.combatCoreEquippedRuns, RUNS_PER_CASE)}, ` +
    `定着=${formatWilson(result.combatCoreEquippedRuns, result.combatCoreEncounterRuns)}`
  );
  console.log(
    `economy: 遭遇=${formatWilson(result.economyCoreEncounterRuns, RUNS_PER_CASE)}, ` +
    `終了時装備=${formatWilson(result.economyCoreEquippedRuns, RUNS_PER_CASE)}, ` +
    `定着=${formatWilson(result.economyCoreEquippedRuns, result.economyCoreEncounterRuns)}`
  );
  console.log("遭遇core別（run数。未装備理由は最終非装備runの主因）:");
  ENABLED_CORE_AFFIXES.forEach(affix => {
    const encountered = result.coreEncounterRunsById[affix.id] || 0;
    const equipped = result.coreEquippedRunsById[affix.id] || 0;
    const nonEquipped = Math.max(0, encountered - equipped);
    const reasonCounts = result.coreNonEquipmentReasonCountsById[affix.id] || {};
    const reasons = Object.entries(CORE_NON_EQUIPMENT_REASON_LABELS)
      .map(([reason, label]) => [label, reasonCounts[reason] || 0])
      .filter(([, count]) => count > 0)
      .map(([label, count]) => `${label}=${formatWilson(count, nonEquipped)}`)
      .join(", ");
    console.log(
      `  ${affix.id} [${affix.poolGroup}]: 遭遇=${encountered}, 終了時装備=${equipped}, ` +
      `未装備=${nonEquipped}${reasons ? ` (${reasons})` : ""}`
    );
  });
  const sneakOpportunities = result.coreObservations.coreOpportunityCounts.CORE_SNEAK_STEP || 0;
  const sneakReducedCases = result.coreObservations.sneakStepReducedDetectionCases || 0;
  const getPassiveEffectText = coreId => {
    const observations = result.coreObservations;
    const opportunities = observations.coreOpportunityCounts[coreId] || 0;
    if (coreId === "CORE_REARGUARD") return "設計上無効";
    if (coreId === "CORE_SNEAK_STEP") {
      return `常時適用（定義上100%）; baseline検知→適用後非検知=${formatWilson(
        sneakReducedCases,
        sneakOpportunities
      )}`;
    }
    if (coreId === "CORE_CURSE_KEEPER") {
      const cases = observations.curseKeeperStrGainCases || 0;
      const total = observations.curseKeeperStrGainTotal || 0;
      return `常時適用（定義上100%）; STR差合計=+${total}（適用N=${cases}, 平均=+${
        cases > 0 ? (total / cases).toFixed(2) : "0.00"
      }/適用round）`;
    }
    if (coreId === "CORE_TOMB_RAIDER") {
      const total = observations.tombRaiderMaterialBonusTotal || 0;
      return `常時適用（定義上100%）; 宝箱素材差=+${total}（N=${opportunities}, 平均=+${
        opportunities > 0 ? (total / opportunities).toFixed(2) : "0.00"
      }/chest）`;
    }
    if (coreId === "CORE_KEEN_EYE") {
      const applications = observations.keenEyeEffectApplications || 0;
      const delta = Object.entries(observations.keenEyeEffectDelta || {})
        .filter(([, amount]) => amount !== 0)
        .map(([field, amount]) => `${field}${amount > 0 ? "+" : ""}${amount}`)
        .join(", ") || "差分なし";
      return `常時適用（定義上100%）; 未鑑定効果差=${delta}（適用N=${applications}）`;
    }
    if (coreId === "CORE_TRAP_EATER") {
      const total = observations.trapEaterAttackGainTotal || 0;
      const activations = observations.coreActivationCounts.CORE_TRAP_EATER || 0;
      return `常時適用（定義上100%）; run攻撃bonus差=+${total}（発動N=${activations}, 平均=+${
        activations > 0 ? (total / activations).toFixed(2) : "0.00"
      }/発動）`;
    }
    return "条件付きcore: 実発動率を上欄で測定";
  };
  console.log("core別（装備率 / 発動指標 / 定着率 / 効果量。受動coreの100%は定義上）:");
  CORE_AFFIXES.forEach(affix => {
    const encountered = result.coreEncounterRunsById[affix.id] || 0;
    const equipped = result.coreEquippedRunsById[affix.id] || 0;
    const opportunities = result.coreObservations.coreOpportunityCounts[affix.id] || 0;
    const activations = result.coreObservations.coreActivationCounts[affix.id] || 0;
    const activation = !affix.enabled
      ? "設計上無効 [N=0; CIなし]"
      : affix.id === "CORE_BLOOD_WAND" && opportunities === 0
        ? "未観測 [N=0; CIなし]（D: 到達深度・遭遇不足）"
      : PASSIVE_CORE_IDS.has(affix.id)
        ? `常時適用（定義上100%; 機会N=${opportunities}）`
      : CORE_ACTIVATION_MEASUREMENT_NOTES[affix.id] ||
        formatWilson(activations, opportunities);
    console.log(
      `  ${affix.id}: 装備率=${formatWilson(equipped, RUNS_PER_CASE)} / ` +
      `発動指標=${activation} / ` +
      `定着率=${formatWilson(equipped, encountered)} / ` +
      `効果量=${getPassiveEffectText(affix.id)}`
    );
  });
  const bloodWandEquippedRuns = result.coreEquippedRunsById.CORE_BLOOD_WAND || 0;
  const bloodWandObservations = result.coreObservations;
  console.log(
    `血杖カバー: 終了時装備run=${bloodWandEquippedRuns}, ` +
    `有効combat round=${bloodWandObservations.bloodWandActiveRounds}, ` +
    `MP=0 round=${bloodWandObservations.bloodWandMpEmptyRounds}, ` +
    `spell選択=${bloodWandObservations.bloodWandSelectedSpellRounds}, ` +
    `対象spellなし=${bloodWandObservations.bloodWandNoEligibleSpellRounds}, ` +
    `選択spell MP不足=${bloodWandObservations.bloodWandMpInsufficientRounds}, ` +
    `getSpellPayment resource=hp=${bloodWandObservations.bloodWandHpPaymentReturns} ` +
    `(canCast=${bloodWandObservations.bloodWandHpPaymentCanCast})`
  );
  console.log(
    `忍び足カバー: getPerceptionIntent適用=${formatWilson(sneakOpportunities, sneakOpportunities)}, ` +
    `baseline検知→適用後非検知=${formatWilson(sneakReducedCases, sneakOpportunities)}`
  );
  console.log("職業別core定着順位（遭遇→終了時装備）:");
  Object.entries(result.coreRetentionByClass).forEach(([className, retentionById]) => {
    const ranking = Object.entries(retentionById)
      .sort(([, left], [, right]) => {
        if (right.retentionRate !== left.retentionRate) {
          return right.retentionRate - left.retentionRate;
        }
        return right.encountered - left.encountered;
      })
      .map(([coreId, values]) =>
        `${coreId}=${formatPercent(values.retentionRate)} (${values.equipped}/${values.encountered})`
      )
      .join(" > ");
    console.log(`  ${className}: ${ranking}`);
  });
  console.log("浄化の環 実効回復（core遭遇後の実ラン）:");
  Object.entries(result.purifyEffectsByClass).forEach(([className, effect]) => {
    console.log(
      `  ${className}: core使用run=${effect.runsWithCore}, ` +
      `タグ撃破=${effect.averageTagKills.toFixed(2)}/run, ` +
      `実測MP=${effect.averageActualMpRecovered.toFixed(2)}/run, ` +
      `HP=${effect.averageActualHpRecovered.toFixed(2)}/run ` +
      `(core使用runあたりMP=${effect.averageActualMpPerCoreRun.toFixed(2)}, ` +
      `HP=${effect.averageActualHpPerCoreRun.toFixed(2)})`
    );
  });
}

function printWorkshopEffects(result) {
  const grants = getWorkshopGrants(result.workshop);
  const stats = Object.entries(grants.stats)
    .map(([stat, amount]) => `${stat}+${amount}`)
    .join(", ") || "なし";
  console.log(
    `工房付与内訳: stats=${stats}, 初期装備候補=${grants.startingGear.join(",") || "なし"}, ` +
    `affix=${grants.affixIds.join(",") || "なし"}, ` +
    `spell=${grants.spellIds.join(",") || "なし"}`
  );
  Object.entries(result.workshopEffectsByClass).forEach(([className, effects]) => {
    const applied = Object.entries(effects.startingGearApplied)
      .map(([itemId, rate]) => `${itemId}=${formatPercent(rate)}`)
      .join(", ") || "なし";
    console.log(
      `  ${className}: 初期装備適用=${applied}, ` +
      `適用率=${formatPercent(effects.startingGearAppliedRate)}, ` +
      `攻撃力差=${effects.averageStartingGearAttackDelta.toFixed(2)}/run`
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
  { kind, scenarioId, identificationPolicyId = "powder" },
  { scoringProfile, scoringProfiles = {}, scoringProfilesByScenario = {} }
) {
  resetSimulationRandom(SIM_SEED);
  const scoringProfileForPolicy =
    scoringProfilesByScenario[`${identificationPolicyId}:${scenarioId}`] ||
    scoringProfiles[identificationPolicyId] ||
    scoringProfile;
  const identificationPolicy =
    IDENTIFICATION_POLICY_DEFINITIONS[identificationPolicyId] ||
    IDENTIFICATION_POLICY_DEFINITIONS.powder;
  if (kind === "scenario") {
    const scenario = getScenarioById(scenarioId);
    const measurementScenario = {
      ...scenario,
      departureCraftMeasurement: true
    };
    return TARGET_DEPTHS.map(targetDepth =>
      snapshotDepthResult(simulateCase({
        startFloor: 1,
        targetDepth,
        label: `B${targetDepth}撤退`,
        seriesId: `depth-${targetDepth}`,
        scoringProfile: scoringProfileForPolicy,
        scenario: measurementScenario,
        identificationPolicy
      }))
    );
  }

  const legacyScenario = {
    ...getScenarioById("legacy-no-portal"),
    departureCraftMeasurement: true
  };
  return [
    snapshotDepthResult(simulateCase({
      startFloor: 10,
      targetDepth: 15,
      label: "B10→B15",
      seriesId: "milestone-10-15",
      scoringProfile: scoringProfileForPolicy,
      scenario: legacyScenario,
      identificationPolicy
    })),
    snapshotDepthResult(simulateCase({
      startFloor: 1,
      targetDepth: 15,
      label: "B1→B15",
      seriesId: "baseline-1-15",
      scoringProfile: scoringProfileForPolicy,
      scenario: legacyScenario,
      identificationPolicy
    }))
  ];
}

export function runCoreCalibrationTask({ policyId, scenarioId = null, runCount }) {
  resetSimulationRandom(SIM_SEED);
  const workshop = scenarioId === null
    ? undefined
    : getScenarioById(scenarioId).workshop;
  return {
    policyId,
    scenarioId,
    profile: calibrateCoreScoringProfile(runCount, {}, policyId, workshop)
  };
}

export function runCalibratedDepthSimulationTask(
  { kind, scenarioId = null, identificationPolicyId = "powder", runCount },
  context
) {
  resetMapGenerationStats();
  const calibration = runCoreCalibrationTask({
    policyId: identificationPolicyId,
    scenarioId,
    runCount
  });
  const scoringProfiles = {
    [identificationPolicyId]: calibration.profile
  };
  const scoringProfilesByScenario = scenarioId === null
    ? {}
    : { [`${identificationPolicyId}:${scenarioId}`]: calibration.profile };
  return {
    policyId: identificationPolicyId,
    scenarioId,
    profile: calibration.profile,
    results: runDepthSimulationTask(
      { kind, scenarioId, identificationPolicyId },
      {
        ...context,
        scoringProfile: calibration.profile,
        scoringProfiles,
        scoringProfilesByScenario
      }
    ),
    ...(SIM_MAP_STATS_ENABLED ? { mapStats: getMapGenerationStats() } : {})
  };
}

export async function runDepthMaterialSimulation() {
printResolvedSimulationEnv();
if (ACTIVE_SCENARIOS.length === 0) {
  throw new Error(`SIM_SCENARIOSに有効な条件がない: ${[...REQUESTED_SCENARIO_IDS].join(",")}`);
}
const previousLocalRunFloorCache = localRunFloorCache;
localRunFloorCache = createRunFloorCache();
let calibratedTaskResults;
try {
  calibratedTaskResults = await runSimTasks({
    moduleUrl: import.meta.url,
    exportName: "runCalibratedDepthSimulationTask",
    runTask: runCalibratedDepthSimulationTask,
    tasks: ACTIVE_IDENTIFICATION_POLICIES.flatMap(policy => [
      ...ACTIVE_SCENARIOS.map(scenario => ({
        kind: "scenario",
        scenarioId: scenario.id,
        identificationPolicyId: policy.id,
        runCount: CALIBRATION_RUNS
      })),
      {
        kind: "milestone",
        scenarioId: null,
        identificationPolicyId: policy.id,
        runCount: CALIBRATION_RUNS
      }
    ]),
    context: {},
    mapGeneratorExportName: "generateSharedRunFloor"
  });
} finally {
  localRunFloorCache = previousLocalRunFloorCache;
}
if (SIM_MAP_STATS_ENABLED) {
  const uniqueMapKeys = new Set();
  const generatedCalls = calibratedTaskResults.reduce((sum, taskResult) => {
    taskResult.mapStats?.keys.forEach(key => uniqueMapKeys.add(key));
    return sum + (taskResult.mapStats?.calls || 0);
  }, 0);
  console.log(
    `map generation stats: calls=${generatedCalls}, ` +
    `unique(runSeed,floor)=${uniqueMapKeys.size}, ` +
    `redundancy=${generatedCalls / Math.max(1, uniqueMapKeys.size)}x`
  );
}
const coreScoringProfilesByScenario = Object.fromEntries(
  calibratedTaskResults
    .filter(result => result.scenarioId !== null)
    .map(result => [
      `${result.policyId}:${result.scenarioId}`,
      result.profile
    ])
);
// calibrationが本計測の乱数列をずらさないよう、baselineと同じseed先頭へ戻す。
randomState = SIM_SEED;

const ENV_SIGNATURE = {
  // ファイル先頭の `// sim-scope:` 宣言から読む。ベタ書きだと宣言と食い違っても
  // テストが通ってしまう（#560レビュー指摘）。
  scope: readSimScopeDeclaration(import.meta.url).name,
  seed: SIM_SEED,
  runsPerCase: RUNS_PER_CASE,
  calibrationRuns: CALIBRATION_RUNS,
  classes: SIM_CLASSES,
  elitePolicy: DEFAULT_ELITE_POLICY,
  floorTrapPolicy: DEFAULT_FLOOR_TRAP_POLICY_ID,
  chestTrapPolicy: DEFAULT_TRAP_POLICY_ID,
  trapPolicyEnv: SIM_ENV.TRAP_POLICY || null,
  trapAvoidancePolicy: DEFAULT_TRAP_AVOIDANCE_POLICY_ID,
  trapBonusOverride: TRAP_BONUS_OVERRIDE_PERCENT,
  healPotionMerchantPolicy: DEFAULT_HEAL_POTION_MERCHANT_POLICY,
  identificationPolicies: ACTIVE_IDENTIFICATION_POLICIES.map(policy => policy.id),
  identificationPolicyEnv: SIM_ENV.IDENTIFICATION_POLICY || "powder",
  coreEncounterCeilingMode: CORE_ENCOUNTER_CEILING_MODE || null,
  coreWorkshopGateMode: CORE_WORKSHOP_GATE_MODE || null,
  identificationStartingPowder: IDENTIFICATION_STARTING_POWDER_INPUT,
  identificationCost: IDENTIFICATION_COST_INPUT,
  explorationFactor: EXPLORATION_FACTOR,
  flameTrapModel: {
    floor: FLAME_TRAP_MODEL.floor,
    chance: FLAME_TRAP_MODEL.chance,
    cooldownTurns: FLAME_TRAP_MODEL.cooldownTurns,
    minDamage: FLAME_TRAP_MODEL.minDamage,
    maxDamage: FLAME_TRAP_MODEL.minDamage + FLAME_TRAP_MODEL.damageRolls - 1
  },
  chestPickupRate: CHEST_PICKUP_RATE,
  combatTurnWeight: COMBAT_TURN_WEIGHT,
  initialHealPotions: INITIAL_HEAL_POTIONS,
  initialAntidotes: INITIAL_ANTIDOTES,
  departureCraftIds: ACTIVE_DEPARTURE_CRAFT_IDS,
  departureCraftMeasurement: true,
  departureCraftComparisonRecipes: CRAFT_MEASUREMENT_RECIPE_IDS,
  healPotionThreshold: HEAL_POTION_THRESHOLD_INPUT,
  manaPotionThreshold: MANA_POTION_THRESHOLD_INPUT,
  fleePolicy: DEFAULT_FLEE_POLICY,
  fleeHpThreshold: DEFAULT_FLEE_HP_THRESHOLD,
  statusCurePolicy: DEFAULT_STATUS_CURE_POLICY,
  statusCureHpThreshold: DEFAULT_STATUS_CURE_HP_THRESHOLD,
  bloodWandHpPaymentMinRate: BLOOD_WAND_HP_PAYMENT_MIN_RATE,
  dialmaCandidate: SIM_DIALMA_CANDIDATE,
  madiCandidate: SIM_MADI_CANDIDATE,
  madiHealRangeOverride: SIM_MADI_HEAL_MIN === null
    ? null
    : [SIM_MADI_HEAL_MIN, SIM_MADI_HEAL_MAX],
  madiCostOverride: SIM_MADI_COST,
  portalMinFloor: PORTAL_MIN_FLOOR,
  portalHpThreshold: PORTAL_HP_THRESHOLD,
  portalMaxHealPotions: PORTAL_MAX_HEAL_POTIONS,
  issue646CampLevel: ISSUE646_CAMP_LEVEL || null,
  scenarios: ACTIVE_SCENARIOS.map(scenario => scenario.id)
};
printEnvSignatureBanner(ENV_SIGNATURE, { label: "env" });
if (MEASUREMENT_PROVENANCE) {
  console.log(`source commit: ${MEASUREMENT_PROVENANCE.sourceCommit}`);
}

console.log("深度別 リスク調整後素材EVシミュレーション");
console.log(`試行数: 各ケース N=${RUNS_PER_CASE}（基本${SIM_CLASSES.length}職をround-robin集約）`);
console.log(`乱数seed: ${SIM_SEED}`);
console.log(`徘徊エリート方針: ${DEFAULT_ELITE_POLICY}`);
console.log(
  `罠方針: 床罠=${TRAP_POLICY_DEFINITIONS[DEFAULT_FLOOR_TRAP_POLICY_ID].label} / ` +
  `宝箱=${TRAP_POLICY_DEFINITIONS[DEFAULT_TRAP_POLICY_ID].label} / ` +
  `TRAP_POLICY=${SIM_ENV.TRAP_POLICY}`
);
console.log(
  `罠回避方針: ${TRAP_AVOIDANCE_POLICY_DEFINITIONS[DEFAULT_TRAP_AVOIDANCE_POLICY_ID].label} / ` +
  `TRAP_AVOIDANCE_POLICY=${DEFAULT_TRAP_AVOIDANCE_POLICY_ID}`
);
console.log(
  `罠解除EV閾値: 床非pitfall scoutなし=${calculateFloorDisarmEvThreshold({ trapType: "damage" }).toFixed(2)}%, ` +
  `scoutあり=${calculateFloorDisarmEvThreshold({ trapType: "damage", scoutMitigated: true }).toFixed(2)}%, ` +
  `pitfall=${calculateFloorDisarmEvThreshold({ trapType: "pitfall" }).toFixed(2)}%, ` +
  `宝箱代表閾値=${(CHEST_DISARM_REPRESENTATIVE_THRESHOLD * 100).toFixed(2)}%（実判定はtrap/effect/content/kitのEV）`
);
console.log(
  `trapBonus測定値: ${TRAP_BONUS_OVERRIDE_PERCENT === null
    ? "実生成値"
    : `${TRAP_BONUS_OVERRIDE_PERCENT}%固定（装備由来値を上書き）`}`
);
console.log(
  "火炎罠: srcのtrapGuard適用と装備効果に応じた予告回避を使用"
);
console.log(
  "回避EV定義: 迂回追加歩数ごとのgetEncounterChance(step)合計×同一run直前の通常戦闘被害HP/回数。" +
  "観測値なしは回避せず、直接対応（解除/強行の既存方針）を選ぶ。"
);
console.log(`傷薬商人方針: ${DEFAULT_HEAL_POTION_MERCHANT_POLICY}（マイルストーンで所持0時に1個購入）`);
console.log(`core価値calibration: B1→B20 N=${CALIBRATION_RUNS} / 方針=${ACTIVE_IDENTIFICATION_POLICIES.map(policy => policy.id).join(",")}`);
console.log(`識別方針切替: IDENTIFICATION_POLICY=${SIM_ENV.IDENTIFICATION_POLICY || "powder"}`);
if (CORE_ENCOUNTER_CEILING_MODE) {
  console.log(`core遭遇率上界反実仮想: ${CORE_ENCOUNTER_CEILING_MODE}（生成後変換、乱数消費順維持）`);
}
if (CORE_WORKSHOP_GATE_MODE) {
  console.log(`core工房ゲート反実仮想: ${CORE_WORKSHOP_GATE_MODE}（core解禁のみ変更）`);
}
console.log(
  `開始鑑定粉: ${IDENTIFICATION_POWDER_UNLIMITED
    ? "実質無制限"
    : IDENTIFICATION_STARTING_POWDER} ` +
  `(IDENTIFICATION_STARTING_POWDER=${IDENTIFICATION_STARTING_POWDER_INPUT})`
);
console.log(`鑑定コスト: ${IDENTIFICATION_COST} (IDENTIFICATION_COST_OVERRIDE=${IDENTIFICATION_COST_INPUT})`);
console.log(
  `仮定: 探索係数=${EXPLORATION_FACTOR}, 宝箱拾得率=${CHEST_PICKUP_RATE}, ` +
  `戦闘ターン重み=${COMBAT_TURN_WEIGHT}`
);
console.log(
  `初期inventory: 傷薬=${INITIAL_HEAL_POTIONS}個, 解毒薬=${INITIAL_ANTIDOTES}個, ` +
  `出発クラフト=${ACTIVE_DEPARTURE_CRAFT_IDS.join(",") || "なし"} ` +
  `(個数上限=素材残高, cost=${JSON.stringify(getDepartureCraftCost(ACTIVE_DEPARTURE_CRAFT_IDS))})`
);
console.log(
  `生存仮定: 傷薬使用閾値=${HEAL_POTION_THRESHOLD}, ` +
  `魔力草使用閾値=${MANA_POTION_THRESHOLD}, ` +
  `逃走方針=${DEFAULT_FLEE_POLICY}, 逃走閾値=${DEFAULT_FLEE_HP_THRESHOLD ?? "逃走なし"}, ` +
  `状態回復=${DEFAULT_STATUS_CURE_POLICY}(HP<=${DEFAULT_STATUS_CURE_HP_THRESHOLD}), ` +
  "装備=識別方針別の実制限付き更新"
);
console.log(
  `血杖HP支払い方針: 支払い後残HP率>=${BLOOD_WAND_HP_PAYMENT_MIN_RATE}`
);
console.log(
  `帰還の翼ポリシー（仮値・感度分析対象）: B${PORTAL_MIN_FLOOR}以降, ` +
  `HP<=${PORTAL_HP_THRESHOLD}, 傷薬<=${PORTAL_MAX_HEAL_POTIONS}個で1個消費し即時撤退・100% bank`
);
console.log(
  `供給仮定: 宝箱の本体/装身具分岐を実ロジック準拠で反映、` +
  `宝箱TOWN_PORTAL/状態回復薬をinventory追加・使用対象化、` +
  `powder/gambleの鑑定粉は開始${IDENTIFICATION_POWDER_UNLIMITED
    ? "実質無制限"
    : IDENTIFICATION_STARTING_POWDER}個+出発クラフト分を含み、` +
  `宝箱${IDENTIFICATION_BALANCE.chestPowderChance * 100}%と実applyCombatRewardsの図鑑5種ごと+1を計測、` +
  "節目商人の鑑定粉は自動購入せず未観測（任意購入のため別感度が必要）、" +
  `マイルストーン商人の不足状態回復薬を実素材で購入、` +
  `core判定=enabled ${ENABLED_CORE_AFFIXES.length}/${CORE_AFFIXES.length}種+affix_rules helper`
);
console.log(
  "非モデル化: テレポーター移動先の再経路化、商人での罠外し/鑑定粉購入（任意行動）、" +
  "MP消費/強化アイテムの能動使用、マップ上の任意寄り道、" +
  "徘徊エリートの移動後の接触結果（知覚判定は実helper経由で計測）、" +
  "人間の敵別判断（固定閾値で代理）"
);
console.log(
  "エリートモデル: generateRunFloor→実配置。avoid=初期セルを塞ぐ最短路の追加歩数、" +
  "engage=初期位置へ寄り道して実round/reward経路で各階1戦"
);
console.log(
  "感度指定: FLEE_POLICY=threshold|never|ev / FLEE_HP_THRESHOLD / HEAL_POTION_THRESHOLD, " +
  "STATUS_CURE_POLICY=smart|never / STATUS_CURE_HP_THRESHOLD / " +
  "STATUS_CURE_MERCHANT_POLICY=missing|never, " +
  "PORTAL_HP_THRESHOLD / PORTAL_MAX_HEAL_POTIONS / PORTAL_MIN_FLOOR; " +
  "ELITE_POLICY=avoid|engage / TRAP_POLICY=disabled|legacy|conservative / " +
  "TRAP_AVOIDANCE_POLICY=legacy|ev; " +
  "SIM_SCENARIOS=workshop-empty,workshop-stats,workshop-gear,workshop-blood-wand," +
  "workshop-blood-wand-spells,workshop-core-pools," +
  "workshop-complete;旧ID=workshop-locked|workshop-unlocked"
);
console.log(
  `core呪い設定: 実生成はIDENTIFICATION_BALANCE.baseCurseChance=${IDENTIFICATION_BALANCE.baseCurseChance}` +
  `+floor slope+coreCurseBonus=${IDENTIFICATION_BALANCE.coreCurseBonus}（上限=${IDENTIFICATION_BALANCE.maxCurseChance}）; ` +
  "legacyのみ呪い除外、powder/gambleは実生成呪いを適用"
);
console.log("逃走=常時成功（自ターン到達時）、先行攻撃＋離脱時追撃1発、報酬なし、探索継続");
console.log("時間単位: 1歩=1、1戦闘ターン=3");
console.log("撤退=100% bank、死亡=30% bank");
ACTIVE_IDENTIFICATION_POLICIES.forEach(policy => {
  ACTIVE_SCENARIOS.forEach(scenario => {
    printCoreScoringProfile(
      coreScoringProfilesByScenario[`${policy.id}:${scenario.id}`],
      { ...policy, label: `${policy.label} / ${scenario.label}` }
    );
  });
});

const taskResults = calibratedTaskResults.map(result => result.results);
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
  printClassOutcomeMetrics(results.find(result => result.targetDepth === 20));
  printB5GateDiagnostics(results.find(result => result.targetDepth === 20));
  results.forEach(result => {
    printTrapMetrics(result);
    printConsumableSummary(result);
  });
  console.log(`\n【${scenario.label} 徘徊エリート】`);
  printEliteMetrics(results);
  printIdentificationMetrics(results, policy);
  console.log(`\n【${scenario.label} B1開始 ビルド供給】`);
  printBuildSupplyMetrics(results);
  printWorkshopEffects(results.at(-1));
  printCurseGenerationMetrics(results.at(-1));
  printCoreRetentionDetail(results.at(-1));
  printFloorMilestoneMetrics(results.at(-1));

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
  milestoneResults.forEach(result => {
    printTrapMetrics(result);
    printConsumableSummary(result);
  });
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

printMpScarcityMetrics(resultsByPolicy);

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

const allMeasuredResults = resultsByPolicy.flatMap(({ scenarioResults, milestoneResults }) => [
  ...scenarioResults.flatMap(({ results }) => results),
  ...milestoneResults
]);
// scenarioResults と milestoneResults を合算し双方に一律 RUNS_PER_CASE を掛けるため、
// 同一runが両方の集計に現れる場合は延べの推定値になる（実際の発火回数と一致しない）。
// 0/非0の判別が目的でありこの用途では実害はないが、ラベルは延べと分かる語にする。
const sumAcrossResults = field => Math.round(
  allMeasuredResults.reduce((sum, result) => sum + (result[field] || 0) * RUNS_PER_CASE, 0)
);
reportMechanismFiring({
  "罠-遭遇": sumAcrossResults("averageTrapEncounters"),
  "罠-解除": sumAcrossResults("averageTrapDisarms"),
  "罠-発動(被弾)": sumAcrossResults("averageTrapActivations"),
  "罠-被害HP": sumAcrossResults("averageTrapDamageHp"),
  "火炎の罠-発動": sumAcrossResults("averageFlameTrapActivations"),
  "火炎の罠-予告回避": sumAcrossResults("averageFlameTrapWarningAvoided"),
  "消耗品-傷薬使用": sumAcrossResults("averageHealPotionsUsed"),
  "野営-休息": sumAcrossResults("averageCampRestCount"),
  "帰還の翼-使用": sumAcrossResults("averageTownPortalsUsed"),
  "鑑定-実施回数": sumAcrossResults("averageIdentificationCount")
}, { label: "配線検査（延べ推定）" });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runDepthMaterialSimulation();
}
