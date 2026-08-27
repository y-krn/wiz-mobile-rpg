# Issue #624 測定: 「持ち帰りを諦めて潜る」到達限界

- 測定 source commit: `1be56220bc7321e80937d3f4603917d88ec6b96c`
- 測定 base（origin/main）: `1be56220bc7321e80937d3f4603917d88ec6b96c`
- 条件数: 4、職別 N=500、職: Fighter (戦士) / Thief (盗賊) / Priest (僧侶) / Mage (魔術師)
- 目標深度: B21（B1開始、既存 #612 の重み付き工房系列）
- seed: 231、calibration: 100、SIM_PARALLEL: omitted
- raw JSONL: `evidence/results/issue-624-commit-depth.raw.jsonl`（ignored artifact）
- raw JSONL SHA-256: `63ac61638fe11fd4653c6b913a35ecd402e240cce462456234eae72197a3b9fd`
- summary env hash（全条件の短縮hash）: `e2d400fea5c0ceed`

## 測定条件

既定の #612 固定 env（TRAP_POLICY=conservative、鑑定粉、状態回復、elite avoid、DEPARTURE_CRAFT_IDS の heal/antidote/guard を含む）を基準にし、portal と逃走だけを変更した。 `SIM_PARALLEL` と `SIM_MAP_CACHE_ENTRIES` は未指定で、runtime の既定値を使用した。

| 条件 | 差分 | env hash | parallelism | wall |
| --- | --- | --- | ---: | ---: |
| baseline-portal-flee（既定：翼あり・逃走あり） | 差分なし | `1c1dc8a650c03d47` | 15 | 6.5s |
| no-departure-portal（翼なし出発・逃走あり） | `DEPARTURE_CRAFT_IDS=HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION` | `0e5f78b21cecd2ae` | 15 | 7.0s |
| portal-unused（翼所持・PORTAL_HP_THRESHOLD=0・逃走あり） | `PORTAL_HP_THRESHOLD=0` | `e04e29c397cc2c5f` | 15 | 8.2s |
| no-portal-no-flee（翼なし出発・逃走なし） | `DEPARTURE_CRAFT_IDS=HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION`, `FLEE_POLICY=never` | `85af666ba9baf13b` | 15 | 7.1s |

条件4は条件2（翼を出発キットから除外）に `FLEE_POLICY=never` を加えた。条件2は宝箱等で途中入手した翼まで禁止する条件ではなく、「持たずに出発」の条件である。

## 基準線再現（#652値との照合）

期待値は #652 再測定の到達階平均 Fighter 5.778 / Thief 5.162 / Priest 4.740 / Mage 6.474。 判定は表示2桁の丸め誤差を許容して |実測−期待|≤0.005 とした。

| 職 | 期待 | 実測平均 | 差 | 判定 |
| --- | ---: | ---: | ---: | --- |
| Fighter (戦士) | 5.78 | 5.8980 | +0.1200 | 不一致（原因調査要） |
| Thief (盗賊) | 5.16 | 5.1440 | -0.0180 | 不一致（原因調査要） |
| Priest (僧侶) | 4.74 | 4.5200 | -0.2200 | 不一致（原因調査要） |
| Mage (魔術師) | 6.47 | 6.5040 | +0.0300 | 不一致（原因調査要） |

基準線再現: **不可。測定側の変更を確定せず原因調査が必要**。

### 基準線不一致の原因調査

#652 の基準値は base `3e659a62a2b7acca1442feddf101b9b71849458f` で測定された。現行 base では #656 により `scratch/simulations/sim_depth_material_ev.js` の回復経路へ mana potion と MP不足時の計測が入り、#662 で MP圧力計測が追加されている。#657 はUI変更で、ゲーム本体のルール値はこの区間で変更されていない。

このため新しい基準値は現行 base では再現しなかった。旧値へ合わせる変更は行わず、以下の paired 比較は現行 base で再測定した `baseline-portal-flee` を対照にする。#656/#662 の各差分が平均値の差へ与えた寄与は、過去 base の再実行を伴わないため個別には判定しない。

## 到達階の主要結果（全run分母）

平均は通常近似95% CI、率は Wilson 95% CI。`N不足` は該当セルの N<30 で、結論には使わない。 到達階は死亡・撤退を含む `reachedFloor` の run 平均である。主結果の各職×条件は N=500。深度帯や死亡状態の `N不足` は到達しないことではなく、その層の観測数不足を示す。

| 条件 | 職 | 到達階平均 [95% CI; N] | 生還率 Wilson | 死亡率 Wilson |
| --- | --- | --- | --- | --- |
| baseline-portal-flee | Fighter (戦士) | 5.90 [5.62, 6.17]; N=500 | 80.8% [77.1%, 84.0%; 404/500] | 19.2% [16.0%, 22.9%; 96/500] |
| baseline-portal-flee | Thief (盗賊) | 5.14 [4.93, 5.36]; N=500 | 54.2% [49.8%, 58.5%; 271/500] | 45.8% [41.5%, 50.2%; 229/500] |
| baseline-portal-flee | Priest (僧侶) | 4.52 [4.25, 4.79]; N=500 | 16.0% [13.0%, 19.5%; 80/500] | 84.0% [80.5%, 87.0%; 420/500] |
| baseline-portal-flee | Mage (魔術師) | 6.50 [6.13, 6.88]; N=500 | 56.8% [52.4%, 61.1%; 284/500] | 43.2% [38.9%, 47.6%; 216/500] |
| no-departure-portal | Fighter (戦士) | 6.74 [6.41, 7.06]; N=500 | 48.8% [44.4%, 53.2%; 244/500] | 51.2% [46.8%, 55.6%; 256/500] |
| no-departure-portal | Thief (盗賊) | 5.33 [5.12, 5.54]; N=500 | 25.4% [21.8%, 29.4%; 127/500] | 74.6% [70.6%, 78.2%; 373/500] |
| no-departure-portal | Priest (僧侶) | 4.59 [4.31, 4.87]; N=500 | 6.2% [4.4%, 8.7%; 31/500] | 93.8% [91.3%, 95.6%; 469/500] |
| no-departure-portal | Mage (魔術師) | 6.73 [6.35, 7.12]; N=500 | 31.8% [27.9%, 36.0%; 159/500] | 68.2% [64.0%, 72.1%; 341/500] |
| portal-unused | Fighter (戦士) | 8.38 [7.91, 8.86]; N=500 | 2.4% [1.4%, 4.1%; 12/500] | 97.6% [95.9%, 98.6%; 488/500] |
| portal-unused | Thief (盗賊) | 5.94 [5.63, 6.25]; N=500 | 0.8% [0.3%, 2.0%; 4/500] | 99.2% [98.0%, 99.7%; 496/500] |
| portal-unused | Priest (僧侶) | 4.65 [4.36, 4.94]; N=500 | 0.2% [0.0%, 1.1%; 1/500] | 99.8% [98.9%, 100.0%; 499/500] |
| portal-unused | Mage (魔術師) | 7.15 [6.72, 7.59]; N=500 | 4.4% [2.9%, 6.6%; 22/500] | 95.6% [93.4%, 97.1%; 478/500] |
| no-portal-no-flee | Fighter (戦士) | 5.32 [5.06, 5.57]; N=500 | 35.8% [31.7%, 40.1%; 179/500] | 64.2% [59.9%, 68.3%; 321/500] |
| no-portal-no-flee | Thief (盗賊) | 4.53 [4.37, 4.70]; N=500 | 21.0% [17.7%, 24.8%; 105/500] | 79.0% [75.2%, 82.3%; 395/500] |
| no-portal-no-flee | Priest (僧侶) | 4.15 [3.87, 4.43]; N=500 | 3.8% [2.4%, 5.9%; 19/500] | 96.2% [94.1%, 97.6%; 481/500] |
| no-portal-no-flee | Mage (魔術師) | 6.21 [5.94, 6.48]; N=500 | 9.0% [6.8%, 11.8%; 45/500] | 91.0% [88.2%, 93.2%; 455/500] |

## 全階分布

