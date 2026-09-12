# Issue #1230 PixiJS 2.5D visual-impact spike

## Decision

**PASS — PixiJS provides a clearly stronger visual/game-feel result than Canvas while preserving navigation readability.**

This is a browser spike only. Canvas remains the production default, `?renderer=pixi` remains opt-in, and physical-device review plus production adoption are separate gates.

## Provenance

- Issue: [#1230](https://github.com/y-krn/wiz-mobile-rpg/issues/1230)
- Base ref: `origin/main`
- `BASE_SHA`: `29cfd914320e29e553d5082f3d4045744f6607e7`
- Worktree: `/Users/ottan/.codex/worktrees/5e7fdca2-2518-4501-bc9d-715ccd1ad99d/wiz-mobile-rpg`
- Branch: `issue/1230-pixi-visual-impact`
- `HEAD_SHA`: final PR head is recorded in the pull request; the artifact is generated from this branch head
- Latest-main relation: branch started at the fetched `origin/main` above; no later main change was observed during implementation
- PixiJS: `8.19.0`
- Production default: Canvas; Pixi is still lazy and only selected by `?renderer=pixi`

## Implemented candidate

- Motion: 180ms forward/backward projection snapshot transition with scale + translation; 170ms left/right sweep with restrained rotation illusion and far/floor/wall differential motion; 320ms combat-entry actor reveal; localized hit pulse, target ring pulse, queued-threat pulse, deterministic damage text, and restrained danger cue.
- Material: procedural floor bands, depth-aligned floor seams, wall bands/edge wear, and arch-specific wall treatment. No external textures or generated textures are allocated.
- Atmosphere: eight named semantic layers (`background`, `far-environment`, `floor`, `structural-walls`, `environment-fx`, `actors`, `combat-fx`, `overlays`), horizon fog, localized horizon glow, five deterministic low-alpha dust motes, and subtle arch shafts.
- Projection/topology: unchanged shared `getProjectionPlanes`, `getProjectionColumn`, `getVisibleCorridorTopology`, and `RendererInput` boundary. No camera, FOV, eye position, world-space mesh, or topology manipulation was added.
- Gameplay: no gameplay rule, target index, hit region, minimap, one-way barrier, or state mutation semantics changed.

## Actual-pixel evidence

| evidence | artifact |
| --- | --- |
| Canvas straight baseline, 390px | [canvas-straight-390.png](issue-1230-pixi/canvas-straight-390.png) |
| Pixi straight, 390px | [pixi-straight-390.png](issue-1230-pixi/pixi-straight-390.png) |
| Canvas production B1F, 390px | [canvas-production-b1f-390.png](issue-1230-pixi/canvas-production-b1f-390.png) |
| Pixi production B1F, 390px | [pixi-production-b1f-390.png](issue-1230-pixi/pixi-production-b1f-390.png) |
| Pixi flat biome | [pixi-flat-biome-390.png](issue-1230-pixi/pixi-flat-biome-390.png) |
| Pixi arch biome | [pixi-arch-biome-390.png](issue-1230-pixi/pixi-arch-biome-390.png) |
| Pixi combat entry / hit / danger / target | [pixi-combat-entry-hit-danger-390.png](issue-1230-pixi/pixi-combat-entry-hit-danger-390.png) |
| Pixi minimap coexistence | [pixi-production-b1f-minimap-390.png](issue-1230-pixi/pixi-production-b1f-minimap-390.png) |

Motion frame sequence:

- [forward mid](issue-1230-pixi/pixi-forward-mid-390.png) → [forward end](issue-1230-pixi/pixi-forward-end-390.png)
- [left turn mid](issue-1230-pixi/pixi-left-turn-mid-390.png)
- [right turn mid](issue-1230-pixi/pixi-right-turn-mid-390.png)

The A/B and motion artifacts were generated from deterministic synthetic states. Production-backed B1F uses `generateRunFloor({ runSeed: "ISSUE-1230-B1F-PRODUCTION", floor: 1 })`, position `(6,4)`, facing east; the topology probe confirmed a near side opening and forward depth.

## Acceptance results

| gate | result | evidence |
| --- | --- | --- |
| six archetypes: straight, dead-end, left, right, T, cross | PASS | all six rendered at 320/360/390/430; shared topology facts retained |
| navigation readability | PASS | floor continuity, side-passage semantics, route dominance, and opening/occlusion silhouette remain projection-owned |
| production-backed B1F | PASS | deterministic generated map, near side opening, surrounding walls, forward depth |
| biome identity | PASS | flat and arch differ in wall shape, floor/material bands, arch treatment, and atmosphere |
| motion | PASS | 180ms forward; 170ms left/right sweep; combat entry and hit frames captured |
| combat single/pair/trio | PASS | layout count `[1,2,3]`; trio target mapping returned original index `1` |
| target selection / hit region | PASS | shared `getCombatMonsterLayout` hit region and Pixi client conversion |
| danger / queued threat | PASS | localized danger pulse and queued-threat ring, no route neon |
| minimap hidden/visible | PASS | Pixi canvas and existing DOM minimap coexist |
| resize/orientation widths | PASS | 320/360/390/430 matrix; internal canvas remains 400×260 |

## Performance and lifecycle

Chromium proxy, current implementation:

- initialization: `21.9–25.0ms`
- repeated render max: `4.8–9.6ms`
- repeated transition probe: 20 transitions / 44 renders, scene child count fixed at 8, max child count 8
- generated textures: 0; filters: 0; renderer-owned listeners: 0
- create/dispose: 5/5 disposed successfully
- bundle: default app `796.73 kB` raw / `249.92 kB` gzip; lazy Pixi chunk `243.76 kB` raw / `71.08 kB` gzip; no added assets

## Rejected candidates

- fade-only navigation: rejected because it did not prove spatial continuity
- full-screen bloom/blur, noisy particle field, constant full-screen animation, and neon route highlighting: rejected for readability/performance risk
- external texture pack: rejected for this spike; procedural material was sufficient and keeps lifecycle ownership bounded

## Verification

- `npm run test:unit:full`: PASS, 201 passed / 0 skipped
- `npx playwright test tests/ui-pixi-dungeon-spike-1230.spec.js --grep @smoke`: PASS, 5/5
- existing #1220 Pixi smoke: PASS, 4/4 after renderer changes
- `npm run lint`: PASS
- `npm run build`: PASS
- `npm run test:browser`: PASS, 82/82 serial
- `npm run test:browser:parallel`: PASS, 82/82 with 2 workers
- `git diff --check`: PASS

## Adoption recommendation

Do not switch production default in this Issue. Keep Pixi opt-in and proceed to production adoption only after a separate physical-device gate confirms the current-head B1F state on iPhone. Browser evidence is sufficient for this spike's PASS, not for production adoption.
