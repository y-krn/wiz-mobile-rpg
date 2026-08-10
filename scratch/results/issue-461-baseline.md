# Issue #461 基本4職 基準線

## 結論

職内 `combatBuildScore` Q4 は A1 の3条件を満たさない。完成ビルド定義は未採用、再定義が必要。

| 職業 | 初回B1突破 | B1 entrant | B1突破 | B1死亡 | B1撤退 | B5 entrant | B5突破 | B5死亡 | B5撤退 | B10 entrant | B10突破 | B10死亡 | B10撤退 | 全run平均到達floor |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 戦士 | 25.7% [24.2%, 27.3%; N=3000] | 100.0% [99.9%, 100.0%; N=3000] | 95.2% [94.3%, 95.9%; N=3000] | 4.8% [4.1%, 5.7%; N=3000] | 0.0% [0.0%, 0.1%; N=3000] | 7.3% [6.5%, 8.3%; N=3000] | 1.8% [0.7%, 4.6%; N=220] | 8.6% [5.6%, 13.1%; N=220] | 89.5% [84.8%, 92.9%; N=220] | 0.0% [0.0%, 0.1%; N=3000] | 未観測 [N=0] | 未観測 [N=0] | 未観測 [N=0] | 3.15 [3.11, 3.18; N=3000] |
| 盗賊 | 62.8% [61.0%, 64.5%; N=3000] | 100.0% [99.9%, 100.0%; N=3000] | 92.3% [91.3%, 93.2%; N=3000] | 7.7% [6.8%, 8.7%; N=3000] | 0.0% [0.0%, 0.1%; N=3000] | 38.3% [36.5%, 40.0%; N=3000] | 15.9% [13.9%, 18.1%; N=1148] | 21.4% [19.2%, 23.9%; N=1148] | 62.7% [59.9%, 65.5%; N=1148] | 1.0% [0.7%, 1.4%; N=3000] | 17.2% [7.6%, 34.5%; N=29] 未確定 | 10.3% [3.6%, 26.4%; N=29] 未確定 | 72.4% [54.3%, 85.3%; N=29] 未確定 | 3.92 [3.86, 3.98; N=3000] |
| 僧侶 | 45.7% [44.0%, 47.5%; N=3000] | 100.0% [99.9%, 100.0%; N=3000] | 78.3% [76.8%, 79.7%; N=3000] | 21.7% [20.3%, 23.2%; N=3000] | 0.0% [0.0%, 0.1%; N=3000] | 42.8% [41.0%, 44.5%; N=3000] | 64.3% [61.6%, 66.9%; N=1283] | 34.9% [32.4%, 37.6%; N=1283] | 0.8% [0.4%, 1.4%; N=1283] | 9.7% [8.7%, 10.8%; N=3000] | 44.7% [39.1%, 50.4%; N=291] | 14.8% [11.2%, 19.3%; N=291] | 40.5% [35.1%, 46.3%; N=291] | 4.45 [4.34, 4.56; N=3000] |
| 魔術師 | 32.4% [30.7%, 34.1%; N=3000] | 100.0% [99.9%, 100.0%; N=3000] | 93.1% [92.2%, 94.0%; N=3000] | 6.9% [6.0%, 7.8%; N=3000] | 0.0% [0.0%, 0.1%; N=3000] | 5.1% [4.4%, 6.0%; N=3000] | 0.6% [0.1%, 3.6%; N=154] | 12.3% [8.0%, 18.5%; N=154] | 87.0% [80.8%, 91.4%; N=154] | 0.0% [0.0%, 0.1%; N=3000] | 未観測 [N=0] | 未観測 [N=0] | 未観測 [N=0] | 3.10 [3.07, 3.14; N=3000] |

初回ランは素材0・出発クラフトなし。各 floor の突破・死亡・撤退は entrant を分母とし、3内訳の合計は100%。死亡は `deathFloor === floor`（その階でちょうど死亡）であり、到達後に後続階で死亡した run は突破へ入る。撤退は entrant かつ突破/死亡でない run。B1撤退0%は `PORTAL_MIN_FLOOR=3` のため。率は Wilson 95% CI、平均は正規近似95% CI。

## 完成ビルド率 / core装備率

| 対象 | Q4完成率 / 全run | Q4 / B5 entrant | core装備率（終了時1個以上） |
| --- | --- | --- | --- |
| 4職合算 | 5.8% [5.4%, 6.3%; N=12000] | 25.0% [23.4%, 26.6%; N=2805] | 69.0% [68.2%, 69.8%; N=12000] |
| 戦士 | 1.8% [1.4%, 2.4%; N=3000] | 25.0% [19.7%, 31.1%; N=220] | 66.4% [64.7%, 68.0%; N=3000] |
| 盗賊 | 9.6% [8.6%, 10.7%; N=3000] | 25.0% [22.6%, 27.6%; N=1148] | 76.7% [75.2%, 78.2%; N=3000] |
| 僧侶 | 10.7% [9.6%, 11.8%; N=3000] | 24.9% [22.7%, 27.4%; N=1283] | 64.3% [62.5%, 66.0%; N=3000] |
| 魔術師 | 1.3% [0.9%, 1.7%; N=3000] | 24.7% [18.5%, 32.0%; N=154] | 68.7% [67.1%, 70.4%; N=3000] |

