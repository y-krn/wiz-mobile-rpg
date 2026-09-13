# Session record template

Use one copy per session, and one task outcome row per selected task. This is
a controlled record template, not evidence that a session occurred. Do not
commit completed participant records or raw recordings to the repository.

## Session identity

- Protocol version: `1.0`
- Record status: `planned` / `executed` / `not_executed`
- Session ID: `<PILOT|DEVICE|COMP|AT>-###`
- Anonymous participant ID: `<PILOT-### or omitted for device-only>`
- Experience band: `dungeon-rpg-new` / `rpg-experienced` / `genre-expert` / `not_applicable` / `not_observed`
- Session order: `<coarse integer or not_applicable>`
- Session type: `human` / `device` / `accessibility` / `comparative` / `production`
- Moderator/evaluator role: `<role, no name or contact detail>`
- Date: `<YYYY-MM-DD>`
- Platform: `<iOS|Android|desktop browser|other declared platform>`
- Exact source SHA: `<40-character SHA>`
- Build/Preview identifier: `<identifier>`

## Device and environment

- Device class: `<iphone-current|iphone-small-or-older|android-representative|desktop|other>`
- Device model: `<model; no serial/device ID>`
- OS version: `<version>`
- Browser/webview: `<name and version>`
- Viewport: `<width>x<height>`
- Orientation: `<portrait|landscape>`
- Cold/warm: `<cold|warm|both>`
- Network condition: `<relevant condition or not_applicable>`
- Brightness/environment note: `<minimal non-identifying condition or not_observed>`

## Selected tasks

| Task ID | Golden Journey ID | Outcome | Critical failure? | Assistance category | Observation codes | Task start | First correct action | Terminal result | Finding/blocker |
|---|---|---|---|---|---|---|---|---|---|
| `TASK-XX` | `<registry id>` | `<allowed outcome>` | `yes|no|not_observed` | `<none|neutral_prompt|technical_recovery|other declared bounded category>` | `<bounded codes>` | `<timestamp or not_observed>` | `<timestamp or not_observed>` | `<timestamp or not_observed>` | `<PASS|finding|blocker|not_observed>` |

For each `assisted_success`, describe the bounded assistance category and the
point at which it occurred. Never record the participant's verbatim speech.
Use a short anonymous summary only, after removing identifying details.

## Accessibility field observations

- Assistive technology: `<VoiceOver|TalkBack|none|not_observed>`
- Text scaling/zoom: `<condition>`
- Reduced motion: `<default|enabled|not_observed>`
- Critical state: `<state>`
- Accessible name/state: `<observed route or not_observed>`
- Reading order: `<observed route or not_observed>`
- Focus entry: `<observed route or not_observed>`
- Focus exit/restoration: `<observed route or not_observed>`
- Pending/busy announcement: `<observed route or not_applicable|not_observed>`
- Duplicate announcement: `<observed route or not_observed>`
- Back/Cancel semantics: `<observed route or not_observed>`
- Canvas/Pixi equivalent: `<observed player-critical meaning or not_observed>`
- Selected/danger/disabled/unknown non-visual meaning: `<observed route or not_observed>`

## Comparative record (only for matched sessions)

- Product role: `target|benchmark`
- Product name: `<record current study product name here; not a protocol enum>`
- Product version/build: `<version>`
- Availability/platform/date checked: `<facts>`
- Benchmark selection rationale: `<player-goal category>`
- Matched goal ID: `<goal map ID>`
- Order position: `<coarse integer>`
- Same wording/conditions confirmed: `<yes|no; explain limitation>`
- Equivalent goal: `<yes|no>`
- If no equivalent, outcome: `not_applicable`

## Axis observations

Keep each axis separate. An ordinal is optional and must have a declared
scale; the raw observation is required when an ordinal is supplied.

| Axis | Ordinal or `not_observed` | Raw anonymous observation | Contradictory observation |
|---|---|---|---|
| Learnability |  |  |  |
| Efficiency |  |  |  |
| Safety |  |  |  |
| Feedback |  |  |  |
| Information density |  |  |  |
| Accessibility |  |  |  |
| Responsiveness |  |  |  |
| Visual identity |  |  |  |
| One-hand mobile fit |  |  |  |

## Privacy-safe notes and disposition

- Anonymous notes: `<minimum necessary summary; no PII or raw transcript>`
- Session limitations: `<missing device, interrupted task, sample limitation, etc.>`
- Evidence level: `<L0|L1|L2|L3|L4|L5>`
- Raw recording location: `<controlled external location or none; never a repo path>`
- Follow-up child Issue: `<issue number or none>`
