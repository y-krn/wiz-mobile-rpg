import { START_X, START_Y } from "../data.js";
import { ITEMS } from "../data/items.js";
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

const SOLO_CLASS_PRESETS = [
  {
    name: "Arthur",
    class: "Fighter",
    level: 1,
    exp: 0,
    hp: 20,
    maxHp: 20,
    mp: 0,
    maxMp: 0,
    str: 15,
    int: 7,
    pie: 8,
    vit: 14,
    agi: 10,
    luk: 9,
    status: "ok",
    equipment: {
      weapon: "SHORT_SWORD",
      shield: "SMALL_SHIELD",
      armor: "LEATHER_ARMOR",
      accessory: null,
      accessory2: null
    }
  },
  {
    name: "Robin",
    class: "Thief",
    level: 1,
    exp: 0,
    hp: 15,
    maxHp: 15,
    mp: 0,
    maxMp: 0,
    str: 10,
    int: 9,
    pie: 7,
    vit: 10,
    agi: 16,
    luk: 15,
    status: "ok",
    equipment: {
      weapon: "SHORT_SWORD",
      shield: "SMALL_SHIELD",
      armor: "LEATHER_ARMOR",
      accessory: null,
      accessory2: null
    }
  },
  {
    name: "Maria",
    class: "Priest",
    level: 1,
    exp: 0,
    hp: 14,
    maxHp: 14,
    // #267: B5到達時点の残MPが平均1.64しかなく、ボス戦の呪文使用ターンが0.80turn
    // （必要17.80turnに対し）だった。火力窓を延長するため +6。
    mp: 13,
    maxMp: 13,
    str: 9,
    int: 10,
    pie: 15,
    vit: 11,
    agi: 9,
    luk: 10,
    status: "ok",
    spells: ["DIOS", "MILWA", "DIURCO", "BADIOS"],
    equipment: {
      weapon: "MACE",
      shield: "SMALL_SHIELD",
      armor: "ROBE",
      accessory: null,
      accessory2: null
    }
  },
  {
    name: "Ged",
    class: "Mage",
    level: 1,
    exp: 0,
    // #537: HP順序（戦士 > 盗賊 > 僧侶 ≧ 魔術師）を守り、耐久はpassiveで補う。
    hp: 14,
    maxHp: 14,
    // #267: B5到達時点の残MPが平均2.95、ボス戦の呪文使用ターンが0.96turn だった。+6。
    mp: 12,
    maxMp: 12,
    str: 7,
    int: 16,
    pie: 9,
    vit: 8,
    agi: 11,
    luk: 9,
    status: "ok",
    spells: ["HALITO", "DUMAPIC"],
    equipment: {
      weapon: "WAND",
      shield: null,
      armor: "ROBE",
      accessory: null,
      accessory2: null
    }
  },
  {
    name: "Ken",
    class: "Samurai",
    level: 1,
    exp: 0,
    hp: 18,
    maxHp: 18,
    mp: 0,
    maxMp: 0,
    str: 14,
    int: 10,
    pie: 8,
    vit: 12,
    agi: 10,
    luk: 8,
    status: "ok",
    spells: [],
    equipment: {
      weapon: "SHORT_SWORD",
      shield: "SMALL_SHIELD",
      armor: "LEATHER_ARMOR",
      accessory: null,
      accessory2: null
    }
  },
  {
    name: "Sophia",
    class: "Bishop",
    level: 1,
    exp: 0,
    hp: 11,
    maxHp: 11,
    mp: 3,
    maxMp: 3,
    str: 9,
    int: 12,
    pie: 12,
    vit: 10,
    agi: 9,
    luk: 9,
    status: "ok",
    spells: ["DIOS", "HALITO"],
    equipment: {
      weapon: "WAND",
      shield: null,
      armor: "ROBE",
      accessory: null,
      accessory2: null
    }
  },
  {
    name: "Kael",
    class: "Ranger",
    level: 1,
    exp: 0,
    hp: 16,
    maxHp: 16,
    mp: 0,
    maxMp: 0,
    str: 11,
    int: 8,
    pie: 11,
    vit: 11,
    agi: 12,
    luk: 10,
    status: "ok",
    spells: [],
    equipment: {
      weapon: "SHORT_SWORD",
      shield: "SMALL_SHIELD",
      armor: "LEATHER_ARMOR",
      accessory: null,
      accessory2: null
    }
  },
  {
    name: "Hanzo",
    class: "Ninja",
    level: 1,
    exp: 0,
    hp: 15,
    maxHp: 15,
    mp: 0,
    maxMp: 0,
    str: 12,
    int: 8,
    pie: 8,
    vit: 12,
    agi: 12,
    luk: 12,
    status: "ok",
    spells: [],
    equipment: {
      weapon: null,
      shield: null,
      armor: "NINJA_SUIT",
      accessory: null,
      accessory2: null
    }
  }
];

export const SOLO_CLASSES = SOLO_CLASS_PRESETS.map(({ class: className }) => className);

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

export function createSoloCharacter(className) {
  const preset = SOLO_CLASS_PRESETS.find(char => char.class === className);
  if (!preset) return null;
  return structuredClone(preset);
}

// Starting kits are the vNext ownership boundary for departure choices. This
// baseline deliberately has no kit-specific passive, spell list, class growth,
// or class permission. The registered compatibility class is fixed to Fighter
// so legacy progression consumers retain their current rules; it is identical
// for every kit and is not a gameplay choice.
const STARTING_KIT_CHARACTER_BASELINE = Object.freeze({
  name: "冒険者",
  class: "Fighter",
  level: 1,
  exp: 0,
  hp: 20,
  maxHp: 20,
  mp: 0,
  maxMp: 0,
  str: 10,
  int: 10,
  pie: 10,
  vit: 10,
  agi: 10,
  luk: 10,
  status: "ok",
  spells: [],
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
