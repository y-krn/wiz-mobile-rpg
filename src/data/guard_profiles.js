// Active 防御 (Guard) profiles. The rates are multipliers applied after the
// incoming attack formula and before other mitigation such as spellGuard.
// Keeping these values in data makes shield identity inspectable without
// coupling the combat resolver to individual item ids.
export const GUARD_PROFILES = Object.freeze({
  universal_brace: Object.freeze({
    id: "universal_brace",
    label: "身構え",
    damageMultipliers: Object.freeze({ physical: 0.5, spell: 0.5, breath: 0.5, special: 0.5 }),
    statusChanceMultiplier: 0.5
  }),
  light: Object.freeze({
    id: "light",
    label: "軽盾の守り",
    damageMultipliers: Object.freeze({ physical: 0.45, spell: 0.5, breath: 0.5, special: 0.5 }),
    statusChanceMultiplier: 0.5
  }),
  physical: Object.freeze({
    id: "physical",
    label: "大盾の守り",
    damageMultipliers: Object.freeze({ physical: 0.35, spell: 0.5, breath: 0.5, special: 0.5 }),
    statusChanceMultiplier: 0.5
  }),
  arcane: Object.freeze({
    id: "arcane",
    label: "魔盾の守り",
    damageMultipliers: Object.freeze({ physical: 0.5, spell: 0.35, breath: 0.35, special: 0.5 }),
    statusChanceMultiplier: 0.5
  }),
  dragon: Object.freeze({
    id: "dragon",
    label: "竜避けの守り",
    damageMultipliers: Object.freeze({ physical: 0.4, spell: 0.5, breath: 0.35, special: 0.5 }),
    statusChanceMultiplier: 0.5
  }),
  aegis: Object.freeze({
    id: "aegis",
    label: "神盾の守り",
    damageMultipliers: Object.freeze({ physical: 0.3, spell: 0.35, breath: 0.35, special: 0.35 }),
    statusChanceMultiplier: 0.35
  })
});

export const UNIVERSAL_GUARD_PROFILE_ID = "universal_brace";
