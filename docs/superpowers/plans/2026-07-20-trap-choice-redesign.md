# 罠3択の再設計 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 罠を「ルート選択の障害物」として再定義し、ラン毎マップ再生成という現行前提に適合させる。

**Architecture:** 座標ベースの罠永続化を撤去し、`weakened` 状態を廃止する。数値式を `src/rules/trap_rules.js` の純関数へ隔離する。罠は隣接マスで自動察知され、踏む前に3択（解除／強行／引き返す）を選ぶ。生成側は深度に応じてチョークポイント（そのマスを塞ぐと階段へ到達できないマス）へ罠を寄せる。

**Tech Stack:** Vanilla JS (ES Modules), Vite, Playwright (browser test), 素の Node スクリプトによるユニットテスト

**元設計:** `docs/superpowers/specs/2026-07-20-trap-choice-redesign-design.md`

## Global Constraints

- ユニットテストは `scratch/test_*.js` に置く。テストフレームワークは使わない。失敗時は `console.error(...)` して `process.exit(1)`。実行は `node scratch/<file>.js`
- バランス検証スクリプトは `scratch/sim_*.js` に置く。`sim_` 接頭辞のファイルはテストスイートから除外される（`scratch/run_tests.js` の命名規則）
- スイート全体は `npm run test:unit`、ブラウザ検証は `npm run test:browser`
- Lint は `npm run lint`。コミット前に必ず通す
- セーブ互換は考慮しない。マイグレーション処理を書かない
- 適性クラスの判定は `char.class` の文字列比較。適性は `"Thief"` / `"Ninja"` / `"Ranger"` の3つ
- `trap.state` は `"hidden"` / `"discovered"` / `"disabled"` の3値のみ。`"weakened"` は本計画で廃止する
- 各タスクの最後にコミットする。コミットメッセージは Conventional Commits

---

## File Structure

**新規作成**
- `src/rules/trap_rules.js` — 罠の数値式。純関数のみ。state を参照しない
- `scratch/test_trap_rules.js` — 率式の境界値テスト
- `scratch/sim_trap_choke.js` — チョーク率の分布検証

**変更**
- `src/systems/traps.js` — 永続化撤去、察知の一本化、3択処理の再定義
- `src/map_generator.js` — `isChokeCell` とチョーク配置抽選
- `src/movement.js` — 罠マスへの進入前インターセプト
- `src/result.js` — `persistDungeonTraps` 削除
- `src/state/dungeon_state.js` — `applyDungeonMemoryToMaps` の traps ループ削除
- `src/renderer.js` — `weakened` マーカー削除、3D通路ビューの罠アイコン追加
- `src/ui/ui_root.js` — 迂回ボタン削除、落とし穴のラベル差し替え
- `index.html` — 迂回ボタンの DOM 削除
- `scratch/test_traps.js` — 既存テストの更新

---

## Task 1: 永続化と weakened の撤去

`weakenLevel` / `weakened` / `dungeonMemory.traps` を消す。挙動が変わるのは「弱体化した罠が存在しなくなる」ことのみで、3択の構造にはまだ手を付けない。ここが最大の差分なので最初に土台を平らにする。

**Files:**
- Modify: `src/systems/traps.js`
- Modify: `src/result.js`
- Modify: `src/state/dungeon_state.js`
- Modify: `src/renderer.js:1012-1031`
- Test: `scratch/test_traps.js`

**Interfaces:**
- Consumes: なし（最初のタスク）
- Produces:
  - `triggerTrap(trap, isPartialSuccess = false)` — 第2引数の `isWeakenedOverride` を削除した2引数版
  - `triggerPitfall(trap, isPartialSuccess = false)` — 同上
  - `calculateSuccessRate(trap)` — シグネチャ据え置き、`weakenedBonus` の項のみ削除
  - `state.dungeonMemory` は `{ mapFragments, visitedFloors }` のみを持つ（`traps` キーを書かない）

- [ ] **Step 1: 既存テストを新しい期待値へ書き換えて失敗させる**

`scratch/test_traps.js` の以下を置き換える。

先頭の import から `getDepthCategory` と永続化系を外す:

```js
const {
  calculateSuccessRate,
  triggerTrap,
  triggerPitfall,
  getExpectedEffectText
} = await import("../src/systems/traps.js");
```

`persistDungeonTraps` と `applyDungeonMemoryToMaps` の import 行を削除する:

```js
// 削除する2行:
// const { persistDungeonTraps } = await import("../src/result.js");
// const { applyDungeonMemoryToMaps } = await import("../src/state.js");
```

`depthCategoryCases` のブロック（`const depthCategoryCases = [...]` から直後の for ループの閉じ括弧まで）を丸ごと削除する。

セクション `[2]` の weakened 判定ブロックを、weakened が存在しないことの確認に差し替える:

```js
// Weakened state is abolished. A trap that is not hidden/discovered/disabled is invalid.
testTrap.state = "discovered";
const discoveredRate = calculateSuccessRate(testTrap);
if (discoveredRate !== 76) {
  console.error(`FAIL: discovered trap rate should stay 76, got ${discoveredRate}.`);
  process.exit(1);
}
console.log("PASS: Success rate calculations verified.");
```

セクション `[3]` の `triggerTrap` 呼び出しを2引数へ:

```js
const dmgTrap = { type: "damage", state: "discovered" };
triggerTrap(dmgTrap, false);
```

```js
const mpTrap = { type: "mpDrain", state: "discovered" };
triggerTrap(mpTrap, false);
```

```js
const alarmTrap = { type: "alarm", state: "discovered" };
triggerTrap(alarmTrap, false);
```

セクション `[4]`（`=== Verifying state memory persistence ===` 以降）を丸ごと削除し、代わりに以下を末尾へ追加する:

