// Biome special rooms (#1965).
//
// Each biome owns one special room kind. Every floor places one room off the
// natural route, so visiting it is a detour the player chooses. A room is used
// once; its state lives on the generated grid cell, so it is saved with the
// floor and shared by exploration, map views, and tests.
//
//   cell.event = "special_room"
//   cell.specialRoom = { kind, used, progress?, discovered }
//
// Rewards stay inside the existing economy: materials, status counterplay,
// an HP-for-MP conversion, an elite fight that leaves a chest, floor
// information, and a short weapon temper. Nothing here adds a currency or a
// permanent stat.

import { DX, DY } from "../constants/directions.js";

export const SPECIAL_ROOM_EVENT = "special_room";

export const SPECIAL_ROOMS = Object.freeze({
  MINE_VEIN: "mine_vein",
  ALTAR: "altar",
  BROOD_CHAMBER: "brood_chamber",
  READING_ROOM: "reading_room",
  FORGE: "forge",
  MIRROR_HALL: "mirror_hall",
  // Not a biome room: it stands in for the mine vein while the foreman is
  // still trapped (#2009, `src/systems/facility_rooms.js`).
  TRAPPED_FOREMAN: "trapped_foreman"
});

/** Player-facing names and the short line shown when the room is found. */
export const SPECIAL_ROOM_INFO = Object.freeze({
  mine_vein: Object.freeze({ name: "鉱脈の採掘場", glyph: "鉱", intro: "岩壁に鉱脈が走っている。掘れば素材が取れそうだが、音が坑道に響くだろう。" }),
  altar: Object.freeze({ name: "古い祭壇", glyph: "祭", intro: "朽ちた祭壇が静かに灯っている。浄めか、血の祝福か。" }),
  brood_chamber: Object.freeze({ name: "巣の卵室", glyph: "卵", intro: "脈打つ卵が並んでいる。巣の主が近くで眠っている気配がする。" }),
  reading_room: Object.freeze({ name: "閲覧室", glyph: "書", intro: "水を免れた閲覧机に、この階の見取り図が残っている。" }),
  forge: Object.freeze({ name: "竜火の炉", glyph: "炉", intro: "炉にまだ竜火が残っている。素材をくべれば武器を鍛え直せる。" }),
  mirror_hall: Object.freeze({ name: "鏡の間", glyph: "鏡", intro: "鏡の奥に、さらに深い階の景色が揺れている。覗けば何かを奪われる。" }),
  trapped_foreman: Object.freeze({ name: "崩落した詰所", glyph: "人", intro: "崩れた岩の向こうから、人の声がする。鉱夫が閉じ込められている。" })
});

// Mine vein: digging spends exploration turns and makes noise, like rubble.
export const VEIN_DIG_TURNS = 3;
export const VEIN_MATERIAL_BONUS = 1;
/** Chance that a finished dig draws an ordinary ambush. */
export const VEIN_AMBUSH_CHANCE = 0.35;
// Trapped foreman: digging him out costs the same turns and noise as a vein.
export const FOREMAN_DIG_TURNS = 3;
// Altar: a cleanse costs materials; the blood blessing converts HP into MP.
export const ALTAR_CLEANSE_MATERIAL_COST = 2;
export const ALTAR_BLOOD_HP_RATE = 0.25;
// Reading room: studying the floor plan takes a couple of turns.
export const READING_TURNS = 2;
// Forge: a material-fed temper adds weapon ATK for a few battles.
export const FORGE_MATERIAL_COST = 2;
export const FORGE_TEMPER_BATTLES = 3;
export const FORGE_TEMPER_RATE = 0.2;
// Mirror hall: the vision of the next floor costs a share of max HP.
export const MIRROR_HP_RATE = 0.15;

export function getSpecialRoom(cell) {
  return cell?.event === SPECIAL_ROOM_EVENT && cell.specialRoom ? cell.specialRoom : null;
}

export function getSpecialRoomInfo(kind) {
  return SPECIAL_ROOM_INFO[kind] || null;
}

export function isSpecialRoomUsed(cell) {
  return Boolean(getSpecialRoom(cell)?.used);
}

export function markSpecialRoomUsed(cell) {
  const room = getSpecialRoom(cell);
  if (!room) return false;
  room.used = true;
  room.discovered = true;
  return true;
}

/** Map-view marker kind for a discovered or currently revealed room, or null. */
export function getSpecialRoomMarkerKind(cell, revealed = false) {
  const room = getSpecialRoom(cell);
  if (!room || !(room.discovered || revealed)) return null;
  return room.used ? "special-room-used" : "special-room";
}

