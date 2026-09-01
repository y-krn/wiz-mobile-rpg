import { START_X, START_Y, DIR_N, MAP_WIDTH, MAP_HEIGHT, getItemBaseId, isSpecialOrQuestItem } from "../data.js";
import { generateRandomMap, removeIsolatedInternalWalls } from "../map_generator.js";
import { generateRandomSeed, createDefaultCodex, createDefaultCurrentRun } from "./initial_state.js";
import { getIdentificationGambleProfile, getKnowledgeHintTags, getKnowledgeStage } from "../rules/identification_rules.js";
import { normalizeRecords } from "./records_state.js";
import { findMapCellByType } from "../rules/map_queries.js";
import { INVENTORY_CAPACITY } from "../rules/item_inventory.js";
import { RETIRED_WORKSHOP_NODES } from "../data/workshop.js";
import { addMaterials } from "../rules/material_rules.js";
import { normalizeStatusEffectTarget } from "../combat_logic/status_effects.js";
import { isUsableFloorCell, isUsableFloorMap } from "./run_floor_state.js";
import { isUsableCombatState } from "./view_state.js";

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
    if (char.level >= 5 && !char.spells.includes("VULNERA")) char.spells.push("VULNERA");
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
    if (char.level >= 6 && !char.spells.includes("VULNERA")) char.spells.push("VULNERA");
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
  "visitedMaps", "lightTurns", "lightPower", "repelTurns", "silenceTurns", "forcedEncounterSteps",
  "activeMerchantStock", "floorChestsOpened", "floorChestsTotal",
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

function normalizeInventory(inventory) {
  let regularItemCount = 0;
  return inventory.filter(item => {
    if (isSpecialOrQuestItem(getItemBaseId(item))) return true;
    if (regularItemCount >= INVENTORY_CAPACITY) return false;
    regularItemCount++;
    return true;
  });
}

function createDefaultVisitedMaps(maps) {
  return maps.map(map => Array.isArray(map)
    ? map.map(row => Array.isArray(row) ? row.map(() => false) : [])
    : null
  );
}

function isTraversableSaveCell(cell) {
  if (!isUsableFloorCell(cell)) return false;
  return cell.walls.some(wall => !wall) ||
    cell.secretDoor.some(Boolean) ||
    cell.type !== "empty" ||
    Boolean(cell.event) ||
    Boolean(cell.trap);
}

function isValidSaveCoordinate(map, x, y) {
  return Number.isInteger(x) && Number.isInteger(y) &&
    y >= 0 && y < map.length &&
    Array.isArray(map[y]) && x >= 0 && x < map[y].length &&
    isTraversableSaveCell(map[y][x]);
}

function findSafeSaveCoordinate(map) {
  if (!Array.isArray(map)) return null;

  for (let y = 0; y < map.length; y++) {
    const row = map[y];
    if (!Array.isArray(row)) continue;
    for (let x = 0; x < row.length; x++) {
      if (row[x]?.type === "stairs-up" && isTraversableSaveCell(row[x])) {
        return { x, y };
      }
    }
  }

  for (let y = 0; y < map.length; y++) {
    const row = map[y];
    if (!Array.isArray(row)) continue;
    for (let x = 0; x < row.length; x++) {
      if (isTraversableSaveCell(row[x])) return { x, y };
    }
  }

  return null;
}

