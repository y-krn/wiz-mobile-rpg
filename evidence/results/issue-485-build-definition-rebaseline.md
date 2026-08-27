# Issue #470 完成ビルド定義測定

## 結論: 現行 total = equipment + first combat core（職内 quartile） の Q4 を完成ビルド定義として採用。隣接差CIで統計的反転は確認されず、trend testで減少傾向が成立。

同じ #461 固定条件・同じ raw run を候補指標ごとに再ランキングした。候補指標の変更は装備選択・戦闘・探索へ反映しない観測分析であり、balance 値は変更していない。

## N 設計

- 観測基準 Q1=32.8%、Q4=24.1%、差=8.7%。95% CI上限<0だけなら 205/Q、80% power・観測分散なら 419/Q、p=.5保守値なら 519/Q。
- 保守値の必要 B5 entrant=2076、基準線 B5 entrant率23.4%換算 8882 run。実測見込み 701/Q、固定値は 3000/職（合計12000 baseline run）。
- 低率 Mage の #461 B5 entrant率5.1%で各 quartile N>=30を満たす下限 2353/職。固定3000/職を採用。N<30 は未確定扱い。

## スナップショット時点と深度

- B5 entrant=2821。全 2821 件の snapshot が floor=5 / point=floor-start。B5死亡判定前の floor-start であり、予測入力として時間順は成立。
- `reachedFloor` は run 終了値。B5後の結果をB5 entryスコアへ正規化するのは後知恵・媒介調整になるため候補入力から除外。B5 entrant内の score→終了到達floor は選別後の関連であり、因果効果ではない。
- 全run平均到達floor（無条件指標）: 3.59 [3.56, 3.63; N=12000]。

### B5 entry score と終了到達floorの Fisher z 相関（B5 entrant内、選別後）

| 指標 | r（Fisher z 95% CI） |
| --- | --- |
| currentTotal | 0.081 [0.044, 0.117; N=2821] |
| equipmentOnly | 0.064 [0.027, 0.101; N=2821] |
| firstCoreOnly | 0.082 [0.045, 0.118; N=2821] |
| allCoreOnly | 0.098 [0.061, 0.134; N=2821] |
| allCoreTotal | 0.087 [0.050, 0.123; N=2821] |

## 先決め判定基準（結果を見る前に固定）

- 候補は既登録の7個から増やさず、A1の単調性は点推定の順序だけで判定しない。各隣接差を Δ=Q次−Q前 とし、各候補の実測 quartile 死亡率から正規近似95% CIを出す。
- Δの95% CI下限が0を上回る隣接ペアだけを、統計的に確認された非単調（有意な反転）とする。Δ>0でもCIが0を跨ぐ場合は点推定反転に留め、A1失格にしない。
- 全体の傾向は職を層とする Cochran–Armitage trend test（Q1〜Q4の順序 score=0〜3）で判定する。一側の減少方向 p<0.05、かつ統計的反転なしを「統計的単調減少 成立」とする。N<30セルまたは検定不能は未確定。
- この基準は、隣接差が0を跨ぐことを効果なしと断定せず、N不足・測定誤差で区別不能な点推定反転を非単調と扱わないため採用。

## 候補別 A1

正式候補 7 個、A1主条件 21 個。単調性の隣接差・trend補助チェック 28 個を含む報告総数 49 個。α=.05の機械的な期待偽陽性数 2.45（Bonferroni family-wise α=0.00102）。候補追加による数字合わせはしない。

### current-total-class-quartile

- 定義: 現行 total = equipment + first combat core（職内 quartile）
- Q4−Q1（職内 centered）: -11.4pt [-16.0, -6.9]。CI上限<0=成立
- Q1→Q4 統計的単調減少: 成立
- trend test: class-stratified Cochran-Armitage、z=-5.208、減少方向 p=<0.0001、増加方向 p=1.0000
- 統計的非単調（隣接差CI下限>0）: 確認なし
- 職内 centered: 成立
- サンプル十分性（全職・全層 N>=30）: 成立
- A1: 成立

