export const CLASSES = {
  Fighter: { name: "Fighter", jpName: "戦士", mainStat: "str", criticalChance: { baseChance: 0, perLevel: 0, maxChance: 0 } },
  Thief: { name: "Thief", jpName: "盗賊", mainStat: "agi", criticalChance: { baseChance: 0, perLevel: 0, maxChance: 0 } },
  Priest: { name: "Priest", jpName: "僧侶", mainStat: "pie", criticalChance: { baseChance: 0, perLevel: 0, maxChance: 0 } },
  Mage: { name: "Mage", jpName: "魔術師", mainStat: "int", criticalChance: { baseChance: 0, perLevel: 0, maxChance: 0 } },
  Samurai: { name: "Samurai", jpName: "侍", mainStat: "str", criticalChance: { baseChance: 0, perLevel: 0, maxChance: 0 } },
  Bishop: { name: "Bishop", jpName: "司祭", mainStat: "int", criticalChance: { baseChance: 0, perLevel: 0, maxChance: 0 } },
  Ranger: { name: "Ranger", jpName: "野伏", mainStat: "agi", criticalChance: { baseChance: 0, perLevel: 0, maxChance: 0 } },
  Ninja: { name: "Ninja", jpName: "忍者", mainStat: "agi", criticalChance: { baseChance: 0.05, perLevel: 0.01, maxChance: 0.15 } }
};

export const ELITE_CLASSES = ["Samurai", "Bishop", "Ranger", "Ninja"];

// Legacy class data remains readable for old character fixtures and saves.
// Starting-kit characters bypass it at the class_rules boundary.
export const CLASS_PASSIVES = {
  Mage: { label: "魔導適性", bonuses: { arcane: 20, trapGuard: 60, killMp: 1, spellCycleMp: 2, mpWard: 1, killHeal: 8 } },
  Priest: { label: "祈祷・退魔適性", bonuses: { devotion: 20, antiUndead: 20, killMp: 1, spellCycleMp: 2, mpWard: 4 } },
  Samurai: { label: "追撃適性", bonuses: { followUp: 5 } },
  Thief: { label: "探宝適性", bonuses: { trapBonus: 15, treasureSense: 10, evasion: 35 } },
  Fighter: { label: "守護適性", bonuses: { guardian: 20, trapGuard: 40, killHeal: 2 } },
  Bishop: { label: "鑑定・退魔眼", bonuses: { identifyDiscount: 20, antiUndead: 20 } },
  Ranger: { label: "探索術", bonuses: { treasureSense: 10, poisonWard: 20 } },
  Ninja: { label: "先制術", bonuses: { firstStrike: 15 } }
};
