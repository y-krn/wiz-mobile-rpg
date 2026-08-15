# Issue #624 測定: 「持ち帰りを諦めて潜る」到達限界

- 測定 source commit: `e1acd893c34ed66973bf66c5af13beba7458d54d`
- 条件数: 4、職別 N=500、職: Fighter (戦士) / Thief (盗賊) / Priest (僧侶) / Mage (魔術師)
- 目標深度: B21（B1開始、既存 #612 の重み付き工房系列）
- raw JSONL: ignored measurement artifact; not committed
- raw JSONL SHA-256: `e8c0f87a0eda369fe94d6fdc360615b7cd33c84b0e765a1b574e148e9fbf278c`
- summary env hash（全条件の短縮hash）: `873c4a40de334577`

## 測定条件

既定の #612 固定 env（TRAP_POLICY=conservative、鑑定粉、状態回復、elite avoid、DEPARTURE_CRAFT_IDS の heal/antidote/guard を含む）を基準にし、portal と逃走だけを変更した。 `SIM_PARALLEL` と `SIM_MAP_CACHE_ENTRIES` は未指定で、runtime の既定値を使用した。

| 条件 | 差分 | env hash | parallelism | wall |
| --- | --- | --- | ---: | ---: |
| baseline-portal-flee（既定：翼あり・逃走あり） | 差分なし | `191ddfe975ebdace` | 15 | 6.8s |
| no-departure-portal（翼なし出発・逃走あり） | `DEPARTURE_CRAFT_IDS=HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION` | `f48e2abc9c9002d9` | 15 | 7.2s |
| portal-unused（翼所持・PORTAL_HP_THRESHOLD=0・逃走あり） | `PORTAL_HP_THRESHOLD=0` | `85a09e86fc9995cc` | 15 | 8.3s |
| no-portal-no-flee（翼なし出発・逃走なし） | `DEPARTURE_CRAFT_IDS=HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION`, `FLEE_POLICY=never` | `363de3e78803dfa7` | 15 | 8.0s |

条件4は条件2（翼を出発キットから除外）に `FLEE_POLICY=never` を加えた。条件2は宝箱等で途中入手した翼まで禁止する条件ではなく、「持たずに出発」の条件である。

## 基準線再現（#612 1x）

期待値は到達階平均 Fighter 6.14 / Thief 5.22 / Priest 4.83 / Mage 6.44。 判定は表示2桁の丸め誤差を許容して |実測−期待|≤0.005 とした。

| 職 | 期待 | 実測平均 | 差 | 判定 |
| --- | ---: | ---: | ---: | --- |
| Fighter (戦士) | 6.14 | 6.1240 | -0.0160 | 不一致（原因調査要） |
| Thief (盗賊) | 5.22 | 5.2200 | +0.0000 | 一致 |
| Priest (僧侶) | 4.83 | 4.8260 | -0.0040 | 一致 |
| Mage (魔術師) | 6.44 | 6.4420 | +0.0020 | 一致 |

基準線再現: **不可。測定側の変更を確定せず原因調査が必要**。

### 基準線不一致の原因調査

#612 の期待値は `164547a`（#622測定、2026-08-15 13:54 JST）の結果で、現 HEAD の `89474a0`（#625、同日 14:49 JST）より前に測定された。#625 は `scratch/sim_depth_material_ev.js` のローカル encounter chance 式を削除し、`src/movement.js` の `calculateEncounterChance` を静的 import して共有する変更である。本測定は現行の共有 helper を通るため、#612 の Fighter だけ到達階平均が 6.14→6.1240 へ変わった（Thief 5.2200、Priest 4.8260、Mage 6.4420 は期待値と一致）。

したがって Fighter の #612 値は現 HEAD では厳密再現不能であり、測定側が #625 以前から変わったことを記録する。死亡 snapshot の追加計装は terminal event 後の 読み取り専用処理で、乱数・探索・戦闘の経路を変更していない。以下の paired 比較は 現 HEAD で再測定した `baseline-portal-flee` を対照にし、#612 旧値への遡及比較ではない。

## 到達階の主要結果（全run分母）

平均は通常近似95% CI、率は Wilson 95% CI。`N不足` は N<30 で、結論には使わない。 到達階は死亡・撤退を含む `reachedFloor` の run 平均である。

| 条件 | 職 | 到達階平均 [95% CI; N] | 生還率 Wilson | 死亡率 Wilson |
| --- | --- | --- | --- | --- |
| baseline-portal-flee | Fighter (戦士) | 6.12 [5.84, 6.41]; N=500 | 83.0% [79.5%, 86.0%; 415/500] | 17.0% [14.0%, 20.5%; 85/500] |
| baseline-portal-flee | Thief (盗賊) | 5.22 [5.01, 5.43]; N=500 | 50.2% [45.8%, 54.6%; 251/500] | 49.8% [45.4%, 54.2%; 249/500] |
| baseline-portal-flee | Priest (僧侶) | 4.83 [4.54, 5.12]; N=500 | 13.0% [10.3%, 16.2%; 65/500] | 87.0% [83.8%, 89.7%; 435/500] |
| baseline-portal-flee | Mage (魔術師) | 6.44 [6.10, 6.78]; N=500 | 53.6% [49.2%, 57.9%; 268/500] | 46.4% [42.1%, 50.8%; 232/500] |
| no-departure-portal | Fighter (戦士) | 6.80 [6.49, 7.11]; N=500 | 51.0% [46.6%, 55.4%; 255/500] | 49.0% [44.6%, 53.4%; 245/500] |
| no-departure-portal | Thief (盗賊) | 5.41 [5.19, 5.62]; N=500 | 22.6% [19.2%, 26.5%; 113/500] | 77.4% [73.5%, 80.8%; 387/500] |
| no-departure-portal | Priest (僧侶) | 4.87 [4.58, 5.15]; N=500 | 8.0% [5.9%, 10.7%; 40/500] | 92.0% [89.3%, 94.1%; 460/500] |
| no-departure-portal | Mage (魔術師) | 6.64 [6.29, 6.98]; N=500 | 28.8% [25.0%, 32.9%; 144/500] | 71.2% [67.1%, 75.0%; 356/500] |
| portal-unused | Fighter (戦士) | 8.49 [8.03, 8.94]; N=500 | 1.8% [0.9%, 3.4%; 9/500] | 98.2% [96.6%, 99.1%; 491/500] |
| portal-unused | Thief (盗賊) | 5.84 [5.56, 6.12]; N=500 | 0.6% [0.2%, 1.7%; 3/500] | 99.4% [98.3%, 99.8%; 497/500] |
| portal-unused | Priest (僧侶) | 4.96 [4.65, 5.27]; N=500 | 0.2% [0.0%, 1.1%; 1/500] | 99.8% [98.9%, 100.0%; 499/500] |
| portal-unused | Mage (魔術師) | 7.00 [6.60, 7.40]; N=500 | 1.4% [0.7%, 2.9%; 7/500] | 98.6% [97.1%, 99.3%; 493/500] |
| no-portal-no-flee | Fighter (戦士) | 5.64 [5.35, 5.92]; N=500 | 39.4% [35.2%, 43.7%; 197/500] | 60.6% [56.3%, 64.8%; 303/500] |
| no-portal-no-flee | Thief (盗賊) | 4.60 [4.44, 4.77]; N=500 | 19.4% [16.2%, 23.1%; 97/500] | 80.6% [76.9%, 83.8%; 403/500] |
| no-portal-no-flee | Priest (僧侶) | 4.29 [4.01, 4.57]; N=500 | 1.8% [0.9%, 3.4%; 9/500] | 98.2% [96.6%, 99.1%; 491/500] |
| no-portal-no-flee | Mage (魔術師) | 7.59 [7.27, 7.91]; N=500 | 16.8% [13.8%, 20.3%; 84/500] | 83.2% [79.7%, 86.2%; 416/500] |

## 全階分布

