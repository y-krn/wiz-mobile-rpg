---
name: three-dungeon-rendering
description: Use when implementing or reviewing the Three.js Dungeon View, including topology, camera/FOV, fog, geometry, materials, combat staging or targeting, mini-map coexistence, visual regression, performance, or resource lifecycle changes.
---

# Three.js Dungeon View workflow

Use this skill for changes touching `src/three_renderer.js`, renderer topology
or `RendererInput` projection, Three.js combat staging/targeting, the shared
mini-map overlay, Canvas-to-Three presentation parity, or related visual,
performance, and lifecycle reviews. Do not use it for generic Three.js
tutorials or rule-only combat, balance, or reachability work; route those to
the matching existing Skill.

Read `.agents/rendering-three-dungeon.md` first. Load
`.agents/mobile-ui-ux.md`, `.agents/qa-regression.md`, and, when a final review
or PR is involved, `.agents/merge-gate.md` as needed. Keep durable rendering
knowledge in the reference document and exact constants/scenarios in source or
tests.

## 1. Establish the revision

- Read the target Issue and measurable acceptance criteria.
- Record `BASE_SHA` and `HEAD_SHA`; verify the chosen `origin/main` base is
  fresh before relying on its relationship to the change.
- Identify the changed renderer boundary and its direct callers/tests from
  `.agents/file-map.md`.
- Keep gameplay ownership in the state/rules/action modules; the renderer
  consumes a presentation-safe `RendererInput`.

## 2. Classify risk and choose fixtures

Mark every applicable category before testing:

- topology / geometry;
- camera / FOV / eye/look-at / corridor profile;
- lighting / material / fog;
- combat staging / targeting;
- mini-map / overlay coexistence;
- resource lifecycle;
- mobile performance / bundle.

Apply every mandatory row below for each touched category; the rows are
additive, so a camera change also runs the combat and danger checks listed in
its row. This coupling is intentional: prior regressions crossed these
presentation boundaries.

| Touched category | Mandatory fixtures/checks |
| --- | --- |
| camera / FOV / eye/look-at / corridor profile | six topology archetypes at 320, 360, 390, and 430 px; single/pair/trio combat staging with target-selection visuals; danger cue; one-way barrier; mini-map coexistence; orientation/resize |
| topology / side opening / corridor geometry | six topology archetypes; one-way barrier; mini-map coexistence; combat staging and front-wall occlusion |
| lighting / material / fog | six topology archetypes; combat label/marker legibility; danger cue and one-way visual legibility |
| combat staging / hit region / target selection | single enemy, pair, trio; actual tap to each original target index; Back/cancel path when the selection flow is touched |
| mini-map / overlay coexistence | exploration visible and non-exploration hidden states, with canvas input unaffected |
| resource lifecycle | repeated scene rebuild with geometry/material/texture disposal evidence |
| mobile performance / bundle | browser proxy timing, long-frame/resource checks, and bundle impact when relevant |

For topology/camera/geometry rows, the six archetypes are straight corridor,
dead end, left turn, right turn, T junction, and cross junction. Inspect primary
evidence with the mini-map hidden and repeat a coexistence case with it visible.
For biome geometry/material changes, include one representative B1 case and one
materially different arch/biome case. For target-selection changes, direct tap
is primary; retain an equivalent accessibility alternative when needed without
fixing its implementation to a visible enemy target list. Do not reintroduce
visible enemy target buttons into the normal visual UI.

Use the actual fixture names and executable bounds from current source/tests;
do not duplicate them as durable constants in this Skill.

## 3. Verify the rendered contract

- Confirm topology facts come from `src/rules/renderer_topology.js`: current
  cell, forward depth, left/right world orientation, closed walls, and open but
  one-way-blocked entrances.
- Confirm camera/FOV/aspect changes with projected screen-space evidence, not
  world-unit assertions alone.
- Confirm floors carry path depth, openings read as volume, near topology is not
  fog-masked, and wall/ceiling tones preserve hierarchy.
- Confirm combat bodies, labels, and markers remain in frame and separated for
  1/2/3 enemies; confirm the front-wall occlusion relationship and direct tap
  mapping to the correct target index. If the selection flow is touched,
  confirm Back/cancel abandons the uncommitted target without a world action.
- Confirm any accessibility alternative preserves equivalent target selection
  when needed without requiring a visible enemy target list.
- Confirm danger cue placement and the shared mini-map visibility and input
  contract.

For every visual claim, capture the actual rendered artifact and inspect its
pixels. `getThreeProjectedBounds()` and topology/math assertions are supporting
evidence; test PASS alone cannot establish readability, non-overlap, or route
legibility.

## 4. Check lifetime and performance

For scene rebuild/replacement changes, inspect ownership and release of
geometries, materials, textures/`CanvasTexture`, and renderer-owned resources.
Use repeated rebuilds with `dispose()` spies or `renderer.info` when useful.

When complexity increases, measure browser proxy timing and long frames, check
renderer resource growth, and inspect bundle impact when relevant. Do not call
browser emulation physical-device evidence; record that limitation and route a
real-device claim to the appropriate follow-up.

## 5. Close out at current HEAD

- Run focused tests first, then the required current-head checks from
  `.agents/qa-regression.md` and `.agents/merge-gate.md`.
- Run `npm run lint:docs` and `npm run lint:markdown` for documentation/workflow
  changes; include build, unit, or browser gates when the touched boundary
  requires them.
- Preserve a successful screenshot artifact and inspect it before claiming
  visual acceptance.
- Check unresolved review threads, current `HEAD_SHA`, latest-main relation,
  and the merge-gate verdict. Re-run invalidated checks after any content
  change.

Existing Skills retain their ownership: use `balance-simulation` for measured
progression/economy claims, `combat-model-change` for combat formula/model
changes, and `gameplay-reachability-audit` for mechanic reachability. This
Skill covers the rendering evidence and workflow boundary around those systems.
