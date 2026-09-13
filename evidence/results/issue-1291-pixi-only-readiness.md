# Issue #1291 — PixiJS 一本化に向けた Canvas fallback 撤去 readiness audit

## 結論

**Not ready yet**

この Issue では production code、test、telemetry schema を変更していない。
`origin/main` の現状を監査し、Canvas を削除するための bounded な移行面と、
削除前に埋めるべき blocker を記録した。

重大な blocker は次の四つである。

1. iOS Safari / Android Chrome / desktop Chromium / Safari macOS の supported
   browser/device policy が repo 内で明文化されていない。
2. Pixi の required flow に対する physical-device evidence がない。既存の
   Playwright/Chromium evidence は実機 proof ではない。
3. Pixi-only 化後の startup failure / unsupported / runtime failure に対する
   user-facing safe UI が定義されていない。現在は Canvas が画面を救済している。
4. fallback occurrence の Sentry event はあるが、成功した Pixi startup と
   `?renderer=canvas` を含む denominator がなく、production 上の Canvas 利用率を
   十分な比率で判断できない。

## Provenance and scope

- Issue: #1291
- Repository: `y-krn/wiz-mobile-rpg`
- Branch: `issue-1291-pixi-only-readiness`
- Base ref: `origin/main`
- Base SHA: `6adf789e1a5dc559c7aaf6d922a22858f99a3abc`
- Base relation: PR #1289 merge 後の fetch 済み `origin/main` から開始
- Audit date: 2026-09-14 (Asia/Tokyo)
- Production code changed: none
- Design canon impact: gameplay rules、combat model、economy は変更していないため unaffected

## Acceptance-to-evidence map

| readiness criterion | disposition | evidence / gap |
| --- | --- | --- |
| 1. supported browser/device policy | **BLOCKER** | repo 内に versioned support matrix がない |
| 2. iOS / Android / desktop Pixi startup stability | **BLOCKER** | Chromium automated evidence のみ。iOS/Android/desktop manual device evidence なし |
| 3. physical-device smoke | **BLOCKER** | L2 session record /実機結果なし |
| 4. production Canvas fallback usage | **BLOCKER** | fallback event は検索可能だが成功 startup の denominator なし |
| 5. failure 時の user-facing UX | **BLOCKER** | 現在の failure UX は hidden Canvas recovery。Pixi-only safe screen 未定義 |
| 6. Pixi startup failure の Sentry/telemetry | **PARTIAL / BLOCKER** | fallback failure の Sentry field はあるが startup success/outcome と runtime failure の coverage がない |
| 7. Canvas 固有 gameplay dependency | **PASS WITH FOLLOW-UP** | gameplay modules は描画 API の runtime registry に依存するが、Canvas drawing semantics には依存しない。registry の移設が必要 |
| 8. default Pixi browser suite green | **PASS (L1 only)** | 現行 HEAD で `npm run test:browser`: 98/98 |
| 9. combat target touch / minimap / exploration / combat | **PASS (L1 only)** | #1220/#1230 Pixi tests と current smoke。実機 touch は未確認 |
| 10. shared helper の配置先 | **PASS WITH FOLLOW-UP** | `renderer_geometry` と `renderer_runtime` へ分ける方針は明確だが未実装 |
| 11. removal diff bounded | **PASS WITH FOLLOW-UP** | 対象は列挙可能。ただし Canvas visual test の置換範囲は大きい |
| 12. rollback strategy | **PASS** | Canvas を含む直前 release への deployment rollback を明示できる |

重要 blocker が残るため、判定は `Ready now` ではなく `Not ready yet` とする。

## Phase 1 — production dependency audit

### Production graph