各セルは `D=その到達階で死亡 / R=その到達階で撤退・生還`。死亡階分布は死亡 run を分母とせず、件数を全階で列挙する。

- **baseline-portal-flee / Fighter (戦士)**: B1=D14/R0; B2=D10/R0; B3=D4/R21; B4=D7/R58; B5=D39/R201; B6=D0/R10; B7=D3/R15; B8=D0/R20; B9=D2/R12; B10=D0/R34; B11=D2/R7; B12=D0/R9; B13=D0/R8; B14=D1/R9; B15=D0/R5; B16=D2/R3; B17=D1/R0; B18=D0/R1; B19=D0/R1; B20=D0/R0; B21=D0/R1
  - deathFloor: B1=14, B2=10, B3=4, B4=7, B5=39, B6=0, B7=3, B8=0, B9=2, B10=0, B11=2, B12=0, B13=0, B14=1, B15=0, B16=2, B17=1, B18=0, B19=0, B20=0, B21=0
- **baseline-portal-flee / Thief (盗賊)**: B1=D15/R0; B2=D16/R0; B3=D10/R32; B4=D15/R34; B5=D174/R127; B6=D5/R5; B7=D2/R12; B8=D5/R6; B9=D1/R8; B10=D1/R10; B11=D0/R2; B12=D1/R4; B13=D2/R3; B14=D0/R5; B15=D0/R2; B16=D1/R1; B17=D0/R0; B18=D0/R0; B19=D0/R0; B20=D1/R0; B21=D0/R0
  - deathFloor: B1=15, B2=16, B3=10, B4=15, B5=174, B6=5, B7=2, B8=5, B9=1, B10=1, B11=0, B12=1, B13=2, B14=0, B15=0, B16=1, B17=0, B18=0, B19=0, B20=1, B21=0
- **baseline-portal-flee / Priest (僧侶)**: B1=D44/R0; B2=D50/R0; B3=D74/R1; B4=D74/R16; B5=D154/R8; B6=D7/R0; B7=D6/R4; B8=D4/R4; B9=D1/R4; B10=D5/R6; B11=D2/R0; B12=D4/R4; B13=D2/R4; B14=D2/R3; B15=D2/R6; B16=D0/R2; B17=D2/R2; B18=D1/R0; B19=D1/R0; B20=D0/R1; B21=D0/R0
  - deathFloor: B1=44, B2=50, B3=74, B4=74, B5=154, B6=7, B7=6, B8=4, B9=1, B10=5, B11=2, B12=4, B13=2, B14=2, B15=2, B16=0, B17=2, B18=1, B19=1, B20=0, B21=0
- **baseline-portal-flee / Mage (魔術師)**: B1=D9/R0; B2=D9/R0; B3=D16/R8; B4=D40/R39; B5=D111/R134; B6=D8/R2; B7=D7/R3; B8=D7/R8; B9=D6/R3; B10=D5/R10; B11=D2/R7; B12=D2/R9; B13=D3/R5; B14=D1/R8; B15=D2/R12; B16=D1/R5; B17=D1/R5; B18=D2/R3; B19=D0/R1; B20=D0/R4; B21=D0/R2
  - deathFloor: B1=9, B2=9, B3=16, B4=40, B5=111, B6=8, B7=7, B8=7, B9=6, B10=5, B11=2, B12=2, B13=3, B14=1, B15=2, B16=1, B17=1, B18=2, B19=0, B20=0, B21=0
- **no-departure-portal / Fighter (戦士)**: B1=D14/R0; B2=D10/R0; B3=D10/R4; B4=D30/R17; B5=D134/R81; B6=D8/R10; B7=D10/R15; B8=D5/R16; B9=D5/R17; B10=D4/R35; B11=D2/R10; B12=D2/R11; B13=D3/R11; B14=D1/R13; B15=D2/R8; B16=D3/R3; B17=D1/R1; B18=D1/R0; B19=D0/R2; B20=D0/R0; B21=D0/R1
  - deathFloor: B1=14, B2=10, B3=10, B4=30, B5=134, B6=8, B7=10, B8=5, B9=5, B10=4, B11=2, B12=2, B13=3, B14=1, B15=2, B16=3, B17=1, B18=1, B19=0, B20=0, B21=0
- **no-departure-portal / Thief (盗賊)**: B1=D15/R0; B2=D16/R0; B3=D17/R6; B4=D33/R10; B5=D276/R42; B6=D7/R5; B7=D4/R8; B8=D6/R5; B9=D2/R5; B10=D5/R13; B11=D0/R3; B12=D1/R4; B13=D2/R3; B14=D1/R6; B15=D0/R2; B16=D1/R1; B17=D0/R0; B18=D0/R0; B19=D0/R0; B20=D1/R0; B21=D0/R0
  - deathFloor: B1=15, B2=16, B3=17, B4=33, B5=276, B6=7, B7=4, B8=6, B9=2, B10=5, B11=0, B12=1, B13=2, B14=1, B15=0, B16=1, B17=0, B18=0, B19=0, B20=1, B21=0
- **no-departure-portal / Priest (僧侶)**: B1=D44/R0; B2=D49/R0; B3=D73/R0; B4=D86/R2; B5=D160/R3; B6=D7/R0; B7=D8/R2; B8=D6/R3; B9=D1/R5; B10=D6/R6; B11=D3/R0; B12=D6/R5; B13=D2/R2; B14=D3/R3; B15=D2/R5; B16=D0/R1; B17=D2/R2; B18=D1/R0; B19=D1/R0; B20=D0/R1; B21=D0/R0
  - deathFloor: B1=44, B2=49, B3=73, B4=86, B5=160, B6=7, B7=8, B8=6, B9=1, B10=6, B11=3, B12=6, B13=2, B14=3, B15=2, B16=0, B17=2, B18=1, B19=1, B20=0, B21=0
- **no-departure-portal / Mage (魔術師)**: B1=D9/R0; B2=D9/R0; B3=D15/R2; B4=D63/R9; B5=D195/R45; B6=D10/R3; B7=D12/R4; B8=D13/R7; B9=D5/R2; B10=D7/R10; B11=D2/R8; B12=D2/R8; B13=D4/R8; B14=D2/R7; B15=D4/R11; B16=D1/R5; B17=D1/R5; B18=D2/R2; B19=D0/R0; B20=D0/R6; B21=D0/R2
  - deathFloor: B1=9, B2=9, B3=15, B4=63, B5=195, B6=10, B7=12, B8=13, B9=5, B10=7, B11=2, B12=2, B13=4, B14=2, B15=4, B16=1, B17=1, B18=2, B19=0, B20=0, B21=0
- **portal-unused / Fighter (戦士)**: B1=D14/R0; B2=D10/R0; B3=D12/R0; B4=D38/R0; B5=D178/R0; B6=D15/R0; B7=D20/R0; B8=D20/R0; B9=D20/R0; B10=D23/R0; B11=D9/R0; B12=D18/R0; B13=D13/R0; B14=D21/R0; B15=D9/R0; B16=D35/R0; B17=D11/R0; B18=D5/R0; B19=D8/R0; B20=D12/R0; B21=D0/R9
  - deathFloor: B1=14, B2=10, B3=12, B4=38, B5=178, B6=15, B7=20, B8=20, B9=20, B10=23, B11=9, B12=18, B13=13, B14=21, B15=9, B16=35, B17=11, B18=5, B19=8, B20=12, B21=0
- **portal-unused / Thief (盗賊)**: B1=D15/R0; B2=D16/R0; B3=D18/R0; B4=D34/R0; B5=D318/R0; B6=D9/R0; B7=D7/R0; B8=D11/R0; B9=D7/R0; B10=D22/R0; B11=D5/R0; B12=D9/R0; B13=D5/R0; B14=D6/R0; B15=D6/R0; B16=D5/R0; B17=D1/R0; B18=D0/R0; B19=D2/R0; B20=D1/R0; B21=D0/R3
  - deathFloor: B1=15, B2=16, B3=18, B4=34, B5=318, B6=9, B7=7, B8=11, B9=7, B10=22, B11=5, B12=9, B13=5, B14=6, B15=6, B16=5, B17=1, B18=0, B19=2, B20=1, B21=0
