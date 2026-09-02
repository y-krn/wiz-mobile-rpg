import { test, expect } from './fixtures/browser-health.js';

test.describe('Common UI vNext shell @smoke', () => {
  test('exposes the four shell regions and preserves unresolved events at 320x568', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/');
    await page.evaluate(async () => {
      const { state, createDefaultCurrentRun, createSoloCharacter } = await import('/src/state.js');
      const { updateUI, openLogOverlay } = await import('/src/ui.js');
      state.party = [createSoloCharacter('Mage')];
      state.currentRun = createDefaultCurrentRun();
      state.currentRun.eventObservations = {
        'trap:1:3:3': {
          key: 'trap:1:3:3',
          scope: 'trap:1',
          text: '【痕跡】隣接する床に罠の気配がある。',
          lifecycle: 'active',
        },
      };
      state.gameState = 'explore';
      state.transitioning = false;
      state.logs = [
        '【痕跡】隣接する床に罠の気配がある。',
        ...Array.from({ length: 20 }, (_, index) => `通常ログ ${index + 1}`),
      ];
      updateUI();
      openLogOverlay();
    });

    const shell = await page.evaluate(() => {
      const regions = Array.from(document.querySelectorAll('[data-shell-region]'))
        .map(element => element.dataset.shellRegion);
      const dock = document.querySelector('#controls-panel');
      const rect = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
      return {
        regions,
        dockState: dock.dataset.dockState,
        unresolved: document.querySelectorAll('#log-content [data-event-kind="unresolved"]').length,
        unresolvedText: document.querySelector('#log-content [data-event-kind="unresolved"]')?.textContent,
        historyLines: document.querySelectorAll('#log-overlay-body .log-entry').length,
        buttons: Array.from(document.querySelectorAll('#explore-controls button'))
          .filter(button => getComputedStyle(button).display !== 'none')
          .map(button => rect(`#${button.id}`).height),
        viewportWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      };
    });

    expect(shell.regions).toEqual(expect.arrayContaining([
      'minimal-hud', 'dungeon-view', 'current-event-strip', 'action-dock',
    ]));
    expect(shell.dockState).toBe('compact');
    expect(shell.unresolved).toBe(1);
    expect(shell.unresolvedText).toContain('未解決');
    expect(shell.historyLines).toBe(21);
    expect(shell.buttons.length).toBeGreaterThan(0);
    expect(shell.buttons.every(height => height >= 44)).toBe(true);
    expect(shell.scrollWidth).toBeLessThanOrEqual(shell.viewportWidth + 1);
  });

  test('uses the same Dock state contract for decision and expanded screens', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const states = await page.evaluate(async () => {
      const { state, createDefaultCurrentRun, createSoloCharacter } = await import('/src/state.js');
      const { menuContext } = await import('/src/navigation.js');
      const { updateUI } = await import('/src/ui.js');
      state.party = [createSoloCharacter('Mage')];
      state.currentRun = createDefaultCurrentRun();
      state.transitioning = false;
      state.combatState = { phase: 'choose_actions', monsters: [{ name: '検証敵', hp: 1, maxHp: 1 }] };
      const result = {};
      for (const [name, gameState, type] of [
        ['combat', 'combat', ''],
        ['submenu', 'submenu', 'item_inventory'],
      ]) {
        state.gameState = gameState;
        menuContext.type = type;
        menuContext.prevGameState = gameState === 'submenu' ? 'explore' : null;
        updateUI();
        result[name] = {
          dockState: document.querySelector('#controls-panel').dataset.dockState,
          backRole: document.querySelector('#btn-submenu-back').dataset.actionRole,
        };
      }
      return result;
    });

    expect(states.combat.dockState).toBe('decision');
    expect(states.submenu.dockState).toBe('expanded');
    expect(states.submenu.backRole).toBe('back');
  });

  test('marks Town and Dungeon item ownership in the shared Bag row contract', async ({ page }) => {
    await page.goto('/');
    const ownership = await page.evaluate(async () => {
      const { state, createDefaultCurrentRun } = await import('/src/state.js');
      const { renderItemInventory } = await import('/src/menu/explore_actions.js');
      const townItem = { baseId: 'HEAL_POTION', instanceId: 'town-1' };
      const dungeonItem = { baseId: 'GREATER_HEAL', instanceId: 'dungeon-1' };
      state.currentRun = createDefaultCurrentRun();
      state.currentRun.townInventory = [townItem];
      state.currentRun.unbankedObjectLoot = [{ id: 'loot-1', item: dungeonItem }];
      state.inventory = [townItem, dungeonItem];
      const grid = document.createElement('div');
      renderItemInventory(grid);
      return Array.from(grid.querySelectorAll('button')).map(button => ({
        ownership: button.dataset.ownership,
        badge: button.parentElement.querySelector('.ownership-badge')?.textContent,
      }));
    });

    expect(ownership).toEqual([
      { ownership: 'town-confirmed', badge: '街から持込・確定済み' },
      { ownership: 'dungeon-unconfirmed', badge: '迷宮で取得・未確定' },
    ]);
  });

  test('does not guess ownership for duplicate primitive items', async ({ page }) => {
    await page.goto('/');
    const ownership = await page.evaluate(async () => {
      const { state, createDefaultCurrentRun } = await import('/src/state.js');
      const { renderItemInventory } = await import('/src/menu/explore_actions.js');
      state.currentRun = createDefaultCurrentRun();
      state.currentRun.townInventory = ['HEAL_POTION'];
      state.currentRun.unbankedObjectLoot = [{ id: 'loot-primitive', item: 'HEAL_POTION' }];
      state.inventory = ['HEAL_POTION', 'HEAL_POTION'];
      const grid = document.createElement('div');
      renderItemInventory(grid);
      return Array.from(grid.querySelectorAll('button[data-ownership]')).map(button => ({
        ownership: button.dataset.ownership,
        badge: button.parentElement.querySelector('.ownership-badge')?.textContent,
      }));
    });

    expect(ownership).toEqual([
      { ownership: 'ambiguous', badge: '所有元不明・要確認' },
      { ownership: 'ambiguous', badge: '所有元不明・要確認' },
    ]);
  });
});
