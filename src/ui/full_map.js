import { EVENT_TYPES } from "../data.js";
import { getRendererInput, isRendererInput } from "../state/renderer_view.js";
import { isRenderableCorridorCell } from "../rules/renderer_topology.js";
import { drawStairMiniMapIcon } from "../minimap.js";
import { getTraversalMarkerKind } from "../rules/traversal_gimmicks.js";

// Full-floor map (#1833). It draws the same cells the minimap may draw
// (visited, lit, fragment-revealed, or discovered-trap cells), at a larger
// scale and without the minimap's player-centred window.

/** Minimap sense radius for facilities, bosses, and ordinary roaming monsters. */
export const FULL_MAP_SENSE_RADIUS = 4;

const SENSED_EVENTS = new Set([
  EVENT_TYPES.CAMP,
  EVENT_TYPES.MERCHANT,
  EVENT_TYPES.RETURN_PORTAL,
  EVENT_TYPES.MIDBOSS,
  EVENT_TYPES.BOSS
]);

const EVENT_MARKERS = Object.freeze({
  [EVENT_TYPES.CHEST]: "chest",
  [EVENT_TYPES.SPRING]: "spring",
  [EVENT_TYPES.CAMP]: "camp",
  [EVENT_TYPES.MERCHANT]: "merchant",
  [EVENT_TYPES.RETURN_PORTAL]: "portal",
  [EVENT_TYPES.MIDBOSS]: "boss",
  [EVENT_TYPES.BOSS]: "boss"
});

const GLYPH_MARKERS = Object.freeze({
  spring: { glyph: "泉", color: "#3d9be9" },
  camp: { glyph: "野", color: "#2f9e62" },
  merchant: { glyph: "商", color: "#7c5cd6" },
  portal: { glyph: "門", color: "#1f8fa0" },
  boss: { glyph: "主", color: "#d9483b" },
  rubble: { glyph: "岩", color: "#9a6a32" },
  seal: { glyph: "封", color: "#b8860b" },
  lever: { glyph: "仕", color: "#c7771a" },
  "lever-pulled": { glyph: "仕", color: "#8f8a80" }
});

/** Legend rows in display order; `kind` matches the markers drawn on the canvas. */
export const FULL_MAP_LEGEND = Object.freeze([
  { kind: "player", label: "現在地" },
  { kind: "visited", label: "既踏" },
  { kind: "unvisited", label: "未踏（地図片）" },
  { kind: "unvisited-light", label: "未踏（照明）" },
  { kind: "stairs-down", label: "下り階段" },
  { kind: "stairs-up", label: "上り階段" },
  { kind: "trap", label: "罠（発見）" },
  { kind: "trap-disabled", label: "罠（解除）" },
  { kind: "chest", label: "宝箱" },
  { kind: "spring", label: "泉" },
  { kind: "camp", label: "野営地" },
  { kind: "merchant", label: "商人" },
  { kind: "portal", label: "帰還の門" },
  { kind: "boss", label: "守護者" },
  // Biome gimmicks (#1963) only take legend space on floors that show them.
  { kind: "rubble", label: "落盤", optional: true },
  { kind: "seal", label: "封印扉", optional: true },
  { kind: "lever", label: "床の仕掛け", optional: true },
  { kind: "lever-pulled", label: "仕掛け（作動済み）", optional: true },
  { kind: "elite", label: "強敵" },
  { kind: "monster", label: "徘徊する敵" }
]);

function resolveRenderInput(input) {
  return isRendererInput(input) ? input : getRendererInput();
}

function isValidMap(map) {
  if (!Array.isArray(map) || map.length === 0) return false;
  for (let y = 0; y < map.length; y += 1) {
    if (!Object.hasOwn(map, y) || !Array.isArray(map[y])) return false;
  }
  return true;
}

/**
 * Classify every cell the full map may show. Returns null for an unusable map.
 * `cells` holds only revealed corridor cells; `markers` lists icon positions.
 */
