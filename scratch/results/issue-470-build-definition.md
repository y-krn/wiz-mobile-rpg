# Issue #470 完成ビルド定義測定

## 結論: 現行 total = equipment + first combat core（職内 quartile） の Q4 を完成ビルド定義として採用。隣接差CIで統計的反転は確認されず、trend testで減少傾向が成立。

同じ #461 固定条件・同じ raw run を候補指標ごとに再ランキングした。候補指標の変更は装備選択・戦闘・探索へ反映しない観測分析であり、balance 値は変更していない。

## N 設計

- 観測基準 Q1=32.8%、Q4=24.1%、差=8.7%。95% CI上限<0だけなら 205/Q、80% power・観測分散なら 419/Q、p=.5保守値なら 519/Q。
- 保守値の必要 B5 entrant=2076、基準線 B5 entrant率23.4%換算 8882 run。実測見込み 701/Q、固定値は 3000/職（合計12000 baseline run）。
- 低率 Mage の #461 B5 entrant率5.1%で各 quartile N>=30を満たす下限 2353/職。固定3000/職を採用。N<30 は未確定扱い。

## スナップショット時点と深度

- B5 entrant=2799。全 2799 件の snapshot が floor=5 / point=floor-start。B5死亡判定前の floor-start であり、予測入力として時間順は成立。
- `reachedFloor` は run 終了値。B5後の結果をB5 entryスコアへ正規化するのは後知恵・媒介調整になるため候補入力から除外。B5 entrant内の score→終了到達floor は選別後の関連であり、因果効果ではない。
- 全run平均到達floor（無条件指標）: 3.65 [3.62, 3.69; N=12000]。

### B5 entry score と終了到達floorの Fisher z 相関（B5 entrant内、選別後）

| 指標 | r（Fisher z 95% CI） |
| --- | --- |
| currentTotal | 0.067 [0.030, 0.104; N=2799] |
| equipmentOnly | 0.051 [0.014, 0.088; N=2799] |
| firstCoreOnly | 0.100 [0.063, 0.136; N=2799] |
| allCoreOnly | 0.107 [0.070, 0.143; N=2799] |
| allCoreTotal | 0.072 [0.035, 0.109; N=2799] |

## 先決め判定基準（結果を見る前に固定）

- 候補は既登録の7個から増やさず、A1の単調性は点推定の順序だけで判定しない。各隣接差を Δ=Q次−Q前 とし、各候補の実測 quartile 死亡率から正規近似95% CIを出す。
- Δの95% CI下限が0を上回る隣接ペアだけを、統計的に確認された非単調（有意な反転）とする。Δ>0でもCIが0を跨ぐ場合は点推定反転に留め、A1失格にしない。
- 全体の傾向は職を層とする Cochran–Armitage trend test（Q1〜Q4の順序 score=0〜3）で判定する。一側の減少方向 p<0.05、かつ統計的反転なしを「統計的単調減少 成立」とする。N<30セルまたは検定不能は未確定。
- この基準は、隣接差が0を跨ぐことを効果なしと断定せず、N不足・測定誤差で区別不能な点推定反転を非単調と扱わないため採用。

## 候補別 A1

正式候補 7 個、A1主条件 21 個。単調性の隣接差・trend補助チェック 28 個を含む報告総数 49 個。α=.05の機械的な期待偽陽性数 2.45（Bonferroni family-wise α=0.00102）。候補追加による数字合わせはしない。

### current-total-class-quartile

- 定義: 現行 total = equipment + first combat core（職内 quartile）
- Q4−Q1（職内 centered）: -8.9pt [-13.5, -4.3]。CI上限<0=成立
- Q1→Q4 統計的単調減少: 成立
- trend test: class-stratified Cochran-Armitage、z=-4.357、減少方向 p=<0.0001、増加方向 p=1.0000
- 統計的非単調（隣接差CI下限>0）: 確認なし
- 職内 centered: 成立
- サンプル十分性（全職・全層 N>=30）: 成立
- A1: 成立

| 層 | N | 指標平均（正規95% CI） | B5死亡率（Wilson95% CI） | 職内centered死亡率 |
| --- | ---: | --- | --- | ---: |
| Q1 | 701 | 30.91 [30.42, 31.40; N=701] | 33.0% [29.6%, 36.5%; N=701] | 25.2% |
| Q2 | 699 | 39.45 [38.85, 40.06; N=699] | 26.5% [23.3%, 29.9%; N=699] | 20.0% |
| Q3 | 700 | 49.82 [49.08, 50.55; N=700] | 21.6% [18.7%, 24.8%; N=700] | 15.7% |
| Q4 | 699 | 70.83 [69.67, 72.00; N=699] | 24.0% [21.0%, 27.3%; N=699] | 16.9% |

