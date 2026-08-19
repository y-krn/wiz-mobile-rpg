import { getEquippedItemData, getCharAffixSum } from "./item_rules.js";
import { getCharAllStatsAffixBonus } from "./affix_rules.js";
import { getSpellStatBonus } from "./spell_rules.js";
import { calculateDisarmRate } from "./trap_rules.js";

export function getCharStr(char) {
  if (!char) return 0;
  let bonus = 0;
  if (char.equipment) {
    Object.values(char.equipment).forEach(eqKey => {
      if (eqKey) {
        const eqData = getEquippedItemData(char, eqKey);
        if (eqData && eqData.statsBonus && eqData.statsBonus.str) {
          bonus += eqData.statsBonus.str;
        }
      }
    });
  }
  return char.str + bonus + getCharAllStatsAffixBonus(char);
}

export function getCharInt(char) {
  if (!char) return 0;
  let bonus = 0;
  if (char.equipment) {
    Object.values(char.equipment).forEach(eqKey => {
      if (eqKey) {
        const eqData = getEquippedItemData(char, eqKey);
        if (eqData && eqData.statsBonus && eqData.statsBonus.int) {
          bonus += eqData.statsBonus.int;
        }
      }
    });
  }
  return char.int + bonus + getCharAllStatsAffixBonus(char);
}

export function getCharPie(char) {
  if (!char) return 0;
  let bonus = 0;
  if (char.equipment) {
    Object.values(char.equipment).forEach(eqKey => {
      if (eqKey) {
        const eqData = getEquippedItemData(char, eqKey);
        if (eqData && eqData.statsBonus && eqData.statsBonus.pie) {
          bonus += eqData.statsBonus.pie;
        }
      }
    });
  }
  return char.pie + bonus + getCharAllStatsAffixBonus(char);
}

export function getCharVit(char) {
  if (!char) return 0;
  let bonus = 0;
  if (char.equipment) {
    Object.values(char.equipment).forEach(eqKey => {
      if (eqKey) {
        const eqData = getEquippedItemData(char, eqKey);
        if (eqData && eqData.statsBonus && eqData.statsBonus.vit) {
          bonus += eqData.statsBonus.vit;
        }
      }
    });
  }
  return char.vit + bonus + getCharAllStatsAffixBonus(char);
}

export function getCharAgi(char) {
  if (!char) return 0;
  let bonus = 0;
  if (char.equipment) {
    Object.values(char.equipment).forEach(eqKey => {
      if (eqKey) {
        const eqData = getEquippedItemData(char, eqKey);
        if (eqData && eqData.statsBonus && eqData.statsBonus.agi) {
          bonus += eqData.statsBonus.agi;
        }
      }
    });
  }
  return char.agi + bonus + getCharAllStatsAffixBonus(char);
}

export function getCharLuk(char) {
  if (!char) return 0;
  let bonus = 0;
  if (char.equipment) {
    Object.values(char.equipment).forEach(eqKey => {
      if (eqKey) {
        const eqData = getEquippedItemData(char, eqKey);
        if (eqData && eqData.statsBonus && eqData.statsBonus.luk) {
          bonus += eqData.statsBonus.luk;
        }
      }
    });
  }
  return char.luk + bonus + getCharAllStatsAffixBonus(char);
}

export function getCharMaxHp(char) {
  if (!char) return 0;
  let bonus = 0;
  if (char.equipment) {
    Object.values(char.equipment).forEach(eqKey => {
      if (eqKey) {
        const eqData = getEquippedItemData(char, eqKey);
        if (eqData && eqData.hpBonus) {
          bonus += eqData.hpBonus;
        }
      }
    });
  }
  // HPは生存・回復の上限なので、呪いで下がっても最低1を維持する。
  return Math.max(1, char.maxHp + bonus);
}

export function getCharMaxMp(char) {
  if (!char) return 0;
  let bonus = 0;
  if (char.equipment) {
    Object.values(char.equipment).forEach(eqKey => {
      if (eqKey) {
        const eqData = getEquippedItemData(char, eqKey);
        if (eqData && eqData.mpBonus) {
          bonus += eqData.mpBonus;
        }
      }
    });
  }
  // MP 0は非術者の正当な容量なので、負値だけを0へ戻す。
  return Math.max(0, char.maxMp + bonus);
}

export function getCharTrapBonus(char) {
  return getCharAffixSum(char, "trapBonus") / 100;
}

export function getPartyFlameTrapWarningAvoidanceChance(party = []) {
  const trapInvestment = party
    .filter(char => char?.hp > 0 && !["dead", "ash"].includes(char.status))
    .reduce((max, char) => Math.max(max, Number(getCharTrapBonus(char)) || 0), 0);
  // 発動時の確率的回避判定であり、事前予告ではない。
  // trapBonusを2〜3枠積む0.6〜0.9を48〜72%へ線形変換し、上限は74%にする。
  return Math.min(0.74, Math.max(0, trapInvestment) * 0.8);
}

export function getCharWeaponAtk(char) {
  let atk = char.runTrapAttackBonus || 0;
  const wpId = char.equipment.weapon;
  if (wpId) {
    atk += getEquippedItemData(char, wpId)?.atk || 0;
  } else if (char.class === "Ninja") {
    atk += 3 * char.level;
  }
  
  if (char.equipment) {
    Object.entries(char.equipment).forEach(([slot, eqKey]) => {
      if (slot !== "weapon" && eqKey) {
        atk += getEquippedItemData(char, eqKey)?.atk || 0;
      }
    });
  }
  return atk;
}