export function getFullMapModel(input = null) {
  const renderInput = resolveRenderInput(input);
  const map = renderInput.map;
  if (!isValidMap(map)) return null;

  const width = Math.max(...map.map((row) => row.length));
  const height = map.length;
  const lightRad = renderInput.lightPower === "lomilwa" ? 5 : (renderInput.lightTurns > 0 ? 3 : 0);
  const fragmentCells = new Set(renderInput.mapFragments);
  const cells = [];
  const markers = [];
  let bounds = { minX: renderInput.x, minY: renderInput.y, maxX: renderInput.x, maxY: renderInput.y };
  const extend = (x, y) => {
    bounds = {
      minX: Math.min(bounds.minX, x),
      minY: Math.min(bounds.minY, y),
      maxX: Math.max(bounds.maxX, x),
      maxY: Math.max(bounds.maxY, y)
    };
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < map[y].length; x += 1) {
      const cell = map[y][x];
      if (!cell) continue;
      const dist = Math.abs(x - renderInput.x) + Math.abs(y - renderInput.y);
      const isVisited = Boolean(renderInput.visitedMap?.[y]?.[x]);
      const isFragmentRevealed = fragmentCells.has(`${x},${y}`);
      const isLightRevealed = lightRad > 0 && dist <= lightRad;
      const hasDiscoveredTrap = Boolean(cell.trap && cell.trap.state !== "hidden");
      const traversalKind = getTraversalMarkerKind(cell);
      const isRevealed = (isVisited || isLightRevealed || isFragmentRevealed || hasDiscoveredTrap || traversalKind) &&
        isRenderableCorridorCell(cell);

      if (isRevealed) {
        const reveal = isVisited ? "visited" : isLightRevealed ? "light" : "fragment";
        cells.push({ x, y, cell, reveal });
        extend(x, y);
        if (cell.type === "stairs-down" || cell.type === "stairs-up") {
          markers.push({ kind: cell.type, x, y });
        }
        if (hasDiscoveredTrap) {
          markers.push({ kind: cell.trap.state === "disabled" ? "trap-disabled" : "trap", x, y });
        }
        if (traversalKind) markers.push({ kind: traversalKind, x, y });
      }

      const eventKind = EVENT_MARKERS[cell.event];
      if (eventKind && (isRevealed || (SENSED_EVENTS.has(cell.event) && dist <= FULL_MAP_SENSE_RADIUS))) {
        markers.push({ kind: eventKind, x, y });
        extend(x, y);
      }
    }
  }

  // Elites stay floor-wide as on the minimap (#1814); others only when near.
  renderInput.roamingMonsters.forEach((monster) => {
    if (monster.floor !== renderInput.floor) return;
    if (monster.perception === "afterimage" && !renderInput.hasArcaneSense) return;
    const dist = Math.abs(monster.x - renderInput.x) + Math.abs(monster.y - renderInput.y);
    if (monster.kind !== "elite" && dist > FULL_MAP_SENSE_RADIUS) return;
    markers.push({ kind: monster.kind === "elite" ? "elite" : "monster", x: monster.x, y: monster.y, perception: monster.perception });
    extend(monster.x, monster.y);
  });

  return Object.freeze({
    width,
    height,
    player: Object.freeze({ x: renderInput.x, y: renderInput.y, dir: renderInput.dir }),
    cells,
    markers,
    bounds: Object.freeze(bounds)
  });
}

function drawWalls(ctx, sx, sy, s, walls) {
  ctx.beginPath();
  if (walls[0]) { ctx.moveTo(sx, sy); ctx.lineTo(sx + s, sy); }
  if (walls[1]) { ctx.moveTo(sx + s, sy); ctx.lineTo(sx + s, sy + s); }
  if (walls[2]) { ctx.moveTo(sx, sy + s); ctx.lineTo(sx + s, sy + s); }
  if (walls[3]) { ctx.moveTo(sx, sy); ctx.lineTo(sx, sy + s); }
  ctx.stroke();
}