function findLoadedFloorWithSafeCoordinate(maps, preferredFloor) {
  if (!Array.isArray(maps)) return -1;
  const preferredIndex = preferredFloor - 1;
  if (preferredIndex >= 0 && preferredIndex < maps.length &&
      findSafeSaveCoordinate(maps[preferredIndex])) {
    return preferredIndex;
  }
  return maps.findIndex(map => findSafeSaveCoordinate(map));
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
  if (!item || typeof item !== "object" || !item.baseId) return;
  item.knowledgeStage = getKnowledgeStage(item);
  item.observedHintTags = getKnowledgeHintTags(item);
  item.observationCount = Math.max(0, integerOr(item.observationCount, 0));
  item.trialCount = Math.max(0, integerOr(item.trialCount, 0));
  item.cursePower ??= getIdentificationGambleProfile(item.level || 1).cursePower;
  (Array.isArray(item.affixes) ? item.affixes : []).forEach(affix => {
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
  if ([
    "runNumber", "className", "kills", "chestsOpened", "goldEarned", "lootCount",
    "milestones", "recordUpdates", "deathCause"
  ].some(key => Object.hasOwn(entry, key))) {
    normalized.runNumber = Math.max(0, integerOr(entry.runNumber, 0));
    normalized.className = typeof entry.className === "string"
      ? entry.className
      : typeof entry.class === "string" ? entry.class : null;
    normalized.kills = Math.max(0, integerOr(entry.kills, 0));
    normalized.chestsOpened = Math.max(0, integerOr(entry.chestsOpened, 0));
    normalized.goldEarned = Math.max(0, integerOr(entry.goldEarned, 0));
    normalized.lootCount = Math.max(0, integerOr(entry.lootCount, 0));
    normalized.milestones = arrayOr(entry.milestones).filter(milestone => typeof milestone === "string");
    normalized.recordUpdates = arrayOr(entry.recordUpdates).filter(update => typeof update === "string");
    normalized.deathCause = entry.deathCause && isRecord(entry.deathCause)
      ? {
        floor: Math.max(1, integerOr(entry.deathCause.floor, 1)),
        type: typeof entry.deathCause.type === "string" ? entry.deathCause.type : "",
        source: typeof entry.deathCause.source === "string" ? entry.deathCause.source : "",
        label: typeof entry.deathCause.label === "string" ? entry.deathCause.label : ""
      }
      : null;
  }
  if (Object.hasOwn(normalized, "bankedMaterials") && !isRecord(normalized.bankedMaterials)) {
    normalized.bankedMaterials = {};
  }
  if (Object.hasOwn(normalized, "representativeItem")) {
    normalized.representativeItem = normalizeReturnItemRecord(normalized.representativeItem);
  }
  if (Object.hasOwn(normalized, "meaningfulItemHistory")) {
    normalized.meaningfulItemHistory = arrayOr(normalized.meaningfulItemHistory)
      .map(normalizeReturnItemRecord)
      .filter(isRecord)
      .slice(0, 5);
  }
  if (Object.hasOwn(normalized, "codexInsights")) {
    normalized.codexInsights = normalizeRunInsights(normalized.codexInsights);
  }
  if (Object.hasOwn(normalized, "workshopUnlocks")) {
    normalized.workshopUnlocks = arrayOr(normalized.workshopUnlocks)
      .filter(isRecord)
      .map(unlock => ({
        nodeId: typeof unlock.nodeId === "string" ? unlock.nodeId : "",
        name: typeof unlock.name === "string" ? unlock.name : "",
        description: typeof unlock.description === "string" ? unlock.description : ""
      }))
      .filter(unlock => unlock.nodeId);
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

const EQUIPMENT_RARITIES = new Set(["common", "magic", "rare", "epic", "legendary"]);

const RETURN_ITEM_TYPES = new Set(["weapon", "shield", "armor", "accessory", "usable", "item"]);

function normalizeReturnItemRecord(record) {
  if (!isRecord(record) || typeof record.baseId !== "string") return null;
  return {
    baseId: record.baseId,
    name: typeof record.name === "string" ? record.name : record.baseId,
    type: RETURN_ITEM_TYPES.has(record.type) ? record.type : "item",
    rarity: EQUIPMENT_RARITIES.has(record.rarity) ? record.rarity : "common",
    knowledgeStage: typeof record.knowledgeStage === "string" ? record.knowledgeStage : "unknown",
    status: ["returned", "rescued", "lost", "observed"].includes(record.status) ? record.status : "observed",
    wasEquipped: record.wasEquipped === true,
    depth: Math.max(1, integerOr(record.depth, 1))
  };
}

function normalizeRunInsights(insights) {
  return arrayOr(insights)
    .filter(isRecord)
    .map(insight => ({
      id: typeof insight.id === "string" ? insight.id : "",
      label: typeof insight.label === "string" ? insight.label : ""
    }))
    .filter(insight => insight.id)
    .slice(0, 20);
}

function normalizeCodexInsightRecord(record) {
  if (!isRecord(record) || typeof record.id !== "string") return null;
  return {
    id: record.id,
    count: Math.max(0, integerOr(record.count, 0)),
    firstFloor: Math.max(1, integerOr(record.firstFloor, 1)),
    lastFloor: Math.max(1, integerOr(record.lastFloor, 1))
  };
}

function normalizeEquipmentCodexRecord(record) {
  if (!isRecord(record)) return null;
  const normalized = { ...record };
  normalized.discovered = record.discovered !== false;
  normalized.foundCount = Math.max(0, integerOr(record.foundCount, 0));
  normalized.highestRarity = EQUIPMENT_RARITIES.has(record.highestRarity)
    ? record.highestRarity
    : "common";
  normalized.bestBonus = Math.max(0, numberOr(record.bestBonus, 0));
  normalized.affixesSeen = arrayOr(record.affixesSeen).filter(affix => typeof affix === "string");
  normalized.foundFloors = Object.fromEntries(
    Object.entries(recordOr(record.foundFloors, {}))
      .filter(([floor, count]) => /^\d+$/.test(floor) && Number(floor) > 0 && Number.isFinite(count) && count > 0)
      .map(([floor, count]) => [floor, Math.floor(count)])
  );
  normalized.tagObservations = Object.fromEntries(
    Object.entries(recordOr(record.tagObservations, {}))
      .filter(([tag, count]) => typeof tag === "string" && Number.isFinite(count) && count > 0)
      .map(([tag, count]) => [tag, Math.floor(count)])
  );
  normalized.firstFoundAt = typeof record.firstFoundAt === "string" ? record.firstFoundAt : "";
  normalized.lastFoundSeed = typeof record.lastFoundSeed === "string" ? record.lastFoundSeed : "";
  return normalized;
}

function normalizeMonsterCodexRecord(record) {
  if (!isRecord(record)) return null;
  const normalized = { ...record };
  normalized.encountered = Math.max(0, integerOr(record.encountered, 0));
  normalized.killed = Math.max(0, integerOr(record.killed, 0));
  normalized.firstKilled = record.firstKilled === true;
  if (Object.hasOwn(record, "magicResistKnown")) {
    normalized.magicResistKnown = record.magicResistKnown === true;
  }
  if (Object.hasOwn(record, "physResistKnown")) {
    normalized.physResistKnown = record.physResistKnown === true;
  }
  if (Object.hasOwn(record, "observedActions")) {
    normalized.observedActions = arrayOr(record.observedActions).filter(action => typeof action === "string");
  }
  if (Object.hasOwn(record, "observedConditions")) {
    normalized.observedConditions = arrayOr(record.observedConditions).filter(condition => typeof condition === "string");
  }
  if (Object.hasOwn(record, "observedLoot")) {
    normalized.observedLoot = arrayOr(record.observedLoot).filter(loot => typeof loot === "string");
  }
  if (Object.hasOwn(record, "encounterFloors")) {
    normalized.encounterFloors = Object.fromEntries(
      Object.entries(recordOr(record.encounterFloors, {}))
        .filter(([floor, count]) => /^\d+$/.test(floor) && Number(floor) > 0 && Number.isFinite(count) && count > 0)
        .map(([floor, count]) => [floor, Math.floor(count)])
    );
  }
  if (Object.hasOwn(record, "firstEncounterFloor")) {
    normalized.firstEncounterFloor = Math.max(0, integerOr(record.firstEncounterFloor, 0));
  }
  if (Object.hasOwn(record, "lastEncounterFloor")) {
    normalized.lastEncounterFloor = Math.max(0, integerOr(record.lastEncounterFloor, 0));
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
  normalized.townInventory = normalized.townInventory.filter(item => item != null);
  normalized.unbankedObjectLoot = normalized.unbankedObjectLoot
    .filter(entry => isRecord(entry) && typeof entry.id === "string" && entry.item != null);
  normalized.bankedObjectLoot = normalized.bankedObjectLoot.filter(item => item != null);
  normalized.lostObjectLoot = normalized.lostObjectLoot.filter(item => item != null);
  normalized.returnedTownItems = normalized.returnedTownItems.filter(item => item != null);
  normalized.representativeItem = normalizeReturnItemRecord(normalized.representativeItem);
  normalized.meaningfulItemHistory = normalized.meaningfulItemHistory
    .map(normalizeReturnItemRecord)
    .filter(isRecord)
    .slice(0, 5);
  normalized.codexInsights = normalizeRunInsights(normalized.codexInsights);
  normalized.workshopUnlocks = normalized.workshopUnlocks
    .filter(isRecord)
    .map(unlock => ({
      nodeId: typeof unlock.nodeId === "string" ? unlock.nodeId : "",
      name: typeof unlock.name === "string" ? unlock.name : "",
      description: typeof unlock.description === "string" ? unlock.description : ""
    }))
    .filter(unlock => unlock.nodeId);
  normalized.returnProcessing = isRecord(normalized.returnProcessing)
    ? {
      outcome: typeof normalized.returnProcessing.outcome === "string" ? normalized.returnProcessing.outcome : "",
      returnedObjectCount: Math.max(0, integerOr(normalized.returnProcessing.returnedObjectCount, 0)),
      lostObjectCount: Math.max(0, integerOr(normalized.returnProcessing.lostObjectCount, 0)),
      recoveredEquipmentCount: Math.max(0, integerOr(normalized.returnProcessing.recoveredEquipmentCount, 0))
    }
    : null;
  normalized.trialBands = Object.fromEntries(
    Object.entries(normalized.trialBands).filter(([bandIndex, trial]) =>
      Number.isInteger(Number(bandIndex)) && Number(bandIndex) >= 0 &&
      isRecord(trial) && typeof trial.mainId === "string" && typeof trial.subId === "string"
    )
  );
  normalized.lootSequence = Math.max(0, Math.floor(Number(normalized.lootSequence) || 0));
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
  normalized.inventory = normalizeInventory(arrayOr(data.inventory));
  normalized.seed = typeof data.seed === "string" && data.seed ? data.seed : generateRandomSeed();
  normalized.lightTurns = numberOr(data.lightTurns, 0);
  normalized.lightPower = typeof data.lightPower === "string" ? data.lightPower : "";
  normalized.repelTurns = numberOr(data.repelTurns, 0);
  normalized.silenceTurns = numberOr(data.silenceTurns, 0);
  normalized.forcedEncounterSteps = numberOr(data.forcedEncounterSteps, 0);
  normalized.activeMerchantStock = arrayOr(data.activeMerchantStock);
  const persistedCombatState = recordOr(data.combatState, null);
  normalized.combatState = isUsableCombatState(persistedCombatState)
    ? { ...persistedCombatState, monsters: persistedCombatState.monsters.slice() }
    : null;
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
    ? data.runHistory.map(normalizeRunHistoryEntry).filter(isRecord).slice(0, 20)
    : [];
  normalized.deathLogs = arrayOr(data.deathLogs)
    .map(normalizeDeathLogEntry)
    .filter(isRecord);
  normalized.codex = recordOr(data.codex, createDefaultCodex());
  normalized.codex.equipment = Object.fromEntries(
    Object.entries(recordOr(normalized.codex.equipment, {}))
      .map(([key, record]) => [key, normalizeEquipmentCodexRecord(record)])
      .filter(([, record]) => record !== null)
  );
  normalized.codex.monsters = Object.fromEntries(
    Object.entries(recordOr(normalized.codex.monsters, {}))
      .filter(([name]) => !/の分裂体\d+/.test(name))
      .map(([name, record]) => [name, normalizeMonsterCodexRecord(record)])
      .filter(([, record]) => record !== null)
  );
  normalized.codex.insights = Object.values(Object.fromEntries(
    arrayOr(normalized.codex.insights)
      .map(normalizeCodexInsightRecord)
      .filter(isRecord)
      .map(insight => [insight.id, insight])
  )).slice(0, 20);
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
  normalized.workshop.ranks = recordOr(normalized.workshop.ranks, {});
  normalized.workshop.lateralUnlocks = [...new Set(
    arrayOr(normalized.workshop.lateralUnlocks).filter(nodeId => typeof nodeId === "string")
  )];
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

  if (!activeRunMap) {
    // Legacy saves contain a finite map set. Keep floor within that set by
    // selecting the requested map when usable, otherwise the first usable
    // map, without assuming a particular map count.
    const loadedFloorIndex = findLoadedFloorWithSafeCoordinate(loadedMaps, normalized.floor);
    if (loadedFloorIndex >= 0) normalized.floor = loadedFloorIndex + 1;
  }

  const activeMap = loadedMaps[normalized.floor - 1];
  const canValidateCoordinates = activeRunMap
    ? isUsableFloorMap(activeMap, normalized.floor)
    : Array.isArray(activeMap);
  if (canValidateCoordinates) {
    const safeCoordinate = findSafeSaveCoordinate(activeMap);
    if (safeCoordinate) {
      if (!isValidSaveCoordinate(activeMap, normalized.x, normalized.y)) {
        normalized.x = safeCoordinate.x;
        normalized.y = safeCoordinate.y;
      }
      if (!isValidSaveCoordinate(activeMap, normalized.prevX, normalized.prevY)) {
        normalized.prevX = safeCoordinate.x;
        normalized.prevY = safeCoordinate.y;
      }
    }
  }

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
