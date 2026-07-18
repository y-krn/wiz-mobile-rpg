export const CLASSES = {
  Fighter: { name: "Fighter", jpName: "戦士" },
  Thief: { name: "Thief", jpName: "盗賊" },
  Priest: { name: "Priest", jpName: "僧侶" },
  Mage: { name: "Mage", jpName: "魔術師" },
  Samurai: { name: "Samurai", jpName: "侍" },
  Bishop: { name: "Bishop", jpName: "司祭" },
  Ranger: { name: "Ranger", jpName: "野伏" },
  Ninja: { name: "Ninja", jpName: "忍者" }
};

export const CLASS_PASSIVES = {
  Mage: { label: "魔導適性", bonuses: { arcane: 20, killMp: 1 } },
  Priest: { label: "祈祷・退魔適性", bonuses: { devotion: 20, antiUndead: 20, killMp: 1 } },
  Samurai: { label: "追撃適性", bonuses: { followUp: 5 } },
  Thief: { label: "探宝適性", bonuses: { trapBonus: 15, treasureSense: 10, evasion: 35 } },
  Fighter: { label: "守護適性", bonuses: { guardian: 20 } },
  Bishop: { label: "鑑定・退魔眼", bonuses: { identifyDiscount: 20, antiUndead: 20 } },
  Ranger: { label: "探索術", bonuses: { treasureSense: 10, poisonWard: 20 } },
  Ninja: { label: "先制術", bonuses: { firstStrike: 15 } }
};
