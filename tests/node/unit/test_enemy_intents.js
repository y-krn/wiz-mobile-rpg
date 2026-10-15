// Enemy intents (#2115): every ordinary enemy shows its next move before the
// player chooses, roles follow fixed rules, and what is shown is what happens.
import assert from "node:assert/strict";
import { runCombatRoundCalculation } from "../../../src/combat_logic.js";
import {
  findIntentGuard, isIntentEncounter, isSignatureRound, planEncounterIntents, planIntent
} from "../../../src/combat_logic/enemy_intents.js";
import { MONSTERS } from "../../../src/data/monsters.js";

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

// A guard by nature covers a badly hurt ally, and the guard is certain.
{
  const guard = monster("盾", { def: 6, traits: ["guardAdjacent"] });
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

// Only a guard by nature guards: the toughest of a plain group just fights.
{
  const tough = monster("硬い", { def: 9 });
  const hurt = monster("傷", { hp: 5 });
  assert.notEqual(planIntent(tough, [tough, hurt], [hero()], never).kind, "guard");
}

// Each kind fights its own way: a signature move comes on its own beat, and
// there is no shared heavy swing for whoever hits hardest.
{
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].filter(round => isSignatureRound({ every: 3 }, round)), [3, 6]);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].filter(round => isSignatureRound({ every: 3, first: 2 }, round)), [2, 5]);
  const brute = monster("力自慢", { atk: 12 });
  const seen = [];
  for (let round = 1; round <= 6; round++) seen.push(planIntent(brute, [brute], [hero()], never).kind);
  assert.ok(seen.every(kind => kind === "attack"), "no generic heavy swing");

  const orc = monster("オーク", { atk: 12, signature: { kind: "strike", label: "叩き割り", every: 3, mult: 2 } });
  const kinds = [];
  for (let round = 1; round <= 3; round++) kinds.push(planIntent(orc, [orc], [hero()], never));
  assert.equal(kinds[2].kind, "signature");
  assert.equal(kinds[2].label, "叩き割り");
  assert.equal(kinds[2].threat, true);

  const hit = signature => {
    const mon = monster("オーク", { atk: 12, signature, intent: signature ? { kind: "signature", label: signature.label } : { kind: "attack", label: "攻撃" } });
    const state = createState([mon]);
    const before = state.party[0].hp;
    const result = runCombatRoundCalculation(state, { actions: [{ type: "defend", actorIdx: 0 }] }, { rng: () => 0.5 });
    return before - result.state.party[0].hp;
  };
  assert.ok(hit({ kind: "strike", label: "叩き割り", every: 3, mult: 2 }) > hit(null), "the signature strike hurts more");
}

// A shown status strike lands unless the target defends or resists.
{
  const spore = monster("胞子", { signature: { kind: "strike", label: "眠りの胞子", every: 3, status: "sleep" } });
  spore.intent = { kind: "signature", label: "眠りの胞子" };
  const state = createState([spore]);
  const result = runCombatRoundCalculation(state, { actions: [{ type: "fight", actorIdx: 0, targetIdx: 0 }] }, { rng: () => 0.5 });
  assert.equal(result.state.party[0].status, "sleep");
}

// A draining strike takes back what it deals; a hardening one raises its guard.
{
  const spirit = monster("霊", { hp: 10, maxHp: 40, signature: { kind: "strike", label: "生気を吸う", every: 3, drain: 1 } });
  spirit.intent = { kind: "signature", label: "生気を吸う" };
  const result = runCombatRoundCalculation(createState([spirit]), { actions: [{ type: "defend", actorIdx: 0 }] }, { rng: () => 0.5 });
  assert.ok(result.state.combatState.monsters[0].hp > 10);

  const beetle = monster("甲虫", { signature: { kind: "harden", label: "殻にこもる", every: 3, def: 8 } });
  beetle.intent = { kind: "signature", label: "殻にこもる" };
  const hardened = runCombatRoundCalculation(createState([beetle]), { actions: [{ type: "defend", actorIdx: 0 }] }, { rng: () => 0.5 });
  assert.ok(hardened.state.combatState.monsters[0].buffs.some(buff => buff.type === "def" && buff.value === 8));
}

// Every ordinary monster has a way of its own: a signature move, an active
// trait, a spell, or a sniper's aim.
{
  const ACTIVE = ["evasive", "guardAdjacent", "chargeAttack", "summonAlly", "multiAction", "cleanseAlly", "drainMp",
    "silence", "antiHeal", "buffPhysicalDef", "buffMagicDef", "buffAtk", "selfDestruct", "counterSpell", "debuffMagicDef", "reflectMagic"];
  const signatures = MONSTERS.filter(mon => mon.signature);
  assert.ok(signatures.length >= 25);
  for (const mon of signatures) {
    assert.ok(["strike", "harden"].includes(mon.signature.kind), mon.name);
    assert.ok(mon.signature.label && mon.signature.every >= 2, mon.name);
    assert.ok(mon.signature.kind !== "strike" || mon.signature.mult || mon.signature.status || mon.signature.drain, mon.name);
  }
  for (const name of ["かみつき蟲", "マッドスライム", "まどろみ胞子", "ゾンビ", "リビングアーマー", "オークの戦士", "バンシー", "ドラゴンワーム"]) {
    const mon = MONSTERS.find(entry => entry.name === name);
    assert.ok(mon.signature || mon.spell || mon.isSniper || (mon.traits || []).some(trait => ACTIVE.includes(trait)), name);
  }
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

// A lookout calls for help once an ally has fallen: it stays, and one more of the
// fallen kind joins this fight, fresh. It calls only once.
{
  const lookout = monster("蝙蝠", { traits: ["evasive"], hp: 30, maxHp: 30 });
  const fallen = monster("倒れた仲間", { hp: 0 });
  const state = createState([lookout, fallen]);
  planEncounterIntents(state, never);
  assert.equal(lookout.intent.kind, "call");
  const result = runCombatRoundCalculation(state, { actions: [{ type: "defend", actorIdx: 0 }] }, { rng: () => 0.5 });
  const after = result.state.combatState.monsters;
  assert.equal(after[0].fled, undefined, "the lookout stays in the fight");
  assert.ok(after[0].hp > 0);
  assert.equal(after.length, 3, "one ally joins");
  assert.equal(after[2].name, "倒れた仲間");
  assert.equal(after[2].hp, after[2].maxHp, "the newcomer is fresh");
  assert.equal(after[2].exp, 0, "a called ally gives no experience");
  assert.equal(result.state.currentRun.pursuit ?? null, null, "no pack is sent after the party");
  assert.notEqual(after[0].intent?.kind, "call", "it calls only once");
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
