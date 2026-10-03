// Biome layout archetypes (#1962).
//
// Each biome owns one archetype that carves the floor skeleton from the floor
// seed. The archetype decides the overall silhouette of the floor (winding
// tunnels, a symmetric burial lattice, a chasm crossed by bridges, flooded
// stacks, concentric forge rings, fractured islands) while the shared generator
// pipeline keeps owning stairs, dead ends, events, traps, one-way passages,
// secret doors, and validation.
//
// Archetypes may declare impassable "void" cells (a chasm, a furnace, flooded
// stacks). Later generator stages must not carve into void cells, so the
// silhouette survives dead-end growth and secret-door placement.

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
const DIR_N = 0;
const DIR_E = 1;
const DIR_S = 2;
const DIR_W = 3;
const MIRROR_DIR = [DIR_N, DIR_W, DIR_S, DIR_E];

// The archetype's dominant terrain primitive keeps the existing structure
// vocabulary (#934) meaningful for metrics, telemetry, and maze ranges.
export const LAYOUT_ARCHETYPES = Object.freeze({
  mine_tunnels: Object.freeze({ primitive: "corridor" }),
  catacomb_lattice: Object.freeze({ primitive: "hub" }),
  rift_chasm: Object.freeze({ primitive: "loop" }),
  library_stacks: Object.freeze({ primitive: "openArea" }),
  forge_rings: Object.freeze({ primitive: "loop" }),
  abyss_islands: Object.freeze({ primitive: "hub" })
});

export function getLayoutArchetypePrimitive(archetypeId) {
  return LAYOUT_ARCHETYPES[archetypeId]?.primitive ?? null;
}

function randomInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

function pick(rng, values) {
  return values[Math.floor(rng() * values.length)];
}

function key(x, y) {
  return `${x},${y}`;
}

class LayoutCarver {
  constructor(grid, visited, { mirror = false } = {}) {
    this.grid = grid;
    this.visited = visited;
    this.width = grid[0].length;
    this.height = grid.length;
    this.mirror = mirror;
    this.voidKeys = new Set();
  }

  isInterior(x, y) {
    return x >= 1 && x < this.width - 1 && y >= 1 && y < this.height - 1;
  }

  isVoid(x, y) {
    return this.voidKeys.has(key(x, y));
  }

  isPassage(x, y) {
    return this.isInterior(x, y) && this.grid[y][x].walls.some(wall => !wall);
  }

  mark(x, y) {
    if (this.isInterior(x, y)) this.visited[y][x] = true;
  }

  openEdge(x, y, dir) {
    const nx = x + DX[dir];
    const ny = y + DY[dir];
    if (!this.isInterior(x, y) || !this.isInterior(nx, ny)) return false;
    if (this.isVoid(x, y) || this.isVoid(nx, ny)) return false;
    this.grid[y][x].walls[dir] = false;
    this.grid[ny][nx].walls[(dir + 2) % 4] = false;
    this.mark(x, y);
    this.mark(nx, ny);
    return true;
  }

  closeEdge(x, y, dir) {
    const nx = x + DX[dir];
    const ny = y + DY[dir];
    if (!this.isInterior(x, y) || !this.isInterior(nx, ny)) return;
    this.grid[y][x].walls[dir] = true;
    this.grid[ny][nx].walls[(dir + 2) % 4] = true;
    // A fully sealed cell is no longer part of the skeleton; later stages use
    // `visited` to find passage cells to attach the entrance to.
    if (this.grid[y][x].walls.every(Boolean)) this.visited[y][x] = false;
    if (this.grid[ny][nx].walls.every(Boolean)) this.visited[ny][nx] = false;
  }

  open(x, y, dir) {
    const opened = this.openEdge(x, y, dir);
    if (this.mirror) this.openEdge(this.width - 1 - x, y, MIRROR_DIR[dir]);
    return opened;
  }

  close(x, y, dir) {
    this.closeEdge(x, y, dir);
    if (this.mirror) this.closeEdge(this.width - 1 - x, y, MIRROR_DIR[dir]);
  }

  setVoid(x, y) {
    if (!this.isInterior(x, y)) return;
    this.voidKeys.add(key(x, y));
    if (this.mirror) this.voidKeys.add(key(this.width - 1 - x, y));
  }

  clearVoid(x, y) {
    this.voidKeys.delete(key(x, y));
    if (this.mirror) this.voidKeys.delete(key(this.width - 1 - x, y));
  }

