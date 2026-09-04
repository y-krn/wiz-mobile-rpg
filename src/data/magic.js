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

// Rune objects occupy one ordinary bag slot. SPELLS remains the effect source.
export const RUNES = Object.freeze(Object.fromEntries(
  Object.entries(SPELLS).map(([spellKey]) => [
    `RUNE_${spellKey}`,
    Object.freeze({
      id: `RUNE_${spellKey}`,
      name: `${spellKey}のルーン`,
      type: "rune",
      spellKey,
      desc: `${spellKey}を媒体に刻む一枚のルーン。`
    })
  ])
));

export const RUNE_ITEM_IDS = Object.freeze(Object.keys(RUNES));
