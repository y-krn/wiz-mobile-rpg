# Issue #446: slot 数と affix 総量の分離測定

## 平均総 affix / core 対照（主状態: `workshop-core-pools`）

平均値 CI は entrant 内の normal 95% CI。`total affixes` は装備中 affix インスタンス総数、`core` は core affix インスタンス数。`virtual slots` は `#2` 以降の仮想装備数。

| 条件 | B5 N | total affixes | core | support | 装備数 | virtual slots |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| base | 494 | 3.25 [3.14, 3.36] | 2.02 [1.95, 2.10] | 1.23 [1.12, 1.34] | 4.00 | 0.00 |
| unlimited slots | 550 | 8.72 [8.43, 9.00] | 4.53 [4.33, 4.72] | 4.19 [4.00, 4.38] | 11.81 | 7.81 |
| (1) slots↑ / affix 総量据え置き | 761 | 3.32 [3.22, 3.41] | 2.07 [2.01, 2.13] | 1.25 [1.16, 1.34] | 11.49 | 7.49 |
| (2) slots 据え置き / affix 総量↑ | 520 | 8.64 [8.26, 9.01] | 4.62 [4.42, 4.82] | 4.02 [3.67, 4.36] | 4.00 | 0.00 |

主状態で (1) は base と total affix **+0.06**、core **+0.05**。意図水準一致。(2) は unlimited slots と total affix **−0.08**、core **+0.09** で、平均の95% CIが重なり意図水準に揃った。7シナリオ全体では entrant の選別により水準差が残るセルがあるため、主状態を判定対象とする。

## 判定

**判定: 分離不能**。

事前定義した再現基準を「主状態で base 比の B5突破率・死亡率・到達floor が同方向に動き、2率の差 CI が 0 を跨がない」とした。

- (1) は突破 **+9.5pt [ +4.0, +15.0 ]**、死亡 **−16.0pt [ −20.7, −11.2 ]**、到達floor **+0.76 [ +0.49, +1.02 ]**。unlimited slots の改善方向・規模を再現。
- (2) は突破 **+7.9pt [ +2.0, +13.9 ]**、死亡 **−6.3pt [ −11.8, −0.9 ]**、到達floor **+0.73 [ +0.44, +1.02 ]**。主状態で3 endpointが同方向、2率差CIも0を跨がず、endpoint改善を再現。

ここで示した条件間の差CIは、各条件の entrant 比率・平均の95% CIから作った独立正規近似である。共通seedは使っているが、(2) は生成乱数の消費順が変わるため、対応runのpaired CIは使っていない。

したがって、この sim 条件群では (1) と (2) の両方が unlimited slots の主状態 endpoint 改善を再現し、スロット数そのものと affix 総量を分離できない。これは sim 条件の記述であり、スロット数または affix 総量の因果効果の証明ではない。#409 と #404 のどちらか一方をこの測定だけで優先する根拠にはならず、追加の識別条件が必要。

両方再現したため「分離不能」と判定した。どちらも再現しないケースではないため「別機構」とは判定しない。

## B5 endpoint 全7シナリオ

率は Wilson 95% CI。到達floor は entrant の mean normal 95% CI。`empty` など早期シナリオも測定し、判定は `workshop-core-pools` を主状態とした。

