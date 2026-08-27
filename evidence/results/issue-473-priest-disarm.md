# Issue #473 — 僧侶の宝箱解除率切り分け

## 結論

**実挙動。** 宝箱単位の分子・分母・floor/path合計は全caseで一致し、僧侶の ceiling における解除率低下は開封 floor 構成比だけでは説明できない。ceilingではTRAP_KIT中心だったcurrentに、解除成功率の低い直接解除試行が追加され、同じ disarm-attempt 分母へ入る実挙動と判定した。
- Priest / workshop-core-pools / smart: attempts 6079→7044、kit 6079→6020、direct 0→1024、forced 258282→256551。
- 解除率は `chestDisarmSuccesses / chestDisarmAttempts`。TRAP_KIT成功と直接解除成功を合算する既存endpointは変更せず、経路別・floor別診断を追加した。balance値、#468 A1/A2判定は変更しない。
- したがって本件は balance 修正ではなく、対策 affix 評価時に「解除率」と「解除試行経路」を分けて読むべき実挙動。集計バグではないため、#326 / #346 / #354 / #398 の既存rate集計を一括無効化・再取り直しする対象はない。追加のfloor/path診断が必要な測定だけは別途再測定する。

## 天井判定

**動かない。** 天井条件でも A1 / A2 acceptance criteria を全主状態・両 cure で満たさない。
露出は #271 の答えではない。第2段（保有率の掃引）は実施しない。
- ここでの「動かない」は #271 の受入基準に対する判定。floorが動かないという意味ではない。

## 測定条件

- PR #472 本文の測定条件・SHA・envを再現。#461 / PR #469 の固定基準線ではない。
- seed=271、基本4職、target depth=21。主状態=workshop-core-pools / workshop-complete、cure=smart / never。
- 現行値: 装備 10/15/20 / 装身具 10/15。biome側 gimmicks.trapBonus は変更・使用なし。
- ceiling: B5 entry直前の既生成装備へ trapBonus 20 を追加・既存値より低い場合は20へ引上げ。乱数消費なし。B5 entrant以外へ適用なし。
- sim側の宝箱解除判断閾値=50.0%。TRAP_KITがあれば先に確定成功、無ければ chance >= 閾値だけ直接解除を試み、未満なら強行する実経路（scratch/simulations/sim_depth_material_ev.js:resolveChestTrapForSimulation）。
- 実ゲーム側は src/chest.js:347 executeDisarm → src/rules/trap_rules.js:131 calculateChestDisarmChance。simも同じ判定関数を呼び、式の再掲はしていない。
- 罠致死性、解除式、宝箱生成、trapSense値、balance source値は変更なし。

## N設計

- A1はB5 entrant全体を職内combatBuildScore quartileに分けたQ4−Q1差。#467参照値は workshop-core-pools=-0.0061、workshop-complete=-0.1630。A2はB5 entrant全体の職内centered相関。#467参照値は r=0.1650（受入gate r≥0.2000）。
- #467と同オーダーの entrant N=11,000 を目標。有群率では割らない。ceiling 有群率1.0 は変換対象を決めるだけで、entrant分母を増やさない。
- B5 entrant率0.2199から ceil(11,000 / (0.2199 × 1.0)) = 50,023 run/cell。実測 50,100 run/cell（上式以上）。
- entrant N=11,000なら quartile 1つ約2750。A1の二群率差をBernoulli分散最大で近似した95%半幅は±0.0264（±2.64pt）。
- A2のFisher-z標準誤差=0.00954、95%半幅 z=0.01869。r=0.1650で近似CI [0.1468, 0.1831]。
- 現行 control の実trapBonus保有率は診断値。A1/A2の分母は常に全B5 entrant。

## A1 / A2 / A3

- workshop-core-pools / smart: B5 entrant control=11203 / placebo=11203 / ceiling=11203。
  - A1 control=不成立 Q4−Q1=-0.0673 [-0.0908, -0.0439] / ceiling=不成立 Q4−Q1=-0.0748 [-0.0983, -0.0514]; Q4死亡率=27.7% [26.1%, 29.4%]; monotonic=不成立。
  - A2 control=不成立 r=0.1403 [0.1221, 0.1584] / ceiling=不成立 r=0.1314 [0.1132, 0.1496]。
  - A3 control→ceiling: coreCount=成立 / combatCoreCount=成立 / economyCoreCount=不成立 / coreWithMatchingSupport=不成立 → coreCount=成立 / combatCoreCount=成立 / economyCoreCount=不成立 / coreWithMatchingSupport=不成立。
- workshop-core-pools / never: B5 entrant control=10955 / placebo=10955 / ceiling=10955。
  - A1 control=不成立 Q4−Q1=-0.0815 [-0.1052, -0.0578] / ceiling=不成立 Q4−Q1=-0.0563 [-0.0798, -0.0328]; Q4死亡率=28.2% [26.6%, 30.0%]; monotonic=不成立。
  - A2 control=不成立 r=0.1400 [0.1216, 0.1583] / ceiling=不成立 r=0.1290 [0.1105, 0.1474]。
  - A3 control→ceiling: coreCount=成立 / combatCoreCount=成立 / economyCoreCount=不成立 / coreWithMatchingSupport=成立 → coreCount=成立 / combatCoreCount=成立 / economyCoreCount=不成立 / coreWithMatchingSupport=成立。
- workshop-complete / smart: B5 entrant control=12359 / placebo=12359 / ceiling=12359。
  - A1 control=不成立 Q4−Q1=-0.0703 [-0.0920, -0.0485] / ceiling=不成立 Q4−Q1=-0.0822 [-0.1040, -0.0605]; Q4死亡率=24.4% [23.0%, 26.0%]; monotonic=不成立。
  - A2 control=不成立 r=0.1609 [0.1436, 0.1780] / ceiling=不成立 r=0.1473 [0.1300, 0.1645]。
  - A3 control→ceiling: coreCount=成立 / combatCoreCount=成立 / economyCoreCount=不成立 / coreWithMatchingSupport=不成立 → coreCount=成立 / combatCoreCount=成立 / economyCoreCount=不成立 / coreWithMatchingSupport=不成立。
- workshop-complete / never: B5 entrant control=12141 / placebo=12141 / ceiling=12141。
  - A1 control=不成立 Q4−Q1=-0.0867 [-0.1087, -0.0648] / ceiling=不成立 Q4−Q1=-0.0709 [-0.0931, -0.0487]; Q4死亡率=26.6% [25.0%, 28.2%]; monotonic=不成立。
  - A2 control=不成立 r=0.1376 [0.1202, 0.1551] / ceiling=不成立 r=0.1113 [0.0937, 0.1288]。
  - A3 control→ceiling: coreCount=成立 / combatCoreCount=成立 / economyCoreCount=不成立 / coreWithMatchingSupport=不成立 → coreCount=成立 / combatCoreCount=成立 / economyCoreCount=不成立 / coreWithMatchingSupport=成立。
- #468のAcceptanceは A1 / A2 / A3 の3本すべて成立で #271解決。A1 / A2 は4セルすべて不成立なので、A3がcontrolで成立していても、ceilingで成立していても、打ち切り判定は変わらない。
- A1 Q4−Q1は職内centered、A2は職内centered Fisher z、A3も職内centered。率=Wilson 95% CI、相関=Fisher z 95% CI、平均/差=正規近似95% CI。
- N<30は未確定。CIが0を跨ぐ指標は効果なしと断定しない。

## placebo / ceiling paired

- placebo−current: paired。全 200400 pairで randomSequenceId監査。現行値・群定義のみの差は次の通り。
- smart:workshop-core-pools: floor=+0.000 [0.000, 0.000] / B5死亡=+0.000 [0.000, 0.000] / B5突破=+0.000 [0.000, 0.000]; 同一結果pair=50100/50100。
- smart:workshop-complete: floor=+0.000 [0.000, 0.000] / B5死亡=+0.000 [0.000, 0.000] / B5突破=+0.000 [0.000, 0.000]; 同一結果pair=50100/50100。
- never:workshop-core-pools: floor=+0.000 [0.000, 0.000] / B5死亡=+0.000 [0.000, 0.000] / B5突破=+0.000 [0.000, 0.000]; 同一結果pair=50100/50100。
- never:workshop-complete: floor=+0.000 [0.000, 0.000] / B5死亡=+0.000 [0.000, 0.000] / B5突破=+0.000 [0.000, 0.000]; 同一結果pair=50100/50100。
- ceiling−current: paired。post-generation / random consumption preserved / trajectory diverges。
- smart:workshop-core-pools: floor=+0.0185 [0.0104, 0.0266] / B5死亡=+0.0107 [0.0031, 0.0183] / B5突破=+0.0006 [-0.0065, 0.0077] / 生還=-0.0088 [-0.0107, -0.0069]。
- smart:workshop-complete: floor=+0.0237 [0.0153, 0.0322] / B5死亡=+0.0018 [-0.0053, 0.0088] / B5突破=+0.0072 [0.0007, 0.0137] / 生還=-0.0081 [-0.0101, -0.0061]。
- never:workshop-core-pools: floor=+0.0247 [0.0169, 0.0325] / B5死亡=-0.0016 [-0.0091, 0.0060] / B5突破=+0.0106 [0.0035, 0.0177] / 生還=-0.0066 [-0.0085, -0.0047]。
- never:workshop-complete: floor=+0.0147 [0.0063, 0.0230] / B5死亡=+0.0098 [0.0028, 0.0168] / B5突破=-0.0008 [-0.0075, 0.0058] / 生還=-0.0110 [-0.0129, -0.0090]。

## runを楽にしていないか

- workshop-core-pools / smart: B5死亡 28.7% [27.9%, 29.6%]→29.8% [28.9%, 30.6%]、突破 34.4% [33.6%, 35.3%]→34.5% [33.6%, 35.4%]、全run平均floor 3.58 [3.57, 3.60]→3.60 [3.58, 3.62]。paired ceiling−currentは floor=+0.0185 [0.0104, 0.0266] / B5死亡=+0.0107 [0.0031, 0.0183] / B5突破=+0.0006 [-0.0065, 0.0077]。点推定方向=混在/不明、CI判定=未確定。
- workshop-core-pools / never: B5死亡 29.8% [28.9%, 30.7%]→29.6% [28.8%, 30.5%]、突破 33.3% [32.4%, 34.2%]→34.3% [33.5%, 35.2%]、全run平均floor 3.55 [3.53, 3.56]→3.57 [3.55, 3.59]。paired ceiling−currentは floor=+0.0247 [0.0169, 0.0325] / B5死亡=-0.0016 [-0.0091, 0.0060] / B5突破=+0.0106 [0.0035, 0.0177]。点推定方向=易化、CI判定=未確定。
- workshop-complete / smart: B5死亡 26.8% [26.0%, 27.6%]→27.0% [26.2%, 27.8%]、突破 35.4% [34.5%, 36.2%]→36.1% [35.2%, 36.9%]、全run平均floor 3.74 [3.72, 3.75]→3.76 [3.74, 3.78]。paired ceiling−currentは floor=+0.0237 [0.0153, 0.0322] / B5死亡=+0.0018 [-0.0053, 0.0088] / B5突破=+0.0072 [0.0007, 0.0137]。点推定方向=混在/不明、CI判定=未確定。
- workshop-complete / never: B5死亡 27.0% [26.3%, 27.8%]→28.0% [27.2%, 28.8%]、突破 36.0% [35.1%, 36.8%]→35.9% [35.0%, 36.7%]、全run平均floor 3.71 [3.69, 3.72]→3.72 [3.70, 3.74]。paired ceiling−currentは floor=+0.0147 [0.0063, 0.0230] / B5死亡=+0.0098 [0.0028, 0.0168] / B5突破=-0.0008 [-0.0075, 0.0058]。点推定方向=混在/不明、CI判定=未確定。
- run易化は3指標すべてが望ましい方向へ95% CIで0を跨がない場合だけ「安定易化」。今回のセル別集計: 安定易化=0 / 安定悪化=0 / 未確定=4。
- 天井は floor を動かす。paired ceiling−current は4セル全て +0.0147〜+0.0247階、各95% CIが0を跨がない（floor移動=成立）。ただし効果量は小さく、A1 / A2の受入基準は動かない。「動かない」は受入基準についての判定。
- B5死亡は悪化方向かつ95% CIが0を跨がないセルあり: smart:workshop-core-pools +0.0107 [0.0031, 0.0183] / never:workshop-complete +0.0098 [0.0028, 0.0168]。floorが伸びて深層へ到達したrunの選別が変わった解釈と整合するが、今回出力だけでは因果を確定しない。

