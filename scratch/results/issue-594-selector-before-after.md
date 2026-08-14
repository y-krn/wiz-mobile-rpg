# Issue #594 回復selector before/after深度比較

## 結論

Wilson 95% CI が重ならない指標が 1 件ある。方向・大きさは下表の CI 非重複行に従う。
他3職の対応run監査: Fighter/Thief/Mage は全行一致。選択selector由来の動きなし。

## 固定条件・実行記録

- target depth: B20（B5/B10 endpointとB20 survivalRateを同じtarget-depth runから集計）
- env hash（before/after共通）: `8fa953bd69a63df9124459dafa0020f17d53a8febafba166c0f7020d0cfcf252`
- source commit: `65ac88c49dd94e9389a1106cce97688446ebc823`
- origin/main ancestor: `true`、stale tree allowed: `false`
- before raw row SHA-256（保存なし）: `3b75f94ccbc97448e6bd1623fc25298c1396c983b039a6a12f20cb270a4c41ef`
- after raw row SHA-256（保存なし）: `f2159fa0799584253f82a577f691fc46f384fb67b051459ce8efd8f27839ba94`
- common calibration（after selectorで1回、両条件へ共有）: 10.626s; CPU 17.059s; profile SHA-256 `d7e0d4307cbdb20eab47ba8272dfa11d2e490f58f7f9e74def7ca526d439b6ad`
- before simulation: 6.297s; CPU 91.542s; parallelism 15
- after simulation: 6.475s; CPU 94.418s; parallelism 15
- `SIM_PARALLEL` は未指定（runtime default）、`SIM_MAP_CACHE_ENTRIES` は未指定（default 1024）、`SIM_SKIP_PROVENANCE` は未使用。
- `SIM_MADI_CANDIDATE` / `SIM_MADI_HEAL_MIN` / `SIM_MADI_HEAL_MAX` / `SIM_MADI_COST` は入力envで未設定。

固定env（selector gateを除く）:

```text
BLOOD_WAND_HP_PAYMENT_MIN_RATE=0.50
DEPARTURE_CRAFT_IDS=TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION
ELITE_POLICY=avoid
FLEE_HP_THRESHOLD=0.20
FLEE_POLICY=ev
HEAL_POTION_MERCHANT_POLICY=missing
HEAL_POTION_THRESHOLD=0.55
IDENTIFICATION_COST_OVERRIDE=1
IDENTIFICATION_POLICY=powder
IDENTIFICATION_STARTING_POWDER=2
ISSUE594_CALIBRATION_RUNS=100
ISSUE594_MANUAL_RANDOM_SEQUENCE=hash(SIM_SEED:issue594:scenarioId:className:runIndex)
ISSUE594_RUNS_PER_CLASS=500
ISSUE594_SCENARIOS=workshop-empty,workshop-stats,workshop-gear,workshop-blood-wand,workshop-blood-wand-spells,workshop-complete
ISSUE594_TARGET_DEPTH=20
ISSUE594_WORKSHOP_DISTRIBUTION=workshop-empty:30/1200,workshop-stats:74/1200,workshop-gear:69/1200,workshop-blood-wand:216/1200,workshop-blood-wand-spells:47/1200,workshop-complete:764/1200
PORTAL_HP_THRESHOLD=0.35
PORTAL_MAX_HEAL_POTIONS=0
PORTAL_MIN_FLOOR=3
SIM_440_CONDITION=current
SIM_CALIBRATION_RUNS=100
SIM_CORE_SCORE_DROP_TOLERANCE=0
SIM_DIALMA_CANDIDATE=1
SIM_INDEPENDENT_RUN_RANDOM=0
SIM_MADI_CANDIDATE=1
SIM_MADI_COST=
SIM_MADI_HEAL_MAX=
SIM_MADI_HEAL_MIN=
SIM_MADI_OVERRIDE_INPUTS=<unset>
SIM_MAP_CACHE_ENTRIES=<omitted; runtime default 1024>
SIM_PARALLEL=<omitted; runtime default>
SIM_PRESET=
SIM_RUNS=500
SIM_SCENARIOS=workshop-empty,workshop-stats,workshop-gear,workshop-blood-wand,workshop-blood-wand-spells,workshop-complete
SIM_SEED=461
SIM_SKIP_PROVENANCE=<omitted>
STATUS_CURE_HP_THRESHOLD=0.35
STATUS_CURE_MERCHANT_POLICY=missing
STATUS_CURE_POLICY=smart
TRAP_AVOIDANCE_POLICY=ev
TRAP_DAMAGE_MULTIPLIER=1
TRAP_POLICY=conservative
```


## 僧侶（Priest）

B5/B10 は `到達率=全run分母`、突破/死亡/撤退は `到達run分母`。B20 は生還/死亡とも全run分母。

