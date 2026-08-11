# Issue #485 #468/#473 focused remeasurement

上薬能動使用を含む固定kitで、低N監査で符号が変わった4セルだけ本測定。#468/#473の受入判定を変更する測定ではなく、符号確認用の再測定。

## 結果

### smart:workshop-core-pools
- ceiling−current（paired, 95% CI）: 平均到達floor=2.21pt [1.26, 3.16] / B5死亡=0.28pt [-0.46, 1.03] / B5突破=0.85pt [0.16, 1.53]
- Priest chest disarm: current=29.6% [29.3%, 29.9%] / ceiling=37.7% [37.4%, 38.0%] / delta=8.1pt

### never:workshop-core-pools
- ceiling−current（paired, 95% CI）: 平均到達floor=1.86pt [0.91, 2.81] / B5死亡=0.96pt [0.21, 1.71] / B5突破=0.11pt [-0.60, 0.81]
- Priest chest disarm: current=29.5% [29.2%, 29.7%] / ceiling=37.8% [37.5%, 38.1%] / delta=8.4pt

### smart:workshop-complete
- ceiling−current（paired, 95% CI）: 平均到達floor=1.79pt [0.78, 2.81] / B5死亡=1.17pt [0.47, 1.88] / B5突破=0.26pt [-0.40, 0.93]
- Priest chest disarm: current=29.5% [29.3%, 29.8%] / ceiling=38.2% [38.0%, 38.5%] / delta=8.7pt

### never:workshop-complete
- ceiling−current（paired, 95% CI）: 平均到達floor=2.38pt [1.37, 3.40] / B5死亡=0.31pt [-0.39, 1.01] / B5突破=0.90pt [0.24, 1.55]
- Priest chest disarm: current=29.6% [29.3%, 29.9%] / ceiling=38.4% [38.2%, 38.7%] / delta=8.9pt

## 測定記録

- raw JSONL SHA-256: `e72a6b355ffb22f48104a22875eb77d53f177748906055bfec1da1628b5fbc0d`
- summary JSON SHA-256: `bc1505d0936d8261e278d9ee93d6ae0f04351e0fb3c9ced7beebab6c5d82ea56`
- wall-clock: 934.929s / CPU: 13739.236s
- resolved parallelism: 15（available=15）
- command: `SIM_AUDIT_RUNS=500 SIM_SEED=271 SIM_RUNS=50100 SIM_CALIBRATION_RUNS=100 SIM_SCENARIOS=workshop-core-pools,workshop-complete SIM_RESULT_BASENAME=issue-485-audit-468-473-main node scratch/measure_issue_485_focus_468_473.js`
- Wilson 95% CI / paired差は生成run対応、介入後軌跡は同一と解釈しない。
