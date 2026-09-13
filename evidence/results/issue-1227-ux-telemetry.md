# UX Telemetry audit — Issue #1227

## Baseline identity

- Issue: #1227
- Fresh source: `origin/main`
- Baseline SHA: `2d128e31fa1fa9fa9bf75d7e866d96fbed843202`
- SHA verification: `git fetch origin main` completed before branching; `origin/main` resolved to this SHA.
- Worktree: `issue/1227-ux-telemetry`, branched from the fresh baseline; the earlier detached worktree HEAD `29cfd914320e29e553d5082f3d4045744f6607e7` was an ancestor, not the implementation base.
- Relevant historical evidence: #1225 report baseline `29cfd914…`; #1226 report records its own historical baseline and later focus-repair/current-head evidence. This report uses the current #1235-merged `main` above.

### Current telemetry/privacy contract

Source of truth is `src/telemetry.js` and `vercel.json`:

- global `schemaVersion`: `2`; no global bump is needed for these additive UX event names.
- production PostHog uses `/ingest`, with the existing Vercel rewrite to `https://us.i.posthog.com`.
- `autocapture: false`, `capture_pageview: false`, `capture_pageleave: false`.
- `disable_session_recording: true`, `disable_surveys: true`, `persistence: "memory"`.
- explicit semantic capture only; SDK loading has a bounded 64-event startup buffer and delivery failure drops safely.
- existing runtime `runId` is reused. No UX history, UX ID, timestamp, path, selector, or player identity is added.

## Evidence inputs and decision rule

The audit used:

- `.agents/game-design-telemetry.md` as the schema/ownership/privacy contract;
- `.agents/mobile-ui-ux.md` and the #1023 UI/UX canon for decision, Back, and information boundaries;
- `.agents/qa-regression.md` for observation-only and duplicate lifecycle coverage;
- `evidence/results/issue-1225-golden-journeys.md` for the ten-journey baseline;
- `evidence/results/issue-1226-accessibility-golden-journeys.md` for automated accessibility findings and remaining manual gates;
- related scope: #1224 parent, #1228 visual system, #1133 combat target presentation, and #1230 renderer spike.

For every question, the order was: automated Golden Journey/a11y evidence → manual playtest → existing gameplay telemetry → production need → smallest event → retention/removal. A Class 2 event is retained only where the first four steps cannot answer a concrete hypothesis.

## Existing event coverage

