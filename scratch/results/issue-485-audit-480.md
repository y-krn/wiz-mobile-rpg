# Issue #480 floor-trap direction audit after #484

## 条件

宝箱方針を `legacy` に固定し、床罠方針だけを `legacy` / `conservative` で切り替えた。
PR #484 の上薬能動使用を含む固定kit、seed=480、`workshop-complete`、N=1,000/方針。
平均値の95% CIはrunnerのnormal mean CI。これは#341の既定を再判定する正式測定ではない。

## 結果

| 床罠方針 | 平均到達floor | 素材/run | 床罠被害HP/run |
| --- | ---: | ---: | ---: |
| legacy（宝箱legacy） | 3.869 [3.719, 4.019] | 66.064 [62.387, 69.741] | 21.208 [19.696, 22.720] |
| conservative（宝箱legacy） | 3.871 [3.730, 4.012] | 66.242 [62.752, 69.732] | 21.376 [19.790, 22.962] |

conservative−legacy の点差は **+0.002 floor / +0.178素材 / +0.168 HP**。全指標でCIが重なり、
改善・悪化の正式結論は出さない。旧監査の点差（−0.003 / −1.184 / −0.065）から符号は変わったが、
方向監査の範囲に留める。

## 実行記録

```sh
SIM_SEED=480 SIM_RUNS=1000 SIM_CALIBRATION_RUNS=100 TRAP_POLICY=legacy node scratch/sim_issue_480_floor_trap_policy.js
SIM_SEED=480 SIM_RUNS=1000 SIM_CALIBRATION_RUNS=100 TRAP_POLICY=conservative node scratch/sim_issue_480_floor_trap_policy.js
```

- legacy summary JSON SHA-256: `eb48ecddc2633a345bc28f5f58b3cd699bd63553433e8f0d33c49f210aa66b15`
- conservative summary JSON SHA-256: `c951322da0b3ec0fdf17197a4fdbfb0aee063ef9f6f238e507b1d864dc09eef2`
- `SIM_PARALLEL` / `SIM_MAP_CACHE_ENTRIES` は未指定。

Refs #480, #485
