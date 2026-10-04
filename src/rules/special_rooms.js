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
  TRAPPED_FOREMAN: "trapped_foreman",
  // The same cell once the miner guild has built its outpost there (#2010).
  MINER_OUTPOST: "miner_outpost",
  // The catacomb altar while the priest is sealed in it, and once the chapel
  // tends it (#2018).
  SEALED_PRIEST: "sealed_priest",
  CHAPEL_ALTAR: "chapel_altar",
  // The nest's brood chamber while the weaver hangs in it, and once the
  // weaving house has strung its hammock there (#2019).
  COCOONED_WEAVER: "cocooned_weaver",
  WEAVER_HAMMOCK: "weaver_hammock",
  // The library's reading room while the scribe is stranded in it, and once
  // the scriptorium keeps it (#2019).
  STRANDED_SCRIBE: "stranded_scribe",
  SCRIBE_READING_ROOM: "scribe_reading_room",
  // The dragon forge's furnace while the smith is shut in behind it, and once
  // the smithy keeps it burning (#2021).
  COLD_FORGE: "cold_forge",
  SMITH_FORGE: "smith_forge",
  // The abyssal throne's mirror while the chamberlain is caught in it, and
  // once the audience hall has raised its oath altar there (#2021).
  MIRROR_CAPTIVE: "mirror_captive",
  OATH_ALTAR: "oath_altar"
});

/** Player-facing names and the short line shown when the room is found. */
export const SPECIAL_ROOM_INFO = Object.freeze({
  mine_vein: Object.freeze({ name: "鉱脈の採掘場", glyph: "鉱", intro: "岩壁に鉱脈が走っている。掘れば素材が取れそうだが、音が坑道に響くだろう。" }),
  altar: Object.freeze({ name: "古い祭壇", glyph: "祭", intro: "朽ちた祭壇が静かに灯っている。浄めか、血の祝福か。" }),
  brood_chamber: Object.freeze({ name: "巣の卵室", glyph: "卵", intro: "脈打つ卵が並んでいる。巣の主が近くで眠っている気配がする。" }),
  reading_room: Object.freeze({ name: "閲覧室", glyph: "書", intro: "水を免れた閲覧机に、この階の見取り図が残っている。" }),
  forge: Object.freeze({ name: "竜火の炉", glyph: "炉", intro: "炉にまだ竜火が残っている。素材をくべれば武器を鍛え直せる。" }),
  mirror_hall: Object.freeze({ name: "鏡の間", glyph: "鏡", intro: "鏡の奥に、さらに深い階の景色が揺れている。覗けば何かを奪われる。" }),
  trapped_foreman: Object.freeze({ name: "崩落した詰所", glyph: "人", intro: "崩れた岩の向こうから、人の声がする。鉱夫が閉じ込められている。" }),
  miner_outpost: Object.freeze({ name: "坑夫の詰所", glyph: "詰", intro: "組合の坑夫が詰めている。補給を分けてくれるという。" }),
  sealed_priest: Object.freeze({ name: "封じられた祭壇", glyph: "人", intro: "祭壇の奥から、かすかな祈りの声がする。誰かが封じられている。" }),
  chapel_altar: Object.freeze({ name: "礼拝堂の祭壇", glyph: "灯", intro: "礼拝堂の灯が祭壇にともっている。浄め、血の祝福、そして献灯。" }),
  cocooned_weaver: Object.freeze({ name: "繭の卵室", glyph: "人", intro: "卵の並ぶ部屋の奥に、人の形をした繭が吊られている。巣の主が近くで眠っている。" }),
  weaver_hammock: Object.freeze({ name: "織り手の吊り寝床", glyph: "寝", intro: "巣の糸で編んだ寝床が吊られている。魔物の寄りつかない静かな場所だ。" }),
  stranded_scribe: Object.freeze({ name: "水に沈んだ閲覧室", glyph: "人", intro: "水の引かない閲覧室の書棚の上に、誰かが取り残されている。" }),
  scribe_reading_room: Object.freeze({ name: "写本師の閲覧室", glyph: "写", intro: "写本師の整えた閲覧机に、この階と次の階の見取り図が並んでいる。" }),
  cold_forge: Object.freeze({ name: "火の消えた炉", glyph: "人", intro: "炉の火が消えている。その奥の鉄の扉を、誰かが内側から叩いている。" }),
  smith_forge: Object.freeze({ name: "鍛冶師の炉", glyph: "鍛", intro: "鍛冶師の弟子が炉の火を守っている。武器を預ければ、長く保つ熱を入れてくれる。" }),
  mirror_captive: Object.freeze({ name: "囚われの鏡", glyph: "人", intro: "鏡の中に、こちらを叩く人影がある。鏡は生気を欲しがっている。" }),
  oath_altar: Object.freeze({ name: "誓約の祭壇", glyph: "誓", intro: "鏡の前に祭壇が据えられている。覗くか、生きて帰ると誓うか。" })
});