  // Orthogonal two-leg path. `horizontalFirst` picks which leg comes first so
  // repeated waypoints read as switchbacks instead of uniform staircases.
  path(from, to, horizontalFirst = true) {
    let x = from.x;
    let y = from.y;
    this.mark(x, y);
    const stepX = () => {
      const dir = to.x > x ? DIR_E : DIR_W;
      this.open(x, y, dir);
      x += DX[dir];
    };
    const stepY = () => {
      const dir = to.y > y ? DIR_S : DIR_N;
      this.open(x, y, dir);
      y += DY[dir];
    };
    if (horizontalFirst) {
      while (x !== to.x) stepX();
      while (y !== to.y) stepY();
    } else {
      while (y !== to.y) stepY();
      while (x !== to.x) stepX();
    }
  }

  // Alternating one-step staircase. Each step turns, which is disorienting in
  // the first-person view and visibly diagonal on the full map.
  zigzag(from, to) {
    let x = from.x;
    let y = from.y;
    let horizontal = true;
    while (x !== to.x || y !== to.y) {
      if ((horizontal && x !== to.x) || y === to.y) {
        const dir = to.x > x ? DIR_E : DIR_W;
        this.open(x, y, dir);
        x += DX[dir];
      } else {
        const dir = to.y > y ? DIR_S : DIR_N;
        this.open(x, y, dir);
        y += DY[dir];
      }
      horizontal = !horizontal;
    }
  }

  room(room) {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        this.mark(x, y);
        if (this.mirror) this.mark(this.width - 1 - x, y);
        if (x + 1 < room.x + room.w) this.open(x, y, DIR_E);
        if (y + 1 < room.y + room.h) this.open(x, y, DIR_S);
      }
    }
  }

  // Straight dead-end spur that only enters sealed, non-void cells and does not
  // brush against other passages, so it stays a readable side vein.
  spur(start, dir, length) {
    let x = start.x;
    let y = start.y;
    let carved = 0;
    for (let step = 0; step < length; step++) {
      const nx = x + DX[dir];
      const ny = y + DY[dir];
      if (!this.isInterior(nx, ny) || this.isVoid(nx, ny) || this.isPassage(nx, ny)) break;
      const touchesOther = [0, 1, 2, 3].some(side => {
        const sx = nx + DX[side];
        const sy = ny + DY[side];
        return (sx !== x || sy !== y) && this.isPassage(sx, sy);
      });
      if (touchesOther) break;
      this.open(x, y, dir);
      x = nx;
      y = ny;
      carved++;
    }
    return carved;
  }

  // Parallel three-cell side passage around a straight run of the tunnel. The
  // side cells must be sealed and isolated so the bypass reads as its own lane.
  bypass(start, horizontal, side) {
    const along = horizontal ? DIR_E : DIR_S;
    const cross = horizontal ? (side > 0 ? DIR_S : DIR_N) : (side > 0 ? DIR_E : DIR_W);
    const run = [0, 1, 2].map(step => ({ x: start.x + DX[along] * step, y: start.y + DY[along] * step }));
    if (!run.every(cell => this.isPassage(cell.x, cell.y))) return false;
    if (run.slice(0, 2).some(cell => this.grid[cell.y][cell.x].walls[along])) return false;
    const lane = run.map(cell => ({ x: cell.x + DX[cross], y: cell.y + DY[cross] }));
    const laneKeys = new Set(lane.map(cell => key(cell.x, cell.y)));
    const runKeys = new Set(run.map(cell => key(cell.x, cell.y)));
    for (const cell of lane) {
      if (!this.isInterior(cell.x, cell.y) || this.isVoid(cell.x, cell.y) || this.isPassage(cell.x, cell.y)) return false;
      for (let dir = 0; dir < 4; dir++) {
        const nx = cell.x + DX[dir];
        const ny = cell.y + DY[dir];
        const neighborKey = key(nx, ny);
        if (laneKeys.has(neighborKey) || runKeys.has(neighborKey)) continue;
        if (this.isPassage(nx, ny)) return false;
      }
    }
    this.open(run[0].x, run[0].y, cross);
    this.open(lane[0].x, lane[0].y, along);
    this.open(lane[1].x, lane[1].y, along);
    this.open(lane[2].x, lane[2].y, (cross + 2) % 4);
    return true;
  }

  collectPassageCells() {
    const cells = [];
    for (let y = 1; y < this.height - 1; y++) {
      for (let x = 1; x < this.width - 1; x++) {
        if (this.isPassage(x, y)) cells.push({ x, y });
      }
    }
    return cells;
  }

  countComponents() {
    const seen = new Set();
    let components = 0;
    for (const start of this.collectPassageCells()) {
      if (seen.has(key(start.x, start.y))) continue;
      components++;
      const queue = [start];
      seen.add(key(start.x, start.y));
      for (const current of queue) {
        for (let dir = 0; dir < 4; dir++) {
          if (this.grid[current.y][current.x].walls[dir]) continue;
          const nx = current.x + DX[dir];
          const ny = current.y + DY[dir];
          const nextKey = key(nx, ny);
          if (!seen.has(nextKey)) {
            seen.add(nextKey);
            queue.push({ x: nx, y: ny });
          }
        }
      }
    }
    return components;
  }
}

