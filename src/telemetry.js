import {
  getCharAgi,
  getCharAttackBreakdown,
  getCharDef,
  getCharDerivedStats,
  getCharInt,
  getCharLuk,
  getCharMaxHp,
  getCharMaxMp,
  getCharPie,
  getCharStr,
  getCharVit
} from "./rules/character_stats.js";
import { getCharAffixSum, getItemBaseId, getItemData } from "./rules/item_rules.js";
import { CLASSES } from "./data/classes.js";
import { ITEMS } from "./data/items.js";
import { MONSTERS } from "./data/monsters.js";
import { SPELLS } from "./data/spells.js";
import { getAffixDefinition, LOOT_BUILD_ROLES } from "./data/affixes.js";
import { EQUIPMENT_SLOTS } from "./rules/equipment_slots.js";
import { DIR_NAMES } from "./constants/directions.js";
import { EVENT_TYPES, EVENT_SUBMENU_TYPES } from "./constants/events.js";
import { CHEST_SMASH_REWARD_LOSS_CHANCE_BY_CATEGORY } from "./rules/chest_rules.js";
import { getBuffTotal } from "./combat_logic/status_effects.js";
import { getMpWardDef } from "./combat_logic/mp_ward.js";
import { INVENTORY_CAPACITY } from "./rules/item_inventory.js";

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
const VALID_DEATH_TYPES = new Set(["combat", "trap", "status"]);
const PRE_INIT_BUFFER_LIMIT = 64;
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
  "trapBonus"
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
const SAFE_ATTACK_TYPES = new Set(["physical", "normal", "spell", "flee", "reflect", "counter", "other"]);
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
  "antiUndead", "firstStrike", "poisonWard", "poisonAtk"
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
const SAFE_CHEST_AURAS = new Set(["weak", "medium", "strong"]);
const SAFE_BUILD_ROLES = new Set(Object.values(LOOT_BUILD_ROLES));
const SAFE_LOOT_STAGES = new Set([
  "found", "bagged", "tried", "identified", "adopted", "discarded",
  "banked", "salvaged", "lost", "rejected"
]);
const SAFE_LOOT_SOURCES = new Set([
  "combat", "chest", "merchant", "workshop", "departure-craft", "dungeon", "other"
]);
const SAFE_LOOT_OWNERSHIPS = new Set(["town", "dungeon", "unbanked", "unknown"]);
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
const LOOT_VALUE_BY_RARITY = Object.freeze({ common: 1, magic: 2, rare: 4, epic: 7, legendary: 12 });
const MAX_ENEMY_SNAPSHOT = 8;
const MAX_AFFIX_SNAPSHOT = 24;
const MAX_RESOURCE_VALUE = 1_000_000;

let client = null;
let telemetryState = "uninitialized";
let pendingEvents = [];
let pendingCombatDecisions = [];
let runId = null;
let combatId = null;
let combatEnded = false;
let fallbackIdCounter = 0;
let semanticEventKeys = new Set();
let discoveredStairKeys = new Set();
let exploredFloorKeys = new Set();
let stairsStepByFloor = new Map();

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

function removeUndefined(value) {
  if (Array.isArray(value)) {
    return value.filter(item => item !== undefined).map(removeUndefined);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, removeUndefined(item)])
    );
  }
  return value;
}

