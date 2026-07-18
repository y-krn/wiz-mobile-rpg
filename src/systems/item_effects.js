import { getEffectiveHealAmount } from "../rules/item_rules.js";
import { getCharMaxHp, getCharMaxMp } from "../rules/character_stats.js";
import { canUsePriestSpells, canUseMageSpells } from "../rules/class_rules.js";
import { addCharBuff } from "../combat_logic/status_effects.js";

export const ITEM_EFFECTS = {
  NOISE_BALL: () => "鳴らし玉が甲高い音を響かせた。",
  HEAL_POTION: ({ char }) => {
    const heal = getEffectiveHealAmount(char, 15);
    char.hp = Math.min(getCharMaxHp(char), char.hp + heal);
    return `${char.name}は傷薬を使い、HPが${heal}回復した。`;
  },
  GREATER_HEAL: ({ char }) => {
    const heal = getEffectiveHealAmount(char, 40);
    char.hp = Math.min(getCharMaxHp(char), char.hp + heal);
    return `${char.name}は上薬を使い、HPが${heal}回復した。`;
  },
  ANTIDOTE: ({ char }) => {
    if (char.status === "poisoned") {
      char.status = "ok";
      return `${char.name}は解毒薬を使い、毒が消え去った。`;
    }
    return `${char.name}は解毒薬を使ったが、何も起こらなかった。`;
  },
  EYE_DROPS: ({ char }) => {
    if (char.status === "blind") {
      char.status = "ok";
      return `${char.name}は目薬を使い、視界が戻った。`;
    }
    return `${char.name}は目薬を使ったが、何も起こらなかった。`;
  },
  PARALYZE_CURE: ({ char }) => {
    if (char.status === "paralyzed" || char.status === "paralyze") {
      char.status = "ok";
      return `${char.name}は解痺薬を使い、麻痺が解けた。`;
    }
    return `${char.name}は解痺薬を使ったが、何も起こらなかった。`;
  },
  WAKE_POWDER: ({ char }) => {
    if (char.status === "sleep") {
      char.status = "ok";
      delete char.sleepTurns;
      return `${char.name}は覚醒薬を使い、目を覚ました。`;
    }
    return `${char.name}は覚醒薬を使ったが、何も起こらなかった。`;
  },
  MANA_POTION: ({ char }) => {
    if (canUsePriestSpells(char) || canUseMageSpells(char)) {
      char.mp = Math.min(getCharMaxMp(char), char.mp + 3);
      return `${char.name}は魔力草を使用し、MPが3回復した。(MP:${char.mp}/${getCharMaxMp(char)})`;
    }
    return `${char.name}は魔力草を使用したが、魔力を持たないため何も起こらなかった。`;
  },
  ETHER: ({ char }) => {
    if (canUsePriestSpells(char) || canUseMageSpells(char)) {
      char.mp = Math.min(getCharMaxMp(char), char.mp + 8);
      return `${char.name}は魔力の雫を使用し、MPが8回復した。(MP:${char.mp}/${getCharMaxMp(char)})`;
    }
    return `${char.name}は魔力の雫を使用したが、魔力を持たないため何も起こらなかった。`;
  },
  HOLY_WATER: ({ char }) => {
    const heal = getEffectiveHealAmount(char, 15);
    char.hp = Math.min(getCharMaxHp(char), char.hp + heal);
    let cured = false;
    if (char.status === "poisoned") {
      char.status = "ok";
      cured = true;
    }
    return `${char.name}は祝福の聖水を使い、HPが${heal}回復した。${cured ? "毒も綺麗に消え去った！" : ""}`;
  },
  TOWN_PORTAL: ({ char }) => {
    return `${char.name}は帰還の翼を掲げた！`;
  },
  PANACEA: ({ char }) => {
    if (char.status === "poisoned" || char.status === "blind" || char.status === "paralyzed" || char.status === "paralyze" || char.status === "sleep") {
      char.status = "ok";
      delete char.sleepTurns;
      return `${char.name}は万能薬を使い、状態異常が消え去った。`;
    }
    return `${char.name}は万能薬を使ったが、何も起こらなかった。`;
  },
  ELIXIR: ({ char }) => {
    char.hp = getCharMaxHp(char);
    char.mp = getCharMaxMp(char);
    if (char.status === "poisoned" || char.status === "blind" || char.status === "paralyzed" || char.status === "paralyze" || char.status === "sleep") {
      char.status = "ok";
      delete char.sleepTurns;
    }
    return `${char.name}はエリクサーを飲んだ！HP・MPが全回復し、全ての状態異常が消え去った！`;
  },
  STR_POTION: ({ char }) => {
    addCharBuff(char, "atk", 10, 5);
    return `${char.name}は剛力の薬を使用し、攻撃力が上昇した！`;
  },
  GUARD_POTION: ({ char }) => {
    addCharBuff(char, "def", 10, 5);
    return `${char.name}は守りの薬を使用し、防御力が上昇した！`;
  },
  HASTE_POTION: ({ char }) => {
    addCharBuff(char, "agi", 5, 5);
    return `${char.name}は疾風の薬を使用し、敏捷性が上昇した！`;
  }
};
