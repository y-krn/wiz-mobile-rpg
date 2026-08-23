import assert from 'node:assert/strict';

global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

const { resolvePlayerSpell } = await import('../src/combat_logic/spell_resolution.js');

function affixEquipment(type, value) {
  return {
    weapon: {
      baseId: 'DAGGER',
      identified: true,
      affixes: [{ id: type, type, kind: 'support', value }]
    }
  };
}

function cast({ spellName, className, tags, equipment = {}, randomValue = 0 }) {
  const caster = {
    name: className,
    class: className,
    level: 1,
    hp: 30,
    maxHp: 30,
    mp: 10,
    maxMp: 10,
    status: 'ok',
    int: 10,
    pie: 10,
    equipment,
    spells: [spellName]
  };
  const monster = {
    name: 'Target',
    hp: 100,
    maxHp: 100,
    def: 0,
    tags,
    magicResist: 0,
    color: '#fff'
  };
  const state = {
    party: [caster],
    floor: 1,
    currentRun: { deathLogs: [] },
    combatState: { turn: 1 },
    combatFormulaTelemetry: { spellHits: [], targetedBonuses: [] }
  };
  const originalRandom = Math.random;
  Math.random = () => randomValue;
  try {
    resolvePlayerSpell(caster, { spellName, targetIdx: 0 }, state, [monster], []);
  } finally {
    Math.random = originalRandom;
  }
  return {
    damage: 100 - monster.hp,
    targetedBonuses: state.combatFormulaTelemetry.targetedBonuses,
    spellHit: state.combatFormulaTelemetry.spellHits[0]
  };
}

const mageHalitoUndead = cast({ spellName: 'HALITO', className: 'Mage', tags: ['undead'] });
assert.equal(mageHalitoUndead.damage, 14);
assert.equal(
  cast({
    spellName: 'HALITO',
    className: 'Mage',
    tags: ['undead'],
    equipment: affixEquipment('antiUndead', 20)
  }).damage,
  17
);
assert.equal(
  cast({
    spellName: 'HALITO',
    className: 'Mage',
    tags: ['dragon'],
    equipment: affixEquipment('antiDragon', 20)
  }).damage,
  17
);
assert.equal(
  cast({
    spellName: 'HALITO',
    className: 'Mage',
    tags: ['demon'],
    equipment: affixEquipment('antiDemon', 20)
  }).damage,
  17
);

const badiosUndead = cast({ spellName: 'BADIOS', className: 'Priest', tags: ['undead'], randomValue: 0.1 });
assert.equal(badiosUndead.damage, 15);
assert.equal(badiosUndead.spellHit.formula.targetTagBonus, 70);
assert.equal(badiosUndead.targetedBonuses.length, 1);
assert.deepEqual({
  type: badiosUndead.targetedBonuses[0].type,
  before: badiosUndead.targetedBonuses[0].before,
  after: badiosUndead.targetedBonuses[0].after,
  tagBonus: badiosUndead.targetedBonuses[0].tagBonus,
  targetTags: badiosUndead.targetedBonuses[0].targetTags
}, {
  type: 'targetTag',
  before: 9,
  after: 15,
  tagBonus: 70,
  targetTags: ['undead']
});

const badiosUndeadWithHolyBand = cast({
  spellName: 'BADIOS',
  className: 'Priest',
  tags: ['undead'],
  equipment: { accessory: 'HOLY_BAND' }
});
assert.equal(badiosUndeadWithHolyBand.damage, 15);
assert.equal(badiosUndeadWithHolyBand.spellHit.formula.targetTagBonus, 90);

const badiosMultiTag = cast({ spellName: 'BADIOS', className: 'Priest', tags: ['undead', 'demon'] });
assert.equal(badiosMultiTag.damage, 16);
assert.equal(badiosMultiTag.spellHit.formula.targetTagBonus, 100);
assert.equal(badiosMultiTag.targetedBonuses.length, 1);
assert.deepEqual(badiosMultiTag.targetedBonuses[0].targetTags, ['undead', 'demon']);

const badiosSpiritWithAffinity = cast({
  spellName: 'BADIOS',
  className: 'Priest',
  tags: ['spirit'],
  equipment: affixEquipment('antiSpirit', 50)
});
assert.equal(badiosSpiritWithAffinity.damage, 14);
assert.equal(badiosSpiritWithAffinity.spellHit.formula.targetTagBonus, 0);

console.log('spell tag affinity cast-path formula checks passed');