各セルは `D=その到達階で死亡 / R=その到達階で撤退・生還`。死亡階分布は死亡 run を分母とせず、件数を全階で列挙する。

- **baseline-portal-flee / Fighter (戦士)**: B1=D5/R0; B2=D10/R0; B3=D6/R42; B4=D6/R61; B5=D50/R193; B6=D3/R12; B7=D4/R10; B8=D2/R15; B9=D1/R15; B10=D1/R22; B11=D0/R2; B12=D0/R7; B13=D0/R8; B14=D2/R6; B15=D0/R8; B16=D3/R1; B17=D1/R0; B18=D1/R0; B19=D1/R1; B20=D0/R1; B21=D0/R0
  - deathFloor: B1=5, B2=10, B3=6, B4=6, B5=50, B6=3, B7=4, B8=2, B9=1, B10=1, B11=0, B12=0, B13=0, B14=2, B15=0, B16=3, B17=1, B18=1, B19=1, B20=0, B21=0
- **baseline-portal-flee / Thief (盗賊)**: B1=D20/R0; B2=D12/R0; B3=D12/R36; B4=D12/R43; B5=D156/R137; B6=D3/R6; B7=D3/R2; B8=D2/R13; B9=D1/R9; B10=D3/R12; B11=D1/R3; B12=D1/R3; B13=D0/R2; B14=D0/R0; B15=D0/R2; B16=D2/R1; B17=D1/R0; B18=D0/R1; B19=D0/R1; B20=D0/R0; B21=D0/R0
  - deathFloor: B1=20, B2=12, B3=12, B4=12, B5=156, B6=3, B7=3, B8=2, B9=1, B10=3, B11=1, B12=1, B13=0, B14=0, B15=0, B16=2, B17=1, B18=0, B19=0, B20=0, B21=0
- **baseline-portal-flee / Priest (僧侶)**: B1=D57/R0; B2=D63/R0; B3=D59/R9; B4=D56/R10; B5=D145/R44; B6=D2/R1; B7=D4/R0; B8=D6/R0; B9=D2/R2; B10=D1/R5; B11=D2/R2; B12=D5/R0; B13=D6/R0; B14=D6/R2; B15=D2/R3; B16=D3/R0; B17=D1/R0; B18=D0/R0; B19=D0/R1; B20=D0/R0; B21=D0/R1
  - deathFloor: B1=57, B2=63, B3=59, B4=56, B5=145, B6=2, B7=4, B8=6, B9=2, B10=1, B11=2, B12=5, B13=6, B14=6, B15=2, B16=3, B17=1, B18=0, B19=0, B20=0, B21=0
- **baseline-portal-flee / Mage (魔術師)**: B1=D6/R0; B2=D8/R0; B3=D18/R12; B4=D36/R55; B5=D115/R129; B6=D6/R2; B7=D6/R3; B8=D3/R2; B9=D1/R3; B10=D6/R10; B11=D0/R6; B12=D3/R9; B13=D1/R7; B14=D2/R9; B15=D2/R13; B16=D3/R3; B17=D0/R3; B18=D0/R1; B19=D0/R1; B20=D0/R4; B21=D0/R12
  - deathFloor: B1=6, B2=8, B3=18, B4=36, B5=115, B6=6, B7=6, B8=3, B9=1, B10=6, B11=0, B12=3, B13=1, B14=2, B15=2, B16=3, B17=0, B18=0, B19=0, B20=0, B21=0
- **no-departure-portal / Fighter (戦士)**: B1=D5/R0; B2=D10/R0; B3=D16/R10; B4=D35/R19; B5=D145/R81; B6=D9/R10; B7=D4/R11; B8=D7/R15; B9=D6/R18; B10=D3/R27; B11=D0/R3; B12=D0/R7; B13=D0/R14; B14=D2/R10; B15=D1/R13; B16=D8/R2; B17=D0/R0; B18=D3/R1; B19=D0/R1; B20=D2/R2; B21=D0/R0
  - deathFloor: B1=5, B2=10, B3=16, B4=35, B5=145, B6=9, B7=4, B8=7, B9=6, B10=3, B11=0, B12=0, B13=0, B14=2, B15=1, B16=8, B17=0, B18=3, B19=0, B20=2, B21=0
- **no-departure-portal / Thief (盗賊)**: B1=D20/R0; B2=D12/R0; B3=D24/R8; B4=D27/R18; B5=D255/R48; B6=D7/R5; B7=D6/R4; B8=D3/R10; B9=D5/R10; B10=D8/R12; B11=D1/R4; B12=D1/R2; B13=D0/R2; B14=D0/R0; B15=D0/R2; B16=D3/R0; B17=D1/R0; B18=D0/R1; B19=D0/R1; B20=D0/R0; B21=D0/R0
  - deathFloor: B1=20, B2=12, B3=24, B4=27, B5=255, B6=7, B7=6, B8=3, B9=5, B10=8, B11=1, B12=1, B13=0, B14=0, B15=0, B16=3, B17=1, B18=0, B19=0, B20=0, B21=0
- **no-departure-portal / Priest (僧侶)**: B1=D57/R0; B2=D63/R0; B3=D65/R2; B4=D62/R1; B5=D173/R14; B6=D3/R2; B7=D4/R0; B8=D7/R1; B9=D2/R2; B10=D3/R2; B11=D3/R1; B12=D6/R0; B13=D7/R0; B14=D7/R2; B15=D2/R2; B16=D4/R0; B17=D0/R0; B18=D1/R0; B19=D0/R1; B20=D0/R0; B21=D0/R1
  - deathFloor: B1=57, B2=63, B3=65, B4=62, B5=173, B6=3, B7=4, B8=7, B9=2, B10=3, B11=3, B12=6, B13=7, B14=7, B15=2, B16=4, B17=0, B18=1, B19=0, B20=0, B21=0
- **no-departure-portal / Mage (魔術師)**: B1=D6/R0; B2=D8/R0; B3=D20/R6; B4=D67/R16; B5=D189/R53; B6=D11/R1; B7=D7/R1; B8=D3/R5; B9=D4/R2; B10=D7/R9; B11=D0/R3; B12=D5/R4; B13=D3/R9; B14=D2/R10; B15=D4/R17; B16=D2/R2; B17=D0/R3; B18=D1/R0; B19=D1/R3; B20=D1/R5; B21=D0/R10
  - deathFloor: B1=6, B2=8, B3=20, B4=67, B5=189, B6=11, B7=7, B8=3, B9=4, B10=7, B11=0, B12=5, B13=3, B14=2, B15=4, B16=2, B17=0, B18=1, B19=1, B20=1, B21=0
- **portal-unused / Fighter (戦士)**: B1=D5/R0; B2=D10/R0; B3=D21/R0; B4=D46/R0; B5=D200/R0; B6=D21/R0; B7=D4/R0; B8=D17/R0; B9=D15/R0; B10=D20/R0; B11=D9/R0; B12=D2/R0; B13=D12/R0; B14=D22/R0; B15=D7/R0; B16=D27/R0; B17=D11/R0; B18=D18/R0; B19=D12/R0; B20=D9/R0; B21=D0/R12
  - deathFloor: B1=5, B2=10, B3=21, B4=46, B5=200, B6=21, B7=4, B8=17, B9=15, B10=20, B11=9, B12=2, B13=12, B14=22, B15=7, B16=27, B17=11, B18=18, B19=12, B20=9, B21=0
- **portal-unused / Thief (盗賊)**: B1=D20/R0; B2=D12/R0; B3=D26/R0; B4=D35/R0; B5=D304/R0; B6=D8/R0; B7=D8/R0; B8=D7/R0; B9=D11/R0; B10=D22/R0; B11=D9/R0; B12=D3/R0; B13=D8/R0; B14=D4/R0; B15=D5/R0; B16=D4/R0; B17=D2/R0; B18=D1/R0; B19=D1/R0; B20=D6/R0; B21=D0/R4
  - deathFloor: B1=20, B2=12, B3=26, B4=35, B5=304, B6=8, B7=8, B8=7, B9=11, B10=22, B11=9, B12=3, B13=8, B14=4, B15=5, B16=4, B17=2, B18=1, B19=1, B20=6, B21=0
