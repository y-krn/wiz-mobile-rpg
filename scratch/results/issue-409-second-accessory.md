# Issue #409: 第2装飾スロット

## 結論

実在する第2装飾スロットを全8職に追加した。`origin/main` の base と比較した
全run平均到達floorは `3.450 [3.434, 3.467]` から
`3.521 [3.503, 3.539]` へ `+0.071`。PR #448 の affixless virtual
`+1 slot` の `3.542 [3.511, 3.574]` と同じオーダーで、実装版が大きく上振れする
結果ではない。

実装版は本物の装備を第2枠へ入れるため、B5 entrant の平均総affix/coreは
baseより増えた。これは virtual slot が affix・core・呪いを持たないこととの差であり、
深さ指標の過大差ではない。core 2個以上率は全run終了時で `37.8%` から `42.1%`
（`+4.3pt`）となったため、希少性の毀損を監視する副作用として記録する。

## 実装と設計判断

- `src/rules/equipment_slots.js` にslot定義を集約し、`id`（`accessory` / `accessory2`）と
  `itemType`（どちらも `accessory`）を分離した。`src/equip.js` はこの定義から装備中の
  5枠、ラベル、種別フィルターを生成する。
- 全8職へ一律に2枠を与えた。職業別に枠数を変えると、#215 / #172で扱う職業間格差へ
  slot容量という別の主レバーを重ねるため、Phase 2では差を付けない。
- coreのslot偏在は意図どおり受け入れた。accessoryのcore poolが8種で最多、weapon 5種、
  armor 2種、shield 1種なので、装飾2枠は最多poolへの露出を倍にする。ただしpool、生成率、
  affix値は変更していない。core 2個以上率を副作用として監視する。
- UIは装備中に「装飾1」「装飾2」を常時表示し、バッグの装飾選択時に2枠の装備先pickerを
  詳細パネル内へ置いた。フィルターは「装飾」のままにし、選択・装備先・実行ボタンを近接させ、
  各pickerを44px以上にした。
- `src/menu/solo_start.js` は種別の第1枠へ開始装備を入れる。`src/craft.js` は元から
  caller-provided slot keyを読むため、`accessory2`を種別へ戻す変更は行っていない。
  `src/state/codex_state.js` の `codex.equipment[baseId]` は図鑑として未変更。
- 既存セーブ破棄前提というIssue判断に従い、save migration、migration test、
  `RETIRED_WORKSHOP_NODES`返還処理は追加していない。Phase 3の新部位も未着手。

## 実行条件とN設計

深層測定は同じ runner、seed、7 scenarios、基本4職で実行した。

```sh
SIM_ISSUE404_PROFILE=base SIM_ISSUE409_SLOT_MODE=second-accessory \
SIM_RUNS=6600 SIM_CALIBRATION_RUNS=100 SIM_SEED=444 \
IDENTIFICATION_POLICY=powder FLEE_POLICY=threshold FLEE_HP_THRESHOLD=0.35 \
node scratch/sim_issue_404_affix_volume.js
```

`SIM_PARALLEL` は指定していない。実行時並列数は15/15、対象は
`workshop-empty`、`workshop-stats`、`workshop-gear`、`workshop-blood-wand`、
`workshop-blood-wand-spells`、`workshop-core-pools`、`workshop-complete`。
判定の主状態は `workshop-core-pools`。全run平均floorは7条件を連結したN=46,200、
B5の条件付き指標は同状態のB5 entrantを分母とした。

Nは、#448と同じくB5突破/死亡率の最小検出差5ポイント、両側α=.05、power=.80で
逆算した。必要entrantは突破1,455、死亡1,381。baseのentrant比率
`494/2200=0.2245` から `ceil(1455/0.2245)=6480` run、切り上げて各条件
6,600 runとした。今回の主状態のentrant Nはbefore 1,466、after 1,508で、
N<30の値から結論は引いていない。

## before / after

beforeはソース変更前にfresh fetchした `origin/main=ed10c12` を、afterは実装branchを
同じenvで実行した。括弧内は95% CI。

| 条件 | before | after | 差 |
| --- | ---: | ---: | ---: |
| 全run平均到達floor（N=46,200） | 3.450 [3.434, 3.467] | 3.521 [3.503, 3.539] | +0.071 |
| workshop-empty | 3.021 [2.985, 3.056] | 3.077 [3.037, 3.117] | +0.056 |
| workshop-stats | 3.250 [3.209, 3.291] | 3.317 [3.272, 3.361] | +0.067 |
| workshop-gear | 3.470 [3.427, 3.514] | 3.547 [3.500, 3.593] | +0.076 |
| workshop-blood-wand | 3.528 [3.482, 3.574] | 3.575 [3.526, 3.623] | +0.047 |
| workshop-blood-wand-spells | 3.609 [3.563, 3.655] | 3.682 [3.632, 3.731] | +0.073 |
| workshop-core-pools | 3.552 [3.505, 3.598] | 3.637 [3.586, 3.688] | +0.085 |
| workshop-complete | 3.724 [3.675, 3.773] | 3.816 [3.763, 3.868] | +0.092 |

### 主状態の副作用

