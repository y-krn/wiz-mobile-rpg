// balance-impact: none — optional Dungeon View presentation only; no game rules or state mutation.
import {
  AmbientLight,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  Fog,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Raycaster,
  RingGeometry,
  Scene,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  BoxGeometry,
  WebGLRenderer
} from "three";
import { getRendererInput, isRendererInput } from "./state/renderer_view.js";
import { getVisibleCorridorTopology } from "./rules/renderer_topology.js";
import { isMiniMapAnimating, renderMiniMapOverlay } from "./minimap.js";

const VIEW_W = 400;
const VIEW_H = 260;
const THREE_CORRIDOR_BASE = Object.freeze({
  cellWidth: 1.9,
  cellDepth: 2.1,
  wallHeight: 3.2,
  startZ: 1.15,
  fov: 88,
  eyeOffsetZ: 0,
  lookAtHeight: 1.5,
  lookAtZ: -2.6,
  fogNear: 4.8,
  fogFar: 15.5
});
// The player stands inside the current cell, looking through its front
// threshold. Keeping the eye point inside the cell makes its side walls read
// as corridor boundaries instead of freestanding panels behind the player.
// The eye point remains inside the current cell for every biome profile.
// Combat and danger overlays live in front of the current cell's front wall.
// Keeping these layers camera-side makes them visible and raycastable in closed
// rooms.
const COMBAT_MONSTER_RADIUS = 0.30;
const COMBAT_TRIO_MONSTER_RADIUS = 0.27;
const COMBAT_MULTI_LABEL_WIDTH = 0.82;
const COMBAT_MULTI_LABEL_ROW_STEP = 0.25;
const COMBAT_TARGET_RING_RADIUS = 0.32;
const COMBAT_TRIO_MARKER_RADIUS = 0.23;
// Keep the hit region larger than the visible body without letting adjacent
// enemies become one giant target. The canvas renderer has the same intent.
const TARGET_HIT_RADIUS = 0.88;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getCeilingStyle(value) {
  return value === "arch" ? "arch" : "flat";
}

// Biome geometry is authored as a normalized visual signature shared with
// the Canvas renderer. Keep the conversion here so Three.js has its own
// readable world-unit contract instead of treating Canvas projection values
// as physical dimensions.
export function getThreeCorridorProfile(geometry = {}) {
  const corridorWidth = finite(geometry?.corridorWidth, 1);
  const ceilingHeight = finite(geometry?.ceilingHeight, 1);
  const wallLean = clamp(finite(geometry?.wallLean, 0), -0.2, 0.2);
  const wallHeight = THREE_CORRIDOR_BASE.wallHeight * clamp(0.70 + ceilingHeight * 0.30, 0.86, 1.18);
  const cellWidth = THREE_CORRIDOR_BASE.cellWidth * clamp(0.70 + corridorWidth * 0.30, 0.88, 1.12);
  const eyeHeight = clamp(wallHeight * 0.485, 1.45, 1.64);
  const frontWallZ = THREE_CORRIDOR_BASE.startZ - THREE_CORRIDOR_BASE.cellDepth / 2;
  return Object.freeze({
    cellWidth,
    cellDepth: THREE_CORRIDOR_BASE.cellDepth,
    wallHeight,
    startZ: THREE_CORRIDOR_BASE.startZ,
    frontWallZ,
    fov: THREE_CORRIDOR_BASE.fov,
    eyeHeight,
    eyeZ: THREE_CORRIDOR_BASE.startZ + THREE_CORRIDOR_BASE.eyeOffsetZ,
    // Keep a stable first-person eye point while aiming through the near
    // threshold. This keeps real neighboring floors inside the mobile frame;
    // the branch itself still comes from the adjacent cell geometry.
    lookAtHeight: clamp(eyeHeight - 0.55, 0.95, 1.15),
    lookAtZ: -0.6,
    fogNear: THREE_CORRIDOR_BASE.fogNear,
    fogFar: THREE_CORRIDOR_BASE.fogFar,
    wallLean,
    ceilingStyle: getCeilingStyle(geometry?.ceilingStyle)
  });
}

