# Issue #468 第1段 — trapBonus露出天井

## 天井判定

**動かない。** 天井条件でも A1 / A2 acceptance criteria を全主状態・両 cure で満たさない。
露出は #271 の答えではない。第2段（保有率の掃引）は実施しない。

## 測定条件

- PR #467 系の条件。#461 / PR #469 の固定基準線ではない。
- seed=271、基本4職、target depth=21。主状態=workshop-core-pools / workshop-complete、cure=smart / never。
- 現行値: 装備 10/15/20 / 装身具 10/15。biome側 gimmicks.trapBonus は変更・使用なし。
- ceiling: B5 entry直前の既生成装備へ trapBonus 20 を追加・既存値より低い場合は20へ引上げ。乱数消費なし。B5 entrant以外へ適用なし。
- 罠致死性、解除式、宝箱生成、trapSense値、balance source値は変更なし。

## N設計

- #467 の B5 entrant率 0.2199、有群率0.0271を ceiling 有群率1.0へ置換。target group N=200。
- ceil(200 / (0.2199 × 1.0)) = 910 run/cell。実測 1,000 run/cell（上式以上）。
- 現行 control の実trapBonus保有率は診断値。低Nなら有/なし群の結論へ使わない。ceilingのA1/A2は全B5 entrantを対象。

## A1 / A2 / A3

- workshop-core-pools / smart: B5 entrant control=252 / placebo=252 / ceiling=252。
  - A1 control=不成立 Q4−Q1=+0.054 [-0.108, 0.216] / ceiling=不成立 Q4−Q1=+0.068 [-0.093, 0.230]; Q4死亡率=38.7% [27.6%, 51.2%]; monotonic=不成立。
  - A2 control=不成立 r=0.19 [0.07, 0.31] / ceiling=不成立 r=0.11 [-0.01, 0.23]。
  - A3 ceiling: coreCount=不成立 / combatCoreCount=不成立 / economyCoreCount=不成立 / coreWithMatchingSupport=不成立。
- workshop-core-pools / never: B5 entrant control=192 / placebo=192 / ceiling=192。
  - A1 control=不成立 Q4−Q1=-0.029 [-0.211, 0.154] / ceiling=不成立 Q4−Q1=-0.194 [-0.374, -0.013]; Q4死亡率=27.7% [16.9%, 41.8%]; monotonic=不成立。
  - A2 control=不成立 r=0.14 [0.00, 0.28] / ceiling=成立 r=0.20 [0.06, 0.33]。
  - A3 ceiling: coreCount=未確定（総N<194またはlevel 1/2のN<30） / combatCoreCount=未確定（総N<194またはlevel 1/2のN<30） / economyCoreCount=未確定（総N<194またはlevel 1/2のN<30） / coreWithMatchingSupport=不成立。
- workshop-complete / smart: B5 entrant control=226 / placebo=226 / ceiling=226。
  - A1 control=成立 Q4−Q1=-0.188 [-0.343, -0.033] / ceiling=成立 Q4−Q1=-0.187 [-0.347, -0.028]; Q4死亡率=19.6% [11.3%, 31.8%]; monotonic=成立。
  - A2 control=不成立 r=0.17 [0.04, 0.29] / ceiling=不成立 r=0.17 [0.04, 0.30]。
  - A3 ceiling: coreCount=不成立 / combatCoreCount=不成立 / economyCoreCount=不成立 / coreWithMatchingSupport=不成立。
- workshop-complete / never: B5 entrant control=224 / placebo=224 / ceiling=224。
  - A1 control=不成立 Q4−Q1=-0.116 [-0.273, 0.042] / ceiling=成立 Q4−Q1=-0.239 [-0.397, -0.080]; Q4死亡率=18.5% [10.4%, 30.8%]; monotonic=成立。
  - A2 control=不成立 r=0.20 [0.07, 0.32] / ceiling=成立 r=0.23 [0.10, 0.35]。
  - A3 ceiling: coreCount=不成立 / combatCoreCount=不成立 / economyCoreCount=不成立 / coreWithMatchingSupport=不成立。
