# Issue #697: milestone merchant supply measurement

## Question and decision status

This is a measurement-only result. It measures the current milestone merchant
purchase path and tests scratch-only MANA_POTION and Return Wing price probes.
No production stock, item price, MP rule, chest/departure rule, or economy value
was changed.

- **MANA_POTION:** current simulation demonstrates a real MP supply gap and
  material-constrained candidate behavior, but no authoritative merchant price
  exists. Follow-up design is required; do not add stock from this result alone.
- **EYE_DROPS:** decision-ready evidence supports keeping the current production
  stock entry at `霊粉:1`; the current-main rebaseline shows acquisition and use.
- **PANACEA:** not decision-ready. No authoritative merchant price was found;
  no PANACEA price was fabricated or simulated.
- **Return Wing:** current `黒角:36 + 呪布:27` is price-blocked. A cheap
  affordability probe is purchased and used, so price is a real blocker, but it
  remains the same `TOWN_PORTAL` role already supplied by the milestone return
  portal. Keep the role/placement decision separate from any price rewrite.

## Provenance and reproducibility

- Source SHA: `7a66eb7563f0f5a3f2831585a788980fef535554`.
- `origin/main` resolves to that SHA; `git merge-base --is-ancestor
  origin/main HEAD` passed before measurement. `staleTreeAllowed=false` in all
  measurement JSON.
- Runner: `scratch/simulations/sim_depth_material_ev.js`, `// sim-scope: run`; it imports
  the real `generateRunFloor`, real round resolution, rewards/levels, inventory,
  crafting, material spending, status cures, portal use, and MP instrumentation.
- Matched configuration: `SIM_RUNS=2000` (500 each Fighter/Thief/Priest/Mage),
  `SIM_CALIBRATION_RUNS=100`, `SIM_SEED=231`, `SIM_SCENARIOS=workshop-empty`,
  `policy=powder`, target `B20`; `SIM_PARALLEL` omitted. Cases differ only by
  the explicitly named scratch candidate env setting.
- Baseline replicate commands were run twice with identical output hash
  `e51453cd298f457f251e3a5e70fca0a803a6a35682ee22c0ac6b3859e9599f9b`.
- Raw JSONL and stderr remain outside the repository under
  `/private/tmp/issue-697-*.out` and `.err`; wall-clock times were 255.86–267.21
  seconds per 2,000-run case.

Exact runner forms:

```sh
SIM_RUNS=2000 SIM_CALIBRATION_RUNS=100 SIM_SCENARIOS=workshop-empty \
  node scratch/simulations/sim_depth_material_ev.js
SIM_RUNS=2000 SIM_CALIBRATION_RUNS=100 SIM_SCENARIOS=workshop-empty \
  SIM_MERCHANT_EYE_DROPS=1 node scratch/simulations/sim_depth_material_ev.js
SIM_RUNS=2000 SIM_CALIBRATION_RUNS=100 SIM_SCENARIOS=workshop-empty \
  SIM_MERCHANT_MANA_COST='魔石片:1' node scratch/simulations/sim_depth_material_ev.js
SIM_RUNS=2000 SIM_CALIBRATION_RUNS=100 SIM_SCENARIOS=workshop-empty \
  SIM_MERCHANT_MANA_COST='魔石片:2' node scratch/simulations/sim_depth_material_ev.js
SIM_RUNS=2000 SIM_CALIBRATION_RUNS=100 SIM_SCENARIOS=workshop-empty \
  SIM_MERCHANT_MANA_COST='魔石片:3,呪布:1' node scratch/simulations/sim_depth_material_ev.js
SIM_RUNS=2000 SIM_CALIBRATION_RUNS=100 SIM_SCENARIOS=workshop-empty \
  SIM_MERCHANT_RETURN_WING=1 node scratch/simulations/sim_depth_material_ev.js
SIM_RUNS=2000 SIM_CALIBRATION_RUNS=100 SIM_SCENARIOS=workshop-empty \
  SIM_MERCHANT_RETURN_WING=1 SIM_MERCHANT_RETURN_WING_COST='黒角:1' \
  node scratch/simulations/sim_depth_material_ev.js
```

Output SHA-256 hashes, in the same order as the commands above (baseline hash
is the replicated baseline output):

