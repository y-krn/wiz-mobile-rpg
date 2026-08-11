# Issue #473 — 僧侶の宝箱解除率切り分け

## 結論

**実挙動。** 宝箱単位の分子・分母・floor/path合計は全caseで一致し、僧侶の ceiling における解除率差は開封 floor 構成比だけでは説明できない。current/ceilingのkit・direct・forced経路を新しい解除方針の下で比較する。
- Priest / workshop-core-pools / smart: attempts 1001→965、kit 70→57、direct 931→908、forced 1448→1422。
- 解除率は `chestDisarmSuccesses / chestDisarmAttempts`。TRAP_KIT成功と直接解除成功を合算する既存endpointは変更せず、経路別・floor別診断を追加した。balance値、#468 A1/A2判定は変更しない。
- したがって本件は balance 修正ではなく、対策 affix 評価時に「解除率」と「解除試行経路」を分けて読むべき実挙動。集計バグではないため、#326 / #346 / #354 / #398 の既存rate集計を一括無効化・再取り直しする対象はない。追加のfloor/path診断が必要な測定だけは別途再測定する。

## 天井判定

**動く（部分成立）。** 天井条件で #271 の A1 または A2 が少なくとも1セルで成立。
第2段（保有率の knee 掃引）へ進む価値あり。ただし本PRでは掃引しない。
- ここでの「動かない」は #271 の受入基準に対する判定。floorが動かないという意味ではない。

## 測定条件

- PR #472 本文の測定条件・SHA・envを再現。#461 / PR #469 の固定基準線ではない。
- seed=271、基本4職、target depth=21。主状態=workshop-core-pools / workshop-complete、cure=smart / never。
- 現行値: 装備 10/15/20 / 装身具 10/15。biome側 gimmicks.trapBonus は変更・使用なし。
- ceiling: B5 entry直前の既生成装備へ trapBonus 20 を追加・既存値より低い場合は20へ引上げ。乱数消費なし。B5 entrant以外へ適用なし。
- sim側の宝箱解除判断=TRAP_POLICY=conservative / src/rulesのtrap effect・content・kit opportunity costからaction EVを導出。代表近似閾値=50.0%。kit・direct・forcedを固定50%比較ではなく動的EVで選ぶ。
- 実ゲーム側は src/chest.js:347 executeDisarm → src/rules/trap_rules.js:131 calculateChestDisarmChance。simも同じ判定関数を呼び、式の再掲はしていない。
- 罠致死性、解除式、宝箱生成、trapSense値、balance source値は変更なし。

## N設計

- A1はB5 entrant全体を職内combatBuildScore quartileに分けたQ4−Q1差。#467参照値は workshop-core-pools=-0.0061、workshop-complete=-0.1630。A2はB5 entrant全体の職内centered相関。#467参照値は r=0.1650（受入gate r≥0.2000）。
- #467と同オーダーの entrant N=11,000 を目標。有群率では割らない。ceiling 有群率1.0 は変換対象を決めるだけで、entrant分母を増やさない。
- B5 entrant率0.2199から ceil(11,000 / (0.2199 × 1.0)) = 50,023 run/cell。実測 500 run/cell（上式以上）。
- entrant N=11,000なら quartile 1つ約2750。A1の二群率差をBernoulli分散最大で近似した95%半幅は±0.0264（±2.64pt）。
- A2のFisher-z標準誤差=0.00954、95%半幅 z=0.01869。r=0.1650で近似CI [0.1468, 0.1831]。
- 現行 control の実trapBonus保有率は診断値。A1/A2の分母は常に全B5 entrant。

## A1 / A2 / A3

- workshop-core-pools / smart: B5 entrant control=117 / placebo=117 / ceiling=117。
  - A1 control=未確定（N<30） Q4−Q1=-0.1763 [-0.3948, 0.0422; N<30 未確定] / ceiling=未確定（N<30） Q4−Q1=-0.0634 [-0.2886, 0.1618; N<30 未確定]; Q4死亡率=22.2% [10.6%, 40.8%; N<30 未確定]; monotonic=不成立。
  - A2 control=不成立 r=0.1527 [-0.0296, 0.3253] / ceiling=成立 r=0.2592 [0.0815, 0.4209]。
  - A3 control→ceiling: coreCount=未確定（総N<194またはlevel 1/2のN<30） / combatCoreCount=未確定（総N<194またはlevel 1/2のN<30） / economyCoreCount=未確定（総N<194またはlevel 1/2のN<30） / coreWithMatchingSupport=未確定（N<30） → coreCount=未確定（総N<194またはlevel 1/2のN<30） / combatCoreCount=未確定（総N<194またはlevel 1/2のN<30） / economyCoreCount=未確定（総N<194またはlevel 1/2のN<30） / coreWithMatchingSupport=未確定（N<30）。
- workshop-core-pools / never: B5 entrant control=92 / placebo=92 / ceiling=92。
  - A1 control=未確定（N<30） Q4−Q1=-0.0169 [-0.2629, 0.2291; N<30 未確定] / ceiling=未確定（N<30） Q4−Q1=-0.1756 [-0.4282, 0.0770; N<30 未確定]; Q4死亡率=23.8% [10.6%, 45.1%; N<30 未確定]; monotonic=不成立。
  - A2 control=不成立 r=0.1199 [-0.0871, 0.3169] / ceiling=不成立 r=0.1524 [-0.0541, 0.3464]。
  - A3 control→ceiling: coreCount=未確定（総N<194またはlevel 1/2のN<30） / combatCoreCount=未確定（総N<194またはlevel 1/2のN<30） / economyCoreCount=未確定（総N<194またはlevel 1/2のN<30） / coreWithMatchingSupport=未確定（N<30） → coreCount=未確定（総N<194またはlevel 1/2のN<30） / combatCoreCount=未確定（総N<194またはlevel 1/2のN<30） / economyCoreCount=未確定（総N<194またはlevel 1/2のN<30） / coreWithMatchingSupport=未確定（N<30）。
- workshop-complete / smart: B5 entrant control=123 / placebo=123 / ceiling=123。
  - A1 control=未確定（N<30） Q4−Q1=-0.1581 [-0.3865, 0.0703; N<30 未確定] / ceiling=未確定（N<30） Q4−Q1=-0.2820 [-0.5065, -0.0575; N<30 未確定]; Q4死亡率=20.7% [9.8%, 38.4%; N<30 未確定]; monotonic=不成立。
  - A2 control=不成立 r=0.0980 [-0.0804, 0.2703] / ceiling=不成立 r=0.1115 [-0.0669, 0.2829]。
  - A3 control→ceiling: coreCount=未確定（総N<194またはlevel 1/2のN<30） / combatCoreCount=未確定（総N<194またはlevel 1/2のN<30） / economyCoreCount=未確定（総N<194またはlevel 1/2のN<30） / coreWithMatchingSupport=未確定（N<30） → coreCount=未確定（総N<194またはlevel 1/2のN<30） / combatCoreCount=未確定（総N<194またはlevel 1/2のN<30） / economyCoreCount=未確定（総N<194またはlevel 1/2のN<30） / coreWithMatchingSupport=未確定（N<30）。
- workshop-complete / never: B5 entrant control=110 / placebo=110 / ceiling=110。
  - A1 control=未確定（N<30） Q4−Q1=+0.0901 [-0.1020, 0.2822; N<30 未確定] / ceiling=未確定（N<30） Q4−Q1=-0.1002 [-0.3236, 0.1233; N<30 未確定]; Q4死亡率=24.0% [11.5%, 43.4%; N<30 未確定]; monotonic=不成立。
  - A2 control=不成立 r=0.0890 [-0.0999, 0.2717] / ceiling=不成立 r=0.0972 [-0.0917, 0.2793]。
  - A3 control→ceiling: coreCount=未確定（総N<194またはlevel 1/2のN<30） / combatCoreCount=未確定（総N<194またはlevel 1/2のN<30） / economyCoreCount=未確定（総N<194またはlevel 1/2のN<30） / coreWithMatchingSupport=未確定（N<30） → coreCount=未確定（総N<194またはlevel 1/2のN<30） / combatCoreCount=未確定（総N<194またはlevel 1/2のN<30） / economyCoreCount=未確定（総N<194またはlevel 1/2のN<30） / coreWithMatchingSupport=未確定（N<30）。
- #468のAcceptanceは A1 / A2 / A3 の3本すべて成立で #271解決。A1 / A2 は4セルすべて不成立なので、A3がcontrolで成立していても、ceilingで成立していても、打ち切り判定は変わらない。
- A1 Q4−Q1は職内centered、A2は職内centered Fisher z、A3も職内centered。率=Wilson 95% CI、相関=Fisher z 95% CI、平均/差=正規近似95% CI。
- N<30は未確定。CIが0を跨ぐ指標は効果なしと断定しない。

## placebo / ceiling paired

- placebo−current: paired。全 2000 pairで randomSequenceId監査。現行値・群定義のみの差は次の通り。
- smart:workshop-core-pools: floor=+0.000 [0.000, 0.000] / B5死亡=+0.000 [0.000, 0.000] / B5突破=+0.000 [0.000, 0.000]; 同一結果pair=500/500。
- smart:workshop-complete: floor=+0.000 [0.000, 0.000] / B5死亡=+0.000 [0.000, 0.000] / B5突破=+0.000 [0.000, 0.000]; 同一結果pair=500/500。
- never:workshop-core-pools: floor=+0.000 [0.000, 0.000] / B5死亡=+0.000 [0.000, 0.000] / B5突破=+0.000 [0.000, 0.000]; 同一結果pair=500/500。
- never:workshop-complete: floor=+0.000 [0.000, 0.000] / B5死亡=+0.000 [0.000, 0.000] / B5突破=+0.000 [0.000, 0.000]; 同一結果pair=500/500。
- ceiling−current: paired。post-generation / random consumption preserved / trajectory diverges。
- smart:workshop-core-pools: floor=+0.0620 [-0.0395, 0.1635] / B5死亡=-0.0171 [-0.0923, 0.0581] / B5突破=+0.0513 [-0.0195, 0.1220] / 生還=-0.0060 [-0.0248, 0.0128]。
- smart:workshop-complete: floor=-0.0160 [-0.1062, 0.0742] / B5死亡=+0.0081 [-0.0578, 0.0741] / B5突破=-0.0081 [-0.0701, 0.0538] / 生還=+0.0020 [-0.0151, 0.0191]。
- never:workshop-core-pools: floor=+0.0640 [-0.0265, 0.1545] / B5死亡=+0.0652 [-0.0138, 0.1442] / B5突破=-0.0217 [-0.1018, 0.0583] / 生還=-0.0220 [-0.0399, -0.0041]。
- never:workshop-complete: floor=-0.0080 [-0.1071, 0.0911] / B5死亡=+0.0818 [0.0096, 0.1540] / B5突破=-0.0636 [-0.1319, 0.0047] / 生還=-0.0160 [-0.0344, 0.0024]。

