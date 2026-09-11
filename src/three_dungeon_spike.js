// balance-impact: none — isolated visual proof harness; it is not the production renderer.
import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Fog,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from "three";
import { getVisibleCorridorTopology } from "./rules/renderer_topology.js";

export const THREE_DUNGEON_SPIKE_VIEW = Object.freeze({
  width: 400,
  height: 260,
});

// Frozen Phase 1 profile. The prototype deliberately does not accept topology
// or biome values here: one profile must explain every archetype.
export const THREE_DUNGEON_SPIKE_PROFILE = Object.freeze({
  cellWidth: 1.8,
  cellDepth: 2.8,
  wallHeight: 2.2,
  wallThickness: 0.12,
  startZ: 1.4,
  eyeHeight: 1.1,
  eyeZ: 1.5,
  lookAtHeight: 0.56,
  lookAtZ: -3.0,
  fov: 100,
  fogNear: 4.8,
  fogFar: 15.5,
});

const DEFAULT_BACKGROUND = "#0d1014";
const DEFAULT_WALL = "#58d6e8";

function color(value, fallback) {
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
    materials.filter(Boolean).forEach((material) => material.dispose());
  });
}

function sideBranchOrientation(column) {
  if (column < 0) return Math.PI / 2;
  if (column > 0) return -Math.PI / 2;
  return 0;
}

function frameForCell(cell) {
  if (cell.column < 0) {
    return {
      leftBlocked: cell.backBlocked,
      rightBlocked: cell.frontBlocked,
      frontBlocked: cell.leftBlocked,
      backBlocked: cell.rightBlocked,
    };
  }
  if (cell.column > 0) {
    return {
      leftBlocked: cell.frontBlocked,
      rightBlocked: cell.backBlocked,
      frontBlocked: cell.rightBlocked,
      backBlocked: cell.leftBlocked,
    };
  }
  return {
    leftBlocked: cell.leftBlocked,
    rightBlocked: cell.rightBlocked,
    frontBlocked: cell.frontBlocked,
    backBlocked: cell.backBlocked,
  };
}

function addSurface(parent, geometry, material, position, surface, topology, rotation = null) {
  const mesh = new Mesh(geometry, material.clone());
  mesh.position.set(position.x, position.y, position.z);
  if (rotation) mesh.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
  mesh.userData = {
    surface,
    topology: { z: topology.z, column: topology.column, x: topology.x, y: topology.y },
  };
  parent.add(mesh);
  return mesh;
}

function addCellGeometry(root, cell, profile, floorMaterial, wallMaterial) {
  if (!cell.valid) return;

  const cellGroup = new Group();
  const rotationY = sideBranchOrientation(cell.column);
  cellGroup.position.set(cell.column * profile.cellWidth, 0, profile.startZ - cell.z * profile.cellDepth);
  cellGroup.rotation.y = rotationY;
  cellGroup.userData = {
    topology: { z: cell.z, column: cell.column, x: cell.x, y: cell.y },
    geometry: { ...profile },
  };
  root.add(cellGroup);

  addSurface(
    cellGroup,
    new PlaneGeometry(profile.cellWidth, profile.cellDepth),
    floorMaterial,
    { x: 0, y: 0, z: 0 },
    "floor",
    cell,
    { x: -Math.PI / 2 }
  );
  addSurface(
    cellGroup,
    new PlaneGeometry(profile.cellWidth, profile.cellDepth),
    floorMaterial,
    { x: 0, y: profile.wallHeight, z: 0 },
    "ceiling",
    cell,
    { x: Math.PI / 2 }
  );

  const frame = frameForCell(cell);
  const frontWall = new BoxGeometry(profile.cellWidth, profile.wallHeight, profile.wallThickness);
  const sideWall = new BoxGeometry(profile.wallThickness, profile.wallHeight, profile.cellDepth);
  const wallY = profile.wallHeight / 2;
  if (frame.frontBlocked) addSurface(cellGroup, frontWall, wallMaterial, { x: 0, y: wallY, z: -profile.cellDepth / 2 }, "front-wall", cell);
  if (frame.backBlocked) addSurface(cellGroup, frontWall, wallMaterial, { x: 0, y: wallY, z: profile.cellDepth / 2 }, "back-wall", cell);
  if (frame.leftBlocked) addSurface(cellGroup, sideWall, wallMaterial, { x: -profile.cellWidth / 2, y: wallY, z: 0 }, "left-wall", cell);
  if (frame.rightBlocked) addSurface(cellGroup, sideWall, wallMaterial, { x: profile.cellWidth / 2, y: wallY, z: 0 }, "right-wall", cell);
}