| module / surface | classification | current dependency and removal implication |
| --- | --- | --- |
| `src/game.js:4,41-183` | 1, 3, 4, 5 | `DungeonRenderer` を直接生成し、`setDungeonRenderer` で registry を更新。Pixi dynamic import、unsupported 判定、init/mount/initial-render recovery、Sentry report、`?renderer=canvas` 分岐を所有 |
| `src/renderer.js:12-15` | 3 | `dungeonRenderer` / `setDungeonRenderer` は runtime registry。Canvas class と同居しているが、combat/trap feedback の受け口自体は renderer-neutral |
| `src/renderer.js:26-125,129-224` | 2 plus Canvas-only compatibility | `getCombatMonsterLayout` と hit region、`BASE_PROJECTION`、`BASE_GEOMETRY`、`getProjectionPlanes`、`getProjectionColumn` は Pixi が import する shared projection/layout。`LANDMARK_STYLE_IDS` / `getLandmarkStyles` は現状 Canvas path と direct tests のみ |
| `src/renderer.js:240-1688` | 1 | Canvas `DungeonRenderer` と Canvas 2D drawing implementation。corridor、landmark、chest、trap、monster、gradient/path、floating text、Canvas hit-test 等の主削除面 |
| `src/pixi_renderer.js:1-758` | Pixi implementation; shared 2 | Pixi drawing/runtime implementation。`renderer.js` から geometry/layout を直接 import し、`state/renderer_view`、topology、minimap overlay を共有 |
| `src/renderer_selection.js:5-80` | 3, 4, 5 | renderer names/default、query normalization、Canvas fallback state、failure injection hook。Pixi-only では Canvas enum/fallback を削除または test-only に移す |
| `src/state/renderer_view.js:95-153` | 2 | raw state → validated `RendererInput` boundary。Canvas/Pixi 共通で retain |
| `src/rules/renderer_topology.js` | 2 | visible corridor topology / renderable cell 判定。renderer-neutral rule として retain |
| `src/minimap.js:2-339` | 1 and 2 | `drawMiniMap` / stair icon は Canvas 2D helper、`renderMiniMapOverlay` は Pixi と共通の DOM overlay。Canvas helper と overlay を混同して削除しない |
| `src/chest.js`, `src/combat_ui/battle_log_player.js`, `src/combat_ui/combat_start.js`, `src/movement.js`, `src/spell_menu.js`, `src/systems/traps.js` | 3 | `dungeonRenderer` registry 経由で flash/shake/damage text/combat entry を呼ぶ。Canvas drawing には直接依存しないが、registry の移設後に import を更新する |

`src/game.js` と `src/renderer_selection.js` が selection/recovery の owning path、
`src/renderer.js` が現在の Canvas implementation と registry と shared helper の
混在点である。Pixi はすでに default だが、failure 時の selected renderer は
Canvas である。

### Repo-wide search classification

指定語を `src/`、`tests/`、`scratch/` に分けて検索した。

| area | findings | classification |
| --- | --- | --- |
| `src/` | `DungeonRenderer`, `dungeonRenderer`, `setDungeonRenderer` | production Canvas implementation / runtime registry / renderer hooks |
| `src/` | `selectCanvasFallback`, `fallbackOccurred`, `fallbackReason`, `pixiPhase`, `canvas-fallback` | renderer selection/recovery and Sentry recovery context |
| `src/` | no production `renderer=canvas` string outside query behavior represented by `renderer_selection.js` | explicit override is a query contract, not a separate Canvas loader |
| `tests/` | direct Canvas imports, Canvas 2D context assertions, Canvas query URLs, fallback state assertions | test-only (6) and Canvas/fallback contract tests (A/D) |
| `scratch/` | renderer benchmarks instantiate `DungeonRenderer`; browser benchmark uses `?renderer=pixi` | scratch-only measurement/benchmark; not production dependency, not fallback usage evidence |
| other `fallback` words | spell, save, simulation, and domain fallback terminology | unrelated false positive (7); not renderer removal evidence |

## Canvas-specific and shared helper surface

### Canvas-only surface

The Canvas-only portion is the `DungeonRenderer` class and its 2D methods in
`src/renderer.js:240-1688`, including `draw`, `draw3DCorridors`, Canvas wall/floor
fills, Canvas landmark/chest/trap icons, Canvas monster paths/gradients/details,
Canvas floating text, and Canvas context lifecycle. The Canvas-only landmark style
validation (`LANDMARK_STYLE_IDS`, `getLandmarkStyles`) is currently consumed by
that path and its direct tests; it should be re-evaluated rather than assumed
shared.

### Shared renderer-neutral surface

These must remain available after the Canvas class is gone:

- `RendererInput` creation and validation in `src/state/renderer_view.js`;
- `getVisibleCorridorTopology` / `isRenderableCorridorCell` in
  `src/rules/renderer_topology.js`;
- `BASE_PROJECTION`, `BASE_GEOMETRY`, `getProjectionPlanes`, and
  `getProjectionColumn`;
- `getCombatMonsterLayout` plus its bounded visual hit-region calculation;
- `renderMiniMapOverlay` and the DOM minimap contract;
- the renderer runtime methods used by gameplay feedback callers: flash, shake,
  damage text, and combat-entry/hit feedback.

The natural future placement is:

- `src/renderer_geometry.js`: projection constants/functions, combat layout/hit
  region, and only the landmark data validation that both renderers actually use;
- `src/renderer_runtime.js`: `dungeonRenderer` and `setDungeonRenderer`, or an
  equivalent narrow runtime registry;
- `src/state/renderer_view.js`, `src/rules/renderer_topology.js`, and
  `src/minimap.js` retain their current ownership unless the eventual removal diff
  proves a smaller split.

This is a proposed placement only. No file split was implemented in #1291.

## Phase 2 — current fallback / recovery matrix

| failure | current behavior | Canvas role | Sentry/telemetry | user-visible behavior | Pixi-only alternative |
| --- | --- | --- | --- | --- | --- |
| explicit `?renderer=canvas` | query resolves to Canvas; synchronous `new DungeonRenderer` | requested renderer, not a fallback; `fallbackOccurred=false` | none | game runs on Canvas with no warning | remove the override and always select Pixi; no failure UI needed |
| Pixi dynamic import failure | catch maps phase `import`, calls `mountCanvasFallback` | replaces view, creates usable Canvas | Sentry warning, `subsystem=renderer`, `requested_renderer`, `selected_renderer=canvas`, `fallback_occurred=true`, `fallback_reason=pixi-import-failed`, `pixi_phase=import`, `recovery=canvas-fallback` | game continues on Canvas; failure is otherwise hidden | fatal startup screen with retry and reload guidance; capture failure |
| Pixi unsupported | `candidate.supported=false`; fallback reason `pixi-unsupported`, phase `canvas/context` | compatibility rescue | same Sentry fields; `fallback_reason=pixi-unsupported` | game continues on Canvas | distinct unsupported-device screen with supported-browser guidance; capture outcome |
| Pixi init failure | `Application`/context init rejection; phases include `application-create` or `canvas/context` | compatibility rescue | same fields; generic reason `pixi-init-failed` plus precise `pixi_phase` | game continues on Canvas | retry Pixi initialization once or user-triggered retry, then safe startup error/reload UI |
| Pixi mount failure | post-init mount assertion or mount-time exception is caught | compatibility rescue after disposing candidate and replacing view | same fields with `pixi-mount-failed`, `pixi_phase=mount` | game continues on Canvas | safe startup error screen, retry/reload; no blank canvas |
| Pixi initial-render failure | initial render assertion or `start()` render path exception is caught | compatibility rescue | same fields with `pixi-initial-render-failed`, `pixi_phase=initial-render` | game continues on Canvas | dispose/reinitialize retry, then fatal startup UI with reload guidance |
| runtime/context failure after startup | `gameLoop` calls `renderer.update/draw` without renderer-specific catch; no Canvas fallback after Pixi is selected | none in this path | Sentry SDK may receive an uncaught exception, but no renderer-specific outcome/safe UI is emitted by app code | potentially uncaught error / stale or blank view; no explicit recovery screen | catch renderer runtime failure, capture phase/context, stop loop, show safe UI with retry/reload |
| visibility/background resume | loop stops on hidden and restarts on visible; `pageshow` also restarts | not a fallback | no renderer lifecycle telemetry | normal resume path if renderer remains valid | keep lifecycle behavior and add Pixi startup/runtime outcome coverage |

The current matrix has no explicit fatal startup screen. `replaceDungeonCanvas`
and candidate disposal are specifically designed to make Canvas usable after a
partial Pixi context, so removing Canvas changes the failure contract materially.

## Phase 3 — Pixi-only failure UX proposal

The minimum safe UX should be DOM-based and independent of the renderer canvas:

- import/init/mount/initial-render failure: capture the failure, stop gameplay
  startup, show a fatal startup error with `Retry` and reload guidance;
- unsupported device/context: show a distinct unsupported-device screen with the
  supported browser policy and a reload/browser-update path;
- retry failure: preserve the safe screen and provide reload guidance rather than
  repeatedly retrying in a loop;
- post-start runtime/context loss: capture the renderer phase, stop the loop, show
  a safe retry/reload screen, and avoid pretending that gameplay is interactive;
- successful Pixi startup: only expose controls after the first render succeeds.

No failure UI is implemented by this Issue. The eventual UI must not depend on
Canvas being available, because “nothing is drawn” is not an acceptable recovery.

## Phase 4 — support policy audit

### Existing assumptions

- `npm run test:browser` and CI install Chromium only; Playwright config uses one
  repository-managed Chromium project and ephemeral contexts.
- Pixi evidence uses fixed internal `400x260` rendering and viewport widths
  `320/360/390/430`, mostly at `390x844`.
- CSS contains mobile WebKit scrolling/touch compatibility rules.
- `src/sentry_browser.js` suppresses Sentry on localhost, LAN/private-IP, and other
  local environments, including LAN physical-device testing.
- Existing Pixi evidence explicitly says iPhone verification is a separate gate.

There is no versioned supported-browser/device policy defining minimum iOS Safari,
Android Chrome, desktop Chromium, or Safari/macOS versions. The evidence protocol
has device-session templates, but templates are not executed support policy.

| target | repo evidence | status |
| --- | --- | --- |
| iOS Safari | no Safari automation or executed physical iPhone session; prior Pixi evidence says human iPhone review is required | **BLOCKER** |
| Android Chrome | no executed Android physical-device or emulator session | **BLOCKER** |
| desktop Chromium | headless Playwright/Chromium smoke and visual tests pass; no explicit desktop support/version policy | **PARTIAL, policy blocker remains** |
| Safari/macOS | no Safari/WebKit execution evidence for Pixi startup/flows | **BLOCKER** |

Conclusion: support policy is **未定義**. The policy must be decided by the
product owner before Canvas removal; this audit does not choose supported versions.

## Phase 5 — physical-device evidence

Evidence classes found:

- **headless browser:** current `npm run test:browser` and focused Playwright;
- **desktop browser:** Playwright-managed Chromium on the local Mac runner and
  Ubuntu CI, still automated/headless evidence rather than a recorded human device
  session;
- **simulator/emulator:** no executed Pixi simulator/emulator evidence found;
- **physical device:** no executed Pixi physical-device session found.

| required flow | current evidence | physical-device status |
| --- | --- | --- |
| startup | Pixi selection and failure injection tests; #1220/#1230 startup/render probes | not observed |
| exploration | six topology archetypes and production-backed B1F screenshots in Chromium | not observed |
| minimap | Pixi/DOM minimap coexistence in Chromium | not observed |
| combat | single/pair/trio staging, danger cue, combat feedback in Chromium | not observed |
| combat target touch | synthetic client-point/hit-region checks and browser pointer flow; not a device touch session | not observed |
| resize/orientation | 320/360/390/430 and repeated resize checks; no physical orientation session | not observed |
| reduced motion | Playwright `matchMedia` reduced-motion path | not observed with VoiceOver/physical OS settings |
| resume/background | Canvas-oriented visibility/pagehide/pageshow tests exist; no Pixi physical resume/background session | not observed |
| long session/context stability | #1238 repeats transitions, resize, feedback, and dispose in Chromium; not a long physical session | insufficient / not observed |

Existing #1220/#1230/#1238 evidence is useful L1 evidence for Pixi behavior, but
its own limitations state that browser pixels are not physical-device proof.
Physical-device smoke is therefore a removal blocker.

## Phase 6 — telemetry / Sentry audit

### Current coverage

