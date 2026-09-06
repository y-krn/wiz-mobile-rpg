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

## Checklist ownership

`.agents/game-logic.md` defines durable domain invariants: what must remain
true. `.agents/qa-regression.md` defines verification strategy: how to prove
those invariants and cover relevant failure classes. `.agents/balance-simulation.md`
defines durable balance principles and claim/evidence boundaries. The
conditional `.agents/skills/balance-simulation/SKILL.md` defines how to perform
a measurement; source, manifests, scripts, and tests own the current executable
contract and exact scenario inventory.

## Static check ownership

`npm run lint:docs` checks inline project-path references and source-driven
design-document coverage. `npm run lint:markdown` checks Markdown link
destinations, including the repository-root-relative convention used by
evidence reports; it does not duplicate the inline-code or design-canon checks.
`npm run lint:tests` checks Playwright naming and domain-entrypoint ownership
rules from the current test files.
`npm run lint:workflow` parses every GitHub Actions workflow and validates its
basic `name`/`on`/`jobs`/step shape before CI runs.

## Canon and review-checklist ownership

Design canon answers what the game is intended to mean and feel like: player
experience, domain semantics, and durable constraints. It does not record the
current migration stage, implementation progress, or historical sequencing.
Source/tests define how the intent is implemented; Issues, pull requests, and
Git history define progress and history.

Review checklists answer how to inspect a change through one lens. They should
state review questions and routing rules without restating the whole design
canon. Load a design document only when the changed area touches its durable
meaning.

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
- `game-design-combat-model.md`: physical and offensive-spell model structure,
  application order, counterplay, and combat information disclosure. Executable
  values remain in source and tests.
- `game-design.md`: economy meaning for materials, resource ownership, status
  counterplay, milestone merchants, run quests, and future possibility space.
- `game-design-equipment-builds.md`: the Core/Support build model, equipment
  knowledge, hands and Guard trade-offs, and horizontal supply principles. The
  authoritative affix data boundary is `src/data/affixes.js`.

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
