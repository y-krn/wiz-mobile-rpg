# Golden Journeys baseline

## Baseline identity

- Issue: #1225
- Source: `origin/main`
- Baseline SHA: `29cfd914320e29e553d5082f3d4045744f6607e7`
- SHA verification: `git fetch origin main` completed before implementation; the assigned worktree was then branched from this SHA.
- Baseline date: 2026-09-13 (Asia/Tokyo)
- Browser evidence: Playwright 1.61.0 / Chromium 1228
- Supported viewports: `320x568`, `360x800`, `390x844`, `430x932`
- Primary visual baseline: `390x844`; `320x568` is mandatory for vertically constrained flows.

This is a current-main observation record, not a production redesign. The new
checks preserve existing semantic, geometry, 44px, safe-area, and renderer
spike tests.

## Baseline findings

1. Existing screen-level UI coverage is strong: mobile reachability, safe-area,
   geometry, combat target cancellation, inventory ownership, portal/Wing
   settlement, result semantics, and preparation scrolling already have owning
   tests.
2. The missing quality layer was the connection between those tests. There was
   no one registry declaring the ten player journeys, their owner, fixture,
   viewport policy, renderer classification, or player-facing invariant.
3. Input evidence was not normalized. Tap count, Back/Cancel, Confirm, state
   steps, pending/disabled state, and duplicate activation were each checked in
   different tests or not recorded together.
4. Stable DOM/CSS surfaces had no pixel baseline owned by a Golden Journey
   entrypoint. Dungeon View must not fill that gap with a Canvas-specific
   screenshot contract while PixiJS work is active.
5. The focused baseline did not show a new renderer-independent production UX
   defect. The actionable result is infrastructure: connect the existing
   owner tests and make the missing journey evidence visible.

## Ten-journey coverage

The executable registry is `tests/golden-journeys.js`. Each row below names the
owner and entry point rather than duplicating specialized behavior.

| # | Journey | Fixture / entry point | Viewport policy | Renderer class | Baseline evidence / friction |
|---|---|---|---|---|---|
| 1 | Fresh start → starting kit → B1F | `tests/ui-ux-helpers.js:startSoloRun`; `tests/ui-mobile.spec.js`; `tests/ui-departure.spec.js` | 320 short + 390 representative | A | 4 primary taps, 0 Back/Cancel, 2 commit-classified taps; kit/floor choice and Explore arrival are visible. |
| 2 | Explore → encounter → Combat → result → Explore | `tests/departure-flow.cases.js`; `tests/ui-dungeon.spec.js`; `tests/ui-pending-rewards.spec.js` | 390 representative + 320 combat shell | B | Deterministic encounter and pending outcome owner tests exist; journey-level count/continuity evidence was previously fragmented. |
| 3 | Combat → spell/item/target → Back → reselect | `tests/combat-target-ui.cases.js`; `tests/ui-dungeon.spec.js` | All supported widths | B | Fresh focused path records 2 primary taps and 1 Back/Cancel; action count remains 0 after Back and target selection can reopen. |
| 4 | Loot → inspect/compare → equip / keep / discard | `tests/ui-loadout-transaction.spec.js`; `tests/ui-loot-bag.spec.js` | 390 representative + 320 touch geometry | A | Current/proposed build and ownership are readable; draft changes remain uncommitted until the explicit commit. |
| 5 | Bag full → replacement → commit / cancel | `tests/ui-loadout-transaction.spec.js`; `tests/ui-pending-rewards.spec.js` | 320 required + 390 representative | A | Capacity and replacement consequence are covered; cancel path preserves live inventory. |
| 6 | Chest / Trap → inspect → decision → result | `tests/chest-actions.cases.js`; `tests/chest-trap.spec.js`; `tests/ui-mobile.spec.js` | 320 required + 390 representative | B | Inspect-before-decision and trap result paths exist; Dungeon rendering remains semantic-only here. |
| 7 | Portal → Push / Return → confirmation → resolution | `tests/ui-portal-wing.spec.js`; `tests/ui-result-town-vnext.spec.js` | All supported widths | A | Equal Push/Return choice geometry, consequence confirmation, and one-way resolution are covered. |
| 8 | Wing → rescue selection → commit | `tests/ui-portal-wing.spec.js` | 390 representative + 320 follow-up gate | A | Candidate set, selection limit, equipped loot, and safe cancel are covered. |
| 9 | Death / Return → Result → Town | `tests/death-cause.spec.js`; `tests/ui-result-town-vnext.spec.js`; `tests/ui-castle-adventure.spec.js` | 320 required + 390 representative | A | Death cause, retained record, lost dungeon loot, and Town transition are separately readable. Manual fresh-B1F retry hypothesis remains #1217-owned. |
| 10 | Town → preparation → next run | `tests/ui-result-town-vnext.spec.js`; `tests/ui-departure.spec.js`; `tests/ui-town-submenu.spec.js` | 320 required + 390 primary visual | A | Town context and 20-slot preparation conditions are covered; no recommendation or gameplay rule was added. |

