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
- Review checklists live in `.agents/*.md`; apply them by reading the matching
  file. They are review-only unless the user explicitly changes that mode.

## Large Output and Log Handling

Avoid loading large command output, logs, or files into context in full. Filter
first, then read only the relevant part.

- Filter at the source. Pipe test, build, and log commands through `grep`,
  `head`, or `tail` so only failures or the relevant region are returned, e.g.
  `npm test 2>&1 | grep -E 'FAIL|Error'` or `git log --oneline -20`.
- Locate before reading. For large files, run `grep -n` (or `grep -rn` across a
  directory) to find the line first, then read only that region with a ranged
  read (offset/limit, `head`, `tail`). Do not open a whole large file to find
  one function.
- Map structure cheaply. To learn a file's shape, `grep -nE` its definition
  lines (e.g. `^(export |function |const |class )`) instead of reading the file
  end to end, then read only the parts you need.
- Honor line references. When the user gives a `file:line` pointer, read that
  region directly and skip the search step.
- Read files in ranges. Prefer partial reads (offset/limit, `head`, `tail`,
  targeted `grep -n`) over reading whole large files.
- Delegate broad searches to a search-only sub-agent when the work fans out
  across many files or directories, or when the volume read greatly exceeds the
  answer returned. Take back the conclusion, not the raw file dumps.
- Do not delegate narrow, context-dependent lookups (one function, a few known
  files); a direct `grep`/ranged read is cheaper than a cold-start sub-agent.
- If a tool offers a summarize-then-return mode for large output, prefer it over
  running a command whose full stdout would land in context.
- For long-running commands, keep logs in `tmux` and inspect only the needed
  slice rather than streaming everything.

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
- After source code changes, always run `npm run lint` and confirm the result.
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

After editing UI, run the checks in `Verification`. Additionally, when feasible,
verify primary flows at 360x800, 390x844, and 430x932.

## Review Checklists

The `.agents/*.md` files are review checklists, not sub-agents registered with
the Agent tool. Apply them by reading the matching file and reviewing against
it; use them only when the added scrutiny is worth the cost.

- `.agents/qa-regression.md`: tests, reproduction, regression risk, release
  checks.
- `.agents/mobile-ui-ux.md`: UI, CSS, transitions, tap operation, mobile
  display.
- `.agents/game-logic.md`: combat, exploration, state, map generation,
  equipment, spells, contracts, and other game rules.
- `.agents/balance-simulation.md`: enemies, rewards, drops, growth, economy,
  difficulty, and progression speed.
- `.agents/content-design.md`: items, enemies, spells, contracts, descriptions,
  and display text.

Each file owns its own scope, checklist, and required verification; do not
restate them here. Apply a checklist for explicit review requests, broad
multi-file behavior changes, high-risk UI/mobile changes, or game-balance
changes. Skip them for small text, comment, local bug, test expectation, or
import/export-only changes that are verified directly.

When reporting checklist use, include:

1. Checklists applied.
2. Adopted findings.
3. Rejected findings and why.
4. Verification performed.

## Context Hygiene

- Keep always-loaded instructions minimal and durable.
- Put task-specific, path-specific, or reviewer-specific detail in `.agents/*`
  instead of expanding this file.
- Avoid conflicting rules, repeated lint/test instructions, and tool-specific
  details that do not apply across agents.
