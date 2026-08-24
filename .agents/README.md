# Review and design map

`.agents/*.md` contains reference knowledge for implementation and review.
Read only the documents whose scope matches the task. This index does not
define agent roles, operating modes, delegation, or authorization; the request
and root [`AGENTS.md`](../AGENTS.md) define those boundaries.

`.agents/skills/*/SKILL.md` contains repeatable conditional workflows.
The checklists below are references, not automatic skills or subagents.

For progression, economy, materials, workshop, rewards, run quests, or B5F clear
behavior, review against `.agents/game-design.md` in addition to the relevant
checklist definition.

Before broad repository searches, read `.agents/file-map.md` and start from the
files listed for the request area. Expand only to direct imports, touched files,
or verification targets.

The codebase uses thin facade modules. Facade-to-concrete-module mappings are
defined in `.agents/file-map.md` under `## Module Boundaries`. When a task
touches a facade, inspect the concrete module before drawing conclusions.

## Review checklists

1. `qa-regression.md`
2. `mobile-ui-ux.md`
3. `game-logic.md`
4. `balance-simulation.md`
5. `content-design.md`

## Design references

- `game-design-core-loop.md`: top-level design pillars, core loop,
  information-disclosure principles, floor density and pacing targets,
  push-your-luck structure, and FOE/camp direction. Check any feature or
  balance proposal against it.
- `game-design-combat-model.md`: physical and offensive-spell formulas,
  application order, measured contribution breakdowns, and the seven model
  decisions from Issue #722. Source values remain in `src/`.
- `game-design.md`: current progression/economy design for XP, milestone merchants,
  materials, workshop, reward roles, and post-clear save behavior.
- `game-design-equipment-builds.md`: the core/support affix system —
  `CORE_AFFIXES` and `SUPPORT_AFFIXES` (counts: `CORE_AFFIXES.length` /
  `SUPPORT_AFFIXES.length`), budget-based generation, inscriptions, polish, and
  curse-seal rules. The source of truth is `src/data/affixes.js`. Canonical for
  any change to affixes, `AFFIX_BALANCE`, `CORE_SEAL_RULES`, or workshop actions.

## File routing

Use `.agents/file-map.md` to decide the initial files for implementation and
review. Each checklist's `Scope` section remains authoritative for what that
checklist covers.

## Scope overlap resolution

Checklist scopes may overlap. Select by the nature of the change, not the file
alone:

- Mechanics, state shape, or rule correctness -> `game-logic.md`.
- Progression, economy, drops, difficulty, or reward pacing ->
  `balance-simulation.md`.
- New or reworded player-facing content, items, enemies, spells, run quests, or
  display text -> `content-design.md`.
- Layout, tap flow, one-handed reach, or CSS -> `mobile-ui-ux.md`.
- Test, reproduction, or regression risk -> `qa-regression.md`.

Resolution rules:

- A change that genuinely spans concerns applies each matching checklist, but
  each reports only findings within its own lens; do not restate the same
  finding under multiple checklists.
- `qa-regression.md` is the regression backstop, not a substitute for the
  domain checklist. Apply it in addition to the domain checklist when
  regression risk is material, not instead of it.
- When two checklists could each own a finding, the checklist whose `Role`
  most directly matches the change intent owns it; the other omits it.
- If the applicable checklist is still ambiguous after this, ask before
  applying, rather than applying all of them.

## Review output format

Each review should return:

1. `Blocking issues`: bugs or regressions that should be fixed before merge.
2. `Non-blocking issues`: risks worth considering, but not required.
3. `Missing verification`: tests or manual checks still needed.
4. `Verdict`: `pass`, `pass with notes`, or `block`.
