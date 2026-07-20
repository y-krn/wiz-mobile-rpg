# Learnings

Corrections, insights, and knowledge gaps captured during development.

**Categories**: correction | knowledge_gap | best_practice
**Areas**: frontend | backend | infra | tests | docs | config
**Statuses**: pending | in_progress | resolved | wont_fix | promoted | promoted_to_skill

## Status Definitions

| Status | Meaning |
|--------|---------|
| `pending` | Not yet addressed |
| `in_progress` | Actively being worked on |
| `resolved` | Issue fixed or knowledge integrated |
| `wont_fix` | Decided not to address (reason in Resolution) |
| `promoted` | Elevated to CLAUDE.md, AGENTS.md, or copilot-instructions.md |
| `promoted_to_skill` | Extracted as a reusable skill |

## Skill Extraction Fields

When a learning is promoted to a skill, add these fields:

```markdown
**Status**: promoted_to_skill
**Skill-Path**: skills/skill-name
```

Example:
```markdown
## [LRN-20250115-001] best_practice

**Logged**: 2025-01-15T10:00:00Z
**Priority**: high
**Status**: promoted_to_skill
**Skill-Path**: skills/docker-m1-fixes
**Area**: infra

### Summary
Docker build fails on Apple Silicon due to platform mismatch
...
```

---

## [LRN-20260720-001] correction

**Logged**: 2026-07-20T10:04:29Z
**Priority**: high
**Status**: resolved
**Area**: tests

### Summary
生成系 simulation は低層レガシー API の既定値ではなく、本番 orchestration 経路を呼んで測定する。

### Details
`scratch/sim_trap_choke.js` が `generateRandomMap(floor, null, seed)` を直接呼び、
本番の `generateRunFloor` と異なる設定を測っていた。レガシー API は
`generateStairsDown ?? (floor < 5)` のため B5 以降に下り階段を作らず、
`isChokeCell` が全候補で false となった。これを迷路形状由来の候補不足と誤認し、
虚偽の shortfall 100% を spec と PR に記録した。

### Suggested Action
生成・バランス simulation 作成時は本番 caller を先に特定し、その caller が渡す
options、retry、template、biome を含む入口を使う。低レベル API を直接使う場合は、
本番 options と一致することを明示的にテストする。

### Metadata
- Source: user_feedback
- Related Files: scratch/sim_trap_choke.js, src/run_map_generator.js, src/map_generator.js
- Tags: simulation, production-path, map-generation, false-observation
- Pattern-Key: harden.simulation_production_path
- Recurrence-Count: 1
- First-Seen: 2026-07-20
- Last-Seen: 2026-07-20

### Resolution
- **Resolved**: 2026-07-20T10:04:29Z
- **Commit/PR**: PR #221（この修正コミット）
- **Notes**: simulation を `generateRunFloor({ runSeed, floor })` へ変更し、実測値で spec と PR 本文を訂正。

---

## [LRN-20260717-003] correction

**Logged**: 2026-07-17T21:04:33+09:00
**Priority**: high
**Status**: resolved
**Area**: tests

### Summary
ブラウザとNode DOMスタブの両方で読み込まれるUIモジュールは、`HTMLElement`などのbrowser-onlyグローバルへ直接依存させない。

### Details
overlay focus復元で`instanceof HTMLElement`を使った結果、`HTMLElement`グローバルを定義しないNode unit環境で`ReferenceError`が発生した。DOMスタブが存在してもbrowser constructorの存在は保証されない。必要な能力はfocus可能かどうかだけなので、`focus`関数の有無で判定できる。

### Suggested Action
Node unitからimportされるUIコードでは、DOM constructorによる型判定より必要メソッド・プロパティのduck typingを優先する。browser-onlyグローバルを使う場合は`typeof`ガードを付け、変更後にbrowser testだけでなく`npm run test:unit`も実行する。