## 宝箱単位 floor / 選別効果

- `opened` はsimが実際に拾った宝箱単位の floor 構成。階層別解除率の分母は従来 endpoint と同じ disarm attempt、分子はその成功。各率・各構成比は Wilson 95% CI。
- 選別効果の再重み付けは current の階層別解除率を固定し、ceiling の disarm-attempt floor 構成へ適用。構成比で説明できるかの判定は点推定、構成要素のCIと混同しない。
- workshop-core-pools / smart / Fighter:
  - 開封 floor 構成 current: B1=90426 (40.1% [39.9%, 40.3%]) / B2=78781 (34.9% [34.7%, 35.1%]) / B3=42802 (19.0% [18.8%, 19.1%]) / B4=12286 (5.4% [5.3%, 5.5%]) / B5=1254 (0.6% [0.5%, 0.6%]) / B6=114 (0.1% [0.0%, 0.1%]) / B7=46 (0.0% [0.0%, 0.0%]) / B8=25 (0.0% [0.0%, 0.0%]) / B9=6 (0.0% [0.0%, 0.0%])。
  - 開封 floor 構成 ceiling: B1=90426 (40.1% [39.9%, 40.3%]) / B2=78781 (34.9% [34.7%, 35.1%]) / B3=42802 (19.0% [18.8%, 19.1%]) / B4=12286 (5.4% [5.4%, 5.5%]) / B5=1267 (0.6% [0.5%, 0.6%]) / B6=84 (0.0% [0.0%, 0.0%]) / B7=33 (0.0% [0.0%, 0.0%]) / B8=10 (0.0% [0.0%, 0.0%]) / B9=7 (0.0% [0.0%, 0.0%]) / B10=1 (0.0% [0.0%, 0.0%])。
  - 階層別解除率 current: B2=100.0% [99.6%, 100.0%] (attempt=1047) / B3=100.0% [99.4%, 100.0%] (attempt=694) / B4=100.0% [98.7%, 100.0%] (attempt=294) / B5=100.0% [90.4%, 100.0%] (attempt=36) / B7=100.0% [34.2%, 100.0%; N<30 未確定] (attempt=2)。
  - 階層別解除率 ceiling: B2=100.0% [99.6%, 100.0%] (attempt=1047) / B3=100.0% [99.4%, 100.0%] (attempt=694) / B4=100.0% [98.7%, 100.0%] (attempt=294) / B5=75.5% [62.4%, 85.1%] (attempt=53) / B6=70.0% [39.7%, 89.2%; N<30 未確定] (attempt=10) / B7=100.0% [20.7%, 100.0%; N<30 未確定] (attempt=1)。
  - 分岐集計 current: B1=kit0/direct0/force58733 / B2=kit1047/direct0/force55290 / B3=kit694/direct0/force33647 / B4=kit294/direct0/force10468 / B5=kit36/direct0/force1103 / B6=kit0/direct0/force88 / B7=kit2/direct0/force38 / B8=kit0/direct0/force19 / B9=kit0/direct0/force5。
  - 分岐集計 ceiling: B1=kit0/direct0/force58733 / B2=kit1047/direct0/force55290 / B3=kit694/direct0/force33647 / B4=kit294/direct0/force10468 / B5=kit31/direct22/force1092 / B6=kit4/direct6/force63 / B7=kit1/direct0/force26 / B8=kit0/direct0/force7 / B9=kit0/direct0/force4 / B10=kit0/direct0/force1。
  - 選別効果判定: 実測Δ=-0.76pt / current階層率固定・ceiling試行構成再重み付け=-0.48pt〜+0.00pt / 残差=-0.76pt〜-0.29pt / 構成比で説明不能（上下限）。
- workshop-core-pools / smart / Thief:
  - 開封 floor 構成 current: B1=91225 (28.5% [28.4%, 28.7%]) / B2=82396 (25.8% [25.6%, 25.9%]) / B3=67638 (21.1% [21.0%, 21.3%]) / B4=47163 (14.7% [14.6%, 14.9%]) / B5=16948 (5.3% [5.2%, 5.4%]) / B6=5590 (1.7% [1.7%, 1.8%]) / B7=4085 (1.3% [1.2%, 1.3%]) / B8=2554 (0.8% [0.8%, 0.8%]) / B9=1572 (0.5% [0.5%, 0.5%]) / B10=423 (0.1% [0.1%, 0.1%]) / B11=147 (0.0% [0.0%, 0.1%]) / B12=93 (0.0% [0.0%, 0.0%]) / B13=41 (0.0% [0.0%, 0.0%]) / B14=15 (0.0% [0.0%, 0.0%]) / B15=5 (0.0% [0.0%, 0.0%])。
  - 開封 floor 構成 ceiling: B1=91225 (27.8% [27.6%, 28.0%]) / B2=82396 (25.1% [25.0%, 25.3%]) / B3=67638 (20.6% [20.5%, 20.7%]) / B4=47163 (14.4% [14.3%, 14.5%]) / B5=17541 (5.3% [5.3%, 5.4%]) / B6=6639 (2.0% [2.0%, 2.1%]) / B7=5439 (1.7% [1.6%, 1.7%]) / B8=4169 (1.3% [1.2%, 1.3%]) / B9=2989 (0.9% [0.9%, 0.9%]) / B10=1232 (0.4% [0.4%, 0.4%]) / B11=589 (0.2% [0.2%, 0.2%]) / B12=466 (0.1% [0.1%, 0.2%]) / B13=339 (0.1% [0.1%, 0.1%]) / B14=234 (0.1% [0.1%, 0.1%]) / B15=79 (0.0% [0.0%, 0.0%]) / B16=16 (0.0% [0.0%, 0.0%]) / B17=7 (0.0% [0.0%, 0.0%]) / B18=3 (0.0% [0.0%, 0.0%])。
  - 階層別解除率 current: B1=85.0% [84.7%, 85.3%] (attempt=53743) / B2=86.1% [85.8%, 86.4%] (attempt=51467) / B3=86.5% [86.2%, 86.8%] (attempt=48329) / B4=86.6% [86.3%, 87.0%] (attempt=37667) / B5=87.0% [86.5%, 87.6%] (attempt=13843) / B6=87.1% [86.0%, 88.1%] (attempt=3923) / B7=88.0% [86.7%, 89.1%] (attempt=2963) / B8=86.9% [85.3%, 88.4%] (attempt=1874) / B9=87.2% [85.2%, 89.0%] (attempt=1189) / B10=86.4% [82.3%, 89.7%] (attempt=324) / B11=93.8% [87.8%, 97.0%] (attempt=113) / B12=89.1% [79.1%, 94.6%] (attempt=64) / B13=85.7% [68.5%, 94.3%; N<30 未確定] (attempt=28) / B14=90.9% [62.3%, 98.4%; N<30 未確定] (attempt=11) / B15=100.0% [51.0%, 100.0%; N<30 未確定] (attempt=4)。
  - 階層別解除率 ceiling: B1=85.0% [84.7%, 85.3%] (attempt=53743) / B2=86.1% [85.8%, 86.4%] (attempt=51467) / B3=86.5% [86.2%, 86.8%] (attempt=48329) / B4=86.6% [86.3%, 87.0%] (attempt=37667) / B5=95.6% [95.3%, 95.9%] (attempt=16093) / B6=94.9% [94.3%, 95.5%] (attempt=5327) / B7=97.7% [97.2%, 98.1%] (attempt=4368) / B8=97.8% [97.2%, 98.2%] (attempt=3390) / B9=97.7% [97.0%, 98.2%] (attempt=2418) / B10=98.2% [97.2%, 98.9%] (attempt=996) / B11=99.1% [97.8%, 99.7%] (attempt=468) / B12=100.0% [99.0%, 100.0%] (attempt=379) / B13=100.0% [98.6%, 100.0%] (attempt=268) / B14=100.0% [98.0%, 100.0%] (attempt=187) / B15=100.0% [93.5%, 100.0%] (attempt=55) / B16=100.0% [75.8%, 100.0%; N<30 未確定] (attempt=12) / B17=100.0% [61.0%, 100.0%; N<30 未確定] (attempt=6) / B18=100.0% [43.9%, 100.0%; N<30 未確定] (attempt=3)。
  - 分岐集計 current: B1=kit0/direct53743/force5464 / B2=kit1335/direct50132/force7319 / B3=kit1326/direct47003/force5817 / B4=kit1475/direct36192/force3541 / B5=kit664/direct13179/force1692 / B6=kit231/direct3692/force541 / B7=kit166/direct2797/force327 / B8=kit94/direct1780/force168 / B9=kit55/direct1134/force99 / B10=kit9/direct315/force13 / B11=kit6/direct107/force6 / B12=kit3/direct61/force9 / B13=kit0/direct28/force2 / B14=kit2/direct9/force0 / B15=kit0/direct4/force0。
  - 分岐集計 ceiling: B1=kit0/direct53743/force5464 / B2=kit1335/direct50132/force7319 / B3=kit1326/direct47003/force5817 / B4=kit1475/direct36192/force3541 / B5=kit720/direct15373/force0 / B6=kit305/direct5022/force0 / B7=kit231/direct4137/force0 / B8=kit174/direct3216/force0 / B9=kit110/direct2308/force0 / B10=kit27/direct969/force0 / B11=kit24/direct444/force0 / B12=kit10/direct369/force0 / B13=kit7/direct261/force0 / B14=kit1/direct186/force0 / B15=kit1/direct54/force0 / B16=kit0/direct12/force0 / B17=kit0/direct6/force0 / B18=kit0/direct3/force0。
  - 選別効果判定: 実測Δ=+1.43pt / current階層率固定・ceiling試行構成再重み付け=+0.05pt〜+0.06pt / 残差=+1.37pt〜+1.38pt / 構成比で説明不能（上下限）。