Q4完成率の主値は Q4 / 全run。Q4 / B5 entrant は quartile定義上の監査値（約25%）。core装備率は終了時 `finalCoreIds.length >= 1` / 全run。

## A1

### 4職合算

| Q | N | combatBuildScore平均 | B5死亡率（deathFloor===5; Wilson 95% CI） | 職内centered率 |
| ---: | ---: | ---: | --- | ---: |
| Q1 | 702 | 30.88 | 32.8% [29.4%, 36.3%; N=702] | 25.0% |
| Q2 | 701 | 39.31 | 26.2% [23.1%, 29.6%; N=701] | 19.9% |
| Q3 | 702 | 49.78 | 21.2% [18.4%, 24.4%; N=702] | 15.4% |
| Q4 | 700 | 70.86 | 24.1% [21.1%, 27.4%; N=700] | 17.0% |

- Q4−Q1 B5死亡率差（職内centered、正規近似CI）: -8.6pt [-13.2, -4.0]
- 条件: Q4−Q1 CI上限<0=成立 / Q1→Q4単調減少=不成立 / 職内centered=成立
- A1判定: **不成立（Q4定義を採用しない）**

職内判定の確認:

- 戦士: Q4−Q1=-7.3pt [-19.0, 4.4], A1=不成立
- 盗賊: Q4−Q1=-7.0pt [-13.9, -0.1], A1=不成立
- 僧侶: Q4−Q1=-10.5pt [-18.0, -3.0], A1=不成立
- 魔術師: Q4−Q1=-7.5pt [-21.9, 6.9], A1=不成立

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

- trap: encounter=269570, activation=209717, disarm=53744, damageHP=711325.0。
- TOWN_PORTAL: use=6197。status cure: {"ANTIDOTE":7206,"PANACEA":164,"EYE_DROPS":318,"HOLY_WATER":117}, cured=7805。
- identification: count=79645, powderUsed=79397。
- モデル: `generateRunFloor`、罠の発見/解除/被弾、`TOWN_PORTAL`、状態異常治療消耗品、鑑定粉、現行戦闘/報酬/装備更新、現行 departure kit。
- 省略: 任意の節目商人での鑑定粉購入（未観測・自動購入なし） / 人間の敵別判断、任意寄り道、テレポーター移動先の再経路化 / 上薬・MP・強化アイテムの能動使用 / 上級職4種。


## 固定条件

```text
BLOOD_WAND_HP_PAYMENT_MIN_RATE=0.50
CI=<unset>
DEPARTURE_CRAFT_IDS=TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION
ELITE_POLICY=avoid
FLEE_HP_THRESHOLD=0.35
FLEE_POLICY=threshold
HEAL_POTION_MERCHANT_POLICY=missing
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

- env hash: `e79d51f4d7ce5e701e0e73db97afc9ee051d609b9a652e278ab84b0518897bda`
- scenario: workshop-empty, workshop-stats, workshop-gear, workshop-blood-wand, workshop-blood-wand-spells, workshop-complete
- targetDepth: initial=2 / baseline=21（B20終了まで）
- resolved parallelism: 15（availableParallelism=15, SIM_PARALLEL未指定、CI=<unset>）
- `SIM_MAP_CACHE_ENTRIES`未指定。既定1024。

## 実行記録

```sh
node --check scratch/sim_issue_461_baseline.js
SIM_RUNS=3000 SIM_CALIBRATION_RUNS=1000 node scratch/sim_issue_461_baseline.js
```

- calibration wall-clock: 87.220s
- simulation wall-clock: 30.188s
- total wall-clock（単純合計）: 117.408s
- total CPU（user+system）: 561.409s
- raw JSONL SHA-256: `560673693bdff8e87895faf12b88fcfe4e977c99e19c2a5f23d5907d81138cc0`
- summary JSON SHA-256: `81fa80b96eb8aeac5a28f21815a6bf7ecddab15557d2eeb6b8a9a3965b1cf966`

## 採らなかった完成定義

- `core 1個以上 + スロット充足`: core装備率を35〜40%目標の別指標で使うため二重定義。
- `core + 対応support`: #445で成立率9.5%→71.1%にしてもB5 endpointが動かず、判定力なし。

## 検証

- `node scratch/test_sim_reward_paths.js`
- `npm run lint`
- `npm run test:unit`

Refs #461
