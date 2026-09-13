import { test, expect } from './fixtures/browser-health.js';

const RETIRED_RENDERER = 'three';

async function readCanvasDefault(page) {
  await expect(page.locator('#viewport-panel')).toHaveAttribute('data-renderer', 'canvas');
  return page.evaluate(async () => {
    const { dungeonRenderer } = await import('/src/renderer.js');
    const canvas = document.querySelector('#dungeon-canvas');
    const rendererModules = performance.getEntriesByType('resource')
      .map((entry) => new URL(entry.name).pathname)
      .filter((pathname) => pathname.startsWith('/src/') && pathname.endsWith('renderer.js'));
    return {
      canvas2d: Boolean(canvas?.getContext('2d')),
      rendererModules,
      rendererMode: dungeonRenderer?.mode ?? 'canvas',
    };
  });
}

test('renderer selection keeps Canvas default, Pixi opt-in, and safe fallback for retired or invalid queries @smoke @e2e', async ({ page }) => {
  await page.goto('/');
  const defaultState = await readCanvasDefault(page);
  expect(defaultState.canvas2d).toBe(true);
  expect(defaultState.rendererMode).toBe('canvas');

  await page.goto('/?renderer=pixi');
  await expect(page.locator('#viewport-panel')).toHaveAttribute('data-renderer', 'pixi');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');
  const pixiMode = await page.evaluate(async () => (await import('/src/renderer.js')).dungeonRenderer.mode);
  expect(pixiMode).toBe('pixi');

  await page.goto(`/?renderer=${RETIRED_RENDERER}`);
  const retiredState = await readCanvasDefault(page);
  expect(retiredState.canvas2d).toBe(true);
  expect(retiredState.rendererMode).toBe('canvas');
  expect(retiredState.rendererModules).toEqual(['/src/renderer.js']);

  await page.goto('/?renderer=invalid-renderer');
  const invalidState = await readCanvasDefault(page);
  expect(invalidState.canvas2d).toBe(true);
  expect(invalidState.rendererMode).toBe('canvas');
  expect(invalidState.rendererModules).toEqual(['/src/renderer.js']);
});