| field | current coverage |
| --- | --- |
| requested renderer | Sentry recovery event only: `tags.requested_renderer` and `extra.renderer.requestedRenderer` |
| selected renderer | recovery event hard-codes `canvas`; runtime selection exists in memory but successful Pixi selection is not sent |
| fallback occurred | Sentry recovery event: `fallback_occurred=true` and `extra.renderer.fallbackOccurred=true` |
| fallback reason | Sentry recovery event: `fallback_reason` and `extra.renderer.fallbackReason` |
| Pixi initialization phase | Sentry recovery event: `pixi_phase` and `extra.renderer.pixiPhase` |
| browser/device context | Sentry SDK supplies standard event context when enabled, but no renderer-specific app field is asserted; PostHog has no renderer event |

Sentry is enabled only when a production DSN exists and the origin is not local.
The local/LAN suppression is correct for privacy/testing isolation, but means a
LAN physical-device smoke does not establish production telemetry coverage.

### Production fallback observability

Occurrence counts can be queried by grouping Sentry events/issues with:

`subsystem=renderer`, `recovery=canvas-fallback`, `fallback_occurred=true`,
`fallback_reason`, `pixi_phase`, `requested_renderer`, release, and standard
browser/device contexts.

That is enough to find fallback events, but not enough to calculate fallback rate:
successful Pixi startups are not recorded, and explicit Canvas override usage is
not recorded. Therefore the current data cannot justify “Canvas is unused” or a
low-enough production usage claim.

Minimal follow-up telemetry proposal (not implemented here):

1. `renderer_startup` with `outcome`, `requestedRenderer`, `selectedRenderer`,
   and browser/device context;
2. `pixi_init_failure` with `phase` and normalized `reason`;
3. `canvas_fallback_used` only if the fallback path remains during the migration
   window, with the same requested/selected/reason fields.

The migration decision should use the observed startup denominator and fallback
count by release/device class, not an estimate from browser tests.

## Phase 7 — test dependency audit

### Direct Canvas/fallback dependencies found

The query `renderer=canvas` occurs in 16 test files:

`tests/combat-bleeding.cases.js`, `tests/combat-security.cases.js`,
`tests/combat-target-ui.cases.js`, `tests/combat-vulnerable.cases.js`,
`tests/dungeon-chest.cases.js`, `tests/dungeon-landmarks.cases.js`,
`tests/dungeon-theme-visual.spec.js`, `tests/exploration-survey.cases.js`,
`tests/monster-render-visual.spec.js`, `tests/monster-variants.cases.js`,
`tests/node/unit/test_renderer_selection.js`, `tests/ui-departure.spec.js`,
`tests/ui-dungeon.spec.js`, `tests/ui-pixi-dungeon-spike-1220.spec.js`,
`tests/ui-pixi-dungeon-spike-1230.spec.js`, and
`tests/ui-renderer-selection.spec.js`.

The direct `renderer.js` import set also includes `tests/combat-spells.cases.js`,
`tests/inventory-menu.cases.js`, `tests/node/regression/test_biome_geometry.js`,
`tests/node/regression/test_landmark_styles.js`,
`tests/node/regression/test_sentry_renderer_recovery.js`,
`tests/node/regression/test_undefined_map_state_recovery.js`,
`tests/node/unit/test_renderer_corridor_visibility.js`,
`tests/node/unit/test_renderer_idle_draw.js`,
`tests/node/unit/test_renderer_no_map.js`,
`tests/node/unit/test_renderer_view_model.js`, and Pixi-focused entrypoints.

### A–D classification and future disposition

| class | tests | Pixi-only disposition |
| --- | --- | --- |
| A. Canvas fallback existence | `tests/ui-renderer-integration-1251.spec.js`, `tests/node/regression/test_sentry_renderer_recovery.js`, fallback branches of `tests/node/unit/test_renderer_selection.js` | delete/replace after safe Pixi failure UX and telemetry are implemented |
| B. renderer-neutral gameplay contract | renderer input/topology/view tests; gameplay flows in `combat-*`, `exploration-survey`, `inventory-menu`, and relevant `ui-departure`/state recovery cases | retain; remove forced Canvas URLs and run against default Pixi, while preserving state/input assertions |
| C. Pixi behavior | `ui-pixi-dungeon-spike-1220.spec.js`, `ui-pixi-dungeon-spike-1230.spec.js`, `ui-pixi-navigation-comfort-1238.spec.js`, `ui-pixi-navigation-flicker-1251.spec.js`, Pixi default selection portions | retain as Pixi contract suite; add missing failure UX/lifecycle cases before removal |
| D. debug override | `?renderer=canvas` selection assertions and `__WIZ_RENDERER_FAILURE__` injection in integration tests | remove Canvas override; retain or move failure injection into test-only Pixi failure harness as needed |