```text
baseline: e51453cd298f457f251e3a5e70fca0a803a6a35682ee22c0ac6b3859e9599f9b
eye:      dfb859c4a08e58ed41034d41377c697e4f9bd2f61f0ea3b6731d3facc8ca524f
mana-1:   303df134e89e9537dd62c6ee73eb1e40d10f4f2586942ff0774266c5ab22a159
mana-2:   afbe17921e4cc03a5e05c90f9417153380dfaddda51eb1ac34c85fa97e5ec2b5
mana-3:   048a080d22324755f4f167a5eda73de483a263a33e718a7ed270761962e7111a
wing:     6b7acc75ee52f6e63bd06a4c857279eebac9532e026ee4091c6905b5532fcb23
wing-1:   4afc60bbe06a565c84bd44ca82767b5406a44d16e2c845b704ebc46f2f4fe7d1
```

## Baseline merchant stock and item accounting

The table reports `merchant success` separately from all-run item acquisition
and consumption. The latter includes chest/craft/other sources, so it is the
correct stock-need denominator rather than a claim that the merchant supplied
every item.

| stock | source cost | attempts | successes | failures | merchant acquired | all-run acquired / consumed |
|---|---:|---:|---:|---|---:|---:|
| 鑑定粉 (`identify_powder`, service ticket) | 霊粉:2 | 0 | 0 | — | 0 | n/a / n/a |
| HEAL_POTION | 獣の牙:1 | 79 | 75 | inventory_full:4 | 75 | 682 / 612 |
| ANTIDOTE | 毒腺:1 | 87 | 87 | — | 87 | 644 / 326 |
| EYE_DROPS | 霊粉:1 | 0 | 0 | — | 0 | 479 / 148 |
| WAKE_POWDER | 霊粉:1 | 47 | 46 | insufficient_materials:1 | 46 | 589 / 0 |
| PARALYZE_CURE | 硬い皮:1 | 59 | 59 | — | 59 | 215 / 0 |
| GUARD_POTION | 硬い皮:2 | 0 | 0 | — | 0 | 0 / 0 |
| STR_POTION | 獣の牙:2 | 0 | 0 | — | 0 | 544 / 11 |
| HASTE_POTION | 毒腺:2 | 0 | 0 | — | 0 | 528 / 12 |
| TOWN_PORTAL / Return Wing | 黒角:36 + 呪布:27 | 0 | 0 | — | 0 | 294 / 174 |
| TRAP_KIT | 骨片:2 | 0 | 0 | — | 0 | 528 / 490 |

Items never purchased by the current automatic simulation policy are
`identify_powder`, `EYE_DROPS`, `GUARD_POTION`, `STR_POTION`, `HASTE_POTION`,
`TOWN_PORTAL`, and `TRAP_KIT`. This means no purchase attempt was generated by
the modeled policy; it does not claim that a human can never click those
offers. Current policy does attempt the healing/status stock when missing.

## MP gap and MANA_POTION candidates

Baseline versus price probes:

| case | candidate stock attempts / successes / failures | MANA acquired / consumed | merchant acquired / consumed | merchant material spend | reached floor | survival |
|---|---:|---:|---:|---|---:|---:|
| baseline | n/a | 497 / 82 | 0 / 0 | — | 2.837 [2.74, 2.94] | 8.8% [7.6%, 10.0%] |
| `魔石片:1` | 69 / 69 / 0 | 581 / 130 | 69 / 37 | 魔石片:69 | 2.834 [2.73, 2.94] | 8.7% [7.5%, 9.9%] |
| `魔石片:2` | 69 / 69 / 0 | 569 / 131 | 69 / 37 | 魔石片:138 | 2.832 [2.73, 2.93] | 8.65% [7.4%, 9.9%] |
| `魔石片:3,呪布:1` | 71 / 70 / 1 insufficient_materials | 577 / 134 | 70 / 38 | 魔石片:210, 呪布:70 | 2.840 [2.74, 2.94] | 8.75% [7.5%, 10.0%] |

Acquisition/consumption by source for MANA_POTION (all 2,000 runs): baseline
departure craft 264/chest 233/merchant 0; candidate `魔石片:1`
279/233/69; `魔石片:2` 268/232/69; craft-equivalent 273/234/70. Consumption
was respectively 54/28/0, 47/28/37, 48/28/37, and 49/28/38 for
departure/chest/merchant, plus post-combat consumption 82, 94, 95, and 96;
combat consumption was 0, 18, 18, and 19. The candidate is therefore acquired
and consumed in the real path, but the price changes are not a causal survival
win at this sample size.

