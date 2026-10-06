import { START_X, START_Y } from "../data.js";
import { ITEMS } from "../data/items.js";
import { BASE_STARTING_MP, BASIC_RUNE_ITEM_ID } from "../data/magic.js";
import { findMapCellByType } from "../rules/map_queries.js";
import { createDefaultCodexEvents, createDefaultCodexStats } from "./codex_state.js";

export function generateRandomSeed() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `CASTLE-${result}`;
}

export const createDefaultCodex = () => ({
  monsters: {},
  equipment: {},
  insights: [],
  events: createDefaultCodexEvents(),
  stats: createDefaultCodexStats()
});

export const createDefaultCurrentRun = () => ({
  startedAt: 0,
  startFloor: 1,
  startingKit: null,
  deepestFloor: 1,
  steps: 0,
  floorSteps: {},
  explorationRecovery: {},
  battles: 0,
  kills: 0,
  elitesKilled: 0,
  bossesKilled: 0,
  chestsOpened: 0,
  goldEarned: 0,
  lootCount: 0,
  trapsTriggered: 0,
  trapsDisarmed: 0,
  expGained: 0,
  materials: {},
  bankedMaterials: {},
  townInventory: [],
  departureCraftItems: [],
  unbankedObjectLoot: [],
  pendingRewardBundle: null,
  bankedObjectLoot: [],
  lostObjectLoot: [],
  eventObservations: {},
  returnedTownItems: [],
  lostTownItems: [],
  overflowTownItems: [],
  representativeItem: null,
  meaningfulItemHistory: [],
  codexInsights: [],
  workshopUnlocks: [],
  returnProcessing: null,
  nearMiss: null,
  featResult: null,
  featsAnnounced: [],
  // People being led out of the dungeon; rescued only by a safe return (#2009).
  companions: [],
  // Materials a chapel offering sent home, and what a death left on the grave (#2018).
  offeredMaterials: {},
  graveResult: null,
  // Sworn at the oath altar (#2021): full recovery now, nothing banked if the run dies.
  oath: false,
  // Round-trip prototype rule (#2066): null for an ordinary run.
  roundTrip: null,
  // Guidebook fragments carried by this run, and what became of them (#2013).
  guideFragments: 0,
  guideResult: null,
  // What the end of the run did with orders placed at facilities (#2014).
  orderResult: null,
  lootSequence: 0,
  itemsFound: [],
  equipmentFound: [],
  dangerScore: 0,
  returnReason: "",
  outcome: "",
  deathLogs: [],
  campRested: {},
  pendingCampEntryFloor: null,
  completedCampEntryFloors: [],
  // Deterministic five-floor trial selections are cached so old saves and
  // future generator changes cannot reroll an already decided band.
  trialBands: {},
  // Per-floor elite lifecycle and greed-trigger state. This is persisted so
  // entry/prolonged rolls and qualitative warnings cannot reroll on load.
  eliteFloors: {},
  eliteDefeatedFloors: [],
  defeatedMilestones: [],
  visitedMilestoneMerchants: [],
  quests: [],
  defeatsByRole: {},
  codexRewards: {},
  departureItems: [],
  // Build vNext (#1801): the first ordinary chest's three-way build seed.
  buildSeedOffered: false,
  firstKillsBefore: [],
  keyItemsBefore: [],
  codexDiscoveries: [],
  workshopDiscoveries: [],
  recordResult: null
});

export const STARTING_KITS = Object.freeze([
  Object.freeze({
    id: "vanguard",
    name: "鋼の前線キット",
    description: "ショートソード・スモールシールド・レザーアーマー",
    gear: Object.freeze(["SHORT_SWORD", "SMALL_SHIELD", "LEATHER_ARMOR"])
  }),
  Object.freeze({
    id: "scout",
    name: "軽装探索キット",
    description: "ダガー・バックラー・探索者の外套",
    gear: Object.freeze(["DAGGER", "BUCKLER", "EXPLORER_CLOAK"])
  }),
  Object.freeze({
    id: "devotion",
    name: "祈りの旅装キット",
    description: "メイス・スモールシールド・ローブ",
    gear: Object.freeze(["MACE", "SMALL_SHIELD", "ROBE"])
  }),
  Object.freeze({
    id: "arcana",
    name: "術式の旅装キット",
    description: "魔術師の杖・ローブ",
    gear: Object.freeze(["WAND", "ROBE"]),
    // The medium starts with the basic rune set, so spells work from turn one.
    startsWithRune: true
  })
]);

