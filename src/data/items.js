export const ITEMS = {
  // Weapons
  DAGGER: { id: "DAGGER", name: "ダガー", type: "weapon", atk: 2, desc: "シンプルな短剣。攻撃力+2 [全員用]", classes: ["Fighter", "Thief", "Priest", "Mage", "Samurai", "Bishop", "Ranger", "Ninja"], tags: ["iron", "ambush"] },
  WAND: { id: "WAND", name: "魔術師の杖", type: "weapon", atk: 1, desc: "神秘的な魔力を宿した木の杖。攻撃力+1 呪文威力+10% [僧・魔・司用]", classes: ["Priest", "Mage", "Bishop"], tags: ["spirit", "appraisal"] },
  SAGE_STAFF: { id: "SAGE_STAFF", name: "賢者の杖", type: "weapon", atk: 2, desc: "鑑定術に長けた賢者の杖。攻撃力+2 [僧・魔・司用]", classes: ["Priest", "Mage", "Bishop"], tags: ["spirit", "appraisal"] },
  ARCH_WAND: { id: "ARCH_WAND", name: "大魔道の杖", type: "weapon", atk: 3, desc: "禁呪の紋が刻まれた高位の杖。攻撃力+3 [魔・司用]", classes: ["Mage", "Bishop"], tags: ["spirit", "curse"] },
  SHORT_SWORD: { id: "SHORT_SWORD", name: "ショートソード", type: "weapon", atk: 6, desc: "使いやすい鉄の小太刀。攻撃力+6 [戦・盗・侍・野用]", classes: ["Fighter", "Thief", "Samurai", "Ranger"], tags: ["iron", "blade"] },
  RAPIER: { id: "RAPIER", name: "レイピア", type: "weapon", atk: 8, desc: "突きに優れた細身の剣。攻撃力+8 [盗・司・野・忍用]", classes: ["Thief", "Bishop", "Ranger", "Ninja"], tags: ["iron", "blade"] },
  NINJA_DAGGER: { id: "NINJA_DAGGER", name: "忍びの短刀", type: "weapon", atk: 9, desc: "暗殺用の鋭い短刀。攻撃力+9 [盗・忍用]", classes: ["Thief", "Ninja"], tags: ["ambush", "poison"] },
  VENOM_FANG: { id: "VENOM_FANG", name: "毒牙の短刀", type: "weapon", atk: 9, desc: "毒を仕込む溝を持つ短刀。攻撃力+9 [盗・忍用]", classes: ["Thief", "Ninja"], tags: ["poison", "ambush"] },
  LONG_SWORD: { id: "LONG_SWORD", name: "ロングソード", type: "weapon", atk: 12, desc: "両刃の美しい鋼鉄長剣。攻撃力+12 [戦・侍・野用]", classes: ["Fighter", "Samurai", "Ranger"], tags: ["iron", "blade"] },
  NINJA_BLADE: { id: "NINJA_BLADE", name: "忍刀", type: "weapon", atk: 14, desc: "素早い斬撃に向いた片刃の忍刀。攻撃力+14 [盗・忍用]", classes: ["Thief", "Ninja"], tags: ["ambush", "blade"] },
  FLAME_SWORD: { id: "FLAME_SWORD", name: "フレイムソード", type: "weapon", atk: 14, desc: "火のルーンを刻んだ剣。攻撃力+14 [戦・侍・野用]", classes: ["Fighter", "Samurai", "Ranger"], tags: ["fire", "blade"] },
  CLAYMORE: { id: "CLAYMORE", name: "クレイモア", type: "weapon", atk: 18, desc: "重量のある両手大剣。攻撃力+18 [戦・侍用]", classes: ["Fighter", "Samurai"], tags: ["iron", "blade"] },
  MOONSHADOW: { id: "MOONSHADOW", name: "月影丸", type: "weapon", atk: 20, desc: "月光を吸う黒刃の忍刀。攻撃力+20 [盗・忍用]", classes: ["Thief", "Ninja"], tags: ["ambush", "evasion", "blade"] },
  KATANA: { id: "KATANA", name: "名刀ムラマサ", type: "weapon", atk: 25, desc: "伝説の妖刀。攻撃力+25 [戦・侍用]", classes: ["Fighter", "Samurai"], tags: ["blood", "blade", "curse"] },
  MACE: { id: "MACE", name: "メイス", type: "weapon", atk: 5, desc: "打撃用の重い金属槌。攻撃力+5 [戦・僧・司・野用]", classes: ["Fighter", "Priest", "Bishop", "Ranger"], tags: ["iron"] },
  SACRED_MACE: { id: "SACRED_MACE", name: "聖印メイス", type: "weapon", atk: 7, desc: "不死者を祓う祝福を受けた槌。攻撃力+7 [僧・司・野用]", classes: ["Priest", "Bishop", "Ranger"], tags: ["holy", "spirit"] },
  HOLY_STAFF: { id: "HOLY_STAFF", name: "祝聖の錫杖", type: "weapon", atk: 6, desc: "祝福を受けた司祭用の錫杖。攻撃力+6 [僧・司用]", classes: ["Priest", "Bishop"], tags: ["holy", "spirit"] },

  // Shields
  SMALL_SHIELD: { id: "SMALL_SHIELD", name: "スモールシールド", type: "shield", def: 2, desc: "木製の丸い小盾。防御力+2 [戦・盗・僧・侍・野用]", classes: ["Fighter", "Thief", "Priest", "Samurai", "Ranger"], tags: ["iron", "ward"] },
  BUCKLER: { id: "BUCKLER", name: "バックラー", type: "shield", def: 2, desc: "取り回しのよい小盾。防御力+2 [盗・司・野・忍用]", classes: ["Thief", "Bishop", "Ranger", "Ninja"], tags: ["ambush", "ward"] },
  LARGE_SHIELD: { id: "LARGE_SHIELD", name: "ラージシールド", type: "shield", def: 5, desc: "鉄製の頑丈な大盾。防御力+5 [戦・侍用]", classes: ["Fighter", "Samurai"], tags: ["iron", "ward"] },
  KNIGHT_SHIELD: { id: "KNIGHT_SHIELD", name: "ナイトシールド", type: "shield", def: 8, desc: "騎士用の鋼鉄盾。防御力+8 [戦・侍用]", classes: ["Fighter", "Samurai"], tags: ["iron", "ward"] },
  MAGIC_SHIELD: { id: "MAGIC_SHIELD", name: "魔法盾", type: "shield", def: 4, desc: "呪文を逸らす護符を打ち込んだ盾。防御力+4 [戦・僧・侍・司・野用]", classes: ["Fighter", "Priest", "Samurai", "Bishop", "Ranger"], tags: ["holy", "ward"] },

  // Armor
  ROBE: { id: "ROBE", name: "魔法使いのローブ", type: "armor", def: 1, desc: "魔力を帯びたシルクの衣。防御力+1 [僧・魔・司用]", classes: ["Priest", "Mage", "Bishop"], tags: ["spirit", "ward"] },
  MAGE_CLOAK: { id: "MAGE_CLOAK", name: "魔術師のクローク", type: "armor", def: 4, desc: "魔力で守られた外套。防御力+4 [魔・司用]", classes: ["Mage", "Bishop"], tags: ["spirit", "ward"] },
  ARCANE_ROBE: { id: "ARCANE_ROBE", name: "魔導ローブ", type: "armor", def: 5, desc: "術式を織り込んだ上質なローブ。防御力+5 [魔・司用]", classes: ["Mage", "Bishop"], tags: ["spirit", "ward"] },
  SORCERER_ROBE: { id: "SORCERER_ROBE", name: "大魔道のローブ", type: "armor", def: 6, desc: "魔除けの刺繍を施した高位のローブ。防御力+6 [魔・司用]", classes: ["Mage", "Bishop"], tags: ["spirit", "ward"] },
  LEATHER_ARMOR: { id: "LEATHER_ARMOR", name: "レザーアーマー", type: "armor", def: 4, desc: "なめし革の胸当て。防御力+4 [戦・盗・僧・侍・野用]", classes: ["Fighter", "Thief", "Priest", "Samurai", "Ranger"], tags: ["beast", "ward"] },
  EXPLORER_CLOAK: { id: "EXPLORER_CLOAK", name: "探索者の外套", type: "armor", def: 3, desc: "罠と毒への備えを隠した外套。防御力+3 [盗・僧・魔・司・野・忍用]", classes: ["Thief", "Priest", "Mage", "Bishop", "Ranger", "Ninja"], tags: ["beast", "poison"] },
  NINJA_SUIT: { id: "NINJA_SUIT", name: "忍者の装束", type: "armor", def: 5, desc: "闇に紛れる防具。防御力+5 [盗・忍用]", classes: ["Thief", "Ninja"], tags: ["ambush", "evasion"] },
  SCALE_MAIL: { id: "SCALE_MAIL", name: "スケイルメイル", type: "armor", def: 6, desc: "金属片を魚の鱗状に重ねた鎧。防御力+6 [戦・僧・侍・野用]", classes: ["Fighter", "Priest", "Samurai", "Ranger"], tags: ["iron", "ward"] },
  CHAIN_MAIL: { id: "CHAIN_MAIL", name: "チェインメイル", type: "armor", def: 8, desc: "細かな鉄環を編み込んだ鎧。防御力+8 [戦・僧・侍用]", classes: ["Fighter", "Priest", "Samurai"], tags: ["iron", "ward"] },

  PRIEST_ROBE: { id: "PRIEST_ROBE", name: "司祭の法衣", type: "armor", def: 8, desc: "神聖な加護を得た法衣。防御力+8 [僧・司用]", classes: ["Priest", "Bishop"], tags: ["holy", "ward"] },
  BATTLE_GARB: { id: "BATTLE_GARB", name: "戦装束", type: "armor", def: 6, desc: "軽量で動きやすい戦用の装束。防御力+6 [戦・盗・侍・忍用]", classes: ["Fighter", "Thief", "Samurai", "Ninja"], tags: ["ambush", "ward"] },
  PLATE_MAIL: { id: "PLATE_MAIL", name: "プレートメイル", type: "armor", def: 16, desc: "全身を包み込む鋼鉄の板金鎧。防御力+16 [戦・侍用]", classes: ["Fighter", "Samurai"], tags: ["iron", "ward"] },
  DRAGON_SCALE: { id: "DRAGON_SCALE", name: "竜鱗の鎧", type: "armor", def: 12, desc: "竜の鱗を加工して作られた極めて頑丈な鱗鎧。防御力+12 [戦・侍・野用]", classes: ["Fighter", "Samurai", "Ranger"], tags: ["dragon", "ward"] },

  // Accessories
  AMULET_HP: { id: "AMULET_HP", name: "生命の護符", type: "accessory", hpBonus: 10, desc: "生命力を高める小さな護符。最大HP+10 [全員用]", classes: ["Fighter", "Thief", "Priest", "Mage", "Samurai", "Bishop", "Ranger", "Ninja"], tags: ["ward"] },
  AMULET_MP: { id: "AMULET_MP", name: "魔力の護符", type: "accessory", mpBonus: 3, desc: "魔力を蓄える小さな護符。最大MP+3 [僧・魔・司用]", classes: ["Priest", "Mage", "Bishop"], tags: ["spirit"] },
  RING_STR: { id: "RING_STR", name: "力の指輪", type: "accessory", statsBonus: { str: 2 }, desc: "腕力を引き出す指輪。力+2 [全員用]", classes: ["Fighter", "Thief", "Priest", "Mage", "Samurai", "Bishop", "Ranger", "Ninja"], tags: ["iron"] },
  RING_AGI: { id: "RING_AGI", name: "韋駄天の指輪", type: "accessory", statsBonus: { agi: 1 }, desc: "身のこなしを軽くする指輪。素早さ+1 [全員用]", classes: ["Fighter", "Thief", "Priest", "Mage", "Samurai", "Bishop", "Ranger", "Ninja"], tags: ["ambush"] },
  RING_LUK: { id: "RING_LUK", name: "幸運の指輪", type: "accessory", statsBonus: { luk: 2 }, desc: "運を呼ぶ指輪。運+2 [全員用]", classes: ["Fighter", "Thief", "Priest", "Mage", "Samurai", "Bishop", "Ranger", "Ninja"], tags: ["search"] },
  THIEF_EYE: { id: "THIEF_EYE", name: "盗賊の目", type: "accessory", trapBonus: 10, desc: "罠の癖を見抜く片眼鏡。罠解除+10% [盗・野・忍用]", classes: ["Thief", "Ranger", "Ninja"], tags: ["trap"] },
  WARD_CHARM: { id: "WARD_CHARM", name: "守護の護符", type: "accessory", affixBonus: { spellGuard: 15 }, desc: "呪文を逸らす守り札。魔法耐性+15% [全員用]", classes: ["Fighter", "Thief", "Priest", "Mage", "Samurai", "Bishop", "Ranger", "Ninja"], tags: ["ward"] },
  DRAGON_RING: { id: "DRAGON_RING", name: "竜除けの指輪", type: "accessory", affixBonus: { antiDragon: 20 }, desc: "竜への備えを刻んだ指輪。竜特効+20% [全員用]", classes: ["Fighter", "Thief", "Priest", "Mage", "Samurai", "Bishop", "Ranger", "Ninja"], tags: ["dragon"] },
  HOLY_BAND: { id: "HOLY_BAND", name: "退魔の腕輪", type: "accessory", affixBonus: { antiUndead: 20 }, desc: "不死者を退ける腕輪。不死特効+20% [僧・司用]", classes: ["Priest", "Bishop"], tags: ["holy"] },
  SWIFT_BAND: { id: "SWIFT_BAND", name: "迅雷の帯", type: "accessory", affixBonus: { firstStrike: 5 }, desc: "初動を助ける細帯。先制+5% [全員用]", classes: ["Fighter", "Thief", "Priest", "Mage", "Samurai", "Bishop", "Ranger", "Ninja"], tags: ["ambush"] },

  // Potions / Quest items
  HEAL_POTION: { id: "HEAL_POTION", name: "傷薬 (ディオス薬)", type: "usable", desc: "使用するとHPを15回復する。" },
  NOISE_BALL: { id: "NOISE_BALL", name: "鳴らし玉", type: "usable", desc: "探索中、指定方向へ投げて着弾地点に音を発生させる。", exploreDirectional: true },
  GREATER_HEAL: { id: "GREATER_HEAL", name: "上薬", type: "usable", desc: "使用するとHPを40回復する。[全員用]", classes: ["Fighter", "Thief", "Priest", "Mage", "Samurai", "Bishop", "Ranger", "Ninja"] },
  ANTIDOTE: { id: "ANTIDOTE", name: "解毒薬", type: "usable", desc: "使用すると毒状態を解除する。" },
  EYE_DROPS: { id: "EYE_DROPS", name: "目薬", type: "usable", desc: "使用すると盲目状態を解除する。[全員用]", classes: ["Fighter", "Thief", "Priest", "Mage", "Samurai", "Bishop", "Ranger", "Ninja"] },
  PARALYZE_CURE: { id: "PARALYZE_CURE", name: "解痺薬", type: "usable", desc: "使用すると麻痺状態を解除する。[全員用]", classes: ["Fighter", "Thief", "Priest", "Mage", "Samurai", "Bishop", "Ranger", "Ninja"] },
  WAKE_POWDER: { id: "WAKE_POWDER", name: "覚醒薬", type: "usable", desc: "使用すると睡眠状態を解除する。[全員用]", classes: ["Fighter", "Thief", "Priest", "Mage", "Samurai", "Bishop", "Ranger", "Ninja"] },
  MANA_POTION: { id: "MANA_POTION", name: "魔力草", type: "usable", desc: "使用するとMPを3回復する。[全員用]", classes: ["Fighter", "Thief", "Priest", "Mage", "Samurai", "Bishop", "Ranger", "Ninja"] },
  ETHER: { id: "ETHER", name: "魔力の雫", type: "usable", desc: "使用するとMPを8回復する。[全員用]", classes: ["Fighter", "Thief", "Priest", "Mage", "Samurai", "Bishop", "Ranger", "Ninja"] },
  HOLY_WATER: { id: "HOLY_WATER", name: "祝福の聖水", type: "usable", desc: "使用するとHPを15回復し、毒状態も治療する。[全員用]", classes: ["Fighter", "Thief", "Priest", "Mage", "Samurai", "Bishop", "Ranger", "Ninja"] },
  TOWN_PORTAL: { id: "TOWN_PORTAL", name: "帰還の翼", type: "usable", desc: "任意のフロアから撤退し、ラン素材を100%持ち帰る。", classes: ["Fighter", "Thief", "Priest", "Mage", "Samurai", "Bishop", "Ranger", "Ninja"] },
  ESCAPE_SCROLL: { id: "ESCAPE_SCROLL", name: "離脱のスクロール", type: "usable", desc: "使用すると戦闘から逃れ、その場に留まる。[戦闘専用]", classes: ["Fighter", "Thief", "Priest", "Mage", "Samurai", "Bishop", "Ranger", "Ninja"], combatOnly: true },
  PANACEA: { id: "PANACEA", name: "万能薬", type: "usable", desc: "毒・盲目・麻痺・睡眠を治療する。[全員用]", classes: ["Fighter", "Thief", "Priest", "Mage", "Samurai", "Bishop", "Ranger", "Ninja"] },
  ELIXIR: { id: "ELIXIR", name: "エリクサー", type: "usable", desc: "HP・MPが全回復し、毒・麻痺・盲目も治療する究極の霊薬。[全員用]", classes: ["Fighter", "Thief", "Priest", "Mage", "Samurai", "Bishop", "Ranger", "Ninja"] },
  LEGENDARY_SWORD: { id: "LEGENDARY_SWORD", name: "神剣エクスカリバー", type: "weapon", atk: 40, desc: "聖なる光を放つ伝説の神剣。攻撃力+40 [戦・侍用]", classes: ["Fighter", "Samurai"], tags: ["holy", "blade"] },
  LEGENDARY_SHIELD: { id: "LEGENDARY_SHIELD", name: "イージスの盾", type: "shield", def: 15, desc: "あらゆる厄災を払う神の盾。防御力+15 [戦・侍用]", classes: ["Fighter", "Samurai"], tags: ["holy", "ward"] },
  SEALED_EXCALIBUR: { id: "SEALED_EXCALIBUR", name: "封印された聖剣", type: "weapon", atk: 26, desc: "封印が施された伝説の聖剣。攻撃力+26 [戦・侍用]", classes: ["Fighter", "Samurai"], tags: ["curse", "blade"] },
  HOLY_BLADE: { id: "HOLY_BLADE", name: "聖騎士の剣", type: "weapon", atk: 24, desc: "不死・悪魔を退ける聖なる剣。攻撃力+24 不死・悪魔特効+20% [戦・僧・侍・野用]", classes: ["Fighter", "Priest", "Samurai", "Ranger"], tags: ["holy", "blade"] },
  DRAGON_CHARM: { id: "DRAGON_CHARM", name: "竜除けの護符", type: "shield", def: 2, desc: "盾として装備し、竜の炎と爪を和らげる魔除けの護符。防御力+2 竜耐性・特効+30% [全員用]", classes: ["Fighter", "Thief", "Priest", "Mage", "Samurai", "Bishop", "Ranger", "Ninja"], tags: ["dragon", "ward"] },
  EXCALIBUR_FRAGMENT: { id: "EXCALIBUR_FRAGMENT", name: "神剣の破片", type: "quest", desc: "神剣の刀身が砕けた一部。不思議な光を放っている。" },
  ANTIGRAVITY_CRYSTAL: { id: "ANTIGRAVITY_CRYSTAL", name: "浮遊石 (クリスタル)", type: "quest", desc: "青く浮かび上がる伝説の結晶。城に持ち帰ると勝利。" },
  DRAGON_KEY: { id: "DRAGON_KEY", name: "竜の鍵", type: "quest", desc: "いにしえの竜の巣へと通じる刻印が刻まれた鍵。" },
  STR_POTION: { id: "STR_POTION", name: "剛力の薬", type: "usable", desc: "使用すると数ターンの間、攻撃力が上昇する。[戦闘専用]", classes: ["Fighter", "Thief", "Priest", "Mage", "Samurai", "Bishop", "Ranger", "Ninja"], combatOnly: true },
  GUARD_POTION: { id: "GUARD_POTION", name: "守りの薬", type: "usable", desc: "使用すると数ターンの間、防御力が上昇する。[戦闘専用]", classes: ["Fighter", "Thief", "Priest", "Mage", "Samurai", "Bishop", "Ranger", "Ninja"], combatOnly: true },
  HASTE_POTION: { id: "HASTE_POTION", name: "疾風の薬", type: "usable", desc: "使用すると数ターンの間、敏捷性が上昇する。[戦闘専用]", classes: ["Fighter", "Thief", "Priest", "Mage", "Samurai", "Bishop", "Ranger", "Ninja"], combatOnly: true },
  TRAP_KIT: { id: "TRAP_KIT", name: "罠外しキット", type: "usable", desc: "宝箱の罠を1つ確実に外す。[全員用]" }
};