- workshop-core-pools / smart / Priest:
  - 開封 floor 構成 current: B1=82197 (23.9% [23.7%, 24.0%]) / B2=62277 (18.1% [18.0%, 18.2%]) / B3=50152 (14.6% [14.5%, 14.7%]) / B4=42724 (12.4% [12.3%, 12.5%]) / B5=29090 (8.5% [8.4%, 8.5%]) / B6=22058 (6.4% [6.3%, 6.5%]) / B7=18913 (5.5% [5.4%, 5.6%]) / B8=14552 (4.2% [4.2%, 4.3%]) / B9=10555 (3.1% [3.0%, 3.1%]) / B10=5884 (1.7% [1.7%, 1.8%]) / B11=3328 (1.0% [0.9%, 1.0%]) / B12=1560 (0.5% [0.4%, 0.5%]) / B13=615 (0.2% [0.2%, 0.2%]) / B14=160 (0.0% [0.0%, 0.1%]) / B15=31 (0.0% [0.0%, 0.0%]) / B16=1 (0.0% [0.0%, 0.0%])。
  - 開封 floor 構成 ceiling: B1=82197 (24.0% [23.8%, 24.1%]) / B2=62277 (18.2% [18.0%, 18.3%]) / B3=50152 (14.6% [14.5%, 14.7%]) / B4=42724 (12.5% [12.4%, 12.6%]) / B5=28554 (8.3% [8.2%, 8.4%]) / B6=20965 (6.1% [6.0%, 6.2%]) / B7=17919 (5.2% [5.2%, 5.3%]) / B8=14103 (4.1% [4.0%, 4.2%]) / B9=10627 (3.1% [3.0%, 3.2%]) / B10=6420 (1.9% [1.8%, 1.9%]) / B11=3761 (1.1% [1.1%, 1.1%]) / B12=1949 (0.6% [0.5%, 0.6%]) / B13=806 (0.2% [0.2%, 0.3%]) / B14=250 (0.1% [0.1%, 0.1%]) / B15=69 (0.0% [0.0%, 0.0%]) / B16=11 (0.0% [0.0%, 0.0%]) / B17=5 (0.0% [0.0%, 0.0%])。
  - 階層別解除率 current: B2=100.0% [99.5%, 100.0%] (attempt=834) / B3=100.0% [99.5%, 100.0%] (attempt=714) / B4=100.0% [99.6%, 100.0%] (attempt=1077) / B5=100.0% [99.6%, 100.0%] (attempt=920) / B6=100.0% [99.5%, 100.0%] (attempt=723) / B7=100.0% [99.4%, 100.0%] (attempt=629) / B8=100.0% [99.2%, 100.0%] (attempt=497) / B9=100.0% [98.8%, 100.0%] (attempt=316) / B10=100.0% [98.1%, 100.0%] (attempt=199) / B11=100.0% [96.3%, 100.0%] (attempt=100) / B12=100.0% [92.7%, 100.0%] (attempt=49) / B13=100.0% [80.6%, 100.0%; N<30 未確定] (attempt=16) / B14=100.0% [51.0%, 100.0%; N<30 未確定] (attempt=4) / B15=100.0% [20.7%, 100.0%; N<30 未確定] (attempt=1)。
  - 階層別解除率 ceiling: B2=100.0% [99.5%, 100.0%] (attempt=834) / B3=100.0% [99.5%, 100.0%] (attempt=714) / B4=100.0% [99.6%, 100.0%] (attempt=1077) / B5=88.1% [86.2%, 89.7%] (attempt=1265) / B6=87.3% [85.0%, 89.3%] (attempt=908) / B7=90.2% [88.0%, 92.1%] (attempt=819) / B8=94.0% [91.8%, 95.7%] (attempt=570) / B9=90.6% [87.5%, 93.1%] (attempt=417) / B10=92.8% [88.7%, 95.5%] (attempt=223) / B11=100.0% [96.9%, 100.0%] (attempt=121) / B12=100.0% [94.1%, 100.0%] (attempt=61) / B13=96.0% [80.5%, 99.3%; N<30 未確定] (attempt=25) / B14=100.0% [61.0%, 100.0%; N<30 未確定] (attempt=6) / B15=100.0% [43.9%, 100.0%; N<30 未確定] (attempt=3) / B16=100.0% [20.7%, 100.0%; N<30 未確定] (attempt=1)。
  - 分岐集計 current: B1=kit0/direct0/force53516 / B2=kit834/direct0/force43578 / B3=kit714/direct0/force39611 / B4=kit1077/direct0/force36339 / B5=kit920/direct0/force25682 / B6=kit723/direct0/force16891 / B7=kit629/direct0/force14522 / B8=kit497/direct0/force11238 / B9=kit316/direct0/force8056 / B10=kit199/direct0/force4522 / B11=kit100/direct0/force2527 / B12=kit49/direct0/force1190 / B13=kit16/direct0/force460 / B14=kit4/direct0/force125 / B15=kit1/direct0/force24 / B16=kit0/direct0/force1。
  - 分岐集計 ceiling: B1=kit0/direct0/force53516 / B2=kit834/direct0/force43578 / B3=kit714/direct0/force39611 / B4=kit1077/direct0/force36339 / B5=kit885/direct380/force24950 / B6=kit660/direct248/force15935 / B7=kit656/direct163/force13565 / B8=kit469/direct101/force10734 / B9=kit324/direct93/force8080 / B10=kit191/direct32/force4945 / B11=kit121/direct0/force2928 / B12=kit61/direct0/force1487 / B13=kit20/direct5/force620 / B14=kit4/direct2/force200 / B15=kit3/direct0/force51 / B16=kit1/direct0/force7 / B17=kit0/direct0/force5。
  - 選別効果判定: 実測Δ=-6.19pt / current階層率固定・ceiling試行構成再重み付け=-0.01pt〜+0.00pt / 残差=-6.19pt〜-6.18pt / 構成比で説明不能（上下限）。
- workshop-core-pools / smart / Mage:
  - 開封 floor 構成 current: B1=90356 (37.8% [37.6%, 38.0%]) / B2=81029 (33.9% [33.7%, 34.1%]) / B3=51243 (21.4% [21.3%, 21.6%]) / B4=15531 (6.5% [6.4%, 6.6%]) / B5=986 (0.4% [0.4%, 0.4%]) / B6=13 (0.0% [0.0%, 0.0%]) / B7=2 (0.0% [0.0%, 0.0%])。
  - 開封 floor 構成 ceiling: B1=90356 (37.8% [37.6%, 38.0%]) / B2=81029 (33.9% [33.7%, 34.1%]) / B3=51243 (21.4% [21.3%, 21.6%]) / B4=15531 (6.5% [6.4%, 6.6%]) / B5=1025 (0.4% [0.4%, 0.5%]) / B6=10 (0.0% [0.0%, 0.0%])。
  - 階層別解除率 current: B2=100.0% [99.7%, 100.0%] (attempt=1127) / B3=100.0% [99.5%, 100.0%] (attempt=774) / B4=100.0% [99.0%, 100.0%] (attempt=369) / B5=100.0% [87.9%, 100.0%; N<30 未確定] (attempt=28) / B7=100.0% [20.7%, 100.0%; N<30 未確定] (attempt=1)。
  - 階層別解除率 ceiling: B2=100.0% [99.7%, 100.0%] (attempt=1127) / B3=100.0% [99.5%, 100.0%] (attempt=774) / B4=100.0% [99.0%, 100.0%] (attempt=369) / B5=93.9% [80.4%, 98.3%] (attempt=33)。
  - 分岐集計 current: B1=kit0/direct0/force58812 / B2=kit1127/direct0/force56614 / B3=kit774/direct0/force40244 / B4=kit369/direct0/force13273 / B5=kit28/direct0/force887 / B6=kit0/direct0/force10 / B7=kit1/direct0/force1。
  - 分岐集計 ceiling: B1=kit0/direct0/force58812 / B2=kit1127/direct0/force56614 / B3=kit774/direct0/force40244 / B4=kit369/direct0/force13273 / B5=kit26/direct7/force923 / B6=kit0/direct0/force7。
  - 選別効果判定: 実測Δ=-0.09pt / current階層率固定・ceiling試行構成再重み付け=+0.00pt / 残差=-0.09pt / 構成比で説明不能（上下限）。
- workshop-core-pools / never / Fighter:
  - 開封 floor 構成 current: B1=90625 (40.6% [40.4%, 40.8%]) / B2=78437 (35.1% [34.9%, 35.3%]) / B3=41392 (18.5% [18.4%, 18.7%]) / B4=11818 (5.3% [5.2%, 5.4%]) / B5=934 (0.4% [0.4%, 0.4%]) / B6=36 (0.0% [0.0%, 0.0%]) / B7=18 (0.0% [0.0%, 0.0%]) / B8=2 (0.0% [0.0%, 0.0%])。
  - 開封 floor 構成 ceiling: B1=90625 (40.6% [40.4%, 40.8%]) / B2=78437 (35.1% [34.9%, 35.3%]) / B3=41392 (18.5% [18.4%, 18.7%]) / B4=11818 (5.3% [5.2%, 5.4%]) / B5=1025 (0.5% [0.4%, 0.5%]) / B6=73 (0.0% [0.0%, 0.0%]) / B7=31 (0.0% [0.0%, 0.0%]) / B8=17 (0.0% [0.0%, 0.0%]) / B9=8 (0.0% [0.0%, 0.0%]) / B10=1 (0.0% [0.0%, 0.0%])。
  - 階層別解除率 current: B2=100.0% [99.6%, 100.0%] (attempt=1022) / B3=100.0% [99.4%, 100.0%] (attempt=640) / B4=100.0% [98.7%, 100.0%] (attempt=296) / B5=100.0% [86.7%, 100.0%; N<30 未確定] (attempt=25) / B7=100.0% [20.7%, 100.0%; N<30 未確定] (attempt=1)。
  - 階層別解除率 ceiling: B2=100.0% [99.6%, 100.0%] (attempt=1022) / B3=100.0% [99.4%, 100.0%] (attempt=640) / B4=100.0% [98.7%, 100.0%] (attempt=296) / B5=89.5% [75.9%, 95.8%] (attempt=38) / B6=100.0% [34.2%, 100.0%; N<30 未確定] (attempt=2) / B8=100.0% [20.7%, 100.0%; N<30 未確定] (attempt=1)。
  - 分岐集計 current: B1=kit0/direct0/force58920 / B2=kit1022/direct0/force54854 / B3=kit640/direct0/force32456 / B4=kit296/direct0/force10003 / B5=kit25/direct0/force827 / B6=kit0/direct0/force30 / B7=kit1/direct0/force14 / B8=kit0/direct0/force1。
  - 分岐集計 ceiling: B1=kit0/direct0/force58920 / B2=kit1022/direct0/force54854 / B3=kit640/direct0/force32456 / B4=kit296/direct0/force10003 / B5=kit27/direct11/force891 / B6=kit2/direct0/force56 / B7=kit0/direct0/force26 / B8=kit1/direct0/force14 / B9=kit0/direct0/force7 / B10=kit0/direct0/force1。
  - 選別効果判定: 実測Δ=-0.20pt / current階層率固定・ceiling試行構成再重み付け=-0.15pt〜+0.00pt / 残差=-0.20pt〜-0.05pt / 構成比で説明不能（上下限）。
