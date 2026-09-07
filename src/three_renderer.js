// balance-impact: none — optional Dungeon View presentation only; no game rules or state mutation.
import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
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
import { EVENT_TYPES } from "./data.js";
import { getRendererInput, isRendererInput } from "./state/renderer_view.js";

const VIEW_W = 400;
const VIEW_H = 260;
const TARGET_HIT_RADIUS = 0.88;

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
    if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
    else child.material?.dispose();
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

function hasDangerCue(input) {
  if (input.combatMonsters.some((monster) => monster.level >= 4 || monster.isBoss)) return true;
  if (input.roamingMonsters.some((monster) => monster.floor === input.floor && monster.kind === "elite")) return true;
  const map = input.map;
  if (!Array.isArray(map)) return false;
  for (let y = Math.max(0, input.y - 4); y <= Math.min(map.length - 1, input.y + 4); y += 1) {
    for (let x = Math.max(0, input.x - 4); x <= Math.min((map[y]?.length || 1) - 1, input.x + 4); x += 1) {
      const event = map[y]?.[x]?.event;
      if (event === EVENT_TYPES.BOSS || event === EVENT_TYPES.MIDBOSS) return true;
    }
  }
  return false;
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
    this.targetSelection = null;
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
      this.camera = new PerspectiveCamera(54, VIEW_W / VIEW_H, 0.1, 40);
      this.camera.position.set(0, 1.55, 5.8);
      this.camera.lookAt(0, 1.25, -2.5);
      this.root = new Group();
      this.scene.add(this.root);
      this.raycaster = new Raycaster();
      this.pointer = new Vector2();
      this.supported = true;
      this.supportsDirectTargetSelection = true;
      this.canvas.dataset.renderer = "three";
      this.canvas.dataset.targetHitArea = "expanded";
      this.canvas.addEventListener("pointerdown", (event) => this.handlePointerDown(event));
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

  getDrawSignature(input = null) {
    const renderInput = this.resolveRenderInput(input);
    const { view, sceneVisibility } = renderInput;
    return JSON.stringify({
      gameState: view.gameState,
      menuType: view.menuType,
      floor: renderInput.floor,
      position: [renderInput.x, renderInput.y, renderInput.dir],
      mapRevision: renderInput.mapRevision,
      sceneVisibility,
      light: [renderInput.lightTurns, renderInput.lightPower],
      danger: hasDangerCue(renderInput),
      monsters: renderInput.combatMonsters.map((monster) => [monster.name, monster.hp, monster.maxHp, monster.color]),
      targets: this.targetSelection?.targetType || ""
    });
  }

  isAnimating(input = null) {
    const renderInput = this.resolveRenderInput(input);
    return this.shakeTime > 0 || this.flashTime > 0 || this.damageTexts.length > 0 ||
      renderInput.visual.environment.animated || Boolean(this.targetSelection);
  }

  setTargetSelection({ targetType, onSelect }) {
    if (!this.supported) return;
    this.targetSelection = { targetType, onSelect };
    this.lastSignature = null;
  }

  clearTargetSelection() {
    this.targetSelection = null;
    this.targetHitMeshes = [];
    this.lastSignature = null;
  }

  handlePointerDown(event) {
    if (!this.targetSelection || this.targetHitMeshes.length === 0) return;
    const targetIdx = this.getCombatTargetAtClientPoint(event.clientX, event.clientY);
    if (!Number.isInteger(targetIdx)) return;
    event.preventDefault();
    this.targetSelection.onSelect(targetIdx);
    this.clearTargetSelection();
  }

  getCombatTargetAtClientPoint(clientX, clientY) {
    if (!this.targetSelection || this.targetHitMeshes.length === 0) return null;
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
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
    this.camera.position.y = 1.55 + shakeY;
    this.camera.lookAt(0, 1.25, -2.5);
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

    const floorMaterial = new MeshStandardMaterial({ color: background, roughness: 0.92, metalness: 0.18 });
    const wallMaterial = new MeshStandardMaterial({
      color: background,
      roughness: 0.72,
      metalness: 0.34,
      emissive: wall,
      emissiveIntensity: 0.12
    });
    const floor = new Mesh(new PlaneGeometry(9, 16), floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -2.3);
    this.root.add(floor);
    const ceiling = new Mesh(new PlaneGeometry(9, 16), floorMaterial.clone());
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, 4.2, -2.3);
    this.root.add(ceiling);
    [-3.35, 3.35].forEach((x) => {
      const sideWall = new Mesh(new PlaneGeometry(16, 4.2), wallMaterial.clone());
      sideWall.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
      sideWall.position.set(x, 2.1, -2.3);
      this.root.add(sideWall);
    });
    const grid = new Group();
    for (let index = -4; index <= 4; index += 1) {
      const line = new Mesh(
        new BoxGeometry(0.012, 0.012, 16),
        new MeshBasicMaterial({ color: wall, transparent: true, opacity: 0.22 })
      );
      line.position.set(index * 0.72, 0.015, -2.3);
      grid.add(line);
    }
    this.root.add(grid);

    const lightTurns = finite(input.lightTurns, 0);
    if (lightTurns > 0 || input.lightPower > 0) {
      const light = new PointLight(wall, Math.min(1.5, 0.35 + finite(input.lightPower, 0) * 0.03), 7);
      light.position.set(0, 1.8, 1.5);
      this.root.add(light);
    }

    if (hasDangerCue(input)) this.addDangerCue(wall);
    if (input.sceneVisibility.showCombat) this.addCombatMonsters(input, wall);
    if (input.sceneVisibility.showTownBackground) this.addTownMarker(wall);
  }

  addDangerCue(wall) {
    const cueMaterial = new MeshBasicMaterial({ color: 0xb83b4c, transparent: true, opacity: 0.18 });
    const cue = new Mesh(new SphereGeometry(0.66, 8, 6), cueMaterial);
    cue.position.set(0, 1.35, -5.3);
    this.root.add(cue);
    const cueLight = new PointLight(0x8f293d, 0.55, 4.5);
    cueLight.position.set(0, 1.5, -4.7);
    this.root.add(cueLight);
    const ring = new Mesh(
      new RingGeometry(0.8, 0.84, 24),
      new MeshBasicMaterial({ color: wall, transparent: true, opacity: 0.24, side: 2 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.02, -5.2);
    this.root.add(ring);
  }

  addCombatMonsters(input, wall) {
    const monsters = getLivingMonsters(input);
    const spacing = monsters.length === 1 ? 0 : Math.min(2.15, 5.5 / monsters.length);
    const start = -((monsters.length - 1) * spacing) / 2;
    monsters.forEach((monster, index) => {
      const color = hexColor(monster.color, wall.getHexString());
      const group = new Group();
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
      group.position.set(start + index * spacing, 0, -1.65 - Math.abs(index - (monsters.length - 1) / 2) * 0.22);
      this.root.add(group);

      if (this.targetSelection?.targetType === "enemy") {
        const hit = new Mesh(
          new SphereGeometry(TARGET_HIT_RADIUS, 8, 6),
          new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
        );
        hit.position.copy(group.position);
        hit.position.y += 1.2;
        hit.userData.targetIdx = input.combatMonsters.indexOf(monster);
        this.root.add(hit);
        this.targetHitMeshes.push(hit);
        const targetRing = new Mesh(
          new RingGeometry(0.72, 0.78, 24),
          new MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.95, side: 2 })
        );
        targetRing.rotation.x = -Math.PI / 2;
        targetRing.position.set(hit.position.x, 0.04, hit.position.z);
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