- **portal-unused / Priest (僧侶)**: B1=D44/R0; B2=D50/R0; B3=D73/R0; B4=D86/R0; B5=D164/R0; B6=D8/R0; B7=D7/R0; B8=D7/R0; B9=D6/R0; B10=D9/R0; B11=D5/R0; B12=D9/R0; B13=D8/R0; B14=D5/R0; B15=D6/R0; B16=D1/R0; B17=D7/R0; B18=D2/R0; B19=D1/R0; B20=D1/R0; B21=D0/R1
  - deathFloor: B1=44, B2=50, B3=73, B4=86, B5=164, B6=8, B7=7, B8=7, B9=6, B10=9, B11=5, B12=9, B13=8, B14=5, B15=6, B16=1, B17=7, B18=2, B19=1, B20=1, B21=0
- **portal-unused / Mage (魔術師)**: B1=D9/R0; B2=D10/R0; B3=D19/R0; B4=D68/R0; B5=D234/R0; B6=D16/R0; B7=D13/R0; B8=D16/R0; B9=D10/R0; B10=D10/R0; B11=D5/R0; B12=D14/R0; B13=D14/R0; B14=D9/R0; B15=D13/R0; B16=D9/R0; B17=D5/R0; B18=D6/R0; B19=D2/R0; B20=D11/R0; B21=D0/R7
  - deathFloor: B1=9, B2=10, B3=19, B4=68, B5=234, B6=16, B7=13, B8=16, B9=10, B10=10, B11=5, B12=14, B13=14, B14=9, B15=13, B16=9, B17=5, B18=6, B19=2, B20=11, B21=0
- **no-portal-no-flee / Fighter (戦士)**: B1=D14/R0; B2=D29/R0; B3=D26/R24; B4=D51/R23; B5=D163/R59; B6=D3/R4; B7=D2/R7; B8=D3/R12; B9=D0/R9; B10=D5/R23; B11=D1/R3; B12=D1/R9; B13=D1/R7; B14=D0/R4; B15=D1/R8; B16=D0/R1; B17=D2/R1; B18=D0/R1; B19=D1/R0; B20=D0/R1; B21=D0/R1
  - deathFloor: B1=14, B2=29, B3=26, B4=51, B5=163, B6=3, B7=2, B8=3, B9=0, B10=5, B11=1, B12=1, B13=1, B14=0, B15=1, B16=0, B17=2, B18=0, B19=1, B20=0, B21=0
- **no-portal-no-flee / Thief (盗賊)**: B1=D16/R0; B2=D25/R0; B3=D46/R21; B4=D51/R20; B5=D250/R36; B6=D1/R3; B7=D5/R4; B8=D1/R3; B9=D3/R3; B10=D2/R5; B11=D0/R1; B12=D0/R0; B13=D0/R1; B14=D0/R0; B15=D1/R0; B16=D0/R0; B17=D0/R0; B18=D0/R0; B19=D1/R0; B20=D1/R0; B21=D0/R0
  - deathFloor: B1=16, B2=25, B3=46, B4=51, B5=250, B6=1, B7=5, B8=1, B9=3, B10=2, B11=0, B12=0, B13=0, B14=0, B15=1, B16=0, B17=0, B18=0, B19=1, B20=1, B21=0
- **no-portal-no-flee / Priest (僧侶)**: B1=D55/R0; B2=D95/R0; B3=D56/R0; B4=D72/R0; B5=D179/R1; B6=D3/R0; B7=D2/R0; B8=D0/R1; B9=D0/R0; B10=D6/R1; B11=D3/R0; B12=D2/R2; B13=D2/R2; B14=D2/R0; B15=D5/R0; B16=D3/R0; B17=D1/R1; B18=D3/R0; B19=D0/R0; B20=D2/R0; B21=D0/R1
  - deathFloor: B1=55, B2=95, B3=56, B4=72, B5=179, B6=3, B7=2, B8=0, B9=0, B10=6, B11=3, B12=2, B13=2, B14=2, B15=5, B16=3, B17=1, B18=3, B19=0, B20=2, B21=0
- **no-portal-no-flee / Mage (魔術師)**: B1=D13/R0; B2=D6/R0; B3=D6/R0; B4=D9/R0; B5=D217/R2; B6=D9/R2; B7=D11/R5; B8=D18/R12; B9=D10/R9; B10=D68/R17; B11=D2/R7; B12=D7/R9; B13=D8/R8; B14=D1/R2; B15=D29/R8; B16=D1/R1; B17=D0/R2; B18=D0/R0; B19=D0/R0; B20=D1/R0; B21=D0/R0
  - deathFloor: B1=13, B2=6, B3=6, B4=9, B5=217, B6=9, B7=11, B8=18, B9=10, B10=68, B11=2, B12=7, B13=8, B14=1, B15=29, B16=1, B17=0, B18=0, B19=0, B20=1, B21=0

## 死因内訳

死因率の分母は各セルの死亡 run 数（`death N`）で、Wilson 95% CI を付けた。 `boss` は boss/midboss、`trap` は trap source または cause に罠を含むもの、`normal` は通常遭遇、 `other` は elite/未分類である。

| 条件 | 職 | 死亡 N | boss | trap | normal | other |
| --- | --- | ---: | --- | --- | --- | --- |
| baseline-portal-flee | Fighter (戦士) | 85 | 8.2% [4.0%, 16.0%; 7/85] | 38.8% [29.2%, 49.5%; 33/85] | 52.9% [42.4%, 63.2%; 45/85] | 0.0% [0.0%, 4.3%; 0/85] |
| baseline-portal-flee | Thief (盗賊) | 249 | 5.2% [3.1%, 8.7%; 13/249] | 71.1% [65.2%, 76.4%; 177/249] | 23.7% [18.8%, 29.4%; 59/249] | 0.0% [0.0%, 1.5%; 0/249] |
| baseline-portal-flee | Priest (僧侶) | 435 | 1.4% [0.6%, 3.0%; 6/435] | 70.3% [65.9%, 74.4%; 306/435] | 28.3% [24.2%, 32.7%; 123/435] | 0.0% [0.0%, 0.9%; 0/435] |
| baseline-portal-flee | Mage (魔術師) | 232 | 4.7% [2.7%, 8.3%; 11/232] | 58.6% [52.2%, 64.8%; 136/232] | 36.6% [30.7%, 43.0%; 85/232] | 0.0% [0.0%, 1.6%; 0/232] |
| no-departure-portal | Fighter (戦士) | 245 | 4.9% [2.8%, 8.4%; 12/245] | 60.8% [54.6%, 66.7%; 149/245] | 34.3% [28.6%, 40.4%; 84/245] | 0.0% [0.0%, 1.5%; 0/245] |
| no-departure-portal | Thief (盗賊) | 387 | 4.4% [2.8%, 6.9%; 17/387] | 75.2% [70.7%, 79.2%; 291/387] | 20.4% [16.7%, 24.7%; 79/387] | 0.0% [0.0%, 1.0%; 0/387] |
| no-departure-portal | Priest (僧侶) | 460 | 1.3% [0.6%, 2.8%; 6/460] | 71.7% [67.5%, 75.7%; 330/460] | 27.0% [23.1%, 31.2%; 124/460] | 0.0% [0.0%, 0.8%; 0/460] |
| no-departure-portal | Mage (魔術師) | 356 | 4.5% [2.8%, 7.2%; 16/356] | 66.0% [60.9%, 70.7%; 235/356] | 29.5% [25.0%, 34.4%; 105/356] | 0.0% [0.0%, 1.1%; 0/356] |
| portal-unused | Fighter (戦士) | 491 | 3.5% [2.2%, 5.5%; 17/491] | 57.8% [53.4%, 62.1%; 284/491] | 38.7% [34.5%, 43.1%; 190/491] | 0.0% [0.0%, 0.8%; 0/491] |
| portal-unused | Thief (盗賊) | 497 | 5.4% [3.8%, 7.8%; 27/497] | 72.6% [68.6%, 76.4%; 361/497] | 21.9% [18.5%, 25.8%; 109/497] | 0.0% [0.0%, 0.8%; 0/497] |
| portal-unused | Priest (僧侶) | 499 | 1.8% [1.0%, 3.4%; 9/499] | 70.5% [66.4%, 74.4%; 352/499] | 27.7% [23.9%, 31.7%; 138/499] | 0.0% [0.0%, 0.8%; 0/499] |
| portal-unused | Mage (魔術師) | 493 | 4.7% [3.1%, 6.9%; 23/493] | 67.3% [63.1%, 71.3%; 332/493] | 28.0% [24.2%, 32.1%; 138/493] | 0.0% [0.0%, 0.8%; 0/493] |
| no-portal-no-flee | Fighter (戦士) | 303 | 16.8% [13.0%, 21.5%; 51/303] | 42.6% [37.1%, 48.2%; 129/303] | 40.6% [35.2%, 46.2%; 123/303] | 0.0% [0.0%, 1.3%; 0/303] |
| no-portal-no-flee | Thief (盗賊) | 403 | 7.7% [5.5%, 10.7%; 31/403] | 58.8% [53.9%, 63.5%; 237/403] | 33.5% [29.1%, 38.2%; 135/403] | 0.0% [0.0%, 0.9%; 0/403] |
| no-portal-no-flee | Priest (僧侶) | 491 | 10.2% [7.8%, 13.2%; 50/491] | 58.5% [54.0%, 62.7%; 287/491] | 31.4% [27.4%, 35.6%; 154/491] | 0.0% [0.0%, 0.8%; 0/491] |
| no-portal-no-flee | Mage (魔術師) | 416 | 65.1% [60.4%, 69.6%; 271/416] | 3.1% [1.8%, 5.3%; 13/416] | 31.7% [27.4%, 36.4%; 132/416] | 0.0% [0.0%, 0.9%; 0/416] |

