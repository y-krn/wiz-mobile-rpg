# Issue #437: core遭遇率の天井・工房ゲート・core供給掃引

Closes #437

## 結論

現行の律速は遭遇率である。`workshop-core-pools`、B20、粉無制限では現行がコア遭遇 26.0% / 終了時装備 20.0%だが、全装備を epic相当かつ必ずcore付きにする生成後反実仮想では 99.6% / 95.4%まで上がる。したがって遭遇率には大きな上界があり、粉・呪いロック・装備選択だけでは説明し切れない。

ただし採用可能な knee は出なかった。`rare.coreChance` は 0.00→0.25→0.50→0.75 で遭遇率が 8.2→16.6→20.6→25.6%となる一方、副作用の順位は非単調で、隣接点のCIも重なる。rare/epic の core 2個化は予算追随なしでは出力が完全一致し、予算追随ありでも遭遇率 21.2%に下がった。magic にcoreを乗せる条件は遭遇 40.8% / 装備 30.8%（ビルド志向で 42.4% / 37.0%）と効くが、最も出やすいmagicの構成を全面的に変える二値反実仮想であり、段階的なkneeではない。

よって本PRでは `src/data/affixes.js` のbalance値を変更しない。`src/systems/equipment_generation.js` は、現行値（rare/epic `core: 1`）を変えず、設定値のcore個数を実際のrollへ渡せるようにした測定基盤変更だけを含む。ゲームデザイン上の「1装備1core」は現状設定のままなので、canonは変更していない。

## 測定条件

- 基準: `origin/main=80083b8453559332168e2b2dc7a9147deaeb3b9a`
- 固定深度: B20、`SIM_SEED=231`、`SIM_RUNS=500`、`SIM_CALIBRATION_RUNS=100`
- `SIM_PARALLEL` は指定していない。`scratch/sim_parallel.js` の既定値を使用した。
- 7状態を常に同時測定: `workshop-empty, workshop-stats, workshop-gear, workshop-blood-wand, workshop-blood-wand-spells, workshop-core-pools, workshop-complete`
- `IDENTIFICATION_POLICY=powder`
- 主表と副作用表は開始粉2（実装既定）。issue本文の #436 比較を揃えるため、天井表には開始粉 `unlimited` の補助測定も併記した。この追加条件はPR本文で明示する。
- 率は Wilson 95% CI。条件付き分母 N<30 は「未確定」とし、結論に使っていない。平均値の区間は既存simと同じ正規近似95% CI。
- 終了時core装備率は、run終了時に1個以上のcoreを装備していたrun率。定着率はcore遭遇runを分母にした終了時装備率。

新harnessは B20だけを各状態別workerで実行し、既存 #436 direct callerと同じ `seriesId=depth-20`、class/runIndex、calibration resetを使用した。B5/B10/B15を先に同一workerで流す方式はB20の乱数状態を汚染するため採用していない。

## 遭遇率の天井（中心結果）

### 開始粉 unlimited（#436比較軸）

`encounter-max` は生成後に、装備可能slotの装備をepic相当・必ずcore付きへ変換する。生成側の乱数消費順は変えないため、「この要因で説明できる上界」のestimandであり、因果効果ではない。

| 条件 | core遭遇率 | 終了時装備率 | 定着率 | 終了時0個率 |
| --- | --- | --- | --- | --- |
| 現行 | 26.0 [22.3,30.0] | 20.0 [16.7,23.7] | 76.9 [69.0,83.3; N=130] | 80.0 [76.3,83.3] |
| 遭遇率最大 | 99.6 [98.6,99.9] | 95.4 [93.2,96.9] | 95.8 [93.6,97.2; N=498] | 4.6 [3.1,6.8] |
| ビルド志向（score低下10%許容） | 24.2 [20.7,28.1] | 23.0 [19.5,26.9] | 95.0 [89.6,97.7; N=121] | 77.0 [73.1,80.5] |
| 両方 | 99.2 [98.0,99.7] | 96.6 [94.6,97.9] | 97.4 [95.6,98.5; N=496] | 3.4 [2.1,5.4] |