export function createThreeDungeonSpikeRenderer(canvas, options = {}) {
  if (!canvas) throw new Error("A canvas is required for the dungeon spike renderer");

  const profile = THREE_DUNGEON_SPIKE_PROFILE;
  const webgl = new WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "low-power",
    preserveDrawingBuffer: true,
  });
  webgl.setPixelRatio(1);
  webgl.setSize(THREE_DUNGEON_SPIKE_VIEW.width, THREE_DUNGEON_SPIKE_VIEW.height, false);
  webgl.outputColorSpace = "srgb";

  const scene = new Scene();
  const camera = new PerspectiveCamera(
    profile.fov,
    THREE_DUNGEON_SPIKE_VIEW.width / THREE_DUNGEON_SPIKE_VIEW.height,
    0.05,
    40
  );
  const cameraTarget = Object.freeze({ x: 0, y: profile.lookAtHeight, z: profile.lookAtZ });
  camera.position.set(0, profile.eyeHeight, profile.eyeZ);
  camera.lookAt(cameraTarget.x, cameraTarget.y, cameraTarget.z);
  const root = new Group();
  scene.add(root);

  const renderer = {
    canvas,
    webgl,
    scene,
    camera,
    root,
    profile,
    cameraTarget,
    renderTopology(topology, visual = {}) {
      while (root.children.length > 0) {
        const child = root.children.pop();
        disposeObject(child);
      }

      const background = color(visual.background, DEFAULT_BACKGROUND);
      const wall = color(visual.wallColor, DEFAULT_WALL);
      // One shared material family carries hierarchy: path floor is brighter,
      // enclosure walls/ceiling are quieter. No branch receives a special
      // material or lighting treatment.
      const floorColor = background.clone().lerp(wall, 0.82);
      const wallColor = background.clone().lerp(wall, 0.025);
      const floorMaterial = new MeshStandardMaterial({
        color: floorColor,
        roughness: 0.96,
        metalness: 0.06,
        side: DoubleSide,
      });
      const wallMaterial = new MeshStandardMaterial({
        color: wallColor,
        roughness: 0.78,
        metalness: 0.28,
        emissive: wall,
        emissiveIntensity: 0.08,
        side: DoubleSide,
      });

      scene.background = background;
      scene.fog = new Fog(background, profile.fogNear, profile.fogFar);
      webgl.setClearColor(background, 1);
      root.add(new AmbientLight(0x8e9aa0, 0.58));
      const keyLight = new DirectionalLight(wall, 0.65);
      keyLight.position.set(-2, 5, 4);
      root.add(keyLight);
      topology.forEach((cell) => addCellGeometry(root, cell, profile, floorMaterial, wallMaterial));
      floorMaterial.dispose();
      wallMaterial.dispose();

      // Reapply the same camera transform after every rebuild. No topology
      // branch is allowed to influence eye, heading, or FOV.
      camera.fov = profile.fov;
      camera.position.set(0, profile.eyeHeight, profile.eyeZ);
      camera.lookAt(cameraTarget.x, cameraTarget.y, cameraTarget.z);
      camera.updateProjectionMatrix();
      webgl.render(scene, camera);
    },
    renderMap(map, x, y, dir, visual = {}) {
      this.renderTopology(getVisibleCorridorTopology(map, x, y, dir), visual);
    },
    getCameraContract() {
      return {
        position: camera.position.toArray().map((value) => Number(value.toFixed(6))),
        target: [cameraTarget.x, cameraTarget.y, cameraTarget.z],
        fov: camera.fov,
      };
    },
    getTopologySurfaces() {
      const surfaces = [];
      root.traverse((child) => {
        if (child.userData?.surface) surfaces.push({
          surface: child.userData.surface,
          topology: child.userData.topology,
          y: child.position.y,
        });
      });
      return surfaces;
    },
    dispose() {
      while (root.children.length > 0) {
        const child = root.children.pop();
        disposeObject(child);
      }
      webgl.dispose();
    },
  };

  canvas.dataset.renderer = "three-dungeon-spike";
  canvas.width = THREE_DUNGEON_SPIKE_VIEW.width;
  canvas.height = THREE_DUNGEON_SPIKE_VIEW.height;
  if (options.className) canvas.className = options.className;
  return renderer;
}
