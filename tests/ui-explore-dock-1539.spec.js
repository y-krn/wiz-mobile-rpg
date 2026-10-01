import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test, expect } from './fixtures/browser-health.js';

const EVIDENCE_DIR = resolve(process.env.ISSUE_1539_EVIDENCE_DIR || 'output/playwright/issue-1539');

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 844, height: 390 },
];

const SATCHEL_IDS = ['btn-search', 'btn-inspect', 'btn-cast', 'btn-item', 'btn-explore-management'];
const PAD_IDS = ['btn-turn-around', 'btn-move-forward', 'btn-turn-left', 'btn-move-backward', 'btn-turn-right'];

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
  await expect(page.locator('#game-container')).toHaveAttribute('data-explore-hud', /.+/);
}

// Exploring is played on the world (#1539 successor): the dungeon fills the
// screen, movement is touch on the view, and every other action sits in the
// satchel opened from the adventurer's card.
test('World play keeps the view clear and every exploration action tappable at required mobile sizes @smoke', async ({ page }, testInfo) => {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto('/?renderer=pixi');
    await seedExplore(page);

    // The classic pad stays in the DOM for keyboard and assistive input but
    // takes no space on screen.
    for (const id of PAD_IDS) await expect(page.locator(`[data-assistive-pad] #${id}`)).toBeAttached();
    const pad = await page.locator('[data-assistive-pad]').boundingBox();
    expect(pad === null || pad.width * pad.height <= 1, 'assistive pad folded off screen').toBe(true);
    await expect(page.locator('#explore-satchel')).toBeHidden();

    await page.locator('#character-panel').click();
    await expect(page.locator('#explore-satchel')).toBeVisible();
    await expect(page.locator('#character-panel')).toHaveAttribute('aria-expanded', 'true');

    const evidence = await page.evaluate((ids) => {
      const rect = (selector) => {
        const box = document.querySelector(selector)?.getBoundingClientRect();
        return box ? { x: box.x, y: box.y, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height } : null;
      };
      const buttons = Object.fromEntries(ids.map((id) => [id, rect(`#${id}`)]));
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
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        dungeonView: rect('#viewport-panel'),
        satchel: rect('#explore-satchel'),
        card: rect('#character-panel'),
        buttons,
        overlaps,
        scrollWidth: document.documentElement.scrollWidth,
      };
    }, SATCHEL_IDS);

    expect(evidence.dungeonView.y).toBeLessThanOrEqual(1);
    expect(evidence.dungeonView.height).toBeGreaterThanOrEqual(viewport.height - 1);
    expect(evidence.scrollWidth).toBeLessThanOrEqual(viewport.width + 1);
    expect(evidence.overlaps).toEqual([]);
    // The satchel opens from the card and never covers it.
    expect(evidence.satchel.bottom).toBeLessThanOrEqual(evidence.card.top + 1);
    for (const button of Object.values(evidence.buttons)) {
      expect(button.x).toBeGreaterThanOrEqual(0);
      expect(button.y).toBeGreaterThanOrEqual(0);
      expect(button.right).toBeLessThanOrEqual(viewport.width);
      expect(button.bottom).toBeLessThanOrEqual(viewport.height);
      expect(button.width).toBeGreaterThanOrEqual(44);
      expect(button.height).toBeGreaterThanOrEqual(44);
    }

    // Touching the world puts the satchel away without moving.
    const before = await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      return { x: state.x, y: state.y, dir: state.dir };
    });
    const view = await page.locator('#dungeon-canvas').boundingBox();
    await page.mouse.click(view.x + view.width / 2, view.y + view.height * 0.4);
    await expect(page.locator('#explore-satchel')).toBeHidden();
    expect(await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      return { x: state.x, y: state.y, dir: state.dir };
    })).toEqual(before);

    await page.locator('#character-panel').click();
    const raw = Buffer.from(JSON.stringify(evidence, null, 2));
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const rawPath = join(EVIDENCE_DIR, `issue-1539-world-play-${viewport.width}x${viewport.height}-raw.json`);
    writeFileSync(rawPath, raw);
    await testInfo.attach(`issue-1539-world-play-${viewport.width}x${viewport.height}-raw`, {
      path: rawPath,
      contentType: 'application/json',
    });
    const screenshotPath = join(EVIDENCE_DIR, `issue-1539-world-play-${viewport.width}x${viewport.height}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await testInfo.attach(`issue-1539-world-play-${viewport.width}x${viewport.height}`, {
      path: screenshotPath,
      contentType: 'image/png',
    });
  }
});
