export const ENEMY_ROLES = Object.freeze({
  AGGRESSOR: "aggressor",
  DISRUPTOR: "disruptor",
  AMPLIFIER: "amplifier"
});

export const MONSTER_ROLE_BY_NAME = Object.freeze({
  "かみつき蟲": ENEMY_ROLES.AGGRESSOR,
  "ゴブリンの呪術師": ENEMY_ROLES.AGGRESSOR,
  "コボルトの斥候": ENEMY_ROLES.AGGRESSOR,
  "ゾンビ": ENEMY_ROLES.DISRUPTOR,
  "ガイコツ戦士": ENEMY_ROLES.AGGRESSOR,
  "キラーラビット": ENEMY_ROLES.AGGRESSOR,
  "マッドゴースト": ENEMY_ROLES.AGGRESSOR,
  "オークの戦士": ENEMY_ROLES.AGGRESSOR,
  "はぐれ魔術師": ENEMY_ROLES.AGGRESSOR,
  "ワーウルフ": ENEMY_ROLES.DISRUPTOR,
  "バンシー": ENEMY_ROLES.DISRUPTOR,
  "スピリット": ENEMY_ROLES.AGGRESSOR,
  "ウィル・オー・ウィスプ": ENEMY_ROLES.AGGRESSOR,
  "ジャイアントスパイダー": ENEMY_ROLES.DISRUPTOR,
  "フラッシュバット": ENEMY_ROLES.DISRUPTOR,
  "マスターメイジ": ENEMY_ROLES.AGGRESSOR,
  "ポイズンジャイアント": ENEMY_ROLES.DISRUPTOR,
  "デーモンガード": ENEMY_ROLES.AGGRESSOR,
  "アースジャイアント": ENEMY_ROLES.AGGRESSOR,
  "マスターデーモン": ENEMY_ROLES.AGGRESSOR,
  "フラック": ENEMY_ROLES.AGGRESSOR,
  "封印門の門番 B1": ENEMY_ROLES.AGGRESSOR,
  "封印門の門番 B2": ENEMY_ROLES.AGGRESSOR,
  "封印門の門番 B3": ENEMY_ROLES.AGGRESSOR,
  "ドラゴンパピー": ENEMY_ROLES.AGGRESSOR,
  "ワイバーン": ENEMY_ROLES.AGGRESSOR,
  "レッドドラゴン": ENEMY_ROLES.AGGRESSOR,
  "アイアンゴーレム": ENEMY_ROLES.AGGRESSOR,
  "マッドスライム": ENEMY_ROLES.AGGRESSOR,
  "メタルパピー": ENEMY_ROLES.AGGRESSOR,
  "オークの呪医": ENEMY_ROLES.AMPLIFIER,
  "プリーストデーモン": ENEMY_ROLES.AMPLIFIER,
  "スケルトンアーチャー": ENEMY_ROLES.AGGRESSOR,
  "ダークアサシン": ENEMY_ROLES.AGGRESSOR,
  "いにしえの竜": ENEMY_ROLES.AGGRESSOR,
  "リビングアーマー": ENEMY_ROLES.AGGRESSOR,
  "呪文喰い": ENEMY_ROLES.AGGRESSOR,
  "ストーンガード": ENEMY_ROLES.AMPLIFIER,
  "カースドハンド": ENEMY_ROLES.DISRUPTOR,
  "ブラッドバット群": ENEMY_ROLES.AGGRESSOR,
  "ドラゴンワーム": ENEMY_ROLES.AGGRESSOR,
  "分裂スライム": ENEMY_ROLES.AGGRESSOR,
  "群れネズミ": ENEMY_ROLES.AGGRESSOR,
  "錆びた盾兵": ENEMY_ROLES.AMPLIFIER,
  "火薬コウモリ": ENEMY_ROLES.AGGRESSOR,
  "まどろみ胞子": ENEMY_ROLES.DISRUPTOR,
  "泥の呪い子": ENEMY_ROLES.DISRUPTOR,
  "呪いの小鏡": ENEMY_ROLES.AGGRESSOR,
  "針甲虫": ENEMY_ROLES.AGGRESSOR,
  "鉄皮のゴブリン": ENEMY_ROLES.AMPLIFIER,
  "腐毒の蛆": ENEMY_ROLES.DISRUPTOR,
  "祈祷ゴブリン": ENEMY_ROLES.AMPLIFIER,
  "マナドレイン": ENEMY_ROLES.DISRUPTOR,
  "煙幕盗賊": ENEMY_ROLES.DISRUPTOR,
  "催眠コウモリ": ENEMY_ROLES.DISRUPTOR,
  "霧の亡霊": ENEMY_ROLES.AGGRESSOR,
  "魔封じの目玉": ENEMY_ROLES.DISRUPTOR,
  "骨の鼓手": ENEMY_ROLES.AMPLIFIER,
  "弱体の魔女": ENEMY_ROLES.DISRUPTOR,
  "解呪の司祭": ENEMY_ROLES.AMPLIFIER,
  "石像兵": ENEMY_ROLES.AMPLIFIER,
  "魔鏡の司祭": ENEMY_ROLES.AGGRESSOR,
  "血塗れの処刑人": ENEMY_ROLES.AGGRESSOR,
  "鋼殻ビートル": ENEMY_ROLES.AGGRESSOR,
  "魔防崩しの蛇": ENEMY_ROLES.DISRUPTOR,
  "沈黙の修道士": ENEMY_ROLES.DISRUPTOR,
  "召喚する悪魔": ENEMY_ROLES.AMPLIFIER,
  "双頭の番犬": ENEMY_ROLES.AGGRESSOR,
  "結界の守護者": ENEMY_ROLES.AMPLIFIER,
  "竜血の再生者": ENEMY_ROLES.AGGRESSOR,
  "反逆の鎧": ENEMY_ROLES.AGGRESSOR,
  "黒曜の魔導士": ENEMY_ROLES.AGGRESSOR,
  "深淵の分裂体": ENEMY_ROLES.AGGRESSOR,
  "破滅の導師": ENEMY_ROLES.AGGRESSOR,
  "命喰いの影": ENEMY_ROLES.DISRUPTOR,
  "灰燼の術士": ENEMY_ROLES.DISRUPTOR,
  "盾持ちデーモン": ENEMY_ROLES.AMPLIFIER
});