- **portal-unused / Priest (僧侶)**: B1=D57/R0; B2=D63/R0; B3=D63/R0; B4=D66/R0; B5=D185/R0; B6=D5/R0; B7=D3/R0; B8=D9/R0; B9=D3/R0; B10=D7/R0; B11=D4/R0; B12=D7/R0; B13=D7/R0; B14=D10/R0; B15=D4/R0; B16=D3/R0; B17=D0/R0; B18=D2/R0; B19=D1/R0; B20=D0/R0; B21=D0/R1
  - deathFloor: B1=57, B2=63, B3=63, B4=66, B5=185, B6=5, B7=3, B8=9, B9=3, B10=7, B11=4, B12=7, B13=7, B14=10, B15=4, B16=3, B17=0, B18=2, B19=1, B20=0, B21=0
- **portal-unused / Mage (魔術師)**: B1=D6/R0; B2=D8/R0; B3=D23/R0; B4=D78/R0; B5=D239/R0; B6=D12/R0; B7=D9/R0; B8=D7/R0; B9=D3/R0; B10=D18/R0; B11=D7/R0; B12=D5/R0; B13=D11/R0; B14=D12/R0; B15=D14/R0; B16=D10/R0; B17=D2/R0; B18=D5/R0; B19=D3/R0; B20=D6/R0; B21=D0/R22
  - deathFloor: B1=6, B2=8, B3=23, B4=78, B5=239, B6=12, B7=9, B8=7, B9=3, B10=18, B11=7, B12=5, B13=11, B14=12, B15=14, B16=10, B17=2, B18=5, B19=3, B20=6, B21=0
- **no-portal-no-flee / Fighter (戦士)**: B1=D5/R0; B2=D14/R0; B3=D45/R28; B4=D58/R29; B5=D182/R67; B6=D2/R3; B7=D0/R1; B8=D3/R7; B9=D3/R8; B10=D2/R8; B11=D0/R4; B12=D0/R3; B13=D1/R6; B14=D0/R7; B15=D0/R6; B16=D3/R1; B17=D1/R0; B18=D1/R0; B19=D1/R0; B20=D0/R0; B21=D0/R1
  - deathFloor: B1=5, B2=14, B3=45, B4=58, B5=182, B6=2, B7=0, B8=3, B9=3, B10=2, B11=0, B12=0, B13=1, B14=0, B15=0, B16=3, B17=1, B18=1, B19=1, B20=0, B21=0
- **no-portal-no-flee / Thief (盗賊)**: B1=D16/R0; B2=D28/R0; B3=D53/R28; B4=D66/R20; B5=D222/R31; B6=D1/R3; B7=D2/R1; B8=D0/R6; B9=D1/R6; B10=D4/R4; B11=D1/R0; B12=D0/R2; B13=D0/R1; B14=D0/R2; B15=D1/R1; B16=D0/R0; B17=D0/R0; B18=D0/R0; B19=D0/R0; B20=D0/R0; B21=D0/R0
  - deathFloor: B1=16, B2=28, B3=53, B4=66, B5=222, B6=1, B7=2, B8=0, B9=1, B10=4, B11=1, B12=0, B13=0, B14=0, B15=1, B16=0, B17=0, B18=0, B19=0, B20=0, B21=0
- **no-portal-no-flee / Priest (僧侶)**: B1=D68/R0; B2=D82/R0; B3=D64/R4; B4=D74/R4; B5=D166/R2; B6=D0/R0; B7=D0/R0; B8=D1/R1; B9=D2/R1; B10=D4/R2; B11=D2/R0; B12=D1/R0; B13=D5/R0; B14=D6/R1; B15=D1/R0; B16=D1/R0; B17=D1/R0; B18=D1/R0; B19=D2/R0; B20=D0/R0; B21=D0/R4
  - deathFloor: B1=68, B2=82, B3=64, B4=74, B5=166, B6=0, B7=0, B8=1, B9=2, B10=4, B11=2, B12=1, B13=5, B14=6, B15=1, B16=1, B17=1, B18=1, B19=2, B20=0, B21=0
- **no-portal-no-flee / Mage (魔術師)**: B1=D7/R0; B2=D7/R0; B3=D8/R0; B4=D10/R0; B5=D362/R3; B6=D1/R0; B7=D2/R0; B8=D4/R2; B9=D3/R1; B10=D26/R14; B11=D4/R5; B12=D2/R0; B13=D2/R2; B14=D4/R8; B15=D11/R8; B16=D2/R2; B17=D0/R0; B18=D0/R0; B19=D0/R0; B20=D0/R0; B21=D0/R0
  - deathFloor: B1=7, B2=7, B3=8, B4=10, B5=362, B6=1, B7=2, B8=4, B9=3, B10=26, B11=4, B12=2, B13=2, B14=4, B15=11, B16=2, B17=0, B18=0, B19=0, B20=0, B21=0

## 死因内訳

死因率の分母は各セルの死亡 run 数（`death N`）で、Wilson 95% CI を付けた。 `boss` は boss/midboss、`trap` は trap source または cause に罠を含むもの、`normal` は通常遭遇、 `other` は elite/未分類である。

| 条件 | 職 | 死亡 N | boss | trap | normal | other |
| --- | --- | ---: | --- | --- | --- | --- |
| baseline-portal-flee | Fighter (戦士) | 96 | 2.1% [0.6%, 7.3%; 2/96] | 55.2% [45.3%, 64.8%; 53/96] | 42.7% [33.3%, 52.7%; 41/96] | 0.0% [0.0%, 3.8%; 0/96] |
| baseline-portal-flee | Thief (盗賊) | 229 | 5.2% [3.0%, 8.9%; 12/229] | 74.2% [68.2%, 79.5%; 170/229] | 20.5% [15.8%, 26.2%; 47/229] | 0.0% [0.0%, 1.6%; 0/229] |
| baseline-portal-flee | Priest (僧侶) | 420 | 2.1% [1.1%, 4.0%; 9/420] | 69.3% [64.7%, 73.5%; 291/420] | 28.6% [24.5%, 33.1%; 120/420] | 0.0% [0.0%, 0.9%; 0/420] |
| baseline-portal-flee | Mage (魔術師) | 216 | 7.9% [5.0%, 12.2%; 17/216] | 56.0% [49.4%, 62.5%; 121/216] | 36.1% [30.0%, 42.7%; 78/216] | 0.0% [0.0%, 1.7%; 0/216] |
| no-departure-portal | Fighter (戦士) | 256 | 2.3% [1.1%, 5.0%; 6/256] | 67.6% [61.6%, 73.0%; 173/256] | 30.1% [24.8%, 36.0%; 77/256] | 0.0% [0.0%, 1.5%; 0/256] |
| no-departure-portal | Thief (盗賊) | 373 | 4.3% [2.7%, 6.9%; 16/373] | 74.0% [69.3%, 78.2%; 276/373] | 21.7% [17.8%, 26.2%; 81/373] | 0.0% [0.0%, 1.0%; 0/373] |
| no-departure-portal | Priest (僧侶) | 469 | 1.7% [0.9%, 3.3%; 8/469] | 71.4% [67.2%, 75.3%; 335/469] | 26.9% [23.1%, 31.1%; 126/469] | 0.0% [0.0%, 0.8%; 0/469] |
| no-departure-portal | Mage (魔術師) | 341 | 7.3% [5.0%, 10.6%; 25/341] | 62.8% [57.5%, 67.7%; 214/341] | 29.9% [25.3%, 35.0%; 102/341] | 0.0% [0.0%, 1.1%; 0/341] |
| portal-unused | Fighter (戦士) | 488 | 2.3% [1.3%, 4.0%; 11/488] | 64.5% [60.2%, 68.7%; 315/488] | 33.2% [29.2%, 37.5%; 162/488] | 0.0% [0.0%, 0.8%; 0/488] |
| portal-unused | Thief (盗賊) | 496 | 4.8% [3.3%, 7.1%; 24/496] | 72.4% [68.3%, 76.1%; 359/496] | 22.8% [19.3%, 26.7%; 113/496] | 0.0% [0.0%, 0.8%; 0/496] |
| portal-unused | Priest (僧侶) | 499 | 2.0% [1.1%, 3.6%; 10/499] | 70.9% [66.8%, 74.8%; 354/499] | 27.1% [23.3%, 31.1%; 135/499] | 0.0% [0.0%, 0.8%; 0/499] |
| portal-unused | Mage (魔術師) | 478 | 8.2% [6.0%, 11.0%; 39/478] | 63.8% [59.4%, 68.0%; 305/478] | 28.0% [24.2%, 32.2%; 134/478] | 0.0% [0.0%, 0.8%; 0/478] |
| no-portal-no-flee | Fighter (戦士) | 321 | 12.5% [9.3%, 16.5%; 40/321] | 47.7% [42.3%, 53.1%; 153/321] | 39.9% [34.7%, 45.3%; 128/321] | 0.0% [0.0%, 1.2%; 0/321] |
| no-portal-no-flee | Thief (盗賊) | 395 | 5.1% [3.3%, 7.7%; 20/395] | 63.8% [58.9%, 68.4%; 252/395] | 31.1% [26.8%, 35.9%; 123/395] | 0.0% [0.0%, 1.0%; 0/395] |
| no-portal-no-flee | Priest (僧侶) | 481 | 10.8% [8.3%, 13.9%; 52/481] | 56.1% [51.7%, 60.5%; 270/481] | 33.1% [29.0%, 37.4%; 159/481] | 0.0% [0.0%, 0.8%; 0/481] |
| no-portal-no-flee | Mage (魔術師) | 455 | 72.1% [67.8%, 76.0%; 328/455] | 5.1% [3.4%, 7.5%; 23/455] | 22.9% [19.2%, 26.9%; 104/455] | 0.0% [0.0%, 0.8%; 0/455] |

