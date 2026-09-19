import { test, expect } from './fixtures/browser-health.js';

const themes = ['dark', 'modern', 'warm'];
const states = ['town', 'preparation', 'explore', 'combat', 'loot', 'portal', 'portal-confirm', 'return', 'death'];
const viewports = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

async function openPrototype(page, theme, state, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(`/visual-prototype.html?theme=${theme}&state=${state}`);
  await expect(page.locator('.game-shell')).toBeVisible();
  await expect(page.locator('#decision-title')).toBeVisible();
}

test('visual prototype exposes the same fixture and action grammar across A/B/C @visual @smoke', async ({ page }) => {
  const snapshots = new Map();

  for (const state of states) {
    for (const theme of themes) {
      await openPrototype(page, theme, state, { width: 390, height: 844 });
      const shell = await page.locator('.game-shell').innerText();
      snapshots.set(`${state}:${theme}`, shell);

      await expect(page.locator('body')).toHaveCSS('overflow-x', 'visible');
      const controlSizes = await page.locator('button, select').evaluateAll(controls => controls.map(control => {
        const rect = control.getBoundingClientRect();
        return { width: rect.width, height: rect.height, label: control.textContent.trim() };
      }));
      expect(controlSizes.length).toBeGreaterThan(0);
      expect(controlSizes.every(size => size.width >= 44 && size.height >= 44), `${theme}/${state} interactive target`).toBe(true);

      await page.screenshot({ path: `output/playwright/issue-1341-${theme}-${state}-390.png`, fullPage: true });
    }
    expect(snapshots.get(`${state}:dark`)).toBe(snapshots.get(`${state}:modern`));
    expect(snapshots.get(`${state}:dark`)).toBe(snapshots.get(`${state}:warm`));
  }
});
test('critical tension states retain explicit non-color cues and mobile reach @visual @e2e', async ({ page }) => {
  for (const viewport of viewports) {
    await openPrototype(page, 'modern', 'combat', viewport);
    await expect(page.getByText('危険', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /逃走/ })).toBeVisible();
    await expect(page.locator('.fixture-action--danger')).toHaveCSS('border-style', 'solid');

    await openPrototype(page, 'modern', 'portal', viewport);
    const portalChoices = page.locator('.fixture-action--choice');
    await expect(portalChoices).toHaveCount(2);
    await expect(page.locator('.fixture-action--primary')).toHaveCount(0);
    expect(await portalChoices.nth(0).evaluate(element => getComputedStyle(element).borderColor))
      .toBe(await portalChoices.nth(1).evaluate(element => getComputedStyle(element).borderColor));
    expect(await portalChoices.nth(0).evaluate(element => getComputedStyle(element).backgroundColor))
      .toBe(await portalChoices.nth(1).evaluate(element => getComputedStyle(element).backgroundColor));

    await openPrototype(page, 'modern', 'portal-confirm', viewport);
    await expect(page.locator('.fixture-action--selected')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: /帰還を確定/ })).toBeVisible();

    await openPrototype(page, 'warm', 'death', viewport);
    await expect(page.getByText('喪失', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '冒険者は倒れた' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow, `${viewport.width}x${viewport.height} horizontal overflow`).toBe(false);
  }
});
