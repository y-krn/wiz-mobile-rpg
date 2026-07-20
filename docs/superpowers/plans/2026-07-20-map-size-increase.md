# マップ拡大と宝箱調整 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ダンジョンマップを各階層テンプレで +6 セル拡大し、宝箱を 8〜12 個の
ランダム配置に変え、宝箱のミニマップ予兆表示を廃止する。

**Architecture:** マップ寸法は `src/constants/map.js` の定数と
`src/data/floor_templates.js` のテンプレ `size` で決まる。この 2 箇所の値を
書き換えるだけでサイズ拡大は完結する。宝箱数は `src/map_generator.js` の
`generateRandomMap` 内にハードコードされた `6` を、同関数内の `rng` で引く
8〜12 の抽選に置き換える。予兆表示は `src/renderer.js` のミニマップ・オーラ
描画ループから `EVENT_TYPES.CHEST` 分岐を取り除く。

**Tech Stack:** Vanilla JS (ES modules), Vite, Playwright, `scratch/run_tests.js`
による自前ユニットテストランナー、ESLint / Stylelint。

## Global Constraints

- 設計書: `docs/superpowers/specs/2026-07-20-map-size-increase-design.md`
- マップ寸法: shallow 24x24 / middle 27x27 / deep 30x30
- 宝箱数レンジ: 8 以上 12 以下（両端を含む整数）
- 泉 2 個・石板 2 個は据え置き
- 罠密度: shallow 7 / middle 9 / deep 11
- 部屋数・隠し扉・一方通行・`criticalPathRange` は変更しない
- ミニマップのオーラは階段（橙）・ボス／中ボス（赤）・泉／石板／商人など
  （紫）を維持し、宝箱（黄）のみ削除する
- 乱数は必ず既存の `rng` 経由で引く（`Math.random` を直接呼ばない）。
  シード再現性が既存テストで検証されている。
- 新規・変更テストは `scratch/test_*.js` に置き、失敗を集約して
  `process.exit(1)` する形式にする（`console.assert` 単独は禁止）
- `main` へ直接コミットしない。作業ブランチ上で進める。

---

## File Structure

- `src/constants/map.js` — マップ寸法とフォールバック開始座標の定数（変更）
- `src/data/floor_templates.js` — 階層テンプレの `size` と罠密度（変更）
- `src/map_generator.js` — 宝箱・泉・石板の配置ロジック（変更）
- `src/renderer.js` — ミニマップのオーラ描画（変更）
- `scratch/test_map_size.js` — 階層別マップ寸法の回帰テスト（新規）
- `scratch/test_chest_count.js` — 宝箱数レンジとシード再現性のテスト（新規）
- `scratch/test_stairs_min_distance.js` — ハードコードされた `GRID_SIZE = 24`
  を定数参照に変更（変更）

---

### Task 1: マップ寸法の拡大

**Files:**
- Modify: `src/constants/map.js`
- Modify: `src/data/floor_templates.js:8`, `:24`（`size` の 2 箇所）
- Modify: `scratch/test_stairs_min_distance.js:7`
- Test: `scratch/test_map_size.js`（新規）

**Interfaces:**
- Consumes: なし（最初のタスク）
- Produces: `MAP_WIDTH = 30`, `MAP_HEIGHT = 30`, `START_Y = 28`
  (`src/constants/map.js` からの named export)。
  `FLOOR_TEMPLATES` の各要素の `size` は `{ width, height }` で
  shallow 24 / middle 27 / deep 30。

- [ ] **Step 1: 失敗するテストを書く**

`scratch/test_map_size.js` を新規作成:

