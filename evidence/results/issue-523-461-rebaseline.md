# Issue #461 基本4職 基準線

## 結論

職内 `combatBuildScore` Q4 は A1 の3条件を満たす。完成ビルド定義として採用可能。

| 職業 | 初回B1突破 | B1 entrant | B1突破 | B1死亡 | B1撤退 | B5 entrant | B5突破 | B5死亡 | B5撤退 | B10 entrant | B10突破 | B10死亡 | B10撤退 | 全run平均到達floor |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 戦士 | 51.6% [49.8%, 53.4%; N=3000] | 100.0% [99.9%, 100.0%; N=3000] | 97.3% [96.7%, 97.9%; N=3000] | 2.7% [2.1%, 3.3%; N=3000] | 0.0% [0.0%, 0.1%; N=3000] | 44.4% [42.7%, 46.2%; N=3000] | 25.4% [23.2%, 27.8%; N=1333] | 2.0% [1.3%, 2.8%; N=1333] | 72.6% [70.2%, 74.9%; N=1333] | 3.4% [2.8%, 4.1%; N=3000] | 22.3% [15.4%, 31.3%; N=103] | 4.9% [2.1%, 10.9%; N=103] | 72.8% [63.5%, 80.5%; N=103] | 4.48 [4.41, 4.54; N=3000] |
| 盗賊 | 74.1% [72.5%, 75.6%; N=3000] | 100.0% [99.9%, 100.0%; N=3000] | 96.5% [95.8%, 97.1%; N=3000] | 3.5% [2.9%, 4.2%; N=3000] | 0.0% [0.0%, 0.1%; N=3000] | 72.8% [71.1%, 74.3%; N=3000] | 60.1% [58.0%, 62.1%; N=2183] | 4.0% [3.3%, 4.9%; N=2183] | 35.9% [33.9%, 37.9%; N=2183] | 19.2% [17.9%, 20.7%; N=3000] | 31.5% [27.9%, 35.4%; N=577] | 10.4% [8.2%, 13.2%; N=577] | 58.1% [54.0%, 62.0%; N=577] | 6.27 [6.16, 6.37; N=3000] |
| 僧侶 | 38.5% [36.7%, 40.2%; N=3000] | 100.0% [99.9%, 100.0%; N=3000] | 85.2% [83.9%, 86.5%; N=3000] | 14.8% [13.5%, 16.1%; N=3000] | 0.0% [0.0%, 0.1%; N=3000] | 43.7% [41.9%, 45.5%; N=3000] | 87.3% [85.4%, 89.0%; N=1311] | 12.7% [11.0%, 14.6%; N=1311] | 0.0% [0.0%, 0.3%; N=1311] | 27.5% [25.9%, 29.1%; N=3000] | 89.3% [87.0%, 91.3%; N=825] | 8.1% [6.4%, 10.2%; N=825] | 2.5% [1.7%, 3.9%; N=825] | 6.30 [6.12, 6.49; N=3000] |
| 魔術師 | 66.1% [64.4%, 67.7%; N=3000] | 100.0% [99.9%, 100.0%; N=3000] | 97.5% [96.9%, 98.0%; N=3000] | 2.5% [2.0%, 3.1%; N=3000] | 0.0% [0.0%, 0.1%; N=3000] | 49.9% [48.1%, 51.7%; N=3000] | 20.5% [18.5%, 22.6%; N=1498] | 15.8% [14.1%, 17.8%; N=1498] | 63.7% [61.2%, 66.1%; N=1498] | 1.6% [1.2%, 2.2%; N=3000] | 20.4% [11.5%, 33.6%; N=49] | 14.3% [7.1%, 26.7%; N=49] | 65.3% [51.3%, 77.1%; N=49] | 4.47 [4.42, 4.53; N=3000] |

初回ランは素材0・出発クラフトなし。各 floor の突破・死亡・撤退は entrant を分母とし、3内訳の合計は100%。死亡は `deathFloor === floor`（その階でちょうど死亡）であり、到達後に後続階で死亡した run は突破へ入る。撤退は entrant かつ突破/死亡でない run。B1撤退0%は `PORTAL_MIN_FLOOR=3` のため。率は Wilson 95% CI、平均は正規近似95% CI。

## 完成ビルド率 / core装備率

| 対象 | Q4完成率 / 全run | Q4 / B5 entrant | core装備率（終了時1個以上） |
| --- | --- | --- | --- |
| 4職合算 | 13.2% [12.6%, 13.8%; N=12000] | 25.0% [23.9%, 26.0%; N=6325] | 83.5% [82.8%, 84.1%; N=12000] |
| 戦士 | 11.1% [10.0%, 12.3%; N=3000] | 25.0% [22.7%, 27.4%; N=1333] | 87.5% [86.2%, 88.6%; N=3000] |
| 盗賊 | 18.2% [16.8%, 19.6%; N=3000] | 25.0% [23.2%, 26.8%; N=2183] | 91.4% [90.3%, 92.3%; N=3000] |
| 僧侶 | 10.9% [9.8%, 12.1%; N=3000] | 24.9% [22.7%, 27.4%; N=1311] | 71.4% [69.8%, 73.0%; N=3000] |
| 魔術師 | 12.5% [11.3%, 13.7%; N=3000] | 25.0% [22.8%, 27.2%; N=1498] | 83.7% [82.4%, 85.0%; N=3000] |

