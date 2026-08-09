export const AFFIX_VOLUME_PROFILES = Object.freeze({
  base: Object.freeze({
    label: "base",
    budgetsByRarityAndFloor: Object.freeze({
      magic: Object.freeze([0, 10, 10, 10, 10, 10]),
      rare: Object.freeze([0, 10, 10, 10, 10, 10]),
      epic: Object.freeze([0, 12, 13, 14, 15, 16])
    }),
    rollComposition: Object.freeze({
      magic: Object.freeze({ support: 1, core: 1, coreChance: 1.00 }),
      rare: Object.freeze({ support: 2, core: 1, coreChance: 0.75 }),
      epic: Object.freeze({ support: 2, core: 1 })
    })
  }),
  conservative: Object.freeze({
    label: "conservative",
    budgetsByRarityAndFloor: Object.freeze({
      magic: Object.freeze([0, 14, 16, 18, 20, 22]),
      rare: Object.freeze([0, 14, 16, 18, 20, 22]),
      epic: Object.freeze([0, 18, 21, 24, 27, 30])
    }),
    rollComposition: Object.freeze({
      magic: Object.freeze({ support: 2, core: 1, coreChance: 0.95 }),
      rare: Object.freeze({ support: 3, core: 1, coreChance: 0.75 }),
      epic: Object.freeze({ support: 3, core: 1 })
    })
  }),
  balanced: Object.freeze({
    label: "balanced",
    budgetsByRarityAndFloor: Object.freeze({
      magic: Object.freeze([0, 20, 22, 24, 26, 28]),
      rare: Object.freeze([0, 20, 22, 24, 26, 28]),
      epic: Object.freeze([0, 28, 31, 34, 37, 40])
    }),
    rollComposition: Object.freeze({
      magic: Object.freeze({ support: 3, core: 2, coreChance: 0.90 }),
      rare: Object.freeze({ support: 4, core: 2, coreChance: 0.75 }),
      epic: Object.freeze({ support: 4, core: 2 })
    })
  }),
  high: Object.freeze({
    label: "high",
    budgetsByRarityAndFloor: Object.freeze({
      magic: Object.freeze([0, 25, 28, 31, 34, 37]),
      rare: Object.freeze([0, 25, 28, 31, 34, 37]),
      epic: Object.freeze([0, 38, 42, 46, 50, 54])
    }),
    rollComposition: Object.freeze({
      magic: Object.freeze({ support: 4, core: 2, coreChance: 0.85 }),
      rare: Object.freeze({ support: 5, core: 2, coreChance: 0.78 }),
      epic: Object.freeze({ support: 5, core: 3 })
    })
  }),
  upper: Object.freeze({
    label: "#447 (2) upper",
    budgetsByRarityAndFloor: Object.freeze({
      magic: Object.freeze([0, 30, 32, 34, 36, 38]),
      rare: Object.freeze([0, 30, 32, 34, 36, 38]),
      epic: Object.freeze([0, 45, 48, 51, 54, 57])
    }),
    rollComposition: Object.freeze({
      magic: Object.freeze({ support: 5, core: 3, coreChance: 0.80 }),
      rare: Object.freeze({ support: 6, core: 3, coreChance: 0.80 }),
      epic: Object.freeze({ support: 7, core: 3 })
    })
  })
});

export function applyAffixVolumeProfile(affixBalance, profileId) {
  const profile = AFFIX_VOLUME_PROFILES[profileId];
  if (!profile) {
    throw new Error(
      `Issue #404 profile must be ${Object.keys(AFFIX_VOLUME_PROFILES).join("|")}: ${profileId}`
    );
  }
  Object.entries(profile.rollComposition).forEach(([rarity, composition]) => {
    affixBalance.rollComposition[rarity] = { ...composition };
  });
  Object.entries(profile.budgetsByRarityAndFloor).forEach(([rarity, budgets]) => {
    affixBalance.budgetsByRarityAndFloor[rarity] = [...budgets];
  });
  return profile;
}
