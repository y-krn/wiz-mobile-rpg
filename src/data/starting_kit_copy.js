// Player-facing copy for the starting kits (#1831).
//
// A kit is an initial condition, not a class. This copy only explains how the
// kit's starting equipment tends to play; it must stay true to that equipment
// and never promise a number. Stats, equipment names, and the weapon technique
// are derived from the real starting character on the departure screen.

const kitCopy = copy => Object.freeze({
  ...copy,
  strengths: Object.freeze([...copy.strengths]),
  weaknesses: Object.freeze([...copy.weaknesses])
});

export const STARTING_KIT_COPY = Object.freeze({
  vanguard: kitCopy({
    role: "前衛",
    playstyle: "鎧と盾で受け止め、重い一撃で押し切る。",
    strengths: ["防具が厚く、打ち合いに強い", "武器の一撃が重い"],
    weaknesses: ["速さの利点はない", "呪文は使えない"]
  }),
  scout: kitCopy({
    role: "速攻",
    playstyle: "先に動いて手数で削り、打たれる前に倒す。",
    strengths: ["行動が速く、先手を取りやすい", "攻撃が当たりやすい"],
    weaknesses: ["一撃が軽い", "防具が薄い"]
  }),
  devotion: kitCopy({
    role: "崩し",
    playstyle: "硬い相手の守りを崩して、殴り倒す。",
    strengths: ["防御の高い敵に強い", "一撃はそこそこ重い"],
    weaknesses: ["防具が薄い", "攻撃がやや外れやすい"]
  }),
  arcana: kitCopy({
    role: "術師",
    playstyle: "ルーンの呪文で戦う。MPの使いどころが勝負。",
    strengths: ["最初から呪文を使える", "MPが多い"],
    weaknesses: ["最も打たれ弱い", "杖で殴っても弱い"]
  }),
  miner: kitCopy({
    role: "探索",
    playstyle: "罠外しと探知の道具を持って潜る。盾はなく、道具で切り抜ける。",
    strengths: ["罠外しキット2個と探知石を毎回持って始まる", "硬い相手の守りを崩せる"],
    weaknesses: ["盾がない", "呪文は使えない"]
  }),
  pilgrim: kitCopy({
    role: "対呪文",
    playstyle: "魔法盾で呪文を受け流し、剣で斬る。聖水が1度の立て直しになる。",
    strengths: ["呪文を使う敵に強い", "祝福の聖水を毎回持って始まる"],
    weaknesses: ["鎧が薄く、殴り合いに弱い", "呪文は使えない"]
  }),
  stalker: kitCopy({
    role: "回避",
    playstyle: "香で気配を消し、鳴らし玉で魔物を逸らして、戦わずに階を抜ける。",
    strengths: ["静寂の香2個と鳴らし玉を毎回持って始まる", "行動が速く、先手を取りやすい"],
    weaknesses: ["盾がなく、打たれ弱い", "一撃が軽い"]
  }),
  scribe: kitCopy({
    role: "術師",
    playstyle: "両手の杖で呪文を撃つ。魔力草でMPを継ぎ足しながら戦う。",
    strengths: ["最初から呪文を使える", "魔力草2個を毎回持って始まる"],
    weaknesses: ["盾を持てない", "杖で殴っても弱い"]
  }),
  ironclad: kitCopy({
    role: "重装",
    playstyle: "厚い鎧で打撃を受け止め、短剣で少しずつ削る。長い戦いになる。",
    strengths: ["鎧が最も厚い", "守りの薬を毎回持って始まる"],
    weaknesses: ["一撃が軽い", "鎧が重く、動きが遅い", "盾がない"]
  }),
  ceremonial: kitCopy({
    role: "盾",
    playstyle: "大盾で守りを固めながら、槌で硬い相手を崩す。",
    strengths: ["大盾で打撃をよく防ぐ", "防御の高い敵に強い"],
    weaknesses: ["鎧は薄い", "大盾が重く、動きが遅い", "呪文は使えない"]
  })
});

const FALLBACK_COPY = kitCopy({ role: "", playstyle: "", strengths: [], weaknesses: [] });

export function getStartingKitCopy(startingKitId) {
  return STARTING_KIT_COPY[startingKitId] || FALLBACK_COPY;
}
