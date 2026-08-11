# Issue #510 B10受入基準移行測定

## 判定: B5代理を残す

職内quartileにN<30セル（戦士・魔術師）。A1のCI/単調減少条件が未成立。A3は3 endpoint全てのCI条件が未成立。盗賊・僧侶がB10 entrantの90.2%だが、限定測定は#461と別estimandの追加監査に留める

B10 entrantは既にB10到達できたrunだけの選別集団。全runのビルド質分布と異なるため、B10内の相関・core個数差は因果効果ではなく、`deathFloor === floor`のトートロジーと同種の選別罠を含む。

## 測定対象

- seed=461、4職×各N=3000、calibration N=1000、6工房状態。B10 entrant分母固定。
- `combatBuildScore`はB10 floor-startの職内Q1〜Q4。A1死亡endpointは`deathFloor===10`。
- B10 build観測点: floor-start=1540、finish fallback=14（floor 9→10直後にportal終了しfloor-start snapshotが無い14件を診断再実行で補完）。
- A3はB10 floor-startのcombat core個数0/1/2/3+。突破/死亡はB10 entrant内、終了到達floorは同じB10 entrant内の`reachedFloor`。
- `generateRunFloor`を経由する`simulateRun`、`TOWN_PORTAL`、状態異常治療、鑑定粉、現行戦闘/報酬/装備更新、現行departure kitをモデル化。上級4職、任意寄り道、MP/強化アイテム能動使用は#461と同じく省略。

## B10 entrant実測

- 4職合算B10 entrant実数: 1554/12000 = 12.95%
- 4職合算 entrant: 13.0% [12.4%, 13.6%; N=12000]
  - 突破: 61.3% [58.8%, 63.7%; N=1554]
  - 死亡（deathFloor===10）: 8.9% [7.6%, 10.5%; N=1554]
  - 撤退: 29.8% [27.6%, 32.1%; N=1554]

| 職 | B10 entrant | 実数 | 平均到達floor（全run） | B10 entrant内平均floor | quartile N(Q1/Q2/Q3/Q4) | combat core 0/1/2/3+ |
| --- | --- | ---: | --- | --- | --- | --- |
| 戦士 | 3.4% [2.8%, 4.1%; N=3000] | 103 | 4.48 [4.41, 4.54; N=3000] | 10.68 [10.40, 10.96; N=103] | 26/26/26/25 | 0:1 / 1:21 / 2:53 / 3+:28 |
| 盗賊 | 19.2% [17.9%, 20.7%; N=3000] | 577 | 6.27 [6.16, 6.37; N=3000] | 10.96 [10.82, 11.10; N=577] | 145/144/144/144 | 0:14 / 1:270 / 2:259 / 3+:34 |
| 僧侶 | 27.5% [25.9%, 29.1%; N=3000] | 825 | 6.30 [6.12, 6.49; N=3000] | 13.79 [13.60, 13.98; N=825] | 207/206/206/206 | 0:13 / 1:248 / 2:386 / 3+:178 |
| 魔術師 | 1.6% [1.2%, 2.2%; N=3000] | 49 | 4.47 [4.42, 4.53; N=3000] | 10.45 [10.17, 10.72; N=49] | 13/12/12/12 | 0:2 / 1:30 / 2:17 / 3+:0 |

- 盗賊+僧侶 entrant実数: 1402 / 1554 = 90.2%
- N<30セルは未確定。職全体のentrant率がN≥30でも、職内4分位の分割後にN<30ならA1の4職共通判定へ使わない。

## A1

`combatBuildScore`職内Q1〜Q4、B10死亡率。率Wilson 95% CI、差分/平均は正規近似95% CI。

| Q | N | combatBuildScore平均 | B10死亡率（Wilson 95% CI） |
| ---: | ---: | ---: | --- |
| Q1 | 391 | 46.54 | 10.5% [7.8%, 13.9%; N=391] |
| Q2 | 388 | 60.81 | 6.2% [4.2%, 9.0%; N=388] |
| Q3 | 388 | 73.73 | 9.0% [6.6%, 12.3%; N=388] |
| Q4 | 387 | 97.79 | 10.1% [7.5%, 13.5%; N=387] |

- Q4−Q1 B10死亡率差（職内centered、正規近似95% CI）: -0.4pt [-4.7, 3.9]
- trend: z=0.244、減少方向 p=0.5964、min cell N=12
- A1条件: Q4−Q1上限<0=不成立 / 単調減少=不成立 / Q4≤30.9%=成立 / 全職cell N≥30=不成立
- A1判定: **不成立または未確定**

## A3

A3主軸は既存canonどおりcombat core個数。全core個数は参考。

### combat core個数軸（判定軸）

- N=1554、level 0/1/2/3+ = 0:30 / 1:569 / 2:715 / 3+:240
- N<30セル: なし
- 突破差（core level slope）: 2.3pt [-0.4, 5.0]
- 死亡差（core level slope）: -2.2pt [-4.2, -0.2]
- 終了到達floor差（core level slope）: 0.263 [0.102, 0.424]
- 方向判定: 突破=不成立 / 死亡=成立 / floor=成立
- A3判定: **不成立**

