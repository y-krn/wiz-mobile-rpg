# Interaction responsiveness evidence — Issue #1259

## Baseline identity

- Issue: #1259
- Baseline source: fetched `origin/main`
- Baseline SHA: `f7420fc2a4b2c4e2ce98a4867c75c2faec7a6842`
- Remote verification: `git ls-remote origin refs/heads/main` matched the fetched `origin/main`
- Final current main after freshness recheck: `e5a1fb638f6d8bd6f7ff5884a203763701d4790b` (`#1252` renderer integration)
- Final remote verification: `git ls-remote origin refs/heads/main` matched `e5a1fb638f6d8bd6f7ff5884a203763701d4790b`
- Implementation branch: `issue-1259-interaction-responsiveness`
- Worktree start SHA: `6bbd07738af3fe60dab18f5627d1ef9192f4cbd0` (managed detached worktree before branching)
- Parent workstreams: #1225, #1226, #1227, and #1228 are completed/closed; PR #1254 for #1228 is merged at this baseline. #1251 remains the renderer owner.
- Browser baseline runner: Playwright 1.61.0, repository Chromium revision 1228, Darwin
- Supported risk viewports: `320x568`, `360x800`, `390x844`, `430x932`

The current lazy architecture is a small loader boundary:
`src/equip.js` → `src/equipment_ui_loader.js` → dynamic `src/equip_ui.js`.
The heavy equipment UI is absent from the initial resource set and is cached
after the first successful import. No renderer, Pixi, Canvas, GPU, FPS, or
navigation-motion implementation is part of this evidence.

## Phase 1 audit — critical transition matrix

The registry in `tests/golden-journeys.js` remains the single Golden Journey
source of truth. The `responsiveness.criticalTransitions` field adds the
responsiveness dimension without creating a second journey registry. The
matrix is risk-based; it does not multiply every action by every viewport.

| Journey / transition | Class | Trigger / execution | First meaningful acknowledgement | Pending | Terminal / rejected resolution | Duplicate risk / Back-Cancel | Owner / manual evidence |
|---|---|---|---|---|---|---|---|
| 1. Fresh start → B1F departure | A | click or Enter; synchronous | Preparation is replaced by Explore controls | none | one run starts; start is disabled before floor selection | old-button replay is rejected outside submenu; Back returns to Town before commit | `ui-golden-journeys.spec.js`; exact-head iPhone smoke pending |
| 2. Combat resolution | B | action commit; async battle-log playback | resolving phase and result log are visible | `transitioning` blocks controls | one result, then Explore or pending reward; unusable combat is rejected | `transitioning` and pending-outcome guards; Back only cancels uncommitted selection | combat/pending-reward owners; renderer pixels remain #1251 |
| 2. Dungeon View startup / first draw | D | enter Dungeon; renderer-owned | renderer-equivalent view | #1251-owned | #1251-owned | not a shared-DOM action | #1251 renderer suites; physical renderer gate pending |
| 3. Target selection | A | Fight → target button/Canvas target; synchronous | target overlay and identity are visible | none | one target enters combat selection | callback and target validation; Back restores combat with zero committed action | `combat-target-ui.cases.js`; Canvas/DOM equivalence manual |
| 3. Invalid target | C | dead/unavailable target input; synchronous rejection | target surface remains visible | none | no action is committed; invalid target is rejected | callback/target validation; Back remains available | `combat-target-ui.cases.js`; keyboard/Canvas manual |
| 4. Equipment open → compare → commit | B | tap/keyboard; lazy open then synchronous draft/commit | cold path says input is accepted and pending; loaded path shows comparison and commit status | only cold lazy load; commit remains draft until explicit confirmation | one loadout transaction and one exploration turn; invalid draft remains live-state-safe | one in-flight loader request and atomic draft commit; cancel drops draft only | `ui-loadout-transaction.spec.js`; cold equipment iPhone pending |
| 5. Full-bag replacement | A | tap/Enter; synchronous draft then commit | capacity and replacement consequence remain visible | none | one replacement or no-op cancel; invalid confirm is unavailable | single loadout transaction; cancel preserves live inventory | loadout/pending-reward owners; `320x568` short-screen review |
| 6. Chest / Trap inspect → resolve | B | tap/Enter; delayed resolution | phase/result text and transitioning state are visible | transition blocks repeat until cleanup | one trap/chest result and one reward lifecycle; phase/character checks reject unavailable actions | phase plus transitioning guards; resolved chest is not reopened by Back | chest/trap owners; reduced-motion playback pending |
| 7. Portal choice → confirm → settlement | A | tap/Enter; synchronous guarded terminal decision | confirmation names the selected consequence | none after settlement starts | one portal decision, settlement, and Result transition | decision is cleared after commit and terminal run guard applies; reselect returns to choices | `ui-portal-wing.spec.js`; iPhone rapid-confirm pending |
| 8. Wing selection → return | A | tap/Enter; synchronous selection and settlement | selected count and candidates are visible | none | one Wing consumption and one settlement; missing Wing/invalid candidate rejects | inventory consumption is the owner boundary; Back preserves loot ownership | `ui-portal-wing.spec.js`; short-screen rapid-tap pending |
| 9. Result → Town | A | tap/Enter; synchronous terminal settlement | outcome and retained/lost state are visible | none after settlement completes | one save/settlement and one Town transition; repeat terminal trigger rejects | `returnReason`/result guard; completed settlement is not undone by Back | result/death owners; physical Result → Town pending |
| 10. Town → preparation → next run | A | tap/Enter; synchronous navigation/start | preparation surface and selected conditions are visible | none | one next-run initialization; start unavailable until required choice | submenu boundary rejects replay after start; Back returns to Town before initialization | departure/town owners; `320x568` short-screen pending |

