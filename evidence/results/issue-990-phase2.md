# Issue #990 Phase 2 — partial-information progression

- runner: `issue990-partial-information-progression-v1` / schema `1`
- source commit: `e79a8f8b1379b0e4be0820aaec5af0992c6eb8ec`
- main baseline SHA: `f235c6c6405da6b3f09a1dc01f1451173b8165e4`
- seed: `issue990-phase2-2026-08-30`; N: **500 / build / arm**
- mode: production-backed, deterministic, partial-information, forced-push, simplified equipment policy

これは actual player run ではない。production-backed な map / movement / search / encounter / combat / loot を使い、未知情報を使わない決定的探索と、即時の貪欲装備更新を比較する測定である。oracle は比較用に独立したまま残した。

## 到達率（build × route / equipment arm）

| build | arm | B5 | B10 | B15 | B20 | B21 | B25 | B30 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| aoe-burst | oracle-fixed | 45.20% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% |
| single-efficient | oracle-fixed | 61.20% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% |
| sustain | oracle-fixed | 82.80% | 0.60% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% |
| hybrid-fallback | oracle-fixed | 67.80% | 1.80% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% |
| aoe-burst | partial-info-fixed | 5.00% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% |
| single-efficient | partial-info-fixed | 13.00% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% |
| sustain | partial-info-fixed | 21.00% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% |
| hybrid-fallback | partial-info-fixed | 78.00% | 0.60% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% |
| aoe-burst | partial-info-equipment-update | 22.40% | 1.60% | 0.20% | 0.00% | 0.00% | 0.00% | 0.00% |
| single-efficient | partial-info-equipment-update | 34.20% | 2.60% | 0.20% | 0.00% | 0.00% | 0.00% | 0.00% |
| sustain | partial-info-equipment-update | 43.20% | 5.00% | 0.60% | 0.00% | 0.00% | 0.00% | 0.00% |
| hybrid-fallback | partial-info-equipment-update | 54.20% | 4.80% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% |

## 探索負荷・oracle差

| build | oracle steps/floor | partial steps/floor | extra encounters | partial explored ratio | search actions |
| --- | ---: | ---: | ---: | ---: | ---: |
| aoe-burst | 100.87 | 109.52 | 8.57 | 35.02% | 6.39 |
| single-efficient | 110.07 | 114.41 | 9.95 | 36.59% | 7.43 |
| sustain | 125.02 | 121.55 | 10.23 | 37.97% | 8.79 |
| hybrid-fallback | 116.24 | 138.39 | 26.10 | 45.02% | 13.39 |

## 死因・通常攻撃曝露

| arm | build | pure raw | mechanic-mediated | direct mechanic | unknown/mixed | normal hit | hits | total normal damage | enemy actions | rounds |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| oracle-fixed | aoe-burst | 209 | 147 | 112 | 32 | 2.09 | 24.86 | 44.85 | 42.60 | 25.35 |
| oracle-fixed | single-efficient | 172 | 180 | 103 | 45 | 2.36 | 26.02 | 55.69 | 46.86 | 28.52 |
| oracle-fixed | sustain | 167 | 230 | 68 | 35 | 2.93 | 39.19 | 107.84 | 68.32 | 42.22 |
| oracle-fixed | hybrid-fallback | 357 | 0 | 106 | 37 | 2.17 | 26.68 | 58.80 | 51.74 | 32.27 |
| partial-info-fixed | aoe-burst | 267 | 161 | 68 | 4 | 1.89 | 39.33 | 64.41 | 69.26 | 42.67 |
| partial-info-fixed | single-efficient | 231 | 190 | 68 | 11 | 2.08 | 45.92 | 86.90 | 81.66 | 50.18 |
| partial-info-fixed | sustain | 318 | 85 | 73 | 24 | 2.25 | 60.62 | 130.83 | 104.36 | 63.38 |
| partial-info-fixed | hybrid-fallback | 389 | 0 | 48 | 63 | 1.88 | 69.45 | 129.43 | 147.63 | 89.04 |
| partial-info-equipment-update | aoe-burst | 269 | 126 | 88 | 15 | 1.89 | 64.26 | 107.38 | 108.87 | 68.71 |
| partial-info-equipment-update | single-efficient | 266 | 118 | 90 | 26 | 1.92 | 78.14 | 131.34 | 129.07 | 81.70 |
| partial-info-equipment-update | sustain | 296 | 88 | 74 | 40 | 1.90 | 108.50 | 196.77 | 170.75 | 107.21 |
| partial-info-equipment-update | hybrid-fallback | 291 | 97 | 59 | 52 | 1.76 | 89.15 | 152.85 | 159.40 | 100.38 |

