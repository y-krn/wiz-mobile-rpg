import { START_X, START_Y, DIR_N, MAP_WIDTH, MAP_HEIGHT } from "../data.js";
import { generateRandomMap, removeIsolatedInternalWalls } from "../map_generator.js";
import { generateRandomSeed, createDefaultCodex, createDefaultCurrentRun } from "./initial_state.js";
import { getIdentificationGambleProfile } from "../rules/identification_rules.js";
import { normalizeRecords } from "./records_state.js";
import { findMapCellByType } from "../rules/map_queries.js";
import { RETIRED_WORKSHOP_NODES } from "../data/workshop.js";
import { addMaterials } from "../rules/material_rules.js";
import { normalizeStatusEffectTarget } from "../combat_logic/status_effects.js";
import { isUsableFloorMap } from "./run_floor_state.js";

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
export const SAVE_VERSION = 13;

// Save/apply boundary contract. Unknown keys are deliberately ignored. Keep
// this list in sync with createSavePayload; runtime-only state must not become
// persistent merely because it was added to state.
export const SAVE_PAYLOAD_FIELDS = Object.freeze([
  "version", "x", "y", "dir", "party", "inventory", "floor", "maps",
  "visitedMaps", "lightTurns", "lightPower", "repelTurns", "dumapicTurns",
  "dumapicHint", "activeMerchantStock", "floorChestsOpened", "floorChestsTotal",
  "firstKills", "currentRun", "records", "unlockedMilestones", "runHistory",
  "deathLogs", "codex", "seed", "gameState", "combatState", "chestState",
  "prevX", "prevY", "roamingMonsters", "roamingMovementStepCount", "noiseEvents",
  "firstChestUnidentifiedGuaranteed", "storage", "storageMax", "identifyTickets",
  "cleared", "metaMaterials", "workshop", "keyItems", "dungeonMemory", "logs"
]);

export const TRANSIENT_STATE_FIELDS = Object.freeze([
  "menuContext", "menuHistory", "equipState", "transitioning", "controlsGuardUntil",
  "mapRevision", "sessionMaxFloor"
]);

