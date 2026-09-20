const assert = (await import("assert")).default;
const { markMapChanged, markMapCellVisited, state } = await import("../../../src/state.js");
const { menuContext } = await import("../../../src/navigation.js");
const { getRendererInput } = await import("../../../src/state/renderer_view.js");
const { getVisibleCorridorTopology } = await import("../../../src/rules/renderer_topology.js");

function createCell() {
  return {
    walls: [true, true, true, true],
    blockEnter: [false, false, false, false],
    type: "empty",
    event: null,
    trap: null
  };
}

function renderContractSignature() {
  const input = getRendererInput(state, menuContext);
  const topology = getVisibleCorridorTopology(input.map, input.x, input.y, input.dir);
  return JSON.stringify({
    floor: input.floor,
    x: input.x,
    y: input.y,
    dir: input.dir,
    mapRevision: input.mapRevision,
    sceneVisibility: input.sceneVisibility,
    topology: topology.map(({ z, column, frontBlocked, leftBlocked, rightBlocked, backBlocked }) => ({
      z, column, frontBlocked, leftBlocked, rightBlocked, backBlocked
    })),
    combatMonsters: input.combatMonsters.map(monster => [monster.name, monster.hp, monster.maxHp]),
    mapFragments: input.mapFragments
  });
}

console.log("=== RENDERER-NEUTRAL IDLE CONTRACT VERIFICATION ===");

state.floor = 1;
state.x = 0;
state.y = 0;
state.dir = 0;
state.gameState = "explore";
state.maps = [[[createCell(), createCell()], [createCell(), createCell()]]];
state.visitedMaps = [[[true, false], [false, false]]];
state.dungeonMemory = { mapFragments: {}, visitedFloors: [1] };
state.roamingMonsters = [];
state.combatState = null;
state.chestState = null;
state.party = [{ name: "検証者", status: "ok" }];
state.lightTurns = 0;
state.lightPower = "";
state.mapRevision = 0;
menuContext.type = "";
menuContext.prevGameState = null;

const idleSignature = renderContractSignature();
assert.equal(idleSignature, renderContractSignature(), "静止状態の描画入力シグネチャは安定");

const visitedRevision = state.mapRevision;
markMapCellVisited(1, 0);
assert.notEqual(renderContractSignature(), idleSignature, "探索済みセル更新を検知");
assert.equal(state.mapRevision, visitedRevision + 1, "探索済みセル更新でmapRevision増加");

state.map[0][0].walls[0] = false;
markMapChanged();
const secretDoorSignature = renderContractSignature();
assert.notEqual(secretDoorSignature, idleSignature, "隠し扉開通を検知");

state.map[0][0].event = "chest";
markMapChanged();
const chestSignature = renderContractSignature();
state.map[0][0].event = null;
markMapChanged();
assert.notEqual(renderContractSignature(), chestSignature, "宝箱状態更新を検知");

state.dungeonMemory.mapFragments[1] = ["1,1"];
markMapChanged();
const fragmentSignature = renderContractSignature();
state.dungeonMemory.mapFragments[1].push("0,1");
markMapChanged();
assert.notEqual(renderContractSignature(), fragmentSignature, "マップ断片更新を検知");

state.combatState = { monsters: [{ name: "Biter", level: 1, hp: 10, maxHp: 10 }] };
state.gameState = "combat";
const healthyMonsterSignature = renderContractSignature();
state.combatState.monsters[0].hp = 5;
assert.notEqual(renderContractSignature(), healthyMonsterSignature, "戦闘モンスター表示更新を検知");

console.log("=== RENDERER-NEUTRAL IDLE CONTRACT TESTS PASSED ===");
