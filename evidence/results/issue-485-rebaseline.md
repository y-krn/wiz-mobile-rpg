# Issue #461 基本4職 基準線

## 結論

職内 `combatBuildScore` Q4 は A1 の3条件を満たす。完成ビルド定義として採用可能。

| 職業 | 初回B1突破 | B1 entrant | B1突破 | B1死亡 | B1撤退 | B5 entrant | B5突破 | B5死亡 | B5撤退 | B10 entrant | B10突破 | B10死亡 | B10撤退 | 全run平均到達floor |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 戦士 | 27.1% [25.6%, 28.8%; N=3000] | 100.0% [99.9%, 100.0%; N=3000] | 92.6% [91.6%, 93.5%; N=3000] | 7.4% [6.5%, 8.4%; N=3000] | 0.0% [0.0%, 0.1%; N=3000] | 9.2% [8.2%, 10.3%; N=3000] | 8.7% [5.9%, 12.6%; N=277] | 6.5% [4.1%, 10.0%; N=277] | 84.8% [80.1%, 88.6%; N=277] | 0.1% [0.1%, 0.3%; N=3000] | 25.0% [4.6%, 69.9%; N=4] 未確定 | 50.0% [15.0%, 85.0%; N=4] 未確定 | 25.0% [4.6%, 69.9%; N=4] 未確定 | 3.08 [3.04, 3.12; N=3000] |
| 盗賊 | 64.1% [62.4%, 65.8%; N=3000] | 100.0% [99.9%, 100.0%; N=3000] | 92.0% [91.0%, 92.9%; N=3000] | 8.0% [7.1%, 9.0%; N=3000] | 0.0% [0.0%, 0.1%; N=3000] | 41.3% [39.6%, 43.1%; N=3000] | 19.3% [17.2%, 21.6%; N=1240] | 24.3% [22.0%, 26.7%; N=1240] | 56.5% [53.7%, 59.2%; N=1240] | 3.0% [2.4%, 3.6%; N=3000] | 23.6% [16.0%, 33.4%; N=89] | 11.2% [6.2%, 19.5%; N=89] | 65.2% [54.8%, 74.3%; N=89] | 4.08 [4.01, 4.15; N=3000] |
| 僧侶 | 45.4% [43.6%, 47.2%; N=3000] | 100.0% [99.9%, 100.0%; N=3000] | 75.0% [73.5%, 76.5%; N=3000] | 25.0% [23.5%, 26.5%; N=3000] | 0.0% [0.0%, 0.1%; N=3000] | 36.9% [35.2%, 38.7%; N=3000] | 59.1% [56.2%, 62.0%; N=1108] | 40.3% [37.4%, 43.2%; N=1108] | 0.6% [0.3%, 1.3%; N=1108] | 12.0% [10.9%, 13.2%; N=3000] | 63.1% [58.0%, 67.9%; N=360] | 11.1% [8.3%, 14.8%; N=360] | 25.8% [21.6%, 30.6%; N=360] | 4.25 [4.13, 4.37; N=3000] |
| 魔術師 | 34.0% [32.3%, 35.7%; N=3000] | 100.0% [99.9%, 100.0%; N=3000] | 89.5% [88.3%, 90.5%; N=3000] | 10.5% [9.5%, 11.7%; N=3000] | 0.0% [0.0%, 0.1%; N=3000] | 6.6% [5.7%, 7.5%; N=3000] | 3.6% [1.7%, 7.2%; N=197] | 15.7% [11.3%, 21.5%; N=197] | 80.7% [74.6%, 85.6%; N=197] | 0.0% [0.0%, 0.2%; N=3000] | 0.0% [0.0%, 79.3%; N=1] 未確定 | 0.0% [0.0%, 79.3%; N=1] 未確定 | 100.0% [20.7%, 100.0%; N=1] 未確定 | 2.97 [2.93, 3.01; N=3000] |

初回ランは素材0・出発クラフトなし。各 floor の突破・死亡・撤退は entrant を分母とし、3内訳の合計は100%。死亡は `deathFloor === floor`（その階でちょうど死亡）であり、到達後に後続階で死亡した run は突破へ入る。撤退は entrant かつ突破/死亡でない run。B1撤退0%は `PORTAL_MIN_FLOOR=3` のため。率は Wilson 95% CI、平均は正規近似95% CI。

## 完成ビルド率 / core装備率

