# Issue #461 基本4職 基準線

## 結論

職内 `combatBuildScore` Q4 は A1 の3条件を満たす。完成ビルド定義として採用可能。

| 職業 | 初回B1突破 | B1 entrant | B1突破 | B1死亡 | B1撤退 | B5 entrant | B5突破 | B5死亡 | B5撤退 | B10 entrant | B10突破 | B10死亡 | B10撤退 | 全run平均到達floor |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 戦士 | 64.1% [62.4%, 65.8%; N=3000] | 100.0% [99.9%, 100.0%; N=3000] | 98.0% [97.4%, 98.4%; N=3000] | 2.0% [1.6%, 2.6%; N=3000] | 0.0% [0.0%, 0.1%; N=3000] | 76.1% [74.6%, 77.6%; N=3000] | 75.8% [74.0%, 77.5%; N=2284] | 1.5% [1.1%, 2.1%; N=2284] | 22.6% [21.0%, 24.4%; N=2284] | 31.3% [29.6%, 32.9%; N=3000] | 66.5% [63.4%, 69.5%; N=938] | 2.9% [2.0%, 4.2%; N=938] | 30.6% [27.7%, 33.6%; N=938] | 7.70 [7.56, 7.84; N=3000] |
| 盗賊 | 74.1% [72.5%, 75.6%; N=3000] | 100.0% [99.9%, 100.0%; N=3000] | 96.5% [95.8%, 97.1%; N=3000] | 3.5% [2.9%, 4.2%; N=3000] | 0.0% [0.0%, 0.1%; N=3000] | 72.8% [71.2%, 74.4%; N=3000] | 71.2% [69.2%, 73.0%; N=2185] | 3.7% [3.0%, 4.6%; N=2185] | 25.1% [23.4%, 27.0%; N=2185] | 23.2% [21.7%, 24.7%; N=3000] | 52.8% [49.1%, 56.5%; N=695] | 8.1% [6.3%, 10.3%; N=695] | 39.1% [35.6%, 42.8%; N=695] | 6.82 [6.69, 6.94; N=3000] |
| 僧侶 | 52.9% [51.1%, 54.7%; N=3000] | 100.0% [99.9%, 100.0%; N=3000] | 89.6% [88.5%, 90.7%; N=3000] | 10.4% [9.3%, 11.5%; N=3000] | 0.0% [0.0%, 0.1%; N=3000] | 49.4% [47.6%, 51.2%; N=3000] | 88.3% [86.6%, 89.9%; N=1483] | 11.5% [10.0%, 13.3%; N=1483] | 0.1% [0.0%, 0.5%; N=1483] | 26.3% [24.8%, 27.9%; N=3000] | 81.9% [79.0%, 84.4%; N=789] | 8.5% [6.7%, 10.6%; N=789] | 9.6% [7.8%, 11.9%; N=789] | 6.32 [6.16, 6.48; N=3000] |
| 魔術師 | 57.5% [55.7%, 59.2%; N=3000] | 100.0% [99.9%, 100.0%; N=3000] | 98.9% [98.5%, 99.2%; N=3000] | 1.1% [0.8%, 1.5%; N=3000] | 0.0% [0.0%, 0.1%; N=3000] | 75.9% [74.3%, 77.4%; N=3000] | 66.7% [64.7%, 68.6%; N=2277] | 10.8% [9.6%, 12.2%; N=2277] | 22.4% [20.8%, 24.2%; N=2277] | 30.6% [29.0%, 32.3%; N=3000] | 79.0% [76.2%, 81.5%; N=918] | 4.6% [3.4%, 6.1%; N=918] | 16.4% [14.2%, 19.0%; N=918] | 7.82 [7.66, 7.98; N=3000] |

初回ランは素材0・出発クラフトなし。各 floor の突破・死亡・撤退は entrant を分母とし、3内訳の合計は100%。死亡は `deathFloor === floor`（その階でちょうど死亡）であり、到達後に後続階で死亡した run は突破へ入る。撤退は entrant かつ突破/死亡でない run。B1撤退0%は `PORTAL_MIN_FLOOR=3` のため。率は Wilson 95% CI、平均は正規近似95% CI。

## 完成ビルド率 / core装備率