function getBounds(grid) {
  return { left: 2, top: 2, right: grid[0].length - 3, bottom: grid.length - 3 };
}

// 崩れた坑道: a long switchback tunnel with jittered turns, dead-end ore
// veins, and one collapsed cross-cut. The silhouette is ragged because only
// the tunnels exist; there is no rectangular frame.
function generateMineTunnels(carver, rng) {
  const { left, top, right, bottom } = getBounds(carver.grid);
  const waypointCount = randomInt(rng, 5, 7);
  const span = bottom - top;
  const waypoints = [];
  for (let index = 0; index < waypointCount; index++) {
    const towardRight = index % 2 === 0;
    const x = towardRight ? right - randomInt(rng, 0, 4) : left + randomInt(rng, 0, 4);
    const baseY = top + Math.round((span * index) / (waypointCount - 1));
    const y = Math.min(bottom, Math.max(top, baseY + randomInt(rng, -1, 1)));
    waypoints.push({ x, y });
  }
  for (let index = 0; index < waypoints.length - 1; index++) {
    const from = waypoints[index];
    const to = waypoints[index + 1];
    // A mid-leg kink breaks the uniform serpentine into a hand-dug tunnel.
    const kink = {
      x: Math.round((from.x + to.x) / 2) + randomInt(rng, -2, 2),
      y: Math.min(bottom, Math.max(top, from.y + randomInt(rng, 0, Math.max(0, to.y - from.y))))
    };
    carver.path(from, kink, rng() < 0.5);
    carver.path(kink, to, rng() < 0.5);
  }

  // One collapsed cross-cut joins two switchbacks for a single shortcut.
  const cutIndex = randomInt(rng, 1, waypoints.length - 2);
  const cutX = Math.round((left + right) / 2) + randomInt(rng, -3, 3);
  carver.path({ x: cutX, y: waypoints[cutIndex - 1].y }, { x: cutX, y: waypoints[cutIndex + 1].y }, false);

  const rooms = [];
  const galleryIndexes = [1, waypoints.length - 2];
  galleryIndexes.forEach(index => {
    const anchor = waypoints[index];
    const w = pick(rng, [2, 3]);
    const h = 2;
    const x = Math.min(right - w + 1, Math.max(left, anchor.x - (anchor.x > (left + right) / 2 ? w - 1 : 0)));
    const y = Math.min(bottom - h + 1, Math.max(top, anchor.y));
    const room = { x, y, w, h };
    carver.room(room);
    carver.path({ x: room.x, y: room.y }, anchor, true);
    rooms.push(room);
  });

  // Short rubble bypasses beside straight tunnel runs keep a cheap way around
  // a known hazard without turning the mine into a loop-heavy layout.
  const bypassTarget = randomInt(rng, 3, 4);
  const straightCells = carver.collectPassageCells();
  for (let attempt = 0, made = 0; attempt < 80 && made < bypassTarget; attempt++) {
    if (carver.bypass(pick(rng, straightCells), randomInt(rng, 0, 1) === 0, rng() < 0.5 ? 1 : -1)) made++;
  }

  const tunnelCells = carver.collectPassageCells();
  const veinCount = randomInt(rng, 4, 6);
  for (let attempt = 0, made = 0; attempt < 40 && made < veinCount; attempt++) {
    const start = pick(rng, tunnelCells);
    if (carver.spur(start, randomInt(rng, 0, 3), randomInt(rng, 2, 5)) >= 2) made++;
  }
  return rooms;
}

