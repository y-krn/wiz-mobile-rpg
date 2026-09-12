/* Measurement-only first-kill / kill-window decomposition. */

function finite(value) {
  return Number.isFinite(value) ? value : null;
}

function summarize(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) {
    return { count: 0, average: null, p25: null, p50: null, p75: null, p95: null, min: null, max: null };
  }
  const percentile = rate => {
    const position = (sorted.length - 1) * rate;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    return lower === upper
      ? sorted[lower]
      : sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  };
  return {
    count: sorted.length,
    average: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    p25: percentile(0.25),
    p50: percentile(0.50),
    p75: percentile(0.75),
    p95: percentile(0.95),
    min: sorted[0],
    max: sorted.at(-1)
  };
}

function createDistribution() {
  return [];
}

function add(values, value) {
  if (Number.isFinite(value)) values.push(value);
}

function createRecord() {
  return {
    encounters: 0,
    observedFirstKills: 0,
    noFirstKill: 0,
    firstKillRound: createDistribution(),
    firstKillActionOrdinal: createDistribution(),
    enemyActionsBeforeFirstKill: createDistribution(),
    enemyActionsAfterFirstKill: createDistribution(),
    playerActionsBeforeFirstKill: createDistribution(),
    playerActionsAfterFirstKill: createDistribution(),
    playerActionOpportunitiesBeforeFirstKill: createDistribution(),
    playerActionOpportunitiesAfterFirstKill: createDistribution(),
    preFirstKillRounds: createDistribution(),
    postFirstKillRounds: createDistribution(),
    livingEnemyCountInitial: createDistribution(),
    livingEnemyCountAtFirstKill: createDistribution(),
    livingEnemyCountFinal: createDistribution(),
    extraActionCount: createDistribution(),
    killTransitions: {},
    killerActors: {},
    firstKillTargets: {},
    extraActionSources: {},
    extraActionOwners: {}
  };
}

function increment(map, key, amount = 1) {
  if (!key) return;
  map[key] = (map[key] || 0) + amount;
}

function roundEvents(round) {
  return (round.enemyActionEvents || []).filter(event => event.executed === true);
}

function firstKill(rooms) {
  for (const round of rooms) {
    const event = (round.killEvents || []).find(kill => Number.isInteger(kill.actionOrdinal));
    if (event) return { round, event };
  }
  return null;
}

function countPlayerActions(rounds, predicate) {
  return rounds.filter(round => predicate(round) && round.playerActionExecuted === true).length;
}

function countPlayerOpportunities(rounds, predicate) {
  return rounds.filter(round => predicate(round)).length;
}

function deriveLivingTransitions(rounds, initialCount) {
  const transitions = [];
  let living = initialCount;
  for (const round of rounds) {
    for (const kill of round.killEvents || []) {
    const next = Math.max(0, living - 1);
      if (living > 0) {
        transitions.push({
          round: round.round,
          actionOrdinal: kill.actionOrdinal,
          from: living,
          to: next,
          kind: "kill",
          actorName: kill.actorName,
          targetName: kill.targetName
        });
      }
      living = next;
    }
    const summons = roundEvents(round).filter(event =>
      event.actionNames?.includes("仲間を呼ぶ")
    ).length;
    if (summons > 0) {
      transitions.push({
        round: round.round,
        actionOrdinal: null,
        from: living,
        to: living + summons,
        kind: "summon",
        actorName: roundEvents(round).find(event =>
          event.actionNames?.includes("仲間を呼ぶ")
        )?.monsterName || null,
        targetName: null
      });
      living += summons;
    }
  }
  return { transitions, final: living };
}

export function deriveFirstKillWindow({ identity, diagnostic }) {
  const rounds = diagnostic?.rounds || [];
  const initialCount = finite(diagnostic?.initialVisibleEnemyCount) ??
    finite(identity?.enemyNames?.length) ?? 0;
  const kill = firstKill(rounds);
  const allEnemyActions = rounds.flatMap(roundEvents);
  const extraActions = allEnemyActions.filter(event => event.extraMultiAction === true);
  const transitionInfo = deriveLivingTransitions(rounds, initialCount);
  const common = {
    initialVisibleEnemyCount: initialCount,
    finalLivingEnemyCount: finite(rounds.at(-1)?.livingEnemyCountAfter) ?? transitionInfo.final,
    livingEnemyCountTransitions: transitionInfo.transitions,
    extraActionCount: extraActions.length,
    extraActionSources: extraActions.length > 0 ? ["multiAction"] : [],
    extraActionOwners: [...new Set(extraActions.map(event => event.monsterName).filter(Boolean))]
  };
  if (!kill) {
    return {
      ...common,
      firstKillObserved: false,
      firstKillRound: null,
      firstKillActionOrdinal: null,
      firstKillActor: null,
      firstKillTarget: null,
      enemyActionsBeforeFirstKill: null,
      enemyActionsAfterFirstKill: null,
      playerActionsBeforeFirstKill: null,
      playerActionsAfterFirstKill: null,
      playerActionOpportunitiesBeforeFirstKill: null,
      playerActionOpportunitiesAfterFirstKill: null,
      preFirstKillRounds: null,
      postFirstKillRounds: null
    };
  }
  const killRoundIndex = rounds.indexOf(kill.round);
  const before = rounds.slice(0, killRoundIndex);
  const sameRoundBefore = roundEvents(kill.round).filter(event => event.order < kill.event.actionOrdinal);
  const sameRoundAfter = roundEvents(kill.round).filter(event => event.order > kill.event.actionOrdinal);
  const enemyBefore = before.flatMap(roundEvents).length + sameRoundBefore.length;
  const enemyAfter = sameRoundAfter.length + rounds.slice(killRoundIndex + 1).flatMap(roundEvents).length;
  const playerBeforePredicate = (round, index) => index < killRoundIndex ||
    (index === killRoundIndex && round.playerActionOrder <= kill.event.actionOrdinal);
  const playerAfterPredicate = (round, index) => index > killRoundIndex;
  const playerBeforeRounds = rounds.filter((round, index) => playerBeforePredicate(round, index));
  const playerAfterRounds = rounds.filter((round, index) => playerAfterPredicate(round, index));
  const livingAtKill = kill.round.livingEnemyCountBefore ?? Math.max(0, initialCount -
    rounds.slice(0, killRoundIndex).flatMap(round => round.killEvents || []).length);
  return {
    ...common,
    firstKillObserved: true,
    firstKillRound: kill.round.round,
    firstKillActionOrdinal: kill.event.actionOrdinal,
    firstKillActor: kill.event.actorName,
    firstKillTarget: kill.event.targetName,
    enemyActionsBeforeFirstKill: enemyBefore,
    enemyActionsAfterFirstKill: enemyAfter,
    playerActionsBeforeFirstKill: countPlayerActions(playerBeforeRounds, () => true),
    playerActionsAfterFirstKill: countPlayerActions(playerAfterRounds, () => true),
    playerActionOpportunitiesBeforeFirstKill: playerBeforeRounds.length,
    playerActionOpportunitiesAfterFirstKill: playerAfterRounds.length,
    preFirstKillRounds: killRoundIndex,
    postFirstKillRounds: Math.max(0, rounds.length - killRoundIndex - 1),
    livingEnemyCountAtFirstKill: livingAtKill
  };
}

