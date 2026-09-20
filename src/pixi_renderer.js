// balance-impact: none — PixiJS screen-space presentation.
// Pixi is the production-default renderer. This module consumes RendererInput
// and deliberately stays within the shared screen-space projection contract.
import { Application, Assets, Container, Graphics, Text } from "pixi.js";
import { EVENT_TYPES } from "./data.js";
import { getEnemyPresentation } from "./enemy_presentation.js";
import {
  BASE_GEOMETRY,
  CANONICAL_VIEW,
  getCombatMonsterLayout,
  getProjectionColumn,
  getProjectionPlanes,
  getProjectionProfile
} from "./rules/renderer_projection.js";
import { getRendererInput, isRendererInput } from "./state/renderer_view.js";
import { getVisibleCorridorTopology, isRenderableCorridorCell } from "./rules/renderer_topology.js";
import { renderMiniMapOverlay } from "./minimap.js";
import { getChestPropGeometry, getChestPropPalette, getChestPropStyle } from "./chest_prop.js";
import {
  getDungeonPropPalette,
  getMonumentPropGeometry,
  getSpringPropGeometry,
  getStairsPropGeometry
} from "./dungeon_prop.js";
import {
  SIMPLE_ENEMY_PROTOTYPE_MODE,
  createEnemyPrototype,
  createProceduralEnemy,
  getEnemyPrototypePresentation
} from "./pixi_enemy_prototypes.js";

// Exposed for deterministic visual-gate asset injection; production rendering
// continues to use the same Pixi Assets singleton.
export { Assets, Graphics };

export const PIXI_VIEW_W = CANONICAL_VIEW.width;
export const PIXI_VIEW_H = CANONICAL_VIEW.height;
export const PIXI_VERSION = "8.19.0";

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

function getEnemyPresentationMode() {
  if (typeof window === "undefined") return "production";
  const requested = new URLSearchParams(window.location.search).get("enemyPresentation");
  return requested === SIMPLE_ENEMY_PROTOTYPE_MODE.primitive || requested === SIMPLE_ENEMY_PROTOTYPE_MODE.simpleRich
    ? requested
    : "production";
}

/**
 * A PixiJS renderer that consumes the shared projection and topology contract.
 * Pixi is used only as a 2D drawing surface; there is no camera, FOV, eye,
 * world-space mesh, or 3D occlusion contract here.
 */
export class PixiDungeonRenderer {
  constructor(canvasId, { failurePhase = null } = {}) {
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
    this.activeRoot = null;
    this.damageTexts = [];
    this.enemyTextures = new Map();
    this.enemyAssetFailures = new Set();
    this.enemyAssetPromise = null;
    this.enemyPresentationMode = getEnemyPresentationMode();
    this.resourceStats = {
      sceneRebuilds: 0,
      maxChildren: 0,
      destroyed: false,
      layerCount: LAYER_NAMES.length,
      generatedTextureCount: 0,
      filterCount: 0,
      listenerCount: 0,
      enemyTextureCount: 0,
      enemyAssetFailureCount: 0,
      enemyPresentationCount: 0,
      enemyFallbackCount: 0
    };
    this.failurePhase = failurePhase;
    this.initializationPhase = null;
    this.viewport = getProjectionProfile(PIXI_VIEW_W, PIXI_VIEW_H);
    this.resizeObserver = null;
    this.resize();
    if (typeof ResizeObserver === "function" && this.canvas?.parentElement) {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.canvas.parentElement);
    }
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

  resize(width = null, height = null) {
    if (!this.canvas) return this.viewport;
    const rect = this.canvas.parentElement?.getBoundingClientRect?.() || this.canvas.getBoundingClientRect?.() || {};
    const next = getProjectionProfile(width || rect.width || PIXI_VIEW_W, height || rect.height || PIXI_VIEW_H);
    if (next.width === this.viewport.width && next.height === this.viewport.height) return this.viewport;
    this.viewport = next;
    this.lastSignature = null;
    this.app?.renderer?.resize(next.width, next.height);
    return this.viewport;
  }