| UX question | Existing evidence and limitation | Class | New UX event |
| --- | --- | --- | --- |
| Final Portal Push/Return mix and carried stakes | `portal_decision.decision`, `portalType`, HP/MP bands, free slots, unbanked count/value, and stake snapshot fields. #1225/#1226 prove equal choices and readable confirmation. A high Return/Back rate alone is not friction. | 0 | None |
| Final Wing settlement and rescued subset | `portal_decision` with `portalType: return_wing`, `wingSalvageCount`; `loot_lifecycle` and `loot_stake_snapshot` prove ownership/settlement. Candidate churn is normal salvage valuation unless a separate confusion hypothesis exists. | 0/1 | None for settlement; boundary probe below covers only cancel/reopen |
| Full-bag rejection and replacement outcome | `loot_lifecycle` `found`→`rejected`/`bagged`, ownership, item category/rarity bands, `loot_stake_snapshot`, pending reward resolution, `loadout_transaction`, and terminal settlement. Repeated rejection is countable by run/loot sequence; no duplicate `ux_action_rejected` is justified. | 0 | None |
| Equipment compare opened but no commit; same candidate reopened | `equipment_decision.action: compare` observes selected comparisons; `equipment_decision` equip/discard plus `loadout_transaction` observes commits. These do not observe an empty surface entry, Back/Cancel resolution, or short reopen, so commit results must not be treated as surface completion. | 2 | `ux_decision_opened` + `ux_decision_resolved`, `surface: equipment` |
| Portal choice/confirmation Back→reselect | `portal_decision` observes only the final Push/Return decision and stakes. #1225/#1226 confirm the structure but cannot measure production checkpoint Back/reselect behavior. | 2 | Same two boundary events, `surface: portal` |
| Wing selection cancel/reopen or commit | Final `portal_decision` and ownership events do not observe cancel/reopen. #1225/#1226 prove the safe cancel path; whether real players repeatedly re-enter requires production evidence, but selection changes themselves are normal gameplay. | 2 (bounded boundary only) | Same two boundary events, `surface: wing` |
| Combat target entry→Back→reselect | `combat_decision` is emitted only when the pending action is committed at round boundary; `trackCombatDecisionCancel()` removes pending data. It deliberately cannot answer target-surface cancel/reopen. Regular attack/movement clickstream is out of scope. | 2 | Same two boundary events, `surface: combat_target` |
| Chest/trap inspect, action, result | `chest_action`, `trap_resolution`, `valuable_location`, and loot lifecycle already record semantic outcomes. #1225/#1226 automated evidence covers inspect order, result, focus, and reduced motion; duration or repeated inspection is not independently a friction verdict. | 0/1 | None |
| Preparation opened but not started; kit/craft deliberation | Existing departure/quest and run-start transitions plus #1225/#1226 preparation evidence cover reachability and state. Choosing kit/craft is gameplay, and long duration or no start is not automatically bad UX. No concrete production hypothesis survives the manual gate. | 1/3 | None |
| Fresh start→B1F and Explore→Combat→Result→Explore continuity | `run_start`, `run_end`, `combat_start/end`, `exploration_decision`, loot/stake events, and owner tests cover outcome/continuity. Remaining VoiceOver/physical zoom checks are manual accessibility evidence, not a reason for clickstream. | 0/1 | None |

### Golden Journey inventory

| Journey | Relevant question | Current evidence | Classification / disposition |
| --- | --- | --- | --- |
| Fresh start → starting kit → B1F | Can the player understand and reach departure? | #1225 journey baseline; #1226 semantic, focus, short-screen and text-scaling proxy checks; departure tests. | Class 0/1; no event. Manual VoiceOver/physical zoom remains. |
| Explore → Combat → result → Explore | Is combat/result continuity understandable? | `run_start`, `combat_start`, `combat_end`, `run_end`; owner tests and a11y result gate. | Class 0/1; no event. No raw action trace. |
| Combat → target → Back → reselect | Is target cancel/reselect a production friction loop? | #1225/#1226 prove Back is non-committing and the keyboard-equivalent route; `combat_decision` omits canceled pending actions. | Class 2; four-state boundary events, `combat_target`. |
| Loot → inspect/compare → equip/keep/discard | Is compare context lost or repeatedly reopened? | `equipment_decision.compare/equip/discard`, `loadout_transaction`, loot lifecycle; owner tests prove draft/cancel/commit. | Class 2; four-state boundary events, `equipment`. |
| Bag full → replacement → commit/cancel | Is replacement understood and settled safely? | `loot_lifecycle` rejected/bagged and ownership/stake/loadout settlement; #1225/#1226 replacement/cancel gates. | Class 0/1; no duplicate rejection event. |
| Chest / Trap → inspect → decision → result | Is risk/result clear? | `chest_action`, `trap_resolution`, `valuable_location`; owner and a11y gates. | Class 0/1; no event. |
| Portal → Push/Return → confirmation → resolution | Is confirm Back/reselect confusion distinct from normal risk deliberation? | `portal_decision` final choice and stakes; #1225/#1226 equal-choice and confirmation evidence. | Class 2; four-state boundary events, `portal`. |
| Wing → rescue selection → commit | Is cancel/re-entry distinct from normal salvage selection? | `portal_decision` final settlement, loot ownership/stake; owner safe-cancel gate. | Class 2 for boundary only; `wing`. Do not interpret selection count as confusion. |
| Death / Return → Result → Town | Is outcome/loss readable? | `run_end`/loot settlement; #1225/#1226 result/a11y gates. | Class 0/1; no event. Fresh-B1F retry hypothesis remains #1217-owned. |
| Town → preparation → next run | Is preparation reachable without prescribing a strategy? | departure/quest flow tests and a11y matrix; preparation changes are normal gameplay. | Class 1/3; no event. |

