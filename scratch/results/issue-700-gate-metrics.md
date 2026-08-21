# Issue #700 legacy / EV 関門指標（同一条件の対比較）

- PR source/base: current branch commit / origin/main `ff1403a424841e62aa7a0c5414d6af331a1657f7`
- measurement source: historical #699 EV-policy commit `41b9b5cddf7fc400afb65b4f86d68850659a173b`
- measurement base: pre-#699 commit `8e3379457d522a40d8c22fc454efded6ce84b75d`（source の祖先: true）
- historical worktree は current origin/main に対する意図的な stale tree。各 child result に `originMainAncestor=false` / `staleTreeAllowed=true` を記録し、legacy/EV は同じ historical source/base を共有。
- 条件: N=500 / 職、4職合計 2000 run、SIM_SEED=231、SIM_CALIBRATION_RUNS=100、SIM_PARALLEL=未指定
- 共通条件: #699 の既存 `sim_commit_depth_624.js` harness、実 `sim_depth_material_ev.js` / `generateRunFloor` 経路、`SIM_INDEPENDENT_RUN_RANDOM=1`、出発クラフト・罠・逃走・薬・装備条件は legacy/EV 共通。
- legacy: `STATUS_CURE_POLICY=legacy STATUS_CURE_HP_THRESHOLD=0.35`。EV: `STATUS_CURE_POLICY=ev`（HP率値は EV 判定では参照しない）。

## 定義

既存 sim の定義をそのまま集計: B5 entrant=`reachedFloor >= 5`、B5 death=`deathFloor === 5`、B5 mortality=B5 death/B5 entrant、B10 reached=`reachedFloor >= 10`、B10 reach rate=B10 reached/全run。

## 関門指標

| 条件 / 職 | B5 entrant | B5 deaths | B5 mortality | B10 reached | B10 reach rate |
| --- | ---: | ---: | ---: | ---: | ---: |
| legacy / overall | 1329 | 478 | 35.97% | 221 | 11.05% |
| legacy / Fighter | 356 | 44 | 12.36% | 71 | 14.20% |
| legacy / Thief | 358 | 181 | 50.56% | 25 | 5.00% |
| legacy / Priest | 225 | 130 | 57.78% | 41 | 8.20% |
| legacy / Mage | 390 | 123 | 31.54% | 84 | 16.80% |
| ev / overall | 1425 | 518 | 36.35% | 375 | 18.75% |
| ev / Fighter | 390 | 36 | 9.23% | 160 | 32.00% |
| ev / Thief | 396 | 216 | 54.55% | 67 | 13.40% |
| ev / Priest | 258 | 151 | 58.53% | 55 | 11.00% |
| ev / Mage | 381 | 115 | 30.18% | 93 | 18.60% |

## B5 entrant 分母の変化（EV − legacy）

| 職 | legacy entrant | EV entrant | 差 | 相対差 |
| --- | ---: | ---: | ---: | ---: |
| overall | 1329 | 1425 | +96 | 7.22% |
| Fighter | 356 | 390 | +34 | 9.55% |
| Thief | 358 | 396 | +38 | 10.61% |
| Priest | 225 | 258 | +33 | 14.67% |
| Mage | 390 | 381 | -9 | -2.31% |

## legacy 旧基準線照合

| 職 | 旧基準線 | 今回 legacy 平均到達階 | 差 | 判定 |
| --- | ---: | ---: | ---: | --- |
| Fighter | 5.8720 | 5.8720 | 0.0000 | 一致 |
| Thief | 4.8980 | 4.8980 | 0.0000 | 一致 |
| Priest | 4.5980 | 4.5980 | 0.0000 | 一致 |
| Mage | 6.4800 | 6.4800 | 0.0000 | 一致 |

旧基準線照合: **一致**。歴史的 source/base を再実行して旧値を確認した。

## 受入基準の判定

- B5 mortality <=30.9%: legacy 35.97% / EV 36.35% → FAIL
- B10 reach rate >=15.0%: legacy 11.05% / EV 18.75% → PASS
- 結論: 閾値は変更しない。30.9% は報酬側の損益分岐、15.0% は既存の受入基準であり、今回の方針比較だけでは分岐点自体を変更する根拠にならない。EV は到達・入場分母を変えるため、率だけでなく上表の entrant 数を併読する。

## 決定性・再現性

- legacy replicate 1 SHA-256: `ee0251fe5a78761db5c562097c58de628f3fb5ad5ccf6a2bfb319b5e2e56d939`
- legacy replicate 2 SHA-256: `ee0251fe5a78761db5c562097c58de628f3fb5ad5ccf6a2bfb319b5e2e56d939`
- EV replicate 1 SHA-256: `482092b23ff7a66feed1fa924d0ee87e5ab34a0b495e21ed3c2269062b1f0c3f`
- EV replicate 2 SHA-256: `482092b23ff7a66feed1fa924d0ee87e5ab34a0b495e21ed3c2269062b1f0c3f`
- legacy raw stdout一致: **PASS**
- EV raw stdout一致: **PASS**
- legacy/EV paired run keys一致（class/run/scenario/randomSequence）: **PASS**

再現コマンド（raw stdout は `/private/tmp/issue-700-gate-metrics-raw/` に保存）:

```sh
node scratch/issue700_gate_metrics.js
```

ゲーム本体 `src/`、ゲームルール、バランス値、アイテム定義、閾値、経済は変更していない。
