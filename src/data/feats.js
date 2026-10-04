// Feats (偉業) are long-term goals whose condition and progress are always
// visible. Progress accumulates across runs whatever the outcome, each feat is
// achieved once, and its material reward is paid in full to the town balance.
// They replace the run-scoped quests (#2007).
//
// A feat measures one counter (`src/state/feats_state.ts`):
//   metric.kind "counter" — the counter must reach `target`
//   metric.kind "kits"    — `target` starting kits must each reach `minDepth`
// Feats that share a `chain` are offered one at a time, in the listed order.

const feat = definition => Object.freeze({
  ...definition,
  metric: Object.freeze({ ...definition.metric }),
  reward: Object.freeze({ materials: Object.freeze({ ...definition.reward.materials }) })
});

export const FEATS = Object.freeze([
  feat({
    id: "depth_5",
    chain: "depth",
    name: "坑道を抜ける",
    condition: "B5Fに到達する",
    metric: { kind: "counter", key: "bestDepth", target: 5, unit: "floor" },
    reward: { materials: { "鉄片": 4 } }
  }),
  feat({
    id: "depth_10",
    chain: "depth",
    name: "地下墓地の底へ",
    condition: "B10Fに到達する",
    metric: { kind: "counter", key: "bestDepth", target: 10, unit: "floor" },
    reward: { materials: { "骨片": 5 } }
  }),
  feat({
    id: "depth_15",
    chain: "depth",
    name: "大裂溝を渡る",
    condition: "B15Fに到達する",
    metric: { kind: "counter", key: "bestDepth", target: 15, unit: "floor" },
    reward: { materials: { "魔石片": 5 } }
  }),
  feat({
    id: "depth_20",
    chain: "depth",
    name: "沈んだ書庫を読む",
    condition: "B20Fに到達する",
    metric: { kind: "counter", key: "bestDepth", target: 20, unit: "floor" },
    reward: { materials: { "黒角": 5 } }
  }),
  feat({
    id: "depth_30",
    chain: "depth",
    name: "深淵の玉座",
    condition: "B30Fに到達する",
    metric: { kind: "counter", key: "bestDepth", target: 30, unit: "floor" },
    reward: { materials: { "竜鱗": 5 } }
  }),
  feat({
    id: "guardian_5",
    chain: "guardian",
    name: "坑道の主を倒す",
    condition: "B5Fの階層守護者を倒す",
    metric: { kind: "counter", key: "guardianDepth", target: 5, unit: "floor" },
    reward: { materials: { "鉄片": 4 } }
  }),
  feat({
    id: "guardian_10",
    chain: "guardian",
    name: "地下墓地の主を倒す",
    condition: "B10Fの階層守護者を倒す",
    metric: { kind: "counter", key: "guardianDepth", target: 10, unit: "floor" },
    reward: { materials: { "霊粉": 5 } }
  }),
  feat({
    id: "elite_5",
    chain: "elite",
    name: "強敵狩り",
    condition: "強敵（精鋭・徘徊強敵）を累計5体倒す",
    metric: { kind: "counter", key: "elitesKilled", target: 5, unit: "count" },
    reward: { materials: { "黒角": 3 } }
  }),
  feat({
    id: "disruptor_10",
    chain: "disruptor",
    name: "妨害役を断つ",
    condition: "妨害役を累計10体倒す",
    metric: { kind: "counter", key: "disruptorsKilled", target: 10, unit: "count" },
    reward: { materials: { "毒腺": 4 } }
  }),
  feat({
    id: "amplifier_6",
    chain: "amplifier",
    name: "支援役を倒す",
    condition: "支援役を累計6体倒す",
    metric: { kind: "counter", key: "amplifiersKilled", target: 6, unit: "count" },
    reward: { materials: { "霊粉": 4 } }
  }),
  feat({
    id: "chest_30",
    chain: "chest",
    name: "宝箱あさり",
    condition: "宝箱を累計30個開ける",
    metric: { kind: "counter", key: "chestsOpened", target: 30, unit: "count" },
    reward: { materials: { "魔石片": 4 } }
  }),
  feat({
    id: "return_5",
    chain: "return",
    name: "生きて帰る者",
    condition: "迷宮から累計5回帰還する",
    metric: { kind: "counter", key: "safeReturns", target: 5, unit: "count" },
    reward: { materials: { "硬い皮": 5 } }
  }),
  feat({
    id: "trapless_5",
    chain: "trapless",
    name: "傷なき踏破",
    condition: "B1Fから罠を一度も受けずにB5Fへ到達する",
    metric: { kind: "counter", key: "traplessDepth", target: 5, unit: "floor" },
    reward: { materials: { "呪布": 4 } }
  }),
  feat({
    id: "kits_4",
    chain: "kits",
    name: "四つの道",
    condition: "4種の開始キットそれぞれで、B1FからB3Fに到達する",
    metric: { kind: "kits", minDepth: 3, target: 4, unit: "kit" },
    reward: { materials: { "竜鱗": 2 } }
  })
]);

export const FEAT_BY_ID = new Map(FEATS.map(definition => [definition.id, definition]));