Class A is synchronous and visibly immediate; B is async/lazy and potentially
perceptible; C is rejected/unavailable; D is renderer-owned. `rendererClass` in
the registry remains the older renderer-boundary classification and is not
overloaded with this interaction classification.

## Async / lazy inventory

| Transition | Actual wait source | Existing/updated contract | Guard |
|---|---|---|---|
| Equipment open | lazy dynamic import of `equip_ui.js` | accepted text is rendered immediately; pending is text-only, `aria-busy=true`, and repeated open returns the same Promise | deterministic injected Promise in `ui-loadout-transaction.spec.js`; import call count is 1 |
| Equipment open failure | rejected dynamic import | pending clears; rejection text plus retry/close stays visible in the equipment surface; Close restores the previous game state | deterministic rejected importer; asserts `aria-busy=false`, retry, close, focus, and no stuck pending |
| Combat/chest delayed playback | existing timeout-based gameplay resolution | existing transitioning/result semantics remain the owner; no new generic loader or spinner | existing combat/chest transition and cleanup tests |
| Renderer startup/draw | Pixi/Canvas renderer path | not changed in #1259 | #1251 owner |

No network throttling is used for the new lazy-load guard. No universal timing
threshold was introduced.

## Duplicate-action inventory

| World-affecting action | Existing owner guard | Evidence |
|---|---|---|
| Start run | first synchronous call changes `gameState` to `explore`; replayed preparation-button events are rejected outside `submenu` | Golden Journey replay test asserts same run identity/seed, one Explore state |
| Equipment commit | projected draft is committed atomically; the draft records `committed` and a repeated semantic commit is a no-op with zero turn cost | loadout unit test plus existing repeated activation browser test |
| Combat round | `phase` and `transitioning` reject repeated resolution | combat owner tests |
| Chest/trap resolution | chest phase and `transitioning` reject re-entry; cleanup clears transition even on exceptions | chest/trap owner tests |
| Pending reward bundle | resolution clears the bundle before returning to Explore | pending-reward unit/browser tests |
| Portal / Result | selected decision is cleared after confirmation; `triggerRunResult` rejects an already terminal run | portal/result owner tests |
| Return Wing | Wing is consumed at the inventory owner boundary; missing item rejects subsequent activation | Wing/result owner tests |

The duplicate policy is semantic ownership, in-flight state, and terminal
guards. It is not a blanket debounce and does not discard valid rapid input.
Telemetry remains observation only and is not used as a duplicate-action guard.

## Browser responsiveness baseline and proxy

Before the production change, the current-main focused owner suite passed:

```text
npx playwright test tests/ui-golden-journeys.spec.js tests/ui-loadout-transaction.spec.js
18 passed
```

The controlled delayed path now records `performance.now()` at dispatch and
at the first pending DOM acknowledgement, then observes terminal resolution.
The test asserts ordering and state semantics, including:

- accepted/pending text is present before the injected Promise is released;
- repeated open calls share one request and one dynamic import;
- exactly one equipment surface exists after resolution;
- failure resolves to visible rejection with pending cleared; and
- the short `320x568` path retains a recoverable visible surface.

The recorded number is a relative CI regression proxy, not an absolute human
perception SLO. No `<100ms` or per-frame global hard threshold is asserted.

## Actual defects and minimal fixes

### Lazy equipment open had no visible pending acknowledgement and no request coalescing

- Before: `openEquipOverlay()` returned a Promise but left the player on the
  previous surface until the import resolved. Repeated activation attached
  multiple `.then()` calls, allowing repeated equipment-open owner calls and
  making the tap appear ignored.
- Player impact: a cold equipment tap could look like a blank/no-op state;
  repeated tap could reset the opening surface more than once.
- Fix: `equipment_ui_loader.js` now owns one in-flight open request, renders a
  quiet text acknowledgement with `aria-busy`, and exposes a retry/close
  rejection state. Rejection keeps the overlay state until the player chooses
  Close, focuses its status, and restores the invoking control when it is still
  available. Production still uses the original lazy import and cache.
- Regression guard: deterministic delayed and failure browser tests, including
  rejection focus and post-close focus restoration.

### Preparation start could re-enter after the source button was replaced

- Before: a replayed event from the old preparation button could call the
  start owner again after the first call had already entered Explore.
