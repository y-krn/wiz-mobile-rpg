# Issue #1078 loot supply measurement

## Scope and provenance

- Runner: `scratch/measurements/issue1078_loot_supply.js`
- Runner version/schema: `issue1078-loot-supply-v1` / `1`
- Scope: `formula` (production chest and equipment-generation functions)
- Base: `origin/main` at `b92cc8add08fdbbd800d9688ed20d9a786927be9`; freshness was verified by fetch before the run
- Measured head/runner commit: `5ef2336b97238deef5dc0c793d47f679c2a785d0`
- Seed: `1078`
- Runs: `N=500` per band, three representative floors per band
- Decisions: three ordinary chest bundles per run; each bundle contains the production main reward and accessory path
- Provenance: origin/main ancestor `true`, working tree clean `true`, measured-path diff SHA-256 `0d4bcded8376b9c7e3563c488bf0a1020cbed75513125f82acab3059d4dd2aad`
- Determinism: two identical N=500 reruns at the committed head produced report SHA-256 `770212225a7314676fb40f59e49b35ee3a2e97fcbcdd9ea254c55c7febdf8a40`
- Modeled source: `rollChestReward`, `rollChestAccessory`, `getChestItemCandidatesByFloor`, `RUNE_SUPPLY_BANDS`, `EQUIPMENT_CANDIDATES_BY_FLOOR`, production equip validation/preview

## Supply result

Rates below use 1,500 main decisions per band. Equipment exposure includes
the accessory path; target pivot is divided by generated equipment carrying a
production `lootRole` target.

| Band | Main non-empty | Equipment / decision | Rune / decision | Consumable / decision | Target pivot | Actual pivot | True pivot adopted |
|---|---:|---:|---:|---:|---:|---:|---:|
| B1–5 | 61.2% | 44.5% | 14.5% | 14.2% | 3.7% | 18.1% | 76.0% |
| B6–10 | 83.7% | 61.1% | 28.3% | 9.8% | 9.4% | 24.5% | 76.0% |
| B11+ | 84.6% | 58.2% | 29.9% | 10.7% | 14.9% | 29.8% | 70.8% |

Per-run target-pivot exposure (`0 / 1 / 2+`) was `480 / 20 / 0`,
`426 / 68 / 6`, and `392 / 96 / 12` for B1–5, B6–10, and B11+.
True pivot adoption was `415 / 78 / 7`, `353 / 126 / 21`, and
`339 / 138 / 23`. The policy is a neutral measurement rule using production
`canEquipEquipment` and `getEquipmentPreview`, accepting a positive primary
delta or a Core; it is not a human-preference or optimal-role selector.

Core find and equip distributions (`0 / 1 / 2+`) were:

| Band | Core found | Core equipped | Main-axis Cores simultaneously equipped |
|---|---|---|---|
| B1–5 | `410 / 84 / 6` | `417 / 78 / 5` | `439 / 60 / 1` |
| B6–10 | `310 / 162 / 28` | `326 / 148 / 26` | `357 / 130 / 13` |
| B11+ | `286 / 168 / 46` | `300 / 160 / 40` | `323 / 156 / 21` |

The exact Main-axis Core distribution (`0 / 1 / 2 / 3 / 4+`) was
`439 / 60 / 1 / 0 / 0`, `357 / 130 / 13 / 0 / 0`, and
`323 / 156 / 18 / 3 / 0` for the same three bands.

Generated equipment carried at most one Core in all measured items. Core-item
counts were 96/668, 218/917, and 269/873 from B1–5 through B11+; the rest of
the equipment exposure retained Support-only or base-only outcomes. Medium +
Rune same-bundle pairs were `0` in every band.

## Rune supply audit

Supply is cumulative and independent of player level/class:

- B1+ shallow: `HALITO`, `DIOS`, `DIURCO`, `BADIOS`, `MILWA`, `DUMAPIC`
- B3+ early-mid: `KATINO`, `LAHALITO`, `MAHALITO`, `DIALKO`, `LATUMOFIS`, `MADIOS`, `VULNERA`
- B6+ mid: `MASFEAL`, `MADALTO`, `LOMILWA`, `MADI`, `MABARRIER`, `MONTINO`, `MORLIS`, `WEAKEN`
- B11+ deep: `TILTOWAIT`, `DIALMA`

Observed Rune tiers were:

| Band | Shallow | Early-mid | Mid | Deep |
|---|---:|---:|---:|---:|
| B1–5 | 124 | 94 | 0 | 0 |
| B6–10 | 122 | 128 | 175 | 0 |
| B11+ | 119 | 128 | 156 | 45 |

Representative candidate audits retained all five equipment behavior
profiles (`light`, `blade`, `impact`, `heavy`, `medium`) and weapon/armor/
shield types at B5, B6, and B11+. Two-hand candidates were present from B3
(`SAGE_STAFF`), expanded at B5 (`CLAYMORE`, `ARCH_WAND`), and remained
eligible in the deeper cumulative pools. No ordinary candidate audit included
restricted legendary chest bases.

## Build-blind invariance

Matched seeded sequences covered 4,500 main/accessory samples per variant.
The variants changed starting kit, equipped weapon/medium/shield, socketed
Rune, HP, and MP:

| Comparison | Samples | Mismatches |
|---|---:|---:|
| vanguard-low-resource vs arcana-full-resource | 4,500 | 0 |
| vanguard-low-resource vs devotion-wounded | 4,500 | 0 |

The candidate/reward sequences were invariant. Permanent Workshop unlocks
remain an explicit world-state input to production generation, as allowed by
the Issue contract.

## Decision and limits

The measured result supports the Issue #1078 decision: Rune access is staged
by floor band, horizontal equipment choices persist as depth increases, Core
is not used to fill the #1075 registry gap, and ordinary generation has no
current-build answer path or Medium/Rune pairing guarantee.

This is a formula-scope supply audit. It omits human long-run preference,
map traversal, combat, merchants, material economy, and live telemetry
transport. Lifecycle fields and `adopted`/`left` observability are covered by
the production telemetry unit tests; the runner does not claim to model the
transport layer.
