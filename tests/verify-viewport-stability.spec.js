import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 375, height: 667 },
  { width: 360, height: 800 },
  { width: 430, height: 932 },
];

const MODES = [
  { name: 'explore', panelClass: 'explore-mode', groupId: 'explore-controls' },
  { name: 'combat', panelClass: 'combat-mode', groupId: 'combat-controls' },
  { name: 'submenu', panelClass: 'submenu-mode', groupId: 'submenu-controls' },
  { name: 'trap', panelClass: 'trap-mode', groupId: 'trap-controls' },
];

const EXCLUDED_COMBINATIONS = new Set(['375x667/submenu']);
const MAX_LAYOUT_SHIFT_PX = 1;

async function activateControlsMode(page, mode) {
  await page.evaluate(({ panelClass, groupId }) => {
    const controlsPanel = document.querySelector('#controls-panel');
    const gameContainer = document.querySelector('#game-container');
    const submenuOptions = document.querySelector('#submenu-options');

    gameContainer.classList.remove('result-mode', 'event-mode');
    controlsPanel.className = panelClass;
    document.querySelectorAll('.controls-group').forEach((group) => {
      group.classList.toggle('active', group.id === groupId);
    });

    submenuOptions.replaceChildren();
    if (groupId === 'submenu-controls') {
      const buttons = Array.from({ length: 12 }, (_, index) => {
        const button = document.createElement('button');
        button.className = 'btn btn-neon';
        button.textContent = `検証項目 ${index + 1}`;
        return button;
      });
      submenuOptions.append(...buttons);
    }
  }, mode);

  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}

test('canvas top and height stay stable across controls modes', async ({ page }) => {
  const failures = [];
  const measurements = {};

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.locator('#dungeon-canvas')).toBeVisible();

    const viewportKey = `${viewport.width}x${viewport.height}`;
    const boxes = {};

    for (const mode of MODES) {
      await activateControlsMode(page, mode);
      const layout = await page.evaluate(() => {
        const rect = (selector) => {
          const element = document.querySelector(selector);
          if (!element || getComputedStyle(element).display === 'none') return null;
          return element.getBoundingClientRect().toJSON();
        };
        return {
          canvas: rect('#dungeon-canvas'),
          viewportPanel: rect('#viewport-panel'),
          recordsStrip: rect('.records-strip'),
          viewportHud: rect('#viewport-hud'),
        };
      });
      const box = layout.canvas;
      boxes[mode.name] = { top: box.y, height: box.height };

      for (const [overlayName, overlayBox] of [
        ['records-strip', layout.recordsStrip],
        ['viewport-hud', layout.viewportHud],
      ]) {
        if (!overlayBox || overlayBox.width === 0 || overlayBox.height === 0) continue;
        const panel = layout.viewportPanel;
        if (
          overlayBox.top < panel.top
          || overlayBox.right > panel.right
          || overlayBox.bottom > panel.bottom
          || overlayBox.left < panel.left
        ) {
          failures.push(`${viewportKey}/${mode.name}: ${overlayName} escaped viewport-panel`);
        }
      }
    }

    measurements[viewportKey] = boxes;
    const baseline = boxes.explore;
    for (const mode of MODES.slice(1)) {
      const combination = `${viewportKey}/${mode.name}`;
      if (EXCLUDED_COMBINATIONS.has(combination)) continue;

      const topDifference = Math.abs(boxes[mode.name].top - baseline.top);
      const heightDifference = Math.abs(boxes[mode.name].height - baseline.height);
      if (topDifference >= MAX_LAYOUT_SHIFT_PX || heightDifference >= MAX_LAYOUT_SHIFT_PX) {
        failures.push(
          `${combination}: top diff=${topDifference.toFixed(2)}px, height diff=${heightDifference.toFixed(2)}px`,
        );
      }
    }
  }

  console.log(`VIEWPORT_STABILITY ${JSON.stringify(measurements)}`);
  expect(failures, failures.join('\n')).toEqual([]);
});
