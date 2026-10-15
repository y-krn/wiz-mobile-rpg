// Enemy intents (#2115). In an ordinary fight every enemy decides its next
// move before the player chooses, and the move is shown above it. What is
// shown is what happens: the monster's turn carries the intent out instead of
// rolling for its traits again. Roles follow fixed rules so a player can read
// a group and choose who to strike first, when to defend, and when to run.
//
// Each kind of monster fights its own way: its traits and its signature move
// (`signature` in the monster data) come on a fixed beat, so no two kinds
// share one generic heavy swing or guard.
//
// Bosses, mid-bosses and the roaming elites keep their own patterns and
// telegraphs; they get no intent here.
import { hasTrait } from "./monster_traits.js";

export const GUARD_HP_RATE = 0.5;
export const HEAL_SPELL_HP_RATE = 0.6;

const SPELL_LABELS = Object.freeze({ LAHALITO: "炎嵐", MADALTO: "氷嵐", HALITO: "火球", MAHALITO: "炎の渦" });
const QUEUED_SPELLS = new Set(["LAHALITO", "MADALTO"]);

export function isIntentEncounter(combatState) {
  return Boolean(combatState) && !combatState.isBoss && !combatState.isMidboss &&
    !combatState.isRoamingFlack && !combatState.isMimic && !combatState.isBrood;
}

/** The intent a monster carries this round, or null when intents do not apply. */
export function getActiveIntent(mon, combatState) {
  if (!isIntentEncounter(combatState)) return null;
  return mon?.intent || null;
}

const living = monsters => monsters.filter(monster => monster && monster.hp > 0 && !monster.fled);
const ratio = monster => monster.hp / Math.max(1, monster.maxHp);
const isQueued = monster => Boolean(monster.chargeQueued || monster.lahalitoQueued || monster.madaltoQueued ||
  monster.summonQueued || monster.multiActionQueued || monster.snipeQueued || monster.selfDestructQueued);

// `label` is the short tag shown above the enemy; `detail` names the target
// for screen readers and the log.
function intent(kind, label, extra = {}) {
  return { kind, label, detail: label, ...extra };
}

/** The tag to draw: an arrow toward the ally a move is aimed at. */
export function getIntentTag(monsters, index) {
  const mon = monsters?.[index];
  const shown = mon?.intent;
  if (!shown?.label) return null;
  if (!Number.isInteger(shown.targetIdx)) return shown.label;
  if (shown.targetIdx === index) return `${shown.label}（自分）`;
  return shown.targetIdx < index ? `←${shown.label}` : `${shown.label}→`;
}

// A queued telegraph resolves this round.
function releaseIntent(mon) {
  if (mon.selfDestructQueued) return intent("release", "自爆", { threat: true });
  if (mon.chargeQueued) return intent("release", "破滅の波動", { threat: true });
  if (mon.summonQueued) return intent("release", "召喚", { threat: true });
  if (mon.multiActionQueued) return intent("release", "連続攻撃", { threat: true });
  if (mon.snipeQueued) return intent("release", "狙撃", { threat: true });
  if (mon.lahalitoQueued || mon.madaltoQueued) {
    return intent("release", `${SPELL_LABELS[mon.spell] || "大呪文"}（全体）`, { threat: true });
  }
  return null;
}

// A signature move comes on its beat: round `first` (default `every`), then
// every `every` rounds.
export function isSignatureRound(signature, round) {
  const every = Math.max(1, signature?.every || 3);
  const first = signature?.first || every;
  return round >= first && (round - first) % every === 0;
}

function signatureIntent(signature) {
  // A move that hits harder or leaves a status is a threat worth bracing for.
  const threat = signature.kind === "strike" && ((signature.mult || 1) >= 1.5 || Boolean(signature.status));
  return intent("signature", signature.label, { threat });
}

/**
 * Decide `mon`'s intent for the coming round. `rng` stands in for the rolls
 * the traits used to make on the monster's own turn.
 */