```javascript
import { MAP_HEIGHT, MAP_WIDTH, START_X, START_Y } from "../src/constants/map.js";
import { getFloorTemplate } from "../src/data/floor_templates.js";
import { generateRunFloor } from "../src/run_map_generator.js";

const EXPECTED_TEMPLATE_SIZES = Object.freeze({
  shallow: 24,
  middle: 27,
  deep: 30
});
const SAMPLE_FLOORS = [1, 5, 10, 11, 15, 20, 21, 25, 30];
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

check(MAP_WIDTH === 30, `MAP_WIDTH expected 30 but got ${MAP_WIDTH}`);
check(MAP_HEIGHT === 30, `MAP_HEIGHT expected 30 but got ${MAP_HEIGHT}`);
check(
  START_X >= 1 && START_X <= MAP_WIDTH - 2,
  `START_X out of bounds: ${START_X}`
);
check(
  START_Y >= 1 && START_Y <= MAP_HEIGHT - 2,
  `START_Y out of bounds: ${START_Y}`
);

for (const floor of SAMPLE_FLOORS) {
  const template = getFloorTemplate(floor);
  const expected = EXPECTED_TEMPLATE_SIZES[template.id];
  check(
    template.size.width === expected && template.size.height === expected,
    `floor ${floor} (${template.id}) size expected ${expected}x${expected} `
      + `but got ${template.size.width}x${template.size.height}`
  );

  const generated = generateRunFloor({ runSeed: `MAP-SIZE-${floor}`, floor });
  const grid = generated.grid;
  check(
    grid.length === expected,
    `floor ${floor} generated height expected ${expected} but got ${grid.length}`
  );
  check(
    grid.every(row => row.length === expected),
    `floor ${floor} generated width is not uniformly ${expected}`
  );
}

if (failures.length > 0) {
  failures.forEach(failure => console.error(`[FAIL] ${failure}`));
  process.exit(1);
}

console.log(`[PASS] map size: ${SAMPLE_FLOORS.length} floors match template sizes 24/27/30.`);
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `node scratch/test_map_size.js`
Expected: FAIL。`MAP_WIDTH expected 30 but got 24` と、shallow / middle の
`size expected 24x24 but got 18x18` などが出力され、終了コード 1。

- [ ] **Step 3: 定数を書き換える**

`src/constants/map.js` の全内容を次に置き換える:

```javascript
export const MAP_WIDTH = 30;
export const MAP_HEIGHT = 30;

export const START_X = 1;
export const START_Y = 28;
```

- [ ] **Step 4: テンプレの size を書き換える**

`src/data/floor_templates.js` の `shallow` テンプレ:

```javascript
    size: Object.freeze({ width: 24, height: 24 }),
```

同ファイルの `middle` テンプレ:

```javascript
    size: Object.freeze({ width: 27, height: 27 }),
```

`deep` テンプレの `size: Object.freeze({ width: MAP_WIDTH, height: MAP_HEIGHT })`
は変更しない（定数経由で自動的に 30x30 になる）。

- [ ] **Step 5: 既存テストのハードコード寸法を定数参照に直す**

`scratch/test_stairs_min_distance.js` の 1 行目の import 文の直後に定数
import を足し、`GRID_SIZE` の定義を差し替える。

変更前:

```javascript
import { generateRandomMap } from "../src/map_generator.js";
```

変更後:

```javascript
import { generateRandomMap } from "../src/map_generator.js";
import { MAP_WIDTH } from "../src/constants/map.js";
```

変更前:

```javascript
const GRID_SIZE = 24;
```

変更後:

```javascript
const GRID_SIZE = MAP_WIDTH;
```

- [ ] **Step 6: テストを実行して成功を確認**

Run: `node scratch/test_map_size.js`
Expected: PASS。`[PASS] map size: 9 floors match template sizes 24/27/30.`

- [ ] **Step 7: 既存のマップ関連テストを実行**

Run: `node scratch/test_map_reachability.js && node scratch/test_stairs_min_distance.js && node scratch/test_room_generation.js && node scratch/test_maze_diversity.js`
Expected: いずれも `[PASS]` を出力し、終了コード 0。
失敗した場合は、その原因が拡大したマップ寸法に対する古い閾値かどうかを
確認し、閾値であればコメント付きで更新する。生成ロジックの破綻であれば
修正する。

- [ ] **Step 8: コミット**

```bash
git add src/constants/map.js src/data/floor_templates.js scratch/test_map_size.js scratch/test_stairs_min_distance.js
git commit -m "feat: enlarge dungeon maps to 24/27/30 per floor template"
```

---

### Task 2: 宝箱数を 8〜12 のランダムに

**Files:**
- Modify: `src/map_generator.js:1450-1480`（宝箱・泉・石板の配置とフォールバック）
- Test: `scratch/test_chest_count.js`（新規）

**Interfaces:**
- Consumes: Task 1 の `MAP_WIDTH` / `MAP_HEIGHT` と拡大済みテンプレ `size`
- Produces: `generateRandomMap` / `generateRunFloor` が返す grid 上の
  `event === "chest"` セル数が 8 以上 12 以下になる（行き止まりと通路の
  合計がそれ未満の極端なケースを除く）。既存の関数シグネチャは変えない。

- [ ] **Step 1: 失敗するテストを書く**

`scratch/test_chest_count.js` を新規作成:

```javascript
import { EVENT_TYPES } from "../src/data.js";
import { getFloorTemplate } from "../src/data/floor_templates.js";
import { generateRunFloor } from "../src/run_map_generator.js";