- A1 Q4−Q1は職内centered、A2は職内centered Fisher z、A3も職内centered。率=Wilson 95% CI、相関=Fisher z 95% CI、平均/差=正規近似95% CI。
- N<30は未確定。CIが0を跨ぐ指標は効果なしと断定しない。

## placebo / ceiling paired

- placebo−current: paired。全 4000 pairで randomSequenceId監査。現行値・群定義のみの差は次の通り。
- smart:workshop-core-pools: floor=+0.000 [0.000, 0.000] / B5死亡=+0.000 [0.000, 0.000] / B5突破=+0.000 [0.000, 0.000]; 同一結果pair=1000/1000。
- smart:workshop-complete: floor=+0.000 [0.000, 0.000] / B5死亡=+0.000 [0.000, 0.000] / B5突破=+0.000 [0.000, 0.000]; 同一結果pair=1000/1000。
- never:workshop-core-pools: floor=+0.000 [0.000, 0.000] / B5死亡=+0.000 [0.000, 0.000] / B5突破=+0.000 [0.000, 0.000]; 同一結果pair=1000/1000。
- never:workshop-complete: floor=+0.000 [0.000, 0.000] / B5死亡=+0.000 [0.000, 0.000] / B5突破=+0.000 [0.000, 0.000]; 同一結果pair=1000/1000。
- ceiling−current: paired。post-generation / random consumption preserved / trajectory diverges。
- smart:workshop-core-pools: floor=+0.040 [-0.018, 0.098] / B5死亡=-0.004 [-0.053, 0.045] / B5突破=+0.004 [-0.045, 0.053] / 生還=-0.010 [-0.024, 0.004]。
- smart:workshop-complete: floor=+0.015 [-0.046, 0.076] / B5死亡=+0.040 [-0.010, 0.089] / B5突破=-0.022 [-0.067, 0.023] / 生還=+0.002 [-0.011, 0.015]。
- never:workshop-core-pools: floor=+0.007 [-0.046, 0.060] / B5死亡=+0.052 [-0.014, 0.118] / B5突破=-0.016 [-0.078, 0.047] / 生還=-0.008 [-0.021, 0.005]。
- never:workshop-complete: floor=-0.005 [-0.063, 0.053] / B5死亡=+0.036 [-0.015, 0.087] / B5突破=-0.018 [-0.064, 0.028] / 生還=-0.018 [-0.030, -0.006]。

## runを楽にしていないか

- workshop-core-pools / smart: B5死亡 32.9% [27.4%, 39.0%]→32.5% [27.1%, 38.5%]、突破 29.8% [24.5%, 35.7%]→30.2% [24.8%, 36.1%]、全run平均floor 3.65 [3.53, 3.76]→3.69 [3.56, 3.81]。点推定方向=易化。
- workshop-core-pools / never: B5死亡 25.5% [19.9%, 32.1%]→30.7% [24.6%, 37.6%]、突破 36.5% [30.0%, 43.5%]→34.9% [28.5%, 41.9%]、全run平均floor 3.45 [3.33, 3.56]→3.45 [3.33, 3.57]。点推定方向=混在/不明。
- workshop-complete / smart: B5死亡 23.0% [18.0%, 28.9%]→27.0% [21.6%, 33.1%]、突破 39.8% [33.7%, 46.3%]→37.6% [31.6%, 44.1%]、全run平均floor 3.69 [3.56, 3.81]→3.70 [3.57, 3.83]。点推定方向=混在/不明。
- workshop-complete / never: B5死亡 25.4% [20.2%, 31.5%]→29.0% [23.5%, 35.3%]、突破 36.6% [30.6%, 43.1%]→34.8% [28.9%, 41.3%]、全run平均floor 3.67 [3.55, 3.79]→3.67 [3.54, 3.79]。点推定方向=混在/不明。
- 点推定が易化方向のcellはあるが、paired 95% CIは全run平均floor・B5死亡・B5突破の判定対象で0を跨ぐ。天井でrunが安定して楽になったとは判定しない。

