const biome = (definition) => Object.freeze({
  ...definition,
  enemyPool: Object.freeze(definition.enemyPool),
  gimmicks: Object.freeze(definition.gimmicks),
  theme: Object.freeze({
    ...definition.theme,
    entryText: Object.freeze(definition.theme.entryText),
    auraLexicon: Object.freeze(definition.theme.auraLexicon),
    eventSkins: Object.freeze(definition.theme.eventSkins),
    trapSkins: Object.freeze(definition.theme.trapSkins)
  })
});

export const BIOMES = Object.freeze([
  biome({
    id: "collapsed_mine", name: "崩れた坑道", cssClass: "floor-theme-b1",
    bossName: "デーモンガード",
    enemyPool: ["かみつき蟲", "コボルトの斥候", "マッドスライム", "フラッシュバット", "分裂スライム", "錆びた盾兵", "ゴブリンの呪術師", "群れネズミ", "火薬コウモリ", "まどろみ胞子", "泥の呪い子"],
    gimmicks: { trapSet: ["damage", "alarm"], oneWayBonus: 0, trapBonus: 0 },
    theme: {
      entryText: { first: "崩れた岩肌の奥から、乾いた反響音が返ってくる。", revisit: "崩れた坑道へ戻った。遠くの物音が坑道を伝う。" },
      auraLexicon: { spring: "岩間から湧き水の音が聞こえる…", tablet: "壁の刻印から弱い魔力を感じる…", merchant: "置き去りの荷車のそばから衣擦れが聞こえる…", stairs: "下へ続く坑道から冷たい風が流れてくる…", chest: "崩れた岩陰に何かが隠されている気がする…", boss: "反響の奥から、重い足音が近づいてくる…" },
      eventSkins: { spring: "坑道の湧き水", tablet: "坑夫の刻印", merchant: "荷車の商人", camp: null },
      trapSkins: { damage: "落石の仕掛け", mpDrain: "魔力を奪う鉱脈", alarm: "鳴子の罠", pitfall: "崩れた床" }
    }
  }),
  biome({
    id: "forgotten_catacomb", name: "忘れられた地下墓地", cssClass: "floor-theme-b2",
    bossName: "ストーンガード",
    enemyPool: ["リビングアーマー", "ゾンビ", "ジャイアントスパイダー", "針甲虫", "呪いの小鏡", "鉄皮のゴブリン", "祈祷ゴブリン", "マナドレイン", "スケルトンアーチャー", "煙幕盗賊", "腐毒の蛆", "催眠コウモリ"],
    gimmicks: { trapSet: ["mpDrain", "alarm"], oneWayBonus: 0, trapBonus: 1 },
    theme: {
      entryText: { first: "並ぶ棺の間を、死者の吐息のような冷気が抜ける。", revisit: "忘れられた地下墓地へ戻った。礼拝堂跡だけが静かだ。" },
      auraLexicon: { spring: "聖水盤から水滴の音が響く…", tablet: "墓碑から弱い魔力を感じる…", merchant: "棺の間から静かな衣擦れが聞こえる…", stairs: "地下へ続く墓道から冷気が流れる…", chest: "棺の陰に何かが納められている気がする…", boss: "暗闇の奥で、乾いた骨の音が重なる…" },
      eventSkins: { spring: "朽ちた聖水盤", tablet: "墓碑銘", merchant: "墓守の商人", camp: "礼拝堂跡" },
      trapSkins: { damage: "墓守の火葬罠", mpDrain: "魂を吸う墓標", alarm: "死者を呼ぶ鐘", pitfall: "崩れた墓穴" }
    }
  }),
  biome({
    id: "rift_nest", name: "大裂溝の巣窟", cssClass: "floor-theme-b3",
    bossName: "ポイズンジャイアント",
    enemyPool: ["スピリット", "はぐれ魔術師", "呪文喰い", "オークの戦士", "カースドハンド", "アイアンゴーレム", "霧の亡霊", "骨の鼓手", "弱体の魔女", "魔封じの目玉", "解呪の司祭"],
    gimmicks: { trapSet: ["damage", "pitfall"], oneWayBonus: 1, trapBonus: 1 },
    theme: {
      entryText: { first: "底知れぬ裂け目を、無数の糸と獣の息遣いが覆う。", revisit: "大裂溝の巣窟へ戻った。足元の震えが巣へ伝わる。" },
      auraLexicon: { spring: "裂け目の底から水音が上がる…", tablet: "糸に覆われた碑から魔力を感じる…", merchant: "巣の向こうから布の擦れる音がする…", stairs: "深い裂け目から風が吹き上がる…", chest: "巣糸の塊に何かが包まれている気がする…", boss: "大地を伝う振動に、魔性の脈動が混じる…" },
      eventSkins: { spring: "裂溝の雫", tablet: "糸封じの碑", merchant: "巣渡りの商人", camp: null },
      trapSkins: { damage: "灼けた裂け目", mpDrain: "魔力を啜る巣糸", alarm: "巣を揺らす警戒糸", pitfall: "大裂溝" }
    }
  }),
  biome({
    id: "sunken_library", name: "水没した魔導書庫", cssClass: "floor-theme-b4",
    bossName: "マスターデーモン",
    enemyPool: ["ストーンガード", "マスターメイジ", "バンシー", "ブラッドバット群", "石像兵", "魔鏡の司祭", "鋼殻ビートル", "弱体の魔女", "沈黙の修道士", "召喚する悪魔", "魔防崩しの蛇"],
    gimmicks: { trapSet: ["mpDrain", "alarm"], oneWayBonus: 1, trapBonus: 2 },
    theme: {
      entryText: { first: "水に沈む書架の文字が、侵入者の魔力に反応して淡く光る。", revisit: "水没した魔導書庫へ戻った。濡れた頁がひとりでにめくれる。" },
      auraLexicon: { spring: "水没した回廊から水音が響く…", tablet: "書見台から濃い魔力が漏れる…", merchant: "書架の向こうで濡れた外套が擦れる…", stairs: "沈んだ階段から冷たい水気が流れる…", chest: "朽ちた書架に封じられた品の気配がする…", boss: "書庫全体を押さえつける魔力が脈打つ…" },
      eventSkins: { spring: "溢れる魔導水", tablet: "朽ちた書見台", merchant: "書庫漁りの商人", camp: "読書室跡" },
      trapSkins: { damage: "禁書の火印", mpDrain: "魔力を吸う紋様", alarm: "司書像の警鐘", pitfall: "水没した書架穴" }
    }
  }),
  biome({
    id: "dragon_forge", name: "竜火の鍛造殿", cssClass: "floor-theme-b5",
    bossName: "レッドドラゴン",
    enemyPool: ["ドラゴンワーム", "ワイバーン", "レッドドラゴン", "反逆の鎧", "黒曜の魔導士", "竜血の再生者", "結界の守護者", "双頭の番犬", "盾持ちデーモン", "灰燼の術士"],
    gimmicks: { trapSet: ["damage", "alarm"], oneWayBonus: 2, trapBonus: 2 },
    theme: {
      entryText: { first: "赤熱した鍛造炉が脈打ち、竜火が石床の溝を走る。", revisit: "竜火の鍛造殿へ戻った。金床の残響が低く続く。" },
      auraLexicon: { spring: "冷却槽から水音が聞こえる…", tablet: "鍛造印から灼ける魔力を感じる…", merchant: "炉の陰から鎖の擦れる音がする…", stairs: "下層炉から熱風が流れる…", chest: "灰の山に金属の光が揺らぐ…", boss: "鍛造殿の奥から竜の咆哮が響く…" },
      eventSkins: { spring: "冷却の泉", tablet: "竜火の鍛造印", merchant: "炉守りの商人", camp: null },
      trapSkins: { damage: "噴き出す竜火", mpDrain: "魔力を喰う炉", alarm: "鍛造殿の警鐘", pitfall: "溶鉱炉の亀裂" }
    }
  }),
  biome({
    id: "abyssal_throne", name: "深淵の玉座", cssClass: "floor-theme-b6",
    bossName: "いにしえの竜",
    enemyPool: ["マスターデーモン", "プリーストデーモン", "命喰いの影", "深淵の分裂体", "破滅の導師", "盾持ちデーモン", "結界の守護者", "黒曜の魔導士", "灰燼の術士"],
    gimmicks: { trapSet: ["mpDrain", "pitfall", "alarm"], oneWayBonus: 2, trapBonus: 3 },
    theme: {
      entryText: { first: "光の届かない玉座で、深淵の脈動が床を震わせる。", revisit: "深淵の玉座へ戻った。見えない視線が一歩ごとに追う。" },
      auraLexicon: { spring: "闇の底から水音が聞こえる…", tablet: "王の碑文から濃い魔力を感じる…", merchant: "玉座の陰から衣擦れが聞こえる…", stairs: "底なしの階段から冷気が流れる…", chest: "幻影の陰に財宝の気配が揺らぐ…", boss: "玉座から圧倒的な魔力が押し寄せる…" },
      eventSkins: { spring: "深淵の雫", tablet: "王座の碑文", merchant: "玉座渡りの商人", camp: null },
      trapSkins: { damage: "深淵の魔眼", mpDrain: "王印の徴収", alarm: "玉座の警鐘", pitfall: "幻影の床" }
    }
  })
]);

export function getBiomeIndexForFloor(floor) {
  const depth = Math.max(1, Math.floor(Number(floor) || 1));
  return Math.floor((depth - 1) / 5) % BIOMES.length;
}

export function getBiomeForFloor(floor) {
  return BIOMES[getBiomeIndexForFloor(floor)];
}

export function getBiomeCycle(floor) {
  const depth = Math.max(1, Math.floor(Number(floor) || 1));
  return Math.floor((depth - 1) / (BIOMES.length * 5));
}