## 死亡時のレベル・装備・core

死亡時 snapshot は既存 sim の死亡経路に計装し、level、HP/MP、装備 slot、装備 ID、support/core ID、inventory を保存した。以下は死亡 run 内の要約で、死亡 N<30 は N不足。

- **baseline-portal-flee / Fighter (戦士)**: death N=96; lv 4.13 [3.72, 4.53]; N=96; 装備slot 3.86 [3.80, 3.93]; N=96; lv帯(L1=5, L2–3=29, L4–5=50, L6+=12); core(CORE_THORN_SHIELD:35, CORE_SNEAK_STEP:31, CORE_CAMP_MASTER:27, CORE_CURSE_KEEPER:17, CORE_LAST_STAND:14, CORE_GIANT_SLAYER:13, CORE_EXECUTIONER:10, CORE_KEEN_EYE:9); 装備(shield:SMALL_SHIELD:51, armor:LEATHER_ARMOR:37, accessory:RING_STR:23, armor:CHAIN_MAIL:23, shield:KNIGHT_SHIELD:22, weapon:CLAYMORE:22, weapon:FIGHTER_SABER:22, accessory:RING_AGI:20)
- **baseline-portal-flee / Thief (盗賊)**: death N=229; lv 3.90 [3.72, 4.07]; N=229; 装備slot 3.79 [3.74, 3.85]; N=229; lv帯(L1=12, L2–3=55, L4–5=152, L6+=10); core(CORE_SNEAK_STEP:73, CORE_CAMP_MASTER:66, CORE_LAST_STAND:50, CORE_CURSE_KEEPER:45, CORE_BLOOD_WAND:28, CORE_GIANT_SLAYER:27, CORE_EXECUTIONER:25, CORE_PURIFY_RING:21); 装備(shield:SMALL_SHIELD:195, armor:LEATHER_ARMOR:91, weapon:RAPIER:87, armor:NINJA_SUIT:59, weapon:NINJA_BLADE:57, armor:BATTLE_GARB:53, accessory:AMULET_HP:43, accessory:RING_STR:40)
- **baseline-portal-flee / Priest (僧侶)**: death N=420; lv 2.93 [2.77, 3.10]; N=420; 装備slot 3.68 [3.64, 3.73]; N=420; lv帯(L1=90, L2–3=202, L4–5=98, L6+=30); core(CORE_THORN_SHIELD:101, CORE_SNEAK_STEP:100, CORE_CAMP_MASTER:98, CORE_CURSE_KEEPER:39, CORE_LAST_STAND:37, CORE_PURIFY_RING:35, CORE_KEEN_EYE:34, CORE_TRAP_EATER:28); 装備(shield:SMALL_SHIELD:269, weapon:MACE:250, shield:MAGIC_SHIELD:151, armor:LEATHER_ARMOR:123, armor:PRIEST_ROBE:88, accessory:RING_STR:87, weapon:SACRED_MACE:81, armor:EXPLORER_CLOAK:78)
- **baseline-portal-flee / Mage (魔術師)**: death N=216; lv 1.80 [1.62, 1.99]; N=216; 装備slot 2.79 [2.73, 2.84]; N=216; lv帯(L1=138, L2–3=49, L4–5=22, L6+=7); core(CORE_CAMP_MASTER:77, CORE_SNEAK_STEP:60, CORE_EXECUTIONER:30, CORE_CURSE_KEEPER:25, CORE_TRAP_EATER:23, CORE_PURIFY_RING:20, CORE_BOUNTY_HUNTER:18, CORE_GIANT_SLAYER:17); 装備(armor:ARCANE_ROBE:98, weapon:SAGE_STAFF:94, armor:EXPLORER_CLOAK:53, accessory:RING_STR:47, weapon:ARCH_WAND:45, weapon:WAND:39, weapon:DAGGER:38, armor:SORCERER_ROBE:30)
- **no-departure-portal / Fighter (戦士)**: death N=256; lv 4.27 [4.05, 4.48]; N=256; 装備slot 3.85 [3.81, 3.90]; N=256; lv帯(L1=5, L2–3=57, L4–5=165, L6+=29); core(CORE_THORN_SHIELD:87, CORE_SNEAK_STEP:85, CORE_CAMP_MASTER:78, CORE_LAST_STAND:52, CORE_CURSE_KEEPER:41, CORE_KEEN_EYE:34, CORE_EXECUTIONER:31, CORE_GIANT_SLAYER:27); 装備(shield:SMALL_SHIELD:112, armor:LEATHER_ARMOR:82, shield:KNIGHT_SHIELD:68, weapon:CLAYMORE:64, accessory:AMULET_HP:63, armor:PLATE_MAIL:59, shield:MAGIC_SHIELD:57, weapon:FIGHTER_SABER:54)
- **no-departure-portal / Thief (盗賊)**: death N=373; lv 4.02 [3.89, 4.14]; N=373; 装備slot 3.80 [3.76, 3.84]; N=373; lv帯(L1=12, L2–3=74, L4–5=268, L6+=19); core(CORE_CAMP_MASTER:123, CORE_SNEAK_STEP:120, CORE_LAST_STAND:77, CORE_CURSE_KEEPER:63, CORE_EXECUTIONER:57, CORE_GIANT_SLAYER:51, CORE_BLOOD_WAND:39, CORE_PURIFY_RING:39); 装備(shield:SMALL_SHIELD:323, armor:LEATHER_ARMOR:135, weapon:RAPIER:132, armor:NINJA_SUIT:109, armor:BATTLE_GARB:90, weapon:NINJA_BLADE:87, accessory:AMULET_HP:82, weapon:NINJA_DAGGER:65)
- **no-departure-portal / Priest (僧侶)**: death N=469; lv 3.01 [2.85, 3.16]; N=469; 装備slot 3.69 [3.65, 3.73]; N=469; lv帯(L1=90, L2–3=227, L4–5=117, L6+=35); core(CORE_THORN_SHIELD:121, CORE_CAMP_MASTER:117, CORE_SNEAK_STEP:112, CORE_CURSE_KEEPER:51, CORE_LAST_STAND:47, CORE_KEEN_EYE:38, CORE_PURIFY_RING:37, CORE_BLOOD_WAND:34); 装備(shield:SMALL_SHIELD:291, weapon:MACE:277, shield:MAGIC_SHIELD:178, armor:LEATHER_ARMOR:130, armor:PRIEST_ROBE:103, accessory:RING_STR:99, weapon:SACRED_MACE:89, armor:EXPLORER_CLOAK:88)
- **no-departure-portal / Mage (魔術師)**: death N=341; lv 1.74 [1.60, 1.88]; N=341; 装備slot 2.75 [2.70, 2.79]; N=341; lv帯(L1=217, L2–3=86, L4–5=28, L6+=10); core(CORE_CAMP_MASTER:156, CORE_SNEAK_STEP:78, CORE_EXECUTIONER:45, CORE_CURSE_KEEPER:40, CORE_PURIFY_RING:33, CORE_LAST_STAND:31, CORE_TRAP_EATER:29, CORE_GIANT_SLAYER:24); 装備(armor:ARCANE_ROBE:174, weapon:SAGE_STAFF:137, armor:EXPLORER_CLOAK:80, weapon:ARCH_WAND:73, weapon:DAGGER:70, accessory:RING_STR:65, weapon:WAND:61, accessory:AMULET_HP:47)
- **portal-unused / Fighter (戦士)**: death N=488; lv 5.59 [5.36, 5.83]; N=488; 装備slot 3.89 [3.86, 3.92]; N=488; lv帯(L1=5, L2–3=65, L4–5=248, L6+=170); core(CORE_THORN_SHIELD:215, CORE_CAMP_MASTER:185, CORE_SNEAK_STEP:158, CORE_CURSE_KEEPER:104, CORE_LAST_STAND:99, CORE_EXECUTIONER:78, CORE_GIANT_SLAYER:69, CORE_KEEN_EYE:59); 装備(shield:KNIGHT_SHIELD:172, armor:PLATE_MAIL:166, shield:SMALL_SHIELD:154, weapon:CLAYMORE:149, armor:LEATHER_ARMOR:143, shield:MAGIC_SHIELD:130, accessory:AMULET_HP:121, accessory:RING_STR:103)
- **portal-unused / Thief (盗賊)**: death N=496; lv 4.42 [4.28, 4.57]; N=496; 装備slot 3.83 [3.79, 3.86]; N=496; lv帯(L1=12, L2–3=86, L4–5=322, L6+=76); core(CORE_SNEAK_STEP:179, CORE_CAMP_MASTER:162, CORE_LAST_STAND:108, CORE_CURSE_KEEPER:88, CORE_GIANT_SLAYER:74, CORE_EXECUTIONER:72, CORE_BLOOD_WAND:55, CORE_PURIFY_RING:48); 装備(shield:SMALL_SHIELD:430, armor:LEATHER_ARMOR:157, weapon:RAPIER:156, armor:BATTLE_GARB:151, armor:NINJA_SUIT:141, weapon:NINJA_BLADE:126, accessory:AMULET_HP:110, weapon:VENOM_FANG:94)
- **portal-unused / Priest (僧侶)**: death N=499; lv 3.11 [2.96, 3.27]; N=499; 装備slot 3.70 [3.66, 3.74]; N=499; lv帯(L1=90, L2–3=237, L4–5=124, L6+=48); core(CORE_CAMP_MASTER:132, CORE_THORN_SHIELD:131, CORE_SNEAK_STEP:117, CORE_CURSE_KEEPER:65, CORE_LAST_STAND:51, CORE_GIANT_SLAYER:41, CORE_KEEN_EYE:40, CORE_PURIFY_RING:39); 装備(shield:SMALL_SHIELD:303, weapon:MACE:290, shield:MAGIC_SHIELD:196, armor:LEATHER_ARMOR:134, armor:PRIEST_ROBE:114, accessory:RING_STR:101, weapon:HOLY_STAFF:92, weapon:SACRED_MACE:92)
- **portal-unused / Mage (魔術師)**: death N=478; lv 2.20 [2.03, 2.37]; N=478; 装備slot 2.80 [2.77, 2.84]; N=478; lv帯(L1=267, L2–3=121, L4–5=49, L6+=41); core(CORE_SNEAK_STEP:169, CORE_CAMP_MASTER:160, CORE_CURSE_KEEPER:66, CORE_PURIFY_RING:64, CORE_EXECUTIONER:61, CORE_GIANT_SLAYER:54, CORE_LAST_STAND:40, CORE_OPENER:36); 装備(armor:ARCANE_ROBE:223, weapon:SAGE_STAFF:180, weapon:ARCH_WAND:128, armor:EXPLORER_CLOAK:100, armor:SORCERER_ROBE:95, weapon:DAGGER:92, accessory:RING_STR:87, weapon:WAND:78)
- **no-portal-no-flee / Fighter (戦士)**: death N=321; lv 4.21 [4.07, 4.35]; N=321; 装備slot 3.87 [3.83, 3.91]; N=321; lv帯(L1=3, L2–3=55, L4–5=246, L6+=17); core(CORE_SNEAK_STEP:111, CORE_THORN_SHIELD:105, CORE_CAMP_MASTER:58, CORE_EXECUTIONER:50, CORE_CURSE_KEEPER:43, CORE_LAST_STAND:40, CORE_PURIFY_RING:33, CORE_KEEN_EYE:32); 装備(shield:SMALL_SHIELD:164, armor:LEATHER_ARMOR:134, accessory:AMULET_HP:89, weapon:FIGHTER_SABER:85, accessory:RING_STR:69, weapon:SHORT_SWORD:68, armor:PLATE_MAIL:65, shield:MAGIC_SHIELD:65)
- **no-portal-no-flee / Thief (盗賊)**: death N=395; lv 3.92 [3.81, 4.02]; N=395; 装備slot 3.78 [3.74, 3.82]; N=395; lv帯(L1=10, L2–3=91, L4–5=283, L6+=11); core(CORE_SNEAK_STEP:135, CORE_CAMP_MASTER:91, CORE_LAST_STAND:75, CORE_EXECUTIONER:54, CORE_CURSE_KEEPER:49, CORE_GIANT_SLAYER:45, CORE_BLOOD_WAND:41, CORE_KEEN_EYE:40); 装備(shield:SMALL_SHIELD:338, armor:LEATHER_ARMOR:173, weapon:RAPIER:156, armor:NINJA_SUIT:95, accessory:AMULET_HP:85, accessory:RING_STR:75, armor:BATTLE_GARB:72, weapon:NINJA_BLADE:72)
- **no-portal-no-flee / Priest (僧侶)**: death N=481; lv 3.56 [3.40, 3.73]; N=481; 装備slot 3.67 [3.63, 3.71]; N=481; lv帯(L1=60, L2–3=169, L4–5=225, L6+=27); core(CORE_THORN_SHIELD:114, CORE_SNEAK_STEP:111, CORE_CAMP_MASTER:109, CORE_CURSE_KEEPER:46, CORE_LAST_STAND:45, CORE_KEEN_EYE:39, CORE_EXECUTIONER:32, CORE_BOUNTY_HUNTER:31); 装備(shield:SMALL_SHIELD:319, weapon:MACE:309, shield:MAGIC_SHIELD:162, armor:LEATHER_ARMOR:130, armor:EXPLORER_CLOAK:94, accessory:AMULET_HP:89, armor:PRIEST_ROBE:84, weapon:HOLY_STAFF:77)
- **no-portal-no-flee / Mage (魔術師)**: death N=455; lv 4.96 [4.83, 5.10]; N=455; 装備slot 2.88 [2.85, 2.91]; N=455; lv帯(L1=7, L2–3=16, L4–5=371, L6+=61); core(CORE_CAMP_MASTER:277, CORE_SNEAK_STEP:96, CORE_EXECUTIONER:86, CORE_CURSE_KEEPER:85, CORE_PURIFY_RING:76, CORE_LAST_STAND:71, CORE_GIANT_SLAYER:62, CORE_TRAP_EATER:42); 装備(armor:ARCANE_ROBE:219, weapon:ARCH_WAND:176, weapon:SAGE_STAFF:139, armor:SORCERER_ROBE:93, armor:EXPLORER_CLOAK:91, weapon:DAGGER:90, accessory:AMULET_HP:79, accessory:RING_STR:79)