// 行き止まりに置かれる宝箱の抽選レンジ。隠し部屋も 75% の確率で宝箱、
// 25% で石板を追加するため (map_generator.js の placeSecretRooms)、
// 総数の上限はテンプレの secretDoors.room の分だけ広がる。
const MIN_CHESTS = 8;
const MAX_CHESTS = 12;
const SAMPLE_FLOORS = [1, 8, 15, 22, 28];
const SEEDS_PER_FLOOR = 20;
const failures = [];
const observedCounts = new Set();

function countEvent(grid, eventType) {
  let count = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (cell.event === eventType) count++;
    }
  }
  return count;
}

for (const floor of SAMPLE_FLOORS) {
  const secretRoomCount = getFloorTemplate(floor).gimmickDensity.secretDoors.room;

  for (let index = 0; index < SEEDS_PER_FLOOR; index++) {
    const runSeed = `CHEST-COUNT-${floor}-${index}`;
    const generated = generateRunFloor({ runSeed, floor });
    const chests = countEvent(generated.grid, EVENT_TYPES.CHEST);
    observedCounts.add(chests);

    const maxChests = MAX_CHESTS + secretRoomCount;
    if (chests < MIN_CHESTS || chests > maxChests) {
      failures.push(`${runSeed}: chest count ${chests} outside ${MIN_CHESTS}-${maxChests}`);
    }

    const springs = countEvent(generated.grid, EVENT_TYPES.SPRING);
    const tablets = countEvent(generated.grid, EVENT_TYPES.TABLET);
    const maxTablets = 2 + secretRoomCount;
    if (springs !== 2) failures.push(`${runSeed}: spring count ${springs} expected 2`);
    if (tablets < 2 || tablets > maxTablets) {
      failures.push(`${runSeed}: tablet count ${tablets} outside 2-${maxTablets}`);
    }

    const repeated = generateRunFloor({ runSeed, floor });
    const repeatedChests = countEvent(repeated.grid, EVENT_TYPES.CHEST);
    if (repeatedChests !== chests) {
      failures.push(`${runSeed}: chest count not reproducible (${chests} vs ${repeatedChests})`);
    }
  }
}

if (observedCounts.size < 2) {
  failures.push(`chest count is not randomized: only ${[...observedCounts].join(",")} observed`);
}

if (failures.length > 0) {
  failures.forEach(failure => console.error(`[FAIL] ${failure}`));
  process.exit(1);
}

console.log(
  `[PASS] chest count: ${SAMPLE_FLOORS.length * SEEDS_PER_FLOOR} floors within `
    + `${MIN_CHESTS}-${MAX_CHESTS} (+secret rooms), `
    + `observed values ${[...observedCounts].sort((a, b) => a - b).join(",")}.`
);
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `node scratch/test_chest_count.js`
Expected: FAIL。各シードで `chest count 6 outside 8-...`（隠し部屋の当たり方に
より 6〜8 個が観測される）が並び、末尾に `chest count is not randomized` が
出ることもある。終了コード 1。

- [ ] **Step 3: 宝箱数レンジ定数を追加**

`src/map_generator.js` の既存 export 定数群の近く（`ONE_WAY_MIN_DETOUR` /
`ONE_WAY_MAX_DETOUR` を定義している 22-23 行目の直後）に追加する:

```javascript
export const CHEST_COUNT_RANGE = [8, 12];
```

- [ ] **Step 4: 配置ロジックを書き換える**

