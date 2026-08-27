# Issue #494 #264到達性再測定

## 結論

Issue #494採用値 `FLEE_POLICY=ev` / `FLEE_HP_THRESHOLD=0.20` /
`HEAL_POTION_THRESHOLD=0.55` を明示し、#264の傷薬本数掃引と回復単価掃引を取り直した。
ゲーム本体のbalance値・逃走成功判定は変更していない。絶対値は旧#264測定と方針が異なるため、
符号・順位を比較する。

- 傷薬本数は4→16本で平均floor、B5 entrant、B10 entrantが上昇し、32本で平均floor/B5が頭打ち・反落した。
  旧#264の「sustain供給がB5を開くが、32本付近は構造的に飽和する」という符号を確認した。
- 回復単価は固定15→40でkit 3/4とも平均floor・B5 entrant・B10 entrantが上昇した。
  最大HP比は固定15を下回り、床連動は非単調。旧#483の単価掃引の順位・knee候補の傾向を維持した。
- #264の他レバー、所持枠/スタック変更、素材コスト変更は同時に測定していない。

## 傷薬本数掃引

seed=264、`workshop-complete`、B20終了、各条件N=1000、基本4職。固定傷薬量15、
他の出発kitは `TOWN_PORTAL` / `ANTIDOTE` / `GUARD_POTION` 各1。率はWilson 95% CI、
平均floorは正規近似95% CI。B5/B10の後3分類はentrant分母。

| 傷薬本数 | 平均floor | B5 entrant | B10 entrant | B5死亡 | B5撤退 | 素材EV/時間 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 4 | 4.07 [3.90,4.23] | 31.0% [28.2,33.9] | 7.2% [5.8,9.0] | 13.9% [10.5,18.2] | 39.4% [34.1,44.9] | 0.1513 |
| 8 | 5.11 [4.92,5.30] | 53.8% [50.7,56.9] | 11.5% [9.7,13.6] | 14.5% [11.8,17.7] | 39.8% [35.7,44.0] | 0.1503 |
| 12 | 5.96 [5.76,6.17] | 68.3% [65.4,71.1] | 17.7% [15.5,20.2] | 14.8% [12.3,17.6] | 22.5% [19.6,25.8] | 0.1535 |
| 16 | 6.73 [6.49,6.96] | 70.3% [67.4,73.1] | 28.0% [25.3,30.9] | 12.8% [10.5,15.5] | 7.7% [5.9,9.9] | 0.1422 |
| 32 | 6.75 [6.49,7.01] | 66.2% [63.2,69.1] | 30.8% [28.0,33.7] | 29.3% [26.0,32.9] | 0.5% [0.2,1.3] | 0.1088 |

4→16で平均floorは+2.66、B5 entrantは+39.3pt、B10 entrantは+20.8pt。
16→32では平均floorが横ばい、B5 entrantが低下し、素材EV/時間も低下した。

## 回復単価掃引

seed=483、B1→B20、各条件N=500、kit 3/4。固定量、最大HP比、床連動を測定し、
上薬の能動使用と採用方針を含めた。

| kit | 固定量 | 平均floor | B5 entrant | B10 entrant | 素材EV/時間 |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 3 | 15→40 | 3.48→3.59 | 20.6%→22.4% | 3.8%→4.4% | 0.1481→0.1606 |
| 4 | 15→40 | 4.07→4.31 | 26.2%→31.0% | 7.8%→9.0% | 0.1507→0.1683 |

kit 4では最大HP比50%が平均floor 3.92で固定15 4.07を下回った。床連動は
perFloor=0→5で 4.07→4.19→3.95 と非単調で、knee候補は固定30、最大HP35%、
床連動5だった。N<30のセルはなく、職別の細かいB10内訳はこの結論の主材料にしない。

## 実行記録

本数掃引:

```sh
ISSUE494_COUNT_SWEEP=1 SIM_SEED=264 SIM_RUNS=1000 SIM_CALIBRATION_RUNS=100 \
FLEE_POLICY=ev FLEE_HP_THRESHOLD=0.20 HEAL_POTION_THRESHOLD=0.55 \
SIM_RESULT_PATH=/tmp/issue-494-count-sweep.json \
node scratch/simulations/sim_issue_483_heal_unit_sweep.js
```

- 条件/run: 5 / 1,000（合計5,000）
- environment SHA-256: `ac198f097bff825d6b606f44d187a0af5b9f6515e176d20d6ff261a7b5ad636c`
- output SHA-256: `a5b57448737d791112a9f1b724edc8ed4630424320da86ed9893062fca461222`

単価掃引:

```sh
SIM_SEED=483 SIM_RUNS=500 SIM_CALIBRATION_RUNS=100 \
FLEE_POLICY=ev FLEE_HP_THRESHOLD=0.20 HEAL_POTION_THRESHOLD=0.55 \
SIM_RESULT_PATH=/tmp/issue-494-unit-sweep.json \
node scratch/simulations/sim_issue_483_heal_unit_sweep.js
```

- 条件/run: 44 / 500（合計22,000）
- environment SHA-256: `5fe3d08434ac7fd391412c4350c3a6bb63778cee89167dc374d0282df5e6d4fc`
- output SHA-256: `0a45ad3689e65d17aa6fc2eb90863d9ba1dd7b16342832f43e3e4ef523f055db`
