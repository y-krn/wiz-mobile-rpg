# Issue #599 段階2 探索呪文 before/after 測定

実行モード: full（各職N=500）。Priest / Mageを主対象、Fighter / Thiefを対照とした。
target depth: B20。workshop分布は段階1と同じ6条件加重（合計1200）で、率は全run分母を明記し、Wilson 95% CIを付けた。

## 実行サマリー

| 条件 | SIM_EXPLORE_SPELLS | N/職 | rows | calibration wall | simulation wall | child wall | 並列度 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| before（呪文なし） | <unset> | 500 | 2000 | 0.000s（shared） | 6.359s | 6.529s | 15 |
| after（呪文あり） | on | 500 | 2000 | 9.534s | 5.732s | 15.424s | 15 |

親プロセスでのbefore+after wall: 21.957s。
平均のCIは正規近似95% CI。Wilson 95% CIは二項率（到達・突破・死亡・生存）に適用した。

## 到達・突破・死亡率

率はすべて職業別の全run分母。Wilson 95% CI、括弧内は成功数/分母。
B5/B10の突破率は `reachedFloor>5` / `reachedFloor>10`、死亡率は `deathFloor===5` / `deathFloor===10`。

| 職業 | 条件 | N | B5到達率 | B5突破率 | B5死亡率 | B10到達率 | B10突破率 | B10死亡率 | B20生存率 |
| --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- |
| 戦士 | before（off） | 500 | 76.4% [72.5, 79.9] (382/500) | 31.2% [27.3, 35.4] (156/500) | 9.8% [7.5, 12.7] (49/500) | 16.0% [13.0, 19.5] (80/500) | 11.4% [8.9, 14.5] (57/500) | 0.6% [0.2, 1.7] (3/500) | 0.4% [0.1, 1.4] (2/500) |
| 戦士 | after（on） | 500 | 76.4% [72.5, 79.9] (382/500) | 31.2% [27.3, 35.4] (156/500) | 9.8% [7.5, 12.7] (49/500) | 16.0% [13.0, 19.5] (80/500) | 11.4% [8.9, 14.5] (57/500) | 0.6% [0.2, 1.7] (3/500) | 0.4% [0.1, 1.4] (2/500) |
| 盗賊 | before（off） | 500 | 73.0% [68.9, 76.7] (365/500) | 12.8% [10.2, 16.0] (64/500) | 37.6% [33.5, 41.9] (188/500) | 7.6% [5.6, 10.3] (38/500) | 3.8% [2.4, 5.9] (19/500) | 0.6% [0.2, 1.7] (3/500) | 0.0% [0.0, 0.8] (0/500) |
| 盗賊 | after（on） | 500 | 73.0% [68.9, 76.7] (365/500) | 12.8% [10.2, 16.0] (64/500) | 37.6% [33.5, 41.9] (188/500) | 7.6% [5.6, 10.3] (38/500) | 3.8% [2.4, 5.9] (19/500) | 0.6% [0.2, 1.7] (3/500) | 0.0% [0.0, 0.8] (0/500) |
| 僧侶 | before（off） | 500 | 50.2% [45.8, 54.6] (251/500) | 15.8% [12.9, 19.3] (79/500) | 32.8% [28.8, 37.0] (164/500) | 9.2% [7.0, 12.1] (46/500) | 6.6% [4.7, 9.1] (33/500) | 0.6% [0.2, 1.7] (3/500) | 0.0% [0.0, 0.8] (0/500) |
| 僧侶 | after（on） | 500 | 37.4% [33.3, 41.7] (187/500) | 4.0% [2.6, 6.1] (20/500) | 31.8% [27.9, 36.0] (159/500) | 2.2% [1.2, 3.9] (11/500) | 1.4% [0.7, 2.9] (7/500) | 0.4% [0.1, 1.4] (2/500) | 0.0% [0.0, 0.8] (0/500) |
| 魔術師 | before（off） | 500 | 76.0% [72.1, 79.5] (380/500) | 27.6% [23.9, 31.7] (138/500) | 22.2% [18.8, 26.0] (111/500) | 19.0% [15.8, 22.7] (95/500) | 16.6% [13.6, 20.1] (83/500) | 0.4% [0.1, 1.4] (2/500) | 0.6% [0.2, 1.7] (3/500) |
| 魔術師 | after（on） | 500 | 76.0% [72.1, 79.5] (380/500) | 26.4% [22.7, 30.4] (132/500) | 23.4% [19.9, 27.3] (117/500) | 17.8% [14.7, 21.4] (89/500) | 15.0% [12.1, 18.4] (75/500) | 0.6% [0.2, 1.7] (3/500) | 1.0% [0.4, 2.3] (5/500) |

