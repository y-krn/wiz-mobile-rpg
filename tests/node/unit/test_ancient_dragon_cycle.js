import assert from "node:assert/strict";
import { runCombatRoundCalculation } from "../../../src/combat_logic/round.js";
import { resolveBossAction } from "../../../src/combat_logic/boss_actions.js";

function createPartyMember() {
  return {
    name: "戦士",
    level: 1,
    hp: 200,
    maxHp: 200,
    mp: 0,
    maxMp: 0,
    status: "ok",
    str: 1,
    int: 1,
    pie: 1,
    vit: 1,
    agi: 10,
    luk: 1,
    equipment: {},
    exp: 0
  };
}

function createAncientDragon(overrides = {}) {
  return {
    name: "いにしえの竜",
    level: 30,
    hp: 9999,
    maxHp: 9999,
    status: "ok",
    atk: 30,
    def: 10,
    agi: 1,
    traits: [],
    exp: 0,
    gold: 0,
    turnCount: 41,
    ...overrides
  };
}

function createState(monster) {
  return {
    party: [createPartyMember()],
    inventory: [],
    combatState: {
      monsters: [monster],
      phase: "resolving",
      roundNumber: 1,
      isAuto: false,
      isBoss: true,
      isMidboss: false
    },
    currentRun: null,
    codex: null,
    firstKills: [],
    roamingMonsters: [],
    floorChestsTotal: [],
    metaMaterials: {},
    gold: 0,
    floor: 5,
    materials: {},
    identifyTickets: 0
  };
}

function runRound(state, type = "defend", options = {}) {
  const action = { actorIdx: 0, type };
  if (type === "fight") action.targetIdx = 0;
  return runCombatRoundCalculation(state, { actions: [action] }, { rng: () => 0, policy: state.simPolicy, ...options });
}

function dragon(state) {
  return state.combatState.monsters[0];
}

{
  let state = createState(createAncientDragon());
  const logs = [];

  for (const expected of [1, 1, 2, 2, 3, 0]) {
    const result = runRound(state);
    state = result.state;
    logs.push(...result.logQueue.map(entry => entry.msg));
    assert.equal(dragon(state).ancientDragonCycleStep, expected);
    assert.equal(dragon(state).turnCount, 41);
  }

  assert.ok(logs.some(msg => msg.includes("炎の息の予兆")));
  assert.ok(logs.some(msg => msg.includes("激しい炎の息を吐き出した")));
  assert.ok(logs.some(msg => msg.includes("ティルトウェイトの予兆")));
  assert.ok(logs.some(msg => msg.includes("ティルトウェイトを唱えた")));
}

{
  let state = createState(createAncientDragon({
    traits: ["summonAlly"],
    summon: { name: "ゴブリンの呪術師", maxAllies: 5 },
    turnCount: 2
  }));

  state = runRound(state).state;
  assert.equal(dragon(state).ancientDragonCycleStep, 0);
  assert.equal(dragon(state).summonQueued, true);
  assert.equal(dragon(state).turnCount, 3);

  state = runRound(state).state;
  assert.equal(dragon(state).ancientDragonCycleStep, 0);
  assert.equal(dragon(state).summonQueued, false);
  assert.equal(state.combatState.monsters.length, 2);

  state = runRound(state).state;
  assert.equal(dragon(state).ancientDragonCycleStep, 1);
  assert.equal(dragon(state).turnCount, 4);
}

{
  const monster = createAncientDragon({
    ancientDragonCycleStep: 1,
    madaltoQueued: true,
    silenceTurns: 1,
    turnCount: 99
  });
  const logQueue = [];
  const state = createState(monster);

  assert.equal(resolveBossAction(monster, state, { actions: [] }, [monster], logQueue, { rng: () => 0 }), true);
  assert.equal(monster.ancientDragonCycleStep, 1);
  assert.equal(monster.madaltoQueued, false);
  assert.equal(monster.dragonBreathQueued, true);
  assert.equal(monster.turnCount, 99);
  assert.match(logQueue[0].msg, /炎の息の予兆/);
}

{
  const monster = createAncientDragon({ ancientDragonCycleStep: 1, turnCount: 99 });
  const state = createState(monster);
  const logQueue = [];

  assert.equal(resolveBossAction(monster, state, { actions: [] }, [monster], logQueue, { rng: () => 0.9 }), true);
  assert.equal(monster.ancientDragonCycleStep, 1);
  assert.equal(monster.madaltoQueued, true);
  assert.equal(resolveBossAction(monster, state, { actions: [] }, [monster], logQueue, { rng: () => 0 }), true);
  assert.equal(monster.ancientDragonCycleStep, 2);
  assert.equal(monster.turnCount, 99);
}

