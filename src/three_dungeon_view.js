// balance-impact: none — Three.js prototype of the explore view (#2042).
//
// An opt-in second canvas laid over the Pixi dungeon view while the player is
// walking the corridors. It consumes the same RendererInput and the same
// pixel art as the Pixi view, but stands the map up as real 3D: a camera that
// turns and walks, torches that light the stone, haze and depth blur for
// distance, and bloom on anything bright.
//
// Pixi stays the production renderer and keeps owning combat, chests, the
// town, hit testing, and floating numbers. This module only ever adds or
// removes its own canvas and toggle; if it fails, game.js disposes it and the
// Pixi view underneath is what the player sees.
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Fog,
  Group,
  HemisphereLight,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  NearestFilter,
  NeutralToneMapping,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Scene,
  Sprite,
  SpriteMaterial,
  WebGLRenderer
} from "three";
import { DX, DY } from "./constants/directions.js";
import { getPixelScenePalette, getPixelSurfaceKey, mixHex } from "./pixel_art_painters.js";
import {
  collectThreeViewCells,
  collectThreeViewWallFaces,
  easeOutCubic,
  getCameraPose,
  getLightRadius,
  getNextThreeViewMode,
  getThreeViewRig,
  getWallEdgeKey,
  getYawForDir,
  hasWallTorch,
  interpolateAnchor,
  planCameraMove
} from "./rules/three_view.ts";
import { getWallDecorIndex } from "./rules/wall_decor.js";
import {
  PROP_FLOOR_ANCHOR,
  describeCellProp,
  paintBarrierCanvas,
  paintGlowCanvas,
  paintPawnCanvas,
  paintPropCanvas,
  paintRoamerCanvas,
  paintSurfaceCanvases,
  paintTorchCanvases
} from "./three_view_art.js";
import { ThreeViewPost } from "./three_view_post.js";

const WALL_THICKNESS = 0.08;
const POST_HALF_WIDTH = 0.07;
// Remembered-but-unseen cells in the top-down view are drawn this much darker.
const REMEMBERED_TINT = 0.5;
const TORCH_LIGHT_COUNT = 4;
const DUST_COUNT = 110;
const DUST_SPREAD = 3.5;
// While nothing moves, flames and dust still animate; half rate is enough.
const IDLE_FRAME_MS = 33;
const MODE_LABELS = Object.freeze({ "first-person": "視点: 一人称", "top-down": "視点: 見下ろし", off: "視点: 2D" });

function prefersReducedMotion() {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function pixelTexture(canvas, { repeat = false } = {}) {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  // Texels stay square up close; mipmaps keep distant stone from shimmering.
  texture.magFilter = NearestFilter;
  texture.minFilter = repeat ? LinearMipmapLinearFilter : NearestFilter;
  texture.generateMipmaps = repeat;
  if (repeat) {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
  }
  return texture;
}

/** Collects textured quads and turns them into one mesh's geometry. */
class QuadBatch {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.colors = [];
    this.indices = [];
  }

  /** Corners counter-clockwise seen from the lit side, starting bottom-left. */
  quad(corners, normal, tint = 1, [u0, v0, u1, v1] = [0, 0, 1, 1]) {
    const base = this.positions.length / 3;
    const uvs = [u0, v0, u1, v0, u1, v1, u0, v1];
    corners.forEach((corner, index) => {
      this.positions.push(corner[0], corner[1], corner[2]);
      this.normals.push(normal[0], normal[1], normal[2]);
      this.uvs.push(uvs[index * 2], uvs[index * 2 + 1]);
      this.colors.push(tint, tint, tint);
    });
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** Upright quad centred on (cx, cz), facing (nx, nz), from y0 up to y1. */
  upright(cx, cz, nx, nz, halfWidth, y0, y1, tint, uv) {
    const rx = nz * halfWidth;
    const rz = -nx * halfWidth;
    this.quad([[cx - rx, y0, cz - rz], [cx + rx, y0, cz + rz], [cx + rx, y1, cz + rz], [cx - rx, y1, cz - rz]], [nx, 0, nz], tint, uv);
  }

  /** Horizontal quad centred on (cx, cz), facing up, or down for a ceiling. */
  flat(cx, cz, halfX, halfZ, y, tint, up = true, uv) {
    const near = up ? cz + halfZ : cz - halfZ;
    const far = up ? cz - halfZ : cz + halfZ;
    this.quad([[cx - halfX, y, near], [cx + halfX, y, near], [cx + halfX, y, far], [cx - halfX, y, far]], [0, up ? 1 : -1, 0], tint, uv);
  }

  build() {
    if (this.indices.length === 0) return null;
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(this.positions), 3));
    geometry.setAttribute("normal", new BufferAttribute(new Float32Array(this.normals), 3));
    geometry.setAttribute("uv", new BufferAttribute(new Float32Array(this.uvs), 2));
    geometry.setAttribute("color", new BufferAttribute(new Float32Array(this.colors), 3));
    geometry.setIndex(this.indices);
    return geometry;
  }
}

