globalThis.document = {
  getElementById: () => ({
    getContext: () => ({}),
    width: 0,
    height: 0
  })
};

const assert = (await import("assert")).default;
const { state } = await import("../src/state.js");
const { menuContext } = await import("../src/navigation.js");
const { DungeonRenderer } = await import("../src/renderer.js");

let failed = false;
function check(condition, message) {
  try {
    assert.ok(condition, message);
    console.log(`-> [PASS] ${message}`);
  } catch (error) {
    failed = true;
    console.error(`-> [FAIL] ${message}`);
    console.error(error.message);
  }
}

function createCell() {
  return {
    walls: [true, true, true, true],
    blockEnter: [false, false, false, false],
    sealedGate: [null, null, null, null],
    type: "empty",
    event: null,
    trap: null
  };
}

console.log("=== RENDERER IDLE DRAW VERIFICATION ===");

const renderer = new DungeonRenderer("dungeon-canvas");
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
state.party = [];
state.lightTurns = 0;
state.lightPower = "";
state.dumapicTurns = 0;
menuContext.type = "";
menuContext.prevGameState = null;

const idleSignature = renderer.getDrawSignature();
check(idleSignature === renderer.getDrawSignature(), "静止状態の描画シグネチャは安定");
check(!renderer.isAnimating(), "通常探索の静止状態は非アニメーション");

state.visitedMap[0][1] = true;
const visitedSignature = renderer.getDrawSignature();
check(visitedSignature !== idleSignature, "同一座標で探索済みセル更新を検知");

state.map[0][0].walls[0] = false;
const secretDoorSignature = renderer.getDrawSignature();
check(secretDoorSignature !== visitedSignature, "同一座標で隠し扉開通を検知");

state.map[0][0].event = "chest";
const chestSignature = renderer.getDrawSignature();
state.map[0][0].event = null;
check(renderer.getDrawSignature() !== chestSignature, "同一座標で宝箱開封済み化を検知");

state.map[0][0].trap = { state: "hidden", traceReadLevel: 0 };
const hiddenTrapSignature = renderer.getDrawSignature();
state.map[0][0].trap.state = "discovered";
check(renderer.getDrawSignature() !== hiddenTrapSignature, "罠発見状態の更新を検知");

state.map[0][0].sealedGate[0] = { open: false };
const closedGateSignature = renderer.getDrawSignature();
state.map[0][0].sealedGate[0].open = true;
check(renderer.getDrawSignature() !== closedGateSignature, "封印門の開放を検知");

state.dungeonMemory.mapFragments[1] = ["1,1"];
const fragmentSignature = renderer.getDrawSignature();
state.dungeonMemory.mapFragments[1].push("0,1");
check(renderer.getDrawSignature() !== fragmentSignature, "マップ断片の更新を検知");

state.combatState = { monsters: [{ name: "Biter", level: 1, hp: 10, maxHp: 10 }] };
state.gameState = "combat";
const healthyMonsterSignature = renderer.getDrawSignature();
state.combatState.monsters[0].hp = 5;
check(renderer.getDrawSignature() !== healthyMonsterSignature, "戦闘モンスター表示の更新を検知");

state.gameState = "explore";
state.combatState = null;
state.map[0][0].event = null;
renderer.damageTexts = [{ age: 0, maxAge: 1 }];
const animatedSignature = renderer.getDrawSignature();
check(renderer.isAnimating(), "ダメージテキスト表示中は毎フレーム描画");
renderer.update(16);
const settledSignature = renderer.getDrawSignature();
check(animatedSignature !== settledSignature, "アニメーション終了時の最終クリア描画を要求");
check(!renderer.isAnimating(), "ダメージテキスト終了後は静止状態へ復帰");

state.floor = 5;
state.maps[4] = state.maps[0];
state.visitedMaps[4] = state.visitedMaps[0];
check(renderer.isAnimating(), "B5F熱波の時間依存描画を維持");
state.floor = 1;
state.map[0][1].event = "boss";
check(renderer.isAnimating(), "近距離ボスオーラの時間依存描画を維持");

if (failed) {
  console.error("\nRENDERER IDLE DRAW TESTS FAILED");
  process.exit(1);
}

console.log("\n=== RENDERER IDLE DRAW TESTS PASSED ===");
