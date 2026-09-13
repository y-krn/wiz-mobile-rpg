# World-class Proof protocol

Protocol version: `1.0`

This directory is the repository source of truth for the external-proof
protocol requested by #1265. It defines how a reviewer may later collect and
interpret human, device, accessibility, comparative, and production evidence.
It does not contain results from a study.

## Status of this artifact

At this revision:

| Item | Status | Meaning |
|---|---|---|
| Protocol | READY | The definitions, scripts, task cards, codes, and claim rubric are fixed for this version. |
| Human sessions | NOT EXECUTED | No participant session is represented by this change. |
| Device sessions | NOT COLLECTED | No physical-device result is represented by this change. |
| Accessibility field sessions | NOT COLLECTED | Automated #1226 evidence is not field assistive-technology evidence. |
| Comparative sessions | NOT COLLECTED | #1264 shortlist is a selection input, not a comparison result. |
| Production longitudinal evidence | NOT ASSESSED | Existing bounded telemetry may be used later under its own limitations. |
| Final claim | NOT READY | A protocol being ready is not proof that any claim has passed. |

Never replace `NOT OBSERVED`, `NOT APPLICABLE`, or an unexecuted session with
`PASS`. A later campaign must record its exact tested source, version, date,
and limitations.

## Source-of-truth boundaries

The ten Golden Journeys in [`tests/golden-journeys.js`](../../../tests/golden-journeys.js)
are the only journey registry. [`issue-1225-golden-journeys.md`](../../results/issue-1225-golden-journeys.md)
is the baseline rationale and evidence record. The task cards in
[`task-cards.md`](task-cards.md) reference those IDs and add measurement
instructions; they do not redefine journey ownership, fixtures, or browser
coverage.

Related contracts:

- [`mobile-ui-ux.md`](../../../.agents/mobile-ui-ux.md) — player-facing principles.
- [`issue-1226-accessibility-golden-journeys.md`](../../results/issue-1226-accessibility-golden-journeys.md) — automated accessibility gate and remaining manual gates.
- [`issue-1227-ux-telemetry.md`](../../results/issue-1227-ux-telemetry.md) — bounded semantic telemetry and privacy boundary.
- #1228 — Dark Archive visual grammar.
- #1259 — acknowledgement, pending, resolution, and duplicate-action contract.
- #1264 — external-proof scope and current benchmark shortlist.

Production or browser-test structure must not be changed to fit this protocol.

## Campaign setup

Before any session, the coordinator creates a campaign sheet containing:

- protocol version and exact source SHA;
- build or Preview identifier;
- campaign purpose, platform, date, and moderator/evaluator role;
- selected task set and the reason for selecting it;
- whether the session is human, device, accessibility, comparative, or production evidence;
- known limitations and stopping conditions.

The tested head must be identified before observation starts. If the source
changes, start a new campaign or explicitly record a new source version; do not
pool incompatible heads silently.

### Risk-based session sets

The ten cards are the complete inventory, but every participant need not run
all ten. The coordinator records the chosen set per session.

| Set | Include | Use |
|---|---|---|
| `pilot-core` | 01, 02, 03, 04, 07, 09 | First-time qualitative pilot covering start, combat, target recovery, comparison, high-loss decision, and result. |
| `full-journey-coverage` | 01–10 | Coverage campaign or a participant for whom all states are appropriate. |
| `high-loss-safety` | 04, 05, 07, 08, 09 | Equipment, inventory pressure, Portal, Wing, and loss/result safety. |
| `mobile-responsiveness` | 01, 03, 04, 05, 06, 07, 08, 09, 10 | Touch, short viewport, acknowledgement, scroll, and recovery risks. |
| `accessibility-critical` | 01–10, with the critical states listed on each card | Field VoiceOver/TalkBack, scaling, zoom, and reduced-motion review. |
| `comparative-goal-set` | Goal mappings in the comparative section below | Matched player-goal comparison. Use only tasks supported by the compared product. |

Use order counterbalancing where the same person evaluates more than one
product. Record order as a coarse `sessionOrder`; do not infer quality from
order or from a single participant.

## Moderator script