### 開始粉2（実装既定）

| 条件 | core遭遇率 | 終了時装備率 | 定着率 | 終了時0個率 |
| --- | --- | --- | --- | --- |
| 現行 | 25.6 [22.0,29.6] | 15.4 [12.5,18.8] | 60.2 [51.5,68.2; N=128] | 84.6 [81.2,87.5] |
| 遭遇率最大 | 99.0 [97.7,99.6] | 94.0 [91.6,95.8] | 94.9 [92.7,96.6; N=495] | 6.0 [4.2,8.4] |
| ビルド志向（score低下10%許容） | 22.2 [18.8,26.0] | 16.0 [13.0,19.5] | 72.1 [63.1,79.6; N=111] | 84.0 [80.5,87.0] |
| 両方 | 99.0 [97.7,99.6] | 95.4 [93.2,96.9] | 96.4 [94.3,97.7; N=495] | 4.6 [3.1,6.8] |

遭遇最大と両方で0個終了率は約4–6%まで下がるため、遭遇率の天井は低くない。一方、これは装備を常時得るゲーム状態の副作用を含む上界であり、即興ビルドの希少性を壊さない採用案を意味しない。

## 7工房状態と #415ゲート

開始粉2、現行core構成の7状態。`gate-off` は未購入でも全enabled core IDを解禁するsim-only反実仮想で、#415の工房ゲートが狭めるプールの上界を測った。

| 工房状態 | 現行 core遭遇率 | gate-off core遭遇率 | ゲートによる点差（現行−off） | 現行終了時装備率 |
| --- | --- | --- | ---: | --- |
| workshop-empty | 19.4 [16.2,23.1] | 16.0 [13.0,19.5] | +3.4pt | 10.6 [8.2,13.6] |
| workshop-stats | 20.6 [17.3,24.4] | 18.2 [15.1,21.8] | +2.4pt | 10.8 [8.4,13.8] |
| workshop-gear | 22.4 [19.0,26.3] | 19.2 [16.0,22.9] | +3.2pt | 11.6 [9.1,14.7] |
| workshop-blood-wand | 22.4 [19.0,26.3] | 25.6 [22.0,29.6] | −3.2pt | 10.4 [8.0,13.4] |
| workshop-blood-wand-spells | 21.8 [18.4,25.6] | 21.2 [17.8,25.0] | +0.6pt | 12.4 [9.8,15.6] |
| workshop-core-pools | 25.6 [22.0,29.6] | 25.6 [22.0,29.6] | 0.0pt | 15.4 [12.5,18.8] |
| workshop-complete | 23.2 [19.7,27.1] | 23.2 [19.7,27.1] | 0.0pt | 15.4 [12.5,18.8] |

主状態は既に7 core poolを解禁済みなので #415ゲートの点差は0.0pt。未購入状態では最大3.4ptだが、点差は同一seed反実仮想の記述値であり、すべてCIが重なる。血杖解禁済み状態の負の点差も、core poolの選択結果と後続経路が変わったsim上の非単調な揺れであり、「ゲートを戻すと遭遇率が上がる」という因果結論ではない。#415の判断を主状態について再評価するほどのゲート差は観測されなかった。

## Core側 sweep（開始粉2）

進行simの工房買い切り率は、固定深度とは別の補助測定 `PROGRESSION_TRIALS=10 × PROGRESSION_RUNS=50 = 500 run開始点`。主B20指標の N=500を置き換えない。B5 breakthrough/death は固定深度simのentrant条件付き値。

