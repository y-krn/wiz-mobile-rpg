# Issue #1220 — PixiJS 2.5D Dungeon View spike

## Decision

**PASS for a bounded prototype; production adoption remains out of scope.**

PixiJS preserves the Canvas screen-space projection/topology grammar and gives a
clearer floor continuity treatment on the reviewed pixels. The candidate is
available only at `?renderer=pixi`; the production default remains Canvas.
Physical-device verification is intentionally deferred to a follow-up issue.

## Provenance

- Base ref: `origin/main`
- BASE_SHA: `7b0b523b908298768ac06e8dbf79af6c5ef76e1f`
- Production-backed seed: `ISSUE-1220-B1F-PRODUCTION`
- Production-backed fixture: `generateRunFloor({ runSeed, floor: 1 })`, B1F position `(6,4)`, facing east
- Primary evidence: 400×260 internal render, minimap hidden
- Reviewed viewport widths: 320, 360, 390, 430
- PixiJS: `8.19.0` (v8 `Application.init`, no external textures/plugins)

## Canvas / Pixi A/B pixels

These are the same synthetic state and 390px viewport. The complete width and
archetype matrix is emitted by `ui-pixi-dungeon-spike-1220.spec.js`.

| state | Canvas baseline | Pixi candidate |
| --- | --- | --- |
| straight | [canvas](./issue-1220-pixi/canvas-straight-390.png) | [pixi](./issue-1220-pixi/pixi-straight-390.png) |
| left turn | [canvas](./issue-1220-pixi/canvas-left-turn-390.png) | [pixi](./issue-1220-pixi/pixi-left-turn-390.png) |
| cross junction | [canvas](./issue-1220-pixi/canvas-cross-390.png) | [pixi](./issue-1220-pixi/pixi-cross-390.png) |

Production-backed B1F evidence:

- [minimap hidden](./issue-1220-pixi/pixi-production-b1f-minimap-hidden-390.png)
- [minimap visible coexistence](./issue-1220-pixi/pixi-production-b1f-minimap-visible-390.png)

Combat evidence:

- [trio / target-selection / danger](./issue-1220-pixi/pixi-combat-trio-target-danger.png)

## Review results

| gate | result |
| --- | --- |
| six archetypes at all four widths | PASS — straight, dead-end, left, right, T, cross use shared topology facts and render at 320/360/390/430 |
| floor continuity | PASS — walkable floor polygons follow the Canvas projection, including side cells |
| side-passage semantics | PASS — no fake opening marker; side passages are floor/open-space surfaces |
| route dominance / occlusion | PASS — low-alpha enhancement layers stay below wall/opening strokes |
| flat biome | PASS — B1F production fixture and synthetic matrix |
| arch biome | PASS — B6 representative uses the existing `ceilingStyle: "arch"` signature |
| production B1F near side opening | PASS — generated map has side opening and forward depth; minimap-hidden pixel reviewed |
| danger cue | PASS — restrained red pulse; queued combat threats use amber rings |
| combat single / pair / trio | PASS — shared `getCombatMonsterLayout` staging |
| target selection / hit region | PASS — candidate returns target index `1` at the shared hit-region center |
| minimap hidden / visible | PASS — shared overlay remains separate and coexists with Pixi canvas |
| one-way barrier | PASS — shared `frontOneWayBarrier` fact and restrained barrier chevrons |
| resize / orientation boundary | PASS — 400×260 internal canvas remains stable across 320→430→320 viewport changes |

## Enhancement evaluation

- Floor depth shading: **adopted in spike**. It makes forward/side walkable
  continuity more legible without changing the silhouette.
- Biome/environment tint: **adopted in spike**. Low-alpha tint differentiates
  flat and arch/materially different biomes without becoming a route cue.
- Danger pulse: **adopted in spike**. Localized and restrained; no bloom, blur,
  noisy particles, neon route marker, or fake opening marker.

## Cost and lifecycle

Build measured against a clean `origin/main` archive with the same Vite build:

- Canvas baseline default bundle: `1,158.22 kB` raw / `367.55 kB` gzip
- Pixi candidate default bundle: `1,159.66 kB` raw / `368.15 kB` gzip
- Default-path impact: `+1.44 kB` raw / `+0.60 kB` gzip
- Lazy Pixi chunk: `236.44 kB` raw / `68.90 kB` gzip, loaded only by the opt-in route
- Initialization sample in Chromium: `23.6 ms`
- Repeated draw sample: 49 scene children, 2 redraws; max-child bound asserted
- Resource ownership: scene children are destroyed on rebuild; `Application`
  is destroyed with `removeView: false`; no generated textures or external
  assets are allocated

## Known limitations

- Browser pixels are not physical-device evidence; iPhone verification remains
  a separate gate.
- Pixi combat silhouettes are a compact prototype treatment, not a sprite or
  texture migration.
- The spike does not alter the default renderer, gameplay rules, minimap
  semantics, HUD/CSS, or target index semantics.

## Reproduction

```sh
npx playwright test tests/ui-pixi-dungeon-spike-1220.spec.js --grep @smoke
npm run build
npm run lint
```
