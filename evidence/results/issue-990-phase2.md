# Issue #990 Phase 2 — partial-information progression

- runner: `issue990-partial-information-progression-v2` / schema `2`
- source commit: `eac0ef257f21be3797b8bbac1399673fe3080750`
- main baseline SHA: `f235c6c6405da6b3f09a1dc01f1451173b8165e4`
- seed: `issue990-phase2-2026-08-30`; N: **500 / build / arm**
- mode: production-backed, deterministic, partial-information, forced-push, simplified equipment policy

これは actual player run ではない。production-backed な map / movement / search / encounter / combat / loot を使い、未知情報を使わない決定的探索と、即時の貪欲装備更新を比較する測定である。oracle は比較用に独立したまま残した。

## 到達率（build × route / equipment arm）

| build | arm | B5 | B10 | B15 | B20 | B21 | B25 | B30 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| aoe-burst | oracle-fixed | 51.80% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% |
| single-efficient | oracle-fixed | 65.80% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% |
| sustain | oracle-fixed | 97.60% | 1.60% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% |
| hybrid-fallback | oracle-fixed | 68.80% | 2.40% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% |
| aoe-burst | partial-info-fixed | 7.40% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% |
| single-efficient | partial-info-fixed | 19.00% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% |
| sustain | partial-info-fixed | 26.00% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% |
| hybrid-fallback | partial-info-fixed | 81.80% | 0.80% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% |
| aoe-burst | partial-info-equipment-update | 28.40% | 2.40% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% |
| single-efficient | partial-info-equipment-update | 36.00% | 2.40% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% |
| sustain | partial-info-equipment-update | 51.00% | 3.40% | 0.40% | 0.00% | 0.00% | 0.00% | 0.00% |
| hybrid-fallback | partial-info-equipment-update | 56.40% | 2.60% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% |

## 探索負荷・oracle差

| build | oracle steps/floor | partial steps/floor | extra encounters/floor | partial explored ratio | search actions |
| --- | ---: | ---: | ---: | ---: | ---: |
| aoe-burst | 103.05 | 110.47 | 4.36 | 35.47% | 0.00 |
| single-efficient | 111.92 | 116.04 | 4.45 | 37.39% | 0.00 |
| sustain | 141.55 | 125.44 | 4.45 | 38.88% | 0.00 |
| hybrid-fallback | 116.76 | 137.92 | 5.29 | 44.97% | 0.00 |

## 死因・通常攻撃曝露

| arm | build | pure raw | mechanic-mediated | direct mechanic | unknown/mixed | normal hit | hits | total normal damage | enemy actions | rounds |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| oracle-fixed | aoe-burst | 212 | 17 | 182 | 89 | 2.13 | 24.59 | 45.86 | 44.17 | 26.45 |
| oracle-fixed | single-efficient | 201 | 26 | 164 | 109 | 2.40 | 26.27 | 57.70 | 48.52 | 29.62 |
| oracle-fixed | sustain | 168 | 43 | 86 | 201 | 2.99 | 45.31 | 129.15 | 80.64 | 50.34 |
| oracle-fixed | hybrid-fallback | 331 | 9 | 160 | 0 | 2.19 | 26.54 | 59.15 | 51.97 | 32.44 |
| partial-info-fixed | aoe-burst | 277 | 0 | 79 | 144 | 1.89 | 41.83 | 67.42 | 74.42 | 45.53 |
| partial-info-fixed | single-efficient | 251 | 0 | 79 | 170 | 2.10 | 49.20 | 93.52 | 88.95 | 54.33 |
| partial-info-fixed | sustain | 321 | 3 | 87 | 89 | 2.20 | 63.02 | 136.03 | 110.30 | 66.73 |
| partial-info-fixed | hybrid-fallback | 356 | 5 | 138 | 0 | 1.87 | 69.13 | 129.06 | 147.21 | 88.82 |
| partial-info-equipment-update | aoe-burst | 285 | 10 | 110 | 92 | 1.93 | 69.70 | 116.32 | 118.51 | 74.39 |
| partial-info-equipment-update | single-efficient | 282 | 9 | 118 | 90 | 1.95 | 78.04 | 135.05 | 130.63 | 82.55 |
| partial-info-equipment-update | sustain | 271 | 10 | 129 | 88 | 1.83 | 102.83 | 186.67 | 167.52 | 104.76 |
| partial-info-equipment-update | hybrid-fallback | 280 | 19 | 136 | 61 | 1.77 | 83.54 | 146.54 | 152.36 | 95.51 |

## 装備更新

P0 は固定装備、P1 は production drop を見た直後にだけ deterministic greedy scorer を実行する。未知装備は powder policy のまま保持し、未来の敵を見て選ばない。