Read the task's participant instruction verbatim. Keep the same wording for a
matched session. Ask the participant to think aloud, but do not convert a
silence or hesitation into a hint.

The moderator may say:

- the task goal and the request to think aloud;
- “Please do what seems right to you; I will not tell you which control is correct.”;
- a neutral reminder to continue observing when the participant asks what to do;
- technical recovery instructions, such as restarting a failed build or recording that the session cannot continue;
- the follow-up question after the task is terminal.

The moderator must not say:

- “Press this button”, “tap there”, or any equivalent directional hint;
- what a Portal, selected state, danger cue, Back, Cancel, or other UI element means;
- the optimal build, item, target, or strategy;
- hidden gameplay rules, expected consequences, implementation details, or test fixtures;
- that the product is expected to pass, be world-class, or be compared favourably.

If the moderator gives any task-relevant assistance, record the exact bounded
assistance category and change the result to `assisted_success` only when the
task reaches its terminal success condition. Assistance is not an unassisted
pass. If technical recovery changes the task conditions, mark the affected
task `not_observed` and explain why.

## Task execution and outcome grammar

Each task is one unit of analysis. Record the starting state before the first
participant action. A task is terminal when its stated success, failure, or
critical-failure condition is reached, or when the participant abandons it.

Allowed outcomes are exactly:

| Outcome | Use |
|---|---|
| `unassisted_success` | Success condition reached without task-relevant direction from the moderator. |
| `assisted_success` | Success condition reached after bounded task-relevant assistance was recorded. |
| `failure` | The participant could not reach success, but the session was not critically broken. |
| `not_applicable` | The task or equivalent player goal does not apply under the declared product/state; explain why. |
| `not_observed` | The task was not run, was interrupted, or the required evidence was not observable. |

`not_applicable` and `not_observed` are not successes and are excluded from
success-rate denominators. A missing sample is reported as missing evidence,
not as zero failures and not as a PASS.

Record critical failures separately from outcome. A critical failure includes a
destructive or fundamental break that stops the task, a severe high-loss
misunderstanding, or a P0/P1 safety/continuation failure. One critical failure
must not be hidden by later recovery.

## Observation coding

Use only the bounded codes below. A code records an observable event, not a
diagnosis. Multiple codes may be attached to one task event when each is
directly observed. Notes may describe context in neutral, anonymous language,
but do not invent new codes.

| Code | Meaning and use condition |
|---|---|
| `wrong_primary_action` | The participant takes an observable action that does not advance the stated current goal when the primary path is available. Do not use for an intentional exploration choice. |
| `avoidable_back` | Back is used and the participant states or shows that the prior surface could have been left through the visible intended path without losing the current decision. Do not count a deliberate cancellation. |
| `reopen_same_surface` | The same decision surface is reopened after exit without a new game-state reason being observed. |
| `repeated_rejected_action` | The same unavailable, disabled, or rejected action is attempted again after its rejection is visible. |
| `destructive_near_miss` | An observable input approaches an irreversible/high-loss action but is stopped before commitment, including a stated near miss corroborated by the interaction. |
| `misunderstood_consequence` | Before or after commitment, the participant explains a consequence that conflicts with the visible contract. Record the statement as an anonymous summary, not a transcript. |
| `lost_focus_or_context` | The participant loses the relevant selected item, target, scroll position, or task context and must reconstruct it. |
| `blank_or_unacknowledged_input` | An input has no visible acknowledgement, pending state, rejection, or terminal response within the observed route. Do not infer it from long deliberation alone. |
| `duplicate_action_attempt` | A repeated tap, key, or equivalent input is made while the first action is unresolved or after an accidental duplicate is observable. |
| `task_abandon` | The participant stops pursuing the task or asks to end it before a terminal success/failure state. Record the stated neutral reason category if available. |
| `focus_not_restored` | After a surface closes, focus is absent, trapped, or returned to an unrelated control in an accessibility route. Use only when the focus route is actually observed. |

Do not use timing, preference, “felt slow”, or a single Back during normal
deliberation as a code by itself. The observer may add a bounded note such as
“participant re-read the consequence text before committing”; do not include
names, contact details, account IDs, raw voice, raw video, or biometric data.

### Timing policy

If timing is observable, record three timestamps relative to the task session:

