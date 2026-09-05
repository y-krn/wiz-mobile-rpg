import { getEquippedItemData, getCharAffixSum } from "./item_rules.js";
import { getCharAllStatsAffixBonus, getCharCoreParams } from "./affix_rules.js";
import { getSpellStatBonus } from "./spell_rules.js";
import { calculateDisarmRate } from "./trap_rules.js";
import { getMediumMaxMpBonus } from "./magic_rules.js";
import { getWeaponBehaviorProfile } from "../data/weapon_behavior_profiles.js";

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

export const PHYSICAL_HIT_CHANCE_MIN = 0.50;
export const PHYSICAL_HIT_AGI_SCALE = 0.01;

export function getMonsterEvasionChance(monster) {
  if (!monster?.traits?.includes("evasive")) return 0;
  const chance = Number(monster.evasionChance ?? 0.3);
  if (!Number.isFinite(chance)) return 0.3;
  return Math.max(0, Math.min(0.75, chance));
}

export function getPhysicalHitChance(char, target) {
  const evasionChance = getMonsterEvasionChance(target);
  if (evasionChance <= 0) return 1;
  const agi = Number(getCharAgi(char));
  const agiBonus = Number.isFinite(agi)
    ? (agi - 10) * PHYSICAL_HIT_AGI_SCALE
    : 0;
  const physicalAccuracy = getCharCoreParams(char, "CORE_PHYSICAL_ACCURACY")?.hitChanceBonus || 0;
  const behaviorHitChanceBonus = getWeaponBehaviorProfile(char).hitChanceBonus;
  const chance = 1 - evasionChance + agiBonus + physicalAccuracy + behaviorHitChanceBonus;
  return Math.max(PHYSICAL_HIT_CHANCE_MIN, Math.min(1, chance));
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
  const mediumBonus = char.startingKit ? getMediumMaxMpBonus(char) : 0;
  return Math.max(0, char.maxMp + bonus + mediumBonus);
}

export function getCharTrapBonus(char) {
  return getCharAffixSum(char, "trapBonus") / 100;
}

// Weapon-specific physical variance. The inclusive range is defined on every
// weapon data entry; bare hands and non-weapon slots keep the legacy 0-4 roll.
export const DEFAULT_PHYSICAL_RANDOM_RANGE = Object.freeze([0, 4]);

export function getCharWeaponPhysicalRandomRange(char) {
  const weapon = getEquippedItemData(char, char?.equipment?.weapon);
  if (weapon?.type !== "weapon" || !Array.isArray(weapon.randRange) || weapon.randRange.length !== 2) {
    return DEFAULT_PHYSICAL_RANDOM_RANGE;
  }
  const min = Number(weapon.randRange[0]);
  const max = Number(weapon.randRange[1]);
  if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
    return DEFAULT_PHYSICAL_RANDOM_RANGE;
  }
  return [min, max];
}

export function rollCharWeaponPhysicalRandom(char, rng = Math.random) {
  const [min, max] = getCharWeaponPhysicalRandomRange(char);
  return min + Math.floor(rng() * (max - min + 1));
}

export function getCharWeaponAtk(char) {
  let atk = 0;
  const wpId = char.equipment.weapon;
  if (wpId) {
    atk += getEquippedItemData(char, wpId)?.atk || 0;
  } else if (char.class === "Ninja" && !char.startingKit) {
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

export function getCharTrapEaterBonus(char) {
  const params = getCharCoreParams(char, "CORE_TRAP_EATER");
  if (!params) return 0;
  const bonus = Number(char?.runTrapAttackBonus) || 0;
  return Math.max(0, Math.min(params.maxAttack, bonus));
}

export function getCharAttackBreakdown(char) {
  const equipment = getCharWeaponAtk(char);
  const base = Math.max(0, getCharStr(char) - 10);
  const trapEaterBonus = getCharTrapEaterBonus(char);
  return {
    base,
    equipment,
    trapEaterBonus,
    total: calculatePhysicalAttackRawFormula({
      weaponAtk: equipment,
      str: getCharStr(char),
      fixedDamageBonus: trapEaterBonus
    })
  };
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
// different stages and with different effective units. Incoming scale=4 is a
// conservative recalibration: it loosens the scale=2 minimum-damage pileup
// without making ordinary shallow encounters disproportionately lethal.
export const PHYSICAL_DEF_RESISTANCE_SCALE = 40;
export const PHYSICAL_DEF_RESISTANCE_SCALE_INCOMING = 4;

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
  meleeMod = 1,
  fixedDamageBonus = 0
} = {}) {
  const attack = (Math.floor(weaponAtk + buffAtk) + Math.max(0, str - 10) + randRoll) * meleeMod;
  return attack + (Number.isFinite(Number(fixedDamageBonus)) ? Number(fixedDamageBonus) : 0);
}

export function calculatePhysicalAttackFormula({
  weaponAtk = 0,
  buffAtk = 0,
  str = 10,
  randRoll = 0,
  def = 0,
  physResist = 0,
  meleeMod = 1,
  fixedDamageBonus = 0
} = {}) {
  const rawDamage = calculatePhysicalAttackRawFormula({
    weaponAtk,
    buffAtk,
    str,
    randRoll,
    meleeMod,
    fixedDamageBonus
  });
  const resistance = combinePhysicalResistances(
    getPhysicalDefenseResistance(def),
    physResist
  );
  return applyPhysicalResistance(rawDamage, resistance);
}

// Resolve every player physical attack from one profile-aware path. The
// existing formula remains available for display and compatibility callers;
// this resolver is the combat, policy, and simulation source of truth for
// weapon-owned behavior.
export function resolveWeaponAttack({
  char,
  weaponAtk = 0,
  buffAtk = 0,
  str = 10,
  randRoll = 0,
  def = 0,
  physResist = 0,
  meleeMod = 1,
  fixedDamageBonus = 0
} = {}) {
  const behavior = getWeaponBehaviorProfile(char);
  const fixedBonus = Number.isFinite(Number(fixedDamageBonus)) ? Number(fixedDamageBonus) : 0;
  const baseRaw = calculatePhysicalAttackRawFormula({
    weaponAtk,
    buffAtk,
    str,
    randRoll,
    meleeMod
  });
  const formulaRaw = baseRaw * behavior.rawDamageMultiplier + fixedBonus;
  const defResistance = getPhysicalDefenseResistance(def, behavior.physicalDefenseScale);
  const physicalResistance = combinePhysicalResistances(defResistance, physResist);
  const damage = Math.max(1, Math.floor(applyPhysicalResistance(formulaRaw, physicalResistance)));

  return {
    behavior,
    behaviorProfileId: behavior.id,
    baseRaw,
    formulaRaw,
    defResistance,
    physicalResistance,
    damage
  };
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
  const attackBreakdown = getCharAttackBreakdown(char);
  const int = getCharInt(char);
  const pie = getCharPie(char);
  const vit = getCharVit(char);
  const trapAffixBonus = Math.round(getCharTrapBonus(char) * 100);

  return {
    attack: attackBreakdown.total,
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
      floor,
      affixBonus: trapAffixBonus
    }),
    treasure: getCharAffixSum(char, "treasureSense")
  };
}
