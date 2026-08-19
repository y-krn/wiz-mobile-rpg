# Issue #732 校正 summary

## Decision

採用値は `k_out=40`、`k_in=2` とする。`defResistance = def / (def + k_direction)` の逓減形、`defResistance + physResist` の加算 pool、`[-1, 0.9]` clamp、最低1、物理通常攻撃・逃走追撃・magic-bolt の共通適用は維持する。`k_out` はプレイヤー→敵、`k_in` は敵→プレイヤーである。

修正後の実戦経路へ EV 推定と status-cure fallback を接続して掃引した結果、`40/2` だけが確認した候補のうち4職すべての paired 到達階 CI に0を含めた。`100/3` は修正前の実装候補として再測定したが Mage の CI が0を含まず、不採用とした。旧PRの shared `k=10` も全職を低下させるため採用しない。

## Provenance and conditions

- Tracking #627 の基準線: Fighter 7.9200 / Thief 8.5500 / Priest 4.9760 / Mage 6.9580。これは別時点の historical baseline であり、現行 origin の before と置換しない。
- 比較対象は測定時点の `origin/main` から取り直した before。`origin/main` / base SHA: `db70717de1054cd45ba48e5b9216e5043f4c2101`。
- runner: `scratch/issue624_commit_depth.js` の `baseline-portal-flee`。B21到達、4職各N=500、`SIM_SEED=231`、`SIM_CALIBRATION_RUNS=100`、`SIM_PARALLEL` 未指定、実行時 parallelism=15。
- before source SHA: `db70717de1054cd45ba48e5b9216e5043f4c2101`。
- before raw SHA-256（2回一致）: `0df6cdd2d93fe72d91ae3db9d2303c45272747ee78a3d673e646d9e642ba0362`。
- adopted source SHA: `b6c3d98efa6529f11add064d49d0aa4f9d8dcf2e`。
- adopted raw SHA-256（2回一致）: `af91ecb75a65946a44166e41106ed5f8df6281af074642c550a9018ad03f7a6c`。
- `ISSUE732_DAMAGE_METRICS` は既定off。`=1` の測定だけ hit 数・物理与ダメージ・通常戦闘被ダメージを収集し、戦闘結果・乱数順を変更しないことを smoke test で確認した。
- raw dump はコミットしない。以下は同一条件の raw JSONL から導出した要約である。

## Model change and application stage

- プレイヤー→敵: `rawDamage = calculatePhysicalAttackRawFormula(...)` の後、`combinePhysicalResistances(getPhysicalDefenseResistance(effectiveDef), target.physResist)` を一度だけ適用する。
- 敵→プレイヤー: `finalDef` を `getPhysicalDefenseResistance(finalDef, k_in)` に変換してから、既存の defend/blind/共通 mitigation stage へ進む。
- `getEffectiveDef(mon)` は active DEF buff/debuff を含む shared rule とし、combat resolution と #716 resistance disclosure が同じ入力を読む。
- magic-bolt は通常物理と同じ target physical pool の後で比較する。呪文側の軽減式は変更していない。

## k sweep: arrival-floor mean

`baseline-portal-flee` の4職の到達階平均。B5/B10 の「通過」は `reachedFloor >= 5/10` と定義する。source/raw SHA は各候補の測定 commit と raw JSONL の full SHA-256 である。

| candidate | Fighter | Thief | Priest | Mage | source SHA | raw SHA-256 |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| before | 7.316 | 7.918 | 4.772 | 11.438 | `db70717de1054cd45ba48e5b9216e5043f4c2101` | `0df6cdd2d93fe72d91ae3db9d2303c45272747ee78a3d673e646d9e642ba0362` |
| shared k=5 | 4.032 | 5.606 | 4.400 | 8.584 | `b3e15cbf4f1b87ffba7f039e8d2ae4f1121f8180` | `df0c55a67eb456abdb79b472f2a0a750f91bca7144e5303e06b1d755486bc4f5` |
| shared k=10 | 3.344 | 4.518 | 3.630 | 7.284 | `c859d52de8b12a9aa4789be983d21f493b63463e` | `68d395908894e9ab709c5ac4330fb4202dc65287e466b3f520841a3bf356d01c` |
| k_out=40 / k_in=2 **adopted** | 6.974 | 8.436 | 4.692 | 11.348 | `b6c3d98efa6529f11add064d49d0aa4f9d8dcf2e` | `af91ecb75a65946a44166e41106ed5f8df6281af074642c550a9018ad03f7a6c` |
| k_out=50 / k_in=2 | 7.058 | 8.720 | 4.818 | 11.384 | `f6e480b6a6c46d369f923de0c058b8cffb839a0f` | `f1d9e5cb1dd909e2f5f16b482ebf7df550692151cb5db952a1ecc95df96e1148` |
| k_out=60 / k_in=3 | 6.988 | 8.114 | 4.864 | 10.812 | `ae42331abdd820f766abe0807b5adc982037d33c` | `0f756ae5a3ff803459dc86f2e8e9e63d5aee5f7eabc9ca42e4a7bfe5e575ce39` |
| k_out=100 / k_in=3 | 7.224 | 8.284 | 4.896 | 10.856 | `ebd7ea74bcc9f7903051eca3f61f8770d0d114d3` | `b2d8ff2f726644f7704d541c8c67966bac5bec7bb4fa2d579e3145b8b1f38632` |
| k_out=200 / k_in=3 | 7.162 | 8.136 | 4.814 | 10.798 | `0d6f825e57ed74645621964e5992e909839cd05f` | `f50a0ffc6ded470f07f35c0d24be538f1fe5f9c3e4dc844dcc2dc703633e5c8d` |
| k_out=200 / k_in=2 | 7.316 | 8.690 | 4.826 | 11.274 | `849a568fe62ae8b7aa3ab1e7234105e7bf72b5ec` | `332b632b0a95a3b382cb8a4b556a3a2fb8be6e96ebb9b8c02f9937f244248cbf` |

