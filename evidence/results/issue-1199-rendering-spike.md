# Issue #1199 — fixed-camera truthful-geometry spike

This evidence records the isolated Phase 1/Phase 2 proof harness. It does not
switch the production renderer and does not claim physical-device readability.

## Candidate profile — freeze gate still pending

The prototype currently uses one candidate profile for all six archetypes and
the deterministic production-backed B1F state. These values must not be called
Frozen until Phase 1 and Phase 2 human visual review both pass:

| value | candidate value |
| --- | ---: |
| cell width | 1.0 |
| cell depth | 2.4 |
| wall height | 2.1 |
| wall thickness | 0.18 |
| start Z | 1.2 |
| eye `(x, y, z)` | `(0, 1.55, 2.3)` |
| look-at `(x, y, z)` | `(0, 0.9, -1.8)` |
| vertical FOV | 100° |
| fog near / far | 4.8 / 15.5 |

The camera is reset to this contract after every topology rebuild. The eye is
inside the current cell and the fixed forward look direction is only about
9° below the horizon; this is a first-person contract, not a 3/4 overhead
composition. The scene
contains only real neighboring cell floor, ceiling, and blocked wall geometry;
there is no side mouth, ramp, raised tongue, fake vestibule, emissive branch
marker, minimap, HUD, or direction label.

The rectangular cell profile is intentional: side-cell placement uses the
current cell's half-width plus the rotated neighbor's half-depth, so the real
floor and ceiling boundaries meet without a raised threshold or inset
vestibule. Shadowing is enabled only for the authored floor, ceiling, and wall
meshes; it is not a branch marker.

## Evidence command

```sh
npx playwright test tests/ui-three-dungeon-spike.spec.js --grep @visual
```

The test attaches six synthetic screenshots at 320, 360, 390, and 430px and
one production-backed screenshot from generated B1F map seed
`ISSUE-1199-B1F-PRODUCTION`, with the minimap and HUD absent from the proof
canvas. The production fixture uses `generateRunFloor` and
`getVisibleCorridorTopology`; it is not a hand-built production substitute.
The representative fixture is fixed at `x=6, y=4, dir=1`; it is not selected
by a readability score at runtime.

## Acceptance disposition

- Phase 1 synthetic six-archetype proof: covered by the dedicated spec and
  pixel screenshots; human visual inspection is required for PASS before
  freezing the profile.
- Phase 2 production-backed B1F proof: covered by the deterministic generated
  fixture and screenshot; human visual inspection is required for PASS before
  freezing the profile.
- Camera/profile/material/topology invariants: structural assertions cover
  fixed camera contract, floor/ceiling bounds, shared-edge continuity, absence
  of walls across shared walkable edges, every blocked frame edge including
  isolated dead ends, and forbidden proxy surfaces.
- Physical-device evidence: unavailable in this environment, so the
  production-readability claim remains unverified.