| 層 | N | 指標平均（正規95% CI） | B5死亡率（Wilson95% CI） | 職内centered死亡率 |
| --- | ---: | --- | --- | ---: |
| Q1 | 706 | 31.05 [30.54, 31.55; N=706] | 35.4% [32.0%, 39.0%; N=706] | 26.2% |
| Q2 | 705 | 40.12 [39.48, 40.77; N=705] | 28.7% [25.4%, 32.1%; N=705] | 21.4% |
| Q3 | 705 | 50.36 [49.61, 51.12; N=705] | 24.7% [21.6%, 28.0%; N=705] | 20.2% |
| Q4 | 705 | 71.01 [69.85, 72.18; N=705] | 24.0% [21.0%, 27.3%; N=705] | 18.7% |

| 隣接 | 差（次−前、正規95% CI） | 判定 |
| --- | --- | --- |
| Q1→Q2 | -6.8pt [-11.6, -1.9] | 統計的減少 |
| Q2→Q3 | -4.0pt [-8.6, 0.6] | 点推定減少（CIは0を跨ぐ） |
| Q3→Q4 | -0.7pt [-5.2, 3.8] | 点推定減少（CIは0を跨ぐ） |

### equipment-only-class-quartile

- 定義: equipmentStatScore のみ（職内 quartile）
- Q4−Q1（職内 centered）: -15.5pt [-20.1, -10.9]。CI上限<0=成立
- Q1→Q4 統計的単調減少: 成立
- trend test: class-stratified Cochran-Armitage、z=-6.636、減少方向 p=<0.0001、増加方向 p=1.0000
- 統計的非単調（隣接差CI下限>0）: 確認なし
- 職内 centered: 成立
- サンプル十分性（全職・全層 N>=30）: 成立
- A1: 成立

| 層 | N | 指標平均（正規95% CI） | B5死亡率（Wilson95% CI） | 職内centered死亡率 |
| --- | ---: | --- | --- | ---: |
| Q1 | 706 | 29.14 [28.66, 29.61; N=706] | 39.2% [35.7%, 42.9%; N=706] | 28.8% |
| Q2 | 705 | 37.10 [36.49, 37.71; N=705] | 26.0% [22.9%, 29.3%; N=705] | 20.2% |
| Q3 | 705 | 47.46 [46.73, 48.19; N=705] | 23.8% [20.8%, 27.1%; N=705] | 18.9% |
| Q4 | 705 | 67.45 [66.35, 68.56; N=705] | 23.7% [20.7%, 27.0%; N=705] | 18.5% |

| 隣接 | 差（次−前、正規95% CI） | 判定 |
| --- | --- | --- |
| Q1→Q2 | -13.3pt [-18.1, -8.4] | 統計的減少 |
| Q2→Q3 | -2.1pt [-6.6, 2.4] | 点推定減少（CIは0を跨ぐ） |
| Q3→Q4 | -0.1pt [-4.6, 4.3] | 点推定減少（CIは0を跨ぐ） |

### first-combat-core-only-class-quartile

- 定義: 現行 first combatCoreScore のみ（職内 quartile）
- Q4−Q1（職内 centered）: 1.8pt [-2.8, 6.3]。CI上限<0=不成立
- Q1→Q4 統計的単調減少: 不成立
- trend test: class-stratified Cochran-Armitage、z=0.622、減少方向 p=0.7329、増加方向 p=0.2671
- 統計的非単調（隣接差CI下限>0）: 確認なし
- 職内 centered: 成立
- サンプル十分性（全職・全層 N>=30）: 成立
- A1: 不成立 / 未確定

| 層 | N | 指標平均（正規95% CI） | B5死亡率（Wilson95% CI） | 職内centered死亡率 |
| --- | ---: | --- | --- | ---: |
| Q1 | 706 | 0.00 [0.00, 0.00; N=706] | 26.6% [23.5%, 30.0%; N=706] | 20.9% |
| Q2 | 705 | 0.09 [0.08, 0.11; N=705] | 29.2% [26.0%, 32.7%; N=705] | 22.3% |
| Q3 | 705 | 2.64 [2.50, 2.78; N=705] | 28.5% [25.3%, 32.0%; N=705] | 23.4% |
| Q4 | 705 | 8.67 [8.34, 9.00; N=705] | 28.4% [25.2%, 31.8%; N=705] | 19.8% |

