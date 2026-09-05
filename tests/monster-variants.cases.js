import { test, expect } from './fixtures/browser-health.js';

const ZOMBIES = [
  { name: 'ゾンビ', level: 2, hp: 32, maxHp: 32, color: '#8a2be2', spriteType: 'zombie' },
  { name: 'ポイズンジャイアント', level: 4, hp: 130, maxHp: 130, color: '#bf5af2', spriteType: 'zombie' },
  { name: 'アースジャイアント', level: 6, hp: 144, maxHp: 144, color: '#8a2be2', spriteType: 'zombie' },
  { name: '墓守の巨躯', level: 5, hp: 95, maxHp: 95, color: '#ff3b30', spriteType: 'zombie' },
  { name: 'アイアンゴーレム', level: 3, hp: 64, maxHp: 64, color: '#8e8e93', spriteType: 'zombie' },
  { name: 'リビングアーマー', level: 2, hp: 52, maxHp: 52, color: '#8e8e93', spriteType: 'zombie' },
  { name: 'ストーンガード', level: 5, hp: 110, maxHp: 110, color: '#708090', spriteType: 'zombie' },
  { name: 'カースドハンド', level: 3, hp: 40, maxHp: 40, color: '#5856d6', spriteType: 'zombie' },
  { name: '石像兵', level: 4, hp: 100, maxHp: 100, color: '#708090', spriteType: 'zombie' },
  { name: '反逆の鎧', level: 5, hp: 150, maxHp: 150, color: '#8e8e93', spriteType: 'zombie' },
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
  }, ZOMBIES);
}

test('Zombie visual variants stay deterministic and readable on a mobile canvas @visual', async ({ page }) => {
  await setupCombatScene(page);
  await page.screenshot({ path: 'output/playwright/monster-variants-after.png', fullPage: true });

  const metrics = await page.evaluate(async (monsters) => {
    const { dungeonRenderer } = await import('/src/renderer.js');
    const canvas = document.querySelector('#dungeon-canvas');
    const ctx = canvas.getContext('2d');
    const variants = monsters.map(monster => dungeonRenderer.getMonsterVisualVariant(monster));
    const detailPaths = monsters.map(monster => (
      dungeonRenderer.buildMonsterDetailPaths('zombie', monster.name)
    ));
    const deterministic = detailPaths.every((paths, index) => (
      paths === dungeonRenderer.buildMonsterDetailPaths('zombie', monsters[index].name)
    ));
    const signatureCanvas = document.createElement('canvas');
    signatureCanvas.width = 120;
    signatureCanvas.height = 120;
    const signatureCtx = signatureCanvas.getContext('2d');
    const detailSignatures = monsters.map(monster => {
      signatureCtx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
      signatureCtx.save();
      signatureCtx.translate(60, 60);
      const bodyPath = dungeonRenderer.buildMonsterPaths('zombie')[0];
      signatureCtx.fillStyle = '#888888';
      signatureCtx.fill(bodyPath);
      dungeonRenderer.drawMonsterDetails(
        signatureCtx,
        dungeonRenderer.buildMonsterDetailPaths('zombie', monster.name),
      );
      signatureCtx.restore();
      const pixels = signatureCtx.getImageData(0, 0, signatureCanvas.width, signatureCanvas.height).data;
      return pixels.reduce((hash, value) => ((hash * 31) + value) >>> 0, 7);
    });
    const darkLandmarkPixels = [];
    const centers = [40, 120, 200, 280, 360];
    for (const cy of [100, 210]) {
      for (const cx of centers) {
        const image = ctx.getImageData(cx - 20, cy - 32, 40, 42).data;
        let count = 0;
        for (let i = 0; i < image.length; i += 4) {
          if (image[i] < 16 && image[i + 1] < 22 && image[i + 2] < 26) count += 1;
        }
        darkLandmarkPixels.push(count);
      }
    }
    return {
      variants,
      pathCacheSize: dungeonRenderer.monsterPathCache.size,
      detailCacheSize: dungeonRenderer.monsterDetailCache.size,
      deterministic,
      detailSignatures,
      darkLandmarkPixels,
    };
  }, ZOMBIES);

  expect(metrics.variants).toEqual(ZOMBIES.map(monster => monster.name));
  expect(metrics.pathCacheSize).toBe(1);
  expect(metrics.detailCacheSize).toBe(ZOMBIES.length);
  expect(metrics.deterministic).toBe(true);
  expect(new Set(metrics.detailSignatures).size).toBe(ZOMBIES.length);
  expect(metrics.darkLandmarkPixels.filter(count => count > 0).length).toBeGreaterThanOrEqual(7);

  const timing = await page.evaluate(async () => {
    const { dungeonRenderer } = await import('/src/renderer.js');
    const canvas = document.querySelector('#dungeon-canvas');
    const ctx = canvas.getContext('2d');
    const originalDraw3DCorridors = dungeonRenderer.draw3DCorridors;
    const originalDrawMonsterDetails = dungeonRenderer.drawMonsterDetails;
    dungeonRenderer.draw3DCorridors = () => {
      ctx.fillStyle = '#14242e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    const measure = (withDetails) => {
      dungeonRenderer.drawMonsterDetails = withDetails ? originalDrawMonsterDetails : () => {};
      for (let i = 0; i < 30; i++) dungeonRenderer.draw();
      const samples = [];
      for (let i = 0; i < 60; i++) {
        const start = performance.now();
        for (let frame = 0; frame < 10; frame++) dungeonRenderer.draw();
        samples.push((performance.now() - start) / 10);
      }
      const sorted = [...samples].sort((a, b) => a - b);
      const meanMs = samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
      const percentile = ratio => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
      return { meanMs, p50Ms: percentile(0.5), p95Ms: percentile(0.95) };
    };

    const before = measure(false);
    const after = measure(true);
    dungeonRenderer.drawMonsterDetails = originalDrawMonsterDetails;
    dungeonRenderer.draw3DCorridors = originalDraw3DCorridors;
    return { before, after };
  });
  console.log(`[monster-variants-performance] before=${JSON.stringify(timing.before)} after=${JSON.stringify(timing.after)}`);
  expect(timing.after.p50Ms).toBeLessThanOrEqual(timing.before.p50Ms + 0.02);

  await page.evaluate(() => {
    document.documentElement.style.filter = 'grayscale(1)';
  });
  await page.screenshot({ path: 'output/playwright/monster-variants-monochrome.png', fullPage: true });

  await setupCombatScene(page);
  await page.evaluate(async () => {
    const { dungeonRenderer } = await import('/src/renderer.js');
    dungeonRenderer.drawMonsterDetails = () => {};
    dungeonRenderer.draw();
  });
  await page.screenshot({ path: 'output/playwright/monster-variants-before.png', fullPage: true });
});
