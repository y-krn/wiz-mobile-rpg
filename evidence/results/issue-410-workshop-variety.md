Closes #410

# Issue #410 工房バリエーション測定・採用結果

測定日: 2026-08-07 JST。progression は N=30試行×40run、state/depth は
N=1000、startingGear掃引は戦士 N=1000。率は Wilson 95% CI、平均値は
正規近似95% CI。`N<30` の率は未確定として採用根拠に使わない。

## 結論

- 追加 core 6種の初段コストは10素材を維持する。既存 `pool_blood_wand` の
  `呪布5+黒角2=7` は変更しない。
- 戦士の純増 startingGear は `gear_fighter_saber` に置き換え、atk8・鉄/刃タグの
  `FIGHTER_SABER` を採用する。`SHORT_SWORD` atk6 に対して+2で、`LONG_SWORD`
  atk12の+6より強化幅を抑えた。sim caller の実装上の装備開始率は1000/1000
  =100.0% [99.6,100.0%; N=1000]であり、工房ノード取得率ではない。
- convenience は `convenience_identify_powder`（開始鑑定粉+1）を維持する。
  `powder` では実装された開始資源経路に効くが、`legacy` では識別処理が無効で、
  固定stateの差分はゼロだった。このpolicy依存を採用根拠に隠さない。
- 代表方針は `powder` とする。実ゲームの `executeEnterDungeon` は開始時に
  `IDENTIFICATION_BALANCE.startingPowder` を与え、鑑定時に `identifyTickets` を
  消費するためである。`legacy` は#231の旧sim互換（開始粉を実質的に使わず、
  装備を既鑑定扱い）であり、#236の方針感度を確認する反実仮想として併記する。
  powderを実プレイの全ユーザー行動の真値、またはlegacyに対する統計的優位とは
  主張しない。
- 序盤固定stateは一様に改善しておらず、powderで`stats`のbank EV -0.74/run、
  `empty`のEV/時間 -0.0040、legacyで`gear`のbank EV -2.75/runなどの回帰を残す。
  これらを採用版の無条件な改善とは扱わない。
- `workshop-complete` の終了時core 0個率は、origin/main 85.3% [83.0,87.4%;
  N=1000] → 採用版84.1% [81.7,86.2%; N=1000]。CIが重なるため統計的優位は
  主張せず、core未装備runが大半という構造も残る。

## cost=10の採用根拠

純増追加前の同一乱数系列の掃引で、cost 10はcost 7に対し平均到達階、B5突破率、
買い切り率（低いほどシンクが広い）、素材EV/時間の4指標で下回らなかった。
B5死亡率の0.3pt差はCIが重なるためノイズとして扱い、統計的優位は主張しない。
これは非単調な曲線のkneeではない。

| cost | 平均到達階 | B5突破率 | B5死亡率 | 買い切り率 | 素材EV/時間 |
| ---: | --- | --- | --- | --- | ---: |
| 7（旧採用） | B2.81 [2.70,2.91] | 16.2% [12.0,21.4%; N=235] | 59.1% [52.8,65.2%; N=235] | 13.3% [11.4,15.3%] | 0.1173 |
| **10（採用）** | **B2.87 [2.77,2.97]** | **17.1% [13.0,22.3%; N=251]** | **59.4% [53.2,65.3%; N=251]** | **11.5% [9.8,13.4%]** | **0.1256** |

6つのcoreは各7+3で10になったため、既存 `pool_blood_wand` との差額は3素材。
既存ノードのコスト、購入済みランク、セーブ形式は変更していない。純増追加後の
購入順はcost掃引の順位付けには使っていない。

## 純増ノードと取得率

取得率は `workshop-first / wing-first` のprogressionで、購入可能な工房ノードを
支払って取得する試行率。startingGearの使用率とは別指標である。

