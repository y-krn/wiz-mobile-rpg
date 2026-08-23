import { test, expect } from './fixtures/browser-health.js';
import { VIEWPORTS } from './ui-ux-helpers.js';

for (const viewport of VIEWPORTS) {
  test(`bleeding enemy card is observable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');
    await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const { menuContext } = await import('/src/navigation.js');
      const { renderCombatOverlay } = await import('/src/combat_ui/combat_overlay.js');
      state.gameState = 'combat';
      state.combatState = {
        phase: 'choose_actions',
        monsters: [{
          name: '出血検証モンスター', hp: 20, maxHp: 40, color: '#ff3b30',
          status: 'ok',
          statusEffects: {
            bleeding: { id: 'bleeding', remainingTurns: 2, stacks: 1, source: 'bleedingAtk' }
          }
        }]
      };
      state.codex = { monsters: {} };
      menuContext.type = 'combat_target';
      menuContext.targetType = 'enemy';
      document.getElementById('combat-overlay').style.display = 'flex';
      renderCombatOverlay();
    });

    const status = page.locator('[data-status-effect="bleeding"]');
    await expect(status).toHaveText(/出血：あと2回 \/ 次の通常攻撃\+1/);
    await expect(status).toBeVisible();
    const bounds = await status.boundingBox();
    expect(bounds?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(viewport.width);
  });
}
