# Issue #1187 fresh B1F early-encounter cause evidence

## Question and scope

この測定は、fresh save + `鋼の前線` (`vanguard`) の B1F 最初の1〜2戦で、
活路が消える主因を「multi-enemy exposure」「composition identity」「entry
resource / 継戦」「first action 前の Cost」「fight / flee」に分けるためのもの。
production の敵値・回復・先制保証は変更していない。

- Source: `e94843d546deee6eb9bcd9e786e3378007288a37`
- Base: local `origin/main` `c463c79500aa8079b5a21843292038232a0656cf`; this descends from the #1186 merge `20db2bbb7b4cc0d48017ab34840782b8160aca33`
- Remote freshness: `git ls-remote` / GitHub API は DNS 制約で確認できず、local `origin/main` の freshness は未検証
- Runner: `issue1187-early-encounter-cause-v4`, schema 4
- Scope: production-backed `simulateRun`, B1F → B2 target, N=1000 per primary policy; fixed #1151 reuse N=1000 per case
- Seed: primary `1187`; fixed composition `1151`
- Provenance: `originMainAncestor: true`, `workingTreeClean: true`, runner diff SHA-256 `94183d275c3dc3a4393bdf26d6413b449f2b9095868799234b8d4222a7a5f229`, environment hash `886842d72b2500e4`

Primary rows share `issue-1176:{seed}:{runIndex}` world seeds. The two suppression
rows are measurement-only counterfactuals: production encounter generation runs
first, then the first generated monster is retained for ordinal 1 or ordinals 1–2.
Baseline keeps the production composition unchanged. They are not production
specifications.

## Run-level results

| Policy | B1F death | B2 arrival | Meaningful reward | Equipment opportunity | E1 pair raw / effective | E2 pair raw / effective |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| production baseline | 90.10% | 9.90% | 93.80% | 89.00% | 26.20% / 26.20% | 14.70% / 14.70% |
| suppress first multi | 88.20% | 11.80% | 96.80% | 93.10% | 26.20% / 0.00% | 16.50% / 16.50% |
| suppress first two multi | 86.80% | 13.20% | 98.20% | 94.50% | 26.20% / 0.00% | 16.50% / 0.00% |

The candidate deltas against baseline are +1.9 percentage points B2 arrival for
first-only suppression and +3.3 points for first-two suppression. The same
counterfactuals also increase reward and equipment-opportunity reach because
more runs remain alive; this is sensitivity evidence, not a target rate.

## A1 — single vs pair exposure and first action

The production baseline reached encounter 1 in 922/1000 runs and encounter 2 in
493/1000. Early encounter rows were:

| Ordinal | Visible enemies | Encounters | Deaths | Encounter lethality | Deaths before first player action | First-action damage p50 / p95 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1 | 660 | 116 | 17.58% | 14 | 1 / 4 |
| 1 | 2 | 262 | 161 | 61.45% | 10 | 2 / 5 |
| 2 | 1 | 346 | 120 | 34.68% | 19 | 1 / 4 |
| 2 | 2 | 147 | 128 | 87.07% | 19 | 2 / 6 |

Across all baseline encounter-1 rows, the first player action executed before
any enemy in 397 cases, after an enemy action in 496, and did not execute in 29.
For encounter 2 the corresponding counts were 223, 231, and 39. The median
enemy actions before the first player action was 1 in both ordinals; median
damage before it was 1 HP. Thus the first-action opportunity is often present,
but the pair has materially higher Cost and lethality. Death before first action
was 24/277 (8.66%) at ordinal 1 and 38/248 (15.32%) at ordinal 2.

The production early survival curve was 64.5% through encounter 1, 24.5%
through encounter 2, and 8.4% through encounter 3. Death encounter ordinals
were 1:277, 2:248, 3:87, 4:30, 5:7, and `unknown`:252.

The natural-run entry-resource distribution connects the ordinal populations to
the fixed HP bands used below. These are baseline production rows; single/pair
uses raw generated visible enemy count, before counterfactual suppression.