// 忘れられた地下墓地: a left/right symmetric lattice of burial aisles with
// some aisles sealed, one-cell burial niches, mirrored chambers, and a central
// chapel. Every carving operation is mirrored around the vertical axis.
function generateCatacombLattice(carver, rng) {
  carver.mirror = true;
  const { left, top, bottom } = getBounds(carver.grid);
  const width = carver.width;
  const centerX = Math.floor((width - 1) / 2);
  const spacing = pick(rng, [4, 5]);
  const columns = [];
  for (let x = left; x <= centerX - 1; x += spacing) columns.push(x);
  const rows = [];
  const rowOffset = randomInt(rng, 0, 1);
  for (let y = top + rowOffset; y <= bottom; y += spacing) rows.push(y);

  const joinCenter = y => {
    if (width % 2 === 0) carver.open(centerX, y, DIR_E);
  };
  rows.forEach(y => {
    carver.path({ x: left, y }, { x: centerX, y });
    joinCenter(y);
  });
  columns.forEach(x => carver.path({ x, y: rows[0] }, { x, y: rows.at(-1) }, false));

  const rooms = [];
  // Central chapel straddles the axis on a middle aisle.
  const chapelRow = rows[Math.floor(rows.length / 2)];
  const chapelWidth = width % 2 === 0 ? 2 : 3;
  const chapel = {
    x: width % 2 === 0 ? centerX : centerX - 1,
    y: Math.max(1, chapelRow - 1),
    w: chapelWidth,
    h: 3
  };
  carver.mirror = false;
  carver.room(chapel);
  carver.mirror = true;
  rooms.push(chapel);

  // Mirrored burial chambers sit inside a lattice block behind one door.
  // Rooms are carved before aisles are sealed so sealing keeps them attached.
  const chamberColumns = columns.filter(x => x + 3 <= centerX - 1);
  const chamberRows = rows.filter(y => y + 3 <= bottom);
  const blockX = pick(rng, chamberColumns.length > 0 ? chamberColumns : columns) + 1;
  const blockY = pick(rng, chamberRows.length > 0 ? chamberRows : rows) + 1;
  const chamber = { x: blockX, y: blockY, w: 2, h: 2 };
  carver.room(chamber);
  carver.open(chamber.x, chamber.y, DIR_N);
  rooms.push(chamber, { x: width - chamber.x - chamber.w, y: chamber.y, w: chamber.w, h: chamber.h });

  // Seal some aisle segments (mirrored) while the lattice stays connected.
  const segments = [];
  rows.forEach(y => {
    for (let index = 0; index < columns.length - 1; index++) {
      segments.push({ from: { x: columns[index], y }, to: { x: columns[index + 1], y }, dir: DIR_E });
    }
  });
  columns.forEach(x => {
    for (let index = 0; index < rows.length - 1; index++) {
      segments.push({ from: { x, y: rows[index] }, to: { x, y: rows[index + 1] }, dir: DIR_S });
    }
  });
  const sealTarget = Math.round(segments.length * (0.22 + rng() * 0.14));
  const order = segments.map((segment, index) => ({ segment, roll: rng(), index }))
    .sort((a, b) => a.roll - b.roll || a.index - b.index)
    .map(item => item.segment);
  let sealed = 0;
  for (const segment of order) {
    if (sealed >= sealTarget) break;
    const cells = [];
    let { x, y } = segment.from;
    while (x !== segment.to.x || y !== segment.to.y) {
      cells.push({ x, y });
      x += DX[segment.dir];
      y += DY[segment.dir];
    }
    cells.forEach(cell => carver.close(cell.x, cell.y, segment.dir));
    if (carver.countComponents() === 1) {
      sealed++;
    } else {
      cells.forEach(cell => carver.open(cell.x, cell.y, segment.dir));
    }
  }

  // Burial niches: one-cell alcoves off the aisles.
  const aisleCells = carver.collectPassageCells().filter(cell => cell.x <= centerX);
  const nicheTarget = randomInt(rng, 5, 7);
  for (let attempt = 0, made = 0; attempt < 60 && made < nicheTarget; attempt++) {
    const start = pick(rng, aisleCells);
    const dir = randomInt(rng, 0, 3);
    const nx = start.x + DX[dir];
    if (nx >= centerX) continue;
    if (carver.spur(start, dir, 1) === 1) made++;
  }
  carver.mirror = false;
  return rooms;
}

