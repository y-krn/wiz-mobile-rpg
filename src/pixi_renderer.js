// balance-impact: none — PixiJS screen-space presentation.
// Pixi is the production-default renderer. This module consumes RendererInput
// and deliberately stays within the shared screen-space projection contract.
import { Application, Assets, Container, Graphics, PerspectiveMesh, Text } from "pixi.js";
import { EVENT_TYPES } from "./data.js";
import { getEnemyPresentation } from "./enemy_presentation.js";
import {
  BASE_GEOMETRY,
  CANONICAL_VIEW,
  getCombatMonsterLayout,
  getProjectionColumn,
  getProjectionPlanes,
  getProjectionProfile,
  getWorldObjectProjection
} from "./rules/renderer_projection.js";
import { getRendererInput, isRendererInput } from "./state/renderer_view.js";
import { getVisibleCorridorTopology, isRenderableCorridorCell, isVisibleWorldObjectCell } from "./rules/renderer_topology.js";
import { renderMiniMapOverlay } from "./minimap.js";
import { getChestPropGeometry, getChestPropPalette, getChestPropStyle } from "./chest_prop.js";
import {
  getDungeonPropPalette,
  getSpringPropGeometry,
  getStairsPropGeometry
} from "./dungeon_prop.js";
import {
  SIMPLE_ENEMY_PROTOTYPE_MODE,
  createEnemyPrototype,
  createProceduralEnemy,
  getEnemyPrototypePresentation
} from "./pixi_enemy_prototypes.js";
import { createPixelSurfaceTextures, getDepthFog, getPixelScenePalette } from "./pixi_pixel_art.js";

// Exposed for deterministic visual-gate asset injection; production rendering
// continues to use the same Pixi Assets singleton.
export { Assets, Graphics };

export const PIXI_VIEW_W = CANONICAL_VIEW.width;
export const PIXI_VIEW_H = CANONICAL_VIEW.height;
export const PIXI_VERSION = "8.19.0";

