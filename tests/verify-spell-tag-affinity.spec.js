import { test, expect } from './fixtures/browser-health.js';

test('combat spell cards expose tags and enter enemy targeting through the cast path @e2e', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await page.evaluate(async () => {
    const { state, createSoloCharacter } = await import('/src/state.js');
    const { combatSelection } = await import('/src/combat.js');
    const { updateUI } = await import('/src/ui.js');

    const caster = createSoloCharacter('Mage');
    caster.mp = caster.maxMp = 10;
    caster.spells = ['HALITO'];
    state.party = [caster];
    state.combatState = {
      phase: 'choose_actions',
      monsters: [{ name: '検証用モンスター', hp: 100, maxHp: 100, magicResist: 0, tags: [] }],
      roundNumber: 1,
      isAuto: false,
      pendingOutcome: null
    };
    state.gameState = 'combat';
    state.transitioning = false;
    combatSelection.charIdx = 0;
    combatSelection.actions = [];
    updateUI();
  });

  await page.locator('#btn-combat-spell').click();
  const halito = page.locator('#combat-overlay .combat-item-card.spell', {
    has: page.locator('.spell-name', { hasText: /^HALITO$/ })
  });
  await expect(halito).toBeVisible();
  await expect(halito.locator('.spell-tag')).toHaveText('単体');

  await halito.click();
  await expect(page.locator('#combat-overlay .combat-target-card.enemy')).toHaveCount(1);
  await expect(page.locator('#combat-overlay .combat-target-card.enemy')).toContainText('検証用モンスター');

  await page.locator('#combat-overlay .combat-target-card.enemy').click();
  await expect(page.locator('#combat-overlay')).toBeHidden();
  await expect(page.locator('#combat-controls')).toBeVisible();
});