## 探索歩数・遭遇回数・有効ターン数

平均/run。率ではないため、括弧内は正規近似95% CI（N=分母）。 列ごとに全run、B5到達run、B10到達runの分母を分離する。

### 探索歩数

| 職業 | 条件 | 全run | B5到達run | B10到達run |
| --- | --- | --- | --- | --- |
| 戦士 | before（off） | 287.25 [270.15, 304.34; N=500] | 344.22 [325.35, 363.09; N=382] | 655.00 [621.62, 688.38; N=80] |
| 戦士 | after（on） | 287.25 [270.15, 304.34; N=500] | 344.22 [325.35, 363.09; N=382] | 655.00 [621.62, 688.38; N=80] |
| 盗賊 | before（off） | 216.95 [204.93, 228.96; N=500] | 263.02 [249.59, 276.45; N=365] | 580.63 [536.14, 625.13; N=38] |
| 盗賊 | after（on） | 216.95 [204.93, 228.96; N=500] | 263.02 [249.59, 276.45; N=365] | 580.63 [536.14, 625.13; N=38] |
| 僧侶 | before（off） | 198.37 [183.19, 213.56; N=500] | 312.91 [291.24, 334.57; N=251] | 624.35 [579.13, 669.57; N=46] |
| 僧侶 | after（on） | 153.10 [143.30, 162.90; N=500] | 251.78 [236.79, 266.76; N=187] | 530.45 [443.64, 617.27; N=11] |
| 魔術師 | before（off） | 317.95 [297.52, 338.38; N=500] | 376.88 [353.13, 400.63; N=380] | 728.22 [690.23, 766.21; N=95] |
| 魔術師 | after（on） | 310.31 [291.33, 329.29; N=500] | 366.83 [344.99, 388.67; N=380] | 705.80 [672.76, 738.83; N=89] |

### 遭遇回数

| 職業 | 条件 | 全run | B5到達run | B10到達run |
| --- | --- | --- | --- | --- |
| 戦士 | before（off） | 22.24 [21.02, 23.47; N=500] | 26.03 [24.66, 27.40; N=382] | 47.81 [45.42, 50.21; N=80] |
| 戦士 | after（on） | 22.24 [21.02, 23.47; N=500] | 26.03 [24.66, 27.40; N=382] | 47.81 [45.42, 50.21; N=80] |
| 盗賊 | before（off） | 17.31 [16.36, 18.26; N=500] | 20.38 [19.28, 21.48; N=365] | 45.68 [41.94, 49.43; N=38] |
| 盗賊 | after（on） | 17.31 [16.36, 18.26; N=500] | 20.38 [19.28, 21.48; N=365] | 45.68 [41.94, 49.43; N=38] |
| 僧侶 | before（off） | 15.19 [13.99, 16.40; N=500] | 23.98 [22.24, 25.72; N=251] | 49.50 [46.10, 52.90; N=46] |
| 僧侶 | after（on） | 6.83 [6.36, 7.30; N=500] | 11.11 [10.31, 11.92; N=187] | 26.18 [20.02, 32.34; N=11] |
| 魔術師 | before（off） | 22.78 [21.37, 24.19; N=500] | 26.39 [24.71, 28.08; N=380] | 51.86 [49.26, 54.47; N=95] |
| 魔術師 | after（on） | 20.50 [19.44, 21.56; N=500] | 23.39 [22.15, 24.63; N=380] | 42.81 [41.02, 44.60; N=89] |

### 明かり有効ターン数

