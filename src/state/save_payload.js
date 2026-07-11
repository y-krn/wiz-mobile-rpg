import { state } from "./state_core.js";
import { SAVE_VERSION } from "./save_migrations.js";
import { menuContext } from "../navigation.js";

// 一時オーバーレイ状態は付随コンテキストが永続化されないため、そのまま保存すると
// 再開時に壊れる。基底画面へ畳んでから保存する。
//
// - "submenu": 親画面情報(menuContext)が未保存。gameState="submenu" のまま保存すると
//   再開時に menuContext が初期化され、街サブメニュー(お城/宿屋/寺院 等)にいても
//   renderer が街と判定できず、floor=1/START座標(=地下1F登り階段)のダンジョンを描画。
//   closeSubmenu と同じ規則で親画面へ畳む。
// - "trap_encounter": activeTrapState が未保存。gameState="trap_encounter" のまま保存すると
//   再開時に罠UIが表示されず、罠操作パネルだけ出て操作不能になる。罠は探索中のみ発生する
//   ため explore へ畳む(罠マス上で再開し、踏み直せば罠が再発生する)。
function resolvePersistedGameState() {
  if (state.gameState === "trap_encounter") return "explore";
  if (state.gameState !== "submenu") return state.gameState;
  if (menuContext.prevGameState) return menuContext.prevGameState;
  const t = menuContext.type || "";
  if (
    t.startsWith("shop") ||
    t.startsWith("temple") ||
    t.startsWith("castle") ||
    t.startsWith("party_assemble") ||
    t.startsWith("craft")
  ) {
    return "town";
  }
  if (t.startsWith("combat")) return "combat";
  return "explore";
}

export function createSavePayload() {
  return {
    version: SAVE_VERSION,
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
    currentRun: state.currentRun,
    runHistory: state.runHistory,
    deathLogs: state.deathLogs,
    remains: state.remains,
    codex: state.codex,
    seed: state.seed,
    gameState: resolvePersistedGameState(),
    combatState: state.combatState,
    chestState: state.chestState,
    prevX: state.prevX,
    prevY: state.prevY,
    roamingMonsters: state.roamingMonsters,
    roamingMovementStepCount: state.roamingMovementStepCount,
    noiseEvents: state.noiseEvents,
    openedGates: state.openedGates,
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
  state.sessionMaxFloor = data.floor;
  state.currentRun = data.currentRun;
  state.runHistory = data.runHistory;
  state.deathLogs = data.deathLogs;
  state.remains = data.remains ?? [];
  state.codex = data.codex;
  state.roamingMonsters = data.roamingMonsters;
  state.firstChestUnidentifiedGuaranteed = data.firstChestUnidentifiedGuaranteed;
  state.roamingMovementStepCount = data.roamingMovementStepCount;
  state.noiseEvents = data.noiseEvents ?? [];
  state.openedGates = data.openedGates;
  state.contracts = data.contracts;
  state.activeContract = data.activeContract;
  state.completedContracts = data.completedContracts;
  state.storage = data.storage;
  state.storageMax = data.storageMax;
  state.identifyTickets = data.identifyTickets;
  state.cleared = data.cleared;
  state.materials = data.materials;
  state.dungeonMemory = data.dungeonMemory || { traps: {}, mapFragments: {}, visitedFloors: [1] };
  state.dungeonMemory.visitedFloors ||= [1];
  
  // 統一された参照リンク
  linkPartyToRoster();
}

export function linkPartyToRoster() {
  if (state.party && state.roster) {
    state.party = state.party.map(partyChar => {
      const rosterChar = state.roster.find(c => c.name === partyChar.name);
      return rosterChar || partyChar;
    });
  }
}

// 戦闘計算 (round.js) は state.party を複製するため、戦闘後 party と roster の
// 参照リンクが切れる。party の最新状態 (HP・status・EXP 等) を roster へ書き戻し、
// 同一参照へ再リンクする。街帰還時に呼び出し、寺院が死亡者を正しく認識できるようにする。
export function syncPartyToRoster() {
  if (state.party && state.roster) {
    state.party = state.party.map(partyChar => {
      const idx = state.roster.findIndex(c => c.name === partyChar.name);
      if (idx !== -1) {
        state.roster[idx] = Object.assign(state.roster[idx], partyChar);
        return state.roster[idx];
      }
      return partyChar;
    });
  }
}