## runを楽にしていないか

- workshop-core-pools / smart: B5死亡 30.8% [23.1%, 39.6%]→29.1% [21.6%, 37.8%]、突破 36.8% [28.6%, 45.8%]→41.9% [33.3%, 50.9%]、全run平均floor 3.60 [3.41, 3.80]→3.67 [3.45, 3.88]。paired ceiling−currentは floor=+0.0620 [-0.0395, 0.1635] / B5死亡=-0.0171 [-0.0923, 0.0581] / B5突破=+0.0513 [-0.0195, 0.1220]。点推定方向=易化、CI判定=未確定。
- workshop-core-pools / never: B5死亡 21.7% [14.5%, 31.2%]→28.3% [20.1%, 38.2%]、突破 35.9% [26.8%, 46.1%]→33.7% [24.9%, 43.8%]、全run平均floor 3.30 [3.12, 3.48]→3.37 [3.17, 3.57]。paired ceiling−currentは floor=+0.0640 [-0.0265, 0.1545] / B5死亡=+0.0652 [-0.0138, 0.1442] / B5突破=-0.0217 [-0.1018, 0.0583]。点推定方向=混在/不明、CI判定=未確定。
- workshop-complete / smart: B5死亡 26.8% [19.8%, 35.3%]→27.6% [20.5%, 36.1%]、突破 30.9% [23.4%, 39.5%]→30.1% [22.7%, 38.7%]、全run平均floor 3.56 [3.37, 3.75]→3.55 [3.36, 3.73]。paired ceiling−currentは floor=-0.0160 [-0.1062, 0.0742] / B5死亡=+0.0081 [-0.0578, 0.0741] / B5突破=-0.0081 [-0.0701, 0.0538]。点推定方向=混在/不明、CI判定=未確定。
- workshop-complete / never: B5死亡 20.0% [13.6%, 28.4%]→28.2% [20.6%, 37.2%]、突破 41.8% [33.0%, 51.2%]→35.5% [27.1%, 44.7%]、全run平均floor 3.60 [3.41, 3.79]→3.59 [3.40, 3.79]。paired ceiling−currentは floor=-0.0080 [-0.1071, 0.0911] / B5死亡=+0.0818 [0.0096, 0.1540] / B5突破=-0.0636 [-0.1319, 0.0047]。点推定方向=混在/不明、CI判定=未確定。
- run易化は3指標すべてが望ましい方向へ95% CIで0を跨がない場合だけ「安定易化」。今回のセル別集計: 安定易化=0 / 安定悪化=0 / 未確定=4。
- 天井は floor を動かす。paired ceiling−current は4セル全て -0.0160〜+0.0640階、各95% CIが0を跨がない（floor移動=未確認）。ただし効果量は小さく、A1 / A2の受入基準は動かない。「動かない」は受入基準についての判定。
- B5死亡は悪化方向かつ95% CIが0を跨がないセルあり: never:workshop-complete +0.0818 [0.0096, 0.1540]。floorが伸びて深層へ到達したrunの選別が変わった解釈と整合するが、今回出力だけでは因果を確定しない。

## 宝箱単位 floor / 選別効果

- `opened` はsimが実際に拾った宝箱単位の floor 構成。階層別解除率の分母は従来 endpoint と同じ disarm attempt、分子はその成功。各率・各構成比は Wilson 95% CI。
- 選別効果の再重み付けは current の階層別解除率を固定し、ceiling の disarm-attempt floor 構成へ適用。構成比で説明できるかの判定は点推定、構成要素のCIと混同しない。
- workshop-core-pools / smart / Fighter:
  - 開封 floor 構成 current: B1=937 (41.9% [39.9%, 44.0%]) / B2=743 (33.2% [31.3%, 35.2%]) / B3=372 (16.6% [15.2%, 18.2%]) / B4=126 (5.6% [4.8%, 6.7%]) / B5=39 (1.7% [1.3%, 2.4%]) / B6=7 (0.3% [0.2%, 0.6%]) / B7=6 (0.3% [0.1%, 0.6%]) / B8=5 (0.2% [0.1%, 0.5%])。
  - 開封 floor 構成 ceiling: B1=937 (42.3% [40.2%, 44.3%]) / B2=743 (33.5% [31.6%, 35.5%]) / B3=372 (16.8% [15.3%, 18.4%]) / B4=126 (5.7% [4.8%, 6.7%]) / B5=32 (1.4% [1.0%, 2.0%]) / B6=7 (0.3% [0.2%, 0.7%])。
  - 階層別解除率 current: B1=25.9% [19.8%, 33.2%] (attempt=162) / B2=27.6% [21.6%, 34.4%] (attempt=185) / B3=32.8% [24.9%, 41.7%] (attempt=116) / B4=37.1% [23.2%, 53.7%] (attempt=35) / B5=33.3% [16.3%, 56.3%; N<30 未確定] (attempt=18) / B6=0.0% [0.0%, 56.1%; N<30 未確定] (attempt=3) / B7=0.0% [0.0%, 65.8%; N<30 未確定] (attempt=2) / B8=100.0% [34.2%, 100.0%; N<30 未確定] (attempt=2)。
  - 階層別解除率 ceiling: B1=25.9% [19.8%, 33.2%] (attempt=162) / B2=27.6% [21.6%, 34.4%] (attempt=185) / B3=32.8% [24.9%, 41.7%] (attempt=116) / B4=37.1% [23.2%, 53.7%] (attempt=35) / B5=64.3% [38.8%, 83.7%; N<30 未確定] (attempt=14) / B6=0.0% [0.0%, 79.3%; N<30 未確定] (attempt=1)。
  - 分岐集計 current: B1=kit0/direct162/force466 / B2=kit11/direct174/force345 / B3=kit7/direct109/force179 / B4=kit2/direct33/force78 / B5=kit3/direct15/force19 / B6=kit0/direct3/force4 / B7=kit0/direct2/force2 / B8=kit0/direct2/force2。
  - 分岐集計 ceiling: B1=kit0/direct162/force466 / B2=kit11/direct174/force345 / B3=kit7/direct109/force179 / B4=kit2/direct33/force78 / B5=kit2/direct12/force16 / B6=kit0/direct1/force6。
  - 選別効果判定: 実測Δ=+0.76pt / current階層率固定・ceiling試行構成再重み付け=-0.08pt / 残差=+0.84pt / 構成比で説明不能（上下限）。
- workshop-core-pools / smart / Thief:
  - 開封 floor 構成 current: B1=915 (24.2% [22.9%, 25.6%]) / B2=849 (22.5% [21.2%, 23.8%]) / B3=726 (19.2% [18.0%, 20.5%]) / B4=544 (14.4% [13.3%, 15.6%]) / B5=235 (6.2% [5.5%, 7.0%]) / B6=153 (4.0% [3.5%, 4.7%]) / B7=108 (2.9% [2.4%, 3.4%]) / B8=104 (2.8% [2.3%, 3.3%]) / B9=76 (2.0% [1.6%, 2.5%]) / B10=44 (1.2% [0.9%, 1.6%]) / B11=12 (0.3% [0.2%, 0.6%]) / B12=7 (0.2% [0.1%, 0.4%]) / B13=6 (0.2% [0.1%, 0.3%])。
  - 開封 floor 構成 ceiling: B1=915 (22.7% [21.5%, 24.1%]) / B2=849 (21.1% [19.9%, 22.4%]) / B3=726 (18.1% [16.9%, 19.3%]) / B4=544 (13.5% [12.5%, 14.6%]) / B5=242 (6.0% [5.3%, 6.8%]) / B6=177 (4.4% [3.8%, 5.1%]) / B7=125 (3.1% [2.6%, 3.7%]) / B8=139 (3.5% [2.9%, 4.1%]) / B9=121 (3.0% [2.5%, 3.6%]) / B10=72 (1.8% [1.4%, 2.2%]) / B11=38 (0.9% [0.7%, 1.3%]) / B12=33 (0.8% [0.6%, 1.1%]) / B13=27 (0.7% [0.5%, 1.0%]) / B14=11 (0.3% [0.2%, 0.5%]) / B15=3 (0.1% [0.0%, 0.2%])。
  - 階層別解除率 current: B1=82.3% [79.0%, 85.2%] (attempt=576) / B2=85.8% [82.6%, 88.4%] (attempt=548) / B3=85.3% [82.0%, 88.1%] (attempt=518) / B4=84.5% [80.8%, 87.6%] (attempt=438) / B5=84.2% [78.4%, 88.6%] (attempt=196) / B6=84.2% [76.4%, 89.8%] (attempt=114) / B7=88.6% [79.7%, 93.9%] (attempt=79) / B8=79.8% [70.0%, 87.0%] (attempt=84) / B9=85.0% [73.9%, 91.9%] (attempt=60) / B10=91.2% [77.0%, 97.0%] (attempt=34) / B11=100.0% [72.2%, 100.0%; N<30 未確定] (attempt=10) / B12=80.0% [37.6%, 96.4%; N<30 未確定] (attempt=5) / B13=100.0% [56.6%, 100.0%; N<30 未確定] (attempt=5)。
  - 階層別解除率 ceiling: B1=82.3% [79.0%, 85.2%] (attempt=576) / B2=85.8% [82.6%, 88.4%] (attempt=548) / B3=85.3% [82.0%, 88.1%] (attempt=518) / B4=84.5% [80.8%, 87.6%] (attempt=438) / B5=93.2% [89.1%, 95.8%] (attempt=220) / B6=94.5% [89.5%, 97.2%] (attempt=145) / B7=96.3% [90.8%, 98.5%] (attempt=107) / B8=97.2% [92.1%, 99.1%] (attempt=108) / B9=97.0% [91.5%, 99.0%] (attempt=99) / B10=96.0% [86.5%, 98.9%] (attempt=50) / B11=100.0% [89.0%, 100.0%] (attempt=31) / B12=96.4% [82.3%, 99.4%; N<30 未確定] (attempt=28) / B13=76.2% [54.9%, 89.4%; N<30 未確定] (attempt=21) / B14=100.0% [67.6%, 100.0%; N<30 未確定] (attempt=8) / B15=100.0% [43.9%, 100.0%; N<30 未確定] (attempt=3)。
  - 分岐集計 current: B1=kit0/direct576/force24 / B2=kit12/direct536/force33 / B3=kit13/direct505/force48 / B4=kit14/direct424/force38 / B5=kit7/direct189/force13 / B6=kit8/direct106/force7 / B7=kit6/direct73/force4 / B8=kit5/direct79/force0 / B9=kit2/direct58/force3 / B10=kit3/direct31/force0 / B11=kit0/direct10/force0 / B12=kit0/direct5/force0 / B13=kit0/direct5/force0。
  - 分岐集計 ceiling: B1=kit0/direct576/force24 / B2=kit12/direct536/force33 / B3=kit13/direct505/force48 / B4=kit14/direct424/force38 / B5=kit1/direct219/force2 / B6=kit1/direct144/force3 / B7=kit0/direct107/force1 / B8=kit1/direct107/force2 / B9=kit1/direct98/force4 / B10=kit0/direct50/force1 / B11=kit2/direct29/force0 / B12=kit0/direct28/force0 / B13=kit0/direct21/force0 / B14=kit0/direct8/force0 / B15=kit0/direct3/force0。
  - 選別効果判定: 実測Δ=+2.86pt / current階層率固定・ceiling試行構成再重み付け=-0.12pt〜+0.25pt / 残差=+2.61pt〜+2.99pt / 構成比で説明不能（上下限）。
