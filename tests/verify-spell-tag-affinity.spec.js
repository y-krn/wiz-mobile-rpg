import { test, expect } from '@playwright/test';

test('attack spells apply shared tag affinity through the real cast path', async ({ page }) => {
  await page.goto('/');

  const results = await page.evaluate(async () => {
    const { resolvePlayerSpell } = await import('/src/combat_logic/spell_resolution.js');

    const affixEquipment = (type, value) => ({
      weapon: {
        baseId: 'DAGGER',
        identified: true,
        affixes: [{ id: type, type, kind: 'support', value }]
      }
    });

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

    return {
      mageHalitoUndead: cast({ spellName: 'HALITO', className: 'Mage', tags: ['undead'] }),
      mageHalitoUndeadWithAffinity: cast({
        spellName: 'HALITO',
        className: 'Mage',
        tags: ['undead'],
        equipment: affixEquipment('antiUndead', 20)
      }),
      mageHalitoDragonWithAffinity: cast({
        spellName: 'HALITO',
        className: 'Mage',
        tags: ['dragon'],
        equipment: affixEquipment('antiDragon', 20)
      }),
      mageHalitoDemonWithAffinity: cast({
        spellName: 'HALITO',
        className: 'Mage',
        tags: ['demon'],
        equipment: affixEquipment('antiDemon', 20)
      }),
      badiosUndead: cast({ spellName: 'BADIOS', className: 'Priest', tags: ['undead'], randomValue: 0.1 }),
      badiosUndeadWithHolyBand: cast({
        spellName: 'BADIOS',
        className: 'Priest',
        tags: ['undead'],
        equipment: { accessory: 'HOLY_BAND' }
      }),
      badiosMultiTag: cast({
        spellName: 'BADIOS',
        className: 'Priest',
        tags: ['undead', 'demon']
      }),
      badiosSpiritWithAffinity: cast({
        spellName: 'BADIOS',
        className: 'Priest',
        tags: ['spirit'],
        equipment: affixEquipment('antiSpirit', 50)
      })
    };
  });

  expect(results.mageHalitoUndead.damage).toBe(14);
  expect(results.mageHalitoUndeadWithAffinity.damage).toBe(17);
  expect(results.mageHalitoDragonWithAffinity.damage).toBe(17);
  expect(results.mageHalitoDemonWithAffinity.damage).toBe(17);

  expect(results.badiosUndead.damage).toBe(15);
  expect(results.badiosUndead.spellHit.formula.targetTagBonus).toBe(70);
  expect(results.badiosUndead.targetedBonuses).toHaveLength(1);
  expect(results.badiosUndead.targetedBonuses[0]).toMatchObject({
    type: 'targetTag',
    before: 9,
    after: 15,
    tagBonus: 70
  });

  expect(results.badiosUndeadWithHolyBand.damage).toBe(15);
  expect(results.badiosUndeadWithHolyBand.spellHit.formula.targetTagBonus).toBe(90);

  expect(results.badiosMultiTag.damage).toBe(16);
  expect(results.badiosMultiTag.spellHit.formula.targetTagBonus).toBe(100);
  expect(results.badiosMultiTag.targetedBonuses).toHaveLength(1);
  expect(results.badiosMultiTag.targetedBonuses[0].targetTags).toEqual(['undead', 'demon']);

  expect(results.badiosSpiritWithAffinity.damage).toBe(14);
  expect(results.badiosSpiritWithAffinity.spellHit.formula.targetTagBonus).toBe(0);
});
