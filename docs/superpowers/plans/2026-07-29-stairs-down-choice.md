# 下り階段の降下を選択制にする 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 下り階段のマスに進入したとき、降りるか降りずに探索を続けるかを選択できるようにする。

**Architecture:** `checkCellEvents` の `stairs-down` 分岐を即時 `descendToFloor` から
`openGuardedSubmenu("stairs_down", ...)` に置き換える。サブメニューの中身は
`src/menu/milestone_portal.js` と同型の 2 択レンダラを新規追加し、
`src/menu/submenu_router.js` に登録する。泉・野営地・石碑・商人・帰還ポータルと
まったく同じイベント処理パターンに揃える。

**Tech Stack:** バニラ JavaScript (ES Modules), Vite, Playwright, Node の
`node:assert` によるスクラッチ単体テスト。

設計書: `docs/superpowers/specs/2026-07-29-stairs-down-choice-design.md`

## Global Constraints

- 応答・コミットメッセージ・ログ文言は日本語。
- `AGENTS.md` のルールに従う。`main` に直接コミットしない。作業はブランチ + PR。
- 既存のコード構造・命名・スタイルに合わせる。新しい抽象を作らない。
- ソース変更後は必ず `npm run lint` を実行して結果を確認する。
- UI に影響する変更なので `npm run build` と `npm run test:browser` も実行する。
- スクラッチテストは失敗を集計して `process.exit(1)` する形式にする。
  裸の `console.assert` や無条件の `[PASS]` 出力は禁止。
- 新規テストは一度期待値を反転させて実際に失敗することを確認してから戻す。
- サブメニューのボタンは既存の `btn btn-neon btn-block` / `btn btn-block`
  クラスを使う。新規 CSS は追加しない。

---

### Task 1: 下り階段の進入をサブメニューに置き換える

**Files:**
- Create: `src/menu/stairs_down.js`
- Modify: `src/movement.js:447-456`（`checkCellEvents` の `stairs-down` 分岐）
- Modify: `src/movement.js:7`（`getFloorLabel` の import 追加）
- Modify: `src/menu/submenu_router.js:1-32`（レンダラの import と登録）
- Test: `scratch/test_stairs_down_choice.js`（新規）

**Interfaces:**
- Consumes: `descendToFloor(nextFloor, landingCoord = null, isPitfall = false, onLanding = null)`
  （`src/movement.js`）、`closeSubmenu()`（`src/navigation.js`）、
  `getFloorLabel(stateInstance, floor)`（`src/data/floor_themes.js`）、
  `openGuardedSubmenu(type, title)`（`src/navigation.js`）
- Produces: `renderStairsDown(optGrid)`（`src/menu/stairs_down.js` から名前付き export）。
  サブメニュー種別の文字列は `"stairs_down"`。Task 2 と Task 3 がこの
  種別文字列に依存する。

- [ ] **Step 1: 失敗するテストを書く**

`scratch/test_stairs_down_choice.js` を新規作成する。

```js
import { strict as assert } from "node:assert";
import { createDefaultCurrentRun, createSoloCharacter, state } from "../src/state.js";
import { menuContext } from "../src/navigation.js";
import { checkCellEvents } from "../src/movement.js";

let failures = 0;
function check(label, test) {
  try {
    test();
    console.log(`[PASS] ${label}`);
  } catch (error) {
    failures++;
    console.error(`[FAIL] ${label}`);
    console.error(error);
  }
}

function createElementStub() {
  return { style: {}, textContent: "", className: "", replaceChildren: () => {} };
}

function withDocumentStub(fn) {
  const originalDocument = global.document;
  global.document = { getElementById: () => createElementStub() };
  try {
    return fn();
  } finally {
    global.document = originalDocument;
  }
}

function setupStairsCell(floor) {
  state.party = [createSoloCharacter("Fighter")];
  state.floor = floor;
  state.maps[floor - 1] = [[{ type: "stairs-down", event: null }]];
  state.map = state.maps[floor - 1];
  state.x = 0;
  state.y = 0;
  state.gameState = "explore";
  state.currentRun = createDefaultCurrentRun();
  state.logs = [];
}

check("下り階段に入ってもフロアは変わらず選択サブメニューが開く", () => {
  withDocumentStub(() => {
    setupStairsCell(2);
    checkCellEvents();
    assert.equal(state.gameState, "submenu");
    assert.equal(menuContext.type, "stairs_down");
    assert.equal(state.floor, 2);
    assert.equal(state.x, 0);
    assert.equal(state.y, 0);
  });
});

check("節目フロアでボス未撃破なら封印ログのみでサブメニューは開かない", () => {
  withDocumentStub(() => {
    setupStairsCell(5);
    state.currentRun.defeatedMilestones = [];
    checkCellEvents();
    assert.equal(state.gameState, "explore");
    assert.equal(state.floor, 5);
    assert.match(state.logs.at(-1), /下り階段は封じられている/);
  });
});

check("節目フロアでもボス撃破済みなら選択サブメニューが開く", () => {
  withDocumentStub(() => {
    setupStairsCell(5);
    state.currentRun.defeatedMilestones = [5];
    checkCellEvents();
    assert.equal(state.gameState, "submenu");
    assert.equal(menuContext.type, "stairs_down");
    assert.equal(state.floor, 5);
  });
});

if (failures > 0) {
  console.error(`${failures} stairs down choice checks failed`);
  process.exit(1);
}
```

