/* Measurement-only aggregation for production enemy action cost. */

export const ENEMY_ACTION_COST_GROUPS = Object.freeze(["all", "single", "pair"]);

const ACTION_TRAIT_IDS = Object.freeze({
  "連続攻撃": "multiAction",
  "狙撃": "isSniper",
  "目眩まし狙撃": "blind_snipe",
  "毒喰らい": "poison_payoff",
  "自爆": "selfDestruct",
  "溜めて大打撃": "chargeAttack",
  "仲間を呼ぶ": "summonAlly",
  "状態異常を治す": "cleanseAlly",
  "MPを吸収": "drainMp",
  "沈黙": "silence",
  "回復を阻害": "antiHeal",
  "物理防御を強化": "buffPhysicalDef",
  "魔法防御を強化": "buffMagicDef",
  "仲間を鼓舞": "buffAtk"
});

const STATUS_IDS = Object.freeze([
  "poison",
  "paralyze",
  "sleep",
  "blind",
  "silence",
  "antiHeal"
]);

function distribution() {
  return [];
}

function add(values, value) {
  if (Number.isFinite(value)) values.push(value);
}

function summarize(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) {
    return { count: 0, average: null, p50: null, p95: null, min: null, max: null };
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
    p50: percentile(0.5),
    p95: percentile(0.95),
    min: sorted[0],
    max: sorted.at(-1)
  };
}

function sourceRecord() {
  return { actions: 0, damagingActions: 0, damage: 0, statusApplications: 0 };
}

function costRecord() {
  return {
    encounters: 0,
    deaths: 0,
    enemyActions: distribution(),
    damagingEnemyActions: distribution(),
    totalDamage: distribution(),
    statusDamage: distribution(),
    damagePerEnemyAction: distribution(),
    damagePerDamagingEnemyAction: distribution(),
    byAction: {},
    byTrait: {},
    byStatus: {},
    lethalActions: {}
  };
}

function observeSource(sourceMap, source, event, damage) {
  if (!source) return;
  const sourceRecordValue = sourceMap[source] ||= sourceRecord();
  sourceRecordValue.actions++;
  sourceRecordValue.damagingActions += Number(damage > 0);
  sourceRecordValue.damage += damage;
  sourceRecordValue.statusApplications += event.statusSources?.length || 0;
}

function observeRecord(record, { events, statusDamageEvents, outcome }) {
  const executed = events.filter(event => event.executed);
  const damaging = executed.filter(event => event.damage > 0);
  const directDamage = executed.reduce((sum, event) => sum + event.damage, 0);
  const statusDamage = statusDamageEvents.reduce((sum, event) => sum + event.damage, 0);
  const totalDamage = directDamage;
  record.encounters++;
  record.deaths += Number(outcome === "death");
  add(record.enemyActions, executed.length);
  add(record.damagingEnemyActions, damaging.length);
  add(record.totalDamage, totalDamage);
  add(record.statusDamage, statusDamage);
  add(record.damagePerEnemyAction, executed.length > 0 ? totalDamage / executed.length : null);
  add(record.damagePerDamagingEnemyAction, damaging.length > 0 ? totalDamage / damaging.length : null);

  executed.forEach(event => {
    const action = event.actionNames?.find(name => name !== "通常攻撃") ||
      event.actionNames?.at(-1) || "unclassified";
    observeSource(record.byAction, action, event, event.damage);
    (event.traitSources || []).forEach(trait =>
      observeSource(record.byTrait, trait, event, event.damage)
    );
    (event.statusSources || []).forEach(status => {
      const statusRecord = record.byStatus[status] ||= sourceRecord();
      statusRecord.actions++;
      statusRecord.damagingActions += Number(event.damage > 0);
      statusRecord.damage += event.damage;
      statusRecord.statusApplications++;
    });
    if (event.lethal) {
      const key = `${event.monsterName || "unknown"}:${action}`;
      const lethal = record.lethalActions[key] ||= {
        count: 0,
        damage: 0,
        monsterName: event.monsterName || null,
        action,
        traits: [...(event.traitSources || [])],
        statuses: [...(event.statusSources || [])]
      };
      lethal.count++;
      lethal.damage += event.damage;
    }
  });
  statusDamageEvents.forEach(event => {
    const status = event.statusSource || "unattributed-status";
    const statusRecord = record.byStatus[status] ||= sourceRecord();
    statusRecord.actions++;
    statusRecord.damagingActions++;
    statusRecord.damage += event.damage;
    if (event.lethal) {
      const key = `status:${status}`;
      const lethal = record.lethalActions[key] ||= {
        count: 0,
        damage: 0,
        monsterName: event.monsterName || null,
        action: "round-end-status",
        traits: [],
        statuses: [status]
      };
      lethal.count++;
      lethal.damage += event.damage;
    }
  });
}

function finalizeSourceMap(sourceMap) {
  return Object.fromEntries(Object.entries(sourceMap).map(([source, record]) => [source, {
    ...record,
    damagePerAction: record.actions > 0 ? record.damage / record.actions : null,
    damagePerDamagingAction: record.damagingActions > 0
      ? record.damage / record.damagingActions
      : null
  }]));
}

