import { runCombatRoundCalculation } from "../src/combat_logic/round.js";

let failed = false;

function assert(condition, label, detail) {
  if (condition) {
    console.log(`[PASS] ${label}: ${detail}`);
    return;
  }

  console.error(`[FAIL] ${label}: ${detail}`);
  failed = true;
}

function createPartyMember(name = "戦士") {
  return {
    name,
    class: "Fighter",
    level: 1,
    hp: 100,
    maxHp: 100,
    mp: 0,
    maxMp: 0,
    status: "ok",
    str: 1,
    int: 1,
    pie: 1,
    vit: 1,
    agi: 1,
    luk: 1,
    equipment: {},
    spells: [],
    exp: 0
  };
}

function createMonster(overrides = {}) {
  return {
    name: "テストモンスター",
    level: 1,
    hp: 100,
    maxHp: 100,
    status: "ok",
    atk: 10,
    def: 100,
    agi: 10,
    traits: [],
    exp: 0,
    gold: 0,
    ...overrides
  };
}

function createState(party, monsters) {
  return {
    party,
    inventory: [],
    combatState: {
      monsters,
      phase: "resolving",
      roundNumber: 1,
      isAuto: false,
      isBoss: false,
      isMidboss: false
    },
    currentRun: null,
    codex: null,
    firstKills: [],
    roamingMonsters: [],
    floorChestsTotal: [],
    openedGates: [],
    metaMaterials: {},
    gold: 0,
    floor: 1,
    materials: {},
    identifyTickets: 0
  };
}

function runWithFixedRandom(state, combatSelection) {
  const originalRandom = Math.random;
  try {
    Math.random = () => 0;
    return runCombatRoundCalculation(state, combatSelection);
  } finally {
    Math.random = originalRandom;
  }
}

{
  const state = createState(
    [createPartyMember()],
    [createMonster({ name: "破滅の導師", traits: ["chargeAttack"], traitChance: 1 })]
  );
  const res = runWithFixedRandom(state, {
    actions: [{ actorIdx: 0, type: "defend" }]
  });
  const actual = res.state.combatState.monsters[0].chargeQueued;

  assert(actual === true, "charge警告キュー", `chargeQueued=${actual}`);
}

{
  function damageTaken(actionType) {
    const state = createState(
      [createPartyMember()],
      [createMonster({
        name: "破滅の導師",
        hp: 999,
        maxHp: 999,
        traits: ["chargeAttack"],
        chargeQueued: true
      })]
    );
    const res = runWithFixedRandom(state, {
      actions: [{ actorIdx: 0, type: actionType, targetIdx: 0 }]
    });
    return state.party[0].hp - res.state.party[0].hp;
  }

  const undefendedDamage = damageTaken("fight");
  const defendedDamage = damageTaken("defend");

  assert(
    defendedDamage < undefendedDamage && defendedDamage === undefendedDamage / 2,
    "防御軽減",
    `非防御=${undefendedDamage}, 防御=${defendedDamage}`
  );
}

{
  const state = createState(
    [createPartyMember()],
    [createMonster({
      name: "沈黙した魔術師",
      spell: "MADALTO",
      spellChance: 1,
      madaltoQueued: true,
      silenceTurns: 2
    })]
  );
  const res = runWithFixedRandom(state, {
    actions: [{ actorIdx: 0, type: "defend" }]
  });
  const actual = res.state.combatState.monsters[0].madaltoQueued;

  assert(actual === false, "silenceによるMADALTOキュー解除", `madaltoQueued=${actual}`);
}

if (failed) {
  process.exit(1);
}