// Mine vein: digging spends exploration turns and makes noise, like rubble.
export const VEIN_DIG_TURNS = 3;
export const VEIN_MATERIAL_BONUS = 1;
/** Chance that a finished dig draws an ordinary ambush. */
export const VEIN_AMBUSH_CHANCE = 0.35;
// Miner outpost: one supply per run, or (once bought) a blast that clears the
// floor's rubble. The blast is loud: its noise lingers longer than a dig's.
export const OUTPOST_SUPPLY_ITEM_IDS = Object.freeze(["HEAL_POTION", "ANTIDOTE", "TRAP_KIT"]);
export const OUTPOST_BLAST_NOISE_TTL = 8;
// Weaver's hammock (#2019): a rest takes turns and restores a share of max
// HP; mending costs materials and adds DEF for a few battles.
export const HAMMOCK_REST_TURNS = 4;
export const HAMMOCK_REST_HP_RATE = 0.3;
export const MENDING_MATERIAL_COST = 2;
export const MENDING_BATTLES = 3;
export const MENDING_RATE = 0.25;
// Scribe's reading room (#2019): copying a manuscript takes turns and yields
// guidebook fragments.
export const COPY_TURNS = 3;
export const COPY_FRAGMENTS = 1;
// Altar: a cleanse costs materials; the blood blessing converts HP into MP.
export const ALTAR_CLEANSE_MATERIAL_COST = 2;
export const ALTAR_BLOOD_HP_RATE = 0.25;
// Reading room: studying the floor plan takes a couple of turns.
export const READING_TURNS = 2;
// Forge: a material-fed temper adds weapon ATK for a few battles.
export const FORGE_MATERIAL_COST = 2;
export const FORGE_TEMPER_BATTLES = 3;
export const FORGE_TEMPER_RATE = 0.2;
// Smith's forge (#2021): the temper holds longer, or the equipped weapon is
// reforged one grade up, past the grade finds can carry.
export const SMITH_TEMPER_BATTLES = 5;
export const REFORGE_MATERIAL_COST = 4;
export const REFORGE_MAX_LEVEL = 6;
// Oath altar (#2021): the mirror gallery shows this many floors ahead.
export const GALLERY_VISION_FLOORS = 2;
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

/** HP a keeper's seal takes: a share of max HP, never the last point (#2018). */
export function getRescueBloodCost(char, maxHp, rate) {
  const hp = Math.max(0, Math.floor(Number(char?.hp) || 0));
  const cost = Math.max(1, Math.ceil((Number(maxHp) || 1) * (Number(rate) || 0)));
  return Math.min(cost, Math.max(0, hp - 1));
}

/**
 * What a chapel offering can send home: for each material the run carries,
 * the whole stack up to the limit. Pure.
 */
export function getOfferingChoices(runMaterials, limit) {
  return Object.entries(runMaterials || {})
    .map(([name, quantity]) => ({ name, quantity: Math.min(limit, Math.max(0, Math.floor(Number(quantity) || 0))) }))
    .filter(choice => choice.quantity > 0);
}

/**
 * Move one offering from the carried materials to the offered ones. Pure:
 * returns the next balances, or null when the run does not carry the material.
 */
export function applyOffering(runMaterials, offeredMaterials, name, limit) {
  const choice = getOfferingChoices(runMaterials, limit).find(candidate => candidate.name === name);
  if (!choice) return null;
  const materials = { ...runMaterials, [name]: Math.floor(Number(runMaterials[name]) || 0) - choice.quantity };
  if (materials[name] <= 0) delete materials[name];
  return {
    materials,
    offered: { ...offeredMaterials, [name]: (Math.floor(Number(offeredMaterials?.[name]) || 0)) + choice.quantity },
    sent: choice.quantity
  };
}

