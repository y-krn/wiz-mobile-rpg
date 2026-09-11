# #1198 B1F 継戦 resource cadence candidate

## 結論

B1F の通常宝箱だけで `HEAL_POTION` の重みを 1x から 2x にする候補を production に採用した。候補 item、slot、chest 数、回復量は変えず、combat-generated `fromDrop` 宝箱は変更していない。抽選は従来と同じ1回の RNG draw で行う。

同一条件の N=10,000 remeasure では、B2F arrival が 8.94% から 9.58%（+0.64pp）、E1生存 cohort の2戦目前 resource opportunity が 4.65% から 7.76%（+3.11pp）へ改善した。3x はさらに resource access を押し上げるが、2xで目的を満たすため最小候補として採用しない。

## 測定条件と provenance

- 対象: fresh `vanguard` / `fight` / `production` / B1F、持ち込み resource なし、targetDepth 2
- N=10,000 / case、seed=1198、Node `v26.8.1`
- runner: `issue1198-continuation-resource-v1` / schema 9
- source HEAD: `49d5a224e6da4dcd65cfb1ca0ea9897c7002578b`
- production gameplay/base: `210859dfddb168f682373011347d2eaa62b3f934` (`origin/main` の #1197 merge)
- measurement runner diff: `5c8de745d3d70d577e64ac0d3b32e174dd2fdd67f6511f3b6a62843af79dd97e`
- environment hash: `afedb4037c3ffa31`
- working tree: clean、同一 seed の N=1,000 再実行は report/summary とも完全一致

1x / 2x / 3x は `--chest-heal-potion-weight` の matched probe。probe は B1F の ordinary source にだけ適用し、既存 production map、敵、encounter pair、initiative、chest appearance、item chance、回復量を変更しない。

## Candidate comparison

| ordinary B1 HEAL_POTION weight | B1 death | B2 arrival | E1 cohort | 2nd encounter resource | 3rd encounter resource | meaningful reward | Build change |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1x baseline | 91.06% | 8.94% | 6,415 | 298/6,415 (4.65%, Wilson 4.16–5.19%) | 206/2,493 (8.26%, 7.25–9.41%) | 92.74% | 46.31% |
| 2x adopted | 90.42% | 9.58% | 6,444 | 500/6,444 (7.76%, 7.13–8.44%) | 341/2,533 (13.46%, 12.19–14.85%) | 92.74% | 46.03% |
| 3x sensitivity | 89.84% | 10.16% | 6,491 | 711/6,491 (10.95%, 10.22–11.74%) | 506/2,611 (19.38%, 17.91–20.94%) | 92.74% | 46.03% |

Resource opportunity の分母は直前 encounter を生存した cohort。target encounter に到達しなかった cohort member は `endedBeforeArrival` / `deathsBeforeArrival` に残す。Wilson 区間は95%区間。

## Adopted 2x resource funnel

| target | cohort / arrived | acquired | usable | beneficial | used | carried-unused | acquired units | actual HP recovered |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 2戦目前 | 6,444 / 4,954 | 500 | 499 | 499 | 322 | 141 | 533 | 4,059 |
| 3戦目前 | 2,533 / 1,661 | 341 | 340 | 340 | 277 | 48 | 377 | 3,685 |

`acquired` は accepted reward event、`usable` / `beneficial` は取得後の production eligibility、`used` は production auto-use の実使用、`carried-unused` は target entry inventory snapshot である。実際に取得された item はこの path では `HEAL_POTION` のみ。

Source split は2戦目前が ordinary 511 units / fromDrop 22 units、3戦目前が ordinary 349 / fromDrop 27 / secretRoom 1。したがって fromDrop source の変更は不要で、ordinary B1F の cadence 調整に限定した。

## Loot / Build と境界

- meaningful reward opportunity は baseline / adopted とも 92.74%。object loot の機会も同値。
- Build change は 46.31% → 46.03% と小幅低下。3xでも 46.03%で、resource候補の代わりに装備候補を削る変更ではない。
- first guaranteed chest の magic equipment、non-guaranteed chest の itemChance、chest count、HEAL_POTION の +15 HP、status cure、bag/object loot の役割は維持。
- starting potion injection、free recovery、+15 の変更、enemy stat/global pair-rate/initiative/target mix の変更はない。
- B2F floor outcome は補助指標のみ。#1173、#1184 A の cadence/combat candidate はこの変更に含めない。

## Fresh-save manual gate

Playwright headed browser で fresh local state を2回確認した。各回、鋼の前線キットを選び、B1Fへ持ち込み0で開始できた。1回目は実際に encounter を発生させ、攻撃対象選択、攻撃、敵からの被ダメージ、逃走、追撃ダメージ、1マス後退ログを確認した。2回目も fresh state から B1F 探索を再開し、前進・方向転換・探索操作を確認した。

2回目は、B1FでHP 20→8、毒針12ダメージと毒を受けた後、未鑑定のレザーアーマーと指輪を獲得・保持し、毒ダメージで死亡した。死亡画面には死因「毒のダメージ」、失った2点の戦果、象徴的な戦利品、図鑑に残る装備・状態異常・罠の知識が表示された。

形成された次回仮説は「HPが削られた状態で罠の推定を外して開けない。調査後に立ち去るか、解除・叩き壊すを選び、戦闘では早めに逃走する」である。実際にゲーム内には調べる、解除、開ける、叩き壊す、立ち去る、バッグ、攻撃、防御、道具、逃走が存在し、1回目には逃走と追撃・後退も実行できた。Loot / Build（未鑑定アーマー・指輪）、fight-flee、Cost（罠・毒・追撃）の未完了の期待が死亡前後に形成されたため、fresh-save manual gate は通過と判定する。

## Verification

- modified JS `node --check`: pass
- `SIM_SKIP_PROVENANCE=1 node tests/node/regression/test_starting_kit_diagnostic.js`: pass
- `node tests/node/unit/test_loot_supply.js`: pass
- `node tests/node/regression/test_sim_chest_smash_lethal.js`: pass
- weighted selector unit test verifies one RNG draw and invalid weight rejection
- raw JSON / manifest は commit せず `/tmp/issue-1198-final-v1*` に保存

再現例:

```sh
node scratch/measurements/starting_kit_diagnostic.js \
  --starting-kit vanguard \
  --policy fight \
  --recovery-policy production \
  --runs 10000 \
  --seed 1198 \
  --output /tmp/issue-1198-final-v2/report.json \
  --summary /tmp/issue-1198-final-v2/summary.md \
  --manifest /tmp/issue-1198-final-v2/manifest.json \
  --purpose issue-1198-production-remeasure-final-v2 \
  --ref issue/1198-resource-cadence
```