| 隣接 | 差（次−前、正規95% CI） | 判定 |
| --- | --- | --- |
| Q1→Q2 | -6.5pt [-11.3, -1.7] | 統計的減少 |
| Q2→Q3 | -4.9pt [-9.4, -0.4] | 統計的減少 |
| Q3→Q4 | 2.5pt [-1.9, 6.9] | 点推定反転（CIは0を跨ぐ） |

### equipment-only-class-quartile

- 定義: equipmentStatScore のみ（職内 quartile）
- Q4−Q1（職内 centered）: -12.2pt [-16.9, -7.6]。CI上限<0=成立
- Q1→Q4 統計的単調減少: 成立
- trend test: class-stratified Cochran-Armitage、z=-5.260、減少方向 p=<0.0001、増加方向 p=1.0000
- 統計的非単調（隣接差CI下限>0）: 確認なし
- 職内 centered: 成立
- サンプル十分性（全職・全層 N>=30）: 成立
- A1: 成立

| 層 | N | 指標平均（正規95% CI） | B5死亡率（Wilson95% CI） | 職内centered死亡率 |
| --- | ---: | --- | --- | ---: |
| Q1 | 701 | 29.14 [28.68, 29.61; N=701] | 36.1% [32.6%, 39.7%; N=701] | 29.3% |
| Q2 | 699 | 37.17 [36.58, 37.76; N=699] | 23.3% [20.3%, 26.6%; N=699] | 16.3% |
| Q3 | 700 | 47.29 [46.57, 48.00; N=700] | 21.7% [18.8%, 24.9%; N=700] | 15.4% |
| Q4 | 699 | 67.41 [66.31, 68.51; N=699] | 23.9% [20.9%, 27.2%; N=699] | 16.8% |

| 隣接 | 差（次−前、正規95% CI） | 判定 |
| --- | --- | --- |
| Q1→Q2 | -12.8pt [-17.5, -8.0] | 統計的減少 |
| Q2→Q3 | -1.6pt [-6.0, 2.8] | 点推定減少（CIは0を跨ぐ） |
| Q3→Q4 | 2.2pt [-2.2, 6.6] | 点推定反転（CIは0を跨ぐ） |

### first-combat-core-only-class-quartile

- 定義: 現行 first combatCoreScore のみ（職内 quartile）
- Q4−Q1（職内 centered）: 0.2pt [-4.3, 4.7]。CI上限<0=不成立
- Q1→Q4 統計的単調減少: 不成立
- trend test: class-stratified Cochran-Armitage、z=-0.158、減少方向 p=0.4374、増加方向 p=0.5626
- 統計的非単調（隣接差CI下限>0）: 確認なし
- 職内 centered: 成立
- サンプル十分性（全職・全層 N>=30）: 成立
- A1: 不成立 / 未確定

| 層 | N | 指標平均（正規95% CI） | B5死亡率（Wilson95% CI） | 職内centered死亡率 |
| --- | ---: | --- | --- | ---: |
| Q1 | 701 | 0.00 [0.00, 0.00; N=701] | 25.5% [22.4%, 28.9%; N=701] | 17.5% |
| Q2 | 699 | 0.06 [0.06, 0.07; N=699] | 27.8% [24.6%, 31.2%; N=699] | 20.7% |
| Q3 | 700 | 2.43 [2.29, 2.57; N=700] | 26.0% [22.9%, 29.4%; N=700] | 20.9% |
| Q4 | 699 | 7.51 [7.34, 7.69; N=699] | 25.8% [22.6%, 29.1%; N=699] | 18.8% |

| 隣接 | 差（次−前、正規95% CI） | 判定 |
| --- | --- | --- |
| Q1→Q2 | 2.2pt [-2.4, 6.9] | 点推定反転（CIは0を跨ぐ） |
| Q2→Q3 | -1.8pt [-6.4, 2.9] | 点推定減少（CIは0を跨ぐ） |
| Q3→Q4 | -0.2pt [-4.8, 4.3] | 点推定減少（CIは0を跨ぐ） |

### all-combat-core-only-class-quartile

- 定義: 全 combat core 合計のみ（職内 quartile）
- Q4−Q1（職内 centered）: -0.2pt [-4.7, 4.3]。CI上限<0=不成立
- Q1→Q4 統計的単調減少: 不成立
- trend test: class-stratified Cochran-Armitage、z=-0.275、減少方向 p=0.3915、増加方向 p=0.6085
- 統計的非単調（隣接差CI下限>0）: 確認なし
- 職内 centered: 成立
- サンプル十分性（全職・全層 N>=30）: 成立
- A1: 不成立 / 未確定

