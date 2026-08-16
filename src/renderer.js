import { DX, DY, EVENT_TYPES, getPartyMaxAffix } from "./data.js";
import { state } from "./state.js";
import { menuContext } from "./navigation.js";
import { EVENT_SUBMENU_TYPES, ITEM_SUBMENU_TYPES } from "./constants/events.js";

export let dungeonRenderer = null;
export function setDungeonRenderer(r) {
  dungeonRenderer = r;
}

// Canvas dimensions
const VIEW_W = 400;
const VIEW_H = 260;

// Depth planes for 3D projection
const XL = [0, 100, 145, 170, 184];
const XR = [400, 300, 255, 230, 216];
const YT = [0, 52, 86, 106, 118];
const YB = [260, 208, 174, 154, 142];

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
    const isDeparturePrepSubmenu = state.gameState === "submenu" && menuContext.type === "solo_start";
    const showTownBackground = !isDeparturePrepSubmenu && (
      !state.map ||
      ["town", "result", "gameover", "victory"].includes(state.gameState) ||
      (state.gameState === "submenu" && menuContext.prevGameState === "town")
    );
    const showCombat = !showTownBackground && Boolean(
      state.combatState && (
        state.gameState === "combat"
        || (state.gameState === "submenu" && menuContext.type.startsWith("combat"))
      )
    );
    const showChest = !showTownBackground && (
      state.gameState === "chest"
      || (state.gameState === "submenu" && state.chestState)
    );
    const showEventScene = !showTownBackground && (
      state.gameState === "trap_encounter"
      || (state.gameState === "submenu" && EVENT_SUBMENU_TYPES.includes(menuContext.type))
    );
    const showItemMenu = !showTownBackground && (
      state.gameState === "submenu" && ITEM_SUBMENU_TYPES.includes(menuContext.type)
    );

    return { showTownBackground, showCombat, showChest, showEventScene, showItemMenu };
  }

  getDrawSignature(sceneVisibility = this.getSceneVisibility()) {
    const { showTownBackground, showItemMenu } = sceneVisibility;
    const signature = [
      state.gameState,
      state.floor,
      state.x,
      state.y,
      state.dir,
      Boolean(state.map),
      menuContext.type,
      menuContext.prevGameState,
      Boolean(state.combatState),
      Boolean(state.chestState),
      state.mapRevision,
      showItemMenu
    ];

    if (showTownBackground) return signature.join("|");

    const combatMonsters = state.combatState?.monsters?.map(monster => [
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
      monster.snipeTargetIdx
    ].join(",")).join(";") || "";
    const roamingMonsters = state.roamingMonsters?.map(monster => [
      monster.floor,
      monster.x,
      monster.y,
      monster.kind,
      monster.perception
    ].join(",")).join(";") || "";

    signature.push(
      state.dumapicTurns > 0,
      state.lightTurns > 0,
      state.lightPower,
      roamingMonsters,
      getPartyMaxAffix(state.party, "arcaneSense"),
      combatMonsters,
      state.party.map(char => char?.name).join(",")
    );
    return signature.join("|");
  }

  isAnimating(sceneVisibility = this.getSceneVisibility()) {
    if (this.shakeTime > 0 || this.flashTime > 0 || this.damageTexts.length > 0) return true;

    const { showTownBackground, showCombat, showChest, showEventScene, showItemMenu } = sceneVisibility;
    if (showTownBackground) return false;

    // These layers use Date.now() for visual pulses and must keep redrawing.
    if (state.floor === 5) return true;
    if (showCombat || showChest || showEventScene || showItemMenu) return false;

    const minY = Math.max(0, state.y - 4);
    const maxY = Math.min(state.map.length - 1, state.y + 4);
    for (let y = minY; y <= maxY; y++) {
      const row = state.map[y];
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
    const px = state.x;
    const py = state.y;
    const dir = state.dir;

    ctx.lineWidth = 2;
    ctx.shadowBlur = 0;

    // Determine colors based on floor theme
    let wallColor = "#00ff66";
    let gridColor = "rgba(0, 255, 102, 0.2)";
    let outOfBoundsColor = "#ff3b30";

    if (state.floor === 1) {
      wallColor = "#00e5ff"; // Neon Cyan
      gridColor = "rgba(0, 229, 255, 0.25)";
    } else if (state.floor === 2) {
      wallColor = "#00cc55"; // Poisonous Green
      gridColor = "rgba(0, 204, 85, 0.2)";
    } else if (state.floor === 3) {
      wallColor = "#a855f7"; // Arcane Purple
      gridColor = "rgba(168, 85, 247, 0.2)";
    } else if (state.floor === 4) {
      wallColor = "#cc2222"; // Death Red
      gridColor = "rgba(204, 34, 34, 0.15)";
    } else if (state.floor === 5) {
      wallColor = "#cc8800"; // Dragon amber
      gridColor = "rgba(204, 136, 0, 0.2)";
    }

    const columnOrder = [-2, 2, -1, 1, 0];
    const dirRight = (dir + 1) % 4;

    // Draw from back (z=3) to front (z=0), outer columns before center
    for (let z = 3; z >= 0; z--) {
      const width = XR[z] - XL[z];
      const nextWidth = XR[z + 1] - XL[z + 1];
      for (const column of columnOrder) {
        if (Math.abs(column) === 2 && z < 2) continue;

        const cx = px + DX[dir] * z + DX[dirRight] * column;
        const cy = py + DY[dir] * z + DY[dirRight] * column;
        const left = XL[z] + width * column;
        const right = XR[z] + width * column;
        const nextLeft = XL[z + 1] + nextWidth * column;
        const nextRight = XR[z + 1] + nextWidth * column;

        // Check out of bounds
        if (cx < 0 || cy < 0 || cy >= state.map.length || cx >= state.map[cy].length) {
          // Render a solid wall block at depth z
          this.renderSolidWall(ctx, z, outOfBoundsColor, column); // Red glow for out of bounds
          continue;
        }

        const cell = state.map[cy][cx];

        // Relative directions based on player orientation
        const dirLeft = (dir + 3) % 4;
        const dirFront = dir;

        const hasLeftWall = cell.walls[dirLeft];
        const hasRightWall = cell.walls[dirRight];
        const hasFrontWall = cell.walls[dirFront];
        const frontX = cx + DX[dirFront];
        const frontY = cy + DY[dirFront];
        const frontEnterFace = (dirFront + 2) % 4;
        const hasFrontOneWayBarrier = column === 0 && !hasFrontWall && Boolean(state.map[frontY]?.[frontX]?.blockEnter?.[frontEnterFace]);

        // 1. Draw floor/ceiling segments
        ctx.strokeStyle = gridColor;

        // Floor lines
        ctx.beginPath();
        ctx.moveTo(left, YB[z]);
        ctx.lineTo(nextLeft, YB[z + 1]);
        ctx.moveTo(right, YB[z]);
        ctx.lineTo(nextRight, YB[z + 1]);
        // Ceiling lines
        ctx.moveTo(left, YT[z]);
        ctx.lineTo(nextLeft, YT[z + 1]);
        ctx.moveTo(right, YT[z]);
        ctx.lineTo(nextRight, YT[z + 1]);
        ctx.stroke();

        // Horizontal grid lines
        ctx.beginPath();
        ctx.moveTo(nextLeft, YB[z + 1]);
        ctx.lineTo(nextRight, YB[z + 1]);
        ctx.moveTo(nextLeft, YT[z + 1]);
        ctx.lineTo(nextRight, YT[z + 1]);
        ctx.stroke();

        // 2. Left Wall
        if (hasLeftWall) {
          ctx.fillStyle = "#0c0c0e";
          ctx.beginPath();
          ctx.moveTo(left, YT[z]);
          ctx.lineTo(nextLeft, YT[z + 1]);
          ctx.lineTo(nextLeft, YB[z + 1]);
          ctx.lineTo(left, YB[z]);
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = wallColor;
          ctx.stroke();
        }

        // 3. Right Wall
        if (hasRightWall) {
          ctx.fillStyle = "#0c0c0e";
          ctx.beginPath();
          ctx.moveTo(right, YT[z]);
          ctx.lineTo(nextRight, YT[z + 1]);
          ctx.lineTo(nextRight, YB[z + 1]);
          ctx.lineTo(right, YB[z]);
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = wallColor;
          ctx.stroke();
        }

        // 4. Front Wall (at z + 1 depth)
        if (hasFrontWall) {
          ctx.fillStyle = "#0c0c0e";
          ctx.fillRect(nextLeft, YT[z + 1], nextWidth, YB[z + 1] - YT[z + 1]);

          ctx.strokeStyle = wallColor;
          ctx.strokeRect(nextLeft, YT[z + 1], nextWidth, YB[z + 1] - YT[z + 1]);
        } else if (hasFrontOneWayBarrier) {
          this.drawOneWayBarrier(ctx, z, wallColor);
        }

        // Check special symbols inside cells (stairs up / down)
        if (column === 0 && (cell.type === "stairs-up" || cell.type === "stairs-down")) {
          this.drawStairsIcon(ctx, z, cell.type);
        }

        if (column === 0 && z > 0 && cell.event === EVENT_TYPES.CHEST) {
          this.drawChestIcon(ctx, z);
        }

        if (column === 0 && z > 0 && cell.trap && cell.trap.state === "discovered") {
          this.drawTrapIcon(ctx, z, (cell.trap.traceReadLevel || 0) >= 2);
        }

        // Check if there is a roaming monster at this coordinate (cx, cy)
        if (column === 0 && state.roamingMonsters) {
          const hasFlack = state.roamingMonsters.some(
            rm => rm.floor === state.floor && rm.x === cx && rm.y === cy
          );
          if (hasFlack && z > 0) { // Don't draw under the player
            this.drawRoamingFlackIcon(ctx, z);
          }
        }

        // 5. Draw 3D Environmental Effects (fog / ambient aura / heat)
        if (z > 0) {
          if (state.floor === 2) {
            // B2F Fog: Cumulative semi-transparent dark green overlay
            ctx.fillStyle = "rgba(5, 25, 10, 0.18)";
            ctx.fillRect(left, YT[z], width, YB[z] - YT[z]);
          } else if (state.floor === 3) {
            // B3F Mana residue: cumulative magenta overlay
            ctx.fillStyle = "rgba(120, 0, 180, 0.04)";
            ctx.fillRect(left, YT[z], width, YB[z] - YT[z]);
          } else if (state.floor === 5) {
            // B5F Heatwave shimmer: cumulative dark red-orange overlay with slight temporal pulse
            const heatPulse = 0.06 + 0.02 * Math.sin(Date.now() / 250);
            ctx.fillStyle = `rgba(100, 20, 0, ${heatPulse})`;
            ctx.fillRect(left, YT[z], width, YB[z] - YT[z]);
          }
        }
      }
    }
  }

  renderSolidWall(ctx, z, color, column = 0) {
    const width = XR[z] - XL[z];
    const left = XL[z] + width * column;
    ctx.fillStyle = "#0c0c0e";
    ctx.fillRect(left, YT[z], width, YB[z] - YT[z]);
    ctx.strokeStyle = color;
    ctx.strokeRect(left, YT[z], width, YB[z] - YT[z]);
  }

  drawOneWayBarrier(ctx, z, color) {
    const x = XL[z + 1];
    const y = YT[z + 1];
    const w = XR[z + 1] - XL[z + 1];
    const h = YB[z + 1] - YT[z + 1];
    const midX = x + w / 2;
    const midY = y + h / 2;
    const chevronW = Math.max(8, w * 0.18);
    const chevronH = Math.max(6, h * 0.12);

    ctx.fillStyle = "rgba(0, 229, 255, 0.10)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(0, 229, 255, 0.75)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);

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

  drawStairsIcon(ctx, z, type) {
    const xl = XL[z];
    const xr = XR[z];
    const yb = YB[z];
    
    const w = xr - xl;
    const stepW = w * 0.4;
    const startX = xl + w * 0.3;

    const isUp = type === "stairs-up";
    const color = isUp ? "#00b7ff" : "#ffb300";
    const label = isUp ? "↑" : "↓";

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    // Base step
    ctx.moveTo(startX, yb - 2);
    ctx.lineTo(startX + stepW, yb - 2);
    ctx.lineTo(startX + stepW * 0.9, yb - 12);
    ctx.lineTo(startX + stepW * 0.1, yb - 12);
    ctx.closePath();
    
    // Middle step
    ctx.moveTo(startX + stepW * 0.15, yb - 12);
    ctx.lineTo(startX + stepW * 0.85, yb - 12);
    ctx.lineTo(startX + stepW * 0.75, yb - 22);
    ctx.lineTo(startX + stepW * 0.25, yb - 22);
    ctx.closePath();

    // Top step
    ctx.moveTo(startX + stepW * 0.3, yb - 22);
    ctx.lineTo(startX + stepW * 0.7, yb - 22);
    ctx.lineTo(startX + stepW * 0.6, yb - 30);
    ctx.lineTo(startX + stepW * 0.4, yb - 30);
    ctx.closePath();

    ctx.stroke();

    ctx.font = "bold 16px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, xl + w * 0.5, yb - 18);
    ctx.restore();
  }

  drawChestIcon(ctx, z) {
    const xl = XL[z];
    const xr = XR[z];
    const yb = YB[z];

    const corridorWidth = xr - xl;
    const chestWidth = corridorWidth * 0.28;
    const chestHeight = chestWidth * 0.58;
    const x = xl + (corridorWidth - chestWidth) / 2;
    const y = yb - chestHeight - 2;
    const lidHeight = chestHeight * 0.38;
    const bandWidth = chestWidth * 0.12;
    const color = "#ffd60a";

    ctx.save();
    ctx.fillStyle = "#6b3a00";
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, corridorWidth * 0.008);
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;

    ctx.beginPath();
    ctx.moveTo(x, y + lidHeight);
    ctx.lineTo(x + chestWidth * 0.12, y);
    ctx.lineTo(x + chestWidth * 0.88, y);
    ctx.lineTo(x + chestWidth, y + lidHeight);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillRect(x, y + lidHeight, chestWidth, chestHeight - lidHeight);
    ctx.strokeRect(x, y + lidHeight, chestWidth, chestHeight - lidHeight);

    ctx.fillStyle = color;
    ctx.fillRect(x + (chestWidth - bandWidth) / 2, y, bandWidth, chestHeight);
    ctx.restore();
  }

  drawTrapIcon(ctx, z, revealSpecies) {
    const xl = XL[z];
    const xr = XR[z];
    const yb = YB[z];

    const corridorWidth = xr - xl;
    const size = corridorWidth * 0.22;
    const cx = xl + corridorWidth / 2;
    const cy = yb - size * 0.6 - 2;

    ctx.save();
    ctx.strokeStyle = "#ff3b30";
    ctx.shadowColor = "#ff3b30";
    ctx.shadowBlur = 6;
    ctx.lineWidth = 2;

    // Hazard triangle on the floor ahead
    ctx.beginPath();
    ctx.moveTo(cx, cy - size * 0.5);
    ctx.lineTo(cx + size * 0.55, cy + size * 0.4);
    ctx.lineTo(cx - size * 0.55, cy + size * 0.4);
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = "#ff3b30";
    ctx.font = `bold ${Math.max(8, Math.round(size * 0.5))}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(revealSpecies ? "!" : "?", cx, cy + size * 0.05);

    ctx.restore();
  }

  drawRoamingFlackIcon(ctx, z) {
    const xl = XL[z];
    const xr = XR[z];
    const yt = YT[z];
    const yb = YB[z];

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

  drawChest(ctx) {
    // Render a 3D treasure chest in front
    const cx = VIEW_W / 2;
    const cy = VIEW_H / 2 + 20;
    
    ctx.strokeStyle = "#ffb300"; // Glowing amber chest
    ctx.shadowColor = "#ffb300";
    ctx.shadowBlur = 8;
    ctx.lineWidth = 2.5;

    ctx.beginPath();
    // Lid (Arc-like shape)
    ctx.moveTo(cx - 30, cy - 10);
    ctx.quadraticCurveTo(cx, cy - 35, cx + 30, cy - 10);
    ctx.lineTo(cx + 30, cy);
    ctx.lineTo(cx - 30, cy);
    ctx.closePath();
    
    // Box
    ctx.rect(cx - 30, cy, 60, 35);
    
    // Keyhole & bands
    ctx.moveTo(cx - 15, cy - 10);
    ctx.lineTo(cx - 15, cy + 35);
    ctx.moveTo(cx + 15, cy - 10);
    ctx.lineTo(cx + 15, cy + 35);

    ctx.stroke();
    
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

  drawMonsters(ctx) {
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
      this.drawMonster(ctx, monster, cx, cy, scale, slotWidth - 8);
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
    const paths = this.buildMonsterPaths(spriteType);
    this.strokeNeonPaths(ctx, paths, color, scale, bodyGradient);

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
    const cellS = 10; // Adjust cell size to 10px
    const margin = 8;
    const minimapSize = 128; // Fixed minimap size to match 16x16 cell size (128x128px)
    
    // Draw background panel border and background (unclipped)
    ctx.fillStyle = "rgba(12, 12, 14, 0.9)";
    const isDumapic = state.dumapicTurns > 0;
    ctx.strokeStyle = isDumapic ? "rgba(255, 215, 0, 0.9)" : "rgba(0, 229, 255, 0.5)";
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

    const mapWidth = Math.max(...state.map.map(row => row.length));
    const mapHeight = state.map.length;
    const mapPixelW = mapWidth * cellS;
    const mapPixelH = mapHeight * cellS;

    const minOffsetX = minimapSize - mapPixelW;
    const minOffsetY = minimapSize - mapPixelH;

    // Clamp offsets to map boundaries to prevent black margins
    const offsetX = Math.max(minOffsetX, Math.min(0, desiredOffsetX));
    const offsetY = Math.max(minOffsetY, Math.min(0, desiredOffsetY));

    // DUMAPIC/LOMILWA reveal wider tactical context than basic MILWA.
    const lightRad = state.dumapicTurns > 0 ? 5 : (state.lightPower === "lomilwa" ? 5 : (state.lightTurns > 0 ? 3 : 0));
    const fragmentCells = new Set(state.dungeonMemory?.mapFragments?.[state.floor] || []);

      for (let y = 0; y < state.map.length; y++) {
        for (let x = 0; x < state.map[y].length; x++) {
          const isVisited = Boolean(state.visitedMap?.[y]?.[x]);
        const isFragmentRevealed = fragmentCells.has(`${x},${y}`);
        const dist = Math.abs(x - state.x) + Math.abs(y - state.y);
        const isLightRevealed = (lightRad > 0 && dist <= lightRad);

        // Render explored cells and temporary or contract-supplied map information.
        if (!isVisited && !isLightRevealed && !isFragmentRevealed) continue;

        const cell = state.map[y][x];
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
    
    // Draw background glow circle for player location (amber/cyan depending on dumapic)
    ctx.fillStyle = isDumapic ? "rgba(255, 215, 0, 0.3)" : "rgba(0, 229, 255, 0.25)";
    ctx.beginPath();
    ctx.arc(px, py, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = isDumapic ? "#ffd700" : "#00e5ff"; 
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.shadowBlur = isDumapic ? 8 : 6;
    ctx.shadowColor = isDumapic ? "#ffd700" : "#00e5ff";
    
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
