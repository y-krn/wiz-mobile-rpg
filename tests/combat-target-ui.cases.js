import { test, expect } from './fixtures/browser-health.js';

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

async function installCombat(page, partyFactory) {
  await page.goto('/');
  await page.evaluate(async (partyClasses) => {
    const { state, createSoloCharacter } = await import('/src/state.js');
    const { menuContext } = await import('/src/navigation.js');
    const { combatSelection } = await import('/src/combat.js');
    const { updateUI } = await import('/src/ui.js');

    state.party = partyClasses.map(className => createSoloCharacter(className));
    state.combatState = {
      phase: 'choose_actions',
      monsters: [
        { name: '対象A', hp: 100, maxHp: 100, magicResist: 0, tags: [] },
        { name: '対象B', hp: 80, maxHp: 80, magicResist: 0, tags: [] },
      ],
      roundNumber: 1,
      isAuto: false,
      pendingOutcome: null,
    };
    state.gameState = 'combat';
    state.transitioning = false;
    Object.assign(menuContext, {
      type: '',
      targetType: '',
      actorIdx: -1,
      spellName: '',
      prevGameState: null,
    });
    combatSelection.charIdx = 0;
    combatSelection.actions = [];
    updateUI();
  }, partyFactory);
}
for (const viewport of VIEWPORTS) {
  test(`攻撃から Action Dock の敵対象を選んで行動を確定できる (${viewport.width}px) @e2e @smoke`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await installCombat(page, ['Fighter', 'Mage']);

    await page.locator('#btn-combat-fight').click();
    const overlay = page.locator('#combat-overlay');
    await expect(overlay).toBeVisible();
    await expect(overlay.locator('.combat-target-card.enemy:not(.dead)')).toHaveCount(2);

    const target = overlay.locator('.combat-target-card.enemy:not(.dead)').first();
    const metrics = await target.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        viewportWidth,
        viewportHeight,
        parentId: element.closest('#combat-overlay')?.parentElement?.id,
      };
    });
    expect(metrics.parentId).toBe('controls-panel');
    expect(metrics.left).toBeGreaterThanOrEqual(0);
    expect(metrics.right).toBeLessThanOrEqual(metrics.viewportWidth);
    expect(metrics.top).toBeGreaterThanOrEqual(0);
    expect(metrics.bottom).toBeLessThanOrEqual(metrics.viewportHeight);

    await target.click();
    await expect(overlay).toBeHidden();
    await expect(page.locator('#combat-controls')).toBeVisible();
    await expect.poll(() => page.evaluate(async () => {
      const { combatSelection } = await import('/src/combat.js');
      return combatSelection.actions[0];
    })).toMatchObject({ type: 'fight', actorIdx: 0, targetIdx: 0 });
  });

  test(`単体魔法から Action Dock の敵対象を選んで行動を確定できる (${viewport.width}px) @e2e @smoke`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await installCombat(page, ['Mage', 'Fighter']);
    await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      state.party[0].mp = state.party[0].maxMp = 10;
      state.party[0].spells = ['HALITO'];
    });

    await page.locator('#btn-combat-spell').click();
    const halito = page.locator('#combat-overlay .combat-item-card.spell', {
      has: page.locator('.spell-name', { hasText: /^HALITO$/ }),
    });
    await expect(halito).toBeVisible();
    await halito.click();

    const target = page.locator('#combat-overlay .combat-target-card.enemy:not(.dead)').first();
    await expect(target).toBeVisible();
    await target.click();
    await expect(page.locator('#combat-overlay')).toBeHidden();
    await expect.poll(() => page.evaluate(async () => {
      const { combatSelection } = await import('/src/combat.js');
      return combatSelection.actions[0];
    })).toMatchObject({ type: 'spell', actorIdx: 0, targetIdx: 0, spellName: 'HALITO' });
  });
}
