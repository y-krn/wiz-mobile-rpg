// balance-impact: none — typed view contract and existing runtime guards only.
import { EVENT_SUBMENU_TYPES, ITEM_SUBMENU_TYPES } from "../constants/events.js";
import { SPELLS } from "../data/spells.js";
import { isSpellcaster } from "../rules/magic_rules.js";
import { getActiveSpellKeys } from "../rules/magic_rules.js";
import { getCharMaxMp } from "../rules/character_stats.js";

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
] as const);

export type GameState = typeof GAME_STATES[number];
export type NonSubmenuGameState = Exclude<GameState, "submenu">;
export type MenuTargetType = "" | "enemy" | "ally";
export type SpellTargetType = "single_enemy" | "all_enemies" | "single_ally" | "all_allies" | "utility";
export type CombatPartyStatus = "ok" | "poisoned" | "blind" | "sleep" | "paralyze" | "paralyzed" | "dead";
export type CombatActionableStatus = "ok" | "poisoned" | "blind";
export type SpellKey = keyof typeof SPELLS;

export interface NormalizedMenuContext {
  type: string;
  targetType: MenuTargetType;
  actorIdx: number;
  spellName: string;
  itemKey: string;
  itemIdx: number;
  prevGameState: NonSubmenuGameState | null;
  slot: string;
}

export interface MenuHistoryEntry extends NormalizedMenuContext {
  title: string;
}

export interface ScreenViewSnapshot {
  readonly gameState: GameState;
  readonly menuType: string;
  readonly previousGameState: NonSubmenuGameState | null;
  readonly isSubmenu: boolean;
  readonly isDeparturePrepSubmenu: boolean;
  readonly isWorkshopSubmenu: boolean;
  readonly isTownSubmenu: boolean;
  readonly isCombatOverlaySubmenu: boolean;
  readonly isUsableCombatOverlaySubmenu: boolean;
  readonly isSpellOverlaySubmenu: boolean;
  readonly isUsableSpellOverlaySubmenu: boolean;
  readonly isEventSubmenu: boolean;
  readonly isItemSubmenu: boolean;
  readonly hasMap: boolean;
  readonly hasCurrentCell: boolean;
  readonly hasCombat: boolean;
  readonly hasStructurallyUsableCombatParty: boolean;
  readonly hasUsableCombatActor: boolean;
  readonly isActionableCombat: boolean;
  readonly hasChest: boolean;
}

export interface CombatActor {
  readonly name: string;
  readonly status: CombatPartyStatus;
  readonly [key: string]: unknown;
}

export type CombatParty = CombatActor[];

export interface UsableCombatState {
  readonly monsters: Record<string, unknown>[];
  readonly [key: string]: unknown;
}

export interface UsableMapCell {
  readonly type: string;
  readonly walls: readonly [boolean, boolean, boolean, boolean];
  readonly [key: string]: unknown;
}

