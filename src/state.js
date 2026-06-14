import { DIR_N, ITEMS, MONSTERS, MAP_WIDTH, MAP_HEIGHT, START_X, START_Y } from "./data.js";
import { generateRandomMap, removeIsolatedInternalWalls } from "./map_generator.js";


// Save key for local storage
const SAVE_KEY = "mobile_wiz_rpg_save";
const AUTOSAVE_KEY = "mobile_wiz_rpg_autosave";

// Default characters
export const createDefaultParty = () => [
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
  }
];

// Level EXP chart
// EXP_LEVELS[level] represents cumulative EXP required to reach that level.
// Level 1 is initial state. Level 2 needs 100 EXP, Level 3 needs 300 EXP, etc.
export const EXP_LEVELS = [0, 0, 200, 800, 2500, 7500, 20000];

// Main State Object
export const state = {
  // Exploration Coordinates
  x: START_X,
  y: START_Y,
  dir: DIR_N,

  // Party & Inventory
  party: [],
  gold: 150,
  inventory: ["HEAL_POTION", "HEAL_POTION"],

  // Map & Light
  floor: 1,
  maps: [null, null],
  visitedMaps: [null, null],
  lightTurns: 0,

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
  state.party = createDefaultParty();
  state.gold = 150;
  state.inventory = ["HEAL_POTION", "HEAL_POTION"];
  
  state.floor = 1;
  const b1 = generateRandomMap(1);
  const b2 = generateRandomMap(2, b1.stairsDownCoord);
  state.maps = [b1.grid, b2.grid];
  state.visitedMaps = [
    Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false)),
    Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false))
  ];

  // Mark initial coordinate as visited
  state.visitedMap[state.y][state.x] = true;
  state.lightTurns = 0;
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
    state.party = data.party ?? createDefaultParty();
    // Spell list migration for existing save data
    state.party.forEach(char => {
      if (char.class === "Priest") {
        if (!char.spells.includes("DIURCO")) char.spells.push("DIURCO");
        if (!char.spells.includes("BADIOS")) char.spells.push("BADIOS");
      }
    });
    state.gold = data.gold ?? 150;
    state.inventory = data.inventory ?? [];
    
    state.floor = data.floor ?? 1;
    let loadedMaps = data.maps;

    // Check if maps contain any old "door" types to trigger migration
    let needsMigration = false;
    if (loadedMaps) {
      for (const map of loadedMaps) {
        if (map) {
          for (let y = 0; y < MAP_HEIGHT; y++) {
            for (let x = 0; x < MAP_WIDTH; x++) {
              if (map[y] && map[y][x] && map[y][x].type === "door") {
                needsMigration = true;
                break;
              }
            }
            if (needsMigration) break;
          }
        }
        if (needsMigration) break;
      }
    }

    if (!loadedMaps || needsMigration) {
      if (data.map && !needsMigration) {
        const b2 = generateRandomMap(2, { x: MAP_WIDTH - 2, y: 1 });
        loadedMaps = [data.map, b2.grid];
      } else {
        const b1 = generateRandomMap(1);
        const b2 = generateRandomMap(2, b1.stairsDownCoord);
        loadedMaps = [b1.grid, b2.grid];
        
        // Reset player coordinates to B1F start upon migration
        state.x = START_X;
        state.y = START_Y;
        state.floor = 1;
        state.dir = DIR_N;
        addLog("マップデータが新しいバージョンに更新され、スタート地点に戻されました。");
      }

      state.visitedMaps = [
        Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false)),
        Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false))
      ];
      state.visitedMap[state.y][state.x] = true;
    } else {
      state.visitedMaps = data.visitedMaps ?? [
        data.visitedMap ?? Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false)),
        Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false))
      ];
    }
    loadedMaps.forEach(map => {
      if (map) removeIsolatedInternalWalls(map);
    });
    state.maps = loadedMaps;
    state.lightTurns = data.lightTurns ?? 0;
    state.gameState = data.gameState ?? "town";
    state.combatState = data.combatState ?? null;
    state.chestState = data.chestState ?? null;
    state.transitioning = false;
    state.logs = data.logs ?? ["冒険を再開しました。"];
    
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
      gold: state.gold,
      inventory: state.inventory,
      floor: state.floor,
      maps: state.maps,
      visitedMaps: state.visitedMaps,
      lightTurns: state.lightTurns,
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
      gold: state.gold,
      inventory: state.inventory,
      floor: state.floor,
      maps: state.maps,
      visitedMaps: state.visitedMaps,
      lightTurns: state.lightTurns,
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
  if (!wpId) return 0;
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

  const req = EXP_LEVELS[nextLvl];
  if (char.exp >= req) {
    char.level = nextLvl;
    
    // Gain HP
    let hpGain = 0;
    if (char.class === "Fighter") hpGain = Math.floor(Math.random() * 8) + 8; // 8-15
    else if (char.class === "Thief") hpGain = Math.floor(Math.random() * 5) + 6; // 6-10
    else if (char.class === "Priest") hpGain = Math.floor(Math.random() * 5) + 5; // 5-9
    else if (char.class === "Mage") hpGain = Math.floor(Math.random() * 4) + 4; // 4-7
    
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
    }

    // Gain Stats
    if (Math.random() < 0.6) char.str += 1;
    if (Math.random() < 0.6) char.vit += 1;
    if (Math.random() < 0.6) char.agi += 1;
    if (Math.random() < 0.6) char.luk += 1;
    if (char.class === "Mage" && Math.random() < 0.8) char.int += 1;
    if (char.class === "Priest" && Math.random() < 0.8) char.pie += 1;

    // Learn spells
    if (char.class === "Priest") {
      if (char.level === 2 && !char.spells.includes("MADIOS")) {
        char.spells.push("MADIOS");
        char.spells.push("DIALKO");
        char.spells.push("LATUMOFIS");
      }
      if (char.level === 3 && !char.spells.includes("LOMILWA")) {
        char.spells.push("LOMILWA");
      }
    } else if (char.class === "Mage") {
      if (char.level === 2 && !char.spells.includes("LAHALITO")) {
        char.spells.push("LAHALITO");
      }
      if (char.level === 3 && !char.spells.includes("TILTOWAIT")) {
        char.spells.push("TILTOWAIT");
        char.spells.push("KATINO");
      }
    }

    return true;
  }
  return false;
}
