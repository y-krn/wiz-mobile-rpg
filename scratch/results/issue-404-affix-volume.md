# Issue #404: affix volume sweep

Closes #404

## 結論

- `src/data/affixes.js` は変更せず、採用値はなし。
- 現行からの小幅な `conservative` は、平均総 affix 数を 3.24 から 3.64 に増やしても全run平均到達floorの差が +0.005 に留まり、効果は未観測。
- `balanced` で初めて全run平均到達floorが +0.075 動いたが、B5の突破率差は +2.9pt（CIが重なる）で、2個以上core率は 37.8% から 64.8% へ増えた。即興ビルドの希少性を損なう副作用が大きく、採用しない。
- #409 Phase 2 相当の +1 accessory slot を同じ #447 harness で追加測定したところ、全run平均floor は 3.542 [3.511, 3.574]。`balanced` 3.525、`high` 3.548 と同水準だが、B5平均 affix/core は 3.316/2.029 で base 水準に留まった。
- したがって深さだけなら `balanced` と競合するが、`balanced` / `high` は core過剰の副作用で採用できない。測定済みの #404 profile に acceptable な点がなく、現時点では #409 Phase 2 を進める。
- `upper` は #447 (2) の上界条件であり、現実的な採用値として扱わない。

## 測定条件

- ベースコミット: `0820a38`（origin/main、PR #447 merge後）。
- seed `444`、各 profile `SIM_RUNS=6600`、`SIM_CALIBRATION_RUNS=100`。
- `SIM_PARALLEL` は未指定。実行時の並列数は 15/15。
- `IDENTIFICATION_POLICY=powder`、開始粉 2、粉消費 1、`FLEE_POLICY=threshold`、HP閾値 0.35。
- 基本4職: Fighter / Thief / Priest / Mage。
- 7 scenarios を全て測定し、判定の主状態は `workshop-core-pools`。`workshop-complete` 単独では判定していない。
- `standard` equipment slots、`retain` slot/affix mode。`AFFIX_BALANCE` はメモリ上だけ profile に上書きし、生成後のソースデータは変更していない。
- 追加の #409 +1 測定は PR #447 と同じ `SIM_RUNS=2200`、`SIM_CALIBRATION_RUNS=100`、seed `444`、7 scenarios、基本4職で実行した。`SIM_AFFIXLESS_DUPLICATE_COUNT=1` とし、Phase 2 の第2装飾slotに合わせて accessory へ1個だけ affixless virtual duplicate を置いた。

## 掃引条件

budgets は `magic/rare` と `epic` をそれぞれ B1--B5 の配列で示す。構成と予算を同時に変更した。`magic` は `coreChance=1.00` のとき support 分岐を通らないため、1.00未満の fallback も profile に含めた。

