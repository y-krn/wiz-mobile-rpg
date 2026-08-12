# Issue #461 基本4職 基準線

## 結論

職内 `combatBuildScore` Q4 は A1 の3条件を満たす。完成ビルド定義として採用可能。

| 職業 | 初回B1突破 | B1 entrant | B1突破 | B1死亡 | B1撤退 | B5 entrant | B5突破 | B5死亡 | B5撤退 | B10 entrant | B10突破 | B10死亡 | B10撤退 | 全run平均到達floor |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 戦士 | 64.1% [62.4%, 65.8%; N=3000] | 100.0% [99.9%, 100.0%; N=3000] | 98.0% [97.4%, 98.4%; N=3000] | 2.0% [1.6%, 2.6%; N=3000] | 0.0% [0.0%, 0.1%; N=3000] | 76.1% [74.5%, 77.6%; N=3000] | 65.5% [63.5%, 67.4%; N=2283] | 1.3% [0.9%, 1.8%; N=2283] | 33.2% [31.3%, 35.2%; N=2283] | 27.9% [26.3%, 29.5%; N=3000] | 52.1% [48.7%, 55.5%; N=837] | 2.9% [1.9%, 4.2%; N=837] | 45.0% [41.7%, 48.4%; N=837] | 7.12 [6.99, 7.25; N=3000] |
| 盗賊 | 74.1% [72.5%, 75.6%; N=3000] | 100.0% [99.9%, 100.0%; N=3000] | 96.5% [95.8%, 97.1%; N=3000] | 3.5% [2.9%, 4.2%; N=3000] | 0.0% [0.0%, 0.1%; N=3000] | 72.8% [71.2%, 74.4%; N=3000] | 59.9% [57.9%, 62.0%; N=2184] | 4.0% [3.3%, 4.9%; N=2184] | 36.0% [34.0%, 38.1%; N=2184] | 19.2% [17.8%, 20.6%; N=3000] | 31.7% [28.0%, 35.6%; N=575] | 10.3% [8.0%, 13.0%; N=575] | 58.1% [54.0%, 62.1%; N=575] | 6.26 [6.16, 6.37; N=3000] |
| 僧侶 | 38.5% [36.7%, 40.2%; N=3000] | 100.0% [99.9%, 100.0%; N=3000] | 85.2% [83.9%, 86.5%; N=3000] | 14.8% [13.5%, 16.1%; N=3000] | 0.0% [0.0%, 0.1%; N=3000] | 43.6% [41.9%, 45.4%; N=3000] | 87.4% [85.5%, 89.1%; N=1309] | 12.6% [10.9%, 14.5%; N=1309] | 0.0% [0.0%, 0.3%; N=1309] | 27.5% [25.9%, 29.1%; N=3000] | 89.6% [87.3%, 91.5%; N=824] | 7.9% [6.2%, 9.9%; N=824] | 2.5% [1.7%, 3.9%; N=824] | 6.30 [6.12, 6.49; N=3000] |
| 魔術師 | 67.3% [65.6%, 69.0%; N=3000] | 100.0% [99.9%, 100.0%; N=3000] | 97.4% [96.8%, 97.9%; N=3000] | 2.6% [2.1%, 3.2%; N=3000] | 0.0% [0.0%, 0.1%; N=3000] | 63.6% [61.9%, 65.3%; N=3000] | 37.5% [35.4%, 39.7%; N=1909] | 14.8% [13.3%, 16.5%; N=1909] | 47.7% [45.4%, 49.9%; N=1909] | 8.1% [7.2%, 9.2%; N=3000] | 50.4% [44.2%, 56.6%; N=244] | 7.0% [4.4%, 10.9%; N=244] | 42.6% [36.6%, 48.9%; N=244] | 5.32 [5.23, 5.41; N=3000] |

初回ランは素材0・出発クラフトなし。各 floor の突破・死亡・撤退は entrant を分母とし、3内訳の合計は100%。死亡は `deathFloor === floor`（その階でちょうど死亡）であり、到達後に後続階で死亡した run は突破へ入る。撤退は entrant かつ突破/死亡でない run。B1撤退0%は `PORTAL_MIN_FLOOR=3` のため。率は Wilson 95% CI、平均は正規近似95% CI。

## 完成ビルド率 / core装備率