| 条件 | core遭遇率 | 終了時装備率 | 平均到達階 | B5突破率 | B5死亡率 | bank素材EV | 素材EV/時間 | 工房買切率 |
| --- | --- | --- | --- | --- | --- | ---: | ---: | --- |
| 現行 | 25.6 [22.0,29.6] | 15.4 [12.5,18.8] | 2.18 [2.03,2.32] | 14.8 [8.0,25.7; N=61] | 75.4 [63.3,84.5; N=61] | 11.78 | 0.0799 [0.0740,0.0858] | 14.4 [11.6,17.7] |
| rare coreChance=0.00 | 8.2 [6.1,10.9] | 3.0 [1.8,4.9] | 2.13 [2.00,2.26] | 5.3 [1.8,14.4; N=57] | 73.7 [61.0,83.4; N=57] | 9.80 | 0.0770 [0.0716,0.0824] | 20.4 [17.1,24.2] |
| rare coreChance=0.25 | 16.6 [13.6,20.1] | 9.8 [7.5,12.7] | 2.11 [1.98,2.25] | 16.4 [8.9,28.3; N=55] | 72.7 [59.8,82.7; N=55] | 10.01 | 0.0761 [0.0705,0.0816] | 16.4 [13.4,19.9] |
| rare coreChance=0.50 | 20.6 [17.3,24.4] | 12.8 [10.2,16.0] | 2.12 [1.96,2.27] | 27.5 [17.1,40.9; N=51] | 66.7 [53.0,78.0; N=51] | 11.15 | 0.0771 [0.0719,0.0822] | 11.2 [8.7,14.3] |
| rare coreChance=0.75 | 25.6 [22.0,29.6] | 15.4 [12.5,18.8] | 2.18 [2.03,2.32] | 14.8 [8.0,25.7; N=61] | 75.4 [63.3,84.5; N=61] | 11.78 | 0.0799 [0.0740,0.0858] | 14.4 [11.6,17.7] |
| rare/epic core=2、予算据え置き | 25.6 [22.0,29.6] | 15.4 [12.5,18.8] | 2.18 [2.03,2.32] | 14.8 [8.0,25.7; N=61] | 75.4 [63.3,84.5; N=61] | 11.78 | 0.0799 [0.0740,0.0858] | 14.4 [11.6,17.7] |
| rare/epic core=2、予算+10 | 21.2 [17.8,25.0] | 13.2 [10.5,16.4] | 2.01 [1.87,2.15] | 17.3 [9.4,29.7; N=52] | 71.2 [57.7,81.7; N=52] | 10.38 | 0.0809 [0.0752,0.0866] | 20.4 [17.1,24.2] |
| magic core=1、magic予算10 | 40.8 [36.6,45.2] | 30.8 [26.9,35.0] | 1.99 [1.86,2.12] | 15.4 [8.0,27.5; N=52] | 73.1 [59.7,83.2; N=52] | 9.96 | 0.0728 [0.0678,0.0779] | 14.6 [11.8,18.0] |

rareの点推定だけでは採用閾値を決めない。core=2予算+10は「予算だけでは効果ゼロ」という事前説明に反しない形で、core追加による構成・乱数消費の変更を含む別estimandになり、今回のNでは現行を上回る証拠にならない。magic-coreは遭遇率のCIが現行と分離し、ビルド志向では遭遇42.4 [38.1,46.8] / 装備37.0 [32.9,41.3] / 定着87.3 [82.1,91.1]だが、現行magic構成を全面変更するため採用しない。

#409 Phase 1で統合されたcore個数軸はこのcore=2 sweepで扱った。#409 Phase 2（第2装飾slot）とPhase 3（新部位）は変更・測定対象外。support側も遭遇率論点のため対象外。

## 副作用（主状態、開始粉2）