## 死亡時のレベル・装備・core

死亡時 snapshot は既存 sim の死亡経路に計装し、level、HP/MP、装備 slot、装備 ID、support/core ID、inventory を保存した。以下は死亡 run 内の要約で、死亡 N<30 は N不足。

- **baseline-portal-flee / Fighter (戦士)**: death N=85; lv 3.64 [3.22, 4.06]; N=85; 装備slot 3.71 [3.61, 3.80]; N=85; lv帯(L1=8, L2–3=31, L4–5=37, L6+=9); core(CORE_THORN_SHIELD:24, CORE_CAMP_MASTER:22, CORE_SNEAK_STEP:22, CORE_LAST_STAND:16, CORE_CURSE_KEEPER:11, CORE_PURIFY_RING:11, CORE_EXECUTIONER:10, CORE_BLOOD_WAND:8); 装備(shield:SMALL_SHIELD:52, armor:LEATHER_ARMOR:38, armor:PLATE_MAIL:23, shield:KNIGHT_SHIELD:20, weapon:FIGHTER_SABER:20, accessory:RING_STR:18, weapon:CLAYMORE:18, weapon:SHORT_SWORD:18)
- **baseline-portal-flee / Thief (盗賊)**: death N=249; lv 3.90 [3.75, 4.05]; N=249; 装備slot 3.80 [3.75, 3.85]; N=249; lv帯(L1=13, L2–3=50, L4–5=179, L6+=7); core(CORE_SNEAK_STEP:94, CORE_CAMP_MASTER:75, CORE_EXECUTIONER:46, CORE_CURSE_KEEPER:43, CORE_LAST_STAND:38, CORE_BLOOD_WAND:35, CORE_GIANT_SLAYER:34, CORE_THORN_SHIELD:32); 装備(shield:SMALL_SHIELD:215, armor:LEATHER_ARMOR:101, weapon:RAPIER:84, weapon:NINJA_BLADE:66, armor:NINJA_SUIT:62, armor:BATTLE_GARB:59, accessory:RING_STR:48, weapon:NINJA_DAGGER:42)
- **baseline-portal-flee / Priest (僧侶)**: death N=435; lv 2.91 [2.77, 3.06]; N=435; 装備slot 3.67 [3.63, 3.72]; N=435; lv帯(L1=75, L2–3=221, L4–5=120, L6+=19); core(CORE_SNEAK_STEP:113, CORE_THORN_SHIELD:102, CORE_CAMP_MASTER:90, CORE_CURSE_KEEPER:51, CORE_LAST_STAND:43, CORE_GIANT_SLAYER:39, CORE_KEEN_EYE:34, CORE_PURIFY_RING:33); 装備(shield:SMALL_SHIELD:284, weapon:MACE:261, shield:MAGIC_SHIELD:151, armor:LEATHER_ARMOR:121, armor:CHAIN_MAIL:94, weapon:HOLY_STAFF:88, armor:PRIEST_ROBE:76, accessory:RING_STR:75)
- **baseline-portal-flee / Mage (魔術師)**: death N=232; lv 1.86 [1.64, 2.07]; N=232; 装備slot 2.75 [2.70, 2.81]; N=232; lv帯(L1=155, L2–3=47, L4–5=19, L6+=11); core(CORE_CAMP_MASTER:80, CORE_SNEAK_STEP:59, CORE_CURSE_KEEPER:32, CORE_GIANT_SLAYER:23, CORE_PURIFY_RING:22, CORE_KEEN_EYE:21, CORE_TRAP_EATER:20, CORE_LAST_STAND:18); 装備(armor:ARCANE_ROBE:97, weapon:SAGE_STAFF:84, armor:EXPLORER_CLOAK:57, weapon:ARCH_WAND:55, weapon:DAGGER:48, weapon:WAND:45, armor:SORCERER_ROBE:41, accessory:RING_STR:37)
- **no-departure-portal / Fighter (戦士)**: death N=245; lv 4.22 [4.02, 4.43]; N=245; 装備slot 3.82 [3.78, 3.87]; N=245; lv帯(L1=8, L2–3=53, L4–5=157, L6+=27); core(CORE_SNEAK_STEP:85, CORE_THORN_SHIELD:71, CORE_CAMP_MASTER:65, CORE_LAST_STAND:47, CORE_EXECUTIONER:38, CORE_CURSE_KEEPER:36, CORE_GIANT_SLAYER:27, CORE_PURIFY_RING:26); 装備(shield:SMALL_SHIELD:124, armor:LEATHER_ARMOR:86, shield:KNIGHT_SHIELD:70, armor:PLATE_MAIL:66, weapon:CLAYMORE:57, accessory:RING_AGI:53, accessory:RING_STR:52, weapon:FIGHTER_SABER:46)
- **no-departure-portal / Thief (盗賊)**: death N=387; lv 4.01 [3.90, 4.11]; N=387; 装備slot 3.81 [3.77, 3.85]; N=387; lv帯(L1=13, L2–3=70, L4–5=292, L6+=12); core(CORE_SNEAK_STEP:147, CORE_CAMP_MASTER:114, CORE_EXECUTIONER:76, CORE_LAST_STAND:69, CORE_CURSE_KEEPER:58, CORE_BLOOD_WAND:53, CORE_GIANT_SLAYER:50, CORE_THORN_SHIELD:44); 装備(shield:SMALL_SHIELD:339, armor:LEATHER_ARMOR:153, weapon:RAPIER:123, weapon:NINJA_BLADE:111, armor:NINJA_SUIT:100, armor:BATTLE_GARB:93, accessory:AMULET_HP:77, accessory:RING_STR:75)
- **no-departure-portal / Priest (僧侶)**: death N=460; lv 2.98 [2.84, 3.13]; N=460; 装備slot 3.68 [3.64, 3.72]; N=460; lv帯(L1=74, L2–3=236, L4–5=126, L6+=24); core(CORE_SNEAK_STEP:119, CORE_THORN_SHIELD:113, CORE_CAMP_MASTER:98, CORE_CURSE_KEEPER:55, CORE_LAST_STAND:48, CORE_GIANT_SLAYER:42, CORE_KEEN_EYE:39, CORE_PURIFY_RING:34); 装備(shield:SMALL_SHIELD:290, weapon:MACE:272, shield:MAGIC_SHIELD:170, armor:LEATHER_ARMOR:127, armor:CHAIN_MAIL:107, weapon:HOLY_STAFF:95, armor:PRIEST_ROBE:80, accessory:RING_STR:79)
- **no-departure-portal / Mage (魔術師)**: death N=356; lv 1.79 [1.63, 1.95]; N=356; 装備slot 2.76 [2.72, 2.81]; N=356; lv帯(L1=235, L2–3=81, L4–5=24, L6+=16); core(CORE_CAMP_MASTER:122, CORE_SNEAK_STEP:101, CORE_CURSE_KEEPER:48, CORE_GIANT_SLAYER:35, CORE_PURIFY_RING:34, CORE_EXECUTIONER:33, CORE_KEEN_EYE:31, CORE_BLOOD_WAND:29); 装備(armor:ARCANE_ROBE:156, weapon:SAGE_STAFF:148, armor:EXPLORER_CLOAK:88, weapon:ARCH_WAND:79, weapon:DAGGER:71, armor:SORCERER_ROBE:66, weapon:WAND:58, accessory:RING_STR:57)
- **portal-unused / Fighter (戦士)**: death N=491; lv 5.70 [5.48, 5.93]; N=491; 装備slot 3.89 [3.86, 3.92]; N=491; lv帯(L1=8, L2–3=60, L4–5=232, L6+=191); core(CORE_THORN_SHIELD:206, CORE_SNEAK_STEP:169, CORE_CAMP_MASTER:166, CORE_LAST_STAND:108, CORE_CURSE_KEEPER:106, CORE_EXECUTIONER:87, CORE_GIANT_SLAYER:64, CORE_BLOOD_WAND:57); 装備(shield:KNIGHT_SHIELD:201, armor:PLATE_MAIL:185, shield:SMALL_SHIELD:158, weapon:CLAYMORE:157, armor:LEATHER_ARMOR:143, accessory:AMULET_HP:112, shield:MAGIC_SHIELD:104, accessory:RING_STR:89)
- **portal-unused / Thief (盗賊)**: death N=497; lv 4.40 [4.27, 4.53]; N=497; 装備slot 3.84 [3.81, 3.88]; N=497; lv帯(L1=13, L2–3=78, L4–5=338, L6+=68); core(CORE_SNEAK_STEP:201, CORE_CAMP_MASTER:150, CORE_EXECUTIONER:96, CORE_LAST_STAND:88, CORE_CURSE_KEEPER:79, CORE_BLOOD_WAND:73, CORE_GIANT_SLAYER:73, CORE_THORN_SHIELD:60); 装備(shield:SMALL_SHIELD:428, armor:LEATHER_ARMOR:179, weapon:NINJA_BLADE:150, weapon:RAPIER:141, armor:NINJA_SUIT:135, armor:BATTLE_GARB:134, accessory:AMULET_HP:101, accessory:RING_STR:97)
- **portal-unused / Priest (僧侶)**: death N=499; lv 3.26 [3.09, 3.42]; N=499; 装備slot 3.70 [3.66, 3.74]; N=499; lv帯(L1=75, L2–3=239, L4–5=136, L6+=49); core(CORE_THORN_SHIELD:139, CORE_SNEAK_STEP:138, CORE_CAMP_MASTER:109, CORE_CURSE_KEEPER:61, CORE_GIANT_SLAYER:50, CORE_LAST_STAND:49, CORE_KEEN_EYE:43, CORE_PURIFY_RING:38); 装備(shield:SMALL_SHIELD:295, weapon:MACE:282, shield:MAGIC_SHIELD:204, armor:LEATHER_ARMOR:128, weapon:HOLY_STAFF:116, armor:CHAIN_MAIL:114, armor:PRIEST_ROBE:101, accessory:RING_STR:84)
- **portal-unused / Mage (魔術師)**: death N=493; lv 2.39 [2.19, 2.58]; N=493; 装備slot 2.82 [2.78, 2.85]; N=493; lv帯(L1=272, L2–3=115, L4–5=55, L6+=51); core(CORE_CAMP_MASTER:180, CORE_SNEAK_STEP:149, CORE_CURSE_KEEPER:76, CORE_GIANT_SLAYER:67, CORE_PURIFY_RING:66, CORE_BLOOD_WAND:55, CORE_EXECUTIONER:49, CORE_KEEN_EYE:48); 装備(armor:ARCANE_ROBE:207, weapon:SAGE_STAFF:180, weapon:ARCH_WAND:154, armor:EXPLORER_CLOAK:113, armor:SORCERER_ROBE:112, weapon:DAGGER:91, accessory:AMULET_HP:87, accessory:RING_STR:82)
- **no-portal-no-flee / Fighter (戦士)**: death N=303; lv 4.10 [3.94, 4.26]; N=303; 装備slot 3.73 [3.68, 3.78]; N=303; lv帯(L1=13, L2–3=54, L4–5=216, L6+=20); core(CORE_THORN_SHIELD:96, CORE_SNEAK_STEP:94, CORE_CAMP_MASTER:84, CORE_LAST_STAND:57, CORE_CURSE_KEEPER:34, CORE_BLOOD_WAND:32, CORE_EXECUTIONER:30, CORE_KEEN_EYE:27); 装備(shield:SMALL_SHIELD:152, armor:LEATHER_ARMOR:125, weapon:CLAYMORE:68, weapon:FIGHTER_SABER:67, shield:KNIGHT_SHIELD:66, armor:PLATE_MAIL:63, weapon:SHORT_SWORD:62, accessory:RING_STR:60)
- **no-portal-no-flee / Thief (盗賊)**: death N=403; lv 4.11 [4.00, 4.23]; N=403; 装備slot 3.79 [3.75, 3.83]; N=403; lv帯(L1=11, L2–3=70, L4–5=308, L6+=14); core(CORE_SNEAK_STEP:151, CORE_CAMP_MASTER:112, CORE_LAST_STAND:71, CORE_EXECUTIONER:59, CORE_KEEN_EYE:54, CORE_THORN_SHIELD:54, CORE_CURSE_KEEPER:52, CORE_GIANT_SLAYER:48); 装備(shield:SMALL_SHIELD:346, armor:LEATHER_ARMOR:171, weapon:RAPIER:147, armor:NINJA_SUIT:94, armor:BATTLE_GARB:82, weapon:NINJA_BLADE:79, weapon:NINJA_DAGGER:74, accessory:RING_STR:72)
- **no-portal-no-flee / Priest (僧侶)**: death N=491; lv 3.72 [3.55, 3.88]; N=491; 装備slot 3.71 [3.67, 3.75]; N=491; lv帯(L1=43, L2–3=177, L4–5=237, L6+=34); core(CORE_CAMP_MASTER:127, CORE_THORN_SHIELD:125, CORE_SNEAK_STEP:123, CORE_CURSE_KEEPER:55, CORE_KEEN_EYE:48, CORE_LAST_STAND:48, CORE_EXECUTIONER:35, CORE_GIANT_SLAYER:32); 装備(shield:SMALL_SHIELD:319, weapon:MACE:303, shield:MAGIC_SHIELD:172, armor:LEATHER_ARMOR:118, armor:EXPLORER_CLOAK:99, weapon:HOLY_STAFF:95, armor:CHAIN_MAIL:91, accessory:RING_STR:85)
- **no-portal-no-flee / Mage (魔術師)**: death N=416; lv 5.70 [5.52, 5.88]; N=416; 装備slot 2.88 [2.85, 2.91]; N=416; lv帯(L1=9, L2–3=18, L4–5=223, L6+=166); core(CORE_CAMP_MASTER:175, CORE_SNEAK_STEP:153, CORE_CURSE_KEEPER:86, CORE_EXECUTIONER:82, CORE_PURIFY_RING:77, CORE_LAST_STAND:68, CORE_GIANT_SLAYER:67, CORE_BLOOD_WAND:34); 装備(weapon:ARCH_WAND:204, armor:SORCERER_ROBE:143, armor:ARCANE_ROBE:134, weapon:SAGE_STAFF:94, armor:EXPLORER_CLOAK:90, accessory:AMULET_HP:81, weapon:DAGGER:65, accessory:RING_AGI:64)