// 大裂溝の巣窟: an impassable chasm splits the floor into two banks. Each bank
// has its own rim road and loops; a few bridges are the only crossings.
function generateRiftChasm(carver, rng) {
  const { left, top, right, bottom } = getBounds(carver.grid);
  const horizontal = rng() < 0.5;
  // u runs along the chasm, v across it.
  const uMin = horizontal ? left : top;
  const uMax = horizontal ? right : bottom;
  const vMin = horizontal ? top : left;
  const vMax = horizontal ? bottom : right;
  const toXY = (u, v) => (horizontal ? { x: u, y: v } : { x: v, y: u });
  const mid = Math.floor((vMin + vMax) / 2) + randomInt(rng, -1, 1);

  const chasmStart = new Map();
  let current = mid;
  let run = 0;
  for (let u = 1; u <= uMax + 1; u++) {
    if (run <= 0) {
      current = Math.min(mid + 2, Math.max(mid - 2, current + randomInt(rng, -1, 1)));
      run = randomInt(rng, 3, 5);
    }
    run--;
    chasmStart.set(u, current);
  }
  const minStart = Math.min(...chasmStart.values());
  const maxStart = Math.max(...chasmStart.values());
  const nearRimV = minStart - 2;
  const farRimV = maxStart + 3;

  const bridgeCount = randomInt(rng, 2, 3);
  const bridges = [];
  for (let attempt = 0; attempt < 40 && bridges.length < bridgeCount; attempt++) {
    const u = randomInt(rng, uMin + 1, uMax - 1);
    if (bridges.every(existing => Math.abs(existing - u) >= 5)) bridges.push(u);
  }
  const bridgeSet = new Set(bridges);

  for (const [u, start] of chasmStart) {
    if (bridgeSet.has(u)) continue;
    for (let v = start; v <= start + 1; v++) {
      const { x, y } = toXY(u, v);
      carver.setVoid(x, y);
    }
  }

  const carveBank = (rimV, outerMin, outerMax) => {
    carver.path(toXY(uMin, rimV), toXY(uMax, rimV));
    const outerV = randomInt(rng, outerMin, outerMax);
    const legs = [uMin, Math.round((uMin * 2 + uMax) / 3), Math.round((uMin + uMax * 2) / 3), uMax];
    let previous = toXY(uMin, outerV);
    for (let index = 1; index < legs.length; index++) {
      const jitter = Math.min(outerMax, Math.max(outerMin, outerV + randomInt(rng, -1, 1)));
      const next = toXY(legs[index], jitter);
      carver.path(previous, next, horizontal);
      previous = next;
    }
    carver.path(toXY(uMin, outerV), toXY(uMin, rimV), !horizontal);
    carver.path(toXY(uMax, rimV), previous, !horizontal);
    const connectorCount = randomInt(rng, 1, 2);
    for (let index = 0; index < connectorCount; index++) {
      const u = randomInt(rng, uMin + 3, uMax - 3);
      carver.path(toXY(u, rimV), toXY(u, outerV), !horizontal);
    }
    return outerV;
  };
  const nearOuter = carveBank(nearRimV, vMin, Math.max(vMin, nearRimV - 3));
  const farOuter = carveBank(farRimV, Math.min(vMax, farRimV + 3), vMax);

  bridges.forEach(u => carver.path(toXY(u, nearRimV), toXY(u, farRimV), !horizontal));

  const rooms = [];
  const placeRoom = (outerV, rimV) => {
    const towardRim = rimV > outerV ? 1 : -1;
    const between = towardRim > 0 ? outerV + 1 : outerV - 2;
    const u = randomInt(rng, uMin + 1, uMax - 3);
    const origin = toXY(u, between);
    const room = horizontal ? { ...origin, w: 3, h: 2 } : { ...origin, w: 2, h: 3 };
    carver.room(room);
    // The room hangs off the rim road so it never depends on the jittered outer road.
    const rimSide = towardRim > 0 ? between + 1 : between;
    carver.path(toXY(u, rimSide), toXY(u, rimV), !horizontal);
    rooms.push(room);
  };
  placeRoom(nearOuter, nearRimV);
  placeRoom(farOuter, farRimV);
  // A bridgehead camp on the far bank's rim road.
  const bridgehead = bridges[0];
  if (bridgehead !== undefined) {
    const origin = toXY(Math.min(uMax - 1, bridgehead + 1), farRimV);
    const room = { ...origin, w: 2, h: 2 };
    carver.room(room);
    rooms.push(room);
  }

  const cells = carver.collectPassageCells();
  for (let attempt = 0, made = 0; attempt < 30 && made < 3; attempt++) {
    if (carver.spur(pick(rng, cells), randomInt(rng, 0, 3), randomInt(rng, 2, 3)) >= 2) made++;
  }
  return rooms;
}