| profile | magic/rare budget | epic budget | magic composition (support/core/chance) | rare composition (support/core/chance) | epic composition (support/core) |
| --- | --- | --- | --- | --- | --- |
| base | `[0,10,10,10,10,10]` | `[0,12,13,14,15,16]` | `1/1/1.00` | `2/1/.75` | `2/1` |
| conservative | `[0,14,16,18,20,22]` | `[0,18,21,24,27,30]` | `2/1/.95` | `3/1/.75` | `3/1` |
| balanced | `[0,20,22,24,26,28]` | `[0,28,31,34,37,40]` | `3/2/.90` | `4/2/.75` | `4/2` |
| high | `[0,25,28,31,34,37]` | `[0,38,42,46,50,54]` | `4/2/.85` | `5/2/.78` | `5/3` |
| upper (#447 (2)) | `[0,30,32,34,36,38]` | `[0,45,48,51,54,57]` | `5/3/.80` | `6/3/.80` | `7/3` |

## 掃引表

全run平均到達floorは7 scenariosを連結した N=46,200。B5の突破率・死亡率と affix/core 数は `workshop-core-pools` の B5 entrant 条件付きで、各 N は下表に記載した。括弧内は95% CI。

| profile | 全run平均到達floor [95% CI] | B5 entrant N | B5突破率 [95% CI] | B5死亡率 [95% CI] | 平均総affix数 [95% CI] | 平均core数 [95% CI] | 素材EV/時間 [95% CI] | bank素材EV [95% CI] | 工房買切(run開始) [95% CI] |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| base | 3.450 [3.434, 3.467] | 1466 | 34.0% [31.6, 36.4] | 30.5% [28.2, 32.9] | 3.239 [3.172, 3.305] | 2.013 [1.969, 2.057] | 0.1668 [0.1639, 0.1697] | 39.98 [38.94, 41.03] | 4.0% [3.0, 5.3] |
| conservative | 3.456 [3.439, 3.473] | 1504 | 34.0% [31.7, 36.5] | 28.9% [26.6, 31.2] | 3.642 [3.553, 3.732] | 1.945 [1.901, 1.990] | 0.1669 [0.1641, 0.1698] | 40.15 [39.11, 41.18] | 2.3% [1.6, 3.3] |
| balanced | 3.525 [3.507, 3.544] | 1555 | 36.9% [34.5, 39.3] | 27.9% [25.7, 30.2] | 5.863 [5.737, 5.989] | 3.665 [3.581, 3.749] | 0.1683 [0.1654, 0.1712] | 42.52 [41.34, 43.69] | 2.2% [1.5, 3.2] |
| high | 3.548 [3.529, 3.566] | 1537 | 37.2% [34.8, 39.7] | 26.7% [24.5, 28.9] | 6.472 [6.307, 6.638] | 3.641 [3.552, 3.730] | 0.1679 [0.1650, 0.1708] | 42.39 [41.22, 43.56] | 5.7% [4.5, 7.1] |
| upper (#447 (2)) | 3.583 [3.564, 3.603] | 1553 | 40.2% [37.8, 42.6] | 24.5% [22.4, 26.7] | 8.519 [8.299, 8.739] | 4.542 [4.428, 4.656] | 0.1714 [0.1685, 0.1744] | 44.38 [43.10, 45.66] | 2.7% [1.9, 3.7] |

工房買切率だけは、深層7条件とは別の `sim_workshop_progression.js` 経路で測った。各 profile 30 trials × 40 runs = N=1,200 run開始点の記述統計であり、trial単位の N=30 のCIから結論は引いていない。値が非単調なので knee とは呼ばない。

## 7 scenarios の監査

各セルは all-run 平均到達floor [95% CI]、各 scenario N=6,600。これにより `workshop-core-pools` 以外を捨てて判定していないことを示す。

| scenario | base | conservative | balanced | high | upper | #409 +1 slot |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| workshop-empty | 3.021 [2.985, 3.056] | 3.028 [2.991, 3.065] | 3.081 [3.041, 3.120] | 3.099 [3.058, 3.140] | 3.103 [3.062, 3.145] | 3.124 [3.056, 3.192] |
| workshop-stats | 3.250 [3.209, 3.291] | 3.264 [3.222, 3.305] | 3.302 [3.258, 3.346] | 3.335 [3.289, 3.381] | 3.355 [3.307, 3.402] | 3.309 [3.232, 3.385] |
| workshop-gear | 3.470 [3.427, 3.514] | 3.477 [3.433, 3.520] | 3.540 [3.493, 3.587] | 3.576 [3.527, 3.626] | 3.612 [3.560, 3.663] | 3.537 [3.457, 3.617] |
| workshop-blood-wand | 3.528 [3.482, 3.574] | 3.512 [3.467, 3.556] | 3.587 [3.538, 3.635] | 3.641 [3.590, 3.692] | 3.685 [3.632, 3.738] | 3.622 [3.538, 3.707] |
| workshop-blood-wand-spells | 3.609 [3.563, 3.655] | 3.612 [3.566, 3.658] | 3.693 [3.642, 3.743] | 3.679 [3.629, 3.729] | 3.692 [3.640, 3.744] | 3.774 [3.683, 3.864] |
| workshop-core-pools | 3.552 [3.505, 3.598] | 3.567 [3.520, 3.614] | 3.660 [3.608, 3.711] | 3.671 [3.618, 3.723] | 3.750 [3.694, 3.806] | 3.641 [3.552, 3.729] |
| workshop-complete | 3.724 [3.675, 3.773] | 3.730 [3.681, 3.780] | 3.816 [3.763, 3.869] | 3.833 [3.778, 3.887] | 3.887 [3.830, 3.945] | 3.790 [3.701, 3.879] |

既存5 profile は各 scenario N=6,600、追加 #409 +1 列は各 scenario N=2,200。Nが違うため、点推定とCIの重なりを記述し、順位の入れ替わりを結論にしていない。

## #409 Phase 2 相当（+1 slot）の比較

PR #447 の `(1)` は occupied base slot **それぞれ**に2個の duplicateを置く上界寄りの条件だった。今回の比較対象は Phase 2 の「装備数4→5」に合わせ、同じ affixless post-selection 変換を accessory に1回だけ適用した。B5 entrant の実測装備数は4.832、virtual slotは0.832で、accessoryが空のrunでは追加slotも空のままになる。これは容量の追加と供給による充足を分けて記録した値である。

| 条件 | 全run平均到達floor [95% CI] | core-pools B5 entrant N | B5突破率 [95% CI] | B5死亡率 [95% CI] | B5平均総affix | B5平均core | B5平均装備数 | B5平均virtual slot | bank素材EV [95% CI] | 素材EV/時間 [95% CI] |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| #404 base (N=6,600/profile) | 3.450 [3.434, 3.467] | 1466 | 34.0% [31.6, 36.4] | 30.5% [28.2, 32.9] | 3.239 [3.172, 3.305] | 2.013 [1.969, 2.057] | 4.000 | 0.000 | 39.98 [38.94, 41.03] | 0.1668 [0.1639, 0.1697] |
| #404 balanced (N=6,600/profile) | 3.525 [3.507, 3.544] | 1555 | 36.9% [34.5, 39.3] | 27.9% [25.7, 30.2] | 5.863 [5.737, 5.989] | 3.665 [3.581, 3.749] | 4.000 | 0.000 | 42.52 [41.34, 43.69] | 0.1683 [0.1654, 0.1712] |
| #404 high (N=6,600/profile) | 3.548 [3.529, 3.566] | 1537 | 37.2% [34.8, 39.7] | 26.7% [24.5, 28.9] | 6.472 [6.307, 6.638] | 3.641 [3.552, 3.730] | 4.000 | 0.000 | 42.39 [41.22, 43.56] | 0.1679 [0.1650, 0.1708] |
| #409 +1 accessory slot (N=2,200) | 3.542 [3.511, 3.574] | 513 | 38.0% [33.9, 42.3] | 25.3% [21.8, 29.3] | 3.316 [3.207, 3.424] | 2.029 [1.954, 2.105] | 4.832 [4.800, 4.865] | 0.832 [0.800, 0.865] | 42.43 [40.46, 44.39] | 0.1690 [0.1640, 0.1740] |

B5 core 2個以上率は #409 +1 が 74.5% [70.5, 78.0]、#404 base が 74.4% [72.1, 76.6]、balanced が 93.1% [91.7, 94.2]、high が 91.6% [90.1, 92.9]。#409 +1 は balanced/high と同程度の深さを示しながら、core過剰は再現していない。

## 副作用

粉は `workshop-core-pools` の全 run 平均、装備率は targetDepth=21 終了時の全 run。装備率は #442 の B20 endpoint と分母・時点が異なるため直接比較しない。2個以上率を、core過剰化の補助指標として併記する。

| profile | 粉入手/run | 粉消費/run | 残粉/run | 粉枯渇率 [95% CI] | 終了時core装備率 [95% CI] | 終了時core 2個以上率 [95% CI] |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| base | 6.854 | 5.973 | 0.881 | 51.5% [50.3, 52.7] | 67.0% [65.8, 68.1] | 37.8% [36.6, 39.0] |
| conservative | 6.877 | 6.002 | 0.875 | 51.7% [50.5, 52.9] | 66.4% [65.3, 67.5] | 36.8% [35.6, 38.0] |
| balanced | 7.040 | 6.161 | 0.878 | 51.8% [50.6, 53.0] | 66.9% [65.8, 68.0] | 64.8% [63.6, 65.9] |
| high | 7.075 | 6.185 | 0.890 | 51.3% [50.1, 52.6] | 65.6% [64.4, 66.7] | 63.2% [62.0, 64.4] |
| upper (#447 (2)) | 7.228 | 6.321 | 0.907 | 52.0% [50.8, 53.2] | 64.3% [63.2, 65.5] | 62.3% [61.1, 63.4] |

素材の run 平均は、取得 / 消費 / time cost の順で `base 57.681 / 0.148 / 234.7`、`conservative 57.923 / 0.149 / 236.8`、`balanced 61.824 / 0.175 / 249.3`、`high 62.358 / 0.177 / 250.8`、`upper 65.701 / 0.196 / 258.4`。素材EV/時間とbank素材EVは主表に載せた。

## 採用可否

- `conservative`: 3.24 -> 3.64 affix と増えたが、全run平均floorは 3.450 -> 3.456。CIが大きく重なり、改善は未観測。採用しない。
- `balanced`: 全run平均floorは 3.450 -> 3.525（+0.075）。B5突破率は 34.0% -> 36.9%、死亡率は 30.5% -> 27.9% だが、いずれも entrant N が条件ごとに異なる選別付き指標で、CIも重なる。一方、平均総affix 3.24 -> 5.86、平均core 2.01 -> 3.66、2個以上core率 37.8% -> 64.8% で、副作用が先に大きく出る。採用しない。
- `high` / `upper`: floor はそれぞれ +0.097 / +0.133 だが、総affix 6.47 / 8.52、2個以上core率 63.2% / 62.3%。upper は上界測定であり、現実的な採用値として扱わない。
- `#409 +1 accessory slot`: 全run平均floor 3.542 は balanced/high と同水準で、B5総affix/core 3.316/2.029 は base水準。深さとbuild rarityのトレードオフでは、測定済みの #404 profile より #409 +1 が優位。ただしNは #447 準拠の2,200で、profile間のCI差を有意差とは扱わない。
- 工房買切率は 4.0% -> 2.3% -> 2.2% -> 5.7% -> 2.7% と非単調で、単発の最大値を knee や採用根拠にしない。

## #409 との比較

以前の `+0.133 / +0.73` 比較は、#404側だけ現実的な profile、#409側は7.5 slot追加の上界であり不公平だったため撤回する。

同じ土俵で見ると、#409 +1 は全run平均floor 3.542 [3.511, 3.574]。#404 balanced 3.525 [3.507, 3.544]、high 3.548 [3.529, 3.566] とCIが重なり、#409 +1が明確に上回るとは言わない。一方、#409 +1のB5平均総affix/coreは3.316/2.029で、balanced/highの5.863/3.665、6.472/3.641よりbaseに近い。

深さだけなら低コストな #404 balanced も候補だが、balanced/high は core過剰の主動機破壊を理由に退けた。現実的な #404 profileに採用可能な点がないため、比較を修正した後も「#409 Phase 2を進める」という結論は維持する。ただし根拠は #409上界との倍率比較ではなく、**#409 +1が #404の深さ水準を、より小さいaffix/core副作用で得た**ことである。

## N設計と解釈上の留保

- PR #447 の `workshop-core-pools` base B5突破率 0.340、死亡率 0.302 を基準に、両側 α=.05、power=.80、最小検出差 5 percentage points の2率近似を事前に計算した。
- 必要 entrant N は突破率 1,455、死亡率 1,381。保守的に 1,455 entrant/arm とした。
- #447 の base entrant rate 494/2,200 = 0.2245 から、必要 run 数は `ceil(1455 / 0.2245) = 6480`。切り上げて各 profile 6,600 runs とした。実測 entrant N は 1,466--1,555。
- 追加の #409 +1 は「同じ harness・seed・N」というレビュー要求に合わせ、#447 と同じ 2,200 runs / calibration 100 を使用した。実測 B5 entrant N は513で、N<30ではない。ただし5pt差を主張する設計ではないため、#404 profileとのCI差から有意差は引かない。
- よって今回の設計は約5pt差を判定するためのもの。5pt未満の差がないとは主張しない。全主状態の entrant N は 30 以上で、N<30 の未確定値から結論は引いていない。
- entrant 条件は profile ごとに N が動くため、B5 endpoint は選別を含む。全run平均floorを必ず併記した。
- composition を変えると affix生成時の乱数消費順も変わる。同じ seed でも profile 間は paired ではなく、各条件の分布を比較する estimand とした。
- 直感に反する差は出ていないが、深い差を balance の因果効果と断定せず、生成構成変更を含む sim estimand として扱った。

## 出力 SHA / 実行時間

wall-clock は calibration と run phase を分離。CPU は run phase の user+system。raw JSONL と summary JSON は再現用の untracked output で、PRにはこの `.md` と harnessだけを含める。

深層7シナリオの再現コマンドは `SIM_ISSUE404_PROFILE=<profile> node scratch/sim_issue_404_affix_volume.js`（`SIM_PARALLEL` は指定しない）。

| profile | calibration wall | run wall | 総CPU（run） | raw JSONL SHA-256 | summary JSON SHA-256 |
| --- | ---: | ---: | ---: | --- | --- |
| base | 8.360s | 78.287s | 1162.235s | `ee37606ef351993f9e9647ba0d9909286971c99faa2998c5b914f1c49299e755` | `b07c62c59c05b8d09d9616e96ba115b285a24bcda4bf80a37e08e244a115a680` |
| conservative | 8.887s | 83.376s | 1237.278s | `4fe8a4f140027adfa46bd0a3cc5dc65b42920c430f4974d6c5798c5052fcacd3` | `5d3e034e38d3ec307392c00c59597c038ee94ca6e1162c1423803534bbe60e22` |
| balanced | 9.486s | 105.198s | 1561.125s | `4a7b51fe620e1b5feb0ef1937b14987780dd8bbd3920dbb8c8aaa012eca199a9` | `cee87b26ddc1be3dc50648f11436e59ac3399d26678f5a9a1027b8fdce65b3ac` |
| high | 9.020s | 110.654s | 1643.146s | `ab56c58850bec52df76f06cd99de4ad48f86319df17b20cc75de98017ad047c9` | `cd840833a7292e4b2f4cefbd95cea8eae55468b14dbf351b05e3ce6546c9f46e` |
| upper | 9.422s | 122.748s | 1818.945s | `22bde03b907f474cf46cf3c9be1389b1544cf31fdb055ec71e3bd6228fe99f1d` | `94a4489f1bee41caee01e8ffd2faae7b8a40e08e7314bfdc63431e934139d0a4` |

追加 #409 +1 の再現コマンドは `SIM_ISSUE446_CONDITION=slots-affix-plus1 SIM_AFFIXLESS_DUPLICATE_COUNT=1 SIM_AFFIXLESS_DUPLICATE_SLOT=accessory SIM_RUNS=2200 SIM_CALIBRATION_RUNS=100 node scratch/sim_issue_446_slot_vs_affix.js`（`SIM_PARALLEL` は指定しない）。

| condition | calibration wall | run wall | 総CPU（run） | raw JSONL SHA-256 | summary JSON SHA-256 |
| --- | ---: | ---: | ---: | --- | --- |
| #409 Phase 2 +1 accessory slot | 9.342s | 27.810s | 413.308s | `fbd23c06257127db701fd8a44142a3de7af0c274f24caef405cdb7441adef8fa` | `9e96447495476da08ea3c597d6a09e7e57cf696d31d8f6135c58df6cb070892d` |

工房買切測定は `SIM_ISSUE404_PROFILE=<profile> PROGRESSION_TRIALS=30 PROGRESSION_RUNS=40 node scratch/sim_issue_404_workshop_buyout.js`。stdout SHA / wall / CPU は以下。

| profile | stdout SHA-256 | wall | 総CPU |
| --- | --- | ---: | ---: |
| base | `6c6ffbe0edc3e65a502873640cd915abbddc7e018fe0ae6eeb865797626b524e` | 3.78s | 32.51s |
| conservative | `c57d11eeabfbf62963e9119890dd09e33bad8839ff5fa2eab47cdeee13fbca2e` | 3.94s | 33.03s |
| balanced | `92f6d081931cf3fecd163fce75088592d96997a72d1ac59e4ab6d0499f1e0cee` | 3.58s | 30.76s |
| high | `f8b83e6b9ddee3712753d20e456c12273aaf20c92e6ae31c20a699e9aeb0a732` | 3.84s | 33.10s |
| upper | `c0d4de8923c2a6ec37a870c536b1ae1fd8b5f9eaac3fa3a217d8bc6ffdf111bb` | 3.86s | 32.65s |

## SHA変更により取り直しが必要な過去測定

今回 `scratch/sim_depth_material_ev.js` に duplicate count / accessory slot filter を追加したため、既定値（count=2、slot filterなし）のraw outcomeは維持するが、厳密なrunner SHA比較では再取得対象になる。今回の追加測定に必要な過去結果は次のとおり。

- `scratch/results/issue-404-affix-volume.md` の base / conservative / balanced / high / upper の5 profile測定
- `scratch/results/issue-446-slot-vs-affix.md`（PR #447の base / unlimited / (1) / (2)）
- `scratch/results/issue-444-build-matching.md`
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

これは既定経路の挙動が変わったという意味ではなく、runner SHA変更後の再現性管理上の列挙である。今回のレビュー要求は +1 条件の追加測定なので、上記の再取得は行っていない。

## チェックリストと検証

- 適用: `.agents/balance-simulation.md`。Nを先に固定し、7条件、主状態、全run指標、entrant N、95% CI、副作用、乱数消費順の留保を記録した。
- 採用した所見: 小幅点では改善未観測、balanced以上は深さよりcore過剰が先行、#409のslot↑経路が優先。
- 却下した所見: upperを採用値とすること、単発の非単調な工房買切率を knee とすること、entrant endpointだけで全体改善と断定すること。
- 未適用: UI/mobile、browser、game-logic checklist。`src/` と UI は変更していない。

検証結果:

- `node scratch/test_sim_reward_paths.js` pass (33 sim files)
- `node scratch/test_core_affixes.js` pass
- `node scratch/test_departure_kit.js` pass
- `node scratch/test_eye_drops_craft.js` pass
- `npm run lint` pass
- `npm run test:unit` pass（62実行、3 skip）
- smoke: 既存 `(1)` は duplicate=2 / virtual slot平均6、追加条件は duplicate=1 / accessory指定で pass
- `npm run build` / `npm run test:browser` は `src/` 無変更のため未実行