## 素材収支（死亡30% bank反映）

`banked` は sim が `getBankedMaterials` で計算した実効 bank 素材（撤退100%、死亡30%）の total/run。`banked/time` はその実効 bank を sim の時間コストで割った run 平均。 `consumedMerchant` は既存 sim の商人消費計測であり、出発クラフトは banked の前段で反映済み。

| 条件 | 職 | banked total/run [CI; N] | banked/time [CI; N] | acquired/run | merchant消費/run | 死亡時bank/run |
| --- | --- | --- | --- | --- | --- | --- |
| baseline-portal-flee | Fighter (戦士) | 120.43 [112.23, 128.63]; N=500 | 0.2551 [0.2466, 0.2637]; N=500 | 132.46 [124.32, 140.61]; N=500 | 0.89 [0.76, 1.03]; N=500 | 25.07 [19.30, 30.84]; N=85 |
| baseline-portal-flee | Thief (盗賊) | 70.64 [64.68, 76.59]; N=500 | 0.1733 [0.1636, 0.1831]; N=500 | 104.98 [99.60, 110.35]; N=500 | 0.34 [0.26, 0.42]; N=500 | 24.05 [22.27, 25.83]; N=249 |
| baseline-portal-flee | Priest (僧侶) | 39.82 [33.25, 46.40]; N=500 | 0.0936 [0.0873, 0.1000]; N=500 | 86.50 [79.10, 93.91]; N=500 | 0.63 [0.49, 0.76]; N=500 | 17.91 [16.21, 19.60]; N=435 |
| baseline-portal-flee | Mage (魔術師) | 77.92 [69.32, 86.53]; N=500 | 0.1702 [0.1604, 0.1800]; N=500 | 106.81 [98.26, 115.36]; N=500 | 0.67 [0.56, 0.78]; N=500 | 20.85 [18.16, 23.54]; N=232 |
| no-departure-portal | Fighter (戦士) | 110.51 [100.66, 120.36]; N=500 | 0.1855 [0.1751, 0.1959]; N=500 | 151.02 [141.89, 160.16]; N=500 | 1.31 [1.15, 1.46]; N=500 | 29.34 [26.36, 32.32]; N=245 |
| no-departure-portal | Thief (盗賊) | 54.80 [48.61, 60.99]; N=500 | 0.1160 [0.1079, 0.1241]; N=500 | 109.59 [104.01, 115.18]; N=500 | 0.41 [0.32, 0.50]; N=500 | 24.53 [23.22, 25.85]; N=387 |
| no-departure-portal | Priest (僧侶) | 35.90 [29.85, 41.94]; N=500 | 0.0828 [0.0780, 0.0876]; N=500 | 87.50 [80.16, 94.83]; N=500 | 0.66 [0.52, 0.80]; N=500 | 18.91 [17.16, 20.65]; N=460 |
| no-departure-portal | Mage (魔術師) | 66.25 [57.38, 75.12]; N=500 | 0.1201 [0.1116, 0.1287]; N=500 | 109.88 [101.29, 118.47]; N=500 | 0.80 [0.68, 0.91]; N=500 | 20.22 [18.31, 22.14]; N=356 |
| portal-unused | Fighter (戦士) | 62.80 [55.75, 69.85]; N=500 | 0.0809 [0.0775, 0.0842]; N=500 | 200.90 [187.28, 214.52]; N=500 | 2.11 [1.90, 2.33]; N=500 | 53.71 [49.82, 57.60]; N=491 |
| portal-unused | Thief (盗賊) | 34.09 [30.18, 38.01]; N=500 | 0.0709 [0.0689, 0.0729]; N=500 | 120.05 [112.80, 127.30]; N=500 | 0.55 [0.44, 0.66]; N=500 | 31.10 [29.13, 33.07]; N=497 |
| portal-unused | Priest (僧侶) | 24.10 [20.97, 27.23]; N=500 | 0.0690 [0.0666, 0.0715]; N=500 | 89.78 [81.94, 97.63]; N=500 | 0.69 [0.55, 0.84]; N=500 | 22.97 [20.76, 25.17]; N=499 |
| portal-unused | Mage (魔術師) | 35.87 [30.24, 41.49]; N=500 | 0.0674 [0.0644, 0.0704]; N=500 | 117.37 [107.70, 127.04]; N=500 | 0.93 [0.80, 1.07]; N=500 | 29.17 [26.56, 31.78]; N=493 |
| no-portal-no-flee | Fighter (戦士) | 82.21 [73.04, 91.37]; N=500 | 0.1595 [0.1490, 0.1701]; N=500 | 124.11 [115.54, 132.68]; N=500 | 0.78 [0.64, 0.92]; N=500 | 23.88 [21.79, 25.96]; N=303 |
| no-portal-no-flee | Thief (盗賊) | 39.02 [35.25, 42.80]; N=500 | 0.1064 [0.0988, 0.1141]; N=500 | 92.39 [87.76, 97.01]; N=500 | 0.17 [0.11, 0.23]; N=500 | 22.87 [21.41, 24.34]; N=403 |
| no-portal-no-flee | Priest (僧侶) | 27.53 [22.58, 32.48]; N=500 | 0.0672 [0.0641, 0.0703]; N=500 | 88.49 [79.77, 97.21]; N=500 | 0.43 [0.30, 0.56]; N=500 | 21.76 [19.45, 24.07]; N=491 |
| no-portal-no-flee | Mage (魔術師) | 82.70 [74.39, 91.01]; N=500 | 0.1074 [0.1001, 0.1147]; N=500 | 183.42 [174.04, 192.79]; N=500 | 1.40 [1.25, 1.54]; N=500 | 45.45 [42.57, 48.33]; N=416 |

