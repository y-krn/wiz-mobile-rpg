# Issue #510 B10受入基準移行測定

## 判定: B5代理を残す

A1のCI/単調減少条件が未成立。A3は3 endpoint全てのCI条件が未成立

B10 entrantは既にB10到達できたrunだけの選別集団。全runのビルド質分布と異なるため、B10内の相関・core個数差は因果効果ではなく、`deathFloor === floor`のトートロジーと同種の選別罠を含む。

## 測定対象

- seed=461、4職×各N=3000、calibration N=1000、6工房状態。B10 entrant分母固定。
- `combatBuildScore`はB10 floor-startの職内Q1〜Q4。A1死亡endpointは`deathFloor===10`。
- B10 build観測点: floor-start=3030、finish fallback=25（floor 9→10直後にportal終了しfloor-start snapshotが無い14件を診断再実行で補完）。
- A3はB10 floor-startのcombat core個数0/1/2/3+。突破/死亡はB10 entrant内、終了到達floorは同じB10 entrant内の`reachedFloor`。
- `generateRunFloor`を経由する`simulateRun`、`TOWN_PORTAL`、状態異常治療、鑑定粉、現行戦闘/報酬/装備更新、現行departure kitをモデル化。上級4職、任意寄り道、MP/強化アイテム能動使用は#461と同じく省略。

## B10 entrant実測

- 4職合算B10 entrant実数: 3055/12000 = 25.46%
- 4職合算 entrant: 25.5% [24.7%, 26.2%; N=12000]
  - 突破: 61.9% [60.1%, 63.6%; N=3055]
  - 死亡（deathFloor===10）: 6.2% [5.4%, 7.1%; N=3055]
  - 撤退: 32.0% [30.4%, 33.7%; N=3055]

| 職 | B10 entrant | 実数 | 平均到達floor（全run） | B10 entrant内平均floor | quartile N(Q1/Q2/Q3/Q4) | combat core 0/1/2/3+ |
| --- | --- | ---: | --- | --- | --- | --- |
| 戦士 | 28.1% [26.5%, 29.7%; N=3000] | 843 | 7.13 [7.00, 7.26; N=3000] | 11.93 [11.77, 12.08; N=843] | 211/211/211/210 | 0:3 / 1:160 / 2:431 / 3+:249 |
| 盗賊 | 19.2% [17.9%, 20.7%; N=3000] | 577 | 6.26 [6.16, 6.37; N=3000] | 10.95 [10.81, 11.08; N=577] | 145/144/144/144 | 0:14 / 1:270 / 2:259 / 3+:34 |
| 僧侶 | 27.2% [25.6%, 28.8%; N=3000] | 815 | 6.37 [6.20, 6.53; N=3000] | 12.88 [12.71, 13.05; N=815] | 204/204/204/203 | 0:15 / 1:236 / 2:390 / 3+:174 |
| 魔術師 | 27.3% [25.8%, 29.0%; N=3000] | 820 | 7.35 [7.19, 7.50; N=3000] | 13.43 [13.22, 13.64; N=820] | 205/205/205/205 | 0:32 / 1:463 / 2:325 / 3+:0 |

- 盗賊+僧侶 entrant実数: 1392 / 3055 = 45.6%
- N<30セルは未確定。職全体のentrant率がN≥30でも、職内4分位の分割後にN<30ならA1の4職共通判定へ使わない。

## A1

`combatBuildScore`職内Q1〜Q4、B10死亡率。率Wilson 95% CI、差分/平均は正規近似95% CI。

| Q | N | combatBuildScore平均 | B10死亡率（Wilson 95% CI） |
| ---: | ---: | ---: | --- |
| Q1 | 765 | 47.42 | 5.2% [3.9%, 7.0%; N=765] |
| Q2 | 764 | 62.04 | 6.2% [4.7%, 8.1%; N=764] |
| Q3 | 764 | 75.90 | 5.6% [4.2%, 7.5%; N=764] |
| Q4 | 762 | 99.97 | 7.6% [5.9%, 9.7%; N=762] |

- Q4−Q1 B10死亡率差（職内centered、正規近似95% CI）: 2.4pt [-0.1, 4.8]
- trend: z=1.717、減少方向 p=0.9570、min cell N=144
- A1条件: Q4−Q1上限<0=不成立 / 単調減少=不成立 / Q4≤30.9%=成立 / 全職cell N≥30=成立
- A1判定: **不成立または未確定**

## A3

A3主軸は既存canonどおりcombat core個数。全core個数は参考。

### combat core個数軸（判定軸）

- N=3055、level 0/1/2/3+ = 0:64 / 1:1129 / 2:1405 / 3+:457
- N<30セル: なし
- 突破差（core level slope）: 2.6pt [0.2, 4.9]
- 死亡差（core level slope）: 0.4pt [-0.8, 1.7]
- 終了到達floor差（core level slope）: 0.259 [0.128, 0.390]
- 方向判定: 突破=成立 / 死亡=不成立 / floor=成立
- A3判定: **不成立**