- workshop-core-pools / never / Thief:
  - 開封 floor 構成 current: B1=91015 (28.7% [28.6%, 28.9%]) / B2=82227 (26.0% [25.8%, 26.1%]) / B3=66133 (20.9% [20.7%, 21.0%]) / B4=46495 (14.7% [14.6%, 14.8%]) / B5=16516 (5.2% [5.1%, 5.3%]) / B6=5355 (1.7% [1.6%, 1.7%]) / B7=3963 (1.3% [1.2%, 1.3%]) / B8=2588 (0.8% [0.8%, 0.8%]) / B9=1593 (0.5% [0.5%, 0.5%]) / B10=524 (0.2% [0.2%, 0.2%]) / B11=126 (0.0% [0.0%, 0.0%]) / B12=88 (0.0% [0.0%, 0.0%]) / B13=39 (0.0% [0.0%, 0.0%]) / B14=23 (0.0% [0.0%, 0.0%]) / B15=12 (0.0% [0.0%, 0.0%])。
  - 開封 floor 構成 ceiling: B1=91015 (28.0% [27.8%, 28.1%]) / B2=82227 (25.3% [25.1%, 25.4%]) / B3=66133 (20.3% [20.2%, 20.5%]) / B4=46495 (14.3% [14.2%, 14.4%]) / B5=17052 (5.2% [5.2%, 5.3%]) / B6=6465 (2.0% [1.9%, 2.0%]) / B7=5352 (1.6% [1.6%, 1.7%]) / B8=4220 (1.3% [1.3%, 1.3%]) / B9=3215 (1.0% [1.0%, 1.0%]) / B10=1451 (0.4% [0.4%, 0.5%]) / B11=585 (0.2% [0.2%, 0.2%]) / B12=377 (0.1% [0.1%, 0.1%]) / B13=288 (0.1% [0.1%, 0.1%]) / B14=177 (0.1% [0.0%, 0.1%]) / B15=71 (0.0% [0.0%, 0.0%]) / B16=23 (0.0% [0.0%, 0.0%]) / B17=12 (0.0% [0.0%, 0.0%])。
  - 階層別解除率 current: B1=85.0% [84.7%, 85.3%] (attempt=54103) / B2=85.8% [85.5%, 86.1%] (attempt=51519) / B3=86.4% [86.1%, 86.7%] (attempt=47261) / B4=86.7% [86.3%, 87.0%] (attempt=37182) / B5=87.3% [86.7%, 87.8%] (attempt=13561) / B6=87.0% [85.9%, 88.0%] (attempt=3724) / B7=87.6% [86.3%, 88.7%] (attempt=2908) / B8=89.2% [87.7%, 90.5%] (attempt=1921) / B9=88.2% [86.2%, 89.9%] (attempt=1171) / B10=89.9% [86.6%, 92.6%] (attempt=388) / B11=92.0% [85.0%, 95.9%] (attempt=100) / B12=94.1% [85.8%, 97.7%] (attempt=68) / B13=96.6% [82.8%, 99.4%; N<30 未確定] (attempt=29) / B14=85.7% [65.4%, 95.0%; N<30 未確定] (attempt=21) / B15=100.0% [72.2%, 100.0%; N<30 未確定] (attempt=10)。
  - 階層別解除率 ceiling: B1=85.0% [84.7%, 85.3%] (attempt=54103) / B2=85.8% [85.5%, 86.1%] (attempt=51519) / B3=86.4% [86.1%, 86.7%] (attempt=47261) / B4=86.7% [86.3%, 87.0%] (attempt=37182) / B5=95.4% [95.1%, 95.7%] (attempt=15658) / B6=95.4% [94.8%, 96.0%] (attempt=5182) / B7=97.3% [96.7%, 97.7%] (attempt=4297) / B8=97.3% [96.7%, 97.8%] (attempt=3349) / B9=98.5% [98.0%, 98.9%] (attempt=2558) / B10=97.9% [97.0%, 98.6%] (attempt=1167) / B11=98.9% [97.4%, 99.5%] (attempt=454) / B12=99.7% [98.2%, 99.9%] (attempt=305) / B13=100.0% [98.3%, 100.0%] (attempt=225) / B14=100.0% [97.4%, 100.0%] (attempt=143) / B15=100.0% [93.8%, 100.0%] (attempt=58) / B16=100.0% [81.6%, 100.0%; N<30 未確定] (attempt=17) / B17=100.0% [72.2%, 100.0%; N<30 未確定] (attempt=10)。
  - 分岐集計 current: B1=kit0/direct54103/force5152 / B2=kit1376/direct50143/force6967 / B3=kit1227/direct46034/force5469 / B4=kit1456/direct35726/force3623 / B5=kit692/direct12869/force1624 / B6=kit239/direct3485/force577 / B7=kit160/direct2748/force305 / B8=kit102/direct1819/force166 / B9=kit61/direct1110/force111 / B10=kit16/direct372/force25 / B11=kit4/direct96/force0 / B12=kit3/direct65/force5 / B13=kit1/direct28/force1 / B14=kit0/direct21/force0 / B15=kit0/direct10/force0。
  - 分岐集計 ceiling: B1=kit0/direct54103/force5152 / B2=kit1376/direct50143/force6967 / B3=kit1227/direct46034/force5469 / B4=kit1456/direct35726/force3623 / B5=kit749/direct14909/force0 / B6=kit299/direct4883/force0 / B7=kit214/direct4083/force0 / B8=kit148/direct3201/force0 / B9=kit114/direct2444/force0 / B10=kit39/direct1128/force0 / B11=kit16/direct438/force0 / B12=kit11/direct294/force0 / B13=kit7/direct218/force0 / B14=kit3/direct140/force0 / B15=kit1/direct57/force0 / B16=kit0/direct17/force0 / B17=kit0/direct10/force0。
  - 選別効果判定: 実測Δ=+1.37pt / current階層率固定・ceiling試行構成再重み付け=+0.09pt〜+0.10pt / 残差=+1.27pt〜+1.28pt / 構成比で説明不能（上下限）。
- workshop-core-pools / never / Priest:
  - 開封 floor 構成 current: B1=82057 (24.4% [24.3%, 24.6%]) / B2=62018 (18.4% [18.3%, 18.6%]) / B3=49894 (14.8% [14.7%, 15.0%]) / B4=41925 (12.5% [12.4%, 12.6%]) / B5=28040 (8.3% [8.2%, 8.4%]) / B6=20892 (6.2% [6.1%, 6.3%]) / B7=17668 (5.3% [5.2%, 5.3%]) / B8=13407 (4.0% [3.9%, 4.1%]) / B9=9482 (2.8% [2.8%, 2.9%]) / B10=5534 (1.6% [1.6%, 1.7%]) / B11=3250 (1.0% [0.9%, 1.0%]) / B12=1281 (0.4% [0.4%, 0.4%]) / B13=503 (0.1% [0.1%, 0.2%]) / B14=162 (0.0% [0.0%, 0.1%]) / B15=58 (0.0% [0.0%, 0.0%])。
  - 開封 floor 構成 ceiling: B1=82057 (24.4% [24.2%, 24.5%]) / B2=62018 (18.4% [18.3%, 18.5%]) / B3=49894 (14.8% [14.7%, 14.9%]) / B4=41925 (12.4% [12.3%, 12.6%]) / B5=27827 (8.3% [8.2%, 8.4%]) / B6=20491 (6.1% [6.0%, 6.2%]) / B7=17320 (5.1% [5.1%, 5.2%]) / B8=13603 (4.0% [4.0%, 4.1%]) / B9=9841 (2.9% [2.9%, 3.0%]) / B10=5844 (1.7% [1.7%, 1.8%]) / B11=3431 (1.0% [1.0%, 1.1%]) / B12=1729 (0.5% [0.5%, 0.5%]) / B13=683 (0.2% [0.2%, 0.2%]) / B14=247 (0.1% [0.1%, 0.1%]) / B15=50 (0.0% [0.0%, 0.0%]) / B16=2 (0.0% [0.0%, 0.0%])。
  - 階層別解除率 current: B2=100.0% [99.5%, 100.0%] (attempt=783) / B3=100.0% [99.5%, 100.0%] (attempt=752) / B4=99.9% [99.5%, 100.0%] (attempt=1084) / B5=99.4% [98.6%, 99.7%] (attempt=842) / B6=99.1% [98.1%, 99.6%] (attempt=763) / B7=99.8% [99.0%, 100.0%] (attempt=589) / B8=100.0% [99.2%, 100.0%] (attempt=475) / B9=100.0% [98.8%, 100.0%] (attempt=311) / B10=100.0% [98.0%, 100.0%] (attempt=191) / B11=100.0% [96.3%, 100.0%] (attempt=100) / B12=100.0% [89.0%, 100.0%] (attempt=31) / B13=100.0% [75.8%, 100.0%; N<30 未確定] (attempt=12) / B14=100.0% [20.7%, 100.0%; N<30 未確定] (attempt=1)。
  - 階層別解除率 ceiling: B2=100.0% [99.5%, 100.0%] (attempt=783) / B3=100.0% [99.5%, 100.0%] (attempt=752) / B4=99.9% [99.5%, 100.0%] (attempt=1084) / B5=84.3% [82.2%, 86.2%] (attempt=1273) / B6=89.5% [87.3%, 91.3%] (attempt=894) / B7=88.3% [85.8%, 90.3%] (attempt=766) / B8=93.4% [91.0%, 95.1%] (attempt=573) / B9=93.0% [90.1%, 95.0%] (attempt=427) / B10=90.6% [85.8%, 93.9%] (attempt=203) / B11=91.7% [85.8%, 95.3%] (attempt=133) / B12=92.3% [83.2%, 96.7%] (attempt=65) / B13=95.2% [77.3%, 99.2%; N<30 未確定] (attempt=21) / B14=81.8% [52.3%, 94.9%; N<30 未確定] (attempt=11) / B15=100.0% [43.9%, 100.0%; N<30 未確定] (attempt=3)。
  - 分岐集計 current: B1=kit0/direct0/force53598 / B2=kit783/direct0/force43602 / B3=kit752/direct0/force38992 / B4=kit1082/direct2/force35508 / B5=kit827/direct15/force24908 / B6=kit748/direct15/force15878 / B7=kit587/direct2/force13547 / B8=kit475/direct0/force10293 / B9=kit311/direct0/force7340 / B10=kit191/direct0/force4207 / B11=kit100/direct0/force2532 / B12=kit31/direct0/force977 / B13=kit12/direct0/force392 / B14=kit1/direct0/force125 / B15=kit0/direct0/force49。
  - 分岐集計 ceiling: B1=kit0/direct0/force53598 / B2=kit783/direct0/force43602 / B3=kit752/direct0/force38992 / B4=kit1082/direct2/force35508 / B5=kit807/direct466/force24282 / B6=kit660/direct234/force15550 / B7=kit572/direct194/force13047 / B8=kit456/direct117/force10317 / B9=kit345/direct82/force7483 / B10=kit156/direct47/force4511 / B11=kit107/direct26/force2584 / B12=kit56/direct9/force1308 / B13=kit16/direct5/force520 / B14=kit8/direct3/force190 / B15=kit3/direct0/force42 / B16=kit0/direct0/force2。
  - 選別効果判定: 実測Δ=-6.79pt / current階層率固定・ceiling試行構成再重み付け=-0.07pt〜-0.02pt / 残差=-6.77pt〜-6.72pt / 構成比で説明不能（上下限）。
- workshop-core-pools / never / Mage:
  - 開封 floor 構成 current: B1=90073 (38.1% [37.9%, 38.3%]) / B2=80595 (34.1% [33.9%, 34.3%]) / B3=49883 (21.1% [20.9%, 21.2%]) / B4=15239 (6.4% [6.3%, 6.5%]) / B5=773 (0.3% [0.3%, 0.4%]) / B6=15 (0.0% [0.0%, 0.0%]) / B7=2 (0.0% [0.0%, 0.0%])。
  - 開封 floor 構成 ceiling: B1=90073 (38.1% [37.9%, 38.3%]) / B2=80595 (34.1% [33.9%, 34.3%]) / B3=49883 (21.1% [20.9%, 21.2%]) / B4=15239 (6.4% [6.3%, 6.5%]) / B5=794 (0.3% [0.3%, 0.4%]) / B6=7 (0.0% [0.0%, 0.0%])。
  - 階層別解除率 current: B2=100.0% [99.6%, 100.0%] (attempt=1021) / B3=100.0% [99.5%, 100.0%] (attempt=723) / B4=100.0% [99.0%, 100.0%] (attempt=388) / B5=100.0% [81.6%, 100.0%; N<30 未確定] (attempt=17)。
  - 階層別解除率 ceiling: B2=100.0% [99.6%, 100.0%] (attempt=1021) / B3=100.0% [99.5%, 100.0%] (attempt=723) / B4=100.0% [99.0%, 100.0%] (attempt=388) / B5=82.1% [64.4%, 92.1%; N<30 未確定] (attempt=28)。
  - 分岐集計 current: B1=kit0/direct0/force58510 / B2=kit1021/direct0/force56293 / B3=kit723/direct0/force39059 / B4=kit388/direct0/force12938 / B5=kit17/direct0/force694 / B6=kit0/direct0/force14 / B7=kit0/direct0/force1。
  - 分岐集計 ceiling: B1=kit0/direct0/force58510 / B2=kit1021/direct0/force56293 / B3=kit723/direct0/force39059 / B4=kit388/direct0/force12938 / B5=kit21/direct7/force713 / B6=kit0/direct0/force6。
  - 選別効果判定: 実測Δ=-0.23pt / current階層率固定・ceiling試行構成再重み付け=+0.00pt / 残差=-0.23pt / 構成比で説明不能（上下限）。
