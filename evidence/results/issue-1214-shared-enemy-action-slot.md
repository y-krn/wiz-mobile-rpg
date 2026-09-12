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
- Clean production run: seed `1214-final-clean`; source commit
  `eeddbff80ddc4f39f90377b1d5cddc6c164bca0f`; environment hash
  `1eeb89b9cad1e386`; `originMainAncestor=true`; `workingTreeClean=true`.

## Primary result

Values are enemy-action p50 for the indicated encounter shape. “Pair before
kill” is the pre-first-kill decomposition. C2 matches C1 in the natural B1F
sample because those matched encounters did not queue a trait extra; the fixed
deep axis below verifies the extra-action distinction.

| Population | Condition | Single p50 | Pair p50 | Pair before kill p50 | E2 pair p50 | Death | Reward reach | Build reach |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Fight | C0 | 3 | 7 | 4 | 4 | 0.890 | 0.945 | 0.947 |
| Fight | C1 | 3 | 6 | 2 | 4 | 0.882 | 0.969 | 0.971 |
| Fight | C2 | 3 | 6 | 2 | 4 | 0.882 | 0.969 | 0.971 |
| Visible flee | C0 | 3 | 2 | — | 2 | 0.815 | 0.982 | 0.983 |
| Visible flee | C1 | 3 | 1 | — | 1 | 0.796 | 0.982 | 0.983 |
| Visible flee | C2 | 3 | 1 | — | 1 | 0.796 | 0.982 | 0.983 |

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
| B8 | 3–9 / 5.90 | 2–6 / 4.50 | 2–6 / 4.50 | 342 | 0 | 293 |
| B18 | 2–9 / 5.13 | 2–6 / 4.00 | 2–6 / 4.00 | 236 | 0 | 200 |
| B30 | 2–7 / 4.10 | 2–5 / 3.43 | 2–5 / 3.47 | 197 | 0 | 172 |

The C2 cells retain the production compositions and their trait firings; the
C1 upper-bound probe suppresses all extra turns by design. No enemy stats,
targeting, initiative rolls, loot, flee formula, or reward formula were
changed.

## Fresh-save manual gate

The gate was exercised against both revisions using new browser contexts with
no saved data. Each run started from town, selected the default vanguard kit
and B1F, and entered a natural B1F encounter. All recorded runs had no page
errors.

| Revision | Fresh runs | Observed play | Resulting evidence |
| --- | ---: | --- | --- |
| before (`d42ffaa0`) | 4 | `群れネズミ`, `分裂スライム`, `コボルトの斥候`, and `マッドスライム` | Attack/defense choices resolved; `分裂スライム` was killed and visibly split into two independent actors; victories showed explicit loot. The `マッドスライム` run was intentionally continued through repeated defense and made the accumulating HP cost visible. |
| after (`5129e92c`) | 2 | `錆びた盾兵 + かみつき蟲`; `群れネズミ + マッドスライム` | The pair attack run showed the shared-slot message once per resolved round, killed `錆びた盾兵` first, continued against `かみつき蟲`, and ended with victory and materials. The pair flee run showed one hit, a flee follow-up hit, and a one-space retreat. |

The observed log excerpts establish the player-facing gate:

1. **Pair pressure:** the after pair visibly presented two targets and incoming
   damage while the single before runs had one active actor. The C0/C2 primary
   table provides the controlled comparison: pair p50 `7 → 6`, single p50
   unchanged at `3`.
2. **First-kill meaning:** before, killing `分裂スライム` produced the explicit
   `2体に分裂` consequence; after, killing `錆びた盾兵` left
   `かみつき蟲`, so target order still changes the remaining threat.
3. **Explainable damage/death risk:** no fresh run ended in death, but every
   observed loss was attributable in the log to a named enemy hit, a flee
   follow-up, or a trap/self-destruct message, with the numeric HP change shown.
   The unit and measurement gates cover the fatal-rate population (`0.890 →
   0.882` for fight C0 → C2).
4. **Next action:** after the first target died, the next action was directed at
   the remaining enemy; after the flee choice, the player was visibly one cell
   back. The single-run split also required changing target after the first
   split body died.
5. **Loot/build expectation:** before and after victories displayed explicit
   material rewards. The fresh save began with the named `鋼の前線キット`, and
   the measured build-reach axis remained unchanged (`0.947 → 0.971` for
   fight C0 → C2); no build purchase was forced into the short B1F sample.
6. **Cost judgment:** the after flee run exposed both the ordinary hit and the
   flee follow-up damage before the one-space retreat; the before defense run
   exposed the continuing HP cost of spending turns without attacking.
7. **Before/after decision:** the player-facing signals changed as intended:
   single exposure stayed stable, a pair still felt more demanding than a
   single, but ordinary pair turns were visibly consolidated and the choice to
   kill one target first or flee remained meaningful.

The deterministic unit gate additionally verified the multi-enemy production
schedule, preserved `multiAction` extras, and the player-facing shared-slot log
message. The natural before run did not produce an ordinary pair, so the
before/after pair comparison is intentionally supported by the controlled C0/C2
measurement rather than claimed as a paired manual replay.

## Verification

- `npm run test:unit`: PASS 189 / FAIL 0 / SKIP 3
- `npm run lint`: passed
- `npm run build`: passed (pre-existing large-chunk warning only)
- `git diff --check`: passed
- Focused shared-slot unit test: passed