const COLUMN_ORDER = [-2, 2, -1, 1, 0];
const LAYER_NAMES = Object.freeze([
  "background",
  "far-environment",
  "floor",
  "world-objects",
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

// Corners are clockwise from top-left. PerspectiveMesh keeps the nearest
// filtered pixel texture stable under the shared screen-space projection.
function addTexturedQuad(container, texture, corners, tint = 0xffffff) {
  const [topLeft, topRight, bottomRight, bottomLeft] = corners;
  const mesh = new PerspectiveMesh({
    texture,
    verticesX: 6,
    verticesY: 6,
    x0: topLeft.x, y0: topLeft.y,
    x1: topRight.x, y1: topRight.y,
    x2: bottomRight.x, y2: bottomRight.y,
    x3: bottomLeft.x, y3: bottomLeft.y
  });
  mesh.tint = tint;
  container.addChild(mesh);
  return mesh;
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
    this.scenePalette = null;
    this.pixelSurfaces = new Map();
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
      enemyFallbackCount: 0,
      pixelSurfaceTextureCount: 0
    };
    this.failurePhase = failurePhase;
    this.initializationPhase = null;
    this.viewport = getProjectionProfile(PIXI_VIEW_W, PIXI_VIEW_H);
    this.resizeObserver = null;
    this.resize();
    if (typeof ResizeObserver === "function" && this.canvas?.parentElement) {
      this.resizeObserver = new ResizeObserver(() => {
        const previous = this.viewport;
        this.resize();
        // Resizing a WebGL canvas clears its backing store; repaint the
        // current scene so static screens (town) never stay blank.
        if (this.viewport !== previous && this.app && this.scene) this.draw();
      });
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
        antialias: false,
        backgroundColor: 0xf6efe2,
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

  getScenePalette(renderInput) {
    const wallColor = safeColor(renderInput.visual.wallColor, "#58d6e8");
    if (this.scenePalette?.accent !== wallColor) this.scenePalette = getPixelScenePalette(wallColor);
    return this.scenePalette;
  }

  getPixelSurfaces(palette) {
    let surfaces = this.pixelSurfaces.get(palette.accent);
    if (!surfaces) {
      surfaces = createPixelSurfaceTextures(palette);
      this.pixelSurfaces.set(palette.accent, surfaces);
      this.resourceStats.pixelSurfaceTextureCount = this.pixelSurfaces.size * 3;
    }
    return surfaces;
  }

  getHorizonY(renderInput) {
    const projection = getProjectionPlanes(renderInput.visual.geometry || BASE_GEOMETRY, this.viewport);
    const far = projection.yt.length - 1;
    const horizon = (projection.yt[far] + projection.yb[far]) / 2;
    return Number.isFinite(horizon) ? horizon : this.viewport.height * 0.46;
  }

  drawBackground(renderInput) {
    const background = this.layer("background");
    const { width, height } = this.viewport;
    const palette = this.getScenePalette(renderInput);
    const horizon = renderInput.sceneVisibility?.showTownBackground ? height * 0.5 : this.getHorizonY(renderInput);
    drawRect(background, 0, 0, width, height, palette.fog);
    // Posterized bands read as pixel-art gradients: sky above, ground below.
    const bands = 6;
    for (let band = 0; band < bands; band += 1) {
      const t = band / bands;
      const top = horizon * t;
      const bottom = horizon * (t + 1 / bands) + 1;
      drawRect(background, 0, top, width, bottom - top, mixColor(palette.skyTop, palette.skyBottom, t), 1);
      const groundTop = horizon + (height - horizon) * t;
      const groundBottom = horizon + (height - horizon) * (t + 1 / bands) + 1;
      drawRect(background, 0, groundTop, width, groundBottom - groundTop, mixColor(palette.groundTop, palette.groundBottom, t), 1);
    }
    this.drawEdgeAtmosphere(renderInput);
  }

  drawEdgeAtmosphere(renderInput) {
    const edge = this.viewport.edgeBlend;
    if (!edge) return;

    const { width, height } = this.viewport;
    const palette = this.getScenePalette(renderInput);
    const sideEnd = width * edge.sideFadeEnd;
    const sideFade = Math.max(0, edge.sideFadeEnd - edge.sideFadeStart);
    drawRect(this.layer("background"), 0, 0, sideEnd, height, palette.wall.base, 0.22 * sideFade / edge.sideFadeEnd);
    drawRect(this.layer("background"), width - sideEnd, 0, sideEnd, height, palette.wall.base, 0.22 * sideFade / edge.sideFadeEnd);

    const fx = this.layer("far-environment");
    for (let index = 0; index < edge.particleCount; index += 1) {
      const side = index % 2 === 0 ? 1 : -1;
      const seed = index * 37 + renderInput.floor * 11;
      const x = side > 0
        ? width * (0.02 + ((Math.sin(seed) + 1) / 2) * 0.16)
        : width * (0.82 + ((Math.sin(seed) + 1) / 2) * 0.16);
      const y = height * (0.08 + ((Math.sin(seed * 1.7) + 1) / 2) * 0.84);
      const size = 2 + Math.round(((Math.sin(seed * 2.3) + 1) / 2) * 2);
      drawRect(fx, Math.round(x), Math.round(y), size, size, "#ffffff", 0.7);
    }
  }

  drawTownBackground(renderInput) {
    const palette = this.getScenePalette(renderInput);
    const far = this.layer("far-environment");
    const walls = this.layer("structural-walls");
    const { width, height } = this.viewport;
    const horizon = height * 0.5;
    const px = Math.max(3, Math.round(width / 130));
    const snap = (value) => Math.round(value / px) * px;
    // Pixel clouds
    [[0.16, 0.16, 7], [0.64, 0.1, 9], [0.86, 0.26, 5]].forEach(([cx, cy, cells]) => {
      for (let index = 0; index < cells; index += 1) {
        const x = snap(width * cx + (index - cells / 2) * px * 2);
        const lift = index > 0 && index < cells - 1 ? px : 0;
        drawRect(far, x, snap(height * cy) - lift, px * 2, px * 2 + lift, "#ffffff", 0.9);
      }
    });
    // Rolling hills in stepped rows
    const hill = mixColor(palette.groundTop, "#8fc79a", 0.55);
    for (let x = 0; x < width; x += px * 2) {
      const rise = Math.round((Math.sin(x / width * Math.PI * 2.4) + 1) * 3) * px;
      drawRect(far, x, horizon - rise - px * 3, px * 2, rise + px * 3, hill, 1);
    }
    // Cobbled plaza: stepped rows that widen toward the viewer.
    const cobble = mixColor(palette.groundTop, "#ffffff", 0.35);
    const cobbleDark = mixColor(palette.groundBottom, palette.ink, 0.12);
    for (let row = 0; row < 7; row += 1) {
      const y = snap(horizon + px * 2 + row * row * px * 0.9 + row * px * 3);
      if (y > height) break;
      const tile = px * (2 + row);
      for (let x = (row % 2) * tile / 2; x < width; x += tile * 1.5) {
        drawRect(far, snap(x), y, snap(tile), px, row % 2 ? cobble : cobbleDark, 0.55);
      }
    }
    // Trees and flower patches between houses
    [0.4, 0.6].forEach((cx) => {
      const x = snap(width * cx);
      drawRect(far, x - px, snap(horizon - px * 5), px * 2, px * 5, "#8a5a44", 1);
      drawRect(far, x - px * 4, snap(horizon - px * 11), px * 8, px * 6, "#5fae6e", 1, { color: palette.ink, width: 2 });
      drawRect(far, x - px * 2, snap(horizon - px * 13), px * 4, px * 2, "#7cc68a", 1);
    });
    [[0.14, "#f08aa0"], [0.3, "#f6c85f"], [0.7, "#9b8cf0"], [0.86, "#f08aa0"]].forEach(([cx, color], index) => {
      const y = snap(horizon + height * (0.2 + (index % 2) * 0.12));
      for (let petal = 0; petal < 3; petal += 1) {
        drawRect(far, snap(width * cx + petal * px * 3), y - (petal % 2) * px, px * 2, px * 2, color, 1);
        drawRect(far, snap(width * cx + petal * px * 3), y + px * 2 - (petal % 2) * px, px * 2, px, "#5fae6e", 1);
      }
    });
    // Houses along the horizon
    const houses = [0.08, 0.24, 0.72, 0.88];
    houses.forEach((cx, index) => {
      const w = snap(width * 0.12);
      const h = snap(height * (0.13 + (index % 2) * 0.04));
      const x = snap(width * cx - w / 2);
      const y = snap(horizon - h);
      const roof = ["#e07a5f", "#6d9dc5", "#e0a458", "#9c89b8"][index];
      drawRect(walls, x, y, w, h, "#fbf1dc", 1, { color: palette.ink, width: 2 });
      addPolygon(walls, [{ x: x - px, y }, { x: x + w / 2, y: y - px * 5 }, { x: x + w + px, y }], roof, 1, { color: palette.ink, width: 2 });
      drawRect(walls, snap(x + w / 2 - px), y + h - px * 4, px * 2, px * 4, "#8a5a44", 1);
      drawRect(walls, x + px, y + px * 2, px * 2, px * 2, "#9fd8e6", 1, { color: palette.ink, width: 1 });
    });
    // Central fountain in the plaza
    const cx = width / 2;
    const basinY = snap(horizon + height * 0.1);
    const basinW = snap(width * 0.34);
    drawEllipse(walls, cx, basinY + px * 2, basinW / 2 + px, px * 4, palette.ink, 0.12);
    drawRect(walls, snap(cx - basinW / 2), basinY - px * 4, basinW, px * 5, "#d8d2c4", 1, { color: palette.ink, width: 2 });
    drawRect(walls, snap(cx - basinW / 2) + px, basinY - px * 3, basinW - px * 2, px * 2, "#7cc6de", 1);
    drawRect(walls, snap(cx - px * 2), basinY - px * 12, px * 4, px * 8, "#d8d2c4", 1, { color: palette.ink, width: 2 });
    drawRect(walls, snap(cx - px), basinY - px * 16, px * 2, px * 4, "#9fd8e6", 1);
    drawRect(walls, snap(cx - px * 4), basinY - px * 15, px * 2, px * 2, "#bfe6f0", 0.9);
    drawRect(walls, snap(cx + px * 2), basinY - px * 15, px * 2, px * 2, "#bfe6f0", 0.9);
  }

  drawFarEnvironment(renderInput) {
    const far = this.layer("far-environment");
    const phase = Number(renderInput.visual.environment?.animatedCyclePosition || 0);
    const sx = this.viewport.width / PIXI_VIEW_W;
    const sy = this.viewport.height / PIXI_VIEW_H;
    for (let index = 0; index < 5; index += 1) {
      const x = (36 + seededUnit(renderInput.floor * 19 + index * 7 + phase) * 328) * sx;
      const y = (32 + seededUnit(renderInput.floor * 29 + index * 11 + phase) * 86) * sy;
      drawRect(far, Math.round(x), Math.round(y), 2, 2, "#ffffff", 0.75);
    }
  }

  drawCorridors(renderInput) {
    const map = renderInput.map;
    if (!Array.isArray(map)) return;
    const projection = getProjectionPlanes(renderInput.visual.geometry || BASE_GEOMETRY, this.viewport);
    const topology = new Map(getVisibleCorridorTopology(map, renderInput.x, renderInput.y, renderInput.dir)
      .map((cell) => [`${cell.z}:${cell.column}`, cell]));
    const palette = this.getScenePalette(renderInput);
    const surfaces = this.getPixelSurfaces(palette);
    const wallColor = palette.accent;
    const ceilingStyle = renderInput.visual.geometry?.ceilingStyle || "flat";
    const floorLayer = this.layer("floor");
    const walls = this.layer("structural-walls");
    const edgeStroke = (alpha) => ({ color: palette.ink, width: 2, alpha });

    for (let z = 3; z >= 0; z -= 1) {
      const width = projection.xr[z] - projection.xl[z];
      const nearFog = getDepthFog(z);
      const farFog = getDepthFog(z + 1);
      const spanFog = (nearFog + farFog) / 2;
      for (const column of COLUMN_ORDER) {
        if (Math.abs(column) === 2 && z < 2) continue;
        const cellTopology = topology.get(`${z}:${column}`);
        if (!cellTopology) continue;
        const plane = getProjectionColumn(projection, z, column);
        const nextPlane = getProjectionColumn(projection, z + 1, column);
        const row = map[cellTopology.y];
        const cell = row?.[cellTopology.x];
        if (!isRenderableCorridorCell(cell)) {
          drawProjectedFrontWall(walls, plane, ceilingStyle, "#0c0c0e", 1, { color: "#ff3b30", width: 2 });
          continue;
        }

        // Walkable floor and ceiling follow the shared projection exactly, so
        // side openings stay floor, not panels or decorative markers.
        const floorCorners = [
          { x: nextPlane.leftBottom, y: nextPlane.bottom },
          { x: nextPlane.rightBottom, y: nextPlane.bottom },
          { x: plane.rightBottom, y: plane.bottom },
          { x: plane.leftBottom, y: plane.bottom }
        ];
        addTexturedQuad(floorLayer, surfaces.floor, floorCorners);
        addPolygon(floorLayer, floorCorners, palette.fog, spanFog);
        const ceilingCorners = [
          { x: plane.leftTop, y: plane.top },
          { x: plane.rightTop, y: plane.top },
          { x: nextPlane.rightTop, y: nextPlane.top },
          { x: nextPlane.leftTop, y: nextPlane.top }
        ];
        addTexturedQuad(floorLayer, surfaces.ceiling, ceilingCorners);
        addPolygon(floorLayer, ceilingCorners, palette.fog, spanFog);
        addLine(floorLayer, [floorCorners[3], floorCorners[0], floorCorners[1], floorCorners[2]], edgeStroke(0.22));

        if (isVisibleWorldObjectCell(cellTopology)) {
          const objectPlane = getWorldObjectProjection(projection, z, column);
          this.drawLandmark(cell, objectPlane, renderInput.visual.wallColor, renderInput.visual.landmarks);
        }

        if (cellTopology.leftBlocked) this.drawSideWall(plane, nextPlane, "left", palette, surfaces, spanFog);
        if (cellTopology.rightBlocked) {
          const mirroredPlane = { ...plane, leftTop: plane.rightTop, rightTop: plane.leftTop, leftBottom: plane.rightBottom, rightBottom: plane.leftBottom };
          const mirroredNext = { ...nextPlane, leftTop: nextPlane.rightTop, rightTop: nextPlane.leftTop, leftBottom: nextPlane.rightBottom, rightBottom: nextPlane.leftBottom };
          this.drawSideWall(mirroredPlane, mirroredNext, "right", palette, surfaces, spanFog);
        }
        if (cellTopology.frontBlocked) {
          this.drawFrontWall(nextPlane, ceilingStyle, palette, surfaces, farFog);
          if (cellTopology.frontOneWayBarrier && column === 0) this.drawOneWayBarrier(nextPlane, wallColor);
        }

        if (column === 0 && renderInput.roamingMonsters.some((monster) => monster.floor === renderInput.floor && monster.x === cellTopology.x && monster.y === cellTopology.y) && z > 0) {
          drawEllipse(this.layer("environment-fx"), (nextPlane.leftBottom + nextPlane.rightBottom) / 2, nextPlane.bottom - 12, width * 0.10, Math.max(4, width * 0.04), "#ff3b30", 0.12, { color: "#ff3b30", width: 2, alpha: 0.85 });
        }
      }
    }
  }

  drawSideWall(plane, nextPlane, side, palette, surfaces, fog) {
    const walls = this.layer("structural-walls");
    const near = { top: { x: plane.leftTop, y: plane.top }, bottom: { x: plane.leftBottom, y: plane.bottom } };
    const far = { top: { x: nextPlane.leftTop, y: nextPlane.top }, bottom: { x: nextPlane.leftBottom, y: nextPlane.bottom } };
    const corners = [near.top, far.top, far.bottom, near.bottom];
    // Soft key light from the upper left keeps both walls readable in a
    // bright palette without introducing dark voids.
    addTexturedQuad(walls, surfaces.wall, corners, side === "left" ? 0xf4f0f6 : 0xe4dfea);
    addPolygon(walls, corners, palette.fog, fog);
    addLine(walls, [near.top, far.top], { color: palette.accent, width: 2.5, alpha: 1 });
    addLine(walls, [near.bottom, far.bottom], { color: palette.ink, width: 2, alpha: 0.5 });
    addLine(walls, [far.top, far.bottom], { color: palette.ink, width: 2, alpha: 0.42 });
  }

  drawFrontWall(plane, ceilingStyle, palette, surfaces, fog) {
    const walls = this.layer("structural-walls");
    const corners = [
      { x: plane.leftTop, y: plane.top },
      { x: plane.rightTop, y: plane.top },
      { x: plane.rightBottom, y: plane.bottom },
      { x: plane.leftBottom, y: plane.bottom }
    ];
    if (ceilingStyle === "arch") drawProjectedFrontWall(walls, plane, ceilingStyle, palette.wall.base, 1);
    addTexturedQuad(walls, surfaces.wall, corners);
    if (ceilingStyle === "arch") drawProjectedFrontWall(walls, plane, ceilingStyle, palette.fog, fog);
    else addPolygon(walls, corners, palette.fog, fog);
    drawProjectedFrontWall(walls, plane, ceilingStyle, palette.fog, 0, { color: palette.ink, width: 2, alpha: 0.5 });
    addLine(walls, [corners[0], corners[1]], { color: palette.accent, width: 2.5, alpha: 1 });
  }

  drawLandmark(cell, plane, color, landmarks = {}) {
    if (cell.type === "stairs-up" || cell.type === "stairs-down") {
      this.drawStairsProp(plane, cell.type === "stairs-up" ? "up" : "down", landmarks.stairsStyle, color);
    } else if (cell.event === EVENT_TYPES.CHEST) {
      this.drawChestProp(plane, getChestPropStyle(landmarks.chestStyle));
    } else if (cell.event === EVENT_TYPES.SPRING) {
      this.drawSpringProp(plane, color);
    } else if (cell.trap?.state === "discovered") {
      const cx = (plane.leftBottom + plane.rightBottom) / 2;
      const width = Math.max(8, plane.rightBottom - plane.leftBottom);
      const y = plane.bottom - width * 0.12;
      drawEllipse(this.layer("world-objects"), cx, y - width * 0.05, width * 0.10, width * 0.06, "#ff3b30", 0.12, { color: "#ff3b30", width: 1.4 });
    }
  }

  drawSpringProp(plane, wallColor) {
    const geometry = getSpringPropGeometry(plane);
    const palette = getDungeonPropPalette("spring", wallColor);
    const worldObjects = this.layer("world-objects");
    const polygon = (points, fill, stroke = palette.highlight, width = Math.max(1, geometry.width * 0.016)) => {
      addPolygon(worldObjects, points, fill, 1, { color: stroke, width });
    };
    drawEllipse(worldObjects, geometry.shadow.x, geometry.shadow.y, geometry.shadow.radiusX, geometry.shadow.radiusY, palette.shadow, 0.40);
    drawEllipse(worldObjects, geometry.centerX, geometry.basin.y, geometry.basin.radiusX * 1.10, geometry.basin.radiusY * 1.45, palette.water, 0.045);
    polygon(geometry.pedestal, palette.pedestal, palette.basin);
    polygon(geometry.fountain, palette.pedestal, palette.highlight);
    drawEllipse(worldObjects, geometry.fountainDrop.x, geometry.fountainDrop.y, geometry.fountainDrop.radiusX, geometry.fountainDrop.radiusY, palette.water, 0.92, { color: palette.highlight, width: Math.max(1, geometry.width * 0.012) });
    drawEllipse(worldObjects, geometry.basin.x, geometry.basin.y, geometry.basin.radiusX, geometry.basin.radiusY, palette.basin, 1, { color: palette.highlight, width: Math.max(1, geometry.width * 0.018) });
    drawEllipse(worldObjects, geometry.water.x, geometry.water.y, geometry.water.radiusX, geometry.water.radiusY, palette.water, 0.90, { color: palette.highlight, width: Math.max(1, geometry.width * 0.012) });
    addLine(worldObjects, [{ x: geometry.rim.left, y: geometry.rim.y }, { x: geometry.rim.right, y: geometry.rim.y }], { color: palette.highlight, width: Math.max(1, geometry.width * 0.014), alpha: 0.84 });
    addLine(worldObjects, [{ x: geometry.centerX - geometry.width * 0.18, y: geometry.water.y }, { x: geometry.centerX + geometry.width * 0.08, y: geometry.water.y - geometry.width * 0.015 }], { color: palette.highlight, width: Math.max(1, geometry.width * 0.012), alpha: 0.85 });
  }

  drawStairsProp(plane, direction, style, wallColor) {
    const geometry = getStairsPropGeometry(plane, direction, style);
    const palette = getDungeonPropPalette("stairs", wallColor, direction);
    const worldObjects = this.layer("world-objects");
    drawEllipse(worldObjects, geometry.shadow.x, geometry.shadow.y, geometry.shadow.radiusX, geometry.shadow.radiusY, palette.shadow, 0.44);
    addPolygon(worldObjects, geometry.well, palette.well, 1, { color: palette.edge, width: Math.max(1, geometry.width * 0.014) });
    geometry.steps.forEach((step, index) => {
      addPolygon(worldObjects, step.points, palette.stone, 1, { color: palette.edge, width: Math.max(1, geometry.width * 0.014) });
      addLine(worldObjects, [{ x: step.left, y: step.y }, { x: step.right, y: step.y }], { color: palette.edge, width: Math.max(1, geometry.width * 0.016), alpha: 0.92 - index * 0.06 });
    });
    addLine(worldObjects, [
      { x: geometry.steps[0].left, y: geometry.steps[0].y },
      { x: geometry.steps.at(-1).left, y: geometry.steps.at(-1).y - geometry.steps.at(-1).depth }
    ], { color: palette.edge, width: Math.max(1, geometry.width * 0.012), alpha: 0.72 });
    addLine(worldObjects, [
      { x: geometry.steps[0].right, y: geometry.steps[0].y },
      { x: geometry.steps.at(-1).right, y: geometry.steps.at(-1).y - geometry.steps.at(-1).depth }
    ], { color: palette.edge, width: Math.max(1, geometry.width * 0.012), alpha: 0.72 });
  }

  drawChestProp(plane, style) {
    const geometry = getChestPropGeometry(plane, style);
    const palette = getChestPropPalette(style);
    const worldObjects = this.layer("world-objects");
    const polygon = (points, fill, stroke = palette.outline, width = Math.max(1, geometry.width * 0.018)) => {
      addPolygon(worldObjects, points, fill, 1, { color: stroke, width });
    };

    drawEllipse(worldObjects, geometry.shadow.x, geometry.shadow.y, geometry.shadow.radiusX, geometry.shadow.radiusY, "#2e2640", 0.26);
    drawEllipse(worldObjects, geometry.centerX, geometry.bodyY + geometry.bodyHeight * 0.42, geometry.width * 0.58, geometry.bodyHeight * 0.78, palette.glow, 0.055);
    polygon(geometry.body, palette.body);
    polygon(geometry.side, "#241a19");
    polygon(geometry.lid, palette.lid);
    drawRect(worldObjects, geometry.band.x, geometry.band.y, geometry.band.width, geometry.band.height, palette.metal, 1, { color: palette.outline, width: Math.max(1, geometry.width * 0.014) });
    geometry.feet.forEach(foot => drawRect(worldObjects, foot.x, foot.y, foot.width, foot.height, "#171116", 1));
    drawRect(worldObjects, geometry.lock.x, geometry.lock.y, geometry.lock.width, geometry.lock.height, palette.metal, 1, { color: palette.outline, width: Math.max(1, geometry.width * 0.014) });
    drawEllipse(worldObjects, geometry.keyhole.x, geometry.keyhole.y, geometry.keyhole.radius, geometry.keyhole.radius, "#21151a", 1);

    const marks = geometry.marks;
    if (palette.mark === "cross") {
      addLine(worldObjects, [{ x: marks.left, y: marks.top }, { x: marks.right, y: marks.bottom }], { color: palette.outline, width: Math.max(1, geometry.width * 0.012) });
      addLine(worldObjects, [{ x: marks.right, y: marks.top }, { x: marks.left, y: marks.bottom }], { color: palette.outline, width: Math.max(1, geometry.width * 0.012) });
    } else if (palette.mark === "runes") {
      addLine(worldObjects, [{ x: marks.left, y: marks.top }, { x: marks.left, y: marks.bottom }], { color: palette.outline, width: Math.max(1, geometry.width * 0.012) });
      addLine(worldObjects, [{ x: marks.right, y: marks.top }, { x: marks.right, y: marks.bottom }], { color: palette.outline, width: Math.max(1, geometry.width * 0.012) });
    } else if (palette.mark === "rivets") {
      drawEllipse(worldObjects, marks.left, marks.top, Math.max(1, geometry.width * 0.024), Math.max(1, geometry.width * 0.024), palette.metal, 1);
      drawEllipse(worldObjects, marks.right, marks.top, Math.max(1, geometry.width * 0.024), Math.max(1, geometry.width * 0.024), palette.metal, 1);
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
      drawEllipse(actors, cx, floorY, Math.min(42, presentation.width * visualScale * 0.42), 5.5 * scale, "#2e2640", 0.28);
      if (this.enemyPresentationMode === "production") {
        this.drawProceduralEnemy(actors, presentation, cx, floorY, visualScale, color, row, column);
      } else {
        this.drawEnemyPrototype(actors, monster, cx, floorY, visualScale, color, row, column, this.enemyPresentationMode);
      }
      const hp = Math.max(0, Math.min(1, monster.hp / Math.max(1, monster.maxHp)));
      drawRect(actors, cx - Math.min(100, slotWidth - 8) / 2, hpY, Math.min(100, slotWidth - 8), 5, "#2e2640", 0.55, { color: "#2e2640", width: 1.5 });
      drawRect(actors, cx - Math.min(100, slotWidth - 8) / 2, hpY, Math.min(100, slotWidth - 8) * hp, 5, color, 0.9);
      const enemyLabel = new Text({
        text: monster.name,
        style: { fill: 0xffffff, fontFamily: "DotGothic16, monospace", fontSize: 12, stroke: { color: 0x2e2640, width: 4 } }
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
    const plane = getWorldObjectProjection(projection, 1);
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
        style: { fill: entry.color, fontFamily: "DotGothic16, sans-serif", fontSize: 20, stroke: { color: "#2e2640", width: 5 } }
      });
      text.anchor.set(0.5);
      text.position.set(this.viewport.width / 2, this.viewport.height * 0.38 - entry.age * this.viewport.height / 260 * 0.9);
      text.scale.set(1 + Math.max(0, 0.12 - entry.age * 0.008));
      text.alpha = Math.max(0, 1 - entry.age / entry.maxAge);
      this.layer("combat-fx").addChild(text);
    });
  }

  drawAtmosphere(renderInput) {
    if (renderInput.sceneVisibility?.showTownBackground) return;
    const fx = this.layer("environment-fx");
    const palette = this.getScenePalette(renderInput);
    const alpha = renderInput.visual.environment?.animated ? 0.16 : 0.1;
    const horizon = this.getHorizonY(renderInput);
    const band = this.viewport.height * 0.06;
    drawRect(fx, 0, horizon - band, this.viewport.width, band * 2, palette.fog, alpha);
    // Light shafts: stepped translucent columns keep the pixel-art cadence.
    const sx = this.viewport.width / PIXI_VIEW_W;
    [0.34, 0.58].forEach((position, index) => {
      const x = Math.round(this.viewport.width * position);
      addPolygon(fx, [
        { x, y: 0 }, { x: x + 26 * sx, y: 0 },
        { x: x + (46 + index * 8) * sx, y: horizon }, { x: x + (18 + index * 8) * sx, y: horizon }
      ], "#ffffff", 0.07);
    });
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

  destroyPixelSurfaces() {
    this.pixelSurfaces.forEach((surfaces) => Object.values(surfaces).forEach((texture) => texture.destroy(true)));
    this.pixelSurfaces.clear();
    this.resourceStats.pixelSurfaceTextureCount = 0;
  }

  dispose() {
    this.resizeObserver?.disconnect?.();
    this.resizeObserver = null;
    if (!this.app) {
      this.resourceStats.destroyed = true;
      return;
    }
    this.clearSceneRoot(this.scene);
    this.destroyPixelSurfaces();
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
