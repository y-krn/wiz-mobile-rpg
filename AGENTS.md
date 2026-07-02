# Project Agent Instructions

AGENTS.md is the canonical instruction file for this repository. Tool-specific
files may point here, but should not duplicate these rules.

## Response Style

- Start with the conclusion.
- Do not use greetings, preambles, or emoji.
- Keep implementation notes, decisions, and verification results concise.
- Ask before proceeding when success criteria or requirements are unclear.

## Context and Search Order

- Before broad repository searches, read `.agents/file-map.md`.
- Use `.agents/file-map.md` to choose the smallest relevant source, test, and
  review files for the requested change.
- Start from directly relevant files, direct imports, touched files, and listed
  verification targets.
- Do not read `dist`, `node_modules`, `test-results`, or `*.log` unless the task
  requires it. When logs are needed, inspect only the tail or error area.
- Sub-agent definitions live in `.agents/*.md`; they are review-only unless the
  user explicitly changes that mode.

## Tool and Execution Policy

- Use applicable Agent Skills when the task clearly matches one.
- Use `tmux` for long-running commands, dev servers, watchers, and parallel
  verification that should keep logs.
- Safe commands may be run without extra confirmation: reads, searches, diffs,
  builds, tests, and dev server startup.
- Ask first before destructive or high-risk operations: `rm`, `git reset`,
  `git clean`, `git checkout --`, broad `mv`, dependency installation, external
  scripts, deployment, and production operations.
- Prefer explicit allowlists, sandboxing, and tool permissions for enforcement.
  Treat this file as behavioral guidance, not a security boundary.
- Make file edits with clear diffs.

## Engineering Policy

- Match existing code structure, naming, and style.
- Keep changes limited to the user's requested behavior.
- Prefer the simplest implementation that satisfies the goal.
- Avoid one-off abstractions, speculative configuration, and unrelated cleanup.
- Remove imports, variables, and functions made unused by your own changes.
- Do not remove unrelated dead code unless asked.

## Think Before Coding

For implementation work, state the working assumptions and success criteria
before editing. For multi-step tasks, use this plan format:

1. [work item] -> verify: [verification method]
2. [work item] -> verify: [verification method]
3. [work item] -> verify: [verification method]

If multiple interpretations are plausible, ask instead of choosing silently.

## Verification

- After implementation, run the narrowest meaningful checks.
- For UI-affecting changes, run `npm run build` and `npm run test:browser` when
  feasible.
- For logic or state changes, run `npm run test:unit` or the matching focused
  test when feasible.
- Report any skipped verification and the reason.

## Mobile UI/UX Requirements

Mobile browser one-handed use is a hard requirement for UI work.

- Place primary actions near the lower thumb-reachable area.
- Keep selection, confirmation, and execution flows visually and physically
  close.
- Make current state, selected target, and next action clear at a glance.
- Put frequent actions lower and closer together.
- Place back, close, delete, and clear actions to reduce accidental taps.
- Keep tap targets at least 44px where practical.
- Avoid horizontal scrolling and overly precise tap targets.
- Keep list, tab, filter, and execute-button flows connected.
- Consider rapid tapping, accidental zoom, and scroll interference in mobile
  browsers and PWA contexts.

## UI Change Gate

This gate applies to:

- `src/ui.js`, `src/ui/*`
- `src/menu.js`, `src/menu/*`, `src/navigation.js`
- `src/shop.js`, `src/shop/*`
- `src/combat.js`, `src/combat_ui/*`
- `src/training.js`, `src/equip.js`, `src/camp.js`, `src/spell_menu.js`
- `src/contracts.js`, `src/chest.js`, `src/result.js`
- `src/style.css`, `src/styles/*`
- `tests/ui-ux.spec.js`, `playwright.config.js`

Before editing UI:

1. Use `.agents/file-map.md` to identify the smallest file set.
2. Read `.agents/mobile-ui-ux.md` when the interaction, layout, or tap flow is
   materially affected.
3. Read `.agents/qa-regression.md` when browser or E2E regression risk is
   material.
4. If UI also changes game rules, balance, or content text, read the matching
   `.agents/*.md` review definition.

After editing UI:

1. Run `npm run build`.
2. Run `npm run test:browser`.
3. If logic or state changed, also run `npm run test:unit` or `npm run test`.
4. When feasible, verify primary flows at 360x800, 390x844, and 430x932.

## Sub-Agent Review

Use review-only sub-agents only when their added scrutiny is worth the cost.

- `qa-regression`: tests, reproduction, regression risk, release checks.
- `mobile-ui-ux`: UI, CSS, transitions, tap operation, mobile display.
- `game-logic`: combat, exploration, state, map generation, equipment, spells,
  contracts, and other game rules.
- `balance-simulation`: enemies, rewards, drops, growth, economy, difficulty,
  and progression speed.
- `content-design`: items, enemies, spells, contracts, descriptions, and display
  text.

Call sub-agents for explicit review requests, broad multi-file behavior changes,
high-risk UI/mobile changes, or game-balance changes. Skip them for small text,
comment, local bug, test expectation, or import/export-only changes that are
verified directly.

When reporting sub-agent use, include:

1. Called sub-agents.
2. Adopted findings.
3. Rejected findings and why.
4. Verification performed.

## Context Hygiene

- Keep always-loaded instructions minimal and durable.
- Put task-specific, path-specific, or reviewer-specific detail in `.agents/*`
  instead of expanding this file.
- Avoid conflicting rules, repeated lint/test instructions, and tool-specific
  details that do not apply across agents.
