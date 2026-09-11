// balance-impact: none — isolated visual proof harness; it is not the production renderer.
import {
  AmbientLight,
  Box3,
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
  PointLight,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { getVisibleCorridorTopology } from "./rules/renderer_topology.js";

export const THREE_DUNGEON_SPIKE_VIEW = Object.freeze({
  width: 400,
  height: 260,
});

// Candidate Phase 1 profile. Freeze only after Phase 1 and Phase 2 human
// visual review pass. The prototype deliberately does not accept topology or
// biome values here: one profile must explain every archetype.
export const THREE_DUNGEON_SPIKE_PROFILE = Object.freeze({
  cellWidth: 1.6,
  wallHeight: 2.4,
  // Keep cells square so a side branch's rotated floor shares the exact edge
  // of its neighbor; this is a geometry invariant, not a camera adjustment.
  cellDepth: 1.6,
  wallThickness: 0.18,
  startZ: 0.9,
  eyeHeight: 1.8,
  eyeZ: 1.8,
  lookAtHeight: 0.2,
  lookAtZ: 0.0,
  fov: 80,
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

function disposeObject(object, stats = null) {
  object.traverse((child) => {
    if (child.geometry) {
      if (stats?.ownedGeometries?.delete(child.geometry)) stats.disposedGeometries += 1;
      child.geometry.dispose();
    }
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.filter(Boolean).forEach((material) => {
      if (stats?.ownedMaterials?.delete(material)) stats.disposedMaterials += 1;
      material.dispose();
    });
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

function createGeometry(stats, Geometry, ...args) {
  const geometry = new Geometry(...args);
  stats.createdGeometries += 1;
  stats.ownedGeometries.add(geometry);
  return geometry;
}

function addSurface(parent, geometry, material, position, surface, topology, stats, rotation = null) {
  const mesh = new Mesh(geometry, material.clone());
  stats.ownedMaterials.add(mesh.material);
  stats.createdMaterials += 1;
  mesh.position.set(position.x, position.y, position.z);
  if (rotation) mesh.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
  mesh.receiveShadow = true;
  mesh.castShadow = surface.endsWith("wall");
  mesh.userData = {
    surface,
    topology: { z: topology.z, column: topology.column, x: topology.x, y: topology.y },
  };
  parent.add(mesh);
  return mesh;
}

function addCellGeometry(root, cell, profile, floorMaterial, wallMaterial, ceilingMaterial, stats) {
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
    createGeometry(stats, PlaneGeometry, profile.cellWidth, profile.cellDepth),
    floorMaterial,
    { x: 0, y: 0, z: 0 },
    "floor",
    cell,
    stats,
    { x: -Math.PI / 2 }
  );
  addSurface(
    cellGroup,
    createGeometry(stats, PlaneGeometry, profile.cellWidth, profile.cellDepth),
    ceilingMaterial,
    { x: 0, y: profile.wallHeight, z: 0 },
    "ceiling",
    cell,
    stats,
    { x: Math.PI / 2 }
  );

  const frame = frameForCell(cell);
  cellGroup.userData.frame = frame;
  const wallY = profile.wallHeight / 2;
  if (frame.frontBlocked) addSurface(
    cellGroup,
    createGeometry(stats, BoxGeometry, profile.cellWidth, profile.wallHeight, profile.wallThickness),
    wallMaterial,
    { x: 0, y: wallY, z: -profile.cellDepth / 2 },
    "front-wall",
    cell,
    stats
  );
  if (frame.backBlocked) addSurface(
    cellGroup,
    createGeometry(stats, BoxGeometry, profile.cellWidth, profile.wallHeight, profile.wallThickness),
    wallMaterial,
    { x: 0, y: wallY, z: profile.cellDepth / 2 },
    "back-wall",
    cell,
    stats
  );
  if (frame.leftBlocked) addSurface(
    cellGroup,
    createGeometry(stats, BoxGeometry, profile.wallThickness, profile.wallHeight, profile.cellDepth),
    wallMaterial,
    { x: -profile.cellWidth / 2, y: wallY, z: 0 },
    "left-wall",
    cell,
    stats
  );
  if (frame.rightBlocked) addSurface(
    cellGroup,
    createGeometry(stats, BoxGeometry, profile.wallThickness, profile.wallHeight, profile.cellDepth),
    wallMaterial,
    { x: profile.cellWidth / 2, y: wallY, z: 0 },
    "right-wall",
    cell,
    stats
  );
}

function positiveDimension(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : fallback;
}

export function createThreeDungeonSpikeRenderer(canvas, options = {}) {
  if (!canvas) throw new Error("A canvas is required for the dungeon spike renderer");

  const profile = THREE_DUNGEON_SPIKE_PROFILE;
  const view = Object.freeze({
    width: positiveDimension(options.width, positiveDimension(canvas.clientWidth, THREE_DUNGEON_SPIKE_VIEW.width)),
    height: positiveDimension(options.height, positiveDimension(canvas.clientHeight, THREE_DUNGEON_SPIKE_VIEW.height)),
  });
  const webgl = new WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "low-power",
    preserveDrawingBuffer: true,
  });
  webgl.shadowMap.enabled = true;
  webgl.setPixelRatio(1);
  webgl.setSize(view.width, view.height, false);
  webgl.outputColorSpace = "srgb";

  const scene = new Scene();
  const camera = new PerspectiveCamera(
    profile.fov,
    view.width / view.height,
    0.05,
    40
  );
  const cameraTarget = Object.freeze({ x: 0, y: profile.lookAtHeight, z: profile.lookAtZ });
  camera.position.set(0, profile.eyeHeight, profile.eyeZ);
  camera.lookAt(cameraTarget.x, cameraTarget.y, cameraTarget.z);
  const root = new Group();
  scene.add(root);
  const resourceStats = {
    rebuilds: 0,
    createdGeometries: 0,
    createdMaterials: 0,
    disposedGeometries: 0,
    disposedMaterials: 0,
    ownedGeometries: new Set(),
    ownedMaterials: new Set(),
  };

  const renderer = {
    canvas,
    webgl,
    scene,
    camera,
    root,
    profile,
    cameraTarget,
    renderTopology(topology, visual = {}) {
      resourceStats.rebuilds += 1;
      while (root.children.length > 0) {
        const child = root.children.pop();
        disposeObject(child, resourceStats);
      }

      const background = color(visual.background, DEFAULT_BACKGROUND);
      const wall = color(visual.wallColor, DEFAULT_WALL);
      // One shared material family carries hierarchy: path floor is brighter,
      // enclosure walls/ceiling are quieter. No branch receives a special
      // material or lighting treatment.
      const floorColor = background.clone().lerp(wall, 0.72);
      const wallColor = background.clone().lerp(wall, 0.22);
      const ceilingColor = background.clone().lerp(wall, 0.025);
      const floorMaterial = new MeshStandardMaterial({
        color: floorColor,
        emissive: floorColor,
        emissiveIntensity: 0.5,
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
      const ceilingMaterial = new MeshStandardMaterial({
        color: ceilingColor,
        roughness: 0.9,
        metalness: 0.08,
        side: DoubleSide,
      });

      scene.background = background;
      scene.fog = new Fog(background, profile.fogNear, profile.fogFar);
      webgl.setClearColor(background, 1);
      root.add(new AmbientLight(0x8e9aa0, 0.42));
      const keyLight = new DirectionalLight(wall, 0.72);
      keyLight.position.set(-2, 5, 4);
      keyLight.castShadow = true;
      root.add(keyLight);
      const fillLight = new PointLight(wall, 0.8, 10);
      fillLight.position.set(0, 2.2, 1.5);
      root.add(fillLight);
      topology.forEach((cell) => addCellGeometry(root, cell, profile, floorMaterial, wallMaterial, ceilingMaterial, resourceStats));
      floorMaterial.dispose();
      wallMaterial.dispose();
      ceilingMaterial.dispose();

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
        aspect: camera.aspect,
        view: [view.width, view.height],
      };
    },
    getResourceStats() {
      return {
        rebuilds: resourceStats.rebuilds,
        createdGeometries: resourceStats.createdGeometries,
        createdMaterials: resourceStats.createdMaterials,
        disposedGeometries: resourceStats.disposedGeometries,
        disposedMaterials: resourceStats.disposedMaterials,
        unreleasedGeometries: resourceStats.ownedGeometries.size,
        unreleasedMaterials: resourceStats.ownedMaterials.size,
      };
    },
    getTopologySurfaces() {
      const surfaces = [];
      root.traverse((child) => {
        if (child.userData?.surface) surfaces.push({
          surface: child.userData.surface,
          topology: child.userData.topology,
          y: child.position.y,
          worldPosition: child.getWorldPosition(new Vector3()).toArray(),
          bounds: (() => {
            const box = new Box3().setFromObject(child);
            return {
              minX: box.min.x,
              maxX: box.max.x,
              minY: box.min.y,
              maxY: box.max.y,
              minZ: box.min.z,
              maxZ: box.max.z,
            };
          })(),
        });
      });
      return surfaces;
    },
    getTopologyFrames() {
      return root.children
        .filter((child) => child.userData?.frame)
        .map((child) => ({
          topology: child.userData.topology,
          frame: { ...child.userData.frame },
        }));
    },
    dispose() {
      while (root.children.length > 0) {
        const child = root.children.pop();
        disposeObject(child, resourceStats);
      }
      webgl.dispose();
    },
  };

  canvas.dataset.renderer = "three-dungeon-spike";
  canvas.width = view.width;
  canvas.height = view.height;
  if (options.className) canvas.className = options.className;
  return renderer;
}
