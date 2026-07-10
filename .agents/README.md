# Review Checklists

This directory defines review-only checklists for expanding this mobile RPG.
They are documents to read and review against, not sub-agents registered with
the Agent tool.

Use these checklists to review plans, diffs, tests, and content proposals. They
do not drive direct implementation unless the user explicitly changes the
operating mode.

For progression, economy, materials, workshop, rewards, contracts, or B5F clear
behavior, review against `.agents/game-design.md` in addition to the relevant
checklist definition.

Before broad repository searches, read `.agents/file-map.md` and start from the
files listed for the request area. Expand only to direct imports, touched files,
or verification targets.

The codebase uses thin facade modules such as `src/data.js`, `src/state.js`,
`src/combat.js`, `src/combat_logic.js`, `src/menu.js`, `src/shop.js`, and
`src/ui.js`. When a review touches one of these files, inspect the concrete
module under the matching directory (`src/data/*`, `src/state/*`,
`src/combat_ui/*`, `src/combat_logic/*`, `src/menu/*`, `src/shop/*`, or
`src/ui/*`) before drawing conclusions.

## Operating Mode

- Default mode: review-only.
- Main agent owns implementation and final decisions.
- Each checklist inspects only the files relevant to its scope.
- Each checklist uses the Agent Skills listed in its own definition when the
  review scope matches the skill trigger.
- Reviews must be concrete, file-aware, and tied to project constraints.
- Reviews must distinguish facade wiring issues from concrete module behavior.
- Reviews must avoid unrelated refactors, broad redesigns, and speculative
  future systems.

## Checklists

1. `qa-regression.md`
2. `mobile-ui-ux.md`
3. `game-logic.md`
4. `balance-simulation.md`
5. `content-design.md`

## Design References

- `game-design-core-loop.md`: top-level design pillars, core loop, floor
  density and pacing targets, push-your-luck structure, and planned FOE/camp
  direction. Check any feature or balance proposal against it.
- `game-design.md`: current progression/economy design for XP, gold, shops,
  materials, workshop, reward roles, and post-clear save behavior.

## File Routing

Use `.agents/file-map.md` to decide the initial files for implementation and
review. Each checklist's `Scope` section remains authoritative for what that
checklist covers.

## Scope Overlap Resolution

Many source paths (for example `src/data/*`, `src/rules/*`, `src/systems/*`,
`src/combat*`, `src/ui/*`, `src/menu/*`, `src/shop/*`, `src/contracts.js`,
`src/chest.js`, `src/equip.js`, `src/spell_menu.js`) appear in more than one
checklist `Scope`. A shared path does not mean every checklist applies. Select
by the nature of the change, not the file alone:

- Mechanics, state shape, or rule correctness -> `game-logic.md`.
- Progression, economy, drops, difficulty, or reward pacing ->
  `balance-simulation.md`.
- New or reworded player-facing content, items, enemies, spells, contracts, or
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

## Review Output Format

Each review should return:

1. `Blocking issues`: bugs or regressions that should be fixed before merge.
2. `Non-blocking issues`: risks worth considering, but not required.
3. `Missing verification`: tests or manual checks still needed.
4. `Verdict`: `pass`, `pass with notes`, or `block`.
