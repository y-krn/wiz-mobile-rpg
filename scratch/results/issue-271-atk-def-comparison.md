# Issue #271 `atk` / `def` affix before/after

工房解放済み（帰還の翼あり）、N=2,000、seed=2715、SIM_PARALLEL=15。
実grid `generateRunFloor`、実combat round、`applyCombatRewards`は勝利round内部1回。

## 修正前

- run 2000、B5 event 645、attempt 846
- B5勝率: event 4.2% / attempt 3.2%
- 職別event: Fighter 27/157=17.2% / Thief 0/214=0.0% / Priest 0/166=0.0% / Mage 0/108=0.0%
- 火力: 12.92 damage/combat turn、HP230へ17.80 turn
- 耐久: 8.54 damage/hit、死亡attempt平均1.81 hit
- atk 52/645=8.1%、装備時+2.92、全event平均+0.24、該当stat比27.9%
- def 134/645=20.8%、装備時+2.01、全event平均+0.42、該当stat比18.3%
- 平均到達 B3.99、生還51.1%、EV/時間0.14705
- 前半core遭遇70.8%、B5 boss到達32.3%、boss死/全死50.7%

## 修正後

- run 2000、B5 event 645、attempt 846
- B5勝率: event 4.2% / attempt 3.2%
- 職別event: Fighter 27/157=17.2% / Thief 0/214=0.0% / Priest 0/166=0.0% / Mage 0/108=0.0%
- 火力: 12.92 damage/combat turn、HP230へ17.80 turn
- 耐久: 8.54 damage/hit、死亡attempt平均1.81 hit
- atk 52/645=8.1%、装備時+2.92、全event平均+0.24、該当stat比27.9%
- def 134/645=20.8%、装備時+2.01、全event平均+0.42、該当stat比18.3%
- 平均到達 B3.99、生還51.1%、EV/時間0.14705
- 前半core遭遇70.8%、B5 boss到達32.3%、boss死/全死50.7%

## 判定

- before/after rows byte一致: Yes
- 生成`atk` / `def` supportは修正前から装備値へ加算済み。
- 修正対象の火印/鉄印は現行run simで到達不能な工房機能のため、run KPIへの影響なし。
- event勝率20–35%目標は未達。職業格差は不変。
