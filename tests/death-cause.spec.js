import { test, expect } from './fixtures/browser-health.js';

test('real trap, status, and combat deaths keep structured causes', async ({ page }) => {
  await page.goto('/');

  const deaths = await page.evaluate(async () => {
    const { state, createDefaultCurrentRun, createSoloCharacter } = await import('/src/state.js');
    const { triggerTrap } = await import('/src/systems/traps.js');
    const { applyExplorationPoison } = await import('/src/movement.js');
    const { applyPartyDamage } = await import('/src/combat_logic/damage.js');

    const setup = () => {
      state.floor = 5;
      state.logs = [];
      state.combatState = null;
      state.currentRun = createDefaultCurrentRun();
      state.party = [createSoloCharacter('Fighter'), createSoloCharacter('Fighter')];
      state.party[0].name = '検証対象';
      state.party[1].name = '生存対象';
      state.party[0].hp = 1;
      state.party[1].hp = 20;
      state.party[0].status = 'ok';
      state.party[1].status = 'ok';
    };

    setup();
    triggerTrap({ type: 'damage' }, false);
    const trap = state.currentRun.deathLogs.at(-1);

    setup();
    state.party[0].status = 'poisoned';
    const originalRandom = Math.random;
    Math.random = () => 0;
    try {
      applyExplorationPoison();
    } finally {
      Math.random = originalRandom;
    }
    const status = state.currentRun.deathLogs.at(-1);

    setup();
    state.combatState = { roundNumber: 3 };
    applyPartyDamage(state, { actions: [] }, [], 'ゴブリン A', 1, 1);
    const combat = state.currentRun.deathLogs.at(-1);

    return { trap, status, combat };
  });

  expect(deaths.trap).toMatchObject({ cause: '仕掛けられた罠', type: 'trap', source: '床のダメージ罠' });
  expect(deaths.status).toMatchObject({ cause: '毒のダメージ', type: 'status', source: '毒' });
  expect(deaths.combat).toMatchObject({ cause: 'ゴブリン Aの攻撃', type: 'combat', source: 'ゴブリン', turn: 3 });
});

test('spring poison uses the finite exploration lifecycle', async ({ page }) => {
  await page.goto('/');

  const lifecycle = await page.evaluate(async () => {
    const { state, createDefaultCurrentRun, createSoloCharacter, initNewGame } = await import('/src/state.js');
    const { renderEventSpring } = await import('/src/menu/explore_actions.js');
    const { applyExplorationPoison } = await import('/src/movement.js');
    const { STATUS_EFFECT_IDS } = await import('/src/combat_logic/status_effects.js');

    initNewGame();
    state.party = [createSoloCharacter('Mage')];
    state.party[0].hp = 20;
    state.currentRun = createDefaultCurrentRun();
    state.floor = 1;
    state.gameState = 'submenu';
    state.maps[0][state.y][state.x].event = 'event_spring';

    const options = document.getElementById('submenu-options');
    options.replaceChildren();
    const originalRandom = Math.random;
    const springRolls = [0.75, 0, 0.4];
    Math.random = () => springRolls.shift() ?? 0.99;
    try {
      renderEventSpring(options);
      options.querySelector('button').click();
    } finally {
      Math.random = originalRandom;
    }

    const afterSpring = {
      status: state.party[0].status,
      remainingTurns: state.party[0].statusEffects[STATUS_EFFECT_IDS.POISONED]?.remainingTurns,
      source: state.party[0].statusEffects[STATUS_EFFECT_IDS.POISONED]?.source,
      logs: state.logs.slice(-2)
    };

    const step = () => {
      const savedRandom = Math.random;
      Math.random = () => 0.99;
      try {
        applyExplorationPoison();
      } finally {
        Math.random = savedRandom;
      }
    };
    step();
    const afterFirstStep = {
      status: state.party[0].status,
      remainingTurns: state.party[0].statusEffects[STATUS_EFFECT_IDS.POISONED]?.remainingTurns
    };
    for (let i = 0; i < afterSpring.remainingTurns - 1; i++) step();

    return {
      afterSpring,
      afterFirstStep,
      afterExpiry: {
        status: state.party[0].status,
        hasPoison: Boolean(state.party[0].statusEffects[STATUS_EFFECT_IDS.POISONED])
      }
    };
  });

  expect(lifecycle.afterSpring).toMatchObject({
    status: 'poisoned',
    remainingTurns: 9,
    source: 'spring'
  });
  expect(lifecycle.afterSpring.logs[0]).toMatch(/^\[!\] .+は毒に侵された。$/);
  expect(lifecycle.afterSpring.logs[1]).toBe('毒はそれほど深くない。やがて体から抜けるだろう。');
  expect(lifecycle.afterSpring.logs.join(' ')).not.toMatch(/10歩|残り\d+歩/);
  expect(lifecycle.afterFirstStep).toEqual({ status: 'poisoned', remainingTurns: 8 });
  expect(lifecycle.afterExpiry).toEqual({ status: 'ok', hasPoison: false });
});