- workshop-core-pools / smart / Priest:
  - 開封 floor 構成 current: B1=781 (24.7% [23.2%, 26.2%]) / B2=584 (18.5% [17.1%, 19.8%]) / B3=423 (13.4% [12.2%, 14.6%]) / B4=368 (11.6% [10.6%, 12.8%]) / B5=251 (7.9% [7.0%, 8.9%]) / B6=180 (5.7% [4.9%, 6.6%]) / B7=156 (4.9% [4.2%, 5.7%]) / B8=146 (4.6% [3.9%, 5.4%]) / B9=121 (3.8% [3.2%, 4.6%]) / B10=93 (2.9% [2.4%, 3.6%]) / B11=46 (1.5% [1.1%, 1.9%]) / B12=15 (0.5% [0.3%, 0.8%])。
  - 開封 floor 構成 ceiling: B1=781 (25.2% [23.7%, 26.7%]) / B2=584 (18.8% [17.5%, 20.2%]) / B3=423 (13.6% [12.5%, 14.9%]) / B4=368 (11.9% [10.8%, 13.1%]) / B5=248 (8.0% [7.1%, 9.0%]) / B6=197 (6.4% [5.5%, 7.3%]) / B7=145 (4.7% [4.0%, 5.5%]) / B8=122 (3.9% [3.3%, 4.7%]) / B9=92 (3.0% [2.4%, 3.6%]) / B10=66 (2.1% [1.7%, 2.7%]) / B11=37 (1.2% [0.9%, 1.6%]) / B12=11 (0.4% [0.2%, 0.6%]) / B13=18 (0.6% [0.4%, 0.9%]) / B14=9 (0.3% [0.2%, 0.6%])。
  - 階層別解除率 current: B1=20.0% [14.6%, 26.8%] (attempt=165) / B2=27.0% [20.6%, 34.5%] (attempt=152) / B3=34.4% [26.6%, 43.2%] (attempt=122) / B4=26.9% [19.7%, 35.5%] (attempt=119) / B5=29.2% [21.4%, 38.5%] (attempt=106) / B6=32.1% [23.1%, 42.7%] (attempt=84) / B7=29.6% [20.2%, 41.0%] (attempt=71) / B8=33.8% [23.5%, 46.0%] (attempt=65) / B9=25.0% [15.2%, 38.2%] (attempt=52) / B10=31.1% [19.5%, 45.7%] (attempt=45) / B11=35.3% [17.3%, 58.7%; N<30 未確定] (attempt=17) / B12=0.0% [0.0%, 56.1%; N<30 未確定] (attempt=3)。
  - 階層別解除率 ceiling: B1=20.0% [14.6%, 26.8%] (attempt=165) / B2=27.0% [20.6%, 34.5%] (attempt=152) / B3=34.4% [26.6%, 43.2%] (attempt=122) / B4=26.9% [19.7%, 35.5%] (attempt=119) / B5=48.7% [39.8%, 57.7%] (attempt=115) / B6=48.3% [38.1%, 58.6%] (attempt=87) / B7=62.1% [49.2%, 73.4%] (attempt=58) / B8=51.9% [38.9%, 64.6%] (attempt=54) / B9=32.3% [18.6%, 49.9%] (attempt=31) / B10=64.0% [44.5%, 79.8%; N<30 未確定] (attempt=25) / B11=33.3% [16.3%, 56.3%; N<30 未確定] (attempt=18) / B12=75.0% [40.9%, 92.9%; N<30 未確定] (attempt=8) / B13=33.3% [6.1%, 79.2%; N<30 未確定] (attempt=3) / B14=12.5% [2.2%, 47.1%; N<30 未確定] (attempt=8)。
  - 分岐集計 current: B1=kit0/direct165/force352 / B2=kit11/direct141/force266 / B3=kit3/direct119/force221 / B4=kit13/direct106/force212 / B5=kit9/direct97/force126 / B6=kit9/direct75/force63 / B7=kit7/direct64/force55 / B8=kit7/direct58/force50 / B9=kit5/direct47/force43 / B10=kit2/direct43/force31 / B11=kit4/direct13/force22 / B12=kit0/direct3/force7。
  - 分岐集計 ceiling: B1=kit0/direct165/force352 / B2=kit11/direct141/force266 / B3=kit3/direct119/force221 / B4=kit13/direct106/force212 / B5=kit11/direct104/force109 / B6=kit5/direct82/force75 / B7=kit4/direct54/force58 / B8=kit4/direct50/force37 / B9=kit3/direct28/force39 / B10=kit2/direct23/force24 / B11=kit0/direct18/force13 / B12=kit1/direct7/force3 / B13=kit0/direct3/force12 / B14=kit0/direct8/force1。
  - 選別効果判定: 実測Δ=+8.10pt / current階層率固定・ceiling試行構成再重み付け=-0.51pt〜+0.63pt / 残差=+7.47pt〜+8.61pt / 構成比で説明不能（上下限）。
- workshop-core-pools / smart / Mage:
  - 開封 floor 構成 current: B1=856 (37.3% [35.3%, 39.3%]) / B2=733 (31.9% [30.1%, 33.9%]) / B3=523 (22.8% [21.1%, 24.5%]) / B4=173 (7.5% [6.5%, 8.7%]) / B5=10 (0.4% [0.2%, 0.8%])。
  - 開封 floor 構成 ceiling: B1=856 (37.3% [35.3%, 39.3%]) / B2=733 (31.9% [30.0%, 33.8%]) / B3=523 (22.8% [21.1%, 24.5%]) / B4=173 (7.5% [6.5%, 8.7%]) / B5=12 (0.5% [0.3%, 0.9%])。
  - 階層別解除率 current: B1=21.7% [15.7%, 29.1%] (attempt=143) / B2=19.9% [14.9%, 26.1%] (attempt=191) / B3=25.8% [20.0%, 32.6%] (attempt=182) / B4=37.0% [25.4%, 50.4%] (attempt=54) / B5=25.0% [4.6%, 69.9%; N<30 未確定] (attempt=4)。
  - 階層別解除率 ceiling: B1=21.7% [15.7%, 29.1%] (attempt=143) / B2=19.9% [14.9%, 26.1%] (attempt=191) / B3=25.8% [20.0%, 32.6%] (attempt=182) / B4=37.0% [25.4%, 50.4%] (attempt=54) / B5=66.7% [30.0%, 90.3%; N<30 未確定] (attempt=6)。
  - 分岐集計 current: B1=kit0/direct143/force411 / B2=kit8/direct183/force335 / B3=kit12/direct170/force238 / B4=kit5/direct49/force100 / B5=kit0/direct4/force6。
  - 分岐集計 ceiling: B1=kit0/direct143/force411 / B2=kit8/direct183/force335 / B3=kit12/direct170/force238 / B4=kit5/direct49/force100 / B5=kit0/direct6/force6。
  - 選別効果判定: 実測Δ=+0.44pt / current階層率固定・ceiling試行構成再重み付け=+0.00pt / 残差=+0.43pt / 構成比で説明不能（上下限）。
- workshop-core-pools / never / Fighter:
  - 開封 floor 構成 current: B1=913 (44.1% [42.0%, 46.3%]) / B2=709 (34.3% [32.3%, 36.4%]) / B3=351 (17.0% [15.4%, 18.7%]) / B4=83 (4.0% [3.2%, 4.9%]) / B5=12 (0.6% [0.3%, 1.0%])。
  - 開封 floor 構成 ceiling: B1=913 (43.5% [41.4%, 45.6%]) / B2=709 (33.8% [31.8%, 35.8%]) / B3=351 (16.7% [15.2%, 18.4%]) / B4=83 (4.0% [3.2%, 4.9%]) / B5=19 (0.9% [0.6%, 1.4%]) / B6=9 (0.4% [0.2%, 0.8%]) / B7=6 (0.3% [0.1%, 0.6%]) / B8=7 (0.3% [0.2%, 0.7%]) / B9=2 (0.1% [0.0%, 0.3%])。
  - 階層別解除率 current: B1=27.5% [21.5%, 34.4%] (attempt=182) / B2=28.5% [22.9%, 34.9%] (attempt=214) / B3=34.7% [26.1%, 44.3%] (attempt=101) / B4=25.0% [10.2%, 49.5%; N<30 未確定] (attempt=16) / B5=40.0% [11.8%, 76.9%; N<30 未確定] (attempt=5)。
  - 階層別解除率 ceiling: B1=27.5% [21.5%, 34.4%] (attempt=182) / B2=28.5% [22.9%, 34.9%] (attempt=214) / B3=34.7% [26.1%, 44.3%] (attempt=101) / B4=25.0% [10.2%, 49.5%; N<30 未確定] (attempt=16) / B5=60.0% [23.1%, 88.2%; N<30 未確定] (attempt=5) / B6=100.0% [51.0%, 100.0%; N<30 未確定] (attempt=4) / B7=33.3% [6.1%, 79.2%; N<30 未確定] (attempt=3) / B8=25.0% [4.6%, 69.9%; N<30 未確定] (attempt=4) / B9=50.0% [9.5%, 90.5%; N<30 未確定] (attempt=2)。
  - 分岐集計 current: B1=kit0/direct182/force408 / B2=kit14/direct200/force317 / B3=kit3/direct98/force174 / B4=kit1/direct15/force50 / B5=kit0/direct5/force6。
  - 分岐集計 ceiling: B1=kit0/direct182/force408 / B2=kit14/direct200/force317 / B3=kit3/direct98/force174 / B4=kit1/direct15/force50 / B5=kit0/direct5/force10 / B6=kit0/direct4/force2 / B7=kit0/direct3/force3 / B8=kit0/direct4/force3 / B9=kit1/direct1/force0。
  - 選別効果判定: 実測Δ=+0.79pt / current階層率固定・ceiling試行構成再重み付け=-0.72pt〜+1.73pt / 残差=-0.94pt〜+1.51pt / 上下限内（未確定）。
