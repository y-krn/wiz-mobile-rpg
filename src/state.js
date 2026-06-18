import { DIR_N, ITEMS, MAP_WIDTH, MAP_HEIGHT, START_X, START_Y } from "./data.js";
import { generateRandomMap, removeIsolatedInternalWalls } from "./map_generator.js";


// Save key for local storage
const SAVE_KEY = "mobile_wiz_rpg_save";
const AUTOSAVE_KEY = "mobile_wiz_rpg_autosave";

// Default roster (all 8 classes)
export const createDefaultRoster = () => [
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
      weapon: "LONG_SWORD",
      shield: "LARGE_SHIELD",
      armor: "CHAIN_MAIL"
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
      armor: "LEATHER_ARMOR"
    }
  },
  {
    name: "Maria",
    class: "Priest",
    level: 1,
    exp: 0,
    hp: 12,
    maxHp: 12,
    mp: 3,
    maxMp: 3,
    str: 9,
    int: 10,
    pie: 15,
    vit: 11,
    agi: 9,
    luk: 10,
    status: "ok",
    spells: ["DIOS", "MILWA", "DIURCO", "BADIOS"],
    equipment: {
      weapon: "DAGGER",
      shield: "SMALL_SHIELD",
      armor: "ROBE"
    }
  },
  {
    name: "Ged",
    class: "Mage",
    level: 1,
    exp: 0,
    hp: 9,
    maxHp: 9,
    mp: 4,
    maxMp: 4,
    str: 7,
    int: 16,
    pie: 9,
    vit: 8,
    agi: 11,
    luk: 9,
    status: "ok",
    spells: ["HALITO", "DUMAPIC"],
    equipment: {
      weapon: "DAGGER",
      shield: null,
      armor: "ROBE"
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
    str: 12,
    int: 11,
    pie: 8,
    vit: 12,
    agi: 10,
    luk: 8,
    status: "ok",
    spells: [],
    equipment: {
      weapon: "KATANA",
      shield: "SMALL_SHIELD",
      armor: "CHAIN_MAIL"
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
      armor: "ROBE"
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
    agi: 11,
    luk: 9,
    status: "ok",
    spells: [],
    equipment: {
      weapon: "SHORT_SWORD",
      shield: "SMALL_SHIELD",
      armor: "LEATHER_ARMOR"
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
      armor: "ROBE"
    }
  }
];

export const createDefaultParty = () => [];

// Level EXP chart
// EXP_LEVELS[level] represents cumulative EXP required to reach that level.
// Level 1 is initial state.
export const EXP_LEVELS = [0, 0, 200, 800, 2000, 4500, 9000, 16000, 25000, 40000, 60000];

// Main State Object
export const state = {
  // Exploration Coordinates
  x: START_X,
  y: START_Y,
  dir: DIR_N,

  // Party, Roster & Inventory
  party: [],
  roster: [],
  gold: 150,
  inventory: ["HEAL_POTION", "HEAL_POTION"],

  // Map & Light
  floor: 1,
  maps: [null, null, null, null, null],
  visitedMaps: [null, null, null, null, null],
  lightTurns: 0,
  repelTurns: 0,
  eventCooldownTurns: 0,
  activeMerchantStock: [],

  // New tracking properties for short-term rewards
  floorChestsOpened: [0, 0, 0, 0, 0],
  floorChestsTotal: [0, 0, 0, 0, 0],
  firstKills: [],

  // Current screen state: 'town', 'explore', 'combat', 'chest', 'gameover', 'victory'
  gameState: "town",

  // Context-specific substates
  combatState: null,
  chestState: null,

  // Message logs
  logs: [],
  transitioning: false,

  // Dynamic getters for floor-specific maps to maintain backwards compatibility
  get map() {
    return this.maps[this.floor - 1];
  },
  get visitedMap() {
    return this.visitedMaps[this.floor - 1];
  }
};

// Initial state builder
export function initNewGame() {
  state.x = START_X;
  state.y = START_Y;
  state.dir = DIR_N;
  state.roster = createDefaultRoster();
  state.party = []; // Start with empty party
  state.gold = 150;
  state.inventory = ["HEAL_POTION", "HEAL_POTION"];
  
  state.floor = 1;
  const b1 = generateRandomMap(1);
  const b2 = generateRandomMap(2, b1.stairsDownCoord);
  const b3 = generateRandomMap(3, b2.stairsDownCoord);
  const b4 = generateRandomMap(4, b3.stairsDownCoord);
  const b5 = generateRandomMap(5, b4.stairsDownCoord);
  state.maps = [b1.grid, b2.grid, b3.grid, b4.grid, b5.grid];
  state.visitedMaps = [
    Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false)),
    Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false)),
    Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false)),
    Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false)),
    Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false))
  ];

  // Mark initial coordinate as visited
  state.visitedMap[state.y][state.x] = true;
  state.lightTurns = 0;
  state.repelTurns = 0;
  state.eventCooldownTurns = 0;
  state.activeMerchantStock = [];

  state.floorChestsOpened = [0, 0, 0, 0, 0];
  state.floorChestsTotal = state.maps.map(grid => {
    let count = 0;
    if (grid) {
      for (let y = 0; y < MAP_HEIGHT; y++) {
        for (let x = 0; x < MAP_WIDTH; x++) {
          if (grid[y] && grid[y][x] && grid[y][x].event === "chest") {
            count++;
          }
        }
      }
    }
    return count;
  });
  state.firstKills = [];

  state.gameState = "town";
  state.combatState = null;
  state.chestState = null;
  state.transitioning = false;
  state.logs = ["リルガミンの街へようこそ。準備を整えて迷宮に入りましょう！"];
  saveGame();
  saveAutosave();
}