`src/map_generator.js` の宝箱配置部分（`// 6. Place chest events randomly at dead ends`
のコメント直後）を書き換える。

変更前:

```javascript
  const chestCount = Math.min(6, deadEnds.length);
  for (let i = 0; i < chestCount; i++) {
```

変更後:

```javascript
  const targetChestCount = CHEST_COUNT_RANGE[0] +
    Math.floor(rng() * (CHEST_COUNT_RANGE[1] - CHEST_COUNT_RANGE[0] + 1));
  const chestCount = Math.min(targetChestCount, deadEnds.length);
  for (let i = 0; i < chestCount; i++) {
```

同じ関数内のフォールバック計算も書き換える。

変更前:

```javascript
  let totalChestNeeded = 6 - chestCount;
```

変更後:

```javascript
  let totalChestNeeded = targetChestCount - chestCount;
```

泉・石板のループ（`for (let i = chestCount; i < Math.min(chestCount + 2, ...`
と `for (let i = chestCount + 2; i < Math.min(chestCount + 4, ...`）、および
`totalSpringNeeded` / `totalTabletNeeded` は変更しない。

- [ ] **Step 5: テストを実行して成功を確認**

Run: `node scratch/test_chest_count.js`
Expected: PASS。`[PASS] chest count: 100 floors within 8-12, observed values ...`
（observed values に複数の数値が並ぶこと）。

- [ ] **Step 6: 期待値を反転させてテストの実効性を確認**

`scratch/test_chest_count.js` の `const MAX_CHESTS = 12;` を一時的に
`const MAX_CHESTS = 7;` に変え、実行する。

Run: `node scratch/test_chest_count.js`
Expected: FAIL（`chest count ... outside 8-7` が出て終了コード 1）。
確認できたら `12` に戻し、もう一度実行して PASS になることを確認する。

- [ ] **Step 7: 到達性テストを実行**

Run: `node scratch/test_map_reachability.js`
Expected: `[PASS]`。増えた宝箱がすべて到達可能なセルに置かれていること。

- [ ] **Step 8: コミット**

```bash
git add src/map_generator.js scratch/test_chest_count.js
git commit -m "feat: randomize chest count between 8 and 12"
```

---

### Task 3: 罠密度の控えめな増量

**Files:**
- Modify: `src/data/floor_templates.js`（3 テンプレの `gimmickDensity.traps`）
- Test: `scratch/test_map_size.js`（Task 1 で作成したファイルに追記）

**Interfaces:**
- Consumes: Task 1 の `FLOOR_TEMPLATES`
- Produces: `FLOOR_TEMPLATES` の `gimmickDensity.traps` が
  shallow 7 / middle 9 / deep 11

- [ ] **Step 1: 失敗するテストを追記**

`scratch/test_map_size.js` の `EXPECTED_TEMPLATE_SIZES` 定義の直後に、
罠密度の期待値を追加する:

```javascript
const EXPECTED_TEMPLATE_TRAPS = Object.freeze({
  shallow: 7,
  middle: 9,
  deep: 11
});
```

同ファイルの `for (const floor of SAMPLE_FLOORS) {` ループ内、
`const expected = EXPECTED_TEMPLATE_SIZES[template.id];` の次の行に追加する:

```javascript
  const expectedTraps = EXPECTED_TEMPLATE_TRAPS[template.id];
  check(
    template.gimmickDensity.traps === expectedTraps,
    `floor ${floor} (${template.id}) traps expected ${expectedTraps} `
      + `but got ${template.gimmickDensity.traps}`
  );
```

最後の成功ログも差し替える。

変更前:

```javascript
console.log(`[PASS] map size: ${SAMPLE_FLOORS.length} floors match template sizes 24/27/30.`);
```

変更後:

```javascript
console.log(
  `[PASS] map size and trap density: ${SAMPLE_FLOORS.length} floors match `
    + `sizes 24/27/30 and traps 7/9/11.`
);
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `node scratch/test_map_size.js`
Expected: FAIL。`floor 1 (shallow) traps expected 7 but got 5` など。

- [ ] **Step 3: 罠密度を書き換える**

`src/data/floor_templates.js` の各 `gimmickDensity` 内の `traps` を変更する。

`shallow`:

```javascript
      traps: 7