{
  function damageTaken(type) {
    const result = runRound(createState(createAncientDragon({
      ancientDragonCycleStep: 2,
      tiltowaitQueued: true
    })), type);
    return 200 - result.state.party[0].hp;
  }

  const undefended = damageTaken("fight");
  const defended = damageTaken("defend");
  assert.ok(defended < undefended, `TILTOWAIT Guard軽減: undefended=${undefended}, defended=${defended}`);
}

{
  const queuedSpecials = [
    { logFragment: "ティルトウェイトを唱えた", queued: "tiltowaitQueued", cycleStep: 2 },
    { logFragment: "激しい炎の息を吐き出した", queued: "dragonBreathQueued", cycleStep: 0 },
    { logFragment: "マダルトを唱えた", queued: "madaltoQueued", cycleStep: 0 }
  ];

  for (const special of queuedSpecials) {
    const state = createState(createAncientDragon({
      ancientDragonCycleStep: special.cycleStep,
      traits: ["chargeAttack", "summonAlly", "multiAction"],
      chargeQueued: true,
      summonQueued: true,
      multiActionQueued: true,
      [special.queued]: true,
      summon: { name: "ゴブリンの呪術師", maxAllies: 5 }
    }));
    const result = runRound(state, "defend", {
      policy: { measurementMaxActionsPerEnemy: 1 },
      rng: () => 0
    });
    const resolved = dragon(result.state);
    const logs = result.logQueue.map(entry => entry.msg);

    assert.ok(logs.some(msg => msg.includes(special.logFragment)));
    assert.equal(resolved[special.queued], false);
    assert.equal(resolved.chargeQueued, true);
    assert.equal(resolved.summonQueued, true);
    assert.equal(resolved.multiActionQueued, true);
    assert.equal(resolved.ancientDragonCycleStep, (special.cycleStep + 1) % 4);
    assert.equal(result.state.combatState.monsters.length, 1);
  }
}

{
  const state = createState(createAncientDragon({
    ancientDragonCycleStep: 2,
    tiltowaitQueued: true,
    chargeQueued: true,
    summonQueued: true,
    multiActionQueued: true
  }));
  state.floor = 30;
  state.simPolicy = { b30TiltowaitGuardRecoveryCandidate: true };

  const guardedResolution = runRound(state, "defend");
  const resolvedDragon = dragon(guardedResolution.state);
  assert.equal(resolvedDragon.b30TiltowaitGuardRecoveryQueued, true);
  assert.equal(resolvedDragon.ancientDragonCycleStep, 3);

  const recovery = runRound(guardedResolution.state, "defend", {
    policy: { b30TiltowaitGuardRecoveryCandidate: true }
  });
  const recoveredDragon = dragon(recovery.state);
  assert.ok(recovery.logQueue.some(entry => entry.msg.includes("体勢を立て直した")));
  assert.equal(recoveredDragon.b30TiltowaitGuardRecoveryQueued, false);
  assert.equal(recoveredDragon.ancientDragonCycleStep, 0);
  assert.equal(recoveredDragon.chargeQueued, true);
  assert.equal(recoveredDragon.summonQueued, true);
  assert.equal(recoveredDragon.multiActionQueued, true);
  assert.equal(recovery.state.party[0].hp, guardedResolution.state.party[0].hp);
}

{
  for (const queuedSpecial of ["dragonBreathQueued", "madaltoQueued"]) {
    const state = createState(createAncientDragon({
      [queuedSpecial]: true,
      ancientDragonCycleStep: 0
    }));
    state.floor = 30;
    state.simPolicy = { b30TiltowaitGuardRecoveryCandidate: true };
    const result = runRound(state, "defend");
    assert.equal(dragon(result.state).b30TiltowaitGuardRecoveryQueued, undefined);
  }
}