// Load Game
export function loadGame(forceSaveOnly = false) {
  try {
    const key = (!forceSaveOnly && localStorage.getItem(AUTOSAVE_KEY)) ? AUTOSAVE_KEY : SAVE_KEY;
    const raw = localStorage.getItem(key);
    if (!raw) {
      initNewGame();
      return;
    }
    const data = JSON.parse(raw);
    state.x = data.x ?? START_X;
    state.y = data.y ?? START_Y;
    state.dir = data.dir ?? DIR_N;
    state.party = data.party ?? [];
    state.roster = data.roster;
    if (!state.roster) {
      // Restore roster from current party and default roster
      let roster = [];
      if (data.party && data.party.length > 0) {
        roster = [...data.party];
      }
      const defRoster = createDefaultRoster();
      defRoster.forEach(defChar => {
        if (!roster.some(c => c.name === defChar.name)) {
          roster.push(defChar);
        }
      });
      state.roster = roster;
    }

    // Spell list migration for existing save data
    const migrateCharSpells = (char) => {
      if (!char.spells) char.spells = [];
      if (char.class === "Priest") {
        if (!char.spells.includes("DIURCO")) char.spells.push("DIURCO");
        if (!char.spells.includes("BADIOS")) char.spells.push("BADIOS");
        // DIALMA requires level 8
        if (char.level < 8 && char.spells.includes("DIALMA")) {
          char.spells = char.spells.filter(s => s !== "DIALMA");
        }
        // KADORTO requires level 9
        if (char.level < 9 && char.spells.includes("KADORTO")) {
          char.spells = char.spells.filter(s => s !== "KADORTO");
        }
        if (char.spells.includes("MASFEAL")) {
          char.spells = char.spells.filter(s => s !== "MASFEAL");
        }
      }
      if (char.class === "Mage") {
        if (char.level >= 4) {
          if (!char.spells.includes("MASFEAL")) char.spells.push("MASFEAL");
        } else {
          char.spells = char.spells.filter(s => s !== "MASFEAL");
        }
        // TILTOWAIT requires level 8 now
        if (char.level < 8 && char.spells.includes("TILTOWAIT")) {
          char.spells = char.spells.filter(s => s !== "TILTOWAIT");
        }
        // MADALTO requires level 6
        if (char.level < 6 && char.spells.includes("MADALTO")) {
          char.spells = char.spells.filter(s => s !== "MADALTO");
        }
      }
      if (char.class === "Samurai") {
        if (char.level < 9 && char.spells.includes("TILTOWAIT")) {
          char.spells = char.spells.filter(s => s !== "TILTOWAIT");
        }
        if (char.level < 7 && char.spells.includes("MADALTO")) {
          char.spells = char.spells.filter(s => s !== "MADALTO");
        }
        if (char.spells.includes("MASFEAL")) {
          char.spells = char.spells.filter(s => s !== "MASFEAL");
        }
      }
      if (char.class === "Ranger") {
        if (char.level < 10 && char.spells.includes("KADORTO")) {
          char.spells = char.spells.filter(s => s !== "KADORTO");
        }
        if (char.level < 8 && char.spells.includes("DIALMA")) {
          char.spells = char.spells.filter(s => s !== "DIALMA");
        }
        if (char.spells.includes("MASFEAL")) {
          char.spells = char.spells.filter(s => s !== "MASFEAL");
        }
      }
      if (char.class === "Bishop") {
        if (char.level >= 4) {
          if (!char.spells.includes("MASFEAL")) char.spells.push("MASFEAL");
        } else {
          char.spells = char.spells.filter(s => s !== "MASFEAL");
        }
        if (char.level < 10 && char.spells.includes("TILTOWAIT")) {
          char.spells = char.spells.filter(s => s !== "TILTOWAIT");
        }
        if (char.level < 9 && char.spells.includes("KADORTO")) {
          char.spells = char.spells.filter(s => s !== "KADORTO");
        }
        if (char.level < 7 && char.spells.includes("DIALMA")) {
          char.spells = char.spells.filter(s => s !== "DIALMA");
        }
        if (char.level < 7 && char.spells.includes("MADALTO")) {
          char.spells = char.spells.filter(s => s !== "MADALTO");
        }
      }
    };
    state.party.forEach(migrateCharSpells);
    state.roster.forEach(migrateCharSpells);

    state.gold = data.gold ?? 150;
    state.inventory = data.inventory ?? [];
    
    state.floor = data.floor ?? 1;
    let loadedMaps = data.maps;

    // Check if maps need migration (different dimensions or length !== 5)
    let needsMigration = false;
    if (!loadedMaps || loadedMaps.length < 5) {
      needsMigration = true;
    } else {
      const firstMap = loadedMaps[0];
      if (!firstMap || firstMap.length !== MAP_HEIGHT || (firstMap[0] && firstMap[0].length !== MAP_WIDTH)) {
        needsMigration = true;
      }
    }

    if (needsMigration) {
      const b1 = generateRandomMap(1);
      const b2 = generateRandomMap(2, b1.stairsDownCoord);
      const b3 = generateRandomMap(3, b2.stairsDownCoord);
      const b4 = generateRandomMap(4, b3.stairsDownCoord);
      const b5 = generateRandomMap(5, b4.stairsDownCoord);
      loadedMaps = [b1.grid, b2.grid, b3.grid, b4.grid, b5.grid];
      
      // Reset player coordinates upon migration
      state.x = START_X;
      state.y = START_Y;
      state.floor = 1;
      state.dir = DIR_N;
      addLog("マップデータが新しいバージョンに更新され、スタート地点に戻されました。");

      state.visitedMaps = [
        Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false)),
        Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false)),
        Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false)),
        Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false)),
        Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false))
      ];
      state.visitedMap[state.y][state.x] = true;
    } else {
      state.visitedMaps = data.visitedMaps ?? [
        Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false)),
        Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false)),
        Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false)),
        Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false)),
        Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false))
      ];
    }
    loadedMaps.forEach(map => {
      if (map) removeIsolatedInternalWalls(map);
    });
    state.maps = loadedMaps;
    state.lightTurns = data.lightTurns ?? 0;
    state.repelTurns = data.repelTurns ?? 0;
    state.eventCooldownTurns = data.eventCooldownTurns ?? 0;
    state.activeMerchantStock = data.activeMerchantStock ?? [];
    state.gameState = data.gameState ?? "town";
    state.combatState = data.combatState ?? null;
    state.chestState = data.chestState ?? null;
    state.transitioning = false;
    state.logs = data.logs ?? ["冒険を再開しました。"];
    
    state.floorChestsOpened = data.floorChestsOpened ?? [0, 0, 0, 0, 0];
    state.floorChestsTotal = data.floorChestsTotal ?? state.maps.map(grid => {
      let count = 0;
      if (grid) {
        for (let y = 0; y < MAP_HEIGHT; y++) {
          for (let x = 0; x < MAP_WIDTH; x++) {
            if (grid[y] && grid[y][x] && grid[y][x].event === "chest") {
              count++;
            }
          }
        }
      }
      return count;
    });
    state.firstKills = data.firstKills ?? [];

    // 同期のためにオートセーブデータを更新
    saveAutosave();
  } catch (err) {
    console.error("Failed to load save, resetting.", err);
    initNewGame();
  }
}

