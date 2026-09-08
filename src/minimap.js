import { DX, DY, EVENT_TYPES } from "./data.js";
import { getRendererInput, isRendererInput } from "./state/renderer_view.js";
import { isRenderableCorridorCell } from "./rules/renderer_topology.js";

export const MINIMAP_CANVAS_SIZE = Object.freeze({ width: 400, height: 260 });

const CELL_SIZE = 10;
const PANEL_MARGIN = 8;
const PANEL_SIZE = 128;

function resolveRenderInput(input) {
  if (isRendererInput(input)) return input;
  const current = getRendererInput();
  return input && typeof input === "object"
    ? Object.freeze({ ...current, sceneVisibility: input })
    : current;
}

export function isMiniMapVisible(input = null) {
  const renderInput = resolveRenderInput(input);
  const { showTownBackground, showCombat, showChest, showEventScene, showItemMenu } = renderInput.sceneVisibility;
  return Boolean(
    renderInput.view.hasMap &&
    Array.isArray(renderInput.map) &&
    renderInput.map.length > 0 &&
    !showTownBackground &&
    !showCombat &&
    !showChest &&
    !showEventScene &&
    !showItemMenu
  );
}

export function isMiniMapAnimating(input = null) {
  const renderInput = resolveRenderInput(input);
  if (!isMiniMapVisible(renderInput)) return false;

  const map = renderInput.map;
  const minY = Math.max(0, renderInput.y - 4);
  const maxY = Math.min(map.length - 1, renderInput.y + 4);
  for (let y = minY; y <= maxY; y += 1) {
    const row = map[y];
    if (!Array.isArray(row)) continue;
    const minX = Math.max(0, renderInput.x - 4);
    const maxX = Math.min(row.length - 1, renderInput.x + 4);
    for (let x = minX; x <= maxX; x += 1) {
      if (Math.abs(x - renderInput.x) + Math.abs(y - renderInput.y) > 4) continue;
      const event = row[x]?.event;
      if (event === EVENT_TYPES.BOSS || event === EVENT_TYPES.MIDBOSS) return true;
    }
  }

  return Boolean(renderInput.roamingMonsters.some((monster) => {
    if (monster.floor !== renderInput.floor) return false;
    if (monster.perception === "afterimage" && !renderInput.hasArcaneSense) return false;
    const distance = Math.abs(monster.x - renderInput.x) + Math.abs(monster.y - renderInput.y);
    return monster.kind === "elite" || distance <= 4;
  }));
}