function finiteOrNull(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function boundedFiniteOrNull(value, min = 0, max = MAX_RESOURCE_VALUE) {
  const normalized = finiteOrNull(value);
  if (normalized === null) return null;
  return Math.min(max, Math.max(min, normalized));
}

function normalizeStatus(status) {
  return SAFE_STATUSES.has(status) ? status : "other";
}

function normalizeStableValue(value, allowedValues) {
  return allowedValues.has(value) ? value : "other";
}

function normalizeBoundedEnumArray(value, allowedValues, cap = MAX_AFFIX_SNAPSHOT) {
  return Array.isArray(value)
    ? value.slice(0, cap).map(item => normalizeStableValue(item, allowedValues))
    : [];
}

function normalizeOptionalStableValue(value, allowedValues) {
  if (value === null || value === undefined || value === "") return null;
  return normalizeStableValue(value, allowedValues);
}

function normalizeClass(value) {
  return normalizeOptionalStableValue(value, new Set(Object.keys(CLASSES)));
}

function normalizeRarity(value) {
  return normalizeOptionalStableValue(value, SAFE_RARITIES);
}

function getSafeItemId(itemKey) {
  if (itemKey === null || itemKey === undefined || itemKey === "") return null;
  const id = getItemBaseId(itemKey);
  return typeof id === "string" && Object.hasOwn(ITEMS, id) ? id : "other";
}

function getSafeSpellId(spellKey) {
  if (spellKey === null || spellKey === undefined || spellKey === "") return null;
  return typeof spellKey === "string" && Object.hasOwn(SPELLS, spellKey) ? spellKey : "other";
}

function normalizeTargetIndex(value, partySize) {
  const boundedPartySize = Math.min(MAX_ENEMY_SNAPSHOT, Math.max(0, Number(partySize) || 0));
  return Number.isInteger(value) && value >= 0 && value < boundedPartySize ? value : null;
}

function normalizeCombatIndex(value, collectionSize, allowAllTarget = false) {
  if (allowAllTarget && value === -1) return -1;
  return normalizeTargetIndex(value, collectionSize);
}

function normalizeBleedingBuildKey(value) {
  if (typeof value !== "string") return "other";
  const match = value.match(/^bleedingAtk:(-?\d+(?:\.\d+)?)$/);
  if (!match) return "other";
  const affixValue = boundedFiniteOrNull(match[1], 0, 100);
  return affixValue === null ? "other" : `bleedingAtk:${affixValue}`;
}

function normalizeVulnerableBuildKey(value) {
  return value === "VULNERA" ? value : "other";
}

function normalizeDirection(value) {
  return Number.isInteger(value) && SAFE_DIRECTIONS.has(value) ? value : null;
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
    coreCount: affixes.filter(affix => (affix?.kind || "support") === "core").length,
    supportCount: affixes.filter(affix => (affix?.kind || "support") === "support").length,
    types: [...new Set(normalizedTypes)].slice(0, 8)
  };
}