| build | drops seen | equipped | rejected | score before | score after | build score Δ | core changes | support changes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| aoe-burst | 11015 | 1206 | 9809 | 52.75 | 69.62 | 12.71 | CORE_SNEAK_STEP, CORE_CURSE_KEEPER, CORE_KEEN_EYE, CORE_CAMP_MASTER, CORE_PURIFY_RING, CORE_EXECUTIONER, CORE_BOUNTY_HUNTER, CORE_PHYSICAL_ACCURACY, CORE_LAST_STAND | spellPower, arcane, agi, str, atk, int, mp, stairsHeal, luk, vit, hp, def, firstTurnAttack, contractReward, pie, antiBeast, trapBonus, arcaneSense, traceRead, antiSpirit, hearRange, identifyDiscount, spellGuard, poisonWard, deepAssault, frontGuard, victoryMaterial, lastSurvivorStats, treasureSense, statusResistance, rearEvasion, antiDemon, antiDragon, fullHpDamage, materialFind, followUpMp, antiUndead |
| single-efficient | 11892 | 1165 | 10727 | 52.29 | 69.40 | 12.13 | CORE_CURSE_KEEPER, CORE_GIANT_SLAYER, CORE_EXECUTIONER, CORE_CAMP_MASTER, CORE_PURIFY_RING, CORE_SNEAK_STEP, CORE_KEEN_EYE, CORE_BOUNTY_HUNTER, CORE_LAST_STAND, CORE_PHYSICAL_ACCURACY | spellPower, arcane, spellGuard, pie, materialFind, agi, int, def, vit, str, hp, luk, stairsHeal, identifyDiscount, arcaneSense, mp, treasureSense, traceRead, frontGuard, statusResistance, fullHpDamage, contractReward, firstStrikeDefense, rearEvasion, deepAssault, trapBonus, lastSurvivorStats, antiDemon, antiDragon, victoryMaterial, atk, antiSpirit, antiBeast, hearRange, followUpMp, killHeal, firstTurnAttack, spellAccuracy, poisonWard |
| sustain | 14129 | 1277 | 12852 | 60.86 | 79.21 | 12.76 | CORE_SNEAK_STEP, CORE_CAMP_MASTER, CORE_PURIFY_RING, CORE_CURSE_KEEPER, CORE_EXECUTIONER, CORE_KEEN_EYE, CORE_BOUNTY_HUNTER, CORE_LAST_STAND, CORE_PHYSICAL_ACCURACY | hp, statusResistance, spellPower, materialFind, def, spellGuard, agi, atk, str, int, vit, pie, trapBonus, luk, identifyDiscount, rearEvasion, fullHpDamage, firstTurnAttack, lastSurvivorStats, stairsHeal, mp, frontGuard, antiBeast, traceRead, firstStrikeDefense, antiSpirit, antiDemon, deepAssault, victoryMaterial, contractReward, arcane, arcaneSense, hearRange, hitFlinch, followUpMp, poisonWard |
| hybrid-fallback | 14821 | 1553 | 13268 | 52.00 | 72.86 | 15.17 | CORE_BLOOD_WAND, CORE_LAST_STAND, CORE_SNEAK_STEP, CORE_BOUNTY_HUNTER, CORE_CURSE_KEEPER, CORE_EXECUTIONER, CORE_CAMP_MASTER, CORE_PHYSICAL_ACCURACY, CORE_KEEN_EYE, CORE_PURIFY_RING | spellGuard, statusResistance, mp, materialFind, str, def, contractReward, pie, stairsHeal, luk, deepAssault, frontGuard, hp, identifyDiscount, killHeal, agi, arcane, vit, bleedingAtk, int, lastSurvivorStats, arcaneSense, atk, fullHpDamage, rearEvasion, hitFlinch, trapBonus, antiDragon, antiSpirit, firstStrikeDefense, followUp, firstTurnAttack, antiDemon, followUpMp, antiBeast, hearRange, traceRead, spellPower, victoryMaterial, poisonWard, treasureSense, antiUndead |

| build | partial P0 mean reached depth | partial P1 mean reached depth | P1 − P0 |
| --- | ---: | ---: | ---: |
| aoe-burst | 2.98 | 3.61 | 0.63 |
| single-efficient | 3.39 | 3.92 | 0.53 |
| sustain | 3.82 | 4.50 | 0.68 |
| hybrid-fallback | 4.77 | 4.47 | -0.30 |

Hybrid の P1 悪化は、starting build の production-shaped 変換（主要 stat / spells / core / support）と装備後の stat 更新を regression で確認したうえで、再現する測定結果である。P1 の scorer は現在の候補だけを greedy 評価し、未来の敵情報を参照しないため、これは policy が Hybrid に不利な候補を即時装備する場合があることを示す。修正で有利になるよう調整はしていない。

## matched comparison / Build Confidence