// Kits opened by a town facility (#2009). They are kept apart from the four
// base kits so every tool that sweeps STARTING_KITS keeps measuring the same
// set. `items` are supplies handed out at every departure with the kit; like
// the Workshop's fixed items they are not crafted and never return to storage.
export const UNLOCKABLE_STARTING_KITS = Object.freeze([
  Object.freeze({
    id: "miner",
    name: "坑夫キット",
    description: "メイス・レザーアーマー・罠外しキット2個・探知石",
    gear: Object.freeze(["MACE", "LEATHER_ARMOR"]),
    items: Object.freeze(["TRAP_KIT", "TRAP_KIT", "TRAP_SENSE_STONE"])
  }),
  // The chapel's kit (#2018): a sword behind a spell-turning shield, in a robe.
  Object.freeze({
    id: "pilgrim",
    name: "巡礼キット",
    description: "ショートソード・魔法盾・ローブ・祝福の聖水",
    gear: Object.freeze(["SHORT_SWORD", "MAGIC_SHIELD", "ROBE"]),
    items: Object.freeze(["HOLY_WATER"])
  }),
  // The weaving house's kit (#2019): light and quiet, with the tools to
  // slip past ordinary monsters instead of a shield.
  Object.freeze({
    id: "stalker",
    name: "忍び足キット",
    description: "ダガー・ローブ・静寂の香2個・鳴らし玉",
    gear: Object.freeze(["DAGGER", "ROBE"]),
    items: Object.freeze(["SILENCE_INCENSE", "SILENCE_INCENSE", "NOISE_BALL"])
  }),
  // The scriptorium's kit (#2019): a two-handed staff with the basic rune
  // already set, and mana to spend.
  Object.freeze({
    id: "scribe",
    name: "写本師キット",
    description: "賢者の杖・ローブ・魔力草2個",
    gear: Object.freeze(["SAGE_STAFF", "ROBE"]),
    items: Object.freeze(["MANA_POTION", "MANA_POTION"]),
    startsWithRune: true
  }),
  // The smithy's kit (#2021): the heaviest armor behind the lightest weapon.
  // Heavier weapons with this armor measured well above every other kit.
  Object.freeze({
    id: "ironclad",
    name: "重装キット",
    description: "ダガー・プレートメイル・守りの薬",
    gear: Object.freeze(["DAGGER", "PLATE_MAIL"]),
    items: Object.freeze(["GUARD_POTION"])
  }),
  // The audience hall's kit (#2021): a ceremonial guard's great shield and
  // mace over a robe.
  Object.freeze({
    id: "ceremonial",
    name: "儀仗キット",
    description: "メイス・ラージシールド・ローブ",
    gear: Object.freeze(["MACE", "LARGE_SHIELD", "ROBE"])
  })
]);

export function getStartingKit(startingKitId) {
  return STARTING_KITS.find(kit => kit.id === startingKitId) ||
    UNLOCKABLE_STARTING_KITS.find(kit => kit.id === startingKitId) ||
    null;
}

/** Supplies a kit carries into every run (empty for the base kits). */
export function getStartingKitItems(startingKitId) {
  return [...(getStartingKit(startingKitId)?.items || [])];
}

// Starting kits are the vNext ownership boundary for departure choices. This
// baseline deliberately has no kit-specific passive, spell list, class growth,
// or class permission. Equipment, Core, and Support own build identity.
const STARTING_KIT_CHARACTER_BASELINE = Object.freeze({
  name: "冒険者",
  level: 1,
  exp: 0,
  hp: 45,
  maxHp: 45,
  mp: BASE_STARTING_MP,
  maxMp: BASE_STARTING_MP,
  status: "ok",
  mediumState: { mediumKey: null, socketedRunes: [] },
  equipment: {
    weapon: null,
    shield: null,
    armor: null,
    accessory: null,
    accessory2: null
  }
});

export function createStartingKitCharacter(startingKitId) {
  const kit = getStartingKit(startingKitId);
  if (!kit) return null;
  const character = structuredClone(STARTING_KIT_CHARACTER_BASELINE);
  character.startingKit = kit.id;
  kit.gear.forEach(itemId => {
    const slot = ITEMS[itemId]?.type;
    if (slot && Object.hasOwn(character.equipment, slot)) {
      character.equipment[slot] = itemId;
    }
  });
  if (kit.startsWithRune) {
    character.mediumState = {
      mediumKey: character.equipment.weapon,
      socketedRunes: [BASIC_RUNE_ITEM_ID]
    };
  }
  return character;
}

export function findSuitableRoamingMonsterStart(mapData) {
  const grid = mapData.grid;
  const stairsUp = findMapCellByType(grid, "stairs-up") || { x: START_X, y: START_Y };
  const stairsDown = mapData.stairsDownCoord || { x: -1, y: -1 };
  const boss = mapData.bossCoord || { x: -1, y: -1 };
  const candidates = [];
  for (let y = 1; y < grid.length - 1; y++) {
    for (let x = 1; x < grid[y].length - 1; x++) {
      const cell = grid[y][x];
      if (cell.walls.some(w => !w)) {
        const isStairsUp = (x === stairsUp.x && y === stairsUp.y);
        const isStairsDown = (x === stairsDown.x && y === stairsDown.y);
        const isBoss = (x === boss.x && y === boss.y);
        const hasEvent = cell.event === "boss" || cell.event === "midboss";
        if (!isStairsUp && !isStairsDown && !isBoss && !hasEvent) {
          const dist = Math.abs(x - stairsUp.x) + Math.abs(y - stairsUp.y);
          if (dist >= 5) {
            candidates.push({ x, y });
          }
        }
      }
    }
  }
  if (candidates.length > 0) {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }
  for (let y = 1; y < grid.length - 1; y++) {
    for (let x = 1; x < grid[y].length - 1; x++) {
      const cell = grid[y][x];
      if (cell.walls.some(w => !w)) {
        if (x !== stairsUp.x || y !== stairsUp.y) {
          return { x, y };
        }
      }
    }
  }
  return null;
}