// 水没した魔導書庫: two large reading halls whose interiors are divided by
// shelf rows, a flooded block that corridors must route around, and a small
// reading room.
function generateLibraryStacks(carver, rng) {
  const { left, top, right, bottom } = getBounds(carver.grid);
  const midX = Math.floor((left + right) / 2);
  const midY = Math.floor((top + bottom) / 2);
  const flipped = rng() < 0.5;

  const hallSize = () => ({ w: randomInt(rng, 7, 9), h: randomInt(rng, 5, 7) });
  const firstSize = hallSize();
  const secondSize = hallSize();
  const first = {
    x: flipped ? right - firstSize.w + 1 - randomInt(rng, 0, 2) : left + randomInt(rng, 0, 2),
    y: top + randomInt(rng, 0, 2),
    ...firstSize
  };
  const second = {
    x: flipped ? left + randomInt(rng, 0, 2) : right - secondSize.w + 1 - randomInt(rng, 0, 2),
    y: bottom - secondSize.h + 1 - randomInt(rng, 0, 2),
    ...secondSize
  };

  // The flood fills one of the two remaining quadrants.
  const floodInUpper = rng() < 0.5;
  const floodW = randomInt(rng, 4, 6);
  const floodH = randomInt(rng, 3, 5);
  // Halls occupy one diagonal; the flood takes one off-diagonal quadrant.
  const floodQuadrantLeft = flipped ? floodInUpper : !floodInUpper;
  const flood = {
    x: floodQuadrantLeft
      ? left + 2 + randomInt(rng, 0, Math.max(0, midX - left - floodW - 3))
      : midX + 2 + randomInt(rng, 0, Math.max(0, right - midX - floodW - 3)),
    y: floodInUpper
      ? top + 2 + randomInt(rng, 0, Math.max(0, midY - top - floodH - 3))
      : midY + 2 + randomInt(rng, 0, Math.max(0, bottom - midY - floodH - 3)),
    w: floodW,
    h: floodH
  };
  for (let y = flood.y; y < flood.y + flood.h; y++) {
    for (let x = flood.x; x < flood.x + flood.w; x++) carver.setVoid(x, y);
  }

  carver.room(first);
  carver.room(second);

  const carveShelves = hall => {
    const vertical = rng() < 0.5;
    if (vertical) {
      for (let x = hall.x + 1; x < hall.x + hall.w - 1; x += 2) {
        const gap = randomInt(rng, hall.y + 1, hall.y + hall.h - 2);
        for (let y = hall.y + 1; y < hall.y + hall.h - 1; y++) {
          if (y !== gap) carver.close(x, y, DIR_E);
        }
      }
    } else {
      for (let y = hall.y + 1; y < hall.y + hall.h - 1; y += 2) {
        const gap = randomInt(rng, hall.x + 1, hall.x + hall.w - 2);
        for (let x = hall.x + 1; x < hall.x + hall.w - 1; x++) {
          if (x !== gap) carver.close(x, y, DIR_S);
        }
      }
    }
  };
  carveShelves(first);
  carveShelves(second);

  const center = hall => ({ x: hall.x + Math.floor(hall.w / 2), y: hall.y + Math.floor(hall.h / 2) });
  const firstCenter = center(first);
  const secondCenter = center(second);
  // Dry route through the quadrant without water.
  const dryCorner = { x: floodQuadrantLeft ? right : left, y: floodInUpper ? bottom : top };
  const exitTowards = (hall, target) => ({
    x: Math.min(hall.x + hall.w - 1, Math.max(hall.x, target.x)),
    y: Math.min(hall.y + hall.h - 1, Math.max(hall.y, target.y))
  });
  const dryCornerX = { x: dryCorner.x, y: firstCenter.y };
  carver.path(exitTowards(first, dryCornerX), dryCornerX);
  carver.path(dryCornerX, { x: dryCorner.x, y: secondCenter.y }, false);
  carver.path({ x: dryCorner.x, y: secondCenter.y }, exitTowards(second, { x: dryCorner.x, y: secondCenter.y }));
  // Shore route hugs the map edges around the flooded quadrant.
  const shoreX = floodQuadrantLeft ? left : right;
  const shoreY = floodInUpper ? top : bottom;
  const firstIsLeft = !flipped;
  if (floodQuadrantLeft !== firstIsLeft) {
    const rise = { x: firstCenter.x, y: shoreY };
    carver.path(exitTowards(first, rise), rise, false);
    carver.path(rise, { x: shoreX, y: shoreY });
    const descend = { x: shoreX, y: secondCenter.y };
    carver.path({ x: shoreX, y: shoreY }, descend, false);
    carver.path(descend, exitTowards(second, descend));
  } else {
    const side = { x: shoreX, y: firstCenter.y };
    carver.path(exitTowards(first, side), side);
    carver.path(side, { x: shoreX, y: shoreY }, false);
    const across = { x: secondCenter.x, y: shoreY };
    carver.path({ x: shoreX, y: shoreY }, across);
    carver.path(across, exitTowards(second, across), false);
  }

  const rooms = [first, second];
  // Reading room on the dry route.
  const reading = {
    x: Math.min(right - 1, Math.max(left, dryCorner.x === right ? right - 2 : left + 1)),
    y: Math.min(bottom - 1, Math.max(top, Math.round((firstCenter.y + secondCenter.y) / 2))),
    w: 2,
    h: 2
  };
  carver.room(reading);
  carver.path({ x: reading.x, y: reading.y }, { x: dryCorner.x, y: reading.y });
  rooms.push(reading);

  const cells = carver.collectPassageCells().filter(cell =>
    !rooms.some(room => cell.x >= room.x && cell.x < room.x + room.w && cell.y >= room.y && cell.y < room.y + room.h)
  );
  for (let attempt = 0, made = 0; attempt < 30 && made < 4; attempt++) {
    if (carver.spur(pick(rng, cells), randomInt(rng, 0, 3), randomInt(rng, 2, 4)) >= 2) made++;
  }
  return rooms;
}