export const CURSE_EFFECTS = {
  curse_blood_thirst: {
    id: "curse_blood_thirst",
    name: "渇血の呪い",
    desc: "攻撃力+15 / 回復効果-20%",
    tags: ["curse", "blood"],
    mod: { atk: 15, devotion: -20 }
  },
  curse_purging_flame: {
    id: "curse_purging_flame",
    name: "煉獄の呪い",
    desc: "火葬効果+30% / 魔法耐性-20%",
    tags: ["curse", "fire_rite"],
    mod: { fireRite: 30, spellGuard: -20 }
  },
  curse_spectral_decay: {
    id: "curse_spectral_decay",
    name: "霊蝕の呪い",
    desc: "最大MP+3 / 最大HP-15",
    tags: ["curse", "spirit"],
    mod: { mp: 3, hp: -15 }
  },
  curse_poisonous_vein: {
    id: "curse_poisonous_vein",
    name: "毒脈の呪い",
    desc: "攻撃時に15%で毒付与 / 毒耐性-30%",
    tags: ["curse", "poison"],
    mod: { poisonAtk: 15, poisonWard: -30 }
  },
  curse_cowardly_shield: {
    id: "curse_cowardly_shield",
    name: "臆病の呪い",
    desc: "防御+10 / 守護適性-15%",
    tags: ["curse", "ward"],
    mod: { def: 10, guardian: -15 }
  },
  curse_leaden_steps: {
    id: "curse_leaden_steps",
    name: "鉛足の呪い",
    desc: "防御力+6 / 素早さ-4",
    tags: ["curse", "ward"],
    mod: { def: 6, agi: -4 }
  },
  curse_hollow_soul: {
    id: "curse_hollow_soul",
    name: "虚魂の呪い",
    desc: "呪文威力+15% / 生命-4",
    tags: ["curse", "spirit"],
    mod: { arcane: 15, vit: -4 }
  }
};