- workshop-complete / smart / Fighter:
  - 開封 floor 構成 current: B1=91277 (36.2% [36.1%, 36.4%]) / B2=83347 (33.1% [32.9%, 33.3%]) / B3=54695 (21.7% [21.6%, 21.9%]) / B4=19703 (7.8% [7.7%, 7.9%]) / B5=2491 (1.0% [1.0%, 1.0%]) / B6=167 (0.1% [0.1%, 0.1%]) / B7=99 (0.0% [0.0%, 0.0%]) / B8=48 (0.0% [0.0%, 0.0%]) / B9=40 (0.0% [0.0%, 0.0%])。
  - 開封 floor 構成 ceiling: B1=91277 (36.2% [36.0%, 36.4%]) / B2=83347 (33.1% [32.9%, 33.3%]) / B3=54695 (21.7% [21.5%, 21.9%]) / B4=19703 (7.8% [7.7%, 7.9%]) / B5=2599 (1.0% [1.0%, 1.1%]) / B6=223 (0.1% [0.1%, 0.1%]) / B7=125 (0.0% [0.0%, 0.1%]) / B8=50 (0.0% [0.0%, 0.0%]) / B9=25 (0.0% [0.0%, 0.0%])。
  - 階層別解除率 current: B2=100.0% [99.6%, 100.0%] (attempt=1080) / B3=100.0% [99.5%, 100.0%] (attempt=843) / B4=100.0% [99.2%, 100.0%] (attempt=474) / B5=100.0% [95.8%, 100.0%] (attempt=88) / B6=100.0% [20.7%, 100.0%; N<30 未確定] (attempt=1) / B7=100.0% [61.0%, 100.0%; N<30 未確定] (attempt=6) / B8=100.0% [20.7%, 100.0%; N<30 未確定] (attempt=1) / B9=100.0% [34.2%, 100.0%; N<30 未確定] (attempt=2)。
  - 階層別解除率 ceiling: B2=100.0% [99.6%, 100.0%] (attempt=1080) / B3=100.0% [99.5%, 100.0%] (attempt=843) / B4=100.0% [99.2%, 100.0%] (attempt=474) / B5=88.0% [81.7%, 92.4%] (attempt=142) / B6=100.0% [20.7%, 100.0%; N<30 未確定] (attempt=1) / B7=100.0% [51.0%, 100.0%; N<30 未確定] (attempt=4) / B8=100.0% [51.0%, 100.0%; N<30 未確定] (attempt=4) / B9=100.0% [20.7%, 100.0%; N<30 未確定] (attempt=1)。
  - 分岐集計 current: B1=kit0/direct0/force59212 / B2=kit1080/direct0/force58525 / B3=kit843/direct0/force42862 / B4=kit474/direct0/force16797 / B5=kit88/direct0/force2190 / B6=kit1/direct0/force125 / B7=kit6/direct0/force74 / B8=kit1/direct0/force35 / B9=kit2/direct0/force25。
  - 分岐集計 ceiling: B1=kit0/direct0/force59212 / B2=kit1080/direct0/force58525 / B3=kit843/direct0/force42862 / B4=kit474/direct0/force16797 / B5=kit94/direct48/force2220 / B6=kit1/direct0/force169 / B7=kit4/direct0/force97 / B8=kit4/direct0/force36 / B9=kit1/direct0/force20。
  - 選別効果判定: 実測Δ=-0.67pt / current階層率固定・ceiling試行構成再重み付け=+0.00pt / 残差=-0.67pt / 構成比で説明不能（上下限）。
- workshop-complete / smart / Thief:
  - 開封 floor 構成 current: B1=91125 (28.0% [27.9%, 28.2%]) / B2=83191 (25.6% [25.4%, 25.7%]) / B3=68137 (21.0% [20.8%, 21.1%]) / B4=48872 (15.0% [14.9%, 15.2%]) / B5=18110 (5.6% [5.5%, 5.7%]) / B6=5933 (1.8% [1.8%, 1.9%]) / B7=4459 (1.4% [1.3%, 1.4%]) / B8=2849 (0.9% [0.8%, 0.9%]) / B9=1686 (0.5% [0.5%, 0.5%]) / B10=417 (0.1% [0.1%, 0.1%]) / B11=132 (0.0% [0.0%, 0.0%]) / B12=91 (0.0% [0.0%, 0.0%]) / B13=37 (0.0% [0.0%, 0.0%]) / B14=17 (0.0% [0.0%, 0.0%]) / B15=1 (0.0% [0.0%, 0.0%])。
  - 開封 floor 構成 ceiling: B1=91125 (27.3% [27.1%, 27.4%]) / B2=83191 (24.9% [24.7%, 25.0%]) / B3=68137 (20.4% [20.3%, 20.5%]) / B4=48872 (14.6% [14.5%, 14.7%]) / B5=18802 (5.6% [5.5%, 5.7%]) / B6=7006 (2.1% [2.0%, 2.1%]) / B7=6024 (1.8% [1.8%, 1.8%]) / B8=4480 (1.3% [1.3%, 1.4%]) / B9=3224 (1.0% [0.9%, 1.0%]) / B10=1389 (0.4% [0.4%, 0.4%]) / B11=698 (0.2% [0.2%, 0.2%]) / B12=506 (0.2% [0.1%, 0.2%]) / B13=372 (0.1% [0.1%, 0.1%]) / B14=244 (0.1% [0.1%, 0.1%]) / B15=68 (0.0% [0.0%, 0.0%]) / B16=12 (0.0% [0.0%, 0.0%]) / B17=1 (0.0% [0.0%, 0.0%])。
  - 階層別解除率 current: B1=85.1% [84.8%, 85.4%] (attempt=53950) / B2=86.0% [85.7%, 86.3%] (attempt=52107) / B3=86.5% [86.2%, 86.8%] (attempt=48736) / B4=87.2% [86.8%, 87.5%] (attempt=38991) / B5=86.9% [86.4%, 87.4%] (attempt=15013) / B6=88.3% [87.3%, 89.2%] (attempt=4178) / B7=87.1% [85.9%, 88.2%] (attempt=3268) / B8=89.7% [88.3%, 90.9%] (attempt=2117) / B9=88.6% [86.7%, 90.2%] (attempt=1251) / B10=92.0% [88.6%, 94.5%] (attempt=327) / B11=89.9% [82.4%, 94.4%] (attempt=99) / B12=96.2% [89.3%, 98.7%] (attempt=78) / B13=90.3% [75.1%, 96.7%] (attempt=31) / B14=87.5% [64.0%, 96.5%; N<30 未確定] (attempt=16) / B15=100.0% [20.7%, 100.0%; N<30 未確定] (attempt=1)。
  - 階層別解除率 ceiling: B1=85.1% [84.8%, 85.4%] (attempt=53950) / B2=86.0% [85.7%, 86.3%] (attempt=52107) / B3=86.5% [86.2%, 86.8%] (attempt=48736) / B4=87.2% [86.8%, 87.5%] (attempt=38991) / B5=95.5% [95.2%, 95.8%] (attempt=17281) / B6=95.7% [95.2%, 96.2%] (attempt=5622) / B7=97.7% [97.2%, 98.1%] (attempt=4818) / B8=97.6% [97.0%, 98.0%] (attempt=3597) / B9=98.5% [97.9%, 98.9%] (attempt=2546) / B10=98.2% [97.3%, 98.8%] (attempt=1121) / B11=98.4% [97.0%, 99.1%] (attempt=556) / B12=99.8% [98.6%, 100.0%] (attempt=413) / B13=100.0% [98.7%, 100.0%] (attempt=297) / B14=100.0% [98.0%, 100.0%] (attempt=193) / B15=100.0% [92.7%, 100.0%] (attempt=49) / B16=100.0% [72.2%, 100.0%; N<30 未確定] (attempt=10) / B17=100.0% [20.7%, 100.0%; N<30 未確定] (attempt=1)。
  - 分岐集計 current: B1=kit0/direct53950/force5087 / B2=kit1379/direct50728/force7205 / B3=kit1299/direct47437/force5806 / B4=kit1556/direct37435/force3826 / B5=kit734/direct14279/force1609 / B6=kit257/direct3921/force565 / B7=kit184/direct3084/force325 / B8=kit116/direct2001/force198 / B9=kit67/direct1184/force95 / B10=kit15/direct312/force7 / B11=kit2/direct97/force0 / B12=kit1/direct77/force0 / B13=kit0/direct31/force0 / B14=kit0/direct16/force0 / B15=kit0/direct1/force0。
  - 分岐集計 ceiling: B1=kit0/direct53950/force5087 / B2=kit1379/direct50728/force7205 / B3=kit1299/direct47437/force5806 / B4=kit1556/direct37435/force3826 / B5=kit775/direct16506/force0 / B6=kit305/direct5317/force0 / B7=kit264/direct4554/force0 / B8=kit192/direct3405/force0 / B9=kit109/direct2437/force0 / B10=kit53/direct1068/force0 / B11=kit15/direct541/force0 / B12=kit13/direct400/force0 / B13=kit6/direct291/force0 / B14=kit7/direct186/force0 / B15=kit0/direct49/force0 / B16=kit0/direct10/force0 / B17=kit0/direct1/force0。
  - 選別効果判定: 実測Δ=+1.47pt / current階層率固定・ceiling試行構成再重み付け=+0.10pt〜+0.11pt / 残差=+1.36pt〜+1.37pt / 構成比で説明不能（上下限）。