```text
task start → first correct action → terminal result
```

The first correct action is the first observable action that advances the
declared goal, not the first tap. Terminal result is the success/failure state
defined by the task card. Keep raw timestamps in the controlled session record,
not in repository evidence. Report derived durations only with source,
sample-size, and limitations.

Duration is descriptive, not a defect verdict. Portal choice, equipment
comparison, and build decisions are gameplay deliberation; a long duration is
not an automatic failure. Completion time cannot rank products by itself.

## Evaluation axes

Keep these axes as separate fields. If an ordinal is useful, use a declared
ordinal scale per axis and retain the raw observation that supports it. Never
sum or average these axes into a single UX score.

- Learnability
- Efficiency
- Safety
- Feedback
- Information density
- Accessibility
- Responsiveness
- Visual identity
- One-hand mobile fit

Preference, confidence, and memorable identity feedback are qualitative
observations alongside the axes, not substitutes for task evidence.

## Competitive mapping

The #1264 shortlist is a current selection input, not a permanent schema enum.
At study start, re-check product availability, version, platform, date, and
selection rationale. Store those facts in the session record; do not hard-code
brand names into this protocol or static guard.

Compare the same player goal, not the same feature. The minimum goal map is:

| Goal ID | Shared player goal | Target journey/card | If no equivalent exists |
|---|---|---|---|
| `start-to-gameplay` | Start a new run and reach playable gameplay. | `fresh-start-to-b1f` / TASK-01 | `not_applicable`, with the product boundary. |
| `combat-primary-action` | Discover and perform the primary combat action. | `explore-combat-result-explore` / TASK-02 | `not_applicable`. |
| `target-cancel-reselect` | Choose, reconsider, cancel, and reselect a target or equivalent commitment. | `combat-target-back-reselect` / TASK-03 | `not_applicable`; do not force a feature match. |
| `loot-equipment-understanding` | Understand a reward and compare or keep/equip/discard it. | `loot-inspect-compare-settle` / TASK-04 | `not_applicable`. |
| `inventory-pressure` | Resolve lack of capacity without hidden loss. | `full-bag-replacement` / TASK-05 | `not_applicable`. |
| `high-loss-decision` | Understand and commit or cancel a consequential choice. | `portal-resolution`, `wing-rescue-selection` / TASK-07/08 | `not_applicable`. |
| `result-next-attempt` | Understand failure/result and identify the next attempt. | `death-result-town`, `town-preparation-next-run` / TASK-09/10 | `not_applicable`. |

Match platform, viewport/orientation, build conditions, task wording, and
reasonable order controls across products. Do not explain this product more
than a competitor. Separate objective task outcomes, observed friction, and
subjective preference. A product with no equivalent goal receives
`not_applicable`, never an artificial zero.

## Device session protocol

For every actual-device session, record all fields in
[`session-record.template.md`](templates/session-record.template.md):

- exact source SHA;
- build/Preview identifier;
- device class and model, without device identifiers;
- OS version and browser/webview version;
- viewport and orientation;
- cold/warm path;
- relevant network condition;
- Golden Journey and task ID;
- observed friction and bounded codes;
- `PASS` only for an explicitly observed contract, plus finding/blocker status.

`PASS` means the named observation was actually completed under the recorded
conditions. It does not mean the journey was not attempted or that automation
passed.

## Accessibility field protocol

Automated #1226 gates are L1 evidence only. They do not substitute for actual
assistive-technology observation. When available, evaluate the same critical
journey state with:

- VoiceOver;
- TalkBack;
- browser zoom and OS/browser text scaling;
- reduced motion;
- long labels/content and short viewport.

Record the observed route, not just PASS/FAIL:

- accessible name and state;
- reading order;
- focus entry, exit, and restoration;
- pending/busy announcement;
- duplicate announcement or announcement spam;
- Back/Cancel semantics;
- Canvas/Pixi player-critical equivalent information;
- non-visual meaning of selected, danger, disabled, and unknown states.

If a required assistive technology or device is unavailable, record
`not_observed`; do not infer field PASS from browser semantics or an automated
scanner.

## Participant metadata and privacy contract

