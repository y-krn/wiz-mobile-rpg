import { EVENT_SUBMENU_TYPES, ITEM_SUBMENU_TYPES } from "../constants/events.js";

// Canonical boundary shape shared by navigation, UI, and the renderer.
// Gameplay state remains owned by state/state_core.js; this module only
// validates the transient screen/context values that cross into view code.
export const GAME_STATES = Object.freeze([
  "town",
  "explore",
  "combat",
  "chest",
  "submenu",
  "trap_encounter",
  "equip_overlay",
  "result",
  "gameover",
  "victory"
]);

const GAME_STATE_SET = new Set(GAME_STATES);
const SUBMENU_OVERLAY_TYPES = new Set([
  "combat_target",
  "combat_spell",
  "combat_item",
  "spell_caster_select",
  "spell_select",
  "spell_target_ally"
]);
const TOWN_SUBMENU_TYPES = new Set(["castle_main", "castle_death_logs", "workshop_main"]);
const SAFE_PREVIOUS_STATES = new Set(GAME_STATES.filter(gameState => gameState !== "submenu"));

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeIndex(value, fallback = -1) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function normalizeText(value) {
  return typeof value === "string" ? value : "";
}

export function isGameState(value) {
  return GAME_STATE_SET.has(value);
}

export function normalizeGameState(value, fallback = "explore") {
  return isGameState(value) ? value : fallback;
}

export function normalizeSubmenuType(value) {
  return typeof value === "string" && value.trim() ? value : "";
}

export function normalizePreviousGameState(value) {
  return SAFE_PREVIOUS_STATES.has(value) ? value : null;
}

/**
 * Canonical menu context consumed by screen renderers and navigation:
 * { type, targetType, actorIdx, spellName, itemKey, itemIdx,
 *   prevGameState, slot }.
 */
export function normalizeMenuContext(value) {
  const source = isRecord(value) ? value : {};
  return {
    type: normalizeSubmenuType(source.type),
    targetType: source.targetType === "enemy" || source.targetType === "ally" ? source.targetType : "",
    actorIdx: normalizeIndex(source.actorIdx),
    spellName: normalizeText(source.spellName),
    itemKey: normalizeText(source.itemKey),
    itemIdx: normalizeIndex(source.itemIdx),
    prevGameState: normalizePreviousGameState(source.prevGameState),
    slot: normalizeText(source.slot)
  };
}

export function applyMenuContext(target, value) {
  const normalized = normalizeMenuContext(value);
  Object.assign(target, normalized);
  return target;
}

export function createMenuHistoryEntry(value, title = "") {
  const context = normalizeMenuContext(value);
  return {
    ...context,
    title: normalizeText(title)
  };
}

export function normalizeMenuHistoryEntry(value) {
  if (!isRecord(value)) return null;
  const context = normalizeMenuContext(value);
  if (!context.type) return null;
  return {
    ...context,
    title: normalizeText(value.title)
  };
}

/**
 * One snapshot is taken per render/navigation operation. Consumers must use
 * these fields rather than interpreting raw state.gameState/menuContext.
 */
export function getScreenViewState(stateLike, menuContextLike) {
  const source = isRecord(stateLike) ? stateLike : {};
  const gameState = normalizeGameState(source.gameState);
  const menu = normalizeMenuContext(menuContextLike);
  const isSubmenu = gameState === "submenu";
  const menuType = isSubmenu ? menu.type : "";
  const previousGameState = isSubmenu ? menu.prevGameState : null;
  const combatState = isRecord(source.combatState) ? source.combatState : null;
  const hasCombat = Boolean(combatState && Array.isArray(combatState.monsters));
  const hasChest = isRecord(source.chestState);

  return Object.freeze({
    gameState,
    menuType,
    previousGameState,
    isSubmenu,
    isDeparturePrepSubmenu: isSubmenu && menuType === "solo_start",
    isWorkshopSubmenu: isSubmenu && menuType === "workshop_main",
    isTownSubmenu: isSubmenu && TOWN_SUBMENU_TYPES.has(menuType),
    isCombatOverlaySubmenu: isSubmenu && SUBMENU_OVERLAY_TYPES.has(menuType),
    isEventSubmenu: isSubmenu && (menuType === "chest_menu" || menuType === "chest_disarmer_select" || menuType === "chest_opener_select" || EVENT_SUBMENU_TYPES.includes(menuType)),
    isItemSubmenu: isSubmenu && ITEM_SUBMENU_TYPES.includes(menuType),
    hasMap: Array.isArray(source.map),
    hasCombat,
    hasChest
  });
}