## 宝箱副作用・職業別

- smart / 全職: 解除率 87.1% [86.2%, 88.1%]→88.6% [87.7%, 89.5%]、罠被害HP/run 39.29 [37.51, 41.07]→39.10 [37.28, 40.92]、素材/run 47.16 [45.25, 49.07]→47.59 [45.62, 49.55]、開封/run 23.13 [22.24, 24.01]→23.40 [22.46, 24.34]。
  - Fighter: 解除率 100.0% [89.6%, 100.0%]→100.0% [89.6%, 100.0%]、罠被害 40.08 [38.00, 42.15]→40.10 [38.03, 42.18]、素材 37.11 [35.42, 38.80]→37.13 [35.43, 38.83]。
  - Thief: 解除率 86.6% [85.6%, 87.6%]→88.2% [87.2%, 89.1%]、罠被害 20.33 [18.91, 21.76]→18.94 [17.53, 20.35]、素材 55.41 [51.91, 58.90]→56.86 [53.08, 60.64]。
  - Priest: 解除率 100.0% [96.7%, 100.0%]→99.1% [95.3%, 99.8%]、罠被害 56.11 [50.58, 61.64]→56.73 [51.11, 62.34]、素材 56.77 [50.89, 62.65]→57.02 [51.03, 63.02]。
  - Mage: 解除率 100.0% [92.1%, 100.0%]→100.0% [92.1%, 100.0%]、罠被害 40.64 [38.65, 42.64]→40.63 [38.63, 42.62]、素材 39.35 [37.43, 41.28]→39.33 [37.41, 41.25]。
- never / 全職: 解除率 85.8% [84.7%, 86.9%]→87.7% [86.7%, 88.7%]、罠被害HP/run 37.93 [36.20, 39.65]→37.37 [35.66, 39.08]、素材/run 44.09 [42.26, 45.91]→44.17 [42.28, 46.06]、開封/run 21.65 [20.78, 22.52]→21.69 [20.79, 22.59]。
  - Fighter: 解除率 100.0% [91.2%, 100.0%]→100.0% [91.6%, 100.0%]、罠被害 38.40 [36.30, 40.51]→38.38 [36.28, 40.49]、素材 35.48 [33.67, 37.29]→35.53 [33.70, 37.36]。
  - Thief: 解除率 85.1% [84.0%, 86.2%]→87.2% [86.1%, 88.2%]、罠被害 20.15 [18.87, 21.43]→19.07 [17.77, 20.36]、素材 48.71 [45.28, 52.13]→50.76 [46.59, 54.94]。
  - Priest: 解除率 100.0% [96.8%, 100.0%]→99.1% [95.3%, 99.8%]、罠被害 54.72 [49.34, 60.11]→53.50 [48.21, 58.79]、素材 54.11 [48.50, 59.72]→52.33 [46.87, 57.78]。
  - Mage: 解除率 100.0% [91.4%, 100.0%]→100.0% [91.2%, 100.0%]、罠被害 38.43 [36.53, 40.33]→38.52 [36.62, 40.43]、素材 38.06 [36.18, 39.93]→38.06 [36.18, 39.93]。
- 盗賊はapt（base80/max90）、非apt職はbase40/max60の現行解除式を使用。盗賊の解除率は両cureで改善し、非apt職の上限張り付きを含めても格差悪化は確認されなかった。

## trapSense cap