## Hypothesis records (written before implementation)

### H1 — Equipment comparison context

- UX question: does an equipment compare entry end in Back/Cancel without commitment, and does the same compare surface return immediately or shortly afterward?
- Current gap: compare selections and eventual commits exist, but an entry with no candidate selection and its Back/Cancel resolution is absent. Multiple `compare` events lack a short reopen boundary.
- Why automation/manual is insufficient: #1225/#1226 validate one representative compare/cancel path and state preservation; they cannot estimate real-player frequency or distinguish a deliberate comparison from a repeated context-loss loop.
- Why existing events are insufficient: `equipment_decision` and `loadout_transaction` answer what was committed, not whether a surface was entered and abandoned.
- Expected interpretation: only a higher-than-baseline `opened → resolved(back/cancel)` followed by `immediate/short` reopen is a friction candidate. Compare activity or long deliberation alone is not failure.
- Alternatives: deliberate optimization, unknown-item evaluation, accidental tap, or a safe cancellation habit.
- Required properties: `runId`, `surface: equipment`, and bounded `revisitBucket` on open; `runId`, `surface`, `resolution: commit|back|cancel` on resolve; global `schemaVersion`.
- Sample unit: one semantic equipment decision-surface entry and one terminal resolution, counted by run and surface.
- Comparison: same event schema, same app release family, before/after at the surface level; compare against manual journey evidence.
- Retention: temporary diagnostic retained while the context-loss hypothesis is unresolved and for longitudinal comparison across the release under test.
- Removal: remove after the hypothesis is resolved and a subsequent release review finds no need for longitudinal comparison; no permanent generic UX metric is assumed.

### H2 — Portal confirmation reconsideration

- UX question: does selecting Push/Return and then choosing `判断を選び直す` or Back cause immediate/short portal re-entry?
- Gap and insufficiency: `portal_decision` begins only at final resolution; tests show the path is valid but have no production denominator for confirmation reconsideration.
- Expected interpretation: only checkpoint Back followed by immediate/short re-entry is a friction candidate when corroborated by copy/structure review. High Back or long thought time alone is normal risk deliberation.
- Alternatives: high stakes, carried loot, low HP, deliberate risk appetite, or accidental selection.
- Required properties/sample/comparison/retention/removal: same as H1, with `surface: portal`; no stakes or free-form copy is added because existing `portal_decision` already supplies stakes.

### H3 — Wing cancel/re-entry

- UX question: do players abandon the Wing selection surface and rapidly return, beyond normal candidate valuation?
- Gap and insufficiency: final settlement proves only the selected subset; owner tests prove safe cancel but not production frequency.
- Expected interpretation: boundary re-entry is a diagnostic signal only; changing candidates or taking time is not a failure signal.
- Alternatives: normal salvage optimization, selecting the small rescue allowance, or reconsidering an equipped item.
- Required properties/sample/comparison/retention/removal: same as H1, with `surface: wing`; interpret only alongside candidate/ownership context from existing events; remove under the same hypothesis-resolution condition.

### H4 — Combat target cancel/reselect

- UX question: after entering target selection, does Back immediately/shortly precede re-entry to choose the target again?
- Gap and insufficiency: pending combat decisions are emitted only on commit and canceled pending entries are intentionally dropped; target selection is the only low-frequency boundary worth observing.
- Expected interpretation: a repeated boundary can be a friction candidate, but it cannot distinguish mis-tap, target rethink, action rethink, or encounter context without manual review. Never trace ordinary attack/movement clicks.
- Alternatives: valid target reconsideration, accidental tap, dead/unavailable target, or action reconsideration.
- Required properties/sample/comparison/retention/removal: same as H1, with `surface: combat_target`; no target name, spell name, DOM data, or rejection prose; remove under the same hypothesis-resolution condition.

## Event schema and implementation boundary