// Save Game (Castle)
export function saveGame() {
  try {
    const data = {
      x: state.x,
      y: state.y,
      dir: state.dir,
      party: state.party,
      roster: state.roster,
      gold: state.gold,
      inventory: state.inventory,
      floor: state.floor,
      maps: state.maps,
      visitedMaps: state.visitedMaps,
      lightTurns: state.lightTurns,
      repelTurns: state.repelTurns,
      eventCooldownTurns: state.eventCooldownTurns,
      activeMerchantStock: state.activeMerchantStock,
      floorChestsOpened: state.floorChestsOpened,
      floorChestsTotal: state.floorChestsTotal,
      firstKills: state.firstKills,
      gameState: state.gameState,
      combatState: state.combatState,
      chestState: state.chestState,
      logs: state.logs.slice(-30) // Only save last 30 logs to keep clean
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error("Save game failed", err);
  }
}

// Save Autosave (Session State)
export function saveAutosave() {
  try {
    const data = {
      x: state.x,
      y: state.y,
      dir: state.dir,
      party: state.party,
      roster: state.roster,
      gold: state.gold,
      inventory: state.inventory,
      floor: state.floor,
      maps: state.maps,
      visitedMaps: state.visitedMaps,
      lightTurns: state.lightTurns,
      repelTurns: state.repelTurns,
      eventCooldownTurns: state.eventCooldownTurns,
      activeMerchantStock: state.activeMerchantStock,
      floorChestsOpened: state.floorChestsOpened,
      floorChestsTotal: state.floorChestsTotal,
      firstKills: state.firstKills,
      gameState: state.gameState,
      combatState: state.combatState,
      chestState: state.chestState,
      logs: state.logs.slice(-30)
    };
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error("Save autosave failed", err);
  }
}

// Clear Save
export function clearSave() {
  localStorage.removeItem(SAVE_KEY);
  localStorage.removeItem(AUTOSAVE_KEY);
  initNewGame();
}

// Log message helper
export function addLog(msg) {
  state.logs.push(msg);
  if (state.logs.length > 50) {
    state.logs.shift();
  }
}

// Get Weapon Atk
export function getCharWeaponAtk(char) {
  const wpId = char.equipment.weapon;
  if (!wpId) {
    if (char.class === "Ninja") {
      return 3 * char.level; // Ninja bare hands damage scaling
    }
    return 0;
  }
  return ITEMS[wpId]?.atk || 0;
}

// Get Total Armor Def
export function getCharDef(char) {
  let def = 0;
  if (char.equipment.shield) {
    def += ITEMS[char.equipment.shield]?.def || 0;
  }
  if (char.equipment.armor) {
    def += ITEMS[char.equipment.armor]?.def || 0;
  }
  return def;
}

// Check Level Up
export function checkCharLevelUp(char) {
  const nextLvl = char.level + 1;
  if (nextLvl >= EXP_LEVELS.length) return false; // Max level reached

  // Ninja requires 1.5x EXP
  const req = char.class === "Ninja" ? Math.floor(EXP_LEVELS[nextLvl] * 1.5) : EXP_LEVELS[nextLvl];
  if (char.exp >= req) {
    char.level = nextLvl;
    
    // Gain HP
    let hpGain = 0;
    if (char.class === "Fighter") hpGain = Math.floor(Math.random() * 8) + 8; // 8-15
    else if (char.class === "Thief") hpGain = Math.floor(Math.random() * 5) + 6; // 6-10
    else if (char.class === "Priest") hpGain = Math.floor(Math.random() * 5) + 5; // 5-9
    else if (char.class === "Mage") hpGain = Math.floor(Math.random() * 4) + 4; // 4-7
    else if (char.class === "Samurai") hpGain = Math.floor(Math.random() * 8) + 7; // 7-14
    else if (char.class === "Bishop") hpGain = Math.floor(Math.random() * 5) + 5; // 5-9
    else if (char.class === "Ranger") hpGain = Math.floor(Math.random() * 7) + 6; // 6-13
    else if (char.class === "Ninja") hpGain = Math.floor(Math.random() * 9) + 6; // 6-14
    
    char.maxHp += hpGain;
    char.hp = char.maxHp;

    // Gain MP
    if (char.class === "Priest") {
      const mpGain = Math.floor(Math.random() * 2) + 2; // 2-3
      char.maxMp += mpGain;
      char.mp = char.maxMp;
    } else if (char.class === "Mage") {
      const mpGain = Math.floor(Math.random() * 2) + 3; // 3-4
      char.maxMp += mpGain;
      char.mp = char.maxMp;
    } else if (char.class === "Bishop") {
      const mpGain = Math.floor(Math.random() * 2) + 1; // 1-2
      char.maxMp += mpGain;
      char.mp = char.maxMp;
    } else if (char.class === "Samurai" || char.class === "Ranger") {
      if (char.level >= 3) {
        if (char.maxMp === 0) {
          char.maxMp = 3; // Initialize at level 3
        } else {
          char.maxMp += Math.floor(Math.random() * 2) + 1; // 1-2
        }
        char.mp = char.maxMp;
      }
    }

    // Gain Stats
    if (Math.random() < 0.6) char.str += 1;
    if (Math.random() < 0.6) char.vit += 1;
    if (Math.random() < 0.6) char.agi += 1;
    if (Math.random() < 0.6) char.luk += 1;
    if ((char.class === "Mage" || char.class === "Bishop") && Math.random() < 0.8) char.int += 1;
    if ((char.class === "Priest" || char.class === "Bishop" || char.class === "Ranger") && Math.random() < 0.8) char.pie += 1;
    if ((char.class === "Samurai" || char.class === "Ninja") && Math.random() < 0.8) char.str += 1;
    if ((char.class === "Samurai" || char.class === "Ninja") && Math.random() < 0.8) char.vit += 1;
    if (char.class === "Ninja" && Math.random() < 0.8) char.agi += 1;

    // Learn spells
    if (!char.spells) char.spells = [];
    if (char.class === "Priest") {
      if (char.level === 2 && !char.spells.includes("MADIOS")) {
        char.spells.push("MADIOS", "DIALKO", "LATUMOFIS");
      }
      if (char.level === 3 && !char.spells.includes("LOMILWA")) {
        char.spells.push("LOMILWA");
      }
      if (char.level === 8 && !char.spells.includes("DIALMA")) {
        char.spells.push("DIALMA");
      }
      if (char.level === 9 && !char.spells.includes("KADORTO")) {
        char.spells.push("KADORTO");
      }
    } else if (char.class === "Mage") {
      if (char.level === 2 && !char.spells.includes("LAHALITO")) {
        char.spells.push("LAHALITO");
      }
      if (char.level === 3) {
        if (!char.spells.includes("KATINO")) char.spells.push("KATINO");
        if (!char.spells.includes("MAHALITO")) char.spells.push("MAHALITO");
      }
      if (char.level === 4 && !char.spells.includes("MASFEAL")) {
        char.spells.push("MASFEAL");
      }
      if (char.level === 6 && !char.spells.includes("MADALTO")) {
        char.spells.push("MADALTO");
      }
      if (char.level === 8 && !char.spells.includes("TILTOWAIT")) {
        char.spells.push("TILTOWAIT");
      }
    } else if (char.class === "Samurai") {
      if (char.level === 3) {
        char.spells.push("HALITO", "DUMAPIC");
      }
      if (char.level === 4 && !char.spells.includes("LAHALITO")) {
        char.spells.push("LAHALITO");
      }
      if (char.level === 5) {
        if (!char.spells.includes("KATINO")) char.spells.push("KATINO");
        if (!char.spells.includes("MAHALITO")) char.spells.push("MAHALITO");
      }
      if (char.level === 7 && !char.spells.includes("MADALTO")) {
        char.spells.push("MADALTO");
      }
      if (char.level === 9 && !char.spells.includes("TILTOWAIT")) {
        char.spells.push("TILTOWAIT");
      }
    } else if (char.class === "Ranger") {
      if (char.level === 3) {
        char.spells.push("DIOS", "MILWA", "DIURCO", "BADIOS");
      }
      if (char.level === 4 && !char.spells.includes("MADIOS")) {
        char.spells.push("MADIOS", "DIALKO", "LATUMOFIS");
      }
      if (char.level === 5 && !char.spells.includes("LOMILWA")) {
        char.spells.push("LOMILWA");
      }
      if (char.level === 8 && !char.spells.includes("DIALMA")) {
        char.spells.push("DIALMA");
      }
      if (char.level === 10 && !char.spells.includes("KADORTO")) {
        char.spells.push("KADORTO");
      }
    } else if (char.class === "Bishop") {
      if (char.level === 2) {
        ["MILWA", "DIURCO", "BADIOS", "DUMAPIC"].forEach(s => {
          if (!char.spells.includes(s)) char.spells.push(s);
        });
      }
      if (char.level === 3) {
        ["MADIOS", "DIALKO", "LATUMOFIS", "LAHALITO"].forEach(s => {
          if (!char.spells.includes(s)) char.spells.push(s);
        });
      }
      if (char.level === 4) {
        ["LOMILWA", "KATINO", "MASFEAL"].forEach(s => {
          if (!char.spells.includes(s)) char.spells.push(s);
        });
      }
      if (char.level === 5 && !char.spells.includes("MAHALITO")) {
        char.spells.push("MAHALITO");
      }
      if (char.level === 7) {
        ["DIALMA", "MADALTO"].forEach(s => {
          if (!char.spells.includes(s)) char.spells.push(s);
        });
      }
      if (char.level === 9 && !char.spells.includes("KADORTO")) {
        char.spells.push("KADORTO");
      }
      if (char.level === 10 && !char.spells.includes("TILTOWAIT")) {
        char.spells.push("TILTOWAIT");
      }
    }

    return true;
  }
  return false;
}

