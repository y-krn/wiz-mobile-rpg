import { SPELLS } from "./spells.js";

// Mediums reuse the weapon slot. Capacity is an equipped-item property, not a
// compatibility class or level property. Values are structural vNext defaults.
export const MEDIUMS = Object.freeze({
  WAND: Object.freeze({ id: "WAND", hands: 1, maxMpBonus: 2, runeSlots: 1 }),
  SAGE_STAFF: Object.freeze({ id: "SAGE_STAFF", hands: 2, maxMpBonus: 3, runeSlots: 2 }),
  ARCH_WAND: Object.freeze({ id: "ARCH_WAND", hands: 2, maxMpBonus: 4, runeSlots: 3 }),
  HOLY_STAFF: Object.freeze({ id: "HOLY_STAFF", hands: 1, maxMpBonus: 2, runeSlots: 1 })
});

export const MEDIUM_IDS = Object.freeze(Object.keys(MEDIUMS));
export const BASE_STARTING_MP = 1;
export const BASIC_RUNE_SPELL_KEY = "HALITO";
export const BASIC_RUNE_ITEM_ID = `RUNE_${BASIC_RUNE_SPELL_KEY}`;

// Rune access is a floor-supply rule, not a character-level or class
// permission.  Keep the spell membership here so chest, drop, and
// measurement callers all consume the same source of truth.
export const RUNE_SUPPLY_BANDS = Object.freeze([
  Object.freeze({
    id: "shallow",
    minFloor: 1,
    spellKeys: Object.freeze(["HALITO", "DIOS", "DIURCO", "BADIOS", "MILWA", "DUMAPIC"])
  }),
  Object.freeze({
    id: "early_mid",
    minFloor: 3,
    spellKeys: Object.freeze(["KATINO", "LAHALITO", "MAHALITO", "DIALKO", "LATUMOFIS", "MADIOS", "VULNERA"])
  }),
  Object.freeze({
    id: "mid",
    minFloor: 6,
    spellKeys: Object.freeze(["MASFEAL", "MADALTO", "LOMILWA", "MADI", "MABARRIER", "MONTINO", "MORLIS", "WEAKEN"])
  }),
  Object.freeze({
    id: "deep",
    minFloor: 11,
    spellKeys: Object.freeze(["TILTOWAIT", "DIALMA"])
  })
]);

const RUNE_SUPPLY_BY_SPELL = new Map(
  RUNE_SUPPLY_BANDS.flatMap(band => band.spellKeys.map(spellKey => [spellKey, band]))
);
const UNASSIGNED_RUNE_SPELLS = Object.keys(SPELLS).filter(spellKey => !RUNE_SUPPLY_BY_SPELL.has(spellKey));
if (UNASSIGNED_RUNE_SPELLS.length > 0) {
  throw new Error(`Rune supply metadata is missing: ${UNASSIGNED_RUNE_SPELLS.join(", ")}`);
}

// Rune objects occupy one ordinary bag slot. SPELLS remains the effect source.
export const RUNES = Object.freeze(Object.fromEntries(
  Object.entries(SPELLS).map(([spellKey]) => {
    const supplyBand = RUNE_SUPPLY_BY_SPELL.get(spellKey);
    return [
      `RUNE_${spellKey}`,
      Object.freeze({
        id: `RUNE_${spellKey}`,
        name: `${spellKey}のルーン`,
        type: "rune",
        spellKey,
        desc: `${spellKey}を媒体に刻む一枚のルーン。`,
        minFloor: supplyBand.minFloor,
        supplyBand: supplyBand.id,
        supplyTier: supplyBand.id
      })
    ];
  })
));

export const RUNE_ITEM_IDS = Object.freeze(Object.keys(RUNES));

export function getRuneItemIdsByFloor(floor = 1) {
  const normalizedFloor = Math.max(1, Number.isFinite(Number(floor)) ? Math.floor(Number(floor)) : 1);
  return RUNE_SUPPLY_BANDS
    .filter(band => normalizedFloor >= band.minFloor)
    .flatMap(band => band.spellKeys.map(spellKey => `RUNE_${spellKey}`));
}
