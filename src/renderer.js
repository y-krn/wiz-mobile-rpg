import { DX, DY, EVENT_TYPES, getPartyMaxAffix } from "./data.js";
import { state } from "./state.js";
import { menuContext } from "./navigation.js";
import { getDepthCorruption, getFloorTheme } from "./data/floor_themes.js";
import { getScreenViewState } from "./state/view_state.js";
import { isMapDirectionBlocked } from "./rules/map_movement.js";

export let dungeonRenderer = null;
export function setDungeonRenderer(r) {
  dungeonRenderer = r;
}

// Canvas dimensions
const VIEW_W = 400;
const VIEW_H = 260;

// Baseline depth planes for 3D projection. Geometry profiles deform this
// canonical shape without changing the map or any gameplay state.
export const BASE_PROJECTION = Object.freeze({
  xl: Object.freeze([0, 100, 145, 170, 184]),
  xr: Object.freeze([400, 300, 255, 230, 216]),
  yt: Object.freeze([0, 52, 86, 106, 118]),
  yb: Object.freeze([260, 208, 174, 154, 142])
});

export const BASE_GEOMETRY = Object.freeze({
  corridorWidth: 1,
  ceilingHeight: 1,
  wallLean: 0,
  ceilingStyle: "flat"
});

const GEOMETRY_STYLES = new Set(["flat", "arch"]);

export const LANDMARK_STYLE_IDS = Object.freeze({
  chest: Object.freeze(["wood_crate", "stone_ossuary", "bone_cache", "sealed_book_coffer", "iron_strongbox", "abyss_reliquary"]),
  trap: Object.freeze(["rockfall_mark", "grave_seal", "claw_rift", "arcane_glyph", "forge_vent", "void_sigill"]),
  stairs: Object.freeze(["rough_stone", "catacomb_arch", "broken_ledge", "flooded_steps", "forge_stair", "impossible_stair"])
});

const LANDMARK_STYLE_SETS = Object.freeze({
  chest: new Set(LANDMARK_STYLE_IDS.chest),
  trap: new Set(LANDMARK_STYLE_IDS.trap),
  stairs: new Set(LANDMARK_STYLE_IDS.stairs)
});

export function getLandmarkStyles(visualSignature) {
  const landmarks = visualSignature?.landmarks || {};
  return {
    chestStyle: LANDMARK_STYLE_SETS.chest.has(landmarks.chestStyle) ? landmarks.chestStyle : LANDMARK_STYLE_IDS.chest[0],
    trapStyle: LANDMARK_STYLE_SETS.trap.has(landmarks.trapStyle) ? landmarks.trapStyle : LANDMARK_STYLE_IDS.trap[0],
    stairsStyle: LANDMARK_STYLE_SETS.stairs.has(landmarks.stairsStyle) ? landmarks.stairsStyle : LANDMARK_STYLE_IDS.stairs[0]
  };
}

function getChestStyle(style) {
  return LANDMARK_STYLE_SETS.chest.has(style) ? style : LANDMARK_STYLE_IDS.chest[0];
}

