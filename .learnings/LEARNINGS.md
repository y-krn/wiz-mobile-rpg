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