function getEquipmentBuildRole(itemKey) {
  if (!itemKey || typeof itemKey !== "object") return null;
  const affixes = Array.isArray(itemKey.affixes) ? itemKey.affixes : [];
  const coreRole = affixes
    .filter(affix => (affix?.kind || getAffixDefinition(affix)?.kind) === "core")
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
    .filter(affix => (affix?.kind || getAffixDefinition(affix)?.kind) === "core")
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
    playerClass: normalizeClass(character.class),
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
    defense: boundedFiniteOrNull(derived.defense),
    magic: boundedFiniteOrNull(derived.magic),
    healing: boundedFiniteOrNull(derived.healing),
    speed: boundedFiniteOrNull(derived.speed),
    trap: boundedFiniteOrNull(derived.trap),
    treasure: boundedFiniteOrNull(derived.treasure),
    str: boundedFiniteOrNull(getCharStr(character)),
    int: boundedFiniteOrNull(getCharInt(character)),
    pie: boundedFiniteOrNull(getCharPie(character)),
    vit: boundedFiniteOrNull(getCharVit(character)),
    agi: boundedFiniteOrNull(getCharAgi(character)),
    luk: boundedFiniteOrNull(getCharLuk(character))
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
  const slots = Object.entries(character?.equipment || {}).slice(0, EQUIPMENT_SLOTS.length);
  const equipment = slots.map(([slot, itemKey]) => {
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
    equipmentCursed: equipment.map(item => item.cursed)
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
  return {
    ...buildPlayerSnapshot(character || stateSnapshot?.party?.[0], { floor: stateSnapshot?.floor ?? combat?.floor ?? 1 }),
    ...buildEquipmentSnapshot(character || stateSnapshot?.party?.[0]),
    ...buildResourceSnapshot(stateSnapshot),
    ...buildEnvironmentSnapshot(stateSnapshot, combat)
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
  return VALID_DEATH_TYPES.has(type) ? type : null;
}

function normalizeDeathCause(cause) {
  if (typeof cause !== "string") return null;
  const normalized = cause.trim();
  if (!normalized) return null;
  if (/毒|poison/i.test(normalized)) return "poison";
  if (/罠|trap|矢|火炎/i.test(normalized)) return "trap";
  if (/戦闘|combat|との戦闘/i.test(normalized)) return "combat";
  if (/石碑|泉|status|状態/i.test(normalized)) return "event_or_status";
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
    vitContribution: normalize(breakdown.vitContribution),
    buffDef: normalize(breakdown.buffDef),
    frontGuardDef: normalize(breakdown.frontGuardDef),
    firstStrikeDefense: normalize(breakdown.firstStrikeDefense),
    mpWardDef: normalize(breakdown.mpWardDef),
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
    const vit = getCharVit(character);
    const vitContribution = Math.floor(vit / 4);
    const mpWardDef = getMpWardDef(character);
    const buffDef = attackType === "flee" ? 0 : getBuffTotal(character, "def");
    const tempDefDown = attackType === "flee" ? 0 : (character.tempDefDown || 0);
    const firstStrikeDefense = attackType === "physical" && character.combatFirstStrikeActive
      ? getCharAffixSum(character, "firstStrikeDefense")
      : 0;
    const frontGuardDef = attackType === "physical"
      ? Number(finalDef) - (equipmentDef + vitContribution + buffDef + firstStrikeDefense + mpWardDef - tempDefDown)
      : 0;
    return {
      // The live formula's baseDef input is the player's effective equipment DEF;
      // there is no separate character-base DEF term in the current rules.
      baseDef: equipmentDef,
      equipmentDef,
      vitContribution,
      buffDef,
      frontGuardDef,
      firstStrikeDefense,
      mpWardDef,
      tempDefDown
    };
  } catch {
    return null;
  }
}

function normalizeDecisionAction(action) {
  return {
    fight: "attack",
    attack: "attack",
    spell: "spell",
    item: "item",
    defend: "defend",
    run: "flee",
    flee: "flee",
    heal: "heal",
    cure: "cure",
    rest: "heal",
    drink: "heal",
    return: "return",
    continue: "continue",
    descend: "descend",
    compare: "compare",
    equip: "equip",
    unequip: "unequip",
    discard: "discard",
    identify: "identify",
    investigate: "investigate"
  }[action] || "other";
}

function initializeTelemetry() {
  const env = getPublicEnv();
  const key = typeof env.VITE_POSTHOG_KEY === "string" ? env.VITE_POSTHOG_KEY.trim() : "";
  const configuredHost = typeof env.VITE_POSTHOG_HOST === "string" ? env.VITE_POSTHOG_HOST : "";
  const host = resolvePostHogApiHost(configuredHost);
  if (!key || !configuredHost.trim() || !host) {
    telemetryState = "disabled";
    return;
  }

  telemetryState = "loading";

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
      client = sdk;
      telemetryState = "ready";
      flushPendingEvents();
    })
    .catch(() => {
      client = null;
      telemetryState = "disabled";
      pendingEvents = [];
    });
}

function captureWithClient(eventName, properties) {
  if (!client) return;
  try {
    const result = client.capture(eventName, properties);
    if (result && typeof result.catch === "function") {
      result.catch(() => {});
    }
  } catch {
    // Analytics must never affect gameplay.
  }
}

function flushPendingEvents() {
  const events = pendingEvents;
  pendingEvents = [];
  events.forEach(({ eventName, properties }) => captureWithClient(eventName, properties));
}