| 層 | N | 指標平均（正規95% CI） | B5死亡率（Wilson95% CI） | 職内centered死亡率 |
| --- | ---: | --- | --- | ---: |
| Q1 | 701 | 0.00 [0.00, 0.00; N=701] | 25.7% [22.6%, 29.0%; N=701] | 17.9% |
| Q2 | 699 | 0.17 [0.13, 0.20; N=699] | 27.6% [24.4%, 31.0%; N=699] | 19.5% |
| Q3 | 700 | 3.46 [3.29, 3.62; N=700] | 26.3% [23.2%, 29.7%; N=700] | 21.4% |
| Q4 | 699 | 9.65 [9.34, 9.97; N=699] | 25.5% [22.4%, 28.8%; N=699] | 19.0% |

| 隣接 | 差（次−前、正規95% CI） | 判定 |
| --- | --- | --- |
| Q1→Q2 | 1.9pt [-2.7, 6.6] | 点推定反転（CIは0を跨ぐ） |
| Q2→Q3 | -1.3pt [-6.0, 3.3] | 点推定減少（CIは0を跨ぐ） |
| Q3→Q4 | -0.8pt [-5.4, 3.8] | 点推定減少（CIは0を跨ぐ） |

### all-combat-total-class-quartile

- 定義: equipment + 全 combat core 合計（職内 quartile）
- Q4−Q1（職内 centered）: -8.9pt [-13.5, -4.3]。CI上限<0=成立
- Q1→Q4 統計的単調減少: 成立
- trend test: class-stratified Cochran-Armitage、z=-4.475、減少方向 p=<0.0001、増加方向 p=1.0000
- 統計的非単調（隣接差CI下限>0）: 確認なし
- 職内 centered: 成立
- サンプル十分性（全職・全層 N>=30）: 成立
- A1: 成立

| 層 | N | 指標平均（正規95% CI） | B5死亡率（Wilson95% CI） | 職内centered死亡率 |
| --- | ---: | --- | --- | ---: |
| Q1 | 701 | 31.05 [30.55, 31.55; N=701] | 32.5% [29.2%, 36.1%; N=701] | 24.5% |
| Q2 | 699 | 39.92 [39.30, 40.55; N=699] | 27.3% [24.2%, 30.7%; N=699] | 21.3% |
| Q3 | 700 | 50.87 [50.11, 51.64; N=700] | 21.6% [18.7%, 24.8%; N=700] | 14.9% |
| Q4 | 699 | 72.44 [71.18, 73.70; N=699] | 23.6% [20.6%, 26.9%; N=699] | 17.1% |

| 隣接 | 差（次−前、正規95% CI） | 判定 |
| --- | --- | --- |
| Q1→Q2 | -5.2pt [-10.0, -0.4] | 統計的減少 |
| Q2→Q3 | -5.8pt [-10.3, -1.3] | 統計的減少 |
| Q3→Q4 | 2.0pt [-2.4, 6.4] | 点推定反転（CIは0を跨ぐ） |

### current-total-global-quartile

- 定義: 現行 total（全職 global quartile / 上位25%）
- Q4−Q1（職内 centered）: -9.8pt [-14.2, -5.3]。CI上限<0=成立
- Q1→Q4 統計的単調減少: 不成立
- trend test: class-stratified Cochran-Armitage、z=-4.696、減少方向 p=<0.0001、増加方向 p=1.0000
- 統計的非単調（隣接差CI下限>0）: 確認なし
- 職内 centered: 不成立
- サンプル十分性（全職・全層 N>=30）: 未確定
- A1: 不成立 / 未確定

| 層 | N | 指標平均（正規95% CI） | B5死亡率（Wilson95% CI） | 職内centered死亡率 |
| --- | ---: | --- | --- | ---: |
| Q1 | 700 | 28.55 [28.10, 28.99; N=700] | 33.9% [30.4%, 37.4%; N=700] | 24.2% |
| Q2 | 700 | 38.92 [38.72, 39.12; N=700] | 27.9% [24.7%, 31.3%; N=700] | 21.5% |
| Q3 | 700 | 50.29 [49.96, 50.62; N=700] | 22.9% [19.9%, 26.1%; N=700] | 15.8% |
| Q4 | 699 | 73.25 [72.25, 74.24; N=699] | 20.5% [17.6%, 23.6%; N=699] | 26.3% |

