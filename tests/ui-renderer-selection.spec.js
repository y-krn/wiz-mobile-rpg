import { test, expect } from './fixtures/browser-health.js';

async function readSelection(page) {
  return page.evaluate(async () => {
    const { getRendererSelectionState } = await import('/src/game.js');
    const canvas = document.querySelector('#dungeon-canvas');
    return {
      ...getRendererSelectionState(),
      canvasCount: document.querySelectorAll('#dungeon-canvas').length,
      canvasRenderer: canvas?.dataset.renderer || null,
      panelRenderer: document.querySelector('#viewport-panel')?.dataset.renderer || null,
      pixiCanvasContext: canvas?.getContext('webgl') !== null || canvas?.getContext('webgl2') !== null,
    };
  });
}

test('renderer selection always mounts Pixi and normalizes renderer query values @smoke @e2e', async ({ page }) => {
  for (const path of ['/', '/?renderer=pixi', '/?renderer=foo', '/']) {
    await page.goto(path);
    await expect.poll(async () => (await readSelection(page)).selectedRenderer).toBe('pixi');
    const state = await readSelection(page);
    expect(state.requestedRenderer).toBe('pixi');
    expect(state.failureOccurred).toBe(false);
    expect(state.canvasCount).toBe(1);
    expect(state.canvasRenderer).toBe('pixi');
    expect(state.panelRenderer).toBe('pixi');
    expect(state.pixiCanvasContext).toBe(true);
  }

});