### Metadata
- Source: user_feedback
- Related Files: src/ui/ui_root.js, scratch/run_tests.js
- Tags: node, dom-stub, browser-global, HTMLElement, unit-test
- Pattern-Key: harden.ui_browser_globals_in_node
- Recurrence-Count: 1
- First-Seen: 2026-07-17
- Last-Seen: 2026-07-17

### Resolution
- **Resolved**: 2026-07-17T21:04:33+09:00
- **Notes**: focus可能判定を`focus`関数のduck typingへ変更し、Node unitとlintで検証。

---

## [LRN-20260717-002] correction

**Logged**: 2026-07-17T20:54:05+09:00
**Priority**: medium
**Status**: resolved
**Area**: frontend

### Summary
再描画時のUI状態保持を追加する際は、明示的な再オープンで従来の初期位置へ戻す挙動を分離する。

### Details
full-log overlayの再描画でスクロール位置を保持した結果、閉じてから再オープンした場合も途中位置が残り、閉じている間の新規ログが見えなくなった。`updateUI`による背景更新では位置保持が必要だが、ユーザー操作による明示オープンでは従来どおり末尾表示が必要。

### Suggested Action
スクロール、フォーカス、選択状態の保持をrendererへ追加する場合、同じrendererを呼ぶ「更新」と「明示オープン」を別シナリオとして確認する。更新時の保持テストに加え、閉じる→状態変化→再オープン時の初期化テストを追加する。

### Metadata
- Source: user_feedback
- Related Files: src/ui/ui_root.js, tests/ui-ux.spec.js
- Tags: overlay, scroll-restoration, reopen, regression, e2e
- Pattern-Key: harden.preserve_update_reset_reopen
- Recurrence-Count: 1
- First-Seen: 2026-07-17
- Last-Seen: 2026-07-17

### Resolution
- **Resolved**: 2026-07-17T20:54:05+09:00
- **Notes**: `openLogOverlay`で描画後に末尾へ移動し、full-log E2Eへ閉じる→ログ追加→再オープンの回帰ケースを追加。

---

## [LRN-20260717-001] correction

**Logged**: 2026-07-17T20:15:18+09:00
**Priority**: high
**Status**: resolved
**Area**: tests

### Summary
仕様の閾値やUI表記を変更する際は、unitテストだけでなく関連E2Eテストの期待値も検索する。

### Details
救済募集の上限を生存2人未満から4人未満へ変更した際、`scratch/test_rescue_softlock.js` は更新したが、`tests/verify-softlock-rescue.spec.js` の `/2` 表記と2人到達時のボタン消滅期待を見落とした。unitテストは成功した一方、レビュー環境のE2Eで旧期待値が失敗した。

### Suggested Action
状態閾値やUI表記を変更する際は、対象シンボルだけでなく旧表示文字列、旧境界値、関連する利用者向け文言を `src`、`scratch`、`tests` 全体から検索する。ブラウザ実行不可でもE2E期待値の静的整合を確認する。

### Metadata
- Source: user_feedback
- Related Files: src/state/state_core.js, src/training.js, scratch/test_rescue_softlock.js, tests/verify-softlock-rescue.spec.js
- Tags: testing, e2e, regression, boundary-condition, static-review
- Pattern-Key: harden.cross_layer_test_expectations
- Recurrence-Count: 1
- First-Seen: 2026-07-17
- Last-Seen: 2026-07-17

### Resolution
- **Resolved**: 2026-07-17T20:15:18+09:00
- **Notes**: E2E期待値を `/4` へ更新し、生存2人時も救済募集ボタンが表示されることを確認するフローへ修正。

---

## [LRN-20260705-001] best_practice

**Logged**: 2026-07-05T00:00:00Z
**Priority**: high
**Status**: pending
**Area**: backend

### Summary
ダンジョンマップは save に grid 丸ごと永続化される。セル構造にフィールドを足すと既存セーブが壊れる。regenerate は不可。