const MONSTER_DATA = [
  { name: "かみつき蟲", level: 1, hp: 16, atk: 6, def: 1, exp: 40, spriteType: "biter", color: "#00ff66" },
  { name: "ゴブリンの呪術師", level: 1, hp: 20, atk: 4, def: 1, exp: 50, spriteType: "kobold", spell: "HALITO", spellChance: 0.3, color: "#00ff66" },
  { name: "コボルトの斥候", level: 1, hp: 22, atk: 7, def: 2, exp: 60, spriteType: "kobold", color: "#00ff66" },
  { name: "ゾンビ", level: 2, hp: 32, atk: 7, def: 3, exp: 120, spriteType: "zombie", isPoisonous: true, tags: ["undead"], color: "#8a2be2" },
  { name: "ガイコツ戦士", level: 2, hp: 40, atk: 9, def: 4, exp: 180, spriteType: "skeleton", tags: ["undead"], color: "#dcdcdc" },
  { name: "キラーラビット", level: 2, hp: 32, atk: 12, def: 4, exp: 120, spriteType: "rabbit", tags: ["beast"], color: "#ff8c00" },
  { name: "マッドゴースト", level: 2, hp: 28, atk: 6, def: 2, exp: 140, spriteType: "spirit", physResist: 0.5, tags: ["undead", "spirit"], color: "#8a2be2" },
  { name: "オークの戦士", level: 3, hp: 56, atk: 12, def: 6, exp: 280, spriteType: "orc", color: "#ff8c00" },
  { name: "はぐれ魔術師", level: 3, hp: 44, atk: 8, def: 4, exp: 280, spriteType: "mage", spell: "HALITO", spellChance: 0.3, color: "#da70d6" },
  { name: "ワーウルフ", level: 3, hp: 72, atk: 14, def: 5, exp: 340, spriteType: "orc", isParalyzing: true, statusChance: 0.3, tags: ["beast"], color: "#ff8c00" },
  { name: "バンシー", level: 3, hp: 56, atk: 9, def: 3, exp: 300, spriteType: "spirit", isParalyzing: true, magicResist: 0.6, physResist: 0.2, statusChance: 0.3, tags: ["undead", "spirit"], color: "#da70d6" },
  
  // 既存モンスターの再調整
  { name: "スピリット", level: 2, hp: 36, atk: 6, def: 2, exp: 180, spriteType: "spirit", physResist: 0.6, magicResist: -0.2, tags: ["undead", "spirit"], color: "#00e5ff" },
  { name: "ウィル・オー・ウィスプ", level: 3, hp: 48, atk: 7, def: 2, exp: 260, spriteType: "wisp", magicResist: 0.8, tags: ["spirit"], color: "#ffffff" },
  { name: "ジャイアントスパイダー", level: 2, hp: 36, atk: 7, def: 3, exp: 150, spriteType: "spider", isPoisonous: true, color: "#bf5af2" },
  { name: "フラッシュバット", level: 2, hp: 24, atk: 5, def: 2, exp: 100, spriteType: "bat", isBlinding: true, tags: ["beast"], color: "#e5ff00" },

  { name: "マスターメイジ", level: 4, hp: 76, atk: 9, def: 5, exp: 650, spriteType: "mage", spell: "LAHALITO", spellChance: 0.35, magicResist: 0.3, color: "#ff3b30" },
  { name: "ポイズンジャイアント", level: 4, hp: 130, atk: 19, def: 7, exp: 600, spriteType: "zombie", isPoisonous: true, color: "#bf5af2" },
  
  { name: "デーモンガード", level: 5, hp: 180, atk: 18, def: 8, exp: 2000, spriteType: "flack", spell: "LAHALITO", isBoss: true, isMidboss: true, tags: ["demon"], color: "#ff8c00" },
  { name: "アースジャイアント", level: 6, hp: 144, atk: 18, def: 10, exp: 1200, spriteType: "zombie", magicResist: -0.25, color: "#8a2be2" },
  { name: "マスターデーモン", level: 7, hp: 140, atk: 16, def: 8, exp: 1400, spriteType: "flack", spell: "MADALTO", spellChance: 0.25, magicResist: 0.3, tags: ["demon"], color: "#ff3b30" },
  
  { name: "フラック", level: 4, hp: 260, atk: 23, def: 11, exp: 3000, spriteType: "flack", spell: "LAHALITO", spellChance: 0.25, physResist: 0.2, magicResist: 0.2, isRare: true, dangerRare: true, color: "#ff3b30" },
  { name: "封印門の門番 B1", level: 3, hp: 96, atk: 15, def: 7, exp: 120, spriteType: "flack", spell: "HALITO", spellChance: 0.20, physResist: 0.1, magicResist: 0.1, isRare: true, dangerRare: true, tags: ["demon"], color: "#ff3b30" },
  { name: "封印門の門番 B2", level: 4, hp: 150, atk: 19, def: 9, exp: 260, spriteType: "flack", spell: "LAHALITO", spellChance: 0.20, physResist: 0.15, magicResist: 0.15, isRare: true, dangerRare: true, tags: ["demon"], color: "#ff3b30" },
  { name: "封印門の門番 B3", level: 5, hp: 210, atk: 22, def: 12, exp: 450, spriteType: "flack", spell: "LAHALITO", spellChance: 0.25, physResist: 0.2, magicResist: 0.2, isRare: true, dangerRare: true, tags: ["demon"], color: "#ff3b30" },
  { name: "ドラゴンパピー", level: 4, hp: 90, atk: 12, def: 5, exp: 600, spriteType: "dragon", spell: "HALITO", tags: ["dragon"], color: "#ffc0cb" },
  { name: "ワイバーン", level: 5, hp: 130, atk: 17, def: 7, exp: 1200, spriteType: "dragon", spell: "LAHALITO", spellChance: 0.10, tags: ["dragon"], color: "#ffa500" },
  { name: "レッドドラゴン", level: 7, hp: 200, atk: 22, def: 10, exp: 3500, spriteType: "dragon", spell: "MADALTO", spellChance: 0.12, tags: ["dragon"], color: "#ff3b30" },
  { name: "アイアンゴーレム", level: 3, hp: 64, atk: 10, def: 14, exp: 350, spriteType: "zombie", physResist: 0.5, magicResist: -0.5, color: "#8e8e93" },
  { name: "マッドスライム", level: 1, hp: 48, atk: 4, def: 1, exp: 120, spriteType: "biter", physResist: 0.4, magicResist: -0.5, color: "#ff9500" },
  { name: "メタルパピー", level: 4, hp: 16, atk: 5, def: 10, exp: 600, spriteType: "biter", fleeChance: 0.50, color: "#ffd700", isRare: true, treasureRare: true },
  { name: "オークの呪医", level: 2, hp: 44, atk: 5, def: 3, exp: 200, spriteType: "orc", spell: "DIOS", spellChance: 0.3, color: "#34c759" },
  { name: "プリーストデーモン", level: 5, hp: 120, atk: 12, def: 6, exp: 800, spriteType: "flack", spell: "DIALMA", spellChance: 0.3, tags: ["demon"], color: "#34c759" },
  { name: "スケルトンアーチャー", level: 2, hp: 40, atk: 9, def: 3, exp: 150, spriteType: "skeleton", isSniper: true, tags: ["undead"], color: "#af52de" },
  { name: "ダークアサシン", level: 3, hp: 56, atk: 14, def: 4, exp: 350, spriteType: "kobold", isSniper: true, color: "#ff3b30" },
  { name: "いにしえの竜", level: 8, hp: 640, atk: 26, def: 16, exp: 6000, spriteType: "dragon", spell: "TILTOWAIT", magicResist: 0.25, isBoss: true, tags: ["dragon"], color: "#ff3b30" },

  // 追加モンスター
  { name: "リビングアーマー", level: 2, hp: 52, atk: 8, def: 10, exp: 260, spriteType: "zombie", magicResist: -0.25, color: "#8e8e93" },
  { name: "呪文喰い", level: 3, hp: 68, atk: 10, def: 4, exp: 420, spriteType: "spirit", magicResist: 0.75, tags: ["spirit"], color: "#4cd964" },
  { name: "ストーンガード", level: 5, hp: 110, atk: 15, def: 16, exp: 1200, spriteType: "zombie", magicResist: -0.4, traits: ["guardAdjacent"], guard: { chance: 0.5 }, color: "#708090" },
  { name: "カースドハンド", level: 3, hp: 40, atk: 7, def: 3, exp: 320, spriteType: "zombie", isParalyzing: true, statusChance: 0.25, color: "#5856d6" },
  { name: "ブラッドバット群", level: 2, hp: 20, atk: 5, def: 1, exp: 90, spriteType: "bat", tags: ["beast"], color: "#ff3b30" },
  { name: "ドラゴンワーム", level: 5, hp: 84, atk: 14, def: 6, exp: 850, spriteType: "dragon", tags: ["dragon"], color: "#ff9500" },
  { name: "分裂スライム", level: 1, hp: 20, atk: 3, def: 1, exp: 70, spriteType: "biter", traits: ["splitOnDeath"], split: { count: 2, hpRate: 0.5 }, color: "#34c759" },
  { name: "群れネズミ", level: 1, hp: 12, atk: 3, def: 0, exp: 35, spriteType: "rabbit", tags: ["beast"], color: "#8e8e93" },
  { name: "錆びた盾兵", level: 1, hp: 28, atk: 4, def: 4, exp: 90, spriteType: "skeleton", traits: ["guardAdjacent"], guard: { chance: 0.5 }, color: "#8e8e93" },
  { name: "火薬コウモリ", level: 1, hp: 22, atk: 4, def: 1, exp: 80, spriteType: "bat", traits: ["selfDestruct"], tags: ["beast"], color: "#ff9500" },
  { name: "まどろみ胞子", level: 1, hp: 20, atk: 4, def: 1, exp: 70, spriteType: "wisp", isSleepInflicting: true, statusChance: 0.2, color: "#00e5ff" },
  { name: "泥の呪い子", level: 1, hp: 24, atk: 3, def: 1, exp: 85, spriteType: "biter", traits: ["debuffPhysicalDef"], traitChance: 0.2, debuffValue: 2, color: "#8a2be2" },
  { name: "呪いの小鏡", level: 2, hp: 24, atk: 3, def: 1, exp: 180, spriteType: "wisp", traits: ["reflectMagic"], magicReflect: { chance: 0.5 }, color: "#ffffff" },
  { name: "針甲虫", level: 2, hp: 32, atk: 5, def: 5, exp: 160, spriteType: "biter", traits: ["reflectPhysical"], physicalReflect: { rate: 0.3 }, color: "#ff9500" },
  { name: "鉄皮のゴブリン", level: 2, hp: 36, atk: 6, def: 3, exp: 150, spriteType: "kobold", traits: ["buffPhysicalDef"], traitChance: 0.3, buffValue: 2, color: "#00ff66" },
  { name: "腐毒の蛆", level: 2, hp: 28, atk: 4, def: 1, exp: 140, spriteType: "biter", traits: ["debuffPhysicalDef"], traitChance: 0.25, debuffValue: 2, color: "#bf5af2" },
  { name: "祈祷ゴブリン", level: 2, hp: 36, atk: 4, def: 2, exp: 190, spriteType: "orc", spell: "DIOS", spellChance: 0.35, color: "#34c759" },
  { name: "マナドレイン", level: 2, hp: 36, atk: 4, def: 2, exp: 180, spriteType: "spirit", traits: ["drainMp"], traitChance: 0.35, isSniper: true, tags: ["spirit"], color: "#00e5ff" },
  { name: "煙幕盗賊", level: 2, hp: 36, atk: 7, def: 2, exp: 210, spriteType: "kobold", isBlinding: true, statusChance: 0.25, color: "#8e8e93" },
  { name: "催眠コウモリ", level: 2, hp: 24, atk: 5, def: 2, exp: 110, spriteType: "bat", isSleepInflicting: true, statusChance: 0.3, tags: ["beast"], color: "#e5ff00" },
  { name: "霧の亡霊", level: 3, hp: 44, atk: 7, def: 2, exp: 320, spriteType: "spirit", physResist: 0.3, magicResist: -0.3, tags: ["undead", "spirit"], color: "#00e5ff" },
  { name: "魔封じの目玉", level: 3, hp: 48, atk: 6, def: 2, exp: 360, spriteType: "wisp", traits: ["silence"], traitChance: 0.35, color: "#ffcc00" },
  { name: "骨の鼓手", level: 3, hp: 48, atk: 5, def: 3, exp: 380, spriteType: "skeleton", traits: ["buffAtk"], traitChance: 0.35, buffValue: 3, tags: ["undead"], color: "#dcdcdc" },
  { name: "弱体の魔女", level: 3, hp: 52, atk: 6, def: 3, exp: 420, spriteType: "mage", traits: ["debuffMagicDef"], traitChance: 0.3, color: "#da70d6" },
  { name: "解呪の司祭", level: 3, hp: 60, atk: 7, def: 4, exp: 450, spriteType: "mage", traits: ["cleanseAlly"], traitChance: 0.35, color: "#34c759" },
  { name: "石像兵", level: 4, hp: 100, atk: 13, def: 15, exp: 900, spriteType: "zombie", magicResist: -0.4, traits: ["guardAdjacent"], guard: { chance: 0.5 }, color: "#708090" },
  { name: "魔鏡の司祭", level: 4, hp: 76, atk: 8, def: 5, exp: 1000, spriteType: "mage", traits: ["reflectMagic"], magicReflect: { chance: 0.6 }, color: "#af52de" },
  { name: "血塗れの処刑人", level: 4, hp: 105, atk: 16, def: 6, exp: 950, spriteType: "orc", traits: ["targetLowHp"], color: "#ff3b30" },
  { name: "鋼殻ビートル", level: 4, hp: 88, atk: 12, def: 12, exp: 1100, spriteType: "biter", traits: ["reflectPhysical"], physicalReflect: { rate: 0.4 }, magicResist: -0.25, color: "#ff9500" },
  { name: "魔防崩しの蛇", level: 4, hp: 72, atk: 11, def: 5, exp: 900, spriteType: "spider", traits: ["debuffMagicDef"], traitChance: 0.25, color: "#bf5af2" },
  { name: "沈黙の修道士", level: 4, hp: 80, atk: 10, def: 6, exp: 980, spriteType: "mage", traits: ["silence"], traitChance: 0.18, color: "#dcdcdc" },
  { name: "召喚する悪魔", level: 4, hp: 90, atk: 12, def: 6, exp: 1150, spriteType: "flack", traits: ["summonAlly"], summon: { name: "ゴブリンの呪術師", maxAllies: 5 }, tags: ["demon"], color: "#ff3b30" },
  { name: "双頭の番犬", level: 5, hp: 140, atk: 15, def: 8, exp: 1600, spriteType: "dragon", traits: ["multiAction"], tags: ["beast"], color: "#ff9500" },
  { name: "結界の守護者", level: 5, hp: 130, atk: 12, def: 8, exp: 1900, spriteType: "flack", traits: ["buffPhysicalDef", "buffMagicDef"], traitChance: 0.35, buffValue: 3, color: "#34c759" },
  { name: "竜血の再生者", level: 5, hp: 170, atk: 17, def: 8, exp: 1800, spriteType: "dragon", traits: ["regen"], regenAmount: 10, magicResist: -0.2, tags: ["dragon"], color: "#ff3b30" },
  { name: "反逆の鎧", level: 5, hp: 150, atk: 18, def: 16, exp: 1900, spriteType: "zombie", traits: ["reflectPhysical"], physicalReflect: { rate: 0.3 }, magicResist: -0.35, color: "#8e8e93" },
  { name: "黒曜の魔導士", level: 5, hp: 116, atk: 10, def: 6, exp: 2000, spriteType: "mage", spell: "LAHALITO", spellChance: 0.35, magicResist: 0.6, color: "#ff3b30" },
  { name: "深淵の分裂体", level: 5, hp: 120, atk: 14, def: 7, exp: 1700, spriteType: "biter", traits: ["splitOnDeath"], split: { count: 2, hpRate: 0.5 }, color: "#5856d6" },
  { name: "破滅の導師", level: 5, hp: 120, atk: 12, def: 7, exp: 2100, spriteType: "mage", traits: ["chargeAttack"], traitChance: 0.35, color: "#af52de" },
  { name: "命喰いの影", level: 5, hp: 108, atk: 15, def: 5, exp: 1800, spriteType: "spirit", traits: ["antiHeal"], traitChance: 0.3, tags: ["spirit"], color: "#5856d6" },
  { name: "灰燼の術士", level: 5, hp: 104, atk: 9, def: 5, exp: 1900, spriteType: "mage", traits: ["counterSpell"], counterSpell: { chance: 0.2 }, color: "#ff9500" },
  { name: "盾持ちデーモン", level: 5, hp: 160, atk: 17, def: 12, exp: 2200, spriteType: "flack", traits: ["guardAdjacent"], guard: { chance: 0.65, damageRate: 0.7 }, tags: ["demon"], color: "#ff3b30" }
];

