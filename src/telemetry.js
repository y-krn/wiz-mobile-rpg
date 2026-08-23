import {
  getCharAgi,
  getCharAttackBreakdown,
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

// v2 changes the legacy run_end deathCause value from arbitrary cause text to a
// bounded category. This is the only existing property whose semantics changed;
// all other v1 event names and properties remain compatible.
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
const INVENTORY_CAPACITY = 20;
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
const SAFE_CELL_TYPES = new Set(["floor", "stairs-up", "stairs-down", "pitfall", "room"]);
const SAFE_CELL_EVENTS = new Set([
  "chest",
  "midboss",
  "boss",
  "event_spring",
  "event_camp",
  "event_tablet",
  "merchant",
  "return_portal",
  "explore_management",
  "stairs-down"
]);

let client = null;
let telemetryState = "uninitialized";
let pendingEvents = [];
let runId = null;
let combatId = null;
let combatEnded = false;
let fallbackIdCounter = 0;

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

function normalizeStatus(status) {
  return SAFE_STATUSES.has(status) ? status : "other";
}

function normalizeStableValue(value, allowedValues) {
  return allowedValues.has(value) ? value : "other";
}

function getSafeItemId(itemKey) {
  const id = getItemBaseId(itemKey);
  return typeof id === "string" && id.trim() ? id : null;
}

function getItemCategory(itemKey) {
  const id = getSafeItemId(itemKey);
  const item = getItemData(itemKey);
  if (!item || !id) return "unknown";
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
    ? itemKey.affixes
    : [];
  return {
    count: affixes.length,
    coreCount: affixes.filter(affix => (affix?.kind || "support") === "core").length,
    supportCount: affixes.filter(affix => (affix?.kind || "support") === "support").length,
    types: [...new Set(affixes.map(affix => affix?.type).filter(type => typeof type === "string"))].slice(0, 8)
  };
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
    playerClass: typeof character.class === "string" ? character.class : null,
    level: finiteOrNull(character.level),
    hp: finiteOrNull(character.hp),
    maxHp: finiteOrNull(getCharMaxHp(character)),
    mp: finiteOrNull(character.mp),
    maxMp: finiteOrNull(getCharMaxMp(character)),
    status,
    statuses: [status],
    statusCount: status === "ok" ? 0 : 1,
    attack: finiteOrNull(derived.attack ?? attack.total),
    attackBase: finiteOrNull(attack.base),
    attackEquipment: finiteOrNull(attack.equipment),
    defense: finiteOrNull(derived.defense),
    magic: finiteOrNull(derived.magic),
    healing: finiteOrNull(derived.healing),
    speed: finiteOrNull(derived.speed),
    trap: finiteOrNull(derived.trap),
    treasure: finiteOrNull(derived.treasure),
    str: finiteOrNull(getCharStr(character)),
    int: finiteOrNull(getCharInt(character)),
    pie: finiteOrNull(getCharPie(character)),
    vit: finiteOrNull(getCharVit(character)),
    agi: finiteOrNull(getCharAgi(character)),
    luk: finiteOrNull(getCharLuk(character))
  };
  snapshot.hpRate = snapshot.maxHp > 0 ? snapshot.hp / snapshot.maxHp : null;
  snapshot.mpRate = snapshot.maxMp > 0 ? snapshot.mp / snapshot.maxMp : null;
  SNAPSHOT_STAT_KEYS.forEach(key => {
    snapshot[`affix${key[0].toUpperCase()}${key.slice(1)}`] = finiteOrNull(getCharAffixSum(character, key));
  });
  return snapshot;
}