## 素材収支（死亡30% bank反映）

`banked` は sim が `getBankedMaterials` で計算した実効 bank 素材（撤退100%、死亡30%）の total/run。`banked/time` はその実効 bank を sim の時間コストで割った run 平均。 `consumedMerchant` は既存 sim の商人消費計測であり、出発クラフトは banked の前段で反映済み。

| 条件 | 職 | banked total/run [CI; N] | banked/time [CI; N] | acquired/run | merchant消費/run | 死亡時bank/run |
| --- | --- | --- | --- | --- | --- | --- |
| baseline-portal-flee | Fighter (戦士) | 107.37 [99.84, 114.89]; N=500 | 0.2480 [0.2392, 0.2567]; N=500 | 123.50 [115.53, 131.46]; N=500 | 0.80 [0.67, 0.94]; N=500 | 30.03 [23.43, 36.63]; N=96 |
| baseline-portal-flee | Thief (盗賊) | 71.26 [65.29, 77.23]; N=500 | 0.1821 [0.1724, 0.1918]; N=500 | 102.26 [96.52, 108.01]; N=500 | 0.36 [0.28, 0.44]; N=500 | 23.56 [21.35, 25.77]; N=229 |
| baseline-portal-flee | Priest (僧侶) | 32.96 [28.54, 37.37]; N=500 | 0.0987 [0.0914, 0.1059]; N=500 | 78.26 [71.80, 84.72]; N=500 | 0.45 [0.34, 0.57]; N=500 | 18.37 [16.44, 20.31]; N=420 |
| baseline-portal-flee | Mage (魔術師) | 80.46 [71.48, 89.45]; N=500 | 0.1821 [0.1719, 0.1923]; N=500 | 105.46 [96.94, 113.98]; N=500 | 0.59 [0.49, 0.69]; N=500 | 19.00 [16.92, 21.09]; N=216 |
| no-departure-portal | Fighter (戦士) | 103.38 [93.74, 113.02]; N=500 | 0.1797 [0.1693, 0.1900]; N=500 | 145.95 [136.40, 155.50]; N=500 | 1.30 [1.13, 1.47]; N=500 | 29.22 [25.81, 32.62]; N=256 |
| no-departure-portal | Thief (盗賊) | 53.76 [47.89, 59.64]; N=500 | 0.1232 [0.1147, 0.1317]; N=500 | 105.94 [100.21, 111.68]; N=500 | 0.46 [0.36, 0.56]; N=500 | 24.18 [22.62, 25.75]; N=373 |
| no-departure-portal | Priest (僧侶) | 27.69 [23.52, 31.86]; N=500 | 0.0791 [0.0741, 0.0841]; N=500 | 80.51 [73.72, 87.30]; N=500 | 0.50 [0.38, 0.62]; N=500 | 19.27 [17.39, 21.14]; N=469 |
| no-departure-portal | Mage (魔術師) | 69.36 [60.11, 78.62]; N=500 | 0.1288 [0.1198, 0.1379]; N=500 | 109.51 [100.89, 118.13]; N=500 | 0.70 [0.58, 0.81]; N=500 | 19.17 [17.53, 20.82]; N=341 |
| portal-unused | Fighter (戦士) | 63.67 [55.69, 71.66]; N=500 | 0.0815 [0.0778, 0.0852]; N=500 | 195.93 [181.50, 210.35]; N=500 | 2.03 [1.80, 2.25]; N=500 | 51.43 [47.35, 55.50]; N=488 |
| portal-unused | Thief (盗賊) | 34.89 [30.64, 39.13]; N=500 | 0.0721 [0.0700, 0.0743]; N=500 | 121.27 [112.80, 129.74]; N=500 | 0.63 [0.51, 0.75]; N=500 | 31.32 [28.95, 33.68]; N=496 |
| portal-unused | Priest (僧侶) | 21.62 [19.12, 24.11]; N=500 | 0.0672 [0.0647, 0.0697]; N=500 | 81.75 [74.82, 88.68]; N=500 | 0.53 [0.41, 0.66]; N=500 | 20.84 [18.86, 22.81]; N=499 |
| portal-unused | Mage (魔術師) | 43.82 [36.30, 51.33]; N=500 | 0.0731 [0.0693, 0.0769]; N=500 | 117.20 [107.70, 126.70]; N=500 | 0.86 [0.73, 1.00]; N=500 | 26.63 [24.33, 28.94]; N=478 |
| no-portal-no-flee | Fighter (戦士) | 66.93 [59.26, 74.60]; N=500 | 0.1512 [0.1411, 0.1612]; N=500 | 111.94 [104.38, 119.49]; N=500 | 0.48 [0.36, 0.59]; N=500 | 24.44 [22.39, 26.48]; N=321 |
| no-portal-no-flee | Thief (盗賊) | 41.08 [36.25, 45.91]; N=500 | 0.1118 [0.1039, 0.1196]; N=500 | 89.87 [85.18, 94.56]; N=500 | 0.17 [0.11, 0.23]; N=500 | 21.03 [19.91, 22.15]; N=395 |
| no-portal-no-flee | Priest (僧侶) | 27.72 [22.01, 33.42]; N=500 | 0.0685 [0.0642, 0.0728]; N=500 | 83.05 [74.45, 91.66]; N=500 | 0.38 [0.25, 0.50]; N=500 | 19.95 [17.81, 22.10]; N=481 |
| no-portal-no-flee | Mage (魔術師) | 58.01 [50.82, 65.19]; N=500 | 0.0884 [0.0828, 0.0940]; N=500 | 144.70 [136.84, 152.56]; N=500 | 0.66 [0.53, 0.78]; N=500 | 34.78 [32.77, 36.79]; N=455 |

