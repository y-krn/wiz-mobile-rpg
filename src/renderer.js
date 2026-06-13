import { DX, DY, MAP_WIDTH, MAP_HEIGHT } from "./data.js";
import { state } from "./state.js";

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

    if (state.gameState === "town") {
      this.drawTownBackground(ctx);
    } else {
      // Exploration or Combat or Chest
      this.draw3DCorridors(ctx);
      
      // Draw Monster if in Combat
      if (state.gameState === "combat" && state.combatState) {
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

    // Draw from back (z=3) to front (z=0)
    for (let z = 3; z >= 0; z--) {
      const cx = px + DX[dir] * z;
      const cy = py + DY[dir] * z;

      // Check out of bounds
      if (cx < 0 || cx >= MAP_WIDTH || cy < 0 || cy >= MAP_HEIGHT) {
        // Render a solid wall block at depth z
        this.renderSolidWall(ctx, z, "#ff3b30"); // Red glow for out of bounds
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

      // 1. Draw floor/ceiling segments
      ctx.strokeStyle = "rgba(0, 255, 102, 0.2)"; // Dim green grid
      
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

        ctx.strokeStyle = "#00ff66"; // Neon Green
        ctx.stroke();

        // Draw door details if left cell is a door
        if (cell.type === "door" && z === 1) {
          this.drawSideDoorPattern(ctx, z, true);
        }
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

        ctx.strokeStyle = "#00ff66";
        ctx.stroke();

        if (cell.type === "door" && z === 1) {
          this.drawSideDoorPattern(ctx, z, false);
        }
      }

      // 4. Front Wall (at z + 1 depth)
      if (hasFrontWall) {
        ctx.fillStyle = "#0c0c0e";
        ctx.fillRect(XL[z + 1], YT[z + 1], XR[z + 1] - XL[z + 1], YB[z + 1] - YT[z + 1]);

        ctx.strokeStyle = "#00ff66";
        ctx.strokeRect(XL[z + 1], YT[z + 1], XR[z + 1] - XL[z + 1], YB[z + 1] - YT[z + 1]);

        // Draw Door or Special Event in front
        const nextX = cx + DX[dir];
        const nextY = cy + DY[dir];
        const nextCell = (nextX >= 0 && nextX < MAP_WIDTH && nextY >= 0 && nextY < MAP_HEIGHT) ? state.map[nextY][nextX] : null;

        if (nextCell && nextCell.type === "door") {
          this.drawFrontDoorPattern(ctx, z + 1);
        }
      }

      // Check special symbols inside cells (stairs up, etc.)
      if (cell.type === "stairs-up") {
        this.drawStairsIcon(ctx, z);
      }
    }
  }

  renderSolidWall(ctx, z, color) {
    ctx.fillStyle = "#0c0c0e";
    ctx.fillRect(XL[z], YT[z], XR[z] - XL[z], YB[z] - YB[z]);
    ctx.strokeStyle = color;
    ctx.strokeRect(XL[z], YT[z], XR[z] - XL[z], YB[z] - YT[z]);
  }

  drawFrontDoorPattern(ctx, z) {
    const xl = XL[z];
    const xr = XR[z];
    const yt = YT[z];
    const yb = YB[z];

    const w = xr - xl;
    const h = yb - yt;

    // Draw door frame
    ctx.strokeStyle = "#00e5ff"; // Cyan for doors
    const fx = xl + w * 0.15;
    const fy = yt + h * 0.1;
    const fw = w * 0.7;
    const fh = h * 0.9;
    ctx.strokeRect(fx, fy, fw, fh);

    // Diagonal planks / door lines
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx + fw, fy + fh);
    ctx.moveTo(fx + fw, fy);
    ctx.lineTo(fx, fy + fh);
    // Door knob
    ctx.arc(fx + fw * 0.8, fy + fh * 0.5, 3, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawSideDoorPattern(ctx, z, isLeft) {
    // Draw simple vertical line representation of door on diagonal wall
    ctx.strokeStyle = "#00e5ff";
    ctx.beginPath();
    if (isLeft) {
      const xStart = XL[z] + (XL[z + 1] - XL[z]) * 0.3;
      const yTop = YT[z] + (YT[z + 1] - YT[z]) * 0.3;
      const yBottom = YB[z] + (YB[z + 1] - YB[z]) * 0.3;
      
      const xEnd = XL[z] + (XL[z + 1] - XL[z]) * 0.7;
      const yTopEnd = YT[z] + (YT[z + 1] - YT[z]) * 0.7;
      const yBottomEnd = YB[z] + (YB[z + 1] - YB[z]) * 0.7;

      ctx.moveTo(xStart, yTop);
      ctx.lineTo(xStart, yBottom);
      ctx.lineTo(xEnd, yBottomEnd);
      ctx.lineTo(xEnd, yTopEnd);
      ctx.closePath();
      // Draw door split
      ctx.moveTo((xStart + xEnd) / 2, (yTop + yTopEnd) / 2);
      ctx.lineTo((xStart + xEnd) / 2, (yBottom + yBottomEnd) / 2);
    } else {
      const xStart = XR[z] - (XR[z] - XR[z + 1]) * 0.3;
      const yTop = YT[z] + (YT[z + 1] - YT[z]) * 0.3;
      const yBottom = YB[z] + (YB[z + 1] - YB[z]) * 0.3;
      
      const xEnd = XR[z] - (XR[z] - XR[z + 1]) * 0.7;
      const yTopEnd = YT[z] + (YT[z + 1] - YT[z]) * 0.7;
      const yBottomEnd = YB[z] + (YB[z + 1] - YB[z]) * 0.7;

      ctx.moveTo(xStart, yTop);
      ctx.lineTo(xStart, yBottom);
      ctx.lineTo(xEnd, yBottomEnd);
      ctx.lineTo(xEnd, yTopEnd);
      ctx.closePath();
      // Draw door split
      ctx.moveTo((xStart + xEnd) / 2, (yTop + yTopEnd) / 2);
      ctx.lineTo((xStart + xEnd) / 2, (yBottom + yBottomEnd) / 2);
    }
    ctx.stroke();
  }

  drawStairsIcon(ctx, z) {
    // Draw an upward stair silhouette in the middle of depth z cell floor
    const xl = XL[z];
    const xr = XR[z];
    const yb = YB[z];
    
    const w = xr - xl;
    const stepW = w * 0.4;
    const startX = xl + w * 0.3;

    ctx.strokeStyle = "#ffb300"; // Gold color for stairs
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

    // Different wireframe drawing based on monster name
    const mName = monster.name;
    if (mName.includes("Biter")) {
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
    } else if (mName.includes("Kobold")) {
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
    } else if (mName.includes("Zombie")) {
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
    } else if (mName.includes("Skeleton")) {
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
    } else if (mName.includes("Orc")) {
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
    } else if (mName.includes("Mage")) {
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
    } else if (mName.includes("Dragon")) {
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
    const cellS = 8; // Adjust cell size to 8px to fit 16x16 grid nicely
    const margin = 8;
    const mapSize = MAP_WIDTH * cellS;
    
    // Draw background panel
    ctx.fillStyle = "rgba(12, 12, 14, 0.9)";
    ctx.strokeStyle = "rgba(0, 229, 255, 0.5)";
    ctx.lineWidth = 2;
    ctx.fillRect(margin - 2, margin - 2, mapSize + 4, mapSize + 4);
    ctx.strokeRect(margin - 2, margin - 2, mapSize + 4, mapSize + 4);

    // Check light spell radius
    // If no light spell active, light radius is 0 (only show visited cells)
    const lightRad = state.lightTurns > 0 ? 3 : 0;

    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const isVisited = state.visitedMap[y][x];
        const dist = Math.abs(x - state.x) + Math.abs(y - state.y);
        const isLightRevealed = (lightRad > 0 && dist <= lightRad);

        // Render if visited OR revealed by active light spell
        if (!isVisited && !isLightRevealed) continue;

        const cell = state.map[y][x];
        const screenX = margin + x * cellS;
        const screenY = margin + y * cellS;

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

        // Special cell colors
        if (cell.type === "stairs-up") {
          ctx.fillStyle = isLightOnly ? "rgba(255, 179, 0, 0.2)" : "rgba(255, 179, 0, 0.5)";
          ctx.fillRect(screenX + 1, screenY + 1, cellS - 2, cellS - 2);
          ctx.strokeStyle = isLightOnly ? "rgba(255, 179, 0, 0.4)" : "#ffb300";
          ctx.lineWidth = 1;
          ctx.strokeRect(screenX + 1, screenY + 1, cellS - 2, cellS - 2);
        } else if (cell.type === "door") {
          ctx.fillStyle = isLightOnly ? "rgba(0, 229, 255, 0.15)" : "rgba(0, 229, 255, 0.35)";
          ctx.fillRect(screenX + 1, screenY + 1, cellS - 2, cellS - 2);
          ctx.strokeStyle = isLightOnly ? "rgba(0, 229, 255, 0.3)" : "#00e5ff";
          ctx.lineWidth = 1;
          ctx.strokeRect(screenX + 1, screenY + 1, cellS - 2, cellS - 2);
        }
      }
    }

    // Draw player arrow (larger, glowing gold)
    const px = margin + state.x * cellS + cellS / 2;
    const py = margin + state.y * cellS + cellS / 2;
    
    // Draw small background glow circle for player location
    ctx.fillStyle = "rgba(255, 179, 0, 0.2)";
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffb300"; 
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.shadowBlur = 6;
    ctx.shadowColor = "#ffb300";
    
    ctx.save();
    ctx.translate(px, py);
    // Rotate to match direction: 0=N, 1=E, 2=S, 3=W
    ctx.rotate((state.dir * Math.PI) / 2);
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(-4, 4);
    ctx.lineTo(4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.shadowBlur = 0;
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
