# Core Loop vNext telemetry contract (#1012)

これはプレイヤーの最適解を定義する文書ではなく、Core Loop vNext の観測可能性と受け入れ測定の契約である。イベントは `schemaVersion=2` とし、`src/telemetry.js` が allowlist と上限で正規化する。自由文、キャラクター名、未許可の item/enemy 識別子は送信しない。

## イベント

| event | 目的 | 主なプロパティ |
|---|---|---|
| `run_start` / `run_end` | ランの境界と死亡・帰還 | class, floor, hp/mp rate, outcome, return reason, banked/lost object-loot count/value proxy |
| `stairs_discovered` / `floor_exploration` | 階段発見を探索前後に分ける | floor, steps at discovery, steps before/after stairs, hp/mp rate, unbanked count |
| `valuable_location` | 宝箱などの価値地点の発見・選択 | location type, discovered/opened/skipped, floor, source |
| `loot_lifecycle` | object loot の found→bagged→action→settlement | lifecycle stage, item category/id, source, ownership, rarity, build role, value proxy, unbanked count |
| `equipment_decision` / `build_shift` | 装備交換と意味のある build shift の分離 | action, old/new equipment, `buildDecision`, from/to build role, Main Core axis change |
| `portal_decision` | Portal/Wing の Push / Return | portal type, decision, hp/mp rate, free slots, unbanked count/value, Wing salvage count, next band clue IDs |
| `elite_decision` | エリートの接近・追跡・回避・接触と結果 | decision, elite id, contact mode, distance, detected, elite policy, floor, unbanked count |

`loot_lifecycle` の `found` は拾得を試みた時点、`bagged` はバッグと `currentRun.unbankedObjectLoot` の両方に所有権が付いた時点である。満杯なら `found` の後に `rejected` が残る。Portal は `banked`、Wing は `salvaged`、死亡・Abandon は `lost` として、装備中でも未確定戦果の所有権を失わない。`tried`、`identified`、`adopted`、`discarded` は同じ loot sequence に紐づける。

同一 run 内の同一 loot sequence と lifecycle stage、同一地点と location action、同一 floor の階段・floor summary は runtime dedupe する。save/load 後の再送は新たな gameplay event として補完せず、送信失敗はゲームを止めない。初期 SDK 待ちのイベントだけ有限バッファに保持する。

## 決定論的測定

`scratch/measurements/issue1012_observability.js` は canonical runner `scratch/simulations/sim_depth_material_ev.js` を使い、同じ seed/config で階段発見、Portal、装備交換/build shift、エリート回避・接触を集計する。出力には source SHA、runner SHA、seed、N、scenario、schemaVersion を記録する。これは balance tuning や Issue #990 の再開ではない。

canonical simulator は production の object-loot ownership ledger をモデルしていないため、loot/death-loss 欄は `not_modeled` とする。ゼロとして扱わず、production `loot_lifecycle` と意味を混ぜない。

## 境界

- telemetry は Core Loop の観測であり、clear rate、drop rate、戦闘式、Wing の救出数などの balance 値を変更しない。
- `equipment_decision.buildDecision=transition` は explicit な Main Core axis の変更だけを指す。Auxiliary Core と Support の交換は `swap`。
- Castle は事実、Codex は理解を保存する。telemetry はその観測データであって、保存形式やプレイヤー向け説明文の代替ではない。