Classes are deliberately player-facing: A is renderer-independent UX, B is a
renderer-shared contract, and C is renderer-specific visual implementation.
There are no Class C changes in this Issue.

## Recorded contracts

- Back/Cancel abandons an uncommitted choice. It does not undo movement,
  attacks, item use, or another action already applied to world state.
- A critical tap is observable as an input/result transition; a pending or
  disabled state remains distinct from a completed state where the surface has
  one.
- Selection, scroll context, and pending intent are part of the evidence
  record. A silent reset is a failure even when the next screen is visually
  valid.
- Repeated commit activation is treated as one action. The focused test sends
  two commit events and observes exactly one exploration step and one equipment
  transfer.
- A stable screenshot may cover a DOM/CSS-owned surface. It must not require
  Canvas, PixiJS, Three.js, wall/floor material, fog, lighting, or renderer
  motion to remain pixel-identical.

## Visual evidence

The following committed snapshots are owned by
`tests/ui-golden-journeys.spec.js` and compare only stable surfaces:

- `tests/ui-golden-journeys.spec.js-snapshots/golden-town-390-darwin.png`
- `tests/ui-golden-journeys.spec.js-snapshots/golden-preparation-390-darwin.png`
- `tests/ui-golden-journeys.spec.js-snapshots/golden-result-390-darwin.png`

Explore, combat, target selection, danger cues, passage readability, fog,
lighting, monster appearance, and renderer-specific motion remain semantic or
renderer-owned evidence. Existing Canvas/Pixi comparison artifacts remain in
`evidence/results/issue-1220-pixi/`; future visual-impact findings belong to
#1230, while the Three.js readability scope remains #1181.

## Follow-up ownership

- No new production child Issue was created from this baseline. The focused
  baseline found quality-infrastructure gaps, not a newly isolated
  renderer-independent defect.
- Accessibility journey gates belong to #1226.
- Minimal UX friction telemetry belongs to #1227; this change does not add
  clickstream or gameplay telemetry.
- Token/surface/motion drift belongs to #1228.
- Direct target-selection presentation remains #1133-owned.
- Fresh B1F manual death/retry evidence remains #1217-owned.
- Renderer-specific findings, if later observed, must be sent to #1230 or the
  appropriate renderer adoption follow-up and must not become a #1225 pixel
  baseline.

## Verification record

The focused entrypoint passes with six tests:

```text
npx playwright test tests/ui-golden-journeys.spec.js
6 passed
```

Also passed:

```text
npm run lint:tests
Playwright test ownership OK
```

The first local build attempt ran before the browser dependency preflight had
restored the lockfile-installed Pixi package and therefore reported an import
resolution error. The existing dependency preflight then restored it without a
tracked source change. The final build completed successfully; its only output
was the existing large-chunk warning. The focused tests do not select Pixi as a
#1225 visual contract.