// These metrics intentionally describe the same camera/framing contract used
// by the renderer. They are lightweight fixture evidence, not gameplay data.
export function getThreeCorridorReadabilityMetrics(geometry = {}) {
  const profile = getThreeCorridorProfile(geometry);
  const horizontalFov = 2 * Math.atan(Math.tan((profile.fov * Math.PI / 180) / 2) * (VIEW_W / VIEW_H));
  const pixelsPerWorldUnit = VIEW_W / (2 * Math.tan(horizontalFov / 2));
  const cellFrontDistances = [1, 2, 3].map((z) =>
    profile.eyeZ - (profile.startZ - (z + 0.5) * profile.cellDepth)
  );
  const forwardOpeningWidth = cellFrontDistances.map((distance) =>
    profile.cellWidth * pixelsPerWorldUnit / distance
  );
  const currentOpeningWidth = profile.cellWidth * pixelsPerWorldUnit /
    (profile.eyeZ - profile.frontWallZ);
  return Object.freeze({
    fov: profile.fov,
    fogNear: profile.fogNear,
    fogFar: profile.fogFar,
    forwardOpeningWidth,
    currentCellSideWallOccupancy: 1 - clamp(currentOpeningWidth / VIEW_W, 0, 1),
    cellFrontDistances,
    profile: {
      cellWidth: profile.cellWidth,
      wallHeight: profile.wallHeight,
      wallLean: profile.wallLean,
      ceilingStyle: profile.ceilingStyle
    }
  });
}

