// Weapon techniques (Build vNext, #1801). A technique is the second combat
// verb a weapon family owns next to the universal attack: it is keyed by the
// weapon behavior profile, never by item id, and has an encounter-local
// cooldown so that "when to spend it" is the decision.
//
// Executable values live here; the meaning lives in
// .agents/game-design-equipment-builds.md and game-design-combat-model.md.

export const TECHNIQUES = Object.freeze({
  twinStrike: Object.freeze({
    id: "twinStrike",
    profileId: "light",
    name: "二連突き",
    desc: "命中が高い突きを2回。回避の高い敵に強い。",
    cooldown: 2,
    target: "enemy",
    hits: 2,
    damageMultiplier: 0.65,
    hitChanceBonus: 0.15
  }),
  readingCut: Object.freeze({
    id: "readingCut",
    profileId: "blade",
    name: "見切り斬り",
    desc: "1.3倍の斬撃。予兆中の敵には1.8倍で、通常の敵なら予兆を潰す。",
    cooldown: 3,
    target: "enemy",
    hits: 1,
    damageMultiplier: 1.3,
    telegraphDamageMultiplier: 1.8,
    interruptsTelegraph: true
  }),
  armorBreak: Object.freeze({
    id: "armorBreak",
    profileId: "impact",
    name: "鎧砕き",
    desc: "防御を無視して打ち、3ターンの間その敵の防御を下げる。",
    cooldown: 3,
    target: "enemy",
    hits: 1,
    damageMultiplier: 1,
    ignoreDefense: true,
    defDown: 4,
    defDownTurns: 3
  }),
  allOutSwing: Object.freeze({
    id: "allOutSwing",
    profileId: "heavy",
    name: "渾身",
    desc: "2.2倍の一撃。使った後は間合いを取り直すため長く使えない。",
    cooldown: 4,
    target: "enemy",
    hits: 1,
    damageMultiplier: 2.2
  }),
  focusMana: Object.freeze({
    id: "focusMana",
    profileId: "medium",
    name: "魔力集中",
    desc: "MPを2回復し、次の呪文の威力を1.3倍にする。",
    cooldown: 3,
    target: "self",
    mpRestore: 2,
    nextSpellMultiplier: 1.3
  })
});

export const TECHNIQUE_BY_PROFILE = Object.freeze(
  Object.fromEntries(Object.values(TECHNIQUES).map(technique => [technique.profileId, technique]))
);

// Monster flags that mean "a telegraphed action resolves next turn".
export const TELEGRAPH_FLAGS = Object.freeze([
  "lahalitoQueued",
  "madaltoQueued",
  "chargeQueued",
  "multiActionQueued",
  "selfDestructQueued",
  "snipeQueued",
  "summonQueued",
  "statusPayoffQueued",
  "crushStrikeQueued",
  "dragonBreathQueued",
  "tiltowaitQueued"
]);
