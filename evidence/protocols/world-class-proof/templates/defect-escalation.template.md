# Defect escalation template

Create a separate child Issue for a product defect. This protocol Issue does
not change production UI or gameplay.

## Finding

- Finding ID: `<campaign-session-task reference>`
- Severity: `P0` / `P1` / `P2` / `P3`
- Source evidence level: `<L0|L1|L2|L3|L4|L5>`
- Exact source SHA: `<SHA>`
- Session/device/build: `<de-identified reference>`
- Golden Journey ID: `<tests/golden-journeys.js id>`
- Task ID: `<TASK-XX>`
- Observation codes: `<bounded codes>`

## Escalation chain

### Observation

<What was directly seen or heard as a minimal anonymous summary. No transcript,
PII, or diagnosis.>

### Player impact

<What the player could not understand, operate, recover from, or safely decide.>

### Violated principle

<Relevant principle from `.agents/mobile-ui-ux.md`, #1225, #1226, #1227, or #1259.>

### Reproduction

<Exact source/build/device/viewport/starting state and bounded steps.>

### Observable invariant

<Smallest player-facing condition that must hold, stated independently of implementation.>

### Smallest child Issue

<One narrowly scoped issue title, owner boundary, acceptance criteria, and
evidence needed. Do not bundle redesign, telemetry expansion, or unrelated
polish.>

## Disposition

- Child Issue: `<number or not yet created>`
- Campaign stop required: `<yes for unresolved P0/P1|no>`
- Contradictory evidence: `<summary or none observed>`
- Missing evidence: `<what remains not_observed>`
