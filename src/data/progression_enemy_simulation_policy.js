// balance-impact: none — Pure diagnostic policy; intentionally disconnected from production rules.

const freezeRows = rows => Object.freeze(rows.map(row => Object.freeze(row)));

export const PROGRESSION_ENEMY_SIMULATION_POLICY = Object.freeze({
  status: "design-only",
  productionConnected: false,
  contractSource: "PROGRESSION_ENEMY_CONTRACT",
  candidateValues: "Phase 4c v1 fixed: player physical/spell 1 + 0.16 × baseline; Level 1 HP 20 × (1 + 0.10 × baseline); raw DEF bonus 0; HP buffer 0; enemy HP 1 + 0.20 × band; enemy ATK 1 + 0.10 × band; enemy DEF 1.0",
  priorDiagnosticEvidence: "Phase 4h GitHub Actions #35945138644; N=200, seed=1698, source 512aad1fd33a8339418df7e9e8011a594388a040, 8,800 observations / 4,400 pairs, paired-seed mismatches 0, control delta 0, artifact sha256:6bdf0d2de6e7f3586146f613edab5a205e99c6987cc10686ec4c82db17e668e1; Priest/devotion attack-defend vs attack-only showed forced Guard action cost breaks generic viability despite per-hit mitigation",
  comparison: Object.freeze([
    "current production reference",
    "current production vs the fixed Phase 4c v1 player milestone baseline + generic enemy band scale candidate"
  ]),
  contexts: freezeRows([
    {
      id: "pre-milestone",
      timing: "fight milestone Boss before defeat",
      baselineSource: "maximum of entitlement for the actually selected startFloor and the highest milestone defeated earlier in this run",
      baselineRule: "floor entry alone does not advance baseline; the current milestone Boss is excluded until defeated"
    },
    {
      id: "selected-deep-start",
      timing: "start a run at the selected milestone floor",
      baselineSource: "entitlement for the actually selected startFloor only",
      level: 1,
      baselineRule: "selected startFloor entitlement; ignore other globally unlocked milestones"
    },
    {
      id: "post-milestone",
      timing: "first floor after milestone Boss defeat",
      baselineSource: "maximum of selected startFloor entitlement and highest milestone defeated in this run",
      baselineRule: "milestone defeat advances baseline for the next floor"
    }
  ]),
  coverage: Object.freeze({
    referenceFloors: Object.freeze([
      Object.freeze({ floor: 1, role: "B1 start / baseline 0 reference" }),
      Object.freeze({ floor: 30, role: "generic B30 reference; exclude B30 Boss authored rule" })
    ]),
    milestoneFloors: Object.freeze([5, 10, 20]),
    contextFloorMapping: Object.freeze({
      "pre-milestone": "Boss floor M, before its defeat",
      "selected-deep-start": "selected startFloor M at Level 1",
      "post-milestone": "floor M+1 after defeating Boss M"
    }),
    focusedRegressionOnly: Object.freeze([
      Object.freeze({ milestoneFloor: 15, preBaseline: 2, selectedStartBaseline: 3, postFloor: 16, postBaseline: 3 }),
      Object.freeze({ milestoneFloor: 25, preBaseline: 4, selectedStartBaseline: 5, postFloor: 26, postBaseline: 5 })
    ]),
    focusedBoundaryRegression: Object.freeze([
      Object.freeze({ point: "B1 start before B5 defeat", selectedStartFloor: 1, highestEarlierDefeatedMilestone: null, baseline: 0 }),
      Object.freeze({ point: "B6 after B5 defeat", selectedStartFloor: 1, highestEarlierDefeatedMilestone: 5, baseline: 1 }),
      Object.freeze({ point: "B10 Boss before defeat; floor entry does not advance", selectedStartFloor: 1, highestEarlierDefeatedMilestone: 5, baseline: 1 })
    ])
  }),
  layers: Object.freeze({
    fixedGenericCombat: Object.freeze({
      purpose: "isolate milestone baseline and generic enemy raw band scale",
      reuse: "production combat semantics with fixed representative generic enemy and non-specialized equipment",
      fixtures: Object.freeze([
        Object.freeze({ id: "physical", axis: "Fighter / vanguard; production normal attack" }),
        Object.freeze({ id: "spell", axis: "Mage / arcana; production spell combat; record MP spend" }),
        Object.freeze({ id: "defensive", axis: "Priest / devotion attack-only; Guard excluded from generic viability and treated as situational for telegraphs or queued specials" })
      ]),
      holdConstant: Object.freeze([
        "enemy fixture within each paired comparison",
        "representative non-specialized equipment",
        "no loot, rarity, Named, Support, or Core vertical modifiers",
        "no Boss-authored mechanics"
      ]),
      metrics: Object.freeze([
        "survival / death",
        "rounds",
        "damage dealt",
        "damage taken",
        "post-combat HP",
        "enemy actions",
        "player actions",
        "player-before-any-enemy",
        "selected / executed attack and defend actions for defensive fixture; defend must be 0",
        "spell / MP spent when applicable"
      ])
    }),
    runLocalLevelDelta: Object.freeze({
      purpose: "measure incremental run-local growth without substituting for milestone baseline",
      compare: "Level 1 and production-earned run-local Level at the same baseline",
      levelSource: "production EXP / Level contract or explicitly attributed existing run evidence; never candidate-invented",
      metrics: Object.freeze(["Level", "max HP difference", "combat outcome difference", "baseline id", "baseline source"])
    })
  }),
  pairedSeeds: Object.freeze({
    required: true,
    key: Object.freeze(["root seed", "milestone context", "fixture", "runIndex"]),
    cellIdentity: Object.freeze(["policy", "comparison arm", "milestone context", "fixture", "Level", "runIndex"]),
    rule: "current production and Phase 4c v1 candidate share the seed derived from root seed, milestone context, fixture, and runIndex; policy, arm, and Level are recorded in cell identity / provenance, never in seed derivation"
  }),
  samplePolicy: Object.freeze({
    below30: "correctness / runner validation only; no balance conclusion",
    pullRequest: "smoke and focused regression only; no Heavy simulation",
    postMerge: "GitHub Actions artifact at N=200 is the authoritative balance evidence",
    expandN200AcrossEveryMilestone: false
  }),
  interpretationGates: Object.freeze([
    "deep-start Level 1 is not fundamentally underpowered in its selected band",
    "pre-milestone and post-milestone / deep-start baseline differences follow the timing contract",
    "run-local Level remains incremental and does not replace milestone baseline",
    "generic combat remains viable without equipment vertical differences",
    "raw enemy stat growth alone does not dominate deep difficulty",
    "physical, spell, and defensive fixtures avoid an extreme isolated collapse",
    "no specific Support, Core, Rune, or Named item is required",
    "Boss-authored mechanics remain separate from generic band scale"
  ]),
  exclusions: Object.freeze([
    "additional candidate values or automatic adoption of Phase 1/2a values",
    "production player, enemy, Level, EXP, reward, item, loot, or Boss changes",
    "all-coefficient scans or separate broad player/enemy coefficient sweeps",
    "full build Cartesian product",
    "Heavy simulation inside the PR",
    "Boss-authored encounters, including B30 Boss mechanics, as generic-scale tuning targets",
    "SAVE_VERSION changes and save migration",
    "claims beyond the fixed fixtures, policies, and observed metrics"
  ]),
  artifact: Object.freeze({
    authoritativeLocation: "merged GitHub Actions artifact",
    sampleSize: 200,
    requiredFiles: Object.freeze(["raw observations", "summary"]),
    provenance: Object.freeze([
      "source SHA",
      "gameplay SHA",
      "runner SHA and runner version",
      "policy version",
      "configuration and cell identity",
      "seed policy and per-run seed",
      "sample size",
      "GitHub Actions run identity"
    ])
  })
});