- **baseline-portal-flee / Fighter (戦士)**: banked material vector (呪布=6.31, 毒腺=6.28, 獣の牙=26.54, 硬い皮=11.34, 竜鱗=7.91, 鉄片=11.84, 霊粉=7.21, 骨片=9.40, 魔石片=9.61, 黒角=10.93); 30% bank検算 mismatch=0
- **baseline-portal-flee / Thief (盗賊)**: banked material vector (呪布=4.75, 毒腺=4.34, 獣の牙=18.86, 硬い皮=8.70, 竜鱗=4.03, 鉄片=7.00, 霊粉=4.50, 骨片=6.47, 魔石片=6.54, 黒角=6.07); 30% bank検算 mismatch=0
- **baseline-portal-flee / Priest (僧侶)**: banked material vector (呪布=2.02, 毒腺=1.69, 獣の牙=7.93, 硬い皮=4.28, 竜鱗=2.41, 鉄片=3.57, 霊粉=1.93, 骨片=2.90, 魔石片=2.83, 黒角=3.41); 30% bank検算 mismatch=0
- **baseline-portal-flee / Mage (魔術師)**: banked material vector (呪布=4.98, 毒腺=3.53, 獣の牙=11.65, 硬い皮=7.99, 竜鱗=10.11, 鉄片=12.51, 霊粉=4.56, 骨片=6.40, 魔石片=6.76, 黒角=11.97); 30% bank検算 mismatch=0
- **no-departure-portal / Fighter (戦士)**: banked material vector (呪布=5.17, 毒腺=5.32, 獣の牙=22.08, 硬い皮=8.43, 竜鱗=10.38, 鉄片=14.11, 霊粉=7.38, 骨片=8.53, 魔石片=9.05, 黒角=12.94); 30% bank検算 mismatch=0
- **no-departure-portal / Thief (盗賊)**: banked material vector (呪布=3.40, 毒腺=3.04, 獣の牙=13.51, 硬い皮=5.90, 竜鱗=3.76, 鉄片=6.03, 霊粉=3.35, 骨片=4.74, 魔石片=4.78, 黒角=5.25); 30% bank検算 mismatch=0
- **no-departure-portal / Priest (僧侶)**: banked material vector (呪布=1.58, 毒腺=1.31, 獣の牙=6.55, 硬い皮=3.44, 竜鱗=2.25, 鉄片=3.23, 霊粉=1.59, 骨片=2.41, 魔石片=2.34, 黒角=2.99); 30% bank検算 mismatch=0
- **no-departure-portal / Mage (魔術師)**: banked material vector (呪布=3.67, 毒腺=2.82, 獣の牙=9.39, 硬い皮=5.88, 竜鱗=10.13, 鉄片=12.17, 霊粉=3.61, 骨片=4.87, 魔石片=5.39, 黒角=11.43); 30% bank検算 mismatch=0
- **portal-unused / Fighter (戦士)**: banked material vector (呪布=2.47, 毒腺=2.73, 獣の牙=11.69, 硬い皮=4.04, 竜鱗=7.73, 鉄片=10.06, 霊粉=4.97, 骨片=4.64, 魔石片=6.47, 黒角=8.88); 30% bank検算 mismatch=0
- **portal-unused / Thief (盗賊)**: banked material vector (呪布=1.99, 毒腺=1.73, 獣の牙=8.43, 硬い皮=3.54, 竜鱗=2.88, 鉄片=4.33, 霊粉=2.18, 骨片=2.82, 魔石片=3.23, 黒角=3.75); 30% bank検算 mismatch=0
- **portal-unused / Priest (僧侶)**: banked material vector (呪布=1.25, 毒腺=0.96, 獣の牙=5.32, 硬い皮=2.85, 竜鱗=1.66, 鉄片=2.39, 霊粉=1.22, 骨片=1.89, 魔石片=1.82, 黒角=2.26); 30% bank検算 mismatch=0
- **portal-unused / Mage (魔術師)**: banked material vector (呪布=2.09, 毒腺=1.48, 獣の牙=5.85, 硬い皮=3.51, 竜鱗=6.91, 鉄片=8.00, 霊粉=2.14, 骨片=2.73, 魔石片=3.35, 黒角=7.75); 30% bank検算 mismatch=0
- **no-portal-no-flee / Fighter (戦士)**: banked material vector (呪布=3.79, 毒腺=3.88, 獣の牙=16.79, 硬い皮=7.15, 竜鱗=4.72, 鉄片=7.47, 霊粉=4.32, 骨片=6.06, 魔石片=5.92, 黒角=6.83); 30% bank検算 mismatch=0
- **no-portal-no-flee / Thief (盗賊)**: banked material vector (呪布=2.56, 毒腺=2.65, 獣の牙=12.28, 硬い皮=5.59, 竜鱗=1.96, 鉄片=3.33, 霊粉=2.31, 骨片=3.75, 魔石片=3.39, 黒角=3.26); 30% bank検算 mismatch=0
- **no-portal-no-flee / Priest (僧侶)**: banked material vector (呪布=1.34, 毒腺=1.42, 獣の牙=7.60, 硬い皮=3.33, 竜鱗=1.92, 鉄片=2.92, 霊粉=1.72, 骨片=2.23, 魔石片=2.62, 黒角=2.61); 30% bank検算 mismatch=0
- **no-portal-no-flee / Mage (魔術師)**: banked material vector (呪布=2.80, 毒腺=3.01, 獣の牙=13.57, 硬い皮=4.62, 竜鱗=5.54, 鉄片=7.75, 霊粉=3.88, 骨片=4.80, 魔石片=4.74, 黒角=7.30); 30% bank検算 mismatch=0

