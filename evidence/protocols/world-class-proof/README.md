# World-class Proof protocol

Protocol version: `1.1`

This directory is the repository source of truth for the sole-user proof
protocol requested by #1265. The intended real user is the owner/developer of
this service. The protocol connects that user's long-term use to exact-head
device checks, same-user competitive comparison, accessibility robustness, and
bounded production evidence.

It does not claim that any observation has already happened.

## Status of this artifact

| Item | Status | Meaning |
|---|---|---|
| Protocol | READY | Definitions, records, task cards, codes, and claim rubric are fixed for this version. |
| Sole-user longitudinal records | NOT EXECUTED | No real-use record is represented by this change. |
| Exact-head device evidence | NOT COLLECTED | No physical-device result is represented by this change. |
| Accessibility robustness evidence | NOT COLLECTED | Automated #1226 evidence is not field robustness evidence. |
| Competitive records | NOT COLLECTED | #1264's shortlist is a selection input, not a comparison result. |
| Production longitudinal evidence | NOT ASSESSED | Existing bounded telemetry may be reviewed later with N=1 limitations. |
| Final claim | NOT_READY | A ready protocol is not evidence that a claim passed. |

Never replace `not_observed`, `not_applicable`, or an unexecuted record with
`PASS`. Do not infer general-population superiority from this protocol or from
one user's experience.

## Source-of-truth boundaries

The ten Golden Journeys in [`tests/golden-journeys.js`](../../../tests/golden-journeys.js)
are the only journey registry. [`issue-1225-golden-journeys.md`](../../results/issue-1225-golden-journeys.md)
is the baseline rationale and evidence record. [`task-cards.md`](task-cards.md)
references those IDs and adds consistent observation instructions; it does not
redefine journey ownership, fixtures, or browser coverage.

Related contracts:

- [`mobile-ui-ux.md`](../../../.agents/mobile-ui-ux.md) — player-facing principles.
- [`issue-1226-accessibility-golden-journeys.md`](../../results/issue-1226-accessibility-golden-journeys.md) — automated accessibility gate and remaining field checks.
- [`issue-1227-ux-telemetry.md`](../../results/issue-1227-ux-telemetry.md) — bounded semantic telemetry and privacy boundary.
- #1228 — Dark Archive visual grammar.
- #1259 — acknowledgement, pending, resolution, and duplicate-action contract.
- #1264 — exact-head, sole-user, competitive, and production-proof scope.

Production UI, gameplay, telemetry, session replay, and browser-test structure
must not be changed to fit this protocol.

## Usage modes

Every record declares one usage mode. These describe the same user's context;
they are not user segments.

| Usage mode | Definition | Use |
|---|---|---|
| `first_after_change` | First use after a UI/behavior change. The user is familiar with the service, but not yet with that change. | Detect change-specific friction without treating it as a new-user study. |
| `steady_state` | Normal repeated use after the flow is understood. This is the most important mode for this service. | Observe durable efficiency, safety, feedback, reach, lookup cost, fatigue, and recurring friction. |
| `regression_check` | Intentional check that a known flow still works after a change or suspected regression. | Confirm a known contract, not user satisfaction. |

Longitudinal comparison uses the same Golden Journey and comparable device/use
conditions across records. Record whether friction recurs, fades with use,
returns after a change, or accumulates as visual/reach fatigue. Do not infer a
cause from a small number of events; record a pattern as a hypothesis for
later verification.

## Campaign and risk-based sets

Before a record, fix protocol version, exact source SHA, build/Preview
identifier, date, device/use conditions, selected task set, and limitations.
The ten cards are the complete inventory, but every use need not execute all
ten.

| Set | Include | Use |
|---|---|---|
| `core-loop` | 01, 02, 03, 04, 07, 09 | Start, combat, target recovery, comparison, high-loss choice, and result. |
| `full-journey-coverage` | 01–10 | Periodic complete coverage of the Golden Journey inventory. |
| `high-loss-safety` | 04, 05, 07, 08, 09 | Equipment, capacity, Portal, Wing, loss, and recovery decisions. |
| `mobile-responsiveness` | 01, 03, 04, 05, 06, 07, 08, 09, 10 | Touch, short viewport, acknowledgement, scroll, reach, and recovery risks. |
| `accessibility-robustness` | 01–10, critical states listed on each card | VoiceOver/TalkBack, scaling, zoom, reduced motion, focus, and equivalent meaning. |
| `competitive-goal-set` | Goal mappings below | Same-user comparison by player goal; a missing equivalent is `not_applicable`. |

## Task execution and outcome grammar

Each record is one observed use of one task card. Record the declared starting
state and the terminal state. Use exactly one outcome:

| Outcome | Use |
|---|---|
| `success` | The card's observable success condition was reached. |
| `success_with_friction` | Success was reached, with one or more observed friction codes. |
| `blocked` | The flow could not reach success because a product/device condition blocked continuation. |
| `not_applicable` | The task or equivalent player goal does not apply under the declared product/state; explain why. |
| `not_observed` | The task was not run, was interrupted, or the required evidence was not observable. |