| Ordinal | Group | Encounters | HP p25 / p50 / p75 | MP p25 / p50 / p75 | HP ≤25 / 26–50 / 51–75 / >75 |
| ---: | --- | ---: | ---: | ---: | ---: |
| 1 | all | 922 | 60.9% / 90.0% / 100.0% | 100.0% / 100.0% / 100.0% | 58 / 110 / 203 / 551 |
| 1 | single | 660 | 60.9% / 100.0% / 100.0% | 100.0% / 100.0% / 100.0% | 37 / 80 / 144 / 399 |
| 1 | pair | 262 | 60.7% / 87.0% / 100.0% | 100.0% / 100.0% / 100.0% | 21 / 30 / 59 / 152 |
| 2 | all | 493 | 25.0% / 40.0% / 60.0% | 100.0% / 100.0% / 100.0% | 133 / 179 / 117 / 64 |
| 2 | single | 346 | 25.0% / 40.0% / 60.0% | 100.0% / 100.0% / 100.0% | 93 / 127 / 86 / 40 |
| 2 | pair | 147 | 25.0% / 40.0% / 65.1% | 100.0% / 100.0% / 100.0% | 40 / 52 / 31 / 24 |

Although all MP quartiles are full, the minimum MP rate was 0% in 24 rows at
each ordinal (16/8 single/pair at ordinal 1; 17/7 at ordinal 2), so this is not
evidence that every survivor retains full MP. HP is the clearer carryover axis:
ordinal 1 is mostly above 75%, while ordinal 2 has 63.3% of all entries at 50%
HP or below. The distributions are similar for singles and pairs, so entry HP
alone does not explain the pair lethality gap.

The corresponding encounter Cost and survivor post-combat HP distributions are:

| Ordinal | Group | Encounters / deaths | Normal damage p50 / p95 | Survivor HP p50 / p95 | Survivor HP rate p50 / p95 |
| ---: | --- | ---: | ---: | ---: | ---: |
| 1 | all | 922 / 277 | 8 / 20 | 12 / 19 | 60% / 95% |
| 1 | single | 660 / 116 | 6 / 16 | 13 / 19 | 65% / 95% |
| 1 | pair | 262 / 161 | 14 / 21 | 10 / 18 | 50% / 85% |
| 2 | all | 493 / 248 | 6 / 16 | 9 / 18.8 | 40% / 86.6% |
| 2 | single | 346 / 120 | 4 / 13 | 10 / 18.75 | 44% / 86.5% |
| 2 | pair | 147 / 128 | 11 / 19 | 7 / 14.5 | 30.77% / 72.5% |

For the 493 runs that reached both encounter 1 and encounter 2, the encounter
1 survivor post-combat HP p50/p95 and the linked encounter 2 entry HP rate
p50/p95 were 13/19 HP and 40%/85% overall. Split by encounter-1 composition,
single was 14/19 HP and 44%/85% (414 runs), while pair was 11/20 HP and
32%/61.8% (79 runs). Linked encounter-2 entry MP rate was 100%/100% at p50/p95
for all three groups. This directly shows the carryover population and also
shows that the pair group enters the next encounter more damaged.

## A2/A3 — composition identity and entry resource

The reused fixed #1151 production pairs show a large composition effect at the
same full entry HP:

| Entry HP | High-risk fight clear | Low-risk fight clear | Low − high |
| ---: | ---: | ---: | ---: |
| 100% | 8.50% | 94.73% | +86.23 pp |
| 75% | 0.93% | 64.40% | +63.47 pp |
| 50% | 0.03% | 13.93% | +13.90 pp |
| 25% | 0.00% | 0.23% | +0.23 pp |

At HP 100%, the individual high-risk clear-rate 95% Wilson intervals were
23.50% [20.98%, 26.23%], 0.90% [0.47%, 1.70%], and 1.10% [0.62%, 1.96%].
The low-risk rows were 98.30% [97.29%, 98.94%], 96.70% [95.40%, 97.64%],
and 89.20% [87.12%, 90.98%]. The risk separation is therefore much larger
than the sampling interval in the representative pairs.

The HP-band collapse shows that entry resource is also causal: even low-risk
pairs fall from 94.73% at full HP to 0.23% at 25% HP. The natural distribution
above shows the same transition: ordinal 1 has HP p25/p50/p75 of 60.9% / 90.0%
/ 100.0%, while ordinal 2 is 25.0% / 40.0% / 60.0%; ordinal-2 death was
248/493 (50.30%) versus 277/922 (30.04%) at ordinal 1. This is consistent with
first-fight Cost carrying into the next encounter, but the similar single/pair
entry HP distributions mean it cannot explain the pair lethality gap by itself.
It does not establish that a free heal is the right fix; it identifies
resource/recovery as a separate follow-up axis.

## A4 — Cost before the first action

The fixed runner uses unchanged production initiative, equipment-load, and
FirstStrike semantics. At full HP, the six fixed fight cases all executed a
first player action in every run. Their first-action damage p50 was 2 HP; the
high-risk cases had p95 values 4–6 HP and the low-risk cases 4–5 HP. At 25% HP,
the first action executed in 2550/3000 high-risk runs and 2891/3000 low-risk
runs, so low entry resource increases preemption risk but does not explain the
full-HP composition gap by itself.