| 職業 | 条件 | 全run | B5到達run | B10到達run |
| --- | --- | --- | --- | --- |
| 戦士 | before（off） | 0.00 [0.00, 0.00; N=500] | 0.00 [0.00, 0.00; N=382] | 0.00 [0.00, 0.00; N=80] |
| 戦士 | after（on） | 0.00 [0.00, 0.00; N=500] | 0.00 [0.00, 0.00; N=382] | 0.00 [0.00, 0.00; N=80] |
| 盗賊 | before（off） | 0.00 [0.00, 0.00; N=500] | 0.00 [0.00, 0.00; N=365] | 0.00 [0.00, 0.00; N=38] |
| 盗賊 | after（on） | 0.00 [0.00, 0.00; N=500] | 0.00 [0.00, 0.00; N=365] | 0.00 [0.00, 0.00; N=38] |
| 僧侶 | before（off） | 0.00 [0.00, 0.00; N=500] | 0.00 [0.00, 0.00; N=251] | 0.00 [0.00, 0.00; N=46] |
| 僧侶 | after（on） | 129.33 [121.63, 137.04; N=500] | 216.37 [205.64, 227.11; N=187] | 428.00 [356.84, 499.16; N=11] |
| 魔術師 | before（off） | 0.00 [0.00, 0.00; N=500] | 0.00 [0.00, 0.00; N=380] | 0.00 [0.00, 0.00; N=95] |
| 魔術師 | after（on） | 0.00 [0.00, 0.00; N=500] | 0.00 [0.00, 0.00; N=380] | 0.00 [0.00, 0.00; N=89] |

### MASFEAL有効ターン数

| 職業 | 条件 | 全run | B5到達run | B10到達run |
| --- | --- | --- | --- | --- |
| 戦士 | before（off） | 0.00 [0.00, 0.00; N=500] | 0.00 [0.00, 0.00; N=382] | 0.00 [0.00, 0.00; N=80] |
| 戦士 | after（on） | 0.00 [0.00, 0.00; N=500] | 0.00 [0.00, 0.00; N=382] | 0.00 [0.00, 0.00; N=80] |
| 盗賊 | before（off） | 0.00 [0.00, 0.00; N=500] | 0.00 [0.00, 0.00; N=365] | 0.00 [0.00, 0.00; N=38] |
| 盗賊 | after（on） | 0.00 [0.00, 0.00; N=500] | 0.00 [0.00, 0.00; N=365] | 0.00 [0.00, 0.00; N=38] |
| 僧侶 | before（off） | 0.00 [0.00, 0.00; N=500] | 0.00 [0.00, 0.00; N=251] | 0.00 [0.00, 0.00; N=46] |
| 僧侶 | after（on） | 0.00 [0.00, 0.00; N=500] | 0.00 [0.00, 0.00; N=187] | 0.00 [0.00, 0.00; N=11] |
| 魔術師 | before（off） | 0.00 [0.00, 0.00; N=500] | 0.00 [0.00, 0.00; N=380] | 0.00 [0.00, 0.00; N=95] |
| 魔術師 | after（on） | 24.39 [19.24, 29.54; N=500] | 32.09 [25.51, 38.68; N=380] | 108.82 [90.87, 126.77; N=89] |

## 探索呪文の使用回数

全run分母。各セルは `合計 / 平均/run（正規近似95% CI）`。DUMAPICは座標報告のみで深度指標に影響しないため詠唱対象外。

| 職業 | 条件 | N | MILWA | LOMILWA | MASFEAL | 探索呪文合計 |
| --- | --- | ---: | --- | --- | --- | --- |
| 戦士 | before（off） | 500 | 0 / 0.00 [0.00, 0.00; N=500] | 0 / 0.00 [0.00, 0.00; N=500] | 0 / 0.00 [0.00, 0.00; N=500] | 0 / 0.00 [0.00, 0.00; N=500] |
| 戦士 | after（on） | 500 | 0 / 0.00 [0.00, 0.00; N=500] | 0 / 0.00 [0.00, 0.00; N=500] | 0 / 0.00 [0.00, 0.00; N=500] | 0 / 0.00 [0.00, 0.00; N=500] |
| 盗賊 | before（off） | 500 | 0 / 0.00 [0.00, 0.00; N=500] | 0 / 0.00 [0.00, 0.00; N=500] | 0 / 0.00 [0.00, 0.00; N=500] | 0 / 0.00 [0.00, 0.00; N=500] |
| 盗賊 | after（on） | 500 | 0 / 0.00 [0.00, 0.00; N=500] | 0 / 0.00 [0.00, 0.00; N=500] | 0 / 0.00 [0.00, 0.00; N=500] | 0 / 0.00 [0.00, 0.00; N=500] |
| 僧侶 | before（off） | 500 | 0 / 0.00 [0.00, 0.00; N=500] | 0 / 0.00 [0.00, 0.00; N=500] | 0 / 0.00 [0.00, 0.00; N=500] | 0 / 0.00 [0.00, 0.00; N=500] |
| 僧侶 | after（on） | 500 | 2065 / 4.13 [3.95, 4.31; N=500] | 214 / 0.43 [0.37, 0.49; N=500] | 0 / 0.00 [0.00, 0.00; N=500] | 2279 / 4.56 [4.36, 4.75; N=500] |
| 魔術師 | before（off） | 500 | 0 / 0.00 [0.00, 0.00; N=500] | 0 / 0.00 [0.00, 0.00; N=500] | 0 / 0.00 [0.00, 0.00; N=500] | 0 / 0.00 [0.00, 0.00; N=500] |
| 魔術師 | after（on） | 500 | 0 / 0.00 [0.00, 0.00; N=500] | 0 / 0.00 [0.00, 0.00; N=500] | 365 / 0.73 [0.58, 0.88; N=500] | 365 / 0.73 [0.58, 0.88; N=500] |

