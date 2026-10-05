// Town facilities (#2009). A facility opens when the person who runs it is
// brought back from the dungeon, which is recorded as a feat. Its nodes are
// bought with materials, like the Workshop's, and only ever widen what a run
// can start with or meet: no permanent stat, no targeted drop.
//
// A node may also require a feat (`requiresFeat`) and an earlier node
// (`requiresNode`). `grants.startingKit` opens a starting kit; `grants.room`
// and `grants.roomOption` rebuild a room the dungeon already has.
//
// Every biome band can hold one facility (#2018). `site` names the band and
// the room its keeper waits in: on the band's third floor that room stands in
// for the biome's special room until the keeper has been led home. `rescue`
// is what freeing the keeper costs, in the same terms the biome's own room
// uses (turns and noise, HP, materials, or a fight): "dig" and "drain" take
// turns (digging is noisy), "blood" takes a share of max HP, "fuel" takes
// carried materials, "fight" is the brood chamber's fight.

const node = definition => Object.freeze({
  ...definition,
  cost: Object.freeze({ ...definition.cost }),
  grants: Object.freeze({ ...definition.grants })
});

// An order (仕込み, #2014): materials are paid when it is placed, and the
// goods are finished into storage by the next safe return. It is cheaper
// than departure craft because it only pays off for a run that walks out.
const order = definition => Object.freeze({
  ...definition,
  cost: Object.freeze({ ...definition.cost }),
  yields: Object.freeze([...definition.yields])
});

const facility = definition => Object.freeze({
  ...definition,
  companion: Object.freeze({ ...definition.companion }),
  site: Object.freeze({ ...definition.site, rescue: Object.freeze({ ...definition.site.rescue }) }),
  nodes: Object.freeze(definition.nodes),
  orders: Object.freeze(definition.orders || [])
});