export function createFirstKillAggregate() {
  return createRecord();
}

export function observeFirstKillWindow(record, window) {
  record.encounters++;
  if (!window.firstKillObserved) {
    record.noFirstKill++;
  } else {
    record.observedFirstKills++;
    add(record.firstKillRound, window.firstKillRound);
    add(record.firstKillActionOrdinal, window.firstKillActionOrdinal);
    add(record.enemyActionsBeforeFirstKill, window.enemyActionsBeforeFirstKill);
    add(record.enemyActionsAfterFirstKill, window.enemyActionsAfterFirstKill);
    add(record.playerActionsBeforeFirstKill, window.playerActionsBeforeFirstKill);
    add(record.playerActionsAfterFirstKill, window.playerActionsAfterFirstKill);
    add(record.playerActionOpportunitiesBeforeFirstKill, window.playerActionOpportunitiesBeforeFirstKill);
    add(record.playerActionOpportunitiesAfterFirstKill, window.playerActionOpportunitiesAfterFirstKill);
    add(record.preFirstKillRounds, window.preFirstKillRounds);
    add(record.postFirstKillRounds, window.postFirstKillRounds);
    add(record.livingEnemyCountAtFirstKill, window.livingEnemyCountAtFirstKill);
    increment(record.killerActors, window.firstKillActor);
    increment(record.firstKillTargets, window.firstKillTarget);
  }
  add(record.livingEnemyCountInitial, window.initialVisibleEnemyCount);
  add(record.livingEnemyCountFinal, window.finalLivingEnemyCount);
  add(record.extraActionCount, window.extraActionCount);
  for (const transition of window.livingEnemyCountTransitions || []) {
    increment(record.killTransitions, `${transition.from}->${transition.to}`);
  }
  for (const source of window.extraActionSources || []) increment(record.extraActionSources, source);
  for (const owner of window.extraActionOwners || []) increment(record.extraActionOwners, owner);
}

export function finalizeFirstKillAggregate(record) {
  return {
    encounters: record.encounters,
    observedFirstKills: record.observedFirstKills,
    firstKillObservationRate: record.encounters > 0
      ? record.observedFirstKills / record.encounters
      : null,
    noFirstKill: record.noFirstKill,
    firstKillRound: summarize(record.firstKillRound),
    firstKillActionOrdinal: summarize(record.firstKillActionOrdinal),
    enemyActionsBeforeFirstKill: summarize(record.enemyActionsBeforeFirstKill),
    enemyActionsAfterFirstKill: summarize(record.enemyActionsAfterFirstKill),
    playerActionsBeforeFirstKill: summarize(record.playerActionsBeforeFirstKill),
    playerActionsAfterFirstKill: summarize(record.playerActionsAfterFirstKill),
    playerActionOpportunitiesBeforeFirstKill: summarize(record.playerActionOpportunitiesBeforeFirstKill),
    playerActionOpportunitiesAfterFirstKill: summarize(record.playerActionOpportunitiesAfterFirstKill),
    preFirstKillRounds: summarize(record.preFirstKillRounds),
    postFirstKillRounds: summarize(record.postFirstKillRounds),
    livingEnemyCountInitial: summarize(record.livingEnemyCountInitial),
    livingEnemyCountAtFirstKill: summarize(record.livingEnemyCountAtFirstKill),
    livingEnemyCountFinal: summarize(record.livingEnemyCountFinal),
    extraActionCount: summarize(record.extraActionCount),
    killTransitions: { ...record.killTransitions },
    killerActors: { ...record.killerActors },
    firstKillTargets: { ...record.firstKillTargets },
    extraActionSources: { ...record.extraActionSources },
    extraActionOwners: { ...record.extraActionOwners }
  };
}
