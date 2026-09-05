import { test, expect } from './fixtures/browser-health.js';

test('chest object rewards resolve as one pending bundle without overflowing the bag @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { createDefaultCurrentRun, createStartingKitCharacter, state } = await import('/src/state.js');
    const { openPendingRewardMenu, stagePendingRewardBundle } = await import('/src/pending_rewards.js');
    state.party = [createStartingKitCharacter('vanguard')];
    state.inventory = Array.from({ length: 20 }, () => 'HEAL_POTION');
    state.currentRun = createDefaultCurrentRun();
    state.gameState = 'explore';
    stagePendingRewardBundle(state, [
      { role: 'main', item: 'DAGGER' },
      { role: 'special', item: 'TOWN_PORTAL' },
      { role: 'accessory', item: 'AMULET_HP' },
    ]);
    openPendingRewardMenu();
  });

  await expect(page.locator('.pending-reward-card')).toHaveCount(3);
  await expect(page.locator('#btn-pending-reward-confirm')).toBeDisabled();
  for (let index = 0; index < 3; index += 1) {
    await page.locator('.pending-reward-card').nth(index).getByRole('button', { name: '持つ', exact: true }).click();
  }
  await expect(page.locator('#btn-pending-reward-confirm')).toBeDisabled();
  for (let index = 0; index < 3; index += 1) {
    await page.locator(`input[data-discard-index="${index}"]`).check();
  }
  await expect(page.locator('#btn-pending-reward-confirm')).toBeEnabled();
  await page.locator('#btn-pending-reward-confirm').click();

  await expect.poll(() => page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return {
      inventory: state.inventory.length,
      pending: state.currentRun.pendingRewardBundle,
      ledger: state.currentRun.unbankedObjectLoot.length,
      gameState: state.gameState,
    };
  })).toEqual({ inventory: 20, pending: null, ledger: 3, gameState: 'explore' });
});