export const MONSTERS = MONSTER_DATA.map(monster => ({
  ...monster,
  role: MONSTER_ROLE_BY_NAME[monster.name]
}));

export const MONSTER_TRAIT_LABELS = Object.freeze({
  multiAction: "1ターンに複数回行動",
  chargeAttack: "溜めて大打撃",
  summonAlly: "仲間を呼ぶ",
  regen: "自己再生",
  selfDestruct: "自爆",
  drainMp: "MPを吸収",
  silence: "呪文を封じる",
  antiHeal: "回復を阻害",
  splitOnDeath: "撃破時に分裂",
  reflectPhysical: "物理を反射",
  reflectMagic: "呪文を反射",
  counterSpell: "呪文に反撃",
  guardAdjacent: "隣の敵をかばう",
  targetLowHp: "瀕死の味方を狙う",
  cleanseAlly: "味方の状態異常を治す",
  buffAtk: "味方の攻撃力を上げる",
  buffPhysicalDef: "味方の物理防御を上げる",
  buffMagicDef: "味方の魔法防御を上げる",
  debuffPhysicalDef: "こちらの物理防御を下げる",
  debuffMagicDef: "こちらの魔法防御を下げる"
});

const MONSTER_ROLE_LABELS = Object.freeze({
  [ENEMY_ROLES.AGGRESSOR]: "攻撃役",
  [ENEMY_ROLES.DISRUPTOR]: "妨害役",
  [ENEMY_ROLES.AMPLIFIER]: "支援役"
});