## A5 — fight / flee execution

The matched primary flee policy was production `visible-multi-enemy-flee`:

| Policy | B1F death | B2 arrival | Selected | Executed | Preempted | Survived | Parting-attack deaths |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Fight | 90.10% | 9.90% | 0 | 0 | 0 | — | — |
| Visible multi-enemy flee | 83.80% | 16.20% | 583 | 528 | 55 | 488 | 40 |

Flee execution survival was 488/528 = 92.42%. The result improves early
survival, but selected actions can be preempted and execution still has a
production parting-attack cost. It is not evidence for making flee free or
forcing all two-enemy encounters to flee.

Encounter-2 reach, distinct from B2 arrival, was 493/1000 (49.30%) for fight
and 604/1000 (60.40%) for the flee policy. Among runs with a flee selected at
encounter 1, 190/262 (72.52%) reached encounter 2; among executed flee runs,
190/252 (75.40%) did. The cohort result is descriptive: the policy changes the
population that remains available for the next encounter and is not a claim
that flee should be automatic.

## Interpretation and production boundary

- **A — 初期 multi-enemy exposure: 寄与はあるが主因とは未確定。** Pair
  exposure is 26.2% in encounter 1 and 14.7% in encounter 2, with 61.45% and
  87.07% pair lethality versus 17.58% and 34.68% for singles. Suppression moves
  B2 arrival by only 1.9–3.3 points, so enemy count alone does not explain the
  full funnel loss.
- **B — 特定 composition: strongest measured discriminator として強く支持。**
  Fixed full-HP pairs still show an 86.23-point high/low composition gap. Pair
  suppression also removes the second enemy identity/synergy, so this is not a
  clean count-only estimate.
- **C — resource 持ち越し: contributing axis として支持。** Natural linked
  rows move from encounter-1 survivor HP 13/19 p50/p95 to encounter-2 entry HP
  40%/85%, and the pair survivor cohort enters lower at 32%/61.8%. Fixed HP
  bands confirm strong attrition sensitivity, while recovery was intentionally
  not modeled.
- **D — 判断前 Cost: 主因ではない。** First-action-before-death was only
  24/277 (8.66%) at ordinal 1 and 38/248 (15.32%) at ordinal 2; the first
  action was usually executed, even though pair damage and post-combat HP were
  materially worse.
- **E — 複合: 現時点の総合判定として最も妥当。** Composition identity is the
  strongest discriminator, with multi-enemy exposure and HP carryover adding
  pressure; pair suppression alone produces only a limited funnel improvement.
- **F — 数値改善後も残る体験阻害: 親 #1184 で未解決。** The runner measures
  reward/build opportunity but cannot establish whether a player understood
  the cause of death or formed a next-trial hypothesis; this requires the
  manual fresh-save playtest gate in #1184.

The next production candidate boundary is [#1192](https://github.com/y-krn/wiz-mobile-rpg/issues/1192), which compares **early encounter composition pool / ordering / cadence** with fresh matched measurement and manual playtest. It does not specify pair reduction before composition identity is separated from enemy count. This Issue does not authorize or recommend a global enemy nerf, blanket two-enemy removal, free recovery, or a B1F-only combat rule. Keep #1184 open until that candidate is implemented, remeasured, and manually playtested.

## Reproduction and validity

```sh
node scratch/measurements/early_encounter_cause_diagnostic.js \
  --runs 1000 --fixed-runs 1000 --seed 1187 --fixed-seed 1151 \
  --purpose issue-1187-cause-decomposition \
  --ref issue/1187-fresh-b1f-diagnostic \
  --output /private/tmp/issue-1187-measurement-35b7236/issue-1187.json \
  --summary /private/tmp/issue-1187-measurement-35b7236/issue-1187.md \
  --manifest /private/tmp/issue-1187-measurement-35b7236/issue-1187.manifest.json
```

- `node --check` passed for all changed runners.
- Targeted #1186, #1151, and #1187 regressions passed; the final full unit gate
  passed 186 tests with 3 intentional skips.
- The runner uses production encounter generation, combat resolution, initiative,
  flee, reward, equipment, trap, and poison paths. No hidden optimal player or
  fixture win-rate equalization is used.
- First-action-before-enemy and first-action-before-death are distinct metrics;
  a measured zero would mean no observed damage event, not an omitted combat
  path. The final report records p50/p95 distributions and conditional
  denominators where the path is observed.