- workshop-complete / smart / Priest:
  - 開封 floor 構成 current: B1=82829 (22.3% [22.2%, 22.5%]) / B2=64117 (17.3% [17.2%, 17.4%]) / B3=53379 (14.4% [14.3%, 14.5%]) / B4=46118 (12.4% [12.3%, 12.5%]) / B5=32650 (8.8% [8.7%, 8.9%]) / B6=25339 (6.8% [6.7%, 6.9%]) / B7=22150 (6.0% [5.9%, 6.0%]) / B8=17364 (4.7% [4.6%, 4.7%]) / B9=12552 (3.4% [3.3%, 3.4%]) / B10=7414 (2.0% [2.0%, 2.0%]) / B11=4189 (1.1% [1.1%, 1.2%]) / B12=1891 (0.5% [0.5%, 0.5%]) / B13=687 (0.2% [0.2%, 0.2%]) / B14=225 (0.1% [0.1%, 0.1%]) / B15=69 (0.0% [0.0%, 0.0%]) / B16=38 (0.0% [0.0%, 0.0%]) / B17=14 (0.0% [0.0%, 0.0%])。
  - 開封 floor 構成 ceiling: B1=82829 (22.4% [22.2%, 22.5%]) / B2=64117 (17.3% [17.2%, 17.4%]) / B3=53379 (14.4% [14.3%, 14.5%]) / B4=46118 (12.5% [12.4%, 12.6%]) / B5=32282 (8.7% [8.6%, 8.8%]) / B6=24906 (6.7% [6.6%, 6.8%]) / B7=21482 (5.8% [5.7%, 5.9%]) / B8=16979 (4.6% [4.5%, 4.7%]) / B9=12694 (3.4% [3.4%, 3.5%]) / B10=7604 (2.1% [2.0%, 2.1%]) / B11=4191 (1.1% [1.1%, 1.2%]) / B12=2148 (0.6% [0.6%, 0.6%]) / B13=898 (0.2% [0.2%, 0.3%]) / B14=322 (0.1% [0.1%, 0.1%]) / B15=96 (0.0% [0.0%, 0.0%]) / B16=42 (0.0% [0.0%, 0.0%]) / B17=18 (0.0% [0.0%, 0.0%]) / B18=1 (0.0% [0.0%, 0.0%])。
  - 階層別解除率 current: B2=100.0% [99.5%, 100.0%] (attempt=838) / B3=100.0% [99.5%, 100.0%] (attempt=795) / B4=100.0% [99.7%, 100.0%] (attempt=1163) / B5=100.0% [99.6%, 100.0%] (attempt=1087) / B6=100.0% [99.6%, 100.0%] (attempt=873) / B7=100.0% [99.5%, 100.0%] (attempt=745) / B8=100.0% [99.4%, 100.0%] (attempt=637) / B9=100.0% [99.1%, 100.0%] (attempt=413) / B10=99.2% [97.1%, 99.8%] (attempt=248) / B11=98.4% [94.5%, 99.6%] (attempt=128) / B12=100.0% [94.1%, 100.0%] (attempt=61) / B13=76.2% [54.9%, 89.4%; N<30 未確定] (attempt=21) / B14=100.0% [64.6%, 100.0%; N<30 未確定] (attempt=7) / B15=100.0% [20.7%, 100.0%; N<30 未確定] (attempt=1) / B16=100.0% [20.7%, 100.0%; N<30 未確定] (attempt=1) / B17=100.0% [20.7%, 100.0%; N<30 未確定] (attempt=1)。
  - 階層別解除率 ceiling: B2=100.0% [99.5%, 100.0%] (attempt=838) / B3=100.0% [99.5%, 100.0%] (attempt=795) / B4=100.0% [99.7%, 100.0%] (attempt=1163) / B5=83.5% [81.6%, 85.2%] (attempt=1626) / B6=88.3% [86.3%, 90.0%] (attempt=1164) / B7=88.6% [86.5%, 90.5%] (attempt=977) / B8=90.8% [88.5%, 92.6%] (attempt=780) / B9=89.1% [86.3%, 91.4%] (attempt=577) / B10=88.0% [84.0%, 91.1%] (attempt=324) / B11=87.7% [81.7%, 91.9%] (attempt=162) / B12=89.9% [81.9%, 94.6%] (attempt=89) / B13=87.2% [73.3%, 94.4%] (attempt=39) / B14=73.7% [51.2%, 88.2%; N<30 未確定] (attempt=19) / B15=66.7% [39.1%, 86.2%; N<30 未確定] (attempt=12) / B16=60.0% [31.3%, 83.2%; N<30 未確定] (attempt=10) / B17=75.0% [30.1%, 95.4%; N<30 未確定] (attempt=4)。
  - 分岐集計 current: B1=kit0/direct0/force53827 / B2=kit838/direct0/force44888 / B3=kit794/direct1/force41909 / B4=kit1163/direct0/force39287 / B5=kit1087/direct0/force28847 / B6=kit873/direct0/force19409 / B7=kit745/direct0/force16976 / B8=kit637/direct0/force13241 / B9=kit413/direct0/force9646 / B10=kit243/direct5/force5687 / B11=kit123/direct5/force3263 / B12=kit57/direct4/force1484 / B13=kit15/direct6/force527 / B14=kit5/direct2/force176 / B15=kit1/direct0/force56 / B16=kit1/direct0/force29 / B17=kit1/direct0/force11。
  - 分岐集計 ceiling: B1=kit0/direct0/force53827 / B2=kit838/direct0/force44888 / B3=kit794/direct1/force41909 / B4=kit1163/direct0/force39287 / B5=kit1048/direct578/force27996 / B6=kit838/direct326/force18753 / B7=kit717/direct260/force16246 / B8=kit609/direct171/force12782 / B9=kit419/direct158/force9622 / B10=kit236/direct88/force5727 / B11=kit125/direct37/force3211 / B12=kit68/direct21/force1651 / B13=kit26/direct13/force666 / B14=kit10/direct9/force231 / B15=kit3/direct9/force70 / B16=kit0/direct10/force25 / B17=kit1/direct3/force12。
  - 選別効果判定: 実測Δ=-8.47pt / current階層率固定・ceiling試行構成再重み付け=-0.04pt / 残差=-8.43pt / 構成比で説明不能（上下限）。
- workshop-complete / smart / Mage:
  - 開封 floor 構成 current: B1=90405 (37.8% [37.6%, 38.0%]) / B2=80757 (33.8% [33.6%, 34.0%]) / B3=51092 (21.4% [21.2%, 21.6%]) / B4=15595 (6.5% [6.4%, 6.6%]) / B5=1018 (0.4% [0.4%, 0.5%]) / B6=36 (0.0% [0.0%, 0.0%]) / B7=5 (0.0% [0.0%, 0.0%])。
  - 開封 floor 構成 ceiling: B1=90405 (37.8% [37.6%, 38.0%]) / B2=80757 (33.8% [33.6%, 34.0%]) / B3=51092 (21.4% [21.2%, 21.5%]) / B4=15595 (6.5% [6.4%, 6.6%]) / B5=1065 (0.4% [0.4%, 0.5%]) / B6=37 (0.0% [0.0%, 0.0%]) / B7=8 (0.0% [0.0%, 0.0%])。
  - 階層別解除率 current: B2=100.0% [99.6%, 100.0%] (attempt=1078) / B3=100.0% [99.5%, 100.0%] (attempt=723) / B4=100.0% [99.0%, 100.0%] (attempt=384) / B5=100.0% [90.1%, 100.0%] (attempt=35)。
  - 階層別解除率 ceiling: B2=100.0% [99.6%, 100.0%] (attempt=1078) / B3=100.0% [99.5%, 100.0%] (attempt=723) / B4=100.0% [99.0%, 100.0%] (attempt=384) / B5=92.7% [80.6%, 97.5%] (attempt=41) / B7=100.0% [34.2%, 100.0%; N<30 未確定] (attempt=2)。
  - 分岐集計 current: B1=kit0/direct0/force58820 / B2=kit1078/direct0/force56422 / B3=kit723/direct0/force40127 / B4=kit384/direct0/force13243 / B5=kit35/direct0/force913 / B6=kit0/direct0/force28 / B7=kit0/direct0/force4。
  - 分岐集計 ceiling: B1=kit0/direct0/force58820 / B2=kit1078/direct0/force56422 / B3=kit723/direct0/force40127 / B4=kit384/direct0/force13243 / B5=kit37/direct4/force942 / B6=kit0/direct0/force28 / B7=kit2/direct0/force5。
  - 選別効果判定: 実測Δ=-0.13pt / current階層率固定・ceiling試行構成再重み付け=-0.09pt〜+0.00pt / 残差=-0.13pt〜-0.04pt / 構成比で説明不能（上下限）。
- workshop-complete / never / Fighter:
  - 開封 floor 構成 current: B1=91074 (36.9% [36.7%, 37.1%]) / B2=82858 (33.5% [33.4%, 33.7%]) / B3=52246 (21.1% [21.0%, 21.3%]) / B4=18607 (7.5% [7.4%, 7.6%]) / B5=2040 (0.8% [0.8%, 0.9%]) / B6=100 (0.0% [0.0%, 0.0%]) / B7=77 (0.0% [0.0%, 0.0%]) / B8=24 (0.0% [0.0%, 0.0%]) / B9=11 (0.0% [0.0%, 0.0%]) / B10=2 (0.0% [0.0%, 0.0%])。
  - 開封 floor 構成 ceiling: B1=91074 (36.9% [36.7%, 37.1%]) / B2=82858 (33.5% [33.4%, 33.7%]) / B3=52246 (21.1% [21.0%, 21.3%]) / B4=18607 (7.5% [7.4%, 7.6%]) / B5=2083 (0.8% [0.8%, 0.9%]) / B6=89 (0.0% [0.0%, 0.0%]) / B7=53 (0.0% [0.0%, 0.0%]) / B8=21 (0.0% [0.0%, 0.0%])。
  - 階層別解除率 current: B2=100.0% [99.7%, 100.0%] (attempt=1152) / B3=100.0% [99.5%, 100.0%] (attempt=802) / B4=100.0% [99.2%, 100.0%] (attempt=470) / B5=100.0% [92.9%, 100.0%] (attempt=50) / B6=100.0% [51.0%, 100.0%; N<30 未確定] (attempt=4) / B7=100.0% [34.2%, 100.0%; N<30 未確定] (attempt=2) / B8=100.0% [20.7%, 100.0%; N<30 未確定] (attempt=1) / B9=100.0% [20.7%, 100.0%; N<30 未確定] (attempt=1)。
  - 階層別解除率 ceiling: B2=100.0% [99.7%, 100.0%] (attempt=1152) / B3=100.0% [99.5%, 100.0%] (attempt=802) / B4=100.0% [99.2%, 100.0%] (attempt=470) / B5=81.3% [73.0%, 87.4%] (attempt=112) / B6=100.0% [51.0%, 100.0%; N<30 未確定] (attempt=4) / B7=100.0% [51.0%, 100.0%; N<30 未確定] (attempt=4)。
  - 分岐集計 current: B1=kit0/direct0/force59206 / B2=kit1152/direct0/force57956 / B3=kit802/direct0/force40927 / B4=kit470/direct0/force15777 / B5=kit50/direct0/force1825 / B6=kit4/direct0/force77 / B7=kit2/direct0/force56 / B8=kit1/direct0/force15 / B9=kit1/direct0/force4 / B10=kit0/direct0/force2。
  - 分岐集計 ceiling: B1=kit0/direct0/force59206 / B2=kit1152/direct0/force57956 / B3=kit802/direct0/force40927 / B4=kit470/direct0/force15777 / B5=kit59/direct53/force1810 / B6=kit4/direct0/force70 / B7=kit4/direct0/force40 / B8=kit0/direct0/force20。
  - 選別効果判定: 実測Δ=-0.83pt / current階層率固定・ceiling試行構成再重み付け=+0.00pt / 残差=-0.83pt / 構成比で説明不能（上下限）。