- common-support: partial-information fixed arm の同一 worldSeed・floor・eventKey・enemy composition。strict reversal は #975 互換の encounter-level paired outcome + diagnostic utility bootstrap 95% CI。N<30 は `insufficient_sample`。
- death classification: #983 の exclusive contract を再利用し、mechanic-mediated は観測された state degradation evidence が1種類だけある場合に限定。mechanic発火だけでは昇格しない。
- mean reached depth は代理到達率ではなく、各 raw row の `reachedDepth` の算術平均。encounters/floor は各 run の `encounters / max(1, reachedDepth)` の平均。
- strict reversal count: **0**; insufficient count: **8**

| build pair / family | matched event N | status | outcome CI | utility CI |
| --- | ---: | --- | --- | --- |
| aoe-burst vs single-efficient / formation vs single-target | 1303 | eligible | [0.00, 0.02] | [0.02, 0.04] |
| aoe-burst vs single-efficient / formation vs swarm | 22 | insufficient_sample | [0.00, 0.02] | [0.02, 0.04] |
| aoe-burst vs single-efficient / single-target vs swarm | 22 | insufficient_sample | [-0.00, 0.00] | [0.00, 0.01] |
| aoe-burst vs sustain / formation vs single-target | 1067 | eligible | [0.01, 0.03] | [0.05, 0.07] |
| aoe-burst vs sustain / formation vs swarm | 14 | insufficient_sample | [0.01, 0.03] | [0.05, 0.07] |
| aoe-burst vs sustain / single-target vs swarm | 14 | insufficient_sample | [0.00, 0.01] | [0.01, 0.02] |
| aoe-burst vs hybrid-fallback / formation vs single-target | 701 | eligible | [0.01, 0.03] | [0.03, 0.06] |
| aoe-burst vs hybrid-fallback / formation vs swarm | 4 | insufficient_sample | [0.01, 0.03] | [0.03, 0.06] |
| aoe-burst vs hybrid-fallback / single-target vs swarm | 4 | insufficient_sample | [-0.00, 0.01] | [0.00, 0.01] |
| single-efficient vs sustain / formation vs single-target | 2418 | eligible | [0.00, 0.01] | [0.02, 0.03] |
| single-efficient vs sustain / formation vs swarm | 55 | eligible | [0.00, 0.01] | [0.02, 0.03] |
| single-efficient vs sustain / single-target vs swarm | 55 | eligible | [0.00, 0.00] | [0.01, 0.02] |
| single-efficient vs hybrid-fallback / formation vs single-target | 1165 | eligible | [0.01, 0.02] | [0.01, 0.02] |
| single-efficient vs hybrid-fallback / formation vs swarm | 14 | insufficient_sample | [0.01, 0.02] | [0.01, 0.02] |
| single-efficient vs hybrid-fallback / single-target vs swarm | 14 | insufficient_sample | [0.00, 0.01] | [0.00, 0.01] |
| sustain vs hybrid-fallback / formation vs single-target | 1862 | eligible | [-0.00, 0.00] | [-0.02, -0.01] |
| sustain vs hybrid-fallback / formation vs swarm | 36 | eligible | [-0.00, 0.00] | [-0.02, -0.01] |
| sustain vs hybrid-fallback / single-target vs swarm | 36 | eligible | [-0.00, 0.00] | [-0.01, -0.01] |

## #990 の質問への回答

1. oracle と partial の歩数・遭遇数差は上の探索負荷表に build 別で記録した。
2. 未知情報を使わない partial arm の到達率は到達率表の比較対象である。
3. fixed と equipment-update の差は同表の P0/P1 で分離した。
4. B21+ population: 未成立（このmodelでは未観測）。未成立なら B21+ pure raw 増加も判定不能。
5. B21+ pure raw 増加は未観測時は判定不能、観測範囲では death category と累積曝露を分けて記録した。
6. pure raw は単発 hit と累積 exposure（hits / total damage / enemy actions）の両方を出し、累積要因を検証可能にした。
7. 探索追加遭遇は movement と search action を分離記録した。
8. この encounter-level matched sample で #975 strict reversal を満たした比較は **0**。0でも得意不得意の不存在は意味せず、N不足は insufficient とした。
9. 1 build の一方的支配は到達率と paired comparison の両方で確認する。深層到達率は survivor bias を含むため単独では支配と解釈しない。
10. #973 Build Confidence: **Revise**（Phase 2 の partial-information / in-run growth を追加したが、retreat と B21+成立性は未検証）。
11. #990: **現時点では閉じない**。モデル限界と B21+ population の成立性を明示したため、追加検証余地が残る。
12. production tuning: **進まない**。本測定は balance constant を変更していない。

## 再現

```sh
node scratch/measurements/issue990_partial_information_progression.js --runs 500 --seed issue990-phase2-2026-08-30 --output evidence/results/issue-990-phase2.json --summary evidence/results/issue-990-phase2.md
```