- workshop-core-pools / smart: detection cap-hit 0.0% [0.0%, 0.1%]→0.0% [0.0%, 0.1%]（attempt=5287）。trapBonus ceilingで trapSense 値は変更せず、cap張り付きだけ実測。
- workshop-core-pools / never: detection cap-hit 0.0% [0.0%, 0.1%]→0.0% [0.0%, 0.1%]（attempt=4816）。trapBonus ceilingで trapSense 値は変更せず、cap張り付きだけ実測。
- workshop-complete / smart: detection cap-hit 0.0% [0.0%, 0.1%]→0.0% [0.0%, 0.1%]（attempt=5419）。trapBonus ceilingで trapSense 値は変更せず、cap張り付きだけ実測。
- workshop-complete / never: detection cap-hit 0.0% [0.0%, 0.1%]→0.0% [0.0%, 0.1%]（attempt=5233）。trapBonus ceilingで trapSense 値は変更せず、cap張り付きだけ実測。

## 多重比較

- acceptance family: 2 scenario × 2 cure × (A1 1 + A2 1 + A3 3) = 20 tests。α=.05期待偽陽性=1.0本。
- paired movement audit: 24 testsを別 family として明示。合算上限=44 tests、期待偽陽性=2.2本。単発CI非交差・符号不一致は採用しない。

## 実行監査

- node=v26.7.0 / platform=darwin / arch=arm64。availableParallelism=15、resolved parallelism=15。SIM_PARALLEL未指定、SIM_MAP_CACHE_ENTRIES未指定（runtime default）。
- calibration wall=6.437s / simulation wall=24.648s / total wall=31.085s / total CPU=374.943s。
- env SHA-256=fc13fc065ef0c4682540d2f0edea7933bcaea19e4f12e4c9abb838f212494570。
- raw JSONL SHA-256=98aee48472df1fce9e01efbba7a867888765f37f706946adf0c1fa5551909526。
- summary JSON SHA-256=8bf2d99a2e57eaab3d6419c69ebd1513eb18c720342e520e4fe9697d9918f547。

## 完全な env

```text
SIM_SEED=271
SIM_RUNS=1000
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

SIM_SEED=271 SIM_RUNS=1000 SIM_CALIBRATION_RUNS=100 SIM_SCENARIOS=workshop-core-pools,workshop-complete DEPARTURE_CRAFT_IDS=TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION IDENTIFICATION_POLICY=powder IDENTIFICATION_STARTING_POWDER=2 IDENTIFICATION_COST_OVERRIDE=1 FLEE_POLICY=threshold FLEE_HP_THRESHOLD=0.35 TRAP_POLICY=conservative TRAP_AVOIDANCE_POLICY=ev TRAP_DAMAGE_MULTIPLIER=1 STATUS_CURE_POLICY=smart STATUS_CURE_HP_THRESHOLD=0.35 STATUS_CURE_MERCHANT_POLICY=missing HEAL_POTION_MERCHANT_POLICY=missing PORTAL_HP_THRESHOLD=0.35 PORTAL_MAX_HEAL_POTIONS=0 PORTAL_MIN_FLOOR=3 ELITE_POLICY=avoid SIM_440_CONDITION=current SIM_EQUIPMENT_POLICY=individual-score SIM_EQUIPMENT_SLOT_MODE=standard SIM_EQUIPMENT_SLOT_AFFIX_MODE=retain SIM_MATCHING_DEFINITION=exact SIM_CURSE_LOCK_MODE=current SIM_SUPPORT_SUPPLY_CEILING=none SIM_CORE_SCORE_DROP_TOLERANCE=0 SIM_MAP_STATS=0 SIM_DAMAGE_PROBE=0 SIM_PRESET= SIM_DIAGNOSTICS=off SIM_RESULT_BASENAME=issue-468-exposure-ceiling node scratch/sim_issue_468_exposure_ceiling.js（1000 run/cell）。

## Review checklist

- 適用: .agents/balance-simulation.md。N設計、95% CI、class-centered、paired監査、無条件floor、複数比較、run易化、副作用を確認。
- 未適用: UI/mobile、QA/browser、game-design canon。UI変更・balance source変更がなく、canonは unaffected。
- 検証: node --check、import/export確認、N=1 smoke、scratch/test_sim_reward_paths.js、npm run lint、npm run test:unit。

Refs #468