- **baseline-portal-flee / Fighter (戦士)**: banked material vector (呪布=7.01, 毒腺=6.79, 獣の牙=28.36, 硬い皮=11.73, 竜鱗=9.61, 鉄片=14.15, 霊粉=8.18, 骨片=10.90, 魔石片=10.76, 黒角=12.94); 30% bank検算 mismatch=0
- **baseline-portal-flee / Thief (盗賊)**: banked material vector (呪布=4.72, 毒腺=4.35, 獣の牙=18.89, 硬い皮=8.52, 竜鱗=4.15, 鉄片=7.07, 霊粉=4.44, 骨片=6.14, 魔石片=6.24, 黒角=6.11); 30% bank検算 mismatch=0
- **baseline-portal-flee / Priest (僧侶)**: banked material vector (呪布=2.08, 毒腺=1.95, 獣の牙=8.42, 硬い皮=4.34, 竜鱗=3.80, 鉄片=5.30, 霊粉=2.60, 骨片=3.48, 魔石片=3.28, 黒角=4.59); 30% bank検算 mismatch=0
- **baseline-portal-flee / Mage (魔術師)**: banked material vector (呪布=4.89, 毒腺=3.54, 獣の牙=11.43, 硬い皮=7.47, 竜鱗=9.41, 鉄片=12.05, 霊粉=4.67, 骨片=6.49, 魔石片=6.55, 黒角=11.42); 30% bank検算 mismatch=0
- **no-departure-portal / Fighter (戦士)**: banked material vector (呪布=5.48, 毒腺=5.60, 獣の牙=23.29, 硬い皮=8.74, 竜鱗=11.35, 鉄片=15.58, 霊粉=7.60, 骨片=9.59, 魔石片=9.35, 黒角=13.93); 30% bank検算 mismatch=0
- **no-departure-portal / Thief (盗賊)**: banked material vector (呪布=3.34, 毒腺=3.09, 獣の牙=13.84, 硬い皮=5.85, 竜鱗=4.10, 鉄片=6.54, 霊粉=3.34, 骨片=4.49, 魔石片=4.63, 黒角=5.59); 30% bank検算 mismatch=0
- **no-departure-portal / Priest (僧侶)**: banked material vector (呪布=1.84, 毒腺=1.70, 獣の牙=7.57, 硬い皮=3.86, 竜鱗=3.55, 鉄片=4.92, 霊粉=2.25, 骨片=3.09, 魔石片=2.87, 黒角=4.25); 30% bank検算 mismatch=0
- **no-departure-portal / Mage (魔術師)**: banked material vector (呪布=3.61, 毒腺=2.74, 獣の牙=8.93, 硬い皮=5.49, 竜鱗=9.22, 鉄片=11.33, 霊粉=3.82, 骨片=5.09, 魔石片=5.22, 黒角=10.81); 30% bank検算 mismatch=0
- **portal-unused / Fighter (戦士)**: banked material vector (呪布=2.45, 毒腺=2.73, 獣の牙=11.57, 硬い皮=3.95, 竜鱗=7.69, 鉄片=9.93, 霊粉=4.91, 骨片=4.90, 魔石片=5.92, 黒角=8.74); 30% bank検算 mismatch=0
- **portal-unused / Thief (盗賊)**: banked material vector (呪布=2.02, 毒腺=1.78, 獣の牙=8.72, 硬い皮=3.59, 竜鱗=2.57, 鉄片=4.10, 霊粉=2.06, 骨片=2.68, 魔石片=3.03, 黒角=3.54); 30% bank検算 mismatch=0
- **portal-unused / Priest (僧侶)**: banked material vector (呪布=1.33, 毒腺=1.20, 獣の牙=5.65, 硬い皮=3.05, 竜鱗=1.95, 鉄片=2.88, 霊粉=1.44, 骨片=2.07, 魔石片=2.04, 黒角=2.49); 30% bank検算 mismatch=0
- **portal-unused / Mage (魔術師)**: banked material vector (呪布=1.89, 毒腺=1.30, 獣の牙=5.16, 硬い皮=3.13, 竜鱗=4.86, 鉄片=6.06, 霊粉=2.01, 骨片=2.66, 魔石片=3.07, 黒角=5.72); 30% bank検算 mismatch=0
- **no-portal-no-flee / Fighter (戦士)**: banked material vector (呪布=4.39, 毒腺=4.64, 獣の牙=18.55, 硬い皮=7.42, 竜鱗=7.28, 鉄片=10.40, 霊粉=5.52, 骨片=6.84, 魔石片=7.13, 黒角=10.04); 30% bank検算 mismatch=0
- **no-portal-no-flee / Thief (盗賊)**: banked material vector (呪布=2.65, 毒腺=2.60, 獣の牙=11.72, 硬い皮=5.44, 竜鱗=1.44, 鉄片=3.04, 霊粉=2.13, 骨片=3.55, 魔石片=3.63, 黒角=2.81); 30% bank検算 mismatch=0
- **no-portal-no-flee / Priest (僧侶)**: banked material vector (呪布=1.43, 毒腺=1.42, 獣の牙=7.41, 硬い皮=3.31, 竜鱗=1.91, 鉄片=2.93, 霊粉=1.71, 骨片=2.27, 魔石片=2.51, 黒角=2.65); 30% bank検算 mismatch=0
- **no-portal-no-flee / Mage (魔術師)**: banked material vector (呪布=3.71, 毒腺=4.06, 獣の牙=17.01, 硬い皮=5.47, 竜鱗=8.98, 鉄片=12.30, 霊粉=5.69, 骨片=6.79, 魔石片=6.75, 黒角=11.95); 30% bank検算 mismatch=0