| 指標 | before（配列順 find） | after（欠損量/cost/expected-waste） | 判定 |
| --- | --- | --- | --- |
| B5 到達率（全run分母） | 50.6% [46.2, 55.0; N=500] | 51.6% [47.2, 56.0; N=500] | CI重複（有意な変化なし） |
| B5 突破率（到達run分母） | 37.2% [31.4, 43.3; N=253] | 42.2% [36.4, 48.3; N=258] | CI重複（有意な変化なし） |
| B5 死亡率（到達run分母） | 59.3% [53.1, 65.2; N=253] | 57.8% [51.7, 63.6; N=258] | CI重複（有意な変化なし） |
| B5 撤退率（到達run分母） | 3.6% [1.9, 6.6; N=253] | 0.0% [0.0, 1.5; N=258] | CI非重複（after減, -3.6pt） |
| B10 到達率（全run分母） | 12.0% [9.4, 15.1; N=500] | 13.8% [11.1, 17.1; N=500] | CI重複（有意な変化なし） |
| B10 突破率（到達run分母） | 81.7% [70.1, 89.4; N=60] | 88.4% [78.8, 94.0; N=69] | CI重複（有意な変化なし） |
| B10 死亡率（到達run分母） | 6.7% [2.6, 15.9; N=60] | 2.9% [0.8, 10.0; N=69] | CI重複（有意な変化なし） |
| B10 撤退率（到達run分母） | 11.7% [5.8, 22.2; N=60] | 8.7% [4.0, 17.7; N=69] | CI重複（有意な変化なし） |
| B20 生還率（全run分母） | 11.8% [9.3, 14.9; N=500] | 9.8% [7.5, 12.7; N=500] | CI重複（有意な変化なし） |
| B20 死亡率（全run分母） | 88.2% [85.1, 90.7; N=500] | 90.2% [87.3, 92.5; N=500] | CI重複（有意な変化なし） |

### 僧侶の回復呪文使用監査

`selected/applied` は既存simの呪文使用メトリクス。`post/postHp` は戦闘後回復の回数/HP。

| 呪文 | before | after |
| --- | --- | --- |
| DIALMA | known=2046<br>castable=309<br>selected=9<br>applied=7<br>failed=2<br>post=29<br>postHp=794 | known=1926<br>castable=211<br>selected=0<br>applied=0<br>failed=0<br>post=0<br>postHp=0 |
| MADI | known=7834<br>castable=1499<br>selected=26<br>applied=25<br>failed=1<br>post=223<br>postHp=4823 | known=8636<br>castable=2112<br>selected=0<br>applied=0<br>failed=0<br>post=0<br>postHp=0 |
| MADIOS | known=21003<br>castable=12116<br>selected=223<br>applied=216<br>failed=7<br>post=2098<br>postHp=27242 | known=22088<br>castable=15263<br>selected=90<br>applied=85<br>failed=5<br>post=214<br>postHp=5675 |
| DIOS | known=23252<br>castable=20548<br>selected=62<br>applied=59<br>failed=3<br>post=1499<br>postHp=22287 | known=24343<br>castable=22188<br>selected=261<br>applied=257<br>failed=4<br>post=3864<br>postHp=52588 |

## 他3職

## 戦士（Fighter）

B5/B10 は `到達率=全run分母`、突破/死亡/撤退は `到達run分母`。B20 は生還/死亡とも全run分母。

| 指標 | before（配列順 find） | after（欠損量/cost/expected-waste） | 判定 |
| --- | --- | --- | --- |
| B5 到達率（全run分母） | 74.2% [70.2, 77.8; N=500] | 74.2% [70.2, 77.8; N=500] | CI重複（有意な変化なし） |
| B5 突破率（到達run分母） | 40.2% [35.3, 45.2; N=371] | 40.2% [35.3, 45.2; N=371] | CI重複（有意な変化なし） |
| B5 死亡率（到達run分母） | 9.4% [6.9, 12.8; N=371] | 9.4% [6.9, 12.8; N=371] | CI重複（有意な変化なし） |
| B5 撤退率（到達run分母） | 50.4% [45.3, 55.5; N=371] | 50.4% [45.3, 55.5; N=371] | CI重複（有意な変化なし） |
| B10 到達率（全run分母） | 17.6% [14.5, 21.2; N=500] | 17.6% [14.5, 21.2; N=500] | CI重複（有意な変化なし） |
| B10 突破率（到達run分母） | 65.9% [55.5, 75.0; N=88] | 65.9% [55.5, 75.0; N=88] | CI重複（有意な変化なし） |
| B10 死亡率（到達run分母） | 2.3% [0.6, 7.9; N=88] | 2.3% [0.6, 7.9; N=88] | CI重複（有意な変化なし） |
| B10 撤退率（到達run分母） | 31.8% [23.0, 42.1; N=88] | 31.8% [23.0, 42.1; N=88] | CI重複（有意な変化なし） |
| B20 生還率（全run分母） | 83.2% [79.7, 86.2; N=500] | 83.2% [79.7, 86.2; N=500] | CI重複（有意な変化なし） |
| B20 死亡率（全run分母） | 16.8% [13.8, 20.3; N=500] | 16.8% [13.8, 20.3; N=500] | CI重複（有意な変化なし） |

## 盗賊（Thief）

