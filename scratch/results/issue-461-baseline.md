# Issue #461 基本4職 基準線

## 結論

職内 `combatBuildScore` Q4 は A1 の3条件を満たさない。完成ビルド定義は未採用、再定義が必要。

| 職業 | 初回B1突破 | B1 entrant | B1突破 | B1死亡 | B1撤退 | B5 entrant | B5突破 | B5死亡 | B5撤退 | B10 entrant | B10突破 | B10死亡 | B10撤退 | 全run平均到達floor |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 戦士 | 28.9% [27.3%, 30.5%; N=3000] | 100.0% [99.9%, 100.0%; N=3000] | 93.6% [92.7%, 94.5%; N=3000] | 6.4% [5.5%, 7.3%; N=3000] | 0.0% [0.0%, 0.1%; N=3000] | 10.5% [9.5%, 11.6%; N=3000] | 8.3% [5.7%, 11.8%; N=315] | 7.3% [4.9%, 10.7%; N=315] | 84.4% [80.0%, 88.0%; N=315] | 0.1% [0.1%, 0.3%; N=3000] | 25.0% [4.6%, 69.9%; N=4] 未確定 | 0.0% [0.0%, 49.0%; N=4] 未確定 | 75.0% [30.1%, 95.4%; N=4] 未確定 | 3.15 [3.11, 3.19; N=3000] |
| 盗賊 | 67.5% [65.8%, 69.2%; N=3000] | 100.0% [99.9%, 100.0%; N=3000] | 95.3% [94.5%, 96.0%; N=3000] | 4.7% [4.0%, 5.5%; N=3000] | 0.0% [0.0%, 0.1%; N=3000] | 52.2% [50.4%, 54.0%; N=3000] | 39.6% [37.2%, 42.1%; N=1567] | 7.6% [6.4%, 9.0%; N=1567] | 52.8% [50.3%, 55.2%; N=1567] | 6.8% [5.9%, 7.7%; N=3000] | 22.7% [17.4%, 28.9%; N=203] | 10.3% [6.9%, 15.3%; N=203] | 67.0% [60.3%, 73.1%; N=203] | 4.77 [4.68, 4.85; N=3000] |
| 僧侶 | 34.1% [32.4%, 35.8%; N=3000] | 100.0% [99.9%, 100.0%; N=3000] | 79.5% [78.1%, 80.9%; N=3000] | 20.5% [19.1%, 21.9%; N=3000] | 0.0% [0.0%, 0.1%; N=3000] | 32.4% [30.8%, 34.1%; N=3000] | 70.7% [67.8%, 73.5%; N=973] | 29.2% [26.4%, 32.1%; N=973] | 0.1% [0.0%, 0.6%; N=973] | 15.1% [13.8%, 16.4%; N=3000] | 78.1% [74.1%, 81.7%; N=452] | 16.2% [13.0%, 19.8%; N=452] | 5.8% [4.0%, 8.3%; N=452] | 4.52 [4.38, 4.65; N=3000] |
| 魔術師 | 29.2% [27.6%, 30.9%; N=3000] | 100.0% [99.9%, 100.0%; N=3000] | 91.2% [90.1%, 92.2%; N=3000] | 8.8% [7.8%, 9.9%; N=3000] | 0.0% [0.0%, 0.1%; N=3000] | 5.4% [4.6%, 6.2%; N=3000] | 9.3% [5.7%, 14.8%; N=161] | 24.2% [18.3%, 31.4%; N=161] | 66.5% [58.9%, 73.3%; N=161] | 0.0% [0.0%, 0.1%; N=3000] | 未観測 [N=0] | 未観測 [N=0] | 未観測 [N=0] | 2.89 [2.85, 2.93; N=3000] |

初回ランは素材0・出発クラフトなし。各 floor の突破・死亡・撤退は entrant を分母とし、3内訳の合計は100%。死亡は `deathFloor === floor`（その階でちょうど死亡）であり、到達後に後続階で死亡した run は突破へ入る。撤退は entrant かつ突破/死亡でない run。B1撤退0%は `PORTAL_MIN_FLOOR=3` のため。率は Wilson 95% CI、平均は正規近似95% CI。

