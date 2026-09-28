import {
  getCharAttackBreakdown,
  getCharDef,
  getCharDerivedStats,
  getCharMaxHp,
  getCharMaxMp
} from "./rules/character_stats.js";
import { getCharAffixSum, getItemBaseId, getItemData, getPartyMaxAffix } from "./rules/item_rules.js";
import { ITEMS } from "./data/items.js";
import { MONSTERS } from "./data/monsters.js";
import { SPELLS } from "./data/spells.js";
import {
  CORE_AFFIXES,
  getAffixDefinition,
  getAffixKind,
  getLootRoleSupply,
  LOOT_BUILD_ROLES,
  LOOT_ROLE_SUPPLY_BY_BAND
} from "./data/affixes.js";
import { EQUIPMENT_SLOTS } from "./rules/equipment_slots.js";
import { DIR_NAMES } from "./constants/directions.js";
import { buildCombatDecisionPayload } from "./telemetry_combat_decision.ts";
import { buildExplorationDecisionPayload } from "./telemetry_exploration_decision.ts";
import { buildLoadoutTransactionPayload } from "./telemetry_loadout_transaction.ts";
import { buildEquipmentDecisionPayload } from "./telemetry_equipment_decision.ts";
import { buildBuildShiftPayload } from "./telemetry_build_shift.ts";
import { buildEliteDecisionPayload } from "./telemetry_elite_decision.ts";
import { buildPortalDecisionPayload } from "./telemetry_portal_decision.ts";
import {
  buildValuableLocationPayload,
  normalizeValuableLocationIdentity
} from "./telemetry_valuable_location.ts";
import {
  buildStairsDiscoveryPayload,
  normalizeStairsDiscoveryIdentity
} from "./telemetry_stairs_discovery.ts";
import { buildFloorExplorationPayload } from "./telemetry_floor_exploration.ts";
import { buildLootStakeSnapshotPayload } from "./telemetry_loot_stake_snapshot.ts";
import { buildBleedingEventTelemetry } from "./telemetry_bleeding_event.ts";
import { EVENT_TYPES, EVENT_SUBMENU_TYPES } from "./constants/events.js";
import { CHEST_SMASH_REWARD_LOSS_CHANCE_BY_CATEGORY } from "./rules/chest_rules.js";
import { getBuffTotal } from "./combat_logic/status_effects.js";
import { INVENTORY_CAPACITY } from "./rules/item_inventory.js";
import { getWeaponBehaviorProfile } from "./data/weapon_behavior_profiles.js";
import { getActiveRuneSpellKeys, getRuneItemId } from "./rules/magic_rules.js";
import { RUNE_SUPPLY_BANDS, RUNES } from "./data/magic.js";
import { resolveBuildSnapshot } from "./rules/build_snapshot.js";
import { buildObjectLootStakeSnapshot } from "./rules/object_loot_stake.js";
import { isStartingKitId } from "./state/starting_kit.js";
import { isKnownDeathType } from "./state/death_logs.js";
import {
  boundedFiniteOrNull,
  MAX_TELEMETRY_RESOURCE_VALUE as MAX_RESOURCE_VALUE,
  normalizeBoundedEnumArray,
  normalizeOptionalStableValue,
  normalizeStableValue
} from "./telemetry_normalization.ts";
import {
  attachTelemetryClient,
  captureTelemetryEvent,
  disableTelemetry,
  isTelemetryAvailable,
  setTelemetryClientForTests,
  setTelemetryInitializationForTests,
  setTelemetryState
} from "./telemetry_capture.ts";

// v2 changes the legacy run_end deathCause value from arbitrary cause text to a
// bounded category and bounds migrated snapshot values before capture.
export const TELEMETRY_SCHEMA_VERSION = 2;

const VALID_OUTCOMES = new Set(["death", "retreat", "abandon"]);
const VALID_COMBAT_RESULTS = new Set([
  "victory",
  "fled",
  "escape_to_town",
  "gameover",
  "other"
]);
const SNAPSHOT_STAT_KEYS = [
  "spellGuard",
  "poisonWard",
  "firstStrike",
  "antiDragon",
  "antiUndead",
  "arcane",
  "spellPower",
  "devotion",
  "treasureSense",
  "trapBonus",
  "trapGuard",
  "hearRange",
  "traceRead"
];
const SAFE_STATUSES = new Set(["ok", "poisoned", "blind", "paralyzed", "paralyze", "sleep", "dead", "ash"]);
const SAFE_CELL_TYPES = new Set(["empty", "floor", "stairs-up", "stairs-down", "pitfall", "room"]);
const SAFE_CELL_EVENTS = new Set([
  ...Object.values(EVENT_TYPES),
  "merchant",
  "explore_management",
  "stairs-down"
]);
const SAFE_GAME_STATES = new Set([
  "town",
  "explore",
  "combat",
  "chest",
  "victory",
  "gameover",
  "submenu",
  "trap_encounter",
  "equip_overlay",
  "result"
]);
const SAFE_COMBAT_PHASES = new Set(["choose_actions", "resolving"]);
const SAFE_ATTACK_TYPES = new Set(["physical", "normal", "spell", "breath", "special", "flee", "reflect", "counter", "other"]);
const SAFE_GUARD_PROFILE_IDS = new Set(["universal_brace", "light", "physical", "arcane", "dragon", "aegis"]);
const SAFE_WEAPON_BEHAVIOR_PROFILE_IDS = new Set(["light", "blade", "impact", "heavy", "medium"]);
// Keep this in sync with the production codex progression in
// src/state/codex_state.js.
const SAFE_RARITIES = new Set(["common", "magic", "rare", "epic", "legendary"]);
const SAFE_BLEEDING_EVENTS = new Set(["failed", "applied", "refresh", "cleared", "triggered", "expired"]);
const SAFE_BLEEDING_REASONS = new Set([
  "trigger-roll", "defeat", "spell", "flee", "self-destruct", "counterattack", "duration"
]);
const SAFE_BLEEDING_SOURCES = new Set(["bleedingAtk"]);
const SAFE_VULNERABLE_EVENTS = new Set(["attempt", "applied", "refresh", "consumed", "expired", "cleared"]);
const SAFE_VULNERABLE_REASONS = new Set(["duration", "defeat", "flee", "self-destruct", "counterattack", "death", "spell"]);
const SAFE_VULNERABLE_SOURCES = new Set(["VULNERA"]);
const SAFE_VULNERABLE_HIT_TYPES = new Set(["physical", "spell"]);
const SAFE_COMPARISON_STAT_KEYS = new Set([
  "attack", "defense", "maxHp", "maxMp", "str", "int", "pie", "vit", "agi", "luk",
  "magic", "healing", "speed", "trap", "treasure", "spellGuard", "antiDragon",
  "antiUndead", "firstStrike", "poisonWard", "poisonAtk", "trapBonus", "trapGuard",
  "treasureSense", "hearRange", "traceRead", "arcaneSense"
]);
const SAFE_RETURN_REASONS = new Set([
  "gameover",
  "abandon",
  "escape_scroll",
  ...EVENT_SUBMENU_TYPES.filter(type => type.endsWith("_portal"))
]);
const SAFE_ENEMY_IDS = new Set(MONSTERS.map(monster => monster.name));
const SAFE_SPELL_TARGET_TYPES = new Set(
  Object.values(SPELLS)
    .map(spell => spell.target)
    .filter(target => typeof target === "string")
);
const SAFE_DIRECTIONS = new Set(DIR_NAMES.map((_, index) => index));
const SAFE_CHEST_REWARD_ROLES = new Set(["main", "special", "accessory"]);
const SAFE_CHEST_REWARD_CATEGORIES = new Set(Object.keys(CHEST_SMASH_REWARD_LOSS_CHANCE_BY_CATEGORY));
const SAFE_CHEST_ACTIONS = new Set(["open", "leave", "disarm", "trap_kit", "smash"]);
const SAFE_CHEST_TRAPS = new Set(["none", "poison needle", "gas bomb", "teleporter", "flash bomb"]);
const SAFE_TRAP_OUTCOMES = new Set(["observed", "disarmed", "avoided", "triggered"]);
const SAFE_TRAP_SOURCES = new Set(["floor", "chest", "flame"]);
const SAFE_TRAP_ACTIONS = new Set([
  "detect", "inspect", "disarm", "force", "move", "trap_kit", "open", "smash", "leave", "trigger", "hidden"
]);
const SAFE_TRAP_TYPES = new Set([
  "none", "damage", "mpDrain", "alarm", "pitfall",
  "poison needle", "gas bomb", "teleporter", "flash bomb"
]);
const SAFE_TRAP_TOOL_IDS = new Set(["TRAP_KIT", "TRAP_SENSE_STONE"]);
const SAFE_CORE_IDS = new Set(CORE_AFFIXES.map(affix => affix.id));
const SAFE_CHEST_AURAS = new Set(["weak", "medium", "strong"]);
const SAFE_BUILD_ROLES = new Set(Object.values(LOOT_BUILD_ROLES));
const SAFE_LOOT_STAGES = new Set([
  "found", "bagged", "tried", "identified", "adopted", "discarded",
  "banked", "salvaged", "lost", "consumed", "rejected", "left"
]);
const SAFE_LOOT_SOURCES = new Set([
  "combat", "chest", "merchant", "workshop", "departure-craft", "dungeon", "other"
]);
const SAFE_LOOT_OWNERSHIPS = new Set(["town", "dungeon", "unbanked", "unknown"]);
const SAFE_LOOT_TIERS = new Set([
  ...LOOT_ROLE_SUPPLY_BY_BAND.map(band => band.id),
  ...RUNE_SUPPLY_BANDS.map(band => band.id)
]);
const SAFE_PORTAL_TYPES = new Set(["milestone_portal", "town_portal", "return_wing"]);
const SAFE_PORTAL_DECISIONS = new Set(["push", "return"]);
const SAFE_BAND_TRIAL_IDS = new Set([
  "short_battle", "many_battles", "endurance", "opening", "status", "resource",
  "introduction", "development", "change", "temptation", "settlement"
]);
const SAFE_ELITE_DECISIONS = new Set(["spawn", "approach", "pursue", "avoid", "contact", "clear", "flee", "death"]);
const SAFE_ELITE_CONTACT_MODES = new Set(["player_step", "elite_step", "combat", "unknown"]);
const SAFE_LOCATION_TYPES = new Set(["chest", "stairs-down", "return-portal", "merchant"]);
const SAFE_LOCATION_ACTIONS = new Set(["discovered", "opened", "skipped", "used", "visited"]);
const SAFE_LOOT_SNAPSHOT_POINTS = new Set([
  "pending_reward_resolution",
  "portal_decision",
  "return_execution",
  "wing_salvage_before",
  "terminal_settlement_before",
  "terminal_settlement_after"
]);
const SAFE_LOOT_CATEGORIES = new Set(["equipment", "rune", "consumable", "other"]);
const SAFE_LOOT_LOCATIONS = new Set(["bag", "equipped", "active_rune", "other"]);
const SAFE_EQUIPMENT_SLOTS = new Set(["weapon", "shield", "armor", "accessory", "other"]);
const SAFE_WEAPON_BEHAVIORS = new Set(["light", "blade", "impact", "heavy", "medium", "other"]);
const SAFE_IDENTIFICATION_STAGES = new Set(["unknown", "discovery", "observation", "trial", "full"]);
const SAFE_UX_SURFACES = new Set(["equipment", "portal", "wing", "combat_target"]);
const SAFE_UX_RESOLUTIONS = new Set(["commit", "back", "cancel"]);
const SAFE_UX_REVISIT_BUCKETS = new Set(["none", "immediate", "short"]);
const UX_REVISIT_IMMEDIATE_MS = 2_000;
const UX_REVISIT_SHORT_MS = 30_000;
const SAFE_RUNE_SUPPLY_BANDS = new Set([
  ...RUNE_SUPPLY_BANDS.map(band => band.id),
  "other"
]);
const LOOT_VALUE_BY_RARITY = Object.freeze({ common: 1, magic: 2, rare: 4, epic: 7, legendary: 12 });
const MAX_ENEMY_SNAPSHOT = 8;
const MAX_AFFIX_SNAPSHOT = 24;

