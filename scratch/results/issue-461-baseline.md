# Issue #461 基本4職 基準線

## 結論

職内 `combatBuildScore` Q4 は A1 の3条件を満たす。完成ビルド定義として採用可能。

| 職業 | 初回B1突破 | B1 entrant | B1突破 | B1死亡 | B1撤退 | B5 entrant | B5突破 | B5死亡 | B5撤退 | B10 entrant | B10突破 | B10死亡 | B10撤退 | 全run平均到達floor |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 戦士 | 64.1% [62.4%, 65.8%; N=3000] | 100.0% [99.9%, 100.0%; N=3000] | 98.0% [97.4%, 98.4%; N=3000] | 2.0% [1.6%, 2.6%; N=3000] | 0.0% [0.0%, 0.1%; N=3000] | 76.1% [74.5%, 77.6%; N=3000] | 65.4% [63.5%, 67.4%; N=2283] | 1.3% [0.9%, 1.8%; N=2283] | 33.3% [31.4%, 35.2%; N=2283] | 27.9% [26.3%, 29.5%; N=3000] | 52.2% [48.8%, 55.6%; N=837] | 2.9% [1.9%, 4.2%; N=837] | 44.9% [41.6%, 48.3%; N=837] | 7.12 [6.99, 7.25; N=3000] |
| 盗賊 | 74.1% [72.5%, 75.6%; N=3000] | 100.0% [99.9%, 100.0%; N=3000] | 96.5% [95.8%, 97.1%; N=3000] | 3.5% [2.9%, 4.2%; N=3000] | 0.0% [0.0%, 0.1%; N=3000] | 72.7% [71.1%, 74.3%; N=3000] | 60.0% [57.9%, 62.0%; N=2182] | 4.0% [3.3%, 4.9%; N=2182] | 36.0% [34.0%, 38.0%; N=2182] | 19.2% [17.8%, 20.6%; N=3000] | 31.6% [27.9%, 35.5%; N=576] | 10.4% [8.2%, 13.2%; N=576] | 58.0% [53.9%, 62.0%; N=576] | 6.27 [6.16, 6.37; N=3000] |
| 僧侶 | 38.5% [36.7%, 40.2%; N=3000] | 100.0% [99.9%, 100.0%; N=3000] | 85.2% [83.9%, 86.5%; N=3000] | 14.8% [13.5%, 16.1%; N=3000] | 0.0% [0.0%, 0.1%; N=3000] | 43.7% [41.9%, 45.5%; N=3000] | 87.5% [85.6%, 89.2%; N=1311] | 12.5% [10.8%, 14.4%; N=1311] | 0.0% [0.0%, 0.3%; N=1311] | 27.5% [25.9%, 29.1%; N=3000] | 89.6% [87.3%, 91.5%; N=825] | 7.8% [6.1%, 9.8%; N=825] | 2.7% [1.8%, 4.0%; N=825] | 6.30 [6.12, 6.49; N=3000] |
| 魔術師 | 65.7% [63.9%, 67.3%; N=3000] | 100.0% [99.9%, 100.0%; N=3000] | 97.3% [96.6%, 97.8%; N=3000] | 2.7% [2.2%, 3.4%; N=3000] | 0.0% [0.0%, 0.1%; N=3000] | 75.3% [73.7%, 76.8%; N=3000] | 57.8% [55.8%, 59.9%; N=2258] | 10.4% [9.2%, 11.7%; N=2258] | 31.8% [29.9%, 33.7%; N=2258] | 28.0% [26.4%, 29.6%; N=3000] | 77.4% [74.4%, 80.1%; N=840] | 4.3% [3.1%, 5.9%; N=840] | 18.3% [15.9%, 21.1%; N=840] | 7.63 [7.45, 7.81; N=3000] |

初回ランは素材0・出発クラフトなし。各 floor の突破・死亡・撤退は entrant を分母とし、3内訳の合計は100%。死亡は `deathFloor === floor`（その階でちょうど死亡）であり、到達後に後続階で死亡した run は突破へ入る。撤退は entrant かつ突破/死亡でない run。B1撤退0%は `PORTAL_MIN_FLOOR=3` のため。率は Wilson 95% CI、平均は正規近似95% CI。

## 完成ビルド率 / core装備率

