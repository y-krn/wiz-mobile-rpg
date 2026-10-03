import assert from "node:assert/strict";
import { BIOMES, getBiomeForFloor } from "../../../src/data/biomes.js";
import { generateRunFloor } from "../../../src/run_map_generator.js";
import { SPECIAL_ROOM_MAX_DETOUR, SPECIAL_ROOM_MIN_DETOUR, collectSpecialRoomCandidates } from "../../../src/map_special_rooms.js";
import {
  FORGE_TEMPER_BATTLES,
  SPECIAL_ROOM_EVENT,
  SPECIAL_ROOM_INFO,
  applyForgeTemper,
  cleanseAltarStatuses,
  describeDirection,
  getAltarBloodCost,
  getForgeTemperAmount,
  getForgeTemperBonus,
  getMirrorHpCost,
  getMirrorVisionCells,
  getReadingRoomTargets,
  getSpecialRoomMarkerKind,
  hasMirrorVisionFor,
  markSpecialRoomUsed,
  revealCells,
  startForgeTemperBattle
} from "../../../src/rules/special_rooms.js";
import { getCharWeaponAtk } from "../../../src/rules/character_stats.js";
import { applyStatusEffect, hasStatusEffect, removeStatusEffect, STATUS_EFFECT_IDS } from "../../../src/combat_logic/status_effects.js";
import { applyMirrorVision } from "../../../src/state/run_floor_state.js";
import { SAVE_VERSION, migrateSavePayload } from "../../../src/state/save_migrations.js";
import { FULL_MAP_LEGEND, getFullMapModel } from "../../../src/ui/full_map.js";

// #1965: every biome owns one special room; every floor places it off the
// natural route, deterministically, and its used state persists.
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

function findCells(grid, predicate) {
  const cells = [];
  grid.forEach((row, y) => row.forEach((cell, x) => {
    if (predicate(cell)) cells.push({ x, y, cell });
  }));
  return cells;
}

