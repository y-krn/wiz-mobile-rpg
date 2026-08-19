# Issue #732 校正 summary

## Decision

採用候補は `k_out=100`、`k_in=3`。`defResistance = def / (def + k_direction)` の逓減形、`defResistance + physResist` の加算pool、`[-1, 0.9]` clamp、物理通常攻撃・逃走追撃・magic-bolt の共通適用は維持する。旧PRの `k=10` は根拠なしとして採用しない。

`k_out` はプレイヤー→敵、`k_in` は敵→プレイヤーである。旧式は両方向でDEFの適用段階と実効単位が異なるため、同一係数を強制しなかった。

## Provenance and conditions

- Tracking #627 の基準線: Fighter 7.9200 / Thief 8.5500 / Priest 4.9480 / Mage 6.9580（過去のTracking値）。
- 比較対象は現行 `origin/main` の再測定。source `db70717de1054cd45ba48e5b9216e5043f4c2101`、到達階平均 Fighter 7.316 / Thief 7.918 / Priest 4.772 / Mage 11.438。
- runner: `scratch/issue624_commit_depth.js` の `baseline-portal-flee`、B21到達、4職各N=500、`SIM_SEED=231`、`SIM_CALIBRATION_RUNS=100`、`SIM_PARALLEL` 未指定。実行時parallelismは15。
- 最終候補 source SHA: `e65dc3fb7ddf919d3b9fc2a69360aacbb467eb1b`。
- 最終候補 raw JSONL SHA-256: `2e7bf9168937ed4919f359f28c4c26ed99aae22b2444a8bd8af6fce309e7e5e4`。同一条件の2回目も同一SHA。
- paired比較のbefore raw SHA-256: `0df6cdd2d93fe72d91ae3db9d2303c45272747ee78a3d673e646d9e642ba0362`。
- `ISSUE732_DAMAGE_METRICS=1` はヒット数・物理与ダメージ・通常戦闘の被ダメージを収集する既定オフの補助テレメトリ。戦闘結果と乱数順は変更しない。
- raw dumpはコミットしない。以下はrawから導出した要約である。

## k sweep: arrival-floor mean

各セルは `baseline-portal-flee` の到達階平均（Fighter / Thief / Priest / Mage）。`before` は上記現行origin/main。

| candidate | Fighter | Thief | Priest | Mage | raw SHA-256 |
| --- | ---: | ---: | ---: | ---: | --- |
| before | 7.316 | 7.918 | 4.772 | 11.438 | `0df6cdd2...` |
| shared k=5 | 3.996 | 5.452 | 4.326 | 9.088 | `7135c62d...` |
| shared k=10（旧PR endpoint） | 3.280 | 4.400 | 3.570 | 7.270 | `35749547...` |
| k_out=40 / k_in=2 | 6.820 | 8.366 | 4.686 | 11.216 | `83135d16...` |
| k_out=50 / k_in=2 | 6.938 | 8.696 | 4.664 | 11.264 | `2df01ff1...` |
| k_out=60 / k_in=3 | 6.794 | 8.012 | 4.712 | 10.882 | `8c8cc50c...` |
| k_out=100 / k_in=3 **採用** | 6.992 | 8.178 | 4.726 | 10.954 | `2e7bf916...` |
| k_out=200 / k_in=3 | 6.938 | 8.044 | 4.674 | 10.822 | `5727405f...` |
| k_out=200 / k_in=2 | 7.134 | 8.818 | 4.756 | 11.424 | `62cb6053...` |

## Paired arrival-floor delta (candidate - before, 95% CI, N=500)