| ID | 内容 | コスト | powder取得率 | legacy取得率 |
| --- | --- | ---: | --- | --- |
| `gear_fighter_saber` | 戦士が `FIGHTER_SABER`（atk8）を開始装備候補に選べる | 獣の牙4＋鉄片2=6 | 30/30 = 100.0% [88.6,100.0%; N=30] | 30/30 = 100.0% [88.6,100.0%; N=30] |
| `convenience_identify_powder` | 潜行開始時の鑑定粉+1 | 霊粉5＋呪布2=7 | 17/30 = 56.7% [39.2,72.6%; N=30] | 15/30 = 50.0% [33.2,66.8%; N=30] |

追加ノードの取得率0%は観測していない。ただし取得率は購入方針の結果であり、
死に枝判定には使用率を使う。

## startingGear 候補掃引

戦士、target B20、seed231、各N=1000、calibration N=1000、
`IDENTIFICATION_POLICY=powder`。性能列は候補を明示的に選んだcounterfactual、
最後の列はノードを取得済みとしてcallerの「既定より強い互換候補を装備する」
経路を通した実装上の装備開始率である。購入率ではない。

| 候補 | atk | SHORT_SWORDとの差 | 平均到達階 | B5突破率 | B5死亡率 | bank/run | 素材EV/時間 | 装備開始率 |
| --- | ---: | ---: | --- | --- | --- | ---: | ---: | --- |
| DAGGER | 2 | -4 | 1.30 [1.27,1.34] | 0.0% [0.0,0.4%; N=1000] | 100.0% [20.7,100.0%; N=1] 未確定 | 3.07 | 0.0590 | 0.0% [0.0,0.4%; N=1000] |
| MACE | 5 | -1 | 1.38 [1.34,1.42] | 0.0% [0.0,0.4%; N=1000] | 100.0% [20.7,100.0%; N=1] 未確定 | 3.55 | 0.0635 | 0.0% [0.0,0.4%; N=1000] |
| SHORT_SWORD | 6 | 0 | 1.39 [1.36,1.43] | 0.0% [0.0,0.4%; N=1000] | 100.0% [43.8,100.0%; N=3] 未確定 | 3.68 | 0.0664 | 0.0% [0.0,0.4%; N=1000] |
| **FIGHTER_SABER** | **8** | **+2** | **1.51 [1.46,1.55]** | 0.0% [0.0,0.4%; N=1000] | 66.7% [20.8,93.9%; N=3] 未確定 | **4.35** | **0.0715** | **100.0% [99.6,100.0%; N=1000]** |
| LONG_SWORD | 12 | +6 | 1.57 [1.52,1.62] | 0.1% [0.0,0.6%; N=1000] | 71.4% [35.9,91.8%; N=7] 未確定 | 4.65 | 0.0690 | 100.0% [99.6,100.0%; N=1000] |

MACEは攻撃力・タグとも既定SHORT_SWORDを下回り、実装上の装備開始率も0%なので
採らない。LONG_SWORDは数値が高いが+6で強化幅が大きい。FIGHTER_SABERは既定を
上回り、RAPIER atk8と同じ帯で、工房ノード経由で戦士にだけ表示する開始候補である。
B5死亡率は全候補でN<30のため選定根拠に使わない。

## powder代表値: origin/main → 採用版

progression、`workshop-first / wing-first`、翼コスト8、鑑定粉コスト6、
seed278234、N=30×40、calibration N=1000、同じcaller経路で測定した。素材入手は
総入手量/run、bank/runは実際にrun終了時に銀行へ入った量であり、終了時bank残高
とは別である。

| 指標 | origin/main | 採用版 | 差分 |
| --- | ---: | ---: | ---: |
| 平均到達階 | B2.81 [B2.71,2.91; N=1200] | B2.92 [B2.81,3.02; N=1200] | +B0.11 |
| B5突破率 | 16.6% [12.4,21.9%; N=235] | 17.6% [13.4,22.7%; N=256] | +1.0pt |
| B5死亡率 | 63.0% [56.6,68.9%; N=235] | 55.1% [49.0,61.1%; N=244] | -7.9pt |
| 素材EV/時間 | 0.1164 | 0.1251 | +7.5% |
| 素材入手/run | 45.14 | 47.69 | +2.55 (+5.6%) |
| bank/run | 21.65 | 25.05 | +3.40 (+15.7%) |
| 工房買い切り率 | 16.3% [14.3,18.4%; N=1200] | 9.7% [8.1,11.5%; N=1200] | -6.6pt |

