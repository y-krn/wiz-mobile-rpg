import { test, expect } from './fixtures/browser-health.js';
test('Archives list restores scroll after detail and resets on navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { MONSTERS, ITEMS } = await import('/src/data.js');
    const { openArchivesOverlay } = await import('/src/ui.js');

    state.codex.monsters = Object.fromEntries(
      MONSTERS.map((monster) => [monster.name, { encountered: 1, killed: 1 }]),
    );
    state.codex.equipment = Object.fromEntries(
      Object.entries(ITEMS)
        .filter(([, item]) => ['weapon', 'armor', 'shield', 'accessory'].includes(item.type))
        .map(([key]) => [key, {
          foundCount: 1,
          highestRarity: 'common',
          bestBonus: 0,
          affixesSeen: [],
          firstFoundAt: 'B1F',
        }]),
    );
    openArchivesOverlay();
  });

  const body = page.locator('#archives-overlay .archives-body');

  for (const tab of ['monsters', 'equipment']) {
    if (tab === 'equipment') {
      await page.getByRole('button', { name: '🛡️ 装備' }).click();
    }

    const initialScrollTop = await body.evaluate((element) => {
      element.scrollTop = Math.floor(element.scrollHeight / 2);
      return element.scrollTop;
    });
    expect(initialScrollTop).toBeGreaterThan(0);
    await expect.poll(async () => page.evaluate(async () => {
      const { archivesState } = await import('/src/ui/archives_overlay.js');
      return archivesState.listScrollTop;
    })).toBe(initialScrollTop);

    await page.locator('#archives-overlay .codex-row').last().click();
    const savedScrollTop = await page.evaluate(async () => {
      const { archivesState } = await import('/src/ui/archives_overlay.js');
      return archivesState.listScrollTop;
    });
    expect(savedScrollTop).toBeGreaterThan(0);
    await page.getByRole('button', { name: '一覧に戻る' }).click();
    await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBe(savedScrollTop);
  }

  await page.getByRole('button', { name: '👿 敵' }).click();
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBe(0);

  await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.getByRole('button', { name: '❌ 閉じる' }).click();
  await page.evaluate(async () => {
    const { openArchivesOverlay } = await import('/src/ui.js');
    openArchivesOverlay();
  });
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBe(0);
});

test('Archives shows only combat observations for a flash bat', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { openArchivesOverlay } = await import('/src/ui.js');

    state.codex.monsters['フラッシュバット'] = {
      encountered: 1,
      killed: 1,
      observedActions: ['通常攻撃'],
      observedConditions: ['盲目を受けた']
    };
    openArchivesOverlay();
  });

  await page.locator('#archives-overlay .codex-row', { hasText: 'フラッシュバット' }).click();
  const detail = page.locator('#archives-overlay .codex-detail');
  await expect(detail).toContainText('通常攻撃');
  await expect(detail).toContainText('盲目を受けた');
  await expect(detail).toContainText('妨害役');
  await expect(detail).not.toContainText('盲目を付与');
  await expect(detail).toContainText('???');
});

test('Archives keeps unknown monster knowledge and removes kill-count spoilers', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { openArchivesOverlay } = await import('/src/ui.js');
    state.codex.monsters['ワーウルフ'] = {
      encountered: 12,
      killed: 10,
      observedActions: ['通常攻撃'],
      observedLoot: ['獣の牙'],
      encounterFloors: { '7': 2, '9': 10 },
      firstEncounterFloor: 7,
      lastEncounterFloor: 9,
      magicResistKnown: false,
      physResistKnown: true
    };
    openArchivesOverlay();
  });

  await page.locator('#archives-overlay .codex-row', { hasText: 'ワーウルフ' }).click();
  const detail = page.locator('#archives-overlay .codex-detail');
  await expect(detail).toContainText('生態');
  await expect(detail).toContainText('行動');
  await expect(detail).toContainText('耐性・弱点');
  await expect(detail).toContainText('確認した戦利品');
  await expect(detail).toContainText('あなたの記録');
  await expect(detail).toContainText('B7F');
  await expect(detail).toContainText('B9F');
  await expect(detail).toContainText('獣の牙');
  await expect(detail).not.toContainText('HP:');
  await expect(detail).not.toContainText('攻略メモ');
  await expect(detail).not.toContainText('毒避け');
});