class ThreeDungeonView {
  constructor({ mode, effects, scale }) {
    this.host = document.getElementById("viewport-panel");
    const pixiCanvas = document.getElementById("dungeon-canvas");
    if (!this.host || !pixiCanvas) throw new Error("Dungeon view host is unavailable");

    this.mode = mode;
    this.scale = scale;
    this.reducedMotion = prefersReducedMotion();
    this.frames = 0;
    this.clock = 0;
    this.idle = 0;
    this.size = { width: 0, height: 0 };
    this.anchor = null;
    this.move = null;
    this.floor = null;
    this.themeKey = null;
    this.worldKey = null;
    this.worldStats = { cells: 0, torches: 0 };
    this.torches = [];

    this.canvas = document.createElement("canvas");
    this.canvas.id = "dungeon-three-canvas";
    this.canvas.setAttribute("aria-hidden", "true");
    this.canvas.hidden = true;
    pixiCanvas.after(this.canvas);

    this.toggle = document.createElement("button");
    this.toggle.id = "three-view-toggle";
    this.toggle.type = "button";
    this.toggle.className = "btn three-view-toggle";
    this.toggle.hidden = true;
    this.toggle.addEventListener("click", () => this.setMode(getNextThreeViewMode(this.mode)));
    this.host.appendChild(this.toggle);

    this.renderer = new WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: "high-performance" });
    // Neutral tone mapping leaves the palette alone and only rolls off the
    // highlights that bloom pushes past white.
    this.renderer.toneMapping = NeutralToneMapping;
    // One frame is several passes; count them all in getState().
    this.renderer.info.autoReset = false;
    this.scene = new Scene();
    this.scene.background = new Color();
    this.scene.fog = new Fog(0xffffff, 1, 6);
    this.camera = new PerspectiveCamera(60, 1, 0.05, 60);
    this.post = effects ? new ThreeViewPost(this.renderer, this.scene, this.camera) : null;

    this.ambient = new HemisphereLight(0xffffff, 0xffffff, 1);
    this.playerLight = new PointLight(0xffe2bd, 0, 4.6, 1);
    this.torchLights = Array.from({ length: TORCH_LIGHT_COUNT }, () => new PointLight(0xffa85a, 0, 3.2, 1.2));
    this.scene.add(this.ambient, this.playerLight, ...this.torchLights);

    // Rebuilt whenever the visible map changes.
    this.world = new Group();
    this.scene.add(this.world);

    // Shared across biomes.
    const glowTexture = pixelTexture(paintGlowCanvas());
    const [torchA, torchB] = paintTorchCanvases().map((canvas) => pixelTexture(canvas));
    this.shared = {
      glowTexture,
      shadowTexture: pixelTexture(paintGlowCanvas("0, 0, 0")),
      torchTextures: [torchA, torchB],
      // Colours above 1 are what the bloom pass picks up.
      torchMaterials: [0, 1].map((phase) => new SpriteMaterial({ map: phase ? torchB : torchA, alphaTest: 0.5, color: new Color(1.9, 1.6, 1.25) })),
      torchGlow: new SpriteMaterial({ map: glowTexture, color: 0xff8a3a, blending: AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.3 }),
      floorPlane: new PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2),
      roamerMaterials: new Map()
    };
    this.shared.shadowMaterial = new MeshBasicMaterial({ map: this.shared.shadowTexture, transparent: true, depthWrite: false, opacity: 0.42 });

    this.dust = this.createDust(glowTexture);
    this.scene.add(this.dust);

    // Rebuilt per biome.
    this.theme = null;
    this.pawn = new Sprite();
    this.pawn.center.set(0.5, 0);
    this.pawn.scale.set(0.42, 0.56, 1);
    this.pawnShadow = new Mesh(new PlaneGeometry(0.5, 0.5).rotateX(-Math.PI / 2), this.shared.shadowMaterial);
    this.pawnShadow.position.y = 0.012;
    this.scene.add(this.pawn, this.pawnShadow);

    this.resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(() => { this.dirty = true; }) : null;
    this.resizeObserver?.observe(this.host);
    this.onContextLost = (event) => {
      event.preventDefault();
      this.failed = true;
    };
    this.canvas.addEventListener("webglcontextlost", this.onContextLost);
    this.setMode(mode);
  }

  setMode(mode) {
    this.mode = mode;
    this.toggle.textContent = MODE_LABELS[mode || "off"];
    this.toggle.setAttribute("aria-label", `${MODE_LABELS[mode || "off"]}（タップで切り替え）`);
    this.rig = null;
    this.worldKey = null;
    this.anchor = null;
    this.dirty = true;
  }

  /** Read by game.js for tests and diagnostics. */
  getState() {
    return Object.freeze({
      mode: this.mode,
      visible: !this.canvas.hidden,
      effects: Boolean(this.post),
      frames: this.frames,
      cells: this.worldStats.cells,
      torches: this.worldStats.torches,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles
    });
  }

  createDust(texture) {
    const positions = new Float32Array(DUST_COUNT * 3);
    this.dustSeeds = Array.from({ length: DUST_COUNT }, (_, index) => ({
      x: Math.random() * DUST_SPREAD * 2,
      y: 0.08 + Math.random() * 0.84,
      z: Math.random() * DUST_SPREAD * 2,
      phase: index * 1.7,
      drift: 0.02 + Math.random() * 0.05
    }));
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    const material = new PointsMaterial({
      map: texture, size: 0.035, color: 0xffe6b8, transparent: true, opacity: 0.55,
      blending: AdditiveBlending, depthWrite: false
    });
    const points = new Points(geometry, material);
    points.frustumCulled = false;
    return points;
  }

  // -------------------------------------------------------------------------
  // Frame
  // -------------------------------------------------------------------------

  /**
   * Called once per game-loop tick with the tick's RendererInput. Shows the
   * canvas only while the Pixi view would be showing a plain corridor.
   */
  frame(dt, input) {
    if (this.failed) throw new Error("Three.js view lost its WebGL context");
    const visibility = input.sceneVisibility;
    const eligible = Boolean(input.map) && !visibility.showTownBackground && !visibility.showCombat && !visibility.showChest;
    this.toggle.hidden = !eligible;
    const active = eligible && this.mode !== null;
    if (this.canvas.hidden === active) {
      this.canvas.hidden = !active;
      this.dirty = true;
    }
    this.host.dataset.threeView = active ? this.mode : "off";
    if (!active) {
      // Coming back from combat or a menu cuts straight to the current pose.
      this.anchor = null;
      return;
    }
    if (!this.resize()) return;

    const elapsed = Math.max(0, Math.min(100, dt));
    this.clock += elapsed;
    this.syncTheme(input);
    const moving = this.syncCamera(elapsed, input);
    const rebuilt = this.syncWorld(input);
    if (!moving && !rebuilt && !this.dirty) {
      if (this.reducedMotion) return;
      this.idle += elapsed;
      if (this.idle < IDLE_FRAME_MS) return;
    }
    this.idle = 0;
    this.dirty = false;
    if (!this.reducedMotion) this.animate();
    this.renderer.info.reset();
    if (this.post) this.post.render();
    else this.renderer.render(this.scene, this.camera);
    this.frames += 1;
  }

  resize() {
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    if (width < 2 || height < 2) return false;
    if (width === this.size.width && height === this.size.height && this.rig) return true;
    this.size = { width, height };
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2) * this.scale;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.post?.setSize(width, height, pixelRatio);
    this.applyRig(width / height);
    this.dirty = true;
    return true;
  }

  applyRig(aspect) {
    const hadCeiling = this.rig?.ceiling;
    this.rig = getThreeViewRig(this.mode, aspect);
    this.camera.aspect = aspect;
    this.camera.fov = this.rig.fov;
    this.camera.updateProjectionMatrix();
    const topDown = this.mode === "top-down";
    this.pawn.visible = topDown;
    this.pawnShadow.visible = topDown;
    this.post?.setFocus(topDown
      ? { distance: this.rig.focus, range: 1.5, span: 4.5, radius: 0.008 }
      : { distance: this.rig.focus, range: 1.6, span: 3.4, radius: 0.007 });
    if (hadCeiling !== this.rig.ceiling) this.worldKey = null;
  }

  syncTheme(input) {
    const visual = input.visual || {};
    const palette = getPixelScenePalette(visual.wallColor);
    const surfaceSet = { ...(visual.surfaces || {}), trapStyle: visual.landmarks?.trapStyle };
    const key = getPixelSurfaceKey(palette, surfaceSet);
    if (key === this.themeKey) return;
    this.disposeTheme();
    this.themeKey = key;
    this.worldKey = null;

    const canvases = paintSurfaceCanvases(palette, surfaceSet);
    const surface = (canvas, options) => new MeshLambertMaterial({ map: pixelTexture(canvas, { repeat: true }), vertexColors: true, ...options });
    const pawnTexture = pixelTexture(paintPawnCanvas(palette));
    this.theme = {
      palette,
      wall: surface(canvases.wall),
      floor: surface(canvases.floor),
      ceiling: surface(canvases.ceiling),
      decor: canvases.decor.map((canvas) => new MeshLambertMaterial({ map: pixelTexture(canvas), vertexColors: true, alphaTest: 0.5 })),
      trap: new MeshLambertMaterial({ map: pixelTexture(canvases.trap), vertexColors: true, alphaTest: 0.4 }),
      barrier: new MeshBasicMaterial({ map: pixelTexture(paintBarrierCanvas(palette.accent)), transparent: true, depthWrite: false }),
      pawn: new SpriteMaterial({ map: pawnTexture, alphaTest: 0.5 }),
      // Sprite and decal materials for props, created on first use.
      props: new Map()
    };
    this.pawn.material = this.theme.pawn;

    // Distance sinks into the biome's own colour, not into black.
    const haze = mixHex(mixHex(palette.accent, palette.ink, 0.66), palette.fog, 0.22);
    this.scene.background.set(haze);
    this.scene.fog.color.set(haze);
    this.ambient.color.set(mixHex(palette.skyTop, palette.accent, 0.12));
    this.ambient.groundColor.set(mixHex(palette.groundBottom, palette.ink, 0.22));
  }

  syncCamera(elapsed, input) {
    const target = { x: Number(input.x) || 0, z: Number(input.y) || 0, yaw: getYawForDir(input.dir) };
    const resting = this.move?.to;
    if (!resting || resting.x !== target.x || resting.z !== target.z || resting.yaw !== target.yaw || input.floor !== this.floor) {
      const plan = this.reducedMotion
        ? { duration: 0, kind: "cut" }
        : planCameraMove(this.anchor, target, input.floor === this.floor);
      this.move = { from: plan.duration > 0 ? this.anchor : target, to: target, elapsed: 0, duration: plan.duration, kind: plan.kind };
      this.floor = input.floor;
      this.dirty = true;
    }

    const move = this.move;
    let bob = 0;
    let moving = false;
    if (move.duration > 0) {
      move.elapsed += elapsed;
      const progress = Math.min(1, move.elapsed / move.duration);
      this.anchor = interpolateAnchor(move.from, move.to, easeOutCubic(progress));
      // One soft footfall per step, first-person only.
      if (move.kind === "step" && this.mode === "first-person") bob = Math.sin(Math.PI * progress) * 0.014;
      moving = true;
      if (progress >= 1) move.duration = 0;
    } else {
      this.anchor = move.to;
    }

    const anchor = this.anchor;
    const pose = getCameraPose(this.rig, anchor);
    this.camera.position.set(pose.position[0], pose.position[1] + bob, pose.position[2]);
    this.camera.lookAt(pose.target[0], pose.target[1] + bob, pose.target[2]);

    const topDown = this.mode === "top-down";
    const lightRadius = getLightRadius(input.lightTurns, input.lightPower);
    // The carried light: a light spell reaches farther and pushes the haze back.
    // First-person carries it at the lens, so a wall straight ahead is lit
    // evenly rather than with a hot spot.
    if (topDown) this.playerLight.position.set(anchor.x, 0.95, anchor.z);
    else this.playerLight.position.set(pose.position[0], 0.62, pose.position[2]);
    this.playerLight.distance = (topDown ? 5.4 : 4.6) + lightRadius * 0.8;
    this.playerLight.intensity = (topDown ? 2.8 : 1.9) * (1 + lightRadius * 0.14);
    this.scene.fog.near = topDown ? this.rig.focus + 2.5 : 0.9;
    this.scene.fog.far = (topDown ? this.rig.focus + 8 : 5.4) + lightRadius * 0.8;
    this.ambient.intensity = topDown ? 1.5 : 1.05;
    if (topDown) {
      this.pawn.position.set(anchor.x, 0, anchor.z);
      this.pawnShadow.position.set(anchor.x, 0.012, anchor.z);
    }
    this.dustAnchor = anchor;
    return moving;
  }

  animate() {
    const seconds = this.clock / 1000;
    const flameFrame = Math.floor(this.clock / 110);
    this.shared.torchMaterials.forEach((material, phase) => {
      material.map = this.shared.torchTextures[(flameFrame + phase) % 2];
    });
    this.shared.torchGlow.opacity = 0.28 + 0.05 * Math.sin(seconds * 9.1);
    this.torchLights.forEach((light, index) => {
      if (!light.userData.base) return;
      light.intensity = light.userData.base * (0.9 + 0.07 * Math.sin(seconds * 11 + index * 2.1) + 0.05 * Math.sin(seconds * 23.7 + index));
    });

    // Motes wrap around the player so the air is never empty.
    const anchor = this.dustAnchor;
    const positions = this.dust.geometry.attributes.position;
    const span = DUST_SPREAD * 2;
    const ceiling = this.rig.wallHeight + (this.mode === "top-down" ? 0.5 : 0);
    this.dustSeeds.forEach((seed, index) => {
      const x = seed.x + seconds * seed.drift;
      const z = seed.z + seconds * seed.drift * 0.6;
      positions.setXYZ(
        index,
        anchor.x + ((((x - anchor.x) % span) + span) % span) - DUST_SPREAD,
        (seed.y + 0.05 * Math.sin(seconds * 0.5 + seed.phase)) * ceiling,
        anchor.z + ((((z - anchor.z) % span) + span) % span) - DUST_SPREAD
      );
    });
    positions.needsUpdate = true;
  }

  // -------------------------------------------------------------------------
  // World
  // -------------------------------------------------------------------------

  syncWorld(input) {
    const key = [
      this.mode, input.floor, input.mapRevision, input.x, input.y, input.dir, input.lightTurns, input.lightPower,
      input.mapFragments?.length || 0, input.decorSeed, input.hasArcaneSense,
      input.roamingMonsters.map((monster) => `${monster.floor}:${monster.x}:${monster.y}:${monster.kind}`).join(";")
    ].join("|");
    if (key === this.worldKey) return false;
    this.worldKey = key;
    this.clearWorld();
    this.buildWorld(input);
    return true;
  }

  clearWorld() {
    // Materials and textures belong to the theme or the shared set; only the
    // geometry built for this layout is owned by the world group.
    this.world.children.forEach((child) => {
      if (child.userData.ownsGeometry) child.geometry.dispose();
    });
    this.world.clear();
    this.torches = [];
  }

  buildWorld(input) {
    const { theme, rig } = this;
    const topDown = this.mode === "top-down";
    const visual = input.visual || {};
    // First-person keeps each biome's ceiling height: low in the mine, tall in
    // the catacombs. Top-down walls stay cut low so they never hide the floor.
    const ceilingHeight = Number(visual.geometry?.ceilingHeight) || 1;
    const height = rig.wallHeight * (rig.ceiling ? Math.max(0.75, Math.min(1.3, ceilingHeight)) : 1);
    const cells = collectThreeViewCells({ ...input, mode: this.mode });
    const faces = collectThreeViewWallFaces(input.map, cells);
    const batches = {
      floor: new QuadBatch(), ceiling: new QuadBatch(), wall: new QuadBatch(), trap: new QuadBatch(),
      barrier: new QuadBatch(), shadow: new QuadBatch(), decor: theme.decor.map(() => new QuadBatch())
    };
    const playerKey = `${input.x},${input.y}`;

    for (const { x, y, cell, inSight } of cells) {
      const tint = inSight ? 1 : REMEMBERED_TINT;
      batches.floor.flat(x, y, 0.5, 0.5, 0, tint);
      if (rig.ceiling) batches.ceiling.flat(x, y, 0.5, 0.5, height, tint, false);
      const prop = describeCellProp(cell, visual);
      // Out of sight, the top-down view keeps only what the minimap also marks.
      if (!prop || (!inSight && !prop.mapped)) continue;
      if (prop.layer === "trap") batches.trap.flat(x, y, 0.3, 0.3, 0.012, tint);
      else if (prop.layer === "floor") this.addFloorDecal(prop, x, y, tint);
      // A billboard in the player's own cell would sit on the first-person lens.
      else if (topDown || `${x},${y}` !== playerKey) this.addBillboard(prop, x, y, tint, inSight, batches.shadow);
    }

    const slabs = new Set();
    const posts = new Map();
    for (const { x, y, dir, kind, inSight } of faces) {
      const nx = DX[dir];
      const nz = DY[dir];
      const edgeX = x + nx / 2;
      const edgeZ = y + nz / 2;
      const tint = inSight ? 1 : REMEMBERED_TINT;
      if (kind === "one-way") {
        batches.barrier.upright(edgeX - nx * 0.03, edgeZ - nz * 0.03, -nx, -nz, 0.5, 0, height, 1);
        continue;
      }
      const edgeKey = getWallEdgeKey(x, y, dir);
      if (!slabs.has(edgeKey)) {
        slabs.add(edgeKey);
        const half = WALL_THICKNESS / 2;
        const uv = [0, 0, 1, height];
        batches.wall.upright(edgeX - nx * half, edgeZ - nz * half, -nx, -nz, 0.5, 0, height, tint, uv);
        batches.wall.upright(edgeX + nx * half, edgeZ + nz * half, nx, nz, 0.5, 0, height, tint, uv);
        if (topDown) batches.wall.flat(edgeX, edgeZ, nx ? half : 0.5, nx ? 0.5 : half, height, tint * 0.86, true, [0, 0, 1, WALL_THICKNESS]);
        // Both ends of the slab get a corner post, which also hides its end faces.
        [-0.5, 0.5].forEach((side) => {
          const postKey = `${(edgeX + nz * side) * 2},${(edgeZ + nx * side) * 2}`;
          posts.set(postKey, Math.max(posts.get(postKey) || 0, tint));
        });
      }
      const decor = getWallDecorIndex({ seed: input.decorSeed, floor: input.floor, x, y, dir, count: batches.decor.length });
      const inset = WALL_THICKNESS / 2 + 0.008;
      if (decor >= 0) {
        batches.decor[decor].upright(edgeX - nx * inset, edgeZ - nz * inset, -nx, -nz, 0.26 * Math.min(1, height + 0.2), height * 0.22, height * 0.84, tint);
      } else if (hasWallTorch({ seed: input.decorSeed, floor: input.floor, x, y, dir })) {
        this.addTorch(edgeX, edgeZ, -nx, -nz, inset, height * 0.6, inSight);
      }
    }

    posts.forEach((tint, key) => {
      const [px, pz] = key.split(",").map((value) => Number(value) / 2);
      const uv = [0, 0, POST_HALF_WIDTH * 2, height];
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([nx, nz]) => {
        batches.wall.upright(px + nx * POST_HALF_WIDTH, pz + nz * POST_HALF_WIDTH, nx, nz, POST_HALF_WIDTH, 0, height + 0.012, tint * 0.9, uv);
      });
      if (topDown) batches.wall.flat(px, pz, POST_HALF_WIDTH, POST_HALF_WIDTH, height + 0.012, tint * 0.78, true, [0, 0, 0.14, 0.14]);
    });

    this.addBatch(batches.floor, theme.floor);
    this.addBatch(batches.ceiling, theme.ceiling);
    this.addBatch(batches.wall, theme.wall);
    this.addBatch(batches.trap, theme.trap);
    batches.decor.forEach((batch, index) => this.addBatch(batch, theme.decor[index]));
    this.addBatch(batches.barrier, theme.barrier);
    this.addRoamers(input, cells, batches.shadow);
    this.addBatch(batches.shadow, this.shared.shadowMaterial);
    this.assignTorchLights(input);
    this.worldStats = { cells: cells.length, torches: this.torches.length };
  }

  addBatch(batch, material) {
    const geometry = batch.build();
    if (!geometry) return;
    const mesh = new Mesh(geometry, material);
    mesh.userData.ownsGeometry = true;
    this.world.add(mesh);
  }

  propMaterial(prop, kind, dim) {
    const key = `${kind}:${prop.key}:${dim}`;
    let material = this.theme.props.get(key);
    if (!material) {
      const texture = pixelTexture(paintPropCanvas(prop));
      const tint = new Color(dim ? REMEMBERED_TINT : 1, dim ? REMEMBERED_TINT : 1, dim ? REMEMBERED_TINT : 1);
      material = kind === "sprite"
        ? new SpriteMaterial({ map: texture, alphaTest: 0.5, color: tint })
        : new MeshLambertMaterial({ map: texture, alphaTest: 0.5, color: tint });
      this.theme.props.set(key, material);
    }
    return material;
  }

  addBillboard(prop, x, z, tint, inSight, shadows) {
    const sprite = new Sprite(this.propMaterial(prop, "sprite", !inSight));
    sprite.center.set(0.5, PROP_FLOOR_ANCHOR);
    sprite.position.set(x, 0, z);
    this.world.add(sprite);
    shadows.flat(x, z, 0.34, 0.34, 0.011, 1);
    if (prop.glow && inSight) this.addGlow(x, 0.3, z, prop.glow, 0.95, 0.3);
  }

  addFloorDecal(prop, x, z, tint) {
    const decal = new Mesh(this.shared.floorPlane, this.propMaterial(prop, "decal", tint < 1));
    decal.position.set(x, 0.012, z);
    this.world.add(decal);
    if (prop.glow && tint === 1) this.addGlow(x, 0.12, z, prop.glow, 1.1, 0.3);
  }

  addGlow(x, y, z, color, size, opacity) {
    const key = `glow:${color}:${opacity}`;
    let material = this.theme.props.get(key);
    if (!material) {
      material = new SpriteMaterial({ map: this.shared.glowTexture, color, blending: AdditiveBlending, depthWrite: false, transparent: true, opacity });
      this.theme.props.set(key, material);
    }
    const glow = new Sprite(material);
    glow.position.set(x, y, z);
    glow.scale.set(size, size, 1);
    this.world.add(glow);
  }

  /** A torch on the wall face at (edgeX, edgeZ) that faces (nx, nz). */
  addTorch(edgeX, edgeZ, nx, nz, inset, y, inSight) {
    const x = edgeX + nx * (inset + 0.09);
    const z = edgeZ + nz * (inset + 0.09);
    const flame = new Sprite(this.shared.torchMaterials[this.torches.length % 2]);
    flame.center.set(0.5, 0.35);
    flame.position.set(x, y, z);
    flame.scale.set(0.2, 0.3, 1);
    const glow = new Sprite(this.shared.torchGlow);
    glow.position.set(x, y + 0.06, z);
    glow.scale.set(0.95, 0.95, 1);
    this.world.add(flame, glow);
    // The light stands a little off the wall so the stone behind is not blown out.
    this.torches.push({ x, y, z, lightX: edgeX + nx * 0.36, lightZ: edgeZ + nz * 0.36, inSight });
  }

  addRoamers(input, cells, shadows) {
    const sight = new Set(cells.filter((cell) => cell.inSight).map((cell) => `${cell.x},${cell.y}`));
    for (const monster of input.roamingMonsters) {
      if (monster.floor !== input.floor || !sight.has(`${monster.x},${monster.y}`)) continue;
      if (monster.perception === "afterimage" && !input.hasArcaneSense) continue;
      if (monster.x === input.x && monster.y === input.y) continue;
      // Amber for elites, the minimap's own colour for them; red otherwise.
      const color = monster.kind === "elite" ? "#e08c14" : "#d9483b";
      let material = this.shared.roamerMaterials.get(color);
      if (!material) {
        material = new SpriteMaterial({ map: pixelTexture(paintRoamerCanvas(color)), alphaTest: 0.5 });
        this.shared.roamerMaterials.set(color, material);
      }
      const sprite = new Sprite(material);
      sprite.center.set(0.5, 0);
      sprite.position.set(monster.x, 0, monster.y);
      sprite.scale.set(0.54, 0.45, 1);
      this.world.add(sprite);
      shadows.flat(monster.x, monster.y, 0.32, 0.32, 0.011, 1);
    }
  }

  /** The nearest few torches get real lights; the rest are flame and halo only. */
  assignTorchLights(input) {
    const px = Number(input.x) || 0;
    const pz = Number(input.y) || 0;
    const nearest = this.torches
      .filter((torch) => torch.inSight)
      .map((torch) => ({ torch, distance: Math.hypot(torch.x - px, torch.z - pz) }))
      .filter(({ distance }) => distance < 6.5)
      .sort((a, b) => a.distance - b.distance);
    this.torchLights.forEach((light, index) => {
      const entry = nearest[index];
      light.userData.base = entry ? 1.1 : 0;
      light.intensity = light.userData.base;
      if (entry) light.position.set(entry.torch.lightX, entry.torch.y, entry.torch.lightZ);
    });
  }

  // -------------------------------------------------------------------------
  // Teardown
  // -------------------------------------------------------------------------

  disposeTheme() {
    if (!this.theme) return;
    this.clearWorld();
    const { wall, floor, ceiling, trap, barrier, pawn, decor, props } = this.theme;
    [wall, floor, ceiling, trap, barrier, pawn, ...decor, ...props.values()].forEach((material) => {
      // Halo materials reuse the shared glow texture; everything else owns its map.
      if (material.map && material.map !== this.shared.glowTexture) material.map.dispose();
      material.dispose();
    });
    this.theme = null;
    this.themeKey = null;
  }

  removeDom() {
    this.canvas.remove();
    this.toggle.remove();
    if (this.host) delete this.host.dataset.threeView;
  }

  dispose() {
    this.resizeObserver?.disconnect();
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.disposeTheme();
    const { glowTexture, shadowTexture, torchTextures, torchMaterials, torchGlow, floorPlane, roamerMaterials, shadowMaterial } = this.shared;
    roamerMaterials.forEach((material) => {
      material.map.dispose();
      material.dispose();
    });
    [glowTexture, shadowTexture, ...torchTextures, ...torchMaterials, torchGlow, floorPlane, shadowMaterial].forEach((resource) => resource.dispose());
    this.dust.geometry.dispose();
    this.dust.material.dispose();
    this.pawnShadow.geometry.dispose();
    this.post?.dispose();
    this.renderer.dispose();
    this.removeDom();
  }
}

/** Mounts the prototype over the Pixi dungeon canvas. Throws if WebGL is unavailable. */
export function mountThreeDungeonView(request) {
  try {
    return new ThreeDungeonView(request);
  } catch (error) {
    // A half-built view must not leave its canvas over the Pixi view.
    document.getElementById("dungeon-three-canvas")?.remove();
    document.getElementById("three-view-toggle")?.remove();
    throw error;
  }
}