- workshop-core-pools / never / Thief:
  - 開封 floor 構成 current: B1=908 (28.9% [27.3%, 30.5%]) / B2=782 (24.9% [23.4%, 26.4%]) / B3=622 (19.8% [18.4%, 21.2%]) / B4=420 (13.4% [12.2%, 14.6%]) / B5=154 (4.9% [4.2%, 5.7%]) / B6=73 (2.3% [1.9%, 2.9%]) / B7=53 (1.7% [1.3%, 2.2%]) / B8=51 (1.6% [1.2%, 2.1%]) / B9=46 (1.5% [1.1%, 1.9%]) / B10=26 (0.8% [0.6%, 1.2%]) / B11=6 (0.2% [0.1%, 0.4%])。
  - 開封 floor 構成 ceiling: B1=908 (27.4% [26.0%, 29.0%]) / B2=782 (23.6% [22.2%, 25.1%]) / B3=622 (18.8% [17.5%, 20.2%]) / B4=420 (12.7% [11.6%, 13.9%]) / B5=152 (4.6% [3.9%, 5.4%]) / B6=73 (2.2% [1.8%, 2.8%]) / B7=79 (2.4% [1.9%, 3.0%]) / B8=79 (2.4% [1.9%, 3.0%]) / B9=70 (2.1% [1.7%, 2.7%]) / B10=28 (0.8% [0.6%, 1.2%]) / B11=23 (0.7% [0.5%, 1.0%]) / B12=26 (0.8% [0.5%, 1.1%]) / B13=23 (0.7% [0.5%, 1.0%]) / B14=10 (0.3% [0.2%, 0.6%]) / B15=13 (0.4% [0.2%, 0.7%])。
  - 階層別解除率 current: B1=82.7% [79.4%, 85.6%] (attempt=579) / B2=80.6% [76.9%, 83.8%] (attempt=504) / B3=81.9% [78.0%, 85.2%] (attempt=437) / B4=82.7% [78.2%, 86.4%] (attempt=323) / B5=86.8% [80.0%, 91.5%] (attempt=136) / B6=81.6% [68.6%, 90.0%] (attempt=49) / B7=92.5% [80.1%, 97.4%] (attempt=40) / B8=95.2% [84.2%, 98.7%] (attempt=42) / B9=94.7% [82.7%, 98.5%] (attempt=38) / B10=83.3% [60.8%, 94.2%; N<30 未確定] (attempt=18) / B11=100.0% [51.0%, 100.0%; N<30 未確定] (attempt=4)。
  - 階層別解除率 ceiling: B1=82.7% [79.4%, 85.6%] (attempt=579) / B2=80.6% [76.9%, 83.8%] (attempt=504) / B3=81.9% [78.0%, 85.2%] (attempt=437) / B4=82.7% [78.2%, 86.4%] (attempt=323) / B5=97.0% [92.6%, 98.8%] (attempt=135) / B6=100.0% [92.9%, 100.0%] (attempt=50) / B7=100.0% [93.5%, 100.0%] (attempt=55) / B8=100.0% [94.1%, 100.0%] (attempt=61) / B9=92.0% [81.2%, 96.8%] (attempt=50) / B10=100.0% [86.2%, 100.0%; N<30 未確定] (attempt=24) / B11=100.0% [84.5%, 100.0%; N<30 未確定] (attempt=21) / B12=100.0% [84.5%, 100.0%; N<30 未確定] (attempt=21) / B13=100.0% [83.2%, 100.0%; N<30 未確定] (attempt=19) / B14=100.0% [67.6%, 100.0%; N<30 未確定] (attempt=8) / B15=100.0% [74.1%, 100.0%; N<30 未確定] (attempt=11)。
  - 分岐集計 current: B1=kit0/direct579/force30 / B2=kit15/direct489/force65 / B3=kit12/direct425/force55 / B4=kit13/direct310/force35 / B5=kit1/direct135/force7 / B6=kit4/direct45/force1 / B7=kit3/direct37/force0 / B8=kit2/direct40/force0 / B9=kit2/direct36/force0 / B10=kit1/direct17/force1 / B11=kit0/direct4/force0。
  - 分岐集計 ceiling: B1=kit0/direct579/force30 / B2=kit15/direct489/force65 / B3=kit12/direct425/force55 / B4=kit13/direct310/force35 / B5=kit0/direct135/force5 / B6=kit0/direct50/force0 / B7=kit0/direct55/force0 / B8=kit0/direct61/force0 / B9=kit2/direct48/force1 / B10=kit0/direct24/force0 / B11=kit0/direct21/force0 / B12=kit0/direct21/force0 / B13=kit0/direct19/force0 / B14=kit0/direct8/force0 / B15=kit0/direct11/force0。
  - 選別効果判定: 実測Δ=+2.21pt / current階層率固定・ceiling試行構成再重み付け=-1.78pt〜+0.79pt / 残差=+1.42pt〜+3.99pt / 構成比で説明不能（上下限）。
- workshop-core-pools / never / Priest:
  - 開封 floor 構成 current: B1=832 (28.7% [27.1%, 30.4%]) / B2=530 (18.3% [16.9%, 19.7%]) / B3=381 (13.1% [12.0%, 14.4%]) / B4=279 (9.6% [8.6%, 10.7%]) / B5=213 (7.3% [6.5%, 8.4%]) / B6=172 (5.9% [5.1%, 6.9%]) / B7=150 (5.2% [4.4%, 6.0%]) / B8=98 (3.4% [2.8%, 4.1%]) / B9=80 (2.8% [2.2%, 3.4%]) / B10=63 (2.2% [1.7%, 2.8%]) / B11=41 (1.4% [1.0%, 1.9%]) / B12=31 (1.1% [0.8%, 1.5%]) / B13=18 (0.6% [0.4%, 1.0%]) / B14=10 (0.3% [0.2%, 0.6%]) / B15=2 (0.1% [0.0%, 0.3%])。
  - 開封 floor 構成 ceiling: B1=832 (28.9% [27.3%, 30.6%]) / B2=530 (18.4% [17.1%, 19.9%]) / B3=381 (13.3% [12.1%, 14.5%]) / B4=279 (9.7% [8.7%, 10.8%]) / B5=186 (6.5% [5.6%, 7.4%]) / B6=139 (4.8% [4.1%, 5.7%]) / B7=131 (4.6% [3.9%, 5.4%]) / B8=108 (3.8% [3.1%, 4.5%]) / B9=87 (3.0% [2.5%, 3.7%]) / B10=80 (2.8% [2.2%, 3.5%]) / B11=58 (2.0% [1.6%, 2.6%]) / B12=26 (0.9% [0.6%, 1.3%]) / B13=15 (0.5% [0.3%, 0.9%]) / B14=5 (0.2% [0.1%, 0.4%]) / B15=5 (0.2% [0.1%, 0.4%]) / B16=7 (0.2% [0.1%, 0.5%]) / B17=5 (0.2% [0.1%, 0.4%])。
  - 階層別解除率 current: B1=23.5% [17.5%, 30.8%] (attempt=153) / B2=28.7% [21.6%, 37.0%] (attempt=129) / B3=24.1% [17.3%, 32.7%] (attempt=116) / B4=23.1% [15.6%, 32.7%] (attempt=91) / B5=30.9% [22.6%, 40.7%] (attempt=97) / B6=29.0% [19.6%, 40.6%] (attempt=69) / B7=27.7% [18.3%, 39.6%] (attempt=65) / B8=30.6% [19.5%, 44.5%] (attempt=49) / B9=29.0% [16.1%, 46.6%] (attempt=31) / B10=56.5% [36.8%, 74.4%; N<30 未確定] (attempt=23) / B11=47.4% [27.3%, 68.3%; N<30 未確定] (attempt=19) / B12=33.3% [15.2%, 58.3%; N<30 未確定] (attempt=15) / B13=20.0% [3.6%, 62.4%; N<30 未確定] (attempt=5) / B14=20.0% [3.6%, 62.4%; N<30 未確定] (attempt=5) / B15=0.0% [0.0%, 65.8%; N<30 未確定] (attempt=2)。
  - 階層別解除率 ceiling: B1=23.5% [17.5%, 30.8%] (attempt=153) / B2=28.7% [21.6%, 37.0%] (attempt=129) / B3=24.1% [17.3%, 32.7%] (attempt=116) / B4=23.1% [15.6%, 32.7%] (attempt=91) / B5=49.4% [38.8%, 60.0%] (attempt=81) / B6=43.3% [31.6%, 55.9%] (attempt=60) / B7=56.5% [44.1%, 68.1%] (attempt=62) / B8=49.1% [36.1%, 62.1%] (attempt=53) / B9=50.0% [34.8%, 65.2%] (attempt=38) / B10=51.7% [34.4%, 68.6%; N<30 未確定] (attempt=29) / B11=57.9% [36.3%, 76.9%; N<30 未確定] (attempt=19) / B12=50.0% [23.7%, 76.3%; N<30 未確定] (attempt=10) / B13=33.3% [6.1%, 79.2%; N<30 未確定] (attempt=3) / B14=0.0% [0.0%, 79.3%; N<30 未確定] (attempt=1) / B15=66.7% [20.8%, 93.9%; N<30 未確定] (attempt=3) / B16=83.3% [43.6%, 97.0%; N<30 未確定] (attempt=6) / B17=100.0% [43.9%, 100.0%; N<30 未確定] (attempt=3)。
  - 分岐集計 current: B1=kit0/direct153/force406 / B2=kit9/direct120/force257 / B3=kit5/direct111/force195 / B4=kit6/direct85/force148 / B5=kit8/direct89/force98 / B6=kit8/direct61/force67 / B7=kit7/direct58/force52 / B8=kit5/direct44/force33 / B9=kit2/direct29/force28 / B10=kit5/direct18/force21 / B11=kit3/direct16/force15 / B12=kit2/direct13/force12 / B13=kit0/direct5/force8 / B14=kit0/direct5/force4 / B15=kit0/direct2/force0。
  - 分岐集計 ceiling: B1=kit0/direct153/force406 / B2=kit9/direct120/force257 / B3=kit5/direct111/force195 / B4=kit6/direct85/force148 / B5=kit4/direct77/force88 / B6=kit5/direct55/force47 / B7=kit11/direct51/force40 / B8=kit2/direct51/force36 / B9=kit4/direct34/force34 / B10=kit5/direct24/force29 / B11=kit0/direct19/force31 / B12=kit1/direct9/force12 / B13=kit1/direct2/force10 / B14=kit0/direct1/force2 / B15=kit1/direct2/force1 / B16=kit0/direct6/force0 / B17=kit2/direct1/force2。
  - 選別効果判定: 実測Δ=+8.21pt / current階層率固定・ceiling試行構成再重み付け=-0.15pt〜+0.90pt / 残差=+7.31pt〜+8.36pt / 構成比で説明不能（上下限）。
