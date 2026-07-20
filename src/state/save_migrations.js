import { START_X, START_Y, DIR_N, MAP_WIDTH, MAP_HEIGHT } from "../data.js";
import { generateRandomMap, removeIsolatedInternalWalls } from "../map_generator.js";
import { generateRandomSeed, createDefaultCodex } from "./initial_state.js";
import { getIdentificationGambleProfile } from "../rules/identification_rules.js";
import { normalizeRecords } from "./records_state.js";
import { findMapCellByType } from "./warden_gates.js";

export function migrateCharSpells(char) {
  if (!char.spells) char.spells = [];
  if (char.class === "Priest") {
    if (!char.spells.includes("DIURCO")) char.spells.push("DIURCO");
    if (!char.spells.includes("BADIOS")) char.spells.push("BADIOS");
    if (char.level < 8 && char.spells.includes("DIALMA")) {
      char.spells = char.spells.filter(s => s !== "DIALMA");
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
    if (char.level < 8 && char.spells.includes("TILTOWAIT")) {
      char.spells = char.spells.filter(s => s !== "TILTOWAIT");
    }
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
    if (char.level < 7 && char.spells.includes("DIALMA")) {
      char.spells = char.spells.filter(s => s !== "DIALMA");
    }
    if (char.level < 7 && char.spells.includes("MADALTO")) {
      char.spells = char.spells.filter(s => s !== "MADALTO");
    }
  }
}

// 現行セーブスキーマのバージョン。破壊的shape変更を入れる際にインクリメントし、
// MIGRATIONSへ「前バージョン→このバージョン」の変換stepを追加する。
export const SAVE_VERSION = 12;

// 段階migrationレジストリ。key = 到達バージョン、value = (data) => data の変換関数。
// 各stepは「1つ前のバージョンのshape」を受け取り「そのバージョンのshape」を返す純変換。
// 例: 2: (d) => { d.materials = Object.fromEntries(...); return d; }
function normalizeCharEquipment(char) {
  if (!char) return;
  char.equipment = {
    weapon: char.equipment?.weapon ?? null,
    shield: char.equipment?.shield ?? null,
    armor: char.equipment?.armor ?? null,
    accessory: char.equipment?.accessory ?? null
  };
}

function backfillItemAffixes(item) {
  if (!item || typeof item !== "object" || !Array.isArray(item.affixes)) return;
  item.cursePower ??= getIdentificationGambleProfile(item.level || 1).cursePower;
  item.affixes.forEach(affix => {
    if (!affix || typeof affix !== "object") return;
    affix.id ||= affix.type;
    affix.kind ||= affix.id?.startsWith("CORE_") ? "core" : "support";
  });
}

function backfillAffixMetadata(data) {
  [data.inventory, data.storage, data.activeMerchantStock].forEach(collection => {
    collection?.forEach(backfillItemAffixes);
  });
  [data.party].forEach(characters => {
    characters?.forEach(char => {
      Object.values(char?.equipment || {}).forEach(backfillItemAffixes);
    });
  });
  return data;
}

function backfillRunAffixState(data) {
  [data.party].forEach(characters => {
    characters?.forEach(char => {
      char.runTrapAttackBonus = Number.isFinite(char.runTrapAttackBonus)
        ? char.runTrapAttackBonus
        : 0;
    });
  });
  return data;
}

function backfillMapBlockEnter(data) {
  data.maps?.forEach(map => {
    map?.forEach(row => {
      row?.forEach(cell => {
        if (!cell) return;
        if (!Array.isArray(cell.blockEnter) || cell.blockEnter.length !== 4) {
          cell.blockEnter = [false, false, false, false];
        }
      });
    });
  });
  return data;
}

function backfillMapSecretDoors(data) {
  data.maps?.forEach(map => {
    map?.forEach(row => {
      row?.forEach(cell => {
        if (!cell) return;
        if (!Array.isArray(cell.secretDoor) || cell.secretDoor.length !== 4) {
          cell.secretDoor = [false, false, false, false];
        }
        if (!Array.isArray(cell.secretFound) || cell.secretFound.length !== 4) {
          cell.secretFound = [false, false, false, false];
        }
      });
    });
  });
  return data;
}

function backfillMapSealedGates(data) {
  data.maps?.forEach(map => {
    map?.forEach(row => {
      row?.forEach(cell => {
        if (!cell) return;
        if (!Array.isArray(cell.sealedGate) || cell.sealedGate.length !== 4) {
          cell.sealedGate = [null, null, null, null];
        }
      });
    });
  });
  return data;
}

export function migrateSavePayload(data) {
  const from = typeof data.version === "number" ? data.version : 0;
  if (from !== SAVE_VERSION) {
    const error = new Error(`Save version ${from} is incompatible with solo save version ${SAVE_VERSION}.`);
    error.name = "IncompatibleSaveVersionError";
    throw error;
  }
  const normalized = normalizeSavePayload(data);
  normalized.version = SAVE_VERSION;
  return normalized;
}

// version非依存のデフォルト補完・派生データ整形。冪等。毎ロード安全に実行できる。
export function normalizeSavePayload(data) {
  const normalized = { ...data };

  normalized.floor = data.floor ?? 1;
  const defaultStart = findMapCellByType(data.maps?.[normalized.floor - 1], "stairs-up") ||
    { x: START_X, y: START_Y };
  normalized.x = data.x ?? defaultStart.x;
  normalized.y = data.y ?? defaultStart.y;
  normalized.dir = data.dir ?? DIR_N;
  normalized.prevX = data.prevX ?? defaultStart.x;
  normalized.prevY = data.prevY ?? defaultStart.y;
  normalized.party = Array.isArray(data.party) ? data.party.slice(0, 1) : [];
  normalized.inventory = data.inventory ?? [];
  normalized.seed = data.seed ?? generateRandomSeed();
  normalized.lightTurns = data.lightTurns ?? 0;
  normalized.lightPower = data.lightPower ?? "";
  normalized.repelTurns = data.repelTurns ?? 0;
  normalized.dumapicTurns = data.dumapicTurns ?? 0;
  normalized.dumapicHint = data.dumapicHint ?? "";
  normalized.activeMerchantStock = data.activeMerchantStock ?? [];
  normalized.gameState = data.gameState ?? "town";
  normalized.combatState = data.combatState ?? null;
  normalized.chestState = data.chestState ?? null;
  normalized.logs = data.logs ?? ["冒険を再開しました。"];
  normalized.floorChestsOpened = data.floorChestsOpened ?? [0, 0, 0, 0, 0];
  normalized.firstKills = data.firstKills ?? [];
  normalized.firstKills = normalized.firstKills.filter(name => !/の分裂体\d+/.test(name));
  normalized.currentRun = data.currentRun ?? null;
  if (normalized.currentRun) {
    delete normalized.currentRun.seenOmenFloors;
    delete normalized.currentRun.matchedOmenFloors;
    normalized.currentRun.quests ??= [];
    normalized.currentRun.defeatsByRole ??= {};
    normalized.currentRun.codexRewards ??= {};
    normalized.currentRun.recordResult ??= null;
  }
  normalized.records = normalizeRecords(data.records);
  normalized.unlockedMilestones = Array.from(new Set(data.unlockedMilestones ?? []))
    .filter(floor => Number.isInteger(floor) && floor > 0 && floor % 5 === 0)
    .sort((a, b) => a - b);
  normalized.runHistory = data.runHistory ?? [];
  normalized.deathLogs = data.deathLogs ?? [];
  normalized.codex = data.codex ?? createDefaultCodex();
  if (normalized.codex?.monsters) {
    Object.keys(normalized.codex.monsters).forEach(name => {
      if (/の分裂体\d+/.test(name)) delete normalized.codex.monsters[name];
    });
  }
  if (normalized.codex && normalized.codex.events) {
    delete normalized.codex.events.omens;
  }
  normalized.roamingMonsters = data.roamingMonsters ?? [];
  normalized.firstChestUnidentifiedGuaranteed = data.firstChestUnidentifiedGuaranteed ?? false;
  normalized.roamingMovementStepCount = data.roamingMovementStepCount ?? 0;
  normalized.noiseEvents = data.noiseEvents ?? [];
  normalized.openedGates = data.openedGates ?? [];
  normalized.storage = data.storage ?? [];
  normalized.storageMax = data.storageMax ?? 30;
  normalized.identifyTickets = data.identifyTickets ?? 0;
  normalized.cleared = data.cleared ?? false;
  normalized.metaMaterials = data.metaMaterials ?? {};
  normalized.workshop = data.workshop ?? { ranks: {} };
  normalized.dungeonMemory = data.dungeonMemory ?? { traps: {}, mapFragments: {} };
  normalized.dungeonMemory.traps ||= {};
  normalized.dungeonMemory.mapFragments ||= {};
  normalized.dungeonMemory.visitedFloors ||= Array.from(
    { length: Math.max(1, data.codex?.stats?.deepestFloor || data.floor || 1) },
    (_, index) => index + 1
  );

  normalized.party.forEach(normalizeCharEquipment);
  backfillAffixMetadata(normalized);
  normalized.party.forEach(migrateCharSpells);
  backfillRunAffixState(normalized);

  let loadedMaps = data.maps;
  let needsMigration = false;
  const generatedRunMaps = Boolean(normalized.currentRun?.runSeed);
  if (generatedRunMaps) {
    needsMigration = !loadedMaps?.some(Boolean);
  } else if (!loadedMaps || loadedMaps.length < 5) {
    needsMigration = true;
  } else {
    const firstMap = loadedMaps[0];
    if (!firstMap || firstMap.length !== MAP_HEIGHT || (firstMap[0] && firstMap[0].length !== MAP_WIDTH)) {
      needsMigration = true;
    }
  }

  if (needsMigration) {
    const b1 = generateRandomMap(1, null, normalized.seed);
    const b2 = generateRandomMap(2, b1.stairsDownCoord, normalized.seed);
    const b3 = generateRandomMap(3, b2.stairsDownCoord, normalized.seed);
    const b4 = generateRandomMap(4, b3.stairsDownCoord, normalized.seed);
    const b5 = generateRandomMap(5, b4.stairsDownCoord, normalized.seed);
    loadedMaps = [b1.grid, b2.grid, b3.grid, b4.grid, b5.grid];

    const migratedStart = findMapCellByType(b1.grid, "stairs-up") || { x: START_X, y: START_Y };
    normalized.x = migratedStart.x;
    normalized.y = migratedStart.y;
    normalized.floor = 1;
    normalized.dir = DIR_N;

    normalized.logs = [...normalized.logs, "マップデータが新しいバージョンに更新され、スタート地点に戻されました。"];

    normalized.visitedMaps = [
      Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false)),
      Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false)),
      Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false)),
      Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false)),
      Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false))
    ];
    normalized.visitedMaps[0][migratedStart.y][migratedStart.x] = true;
  } else {
    normalized.visitedMaps = data.visitedMaps ?? loadedMaps.map(map =>
      map ? map.map(row => row.map(() => false)) : null
    );
  }

  loadedMaps.forEach(map => {
    backfillMapBlockEnter({ maps: [map] });
    backfillMapSecretDoors({ maps: [map] });
    backfillMapSealedGates({ maps: [map] });
    if (map) removeIsolatedInternalWalls(map);
  });
  normalized.maps = loadedMaps;

  normalized.floorChestsTotal = data.floorChestsTotal ?? normalized.maps.map(grid => {
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

  return normalized;
}
