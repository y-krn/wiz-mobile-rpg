import { test, expect } from '@playwright/test';

const TOWN_SUBMENUS = [
  ['castle_main', 'おしろ - 記録'],
  ['castle_death_logs', 'おしろ - 全滅ログ'],
  ['workshop_main', '工房 - 恒久アンロック'],
];

async function openTownSubmenu(page, type, title) {
  await page.evaluate(async ({ submenuType, submenuTitle }) => {
    const { state } = await import('/src/state.js');
    const { openSubmenu } = await import('/src/navigation.js');

    state.gameState = 'town';
    state.metaMaterials = { '獣の牙': 20, '鉄片': 10 };
    state.workshop = { ranks: {} };
    openSubmenu(submenuType, submenuTitle);
  }, { submenuType: type, submenuTitle: title });
}

async function readGoalLayout(page) {
  return page.locator('#goal-banner').evaluate((banner) => ({
    display: getComputedStyle(banner).display,
    height: banner.getBoundingClientRect().height,
    offsetHeight: banner.offsetHeight,
    mode: document.getElementById('game-container').classList.contains('town-submenu-mode'),
  }));
}

test('Town submenus hide the goal banner and expand the workshop list', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');

  for (const [type, title] of TOWN_SUBMENUS) {
    await openTownSubmenu(page, type, title);

    const layout = await readGoalLayout(page);
    expect(layout, `${type} should use town submenu mode`).toEqual({
      display: 'none',
      height: 0,
      offsetHeight: 0,
      mode: true,
    });

    if (type === 'workshop_main') {
      const workshopGrid = page.locator('#submenu-options.workshop-grid');
      const hiddenHeight = await workshopGrid.evaluate((grid) => grid.clientHeight);
      const visibleLayout = await workshopGrid.evaluate((grid) => {
        const container = document.getElementById('game-container');
        container.classList.remove('town-submenu-mode');
        const layout = {
          gridHeight: grid.clientHeight,
          bannerHeight: document.getElementById('goal-banner').getBoundingClientRect().height,
        };
        container.classList.add('town-submenu-mode');
        return layout;
      });

      const heightGain = hiddenHeight - visibleLayout.gridHeight;
      expect(visibleLayout.bannerHeight, 'Goal banner should occupy a compact HUD row').toBeGreaterThanOrEqual(45);
      expect(visibleLayout.bannerHeight, 'Goal banner height should stay near the observed 51px').toBeLessThanOrEqual(64);
      expect(heightGain, 'Workshop list should receive the banner height').toBeCloseTo(visibleLayout.bannerHeight, 0);
    }
  }
});

test('Town, departure, exploration, and combat keep the goal banner', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');

  const updateFor = async (gameState) => page.evaluate(async (nextGameState) => {
    const { state } = await import('/src/state.js');
    const { menuContext } = await import('/src/navigation.js');
    const { updateUI } = await import('/src/ui.js');

    state.gameState = nextGameState;
    state.currentRun = nextGameState === 'town' || nextGameState === 'submenu'
      ? null
      : { floorsVisited: [1], deepestFloor: 1 };
    state.combatState = nextGameState === 'combat'
      ? { phase: 'choose_actions', monsters: [], playerActions: [], isAuto: false }
      : null;
    menuContext.type = nextGameState === 'submenu' ? 'solo_start' : '';
    updateUI();
  }, gameState);

  for (const gameState of ['town', 'submenu', 'explore', 'combat']) {
    await updateFor(gameState);
    const layout = await readGoalLayout(page);
    expect(layout.display, `${gameState} goal banner should remain displayed`).not.toBe('none');
    expect(layout.height, `${gameState} goal banner should keep its height`).toBeGreaterThan(0);
    expect(layout.mode, `${gameState} should not use town submenu mode`).toBe(false);
  }
});