## 完成ビルド率 / core装備率

| 対象 | Q4完成率 / 全run | Q4 / B5 entrant | core装備率（終了時1個以上） |
| --- | --- | --- | --- |
| 4職合算 | 6.3% [5.8%, 6.7%; N=12000] | 24.9% [23.4%, 26.5%; N=3016] | 67.0% [66.1%, 67.8%; N=12000] |
| 戦士 | 2.6% [2.1%, 3.2%; N=3000] | 24.8% [20.3%, 29.8%; N=315] | 69.5% [67.9%, 71.2%; N=3000] |
| 盗賊 | 13.0% [11.9%, 14.3%; N=3000] | 25.0% [22.9%, 27.2%; N=1567] | 85.1% [83.8%, 86.4%; N=3000] |
| 僧侶 | 8.1% [7.2%, 9.1%; N=3000] | 25.0% [22.4%, 27.8%; N=973] | 62.6% [60.9%, 64.3%; N=3000] |
| 魔術師 | 1.3% [1.0%, 1.8%; N=3000] | 24.8% [18.8%, 32.1%; N=161] | 50.7% [48.9%, 52.5%; N=3000] |

Q4完成率の主値は Q4 / 全run。Q4 / B5 entrant は quartile定義上の監査値（約25%）。core装備率は終了時 `finalCoreIds.length >= 1` / 全run。

## A1

### 4職合算

| Q | N | combatBuildScore平均 | B5死亡率（deathFloor===5; Wilson 95% CI） | 職内centered率 |
| ---: | ---: | ---: | --- | ---: |
| Q1 | 756 | 31.63 | 18.5% [15.9%, 21.4%; N=756] | 19.6% |
| Q2 | 754 | 40.85 | 17.9% [15.3%, 20.8%; N=754] | 19.2% |
| Q3 | 754 | 51.25 | 13.4% [11.1%, 16.0%; N=754] | 14.1% |
| Q4 | 752 | 71.59 | 11.8% [9.7%, 14.3%; N=752] | 15.4% |

- Q4−Q1 B5死亡率差（職内centered、正規近似CI）: -6.7pt [-10.1, -3.2]
- 条件: Q4−Q1 CI上限<0=成立 / Q1→Q4単調減少=不成立 / 職内centered=成立
- A1判定: **不成立（Q4定義を採用しない）**

職内判定の確認:

- 戦士: Q4−Q1=-1.2pt [-9.8, 7.5], A1=不成立
- 盗賊: Q4−Q1=-3.0pt [-6.6, 0.5], A1=不成立
- 僧侶: Q4−Q1=-15.9pt [-23.8, -8.0], A1=成立
- 魔術師: Q4−Q1=3.1pt [-16.2, 22.4], A1=不成立

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

- trap: encounter=294330, activation=202868, disarm=83408, damageHP=792503.0。
- TOWN_PORTAL: use=5030。status cure: {"ANTIDOTE":10568,"EYE_DROPS":1265,"HOLY_WATER":1357,"PANACEA":1327}, cured=14517。
- identification: count=83491, powderUsed=83167。
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
node --check scratch/sim_issue_461_baseline.js
SIM_RUNS=3000 SIM_CALIBRATION_RUNS=1000 node scratch/sim_issue_461_baseline.js
```

- calibration wall-clock: 101.663s
- simulation wall-clock: 34.487s
- total wall-clock（単純合計）: 136.149s
- total CPU（user+system）: 640.347s
- raw JSONL SHA-256: `a0b882dfff27caf88214feda416cfa71f5e4cc7f735500446999b4d19e2b56b8`
- summary JSON SHA-256: `34432ab3ac91fa1f07095f7fb67c27091281a1de5dd8140f68171a6da1d0ea6f`

## 採らなかった完成定義

- `core 1個以上 + スロット充足`: core装備率を35〜40%目標の別指標で使うため二重定義。
- `core + 対応support`: #445で成立率9.5%→71.1%にしてもB5 endpointが動かず、判定力なし。

## 検証

- `node scratch/test_sim_reward_paths.js`
- `npm run lint`
- `npm run test:unit`

Refs #461