| 条件 | シナリオ | B5 N | 突破率 | 死亡率 | 到達floor |
| --- | --- | ---: | --- | --- | --- |
| base | empty | 318 | 24.2% [19.8, 29.2] | 39.6% [34.4, 45.1] | 5.57 [5.44, 5.70] |
| unlimited slots | empty | 370 | 37.0% [32.3, 42.1] | 24.9% [20.7, 29.5] | 6.56 [6.30, 6.83] |
| (1) | empty | 634 | 38.0% [34.3, 41.9] | 15.8% [13.1, 18.8] | 6.68 [6.48, 6.88] |
| (2) | empty | 331 | 31.4% [26.7, 36.6] | 36.3% [31.3, 41.6] | 6.16 [5.95, 6.38] |
| base | stats | 369 | 27.6% [23.3, 32.4] | 32.2% [27.7, 37.2] | 5.92 [5.75, 6.10] |
| unlimited slots | stats | 444 | 45.3% [40.7, 49.9] | 16.9% [13.7, 20.7] | 6.92 [6.67, 7.18] |
| (1) | stats | 645 | 40.5% [36.7, 44.3] | 15.5% [12.9, 18.5] | 6.90 [6.68, 7.11] |
| (2) | stats | 402 | 31.8% [27.5, 36.5] | 32.8% [28.4, 37.6] | 6.22 [6.02, 6.43] |
| base | gear | 457 | 30.6% [26.6, 35.0] | 28.2% [24.3, 32.5] | 5.99 [5.83, 6.15] |
| unlimited slots | gear | 531 | 39.9% [35.8, 44.1] | 18.6% [15.6, 22.2] | 6.76 [6.52, 6.99] |
| (1) | gear | 710 | 40.1% [36.6, 43.8] | 14.2% [11.8, 17.0] | 6.75 [6.55, 6.94] |
| (2) | gear | 507 | 35.9% [31.8, 40.2] | 26.4% [22.8, 30.4] | 6.55 [6.34, 6.77] |
| base | blood-wand | 476 | 38.7% [34.4, 43.1] | 25.6% [21.9, 29.7] | 6.34 [6.16, 6.52] |
| unlimited slots | blood-wand | 524 | 46.9% [42.7, 51.2] | 19.5% [16.3, 23.1] | 6.88 [6.66, 7.09] |
| (1) | blood-wand | 722 | 45.0% [41.4, 48.7] | 13.0% [10.8, 15.7] | 6.95 [6.75, 7.14] |
| (2) | blood-wand | 518 | 37.6% [33.6, 41.9] | 24.1% [20.6, 28.0] | 6.59 [6.38, 6.80] |
| base | blood-wand-spells | 511 | 36.4% [32.3, 40.7] | 30.1% [26.3, 34.3] | 6.25 [6.08, 6.42] |
| unlimited slots | blood-wand-spells | 565 | 45.7% [41.6, 49.8] | 19.5% [16.4, 22.9] | 6.74 [6.54, 6.94] |
| (1) | blood-wand-spells | 771 | 46.6% [43.1, 50.1] | 12.2% [10.1, 14.7] | 7.07 [6.88, 7.27] |
| (2) | blood-wand-spells | 539 | 38.6% [34.6, 42.8] | 25.4% [21.9, 29.3] | 6.60 [6.40, 6.81] |
| base | core-pools | 494 | 34.0% [30.0, 38.3] | 30.2% [26.3, 34.3] | 6.19 [6.01, 6.36] |
| unlimited slots | core-pools | 550 | 45.6% [41.5, 49.8] | 17.8% [14.8, 21.2] | 6.97 [6.73, 7.21] |
| (1) | core-pools | 761 | 43.5% [40.0, 47.0] | 14.2% [11.9, 16.9] | 6.94 [6.75, 7.14] |
| (2) | core-pools | 520 | 41.9% [37.8, 46.2] | 23.8% [20.4, 27.7] | 6.92 [6.69, 7.14] |
| base | complete | 521 | 34.7% [30.8, 38.9] | 29.0% [25.3, 33.0] | 6.33 [6.15, 6.52] |
| unlimited slots | complete | 586 | 43.9% [39.9, 47.9] | 15.5% [12.8, 18.7] | 7.06 [6.82, 7.29] |
| (1) | complete | 804 | 41.0% [37.7, 44.5] | 13.2% [11.0, 15.7] | 6.86 [6.67, 7.05] |
| (2) | complete | 554 | 39.4% [35.4, 43.5] | 21.1% [17.9, 24.7] | 6.84 [6.62, 7.07] |

## 7シナリオの affix/core 水準（点推定）

`affix/core` は B5 entrant 平均。条件 (2) はシナリオ別に unlimited と一致しないセルがある。特に `empty` / `stats` は affix と core の差が大きく、主状態以外の条件 (2) endpoint は補助的記述に留める。

