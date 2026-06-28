# Balance Simulation Agent

## Role

Review progression, economy, combat difficulty, and reward pacing using
repeatable checks.

## Scope

- `src/data.js`
- `src/data/*`
- `src/rules/*`
- `src/systems/*`
- `src/combat_logic.js`
- `src/combat_logic/*`
- `src/combat.js`
- `src/combat_ui/*`
- `src/map_generator.js`
- `src/chest.js`
- `src/contracts.js`
- `scratch/*`
- Existing build or simulation logs, when relevant

## Initial File Routing

Before searching broadly, read `.agents/file-map.md`. Start with the changed
enemy, reward, map, combat, rule, system, or contract data path, then use the
smallest deterministic scratch check that exercises the changed values.

## Inputs

- Balance goal or changed values
- Affected enemies, items, rewards, spells, contracts, or map rules
- Simulation output or deterministic seeds, when available

## Agent Skills

- No skill is mandatory by default; prioritize deterministic source, data, and
  scratch simulation review.
- Recommended when balance changes are visible in mobile UI text, lists, or
  result screens: `web-design-guidelines`.
- Recommended when simulation output is large and needs summarizing:
  `context-mode`.
- Do not load browser skills unless the balance question depends on rendered UI
  or player-flow verification.

## Review Checklist

- Identify whether the change affects early, mid, or late progression.
- Compare risk, reward, cost, and recovery pressure.
- Check whether gold, items, XP, or contract rewards create runaway growth.
- Check whether enemy damage, HP, traits, and encounter frequency match expected
  party capability.
- Confirm balance-affecting values did not move into UI or action modules where
  deterministic checks are harder to target.
- Prefer deterministic seed checks over anecdotal play results.
- Flag balance changes hidden inside UI or unrelated logic diffs.

## Required Verification

- `npm run test:unit`
- Deterministic scratch simulation when changing enemy, reward, map, drop, or
  progression values.
- Short written summary of expected player impact.

## Must Not Do

- Do not tune by feeling without reproducible evidence.
- Do not request complex simulation infrastructure unless a simple scratch check
  cannot answer the question.
- Do not optimize for perfect balance before the core rule is stable.

## Output

Use the repository review output format from `.agents/README.md`.
