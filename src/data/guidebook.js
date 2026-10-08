// The dungeon guidebook (#2013). Each page states a rule that is really in
// force but that the screens do not explain. Pages are decoded in this order
// with fragments won from strong enemies and carried home.
//
// A page must stay true. Where a page quotes a number or an ordering, the
// text is built from the rule's own constant, and
// `tests/node/unit/test_guidebook.js` checks the claims that are prose.
// Pages never name a best build and never state an exact probability.

import { ELITE_MIN_FLOOR } from "../systems/roaming_elites.js";
import { SPECIAL_ROOM_MIN_DETOUR } from "../map_special_rooms.js";
import { BANKING_RATES } from "../rules/material_rules.js";

const page = definition => Object.freeze({ ...definition, lines: Object.freeze([...definition.lines]) });

export const GUIDEBOOK_PAGES = Object.freeze([
  page({
    id: "hunter_sound",
    title: "音で狩るもの",
    cost: 2,
    lines: [
      "徘徊する強敵には、音を頼りに狩るものがいる。",
      "すぐ隣に来るまでこちらに気づかない。代わりに、鉱脈や瓦礫を掘る音、発破の音がすると、その場所へ向かってくる。",
      "音はしばらくすると消える。掘った後は、その場を離れるほうがよい。"
    ]
  }),
  page({
    id: "hunter_vibration",
    title: "震えで狩るもの",
    cost: 2,
    lines: [
      "床の振動を捉える強敵は、離れていてもこちらに気づく。",
      "ただし気づくのは、こちらが動いた時だけ。立ち止まっている相手は見失う。"
    ]
  }),
  page({
    id: "hunter_afterimage",
    title: "見られると動けないもの",
    cost: 3,
    lines: [
      "正面から見られている間は動けない強敵がいる。",
      "まっすぐな通路の先に姿が見えているうちは寄ってこない。目を離すと、倍の速さで迫ってくる。"
    ]
  }),
  page({
    id: "elite_arrival",
    title: "強敵の現れ方",
    cost: 3,
    lines: [
      `徘徊する強敵が現れるのは、どの迷宮でも B${ELITE_MIN_FLOOR}F から。`,
      "階に入った時にいなくても、その階で多くのことをするほど、後から現れやすくなる。",
      "いちばん呼びやすいのは宝箱を開けること。寄り道の部屋、戦い、階段の発見、新しい部屋への到達も数えられる。"
    ]
  }),
  page({
    id: "special_room_place",
    title: "特別な部屋の場所",
    cost: 3,
    lines: [
      "どの階にも、特別な部屋が1つある。",
      `下り階段へ向かう道筋から${SPECIAL_ROOM_MIN_DETOUR}歩以上外れた場所にあり、行き止まりに置かれやすい。`
    ]
  }),
  page({
    id: "load_and_turn",
    title: "重さと先手",
    cost: 4,
    lines: [
      "軽い装備は行動の順番が早まり、重い装備は遅れる。",
      "早まる幅と遅れる幅は同じ。標準の装備は、どちらにも動かない。"
    ]
  }),
  page({
    id: "what_remains",
    title: "死んで残るもの",
    cost: 4,
    lines: [
      `死亡・断念では、集めた素材の${Math.round(BANKING_RATES.death * 100)}%が街に残る。`,
      "偉業の報酬は、結果に関係なく全額が入る。",
      "手引き書の断片と、連れている同行者は、生還しなければ残らない。"
    ]
  }),
  page({
    id: "beyond_guardian",
    title: "守護者の先",
    cost: 5,
    lines: [
      "階層守護者を倒した次の階には、野営地がある。",
      "節目の階の商人は、素材と引き換えに装備の呪いを解いてくれる。"
    ]
  })
]);

/** Fragments won for each strong enemy and each floor guardian defeated. */
export const GUIDE_FRAGMENTS_PER_ELITE = 1;
export const GUIDE_FRAGMENTS_PER_GUARDIAN = 2;