## 同一 seed の paired 対比

各 run は同じ `className/runIndex/scenarioId/randomSequenceId` を対にした。 portal/逃走の変更後に軌跡自体が同一とは解釈せず、同じ生成開始系列に対する outcome 差として扱う。 paired 差の CI は run-level 差の平均95% CI。

| 条件 | 職 | paired N | 到達階差（条件−既定） | banked差（条件−既定） | 死亡率差 |
| --- | --- | ---: | --- | --- | --- |
| no-departure-portal | Fighter (戦士) | 500 | 0.68 [0.49, 0.86]; N=500 | -9.92 [-15.79, -4.05]; N=500 | 0.320 [0.279, 0.361]; N=500 |
| no-departure-portal | Thief (盗賊) | 500 | 0.19 [0.10, 0.27]; N=500 | -15.84 [-19.34, -12.34]; N=500 | 0.276 [0.236, 0.316]; N=500 |
| no-departure-portal | Priest (僧侶) | 500 | 0.04 [-0.03, 0.11]; N=500 | -3.93 [-6.67, -1.18]; N=500 | 0.050 [0.031, 0.069]; N=500 |
| no-departure-portal | Mage (魔術師) | 500 | 0.19 [0.10, 0.29]; N=500 | -11.67 [-14.37, -8.97]; N=500 | 0.248 [0.209, 0.287]; N=500 |
| portal-unused | Fighter (戦士) | 500 | 2.36 [2.01, 2.71]; N=500 | -57.63 [-65.05, -50.20]; N=500 | 0.812 [0.778, 0.846]; N=500 |
| portal-unused | Thief (盗賊) | 500 | 0.62 [0.47, 0.78]; N=500 | -36.55 [-41.81, -31.28]; N=500 | 0.496 [0.452, 0.540]; N=500 |
| portal-unused | Priest (僧侶) | 500 | 0.14 [0.06, 0.22]; N=500 | -15.72 [-20.39, -11.05]; N=500 | 0.128 [0.099, 0.157]; N=500 |
| portal-unused | Mage (魔術師) | 500 | 0.56 [0.38, 0.74]; N=500 | -42.06 [-48.27, -35.85]; N=500 | 0.522 [0.478, 0.566]; N=500 |
| no-portal-no-flee | Fighter (戦士) | 500 | -0.49 [-0.83, -0.14]; N=500 | -38.22 [-49.34, -27.10]; N=500 | 0.436 [0.383, 0.489]; N=500 |
| no-portal-no-flee | Thief (盗賊) | 500 | -0.62 [-0.84, -0.39]; N=500 | -31.61 [-38.05, -25.18]; N=500 | 0.308 [0.251, 0.365]; N=500 |
| no-portal-no-flee | Priest (僧侶) | 500 | -0.54 [-0.91, -0.16]; N=500 | -12.29 [-20.39, -4.19]; N=500 | 0.112 [0.080, 0.144]; N=500 |
| no-portal-no-flee | Mage (魔術師) | 500 | 1.15 [0.70, 1.59]; N=500 | 4.78 [-7.18, 16.74]; N=500 | 0.368 [0.314, 0.422]; N=500 |

### 素材効率の深度帯（基準条件の到達階で層化）

帯は選択バイアスを避けるため、同一 paired run の既定条件 `reachedFloor` で層化した。 `commit優位` は banked 差 CI 下限>0、`既定優位` は上限<0、それ以外は確定不能。 N<30 は N不足で結論に使わない。