{
  for (const status of ["sleep", "paralyzed"]) {
    const state = createState(createAncientDragon({
      status,
      ancientDragonCycleStep: 3,
      b30TiltowaitGuardRecoveryQueued: true
    }));
    state.floor = 30;
    state.simPolicy = { b30TiltowaitGuardRecoveryCandidate: true };
    const result = runRound(state, "defend");
    assert.equal(dragon(result.state).b30TiltowaitGuardRecoveryQueued, true);
    assert.ok(!result.logQueue.some(entry => entry.msg.includes("体勢を立て直した")));
  }

  const flinchedState = createState(createAncientDragon({
    ancientDragonCycleStep: 3,
    flinched: true,
    b30TiltowaitGuardRecoveryQueued: true
  }));
  flinchedState.floor = 30;
  flinchedState.simPolicy = { b30TiltowaitGuardRecoveryCandidate: true };
  const flinched = runRound(flinchedState, "defend");
  assert.equal(dragon(flinched.state).b30TiltowaitGuardRecoveryQueued, true);
  assert.ok(!flinched.logQueue.some(entry => entry.msg.includes("体勢を立て直した")));

  const silencedState = createState(createAncientDragon({
    ancientDragonCycleStep: 2,
    silenceTurns: 1,
    tiltowaitQueued: true,
    b30TiltowaitGuardRecoveryQueued: true
  }));
  silencedState.floor = 30;
  silencedState.simPolicy = { b30TiltowaitGuardRecoveryCandidate: true };
  const silenced = runRound(silencedState, "defend");
  assert.equal(dragon(silenced.state).tiltowaitQueued, false);
  assert.equal(dragon(silenced.state).b30TiltowaitGuardRecoveryQueued, false);
  assert.ok(!silenced.logQueue.some(entry => entry.msg.includes("ティルトウェイトを唱えた")));
}

{
  const state = createState(createAncientDragon({
    ancientDragonCycleStep: 2,
    tiltowaitQueued: true
  }));
  state.floor = 30;
  state.simPolicy = { b30TiltowaitGuardRecoveryCandidate: true };
  const unresolvedGuard = runRound(state, "fight");
  assert.equal(dragon(unresolvedGuard.state).b30TiltowaitGuardRecoveryQueued, undefined);

  const legacyState = createState(createAncientDragon({
    ancientDragonCycleStep: 2,
    tiltowaitQueued: true
  }));
  legacyState.floor = 30;
  const legacyGuard = runRound(legacyState, "defend");
  assert.equal(dragon(legacyGuard.state).b30TiltowaitGuardRecoveryQueued, undefined);
  const legacyCycle = runRound(legacyGuard.state, "defend");
  assert.equal(dragon(legacyCycle.state).ancientDragonCycleStep, 0);
  assert.ok(!legacyCycle.logQueue.some(entry => entry.msg.includes("体勢を立て直した")));
}

{
  const monster = {
    name: "汎用敵",
    hp: 100,
    maxHp: 100,
    status: "ok",
    atk: 10,
    def: 0,
    agi: 1,
    traits: ["chargeAttack"],
    chargeQueued: true
  };
  const state = createState(monster);
  state.combatState.isBoss = false;
  const result = runRound(state);
  const resolvedMonster = result.state.combatState.monsters[0];

  assert.equal(resolvedMonster.chargeQueued, false);
  assert.ok(result.logQueue.some(entry => entry.msg.includes("破滅の波動を放った")));
}

{
  const state = createState(createAncientDragon({
    ancientDragonCycleStep: 2,
    silenceTurns: 1
  }));
  const result = runRound(state);
  assert.equal(dragon(result.state).ancientDragonCycleStep, 3);
}

{
  const state = createState(createAncientDragon({
    ancientDragonCycleStep: 3,
    silenceTurns: 1,
    dragonBreathQueued: true,
    madaltoQueued: true,
    tiltowaitQueued: true
  }));
  const result = runRound(state);
  const resolved = dragon(result.state);

  assert.equal(resolved.dragonBreathQueued, false);
  assert.equal(resolved.madaltoQueued, false);
  assert.equal(resolved.tiltowaitQueued, false);
  assert.equal(resolved.ancientDragonCycleStep, 0);
  assert.ok(result.logQueue.some(entry => entry.msg.includes("激しい炎の息を吐き出した")));
}

{
  let state = createState(createAncientDragon({
    isSniper: true,
    traitChance: 1
  }));

  state = runRound(state).state;
  assert.equal(dragon(state).ancientDragonCycleStep, 0);
  assert.equal(dragon(state).snipeQueued, true);

  state = runRound(state).state;
  assert.equal(dragon(state).ancientDragonCycleStep, 0);
  assert.equal(dragon(state).snipeQueued, false);

  dragon(state).traitChance = 0;
  state = runRound(state).state;
  assert.equal(dragon(state).ancientDragonCycleStep, 1);
}

{
  let state = createState(createAncientDragon({
    traits: ["multiAction"],
    traitChance: 1
  }));

  state = runRound(state).state;
  assert.equal(dragon(state).ancientDragonCycleStep, 0);
  assert.equal(dragon(state).multiActionQueued, true);

  dragon(state).traitChance = 0;
  state = runRound(state, "defend", { policy: { measurementMaxActionsPerEnemy: 1 } }).state;
  assert.equal(dragon(state).ancientDragonCycleStep, 0);
  assert.equal(dragon(state).multiActionQueued, false);

  state = runRound(state).state;
  assert.equal(dragon(state).ancientDragonCycleStep, 1);
}