## 装備更新

P0 は固定装備、P1 は production drop を見た直後にだけ deterministic greedy scorer を実行する。未知装備は powder policy のまま保持し、未来の敵を見て選ばない。

| build | drops seen | equipped | rejected | score before | score after | build score Δ | core changes | support changes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| aoe-burst | 10116 | 1137 | 8979 | 52.75 | 67.49 | 10.74 | CORE_KEEN_EYE, CORE_SNEAK_STEP, CORE_CURSE_KEEPER, CORE_PURIFY_RING, CORE_CAMP_MASTER, CORE_EXECUTIONER, CORE_LAST_STAND, CORE_BOUNTY_HUNTER, CORE_PHYSICAL_ACCURACY | int, spellPower, arcane, str, followUpMp, vit, def, pie, atk, stairsHeal, trapBonus, identifyDiscount, contractReward, agi, traceRead, firstTurnAttack, luk, antiDemon, arcaneSense, antiDragon, hitFlinch, hearRange, rearEvasion, mp, antiSpirit, materialFind, hp, frontGuard, fullHpDamage, deepAssault, antiBeast, poisonWard, victoryMaterial, statusResistance, spellGuard, poisonAtk, firstStrikeDefense, followUp, treasureSense, spellAccuracy |
| single-efficient | 11679 | 1131 | 10548 | 52.29 | 68.97 | 12.11 | CORE_GIANT_SLAYER, CORE_LAST_STAND, CORE_SNEAK_STEP, CORE_KEEN_EYE, CORE_CAMP_MASTER, CORE_PURIFY_RING, CORE_BOUNTY_HUNTER, CORE_EXECUTIONER, CORE_CURSE_KEEPER, CORE_PHYSICAL_ACCURACY | spellPower, arcane, atk, agi, contractReward, str, def, int, spellGuard, vit, identifyDiscount, victoryMaterial, antiUndead, traceRead, mp, antiBeast, materialFind, antiDragon, hp, stairsHeal, frontGuard, luk, deepAssault, arcaneSense, statusResistance, pie, antiDemon, rearEvasion, lastSurvivorStats, fullHpDamage, trapBonus, treasureSense, antiSpirit, poisonWard, followUpMp, hearRange, firstStrikeDefense, firstTurnAttack |
| sustain | 14069 | 1259 | 12810 | 60.86 | 77.82 | 11.52 | CORE_SNEAK_STEP, CORE_PURIFY_RING, CORE_EXECUTIONER, CORE_CAMP_MASTER, CORE_CURSE_KEEPER, CORE_KEEN_EYE, CORE_PHYSICAL_ACCURACY, CORE_BOUNTY_HUNTER, CORE_LAST_STAND | hp, statusResistance, spellPower, atk, luk, arcaneSense, contractReward, str, def, materialFind, spellGuard, int, mp, pie, agi, trapBonus, firstStrikeDefense, arcane, firstTurnAttack, victoryMaterial, antiDemon, antiSpirit, vit, deepAssault, rearEvasion, traceRead, antiBeast, poisonAtk, frontGuard, lastSurvivorStats, hitFlinch, identifyDiscount, fullHpDamage, stairsHeal, followUp, antiUndead, spellAccuracy, hearRange |
| hybrid-fallback | 15319 | 1596 | 13723 | 52.00 | 73.02 | 15.25 | CORE_BLOOD_WAND, CORE_LAST_STAND, CORE_SNEAK_STEP, CORE_PHYSICAL_ACCURACY, CORE_CURSE_KEEPER, CORE_EXECUTIONER, CORE_CAMP_MASTER, CORE_PURIFY_RING, CORE_BOUNTY_HUNTER, CORE_KEEN_EYE | spellGuard, statusResistance, materialFind, str, atk, luk, agi, treasureSense, stairsHeal, deepAssault, def, mp, lastSurvivorStats, contractReward, hearRange, hp, firstStrikeDefense, traceRead, spellAccuracy, arcaneSense, identifyDiscount, arcane, pie, bleedingAtk, fullHpDamage, vit, rearEvasion, antiBeast, int, spellPower, frontGuard, poisonWard, victoryMaterial, hitFlinch, antiSpirit, firstTurnAttack, trapBonus, antiDemon, killHeal, followUpMp |

