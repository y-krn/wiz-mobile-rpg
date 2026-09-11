# Issue #1200 representative task-flow walkthrough

## Purpose

This is a dry-run of the Issue delivery routing against a real domain Issue.
It validates the lifecycle reference; it is not a new balance measurement or a
replacement for the evidence recorded by the completed Issue.

Subject: [Issue #1197](https://github.com/y-krn/wiz-mobile-rpg/issues/1197),
“Diagnose B1F continuation resource cadence”. The source evidence is the
merged [PR #1197](https://github.com/y-krn/wiz-mobile-rpg/pull/1197).

## Route and evidence

| Delivery stage | Walkthrough result |
| --- | --- |
| Goal and acceptance | Diagnose whether fresh B1F survivors reach and use production recovery resources before encounters 2/3; separate availability, usability, policy, and timing; preserve production balance values. |
| File-map route | Progression/economy and measurement route through `.agents/file-map.md` to the balance reference, the production-backed measurement runner, and the relevant unit/lint verification. |
| Applicable domain guidance | `.agents/balance-simulation.md` owns claim and evidence boundaries; `.agents/skills/balance-simulation/SKILL.md` owns runner, provenance, and determinism procedure. QA owns regression verification; merge-gate owns immutable review and current-head CI. |
| Acceptance to evidence | PR #1197 records encounter 1→3 trajectories, acquired/usable/used/carried recovery funnel, timing, matched populations, deterministic N=1000 output, source/runner provenance, local unit/lint results, and required CI. |
| Material ambiguity | Encounter ordinal 2 is explicitly separated from the B2F floor outcome. `targetDepth: 2` is recorded as a secondary floor metric, so no material product decision remains unresolved. |
| Final verification owner | Measurement and provenance remain with the production-backed runner/skill; regression checks remain with QA; immutable review and current-head CI remain with merge-gate. |

## Result

The lifecycle reference reaches the existing domain guidance and evidence owners
without requiring a new planner, skill, or fixed PR format. The lifecycle Issue
itself was not used as the representative domain task.
