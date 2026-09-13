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

for (const phase of ['import', 'application-create', 'canvas/context', 'mount', 'initial-render']) {
  test(`Pixi ${phase} failure falls back to one usable Canvas renderer @smoke @e2e`, async ({ page }) => {
    await page.addInitScript((failurePhase) => {
      window.__WIZ_RENDERER_FAILURE__ = { phase: failurePhase };
    }, phase);
    await page.goto('/');
    await expect.poll(async () => (await readSelection(page)).selectedRenderer).toBe('canvas');
    const state = await readSelection(page);
    expect(state.requestedRenderer).toBe('pixi');
    expect(state.selectedRenderer).toBe('canvas');
    expect(state.fallbackOccurred).toBe(true);
    expect(state.fallbackReason).toMatch(/^pixi-/);
    expect(state.pixiPhase).toBe(phase);
    expect(state.canvasCount).toBe(1);
    expect(state.panelRenderer).toBe('canvas');
    expect(state.canvasRenderer).toBeNull();

    const gameplay = await page.evaluate(async () => {
      const { dungeonRenderer } = await import('/src/renderer.js');
      const mode = dungeonRenderer.mode;
      dungeonRenderer.draw();
      return {
        mode,
        canvasCount: document.querySelectorAll('#dungeon-canvas').length,
        hasCanvasContext: Boolean(document.querySelector('#dungeon-canvas')?.getContext('2d')),
      };
    });
    expect(gameplay.mode).toBe('canvas');
    expect(gameplay.canvasCount).toBe(1);
    expect(gameplay.hasCanvasContext).toBe(true);
  });
}

test('repeated Pixi fallback reloads do not leave duplicate views or retry loops @smoke @e2e', async ({ page }) => {
  await page.addInitScript(() => {
    window.__WIZ_RENDERER_FAILURE__ = { phase: 'mount' };
  });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await page.goto('/');
    await expect.poll(async () => (await readSelection(page)).selectedRenderer).toBe('canvas');
    const state = await readSelection(page);
    expect(state.canvasCount).toBe(1);
    expect(state.fallbackOccurred).toBe(true);
  }
});