function drawGlyphBadge(ctx, cx, cy, s, glyph, color) {
  ctx.fillStyle = "rgba(255, 252, 245, 0.95)";
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.2, s * 0.07);
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = `bold ${Math.round(s * 0.5)}px DotGothic16, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(glyph, cx, cy + s * 0.02);
}

/** Draw one legend/marker icon centred in an `s`-sized square at (sx, sy). */
export function drawFullMapIcon(ctx, kind, sx, sy, s, options = {}) {
  const cx = sx + s / 2;
  const cy = sy + s / 2;
  ctx.save();
  ctx.setLineDash([]);
  if (kind === "visited") {
    ctx.fillStyle = "rgba(63, 185, 122, 0.26)";
    ctx.fillRect(sx + 1, sy + 1, s - 2, s - 2);
    ctx.strokeStyle = "#3a3150";
    ctx.lineWidth = Math.max(1.5, s * 0.08);
    ctx.strokeRect(sx + 1, sy + 1, s - 2, s - 2);
  } else if (kind === "unvisited" || kind === "unvisited-light") {
    const rgb = kind === "unvisited-light" ? "31, 143, 160" : "199, 119, 26";
    ctx.fillStyle = `rgba(${rgb}, 0.08)`;
    ctx.fillRect(sx + 1, sy + 1, s - 2, s - 2);
    ctx.strokeStyle = `rgba(${rgb}, 0.65)`;
    ctx.lineWidth = 1;
    ctx.setLineDash([Math.max(2, s * 0.12), Math.max(2, s * 0.12)]);
    ctx.strokeRect(sx + 1, sy + 1, s - 2, s - 2);
  } else if (kind === "stairs-down" || kind === "stairs-up") {
    const isUp = kind === "stairs-up";
    const fill = isUp ? "61, 155, 233" : "224, 154, 40";
    const stroke = isUp ? "#2a6fb0" : "#b8680f";
    ctx.fillStyle = `rgba(${fill}, 0.5)`;
    ctx.fillRect(sx + 1, sy + 1, s - 2, s - 2);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + 1, sy + 1, s - 2, s - 2);
    drawStairMiniMapIcon(ctx, sx + s * 0.1, sy + s * 0.1, s * 0.8, isUp, stroke);
  } else if (kind === "trap" || kind === "trap-disabled") {
    const isDisabled = kind === "trap-disabled";
    const color = isDisabled ? "#2f9e62" : "#d9483b";
    ctx.fillStyle = isDisabled ? "rgba(47, 158, 98, 0.2)" : "rgba(217, 72, 59, 0.2)";
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.2, s * 0.07);
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = `bold ${Math.round(s * 0.5)}px DotGothic16, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(isDisabled ? "x" : "!", cx, cy);
  } else if (kind === "chest") {
    const w = s * 0.62;
    const h = s * 0.46;
    const left = cx - w / 2;
    const top = cy - h / 2;
    ctx.fillStyle = "#e0a13a";
    ctx.strokeStyle = "#7a4a12";
    ctx.lineWidth = Math.max(1.2, s * 0.07);
    ctx.fillRect(left, top, w, h);
    ctx.strokeRect(left, top, w, h);
    ctx.beginPath();
    ctx.moveTo(left, top + h * 0.4);
    ctx.lineTo(left + w, top + h * 0.4);
    ctx.stroke();
    ctx.fillStyle = "#7a4a12";
    ctx.fillRect(cx - s * 0.05, top + h * 0.3, s * 0.1, h * 0.3);
  } else if (GLYPH_MARKERS[kind]) {
    drawGlyphBadge(ctx, cx, cy, s, GLYPH_MARKERS[kind].glyph, GLYPH_MARKERS[kind].color);
  } else if (kind === "elite" || kind === "monster") {
    const isElite = kind === "elite";
    ctx.fillStyle = isElite ? "rgb(224, 140, 20)" : "rgb(217, 72, 59)";
    ctx.beginPath();
    ctx.arc(cx, cy, s * (isElite ? 0.3 : 0.22), 0, Math.PI * 2);
    ctx.fill();
    if (isElite) {
      ctx.strokeStyle = "#ff3b30";
      ctx.lineWidth = Math.max(1.2, s * 0.08);
      ctx.stroke();
    }
  } else if (kind === "player") {
    const dir = options.dir ?? 0;
    ctx.fillStyle = "rgba(31, 143, 160, 0.22)";
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.72, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1f8fa0";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = Math.max(1.5, s * 0.08);
    ctx.translate(cx, cy);
    ctx.rotate((dir * Math.PI) / 2);
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.42);
    ctx.lineTo(-s * 0.34, s * 0.34);
    ctx.lineTo(s * 0.34, s * 0.34);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draw the whole floor onto a 2D context. `cellSize` and `padding` are in the
 * context's current user units; the caller owns canvas sizing and DPR scaling.
 */
export function drawFullMap(ctx, model, { cellSize = 24, padding = 12 } = {}) {
  if (!model) return;
  const s = cellSize;
  const originX = padding;
  const originY = padding;

  ctx.save();
  ctx.fillStyle = "rgba(46, 38, 64, 0.06)";
  ctx.fillRect(originX, originY, model.width * s, model.height * s);
  ctx.strokeStyle = "rgba(46, 38, 64, 0.18)";
  ctx.lineWidth = 1;
  ctx.strokeRect(originX, originY, model.width * s, model.height * s);

  model.cells.forEach(({ x, y, cell, reveal }) => {
    const sx = originX + x * s;
    const sy = originY + y * s;
    if (reveal === "visited") {
      ctx.fillStyle = "rgba(63, 185, 122, 0.26)";
      ctx.strokeStyle = "#3a3150";
      ctx.lineWidth = Math.max(1.5, s * 0.08);
      ctx.setLineDash([]);
    } else {
      const rgb = reveal === "light" ? "31, 143, 160" : "199, 119, 26";
      ctx.fillStyle = `rgba(${rgb}, 0.08)`;
      ctx.strokeStyle = `rgba(${rgb}, 0.6)`;
      ctx.lineWidth = 1;
      ctx.setLineDash([Math.max(2, s * 0.12), Math.max(2, s * 0.12)]);
    }
    ctx.fillRect(sx, sy, s, s);
    drawWalls(ctx, sx, sy, s, cell.walls || []);
    ctx.setLineDash([]);
  });

  model.markers.forEach((marker) => {
    drawFullMapIcon(ctx, marker.kind, originX + marker.x * s, originY + marker.y * s, s);
  });

  const { player } = model;
  drawFullMapIcon(ctx, "player", originX + player.x * s, originY + player.y * s, s, { dir: player.dir });
  ctx.restore();
}