function capture(eventName, properties) {
  const normalizedProperties = removeUndefined({
    schemaVersion: TELEMETRY_SCHEMA_VERSION,
    ...properties
  });
  if (client) {
    captureWithClient(eventName, normalizedProperties);
    return;
  }
  if (telemetryState !== "loading") return;

  if (pendingEvents.length >= PRE_INIT_BUFFER_LIMIT) pendingEvents.shift();
  pendingEvents.push({ eventName, properties: normalizedProperties });
}

function isTelemetryAvailable() {
  return telemetryState === "loading" || telemetryState === "ready";
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

function hasSemanticEvent(key) {
  if (!key) return false;
  if (semanticEventKeys.has(key)) return true;
  semanticEventKeys.add(key);
  return false;
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
    ...safeDecisionContext({ state: stateSnapshot, character: details.character }),
    lifecycleStage: normalizedStage,
    lootSequence,
    itemId: getSafeItemId(details.itemKey),
    itemCategory: getItemCategory(details.itemKey),
    source: normalizeLootSource(details.source || "dungeon"),
    ownership: normalizeLootOwnership(details.ownership || (normalizedStage === "banked" ? "town" : "unbanked")),
    identified: details.itemKey == null || typeof details.itemKey !== "object" || details.itemKey.identified === true,
    rarity: details.itemKey?.identified === true ? normalizeRarity(details.itemKey?.rarity) : null,
    buildRole: getEquipmentBuildRole(details.itemKey),
    valueProxy: getLootValueProxy(details.itemKey),
    unbankedObjectLootCount: summary.count,
    unbankedObjectLootValueProxy: summary.valueProxy
  });
}

export function trackStairsDiscovery(details = {}) {
  if (!isTelemetryAvailable() || !runId) return;
  const floor = boundedFiniteOrNull(details.floor);
  const stairsType = normalizeStableValue(details.stairsType || "stairs-down", new Set(["stairs-up", "stairs-down"]));
  const key = `${floor}:${stairsType}`;
  if (discoveredStairKeys.has(key)) return;
  discoveredStairKeys.add(key);
  stairsStepByFloor.set(String(floor), boundedFiniteOrNull(details.stepsAtDiscovery));
  capture("stairs_discovered", {
    runId,
    ...safeDecisionContext({ state: details.state, character: details.character }),
    floor,
    stairsType,
    stepsAtDiscovery: boundedFiniteOrNull(details.stepsAtDiscovery),
    stepsBeforeDiscovery: boundedFiniteOrNull(details.stepsBeforeDiscovery),
    hpRate: boundedFiniteOrNull(details.hpRate, 0, 1),
    mpRate: boundedFiniteOrNull(details.mpRate, 0, 1),
    explorationMode: normalizeOptionalStableValue(details.explorationMode, new Set(["discovery", "known_route", "unknown"])),
    unbankedObjectLootCount: getUnbankedLootSummary(details.state).count
  });
}

export function trackFloorExploration(details = {}) {
  if (!isTelemetryAvailable() || !runId) return;
  const floor = boundedFiniteOrNull(details.floor);
  const key = String(floor);
  if (exploredFloorKeys.has(key)) return;
  exploredFloorKeys.add(key);
  capture("floor_exploration", {
    runId,
    ...safeDecisionContext({ state: details.state, character: details.character }),
    floor,
    stepsBeforeStairs: boundedFiniteOrNull(details.stepsBeforeStairs ?? stairsStepByFloor.get(key)),
    stepsAfterStairs: boundedFiniteOrNull(
      details.stepsAfterStairs ?? (
        Number.isFinite(Number(details.state?.currentRun?.floorSteps?.[key])) &&
        Number.isFinite(Number(stairsStepByFloor.get(key)))
          ? Number(details.state.currentRun.floorSteps[key]) - Number(stairsStepByFloor.get(key))
          : null
      )
    ),
    stairsDiscovered: Boolean(details.stairsDiscovered),
    floorCompleted: Boolean(details.floorCompleted),
    chestsDiscovered: boundedFiniteOrNull(details.chestsDiscovered),
    chestsSkipped: boundedFiniteOrNull(details.chestsSkipped),
    explorationMode: normalizeOptionalStableValue(details.explorationMode, new Set(["discovery", "known_route", "unknown"]))
  });
}

