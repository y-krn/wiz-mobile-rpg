# Sole-user claim assessment template

Complete this only after the relevant records exist. A blank or missing row is
not a pass.

## Claim

- Final status: `NOT_READY` / `SOLE_USER_PRODUCTION_GRADE` / `SOLE_USER_TOP_TIER_EVIDENCED` / `SOLE_USER_BEST_IN_CLASS_DEFENSIBLE_WITH_SCOPE`
- Claim sentence: `<scoped claim for the sole intended user>`
- Target user: `sole intended user (owner/developer)`
- Device/use conditions: `<device, viewport, orientation, usage mode, relevant network/AT>`
- Competitor set: `<products and versions actually compared, or not assessed>`
- Platform: `<platform/device classes>`
- Tested date/version: `<date range and source/build versions>`
- Limitations: `<N=1, missing modes/devices/goals, telemetry boundary, etc.>`

## Evidence ledger

| Evidence level | Supporting records | Contradictory records | Missing evidence/limitation | Record count | Source record IDs | Tested SHA/version | Date |
|---|---|---|---|---:|---|---|---|
| `L0` |  |  |  |  |  |  |  |
| `L1` |  |  |  |  |  |  |  |
| `L2` |  |  |  |  |  |  |  |
| `L3` |  |  |  |  |  |  |  |
| `L4` |  |  |  |  |  |  |  |
| `L5` |  |  |  |  |  |  |  |

## Axis disposition

| Axis | Claim supported? | Supporting observations | Contradictory observations | Missing evidence | Evidence level(s) |
|---|---|---|---|---|---|
| Learnability for the target user | `yes|no|not_observed` |  |  |  |  |
| Efficiency | `yes|no|not_observed` |  |  |  |  |
| Safety | `yes|no|not_observed` |  |  |  |  |
| Feedback | `yes|no|not_observed` |  |  |  |  |
| Information density | `yes|no|not_observed` |  |  |  |  |
| Accessibility robustness | `yes|no|not_observed` |  |  |  |  |
| Responsiveness | `yes|no|not_observed` |  |  |  |  |
| Visual identity | `yes|no|not_observed` |  |  |  |  |
| One-hand mobile fit | `yes|no|not_observed` |  |  |  |  |

## Decision rules

- Do not select `SOLE_USER_PRODUCTION_GRADE` unless relevant exact-head/device
  and critical journey records are actually observed and blockers are
  dispositioned.
- Do not select `SOLE_USER_TOP_TIER_EVIDENCED` without relevant longitudinal
  sole-user L3 and matched same-user competitive L4 records.
- Do not select `SOLE_USER_BEST_IN_CLASS_DEFENSIBLE_WITH_SCOPE` without
  appropriate L4 and L5 evidence, a named goal/platform/date/competitor scope,
  and explicit contradictory and missing evidence.
- A missing mode, device, goal, or record remains `not_observed`; it never
  becomes PASS through aggregation.
- N=1, owner familiarity, a single aggregate score, completion time, or NPS
  cannot establish a general-population or universal superiority claim.