export function describeMonsterTraits(monster) {
  const descriptions = [];
  const statusPrefix = monster.statusChance >= 0.5 ? "高確率で" : "";
  const statusTraits = [
    ["isPoisonous", "毒を付与"],
    ["isParalyzing", "麻痺を付与"],
    ["isSleepInflicting", "睡眠を付与"],
    ["isBlinding", "盲目を付与"]
  ];

  for (const [flag, label] of statusTraits) {
    if (monster[flag]) descriptions.push(`${statusPrefix}${label}`);
  }

  if (monster.isSniper) descriptions.push("後列を狙う");
  if (monster.fleeChance) descriptions.push("逃走することがある");

  const traits = new Set(monster.traits || []);
  for (const [trait, label] of Object.entries(MONSTER_TRAIT_LABELS)) {
    if (traits.has(trait)) descriptions.push(label);
  }

  const role = monster.role || MONSTER_ROLE_BY_NAME[monster.name];
  if (MONSTER_ROLE_LABELS[role]) descriptions.push(MONSTER_ROLE_LABELS[role]);

  if (monster.isBoss) descriptions.push("ボス");
  if (monster.isMidboss) descriptions.push("中ボス");
  if (monster.isRare) {
    descriptions.push(monster.name === "メタルパピー" ? "希少な魔物" : "非常に強力な強敵");
  }

  return descriptions.length > 0 ? descriptions : ["標準的なモンスター"];
}
