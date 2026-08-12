# Issue #461 基本4職 基準線

## 結論

職内 `combatBuildScore` Q4 は A1 の3条件を満たす。完成ビルド定義として採用可能。

| 職業 | 初回B1突破 | B1 entrant | B1突破 | B1死亡 | B1撤退 | B5 entrant | B5突破 | B5死亡 | B5撤退 | B10 entrant | B10突破 | B10死亡 | B10撤退 | 全run平均到達floor |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 戦士 | 64.1% [62.4%, 65.8%; N=3000] | 100.0% [99.9%, 100.0%; N=3000] | 98.0% [97.4%, 98.4%; N=3000] | 2.0% [1.6%, 2.6%; N=3000] | 0.0% [0.0%, 0.1%; N=3000] | 76.2% [74.6%, 77.7%; N=3000] | 65.6% [63.6%, 67.5%; N=2285] | 1.3% [0.9%, 1.8%; N=2285] | 33.1% [31.2%, 35.1%; N=2285] | 28.1% [26.5%, 29.7%; N=3000] | 52.2% [48.8%, 55.5%; N=843] | 2.8% [1.9%, 4.2%; N=843] | 45.0% [41.6%, 48.3%; N=843] | 7.13 [7.00, 7.26; N=3000] |
| 盗賊 | 74.1% [72.5%, 75.6%; N=3000] | 100.0% [99.9%, 100.0%; N=3000] | 96.5% [95.8%, 97.1%; N=3000] | 3.5% [2.9%, 4.2%; N=3000] | 0.0% [0.0%, 0.1%; N=3000] | 72.8% [71.1%, 74.3%; N=3000] | 60.1% [58.0%, 62.1%; N=2183] | 4.0% [3.3%, 4.9%; N=2183] | 35.9% [33.9%, 37.9%; N=2183] | 19.2% [17.9%, 20.7%; N=3000] | 31.4% [27.7%, 35.3%; N=577] | 10.4% [8.2%, 13.2%; N=577] | 58.2% [54.2%, 62.2%; N=577] | 6.26 [6.16, 6.37; N=3000] |
| 僧侶 | 52.9% [51.1%, 54.7%; N=3000] | 100.0% [99.9%, 100.0%; N=3000] | 89.6% [88.5%, 90.7%; N=3000] | 10.4% [9.3%, 11.5%; N=3000] | 0.0% [0.0%, 0.1%; N=3000] | 49.4% [47.6%, 51.2%; N=3000] | 86.8% [84.9%, 88.4%; N=1481] | 13.2% [11.6%, 15.1%; N=1481] | 0.0% [0.0%, 0.3%; N=1481] | 27.2% [25.6%, 28.8%; N=3000] | 80.9% [78.0%, 83.4%; N=815] | 8.1% [6.4%, 10.2%; N=815] | 11.0% [9.1%, 13.4%; N=815] | 6.37 [6.20, 6.53; N=3000] |
| 魔術師 | 57.5% [55.7%, 59.2%; N=3000] | 100.0% [99.9%, 100.0%; N=3000] | 98.9% [98.5%, 99.2%; N=3000] | 1.1% [0.8%, 1.5%; N=3000] | 0.0% [0.0%, 0.1%; N=3000] | 76.0% [74.4%, 77.5%; N=3000] | 56.3% [54.3%, 58.4%; N=2279] | 11.5% [10.2%, 12.8%; N=2279] | 32.2% [30.3%, 34.2%; N=2279] | 27.3% [25.8%, 29.0%; N=3000] | 74.4% [71.3%, 77.3%; N=820] | 4.6% [3.4%, 6.3%; N=820] | 21.0% [18.3%, 23.9%; N=820] | 7.35 [7.19, 7.50; N=3000] |

初回ランは素材0・出発クラフトなし。各 floor の突破・死亡・撤退は entrant を分母とし、3内訳の合計は100%。死亡は `deathFloor === floor`（その階でちょうど死亡）であり、到達後に後続階で死亡した run は突破へ入る。撤退は entrant かつ突破/死亡でない run。B1撤退0%は `PORTAL_MIN_FLOOR=3` のため。率は Wilson 95% CI、平均は正規近似95% CI。

## 完成ビルド率 / core装備率

