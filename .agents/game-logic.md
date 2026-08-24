# Game Logic Checklist

## Role

Review game mechanics for correctness, maintainability, and compatibility with
existing state and data structures.

## Scope

- Combat, movement, map generation, state transitions, data/rule/system
  boundaries, and compatibility
- Deterministic resolution, random behavior, save/state shape, and flow wiring
- Facade-to-concrete module behavior for mechanics

Target files are determined from the relevant rows in `.agents/file-map.md`.

## Chest Transition Contract

`state.chestState.phase` is transient runtime state. The legal phases and
transitions are:

| Phase | Legal input and output |
| --- | --- |
| `menu` | A live chest at the current cell. Inspect stays in `menu`; kit disarm stays in `menu` with `trap: "none"`; disarm selection enters `disarm_select`; opener selection enters `open_select`; smash or direct open enters `resolving`; leave enters `terminal`. |
| `disarm_select` | Back/cancel returns to `menu`; a live eligible character enters `resolving`. |
| `open_select` | Back/cancel returns to `menu`; a live eligible character enters `resolving`. |
| `resolving` | A trap is resolved at most once, then enters `reward`; an interrupted or lethal smash may enter `terminal`. Repeated actions are rejected while `state.transitioning` is true. |
| `reward` | Generated materials, identification powder, and the existing main/special/accessory rewards are applied once, then enter `terminal`. |
| `terminal` | No chest action is legal. The chest state is cleared and exploration or game-over owns the next screen. |

The selection screens are navigation-only: their back/cancel path must restore
the chest menu without consuming a trap or reward. Ordinary active chest phase
state is never written to a save payload; saves flatten those encounters to
`explore` and reload with `chestState: null`, leaving the map event to be
entered again. The exception is an unopened `fromDrop` chest, which has no map
event to re-enter: its reward/trap state is saved, its phase is normalized to
`menu`, and load restores the chest menu. This keeps inspection, disarm, smash,
and reward bookkeeping out of later phases while preserving reward, trap,
telemetry, and navigation behavior.

## Initial File Routing

Before searching broadly, read `.agents/file-map.md`. Start with the mechanic
module named by the request, then inspect the concrete module behind any facade
(`src/state.js`, `src/data.js`, `src/combat.js`, `src/combat_logic.js`,
`src/menu.js`, or `src/ui.js`). Expand to state, data/rules,
systems, and direct callers only when the state shape, formulas, random
behavior, or flow wiring are affected.

## Inputs

- Intended rule or mechanic change
- Changed files or planned diff
- Existing save/state shape, when relevant
- Test output or reproduction seed, when relevant

## Agent Skills

- No skill is mandatory by default; prioritize direct source and test review.
- Recommended when the change touches frontend state wiring or rendered game
  flow as well as logic: `build-web-apps:frontend-testing-debugging`.
- Recommended when browser reproduction is needed for a game-flow bug:
  `webapp-testing` or `playwright`.
- Do not load UI or writing skills for pure mechanics reviews.

## Review Checklist

- Rules match the stated design goal.
- State mutations are localized and predictable.
- Existing save data shape is preserved or migration risk is explicitly handled.
- Random behavior is deterministic when seeded tests require it.
- Combat, inventory, equipment, run quest, and reward flows remain consistent.
- Facade files remain thin and do not hide divergent behavior from direct
  module imports.
- Shared rules such as inventory addition, equipment generation, and target
  selection are not duplicated with slightly different constraints.
- Edge cases are handled only where they can happen in the current game flow.
- Names and structure follow existing project style.
- The change does not introduce unnecessary generic systems.

## Required Verification

- `npm run test:unit`
- Targeted scratch test for new deterministic logic, if existing tests do not
  cover it.
- `npm run build` when module boundaries or imports change.

## Must Not Do

- Do not broaden mechanics beyond the requested feature.
- Do not introduce new abstractions for a single use case.
- Do not rewrite unrelated game systems while reviewing one mechanic.
- Do not accept hidden changes to item, enemy, or class balance without calling
  them out.

## Output

Use the repository review output format from `.agents/README.md`.