export function createWallGeometry(width, height, lean = 0, leanNormal = false, leanSpan = width, normalDirection = 1) {
  const geometry = new PlaneGeometry(width, height);
  const positions = geometry.attributes.position;
  const edgeShift = lean * leanSpan * 0.5;
  for (let index = 0; index < positions.count; index++) {
    const edgeDirection = positions.getY(index) > 0 ? 1 : -1;
    if (leanNormal) {
      // Side walls are rotated around Y, so local Z is the world-space
      // corridor-normal axis. The caller supplies the wall's local normal
      // direction so positive lean brings the top inward on both sides.
      positions.setZ(index, edgeDirection * edgeShift * normalDirection);
      continue;
    }
    // Front walls use local X as the corridor-width axis. Positive lean
    // narrows the top edge and widens the bottom edge symmetrically.
    const towardCenter = positions.getX(index) < 0 ? 1 : -1;
    positions.setX(index, positions.getX(index) + edgeDirection * towardCenter * edgeShift);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

// Project the actual mesh vertices through the active camera. This is used by
// visual regression fixtures so screen-space claims remain tied to geometry,
// rather than to a world-unit proxy.
export function getThreeProjectedBounds(mesh, camera) {
  if (!mesh?.geometry?.attributes?.position || !camera) return null;
  mesh.updateWorldMatrix(true, false);
  camera.updateMatrixWorld();
  const point = new Vector3();
  const positions = mesh.geometry.attributes.position;
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  for (let index = 0; index < positions.count; index++) {
    point.set(positions.getX(index), positions.getY(index), positions.getZ(index));
    point.applyMatrix4(mesh.matrixWorld).project(camera);
    const screenX = (point.x + 1) * VIEW_W / 2;
    const screenY = (1 - point.y) * VIEW_H / 2;
    left = Math.min(left, screenX);
    right = Math.max(right, screenX);
    top = Math.min(top, screenY);
    bottom = Math.max(bottom, screenY);
  }
  return Object.freeze({
    left,
    right,
    top,
    bottom,
    width: right - left,
    height: bottom - top,
    visibleWidth: Math.max(0, Math.min(right, VIEW_W) - Math.max(left, 0)),
    visibleHeight: Math.max(0, Math.min(bottom, VIEW_H) - Math.max(top, 0)),
  });
}

function createCeilingGeometry(width, depth, height, style) {
  if (style !== "arch") return new PlaneGeometry(width, depth);

  const xSegments = 6;
  const zSegments = 2;
  const archRise = Math.min(0.42, height * 0.13);
  const vertices = [];
  const indices = [];
  for (let z = 0; z <= zSegments; z++) {
    const localZ = -depth / 2 + (depth * z) / zSegments;
    for (let x = 0; x <= xSegments; x++) {
      const localX = -width / 2 + (width * x) / xSegments;
      const normalizedX = localX / (width / 2);
      const localY = height + archRise * (1 - normalizedX * normalizedX);
      vertices.push(localX, localY, localZ);
    }
  }
  const rowSize = xSegments + 1;
  for (let z = 0; z < zSegments; z++) {
    for (let x = 0; x < xSegments; x++) {
      const topLeft = z * rowSize + x;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + rowSize;
      const bottomRight = bottomLeft + 1;
      indices.push(topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function finite(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function hexColor(value, fallback = "#0c0c0e") {
  try {
    return new Color(value || fallback);
  } catch {
    return new Color(fallback);
  }
}

function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.filter(Boolean).forEach((material) => {
      material.map?.dispose();
      material.alphaMap?.dispose();
      material.dispose();
    });
  });
}

function getSceneInput(input) {
  if (isRendererInput(input)) return input;
  const current = getRendererInput();
  return input && typeof input === "object"
    ? Object.freeze({ ...current, sceneVisibility: input })
    : current;
}

function getLivingMonsters(input) {
  return input.combatMonsters.filter((monster) => monster && monster.hp > 0);
}

function makeLabelTexture(text, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 48;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = "bold 20px sans-serif";
  context.textAlign = "center";
  context.fillStyle = "rgba(5, 8, 10, 0.82)";
  context.fillRect(4, 4, canvas.width - 8, canvas.height - 8);
  context.strokeStyle = color;
  context.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
  context.fillStyle = "#f5f1e8";
  context.fillText(text.slice(0, 16), canvas.width / 2, 31);
  return new CanvasTexture(canvas);
}

function makeOneWayTexture(color) {
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 160;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = `#${color.getHexString()}`;
  context.globalAlpha = 0.92;
  context.lineWidth = 10;
  context.lineCap = "square";
  for (let y = 18; y < canvas.height; y += 42) {
    context.beginPath();
    context.moveTo(26, y - 12);
    context.lineTo(48, y);
    context.lineTo(26, y + 12);
    context.moveTo(72, y - 12);
    context.lineTo(94, y);
    context.lineTo(72, y + 12);
    context.moveTo(118, y - 12);
    context.lineTo(140, y);
    context.lineTo(118, y + 12);
    context.stroke();
  }
  return new CanvasTexture(canvas);
}

export class ThreeDungeonRenderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.mode = "three";
    this.supported = false;
    this.supportsDirectTargetSelection = false;
    this.shakeTime = 0;
    this.shakeIntensity = 0;
    this.flashTime = 0;
    this.damageTexts = [];
    this.lastSignature = null;
    this.targetHitMeshes = [];
    this.sceneSignature = null;
    this.feedbackOverlay = null;
    this.activeProfile = getThreeCorridorProfile();

    if (!this.canvas) return;

    try {
      this.webgl = new WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        powerPreference: "low-power",
        preserveDrawingBuffer: false
      });
      this.webgl.setPixelRatio(1);
      this.webgl.setSize(VIEW_W, VIEW_H, false);
      this.webgl.outputColorSpace = "srgb";
      this.scene = new Scene();
      const profile = this.activeProfile;
      this.camera = new PerspectiveCamera(profile.fov, VIEW_W / VIEW_H, 0.05, 40);
      this.camera.position.set(0, profile.eyeHeight, profile.eyeZ);
      this.camera.lookAt(0, profile.lookAtHeight, profile.lookAtZ);
      this.root = new Group();
      this.scene.add(this.root);
      this.raycaster = new Raycaster();
      this.pointer = new Vector2();
      this.supported = true;
      this.supportsDirectTargetSelection = true;
      this.canvas.dataset.renderer = "three";
      this.canvas.dataset.targetHitArea = "expanded";
    } catch (error) {
      this.mode = "three-unavailable";
      this.error = error;
    }
  }

  triggerShake(intensity = 10, duration = 300) {
    this.shakeTime = duration;
    this.shakeIntensity = intensity;
  }

  triggerFlash(duration = 200) {
    this.flashTime = duration;
  }

  addDamageText(text, color = "#ff3b30") {
    this.damageTexts.push({ text, color, age: 0, maxAge: 40 });
    if (!this.feedbackOverlay) {
      this.feedbackOverlay = document.createElement("div");
      this.feedbackOverlay.className = "three-feedback-overlay";
      document.getElementById("viewport-panel")?.appendChild(this.feedbackOverlay);
    }
    const element = document.createElement("span");
    element.textContent = text;
    element.style.color = color;
    this.feedbackOverlay.appendChild(element);
    setTimeout(() => element.remove(), 700);
  }

  update(dt) {
    if (this.shakeTime > 0) this.shakeTime -= dt;
    if (this.flashTime > 0) this.flashTime -= dt;
    this.damageTexts.forEach((text) => { text.age += 1; });
    this.damageTexts = this.damageTexts.filter((text) => text.age < text.maxAge);
  }

  resolveRenderInput(input) {
    return getSceneInput(input);
  }

  getRenderInput() {
    return getRendererInput();
  }

  getSceneVisibility(input = null) {
    return this.resolveRenderInput(input).sceneVisibility;
  }

  getSceneTopology(input = null) {
    const renderInput = this.resolveRenderInput(input);
    return getVisibleCorridorTopology(renderInput.map, renderInput.x, renderInput.y, renderInput.dir);
  }

  getDrawSignature(input = null) {
    const renderInput = this.resolveRenderInput(input);
    const { view, sceneVisibility } = renderInput;
    const corridorTopology = this.getSceneTopology(renderInput).map((cell) => [
      cell.z,
      cell.column,
      cell.x,
      cell.y,
      cell.valid,
      cell.leftBlocked,
      cell.rightBlocked,
      cell.frontBlocked,
      cell.frontOneWayBarrier,
      cell.backBlocked,
      cell.leftOneWayBarrier,
      cell.rightOneWayBarrier,
      cell.backOneWayBarrier
    ]);
    return JSON.stringify({
      gameState: view.gameState,
      menuType: view.menuType,
      floor: renderInput.floor,
      position: [renderInput.x, renderInput.y, renderInput.dir],
      mapRevision: renderInput.mapRevision,
      geometry: renderInput.visual.geometry,
      corridorTopology,
      sceneVisibility,
      light: [renderInput.lightTurns, renderInput.lightPower],
      danger: renderInput.dangerCue?.active === true,
      monsters: renderInput.combatMonsters.map((monster) => [monster.name, monster.hp, monster.maxHp, monster.color]),
      targets: renderInput.combatTargetSelection?.active === true
    });
  }

  isAnimating(input = null) {
    const renderInput = this.resolveRenderInput(input);
    return this.shakeTime > 0 || this.flashTime > 0 || this.damageTexts.length > 0 ||
      renderInput.visual.environment.animated || isMiniMapAnimating(renderInput);
  }

  getCombatTargetAtClientPoint(clientX, clientY, input = null) {
    const renderInput = this.resolveRenderInput(input);
    if (!renderInput.combatTargetSelection?.active || this.targetHitMeshes.length === 0) return null;
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const scale = Math.min(rect.width / VIEW_W, rect.height / VIEW_H);
    const renderedWidth = VIEW_W * scale;
    const renderedHeight = VIEW_H * scale;
    const x = (clientX - rect.left - (rect.width - renderedWidth) / 2) / scale;
    const y = (clientY - rect.top - (rect.height - renderedHeight) / 2) / scale;
    if (x < 0 || x > VIEW_W || y < 0 || y > VIEW_H) return null;
    this.pointer.x = (x / VIEW_W) * 2 - 1;
    this.pointer.y = -(y / VIEW_H) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.targetHitMeshes, false);
    const candidates = [];
    const seenTargets = new Set();
    for (const hit of hits) {
      const targetIdx = hit.object.userData.targetIdx;
      if (!Number.isInteger(targetIdx) || seenTargets.has(targetIdx)) continue;
      seenTargets.add(targetIdx);
      const center = hit.object.position.clone().project(this.camera);
      candidates.push({
        targetIdx,
        screenDistance: Math.hypot(center.x - this.pointer.x, center.y - this.pointer.y),
        rayDistance: hit.distance,
      });
    }
    candidates.sort((a, b) => a.screenDistance - b.screenDistance || a.rayDistance - b.rayDistance);
    return candidates[0]?.targetIdx ?? null;
  }

  draw(input = null) {
    if (!this.supported) return;
    const renderInput = this.resolveRenderInput(input);
    const signature = this.getDrawSignature(renderInput);
    if (signature !== this.sceneSignature) {
      this.buildScene(renderInput);
      this.sceneSignature = signature;
    }

    const shakeX = this.shakeTime > 0 ? (Math.random() - 0.5) * this.shakeIntensity * 0.012 : 0;
    const shakeY = this.shakeTime > 0 ? (Math.random() - 0.5) * this.shakeIntensity * 0.008 : 0;
    const profile = this.activeProfile;
    // Combat uses its own centered staging depth; exploration stays closer to
    // the current cell's front threshold so real side passages enter the view.
    const eyeZ = renderInput.sceneVisibility.showCombat
      ? THREE_CORRIDOR_BASE.startZ + 0.4
      : profile.eyeZ;
    this.camera.fov = profile.fov;
    this.camera.updateProjectionMatrix();
    this.camera.position.x = shakeX;
    this.camera.position.y = profile.eyeHeight + shakeY;
    this.camera.position.z = eyeZ;
    this.camera.lookAt(0, profile.lookAtHeight, profile.lookAtZ);
    this.flashLight.intensity = this.flashTime > 0 ? 1.4 : 0;
    this.webgl.render(this.scene, this.camera);
    renderMiniMapOverlay(renderInput);
  }

  buildScene(input) {
    this.targetHitMeshes = [];
    while (this.root.children.length > 0) {
      const child = this.root.children.pop();
      disposeObject(child);
    }

    const visual = input.visual;
    const profile = getThreeCorridorProfile(visual.geometry);
    this.activeProfile = profile;
    const background = hexColor(visual.background);
    const wall = hexColor(visual.wallColor, "#58d6e8");
    const topology = this.getSceneTopology(input);
    this.scene.background = background;
    this.scene.fog = new Fog(background, profile.fogNear, profile.fogFar);
    this.webgl.setClearColor(background, 1);

    this.root.add(new AmbientLight(0x8e9aa0, 0.62));
    const keyLight = new DirectionalLight(wall, 0.65);
    keyLight.position.set(-2, 5, 4);
    this.root.add(keyLight);
    this.flashLight = new PointLight(0xffffff, 0, 8);
    this.flashLight.position.set(0, 1.4, 2);
    this.root.add(this.flashLight);

    // Keep the route one tonal step above the enclosure. This preserves the
    // Dark Archive mood while making the floor, wall, and ceiling separable
    // without relying on a wireframe or a fullscreen glow.
    const floorColor = background.clone().lerp(wall, 0.55);
    const wallSurfaceColor = background.clone().lerp(wall, 0.09);
    const floorMaterial = new MeshStandardMaterial({
      color: floorColor,
      roughness: 0.96,
      metalness: 0.06,
      emissive: floorColor,
      emissiveIntensity: 0.12,
      side: DoubleSide
    });
    const wallMaterial = new MeshStandardMaterial({
      color: wallSurfaceColor,
      roughness: 0.78,
      metalness: 0.28,
      emissive: wall,
      emissiveIntensity: 0.04,
      side: DoubleSide
    });
    if (!input.sceneVisibility.showTownBackground) {
      try {
        this.addCorridorTopology(topology, floorMaterial, wallMaterial, wall, profile);
      } finally {
        // Corridor meshes own clones of these prototype materials. The
        // prototypes themselves are never attached to the scene graph.
        floorMaterial.dispose();
        wallMaterial.dispose();
      }
    } else {
      // Town/result scenes do not use corridor materials at all.
      floorMaterial.dispose();
      wallMaterial.dispose();
    }

    const lightTurns = finite(input.lightTurns, 0);
    if (lightTurns > 0 || input.lightPower > 0) {
      const light = new PointLight(wall, Math.min(1.5, 0.35 + finite(input.lightPower, 0) * 0.03), 7);
      light.position.set(0, 1.8, 1.5);
      this.root.add(light);
    }

    if (input.dangerCue?.active) this.addDangerCue(wall, profile);
    if (input.sceneVisibility.showCombat) this.addCombatMonsters(input, wall, profile);
    if (input.sceneVisibility.showTownBackground) this.addTownMarker(wall);
  }

  addCorridorTopology(topology, floorMaterial, wallMaterial, wall = wallMaterial.emissive, profile = this.activeProfile) {
    topology.forEach((cell) => {
      const cellGroup = new Group();
      cellGroup.userData = {
        topology: { z: cell.z, column: cell.column, x: cell.x, y: cell.y },
        valid: cell.valid,
        geometry: {
          cellWidth: profile.cellWidth,
          wallHeight: profile.wallHeight,
          wallLean: profile.wallLean,
          ceilingStyle: profile.ceilingStyle
        }
      };
      this.root.add(cellGroup);

      const centerX = cell.column * profile.cellWidth;
      const centerZ = profile.startZ - cell.z * profile.cellDepth;
      const sideBranch = cell.column < 0 ? "left" : cell.column > 0 ? "right" : "forward";
      const rotationY = sideBranch === "left" ? Math.PI / 2 : sideBranch === "right" ? -Math.PI / 2 : 0;
      const toWorld = (localX, localZ) => ({
        x: centerX + Math.cos(rotationY) * localX + Math.sin(rotationY) * localZ,
        z: centerZ - Math.sin(rotationY) * localX + Math.cos(rotationY) * localZ,
      });
      const frame = sideBranch === "left"
        ? {
          leftBlocked: cell.backBlocked,
          rightBlocked: cell.frontBlocked,
          frontBlocked: cell.leftBlocked,
          frontOneWayBarrier: cell.leftOneWayBarrier,
        }
        : sideBranch === "right"
          ? {
            leftBlocked: cell.frontBlocked,
            rightBlocked: cell.backBlocked,
            frontBlocked: cell.rightBlocked,
            frontOneWayBarrier: cell.rightOneWayBarrier,
          }
          : {
            leftBlocked: cell.leftBlocked,
            rightBlocked: cell.rightBlocked,
            frontBlocked: cell.frontBlocked,
            frontOneWayBarrier: cell.frontOneWayBarrier,
          };
      const front = toWorld(0, -profile.cellDepth / 2);
      if (!cell.valid) {
        this.addCorridorWall(cellGroup, createWallGeometry(profile.cellWidth, profile.wallHeight, profile.wallLean), wallMaterial, {
          x: front.x,
          y: profile.wallHeight / 2,
          z: front.z
        }, "front-wall-invalid", cell, rotationY);
        return;
      }

      const depthShade = 1 - Math.min(0.12, cell.z * 0.04);
      const floorSurface = floorMaterial.clone();
      floorSurface.color.multiplyScalar(depthShade);
      const floor = new Mesh(new PlaneGeometry(profile.cellWidth, profile.cellDepth), floorSurface);
      floor.rotation.set(-Math.PI / 2, rotationY, 0);
      floor.position.set(centerX, 0, centerZ);
      floor.userData = { surface: "floor", topology: cellGroup.userData.topology };
      cellGroup.add(floor);

      const ceilingSurface = floorMaterial.clone();
      ceilingSurface.color.multiplyScalar(Math.max(0.52, depthShade * 0.62));
      ceilingSurface.emissive.multiplyScalar(0.42);
      ceilingSurface.emissiveIntensity = 0.04;
      const ceiling = new Mesh(
        createCeilingGeometry(profile.cellWidth, profile.cellDepth, profile.wallHeight, profile.ceilingStyle),
        ceilingSurface
      );
      if (profile.ceilingStyle === "flat") ceiling.rotation.x = Math.PI / 2;
      ceiling.rotation.y = rotationY;
      ceiling.position.set(centerX, profile.ceilingStyle === "flat" ? profile.wallHeight : 0, centerZ);
      ceiling.userData = { surface: "ceiling", topology: cellGroup.userData.topology };
      cellGroup.add(ceiling);

      // A low-contrast threshold seam makes cell depth legible without
      // turning the corridor into a neon wireframe.
      this.addDepthSeam(cellGroup, profile, wall, cell, toWorld, rotationY, depthShade);

      // An open side edge still has physical wall thickness at its two
      // corners. Keep only those structural jambs; the adjacent cell owns the
      // actual floor, ceiling, and walls of the passage.
      if (cell.column === 0) {
        if (!frame.leftBlocked) this.addSideBranchJambs(cellGroup, -1, wallMaterial, cell, profile, toWorld);
        if (!frame.rightBlocked) this.addSideBranchJambs(cellGroup, 1, wallMaterial, cell, profile, toWorld);
      }

      if (frame.leftBlocked) {
        const left = toWorld(-profile.cellWidth / 2, 0);
        this.addCorridorWall(cellGroup, createWallGeometry(profile.cellDepth, profile.wallHeight, profile.wallLean, true, profile.cellWidth), wallMaterial, {
          x: left.x,
          y: profile.wallHeight / 2,
          z: left.z
        }, "left-wall", cell, rotationY + Math.PI / 2);
      }
      if (frame.rightBlocked) {
        const right = toWorld(profile.cellWidth / 2, 0);
        this.addCorridorWall(cellGroup, createWallGeometry(profile.cellDepth, profile.wallHeight, profile.wallLean, true, profile.cellWidth), wallMaterial, {
          x: right.x,
          y: profile.wallHeight / 2,
          z: right.z
        }, "right-wall", cell, rotationY - Math.PI / 2);
      }
      if (frame.frontBlocked) {
        const isOneWay = frame.frontOneWayBarrier;
        const frontMaterial = isOneWay
          ? new MeshStandardMaterial({
            color: wall,
            roughness: 0.48,
            metalness: 0.22,
            emissive: wall,
            emissiveIntensity: 0.42,
            transparent: true,
            opacity: 0.42,
            depthWrite: false,
            side: DoubleSide
          })
          : wallMaterial.clone();
        if (!isOneWay) {
          // A closed end is a spatial fact, not another glowing side panel.
          // Lowering the base/emissive response keeps the threshold readable
          // even when it fills most of the near field at a dead end.
          frontMaterial.color.multiplyScalar(0.28);
          frontMaterial.emissive.multiplyScalar(0.35);
          frontMaterial.emissiveIntensity = 0.08;
        }
        this.addCorridorWall(cellGroup, createWallGeometry(profile.cellWidth, profile.wallHeight, profile.wallLean), frontMaterial, {
          x: front.x,
          y: profile.wallHeight / 2,
          z: front.z
        }, isOneWay ? "front-wall-one-way" : "front-wall", cell, rotationY, false);
        if (isOneWay) {
          const chevron = new Mesh(
            new PlaneGeometry(profile.cellWidth * 0.82, profile.wallHeight * 0.82),
            new MeshBasicMaterial({
              map: makeOneWayTexture(wall),
              transparent: true,
              depthWrite: false,
              side: DoubleSide
            })
          );
          const chevronPosition = toWorld(0, -profile.cellDepth / 2 + 0.018);
          chevron.position.set(chevronPosition.x, profile.wallHeight / 2, chevronPosition.z);
          chevron.rotation.y = rotationY;
          chevron.userData = {
            surface: "front-wall-one-way-chevron",
            topology: cellGroup.userData.topology
          };
          cellGroup.add(chevron);
        }
      }
    });
  }

  addCorridorWall(parent, geometry, material, position, surface, topology, rotationY = 0, cloneMaterial = true) {
    const wall = new Mesh(geometry, cloneMaterial ? material.clone() : material);
    wall.position.set(position.x, position.y, position.z);
    wall.rotation.y = rotationY;
    wall.userData = { surface, topology: { z: topology.z, column: topology.column, x: topology.x, y: topology.y } };
    parent.add(wall);
  }

  addDepthSeam(parent, profile, wall, topology, toWorld, rotationY, depthShade) {
    const seamMaterial = new MeshBasicMaterial({
      color: wall,
      transparent: true,
      opacity: 0.22 + (1 - depthShade) * 0.25,
      depthWrite: false,
      side: DoubleSide
    });
    const seam = new Mesh(new BoxGeometry(profile.cellWidth * 0.86, 0.025, 0.035), seamMaterial);
    const seamPosition = toWorld(0, -profile.cellDepth / 2 + 0.024);
    seam.position.set(seamPosition.x, 0.025, seamPosition.z);
    seam.rotation.y = rotationY;
    seam.userData = { surface: "depth-seam", topology: { z: topology.z, column: topology.column } };
    parent.add(seam);

    // The adjacent side cell owns the passage floor. A shallow floor seam at
    // its near edge keeps that real floor connected to the current cell in
    // screen space without introducing a raised sill or a proxy surface.
    if (topology.z === 0 && Math.abs(topology.column) === 1) {
      const threshold = new Mesh(
        new BoxGeometry(profile.cellWidth * 0.86, 0.025, 0.035),
        seamMaterial.clone()
      );
      const thresholdPosition = toWorld(0, profile.cellDepth / 2 - 0.024);
      threshold.position.set(thresholdPosition.x, 0.025, thresholdPosition.z);
      threshold.rotation.y = rotationY;
      threshold.userData = { surface: "side-opening-threshold", topology: { z: topology.z, column: topology.column } };
      parent.add(threshold);
    }

    if (topology.z === 0) return;
    [-1, 1].forEach((side) => {
      const post = new Mesh(
        new BoxGeometry(0.035, profile.wallHeight * 0.86, 0.035),
        seamMaterial.clone()
      );
      const postPosition = toWorld(side * (profile.cellWidth / 2 - 0.02), -profile.cellDepth / 2 + 0.024);
      post.position.set(postPosition.x, profile.wallHeight * 0.43, postPosition.z);
      post.userData = { surface: "depth-post", topology: { z: topology.z, column: topology.column } };
      parent.add(post);
    });
  }

  addSideBranchJambs(parent, side, wallMaterial, topology, profile, toWorld) {
    const jambMaterial = wallMaterial.clone();
    jambMaterial.userData = { rendererLifecycle: "side-branch-jamb-prototype" };
    jambMaterial.color.multiplyScalar(0.78);
    const halfDepth = profile.cellDepth / 2;
    [-1, 1].forEach((edge) => {
      const position = toWorld(side * profile.cellWidth / 2, edge * halfDepth);
      const jamb = new Mesh(new BoxGeometry(0.2, profile.wallHeight, 0.2), jambMaterial.clone());
      jamb.material.userData = { rendererLifecycle: "side-branch-jamb-scene" };
      jamb.position.set(position.x, profile.wallHeight / 2, position.z);
      jamb.userData = {
        surface: "side-branch-jamb",
        topology: { z: topology.z, column: topology.column },
      };
      parent.add(jamb);
    });
    jambMaterial.dispose();
  }

  addDangerCue(wall, profile = this.activeProfile) {
    const cueMaterial = new MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.28 });
    const cue = new Mesh(new SphereGeometry(0.22, 8, 6), cueMaterial);
    const cueZ = profile.frontWallZ + 0.18;
    cue.position.set(0, profile.eyeHeight * 0.76, cueZ);
    cue.userData = { surface: "danger-cue", sceneLayer: "danger" };
    this.root.add(cue);
    const cueLight = new PointLight(0x8f293d, 0.3, 3.5);
    cueLight.position.set(0, profile.eyeHeight, cueZ + 0.35);
    cueLight.userData = { surface: "danger-cue-light", sceneLayer: "danger" };
    this.root.add(cueLight);
    const ring = new Mesh(
      new RingGeometry(0.38, 0.42, 24),
      new MeshBasicMaterial({ color: wall, transparent: true, opacity: 0.24, side: 2 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.02, profile.frontWallZ + 0.28);
    ring.userData = { surface: "danger-cue-ring", sceneLayer: "danger" };
    this.root.add(ring);
  }

  addCombatMonsters(input, wall, profile = this.activeProfile) {
    const monsters = getLivingMonsters(input);
    const bodyRadius = monsters.length === 3 ? COMBAT_TRIO_MONSTER_RADIUS : COMBAT_MONSTER_RADIUS;
    const markerRadius = monsters.length === 3 ? COMBAT_TRIO_MARKER_RADIUS : COMBAT_TARGET_RING_RADIUS;
    const bodyY = profile.wallHeight * 0.38;
    const labelY = bodyY + (monsters.length === 3 ? 0.64 : 0.38);
    // Stage bodies just camera-side of the current-cell threshold. This keeps
    // the readable corridor framing from making multi-enemy bodies balloon
    // beyond the 400px render surface.
    const combatZ = profile.frontWallZ + 0.18;
    const spacing = monsters.length === 1
      ? 0
      : monsters.length === 3
        ? 0.58
        : Math.min(0.96, 4.8 / monsters.length);
    const start = -((monsters.length - 1) * spacing) / 2;
    monsters.forEach((monster, index) => {
      const color = hexColor(monster.color, wall.getHexString());
      const group = new Group();
      const monsterIndex = input.combatMonsters.indexOf(monster);
      const depthStagger = monsters.length > 1
        ? (index % 2 === 0 ? 0.04 : -0.04)
        : 0;
      group.userData = {
        sceneLayer: "combat",
        monsterIndex,
        staging: {
          bodyRadius,
          bodyY,
          labelY,
          z: combatZ - depthStagger,
          spacing,
        },
      };
      const body = new Mesh(
        new SphereGeometry(bodyRadius, 8, 6),
        new MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.24, emissive: color, emissiveIntensity: 0.28 })
      );
      body.position.y = bodyY;
      body.userData = { surface: "combat-body", monsterIndex };
      group.add(body);
      const ring = new Mesh(
        new TorusGeometry(markerRadius, 0.035, 6, 20),
        new MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = bodyY - bodyRadius;
      ring.userData = { surface: "combat-marker", monsterIndex };
      group.add(ring);
      // Stack multi-enemy labels vertically so each name stays readable while
      // the bodies remain inside the narrow corridor frame.
      const labelWidth = monsters.length > 1 ? COMBAT_MULTI_LABEL_WIDTH : 1.7;
      const stagedLabelY = monsters.length > 1
        ? labelY + (index - (monsters.length - 1) / 2) * COMBAT_MULTI_LABEL_ROW_STEP
        : labelY;
      const label = new Mesh(
        new PlaneGeometry(labelWidth, labelWidth * 48 / 256),
        new MeshBasicMaterial({ map: makeLabelTexture(monster.name || "敵", `#${color.getHexString()}`), transparent: true, depthWrite: false })
      );
      label.position.set(0, stagedLabelY, 0);
      label.userData = { surface: "combat-label", monsterIndex };
      group.add(label);
      group.position.set(start + index * spacing, 0, combatZ - depthStagger);
      this.root.add(group);

      if (input.combatTargetSelection?.active) {
        const hit = new Mesh(
          new SphereGeometry(TARGET_HIT_RADIUS, 8, 6),
          new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
        );
        hit.position.copy(group.position);
        hit.position.y += bodyY;
        hit.userData = {
          targetIdx: monsterIndex,
          sceneLayer: "combat-target"
        };
        this.root.add(hit);
        this.targetHitMeshes.push(hit);
        const targetRing = new Mesh(
          new RingGeometry(markerRadius + 0.02, markerRadius + (monsters.length === 3 ? 0.05 : 0.07), 24),
          new MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.95, side: 2 })
        );
        targetRing.rotation.x = -Math.PI / 2;
        targetRing.position.set(
          hit.position.x,
          bodyY - bodyRadius,
          hit.position.z
        );
        targetRing.userData = {
          surface: "combat-target-ring",
          sceneLayer: "combat-target",
          monsterIndex,
          targetIdx: monsterIndex,
        };
        this.root.add(targetRing);
      }
    });
  }

  addTownMarker(wall) {
    const marker = new Mesh(
      new TorusGeometry(1.1, 0.04, 8, 32),
      new MeshBasicMaterial({ color: wall, transparent: true, opacity: 0.55 })
    );
    marker.position.set(0, 1.5, -3.2);
    this.root.add(marker);
  }
}

// Re-export the material class so browser lifecycle tests can spy on the same
// module instance used by this renderer (Vite otherwise creates a second
// native module instance for a direct /node_modules import).
export { MeshBasicMaterial, MeshStandardMaterial };
