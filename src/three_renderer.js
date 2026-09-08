// balance-impact: none — optional Dungeon View presentation only; no game rules or state mutation.
import {
  AmbientLight,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  Fog,
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
  WebGLRenderer
} from "three";
import { getRendererInput, isRendererInput } from "./state/renderer_view.js";
import { getVisibleCorridorTopology } from "./rules/renderer_topology.js";

const VIEW_W = 400;
const VIEW_H = 260;
const TARGET_HIT_RADIUS = 0.88;
const CORRIDOR_CELL_WIDTH = 1.8;
const CORRIDOR_CELL_DEPTH = 2.1;
const CORRIDOR_WALL_HEIGHT = 3.6;
const CORRIDOR_START_Z = 1.15;
// The player stands inside the current cell, looking through its front
// threshold. Keeping the eye point inside the cell makes its side walls read
// as corridor boundaries instead of freestanding panels behind the player.
const CORRIDOR_CAMERA = Object.freeze({
  fov: 68,
  eyeHeight: 1.55,
  eyeZ: CORRIDOR_START_Z + 0.4,
  lookAtHeight: 1.5,
  lookAtZ: -3.1
});
// Combat and danger overlays live in front of the current cell's front wall
// (frontZ = CORRIDOR_START_Z - CORRIDOR_CELL_DEPTH / 2 = 0.1). Keeping these
// layers camera-side makes them visible and raycastable in closed rooms.
const COMBAT_MONSTER_Z = 0.72;
const DANGER_CUE_Z = 0.95;
const DANGER_RING_Z = 0.88;

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
      this.camera = new PerspectiveCamera(CORRIDOR_CAMERA.fov, VIEW_W / VIEW_H, 0.05, 40);
      this.camera.position.set(0, CORRIDOR_CAMERA.eyeHeight, CORRIDOR_CAMERA.eyeZ);
      this.camera.lookAt(0, CORRIDOR_CAMERA.lookAtHeight, CORRIDOR_CAMERA.lookAtZ);
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
      cell.frontOneWayBarrier
    ]);
    return JSON.stringify({
      gameState: view.gameState,
      menuType: view.menuType,
      floor: renderInput.floor,
      position: [renderInput.x, renderInput.y, renderInput.dir],
      mapRevision: renderInput.mapRevision,
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
      renderInput.visual.environment.animated;
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
    const target = hits.find((hit) => Number.isInteger(hit.object.userData.targetIdx));
    return target?.object.userData.targetIdx ?? null;
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
    this.camera.position.x = shakeX;
    this.camera.position.y = CORRIDOR_CAMERA.eyeHeight + shakeY;
    this.camera.position.z = CORRIDOR_CAMERA.eyeZ;
    this.camera.lookAt(0, CORRIDOR_CAMERA.lookAtHeight, CORRIDOR_CAMERA.lookAtZ);
    this.flashLight.intensity = this.flashTime > 0 ? 1.4 : 0;
    this.webgl.render(this.scene, this.camera);
  }

  buildScene(input) {
    this.targetHitMeshes = [];
    while (this.root.children.length > 0) {
      const child = this.root.children.pop();
      disposeObject(child);
    }

    const visual = input.visual;
    const background = hexColor(visual.background);
    const wall = hexColor(visual.wallColor, "#58d6e8");
    const topology = this.getSceneTopology(input);
    this.scene.background = background;
    this.scene.fog = new Fog(background, 3.2, 12.5);
    this.webgl.setClearColor(background, 1);

    this.root.add(new AmbientLight(0x8e9aa0, 0.42));
    const keyLight = new DirectionalLight(wall, 0.65);
    keyLight.position.set(-2, 5, 4);
    this.root.add(keyLight);
    this.flashLight = new PointLight(0xffffff, 0, 8);
    this.flashLight.position.set(0, 1.4, 2);
    this.root.add(this.flashLight);

    const floorMaterial = new MeshStandardMaterial({ color: background, roughness: 0.92, metalness: 0.18, side: DoubleSide });
    const wallMaterial = new MeshStandardMaterial({
      color: background,
      roughness: 0.72,
      metalness: 0.34,
      emissive: wall,
      emissiveIntensity: 0.12,
      side: DoubleSide
    });
    if (!input.sceneVisibility.showTownBackground) {
      try {
        this.addCorridorTopology(topology, floorMaterial, wallMaterial, wall);
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

    if (input.dangerCue?.active) this.addDangerCue(wall);
    if (input.sceneVisibility.showCombat) this.addCombatMonsters(input, wall);
    if (input.sceneVisibility.showTownBackground) this.addTownMarker(wall);
  }

  addCorridorTopology(topology, floorMaterial, wallMaterial, wall = wallMaterial.emissive) {
    topology.forEach((cell) => {
      const cellGroup = new Group();
      cellGroup.userData = {
        topology: { z: cell.z, column: cell.column, x: cell.x, y: cell.y },
        valid: cell.valid
      };
      this.root.add(cellGroup);

      const centerX = cell.column * CORRIDOR_CELL_WIDTH;
      const centerZ = CORRIDOR_START_Z - cell.z * CORRIDOR_CELL_DEPTH;
      const frontZ = centerZ - CORRIDOR_CELL_DEPTH / 2;
      if (!cell.valid) {
        this.addCorridorWall(cellGroup, new PlaneGeometry(CORRIDOR_CELL_WIDTH, CORRIDOR_WALL_HEIGHT), wallMaterial, {
          x: centerX,
          y: CORRIDOR_WALL_HEIGHT / 2,
          z: frontZ
        }, "front-wall-invalid", cell);
        return;
      }

      const floor = new Mesh(new PlaneGeometry(CORRIDOR_CELL_WIDTH, CORRIDOR_CELL_DEPTH), floorMaterial.clone());
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(centerX, 0, centerZ);
      floor.userData = { surface: "floor", topology: cellGroup.userData.topology };
      cellGroup.add(floor);

      const ceiling = new Mesh(new PlaneGeometry(CORRIDOR_CELL_WIDTH, CORRIDOR_CELL_DEPTH), floorMaterial.clone());
      ceiling.rotation.x = Math.PI / 2;
      ceiling.position.set(centerX, CORRIDOR_WALL_HEIGHT, centerZ);
      ceiling.userData = { surface: "ceiling", topology: cellGroup.userData.topology };
      cellGroup.add(ceiling);

      if (cell.leftBlocked) {
        this.addCorridorWall(cellGroup, new PlaneGeometry(CORRIDOR_CELL_DEPTH, CORRIDOR_WALL_HEIGHT), wallMaterial, {
          x: centerX - CORRIDOR_CELL_WIDTH / 2,
          y: CORRIDOR_WALL_HEIGHT / 2,
          z: centerZ
        }, "left-wall", cell, Math.PI / 2);
      }
      if (cell.rightBlocked) {
        this.addCorridorWall(cellGroup, new PlaneGeometry(CORRIDOR_CELL_DEPTH, CORRIDOR_WALL_HEIGHT), wallMaterial, {
          x: centerX + CORRIDOR_CELL_WIDTH / 2,
          y: CORRIDOR_WALL_HEIGHT / 2,
          z: centerZ
        }, "right-wall", cell, -Math.PI / 2);
      }
      if (cell.frontBlocked) {
        const isOneWay = cell.frontOneWayBarrier;
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
        this.addCorridorWall(cellGroup, new PlaneGeometry(CORRIDOR_CELL_WIDTH, CORRIDOR_WALL_HEIGHT), frontMaterial, {
          x: centerX,
          y: CORRIDOR_WALL_HEIGHT / 2,
          z: frontZ
        }, isOneWay ? "front-wall-one-way" : "front-wall", cell, 0, false);
        if (isOneWay) {
          const chevron = new Mesh(
            new PlaneGeometry(CORRIDOR_CELL_WIDTH * 0.82, CORRIDOR_WALL_HEIGHT * 0.82),
            new MeshBasicMaterial({
              map: makeOneWayTexture(wall),
              transparent: true,
              depthWrite: false,
              side: DoubleSide
            })
          );
          chevron.position.set(centerX, CORRIDOR_WALL_HEIGHT / 2, frontZ + 0.018);
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

  addDangerCue(wall) {
    const cueMaterial = new MeshBasicMaterial({ color: 0xb83b4c, transparent: true, opacity: 0.18 });
    const cue = new Mesh(new SphereGeometry(0.66, 8, 6), cueMaterial);
    cue.position.set(0, 1.35, DANGER_CUE_Z);
    cue.userData = { surface: "danger-cue", sceneLayer: "danger" };
    this.root.add(cue);
    const cueLight = new PointLight(0x8f293d, 0.55, 4.5);
    cueLight.position.set(0, 1.5, DANGER_CUE_Z + 0.6);
    cueLight.userData = { surface: "danger-cue-light", sceneLayer: "danger" };
    this.root.add(cueLight);
    const ring = new Mesh(
      new RingGeometry(0.8, 0.84, 24),
      new MeshBasicMaterial({ color: wall, transparent: true, opacity: 0.24, side: 2 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.02, DANGER_RING_Z);
    ring.userData = { surface: "danger-cue-ring", sceneLayer: "danger" };
    this.root.add(ring);
  }

  addCombatMonsters(input, wall) {
    const monsters = getLivingMonsters(input);
    const spacing = monsters.length === 1 ? 0 : Math.min(1.35, 5.5 / monsters.length);
    const start = -((monsters.length - 1) * spacing) / 2;
    monsters.forEach((monster, index) => {
      const color = hexColor(monster.color, wall.getHexString());
      const group = new Group();
      group.userData = { sceneLayer: "combat", monsterIndex: input.combatMonsters.indexOf(monster) };
      const body = new Mesh(
        new SphereGeometry(0.52 + Math.min(0.2, finite(monster.level, 1) * 0.025), 8, 6),
        new MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.24, emissive: color, emissiveIntensity: 0.28 })
      );
      body.position.y = 1.18;
      group.add(body);
      const ring = new Mesh(
        new TorusGeometry(0.68, 0.035, 6, 20),
        new MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.62;
      group.add(ring);
      const label = new Mesh(
        new PlaneGeometry(1.7, 0.32),
        new MeshBasicMaterial({ map: makeLabelTexture(monster.name || "敵", `#${color.getHexString()}`), transparent: true, depthWrite: false })
      );
      label.position.set(0, 2.05, 0);
      group.add(label);
      group.position.set(start + index * spacing, 0, COMBAT_MONSTER_Z - Math.abs(index - (monsters.length - 1) / 2) * 0.04);
      this.root.add(group);

      if (input.combatTargetSelection?.active) {
        const hit = new Mesh(
          new SphereGeometry(TARGET_HIT_RADIUS, 8, 6),
          new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
        );
        hit.position.copy(group.position);
        hit.position.y += 1.2;
        hit.userData = {
          targetIdx: input.combatMonsters.indexOf(monster),
          sceneLayer: "combat-target"
        };
        this.root.add(hit);
        this.targetHitMeshes.push(hit);
        const targetRing = new Mesh(
          new RingGeometry(0.72, 0.78, 24),
          new MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.95, side: 2 })
        );
        targetRing.rotation.x = -Math.PI / 2;
        targetRing.position.set(hit.position.x, 0.04, hit.position.z);
        targetRing.userData = { surface: "combat-target-ring", sceneLayer: "combat-target" };
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
export { MeshStandardMaterial };