export const FACILITIES = Object.freeze([
  facility({
    id: "miner_guild",
    name: "坑夫組合",
    keeper: "鉱夫頭",
    featId: "foreman_rescue",
    lockedHint: "崩れた坑道の3階目で、誰かが助けを待っている。",
    openDescription: "鉱夫頭が戻り、組合に灯がともった。",
    companion: { id: "foreman", name: "鉱夫頭", counterKey: "foremanRescued" },
    site: {
      biomeId: "collapsed_mine",
      keeperRoom: "trapped_foreman",
      omen: "この階のどこかで、岩を叩く音と人の声がする。",
      // Digging him out costs the same turns and noise as a vein.
      rescue: { kind: "dig", turns: 3 }
    },
    nodes: [
      node({
        id: "miner_kit",
        name: "坑夫キット",
        description: "「坑夫キット」で出発できるようになる。メイスとレザーアーマー。罠外しキット2個と探知石を毎回持って出る。盾はない。",
        cost: { "獣の牙": 6, "鉄片": 4 },
        grants: { startingKit: "miner" }
      }),
      // Dungeon rebuilds (#2010): they change the room the foreman was
      // trapped in, so the next run meets what was bought.
      node({
        id: "miner_outpost",
        name: "坑夫の詰所",
        description: "崩れた坑道の3階目に、坑夫の詰所ができる。立ち寄ると、傷薬・解毒薬・罠外しキットのどれか1つを分けてもらえる。",
        cost: { "硬い皮": 6, "獣の牙": 4 },
        requiresFeat: "depth_5",
        grants: { room: "miner_outpost" }
      }),
      node({
        id: "miner_blast",
        name: "発破",
        description: "詰所で、補給の代わりに発破を頼めるようになる。その階の瓦礫が吹き飛び、下り階段の場所が分かる。大きな音が響く。",
        cost: { "鉄片": 6, "硬い皮": 4 },
        requiresFeat: "guardian_5",
        requiresNode: "miner_outpost",
        grants: { roomOption: "blast" }
      })
    ],
    orders: [
      order({
        id: "miner_trap_kits",
        name: "罠外しキットの仕込み",
        description: "頼んでおくと、次に生還したときに倉庫へ届く。出発前に作るより、素材は半分で済む。",
        cost: { "鉄片": 2, "硬い皮": 1 },
        yields: ["TRAP_KIT", "TRAP_KIT"]
      })
    ]
  }),
  // The chapel (#2018): the priest sealed in the catacomb's altar on B8F.
  facility({
    id: "chapel",
    name: "礼拝堂",
    keeper: "司祭",
    featId: "priest_rescue",
    lockedHint: "忘れられた地下墓地の3階目で、祈りの声が封じられている。",
    openDescription: "司祭が戻り、礼拝堂の鐘が鳴った。",
    companion: { id: "priest", name: "司祭", counterKey: "priestRescued" },
    site: {
      biomeId: "forgotten_catacomb",
      keeperRoom: "sealed_priest",
      omen: "この階のどこかで、かすかな祈りの声がする。",
      // The seal takes blood, like the altar's own blessing. `{cost}` is the
      // HP it takes right now.
      rescue: {
        kind: "blood",
        hpRate: 0.25,
        prompt: "司祭を閉じ込めた封印は血でしか解けない。",
        action: "血を捧げて封印を解く（HP{cost}）",
        done: "封印に血を捧げた（HP-{cost}）。司祭が祭壇の奥から歩み出た。「助かりました。街までお連れください」",
        shortage: "いまのHPでは、封印に捧げる血が足りない。"
      }
    },
    nodes: [
      node({
        id: "chapel_kit",
        name: "巡礼キット",
        description: "「巡礼キット」で出発できるようになる。剣と魔法盾とローブ。祝福の聖水を1個、毎回持って出る。",
        cost: { "骨片": 6, "霊粉": 4 },
        grants: { startingKit: "pilgrim" }
      }),
      node({
        id: "chapel_offering",
        name: "献灯台",
        description: "地下墓地の3階目の祭壇で、献灯ができるようになる。手持ちの素材を1種類、6個まで街へ送れる。送った素材は、そのあと死んでも失わない。",
        cost: { "霊粉": 6, "呪布": 4 },
        requiresFeat: "depth_10",
        grants: { room: "chapel_altar" }
      }),
      node({
        id: "chapel_grave",
        name: "墓標",
        description: "死んだとき、失った素材の半分が墓標に残る。次に地下墓地の祭壇で祈れば、取り戻せる。墓標に残るのは8個まで。",
        cost: { "骨片": 6, "魔石片": 4 },
        requiresFeat: "guardian_10",
        requiresNode: "chapel_offering",
        grants: { roomOption: "grave" }
      })
    ],
    orders: [
      order({
        id: "chapel_greater_heal",
        name: "上薬の仕込み",
        description: "頼んでおくと、次に生還したときに倉庫へ届く。出発前に作るより、素材は半分で済む。",
        cost: { "黒角": 2, "骨片": 2 },
        yields: ["GREATER_HEAL", "GREATER_HEAL"]
      })
    ]
  }),
  // The weaving house (#2019): the weaver cocooned in the nest's brood
  // chamber on B13F. Cutting her out wakes the brood keeper.
  facility({
    id: "weaving_house",
    name: "織り場",
    keeper: "織り手",
    featId: "weaver_rescue",
    lockedHint: "大裂溝の巣窟の3階目で、繭の中から声がする。",
    openDescription: "織り手が戻り、織り場の機が動き出した。",
    companion: { id: "weaver", name: "織り手", counterKey: "weaverRescued" },
    site: {
      biomeId: "rift_nest",
      keeperRoom: "cocooned_weaver",
      omen: "この階のどこかで、糸の軋む音と、くぐもった声がする。",
      // The cocoon hangs in the brood chamber: freeing her is that room's fight.
      rescue: { kind: "fight" }
    },
    nodes: [
      node({
        id: "weaver_kit",
        name: "忍び足キット",
        description: "「忍び足キット」で出発できるようになる。ダガーとローブ。静寂の香2個と鳴らし玉1個を毎回持って出る。盾はない。",
        cost: { "毒腺": 6, "呪布": 4 },
        grants: { startingKit: "stalker" }
      }),
      node({
        id: "weaver_hammock",
        name: "吊り寝床",
        description: "大裂溝の巣窟の3階目の卵室に、吊り寝床ができる。ひと休みして、最大HPの3割を取り戻せる。",
        cost: { "呪布": 6, "硬い皮": 6 },
        requiresFeat: "depth_15",
        grants: { room: "weaver_hammock" }
      }),
      node({
        id: "weaver_mending",
        name: "繕い台",
        description: "吊り寝床で、休む代わりに防具を繕ってもらえるようになる。素材2個で、3戦のあいだ防御力が上がる。",
        cost: { "呪布": 6, "鉄片": 6 },
        requiresFeat: "guardian_15",
        requiresNode: "weaver_hammock",
        grants: { roomOption: "mending" }
      })
    ],
    orders: [
      order({
        id: "weaver_silence_incense",
        name: "静寂の香の仕込み",
        description: "頼んでおくと、次に生還したときに倉庫へ届く。出発前に作るより、素材は半分で済む。",
        cost: { "霊粉": 1, "呪布": 1 },
        yields: ["SILENCE_INCENSE", "SILENCE_INCENSE"]
      })
    ]
  }),
  // The scriptorium (#2019): the scribe stranded in the flooded reading room
  // on B18F.
  facility({
    id: "scriptorium",
    name: "写本室",
    keeper: "写本師",
    featId: "scribe_rescue",
    lockedHint: "水没した魔導書庫の3階目で、誰かが水に閉じ込められている。",
    openDescription: "写本師が戻り、写本室の机に灯がともった。",
    companion: { id: "scribe", name: "写本師", counterKey: "scribeRescued" },
    site: {
      biomeId: "sunken_library",
      keeperRoom: "stranded_scribe",
      omen: "この階のどこかで、水音にまじって人の呼ぶ声がする。",
      // Draining the room is quiet work: turns, like the reading room's study.
      rescue: { kind: "drain", turns: 5 }
    },
    nodes: [
      node({
        id: "scribe_kit",
        name: "写本師キット",
        description: "「写本師キット」で出発できるようになる。両手の杖とローブ。最初から呪文を使え、魔力草2個を毎回持って出る。",
        cost: { "魔石片": 6, "霊粉": 4 },
        grants: { startingKit: "scribe" }
      }),
      node({
        id: "scribe_waymark",
        name: "道しるべ",
        description: "水没した魔導書庫の3階目の閲覧室で、見取り図に次の階の下り階段も載るようになる。",
        cost: { "魔石片": 6, "骨片": 6 },
        requiresFeat: "depth_20",
        grants: { room: "scribe_reading_room" }
      }),
      node({
        id: "scribe_copy_desk",
        name: "写本台",
        description: "閲覧室で、見取り図を読む代わりに写本を写せるようになる。手引き書の断片が1枚手に入る。",
        cost: { "魔石片": 6, "黒角": 6 },
        requiresFeat: "guardian_20",
        requiresNode: "scribe_waymark",
        grants: { roomOption: "copy" }
      })
    ],
    orders: [
      order({
        id: "scribe_mana_potion",
        name: "魔力草の仕込み",
        description: "頼んでおくと、次に生還したときに倉庫へ届く。出発前に作るより、素材は半分で済む。",
        cost: { "獣の牙": 2, "硬い皮": 2 },
        yields: ["MANA_POTION", "MANA_POTION"]
      })
    ]
  }),
  // The smithy (#2021): the smith shut in behind the dragon forge's cold
  // furnace on B23F.
  facility({
    id: "smithy",
    name: "鍛冶場",
    keeper: "鍛冶師",
    featId: "smith_rescue",
    lockedHint: "竜火の鍛造殿の3階目で、火の消えた炉の奥から鎚の音がする。",
    openDescription: "鍛冶師が戻り、鍛冶場の炉に火が入った。",
    companion: { id: "smith", name: "鍛冶師", counterKey: "smithRescued" },
    site: {
      biomeId: "dragon_forge",
      keeperRoom: "cold_forge",
      omen: "この階のどこかで、鉄の扉を内側から叩く音がする。",
      // The furnace door opens only while it burns: feed it materials, as
      // the forge is fed for a temper.
      rescue: { kind: "fuel", materials: 4 }
    },
    nodes: [
      node({
        id: "smith_kit",
        name: "重装キット",
        description: "「重装キット」で出発できるようになる。ダガーとプレートメイル。守りの薬を1個、毎回持って出る。盾はない。",
        cost: { "鉄片": 8, "黒角": 4 },
        grants: { startingKit: "ironclad" }
      }),
      node({
        id: "smith_forge",
        name: "鍛冶師の炉",
        description: "竜火の鍛造殿の3階目の炉に、鍛冶師の手が入る。武器の鍛え直しが5戦のあいだ続く（これまでは3戦）。",
        cost: { "鉄片": 8, "竜鱗": 4 },
        requiresFeat: "depth_25",
        grants: { room: "smith_forge" }
      }),
      node({
        id: "smith_reforge",
        name: "打ち直し",
        description: "炉で、鍛え直しの代わりに打ち直しを頼めるようになる。素材4個で、装備中の武器が一段強くなる（+6まで）。",
        cost: { "竜鱗": 6, "黒角": 6 },
        requiresFeat: "guardian_25",
        requiresNode: "smith_forge",
        grants: { roomOption: "reforge" }
      })
    ],
    orders: [
      order({
        id: "smith_guard_potion",
        name: "守りの薬の仕込み",
        description: "頼んでおくと、次に生還したときに倉庫へ届く。出発前に作るより、素材は半分で済む。",
        cost: { "竜鱗": 1, "鉄片": 2 },
        yields: ["GUARD_POTION", "GUARD_POTION"]
      })
    ]
  }),
  // The audience hall (#2021): the chamberlain caught inside the abyssal
  // throne's mirror on B28F.
  facility({
    id: "audience_hall",
    name: "謁見の間",
    keeper: "侍従",
    featId: "chamberlain_rescue",
    lockedHint: "深淵の玉座の3階目で、鏡の中から誰かがこちらを見ている。",
    openDescription: "侍従が戻り、謁見の間の扉が開いた。",
    companion: { id: "chamberlain", name: "侍従", counterKey: "chamberlainRescued" },
    site: {
      biomeId: "abyssal_throne",
      keeperRoom: "mirror_captive",
      omen: "この階のどこかで、鏡を内側から叩く音がする。",
      // The mirror takes life, as the mirror hall's vision does.
      rescue: {
        kind: "blood",
        hpRate: 0.3,
        prompt: "鏡に生気を与えれば、侍従は出てこられる。",
        action: "鏡に生気を与える（HP{cost}）",
        done: "鏡に生気を吸われた（HP-{cost}）。侍従が鏡の中から歩み出た。「恩に着ます。どうか街まで」",
        shortage: "いまのHPでは、鏡に与える生気が足りない。"
      }
    },
    nodes: [
      node({
        id: "hall_kit",
        name: "儀仗キット",
        description: "「儀仗キット」で出発できるようになる。メイスとラージシールドとローブ。",
        cost: { "竜鱗": 6, "黒角": 6 },
        grants: { startingKit: "ceremonial" }
      }),
      node({
        id: "hall_oath",
        name: "誓約の祭壇",
        description: "深淵の玉座の3階目の鏡の間で、誓約を立てられるようになる。HPとMPがすべて戻る。ただし、その潜行で死ぬか断念すると、手持ちの素材は1つも街に残らない。",
        cost: { "竜鱗": 8, "霊粉": 6 },
        requiresFeat: "depth_30",
        grants: { room: "oath_altar" }
      }),
      node({
        id: "hall_gallery",
        name: "鏡の回廊",
        description: "鏡の間の鏡を、HPを払わずに覗けるようになる。2つ先の階まで、下り階段の場所が分かる。",
        cost: { "竜鱗": 8, "魔石片": 6 },
        requiresFeat: "guardian_30",
        requiresNode: "hall_oath",
        grants: { roomOption: "gallery" }
      })
    ],
    orders: [
      // The wing has no typed recipe (departure craft takes any 8 materials),
      // so this order names its own half-price cost.
      order({
        id: "hall_return_wing",
        name: "帰還の翼の仕込み",
        description: "頼んでおくと、次に生還したときに倉庫へ届く。出発前に作るより、素材は半分で済む。",
        cost: { "竜鱗": 2, "黒角": 2 },
        yields: ["TOWN_PORTAL"]
      })
    ]
  })
]);

