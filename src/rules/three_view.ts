// balance-impact: none — presentation-only facts for the Three.js explore-view
// prototype (#2042). Nothing here reads or writes gameplay or save state.
//
// The prototype draws the same map the Pixi view draws, from one of two
// cameras. This module owns everything that can be decided without a GPU:
// which request turns the prototype on, where the camera stands, how it moves
// between two poses, and which cells and wall faces are allowed on screen.
import { DX, DY } from "../constants/directions.js";
import { isMapDirectionBlocked } from "./map_movement.js";
import { getVisibleCorridorCells, isRenderableCorridorCell } from "./renderer_topology.js";
import { getWallDecorIndex } from "./wall_decor.js";

export const THREE_VIEW_PARAM = "view3d";
export const THREE_VIEW_MODES = Object.freeze(["first-person", "top-down"] as const);
export type ThreeViewMode = (typeof THREE_VIEW_MODES)[number];

const MODE_ALIASES: Readonly<Record<string, ThreeViewMode>> = Object.freeze({
  fp: "first-person",
  "first-person": "first-person",
  td: "top-down",
  "top-down": "top-down"
});

export interface ThreeViewRequest {
  /** null keeps the prototype (and the Three.js chunk) out of the page. */
  readonly mode: ThreeViewMode | null;
  /** Bloom, depth blur, and grading. `view3dFx=0` turns them off. */
  readonly effects: boolean;
  /** Multiplier on the drawing-buffer resolution, 0.25–2. */
  readonly scale: number;
}

/**
 * The prototype is opt-in per page load: `?view3d=fp` or `?view3d=td`.
 * It deliberately does not reuse `?renderer=`, which always resolves to Pixi.
 */
export function resolveThreeViewRequest(search: unknown = ""): ThreeViewRequest {
  const params = new URLSearchParams(search as ConstructorParameters<typeof URLSearchParams>[0]);
  const mode = MODE_ALIASES[(params.get(THREE_VIEW_PARAM) || "").toLowerCase()] ?? null;
  const scale = Number(params.get("view3dScale"));
  return Object.freeze({
    mode,
    effects: params.get("view3dFx") !== "0",
    scale: Number.isFinite(scale) && scale > 0 ? Math.max(0.25, Math.min(2, scale)) : 1
  });
}