| 隣接 | 差（次−前、正規95% CI） | 判定 |
| --- | --- | --- |
| Q1→Q2 | 2.6pt [-2.1, 7.3] | 点推定反転（CIは0を跨ぐ） |
| Q2→Q3 | -0.7pt [-5.4, 4.0] | 点推定減少（CIは0を跨ぐ） |
| Q3→Q4 | -0.1pt [-4.9, 4.6] | 点推定減少（CIは0を跨ぐ） |

### all-combat-core-only-class-quartile

- 定義: 全 combat core 合計のみ（職内 quartile）
- Q4−Q1（職内 centered）: 0.6pt [-3.9, 5.2]。CI上限<0=不成立
- Q1→Q4 統計的単調減少: 不成立
- trend test: class-stratified Cochran-Armitage、z=0.197、減少方向 p=0.5781、増加方向 p=0.4219
- 統計的非単調（隣接差CI下限>0）: 確認なし
- 職内 centered: 成立
- サンプル十分性（全職・全層 N>=30）: 成立
- A1: 不成立 / 未確定

| 層 | N | 指標平均（正規95% CI） | B5死亡率（Wilson95% CI） | 職内centered死亡率 |
| --- | ---: | --- | --- | ---: |
| Q1 | 706 | 0.00 [0.00, 0.00; N=706] | 27.3% [24.2%, 30.7%; N=706] | 21.4% |
| Q2 | 705 | 0.28 [0.24, 0.32; N=705] | 28.9% [25.7%, 32.4%; N=705] | 22.6% |
| Q3 | 705 | 3.67 [3.50, 3.84; N=705] | 28.5% [25.3%, 32.0%; N=705] | 22.2% |
| Q4 | 705 | 11.21 [10.79, 11.62; N=705] | 27.9% [24.8%, 31.4%; N=705] | 20.2% |

| 隣接 | 差（次−前、正規95% CI） | 判定 |
| --- | --- | --- |
| Q1→Q2 | 1.6pt [-3.1, 6.3] | 点推定反転（CIは0を跨ぐ） |
| Q2→Q3 | -0.4pt [-5.2, 4.3] | 点推定減少（CIは0を跨ぐ） |
| Q3→Q4 | -0.6pt [-5.3, 4.1] | 点推定減少（CIは0を跨ぐ） |

### all-combat-total-class-quartile

- 定義: equipment + 全 combat core 合計（職内 quartile）
- Q4−Q1（職内 centered）: -10.9pt [-15.4, -6.3]。CI上限<0=成立
- Q1→Q4 統計的単調減少: 成立
- trend test: class-stratified Cochran-Armitage、z=-4.744、減少方向 p=<0.0001、増加方向 p=1.0000
- 統計的非単調（隣接差CI下限>0）: 確認なし
- 職内 centered: 成立
- サンプル十分性（全職・全層 N>=30）: 成立
- A1: 成立

| 層 | N | 指標平均（正規95% CI） | B5死亡率（Wilson95% CI） | 職内centered死亡率 |
| --- | ---: | --- | --- | ---: |
| Q1 | 706 | 31.17 [30.66, 31.68; N=706] | 34.4% [31.0%, 38.0%; N=706] | 25.9% |
| Q2 | 705 | 40.84 [40.16, 41.51; N=705] | 28.5% [25.3%, 32.0%; N=705] | 21.0% |
| Q3 | 705 | 51.56 [50.77, 52.34; N=705] | 26.2% [23.1%, 29.6%; N=705] | 21.2% |
| Q4 | 705 | 72.74 [71.49, 73.98; N=705] | 23.5% [20.6%, 26.8%; N=705] | 18.4% |

