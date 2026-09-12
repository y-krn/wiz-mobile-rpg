# Issue #1200 representative task-flow walkthrough

## Purpose

This is a dry-run of the Issue delivery routing against a real domain Issue.
It validates the lifecycle reference; it is not a new balance measurement or a
replacement for the evidence recorded by the completed Issue.

Subject: [Issue #1196](https://github.com/y-krn/wiz-mobile-rpg/issues/1196),
“fresh B1FのCost持ち越しを回復・継戦resource到達性から分解する”. The
implementation and completed evidence are in the merged
[PR #1197](https://github.com/y-krn/wiz-mobile-rpg/pull/1197).

## Route and evidence

| Delivery stage | Walkthrough result |
| --- | --- |
| Goal and acceptance | Issue #1196 asks whether fresh B1F survivors reach and use production recovery resources before encounters 2/3; separate amount, availability, usability, policy, and timing; preserve production balance values. Its acceptance covers the encounter 1→2→3 trajectory, recovery funnel/timing, matched policies, HP bands, population separation, and production-backed conclusions. |
| File-map route | Progression/economy and measurement route through `.agents/file-map.md` to the balance reference, the production-backed measurement runner, and the relevant unit/lint verification. |
| Applicable domain guidance | `.agents/balance-simulation.md` owns claim and evidence boundaries; `.agents/skills/balance-simulation/SKILL.md` owns runner, provenance, and determinism procedure. QA owns regression verification; merge-gate owns immutable review and current-head CI. |
| Acceptance to evidence | Before implementation, plan evidence for Issue #1196's encounter-ordinal 2/3 timing and recovery funnel; the later PR #1197 records encounter 1→3 trajectories, acquired/usable/used/carried recovery funnel, timing, matched populations, deterministic N=1000 output, source/runner provenance, local unit/lint results, and required CI. |
| Material ambiguity found before implementation | Issue #1196 distinguishes encounter 2/3 and treats B2 arrival as secondary, but does not itself fully define whether runner `targetDepth: 2` means encounter ordinal 2 or B2F. At the pre-implementation base `91838d1`, the runner already maintained separate `encounterOrdinal` fields (`scratch/measurements/starting_kit_diagnostic.js:245,277,300,354,443,556`) and `b2ArrivalRate` (`:707`), while using `targetDepth: 2` (`:860`) and printing B2 arrival separately (`:964`). |
| Readiness decision and evidence plan | This was a material semantics risk, not an already-settled Issue decision. The pre-implementation regression file's relevant range was a visible-multi-enemy-flee smoke test (`tests/node/regression/test_starting_kit_diagnostic.js:178-198`), so same-step target-encounter exclusion had to be an implementation-time evidence requirement. PR #1197 later added the boundary regression coverage; the current test asserts that coverage at `tests/node/regression/test_starting_kit_diagnostic.js:173-191`. Keep encounter-ordinal 2/3 recovery evidence separate from the B2F floor metric. |
| Final verification owner | Measurement and provenance remain with the production-backed runner/skill; regression checks remain with QA; immutable review and current-head CI remain with merge-gate. |

## Result

The lifecycle reference reaches the existing domain guidance and evidence owners
without requiring a new planner, skill, or fixed PR format. The walkthrough
starts from the ready Issue #1196, identifies a material runner-semantics risk
before implementation, and uses PR #1197 only as the later implementation and
evidence result. The lifecycle Issue itself was not used as the representative
domain task.