export type UsableMap = UsableMapCell[][];
export type RawViewState = Record<string, unknown>;

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
const SAFE_PREVIOUS_STATES = new Set<NonSubmenuGameState>(GAME_STATES.filter(
  (gameState): gameState is NonSubmenuGameState => gameState !== "submenu"
));
const COMBAT_PARTY_STATUSES = new Set<CombatPartyStatus>([
  "ok", "poisoned", "blind", "sleep", "paralyze", "paralyzed", "dead"
]);
function isCombatActionableStatus(status: CombatPartyStatus): status is CombatActionableStatus {
  return status === "ok" || status === "poisoned" || status === "blind";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUsableMapCell(cell: unknown): cell is UsableMapCell {
  if (!isRecord(cell) || typeof cell.type !== "string" || !Array.isArray(cell.walls) || cell.walls.length !== 4) {
    return false;
  }
  return cell.walls.every(wall => typeof wall === "boolean");
}

function getUsableCaster(party: unknown, actorIdx: unknown): Record<string, unknown> | null {
  const index = typeof actorIdx === "number" && Number.isInteger(actorIdx) && actorIdx >= 0 ? actorIdx : null;
  if (!Array.isArray(party) || index === null || !Object.hasOwn(party, index)) return null;
  const members: unknown[] = party;
  const actor = members[index];
  if (!isRecord(actor) || actor.status === "dead" || !isSpellcaster(actor) || getCharMaxMp(actor) <= 0) return null;
  return actor;
}

function hasUsableCaster(party: unknown, actorIdx: unknown): boolean {
  return Boolean(getUsableCaster(party, actorIdx));
}

export function isUsableSpellKey(spellName: unknown): spellName is SpellKey {
  return typeof spellName === "string" && Object.hasOwn(SPELLS, spellName) &&
    isRecord(SPELLS[spellName as keyof typeof SPELLS]);
}

export function getUsableSpellKeys(spellKeys: unknown): SpellKey[] {
  return Array.isArray(spellKeys) ? spellKeys.filter(isUsableSpellKey) : [];
}

export function isUsableSpellForActor(
  party: unknown,
  actorIdx: unknown,
  spellName: unknown,
  targetTypes: SpellTargetType | readonly SpellTargetType[] | null = null
): boolean {
  const caster = getUsableCaster(party, actorIdx);
  if (!caster || !isUsableSpellKey(spellName) || !getUsableSpellKeys(getActiveSpellKeys(caster)).includes(spellName)) return false;
  if (targetTypes === null) return true;
  const acceptedTargets = Array.isArray(targetTypes) ? targetTypes : [targetTypes];
  return acceptedTargets.some(target => target === SPELLS[spellName].target);
}

export function hasStructurallyUsableCombatParty(party: unknown): party is CombatParty {
  if (!Array.isArray(party) || party.length === 0) return false;
  for (let index = 0; index < party.length; index++) {
    const actor = party[index];
    if (!Object.hasOwn(party, index) || !isRecord(actor) || typeof actor.name !== "string" ||
      !COMBAT_PARTY_STATUSES.has(actor.status as CombatPartyStatus)) return false;
  }
  return true;
}

export function hasUsableCombatActor(party: unknown): boolean {
  return hasStructurallyUsableCombatParty(party) && party.some(actor => isCombatActionableStatus(actor.status));
}

// Incapacitated characters still receive a combat turn so round resolution can
// consume their status. They are deliberately excluded from player action UI.
export function hasCombatRoundActor(party: unknown): boolean {
  return hasStructurallyUsableCombatParty(party) && party.some(actor => actor.status !== "dead");
}

export function isUsableCombatState(combatState: unknown): combatState is UsableCombatState {
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

export function isUsableMap(map: unknown): map is UsableMap {
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

function normalizeIndex(value: unknown, fallback = -1): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fallback;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function isGameState(value: unknown): value is GameState {
  return typeof value === "string" && GAME_STATE_SET.has(value as GameState);
}

export function normalizeGameState(value: unknown, fallback: GameState = "explore"): GameState {
  return isGameState(value) ? value : fallback;
}

export function normalizeSubmenuType(value: unknown): string {
  return typeof value === "string" && value.trim() ? value : "";
}

export function normalizePreviousGameState(value: unknown): NonSubmenuGameState | null {
  if (!isGameState(value) || value === "submenu" || !SAFE_PREVIOUS_STATES.has(value)) return null;
  return value;
}

/**
 * Canonical menu context consumed by screen renderers and navigation:
 * { type, targetType, actorIdx, spellName, itemKey, itemIdx,
 *   prevGameState, slot }.
 */
export function normalizeMenuContext(value: unknown): NormalizedMenuContext {
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

export function applyMenuContext(target: NormalizedMenuContext, value: unknown): NormalizedMenuContext {
  const normalized = normalizeMenuContext(value);
  Object.assign(target, normalized);
  return target;
}

export function createMenuHistoryEntry(value: unknown, title = ""): MenuHistoryEntry {
  const context = normalizeMenuContext(value);
  return {
    ...context,
    title: normalizeText(title)
  };
}

export function normalizeMenuHistoryEntry(value: unknown): MenuHistoryEntry | null {
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
export function getScreenViewState(
  stateLike: unknown,
  menuContextLike: unknown
): ScreenViewSnapshot {
  const source = isRecord(stateLike) ? stateLike : {};
  const gameState = normalizeGameState(source.gameState);
  const menu = normalizeMenuContext(menuContextLike);
  const isSubmenu = gameState === "submenu";
  const menuType = isSubmenu ? menu.type : "";
  const previousGameState = isSubmenu ? menu.prevGameState : null;
  const combatState = isRecord(source.combatState) ? source.combatState : null;
  const hasCombat = isUsableCombatState(combatState);
  const hasChest = isRecord(source.chestState);
  const map = source.map;
  const hasMap = isUsableMap(map);
  const x = typeof source.x === "number" && Number.isInteger(source.x) ? source.x : null;
  const y = typeof source.y === "number" && Number.isInteger(source.y) ? source.y : null;
  const currentRow = hasMap && y !== null ? map[y] : null;
  const hasCurrentCell = x !== null && y !== null && isUsableMapCell(currentRow?.[x]);
  const isCombatOverlaySubmenu = isSubmenu && previousGameState === "combat" && SUBMENU_OVERLAY_TYPES.has(menuType);
  const hasStructurallyUsableCombatPartyState = hasStructurallyUsableCombatParty(source.party);
  const hasUsableCombatParty = hasUsableCombatActor(source.party);
  const isActionableCombat = (gameState === "combat" || isCombatOverlaySubmenu) && hasCombat &&
    hasUsableCombatParty && combatState.phase === "choose_actions" && source.transitioning === false;
  const isSpellOverlaySubmenu = isSubmenu && previousGameState === "explore" && hasMap && hasCurrentCell && SPELL_OVERLAY_TYPES.has(menuType);
  const usableCaster = hasUsableCaster(source.party, menu.actorIdx);
  const isUsableCombatOverlaySubmenu = Boolean(isCombatOverlaySubmenu && isActionableCombat && (
      menuType === "combat_spell"
        ? Boolean(usableCaster)
      : menuType === "combat_target"
        ? menu.targetType === "enemy"
          ? !menu.spellName || isUsableSpellForActor(source.party, menu.actorIdx, menu.spellName, "single_enemy")
          : menu.targetType === "ally" && (!menu.spellName || isUsableSpellForActor(source.party, menu.actorIdx, menu.spellName, "single_ally"))
        : menuType === "combat_item"
  ));
  const isUsableSpellOverlaySubmenu = Boolean(isSpellOverlaySubmenu && usableCaster && (
    menuType !== "spell_target_ally" || isUsableSpellForActor(source.party, menu.actorIdx, menu.spellName, "single_ally")
  ));

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
    isEventSubmenu: isSubmenu && (menuType === "chest_menu" || menuType === "pending_rewards" || EVENT_SUBMENU_TYPES.includes(menuType)),
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

export function isUsableCombatScreen(stateLike: unknown, menuContextLike: unknown): boolean {
  const view = getScreenViewState(stateLike, menuContextLike);
  return view.gameState === "combat" && view.hasCombat;
}

export function isActionableCombatScreen(stateLike: unknown, menuContextLike: unknown): boolean {
  const view = getScreenViewState(stateLike, menuContextLike);
  return view.gameState === "combat" && view.isActionableCombat;
}

export function isActionableCombatContext(stateLike: unknown, menuContextLike: unknown): boolean {
  return getScreenViewState(stateLike, menuContextLike).isActionableCombat;
}
