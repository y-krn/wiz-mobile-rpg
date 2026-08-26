# Issue #893 coverage follow-up (#894, #896)

## Canonical path added

`scratch/sim_depth_material_ev.js` remains the canonical `run` runner. The
runner now uses the generated run floor and records the following production
paths:

| mechanism | status | evidence / limitation |
| --- | --- | --- |
| hidden-door search | modeled | generated secret-door edges, production search chance formula, retry-until-found policy, and one-step-per-search cost |
| secret-room reachability | modeled | natural route to the hidden-door source plus reveal/enter/return movement cost; room chest is opened through the shared chest resolver |
| ordinary chest | modeled | existing production chest pool, special reward, trap rule, and reward accounting are retained |
| `fromDrop` chest | modeled | combat reward log's `triggerChest` signal opens the production from-drop candidate pool; no ordinary special reward roll is added |
| inspect | partially modeled | source-specific action telemetry and production Thief/non-Thief inspection rates; light spell bonus is not modeled by the canonical policy |
| open | modeled | direct reward/trap outcome is recorded for no-trap and opened-with-trap cases |
| disarm | modeled | shared chest disarm chance and direct success/failure outcome |
| trap kit | modeled | inventory consumption and guaranteed trap removal |
| smash | modeled | weakened trap plus role-aware reward loss |
| leave | partially modeled | explicit safety policy leaves a chest when modeled risk is lethal; no UI timing/input is modeled |

The simulation policy is explicit: secret-door candidates are searched until
revealed; the canonical route pays approach, search, and room entry/return
steps. Search encounter exposure is recorded as expected `getEncounterChance`
without injecting a second combat resolver into the route. Existing normal
combat encounters and combat reward resolution remain on the real round path.

## Scope and omissions

`fromDrop` is the combat-generated chest source. Its main pool is
`CHEST_ITEM_CANDIDATES_BY_FLOOR_FROM_DROP`; the ordinary special reward roll is
not applied, while its accessory roll remains available through the shared
production rule. Ordinary and secret-room chests use the ordinary production
pool. Production balance constants were not changed.

UI rendering, input timing, telemetry transport, and the visual chest submenu
remain safe omissions. Light-powered inspection bonus and search-triggered
combat interruption remain partial omissions and are reported separately from
measured reward/material EV.

## Deterministic probe

`scratch/test_sim_issue_894_paths.js` verifies repeated identical output,
secret search/reward instrumentation, the ordinary/fromDrop pool distinction,
and all six action counters. `node --check` and the canonical smoke pass.

## N=500 measurement

Command: `SIM_ALLOW_STALE_TREE=1 SIM_RUNS=500 SIM_CALIBRATION_RUNS=100
SIM_SEED=894 SIM_INDEPENDENT_RUN_RANDOM=1 SIM_SCENARIOS=workshop-empty node
scratch/sim_depth_material_ev.js`

The measurement used source/runner commit
`f78ca3ba167cf7dc395ff1bd33f21a07f5e9652d`, with gameplay baseline
`ebd39078585810076fe5df812bfddad4d706d7f8`. The worktree was clean, but the
branch could not be fast-forwarded to `origin/main` because the shared
worktree metadata lock is outside the writable sandbox; therefore
`originMainAncestor=false` and `staleTreeAllowed=true` are recorded in the
measurement output. No production balance values were changed.

| target | secret candidates/run | search success | extra steps/run | secret reward chests/run | fromDrop chests/run | material/run | equipment/run |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| B5 | 4.412 | 46.4% | 346.69 | 0.084 | 0.878 | 37.49 | 7.54 |
| B10 | 5.098 | 43.6% | 404.79 | 0.098 | 1.122 | 45.04 | 9.24 |
| B15 | 4.936 | 40.2% | 368.91 | 0.090 | 1.036 | 44.25 | 8.71 |
| B20 | 5.506 | 36.5% | 445.33 | 0.088 | 1.162 | 48.55 | 9.45 |