| 隣接 | 差（次−前、正規95% CI） | 判定 |
| --- | --- | --- |
| Q1→Q2 | -5.9pt [-10.7, -1.1] | 統計的減少 |
| Q2→Q3 | -2.3pt [-6.9, 2.4] | 点推定減少（CIは0を跨ぐ） |
| Q3→Q4 | -2.7pt [-7.2, 1.8] | 点推定減少（CIは0を跨ぐ） |

### current-total-global-quartile

- 定義: 現行 total（全職 global quartile / 上位25%）
- Q4−Q1（職内 centered）: -12.6pt [-17.1, -8.2]。CI上限<0=成立
- Q1→Q4 統計的単調減少: 不成立
- trend test: class-stratified Cochran-Armitage、z=-5.307、減少方向 p=<0.0001、増加方向 p=1.0000
- 統計的非単調（隣接差CI下限>0）: 確認なし
- 職内 centered: 不成立
- サンプル十分性（全職・全層 N>=30）: 未確定
- A1: 不成立 / 未確定

| 層 | N | 指標平均（正規95% CI） | B5死亡率（Wilson95% CI） | 職内centered死亡率 |
| --- | ---: | --- | --- | ---: |
| Q1 | 706 | 28.16 [27.68, 28.63; N=706] | 37.0% [33.5%, 40.6%; N=706] | 29.8% |
| Q2 | 705 | 39.59 [39.37, 39.82; N=705] | 28.5% [25.3%, 32.0%; N=705] | 22.4% |
| Q3 | 705 | 51.20 [50.88, 51.51; N=705] | 27.2% [24.1%, 30.6%; N=705] | 22.0% |
| Q4 | 705 | 73.61 [72.66, 74.55; N=705] | 20.0% [17.2%, 23.1%; N=705] | 18.8% |

| 隣接 | 差（次−前、正規95% CI） | 判定 |
| --- | --- | --- |
| Q1→Q2 | -8.5pt [-13.3, -3.6] | 統計的減少 |
| Q2→Q3 | -1.3pt [-6.0, 3.4] | 点推定減少（CIは0を跨ぐ） |
| Q3→Q4 | -7.2pt [-11.7, -2.8] | 統計的減少 |

### all-combat-total-global-quartile

- 定義: equipment + 全 combat core 合計（全職 global quartile / 上位25%）
- Q4−Q1（職内 centered）: -11.9pt [-16.4, -7.5]。CI上限<0=成立
- Q1→Q4 統計的単調減少: 不成立
- trend test: class-stratified Cochran-Armitage、z=-5.160、減少方向 p=<0.0001、増加方向 p=1.0000
- 統計的非単調（隣接差CI下限>0）: 確認なし
- 職内 centered: 不成立
- サンプル十分性（全職・全層 N>=30）: 未確定
- A1: 不成立 / 未確定

| 層 | N | 指標平均（正規95% CI） | B5死亡率（Wilson95% CI） | 職内centered死亡率 |
| --- | ---: | --- | --- | ---: |
| Q1 | 706 | 28.24 [27.76, 28.72; N=706] | 36.0% [32.5%, 39.6%; N=706] | 28.8% |
| Q2 | 705 | 40.17 [39.93, 40.41; N=705] | 29.4% [26.1%, 32.8%; N=705] | 23.5% |
| Q3 | 705 | 52.38 [52.06, 52.71; N=705] | 27.7% [24.5%, 31.1%; N=705] | 20.5% |
| Q4 | 705 | 75.51 [74.50, 76.53; N=705] | 19.7% [16.9%, 22.8%; N=705] | 18.6% |

| 隣接 | 差（次−前、正規95% CI） | 判定 |
| --- | --- | --- |
| Q1→Q2 | -6.6pt [-11.5, -1.7] | 統計的減少 |
| Q2→Q3 | -1.7pt [-6.4, 3.0] | 点推定減少（CIは0を跨ぐ） |
| Q3→Q4 | -7.9pt [-12.4, -3.5] | 統計的減少 |

## 分解診断

現行 total の Q1〜Q4は equipmentStatScore と first combatCoreScore の和。全 combat core 合計は測定専用派生値であり、既存の装備選択スコアは変更していない。

### 現行 total quartile の寄与

