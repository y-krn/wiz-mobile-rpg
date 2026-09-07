import { test, expect } from './fixtures/browser-health.js';

test('combat spell cards expose tags and enter enemy targeting through the cast path @e2e', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await page.evaluate(async () => {
    const { state, createStartingKitCharacter } = await import('/src/state.js');
    const { combatSelection } = await import('/src/combat.js');
    const { updateUI } = await import('/src/ui.js');

    const caster = createStartingKitCharacter('arcana');
    caster.mp = caster.maxMp = 10;
    state.party = [caster];
    state.combatState = {
      phase: 'choose_actions',
      monsters: [{ name: '検証用モンスター', hp: 100, maxHp: 100, magicResist: 0, tags: [] }],
      roundNumber: 1,
      isAuto: false,
      pendingOutcome: null
    };
    state.map = [[{ walls: [false, false, false, false], type: 'empty' }]];
    state.visitedMap = [[true]];
    state.x = 0;
    state.y = 0;
    state.dir = 0;
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
  await expect(page.locator('#combat-overlay .combat-target-card.enemy')).toHaveCount(0);
  await expect(page.locator('#combat-overlay .combat-target-a11y')).toHaveCount(1);
  const point = await page.evaluate(async () => {
    const { getCombatMonsterLayout } = await import('/src/renderer.js');
    const rect = document.querySelector('#dungeon-canvas').getBoundingClientRect();
    const region = getCombatMonsterLayout((await import('/src/state.js')).state.combatState.monsters)[0].hitRegion;
    const scale = Math.min(rect.width / 400, rect.height / 260);
    return {
      x: (region.x + region.width / 2) * scale + (rect.width - 400 * scale) / 2,
      y: (region.y + region.height / 2) * scale + (rect.height - 260 * scale) / 2,
    };
  });
  await page.locator('#dungeon-canvas').click({ position: point });
  await expect(page.locator('#combat-overlay')).toBeHidden();
  await expect(page.locator('#combat-controls')).toBeVisible();
});
