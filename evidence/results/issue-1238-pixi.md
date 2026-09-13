# Issue #1238 PixiJS navigation motion evidence

- BASE_SHA: `10574e38ea363c8069d628483fcd562be96fa4b9`
- captured renderer code HEAD: `d3a26264` (root-transform-free navigation implementation)
- evidence is included in the final PR HEAD; the final browser CI run verifies that HEAD
- renderer: PixiJS `8.19.0`, opt-in with `?renderer=pixi`
- browser: Chromium `@playwright/test 1.61.0`, viewport `390x844`
- physical-device status: not available in Codex; human iPhone review required

## Deterministic actual-motion frames

The PNGs in `issue-1238-pixi/` were captured by
`tests/ui-pixi-navigation-comfort-1238.spec.js` against the captured code
HEAD. Each navigation action has `before`, `mid`, and `after` frames:

- forward: transition duration `100ms`; outgoing/incoming root
  `position=(0,0)`, `rotation=0`, `scale=(1,1)` at mid-frame; root alpha
  `0.62`; layer-local Y shift max `0.062775px`; shake `0`.
- left turn: root `position=(0,0)`, `rotation=0`, `scale=(1,1)` at mid-frame;
  layer-local X shift max `0.062775px`.
- right turn: root `position=(0,0)`, `rotation=0`, `scale=(1,1)` at mid-frame;
  layer-local X shift max `0.062775px`.
- actors, combat-fx, overlays, HUD, and horizon layers remain at local
  `position=(0,0)` during navigation.
- reduced motion: no transition, no shake, no hit animation, no ambient danger
  pulse, and no continuous redraw.
- combat feedback: localized combat FX and damage text with scene position
  `(0, 0)` and shake `0`.

## Lifecycle and performance

The same suite exercised forward ×20, left ×20, right ×20, alternating
left/right ×20, rapid forward+turn replacement, transition replacement,
explicit cancellation, resize ×10, combat feedback ×10, and renderer
create/dispose ×5. Every repeated-navigation root sample remained
`position=(0,0)`, `rotation=0`, `scale=(1,1)`. Latest serial metrics:
initialization/first render `1.3ms`, maximum render `4.9ms`, scene children `8`,
max children `8`, disposed `5/5`.

## Regression coverage

The #1230 Pixi visual/material/biome suite passed `5/5`, including six
topology archetypes at 320/360/390/430px, production-backed B1F side opening,
flat/arch biome, combat target staging, and minimap coexistence.