### 全core個数軸（参考）

- N=1554、level 0/1/2/3+ = 0:2 / 1:54 / 2:418 / 3+:1080
- N<30セル: 0:2 / 1:0 / 2:0 / 3+:0
- 突破差（core level slope）: 1.0pt [-2.6, 4.5]
- 死亡差（core level slope）: 0.5pt [-2.1, 3.2]
- 終了到達floor差（core level slope）: 0.195 [-0.016, 0.406]
- 方向判定: 突破=不成立 / 死亡=不成立 / floor=不成立
- A3判定: **不成立**

## N設計比較

80% power、α=.05、両側、2比例正規近似。A1はB10 Q1/Q4率、A3死亡は観測core level slopeを2群差へ近似。すべてB10 entrant分母。選別効果を含むため、実測N設計は正式判定前の監査下限。

- B5理論A1: 232 / 群、entrant総数928、4職合算run約7167（提示値≈928 / ≈7,166と同水準）
- B5理論A3: 1622 / 群、entrant総数7130、4職合算run約55058（提示値≈1,622 / ≈7,130 / ≈55,058と同じ近似）
- B10 A1実測効果: Q4−Q1=-0.4pt、絶対効果縮小=はい
- B10 A1再計算: 群あたりN=86812、必要entrant総数=347248、run=2681452（4職均等runへ丸めると2681452）
  - 推定wall-clock: 8164.2s simulation + calibration実測102.5s
- B10 A1必要entrant総数を各職単独で満たすrun数: 戦士=10114020 / 盗賊=1805449 / 僧侶=1262720 / 魔術師=21260082
- B10 A3死亡 slope=-2.2pt、0/2+近似構成=63.4%、絶対効果縮小=はい
- B10 A3再計算: 群あたりN=2602、必要entrant総数=8211、run=63406（4職均等runへ丸めると63408）
  - 推定wall-clock: 193.1s simulation + calibration実測102.5s
- B10 A3必要entrant総数を各職単独で満たすrun数: 戦士=239156 / 盗賊=42692 / 僧侶=29859 / 魔術師=502715

- A1のN≥30ゲートだけなら、各職120 entrant（4 quartile×30）が必要。各職run: 戦士=3496 / 盗賊=624 / 僧侶=437 / 魔術師=7347、4職均等runなら約29388
A3の必要entrant総数はClaude設計と同じく「0個 vs 2個以上」の合算構成比を使う楽観的下限。0個/2個以上の群サイズ不均衡、職内quartileセル、4職層化を追加要求すると増える。

## B5基準線との比較

- B5 A1: Q4−Q1死亡率差 -7.3pt [-9.2, -5.4]。
- B5 A3: 突破 +3.5pp [+1.5, +5.5] / 死亡 -2.7pp [-4.8, -0.6] / 終了到達floor +0.182 [+0.092, +0.273]。
- B10 A1符号: 一致（負）。B10大きさ: -0.4pt [-4.7, 3.9]。
- B10 A3符号: 3 endpointとも一致。大きさは上記CI参照。
- 判定上の注意: B10 A1は符号のみB5と一致しCIが0を跨ぐ。A3も点推定の符号は3 endpoint一致だが、突破CIが0を跨ぐため、受入基準の成立とは扱わない。

## 選別効果と移行提案

B10 entrantを全run母集団として扱わない。B10到達できた時点で死亡・撤退したrunが除外され、ビルド質とcore供給が選別される。したがってB10効果がB5と同符号でも、#271/#475のB5受入基準をそのままB10へ移す証拠にはならない。
- 提案: **B5代理を残す**。職内quartileにN<30セル（戦士・魔術師）。A1のCI/単調減少条件が未成立。A3は3 endpoint全てのCI条件が未成立。盗賊・僧侶がB10 entrantの90.2%だが、限定測定は#461と別estimandの追加監査に留める
- 盗賊・僧侶限定へ進む場合、#461の4職共通層化系列を崩す。戦士・魔術師のB10測定不能を隠さず、別estimandとしてcanon/Issueへ明記する。

## 実行記録

- source commit: `aab93d62fb5b51caff0f22f313ad07d60c10aa3f`
- origin/main ancestor: yes
- stale tree override: none
- env hash: `6630774fbe1172084adde136272b09df77373427bc3d179fdd3587b9fad4f572`
- raw JSONL SHA-256: `92f882a5cf4a84fed3cb7ac6b31d8516ac60fa740014eaf6f23e632439bd737d`
- summary JSON SHA-256: `ffe4d4330fbd7e35d57b40a3bffe973a133dda4d919bf2adcd6378355971d219`
- calibration wall/CPU: 102.460s / 140.419s
- simulation wall/CPU: 36.537s / 536.684s
- total wall/CPU: 138.997s / 677.103s
- resolved parallelism: 15（available=15、SIM_PARALLEL未指定）
- reproduction: `node scratch/sim_issue_510_b10_criteria_migration.js`
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
