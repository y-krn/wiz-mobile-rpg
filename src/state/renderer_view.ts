// balance-impact: none — renderer input projection only; gameplay rules and state mutation are unchanged.
import { EVENT_TYPES, getPartyMaxAffix } from "../data.js";
import { getDepthCorruption, getFloorTheme } from "../data/floor_themes.js";
import { menuContext } from "../navigation.js";
import { state } from "./state_core.js";
import type { MenuTargetType, ScreenViewSnapshot } from "./view_state.js";
import { getScreenViewState } from "./view_state.js";

const RENDERER_INPUT_KIND = "renderer-input";

export type DangerCueSource = "combat" | "map" | "roaming" | "none";

export interface SceneVisibility {
  readonly showTownBackground: boolean;
  readonly showCombat: boolean;
  readonly showChest: boolean;
  readonly showEventScene: boolean;
  readonly showItemMenu: boolean;
}

export interface CombatTargetSelection {
  readonly active: boolean;
  readonly targetType: MenuTargetType;
}

export interface DangerCue {
  readonly active: boolean;
  readonly source: DangerCueSource;
}

export type RawRendererState = Record<string, unknown>;
export type RendererMapRow = readonly unknown[];
export type RendererMap = readonly RendererMapRow[];
export type RendererCollection = readonly unknown[];
export type RendererVisual = Record<string, unknown>;