| 条件 | 平均到達階 | B5 entrant / 突破 / 死亡 | B10 entrant / 突破 / 死亡 | 素材EV/時間 | 粉 入手 / 消費 / 残量 / 枯渇率 |
| --- | --- | --- | --- | --- | --- |
| 現行 | 2.18 [2.03,2.32] | 12.2 [9.6,15.4] / 14.8 [8.0,25.7; N=61] / 75.4 [63.3,84.5; N=61] | 0.8 [0.3,2.0] / 0.0 [0.0,49.0; N=4] 未確定 / 0.0 [0.0,49.0; N=4] 未確定 | 0.0799 [0.0740,0.0858] | 4.62 / 3.81 / 0.82 / 50.0 [45.6,54.4] |
| 遭遇率最大 | 2.07 [1.93,2.21] | 9.8 [7.5,12.7] / 18.4 [10.0,31.4; N=49] / 73.5 [59.7,83.8; N=49] | 1.0 [0.4,2.3] / 80.0 [37.6,96.4; N=5] 未確定 / 0.0 [0.0,43.4; N=5] 未確定 | 0.0778 [0.0725,0.0831] | 4.53 / 3.61 / 0.92 / 47.0 [42.7,51.4] |
| ビルド志向 | 1.99 [1.86,2.12] | 8.0 [5.9,10.7] / 10.0 [4.0,23.1; N=40] / 80.0 [65.2,89.5; N=40] | 0.4 [0.1,1.4] / 50.0 [9.5,90.5; N=2] 未確定 / 50.0 [9.5,90.5; N=2] 未確定 | 0.0757 [0.0703,0.0810] | 4.33 / 3.32 / 1.00 / 43.8 [39.5,48.2] |
| 両方 | 2.10 [1.96,2.25] | 10.4 [8.0,13.4] / 25.0 [15.2,38.2; N=52] / 67.3 [53.8,78.5; N=52] | 1.4 [0.7,2.9] / 14.3 [2.6,51.3; N=7] 未確定 / 42.9 [15.8,75.0; N=7] 未確定 | 0.0742 [0.0690,0.0794] | 4.56 / 3.65 / 0.91 / 43.0 [38.7,47.4] |
| magic-core | 1.99 [1.86,2.12] | 10.4 [8.0,13.4] / 15.4 [8.0,27.5; N=52] / 73.1 [59.7,83.2; N=52] | 0.2 [0.0,1.1] / 0.0 [0.0,79.3; N=1] 未確定 / 0.0 [0.0,79.3; N=1] 未確定 | 0.0728 [0.0678,0.0779] | 4.38 / 3.56 / 0.82 / 45.6 [41.3,50.0] |

B10の突破率・死亡率は全条件で条件付きN<30となり未確定。そこから深度改善・死亡率改善を主張していない。開始粉unlimitedでは枯渇率は定義上0%で、粉消費は現行5.75/run、遭遇最大5.96/run、ビルド志向5.64/run、両方6.50/runとなる。

## RNG・因果・事実の区別

- 遭遇最大は生成後変換で、生成側の乱数消費順を維持した「説明可能な上界」。下流の装備・死亡・深度は変わる。
- core=2、magic-core、rareChance sweepは生成構成そのものを変更する。core roll数や候補poolが変わるため現行とestimandが違い、差分を因果効果として書かない。
- gate-offも候補poolと選択結果を変えるため同一seedの記述的反実仮想。非単調な状態差は「ゲートが有利/不利」と読まない。
- 「sim方針上のscore不足」はゲーム制約ではない。購入率・遭遇率を使用率と同一視しない。
- passive coreの「実発動率100%」は効果量ではないため、既存simの発動指標と効果量を分離する形式を維持した。

## SHA変更により取り直しが必要な過去測定

`scratch/sim_depth_material_ev.js`、`scratch/sim_workshop_progression.js`、および装備生成経路を変更したため、旧stdout SHAを監査値として再利用しない対象は次の通り。

- PR #430 / #436 のcore遭遇・装備・粉・B5/B10・素材EV測定
- `scratch/results/issue-433-curse-lock.md`
- `scratch/results/issue-419-identification-default.md`
- `scratch/results/issue-410-workshop-variety.md`
- `scratch/results/issue-292-corrected-results.md` / `issue-292-sim-parallel-progress.md`
- `scratch/results/issue-270-real-src-measurement.md`
- `scratch/results/issue-271-atk-def-affix-unread.md` / `issue-271-resistance-integrity-progress.md`
- PR #422のcore要因分解・`CORE_BLOOD_WAND`基準測定

