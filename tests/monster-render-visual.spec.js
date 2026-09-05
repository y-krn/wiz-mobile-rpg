import { test, expect } from './fixtures/browser-health.js';
import './monster-variants.cases.js';

const phase = process.env.MONSTER_VOLUME_PHASE || 'after';
const screenshotPath = `output/playwright/monster-render-${phase}.png`;

const MONSTERS = [
  { name: 'ゾンビ', level: 2, hp: 32, maxHp: 32, color: '#8a2be2', spriteType: 'zombie' },
  { name: '墓守の巨躯', level: 5, hp: 95, maxHp: 95, color: '#ff3b30', spriteType: 'zombie' },
  { name: 'ストーンガード', level: 5, hp: 110, maxHp: 110, color: '#708090', spriteType: 'zombie' },
];

async function setupCombatScene(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.evaluate(async (monsters) => {
    const { state } = await import('/src/state.js');
    const { dungeonRenderer } = await import('/src/renderer.js');
    const map = Array.from({ length: 8 }, () => (
      Array.from({ length: 8 }, () => ({ walls: [false, false, false, false], type: 'empty' }))
    ));

    state.maps[0] = map;
    state.map = map;
    state.floor = 1;
    state.x = 3;
    state.y = 3;
    state.dir = 0;
    state.gameState = 'combat';
    state.combatState = {
      phase: 'choose_actions',
      monsters,
      playerActions: [],
      isAuto: false,
    };

    dungeonRenderer.draw();
  }, MONSTERS);
}

// Temporary baseline harness: reproduce the pre-#708 monster passes in the
// browser so before/after timings use the same block-averaged measurement.
async function installLegacyMonsterRenderer(page) {
  await page.evaluate(async () => {
    const { dungeonRenderer } = await import('/src/renderer.js');

    dungeonRenderer.strokeNeonPaths = function strokeLegacyNeonPaths(ctx, paths, color, scale) {
      const px = width => Math.max(width, 0.9 / scale);

      ctx.strokeStyle = color;
      ctx.lineWidth = px(7);
      ctx.globalAlpha = 0.28;
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
      paths.forEach(path => ctx.stroke(path));

      ctx.lineWidth = px(3);
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      paths.forEach(path => ctx.stroke(path));

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = px(1.2);
      ctx.globalAlpha = 0.9;
      paths.forEach(path => ctx.stroke(path));
      ctx.globalAlpha = 1;
    };

    dungeonRenderer.drawMonster = function drawLegacyMonster(ctx, monster, cx, cy, scale, maxLabelWidth) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);

      const color = monster.color || '#ff3b30';
      const spriteType = this.getMonsterSpriteType(monster);
      const paths = this.buildMonsterPaths(spriteType, cx, cy);
      this.strokeNeonPaths(ctx, paths, color, scale);

      ctx.restore();
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${scale < 0.6 ? 10 : scale < 1 ? 11 : 13}px 'Share Tech Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(`${monster.name} (Lv.${monster.level})`, cx, cy - 70, maxLabelWidth);

      const barW = Math.min(100, maxLabelWidth);
      const barH = 5;
      const pct = Math.max(0, monster.hp / monster.maxHp);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.fillRect(cx - barW / 2, cy - 62, barW, barH);
      ctx.fillStyle = monster.color || '#ff3b30';
      ctx.fillRect(cx - barW / 2, cy - 62, barW * pct, barH);
      ctx.strokeStyle = '#8e8e93';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - barW / 2, cy - 62, barW, barH);
    };

    dungeonRenderer.draw();
  });
}

test('Three-monster mobile render preserves distinct bodies and frame timing @visual', async ({ page }) => {
  await setupCombatScene(page);
  if (phase === 'before') await installLegacyMonsterRenderer(page);

  await page.screenshot({ path: screenshotPath, fullPage: true });

  const result = await page.evaluate(async () => {
    const { dungeonRenderer } = await import('/src/renderer.js');
    const canvas = document.querySelector('#dungeon-canvas');
    const ctx = canvas.getContext('2d');
    const originalDraw3DCorridors = dungeonRenderer.draw3DCorridors;
    dungeonRenderer.draw3DCorridors = () => {
      ctx.fillStyle = '#14242e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    const framesPerSample = 10;
    for (let i = 0; i < 3 * framesPerSample; i++) dungeonRenderer.draw();
    const samples = [];
    for (let i = 0; i < 60; i++) {
      const start = performance.now();
      for (let frame = 0; frame < framesPerSample; frame++) dungeonRenderer.draw();
      samples.push((performance.now() - start) / framesPerSample);
    }
    const sorted = [...samples].sort((a, b) => a - b);
    const mean = samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
    const percentile = (ratio) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];

    const pixel = (x, y) => {
      const data = ctx.getImageData(x, y, 1, 1).data;
      return [...data];
    };
    const bodyPixels = [67, 200, 333].map(x => pixel(x, 140));
    const shadowPixel = pixel(67, 165);

    dungeonRenderer.draw3DCorridors = originalDraw3DCorridors;
    dungeonRenderer.draw();

    return {
      meanMs: mean,
      p50Ms: percentile(0.5),
      p95Ms: percentile(0.95),
      bodyPixels,
      shadowPixel,
      backdropPixel: [20, 36, 46, 255],
    };
  });

  console.log(`[monster-render:${phase}] mean=${result.meanMs.toFixed(3)}ms p50=${result.p50Ms.toFixed(3)}ms p95=${result.p95Ms.toFixed(3)}ms`);
  console.log(`[monster-render:${phase}] pixels=${JSON.stringify(result)}`);
  expect(result.meanMs).toBeGreaterThan(0);

  if (phase === 'after') {
    expect(result.bodyPixels.every(pixelValue => pixelValue.join(',') !== result.backdropPixel.join(','))).toBe(true);
    expect(new Set(result.bodyPixels.map(pixelValue => pixelValue.join(','))).size).toBe(3);
    expect(result.shadowPixel[0]).toBeLessThan(result.backdropPixel[0]);
  }
});
