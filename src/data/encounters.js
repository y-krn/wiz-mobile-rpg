import { ENEMY_ROLES } from "./monsters.js";

export const ENCOUNTER_COMPOSITION_RULES = Object.freeze({
  minSize: 1,
  maxSize: 3,
  maxCopiesPerMonster: 2,
  maxRoleCounts: Object.freeze({
    [ENEMY_ROLES.AGGRESSOR]: 3,
    [ENEMY_ROLES.DISRUPTOR]: 1,
    [ENEMY_ROLES.AMPLIFIER]: 1
  }),
  forbiddenSoloRoles: Object.freeze([ENEMY_ROLES.AMPLIFIER])
});

export const ENCOUNTER_SIZE_WEIGHTS = Object.freeze({
  1: Object.freeze([0.55, 0.42, 0.03]),
  2: Object.freeze([0.40, 0.55, 0.05]),
  3: Object.freeze([0.30, 0.65, 0.05]),
  4: Object.freeze([0.25, 0.70, 0.05]),
  5: Object.freeze([0.20, 0.75, 0.05])
});

export const ENCOUNTER_POOLS = Object.freeze({
  1: Object.freeze([
    "かみつき蟲", "コボルトの斥候", "マッドスライム", "フラッシュバット",
    "分裂スライム", "錆びた盾兵", "ゴブリンの呪術師", "群れネズミ",
    "火薬コウモリ", "まどろみ胞子", "泥の呪い子"
  ]),
  2: Object.freeze([
    "リビングアーマー", "ゴブリンの呪術師", "ブラッドバット群", "ゾンビ",
    "ジャイアントスパイダー", "針甲虫", "呪いの小鏡", "鉄皮のゴブリン",
    "祈祷ゴブリン", "マナドレイン", "スケルトンアーチャー", "煙幕盗賊",
    "腐毒の蛆", "催眠コウモリ"
  ]),
  3: Object.freeze([
    "スピリット", "はぐれ魔術師", "呪文喰い", "オークの戦士",
    "カースドハンド", "ゾンビ", "アイアンゴーレム", "霧の亡霊",
    "骨の鼓手", "弱体の魔女", "魔封じの目玉", "解呪の司祭"
  ]),
  4: Object.freeze([
    "ストーンガード", "マスターメイジ", "ワーウルフ", "バンシー",
    "アースジャイアント", "ポイズンジャイアント", "ブラッドバット群", "石像兵",
    "魔鏡の司祭", "鋼殻ビートル", "弱体の魔女", "血塗れの処刑人",
    "沈黙の修道士", "召喚する悪魔", "魔防崩しの蛇", "魔封じの目玉",
    "解呪の司祭"
  ]),
  5: Object.freeze([
    "マスターデーモン", "プリーストデーモン", "ドラゴンワーム", "レッドドラゴン",
    "ワイバーン", "ストーンガード", "反逆の鎧", "黒曜の魔導士",
    "竜血の再生者", "結界の守護者", "双頭の番犬", "命喰いの影",
    "破滅の導師", "盾持ちデーモン", "深淵の分裂体", "灰燼の術士"
  ])
});
