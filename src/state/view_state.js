import { EVENT_SUBMENU_TYPES, ITEM_SUBMENU_TYPES } from "../constants/events.js";
import { SPELLS } from "../data/spells.js";
import { isSpellcaster } from "../rules/class_rules.js";

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
const SPELL_OVERLAY_TYPES = new Set(["spell_caster_select", "spell_select", "spell_target_ally"]);
const TOWN_SUBMENU_TYPES = new Set(["castle_main", "castle_death_logs", "workshop_main", "run_quest_board"]);
const SAFE_PREVIOUS_STATES = new Set(GAME_STATES.filter(gameState => gameState !== "submenu"));
const COMBAT_PARTY_STATUSES = new Set(["ok", "poisoned", "blind", "sleep", "paralyze", "paralyzed", "dead"]);
const COMBAT_ACTIONABLE_STATUSES = new Set(["ok", "poisoned", "blind"]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUsableMapCell(cell) {
  return isRecord(cell) && typeof cell.type === "string" &&
    Array.isArray(cell.walls) && cell.walls.length === 4 &&
    cell.walls.every(wall => typeof wall === "boolean");
}

function getUsableCaster(party, actorIdx) {
  if (!Array.isArray(party) || !Number.isInteger(actorIdx) || actorIdx < 0 || !Object.hasOwn(party, actorIdx)) return null;
  const actor = party[actorIdx];
  if (!isRecord(actor) || actor.status === "dead" || !isSpellcaster(actor) || !Number.isFinite(actor.maxMp) || actor.maxMp <= 0 || !Array.isArray(actor.spells)) return null;
  return actor;
}

function hasUsableCaster(party, actorIdx) {
  return Boolean(getUsableCaster(party, actorIdx));
}

export function isUsableSpellKey(spellName) {
  return typeof spellName === "string" && Object.hasOwn(SPELLS, spellName) && isRecord(SPELLS[spellName]);
}

export function getUsableSpellKeys(spellKeys) {
  return Array.isArray(spellKeys) ? spellKeys.filter(isUsableSpellKey) : [];
}

export function isUsableSpellForActor(party, actorIdx, spellName, targetTypes = null) {
  const caster = getUsableCaster(party, actorIdx);
  if (!caster || !isUsableSpellKey(spellName) || !getUsableSpellKeys(caster.spells).includes(spellName)) return false;
  if (targetTypes === null) return true;
  const acceptedTargets = Array.isArray(targetTypes) ? targetTypes : [targetTypes];
  return acceptedTargets.includes(SPELLS[spellName].target);
}

export function hasStructurallyUsableCombatParty(party) {
  if (!Array.isArray(party) || party.length === 0) return false;
  for (let index = 0; index < party.length; index++) {
    const actor = party[index];
    if (!Object.hasOwn(party, index) || !isRecord(actor) || typeof actor.name !== "string" || !COMBAT_PARTY_STATUSES.has(actor.status)) return false;
  }
  return true;
}

export function hasUsableCombatActor(party) {
  return hasStructurallyUsableCombatParty(party) && party.some(actor => COMBAT_ACTIONABLE_STATUSES.has(actor.status));
}

// Incapacitated characters still receive a combat turn so round resolution can
// consume their status. They are deliberately excluded from player action UI.
export function hasCombatRoundActor(party) {
  return hasStructurallyUsableCombatParty(party) && party.some(actor => actor.status !== "dead");
}

export function isUsableCombatState(combatState) {
  if (!isRecord(combatState) || !Array.isArray(combatState.monsters) || combatState.monsters.length === 0) {
    return false;
  }
  for (let index = 0; index < combatState.monsters.length; index++) {
    if (!Object.hasOwn(combatState.monsters, index) || !isRecord(combatState.monsters[index])) {
      return false;
    }
  }
  return true;
}

export function isUsableMap(map) {
  if (!Array.isArray(map) || map.length === 0) return false;
  const width = map[0]?.length;
  if (!Number.isInteger(width) || width === 0) return false;
  for (let y = 0; y < map.length; y++) {
    if (!Object.hasOwn(map, y) || !Array.isArray(map[y]) || map[y].length !== width) return false;
    for (let x = 0; x < map[y].length; x++) {
      if (!Object.hasOwn(map[y], x) || !isUsableMapCell(map[y][x])) return false;
    }
  }
  return true;
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
  const hasCombat = isUsableCombatState(combatState);
  const hasChest = isRecord(source.chestState);
  const hasMap = isUsableMap(source.map);
  const currentRow = hasMap ? source.map[source.y] : null;
  const hasCurrentCell = Number.isInteger(source.x) && Number.isInteger(source.y) &&
    isUsableMapCell(currentRow?.[source.x]);
  const isCombatOverlaySubmenu = isSubmenu && previousGameState === "combat" && SUBMENU_OVERLAY_TYPES.has(menuType);
  const hasStructurallyUsableCombatPartyState = hasStructurallyUsableCombatParty(source.party);
  const hasUsableCombatParty = hasUsableCombatActor(source.party);
  const isActionableCombat = (gameState === "combat" || isCombatOverlaySubmenu) && hasCombat &&
    hasUsableCombatParty && combatState.phase === "choose_actions" && source.transitioning === false;
  const isSpellOverlaySubmenu = isSubmenu && previousGameState === "explore" && hasMap && hasCurrentCell && SPELL_OVERLAY_TYPES.has(menuType);
  const usableCaster = hasUsableCaster(source.party, menu.actorIdx);
  const isUsableCombatOverlaySubmenu = isCombatOverlaySubmenu && isActionableCombat && (
      menuType === "combat_spell"
        ? usableCaster
      : menuType === "combat_target"
        ? menu.targetType === "enemy"
          ? !menu.spellName || isUsableSpellForActor(source.party, menu.actorIdx, menu.spellName, "single_enemy")
          : menu.targetType === "ally" && (!menu.spellName || isUsableSpellForActor(source.party, menu.actorIdx, menu.spellName, "single_ally"))
        : menuType === "combat_item"
  );
  const isUsableSpellOverlaySubmenu = isSpellOverlaySubmenu && usableCaster && (
    menuType !== "spell_target_ally" || isUsableSpellForActor(source.party, menu.actorIdx, menu.spellName, "single_ally")
  );

  return Object.freeze({
    gameState,
    menuType,
    previousGameState,
    isSubmenu,
    isDeparturePrepSubmenu: isSubmenu && menuType === "solo_start",
    isWorkshopSubmenu: isSubmenu && menuType === "workshop_main",
    isTownSubmenu: isSubmenu && TOWN_SUBMENU_TYPES.has(menuType),
    isCombatOverlaySubmenu,
    isUsableCombatOverlaySubmenu,
    isSpellOverlaySubmenu,
    isUsableSpellOverlaySubmenu,
    isEventSubmenu: isSubmenu && (menuType === "chest_menu" || menuType === "chest_disarmer_select" || menuType === "chest_opener_select" || EVENT_SUBMENU_TYPES.includes(menuType)),
    isItemSubmenu: isSubmenu && ITEM_SUBMENU_TYPES.includes(menuType),
    hasMap,
    hasCurrentCell,
    hasCombat,
    hasStructurallyUsableCombatParty: hasStructurallyUsableCombatPartyState,
    hasUsableCombatActor: hasUsableCombatParty,
    isActionableCombat,
    hasChest
  });
}

export function isUsableCombatScreen(stateLike, menuContextLike) {
  const view = getScreenViewState(stateLike, menuContextLike);
  return view.gameState === "combat" && view.hasCombat;
}

export function isActionableCombatScreen(stateLike, menuContextLike) {
  const view = getScreenViewState(stateLike, menuContextLike);
  return view.gameState === "combat" && view.isActionableCombat;
}

export function isActionableCombatContext(stateLike, menuContextLike) {
  return getScreenViewState(stateLike, menuContextLike).isActionableCombat;
}
