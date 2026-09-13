# Issue #1266: combat-round state clone measurement

## Decision

The baseline showed that the round-start clone is a meaningful bottleneck, so
production code was changed. The change keeps the returned state isolated while
replacing the JSON deep copy of `codex` and `currentRun` with a mutation-boundary
clone.

The branch includes the existing Issue #1263 RNG-injection commit
(`b0049b52`) because reproducible round measurements require
`runCombatRoundCalculation(..., { rng })`.

## Benchmark

Runner: `node --expose-gc scratch/benchmarks/bench_combat_round_clone.js`

- 200 warm-up rounds per measurement
- 25 samples, 20 rounds per sample, median per invocation
- the same 16-value injected RNG sequence, reset for every round
- clone-only timing calls the production `cloneCombatStateForRound()` helper
- full-round timing calls production `runCombatRoundCalculation()`
- heap trend is 1000 clone calls with GC before and after; it is a retained-heap
  indicator, not total allocation

State sizes are JSON byte counts for the named field. All scenarios use four
characters, one live monster, and the indicated inventory size.

| condition | codex | currentRun | party | monsters | inventory | history shape |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| small | 1,818 B | 1,589 B | 1,261 B | 138 B | 751 B | 2 monster / 2 equipment records, no run history |
| medium | 20,844 B | 7,291 B | 1,261 B | 138 B | 5,656 B | 40 monster / 20 equipment records, 50 battles, loot/observations/death logs |
| large | 116,918 B | 106,189 B | 1,261 B | 138 B | 47,326 B | 240 monster / 100 equipment records, 1,000 battles, long loot/history ledgers |

| condition | baseline clone | after clone | clone reduction | baseline round | after round | round reduction | clone share before → after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| small | 0.01226 ms | 0.00224 ms | 81.7% | 0.02094 ms | 0.01028 ms | 50.9% | 58.6% → 21.8% |
| medium | 0.08340 ms | 0.01077 ms | 87.1% | 0.09588 ms | 0.01943 ms | 79.7% | 87.0% → 55.4% |
| large | 0.59232 ms | 0.05101 ms | 91.4% | 0.60306 ms | 0.06314 ms | 89.5% | 98.2% → 80.8% |

Baseline was captured before the production change with the original JSON clone;
after was captured after the mutation-boundary clone. The benchmark also reports
the separate baseline-reference JSON cost for `codex` and `currentRun`. In the
after run, post-GC retained heap deltas for 1,000 clone calls were approximately
-4 KiB (small), -107 KiB (medium), and -1 KiB (large), within runtime noise and
showing no retained growth in this measurement.

## Mutation boundary

`codex` mutations confirmed in the combat path:

- `stats.totalKills`
- `monsters[baseName]`: create record, `killed`, `firstKilled`, resistance flags,
  `observedActions`, `observedConditions`, and `observedLoot`; the nested
  encounter-floor map is cloned with the record shape for isolation
- `equipment[baseId]`: discovery count/rarity/bonus, `affixesSeen`,
  `foundFloors`, and `tagObservations`

`currentRun` mutations confirmed in the combat path:

- reward settlement: `kills`, `expGained`, `bossesKilled`, `elitesKilled`,
  `materials`, `equipmentFound`, `codexRewards`
- quest progress: `defeatsByRole`, quest objects, and quest reward materials
- death path: `deathLogs` through `recordCharDeath`
- object loot ownership: `lootSequence`, `unbankedObjectLoot`, and
  `townInventory` consumption paths
- roaming-elite settlement: `eliteDefeatedFloors` and `eliteFloors`

Other round-start isolation retained or tightened: party equipment/medium/buffs,
monster objects/buffs, inventory, `firstKills`, `metaMaterials`, roaming
monsters, floor chest totals, and `combatState.loggedCoreActivations`.

The implementation clones only those mutable containers/records. Historical
`codex` and `currentRun` data that combat only reads remains shared; no shallow
copy replaced a mutation boundary.

## Correctness evidence

- `tests/node/unit/test_combat_round_state_isolation.js` snapshots the original
  state, exercises codex/reward/quest updates and `recordCharDeath`, then asserts
  the original is unchanged and only the returned state is updated.
- `tests/node/unit/test_combat_rng_injection.js` repeats the same injected RNG
  sequence and asserts identical result and identical draw count (5 draws in the
  characterization fixture). The clone helper consumes no RNG.
- Existing codex observation, loot/reward, death-log, combat-log, spell, item,
  and full unit suites remain green.

## Verification

- targeted isolation/RNG/codex/death/loot tests: pass
- `npm run lint:tests`: pass
- `npm run test:unit:fast`: 195 pass, 0 fail, 6 expected heavy-test skips
- `npm run test:unit:full`: 209 pass, 0 fail, 0 skips

## Follow-up

- If later combat features mutate additional nested codex/currentRun fields,
  extend the focused isolation test and the corresponding clone boundary first.
- Re-run this benchmark after significant growth in saved run history or when
  simulation throughput becomes a user-visible concern.