## Fighter / Thief 対照チェック

同一run key（scenario/class/runIndex）を突き合わせ、要求指標と探索呪文使用のraw行を比較した。差が出た場合は測定側のバグ疑いとして扱う。

| 職業 | paired N | on/off raw数値 | 判定 |
| --- | ---: | --- | --- |
| 戦士 | 500 | bitwise identical | 効果が発生していない（測定側control pass） |
| 盗賊 | 500 | bitwise identical | 効果が発生していない（測定側control pass） |

## 点推定の読み方

- 戦士のB5/B10/B20到達・死亡点推定はビット単位で一致したため、「差が無い」ではなく「効果が発生していない」と記載する。
- 盗賊のB5/B10/B20到達・死亡点推定はビット単位で一致したため、「差が無い」ではなく「効果が発生していない」と記載する。
- 僧侶のB5/B10/B20到達・死亡点推定は一致しないため、効果が発生している。
- 魔術師のB5/B10/B20到達・死亡点推定は一致しないため、効果が発生している。
- 探索呪文の使用回数・有効ターン数は、beforeでは0、afterでは対象職で発生することを別表で確認する。

## 判断

- 「効果が切れたら唱える」という単純な方針は有害である。遭遇回避が経験値機会を削り、レベルが追いつかないためである。段階1〜2の測定では `finalLevel` 平均が 3.66 → 2.29 に低下した。
- 既定を `off` にするのは、上記の有害と実証された方針を、以後の深度測定すべてに載せないためである。`SIM_EXPLORE_SPELLS=on` を明示した場合だけ、従来どおり詠唱する。
- `SIM_EXPLORE_SPELLS=on` の測定は、「明かりを常時維持する」という特定方針の測定であり、実プレイの最適行動ではない。EVに合った使用判断は別途検討する。
- MP枯渇は原因ではない。`mpDepleted` は 35.3% → 14.7% と低下しているのに生存が悪化しており、MP不足が原因ではないと切り分けられている。

## 固定条件・環境ハッシュ・再現

- source commit: `3efc7ad6f648220b6900eda68c34fbead19b5042`
- origin/main ancestor: `true`; stale tree allowed: `false`
- summary path: `/Users/ottan/.gemini/antigravity/scratch/wiz-mobile-rpg/.claude/worktrees/issue-599-explore-spells-stage2/scratch/results/issue-599-explore-spells.md`
- before raw JSONL: `/Users/ottan/.gemini/antigravity/scratch/wiz-mobile-rpg/.claude/worktrees/issue-599-explore-spells-stage2/scratch/results/issue-599-explore-spells-before.jsonl`; SHA-256 `0b59c9308d47e2eb6fc0f42b8f553d2a8184b8013819a66ce61077c177c4fa83`（gitignore対象）
- after raw JSONL: `/Users/ottan/.gemini/antigravity/scratch/wiz-mobile-rpg/.claude/worktrees/issue-599-explore-spells-stage2/scratch/results/issue-599-explore-spells-after.jsonl`; SHA-256 `9bbe36dcb9f8cefd73ad826a1e48fd82908e2eb6134b1ee1ac7b0670bd05bccd`（gitignore対象）
- shared calibration profile SHA-256: `06399b219eb73affaa75e07d0f71c07519e8b012e8e9a2dda2637c2c03526688`（afterでN=100/scenarioを作成し、beforeが再利用）
- before environment hash: `fcd72f4d7ae8663a52dea17567ddf483def6ed071e3dfda864562e3061932f47`
- after environment hash: `f65e9ef26ba327a42425729c7444b189aa03ecea02c7078487a909cca9a23b8b`
- comparison environment hash: `a5b360e3b5f2159e7c46b6bcf9a7974510bcae13dcbaf7b78101b5fe7fe64c9e`