let pendingCombatDecisions = [];
let runId = null;
let combatId = null;
let combatEnded = false;
let fallbackIdCounter = 0;
let semanticEventKeys = new Set();
let discoveredStairKeys = new Set();
let exploredFloorKeys = new Set();
let stairsStepByFloor = new Map();
let uxDecisionStates = new Map();

function getPublicEnv() {
  return import.meta.env ?? {};
}

export function resolvePostHogApiHost(configuredHost, { isProduction = Boolean(getPublicEnv().PROD) } = {}) {
  const host = typeof configuredHost === "string" ? configuredHost.trim() : "";
  if (!host) return "";

  // Production uses the same-origin Vercel proxy to avoid Safari/WebKit CORS failures.
  return isProduction ? "/ingest" : host;
}

function createRuntimeId(prefix) {
  const randomUuid = globalThis.crypto?.randomUUID;
  if (typeof randomUuid === "function") {
    return `${prefix}_${randomUuid.call(globalThis.crypto)}`;
  }

  const randomValues = globalThis.crypto?.getRandomValues;
  if (typeof randomValues === "function") {
    const bytes = randomValues.call(globalThis.crypto, new Uint8Array(16));
    const suffix = [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
    return `${prefix}_${suffix}`;
  }

  fallbackIdCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${fallbackIdCounter.toString(36)}`;
}

function normalizeStatus(status) {
  return SAFE_STATUSES.has(status) ? status : "other";
}

function normalizeRarity(value) {
  return normalizeOptionalStableValue(value, SAFE_RARITIES);
}

function getSafeItemId(itemKey) {
  if (itemKey === null || itemKey === undefined || itemKey === "") return null;
  const id = getItemBaseId(itemKey);
  const isKnownItem = typeof id === "string"
    && (Object.hasOwn(ITEMS, id) || Object.hasOwn(RUNES, id));
  return isKnownItem ? id : "other";
}

function getLootSupplyFields(itemKey, floor = null) {
  const itemId = getSafeItemId(itemKey);
  const rune = RUNES[itemId];
  const lootRole = normalizeOptionalStableValue(itemKey?.lootRole, SAFE_BUILD_ROLES);
  const itemType = getItemData(itemKey)?.type;
  const equipmentFloor = itemKey?.level ?? floor;
  const equipmentSupplyTier = itemKey
    && equipmentFloor !== null
    && equipmentFloor !== undefined
    && ["weapon", "armor", "shield", "accessory"].includes(itemType)
    ? getLootRoleSupply(equipmentFloor).id
    : null;
  const lootTier = normalizeOptionalStableValue(
    itemKey?.lootTier ?? itemKey?.supplyTier ?? itemKey?.supplyBand
      ?? rune?.supplyTier ?? equipmentSupplyTier,
    SAFE_LOOT_TIERS
  );
  return {
    lootRole,
    lootTier,
    runeSupplyBand: normalizeOptionalStableValue(rune?.supplyBand, SAFE_LOOT_TIERS)
  };
}

function getSafeSpellId(spellKey) {
  if (spellKey === null || spellKey === undefined || spellKey === "") return null;
  return typeof spellKey === "string" && Object.hasOwn(SPELLS, spellKey) ? spellKey : "other";
}

function normalizeVulnerableBuildKey(value) {
  return value === "VULNERA" ? value : "other";
}

function getItemCategory(itemKey) {
  const id = getSafeItemId(itemKey);
  const item = getItemData(itemKey);
  if (!item || !id || id === "other") return "other";
  if (item.type === "weapon" || item.type === "shield" || item.type === "armor" || item.type === "accessory") {
    return "equipment";
  }
  if (item.type === "quest") return "quest";
  if (item.type !== "usable") return "other";
  if (["HEAL_POTION", "GREATER_HEAL", "HOLY_WATER", "ELIXIR"].includes(id)) return "healing";
  if (["ANTIDOTE", "EYE_DROPS", "PARALYZE_CURE", "WAKE_POWDER", "PANACEA", "HOLY_WATER", "ELIXIR"].includes(id)) return "cure";
  if (["MANA_POTION", "ETHER"].includes(id)) return "mana";
  if (["TOWN_PORTAL", "ESCAPE_SCROLL"].includes(id)) return "return";
  if (item.combatOnly) return "combat";
  return "utility";
}

function getReturnWingCount(stateSnapshot) {
  const inventory = Array.isArray(stateSnapshot?.inventory) ? stateSnapshot.inventory : [];
  return inventory.filter(itemKey => getSafeItemId(itemKey) === "TOWN_PORTAL").length;
}

function getAffixSummary(itemKey) {
  const affixes = itemKey && typeof itemKey === "object" && Array.isArray(itemKey.affixes)
    ? itemKey.affixes.slice(0, MAX_AFFIX_SNAPSHOT)
    : [];
  const normalizedTypes = affixes.map(affix => {
    const definition = getAffixDefinition(affix);
    return definition?.id || "other";
  });
  return {
    count: affixes.length,
    coreCount: affixes.filter(affix => getAffixKind(affix) === "core").length,
    supportCount: affixes.filter(affix => getAffixKind(affix) === "support").length,
    types: [...new Set(normalizedTypes)].slice(0, 8)
  };
}

function getEquipmentBuildRole(itemKey) {
  if (!itemKey || typeof itemKey !== "object") return null;
  const affixes = Array.isArray(itemKey.affixes) ? itemKey.affixes : [];
  const coreRole = affixes
    .filter(affix => getAffixKind(affix) === "core")
    .map(affix => getAffixDefinition(affix)?.buildRole)
    .find(role => SAFE_BUILD_ROLES.has(role));
  return coreRole || affixes
    .map(affix => getAffixDefinition(affix)?.buildRole)
    .find(role => SAFE_BUILD_ROLES.has(role))
    || (SAFE_BUILD_ROLES.has(itemKey.buildRole) ? itemKey.buildRole : null);
}

function getEquipmentMainAxisIds(itemKey) {
  return new Set((itemKey && typeof itemKey === "object" && Array.isArray(itemKey.affixes)
    ? itemKey.affixes
    : [])
    .filter(affix => getAffixKind(affix) === "core")
    .filter(affix => getAffixDefinition(affix)?.buildAxis === "main")
    .map(affix => getAffixDefinition(affix)?.id || affix.id || affix.type));
}

function isBuildTransition(action, candidateKey, currentKey) {
  if (action !== "equip") return false;
  const candidateAxes = getEquipmentMainAxisIds(candidateKey);
  const currentAxes = getEquipmentMainAxisIds(currentKey);
  return candidateAxes.size !== currentAxes.size
    || [...candidateAxes].some(axis => !currentAxes.has(axis));
}

export function buildPlayerSnapshot(character, { floor = 1 } = {}) {
  if (!character) return {};
  const status = normalizeStatus(character.status);
  let derived = {};
  let attack = {};
  try {
    derived = getCharDerivedStats(character, { floor });
    attack = getCharAttackBreakdown(character);
  } catch {
    // Malformed optional state must never interfere with gameplay.
  }
  const snapshot = {
    startingKit: character.startingKit === null || character.startingKit === undefined || character.startingKit === ""
      ? null
      : isStartingKitId(character.startingKit) ? character.startingKit : "other",
    level: boundedFiniteOrNull(character.level),
    hp: boundedFiniteOrNull(character.hp),
    maxHp: boundedFiniteOrNull(getCharMaxHp(character)),
    mp: boundedFiniteOrNull(character.mp),
    maxMp: boundedFiniteOrNull(getCharMaxMp(character)),
    status,
    statuses: [status],
    statusCount: status === "ok" ? 0 : 1,
    attack: boundedFiniteOrNull(derived.attack ?? attack.total),
    attackBase: boundedFiniteOrNull(attack.base),
    attackEquipment: boundedFiniteOrNull(attack.equipment),
    weaponBehaviorProfileId: normalizeStableValue(
      getWeaponBehaviorProfile(character).id,
      SAFE_WEAPON_BEHAVIOR_PROFILE_IDS
    ),
    defense: boundedFiniteOrNull(derived.defense),
    magic: boundedFiniteOrNull(derived.magic),
    healing: boundedFiniteOrNull(derived.healing),
    speed: boundedFiniteOrNull(derived.speed),
    trap: boundedFiniteOrNull(derived.trap),
    treasure: boundedFiniteOrNull(derived.treasure)
  };
  snapshot.hpRate = snapshot.maxHp > 0
    ? Math.min(1, Math.max(0, snapshot.hp / snapshot.maxHp))
    : null;
  snapshot.mpRate = snapshot.maxMp > 0
    ? Math.min(1, Math.max(0, snapshot.mp / snapshot.maxMp))
    : null;
  SNAPSHOT_STAT_KEYS.forEach(key => {
    snapshot[`affix${key[0].toUpperCase()}${key.slice(1)}`] = boundedFiniteOrNull(getCharAffixSum(character, key), -MAX_RESOURCE_VALUE);
  });
  return snapshot;
}

export function buildEquipmentSnapshot(character) {
  const equipment = EQUIPMENT_SLOTS.map(({ id: slot }) => {
    const itemKey = character?.equipment?.[slot] ?? null;
    const item = getItemData(itemKey);
    const affixSummary = getAffixSummary(itemKey);
    return {
      slot: normalizeStableValue(slot, new Set(EQUIPMENT_SLOTS.map(entry => entry.id))),
      id: getSafeItemId(itemKey),
      rarity: itemKey?.identified === true ? normalizeRarity(itemKey?.rarity ?? item?.rarity) : null,
      identified: itemKey == null || typeof itemKey !== "object" || itemKey.identified === true,
      enhancementLevel: boundedFiniteOrNull(itemKey?.enhanceLevel ?? 0, -MAX_RESOURCE_VALUE),
      affixCount: affixSummary.count,
      coreAffixCount: affixSummary.coreCount,
      supportAffixCount: affixSummary.supportCount,
      affixTypes: affixSummary.types,
      cursed: Boolean(itemKey?.curseEffectId || itemKey?.curseLocked)
    };
  });
  const activeRuneIds = getActiveRuneSpellKeys(character)
    .map(getRuneItemId)
    .filter(Boolean);
  return {
    equipmentIds: equipment.map(item => item.id),
    equipmentSlots: equipment.map(item => item.slot),
    equipmentRarities: equipment.map(item => item.rarity),
    equipmentIdentified: equipment.map(item => item.identified),
    equipmentEnhancementLevels: equipment.map(item => item.enhancementLevel),
    equipmentAffixCounts: equipment.map(item => item.affixCount),
    equipmentCoreAffixCounts: equipment.map(item => item.coreAffixCount),
    equipmentSupportAffixCounts: equipment.map(item => item.supportAffixCount),
    equipmentAffixTypes: equipment.flatMap(item => item.affixTypes).slice(0, 24),
    equipmentCursed: equipment.map(item => item.cursed),
    activeRuneIds
  };
}

export function buildResourceSnapshot(stateSnapshot) {
  const inventory = Array.isArray(stateSnapshot?.inventory)
    ? stateSnapshot.inventory.slice(0, INVENTORY_CAPACITY)
    : [];
  const categoryCounts = inventory.reduce((counts, itemKey) => {
    const category = getItemCategory(itemKey);
    counts[category] = (counts[category] || 0) + 1;
    return counts;
  }, {});
  const materials = stateSnapshot?.currentRun?.materials || {};
  const metaMaterials = stateSnapshot?.metaMaterials || {};
  return {
    inventoryCount: inventory.length,
    inventoryCapacity: INVENTORY_CAPACITY,
    inventoryEquipmentCount: categoryCounts.equipment || 0,
    inventoryQuestCount: categoryCounts.quest || 0,
    inventoryConsumableCount: inventory.length - (categoryCounts.equipment || 0) - (categoryCounts.quest || 0),
    consumableHealingCount: categoryCounts.healing || 0,
    consumableCureCount: categoryCounts.cure || 0,
    consumableManaCount: categoryCounts.mana || 0,
    consumableReturnCount: categoryCounts.return || 0,
    consumableWingCount: getReturnWingCount(stateSnapshot),
    consumableEscapeScrollCount: inventory.filter(itemKey => getSafeItemId(itemKey) === "ESCAPE_SCROLL").length,
    consumableCombatCount: categoryCounts.combat || 0,
    consumableUtilityCount: categoryCounts.utility || 0,
    inventoryFreeSlots: Math.max(0, INVENTORY_CAPACITY - inventory.length),
    inventoryComposition: Object.fromEntries(
      Object.entries(categoryCounts).map(([category, count]) => [category, boundedFiniteOrNull(count)])
    ),
    identifyTickets: boundedFiniteOrNull(stateSnapshot?.identifyTickets),
    runMaterialCount: boundedFiniteOrNull(Object.values(materials).slice(0, INVENTORY_CAPACITY).reduce((sum, value) => sum + (Number(value) || 0), 0)),
    metaMaterialCount: boundedFiniteOrNull(Object.values(metaMaterials).slice(0, INVENTORY_CAPACITY).reduce((sum, value) => sum + (Number(value) || 0), 0))
  };
}

export function buildEnvironmentSnapshot(stateSnapshot, combat = null) {
  const cell = stateSnapshot?.map?.[stateSnapshot?.y]?.[stateSnapshot?.x];
  const run = stateSnapshot?.currentRun;
  const monsters = (combat?.monsters || stateSnapshot?.combatState?.monsters || []).slice(0, MAX_ENEMY_SNAPSHOT);
  return {
    floor: boundedFiniteOrNull(stateSnapshot?.floor ?? combat?.floor),
    gameState: normalizeOptionalStableValue(stateSnapshot?.gameState, SAFE_GAME_STATES),
    currentCellType: normalizeStableValue(cell?.type, SAFE_CELL_TYPES),
    currentCellEvent: normalizeStableValue(cell?.event, SAFE_CELL_EVENTS),
    runDeepestFloor: boundedFiniteOrNull(run?.deepestFloor),
    runSteps: boundedFiniteOrNull(run?.steps),
    runBattles: boundedFiniteOrNull(run?.battles),
    runChestsOpened: boundedFiniteOrNull(run?.chestsOpened),
    runTrapsTriggered: boundedFiniteOrNull(run?.trapsTriggered),
    silenceTurns: boundedFiniteOrNull(stateSnapshot?.silenceTurns),
    forcedEncounterSteps: boundedFiniteOrNull(stateSnapshot?.forcedEncounterSteps),
    enemyIds: monsters.map(monster => normalizeEnemyId(monster?.name)),
    enemyCount: monsters.length,
    enemyAliveCount: monsters.filter(monster => monster?.hp > 0 && !monster?.fled).length,
    enemyBossFlags: monsters.map(monster => Boolean(monster?.isBoss || monster?.boss)),
    isBoss: Boolean(combat?.isBoss ?? stateSnapshot?.combatState?.isBoss),
    isMidboss: Boolean(combat?.isMidboss ?? stateSnapshot?.combatState?.isMidboss),
    isRoamingFlack: Boolean(combat?.isRoamingFlack ?? stateSnapshot?.combatState?.isRoamingFlack),
    combatRound: boundedFiniteOrNull(stateSnapshot?.combatState?.roundNumber ?? combat?.roundNumber),
    combatPhase: normalizeOptionalStableValue(stateSnapshot?.combatState?.phase, SAFE_COMBAT_PHASES)
  };
}

export function buildDecisionContext({ state: stateSnapshot = null, character = null, combat = null } = {}) {
  const actor = character || stateSnapshot?.party?.[0];
  return {
    ...buildPlayerSnapshot(actor, { floor: stateSnapshot?.floor ?? combat?.floor ?? 1 }),
    buildSnapshot: resolveBuildSnapshot(actor, { party: stateSnapshot?.party }),
    ...buildEquipmentSnapshot(actor),
    ...buildResourceSnapshot(stateSnapshot),
    ...buildEnvironmentSnapshot(stateSnapshot, combat)
  };
}

// Exploration telemetry deliberately omits class, level, and combat stats.
// Those dimensions remain valid for combat events, but they must not become a
// hidden permission or identity for universal exploration verbs.
export function buildExplorationContext({ state: stateSnapshot = null, character = null } = {}) {
  const actor = character || stateSnapshot?.party?.find(char => char?.hp > 0) || stateSnapshot?.party?.[0];
  const player = buildPlayerSnapshot(actor, { floor: stateSnapshot?.floor ?? 1 });
  const playerKeys = [
    "hp", "maxHp", "mp", "maxMp", "hpRate", "mpRate", "status", "statuses", "statusCount",
    "affixTrapBonus", "affixTrapGuard", "affixTreasureSense", "affixHearRange", "affixTraceRead",
    "affixArcaneSense"
  ];
  return {
    ...Object.fromEntries(playerKeys
      .filter(key => Object.hasOwn(player, key))
      .map(key => [key, player[key]])),
    buildSnapshot: resolveBuildSnapshot(actor, { party: stateSnapshot?.party }),
    ...buildEquipmentSnapshot(actor),
    ...buildResourceSnapshot(stateSnapshot),
    ...buildEnvironmentSnapshot(stateSnapshot)
  };
}

function safeExplorationContext(options) {
  try {
    return buildExplorationContext(options);
  } catch {
    return {};
  }
}

function normalizeTrapType(trap) {
  const type = typeof trap === "string" ? trap : trap?.type;
  return normalizeStableValue(type || "none", SAFE_TRAP_TYPES);
}

function normalizeTrapSource(source) {
  return normalizeStableValue(source, SAFE_TRAP_SOURCES);
}

function getExplorationCoreIds(party = []) {
  const ids = [];
  party.slice(0, MAX_ENEMY_SNAPSHOT).forEach(character => {
    Object.values(character?.equipment || {}).forEach(itemKey => {
      if (!itemKey || typeof itemKey !== "object" || !Array.isArray(itemKey.affixes)) return;
      itemKey.affixes.forEach(affix => {
        const definition = getAffixDefinition(affix);
        if (getAffixKind(affix) !== "core") return;
        const id = definition?.id || affix?.id || affix?.type;
        ids.push(SAFE_CORE_IDS.has(id) ? id : "other");
      });
    });
  });
  return [...new Set(ids)].slice(0, MAX_AFFIX_SNAPSHOT);
}

function buildTrapBuildSnapshot(stateSnapshot, character) {
  const party = Array.isArray(stateSnapshot?.party) ? stateSnapshot.party : [];
  const actor = character || party.find(char => char?.hp > 0) || party[0] || null;
  const maxAffix = type => getPartyMaxAffix(party, type);
  const inventory = Array.isArray(stateSnapshot?.inventory) ? stateSnapshot.inventory : [];
  const coreIds = getExplorationCoreIds(party);
  return {
    trapBonus: boundedFiniteOrNull(actor ? getCharAffixSum(actor, "trapBonus") : 0, -100, 100),
    trapGuard: boundedFiniteOrNull(maxAffix("trapGuard"), 0, 100),
    detectionSupport: boundedFiniteOrNull(maxAffix("traceRead"), 0, 100),
    treasureSense: boundedFiniteOrNull(maxAffix("treasureSense"), -100, 100),
    hearRange: boundedFiniteOrNull(maxAffix("hearRange"), 0, 100),
    traceRead: boundedFiniteOrNull(maxAffix("traceRead"), 0, 100),
    trapKitCount: boundedFiniteOrNull(inventory.filter(item => getSafeItemId(item) === "TRAP_KIT").length, 0, INVENTORY_CAPACITY),
    availableToolIds: [...new Set(inventory
      .map(item => getSafeItemId(item))
      .filter(item => SAFE_TRAP_TOOL_IDS.has(item)))],
    coreIds,
    coreTrapEater: coreIds.includes("CORE_TRAP_EATER"),
    coreTombRaider: coreIds.includes("CORE_TOMB_RAIDER")
  };
}

export function normalizeEnemyId(name) {
  const normalized = String(name ?? "").replace(/\s[A-Z]$/, "").trim();
  return SAFE_ENEMY_IDS.has(normalized) ? normalized : "other";
}

function normalizeEliteId(elite) {
  const id = typeof elite?.id === "string" ? elite.id.trim() : "";
  if (/^RUN_ELITE_B\d+$/.test(id)) return id;
  return normalizeEnemyId(elite?.name);
}

export function normalizeOutcome(outcome) {
  return VALID_OUTCOMES.has(outcome) ? outcome : null;
}

export function normalizeCombatResult(result) {
  const normalized = {
    endCombat: "victory",
    fleeCombat: "fled",
    escapeToTown: "escape_to_town",
    runEscape: "fled",
    milestoneVictory: "victory",
    giveKey: "victory",
    triggerChest: "victory"
  }[result] ?? result;
  return VALID_COMBAT_RESULTS.has(normalized) ? normalized : "other";
}

export function normalizeDeathType(type) {
  return isKnownDeathType(type) ? type : null;
}

function normalizeDeathCause(cause) {
  if (typeof cause !== "string") return null;
  const normalized = cause.trim();
  if (!normalized) return null;
  if (/毒|poison/i.test(normalized)) return "poison";
  if (/罠|trap|矢|火炎/i.test(normalized)) return "trap";
  if (/戦闘|combat|との戦闘/i.test(normalized)) return "combat";
  if (/泉|status|状態/i.test(normalized)) return "event_or_status";
  return "other";
}

function safeDecisionContext(options) {
  try {
    return buildDecisionContext(options);
  } catch {
    return {};
  }
}

function normalizeDefenseBreakdown(breakdown) {
  if (!breakdown || typeof breakdown !== "object") return {};
  const normalize = value => boundedFiniteOrNull(value, -MAX_RESOURCE_VALUE);
  return {
    baseDef: normalize(breakdown.baseDef ?? breakdown.equipmentDef),
    equipmentDef: normalize(breakdown.equipmentDef),
    buffDef: normalize(breakdown.buffDef),
    frontGuardDef: normalize(breakdown.frontGuardDef),
    firstStrikeDefense: normalize(breakdown.firstStrikeDefense),
    tempDefDown: normalize(breakdown.tempDefDown)
  };
}

function buildDefenseBreakdown(character, finalDef, damage) {
  if (!character || typeof character !== "object" || !Number.isFinite(Number(finalDef))) return null;
  const attackType = damage?.attackType;
  const isPhysical = attackType === "physical" || attackType === "flee" || (!attackType && !damage?.spell);
  if (!isPhysical) return null;

  try {
    const equipmentDef = getCharDef(character);
    const buffDef = attackType === "flee" ? 0 : getBuffTotal(character, "def");
    const tempDefDown = attackType === "flee" ? 0 : (character.tempDefDown || 0);
    const firstStrikeDefense = attackType === "physical" && character.combatFirstStrikeActive
      ? getCharAffixSum(character, "firstStrikeDefense")
      : 0;
    const frontGuardDef = attackType === "physical"
      ? Number(finalDef) - (equipmentDef + buffDef + firstStrikeDefense - tempDefDown)
      : 0;
    return {
      // The live formula's baseDef input is the player's effective equipment DEF;
      // there is no separate character-base DEF term in the current rules.
      baseDef: equipmentDef,
      equipmentDef,
      buffDef,
      frontGuardDef,
      firstStrikeDefense,
      tempDefDown
    };
  } catch {
    return null;
  }
}

function initializeTelemetry() {
  const env = getPublicEnv();
  const key = typeof env.VITE_POSTHOG_KEY === "string" ? env.VITE_POSTHOG_KEY.trim() : "";
  const configuredHost = typeof env.VITE_POSTHOG_HOST === "string" ? env.VITE_POSTHOG_HOST : "";
  const host = resolvePostHogApiHost(configuredHost);
  if (!key || !configuredHost.trim() || !host) {
    disableTelemetry();
    return;
  }

  setTelemetryState("loading");

  import("posthog-js")
    .then(({ posthog, default: defaultPosthog }) => {
      const sdk = posthog ?? defaultPosthog;
      if (!sdk || typeof sdk.init !== "function") throw new Error("PostHog SDK unavailable");
      sdk.init(key, {
        api_host: host,
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: true,
        disable_surveys: true,
        persistence: "memory"
      });
      attachTelemetryClient(sdk);
    })
    .catch(() => {
      disableTelemetry();
    });
}

function capture(eventName, properties) {
  captureTelemetryEvent(TELEMETRY_SCHEMA_VERSION, eventName, properties);
}

export function trackEvent(eventName, properties = {}) {
  capture(eventName, properties);
}

function normalizeLootStage(stage) {
  return normalizeStableValue(stage, SAFE_LOOT_STAGES);
}

function normalizeLootSource(source) {
  return normalizeStableValue(source, SAFE_LOOT_SOURCES);
}

function normalizeLootOwnership(ownership) {
  return normalizeStableValue(ownership, SAFE_LOOT_OWNERSHIPS);
}

function normalizeLootSequence(lootId, lootSequence) {
  const direct = Number.isInteger(lootSequence) ? lootSequence : null;
  if (direct !== null) return boundedFiniteOrNull(direct, 0, 100000);
  const match = typeof lootId === "string" ? lootId.match(/:loot:(\d+)$/) : null;
  return match ? boundedFiniteOrNull(match[1], 0, 100000) : null;
}

function getLootValueProxy(itemKey) {
  const item = getItemData(itemKey);
  const rarity = itemKey?.identified === true ? itemKey.rarity : item?.rarity;
  const base = LOOT_VALUE_BY_RARITY[rarity] || 1;
  return boundedFiniteOrNull(base + (getEquipmentBuildRole(itemKey) ? 1 : 0), 0, 100);
}

function getUnbankedLootSummary(stateSnapshot) {
  const entries = Array.isArray(stateSnapshot?.currentRun?.unbankedObjectLoot)
    ? stateSnapshot.currentRun.unbankedObjectLoot.filter(entry => entry?.item)
    : [];
  return {
    count: Math.min(INVENTORY_CAPACITY, entries.length),
    valueProxy: boundedFiniteOrNull(
      entries.slice(0, INVENTORY_CAPACITY).reduce((sum, entry) => sum + getLootValueProxy(entry.item), 0),
      0,
      MAX_RESOURCE_VALUE
    )
  };
}

function normalizeComposition(composition, allowedValues) {
  return Object.fromEntries([...allowedValues].map(key => [key, boundedFiniteOrNull(composition?.[key]) || 0]));
}

function normalizeStakeSnapshot(snapshot) {
  const details = (snapshot?.details || []).slice(0, INVENTORY_CAPACITY).map(detail => ({
    lootSequence: normalizeLootSequence(detail.lootSequence),
    itemId: getSafeItemId(detail.itemId),
    category: normalizeStableValue(detail.category, SAFE_LOOT_CATEGORIES),
    location: normalizeStableValue(detail.location, SAFE_LOOT_LOCATIONS),
    equipmentSlot: normalizeStableValue(detail.equipmentSlot, SAFE_EQUIPMENT_SLOTS),
    weaponBehavior: normalizeOptionalStableValue(detail.weaponBehavior, SAFE_WEAPON_BEHAVIORS),
    medium: Boolean(detail.medium),
    runeSupplyBand: normalizeOptionalStableValue(detail.runeSupplyBand, SAFE_RUNE_SUPPLY_BANDS),
    coreCount: boundedFiniteOrNull(detail.coreCount, 0, 10),
    supportCount: boundedFiniteOrNull(detail.supportCount, 0, 10),
    coreMainAxisCount: boundedFiniteOrNull(detail.coreMainAxisCount, 0, 10),
    coreAuxiliaryCount: boundedFiniteOrNull(detail.coreAuxiliaryCount, 0, 10),
    lootRole: normalizeOptionalStableValue(detail.lootRole, SAFE_BUILD_ROLES),
    affixLootRoles: normalizeComposition(detail.affixLootRoles, new Set(["reinforce", "convert", "pivot"])),
    identificationStage: normalizeStableValue(detail.identificationStage, SAFE_IDENTIFICATION_STAGES),
    cursed: Boolean(detail.cursed)
  }));
  return {
    unconfirmedObjectCount: boundedFiniteOrNull(snapshot?.unconfirmedObjectCount, 0, INVENTORY_CAPACITY),
    unconfirmedObjectIds: details.map(detail => detail.lootSequence).filter(value => value !== null),
    unconfirmedObjectComposition: normalizeComposition(snapshot?.composition?.category, SAFE_LOOT_CATEGORIES),
    unconfirmedObjectLocation: normalizeComposition(snapshot?.composition?.location, SAFE_LOOT_LOCATIONS),
    unconfirmedEquipmentSlots: normalizeComposition(snapshot?.composition?.equipmentSlot, SAFE_EQUIPMENT_SLOTS),
    unconfirmedWeaponBehaviors: normalizeComposition(snapshot?.composition?.weaponBehavior, SAFE_WEAPON_BEHAVIORS),
    unconfirmedLootRoles: normalizeComposition(snapshot?.composition?.lootRole, new Set(["reinforce", "convert", "pivot"])),
    identificationStageComposition: normalizeComposition(snapshot?.composition?.identificationStage, SAFE_IDENTIFICATION_STAGES),
    runeCount: boundedFiniteOrNull(snapshot?.runeCount, 0, INVENTORY_CAPACITY),
    activeRuneCount: boundedFiniteOrNull(snapshot?.activeRuneCount, 0, INVENTORY_CAPACITY),
    mediumCount: boundedFiniteOrNull(snapshot?.mediumCount, 0, INVENTORY_CAPACITY),
    shieldCount: boundedFiniteOrNull(snapshot?.shieldCount, 0, INVENTORY_CAPACITY),
    armorCount: boundedFiniteOrNull(snapshot?.armorCount, 0, INVENTORY_CAPACITY),
    runeSupplyBandComposition: normalizeComposition(snapshot?.runeSupplyBandComposition, SAFE_RUNE_SUPPLY_BANDS),
    coreCount: boundedFiniteOrNull(snapshot?.coreCount, 0, INVENTORY_CAPACITY * 10),
    supportCount: boundedFiniteOrNull(snapshot?.supportCount, 0, INVENTORY_CAPACITY * 10),
    coreMainAxisCount: boundedFiniteOrNull(snapshot?.coreMainAxisCount, 0, INVENTORY_CAPACITY * 10),
    coreAuxiliaryCount: boundedFiniteOrNull(snapshot?.coreAuxiliaryCount, 0, INVENTORY_CAPACITY * 10),
    unknownStageCount: boundedFiniteOrNull(snapshot?.unknownStageCount, 0, INVENTORY_CAPACITY),
    cursedCount: boundedFiniteOrNull(snapshot?.cursedCount, 0, INVENTORY_CAPACITY),
    bagOccupancy: boundedFiniteOrNull(snapshot?.bagOccupancy, 0, INVENTORY_CAPACITY),
    bagCapacity: boundedFiniteOrNull(snapshot?.bagCapacity, 0, INVENTORY_CAPACITY),
    bagFreeSlots: boundedFiniteOrNull(snapshot?.bagFreeSlots, 0, INVENTORY_CAPACITY),
    unconfirmedObjectDetails: details
  };
}

function buildStakeSnapshotFields(stateSnapshot) {
  return normalizeStakeSnapshot(buildObjectLootStakeSnapshot(stateSnapshot));
}

function hasSemanticEvent(key) {
  if (!key) return false;
  if (semanticEventKeys.has(key)) return true;
  semanticEventKeys.add(key);
  return false;
}

function normalizeUxSurface(surface) {
  return SAFE_UX_SURFACES.has(surface) ? surface : null;
}

function getUxRevisitBucket(lastResolvedAt, now) {
  if (!Number.isFinite(lastResolvedAt)) return "none";
  const elapsed = now - lastResolvedAt;
  if (elapsed >= 0 && elapsed <= UX_REVISIT_IMMEDIATE_MS) return "immediate";
  if (elapsed >= 0 && elapsed <= UX_REVISIT_SHORT_MS) return "short";
  return "none";
}

export function trackUxDecisionOpened(surface) {
  if (!isTelemetryAvailable() || !runId) return;
  const normalizedSurface = normalizeUxSurface(surface);
  if (!normalizedSurface) return;
  const previous = uxDecisionStates.get(normalizedSurface) || {};
  if (previous.openedAt !== undefined) return;
  const now = Date.now();
  uxDecisionStates.set(normalizedSurface, { ...previous, openedAt: now });
  capture("ux_decision_opened", {
    runId,
    surface: normalizedSurface,
    revisitBucket: normalizeStableValue(
      getUxRevisitBucket(previous.lastResolvedAt, now),
      SAFE_UX_REVISIT_BUCKETS
    )
  });
}

export function trackUxDecisionResolved(surface, resolution) {
  if (!isTelemetryAvailable() || !runId) return;
  const normalizedSurface = normalizeUxSurface(surface);
  const normalizedResolution = normalizeStableValue(resolution, SAFE_UX_RESOLUTIONS);
  if (!normalizedSurface || !SAFE_UX_RESOLUTIONS.has(normalizedResolution)) return;
  const previous = uxDecisionStates.get(normalizedSurface);
  if (!previous || previous.openedAt === undefined) return;
  uxDecisionStates.set(normalizedSurface, {
    lastResolvedAt: Date.now()
  });
  capture("ux_decision_resolved", {
    runId,
    surface: normalizedSurface,
    resolution: normalizedResolution
  });
}

export function trackLootLifecycle(stage, details = {}) {
  if (!isTelemetryAvailable() || !runId) return;
  const normalizedStage = normalizeLootStage(stage);
  const lootSequence = normalizeLootSequence(details.lootId, details.lootSequence);
  const semanticKey = lootSequence === null
    ? null
    : `loot:${lootSequence}:${normalizedStage}`;
  if (hasSemanticEvent(semanticKey)) return;
  const stateSnapshot = details.state || null;
  const summary = getUnbankedLootSummary(stateSnapshot);
  capture("loot_lifecycle", {
    runId,
    ...safeExplorationContext({ state: stateSnapshot, character: details.character }),
    lifecycleStage: normalizedStage,
    lootSequence,
    itemId: getSafeItemId(details.itemKey),
    itemCategory: getItemCategory(details.itemKey),
    source: normalizeLootSource(details.source || "dungeon"),
    ownership: normalizeLootOwnership(details.ownership || (normalizedStage === "banked" ? "town" : "unbanked")),
    identified: details.itemKey == null || typeof details.itemKey !== "object" || details.itemKey.identified === true,
    rarity: details.itemKey?.identified === true ? normalizeRarity(details.itemKey?.rarity) : null,
    buildRole: getEquipmentBuildRole(details.itemKey),
    ...getLootSupplyFields(details.itemKey, stateSnapshot?.floor),
    valueProxy: getLootValueProxy(details.itemKey),
    unbankedObjectLootCount: summary.count,
    unbankedObjectLootValueProxy: summary.valueProxy
  });
}

export function trackLootStakeSnapshot(snapshotPoint, details = {}) {
  if (!isTelemetryAvailable() || !runId) return;
  const stateSnapshot = details.state || null;
  const context = safeDecisionContext({ state: stateSnapshot, character: details.character });
  capture("loot_stake_snapshot", buildLootStakeSnapshotPayload({
    runId,
    context,
    get snapshotPoint() { return snapshotPoint; },
    safeSnapshotPoints: SAFE_LOOT_SNAPSHOT_POINTS,
    get settlementOutcome() { return details.settlementOutcome; },
    get selectedLootCount() { return details.selectedLootIds?.length; },
    inventoryCapacity: INVENTORY_CAPACITY,
    get stakeSnapshotFields() { return buildStakeSnapshotFields(stateSnapshot); }
  }));
}

export function trackStairsDiscovery(details = {}) {
  if (!isTelemetryAvailable() || !runId) return;
  const identity = normalizeStairsDiscoveryIdentity({
    floor: details.floor,
    stairsType: details.stairsType || "stairs-down"
  });
  const { floor, stairsType } = identity;
  const key = `${floor}:${stairsType}`;
  if (discoveredStairKeys.has(key)) return;
  discoveredStairKeys.add(key);
  stairsStepByFloor.set(String(floor), boundedFiniteOrNull(details.stepsAtDiscovery));
  const context = safeExplorationContext({ state: details.state, character: details.character });
  capture("stairs_discovered", buildStairsDiscoveryPayload({
    runId,
    context,
    floor,
    stairsType,
    get stepsAtDiscovery() { return details.stepsAtDiscovery; },
    get stepsBeforeDiscovery() { return details.stepsBeforeDiscovery; },
    get hpRate() { return details.hpRate; },
    get mpRate() { return details.mpRate; },
    get explorationMode() { return details.explorationMode; },
    get unbankedObjectLootCount() { return getUnbankedLootSummary(details.state).count; }
  }));
}

export function trackFloorExploration(details = {}) {
  if (!isTelemetryAvailable() || !runId) return;
  const floor = boundedFiniteOrNull(details.floor);
  const key = String(floor);
  if (exploredFloorKeys.has(key)) return;
  exploredFloorKeys.add(key);
  const context = safeExplorationContext({ state: details.state, character: details.character });
  capture("floor_exploration", buildFloorExplorationPayload({
    runId,
    context,
    floor,
    get stepsBeforeStairs() { return details.stepsBeforeStairs ?? stairsStepByFloor.get(key); },
    get stepsAfterStairs() {
      return details.stepsAfterStairs ?? (
        Number.isFinite(Number(details.state?.currentRun?.floorSteps?.[key])) &&
        Number.isFinite(Number(stairsStepByFloor.get(key)))
          ? Number(details.state.currentRun.floorSteps[key]) - Number(stairsStepByFloor.get(key))
          : null
      );
    },
    get stairsDiscovered() { return details.stairsDiscovered; },
    get floorCompleted() { return details.floorCompleted; },
    get chestsDiscovered() { return details.chestsDiscovered; },
    get chestsSkipped() { return details.chestsSkipped; },
    get explorationMode() { return details.explorationMode; }
  }));
}

export function trackValuableLocation(locationType, action, details = {}) {
  if (!isTelemetryAvailable() || !runId) return;
  const identity = normalizeValuableLocationIdentity({
    floor: details.floor ?? details.state?.floor,
    x: details.x ?? details.state?.x,
    y: details.y ?? details.state?.y,
    locationType,
    action,
    safeLocationTypes: SAFE_LOCATION_TYPES,
    safeLocationActions: SAFE_LOCATION_ACTIONS
  });
  const semanticKey = `location:${identity.floor}:${identity.x}:${identity.y}:${identity.locationType}:${identity.action}`;
  if (hasSemanticEvent(semanticKey)) return;
  const context = safeExplorationContext({ state: details.state, character: details.character });
  capture("valuable_location", buildValuableLocationPayload({
    runId,
    context,
    ...identity,
    distanceFromStart: details.distanceFromStart,
    source: details.source,
    safeLootSources: SAFE_LOOT_SOURCES
  }));
}

export function trackPortalDecision(decision, details = {}) {
  if (!isTelemetryAvailable() || !runId) return;
  const stateSnapshot = details.state || null;
  const summary = getUnbankedLootSummary(stateSnapshot);
  const payload = buildPortalDecisionPayload({
    runId,
    context: safeExplorationContext({ state: stateSnapshot, character: details.character }),
    portalType: details.portalType,
    decision,
    hpRate: details.hpRate ?? safeExplorationContext({ state: stateSnapshot, character: details.character }).hpRate,
    mpRate: details.mpRate ?? safeExplorationContext({ state: stateSnapshot, character: details.character }).mpRate,
    freeInventorySlots: buildResourceSnapshot(stateSnapshot).inventoryFreeSlots,
    unbankedObjectLootCount: summary.count,
    unbankedObjectLootValueProxy: summary.valueProxy,
    wingOwned: details.wingOwned ?? getReturnWingCount(stateSnapshot) > 0,
    wingSalvageCount: details.wingSalvageCount,
    nextBandMainId: details.nextBandMainId,
    nextBandSubId: details.nextBandSubId,
    stakeSnapshotFields: buildStakeSnapshotFields(stateSnapshot),
    safePortalTypes: SAFE_PORTAL_TYPES,
    safePortalDecisions: SAFE_PORTAL_DECISIONS,
    safeBandTrialIds: SAFE_BAND_TRIAL_IDS
  });
  capture("portal_decision", payload);
}

export function trackEliteDecision(decision, details = {}) {
  if (!isTelemetryAvailable() || !runId) return;
  const stateSnapshot = details.state || null;
  const elite = details.elite || details.monster || null;
  const payload = buildEliteDecisionPayload({
    runId,
    context: safeExplorationContext({ state: stateSnapshot, character: details.character }),
    floor: details.floor ?? elite?.floor ?? stateSnapshot?.floor,
    decision,
    eliteId: normalizeEliteId(elite),
    contactMode: details.contactMode,
    distance: details.distance,
    detected: Boolean(details.detected ?? elite?.detected),
    elitePolicy: details.elitePolicy,
    unbankedObjectLootCount: getUnbankedLootSummary(stateSnapshot).count,
    safeDecisions: SAFE_ELITE_DECISIONS,
    safeContactModes: SAFE_ELITE_CONTACT_MODES
  });
  capture("elite_decision", payload);
}

export function trackBleedingEvent(event, details = {}) {
  const { eventName, payload } = buildBleedingEventTelemetry({
    event,
    safeEvents: SAFE_BLEEDING_EVENTS,
    safeReasons: SAFE_BLEEDING_REASONS,
    safeSources: SAFE_BLEEDING_SOURCES,
    getFloor: () => details.floor,
    getCharacter: () => details.character,
    getBuildSnapshotFields: character => resolveBuildSnapshot(character, { party: details.state?.party }),
    getEnemyId: () => normalizeEnemyId(details.enemyId),
    getIsBoss: () => details.isBoss,
    getIsMidboss: () => details.isMidboss,
    getRemainingTurns: () => details.remainingTurns,
    getPayoffDamage: () => details.payoffDamage,
    getReason: () => details.reason,
    getSource: () => details.source,
    getBuildKey: () => details.buildKey,
    getDamageContribution: () => details.damageContribution,
    getDirectDamage: () => details.directDamage
  });
  capture(eventName, payload);
}

export function trackVulnerableEvent(event, details = {}) {
  const normalizedEvent = normalizeStableValue(event, SAFE_VULNERABLE_EVENTS);
  capture(`vulnerable_${normalizedEvent}`, {
    floor: boundedFiniteOrNull(details.floor),
    ...(details.character ? { buildSnapshot: resolveBuildSnapshot(details.character, { party: details.state?.party }) } : {}),
    enemyId: normalizeEnemyId(details.enemyId),
    isBoss: Boolean(details.isBoss),
    isMidboss: Boolean(details.isMidboss),
    remainingTurns: boundedFiniteOrNull(details.remainingTurns),
    multiplier: boundedFiniteOrNull(details.multiplier, 1, 10),
    reason: normalizeOptionalStableValue(details.reason, SAFE_VULNERABLE_REASONS),
    source: normalizeOptionalStableValue(details.source, SAFE_VULNERABLE_SOURCES),
    buildKey: normalizeVulnerableBuildKey(details.buildKey),
    qualifyingHitType: normalizeOptionalStableValue(details.qualifyingHitType, SAFE_VULNERABLE_HIT_TYPES),
    latencyTurns: boundedFiniteOrNull(details.latencyTurns, 0, 100),
    damageContribution: boundedFiniteOrNull(details.damageContribution),
    directDamage: boundedFiniteOrNull(details.directDamage)
  });
}

export function trackChestAction(chest, action, details = {}) {
  if (!isTelemetryAvailable() || !runId) return;

  capture("chest_action", {
    runId,
    ...safeExplorationContext({
      state: details.state,
      character: details.character
    }),
    floor: boundedFiniteOrNull(details.floor),
    chestSource: chest?.fromDrop ? "fromDrop" : "ordinary",
    fromDrop: Boolean(chest?.fromDrop),
    action: normalizeStableValue(action, SAFE_CHEST_ACTIONS),
    trap: normalizeStableValue(details.trap ?? "none", SAFE_CHEST_TRAPS),
    inspected: Boolean(chest?.inspected),
    inventoryCount: boundedFiniteOrNull(details.inventoryCount),
    hasTrapKit: Boolean(details.hasTrapKit),
    rewardCount: boundedFiniteOrNull(details.rewardCount),
    rewardCategories: normalizeBoundedEnumArray(
      details.rewardCategories,
      SAFE_CHEST_REWARD_CATEGORIES,
      SAFE_CHEST_REWARD_CATEGORIES.size
    ),
    lootAura: normalizeOptionalStableValue(chest?.lootHint?.aura, SAFE_CHEST_AURAS)
  });
}

export function trackTrapResolution(outcome, details = {}) {
  if (!isTelemetryAvailable() || !runId) return;

  const normalizedOutcome = normalizeStableValue(outcome, SAFE_TRAP_OUTCOMES);
  const stateSnapshot = details.state || null;
  const floor = boundedFiniteOrNull(details.floor ?? stateSnapshot?.floor);
  const x = boundedFiniteOrNull(details.x ?? details.trap?.position?.x, 0, 1000);
  const y = boundedFiniteOrNull(details.y ?? details.trap?.position?.y, 0, 1000);
  const source = normalizeTrapSource(details.source);
  const trapType = normalizeTrapType(details.trapType ?? details.trap);
  const location = `${floor}:${x ?? "none"}:${y ?? "none"}`;
  const semanticKey = `trap_resolution:${source}:${location}:${trapType}:${normalizedOutcome}`;
  if (hasSemanticEvent(semanticKey)) return;

  const build = buildTrapBuildSnapshot(stateSnapshot, details.character);
  capture("trap_resolution", {
    runId,
    ...safeExplorationContext({ state: stateSnapshot, character: details.character }),
    floor,
    source,
    trapType,
    outcome: normalizedOutcome,
    action: normalizeStableValue(details.action, SAFE_TRAP_ACTIONS),
    successRate: boundedFiniteOrNull(details.successRate, 0, 100),
    trapDifficulty: boundedFiniteOrNull(details.trap?.difficulty ?? details.trapDifficulty, 0, 1000),
    partialSuccess: details.partialSuccess === undefined ? undefined : Boolean(details.partialSuccess),
    identified: details.identified === undefined ? undefined : Boolean(details.identified),
    x,
    y,
    toolId: normalizeOptionalStableValue(details.toolId, SAFE_TRAP_TOOL_IDS),
    toolUsed: Boolean(details.toolUsed),
    trapBonus: build.trapBonus,
    trapGuard: build.trapGuard,
    detectionSupport: build.detectionSupport,
    treasureSense: build.treasureSense,
    hearRange: build.hearRange,
    traceRead: build.traceRead,
    trapKitCount: build.trapKitCount,
    availableToolIds: build.availableToolIds,
    coreIds: build.coreIds,
    coreTrapEater: build.coreTrapEater,
    coreTombRaider: build.coreTombRaider
  });
}

export function trackChestSmashResult(chest, details = {}) {
  if (!isTelemetryAvailable() || !runId) return;

  capture("chest_smash_result", {
    runId,
    floor: boundedFiniteOrNull(details.floor),
    chestSource: chest?.fromDrop ? "fromDrop" : "ordinary",
    fromDrop: Boolean(chest?.fromDrop),
    trapFired: Boolean(details.trapFired),
    partyDied: Boolean(details.partyDied),
    rewardCount: boundedFiniteOrNull(details.rewardCount),
    lostRewardCount: boundedFiniteOrNull(details.lostRewardCount),
    lostRewardRoles: normalizeBoundedEnumArray(details.lostRewardRoles, SAFE_CHEST_REWARD_ROLES),
    lostRewardCategories: normalizeBoundedEnumArray(details.lostRewardCategories, SAFE_CHEST_REWARD_CATEGORIES),
    remainingRewardCount: boundedFiniteOrNull(details.remainingRewardCount),
    awardedRewardCount: boundedFiniteOrNull(details.awardedRewardCount),
    unawardedRewardCount: boundedFiniteOrNull(details.unawardedRewardCount)
  });
}

export function trackRunStart(run, character, stateSnapshot = null) {
  if (!isTelemetryAvailable()) return;
  runId = createRuntimeId("run");
  combatId = null;
  combatEnded = false;
  semanticEventKeys = new Set();
  discoveredStairKeys = new Set();
  exploredFloorKeys = new Set();
  stairsStepByFloor = new Map();
  uxDecisionStates = new Map();

  capture("run_start", {
    runId,
    ...safeDecisionContext({ state: stateSnapshot, character }),
    level: boundedFiniteOrNull(character?.level),
    startFloor: boundedFiniteOrNull(run?.startFloor),
    // Preserve v1 raw capacity fields while exposing effective capacities via
    // the shared snapshot fields above and these explicit v2 aliases.
    maxHp: boundedFiniteOrNull(character?.maxHp),
    maxMp: boundedFiniteOrNull(character?.maxMp),
    effectiveMaxHp: boundedFiniteOrNull(getCharMaxHp(character)),
    effectiveMaxMp: boundedFiniteOrNull(getCharMaxMp(character)),
    equipmentIds: buildEquipmentSnapshot(character).equipmentIds,
    startingInventoryCount: buildResourceSnapshot(stateSnapshot).inventoryCount,
    startingInventoryFreeSlots: buildResourceSnapshot(stateSnapshot).inventoryFreeSlots,
    startingWingCount: buildResourceSnapshot(stateSnapshot).consumableWingCount,
    startingUnbankedObjectLootCount: getUnbankedLootSummary(stateSnapshot).count
  });
}

export function trackCombatStart(combat, stateSnapshot = null) {
  if (!isTelemetryAvailable() || !runId) return;
  pendingCombatDecisions = [];
  combatId = createRuntimeId("combat");
  combatEnded = false;

  capture("combat_start", {
    runId,
    combatId,
    ...safeDecisionContext({ state: stateSnapshot, character: combat?.player, combat }),
    floor: boundedFiniteOrNull(combat?.floor),
    playerHp: boundedFiniteOrNull(combat?.player?.hp),
    playerMp: boundedFiniteOrNull(combat?.player?.mp),
    enemyIds: (combat?.monsters ?? []).slice(0, MAX_ENEMY_SNAPSHOT).map(monster => normalizeEnemyId(monster?.name)),
    isBoss: Boolean(combat?.isBoss),
    isMidboss: Boolean(combat?.isMidboss),
    isRoamingFlack: Boolean(combat?.isRoamingFlack)
  });
}

export function trackDamageReceived(damage) {
  if (!isTelemetryAvailable() || !runId || !combatId) return;

  const defenseBreakdown = damage?.defenseBreakdown
    ?? buildDefenseBreakdown(damage?.character, damage?.finalDef, damage);
  capture("damage_received", {
    runId,
    combatId,
    floor: boundedFiniteOrNull(damage?.floor),
    ...(damage?.character ? { buildSnapshot: resolveBuildSnapshot(damage.character) } : {}),
    enemyId: normalizeEnemyId(damage?.enemyId),
    attackType: normalizeStableValue(damage?.attackType, SAFE_ATTACK_TYPES),
    rawDamage: boundedFiniteOrNull(damage?.rawDamage),
    preDefDamage: boundedFiniteOrNull(damage?.preDefDamage),
    postDefDamage: boundedFiniteOrNull(damage?.postDefDamage),
    finalDamage: boundedFiniteOrNull(damage?.finalDamage),
    finalDef: boundedFiniteOrNull(damage?.finalDef),
    defResistance: boundedFiniteOrNull(damage?.defResistance, -1, 1),
    ...normalizeDefenseBreakdown(defenseBreakdown),
    playerHpBefore: boundedFiniteOrNull(damage?.playerHpBefore),
    playerHpAfter: boundedFiniteOrNull(damage?.playerHpAfter),
    playerMp: boundedFiniteOrNull(damage?.playerMp),
    isDefending: Boolean(damage?.isDefending),
    guardProfileId: normalizeStableValue(damage?.guardProfileId, SAFE_GUARD_PROFILE_IDS)
  });
}

export function trackCombatEnd(result, combat, stateSnapshot = null) {
  if (!isTelemetryAvailable() || !runId || !combatId || combatEnded) return;
  combatEnded = true;

  const normalizedResult = normalizeCombatResult(result);
  capture("combat_end", {
    runId,
    combatId,
    ...safeDecisionContext({ state: stateSnapshot, character: combat?.player, combat }),
    floor: boundedFiniteOrNull(combat?.floor),
    result: normalizedResult,
    turns: boundedFiniteOrNull(combat?.turns),
    playerHp: boundedFiniteOrNull(combat?.player?.hp),
    playerMp: boundedFiniteOrNull(combat?.player?.mp),
    enemiesDefeated: (combat?.monsters ?? [])
      .slice(0, MAX_ENEMY_SNAPSHOT)
      .filter(monster => monster?.hp <= 0 && !monster?.fled)
      .length
  });
  if (combat?.isRoamingFlack) {
    const eliteDecision = normalizedResult === "victory"
      ? "clear"
      : normalizedResult === "fled" ? "flee" : normalizedResult === "gameover" ? "death" : "contact";
    trackEliteDecision(eliteDecision, {
      state: stateSnapshot,
      combat,
      elite: combat?.monsters?.[0],
      contactMode: "combat",
      distance: 0,
      elitePolicy: "engage"
    });
  }
}

export function trackRunEnd(run, outcome, stateSnapshot = null) {
  if (!isTelemetryAvailable() || !runId) return;

  const latestDeath = Array.isArray(run?.deathLogs) ? run.deathLogs.at(-1) : null;
  const deathType = normalizeDeathType(latestDeath?.type);
  const deathSource = latestDeath?.source ? normalizeEnemyId(latestDeath.source) : null;
  const bankedObjectLoot = Array.isArray(run?.bankedObjectLoot) ? run.bankedObjectLoot : [];
  const lostObjectLoot = Array.isArray(run?.lostObjectLoot) ? run.lostObjectLoot : [];
  capture("run_end", {
    runId,
    ...safeDecisionContext({ state: stateSnapshot, character: stateSnapshot?.party?.[0] }),
    outcome: normalizeOutcome(outcome),
    returnReason: normalizeOptionalStableValue(run?.returnReason, SAFE_RETURN_REASONS),
    deepestFloor: boundedFiniteOrNull(run?.deepestFloor),
    steps: boundedFiniteOrNull(run?.steps),
    battles: boundedFiniteOrNull(run?.battles),
    kills: boundedFiniteOrNull(run?.kills),
    elitesKilled: boundedFiniteOrNull(run?.elitesKilled),
    bossesKilled: boundedFiniteOrNull(run?.bossesKilled),
    chestsOpened: boundedFiniteOrNull(run?.chestsOpened),
    trapsTriggered: boundedFiniteOrNull(run?.trapsTriggered),
    durationMs: Number.isFinite(run?.startedAt) && run.startedAt > 0
      ? boundedFiniteOrNull(Date.now() - run.startedAt)
      : null,
    deathType,
    deathSource,
    deathCause: normalizeDeathCause(latestDeath?.cause),
    objectLootBankedCount: boundedFiniteOrNull(bankedObjectLoot.length),
    objectLootLostCount: boundedFiniteOrNull(lostObjectLoot.length),
    objectLootBankedValueProxy: boundedFiniteOrNull(
      bankedObjectLoot.reduce((sum, item) => sum + getLootValueProxy(item), 0),
      0,
      MAX_RESOURCE_VALUE
    ),
    objectLootLostValueProxy: boundedFiniteOrNull(
      lostObjectLoot.reduce((sum, item) => sum + getLootValueProxy(item), 0),
      0,
      MAX_RESOURCE_VALUE
    ),
    stakeSnapshotPoint: "terminal_settlement_after",
    ...buildStakeSnapshotFields(stateSnapshot)
  });
  runId = null;
  combatId = null;
  combatEnded = false;
}

export function trackCombatDecision(action, details = {}) {
  if (!isTelemetryAvailable() || !runId || !combatId) return;
  const combat = details.combat || details.state?.combatState || null;
  const spellId = getSafeSpellId(details.spellName);
  const spellTarget = spellId && spellId !== "other" ? SPELLS[spellId]?.target : null;
  capture("combat_decision", buildCombatDecisionPayload({
    runId,
    combatId,
    action,
    actorIdx: details.actorIdx,
    targetIdx: details.targetIdx,
    partySize: details.state?.party?.length,
    monsters: combat?.monsters || [],
    context: safeDecisionContext({ state: details.state, character: details.character, combat }),
    spellId,
    spellTarget,
    itemId: getSafeItemId(details.itemKey),
    itemCategory: getItemCategory(details.itemKey),
    normalizeEnemyId
  }));
}

export function trackCombatDecisionPending(action, details = {}) {
  if (!isTelemetryAvailable() || !runId || !combatId) return;
  const combat = details.combat || details.state?.combatState || null;
  const combatSnapshot = combat ? { ...combat, phase: combat.phase } : combat;
  const stateSnapshot = details.state && details.state.combatState === combat
    ? { ...details.state, combatState: combatSnapshot }
    : details.state;
  pendingCombatDecisions.push({
    action,
    details: { ...details, state: stateSnapshot, combat: combatSnapshot }
  });
}

export function trackCombatDecisionCancel() {
  pendingCombatDecisions.pop();
}

export function trackCombatDecisionCommit() {
  const decisions = pendingCombatDecisions;
  pendingCombatDecisions = [];
  decisions.forEach(({ action, details }) => trackCombatDecision(action, details));
}

export function trackExplorationDecision(action, details = {}) {
  if (!isTelemetryAvailable() || !runId) return;
  const spellId = getSafeSpellId(details.spellName);
  const spellTarget = spellId && spellId !== "other" ? SPELLS[spellId]?.target : null;
  capture("exploration_decision", buildExplorationDecisionPayload({
    runId,
    context: safeExplorationContext({ state: details.state, character: details.character }),
    action,
    source: details.source,
    safeCellEvents: SAFE_CELL_EVENTS,
    spellId,
    targetIdx: details.targetIdx,
    partySize: details.state?.party?.length,
    targetType: details.targetType,
    spellTarget,
    safeSpellTargetTypes: SAFE_SPELL_TARGET_TYPES,
    itemId: getSafeItemId(details.itemKey),
    itemCategory: getItemCategory(details.itemKey),
    direction: details.direction,
    safeDirections: SAFE_DIRECTIONS
  }));
}

export function trackEquipmentDecision(action, details = {}) {
  if (!isTelemetryAvailable() || !runId) return;
  const preview = details.preview || {};
  const diffRows = Array.isArray(preview.rows) ? preview.rows : [];
  const candidateBuildRole = getEquipmentBuildRole(details.candidateKey);
  const currentBuildRole = getEquipmentBuildRole(details.currentKey ?? preview.oldEq);
  const buildDecision = isBuildTransition(action, details.candidateKey, details.currentKey ?? preview.oldEq)
    ? "transition"
    : "swap";
  capture("equipment_decision", buildEquipmentDecisionPayload({
    runId,
    context: safeExplorationContext({ state: details.state, character: details.character }),
    action,
    candidateId: getSafeItemId(details.candidateKey),
    currentEquipmentId: getSafeItemId(details.currentKey ?? preview.oldEq),
    candidateBuildRole,
    currentBuildRole,
    buildDecision,
    slot: preview.slot,
    safeEquipmentSlots: new Set(EQUIPMENT_SLOTS.map(entry => entry.id)),
    candidateRarity: details.candidateKey?.identified === true ? normalizeRarity(preview.item?.rarity) : null,
    candidateIdentified: details.candidateKey == null || typeof details.candidateKey !== "object" || details.candidateKey.identified === true,
    candidateEnhancementLevel: details.candidateKey?.enhanceLevel ?? 0,
    primaryDiff: preview.primaryDiff,
    diffRows,
    safeComparisonStatKeys: SAFE_COMPARISON_STAT_KEYS,
    maxResourceValue: MAX_RESOURCE_VALUE,
    maxComparisonRows: MAX_AFFIX_SNAPSHOT
  }));
  if (buildDecision === "transition") {
    capture("build_shift", buildBuildShiftPayload({
      runId,
      context: safeExplorationContext({ state: details.state, character: details.character }),
      action,
      fromBuildRole: currentBuildRole,
      toBuildRole: candidateBuildRole,
      fromEquipmentId: getSafeItemId(details.currentKey ?? preview.oldEq),
      toEquipmentId: getSafeItemId(details.candidateKey)
    }));
  }
}

export function trackLoadoutTransaction(action, details = {}) {
  if (!isTelemetryAvailable() || !runId) return;
  capture("loadout_transaction", buildLoadoutTransactionPayload({
    runId,
    context: safeExplorationContext({ state: details.state, character: details.character }),
    action,
    equipmentChanges: details.equipmentChanges,
    runeChanges: details.runeChanges,
    discardedItems: details.discardedItems,
    mode: details.mode,
    turnCost: details.turnCost,
    equipmentChangeCountMax: EQUIPMENT_SLOTS.length * 8,
    discardedItemCountMax: INVENTORY_CAPACITY
  }));
}

export function __setTelemetryClientForTests(testClient) {
  pendingCombatDecisions = [];
  runId = null;
  combatId = null;
  combatEnded = false;
  semanticEventKeys = new Set();
  discoveredStairKeys = new Set();
  exploredFloorKeys = new Set();
  stairsStepByFloor = new Map();
  uxDecisionStates = new Map();
  setTelemetryClientForTests(testClient ?? null);
}

export function __setTelemetryInitializationForTests({ enabled = false } = {}) {
  pendingCombatDecisions = [];
  runId = null;
  combatId = null;
  combatEnded = false;
  semanticEventKeys = new Set();
  discoveredStairKeys = new Set();
  exploredFloorKeys = new Set();
  stairsStepByFloor = new Map();
  uxDecisionStates = new Map();
  setTelemetryInitializationForTests(enabled);
}

export function __resetTelemetryForTests() {
  __setTelemetryClientForTests(null);
}

initializeTelemetry();