/** HP the blood blessing takes: a share of max HP, never the last point. */
export function getAltarBloodCost(char, maxHp) {
  const hp = Math.max(0, Math.floor(Number(char?.hp) || 0));
  const cost = Math.max(1, Math.ceil((Number(maxHp) || 1) * ALTAR_BLOOD_HP_RATE));
  return Math.min(cost, Math.max(0, hp - 1));
}

/** HP the mirror takes: a share of max HP, never the last point. */
export function getMirrorHpCost(char, maxHp) {
  const hp = Math.max(0, Math.floor(Number(char?.hp) || 0));
  const cost = Math.max(1, Math.ceil((Number(maxHp) || 1) * MIRROR_HP_RATE));
  return Math.min(cost, Math.max(0, hp - 1));
}

/** Flat ATK a forge temper adds for the given base weapon ATK. */
export function getForgeTemperAmount(weaponAtk) {
  return Math.max(1, Math.round((Number(weaponAtk) || 0) * FORGE_TEMPER_RATE));
}

/** Active temper ATK on a character, or 0. */
export function getForgeTemperBonus(char) {
  const temper = char?.forgeTemper;
  if (!temper) return 0;
  return Math.max(0, Math.floor(Number(temper.bonus) || 0));
}

export function applyForgeTemper(char, weaponAtk) {
  const bonus = getForgeTemperAmount(weaponAtk);
  char.forgeTemper = { bonus, battles: FORGE_TEMPER_BATTLES };
  return char.forgeTemper;
}

/**
 * Called as a battle starts. The temper covers FORGE_TEMPER_BATTLES battles:
 * each start spends one charge, and a start with no charge left ends it.
 * Returns "cooled" when the temper wore off before this battle.
 */
export function startForgeTemperBattle(char) {
  const temper = char?.forgeTemper;
  if (!temper) return null;
  const battles = Math.max(0, Math.floor(Number(temper.battles) || 0));
  if (battles <= 0) {
    delete char.forgeTemper;
    return "cooled";
  }
  temper.battles = battles - 1;
  return "active";
}

/** Clear every status the altar can cleanse. Returns the cleared ids. */
export function cleanseAltarStatuses(char, { hasStatusEffect, removeStatusEffect, ids }) {
  return ids.filter(id => hasStatusEffect(char, id) && removeStatusEffect(char, id));
}

function findCells(grid, predicate) {
  const cells = [];
  grid?.forEach((row, y) => row?.forEach((cell, x) => {
    if (predicate(cell)) cells.push({ x, y });
  }));
  return cells;
}

/** Reveal the given cells on a visited grid. Returns how many were new. */
export function revealCells(visited, cells) {
  let revealed = 0;
  cells.forEach(({ x, y }) => {
    if (!visited?.[y] || visited[y][x]) return;
    visited[y][x] = true;
    revealed += 1;
  });
  return revealed;
}

/** Reading room: the floor plan shows the down stairs and every unopened chest. */
export function getReadingRoomTargets(grid) {
  return {
    stairs: findCells(grid, cell => cell?.type === "stairs-down"),
    chests: findCells(grid, cell => cell?.event === "chest")
  };
}

/** Compass words for the offset from (x, y) to a target, for the log. */
export function describeDirection(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return "この場所";
  const vertical = dy < 0 ? "北" : dy > 0 ? "南" : "";
  const horizontal = dx > 0 ? "東" : dx < 0 ? "西" : "";
  if (Math.abs(dx) > Math.abs(dy) * 2) return horizontal;
  if (Math.abs(dy) > Math.abs(dx) * 2) return vertical;
  return `${vertical}${horizontal}`;
}

/**
 * Mirror hall: whether the floor above holds a used mirror, which grants a
 * vision of this floor.
 */
export function hasMirrorVisionFor(previousGrid) {
  return findCells(previousGrid, cell => {
    const room = getSpecialRoom(cell);
    return room?.kind === SPECIAL_ROOMS.MIRROR_HALL && room.used;
  }).length > 0;
}

/** Cells a mirror vision reveals on the floor it shows: the down stairs and its approach. */
export function getMirrorVisionCells(grid) {
  const cells = [];
  findCells(grid, cell => cell?.type === "stairs-down").forEach(({ x, y }) => {
    cells.push({ x, y });
    const cell = grid[y][x];
    for (let dir = 0; dir < 4; dir++) {
      if (cell.walls?.[dir]) continue;
      const nx = x + DX[dir];
      const ny = y + DY[dir];
      if (grid[ny]?.[nx]) cells.push({ x: nx, y: ny });
    }
  });
  return cells;
}