B5/B10 は `到達率=全run分母`、突破/死亡/撤退は `到達run分母`。B20 は生還/死亡とも全run分母。

| 指標 | before（配列順 find） | after（欠損量/cost/expected-waste） | 判定 |
| --- | --- | --- | --- |
| B5 到達率（全run分母） | 73.6% [69.6, 77.3; N=500] | 73.6% [69.6, 77.3; N=500] | CI重複（有意な変化なし） |
| B5 突破率（到達run分母） | 20.1% [16.3, 24.5; N=368] | 20.1% [16.3, 24.5; N=368] | CI重複（有意な変化なし） |
| B5 死亡率（到達run分母） | 47.6% [42.5, 52.7; N=368] | 47.6% [42.5, 52.7; N=368] | CI重複（有意な変化なし） |
| B5 撤退率（到達run分母） | 32.3% [27.8, 37.3; N=368] | 32.3% [27.8, 37.3; N=368] | CI重複（有意な変化なし） |
| B10 到達率（全run分母） | 6.8% [4.9, 9.4; N=500] | 6.8% [4.9, 9.4; N=500] | CI重複（有意な変化なし） |
| B10 突破率（到達run分母） | 52.9% [36.7, 68.5; N=34] | 52.9% [36.7, 68.5; N=34] | CI重複（有意な変化なし） |
| B10 死亡率（到達run分母） | 2.9% [0.5, 14.9; N=34] | 2.9% [0.5, 14.9; N=34] | CI重複（有意な変化なし） |
| B10 撤退率（到達run分母） | 44.1% [28.9, 60.5; N=34] | 44.1% [28.9, 60.5; N=34] | CI重複（有意な変化なし） |
| B20 生還率（全run分母） | 49.6% [45.2, 54.0; N=500] | 49.6% [45.2, 54.0; N=500] | CI重複（有意な変化なし） |
| B20 死亡率（全run分母） | 50.4% [46.0, 54.8; N=500] | 50.4% [46.0, 54.8; N=500] | CI重複（有意な変化なし） |

## 魔術師（Mage）

B5/B10 は `到達率=全run分母`、突破/死亡/撤退は `到達run分母`。B20 は生還/死亡とも全run分母。

| 指標 | before（配列順 find） | after（欠損量/cost/expected-waste） | 判定 |
| --- | --- | --- | --- |
| B5 到達率（全run分母） | 75.6% [71.6, 79.2; N=500] | 75.6% [71.6, 79.2; N=500] | CI重複（有意な変化なし） |
| B5 突破率（到達run分母） | 33.9% [29.3, 38.8; N=378] | 33.9% [29.3, 38.8; N=378] | CI重複（有意な変化なし） |
| B5 死亡率（到達run分母） | 32.0% [27.5, 36.9; N=378] | 32.0% [27.5, 36.9; N=378] | CI重複（有意な変化なし） |
| B5 撤退率（到達run分母） | 34.1% [29.5, 39.0; N=378] | 34.1% [29.5, 39.0; N=378] | CI重複（有意な変化なし） |
| B10 到達率（全run分母） | 18.8% [15.6, 22.5; N=500] | 18.8% [15.6, 22.5; N=500] | CI重複（有意な変化なし） |
| B10 突破率（到達run分母） | 83.0% [74.1, 89.2; N=94] | 83.0% [74.1, 89.2; N=94] | CI重複（有意な変化なし） |
| B10 死亡率（到達run分母） | 3.2% [1.1, 9.0; N=94] | 3.2% [1.1, 9.0; N=94] | CI重複（有意な変化なし） |
| B10 撤退率（到達run分母） | 13.8% [8.3, 22.2; N=94] | 13.8% [8.3, 22.2; N=94] | CI重複（有意な変化なし） |
| B20 生還率（全run分母） | 58.4% [54.0, 62.6; N=500] | 58.4% [54.0, 62.6; N=500] | CI重複（有意な変化なし） |
| B20 死亡率（全run分母） | 41.6% [37.4, 46.0; N=500] | 41.6% [37.4, 46.0; N=500] | CI重複（有意な変化なし） |

## 対応run・endpoint監査

- common keys: 2000/2000 before / 2000 after
- missing keys: 0; extra keys: 0
- Priest: 355/500 行一致、145 行差分
- Fighter: 500/500 行一致、0 行差分
- Thief: 500/500 行一致、0 行差分
- Mage: 500/500 行一致、0 行差分

## 再現コマンド

```sh
node --check scratch/sim_issue_594_selector_before_after.js
ISSUE594_SMOKE=1 node scratch/sim_issue_594_selector_before_after.js
node scratch/sim_issue_594_selector_before_after.js
```

このrunnerは測定時に `src/combat_logic/auto_action.js` の一時envゲートを必要とする。測定完了後はゲートを削除し、現行PR差分へ戻した。
シミュレーションは `generateRunFloor`、現行戦闘/報酬/装備更新、TOWN_PORTAL、状態異常治療、鑑定粉、現行departure kitを通す。任意商人行動・人間の敵別判断・MP/強化アイテムの能動使用は既存simの範囲どおりモデル外。