- workshop-core-pools / never / Mage:
  - 開封 floor 構成 current: B1=934 (43.2% [41.1%, 45.3%]) / B2=690 (31.9% [30.0%, 33.9%]) / B3=404 (18.7% [17.1%, 20.4%]) / B4=130 (6.0% [5.1%, 7.1%]) / B5=6 (0.3% [0.1%, 0.6%])。
  - 開封 floor 構成 ceiling: B1=934 (43.2% [41.1%, 45.3%]) / B2=690 (31.9% [30.0%, 33.9%]) / B3=404 (18.7% [17.1%, 20.4%]) / B4=130 (6.0% [5.1%, 7.1%]) / B5=4 (0.2% [0.1%, 0.5%])。
  - 階層別解除率 current: B1=18.8% [13.8%, 25.1%] (attempt=181) / B2=30.5% [24.4%, 37.4%] (attempt=190) / B3=30.6% [23.4%, 38.8%] (attempt=134) / B4=31.8% [20.0%, 46.6%] (attempt=44) / B5=100.0% [20.7%, 100.0%; N<30 未確定] (attempt=1)。
  - 階層別解除率 ceiling: B1=18.8% [13.8%, 25.1%] (attempt=181) / B2=30.5% [24.4%, 37.4%] (attempt=190) / B3=30.6% [23.4%, 38.8%] (attempt=134) / B4=31.8% [20.0%, 46.6%] (attempt=44) / B5=100.0% [43.9%, 100.0%; N<30 未確定] (attempt=3)。
  - 分岐集計 current: B1=kit0/direct181/force423 / B2=kit8/direct182/force322 / B3=kit3/direct131/force195 / B4=kit4/direct40/force72 / B5=kit0/direct1/force5。
  - 分岐集計 ceiling: B1=kit0/direct181/force423 / B2=kit8/direct182/force322 / B3=kit3/direct131/force195 / B4=kit4/direct40/force72 / B5=kit0/direct3/force1。
  - 選別効果判定: 実測Δ=+0.26pt / current階層率固定・ceiling試行構成再重み付け=+0.26pt / 残差=+0.00pt / 構成比で説明可能。
- workshop-complete / smart / Fighter:
  - 開封 floor 構成 current: B1=930 (39.7% [37.7%, 41.7%]) / B2=737 (31.4% [29.6%, 33.3%]) / B3=457 (19.5% [17.9%, 21.1%]) / B4=166 (7.1% [6.1%, 8.2%]) / B5=32 (1.4% [1.0%, 1.9%]) / B6=7 (0.3% [0.1%, 0.6%]) / B7=5 (0.2% [0.1%, 0.5%]) / B8=6 (0.3% [0.1%, 0.6%]) / B9=5 (0.2% [0.1%, 0.5%])。
  - 開封 floor 構成 ceiling: B1=930 (40.1% [38.1%, 42.1%]) / B2=737 (31.8% [29.9%, 33.7%]) / B3=457 (19.7% [18.1%, 21.4%]) / B4=166 (7.2% [6.2%, 8.3%]) / B5=28 (1.2% [0.8%, 1.7%])。
  - 階層別解除率 current: B1=23.8% [18.1%, 30.5%] (attempt=181) / B2=26.1% [20.8%, 32.4%] (attempt=218) / B3=30.6% [23.7%, 38.5%] (attempt=147) / B4=30.2% [19.5%, 43.5%] (attempt=53) / B5=25.0% [8.9%, 53.2%; N<30 未確定] (attempt=12) / B6=0.0% [0.0%, 79.3%; N<30 未確定] (attempt=1) / B7=0.0% [0.0%, 56.1%; N<30 未確定] (attempt=3) / B8=33.3% [6.1%, 79.2%; N<30 未確定] (attempt=3) / B9=66.7% [20.8%, 93.9%; N<30 未確定] (attempt=3)。
  - 階層別解除率 ceiling: B1=23.8% [18.1%, 30.5%] (attempt=181) / B2=26.1% [20.8%, 32.4%] (attempt=218) / B3=30.6% [23.7%, 38.5%] (attempt=147) / B4=30.2% [19.5%, 43.5%] (attempt=53) / B5=30.8% [12.7%, 57.6%; N<30 未確定] (attempt=13)。
  - 分岐集計 current: B1=kit0/direct181/force424 / B2=kit11/direct207/force311 / B3=kit13/direct134/force225 / B4=kit3/direct50/force92 / B5=kit0/direct12/force20 / B6=kit0/direct1/force2 / B7=kit0/direct3/force2 / B8=kit0/direct3/force1 / B9=kit1/direct2/force0。
  - 分岐集計 ceiling: B1=kit0/direct181/force424 / B2=kit11/direct207/force311 / B3=kit13/direct134/force225 / B4=kit3/direct50/force92 / B5=kit0/direct13/force14。
  - 選別効果判定: 実測Δ=+0.07pt / current階層率固定・ceiling試行構成再重み付け=-0.05pt / 残差=+0.12pt / 構成比で説明不能（上下限）。
- workshop-complete / smart / Thief:
  - 開封 floor 構成 current: B1=929 (30.1% [28.5%, 31.8%]) / B2=760 (24.6% [23.1%, 26.2%]) / B3=609 (19.7% [18.4%, 21.2%]) / B4=488 (15.8% [14.6%, 17.1%]) / B5=181 (5.9% [5.1%, 6.8%]) / B6=43 (1.4% [1.0%, 1.9%]) / B7=41 (1.3% [1.0%, 1.8%]) / B8=26 (0.8% [0.6%, 1.2%]) / B9=8 (0.3% [0.1%, 0.5%])。
  - 開封 floor 構成 ceiling: B1=929 (29.3% [27.7%, 30.9%]) / B2=760 (23.9% [22.5%, 25.5%]) / B3=609 (19.2% [17.8%, 20.6%]) / B4=488 (15.4% [14.2%, 16.7%]) / B5=188 (5.9% [5.2%, 6.8%]) / B6=63 (2.0% [1.6%, 2.5%]) / B7=54 (1.7% [1.3%, 2.2%]) / B8=42 (1.3% [1.0%, 1.8%]) / B9=26 (0.8% [0.6%, 1.2%]) / B10=16 (0.5% [0.3%, 0.8%])。
  - 階層別解除率 current: B1=85.1% [81.9%, 87.8%] (attempt=564) / B2=82.8% [79.3%, 85.9%] (attempt=495) / B3=84.5% [81.0%, 87.5%] (attempt=466) / B4=85.9% [82.1%, 89.0%] (attempt=397) / B5=84.7% [78.3%, 89.4%] (attempt=163) / B6=83.9% [67.4%, 92.9%] (attempt=31) / B7=90.6% [75.8%, 96.8%] (attempt=32) / B8=86.4% [66.7%, 95.3%; N<30 未確定] (attempt=22) / B9=75.0% [30.1%, 95.4%; N<30 未確定] (attempt=4)。
  - 階層別解除率 ceiling: B1=85.1% [81.9%, 87.8%] (attempt=564) / B2=82.8% [79.3%, 85.9%] (attempt=495) / B3=84.5% [81.0%, 87.5%] (attempt=466) / B4=85.9% [82.1%, 89.0%] (attempt=397) / B5=93.5% [88.8%, 96.3%] (attempt=170) / B6=95.5% [84.9%, 98.7%] (attempt=44) / B7=100.0% [92.4%, 100.0%] (attempt=47) / B8=100.0% [90.4%, 100.0%] (attempt=36) / B9=100.0% [85.1%, 100.0%; N<30 未確定] (attempt=22) / B10=100.0% [77.2%, 100.0%; N<30 未確定] (attempt=13)。
  - 分岐集計 current: B1=kit0/direct564/force41 / B2=kit17/direct478/force36 / B3=kit14/direct452/force30 / B4=kit14/direct383/force17 / B5=kit8/direct155/force4 / B6=kit2/direct29/force2 / B7=kit1/direct31/force1 / B8=kit0/direct22/force3 / B9=kit0/direct4/force0。
  - 分岐集計 ceiling: B1=kit0/direct564/force41 / B2=kit17/direct478/force36 / B3=kit14/direct452/force30 / B4=kit14/direct383/force17 / B5=kit3/direct167/force0 / B6=kit0/direct44/force2 / B7=kit0/direct47/force0 / B8=kit0/direct36/force0 / B9=kit0/direct22/force0 / B10=kit0/direct13/force0。
  - 選別効果判定: 実測Δ=+1.61pt / current階層率固定・ceiling試行構成再重み付け=-0.52pt〜+0.06pt / 残差=+1.55pt〜+2.13pt / 構成比で説明不能（上下限）。
