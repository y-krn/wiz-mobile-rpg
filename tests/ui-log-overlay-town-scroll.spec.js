import { test, expect } from './fixtures/browser-health.js';

// Town home scrolls #game-container itself (#1830). Full-shell overlays opened
// from it must still cover the whole visible shell, so scrolled town cards and
// the primary dock never show through below them. They stay absolutely
// positioned: a position: fixed overlay inside the scrolling shell loses touch
// scrolling on iOS WebKit, so the shell is parked and locked instead.
const OVERLAYS = [
  {
    name: 'full log',
    selector: '#log-overlay',
    scrollBody: '#log-overlay-body',
    open: async (page) => page.evaluate(async () => (await import('/src/ui.js')).openLogOverlay()),
    close: async (page) => page.locator('#btn-log-overlay-close').click(),
  },
  {
    name: 'archives',
    selector: '#archives-overlay',
    open: async (page) => page.getByRole('button', { name: /迷宮について分かったこと/ }).click(),
    close: async (page) => page.locator('#archives-overlay').getByRole('button', { name: /閉じる/ }).click(),
  },
];

for (const overlay of OVERLAYS) {
  test(`${overlay.name} overlay covers the scrolled town home and restores its scroll`, async ({ page }) => {
    const vp = { width: 375, height: 667 };
    await page.setViewportSize(vp);
    await page.goto('/');

    const container = page.locator('#game-container');
    await expect(container).toHaveClass(/town-home-mode/);
    await expect(page.locator('#btn-town-dungeon')).toBeVisible();
    // Guarantee the town page scrolls regardless of run summary length.
    await container.evaluate(async () => {
      const { state } = await import('/src/state.js');
      state.logs = Array.from({ length: 80 }, (_, index) => `過去ログ ${index + 1}`);
      const filler = document.createElement('div');
      filler.style.height = '600px';
      document.getElementById('town-last-run-summary').append(filler);
    });
    let scrolledTo = 0;
    await expect(async () => {
      scrolledTo = await container.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
        return el.scrollTop;
      });
      expect(scrolledTo).toBeGreaterThan(0);
    }).toPass();

    await overlay.open(page);
    await expect(page.locator(overlay.selector)).toBeVisible();

    const coverage = await page.evaluate((selector) => {
      const element = document.querySelector(selector);
      const rect = element.getBoundingClientRect();
      const shell = document.getElementById('game-container');
      const shellRect = shell.getBoundingClientRect();
      const probes = [0.05, 0.5, 0.95].map((ratio) => (
        element.contains(document.elementFromPoint(shellRect.left + shellRect.width / 2, window.innerHeight * ratio))
      ));
      return {
        position: getComputedStyle(element).position,
        shellOverflowY: getComputedStyle(shell).overflowY,
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        shell: { left: shellRect.left, right: shellRect.right },
        probes,
      };
    }, overlay.selector);

    expect(coverage.position).toBe('absolute');
    expect(coverage.shellOverflowY).toBe('hidden');
    expect(coverage.top).toBeLessThanOrEqual(0);
    expect(coverage.bottom).toBeGreaterThanOrEqual(vp.height);
    expect(Math.abs(coverage.left - coverage.shell.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(coverage.right - coverage.shell.right)).toBeLessThanOrEqual(1);
    expect(coverage.probes).toEqual([true, true, true]);

    if (overlay.scrollBody) {
      const body = page.locator(overlay.scrollBody);
      const before = await body.evaluate((el) => el.scrollTop);
      expect(before).toBeGreaterThan(0);
      const box = await body.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, -300);
      await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBeLessThan(before);
    }

    await overlay.close(page);
    await expect(page.locator(overlay.selector)).toBeHidden();
    await expect(container).toHaveClass(/town-home-mode/);
    await expect(container).not.toHaveClass(/shell-scroll-locked/);
    // Closing can re-render the town home (dropping the filler), so the
    // restored offset is clamped to what the page can still scroll.
    const restored = await container.evaluate((el) => ({ top: el.scrollTop, max: el.scrollHeight - el.clientHeight }));
    expect(restored.top).toBeGreaterThan(0);
    expect(restored.top).toBe(Math.min(scrolledTo, restored.max));
  });
}
