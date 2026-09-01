// The six trial vocabularies are internal generation data. Player-facing UI
// receives only a coarse clue derived from the selected signals.
export const FLOOR_TRIALS = Object.freeze([
  Object.freeze({
    id: "short_battle",
    label: "短期決戦",
    affinity: Object.freeze({
      traits: Object.freeze(["chargeAttack", "multiAction", "selfDestruct", "targetLowHp"]),
      fields: Object.freeze(["isSniper"])
    }),
    signals: Object.freeze(["乾いた足音が、間を置かずに近づいてくる…", "短い呼吸がいくつも重なる…"])
  }),
  Object.freeze({
    id: "many_battles",
    label: "多数戦",
    affinity: Object.freeze({
      traits: Object.freeze(["splitOnDeath", "summonAlly", "selfDestruct"]),
      tags: Object.freeze(["beast"])
    }),
    signals: Object.freeze(["複数の足音が、あちこちで重なっている…", "遠くで群れが床を擦る音がする…"])
  }),
  Object.freeze({
    id: "endurance",
    label: "持久戦",
    affinity: Object.freeze({
      traits: Object.freeze(["regen", "guardAdjacent", "antiHeal"]),
      fields: Object.freeze(["highHp", "highDef"])
    }),
    signals: Object.freeze(["重い気配が、なかなか遠ざからない…", "長く続く争いの跡が残っている…"])
  }),
  Object.freeze({
    id: "opening",
    label: "初動",
    affinity: Object.freeze({
      traits: Object.freeze(["chargeAttack", "targetLowHp"]),
      fields: Object.freeze(["isSniper", "spell"])
    }),
    signals: Object.freeze(["先回りする気配が、進路の先で待っている…", "見えない視線が、最初の一歩を探っている…"])
  }),
  Object.freeze({
    id: "status",
    label: "状態異常",
    affinity: Object.freeze({
      traits: Object.freeze(["silence", "debuffPhysicalDef", "debuffMagicDef", "antiHeal"]),
      fields: Object.freeze(["isPoisonous", "isParalyzing", "isBlinding", "isSleepInflicting", "statusAttackPattern"])
    }),
    signals: Object.freeze(["刺激臭が、湿った空気に混じっている…", "喉の奥に残る違和感が強くなっている…"])
  }),
  Object.freeze({
    id: "resource",
    label: "資源圧迫",
    affinity: Object.freeze({
      traits: Object.freeze(["drainMp", "counterSpell", "silence"]),
      fields: Object.freeze(["spell", "magicResist"])
    }),
    signals: Object.freeze(["魔力の脈動が、足元からじわじわと響く…", "空気が重く、力を使うたびに軋みそうだ…"])
  })
]);

export const FLOOR_ROLES = Object.freeze([
  Object.freeze({
    id: "introduction",
    label: "紹介",
    mainWeight: 1.08,
    subWeight: 0.92,
    groupWeight: 0.96,
    rareWeight: 0.92,
    signals: Object.freeze(["まだ遠い気配が、輪郭だけを見せている…"])
  }),
  Object.freeze({
    id: "development",
    label: "展開",
    mainWeight: 1.32,
    subWeight: 1.02,
    groupWeight: 1.04,
    rareWeight: 1,
    signals: Object.freeze(["気配が濃くなり、進むほど道が狭まっていく…"])
  }),
  Object.freeze({
    id: "change",
    label: "変化",
    mainWeight: 1.12,
    subWeight: 1.28,
    groupWeight: 1.08,
    rareWeight: 1.06,
    signals: Object.freeze(["別の気配が混ざり、空気の質が変わった…"])
  }),
  Object.freeze({
    id: "temptation",
    label: "誘惑",
    mainWeight: 1.04,
    subWeight: 1.08,
    groupWeight: 1.04,
    rareWeight: 1.38,
    signals: Object.freeze(["寄り道の先から、価値のある物音が聞こえる…"])
  }),
  Object.freeze({
    id: "settlement",
    label: "決算",
    mainWeight: 1.34,
    subWeight: 1.30,
    groupWeight: 1.12,
    rareWeight: 1.08,
    signals: Object.freeze(["これまでの気配が、一つの重い存在へ集まっている…"])
  })
]);