At B10, ordinary chests produced 91 special-reward rolls, while fromDrop
chests produced 10 main-pool `TOWN_PORTAL` rewards and zero special-reward
rolls. The B10 fromDrop action counts were inspect=561, open=172,
disarm=229, trap-kit=8, smash=152, leave=0; secret-room chests exercised
inspect=49, open=9, disarm=21, trap-kit=1, smash=18, leave=0. The action
outcomes and trap/reward-loss counters are retained per source in the
measurement result.

The B10 material EV/time was `0.0406 [0.0372,0.0440; N=500]`, and material
acquisition was `45.04 [40.90,49.18; N=500]`; equipment acquisition was 9.24
per run, including 7.87 from chests. These are measurement outputs, not new
balance constants.

## Issue #896 follow-up

The canonical runner now executes the production `executeEnhance` and
`executePolish` actions from `src/craft.js` against the simulation state. The
standard policy attempts each eligible equipped weapon/armor/shield once and
then greedily polishes the eligible support affix with the largest equipment
power delta. The `omitted` policy performs neither action. Both policies are
selectable with `SIM_EQUIPMENT_CRAFT_POLICY`.

Crafting is modeled at run completion, after gross materials are banked. It
therefore measures equipment power and material EV impact without claiming
that same-run enhance/polish changes reach, death, or retreat outcomes. The
runner reports gross banked materials, actual production-action spend, and a
net post-craft bank indicator; UI input, cross-run equipment persistence, and
arbitrary player build choice remain outside this policy.

### Deterministic probe

`scratch/test_sim_issue_896_equipment_craft.js` verifies repeated identical
standard output, production enhance/polish success and spend, positive
equipment power delta, runtime call evidence, and the no-action `omitted`
control. `node --check`, the canonical smoke, and the existing follow-gate
tests pass.

### N=500 measurement

Both policies used `SIM_RUNS=500`, `SIM_CALIBRATION_RUNS=100`, `SIM_SEED=896`,
`SIM_INDEPENDENT_RUN_RANDOM=1`, `SIM_SCENARIOS=workshop-empty`, and target
depths B5/B10/B20. The source and measurement runner commit was
`9d1b584eb970b523207fbf3af606b2b64288dfce`; the gameplay source baseline was
`ad5cc9a595eb8a63dbe751426f0db050465fe25c`. Provenance reported a clean tree,
`originMainAncestor=true`, and `staleTreeAllowed=false`.

| target | policy | enhance success/run | polish success/run | power Δ/run | material spend/run | gross bank EV | net EV/time |
| ---: | --- | ---: | ---: | ---: | --- | ---: | ---: |
| B5 | omitted | 0.000 | 0.000 | 0.00 | — | 23.03 | 0.0465 [0.0431,0.0499] |
| B5 | standard | 0.788 | 0.470 | +2.53 | 魔石片 1.218 / 鉄片 1.066 / 硬い皮 1.020 | 22.91 | 0.0394 [0.0360,0.0427] |
| B10 | omitted | 0.000 | 0.000 | 0.00 | — | 14.97 | 0.0424 [0.0386,0.0462] |
| B10 | standard | 0.522 | 0.450 | +1.82 | 魔石片 1.080 / 鉄片 0.702 / 硬い皮 0.684 | 15.00 | 0.0354 [0.0317,0.0390] |
| B20 | omitted | 0.000 | 0.000 | 0.00 | — | 14.28 | 0.0385 [0.0352,0.0417] |
| B20 | standard | 0.396 | 0.442 | +1.54 | 魔石片 1.028 / 鉄片 0.540 / 硬い皮 0.504 | 14.28 | 0.0338 [0.0306,0.0370] |

The standard B20 run had survival/death `8.2%/91.8%`, matching the omitted
control `8.2%/91.8%`; this is expected because crafting occurs after the run
outcome. Gross bank EV is nearly unchanged at B20, while net post-craft bank
averages `12.35` materials/run. These are measurement outputs, not new
balance constants.
