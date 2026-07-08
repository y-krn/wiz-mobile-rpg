let localStateRef = null;
const LOG_HISTORY_LIMIT = 500;
export function setTagsStateRef(stateObj) {
  localStateRef = stateObj;
}

export const TAGS = {
  fire_rite: { name: "火葬", desc: "アンデッドを焼き払う魔力" },
  holy: { name: "聖", desc: "神聖な祈りと加護の印" },
  spirit: { name: "霊", desc: "霊体や魂に干渉する力" },
  poison: { name: "毒", desc: "毒物や罠に精通した技術" },
  dragon: { name: "竜", desc: "竜の力と耐性" },
  iron: { name: "鉄", desc: "頑丈な金属による物理防御" },
  blood: { name: "血", desc: "生命力と引き換えの猛襲" },
  curse: { name: "呪", desc: "強大な力をもたらす代償の契約" },
  ward: { name: "守勢", desc: "攻撃を遮断し防壁を築く技" },
  appraisal: { name: "鑑定", desc: "真実を見抜く鑑定の知恵" },
  beast: { name: "獣", desc: "野生の勘と生命力" },
  ambush: { name: "奇襲", desc: "闇からの不意打ちと回避" },
  blade: { name: "刃", desc: "鋭い刃物による切断技" },
  trap: { name: "罠", desc: "仕掛けと感知の技術" },
  search: { name: "探索", desc: "迷宮を暴く鋭い五感" },
  exorcism: { name: "退魔", desc: "不浄の者を祓う儀式" },
  analysis: { name: "解析", desc: "魔法の構造と心理の洞察" },
  follow_up: { name: "連撃", desc: "絶え間ない追撃の構え" },
  record: { name: "記録", desc: "迷宮の記録と知見の蓄積" },
  evasion: { name: "回避", desc: "身軽な動きによる危険回避" }
};

export const CLASS_TAGS = {
  Fighter: ["ward", "iron", "front"],
  Thief: ["trap", "poison", "search"],
  Priest: ["holy", "heal", "exorcism"],
  Mage: ["fire", "ice", "analysis"],
  Samurai: ["blood", "follow_up", "blade"],
  Bishop: ["appraisal", "holy", "record"],
  Ranger: ["beast", "poison", "search"],
  Ninja: ["ambush", "poison", "evasion"]
};

export const SPELL_TAGS = {
  HALITO: ["fire"],
  LAHALITO: ["fire"],
  MAHALITO: ["fire"],
  TILTOWAIT: ["fire"],
  MADALTO: ["ice"],
  DIOS: ["heal"],
  MADIOS: ["heal"],
  DIALMA: ["heal"],
  MADI: ["heal"],
  DIALKO: ["heal"],
  LATUMOFIS: ["heal", "poison"],
  DIURCO: ["heal"],
  BADIOS: ["holy"],
  KADORTO: ["holy"],
  MILWA: ["holy", "analysis"],
  LOMILWA: ["holy", "analysis"],
  MABARRIER: ["ward"],
  MASFEAL: ["ward"],
  DUMAPIC: ["analysis"],
  MONTINO: ["analysis"],
  MORLIS: ["analysis"]
};

export const SYNERGIES = {
  holy_priest: {
    id: "holy_priest",
    name: "聖なる退魔",
    tags: ["holy", "exorcism"],
    log: "[反応] 聖なる祈りが不浄を退ける光を放った。",
    archive: "聖なる装備を退魔の力を持つ僧侶が扱うと、アンデッドへの攻撃力が微増する。",
    mod: { antiUndead: 35, antiDemon: 15 }
  },
  poison_thief: {
    id: "poison_thief",
    name: "毒物調律",
    tags: ["poison", "trap"],
    log: "[反応] 毒の刻印が罠の匂いを変え、仕組みを暴きやすくした。",
    archive: "毒に精通した装備と罠解除の技術が重なると、毒罠の解除率が上昇する。",
    mod: { trapBonus: 30, poisonWard: 20, firstStrike: -3 }
  },
  fire_curse: {
    id: "fire_curse",
    name: "業火の契約",
    tags: ["fire_rite", "curse"],
    log: "[反応] 呪われた業火が命を削り、凄まじい熱線を放った。",
    archive: "火葬の力と呪いが交わると、攻撃力が劇的に上昇するが、被回復効果が低下する。",
    mod: { atk: 4, healMod: -30 }
  },
  iron_ward: {
    id: "iron_ward",
    name: "鉄壁の防陣",
    tags: ["iron", "ward"],
    log: "[反応] 鉄の防具が重い一撃の衝撃を巧みに逃した。",
    archive: "鉄と守勢のタグが合わさることで、物理被ダメージを軽減する強固な防御となる。",
    mod: { def: 3, guardian: 12, firstStrike: -4 }
  },
  beast_search: {
    id: "beast_search",
    name: "獣の野性",
    tags: ["beast", "search"],
    log: "[反応] 野生の鋭い勘が、周囲の獣の気配を察知した。",
    archive: "獣の性質を帯びた装備と探索術の相性により、不意打ちを防ぎやすくなる。",
    mod: { firstStrike: 8, treasureSense: 8 }
  },
  spirit_analysis: {
    id: "spirit_analysis",
    name: "霊視の極意",
    tags: ["spirit", "analysis"],
    log: "[反応] 霊視の魔力が、見えない罠や迷宮の歪みを照らし出した。",
    archive: "霊的干渉と解析の知識が一致すると、罠の看破や迷宮の隠された宝を発見しやすくなる。",
    mod: { treasureSense: 18, trapBonus: 10 }
  },
  ambush_poison: {
    id: "ambush_poison",
    name: "闇に潜む毒",
    tags: ["ambush", "poison"],
    log: "[反応] 闇に紛れる一撃に、致死の毒液が静かに滴る。",
    archive: "奇襲の心得と毒の付与が組み合わさることで、先制確率と罠対策が共に高まる。",
    mod: { firstStrike: 10, followUp: 8, def: -3 }
  },
  blood_blade: {
    id: "blood_blade",
    name: "血塗られた刃",
    tags: ["blood", "blade"],
    log: "[反応] 血を吸った刃が赤く染まり、さらなる闘志を呼び覚ます。",
    archive: "血と刃のタグが調和すると、連撃の確率が上がり、攻撃的ビルドが強化される。",
    mod: { followUp: 14, def: -3 }
  }
};

