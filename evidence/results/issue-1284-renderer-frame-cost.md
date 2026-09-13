# Issue #1284 renderer frame cost measurement

Date: 2026-09-13 (Asia/Tokyo)

## Result

**B. No optimization warranted — 対応不要。**

`isUsableMap()` is the dominant operation inside the measured renderer-input
chain, but its absolute cost is only about **6.9–7.5 µs median** on this
machine. That is about **0.04–0.05% of a 16.67 ms 60 FPS frame budget**. The
full `getRendererInput()` cost is about **7.6–8.1 µs median** for the 30×30
exploration fixtures. The result does not justify cache architecture or a
map-validation redesign in this Issue.

## Machine and runtime

- Machine: MacBookPro14inch, Apple arm64; macOS 26.6.2; Darwin 25.6.0
- Node: v26.8.2
- Browser: Playwright 1.61.0, HeadlessChrome 149.0.7827.55
- Browser viewport: 390×844
- Browser probe reported `rendererMode: "pixi"`.
- Base SHA: `79e575245388a4968b712db748c36974e5816b24`
- Branch: `issue/1284-renderer-frame-cost`
- Production code changed: none

## Methodology

The benchmark is split so Node and Browser values are never combined.

- Node probe: `scratch/benchmarks/bench_renderer_frame_cost.js`
- Browser/Pixi probe: `scratch/benchmarks/bench_renderer_frame_cost_browser.js`
- Every fixture uses a deterministic 30×30 valid map, player `(15, 15)`,
  `mapRevision: 1284`, fixed party/state objects, and fixed roaming identities.
- Node: 100 warmup calls, 80 measured samples, 200 calls per sample.
- Browser: 50 warmup calls, 40 measured samples, 100 calls per sample.
- Each operation is timed as a batch and reported per invocation.
- Timer overhead is measured with an empty batch and subtracted from each
  operation sample. Values below are `mean / median / p95`, in µs.
- The danger map and roaming probes are benchmark-local mirrors of the two
  scans in the private production `getDangerCue` helper. Their combined
  boolean result is checked against production `input.dangerCue` for every
  fixture; no production export was added.
- `getRendererInput` includes `getScreenViewState`, which includes
  `isUsableMap`. Therefore component percentages below are attribution
  indicators, not additive measurements.
- Pixi `isAnimating()` and `getDrawSignature()` are measured in Browser with
  the same frozen input. GPU rendering and `app.render()` are intentionally
  excluded: this Issue measures renderer-side JS CPU cost.

Commands:

```sh
node scratch/benchmarks/bench_renderer_frame_cost.js
npm run dev -- --host 127.0.0.1 --port 5173
node scratch/benchmarks/bench_renderer_frame_cost_browser.js
REDUCED_MOTION=1 node scratch/benchmarks/bench_renderer_frame_cost_browser.js
```

## Deterministic scenarios

| Scenario | Map | State | Threat fixture |
| --- | ---: | --- | --- |
| idle exploration | 30×30 | explore, floor 1 | no roaming, no boss |
| nearby boss | 30×30 | explore, floor 1 | boss at Manhattan distance 4 |
| nearby midboss | 30×30 | explore, floor 1 | midboss at Manhattan distance 4 |
| roaming few | 30×30 | explore, floor 1 | 3 roaming, last is elite |
| roaming many | 30×30 | explore, floor 1 | 100 roaming, last is elite |
| combat | 30×30 | combat, floor 1 | 3 living monsters, boss threat flag |
| animated environment | 30×30 | explore, floor 5 | B5 animated environment |
| town / map hidden | hidden | town | no map exposed to renderer |

Production danger cue outputs were stable: idle/animated/town were `none`,
boss and midboss were `map`, roaming few/many were `roaming`, and combat was
`combat`. The local danger probe matched production for all scenarios in both
Node runs and both Browser modes.

## Node results: pure JS and Canvas auxiliary path

