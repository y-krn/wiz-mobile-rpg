import { test, expect } from './fixtures/browser-health.js';

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
const EVENT_VIEWPORT_MAX_HEIGHT_PX = 480;

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

test('canvas top and height stay stable across controls modes @visual', async ({ page }) => {
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

for (const viewport of [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test(`exploration canvas stays stable across repeated updates at ${viewport.width}px @visual`, async ({ page }) => {
    await page.addInitScript(() => {
      const originalSetAttribute = Element.prototype.setAttribute;
      window.__viewportMetaWrites = 0;
      Element.prototype.setAttribute = function setAttribute(name, value) {
        if (this instanceof HTMLMetaElement && this.name === 'viewport' && name === 'content') {
          window.__viewportMetaWrites += 1;
        }
        return originalSetAttribute.call(this, name, value);
      };
    });

    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.evaluate(async () => {
      localStorage.clear();
      const { state, createSoloCharacter } = await import('/src/state.js');
      const { executeEnterDungeon } = await import('/src/movement.js');
      state.party = [createSoloCharacter('Fighter')];
      state.gameState = 'town';
      executeEnterDungeon(1);
    });
    await expect(page.locator('#explore-controls')).toBeVisible();

    const measure = () => page.locator('#dungeon-canvas').evaluate((canvas) => {
      const box = canvas.getBoundingClientRect();
      return { top: box.top, height: box.height };
    });
    const baseline = await measure();

    for (let index = 0; index < 6; index += 1) {
      await page.locator('#btn-turn-right').dispatchEvent('pointerdown');
      await page.evaluate(() => new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }));
      const current = await measure();
      expect(Math.abs(current.top - baseline.top), `Canvas top shifted at step ${index + 1}`).toBeLessThan(1);
      expect(Math.abs(current.height - baseline.height), `Canvas height shifted at step ${index + 1}`).toBeLessThan(1);
    }

    const viewportMetaWrites = await page.evaluate(() => window.__viewportMetaWrites);
    expect(viewportMetaWrites, 'Repeated exploration updates must not rewrite viewport meta').toBe(1);
  });
}

test('result and event viewports preserve their flexible heights @visual', async ({ page }) => {
  const failures = [];
  const measurements = {};

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.locator('#viewport-panel')).toBeVisible();

    const viewportKey = `${viewport.width}x${viewport.height}`;
    const modeMeasurements = {};

    for (const mode of ['result', 'event']) {
      const layout = await page.evaluate(async (containerMode) => {
        const gameContainer = document.querySelector('#game-container');
        const controlsPanel = document.querySelector('#controls-panel');

        gameContainer.className = `${containerMode}-mode`;
        controlsPanel.className = 'town-mode';
        document.querySelectorAll('.controls-group').forEach((group) => {
          group.classList.toggle('active', group.id === 'town-controls');
        });
        await new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        });

        const rect = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
        return {
          container: rect('#game-container'),
          header: rect('#game-header'),
          goal: rect('#goal-banner'),
          viewportPanel: rect('#viewport-panel'),
          controls: rect('#controls-panel'),
          character: rect('#character-panel'),
        };
      }, mode);

      const occupiedHeight = mode === 'result'
        ? layout.header.height + layout.character.height
        : layout.header.height + layout.goal.height + layout.controls.height + layout.character.height;
      const availableHeight = layout.container.height - occupiedHeight;
      const expectedHeight = mode === 'result'
        ? availableHeight
        : Math.min(EVENT_VIEWPORT_MAX_HEIGHT_PX, availableHeight);
      const heightDifference = Math.abs(layout.viewportPanel.height - expectedHeight);

      modeMeasurements[mode] = {
        height: layout.viewportPanel.height,
        expectedHeight,
      };
      if (heightDifference >= MAX_LAYOUT_SHIFT_PX) {
        failures.push(
          `${viewportKey}/${mode}: height=${layout.viewportPanel.height.toFixed(2)}px, expected=${expectedHeight.toFixed(2)}px`,
        );
      }
    }

    measurements[viewportKey] = modeMeasurements;
  }

  console.log(`SPECIAL_VIEWPORT_HEIGHTS ${JSON.stringify(measurements)}`);
  expect(failures, failures.join('\n')).toEqual([]);
});