CIが重なるため、before/afterの差を統計的優位とは解釈しない。特にB5死亡率の
差は、次のstate分布変化と同一乱数系列の再測定で機構を点検したが、因果効果の
大きさを断定しない。

### round 2との比較可能性

前回本文のorigin/main baselineは`IDENTIFICATION_POLICY=legacy`、今回のbaseline
は`powder`である。したがって次の数値は同一条件ではなく、直接比較しない。

| 指標 | round 2（legacy） | round 3（powder） |
| --- | ---: | ---: |
| 平均到達階 | B2.98 | B2.81 |
| 素材EV/時間 | 0.1212 | 0.1164 |
| 素材入手/run | 49.30 | 45.14 |
| bank/run | 25.20 | 21.65 |
| 工房買い切り率 | 25.3% | 16.3% |

差分は方針変更を含むため、round 2の数値を今回のbeforeには使わない。

## legacy感度: origin/main → 採用版

同じseed・試行数で`IDENTIFICATION_POLICY=legacy`を追加測定した。legacyでは
開始鑑定粉を実質利用せず、`convenience_identify_powder`の純増効果は固定stateで
ゼロだった。従ってlegacyで「2つの純増が効いた」とは書かない。startingGearの
FIGHTER_SABERは別経路で実装上100%開始するため、純増の存在自体はpolicy非依存だが、
cost=10の有料化とcore到達時期を含む集計改善までは保証しない。

| 指標 | origin/main | 採用版 | 差分 |
| --- | ---: | ---: | ---: |
| 平均到達階 | B2.96 [B2.85,3.06; N=1200] | B2.87 [B2.77,2.98; N=1200] | -B0.09 |
| B5突破率 | 17.9% [13.7,23.0%; N=263] | 20.1% [15.5,25.6%; N=244] | +2.2pt |
| B5死亡率 | 56.3% [50.2,62.1%; N=263] | 58.2% [51.9,64.2%; N=244] | +1.9pt |
| 素材EV/時間 | 0.1267 | 0.1242 | -2.0% |
| 素材入手/run | 49.06 | 46.94 | -2.12 (-4.3%) |
| bank/run | 25.95 | 24.52 | -1.43 (-5.5%) |
| 工房買い切り率 | 25.6% [23.2,28.1%; N=1200] | 10.5% [8.9,12.4%; N=1200] | -15.1pt |

legacyの回帰は隠さない。代表判断は、実ゲームの開始資源・鑑定ticket callerを
表すpowderの表と、cost掃引の構造的事実に置く。legacyはpolicy感度の下限ではなく、
旧sim互換の別estimandである。

## 序盤固定stateとprogression集計の違い

固定state比較は各stateをあらかじめ与えた`simulateRun`のestimand、progressionは
各run終了後のbankから`purchaseWorkshopNode`を通じて次のstateを買うestimandである。
固定stateは同じ乱数系列をstateごとにリセットして比較した。

### powderの固定state

| state ID | origin 平均到達 / B5突破 / bank EV / EV時間 | 採用版 平均到達 / B5突破 / bank EV / EV時間 |
| --- | --- | --- |
| `workshop-empty` | B1.76 [1.68,1.84] / 0.6% [0.3,1.3] / 7.41 / 0.0842 | B1.83 [1.75,1.92] / 0.6% [0.3,1.3] / 7.72 / 0.0802 |
| `workshop-stats` | B1.93 [1.85,2.02] / 1.0% [0.5,1.8] / 7.83 / 0.0755 | B1.86 [1.79,1.94] / 0.4% [0.2,1.0] / 7.09 / 0.0751 |
| `workshop-gear` | B2.00 [1.91,2.09] / 1.4% [0.8,2.3] / 8.72 / 0.0791 | B2.02 [1.93,2.12] / 1.4% [0.8,2.3] / 9.74 / 0.0849 |
| `workshop-stats-plus-convenience` | B1.93 [1.85,2.02] / 1.0% [0.5,1.8] / 7.83 / 0.0755 | B1.88 [1.80,1.96] / 0.8% [0.4,1.6] / 7.75 / 0.0808 |
| `workshop-gear-with-pure` | B2.00 [1.91,2.09] / 1.4% [0.8,2.3] / 8.72 / 0.0791 | B2.02 [1.93,2.12] / 1.3% [0.8,2.2] / 9.18 / 0.0831 |