export function buildEquipmentSnapshot(character) {
  const slots = Object.entries(character?.equipment || {});
  const equipment = slots.map(([slot, itemKey]) => {
    const item = getItemData(itemKey);
    const affixSummary = getAffixSummary(itemKey);
    return {
      slot,
      id: getSafeItemId(itemKey),
      rarity: itemKey?.identified === true ? (item?.rarity ?? null) : null,
      identified: itemKey == null || typeof itemKey !== "object" || itemKey.identified === true,
      enhancementLevel: finiteOrNull(itemKey?.enhanceLevel ?? 0),
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
  const inventory = Array.isArray(stateSnapshot?.inventory) ? stateSnapshot.inventory : [];
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
    identifyTickets: finiteOrNull(stateSnapshot?.identifyTickets),
    runMaterialCount: Object.values(materials).reduce((sum, value) => sum + (Number(value) || 0), 0),
    metaMaterialCount: Object.values(metaMaterials).reduce((sum, value) => sum + (Number(value) || 0), 0)
  };
}

export function buildEnvironmentSnapshot(stateSnapshot, combat = null) {
  const cell = stateSnapshot?.map?.[stateSnapshot?.y]?.[stateSnapshot?.x];
  const run = stateSnapshot?.currentRun;
  const monsters = combat?.monsters || stateSnapshot?.combatState?.monsters || [];
  return {
    floor: finiteOrNull(stateSnapshot?.floor ?? combat?.floor),
    gameState: typeof stateSnapshot?.gameState === "string" ? stateSnapshot.gameState : null,
    currentCellType: normalizeStableValue(cell?.type, SAFE_CELL_TYPES),
    currentCellEvent: normalizeStableValue(cell?.event, SAFE_CELL_EVENTS),
    runDeepestFloor: finiteOrNull(run?.deepestFloor),
    runSteps: finiteOrNull(run?.steps),
    runBattles: finiteOrNull(run?.battles),
    runChestsOpened: finiteOrNull(run?.chestsOpened),
    runTrapsTriggered: finiteOrNull(run?.trapsTriggered),
    enemyIds: monsters.map(monster => normalizeEnemyId(monster?.name)),
    enemyCount: monsters.length,
    enemyAliveCount: monsters.filter(monster => monster?.hp > 0 && !monster?.fled).length,
    enemyBossFlags: monsters.map(monster => Boolean(monster?.isBoss || monster?.boss)),
    isBoss: Boolean(combat?.isBoss ?? stateSnapshot?.combatState?.isBoss),
    isMidboss: Boolean(combat?.isMidboss ?? stateSnapshot?.combatState?.isMidboss),
    isRoamingFlack: Boolean(combat?.isRoamingFlack ?? stateSnapshot?.combatState?.isRoamingFlack),
    combatRound: finiteOrNull(stateSnapshot?.combatState?.roundNumber ?? combat?.roundNumber),
    combatPhase: typeof stateSnapshot?.combatState?.phase === "string" ? stateSnapshot.combatState.phase : null
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
  return normalized || "unknown";
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

function normalizeDecisionAction(action) {
  return {
    fight: "attack",
    attack: "attack",
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

export function trackChestAction(chest, action, details = {}) {
  if (!isTelemetryAvailable() || !runId) return;

  capture("chest_action", {
    runId,
    ...safeDecisionContext({
      state: details.state,
      character: details.character,
      combat: details.combat
    }),
    floor: details.floor,
    chestSource: chest?.fromDrop ? "fromDrop" : "ordinary",
    fromDrop: Boolean(chest?.fromDrop),
    action,
    trap: details.trap,
    inspected: Boolean(chest?.inspected),
    inventoryCount: details.inventoryCount,
    hasTrapKit: details.hasTrapKit,
    rewardCount: details.rewardCount,
    lootAura: chest?.lootHint?.aura
  });
}

export function trackChestSmashResult(chest, details = {}) {
  if (!isTelemetryAvailable() || !runId) return;

  capture("chest_smash_result", {
    runId,
    floor: details.floor,
    chestSource: chest?.fromDrop ? "fromDrop" : "ordinary",
    fromDrop: Boolean(chest?.fromDrop),
    trapFired: Boolean(details.trapFired),
    partyDied: Boolean(details.partyDied),
    rewardCount: details.rewardCount,
    lostRewardCount: details.lostRewardCount,
    lostRewardRoles: details.lostRewardRoles,
    lostRewardCategories: details.lostRewardCategories,
    remainingRewardCount: details.remainingRewardCount,
    awardedRewardCount: details.awardedRewardCount,
    unawardedRewardCount: details.unawardedRewardCount
  });
}

export function trackRunStart(run, character, stateSnapshot = null) {
  if (!isTelemetryAvailable()) return;
  runId = createRuntimeId("run");
  combatId = null;
  combatEnded = false;

  capture("run_start", {
    runId,
    ...safeDecisionContext({ state: stateSnapshot, character }),
    playerClass: character?.class ?? run?.characterClass ?? null,
    level: character?.level,
    startFloor: run?.startFloor,
    // Preserve v1 raw capacity fields while exposing effective capacities via
    // the shared snapshot fields above and these explicit v2 aliases.
    maxHp: finiteOrNull(character?.maxHp),
    maxMp: finiteOrNull(character?.maxMp),
    effectiveMaxHp: finiteOrNull(getCharMaxHp(character)),
    effectiveMaxMp: finiteOrNull(getCharMaxMp(character)),
    equipmentIds: Object.values(character?.equipment ?? {}).filter(value => typeof value === "string")
  });
}

export function trackCombatStart(combat, stateSnapshot = null) {
  if (!isTelemetryAvailable() || !runId) return;
  combatId = createRuntimeId("combat");
  combatEnded = false;

  capture("combat_start", {
    runId,
    combatId,
    ...safeDecisionContext({ state: stateSnapshot, character: combat?.player, combat }),
    floor: combat?.floor,
    playerClass: combat?.player?.class,
    playerHp: combat?.player?.hp,
    playerMp: combat?.player?.mp,
    enemyIds: (combat?.monsters ?? []).map(monster => normalizeEnemyId(monster?.name)),
    isBoss: Boolean(combat?.isBoss),
    isMidboss: Boolean(combat?.isMidboss),
    isRoamingFlack: Boolean(combat?.isRoamingFlack)
  });
}

export function trackDamageReceived(damage) {
  if (!isTelemetryAvailable() || !runId || !combatId) return;

  capture("damage_received", {
    runId,
    combatId,
    floor: damage?.floor,
    playerClass: damage?.playerClass,
    enemyId: normalizeEnemyId(damage?.enemyId),
    attackType: damage?.attackType ?? "other",
    rawDamage: damage?.rawDamage,
    finalDamage: damage?.finalDamage,
    finalDef: damage?.finalDef,
    defResistance: damage?.defResistance,
    playerHpBefore: damage?.playerHpBefore,
    playerHpAfter: damage?.playerHpAfter,
    playerMp: damage?.playerMp,
    mpWardActive: Boolean(damage?.mpWardActive),
    isDefending: Boolean(damage?.isDefending)
  });
}

export function trackCombatEnd(result, combat, stateSnapshot = null) {
  if (!isTelemetryAvailable() || !runId || !combatId || combatEnded) return;
  combatEnded = true;

  capture("combat_end", {
    runId,
    combatId,
    ...safeDecisionContext({ state: stateSnapshot, character: combat?.player, combat }),
    floor: combat?.floor,
    result: normalizeCombatResult(result),
    turns: combat?.turns,
    playerHp: combat?.player?.hp,
    playerMp: combat?.player?.mp,
    enemiesDefeated: (combat?.monsters ?? []).filter(monster => monster?.hp <= 0 && !monster?.fled).length
  });
}

export function trackRunEnd(run, outcome, stateSnapshot = null) {
  if (!isTelemetryAvailable() || !runId) return;

  const latestDeath = Array.isArray(run?.deathLogs) ? run.deathLogs.at(-1) : null;
  const deathType = normalizeDeathType(latestDeath?.type);
  const deathSource = latestDeath?.source ? normalizeEnemyId(latestDeath.source) : null;
  capture("run_end", {
    runId,
    ...safeDecisionContext({ state: stateSnapshot, character: stateSnapshot?.party?.[0] }),
    playerClass: run?.characterClass,
    outcome: normalizeOutcome(outcome),
    returnReason: run?.returnReason ?? null,
    deepestFloor: run?.deepestFloor,
    steps: run?.steps,
    battles: run?.battles,
    kills: run?.kills,
    elitesKilled: run?.elitesKilled,
    bossesKilled: run?.bossesKilled,
    chestsOpened: run?.chestsOpened,
    trapsTriggered: run?.trapsTriggered,
    durationMs: Number.isFinite(run?.startedAt) && run.startedAt > 0
      ? Math.max(0, Date.now() - run.startedAt)
      : null,
    deathType,
    deathSource,
    deathCause: normalizeDeathCause(latestDeath?.cause)
  });
  runId = null;
  combatId = null;
  combatEnded = false;
}

export function trackCombatDecision(action, details = {}) {
  if (!isTelemetryAvailable() || !runId || !combatId) return;
  const combat = details.combat || details.state?.combatState || null;
  const monsters = combat?.monsters || [];
  const target = Number.isInteger(details.targetIdx) ? monsters[details.targetIdx] : null;
  capture("combat_decision", {
    runId,
    combatId,
    ...safeDecisionContext({ state: details.state, character: details.character, combat }),
    action: normalizeDecisionAction(action),
    actorIndex: finiteOrNull(details.actorIdx),
    targetIndex: finiteOrNull(details.targetIdx),
    targetEnemyId: target ? normalizeEnemyId(target.name) : null,
    spellId: typeof details.spellName === "string" ? details.spellName : null,
    itemId: getSafeItemId(details.itemKey),
    itemCategory: getItemCategory(details.itemKey)
  });
}

export function trackExplorationDecision(action, details = {}) {
  if (!isTelemetryAvailable() || !runId) return;
  capture("exploration_decision", {
    runId,
    ...safeDecisionContext({ state: details.state, character: details.character }),
    action: normalizeDecisionAction(action),
    source: normalizeStableValue(details.source, SAFE_CELL_EVENTS),
    itemId: getSafeItemId(details.itemKey),
    itemCategory: getItemCategory(details.itemKey)
  });
}

export function trackEquipmentDecision(action, details = {}) {
  if (!isTelemetryAvailable() || !runId) return;
  const preview = details.preview || {};
  const diffRows = Array.isArray(preview.rows) ? preview.rows : [];
  capture("equipment_decision", {
    runId,
    ...safeDecisionContext({ state: details.state, character: details.character }),
    action: normalizeDecisionAction(action),
    candidateId: getSafeItemId(details.candidateKey),
    currentEquipmentId: getSafeItemId(details.currentKey ?? preview.oldEq),
    slot: typeof preview.slot === "string" ? preview.slot : null,
    candidateRarity: details.candidateKey?.identified === true ? (preview.item?.rarity ?? null) : null,
    candidateIdentified: details.candidateKey == null || typeof details.candidateKey !== "object" || details.candidateKey.identified === true,
    candidateEnhancementLevel: finiteOrNull(details.candidateKey?.enhanceLevel ?? 0),
    primaryDiff: finiteOrNull(preview.primaryDiff),
    comparisonStatKeys: diffRows.map(row => row.key).filter(key => typeof key === "string").slice(0, 24),
    comparisonDiffs: diffRows.map(row => finiteOrNull(row.diff)).slice(0, 24),
    comparisonAvailable: diffRows.length > 0
  });
}

export function __setTelemetryClientForTests(testClient) {
  const queuedEvents = testClient ? pendingEvents : [];
  pendingEvents = [];
  client = testClient ?? null;
  telemetryState = testClient ? "ready" : "disabled";
  runId = null;
  combatId = null;
  combatEnded = false;
  queuedEvents.forEach(({ eventName, properties }) => captureWithClient(eventName, properties));
}

export function __setTelemetryInitializationForTests({ enabled = false } = {}) {
  client = null;
  telemetryState = enabled ? "loading" : "disabled";
  pendingEvents = [];
  runId = null;
  combatId = null;
  combatEnded = false;
}

export function __resetTelemetryForTests() {
  __setTelemetryClientForTests(null);
}

initializeTelemetry();