Use anonymous IDs such as `PILOT-001`, `DEVICE-001`, or `COMP-001`. Keep only:

- anonymous session/participant ID;
- coarse experience band;
- coarse device class;
- session order;
- task, outcome, bounded codes, timing fields, axis observations, and minimal anonymous notes.

Never put the following in the repository or a raw evidence attachment:

- name, email, phone, address, or free-form identifying details;
- account identifier, advertising identifier, or device identifier;
- raw voice, raw video, full transcript, or raw biometric/health information;
- copyrighted competitor screenshots in bulk.

Free text must be a minimal anonymous summary. Redact or omit unique work,
location, relationship, medical, contact, account, or other identifying detail.
Store raw recordings, consent records, and any linkage key outside the repo in
the approved controlled system. Repository evidence contains only the minimum
de-identified finding needed to reproduce a decision.

## Evidence ladder

| Level | Definition | What it can support |
|---|---|---|
| `L0` | Internal assertion or developer opinion. | Hypothesis only; never independent proof. |
| `L1` | Automated unit, browser, visual, or automated accessibility evidence. | Reproducible implementation contract under the test conditions. |
| `L2` | Exact-head manual/device evidence on an actual rendered state. | Device/condition-specific observation. |
| `L3` | Independent user or assistive-technology evidence. | Learnability, comprehension, and field accessibility claims within the sample. |
| `L4` | Matched comparative evidence against strong alternatives. | Scoped comparative claims by goal, axis, platform, and date. |
| `L5` | Production longitudinal evidence over a meaningful period and sample. | Sustained real-use claims, with cohort and retention limitations. |

Each claim records evidence level, sample size, source session IDs, tested
SHA/version, date, limitation, and contradictory evidence. “World-class”
positioning requires at least relevant L3 and L4 evidence. A scoped
world-best claim additionally needs appropriate L5 support and must name its
scope; no level is automatically sufficient just because it has a large N.

## Claim rubric

Use [`claim-assessment.template.md`](templates/claim-assessment.template.md).
The final status is exactly one of:

- `NOT READY`
- `PRODUCTION-GRADE`
- `TOP-TIER EVIDENCED`
- `WORLD-BEST CLAIM DEFENSIBLE WITH SCOPE`

The last status is never an unconditional “world’s best” statement. The claim
must include supporting evidence, contradictory evidence, missing evidence,
scope, competitor set, platform, and date. No aggregate score, completion time,
NPS, or five-person pilot may decide it alone.

## Defect escalation

Use [`defect-escalation.template.md`](templates/defect-escalation.template.md)
to convert a finding into:

```text
Observation → Player impact → Violated principle → Reproduction
→ Observable invariant → Smallest child Issue
```

Bounded severity:

- `P0` — test cannot continue; destructive or fundamental break.
- `P1` — critical journey severe confusion or safety failure.
- `P2` — meaningful friction that does not fundamentally stop the journey.
- `P3` — polish or preference; no critical journey impact observed.

P0/P1 blockers must be dispositioned before a campaign continues to a higher
claim. A finding is not a production UI change in this Issue; it becomes a
separate child Issue with its own owner and scope.

## Anti-gaming and stop rules

- Do not choose only favorable tasks or give competitors an unfair task.
- Do not guide a participant toward the intended control or hidden answer.
- Do not treat developer playtest as independent user evidence.
- Do not treat a five-person pilot as statistical superiority.
- Do not turn missing samples into zero friction or PASS.
- Do not use completion time alone to rank products.
- Do not use NPS or preference alone for a world-class claim.
- Do not enable clickstream, session replay, or a generic analytics framework for this protocol.
- Do not copy competitor UI or store copyrighted screenshots in bulk.
- Do not change gameplay semantics or production UI to make the campaign easier.

## Verification contract

The static guard [`test_world_class_proof_protocol.js`](../../../tests/node/unit/test_world_class_proof_protocol.js)
checks that all task-card journey references resolve to the registry and that
the schema's outcome, observation-code, evidence-level, and axis enums remain
bounded. It does not claim that any human, device, accessibility, comparative,
or production session has happened.

The protocol artifact is documentation/schema work only. No production UI,
gameplay, telemetry, session replay, or browser-test structure is changed.
