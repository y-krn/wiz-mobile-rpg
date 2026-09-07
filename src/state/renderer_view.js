// balance-impact: none — renderer input projection only; gameplay rules and state mutation are unchanged.
import { EVENT_TYPES, getPartyMaxAffix } from "../data.js";
import { getDepthCorruption, getFloorTheme } from "../data/floor_themes.js";
import { menuContext } from "../navigation.js";
import { state } from "./state_core.js";
import { getScreenViewState } from "./view_state.js";

const RENDERER_INPUT_KIND = "renderer-input";

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeFloor(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 1;
}

function getSceneVisibility(view) {
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

function getDangerCue({ view, map, floor, x, y, roamingMonsters, combatMonsters, hasArcaneSense }) {
  const livingCombatThreat = view.hasCombat && combatMonsters.some((monster) =>
    monster?.hp > 0 && (monster.level >= 4 || monster.isBoss || monster.isMidboss)
  );
  const nearbyMapThreat = Array.isArray(map) && map.some((row, mapY) => Array.isArray(row) && row.some((cell, mapX) => {
    if (Math.abs(mapX - x) + Math.abs(mapY - y) > 4) return false;
    return cell?.event === EVENT_TYPES.BOSS || cell?.event === EVENT_TYPES.MIDBOSS;
  }));
  const nearbyRoamingThreat = roamingMonsters.some((monster) => {
    if (monster?.floor !== floor) return false;
    if (monster.perception === "afterimage" && !hasArcaneSense) return false;
    const distance = Math.abs(monster.x - x) + Math.abs(monster.y - y);
    return monster.kind === "elite" || distance <= 4;
  });

  return Object.freeze({
    active: livingCombatThreat || nearbyMapThreat || nearbyRoamingThreat,
    source: livingCombatThreat ? "combat" : nearbyMapThreat ? "map" : nearbyRoamingThreat ? "roaming" : "none"
  });
}

/**
 * The only raw-state-to-render conversion used by DungeonRenderer.
 *
 * Render input shape:
 * {
 *   kind: "renderer-input",
 *   view: validated screen snapshot,
 *   sceneVisibility: { showTownBackground, showCombat, showChest,
 *     showEventScene, showItemMenu },
 *   floor, x, y, dir, map, visitedMap, mapFragments, mapRevision,
 *   lightTurns, lightPower, roamingMonsters, party, combatMonsters,
 *   visual, depthCorruption, arcaneSense, hasArcaneSense, dangerCue
 * }
 *
 * Collections intentionally retain state-owned references. Creating defensive
 * copies here would add work to every render-loop tick and would not improve
 * the existing synchronous read-only render boundary.
 */
export function getRendererInput(stateLike = state, menuContextLike = menuContext) {
  const source = isRecord(stateLike) ? stateLike : {};
  const floor = normalizeFloor(source.floor);
  const view = getScreenViewState(source, menuContextLike);
  const party = Array.isArray(source.party) ? source.party : [];
  const map = view.hasMap ? source.map : null;
  const roamingMonsters = Array.isArray(source.roamingMonsters) ? source.roamingMonsters : [];
  const mapFragments = Array.isArray(source.dungeonMemory?.mapFragments?.[floor])
    ? source.dungeonMemory.mapFragments[floor]
    : [];
  const visual = getFloorTheme(floor).visualSignature;
  const sceneVisibility = getSceneVisibility(view);
  const arcaneSense = sceneVisibility.showTownBackground ? 0 : getPartyMaxAffix(party, "arcaneSense");
  const hasArcaneSense = arcaneSense >= 1;
  const combatTargetSelection = Object.freeze({
    active: sceneVisibility.showCombat && view.menuType === "combat_target" &&
      view.isCombatOverlaySubmenu && menuContextLike?.targetType === "enemy",
    targetType: menuContextLike?.targetType === "enemy" || menuContextLike?.targetType === "ally"
      ? menuContextLike.targetType
      : ""
  });

  return Object.freeze({
    kind: RENDERER_INPUT_KIND,
    view,
    sceneVisibility,
    floor,
    x: source.x,
    y: source.y,
    dir: source.dir,
    map,
    visitedMap: Array.isArray(source.visitedMap) ? source.visitedMap : null,
    mapFragments,
    mapRevision: source.mapRevision,
    lightTurns: source.lightTurns,
    lightPower: source.lightPower,
    roamingMonsters,
    party,
    combatMonsters: view.hasCombat ? source.combatState.monsters : [],
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
      combatMonsters: view.hasCombat ? source.combatState.monsters : [],
      hasArcaneSense
    })
  });
}

export function isRendererInput(value) {
  return isRecord(value) && value.kind === RENDERER_INPUT_KIND;
}
