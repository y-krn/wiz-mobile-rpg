# Review Sub Agents

This directory defines review-only sub agents for expanding this mobile RPG.

Use these agents to review plans, diffs, tests, and content proposals. They do
not directly implement code unless the user explicitly changes the operating
mode.

Before broad repository searches, read `.agents/file-map.md` and start from the
files listed for the request area. Expand only to direct imports, touched files,
or verification targets.

## Operating Mode

- Default mode: review-only.
- Main agent owns implementation and final decisions.
- Sub agents inspect only the files relevant to their scope.
- Sub agents use the Agent Skills listed in their own definition when the review
  scope matches the skill trigger.
- Reviews must be concrete, file-aware, and tied to project constraints.
- Reviews must avoid unrelated refactors, broad redesigns, and speculative
  future systems.

## Agents

1. `qa-regression.md`
2. `mobile-ui-ux.md`
3. `game-logic.md`
4. `balance-simulation.md`
5. `content-design.md`

## File Routing

Use `.agents/file-map.md` to decide the initial files for implementation and
review. Agent-specific `Scope` sections remain authoritative for what each agent
is allowed to review.

## Review Output Format

Each review should return:

1. `Blocking issues`: bugs or regressions that should be fixed before merge.
2. `Non-blocking issues`: risks worth considering, but not required.
3. `Missing verification`: tests or manual checks still needed.
4. `Verdict`: `pass`, `pass with notes`, or `block`.