function carveRing(carver, ring) {
  carver.path({ x: ring.left, y: ring.top }, { x: ring.right, y: ring.top });
  carver.path({ x: ring.right, y: ring.top }, { x: ring.right, y: ring.bottom }, false);
  carver.path({ x: ring.right, y: ring.bottom }, { x: ring.left, y: ring.bottom });
  carver.path({ x: ring.left, y: ring.bottom }, { x: ring.left, y: ring.top }, false);
}

// 竜火の鍛造殿: an impassable furnace at the center, concentric rings around
// it joined by a few radial spokes, partial middle arcs, and corner workshops.
function generateForgeRings(carver, rng) {
  const { left, top, right, bottom } = getBounds(carver.grid);
  const centerX = Math.floor((left + right) / 2) + randomInt(rng, -1, 1);
  const centerY = Math.floor((top + bottom) / 2) + randomInt(rng, -1, 1);
  const furnace = randomInt(rng, 1, 2);
  for (let y = centerY - furnace; y <= centerY + furnace; y++) {
    for (let x = centerX - furnace; x <= centerX + furnace; x++) carver.setVoid(x, y);
  }
  const inner = {
    left: centerX - furnace - 1,
    right: centerX + furnace + 1,
    top: centerY - furnace - 1,
    bottom: centerY + furnace + 1
  };
  const inset = randomInt(rng, 2, 3);
  const outer = { left: left + inset, right: right - inset, top: top + inset, bottom: bottom - inset };
  carveRing(carver, inner);
  carveRing(carver, outer);

  const sides = ["n", "e", "s", "w"];
  const spokeSides = sides.map(side => ({ side, roll: rng() }))
    .sort((a, b) => a.roll - b.roll)
    .slice(0, randomInt(rng, 2, 3))
    .map(item => item.side);
  const spoke = side => {
    if (side === "n" || side === "s") {
      const x = randomInt(rng, inner.left, inner.right);
      const from = { x, y: side === "n" ? inner.top : inner.bottom };
      const to = { x, y: side === "n" ? outer.top : outer.bottom };
      carver.path(from, to, false);
    } else {
      const y = randomInt(rng, inner.top, inner.bottom);
      const from = { x: side === "w" ? inner.left : inner.right, y };
      const to = { x: side === "w" ? outer.left : outer.right, y };
      carver.path(from, to);
    }
  };
  spokeSides.forEach(spoke);

  // Partial middle arcs between the rings add short alternate routes.
  const middle = {
    left: Math.floor((inner.left + outer.left) / 2),
    right: Math.ceil((inner.right + outer.right) / 2),
    top: Math.floor((inner.top + outer.top) / 2),
    bottom: Math.ceil((inner.bottom + outer.bottom) / 2)
  };
  if (inner.left - outer.left >= 3) {
    const arcSides = sides.filter(side => !spokeSides.includes(side)).slice(0, 1).concat(pick(rng, spokeSides));
    arcSides.forEach(side => {
      if (side === "n" || side === "s") {
        const y = side === "n" ? middle.top : middle.bottom;
        carver.path({ x: middle.left, y }, { x: middle.right, y });
        carver.path({ x: middle.left, y }, { x: middle.left, y: side === "n" ? outer.top : outer.bottom }, false);
        carver.path({ x: middle.right, y }, { x: inner.right, y: side === "n" ? inner.top : inner.bottom });
      } else {
        const x = side === "w" ? middle.left : middle.right;
        carver.path({ x, y: middle.top }, { x, y: middle.bottom }, false);
        carver.path({ x, y: middle.top }, { x: side === "w" ? outer.left : outer.right, y: middle.top });
        carver.path({ x, y: middle.bottom }, { x: side === "w" ? inner.left : inner.right, y: inner.bottom }, false);
      }
    });
  }

  const rooms = [];
  const corners = [
    { x: left - 1, y: top - 1, link: { x: outer.left, y: outer.top } },
    { x: right, y: top - 1, link: { x: outer.right, y: outer.top } },
    { x: left - 1, y: bottom, link: { x: outer.left, y: outer.bottom } },
    { x: right, y: bottom, link: { x: outer.right, y: outer.bottom } }
  ];
  corners.forEach(corner => {
    const room = { x: corner.x, y: corner.y, w: 2, h: 2 };
    carver.room(room);
    const door = {
      x: corner.x < corner.link.x ? room.x + 1 : room.x,
      y: corner.y < corner.link.y ? room.y + 1 : room.y
    };
    carver.path(door, corner.link, rng() < 0.5);
    rooms.push(room);
  });
  return rooms;
}