function finalizeRecord(record) {
  return {
    encounters: record.encounters,
    deaths: record.deaths,
    enemyActions: summarize(record.enemyActions),
    damagingEnemyActions: summarize(record.damagingEnemyActions),
    totalDamage: summarize(record.totalDamage),
    statusDamage: summarize(record.statusDamage),
    damagePerEnemyAction: summarize(record.damagePerEnemyAction),
    damagePerDamagingEnemyAction: summarize(record.damagePerDamagingEnemyAction),
    byAction: finalizeSourceMap(record.byAction),
    byTrait: finalizeSourceMap(record.byTrait),
    byStatus: finalizeSourceMap(record.byStatus),
    lethalActions: { ...record.lethalActions }
  };
}

export function createEnemyActionCostAggregate() {
  return {
    byEncounterOrdinal: Object.fromEntries([1, 2].map(ordinal => [String(ordinal),
      Object.fromEntries(ENEMY_ACTION_COST_GROUPS.map(group => [group, costRecord()]))
    ])),
    byEnemy: {},
    byAction: {},
    byTrait: {},
    byStatus: {},
    lethalActions: {},
    reconciliation: { encounters: 0, directDamage: 0, statusDamage: 0, totalDamage: 0 }
  };
}

export function observeEnemyActionCost(aggregate, {
  encounterOrdinal,
  rawInitialVisibleEnemyCount,
  outcome,
  events = [],
  statusDamageEvents = []
}) {
  const payload = { events, statusDamageEvents, outcome };
  const ordinal = String(encounterOrdinal);
  const groups = ["all", rawInitialVisibleEnemyCount >= 2 ? "pair" : "single"];
  groups.forEach(group => {
    const record = aggregate.byEncounterOrdinal[ordinal]?.[group];
    if (record) observeRecord(record, payload);
  });
  events.filter(event => event.executed).forEach(event => {
    const action = event.actionNames?.find(name => name !== "通常攻撃") ||
      event.actionNames?.at(-1) || "unclassified";
    observeSource(aggregate.byAction, action, event, event.damage);
    (event.traitSources || []).forEach(trait =>
      observeSource(aggregate.byTrait, trait, event, event.damage)
    );
    (event.statusSources || []).forEach(status => {
      const statusRecord = aggregate.byStatus[status] ||= sourceRecord();
      statusRecord.actions++;
      statusRecord.damagingActions += Number(event.damage > 0);
      statusRecord.damage += event.damage;
      statusRecord.statusApplications++;
    });
    if (event.lethal) {
      const key = `${event.monsterName || "unknown"}:${action}`;
      const lethal = aggregate.lethalActions[key] ||= {
        count: 0,
        damage: 0,
        monsterName: event.monsterName || null,
        action,
        traits: [...(event.traitSources || [])],
        statuses: [...(event.statusSources || [])]
      };
      lethal.count++;
      lethal.damage += event.damage;
    }
    if (event.monsterName) {
      const record = aggregate.byEnemy[event.monsterName] ||= costRecord();
      observeRecord(record, {
        events: [event],
        statusDamageEvents: [],
        outcome
      });
    }
  });
  const directDamage = events.reduce((sum, event) => sum + (event.damage || 0), 0);
  const statusDamage = statusDamageEvents.reduce((sum, event) => sum + (event.damage || 0), 0);
  statusDamageEvents.forEach(event => {
    const status = event.statusSource || "unattributed-status";
    const statusRecord = aggregate.byStatus[status] ||= sourceRecord();
    statusRecord.actions++;
    statusRecord.damagingActions++;
    statusRecord.damage += event.damage;
  });
  aggregate.reconciliation.encounters++;
  aggregate.reconciliation.directDamage += directDamage;
  aggregate.reconciliation.statusDamage += statusDamage;
  aggregate.reconciliation.totalDamage += directDamage + statusDamage;
}

export function finalizeEnemyActionCostAggregate(aggregate) {
  return {
    byEncounterOrdinal: Object.fromEntries(Object.entries(aggregate.byEncounterOrdinal)
      .map(([ordinal, groups]) => [ordinal, Object.fromEntries(
        Object.entries(groups).map(([group, record]) => [group, finalizeRecord(record)])
      )])),
    byEnemy: Object.fromEntries(Object.entries(aggregate.byEnemy)
      .map(([enemy, record]) => [enemy, finalizeRecord(record)])),
    byAction: finalizeSourceMap(aggregate.byAction),
    byTrait: finalizeSourceMap(aggregate.byTrait),
    byStatus: finalizeSourceMap(aggregate.byStatus),
    lethalActions: { ...aggregate.lethalActions },
    reconciliation: { ...aggregate.reconciliation }
  };
}

export function classifyEnemyStatusSource(value) {
  const text = String(value || "");
  return STATUS_IDS.find(status => text.toLowerCase().includes(status)) ||
    (text.includes("毒") ? "poison" : text.includes("麻痺") ? "paralyze" :
      text.includes("眠") ? "sleep" : text.includes("盲目") ? "blind" :
        text.includes("沈黙") ? "silence" : text.includes("回復阻害") ? "antiHeal" : null);
}

export function traitForEnemyAction(action) {
  return ACTION_TRAIT_IDS[action] || null;
}