export function trackValuableLocation(locationType, action, details = {}) {
  if (!isTelemetryAvailable() || !runId) return;
  const floor = boundedFiniteOrNull(details.floor ?? details.state?.floor);
  const x = boundedFiniteOrNull(details.x ?? details.state?.x, 0, 1000);
  const y = boundedFiniteOrNull(details.y ?? details.state?.y, 0, 1000);
  const normalizedType = normalizeStableValue(locationType, SAFE_LOCATION_TYPES);
  const normalizedAction = normalizeStableValue(action, SAFE_LOCATION_ACTIONS);
  const semanticKey = `location:${floor}:${x}:${y}:${normalizedType}:${normalizedAction}`;
  if (hasSemanticEvent(semanticKey)) return;
  capture("valuable_location", {
    runId,
    ...safeDecisionContext({ state: details.state, character: details.character }),
    floor,
    locationType: normalizedType,
    action: normalizedAction,
    distanceFromStart: boundedFiniteOrNull(details.distanceFromStart, 0, 1000),
    source: normalizeLootSource(details.source || "dungeon")
  });
}

export function trackPortalDecision(decision, details = {}) {
  if (!isTelemetryAvailable() || !runId) return;
  const normalizedDecision = decision === "continue" ? "push" : normalizeStableValue(decision, SAFE_PORTAL_DECISIONS);
  const stateSnapshot = details.state || null;
  const summary = getUnbankedLootSummary(stateSnapshot);
  capture("portal_decision", {
    runId,
    ...safeDecisionContext({ state: stateSnapshot, character: details.character }),
    portalType: normalizeStableValue(details.portalType, SAFE_PORTAL_TYPES),
    decision: normalizedDecision,
    hpRate: boundedFiniteOrNull(details.hpRate ?? safeDecisionContext({ state: stateSnapshot, character: details.character }).hpRate, 0, 1),
    mpRate: boundedFiniteOrNull(details.mpRate ?? safeDecisionContext({ state: stateSnapshot, character: details.character }).mpRate, 0, 1),
    freeInventorySlots: buildResourceSnapshot(stateSnapshot).inventoryFreeSlots,
    unbankedObjectLootCount: summary.count,
    unbankedObjectLootValueProxy: summary.valueProxy,
    wingOwned: Boolean(details.wingOwned),
    wingSalvageCount: boundedFiniteOrNull(details.wingSalvageCount, 0, 2),
    nextBandMainId: normalizeOptionalStableValue(details.nextBandMainId, SAFE_BAND_TRIAL_IDS),
    nextBandSubId: normalizeOptionalStableValue(details.nextBandSubId, SAFE_BAND_TRIAL_IDS)
  });
}

export function trackEliteDecision(decision, details = {}) {
  if (!isTelemetryAvailable() || !runId) return;
  const stateSnapshot = details.state || null;
  const elite = details.elite || details.monster || null;
  capture("elite_decision", {
    runId,
    ...safeDecisionContext({ state: stateSnapshot, character: details.character, combat: details.combat }),
    floor: boundedFiniteOrNull(details.floor ?? elite?.floor ?? stateSnapshot?.floor),
    decision: normalizeStableValue(decision, SAFE_ELITE_DECISIONS),
    eliteId: normalizeEliteId(elite),
    contactMode: normalizeStableValue(details.contactMode, SAFE_ELITE_CONTACT_MODES),
    distance: boundedFiniteOrNull(details.distance, 0, 100),
    detected: Boolean(details.detected ?? elite?.detected),
    elitePolicy: normalizeOptionalStableValue(details.elitePolicy, new Set(["engage", "avoid", "adaptive", "unknown"])),
    unbankedObjectLootCount: getUnbankedLootSummary(stateSnapshot).count
  });
}

