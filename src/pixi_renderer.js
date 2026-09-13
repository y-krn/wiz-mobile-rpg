// balance-impact: none — opt-in PixiJS screen-space presentation.
// The production renderer remains Canvas. This module consumes RendererInput
// and deliberately stays within the shared screen-space projection contract.
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
export const PIXI_MOTION_PROFILE = Object.freeze({
  durationMs: 100,
  layerDepthPx: 0.75,
  layerTurnPx: 0.75,
  layerParallax: 0.18
});

const COLUMN_ORDER = [-2, 2, -1, 1, 0];
const FALLBACK_BACKGROUND = "#0c0c0e";
const LAYER_NAMES = Object.freeze([
  "background",
  "far-environment",
  "floor",
  "structural-walls",
  "environment-fx",
  "actors",
  "combat-fx",
  "overlays"
]);

const MOTION_DURATION_MS = Object.freeze({
  forward: PIXI_MOTION_PROFILE.durationMs,
  backward: PIXI_MOTION_PROFILE.durationMs,
  "turn-left": PIXI_MOTION_PROFILE.durationMs,
  "turn-right": PIXI_MOTION_PROFILE.durationMs
});

function prefersReducedMotion() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function parseColor(value, fallback = 0xffffff) {
  if (typeof value !== "string") return fallback;
  const match = value.trim().match(/^#([0-9a-f]{6})$/i);
  return match ? Number.parseInt(match[1], 16) : fallback;
}

function mixColor(first, second, amount) {
  const t = clamp01(amount);
  const a = parseColor(first);
  const b = parseColor(second);
  const channel = (shift) => Math.round(((a >> shift) & 0xff) * (1 - t) + ((b >> shift) & 0xff) * t);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

function seededUnit(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

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
  graphic.moveTo(nearTop, plane.top);
  graphic.lineTo(farTop, nextPlane.top);
  graphic.lineTo(farBottom, nextPlane.bottom);
  graphic.lineTo(nearBottom, plane.bottom);
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
    this.lastRenderMs = 0;
    this.maxRenderMs = 0;
    this.clockMs = 0;
    this.shakeTime = 0;
    this.shakeIntensity = 0;
    this.flashTime = 0;
    this.hitTime = 0;
    this.combatEntryTime = 0;
    this.transition = null;
    this.transitionScene = null;
    this.activeRoot = null;
    this.damageTexts = [];
    this.resourceStats = {
      sceneRebuilds: 0,
      maxChildren: 0,
      destroyed: false,
      layerCount: LAYER_NAMES.length,
      generatedTextureCount: 0,
      filterCount: 0,
      listenerCount: 0
    };
  }

  createSceneRoot(name) {
    const root = new Container();
    root.label = name;
    root.layers = Object.fromEntries(LAYER_NAMES.map((layerName) => {
      const layer = new Container();
      layer.label = layerName;
      root.addChild(layer);
      return [layerName, layer];
    }));
    return root;
  }

  layer(name, root = this.activeRoot || this.scene) {
    return root?.layers?.[name] || root;
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
    this.scene = this.createSceneRoot("pixi-current-scene");
    this.transitionScene = this.createSceneRoot("pixi-transition-scene");
    this.app.stage.addChild(this.scene);
    this.app.stage.addChild(this.transitionScene);
    this.transitionScene.visible = false;
    this.initializationCostMs = performance.now() - startedAt;
    this.supported = Boolean(this.app.renderer && this.app.canvas === this.canvas);
    this.canvas.dataset.renderer = this.supported ? this.mode : "pixi-unavailable";
    return this;
  }

  triggerShake(intensity = 10, duration = 300) {
    if (prefersReducedMotion()) {
      this.shakeTime = 0;
      this.shakeIntensity = 0;
      return;
    }
    this.shakeTime = duration;
    this.shakeIntensity = intensity;
  }

  triggerFlash(duration = 200) {
    if (prefersReducedMotion()) return;
    this.flashTime = duration;
  }

  triggerCombatEntry(duration = 320) {
    if (prefersReducedMotion()) return;
    this.combatEntryTime = Math.max(this.combatEntryTime, duration);
  }

  triggerHitFeedback(duration = 220) {
    if (prefersReducedMotion()) return;
    this.hitTime = Math.max(this.hitTime, duration);
  }

  addDamageText(text, color = "#ff3b30") {
    this.damageTexts.push({ text: String(text), color, age: 0, maxAge: prefersReducedMotion() ? 1 : 40 });
  }

  update(dt) {
    this.clockMs += Math.max(0, dt);
    this.shakeTime = Math.max(0, this.shakeTime - dt);
    this.flashTime = Math.max(0, this.flashTime - dt);
    this.hitTime = Math.max(0, this.hitTime - dt);
    this.combatEntryTime = Math.max(0, this.combatEntryTime - dt);
    this.damageTexts.forEach((entry) => { entry.age += 1; });
    this.damageTexts = this.damageTexts.filter((entry) => entry.age < entry.maxAge);
    if (this.transition) {
      this.transition.elapsed = Math.min(this.transition.duration, this.transition.elapsed + Math.max(0, dt));
      if (this.transition.elapsed >= this.transition.duration) {
        this.transition = null;
        if (this.transitionScene) {
          this.transitionScene.visible = false;
          this.clearSceneRoot(this.transitionScene);
        }
        this.resetMotion(this.scene);
      }
    }
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
    if (this.transition || this.shakeTime > 0 || this.flashTime > 0 || this.hitTime > 0 || this.combatEntryTime > 0 || this.damageTexts.length > 0) return true;
    if (prefersReducedMotion()) return false;
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
    this.clearSceneRoot(this.scene);
  }

  clearSceneRoot(root) {
    if (!root) return;
    const children = root.removeChildren();
    children.forEach((child) => child.destroy({ children: true }));
    this.resourceStats.sceneRebuilds += 1;
    if (root.layers) {
      root.layers = Object.fromEntries(LAYER_NAMES.map((layerName) => {
        const layer = new Container();
        layer.label = layerName;
        root.addChild(layer);
        return [layerName, layer];
      }));
    }
  }

  beginNavigationTransition(action, input = null) {
    if (!MOTION_DURATION_MS[action]) return;
    if (prefersReducedMotion()) {
      this.cancelNavigationTransition();
      return;
    }
    this.transition = {
      action,
      duration: MOTION_DURATION_MS[action],
      elapsed: 0,
      fromInput: this.resolveRenderInput(input),
      sourceDrawn: false
    };
    if (this.transitionScene) this.transitionScene.visible = true;
  }

  cancelNavigationTransition() {
    this.transition = null;
    if (this.transitionScene) {
      this.transitionScene.visible = false;
      this.clearSceneRoot(this.transitionScene);
    }
    this.resetMotion(this.scene);
  }

  resetMotion(root) {
    if (!root) return;
    root.position.set(0, 0);
    root.scale.set(1, 1);
    root.rotation = 0;
    root.alpha = 1;
    Object.values(root.layers || {}).forEach((layer) => {
      layer.position.set(0, 0);
      layer.scale.set(1, 1);
      layer.rotation = 0;
      layer.alpha = 1;
    });
  }

  applyMotion(root, action, progress, outgoing = false) {
    this.resetMotion(root);
    const eased = outgoing ? 1 - clamp01(progress) : clamp01(progress);
    const remaining = 1 - eased;
    const direction = action === "turn-left" ? -1 : 1;
    // Navigation must never move the screen-space scene root. Only the
    // snapshot opacity and a sub-pixel shift inside visual layers may change.
    const layerDepth = {
      "far-environment": 0.25,
      floor: 0.72,
      "structural-walls": 0.88,
      "environment-fx": 0.94
    };
    if (action === "forward" || action === "backward") {
      const distance = action === "forward"
        ? PIXI_MOTION_PROFILE.layerDepthPx
        : -PIXI_MOTION_PROFILE.layerDepthPx;
      root.alpha = outgoing ? 1 - eased : eased;
      Object.entries(layerDepth).forEach(([name, depth]) => {
        const layer = root.layers?.[name];
        if (layer) layer.position.y = (outgoing ? -1 : 1) * distance * remaining * (1 - depth) * PIXI_MOTION_PROFILE.layerParallax;
      });
      return;
    }

    const offset = PIXI_MOTION_PROFILE.layerTurnPx * direction;
    // Keep the horizon, HUD, and Dungeon View frame stable. Turns only
    // cross-fade snapshots and gently interpolate internal visual layers.
    root.alpha = outgoing ? 1 - eased : eased;
    Object.entries(layerDepth).forEach(([name, depth]) => {
      const layer = root.layers?.[name];
      if (layer) layer.position.x = (outgoing ? 1 : -1) * offset * remaining * (1 - depth) * PIXI_MOTION_PROFILE.layerParallax;
    });
  }

  draw(input = null) {
    if (!this.app || !this.scene) return;
    const renderInput = this.resolveRenderInput(input);
    const startedAt = performance.now();
    if (this.transition && !this.transition.sourceDrawn) {
      this.clearSceneRoot(this.transitionScene);
      this.drawScene(this.transition.fromInput, this.transitionScene);
      this.transition.sourceDrawn = true;
    }
    this.clearSceneRoot(this.scene);
    this.drawScene(renderInput, this.scene);
    if (this.transition) {
      const progress = this.transition.elapsed / this.transition.duration;
      this.applyMotion(this.transitionScene, this.transition.action, progress, true);
      this.applyMotion(this.scene, this.transition.action, progress, false);
    } else this.resetMotion(this.scene);
    // Navigation transitions are root-transform-free. Heavy combat shake is
    // a separate feedback path and is ignored while a navigation transition
    // is active so it can never leak into navigation comfort.
    if (this.shakeTime > 0 && !this.transition) {
      const offset = (Math.sin(this.clockMs * 0.11) * 0.5) * this.shakeIntensity;
      this.scene.position.x += offset;
      this.scene.position.y += offset * 0.45;
    }
    if (this.flashTime > 0) drawRect(this.layer("overlays"), 0, 0, PIXI_VIEW_W, PIXI_VIEW_H, "#ffffff", 0.24);
    if (this.hitTime > 0) this.drawHitFeedback(renderInput);
    this.app.render();
    renderMiniMapOverlay(renderInput);
    this.renderCount += 1;
    this.lastRenderMs = performance.now() - startedAt;
    this.maxRenderMs = Math.max(this.maxRenderMs, this.lastRenderMs);
    this.totalRenderMs += this.lastRenderMs;
    this.resourceStats.maxChildren = Math.max(this.resourceStats.maxChildren, this.scene.children.length);
  }

  drawScene(renderInput, root) {
    const previousRoot = this.activeRoot;
    this.activeRoot = root;
    this.drawBackground(renderInput);
    this.drawFarEnvironment(renderInput);
    if (renderInput.sceneVisibility.showTownBackground) {
      this.drawTownBackground(renderInput);
    } else {
      this.drawCorridors(renderInput);
      if (renderInput.sceneVisibility.showCombat) this.drawMonsters(renderInput);
      if (renderInput.sceneVisibility.showChest) this.drawChest(renderInput);
    }
    this.drawAtmosphere(renderInput);
    this.drawDangerPulse(renderInput);
    this.drawFloatingTexts();
    if (renderInput.sceneVisibility.showCombat && this.combatEntryTime > 0) this.drawCombatEntry(renderInput);
    this.activeRoot = previousRoot;
  }

  drawBackground(renderInput) {
    const color = safeColor(renderInput.visual.background, FALLBACK_BACKGROUND);
    const background = this.layer("background");
    drawRect(background, 0, 0, PIXI_VIEW_W, PIXI_VIEW_H, color);
    const wallColor = safeColor(renderInput.visual.wallColor, "#58d6e8");
    for (let band = 0; band < 7; band += 1) {
      const amount = band / 6;
      addPolygon(background, [
        { x: 0, y: band * 38 }, { x: PIXI_VIEW_W, y: band * 38 },
        { x: PIXI_VIEW_W, y: (band + 1) * 38 }, { x: 0, y: (band + 1) * 38 }
      ], mixColor(color, wallColor, 0.08 + amount * 0.08), 0.11);
    }
  }

  drawTownBackground(renderInput) {
    const color = safeColor(renderInput.visual.wallColor, "#00e5ff");
    const far = this.layer("far-environment");
    const walls = this.layer("structural-walls");
    addLine(far, [{ x: 0, y: 180 }, { x: 80, y: 150 }, { x: 130, y: 170 }, { x: 200, y: 130 }, { x: 280, y: 165 }, { x: 340, y: 145 }, { x: 400, y: 180 }], { color, alpha: 0.35, width: 1 });
    drawRect(walls, 150, 110, 10, 70, color, 0, { color, width: 2 });
    drawRect(walls, 240, 110, 10, 70, color, 0, { color, width: 2 });
    drawRect(walls, 160, 160, 80, 20, color, 0, { color, width: 2 });
    drawEllipse(walls, 200, 180, 20, 20, color, 0, { color, width: 2 });
  }

  drawFarEnvironment(renderInput) {
    const far = this.layer("far-environment");
    const color = safeColor(renderInput.visual.wallColor, "#58d6e8");
    const phase = Number(renderInput.visual.environment?.animatedCyclePosition || 0);
    for (let index = 0; index < 5; index += 1) {
      const x = 36 + seededUnit(renderInput.floor * 19 + index * 7 + phase) * 328;
      const y = 32 + seededUnit(renderInput.floor * 29 + index * 11 + phase) * 86;
      drawEllipse(far, x, y, 1.4, 1.4, color, 0.18);
    }
    addPolygon(far, [{ x: 150, y: 0 }, { x: 250, y: 0 }, { x: 224, y: 124 }, { x: 176, y: 124 }], color, 0.025);
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
          drawProjectedFrontWall(this.layer("structural-walls"), plane, ceilingStyle, "#0c0c0e", 1, { color: "#ff3b30", width: 2 });
          continue;
        }

        // Enhancement 1: restrained depth shading on the walkable floor. The
        // polygon follows the Canvas projection exactly, so side openings stay
        // floor, not panels or decorative markers.
        const depthAlpha = 0.09 + (3 - z) * 0.025;
        addPolygon(this.layer("floor"), [
          { x: plane.leftBottom, y: plane.bottom },
          { x: plane.rightBottom, y: plane.bottom },
          { x: nextPlane.rightBottom, y: nextPlane.bottom },
          { x: nextPlane.leftBottom, y: nextPlane.bottom }
        ], wallColor, depthAlpha);
        this.drawFloorMaterial(plane, nextPlane, wallColor, renderInput.floor, z);

        // A second low-alpha layer supplies a material tint without hiding the
        // route silhouette or introducing fake perspective cues.
        addPolygon(this.layer("floor"), [
          { x: plane.leftTop, y: plane.top },
          { x: nextPlane.leftTop, y: nextPlane.top },
          { x: nextPlane.rightTop, y: nextPlane.top },
          { x: plane.rightTop, y: plane.top },
          { x: plane.rightBottom, y: plane.bottom },
          { x: plane.leftBottom, y: plane.bottom }
        ], environmentOverlay, 0.45);

        addLine(this.layer("floor"), [
          { x: plane.leftBottom, y: plane.bottom }, { x: nextPlane.leftBottom, y: nextPlane.bottom },
          { x: nextPlane.rightBottom, y: nextPlane.bottom }, { x: plane.rightBottom, y: plane.bottom }
        ], { color: gridColor, width: 1.4, alpha: 0.9 });
        addLine(this.layer("floor"), [
          { x: plane.leftTop, y: plane.top }, { x: nextPlane.leftTop, y: nextPlane.top },
          { x: nextPlane.rightTop, y: nextPlane.top }, { x: plane.rightTop, y: plane.top }
        ], { color: gridColor, width: 1.1, alpha: 0.76 });

        if (cellTopology.leftBlocked) {
          const walls = this.layer("structural-walls");
          drawProjectedSideWall(walls, plane, nextPlane, "left", background, 0.98);
          this.drawSideWallMaterial(plane, nextPlane, "left", wallColor, renderInput.floor, z);
          drawProjectedSideWall(walls, plane, nextPlane, "left", background, 0, { color: wallColor, width: 2, alpha: 0.96 });
        }
        if (cellTopology.rightBlocked) {
          const mirroredPlane = { ...plane, leftTop: plane.rightTop, rightTop: plane.leftTop, leftBottom: plane.rightBottom, rightBottom: plane.leftBottom };
          const mirroredNext = { ...nextPlane, leftTop: nextPlane.rightTop, rightTop: nextPlane.leftTop, leftBottom: nextPlane.rightBottom, rightBottom: nextPlane.leftBottom };
          const walls = this.layer("structural-walls");
          drawProjectedSideWall(walls, mirroredPlane, mirroredNext, "left", background, 0.98);
          this.drawSideWallMaterial(mirroredPlane, mirroredNext, "left", wallColor, renderInput.floor, z);
          drawProjectedSideWall(walls, mirroredPlane, mirroredNext, "left", background, 0, { color: wallColor, width: 2, alpha: 0.96 });
        }
        if (cellTopology.frontBlocked) {
          const walls = this.layer("structural-walls");
          drawProjectedFrontWall(walls, nextPlane, ceilingStyle, background, 0.98);
          this.drawFrontWallMaterial(nextPlane, wallColor, renderInput.floor, z, ceilingStyle);
          drawProjectedFrontWall(walls, nextPlane, ceilingStyle, background, 0, { color: wallColor, width: 2, alpha: 0.98 });
          if (cellTopology.frontOneWayBarrier && column === 0) this.drawOneWayBarrier(nextPlane, wallColor);
        }

        if (column === 0 && z > 0) this.drawLandmark(cell, nextPlane, renderInput.visual.wallColor);
        if (column === 0 && renderInput.roamingMonsters.some((monster) => monster.floor === renderInput.floor && monster.x === cellTopology.x && monster.y === cellTopology.y) && z > 0) {
          drawEllipse(this.layer("environment-fx"), (nextPlane.leftBottom + nextPlane.rightBottom) / 2, nextPlane.bottom - 12, width * 0.10, Math.max(4, width * 0.04), "#ff3b30", 0.12, { color: "#ff3b30", width: 2, alpha: 0.85 });
        }
      }
    }
  }

  drawFloorMaterial(plane, nextPlane, wallColor, floor, depth) {
    const material = mixColor(wallColor, "#111318", 0.58);
    const highlight = mixColor(wallColor, "#e8f7f4", 0.42);
    for (let band = 1; band <= 2; band += 1) {
      const t = band / 3;
      const y = plane.bottom + (nextPlane.bottom - plane.bottom) * t;
      const left = plane.leftBottom + (nextPlane.leftBottom - plane.leftBottom) * t;
      const right = plane.rightBottom + (nextPlane.rightBottom - plane.rightBottom) * t;
      addLine(this.layer("floor"), [{ x: left, y }, { x: right, y }], { color: material, width: 1.2, alpha: 0.48 });
    }
    const offset = seededUnit(floor * 31 + depth * 13);
    const left = plane.leftBottom + (nextPlane.leftBottom - plane.leftBottom) * (0.24 + offset * 0.12);
    const right = plane.rightBottom + (nextPlane.rightBottom - plane.rightBottom) * (0.66 + offset * 0.12);
    addLine(this.layer("floor"), [{ x: left, y: plane.bottom - 2 }, { x: right, y: nextPlane.bottom + 2 }], { color: highlight, width: 1, alpha: 0.22 });
  }

  drawSideWallMaterial(plane, nextPlane, side, wallColor, floor, depth) {
    const nearTop = side === "left" ? plane.leftTop : plane.rightTop;
    const farTop = side === "left" ? nextPlane.leftTop : nextPlane.rightTop;
    const nearBottom = side === "left" ? plane.leftBottom : plane.rightBottom;
    const farBottom = side === "left" ? nextPlane.leftBottom : nextPlane.rightBottom;
    const material = mixColor(wallColor, "#101419", 0.5);
    for (let band = 1; band <= 2; band += 1) {
      const t = band / 3;
      const top = { x: nearTop + (farTop - nearTop) * t, y: plane.top + (nextPlane.top - plane.top) * t };
      const bottom = { x: nearBottom + (farBottom - nearBottom) * t, y: plane.bottom + (nextPlane.bottom - plane.bottom) * t };
      addLine(this.layer("structural-walls"), [top, bottom], { color: material, width: 1.3, alpha: 0.42 });
    }
    if ((floor + depth) % 2 === 0) {
      addLine(this.layer("structural-walls"), [{ x: nearTop, y: plane.top + 3 }, { x: farTop, y: nextPlane.top + 3 }], { color: wallColor, width: 1, alpha: 0.26 });
    }
  }

  drawFrontWallMaterial(plane, wallColor, floor, depth, ceilingStyle) {
    const material = mixColor(wallColor, "#0b0f14", 0.48);
    for (let band = 1; band <= 2; band += 1) {
      const t = band / 3;
      const y = plane.top + (plane.bottom - plane.top) * t;
      addLine(this.layer("structural-walls"), [{ x: plane.leftTop + 3, y }, { x: plane.rightTop - 3, y }], { color: material, width: ceilingStyle === "arch" ? 1.6 : 1.2, alpha: 0.40 });
    }
    if ((floor + depth) % 2 === 0) {
      addLine(this.layer("structural-walls"), [{ x: plane.leftTop + 4, y: plane.top + 4 }, { x: plane.rightTop - 4, y: plane.top + 4 }], { color: wallColor, width: 1, alpha: 0.26 });
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
      this.layer("structural-walls").addChild(graphic);
    } else if (cell.event === EVENT_TYPES.CHEST) {
      drawRect(this.layer("actors"), cx - width * 0.14, y - width * 0.10, width * 0.28, width * 0.10, "#8a5a2b", 0.92, { color: "#ffd60a", width: 1.2 });
    } else if (cell.trap?.state === "discovered") {
      drawEllipse(this.layer("actors"), cx, y - width * 0.05, width * 0.10, width * 0.06, "#ff3b30", 0.12, { color: "#ff3b30", width: 1.4 });
    }
    if (color && cell.type === "stairs-down") addLine(this.layer("actors"), [{ x: cx, y: y - width * 0.22 }, { x: cx, y: y - width * 0.04 }], { color, width: 1, alpha: 0.55 });
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
    this.layer("environment-fx").addChild(graphic);
  }

  drawMonsters(renderInput) {
    getCombatMonsterLayout(renderInput.combatMonsters).forEach(({ monster, cx, cy, scale, slotWidth, hitRegion }) => {
      const color = getMonsterColor(monster);
      const actors = this.layer("actors");
      drawEllipse(actors, cx, cy + 28 * scale, 35 * scale, 5 * scale, "#000000", 0.58);
      const spriteType = monster.spriteType || "biter";
      if (["skeleton", "zombie", "orc", "kobold"].includes(spriteType)) {
        drawRect(actors, cx - 19 * scale, cy - 34 * scale, 38 * scale, 52 * scale, color, 0.34, { color, width: Math.max(1, 3 * scale), alpha: 0.9 });
      } else {
        drawEllipse(actors, cx, cy - 10 * scale, 25 * scale, 25 * scale, color, 0.34, { color, width: Math.max(1, 3 * scale), alpha: 0.9 });
      }
      drawEllipse(actors, cx, cy - 10 * scale, 8 * scale, 8 * scale, "#ffffff", 0.82);
      addLine(actors, [{ x: cx - 15 * scale, y: cy - 10 * scale }, { x: cx + 15 * scale, y: cy - 10 * scale }], { color: "#ffffff", width: Math.max(1, scale), alpha: 0.7 });
      const hp = Math.max(0, Math.min(1, monster.hp / Math.max(1, monster.maxHp)));
      drawRect(actors, cx - Math.min(100, slotWidth - 8) / 2, cy - 62, Math.min(100, slotWidth - 8), 5, "#ffffff", 0.12, { color: "#8e8e93", width: 1 });
      drawRect(actors, cx - Math.min(100, slotWidth - 8) / 2, cy - 62, Math.min(100, slotWidth - 8) * hp, 5, color, 0.9);
      if (getQueuedThreat(monster)) {
        const pulse = 0.48 + 0.18 * Math.sin(this.clockMs / 180);
        drawEllipse(this.layer("combat-fx"), cx, cy - 10 * scale, 31 * scale, 31 * scale, "#ffcc00", 0, { color: "#ffcc00", width: 2, alpha: pulse });
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
    this.layer("combat-fx").addChild(graphic);
  }

  drawChest() {
    const actors = this.layer("actors");
    drawRect(actors, 170, 145, 60, 40, "#6b3a00", 0.92, { color: "#ffb300", width: 2.5 });
    addLine(actors, [{ x: 170, y: 160 }, { x: 230, y: 160 }], { color: "#ffb300", width: 2 });
    drawEllipse(actors, 200, 164, 4, 4, "#ff3b30", 0.95);
  }

  drawDangerPulse(renderInput) {
    if (!renderInput.dangerCue?.active || prefersReducedMotion()) return;
    const pulse = 0.05 + 0.03 * (Math.sin(this.clockMs / 220) + 1);
    drawEllipse(this.layer("environment-fx"), 200, 174, 150, 22, "#ff3b30", pulse, { color: "#ff3b30", width: 1.3, alpha: 0.48 });
    drawEllipse(this.layer("combat-fx"), 200, 124, 42, 18, "#ff3b30", 0.035 + pulse * 0.35);
  }

  drawFloatingTexts() {
    this.damageTexts.forEach((entry) => {
      const text = new Text({
        text: entry.text,
        style: { fill: entry.color, fontFamily: "sans-serif", fontSize: 17, fontWeight: "bold", stroke: { color: "#170b0b", width: 4 } }
      });
      text.anchor.set(0.5);
      text.position.set(200, 100 - entry.age * 0.9);
      text.scale.set(1 + Math.max(0, 0.12 - entry.age * 0.008));
      text.alpha = Math.max(0, 1 - entry.age / entry.maxAge);
      this.layer("combat-fx").addChild(text);
    });
  }

  drawAtmosphere(renderInput) {
    const fx = this.layer("environment-fx");
    const color = safeColor(renderInput.visual.wallColor, "#58d6e8");
    const background = safeColor(renderInput.visual.background, FALLBACK_BACKGROUND);
    const alpha = renderInput.visual.environment?.animated ? 0.055 : 0.035;
    addPolygon(fx, [{ x: 0, y: 112 }, { x: 400, y: 112 }, { x: 400, y: 166 }, { x: 0, y: 166 }], mixColor(background, color, 0.45), alpha);
    drawEllipse(fx, 200, 108, 88, 34, color, 0.025);
    if (renderInput.visual.geometry?.ceilingStyle === "arch") {
      addLine(fx, [{ x: 106, y: 30 }, { x: 128, y: 22 }, { x: 160, y: 18 }], { color, width: 1, alpha: 0.25 });
      addLine(fx, [{ x: 240, y: 18 }, { x: 272, y: 22 }, { x: 294, y: 30 }], { color, width: 1, alpha: 0.25 });
    }
  }

  drawCombatEntry(renderInput) {
    const progress = clamp01(1 - this.combatEntryTime / 320);
    const eased = 1 - (1 - progress) ** 3;
    const fx = this.layer("combat-fx");
    const color = safeColor(renderInput.visual.wallColor, "#58d6e8");
    const radius = 46 + eased * 78;
    drawEllipse(fx, 200, 174, radius, 15, color, 0, { color, width: 2, alpha: 0.45 * (1 - eased) });
    fx.alpha = 1;
    this.layer("actors").position.y = (1 - eased) * 12;
    this.layer("actors").scale.set(0.90 + eased * 0.10);
  }

  drawHitFeedback(renderInput) {
    const progress = clamp01(this.hitTime / 220);
    const color = safeColor(renderInput.visual.wallColor, "#e8f7f4");
    const alpha = 0.10 * progress;
    drawEllipse(this.layer("combat-fx"), 200, 105, 120 - progress * 24, 72 - progress * 14, color, alpha);
  }

  dispose() {
    if (!this.app) return;
    this.clearSceneRoot(this.scene);
    this.clearSceneRoot(this.transitionScene);
    this.app.destroy({ removeView: false }, { children: true });
    this.app = null;
    this.scene = null;
    this.transitionScene = null;
    this.transition = null;
    this.supported = false;
    this.resourceStats.destroyed = true;
  }
}
