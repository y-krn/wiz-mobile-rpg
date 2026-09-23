// balance-impact: none — Design contract only; intentionally disconnected from production rules.

export const PROGRESSION_ENEMY_CONTRACT = Object.freeze({
  status: "design-only",
  verticalPowerOwners: Object.freeze({
    milestoneBaseline: Object.freeze({
      source: "entitlement corresponding only to the actually selected startFloor",
      timing: "initialize from the selected startFloor entitlement; during the run use the maximum of that entitlement and the highest defeated milestone in this run",
      owns: Object.freeze([
        "equipment-independent physical combat baseline",
        "equipment-independent spell combat baseline",
        "equipment-independent max HP and defensive baseline"
      ]),
      doesNotOwn: Object.freeze(["equipment build identity", "run-local experience growth"])
    }),
    runLocalLevel: Object.freeze({
      source: "EXP earned during the current run",
      owns: Object.freeze(["small incremental max HP growth"]),
      doesNotOwn: Object.freeze([
        "deep-start baseline entitlement",
        "milestone baseline replacement",
        "equipment build identity",
        "depth-scaled offensive or defensive baseline"
      ])
    })
  }),
  bandSemantics: "Combat Tier vocabulary represents milestone bands, not floor-entry power; baseline = max(entitlement for the actually selected startFloor, highest defeated milestone in this run); globally unlocked but unselected milestones do not contribute",
  milestoneTiming: Object.freeze([
    Object.freeze({
      point: "B1 start, even when B20 is globally unlocked",
      selectedStartFloor: "B1",
      highestDefeatedMilestone: null,
      baseline: "B1 entitlement (baseline 0)",
      transition: "unselected global unlocks do not apply; floor entry grants no baseline"
    }),
    Object.freeze({
      point: "unlocked B5/B10/... start when selected",
      selectedStartFloor: "the selected unlocked milestone floor",
      highestDefeatedMilestone: null,
      baseline: "entitlement for that selected startFloor",
      transition: "applies from run start at Level 1"
    }),
    Object.freeze({
      point: "B20 start",
      selectedStartFloor: "B20",
      highestDefeatedMilestone: null,
      baseline: "B20 startFloor entitlement",
      transition: "global unlock is the source only because B20 was selected"
    }),
    Object.freeze({
      point: "B1 progression before B5 Boss defeat",
      selectedStartFloor: "B1",
      highestDefeatedMilestone: null,
      baseline: "B1 entitlement (baseline 0)",
      transition: "entering B5 does not advance baseline; B5 Boss is fought at baseline 0"
    }),
    Object.freeze({
      point: "after B5 Boss defeat, entering B6",
      selectedStartFloor: "B1",
      highestDefeatedMilestone: "B5",
      baseline: "maximum of B1 startFloor entitlement and B5 defeated-milestone baseline (baseline 1)",
      transition: "advances on defeat and applies from B6"
    }),
    Object.freeze({
      point: "each later milestone M (B10, B15, ...)",
      selectedStartFloor: "the startFloor actually selected for this run",
      highestDefeatedMilestone: "highest milestone defeated in this run",
      baseline: "maximum of selected startFloor entitlement and highest defeated-milestone baseline",
      transition: "milestone M Boss is fought on the prior run baseline; defeat advances it for M+1"
    })
  ]),
  equipmentBoundary: Object.freeze({
    verticalPowerOwner: false,
    phase3: Object.freeze({
      base: "combat profile and weapon hands/medium/Rune structure; no depth-based ATK/DEF growth",
      support: "bounded conditional/numeric reinforcement, not baseline growth",
      core: "rule-changing decision and resource exchange, not baseline growth",
      named: "authored special rule, not baseline growth",
      rarity: "build density and synergy, not a vertical power tier"
    })
  }),
  genericEnemyRawScale: Object.freeze({
    policy: "milestone-band baseline; do not make per-floor raw HP/ATK/DEF inflation the final contract",
    sameBandDifficulty: Object.freeze([
      "composition",
      "traits",
      "status",
      "telegraph and Guard decisions",
      "resource pressure",
      "rare and elite encounters"
    ]),
    rawStatChange: "authored band-level steps only when evidence requires them; per-floor automatic increase is not the default",
    diagnosticEvidence: "Phase 1/2a values may inform later measurement, but are not production values or defaults"
  }),
  bossException: Object.freeze({
    owner: "authored Boss rule keyed to the specific encounter",
    boundary: "keep Boss stats/mechanics separate from generic enemy band scaling; do not absorb authored exceptions into the generic formula"
  }),
  rewardExpFollowUp: Object.freeze({
    required: true,
    revisit: Object.freeze([
      "EXP and Level arrival pace by run start entitlement and depth",
      "milestone-start rewards versus continuous-run rewards",
      "reward scaling after generic enemy raw scaling changes"
    ]),
    rule: "do not preserve the old depth reward/EXP formula mechanically when enemy raw scaling changes"
  }),
  currentProductionInventory: Object.freeze({
    genericEnemy: "src/rules/depth_scaling.js: enemy multiplier = (1 + 0.035 × (floor - 1)) × (1 + 0.055 × floor((floor - 1) / 5)); HP uses full multiplier, ATK uses 58% of its increase, DEF uses 34% of its increase; Boss adds 12% HP, 8% ATK, and 20% EXP",
    levelAndExp: "src/systems/leveling.ts and src/data/progression.js: Level is run-local; each level adds 5 max HP plus up to 5 extra healing; EXP thresholds use 0.5 × the base curve from Level 2 onward; no Level-based offensive growth",
    deepStart: "src/menu/solo_start.js offers unlocked milestone floors; src/state/initial_state.js creates the starting character at Level 1 for each descent; this contract grants baseline only for the selected startFloor, not every globally unlocked milestone",
    combatTierDiagnostic: "src/rules/combat_tier.js: diagnostic-only Tier 0–5 vocabulary resolved from startFloor bands and defeated milestones; not connected to production combat",
    bossAuthoredOverrides: "src/rules/boss_rules.js and src/combat_ui/encounter.js: B30 ancient dragon restores template HP/ATK after generic Boss scaling; B5 demon guardian and B10 stone guardian have separate authored mechanics",
    rewardExp: "src/rules/depth_scaling.js: EXP multiplier = (1 + 0.045 × (floor - 1)) × (1 + 0.07 × floor((floor - 1) / 5)); Boss adds 20% EXP"
  })
});