  async init() {
    if (!this.canvas) throw new Error("Pixi dungeon canvas is unavailable");
    const startedAt = performance.now();
    this.initializationPhase = "application-create";
    if (this.failurePhase === "application-create") {
      throw new Error("Injected renderer failure: application-create");
    }
    const app = new Application();
    this.app = app;
    try {
      this.initializationPhase = "pixi/context";
      if (this.failurePhase === "pixi/context") {
        throw new Error("Injected renderer failure: pixi/context");
      }
      await app.init({
        canvas: this.canvas,
        width: this.viewport.width,
        height: this.viewport.height,
        resolution: 1,
        autoDensity: false,
        antialias: true,
        backgroundColor: 0x0c0c0e,
        autoStart: false,
        preference: "webgl"
      });
      // Production enemies are procedural Graphics recipes. There is no enemy
      // texture decode before the renderer is exposed.
      if (this.enemyPresentationMode === "production") await this.loadEnemyTextures();
      this.initializationPhase = "mount";
      this.scene = this.createSceneRoot("pixi-current-scene");
      this.app.stage.addChild(this.scene);
      this.initializationCostMs = performance.now() - startedAt;
      this.supported = Boolean(this.app.renderer && this.app.canvas === this.canvas);
      this.canvas.dataset.renderer = this.supported ? this.mode : "pixi-unavailable";
      this.initializationPhase = null;
      return this;
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  async loadEnemyTextures() {
    // Kept as an idempotent lifecycle hook for callers and historical tests.
    // No rejected WebP asset is loaded by the production renderer.
    this.enemyTextureManifest = [];
    this.enemyTextures.clear();
    this.resourceStats.enemyTextureCount = 0;
    this.resourceStats.enemyAssetFailureCount = 0;
    return Promise.resolve();
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
      ? renderInput.combatMonsters.map((monster) => [monster.name, monster.hp, monster.maxHp, monster.color, monster.spriteType, monster.isBoss, monster.isMidboss, monster.isRare, getQueuedThreat(monster)].join(",")).join(";")
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
    if (this.shakeTime > 0 || this.flashTime > 0 || this.hitTime > 0 || this.combatEntryTime > 0 || this.damageTexts.length > 0) return true;
    if (prefersReducedMotion()) return false;
    const cyclePosition = (renderInput.floor - 1) % 5;
    if (environment.animated || environment.animatedCyclePosition === cyclePosition || renderInput.dangerCue.active) return true;
    return false;
  }

  getCombatTargetAtClientPoint(clientX, clientY, input = null) {
    const renderInput = this.resolveRenderInput(input);
    if (!renderInput.combatTargetSelection?.active || !this.canvas) return null;
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const { width, height } = this.viewport;
    const scale = Math.min(rect.width / width, rect.height / height);
    const renderedWidth = width * scale;
    const renderedHeight = height * scale;
    const x = (clientX - rect.left - (rect.width - renderedWidth) / 2) / scale;
    const y = (clientY - rect.top - (rect.height - renderedHeight) / 2) / scale;
    if (x < 0 || x > width || y < 0 || y > height) return null;
    return getCombatMonsterLayout(renderInput.combatMonsters, this.viewport)
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
    // Navigation is intentionally a cut: movement state is rendered as the
    // new corridor immediately. Keep this hook for the Renderer boundary
    // used by movement.js without creating an outgoing scene or alpha tween.
    void action;
    void input;
    this.cancelNavigationTransition();
  }

  cancelNavigationTransition() {
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

  draw(input = null) {
    if (!this.app || !this.scene) return;
    const renderInput = this.resolveRenderInput(input);
    const startedAt = performance.now();
    this.clearSceneRoot(this.scene);
    this.drawScene(renderInput, this.scene);
    // Navigation is an immediate structural replacement. Combat feedback is
    // independent and cannot affect exploration navigation.
    this.resetMotion(this.scene);
    if (this.shakeTime > 0 && renderInput.view.gameState === "combat") {
      const offset = (Math.sin(this.clockMs * 0.11) * 0.5) * this.shakeIntensity;
      this.scene.position.x += offset;
      this.scene.position.y += offset * 0.45;
    }
    if (this.flashTime > 0) {
      if (renderInput.sceneVisibility.showCombat) this.drawLocalFlash(renderInput);
      else drawRect(this.layer("overlays"), 0, 0, this.viewport.width, this.viewport.height, "#ffffff", 0.24);
    }
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
    drawRect(background, 0, 0, this.viewport.width, this.viewport.height, color);
    const wallColor = safeColor(renderInput.visual.wallColor, "#58d6e8");
    for (let band = 0; band < 7; band += 1) {
      const amount = band / 6;
      const top = (band / 7) * this.viewport.height;
      const bottom = ((band + 1) / 7) * this.viewport.height;
      addPolygon(background, [
        { x: 0, y: top }, { x: this.viewport.width, y: top },
        { x: this.viewport.width, y: bottom }, { x: 0, y: bottom }
      ], mixColor(color, wallColor, 0.08 + amount * 0.08), 0.11);
    }
    this.drawEdgeAtmosphere(renderInput);
  }

  drawEdgeAtmosphere(renderInput) {
    const edge = this.viewport.edgeBlend;
    if (!edge) return;

    const { width, height } = this.viewport;
    const wallColor = safeColor(renderInput.visual.wallColor, "#58d6e8");
    const background = safeColor(renderInput.visual.background, FALLBACK_BACKGROUND);
    const wallTint = mixColor(background, wallColor, 0.58);
    const sideEnd = width * edge.sideFadeEnd;
    const topEnd = height * edge.topFadeEnd;
    const bottomStart = height * edge.bottomFadeStart;
    const sideFade = Math.max(0, edge.sideFadeEnd - edge.sideFadeStart);
    const topFade = Math.max(0, edge.topFadeEnd);
    const bottomFade = Math.max(0, 1 - edge.bottomFadeStart);

    drawRect(this.layer("background"), 0, 0, sideEnd, height, wallTint, 0.16 * sideFade / edge.sideFadeEnd);
    drawRect(this.layer("background"), width - sideEnd, 0, sideEnd, height, wallTint, 0.16 * sideFade / edge.sideFadeEnd);
    drawRect(this.layer("background"), 0, 0, width, topEnd, wallTint, 0.12 * topFade);
    drawRect(this.layer("background"), 0, bottomStart, width, height - bottomStart, wallTint, 0.12 * bottomFade);

    const vignette = edge.vignetteAlpha;
    drawRect(this.layer("background"), 0, 0, width * edge.sideFadeStart, height, 0x000000, vignette * 0.42);
    drawRect(this.layer("background"), width * (1 - edge.sideFadeStart), 0, width * edge.sideFadeStart, height, 0x000000, vignette * 0.42);
    drawRect(this.layer("background"), 0, 0, width, height * 0.04, 0x000000, vignette * 0.30);
    drawRect(this.layer("background"), 0, height * 0.96, width, height * 0.04, 0x000000, vignette * 0.30);

    const fx = this.layer("far-environment");
    for (let index = 0; index < edge.particleCount; index += 1) {
      const side = index % 2 === 0 ? 1 : -1;
      const seed = index * 37 + renderInput.floor * 11;
      const x = side > 0
        ? width * (0.02 + ((Math.sin(seed) + 1) / 2) * 0.16)
        : width * (0.82 + ((Math.sin(seed) + 1) / 2) * 0.16);
      const y = height * (0.08 + ((Math.sin(seed * 1.7) + 1) / 2) * 0.84);
      const radius = 0.7 + ((Math.sin(seed * 2.3) + 1) / 2) * 0.8;
      drawEllipse(fx, x, y, radius, radius, wallColor, 0.20);
    }
  }

  drawTownBackground(renderInput) {
    const color = safeColor(renderInput.visual.wallColor, "#00e5ff");
    const far = this.layer("far-environment");
    const walls = this.layer("structural-walls");
    const sx = this.viewport.width / PIXI_VIEW_W;
    const sy = this.viewport.height / PIXI_VIEW_H;
    const point = (x, y) => ({ x: x * sx, y: y * sy });
    addLine(far, [point(0, 180), point(80, 150), point(130, 170), point(200, 130), point(280, 165), point(340, 145), point(400, 180)], { color, alpha: 0.35, width: 1 });
    drawRect(walls, 150 * sx, 110 * sy, 10 * sx, 70 * sy, color, 0, { color, width: 2 });
    drawRect(walls, 240 * sx, 110 * sy, 10 * sx, 70 * sy, color, 0, { color, width: 2 });
    drawRect(walls, 160 * sx, 160 * sy, 80 * sx, 20 * sy, color, 0, { color, width: 2 });
    drawEllipse(walls, 200 * sx, 180 * sy, 20 * sx, 20 * sy, color, 0, { color, width: 2 });
  }

  drawFarEnvironment(renderInput) {
    const far = this.layer("far-environment");
    const color = safeColor(renderInput.visual.wallColor, "#58d6e8");
    const phase = Number(renderInput.visual.environment?.animatedCyclePosition || 0);
    const sx = this.viewport.width / PIXI_VIEW_W;
    const sy = this.viewport.height / PIXI_VIEW_H;
    for (let index = 0; index < 5; index += 1) {
      const x = (36 + seededUnit(renderInput.floor * 19 + index * 7 + phase) * 328) * sx;
      const y = (32 + seededUnit(renderInput.floor * 29 + index * 11 + phase) * 86) * sy;
      drawEllipse(far, x, y, 1.4 * sx, 1.4 * sy, color, 0.18);
    }
    addPolygon(far, [{ x: 150 * sx, y: 0 }, { x: 250 * sx, y: 0 }, { x: 224 * sx, y: 124 * sy }, { x: 176 * sx, y: 124 * sy }], color, 0.025);
  }

  drawCorridors(renderInput) {
    const map = renderInput.map;
    if (!Array.isArray(map)) return;
    const projection = getProjectionPlanes(renderInput.visual.geometry || BASE_GEOMETRY, this.viewport);
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
        // polygon follows the shared projection exactly, so side openings stay
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

        if (column === 0 && z > 0) this.drawLandmark(cell, plane, renderInput.visual.wallColor, renderInput.visual.landmarks);
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

  drawLandmark(cell, plane, color, landmarks = {}) {
    if (cell.type === "stairs-up" || cell.type === "stairs-down") {
      this.drawStairsProp(plane, cell.type === "stairs-up" ? "up" : "down", landmarks.stairsStyle, color);
    } else if (cell.event === EVENT_TYPES.CHEST) {
      this.drawChestProp(plane, getChestPropStyle(landmarks.chestStyle));
    } else if (cell.event === EVENT_TYPES.SPRING) {
      this.drawSpringProp(plane, color);
    } else if (cell.event === EVENT_TYPES.TABLET) {
      this.drawMonumentProp(plane, color);
    } else if (cell.trap?.state === "discovered") {
      const cx = (plane.leftBottom + plane.rightBottom) / 2;
      const width = Math.max(8, plane.rightBottom - plane.leftBottom);
      const y = plane.bottom - width * 0.12;
      drawEllipse(this.layer("actors"), cx, y - width * 0.05, width * 0.10, width * 0.06, "#ff3b30", 0.12, { color: "#ff3b30", width: 1.4 });
    }
  }

  drawSpringProp(plane, wallColor) {
    const geometry = getSpringPropGeometry(plane);
    const palette = getDungeonPropPalette("spring", wallColor);
    const actors = this.layer("actors");
    const polygon = (points, fill, stroke = palette.highlight, width = Math.max(1, geometry.width * 0.016)) => {
      addPolygon(actors, points, fill, 1, { color: stroke, width });
    };
    drawEllipse(actors, geometry.shadow.x, geometry.shadow.y, geometry.shadow.radiusX, geometry.shadow.radiusY, palette.shadow, 0.40);
    drawEllipse(actors, geometry.centerX, geometry.basin.y, geometry.basin.radiusX * 1.10, geometry.basin.radiusY * 1.45, palette.water, 0.045);
    polygon(geometry.pedestal, palette.pedestal, palette.basin);
    polygon(geometry.fountain, palette.pedestal, palette.highlight);
    drawEllipse(actors, geometry.fountainDrop.x, geometry.fountainDrop.y, geometry.fountainDrop.radiusX, geometry.fountainDrop.radiusY, palette.water, 0.92, { color: palette.highlight, width: Math.max(1, geometry.width * 0.012) });
    drawEllipse(actors, geometry.basin.x, geometry.basin.y, geometry.basin.radiusX, geometry.basin.radiusY, palette.basin, 1, { color: palette.highlight, width: Math.max(1, geometry.width * 0.018) });
    drawEllipse(actors, geometry.water.x, geometry.water.y, geometry.water.radiusX, geometry.water.radiusY, palette.water, 0.90, { color: palette.highlight, width: Math.max(1, geometry.width * 0.012) });
    addLine(actors, [{ x: geometry.rim.left, y: geometry.rim.y }, { x: geometry.rim.right, y: geometry.rim.y }], { color: palette.highlight, width: Math.max(1, geometry.width * 0.014), alpha: 0.84 });
    addLine(actors, [{ x: geometry.centerX - geometry.width * 0.18, y: geometry.water.y }, { x: geometry.centerX + geometry.width * 0.08, y: geometry.water.y - geometry.width * 0.015 }], { color: palette.highlight, width: Math.max(1, geometry.width * 0.012), alpha: 0.85 });
  }

  drawMonumentProp(plane, wallColor) {
    const geometry = getMonumentPropGeometry(plane);
    const palette = getDungeonPropPalette("monument", wallColor);
    const actors = this.layer("actors");
    const polygon = (points, fill, stroke = palette.inscription, width = Math.max(1, geometry.width * 0.016)) => {
      addPolygon(actors, points, fill, 1, { color: stroke, width });
    };
    drawEllipse(actors, geometry.shadow.x, geometry.shadow.y, geometry.shadow.radiusX, geometry.shadow.radiusY, palette.shadow, 0.42);
    polygon(geometry.plinth, palette.plinth, palette.stone);
    polygon(geometry.side, palette.side, palette.side);
    polygon(geometry.face, palette.stone);
    geometry.inscriptionLines.forEach(line => addLine(actors, [
      { x: line.left, y: line.y },
      { x: line.right, y: line.y }
    ], { color: palette.inscription, width: Math.max(1, geometry.width * 0.012), alpha: 0.82 }));
  }

  drawStairsProp(plane, direction, style, wallColor) {
    const geometry = getStairsPropGeometry(plane, direction, style);
    const palette = getDungeonPropPalette("stairs", wallColor, direction);
    const actors = this.layer("actors");
    drawEllipse(actors, geometry.shadow.x, geometry.shadow.y, geometry.shadow.radiusX, geometry.shadow.radiusY, palette.shadow, 0.44);
    addPolygon(actors, geometry.well, palette.well, 1, { color: palette.edge, width: Math.max(1, geometry.width * 0.014) });
    geometry.steps.forEach((step, index) => {
      addPolygon(actors, step.points, palette.stone, 1, { color: palette.edge, width: Math.max(1, geometry.width * 0.014) });
      addLine(actors, [{ x: step.left, y: step.y }, { x: step.right, y: step.y }], { color: palette.edge, width: Math.max(1, geometry.width * 0.016), alpha: 0.92 - index * 0.06 });
    });
    addLine(actors, [
      { x: geometry.steps[0].left, y: geometry.steps[0].y },
      { x: geometry.steps.at(-1).left, y: geometry.steps.at(-1).y - geometry.steps.at(-1).depth }
    ], { color: palette.edge, width: Math.max(1, geometry.width * 0.012), alpha: 0.72 });
    addLine(actors, [
      { x: geometry.steps[0].right, y: geometry.steps[0].y },
      { x: geometry.steps.at(-1).right, y: geometry.steps.at(-1).y - geometry.steps.at(-1).depth }
    ], { color: palette.edge, width: Math.max(1, geometry.width * 0.012), alpha: 0.72 });
  }

  drawChestProp(plane, style) {
    const geometry = getChestPropGeometry(plane, style);
    const palette = getChestPropPalette(style);
    const actors = this.layer("actors");
    const polygon = (points, fill, stroke = palette.outline, width = Math.max(1, geometry.width * 0.018)) => {
      addPolygon(actors, points, fill, 1, { color: stroke, width });
    };

    drawEllipse(actors, geometry.shadow.x, geometry.shadow.y, geometry.shadow.radiusX, geometry.shadow.radiusY, "#000000", 0.38);
    drawEllipse(actors, geometry.centerX, geometry.bodyY + geometry.bodyHeight * 0.42, geometry.width * 0.58, geometry.bodyHeight * 0.78, palette.glow, 0.055);
    polygon(geometry.body, palette.body);
    polygon(geometry.side, "#241a19");
    polygon(geometry.lid, palette.lid);
    drawRect(actors, geometry.band.x, geometry.band.y, geometry.band.width, geometry.band.height, palette.metal, 1, { color: palette.outline, width: Math.max(1, geometry.width * 0.014) });
    geometry.feet.forEach(foot => drawRect(actors, foot.x, foot.y, foot.width, foot.height, "#171116", 1));
    drawRect(actors, geometry.lock.x, geometry.lock.y, geometry.lock.width, geometry.lock.height, palette.metal, 1, { color: palette.outline, width: Math.max(1, geometry.width * 0.014) });
    drawEllipse(actors, geometry.keyhole.x, geometry.keyhole.y, geometry.keyhole.radius, geometry.keyhole.radius, "#21151a", 1);

    const marks = geometry.marks;
    if (palette.mark === "cross") {
      addLine(actors, [{ x: marks.left, y: marks.top }, { x: marks.right, y: marks.bottom }], { color: palette.outline, width: Math.max(1, geometry.width * 0.012) });
      addLine(actors, [{ x: marks.right, y: marks.top }, { x: marks.left, y: marks.bottom }], { color: palette.outline, width: Math.max(1, geometry.width * 0.012) });
    } else if (palette.mark === "runes") {
      addLine(actors, [{ x: marks.left, y: marks.top }, { x: marks.left, y: marks.bottom }], { color: palette.outline, width: Math.max(1, geometry.width * 0.012) });
      addLine(actors, [{ x: marks.right, y: marks.top }, { x: marks.right, y: marks.bottom }], { color: palette.outline, width: Math.max(1, geometry.width * 0.012) });
    } else if (palette.mark === "rivets") {
      drawEllipse(actors, marks.left, marks.top, Math.max(1, geometry.width * 0.024), Math.max(1, geometry.width * 0.024), palette.metal, 1);
      drawEllipse(actors, marks.right, marks.top, Math.max(1, geometry.width * 0.024), Math.max(1, geometry.width * 0.024), palette.metal, 1);
    }
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
    getCombatMonsterLayout(renderInput.combatMonsters, this.viewport).forEach(({ monster, cx, cy, scale, slotWidth, hitRegion, row, column }) => {
      const color = getMonsterColor(monster);
      const actors = this.layer("actors");
      const presentation = this.enemyPresentationMode === "production"
        ? getEnemyPresentation(monster)
        : getEnemyPrototypePresentation(monster);
      const floorY = cy + 30 * scale;
      const visualScale = Math.min(
        scale * presentation.scale,
        (floorY * 0.94) / presentation.maxHeight,
        (slotWidth * 0.82) / presentation.maxWidth
      );
      const hpY = Math.max(18, floorY - presentation.height * visualScale - 5);
      drawEllipse(actors, cx, floorY, Math.min(42, presentation.width * visualScale * 0.42), 5.5 * scale, "#05070a", 0.66);
      if (this.enemyPresentationMode === "production") {
        this.drawProceduralEnemy(actors, presentation, cx, floorY, visualScale, color, row, column);
      } else {
        this.drawEnemyPrototype(actors, monster, cx, floorY, visualScale, color, row, column, this.enemyPresentationMode);
      }
      const hp = Math.max(0, Math.min(1, monster.hp / Math.max(1, monster.maxHp)));
      drawRect(actors, cx - Math.min(100, slotWidth - 8) / 2, hpY, Math.min(100, slotWidth - 8), 5, "#ffffff", 0.12, { color: "#8e8e93", width: 1 });
      drawRect(actors, cx - Math.min(100, slotWidth - 8) / 2, hpY, Math.min(100, slotWidth - 8) * hp, 5, color, 0.9);
      const enemyLabel = new Text({
        text: monster.name,
        style: { fill: 0xffffff, fontFamily: "monospace", fontSize: 11, fontWeight: "bold", stroke: { color: 0x081016, width: 3 } }
      });
      enemyLabel.anchor.set(0.5, 1);
      enemyLabel.position.set(cx, hpY - 3);
      enemyLabel.scale.set(Math.min(1, Math.max(0.64, slotWidth / 120)));
      actors.addChild(enemyLabel);
      if (getQueuedThreat(monster)) {
        const pulse = 0.48 + 0.18 * Math.sin(this.clockMs / 180);
        drawEllipse(this.layer("combat-fx"), cx, cy - 10 * scale, 31 * scale, 31 * scale, "#ffcc00", 0, { color: "#ffcc00", width: 2, alpha: pulse });
      }
      if (renderInput.combatTargetSelection?.active) this.drawTargetMarker(hitRegion, cx, cy, scale, color);
    });
  }

  drawEnemyPrototype(actors, monster, cx, floorY, visualScale, color, row, column, mode) {
    const billboard = new Container();
    billboard.label = `enemy-${mode}-${row}-${column}`;
    billboard.position.set(cx, floorY);
    billboard.zIndex = row * 100 + column;
    const prototype = createEnemyPrototype(mode, monster, visualScale, parseColor(color));
    billboard.addChild(prototype);
    actors.addChild(billboard);
    this.resourceStats.enemyPresentationCount += 1;
  }

  drawProceduralEnemy(actors, presentation, cx, floorY, visualScale, color, row, column) {
    const billboard = new Container();
    billboard.label = `enemy-procedural-${presentation.recipe}-${row}-${column}`;
    billboard.position.set(cx, floorY);
    billboard.zIndex = row * 100 + column;
    billboard.addChild(createProceduralEnemy(presentation.recipe, visualScale, parseColor(color)));
    actors.addChild(billboard);
    this.resourceStats.enemyPresentationCount += 1;
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

  drawLocalFlash(renderInput) {
    const progress = clamp01(this.flashTime / 200);
    getCombatMonsterLayout(renderInput.combatMonsters, this.viewport).forEach(({ cx, cy, scale }) => {
      drawEllipse(this.layer("combat-fx"), cx, cy - 20 * scale, 28 * scale, 48 * scale, "#fff4dc", 0.05 + progress * 0.11);
    });
  }

  drawChest(renderInput) {
    const projection = getProjectionPlanes(renderInput.visual.geometry || BASE_GEOMETRY, this.viewport);
    const plane = getProjectionColumn(projection, 1);
    this.drawChestProp(plane, getChestPropStyle(renderInput.visual.landmarks?.chestStyle));
  }

  drawDangerPulse(renderInput) {
    if (!renderInput.dangerCue?.active || prefersReducedMotion()) return;
    const pulse = 0.05 + 0.03 * (Math.sin(this.clockMs / 220) + 1);
    const sx = this.viewport.width / PIXI_VIEW_W;
    const sy = this.viewport.height / PIXI_VIEW_H;
    drawEllipse(this.layer("environment-fx"), 200 * sx, 174 * sy, 150 * sx, 22 * sy, "#ff3b30", pulse, { color: "#ff3b30", width: 1.3, alpha: 0.48 });
    drawEllipse(this.layer("combat-fx"), 200 * sx, 124 * sy, 42 * sx, 18 * sy, "#ff3b30", 0.035 + pulse * 0.35);
  }

  drawFloatingTexts() {
    this.damageTexts.forEach((entry) => {
      const text = new Text({
        text: entry.text,
        style: { fill: entry.color, fontFamily: "sans-serif", fontSize: 17, fontWeight: "bold", stroke: { color: "#170b0b", width: 4 } }
      });
      text.anchor.set(0.5);
      text.position.set(this.viewport.width / 2, this.viewport.height * 0.38 - entry.age * this.viewport.height / 260 * 0.9);
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
    const sx = this.viewport.width / PIXI_VIEW_W;
    const sy = this.viewport.height / PIXI_VIEW_H;
    addPolygon(fx, [{ x: 0, y: 112 * sy }, { x: this.viewport.width, y: 112 * sy }, { x: this.viewport.width, y: 166 * sy }, { x: 0, y: 166 * sy }], mixColor(background, color, 0.45), alpha);
    drawEllipse(fx, this.viewport.width / 2, 108 * sy, 88 * sx, 34 * sy, color, 0.025);
    if (renderInput.visual.geometry?.ceilingStyle === "arch") {
      addLine(fx, [{ x: 106 * sx, y: 30 * sy }, { x: 128 * sx, y: 22 * sy }, { x: 160 * sx, y: 18 * sy }], { color, width: 1, alpha: 0.25 });
      addLine(fx, [{ x: 240 * sx, y: 18 * sy }, { x: 272 * sx, y: 22 * sy }, { x: 294 * sx, y: 30 * sy }], { color, width: 1, alpha: 0.25 });
    }
  }

  drawCombatEntry(renderInput) {
    const progress = clamp01(1 - this.combatEntryTime / 320);
    const eased = 1 - (1 - progress) ** 3;
    const fx = this.layer("combat-fx");
    const color = safeColor(renderInput.visual.wallColor, "#58d6e8");
    const radius = 46 + eased * 78;
    drawEllipse(fx, this.viewport.width / 2, this.viewport.height * 0.67, radius * this.viewport.width / PIXI_VIEW_W, 15 * this.viewport.height / PIXI_VIEW_H, color, 0, { color, width: 2, alpha: 0.45 * (1 - eased) });
    fx.alpha = 1;
    this.layer("actors").position.y = (1 - eased) * 12;
    this.layer("actors").scale.set(0.90 + eased * 0.10);
  }

  drawHitFeedback(renderInput) {
    const progress = clamp01(this.hitTime / 220);
    const color = safeColor(renderInput.visual.wallColor, "#e8f7f4");
    const alpha = 0.12 * progress;
    getCombatMonsterLayout(renderInput.combatMonsters, this.viewport).forEach(({ cx, cy, scale }) => {
      drawEllipse(this.layer("combat-fx"), cx, cy - 20 * scale, 24 * scale + progress * 8, 42 * scale + progress * 12, color, alpha);
      addLine(this.layer("combat-fx"), [
        { x: cx - 17 * scale, y: cy - 18 * scale },
        { x: cx - 26 * scale, y: cy - 26 * scale }
      ], { color: "#fff4dc", width: Math.max(1, scale * 2), alpha: alpha + 0.12 });
    });
  }

  dispose() {
    this.resizeObserver?.disconnect?.();
    this.resizeObserver = null;
    if (!this.app) {
      this.resourceStats.destroyed = true;
      return;
    }
    this.clearSceneRoot(this.scene);
    try {
      this.app.destroy({ removeView: false }, { children: true });
    } catch {
      // Initialization can fail before Pixi has a renderer. The app reference
      // is still cleared so a failed init cannot retain a ticker or stale scene.
    }
    this.app = null;
    this.scene = null;
    this.supported = false;
    this.resourceStats.destroyed = true;
  }
}