- workshop-complete / smart / Priest:
  - 開封 floor 構成 current: B1=843 (24.3% [22.9%, 25.7%]) / B2=588 (16.9% [15.7%, 18.2%]) / B3=472 (13.6% [12.5%, 14.8%]) / B4=395 (11.4% [10.4%, 12.5%]) / B5=280 (8.1% [7.2%, 9.0%]) / B6=205 (5.9% [5.2%, 6.7%]) / B7=187 (5.4% [4.7%, 6.2%]) / B8=168 (4.8% [4.2%, 5.6%]) / B9=149 (4.3% [3.7%, 5.0%]) / B10=75 (2.2% [1.7%, 2.7%]) / B11=50 (1.4% [1.1%, 1.9%]) / B12=31 (0.9% [0.6%, 1.3%]) / B13=19 (0.5% [0.4%, 0.9%]) / B14=7 (0.2% [0.1%, 0.4%]) / B15=1 (0.0% [0.0%, 0.2%])。
  - 開封 floor 構成 ceiling: B1=843 (25.3% [23.8%, 26.8%]) / B2=588 (17.6% [16.4%, 19.0%]) / B3=472 (14.2% [13.0%, 15.4%]) / B4=395 (11.8% [10.8%, 13.0%]) / B5=262 (7.9% [7.0%, 8.8%]) / B6=176 (5.3% [4.6%, 6.1%]) / B7=175 (5.2% [4.5%, 6.1%]) / B8=139 (4.2% [3.5%, 4.9%]) / B9=110 (3.3% [2.7%, 4.0%]) / B10=87 (2.6% [2.1%, 3.2%]) / B11=60 (1.8% [1.4%, 2.3%]) / B12=25 (0.7% [0.5%, 1.1%]) / B13=2 (0.1% [0.0%, 0.2%])。
  - 階層別解除率 current: B1=24.9% [18.9%, 31.9%] (attempt=169) / B2=26.5% [19.3%, 35.1%] (attempt=117) / B3=23.2% [17.1%, 30.8%] (attempt=142) / B4=40.0% [32.1%, 48.4%] (attempt=135) / B5=30.5% [23.2%, 38.9%] (attempt=128) / B6=26.7% [18.6%, 36.6%] (attempt=90) / B7=33.3% [23.9%, 44.4%] (attempt=78) / B8=29.7% [19.9%, 41.8%] (attempt=64) / B9=31.3% [21.5%, 43.2%] (attempt=67) / B10=28.9% [17.0%, 44.8%] (attempt=38) / B11=39.3% [23.6%, 57.6%; N<30 未確定] (attempt=28) / B12=20.0% [7.0%, 45.2%; N<30 未確定] (attempt=15) / B13=55.6% [26.7%, 81.1%; N<30 未確定] (attempt=9) / B14=50.0% [9.5%, 90.5%; N<30 未確定] (attempt=2)。
  - 階層別解除率 ceiling: B1=24.9% [18.9%, 31.9%] (attempt=169) / B2=26.5% [19.3%, 35.1%] (attempt=117) / B3=23.2% [17.1%, 30.8%] (attempt=142) / B4=40.0% [32.1%, 48.4%] (attempt=135) / B5=46.4% [37.5%, 55.6%] (attempt=112) / B6=46.3% [34.9%, 58.1%] (attempt=67) / B7=55.4% [44.1%, 66.2%] (attempt=74) / B8=43.9% [31.8%, 56.7%] (attempt=57) / B9=37.0% [25.4%, 50.4%] (attempt=54) / B10=61.1% [44.9%, 75.2%] (attempt=36) / B11=57.7% [38.9%, 74.5%; N<30 未確定] (attempt=26) / B12=72.7% [43.4%, 90.3%; N<30 未確定] (attempt=11)。
  - 分岐集計 current: B1=kit0/direct169/force384 / B2=kit5/direct112/force294 / B3=kit7/direct135/force238 / B4=kit19/direct116/force208 / B5=kit13/direct115/force127 / B6=kit4/direct86/force75 / B7=kit7/direct71/force76 / B8=kit4/direct60/force61 / B9=kit6/direct61/force58 / B10=kit1/direct37/force20 / B11=kit2/direct26/force15 / B12=kit0/direct15/force12 / B13=kit1/direct8/force7 / B14=kit0/direct2/force5 / B15=kit0/direct0/force1。
  - 分岐集計 ceiling: B1=kit0/direct169/force384 / B2=kit5/direct112/force294 / B3=kit7/direct135/force238 / B4=kit19/direct116/force208 / B5=kit10/direct102/force122 / B6=kit4/direct63/force68 / B7=kit7/direct67/force70 / B8=kit7/direct50/force57 / B9=kit5/direct49/force32 / B10=kit6/direct30/force28 / B11=kit1/direct25/force22 / B12=kit1/direct10/force8 / B13=kit0/direct0/force2。
  - 選別効果判定: 実測Δ=+7.83pt / current階層率固定・ceiling試行構成再重み付け=-0.24pt / 残差=+8.07pt / 構成比で説明不能（上下限）。
- workshop-complete / smart / Mage:
  - 開封 floor 構成 current: B1=921 (41.0% [39.0%, 43.1%]) / B2=749 (33.4% [31.4%, 35.3%]) / B3=454 (20.2% [18.6%, 21.9%]) / B4=106 (4.7% [3.9%, 5.7%]) / B5=15 (0.7% [0.4%, 1.1%])。
  - 開封 floor 構成 ceiling: B1=921 (41.1% [39.1%, 43.1%]) / B2=749 (33.4% [31.5%, 35.4%]) / B3=454 (20.2% [18.6%, 22.0%]) / B4=106 (4.7% [3.9%, 5.7%]) / B5=12 (0.5% [0.3%, 0.9%])。
  - 階層別解除率 current: B1=28.1% [22.1%, 35.0%] (attempt=185) / B2=22.7% [17.4%, 29.1%] (attempt=194) / B3=26.3% [19.6%, 34.4%] (attempt=133) / B4=36.4% [22.2%, 53.4%] (attempt=33) / B5=0.0% [0.0%, 39.0%; N<30 未確定] (attempt=6)。
  - 階層別解除率 ceiling: B1=28.1% [22.1%, 35.0%] (attempt=185) / B2=22.7% [17.4%, 29.1%] (attempt=194) / B3=26.3% [19.6%, 34.4%] (attempt=133) / B4=36.4% [22.2%, 53.4%] (attempt=33) / B5=60.0% [23.1%, 88.2%; N<30 未確定] (attempt=5)。
  - 分岐集計 current: B1=kit0/direct185/force421 / B2=kit8/direct186/force337 / B3=kit7/direct126/force237 / B4=kit6/direct27/force63 / B5=kit0/direct6/force8。
  - 分岐集計 ceiling: B1=kit0/direct185/force421 / B2=kit8/direct186/force337 / B3=kit7/direct126/force237 / B4=kit6/direct27/force63 / B5=kit0/direct5/force5。
  - 選別効果判定: 実測Δ=+0.59pt / current階層率固定・ceiling試行構成再重み付け=+0.05pt / 残差=+0.55pt / 構成比で説明不能（上下限）。
- workshop-complete / never / Fighter:
  - 開封 floor 構成 current: B1=923 (39.0% [37.0%, 41.0%]) / B2=769 (32.5% [30.6%, 34.4%]) / B3=480 (20.3% [18.7%, 21.9%]) / B4=177 (7.5% [6.5%, 8.6%]) / B5=19 (0.8% [0.5%, 1.2%])。
  - 開封 floor 構成 ceiling: B1=923 (39.0% [37.0%, 40.9%]) / B2=769 (32.5% [30.6%, 34.4%]) / B3=480 (20.3% [18.7%, 21.9%]) / B4=177 (7.5% [6.5%, 8.6%]) / B5=20 (0.8% [0.5%, 1.3%])。
  - 階層別解除率 current: B1=26.5% [20.4%, 33.6%] (attempt=170) / B2=20.7% [15.9%, 26.6%] (attempt=217) / B3=33.1% [26.5%, 40.5%] (attempt=169) / B4=40.0% [27.6%, 53.8%] (attempt=50) / B5=18.2% [5.1%, 47.7%; N<30 未確定] (attempt=11)。
  - 階層別解除率 ceiling: B1=26.5% [20.4%, 33.6%] (attempt=170) / B2=20.7% [15.9%, 26.6%] (attempt=217) / B3=33.1% [26.5%, 40.5%] (attempt=169) / B4=40.0% [27.6%, 53.8%] (attempt=50) / B5=22.2% [6.3%, 54.7%; N<30 未確定] (attempt=9)。
  - 分岐集計 current: B1=kit0/direct170/force443 / B2=kit10/direct207/force316 / B3=kit11/direct158/force214 / B4=kit4/direct46/force99 / B5=kit1/direct10/force7。
  - 分岐集計 ceiling: B1=kit0/direct170/force443 / B2=kit10/direct207/force316 / B3=kit11/direct158/force214 / B4=kit4/direct46/force99 / B5=kit1/direct8/force9。
  - 選別効果判定: 実測Δ=+0.09pt / current階層率固定・ceiling試行構成再重み付け=+0.03pt / 残差=+0.06pt / 構成比で説明不能（上下限）。
