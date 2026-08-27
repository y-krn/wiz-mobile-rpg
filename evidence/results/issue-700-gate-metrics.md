# Issue #700 legacy / EV 関門指標（同一条件の対比較）

- source commit: `2fe532c6e88347efee3e5218b493ac49da481c5b`
- origin/main base: `ff1403a424841e62aa7a0c5414d6af331a1657f7`（HEAD の祖先: true）
- 再現性: harness は `/private/tmp` の一時 clone で上記 source を checkout し、clone 内の `origin/main` を上記 base に固定してから ancestry を検証する。したがって後続の PR 文書 commit で測定 source/hash は変わらない。
- 条件: N=500 / 職、4職合計 2000 run、SIM_SEED=231、SIM_CALIBRATION_RUNS=100、SIM_PARALLEL=未指定
- 共通条件: #699 の既存 `sim_commit_depth_624.js` harness、実 `sim_depth_material_ev.js` / `generateRunFloor` 経路、`SIM_INDEPENDENT_RUN_RANDOM=1`、出発クラフト・罠・逃走・薬・装備条件は legacy/EV 共通。
- legacy: `STATUS_CURE_POLICY=legacy STATUS_CURE_HP_THRESHOLD=0.35`。EV: `STATUS_CURE_POLICY=ev`（HP率値は EV 判定では参照しない）。

## 定義

既存 sim の定義をそのまま集計: B5 entrant=`reachedFloor >= 5`、B5 death=`deathFloor === 5`、B5 mortality=B5 death/B5 entrant、B10 reached=`reachedFloor >= 10`、B10 reach rate=B10 reached/全run。

## 関門指標

| 条件 / 職 | B5 entrant | B5 deaths | B5 mortality | B10 reached | B10 reach rate |
| --- | ---: | ---: | ---: | ---: | ---: |
| legacy / overall | 1525 | 432 | 28.33% | 529 | 26.45% |
| legacy / Fighter | 360 | 42 | 11.67% | 88 | 17.60% |
| legacy / Thief | 475 | 207 | 43.58% | 149 | 29.80% |
| legacy / Priest | 241 | 112 | 46.47% | 69 | 13.80% |
| legacy / Mage | 449 | 71 | 15.81% | 223 | 44.60% |
| ev / overall | 1578 | 444 | 28.14% | 686 | 34.30% |
| ev / Fighter | 389 | 42 | 10.80% | 174 | 34.80% |
| ev / Thief | 473 | 203 | 42.92% | 189 | 37.80% |
| ev / Priest | 259 | 141 | 54.44% | 48 | 9.60% |
| ev / Mage | 457 | 58 | 12.69% | 275 | 55.00% |

## B5 entrant 分母の変化（EV − legacy）

| 職 | legacy entrant | EV entrant | 差 | 相対差 |
| --- | ---: | ---: | ---: | ---: |
| overall | 1525 | 1578 | +53 | 3.48% |
| Fighter | 360 | 389 | +29 | 8.06% |
| Thief | 475 | 473 | -2 | -0.42% |
| Priest | 241 | 259 | +18 | 7.47% |
| Mage | 449 | 457 | +8 | 1.78% |

## 旧基準線の歴史的 provenance

| 職 | #699 historical reference | current-base legacy | 差 |
| --- | ---: | ---: | ---: |
| Fighter | 5.8720 | 6.0840 | 0.2120 |
| Thief | 4.8980 | 7.8340 | 2.9360 |
| Priest | 4.5980 | 5.0480 | 0.4500 |
| Mage | 6.4800 | 9.5920 | 3.1120 |

#699 の旧値は historical provenance の記録であり、current-base acceptance の再現要求ではない。#712/#735/#739/#746/#753/#763/#767/#768 等の後続マージにより current base では旧平均を再現できないため、比較判断には current-base の同一条件ペアだけを使う。

## Decision

- EV B5 mortality 28.14% vs legacy 28.33%: **-0.19 percentage points**; no material worsening.
- EV B10 reach 34.30% vs legacy 26.45%: **+7.85 percentage points**; substantial improvement.
- Current-base threshold status: B5 <=30.9% is met by both policies; B10 >=15.0% is met by both policies.
- Decision: EV status-cure policy is acceptable for this comparison. Retain B5 <=30.9% and B10 >=15.0% unchanged; no evidence supports changing either threshold. Do not change game rules, balance values, items, or economy.

## 決定性・再現性

- legacy replicate 1 SHA-256: `21e1a5c272d8ea3aca5be732151134ec0c7625885d67544367926ba7289855ef`
- legacy replicate 2 SHA-256: `21e1a5c272d8ea3aca5be732151134ec0c7625885d67544367926ba7289855ef`
- EV replicate 1 SHA-256: `b6f89ca6ffe3bd52613e176a11a2c07443ed60a6d7b7da03bda65a780a5328b3`
- EV replicate 2 SHA-256: `b6f89ca6ffe3bd52613e176a11a2c07443ed60a6d7b7da03bda65a780a5328b3`
- legacy raw stdout一致: **PASS**
- EV raw stdout一致: **PASS**
- legacy/EV paired run keys一致（class/run/scenario/randomSequence）: **PASS**

再現コマンド（raw stdout は `/private/tmp/issue-700-gate-metrics-raw/` に保存）:

```sh
node scratch/measurements/issue700_gate_metrics.js
```

ゲーム本体 `src/`、ゲームルール、バランス値、アイテム定義、閾値、経済は変更していない。