| 層 | equipmentStatScore平均 | first combatCoreScore平均 | 全 combat core平均 | first/現行total | all-core/(equipment+all-core) | 複数combat core率 |
| --- | --- | --- | --- | ---: | ---: | --- |
| Q1 | 29.81 [29.31, 30.30; N=706] | 1.24 [1.08, 1.40; N=706] | 1.58 [1.35, 1.81; N=706] | 4.0% | 5.0% | 11.0% [8.9%, 13.6%; N=706] |
| Q2 | 37.78 [37.11, 38.45; N=705] | 2.34 [2.11, 2.58; N=705] | 3.26 [2.92, 3.59; N=705] | 5.8% | 7.9% | 22.7% [19.8%, 25.9%; N=705] |
| Q3 | 46.70 [45.87, 47.53; N=705] | 3.66 [3.29, 4.04; N=705] | 4.63 [4.21, 5.05; N=705] | 7.3% | 9.0% | 30.4% [27.1%, 33.8%; N=705] |
| Q4 | 66.86 [65.71, 68.00; N=705] | 4.16 [3.78, 4.54; N=705] | 5.69 [5.19, 6.19; N=705] | 5.9% | 7.8% | 36.6% [33.1%, 40.2%; N=705] |

- B5 entrant内 複数combat core: 25.2% [23.6%, 26.8%; N=2821]。first coreのみが全core合計を過小評価するrun: 16.9% [15.6%, 18.3%; N=2821]。全体の first→all 差: 0.94 [0.83, 1.05; N=2821]、複数core限定: 3.73 [3.35, 4.10; N=710]。

### Q3→Q4反転の切り分け

各 component-only ranking でも同じ A1 層定義を使い、Q4−Q3 B5死亡率を比較した。反転が equipment-only でも出れば装備総量側、all-core-only でのみ出れば core scoring側を示す。これは同一runの再ランキングで、因果分解ではない。

| ranking | Q3死亡率 | Q4死亡率 | Q4−Q3（正規95% CI） |
| --- | --- | --- | --- |
| equipment-only-class-quartile | 23.8% [20.8%, 27.1%; N=705] | 23.7% [20.7%, 27.0%; N=705] | -0.1pt [-4.6, 4.3] |
| first-combat-core-only-class-quartile | 28.5% [25.3%, 32.0%; N=705] | 28.4% [25.2%, 31.8%; N=705] | -0.1pt [-4.9, 4.6] |
| all-combat-core-only-class-quartile | 28.5% [25.3%, 32.0%; N=705] | 27.9% [24.8%, 31.4%; N=705] | -0.6pt [-5.3, 4.1] |

- 3比較とも差の95% CIが0を跨ぐ。点推定の方向は観測事実だが、反転の実在も主因もこのNでは確定しない。

## 測定記録

- env hash: `e79d51f4d7ce5e701e0e73db97afc9ee051d609b9a652e278ab84b0518897bda`。期待固定 hash: `e79d51f4d7ce5e701e0e73db97afc9ee051d609b9a652e278ab84b0518897bda`
- source commit: `21322272216f5ad0e25ed85b3e55517e52e8ed0b`
- resolved parallelism: 15（availableParallelism=15、`SIM_PARALLEL`未指定）
- `SIM_MAP_CACHE_ENTRIES`未指定（既定1024）
- wall-clock: calibration 90.127s + simulation 30.840s = 120.967s
- CPU: calibration 113.429s + simulation 457.490s = 570.919s
- raw JSONL SHA-256: `ee10e70724f3d47a57105613b0d7bc533872f0fecd24dba69c23a165e8a003a0`
- summary JSON SHA-256: `1eb4b34f5916d207d146ffd7698f5aa195f17b7ae64ddbb7db665bc4ad60504f`

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
node --check scratch/simulations/sim_depth_material_ev.js
node --check scratch/simulations/sim_issue_461_baseline.js
node --check scratch/simulations/sim_issue_470_build_definition.js
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
SIM_MAP_STATS=0 SIM_DAMAGE_PROBE=0 node scratch/simulations/sim_issue_470_build_definition.js
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