- workshop-complete / never / Thief:
  - 開封 floor 構成 current: B1=923 (29.1% [27.6%, 30.7%]) / B2=782 (24.7% [23.2%, 26.2%]) / B3=648 (20.5% [19.1%, 21.9%]) / B4=464 (14.6% [13.5%, 15.9%]) / B5=169 (5.3% [4.6%, 6.2%]) / B6=75 (2.4% [1.9%, 3.0%]) / B7=52 (1.6% [1.3%, 2.1%]) / B8=28 (0.9% [0.6%, 1.3%]) / B9=16 (0.5% [0.3%, 0.8%]) / B10=7 (0.2% [0.1%, 0.5%]) / B11=4 (0.1% [0.0%, 0.3%])。
  - 開封 floor 構成 ceiling: B1=923 (27.9% [26.4%, 29.5%]) / B2=782 (23.6% [22.2%, 25.1%]) / B3=648 (19.6% [18.3%, 21.0%]) / B4=464 (14.0% [12.9%, 15.3%]) / B5=173 (5.2% [4.5%, 6.0%]) / B6=80 (2.4% [1.9%, 3.0%]) / B7=72 (2.2% [1.7%, 2.7%]) / B8=56 (1.7% [1.3%, 2.2%]) / B9=50 (1.5% [1.1%, 2.0%]) / B10=33 (1.0% [0.7%, 1.4%]) / B11=13 (0.4% [0.2%, 0.7%]) / B12=7 (0.2% [0.1%, 0.4%]) / B13=6 (0.2% [0.1%, 0.4%]) / B14=1 (0.0% [0.0%, 0.2%])。
  - 階層別解除率 current: B1=82.1% [78.7%, 85.0%] (attempt=574) / B2=83.5% [80.0%, 86.4%] (attempt=520) / B3=86.8% [83.5%, 89.5%] (attempt=485) / B4=86.4% [82.6%, 89.4%] (attempt=396) / B5=87.3% [80.9%, 91.8%] (attempt=142) / B6=86.7% [73.8%, 93.7%] (attempt=45) / B7=87.2% [73.3%, 94.4%] (attempt=39) / B8=89.5% [68.6%, 97.1%; N<30 未確定] (attempt=19) / B9=81.8% [52.3%, 94.9%; N<30 未確定] (attempt=11) / B10=40.0% [11.8%, 76.9%; N<30 未確定] (attempt=5) / B11=66.7% [20.8%, 93.9%; N<30 未確定] (attempt=3)。
  - 階層別解除率 ceiling: B1=82.1% [78.7%, 85.0%] (attempt=574) / B2=83.5% [80.0%, 86.4%] (attempt=520) / B3=86.8% [83.5%, 89.5%] (attempt=485) / B4=86.4% [82.6%, 89.4%] (attempt=396) / B5=93.6% [88.6%, 96.5%] (attempt=156) / B6=93.2% [83.8%, 97.3%] (attempt=59) / B7=91.5% [81.6%, 96.3%] (attempt=59) / B8=90.5% [77.9%, 96.2%] (attempt=42) / B9=100.0% [91.8%, 100.0%] (attempt=43) / B10=100.0% [88.3%, 100.0%; N<30 未確定] (attempt=29) / B11=100.0% [75.8%, 100.0%; N<30 未確定] (attempt=12) / B12=100.0% [61.0%, 100.0%; N<30 未確定] (attempt=6) / B13=100.0% [51.0%, 100.0%; N<30 未確定] (attempt=4) / B14=100.0% [20.7%, 100.0%; N<30 未確定] (attempt=1)。
  - 分岐集計 current: B1=kit0/direct574/force29 / B2=kit12/direct508/force46 / B3=kit13/direct472/force28 / B4=kit14/direct382/force21 / B5=kit3/direct139/force9 / B6=kit4/direct41/force9 / B7=kit1/direct38/force4 / B8=kit1/direct18/force0 / B9=kit1/direct10/force0 / B10=kit0/direct5/force0 / B11=kit0/direct3/force0。
  - 分岐集計 ceiling: B1=kit0/direct574/force29 / B2=kit12/direct508/force46 / B3=kit13/direct472/force28 / B4=kit14/direct382/force21 / B5=kit0/direct156/force0 / B6=kit2/direct57/force1 / B7=kit1/direct58/force4 / B8=kit0/direct42/force1 / B9=kit0/direct43/force1 / B10=kit0/direct29/force0 / B11=kit0/direct12/force0 / B12=kit0/direct6/force0 / B13=kit0/direct4/force0 / B14=kit0/direct1/force0。
  - 選別効果判定: 実測Δ=+1.53pt / current階層率固定・ceiling試行構成再重み付け=-0.85pt〜-0.39pt / 残差=+1.92pt〜+2.38pt / 構成比で説明不能（上下限）。
- workshop-complete / never / Priest:
  - 開封 floor 構成 current: B1=822 (22.6% [21.3%, 24.0%]) / B2=635 (17.5% [16.3%, 18.8%]) / B3=470 (12.9% [11.9%, 14.1%]) / B4=425 (11.7% [10.7%, 12.8%]) / B5=315 (8.7% [7.8%, 9.6%]) / B6=240 (6.6% [5.8%, 7.5%]) / B7=215 (5.9% [5.2%, 6.7%]) / B8=176 (4.8% [4.2%, 5.6%]) / B9=115 (3.2% [2.6%, 3.8%]) / B10=70 (1.9% [1.5%, 2.4%]) / B11=55 (1.5% [1.2%, 2.0%]) / B12=27 (0.7% [0.5%, 1.1%]) / B13=32 (0.9% [0.6%, 1.2%]) / B14=22 (0.6% [0.4%, 0.9%]) / B15=10 (0.3% [0.1%, 0.5%]) / B16=1 (0.0% [0.0%, 0.2%])。
  - 開封 floor 構成 ceiling: B1=822 (23.9% [22.5%, 25.4%]) / B2=635 (18.5% [17.2%, 19.8%]) / B3=470 (13.7% [12.6%, 14.9%]) / B4=425 (12.4% [11.3%, 13.5%]) / B5=299 (8.7% [7.8%, 9.7%]) / B6=180 (5.2% [4.5%, 6.0%]) / B7=151 (4.4% [3.8%, 5.1%]) / B8=122 (3.6% [3.0%, 4.2%]) / B9=92 (2.7% [2.2%, 3.3%]) / B10=60 (1.7% [1.4%, 2.2%]) / B11=60 (1.7% [1.4%, 2.2%]) / B12=57 (1.7% [1.3%, 2.1%]) / B13=32 (0.9% [0.7%, 1.3%]) / B14=19 (0.6% [0.4%, 0.9%]) / B15=9 (0.3% [0.1%, 0.5%]) / B16=3 (0.1% [0.0%, 0.3%])。
  - 階層別解除率 current: B1=24.5% [18.2%, 32.1%] (attempt=143) / B2=27.1% [21.1%, 34.1%] (attempt=177) / B3=31.5% [24.4%, 39.5%] (attempt=143) / B4=35.4% [28.1%, 43.5%] (attempt=144) / B5=28.8% [22.3%, 36.4%] (attempt=156) / B6=33.9% [25.9%, 43.0%] (attempt=115) / B7=29.5% [21.6%, 38.8%] (attempt=105) / B8=31.6% [22.4%, 42.5%] (attempt=79) / B9=24.1% [14.6%, 36.9%] (attempt=54) / B10=20.6% [10.3%, 36.8%] (attempt=34) / B11=28.0% [14.3%, 47.6%; N<30 未確定] (attempt=25) / B12=20.0% [7.0%, 45.2%; N<30 未確定] (attempt=15) / B13=17.6% [6.2%, 41.0%; N<30 未確定] (attempt=17) / B14=50.0% [23.7%, 76.3%; N<30 未確定] (attempt=10) / B15=16.7% [3.0%, 56.4%; N<30 未確定] (attempt=6) / B16=100.0% [20.7%, 100.0%; N<30 未確定] (attempt=1)。
  - 階層別解除率 ceiling: B1=24.5% [18.2%, 32.1%] (attempt=143) / B2=27.1% [21.1%, 34.1%] (attempt=177) / B3=31.5% [24.4%, 39.5%] (attempt=143) / B4=35.4% [28.1%, 43.5%] (attempt=144) / B5=50.6% [43.1%, 58.1%] (attempt=168) / B6=61.3% [50.0%, 71.5%] (attempt=75) / B7=50.7% [39.2%, 62.2%] (attempt=69) / B8=66.7% [54.1%, 77.3%] (attempt=60) / B9=39.4% [24.7%, 56.3%] (attempt=33) / B10=54.5% [38.0%, 70.2%] (attempt=33) / B11=47.4% [27.3%, 68.3%; N<30 未確定] (attempt=19) / B12=39.3% [23.6%, 57.6%; N<30 未確定] (attempt=28) / B13=53.8% [29.1%, 76.8%; N<30 未確定] (attempt=13) / B14=25.0% [7.1%, 59.1%; N<30 未確定] (attempt=8) / B15=71.4% [35.9%, 91.8%; N<30 未確定] (attempt=7) / B16=100.0% [20.7%, 100.0%; N<30 未確定] (attempt=1)。
  - 分岐集計 current: B1=kit0/direct143/force372 / B2=kit9/direct168/force278 / B3=kit8/direct135/force220 / B4=kit18/direct126/force227 / B5=kit10/direct146/force132 / B6=kit16/direct99/force83 / B7=kit9/direct96/force80 / B8=kit5/direct74/force61 / B9=kit3/direct51/force38 / B10=kit2/direct32/force21 / B11=kit1/direct24/force18 / B12=kit2/direct13/force7 / B13=kit0/direct17/force9 / B14=kit1/direct9/force5 / B15=kit0/direct6/force4 / B16=kit0/direct1/force0。
  - 分岐集計 ceiling: B1=kit0/direct143/force372 / B2=kit9/direct168/force278 / B3=kit8/direct135/force220 / B4=kit18/direct126/force227 / B5=kit12/direct156/force104 / B6=kit13/direct62/force58 / B7=kit6/direct63/force49 / B8=kit11/direct49/force41 / B9=kit4/direct29/force34 / B10=kit6/direct27/force18 / B11=kit0/direct19/force25 / B12=kit2/direct26/force18 / B13=kit0/direct13/force10 / B14=kit0/direct8/force6 / B15=kit1/direct6/force1 / B16=kit0/direct1/force2。
  - 選別効果判定: 実測Δ=+10.90pt / current階層率固定・ceiling試行構成再重み付け=-0.22pt / 残差=+11.12pt / 構成比で説明不能（上下限）。