```js
// 4. Verify traps are never written to dungeonMemory
console.log("\n[4] Verifying trap persistence is removed:");
state.dungeonMemory = { mapFragments: {}, visitedFloors: [1] };
if (state.dungeonMemory.traps !== undefined) {
  console.error("FAIL: dungeonMemory.traps should not exist.");
  process.exit(1);
}

// Generated traps must never carry weakenLevel or weakened state
const genMap = generateRandomMap(3, null, "TEST_SEED");
for (const row of genMap.grid) {
  for (const cell of row) {
    if (!cell.trap) continue;
    if (cell.trap.weakenLevel !== undefined) {
      console.error("FAIL: generated trap still has weakenLevel.");
      process.exit(1);
    }
    if (!["hidden", "discovered", "disabled"].includes(cell.trap.state)) {
      console.error(`FAIL: invalid trap state ${cell.trap.state}.`);
      process.exit(1);
    }
  }
}
console.log("PASS: Trap persistence removed.");

console.log("\n=== ALL TRAP TESTS PASSED ===");
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `node scratch/test_traps.js`
Expected: FAIL。`weakenLevel` がまだ生成される、または import した `getDepthCategory` の削除により参照エラー。

- [ ] **Step 3: `src/systems/traps.js` から永続化を削除**

以下を削除する:
- `trapPersistenceByDepth` の export と定義全体
- `getDepthCategory` の export と定義全体
- `addDisarmPersistenceLog` の定義と、`handleTrapAction` 内の2箇所の呼び出し
- `weakenedModifiers` の export と定義全体

`calculateSuccessRate` を以下へ置き換える:

```js
export function calculateSuccessRate(trap) {
  const baseRate = 50;
  let disarmerSkill = 0;

  const disarmer = getBestDisarmer();
  if (disarmer) {
    let bonus = 0;
    if (disarmer.class === "Thief") bonus = disarmer.level * 2 + 15;
    else if (disarmer.class === "Ninja") bonus = disarmer.level * 1.5 + 10;
    else if (disarmer.class === "Ranger") bonus = disarmer.level + 5;
    disarmerSkill = disarmer.luk + disarmer.agi + bonus;
  }

  let rate = baseRate + disarmerSkill - trap.difficulty - (state.floor - 1) * 5;
  if (trap.type === "pitfall") {
    rate += 20;
  }
  return Math.max(10, Math.min(95, rate));
}
```

`triggerTrap` と `triggerPitfall` のシグネチャを変更する。両関数の先頭にある以下の2行を削除する:

```js
// 削除:
//   const isWeakened = isWeakenedOverride !== null ? isWeakenedOverride : (trap.state === "weakened");
```

シグネチャを `export function triggerTrap(trap, isPartialSuccess = false) {` および
`export function triggerPitfall(trap, isPartialSuccess = false) {` にする。

関数本体で `isWeakened` を参照している箇所は、`isWeakened` が常に false になったものとして畳む。
具体的には `isWeakened || isPartialSuccess` は `isPartialSuccess` に、
`isWeakened ? A : B` は `B` に置き換える。
`state.alarmWeakened = isWeakened || isPartialSuccess;` は
`state.alarmWeakened = isPartialSuccess;` にする。

`handleTrapAction` 内の呼び出しを全て2引数へ直す:
- `triggerPitfall(trap, trap.state === "weakened", false)` → `triggerPitfall(trap, false)`
- `triggerPitfall(trap, trap.state === "weakened", true)` → `triggerPitfall(trap, true)`
- `triggerTrap(trap, trap.state === "weakened", true)` → `triggerTrap(trap, true)`
- `triggerTrap(trap, false, false)` → `triggerTrap(trap, false)`

`handleTrapStepCheck` 内の `triggerPitfall(trap)` / `triggerTrap(trap)` は引数なしのままでよい。

`getTrapRevealLevel` の以下の行から `weakened` を外す:

```js
  if (trap.state === "discovered") return 3;
```

- [ ] **Step 4: `src/result.js` から `persistDungeonTraps` を削除**

`persistDungeonTraps` の export と定義全体を削除する。
`triggerRunResult` の先頭にある `persistDungeonTraps();` の行を削除する。
ファイル先頭の import から `getDepthCategory` と `trapPersistenceByDepth` を外す:

```js
// 削除する行:
// import { getDepthCategory, trapPersistenceByDepth } from "./systems/traps.js";
```

- [ ] **Step 5: `src/state/dungeon_state.js` の traps ループを削除**

`applyDungeonMemoryToMaps` の中から、罠の状態を memory から復元する二重ループ
（`for (let f = 1; f <= 5; f++)` で始まり `cell.trap.state = memory.state;` を含むブロック）を丸ごと削除する。
`mapFragments` / `visitedFloors` の初期化と、その後の warden gate 処理は残す。

初期化行から `traps` を外す:

```js
  if (!state.dungeonMemory) {
    state.dungeonMemory = { mapFragments: {}, visitedFloors: [1] };
  }
```

`if (!state.dungeonMemory || !state.dungeonMemory.traps)` という条件になっている場合は
`if (!state.dungeonMemory)` に直す。

- [ ] **Step 6: 生成側から `weakenLevel` を削除**

`src/map_generator.js` の罠生成箇所（`grid[spot.y][spot.x].trap = {` のオブジェクトリテラル）から
`weakenLevel: 0` の行を削除する。

- [ ] **Step 7: `src/renderer.js` の weakened マーカーを削除**

2Dミニマップの罠マーカー部分を以下へ置き換える:

```js
        if (cell.trap && cell.trap.state !== "hidden") {
          const isDisabled = cell.trap.state === "disabled";
          const markerColor = isDisabled ? "#2fd66d" : "#ff3b30";
          const markerBg = isDisabled ? "rgba(47, 214, 109, 0.22)" : "rgba(255, 59, 48, 0.24)";

          ctx.fillStyle = markerBg;
          ctx.beginPath();
          ctx.arc(screenX + cellS / 2, screenY + cellS / 2, 4, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = markerColor;
          ctx.lineWidth = 1.2;
          ctx.stroke();

          ctx.fillStyle = markerColor;
          ctx.font = "bold 9px monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(isDisabled ? "x" : "!", screenX + cellS / 2, screenY + cellS / 2);
        }
```

- [ ] **Step 8: `weakened` の残骸がないことを確認**

Run: `grep -rn "weakened\|weakenLevel\|dungeonMemory.traps\|persistDungeonTraps\|trapPersistenceByDepth\|getDepthCategory" src/ scratch/`
Expected: `src/ui/ui_root.js` の `trapStates` オブジェクト内の `weakened` 行のみがヒットする。それを削除する:

```js
    const trapStates = {
      hidden: "未解除",
      discovered: "発見済み"
    };
```

同ファイルの `statusColor` から weakened 分岐を外す:

```js
    const statusColor = "var(--neon-amber)";
```

再度 grep して0件になるまで繰り返す。

- [ ] **Step 9: テストを実行して成功を確認**

Run: `node scratch/test_traps.js`
Expected: PASS。末尾に `=== ALL TRAP TESTS PASSED ===` が出る。

- [ ] **Step 10: スイート全体と lint**

Run: `npm run test:unit && npm run lint`
Expected: どちらも成功。他のテストが `getDepthCategory` などを import していれば、そこも同様に外す。

- [ ] **Step 11: コミット**

```bash
git add src/systems/traps.js src/result.js src/state/dungeon_state.js src/map_generator.js src/renderer.js src/ui/ui_root.js scratch/test_traps.js
git commit -m "refactor: 罠の永続化とweakened状態を撤去

座標ベースのtrapIdはラン毎マップ再生成と噛み合わず、永続化は実質
機能していなかった。dungeonMemory.trapsへの書き込みと弱体化状態を
削除する。"
```

---

## Task 2: trap_rules.js の切り出しと率式の置換

数値式を state 非依存の純関数へ隔離する。現行の `luk + agi` 生加算をやめ、クラス適性で二極化した式へ置き換える。

**Files:**
- Create: `src/rules/trap_rules.js`
- Create: `scratch/test_trap_rules.js`
- Modify: `src/systems/traps.js`
- Modify: `scratch/test_traps.js`

**Interfaces:**
- Consumes: Task 1 の `calculateSuccessRate(trap)`
- Produces:
  - `isDisarmAptClass(className: string): boolean`
  - `calculateDisarmRate({ className, level, floor, affixBonus = 0 }): number` — 0〜100の整数
  - `calculateDetectRate({ floor }): number` — 0〜1の小数
  - `FORCE_DAMAGE_MULTIPLIER: number` — 0.5
  - `PARTIAL_SUCCESS_BAND: number` — 15
  - `PITFALL_EDGE_BONUS: number` — 20

- [ ] **Step 1: 失敗するテストを書く**

Create `scratch/test_trap_rules.js`:

```js
const {
  isDisarmAptClass,
  calculateDisarmRate,
  calculateDetectRate,
  FORCE_DAMAGE_MULTIPLIER,
  PARTIAL_SUCCESS_BAND,
  PITFALL_EDGE_BONUS
} = await import("../src/rules/trap_rules.js");

console.log("=== TRAP RULES VERIFICATION ===");

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    console.error(`FAIL: ${label} — expected ${expected}, got ${actual}`);
    process.exit(1);
  }
  console.log(`- ${label}: ${actual}`);
}

// 1. Aptitude classes
console.log("\n[1] Aptitude class detection:");
for (const cls of ["Thief", "Ninja", "Ranger"]) {
  assertEqual(isDisarmAptClass(cls), true, `${cls} is apt`);
}
for (const cls of ["Fighter", "Mage", "Priest", "Bishop", "Lord", "Samurai"]) {
  assertEqual(isDisarmAptClass(cls), false, `${cls} is not apt`);
}

// 2. Disarm rate — apt: 80 + lv*1.0 - (floor-1)*2.0, clamp 20..90
console.log("\n[2] Disarm rate (apt):");
assertEqual(calculateDisarmRate({ className: "Thief", level: 1, floor: 1 }), 81, "Thief lv1 B1");
assertEqual(calculateDisarmRate({ className: "Thief", level: 10, floor: 10 }), 72, "Thief lv10 B10");
assertEqual(calculateDisarmRate({ className: "Ninja", level: 20, floor: 20 }), 62, "Ninja lv20 B20");
// Upper clamp: lv30 B1 -> 80+30-0 = 110 -> 90
assertEqual(calculateDisarmRate({ className: "Thief", level: 30, floor: 1 }), 90, "apt upper clamp");
// Lower clamp: lv1 B60 -> 80+1-118 = -37 -> 20
assertEqual(calculateDisarmRate({ className: "Thief", level: 1, floor: 60 }), 20, "apt lower clamp");

// 3. Disarm rate — non-apt: 40 + lv*0.5 - (floor-1)*2.0, clamp 5..60
console.log("\n[3] Disarm rate (non-apt):");
assertEqual(calculateDisarmRate({ className: "Fighter", level: 1, floor: 1 }), 41, "Fighter lv1 B1");
assertEqual(calculateDisarmRate({ className: "Fighter", level: 10, floor: 10 }), 27, "Fighter lv10 B10");
assertEqual(calculateDisarmRate({ className: "Mage", level: 20, floor: 20 }), 12, "Mage lv20 B20");
// Upper clamp: lv60 B1 -> 40+30 = 70 -> 60
assertEqual(calculateDisarmRate({ className: "Fighter", level: 60, floor: 1 }), 60, "non-apt upper clamp");
// Lower clamp: lv1 B30 -> 40+0.5-58 = -17.5 -> 5
assertEqual(calculateDisarmRate({ className: "Fighter", level: 1, floor: 30 }), 5, "non-apt lower clamp");

// 4. Affix bonus is additive and applied before clamping
console.log("\n[4] Affix bonus:");
assertEqual(
  calculateDisarmRate({ className: "Fighter", level: 1, floor: 1, affixBonus: 10 }),
  51,
  "Fighter lv1 B1 +10 affix"
);
assertEqual(
  calculateDisarmRate({ className: "Thief", level: 1, floor: 1, affixBonus: 50 }),
  90,
  "affix cannot exceed upper clamp"
);

// 5. Detect rate — 0.85 - 0.015*(floor-1), floor 0.60, class-independent
console.log("\n[5] Detect rate:");
assertEqual(calculateDetectRate({ floor: 1 }), 0.85, "B1 detect");
assertEqual(calculateDetectRate({ floor: 11 }), 0.7, "B11 detect");
assertEqual(calculateDetectRate({ floor: 30 }), 0.6, "B30 detect (clamped)");

// 6. Constants
console.log("\n[6] Constants:");
assertEqual(FORCE_DAMAGE_MULTIPLIER, 0.5, "force damage multiplier");
assertEqual(PARTIAL_SUCCESS_BAND, 15, "partial success band");
assertEqual(PITFALL_EDGE_BONUS, 20, "pitfall edge bonus");

console.log("\n=== ALL TRAP RULES TESTS PASSED ===");
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `node scratch/test_trap_rules.js`
Expected: FAIL。`Cannot find module '../src/rules/trap_rules.js'`

- [ ] **Step 3: `src/rules/trap_rules.js` を実装**

```js
const DISARM_APT_CLASSES = new Set(["Thief", "Ninja", "Ranger"]);

export const FORCE_DAMAGE_MULTIPLIER = 0.5;
export const PARTIAL_SUCCESS_BAND = 15;
export const PITFALL_EDGE_BONUS = 20;

export function isDisarmAptClass(className) {
  return DISARM_APT_CLASSES.has(className);
}

// 解除率はクラス適性で二極化する。適性は深層でも主軸として機能し、
// 非適性は浅層の安いギャンブルに留めて強行と回り込みへ寄せる。
export function calculateDisarmRate({ className, level, floor, affixBonus = 0 }) {
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  const depth = Math.max(1, Math.floor(Number(floor) || 1));
  const apt = isDisarmAptClass(className);

  const base = apt ? 80 : 40;
  const levelGain = apt ? lv * 1.0 : lv * 0.5;
  const depthLoss = (depth - 1) * 2.0;
  const min = apt ? 20 : 5;
  const max = apt ? 90 : 60;

  const raw = base + levelGain - depthLoss + affixBonus;
  return Math.round(Math.max(min, Math.min(max, raw)));
}

// 察知はクラス非依存。罠がルート選択の障害物である以上、
// 情報を全員に配らないと選択が成立しない。
export function calculateDetectRate({ floor }) {
  const depth = Math.max(1, Math.floor(Number(floor) || 1));
  const raw = 0.85 - 0.015 * (depth - 1);
  return Math.round(Math.max(0.6, raw) * 1000) / 1000;
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `node scratch/test_trap_rules.js`
Expected: PASS。末尾に `=== ALL TRAP RULES TESTS PASSED ===`

- [ ] **Step 5: `calculateSuccessRate` を新式へ差し替える**

`src/systems/traps.js` の先頭に import を追加:

```js
import { calculateDisarmRate, PITFALL_EDGE_BONUS } from "../rules/trap_rules.js";
```

`getBestDisarmer` を、生存している先頭キャラを返すだけの関数へ簡素化する。パーティは1人であり、スキル値の比較は不要になった:

```js
function getActiveCharacter() {
  return (state.party || []).find(
    char => char?.hp > 0 && !["dead", "ash"].includes(char.status)
  ) || null;
}
```

`getBestDisarmer` の定義を削除し、`calculateSuccessRate` を置き換える:

```js
export function calculateSuccessRate(trap) {
  const char = getActiveCharacter();
  if (!char) return 0;

  const rate = calculateDisarmRate({
    className: char.class,
    level: char.level,
    floor: state.floor,
    affixBonus: getPartyMaxAffix(state.party, "disarmBonus") || 0
  });

  return trap.type === "pitfall" ? Math.min(100, rate + PITFALL_EDGE_BONUS) : rate;
}
```

`trap.difficulty` はもう率に影響しない。生成側のフィールドは残すが式からは外す。

- [ ] **Step 6: `scratch/test_traps.js` の率テストを新式へ更新**

セクション `[2]` を丸ごと以下へ置き換える:

```js
// 2. Verify Success Rate Calculation (delegates to trap_rules)
console.log("\n[2] Verifying trap disarm success rate calculation:");
const testTrap = {
  id: "trap_1_5_5",
  floorId: "B1",
  position: { x: 5, y: 5 },
  type: "damage",
  state: "hidden",
  difficulty: 30
};

state.floor = 1;
state.party = [];
if (calculateSuccessRate(testTrap) !== 0) {
  console.error("FAIL: empty party should yield 0.");
  process.exit(1);
}

state.party = [{
  name: "Robin",
  class: "Thief",
  level: 5,
  hp: 20,
  maxHp: 20,
  luk: 15,
  agi: 16,
  status: "ok"
}];
// apt: 80 + 5*1.0 - 0 = 85
const thiefRate = calculateSuccessRate(testTrap);
if (thiefRate !== 85) {
  console.error(`FAIL: Thief lv5 B1 should be 85, got ${thiefRate}.`);
  process.exit(1);
}

// difficulty must no longer affect the rate
testTrap.difficulty = 90;
if (calculateSuccessRate(testTrap) !== 85) {
  console.error("FAIL: trap.difficulty must not affect disarm rate.");
  process.exit(1);
}

// pitfall gets the edge bonus: 85 + 20 = 105, clamped to 100
const pitTrap = { ...testTrap, type: "pitfall" };
const pitRate = calculateSuccessRate(pitTrap);
if (pitRate !== 100) {
  console.error(`FAIL: pitfall rate should be 100, got ${pitRate}.`);
  process.exit(1);
}
console.log("PASS: Success rate calculations verified.");
```

- [ ] **Step 7: スイート全体と lint**

Run: `npm run test:unit && npm run lint`
Expected: 成功。

- [ ] **Step 8: コミット**

```bash
git add src/rules/trap_rules.js scratch/test_trap_rules.js src/systems/traps.js scratch/test_traps.js
git commit -m "refactor: 罠の数値式をtrap_rules.jsへ隔離しクラス適性で二極化

luk+agiの生加算は浅層95%・深層10%への張り付きを招いていた。
state非依存の純関数へ切り出し、適性クラスは深層でも主軸、
非適性は浅層のギャンブルに留める式へ置き換える。"
```

---

## Task 3: 隣接察知への一本化

「踏んだ瞬間の判定」を廃止し、隣接マスでの自動察知に統一する。壁越しは察知せず、1つの罠につき判定は1回だけ。

**Files:**
- Modify: `src/systems/traps.js`
- Modify: `src/movement.js:822-843`
- Test: `scratch/test_traps.js`

**Interfaces:**
- Consumes: Task 2 の `calculateDetectRate({ floor })`
- Produces:
  - `detectAdjacentTraps(): boolean` — 1マス以上を新たに `discovered` にしたら true
  - `trap.detectRolled: boolean` — 判定済みフラグ。生成時は未定義、判定後に true
  - `handleTrapStepCheck(trap)` は削除される。`movement.js` からの参照も消える

- [ ] **Step 1: 失敗するテストを書く**

`scratch/test_traps.js` の末尾（`=== ALL TRAP TESTS PASSED ===` の直前）へ追加する。
先頭の import に `detectAdjacentTraps` を足す。

```js
// 5. Adjacent trap detection
console.log("\n[5] Verifying adjacent trap detection:");
const { detectAdjacentTraps } = await import("../src/systems/traps.js");

// Build a 3x3 test grid: player at (1,1). Walls are [N, E, S, W].
function makeCell(walls) {
  return { walls, blockEnter: [false, false, false, false], type: "empty", event: null };
}
const openAll = () => makeCell([false, false, false, false]);

// East neighbour (2,1) has a trap and is open. West neighbour (0,1) has a
// trap but is walled off, so it must never be detected.
const grid = [
  [openAll(), openAll(), openAll()],
  [openAll(), makeCell([false, false, false, true]), openAll()],
  [openAll(), openAll(), openAll()]
];
grid[1][2].trap = { id: "t_east", type: "damage", state: "hidden", difficulty: 30 };
grid[1][0].trap = { id: "t_west", type: "damage", state: "hidden", difficulty: 30 };

state.map = grid;
state.maps = [grid];
state.floor = 1;
state.x = 1;
state.y = 1;
state.party = [{ name: "Robin", class: "Fighter", level: 1, hp: 20, maxHp: 20, luk: 10, agi: 10, status: "ok" }];

// Force detection to always succeed
const realRandom = Math.random;
Math.random = () => 0;
detectAdjacentTraps();
Math.random = realRandom;

if (grid[1][2].trap.state !== "discovered") {
  console.error("FAIL: open adjacent trap should be discovered.");
  process.exit(1);
}
if (grid[1][0].trap.state !== "hidden") {
  console.error("FAIL: trap behind a wall must not be detected.");
  process.exit(1);
}
console.log("- open neighbour discovered, walled neighbour untouched");

// Detection is rolled once per trap: a guaranteed-fail reroll must not
// downgrade an already-discovered trap, and must not re-roll a failed one.
grid[2][1].trap = { id: "t_south", type: "damage", state: "hidden", difficulty: 30 };
Math.random = () => 0.99;
detectAdjacentTraps();
if (grid[2][1].trap.state !== "hidden") {
  console.error("FAIL: failed detection should leave trap hidden.");
  process.exit(1);
}
if (grid[2][1].trap.detectRolled !== true) {
  console.error("FAIL: failed detection must still mark detectRolled.");
  process.exit(1);
}
Math.random = () => 0;
detectAdjacentTraps();
if (grid[2][1].trap.state !== "hidden") {
  console.error("FAIL: detection must not be rolled twice for the same trap.");
  process.exit(1);
}
Math.random = realRandom;
console.log("PASS: Adjacent detection verified.");
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `node scratch/test_traps.js`
Expected: FAIL。`detectAdjacentTraps is not a function`

- [ ] **Step 3: `detectAdjacentTraps` を実装**

`src/systems/traps.js` の `detectAdjacentTrapsByTraceRead` を以下へ置き換える:

```js
// 罠はルート選択の障害物なので、察知はクラス非依存で全員に配る。
// 壁越しは察知しない（行けない場所の情報でマップが汚れるため）。
// 1つの罠につき判定は生涯1回（引き直せると判定が作業に化けるため）。
export function detectAdjacentTraps() {
  const rate = calculateDetectRate({ floor: state.floor });
  const traceRead = getPartyMaxAffix(state.party, "traceRead");
  const found = [];

  for (let dir = 0; dir < 4; dir++) {
    const cell = state.map[state.y]?.[state.x];
    if (!cell || cell.walls[dir]) continue;

    const x = state.x + DX[dir];
    const y = state.y + DY[dir];
    const trap = state.map[y]?.[x]?.trap;
    if (!trap || trap.state !== "hidden" || trap.detectRolled) continue;

    trap.detectRolled = true;
    if (Math.random() >= rate) continue;

    trap.state = "discovered";
    if (traceRead > 0) trap.traceReadLevel = traceRead;
    found.push(trap);
  }

  if (found.length === 0) return false;

  const lead = found[0];
  if (traceRead >= 2) {
    addLog(`【痕跡】隣接する床に${getExpectedEffectText(lead)}の罠がある。`);
  } else {
    addLog("【痕跡】隣接する床に罠の気配がある。");
  }
  playSound("miss");
  return true;
}
```

import に `calculateDetectRate` を追加する:

```js
import { calculateDisarmRate, calculateDetectRate, PITFALL_EDGE_BONUS } from "../rules/trap_rules.js";
```

- [ ] **Step 4: `handleTrapStepCheck` を削除**

`src/systems/traps.js` から `handleTrapStepCheck` の export と定義全体を削除する。
罠の発動は Task 5 の進入前インターセプトへ移る。

- [ ] **Step 5: `src/movement.js` の呼び出しを差し替える**

import 行を変更する:

```js
import { detectAdjacentTraps } from "./systems/traps.js";
```

`processExplorationResolution` の `// 2.5. Check standard traps` ブロックを以下へ置き換える:

```js
  // 2.5. Detect traps on adjacent cells. Stepping onto a trap is intercepted
  // before the move happens (see handleMove), so there is no step check here.
  detectAdjacentTraps();
```

- [ ] **Step 6: テストを実行して成功を確認**

Run: `node scratch/test_traps.js`
Expected: PASS

- [ ] **Step 7: スイート全体と lint**

Run: `npm run test:unit && npm run lint`
Expected: 成功。`detectAdjacentTrapsByTraceRead` や `handleTrapStepCheck` を参照する箇所が残っていればエラーになるので、grep で確認して直す。

Run: `grep -rn "detectAdjacentTrapsByTraceRead\|handleTrapStepCheck" src/ scratch/ tests/`
Expected: 0件

- [ ] **Step 8: コミット**

```bash
git add src/systems/traps.js src/movement.js scratch/test_traps.js
git commit -m "feat: 罠の察知を隣接マスの自動判定に一本化

踏んだ瞬間の判定が残ると隣接察知に失敗しても踏めば引き直せる
二重構造になり、事前情報の価値が失われる。察知はクラス非依存、
壁越し非察知、罠1つにつき判定1回とする。"
```

---

## Task 4: 3D通路ビューへの罠マーカー追加

2Dミニマップのマーカーは既にある。3D通路ビューにも `discovered` 罠を出し、進行方向の罠を見て引き返せるようにする。

**Files:**
- Modify: `src/renderer.js:328` 付近（アイコン分岐）、`src/renderer.js:477` 付近（描画関数群）

**Interfaces:**
- Consumes: Task 3 の `trap.state === "discovered"`、`trap.traceReadLevel`
- Produces: `drawTrapIcon(ctx, z, revealSpecies)` — レンダラのメソッド。外部からは呼ばれない

- [ ] **Step 1: 描画メソッドを追加**

`src/renderer.js` の `drawChestIcon(ctx, z)` の定義直後に追加する:

```js
  drawTrapIcon(ctx, z, revealSpecies) {
    const xl = XL[z];
    const xr = XR[z];
    const yb = YB[z];

    const corridorWidth = xr - xl;
    const size = corridorWidth * 0.22;
    const cx = xl + corridorWidth / 2;
    const cy = yb - size * 0.6 - 2;

    ctx.save();
    ctx.strokeStyle = "#ff3b30";
    ctx.shadowColor = "#ff3b30";
    ctx.shadowBlur = 6;
    ctx.lineWidth = 2;

    // Hazard triangle on the floor ahead
    ctx.beginPath();
    ctx.moveTo(cx, cy - size * 0.5);
    ctx.lineTo(cx + size * 0.55, cy + size * 0.4);
    ctx.lineTo(cx - size * 0.55, cy + size * 0.4);
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = "#ff3b30";
    ctx.font = `bold ${Math.max(8, Math.round(size * 0.5))}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(revealSpecies ? "!" : "?", cx, cy + size * 0.05);

    ctx.restore();
  }
```

- [ ] **Step 2: 分岐から呼び出す**

`this.drawChestIcon(ctx, z);` を含む if ブロックの直後に追加する:

```js
        if (column === 0 && z > 0 && cell.trap && cell.trap.state === "discovered") {
          this.drawTrapIcon(ctx, z, (cell.trap.traceReadLevel || 0) >= 2);
        }
```

- [ ] **Step 3: ブラウザで描画を確認**

Run: `npm run test:browser`
Expected: 既存の Playwright テストが全て PASS（描画追加による回帰がないこと）。

- [ ] **Step 4: lint**

Run: `npm run lint`
Expected: 成功

- [ ] **Step 5: コミット**

```bash
git add src/renderer.js
git commit -m "feat: 3D通路ビューに発見済みの罠アイコンを表示

進行方向の罠を踏む前に視認して引き返せるようにする。
traceReadで種別まで判明している場合は表示を変える。"
```

---

## Task 5: 3択の再定義

迂回を削除し、強行を確定軽減ダメージにする。罠マスへは進入前にインターセプトして判断を挟む。落とし穴は「飛び込む」＝深度ショートカットへ変更する。

**Files:**
- Modify: `src/systems/traps.js`
- Modify: `src/movement.js:100-165`
- Modify: `src/ui/ui_root.js:368-372`
- Modify: `index.html`
- Test: `scratch/test_traps.js`

**Interfaces:**
- Consumes: Task 2 の `FORCE_DAMAGE_MULTIPLIER` / `PARTIAL_SUCCESS_BAND`、Task 3 の `detectAdjacentTraps`
- Produces:
  - `startTrapEncounter(trap, pendingMove)` — `pendingMove` は `{ x, y }`。進入予定の座標
  - `handleTrapAction(action)` — `action` は `"disarm"` / `"force"` / `"back"` の3値。`"bypass"` は削除
  - `state.activeTrapState.pendingMove: { x, y }`

- [ ] **Step 1: 失敗するテストを書く**

`scratch/test_traps.js` の末尾へ追加する。import に `startTrapEncounter` と `handleTrapAction` を足す。

```js
// 6. Three-choice trap encounter
console.log("\n[6] Verifying trap encounter choices:");
const { startTrapEncounter, handleTrapAction } = await import("../src/systems/traps.js");

function setupEncounter(trapType) {
  const g = [
    [openAll(), openAll(), openAll()],
    [openAll(), openAll(), openAll()],
    [openAll(), openAll(), openAll()]
  ];
  g[1][2].trap = {
    id: "t_enc",
    floorId: "B1",
    position: { x: 2, y: 1 },
    type: trapType,
    state: "discovered",
    difficulty: 30
  };
  state.map = g;
  state.maps = [g, g];
  state.floor = 1;
  state.x = 1;
  state.y = 1;
  state.gameState = "explore";
  state.party = [{
    name: "Robin", class: "Fighter", level: 1,
    hp: 20, maxHp: 20, mp: 5, maxMp: 5,
    luk: 10, agi: 10, status: "ok"
  }];
  startTrapEncounter(g[1][2].trap, { x: 2, y: 1 });
  return g;
}

// "back" leaves the player where they were and costs nothing
let g6 = setupEncounter("damage");
handleTrapAction("back");
if (state.x !== 1 || state.y !== 1) {
  console.error(`FAIL: back should not move the player, got (${state.x},${state.y}).`);
  process.exit(1);
}
if (g6[1][2].trap.state !== "discovered") {
  console.error("FAIL: back should leave the trap armed.");
  process.exit(1);
}
console.log("- back: stays put, trap stays armed");

// "force" always moves the player through and always disables the trap
g6 = setupEncounter("damage");
handleTrapAction("force");
if (state.x !== 2 || state.y !== 1) {
  console.error(`FAIL: force should complete the move, got (${state.x},${state.y}).`);
  process.exit(1);
}
if (g6[1][2].trap.state !== "disabled") {
  console.error("FAIL: force should disable the trap.");
  process.exit(1);
}
if (state.party[0].hp >= 20) {
  console.error("FAIL: force should deal reduced damage.");
  process.exit(1);
}
console.log(`- force: moved through, took ${20 - state.party[0].hp} damage`);

// "disarm" completes the move regardless of the roll outcome
for (const roll of [0, 0.99]) {
  g6 = setupEncounter("damage");
  const realRandom6 = Math.random;
  Math.random = () => roll;
  handleTrapAction("disarm");
  Math.random = realRandom6;
  if (state.x !== 2 || state.y !== 1) {
    console.error(`FAIL: disarm (roll=${roll}) should complete the move.`);
    process.exit(1);
  }
  if (g6[1][2].trap.state !== "disabled") {
    console.error(`FAIL: disarm (roll=${roll}) should disable the trap.`);
    process.exit(1);
  }
}
console.log("- disarm: completes the move on both success and failure");

// "bypass" is removed and must be a no-op
g6 = setupEncounter("damage");
handleTrapAction("bypass");
if (state.x !== 1 || state.y !== 1) {
  console.error("FAIL: bypass should no longer exist.");
  process.exit(1);
}
console.log("- bypass: removed");
console.log("PASS: Trap encounter choices verified.");
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `node scratch/test_traps.js`
Expected: FAIL。`startTrapEncounter` が2引数を受け取らず、`back` が `state.prevX` へ戻そうとする。

- [ ] **Step 3: `startTrapEncounter` に pendingMove を持たせる**

```js
export function startTrapEncounter(trap, pendingMove) {
  const revealLevel = getTrapRevealLevel(trap);
  armControlsGuard();
  state.gameState = "trap_encounter";
  state.activeTrapState = {
    trap,
    pendingMove,
    successRate: calculateSuccessRate(trap),
    expectedEffect: revealLevel >= 2 ? getExpectedEffectText(trap) : "不明",
    revealLevel
  };
  if (typeof document !== "undefined") updateUI();
}
```

- [ ] **Step 4: `handleTrapAction` を書き換える**

`handleTrapAction` の定義全体を以下へ置き換える:

```js
function completePendingMove() {
  const move = state.activeTrapState?.pendingMove;
  if (!move) return;
  state.x = move.x;
  state.y = move.y;
  if (state.visitedMap?.[move.y]) state.visitedMap[move.y][move.x] = true;
}

function endTrapEncounter() {
  state.gameState = "explore";
  state.activeTrapState = null;
  saveAutosave();
  updateUI();
}

export function handleTrapAction(action) {
  if (!state.activeTrapState) return;
  const { trap, successRate } = state.activeTrapState;

  if (action === "back") {
    addLog("罠を前にして、その場に留まった。");
    playSound("move");
    endTrapEncounter();
    return;
  }

  if (action === "force") {
    if (trap.type === "pitfall") {
      addLog("意を決して落とし穴へ飛び込んだ！");
      trap.state = "disabled";
      state.gameState = "explore";
      state.activeTrapState = null;
      triggerPitfall(trap, true);
      return;
    }

    // 強行は必ず通れる。チョーク罠でフロア突破不能にしないための保証。
    addLog("罠を承知で強引に駆け抜けた！");
    triggerTrap(trap, true);
    trap.state = "disabled";
    completePendingMove();
    endTrapEncounter();
    return;
  }

  if (action === "disarm") {
    const roll = Math.random() * 100;

    if (trap.type === "pitfall") {
      if (roll < successRate) {
        addLog("[味方] 【回避成功】慎重に縁を伝い、落とし穴を渡りきった！");
        playSound("item");
        trap.state = "disabled";
        if (state.currentRun) state.currentRun.trapsDisarmed++;
        recordTrapCodex("pitfall", "disarmed");
        completePendingMove();
        endTrapEncounter();
      } else {
        addLog("【失敗】バランスを崩して落とし穴に落ちてしまった！");
        trap.state = "disabled";
        if (state.currentRun) state.currentRun.trapsTriggered++;
        recordTrapCodex("pitfall", "triggered");
        state.gameState = "explore";
        state.activeTrapState = null;
        triggerPitfall(trap, false);
      }
      return;
    }

    const codexTrapType = trap.type === "damage"
      ? "poison needle"
      : (trap.type === "mpDrain" ? "gas bomb" : "flash bomb");

    if (roll < successRate) {
      addLog("[味方] 【解除成功】罠の機能を完全に停止した！");
      playSound("item");
      if (state.currentRun) state.currentRun.trapsDisarmed++;
      recordTrapCodex(codexTrapType, "disarmed");
    } else if (roll < successRate + PARTIAL_SUCCESS_BAND) {
      addLog("[味方] 【部分成功】完全には解除できなかったが、被害を最小限に抑えた！");
      triggerTrap(trap, true);
      if (state.currentRun) state.currentRun.trapsTriggered++;
      recordTrapCodex(codexTrapType, "triggered");
    } else {
      addLog("【解除失敗】仕掛けが暴発した！");
      triggerTrap(trap, false);
      if (state.currentRun) state.currentRun.trapsTriggered++;
      recordTrapCodex(codexTrapType, "triggered");
    }

    // 解除は成功・部分成功・失敗のいずれでも罠を使い切って通過する。
    // 同じ罠を再度踏んで判定を引き直せる状態を残さない。
    trap.state = "disabled";
    completePendingMove();
    endTrapEncounter();
    return;
  }
}
```

import に定数を追加する:

```js
import {
  calculateDisarmRate,
  calculateDetectRate,
  PITFALL_EDGE_BONUS,
  PARTIAL_SUCCESS_BAND,
  FORCE_DAMAGE_MULTIPLIER
} from "../rules/trap_rules.js";
```

- [ ] **Step 5: 軽減ダメージ倍率を `FORCE_DAMAGE_MULTIPLIER` へ統一**

`triggerTrap` と `triggerPitfall` の中で `isPartialSuccess` によって威力を下げている箇所の係数を、ハードコードされた値から `FORCE_DAMAGE_MULTIPLIER` へ置き換える。`powerMultiplier` を組み立てている行を以下の形にする:

```js
  const powerMultiplier = isPartialSuccess ? FORCE_DAMAGE_MULTIPLIER : 1;
```

- [ ] **Step 6: 進入前インターセプトを `movement.js` に入れる**

`src/movement.js` の import に `startTrapEncounter` を追加する:

```js
import { detectAdjacentTraps, startTrapEncounter } from "./systems/traps.js";
```

`handleMove` の中、`forward` 分岐で座標を進める直前に割り込みを入れる。
`// Step forward` コメントの直後、`state.x += DX[state.dir];` の前へ:

```js
      // Traps are route obstacles: decide before entering the cell, so that
      // backing out costs nothing.
      const nextX = state.x + DX[state.dir];
      const nextY = state.y + DY[state.dir];
      const nextTrap = state.map[nextY]?.[nextX]?.trap;
      if (nextTrap && nextTrap.state === "discovered") {
        startTrapEncounter(nextTrap, { x: nextX, y: nextY });
        saveAutosave();
        updateUI();
        return;
      }
```

`backward` 分岐にも同じ割り込みを入れる。`state.x += DX[backDir];` の前へ:

```js
      const backX = state.x + DX[backDir];
      const backY = state.y + DY[backDir];
      const backTrap = state.map[backY]?.[backX]?.trap;
      if (backTrap && backTrap.state === "discovered") {
        startTrapEncounter(backTrap, { x: backX, y: backY });
        saveAutosave();
        updateUI();
        return;
      }
```

`hidden` の罠は察知に失敗しているので割り込まない。移動が完了し、
`processExplorationResolution` の後に発動する。そのために
`processExplorationResolution` の `detectAdjacentTraps()` 呼び出しの直前へ追加する:

```js
  // A trap that was never spotted fires without offering a choice.
  const steppedTrap = state.map[state.y]?.[state.x]?.trap;
  if (steppedTrap && steppedTrap.state === "hidden") {
    addLog("【⚠️罠発動！】不意に罠を踏み抜いてしまった！");
    steppedTrap.state = "disabled";
    if (state.currentRun) state.currentRun.trapsTriggered++;
    if (steppedTrap.type === "pitfall") {
      triggerPitfall(steppedTrap, false);
      return;
    }
    triggerTrap(steppedTrap, false);
  }
```

import に `triggerTrap` と `triggerPitfall` を追加する:

```js
import { detectAdjacentTraps, startTrapEncounter, triggerTrap, triggerPitfall } from "./systems/traps.js";
```

- [ ] **Step 7: UIから迂回ボタンを削除しラベルを差し替える**

`index.html` から `id="btn-trap-bypass"` の要素を削除する。

Run: `grep -n "btn-trap-bypass" index.html src/`
Expected: ヒットした全箇所を削除する（イベントハンドラの登録があればそれも）。

`src/ui/ui_root.js` のラベル設定を以下へ置き換える:

```js
    const isPitfall = trap.type === "pitfall";
    const btnDisarm = document.getElementById("btn-trap-disarm");
    const btnForce = document.getElementById("btn-trap-force");
    if (btnDisarm) btnDisarm.textContent = isPitfall ? "縁を伝う" : "解除する";
    if (btnForce) btnForce.textContent = isPitfall ? "飛び込む" : "強行突破";
```

- [ ] **Step 8: テストを実行して成功を確認**

Run: `node scratch/test_traps.js`
Expected: PASS

- [ ] **Step 9: スイート全体、ブラウザテスト、lint**

Run: `npm run test:unit && npm run test:browser && npm run lint`
Expected: 全て成功

- [ ] **Step 10: コミット**

```bash
git add src/systems/traps.js src/movement.js src/ui/ui_root.js index.html scratch/test_traps.js
git commit -m "feat: 罠の3択を再定義し迂回を削除

迂回は歩数5・エンカ25%の固定コストで罠難度と無相関だったため、
深層の支配戦略になっていた。迂回はマップを歩いて回り込む行為へ
還元し、強行は確定軽減ダメージ、落とし穴の強行は深度ショート
カットとする。罠マスへは進入前に判断を挟む。"
```

---

## Task 6: 生成側のチョーク配置

罠を深度に応じてチョークポイントへ寄せる。浅層は回り込める時間税、深層は逆らえない関所。

**Files:**
- Modify: `src/map_generator.js`
- Create: `scratch/sim_trap_choke.js`
- Test: `scratch/test_traps.js`

**Interfaces:**
- Consumes: Task 1 で `weakenLevel` を外した罠オブジェクト
- Produces:
  - `isChokeCell(grid, cell, start, stairsDown): boolean` — export する
  - `getTrapChokeRate(floor): number` — export する。0〜1の小数
  - `generateRandomMap(...)` の戻り値に `trapMeta: { total, choke, chokeTargeted }` を追加

- [ ] **Step 1: 失敗するテストを書く**

`scratch/test_traps.js` の末尾へ追加する。

```js
// 7. Choke-aware trap placement
console.log("\n[7] Verifying choke rate scaling:");
const { getTrapChokeRate } = await import("../src/map_generator.js");

const chokeCases = [
  [1, 0.1],
  [5, 0.26],
  [10, 0.46],
  [12, 0.55],
  [30, 0.55]
];
for (const [floor, expected] of chokeCases) {
  const actual = getTrapChokeRate(floor);
  if (Math.abs(actual - expected) > 0.001) {
    console.error(`FAIL: B${floor} choke rate should be ${expected}, got ${actual}.`);
    process.exit(1);
  }
}
console.log("- choke rate curve verified");

// Trap count must be capped at 16
console.log("\n[8] Verifying trap count cap:");
for (const floor of [1, 10, 30]) {
  const m = generateRandomMap(floor, null, `CAP_SEED_${floor}`);
  let count = 0;
  for (const row of m.grid) {
    for (const cell of row) if (cell.trap) count++;
  }
  const expected = Math.min(6 + floor, 16);
  if (count > 16) {
    console.error(`FAIL: B${floor} produced ${count} traps, cap is 16.`);
    process.exit(1);
  }
  console.log(`- B${floor}: ${count} traps (target ${expected})`);
  if (!m.trapMeta || typeof m.trapMeta.choke !== "number") {
    console.error("FAIL: generateRandomMap should report trapMeta.choke.");
    process.exit(1);
  }
}
console.log("PASS: Trap placement verified.");
```

既存のセクション `[1]` にある `Expected: 7` のアサート（`b1TrapCount !== 7`）はそのまま通る（B1は `min(7, 16) = 7`）。

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `node scratch/test_traps.js`
Expected: FAIL。`getTrapChokeRate is not a function`

- [ ] **Step 3: `isChokeCell` と `getTrapChokeRate` を実装**

`src/map_generator.js` の `getReachableCellKeys` の定義直後に追加する:

```js
// そのマスを塞ぐと下り階段へ到達できなくなるならチョークポイント。
// Tarjanの関節点は「グラフ全体を切る点」であって「スタートと階段を切る点」
// ではないため使わない。30x30・歩行可能セル数百なら総当たりBFSで足りる。
export function isChokeCell(grid, cell, start, stairsDown) {
  if (!stairsDown) return false;
  if (cell.x === start.x && cell.y === start.y) return false;

  const blocked = `${cell.x},${cell.y}`;
  const startKey = `${start.x},${start.y}`;
  if (blocked === startKey) return false;

  const queue = [start];
  const seen = new Set([startKey]);
  const targetKey = `${stairsDown.x},${stairsDown.y}`;

  for (const pos of queue) {
    const current = grid[pos.y]?.[pos.x];
    if (!current) continue;

    for (let dir = 0; dir < 4; dir++) {
      if (current.walls[dir] || !canEnterFrom(grid, pos.x, pos.y, dir)) continue;

      const nx = pos.x + DX[dir];
      const ny = pos.y + DY[dir];
      if (nx < 0 || nx >= getMapWidth(grid) || ny < 0 || ny >= getMapHeight(grid)) continue;

      const key = `${nx},${ny}`;
      if (key === blocked || seen.has(key)) continue;
      if (key === targetKey) return false;

      seen.add(key);
      queue.push({ x: nx, y: ny });
    }
  }

  return !seen.has(targetKey);
}

// 深度は無限スケールなので、B5でカンストする段階分類は使わず連続式にする。
// 上限0.55は必須。全てを関所にすると回避判断が消える。
export function getTrapChokeRate(floor) {
  const depth = Math.max(1, Math.floor(Number(floor) || 1));
  const raw = 0.10 + 0.04 * (depth - 1);
  return Math.round(Math.min(0.55, raw) * 1000) / 1000;
}
```

- [ ] **Step 4: 配置抽選を書き換える**

`src/map_generator.js` の罠配置部分（`shuffle(trapCandidates);` から
罠オブジェクトを書き込む for ループの終わりまで）を以下へ置き換える。
`trapCandidates` を集める部分より前は変更しない。

```js
  shuffle(trapCandidates);
  const trapCount = Math.min(options.trapCount ?? Math.min(6 + floor, 16), trapCandidates.length);

  const chokeTargeted = Math.round(trapCount * getTrapChokeRate(floor));
  const chokePool = [];
  const openPool = [];
  for (const candidate of trapCandidates) {
    if (chokePool.length < chokeTargeted && isChokeCell(grid, candidate, suCoord, stairsDownCoord)) {
      chokePool.push(candidate);
    } else {
      openPool.push(candidate);
    }
  }

  // チョーク候補が目標に届かない迷路形状もある。足りない分は通常候補で埋める。
  const chosen = chokePool.slice(0, chokeTargeted);
  for (const candidate of openPool) {
    if (chosen.length >= trapCount) break;
    chosen.push(candidate);
  }

  for (const spot of chosen) {
    const trapId = `trap_${floor}_${spot.x}_${spot.y}`;
```

以降の罠種別抽選とオブジェクト書き込みは既存のまま使う。ループ末尾の閉じ括弧を
新しい `for...of` に合わせる。ループ内で `spot` を参照している箇所はそのまま動く。

戻り値に `trapMeta` を足す:

```js
  return {
    grid,
    stairsDownCoord,
    bossCoord,
    wardenGate,
    rooms,
    trapMeta: {
      total: chosen.length,
      choke: chokePool.slice(0, chokeTargeted).length,
      chokeTargeted
    }
  };
```

`chosen` と `chokePool` は `return` から見えるスコープに宣言されている必要がある。
罠配置がブロックスコープの中にある場合は、`let trapMeta = { total: 0, choke: 0, chokeTargeted: 0 };`
を関数冒頭付近で宣言し、配置ブロックの末尾で代入して `return` では `trapMeta` を渡す。

- [ ] **Step 5: テストを実行して成功を確認**

Run: `node scratch/test_traps.js`
Expected: PASS

- [ ] **Step 6: 分布検証シミュレータを書く**

Create `scratch/sim_trap_choke.js`:

```js
const { generateRandomMap, getTrapChokeRate } = await import("../src/map_generator.js");

console.log("=== TRAP CHOKE DISTRIBUTION ===");
console.log("floor | traps | choke | actual | target | shortfall");

const FLOORS = [1, 3, 5, 8, 10, 12, 15, 20];
const SAMPLES = 100;

for (const floor of FLOORS) {
  let totalTraps = 0;
  let totalChoke = 0;
  let shortfalls = 0;

  for (let i = 0; i < SAMPLES; i++) {
    const map = generateRandomMap(floor, null, `CHOKE_SIM_${floor}_${i}`);
    const meta = map.trapMeta;
    totalTraps += meta.total;
    totalChoke += meta.choke;
    if (meta.choke < meta.chokeTargeted) shortfalls++;
  }

  const actualRate = totalChoke / totalTraps;
  const targetRate = getTrapChokeRate(floor);
  console.log(
    `B${String(floor).padStart(2)}   | ` +
    `${(totalTraps / SAMPLES).toFixed(1).padStart(5)} | ` +
    `${(totalChoke / SAMPLES).toFixed(1).padStart(5)} | ` +
    `${actualRate.toFixed(3).padStart(6)} | ` +
    `${targetRate.toFixed(3).padStart(6)} | ` +
    `${((shortfalls / SAMPLES) * 100).toFixed(0).padStart(3)}%`
  );
}

console.log("\nshortfall = チョーク候補が目標数に届かなかったフロアの割合");
console.log("目標との乖離が大きい、またはshortfallが5割を超える深度は要調整。");
```

- [ ] **Step 7: シミュレータを実行して分布を確認**

Run: `node scratch/sim_trap_choke.js`
Expected: 各深度で `actual` が `target` に近い値になる。B1で0.1前後、B10で0.46前後、B12以降で0.55前後。

shortfall が5割を超える深度があれば、その事実を実装ノートとして記録する。
迷路形状によってチョーク候補が構造的に不足していることを意味する。
本タスクでは式を変えず、観測結果の報告に留める。

- [ ] **Step 8: スイート全体と lint**

Run: `npm run test:unit && npm run lint`
Expected: 成功。`sim_` 接頭辞のためシミュレータはスイートに含まれない。

- [ ] **Step 9: コミット**

```bash
git add src/map_generator.js scratch/sim_trap_choke.js scratch/test_traps.js
git commit -m "feat: 罠を深度に応じてチョークポイントへ配置

浅層は回り込める時間税、深層は逆らえない関所とする。罠数は
16個で頭打ちにし、深層は数ではなくチョーク率で締める。
チョーク判定はスタート・階段間の到達性を直接見る総当たりBFS。"
```

---

## Task 7: 3択UIのブラウザ検証

迂回ボタンの消滅と落とし穴のラベル差し替えを実ブラウザで確認する。

**Files:**
- Create: `tests/verify-trap-choices.spec.js`

**Interfaces:**
- Consumes: Task 5 の UI 変更
- Produces: なし

- [ ] **Step 1: 既存のブラウザテストの書き方を読む**

Run: `cat tests/verify-chest-trap-ui.spec.js`
Expected: ページの起動方法、state の注入方法、セレクタの慣習を把握する。以降のステップは
このファイルの流儀に合わせて書く。

- [ ] **Step 2: テストを書く**

Create `tests/verify-trap-choices.spec.js`。
`verify-chest-trap-ui.spec.js` と同じ setup（ページ起動、`window.__state` 等の注入経路）を使い、
以下3点を検証する。

1. 迂回ボタンが DOM に存在しないこと

```js
await expect(page.locator("#btn-trap-bypass")).toHaveCount(0);
```

2. 通常罠のエンカウント時、解除ボタンが「解除する」、強行ボタンが「強行突破」になること

```js
await expect(page.locator("#btn-trap-disarm")).toHaveText("解除する");
await expect(page.locator("#btn-trap-force")).toHaveText("強行突破");
```

3. 落とし穴のエンカウント時、それぞれ「縁を伝う」「飛び込む」になること

```js
await expect(page.locator("#btn-trap-disarm")).toHaveText("縁を伝う");
await expect(page.locator("#btn-trap-force")).toHaveText("飛び込む");
```

罠エンカウントの状態を作るには、`state.map` に `state: "discovered"` の罠を置き、
プレイヤーをその隣に立たせて前進させる。`verify-chest-trap-ui.spec.js` が
state を注入している方法をそのまま流用する。

- [ ] **Step 3: ブラウザテストを実行**

Run: `npx playwright test tests/verify-trap-choices.spec.js`
Expected: PASS

- [ ] **Step 4: 全テストと lint**

Run: `npm run test && npm run lint`
Expected: 成功

- [ ] **Step 5: コミット**

```bash
git add tests/verify-trap-choices.spec.js
git commit -m "test: 罠3択UIのブラウザ検証を追加

迂回ボタンの消滅と、落とし穴時のラベル差し替えを確認する。"
```

---

## Task 8: 設計docの状態更新

**Files:**
- Modify: `docs/superpowers/specs/2026-07-20-trap-choice-redesign-design.md`

**Interfaces:**
- Consumes: Task 1〜7 の完了
- Produces: なし

- [ ] **Step 1: 状態行を更新**

ヘッダの `状態: 設計のみ（実装は別途指示）` を以下へ変更する:

```markdown
状態: 実装済み
```

- [ ] **Step 2: Task 6 Step 7 の観測結果を追記**

`## 2. 生成 — チョーク率の制御` の `### フォールバック` 節の末尾へ、
`scratch/sim_trap_choke.js` の実測値を追記する。深度ごとの
target / actual / shortfall の表を貼る。

- [ ] **Step 3: コミット**

```bash
git add docs/superpowers/specs/2026-07-20-trap-choice-redesign-design.md
git commit -m "docs: 罠3択再設計を実装済みに更新"
```

---

## Self-Review メモ

**spec カバレッジ**

| spec セクション | タスク |
| --- | --- |
| 1. 削除範囲 | Task 1 |
| 2. 生成 — チョーク率の制御 | Task 6 |
| 3. 察知と表示 | Task 3（察知）、Task 4（表示） |
| 4. 3択の数値設計 | Task 2（率式）、Task 5（分岐） |
| 5. モジュール構成 | Task 2（`trap_rules.js` 切り出し） |
| 6. テスト | Task 2, 5, 6, 7 |
| 7. 実装順 | タスク順がそのまま対応 |
| 8. 既存docへの影響 | Task 8 |

**未解決の注意点**

- spec は `calculateDetectRate` に traceRead を渡さない設計だが、`detectAdjacentTraps` は
  ログの詳細度と `revealLevel` の設定に traceRead を使う。率には影響しない
- `disarmBonus` アフィックスは `src/data/affixes.js` に未定義の可能性がある。
  Task 2 Step 5 の `getPartyMaxAffix(state.party, "disarmBonus")` は未定義時に
  0 を返すため動作するが、アフィックス自体の追加は本計画のスコープ外
- `trap.difficulty` は生成側に残るが率には使われなくなる。将来の再利用に備えて
  フィールドは残す
