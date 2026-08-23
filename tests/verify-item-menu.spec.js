import { test, expect } from './fixtures/browser-health.js';

const VIEWPORTS = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

for (const viewport of VIEWPORTS) {
  test(`item menus filter, sort, and preserve inventory indexes at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(async () => {
      const { createSoloCharacter, state } = await import('/src/state.js');
      const { menuContext } = await import('/src/navigation.js');
      const { renderItemInventory } = await import('/src/menu/explore_actions.js');
      const { renderCombatOverlay } = await import('/src/combat_ui/combat_overlay.js');
      const { combatCallbacks } = await import('/src/combat_ui/combat_state.js');
      const { dungeonRenderer } = await import('/src/renderer.js');
      const { updateUI } = await import('/src/ui.js');

      state.party = [createSoloCharacter('Fighter')];
      state.party[0].hp = 1;
      state.gameState = 'explore';
      state.combatState = null;
      state.chestState = null;
      state.inventory = [
        'DAGGER',
        'TOWN_PORTAL',
        'HEAL_POTION',
        'ANTIDOTE',
        'HEAL_POTION',
        'STR_POTION',
        'NOISE_BALL',
        'GREATER_HEAL',
        'MANA_POTION',
      ];

      const grid = document.createElement('div');
      renderItemInventory(grid);
      const labels = Array.from(grid.querySelectorAll('button')).map(button => button.textContent);
      const greaterButton = Array.from(grid.querySelectorAll('button')).find(button => button.textContent === '上薬');
      greaterButton?.click();
      const exploreSelection = {
        itemKey: menuContext.itemKey,
        itemIdx: menuContext.itemIdx,
      };
      document.querySelector('#submenu-options button:not([disabled])')?.click();
      const afterExploreUse = [...state.inventory];

      state.gameState = 'submenu';
      state.combatState = { phase: 'choose_actions', monsters: [] };
      state.inventory = [
        'DAGGER',
        'TOWN_PORTAL',
        'HEAL_POTION',
        'ANTIDOTE',
        'HEAL_POTION',
        'STR_POTION',
        'NOISE_BALL',
        'GREATER_HEAL',
        'MANA_POTION',
      ];
      menuContext.type = 'combat_item';
      let combatSelection;
      combatCallbacks.activeItemCallback = (...args) => {
        combatSelection = args;
      };
      renderCombatOverlay();
      const combatCards = Array.from(document.querySelectorAll('#combat-overlay .combat-item-card.item'));
      const combatLabels = combatCards.map(card => card.querySelector('.item-card-title')?.textContent);
      combatCards.find(card => card.querySelector('.item-card-title')?.textContent === '上薬')?.click();

      state.gameState = 'submenu';
      menuContext.type = 'item_inventory';
      updateUI();
      const visibility = dungeonRenderer.getSceneVisibility();
      const eventMode = document.querySelector('#game-container').classList.contains('event-mode');

      return {
        labels,
        exploreSelection,
        afterExploreUse,
        combatLabels,
        combatSelection,
        visibility,
        eventMode,
      };
    });

    expect(result.labels).toEqual([
      '傷薬 (ディオス薬)',
      '傷薬 (ディオス薬)',
      '上薬',
      '魔力草',
      '解毒薬',
      '剛力の薬',
      '鳴らし玉',
      '帰還の翼',
    ]);
    expect(result.exploreSelection).toEqual({ itemKey: 'GREATER_HEAL', itemIdx: 7 });
    expect(result.afterExploreUse).toEqual([
      'DAGGER',
      'TOWN_PORTAL',
      'HEAL_POTION',
      'ANTIDOTE',
      'HEAL_POTION',
      'STR_POTION',
      'NOISE_BALL',
      'MANA_POTION',
    ]);
    expect(result.combatLabels).toEqual(result.labels);
    expect(result.combatSelection).toEqual(['GREATER_HEAL', 7]);
    expect(result.visibility.showItemMenu).toBe(true);
    expect(result.visibility.showEventScene).toBe(false);
    expect(result.eventMode).toBe(false);
  });
}
