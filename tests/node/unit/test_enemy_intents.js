// Enemy intents (#2115): every ordinary enemy shows its next move before the
// player chooses, roles follow fixed rules, and what is shown is what happens.
import assert from "node:assert/strict";
import { runCombatRoundCalculation } from "../../../src/combat_logic.js";
import {
  HEAVY_EVERY, findIntentGuard, isIntentEncounter, planEncounterIntents, planIntent
} from "../../../src/combat_logic/enemy_intents.js";

global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const monster = (name, extra = {}) => ({ name, hp: 40, maxHp: 40, atk: 5, def: 1, traits: [], buffs: [], status: "ok", ...extra });
const hero = () => ({
  name: "Solo", level: 5, hp: 200, maxHp: 200, mp: 5, maxMp: 5, status: "ok", buffs: [], spells: [],
  equipment: { weapon: "SHORT_SWORD", shield: null, armor: null, accessory: null }
});
function createState(monsters, combatExtra = {}) {
  return {
    party: [hero()],
    combatState: {
      monsters, isBoss: false, isMidboss: false, isRoamingFlack: false, allParalyzedTurns: 0,
      roundNumber: 1, phase: "choose_actions", enemyActionScheduling: "independent", ...combatExtra
    },
    inventory: [], firstKills: [], codex: null,
    currentRun: { itemsFound: [], equipmentFound: [], deathLogs: [] },
    roamingMonsters: [], floorChestsTotal: [], gold: 0, floor: 3, x: 5, y: 5
  };
}
const never = () => 0.999;

// Only ordinary fights carry intents.
assert.equal(isIntentEncounter({ isBoss: false }), true);
assert.equal(isIntentEncounter({ isBoss: true }), false);
assert.equal(isIntentEncounter({ isRoamingFlack: true }), false);

// The toughest of a group guards a badly hurt ally, and the guard is certain.
{
  const guard = monster("盾", { def: 6 });
  const ward = monster("術師", { hp: 10 });
  const state = createState([guard, ward]);
  planEncounterIntents(state, never);
  assert.equal(guard.intent.kind, "guard");
  assert.equal(guard.intent.targetIdx, 1);
  assert.match(guard.intent.detail, /かばう→術師/);
  assert.deepEqual(findIntentGuard(state.combatState.monsters, 1)?.idx, 0);
  const result = runCombatRoundCalculation(state, { actions: [{ type: "fight", actorIdx: 0, targetIdx: 1 }] }, { rng: () => 0.5 });
  assert.equal(result.state.combatState.monsters[1].hp, 10, "the ward is not hit");
  assert.ok(result.state.combatState.monsters[0].hp < 40, "the guard takes the blow");
}

// The strongest attacker swings heavy every HEAVY_EVERY rounds, and it lands twice as hard.
{
  const brute = monster("力自慢", { atk: 12 });
  const small = monster("小物", { atk: 3 });
  const seen = [];
  for (let round = 1; round <= HEAVY_EVERY * 2; round++) seen.push(planIntent(brute, [brute, small], [hero()], never).kind);
  assert.deepEqual(seen.filter(kind => kind === "heavy").length, 2);
  assert.equal(planIntent(small, [brute, small], [hero()], never).kind, "attack");

  const hit = heavy => {
    const state = createState([monster("力自慢", { atk: 12, intent: heavy ? { kind: "heavy", label: "大振り" } : { kind: "attack", label: "攻撃" } })]);
    const before = state.party[0].hp;
    const result = runCombatRoundCalculation(state, { actions: [{ type: "defend", actorIdx: 0 }] }, { rng: () => 0.5 });
    return before - result.state.party[0].hp;
  };
  assert.ok(hit(true) > hit(false), "a heavy swing hurts more than an attack");
}

// A leader rallies whenever the group's attack is not raised; a healer mends the most hurt.
{
  const leader = monster("隊長", { traits: ["buffAtk"] });
  const other = monster("兵", { hp: 30 });
  assert.equal(planIntent(leader, [leader, other], [hero()], never).kind, "rally");
  other.buffs = [{ type: "atk", value: 3, turns: 2 }];
  assert.notEqual(planIntent(leader, [leader, other], [hero()], never).kind, "rally");

  const priest = monster("僧", { spell: "DIOS" });
  const hurt = monster("兵", { hp: 10 });
  const healIntent = planIntent(priest, [priest, hurt], [hero()], never);
  assert.equal(healIntent.kind, "healSpell");
  assert.equal(healIntent.targetIdx, 1);
}

// A lookout runs for help once an ally has fallen, and its call brings a pack.
{
  const lookout = monster("蝙蝠", { traits: ["evasive"], hp: 30, maxHp: 30 });
  const fallen = monster("倒れた仲間", { hp: 0 });
  const state = createState([lookout, fallen]);
  planEncounterIntents(state, never);
  assert.equal(lookout.intent.kind, "call");
  const result = runCombatRoundCalculation(state, { actions: [{ type: "defend", actorIdx: 0 }] }, { rng: () => 0.5 });
  assert.equal(result.state.combatState.monsters[0].fled, true);
  assert.equal(result.state.currentRun.pursuit?.reinforcement, true, "help is on its way");
}

// What is shown is what happens: a silencer that showed an attack does not silence,
// even when the old roll would have fired.
{
  const silencer = monster("封呪の僧", { traits: ["silence"], intent: { kind: "attack", label: "攻撃" } });
  const state = createState([silencer]);
  const result = runCombatRoundCalculation(state, { actions: [{ type: "defend", actorIdx: 0 }] }, { rng: () => 0 });
  assert.equal(result.logQueue.some(log => log.msg?.includes("沈黙")), false);
  const shown = createState([monster("封呪の僧", { traits: ["silence"], intent: { kind: "silence", label: "封呪" } })]);
  const silenced = runCombatRoundCalculation(shown, { actions: [{ type: "defend", actorIdx: 0 }] }, { rng: () => 0.999 });
  assert.ok(silenced.logQueue.some(log => log.msg?.includes("沈黙")), "a shown silence is attempted even without the roll");
}

// Each round ends by planning the next one.
{
  const state = createState([monster("兵")]);
  const result = runCombatRoundCalculation(state, { actions: [{ type: "defend", actorIdx: 0 }] }, { rng: () => 0.5 });
  assert.ok(result.state.combatState.monsters[0].intent?.label);
}

console.log("[PASS] enemy intents: roles by rule, shown before the turn, carried out as shown");