export function getCharDef(char) {
  let def = 0;
  if (char.equipment) {
    Object.values(char.equipment).forEach(eqKey => {
      if (eqKey) {
        def += getEquippedItemData(char, eqKey)?.def || 0;
      }
    });
  }
  return def;
}

// Monster DEF is mutable during combat because DEF buffs/debuffs are stored
// on the monster. Keep the effective value in the shared rules module so
// combat resolution and resistance disclosure cannot drift apart.
export function getEffectiveDef(mon) {
  const baseDef = Number(mon?.def) || 0;
  const buffDef = (mon?.buffs || []).reduce((sum, buff) => {
    return buff.type === "def" ? sum + (Number(buff.value) || 0) : sum;
  }, 0);
  return Math.max(0, baseDef + Math.max(-6, Math.min(6, buffDef)));
}

// Physical defense is converted to a bounded resistance pool instead of being
// subtracted from each attack. Each direction keeps the same diminishing
// curve, with its calibrated scale selected at the call site.
export const PHYSICAL_RESISTANCE_CAP = 0.9;
// Player attacks use the outgoing calibration; incoming monster attacks use
// the separate scale below because the pre-change formulas applied DEF at
// different stages and with different effective units.
export const PHYSICAL_DEF_RESISTANCE_SCALE = 100;
export const PHYSICAL_DEF_RESISTANCE_SCALE_INCOMING = 3;

export function getPhysicalDefenseResistance(
  def = 0,
  scale = PHYSICAL_DEF_RESISTANCE_SCALE
) {
  const normalizedDef = Number.isFinite(Number(def))
    ? Math.max(0, Number(def))
    : 0;
  const normalizedScale = Number.isFinite(Number(scale)) && Number(scale) > 0
    ? Number(scale)
    : PHYSICAL_DEF_RESISTANCE_SCALE;
  return normalizedDef / (normalizedDef + normalizedScale);
}

export function combinePhysicalResistances(...resistances) {
  const total = resistances.reduce((sum, resistance) => {
    const numericResistance = Number(resistance);
    return sum + (Number.isFinite(numericResistance) ? numericResistance : 0);
  }, 0);
  return Math.max(-1, Math.min(PHYSICAL_RESISTANCE_CAP, total));
}

export function applyPhysicalResistance(rawDamage, resistance = 0) {
  const numericDamage = Number(rawDamage);
  const totalResistance = combinePhysicalResistances(resistance);
  if (!Number.isFinite(numericDamage)) return 1;
  return Math.max(1, numericDamage * (1 - totalResistance));
}

// Keep the physical formula in one place for combat and static equipment
// comparison. Weapon and attack-buff inputs are already in effective units;
// context-dependent inputs (rolls, target defense, target physResist, and
// class modifiers) stay with the caller.
export function calculatePhysicalAttackRawFormula({
  weaponAtk = 0,
  buffAtk = 0,
  str = 10,
  randRoll = 0,
  meleeMod = 1
} = {}) {
  return (Math.floor(weaponAtk + buffAtk) + Math.max(0, str - 10) + randRoll) * meleeMod;
}

export function calculatePhysicalAttackFormula({
  weaponAtk = 0,
  buffAtk = 0,
  str = 10,
  randRoll = 0,
  def = 0,
  physResist = 0,
  meleeMod = 1
} = {}) {
  const rawDamage = calculatePhysicalAttackRawFormula({
    weaponAtk,
    buffAtk,
    str,
    randRoll,
    meleeMod
  });
  const resistance = combinePhysicalResistances(
    getPhysicalDefenseResistance(def),
    physResist
  );
  return applyPhysicalResistance(rawDamage, resistance);
}

export function calculatePhysicalDefenseFormula({
  baseDef = 0,
  vit = 0,
  bonusDef = 0,
  tempDefDown = 0
} = {}) {
  return Math.max(0, baseDef + Math.floor(vit / 4) + bonusDef - tempDefDown);
}

function getEffectiveSpellBonus(stat, affixSum, spellPowerSum) {
  const multiplier = getSpellStatBonus(stat)
    * (1 + spellPowerSum / 100)
    * (1 + affixSum / 100);
  return Math.round((multiplier - 1) * 100);
}

export function getCharDerivedStats(char, { floor = 1 } = {}) {
  const weaponAtk = getCharWeaponAtk(char);
  const str = getCharStr(char);
  const int = getCharInt(char);
  const pie = getCharPie(char);
  const vit = getCharVit(char);
  const trapAffixBonus = Math.round(getCharTrapBonus(char) * 100);

  return {
    attack: calculatePhysicalAttackFormula({ weaponAtk, str }),
    defense: calculatePhysicalDefenseFormula({ baseDef: getCharDef(char), vit }),
    magic: getEffectiveSpellBonus(
      int,
      getCharAffixSum(char, "arcane"),
      getCharAffixSum(char, "spellPower")
    ),
    healing: getEffectiveSpellBonus(
      pie,
      getCharAffixSum(char, "devotion"),
      getCharAffixSum(char, "spellPower")
    ),
    speed: getCharAgi(char),
    trap: calculateDisarmRate({
      className: char.class,
      level: char.level,
      floor,
      affixBonus: trapAffixBonus
    }),
    treasure: getCharAffixSum(char, "treasureSense")
  };
}
