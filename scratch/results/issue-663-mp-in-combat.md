# Issue #663 MP in combat measurement

## Scope and provenance

- Measurement only. Game rules, MP costs, maximum MP, recovery values, craft values, and sim behavior were not changed.
- Base: `origin/main` = `7f4a8d7a189f9ffff960b2b4d6c9040580edc28a` (the current base after #654/#670).
- Instrumentation commit used for the long run: `473acfe8296d02eb45c4ee30a66a57d98db7ae2e`.
- `originMainAncestor=true`; `SIM_PARALLEL` was unset.
- `scratch/sim_depth_material_ev.js` routes spell payment through the source `getSpellPayment` and existing `getSpellActionPayment`; it does not reimplement the payment formula or draw random numbers.

The ordinary depth output was read from `policy=powder`, `targetDepth=B20`, explicitly selecting the `workshop-empty` and `workshop-stats` B20 rows. The floor trend below is from each row's `combatMp.byFloor`, not the first matching output line.

## Baseline acceptance

The exact #624 fixed-environment compatibility run was performed with `scratch/sim_commit_depth_624.js`, which calls the instrumented `simulateRun` from `scratch/sim_depth_material_ev.js`:

```text
env -u SIM_PARALLEL SIM_SEED=231 SIM_RUNS=500 SIM_CALIBRATION_RUNS=100 \
  SIM_INDEPENDENT_RUN_RANDOM=1 \
  DEPARTURE_CRAFT_IDS=TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION \
  TRAP_POLICY=conservative TRAP_AVOIDANCE_POLICY=ev STATUS_CURE_POLICY=smart \
  STATUS_CURE_HP_THRESHOLD=0.35 FLEE_POLICY=ev HEAL_POTION_THRESHOLD=0.55 \
  SIM_EXPLORATION_FACTOR=1.4 SIM_EQUIPMENT_POLICY=individual-score \
  SIM_MATCHING_DEFINITION=exact SIM_CURSE_LOCK_MODE=current \
  SIM_SUPPORT_SUPPLY_CEILING=none SIM_CORE_SCORE_DROP_TOLERANCE=0 \
  SIM_MAP_STATS=0 SIM_DAMAGE_PROBE=0 node scratch/sim_commit_depth_624.js
```

| Class | Expected average reached floor | Observed | Difference |
| --- | ---: | ---: | ---: |
| Fighter | 5.8720 | 5.8720 | 0.0000 |
| Thief | 4.8980 | 4.8980 | 0.0000 |
| Priest | 4.5760 | 4.5760 | 0.0000 |
| Mage | 6.4800 | 6.4800 | 0.0000 |

The instrumentation-only run therefore exactly matches the required baseline. No RNG-consumption or behavior change was detected.

Raw stdout SHA-256:

- `sim_depth_material_ev.js` run 1: `d03852948c87d011f2d36ba271c7283c708f481d53bafb0cb6284ba78453a076`
- `sim_depth_material_ev.js` run 2: `d03852948c87d011f2d36ba271c7283c708f481d53bafb0cb6284ba78453a076`
- fixed-environment compatibility JSON: `b0d38856a89e1a1e5e2b06dfc2bf3305f56e914205a32f5c4ef7b7a06a8149ac`

## Combat MP results

Counts in the action and cost columns are `mpBlocked` events. MP values are absolute MP; the JSON output also contains max-MP-normalized distributions.

| Scenario / class (`targetDepth=B20`) | Encounters | Blocked combats / events | Start MP p25 / median / p75 | Minimum MP p25 / median / p75 | Combat rounds mean / median / p90 / max | Blocked round mean / median / p90 / max | Inter-combat recovery median | Recovery amount: camp / 魔力草 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| workshop-empty / Priest | 682 | 60 / 204 | 4 / 10 / 13 | 3 / 10 / 12 | 2.195 / 2 / 4 / 12 | 3.480 / 3 / 7 / 11 | 0 | 17 / 75 |
| workshop-empty / Mage | 812 | 51 / 178 | 12 / 12 / 12 | 12 / 12 / 12 | 1.344 / 1 / 2 / 11 | 3.348 / 3 / 6 / 11 | 0 | 73 / 6 |
| workshop-stats / Priest | 733 | 89 / 238 | 2 / 9 / 13 | 1 / 8 / 12 | 2.195 / 2 / 4 / 14 | 3.227 / 3 / 6 / 14 | 0 | 18 / 48 |
| workshop-stats / Mage | 854 | 85 / 286 | 12 / 12 / 12 | 12 / 12 / 12 | 1.463 / 1 / 3 / 11 | 3.360 / 3 / 6 / 11 | 0 | 147 / 3 |

### Blocked action and cost breakdown

| Scenario / class | Recovery | Offense | Support | Cost 1 | Cost 2 | Cost 3 | Cost 4 | Cost 6 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| workshop-empty / Priest | 106 | 98 | 0 | 98 | 0 | 106 | 0 | 0 |
| workshop-empty / Mage | 0 | 121 | 57 | 29 | 14 | 111 | 22 | 2 |
| workshop-stats / Priest | 134 | 104 | 0 | 104 | 0 | 134 | 0 | 0 |
| workshop-stats / Mage | 0 | 187 | 99 | 34 | 29 | 185 | 26 | 12 |

For the B20 `workshop-empty` row cited above, the Priest's 204 blocked events are recovery 106 and offense 98, while the Mage's 178 are offense 121 and support 57. Thus the previously mixed Priest total is not a single spell category. For both classes, blocked events are concentrated in cost 3 (Priest: 106; Mage: 111), with the Mage also showing costs 1, 2, 4, and 6.

The general combat-length distribution is short: in `workshop-empty` B20 the Priest has median 2 rounds (p90 4), and the Mage median 1 (p90 2). Blocked events occur later within those encounters (median round 3), but deep-floor starts are also low; this is not a “full at every encounter, depleted only by unusually long combat” pattern.

### Start MP trend by actual floor

These cells are from the `targetDepth=B20` rows and have intentionally been left with their sample counts so small deep-floor cells are not overinterpreted.

| Scenario / class | Floor | Encounters | Start MP median | Minimum MP median | Blocked combats / encounters |
| --- | ---: | ---: | ---: | ---: | ---: |
| workshop-empty / Priest | B1 | 317 | 13 | 12 | 1 / 317 |
| workshop-empty / Priest | B5 | 25 | 1 | 0 | 7 / 25 |
| workshop-empty / Priest | B10 | 2 | 0 | 0 | 1 / 2 |
| workshop-empty / Mage | B1 | 383 | 12 | 12 | 0 / 383 |
| workshop-empty / Mage | B5 | 36 | 10 | 7 | 9 / 36 |
| workshop-empty / Mage | B10 | 23 | 1 | 0 | 10 / 23 |
| workshop-empty / Mage | B15 | 9 | 0 | 0 | 3 / 9 |
| workshop-stats / Priest | B1 | 323 | 13 | 12 | 3 / 323 |
| workshop-stats / Priest | B5 | 53 | 0 | 0 | 22 / 53 |
| workshop-stats / Priest | B10 | 5 | 1 | 1 | 1 / 5 |
| workshop-stats / Mage | B1 | 387 | 12 | 12 | 0 / 387 |
| workshop-stats / Mage | B5 | 44 | 5 | 4 | 13 / 44 |
| workshop-stats / Mage | B10 | 31 | 1 | 0 | 22 / 31 |
| workshop-stats / Mage | B15 | 14 | 2 | 1 | 5 / 14 |

The large B1-to-deeper-floor drop and median zero/one MP on several deep-floor cells establish a run-level depletion pattern. Inter-combat recovery has median zero in the B20 aggregates; the recorded recovery totals are sparse and do not restore every encounter to full.

## Mage candidate-check diagnosis

The historical “134 candidate checks” is not evidence of an intrinsic Mage spell property. The diagnostic calls the existing simulation selector with `canCastSpell: () => true` and separately records the actual action chosen by the sim:

| B20 row | Candidate checks | Probe rounds | Probe spell preferred / fight preferred | Actual fight / spell / item / run | Unknown / unsupported / selector-fight-with-known-spell |
| --- | ---: | ---: | ---: | --- | --- |
| workshop-empty / Mage | 424 | 1,091 | 1,091 / 0 | 81 / 343 / 7 / 660 | 0 / 0 / 0 |
| workshop-stats / Mage | 594 | 1,249 | 1,249 / 0 | 124 / 470 / 15 / 640 | 0 / 0 / 0 |

In both rows, candidate checks equal actual `fight + spell` turns; `item` and `run` turns are excluded by the pressure measurement gate. The selector probe prefers a spell on every diagnostic round, with no missing-target, unknown-spell, unsupported-spell, or fixed-threshold normal-attack case. The candidate count is therefore a sim-policy/measurement-denominator artifact, not a Mage conclusion. The `workshop-stats` 286 blocked events versus `workshop-empty` 178 must likewise be read under the selected sim policy, not as a direct game-rule property.

## 魔力草の戦闘内使用

魔力草はゲーム本体では戦闘中に使える。`MANA_POTION` は `usable` で `campOnly` ではなく、combat item selection と item resolution を通り、術者クラスなら `ITEM_EFFECTS.MANA_POTION` が MP を回復する。一方、現在の深度 sim の `useManaPotionIfNeeded` は戦闘終了後の回復処理であり、simの自動戦闘行動として魔力草を1ターン使うモデルではない。したがって上表の `recoveryBySource.manaPotion` は sim の戦闘間回復で、プレイヤーが戦闘中に使える供給を含めた値ではない。

## Issue 本文の判定

1. **判定1に該当。** B1ではほぼ満タンだが、深い実フロアでは開始 MP の中央値が大きく下がり、戦闘間回復の中央値も0。MPは少なくとも現行 sim 条件では run 資源として蓄積的に減る。
2. **判定2は主判定にしない。** blocked event の中央値は round 3だが、深いフロアの戦闘開始時点ですでに低MPであり、全戦闘の中央値は1〜2 round。長期戦だけが原因ではない。
3. **判定3に該当。** Mage の候補チェック件数は外側の sim 行動選択と計測分母に由来し、Mage固有の性質として扱えない。#658 の Mage 結論はこの指標からは保留する。

## Verification and design canon

- `node --check scratch/sim_depth_material_ev.js`: PASS
- N=1 smoke run: PASS
- `npm run lint`: PASS
- `npm run test:unit`: PASS (85 passed, 0 failed, 3 skipped by unchanged dependencies)
- N=500 `scratch/sim_depth_material_ev.js` twice: PASS; stdout SHA-256 identical
- Exact baseline compatibility run: PASS; all four averages match to every displayed digit
- UI source was not changed, so build/browser verification was not required for this measurement-only change.
- Updated `.agents/balance-simulation.md` with the measurement method and conclusion. Other `.agents/game-design*.md` files did not need changes because no game rule, balance value, or material-economy behavior changed.