`createElementStub` は `src/navigation.js` の `openSubmenu` が触るプロパティを
最低限そろえたもの。`openSubmenu` が要素の中身を空にする方法を変えている場合は、
`scratch/test_save.js` の既存スタブに合わせて不足プロパティを足す。

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `node scratch/test_stairs_down_choice.js`

Expected: 1 番目と 3 番目のチェックが `[FAIL]`。現状は階段に入ると
`descendToFloor` が走るため `state.gameState` は `"explore"` のままで
`state.floor` が進む。終了コードは 1。

- [ ] **Step 3: サブメニューのレンダラを作る**

`src/menu/stairs_down.js` を新規作成する。既存の
`src/menu/milestone_portal.js` と同じ構造にそろえる。子要素の消去だけは
`replaceChildren()` を使う（`milestone_portal.js` は空文字を `innerHTML` に
代入しているが、同じ動作でより安全な API があるため新規ファイルではそちらを使う。
既存ファイルは書き換えない）。

```js
import { getFloorLabel } from "../data/floor_themes.js";
import { descendToFloor } from "../movement.js";
import { closeSubmenu } from "../navigation.js";
import { state } from "../state.js";

export function renderStairsDown(optGrid) {
  optGrid.replaceChildren();
  const nextFloor = state.floor + 1;

  const descend = document.createElement("button");
  descend.type = "button";
  descend.className = "btn btn-neon btn-block";
  descend.textContent = `${getFloorLabel(state, nextFloor)}へ降りる`;
  descend.addEventListener("click", () => {
    closeSubmenu();
    descendToFloor(nextFloor);
  });

  const stay = document.createElement("button");
  stay.type = "button";
  stay.className = "btn btn-block";
  stay.textContent = "降りずに進む";
  stay.addEventListener("click", closeSubmenu);

  optGrid.append(descend, stay);
}
```

- [ ] **Step 4: ルータに登録する**

`src/menu/submenu_router.js` を編集する。`renderMilestonePortal` の import の
すぐ下に import を追加する。

```js
import { renderStairsDown } from "./stairs_down.js";
```

`SUBMENU_RENDERERS` の `milestone_portal` の行のすぐ下に登録を追加する。

```js
  stairs_down: (optGrid) => renderStairsDown(optGrid),
```

- [ ] **Step 5: 進入時の分岐を差し替える**

`src/movement.js` の 7 行目の import に `getFloorLabel` を足す。

変更前:

```js
import { getFloorTheme, revealFloor } from "./data/floor_themes.js";
```

変更後:

```js
import { getFloorLabel, getFloorTheme, revealFloor } from "./data/floor_themes.js";
```

`checkCellEvents` の `stairs-down` 分岐（447 行目付近）を差し替える。

変更前:

```js
  // Stairs Down (go to next floor)
  if (cell.type === "stairs-down") {
    if (state.floor % 5 === 0 && !state.currentRun?.defeatedMilestones?.includes(state.floor)) {
      addLog("節目ボスを倒すまで下り階段は封じられている。");
      playSound("bump");
      return;
    }
    descendToFloor(state.floor + 1);
    return;
  }
```

変更後:

```js
  // Stairs Down (ask before descending so corridors stay walkable)
  if (cell.type === "stairs-down") {
    if (state.floor % 5 === 0 && !state.currentRun?.defeatedMilestones?.includes(state.floor)) {
      addLog("節目ボスを倒すまで下り階段は封じられている。");
      playSound("bump");
      return;
    }
    openGuardedSubmenu("stairs_down", `${getFloorLabel(state, state.floor + 1)}への下り階段`);
    return;
  }
```

- [ ] **Step 6: テストを実行して通ることを確認する**

Run: `node scratch/test_stairs_down_choice.js`

Expected: 3 件すべて `[PASS]`、終了コード 0。

- [ ] **Step 7: テストが本当に効いていることを確認する**