Q4完成率の主値は Q4 / 全run。Q4 / B5 entrant は quartile定義上の監査値（約25%）。core装備率は終了時 `finalCoreIds.length >= 1` / 全run。

## A1

### 4職合算

| Q | N | combatBuildScore平均 | B5死亡率（deathFloor===5; Wilson 95% CI） | 職内centered率 |
| ---: | ---: | ---: | --- | ---: |
| Q1 | 1583 | 28.96 | 12.4% [10.9%, 14.2%; N=1583] | 13.2% |
| Q2 | 1581 | 37.65 | 8.0% [6.8%, 9.5%; N=1581] | 8.5% |
| Q3 | 1582 | 47.72 | 7.1% [5.9%, 8.5%; N=1582] | 7.4% |
| Q4 | 1579 | 68.82 | 5.1% [4.1%, 6.3%; N=1579] | 5.4% |

- Q4−Q1 B5死亡率差（職内centered、正規近似CI）: -7.3pt [-9.2, -5.4]
- trend test: class-stratified Cochran-Armitage、z=-7.598、減少方向 p<0.0001、増加方向 p=1.0000

| 隣接 | 差（次−前、正規95% CI） | 判定 |
| --- | --- | --- |
| Q1→Q2 | -4.4pt [-6.5, -2.3] | 統計的減少 |
| Q2→Q3 | -1.0pt [-2.8, 0.9] | 点推定減少（CIは0を跨ぐ） |
| Q3→Q4 | -1.9pt [-3.6, -0.3] | 統計的減少 |

- 統計的非単調（隣接差CI下限>0）: 確認なし
- 条件: Q4−Q1 CI上限<0=成立 / Q1→Q4単調減少=成立 / 職内centered=成立
- A1判定: **成立**

職内判定の確認:

- 戦士: Q4−Q1=1.5pt [-0.4, 3.4], A1=不成立
- 盗賊: Q4−Q1=-1.8pt [-4.1, 0.5], A1=不成立
- 僧侶: Q4−Q1=-10.6pt [-15.7, -5.6], A1=成立
- 魔術師: Q4−Q1=-20.2pt [-25.6, -14.8], A1=成立

## 工房状態分布

観測正本 #343/#346 の30試行×40ランを整数再構成。各職 N=3000 へ同じ層化系列を適用。空工房だけの測定ではない。

| state | 固定比率 | 実行時観測 |
| --- | --- | --- |
| workshop-empty | 30/1200 (2.5%) | 300/12000 (2.5% [2.2%, 2.8%; N=12000]) |
| workshop-stats | 74/1200 (6.2%) | 740/12000 (6.2% [5.8%, 6.6%; N=12000]) |
| workshop-gear | 69/1200 (5.8%) | 688/12000 (5.7% [5.3%, 6.2%; N=12000]) |
| workshop-blood-wand | 216/1200 (18.0%) | 2160/12000 (18.0% [17.3%, 18.7%; N=12000]) |
| workshop-blood-wand-spells | 47/1200 (3.9%) | 472/12000 (3.9% [3.6%, 4.3%; N=12000]) |
| workshop-complete | 764/1200 (63.7%) | 7640/12000 (63.7% [62.8%, 64.5%; N=12000]) |

## 多重比較

- α=.05、計 52 チェック、期待偽陽性 2.6件。
- 内訳: 初回率1 + 各 floor の entrant/突破/死亡/撤退、endpoint率 40、Q4/core 8、A1 4。
- これは基準線の記述区間。効果の採否に多重比較補正済み検定を主張しない。

## 配線確認 / 緩和策

- trap: encounter=464463, activation=316911, disarm=131926, damageHP=881859.0。
- TOWN_PORTAL: use=7358。status cure: {"ANTIDOTE":14119,"HOLY_WATER":2961,"PANACEA":2030,"EYE_DROPS":923}, cured=20033。
- identification: count=117587, powderUsed=117079。
- モデル: `generateRunFloor`、罠の発見/解除/被弾、`TOWN_PORTAL`、状態異常治療消耗品、鑑定粉、上薬（`GREATER_HEAL`）能動使用、現行戦闘/報酬/装備更新、現行 departure kit。
- 省略: 任意の節目商人での鑑定粉購入（未観測・自動購入なし） / 人間の敵別判断、任意寄り道、テレポーター移動先の再経路化 / MP・強化アイテムの能動使用 / 上級職4種。


## 固定条件