export const FACILITY_ORDER_BY_ID = new Map(
  FACILITIES.flatMap(facility => (facility.orders || []).map(definition => [definition.id, definition]))
);

export const FACILITY_BY_ID = new Map(FACILITIES.map(facility => [facility.id, facility]));

export const FACILITY_NODE_BY_ID = new Map(
  FACILITIES.flatMap(facility => facility.nodes.map(definition => [definition.id, definition]))
);

/** The people who can be led out of the dungeon, one per facility. */
export const COMPANIONS = Object.freeze(Object.fromEntries(
  FACILITIES.map(definition => [
    definition.companion.id,
    Object.freeze({ ...definition.companion, facilityId: definition.id })
  ])
));

/** The room each waiting keeper occupies, by room kind. */
export const KEEPER_ROOM_FACILITY = new Map(
  FACILITIES.map(definition => [definition.site.keeperRoom, definition])
);

// Chapel offering and grave (#2018).
/** Materials of one type an offering sends home, at most. */
export const CHAPEL_OFFERING_LIMIT = 6;
/** Share of the materials lost to a death that the grave keeps. */
export const CHAPEL_GRAVE_RATE = 0.5;
/** Materials the grave holds at most, across deaths, until they are taken back. */
export const CHAPEL_GRAVE_LIMIT = 8;