### 全core個数軸（参考）

- N=3055、level 0/1/2/3+ = 0:9 / 1:120 / 2:905 / 3+:2021
- N<30セル: 0:9 / 1:0 / 2:0 / 3+:0
- 突破差（core level slope）: 1.6pt [-1.3, 4.4]
- 死亡差（core level slope）: 1.0pt [-0.5, 2.6]
- 終了到達floor差（core level slope）: 0.102 [-0.057, 0.261]
- 方向判定: 突破=不成立 / 死亡=不成立 / floor=不成立
- A3判定: **不成立**

## N設計比較

80% power、α=.05、両側、2比例正規近似。A1はB10 Q1/Q4率、A3死亡は観測core level slopeを2群差へ近似。すべてB10 entrant分母。選別効果を含むため、実測N設計は正式判定前の監査下限。

- B5理論A1: 232 / 群、entrant総数928、4職合算run約7167（提示値≈928 / ≈7,166と同水準）
- B5理論A3: 1622 / 群、entrant総数7130、4職合算run約55058（提示値≈1,622 / ≈7,130 / ≈55,058と同じ近似）
- B10 A1実測効果: Q4−Q1=2.4pt、絶対効果縮小=はい
- B10 A1再計算: 群あたりN=1660、必要entrant総数=6640、run=26082（4職均等runへ丸めると26084）
  - 推定wall-clock: 101.7s simulation + calibration実測127.2s
- B10 A1必要entrant総数を各職単独で満たすrun数: 戦士=23630 / 盗賊=34524 / 僧侶=24442 / 魔術師=24293
- B10 A3死亡 slope=0.4pt、0/2+近似構成=63.0%、絶対効果縮小=はい
- B10 A3再計算: 群あたりN=47454、必要entrant総数=150543、run=591331（4職均等runへ丸めると591332）
  - 推定wall-clock: 2306.2s simulation + calibration実測127.2s
- B10 A3必要entrant総数を各職単独で満たすrun数: 戦士=535741 / 盗賊=782720 / 僧侶=554147 / 魔術師=550768

- A1のN≥30ゲートだけなら、各職120 entrant（4 quartile×30）が必要。各職run: 戦士=428 / 盗賊=624 / 僧侶=442 / 魔術師=440、4職均等runなら約2496
A3の必要entrant総数は従来設計と同じく「0個 vs 2個以上」の合算構成比を使う楽観的下限。0個/2個以上の群サイズ不均衡、職内quartileセル、4職層化を追加要求すると増える。

## B5基準線との比較

- B5 A1: Q4−Q1死亡率差 -7.3pt [-9.2, -5.4]。
- B5 A3: 突破 +3.5pp [+1.5, +5.5] / 死亡 -2.7pp [-4.8, -0.6] / 終了到達floor +0.182 [+0.092, +0.273]。
- B10 A1符号: 不一致または未確定。B10大きさ: 2.4pt [-0.1, 4.8]。
- B10 A3符号: 不一致または一部未確定。大きさは上記CI参照。
- 判定上の注意: B10 A1/A3は必要なCI条件を満たさない。B10 entrantは選別集団のため、点推定の方向だけでB5受入基準を移行しない。

## 選別効果と移行提案

B10 entrantを全run母集団として扱わない。B10到達できた時点で死亡・撤退したrunが除外され、ビルド質とcore供給が選別される。したがってB10効果がB5と同符号でも、#271/#475のB5受入基準をそのままB10へ移す証拠にはならない。
- 提案: **B5代理を残す**。A1のCI/単調減少条件が未成立。A3は3 endpoint全てのCI条件が未成立
- 盗賊・僧侶限定へ進む場合、#461の4職共通層化系列を崩す。戦士・魔術師のB10測定不能を隠さず、別estimandとしてcanon/Issueへ明記する。

## 実行記録

- source commit: `1cc2ade693636413e2c163b3f0a485f421ba3cfc`
- origin/main ancestor: yes
- stale tree override: none
- env hash: `6630774fbe1172084adde136272b09df77373427bc3d179fdd3587b9fad4f572`
- raw JSONL SHA-256: `9253e60f0309b1425e063a72dbf5c0321664f91795756a02aba27a07f2277d40`
- summary JSON SHA-256: `5239dd345be49c9ada4243789d98688d1680160d0dcf502d2f14556be9a609ca`
- calibration wall/CPU: 127.240s / 167.520s
- simulation wall/CPU: 46.801s / 692.582s
- total wall/CPU: 174.041s / 860.103s
- resolved parallelism: 15（available=15、SIM_PARALLEL未指定）
- reproduction: `node scratch/simulations/sim_issue_510_b10_criteria_migration.js`
- raw JSONL/summary JSONはコミットしない。

## 固定env

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
SIM_MAP_CACHE_ENTRIES=<omitted; default=1024>
SIM_MAP_STATS=0
SIM_MATCHING_DEFINITION=exact
SIM_PARALLEL=<omitted>
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
```

Refs #510 / #461 / #475 / #271