### Details
`src/state/save_payload.js` が `maps: state.maps` を保存し、load 時は保存済み grid を復元する（`src/state/dungeon_state.js` の seed 生成は新規ゲーム時のみ、load では**再生成しない**）。
- セルに新フィールド（例: 一方通行 `blockEnter`、隠し扉 `secretDoor`）を追加すると、既存セーブの grid にその配列が欠ける → 実行時に undefined 参照。
- **seed から regenerate して補う案は不可**: 新機能込みで生成するとレイアウトが変わり、進行中ランでプレイヤー座標と階段/イベントの位置関係が壊れて詰む。
- 壁は対称モデル（`cell.walls[N,E,S,W]`、`openWall` が両隣接セルを同時開閉）。非対称通行はこのモデルで表現できず、新フラグが要る。

### Suggested Action
マップ/セル構造を変更する時は必ず:
1. `SAVE_VERSION` を bump（共有カウンタ。他 `doing` チケットと重複しないか grep、進捗ログで連番予約）。
2. migration step で既存 save の全 grid 全セルに新フィールドを default backfill（regenerate しない）。
3. `normalizeSavePayload` にも冪等補完を置く。

### Metadata
- Source: conversation
- Related Files: src/state/save_payload.js, src/state/save_migrations.js, src/state/dungeon_state.js, src/map_generator.js
- Tags: save-migration, dungeon-map, gotcha
- See Also: tickets/TICKET-045-one-way-passage.md, tickets/TICKET-046-hidden-door.md
- Promotion-Candidate: AGENTS.md (map/save 構造変更ルール。広く適用・再発防止価値あり)

---

## [LRN-20260705-002] best_practice

**Logged**: 2026-07-05T00:34:00Z
**Priority**: high
**Status**: resolved
**Area**: backend

### Summary
アイテム・呪文の使用制限ロジックを定義した際は、すべての関連UIの実行ボタン活性状態（disabled）に確実にバインドして適用する。

### Details
`src/equip.js` の `getItemUseStatus` に各種 `usable` アイテム（傷薬、解毒薬、蘇生薬など）の使用制限バリデーション（HP満タン、死亡中、戦闘限定など）およびテストケースが詳細に定義されていたが、探索中の道具使用画面（`explore_actions.js` の `renderItemAction`）でこの判定関数が呼び出されておらず、制限を無視して無駄に消費できてしまう（または不整合を起こす）バグがあった。

### Suggested Action
新しい消費アイテムや呪文の使用制限を追加した際は、ロジック定義・テスト作成のみに留まらず、必ず関連するUI画面（探索メニュー、戦闘メニュー等）で活性状態のチェック（disabled）および理由表示にその判定関数を組み込む。

### Metadata
- Source: user_feedback
- Related Files: src/menu/explore_actions.js, src/equip.js
- Tags: UI-validation, item-usage, bugfix

### Resolution
- **Resolved**: 2026-07-05T00:16:00Z
- **Notes**: `explore_actions.js` に `getItemUseStatus` をインポートし、`renderItemAction` の「使用する」ボタン生成時に呼び出して判定するよう修正。

---

## [LRN-20260705-003] best_practice

**Logged**: 2026-07-05T17:45:00Z
**Priority**: medium
**Status**: resolved
**Area**: frontend

### Summary
`#controls-panel` の高さは gameState 毎の mode クラスで制御する設計。mode クラス欠落 or 固定高さ指定 → ボタン縦間延び・空白過多。

### Details
`src/ui/ui_root.js` の `updateControlsPanel` が gameState に応じ `explore-mode` / `combat-mode` / `submenu-mode` / `trap-mode` を `#controls-panel` にトグル。各 mode クラスが `src/styles/controls.css` で高さを定義。2つの落とし穴:
- **mode クラス欠落**: combat には mode クラスが無く、デフォルト `min-height:210px` に落ちていた。かつ `.combat-grid` が `height:100%` + `grid-template-rows:repeat(2,1fr)` → ボタンが210px枠を等分し縦伸び（1ボタン ~180px）。さらに `#combat-controls` が `.controls-group.active` の flex row 継承で prompt 左・グリッド右の変則配置。
- **固定高さ**: `submenu-mode` が `height:320px` 固定 → 泉など2択イベントで大量の下方空白。