| 隣接 | 差（次−前、正規95% CI） | 判定 |
| --- | --- | --- |
| Q1→Q2 | -6.0pt [-10.8, -1.2] | 統計的減少 |
| Q2→Q3 | -5.0pt [-9.6, -0.4] | 統計的減少 |
| Q3→Q4 | -2.4pt [-6.7, 1.9] | 点推定減少（CIは0を跨ぐ） |

### all-combat-total-global-quartile

- 定義: equipment + 全 combat core 合計（全職 global quartile / 上位25%）
- Q4−Q1（職内 centered）: -10.4pt [-14.9, -5.9]。CI上限<0=成立
- Q1→Q4 統計的単調減少: 不成立
- trend test: class-stratified Cochran-Armitage、z=-4.853、減少方向 p=<0.0001、増加方向 p=1.0000
- 統計的非単調（隣接差CI下限>0）: 確認なし
- 職内 centered: 不成立
- サンプル十分性（全職・全層 N>=30）: 未確定
- A1: 不成立 / 未確定

| 層 | N | 指標平均（正規95% CI） | B5死亡率（Wilson95% CI） | 職内centered死亡率 |
| --- | ---: | --- | --- | ---: |
| Q1 | 700 | 28.62 [28.17, 29.06; N=700] | 34.0% [30.6%, 37.6%; N=700] | 24.3% |
| Q2 | 700 | 39.36 [39.15, 39.57; N=700] | 27.3% [24.1%, 30.7%; N=700] | 20.3% |
| Q3 | 700 | 51.29 [50.95, 51.63; N=700] | 23.6% [20.6%, 26.9%; N=700] | 17.9% |
| Q4 | 699 | 75.01 [73.93, 76.10; N=699] | 20.2% [17.4%, 23.3%; N=699] | 13.6% |

| 隣接 | 差（次−前、正規95% CI） | 判定 |
| --- | --- | --- |
| Q1→Q2 | -6.7pt [-11.5, -1.9] | 統計的減少 |
| Q2→Q3 | -3.7pt [-8.3, 0.8] | 点推定減少（CIは0を跨ぐ） |
| Q3→Q4 | -3.4pt [-7.7, 0.9] | 点推定減少（CIは0を跨ぐ） |

## 分解診断

現行 total の Q1〜Q4は equipmentStatScore と first combatCoreScore の和。全 combat core 合計は測定専用派生値であり、既存の装備選択スコアは変更していない。

### 現行 total quartile の寄与

| 層 | equipmentStatScore平均 | first combatCoreScore平均 | 全 combat core平均 | first/現行total | all-core/(equipment+all-core) | 複数combat core率 |
| --- | --- | --- | --- | ---: | ---: | --- |
| Q1 | 29.75 [29.26, 30.23; N=701] | 1.16 [1.01, 1.32; N=701] | 1.41 [1.21, 1.62; N=701] | 3.8% | 4.5% | 10.0% [8.0%, 12.4%; N=701] |
| Q2 | 37.01 [36.38, 37.64; N=699] | 2.45 [2.21, 2.68; N=699] | 3.03 [2.75, 3.31; N=699] | 6.2% | 7.6% | 19.3% [16.6%, 22.4%; N=699] |
| Q3 | 47.15 [46.39, 47.92; N=700] | 2.67 [2.43, 2.90; N=700] | 3.67 [3.36, 3.98; N=700] | 5.4% | 7.2% | 30.3% [27.0%, 33.8%; N=700] |
| Q4 | 67.11 [65.99, 68.23; N=699] | 3.73 [3.41, 4.04; N=699] | 5.16 [4.71, 5.61; N=699] | 5.3% | 7.1% | 40.1% [36.5%, 43.7%; N=699] |

- B5 entrant内 複数combat core: 24.9% [23.3%, 26.5%; N=2799]。first coreのみが全core合計を過小評価するrun: 16.8% [15.5%, 18.3%; N=2799]。全体の first→all 差: 0.82 [0.72, 0.92; N=2799]、複数core限定: 3.28 [2.95, 3.61; N=697]。

### Q3→Q4反転の切り分け

各 component-only ranking でも同じ A1 層定義を使い、Q4−Q3 B5死亡率を比較した。反転が equipment-only でも出れば装備総量側、all-core-only でのみ出れば core scoring側を示す。これは同一runの再ランキングで、因果分解ではない。