The Canvas columns are auxiliary only; Pixi remains the production-default
target. Each cell is `mean / median / p95 µs`.

| Scenario | `getRendererInput` | `getScreenViewState` | `isUsableMap` | danger map | danger roaming | danger total probe | Canvas `isAnimating` | Canvas `isMiniMapAnimating` | Canvas `getDrawSignature` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| idle | 7.584 / 7.550 / 8.236 | 6.988 / 6.970 / 7.248 | 6.891 / 6.878 / 7.103 | 0.093 / 0.103 / 0.115 | 0.010 / 0.003 / 0.036 | 0.081 / 0.077 / 0.111 | 0.268 / 0.267 / 0.369 | 0.084 / 0.081 / 0.083 | 0.254 / 0.233 / 0.405 |
| nearby boss | 7.944 / 7.976 / 8.245 | 7.480 / 7.545 / 7.686 | 7.405 / 7.456 / 7.580 | 0.101 / 0.092 / 0.109 | 0.007 / 0.004 / 0.015 | 0.071 / 0.071 / 0.077 | 0.161 / 0.143 / 0.219 | 0.103 / 0.087 / 0.127 | 0.254 / 0.235 / 0.365 |
| nearby midboss | 7.832 / 7.848 / 8.043 | 7.407 / 7.439 / 7.593 | 7.343 / 7.371 / 7.529 | 0.080 / 0.079 / 0.079 | 0.009 / 0.004 / 0.007 | 0.086 / 0.083 / 0.091 | 0.109 / 0.107 / 0.141 | 0.096 / 0.095 / 0.096 | 0.252 / 0.235 / 0.403 |
| roaming few | 7.940 / 7.978 / 8.159 | 7.450 / 7.499 / 7.617 | 7.340 / 7.371 / 7.511 | 0.133 / 0.132 / 0.133 | 0.024 / 0.018 / 0.073 | 0.160 / 0.153 / 0.184 | 0.230 / 0.230 / 0.266 | 0.158 / 0.155 / 0.168 | 0.481 / 0.458 / 0.624 |
| roaming many | 8.032 / 8.046 / 8.323 | 7.611 / 7.549 / 8.376 | 7.355 / 7.416 / 7.529 | 0.133 / 0.133 / 0.134 | 0.190 / 0.129 / 0.468 | 0.365 / 0.276 / 0.614 | 0.174 / 0.167 / 0.190 | 0.163 / 0.163 / 0.181 | 7.021 / 7.021 / 7.321 |
| combat | 8.016 / 8.064 / 8.374 | 7.490 / 7.545 / 7.778 | 7.338 / 7.408 / 7.521 | 0.138 / 0.135 / 0.143 | 0.011 / 0.004 / 0.024 | 0.011 / 0.007 / 0.035 | 0.012 / 0.012 / 0.015 | 0.005 / 0.005 / 0.007 | 0.697 / 0.657 / 0.842 |
| animated | 7.930 / 7.970 / 8.218 | 7.456 / 7.504 / 7.738 | 7.331 / 7.402 / 7.494 | 0.139 / 0.136 / 0.151 | 0.009 / 0.004 / 0.016 | 0.151 / 0.151 / 0.175 | 0.034 / 0.049 / 0.072 | 0.217 / 0.212 / 0.273 | 0.243 / 0.231 / 0.383 |
| town hidden | 0.251 / 0.220 / 0.433 | 0.053 / 0.050 / 0.051 | 0 / 0 / 0 | 0.001 / 0 / 0.001 | 0.007 / 0.004 / 0.006 | 0.003 / 0.002 / 0.003 | 0.006 / 0.005 / 0.006 | 0.005 / 0.005 / 0.006 | 0.122 / 0.112 / 0.184 |

Timer overhead: mean 0.005 µs, median 0.005 µs, p95 0.007 µs.

## Browser results: production-default Pixi path

