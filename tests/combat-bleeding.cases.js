import { test, expect } from './fixtures/browser-health.js';
import { VIEWPORTS } from './ui-ux-helpers.js';

for (const viewport of VIEWPORTS) {
  test(`bleeding enemy status is observable on Canvas at ${viewport.width}x${viewport.height} @visual`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/?renderer=canvas');
    await page.evaluate(async () => {
      const { createStartingKitCharacter, state } = await import('/src/state.js');
      const { menuContext } = await import('/src/navigation.js');
      const { renderCombatOverlay } = await import('/src/combat_ui/combat_overlay.js');
      const { dungeonRenderer } = await import('/src/renderer.js');
      state.party = [createStartingKitCharacter('vanguard')];
      state.gameState = 'submenu';
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
      state.map = [[{ walls: [false, false, false, false], type: 'empty' }]];
      state.visitedMap = [[true]];
      state.x = 0;
      state.y = 0;
      state.dir = 0;
      menuContext.type = 'combat_target';
      menuContext.targetType = 'enemy';
      menuContext.prevGameState = 'combat';
      document.getElementById('combat-overlay').style.display = 'flex';
      renderCombatOverlay();
      const ctx = document.querySelector('#dungeon-canvas').getContext('2d');
      const labels = [];
      const originalFillText = ctx.fillText.bind(ctx);
      ctx.fillText = (text, ...args) => {
        labels.push(String(text));
        return originalFillText(text, ...args);
      };
      dungeonRenderer.draw();
      ctx.fillText = originalFillText;
      window.__bleedingLabels = labels;
    });

    const labels = await page.evaluate(() => window.__bleedingLabels);
    expect(labels).toContain('出血：あと2回 / 次の通常攻撃+1');
  });
}