```text
BLOOD_WAND_HP_PAYMENT_MIN_RATE=0.50
CI=<unset>
DEPARTURE_CRAFT_IDS=TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION
ELITE_POLICY=avoid
FLEE_HP_THRESHOLD=0.20
FLEE_POLICY=ev
HEAL_POTION_MERCHANT_POLICY=missing
HEAL_POTION_THRESHOLD=0.55
IDENTIFICATION_COST_OVERRIDE=1
IDENTIFICATION_POLICY=powder
IDENTIFICATION_STARTING_POWDER=2
ISSUE461_CLASSES=Fighter,Thief,Priest,Mage
ISSUE461_MODE=baseline
ISSUE461_SCENARIOS=workshop-empty,workshop-stats,workshop-gear,workshop-blood-wand,workshop-blood-wand-spells,workshop-complete
ISSUE461_TARGET_DEPTH_BASELINE=21
ISSUE461_TARGET_DEPTH_INITIAL=2
ISSUE461_WORKSHOP_DISTRIBUTION=workshop-empty:30/1200,workshop-stats:74/1200,workshop-gear:69/1200,workshop-blood-wand:216/1200,workshop-blood-wand-spells:47/1200,workshop-complete:764/1200
PORTAL_HP_THRESHOLD=0.35
PORTAL_MAX_HEAL_POTIONS=0
PORTAL_MIN_FLOOR=3
SIM_440_CONDITION=current
SIM_AFFIXLESS_DUPLICATE_COUNT=2
SIM_AFFIXLESS_DUPLICATE_SLOT=
SIM_CALIBRATION_RUNS=1000
SIM_CORE_ENCOUNTER_CEILING=
SIM_CORE_SCORE_DROP_TOLERANCE=0
SIM_CORE_WORKSHOP_GATE=
SIM_CURSE_BASE_CHANCE_OVERRIDE=
SIM_CURSE_CHANCE_PER_FLOOR_OVERRIDE=
SIM_CURSE_CORE_BONUS_OVERRIDE=
SIM_CURSE_DETECT_BASE_OVERRIDE=
SIM_CURSE_DETECT_DECAY_OVERRIDE=
SIM_CURSE_DETECT_MIN_OVERRIDE=
SIM_CURSE_LOCK_MODE=current
SIM_CURSE_MAX_CHANCE_OVERRIDE=
SIM_DAMAGE_PROBE=0
SIM_EQUIPMENT_POLICY=individual-score
SIM_EQUIPMENT_SLOT_AFFIX_MODE=retain
SIM_EQUIPMENT_SLOT_MODE=standard
SIM_MAP_STATS=0
SIM_MATCHING_DEFINITION=exact
SIM_PRESET=
SIM_RUNS=3000
SIM_SCENARIOS=workshop-empty,workshop-stats,workshop-gear,workshop-blood-wand,workshop-blood-wand-spells,workshop-complete
SIM_SEED=461
SIM_SUPPORT_SUPPLY_CEILING=none
STATUS_CURE_HP_THRESHOLD=0.35
STATUS_CURE_MERCHANT_POLICY=missing
STATUS_CURE_POLICY=smart
TRAP_AVOIDANCE_POLICY=ev
TRAP_BONUS_OVERRIDE=
TRAP_DAMAGE_MULTIPLIER=1
TRAP_POLICY=conservative
TRAP_SENSE_OVERRIDE=
SIM_PARALLEL=<omitted; runtime default>
SIM_MAP_CACHE_ENTRIES=<omitted; runtime default 1024>
```

- env hash: `6630774fbe1172084adde136272b09df77373427bc3d179fdd3587b9fad4f572`
- scenario: workshop-empty, workshop-stats, workshop-gear, workshop-blood-wand, workshop-blood-wand-spells, workshop-complete
- targetDepth: initial=2 / baseline=21（B20終了まで）
- resolved parallelism: 15（availableParallelism=15, SIM_PARALLEL未指定、CI=<unset>）
- `SIM_MAP_CACHE_ENTRIES`未指定。既定1024。

## 実行記録


```sh
node --check scratch/simulations/sim_issue_461_baseline.js
SIM_RUNS=3000 SIM_CALIBRATION_RUNS=1000 node scratch/simulations/sim_issue_461_baseline.js
```

- calibration wall-clock: 108.452s
- simulation wall-clock: 39.942s
- total wall-clock（単純合計）: 148.394s
- total CPU（user+system）: 740.760s
- raw JSONL SHA-256: `ba1487eccedc51a8b6c590291103d4f802fca5b40cd4252e7f536cfaab349f97`
- summary JSON SHA-256: `d466a8a37372d0eb24b01abda011bdc3bb9d2964f74675f2d89f391072d54da8`

## 採らなかった完成定義

- `core 1個以上 + スロット充足`: core装備率を35〜40%目標の別指標で使うため二重定義。
- `core + 対応support`: #445で成立率9.5%→71.1%にしてもB5 endpointが動かず、判定力なし。

## 検証

- `node scratch/tests/regression/test_sim_reward_paths.js`
- `npm run lint`
- `npm run test:unit`

Refs #461
