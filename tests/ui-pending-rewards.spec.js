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
  await expect(page.locator('.pending-reward-actions button[aria-pressed="true"]')).toHaveCount(0);
  for (let index = 0; index < 3; index += 1) {
    const takeButton = page.locator('.pending-reward-card').nth(index).getByRole('button', { name: '持つ', exact: true });
    await takeButton.click();
    await expect(takeButton).toHaveAttribute('aria-pressed', 'true');
    await expect(takeButton).toHaveClass(/is-selected/);
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

test('pending rewards that fit the bag go straight into the bag with a toast @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { createDefaultCurrentRun, createStartingKitCharacter, state } = await import('/src/state.js');
    const { openPendingRewardMenu, stagePendingRewardBundle } = await import('/src/pending_rewards.js');
    state.party = [createStartingKitCharacter('vanguard')];
    state.inventory = [];
    state.currentRun = createDefaultCurrentRun();
    state.gameState = 'explore';
    stagePendingRewardBundle(state, [{ role: 'main', item: 'LEATHER_ARMOR' }]);
    openPendingRewardMenu();
  });

  await expect(page.locator('.pending-reward-card')).toHaveCount(0);
  await expect(page.locator('#loot-toast')).toBeVisible();
  await expect(page.locator('#loot-toast')).toContainText('をバッグへ（1/20）');
  await expect(page.locator('#log-content')).toContainText('を持つ。');
  await expect.poll(() => page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return {
      inventory: state.inventory,
      pending: state.currentRun.pendingRewardBundle,
      ledger: state.currentRun.unbankedObjectLoot.length,
      steps: state.currentRun.steps,
      gameState: state.gameState,
    };
  })).toEqual({ inventory: ['LEATHER_ARMOR'], pending: null, ledger: 1, steps: 0, gameState: 'explore' });
  await expect(page.locator('#loot-toast')).toBeHidden({ timeout: 5000 });
});

test('pending unknown equipment connects directly to one trial turn @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { createDefaultCurrentRun, createStartingKitCharacter, state } = await import('/src/state.js');
    const { openPendingRewardMenu, stagePendingRewardBundle } = await import('/src/pending_rewards.js');
    const character = createStartingKitCharacter('vanguard');
    character.equipment.weapon = 'DAGGER';
    state.party = [character];
    // A full bag keeps the resolution screen, where the trial action lives.
    state.inventory = Array.from({ length: 20 }, () => 'HEAL_POTION');
    state.currentRun = createDefaultCurrentRun();
    state.gameState = 'explore';
    stagePendingRewardBundle(state, [{
      role: 'main',
      item: {
        kind: 'equipment', instanceId: 'pending-ui-unknown', baseId: 'SHORT_SWORD',
        rarity: 'rare', level: 2, identified: false, knowledgeStage: 'discovery',
        trialCount: 0, tags: ['blade'], hintTags: ['blade'], observedHintTags: [],
        curseEffectId: 'curse_blood_thirst', cursePower: 1, curseSuspected: true,
        affixes: []
      }
    }]);
    openPendingRewardMenu();
  });

  const takeButton = page.getByRole('button', { name: '持つ', exact: true });
  const buttonLook = () => takeButton.evaluate(element => {
    const style = getComputedStyle(element);
    return [style.backgroundColor, style.borderTopColor, style.color].join('|');
  });
  await expect(takeButton).toHaveAttribute('aria-pressed', 'false');
  await takeButton.click();
  await expect(takeButton).toHaveAttribute('aria-pressed', 'true');
  const selectedLook = await buttonLook();
  const trialButton = page.getByRole('button', { name: '試す（探索時間が進む）', exact: true });
  await expect(trialButton).toHaveAttribute('aria-pressed', 'false');
  await trialButton.click();
  await expect(trialButton).toHaveAttribute('aria-pressed', 'true');
  await expect(takeButton).toHaveAttribute('aria-pressed', 'false');
  expect(await buttonLook()).not.toBe(selectedLook);
  await expect(page.locator('.pending-reward-card')).toContainText('試す（探索時間が進む）');
  await page.locator('input[data-discard-index="0"]').check();
  await expect(page.locator('#btn-pending-reward-confirm')).toBeEnabled();
  await page.locator('#btn-pending-reward-confirm').click();

  await expect.poll(() => page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const item = state.party[0].equipment.weapon;
    return {
      item: item?.instanceId || item,
      knowledgeStage: item?.knowledgeStage,
      curseLocked: item?.curseLocked,
      bag: state.inventory.length,
      returned: state.inventory.map(value => value?.instanceId || value),
      pending: state.currentRun.pendingRewardBundle,
      steps: state.currentRun.steps
    };
  })).toEqual({
    item: 'pending-ui-unknown',
    knowledgeStage: 'trial',
    curseLocked: true,
    bag: 20,
    returned: ['HEAL_POTION', ...Array(18).fill('HEAL_POTION'), 'DAGGER'],
    pending: null,
    steps: 1
  });
});