| candidate | Fighter | Thief | Priest | Mage | decision |
| --- | --- | --- | --- | --- | --- |
| shared k=5 | -3.320 [-3.815, -2.825] | -2.466 [-2.908, -2.024] | -0.446 [-0.745, -0.147] | -2.350 [-2.941, -1.759] | reject: all lower |
| k_out=40 / k_in=2 | -0.496 [-0.997, 0.005] | +0.448 [-0.078, 0.974] | -0.086 [-0.295, 0.123] | -0.222 [-0.753, 0.309] | all four include 0 |
| k_out=50 / k_in=2 | -0.378 [-0.846, 0.090] | +0.778 [+0.253, +1.303] | -0.108 [-0.342, 0.126] | -0.174 [-0.717, 0.369] | reject: Thief |
| k_out=60 / k_in=3 | -0.522 [-0.994, -0.050] | +0.094 [-0.387, 0.575] | -0.060 [-0.278, 0.158] | -0.556 [-1.076, -0.036] | reject: Fighter/Mage |
| k_out=100 / k_in=3 **採用** | -0.324 [-0.790, 0.142] | +0.260 [-0.226, 0.746] | -0.046 [-0.266, 0.174] | -0.484 [-1.012, 0.044] | all four include 0 |
| k_out=200 / k_in=3 | -0.378 [-0.824, 0.068] | +0.126 [-0.370, 0.622] | -0.098 [-0.327, 0.131] | -0.616 [-1.134, -0.098] | reject: Mage |
| k_out=200 / k_in=2 | -0.182 [-0.651, 0.287] | +0.900 [+0.382, +1.418] | -0.016 [-0.239, 0.207] | -0.014 [-0.555, 0.527] | reject: Thief |

The explicit four-class paired-CI target is met by `100/3`. The tested higher outgoing scales did not improve the full objective: `200/3` made Mage significantly lower and `200/2` made Thief significantly higher.

## Damage telemetry and class differences

Per-hit means are before → candidate; delta CIs are paired run-level 95% CIs.

| class | player physical hit | delta CI | normal incoming hit | delta CI |
| --- | ---: | --- | ---: | --- |
| Fighter | 27.323 → 25.808 | -1.515 [-2.419, -0.612] | 1.953 → 1.953 | +0.000 [-0.036, 0.037] |
| Thief | 24.045 → 23.155 | -0.890 [-1.706, -0.075] | 1.735 → 1.844 | +0.109 [+0.050, +0.168] |
| Priest | 9.343 → 9.426 | +0.083 [-0.446, 0.611] | 1.823 → 1.832 | +0.009 [-0.010, 0.028] |
| Mage | 11.740 → 11.015 | -0.725 [-1.814, 0.364] | 1.780 → 1.746 | -0.034 [-0.075, 0.008] |

Direct per-hit outgoing damage is not fully neutral for Fighter/Thief; this is an unremoved residual and is not claimed as a success. The selected candidate is based on the stated difficulty-neutralization criterion (four-class arrival paired CIs), while preserving the model structure. No tested damage-only retune satisfied that criterion simultaneously.

Arrival class spread changes from 6.666 (before) to 6.228 (candidate). This is mixed, not a blanket improvement: Fighter–Thief gap widens from 0.602 to 1.186, while Mage–Priest spread narrows from 6.666 to 6.228. The spread reduction is therefore not used as the success criterion.

## Modeled and omitted

Modeled: real `simulateRun` / `generateRunFloor` path, actual encounter distribution, physical normal attacks in both directions, flee parting attacks, target `physResist`, magic-bolt shared physical pool, class progression and equipment as supplied by the existing sim.

Omitted or not separately identified: spell-only mitigation balance, non-normal special damage, guard/defend/status/other percentage stages as independent causal effects, per-encounter attribution of hit damage to survival, and the historical reason the Tracking #627 baseline differs from the current-origin measurement. No enemy DEF, resistance, equipment DEF, spell mitigation, EV policy/threshold, or unrelated issue formula was changed.

## Reproduction

```text
node --check scratch/sim_commit_depth_624.js
ISSUE624_SMOKE=1 ISSUE732_DAMAGE_METRICS=1 node scratch/issue624_commit_depth.js
ISSUE732_DAMAGE_METRICS=1 node scratch/issue624_commit_depth.js
```

The full command was run twice with the same environment and produced identical raw SHA-256. `SIM_PARALLEL` was omitted.