test('Equipment archives present observed knowledge without exposing affix ids or drop rates', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { openArchivesOverlay } = await import('/src/ui.js');

    state.codex.equipment = {
      FLAME_SWORD: {
        discovered: true,
        foundCount: 5,
        highestRarity: 'epic',
        bestBonus: 4,
        affixesSeen: ['firstTurnAttack'],
        foundFloors: { '3': 1, '4': 3, '5': 1 },
        tagObservations: { fire: 2, blade: 2 },
        firstFoundAt: 'B3F',
      },
    };
    openArchivesOverlay();
  });

  await page.getByRole('button', { name: '🛡️ 装備' }).click();
  await page.locator('#archives-overlay .codex-row', { hasText: 'フレイムソード' }).click();
  const detail = page.locator('#archives-overlay .codex-detail');
  await expect(detail).toContainText('基礎攻撃力: 21');
  await expect(detail).toContainText('装備: 全員（ビルド自由）');
  await expect(detail).toContainText('火のルーンを刻んだ剣');
  await expect(detail).toContainText('初陣');
  await expect(detail).toContainText('B3F');
  await expect(detail).toContainText('B4F');
  await expect(detail).toContainText('B5F');
  await expect(detail).toContainText('炎');
  await expect(detail).toContainText('刀剣');
  await expect(detail).not.toContainText('firstTurnAttack');
  await expect(detail).not.toContainText('ドロップ率');
});

test('Archives touch return does not leave a hover state on another row', async ({ browser }) => {
  for (const viewport of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    const context = await browser.newContext({
      viewport,
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();

    try {
      await page.goto('/');
      await page.evaluate(async () => {
        const { state } = await import('/src/state.js');
        const { openArchivesOverlay } = await import('/src/ui.js');

        state.codex.monsters['かみつき蟲'] = { encountered: 1, killed: 1 };
        openArchivesOverlay();
      });

      await page.locator('#archives-overlay .codex-row', { hasText: 'かみつき蟲' }).tap();
      await page.getByRole('button', { name: '一覧に戻る' }).tap();
      const hoverCandidate = page.locator('#archives-overlay .codex-row').nth(5);
      await hoverCandidate.hover();
      await expect.poll(() => hoverCandidate.evaluate((element) => getComputedStyle(element).borderColor))
        .toBe('rgb(51, 51, 51)');
    } finally {
      await context.close();
    }
  }
});

test('Archives rows keep hover feedback for mouse pointers', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { openArchivesOverlay } = await import('/src/ui.js');

    state.codex.monsters['かみつき蟲'] = { encountered: 1, killed: 1 };
    openArchivesOverlay();
  });

  const row = page.locator('#archives-overlay .codex-row', { hasText: 'かみつき蟲' });
  const defaultBorder = await row.evaluate((element) => getComputedStyle(element).borderColor);
  await row.hover();
  await expect.poll(() => row.evaluate((element) => getComputedStyle(element).borderColor))
    .not.toBe(defaultBorder);
});

test('Archives run history labels canonical and legacy abandoned runs', async ({ browser }) => {
  for (const viewport of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();

    try {
      await page.goto('/');
      await page.evaluate(async () => {
        const { state } = await import('/src/state.js');
        const { openArchivesOverlay } = await import('/src/ui.js');

        state.runHistory = [
          { outcome: 'abandon', endedAt: 0, result: 'failed', dangerRank: 1, deepestFloor: 2, kills: 0, chestsOpened: 0 },
          { returnReason: 'abandon', endedAt: 0, result: 'failed', dangerRank: 1, deepestFloor: 2, kills: 0, chestsOpened: 0 },
          { outcome: 'death', endedAt: 0, result: 'failed', dangerRank: 1, deepestFloor: 2, kills: 0, chestsOpened: 0 },
        ];
        openArchivesOverlay();
      });

      await page.getByRole('button', { name: '📜 記録' }).click();
      const history = page.locator('#archives-overlay .archives-body');
      await expect(history).toContainText('断念');
      expect(await history.locator('strong').allTextContents()).toEqual([
        expect.stringContaining('断念'),
        expect.stringContaining('断念'),
        expect.stringContaining('死亡'),
      ]);
    } finally {
      await context.close();
    }
  }
});