## Paired arrival-floor delta vs before

Candidate minus before, run-paired by `className/runIndex`, 95% CI, N=500.

| candidate | Fighter | Thief | Priest | Mage | all four CI include 0 | decision |
| --- | --- | --- | --- | --- | --- | --- |
| shared k=5 | -3.284 [-3.780, -2.788] | -2.312 [-2.759, -1.865] | -0.372 [-0.682, -0.062] | -2.854 [-3.439, -2.269] | no | reject: all lower |
| shared k=10 | -3.972 [-4.436, -3.508] | -3.400 [-3.844, -2.956] | -1.142 [-1.445, -0.839] | -4.154 [-4.660, -3.648] | no | reject: all lower |
| k_out=40 / k_in=2 | -0.342 [-0.857, 0.173] | +0.518 [-0.015, 1.051] | -0.080 [-0.331, 0.171] | -0.090 [-0.638, 0.458] | **yes** | adopt |
| k_out=50 / k_in=2 | -0.258 [-0.731, 0.215] | +0.802 [0.279, 1.325] | +0.046 [-0.218, 0.310] | -0.054 [-0.617, 0.509] | no | reject: Thief |
| k_out=60 / k_in=3 | -0.328 [-0.819, 0.163] | +0.196 [-0.293, 0.685] | +0.092 [-0.182, 0.366] | -0.626 [-1.152, -0.100] | no | reject: Mage |
| k_out=100 / k_in=3 | -0.092 [-0.570, 0.386] | +0.366 [-0.133, 0.865] | +0.124 [-0.150, 0.398] | -0.582 [-1.111, -0.053] | no | reject: Mage after EV correction |
| k_out=200 / k_in=3 | -0.154 [-0.615, 0.307] | +0.218 [-0.281, 0.717] | +0.042 [-0.229, 0.313] | -0.640 [-1.162, -0.118] | no | reject: Mage |
| k_out=200 / k_in=2 | 0.000 [-0.468, 0.468] | +0.772 [0.250, 1.294] | +0.054 [-0.220, 0.328] | -0.164 [-0.707, 0.379] | no | reject: Thief |

## B5/B10 acceptance rates: before vs adopted after

Rates are Wilson 95% CI. Every cell has denominator N=500; source/raw SHA identify the exact output table. These rates are reported separately from arrival-floor means.

| version | class | arrival mean [95% CI] | B5 pass [95% CI; successes/denominator] | B10 pass [95% CI; successes/denominator] | source SHA | raw SHA-256 |
| --- | --- | --- | --- | --- | --- | --- |
| before | Fighter | 7.316 [6.838, 7.794] | 64.6% [60.3%, 68.7%; 323/500] | 30.4% [26.5%, 34.6%; 152/500] | `db70717de1054cd45ba48e5b9216e5043f4c2101` | `0df6cdd2d93fe72d91ae3db9d2303c45272747ee78a3d673e646d9e642ba0362` |
| before | Thief | 7.918 [7.507, 8.329] | 92.6% [90.0%, 94.6%; 463/500] | 31.8% [27.9%, 36.0%; 159/500] | `db70717de1054cd45ba48e5b9216e5043f4c2101` | `0df6cdd2d93fe72d91ae3db9d2303c45272747ee78a3d673e646d9e642ba0362` |
| before | Priest | 4.772 [4.461, 5.083] | 48.0% [43.7%, 52.4%; 240/500] | 9.6% [7.3%, 12.5%; 48/500] | `db70717de1054cd45ba48e5b9216e5043f4c2101` | `0df6cdd2d93fe72d91ae3db9d2303c45272747ee78a3d673e646d9e642ba0362` |
| before | Mage | 11.438 [10.918, 11.958] | 93.8% [91.3%, 95.6%; 469/500] | 56.6% [52.2%, 60.9%; 283/500] | `db70717de1054cd45ba48e5b9216e5043f4c2101` | `0df6cdd2d93fe72d91ae3db9d2303c45272747ee78a3d673e646d9e642ba0362` |
| adopted after | Fighter | 6.974 [6.502, 7.446] | 61.8% [57.5%, 66.0%; 309/500] | 26.0% [22.3%, 30.0%; 130/500] | `b6c3d98efa6529f11add064d49d0aa4f9d8dcf2e` | `af91ecb75a65946a44166e41106ed5f8df6281af074642c550a9018ad03f7a6c` |
| adopted after | Thief | 8.436 [7.988, 8.884] | 93.8% [91.3%, 95.6%; 469/500] | 35.8% [31.7%, 40.1%; 179/500] | `b6c3d98efa6529f11add064d49d0aa4f9d8dcf2e` | `af91ecb75a65946a44166e41106ed5f8df6281af074642c550a9018ad03f7a6c` |
| adopted after | Priest | 4.692 [4.411, 4.973] | 49.8% [45.4%, 54.2%; 249/500] | 8.2% [6.1%, 10.9%; 41/500] | `b6c3d98efa6529f11add064d49d0aa4f9d8dcf2e` | `af91ecb75a65946a44166e41106ed5f8df6281af074642c550a9018ad03f7a6c` |
| adopted after | Mage | 11.348 [10.800, 11.896] | 91.6% [88.6%, 93.7%; 458/500] | 54.0% [49.6%, 58.3%; 270/500] | `b6c3d98efa6529f11add064d49d0aa4f9d8dcf2e` | `af91ecb75a65946a44166e41106ed5f8df6281af074642c550a9018ad03f7a6c` |

