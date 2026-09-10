# Issue #1184 fresh B1F core-loop reachability evidence

## Question and scope

The question is whether a fresh production starting run reaches the first
Combat → Cost → Bag → Loot → Build decision before it ends, and which of the
candidate causes A–F best explains the early stop. This is a diagnostic run;
it does not tune enemy values, grant recovery, guarantee a legendary item, or
recommend a new player policy.

- Source: `819ad02571632759e344b188234b7a5f11e12308`
- Base: `origin/main` `0514d16a7034a905499e714cee7b782e97231ee8`, remote freshness verified
- Runner: `issue1184-core-loop-reachability-v1`, schema 3
- Scope: production-backed `simulateRun`, B1F → B2 target, N=1000 per row, seed `1139`
- Departure: the real starting-kit equipment, no consumables, no departure craft
- World matching: `issue-1176:{seed}:{runIndex}` for all kits and policies

The machine-readable reports and manifests were generated in `/private/tmp`.
Each report recorded the source SHA, `originMainAncestor: true`, and
`workingTreeClean: true`.

## Measurement contract

- `survivedRate` is the share of all runs alive after the ordinal encounter;
  `conditionalSurvivalRate` is conditional on reaching that many encounters.
- `unknown` death ordinal means the run died from trap/status or another
  non-encounter path before an encounter death was recorded.
- `meaningfulReward` is the first production reward event from combat/chest or
  another actual dungeon reward path. `objectLoot` is the object-loot subset.
- `buildChangeOpportunity` means accepted equipment reached the bag. It is not
  the same as equipping it.
- `buildChange` means an automatic greedy-simulator equipment swap, reported
  separately from the player-facing equipment UI.
- An encounter ordinal of `0` on a reward event means the reward arrived before
  the first combat encounter.

## Fresh-kit fight policy

All four production kits use the same matched world-seed candidates. The
first three encounter survival curve and reward funnel are:

| Kit | B1F death | B2 arrival | Survive through 1 / 2 / 3 | First meaningful reward | Equipment opportunity | Automatic swap |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `vanguard` | 89.6% | 10.4% | 65.0% / 26.3% / 8.5% | 93.4% (7.4% of deaths before) | 88.5% (12.8%) | 43.0% (59.9%) |
| `scout` | 94.6% | 5.4% | 37.2% / 6.9% / 1.9% | 82.2% (18.8% of deaths before) | 76.5% (24.8%) | 54.0% (48.0%) |
| `devotion` | 93.3% | 6.7% | 48.9% / 11.4% / 2.4% | 86.6% (14.4% of deaths before) | 80.9% (20.5%) | 58.2% (43.7%) |
| `arcana` | 94.8% | 5.2% | 36.6% / 4.4% / 1.3% | 82.7% (18.2% of deaths before) | 77.3% (24.0%) | 71.8% (29.5%) |

For the primary `vanguard` fight row, death encounter ordinals were 1:263,
2:229, 3:101, 4:34, 5:6, 6:3, and `unknown`:260. Thus 260/896 deaths
occurred outside a recorded combat encounter, while 593/896 recorded combat
deaths occurred by encounter 3 or earlier.

The vanguard primary row recorded 1,654 encounters, average 3.44 rounds and
8.01 normal damage per encounter. Damage sources were separated as
`normal:13245`, `floor-trap:637`, and `chest-trap:7760`; status poison was
applied 400 times. The first three visible-enemy encounter buckets were:

| Initial visible enemies | Encounters | Deaths | Encounter lethality |
| ---: | ---: | ---: | ---: |
| 1 | 1,206 | 310 | 25.7% |
| 2 | 448 | 326 | 72.8% |

The primary vanguard death causes were `normal_enemy` 571/896 (63.7%),
`trap_hazard` 194/896 (21.7%), and `poison_status_tick` 131/896 (14.6%).

## Flee cost separation

The two additional vanguard policies are counterfactual diagnostics, not a
proposed default. They preserve the production flee resolver and its parting
attack cost.

| Policy | B1F death | B2 arrival | Flee selected / executed | Flee survived | Parting-attack deaths |
| --- | ---: | ---: | ---: | ---: | ---: |
| Fight | 89.6% | 10.4% | 0 / 0 | — | — |
| HP-threshold 20% | 89.2% | 10.8% | 830 / 613 | 325 (53.0%) | 288 |
| Visible multi-enemy | 83.6% | 16.4% | 553 / 501 | 464 (92.6%) | 37 |

