import { test, expect } from './fixtures/browser-health.js';

async function seedAllySpellTargetSelection(page) {
  await page.evaluate(async () => {
    const { state, initNewGame, createStartingKitCharacter } = await import('/src/state.js');
    const { executeEnterDungeon } = await import('/src/movement.js');
    const { spellMenuState } = await import('/src/spell_menu.js');
    const { updateUI } = await import('/src/ui.js');

    initNewGame();
    executeEnterDungeon(1);
    const caster = createStartingKitCharacter('devotion');
    caster.equipment.weapon = 'ARCH_WAND';
    caster.mediumState = { mediumKey: 'ARCH_WAND', socketedRunes: ['RUNE_DIOS'] };
    caster.hp = 5;
    const ally = createStartingKitCharacter('devotion');
    ally.name = '観測対象';
    ally.hp = ally.maxHp - 2;
    state.party = [caster, ally];
    spellMenuState.filter = 'all';
    spellMenuState.selectedKey = null;
    state.gameState = 'explore';
    updateUI();
  });
  await page.locator('#btn-cast').click();
  await page.getByRole('button', { name: /^DIOS MP/ }).click();
  await page.locator('#btn-spell-cast-action').click();
  await expect(page.locator('#spell-overlay .spell-target-card:not(.disabled)')).toHaveCount(2);
}

test('ally spell target cards use availability, not recommendation, as their visual state @visual @smoke', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await seedAllySpellTargetSelection(page);

  await page.locator('#spell-overlay .spell-target-grid').screenshot({
    path: testInfo.outputPath('visual-system-spell-target.png'),
  });

  const cards = await page.locator('#spell-overlay .spell-target-card:not(.disabled)').evaluateAll(elements => elements.map(card => {
    const status = card.querySelector('.target-card-status');
    const cardStyle = getComputedStyle(card);
    const statusStyle = status ? getComputedStyle(status) : null;
    return {
      className: card.className,
      borderColor: cardStyle.borderColor,
      backgroundColor: cardStyle.backgroundColor,
      statusColor: statusStyle?.color || null,
      statusText: status?.textContent.trim() || '',
    };
  }));

  expect(cards).toHaveLength(2);
  expect(new Set(cards.map(card => card.borderColor)).size).toBe(1);
  expect(new Set(cards.map(card => card.backgroundColor)).size).toBe(1);
  expect(new Set(cards.map(card => card.statusColor)).size).toBe(1);
  expect(cards.every(card => !card.className.includes('recommended'))).toBe(true);
  expect(cards.map(card => card.statusText)).toEqual(['回復可', '回復可']);
});

test('pending reward surfaces inherit the Dark Archive surface and tap contracts @e2e @smoke', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { createDefaultCurrentRun, createStartingKitCharacter, state } = await import('/src/state.js');
    const { openPendingRewardMenu, stagePendingRewardBundle } = await import('/src/pending_rewards.js');
    state.party = [createStartingKitCharacter('vanguard')];
    state.inventory = ['HEAL_POTION'];
    state.currentRun = createDefaultCurrentRun();
    state.gameState = 'explore';
    stagePendingRewardBundle(state, [{ role: 'main', item: 'DAGGER' }]);
    openPendingRewardMenu();
  });

  await page.locator('.pending-reward-card').first().screenshot({
    path: testInfo.outputPath('visual-system-pending-reward.png'),
  });

  const surface = await page.locator('.pending-reward-card').first().evaluate(card => {
    const style = getComputedStyle(card);
    const button = card.querySelector('button');
    const buttonStyle = button ? getComputedStyle(button) : null;
    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      borderRadius: style.borderRadius,
      buttonHeight: button?.getBoundingClientRect().height || 0,
      buttonMinHeight: buttonStyle?.minHeight || '',
    };
  });

  expect(surface.backgroundColor).toBe('rgb(21, 31, 39)');
  expect(surface.borderColor).toBe('rgb(38, 52, 61)');
  expect(surface.borderRadius).toBe('5px');
  expect(surface.buttonHeight).toBeGreaterThanOrEqual(44);
  expect(surface.buttonMinHeight).toBe('44px');
});
