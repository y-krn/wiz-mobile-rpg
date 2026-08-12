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

export const ELITE_CLASSES = ["Samurai", "Bishop", "Ranger", "Ninja"];

// #267: 後衛はソロ化で前衛の壁を失い、MP枯渇後は str7-9 の物理しか残らない。
// spellCycleMp = 攻撃呪文が指定回数ヒットするごとにMP+1（火力窓の延長）。
// mpWard = 攻撃呪文を撃てるMPが残る間だけ def 加算（MP連動の障壁）。
// trapGuard = 罠のHPダメージを軽減する。罠優位の浅層で基本職のsustainを補う。
// killHeal = 敵撃破時にHPを回復する。既存の撃破trigger経路をクラス固有値で使う。
// いずれも常時の回復薬供給ではなく、探索・戦闘の行動に結びつくクラス個性を保つ。
export const CLASS_PASSIVES = {
  Mage: { label: "魔導適性", bonuses: { arcane: 20, trapGuard: 60, killMp: 1, spellCycleMp: 2, mpWard: 8, killHeal: 8 } },
  Priest: { label: "祈祷・退魔適性", bonuses: { devotion: 20, antiUndead: 20, killMp: 1, spellCycleMp: 2, mpWard: 4 } },
  Samurai: { label: "追撃適性", bonuses: { followUp: 5 } },
  Thief: { label: "探宝適性", bonuses: { trapBonus: 15, treasureSense: 10, evasion: 35 } },
  Fighter: { label: "守護適性", bonuses: { guardian: 20, trapGuard: 40, killHeal: 2 } },
  Bishop: { label: "鑑定・退魔眼", bonuses: { identifyDiscount: 20, antiUndead: 20 } },
  Ranger: { label: "探索術", bonuses: { treasureSense: 10, poisonWard: 20 } },
  Ninja: { label: "先制術", bonuses: { firstStrike: 15 } }
};