Browser timing is separate from Node timing. Headless Chromium's effective
timer resolution makes sub-microsecond values quantized; the repeated input
and danger-output checks are more reliable here than the smallest latency
digits. Each cell is `mean / median / p95 µs`.

| Scenario | `getRendererInput` | `getScreenViewState` | `isUsableMap` | danger total probe | Pixi `isAnimating` | Pixi `getDrawSignature` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| idle | 8.275 / 8 / 10 | 7.575 / 8 / 8 | 7.375 / 7 / 8 | 0.100 / 0 / 1 | 0.350 / 0 / 1 | 0.225 / 0 / 1 |
| nearby boss | 8.700 / 9 / 10 | 8.175 / 8 / 9 | 8.025 / 8 / 9 | 0.125 / 0 / 1 | 0.325 / 0 / 1 | 0.125 / 0 / 1 |
| nearby midboss | 8.700 / 9 / 9 | 8.275 / 8 / 9 | 8.025 / 8 / 9 | 0.100 / 0 / 1 | 0.350 / 0 / 1 | 0.175 / 0 / 1 |
| roaming few | 8.550 / 8 / 10 | 8.150 / 8 / 9 | 7.950 / 8 / 9 | 0.150 / 0 / 1 | 0.325 / 0 / 1 | 0.275 / 0 / 1 |
| roaming many | 8.750 / 9 / 10 | 8.200 / 8 / 9 | 7.950 / 8 / 9 | 0.525 / 0 / 1 | 0.425 / 0 / 2 | 3.425 / 3 / 4 |
| combat | 8.650 / 9 / 9 | 8.125 / 8 / 9 | 7.875 / 8 / 9 | 0.050 / 0 / 0 | 0.350 / 0 / 1 | 0.500 / 0 / 1 |
| animated | 8.525 / 9 / 9 | 8.050 / 8 / 9 | 7.900 / 8 / 9 | 0.125 / 0 / 1 | 0.375 / 0 / 1 | 0.175 / 0 / 1 |
| town hidden | 0.300 / 0 / 1 | 0.100 / 0 / 1 | 0 / 0 / 0 | 0 / 0 / 0 | 0.375 / 0 / 2 | 0.150 / 0 / 1 |

Browser timer overhead: mean 0.025 µs, median 0 µs, p95 0 µs. Direct
`isMiniMapAnimating` was also measured in Browser; it is not called by Pixi's
`isAnimating`. Its median was 0 µs in all scenarios, including 0.175 µs mean
in the 100-roaming fixture. This confirms that Canvas minimap duplication is
not a Pixi production-path cost.

## Reduced motion

The Browser probe was repeated with `REDUCED_MOTION=1`; `matchMedia`
confirmed `prefers-reduced-motion: reduce`. Pixi `isAnimating()` returned the
reduced-motion false path for every scenario. `getDrawSignature()` remained a
pure signature operation, as expected. The quantized timing was:

| Scenario | Pixi `isAnimating` mean / median / p95 µs | Pixi `getDrawSignature` mean / median / p95 µs |
| --- | ---: | ---: |
| idle | 0.425 / 0 / 1 | 0.150 / 0 / 1 |
| nearby boss | 0.325 / 0 / 1 | 0.150 / 0 / 1 |
| nearby midboss | 0.375 / 0 / 1 | 0.175 / 0 / 1 |
| roaming few | 0.350 / 0 / 1 | 0.350 / 0 / 1 |
| roaming many | 0.375 / 0 / 1 | 3.575 / 4 / 4 |
| combat | 0.375 / 0 / 1 | 0.525 / 0 / 2 |
| animated | 0.375 / 0 / 1 | 0.175 / 0 / 1 |
| town hidden | 0.350 / 0 / 1 | 0.175 / 0 / 1 |

## Composition and bottleneck ranking

Using Node medians, with `isUsableMap` divided by the corresponding full
`getRendererInput` median:

| Scenario | map validation / total | danger total / total | roaming scan / total | remaining total after map |
| --- | ---: | ---: | ---: | ---: |
| idle | 91.1% | 1.0% | 0.0% | 0.67 µs |
| nearby boss | 93.5% | 0.9% | 0.1% | 0.52 µs |
| nearby midboss | 93.9% | 1.1% | 0.1% | 0.48 µs |
| roaming few | 92.4% | 1.9% | 0.2% | 0.61 µs |
| roaming many | 92.2% | 3.4% | 1.6% | 0.63 µs |
| combat | 91.9% | 0.1% | 0.0% | 0.66 µs |
| animated | 92.9% | 1.9% | 0.0% | 0.57 µs |

Ranking for the production Pixi frame-side chain:

1. `isUsableMap()` / map validation: ~6.9–7.5 µs median, ~90–94% share.
2. Remaining `getScreenViewState` and renderer projection: ~0.5–0.7 µs
   after the standalone map-validation reference; this is an attribution
   estimate because the view call nests map validation.
3. Danger cue scans: ~0.08–0.28 µs median; roaming scan rises from ~0.018 µs
   at 3 monsters to ~0.129 µs at 100 monsters.
4. Pixi `isAnimating()`: ~0–0.4 µs median in Browser's quantized clock.
5. Pixi `getDrawSignature()`: Browser mean ~0.125–0.575 µs in ordinary
   scenarios (median quantized to 0 µs), rising to about 3.4 µs mean / 3 µs
   median with 100 roaming monsters. This is still below map validation and
   is not GPU time.

## Hypothesis decisions

- A — **supported**: whole-map validation is the dominant measured component
  of the renderer-input chain. It is nevertheless small in absolute terms.
- B — **supported**: the non-map projection remainder is sub-microsecond in
  the Node measurement and does not dominate.
- C — **partly supported**: roaming work scales with monster count (about
  0.018 → 0.129 µs median in the Node probe), but remains a small fraction of
  total renderer-input cost. `getDrawSignature()` also scales with the roaming
  list, reaching about 4 µs median in Browser for 100 entries.
- D — **supported for Pixi**: Pixi `isAnimating()` does not call
  `isMiniMapAnimating()`. The minimap/threat duplicate scan is a Canvas-only
  auxiliary path and is not reported as a Pixi optimization opportunity.

## mapRevision and reuse consideration

The current render input already carries `mapRevision`. If a later measurement
on slower target hardware makes caching worthwhile, the smallest plausible
reuse key would need to include map reference identity plus `mapRevision`,
player `(x, y)`, and a roaming-monster identity/revision signal. Position and
roaming changes affect the danger result, while `mapRevision` covers map-cell
changes. This Issue does not implement that cache because the measured
absolute cost is too small on the tested machine.

## Measurement limitations

- Node measurements use deterministic synthetic valid cells, not a sampled
  distribution of generated production floors.
- Browser measurements use headless Chromium and a 1 ms-scale clock; the
  smallest Browser percentiles are quantized and should not be compared to
  Node microsecond values.
- Pixi method timings cover JS method execution only. They exclude scene draw,
  Pixi display-list rebuild, `app.render()`, GPU work, compositing, and actual
  requestAnimationFrame scheduling.
- The danger component timings are validated mirrors, not direct timing of the
  private production helper. Direct timing would require changing production
  export boundaries, which was deliberately avoided.
- This is one Apple arm64 machine and one browser engine; mobile hardware,
  thermal state, and browser scheduling may differ.
- The two Node runs and repeated Browser probes establish deterministic input
  and output semantics, not byte-identical wall-clock timings.

## Verification

- `npm run lint`: PASS (CSS, docs, skills, tests, Markdown, workflow, ESLint).
- `npm run lint:tests`: PASS (34 entrypoints, 26 case modules).
- `npm run test:unit:fast`: PASS (197 pass, 0 fail, 6 skip; 5.3 s).
- Full unit/build are not required because production code is unchanged.