### Suggested Action
コントロールパネルのレイアウト調整時:
1. 新 gameState には必ず専用 mode クラスをトグル追加（ui_root.js）＋ CSS 定義。デフォルト高さ依存にしない。
2. パネル高さは `height:auto` + `max-height:Nvh`（内容ハグ）を基本。固定 px は避け空白を作らない。
3. ボタングリッドは `grid-auto-rows: var(--tap-lg)` で行高固定。`height:100%` + `1fr` 行は枠を等分し縦伸びする。
4. prompt+グリッドを縦積みする controls-group は `flex-direction: column` を明示（`.controls-group.active` はデフォルト row）。
5. 長リストは `max-height:45vh` + グリッド側 `overflow-y:auto` でスクロール担保。

### Metadata
- Source: user_feedback
- Related Files: src/ui/ui_root.js, src/styles/controls.css
- Tags: UI-layout, css-grid, controls-panel, whitespace
- See Also: LRN-20260705-002 (どちらもUI反映漏れ系)

### Resolution
- **Resolved**: 2026-07-05T17:45:00Z
- **Notes**: `combat-mode` トグル追加、`.combat-grid` を `grid-auto-rows:var(--tap-lg)` + `height:auto` 化、`#combat-controls.active` を column 化、`submenu-mode` を固定320px→`height:auto`+`max-height:45vh` 化。実DOM検証で戦闘210→145px(ボタン48px固定)、泉320→135px、長リスト16項目で45vhスクロール維持を確認。

---

## [LRN-20260705-004] best_practice

**Logged**: 2026-07-05T18:30:00Z
**Priority**: high
**Status**: promoted
**Promoted**: AGENTS.md (Verification セクション)
**Area**: tests

### Summary
`scratch/test_*.js` の自作アサートが「常時グリーン詐称」する二重欠陥。ガード早期returnでロジック未実行 + `console.assert`失敗でも無条件`[PASS]`ログ。

### Details
`scratch/test_return_mark.js` の例:
- **前提未構築で早期return**: `triggerRunResult`は`state.currentRun`未設定だと `result.js:88` で即return。テストは`currentRun`未設定 → 全`escape_scroll`/`gameover`ケースがno-op。`lastReturnedFloor`は書き換わらず、テスト前に手動セットした値がそのまま残るだけ。
- **アサート結果を出力に反映しない**: `console.assert(cond, msg)` は失敗時stderrに出すのみで実行は止まらない。直後に無条件 `console.log("-> [PASS] ...")` を置くと、実際FAILでも画面には[PASS]。exit codeも0。CIも人も気付けない。

この2つが重なると「実際は何も検証してないのに全緑」。実際 `node test_return_mark.js` は `Assertion failed:` を3件出しつつ全行[PASS]表示していた。

### Suggested Action
`scratch/test_*.js`（`run_tests.js`がexecSyncで実行、非ゼロexitで検出）作成・レビュー時:
1. アサートは成否を変数集計し、`失敗>0 → process.exit(1)`。`console.assert`単独に頼らない。`[PASS]/[FAIL]`ラベルは条件で出し分け（無条件logは詐称の温床）。
2. テスト対象関数のガード条件（早期return, null前提）を確認し、副作用が実際に走る最小状態を構築してから呼ぶ。呼んで状態不変=検証ゼロを疑う。
3. 新テストは「わざと壊して落ちるか」を1度確認（期待値を反転させFAIL・exit1が出るか）。常時グリーン検出の唯一確実な方法。