export interface RendererInput {
  readonly kind: typeof RENDERER_INPUT_KIND;
  readonly view: ScreenViewSnapshot;
  readonly sceneVisibility: SceneVisibility;
  readonly floor: number;
  readonly x: unknown;
  readonly y: unknown;
  readonly dir: unknown;
  readonly map: RendererMap | null;
  readonly visitedMap: unknown;
  readonly mapFragments: RendererCollection;
  readonly mapRevision: unknown;
  readonly lightTurns: unknown;
  readonly lightPower: unknown;
  readonly roamingMonsters: RendererCollection;
  readonly party: RendererCollection;
  readonly combatMonsters: RendererCollection;
  readonly combatTargetSelection: CombatTargetSelection;
  readonly visual: RendererVisual;
  readonly depthCorruption: unknown;
  readonly arcaneSense: unknown;
  readonly hasArcaneSense: boolean;
  readonly dangerCue: DangerCue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isRendererMap(value: unknown): value is RendererMap {
  return isUnknownArray(value) && value.every(isUnknownArray);
}

function isIndexable(value: unknown): value is { [key: string]: unknown } {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

function normalizeFloor(value: unknown): number {
  return Number.isFinite(Number(value)) ? Number(value) : 1;
}

function getSceneVisibility(view: ScreenViewSnapshot): SceneVisibility {
  const { gameState, previousGameState } = view;
  const showTownBackground = !view.hasMap || (
    !view.isDeparturePrepSubmenu && (
      ["town", "result", "gameover", "victory"].includes(gameState) ||
      (view.isSubmenu && previousGameState === "town")
    )
  );
  const showCombat = !showTownBackground && Boolean(
    view.hasCombat && (
      gameState === "combat" || view.isCombatOverlaySubmenu
    )
  );
  const showChest = !showTownBackground && (
    gameState === "chest" ||
    (view.isSubmenu && view.hasChest && view.menuType.startsWith("chest"))
  );
  const showEventScene = !showTownBackground && (
    gameState === "trap_encounter" || view.isEventSubmenu
  );
  const showItemMenu = !showTownBackground && view.isItemSubmenu;

  return Object.freeze({ showTownBackground, showCombat, showChest, showEventScene, showItemMenu });
}

function getDangerCue({
  view,
  map,
  floor,
  x,
  y,
  roamingMonsters,
  combatMonsters,
  combatThreatActive,
  hasArcaneSense
}: {
  view: ScreenViewSnapshot;
  map: RendererMap | null;
  floor: number;
  x: unknown;
  y: unknown;
  roamingMonsters: RendererCollection;
  combatMonsters: RendererCollection;
  combatThreatActive: boolean;
  hasArcaneSense: boolean;
}): DangerCue {
  const livingCombatThreat = view.hasCombat && combatThreatActive && combatMonsters.some((monster) => {
    if (!isRecord(monster)) return false;
    return Number(monster.hp) > 0;
  });
  let nearbyMapThreat = false;
  const playerX = typeof x === "number" && Number.isInteger(x) ? x : 0;
  const playerY = typeof y === "number" && Number.isInteger(y) ? y : 0;
  if (map) {
    const minY = Math.max(0, playerY - 4);
    const maxY = Math.min(map.length - 1, playerY + 4);
    for (let mapY = minY; mapY <= maxY && !nearbyMapThreat; mapY += 1) {
      const row = map[mapY] ?? [];
      const minX = Math.max(0, playerX - 4);
      const maxX = Math.min(row.length - 1, playerX + 4);
      for (let mapX = minX; mapX <= maxX; mapX += 1) {
        if (Math.abs(mapX - playerX) + Math.abs(mapY - playerY) > 4) continue;
        const cell = row[mapX];
        const event = isRecord(cell) ? cell.event : undefined;
        if (event === EVENT_TYPES.BOSS || event === EVENT_TYPES.MIDBOSS) {
          nearbyMapThreat = true;
          break;
        }
      }
    }
  }
  const nearbyRoamingThreat = roamingMonsters.some((monster) => {
    if (!isRecord(monster) || monster.floor !== floor) return false;
    if (monster.perception === "afterimage" && !hasArcaneSense) return false;
    return monster.kind === "elite";
  });

  return Object.freeze({
    active: livingCombatThreat || nearbyMapThreat || nearbyRoamingThreat,
    source: livingCombatThreat ? "combat" : nearbyMapThreat ? "map" : nearbyRoamingThreat ? "roaming" : "none"
  });
}

function getMapFragments(source: RawRendererState, floor: number): RendererCollection {
  const dungeonMemory = source.dungeonMemory;
  if (!isIndexable(dungeonMemory) || !isIndexable(dungeonMemory.mapFragments)) return [];
  const fragments = dungeonMemory.mapFragments[floor];
  return isUnknownArray(fragments) ? fragments : [];
}

function getCombatMonsters(source: RawRendererState, view: ScreenViewSnapshot): RendererCollection {
  if (!view.hasCombat || !isRecord(source.combatState)) return [];
  return isUnknownArray(source.combatState.monsters) ? source.combatState.monsters : [];
}

/**
 * The only raw-state-to-render conversion used by the production Dungeon View.
 *
 * Collections intentionally retain state-owned references. Creating defensive
 * copies here would add work to every render-loop tick and would not improve
 * the existing synchronous read-only render boundary.
 */
export function getRendererInput(
  stateLike: unknown = state,
  menuContextLike: unknown = menuContext
): RendererInput {
  const source: RawRendererState = isRecord(stateLike) ? stateLike : {};
  const floor = normalizeFloor(source.floor);
  const view = getScreenViewState(source, menuContextLike);
  const party = isUnknownArray(source.party) ? source.party : [];
  const map = view.hasMap && isRendererMap(source.map) ? source.map : null;
  const roamingMonsters = isUnknownArray(source.roamingMonsters) ? source.roamingMonsters : [];
  const mapFragments = getMapFragments(source, floor);
  const floorTheme = getFloorTheme(floor);
  const visual = isRecord(floorTheme?.visualSignature) ? floorTheme.visualSignature : {};
  const sceneVisibility = getSceneVisibility(view);
  const arcaneSense = sceneVisibility.showTownBackground ? 0 : getPartyMaxAffix(party, "arcaneSense");
  const hasArcaneSense = arcaneSense >= 1;
  const menu = isRecord(menuContextLike) ? menuContextLike : {};
  const targetType: MenuTargetType = menu.targetType === "enemy" || menu.targetType === "ally"
    ? menu.targetType
    : "";
  const combatTargetSelection: CombatTargetSelection = Object.freeze({
    active: sceneVisibility.showCombat && view.menuType === "combat_target" &&
      view.isCombatOverlaySubmenu && menu.targetType === "enemy",
    targetType
  });
  const combatMonsters = getCombatMonsters(source, view);
  const combatState = isRecord(source.combatState) ? source.combatState : {};

  return Object.freeze({
    kind: RENDERER_INPUT_KIND,
    view,
    sceneVisibility,
    floor,
    x: source.x,
    y: source.y,
    dir: source.dir,
    map,
    visitedMap: isUnknownArray(source.visitedMap) ? source.visitedMap : null,
    mapFragments,
    mapRevision: source.mapRevision,
    lightTurns: source.lightTurns,
    lightPower: source.lightPower,
    roamingMonsters,
    party,
    combatMonsters,
    combatTargetSelection,
    visual,
    depthCorruption: getDepthCorruption(floor),
    arcaneSense,
    hasArcaneSense,
    dangerCue: getDangerCue({
      view,
      map,
      floor,
      x: source.x,
      y: source.y,
      roamingMonsters,
      combatMonsters,
      combatThreatActive: Boolean(combatState.isBoss || combatState.isMidboss || combatState.isRoamingFlack),
      hasArcaneSense
    })
  });
}

// Deliberately remains a boolean check. The kind marker alone does not prove
// the complete RendererInput shape and must not become an unsound type guard.
export function isRendererInput(value: unknown): boolean {
  return isRecord(value) && value.kind === RENDERER_INPUT_KIND;
}