export const MATERIAL_TAGS = {
  "霊粉": ["holy", "spirit", "appraisal"],
  "毒腺": ["poison", "trap"],
  "鉄片": ["iron", "ward"],
  "竜鱗": ["dragon", "fire"],
  "黒角": ["curse", "demon", "blood"]
};

export const TAG_EFFECT_MAP = {
  holy: { name: "聖印", type: "antiUndead", value: 20, desc: "不死特効+20%", gold: 150, matCost: 3 },
  spirit: { name: "霊印", type: "mp", value: 2, desc: "最大MP+2", gold: 100, matCost: 2 },
  appraisal: { name: "鑑印", type: "identifyDiscount", value: 10, desc: "鑑定割引+10%", gold: 100, matCost: 2 },
  poison: { name: "毒印", type: "poisonWard", value: 25, desc: "毒耐性+25%", gold: 100, matCost: 2 },
  trap: { name: "罠印", type: "trapBonus", value: 10, desc: "罠解除率+10%", gold: 100, matCost: 2 },
  iron: { name: "鉄印", type: "def", value: 3, desc: "防御力+3", gold: 100, matCost: 2 },
  ward: { name: "守印", type: "guardian", value: 10, desc: "守護適性+10%", gold: 150, matCost: 3 },
  dragon: { name: "竜印", type: "antiDragon", value: 20, desc: "竜特効+20%", gold: 300, matCost: 4 },
  fire: { name: "火印", type: "atk", value: 3, desc: "攻撃力+3", gold: 150, matCost: 3 },
  curse: { name: "呪印", type: "curse", value: 0, desc: "渇血の呪い (攻撃+15 / 回復-20%)", gold: 50, matCost: 1 },
  demon: { name: "魔印", type: "antiDemon", value: 20, desc: "悪魔特効+20%", gold: 250, matCost: 4 },
  blood: { name: "血印", type: "followUp", value: 10, desc: "連撃適性+10%", gold: 150, matCost: 3 }
};

export function getPartyActiveTags(party) {
  if (!party || party.length === 0) return [];
  const tags = new Set();
  party.forEach(char => {
    if (char.status === "dead") return;
    
    // 職業タグ
    const classTags = CLASS_TAGS[char.class] || [];
    classTags.forEach(t => tags.add(t));
    
    // 習得呪文タグ
    if (char.spells) {
      char.spells.forEach(spellId => {
        const spellTags = SPELL_TAGS[spellId] || [];
        spellTags.forEach(t => tags.add(t));
      });
    }
    
    // 装備タグ (完全鑑定済みのみ)
    if (char.equipment) {
      Object.values(char.equipment).forEach(eqKey => {
        if (eqKey && typeof eqKey === "object" && eqKey.identified) {
          if (eqKey.tags) {
            eqKey.tags.forEach(t => tags.add(t));
          }
          if (eqKey.inscription && eqKey.inscription.tag) {
            tags.add(eqKey.inscription.tag);
          }
        }
      });
    }
  });
  return Array.from(tags);
}

export function getActiveSynergies(party) {
  const activeTags = getPartyActiveTags(party);
  const activeList = [];
  for (const syn of Object.values(SYNERGIES)) {
    const hasAll = syn.tags.every(t => activeTags.includes(t));
    if (hasAll) {
      activeList.push(syn);
    }
  }
  return activeList;
}

export function getActiveSynergyMod(party, modType) {
  if (!modType) return 0;
  return getActiveSynergies(party).reduce((sum, syn) => {
    return sum + (syn.mod?.[modType] || 0);
  }, 0);
}

export function recordSynergyDiscovery(synergyId) {
  if (!localStateRef || !localStateRef.codex) return;
  if (!localStateRef.codex.synergies) {
    localStateRef.codex.synergies = {};
  }
  if (!localStateRef.codex.synergies[synergyId]) {
    localStateRef.codex.synergies[synergyId] = true;
    if (localStateRef.logs) {
      localStateRef.logs.push(`[書庫記録] 新たな相性「${SYNERGIES[synergyId].name}」を発見した！`);
      if (localStateRef.logs.length > LOG_HISTORY_LIMIT) {
        localStateRef.logs.shift();
      }
    }
  }
}