| 対象 | Q4完成率 / 全run | Q4 / B5 entrant | core装備率（終了時1個以上） |
| --- | --- | --- | --- |
| 4職合算 | 17.1% [16.5%, 17.8%; N=12000] | 25.0% [24.1%, 25.9%; N=8229] | 88.8% [88.2%, 89.3%; N=12000] |
| 戦士 | 19.0% [17.7%, 20.5%; N=3000] | 25.0% [23.3%, 26.8%; N=2284] | 94.3% [93.4%, 95.1%; N=3000] |
| 盗賊 | 18.2% [16.9%, 19.6%; N=3000] | 25.0% [23.2%, 26.8%; N=2185] | 91.5% [90.4%, 92.4%; N=3000] |
| 僧侶 | 12.3% [11.2%, 13.6%; N=3000] | 24.9% [22.8%, 27.2%; N=1483] | 76.1% [74.5%, 77.6%; N=3000] |
| 魔術師 | 19.0% [17.6%, 20.4%; N=3000] | 25.0% [23.3%, 26.8%; N=2277] | 93.2% [92.3%, 94.1%; N=3000] |

Q4完成率の主値は Q4 / 全run。Q4 / B5 entrant は quartile定義上の監査値（約25%）。core装備率は終了時 `finalCoreIds.length >= 1` / 全run。

## A1

### 4職合算

| Q | N | combatBuildScore平均 | B5死亡率（deathFloor===5; Wilson 95% CI） | 職内centered率 |
| ---: | ---: | ---: | --- | ---: |
| Q1 | 2059 | 28.65 | 9.6% [8.4%, 10.9%; N=2059] | 9.8% |
| Q2 | 2057 | 37.65 | 6.6% [5.6%, 7.8%; N=2057] | 7.1% |
| Q3 | 2057 | 48.13 | 5.3% [4.4%, 6.4%; N=2057] | 5.6% |
| Q4 | 2056 | 69.22 | 4.5% [3.7%, 5.5%; N=2056] | 5.1% |

- Q4−Q1 B5死亡率差（職内centered、正規近似CI）: -5.1pt [-6.6, -3.6]
- trend test: class-stratified Cochran-Armitage、z=-6.936、減少方向 p<0.0001、増加方向 p=1.0000

| 隣接 | 差（次−前、正規95% CI） | 判定 |
| --- | --- | --- |
| Q1→Q2 | -3.0pt [-4.6, -1.3] | 統計的減少 |
| Q2→Q3 | -1.3pt [-2.8, 0.1] | 点推定減少（CIは0を跨ぐ） |
| Q3→Q4 | -0.8pt [-2.1, 0.5] | 点推定減少（CIは0を跨ぐ） |

- 統計的非単調（隣接差CI下限>0）: 確認なし
- 条件: Q4−Q1 CI上限<0=成立 / Q1→Q4単調減少=成立 / 職内centered=成立
- A1判定: **成立**

職内判定の確認:

- 戦士: Q4−Q1=1.1pt [-0.5, 2.6], A1=不成立
- 盗賊: Q4−Q1=-1.5pt [-3.7, 0.8], A1=不成立
- 僧侶: Q4−Q1=-0.8pt [-5.6, 4.0], A1=不成立
- 魔術師: Q4−Q1=-17.5pt [-21.2, -13.9], A1=成立

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

- trap: encounter=662403, activation=480652, disarm=157601, damageHP=1092141.0。
- TOWN_PORTAL: use=7099。status cure: {"ANTIDOTE":15385,"HOLY_WATER":3708,"EYE_DROPS":735,"PANACEA":2030}, cured=21858。
- identification: count=153077, powderUsed=152334。
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
- source commit: `877592630a8ebbc27199aa3aee16585455633229`
- origin/main ancestor: yes
- stale tree override: none

## 実行記録


```sh
node --check scratch/sim_issue_461_baseline.js
SIM_RUNS=3000 SIM_CALIBRATION_RUNS=1000 node scratch/sim_issue_461_baseline.js
```

- calibration wall-clock: 135.785s
- simulation wall-clock: 52.339s
- total wall-clock（単純合計）: 188.124s
- total CPU（user+system）: 926.550s
- raw JSONL SHA-256: `78c03fa0ede9c32f142c12f204ab52314edce059aa7f3c11c6b64267e5024613`
- summary JSON SHA-256: `3bdbbe5528e088d084fe69412499c8c83a4267a05d8d27327e9012f55a8408ef`

## 採らなかった完成定義

- `core 1個以上 + スロット充足`: core装備率を35〜40%目標の別指標で使うため二重定義。
- `core + 対応support`: #445で成立率9.5%→71.1%にしてもB5 endpointが動かず、判定力なし。

## 検証

- `node scratch/test_sim_reward_paths.js`
- `npm run lint`
- `npm run test:unit`

Refs #461
