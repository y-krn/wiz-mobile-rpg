// balance-impact: none — opt-in PixiJS screen-space presentation spike only.
// The production renderer remains Canvas. This module consumes RendererInput
// and deliberately does not recreate the Three.js camera/geometry contract.
import { Application, Container, Graphics, Text } from "pixi.js";
import { EVENT_TYPES } from "./data.js";
import {
  BASE_GEOMETRY,
  getCombatMonsterLayout,
  getProjectionColumn,
  getProjectionPlanes
} from "./renderer.js";
import { getRendererInput, isRendererInput } from "./state/renderer_view.js";
import { getVisibleCorridorTopology, isRenderableCorridorCell } from "./rules/renderer_topology.js";
import { renderMiniMapOverlay } from "./minimap.js";

export const PIXI_VIEW_W = 400;
export const PIXI_VIEW_H = 260;
export const PIXI_VERSION = "8.19.0";

const COLUMN_ORDER = [-2, 2, -1, 1, 0];
const FALLBACK_BACKGROUND = "#0c0c0e";

function flatPoints(...points) {
  return points.flatMap(({ x, y }) => [x, y]);
}

function addPolygon(container, points, color, alpha = 1, stroke = null) {
  const graphic = new Graphics();
  graphic.poly(flatPoints(...points)).fill({ color, alpha });
  if (stroke) graphic.stroke(stroke);
  container.addChild(graphic);
  return graphic;
}

function addLine(container, points, stroke) {
  const graphic = new Graphics();
  graphic.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach(({ x, y }) => graphic.lineTo(x, y));
  graphic.stroke(stroke);
  container.addChild(graphic);
  return graphic;
}

function drawRect(container, x, y, width, height, color, alpha = 1, stroke = null) {
  const graphic = new Graphics();
  graphic.rect(x, y, width, height).fill({ color, alpha });
  if (stroke) graphic.stroke(stroke);
  container.addChild(graphic);
  return graphic;
}

function drawEllipse(container, x, y, radiusX, radiusY, color, alpha = 1, stroke = null) {
  const graphic = new Graphics();
  graphic.ellipse(x, y, radiusX, radiusY).fill({ color, alpha });
  if (stroke) graphic.stroke(stroke);
  container.addChild(graphic);
  return graphic;
}

function drawProjectedSideWall(container, plane, nextPlane, side, color, alpha, stroke = null) {
  const nearTop = side === "left" ? plane.leftTop : plane.rightTop;
  const farTop = side === "left" ? nextPlane.leftTop : nextPlane.rightTop;
  const farBottom = side === "left" ? nextPlane.leftBottom : nextPlane.rightBottom;
  const nearBottom = side === "left" ? plane.leftBottom : plane.rightBottom;
  const graphic = new Graphics();
  graphic.moveTo(nearTop.x, nearTop.y);
  graphic.lineTo(farTop.x, farTop.y);
  graphic.lineTo(farBottom.x, farBottom.y);
  graphic.lineTo(nearBottom.x, nearBottom.y);
  graphic.closePath().fill({ color, alpha });
  if (stroke) graphic.stroke(stroke);
  container.addChild(graphic);
  return graphic;
}

function drawProjectedFrontWall(container, plane, ceilingStyle, color, alpha, stroke = null) {
  const graphic = new Graphics();
  graphic.moveTo(plane.leftTop, plane.top);
  if (ceilingStyle === "arch") {
    const centerX = (plane.leftTop + plane.rightTop) / 2;
    const archHeight = Math.max(3, (plane.bottom - plane.top) * 0.12);
    graphic.quadraticCurveTo(centerX, plane.top - archHeight, plane.rightTop, plane.top);
  } else {
    graphic.lineTo(plane.rightTop, plane.top);
  }
  graphic.lineTo(plane.rightBottom, plane.bottom);
  graphic.lineTo(plane.leftBottom, plane.bottom);
  graphic.closePath().fill({ color, alpha });
  if (stroke) graphic.stroke(stroke);
  container.addChild(graphic);
  return graphic;
}