const PERSISTED_GAME_STATES = new Set(["town", "explore", "combat", "result", "gameover", "victory"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function arrayOr(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}

function recordOr(value, fallback) {
  return isRecord(value) ? value : fallback;
}

function integerOr(value, fallback) {
  return Number.isInteger(value) ? value : fallback;
}

function numberOr(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function createDefaultVisitedMaps(maps) {
  return maps.map(map => Array.isArray(map)
    ? map.map(row => Array.isArray(row) ? row.map(() => false) : [])
    : null
  );
}

function isUsableVisitedMaps(visitedMaps, maps) {
  return Array.isArray(visitedMaps) && visitedMaps.length === maps.length &&
    visitedMaps.every((visitedMap, mapIndex) => {
      const map = maps[mapIndex];
      if (!map) return visitedMap === null;
      return Array.isArray(visitedMap) && visitedMap.length === map.length &&
        visitedMap.every((row, rowIndex) => {
          const mapRow = map[rowIndex];
          return Array.isArray(row) && Array.isArray(mapRow) &&
            row.length === mapRow.length && row.every(cell => typeof cell === "boolean");
        });
    });
}

function isUsableCombatState(combatState) {
  return isRecord(combatState) && Array.isArray(combatState.monsters) &&
    combatState.monsters.length > 0 && combatState.monsters.every(isRecord);
}

function normalizePersistedGameState(gameState, currentRun, combatState) {
  if (gameState === "combat") {
    if (isUsableCombatState(combatState)) return "combat";
    return currentRun?.runSeed && !currentRun.returnReason ? "explore" : "town";
  }
  if (PERSISTED_GAME_STATES.has(gameState)) return gameState;
  if (["equip_overlay", "chest", "trap_encounter"].includes(gameState)) return "explore";
  if (gameState === "submenu") return currentRun?.runSeed ? "explore" : "town";
  if (currentRun?.runSeed && !currentRun.returnReason) return "explore";
  return "town";
}

// 段階migrationレジストリ。key = 到達バージョン、value = (data) => data の変換関数。
// 各stepは「1つ前のバージョンのshape」を受け取り「そのバージョンのshape」を返す純変換。
// 例: 2: (d) => { d.materials = Object.fromEntries(...); return d; }
function normalizeCharEquipment(char) {
  if (!char) return;
  if (!Array.isArray(char.spells)) char.spells = [];
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

function discardTransientRunAffixState(data) {
  [data.party].forEach(characters => {
    characters?.forEach(char => {
      delete char.runTrapAttackBonus;
    });
  });
  return data;
}

const RUN_OUTCOMES = new Set(["retreat", "death", "abandon"]);

function inferRunOutcome(returnReason) {
  if (returnReason === "gameover") return "death";
  if (returnReason === "abandon") return "abandon";
  return returnReason ? "retreat" : "";
}

function normalizeRunOutcome(run) {
  if (!run || typeof run !== "object") return run;
  return {
    ...run,
    outcome: RUN_OUTCOMES.has(run.outcome) ? run.outcome : inferRunOutcome(run.returnReason)
  };
}

function normalizeRunHistoryEntry(entry) {
  if (!isRecord(entry)) return null;
  const normalized = normalizeRunOutcome(entry);
  if (Object.hasOwn(normalized, "bankedMaterials") && !isRecord(normalized.bankedMaterials)) {
    normalized.bankedMaterials = {};
  }
  return normalized;
}

function normalizeDeathLogEntry(entry) {
  if (!isRecord(entry)) return null;
  const normalized = { ...entry };
  if (Object.hasOwn(normalized, "lostItems") && !Array.isArray(normalized.lostItems)) {
    normalized.lostItems = [];
  }
  if (Object.hasOwn(normalized, "character") && normalized.character !== null && !isRecord(normalized.character)) {
    normalized.character = null;
  }
  return normalized;
}

function normalizeCurrentRun(run) {
  if (!isRecord(run)) return null;
  const normalized = normalizeRunOutcome(run);
  const defaults = createDefaultCurrentRun();

  Object.entries(defaults).forEach(([key, defaultValue]) => {
    if (Array.isArray(defaultValue)) {
      normalized[key] = arrayOr(normalized[key]);
    } else if (isRecord(defaultValue)) {
      normalized[key] = recordOr(normalized[key], { ...defaultValue });
    } else if (typeof defaultValue === "number") {
      normalized[key] = numberOr(normalized[key], defaultValue);
    } else if (typeof defaultValue === "string") {
      normalized[key] = typeof normalized[key] === "string" ? normalized[key] : defaultValue;
    } else {
      normalized[key] = normalized[key] ?? defaultValue;
    }
  });

  normalized.quests = normalized.quests.filter(isRecord);
  normalized.deathLogs = normalized.deathLogs
    .map(normalizeDeathLogEntry)
    .filter(isRecord);
  return normalized;
}

function backfillMonsterCriticalEligibility(data) {
  const monsters = data.combatState?.monsters;
  if (!Array.isArray(monsters)) return data;

  let changed = false;
  const normalizedMonsters = monsters.map(monster => {
    if (!monster || typeof monster !== "object" || typeof monster.canReceiveCritical === "boolean") {
      return monster;
    }
    changed = true;
    return {
      ...monster,
      canReceiveCritical: monster.isBoss === true ? false : true
    };
  });

  if (changed) {
    data.combatState = { ...data.combatState, monsters: normalizedMonsters };
  }
  return data;
}

function normalizeStatusEffectState(data) {
  data.party?.forEach(normalizeStatusEffectTarget);
  data.combatState?.monsters?.forEach(normalizeStatusEffectTarget);
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

// 出発準備（反復購入）へ統合して撤去した買い切りノードの後始末。ランクを消し、
// 支払い済みの素材を銀行へ返す。ノード定義が消えても払った分は失わせない（#234）。
function refundRetiredWorkshopNodes(normalized) {
  const ranks = normalized.workshop?.ranks;
  if (!ranks) return;
  let refund = null;
  RETIRED_WORKSHOP_NODES.forEach(node => {
    const rank = Math.max(0, Math.floor(Number(ranks[node.id]) || 0));
    if (rank <= 0) {
      delete ranks[node.id];
      return;
    }
    for (let step = 0; step < rank; step++) {
      const cost = node.costs[Math.min(step, node.costs.length - 1)];
      refund = addMaterials(refund || normalized.metaMaterials, cost);
    }
    delete ranks[node.id];
  });
  if (refund) normalized.metaMaterials = refund;
}

export function migrateSavePayload(data) {
  if (!isRecord(data)) {
    const error = new Error("Save payload must be a plain object.");
    error.name = "MalformedSavePayloadError";
    throw error;
  }
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
  if (!isRecord(data)) {
    const error = new Error("Save payload must be a plain object.");
    error.name = "MalformedSavePayloadError";
    throw error;
  }
  try {
    data = structuredClone(data);
  } catch (error) {
    const malformed = new Error("Save payload contains unsupported values.", { cause: error });
    malformed.name = "MalformedSavePayloadError";
    throw malformed;
  }
  const normalized = Object.fromEntries(
    SAVE_PAYLOAD_FIELDS
      .filter(field => Object.hasOwn(data, field))
      .map(field => [field, data[field]])
  );

  normalized.floor = Math.max(1, integerOr(data.floor, 1));
  const currentRun = recordOr(data.currentRun, null);
  const activeRunMap = Boolean(currentRun?.runSeed && !currentRun.returnReason);
  const activeFloorMap = data.maps?.[normalized.floor - 1];
  const activeFloorMapUsable = !activeRunMap || isUsableFloorMap(activeFloorMap, normalized.floor);
  const defaultStart = (activeFloorMapUsable
    ? findMapCellByType(activeFloorMap, "stairs-up")
    : null) ||
    { x: START_X, y: START_Y };
  normalized.x = integerOr(data.x, defaultStart.x);
  normalized.y = integerOr(data.y, defaultStart.y);
  normalized.dir = integerOr(data.dir, DIR_N);
  normalized.prevX = integerOr(data.prevX, defaultStart.x);
  normalized.prevY = integerOr(data.prevY, defaultStart.y);
  normalized.party = arrayOr(data.party).filter(isRecord).slice(0, 1);
  normalized.inventory = arrayOr(data.inventory);
  normalized.seed = typeof data.seed === "string" && data.seed ? data.seed : generateRandomSeed();
  normalized.lightTurns = numberOr(data.lightTurns, 0);
  normalized.lightPower = typeof data.lightPower === "string" ? data.lightPower : "";
  normalized.repelTurns = numberOr(data.repelTurns, 0);
  normalized.dumapicTurns = numberOr(data.dumapicTurns, 0);
  normalized.dumapicHint = typeof data.dumapicHint === "string" ? data.dumapicHint : "";
  normalized.activeMerchantStock = arrayOr(data.activeMerchantStock);
  normalized.combatState = recordOr(data.combatState, null);
  if (normalized.combatState) {
    normalized.combatState = {
      ...normalized.combatState,
      monsters: arrayOr(normalized.combatState.monsters).filter(isRecord)
    };
    if (!isUsableCombatState(normalized.combatState)) normalized.combatState = null;
  }
  normalized.chestState = recordOr(data.chestState, null);
  normalized.gameState = normalizePersistedGameState(data.gameState, currentRun, normalized.combatState);
  normalized.logs = arrayOr(data.logs).filter(log => typeof log === "string");
  if (normalized.logs.length === 0) normalized.logs = ["冒険を再開しました。"];
  normalized.floorChestsOpened = arrayOr(data.floorChestsOpened, [0, 0, 0, 0, 0]);
  normalized.firstKills = arrayOr(data.firstKills).filter(name => typeof name === "string");
  normalized.firstKills = normalized.firstKills.filter(name => !/の分裂体\d+/.test(name));
  normalized.currentRun = currentRun;
  if (normalized.currentRun) {
    normalized.currentRun = normalizeCurrentRun(normalized.currentRun);
    delete normalized.currentRun.seenOmenFloors;
    delete normalized.currentRun.matchedOmenFloors;
  }
  normalized.records = normalizeRecords(recordOr(data.records, {}));
  normalized.unlockedMilestones = Array.from(new Set(arrayOr(data.unlockedMilestones)))
    .filter(floor => Number.isInteger(floor) && floor > 0 && floor % 5 === 0)
    .sort((a, b) => a - b);
  normalized.runHistory = Array.isArray(data.runHistory)
    ? data.runHistory.map(normalizeRunHistoryEntry).filter(isRecord)
    : [];
  normalized.deathLogs = arrayOr(data.deathLogs)
    .map(normalizeDeathLogEntry)
    .filter(isRecord);
  normalized.codex = recordOr(data.codex, createDefaultCodex());
  if (normalized.codex?.monsters) {
    Object.keys(normalized.codex.monsters).forEach(name => {
      if (/の分裂体\d+/.test(name)) delete normalized.codex.monsters[name];
    });
  }
  if (normalized.codex && normalized.codex.events) {
    delete normalized.codex.events.omens;
  }
  normalized.roamingMonsters = arrayOr(data.roamingMonsters);
  normalized.firstChestUnidentifiedGuaranteed = typeof data.firstChestUnidentifiedGuaranteed === "boolean"
    ? data.firstChestUnidentifiedGuaranteed
    : false;
  normalized.roamingMovementStepCount = numberOr(data.roamingMovementStepCount, 0);
  normalized.noiseEvents = arrayOr(data.noiseEvents);
  normalized.storage = arrayOr(data.storage);
  normalized.storageMax = numberOr(data.storageMax, 30);
  normalized.identifyTickets = numberOr(data.identifyTickets, 0);
  normalized.cleared = typeof data.cleared === "boolean" ? data.cleared : false;
  normalized.metaMaterials = recordOr(data.metaMaterials, {});
  normalized.workshop = recordOr(data.workshop, { ranks: {} });
  normalized.keyItems = arrayOr(data.keyItems);
  refundRetiredWorkshopNodes(normalized);
  normalized.dungeonMemory = {
    mapFragments: recordOr(data.dungeonMemory?.mapFragments, {}),
    visitedFloors: Array.isArray(data.dungeonMemory?.visitedFloors)
      ? data.dungeonMemory.visitedFloors
      : Array.from(
    { length: Math.max(1, data.codex?.stats?.deepestFloor || data.floor || 1) },
    (_, index) => index + 1
    )
  };

  normalized.party.forEach(normalizeCharEquipment);
  backfillAffixMetadata(normalized);
  normalized.party.forEach(migrateCharSpells);
  discardTransientRunAffixState(normalized);
  backfillMonsterCriticalEligibility(normalized);
  normalizeStatusEffectState(normalized);

  let loadedMaps = Array.isArray(data.maps) ? data.maps.slice() : [];
  let needsMigration = false;
  const generatedRunMaps = Boolean(normalized.currentRun?.runSeed);
  if (generatedRunMaps) {
    // Run maps are derived from currentRun.runSeed. Preserve an all-missing
    // run map so active-run recovery can fail closed instead of silently
    // replacing progress with legacy state.seed maps.
    needsMigration = false;
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
    normalized.visitedMaps = activeRunMap
      ? data.visitedMaps
      : isUsableVisitedMaps(data.visitedMaps, loadedMaps)
        ? data.visitedMaps
        : createDefaultVisitedMaps(loadedMaps);
  }

  loadedMaps.forEach((map, index) => {
    // Active-run maps are player progress, not disposable legacy data. Do not
    // let repair helpers dereference malformed cells before recovery validates
    // the saved floor and preserves it for explicit recovery handling.
    if (activeRunMap && !isUsableFloorMap(map, index + 1)) return;
    backfillMapBlockEnter({ maps: [map] });
    backfillMapSecretDoors({ maps: [map] });
    if (map) removeIsolatedInternalWalls(map);
  });
  normalized.maps = loadedMaps;

  normalized.floorChestsTotal = Array.isArray(data.floorChestsTotal)
    ? data.floorChestsTotal
    : normalized.maps.map((grid, index) => {
      if (activeRunMap && !isUsableFloorMap(grid, index + 1)) return 0;
      let count = 0;
      if (grid) {
        for (let y = 0; y < grid.length; y++) {
          for (let x = 0; x < grid[y].length; x++) {
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