固定env（比較hash対象。SIM_EXPLORE_SPELLSだけは下記のbefore/after差分）:

```text
BLOOD_WAND_HP_PAYMENT_MIN_RATE=0.50
DEPARTURE_CRAFT_IDS=TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION
ELITE_POLICY=avoid
FLEE_HP_THRESHOLD=0.20
FLEE_POLICY=ev
HEAL_POTION_MERCHANT_POLICY=missing
HEAL_POTION_THRESHOLD=0.55
IDENTIFICATION_COST_OVERRIDE=1
IDENTIFICATION_POLICY=powder
IDENTIFICATION_STARTING_POWDER=2
ISSUE599_CALIBRATION_RUNS=100
ISSUE599_COMPARISON=before=unset vs after=on; same task keys and seed base
ISSUE599_DIAGNOSTICS=not collected
ISSUE599_DUMAPIC=not cast; no combat/depth effect
ISSUE599_MANUAL_RANDOM_SEQUENCE=hash(SIM_SEED:issue599:scenarioId:className:runIndex)
ISSUE599_RUNS_PER_CLASS=500
ISSUE599_SCENARIOS=workshop-empty,workshop-stats,workshop-gear,workshop-blood-wand,workshop-blood-wand-spells,workshop-complete
ISSUE599_SHARED_CALIBRATION=calibrated here; shared to before
ISSUE599_TARGET_DEPTH=20
ISSUE599_WORKSHOP_DISTRIBUTION=workshop-empty:30/1200,workshop-stats:74/1200,workshop-gear:69/1200,workshop-blood-wand:216/1200,workshop-blood-wand-spells:47/1200,workshop-complete:764/1200
PORTAL_HP_THRESHOLD=0.35
PORTAL_MAX_HEAL_POTIONS=0
PORTAL_MIN_FLOOR=3
SIM_440_CONDITION=current
SIM_CALIBRATION_RUNS=100
SIM_CORE_SCORE_DROP_TOLERANCE=0
SIM_DIALMA_CANDIDATE=1
SIM_EXPLORE_SPELLS=<mode-specific; see above>
SIM_EXPLORE_SPELLS_AFTER=on
SIM_EXPLORE_SPELLS_BEFORE=<unset>
SIM_INDEPENDENT_RUN_RANDOM=0
SIM_MADI_CANDIDATE=1
SIM_MADI_COST=
SIM_MADI_HEAL_MAX=
SIM_MADI_HEAL_MIN=
SIM_MAP_CACHE_ENTRIES=<omitted; runtime default 1024>
SIM_PARALLEL=<omitted; runtime default>
SIM_PRESET=
SIM_RUNS=500
SIM_SCENARIOS=workshop-empty,workshop-stats,workshop-gear,workshop-blood-wand,workshop-blood-wand-spells,workshop-complete
SIM_SEED=461
SIM_SKIP_PROVENANCE=<omitted>
STATUS_CURE_HP_THRESHOLD=0.35
STATUS_CURE_MERCHANT_POLICY=missing
STATUS_CURE_POLICY=smart
TRAP_AVOIDANCE_POLICY=ev
TRAP_DAMAGE_MULTIPLIER=1
TRAP_POLICY=conservative
```

再現コマンド:

```sh
node --check scratch/sim_issue_599_explore_spells.js
ISSUE599_SMOKE=1 node scratch/sim_issue_599_explore_spells.js
node scratch/sim_issue_599_explore_spells.js
```

## 既知の制約

- `repelTurns > 0` のガードは `(!state.repelTurns || state.repelTurns <= 0) && Math.random() < ...` の短絡評価である。そのためMASFEAL有効中は `Math.random()` 自体が呼ばれず、同一seedでもon/offの乱数消費列は完全一致しない。
- これは呪文効果そのものに起因し避けられない。各条件は同じscenario/class/runIndexのseedを起点にした疑似ペアで、開始時の装備・マップ生成条件は揃えるが、独立ストリームより分散が低い想定として扱う。
- Fighter / Thiefに差が出た場合は、探索呪文を持たない職業が動いたことになるため、測定側のバグ疑いとして報告する。
- 点推定がビット単位で一致した箇所は「差が無い」ではなく「効果が発生していない」と解釈した。