## Damage telemetry and class differences

Aggregate per-hit means on `baseline-portal-flee` are before → adopted after. The paired per-run CI uses runs with at least one corresponding hit; this is a diagnostic, not the adoption criterion.

| class | player physical hit mean | paired delta CI | normal incoming hit mean | paired delta CI |
| --- | ---: | --- | ---: | --- |
| Fighter | 34.080 → 31.788 | -2.266 [-3.253, -1.280]; N=498 | 1.901 → 1.834 | -0.056 [-0.095, -0.017]; N=500 |
| Thief | 26.146 → 24.013 | -1.571 [-2.405, -0.736]; N=500 | 1.735 → 1.666 | -0.025 [-0.085, 0.035]; N=500 |
| Priest | 19.429 → 18.284 | -0.545 [-1.346, 0.255]; N=234 | 1.671 → 1.676 | -0.014 [-0.044, 0.016]; N=482 |
| Mage | 18.966 → 17.637 | -0.837 [-2.210, 0.537]; N=243 | 1.891 → 1.762 | -0.139 [-0.182, -0.096]; N=498 |

The observed physical hit residual is not neutral for Fighter/Thief, and incoming hit residual remains for Fighter/Mage. This is not claimed as a damage-level success. The adopted decision is based on the Issue target of encounter-distribution paired arrival neutrality; the residual is an unresolved balance limitation.

Arrival class spread is 6.666 before and 6.656 after. Fighter changes -0.342, Thief +0.518, Priest -0.080, Mage -0.090. The near-zero spread change is reported separately; a blanket all-class reduction is not used as evidence of success.

## Impact map

- Physical: outgoing uses `k_out=40`; incoming normal and flee attacks use `k_in=2`; target `physResist` remains in the same additive pool.
- Spells: spell mitigation is unchanged; magic-bolt only shares the existing physical pool as before.
- Common: pool clamp, minimum1, active effective DEF, resistance disclosure, and opt-in telemetry.
- Class: no class values changed; the four-class paired result is reported individually.
- Equipment/level: no DEF, equipment DEF, enemy values, or level progression values changed.
- Fallback: EV damage estimate and status-cure fallback now use effective DEF, target `physResist`, buff attack, and melee modifier through the same outgoing physical formula.

## Modeled, omitted, and unresolved

Modeled: real `simulateRun` / `generateRunFloor` path, actual encounter distribution, physical normal attacks in both directions, flee parting attacks, target `physResist`, active DEF buffs in combat/display, magic-bolt shared pool, class progression, and equipment supplied by the existing sim.

Not separately identified: spell-only mitigation balance, non-normal special damage, guard/defend/status/other percentage stages as independent causal effects, encounter-level attribution from each hit to survival, and why Tracking #627 differs from the current-origin before. EV policies and thresholds were not changed. The direct hit residuals above remain unresolved and require a separate balance decision; no further exploration is included in this Issue.

## Reproduction and verification

```text
node --check src/rules/character_stats.js
node --check src/combat_logic/damage.js
node --check src/data/monsters.js
node --check src/combat_logic/round.js
node --check scratch/sim_depth_material_ev.js
node --check scratch/sim_commit_depth_624.js
ISSUE624_SMOKE=1 ISSUE732_DAMAGE_METRICS=1 node scratch/issue624_commit_depth.js
ISSUE732_DAMAGE_METRICS=1 node scratch/issue624_commit_depth.js
```

Full before and adopted-after runs were each repeated twice with identical raw SHA-256. `SIM_PARALLEL` was omitted. The focused tests cover nonzero `physResist` magic-bolt, incoming DEF, pool lower/upper bounds and minimum1, telemetry off/on no-result-change, effective-DEF display consistency, and the shared equipment physical formula.
