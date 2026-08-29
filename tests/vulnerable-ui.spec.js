import { test, expect } from './fixtures/browser-health.js';
import { VIEWPORTS } from './ui-ux-helpers.js';

for (const viewport of VIEWPORTS) {
  test(`vulnerable enemy card explains its burst window at ${viewport.width}x${viewport.height} @visual`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');
    await page.evaluate(async () => {
      const { createSoloCharacter, state } = await import('/src/state.js');
      const { menuContext } = await import('/src/navigation.js');
      const { renderCombatOverlay } = await import('/src/combat_ui/combat_overlay.js');
      state.party = [createSoloCharacter('Fighter')];
      state.gameState = 'submenu';
      state.combatState = {
        phase: 'choose_actions',
        monsters: [{
          name: '脆弱検証モンスター', hp: 20, maxHp: 40, color: '#ffd166', status: 'ok',
          statusEffects: { vulnerable: { id: 'vulnerable', remainingTurns: 2, stacks: 1, source: 'VULNERA' } }
        }]
      };
      state.codex = { monsters: {} };
      menuContext.type = 'combat_target';
      menuContext.targetType = 'enemy';
      menuContext.prevGameState = 'combat';
      document.getElementById('combat-overlay').style.display = 'flex';
      renderCombatOverlay();
    });

    const status = page.locator('[data-status-effect="vulnerable"]');
    await expect(status).toHaveText(/脆弱：あと2回 \/ 次の直接攻撃×1\.25/);
    await expect(status).toBeVisible();
    const bounds = await status.boundingBox();
    expect(bounds?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(viewport.width);
  });
}
