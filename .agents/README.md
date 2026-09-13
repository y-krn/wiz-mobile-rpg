# Review and design map

`.agents/*.md` contains repository references for implementation and review.
Read only the documents whose scope matches the task. This index does not
define authorization or agent roles; the request and root `AGENTS.md` do.

`.agents/issue-delivery.md` owns the lifecycle from a ready Issue to an
acceptance/evidence map and PR handoff. It does not own domain rules,
verification matrices, or independent review.

Use `.agents/file-map.md` before broad searches. The map's module boundaries,
checklist scopes, and source/test routing are authoritative for the initial
context. Load a design canon only when the changed area affects its durable
meaning.

## Checklist ownership

- `game-logic.md`: durable gameplay and state invariants
- `qa-regression.md`: regression strategy and verification sufficiency
- `balance-simulation.md`: balance principles and claim/evidence boundaries
- `content-design.md`: player-facing content review
- `mobile-ui-ux.md`: mobile layout, input, and accessibility review

The conditional skills below own only repository-specific decisions that need a
repeatable workflow. Load only the row whose trigger matches the work.

## Conditional skill routing

| Skill | Load when | Owns | Excludes |
| --- | --- | --- | --- |
| `balance-simulation` | A progression, economy, difficulty, reward, or pacing claim needs measurement | Production-backed measurement, determinism, provenance, matched comparison, and uncertainty | Formula/spec review, reachability, UI-only work, and ordinary QA |
| `combat-model-change` | Combat expression, stage, scaling, targeting, or combat observability semantics change | Physical/spell semantics, specification alignment, and model evidence | UI-only/rendering work, balance measurement, and reachability audits |
| `diagnosing-bugs` | A bug cause or reliable reproduction is unresolved, including intermittent or performance regressions | Tight reproduction, causal localization, minimal fix, and regression evidence | Known-cause fixes, ordinary QA, and deterministic test failures |
| `gameplay-reachability-audit` | A mechanic is claimed to be live, dead, hidden, or missing across a player, simulation, or record path | Definition-to-execution, player operation, simulation, and record evidence | Ordinary code search, balance measurement, combat semantics, and cleanup |

Descriptions in each `SKILL.md` are trigger-first context pointers. Procedures
and evidence gates belong in the body; current commands and exact scenarios
belong in source, tests, `package.json`, configuration, or CLI help.

## Browser evidence boundary

QA owns browser test selection, regression coverage, and the final verdict.
Interactive inspection may use any browser automation capability available in
the environment to collect DOM, rendered-state, console, network, screenshot,
trace, or storage evidence. Repository correctness does not depend on a named
external capability. If browser evidence leaves the cause or reproduction
unresolved, route the investigation to `diagnosing-bugs` and return the final
QA decision to `qa-regression.md`.

## Scope overlap

Select checklists by the nature of the change, not the filename. Mechanics and
state use `game-logic`; progression and rewards use `balance-simulation`; new
player-facing content uses `content-design`; layout and touch flow use
`mobile-ui-ux`; test or regression risk uses `qa-regression`. Apply multiple
lenses only when the change genuinely spans them, with each lens reporting
only its own findings.

`qa-regression.md` is the regression backstop, not a substitute for a domain
checklist. When ownership is still ambiguous after this map, ask before
applying another checklist.

## Design references

- `game-design-core-loop.md`: player experience, depth, pacing, and push-your-luck
- `game-design-combat-model.md`: combat stages, counterplay, and observability
- `game-design.md`: economy, materials, status, milestones, and quests
- `game-design-equipment-builds.md`: Core/Support builds and equipment knowledge

Keep executable values and current implementation details in source/tests.
When a design canon is unaffected, state that explicitly in the PR.

## Review output

Reviews report `Blocking issues`, `Non-blocking issues`, `Missing verification`,
and a verdict of `pass`, `pass with notes`, or `block`. The lifecycle,
immutable review, and current-head CI requirements remain in
`issue-delivery.md` and `merge-gate.md`.