| シナリオ | base N / affix / core | unlimited N / affix / core | (1) N / affix / core | (2) N / affix / core |
| --- | --- | --- | --- | --- |
| empty | 318 / 3.42 / 1.82 | 370 / 9.62 / 5.08 | 634 / 3.42 / 1.96 | 331 / 8.12 / 4.05 |
| stats | 369 / 3.40 / 1.86 | 444 / 9.43 / 4.74 | 645 / 3.39 / 1.99 | 402 / 8.04 / 4.12 |
| gear | 457 / 3.28 / 1.82 | 531 / 9.33 / 4.76 | 710 / 3.30 / 1.89 | 507 / 8.39 / 4.27 |
| blood-wand | 476 / 3.35 / 1.86 | 524 / 9.33 / 4.88 | 722 / 3.43 / 1.94 | 518 / 8.74 / 4.61 |
| blood-wand-spells | 511 / 3.35 / 1.79 | 565 / 9.38 / 4.76 | 771 / 3.37 / 1.86 | 539 / 8.52 / 4.43 |
| core-pools | 494 / 3.25 / 2.02 | 550 / 8.72 / 4.53 | 761 / 3.32 / 2.07 | 520 / 8.64 / 4.62 |
| complete | 521 / 3.43 / 2.16 | 586 / 9.83 / 4.89 | 804 / 3.43 / 2.18 | 554 / 8.59 / 4.62 |

## N 設計

主状態の過去値を保守的に使い、base `workshop-complete` の突破率 `p0=.347`、unlimited slots `p1=.439`、差 `Δ=.092` を検出対象にした。独立2率、両側 α=.05、power=.80 の近似:

```text
n = [1.96√(2 p̄(1−p̄)) + 0.842√(p0(1−p0)+p1(1−p1))]^2 / Δ^2
  = 441.25 entrant / arm → 442 entrant / arm
```

過去の base `workshop-core-pools` entrant 率 `494/2200=.2245` を保守的に適用すると `ceil(441.25/.2245)=1,966` run（整数 entrant 数を先に丸めると1,969 run）。PR #443 の反転実績、条件間の entrant 数変動、7シナリオの監査余地を含め `SIM_RUNS=2200` に固定。これは効果差の正式な power 保証ではなく、比較を500 runで止めないための設計。

全28セルの B5 N は最小318、N<30セルなし。各率 CI は未確定扱いにならない。ただし条件 (1) は endpoint 到達率が高く、条件 (2) は主状態以外の affix 水準が揃わないため、そこから追加の因果・無効果結論を引かない。

## 条件と estimand の非対称

共通: seed `444`、`SIM_RUNS=2200`、`SIM_CALIBRATION_RUNS=100`、`SIM_PARALLEL` 未指定（resolved 15 / available 15）、`IDENTIFICATION_POLICY=powder`、`FLEE_POLICY=threshold` (`0.35`)、基本4職、target depth 21、`generateRunFloor` を通る既存 `simulateRun`、TOWN_PORTAL・status cure・departure kit を既定sim方針でモデル化。

- `base`: 現行 rollComposition/budget、standard slot。
- `unlimited slots`: #445 の既存仮想slot。生成後の inventory item を同一typeの `type#2`、`type#3`…へ置ける。供給物・affixは増やさないが、装備中 item 数、素の装備値、core、support が増える。生成側乱数消費順は変えない。
- (1): standard slot で通常装備選択後、occupied base slot それぞれへ2個の affixless virtual duplicate を追加。既存 duplicate は次の装備選択前に除去し、通常装備選択への影響を抑える。追加 duplicate は affix/core/curse を持たず、乱数を消費しない。これは post-selection 変換であり、#445 の inventory item を全て保持する unlimited slot と完全同一 estimandではない。
- (2): sim import 前にメモリ上の `AFFIX_BALANCE` を変更。`rollComposition` は magic `{support:5, core:3, coreChance:.80}`、rare `{support:6, core:3, coreChance:.80}`、epic `{support:7, core:3}`。budget は magic/rare `[0,30,32,34,36,38]`、epic `[0,45,48,51,54,57]`。生成構成・coreChance・budget判定が変わるため、乱数消費順が変わる。`src/data/affixes.js` は変更していない。

