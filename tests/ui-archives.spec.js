import { test, expect } from '@playwright/test';
test('Archives list restores scroll after detail and resets on navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { MONSTERS, ITEMS } = await import('/src/data.js');
    const { openArchivesOverlay } = await import('/src/ui.js');

    state.codex.monsters = Object.fromEntries(
      MONSTERS.map((monster) => [monster.name, { encountered: 1, killed: 1 }]),
    );
    state.codex.equipment = Object.fromEntries(
      Object.entries(ITEMS)
        .filter(([, item]) => ['weapon', 'armor', 'shield', 'accessory'].includes(item.type))
        .map(([key]) => [key, {
          foundCount: 1,
          highestRarity: 'common',
          bestBonus: 0,
          affixesSeen: [],
          firstFoundAt: 'B1F',
        }]),
    );
    openArchivesOverlay();
  });

  const body = page.locator('#archives-overlay .archives-body');

  for (const tab of ['monsters', 'equipment']) {
    if (tab === 'equipment') {
      await page.getByRole('button', { name: '🛡️ 装備' }).click();
    }

    const initialScrollTop = await body.evaluate((element) => {
      element.scrollTop = Math.floor(element.scrollHeight / 2);
      return element.scrollTop;
    });
    expect(initialScrollTop).toBeGreaterThan(0);
    await expect.poll(async () => page.evaluate(async () => {
      const { archivesState } = await import('/src/ui/archives_overlay.js');
      return archivesState.listScrollTop;
    })).toBe(initialScrollTop);

    await page.locator('#archives-overlay .codex-row').last().click();
    const savedScrollTop = await page.evaluate(async () => {
      const { archivesState } = await import('/src/ui/archives_overlay.js');
      return archivesState.listScrollTop;
    });
    expect(savedScrollTop).toBeGreaterThan(0);
    await page.getByRole('button', { name: '一覧に戻る' }).click();
    await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBe(savedScrollTop);
  }

  await page.getByRole('button', { name: '👿 敵' }).click();
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBe(0);

  await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.getByRole('button', { name: '❌ 閉じる' }).click();
  await page.evaluate(async () => {
    const { openArchivesOverlay } = await import('/src/ui.js');
    openArchivesOverlay();
  });
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBe(0);
});

test('Archives shows flash bat combat traits after its first defeat', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { openArchivesOverlay } = await import('/src/ui.js');

    state.codex.monsters['フラッシュバット'] = { encountered: 1, killed: 1 };
    openArchivesOverlay();
  });

  await page.locator('#archives-overlay .codex-row', { hasText: 'フラッシュバット' }).click();
  const traits = page.locator('#archives-overlay .codex-traits');
  await expect(traits).toBeVisible();
  await expect(traits).toContainText('盲目を付与');
  await expect(traits).toContainText('妨害役');
});