## 同一 seed の paired 対比

各 run は同じ `className/runIndex/scenarioId/randomSequenceId` を対にした。 portal/逃走の変更後に軌跡自体が同一とは解釈せず、同じ生成開始系列に対する outcome 差として扱う。 paired 差の CI は run-level 差の平均95% CI。

| 条件 | 職 | paired N | 到達階差（条件−既定） | banked差（条件−既定） | 死亡率差 |
| --- | --- | ---: | --- | --- | --- |
| no-departure-portal | Fighter (戦士) | 500 | 0.84 [0.61, 1.06]; N=500 | -3.99 [-9.67, 1.70]; N=500 | 0.320 [0.278, 0.362]; N=500 |
| no-departure-portal | Thief (盗賊) | 500 | 0.19 [0.09, 0.28]; N=500 | -17.50 [-20.84, -14.15]; N=500 | 0.288 [0.247, 0.329]; N=500 |
| no-departure-portal | Priest (僧侶) | 500 | 0.07 [-0.03, 0.16]; N=500 | -5.27 [-7.55, -2.99]; N=500 | 0.098 [0.072, 0.124]; N=500 |
| no-departure-portal | Mage (魔術師) | 500 | 0.23 [0.05, 0.41]; N=500 | -11.10 [-15.90, -6.30]; N=500 | 0.250 [0.210, 0.290]; N=500 |
| portal-unused | Fighter (戦士) | 500 | 2.49 [2.13, 2.84]; N=500 | -43.69 [-51.46, -35.93]; N=500 | 0.784 [0.748, 0.820]; N=500 |
| portal-unused | Thief (盗賊) | 500 | 0.80 [0.60, 0.99]; N=500 | -36.37 [-41.41, -31.34]; N=500 | 0.534 [0.490, 0.578]; N=500 |
| portal-unused | Priest (僧侶) | 500 | 0.13 [0.02, 0.23]; N=500 | -11.34 [-14.38, -8.30]; N=500 | 0.158 [0.126, 0.190]; N=500 |
| portal-unused | Mage (魔術師) | 500 | 0.65 [0.43, 0.87]; N=500 | -36.65 [-42.69, -30.61]; N=500 | 0.524 [0.480, 0.568]; N=500 |
| no-portal-no-flee | Fighter (戦士) | 500 | -0.58 [-0.91, -0.25]; N=500 | -40.44 [-50.42, -30.45]; N=500 | 0.450 [0.396, 0.504]; N=500 |
| no-portal-no-flee | Thief (盗賊) | 500 | -0.61 [-0.82, -0.41]; N=500 | -30.18 [-36.91, -23.46]; N=500 | 0.332 [0.276, 0.388]; N=500 |
| no-portal-no-flee | Priest (僧侶) | 500 | -0.37 [-0.70, -0.04]; N=500 | -5.24 [-12.05, 1.57]; N=500 | 0.122 [0.087, 0.157]; N=500 |
| no-portal-no-flee | Mage (魔術師) | 500 | -0.29 [-0.73, 0.15]; N=500 | -22.46 [-33.54, -11.38]; N=500 | 0.478 [0.430, 0.526]; N=500 |

### 素材効率の深度帯（基準条件の到達階で層化）

帯は選択バイアスを避けるため、同一 paired run の既定条件 `reachedFloor` で層化した。 `commit優位` は banked 差 CI 下限>0、`既定優位` は上限<0、それ以外は確定不能。 N<30 は N不足で結論に使わない。