- Player impact: a repeated activation could initialize another run and
  duplicate preparation-side world setup.
- Fix: `startRun` rejects calls outside the preparation submenu. No debounce or
  gameplay rule change was added.
- Regression guard: replayed old-button browser test.

### Loadout semantic boundary accepted a reused draft

- Before: direct reuse of the same committed draft could reapply its semantic
  changes at the system boundary.
- Fix: `commitLoadoutDraft` marks the draft committed and makes a repeated
  semantic commit a zero-cost no-op.
- Regression guard: loadout unit test asserts unchanged live state and a
  duplicate result.

### Current-main renderer tick could hide the lazy-load rejection surface

- Before: after a rejected equipment import restored `state.gameState` to
  `explore`, a later Pixi/updateUI tick could hide the still-actionable
  rejection surface before the player could read or close it.
- Player impact: the error could be announced in the DOM but disappear before
  recovery, making the action look unresolved.
- Fix: rejection remains owned by `equip_overlay` until explicit Close; the
  loader's render path treats the rejected state as terminal and does not start
  another import. Close restores the prior game state and invoking focus.
- Regression guard: current-main smoke and targeted rejection browser tests.

## Pending / busy policy

Pending was intentionally added only to the Class B equipment lazy-load path.
It is text-first, quiet, and distinct from disabled: the pending surface has no
disabled primary action, says that the input was accepted, uses `aria-busy`
only while the import is unresolved, and clears on both success and failure.
No spinner, blanket overlay, global async framework, or pending state was added
to synchronous actions. The failure state provides retry and close rather than
leaving the player stuck.

## Accessibility and visual-system impact

- Pending status is a polite atomic live region; it does not spam repeated
  announcements for repeated taps because the request is coalesced.
- The pending and rejected surfaces keep focus on their status rather than
  moving focus to the body. The resolved equipment overlay uses the existing
  focus manager, and rejection Close restores the invoking control when it is
  still connected.
- `aria-busy=true` is limited to the actual unresolved import and is removed on
  resolution; failure exposes a visible retry/close control with `aria-busy=false`.
- The new surface uses existing Dark Archive semantic tokens and restrained
  text/border treatment. Pending is not selected, success, HP, or disabled; no
  strong glow or motion was added. `prefers-reduced-motion` does not remove the
  text meaning.
- Existing #1226 accessibility and #1228 visual owner suites remain owners;
  no telemetry schema, autocapture, session replay, or clickstream was added.

## Remaining evidence / boundaries

- Manual/device: exact-head Preview iPhone checks for cold equipment open,
  repeated rapid tap, Portal confirm, Combat target, and Result → Town remain
  manual pending; they are not marked PASS here.
- Renderer-owned: Dungeon draw/FPS/GPU/Pixi startup/fallback/first draw and
  Canvas/Pixi physical gates remain #1251-owned. The registry records the D
  boundary without changing renderer code.
- Production-only hypotheses: no new production UX telemetry is justified by
  this deterministic evidence. If real-device users report a blank/frozen
  cross-boundary state after the shared DOM acknowledgement, that is a child
  issue candidate for the renderer owner.
- Larger architecture: no generic async action framework or state-management
  rewrite was found necessary; no child Issue was created from this pass.

## Verification record

Focused after-change checks:

```text
npx playwright test tests/ui-golden-journeys.spec.js tests/ui-loadout-transaction.spec.js
21 passed

npx playwright test tests/ui-loadout-transaction.spec.js --grep 'delayed cold equipment open'
1 passed

npx playwright test tests/ui-loadout-transaction.spec.js --grep 'equipment lazy-load failure'
1 passed

node tests/node/unit/test_loadout_transaction.js
[PASS] loadout drafts validate and commit atomically

npm run lint:tests
Playwright test ownership OK
```

Final local canonical gates on the implementation branch:

```text
npm run lint
success

npm run test:unit
PASS 196 / FAIL 0 / SKIP 3

npm run test:browser
96 passed

npm run test:browser:parallel (PLAYWRIGHT_PORT=19012)
96 passed

npm run test:browser:visual (PLAYWRIGHT_PORT=19011)
96 passed

npm run build
success (Vite; existing chunk-size warning only)
```

The parallel and visual commands needed a task-owned port because the sandbox
initially returned `EPERM` while binding the repository's default port; the
same canonical commands passed once local server binding was allowed. GitHub
Actions and physical-device evidence remain separate gates and are not inferred
from this local record.

## Revision / merge-gate evidence

- Fresh review base: `e5a1fb638f6d8bd6f7ff5884a203763701d4790b`
- Implementation revision inspected before the final evidence-only commit:
  `f9bc49df821a3c8d13c222e09b9b0345113979e9`
- PR-specific changed-file-set SHA-256:
  `6bd27350e77f05bd45e0ff50542755988583d57a7f8360ae6d2bd8a4802fb3d3`
- The final independent-review comment records the exact current PR HEAD,
  base, changed files, P0-P2 disposition, and verdict.
