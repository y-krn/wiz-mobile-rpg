# Issue #1207 — one-cell-ahead turn / biome silhouette spike

This evidence is an isolated visual spike. It does not change
`src/three_renderer.js`, map generation, movement rules, minimap semantics, or
combat presentation.

## Candidate matrix

The fixed #1199 camera contract remains `(0, 1.8, 3.0)` looking at
`(0, 0.3, -2.4)` with FOV `90°`, `cellWidth 1.2`, `cellDepth 3.2`,
`wallHeight 2.4`, and `wallThickness 0.18`.

Turn candidates apply one global wall-footprint construction to every blocked
wall in the fixture:

| candidate | corner chamfer ratio | disposition |
| --- | ---: | --- |
| square | 0% | baseline; turn remains a narrow slit |
| shallow | 10% | readable, but weaker at 320px |
| medium | 20% | selected |
| strong | 30% | readable, but visually over-heavy at the side opening |

The selected medium rule is a structural chamfer of every wall footprint. It
does not inspect future topology, add a marker, delete a blocked wall, move the
camera, or change materials per branch. Floor geometry remains continuous and
same-height; the renderer-neutral frame still determines every wall surface.

Biome candidates use the same topology and material family:

| candidate | structure | disposition |
| --- | --- | --- |
| flat | 2.4-unit flat ceiling | baseline |
| arch | 1.7-unit spring line with 0.7-unit curved rise | selected |

## Actual-pixel review

The dedicated Playwright spec renders straight, one-cell-ahead left, and
one-cell-ahead right fixtures for all turn candidates, and straight plus both
turn directions for flat/arch. It captures real WebGL canvas pixels at 390px
and 320px, attaches each screenshot, and checks a WebGL pixel checksum in
addition to topology and geometry invariants.

Command:

```sh
npx playwright test tests/ui-three-dungeon-spike-1207.spec.js --grep @visual
```

Review outcome:

- At 390px, medium makes the left and right walkable floor continuation read
  from wall massing/occlusion, while straight remains a forward corridor.
- The same distinction remains visible at 320px.
- Flat and arch are distinguishable by ceiling silhouette and spring line, not
  hue; arch retains a continuous route in both widths.
- The generated B1F fixture retains a near side opening and forward depth under
  the selected medium candidate at both review widths.

The browser screenshots are not physical-device evidence. Physical-device
readability remains unverified in this environment; no production adoption is
claimed by this Spike.

## Acceptance disposition

PASS path: the medium 20% wall chamfer and the arch `springLine 1.7 / rise
0.7` structural rule are the candidates selected for any later production port.
PR #1193 may resume only by porting these exact rules; it must not add camera,
visibility, marker, or helper geometry changes.