| 指標 | before | after |
| --- | ---: | ---: |
| B5 entrant N | 1,466 | 1,508 |
| B5突破率 | 34.0% [31.6, 36.4] | 37.1% [34.7, 39.5] |
| B5死亡率 | 30.5% [28.2, 32.9] | 27.3% [25.1, 29.6] |
| B5平均総affix数 | 3.239 [3.172, 3.305] | 3.892 [3.813, 3.971] |
| B5平均core数 | 2.013 [1.969, 2.057] | 2.371 [2.320, 2.423] |
| 終了時core装備率 | 67.0% [65.8, 68.1] | 67.7% [66.6, 68.8] |
| 終了時core 2個以上率 | 37.8% [36.6, 39.0] | 42.1% [40.9, 43.3] |
| 素材EV/時間 | 0.1668 [0.1639, 0.1697] | 0.1689 [0.1660, 0.1717] |
| bank素材EV | 39.98 [38.94, 41.03] | 42.11 [40.97, 43.25] |
| 工房買切(run開始) | 8.2% [6.7, 9.9] | 11.8% [10.0, 13.7] |

B5突破/死亡率は entrant 条件付きで分母が変わるため、CIが重なる endpointの差を
全体改善とは解釈しない。工房買い切り率は深層7条件と別の
`sim_workshop_progression.js` 経路で、origin/mainの標準slotをbefore、実装slotをafterとして
同じ `PROGRESSION_ONLY_REFERENCE=1` 条件で測った。run開始Nは各1,200、trial単位は各N=30
なので、買い切り率の点推定を副作用として記録し、trial単位のN=30から順位や因果効果は主張しない。

## Virtual slotとのestimand差

PR #448の `+1 slot` は、同一inventory instanceの重複を避けたうえで、既存装飾を
affixless duplicateとして仮想追加する測定だった。仮想装備はaffix、core、呪いを持たず、
実在のinventory item選択や呪いロックを変えない。

今回の `second-accessory` は、装飾候補をinventoryから消費し、`accessory2`へ本物の
instanceとして装備する。したがってaffix/core/呪いが装備値、呪いロック、貪欲な交換順、
その後のrun経路へ入る。実装版のB5総affix/core増加はこの差で説明できる。深さの点推定は
virtual `3.542` に対して実装 `3.521` であり、実装版が大きく上振れしていない。
virtualのN=2,200と今回のN=46,200は異なるため、CIの重なりだけを順位逆転の根拠にはしない。

## 出力SHAと実行時間

before（origin/main、既存runner）:

- calibration wall: 8.754s
- run wall: 80.767s
- run CPU total: 1,199.717s
- raw JSONL SHA-256: `ee37606ef351993f9e9647ba0d9909286971c99faa2998c5b914f1c49299e755`
- summary JSON SHA-256: `c7a67fd1954af9e8b6b04b51ee1e6a013ed9b7cbe9441c7d034b19a4abcabecb`

after（実装slot）:

- calibration wall: 9.032s
- run wall: 81.853s
- run CPU total: 1,215.417s
- raw JSONL SHA-256: `5bc6eb10c2978d079ebf510bdf084ff4f44c20f0ad4e5df2698441cf31065022`
- summary JSON SHA-256: `52a32e9feeafa943329080c57afce8233285925281b755c0d4fe9899c41b764e`

工房買い切りの再現コマンドは次の通り。stdout SHAを記録し、主深層判定とは別経路として
扱う。

```sh
PROGRESSION_ONLY_REFERENCE=1 SIM_EQUIPMENT_SLOT_MODE=standard \
SIM_ISSUE404_PROFILE=base PROGRESSION_TRIALS=30 PROGRESSION_RUNS=40 \
node scratch/sim_issue_404_workshop_buyout.js

PROGRESSION_ONLY_REFERENCE=1 SIM_EQUIPMENT_SLOT_MODE=second-accessory \
SIM_ISSUE404_PROFILE=base PROGRESSION_TRIALS=30 PROGRESSION_RUNS=40 \
node scratch/sim_issue_404_workshop_buyout.js
```

- before stdout SHA: `bdd4765254cb76af943f132bce798d730026255706ee5d8f7eae9e8ebf3b9841`
  / wall 4.01s / CPU 33.96s
- after stdout SHA: `136a919700b34d20ff5fcdcd67ec897c0157fca91fa907abba2c86ecdaad35db`
  / wall 4.10s / CPU 36.86s

追加の標準モード対照（同じbranchで `SIM_ISSUE409_SLOT_MODE=standard`）は、
all-run平均floorがbeforeと完全一致した。`src/`とsnapshot表現の変更によりraw SHAは
変わるが、ゲーム結果の主要指標は一致した。

## SHA変更により取り直しが必要な過去測定

`src/state/initial_state.js`のequipment shape、`src/equip.js`のslot処理、
`scratch/sim_depth_material_ev.js`のslot modeとempty-slot snapshot filterを変更したため、
厳密なrunner/source SHA比較では次の既存測定が再取得対象になる。今回はIssue #409のbefore/after
と標準モード対照だけを取り直した。

- `scratch/results/issue-404-affix-volume.md` の base / conservative / balanced / high / upper
- `scratch/results/issue-446-slot-vs-affix.md`
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

これは既定経路の結果が変わったという意味ではなく、runner/source SHA変更後の再現性管理上の
列挙である。

## チェックリスト

- 適用: `.agents/balance-simulation.md`、`.agents/game-logic.md`、`.agents/mobile-ui-ux.md`、`.agents/qa-regression.md`。
- 採用: Nを先に固定、7条件、主状態、全run指標、entrant N、95% CI、core 2個以上率、素材EV、bank素材EV、estimand差を記録した。
- 却下: core/affixを増やすための別balance profile、職業別slot差、Phase 3の新部位。core poolや値の変更は行わなかった。
- 未着手: Phase 3（新部位）。