function drawOneWayMiniMapMarkers(ctx, screenX, screenY, cellS, cell, isLightOnly) {
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

export function drawStairMiniMapIcon(ctx, screenX, screenY, cellS, isUp, color) {
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

/** Draw the shared exploration presentation onto any 2D canvas context. */
export function drawMiniMap(ctx, input = null, options = {}) {
  const renderInput = resolveRenderInput(input);
  const map = renderInput.map;
  if (!Array.isArray(map) || map.length === 0) return;
  for (let y = 0; y < map.length; y += 1) {
    if (!Object.hasOwn(map, y) || !Array.isArray(map[y])) return;
  }

  ctx.fillStyle = "rgba(12, 12, 14, 0.9)";
  ctx.strokeStyle = "rgba(0, 229, 255, 0.5)";
  ctx.lineWidth = 2;
  ctx.fillRect(PANEL_MARGIN - 2, PANEL_MARGIN - 2, PANEL_SIZE + 4, PANEL_SIZE + 4);
  ctx.strokeRect(PANEL_MARGIN - 2, PANEL_MARGIN - 2, PANEL_SIZE + 4, PANEL_SIZE + 4);

  ctx.save();
  ctx.beginPath();
  ctx.rect(PANEL_MARGIN, PANEL_MARGIN, PANEL_SIZE, PANEL_SIZE);
  ctx.clip();

  const desiredOffsetX = (PANEL_SIZE / 2) - (renderInput.x * CELL_SIZE + CELL_SIZE / 2);
  const desiredOffsetY = (PANEL_SIZE / 2) - (renderInput.y * CELL_SIZE + CELL_SIZE / 2);
  const mapWidth = Math.max(...map.map((row) => row.length));
  const mapHeight = map.length;
  const mapPixelW = mapWidth * CELL_SIZE;
  const mapPixelH = mapHeight * CELL_SIZE;
  const minOffsetX = PANEL_SIZE - mapPixelW;
  const minOffsetY = PANEL_SIZE - mapPixelH;
  const offsetX = Math.max(minOffsetX, Math.min(0, desiredOffsetX));
  const offsetY = Math.max(minOffsetY, Math.min(0, desiredOffsetY));
  const lightRad = renderInput.lightPower === "lomilwa" ? 5 : (renderInput.lightTurns > 0 ? 3 : 0);
  const fragmentCells = new Set(renderInput.mapFragments);

  for (let y = 0; y < map.length; y += 1) {
    for (let x = 0; x < map[y].length; x += 1) {
      const isVisited = Boolean(renderInput.visitedMap?.[y]?.[x]);
      const isFragmentRevealed = fragmentCells.has(`${x},${y}`);
      const dist = Math.abs(x - renderInput.x) + Math.abs(y - renderInput.y);
      const isLightRevealed = lightRad > 0 && dist <= lightRad;
      const cell = map[y][x];
      const hasDiscoveredTrap = cell.trap && cell.trap.state !== "hidden";
      if (!isVisited && !isLightRevealed && !isFragmentRevealed && !hasDiscoveredTrap) continue;
      if (!isRenderableCorridorCell(cell)) continue;

      const screenX = PANEL_MARGIN + x * CELL_SIZE + offsetX;
      const screenY = PANEL_MARGIN + y * CELL_SIZE + offsetY;
      const isLightOnly = !isVisited && isLightRevealed;
      const isFragmentOnly = !isVisited && !isLightRevealed && isFragmentRevealed;

      if (isFragmentOnly) {
        ctx.fillStyle = "rgba(255, 179, 0, 0.04)";
        ctx.fillRect(screenX, screenY, CELL_SIZE, CELL_SIZE);
        ctx.strokeStyle = "rgba(255, 179, 0, 0.4)";
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
      } else if (isLightOnly) {
        ctx.fillStyle = "rgba(0, 229, 255, 0.04)";
        ctx.fillRect(screenX, screenY, CELL_SIZE, CELL_SIZE);
        ctx.strokeStyle = "rgba(0, 229, 255, 0.35)";
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
      } else {
        ctx.fillStyle = "rgba(0, 255, 102, 0.08)";
        ctx.fillRect(screenX, screenY, CELL_SIZE, CELL_SIZE);
        ctx.strokeStyle = "#00ff66";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      if (cell.walls[0]) { ctx.moveTo(screenX, screenY); ctx.lineTo(screenX + CELL_SIZE, screenY); }
      if (cell.walls[1]) { ctx.moveTo(screenX + CELL_SIZE, screenY); ctx.lineTo(screenX + CELL_SIZE, screenY + CELL_SIZE); }
      if (cell.walls[2]) { ctx.moveTo(screenX, screenY + CELL_SIZE); ctx.lineTo(screenX + CELL_SIZE, screenY + CELL_SIZE); }
      if (cell.walls[3]) { ctx.moveTo(screenX, screenY); ctx.lineTo(screenX, screenY + CELL_SIZE); }
      ctx.stroke();
      ctx.setLineDash([]);
      drawOneWayMiniMapMarkers(ctx, screenX, screenY, CELL_SIZE, cell, isLightOnly);

      if (cell.type === "stairs-down") {
        const fill = "255, 179, 0";
        const stroke = "#ffb300";
        ctx.fillStyle = isLightOnly ? `rgba(${fill}, 0.2)` : `rgba(${fill}, 0.5)`;
        ctx.fillRect(screenX + 1, screenY + 1, CELL_SIZE - 2, CELL_SIZE - 2);
        ctx.strokeStyle = isLightOnly ? `rgba(${fill}, 0.4)` : stroke;
        ctx.lineWidth = 1;
        ctx.strokeRect(screenX + 1, screenY + 1, CELL_SIZE - 2, CELL_SIZE - 2);
        (options.drawStairMiniMapIcon || drawStairMiniMapIcon)(ctx, screenX, screenY, CELL_SIZE, false, stroke);
      }

      if (cell.trap && cell.trap.state !== "hidden") {
        const isDisabled = cell.trap.state === "disabled";
        const markerColor = isDisabled ? "#2fd66d" : "#ff3b30";
        const markerBg = isDisabled ? "rgba(47, 214, 109, 0.22)" : "rgba(255, 59, 48, 0.24)";
        ctx.fillStyle = markerBg;
        ctx.beginPath();
        ctx.arc(screenX + CELL_SIZE / 2, screenY + CELL_SIZE / 2, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = markerColor;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.fillStyle = markerColor;
        ctx.font = "bold 9px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(isDisabled ? "x" : "!", screenX + CELL_SIZE / 2, screenY + CELL_SIZE / 2);
      }
    }
  }

  for (let y = 0; y < map.length; y += 1) {
    if (!map[y]) continue;
    for (let x = 0; x < map[y].length; x += 1) {
      if (!map[y][x]) continue;
      const cell = map[y][x];
      const dist = Math.abs(x - renderInput.x) + Math.abs(y - renderInput.y);
      if (dist > 4) continue;
      const hasStairs = cell.type === "stairs-down";
      const hasEvent = [EVENT_TYPES.SPRING, EVENT_TYPES.CAMP, EVENT_TYPES.TABLET, EVENT_TYPES.MERCHANT,
        EVENT_TYPES.RETURN_PORTAL, EVENT_TYPES.MIDBOSS, EVENT_TYPES.BOSS].includes(cell.event);
      if (!hasStairs && !hasEvent) continue;
      const screenX = PANEL_MARGIN + x * CELL_SIZE + offsetX;
      const screenY = PANEL_MARGIN + y * CELL_SIZE + offsetY;
      ctx.save();
      if (hasStairs) {
        ctx.fillStyle = "rgba(255, 179, 0, 0.12)";
        ctx.beginPath();
        ctx.arc(screenX + CELL_SIZE / 2, screenY + CELL_SIZE / 2, CELL_SIZE * 0.9, 0, Math.PI * 2);
        ctx.fill();
      } else if (cell.event === EVENT_TYPES.BOSS || cell.event === EVENT_TYPES.MIDBOSS) {
        const pulse = 0.14 + 0.08 * Math.sin(Date.now() / 200);
        ctx.fillStyle = `rgba(255, 59, 48, ${pulse})`;
        ctx.beginPath();
        ctx.arc(screenX + CELL_SIZE / 2, screenY + CELL_SIZE / 2, CELL_SIZE * 1.3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = "rgba(191, 90, 242, 0.14)";
        ctx.beginPath();
        ctx.arc(screenX + CELL_SIZE / 2, screenY + CELL_SIZE / 2, CELL_SIZE * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  renderInput.roamingMonsters.forEach((roamingMonster) => {
    if (roamingMonster.floor !== renderInput.floor) return;
    if (roamingMonster.perception === "afterimage" && !renderInput.hasArcaneSense) return;
    const dist = Math.abs(roamingMonster.x - renderInput.x) + Math.abs(roamingMonster.y - renderInput.y);
    if (roamingMonster.kind !== "elite" && dist > 4) return;
    const rx = PANEL_MARGIN + roamingMonster.x * CELL_SIZE + CELL_SIZE / 2 + offsetX;
    const ry = PANEL_MARGIN + roamingMonster.y * CELL_SIZE + CELL_SIZE / 2 + offsetY;
    const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 150);
    ctx.save();
    const perceptionColors = { sound: "255, 179, 0", blind_charge: "255, 92, 92", vibration: "89, 214, 138", standard: "255, 59, 48", afterimage: "190, 120, 255" };
    const color = perceptionColors[roamingMonster.perception] || (roamingMonster.kind === "elite" ? "255, 179, 0" : "255, 59, 48");
    ctx.fillStyle = `rgba(${color}, ${pulse})`;
    ctx.shadowBlur = 6;
    ctx.shadowColor = roamingMonster.kind === "elite" ? "#ffb300" : "#ff3b30";
    ctx.beginPath();
    ctx.arc(rx, ry, roamingMonster.kind === "elite" ? 4.5 : 3.5, 0, Math.PI * 2);
    ctx.fill();
    if (roamingMonster.kind === "elite") {
      ctx.strokeStyle = "#ff3b30";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.restore();
  });

  const playerX = PANEL_MARGIN + renderInput.x * CELL_SIZE + CELL_SIZE / 2 + offsetX;
  const playerY = PANEL_MARGIN + renderInput.y * CELL_SIZE + CELL_SIZE / 2 + offsetY;
  ctx.fillStyle = "rgba(0, 229, 255, 0.25)";
  ctx.beginPath();
  ctx.arc(playerX, playerY, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#00e5ff";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  ctx.shadowBlur = 6;
  ctx.shadowColor = "#00e5ff";
  ctx.save();
  ctx.translate(playerX, playerY);
  ctx.rotate((renderInput.dir * Math.PI) / 2);
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

/** Update the renderer-independent DOM overlay and clear it for hidden scenes. */
export function renderMiniMapOverlay(input = null) {
  const canvas = document.getElementById("dungeon-minimap-overlay");
  if (!canvas || typeof canvas.getContext !== "function") return;
  if (canvas.width !== MINIMAP_CANVAS_SIZE.width) canvas.width = MINIMAP_CANVAS_SIZE.width;
  if (canvas.height !== MINIMAP_CANVAS_SIZE.height) canvas.height = MINIMAP_CANVAS_SIZE.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  const visible = isMiniMapVisible(input);
  if (canvas.dataset) canvas.dataset.minimapVisible = visible ? "true" : "false";
  if (visible) drawMiniMap(ctx, input);
}
