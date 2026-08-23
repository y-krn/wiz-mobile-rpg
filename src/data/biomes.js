const biome = (definition) => Object.freeze({
  ...definition,
  enemyPool: Object.freeze(definition.enemyPool),
  gimmicks: Object.freeze(definition.gimmicks),
  terrain: Object.freeze({
    ...definition.terrain,
    roomCountRange: Object.freeze(definition.terrain.roomCountRange),
    mazeProfile: Object.freeze({
      ...definition.terrain.mazeProfile,
      straightBias: Object.freeze(definition.terrain.mazeProfile.straightBias),
      loopRate: Object.freeze(definition.terrain.mazeProfile.loopRate)
    })
  }),
  visualSignature: Object.freeze({
    ...definition.visualSignature,
    geometry: Object.freeze({ ...definition.visualSignature.geometry })
  }),
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
    terrain: {
      roomCountRange: [2, 3],
      mazeProfile: { straightBias: [0.42, 0.62], loopRate: [0.20, 0.32] }
    },
    visualSignature: {
      wallColor: "#58d6e8",
      gridColor: "rgba(88, 214, 232, 0.26)",
      background: "#07141b",
      headerBackground: "#0d2028",
      bannerBackground: "#0a1a22",
      glow: "0 0 14px rgba(88, 214, 232, 0.30)",
      aura: "radial-gradient(circle at 50% 45%, rgba(88, 214, 232, 0.12) 0%, rgba(0, 8, 12, 0.66) 100%)",
      auraOpacity: 0.62,
      geometry: { corridorWidth: 0.82, ceilingHeight: 0.82, wallLean: 0.04, ceilingStyle: "flat" },
      environment: { overlay: "rgba(10, 35, 44, 0.04)", animated: false, animatedCyclePosition: 4 }
    },
    bossName: "デーモンガード", eliteName: "フラック",
    enemyPool: ["かみつき蟲", "コボルトの斥候", "マッドスライム", "フラッシュバット", "分裂スライム", "錆びた盾兵", "ゴブリンの呪術師", "群れネズミ", "火薬コウモリ", "まどろみ胞子", "泥の呪い子"],
    gimmicks: { trapSet: ["damage", "alarm"], oneWayBonus: 0, trapBonus: 0 },
    theme: {
      entryText: { first: "崩れた岩肌の奥から、乾いた反響音が返ってくる。", revisit: "崩れた坑道へ戻った。遠くの物音が坑道を伝う。" },
      auraLexicon: { spring: "岩間から湧き水の音が聞こえる…", tablet: "壁の刻印から弱い魔力を感じる…", merchant: "置き去りの荷車のそばから衣擦れが聞こえる…", stairs: "下へ続く坑道から冷たい風が流れてくる…", chest: "崩れた岩陰に何かが隠されている気がする…", boss: "反響の奥から、重い足音が近づいてくる…" },
      eventSkins: { spring: "坑道の湧き水", tablet: "坑夫の刻印", merchant: "荷車の商人", camp: "坑夫宿舎跡" },
      trapSkins: { damage: "落石の仕掛け", mpDrain: "魔力を奪う鉱脈", alarm: "鳴子の罠", pitfall: "崩れた床" }
    }
  }),
  biome({
    id: "forgotten_catacomb", name: "忘れられた地下墓地", cssClass: "floor-theme-b2",
    terrain: {
      roomCountRange: [3, 3],
      mazeProfile: { straightBias: [0.30, 0.48], loopRate: [0.12, 0.24] }
    },
    visualSignature: {
      wallColor: "#d5b56f",
      gridColor: "rgba(213, 181, 111, 0.24)",
      background: "#17120a",
      headerBackground: "#282012",
      bannerBackground: "#21190d",
      glow: "0 0 14px rgba(213, 181, 111, 0.28)",
      aura: "radial-gradient(circle at 55% 42%, rgba(213, 181, 111, 0.11) 0%, rgba(32, 20, 5, 0.72) 70%, rgba(0, 0, 0, 0.86) 100%)",
      auraOpacity: 0.68,
      geometry: { corridorWidth: 1.00, ceilingHeight: 1.18, wallLean: 0.00, ceilingStyle: "arch" },
      environment: { overlay: "rgba(58, 38, 13, 0.14)", animated: false }
    },
    bossName: "ストーンガード", eliteName: "墓守の巨躯",
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
    terrain: {
      roomCountRange: [3, 3],
      mazeProfile: { straightBias: [0.16, 0.34], loopRate: [0.10, 0.20] }
    },
    visualSignature: {
      wallColor: "#bd78f2",
      gridColor: "rgba(189, 120, 242, 0.24)",
      background: "#160c21",
      headerBackground: "#28143a",
      bannerBackground: "#21102f",
      glow: "0 0 14px rgba(189, 120, 242, 0.30)",
      aura: "radial-gradient(circle at 48% 42%, rgba(189, 120, 242, 0.12) 0%, rgba(45, 8, 55, 0.70) 70%, rgba(0, 0, 0, 0.90) 100%)",
      auraOpacity: 0.72,
      geometry: { corridorWidth: 0.92, ceilingHeight: 1.10, wallLean: -0.08, ceilingStyle: "flat" },
      environment: { overlay: "rgba(107, 27, 116, 0.08)", animated: false }
    },
    bossName: "ポイズンジャイアント", eliteName: "這い寄る影",
    enemyPool: ["スピリット", "はぐれ魔術師", "呪文喰い", "オークの戦士", "カースドハンド", "アイアンゴーレム", "霧の亡霊", "骨の鼓手", "弱体の魔女", "魔封じの目玉", "解呪の司祭"],
    gimmicks: { trapSet: ["damage", "alarm"], oneWayBonus: 1, trapBonus: 1 },
    theme: {
      entryText: { first: "底知れぬ裂け目を、無数の糸と獣の息遣いが覆う。", revisit: "大裂溝の巣窟へ戻った。足元の震えが巣へ伝わる。" },
      auraLexicon: { spring: "裂け目の底から水音が上がる…", tablet: "糸に覆われた碑から魔力を感じる…", merchant: "巣の向こうから布の擦れる音がする…", stairs: "深い裂け目から風が吹き上がる…", chest: "巣糸の塊に何かが包まれている気がする…", boss: "大地を伝う振動に、魔性の脈動が混じる…" },
      eventSkins: { spring: "裂溝の雫", tablet: "糸封じの碑", merchant: "巣渡りの商人", camp: "糸紡ぎ場跡" },
      trapSkins: { damage: "灼けた裂け目", mpDrain: "魔力を啜る巣糸", alarm: "巣を揺らす警戒糸", pitfall: "大裂溝" }
    }
  }),
  biome({
    id: "sunken_library", name: "水没した魔導書庫", cssClass: "floor-theme-b4",
    terrain: {
      roomCountRange: [3, 4],
      mazeProfile: { straightBias: [0.24, 0.44], loopRate: [0.22, 0.34] }
    },
    visualSignature: {
      wallColor: "#54c8c3",
      gridColor: "rgba(84, 200, 195, 0.25)",
      background: "#07191c",
      headerBackground: "#0e2b30",
      bannerBackground: "#0b2226",
      glow: "0 0 14px rgba(84, 200, 195, 0.30)",
      aura: "radial-gradient(circle at 52% 45%, rgba(84, 200, 195, 0.12) 0%, rgba(3, 38, 42, 0.74) 70%, rgba(0, 0, 0, 0.91) 100%)",
      auraOpacity: 0.76,
      geometry: { corridorWidth: 1.18, ceilingHeight: 1.05, wallLean: 0.00, ceilingStyle: "flat" },
      environment: { overlay: "rgba(7, 62, 68, 0.11)", animated: false }
    },
    bossName: "マスターデーモン", eliteName: "禁書の番人",
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
    terrain: {
      roomCountRange: [4, 5],
      mazeProfile: { straightBias: [0.10, 0.30], loopRate: [0.10, 0.20] }
    },
    visualSignature: {
      wallColor: "#f08a45",
      gridColor: "rgba(240, 138, 69, 0.25)",
      background: "#211006",
      headerBackground: "#36180b",
      bannerBackground: "#2b1308",
      glow: "0 0 14px rgba(240, 138, 69, 0.32)",
      aura: "radial-gradient(circle at 50% 45%, rgba(240, 138, 69, 0.13) 0%, rgba(64, 12, 4, 0.78) 70%, rgba(0, 0, 0, 0.93) 100%)",
      auraOpacity: 0.80,
      geometry: { corridorWidth: 1.16, ceilingHeight: 1.24, wallLean: 0.03, ceilingStyle: "flat" },
      environment: { overlay: "rgba(106, 29, 8, 0.12)", animated: true }
    },
    bossName: "レッドドラゴン", eliteName: "灼熱の徘徊者",
    enemyPool: ["ドラゴンワーム", "ワイバーン", "黒曜の魔導士", "結界の守護者", "盾持ちデーモン", "灰燼の術士", "ストーンガード", "鋼殻ビートル", "双頭の番犬"],
    gimmicks: { trapSet: ["damage", "alarm"], oneWayBonus: 2, trapBonus: 2 },
    theme: {
      entryText: { first: "赤熱した鍛造炉が脈打ち、竜火が石床の溝を走る。", revisit: "竜火の鍛造殿へ戻った。金床の残響が低く続く。" },
      auraLexicon: { spring: "冷却槽から水音が聞こえる…", tablet: "鍛造印から灼ける魔力を感じる…", merchant: "炉の陰から鎖の擦れる音がする…", stairs: "下層炉から熱風が流れる…", chest: "灰の山に金属の光が揺らぐ…", boss: "鍛造殿の奥から竜の咆哮が響く…" },
      eventSkins: { spring: "冷却の泉", tablet: "竜火の鍛造印", merchant: "炉守りの商人", camp: "鍛冶場跡" },
      trapSkins: { damage: "噴き出す竜火", mpDrain: "魔力を喰う炉", alarm: "鍛造殿の警鐘", pitfall: "溶鉱炉の亀裂" }
    }
  }),
  biome({
    id: "abyssal_throne", name: "深淵の玉座", cssClass: "floor-theme-b6",
    terrain: {
      roomCountRange: [4, 5],
      mazeProfile: { straightBias: [0.06, 0.22], loopRate: [0.08, 0.16] }
    },
    visualSignature: {
      wallColor: "#d45de6",
      gridColor: "rgba(212, 93, 230, 0.24)",
      background: "#18091f",
      headerBackground: "#321244",
      bannerBackground: "#270d35",
      glow: "0 0 14px rgba(212, 93, 230, 0.34)",
      aura: "radial-gradient(circle at 48% 42%, rgba(212, 93, 230, 0.14) 0%, rgba(45, 3, 55, 0.82) 70%, rgba(0, 0, 0, 0.95) 100%)",
      auraOpacity: 0.84,
      geometry: { corridorWidth: 0.96, ceilingHeight: 1.20, wallLean: -0.12, ceilingStyle: "arch" },
      environment: { overlay: "rgba(46, 8, 65, 0.14)", animated: true }
    },
    bossName: "いにしえの竜", eliteName: "深淵の徘徊者",
    enemyPool: ["マスターデーモン", "プリーストデーモン", "命喰いの影", "深淵の分裂体", "破滅の導師", "盾持ちデーモン", "結界の守護者", "反逆の鎧", "竜血の再生者"],
    gimmicks: { trapSet: ["mpDrain", "alarm"], oneWayBonus: 2, trapBonus: 3 },
    theme: {
      entryText: { first: "光の届かない玉座で、深淵の脈動が床を震わせる。", revisit: "深淵の玉座へ戻った。見えない視線が一歩ごとに追う。" },
      auraLexicon: { spring: "闇の底から水音が聞こえる…", tablet: "王の碑文から濃い魔力を感じる…", merchant: "玉座の陰から衣擦れが聞こえる…", stairs: "底なしの階段から冷気が流れる…", chest: "幻影の陰に財宝の気配が揺らぐ…", boss: "玉座から圧倒的な魔力が押し寄せる…" },
      eventSkins: { spring: "深淵の雫", tablet: "王座の碑文", merchant: "玉座渡りの商人", camp: "王座の間跡" },
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

export function getDepthCorruption(floor) {
  const depth = Math.max(1, Math.floor(Number(floor) || 1));
  const biomeCycle = getBiomeCycle(depth);
  const floorInCycle = (depth - 1) % (BIOMES.length * 5);
  return biomeCycle + floorInCycle / (BIOMES.length * 5);
}

export function getBiomeTerrainForFloor(floor) {
  const biome = getBiomeForFloor(floor);
  const biomeCycle = getBiomeCycle(floor);
  const cycleCorruption = biomeCycle * 0.04;
  return {
    roomCountRange: biome.terrain.roomCountRange,
    mazeProfile: {
      straightBias: biome.terrain.mazeProfile.straightBias.map(value => Math.max(0, value - cycleCorruption)),
      loopRate: biome.terrain.mazeProfile.loopRate.map(value => Math.max(0, value - cycleCorruption * 0.5))
    }
  };
}