Step 1 のテストの 1 番目のチェックの
`assert.equal(menuContext.type, "stairs_down");` を一時的に
`assert.equal(menuContext.type, "stairs_up");` に書き換えて
`node scratch/test_stairs_down_choice.js` を実行し、`[FAIL]` と終了コード 1 に
なることを確認する。確認できたら元に戻し、もう一度実行して 3 件 `[PASS]` に
戻ることを確認する。

- [ ] **Step 8: 単体テストスイート全体と lint を実行する**

Run: `npm run test:unit 2>&1 | tail -20`
Expected: 失敗なし。

Run: `npm run lint`
Expected: エラーなし。

- [ ] **Step 9: コミット**

```bash
git add src/menu/stairs_down.js src/menu/submenu_router.js src/movement.js scratch/test_stairs_down_choice.js
git commit -m "feat: 下り階段を降りるか進むか選べるようにする"
```

---

### Task 2: サブメニュー中のセーブ整合性を検証する

**Files:**
- Modify: `scratch/test_save.js`（import 行と、末尾の `check(...)` 群への追記）

**Interfaces:**
- Consumes: Task 1 が導入したサブメニュー種別 `"stairs_down"`、
  `createSavePayload()` / `applySavePayload(payload)`（`src/state/save_payload.js`）
- Produces: なし（テストのみ）

`resolvePersistedGameState` は `menuContext.prevGameState` が `"explore"` の
ときそれを返し、未設定でも既定で `"explore"` を返すため、実装側の変更は
不要な見込み。テストで実際にそうなることを固定する。

- [ ] **Step 1: テストを書く**

`scratch/test_save.js` の 5 行目付近の import を変更する。

変更前:

```js
import { menuContext } from "../src/navigation.js";
```

変更後:

```js
import { menuContext, openGuardedSubmenu } from "../src/navigation.js";
```

同ファイル末尾の `if (failures > 0) {` ブロックの**直前**に次のチェックを追加する。

```js
check("下り階段サブメニュー中のセーブはexploreに畳まれる", () => {
  const originalDocument = global.document;
  global.document = {
    getElementById: () => ({ style: {}, textContent: "", className: "", replaceChildren: () => {} })
  };
  try {
    state.party = [createSoloCharacter("Fighter")];
    state.floor = 3;
    state.gameState = "explore";
    state.currentRun = createDefaultCurrentRun();
    openGuardedSubmenu("stairs_down", "B4Fへの下り階段");
    assert.equal(state.gameState, "submenu");
    assert.equal(menuContext.type, "stairs_down");
    const payload = createSavePayload();
    assert.equal(payload.gameState, "explore");
    applySavePayload(payload);
    assert.equal(state.gameState, "explore");
  } finally {
    global.document = originalDocument;
  }
});
```

スタブのプロパティは `scratch/test_save.js` 内の既存スタブに合わせる。既存が
別のプロパティ集合を使っているなら、そちらをコピーして使う。

- [ ] **Step 2: テストを実行する**

Run: `node scratch/test_save.js 2>&1 | tail -10`
Expected: 追加したチェックを含めて全件 `[PASS]`、終了コード 0。

失敗する場合は `src/state/save_payload.js` の `resolvePersistedGameState` に
`stairs_down` を `"explore"` に畳む分岐が必要ということなので、追加してから
再実行する。

- [ ] **Step 3: テストが効いていることを確認する**

`assert.equal(payload.gameState, "explore");` を一時的に
`assert.equal(payload.gameState, "submenu");` に書き換えて
`node scratch/test_save.js 2>&1 | tail -10` を実行し、`[FAIL]` と
終了コード 1 になることを確認する。確認後に戻し、再実行して `[PASS]` に
戻ることを確認する。

- [ ] **Step 4: 単体テストスイート全体を実行する**

Run: `npm run test:unit 2>&1 | tail -20`
Expected: 失敗なし。

- [ ] **Step 5: コミット**

```bash
git add scratch/test_save.js
git commit -m "test: 下り階段サブメニュー中のセーブ復帰を固定する"
```

---

### Task 3: ブラウザで選択フローを検証する

**Files:**
- Modify: `tests/ui-ux.spec.js`（イベント系サブメニューのテストが並ぶ
  ブロックに新しい `test(...)` を追加）

**Interfaces:**
- Consumes: Task 1 が導入した `"stairs_down"` サブメニューと、そのボタン文言
  「降りずに進む」および `` `${getFloorLabel(state, nextFloor)}へ降りる` ``
- Produces: なし（テストのみ）

`openGuardedSubmenu` は `CONTROLS_GUARD_MS = 350`（`src/controls_guard.js`）の
あいだボタンのタップを無視する。テストではボタンをクリックする前に
`page.waitForTimeout(400)` を挟む。

- [ ] **Step 1: 失敗する E2E テストを書く**