### Metadata
- Source: user_feedback
- Related Files: scratch/test_return_mark.js, scratch/run_tests.js, src/result.js
- Tags: testing, false-positive, assertions, early-return, test-integrity
- Pattern-Key: harden.test_false_green
- Recurrence-Count: 1
- First-Seen: 2026-07-05
- Last-Seen: 2026-07-05

### Resolution
- **Resolved**: 2026-07-05T18:30:00Z
- **Notes**: `setupRun(floor)`で`currentRun`/party/roster等を構築し全ケースで実行担保。`check(cond,label,detail)`ヘルパで成否集計→`[PASS]/[FAIL]`出し分け、`failed>0`で`process.exit(1)`。テスト1期待も仕様変更に合わせ「階段帰還で温存」→「B1F階段帰還で失効」に反転。`node scratch/test_return_mark.js`でexit=0・全PASS確認。

---

## [LRN-20260705-005] best_practice

**Logged**: 2026-07-05T00:00:00Z
**Priority**: high
**Status**: promoted
**Promoted**: AGENTS.md
**Area**: backend

### Summary
一時オーバーレイ状態(`submenu` / `trap_encounter`)をそのまま`gameState`保存すると、付随コンテキストが未永続化のため再開時に画面が壊れる。セーブは基底画面へ畳んでから保存する。

### Details
バグ: お城(城サブメニュー)でやめて再開すると地下1F登り階段から始まる。
- `createSavePayload`は`state.gameState`を保存するが、`menuContext`(サブメニューの`type`/`prevGameState`)は**payloadに含まれない**。
- 街サブメニュー(お城/宿屋/寺院/倉庫/訓練/工房)は`gameState="submenu"`。この状態でautosaveが多数走る。
- 再開: `gameState="submenu"`復元 → `menuContext`は初期値にリセット → `renderer.js:78`の街背景判定が全falseでダンジョン描画。座標は帰城時に`floor=1`/`START`(=地下1F登り階段)へリセット済み。
- 同型: `trap_encounter`も`activeTrapState`未保存(`traps.js:127`でautosave) → 再開時に罠UI消えて操作不能で詰み。

一般原則: **セーブpayloadに含めない一時state(`menuContext`, `activeTrapState`等)に依存する`gameState`は、そのまま永続化してはいけない**。保存前に安定した基底画面へ正規化する。

### Suggested Action
新しい`gameState`(オーバーレイ/モーダル系)を追加する際:
1. その状態の描画/操作が`state`直下以外(module-local変数, 別オブジェクト)に依存するか確認。依存する かつ payload非対象 なら「一時状態」。
2. 一時状態はセーブ前に基底画面へ畳む(`save_payload.js`の`resolvePersistedGameState`に分岐追加)。畳み規則は`closeSubmenu`(navigation.js)と一致させる。
3. 「その状態でautosaveが走るか」をgrepで確認(`saveAutosave`呼び出し箇所)。走るなら畳み必須。
4. `scratch/test_submenu_resume.js`に往復テスト追加(保存→gameState汚し→loadGame→基底画面復帰をassert)。

### Metadata
- Source: conversation
- Related Files: src/state/save_payload.js, src/navigation.js, src/systems/traps.js, src/renderer.js, src/ui/ui_root.js, scratch/test_submenu_resume.js
- Tags: save-load, persistence, gameState, transient-state, submenu, trap
- Pattern-Key: harden.persist_transient_gamestate
- Recurrence-Count: 1
- First-Seen: 2026-07-05
- Last-Seen: 2026-07-05

### Resolution
- **Resolved**: 2026-07-05T00:00:00Z
- **Notes**: `save_payload.js`に`resolvePersistedGameState()`追加。`submenu`は`menuContext.prevGameState`優先→type判定(castle/shop/temple/party_assemble/craft→town, combat→combat, 他→explore)、`trap_encounter`→explore に畳む。`gameState`フィールドをresolverに差し替え。回帰テスト`test_submenu_resume.js`新規(4ケース)。全ユニット+lint パス。

---