The only new semantic API is two explicit functions in `src/telemetry.js`:

- `trackUxDecisionOpened(surface)` → event `ux_decision_opened`; allowed `surface` values are exactly `equipment`, `portal`, `wing`, `combat_target`; allowed `revisitBucket` values are `none`, `immediate`, `short`.
- `trackUxDecisionResolved(surface, resolution)` → event `ux_decision_resolved`; allowed `surface` values are the same; allowed `resolution` values are exactly `commit`, `back`, `cancel`.

Rules:

- Event hooks attach to semantic entry/commit/cancel transitions, never render/update/focus restoration.
- A runtime-only map keeps only active surface state and the last resolution time; it is reset on run start/test reset and is never persisted or sent.
- `immediate` means a same-interaction retry within 2 seconds; `short` means a same-session retry within 30 seconds; older/unknown prior resolution is `none`. These buckets are diagnostic grouping, not a duration/failure score.
- No raw timestamp or duration is sent. No correlation ID is added; `runId` remains the existing bounded runtime join key.
- An already-active surface does not emit another opened event, so rerender, focus restoration, and responsive redraw are silent.
- A resolve without an active surface is dropped, preventing duplicate close/commit events.
- These are temporary diagnostic events, not permanent product KPIs; removal review follows H1–H4.

No UX event is added for `bag_replacement`, `preparation`, `chest`, `trap`, or generic combat actions because the audit found no sufficiently specific Class 2 need after existing evidence/manual review.

## Analysis contract

Candidate metric for each surface:

- Numerator: `ux_decision_resolved` with `resolution: back|cancel`, followed by `ux_decision_opened` for the same `surface` with `revisitBucket: immediate|short`, counted in decisions (not raw events).
- Denominator: `ux_decision_opened` decisions for that surface in the same compatible app/schema version window.
- Sample unit: one `runId` + surface decision lifecycle; report event count and distinct run count.
- Minimum sample: do not set a universal numeric threshold in this Issue; report sample size and uncertainty before interpretation.
- Allowed segmentation: app release, global schema version, surface, journey context available from existing event fields, and coarse existing gameplay state/stake bands where already present.
- Prohibited segmentation: DOM/selector/button text, item/display name, log text, player-entered text, raw timestamp, identity graph, and inferred strategy/recommendation.
- Before window: the last comparable production window where the existing schema/semantics are available; treat missing pre-event data as unavailable, not zero.
- After window: the first compatible release window containing the new event schema; verify app/schema compatibility before comparison.
- Caveats: rate increase is not a UI regression. Risk deliberation, optimization, mis-tap, normal salvage choice, and target/action reconsideration are alternatives.
- Required corroboration: #1225 Golden Journey evidence, #1226 accessibility evidence, manual playtest/assistive-tech review, and copy/structure inspection before any UI change.

## Privacy, non-blocking, and duplicate verification plan

Unit tests cover normalization, allowlists, schema version, active-surface deduplication, resolve-without-open omission, pre-init buffering, disabled no-op, capture exception isolation, and absence of selectors/IDs/button text/visible copy/item names/log text/URLs/raw time/raw duration/free-form reason/player text.

Focused browser coverage is limited to the instrumented surfaces: equipment open/close/commit, portal choice checkpoint/confirm/back, Wing open/cancel/commit, and combat target open/Back/commit. It asserts one event per semantic boundary and no event from rerender/focus restoration. Existing Golden Journey owner tests remain the gameplay/a11y authority.

## Remaining manual evidence and child Issues

Manual evidence remains: VoiceOver/TalkBack decision order, physical browser zoom/OS text scaling, physical assistive-tech focus restoration, Canvas/Pixi/Three information equivalence, and player interpretation under reduced motion. These are not replaced by telemetry.

No child Issue was created: the audit found no new confirmed UI defect. #1133 owns target-selection presentation density; #1228 owns visual-system drift; #1230 owns Pixi visual impact; #1217 owns fresh-B1F retry validation. If future telemetry plus manual corroboration isolates a player-impact defect, split it before changing UI in #1227.