test('stone tablet trap death is recorded instead of using the old fallback', async ({ page }) => {
  await page.goto('/');

  const death = await page.evaluate(async () => {
    const { state, createDefaultCurrentRun, createSoloCharacter, initNewGame } = await import('/src/state.js');
    const { renderEventTablet } = await import('/src/menu/explore_actions.js');

    initNewGame();
    const character = createSoloCharacter('Fighter');
    character.hp = 1;
    state.party = [character];
    state.currentRun = createDefaultCurrentRun();
    state.floor = 1;
    state.gameState = 'submenu';
    state.maps[0][state.y][state.x].event = 'event_tablet';
    Math.random = () => 0.5;

    const options = document.getElementById('submenu-options');
    options.replaceChildren();
    renderEventTablet(options);
    options.querySelector('button').click();

    return {
      runDeath: state.currentRun.deathLogs.at(-1),
      deathLog: state.deathLogs.at(-1),
      gameState: state.gameState,
    };
  });

  expect(death.gameState).toBe('result');
  expect(death.runDeath).toMatchObject({ cause: '石碑の罠', type: 'trap', source: '石碑の矢罠' });
  expect(death.deathLog).toMatchObject({ cause: '石碑の罠', type: 'trap', source: '石碑の矢罠' });
  expect(death.deathLog.cause).not.toBe('不測の罠またはダメージ');
});

for (const viewport of [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test(`castle death summary is ordered and thumb-safe at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const { updateUI } = await import('/src/ui.js');
      state.gameState = 'town';
      state.currentRun = null;
      state.inventory = [];
      state.deathLogs = [
        { floor: 5, cause: '火炎の罠', type: 'trap', source: '火炎の罠' },
        { floor: 5, cause: '火炎の罠', type: 'trap', source: '火炎の罠' },
        { floor: 3, cause: 'ゴブリンの攻撃', type: 'combat', source: 'ゴブリン' },
        { floor: 2, cause: '過去の戦闘' },
      ];
      updateUI();
    });

    await page.locator('#btn-town-castle').click();
    await page.getByRole('button', { name: '全滅ログ確認' }).click();
    const summaryRows = page.locator('.death-cause-row');
    await expect(summaryRows).toHaveCount(2);
    await expect(summaryRows.nth(0)).toContainText('B5F 火炎の罠 ×2');
    await expect(summaryRows.nth(1)).toContainText('B3F ゴブリンとの戦闘 ×1');
    await expect(page.locator('.death-unclassified-note')).toContainText('1件');
    const countermeasure = page.locator('.death-countermeasure');
    await expect(countermeasure).toContainText('準備を見直す');
    await expect(countermeasure).toContainText('広がった可能性を見る');
    for (const specificSolution of ['罠外しキット', '罠喰いの記憶', '解毒薬', '目薬', '守りの薬', '生命鍛錬']) {
      await expect(countermeasure).not.toContainText(specificSolution);
    }

    const layout = await page.evaluate(() => ({
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      buttons: [...document.querySelectorAll('.death-countermeasure-button')].map(button => {
        const box = button.getBoundingClientRect();
        return { height: box.height, left: box.left, right: box.right };
      }),
    }));
    expect(layout.horizontalOverflow).toBe(false);
    for (const button of layout.buttons) {
      expect(button.height).toBeGreaterThanOrEqual(44);
      expect(button.left).toBeGreaterThanOrEqual(0);
      expect(button.right).toBeLessThanOrEqual(viewport.width);
    }

    await page.getByRole('button', { name: /^準備を見直す/ }).click();
    await expect(page.locator('.solo-starting-kit-option').first()).toBeVisible();
    await page.locator('#btn-submenu-back').click();
    await page.getByRole('button', { name: /^広がった可能性を見る/ }).click();
    await expect(page.locator('.workshop-purpose[data-workshop-purpose="possibilities"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /生命鍛錬/ })).toHaveCount(0);
  });
}

test('castle death summary remains usable with zero logs', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { openSubmenu } = await import('/src/navigation.js');
    state.gameState = 'town';
    state.deathLogs = [];
    openSubmenu('castle_death_logs', 'おしろ - 全滅ログ');
  });

  await expect(page.locator('.detail-placeholder')).toHaveText('全滅の記録はありません。');
  await expect(page.locator('.death-cause-row')).toHaveCount(0);
});
