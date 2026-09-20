import { test, expect } from './fixtures/browser-health.js';

async function readSelection(page) {
  return page.evaluate(async () => {
    const { getRendererSelectionState } = await import('/src/game.js');
    return {
      ...getRendererSelectionState(),
      canvasCount: document.querySelectorAll('#dungeon-canvas').length,
      panelRenderer: document.querySelector('#viewport-panel')?.dataset.renderer || null,
      canvasRenderer: document.querySelector('#dungeon-canvas')?.dataset.renderer || null,
    };
  });
}

for (const phase of ['import', 'application-create', 'pixi/context', 'unsupported', 'mount', 'initial-render', 'runtime']) {
  test(`Pixi ${phase} failure exposes renderer-independent safe UI @smoke @e2e`, async ({ page }) => {
    await page.addInitScript((failurePhase) => {
      window.__WIZ_RENDERER_FAILURE__ = { phase: failurePhase };
    }, phase);
    await page.goto('/');
    await expect.poll(async () => (await readSelection(page)).failureOccurred).toBe(true);
    const state = await readSelection(page);
    expect(state.requestedRenderer).toBe('pixi');
    expect(state.selectedRenderer).toBeNull();
    expect(state.failureReason).toMatch(/^pixi-/);
    expect(state.failurePhase).toBe(phase);
    expect(state.canvasCount).toBe(1);
    expect(state.panelRenderer).toBeNull();
    expect(state.canvasRenderer).toBeNull();
    await expect(page.locator('#renderer-safe-ui')).toBeVisible();
    await expect(page.locator('#renderer-safe-ui')).toHaveAttribute('aria-labelledby', 'renderer-safe-ui-title');
    await expect(page.locator('#renderer-safe-ui-title')).toHaveText('迷宮画面を読み込めない');
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('renderer-retry');
    await expect(page.locator('#renderer-retry')).toBeVisible();
    await expect(page.locator('#renderer-reload')).toBeVisible();
    await expect(page.locator('#controls-panel')).toBeHidden();
  });
}

test('repeated Pixi failures do not create duplicate views or retry loops @smoke @e2e', async ({ page }) => {
  await page.addInitScript(() => {
    window.__WIZ_RENDERER_FAILURE__ = { phase: 'mount' };
  });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await page.goto('/');
    await expect.poll(async () => (await readSelection(page)).failureOccurred).toBe(true);
    const state = await readSelection(page);
    expect(state.canvasCount).toBe(1);
    expect(state.selectedRenderer).toBeNull();
    expect(state.failureOccurred).toBe(true);
  }
});

test('renderer Retry is explicit and can recover after the injected failure is removed @smoke @e2e', async ({ page }) => {
  await page.addInitScript(() => {
    window.__WIZ_RENDERER_FAILURE__ = { phase: 'mount' };
  });
  await page.goto('/');
  await expect(page.locator('#renderer-safe-ui')).toBeVisible();
  await page.evaluate(() => { delete window.__WIZ_RENDERER_FAILURE__; });
  await page.locator('#renderer-retry').click();
  await expect.poll(async () => (await readSelection(page)).selectedRenderer).toBe('pixi');
  await expect(page.locator('#renderer-safe-ui')).toHaveCount(0);
  await expect(page.locator('#controls-panel')).toBeVisible();
});

test('runtime Pixi failure stops the RAF loop before safe UI retry @smoke @e2e', async ({ page }) => {
  await page.addInitScript(() => {
    window.__WIZ_RENDERER_FAILURE__ = { phase: 'runtime' };
    window.__rendererRafCount = 0;
    const request = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
      window.__rendererRafCount += 1;
      return request(callback);
    };
  });
  await page.goto('/');
  await expect(page.locator('#renderer-safe-ui')).toBeVisible();
  const rafCountAtFailure = await page.evaluate(() => window.__rendererRafCount);
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.__rendererRafCount)).toBe(rafCountAtFailure);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    window.dispatchEvent(new Event('pageshow'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.__rendererRafCount)).toBe(rafCountAtFailure);
});
