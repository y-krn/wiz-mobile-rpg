# Issue #828 技術的負債と変更容易性の棚卸し

調査日: 2026-08-26
調査対象: `origin/main` / `7e71018`
目的: production behavior、save compatibility、game balanceを変更せず、変更範囲・回帰範囲・原因調査範囲を縮小できる候補を分類する。

## 結論

新しい P0 バグは今回の静的棚卸しでは確認できなかった。#799/#800/#832/#833/#834/#835 で、未定義 state/map、chest phase、equipment preview、renderer/view state、save/apply 境界の主要な fail-closed 対策は既に導入済みである。

後続作業として、責務ごとに次の4 Issueへ分割した。いずれも behavior・save schema・balanceを変更しない前提で、実装時に既存契約を回帰テストで固定する。

| 優先度 | 候補 | 処遇 |
| --- | --- | --- |
| P1 | `src/chest.js` の controller / rule / DOM / state / telemetry 集中 | [#910](https://github.com/y-krn/wiz-mobile-rpg/issues/910) |
| P1 | `src/equip.js` の overlay / action / identification / craft / telemetry 集中 | [#911](https://github.com/y-krn/wiz-mobile-rpg/issues/911) |
| P1 | `src/renderer.js` の raw runtime state 直接解釈 | [#912](https://github.com/y-krn/wiz-mobile-rpg/issues/912) |
| P2 | `scratch/` の unit / regression / simulation / measurement ownership 混在 | [#909](https://github.com/y-krn/wiz-mobile-rpg/issues/909) |
| P3 | 実測根拠のない renderer micro-optimization | 現状維持。性能問題または計測結果が出た時だけ起票 |

## A. 変更容易性

### `src/equip.js` — P1

- 1,280行。先頭で `state`、data facade、identification、audio、UI、craft、affix、equipment slot、telemetryを直接importしている（`src/equip.js:1-41`）。
- `createWorkshopPanel()` が素材残高の判定と `executeEnhance` / `executePolish` のevent handlerをDOM生成内で行う（`src/equip.js:838-960`）。
- `createDetailPanel()` がpreview、装備可否、装備解除、鑑定、装備、破棄のstate mutation、log、audio、autosave、telemetryを同じrender pathに持つ（`src/equip.js:996-1245`）。
- ただし、previewの一時装備書き換えは #870 / commit `476d7a5` でcopy計算へ修正済み。これは新しい後続Issueで再実装しない。

判定: 実際に異なる変更理由が同じmoduleへ到達するため P1。単なるファイル分割ではなく、actionのvalidation/mutation境界を先に作る。

### `src/chest.js` — P1

- 977行。宝箱生成、trap/reward rollの呼出し、DOM、submenu navigation、state mutation、combat/game-over、audio、telemetryを横断する（`src/chest.js:1-29`, `:200-417`, `:503-960`）。
- `CHEST_PHASES` と `CHEST_PHASE_TRANSITIONS` は既にphase contractとして導入済み（`src/chest.js:33-60`）。`state.transitioning`、recovery、save flatteningを壊さないことが最重要。
- pure ruleは `src/rules/chest_rules.js`、`src/rules/trap_rules.js`、`src/rules/trap_effect_rules.js`、`src/rules/material_rules.js`へ既に寄っている。

判定: P1。残る問題はruleの不存在ではなく、controller/view/side-effect orchestrationが一つのmoduleに残っていること。

### `src/renderer.js` — P1

- 2,022行。`getScreenViewState()`を使う箇所はあるが、描画処理が `state.map`、`state.x/y/dir`、`state.floor`、`state.party`、`state.combatState`、`state.visitedMap`等を直接読む（例: `src/renderer.js:245-340`, `:455-471`, `:1182-1184`, `:1665-1713`, `:1813-1911`）。
- `src/state/view_state.js` はscreen、map、combat、submenuのshapeを検証する既存boundary（`src/state/view_state.js:175-238`）。
- #799/#800で未定義state/mapをrenderer/UIが握りつぶさず安全にfallbackする方向は既に実装済み。

判定: P1。view-stateを置き換えるのではなく、描画に必要なsnapshot/view modelを生成する位置を限定する後続課題とする。

## B. State / side effect

静的カウントでは、production `src/` にruntime state facadeをimportするmoduleが43、singleton `state`を直接writeするmoduleが31ある。これは直ちに誤りではない。action/system moduleがstateを所有する現行方針と一致する一方、次の境界は高リスクである。

- `src/state/state_core.js` がstate本体、log、death recordを所有する。
- `src/state/save_payload.js` はpersist allowlistとscreen flatteningを所有し、#835の契約を満たす。
- `src/state/view_state.js` はrenderer/UI/navigation向けのread-only snapshotを所有する。
- `src/navigation.js` は`menuContext` / `menuHistory`を持ち、DOM title/optionsを操作しながらstate screenを変更する。
- `src/equip.js` / `src/chest.js` はaction実行中にinventory、party、currentRun、codex、map、logs、save、telemetryを複数順序で変更する。

### hidden / temporary mutation

- equipment previewの一時mutationは解消済み（#870）。
- save applyは`normalizeSavePayload()` / `migrateSavePayload()`でclone・normalizeしてからmutationする既存境界がある。
- 現在残る候補は一時値ではなく、chest/equipment actionが複数のstate objectと副作用を横断すること。P1 Issue #910/#911で扱う。

## C. UI / domain / state 混在

`src/` ではDOM APIを参照するmoduleが29ある。これはUI層全体としては自然だが、特に次を優先する。

- P1: `equip.js` — DOM生成とaction mutationが同一関数のevent callbackに混在。
- P1: `chest.js` — DOM生成とphase transition、trap/reward、navigationが混在。
- P1: `renderer.js` — canvas drawingとraw game state interpretationが混在。
- P2: `navigation.js` / `menu/*` — routing stateとDOM submenu renderingが同一flowに残る。ただし現行のback/history contractは安定しており、P1候補の後に関連変更が起きた時に評価する。

## D. Test / simulation / tooling ownership

現状のファイル数は次のとおり。

| 区分 | 数 | 現状 |
| --- | ---: | --- |
| `scratch/test_*.js` | 136 | unit / regression runnerの対象 |
| うち `test_issue*.js` | 23 | 恒久仕様とIssue固有検証が混在 |
| `scratch/sim_*.js` | 31 | historical simulation。`simulation_manifest.js`でinventory化済み |
| measurement / benchmark系 | 13 | measurement、compare、bench、coverage、provenance等が同居 |
| `tests/*.spec.js` | 32 | browser E2E / visual / integration |
| Issue番号付きbrowser spec | 2 | `issue-710-visual.spec.js`, `issue-831-landmarks-visual.spec.js` |

`npm run test:unit` は `scratch/run_tests.js` を入口に、`test_*.js`だけを自動実行する（`scratch/run_tests.js:5-15`, `:220-260`）。命名でsimulationを除外する考え方は明確だが、directory ownershipは未分離である。

既存対応との重複は次のとおり整理した。

- #672: retired `trapSense` simの処遇と stale reference検出は完了済み。active source/simに旧`trapSense`実装は無く、残るものはhistorical result、`.agents/balance-simulation.md`の結論、`simulation_manifest.js`の意図的guard、test fixtureである。
- #738: 一回限りsimとraw outputのcleanup規約は既存。#909では結論の再測定や一括削除を行わず、ownershipとlifecycleを明示する。
- #812: browserのsmoke/full、実装詳細依存、Issueごとのspec増殖抑制は完了済み。#909ではbrowser構成を再設計せず、残るIssue名specの処遇を分類する。
- #595/#459: simulation coverageと長時間測定の実行前検証は既存Issueの責務。#909はそれらのsimulation内容を変更しない。

判定: P2。移動そのものを目的にせず、まず一覧・lifecycle・runner対象を固定してから、移動/改名/退役を小さく実施する。

## E. Dead / stale code

追加のproduction dead codeはこの棚卸しでは確定しなかった。

- `src/craft.js`のenhance/polish系は現在`src/equip.js`から到達し、canonical simulationからも参照されるため、旧#669の記述をそのまま再利用しない。
- `CORE_REARGUARD`は#655で削除済み。
- `trapSense`は#672で退役済み。旧結果を再測定しない。
- `scratch/test_sim_follow_gate.js`の未知ファイルfixtureと`simulation_manifest.js`のstale guardは、検出機構自身のテストであり削除候補ではない。

「削除・単純化」へ直ちに分類できるものはなく、誤削除によるhistorical reproducibility破壊の方が大きい。#909で各ファイルのlifecycleを個別判定する。

## F. Browser testでしか保証できないdomain候補

`tests/`には`page.evaluate()`でproduction moduleをimportし、内部stateを直接組み立てるテストが残る。これは#812で課題化・整理済みだが、現行にもcombat、town submenu、movement、chest、equipmentの内部state検証がある。

- layout、viewport、canvas、safe-area、実DOMのcomputed boxはbrowserに残す。
- recovery amount、inventory mutation、screen transitionの純粋部分はunitへ寄せる余地がある。
- ただし本Issueでは#812の再実装をせず、該当候補を#909の分類対象として記録する。

## G. Performance

rendererにはmap/minimap/monster描画の反復処理があるが、現時点で実害のある遅延は確認していない。`bench_renderer_signature.js`等の計測資産はあるものの、#828でmicro-optimizationを行う根拠には不足する。

判定: P3・現状維持。frame time、長ログ、低性能モバイルで再現する計測結果が出た場合のみ、対象処理と閾値を記録してから改善する。

## Ponytail補助監査

Ponytailの実行ファイル/依存はworktreeに無かったため、提供されたPonytail skillのladderを既存コードへ一度適用した。これはarchitecture判断の代替ではなく、削除・単純化候補を拾う補助監査である。

| 観点 | 判定 |
| --- | --- |
| YAGNI / 存在不要か | #828本体で新しいframework、generic facade、全面refactorは不要。後続Issueだけを作る |
| 既存機構の再利用 | `view_state`、`rules/*`、`state/*`、`simulation_manifest`、`measurement_provenance`を再利用する |
| stdlib / native | 新規dependencyを追加しない。runnerの命名選択と既存Node/Playwright機能を維持する |
| 削除・単純化 | 現時点で安全に削除確定できるproduction codeは無し。historical simはlifecycle判定後に限る |
| architecture上必要 | save/apply normalization、view-state validation、chest phase guard、pure equipment preview、telemetry error isolationはLOCが増えても維持 |
| 保留 | chest/equip/rendererの分割方法、scratchの物理移動、browser内部state setupのunit移行 |

効果: 「大きいから分割」ではなく、変更理由・副作用・回帰テスト範囲が実際に縮む候補だけをIssue化できた。Ponytailの継続利用を恒久ルールにはしない。

## 今すぐ直す / 次の関連変更時 / 現状維持

### 今すぐ直す

- #828のinventoryと優先度を本ファイルへ記録する。
- 後続Issue #909〜#912を作成し、関連Issueと非目標を明記する。

### 次の関連機能変更時に直す

- #910: chest flowのpure rule / controller / view境界。
- #911: equipment action/stateとoverlay render境界。
- #912: renderer render input/view model境界。
- #909: scratch ownership、Issue番号付きtest、lifecycle整理。

### 現状維持

- #799/#800/#832/#833/#834/#835で導入済みのvalidation、phase、pure preview、save/apply、view-state境界。
- balance/equipment/craftのcanonical simulationとhistorical result。
- 実測根拠のないperformance変更。

## Canon / compatibility

この棚卸しではproduction behavior、save compatibility、game balanceを変更していない。既存のstate/view/save契約を後続Issueの制約として扱い、game design canonの変更は不要と判断した。
