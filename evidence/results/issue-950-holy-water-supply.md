# Issue #950: HOLY_WATER supply measurement

## 判定

実装・検証とも受入条件を満たす。`HOLY_WATER` は `CRAFT_RECIPES` から除去され、効果・宝箱供給・商人供給・状態異常治療のルールは変更していない。

## 実装

- `src/craft.js` の `HOLY_WATER` レシピだけを削除。
- `ITEM_EFFECTS.HOLY_WATER` は変更なし（HP 15 回復 + 毒解除）。`PANACEA` も変更なし。
- 出発クラフト表示・購入テストを更新し、未知レシピとして `HOLY_WATER` を購入できないことを固定。
- シミュレーションには、アイテム別初回枯渇床、取得元別取得数、取得拒否数を出力する測定専用カウンタだけを追加。

## 比較条件と provenance

baseline / after とも同一条件で canonical runner を実行した。

| 項目 | 値 |
| --- | --- |
| seed | `950` |
| 本試行 / calibration | `500` / `100` |
| 職業 | Fighter, Thief, Priest, Mage |
| scenarios | `workshop-empty`, `workshop-complete` |
| 主要方針 | `TRAP_POLICY=conservative`, `STATUS_CURE_POLICY=legacy`, `MERCHANT_POLICY=supply-missing` |
| gameplay baseline | `8f584352a5ea9cfec5f65ee200777d31cfd3f9df` |
| baseline source / runner | `1600f3311746b88a0117c8b73f1b4166d24bbc7b` |
| after source / runner | `41a8267e914959a60cdb13892b96f6dee4acc65d` |
| runner diff SHA-256 | `477a7295ad929472f655932c5888218294da9ed9364fabe85ce96be0d43b4c64` |
| working tree | 両方 clean、`origin/main` の祖先 |
| raw output | `/private/tmp/issue-950-baseline-final.out`, `/private/tmp/issue-950-after-final.out` |

full run は両方 exit 0。追加したカウンタを含むため、今回の paired run では source commit / runner commit 以外の条件を一致させた。

## 取得・消費の比較（target depth 20、各 500 run）

値は「1 run あたりの取得 / 消費」。baseline と after は全行で一致した。

| scenario | item | acquired | consumed | use total |
| --- | --- | ---:| ---:| ---:|
| workshop-empty | ANTIDOTE | 1.398 | 0.408 | 204 |
| workshop-empty | HOLY_WATER | 0.434 | 0.032 | 16 |
| workshop-empty | PANACEA | 0.328 | 0.054 | 27 |
| workshop-complete | ANTIDOTE | 1.432 | 0.430 | 215 |
| workshop-complete | HOLY_WATER | 0.698 | 0.040 | 20 |
| workshop-complete | PANACEA | 0.512 | 0.050 | 25 |

取得元の合計は次のとおり（`initial / departureCraft / chest / combat / merchant`）。

| scenario | ANTIDOTE | HOLY_WATER | PANACEA |
| --- | --- | --- | --- |
| workshop-empty | `0 / 500 / 196 / 11 / 3` | `0 / 0 / 217 / 18 / 0` | `0 / 0 / 164 / 16 / 0` |
| workshop-complete | `0 / 500 / 210 / 15 / 6` | `0 / 0 / 349 / 29 / 0` | `0 / 0 / 256 / 26 / 0` |

これにより、ANTIDOTE は出発クラフトと商人の役割を維持し、HOLY_WATER はクラフト・商人ではなく chest / combat 供給、PANACEA は従来どおり composite cure として chest / combat 供給であることを確認した。

## 枯渇・状態異常・容量

アイテム別の「取得後、inventory に残らなくなった最初の床」を集計した。`HOLY_WATER` の初回枯渇は empty で 12 run（floor 3: 3, 4: 6, 5: 2, 12: 1）、complete で 14 run（floor 3: 2, 4: 9, 5: 3）。ANTIDOTE は同条件で 140 / 148 run、PANACEA は 19 / 20 runだった。

dedicated status-cure supply の depletion は empty 59 run（floor 1: 17, 2: 19, 3: 9, 4: 10, 5: 4）、complete 62 run（floor 1: 25, 2: 19, 3: 6, 4: 10, 5: 2）。depletion 後の判断は empty が `unavailable=614, policy-deferred=215, selected=25`、complete が `unavailable=683, policy-deferred=258, selected=24, incapacitated=1` で、baseline / after 一致。

状態異常未治療数も一致した。

- `workshop-empty`: blind 2,291 / poisoned 551 / sleep 36
- `workshop-complete`: blind 2,321 / poisoned 667 / sleep 42

pickup rejection は empty が source `chest=208, combat=0, material=0`、category `item=188, equipment=20, material=0`、complete が source `chest=367, combat=0, material=0`、category `item=267, equipment=100, material=0`。商人購入の `inventory_full` 失敗は 0 件（観測された失敗は `WAKE_POWDER` の insufficient materials 1 件のみ）。最終 inventory の残数・overflow 自体はこの runner の aggregate 出力対象外のため、容量傾向は pickup rejection を proxy とした。

## 深度・死亡影響

`MP_SCARCITY_JSON` の各 target depth で、baseline / after の平均到達床と死亡率は完全一致した。

| scenario | B5 | B10 | B15 | B20 |
| --- | --- | --- | --- | --- |
| workshop-empty | `3.676 / 37.0%` | `3.768 / 52.8%` | `3.614 / 55.0%` | `3.698 / 54.4%` |
| workshop-complete | `4.270 / 23.2%` | `4.354 / 43.4%` | `4.480 / 37.0%` | `4.474 / 40.0%` |

各セルは「平均到達床 / death rate」。target depth 20 の全職業集計でも material EV、到達床、死亡・生存結果、最終集計値は baseline / after で一致した。

## 決定性・テスト

- baseline / after の `node --check` 成功。
- baseline / after の focused craft measurement 成功。共有クラフト規則で `HOLY_WATER` potential は baseline `1`、after `0`。
- `node scratch/tests/unit/test_departure_kit.js` 成功。
- `node scratch/tests/unit/test_departure_craft_display.js` 成功。
- `node scratch/tests/unit/test_status_model.js` 成功（12 pass）。
- `node scratch/tests/regression/test_mana_potion_measurement.js` 成功。
- `node scratch/tests/regression/test_sim_reward_paths.js` 成功。
- `node scratch/tests/regression/test_sim_follow_gate.js` 成功（31 sim files、canonical N=1 deterministic）。
- after の同一 seed N=1 smoke を 2 回実行し、出力 byte-for-byte 一致（SHA-256: `c4112d9a4b0652949c71e302795cd5038ecffb8b4d1c8b3f9969fe7ae6badc1e`）。

既存の game-design canon にこの issue 固有の供給数値を追加する必要はなく、状態異常 counterplay の既存方針と矛盾しないため canon ファイルは変更していない。