序盤stateは一様には改善しておらず、Acceptanceの「悪化なし」は満たしていない。
powderの差分は、`empty`が平均到達+B0.07、bank EV +0.31/runだがEV/時間
-0.0040、`stats`が平均到達-B0.07、B5突破率-0.6pt、bank EV -0.74/run、
EV/時間-0.0004、`gear`が平均到達+B0.02、B5突破率±0.0pt、bank EV
+1.02/run、EV/時間+0.0058である。純増を含めた`stats＋convenience`でも
bank EV -0.08/run、`gear＋pure`はbank EV +0.46/runに留まる。`empty`には
そもそも純増ノードを解放したstateを与えていないため補填経路がなく、`stats`でも
開始鑑定粉+1だけでは有料化したcore/stat投資の差を埋められなかった。これは観測値
からの限定的な説明であり、純増ノードの因果効果を過大主張しない。回帰は本文冒頭
で扱い、採用版が全stateを改善したとは主張しない。

legacy固定stateでは、convenienceを加えた行が元stateと完全一致した（`stats`:
bank EV 7.86→7.86、`gear`: 11.62→11.62）。これは開始粉をlegacy経路が使わない
事実と一致する。legacyの`gear`自体は11.62→8.87、EV/時間0.1012→0.0865の回帰が
残るため、こちらも隠さない。

### progression phaseで確認できる経路（事実）

powderのrun開始時phase分布は、origin/mainの
`stats 29.4% / startingGear 17.3% / bloodWand 28.4% / deep 5.8% / complete 16.3%`
から、採用版の
`stats 25.8% / startingGear 6.2% / bloodWand 0.3% / corePools 55.3% / complete 9.7%`
へ移った。買い切り率が16.3%→9.7%へ下がったのは、採用版では購入可能な素材を
全step完了まで使い切らず、corePools投資中のrunが増えたためである。

同じphase別のB5死亡率は、採用版で`stats 65.1% (N=43)`、`corePools 50.3%
(N=159)`、`complete 63.4% (N=41)`、origin/mainで`stats 70.0% (N=50)`、
`bloodWand 53.9% (N=76)`、`complete 68.0% (N=50)`だった。各phaseのCIは重なり、
phase差も統計的優位とは扱わない。なお採用版には、純増2ノードだけでなく、既存
coreの購入ゲートとcost変更も含まれるため、B5死亡率差を純増2ノードだけの効果とは
帰属できない。固定stateの`bank EV`と購入軌跡を含む集計`bank/run`は同じ量では
ない。採用版の集計改善は、`corePools`滞在runの増加、滞在中の到達・素材取得、
未購入分の銀行残高を合わせた結果であり、固定stateの各bank EVの単純な加重平均では
ない。

これは観測された経路に基づく説明であり、2ノード追加だけでB5死亡率差全体を
因果的に説明したものではない。powder B5死亡率のCIはorigin [56.6,68.9]と採用版
[49.0,61.1]で重なり、統計的優位は主張しない。legacyでは集計もB5死亡率56.3%→
58.2%と回帰しているため、方針依存を明記する。

## 出力SHA

raw outputはコミットせず、以下の再現コマンドの出力SHAを更新した。

各コマンドは adopted / `origin/main` の各worktreeで、同じ env と同じ乱数seedを
使って実行した（未指定のsim envも両方の既定値を一致させた）。

