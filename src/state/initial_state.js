import { START_X, START_Y } from "../data.js";
import { ITEMS } from "../data/items.js";
import { BASE_STARTING_MP, BASIC_RUNE_ITEM_ID } from "../data/magic.js";
import { findMapCellByType } from "../rules/map_queries.js";

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
  events: {
    traps: {
      "poison needle": { triggered: 0, disarmed: 0, firstFloor: 0 },
      "gas bomb": { triggered: 0, disarmed: 0, firstFloor: 0 },
      "teleporter": { triggered: 0, disarmed: 0, firstFloor: 0 },
      "flash bomb": { triggered: 0, disarmed: 0, firstFloor: 0 },
      "pitfall": { triggered: 0, disarmed: 0, firstFloor: 0 }
    },
    facilities: {
      spring: { found: 0, used: 0 },
      merchant: { found: 0, purchased: 0 },
      tablet: { found: 0, read: 0 },
      chest: { found: 0, opened: 0 }
    }
  },
  stats: {
    totalRuns: 0,
    totalDeaths: 0,
    deepestFloor: 1,
    totalKills: 0,
    totalChests: 0
  }
});

export const createDefaultCurrentRun = () => ({
  startedAt: 0,
  startFloor: 1,
  startingKit: null,
  deepestFloor: 1,
  steps: 0,
  floorSteps: {},
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
  unbankedObjectLoot: [],
  pendingRewardBundle: null,
  bankedObjectLoot: [],
  lostObjectLoot: [],
  eventObservations: {},
  returnedTownItems: [],
  representativeItem: null,
  meaningfulItemHistory: [],
  codexInsights: [],
  workshopUnlocks: [],
  returnProcessing: null,
  lootSequence: 0,
  itemsFound: [],
  equipmentFound: [],
  firstKills: [],
  floorsVisited: [],
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
  eliteOmenSteps: {},
  eliteDefeatedFloors: [],
  defeatedMilestones: [],
  visitedMilestoneMerchants: [],
  quests: [],
  defeatsByRole: {},
  codexRewards: {},
  departureItems: [],
  departureEquipment: {},
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
    description: "ショートソード・スモールシールド・レザーアーマー",
    gear: Object.freeze(["SHORT_SWORD", "SMALL_SHIELD", "LEATHER_ARMOR"])
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
    gear: Object.freeze(["WAND", "ROBE"])
  })
]);

export function getStartingKit(startingKitId) {
  return STARTING_KITS.find(kit => kit.id === startingKitId) || null;
}

// Starting kits are the vNext ownership boundary for departure choices. This
// baseline deliberately has no kit-specific passive, spell list, class growth,
// or class permission. Six base abilities remain universal inputs to the
// existing combat and exploration formulas; equipment, Core, and Support own
// build identity.
const STARTING_KIT_CHARACTER_BASELINE = Object.freeze({
  name: "冒険者",
  level: 1,
  exp: 0,
  hp: 20,
  maxHp: 20,
  mp: BASE_STARTING_MP,
  maxMp: BASE_STARTING_MP,
  str: 10,
  int: 10,
  pie: 10,
  vit: 10,
  agi: 10,
  luk: 10,
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
  if (kit.id === "arcana") {
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
