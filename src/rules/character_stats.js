import { getItemData, getCharAffixSum } from "./item_rules.js";
import { getActiveSynergyMod } from "../data/tags.js";

export function getCharStr(char) {
  if (!char) return 0;
  let bonus = 0;
  if (char.equipment) {
    Object.values(char.equipment).forEach(eqKey => {
      if (eqKey) {
        const eqData = getItemData(eqKey);
        if (eqData && eqData.statsBonus && eqData.statsBonus.str) {
          bonus += eqData.statsBonus.str;
        }
      }
    });
  }
  return char.str + bonus;
}

export function getCharInt(char) {
  if (!char) return 0;
  let bonus = 0;
  if (char.equipment) {
    Object.values(char.equipment).forEach(eqKey => {
      if (eqKey) {
        const eqData = getItemData(eqKey);
        if (eqData && eqData.statsBonus && eqData.statsBonus.int) {
          bonus += eqData.statsBonus.int;
        }
      }
    });
  }
  return char.int + bonus;
}

export function getCharPie(char) {
  if (!char) return 0;
  let bonus = 0;
  if (char.equipment) {
    Object.values(char.equipment).forEach(eqKey => {
      if (eqKey) {
        const eqData = getItemData(eqKey);
        if (eqData && eqData.statsBonus && eqData.statsBonus.pie) {
          bonus += eqData.statsBonus.pie;
        }
      }
    });
  }
  return char.pie + bonus;
}

export function getCharVit(char) {
  if (!char) return 0;
  let bonus = 0;
  if (char.equipment) {
    Object.values(char.equipment).forEach(eqKey => {
      if (eqKey) {
        const eqData = getItemData(eqKey);
        if (eqData && eqData.statsBonus && eqData.statsBonus.vit) {
          bonus += eqData.statsBonus.vit;
        }
      }
    });
  }
  return char.vit + bonus;
}

export function getCharAgi(char) {
  if (!char) return 0;
  let bonus = 0;
  if (char.equipment) {
    Object.values(char.equipment).forEach(eqKey => {
      if (eqKey) {
        const eqData = getItemData(eqKey);
        if (eqData && eqData.statsBonus && eqData.statsBonus.agi) {
          bonus += eqData.statsBonus.agi;
        }
      }
    });
  }
  return char.agi + bonus;
}

export function getCharLuk(char) {
  if (!char) return 0;
  let bonus = 0;
  if (char.equipment) {
    Object.values(char.equipment).forEach(eqKey => {
      if (eqKey) {
        const eqData = getItemData(eqKey);
        if (eqData && eqData.statsBonus && eqData.statsBonus.luk) {
          bonus += eqData.statsBonus.luk;
        }
      }
    });
  }
  return char.luk + bonus;
}

export function getCharMaxHp(char) {
  if (!char) return 0;
  let bonus = 0;
  if (char.equipment) {
    Object.values(char.equipment).forEach(eqKey => {
      if (eqKey) {
        const eqData = getItemData(eqKey);
        if (eqData && eqData.hpBonus) {
          bonus += eqData.hpBonus;
        }
      }
    });
  }
  return char.maxHp + bonus;
}

export function getCharMaxMp(char) {
  if (!char) return 0;
  let bonus = 0;
  if (char.equipment) {
    Object.values(char.equipment).forEach(eqKey => {
      if (eqKey) {
        const eqData = getItemData(eqKey);
        if (eqData && eqData.mpBonus) {
          bonus += eqData.mpBonus;
        }
      }
    });
  }
  return char.maxMp + bonus;
}

export function getCharTrapBonus(char, party = null) {
  if (!char) return 0;
  let bonus = 0;
  if (char.equipment) {
    Object.values(char.equipment).forEach(eqKey => {
      if (eqKey) {
        const eqData = getItemData(eqKey);
        if (eqData && eqData.trapBonus) {
          bonus += eqData.trapBonus / 100;
        }
      }
    });
  }
  bonus += getActiveSynergyMod(party, "trapBonus") / 100;
  return bonus;
}

export function getCharWeaponAtk(char, party = null) {
  let atk = 0;
  const wpId = char.equipment.weapon;
  if (wpId) {
    atk += getItemData(wpId)?.atk || 0;
  } else if (char.class === "Ninja") {
    atk += 2 * char.level;
  }
  
  if (char.equipment) {
    Object.entries(char.equipment).forEach(([slot, eqKey]) => {
      if (slot !== "weapon" && eqKey) {
        atk += getItemData(eqKey)?.atk || 0;
      }
    });
  }
  atk += getActiveSynergyMod(party, "atk");
  return atk;
}

export function getCharDef(char, party = null) {
  let def = 0;
  if (char.equipment) {
    Object.values(char.equipment).forEach(eqKey => {
      if (eqKey) {
        def += getItemData(eqKey)?.def || 0;
      }
    });
  }
  def += getActiveSynergyMod(party, "def");
  return def;
}

export function getCharDerivedStats(char, party = null) {
  return {
    attack: getCharWeaponAtk(char, party) + getCharStr(char),
    defense: getCharDef(char, party) + Math.floor(getCharVit(char) / 2),
    magic: getCharInt(char) + getCharAffixSum(char, "arcane", party),
    healing: getCharPie(char) + getCharAffixSum(char, "devotion", party),
    speed: getCharAgi(char),
    trap: getCharLuk(char) + Math.round(getCharTrapBonus(char, party) * 100),
    treasure: getCharAffixSum(char, "treasureSense", party)
  };
}