export function trackBleedingEvent(event, details = {}) {
  const normalizedEvent = normalizeStableValue(event, SAFE_BLEEDING_EVENTS);
  capture(`bleeding_${normalizedEvent}`, {
    floor: boundedFiniteOrNull(details.floor),
    playerClass: normalizeClass(details.playerClass),
    enemyId: normalizeEnemyId(details.enemyId),
    isBoss: Boolean(details.isBoss),
    isMidboss: Boolean(details.isMidboss),
    remainingTurns: boundedFiniteOrNull(details.remainingTurns),
    payoffDamage: boundedFiniteOrNull(details.payoffDamage),
    reason: normalizeOptionalStableValue(details.reason, SAFE_BLEEDING_REASONS),
    source: normalizeOptionalStableValue(details.source, SAFE_BLEEDING_SOURCES),
    buildKey: normalizeBleedingBuildKey(details.buildKey),
    damageContribution: boundedFiniteOrNull(details.damageContribution),
    directDamage: boundedFiniteOrNull(details.directDamage)
  });
}

export function trackVulnerableEvent(event, details = {}) {
  const normalizedEvent = normalizeStableValue(event, SAFE_VULNERABLE_EVENTS);
  capture(`vulnerable_${normalizedEvent}`, {
    floor: boundedFiniteOrNull(details.floor),
    playerClass: normalizeClass(details.playerClass),
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
    ...safeDecisionContext({
      state: details.state,
      character: details.character,
      combat: details.combat
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

  capture("run_start", {
    runId,
    ...safeDecisionContext({ state: stateSnapshot, character }),
    playerClass: normalizeClass(character?.class ?? run?.characterClass),
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
    startingWingCount: buildResourceSnapshot(stateSnapshot).consumableReturnCount,
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
    playerClass: normalizeClass(combat?.player?.class),
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
    playerClass: normalizeClass(damage?.playerClass),
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
    mpWardActive: Boolean(damage?.mpWardActive),
    isDefending: Boolean(damage?.isDefending)
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
    playerClass: normalizeClass(run?.characterClass),
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
    )
  });
  runId = null;
  combatId = null;
  combatEnded = false;
}

export function trackCombatDecision(action, details = {}) {
  if (!isTelemetryAvailable() || !runId || !combatId) return;
  const combat = details.combat || details.state?.combatState || null;
  const monsters = combat?.monsters || [];
  const normalizedAction = normalizeDecisionAction(action);
  const spellId = getSafeSpellId(details.spellName);
  const spellTarget = spellId && spellId !== "other" ? SPELLS[spellId]?.target : null;
  const isAllyTarget = normalizedAction === "item" ||
    normalizedAction === "spell" && spellTarget === "single_ally";
  const isEnemyTarget = normalizedAction === "attack" ||
    normalizedAction === "spell" && ["single_enemy", "all_enemies"].includes(spellTarget);
  const targetCollectionSize = isAllyTarget
    ? details.state?.party?.length
    : isEnemyTarget
      ? monsters.length
      : 0;
  const target = isEnemyTarget && Number.isInteger(details.targetIdx)
    ? monsters[details.targetIdx]
    : null;
  capture("combat_decision", {
    runId,
    combatId,
    ...safeDecisionContext({ state: details.state, character: details.character, combat }),
    action: normalizedAction,
    actorIndex: normalizeCombatIndex(details.actorIdx, details.state?.party?.length),
    targetIndex: normalizeCombatIndex(
      details.targetIdx,
      targetCollectionSize,
      normalizedAction === "spell" && ["all_enemies", "all_allies"].includes(spellTarget)
    ),
    targetEnemyId: target ? normalizeEnemyId(target.name) : null,
    spellId,
    itemId: getSafeItemId(details.itemKey),
    itemCategory: getItemCategory(details.itemKey)
  });
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
  capture("exploration_decision", {
    runId,
    ...safeDecisionContext({ state: details.state, character: details.character }),
    action: normalizeDecisionAction(action),
    source: normalizeStableValue(details.source, SAFE_CELL_EVENTS),
    spellId,
    targetIndex: normalizeTargetIndex(details.targetIdx, details.state?.party?.length),
    targetType: normalizeOptionalStableValue(details.targetType ?? spellTarget, SAFE_SPELL_TARGET_TYPES),
    itemId: getSafeItemId(details.itemKey),
    itemCategory: getItemCategory(details.itemKey),
    direction: normalizeDirection(details.direction)
  });
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
  capture("equipment_decision", {
    runId,
    ...safeDecisionContext({ state: details.state, character: details.character }),
    action: normalizeDecisionAction(action),
    candidateId: getSafeItemId(details.candidateKey),
    currentEquipmentId: getSafeItemId(details.currentKey ?? preview.oldEq),
    candidateBuildRole,
    currentBuildRole,
    buildDecision,
    slot: normalizeOptionalStableValue(preview.slot, new Set(EQUIPMENT_SLOTS.map(entry => entry.id))),
    candidateRarity: details.candidateKey?.identified === true ? normalizeRarity(preview.item?.rarity) : null,
    candidateIdentified: details.candidateKey == null || typeof details.candidateKey !== "object" || details.candidateKey.identified === true,
    candidateEnhancementLevel: boundedFiniteOrNull(details.candidateKey?.enhanceLevel ?? 0, -MAX_RESOURCE_VALUE),
    primaryDiff: boundedFiniteOrNull(preview.primaryDiff, -MAX_RESOURCE_VALUE),
    comparisonStatKeys: diffRows.map(row => normalizeStableValue(row?.key, SAFE_COMPARISON_STAT_KEYS)).slice(0, MAX_AFFIX_SNAPSHOT),
    comparisonDiffs: diffRows.map(row => boundedFiniteOrNull(row?.diff, -MAX_RESOURCE_VALUE)).slice(0, MAX_AFFIX_SNAPSHOT),
    comparisonAvailable: diffRows.length > 0
  });
  if (buildDecision === "transition") {
    capture("build_shift", {
      runId,
      ...safeDecisionContext({ state: details.state, character: details.character }),
      action: normalizeDecisionAction(action),
      fromBuildRole: currentBuildRole,
      toBuildRole: candidateBuildRole,
      fromEquipmentId: getSafeItemId(details.currentKey ?? preview.oldEq),
      toEquipmentId: getSafeItemId(details.candidateKey),
      reason: "main_core_axis_changed"
    });
  }
}

export function __setTelemetryClientForTests(testClient) {
  const queuedEvents = testClient ? pendingEvents : [];
  pendingEvents = [];
  pendingCombatDecisions = [];
  client = testClient ?? null;
  telemetryState = testClient ? "ready" : "disabled";
  runId = null;
  combatId = null;
  combatEnded = false;
  semanticEventKeys = new Set();
  discoveredStairKeys = new Set();
  exploredFloorKeys = new Set();
  stairsStepByFloor = new Map();
  queuedEvents.forEach(({ eventName, properties }) => captureWithClient(eventName, properties));
}

export function __setTelemetryInitializationForTests({ enabled = false } = {}) {
  client = null;
  telemetryState = enabled ? "loading" : "disabled";
  pendingEvents = [];
  pendingCombatDecisions = [];
  runId = null;
  combatId = null;
  combatEnded = false;
  semanticEventKeys = new Set();
  discoveredStairKeys = new Set();
  exploredFloorKeys = new Set();
  stairsStepByFloor = new Map();
}

export function __resetTelemetryForTests() {
  __setTelemetryClientForTests(null);
}

initializeTelemetry();