```sh
IDENTIFICATION_POLICY=powder STARTING_GEAR_SWEEP_RUNS=1000 STARTING_GEAR_SWEEP_CALIBRATION_RUNS=1000 SIM_SEED=231 node scratch/simulations/sim_starting_gear_sweep.js
PROGRESSION_ONLY_REFERENCE=1 PROGRESSION_TRIALS=30 PROGRESSION_RUNS=40 PROGRESSION_CALIBRATION_RUNS=1000 PROGRESSION_ENCOUNTER_SAMPLES=1000 PROGRESSION_SEED=278234 PROGRESSION_IDENTIFICATION_POLICY=powder node scratch/simulations/sim_workshop_progression.js
PROGRESSION_ONLY_REFERENCE=1 PROGRESSION_TRIALS=30 PROGRESSION_RUNS=40 PROGRESSION_CALIBRATION_RUNS=1000 PROGRESSION_ENCOUNTER_SAMPLES=1000 PROGRESSION_SEED=278234 PROGRESSION_IDENTIFICATION_POLICY=legacy node scratch/simulations/sim_workshop_progression.js
IDENTIFICATION_POLICY=powder STATE_COMPARISON_RUNS=1000 STATE_COMPARISON_CALIBRATION_RUNS=1000 SIM_SEED=231 node scratch/simulations/sim_workshop_state_comparison.js
IDENTIFICATION_POLICY=legacy STATE_COMPARISON_RUNS=1000 STATE_COMPARISON_CALIBRATION_RUNS=1000 SIM_SEED=231 node scratch/simulations/sim_workshop_state_comparison.js
IDENTIFICATION_POLICY=powder SIM_RUNS=1000 SIM_CALIBRATION_RUNS=1000 SIM_SCENARIOS=workshop-complete SIM_SEED=231 node scratch/simulations/sim_depth_material_ev.js
```

| 測定 | SHA-256 |
| --- | --- |
| startingGear sweep / powder | `d928a20aeed3cdb099a0b8b85ccdfd15e80c638851273ebc388c4edb6f3a0048` |
| progression / origin powder | `e803b4cb1fde34ca6d7ba5735aef1d27cde90bfb32c0e554a14aba2a8e9248ef` |
| progression / adopted powder | `e6277a2924bfb6efd392da40dd77378fdeb05eab6a863fbe243fd36cd249e297` |
| progression / origin legacy | `7f3f09520f8565b0cb86d7dd99bcc7d6cd7c9f65e883ffec5115b1614855407a` |
| progression / adopted legacy | `81eb99a4f54ee76553f8cb48d7bc9f3d3f85eea1b9fd6825e53dee538a356143` |
| state / origin powder | `cdf657791ce16bd21e53bce8364e0322f99ce6433c9db3172939a9526b8dc7b1` |
| state / adopted powder | `f1b544f3339ba4e56f90f42e2c332beeac9407e59b6153192c5df5c530b4aafe` |
| state / origin legacy | `6f7bdceea1f078eaaf402bfb67d1018b1cce59873b4f668216458040ebff3ab5` |
| state / adopted legacy | `f08d4479aa28d2746b6ca1240b76744d57a44076f434741d76ed7ea63d1f737c` |
| core retention / origin powder | `40d21443b31a5f18eeba0b89c43bd76a086388f5e404ea8e03c7d8405585508b` |
| core retention / adopted powder | `cbd56d5307b12d2178ba645bd8c40e77a440ecc686b731584c78587963b72ee0` |

## 適用チェックリストと検証

適用: `balance-simulation`、`game-logic`、`content-design`、`qa-regression`。
採用した指摘は、候補掃引の再実行、使用率と取得率の分離、policy別before/after、
state/progression estimandの分離、N<30未確定表示、cost10と既存blood-wandの差額の
明記である。`storageMax`/`dungeonMemory`は現行sim callerで経済効果を観測できず、
今回のconvenience候補には採用しなかった。消耗品を出発craftへ重複追加していない。

検証結果:

- `node scratch/tests/regression/test_sim_reward_paths.js` PASS
- `node scratch/tests/unit/test_core_affixes.js` PASS
- `node scratch/tests/unit/test_departure_kit.js` PASS
- `npm run lint` PASS
- `npm run test:unit` PASS（実行72本 / skip 0本）
- `npm run build` PASS
- `npm run test:browser` PASS（137 passed）