`not_observed` and `not_applicable` are not PASS and are excluded from success
aggregation. `success_with_friction` is not a clean pass. A blocked record
requires a defect or environment disposition; it is never hidden by a later
successful record.

## Bounded friction codes

Use only these codes. A code is an observable event or repeated pattern, not a
diagnosis. Notes may add neutral context but may not create ad hoc codes.

| Code | Meaning and use condition |
|---|---|
| `avoidable_back` | Back is used and the observed route shows avoidable navigation or loss of decision context; do not count deliberate cancellation. |
| `reopen_same_surface` | The same decision surface is reopened without a new game-state reason being observed. |
| `repeated_rejected_action` | The same unavailable, disabled, or rejected action is attempted again after rejection is visible. |
| `destructive_near_miss` | An irreversible/high-loss action is approached and stopped before commitment. |
| `lost_focus_or_context` | Selected item, target, scroll position, or task context is lost and must be reconstructed. |
| `blank_or_unacknowledged_input` | Input has no visible acknowledgement, pending state, rejection, or terminal response on the observed route. |
| `duplicate_action_attempt` | Repeated input occurs while the first action is unresolved or an accidental duplicate is observable. |
| `reach_discomfort` | A required/frequent control is physically uncomfortable or unsafe to reach in the recorded one-hand condition. |
| `scroll_trap` | Required content or action becomes unreachable or the user is trapped in a scroll context. |
| `information_lookup_cost` | The user must perform extra surface transitions or memory reconstruction to obtain decision-critical information. |
| `visual_hierarchy_confusion` | State, primary action, consequence, or selected/danger/disabled meaning competes or is misread because of visual hierarchy. |
| `visual_fatigue` | Repeated or extended use produces an observed readability, motion, contrast, or visual comfort problem. |
| `task_abandon` | The user stops or leaves the task before its terminal state. |
| `wrong_primary_action` | An observable action does not advance the current goal while the intended path is available; do not treat it as a first-use learning failure. |
| `misunderstood_consequence` | The observed explanation of a consequence conflicts with the visible contract; record a bounded summary, never a full transcript. |
| `focus_not_restored` | Focus is absent, trapped, or returned to an unrelated control after a surface closes in an accessibility route. |

Do not code a long Portal, equipment, or build deliberation as friction by
duration alone. Record the lookup or hierarchy problem only when observed.

## Timing and longitudinal comparison

When timing is useful, record:

```text
task start → first correct action → terminal result
```

The first correct action advances the declared goal; terminal result is the
card's success or blocked state. Duration is descriptive and never an
automatic defect verdict. Compare the same user, journey, usage mode, source
version, and device condition where possible. Do not use completion time alone
to rank a product or claim improvement.

## Competitive comparison

The #1264 shortlist is re-checked at comparison time for availability,
version, platform, and date. Product names are data in a comparison record,
not permanent schema enums.

Compare the same user's observable player goal, not feature parity. Minimum
goal map:

| Goal ID | Player goal | Golden Journey/card | Missing equivalent |
|---|---|---|---|
| `start-to-gameplay` | Start a run and reach gameplay. | `fresh-start-to-b1f` / TASK-01 | `not_applicable`. |
| `combat-primary-action` | Discover and perform primary combat action. | `explore-combat-result-explore` / TASK-02 | `not_applicable`. |
| `target-cancel-reselect` | Choose, cancel/reconsider, and reselect a target or equivalent commitment. | `combat-target-back-reselect` / TASK-03 | `not_applicable`. |
| `loot-equipment-understanding` | Understand loot and compare/keep/equip/discard it. | `loot-inspect-compare-settle` / TASK-04 | `not_applicable`. |
| `inventory-pressure` | Resolve capacity pressure without hidden loss. | `full-bag-replacement` / TASK-05 | `not_applicable`. |
| `high-loss-decision` | Understand and commit/cancel a consequential choice. | `portal-resolution`, `wing-rescue-selection` / TASK-07/08 | `not_applicable`. |
| `result-next-attempt` | Understand result/failure and identify the next attempt. | `death-result-town`, `town-preparation-next-run` / TASK-09/10 | `not_applicable`. |

Record observable behavior: taps/actions, Back/reopen, accepted/rejected
feedback, information lookup steps, destructive-action safety, and one-hand
reach. Apply the same task wording and comparable conditions. Do not use the
owner's implementation knowledge as evidence for the target product. Keep the
nine axes separate:

- Learnability for the target user
- Efficiency
- Safety
- Feedback
- Information density
- Accessibility robustness
- Responsiveness
- Visual identity
- One-hand mobile fit

Do not turn these axes into a single score. A missing equivalent is
`not_applicable`, never zero.

## Accessibility robustness