| 対象 | Q4完成率 / 全run | Q4 / B5 entrant | core装備率（終了時1個以上） |
| --- | --- | --- | --- |
| 4職合算 | 17.1% [16.5%, 17.8%; N=12000] | 25.0% [24.1%, 25.9%; N=8228] | 88.5% [87.9%, 89.1%; N=12000] |
| 戦士 | 19.0% [17.7%, 20.5%; N=3000] | 25.0% [23.3%, 26.8%; N=2285] | 94.1% [93.2%, 94.9%; N=3000] |
| 盗賊 | 18.2% [16.8%, 19.6%; N=3000] | 25.0% [23.2%, 26.8%; N=2183] | 91.4% [90.3%, 92.3%; N=3000] |
| 僧侶 | 12.3% [11.2%, 13.6%; N=3000] | 25.0% [22.8%, 27.3%; N=1481] | 75.9% [74.3%, 77.4%; N=3000] |
| 魔術師 | 19.0% [17.6%, 20.4%; N=3000] | 25.0% [23.2%, 26.8%; N=2279] | 92.6% [91.6%, 93.5%; N=3000] |

Q4完成率の主値は Q4 / 全run。Q4 / B5 entrant は quartile定義上の監査値（約25%）。core装備率は終了時 `finalCoreIds.length >= 1` / 全run。

## A1

### 4職合算

| Q | N | combatBuildScore平均 | B5死亡率（deathFloor===5; Wilson 95% CI） | 職内centered率 |
| ---: | ---: | ---: | --- | ---: |
| Q1 | 2059 | 28.64 | 9.8% [8.6%, 11.2%; N=2059] | 10.3% |
| Q2 | 2057 | 37.55 | 6.6% [5.6%, 7.7%; N=2057] | 7.0% |
| Q3 | 2057 | 47.85 | 6.7% [5.7%, 7.9%; N=2057] | 7.1% |
| Q4 | 2055 | 68.97 | 4.8% [4.0%, 5.8%; N=2055] | 5.6% |

- Q4−Q1 B5死亡率差（職内centered、正規近似CI）: -5.0pt [-6.5, -3.4]
- trend test: class-stratified Cochran-Armitage、z=-6.017、減少方向 p<0.0001、増加方向 p=1.0000

| 隣接 | 差（次−前、正規95% CI） | 判定 |
| --- | --- | --- |
| Q1→Q2 | -3.2pt [-4.9, -1.6] | 統計的減少 |
| Q2→Q3 | 0.1pt [-1.4, 1.7] | 点推定反転（CIは0を跨ぐ） |
| Q3→Q4 | -1.9pt [-3.3, -0.5] | 統計的減少 |

- 統計的非単調（隣接差CI下限>0）: 確認なし
- 条件: Q4−Q1 CI上限<0=成立 / Q1→Q4単調減少=成立 / 職内centered=成立
- A1判定: **成立**

職内判定の確認:

- 戦士: Q4−Q1=0.0pt [-1.3, 1.3], A1=不成立
- 盗賊: Q4−Q1=-2.0pt [-4.3, 0.3], A1=不成立
- 僧侶: Q4−Q1=-1.0pt [-6.2, 4.1], A1=不成立
- 魔術師: Q4−Q1=-15.4pt [-19.1, -11.8], A1=成立

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

- trap: encounter=627141, activation=460266, disarm=144201, damageHP=1052386.0。
- TOWN_PORTAL: use=7441。status cure: {"ANTIDOTE":15232,"HOLY_WATER":3791,"PANACEA":2152,"EYE_DROPS":711}, cured=21886。
- identification: count=146794, powderUsed=146086。
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
- source commit: `f28dfc07c8fa2ffdf869c07ead6a130f446e2355`
- origin/main ancestor: yes
- stale tree override: none

## 実行記録


```sh
node --check scratch/sim_issue_461_baseline.js
SIM_RUNS=3000 SIM_CALIBRATION_RUNS=1000 node scratch/sim_issue_461_baseline.js
```

- calibration wall-clock: 134.456s
- simulation wall-clock: 52.515s
- total wall-clock（単純合計）: 186.972s
- total CPU（user+system）: 954.752s
- raw JSONL SHA-256: `e3392a63729d32ce312d9980880c6a77be9d42a4a1e21a546561a0b5527ca901`
- summary JSON SHA-256: `f5e2d4bbf84f9ef3a478361e4b8fd758bff68fa73688ec30503773dca00aa4db`

## 採らなかった完成定義

- `core 1個以上 + スロット充足`: core装備率を35〜40%目標の別指標で使うため二重定義。
- `core + 対応support`: #445で成立率9.5%→71.1%にしてもB5 endpointが動かず、判定力なし。

## 検証

- `node scratch/test_sim_reward_paths.js`
- `npm run lint`
- `npm run test:unit`

Refs #461