// 深淵の玉座: floating islands around a central throne, joined by staircase
// causeways that turn on every step. One island is reachable only through a
// neighbor, and one rim causeway closes a loop.
function generateAbyssIslands(carver, rng) {
  const { left, top, right, bottom } = getBounds(carver.grid);
  const centerX = Math.floor((left + right) / 2) + randomInt(rng, -1, 1);
  const centerY = Math.floor((top + bottom) / 2) + randomInt(rng, -1, 1);
  const throne = { x: centerX - 1, y: centerY - 1, w: 3, h: 3 };
  carver.room(throne);

  const quadrants = [
    { minX: left + 1, maxX: centerX - 6, minY: top + 1, maxY: centerY - 6 },
    { minX: centerX + 4, maxX: right - 3, minY: top + 1, maxY: centerY - 6 },
    { minX: centerX + 4, maxX: right - 3, minY: centerY + 4, maxY: bottom - 3 },
    { minX: left + 1, maxX: centerX - 6, minY: centerY + 4, maxY: bottom - 3 }
  ];
  const islands = quadrants.map(quadrant => {
    const w = randomInt(rng, 2, 3);
    const h = randomInt(rng, 2, 3);
    const x = randomInt(rng, quadrant.minX, Math.max(quadrant.minX, quadrant.maxX - w + 1));
    const y = randomInt(rng, quadrant.minY, Math.max(quadrant.minY, quadrant.maxY - h + 1));
    const room = { x, y, w, h };
    carver.room(room);
    // A ring around the island makes it read as a floating platform.
    carveRing(carver, { left: x - 1, right: x + w, top: y - 1, bottom: y + h });
    // One gate joins the platform to its surrounding ring.
    const gate = randomInt(rng, 0, 3);
    const gateCell = gate === DIR_N || gate === DIR_S
      ? { x: x + randomInt(rng, 0, w - 1), y: gate === DIR_N ? y : y + h - 1 }
      : { x: gate === DIR_W ? x : x + w - 1, y: y + randomInt(rng, 0, h - 1) };
    carver.open(gateCell.x, gateCell.y, gate);
    return room;
  });

  const anchor = room => ({ x: room.x + Math.floor(room.w / 2), y: room.y + Math.floor(room.h / 2) });
  const ringPoint = (room, toward) => ({
    x: toward.x > room.x + room.w - 1 ? room.x + room.w : toward.x < room.x ? room.x - 1 : anchor(room).x,
    y: toward.y > room.y + room.h - 1 ? room.y + room.h : toward.y < room.y ? room.y - 1 : anchor(room).y
  });
  const throneCenter = anchor(throne);
  const detached = randomInt(rng, 0, 3);
  islands.forEach((island, index) => {
    if (index === detached) return;
    const from = ringPoint(island, throneCenter);
    const to = ringPoint(throne, from);
    carver.zigzag(from, to);
    carver.path(to, throneCenter);
  });
  // The detached island hangs off a neighbor, forcing a detour.
  const neighbor = islands[(detached + 1) % islands.length];
  const detachedIsland = islands[detached];
  carver.path(ringPoint(detachedIsland, anchor(neighbor)), ringPoint(neighbor, anchor(detachedIsland)), rng() < 0.5);
  // One rim causeway joins two other islands for a loop.
  const loopA = islands[(detached + 2) % islands.length];
  const loopB = islands[(detached + 3) % islands.length];
  carver.zigzag(ringPoint(loopA, anchor(loopB)), ringPoint(loopB, anchor(loopA)));

  return [throne, ...islands];
}

const GENERATORS = Object.freeze({
  mine_tunnels: generateMineTunnels,
  catacomb_lattice: generateCatacombLattice,
  rift_chasm: generateRiftChasm,
  library_stacks: generateLibraryStacks,
  forge_rings: generateForgeRings,
  abyss_islands: generateAbyssIslands
});

/**
 * Carves the archetype skeleton into an all-walls grid.
 * @returns {{ rooms: Array<{x:number,y:number,w:number,h:number}>, voidKeys: Set<string> }}
 */
export function generateLayoutArchetype(grid, visited, rng, archetypeId) {
  const generator = GENERATORS[archetypeId];
  if (!generator) throw new Error(`unknown layout archetype: ${archetypeId}`);
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      grid[y][x].walls.fill(true);
      visited[y][x] = false;
    }
  }
  const carver = new LayoutCarver(grid, visited);
  const rooms = generator(carver, rng);
  if (carver.countComponents() !== 1) {
    throw new Error(`layout archetype ${archetypeId} produced a disconnected skeleton`);
  }
  return { rooms, voidKeys: carver.voidKeys };
}
