import { test, expect } from './fixtures/browser-health.js';

for (const viewport of [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test(`依頼板の選択が潜行中の依頼HUDへ反映される (${viewport.width}px)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');

    await page.locator('#btn-town-quest-board').click();
    await expect(page.locator('#submenu-title')).toHaveText('依頼板 - 潜行の目的');
    const cards = page.locator('.run-quest-card');
    await expect(cards).toHaveCount(3);
    expect(await page.locator('#game-container').evaluate(container => (
      container.classList.contains('town-submenu-mode')
    ))).toBe(true);

    await cards.nth(0).click();
    await cards.nth(1).click();
    await expect(page.locator('.run-quest-card.is-selected')).toHaveCount(2);
    await expect(page.getByRole('button', { name: '選択した依頼で潜行準備へ' })).toBeEnabled();

    const selectedIds = await page.locator('.run-quest-card.is-selected').evaluateAll(buttons => (
      buttons.map(button => button.dataset.questTemplateId)
    ));
    await page.getByRole('button', { name: '選択した依頼で潜行準備へ' }).click();
    await page.locator('.solo-class-option').first().click();
    await page.getByRole('button', { name: /B1Fから開始/ }).click();
    await expect(page.locator('#explore-controls')).toBeVisible();

    const started = await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      return state.currentRun.quests.map(quest => quest.templateId);
    });
    expect(started).toEqual(selectedIds);
    await expect(page.locator('.quest-hud-list')).toHaveCount(1);
    await expect(page.locator('.quest-hud-list span')).toHaveCount(2);
  });
}

test('依頼板を使わず出発すると現行のランダム依頼が割り当てられる', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-town-dungeon').click();
  await page.locator('.solo-class-option').first().click();
  await page.getByRole('button', { name: /B1Fから開始/ }).click();

  const questCount = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return state.currentRun.quests.length;
  });
  expect([1, 2]).toContain(questCount);
});