Canvas implementation/visual tests include `tests/ui-dungeon.spec.js`,
`tests/dungeon-theme-visual.spec.js`, `tests/dungeon-landmarks.cases.js`,
`tests/dungeon-chest.cases.js`, `tests/monster-render-visual.spec.js`,
`tests/monster-variants.cases.js`, and `tests/node/regression/test_landmark_styles.js`.
Their Canvas pixel/context/prototype assertions should be replaced by Pixi visual
or structural contracts where the behavior matters; redundant Canvas-only pixel
tests can then be deleted. `test_renderer_idle_draw.js`,
`test_renderer_no_map.js`, and `test_undefined_map_state_recovery.js` should keep
the fail-closed renderer-input intent but be rewritten against Pixi or the shared
input boundary rather than Canvas construction.

## Phase 9 — actual removal surface

| file / surface | disposition at future removal | reason |
| --- | --- | --- |
| `src/game.js` | **modify** | remove `DungeonRenderer` import, Canvas branch, `mountCanvasFallback`, and fallback recovery; retain Pixi startup sequencing and add safe failure UX hook |
| `src/renderer.js` | **split, then delete Canvas portion** | move shared geometry/layout out first; delete Canvas class and Canvas-only drawing; do not delete shared projection/layout by filename assumption |
| `src/pixi_renderer.js` | **modify** | import shared geometry/runtime location; retain Pixi implementation and lifecycle |
| `src/renderer_selection.js` | **modify** | remove Canvas name/override/fallback state; retain Pixi selection and testable failure phase normalization only if still needed |
| `src/state/renderer_view.js` | **retain** | renderer-neutral raw-state boundary |
| `src/rules/renderer_topology.js` | **retain** | renderer-neutral corridor topology |
| `src/minimap.js` | **split/retain** | retain DOM overlay; remove only Canvas 2D drawing helper if no caller remains |
| `src/renderer_runtime.js` (new future module) | **split/add** | narrow registry for renderer feedback methods; avoids gameplay modules importing a Canvas-owned file |
| `src/chest.js`, `src/combat_ui/battle_log_player.js`, `src/combat_ui/combat_start.js`, `src/movement.js`, `src/spell_menu.js`, `src/systems/traps.js` | **modify imports, retain behavior** | preserve gameplay/UI behavior while moving registry ownership |
| `src/sentry.js`, `src/sentry_browser.js` | **modify** | replace fallback-only semantics with Pixi startup/runtime outcome semantics; preserve privacy and no-PII configuration |
| `index.html` | **retain** | Pixi still renders to the existing HTML canvas element; removing the Canvas renderer does not mean removing the WebGL canvas surface |
| Canvas-specific tests | **delete or modify** | delete fallback existence tests after their replacement contracts exist; convert shared/gameplay tests to Pixi |
| `?renderer=canvas` | **delete** | remove production/debug override and its selection contract |

## Readiness blockers

1. **Policy:** supported browser/device versions and fallback/unsupported policy
   are not defined.
2. **Physical evidence:** no exact-head L2 sessions for iOS Safari, Android
   Chrome, desktop Chromium, or Safari/macOS; no physical touch/orientation/
   background/long-session proof.
3. **Failure UX:** Canvas currently hides all startup failures. Pixi-only needs a
   DOM safe screen, retry/reload guidance, and a distinct unsupported state.
4. **Telemetry denominator:** Sentry occurrence fields exist only on recovery;
   production fallback rate and explicit Canvas usage are not measurable as a
   rate.
5. **Runtime recovery:** post-start Pixi context/draw failure has no app-level
   safe UI or renderer-specific recovery path.
6. **Removal migration:** the registry and shared helpers are identified but still
   physically owned by/imported from `renderer.js`; deleting that file directly
   would break Pixi and gameplay feedback callers.

## Minimal removal sequence

