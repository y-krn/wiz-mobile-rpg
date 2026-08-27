# Issue #468 第1段 — trapBonus露出天井

## 天井判定

**動かない。** 天井条件でも A1 / A2 acceptance criteria を全主状態・両 cure で満たさない。
露出は #271 の答えではない。第2段（保有率の掃引）は実施しない。
- ここでの「動かない」は #271 の受入基準に対する判定。floorが動かないという意味ではない。

## 測定条件

- PR #467 系の条件。#461 / PR #469 の固定基準線ではない。
- seed=271、基本4職、target depth=21。主状態=workshop-core-pools / workshop-complete、cure=smart / never。
- 現行値: 装備 10/15/20 / 装身具 10/15。biome側 gimmicks.trapBonus は変更・使用なし。
- ceiling: B5 entry直前の既生成装備へ trapBonus 20 を追加・既存値より低い場合は20へ引上げ。乱数消費なし。B5 entrant以外へ適用なし。
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
- #461基準線では僧侶の到達floor=4.45で4職最深。ceilingでfloorがさらに伸び、深層の解除困難な宝箱を多く開けた選別なら整合する。ただし今回の出力は宝箱単位のfloorを保存せず、階層別解除率 / 開封宝箱のfloor分布を算出できない。全職 smart の開封/runは 22.53 [22.40, 22.66]→22.67 [22.54, 22.80]、僧侶は smart: 27.47 [27.06, 27.88]→27.37 [26.96, 27.78] / never: 26.84 [26.44, 27.24]→26.90 [26.50, 27.31] で、仮説の裏づけ未確認。集計バグ可能性も残る。
- よって「非apt職の上限張り付きを含めても格差悪化なし」とは結論しない。僧侶の低下は未説明として記録。

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
- calibration wall=6.251s / simulation wall=1392.695s / total wall=1398.946s / total CPU=20715.376s。
- env SHA-256=29816ff097a684942b1ad24ae0bf9a71a41092ec283c9e8c1dd85f6e3248380f。
- raw JSONL SHA-256=5f7450f9a461be867a81f38a0a8fe897c9a69c74f0d74265f0f30b7c7ce2c82c。
- summary JSON SHA-256=407cf426c2b5b62b8f25d750319978963766c75abec5b3bd9c7a0e83765bc761。

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
SIM_RESULT_BASENAME=issue-468-exposure-ceiling
SIM_PARALLEL=<omitted>
SIM_MAP_CACHE_ENTRIES=<omitted>
```

## 実行コマンド

SIM_SEED=271 SIM_RUNS=50100 SIM_CALIBRATION_RUNS=100 SIM_SCENARIOS=workshop-core-pools,workshop-complete DEPARTURE_CRAFT_IDS=TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION IDENTIFICATION_POLICY=powder IDENTIFICATION_STARTING_POWDER=2 IDENTIFICATION_COST_OVERRIDE=1 FLEE_POLICY=threshold FLEE_HP_THRESHOLD=0.35 TRAP_POLICY=conservative TRAP_AVOIDANCE_POLICY=ev TRAP_DAMAGE_MULTIPLIER=1 STATUS_CURE_POLICY=smart STATUS_CURE_HP_THRESHOLD=0.35 STATUS_CURE_MERCHANT_POLICY=missing HEAL_POTION_MERCHANT_POLICY=missing PORTAL_HP_THRESHOLD=0.35 PORTAL_MAX_HEAL_POTIONS=0 PORTAL_MIN_FLOOR=3 ELITE_POLICY=avoid SIM_440_CONDITION=current SIM_EQUIPMENT_POLICY=individual-score SIM_EQUIPMENT_SLOT_MODE=standard SIM_EQUIPMENT_SLOT_AFFIX_MODE=retain SIM_MATCHING_DEFINITION=exact SIM_CURSE_LOCK_MODE=current SIM_SUPPORT_SUPPLY_CEILING=none SIM_CORE_SCORE_DROP_TOLERANCE=0 SIM_MAP_STATS=0 SIM_DAMAGE_PROBE=0 SIM_PRESET= SIM_DIAGNOSTICS=off SIM_RESULT_BASENAME=issue-468-exposure-ceiling node scratch/simulations/sim_issue_468_exposure_ceiling.js（50100 run/cell）。

## Review checklist

- 適用: .agents/balance-simulation.md。N設計、95% CI、class-centered、paired監査、無条件floor、複数比較、run易化、副作用を確認。
- 未適用: UI/mobile、QA/browser、game-design canon。UI変更・balance source変更がなく、canonは unaffected。
- 実施: node --check、import/export確認、N=1 smoke、scratch/tests/regression/test_sim_reward_paths.js、npm run lint、npm run test:unit（65 pass / 3 skip）。
- 未実施: npm run build、npm run test:browser（UI変更なし）。

Refs #468
