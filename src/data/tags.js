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
  evasion: { name: "回避", desc: "身軽な動きによる危険回避" },
  material: { name: "素材", desc: "迷宮素材を見つけ出す知識" },
  fortune: { name: "金運", desc: "財貨を引き寄せる運気" },
  contract: { name: "契約", desc: "依頼の成果を高める技量" },
  merchant: { name: "商談", desc: "商人との取引を有利にする話術" },
  depth: { name: "深層", desc: "迷宮深部で力を引き出す覚悟" },
  vigor: { name: "無傷", desc: "万全の状態から放つ猛攻" },
  resistance: { name: "不屈", desc: "状態異常に抗う強い意志" },
  precision: { name: "精唱", desc: "呪文を正確に導く集中力" }
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
  MILWA: ["holy", "analysis"],
  LOMILWA: ["holy", "analysis"],
  MABARRIER: ["ward"],
  MASFEAL: ["ward"],
  DUMAPIC: ["analysis"],
  MONTINO: ["analysis"],
  MORLIS: ["analysis"]
};

export const MATERIAL_TAGS = {
  "霊粉": ["holy", "spirit", "appraisal", "contract", "precision"],
  "毒腺": ["poison", "trap", "material", "resistance"],
  "鉄片": ["iron", "ward", "merchant", "vigor"],
  "竜鱗": ["dragon", "fire", "depth"],
  "黒角": ["curse", "demon", "blood", "fortune"]
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
  blood: { name: "血印", type: "followUp", value: 10, desc: "連撃適性+10%", gold: 150, matCost: 3 },
  material: { name: "採印", type: "materialFind", value: 10, desc: "素材発見率+10%", gold: 150, matCost: 2 },
  fortune: { name: "財印", type: "goldBonus", value: 10, desc: "獲得GOLD+10%", gold: 200, matCost: 3 },
  contract: { name: "契印", type: "contractReward", value: 10, desc: "契約報酬+10%", gold: 200, matCost: 3 },
  merchant: { name: "商印", type: "merchantDiscount", value: 5, desc: "商人価格-5%", gold: 150, matCost: 2 },
  depth: { name: "深印", type: "deepAssault", value: 10, desc: "B3F以深で与ダメージ+10%", gold: 250, matCost: 4 },
  vigor: { name: "剛印", type: "fullHpDamage", value: 10, desc: "HP満タン時に与ダメージ+10%", gold: 250, matCost: 4 },
  resistance: { name: "忍印", type: "statusResistance", value: 12, desc: "状態異常耐性+12%", gold: 200, matCost: 3 },
  precision: { name: "詠印", type: "spellAccuracy", value: 10, desc: "呪文命中率+10%", gold: 200, matCost: 3 }
};