Accessibility is a quality/robustness check, not multi-user satisfaction
evidence. Automated #1226 checks are L1 only. If the owner uses assistive
technology, record actual use; otherwise record the field route as a robustness
check without claiming user satisfaction.

Evaluate where available:

- VoiceOver and TalkBack;
- browser zoom and text scaling;
- reduced motion;
- accessible name/state and reading order;
- focus entry, exit, and restoration;
- pending/busy announcement and duplicate announcement;
- Back/Cancel semantics;
- Canvas/Pixi player-critical equivalent information;
- non-visual meaning of selected, danger, disabled, and unknown states.

Unavailable technology or an unrun state is `not_observed`, not PASS.

## Exact-head device record

Use [`device-session.template.md`](templates/device-session.template.md) for
actual hardware. Record exact source SHA, build/Preview, device class/model,
OS, browser/webview, viewport, orientation, cold/warm, relevant network,
Golden Journey, observed friction, and `PASS`/finding/blocker status. PASS is
only for an explicitly observed contract under those conditions.

## Longitudinal session and comparison records

Use [`session-record.template.md`](templates/session-record.template.md) for
the primary sole-user record, [`competitive-comparison.template.md`](templates/competitive-comparison.template.md)
for same-user comparison, and [`accessibility-robustness.template.md`](templates/accessibility-robustness.template.md)
for field robustness. A small structured form is defined by
[`session-record.schema.json`](session-record.schema.json). Each record keeps:

- Golden Journey ID;
- exact source SHA;
- build/Preview identifier;
- device and use conditions;
- usage mode;
- player goal and starting state;
- outcome and bounded friction codes;
- notes, limitations, and longitudinal reference.

## Privacy and evidence handling

This is not a user registry. Do not create fake user records or store
identity data. Keep free-form notes minimal. Do not commit raw screen
recordings, account/device-specific identifiers, or large collections of
copyrighted competitor assets. Keep any controlled raw material outside the
repository and retain only the minimum bounded observation needed for a
decision.

## Evidence ladder

| Level | Definition | Permitted interpretation |
|---|---|---|
| `L0` | Internal assertion. | Hypothesis only. |
| `L1` | Automated unit/browser/visual/accessibility evidence. | Reproducible contract under test conditions. |
| `L2` | Exact-head manual/device evidence. | Device and condition-specific observation. |
| `L3` | Longitudinal sole-user real-use evidence. | Durable evidence for the intended user, source, and conditions only. |
| `L4` | Matched same-user competitive evidence. | Scoped comparison by goal, axis, platform, and date. |
| `L5` | Longitudinal production evidence over meaningful time/use volume. | Sustained pattern evidence, with N=1 and telemetry limitations. |

Every claim records evidence level, record count, source record IDs, tested
SHA/version, date, limitation, and contradictory evidence. N=1 is not a basis
for population inference, statistical significance, or “best for everyone”.

## Final claim rubric

Use [`claim-assessment.template.md`](templates/claim-assessment.template.md).
The final status is exactly one of:

- `NOT_READY`
- `SOLE_USER_PRODUCTION_GRADE`
- `SOLE_USER_TOP_TIER_EVIDENCED`
- `SOLE_USER_BEST_IN_CLASS_DEFENSIBLE_WITH_SCOPE`

The final claim must name target user = the sole intended user, device/use
conditions, competitor set, tested date/version, supporting evidence,
contradictory evidence, missing evidence, and limitations. Generic
`WORLD-BEST`, general-population superiority, and “best UX for everyone” are
not valid statuses.

## Defect escalation

Use [`defect-escalation.template.md`](templates/defect-escalation.template.md)
to convert a finding into:

```text
Observation → Player impact → Violated principle → Reproduction
→ Observable invariant → Smallest child Issue
```

Severity is bounded:

- `P0` — use cannot continue; destructive or fundamental break.
- `P1` — critical journey severe confusion or safety failure.
- `P2` — meaningful friction that does not fundamentally stop the journey.
- `P3` — polish or preference without critical journey impact.

P0/P1 blockers are dispositioned before a stronger final claim. This Issue
does not change production behavior; a defect becomes a separate child Issue.

## Anti-gaming and verification

- Do not generalize one user's result to a population.
- Do not treat owner familiarity as first-use evidence.
- Do not choose a favorable task only for the target product.
- Do not use implementation knowledge to score the target product.
- Do not use a single aggregate score, completion time, or NPS as the claim.
- Do not expand telemetry, session replay, or analytics framework for this protocol.
- Do not imitate competitor UI or store copyrighted competitor assets in bulk.
- Do not change production UI or gameplay to make a record easier.

The static guard [`test_world_class_proof_protocol.js`](../../../tests/node/unit/test_world_class_proof_protocol.js)
checks that every task-card ID resolves to the #1225 registry and that usage
modes, outcomes, friction codes, evidence levels, axes, and final claim enums
remain bounded. It does not claim that any real-use, device, accessibility,
competitive, or production record exists.