function safeColor(value, fallback) {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function getMonsterColor(monster) {
  return safeColor(monster?.color, "#ff3b30");
}

function getQueuedThreat(monster) {
  return Boolean(monster?.chargeQueued || monster?.selfDestructQueued || monster?.lahalitoQueued ||
    monster?.madaltoQueued || monster?.tiltowaitQueued || monster?.dragonBreathQueued ||
    monster?.multiActionQueued || monster?.summonQueued || monster?.snipeQueued || monster?.statusPayoffQueued);
}

/**
 * A PixiJS renderer that keeps the existing Canvas projection and topology.
 * Pixi is used only as a 2D drawing surface; there is no camera, FOV, eye,
 * world-space mesh, or 3D occlusion contract here.
 */
export class PixiDungeonRenderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.mode = "pixi";
    this.supported = false;
    this.app = null;
    this.scene = null;
    this.lastSignature = null;
    this.renderCount = 0;
    this.totalRenderMs = 0;
    this.shakeTime = 0;
    this.shakeIntensity = 0;
    this.flashTime = 0;
    this.damageTexts = [];
    this.resourceStats = { sceneRebuilds: 0, maxChildren: 0, destroyed: false };
  }

  async init() {
    if (!this.canvas) throw new Error("Pixi dungeon canvas is unavailable");
    const startedAt = performance.now();
    const app = new Application();
    await app.init({
      canvas: this.canvas,
      width: PIXI_VIEW_W,
      height: PIXI_VIEW_H,
      resolution: 1,
      autoDensity: false,
      antialias: true,
      backgroundColor: 0x0c0c0e,
      autoStart: false,
      preference: "webgl"
    });
    this.app = app;
    this.scene = new Container();
    this.app.stage.addChild(this.scene);
    this.initializationCostMs = performance.now() - startedAt;
    this.supported = Boolean(this.app.renderer && this.app.canvas === this.canvas);
    this.canvas.dataset.renderer = this.supported ? this.mode : "pixi-unavailable";
    return this;
  }

  triggerShake(intensity = 10, duration = 300) {
    this.shakeTime = duration;
    this.shakeIntensity = intensity;
  }

  triggerFlash(duration = 200) {
    this.flashTime = duration;
  }

  addDamageText(text, color = "#ff3b30") {
    this.damageTexts.push({ text: String(text), color, age: 0, maxAge: 40 });
  }

  update(dt) {
    this.shakeTime = Math.max(0, this.shakeTime - dt);
    this.flashTime = Math.max(0, this.flashTime - dt);
    this.damageTexts.forEach((entry) => { entry.age += 1; });
    this.damageTexts = this.damageTexts.filter((entry) => entry.age < entry.maxAge);
  }

  resolveRenderInput(input) {
    if (isRendererInput(input)) return input;
    const current = getRendererInput();
    return input && typeof input === "object"
      ? Object.freeze({ ...current, sceneVisibility: input })
      : current;
  }

  getRenderInput() {
    return getRendererInput();
  }

  getSceneVisibility(input = null) {
    return this.resolveRenderInput(input).sceneVisibility;
  }

  getDrawSignature(input = null) {
    const renderInput = this.resolveRenderInput(input);
    const { view, sceneVisibility } = renderInput;
    const combat = view.hasCombat
      ? renderInput.combatMonsters.map((monster) => [monster.name, monster.hp, monster.maxHp, monster.color, getQueuedThreat(monster)].join(",")).join(";")
      : "";
    return [
      view.gameState,
      renderInput.floor,
      renderInput.x,
      renderInput.y,
      renderInput.dir,
      renderInput.mapRevision,
      sceneVisibility.showTownBackground,
      sceneVisibility.showCombat,
      sceneVisibility.showChest,
      renderInput.combatTargetSelection.active,
      combat,
      renderInput.visual.geometry.ceilingStyle,
      renderInput.dangerCue.active,
      renderInput.lightTurns,
      renderInput.roamingMonsters.map((monster) => `${monster.floor}:${monster.x}:${monster.y}:${monster.kind}`).join(";")
    ].join("|");
  }

  isAnimating(input = null) {
    const renderInput = this.resolveRenderInput(input);
    const environment = renderInput.visual.environment;
    if (this.shakeTime > 0 || this.flashTime > 0 || this.damageTexts.length > 0) return true;
    if (environment.animated || renderInput.dangerCue.active) return true;
    return false;
  }

  getCombatTargetAtClientPoint(clientX, clientY, input = null) {
    const renderInput = this.resolveRenderInput(input);
    if (!renderInput.combatTargetSelection?.active || !this.canvas) return null;
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const scale = Math.min(rect.width / PIXI_VIEW_W, rect.height / PIXI_VIEW_H);
    const renderedWidth = PIXI_VIEW_W * scale;
    const renderedHeight = PIXI_VIEW_H * scale;
    const x = (clientX - rect.left - (rect.width - renderedWidth) / 2) / scale;
    const y = (clientY - rect.top - (rect.height - renderedHeight) / 2) / scale;
    if (x < 0 || x > PIXI_VIEW_W || y < 0 || y > PIXI_VIEW_H) return null;
    return getCombatMonsterLayout(renderInput.combatMonsters)
      .find(({ hitRegion }) => {
        const normalizedX = (x - hitRegion.centerX) / hitRegion.radiusX;
        const normalizedY = (y - hitRegion.centerY) / hitRegion.radiusY;
        return normalizedX ** 2 + normalizedY ** 2 <= 1;
      })?.monsterIndex ?? null;
  }

  clearScene() {
    if (!this.scene) return;
    const children = this.scene.removeChildren();
    children.forEach((child) => child.destroy({ children: true }));
    this.resourceStats.sceneRebuilds += 1;
  }

  draw(input = null) {
    if (!this.app || !this.scene) return;
    const renderInput = this.resolveRenderInput(input);
    const startedAt = performance.now();
    this.clearScene();
    this.drawBackground(renderInput);
    if (renderInput.sceneVisibility.showTownBackground) {
      this.drawTownBackground(renderInput);
    } else {
      this.drawCorridors(renderInput);
      if (renderInput.sceneVisibility.showCombat) this.drawMonsters(renderInput);
      if (renderInput.sceneVisibility.showChest) this.drawChest(renderInput);
    }
    this.drawDangerPulse(renderInput);
    this.drawFloatingTexts();
    if (this.flashTime > 0) drawRect(this.scene, 0, 0, PIXI_VIEW_W, PIXI_VIEW_H, "#ffffff", 0.24);
    if (this.shakeTime > 0) {
      const offset = (Math.random() - 0.5) * this.shakeIntensity;
      this.scene.position.set(offset, offset);
    } else {
      this.scene.position.set(0, 0);
    }
    this.app.render();
    renderMiniMapOverlay(renderInput);
    this.renderCount += 1;
    this.totalRenderMs += performance.now() - startedAt;
    this.resourceStats.maxChildren = Math.max(this.resourceStats.maxChildren, this.scene.children.length);
  }

  drawBackground(renderInput) {
    const color = safeColor(renderInput.visual.background, FALLBACK_BACKGROUND);
    drawRect(this.scene, 0, 0, PIXI_VIEW_W, PIXI_VIEW_H, color);
  }

  drawTownBackground(renderInput) {
    const color = safeColor(renderInput.visual.wallColor, "#00e5ff");
    addLine(this.scene, [{ x: 0, y: 180 }, { x: 80, y: 150 }, { x: 130, y: 170 }, { x: 200, y: 130 }, { x: 280, y: 165 }, { x: 340, y: 145 }, { x: 400, y: 180 }], { color, alpha: 0.35, width: 1 });
    drawRect(this.scene, 150, 110, 10, 70, color, 0, { color, width: 2 });
    drawRect(this.scene, 240, 110, 10, 70, color, 0, { color, width: 2 });
    drawRect(this.scene, 160, 160, 80, 20, color, 0, { color, width: 2 });
    drawEllipse(this.scene, 200, 180, 20, 20, color, 0, { color, width: 2 });
  }

  drawCorridors(renderInput) {
    const map = renderInput.map;
    if (!Array.isArray(map)) return;
    const projection = getProjectionPlanes(renderInput.visual.geometry || BASE_GEOMETRY);
    const topology = new Map(getVisibleCorridorTopology(map, renderInput.x, renderInput.y, renderInput.dir)
      .map((cell) => [`${cell.z}:${cell.column}`, cell]));
    const background = safeColor(renderInput.visual.background, FALLBACK_BACKGROUND);
    const wallColor = safeColor(renderInput.visual.wallColor, "#58d6e8");
    const gridColor = safeColor(renderInput.visual.gridColor, "rgba(88, 214, 232, 0.26)");
    const ceilingStyle = renderInput.visual.geometry?.ceilingStyle || "flat";
    const environmentOverlay = safeColor(renderInput.visual.environment?.overlay, "rgba(255,255,255,0.03)");

    for (let z = 3; z >= 0; z -= 1) {
      const width = projection.xr[z] - projection.xl[z];
      for (const column of COLUMN_ORDER) {
        if (Math.abs(column) === 2 && z < 2) continue;
        const cellTopology = topology.get(`${z}:${column}`);
        if (!cellTopology) continue;
        const plane = getProjectionColumn(projection, z, column);
        const nextPlane = getProjectionColumn(projection, z + 1, column);
        const row = map[cellTopology.y];
        const cell = row?.[cellTopology.x];
        if (!isRenderableCorridorCell(cell)) {
          drawProjectedFrontWall(this.scene, plane, ceilingStyle, "#0c0c0e", 1, { color: "#ff3b30", width: 2 });
          continue;
        }

        // Enhancement 1: restrained depth shading on the walkable floor. The
        // polygon follows the Canvas projection exactly, so side openings stay
        // floor, not panels or decorative markers.
        const depthAlpha = 0.09 + (3 - z) * 0.025;
        addPolygon(this.scene, [
          { x: plane.leftBottom, y: plane.bottom },
          { x: plane.rightBottom, y: plane.bottom },
          { x: nextPlane.rightBottom, y: nextPlane.bottom },
          { x: nextPlane.leftBottom, y: nextPlane.bottom }
        ], wallColor, depthAlpha);

        // A second low-alpha layer supplies a material tint without hiding the
        // route silhouette or introducing fake perspective cues.
        addPolygon(this.scene, [
          { x: plane.leftTop, y: plane.top },
          { x: nextPlane.leftTop, y: nextPlane.top },
          { x: nextPlane.rightTop, y: nextPlane.top },
          { x: plane.rightTop, y: plane.top },
          { x: plane.rightBottom, y: plane.bottom },
          { x: plane.leftBottom, y: plane.bottom }
        ], environmentOverlay, 0.45);

        addLine(this.scene, [
          { x: plane.leftBottom, y: plane.bottom }, { x: nextPlane.leftBottom, y: nextPlane.bottom },
          { x: nextPlane.rightBottom, y: nextPlane.bottom }, { x: plane.rightBottom, y: plane.bottom }
        ], { color: gridColor, width: 1.4, alpha: 0.9 });
        addLine(this.scene, [
          { x: plane.leftTop, y: plane.top }, { x: nextPlane.leftTop, y: nextPlane.top },
          { x: nextPlane.rightTop, y: nextPlane.top }, { x: plane.rightTop, y: plane.top }
        ], { color: gridColor, width: 1.1, alpha: 0.76 });

        if (cellTopology.leftBlocked) {
          drawProjectedSideWall(this.scene, plane, nextPlane, "left", background, 0.98, { color: wallColor, width: 2, alpha: 0.96 });
        }
        if (cellTopology.rightBlocked) {
          const mirroredPlane = { ...plane, leftTop: plane.rightTop, rightTop: plane.leftTop, leftBottom: plane.rightBottom, rightBottom: plane.leftBottom };
          const mirroredNext = { ...nextPlane, leftTop: nextPlane.rightTop, rightTop: nextPlane.leftTop, leftBottom: nextPlane.rightBottom, rightBottom: nextPlane.leftBottom };
          drawProjectedSideWall(this.scene, mirroredPlane, mirroredNext, "left", background, 0.98, { color: wallColor, width: 2, alpha: 0.96 });
        }
        if (cellTopology.frontBlocked) {
          drawProjectedFrontWall(this.scene, nextPlane, ceilingStyle, background, 0.98, { color: wallColor, width: 2, alpha: 0.98 });
          if (cellTopology.frontOneWayBarrier && column === 0) this.drawOneWayBarrier(nextPlane, wallColor);
        }

        if (column === 0 && z > 0) this.drawLandmark(cell, nextPlane, renderInput.visual.wallColor);
        if (column === 0 && renderInput.roamingMonsters.some((monster) => monster.floor === renderInput.floor && monster.x === cellTopology.x && monster.y === cellTopology.y) && z > 0) {
          drawEllipse(this.scene, (nextPlane.leftBottom + nextPlane.rightBottom) / 2, nextPlane.bottom - 12, width * 0.10, Math.max(4, width * 0.04), "#ff3b30", 0.12, { color: "#ff3b30", width: 2, alpha: 0.85 });
        }
      }
    }
  }

  drawLandmark(cell, plane, color) {
    const cx = (plane.leftBottom + plane.rightBottom) / 2;
    const width = Math.max(8, plane.rightBottom - plane.leftBottom);
    const y = plane.bottom - width * 0.12;
    if (cell.type === "stairs-up" || cell.type === "stairs-down") {
      const graphic = new Graphics();
      graphic.moveTo(cx - width * 0.18, y).lineTo(cx + width * 0.18, y);
      graphic.moveTo(cx - width * 0.13, y - width * 0.08).lineTo(cx + width * 0.13, y - width * 0.08);
      graphic.moveTo(cx - width * 0.08, y - width * 0.16).lineTo(cx + width * 0.08, y - width * 0.16);
      graphic.stroke({ color: cell.type === "stairs-up" ? "#00b7ff" : "#ffb300", width: 1.5, alpha: 0.9 });
      this.scene.addChild(graphic);
    } else if (cell.event === EVENT_TYPES.CHEST) {
      drawRect(this.scene, cx - width * 0.14, y - width * 0.10, width * 0.28, width * 0.10, "#8a5a2b", 0.92, { color: "#ffd60a", width: 1.2 });
    } else if (cell.trap?.state === "discovered") {
      drawEllipse(this.scene, cx, y - width * 0.05, width * 0.10, width * 0.06, "#ff3b30", 0.12, { color: "#ff3b30", width: 1.4 });
    }
    if (color && cell.type === "stairs-down") addLine(this.scene, [{ x: cx, y: y - width * 0.22 }, { x: cx, y: y - width * 0.04 }], { color, width: 1, alpha: 0.55 });
  }

  drawOneWayBarrier(plane, color) {
    const centerX = (plane.leftTop + plane.rightTop + plane.leftBottom + plane.rightBottom) / 4;
    const centerY = (plane.top + plane.bottom) / 2;
    const width = Math.max(8, (plane.rightBottom - plane.leftBottom) * 0.16);
    const height = Math.max(5, (plane.bottom - plane.top) * 0.10);
    const graphic = new Graphics();
    for (let index = -1; index <= 1; index += 1) {
      const y = centerY + index * height * 1.6;
      graphic.moveTo(centerX - width, y - height);
      graphic.lineTo(centerX, y);
      graphic.lineTo(centerX + width, y - height);
    }
    graphic.stroke({ color, width: 1.7, alpha: 0.82 });
    this.scene.addChild(graphic);
  }

  drawMonsters(renderInput) {
    getCombatMonsterLayout(renderInput.combatMonsters).forEach(({ monster, cx, cy, scale, slotWidth, hitRegion }) => {
      const color = getMonsterColor(monster);
      drawEllipse(this.scene, cx, cy + 28 * scale, 35 * scale, 5 * scale, "#000000", 0.58);
      const spriteType = monster.spriteType || "biter";
      if (["skeleton", "zombie", "orc", "kobold"].includes(spriteType)) {
        drawRect(this.scene, cx - 19 * scale, cy - 34 * scale, 38 * scale, 52 * scale, color, 0.34, { color, width: Math.max(1, 3 * scale), alpha: 0.9 });
      } else {
        drawEllipse(this.scene, cx, cy - 10 * scale, 25 * scale, 25 * scale, color, 0.34, { color, width: Math.max(1, 3 * scale), alpha: 0.9 });
      }
      drawEllipse(this.scene, cx, cy - 10 * scale, 8 * scale, 8 * scale, "#ffffff", 0.82);
      addLine(this.scene, [{ x: cx - 15 * scale, y: cy - 10 * scale }, { x: cx + 15 * scale, y: cy - 10 * scale }], { color: "#ffffff", width: Math.max(1, scale), alpha: 0.7 });
      const hp = Math.max(0, Math.min(1, monster.hp / Math.max(1, monster.maxHp)));
      drawRect(this.scene, cx - Math.min(100, slotWidth - 8) / 2, cy - 62, Math.min(100, slotWidth - 8), 5, "#ffffff", 0.12, { color: "#8e8e93", width: 1 });
      drawRect(this.scene, cx - Math.min(100, slotWidth - 8) / 2, cy - 62, Math.min(100, slotWidth - 8) * hp, 5, color, 0.9);
      if (getQueuedThreat(monster)) {
        const pulse = 0.48 + 0.18 * Math.sin(Date.now() / 180);
        drawEllipse(this.scene, cx, cy - 10 * scale, 31 * scale, 31 * scale, "#ffcc00", 0, { color: "#ffcc00", width: 2, alpha: pulse });
      }
      if (renderInput.combatTargetSelection?.active) this.drawTargetMarker(hitRegion, cx, cy, scale, color);
    });
  }

  drawTargetMarker(hitRegion, cx, cy, scale, color) {
    const radiusX = Math.min(hitRegion.width * 0.32, 40 * scale);
    const radiusY = 8 * scale;
    const graphic = new Graphics();
    for (let segment = 0; segment < 8; segment += 2) {
      const start = (segment / 8) * Math.PI * 2;
      const end = ((segment + 1) / 8) * Math.PI * 2;
      graphic.moveTo(cx + Math.cos(start) * radiusX, cy + 31 * scale + Math.sin(start) * radiusY);
      graphic.lineTo(cx + Math.cos(end) * radiusX, cy + 31 * scale + Math.sin(end) * radiusY);
    }
    graphic.stroke({ color, width: 1.5, alpha: 0.82 });
    this.scene.addChild(graphic);
  }

  drawChest() {
    drawRect(this.scene, 170, 145, 60, 40, "#6b3a00", 0.92, { color: "#ffb300", width: 2.5 });
    addLine(this.scene, [{ x: 170, y: 160 }, { x: 230, y: 160 }], { color: "#ffb300", width: 2 });
    drawEllipse(this.scene, 200, 164, 4, 4, "#ff3b30", 0.95);
  }

  drawDangerPulse(renderInput) {
    if (!renderInput.dangerCue?.active) return;
    const pulse = 0.05 + 0.03 * (Math.sin(Date.now() / 220) + 1);
    drawEllipse(this.scene, 200, 174, 150, 22, "#ff3b30", pulse, { color: "#ff3b30", width: 1.3, alpha: 0.48 });
  }

  drawFloatingTexts() {
    this.damageTexts.forEach((entry) => {
      const text = new Text({
        text: entry.text,
        style: { fill: entry.color, fontFamily: "monospace", fontSize: 16, fontWeight: "bold" }
      });
      text.anchor.set(0.5);
      text.position.set(200, 100 - entry.age * 0.7);
      text.alpha = Math.max(0, 1 - entry.age / entry.maxAge);
      this.scene.addChild(text);
    });
  }

  dispose() {
    if (!this.app) return;
    this.clearScene();
    this.app.destroy({ removeView: false }, { children: true });
    this.app = null;
    this.scene = null;
    this.supported = false;
    this.resourceStats.destroyed = true;
  }
}