したがって (2) は生成構成変更 estimand、unlimited slots は生成後 slot変換 estimand。(1) は生成後の deterministic affixless duplicateだが、標準選択を維持するため、unlimited slots と同一ではない。すべて sim 条件の比較であり、ゲーム制約・因果効果の主張ではない。

## 出力 SHA / 実行時間

wall-clock は calibration と run phase を分離。CPU は run phase の user+system。raw/summary JSON は再現用 untracked output。再現コマンドは `SIM_ISSUE446_CONDITION=<condition> node scratch/sim_issue_446_slot_vs_affix.js`。

| 条件 | calibration wall | run wall | 総CPU（run） | raw JSONL SHA-256 | summary JSON SHA-256 |
| --- | ---: | ---: | ---: | --- | --- |
| base | 8.837s | 35.625s | 529.629s | `aebc6b547317210b264cbf8b83ac27cf3cdfb507ef5fba8fa4d2336c140948cb` | `90ae7a961de975d6f30a256f31848014be8a1f896ea32aa345be13d0dcaeb5a9` |
| unlimited slots | 13.148s | 51.254s | 756.117s | `5cfbc832e22a0a0a92bad0a4f743b89465c135a8fcad84d22babcd44f18e4122` | `0c18c6469ef60caf7f94a85bd7ab8600189e0509f5e2692ff44c046454fa3f2e` |
| (1) slots↑ / affix総量据え置き | 12.652s | 43.431s | 644.013s | `75781bcd0580ce7e00a57a8fea0d74ddb7b1901f50be2ca436f802904bbfb2d0` | `17afbd76f6413e15447f0e6c1553278efebce78830ca21604ed0b5cf0d551b8b` |
| (2) slots据え置き / affix総量↑ | 9.533s | 32.025s | 474.955s | `3cf84c9e1cb877b9f28dfb12dc488df0d39eb8910f79d1dec4437d7a4066e497` | `3c16778ccf93a028bea0dd5c770f90857944397a1c274736696b5e4e18cde7d8` |

## SHA 変更により再取得が必要な過去測定

今回 `scratch/sim_depth_material_ev.js` に `affixless-duplicates` 条件と slot処理を追加した。既定 `standard` / `unlimited` の raw outcome は維持したが、共通runnerのソースSHAが変わったため、同一測定としてSHAを再利用できない。厳密比較が必要な過去結果:

- `scratch/results/issue-444-build-matching.md`（#445）
- `scratch/results/issue-271-quality-remeasure.md`
- `scratch/results/issue-270-real-src-measurement.md`
- `scratch/results/issue-271-atk-def-affix-unread.md`
- `scratch/results/issue-271-b5-milestone-encounter.md`
- `scratch/results/issue-271-resistance-integrity-progress.md`
- `scratch/results/issue-292-corrected-results.md`
- `scratch/results/issue-292-sim-parallel-progress.md`
- `scratch/results/issue-410-workshop-variety.md`
- `scratch/results/issue-419-identification-default.md`
- `scratch/results/issue-433-curse-lock.md`
- `scratch/results/issue-437-core-encounter.md`
- `scratch/results/issue-440-magic-core-chance.md`

これは過去結論が覆ったという意味ではなく、runner SHA変更後の再現性管理上の列挙。

## 検証

- smoke: `SIM_RUNS=10 SIM_CALIBRATION_RUNS=2 SIM_ISSUE446_CONDITION=base node scratch/sim_issue_446_slot_vs_affix.js` pass
- 4条件×7シナリオ、raw row key（scenario/run/class）重複なし pass
- `src/` 無変更
- `node scratch/test_sim_reward_paths.js` pass（31 files）
- `node scratch/test_core_affixes.js` pass
- `node scratch/test_departure_kit.js` pass
- `node scratch/test_eye_drops_craft.js` pass
- `npm run lint` pass
- `npm run test:unit` pass（62 tests、3 skip）

Closes #446
