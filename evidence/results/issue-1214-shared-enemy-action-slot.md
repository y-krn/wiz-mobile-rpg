# Issue #1214 — shared ordinary enemy action slot

## Decision

C2 **PASS**. Ordinary non-boss, non-midboss, non-roaming-elite encounters now
give one shared ordinary action slot to the earliest living enemy in resolved
initiative order. Every living enemy still rolls initiative. The selected
enemy keeps its explicitly queued `multiAction` extra; skipped ordinary turns
do not bank for later rounds. Bosses, midbosses, and roaming elites remain
independent. The combat log explains the shared action when it occurs.

## Measurement provenance

- Issue: `#1214`
- Base: `origin/main` at `d42ffaa03bc6a1f768cfdd42c9b92141b6c7eed4`, verified by
  `git fetch origin main` before implementation.
- Primary runner: `scratch/measurements/shared_enemy_action_slot_measurement.js`
- Runner version: `issue1214-shared-enemy-action-slot-v1`
- Primary population: fresh vanguard, B1F natural encounters, N=1000 per
  condition, with fight and visible multi-enemy flee populations measured
  separately.
- Deep population: fixed-support B8/B18/B30 regression, six build fixtures,
  six production encounter definitions, N=100 per cell.
- Conditions: C0 pre-change semantics, C1 existing total enemy-action cap
  (`measurementMaxEnemyActionsPerRound=1`), C2 exact shared ordinary slot.
- Clean production run: seed `1214-clean-after`; environment hash
  `e65d871514415310`; `originMainAncestor=true`; `workingTreeClean=true`.

## Primary result

Values are enemy-action p50 for the indicated encounter shape. “Pair before
kill” is the pre-first-kill decomposition. C2 matches C1 in the natural B1F
sample because those matched encounters did not queue a trait extra; the fixed
deep axis below verifies the extra-action distinction.

| Population | Condition | Single p50 | Pair p50 | Pair before kill p50 | E2 pair p50 | Death | Reward reach | Build reach |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Fight | C0 | 3 | 7 | 4 | 4 | 0.877 | 0.941 | 0.944 |
| Fight | C1 | 3 | 5 | 2 | 3 | 0.856 | 0.957 | 0.961 |
| Fight | C2 | 3 | 5 | 2 | 3 | 0.856 | 0.957 | 0.961 |
| Visible flee | C0 | 3 | 2 | — | 2 | 0.847 | 0.977 | 0.980 |
| Visible flee | C1 | 3 | 1 | — | 1 | 0.829 | 0.979 | 0.982 |
| Visible flee | C2 | 3 | 1 | — | 1 | 0.829 | 0.979 | 0.982 |

The primary comparison keeps single-enemy exposure unchanged while reducing
pair exposure and preserving a meaningful pair/single difference. Flee choice
remains observable and is measured independently from fight resolution.

## Deep regression

The fixed-support global axis retained composition and build sensitivity while
covering the required depths. Each condition has 36 cells (six builds × six
encounter definitions); the pair p50 range and mean are across non-empty
encounter ordinals.

| Depth | C0 pair p50 range / mean | C1 range / mean | C2 range / mean | C2 extra actions | C1 extra actions | C2 `multiAction` firings |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| B8 | 4–9 / 5.92 | 2–7 / 4.57 | 2–7 / 4.57 | 328 | 0 | 278 |
| B18 | 2–9 / 5.27 | 2–6 / 4.03 | 2–6 / 4.00 | 267 | 0 | 228 |
| B30 | 2–7 / 4.03 | 2–5 / 3.30 | 2–5 / 3.33 | 175 | 0 | 148 |

The C2 cells retain the production compositions and their trait firings; the
C1 upper-bound probe suppresses all extra turns by design. No enemy stats,
targeting, initiative rolls, loot, flee formula, or reward formula were
changed.

## Fresh-save manual gate

Using a new browser context with no saved data, the production build was
started from town, the default vanguard kit and B1F were selected, and the
run reached a natural B1F normal battle. The attack target-selection UI opened
and the rendered combat log showed the encounter start without a page error.
The deterministic unit gate additionally verified the multi-enemy production
schedule and the player-facing shared-slot log message.

## Verification

- `npm run test:unit`: PASS 189 / FAIL 0 / SKIP 3
- `npm run lint`: passed
- `npm run build`: passed (pre-existing large-chunk warning only)
- `git diff --check`: passed
- Focused shared-slot unit test: passed

