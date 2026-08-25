# Content Design Checklist

## Role

Review RPG content additions for clarity, theme fit, player motivation, and
implementation cost.

## Scope

- Clarity, theme fit, player motivation, and consistency of player-facing RPG
  content
- Items, enemies, spells, classes, run quests, rewards, events, descriptions,
  labels, and display text
- Implementation cost and interactions with progression, mechanics, balance, and
  mobile presentation

Target files are determined from the relevant rows in `.agents/file-map.md`.

## Biome and depth visual canon

Biome definitions in `src/data/biomes.js` are the canonical source for each
biome's player-facing visual signature: wall/grid colors, dark-environment
backgrounds, glow, aura, and ambient treatment. `src/renderer.js` and
`src/styles/floor-themes.css` consume those values; they must not maintain a
second floor-number or biome-color catalogue.

Biome answers “where am I?” and changes every five floors. Depth answers “how
deep am I?” and is a monotonic corruption axis derived from the preserved
`biomeCycle` plus the position within that cycle. Depth may alter structure,
fracture visibility, and atmospheric intensity, but color alone is not its
sole signal. Wall, floor, route, and mobile readability remain higher priority
than depth effects. This separation changes presentation and terrain shape only;
gameplay quantities, encounter pacing, and balance targets remain governed by
the existing floor-template rules.

### Encounter theme and local-floor reveal

Biome is the enemy theme; local floor is the reveal order. Each biome's
opening floor uses the biome pool without blind- or sleep-capable enemies,
because those threats remove player agency before the first local counterplay
window. They unlock on local floor 2 at the normal pool weight; later depth
weight changes require a measured reason and must not be compensated with
enemy stats or encounter size. This principle applies to every five-floor
biome cycle and keeps early status pressure distinct from the biome's visual
identity.

The biome Visual Signature includes spatial silhouette as well as color and ambient treatment: `corridorWidth`, `ceilingHeight`, `wallLean`, and `ceilingStyle` describe the stable pseudo-3D geometry seen during exploration. The renderer interprets this geometry generically through the shared projection; it must not enumerate biome IDs. Geometry is presentation-only, derived from floor → biome → `visualSignature`, and is not persisted or used by map generation, movement, or balance rules.

### Landmark signature

Biome Signature includes the recurring exploration landmarks that tell the
player why an object exists in that place, not only the corridor geometry and
ambient color. Chests, discovered traps, and stairs retain their functional
silhouette while using biome-specific shapes: a mine uses a rough crate, a
catacomb uses an ossuary coffer and arch, a library uses sealed bookwork, and
the abyss may use an intentionally impossible but still readable stair.

The canonical source is `visualSignature.landmarks` in
`src/data/biomes.js`, with `chestStyle`, `trapStyle`, and `stairsStyle` IDs.
`src/renderer.js` interprets those IDs through shared Canvas 2D drawing
functions and the same projection/depth planes as the corridor. It must not
branch on floor number or biome ID, persist a style ID in save data, or use a
style to reveal an undiscovered trap. Style changes are presentation-only:
chest rewards and actions, trap type/discovery information and effects, stair
movement, spawn rates, and balance remain unchanged.

## Initial File Routing

Before searching broadly, read `.agents/file-map.md`. Start with `src/data.js`
or the relevant `src/data/*` module for gameplay content, and start with the
affected UI/overlay module for visible text. Expand to rules, systems, balance,
or mobile UI files only if the content changes progression, mechanics, or
layout.

## Inputs

- Content proposal or changed data
- Intended player experience
- Target progression point
- Any implementation constraints from the main agent

## Agent Skills

- Required when reviewing player-facing prose, labels, descriptions, or docs:
  `writing-guidelines`.
- Required when content text appears in mobile UI controls, lists, tabs, dialogs,
  or result screens: `web-design-guidelines`.
- Recommended when content affects progression, reward pacing, or difficulty:
  use the `balance-simulation` checklist as an additional review lens.

## Review Checklist

- Content has a clear gameplay purpose.
- Names and descriptions are short enough for mobile UI.
- Rewards match the effort and risk required.
- New content does not require unnecessary systems.
- Terminology is consistent with existing text.
- Text and content rules are not split across facade and concrete modules in a
  way that can drift.
- Additions do not overload the player with too many similar choices.
- Content can be verified with existing tests or a small targeted check.

## Required Verification

- `npm run test:unit` when data affects mechanics.
- `npm run test:browser` when text length or choices affect mobile UI.
- Short impact note covering target player stage and expected behavior.

## Must Not Do

- Do not add lore or flavor that has no gameplay purpose.
- Do not propose large content batches without a clear progression target.
- Do not introduce new terminology when existing terms are enough.
- Do not accept text that is likely to overflow mobile controls.

## Output

Use the repository review output format from `.agents/README.md`.