export function planIntent(mon, monsters, party, rng = Math.random) {
  const group = living(monsters);
  mon.intentRound = (mon.intentRound || 0) + 1;

  const release = releaseIntent(mon);
  if (release) return release;

  if (mon.fleeChance && rng() < mon.fleeChance) return intent("flee", "逃げ腰");

  // A lookout runs for help once an ally has fallen.
  const fallen = monsters.some(monster => monster && monster.hp <= 0 && !monster.fled && monster !== mon);
  if (hasTrait(mon, "evasive") && fallen && !mon.calledForHelp && group.length >= 1) {
    return intent("call", "仲間を呼ぶ", { threat: true });
  }

  // A guard by nature covers an ally about to strike or badly hurt.
  if (hasTrait(mon, "guardAdjacent")) {
    const charge = group.find(monster => monster !== mon && isQueued(monster));
    const hurt = group.filter(monster => monster !== mon && ratio(monster) < GUARD_HP_RATE).sort((a, b) => ratio(a) - ratio(b))[0];
    const ward = charge || hurt;
    if (ward) return intent("guard", "かばう", { targetIdx: monsters.indexOf(ward), detail: `かばう→${ward.name}` });
  }

  if (hasTrait(mon, "chargeAttack") && rng() < (mon.traitChance ?? 0.35)) return intent("charge", "力を溜める");
  if (hasTrait(mon, "summonAlly")) {
    const limit = mon.summon?.maxAllies ?? 5;
    if (((mon.turnCount || 0) + 1) % 3 === 0 && group.length < limit) return intent("summon", "召喚の詠唱");
  }
  if (hasTrait(mon, "multiAction") && !mon.multiActionQueued && rng() < (mon.traitChance ?? 0.35)) {
    return intent("multiAction", "凶暴化");
  }
  if (hasTrait(mon, "cleanseAlly") && rng() < (mon.traitChance ?? 0.35)) {
    const ward = group.find(monster => (monster.buffs || []).some(buff => buff.value < 0) || monster.status === "sleep");
    if (ward) return intent("cleanse", "祓う", { targetIdx: monsters.indexOf(ward), detail: `祓う→${ward.name}` });
  }
  if (hasTrait(mon, "drainMp") && rng() < (mon.traitChance ?? 0.25) && party.some(char => char.hp > 0 && char.mp > 0)) {
    return intent("drainMp", "魔力吸い");
  }
  if (hasTrait(mon, "silence") && rng() < (mon.traitChance ?? 0.25)) return intent("silence", "封呪");
  if (hasTrait(mon, "antiHeal") && rng() < (mon.traitChance ?? 0.3)) return intent("antiHeal", "回復封じ");
  if (hasTrait(mon, "buffPhysicalDef") && rng() < (mon.traitChance ?? 0.3)) return intent("buffDef", "守りを固める");
  if (hasTrait(mon, "buffMagicDef") && rng() < (mon.traitChance ?? 0.3)) return intent("buffMagic", "結界を張る");
  // A leader rallies whenever the group's attack is not already raised.
  if (hasTrait(mon, "buffAtk") && !group.some(monster => (monster.buffs || []).some(buff => buff.type === "atk" && buff.value > 0))) {
    return intent("rally", "号令");
  }

  const silenced = mon.silenceTurns > 0;
  if (!silenced && mon.spell && ["DIOS", "DIALMA"].includes(mon.spell)) {
    const ward = group.filter(monster => ratio(monster) < HEAL_SPELL_HP_RATE).sort((a, b) => ratio(a) - ratio(b))[0];
    if (ward) return intent("healSpell", "癒す", { targetIdx: monsters.indexOf(ward), detail: `癒す→${ward.name}` });
  }
  if (mon.isSniper && !mon.snipeQueued && rng() < (mon.traitChance ?? 0.35)) return intent("aim", "狙いを定める");
  if (!silenced && mon.spell && !["DIOS", "DIALMA"].includes(mon.spell) && mon.name !== "いにしえの竜" &&
      rng() < (mon.spellChance !== undefined ? mon.spellChance : 0.20)) {
    return QUEUED_SPELLS.has(mon.spell)
      ? intent("spell", "詠唱を始める")
      : intent("spell", SPELL_LABELS[mon.spell] || "呪文", { threat: true });
  }

  if (mon.signature && isSignatureRound(mon.signature, mon.intentRound)) return signatureIntent(mon.signature);
  return intent("attack", "攻撃");
}

/** Plan every living enemy's intent for the coming round of an ordinary fight. */
export function planEncounterIntents(state, rng = Math.random) {
  const combatState = state?.combatState;
  if (!isIntentEncounter(combatState)) return;
  const monsters = combatState.monsters || [];
  monsters.forEach(mon => {
    if (!mon || mon.hp <= 0 || mon.fled) {
      if (mon) mon.intent = null;
      return;
    }
    mon.intent = planIntent(mon, monsters, state.party || [], rng);
  });
}

/** The monster guarding `targetIdx` this round, if any. */
export function findIntentGuard(monsters, targetIdx) {
  const idx = monsters.findIndex(monster => monster && monster.hp > 0 && !monster.fled &&
    monster.intent?.kind === "guard" && monster.intent.targetIdx === targetIdx);
  return idx >= 0 ? { idx, mon: monsters[idx] } : null;
}
