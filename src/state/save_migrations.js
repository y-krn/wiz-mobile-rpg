import { START_X, START_Y, DIR_N, MAP_WIDTH, MAP_HEIGHT } from "../data.js";
import { generateRandomMap, removeIsolatedInternalWalls } from "../map_generator.js";
import { generateRandomSeed, createDefaultRoster, createDefaultCodex } from "./initial_state.js";

export function migrateCharSpells(char) {
  if (!char.spells) char.spells = [];
  if (char.class === "Priest") {
    if (!char.spells.includes("DIURCO")) char.spells.push("DIURCO");
    if (!char.spells.includes("BADIOS")) char.spells.push("BADIOS");
    if (char.level < 8 && char.spells.includes("DIALMA")) {
      char.spells = char.spells.filter(s => s !== "DIALMA");
    }
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
}

// 現行セーブスキーマのバージョン。破壊的shape変更を入れる際にインクリメントし、
// MIGRATIONSへ「前バージョン→このバージョン」の変換stepを追加する。
export const SAVE_VERSION = 8;

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
  [data.party, data.roster, data.remains].forEach(characters => {
    characters?.forEach(char => {
      Object.values(char?.equipment || {}).forEach(backfillItemAffixes);
    });
  });
  return data;
}

function backfillRunAffixState(data) {
  [data.party, data.roster, data.remains].forEach(characters => {
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

const MIGRATIONS = {
  2: (data) => {
    data.party?.forEach(normalizeCharEquipment);
    data.roster?.forEach(normalizeCharEquipment);
    data.remains?.forEach(normalizeCharEquipment);
    return data;
  },
  3: (data) => {
    if (data.currentRun) {
      delete data.currentRun.seenOmenFloors;
      delete data.currentRun.matchedOmenFloors;
    }
    if (data.codex?.events) {
      delete data.codex.events.omens;
    }
    return data;
  },
  4: (data) => {
    return backfillMapBlockEnter(data);
  },
  5: (data) => {
    return backfillMapSecretDoors(data);
  },
  6: (data) => {
    data.openedGates = data.openedGates ?? [];
    return backfillMapSealedGates(data);
  },
  7: (data) => {
    return backfillAffixMetadata(data);
  },
  8: (data) => {
    return backfillRunAffixState(data);
  }
};

// version番号に基づく段階migration。旧shapeを現行shapeへ引き上げてから
// normalizeSavePayloadでデフォルト補完する。
export function migrateSavePayload(data) {
  const from = typeof data.version === "number" ? data.version : 0;

  // 未来セーブ(新版で保存→旧版コードで読込)は変換不能。normalizeは通すが警告を残す。
  if (from > SAVE_VERSION) {
    console.warn(`Save version ${from} is newer than supported ${SAVE_VERSION}. Loading best-effort.`);
  }

  let migrated = data;
  for (let v = from + 1; v <= SAVE_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (step) migrated = step(migrated);
  }

  const normalized = normalizeSavePayload(migrated);
  normalized.version = SAVE_VERSION;
  return normalized;
}

// version非依存のデフォルト補完・派生データ整形。冪等。毎ロード安全に実行できる。
export function normalizeSavePayload(data) {
  const normalized = { ...data };

  normalized.x = data.x ?? START_X;
  normalized.y = data.y ?? START_Y;
  normalized.dir = data.dir ?? DIR_N;
  normalized.prevX = data.prevX ?? START_X;
  normalized.prevY = data.prevY ?? START_Y;
  normalized.party = data.party ?? [];
  normalized.gold = data.gold ?? 150;
  normalized.inventory = data.inventory ?? [];
  normalized.seed = data.seed ?? generateRandomSeed();
  normalized.floor = data.floor ?? 1;
  normalized.lightTurns = data.lightTurns ?? 0;
  normalized.lightPower = data.lightPower ?? "";
  normalized.repelTurns = data.repelTurns ?? 0;
  normalized.dumapicTurns = data.dumapicTurns ?? 0;
  normalized.dumapicHint = data.dumapicHint ?? "";
  normalized.eventCooldownTurns = data.eventCooldownTurns ?? 0;
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
  }
  normalized.runHistory = data.runHistory ?? [];
  normalized.deathLogs = data.deathLogs ?? [];
  normalized.remains = data.remains ?? [];
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
  normalized.contracts = (data.contracts ?? []).filter(contract =>
    !(contract.type === "kill" && contract.targetMonsterName === "フラック")
  );
  normalized.activeContract = data.activeContract?.type === "kill" && data.activeContract.targetMonsterName === "フラック"
    ? null
    : (data.activeContract ?? null);
  normalized.completedContracts = data.completedContracts ?? [];
  normalized.storage = data.storage ?? [];
  normalized.storageMax = data.storageMax ?? 30;
  normalized.identifyTickets = data.identifyTickets ?? 0;
  normalized.cleared = data.cleared ?? false;
  normalized.materials = data.materials ?? {};
  normalized.dungeonMemory = data.dungeonMemory ?? { traps: {}, mapFragments: {} };
  normalized.dungeonMemory.traps ||= {};
  normalized.dungeonMemory.mapFragments ||= {};
  normalized.dungeonMemory.visitedFloors ||= Array.from(
    { length: Math.max(1, data.codex?.stats?.deepestFloor || data.floor || 1) },
    (_, index) => index + 1
  );

  if (!data.roster) {
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
    normalized.roster = roster;
  } else {
    normalized.roster = data.roster;
  }

  normalized.party.forEach(normalizeCharEquipment);
  normalized.roster.forEach(normalizeCharEquipment);
  normalized.remains.forEach(normalizeCharEquipment);
  backfillAffixMetadata(normalized);
  normalized.party.forEach(migrateCharSpells);
  normalized.roster.forEach(migrateCharSpells);
  backfillRunAffixState(normalized);

  let loadedMaps = data.maps;
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
    const b1 = generateRandomMap(1, null, normalized.seed);
    const b2 = generateRandomMap(2, b1.stairsDownCoord, normalized.seed);
    const b3 = generateRandomMap(3, b2.stairsDownCoord, normalized.seed);
    const b4 = generateRandomMap(4, b3.stairsDownCoord, normalized.seed);
    const b5 = generateRandomMap(5, b4.stairsDownCoord, normalized.seed);
    loadedMaps = [b1.grid, b2.grid, b3.grid, b4.grid, b5.grid];

    normalized.x = START_X;
    normalized.y = START_Y;
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
    normalized.visitedMaps[0][START_Y][START_X] = true;
  } else {
    normalized.visitedMaps = data.visitedMaps ?? [
      Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false)),
      Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false)),
      Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false)),
      Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false)),
      Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false))
    ];
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