function naturalReachable(grid, from) {
  const seen = new Set([`${from.x},${from.y}`]);
  const queue = [from];
  for (const pos of queue) {
    const cell = grid[pos.y][pos.x];
    for (let dir = 0; dir < 4; dir++) {
      if (cell.walls[dir]) continue;
      const nx = pos.x + DX[dir];
      const ny = pos.y + DY[dir];
      const next = grid[ny]?.[nx];
      if (!next || seen.has(`${nx},${ny}`) || next.blockEnter?.[(dir + 2) % 4]) continue;
      if (next.obstacle && next.obstacle.state !== "cleared" && next.obstacle.state !== "open" && next.obstacle.kind !== "crumble") continue;
      seen.add(`${nx},${ny}`);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}

// One unique room kind per biome, each with player-facing text.
{
  const kinds = BIOMES.map(biome => biome.gimmicks.specialRoom);
  assert.equal(new Set(kinds).size, BIOMES.length, "each biome owns a different special room");
  kinds.forEach(kind => {
    assert.ok(SPECIAL_ROOM_INFO[kind]?.name && SPECIAL_ROOM_INFO[kind]?.intro, `${kind} has a name and intro`);
  });
}

// Every floor across two biome cycles places exactly one room of its biome's
// kind, on a naturally reachable quiet cell off the natural route.
{
  let detourTotal = 0;
  let placed = 0;
  let deadEnds = 0;
  for (let floor = 1; floor <= 60; floor++) {
    for (let seed = 0; seed < 6; seed++) {
      const runSeed = `ISSUE-1965-${seed}`;
      const generated = generateRunFloor({ runSeed, floor });
      const rooms = findCells(generated.grid, cell => cell.event === SPECIAL_ROOM_EVENT);
      assert.equal(rooms.length, 1, `B${floor} ${runSeed}: one special room`);
      const [{ x, y, cell }] = rooms;
      assert.equal(cell.specialRoom.kind, getBiomeForFloor(floor).gimmicks.specialRoom, `B${floor}: biome room kind`);
      assert.equal(cell.specialRoom.used, false);
      assert.equal(cell.type, "empty");
      assert.ok(!cell.trap && !cell.obstacle && !cell.hazard && !cell.lever, `B${floor}: room sits on a quiet cell`);
      assert.ok(generated.specialRoom.detour >= SPECIAL_ROOM_MIN_DETOUR, `B${floor}: room is off the natural route`);
      const start = findCells(generated.grid, c => c.type === "stairs-up")[0];
      assert.ok(naturalReachable(generated.grid, start).has(`${x},${y}`), `B${floor}: room is reachable without resolving a gimmick`);
      const again = generateRunFloor({ runSeed, floor });
      assert.deepEqual([again.specialRoom.x, again.specialRoom.y], [x, y], `B${floor}: placement is deterministic`);
      detourTotal += generated.specialRoom.detour;
      placed += 1;
      if (cell.walls.filter(wall => !wall).length === 1) deadEnds += 1;
    }
  }
  const meanDetour = detourTotal / placed;
  assert.ok(meanDetour >= SPECIAL_ROOM_MIN_DETOUR && meanDetour <= SPECIAL_ROOM_MAX_DETOUR, `mean detour ${meanDetour.toFixed(1)} stays a short side trip`);
  assert.ok(deadEnds / placed >= 0.8, `rooms prefer dead ends (${deadEnds}/${placed})`);
}

// Candidate collection never offers a cell on the natural route.
{
  const generated = generateRunFloor({ runSeed: "ISSUE-1965-CANDIDATES", floor: 3 });
  const candidates = collectSpecialRoomCandidates(generated.grid);
  assert.ok(candidates.length > 0);
  assert.ok(candidates.every(candidate => candidate.detour >= 0));
}

// Forge temper: +ATK for exactly FORGE_TEMPER_BATTLES battles, then it cools.
{
  const char = { name: "test", equipment: {}, inventory: [] };
  const base = getCharWeaponAtk(char);
  const temper = applyForgeTemper(char, 20);
  assert.equal(temper.bonus, getForgeTemperAmount(20));
  assert.equal(getForgeTemperBonus(char), temper.bonus);
  assert.equal(getCharWeaponAtk(char), base + temper.bonus, "temper adds to weapon ATK");
  for (let battle = 1; battle <= FORGE_TEMPER_BATTLES; battle++) {
    assert.equal(startForgeTemperBattle(char), "active", `battle ${battle} is tempered`);
    assert.equal(getForgeTemperBonus(char), temper.bonus);
  }
  assert.equal(startForgeTemperBattle(char), "cooled", "the next battle starts cold");
  assert.equal(getForgeTemperBonus(char), 0);
  assert.equal(char.forgeTemper, undefined);
  assert.equal(startForgeTemperBattle(char), null);
}

// Altar and mirror costs never take the last HP point.
{
  assert.equal(getAltarBloodCost({ hp: 40 }, 40), 10);
  assert.equal(getAltarBloodCost({ hp: 3 }, 40), 2);
  assert.equal(getAltarBloodCost({ hp: 1 }, 40), 0);
  assert.equal(getMirrorHpCost({ hp: 40 }, 40), 6);
  assert.equal(getMirrorHpCost({ hp: 1 }, 40), 0);
}

// Altar cleanse clears every listed status.
{
  const char = { name: "test", hp: 10, status: "ok" };
  applyStatusEffect(char, STATUS_EFFECT_IDS.POISONED, { remainingTurns: 5 });
  applyStatusEffect(char, STATUS_EFFECT_IDS.SILENCE, { remainingTurns: 3 });
  const cleared = cleanseAltarStatuses(char, {
    hasStatusEffect,
    removeStatusEffect,
    ids: [STATUS_EFFECT_IDS.POISONED, STATUS_EFFECT_IDS.BLIND, STATUS_EFFECT_IDS.SILENCE]
  });
  assert.deepEqual(cleared.sort(), [STATUS_EFFECT_IDS.POISONED, STATUS_EFFECT_IDS.SILENCE].sort());
  assert.ok(!hasStatusEffect(char, STATUS_EFFECT_IDS.POISONED));
  assert.ok(!hasStatusEffect(char, STATUS_EFFECT_IDS.SILENCE));
}

// Reading room reveals the down stairs and unopened chests.
{
  const generated = generateRunFloor({ runSeed: "ISSUE-1965-READ", floor: 16 });
  const { stairs, chests } = getReadingRoomTargets(generated.grid);
  assert.equal(stairs.length, 1);
  assert.ok(chests.length > 0);
  const visited = generated.grid.map(row => row.map(() => false));
  assert.equal(revealCells(visited, [...stairs, ...chests]), 1 + chests.length);
  assert.equal(revealCells(visited, stairs), 0, "revealing twice is a no-op");
  assert.equal(describeDirection({ x: 0, y: 5 }, { x: 0, y: 0 }), "北");
  assert.equal(describeDirection({ x: 0, y: 0 }, { x: 5, y: 5 }), "南東");
}

// Mirror hall: a used mirror on floor N reveals floor N+1's down stairs.
{
  const runSeed = "ISSUE-1965-MIRROR";
  const above = generateRunFloor({ runSeed, floor: 26 }).grid;
  const below = generateRunFloor({ runSeed, floor: 27 }).grid;
  const stateLike = {
    maps: [],
    visitedMaps: []
  };
  stateLike.maps[25] = above;
  stateLike.maps[26] = below;
  stateLike.visitedMaps[26] = below.map(row => row.map(() => false));
  assert.equal(hasMirrorVisionFor(above), false);
  assert.equal(applyMirrorVision(stateLike, 27), 0, "an unused mirror shows nothing");
  const mirror = findCells(above, cell => cell.specialRoom?.kind === "mirror_hall")[0];
  assert.ok(mirror, "B26 places a mirror hall");
  markSpecialRoomUsed(mirror.cell);
  assert.ok(hasMirrorVisionFor(above));
  const revealed = applyMirrorVision(stateLike, 27);
  assert.equal(revealed, getMirrorVisionCells(below).length);
  const stairs = findCells(below, cell => cell.type === "stairs-down")[0];
  assert.equal(stateLike.visitedMaps[26][stairs.y][stairs.x], true, "the down stairs are on the map");
}

// Used state survives a save round trip.
{
  const generated = generateRunFloor({ runSeed: "ISSUE-1965-SAVE", floor: 21 });
  const room = findCells(generated.grid, cell => cell.event === SPECIAL_ROOM_EVENT)[0];
  markSpecialRoomUsed(room.cell);
  const char = { name: "hero", hp: 10 };
  applyForgeTemper(char, 30);
  const restored = migrateSavePayload(JSON.parse(JSON.stringify({
    version: SAVE_VERSION,
    floor: 1,
    currentRun: { runSeed: "ISSUE-1965-SAVE" },
    maps: [generated.grid],
    party: [char]
  })));
  const restoredRoom = restored.maps[0][room.y][room.x];
  assert.equal(restoredRoom.event, SPECIAL_ROOM_EVENT);
  assert.equal(restoredRoom.specialRoom.used, true);
  assert.deepEqual(restored.party[0].forgeTemper, char.forgeTemper, "an active temper survives a reload");
}

// Map views mark revealed rooms and carry legend rows.
{
  const cell = room => ({ walls: [true, false, true, false], blockEnter: [false, false, false, false], type: "empty", ...room });
  const map = [[
    cell({}),
    cell({ event: SPECIAL_ROOM_EVENT, specialRoom: { kind: "altar", used: false, discovered: false } }),
    cell({ event: SPECIAL_ROOM_EVENT, specialRoom: { kind: "forge", used: true, discovered: true } }),
    cell({ event: SPECIAL_ROOM_EVENT, specialRoom: { kind: "mine_vein", used: false, discovered: false } })
  ]];
  const model = getFullMapModel({
    kind: "renderer-input",
    view: { hasMap: true },
    sceneVisibility: {},
    floor: 1,
    x: 0,
    y: 0,
    dir: 1,
    map,
    visitedMap: [[true, true, false, false]],
    mapFragments: [],
    lightTurns: 0,
    lightPower: null,
    roamingMonsters: [],
    hasArcaneSense: false
  });
  const kinds = model.markers.map(marker => `${marker.kind}@${marker.x}`);
  assert.ok(kinds.includes("special-room@1"), "a revealed room is marked");
  assert.ok(kinds.includes("special-room-used@2"), "a used room keeps a dimmed marker");
  assert.ok(!kinds.some(kind => kind.endsWith("@3")), "an unrevealed room stays hidden");
  assert.equal(getSpecialRoomMarkerKind(map[0][3]), null);
  const legend = new Set(FULL_MAP_LEGEND.map(({ kind }) => kind));
  ["special-room", "special-room-used"].forEach(kind => assert.ok(legend.has(kind), `${kind} legend`));
}

console.log("[PASS] Issue #1965 special rooms are biome-owned, off-route, deterministic, and persistent.");
