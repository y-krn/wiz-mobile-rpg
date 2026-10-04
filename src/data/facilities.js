// Town facilities (#2009). A facility opens when the person who runs it is
// brought back from the dungeon, which is recorded as a feat. Its nodes are
// bought with materials, like the Workshop's, and only ever widen what a run
// can start with or meet: no permanent stat, no targeted drop.
//
// A node may also require a feat (`requiresFeat`) and an earlier node
// (`requiresNode`). `grants.startingKit` opens a starting kit; `grants.room`
// and `grants.roomOption` rebuild a room the dungeon already has.

const node = definition => Object.freeze({
  ...definition,
  cost: Object.freeze({ ...definition.cost }),
  grants: Object.freeze({ ...definition.grants })
});

export const FACILITIES = Object.freeze([
  Object.freeze({
    id: "miner_guild",
    name: "坑夫組合",
    keeper: "鉱夫頭",
    featId: "foreman_rescue",
    lockedHint: "崩れた坑道の3階目で、誰かが助けを待っている。",
    openDescription: "鉱夫頭が戻り、組合に灯がともった。",
    nodes: Object.freeze([
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
    ])
  })
]);

export const FACILITY_BY_ID = new Map(FACILITIES.map(facility => [facility.id, facility]));

export const FACILITY_NODE_BY_ID = new Map(
  FACILITIES.flatMap(facility => facility.nodes.map(definition => [definition.id, definition]))
);

/** The person led out of the dungeon to open each facility. */
export const COMPANIONS = Object.freeze({
  foreman: Object.freeze({ id: "foreman", name: "鉱夫頭", facilityId: "miner_guild" })
});