| 条件 | 職 | 帯 | N | banked差 [95% CI] | 判定 |
| --- | --- | --- | ---: | --- | --- |
| no-departure-portal | Fighter (戦士) | B1–4 | 130 | -17.37 [-23.20, -11.54]; N=130 | 既定優位 |
| no-departure-portal | Fighter (戦士) | B5–9 | 305 | 2.08 [-6.73, 10.88]; N=305 | 差を確定できず |
| no-departure-portal | Fighter (戦士) | B10–14 | 48 | -5.96 [-14.37, 2.46]; N=48 | 差を確定できず |
| no-departure-portal | Fighter (戦士) | B15+ | 17 | -4.88 [-11.87, 2.11]; N=17; N不足 | N不足 |
| no-departure-portal | Thief (盗賊) | B1–4 | 135 | -16.05 [-20.26, -11.85]; N=135 | 既定優位 |
| no-departure-portal | Thief (盗賊) | B5–9 | 332 | -17.95 [-21.93, -13.98]; N=332 | 既定優位 |
| no-departure-portal | Thief (盗賊) | B10–14 | 25 | -8.00 [-21.11, 5.11]; N=25; N不足 | N不足 |
| no-departure-portal | Thief (盗賊) | B15+ | 8 | -52.50 [-155.40, 50.40]; N=8; N不足 | N不足 |
| no-departure-portal | Priest (僧侶) | B1–4 | 254 | -1.47 [-2.49, -0.46]; N=254 | 既定優位 |
| no-departure-portal | Priest (僧侶) | B5–9 | 206 | -6.39 [-10.35, -2.42]; N=206 | 既定優位 |
| no-departure-portal | Priest (僧侶) | B10–14 | 29 | -20.90 [-38.50, -3.29]; N=29; N不足 | N不足 |
| no-departure-portal | Priest (僧侶) | B15+ | 11 | -30.73 [-77.74, 16.29]; N=11; N不足 | N不足 |
| no-departure-portal | Mage (魔術師) | B1–4 | 135 | -13.50 [-16.86, -10.15]; N=135 | 既定優位 |
| no-departure-portal | Mage (魔術師) | B5–9 | 270 | -6.21 [-12.01, -0.41]; N=270 | 既定優位 |
| no-departure-portal | Mage (魔術師) | B10–14 | 53 | -8.34 [-28.02, 11.34]; N=53 | 差を確定できず |
| no-departure-portal | Mage (魔術師) | B15+ | 42 | -38.31 [-71.50, -5.12]; N=42 | 既定優位 |
| portal-unused | Fighter (戦士) | B1–4 | 130 | -26.71 [-34.90, -18.52]; N=130 | 既定優位 |
| portal-unused | Fighter (戦士) | B5–9 | 305 | -36.65 [-45.06, -28.25]; N=305 | 既定優位 |
| portal-unused | Fighter (戦士) | B10–14 | 48 | -104.02 [-146.36, -61.69]; N=48 | 既定優位 |
| portal-unused | Fighter (戦士) | B15+ | 17 | -129.59 [-214.42, -44.76]; N=17; N不足 | N不足 |
| portal-unused | Thief (盗賊) | B1–4 | 135 | -24.73 [-28.78, -20.68]; N=135 | 既定優位 |
| portal-unused | Thief (盗賊) | B5–9 | 332 | -32.87 [-37.99, -27.76]; N=332 | 既定優位 |
| portal-unused | Thief (盗賊) | B10–14 | 25 | -115.40 [-154.82, -75.98]; N=25; N不足 | N不足 |
| portal-unused | Thief (盗賊) | B15+ | 8 | -131.25 [-280.81, 18.31]; N=8; N不足 | N不足 |
| portal-unused | Priest (僧侶) | B1–4 | 254 | -2.30 [-3.36, -1.23]; N=254 | 既定優位 |
| portal-unused | Priest (僧侶) | B5–9 | 206 | -13.11 [-16.91, -9.30]; N=206 | 既定優位 |
| portal-unused | Priest (僧侶) | B10–14 | 29 | -46.45 [-73.01, -19.89]; N=29; N不足 | N不足 |
| portal-unused | Priest (僧侶) | B15+ | 11 | -94.64 [-164.69, -24.59]; N=11; N不足 | N不足 |
| portal-unused | Mage (魔術師) | B1–4 | 135 | -19.08 [-23.13, -15.03]; N=135 | 既定優位 |
| portal-unused | Mage (魔術師) | B5–9 | 270 | -23.78 [-27.65, -19.91]; N=270 | 既定優位 |
| portal-unused | Mage (魔術師) | B10–14 | 53 | -79.75 [-106.67, -52.84]; N=53 | 既定優位 |
| portal-unused | Mage (魔術師) | B15+ | 42 | -121.40 [-168.67, -74.14]; N=42 | 既定優位 |
| no-portal-no-flee | Fighter (戦士) | B1–4 | 130 | -1.49 [-13.58, 10.59]; N=130 | 差を確定できず |
| no-portal-no-flee | Fighter (戦士) | B5–9 | 305 | -27.57 [-38.73, -16.41]; N=305 | 既定優位 |
| no-portal-no-flee | Fighter (戦士) | B10–14 | 48 | -160.50 [-194.73, -126.27]; N=48 | 既定優位 |
| no-portal-no-flee | Fighter (戦士) | B15+ | 17 | -230.18 [-321.59, -138.76]; N=17; N不足 | N不足 |
| no-portal-no-flee | Thief (盗賊) | B1–4 | 135 | -16.44 [-22.47, -10.41]; N=135 | 既定優位 |
| no-portal-no-flee | Thief (盗賊) | B5–9 | 332 | -23.91 [-31.72, -16.10]; N=332 | 既定優位 |
| no-portal-no-flee | Thief (盗賊) | B10–14 | 25 | -133.88 [-182.20, -85.56]; N=25; N不足 | N不足 |
| no-portal-no-flee | Thief (盗賊) | B15+ | 8 | -198.38 [-291.58, -105.17]; N=8; N不足 | N不足 |
| no-portal-no-flee | Priest (僧侶) | B1–4 | 254 | 10.48 [3.19, 17.77]; N=254 | commit優位 |
| no-portal-no-flee | Priest (僧侶) | B5–9 | 206 | -9.81 [-17.79, -1.83]; N=206 | 既定優位 |
| no-portal-no-flee | Priest (僧侶) | B10–14 | 29 | -44.24 [-107.08, 18.60]; N=29; N不足 | N不足 |
| no-portal-no-flee | Priest (僧侶) | B15+ | 11 | -179.82 [-250.69, -108.95]; N=11; N不足 | N不足 |
| no-portal-no-flee | Mage (魔術師) | B1–4 | 135 | 25.16 [11.11, 39.21]; N=135 | commit優位 |
| no-portal-no-flee | Mage (魔術師) | B5–9 | 270 | 9.65 [-0.50, 19.80]; N=270 | 差を確定できず |
| no-portal-no-flee | Mage (魔術師) | B10–14 | 53 | -121.57 [-146.13, -97.00]; N=53 | 既定優位 |
| no-portal-no-flee | Mage (魔術師) | B15+ | 42 | -256.86 [-309.66, -204.06]; N=42 | 既定優位 |

## 結論

現行 base の既定（翼あり・逃走あり）平均は Fighter (戦士) 5.898 / Thief (盗賊) 5.144 / Priest (僧侶) 4.520 / Mage (魔術師) 6.504。翼を持たずに出発する条件は途中入手の翼を許すため、翼を完全に禁止する条件ではなく、`PORTAL_HP_THRESHOLD=0` が「所持するが使わない」、`FLEE_POLICY=never` が逃走撤退を切る条件である。

- no-departure-portal: Fighter (戦士) 6.736 / Thief (盗賊) 5.330 / Priest (僧侶) 4.588 / Mage (魔術師) 6.734
- portal-unused: Fighter (戦士) 8.384 / Thief (盗賊) 5.940 / Priest (僧侶) 4.648 / Mage (魔術師) 7.154
- no-portal-no-flee: Fighter (戦士) 5.318 / Thief (盗賊) 4.532 / Priest (僧侶) 4.152 / Mage (魔術師) 6.212

素材効率で commit 優位が確定した帯: no-portal-no-flee/Priest (僧侶) B1–4, no-portal-no-flee/Mage (魔術師) B1–4。
死亡時 bank は `BANKING_RATES.death=0.3` を適用しており、深度を伸ばすことと素材効率を同一視しない。

## 判断・制約・未解決

- #612/#652基準線の seed=231、series ID、run ごとの hash seed、工房系列、core calibration の手順を再利用した。
- 条件2は「出発時に翼を持たない」、条件3は「翼を持つが threshold=0 で使わない」であり、宝箱からの途中入手は共通の既存経路に任せた。
- 条件4は条件2 + `FLEE_POLICY=never` とした。逃走も撤退の一種なので、翼だけを切った条件と分離した。
- 既定の sim ロジック（探索、戦闘、報酬、map生成）は再実装していない。新規ファイルは既存 `simulateRun` を呼ぶ run-scope worker と、child 実行・集計だけの harness である。
- `N不足` は未確定であり、到達しないこととは区別した。全職×条件の主結果は N=500 なので、N<30 の死亡状態/深度帯だけを結論の根拠にしない。

## 再現コマンド

```sh
node scratch/measurements/issue624_commit_depth.js
```

smoke は N=1 のみで本測定の代用ではない。実行時に `SIM_PARALLEL` / `SIM_MAP_CACHE_ENTRIES` を指定してはならない。

```sh
ISSUE624_SMOKE=1 node scratch/measurements/issue624_commit_depth.js
```
