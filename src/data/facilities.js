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
// uses (turns and noise, HP, materials, or a fight).

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
        description: "開始キットに「坑夫キット」が加わる。メイスとレザーアーマーで、罠外しキット2個と探知石を毎回持って始まる。盾はない。",
        cost: { "獣の牙": 6, "鉄片": 4 },
        grants: { startingKit: "miner" }
      }),
      // Dungeon rebuilds (#2010): they change the room the foreman was
      // trapped in, so the next run meets what was bought.
      node({
        id: "miner_outpost",
        name: "坑夫の詰所",
        description: "崩れた坑道の3階目の特別部屋が「坑夫の詰所」になる。潜行ごとに1回、傷薬・解毒薬・罠外しキットから1つを受け取れる。",
        cost: { "硬い皮": 6, "獣の牙": 4 },
        requiresFeat: "depth_5",
        grants: { room: "miner_outpost" }
      }),
      node({
        id: "miner_blast",
        name: "発破",
        description: "坑夫の詰所で、補給の代わりに発破を頼める。その階の瓦礫がすべて取り除かれ、下り階段の位置が地図に出る。大きな物音が立つ。",
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
        description: "罠外しキット2個を頼んでおく。次に生還した時に仕上がり、倉庫に入る。出発の時に作る半分の素材で済む。",
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
      // The seal takes blood, like the altar's own blessing.
      rescue: { kind: "blood", hpRate: 0.25 }
    },
    nodes: [
      node({
        id: "chapel_kit",
        name: "巡礼キット",
        description: "開始キットに「巡礼キット」が加わる。剣と魔法盾とローブで、祝福の聖水を1個、毎回持って始まる。",
        cost: { "骨片": 6, "霊粉": 4 },
        grants: { startingKit: "pilgrim" }
      }),
      node({
        id: "chapel_offering",
        name: "献灯台",
        description: "地下墓地の3階目の祭壇が「礼拝堂の祭壇」になる。浄め・血の祝福に加えて「献灯」を選べる。手持ちの素材から1種類を最大6個、街へ送る。送った素材は、その後に死んでも街に届く。",
        cost: { "霊粉": 6, "呪布": 4 },
        requiresFeat: "depth_10",
        grants: { room: "chapel_altar" }
      }),
      node({
        id: "chapel_grave",
        name: "墓標",
        description: "死んだ時、失った素材の半分が礼拝堂の墓標に残る。礼拝堂の祭壇で「墓標に祈る」と、手持ちの素材に加わる。取り戻すまで消えず、合計8個まで積まれる。",
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
        description: "上薬2個を頼んでおく。次に生還した時に仕上がり、倉庫に入る。出発の時に作る半分の素材で済む。",
        cost: { "黒角": 2, "骨片": 2 },
        yields: ["GREATER_HEAL", "GREATER_HEAL"]
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