```

`middle`:

```javascript
      traps: 9
```

`deep`:

```javascript
      traps: 11
```

`oneWayPassages` と `secretDoors` は変更しない。

- [ ] **Step 4: テストを実行して成功を確認**

Run: `node scratch/test_map_size.js`
Expected: PASS。`[PASS] map size and trap density: 9 floors match sizes 24/27/30 and traps 7/9/11.`

- [ ] **Step 5: 罠を含む到達性テストを実行**

Run: `node scratch/test_map_reachability.js`
Expected: `[PASS]`。到達性チェックは `cell.trap` を必須セル扱いするため、
増えた罠がすべて到達可能であることが検証される。

- [ ] **Step 6: コミット**

```bash
git add src/data/floor_templates.js scratch/test_map_size.js
git commit -m "feat: raise trap density to 7/9/11 per floor template"
```

---

### Task 4: 宝箱のミニマップ予兆を削除

**Files:**
- Modify: `src/renderer.js:1006-1039`（オーラ描画の `hasEvent` 判定と黄グロー分岐）
- Test: `tests/ui-ux.spec.js` は変更しない（既存の回帰確認のみ）

**Interfaces:**
- Consumes: Task 2 の宝箱配置（`event === EVENT_TYPES.CHEST`）
- Produces: ミニマップのオーラ描画対象から宝箱が外れる。他のイベント
  （泉・石板・商人・帰還ポータル・キャンプ）と階段・ボスのオーラは不変。

- [ ] **Step 1: `hasEvent` 判定から宝箱を除く**

`src/renderer.js` のミニマップ・オーラ描画ループ内。

変更前:

```javascript
        const hasEvent = cell.event === EVENT_TYPES.CHEST || 
                          cell.event === EVENT_TYPES.SPRING || 
                          cell.event === EVENT_TYPES.CAMP ||
                          cell.event === EVENT_TYPES.TABLET || 
                          cell.event === EVENT_TYPES.MERCHANT || 
                          cell.event === EVENT_TYPES.RETURN_PORTAL ||
                          cell.event === EVENT_TYPES.MIDBOSS || 
                          cell.event === EVENT_TYPES.BOSS;
```

変更後:

```javascript
        const hasEvent = cell.event === EVENT_TYPES.SPRING || 
                          cell.event === EVENT_TYPES.CAMP ||
                          cell.event === EVENT_TYPES.TABLET || 
                          cell.event === EVENT_TYPES.MERCHANT || 
                          cell.event === EVENT_TYPES.RETURN_PORTAL ||
                          cell.event === EVENT_TYPES.MIDBOSS || 
                          cell.event === EVENT_TYPES.BOSS;