- workshop-complete / never / Thief:
  - 開封 floor 構成 current: B1=90853 (28.2% [28.0%, 28.4%]) / B2=82288 (25.5% [25.4%, 25.7%]) / B3=66977 (20.8% [20.6%, 20.9%]) / B4=47187 (14.6% [14.5%, 14.8%]) / B5=18003 (5.6% [5.5%, 5.7%]) / B6=6464 (2.0% [2.0%, 2.1%]) / B7=4807 (1.5% [1.5%, 1.5%]) / B8=3104 (1.0% [0.9%, 1.0%]) / B9=1856 (0.6% [0.6%, 0.6%]) / B10=503 (0.2% [0.1%, 0.2%]) / B11=87 (0.0% [0.0%, 0.0%]) / B12=54 (0.0% [0.0%, 0.0%]) / B13=34 (0.0% [0.0%, 0.0%])。
  - 開封 floor 構成 ceiling: B1=90853 (27.4% [27.3%, 27.6%]) / B2=82288 (24.8% [24.7%, 25.0%]) / B3=66977 (20.2% [20.1%, 20.4%]) / B4=47187 (14.2% [14.1%, 14.4%]) / B5=18492 (5.6% [5.5%, 5.7%]) / B6=7428 (2.2% [2.2%, 2.3%]) / B7=6207 (1.9% [1.8%, 1.9%]) / B8=4821 (1.5% [1.4%, 1.5%]) / B9=3664 (1.1% [1.1%, 1.1%]) / B10=1545 (0.5% [0.4%, 0.5%]) / B11=588 (0.2% [0.2%, 0.2%]) / B12=450 (0.1% [0.1%, 0.1%]) / B13=344 (0.1% [0.1%, 0.1%]) / B14=267 (0.1% [0.1%, 0.1%]) / B15=82 (0.0% [0.0%, 0.0%]) / B16=15 (0.0% [0.0%, 0.0%]) / B17=2 (0.0% [0.0%, 0.0%])。
  - 階層別解除率 current: B1=84.9% [84.6%, 85.2%] (attempt=53852) / B2=86.1% [85.8%, 86.4%] (attempt=51584) / B3=86.6% [86.2%, 86.9%] (attempt=48091) / B4=86.9% [86.5%, 87.2%] (attempt=37601) / B5=86.8% [86.3%, 87.3%] (attempt=14866) / B6=87.8% [86.9%, 88.8%] (attempt=4482) / B7=88.0% [86.8%, 89.0%] (attempt=3527) / B8=87.7% [86.3%, 89.0%] (attempt=2321) / B9=89.4% [87.7%, 90.9%] (attempt=1436) / B10=87.7% [84.1%, 90.5%] (attempt=397) / B11=91.0% [81.8%, 95.8%] (attempt=67) / B12=85.4% [71.6%, 93.1%] (attempt=41) / B13=92.9% [77.4%, 98.0%; N<30 未確定] (attempt=28)。
  - 階層別解除率 ceiling: B1=84.9% [84.6%, 85.2%] (attempt=53852) / B2=86.1% [85.8%, 86.4%] (attempt=51584) / B3=86.6% [86.2%, 86.9%] (attempt=48091) / B4=86.9% [86.5%, 87.2%] (attempt=37601) / B5=96.0% [95.7%, 96.3%] (attempt=16977) / B6=95.5% [95.0%, 96.0%] (attempt=5969) / B7=97.7% [97.2%, 98.1%] (attempt=4967) / B8=98.1% [97.7%, 98.5%] (attempt=3862) / B9=98.5% [98.0%, 98.9%] (attempt=2963) / B10=98.4% [97.5%, 98.9%] (attempt=1230) / B11=99.4% [98.1%, 99.8%] (attempt=471) / B12=99.2% [97.6%, 99.7%] (attempt=364) / B13=100.0% [98.6%, 100.0%] (attempt=271) / B14=100.0% [98.3%, 100.0%] (attempt=217) / B15=100.0% [94.3%, 100.0%] (attempt=63) / B16=100.0% [78.5%, 100.0%; N<30 未確定] (attempt=14) / B17=100.0% [34.2%, 100.0%; N<30 未確定] (attempt=2)。
  - 分岐集計 current: B1=kit0/direct53852/force5136 / B2=kit1369/direct50215/force7105 / B3=kit1237/direct46854/force5554 / B4=kit1551/direct36050/force3691 / B5=kit782/direct14084/force1672 / B6=kit253/direct4229/force707 / B7=kit219/direct3308/force386 / B8=kit135/direct2186/force181 / B9=kit76/direct1360/force73 / B10=kit20/direct377/force9 / B11=kit2/direct65/force4 / B12=kit1/direct40/force2 / B13=kit1/direct27/force0。
  - 分岐集計 ceiling: B1=kit0/direct53852/force5136 / B2=kit1369/direct50215/force7105 / B3=kit1237/direct46854/force5554 / B4=kit1551/direct36050/force3691 / B5=kit834/direct16143/force0 / B6=kit294/direct5675/force0 / B7=kit283/direct4684/force0 / B8=kit211/direct3651/force0 / B9=kit115/direct2848/force0 / B10=kit39/direct1191/force0 / B11=kit20/direct451/force0 / B12=kit8/direct356/force0 / B13=kit5/direct266/force0 / B14=kit2/direct215/force0 / B15=kit1/direct62/force0 / B16=kit0/direct14/force0 / B17=kit0/direct2/force0。
  - 選別効果判定: 実測Δ=+1.59pt / current階層率固定・ceiling試行構成再重み付け=-0.03pt〜+0.10pt / 残差=+1.49pt〜+1.62pt / 構成比で説明不能（上下限）。
- workshop-complete / never / Priest:
  - 開封 floor 構成 current: B1=82652 (22.5% [22.4%, 22.7%]) / B2=63934 (17.4% [17.3%, 17.6%]) / B3=52993 (14.4% [14.3%, 14.6%]) / B4=45797 (12.5% [12.4%, 12.6%]) / B5=32181 (8.8% [8.7%, 8.9%]) / B6=24754 (6.7% [6.7%, 6.8%]) / B7=21464 (5.9% [5.8%, 5.9%]) / B8=16803 (4.6% [4.5%, 4.6%]) / B9=12095 (3.3% [3.2%, 3.4%]) / B10=6918 (1.9% [1.8%, 1.9%]) / B11=4066 (1.1% [1.1%, 1.1%]) / B12=1925 (0.5% [0.5%, 0.5%]) / B13=765 (0.2% [0.2%, 0.2%]) / B14=285 (0.1% [0.1%, 0.1%]) / B15=62 (0.0% [0.0%, 0.0%]) / B16=33 (0.0% [0.0%, 0.0%]) / B17=12 (0.0% [0.0%, 0.0%]) / B18=8 (0.0% [0.0%, 0.0%]) / B19=6 (0.0% [0.0%, 0.0%])。
  - 開封 floor 構成 ceiling: B1=82652 (22.8% [22.6%, 22.9%]) / B2=63934 (17.6% [17.5%, 17.7%]) / B3=52993 (14.6% [14.5%, 14.7%]) / B4=45797 (12.6% [12.5%, 12.7%]) / B5=31595 (8.7% [8.6%, 8.8%]) / B6=23931 (6.6% [6.5%, 6.7%]) / B7=20734 (5.7% [5.6%, 5.8%]) / B8=16251 (4.5% [4.4%, 4.5%]) / B9=11626 (3.2% [3.1%, 3.3%]) / B10=7075 (1.9% [1.9%, 2.0%]) / B11=3835 (1.1% [1.0%, 1.1%]) / B12=1825 (0.5% [0.5%, 0.5%]) / B13=686 (0.2% [0.2%, 0.2%]) / B14=254 (0.1% [0.1%, 0.1%]) / B15=42 (0.0% [0.0%, 0.0%]) / B16=8 (0.0% [0.0%, 0.0%])。
  - 階層別解除率 current: B2=100.0% [99.5%, 100.0%] (attempt=823) / B3=100.0% [99.5%, 100.0%] (attempt=793) / B4=100.0% [99.7%, 100.0%] (attempt=1114) / B5=100.0% [99.6%, 100.0%] (attempt=1011) / B6=99.5% [98.8%, 99.8%] (attempt=854) / B7=99.7% [99.1%, 99.9%] (attempt=768) / B8=99.6% [98.7%, 99.9%] (attempt=558) / B9=100.0% [99.1%, 100.0%] (attempt=407) / B10=100.0% [98.4%, 100.0%] (attempt=240) / B11=100.0% [97.3%, 100.0%] (attempt=138) / B12=100.0% [94.1%, 100.0%] (attempt=61) / B13=100.0% [81.6%, 100.0%; N<30 未確定] (attempt=17) / B14=100.0% [51.0%, 100.0%; N<30 未確定] (attempt=4) / B16=100.0% [34.2%, 100.0%; N<30 未確定] (attempt=2)。
  - 階層別解除率 ceiling: B2=100.0% [99.5%, 100.0%] (attempt=823) / B3=100.0% [99.5%, 100.0%] (attempt=793) / B4=100.0% [99.7%, 100.0%] (attempt=1114) / B5=87.1% [85.3%, 88.7%] (attempt=1543) / B6=90.9% [89.0%, 92.4%] (attempt=1096) / B7=89.6% [87.4%, 91.4%] (attempt=884) / B8=92.4% [90.2%, 94.1%] (attempt=720) / B9=91.8% [88.9%, 93.9%] (attempt=474) / B10=90.3% [85.9%, 93.4%] (attempt=237) / B11=95.9% [91.8%, 98.0%] (attempt=171) / B12=90.9% [81.6%, 95.8%] (attempt=66) / B13=86.1% [71.3%, 93.9%] (attempt=36) / B14=69.2% [42.4%, 87.3%; N<30 未確定] (attempt=13) / B15=100.0% [34.2%, 100.0%; N<30 未確定] (attempt=2) / B16=100.0% [20.7%, 100.0%; N<30 未確定] (attempt=1)。
  - 分岐集計 current: B1=kit0/direct0/force53670 / B2=kit823/direct0/force44976 / B3=kit793/direct0/force41499 / B4=kit1114/direct0/force38904 / B5=kit1011/direct0/force28452 / B6=kit845/direct9/force19084 / B7=kit764/direct4/force16339 / B8=kit556/direct2/force12867 / B9=kit407/direct0/force9266 / B10=kit240/direct0/force5346 / B11=kit138/direct0/force3103 / B12=kit61/direct0/force1451 / B13=kit17/direct0/force589 / B14=kit4/direct0/force229 / B15=kit0/direct0/force47 / B16=kit2/direct0/force25 / B17=kit0/direct0/force9 / B18=kit0/direct0/force7 / B19=kit0/direct0/force4。
  - 分岐集計 ceiling: B1=kit0/direct0/force53670 / B2=kit823/direct0/force44976 / B3=kit793/direct0/force41499 / B4=kit1114/direct0/force38904 / B5=kit1051/direct492/force27437 / B6=kit846/direct250/force18065 / B7=kit698/direct186/force15684 / B8=kit579/direct141/force12313 / B9=kit377/direct97/force8856 / B10=kit201/direct36/force5418 / B11=kit155/direct16/force2876 / B12=kit51/direct15/force1374 / B13=kit22/direct14/force516 / B14=kit5/direct8/force191 / B15=kit0/direct2/force32 / B16=kit1/direct0/force3。
  - 選別効果判定: 実測Δ=-6.53pt / current階層率固定・ceiling試行構成再重み付け=-0.03pt〜-0.01pt / 残差=-6.52pt〜-6.50pt / 構成比で説明不能（上下限）。