The visible-multi-enemy row exposes the strongest early survival improvement,
but it also changes player behavior and still records 37 deaths from parting
attacks. Its death causes remain mixed: normal enemy 51.1%, trap 30.7%, poison
18.2%. It therefore does not establish that a free safety change is correct.

## A–F diagnosis (Issue #1184 definitions)

The labels below retain the meanings from the Issue rather than introducing a
new taxonomy:

- **A — first 1–2 fights' combat Cost:** strongly supported as an early-stop
  candidate. In the primary vanguard fight row, survival is 65.0% through the
  first encounter and 26.3% through the second; two-visible-enemy encounters
  are 72.8% lethal versus 25.7% for one visible enemy. This is evidence for
  follow-up sensitivity work, not a numeric tuning decision.
- **B — between-fight resource / recovery:** not established by this run. The
  diagnostic intentionally omits consumables, camp rest, and town return, so it
  cannot distinguish absent recovery from recovery that is ineffective in
  production.
- **C — death before meaningful Loot / Build opportunity:** not the primary
  explanation in the measured rows. Vanguard reaches a meaningful reward in
  93.4% of runs and an accepted equipment opportunity in 88.5%; 7.4% of deaths
  precede the first meaningful reward. The remaining question is whether the
  opportunity is understandable and actionable, which this metric cannot prove.
- **D — Loot arrives but no valuable Build change or judgment occurs:**
  unresolved. `buildChangeOpportunity` records equipment reaching the bag and
  `automatic swap` is simulator telemetry; neither demonstrates that a player
  recognized value or made a meaningful choice. The single manual run observed
  the comparison surface, but is insufficient to close this candidate.
- **E — fight / flee judgment:** partially supported. The production flee path
  and its parting-attack cost are observable; the counterfactual visible-
  multi-enemy policy improves B1F survival from 10.4% to 16.4% B2 arrival but
  still records 37 parting-attack deaths. This does not establish that the
  player-facing judgment is clear or that the policy should change.
- **F — a numeric opportunity exists but the next-trial hypothesis is unreadable
  in actual play:** unresolved. The manual run exposed the death log, retreat
  cost, and equipment comparison, but one current-state run cannot establish
  that players see a viable next trial or want to continue. This needs targeted
  qualitative/multi-run evidence.

The strongest measured candidate is **A**. **B**, **D**, and **F** remain
additional-diagnosis candidates; **C** is less supported as the primary cause;
**E** is only partial. No production balance tuning is proposed by this Issue.

## Production reachability and manual playtest

The audited path is live end to end: starting-kit creation → dungeon movement
→ trap/status → encounter composition → combat target/action → flee or attack
→ production reward ownership → bag disposition → equipment comparison.

On 2026-09-10, a fresh browser save selected `鋼の前線キット`, started B1F,
triggered the production trap before the first fight, reached a
`マッドスライム`, chose attack then `逃走`, and observed the production
追撃 1 damage and one-tile retreat. The same run opened a chest, accepted an
unidentified `古びたレイピア` into the 20-slot bag, and opened the equipment
comparison screen. Continuing with normal attack/repeat-action controls then
reached a two-enemy `火薬コウモリ + コボルトの斥候` encounter and ended on
B1F at turn 2 with HP 0 from the scout's 3 damage. The result screen exposed
the death log and `DEAD` state.

This confirms that the operator can reach and inspect the death log, retreat
cost, and equipment comparison surface. It does not establish that a player
can explain the next trial, sees a viable path forward, or wants to continue;
those remain open questions for the next diagnostic phase. The observed path
does not justify a numeric tune in this parent Issue.

## Validity and limits

- `node --check`, the targeted diagnostic smoke test, and the full unit suite
  passed; the full suite result was 185 passed, 3 dependency-skipped.
- Repeating the same vanguard smoke inputs produced identical output.
- The reports use the existing production runner and production loot, combat,
  trap, poison, flee, composition, and equipment paths. No fixed-combat
  approximation was needed.
- The player action policy in the fight rows is the existing simulator's
  production-auto policy, not a claim about optimal play. Recovery, player
  item use, and town return are omitted as stated above.
- This evidence identifies the next investigation boundary. Any numeric
  tuning belongs in a small child Issue with a new matched measurement.