/**
 * What the grave keeps of the materials a death lost: a share of each type,
 * rounded down, up to a total limit in the order the materials are given.
 * Pure.
 */
export function getGraveMaterials(lostMaterials, rate, limit) {
  const grave = {};
  let room = Math.max(0, Math.floor(Number(limit) || 0));
  Object.entries(lostMaterials || {}).forEach(([name, quantity]) => {
    const kept = Math.min(room, Math.floor(Math.max(0, Number(quantity) || 0) * rate));
    if (kept <= 0) return;
    grave[name] = kept;
    room -= kept;
  });
  return grave;
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

export function applyForgeTemper(char, weaponAtk, battles = FORGE_TEMPER_BATTLES) {
  const bonus = getForgeTemperAmount(weaponAtk);
  char.forgeTemper = { bonus, battles };
  return char.forgeTemper;
}

/** The enhancement grade a reforge leaves on a weapon, or null when it cannot rise. */
export function getReforgedLevel(weapon) {
  const level = Math.max(0, Math.floor(Number(weapon?.enhanceLevel) || 0));
  return level >= REFORGE_MAX_LEVEL ? null : level + 1;
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

/** HP a rest in the hammock restores: a share of max HP, up to what is missing. */
export function getHammockRestAmount(char, maxHp) {
  const hp = Math.max(0, Math.floor(Number(char?.hp) || 0));
  const max = Math.max(0, Math.floor(Number(maxHp) || 0));
  return Math.max(0, Math.min(max - hp, Math.ceil(max * HAMMOCK_REST_HP_RATE)));
}

/** Flat DEF a mended armor adds for the given equipment DEF. */
export function getArmorMendAmount(equipmentDef) {
  return Math.max(1, Math.round((Number(equipmentDef) || 0) * MENDING_RATE));
}

/** Active mend DEF on a character, or 0. */
export function getArmorMendBonus(char) {
  const mend = char?.armorMend;
  if (!mend) return 0;
  return Math.max(0, Math.floor(Number(mend.bonus) || 0));
}

export function applyArmorMend(char, equipmentDef) {
  const bonus = getArmorMendAmount(equipmentDef);
  char.armorMend = { bonus, battles: MENDING_BATTLES };
  return char.armorMend;
}

/**
 * Called as a battle starts, like the forge temper: the mend covers
 * MENDING_BATTLES battles. Returns "worn" when it wore off before this battle.
 */
export function startArmorMendBattle(char) {
  const mend = char?.armorMend;
  if (!mend) return null;
  const battles = Math.max(0, Math.floor(Number(mend.battles) || 0));
  if (battles <= 0) {
    delete char.armorMend;
    return "worn";
  }
  mend.battles = battles - 1;
  return "active";
}

/** Clear every status the altar can cleanse. Returns the cleared ids. */
export function cleanseAltarStatuses(char, { hasStatusEffect, removeStatusEffect, ids }) {
  return ids.filter(id => hasStatusEffect(char, id) && removeStatusEffect(char, id));
}

/** Clear every intact rubble cell on the floor. Returns how many were cleared. */
export function clearFloorRubble(grid) {
  let cleared = 0;
  grid?.forEach(row => row?.forEach(cell => {
    const obstacle = cell?.obstacle;
    if (obstacle?.kind !== "rubble" || obstacle.state === "cleared") return;
    obstacle.state = "cleared";
    obstacle.discovered = true;
    cleared += 1;
  }));
  return cleared;
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
export function hasMirrorVisionFor(previousGrid, distance = 1) {
  return findCells(previousGrid, cell => {
    const room = getSpecialRoom(cell);
    if (!room?.used) return false;
    // A room that showed floors ahead says how many (`vision`: true is one
    // floor); a used mirror hall always showed the next one.
    const reach = room.vision === true ? 1 : Math.max(0, Math.floor(Number(room.vision) || 0));
    return reach >= distance || (distance === 1 && room.kind === SPECIAL_ROOMS.MIRROR_HALL);
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
