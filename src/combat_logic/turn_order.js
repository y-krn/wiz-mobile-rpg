import { getCharAffixSum } from "../data.js";
import { getBuffTotal } from "./status_effects.js";
import { hasTrait } from "./monster_traits.js";
import { getCharacterEquipmentLoadModifier } from "../rules/equipment_load.js";

function resolveInitiativeRoll(modifier = 0, rng = Math.random) {
  const roll = rng();
  const bucket = Math.floor(roll * 20);
  return {
    speed: bucket + modifier,
    // Reuse the fractional part so initiative still consumes one RNG sample
    // per actor, matching the old combat RNG boundary.
    tieBreak: roll * 20 - bucket
  };
}

function resolveTurnInitiative(state, actorType, character = null, rng = Math.random, policy = null) {
  const measurement = policy?.measurementInitiative;
  if (measurement) {
    const rollSize = Number.isInteger(measurement.rollSize) && measurement.rollSize > 0
      ? measurement.rollSize
      : 20;
    const roll = rng() * rollSize;
    const bucket = Math.floor(roll);
    const speed = actorType === "char"
      ? bucket + (Number(measurement.playerLoadModifier) || 0) +
        (Number(measurement.playerFirstStrikeModifier) || 0) +
        getBuffTotal(character, "firstStrike") + getCharAffixSum(character, "firstStrike")
      : bucket + (Number(measurement.enemySpeedModifier) || 0);
    return { speed, tieBreak: roll - bucket };
  }

  const initiative = resolveInitiativeRoll(
    actorType === "char" ? getCharacterEquipmentLoadModifier(character) : 0,
    rng
  );
  return {
    speed: actorType === "char"
      ? initiative.speed + getBuffTotal(character, "firstStrike") + getCharAffixSum(character, "firstStrike")
      : initiative.speed,
    tieBreak: initiative.tieBreak
  };
}

export function buildCombatTurnQueue(
  state,
  combatSelection,
  logQueue,
  { rng = Math.random, policy = null, measurement = null } = {}
) {
  const monsters = state.combatState.monsters;
  const roundNumber = state.combatState.roundNumber || 1;
  const turns = [];

  // Characters
  state.party.forEach((char, idx) => {
    if (char.status !== "dead") {
      const chosen = combatSelection.actions.find(a => a.actorIdx === idx);
      const initiative = resolveTurnInitiative(state, "char", char, rng, policy);
      turns.push({
        type: "char",
        char,
        idx,
        speed: initiative.speed,
        tieBreak: initiative.tieBreak,
        action: chosen || { type: "defend", actorIdx: idx }
      });
    }
  });

  // Monsters
  monsters.forEach((mon, idx) => {
    if (mon.hp > 0) {
      const initiative = resolveTurnInitiative(state, "monster", null, rng, policy);
      turns.push({
        type: "monster",
        mon,
        idx,
        speed: initiative.speed,
        tieBreak: initiative.tieBreak,
        measurementExtraMultiAction: false,
        measurementSharedNormalSlot: false
      });
      if (hasTrait(mon, "multiAction") && mon.multiActionQueued && policy?.measurementMaxActionsPerEnemy !== 1) {
        turns.push({
          type: "monster",
          mon,
          idx,
          speed: initiative.speed - 1,
          tieBreak: Math.max(0, initiative.tieBreak - Number.EPSILON),
          measurementExtraMultiAction: true,
          measurementSharedNormalSlot: false
        });
      }
    }
  });

  // Sort by Speed descending
  // Equal initiative is a real outcome. A random tie-break keeps neither side
  // on a hidden permanent priority; stable insertion order is the explicit
  // final fallback when random values are exactly identical.
  turns.sort((a, b) => (b.speed - a.speed) || (b.tieBreak - a.tieBreak));
  const measurementSharedNormalEnemyActionSlot =
    policy?.measurementSharedNormalEnemyActionSlot === true;
  const measurementDisableSharedNormalEnemyActionSlot =
    policy?.measurementDisableSharedNormalEnemyActionSlot === true;
  const ordinaryEncounter = state.combatState?.isBoss !== true &&
    state.combatState?.isMidboss !== true &&
    state.combatState?.isRoamingFlack !== true;
  const productionSharedNormalEnemyActionSlot = ordinaryEncounter && (
    state.combatState?.enemyActionScheduling === "shared-normal-slot" ||
    (!policy &&
      state.combatState?.isBoss === false &&
      state.combatState?.isMidboss === false &&
      state.combatState?.isRoamingFlack === false)
  );
  // Exact shared ordinary-slot rule. Every living
  // enemy still rolls initiative, but only the first ordinary enemy turn in
  // the resolved order owns the shared slot for this round. Its explicit
  // trait-generated extra action remains attached to that actor; it is not an
  // additional ordinary slot or a banked turn for another actor.
  if (ordinaryEncounter && !measurementDisableSharedNormalEnemyActionSlot &&
      (measurementSharedNormalEnemyActionSlot || productionSharedNormalEnemyActionSlot)) {
    const slotOwner = turns.find(turn =>
      turn.type === "monster" && !turn.measurementExtraMultiAction
    )?.idx;
    const ordinaryEnemyCount = new Set(turns
      .filter(turn => turn.type === "monster" && !turn.measurementExtraMultiAction)
      .map(turn => turn.idx)).size;
    if (slotOwner !== undefined && ordinaryEnemyCount > 1) {
      logQueue.push({ msg: "[ 敵 ] 敵は連携して通常行動を1回にまとめた。" });
    }
    for (let index = 0; index < turns.length; index++) {
      const turn = turns[index];
      if (turn.type !== "monster") continue;
      if (turn.idx !== slotOwner) {
        turns[index] = null;
        continue;
      }
      turn.measurementSharedNormalSlot = true;
    }
    turns.splice(0, turns.length, ...turns.filter(Boolean));
  }
  // Existing upper-bound measurement cap. The cap applies to total monster
  // turns, so it includes ordinary actions and trait-generated extra actions
  // alike while preserving the original monster objects, traits, and
  // composition.
  const maxEnemyActionsPerRound = policy?.measurementMaxEnemyActionsPerRound;
  if (Number.isInteger(maxEnemyActionsPerRound) && maxEnemyActionsPerRound >= 0) {
    let remainingEnemyActions = maxEnemyActionsPerRound;
    for (let index = 0; index < turns.length; index++) {
      if (turns[index].type !== "monster") continue;
      if (remainingEnemyActions > 0) {
        remainingEnemyActions--;
      } else {
        turns[index] = null;
      }
    }
    turns.splice(0, turns.length, ...turns.filter(Boolean));
  }
  if (measurement?.measurementEnemyTurnEvents) {
    turns.forEach(turn => {
      if (turn.type === "monster") {
        measurement.measurementEnemyTurnEvents.push({
          round: roundNumber,
          monster: turn.mon.name,
          extraMultiAction: Boolean(turn.measurementExtraMultiAction),
          sharedNormalSlot: Boolean(turn.measurementSharedNormalSlot)
        });
      }
    });
  }
  const firstMonsterIndex = turns.findIndex(turn => turn.type === "monster");
  turns.forEach((turn, index) => {
    if (turn.type === "char") {
      turn.char.combatFirstStrikeActive = roundNumber === 1
        && (firstMonsterIndex === -1 || index < firstMonsterIndex);
    }
  });

  return turns;
}
