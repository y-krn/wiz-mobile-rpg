import { test, expect } from './fixtures/browser-health.js';

// Town home scrolls #game-container itself (#1830). Full-shell overlays opened
// from it must still cover the whole visible shell, so scrolled town cards and
// the primary dock never show through below them.
const OVERLAYS = [
  {
    name: 'full log',
    selector: '#log-overlay',
    open: async (page) => page.evaluate(async () => (await import('/src/ui.js')).openLogOverlay()),
  },
  {
    name: 'archives',
    selector: '#archives-overlay',
    open: async (page) => page.getByRole('button', { name: /迷宮について分かったこと/ }).click(),
  },
];

for (const overlay of OVERLAYS) {
  test(`${overlay.name} overlay covers the scrolled town home`, async ({ page }) => {
    const vp = { width: 375, height: 667 };
    await page.setViewportSize(vp);
    await page.goto('/');

    const container = page.locator('#game-container');
    await expect(container).toHaveClass(/town-home-mode/);
    await expect(page.locator('#btn-town-dungeon')).toBeVisible();
    // Guarantee the town page scrolls regardless of run summary length.
    await container.evaluate(() => {
      const filler = document.createElement('div');
      filler.style.height = '600px';
      document.getElementById('town-last-run-summary').append(filler);
    });
    await expect(async () => {
      const scrollTop = await container.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
        return el.scrollTop;
      });
      expect(scrollTop).toBeGreaterThan(0);
    }).toPass();

    await overlay.open(page);
    await expect(page.locator(overlay.selector)).toBeVisible();

    const coverage = await page.evaluate((selector) => {
      const element = document.querySelector(selector);
      const rect = element.getBoundingClientRect();
      const shell = document.getElementById('game-container').getBoundingClientRect();
      const probes = [0.05, 0.5, 0.95].map((ratio) => (
        element.contains(document.elementFromPoint(shell.left + shell.width / 2, window.innerHeight * ratio))
      ));
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, shell: { left: shell.left, right: shell.right }, probes };
    }, overlay.selector);

    expect(coverage.top).toBeLessThanOrEqual(0);
    expect(coverage.bottom).toBeGreaterThanOrEqual(vp.height);
    expect(Math.abs(coverage.left - coverage.shell.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(coverage.right - coverage.shell.right)).toBeLessThanOrEqual(1);
    expect(coverage.probes).toEqual([true, true, true]);
  });
}
