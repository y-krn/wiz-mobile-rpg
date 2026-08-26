# Issue #893 coverage follow-up (#894)

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

The N=500 measurement and material/item supply impact are recorded in the PR
description after running from a clean committed source SHA with the standard
`SIM_RUNS=500 SIM_CALIBRATION_RUNS=100` configuration.
