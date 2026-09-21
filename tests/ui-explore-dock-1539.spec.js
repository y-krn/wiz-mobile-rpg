import { writeFileSync } from 'node:fs';
import { test, expect } from './fixtures/browser-health.js';

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

async function seedExplore(page) {
  await page.evaluate(async () => {
    const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = createDefaultCurrentRun();
    state.gameState = 'explore';
    state.transitioning = false;
    state.combatState = null;
    updateUI();
    const { dungeonRenderer } = await import('/src/renderer.js');
    dungeonRenderer?.draw?.();
  });
  await expect(page.locator('#explore-controls')).toBeVisible();
}

function gapBetween(first, second) {
  return Math.max(
    second.top - first.bottom,
    first.top - second.bottom,
    second.x - first.right,
    first.x - second.right,
  );
}

test('Explore Dock keeps primary movement separated and tappable at required mobile sizes @smoke', async ({ page }, testInfo) => {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto('/?renderer=pixi');
    await seedExplore(page);

    const evidence = await page.evaluate(() => {
      const selectors = [
        '#btn-move-forward', '#btn-turn-left', '#btn-move-backward', '#btn-turn-right', '#btn-search',
        '#btn-inspect', '#btn-cast', '#btn-item', '#btn-explore-management',
      ];
      const rect = (selector) => {
        const element = document.querySelector(selector);
        const box = element?.getBoundingClientRect();
        return box ? {
          x: box.x, y: box.y, top: box.top, right: box.right, bottom: box.bottom,
          width: box.width, height: box.height,
        } : null;
      };
      const buttons = Object.fromEntries(selectors.map((selector) => [selector.slice(1), rect(selector)]));
      const visible = Object.values(buttons).every((box) => box && box.width > 0 && box.height > 0);
      const overlaps = [];
      const entries = Object.entries(buttons);
      for (let index = 0; index < entries.length; index += 1) {
        for (let next = index + 1; next < entries.length; next += 1) {
          const [firstId, first] = entries[index];
          const [secondId, second] = entries[next];
          const overlapX = Math.min(first.right, second.right) - Math.max(first.x, second.x);
          const overlapY = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
          if (overlapX > 0 && overlapY > 0) overlaps.push([firstId, secondId]);
        }
      }
      const panel = document.querySelector('#controls-panel')?.getBoundingClientRect();
      const dungeonView = document.querySelector('#viewport-panel')?.getBoundingClientRect();
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        panel: panel ? { x: panel.x, y: panel.y, width: panel.width, height: panel.height } : null,
        dungeonView: dungeonView ? { x: dungeonView.x, y: dungeonView.y, width: dungeonView.width, height: dungeonView.height } : null,
        buttons,
        visible,
        overlaps,
      };
    });
    expect(evidence.visible).toBe(true);
    expect(evidence.overlaps).toEqual([]);
    expect(evidence.panel.height).toBeLessThanOrEqual(116);
    expect(evidence.panel.height).toBeGreaterThanOrEqual(115);
    expect(evidence.dungeonView.y).toBeLessThanOrEqual(1);
    expect(evidence.dungeonView.height).toBeGreaterThanOrEqual(viewport.height - 1);

    const buttons = Object.values(evidence.buttons);
    for (const button of buttons) {
      expect(button.x).toBeGreaterThanOrEqual(0);
      expect(button.y).toBeGreaterThanOrEqual(0);
      expect(button.right).toBeLessThanOrEqual(viewport.width);
      expect(button.bottom).toBeLessThanOrEqual(viewport.height);
      expect(button.width).toBeGreaterThanOrEqual(44);
      expect(button.height).toBeGreaterThanOrEqual(44);
    }

    const forward = evidence.buttons['btn-move-forward'];
    for (const directionId of ['btn-turn-left', 'btn-move-backward', 'btn-turn-right']) {
      expect(gapBetween(forward, evidence.buttons[directionId])).toBeGreaterThan(0);
      expect(forward.width * forward.height).toBeGreaterThan(
        evidence.buttons[directionId].width * evidence.buttons[directionId].height,
      );
    }
    expect(evidence.buttons['btn-search'].top).toBe(forward.top);
    expect(evidence.buttons['btn-turn-left'].top).toBe(evidence.buttons['btn-move-backward'].top);
    expect(evidence.buttons['btn-move-backward'].top).toBe(evidence.buttons['btn-turn-right'].top);
    expect(evidence.buttons['btn-turn-left'].x).toBeLessThan(evidence.buttons['btn-move-backward'].x);
    expect(evidence.buttons['btn-move-backward'].x).toBeLessThan(evidence.buttons['btn-turn-right'].x);

    const raw = Buffer.from(JSON.stringify(evidence, null, 2));
    const rawPath = testInfo.outputPath(`issue-1539-explore-dock-${viewport.width}x${viewport.height}-raw.json`);
    writeFileSync(rawPath, raw);
    await testInfo.attach(`issue-1539-explore-dock-${viewport.width}x${viewport.height}-raw`, {
      path: rawPath,
      contentType: 'application/json',
    });
    const screenshotPath = testInfo.outputPath(`issue-1539-explore-dock-${viewport.width}x${viewport.height}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await testInfo.attach(`issue-1539-explore-dock-${viewport.width}x${viewport.height}`, {
      path: screenshotPath,
      contentType: 'image/png',
    });
  }
});
