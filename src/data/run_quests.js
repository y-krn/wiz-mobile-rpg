export const RUN_QUEST_TEMPLATES = Object.freeze([
  Object.freeze({
    id: "reach_milestone",
    type: "depth",
    name: "次の節目へ",
    description: "次の5階ごとの節目まで到達する。",
    target: Object.freeze({ kind: "next_milestone" }),
    reward: Object.freeze({ materials: Object.freeze({ "鉄片": 3 }) })
  }),
  Object.freeze({
    id: "deep_push",
    type: "depth",
    name: "深層へ踏み込む",
    description: "開始地点から6階先まで到達する。",
    target: Object.freeze({ kind: "floor_offset", value: 6 }),
    reward: Object.freeze({ materials: Object.freeze({ "魔石片": 3 }) })
  }),
  Object.freeze({
    id: "disruptor_hunt",
    type: "role_kill",
    name: "妨害役を断つ",
    description: "disruptorを3体倒す。",
    role: "disruptor",
    target: Object.freeze({ kind: "count", value: 3 }),
    reward: Object.freeze({ materials: Object.freeze({ "毒腺": 3 }) })
  }),
  Object.freeze({
    id: "amplifier_hunt",
    type: "role_kill",
    name: "増幅役を崩す",
    description: "amplifierを2体倒す。",
    role: "amplifier",
    target: Object.freeze({ kind: "count", value: 2 }),
    reward: Object.freeze({ materials: Object.freeze({ "霊粉": 3 }) })
  }),
  Object.freeze({
    id: "elite_hunt",
    type: "elite_kill",
    name: "強敵へ挑む",
    description: "精鋭または徘徊強敵を2体倒す。",
    target: Object.freeze({ kind: "count", value: 2 }),
    reward: Object.freeze({ materials: Object.freeze({ "黒角": 2 }) })
  }),
  Object.freeze({
    id: "trapless_push",
    type: "trapless_depth",
    name: "傷なき踏破",
    description: "罠を一度も受けず、開始地点から4階先へ到達する。",
    target: Object.freeze({ kind: "floor_offset", value: 4 }),
    reward: Object.freeze({ materials: Object.freeze({ "呪布": 3 }) })
  })
]);