```

- [ ] **Step 2: 宝箱の黄グロー分岐を削除**

同じループ内の分岐から、宝箱専用の `else if` ブロックを丸ごと削除する。

削除対象:

```javascript
        } else if (cell.event === EVENT_TYPES.CHEST) {
          // Yellow glow for chest
          ctx.fillStyle = "rgba(255, 235, 59, 0.14)";
          ctx.beginPath();
          ctx.arc(screenX + cellS / 2, screenY + cellS / 2, cellS * 0.9, 0, Math.PI * 2);
          ctx.fill();
```

削除後、ボス／中ボスの分岐の直後に紫グローの `} else {` ブロックが続く形に
なる:

```javascript
        } else if (cell.event === EVENT_TYPES.BOSS || cell.event === EVENT_TYPES.MIDBOSS) {
          // Pulsing red glow for boss/midboss
          const pulse = 0.14 + 0.08 * Math.sin(Date.now() / 200);
          ctx.fillStyle = `rgba(255, 59, 48, ${pulse})`;
          ctx.beginPath();
          ctx.arc(screenX + cellS / 2, screenY + cellS / 2, cellS * 1.3, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Purple glow for mystery events (spring, tablet, merchant)
          ctx.fillStyle = "rgba(191, 90, 242, 0.14)";
          ctx.beginPath();
          ctx.arc(screenX + cellS / 2, screenY + cellS / 2, cellS * 0.9, 0, Math.PI * 2);
          ctx.fill();
        }
```

- [ ] **Step 3: `EVENT_TYPES.CHEST` の他の用途が残っているか確認**

Run: `grep -n "EVENT_TYPES.CHEST" src/renderer.js`
Expected: オーラ描画ループ内にヒットが残らないこと。ヒットがあれば、それが
3D ビューの宝箱描画など別用途であることを確認する（別用途なら残す）。

- [ ] **Step 4: Lint とビルド**

Run: `npm run lint`
Expected: エラーなし。未使用変数の警告が出た場合は該当箇所を整理する。

Run: `npm run build`
Expected: ビルド成功。

- [ ] **Step 5: コミット**

```bash
git add src/renderer.js
git commit -m "feat: remove chest omen from minimap aura"
```

---

### Task 5: 全体検証

**Files:**
- Modify: なし（検証のみ。失敗が出た場合のみ該当ファイルを修正）
- Test: 全ユニットテスト + ブラウザテスト

**Interfaces:**
- Consumes: Task 1-4 の全変更
- Produces: なし（検証結果の報告）

- [ ] **Step 1: 全ユニットテストを実行**

Run: `npm run test:unit 2>&1 | grep -E "FAIL|Error|All tests passed"`
Expected: `All tests passed successfully!`。
`[FAIL]` が出た場合は該当テストを個別実行して原因を切り分ける。マップ寸法
前提のハードコード値が原因なら定数参照に直す。

- [ ] **Step 2: セーブ移行の健全性を確認**

Run: `grep -n "MAP_WIDTH\|MAP_HEIGHT" src/state/save_migrations.js src/state/save_storage.js src/state/initial_state.js`
Expected: ヒットした各箇所を読み、旧サイズ（18/21/24）の grid を読み込んだ
ときに境界外アクセスや座標の誤クランプが起きないことを確認する。定数を
grid の実寸ではなく期待寸法として使っている箇所があれば、`grid.length` /
`grid[0].length` 参照に直し、その修正を含めてコミットする。

- [ ] **Step 3: ブラウザテストを実行**

Run: `npm run test:browser 2>&1 | tail -20`
Expected: 全 spec が pass。失敗した場合はレポートの該当箇所のみを読む。

- [ ] **Step 4: モバイル幅でミニマップを目視確認**

`npm run dev` で開発サーバを起動し、360x800 / 390x844 / 430x932 で
ダンジョンに入り、次を確認する:

- ミニマップが 30x30 でも自機中心に追従し、横スクロールが発生しない
- 宝箱セルの黄色いオーラが表示されない
- 泉・石板の紫オーラ、階段の橙オーラ、ボスの赤オーラは表示される

- [ ] **Step 5: 変更内容をコミット（Step 2 で修正した場合のみ）**

```bash
git add -A
git commit -m "fix: use grid dimensions instead of map constants in save migration"
```

- [ ] **Step 6: PR 作成**

```bash
gh pr create --title "feat: enlarge maps, randomize chest count, drop chest omen" --body "$(cat <<'EOF'
## 変更内容

- マップ寸法を各階層テンプレで +6（shallow 24x24 / middle 27x27 / deep 30x30）
- 宝箱数を固定 6 個から 8〜12 個のランダムに変更
- 罠密度を 5/7/9 から 7/9/11 に控えめに増量
- 宝箱のミニマップ予兆（黄色オーラ）を削除

設計書: `docs/superpowers/specs/2026-07-20-map-size-increase-design.md`

## 検証

- `npm run lint`
- `npm run test:unit`
- `npm run build`
- `npm run test:browser`
- 360x800 / 390x844 / 430x932 でミニマップ表示を目視確認
EOF
)"
```

---

## 補足: 再ベースラインが必要になり得るシミュレーション

`scratch/sim_run_floor_templates.js` の `SHAPE_LIMITS`（行き止まり数の下限、
タイト U ターン数の上限）は 18/21/24 時代の origin/main を基準にしている。
これは `sim_` 接頭辞のため `npm run test:unit` には含まれず、CI も落ちない。
マップ拡大後に手動で走らせる場合は、行き止まり数が増える方向に動くため下限は
満たすが、タイト U ターン数の上限を超える可能性がある。超えた場合は、実測値を
基準にコメント付きで上限を更新する（生成ロジックは変更しない）。
