# Issue #1199 — fixed-camera truthful-geometry spike

This evidence records the isolated Phase 1/Phase 2 proof harness. It does not
switch the production renderer and does not claim physical-device readability.

## Frozen profile

The prototype uses one profile for all six archetypes and the deterministic
production-backed B1F state:

| value | frozen value |
| --- | ---: |
| cell width | 1.8 |
| cell depth | 1.8 |
| wall height | 2.2 |
| wall thickness | 0.12 |
| start Z | 1.0 |
| eye `(x, y, z)` | `(0, 1.1, 1.25)` |
| look-at `(x, y, z)` | `(0, 0.56, -2.7)` |
| vertical FOV | 130° |
| fog near / far | 4.8 / 15.5 |

The camera is reset to this contract after every topology rebuild. The scene
contains only real neighboring cell floor, ceiling, and blocked wall geometry;
there is no side mouth, ramp, raised tongue, fake vestibule, emissive branch
marker, minimap, HUD, or direction label.

The square cell profile is intentional: a 90° neighboring cell shares the
same edge length, so side-branch floor and ceiling boundaries meet the current
cell without a raised threshold or inset vestibule.

## Evidence command

```sh
npx playwright test tests/ui-three-dungeon-spike.spec.js --grep @visual
```

The test attaches six synthetic screenshots at 320, 360, 390, and 430px and
one production-backed screenshot from generated B1F map seed
`ISSUE-1199-B1F-PRODUCTION`, with the minimap and HUD absent from the proof
canvas. The production fixture uses `generateRunFloor` and
`getVisibleCorridorTopology`; it is not a hand-built production substitute.

## Acceptance disposition

- Phase 1 synthetic six-archetype proof: covered by the dedicated spec and
  pixel screenshots; human visual inspection is required for PASS.
- Phase 2 production-backed B1F proof: covered by the deterministic generated
  fixture and screenshot; human visual inspection is required for PASS.
- Camera/profile/material/topology invariants: structural assertions cover
  fixed camera contract and forbidden proxy surfaces.
- Physical-device evidence: unavailable in this environment, so the
  production-readability claim remains unverified.
