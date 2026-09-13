# Sole-user longitudinal session record

Use one copy per observed use of one task. This is a record template, not
evidence that a use occurred. Do not commit raw screen recordings or completed
records containing account/device identifiers.

## Record identity

- Protocol version: `1.1`
- Record status: `planned` / `executed` / `not_executed`
- Session ID: `<YYYY-MM-DD-NN>`
- Date: `<YYYY-MM-DD>`
- Usage mode: `first_after_change` / `steady_state` / `regression_check`
- Product: `wiz-mobile-rpg` or declared comparison product
- Exact source SHA: `<40-character SHA>`
- Build/Preview identifier: `<identifier>`
- Change reference: `<commit/Issue/none>`
- Previous comparable record: `<session ID or none>`
- Longitudinal note: `<recurs|fades|returns_after_change|new|not_observed>`

## Device and use conditions

- Device class/model: `<primary-iphone|iphone-small-or-older|android-representative|other>`
- OS version: `<version>`
- Browser/webview: `<name and version>`
- Viewport: `<width>x<height>`
- Orientation: `<portrait|landscape>`
- Cold/warm: `<cold|warm|both|not_observed>`
- Network condition: `<relevant condition or not_applicable>`
- One-hand condition: `<left|right|two_hand|not_applicable|not_observed>`
- Assistive technology: `<none|VoiceOver|TalkBack|other|not_observed>`
- Text scaling/zoom: `<condition>`
- Reduced motion: `<default|enabled|not_observed>`

## Golden Journey task

- Task ID: `<TASK-XX>`
- Golden Journey ID: `<tests/golden-journeys.js id>`
- Player goal: `<card goal>`
- Starting state: `<observed starting state>`
- Outcome: `success` / `success_with_friction` / `blocked` / `not_applicable` / `not_observed`
- Critical failure: `yes` / `no` / `not_observed`
- Friction codes: `<bounded codes or none>`
- Notes: `<minimal bounded observation; no account/device identifier>`

## Timing, if useful

```text
task start → first correct action → terminal result
```

- Task start: `<timestamp or not_observed>`
- First correct action: `<timestamp or not_observed>`
- Terminal result: `<timestamp or not_observed>`
- Timing limitation: `<why timing is or is not comparable>`

Long Portal, equipment, or build deliberation is not automatically a defect.
Record the observed lookup, hierarchy, safety, or reach issue instead.

## Axis observations

Keep each axis separate. An ordinal is optional; raw observations remain
required. Do not compute an aggregate score.

| Axis | Ordinal or `not_observed` | Raw observation | Contradictory observation |
|---|---|---|---|
| Learnability for the target user |  |  |  |
| Efficiency |  |  |  |
| Safety |  |  |  |
| Feedback |  |  |  |
| Information density |  |  |  |
| Accessibility robustness |  |  |  |
| Responsiveness |  |  |  |
| Visual identity |  |  |  |
| One-hand mobile fit |  |  |  |

## Disposition

- Evidence level: `<L0|L1|L2|L3|L4|L5>`
- Finding status: `PASS` / `finding` / `blocker` / `not_observed`
- Limitations: `<missing state, device, time, or comparable record>`
- Child Issue: `<number or none>`