| ranking | Q3死亡率 | Q4死亡率 | Q4−Q3（正規95% CI） |
| --- | --- | --- | --- |
| equipment-only-class-quartile | 21.7% [18.8%, 24.9%; N=700] | 23.9% [20.9%, 27.2%; N=699] | 2.2pt [-2.2, 6.6] |
| first-combat-core-only-class-quartile | 26.0% [22.9%, 29.4%; N=700] | 25.8% [22.6%, 29.1%; N=699] | -0.2pt [-4.8, 4.3] |
| all-combat-core-only-class-quartile | 26.3% [23.2%, 29.7%; N=700] | 25.5% [22.4%, 28.8%; N=699] | -0.8pt [-5.4, 3.8] |

- 3比較とも差の95% CIが0を跨ぐ。点推定の方向は観測事実だが、反転の実在も主因もこのNでは確定しない。

## 測定記録

- env hash: `e79d51f4d7ce5e701e0e73db97afc9ee051d609b9a652e278ab84b0518897bda`。期待固定 hash: `e79d51f4d7ce5e701e0e73db97afc9ee051d609b9a652e278ab84b0518897bda`
- source commit: `6ef9a5dbc70b13d503591fe54f9e4dfa01d041e6`
- resolved parallelism: 15（availableParallelism=15、`SIM_PARALLEL`未指定）
- `SIM_MAP_CACHE_ENTRIES`未指定（既定1024）
- wall-clock: calibration 89.988s + simulation 31.388s = 121.377s
- CPU: calibration 110.657s + simulation 467.479s = 578.135s
- raw JSONL SHA-256: `3f55ad0619bbe12198722963909ab735ca99d4a38e67a4109b845a7185089a0a`
- summary JSON SHA-256: `f52ae530ed5848a4ce26d69134f9b434cccccded1d16e4e5ba73653532bbe4fc`

### Resolved environment

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

### 実行コマンド

```sh
node --check scratch/sim_depth_material_ev.js
node --check scratch/sim_issue_461_baseline.js
node --check scratch/sim_issue_470_build_definition.js
SIM_SEED=461 SIM_RUNS=3000 SIM_CALIBRATION_RUNS=1000 \
DEPARTURE_CRAFT_IDS=TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION \
IDENTIFICATION_POLICY=powder IDENTIFICATION_STARTING_POWDER=2 IDENTIFICATION_COST_OVERRIDE=1 \
FLEE_POLICY=threshold FLEE_HP_THRESHOLD=0.35 PORTAL_HP_THRESHOLD=0.35 PORTAL_MAX_HEAL_POTIONS=0 \
PORTAL_MIN_FLOOR=3 ELITE_POLICY=avoid \
TRAP_POLICY=conservative TRAP_AVOIDANCE_POLICY=ev TRAP_DAMAGE_MULTIPLIER=1 \
STATUS_CURE_POLICY=smart STATUS_CURE_HP_THRESHOLD=0.35 STATUS_CURE_MERCHANT_POLICY=missing \
HEAL_POTION_MERCHANT_POLICY=missing BLOOD_WAND_HP_PAYMENT_MIN_RATE=0.50 \
SIM_CORE_SCORE_DROP_TOLERANCE=0 SIM_440_CONDITION=current SIM_SUPPORT_SUPPLY_CEILING=none \
SIM_EQUIPMENT_POLICY=individual-score SIM_EQUIPMENT_SLOT_MODE=standard SIM_EQUIPMENT_SLOT_AFFIX_MODE=retain \
SIM_MATCHING_DEFINITION=exact SIM_CURSE_LOCK_MODE=current SIM_SCENARIOS=workshop-empty,workshop-stats,workshop-gear,workshop-blood-wand,workshop-blood-wand-spells,workshop-complete \
SIM_MAP_STATS=0 SIM_DAMAGE_PROBE=0 node scratch/sim_issue_470_build_definition.js
```

## 未採用候補・限界

- 絶対閾値は score の外部校正値がなく、thresholdを結果後に選ぶと多重比較を増やすため正式候補にしなかった。top 25%の global quartile は明示的に測定した。
- B5 entrant は既に B5到達という選別済み集合。終了 `reachedFloor` を使う深度正規化は endpoint後の情報で、完成度の予測定義にならない。
- `core + 対応support` と `core 1個以上 + slot充足` は #470指定どおり再提案しない。

## 取り直し対象

- 採用定義は current-total-class-quartile。#271 の A1（Q4−Q1、統計的単調性、Q4安全性gate）を取り直す。
- #271 の A2（class-centered score×depth、補助のscore×B5突破）と A3（combat core / core+対応support feature）を同じ固定条件で取り直す。
- 完成ビルド率、quality quartileを入力にしたdepth-quality表・要約・派生判断を全て再集計する。#470のB5 raw再測定は不要。

Refs #470, #461, #469, #271
