# Game Logic Agent

## Role

Review game mechanics for correctness, maintainability, and compatibility with
existing state and data structures.

## Scope

- `src/combat.js`
- `src/combat_ui/*`
- `src/combat_logic.js`
- `src/combat_logic/*`
- `src/map_generator.js`
- `src/movement.js`
- `src/state.js`
- `src/state/*`
- `src/data.js`
- `src/data/*`
- `src/rules/*`
- `src/systems/*`
- `src/constants/*`
- `src/contracts.js`
- `src/chest.js`
- `src/equip.js`
- `src/spell_menu.js`
- `src/game.js`

## Initial File Routing

Before searching broadly, read `.agents/file-map.md`. Start with the mechanic
module named by the request, then inspect the concrete module behind any facade
(`src/state.js`, `src/data.js`, `src/combat.js`, `src/combat_logic.js`,
`src/menu.js`, `src/shop.js`, or `src/ui.js`). Expand to state, data/rules,
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
- Combat, inventory, equipment, contract, and reward flows remain consistent.
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
