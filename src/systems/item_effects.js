import { getEffectiveHealAmount } from "../rules/item_rules.js";
import { getCharMaxHp, getCharMaxMp } from "../rules/character_stats.js";
import { canUsePriestSpells, canUseMageSpells } from "../rules/class_rules.js";

export const ITEM_EFFECTS = {
  HEAL_POTION: ({ char }) => {
    const heal = getEffectiveHealAmount(char, 15);
    char.hp = Math.min(getCharMaxHp(char), char.hp + heal);
    return `${char.name}は傷薬を使い、HPが${heal}回復した。`;
  },
  ANTIDOTE: ({ char }) => {
    if (char.status === "poisoned") {
      char.status = "ok";
      return `${char.name}は解毒薬を使い、毒が消え去った。`;
    }
    return `${char.name}は解毒薬を使ったが、何も起こらなかった。`;
  },
  MANA_POTION: ({ char }) => {
    if (canUsePriestSpells(char) || canUseMageSpells(char)) {
      char.mp = Math.min(getCharMaxMp(char), char.mp + 3);
      return `${char.name}は魔力草を使用し、MPが3回復した。(MP:${char.mp}/${getCharMaxMp(char)})`;
    }
    return `${char.name}は魔力草を使用したが、魔力を持たないため何も起こらなかった。`;
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
    return `${char.name}は帰還のスクロールを読んだ！`;
  },
  ELIXIR: ({ char }) => {
    char.hp = getCharMaxHp(char);
    char.mp = getCharMaxMp(char);
    if (char.status === "poisoned" || char.status === "blind" || char.status === "paralyzed" || char.status === "paralyze" || char.status === "sleep") {
      char.status = "ok";
    }
    return `${char.name}はエリクサーを飲んだ！HP・MPが全回復し、全ての状態異常が消え去った！`;
  },
  SACRED_ASHES: ({ char }) => {
    let cured = false;
    if (char.status === "dead") {
      char.status = "ok";
      char.hp = 1;
      cured = true;
    }
    return `${char.name}に聖灰を振りかけると、${cured ? "奇跡が起き、HP1で息を吹き返した！" : "しかし何も起こらなかった。"}`;
  }
};
