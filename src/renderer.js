import { DX, DY, MAP_WIDTH, MAP_HEIGHT, EVENT_TYPES } from "./data.js";
import { state } from "./state.js";
import { menuContext } from "./navigation.js";

export let dungeonRenderer = null;
export function setDungeonRenderer(r) {
  dungeonRenderer = r;
}

// Canvas dimensions
const VIEW_W = 400;
const VIEW_H = 260;

// Depth planes for 3D projection
const XL = [0, 80, 128, 157, 174];
const XR = [400, 320, 272, 243, 226];
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

  draw() {
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

    if (state.gameState === "town" || (state.gameState === "submenu" && (menuContext.prevGameState === "town" || menuContext.type.startsWith("shop") || menuContext.type.startsWith("temple") || menuContext.type === "party_assemble"))) {
      this.drawTownBackground(ctx);
    } else {
      // Exploration or Combat or Chest
      this.draw3DCorridors(ctx);
      
      // Draw Monster if in Combat
      if (state.combatState && (state.gameState === "combat" || (state.gameState === "submenu" && !state.chestState))) {
        this.drawMonsters(ctx);
      }

      // Draw Chest if looting
      if (state.gameState === "chest" || (state.gameState === "submenu" && state.chestState)) {
        this.drawChest(ctx);
      }

      // Draw Mini-map overlay
      this.drawMiniMap(ctx);
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
      wallColor = "#cc8800"; // Dragon Gold
      gridColor = "rgba(204, 136, 0, 0.2)";
    }

    // Draw from back (z=3) to front (z=0)
    for (let z = 3; z >= 0; z--) {
      const cx = px + DX[dir] * z;
      const cy = py + DY[dir] * z;

      // Check out of bounds
      if (cx < 0 || cx >= MAP_WIDTH || cy < 0 || cy >= MAP_HEIGHT) {
        // Render a solid wall block at depth z
        this.renderSolidWall(ctx, z, outOfBoundsColor); // Red glow for out of bounds
        continue;
      }

      const cell = state.map[cy][cx];

      // Relative directions based on player orientation
      const dirLeft = (dir + 3) % 4;
      const dirRight = (dir + 1) % 4;
      const dirFront = dir;

      const hasLeftWall = cell.walls[dirLeft];
      const hasRightWall = cell.walls[dirRight];
      const hasFrontWall = cell.walls[dirFront];
      const frontX = cx + DX[dirFront];
      const frontY = cy + DY[dirFront];
      const frontEnterFace = (dirFront + 2) % 4;
      const hasFrontOneWayBarrier = !hasFrontWall && Boolean(state.map[frontY]?.[frontX]?.blockEnter?.[frontEnterFace]);

      // 1. Draw floor/ceiling segments
      ctx.strokeStyle = gridColor;
      
      // Floor lines
      ctx.beginPath();
      ctx.moveTo(XL[z], YB[z]);
      ctx.lineTo(XL[z + 1], YB[z + 1]);
      ctx.moveTo(XR[z], YB[z]);
      ctx.lineTo(XR[z + 1], YB[z + 1]);
      // Ceiling lines
      ctx.moveTo(XL[z], YT[z]);
      ctx.lineTo(XL[z + 1], YT[z + 1]);
      ctx.moveTo(XR[z], YT[z]);
      ctx.lineTo(XR[z + 1], YT[z + 1]);
      ctx.stroke();

      // Horizontal grid lines
      ctx.beginPath();
      ctx.moveTo(XL[z + 1], YB[z + 1]);
      ctx.lineTo(XR[z + 1], YB[z + 1]);
      ctx.moveTo(XL[z + 1], YT[z + 1]);
      ctx.lineTo(XR[z + 1], YT[z + 1]);
      ctx.stroke();

      // 2. Left Wall
      if (hasLeftWall) {
        ctx.fillStyle = "#0c0c0e";
        ctx.beginPath();
        ctx.moveTo(XL[z], YT[z]);
        ctx.lineTo(XL[z + 1], YT[z + 1]);
        ctx.lineTo(XL[z + 1], YB[z + 1]);
        ctx.lineTo(XL[z], YB[z]);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = wallColor;
        ctx.stroke();
      }

      // 3. Right Wall
      if (hasRightWall) {
        ctx.fillStyle = "#0c0c0e";
        ctx.beginPath();
        ctx.moveTo(XR[z], YT[z]);
        ctx.lineTo(XR[z + 1], YT[z + 1]);
        ctx.lineTo(XR[z + 1], YB[z + 1]);
        ctx.lineTo(XR[z], YB[z]);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = wallColor;
        ctx.stroke();
      }

      // 4. Front Wall (at z + 1 depth)
      if (hasFrontWall) {
        ctx.fillStyle = "#0c0c0e";
        ctx.fillRect(XL[z + 1], YT[z + 1], XR[z + 1] - XL[z + 1], YB[z + 1] - YT[z + 1]);

        ctx.strokeStyle = wallColor;
        ctx.strokeRect(XL[z + 1], YT[z + 1], XR[z + 1] - XL[z + 1], YB[z + 1] - YT[z + 1]);
      } else if (hasFrontOneWayBarrier) {
        this.drawOneWayBarrier(ctx, z, wallColor);
      }

      // Check special symbols inside cells (stairs up / down)
      if (cell.type === "stairs-up" || cell.type === "stairs-down") {
        this.drawStairsIcon(ctx, z, cell.type);
      }

      // Check if there is a roaming monster at this coordinate (cx, cy)
      if (state.roamingMonsters) {
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
          ctx.fillRect(XL[z], YT[z], XR[z] - XL[z], YB[z] - YT[z]);
        } else if (state.floor === 3) {
          // B3F Mana residue: cumulative magenta overlay
          ctx.fillStyle = "rgba(120, 0, 180, 0.04)";
          ctx.fillRect(XL[z], YT[z], XR[z] - XL[z], YB[z] - YT[z]);
        } else if (state.floor === 5) {
          // B5F Heatwave shimmer: cumulative dark red-orange overlay with slight temporal pulse
          const heatPulse = 0.06 + 0.02 * Math.sin(Date.now() / 250);
          ctx.fillStyle = `rgba(100, 20, 0, ${heatPulse})`;
          ctx.fillRect(XL[z], YT[z], XR[z] - XL[z], YB[z] - YT[z]);
        }
      }
    }
  }

  renderSolidWall(ctx, z, color) {
    ctx.fillStyle = "#0c0c0e";
    ctx.fillRect(XL[z], YT[z], XR[z] - XL[z], YB[z] - YT[z]);
    ctx.strokeStyle = color;
    ctx.strokeRect(XL[z], YT[z], XR[z] - XL[z], YB[z] - YT[z]);
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
    
    ctx.strokeStyle = "#ffb300"; // Glowing gold chest
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

    // Render the first active monster in detail
    const monster = alive[0];
    
    ctx.save();
    ctx.shadowColor = monster.color || "#ff3b30";
    ctx.shadowBlur = 10;
    ctx.strokeStyle = monster.color || "#ff3b30";
    ctx.lineWidth = 3;

    const cx = VIEW_W / 2;
    const cy = VIEW_H / 2 + 10;

    // Different wireframe drawing based on stable sprite type.
    const spriteType = this.getMonsterSpriteType(monster);
    if (spriteType === "biter") {
      // Biter: floating orb with massive spike-teeth
      ctx.beginPath();
      ctx.arc(cx, cy - 10, 25, 0, Math.PI * 2);
      ctx.stroke();
      
      // Giant mouth
      ctx.beginPath();
      ctx.moveTo(cx - 20, cy - 10);
      ctx.lineTo(cx + 20, cy - 10);
      // Teeth
      ctx.lineTo(cx + 10, cy + 10);
      ctx.lineTo(cx, cy - 10);
      ctx.lineTo(cx - 10, cy + 10);
      ctx.closePath();
      ctx.stroke();
    } else if (spriteType === "kobold") {
      // Kobold: small beast with ears and a weapon
      ctx.beginPath();
      // Head
      ctx.moveTo(cx - 15, cy - 35);
      ctx.lineTo(cx + 15, cy - 35);
      ctx.lineTo(cx + 20, cy - 15);
      ctx.lineTo(cx - 20, cy - 15);
      ctx.closePath();
      // Ears
      ctx.moveTo(cx - 15, cy - 35);
      ctx.lineTo(cx - 25, cy - 50);
      ctx.lineTo(cx - 5, cy - 35);
      ctx.moveTo(cx + 15, cy - 35);
      ctx.lineTo(cx + 25, cy - 50);
      ctx.lineTo(cx + 5, cy - 35);
      // Body
      ctx.moveTo(cx, cy - 15);
      ctx.lineTo(cx, cy + 25);
      // Spear on left
      ctx.moveTo(cx - 30, cy + 30);
      ctx.lineTo(cx - 30, cy - 40);
      ctx.lineTo(cx - 25, cy - 40);
      ctx.lineTo(cx - 30, cy - 50);
      ctx.lineTo(cx - 35, cy - 40);
      ctx.closePath();
      ctx.stroke();
    } else if (spriteType === "zombie") {
      // Zombie: blocky creature with arms out
      ctx.beginPath();
      // Head
      ctx.rect(cx - 15, cy - 45, 30, 20);
      // Torso
      ctx.rect(cx - 20, cy - 25, 40, 40);
      // Left arm horizontal
      ctx.moveTo(cx - 20, cy - 15);
      ctx.lineTo(cx - 45, cy - 15);
      ctx.lineTo(cx - 45, cy - 5);
      // Right arm horizontal
      ctx.moveTo(cx + 20, cy - 15);
      ctx.lineTo(cx + 45, cy - 15);
      ctx.lineTo(cx + 45, cy - 5);
      ctx.stroke();
    } else if (spriteType === "skeleton") {
      // Skeleton: Rib cage, skull, sword
      ctx.beginPath();
      // Skull
      ctx.arc(cx, cy - 35, 12, 0, Math.PI * 2);
      // Spine
      ctx.moveTo(cx, cy - 23);
      ctx.lineTo(cx, cy + 15);
      // Ribs
      ctx.moveTo(cx - 15, cy - 15); ctx.lineTo(cx + 15, cy - 15);
      ctx.moveTo(cx - 18, cy - 5); ctx.lineTo(cx + 18, cy - 5);
      ctx.moveTo(cx - 12, cy + 5); ctx.lineTo(cx + 12, cy + 5);
      // Sword
      ctx.moveTo(cx + 20, cy + 15);
      ctx.lineTo(cx + 40, cy - 30);
      ctx.moveTo(cx + 15, cy + 5); // Guard
      ctx.lineTo(cx + 30, cy + 12);
      ctx.stroke();
    } else if (spriteType === "orc") {
      // Orc: horned brute with axes
      ctx.beginPath();
      // Head
      ctx.rect(cx - 20, cy - 40, 40, 30);
      // Snout
      ctx.rect(cx - 10, cy - 25, 20, 12);
      // Horns
      ctx.moveTo(cx - 20, cy - 40);
      ctx.quadraticCurveTo(cx - 35, cy - 55, cx - 30, cy - 30);
      ctx.moveTo(cx + 20, cy - 40);
      ctx.quadraticCurveTo(cx + 35, cy - 55, cx + 30, cy - 30);
      // Massive body
      ctx.moveTo(cx - 30, cy - 10);
      ctx.lineTo(cx + 30, cy - 10);
      ctx.lineTo(cx + 25, cy + 30);
      ctx.lineTo(cx - 25, cy + 30);
      ctx.closePath();
      ctx.stroke();
    } else if (spriteType === "mage") {
      // Mage: hooded cloak, glowing staff
      ctx.beginPath();
      // Hood triangle
      ctx.moveTo(cx, cy - 45);
      ctx.lineTo(cx - 20, cy - 15);
      ctx.lineTo(cx + 20, cy - 15);
      ctx.closePath();
      // Cloak
      ctx.moveTo(cx - 25, cy - 15);
      ctx.lineTo(cx - 35, cy + 30);
      ctx.lineTo(cx + 35, cy + 30);
      ctx.lineTo(cx + 25, cy - 15);
      ctx.closePath();
      // Staff with glowing circle
      ctx.moveTo(cx - 25, cy + 30);
      ctx.lineTo(cx - 25, cy - 35);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.arc(cx - 25, cy - 40, 7, 0, Math.PI * 2);
      ctx.stroke();
    } else if (spriteType === "spirit") {
      ctx.beginPath();
      ctx.arc(cx, cy - 18, 24, 0, Math.PI * 2);
      ctx.moveTo(cx - 18, cy + 4);
      ctx.quadraticCurveTo(cx - 8, cy + 24, cx, cy + 6);
      ctx.quadraticCurveTo(cx + 8, cy + 24, cx + 18, cy + 4);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx - 8, cy - 20, 3, 0, Math.PI * 2);
      ctx.arc(cx + 8, cy - 20, 3, 0, Math.PI * 2);
      ctx.stroke();
    } else if (spriteType === "wisp") {
      ctx.beginPath();
      ctx.arc(cx, cy - 10, 26, 0, Math.PI * 2);
      ctx.arc(cx, cy - 10, 14, 0, Math.PI * 2);
      ctx.moveTo(cx, cy - 48);
      ctx.quadraticCurveTo(cx + 12, cy - 28, cx, cy - 10);
      ctx.quadraticCurveTo(cx - 12, cy + 8, cx, cy + 28);
      ctx.stroke();
    } else if (spriteType === "spider") {
      ctx.beginPath();
      ctx.ellipse(cx, cy - 10, 28, 18, 0, 0, Math.PI * 2);
      ctx.arc(cx, cy - 35, 12, 0, Math.PI * 2);
      for (let i = 0; i < 4; i++) {
        const y = cy - 22 + i * 8;
        ctx.moveTo(cx - 18, y);
        ctx.lineTo(cx - 50, y - 14 + i * 8);
        ctx.moveTo(cx + 18, y);
        ctx.lineTo(cx + 50, y - 14 + i * 8);
      }
      ctx.stroke();
    } else if (spriteType === "bat") {
      ctx.beginPath();
      ctx.arc(cx, cy - 12, 10, 0, Math.PI * 2);
      ctx.moveTo(cx - 10, cy - 12);
      ctx.lineTo(cx - 55, cy - 38);
      ctx.lineTo(cx - 38, cy - 4);
      ctx.lineTo(cx - 20, cy - 22);
      ctx.moveTo(cx + 10, cy - 12);
      ctx.lineTo(cx + 55, cy - 38);
      ctx.lineTo(cx + 38, cy - 4);
      ctx.lineTo(cx + 20, cy - 22);
      ctx.stroke();
    } else if (spriteType === "rabbit") {
      ctx.beginPath();
      ctx.ellipse(cx, cy, 20, 28, 0, 0, Math.PI * 2);
      ctx.arc(cx, cy - 34, 14, 0, Math.PI * 2);
      ctx.moveTo(cx - 8, cy - 45);
      ctx.lineTo(cx - 18, cy - 78);
      ctx.lineTo(cx - 4, cy - 48);
      ctx.moveTo(cx + 8, cy - 45);
      ctx.lineTo(cx + 18, cy - 78);
      ctx.lineTo(cx + 4, cy - 48);
      ctx.stroke();
    } else if (spriteType === "flack") {
      ctx.beginPath();
      ctx.arc(cx, cy - 12, 36, 0, Math.PI * 2);
      ctx.moveTo(cx - 26, cy - 38);
      ctx.lineTo(cx + 26, cy + 14);
      ctx.moveTo(cx + 26, cy - 38);
      ctx.lineTo(cx - 26, cy + 14);
      ctx.moveTo(cx, cy - 58);
      ctx.lineTo(cx, cy + 32);
      ctx.moveTo(cx - 45, cy - 12);
      ctx.lineTo(cx + 45, cy - 12);
      ctx.stroke();
    } else if (spriteType === "dragon") {
      // Ancient Dragon: massive head, wings, horns
      ctx.beginPath();
      // Dragon snout/jaw
      ctx.moveTo(cx - 40, cy - 10);
      ctx.lineTo(cx - 20, cy - 40);
      ctx.lineTo(cx + 20, cy - 40);
      ctx.lineTo(cx + 40, cy - 10);
      ctx.lineTo(cx + 20, cy + 20);
      ctx.lineTo(cx - 20, cy + 20);
      ctx.closePath();
      
      // Eyes
      ctx.moveTo(cx - 15, cy - 20); ctx.lineTo(cx - 5, cy - 15);
      ctx.moveTo(cx + 15, cy - 20); ctx.lineTo(cx + 5, cy - 15);
      
      // Horns
      ctx.moveTo(cx - 15, cy - 40);
      ctx.lineTo(cx - 35, cy - 70);
      ctx.lineTo(cx - 5, cy - 40);
      ctx.moveTo(cx + 15, cy - 40);
      ctx.lineTo(cx + 35, cy - 70);
      ctx.lineTo(cx + 5, cy - 40);

      // Wings outline in background
      ctx.moveTo(cx - 40, cy - 20);
      ctx.quadraticCurveTo(cx - 90, cy - 50, cx - 80, cy + 10);
      ctx.moveTo(cx + 40, cy - 20);
      ctx.quadraticCurveTo(cx + 90, cy - 50, cx + 80, cy + 10);
      ctx.stroke();
    }

    ctx.restore();

    // Draw Monster Name & HP bar above it
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 13px 'Share Tech Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText(`${monster.name} (Lv.${monster.level})`, cx, cy - 70);

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
      omenText = `⚠️狙撃準備 (後列: ${targetChar ? targetChar.name : "後列"})`;
    }

    if (omenText) {
      ctx.fillStyle = "#ffcc00"; // Gold color for warnings
      ctx.font = "bold 12px 'Share Tech Mono', monospace";
      ctx.fillText(omenText, cx, cy - 88);
    }

    // HP Bar
    const barW = 100;
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

    const mapPixelW = MAP_WIDTH * cellS;
    const mapPixelH = MAP_HEIGHT * cellS;

    const minOffsetX = minimapSize - mapPixelW;
    const minOffsetY = minimapSize - mapPixelH;

    // Clamp offsets to map boundaries to prevent black margins
    const offsetX = Math.max(minOffsetX, Math.min(0, desiredOffsetX));
    const offsetY = Math.max(minOffsetY, Math.min(0, desiredOffsetY));

    // DUMAPIC/LOMILWA reveal wider tactical context than basic MILWA.
    const lightRad = state.dumapicTurns > 0 ? 5 : (state.lightPower === "lomilwa" ? 5 : (state.lightTurns > 0 ? 3 : 0));

    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const isVisited = state.visitedMap[y][x];
        const dist = Math.abs(x - state.x) + Math.abs(y - state.y);
        const isLightRevealed = (lightRad > 0 && dist <= lightRad);

        // Render if visited OR revealed by active light spell
        if (!isVisited && !isLightRevealed) continue;

        const cell = state.map[y][x];
        const screenX = margin + x * cellS + offsetX;
        const screenY = margin + y * cellS + offsetY;

        const isLightOnly = !isVisited && isLightRevealed;

        if (isLightOnly) {
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
        if (cell.type === "stairs-up" || cell.type === "stairs-down") {
          const isUp = cell.type === "stairs-up";
          const fill = isUp ? "0, 183, 255" : "255, 179, 0";
          const stroke = isUp ? "#00b7ff" : "#ffb300";
          ctx.fillStyle = isLightOnly ? `rgba(${fill}, 0.2)` : `rgba(${fill}, 0.5)`;
          ctx.fillRect(screenX + 1, screenY + 1, cellS - 2, cellS - 2);
          ctx.strokeStyle = isLightOnly ? `rgba(${fill}, 0.4)` : stroke;
          ctx.lineWidth = 1;
          ctx.strokeRect(screenX + 1, screenY + 1, cellS - 2, cellS - 2);
          this.drawStairMiniMapIcon(ctx, screenX, screenY, cellS, isUp, stroke);
        }

        if (cell.trap && cell.trap.state !== "hidden") {
          const isDisabled = cell.trap.state === "disabled";
          const isWeakened = cell.trap.state === "weakened";
          const markerColor = isDisabled ? "#2fd66d" : (isWeakened ? "#ffb300" : "#ff3b30");
          const markerBg = isDisabled ? "rgba(47, 214, 109, 0.22)" : (isWeakened ? "rgba(255, 179, 0, 0.24)" : "rgba(255, 59, 48, 0.24)");

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
    for (let y = 0; y < MAP_HEIGHT; y++) {
      if (!state.map[y]) continue;
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (!state.map[y][x]) continue;
        const cell = state.map[y][x];
        const dist = Math.abs(x - state.x) + Math.abs(y - state.y);
        
        // Aura range is within 4 steps
        if (dist > 4) continue;

        const hasStairs = cell.type === "stairs-up" || cell.type === "stairs-down";
        const hasEvent = cell.event === EVENT_TYPES.CHEST || 
                          cell.event === EVENT_TYPES.SPRING || 
                          cell.event === EVENT_TYPES.TABLET || 
                          cell.event === EVENT_TYPES.MERCHANT || 
                          cell.event === EVENT_TYPES.MIDBOSS || 
                          cell.event === EVENT_TYPES.BOSS;

        if (!hasStairs && !hasEvent) continue;

        const screenX = margin + x * cellS + offsetX;
        const screenY = margin + y * cellS + offsetY;

        ctx.save();
        if (hasStairs) {
          const isUp = cell.type === "stairs-up";
          ctx.fillStyle = isUp ? "rgba(0, 183, 255, 0.12)" : "rgba(255, 179, 0, 0.12)";
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
        } else if (cell.event === EVENT_TYPES.CHEST) {
          // Yellow glow for chest
          ctx.fillStyle = "rgba(255, 235, 59, 0.14)";
          ctx.beginPath();
          ctx.arc(screenX + cellS / 2, screenY + cellS / 2, cellS * 0.9, 0, Math.PI * 2);
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
        const dist = Math.abs(rm.x - state.x) + Math.abs(rm.y - state.y);
        if (dist <= 4) {
          const rx = margin + rm.x * cellS + cellS / 2 + offsetX;
          const ry = margin + rm.y * cellS + cellS / 2 + offsetY;
          
          // Flashing red dot
          const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 150);
          ctx.save();
          ctx.fillStyle = `rgba(255, 59, 48, ${pulse})`;
          ctx.shadowBlur = 6;
          ctx.shadowColor = "#ff3b30";
          ctx.beginPath();
          ctx.arc(rx, ry, 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      });
    }

    // Draw player arrow
    const px = margin + state.x * cellS + cellS / 2 + offsetX;
    const py = margin + state.y * cellS + cellS / 2 + offsetY;
    
    // Draw background glow circle for player location (gold/cyan depending on dumapic)
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