/** The toggle cycles first-person → top-down → off (the Pixi view) → … */
export function getNextThreeViewMode(mode: ThreeViewMode | null): ThreeViewMode | null {
  if (mode === "first-person") return "top-down";
  if (mode === "top-down") return null;
  return "first-person";
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------
//
// World space: one cell is one unit, the map's x is world X, the map's y is
// world Z, and Y is up. North (dir 0) is −Z, so a camera with yaw 0 already
// looks north and every clockwise quarter turn subtracts 90°.

export function getYawForDir(dir: unknown): number {
  const quarter = ((Math.trunc(Number(dir) || 0) % 4) + 4) % 4;
  return quarter === 0 ? 0 : -quarter * (Math.PI / 2);
}

/** Signed shortest rotation from one yaw to another, in (−π, π]. */
export function getShortestYawDelta(from: number, to: number): number {
  const turn = Math.PI * 2;
  let delta = (to - from) % turn;
  if (delta > Math.PI) delta -= turn;
  if (delta <= -Math.PI) delta += turn;
  return delta;
}

export interface ThreeViewRig {
  /** Vertical field of view in degrees. */
  readonly fov: number;
  readonly wallHeight: number;
  readonly ceiling: boolean;
  /** Camera offset from the player: metres behind, metres above the floor. */
  readonly back: number;
  readonly height: number;
  /** Where the camera looks: metres ahead of the player, metres above the floor. */
  readonly lookAhead: number;
  readonly lookHeight: number;
  /** Distance from the camera to the player; depth blur focuses here. */
  readonly focus: number;
}

const FIRST_PERSON_EYE = 0.52;
// Cells that must fit across the screen at the player's row in the top-down
// view. A portrait phone is narrow, so the camera backs off until they fit.
const TOP_DOWN_CELLS_ACROSS = 4.6;
const TOP_DOWN_FOV = 34;
const TOP_DOWN_PITCH = (50 * Math.PI) / 180;

function horizontalHalfFov(fovDegrees: number, aspect: number): number {
  return Math.atan(Math.tan((fovDegrees * Math.PI) / 360) * aspect);
}

/** Camera distance at which `cellsAcross` cells span the screen width. */
export function getTopDownDistance(aspect: number, fovDegrees = TOP_DOWN_FOV, cellsAcross = TOP_DOWN_CELLS_ACROSS): number {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  return cellsAcross / (2 * Math.tan(horizontalHalfFov(fovDegrees, safeAspect)));
}

export function getThreeViewRig(mode: ThreeViewMode, aspect: number): ThreeViewRig {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  if (mode === "top-down") {
    const distance = Math.min(22, getTopDownDistance(safeAspect));
    const lookAhead = 1.5;
    return Object.freeze({
      fov: TOP_DOWN_FOV,
      wallHeight: 0.62,
      ceiling: false,
      back: distance * Math.cos(TOP_DOWN_PITCH) - lookAhead,
      height: distance * Math.sin(TOP_DOWN_PITCH),
      lookAhead,
      lookHeight: 0,
      focus: distance
    });
  }
  // A portrait screen is narrow: widen the lens and stand a little behind the
  // cell centre so both side walls of the current cell stay in view.
  const portrait = safeAspect < 1;
  return Object.freeze({
    fov: portrait ? 92 : 66,
    wallHeight: 1,
    ceiling: true,
    back: portrait ? 0.42 : 0.3,
    height: FIRST_PERSON_EYE,
    lookAhead: 1,
    lookHeight: FIRST_PERSON_EYE - 0.04,
    focus: 1.8
  });
}

export interface ThreeViewAnchor {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
}

export interface ThreeViewPose {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
}

/** Camera position and look-at point for a player standing at `anchor`. */
export function getCameraPose(rig: ThreeViewRig, anchor: ThreeViewAnchor): ThreeViewPose {
  const forwardX = -Math.sin(anchor.yaw);
  const forwardZ = -Math.cos(anchor.yaw);
  return Object.freeze({
    position: Object.freeze([anchor.x - forwardX * rig.back, rig.height, anchor.z - forwardZ * rig.back] as const),
    target: Object.freeze([anchor.x + forwardX * rig.lookAhead, rig.lookHeight, anchor.z + forwardZ * rig.lookAhead] as const)
  });
}

export interface ThreeViewMove {
  /** 0 means "cut": a new floor, a teleport, or nothing to animate. */
  readonly duration: number;
  readonly kind: "none" | "step" | "turn" | "turn-around" | "cut";
}

// Same timings as the Pixi navigation motion so the two views can be compared
// on feel, not on speed.
const MOVE_DURATION_MS = Object.freeze({ step: 180, turn: 180, "turn-around": 220 });

/** How the camera gets from one resting anchor to the next. */
export function planCameraMove(from: ThreeViewAnchor | null, to: ThreeViewAnchor, sameFloor = true): ThreeViewMove {
  if (!from || !sameFloor) return Object.freeze({ duration: 0, kind: "cut" });
  const distance = Math.hypot(to.x - from.x, to.z - from.z);
  const turn = Math.abs(getShortestYawDelta(from.yaw, to.yaw));
  if (distance > 1.5) return Object.freeze({ duration: 0, kind: "cut" });
  if (turn > Math.PI * 0.75) return Object.freeze({ duration: MOVE_DURATION_MS["turn-around"], kind: "turn-around" });
  if (turn > 0.01) return Object.freeze({ duration: MOVE_DURATION_MS.turn, kind: "turn" });
  if (distance > 0.01) return Object.freeze({ duration: MOVE_DURATION_MS.step, kind: "step" });
  return Object.freeze({ duration: 0, kind: "none" });
}

export function easeOutCubic(progress: number): number {
  const t = Math.max(0, Math.min(1, progress));
  return 1 - (1 - t) ** 3;
}

/** The anchor `progress` (0–1, already eased) of the way from one to the next. */
export function interpolateAnchor(from: ThreeViewAnchor, to: ThreeViewAnchor, progress: number): ThreeViewAnchor {
  const t = Math.max(0, Math.min(1, progress));
  return {
    x: from.x + (to.x - from.x) * t,
    z: from.z + (to.z - from.z) * t,
    yaw: from.yaw + getShortestYawDelta(from.yaw, to.yaw) * t
  };
}

// ---------------------------------------------------------------------------
// What may be drawn
// ---------------------------------------------------------------------------

interface MapCell {
  readonly walls: readonly boolean[];
  readonly [key: string]: unknown;
}

type MapLike = readonly (readonly unknown[] | null | undefined)[];

export interface ThreeViewWorldInput {
  readonly mode: ThreeViewMode;
  readonly map: unknown;
  readonly x: unknown;
  readonly y: unknown;
  readonly dir: unknown;
  readonly visitedMap?: unknown;
  readonly mapFragments?: unknown;
  readonly lightTurns?: unknown;
  readonly lightPower?: unknown;
}

export interface ThreeViewCell {
  readonly x: number;
  readonly y: number;
  readonly cell: MapCell;
  /** In the player's sight right now; false means "remembered", drawn dimmer. */
  readonly inSight: boolean;
}

/** Light-spell reveal radius, the same rule the minimap uses. */
export function getLightRadius(lightTurns: unknown, lightPower: unknown): number {
  if (lightPower === "lomilwa") return 5;
  return Number(lightTurns) > 0 ? 3 : 0;
}

export const FIRST_PERSON_RADIUS = 7;
export const TOP_DOWN_RADIUS = 9;

/**
 * Cells the prototype may put on screen.
 *
 * First-person draws every cell near the player and lets walls and haze hide
 * the rest, exactly as standing in the corridor would.
 *
 * Top-down looks over the walls, so the walls cannot be what hides things.
 * It draws only what the player already knows — visited cells, cells a light
 * spell reveals, cells a map fragment reveals — plus the cells the
 * first-person view shows from this spot. It never shows more than the
 * minimap and the first-person view already do.
 */
export function collectThreeViewCells(input: ThreeViewWorldInput): ThreeViewCell[] {
  const map = Array.isArray(input.map) ? (input.map as MapLike) : null;
  const px = Number(input.x);
  const py = Number(input.y);
  if (!map || !Number.isInteger(px) || !Number.isInteger(py)) return [];
  const firstPerson = input.mode === "first-person";
  const radius = firstPerson ? FIRST_PERSON_RADIUS : TOP_DOWN_RADIUS;

  const sight = new Set<string>([`${px},${py}`]);
  if (!firstPerson) {
    const dir = ((Math.trunc(Number(input.dir) || 0) % 4) + 4) % 4;
    const right = (dir + 1) % 4;
    for (const { z, column } of getVisibleCorridorCells(map, px, py, dir)) {
      sight.add(`${px + DX[dir] * z + DX[right] * column},${py + DY[dir] * z + DY[right] * column}`);
    }
  }
  const visited = Array.isArray(input.visitedMap) ? (input.visitedMap as MapLike) : null;
  const fragments = new Set<unknown>(Array.isArray(input.mapFragments) ? input.mapFragments : []);
  const lightRadius = getLightRadius(input.lightTurns, input.lightPower);

  const cells: ThreeViewCell[] = [];
  for (let y = Math.max(0, py - radius); y <= Math.min(map.length - 1, py + radius); y += 1) {
    const row = map[y];
    if (!Array.isArray(row)) continue;
    for (let x = Math.max(0, px - radius); x <= Math.min(row.length - 1, px + radius); x += 1) {
      const cell = row[x];
      if (!isRenderableCorridorCell(cell)) continue;
      const key = `${x},${y}`;
      const inSight = firstPerson || sight.has(key);
      if (!inSight) {
        const lit = lightRadius > 0 && Math.abs(x - px) + Math.abs(y - py) <= lightRadius;
        const known = Boolean(visited?.[y]?.[x]) || lit || fragments.has(key);
        if (!known) continue;
      }
      cells.push({ x, y, cell: cell as MapCell, inSight });
    }
  }
  return cells;
}

export interface ThreeViewWallFace {
  /** The cell the face belongs to and the side of that cell it closes. */
  readonly x: number;
  readonly y: number;
  readonly dir: number;
  /**
   * "wall" is solid from both sides. "one-way" is an opening this cell cannot
   * pass through (the far cell refuses entry); it is drawn as a barrier.
   */
  readonly kind: "wall" | "one-way";
  readonly inSight: boolean;
}

/** One entry per closed side of every drawn cell. */
export function collectThreeViewWallFaces(map: unknown, cells: readonly ThreeViewCell[]): ThreeViewWallFace[] {
  const faces: ThreeViewWallFace[] = [];
  for (const { x, y, cell, inSight } of cells) {
    for (let dir = 0; dir < 4; dir += 1) {
      if (cell.walls[dir]) faces.push({ x, y, dir, kind: "wall", inSight });
      else if (isMapDirectionBlocked(map, x, y, dir)) {
        const neighbor = (map as MapLike | null)?.[y + DY[dir]]?.[x + DX[dir]];
        faces.push({ x, y, dir, kind: isRenderableCorridorCell(neighbor) ? "one-way" : "wall", inSight });
      }
    }
  }
  return faces;
}

/**
 * A wall stands on the edge between two cells and is listed once from each
 * side. This key is the same from both, so the edge gets one slab.
 */
export function getWallEdgeKey(x: number, y: number, dir: number): string {
  if (dir === 0 || dir === 3) return `${x},${y},${dir}`;
  return `${x + DX[dir]},${y + DY[dir]},${(dir + 2) % 4}`;
}

/** Share of bare wall faces that carry a torch. */
export const WALL_TORCH_DENSITY = 0.045;

/**
 * Whether a wall face carries a torch. Like wall decor (#1964) this is a pure
 * function of the run seed, the floor, and the face, so torches stay put.
 */
export function hasWallTorch({ seed = "", floor = 1, x, y, dir }: {
  seed?: string;
  floor?: number;
  x: number;
  y: number;
  dir: number;
}): boolean {
  return getWallDecorIndex({ seed: `${seed}:torch`, floor, x, y, dir, count: 1, density: WALL_TORCH_DENSITY }) === 0;
}