1. Agree and document the supported browser/device policy, including unsupported
   behavior and whether any browser remains out of support.
2. Add the minimum startup/failure telemetry and observe a production baseline:
   successful Pixi startup denominator, failure phase/reason, and any remaining
   Canvas fallback/override use.
3. Run exact-head Pixi smoke sessions on representative physical iOS Safari,
   Android Chrome, desktop Chromium, and Safari/macOS as applicable to the agreed
   policy. Cover startup, exploration, minimap, combat, target touch, resize /
   orientation, reduced motion, background/resume, and long-session stability.
4. Define and test DOM-based fatal startup, unsupported-device, retry, and
   post-start runtime failure UX.
5. Convert renderer-neutral tests to default Pixi and add Pixi failure-UX/
   lifecycle contracts; retain only meaningful Pixi visual tests.
6. Remove `?renderer=canvas` and its query/selection contract only after the
   policy, telemetry, UX, and physical gates pass.
7. Simplify `src/game.js` to Pixi startup plus safe failure handling and remove
   Canvas fallback recovery.
8. Move projection/layout helpers to the agreed renderer-neutral module and move
   the runtime registry out of the Canvas-owned module.
9. Delete the Canvas `DungeonRenderer` and remaining Canvas-only drawing helpers;
   delete or replace Canvas-specific tests.
10. Run lint, unit fast/full, build, default and parallel browser suites, then
    repeat the physical-device regression matrix against the removal head.
11. Roll out while monitoring `renderer_startup`, `pixi_init_failure`, and
    `canvas_fallback_used` (if retained for a migration window), with a bounded
    post-release observation period.

## Rollback considerations

Canvas removal eliminates the in-release rescue path, so rollback must be a
deployment-level rollback to the last release/commit that still contains Canvas
and its recovery tests. Keep that artifact identifiable, make the removal diff
atomic, and do not delete the prior deploy artifact until the observation window
closes. A retry screen is recovery for transient Pixi failure; it is not a
replacement for release rollback when a regression affects a supported device.

## Validation performed for this audit

All commands were run from the clean, current-head audit branch after fetching
`origin/main`:

- `npm run lint:tests` — PASS; Playwright ownership: 34 entrypoints / 26 case modules.
- `npm run build` — PASS; Vite 8.0.16 build. Existing chunk-size warning remains
  informational; no source change was made to address it.
- `node tests/node/regression/test_sentry_renderer_recovery.js` — PASS.
- `node tests/node/unit/test_renderer_selection.js` — PASS.
- `node tests/node/regression/test_biome_geometry.js` — PASS.
- `node tests/node/regression/test_landmark_styles.js` — PASS.
- focused Pixi/renderer browser suite (`#1220`, `#1230`, `#1238`, #1251
  flicker/integration, and renderer selection) — PASS, 21/21.
- `npm run test:browser` — PASS, 98/98 smoke tests.

These are automated L1 results. None is physical-device evidence. The browser
preflight reported Playwright `@playwright/test 1.61.0`, Chromium revision 1228,
and a managed ephemeral browser context. The preflight also reported five npm
audit findings (2 moderate, 3 high); dependency remediation is outside this
Issue and was not performed.

## Self-review

- Canvas 延命 architecture / lazy-load architecture: **not added**.
- Pixi/Canvas redesign, projection change, minimap redesign, and gameplay/UI
  behavior change: **not performed**.
- Pixi blocker assessment: **not lowered**; browser evidence is explicitly L1.
- support policy: **not invented**; undefined policy is a blocker.
- production fallback usage: **not inferred** from tests; denominator gap recorded.
- shared projection/layout: **not marked for blind deletion**; placement is
  explicitly separated from Canvas drawing.
- test dependency: direct Canvas, fallback, Pixi, renderer-neutral, and debug
  classes are enumerated.
- failure UX: explicit fatal/unsupported/retry/runtime alternatives are defined.
- rollback: prior Canvas-containing release rollback is documented.
- unrelated renderer refactor: **not performed**.

## Final disposition

**Not ready yet.** Canvas fallback should remain until the support policy,
physical-device Pixi evidence, failure UX, and production telemetry denominator
are all closed, then the bounded removal sequence above can be executed.