| 対象 | Q4完成率 / 全run | Q4 / B5 entrant | core装備率（終了時1個以上） |
| --- | --- | --- | --- |
| 4職合算 | 5.9% [5.5%, 6.3%; N=12000] | 25.0% [23.4%, 26.6%; N=2822] | 66.9% [66.1%, 67.8%; N=12000] |
| 戦士 | 2.3% [1.8%, 2.9%; N=3000] | 24.9% [20.2%, 30.3%; N=277] | 64.6% [62.9%, 66.3%; N=3000] |
| 盗賊 | 10.3% [9.3%, 11.5%; N=3000] | 25.0% [22.7%, 27.5%; N=1240] | 77.9% [76.4%, 79.4%; N=3000] |
| 僧侶 | 9.2% [8.2%, 10.3%; N=3000] | 25.0% [22.5%, 27.6%; N=1108] | 60.1% [58.3%, 61.8%; N=3000] |
| 魔術師 | 1.6% [1.2%, 2.2%; N=3000] | 24.9% [19.4%, 31.4%; N=197] | 65.1% [63.4%, 66.8%; N=3000] |

Q4完成率の主値は Q4 / 全run。Q4 / B5 entrant は quartile定義上の監査値（約25%）。core装備率は終了時 `finalCoreIds.length >= 1` / 全run。

## A1

### 4職合算

| Q | N | combatBuildScore平均 | B5死亡率（deathFloor===5; Wilson 95% CI） | 職内centered率 |
| ---: | ---: | ---: | --- | ---: |
| Q1 | 707 | 31.06 | 34.9% [31.5%, 38.5%; N=707] | 25.9% |
| Q2 | 705 | 39.99 | 29.9% [26.7%, 33.4%; N=705] | 22.1% |
| Q3 | 705 | 50.07 | 23.4% [20.4%, 26.7%; N=705] | 19.7% |
| Q4 | 705 | 70.70 | 24.5% [21.5%, 27.8%; N=705] | 19.1% |

- Q4−Q1 B5死亡率差（職内centered、正規近似CI）: -10.4pt [-15.0, -5.9]
- 条件: Q4−Q1 CI上限<0=成立 / Q1→Q4単調減少=成立 / 職内centered=成立
- A1判定: **成立**

職内判定の確認:

- 戦士: Q4−Q1=-7.1pt [-14.3, 0.1], A1=不成立
- 盗賊: Q4−Q1=-9.4pt [-16.1, -2.6], A1=不成立
- 僧侶: Q4−Q1=-15.2pt [-23.3, -7.0], A1=不成立
- 魔術師: Q4−Q1=4.4pt [-10.3, 19.0], A1=不成立

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

- trap: encounter=266804, activation=190273, disarm=69776, damageHP=737157.0。
- TOWN_PORTAL: use=5481。status cure: {"ANTIDOTE":6621,"HOLY_WATER":158,"PANACEA":169,"EYE_DROPS":350}, cured=7298。
- identification: count=78246, powderUsed=77948。
- モデル: `generateRunFloor`、罠の発見/解除/被弾、`TOWN_PORTAL`、状態異常治療消耗品、鑑定粉、上薬（`GREATER_HEAL`）能動使用、現行戦闘/報酬/装備更新、現行 departure kit。
- 省略: 任意の節目商人での鑑定粉購入（未観測・自動購入なし） / 人間の敵別判断、任意寄り道、テレポーター移動先の再経路化 / MP・強化アイテムの能動使用 / 上級職4種。


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
node --check scratch/simulations/sim_issue_461_baseline.js
SIM_RUNS=3000 SIM_CALIBRATION_RUNS=1000 node scratch/simulations/sim_issue_461_baseline.js
```

- calibration wall-clock: 89.625s
- simulation wall-clock: 31.613s
- total wall-clock（単純合計）: 121.238s
- total CPU（user+system）: 586.141s
- raw JSONL SHA-256: `ead737b0eb771da6a28d50fcac61572a7a34413c1925fcc13d33636978bd0391`
- summary JSON SHA-256: `202aae1dac74e448f42d1d181fbd3ed18c679df7e32f85f1d8ed2cef5fb6b598`

## #475 A3 cross-check

同じ基準線の B5 entrant N=2,822をcore個数（0 / 1 / 2 / 3+）で再集計した。
職内centered ordinal slope は breakthrough **+2.9pt [+1.0, +4.8]**、death
**−2.2pt [−4.1, −0.2]**、平均floor **+0.230 [+0.131, +0.328]**。
3 endpointともCIが0を跨がず、#475/#271のA3維持と整合する。N<30の個別levelは未確定扱い。
このcross-checkは本基準線の同一run出力からの派生集計で、base simulationのbalance値は変更しない。

## 採らなかった完成定義

- `core 1個以上 + スロット充足`: core装備率を35〜40%目標の別指標で使うため二重定義。
- `core + 対応support`: #445で成立率9.5%→71.1%にしてもB5 endpointが動かず、判定力なし。

## 検証

- `node scratch/tests/regression/test_sim_reward_paths.js`
- `npm run lint`
- `npm run test:unit`

Refs #461
