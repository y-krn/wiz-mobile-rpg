import { ITEM_EFFECTS } from "../../../../src/systems/item_effects";

const healCharacter = { name: "回復役", hp: 10, maxHp: 30 };
ITEM_EFFECTS.HEAL_POTION({ char: healCharacter, party: [healCharacter], rng: Math.random });

const manaCharacter = { name: "術者", mp: 1, maxMp: 3 };
ITEM_EFFECTS.MANA_POTION({ char: manaCharacter, party: [manaCharacter], rng: Math.random });

const nonManaCharacter = { name: "非術者", maxMp: 0 };
ITEM_EFFECTS.MANA_POTION({ char: nonManaCharacter, party: [nonManaCharacter], rng: Math.random });
ITEM_EFFECTS.ETHER({ char: nonManaCharacter, party: [nonManaCharacter], rng: Math.random });

const statusOnlyCharacter = { name: "状態役", status: "poisoned" };
ITEM_EFFECTS.ANTIDOTE({ char: statusOnlyCharacter, party: [statusOnlyCharacter], rng: Math.random });

const buffCharacter = { name: "強化役", buffs: [] };
ITEM_EFFECTS.STR_POTION({ char: buffCharacter, party: [buffCharacter], rng: Math.random });