| 対象 | Q4完成率 / 全run | Q4 / B5 entrant | core装備率（終了時1個以上） |
| --- | --- | --- | --- |
| 4職合算 | 16.0% [15.4%, 16.7%; N=12000] | 25.0% [24.0%, 26.0%; N=7685] | 85.8% [85.1%, 86.4%; N=12000] |
| 戦士 | 19.0% [17.6%, 20.4%; N=3000] | 25.0% [23.2%, 26.8%; N=2283] | 94.1% [93.2%, 94.9%; N=3000] |
| 盗賊 | 18.2% [16.9%, 19.6%; N=3000] | 25.0% [23.2%, 26.9%; N=2184] | 91.4% [90.3%, 92.3%; N=3000] |
| 僧侶 | 10.9% [9.8%, 12.1%; N=3000] | 25.0% [22.7%, 27.4%; N=1309] | 71.4% [69.7%, 73.0%; N=3000] |
| 魔術師 | 15.9% [14.6%, 17.3%; N=3000] | 25.0% [23.1%, 27.0%; N=1909] | 86.3% [85.0%, 87.5%; N=3000] |

Q4完成率の主値は Q4 / 全run。Q4 / B5 entrant は quartile定義上の監査値（約25%）。core装備率は終了時 `finalCoreIds.length >= 1` / 全run。

## A1

### 4職合算

| Q | N | combatBuildScore平均 | B5死亡率（deathFloor===5; Wilson 95% CI） | 職内centered率 |
| ---: | ---: | ---: | --- | ---: |
| Q1 | 1923 | 29.58 | 11.7% [10.3%, 13.2%; N=1923] | 12.9% |
| Q2 | 1921 | 38.76 | 7.3% [6.3%, 8.6%; N=1921] | 8.3% |
| Q3 | 1921 | 49.20 | 6.6% [5.5%, 7.8%; N=1921] | 7.2% |
| Q4 | 1920 | 70.46 | 3.8% [3.0%, 4.8%; N=1920] | 4.3% |

- Q4−Q1 B5死亡率差（職内centered、正規近似CI）: -7.9pt [-9.5, -6.3]
- trend test: class-stratified Cochran-Armitage、z=-9.417、減少方向 p<0.0001、増加方向 p=1.0000

| 隣接 | 差（次−前、正規95% CI） | 判定 |
| --- | --- | --- |
| Q1→Q2 | -4.4pt [-6.2, -2.5] | 統計的減少 |
| Q2→Q3 | -0.8pt [-2.4, 0.8] | 点推定減少（CIは0を跨ぐ） |
| Q3→Q4 | -2.8pt [-4.2, -1.4] | 統計的減少 |

- 統計的非単調（隣接差CI下限>0）: 確認なし
- 条件: Q4−Q1 CI上限<0=成立 / Q1→Q4単調減少=成立 / 職内centered=成立
- A1判定: **成立**

職内判定の確認:

- 戦士: Q4−Q1=0.0pt [-1.3, 1.3], A1=不成立
- 盗賊: Q4−Q1=-1.8pt [-4.1, 0.4], A1=不成立
- 僧侶: Q4−Q1=-10.3pt [-15.4, -5.3], A1=成立
- 魔術師: Q4−Q1=-22.6pt [-27.1, -18.1], A1=成立

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

- trap: encounter=565880, activation=406741, disarm=139207, damageHP=1040529.0。
- TOWN_PORTAL: use=7300。status cure: {"ANTIDOTE":15295,"HOLY_WATER":3568,"PANACEA":2348,"EYE_DROPS":931}, cured=22142。
- identification: count=137263, powderUsed=136614。
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
- source commit: `373980411fc44a5f5da119d44e8feacd2a78f3a3`
- origin/main ancestor: yes
- stale tree override: none

## 実行記録


```sh
node --check scratch/sim_issue_461_baseline.js
SIM_RUNS=3000 SIM_CALIBRATION_RUNS=1000 node scratch/sim_issue_461_baseline.js
```

- calibration wall-clock: 122.797s
- simulation wall-clock: 47.184s
- total wall-clock（単純合計）: 169.981s
- total CPU（user+system）: 858.443s
- raw JSONL SHA-256: `8786d7b113e72714909fc5957348cec681bda121a4a7ba8b22261bea1f9745fe`
- summary JSON SHA-256: `a9fabc14cb6bc050433f53493f91f56e44b424d9fb52b8ea276d4296792fe05b`

## 採らなかった完成定義

- `core 1個以上 + スロット充足`: core装備率を35〜40%目標の別指標で使うため二重定義。
- `core + 対応support`: #445で成立率9.5%→71.1%にしてもB5 endpointが動かず、判定力なし。

## 検証

- `node scratch/test_sim_reward_paths.js`
- `npm run lint`
- `npm run test:unit`

Refs #461