Spell and MP evidence is not inferred from depth alone. Baseline selected /
applied / failed casts were HALITO 1179/1147/32, LAHALITO 169/167/2,
MAHALITO 114/108/6, BADIOS 5441/5366/75, DIOS 220/184/36, and MADIOS
198/175/23. The corresponding `魔石片:1` values were 1264/1227/37,
175/173/2, 115/112/3, 5526/5454/72, 218/183/35, and 196/173/23.

| class (500 runs) | baseline floor / survival / retreat / death / final MP | baseline MP-depletion end / blocked terminal | `魔石片:1` floor / survival / final MP |
|---|---|---:|---|
| Fighter | 2.230 / 5.4% / 5.4% / 94.6% / 0.004 | 0 / 0 | 2.230 / 5.4% / 0.004 |
| Thief | 4.680 / 23.4% / 23.4% / 76.6% / 0.022 | 0 / 0 | 4.682 / 23.4% / 0.022 |
| Priest | 2.126 / 1.0% / 1.0% / 99.0% / 8.478 | 56 / 56 | 2.146 / 1.4% / 8.434 |
| Mage | 2.312 / 5.4% / 5.4% / 94.6% / 11.704 | 2 / 2 | 2.278 / 4.6% / 11.744 |

Across Priest MP pressure, baseline had 10,219 candidate checks, 2,323
MP-insufficient blocks, and 2,323 MP blocks; the `魔石片:1` case had 10,347,
2,311, and 2,311. Mage had 1,970/668/668 versus 2,162/833/833. These
measurements show MP pressure and actual potion use, while the unchanged or
noisy survival/depth results leave the gameplay value and authoritative price
unresolved.

## EYE_DROPS and #779 provenance

The current-main rebaseline with the existing production `EYE_DROPS` stock at
`霊粉:1` produced 90 attempts, 88 successes (one insufficient-material and one
inventory-full failure), 88 merchant acquisitions, and 192 total uses. Overall
EYE acquisition/consumption was 567/192; reached floor was 2.8505
([2.75, 2.95] mean CI), survival 8.9% ([7.7%, 10.2%]). The status counter and
per-item counter both report exactly 192 uses.

PR #779/#701 remains prior evidence only: source SHA
`2fb9d494d57ae29358a1ff747e6252e74b46a41d`, old base `fe5ccc...`, raw output
hash `30734a...`. Its execution path was the same real-run family, but its old
base is not treated as a current-main result. The narrow current-main check
above revalidates the relevant path.

## Return Wing

With the authoritative current stock cost `黒角:36 + 呪布:27`, the runner made
62 purchase attempts, 0 successes, and 62 `insufficient_materials` failures.
No merchant portal was acquired or used; baseline portal use was 174 chest
acquisitions used. The scratch-only affordability probe `黒角:1` made 53
attempts and 53 successes, acquired 53 merchant portals, and used 32 of them
(merchant source 0.016/run); total portal use was 178. This establishes a
price/material constraint, not a fabricated canonical price. Because both
paths use `TOWN_PORTAL` and the real milestone route already has a return portal
role, a follow-up must decide whether an extra merchant Wing is useful before
changing its price.

## #692 instrumentation cross-check

For every case, consumption from `averageConsumableUsageByItem × 2000` matched
the existing status-cure counters exactly (delta 0) for ANTIDOTE, EYE_DROPS,
HOLY_WATER, and PANACEA. Baseline was 326/148/168/138; EYE was 328/192/177/136;
MANA `魔石片:1` was 322/149/158/130. Acquisition and consumption are both
reported; zero consumption for WAKE_POWDER/PARALYZE_CURE in this policy is a
real observed no-use count, not an instrumentation omission.

## Modeled and omitted mechanisms

Modeled: source merchant purchase validation, material affordability and spend,
20-slot inventory-full failures, all real floor generation/combat/reward/level
paths, status cure and consumable acquisition/consumption, spell selection and
MP blocking, portal acquisition/use source, and class outcomes. The synthetic
MANA and cheap-Wing entries exist only in the scratch harness.

Omitted: manual UI click frequency, a canonical MANA/PANACEA merchant price,
production merchant stock changes, alternate scenario policies, economy or
balance changes, and a product decision about Return Wing role duplication.
No game-design canon update is required because no rule or value changed.

## Verification

- `node --check scratch/simulations/sim_depth_material_ev.js` passed.
- N=1 smoke passed before long runs.
- Deterministic baseline replicate passed with identical hashes.
- `git diff --check` passed before this document was added.
- Remaining repository checks are listed in the handoff/Issue record and will
  be run before commit: `npm run lint`, `npm run test:unit`,
  `node scripts/check_doc_paths.js`, and final `git diff --check`.
