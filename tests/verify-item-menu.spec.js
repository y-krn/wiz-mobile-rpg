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
      state.combatState = {
        phase: 'choose_actions',
        monsters: [{ name: '検証用モンスター', hp: 10, maxHp: 10 }]
      };
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
      menuContext.prevGameState = 'combat';
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

test('combat item cards keep long descriptions visible and scroll the list on short viewports @e2e @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const metrics = await page.evaluate(async () => {
    const { createSoloCharacter, state } = await import('/src/state.js');
    const { menuContext } = await import('/src/navigation.js');
    const { ITEMS } = await import('/src/data/items.js');
    const { renderCombatOverlay } = await import('/src/combat_ui/combat_overlay.js');

    state.party = [createSoloCharacter('Fighter')];
    state.gameState = 'submenu';
    state.combatState = {
      phase: 'choose_actions',
      monsters: [{ name: '検証用モンスター', hp: 10, maxHp: 10 }],
    };
    state.inventory = Array.from({ length: 8 }, () => 'HEAL_POTION');
    ITEMS.HEAL_POTION.desc = '使用するとHPを15回復し、毒状態も治療する。戦闘中に何度でも使える長い説明文です。';
    menuContext.type = 'combat_item';
    menuContext.prevGameState = 'combat';

    const overlay = document.querySelector('#combat-overlay');
    overlay.style.display = 'flex';
    renderCombatOverlay();

    const card = overlay.querySelector('.combat-item-card.item');
    const description = card.querySelector('.item-card-desc');
    const list = overlay.querySelector('.combat-selection-grid');
    const back = overlay.querySelector('.btn-combat-back');
    const cardRect = card.getBoundingClientRect();
    const descriptionRect = description.getBoundingClientRect();
    const backRect = back.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();
    return {
      cardHeight: cardRect.height,
      cardScrollHeight: card.scrollHeight,
      descriptionHeight: descriptionRect.height,
      descriptionScrollHeight: description.scrollHeight,
      descriptionDisplay: getComputedStyle(description).display,
      listClientHeight: list.clientHeight,
      listScrollHeight: list.scrollHeight,
      listOverflowY: getComputedStyle(list).overflowY,
      backHeight: backRect.height,
      backBottom: backRect.bottom,
      overlayBottom: overlayRect.bottom,
    };
  });

  expect(metrics.descriptionDisplay).not.toBe('-webkit-box');
  expect(metrics.descriptionScrollHeight).toBeLessThanOrEqual(metrics.descriptionHeight + 1);
  expect(metrics.cardScrollHeight).toBeLessThanOrEqual(metrics.cardHeight + 1);
  expect(metrics.listOverflowY).toBe('auto');
  expect(metrics.listScrollHeight).toBeGreaterThan(metrics.listClientHeight);
  expect(metrics.backHeight).toBeGreaterThanOrEqual(44);
  expect(metrics.backBottom).toBeLessThanOrEqual(metrics.overlayBottom + 1);
});

test('exploration tactical consumables use directly without target selection @e2e @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const result = await page.evaluate(async () => {
    const { createSoloCharacter, initNewGame, state } = await import('/src/state.js');
    const { executeEnterDungeon } = await import('/src/movement.js');
    const { renderItemInventory } = await import('/src/menu/explore_actions.js');
    const { updateUI } = await import('/src/ui.js');

    initNewGame();
    state.party = [createSoloCharacter('Fighter')];
    executeEnterDungeon(1);
    state.inventory = ['SILENCE_INCENSE', 'TRAP_SENSE_STONE'];
    updateUI();
    const findButton = (grid, label) =>
      [...grid.querySelectorAll('button')].find(button => button.textContent === label);

    const firstGrid = document.createElement('div');
    renderItemInventory(firstGrid);
    findButton(firstGrid, '静寂の香')?.click();
    const afterSilence = [...state.inventory];

    const secondGrid = document.createElement('div');
    renderItemInventory(secondGrid);
    findButton(secondGrid, '探知石')?.click();
    return {
      afterSilence,
      inventory: [...state.inventory],
      log: state.logs.slice(-4)
    };
  });

  expect(result.afterSilence).toEqual(['TRAP_SENSE_STONE']);
  expect(result.inventory).toEqual([]);
  expect(result.log.join('\n')).toContain('静寂の香を使った');
  expect(result.log.join('\n')).toContain('探知石を使った');
});
