export const FLOOR_THEMES = {
  1: {
    id: "mine",
    name: "崩れた坑道",
    cssClass: "floor-theme-b1",
    entryText: {
      first: "崩れた岩肌の奥から、乾いた反響音が返ってくる。",
      revisit: "崩れた坑道へ戻った。遠くの物音が坑道を伝う。"
    },
    auraLexicon: {
      spring: "岩間から湧き水の音が聞こえる…",
      tablet: "壁の刻印から弱い魔力を感じる…",
      merchant: "置き去りの荷車のそばから衣擦れが聞こえる…",
      stairs: "下へ続く坑道から冷たい風が流れてくる…",
      chest: "崩れた岩陰に何かが隠されている気がする…",
      boss: "反響の奥から、重い足音が近づいてくる…"
    },
    eventSkins: { spring: "坑道の湧き水", tablet: "坑夫の刻印", merchant: "荷車の商人", camp: null },
    trapSkins: { damage: "落石の仕掛け", mpDrain: "魔力を奪う鉱脈", alarm: "鳴子の罠", pitfall: "崩れた床" }
  },
  2: {
    id: "catacomb",
    name: "忘れられた地下墓地",
    cssClass: "floor-theme-b2",
    entryText: {
      first: "並ぶ棺の間を、死者の吐息のような冷気が抜ける。",
      revisit: "忘れられた地下墓地へ戻った。礼拝堂跡だけが静かだ。"
    },
    auraLexicon: {
      spring: "聖水盤から水滴の音が響く…", tablet: "墓碑から弱い魔力を感じる…",
      merchant: "棺の間から静かな衣擦れが聞こえる…", stairs: "地下へ続く墓道から冷気が流れる…",
      chest: "棺の陰に何かが納められている気がする…", boss: "暗闇の奥で、乾いた骨の音が重なる…"
    },
    eventSkins: { spring: "朽ちた聖水盤", tablet: "墓碑銘", merchant: "墓守の商人", camp: "礼拝堂跡" },
    trapSkins: { damage: "墓守の火葬罠", mpDrain: "魂を吸う墓標", alarm: "死者を呼ぶ鐘", pitfall: "崩れた墓穴" }
  },
  3: {
    id: "rift_nest",
    name: "大裂溝の巣窟",
    cssClass: "floor-theme-b3",
    entryText: {
      first: "底知れぬ裂け目を、無数の糸と獣の息遣いが覆う。",
      revisit: "大裂溝の巣窟へ戻った。足元の震えが巣へ伝わる。"
    },
    auraLexicon: {
      spring: "裂け目の底から水音が上がる…", tablet: "糸に覆われた碑から魔力を感じる…",
      merchant: "巣の向こうから布の擦れる音がする…", stairs: "深い裂け目から風が吹き上がる…",
      chest: "巣糸の塊に何かが包まれている気がする…", boss: "大地を伝う振動に、魔性の脈動が混じる…"
    },
    eventSkins: { spring: "裂溝の雫", tablet: "糸封じの碑", merchant: "巣渡りの商人", camp: null },
    trapSkins: { damage: "灼けた裂け目", mpDrain: "魔力を啜る巣糸", alarm: "巣を揺らす警戒糸", pitfall: "大裂溝" }
  },
  4: {
    id: "sunken_library",
    name: "水没した魔導書庫",
    cssClass: "floor-theme-b4",
    entryText: {
      first: "水に沈む書架の文字が、侵入者の魔力に反応して淡く光る。",
      revisit: "水没した魔導書庫へ戻った。濡れた頁がひとりでにめくれる。"
    },
    auraLexicon: {
      spring: "水没した回廊から水音が響く…", tablet: "書見台から濃い魔力が漏れる…",
      merchant: "書架の向こうで濡れた外套が擦れる…", stairs: "沈んだ階段から冷たい水気が流れる…",
      chest: "朽ちた書架に封じられた品の気配がする…", boss: "書庫全体を押さえつける魔力が脈打つ…"
    },
    eventSkins: { spring: "溢れる魔導水", tablet: "朽ちた書見台", merchant: "書庫漁りの商人", camp: "読書室跡" },
    trapSkins: { damage: "禁書の火印", mpDrain: "魔力を吸う紋様", alarm: "司書像の警鐘", pitfall: "水没した書架穴" }
  },
  5: {
    id: "dragon_throne",
    name: "竜王の玉座",
    cssClass: "floor-theme-b5",
    entryText: {
      first: "大回廊の果てで玉座が燃え、無数の魔眼がこちらを向く。",
      revisit: "竜王の玉座へ戻った。見えない視線が一歩ごとに追う。"
    },
    auraLexicon: {
      spring: "熱を帯びた水の音が聞こえる…", tablet: "王の碑文から灼ける魔力を感じる…",
      merchant: "大回廊の陰から衣擦れが聞こえる…", stairs: "玉座へ続く空洞から熱風が流れる…",
      chest: "幻影の陰に財宝の気配が揺らぐ…", boss: "玉座から圧倒的な竜の魔力が押し寄せる…"
    },
    eventSkins: { spring: "竜脈の泉", tablet: "王座の碑文", merchant: "大回廊の商人", camp: null },
    trapSkins: { damage: "竜炎の魔眼", mpDrain: "王印の徴収", alarm: "警戒の魔眼", pitfall: "幻影の床" }
  }
};

export function getFloorTheme(floor) {
  return FLOOR_THEMES[floor] || null;
}

export function getVisitedFloors(stateInstance) {
  return stateInstance.dungeonMemory?.visitedFloors || [];
}

export function isFloorVisited(stateInstance, floor) {
  return getVisitedFloors(stateInstance).includes(Number(floor));
}

export function revealFloor(stateInstance, floor) {
  stateInstance.dungeonMemory ||= { traps: {}, mapFragments: {} };
  stateInstance.dungeonMemory.visitedFloors ||= [];
  const value = Number(floor);
  if (stateInstance.dungeonMemory.visitedFloors.includes(value)) return false;
  stateInstance.dungeonMemory.visitedFloors.push(value);
  stateInstance.dungeonMemory.visitedFloors.sort((a, b) => a - b);
  const theme = getFloorTheme(value);
  [...(stateInstance.contracts || []), stateInstance.activeContract]
    .filter(contract => contract?.locationFloor === value)
    .forEach(contract => {
      contract.name = contract.name.replaceAll("???", theme.name);
      contract.description = contract.description.replaceAll("???", theme.name);
    });
  return true;
}

export function getFloorDisplayName(stateInstance, floor) {
  const theme = getFloorTheme(floor);
  if (!theme) return "???";
  return isFloorVisited(stateInstance, floor) ? theme.name : "???";
}

export function getFloorLabel(stateInstance, floor) {
  return `${getFloorDisplayName(stateInstance, floor)}（地下${floor}階）`;
}
