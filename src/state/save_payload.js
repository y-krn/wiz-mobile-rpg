import { state } from "./state_core.js";

export function createSavePayload() {
  return {
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
    lightPower: state.lightPower,
    repelTurns: state.repelTurns,
    dumapicTurns: state.dumapicTurns,
    dumapicHint: state.dumapicHint,
    eventCooldownTurns: state.eventCooldownTurns,
    activeMerchantStock: state.activeMerchantStock,
    floorChestsOpened: state.floorChestsOpened,
    floorChestsTotal: state.floorChestsTotal,
    firstKills: state.firstKills,
    lastReturnedFloor: state.lastReturnedFloor,
    currentRun: state.currentRun,
    runHistory: state.runHistory,
    deathLogs: state.deathLogs,
    codex: state.codex,
    seed: state.seed,
    gameState: state.gameState,
    combatState: state.combatState,
    chestState: state.chestState,
    prevX: state.prevX,
    prevY: state.prevY,
    roamingMonsters: state.roamingMonsters,
    roamingMovementStepCount: state.roamingMovementStepCount,
    firstChestUnidentifiedGuaranteed: state.firstChestUnidentifiedGuaranteed,
    contracts: state.contracts,
    activeContract: state.activeContract,
    completedContracts: state.completedContracts,
    storage: state.storage,
    storageMax: state.storageMax,
    identifyTickets: state.identifyTickets,
    cleared: state.cleared,
    materials: state.materials,
    dungeonMemory: state.dungeonMemory,
    logs: state.logs.slice(-30)
  };
}

export function applySavePayload(data) {
  state.x = data.x;
  state.y = data.y;
  state.dir = data.dir;
  state.prevX = data.prevX;
  state.prevY = data.prevY;
  state.party = data.party;
  state.roster = data.roster;
  state.gold = data.gold;
  state.inventory = data.inventory;
  state.seed = data.seed;
  state.floor = data.floor;
  state.maps = data.maps;
  state.visitedMaps = data.visitedMaps;
  state.lightTurns = data.lightTurns;
  state.lightPower = data.lightPower;
  state.repelTurns = data.repelTurns;
  state.dumapicTurns = data.dumapicTurns;
  state.dumapicHint = data.dumapicHint;
  state.eventCooldownTurns = data.eventCooldownTurns;
  state.activeMerchantStock = data.activeMerchantStock;
  state.gameState = data.gameState;
  state.combatState = data.combatState;
  state.chestState = data.chestState;
  state.logs = data.logs;
  state.floorChestsOpened = data.floorChestsOpened;
  state.floorChestsTotal = data.floorChestsTotal;
  state.firstKills = data.firstKills;
  state.lastReturnedFloor = data.lastReturnedFloor;
  state.sessionMaxFloor = data.floor;
  state.currentRun = data.currentRun;
  state.runHistory = data.runHistory;
  state.deathLogs = data.deathLogs;
  state.codex = data.codex;
  state.roamingMonsters = data.roamingMonsters;
  state.firstChestUnidentifiedGuaranteed = data.firstChestUnidentifiedGuaranteed;
  state.roamingMovementStepCount = data.roamingMovementStepCount;
  state.contracts = data.contracts;
  state.activeContract = data.activeContract;
  state.completedContracts = data.completedContracts;
  state.storage = data.storage;
  state.storageMax = data.storageMax;
  state.identifyTickets = data.identifyTickets;
  state.cleared = data.cleared;
  state.materials = data.materials;
  state.dungeonMemory = data.dungeonMemory || { traps: {} };
}