`tests/ui-ux.spec.js` の、`'Movement-triggered event and trap panels ignore immediate taps'`
テストの**直前**に次のテストを追加する。

```js
    test('Down stairs ask before descending and can be skipped', async ({ page }) => {
      const before = await page.evaluate(async () => {
        const { state } = await import('/src/state.js');
        const { createDefaultCurrentRun } = await import('/src/state.js');
        const { checkCellEvents } = await import('/src/movement.js');
        const { updateUI } = await import('/src/ui.js');
        state.gameState = 'explore';
        state.floor = 2;
        state.currentRun = createDefaultCurrentRun();
        const cell = state.map[state.y][state.x];
        cell.type = 'stairs-down';
        cell.event = null;
        cell.message = null;
        checkCellEvents();
        updateUI();
        return { gameState: state.gameState, floor: state.floor, x: state.x, y: state.y };
      });
      expect(before).toMatchObject({ gameState: 'submenu', floor: 2 });

      await expect(page.getByRole('button', { name: '降りずに進む' })).toBeVisible();
      await page.waitForTimeout(400);
      await page.getByRole('button', { name: '降りずに進む' }).click();

      const afterStay = await page.evaluate(async () => {
        const { state } = await import('/src/state.js');
        return { gameState: state.gameState, floor: state.floor, x: state.x, y: state.y };
      });
      expect(afterStay).toMatchObject({ gameState: 'explore', floor: 2, x: before.x, y: before.y });

      await page.evaluate(async () => {
        const { checkCellEvents } = await import('/src/movement.js');
        const { updateUI } = await import('/src/ui.js');
        checkCellEvents();
        updateUI();
      });
      await page.waitForTimeout(400);
      await page.getByRole('button', { name: /へ降りる$/ }).click();

      const afterDescend = await page.evaluate(async () => {
        const { state } = await import('/src/state.js');
        return { gameState: state.gameState, floor: state.floor };
      });
      expect(afterDescend.floor).toBe(3);
      expect(afterDescend.gameState).toBe('explore');
    });
```

- [ ] **Step 2: テストを実行する**

Run: `npx playwright test tests/ui-ux.spec.js -g "Down stairs ask before descending"`
Expected: PASS。

失敗した場合は、まず失敗メッセージがボタン文言の不一致（`へ降りる` の
正規表現がフロア名表記と合わない）か、階層遷移の非同期待ち不足かを切り分ける。
`descendToFloor` の遷移演出を待つ必要があるなら、最後の `page.evaluate` の前に
`await expect(page.locator('#log-content')).toContainText('階段を下ります')` を
入れてから状態を読む。

- [ ] **Step 3: ブラウザテストスイート全体を実行する**

Run: `npm run test:browser 2>&1 | tail -30`
Expected: 失敗なし。既存テストが下り階段への進入で即降下することを
前提にしている箇所があればここで失敗するので、サブメニュー経由に更新する。

- [ ] **Step 4: ビルドと lint**

Run: `npm run build`
Expected: 成功。

Run: `npm run lint`
Expected: エラーなし。

- [ ] **Step 5: モバイル幅で表示を確認する**

`playwright.config.js` のビューポート設定を確認する。360x800 / 390x844 / 430x932 の
いずれかで実行されていない場合は、一時的にビューポートをその 3 サイズに切り替えて

Run: `npx playwright test tests/ui-ux.spec.js -g "Down stairs ask before descending"`

を各サイズで実行し、サブメニューの 2 ボタンが横スクロールなしに収まり、タップ領域が
44px 以上あることを確認する。確認後、設定は元に戻す。

- [ ] **Step 6: コミット**

```bash
git add tests/ui-ux.spec.js
git commit -m "test: 下り階段の選択フローをブラウザで検証する"
```

---

### Task 4: PR を出す

**Files:**
- 変更なし

- [ ] **Step 1: 全体検証を通す**

Run: `npm run lint`
Run: `npm run test:unit 2>&1 | tail -20`
Run: `npm run build`
Run: `npm run test:browser 2>&1 | tail -30`

Expected: すべて成功。1 つでも失敗したら PR を出さずに原因を直す。

- [ ] **Step 2: `origin/main` の最新を取り込む**

```bash
git fetch origin main
git rebase origin/main
```

コンフリクトが出たら解消し、Step 1 の検証をやり直す。

- [ ] **Step 3: プッシュして PR を作る**

```bash
git push -u origin HEAD
```

PR 本文には次を含める。

- 変更の要約: 通路上の下り階段で強制降下せず、降りるか進むか選べるようにした。
- 検証結果: 実行した lint / test:unit / build / test:browser の結果。
- 対応する Issue があれば `Closes #<n>` を本文に書く。