現行条件の標準simは、変更前のorigin/main baselineと完全一致した。

- 標準7状態 stdout SHA-256: `05e95de9e45cbbbee956babddd6e77c9bd95b0acbdc4370bbff66bfd79492741`
- #437固定深度現行（JSON）: `62ccecb9af36ee6c7aefc9f78f8bd1142bb227e66d87f70c3366bdbe9079c88b`
- 遭遇率最大（開始粉2）: `979469890592bf877b3ea280a505be623737f8d057c85866ba998391d2686c39`
- ビルド志向（開始粉2）: `634ae293f9e72c67825a721598940cf2eda63478e43dddafe2a0c08e7bc4a9b6`
- 両方（開始粉2）: `203bcc6dfd3baf5063ea1a6534bc876e952b685a76dd3e790ebf13f864b0fb36`
- 7状態 gate-off（開始粉2）: `cca2ecfc5ba4783c9f7dd2efe779919aec32092b7878d7765f340cda9cf7a2aa`
- 現行（開始粉unlimited、#436整合確認）: `16e99dfb4a561e41b1ec460b071523e6e2b76ba5d5f8194a33b1f5a1a992392d`

raw dumpはコミットしない。上記SHAと再現コマンドで追跡する。

## 再現コマンド

```sh
SIM_SEED=231 SIM_RUNS=500 SIM_CALIBRATION_RUNS=100 \
IDENTIFICATION_POLICY=powder \
SIM_SCENARIOS=workshop-empty,workshop-stats,workshop-gear,workshop-blood-wand,workshop-blood-wand-spells,workshop-core-pools,workshop-complete \
node scratch/sim_issue_437_core_encounter.js
```

天井は上記に `SIM_CORE_ENCOUNTER_CEILING=epic-core`、ビルド志向は `SIM_CORE_SCORE_DROP_TOLERANCE=0.10`、gate-offは `SIM_CORE_WORKSHOP_GATE=off`、掃引は `SIM_437_CONDITION=rare-chance-0|rare-chance-0.25|rare-chance-0.5|rare-chance-0.75|core2-no-budget|core2-budgeted|magic-core` を追加する。

買い切り率の補助測定は `PROGRESSION_ONLY_REFERENCE=1 PROGRESSION_TRIALS=10 PROGRESSION_RUNS=50 PROGRESSION_CALIBRATION_RUNS=100 PROGRESSION_SEED=231 PROGRESSION_IDENTIFICATION_POLICY=powder` を追加して `node scratch/sim_workshop_progression.js`。これは買い切りrun開始点をN=500に揃えるためで、固定深度simの`SIM_RUNS=500`を代替しない。

## Review checklist

- 適用: `.agents/balance-simulation.md`、`.agents/game-design-equipment-builds.md`
- 採用した所見: 実srcの生成・装備選択・報酬経路を通し、Wilson CI、条件付きN<30、粉収支、深度、B5/B10、工房買い切りを確認した。
- 却下した所見: 単発点推定をkneeとすること、gate-offや生成変更を因果効果とすること、score不足をゲーム制約とすること。CI重複・estimand差のため。
- canon: `AFFIX_BALANCE` のbalance値は変更せず、1装備1coreの現行設計を維持した。

## Verification

- `node scratch/test_sim_reward_paths.js`: pass
- `node scratch/test_core_affixes.js`: pass
- `node scratch/test_departure_kit.js`: pass
- `node scratch/test_eye_drops_craft.js`: pass
- `npm run lint`: pass
- `npm run test:unit`: pass（73 files / skip 0）
- `npm run build`: pass
- `npm run test:browser`: pass（148 tests）