| 対象 | Q4完成率 / 全run | Q4 / B5 entrant | core装備率（終了時1個以上） |
| --- | --- | --- | --- |
| 4職合算 | 16.7% [16.1%, 17.4%; N=12000] | 25.0% [24.0%, 25.9%; N=8034] | 86.5% [85.9%, 87.1%; N=12000] |
| 戦士 | 19.0% [17.6%, 20.4%; N=3000] | 25.0% [23.2%, 26.8%; N=2283] | 94.1% [93.2%, 94.9%; N=3000] |
| 盗賊 | 18.2% [16.8%, 19.6%; N=3000] | 25.0% [23.2%, 26.8%; N=2182] | 91.3% [90.3%, 92.3%; N=3000] |
| 僧侶 | 10.9% [9.8%, 12.1%; N=3000] | 24.9% [22.7%, 27.4%; N=1311] | 71.4% [69.8%, 73.0%; N=3000] |
| 魔術師 | 18.8% [17.4%, 20.2%; N=3000] | 25.0% [23.2%, 26.8%; N=2258] | 89.3% [88.1%, 90.4%; N=3000] |

Q4完成率の主値は Q4 / 全run。Q4 / B5 entrant は quartile定義上の監査値（約25%）。core装備率は終了時 `finalCoreIds.length >= 1` / 全run。

## A1

### 4職合算

| Q | N | combatBuildScore平均 | B5死亡率（deathFloor===5; Wilson 95% CI） | 職内centered率 |
| ---: | ---: | ---: | --- | ---: |
| Q1 | 2010 | 28.79 | 9.8% [8.6%, 11.2%; N=2010] | 10.6% |
| Q2 | 2008 | 37.77 | 6.7% [5.7%, 7.8%; N=2008] | 7.5% |
| Q3 | 2010 | 48.19 | 5.4% [4.5%, 6.5%; N=2010] | 5.9% |
| Q4 | 2006 | 69.33 | 3.7% [3.0%, 4.7%; N=2006] | 4.1% |

- Q4−Q1 B5死亡率差（職内centered、正規近似CI）: -6.1pt [-7.6, -4.5]
- trend test: class-stratified Cochran-Armitage、z=-8.084、減少方向 p<0.0001、増加方向 p=1.0000

| 隣接 | 差（次−前、正規95% CI） | 判定 |
| --- | --- | --- |
| Q1→Q2 | -3.1pt [-4.8, -1.4] | 統計的減少 |
| Q2→Q3 | -1.3pt [-2.7, 0.2] | 点推定減少（CIは0を跨ぐ） |
| Q3→Q4 | -1.7pt [-3.0, -0.4] | 統計的減少 |

- 統計的非単調（隣接差CI下限>0）: 確認なし
- 条件: Q4−Q1 CI上限<0=成立 / Q1→Q4単調減少=成立 / 職内centered=成立
- A1判定: **成立**

職内判定の確認:

- 戦士: Q4−Q1=0.0pt [-1.3, 1.3], A1=不成立
- 盗賊: Q4−Q1=-1.8pt [-4.1, 0.5], A1=不成立
- 僧侶: Q4−Q1=-10.6pt [-15.7, -5.6], A1=成立
- 魔術師: Q4−Q1=-13.6pt [-17.3, -9.9], A1=成立

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

- trap: encounter=637447, activation=470567, disarm=144526, damageHP=1044244.0。
- TOWN_PORTAL: use=7177。status cure: {"ANTIDOTE":15673,"HOLY_WATER":3966,"PANACEA":2447,"EYE_DROPS":920}, cured=23006。
- identification: count=145749, powderUsed=145044。
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
- source commit: `f483355c9ccc75fd32251a77a3e77fb809b9a669`
- origin/main ancestor: yes
- stale tree override: none

## 実行記録


```sh
node --check scratch/sim_issue_461_baseline.js
SIM_RUNS=3000 SIM_CALIBRATION_RUNS=1000 node scratch/sim_issue_461_baseline.js
```

- calibration wall-clock: 136.692s
- simulation wall-clock: 52.971s
- total wall-clock（単純合計）: 189.662s
- total CPU（user+system）: 938.313s
- raw JSONL SHA-256: `63e01eae49f76340a651b5c2930eccf68608d33df7e95d59be79f9798efc678f`
- summary JSON SHA-256: `8740ca26d308e18590712237d74946406d264ec01fa458b5c58712127dca309b`

## 採らなかった完成定義

- `core 1個以上 + スロット充足`: core装備率を35〜40%目標の別指標で使うため二重定義。
- `core + 対応support`: #445で成立率9.5%→71.1%にしてもB5 endpointが動かず、判定力なし。

## 検証

- `node scratch/test_sim_reward_paths.js`
- `npm run lint`
- `npm run test:unit`

Refs #461