- workshop-complete / never / Mage:
  - 開封 floor 構成 current: B1=895 (38.5% [36.6%, 40.5%]) / B2=812 (35.0% [33.1%, 36.9%]) / B3=468 (20.2% [18.6%, 21.8%]) / B4=126 (5.4% [4.6%, 6.4%]) / B5=21 (0.9% [0.6%, 1.4%])。
  - 開封 floor 構成 ceiling: B1=895 (38.5% [36.6%, 40.5%]) / B2=812 (35.0% [33.1%, 36.9%]) / B3=468 (20.2% [18.6%, 21.8%]) / B4=126 (5.4% [4.6%, 6.4%]) / B5=21 (0.9% [0.6%, 1.4%])。
  - 階層別解除率 current: B1=19.1% [13.8%, 25.9%] (attempt=162) / B2=29.7% [23.8%, 36.3%] (attempt=202) / B3=31.1% [24.2%, 38.9%] (attempt=148) / B4=27.5% [16.1%, 42.8%] (attempt=40) / B5=60.0% [31.3%, 83.2%; N<30 未確定] (attempt=10)。
  - 階層別解除率 ceiling: B1=19.1% [13.8%, 25.9%] (attempt=162) / B2=29.7% [23.8%, 36.3%] (attempt=202) / B3=31.1% [24.2%, 38.9%] (attempt=148) / B4=27.5% [16.1%, 42.8%] (attempt=40) / B5=54.5% [28.0%, 78.7%; N<30 未確定] (attempt=11)。
  - 分岐集計 current: B1=kit0/direct162/force415 / B2=kit6/direct196/force377 / B3=kit6/direct142/force220 / B4=kit5/direct35/force72 / B5=kit2/direct8/force10。
  - 分岐集計 ceiling: B1=kit0/direct162/force415 / B2=kit6/direct196/force377 / B3=kit6/direct142/force220 / B4=kit5/direct35/force72 / B5=kit2/direct9/force7。
  - 選別効果判定: 実測Δ=-0.05pt / current階層率固定・ceiling試行構成再重み付け=+0.06pt / 残差=-0.11pt / 構成比で説明不能（上下限）。

## 宝箱副作用・職業別

- smart / 全職: 解除率 59.3% [57.9%, 60.7%]→64.2% [62.8%, 65.5%]、罠被害HP/run 42.26 [39.26, 45.26]→40.68 [37.79, 43.56]、素材/run 46.96 [43.87, 50.05]→47.63 [44.35, 50.92]、開封/run 22.95 [21.49, 24.40]→23.27 [21.72, 24.83]。
  - Fighter: 解除率 29.1% [25.3%, 33.1%]→29.8% [26.0%, 33.9%]、罠被害 43.72 [39.64, 47.80]→43.22 [39.34, 47.09]、素材 35.82 [33.16, 38.49]→35.49 [32.98, 38.00]。
  - Thief: 解除率 84.6% [83.1%, 85.9%]→87.4% [86.2%, 88.6%]、罠被害 22.28 [19.79, 24.77]→19.77 [17.63, 21.90]、素材 61.98 [55.36, 68.61]→65.71 [57.86, 73.57]。
  - Priest: 解除率 28.2% [25.5%, 31.0%]→36.3% [33.3%, 39.4%]、罠被害 59.77 [50.25, 69.29]→56.63 [47.50, 65.77]、素材 52.66 [43.75, 61.58]→51.94 [43.08, 60.81]。
  - Mage: 解除率 23.9% [20.6%, 27.5%]→24.3% [21.0%, 28.0%]、罠被害 43.27 [40.20, 46.35]→43.10 [40.04, 46.15]、素材 37.35 [34.43, 40.27]→37.38 [34.45, 40.31]。
- never / 全職: 解除率 57.0% [55.5%, 58.6%]→60.8% [59.3%, 62.3%]、罠被害HP/run 38.33 [35.49, 41.17]→37.40 [34.76, 40.04]、素材/run 41.83 [39.05, 44.61]→42.58 [39.56, 45.61]、開封/run 20.55 [19.22, 21.87]→20.89 [19.44, 22.33]。
  - Fighter: 解除率 29.3% [25.6%, 33.4%]→30.1% [26.4%, 34.2%]、罠被害 38.54 [35.26, 41.83]→38.76 [35.39, 42.13]、素材 33.50 [30.75, 36.24]→34.30 [30.85, 37.76]。
  - Thief: 解除率 82.9% [81.3%, 84.5%]→85.2% [83.6%, 86.6%]、罠被害 19.94 [18.03, 21.85]→18.47 [16.57, 20.37]、素材 50.72 [45.03, 56.41]→53.22 [46.47, 59.98]。
  - Priest: 解除率 28.0% [25.1%, 31.0%]→36.2% [33.0%, 39.4%]、罠被害 54.08 [44.72, 63.44]→51.70 [43.34, 60.06]、素材 47.76 [39.40, 56.12]→47.48 [38.90, 56.06]。
  - Mage: 解除率 26.9% [23.4%, 30.8%]→27.2% [23.6%, 31.0%]、罠被害 40.78 [37.70, 43.85]→40.68 [37.61, 43.75]、素材 35.34 [32.55, 38.13]→35.33 [32.54, 38.11]。
- 盗賊はapt（base80/max90）、非apt職はbase40/max60の現行解除式を使用。Priestのcurrent→ceilingは smart: 28.2% [25.5%, 31.0%]→36.3% [33.3%, 39.4%] / never: 28.0% [25.1%, 31.0%]→36.2% [33.0%, 39.4%]。旧50%固定方針との差分は経路内訳（kit/direct/forced）とともに解釈し、大差が出る場合はbalanceより測定側を先に監査する。
- #461基準線では僧侶の到達floor=4.45で4職最深。ceilingでfloorがさらに伸び、深層の解除困難な宝箱を多く開けた選別なら整合する。今回の宝箱単位出力で、開封 floor 構成・階層別解除率・固定率再重み付けを比較した。全職 smart の開封/runは 22.95 [21.49, 24.40]→23.27 [21.72, 24.83]、僧侶は smart: 25.31 [21.10, 29.52]→24.81 [20.66, 28.95] / never: 23.20 [19.14, 27.26]→22.99 [18.81, 27.17]。
- 宝箱集計整合性監査: 全case pass（分子・分母・floor/path合計一致）。

## trapSense cap

- workshop-core-pools / smart: detection cap-hit 0.0% [0.0%, 0.1%]→0.0% [0.0%, 0.1%]（attempt=2831）。trapBonus ceilingで trapSense 値は変更せず、cap張り付きだけ実測。
- workshop-core-pools / never: detection cap-hit 0.0% [0.0%, 0.2%]→0.0% [0.0%, 0.2%]（attempt=2521）。trapBonus ceilingで trapSense 値は変更せず、cap張り付きだけ実測。
- workshop-complete / smart: detection cap-hit 0.0% [0.0%, 0.1%]→0.0% [0.0%, 0.1%]（attempt=2583）。trapBonus ceilingで trapSense 値は変更せず、cap張り付きだけ実測。
- workshop-complete / never: detection cap-hit 0.0% [0.0%, 0.1%]→0.0% [0.0%, 0.1%]（attempt=2674）。trapBonus ceilingで trapSense 値は変更せず、cap張り付きだけ実測。

## 多重比較

- acceptance family: 2 scenario × 2 cure × (A1 1 + A2 1 + A3 3) = 20 tests。α=.05期待偽陽性=1.0本。
- paired movement audit: 24 testsを別 family として明示。合算上限=44 tests、期待偽陽性=2.2本。単発CI非交差・符号不一致は採用しない。

## 実行監査

- node=v26.7.0 / platform=darwin / arch=arm64。availableParallelism=15、resolved parallelism=15。SIM_PARALLEL未指定、SIM_MAP_CACHE_ENTRIES未指定（runtime default）。
- calibration wall=6.149s / simulation wall=13.166s / total wall=19.316s / total CPU=204.571s。
- env SHA-256=36a65aca9f22cdce770c08454c58863b5f69398a5b8e124e1645aa39c4a15f76。
- model env SHA-256（SIM_RESULT_BASENAMEをPR #472の値へ正規化）=1401647f461e4f407a3107f6c2e2bdd4c6cd03e99c45f122a1ad1931c3c8df95。実測 artifact basenameだけはissue-473-priest-disarm。
- raw JSONL SHA-256=d2cfffb43ab5f5f118c90cd066e6bf5341005e779e1c878f06ae35a21a44621d。
- summary JSON SHA-256=69ba8c6bcc760792c6e2f69c2eb08ebca1759901f844ab62f44c08697b43813b。

## 完全な env

```text
SIM_SEED=271
SIM_RUNS=500
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
SIM_RESULT_BASENAME=issue-485-audit-468-473
SIM_PARALLEL=<omitted>
SIM_MAP_CACHE_ENTRIES=<omitted>
```

## 実行コマンド

SIM_SEED=271 SIM_RUNS=500 SIM_CALIBRATION_RUNS=100 SIM_SCENARIOS=workshop-core-pools,workshop-complete DEPARTURE_CRAFT_IDS=TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION IDENTIFICATION_POLICY=powder IDENTIFICATION_STARTING_POWDER=2 IDENTIFICATION_COST_OVERRIDE=1 FLEE_POLICY=threshold FLEE_HP_THRESHOLD=0.35 TRAP_POLICY=conservative TRAP_AVOIDANCE_POLICY=ev TRAP_DAMAGE_MULTIPLIER=1 STATUS_CURE_POLICY=smart STATUS_CURE_HP_THRESHOLD=0.35 STATUS_CURE_MERCHANT_POLICY=missing HEAL_POTION_MERCHANT_POLICY=missing PORTAL_HP_THRESHOLD=0.35 PORTAL_MAX_HEAL_POTIONS=0 PORTAL_MIN_FLOOR=3 ELITE_POLICY=avoid SIM_440_CONDITION=current SIM_EQUIPMENT_POLICY=individual-score SIM_EQUIPMENT_SLOT_MODE=standard SIM_EQUIPMENT_SLOT_AFFIX_MODE=retain SIM_MATCHING_DEFINITION=exact SIM_CURSE_LOCK_MODE=current SIM_SUPPORT_SUPPLY_CEILING=none SIM_CORE_SCORE_DROP_TOLERANCE=0 SIM_MAP_STATS=0 SIM_DAMAGE_PROBE=0 SIM_PRESET= SIM_DIAGNOSTICS=off SIM_RESULT_BASENAME=issue-485-audit-468-473 node scratch/sim_issue_468_exposure_ceiling.js（500 run/cell）。

## Review checklist

- 適用: .agents/balance-simulation.md。N設計、95% CI、class-centered、paired監査、無条件floor、複数比較、run易化、副作用を確認。
- 未適用: UI/mobile、QA/browser、game-design canon。UI変更・balance source変更がなく、canonは unaffected。
- 実施: node --check、import/export確認、N=1 smoke、scratch/test_sim_reward_paths.js、npm run lint、npm run test:unit。
- 未実施: npm run build、npm run test:browser（UI変更なし）。

Refs #473, #468