function finiteOr(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

export function getProjectionPlanes(geometry = BASE_GEOMETRY) {
  const corridorWidth = finiteOr(geometry?.corridorWidth, BASE_GEOMETRY.corridorWidth);
  const ceilingHeight = finiteOr(geometry?.ceilingHeight, BASE_GEOMETRY.ceilingHeight);
  const wallLean = finiteOr(geometry?.wallLean, BASE_GEOMETRY.wallLean);
  const ceilingStyle = GEOMETRY_STYLES.has(geometry?.ceilingStyle)
    ? geometry.ceilingStyle
    : BASE_GEOMETRY.ceilingStyle;
  const xl = [];
  const xr = [];
  const yt = [];
  const yb = [];
  const leftTop = [];
  const leftBottom = [];
  const rightTop = [];
  const rightBottom = [];

  for (let z = 0; z < BASE_PROJECTION.xl.length; z++) {
    const baseWidth = BASE_PROJECTION.xr[z] - BASE_PROJECTION.xl[z];
    const width = baseWidth * corridorWidth;
    const center = (BASE_PROJECTION.xr[z] + BASE_PROJECTION.xl[z]) / 2;
    const projectedLeft = center - width / 2;
    const projectedRight = center + width / 2;
    const horizon = (BASE_PROJECTION.yb[z] + BASE_PROJECTION.yt[z]) / 2;
    const projectedTop = horizon - (horizon - BASE_PROJECTION.yt[z]) * ceilingHeight;
    const projectedBottom = horizon + (BASE_PROJECTION.yb[z] - horizon) * ceilingHeight;
    const lean = width * wallLean * 0.5;

    xl.push(projectedLeft);
    xr.push(projectedRight);
    yt.push(projectedTop);
    yb.push(projectedBottom);
    leftTop.push(projectedLeft + lean);
    leftBottom.push(projectedLeft - lean);
    rightTop.push(projectedRight - lean);
    rightBottom.push(projectedRight + lean);
  }

  return Object.freeze({
    xl: Object.freeze(xl),
    xr: Object.freeze(xr),
    yt: Object.freeze(yt),
    yb: Object.freeze(yb),
    leftTop: Object.freeze(leftTop),
    leftBottom: Object.freeze(leftBottom),
    rightTop: Object.freeze(rightTop),
    rightBottom: Object.freeze(rightBottom),
    ceilingStyle
  });
}

export function getProjectionColumn(projection, z, column = 0) {
  const topWidth = projection.rightTop[z] - projection.leftTop[z];
  const bottomWidth = projection.rightBottom[z] - projection.leftBottom[z];
  return {
    leftTop: projection.leftTop[z] + topWidth * column,
    leftBottom: projection.leftBottom[z] + bottomWidth * column,
    rightTop: projection.leftTop[z] + topWidth * (column + 1),
    rightBottom: projection.leftBottom[z] + bottomWidth * (column + 1),
    top: projection.yt[z],
    bottom: projection.yb[z]
  };
}

// The state owner guarantees this shape for a playable floor. The renderer
// still checks it at the boundary because a save or a transition can expose
// a partially initialized cell for one frame.
function isRenderableCell(cell) {
  return cell && Array.isArray(cell.walls) && cell.walls.length === 4 &&
    cell.walls.every(wall => typeof wall === "boolean");
}

export function getVisibleCorridorCells(map, px, py, dir, maxDepth = 3, maxColumn = 2) {
  const dirRight = (dir + 1) % 4;
  const offsets = [{ z: 0, column: 0 }];
  const queue = [{ z: 0, column: 0 }];
  const seen = new Set(["0:0"]);

  const visit = (z, column) => {
    if (z < 0 || z > maxDepth || column < -maxColumn || column > maxColumn) return;
    const key = `${z}:${column}`;
    if (seen.has(key)) return;
    const x = px + DX[dir] * z + DX[dirRight] * column;
    const y = py + DY[dir] * z + DY[dirRight] * column;
    if (!isRenderableCell(map?.[y]?.[x])) return;
    seen.add(key);
    offsets.push({ z, column });
    queue.push({ z, column });
  };

  while (queue.length > 0) {
    const { z, column } = queue.shift();
    const x = px + DX[dir] * z + DX[dirRight] * column;
    const y = py + DY[dir] * z + DY[dirRight] * column;
    const neighbors = [
      { z: z + 1, column, moveDir: dir },
      { z: z - 1, column, moveDir: (dir + 2) % 4 },
      { z, column: column + 1, moveDir: dirRight },
      { z, column: column - 1, moveDir: (dirRight + 2) % 4 },
    ];
    for (const neighbor of neighbors) {
      if (isMapDirectionBlocked(map, x, y, neighbor.moveDir)) continue;
      visit(neighbor.z, neighbor.column);
    }
  }

  return offsets;
}

export class DungeonRenderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (this.canvas) {
      this.ctx = this.canvas.getContext("2d");
      this.canvas.width = VIEW_W;
      this.canvas.height = VIEW_H;
    }
    this.shakeTime = 0;
    this.shakeIntensity = 0;
    this.flashTime = 0;
    this.damageTexts = []; // Array of { text, x, y, age, color }
    this.lastSignature = null;
    this.monsterPathCache = new Map();
    this.monsterDetailCache = new Map();
    this.monsterGradientCache = new Map();
  }

  triggerShake(intensity = 10, duration = 300) {
    this.shakeTime = duration;
    this.shakeIntensity = intensity;
  }

  triggerFlash(duration = 200) {
    this.flashTime = duration;
  }

  addDamageText(text, color = "#ff3b30") {
    this.damageTexts.push({
      text,
      x: VIEW_W / 2 + (Math.random() * 40 - 20),
      y: VIEW_H / 2 - 30 + (Math.random() * 20 - 10),
      age: 0,
      maxAge: 40,
      color
    });
  }

  update(dt) {
    if (this.shakeTime > 0) this.shakeTime -= dt;
    if (this.flashTime > 0) this.flashTime -= dt;
    
    this.damageTexts.forEach(t => t.age++);
    this.damageTexts = this.damageTexts.filter(t => t.age < t.maxAge);
  }

  getSceneVisibility() {
    const view = getScreenViewState(state, menuContext);
    const { gameState, previousGameState } = view;
    const showTownBackground = !view.hasMap || (
      !view.isDeparturePrepSubmenu && (
        ["town", "result", "gameover", "victory"].includes(gameState) ||
        (view.isSubmenu && previousGameState === "town")
      )
    );
    const showCombat = !showTownBackground && Boolean(
      view.hasCombat && (
        gameState === "combat"
        || view.isCombatOverlaySubmenu
      )
    );
    const showChest = !showTownBackground && (
      gameState === "chest"
      || (view.isSubmenu && view.hasChest && view.menuType.startsWith("chest"))
    );
    const showEventScene = !showTownBackground && (
      gameState === "trap_encounter"
      || view.isEventSubmenu
    );
    const showItemMenu = !showTownBackground && (
      view.isItemSubmenu
    );

    return { showTownBackground, showCombat, showChest, showEventScene, showItemMenu };
  }

  getDrawSignature(sceneVisibility = this.getSceneVisibility()) {
    const view = getScreenViewState(state, menuContext);
    const { showTownBackground, showItemMenu } = sceneVisibility;
    const signature = [
      view.gameState,
      state.floor,
      state.x,
      state.y,
      state.dir,
      view.hasMap,
      view.menuType,
      view.previousGameState,
      view.hasCombat,
      view.hasChest,
      state.mapRevision,
      showItemMenu
    ];

    if (showTownBackground) return signature.join("|");

    const combatMonsters = view.hasCombat ? state.combatState.monsters.map(monster => [
      monster.name,
      monster.level,
      monster.hp,
      monster.maxHp,
      monster.color,
      monster.spriteType,
      monster.chargeQueued,
      monster.selfDestructQueued,
      monster.lahalitoQueued,
      monster.madaltoQueued,
      monster.tiltowaitQueued,
      monster.dragonBreathQueued,
      monster.multiActionQueued,
      monster.summonQueued,
      monster.snipeQueued,
      monster.snipeTargetIdx,
      monster.statusEffects?.bleeding?.remainingTurns
    ].join(",")).join(";") : "";
    const roamingMonsters = state.roamingMonsters?.map(monster => [
      monster.floor,
      monster.x,
      monster.y,
      monster.kind,
      monster.perception
    ].join(",")).join(";") || "";

    signature.push(
      state.lightTurns > 0,
      state.lightPower,
      roamingMonsters,
      getPartyMaxAffix(state.party, "arcaneSense"),
      combatMonsters,
      (Array.isArray(state.party) ? state.party : []).map(char => char?.name).join(",")
    );
    return signature.join("|");
  }

  isAnimating(sceneVisibility = this.getSceneVisibility()) {
    if (this.shakeTime > 0 || this.flashTime > 0 || this.damageTexts.length > 0) return true;

    const { showTownBackground, showCombat, showChest, showEventScene, showItemMenu } = sceneVisibility;
    if (showTownBackground) return false;

    const view = getScreenViewState(state, menuContext);
    if (!view.hasMap) return false;
    const map = state.map;
    if (!Array.isArray(map)) return false;

    // These layers use Date.now() for visual pulses and must keep redrawing.
    const environment = getFloorTheme(state.floor).visualSignature.environment;
    const cyclePosition = (state.floor - 1) % 5;
    if (environment.animated || environment.animatedCyclePosition === cyclePosition) return true;
    if (showCombat || showChest || showEventScene || showItemMenu) return false;

    const minY = Math.max(0, state.y - 4);
    const maxY = Math.min(map.length - 1, state.y + 4);
    for (let y = minY; y <= maxY; y++) {
      const row = map[y];
      if (!Array.isArray(row)) continue;
      const minX = Math.max(0, state.x - 4);
      const maxX = Math.min(row.length - 1, state.x + 4);
      for (let x = minX; x <= maxX; x++) {
        if (Math.abs(x - state.x) + Math.abs(y - state.y) > 4) continue;
        const event = row[x]?.event;
        if (event === EVENT_TYPES.BOSS || event === EVENT_TYPES.MIDBOSS) return true;
      }
    }

    const hasArcaneSense = getPartyMaxAffix(state.party, "arcaneSense") >= 1;
    return Boolean(state.roamingMonsters?.some(monster => {
      if (monster.floor !== state.floor) return false;
      if (monster.perception === "afterimage" && !hasArcaneSense) return false;
      const distance = Math.abs(monster.x - state.x) + Math.abs(monster.y - state.y);
      return monster.kind === "elite" || distance <= 4;
    }));
  }

  draw(sceneVisibility = this.getSceneVisibility()) {
    if (!this.ctx) return;
    const ctx = this.ctx;

    // Apply Screen Shake
    ctx.save();
    if (this.shakeTime > 0) {
      const dx = (Math.random() - 0.5) * this.shakeIntensity;
      const dy = (Math.random() - 0.5) * this.shakeIntensity;
      ctx.translate(dx, dy);
    }

    // Clear with dark void
    ctx.fillStyle = "#0c0c0e";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    const { showTownBackground, showCombat, showChest, showEventScene, showItemMenu } = sceneVisibility;
    if (showTownBackground) {
      this.drawTownBackground(ctx);
    } else {
      // Exploration or Combat or Chest
      this.draw3DCorridors(ctx);
      
      // Draw monsters only for combat and combat-derived submenus.
      if (showCombat) {
        this.drawMonsters(ctx);
      }

      // Draw Chest if looting
      if (showChest) {
        this.drawChest(ctx);
      }

      // Keep combat, chest, event, and item scenes unobstructed; restore the mini-map afterward.
      if (!showCombat && !showChest && !showEventScene && !showItemMenu) this.drawMiniMap(ctx);
    }

    // Draw Damage / Floating Texts
    this.drawFloatingTexts(ctx);

    // Apply Screen Flash
    if (this.flashTime > 0) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    ctx.restore();
  }

  drawTownBackground(ctx) {
    // Elegant neon town gate/castle vector art
    ctx.strokeStyle = "rgba(0, 229, 255, 0.3)";
    ctx.lineWidth = 1;
    
    // Draw horizon mountain line
    ctx.beginPath();
    ctx.moveTo(0, 180);
    ctx.lineTo(80, 150);
    ctx.lineTo(130, 170);
    ctx.lineTo(200, 130);
    ctx.lineTo(280, 165);
    ctx.lineTo(340, 145);
    ctx.lineTo(400, 180);
    ctx.stroke();

    // Draw Castle silhouette in center
    ctx.strokeStyle = "#00e5ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    // Left Tower
    ctx.moveTo(150, 180);
    ctx.lineTo(150, 110);
    ctx.lineTo(145, 110);
    ctx.lineTo(145, 100);
    ctx.lineTo(165, 100);
    ctx.lineTo(165, 110);
    ctx.lineTo(160, 110);
    ctx.lineTo(160, 180);
    // Main Wall
    ctx.lineTo(240, 180);
    // Right Tower
    ctx.lineTo(240, 110);
    ctx.lineTo(235, 110);
    ctx.lineTo(235, 100);
    ctx.lineTo(255, 100);
    ctx.lineTo(255, 110);
    ctx.lineTo(250, 110);
    ctx.lineTo(250, 180);
    ctx.stroke();

    // Draw Gate in center
    ctx.beginPath();
    ctx.moveTo(180, 180);
    ctx.arc(200, 180, 20, Math.PI, 0, false);
    ctx.lineTo(220, 180);
    ctx.stroke();

    // Glowing title text
    ctx.fillStyle = "#ffb300";
    ctx.shadowColor = "#ffb300";
    ctx.shadowBlur = 10;
    ctx.font = "bold 20px 'Share Tech Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText("CASTLE OF LLYLGAMYN", VIEW_W / 2, 60);

    ctx.fillStyle = "#8e8e93";
    ctx.shadowBlur = 0;
    ctx.font = "11px 'Outfit', sans-serif";
    ctx.fillText("Select options below to prepare your quest.", VIEW_W / 2, 85);
  }

  draw3DCorridors(ctx) {
    const map = state.map;
    if (!Array.isArray(map)) return;

    const px = state.x;
    const py = state.y;
    const dir = state.dir;

    ctx.lineWidth = 2;
    ctx.shadowBlur = 0;

    const visual = getFloorTheme(state.floor).visualSignature;
    const projection = getProjectionPlanes(visual.geometry);
    const landmarks = getLandmarkStyles(visual);
    const depthCorruption = getDepthCorruption(state.floor);
    const environment = visual.environment;
    const isEnvironmentAnimated = environment.animated ||
      environment.animatedCyclePosition === (state.floor - 1) % 5;
    const wallColor = visual.wallColor;
    const gridColor = visual.gridColor;
    let outOfBoundsColor = "#ff3b30";

    const columnOrder = [-2, 2, -1, 1, 0];
    const dirRight = (dir + 1) % 4;
    const visibleCells = new Set(
      getVisibleCorridorCells(map, px, py, dir).map(({ z, column }) => `${z}:${column}`)
    );

    // Draw from back (z=3) to front (z=0), outer columns before center.
    // A cell is rendered only when it is reachable from the player through
    // the same wall/one-way rules used by exploration movement.
    for (let z = 3; z >= 0; z--) {
      const width = projection.xr[z] - projection.xl[z];
      for (const column of columnOrder) {
        if (Math.abs(column) === 2 && z < 2) continue;
        if (!visibleCells.has(`${z}:${column}`)) continue;

        const cx = px + DX[dir] * z + DX[dirRight] * column;
        const cy = py + DY[dir] * z + DY[dirRight] * column;
        const plane = getProjectionColumn(projection, z, column);
        const nextPlane = getProjectionColumn(projection, z + 1, column);
        const left = plane.leftBottom;

        // Check out of bounds
        const row = map[cy];
        if (cx < 0 || cy < 0 || cy >= map.length || !Array.isArray(row) || cx >= row.length) {
          // Render a solid wall block at depth z
          this.renderSolidWall(ctx, z, outOfBoundsColor, column, projection); // Red glow for out of bounds
          continue;
        }

        const cell = row[cx];
        if (!isRenderableCell(cell)) {
          // A partially loaded cell is not traversable or drawable. Keep the
          // corridor closed until the state owner supplies a valid cell.
          this.renderSolidWall(ctx, z, outOfBoundsColor, column, projection);
          continue;
        }

        // Relative directions based on player orientation
        const dirLeft = (dir + 3) % 4;
        const dirFront = dir;

        const hasLeftWall = isMapDirectionBlocked(map, cx, cy, dirLeft);
        const hasRightWall = isMapDirectionBlocked(map, cx, cy, dirRight);
        const hasFrontWall = cell.walls[dirFront];
        const hasFrontBlocked = isMapDirectionBlocked(map, cx, cy, dirFront);
        const hasFrontOneWayBarrier = !hasFrontWall && hasFrontBlocked;

        // 1. Draw floor/ceiling segments
        ctx.strokeStyle = gridColor;

        // Floor lines
        ctx.beginPath();
        ctx.moveTo(plane.leftBottom, plane.bottom);
        ctx.lineTo(nextPlane.leftBottom, nextPlane.bottom);
        ctx.moveTo(plane.rightBottom, plane.bottom);
        ctx.lineTo(nextPlane.rightBottom, nextPlane.bottom);
        // Ceiling lines
        ctx.moveTo(plane.leftTop, plane.top);
        ctx.lineTo(nextPlane.leftTop, nextPlane.top);
        ctx.moveTo(plane.rightTop, plane.top);
        ctx.lineTo(nextPlane.rightTop, nextPlane.top);
        ctx.stroke();

        // Horizontal grid lines
        ctx.beginPath();
        ctx.moveTo(nextPlane.leftBottom, nextPlane.bottom);
        ctx.lineTo(nextPlane.rightBottom, nextPlane.bottom);
        this.traceCeilingEdge(ctx, nextPlane, projection.ceilingStyle);
        ctx.stroke();

        // 2. Left Wall
        if (hasLeftWall) {
          ctx.fillStyle = visual.background;
          ctx.beginPath();
          ctx.moveTo(plane.leftTop, plane.top);
          ctx.lineTo(nextPlane.leftTop, nextPlane.top);
          ctx.lineTo(nextPlane.leftBottom, nextPlane.bottom);
          ctx.lineTo(plane.leftBottom, plane.bottom);
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = wallColor;
          ctx.lineWidth = Math.max(1.5, 2 - depthCorruption * 0.12);
          ctx.stroke();
        }

        // 3. Right Wall
        if (hasRightWall) {
          ctx.fillStyle = visual.background;
          ctx.beginPath();
          ctx.moveTo(plane.rightTop, plane.top);
          ctx.lineTo(nextPlane.rightTop, nextPlane.top);
          ctx.lineTo(nextPlane.rightBottom, nextPlane.bottom);
          ctx.lineTo(plane.rightBottom, plane.bottom);
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = wallColor;
          ctx.lineWidth = Math.max(1.5, 2 - depthCorruption * 0.12);
          ctx.stroke();
        }

        // 4. Front Wall (at z + 1 depth)
        if (hasFrontBlocked) {
          ctx.fillStyle = visual.background;
          this.fillProjectedFrontWall(ctx, nextPlane, projection.ceilingStyle);

          ctx.strokeStyle = wallColor;
          ctx.lineWidth = Math.max(1.5, 2 - depthCorruption * 0.12);
          if (hasFrontOneWayBarrier && column === 0) {
            this.drawOneWayBarrier(ctx, z, wallColor, projection);
          } else {
            this.strokeProjectedFrontWall(ctx, nextPlane, projection.ceilingStyle);
          }
        }

        // Check special symbols inside cells (stairs up / down)
        if (column === 0 && (cell.type === "stairs-up" || cell.type === "stairs-down")) {
          this.drawStairsIcon(ctx, z, cell.type, landmarks.stairsStyle, projection);
        }

        if (column === 0 && z > 0 && cell.event === EVENT_TYPES.CHEST) {
          this.drawChestIcon(ctx, z, landmarks.chestStyle, projection);
        }

        if (column === 0 && z > 0 && cell.trap && cell.trap.state === "discovered") {
          this.drawTrapIcon(ctx, z, (cell.trap.traceReadLevel || 0) >= 2, landmarks.trapStyle, projection);
        }

        // Check if there is a roaming monster at this coordinate (cx, cy)
        if (column === 0 && state.roamingMonsters) {
          const hasFlack = state.roamingMonsters.some(
            rm => rm.floor === state.floor && rm.x === cx && rm.y === cy
          );
          if (hasFlack && z > 0) { // Don't draw under the player
            this.drawRoamingFlackIcon(ctx, z, projection);
          }
        }

        // 5. Draw biome ambience and a deterministic depth-corruption mark.
        if (z > 0) {
          ctx.fillStyle = environment.overlay;
          this.fillProjectedCorridor(ctx, plane, nextPlane, projection.ceilingStyle);
          this.drawDepthFracture(
            ctx, z, left, plane.top, width, plane.bottom - plane.top, wallColor,
            depthCorruption, cx, cy
          );
          if (isEnvironmentAnimated) {
            const pulse = 0.02 + 0.02 * Math.sin(Date.now() / 250);
            ctx.fillStyle = `rgba(255, 180, 90, ${pulse})`;
            this.fillProjectedCorridor(ctx, plane, nextPlane, projection.ceilingStyle);
          }
        }
      }
    }
  }

  traceCeilingEdge(ctx, plane, ceilingStyle) {
    if (ceilingStyle !== "arch") {
      ctx.moveTo(plane.leftTop, plane.top);
      ctx.lineTo(plane.rightTop, plane.top);
      return;
    }

    const centerX = (plane.leftTop + plane.rightTop) / 2;
    const archHeight = Math.max(3, (plane.bottom - plane.top) * 0.12);
    ctx.moveTo(plane.leftTop, plane.top);
    ctx.quadraticCurveTo(centerX, plane.top - archHeight, plane.rightTop, plane.top);
  }

  fillProjectedCorridor(ctx, plane, nextPlane, ceilingStyle) {
    ctx.beginPath();
    ctx.moveTo(plane.leftTop, plane.top);
    ctx.lineTo(nextPlane.leftTop, nextPlane.top);
    if (ceilingStyle === "arch") {
      const centerX = (nextPlane.leftTop + nextPlane.rightTop) / 2;
      const archHeight = Math.max(3, (nextPlane.bottom - nextPlane.top) * 0.12);
      ctx.quadraticCurveTo(centerX, nextPlane.top - archHeight, nextPlane.rightTop, nextPlane.top);
    } else {
      ctx.lineTo(nextPlane.rightTop, nextPlane.top);
    }
    ctx.lineTo(nextPlane.rightBottom, nextPlane.bottom);
    ctx.lineTo(plane.rightBottom, plane.bottom);
    ctx.lineTo(plane.rightTop, plane.top);
    if (ceilingStyle === "arch") {
      const centerX = (plane.leftTop + plane.rightTop) / 2;
      const archHeight = Math.max(3, (plane.bottom - plane.top) * 0.12);
      ctx.quadraticCurveTo(centerX, plane.top - archHeight, plane.leftTop, plane.top);
    } else {
      ctx.lineTo(plane.leftTop, plane.top);
    }
    ctx.closePath();
    ctx.fill();
  }

  fillProjectedFrontWall(ctx, plane, ceilingStyle) {
    ctx.beginPath();
    ctx.moveTo(plane.leftTop, plane.top);
    if (ceilingStyle === "arch") {
      const centerX = (plane.leftTop + plane.rightTop) / 2;
      const archHeight = Math.max(3, (plane.bottom - plane.top) * 0.12);
      ctx.quadraticCurveTo(centerX, plane.top - archHeight, plane.rightTop, plane.top);
    } else {
      ctx.lineTo(plane.rightTop, plane.top);
    }
    ctx.lineTo(plane.rightBottom, plane.bottom);
    ctx.lineTo(plane.leftBottom, plane.bottom);
    ctx.closePath();
    ctx.fill();
  }

  strokeProjectedFrontWall(ctx, plane, ceilingStyle) {
    ctx.beginPath();
    ctx.moveTo(plane.leftTop, plane.top);
    if (ceilingStyle === "arch") {
      const centerX = (plane.leftTop + plane.rightTop) / 2;
      const archHeight = Math.max(3, (plane.bottom - plane.top) * 0.12);
      ctx.quadraticCurveTo(centerX, plane.top - archHeight, plane.rightTop, plane.top);
    } else {
      ctx.lineTo(plane.rightTop, plane.top);
    }
    ctx.lineTo(plane.rightBottom, plane.bottom);
    ctx.lineTo(plane.leftBottom, plane.bottom);
    ctx.closePath();
    ctx.stroke();
  }

  renderSolidWall(ctx, z, color, column = 0, projection = getProjectionPlanes()) {
    const plane = getProjectionColumn(projection, z, column);
    ctx.fillStyle = "#0c0c0e";
    this.fillProjectedFrontWall(ctx, plane, projection.ceilingStyle);
    ctx.strokeStyle = color;
    this.strokeProjectedFrontWall(ctx, plane, projection.ceilingStyle);
  }

  drawDepthFracture(ctx, z, x, y, width, height, color, depth, cellX, cellY) {
    if (depth < 0.12 || z < 1) return;
    const hash = Math.abs((cellX * 37 + cellY * 17 + state.floor * 13 + z * 7) % 101) / 100;
    const density = Math.min(0.72, 0.12 + depth * 0.48);
    if (hash > density) return;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = Math.min(0.56, 0.18 + depth * 0.24);
    ctx.lineWidth = 1;
    ctx.beginPath();
    const startX = x + width * (0.22 + hash * 0.28);
    const startY = y + height * (0.18 + hash * 0.24);
    ctx.moveTo(startX, startY);
    ctx.lineTo(startX + width * 0.12, startY + height * 0.14);
    ctx.lineTo(startX + width * 0.08, startY + height * 0.27);
    ctx.stroke();
    ctx.restore();
  }

  drawOneWayBarrier(ctx, z, color, projection = getProjectionPlanes()) {
    const plane = getProjectionColumn(projection, z + 1);
    const topWidth = plane.rightTop - plane.leftTop;
    const bottomWidth = plane.rightBottom - plane.leftBottom;
    const y = plane.top;
    const w = (topWidth + bottomWidth) / 2;
    const h = plane.bottom - plane.top;
    const midX = (plane.leftTop + plane.rightTop + plane.leftBottom + plane.rightBottom) / 4;
    const midY = y + h / 2;
    const chevronW = Math.max(8, w * 0.18);
    const chevronH = Math.max(6, h * 0.12);

    ctx.fillStyle = "rgba(0, 229, 255, 0.10)";
    this.fillProjectedFrontWall(ctx, plane, projection.ceilingStyle);
    ctx.strokeStyle = "rgba(0, 229, 255, 0.75)";
    ctx.lineWidth = 1.5;
    this.strokeProjectedFrontWall(ctx, plane, projection.ceilingStyle);

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    for (let i = -1; i <= 1; i++) {
      const cy = midY + i * chevronH * 1.7;
      ctx.beginPath();
      ctx.moveTo(midX - chevronW, cy - chevronH);
      ctx.lineTo(midX, cy);
      ctx.lineTo(midX + chevronW, cy - chevronH);
      ctx.stroke();
    }
  }

  drawStairsIcon(ctx, z, type, style, projection = getProjectionPlanes()) {
    const plane = getProjectionColumn(projection, z);
    const xl = plane.leftBottom;
    const xr = plane.rightBottom;
    const yb = plane.bottom;

    const w = xr - xl;
    const safeStyle = LANDMARK_STYLE_SETS.stairs.has(style) ? style : LANDMARK_STYLE_IDS.stairs[0];
    const isUp = type === "stairs-up";
    const color = isUp ? "#00b7ff" : "#ffb300";
    const label = isUp ? "↑" : "↓";
    const centerX = xl + w * 0.5;
    const baseY = yb - Math.max(2, w * 0.018);
    const step = (left, top, right, bottom) => {
      ctx.moveTo(left, bottom);
      ctx.lineTo(right, bottom);
      ctx.lineTo(right - w * 0.015, top);
      ctx.lineTo(left + w * 0.015, top);
      ctx.closePath();
    };

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = Math.max(3, w * 0.025);
    ctx.lineWidth = Math.max(1.2, w * 0.012);

    if (safeStyle === "rough_stone") {
      const stepW = w * 0.40;
      const startX = xl + w * 0.30;
      ctx.beginPath();
      step(startX, baseY - w * 0.10, startX + stepW, baseY);
      step(startX + stepW * 0.12, baseY - w * 0.21, startX + stepW * 0.88, baseY - w * 0.10);
      step(startX + stepW * 0.27, baseY - w * 0.31, startX + stepW * 0.73, baseY - w * 0.21);
      ctx.stroke();
    } else if (safeStyle === "catacomb_arch") {
      ctx.beginPath();
      ctx.arc(centerX, baseY - w * 0.25, w * 0.29, Math.PI, 0);
      ctx.moveTo(xl + w * 0.21, baseY);
      ctx.lineTo(xl + w * 0.79, baseY);
      ctx.moveTo(xl + w * 0.29, baseY - w * 0.10);
      ctx.lineTo(xl + w * 0.71, baseY - w * 0.10);
      ctx.moveTo(xl + w * 0.37, baseY - w * 0.20);
      ctx.lineTo(xl + w * 0.63, baseY - w * 0.20);
      ctx.stroke();
    } else if (safeStyle === "broken_ledge") {
      ctx.beginPath();
      ctx.moveTo(xl + w * 0.22, baseY);
      ctx.lineTo(xl + w * 0.70, baseY);
      ctx.lineTo(xl + w * 0.62, baseY - w * 0.10);
      ctx.lineTo(xl + w * 0.44, baseY - w * 0.10);
      ctx.lineTo(xl + w * 0.51, baseY - w * 0.19);
      ctx.lineTo(xl + w * 0.28, baseY - w * 0.19);
      ctx.lineTo(xl + w * 0.36, baseY - w * 0.29);
      ctx.lineTo(xl + w * 0.50, baseY - w * 0.29);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(xl + w * 0.72, baseY - w * 0.02);
      ctx.lineTo(xl + w * 0.84, baseY - w * 0.10);
      ctx.lineTo(xl + w * 0.77, baseY - w * 0.18);
      ctx.stroke();
    } else if (safeStyle === "flooded_steps") {
      ctx.beginPath();
      step(xl + w * 0.18, baseY - w * 0.10, xl + w * 0.82, baseY);
      step(xl + w * 0.29, baseY - w * 0.21, xl + w * 0.71, baseY - w * 0.10);
      step(xl + w * 0.39, baseY - w * 0.31, xl + w * 0.61, baseY - w * 0.21);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(centerX - w * 0.20, baseY + w * 0.02, w * 0.10, Math.PI, 0);
      ctx.arc(centerX + w * 0.13, baseY + w * 0.02, w * 0.09, Math.PI, 0);
      ctx.stroke();
    } else if (safeStyle === "forge_stair") {
      ctx.beginPath();
      step(xl + w * 0.16, baseY - w * 0.10, xl + w * 0.84, baseY);
      step(xl + w * 0.27, baseY - w * 0.20, xl + w * 0.73, baseY - w * 0.10);
      step(xl + w * 0.38, baseY - w * 0.30, xl + w * 0.62, baseY - w * 0.20);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(xl + w * 0.16, baseY - w * 0.10);
      ctx.lineTo(xl + w * 0.16, baseY - w * 0.22);
      ctx.lineTo(xl + w * 0.38, baseY - w * 0.37);
      ctx.moveTo(xl + w * 0.84, baseY - w * 0.10);
      ctx.lineTo(xl + w * 0.84, baseY - w * 0.22);
      ctx.lineTo(xl + w * 0.62, baseY - w * 0.37);
      ctx.stroke();
    } else {
      ctx.beginPath();
      step(xl + w * 0.18, baseY - w * 0.08, xl + w * 0.71, baseY);
      step(xl + w * 0.34, baseY - w * 0.18, xl + w * 0.87, baseY - w * 0.08);
      step(xl + w * 0.22, baseY - w * 0.29, xl + w * 0.66, baseY - w * 0.18);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(xl + w * 0.71, baseY - w * 0.01);
      ctx.lineTo(xl + w * 0.90, baseY - w * 0.14);
      ctx.lineTo(xl + w * 0.66, baseY - w * 0.29);
      ctx.stroke();
    }

    ctx.font = `bold ${Math.max(10, Math.min(16, Math.round(w * 0.12)))}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, centerX, baseY - w * 0.16);
    ctx.restore();
  }

  drawChestIcon(ctx, z, style, projection = getProjectionPlanes()) {
    const plane = getProjectionColumn(projection, z);
    const xl = plane.leftBottom;
    const xr = plane.rightBottom;
    const yb = plane.bottom;

    const corridorWidth = xr - xl;
    const chestWidth = corridorWidth * 0.28;
    const chestHeight = chestWidth * 0.58;
    const x = xl + (corridorWidth - chestWidth) / 2;
    const y = yb - chestHeight - 2;
    const safeStyle = getChestStyle(style);

    ctx.save();
    ctx.strokeStyle = "#ffd60a";
    ctx.lineWidth = Math.max(1, corridorWidth * 0.008);
    ctx.shadowColor = "#ffd60a";
    ctx.shadowBlur = Math.max(3, corridorWidth * 0.025);
    this.drawChestShape(ctx, safeStyle, x, y, chestWidth, chestHeight, "#ffd60a");
    ctx.restore();
  }

  drawChestShape(ctx, style, x, y, chestWidth, chestHeight, color, bodyTopRatio = 0.35) {
    const bodyTop = y + chestHeight * bodyTopRatio;
    const bodyBottom = y + chestHeight;
    const drawBody = (fill = "#6b3a00") => {
      ctx.fillStyle = fill;
      ctx.fillRect(x, bodyTop, chestWidth, bodyBottom - bodyTop);
      ctx.strokeRect(x, bodyTop, chestWidth, bodyBottom - bodyTop);
    };

    if (style === "wood_crate") {
      drawBody();
      ctx.beginPath();
      ctx.moveTo(x, bodyTop);
      ctx.lineTo(x + chestWidth * 0.12, y);
      ctx.lineTo(x + chestWidth * 0.88, y);
      ctx.lineTo(x + chestWidth, bodyTop);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillRect(x + chestWidth * 0.44, y, chestWidth * 0.12, chestHeight);
    } else if (style === "stone_ossuary") {
      drawBody("#77736b");
      ctx.beginPath();
      ctx.moveTo(x - chestWidth * 0.04, bodyTop);
      ctx.lineTo(x + chestWidth * 0.08, y - chestHeight * 0.18);
      ctx.lineTo(x + chestWidth * 0.92, y - chestHeight * 0.18);
      ctx.lineTo(x + chestWidth * 1.04, bodyTop);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + chestWidth * 0.50, y - chestHeight * 0.10);
      ctx.lineTo(x + chestWidth * 0.50, bodyBottom);
      ctx.moveTo(x + chestWidth * 0.39, y + chestHeight * 0.02);
      ctx.lineTo(x + chestWidth * 0.61, y + chestHeight * 0.02);
      ctx.stroke();
    } else if (style === "bone_cache") {
      drawBody("#4d3e55");
      ctx.beginPath();
      ctx.moveTo(x - chestWidth * 0.10, bodyTop);
      ctx.quadraticCurveTo(x + chestWidth * 0.16, y - chestHeight * 0.33, x + chestWidth * 0.49, bodyTop);
      ctx.quadraticCurveTo(x + chestWidth * 0.82, y - chestHeight * 0.33, x + chestWidth * 1.10, bodyTop);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + chestWidth * 0.08, y + chestHeight * 0.02);
      ctx.lineTo(x + chestWidth * 0.92, y + chestHeight * 0.34);
      ctx.moveTo(x + chestWidth * 0.92, y + chestHeight * 0.02);
      ctx.lineTo(x + chestWidth * 0.08, y + chestHeight * 0.34);
      ctx.stroke();
    } else if (style === "sealed_book_coffer") {
      drawBody("#174c56");
      ctx.beginPath();
      ctx.moveTo(x, bodyTop);
      ctx.lineTo(x + chestWidth * 0.10, y + chestHeight * 0.02);
      ctx.lineTo(x + chestWidth * 0.90, y + chestHeight * 0.02);
      ctx.lineTo(x + chestWidth, bodyTop);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + chestWidth * 0.24, y + chestHeight * 0.03);
      ctx.lineTo(x + chestWidth * 0.24, bodyBottom);
      ctx.moveTo(x + chestWidth * 0.76, y + chestHeight * 0.03);
      ctx.lineTo(x + chestWidth * 0.76, bodyBottom);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + chestWidth * 0.50, bodyTop + chestHeight * 0.12, chestWidth * 0.07, 0, Math.PI * 2);
      ctx.fill();
    } else if (style === "iron_strongbox") {
      drawBody("#514747");
      ctx.fillStyle = "#514747";
      ctx.fillRect(x + chestWidth * 0.08, y, chestWidth * 0.84, chestHeight * 0.35);
      ctx.strokeRect(x + chestWidth * 0.08, y, chestWidth * 0.84, chestHeight * 0.35);
      ctx.fillStyle = color;
      [0.14, 0.86].forEach(position => {
        ctx.beginPath();
        ctx.arc(x + chestWidth * position, bodyTop + chestHeight * 0.22, chestWidth * 0.045, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillRect(x + chestWidth * 0.44, y + chestHeight * 0.08, chestWidth * 0.12, chestHeight * 0.70);
    } else {
      drawBody("#30233e");
      ctx.beginPath();
      ctx.moveTo(x, bodyTop);
      ctx.lineTo(x + chestWidth * 0.23, y - chestHeight * 0.20);
      ctx.lineTo(x + chestWidth * 0.74, y - chestHeight * 0.07);
      ctx.lineTo(x + chestWidth, bodyTop);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + chestWidth * 0.18, y + chestHeight * 0.06);
      ctx.lineTo(x + chestWidth * 0.50, bodyBottom);
      ctx.lineTo(x + chestWidth * 0.83, y + chestHeight * 0.08);
      ctx.stroke();
    }
  }

  drawTrapIcon(ctx, z, revealSpecies, style, projection = getProjectionPlanes()) {
    const plane = getProjectionColumn(projection, z);
    const xl = plane.leftBottom;
    const xr = plane.rightBottom;
    const yb = plane.bottom;

    const corridorWidth = xr - xl;
    const size = corridorWidth * 0.22;
    const cx = xl + corridorWidth / 2;
    const cy = yb - size * 0.6 - 2;
    const safeStyle = LANDMARK_STYLE_SETS.trap.has(style) ? style : LANDMARK_STYLE_IDS.trap[0];

    ctx.save();
    ctx.strokeStyle = "#ff3b30";
    ctx.shadowColor = "#ff3b30";
    ctx.shadowBlur = Math.max(3, size * 0.22);
    ctx.lineWidth = Math.max(1.2, size * 0.10);

    if (safeStyle === "rockfall_mark") {
      ctx.beginPath();
      ctx.moveTo(cx, cy - size * 0.5);
      ctx.lineTo(cx + size * 0.55, cy + size * 0.4);
      ctx.lineTo(cx - size * 0.55, cy + size * 0.4);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.85, cy + size * 0.60);
      ctx.lineTo(cx - size * 0.40, cy + size * 0.40);
      ctx.moveTo(cx + size * 0.45, cy + size * 0.50);
      ctx.lineTo(cx + size * 0.85, cy + size * 0.68);
      ctx.stroke();
    } else if (safeStyle === "grave_seal") {
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.62, 0, Math.PI * 2);
      ctx.moveTo(cx - size * 0.38, cy);
      ctx.lineTo(cx + size * 0.38, cy);
      ctx.moveTo(cx, cy - size * 0.38);
      ctx.lineTo(cx, cy + size * 0.38);
      ctx.stroke();
    } else if (safeStyle === "claw_rift") {
      ctx.beginPath();
      [-0.42, 0, 0.42].forEach(offset => {
        ctx.moveTo(cx + size * (offset - 0.22), cy - size * 0.58);
        ctx.lineTo(cx + size * (offset + 0.30), cy + size * 0.52);
      });
      ctx.moveTo(cx - size * 0.30, cy + size * 0.40);
      ctx.lineTo(cx, cy - size * 0.20);
      ctx.lineTo(cx + size * 0.30, cy + size * 0.40);
      ctx.stroke();
    } else if (safeStyle === "arcane_glyph") {
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.63, 0, Math.PI * 2);
      ctx.moveTo(cx, cy - size * 0.76);
      ctx.lineTo(cx + size * 0.70, cy);
      ctx.lineTo(cx, cy + size * 0.76);
      ctx.lineTo(cx - size * 0.70, cy);
      ctx.closePath();
      ctx.stroke();
    } else if (safeStyle === "forge_vent") {
      ctx.strokeRect(cx - size * 0.68, cy - size * 0.40, size * 1.36, size * 0.80);
      ctx.beginPath();
      [-0.34, 0, 0.34].forEach(offset => {
        ctx.moveTo(cx + size * offset, cy - size * 0.32);
        ctx.lineTo(cx + size * offset, cy + size * 0.32);
      });
      ctx.moveTo(cx - size * 0.52, cy - size * 0.62);
      ctx.quadraticCurveTo(cx - size * 0.34, cy - size * 0.90, cx - size * 0.16, cy - size * 0.62);
      ctx.moveTo(cx + size * 0.18, cy - size * 0.62);
      ctx.quadraticCurveTo(cx + size * 0.36, cy - size * 0.90, cx + size * 0.54, cy - size * 0.62);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(cx, cy - size * 0.76);
      ctx.lineTo(cx + size * 0.64, cy - size * 0.25);
      ctx.lineTo(cx + size * 0.46, cy + size * 0.56);
      ctx.lineTo(cx - size * 0.40, cy + size * 0.72);
      ctx.lineTo(cx - size * 0.72, cy - size * 0.18);
      ctx.closePath();
      ctx.arc(cx, cy, size * 0.34, 0, Math.PI * 1.6);
      ctx.stroke();
    }

    ctx.fillStyle = "#ff3b30";
    ctx.font = `bold ${Math.max(8, Math.round(size * 0.5))}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(revealSpecies ? "!" : "?", cx, cy + size * 0.05);

    ctx.restore();
  }

  drawRoamingFlackIcon(ctx, z, projection = getProjectionPlanes()) {
    const plane = getProjectionColumn(projection, z);
    const xl = plane.leftBottom;
    const xr = plane.rightBottom;
    const yt = plane.top;
    const yb = plane.bottom;

    const cx = (xl + xr) / 2;
    const cy = yb - (yb - yt) * 0.25; // Align near floor level
    const scale = (xr - xl) / 400;

    ctx.strokeStyle = "#ff3b30"; // Red glow/silhouette for Flack
    ctx.lineWidth = Math.max(1, 2 * scale);
    ctx.shadowColor = "#ff3b30";
    ctx.shadowBlur = Math.max(2, 6 * scale);

    ctx.beginPath();
    // flack sprite scaled down
    ctx.arc(cx, cy - 12 * scale, 36 * scale, 0, Math.PI * 2);
    ctx.moveTo(cx - 26 * scale, cy - 38 * scale);
    ctx.lineTo(cx + 26 * scale, cy + 14 * scale);
    ctx.moveTo(cx + 26 * scale, cy - 38 * scale);
    ctx.lineTo(cx - 26 * scale, cy + 14 * scale);
    ctx.moveTo(cx, cy - 58 * scale);
    ctx.lineTo(cx, cy + 32 * scale);
    ctx.moveTo(cx - 45 * scale, cy - 12 * scale);
    ctx.lineTo(cx + 45 * scale, cy - 12 * scale);
    ctx.stroke();

    ctx.shadowBlur = 0; // Reset shadow
  }

  drawChest(ctx, style) {
    // Render the current biome's treasure chest in front.
    const cx = VIEW_W / 2;
    const cy = VIEW_H / 2 + 20;

    const chestStyle = style === undefined
      ? getLandmarkStyles(getFloorTheme(state.floor).visualSignature).chestStyle
      : getChestStyle(style);
    const chestWidth = 60;
    const chestHeight = 70;
    const chestX = cx - chestWidth / 2;
    const chestY = cy - 35;

    ctx.strokeStyle = "#ffb300"; // Glowing amber chest
    ctx.shadowColor = "#ffb300";
    ctx.shadowBlur = 8;
    ctx.lineWidth = 2.5;

    this.drawChestShape(ctx, chestStyle, chestX, chestY, chestWidth, chestHeight, "#ffb300", 0.5);

    // Lock
    ctx.fillStyle = "#ff3b30";
    ctx.beginPath();
    ctx.arc(cx, cy + 12, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  getMonsterSpriteType(monster) {
    if (monster.spriteType) return monster.spriteType;

    const name = monster.name || "";
    if (name.includes("かみつき") || name.includes("Biter")) return "biter";
    if (name.includes("コボルト") || name.includes("Kobold")) return "kobold";
    if (name.includes("ゾンビ") || name.includes("Zombie")) return "zombie";
    if (name.includes("ガイコツ") || name.includes("Skeleton")) return "skeleton";
    if (name.includes("オーク") || name.includes("Orc")) return "orc";
    if (name.includes("魔術師") || name.includes("Mage")) return "mage";
    if (name.includes("スピリット")) return "spirit";
    if (name.includes("ウィル・オー・ウィスプ")) return "wisp";
    if (name.includes("スパイダー")) return "spider";
    if (name.includes("バット")) return "bat";

    if (name.includes("フラック")) return "flack";
    if (name.includes("竜") || name.includes("Dragon")) return "dragon";
    return "biter";
  }

  getMonsterVisualVariant(monster) {
    const spriteType = this.getMonsterSpriteType(monster);
    if (spriteType !== "zombie") return "default";
    return monster.name || "zombie";
  }

  getMonsterScaleMultiplier(monster) {
    const name = monster.name || "";
    if (name.includes("ジャイアント") || name.includes("巨躯")) return 1.18;
    if (name.includes("ゴーレム") || name.includes("アーマー") || name.includes("ストーン") || name.includes("石像")) {
      return 1.08;
    }
    return 1;
  }

  drawMonsters(ctx) {
    const view = getScreenViewState(state, menuContext);
    if (!view.hasCombat) return;
    const monsters = state.combatState.monsters;
    const alive = monsters.filter(m => m.hp > 0);
    if (alive.length === 0) return;

    const columns = alive.length >= 4 ? Math.ceil(alive.length / 2) : alive.length;
    const rows = alive.length >= 4 ? 2 : 1;
    const scale = alive.length >= 4 ? 0.52 : alive.length >= 2 ? 0.72 : 1;

    alive.forEach((monster, index) => {
      const row = Math.floor(index / columns);
      const rowStart = row * columns;
      const rowCount = Math.min(columns, alive.length - rowStart);
      const slotWidth = VIEW_W / rowCount;
      const cx = slotWidth * (index - rowStart + 0.5);
      const cy = rows === 1 ? VIEW_H / 2 + 15 : row === 0 ? 100 : 210;
      const monsterScale = scale * this.getMonsterScaleMultiplier(monster);
      this.drawMonster(ctx, monster, cx, cy, monsterScale, slotWidth - 8);
    });
  }

  buildMonsterPaths(spriteType, cx = 0, cy = 0) {
    const useCache = cx === 0 && cy === 0;
    if (useCache) {
      const cached = this.monsterPathCache.get(spriteType);
      if (cached) return cached;
    }

    const paths = [];

    // Different wireframe paths based on stable sprite type.
    if (spriteType === "biter") {
      // Biter: floating orb with massive spike-teeth
      const body = new Path2D();
      body.arc(cx, cy - 10, 25, 0, Math.PI * 2);
      paths.push(body);
      
      // Giant mouth
      const mouth = new Path2D();
      mouth.moveTo(cx - 20, cy - 10);
      mouth.lineTo(cx + 20, cy - 10);
      // Teeth
      mouth.lineTo(cx + 10, cy + 10);
      mouth.lineTo(cx, cy - 10);
      mouth.lineTo(cx - 10, cy + 10);
      mouth.closePath();
      paths.push(mouth);
    } else if (spriteType === "kobold") {
      // Kobold: small beast with ears and a weapon
      const path = new Path2D();
      // Head
      path.moveTo(cx - 15, cy - 35);
      path.lineTo(cx + 15, cy - 35);
      path.lineTo(cx + 20, cy - 15);
      path.lineTo(cx - 20, cy - 15);
      path.closePath();
      // Ears
      path.moveTo(cx - 15, cy - 35);
      path.lineTo(cx - 25, cy - 50);
      path.lineTo(cx - 5, cy - 35);
      path.moveTo(cx + 15, cy - 35);
      path.lineTo(cx + 25, cy - 50);
      path.lineTo(cx + 5, cy - 35);
      // Body
      path.moveTo(cx, cy - 15);
      path.lineTo(cx, cy + 25);
      // Spear on left
      path.moveTo(cx - 30, cy + 30);
      path.lineTo(cx - 30, cy - 40);
      path.lineTo(cx - 25, cy - 40);
      path.lineTo(cx - 30, cy - 50);
      path.lineTo(cx - 35, cy - 40);
      path.closePath();
      paths.push(path);
    } else if (spriteType === "zombie") {
      // Zombie: blocky creature with arms out
      const path = new Path2D();
      // Head
      path.rect(cx - 15, cy - 45, 30, 20);
      // Torso
      path.rect(cx - 20, cy - 25, 40, 40);
      // Left arm horizontal
      path.moveTo(cx - 20, cy - 15);
      path.lineTo(cx - 45, cy - 15);
      path.lineTo(cx - 45, cy - 5);
      // Right arm horizontal
      path.moveTo(cx + 20, cy - 15);
      path.lineTo(cx + 45, cy - 15);
      path.lineTo(cx + 45, cy - 5);
      paths.push(path);
    } else if (spriteType === "skeleton") {
      // Skeleton: Rib cage, skull, sword
      const path = new Path2D();
      // Skull
      path.arc(cx, cy - 35, 12, 0, Math.PI * 2);
      // Spine
      path.moveTo(cx, cy - 23);
      path.lineTo(cx, cy + 15);
      // Ribs
      path.moveTo(cx - 15, cy - 15); path.lineTo(cx + 15, cy - 15);
      path.moveTo(cx - 18, cy - 5); path.lineTo(cx + 18, cy - 5);
      path.moveTo(cx - 12, cy + 5); path.lineTo(cx + 12, cy + 5);
      // Sword
      path.moveTo(cx + 20, cy + 15);
      path.lineTo(cx + 40, cy - 30);
      path.moveTo(cx + 15, cy + 5); // Guard
      path.lineTo(cx + 30, cy + 12);
      paths.push(path);
    } else if (spriteType === "orc") {
      // Orc: horned brute with axes
      const path = new Path2D();
      // Head
      path.rect(cx - 20, cy - 40, 40, 30);
      // Snout
      path.rect(cx - 10, cy - 25, 20, 12);
      // Horns
      path.moveTo(cx - 20, cy - 40);
      path.quadraticCurveTo(cx - 35, cy - 55, cx - 30, cy - 30);
      path.moveTo(cx + 20, cy - 40);
      path.quadraticCurveTo(cx + 35, cy - 55, cx + 30, cy - 30);
      // Massive body
      path.moveTo(cx - 30, cy - 10);
      path.lineTo(cx + 30, cy - 10);
      path.lineTo(cx + 25, cy + 30);
      path.lineTo(cx - 25, cy + 30);
      path.closePath();
      paths.push(path);
    } else if (spriteType === "mage") {
      // Mage: hooded cloak, glowing staff
      const body = new Path2D();
      // Hood triangle
      body.moveTo(cx, cy - 45);
      body.lineTo(cx - 20, cy - 15);
      body.lineTo(cx + 20, cy - 15);
      body.closePath();
      // Cloak
      body.moveTo(cx - 25, cy - 15);
      body.lineTo(cx - 35, cy + 30);
      body.lineTo(cx + 35, cy + 30);
      body.lineTo(cx + 25, cy - 15);
      body.closePath();
      // Staff with glowing circle
      body.moveTo(cx - 25, cy + 30);
      body.lineTo(cx - 25, cy - 35);
      paths.push(body);
      
      const staffOrb = new Path2D();
      staffOrb.arc(cx - 25, cy - 40, 7, 0, Math.PI * 2);
      paths.push(staffOrb);
    } else if (spriteType === "spirit") {
      const body = new Path2D();
      body.arc(cx, cy - 18, 24, 0, Math.PI * 2);
      body.moveTo(cx - 18, cy + 4);
      body.quadraticCurveTo(cx - 8, cy + 24, cx, cy + 6);
      body.quadraticCurveTo(cx + 8, cy + 24, cx + 18, cy + 4);
      paths.push(body);

      const eyes = new Path2D();
      eyes.arc(cx - 8, cy - 20, 3, 0, Math.PI * 2);
      eyes.arc(cx + 8, cy - 20, 3, 0, Math.PI * 2);
      paths.push(eyes);
    } else if (spriteType === "wisp") {
      const path = new Path2D();
      path.arc(cx, cy - 10, 26, 0, Math.PI * 2);
      path.arc(cx, cy - 10, 14, 0, Math.PI * 2);
      path.moveTo(cx, cy - 48);
      path.quadraticCurveTo(cx + 12, cy - 28, cx, cy - 10);
      path.quadraticCurveTo(cx - 12, cy + 8, cx, cy + 28);
      paths.push(path);
    } else if (spriteType === "spider") {
      const path = new Path2D();
      path.ellipse(cx, cy - 10, 28, 18, 0, 0, Math.PI * 2);
      path.arc(cx, cy - 35, 12, 0, Math.PI * 2);
      for (let i = 0; i < 4; i++) {
        const y = cy - 22 + i * 8;
        path.moveTo(cx - 18, y);
        path.lineTo(cx - 50, y - 14 + i * 8);
        path.moveTo(cx + 18, y);
        path.lineTo(cx + 50, y - 14 + i * 8);
      }
      paths.push(path);
    } else if (spriteType === "bat") {
      const path = new Path2D();
      path.arc(cx, cy - 12, 10, 0, Math.PI * 2);
      path.moveTo(cx - 10, cy - 12);
      path.lineTo(cx - 55, cy - 38);
      path.lineTo(cx - 38, cy - 4);
      path.lineTo(cx - 20, cy - 22);
      path.moveTo(cx + 10, cy - 12);
      path.lineTo(cx + 55, cy - 38);
      path.lineTo(cx + 38, cy - 4);
      path.lineTo(cx + 20, cy - 22);
      paths.push(path);
    } else if (spriteType === "rabbit") {
      const path = new Path2D();
      path.ellipse(cx, cy, 20, 28, 0, 0, Math.PI * 2);
      path.arc(cx, cy - 34, 14, 0, Math.PI * 2);
      path.moveTo(cx - 8, cy - 45);
      path.lineTo(cx - 18, cy - 78);
      path.lineTo(cx - 4, cy - 48);
      path.moveTo(cx + 8, cy - 45);
      path.lineTo(cx + 18, cy - 78);
      path.lineTo(cx + 4, cy - 48);
      paths.push(path);
    } else if (spriteType === "flack") {
      const path = new Path2D();
      path.arc(cx, cy - 12, 36, 0, Math.PI * 2);
      path.moveTo(cx - 26, cy - 38);
      path.lineTo(cx + 26, cy + 14);
      path.moveTo(cx + 26, cy - 38);
      path.lineTo(cx - 26, cy + 14);
      path.moveTo(cx, cy - 58);
      path.lineTo(cx, cy + 32);
      path.moveTo(cx - 45, cy - 12);
      path.lineTo(cx + 45, cy - 12);
      paths.push(path);
    } else if (spriteType === "dragon") {
      // Ancient Dragon: massive head, wings, horns
      const path = new Path2D();
      // Dragon snout/jaw
      path.moveTo(cx - 40, cy - 10);
      path.lineTo(cx - 20, cy - 40);
      path.lineTo(cx + 20, cy - 40);
      path.lineTo(cx + 40, cy - 10);
      path.lineTo(cx + 20, cy + 20);
      path.lineTo(cx - 20, cy + 20);
      path.closePath();
      
      // Eyes
      path.moveTo(cx - 15, cy - 20); path.lineTo(cx - 5, cy - 15);
      path.moveTo(cx + 15, cy - 20); path.lineTo(cx + 5, cy - 15);
      
      // Horns
      path.moveTo(cx - 15, cy - 40);
      path.lineTo(cx - 35, cy - 70);
      path.lineTo(cx - 5, cy - 40);
      path.moveTo(cx + 15, cy - 40);
      path.lineTo(cx + 35, cy - 70);
      path.lineTo(cx + 5, cy - 40);

      // Wings outline in background
      path.moveTo(cx - 40, cy - 20);
      path.quadraticCurveTo(cx - 90, cy - 50, cx - 80, cy + 10);
      path.moveTo(cx + 40, cy - 20);
      path.quadraticCurveTo(cx + 90, cy - 50, cx + 80, cy + 10);
      paths.push(path);
    }

    if (useCache) this.monsterPathCache.set(spriteType, paths);
    return paths;
  }

  buildMonsterDetailPaths(spriteType, variant = "default") {
    if (spriteType !== "zombie" || variant === "default") return [];

    const cacheKey = `${spriteType}:${variant}`;
    const cached = this.monsterDetailCache.get(cacheKey);
    if (cached) return cached;

    const detail = new Path2D();
    // Keep one readable, monochrome landmark per zombie. These paths are
    // clipped to the shared body so they add information without widening
    // the cached silhouette or adding another glow pass.
    if (variant === "ゾンビ") {
      // Torn cloth: an uneven hem across the torso.
      detail.moveTo(-18, -17);
      detail.lineTo(-9, -10);
      detail.lineTo(-2, -17);
      detail.lineTo(7, -8);
      detail.lineTo(18, -16);
      detail.lineTo(18, 6);
      detail.lineTo(8, 1);
      detail.lineTo(0, 8);
      detail.lineTo(-9, 1);
      detail.lineTo(-18, 7);
      detail.closePath();
    } else if (variant === "ポイズンジャイアント") {
      // Poison sacs: two heavy, asymmetric pockets.
      detail.arc(-12, -4, 8, 0, Math.PI * 2);
      detail.arc(12, 3, 6, 0, Math.PI * 2);
      detail.moveTo(-5, -5);
      detail.lineTo(5, 1);
    } else if (variant === "アースジャイアント") {
      // Rock shoulders: angular plates stay inside the torso and arms.
      detail.moveTo(-19, -22);
      detail.lineTo(-12, -18);
      detail.lineTo(-13, -9);
      detail.lineTo(-19, -7);
      detail.closePath();
      detail.moveTo(19, -20);
      detail.lineTo(13, -16);
      detail.lineTo(13, -8);
      detail.lineTo(19, -5);
      detail.closePath();
    } else if (variant === "墓守の巨躯") {
      // Gravekeeper's key: a large ring and stem across the torso.
      detail.arc(-2, -12, 8, 0, Math.PI * 2);
      detail.moveTo(6, -12);
      detail.lineTo(16, 4);
      detail.lineTo(11, 8);
      detail.moveTo(14, 1);
      detail.lineTo(19, -3);
      detail.moveTo(16, 6);
      detail.lineTo(19, 2);
    } else if (variant === "アイアンゴーレム") {
      // Iron core: a square chest plate and two rivets mark the construct.
      detail.rect(-15, -10, 30, 20);
      detail.arc(-9, -4, 2, 0, Math.PI * 2);
      detail.arc(9, 4, 2, 0, Math.PI * 2);
    } else if (variant === "リビングアーマー") {
      // Empty helmet: a dark visor makes the armor read as hollow.
      detail.rect(-12, -42, 24, 9);
      detail.moveTo(-9, -37);
      detail.lineTo(9, -37);
    } else if (variant === "ストーンガード") {
      // Shield and pillar: the guard's defensive role stays inside the torso.
      detail.moveTo(-17, -17);
      detail.lineTo(-7, -12);
      detail.lineTo(-8, 5);
      detail.lineTo(-17, 10);
      detail.lineTo(-19, 5);
      detail.lineTo(-19, -12);
      detail.closePath();
      detail.rect(8, -19, 8, 28);
    } else if (variant === "カースドハンド") {
      // Reaching fingers: a compact palm inside the right torso.
      detail.moveTo(5, 12);
      detail.lineTo(7, -8);
      detail.lineTo(11, -15);
      detail.lineTo(14, -12);
      detail.lineTo(12, -3);
      detail.lineTo(16, -14);
      detail.lineTo(19, -12);
      detail.lineTo(16, -1);
      detail.lineTo(19, -8);
      detail.lineTo(20, -5);
      detail.lineTo(15, 8);
      detail.lineTo(18, 5);
      detail.lineTo(19, 9);
      detail.lineTo(15, 14);
      detail.closePath();
    } else if (variant === "石像兵") {
      // Masonry: a carved block seam and central crack.
      detail.rect(-18, -15, 36, 2);
      detail.rect(-18, -1, 36, 2);
      detail.moveTo(0, -13);
      detail.lineTo(-5, -4);
      detail.lineTo(4, 6);
      detail.lineTo(0, 17);
      detail.lineTo(-2, 17);
      detail.lineTo(2, 6);
      detail.lineTo(-7, -4);
      detail.lineTo(-2, -13);
      detail.closePath();
    } else if (variant === "反逆の鎧") {
      // Rebellious armor: one deep diagonal slash through the plate.
      detail.moveTo(-14, -21);
      detail.lineTo(16, 14);
      detail.lineTo(12, 15);
      detail.lineTo(-16, -18);
      detail.closePath();
    }

    const paths = [detail];
    this.monsterDetailCache.set(cacheKey, paths);
    return paths;
  }

  getMonsterBodyGradient(ctx, color, cy) {
    const key = `${color}|${cy}`;
    const cached = this.monsterGradientCache.get(key);
    if (cached) return cached;

    const gradient = ctx.createLinearGradient(0, cy - 65, 0, cy + 38);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.48, color);
    gradient.addColorStop(1, "rgba(12, 12, 14, 0.96)");
    this.monsterGradientCache.set(key, gradient);
    return gradient;
  }

  strokeNeonPaths(ctx, paths, color, scale, bodyGradient) {
    const px = width => Math.max(width, 0.9 / scale);

    // Fill the silhouette before outlining it so the dungeon never shows
    // through the monster body. Keep this opaque enough to read as volume
    // while preserving the neon line-art style.
    ctx.fillStyle = bodyGradient;
    ctx.globalAlpha = 1;
    paths.forEach(path => ctx.fill(path));

    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // One colored glow pass plus the white core is enough once the body is
    // filled. This lowers both stroke work and shadowBlur cost by one pass.
    ctx.strokeStyle = color;
    ctx.lineWidth = px(5);
    ctx.globalAlpha = 0.72;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    paths.forEach(path => ctx.stroke(path));

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = px(1.2);
    ctx.globalAlpha = 0.92;
    ctx.shadowBlur = 0;
    paths.forEach(path => ctx.stroke(path));

    ctx.globalAlpha = 1;
  }

  drawMonsterDetails(ctx, detailPaths) {
    if (detailPaths.length === 0) return;

    ctx.fillStyle = "rgba(8, 12, 16, 0.88)";
    detailPaths.forEach(path => ctx.fill(path));
  }

  drawMonster(ctx, monster, cx, cy, scale, maxLabelWidth) {
    const color = monster.color || "#ff3b30";
    const bodyGradient = this.getMonsterBodyGradient(ctx, color, cy);

    ctx.save();
    // A flat contact shadow anchors the sprite without adding another blur.
    ctx.fillStyle = "rgba(0, 0, 0, 0.58)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 28 * scale, 35 * scale, 5 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(cx, cy);
    ctx.scale(scale, scale);

    const spriteType = this.getMonsterSpriteType(monster);
    const variant = this.getMonsterVisualVariant(monster);
    const paths = this.buildMonsterPaths(spriteType);
    this.strokeNeonPaths(ctx, paths, color, scale, bodyGradient);
    this.drawMonsterDetails(ctx, this.buildMonsterDetailPaths(spriteType, variant));

    ctx.restore();

    // Draw Monster Name & HP bar above it
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${scale < 0.6 ? 10 : scale < 1 ? 11 : 13}px 'Share Tech Mono', monospace`;
    ctx.textAlign = "center";
    ctx.fillText(`${monster.name} (Lv.${monster.level})`, cx, cy - 70, maxLabelWidth);

    // Draw Omen (danger telegraph) if any
    let omenText = "";
    if (monster.chargeQueued) omenText = "⚠️溜め中 (大ダメージ)";
    else if (monster.selfDestructQueued) omenText = "⚠️爆発寸前 (自爆)";
    else if (monster.lahalitoQueued) omenText = "⚠️詠唱準備 (ラハリト/全体)";
    else if (monster.madaltoQueued) omenText = "⚠️詠唱準備 (マダルト/全体)";
    else if (monster.tiltowaitQueued) omenText = "⚠️詠唱準備 (極大爆裂/全体)";
    else if (monster.dragonBreathQueued) omenText = "⚠️ブレス準備 (全体)";
    else if (monster.multiActionQueued) omenText = "⚠️連続行動の予兆";
    else if (monster.summonQueued) omenText = "⚠️召喚の予兆";
    else if (monster.snipeQueued) {
      const targetChar = state.party[monster.snipeTargetIdx];
      omenText = `⚠️狙撃準備 (対象: ${targetChar ? targetChar.name : "冒険者"})`;
    }

    if (omenText) {
      ctx.fillStyle = "#ffcc00"; // Amber color for warnings
      ctx.font = `bold ${scale < 0.6 ? 9 : 12}px 'Share Tech Mono', monospace`;
      ctx.fillText(omenText, cx, cy - 88, maxLabelWidth);
    }

    // HP Bar
    const barW = Math.min(100, maxLabelWidth);
    const barH = 5;
    const pct = Math.max(0, monster.hp / monster.maxHp);
    ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
    ctx.fillRect(cx - barW / 2, cy - 62, barW, barH);
    ctx.fillStyle = monster.color || "#ff3b30";
    ctx.fillRect(cx - barW / 2, cy - 62, barW * pct, barH);
    ctx.strokeStyle = "#8e8e93";
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - barW / 2, cy - 62, barW, barH);
  }

  drawMiniMap(ctx) {
    const map = state.map;
    if (!Array.isArray(map) || map.length === 0) return;
    for (let y = 0; y < map.length; y++) {
      if (!Object.hasOwn(map, y) || !Array.isArray(map[y])) return;
    }

    const cellS = 10; // Adjust cell size to 10px
    const margin = 8;
    const minimapSize = 128; // Fixed minimap size to match 16x16 cell size (128x128px)
    
    // Draw background panel border and background (unclipped)
    ctx.fillStyle = "rgba(12, 12, 14, 0.9)";
    ctx.strokeStyle = "rgba(0, 229, 255, 0.5)";
    ctx.lineWidth = 2;
    ctx.fillRect(margin - 2, margin - 2, minimapSize + 4, minimapSize + 4);
    ctx.strokeRect(margin - 2, margin - 2, minimapSize + 4, minimapSize + 4);

    ctx.save();
    // Clip drawing inside the 128x128 panel
    ctx.beginPath();
    ctx.rect(margin, margin, minimapSize, minimapSize);
    ctx.clip();

    // Desired centering offsets so player is at the center of the minimap
    const desiredOffsetX = (minimapSize / 2) - (state.x * cellS + cellS / 2);
    const desiredOffsetY = (minimapSize / 2) - (state.y * cellS + cellS / 2);

    const mapWidth = Math.max(...map.map(row => row.length));
    const mapHeight = map.length;
    const mapPixelW = mapWidth * cellS;
    const mapPixelH = mapHeight * cellS;

    const minOffsetX = minimapSize - mapPixelW;
    const minOffsetY = minimapSize - mapPixelH;

    // Clamp offsets to map boundaries to prevent black margins
    const offsetX = Math.max(minOffsetX, Math.min(0, desiredOffsetX));
    const offsetY = Math.max(minOffsetY, Math.min(0, desiredOffsetY));

    const lightRad = state.lightPower === "lomilwa" ? 5 : (state.lightTurns > 0 ? 3 : 0);
    const fragmentCells = new Set(state.dungeonMemory?.mapFragments?.[state.floor] || []);

      for (let y = 0; y < map.length; y++) {
        for (let x = 0; x < map[y].length; x++) {
          const isVisited = Boolean(state.visitedMap?.[y]?.[x]);
        const isFragmentRevealed = fragmentCells.has(`${x},${y}`);
        const dist = Math.abs(x - state.x) + Math.abs(y - state.y);
        const isLightRevealed = (lightRad > 0 && dist <= lightRad);

        const cell = map[y][x];
        const hasDiscoveredTrap = cell.trap && cell.trap.state !== "hidden";
        // A discovered trap is durable map information even when its cell has
        // not otherwise been explored. Keep the marker visible so route choice
        // can use the discovery without revealing the surrounding terrain.
        if (!isVisited && !isLightRevealed && !isFragmentRevealed && !hasDiscoveredTrap) continue;

        if (!isRenderableCell(cell)) continue;
        const screenX = margin + x * cellS + offsetX;
        const screenY = margin + y * cellS + offsetY;

        const isLightOnly = !isVisited && isLightRevealed;
        const isFragmentOnly = !isVisited && !isLightRevealed && isFragmentRevealed;

        if (isFragmentOnly) {
          ctx.fillStyle = "rgba(255, 179, 0, 0.04)";
          ctx.fillRect(screenX, screenY, cellS, cellS);
          ctx.strokeStyle = "rgba(255, 179, 0, 0.4)";
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 2]);
        } else if (isLightOnly) {
          // Faint cyan floor for light-only cell previews
          ctx.fillStyle = "rgba(0, 229, 255, 0.04)";
          ctx.fillRect(screenX, screenY, cellS, cellS);

          // Faint cyan dashed walls
          ctx.strokeStyle = "rgba(0, 229, 255, 0.35)";
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 2]);
        } else {
          // Explored paths get solid neon green
          ctx.fillStyle = "rgba(0, 255, 102, 0.08)";
          ctx.fillRect(screenX, screenY, cellS, cellS);

          ctx.strokeStyle = "#00ff66";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([]); // Solid lines
        }

        // Draw walls
        ctx.beginPath();
        if (cell.walls[0]) { // North
          ctx.moveTo(screenX, screenY);
          ctx.lineTo(screenX + cellS, screenY);
        }
        if (cell.walls[1]) { // East
          ctx.moveTo(screenX + cellS, screenY);
          ctx.lineTo(screenX + cellS, screenY + cellS);
        }
        if (cell.walls[2]) { // South
          ctx.moveTo(screenX, screenY + cellS);
          ctx.lineTo(screenX + cellS, screenY + cellS);
        }
        if (cell.walls[3]) { // West
          ctx.moveTo(screenX, screenY);
          ctx.lineTo(screenX, screenY + cellS);
        }
        ctx.stroke();

        // Reset line dash
        ctx.setLineDash([]);

        this.drawOneWayMiniMapMarkers(ctx, screenX, screenY, cellS, cell, isLightOnly);

        // Special cell colors
        if (cell.type === "stairs-down") {
          const fill = "255, 179, 0";
          const stroke = "#ffb300";
          ctx.fillStyle = isLightOnly ? `rgba(${fill}, 0.2)` : `rgba(${fill}, 0.5)`;
          ctx.fillRect(screenX + 1, screenY + 1, cellS - 2, cellS - 2);
          ctx.strokeStyle = isLightOnly ? `rgba(${fill}, 0.4)` : stroke;
          ctx.lineWidth = 1;
          ctx.strokeRect(screenX + 1, screenY + 1, cellS - 2, cellS - 2);
          this.drawStairMiniMapIcon(ctx, screenX, screenY, cellS, false, stroke);
        }

        if (cell.trap && cell.trap.state !== "hidden") {
          const isDisabled = cell.trap.state === "disabled";
          const markerColor = isDisabled ? "#2fd66d" : "#ff3b30";
          const markerBg = isDisabled ? "rgba(47, 214, 109, 0.22)" : "rgba(255, 59, 48, 0.24)";

          ctx.fillStyle = markerBg;
          ctx.beginPath();
          ctx.arc(screenX + cellS / 2, screenY + cellS / 2, 4, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = markerColor;
          ctx.lineWidth = 1.2;
          ctx.stroke();

          ctx.fillStyle = markerColor;
          ctx.font = "bold 9px monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(isDisabled ? "x" : "!", screenX + cellS / 2, screenY + cellS / 2);
        }
      }
    }

    // Draw secret event auras (faint glowing circles)
    for (let y = 0; y < state.map.length; y++) {
      if (!state.map[y]) continue;
      for (let x = 0; x < state.map[y].length; x++) {
        if (!state.map[y][x]) continue;
        const cell = state.map[y][x];
        const dist = Math.abs(x - state.x) + Math.abs(y - state.y);
        
        // Aura range is within 4 steps
        if (dist > 4) continue;

        const hasStairs = cell.type === "stairs-down";
        const hasEvent = cell.event === EVENT_TYPES.SPRING || 
                          cell.event === EVENT_TYPES.CAMP ||
                          cell.event === EVENT_TYPES.TABLET || 
                          cell.event === EVENT_TYPES.MERCHANT || 
                          cell.event === EVENT_TYPES.RETURN_PORTAL ||
                          cell.event === EVENT_TYPES.MIDBOSS || 
                          cell.event === EVENT_TYPES.BOSS;

        if (!hasStairs && !hasEvent) continue;

        const screenX = margin + x * cellS + offsetX;
        const screenY = margin + y * cellS + offsetY;

        ctx.save();
        if (hasStairs) {
          ctx.fillStyle = "rgba(255, 179, 0, 0.12)";
          ctx.beginPath();
          ctx.arc(screenX + cellS / 2, screenY + cellS / 2, cellS * 0.9, 0, Math.PI * 2);
          ctx.fill();
        } else if (cell.event === EVENT_TYPES.BOSS || cell.event === EVENT_TYPES.MIDBOSS) {
          // Pulsing red glow for boss/midboss
          const pulse = 0.14 + 0.08 * Math.sin(Date.now() / 200);
          ctx.fillStyle = `rgba(255, 59, 48, ${pulse})`;
          ctx.beginPath();
          ctx.arc(screenX + cellS / 2, screenY + cellS / 2, cellS * 1.3, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Purple glow for mystery events (spring, tablet, merchant)
          ctx.fillStyle = "rgba(191, 90, 242, 0.14)";
          ctx.beginPath();
          ctx.arc(screenX + cellS / 2, screenY + cellS / 2, cellS * 0.9, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    // Draw roaming Flack on minimap
    if (state.roamingMonsters) {
      state.roamingMonsters.forEach(rm => {
        if (rm.floor !== state.floor) return;
        if (rm.perception === "afterimage" && getPartyMaxAffix(state.party, "arcaneSense") < 1) return;
        const dist = Math.abs(rm.x - state.x) + Math.abs(rm.y - state.y);
        if (rm.kind === "elite" || dist <= 4) {
          const rx = margin + rm.x * cellS + cellS / 2 + offsetX;
          const ry = margin + rm.y * cellS + cellS / 2 + offsetY;
          
          // Flashing red dot
          const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 150);
          ctx.save();
          const perceptionColors = { sound: "255, 179, 0", blind_charge: "255, 92, 92", vibration: "89, 214, 138", standard: "255, 59, 48", afterimage: "190, 120, 255" };
          const color = perceptionColors[rm.perception] || (rm.kind === "elite" ? "255, 179, 0" : "255, 59, 48");
          ctx.fillStyle = `rgba(${color}, ${pulse})`;
          ctx.shadowBlur = 6;
          ctx.shadowColor = rm.kind === "elite" ? "#ffb300" : "#ff3b30";
          ctx.beginPath();
          ctx.arc(rx, ry, rm.kind === "elite" ? 4.5 : 3.5, 0, Math.PI * 2);
          ctx.fill();
          if (rm.kind === "elite") {
            ctx.strokeStyle = "#ff3b30";
            ctx.lineWidth = 1.2;
            ctx.stroke();
          }
          ctx.restore();
        }
      });
    }

    // Draw player arrow
    const px = margin + state.x * cellS + cellS / 2 + offsetX;
    const py = margin + state.y * cellS + cellS / 2 + offsetY;
    
    // Draw background glow circle for player location.
    ctx.fillStyle = "rgba(0, 229, 255, 0.25)";
    ctx.beginPath();
    ctx.arc(px, py, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#00e5ff";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.shadowBlur = 6;
    ctx.shadowColor = "#00e5ff";
    
    ctx.save();
    ctx.translate(px, py);
    // Rotate to match direction: 0=N, 1=E, 2=S, 3=W
    ctx.rotate((state.dir * Math.PI) / 2);
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(-5, 5);
    ctx.lineTo(5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    
    ctx.restore();
    ctx.shadowBlur = 0;
  }

  drawOneWayMiniMapMarkers(ctx, screenX, screenY, cellS, cell, isLightOnly) {
    if (!cell.blockEnter?.some(Boolean)) return;

    const centerX = screenX + cellS / 2;
    const centerY = screenY + cellS / 2;
    const length = Math.max(5, cellS * 0.34);
    const head = Math.max(2, cellS * 0.12);

    ctx.save();
    ctx.strokeStyle = isLightOnly ? "rgba(0, 229, 255, 0.55)" : "#ffb300";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);

    cell.blockEnter.forEach((blocked, dir) => {
      if (!blocked) return;

      const dx = DX[dir];
      const dy = DY[dir];
      const startX = centerX - dx * length * 0.35;
      const startY = centerY - dy * length * 0.35;
      const endX = centerX + dx * length;
      const endY = centerY + dy * length;

      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      ctx.beginPath();
      if (dir === 0 || dir === 2) {
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - head, endY - dy * head);
        ctx.lineTo(endX + head, endY - dy * head);
      } else {
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - dx * head, endY - head);
        ctx.lineTo(endX - dx * head, endY + head);
      }
      ctx.closePath();
      ctx.fill();
    });

    ctx.restore();
  }

  drawStairMiniMapIcon(ctx, screenX, screenY, cellS, isUp, color) {
    const left = screenX + 2;
    const right = screenX + cellS - 2;
    const top = screenY + 2;
    const bottom = screenY + cellS - 2;
    const stepX = (right - left) / 3;
    const stepY = (bottom - top) / 3;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.lineCap = "square";
    ctx.lineJoin = "miter";
    ctx.beginPath();

    if (isUp) {
      ctx.moveTo(left, bottom);
      ctx.lineTo(left + stepX, bottom);
      ctx.lineTo(left + stepX, bottom - stepY);
      ctx.lineTo(left + stepX * 2, bottom - stepY);
      ctx.lineTo(left + stepX * 2, bottom - stepY * 2);
      ctx.lineTo(right, bottom - stepY * 2);
    } else {
      ctx.moveTo(left, top + stepY);
      ctx.lineTo(left + stepX, top + stepY);
      ctx.lineTo(left + stepX, top + stepY * 2);
      ctx.lineTo(left + stepX * 2, top + stepY * 2);
      ctx.lineTo(left + stepX * 2, bottom);
      ctx.lineTo(right, bottom);
    }

    ctx.stroke();
    ctx.restore();
  }

  drawFloatingTexts(ctx) {
    ctx.font = "bold 16px 'Share Tech Mono', monospace";
    ctx.textAlign = "center";
    
    this.damageTexts.forEach(t => {
      ctx.fillStyle = t.color;
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 8;
      
      // Float up slightly
      const yOffset = t.age * 0.7;
      ctx.fillText(t.text, t.x, t.y - yOffset);
      
      ctx.shadowBlur = 0;
    });
  }
}
