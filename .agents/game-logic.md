# Game Logic Agent

## Role

Review game mechanics for correctness, maintainability, and compatibility with
existing state and data structures.

## Scope

- `src/combat.js`
- `src/combat_logic.js`
- `src/map_generator.js`
- `src/movement.js`
- `src/state.js`
- `src/data.js`
- `src/contracts.js`
- `src/chest.js`
- `src/equip.js`
- `src/spell_menu.js`
- `src/game.js`

## Inputs

- Intended rule or mechanic change
- Changed files or planned diff
- Existing save/state shape, when relevant
- Test output or reproduction seed, when relevant

## Review Checklist

- Rules match the stated design goal.
- State mutations are localized and predictable.
- Existing save data shape is preserved or migration risk is explicitly handled.
- Random behavior is deterministic when seeded tests require it.
- Combat, inventory, equipment, contract, and reward flows remain consistent.
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