| 条件 | 職 | 帯 | N | banked差 [95% CI] | 判定 |
| --- | --- | --- | ---: | --- | --- |
| no-departure-portal | Fighter (戦士) | B1–4 | 114 | -3.06 [-15.51, 9.39]; N=114 | 差を確定できず |
| no-departure-portal | Fighter (戦士) | B5–9 | 302 | -11.44 [-19.02, -3.86]; N=302 | 既定優位 |
| no-departure-portal | Fighter (戦士) | B10–14 | 70 | -13.27 [-29.23, 2.68]; N=70 | 差を確定できず |
| no-departure-portal | Fighter (戦士) | B15+ | 14 | -16.21 [-40.72, 8.30]; N=14; N不足 | N不足 |
| no-departure-portal | Thief (盗賊) | B1–4 | 122 | -16.20 [-20.41, -11.98]; N=122 | 既定優位 |
| no-departure-portal | Thief (盗賊) | B5–9 | 345 | -16.40 [-20.96, -11.84]; N=345 | 既定優位 |
| no-departure-portal | Thief (盗賊) | B10–14 | 28 | -10.21 [-30.40, 9.97]; N=28; N不足 | N不足 |
| no-departure-portal | Thief (盗賊) | B15+ | 5 | 0.00 [0.00, 0.00]; N=5; N不足 | N不足 |
| no-departure-portal | Priest (僧侶) | B1–4 | 259 | -1.55 [-3.34, 0.24]; N=259 | 差を確定できず |
| no-departure-portal | Priest (僧侶) | B5–9 | 192 | -1.09 [-3.40, 1.21]; N=192 | 差を確定できず |
| no-departure-portal | Priest (僧侶) | B10–14 | 32 | -20.50 [-43.20, 2.20]; N=32 | 差を確定できず |
| no-departure-portal | Priest (僧侶) | B15+ | 17 | -41.00 [-96.02, 14.02]; N=17; N不足 | N不足 |
| no-departure-portal | Mage (魔術師) | B1–4 | 121 | -10.62 [-14.13, -7.11]; N=121 | 既定優位 |
| no-departure-portal | Mage (魔術師) | B5–9 | 289 | -13.88 [-17.36, -10.39]; N=289 | 既定優位 |
| no-departure-portal | Mage (魔術師) | B10–14 | 52 | -5.77 [-15.25, 3.71]; N=52 | 差を確定できず |
| no-departure-portal | Mage (魔術師) | B15+ | 38 | -6.32 [-22.65, 10.02]; N=38 | 差を確定できず |
| portal-unused | Fighter (戦士) | B1–4 | 114 | -19.52 [-25.86, -13.18]; N=114 | 既定優位 |
| portal-unused | Fighter (戦士) | B5–9 | 302 | -46.25 [-53.97, -38.53]; N=302 | 既定優位 |
| portal-unused | Fighter (戦士) | B10–14 | 70 | -143.67 [-167.16, -120.18]; N=70 | 既定優位 |
| portal-unused | Fighter (戦士) | B15+ | 14 | -183.14 [-275.11, -91.18]; N=14; N不足 | N不足 |
| portal-unused | Thief (盗賊) | B1–4 | 122 | -21.61 [-25.78, -17.45]; N=122 | 既定優位 |
| portal-unused | Thief (盗賊) | B5–9 | 345 | -32.92 [-38.25, -27.59]; N=345 | 既定優位 |
| portal-unused | Thief (盗賊) | B10–14 | 28 | -126.07 [-174.53, -77.62]; N=28; N不足 | N不足 |
| portal-unused | Thief (盗賊) | B15+ | 5 | -149.60 [-270.08, -29.12]; N=5; N不足 | N不足 |
| portal-unused | Priest (僧侶) | B1–4 | 259 | -2.68 [-4.01, -1.35]; N=259 | 既定優位 |
| portal-unused | Priest (僧侶) | B5–9 | 192 | -7.91 [-11.48, -4.34]; N=192 | 既定優位 |
| portal-unused | Priest (僧侶) | B10–14 | 32 | -96.06 [-130.18, -61.95]; N=32 | 既定優位 |
| portal-unused | Priest (僧侶) | B15+ | 17 | -151.35 [-225.24, -77.46]; N=17; N不足 | N不足 |
| portal-unused | Mage (魔術師) | B1–4 | 121 | -15.08 [-18.61, -11.55]; N=121 | 既定優位 |
| portal-unused | Mage (魔術師) | B5–9 | 289 | -26.73 [-30.38, -23.08]; N=289 | 既定優位 |
| portal-unused | Mage (魔術師) | B10–14 | 52 | -99.50 [-126.34, -72.66]; N=52 | 既定優位 |
| portal-unused | Mage (魔術師) | B15+ | 38 | -165.89 [-211.51, -120.28]; N=38 | 既定優位 |
| no-portal-no-flee | Fighter (戦士) | B1–4 | 114 | 3.87 [-9.55, 17.29]; N=114 | 差を確定できず |
| no-portal-no-flee | Fighter (戦士) | B5–9 | 302 | -21.98 [-33.83, -10.13]; N=302 | 既定優位 |
| no-portal-no-flee | Fighter (戦士) | B10–14 | 70 | -125.33 [-161.65, -89.01]; N=70 | 既定優位 |
| no-portal-no-flee | Fighter (戦士) | B15+ | 14 | -295.71 [-417.48, -173.95]; N=14; N不足 | N不足 |
| no-portal-no-flee | Thief (盗賊) | B1–4 | 122 | -9.48 [-17.05, -1.91]; N=122 | 既定優位 |
| no-portal-no-flee | Thief (盗賊) | B5–9 | 345 | -25.59 [-32.10, -19.08]; N=345 | 既定優位 |
| no-portal-no-flee | Thief (盗賊) | B10–14 | 28 | -181.25 [-220.74, -141.76]; N=28; N不足 | N不足 |
| no-portal-no-flee | Thief (盗賊) | B15+ | 5 | -149.40 [-278.40, -20.40]; N=5; N不足 | N不足 |
| no-portal-no-flee | Priest (僧侶) | B1–4 | 259 | 10.46 [5.43, 15.48]; N=259 | commit優位 |
| no-portal-no-flee | Priest (僧侶) | B5–9 | 192 | -0.03 [-11.66, 11.60]; N=192 | 差を確定できず |
| no-portal-no-flee | Priest (僧侶) | B10–14 | 32 | -129.47 [-166.80, -92.14]; N=32 | 既定優位 |
| no-portal-no-flee | Priest (僧侶) | B15+ | 17 | -276.71 [-350.17, -203.24]; N=17; N不足 | N不足 |
| no-portal-no-flee | Mage (魔術師) | B1–4 | 121 | 44.90 [30.03, 59.78]; N=121 | commit優位 |
| no-portal-no-flee | Mage (魔術師) | B5–9 | 289 | 39.35 [27.28, 51.42]; N=289 | commit優位 |
| no-portal-no-flee | Mage (魔術師) | B10–14 | 52 | -83.81 [-114.82, -52.79]; N=52 | 既定優位 |
| no-portal-no-flee | Mage (魔術師) | B15+ | 38 | -264.63 [-314.80, -214.46]; N=38 | 既定優位 |

## 判断・制約・未解決

- #612 基準線を再現するため、seed、series ID、run ごとの hash seed、工房系列、core calibration の手順を再利用した。
- 条件2は「出発時に翼を持たない」、条件3は「翼を持つが threshold=0 で使わない」であり、宝箱からの途中入手は共通の既存経路に任せた。
- 条件4は条件2 + `FLEE_POLICY=never` とした。逃走も撤退の一種なので、翼だけを切った条件と分離した。
- 既定の sim ロジック（探索、戦闘、報酬、map生成）は再実装していない。新規ファイルは既存 `simulateRun` を呼ぶ run-scope worker と、child 実行・集計だけの harness である。
- `N不足` は未確定であり、到達しないこととは区別した。全職×条件の主結果は N=500 なので、N<30 の死亡状態/深度帯だけを結論の根拠にしない。

## 再現コマンド

```sh
node scratch/issue624_commit_depth.js
```

smoke は N=1 のみで本測定の代用ではない。実行時に `SIM_PARALLEL` / `SIM_MAP_CACHE_ENTRIES` を指定してはならない。

```sh
ISSUE624_SMOKE=1 node scratch/issue624_commit_depth.js
```
