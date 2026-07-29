# 下り階段の降下を選択制にする

## 背景

通路上に下り階段が配置された場合、そのマスに進入した時点で強制的に次のフロアへ
降りてしまう。階段より先にある通路を探索できない。

現在の実装は `checkCellEvents` の `stairs-down` 分岐で即座に
`descendToFloor(state.floor + 1)` を呼んでいる（`src/movement.js:448`）。

一方、泉・野営地・石碑・節目商人・帰還ポータルはいずれも
`openGuardedSubmenu` でプレイヤーに選択させてから効果を適用する。
下り階段だけが選択の余地なく即時実行されている。

## ゴール

下り階段のマスに進入したとき、降りるか降りずに探索を続けるかを選択できる。

## 非ゴール

- 階段マスの配置ロジックの変更（通路上の階段はそのまま許容する）
- 上り階段（`stairs-up`）の挙動変更
- 落とし穴経由の降下（`src/systems/traps.js`）の変更

## 設計

### 1. 進入時の分岐（`src/movement.js`）

`checkCellEvents` の `stairs-down` 分岐を、即時降下からサブメニュー表示に変える。

```
現状: stairs-down 進入 → descendToFloor(state.floor + 1)
変更: stairs-down 進入 → openGuardedSubmenu("stairs_down", <タイトル>)
```

タイトルには次フロア名を含める。フロア名は `src/ui/ui_root.js:183` の目標バナーと
同じく `getFloorLabel(state, state.floor + 1)` で解決し、表記を揃える。

節目フロア（5の倍数）でボス未撃破の場合は現状を維持する。
「節目ボスを倒すまで下り階段は封じられている。」のログを出して `return` し、
サブメニューは開かない。降りる選択肢が存在しないため、メニューを出しても
プレイヤーに与える選択がない。

### 2. サブメニューのレンダラ（`src/menu/stairs_down.js` 新規）

`src/menu/milestone_portal.js` と同じ構造の 2 択。

- 「B{n+1}Fへ降りる」→ `closeSubmenu()` の後に `descendToFloor(state.floor + 1)`
- 「降りずに進む」→ `closeSubmenu()`

`src/menu/submenu_router.js` の `SUBMENU_RENDERERS` に `stairs_down` を登録する。

### 3. 既存挙動を維持する箇所

- `applyStairsHeal` は従来どおり進入時に発火する。選択の結果とは無関係で、
  階段の発見に対する回復であるため。
- 「降りずに進む」を選んだ後はその階段マスに留まる。ボス扉のような
  進入前マスへの押し戻し（`state.x = prevX`）は行わない。先へ進むことが
  この変更の目的であるため。
- 階段マスでのランダムエンカウント判定はスキップしたままとする。現状の
  早期 `return` と同じ扱い。
- `stairs-up` の「上り階段は崩れ、前のフロアには戻れない。」は変更しない。

### 4. 再降下の動線

「降りずに進む」を選んだ後、再び降りたくなった場合は、いったん階段マスから
出て再進入するとサブメニューが再表示される。探索画面への常設「降りる」ボタン
追加や、そのランでの階段封印は行わない。

理由: 既存イベント（泉・野営地・石碑・商人・ポータル）がすべて再進入で
再表示される同型であり、階段だけ別動線にすると一貫性が崩れる。また探索画面の
`action-grid` は現在 3 ボタンで、4 つ目を足すと折り返してモバイル下部の
レイアウトに影響する。

## セーブ整合性

`resolvePersistedGameState`（`src/state/save_payload.js`）は `submenu` 状態を
基底画面へ畳む。`stairs_down` は `menuContext.prevGameState === "explore"` で
解決されるため追加の分岐は不要。

ただし AGENTS.md の要求どおり、`stairs_down` サブメニューを開いた状態で
セーブ → ロードすると `explore` に復帰することを検証するラウンドトリップ
テストを追加する。

## 影響範囲

`checkCellEvents` の直接の呼び出し元:

- `src/menu/explore_actions.js:124`（本番の移動フロー）
- `scratch/test_save.js:100`, `:122`, `:128`
- `tests/ui-ux.spec.js:1583`

バランスシミュレーションは `checkCellEvents` を経由しないため影響しない。
既存テストに下り階段への進入で即降下することを期待する箇所があれば、
サブメニュー経由に更新する。

## 検証

- `npm run lint`
- `npm run test:unit`
- `npm run test:browser`
- サブメニューの表示とタップ操作を 360x800 / 390x844 / 430x932 で確認する。

追加するテスト:

- 下り階段に進入してもフロアが変わらず、`gameState` が `submenu`、
  `menuContext.type` が `stairs_down` になる。
- 「降りる」で次フロアへ遷移する。
- 「降りずに進む」でフロアが変わらず、座標が階段マスのままで `explore` に戻る。
- 節目フロアでボス未撃破のとき、サブメニューが開かずログのみ出る。
- `stairs_down` サブメニュー中のセーブ → ロードで `explore` に復帰する。