- workshop-complete / never / Mage:
  - 開封 floor 構成 current: B1=90074 (38.1% [37.9%, 38.3%]) / B2=81030 (34.3% [34.1%, 34.5%]) / B3=49512 (21.0% [20.8%, 21.1%]) / B4=14806 (6.3% [6.2%, 6.4%]) / B5=810 (0.3% [0.3%, 0.4%])。
  - 開封 floor 構成 ceiling: B1=90074 (38.1% [37.9%, 38.3%]) / B2=81030 (34.3% [34.1%, 34.5%]) / B3=49512 (21.0% [20.8%, 21.1%]) / B4=14806 (6.3% [6.2%, 6.4%]) / B5=825 (0.3% [0.3%, 0.4%]) / B6=12 (0.0% [0.0%, 0.0%])。
  - 階層別解除率 current: B2=100.0% [99.6%, 100.0%] (attempt=1073) / B3=100.0% [99.5%, 100.0%] (attempt=774) / B4=100.0% [99.0%, 100.0%] (attempt=375) / B5=100.0% [88.6%, 100.0%] (attempt=30)。
  - 階層別解除率 ceiling: B2=100.0% [99.6%, 100.0%] (attempt=1073) / B3=100.0% [99.5%, 100.0%] (attempt=774) / B4=100.0% [99.0%, 100.0%] (attempt=375) / B5=75.8% [59.0%, 87.2%] (attempt=33)。
  - 分岐集計 current: B1=kit0/direct0/force58422 / B2=kit1073/direct0/force56874 / B3=kit774/direct0/force38760 / B4=kit375/direct0/force12622 / B5=kit30/direct0/force712。
  - 分岐集計 ceiling: B1=kit0/direct0/force58422 / B2=kit1073/direct0/force56874 / B3=kit774/direct0/force38760 / B4=kit375/direct0/force12622 / B5=kit19/direct14/force721 / B6=kit0/direct0/force9。
  - 選別効果判定: 実測Δ=-0.35pt / current階層率固定・ceiling試行構成再重み付け=+0.00pt / 残差=-0.35pt / 構成比で説明不能（上下限）。

## 宝箱副作用・職業別

- smart / 全職: 解除率 86.8% [86.6%, 86.9%]→88.0% [87.8%, 88.1%]、罠被害HP/run 39.01 [38.75, 39.27]→38.68 [38.42, 38.94]、素材/run 46.01 [45.74, 46.28]→46.29 [46.01, 46.56]、開封/run 22.53 [22.40, 22.66]→22.67 [22.54, 22.80]。
  - Fighter: 解除率 100.0% [99.8%, 100.0%]→99.2% [98.8%, 99.5%]、罠被害 38.51 [38.23, 38.80]→38.51 [38.23, 38.80]、素材 36.65 [36.40, 36.91]→36.65 [36.39, 36.91]。
  - Thief: 解除率 86.1% [86.0%, 86.3%]→87.6% [87.4%, 87.7%]、罠被害 19.91 [19.71, 20.11]→18.79 [18.59, 18.99]、素材 52.24 [51.77, 52.70]→53.57 [53.05, 54.09]。
  - Priest: 解除率 100.0% [99.9%, 100.0%]→93.8% [93.2%, 94.3%]、罠被害 56.83 [56.00, 57.65]→56.63 [55.80, 57.46]、素材 56.32 [55.46, 57.18]→56.10 [55.23, 56.97]。
  - Mage: 解除率 100.0% [99.8%, 100.0%]→99.9% [99.7%, 100.0%]、罠被害 40.79 [40.51, 41.06]→40.78 [40.51, 41.06]、素材 38.82 [38.55, 39.08]→38.82 [38.56, 39.08]。
- never / 全職: 解除率 86.7% [86.6%, 86.8%]→87.8% [87.7%, 88.0%]、罠被害HP/run 38.36 [38.10, 38.61]→38.15 [37.90, 38.41]、素材/run 45.30 [45.03, 45.56]→45.68 [45.40, 45.95]、開封/run 22.21 [22.08, 22.34]→22.40 [22.27, 22.53]。
  - Fighter: 解除率 100.0% [99.8%, 100.0%]→99.8% [99.5%, 99.9%]、罠被害 38.26 [37.98, 38.54]→38.28 [38.00, 38.56]、素材 36.24 [35.98, 36.49]→36.26 [36.01, 36.52]。
  - Thief: 解除率 86.1% [85.9%, 86.2%]→87.5% [87.3%, 87.6%]、罠被害 19.59 [19.39, 19.80]→18.54 [18.33, 18.74]、素材 51.53 [51.07, 51.99]→52.91 [52.38, 53.43]。
  - Priest: 解除率 99.8% [99.6%, 99.9%]→93.0% [92.4%, 93.5%]、罠被害 55.40 [54.60, 56.20]→55.62 [54.81, 56.44]、素材 55.10 [54.26, 55.94]→55.20 [54.35, 56.05]。
  - Mage: 解除率 100.0% [99.8%, 100.0%]→99.8% [99.5%, 99.9%]、罠被害 40.18 [39.90, 40.45]→40.18 [39.90, 40.45]、素材 38.34 [38.08, 38.59]→38.34 [38.08, 38.60]。
- 盗賊はapt（base80/max90）、非apt職はbase40/max60の現行解除式を使用。僧侶だけ解除率が大きく逆方向へ低下: smart: 100.0% [99.9%, 100.0%]→93.8% [93.2%, 94.3%] / never: 99.8% [99.6%, 99.9%]→93.0% [92.4%, 93.5%]。直感に反する差はbalanceより測定側のバグを先に疑う（#441で結論が覆った前例）。
- #461基準線では僧侶の到達floor=4.45で4職最深。ceilingでfloorがさらに伸び、深層の解除困難な宝箱を多く開けた選別なら整合する。今回の宝箱単位出力で、開封 floor 構成・階層別解除率・固定率再重み付けを比較した。全職 smart の開封/runは 22.53 [22.40, 22.66]→22.67 [22.54, 22.80]、僧侶は smart: 27.47 [27.06, 27.88]→27.37 [26.96, 27.78] / never: 26.84 [26.44, 27.24]→26.90 [26.50, 27.31]。
- 宝箱集計整合性監査: 全case pass（分子・分母・floor/path合計一致）。

## trapSense cap

- workshop-core-pools / smart: detection cap-hit 0.0% [0.0%, 0.0%]→0.0% [0.0%, 0.0%]（attempt=258860）。trapBonus ceilingで trapSense 値は変更せず、cap張り付きだけ実測。
- workshop-core-pools / never: detection cap-hit 0.0% [0.0%, 0.0%]→0.0% [0.0%, 0.0%]（attempt=254069）。trapBonus ceilingで trapSense 値は変更せず、cap張り付きだけ実測。
- workshop-complete / smart: detection cap-hit 0.0% [0.0%, 0.0%]→0.0% [0.0%, 0.0%]（attempt=277611）。trapBonus ceilingで trapSense 値は変更せず、cap張り付きだけ実測。
- workshop-complete / never: detection cap-hit 0.0% [0.0%, 0.0%]→0.0% [0.0%, 0.0%]（attempt=271614）。trapBonus ceilingで trapSense 値は変更せず、cap張り付きだけ実測。

## 多重比較

- acceptance family: 2 scenario × 2 cure × (A1 1 + A2 1 + A3 3) = 20 tests。α=.05期待偽陽性=1.0本。
- paired movement audit: 24 testsを別 family として明示。合算上限=44 tests、期待偽陽性=2.2本。単発CI非交差・符号不一致は採用しない。

## 実行監査

- node=v26.7.0 / platform=darwin / arch=arm64。availableParallelism=15、resolved parallelism=15。SIM_PARALLEL未指定、SIM_MAP_CACHE_ENTRIES未指定（runtime default）。
- calibration wall=6.359s / simulation wall=1606.421s / total wall=1612.780s / total CPU=22594.014s。
- env SHA-256=781088156c5cc24768b69a9018976a823dbeb07382a0f605ffd1ac1357843f9f。
- model env SHA-256（SIM_RESULT_BASENAMEをPR #472の値へ正規化）=29816ff097a684942b1ad24ae0bf9a71a41092ec283c9e8c1dd85f6e3248380f。実測 artifact basenameだけはissue-473-priest-disarm。
- raw JSONL SHA-256=0fbad16073cacb8d1c73fda9aac36078132ab5733e35fc71ea647b98873b2182。
- summary JSON SHA-256=9b4266a768206b2b1e076791df270894ff1b4a6ec6f4929d6e4ef3a12d9e1c7b。

## 完全な env

```text
SIM_SEED=271
SIM_RUNS=50100
SIM_CALIBRATION_RUNS=100
SIM_SCENARIOS=workshop-core-pools,workshop-complete
DEPARTURE_CRAFT_IDS=TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION
IDENTIFICATION_POLICY=powder
IDENTIFICATION_STARTING_POWDER=2
IDENTIFICATION_COST_OVERRIDE=1
FLEE_POLICY=threshold
FLEE_HP_THRESHOLD=0.35
TRAP_POLICY=conservative
TRAP_AVOIDANCE_POLICY=ev
TRAP_DAMAGE_MULTIPLIER=1
STATUS_CURE_POLICY=smart
STATUS_CURE_HP_THRESHOLD=0.35
STATUS_CURE_MERCHANT_POLICY=missing
HEAL_POTION_MERCHANT_POLICY=missing
PORTAL_HP_THRESHOLD=0.35
PORTAL_MAX_HEAL_POTIONS=0
PORTAL_MIN_FLOOR=3
ELITE_POLICY=avoid
SIM_440_CONDITION=current
SIM_EQUIPMENT_POLICY=individual-score
SIM_EQUIPMENT_SLOT_MODE=standard
SIM_EQUIPMENT_SLOT_AFFIX_MODE=retain
SIM_MATCHING_DEFINITION=exact
SIM_CURSE_LOCK_MODE=current
SIM_SUPPORT_SUPPLY_CEILING=none
SIM_CORE_SCORE_DROP_TOLERANCE=0
SIM_MAP_STATS=0
SIM_DAMAGE_PROBE=0
SIM_PRESET=
SIM_DIAGNOSTICS=off
SIM_RESULT_BASENAME=issue-473-priest-disarm
SIM_PARALLEL=<omitted>
SIM_MAP_CACHE_ENTRIES=<omitted>
```

## 実行コマンド

SIM_SEED=271 SIM_RUNS=50100 SIM_CALIBRATION_RUNS=100 SIM_SCENARIOS=workshop-core-pools,workshop-complete DEPARTURE_CRAFT_IDS=TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION IDENTIFICATION_POLICY=powder IDENTIFICATION_STARTING_POWDER=2 IDENTIFICATION_COST_OVERRIDE=1 FLEE_POLICY=threshold FLEE_HP_THRESHOLD=0.35 TRAP_POLICY=conservative TRAP_AVOIDANCE_POLICY=ev TRAP_DAMAGE_MULTIPLIER=1 STATUS_CURE_POLICY=smart STATUS_CURE_HP_THRESHOLD=0.35 STATUS_CURE_MERCHANT_POLICY=missing HEAL_POTION_MERCHANT_POLICY=missing PORTAL_HP_THRESHOLD=0.35 PORTAL_MAX_HEAL_POTIONS=0 PORTAL_MIN_FLOOR=3 ELITE_POLICY=avoid SIM_440_CONDITION=current SIM_EQUIPMENT_POLICY=individual-score SIM_EQUIPMENT_SLOT_MODE=standard SIM_EQUIPMENT_SLOT_AFFIX_MODE=retain SIM_MATCHING_DEFINITION=exact SIM_CURSE_LOCK_MODE=current SIM_SUPPORT_SUPPLY_CEILING=none SIM_CORE_SCORE_DROP_TOLERANCE=0 SIM_MAP_STATS=0 SIM_DAMAGE_PROBE=0 SIM_PRESET= SIM_DIAGNOSTICS=off SIM_RESULT_BASENAME=issue-473-priest-disarm node scratch/simulations/sim_issue_468_exposure_ceiling.js（50100 run/cell）。

## Review checklist

- 適用: .agents/balance-simulation.md。N設計、95% CI、class-centered、paired監査、無条件floor、複数比較、run易化、副作用を確認。
- 未適用: UI/mobile、QA/browser、game-design canon。UI変更・balance source変更がなく、canonは unaffected。
- 実施: node --check、import/export確認、N=1 smoke、scratch/tests/regression/test_sim_reward_paths.js、npm run lint、npm run test:unit。
- 未実施: npm run build、npm run test:browser（UI変更なし）。

Refs #473, #468