## matched comparison / Build Confidence

- common-support: partial-information same worldSeed; strict reversal は #975 互換の paired outcome + diagnostic utility bootstrap 95% CI。N<30 は `insufficient_sample`。
- strict reversal count: **0**; insufficient count: **8**

| build pair | paired N | status | outcome CI | utility CI | same encounter identities |
| --- | ---: | --- | --- | --- | ---: |
| aoe-burst vs single-efficient | 454 | eligible | [0.00, 0.00] | [-0.01, 0.00] | 454 |
| aoe-burst vs single-efficient | 15 | insufficient_sample | [0.00, 0.00] | [-0.01, 0.00] | 15 |
| aoe-burst vs single-efficient | 15 | insufficient_sample | [0.00, 0.00] | [-0.01, 0.00] | 15 |
| aoe-burst vs sustain | 449 | eligible | [0.00, 0.00] | [-0.03, -0.02] | 449 |
| aoe-burst vs sustain | 11 | insufficient_sample | [0.00, 0.00] | [-0.03, -0.02] | 11 |
| aoe-burst vs sustain | 11 | insufficient_sample | [0.00, 0.00] | [-0.03, -0.02] | 11 |
| aoe-burst vs hybrid-fallback | 433 | eligible | [0.00, 0.00] | [-0.03, -0.02] | 433 |
| aoe-burst vs hybrid-fallback | 6 | insufficient_sample | [0.00, 0.00] | [-0.03, -0.02] | 6 |
| aoe-burst vs hybrid-fallback | 6 | insufficient_sample | [0.00, 0.00] | [-0.03, -0.01] | 6 |
| single-efficient vs sustain | 465 | eligible | [0.00, 0.00] | [-0.03, -0.02] | 465 |
| single-efficient vs sustain | 43 | eligible | [0.00, 0.00] | [-0.03, -0.02] | 43 |
| single-efficient vs sustain | 43 | eligible | [0.00, 0.00] | [-0.03, -0.02] | 43 |
| single-efficient vs hybrid-fallback | 437 | eligible | [0.00, 0.00] | [-0.03, -0.02] | 437 |
| single-efficient vs hybrid-fallback | 18 | insufficient_sample | [0.00, 0.00] | [-0.03, -0.02] | 18 |
| single-efficient vs hybrid-fallback | 18 | insufficient_sample | [0.00, 0.00] | [-0.02, -0.01] | 18 |
| sustain vs hybrid-fallback | 437 | eligible | [0.00, 0.00] | [-0.01, 0.00] | 437 |
| sustain vs hybrid-fallback | 35 | eligible | [0.00, 0.00] | [-0.01, 0.00] | 35 |
| sustain vs hybrid-fallback | 35 | eligible | [0.00, 0.00] | [-0.00, 0.01] | 35 |

## #990 の質問への回答

1. oracle と partial の歩数・遭遇数差は上の探索負荷表に build 別で記録した。
2. 未知情報を使わない partial arm の到達率は到達率表の比較対象である。
3. fixed と equipment-update の差は同表の P0/P1 で分離した。
4. B21+ population: 未成立（このmodelでは未観測）。
5. B21+ pure raw 増加は arm 別 death category から判定する。
6. pure raw は単発 hit と累積 exposure（hits / total damage / enemy actions）の両方を出し、累積要因を検証可能にした。
7. 探索追加遭遇は movement と search action を分離記録した。
8. matched comparison の strict reversal は **0**。勝率だけでは reversal と呼ばない。
9. 1 build の一方的支配はこの表の到達率と paired comparison で確認する。
10. #973 Build Confidence: **Revise**（Phase 2 の partial-information / in-run growth を追加したが、retreat と B21+成立性は未検証）。
11. #990: **現時点では閉じない**。モデル限界と B21+ population の成立性を明示したため、追加検証余地が残る。
12. production tuning: **進まない**。本測定は balance constant を変更していない。

## 再現

```sh
node scratch/measurements/issue990_partial_information_progression.js --runs 500 --seed issue990-phase2-2026-08-30 --output evidence/results/issue-990-phase2.json --summary evidence/results/issue-990-phase2.md
```
