import { test, expect } from './fixtures/browser-health.js';

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

async function installCombat(page, partyFactory) {
  await page.goto('/?renderer=canvas');
  await page.evaluate(async (partyKits) => {
    const { state, createStartingKitCharacter } = await import('/src/state.js');
    const { menuContext } = await import('/src/navigation.js');
    const { combatSelection } = await import('/src/combat.js');
    const { updateUI } = await import('/src/ui.js');
    const { __setTelemetryClientForTests, trackRunStart } = await import('/src/telemetry.js');

    state.party = partyKits.map(kitId => createStartingKitCharacter(kitId));
    state.combatState = {
      phase: 'choose_actions',
      monsters: [
        { name: '対象A', hp: 100, maxHp: 100, magicResist: 0, tags: [] },
        { name: '対象B', hp: 80, maxHp: 80, magicResist: 0, tags: [] },
      ],
      roundNumber: 1,
      isAuto: false,
      pendingOutcome: null,
    };
    state.map = [[{ walls: [false, false, false, false], type: 'empty' }]];
    state.visitedMap = [[true]];
    state.x = 0;
    state.y = 0;
    state.dir = 0;
    state.gameState = 'combat';
    state.transitioning = false;
    Object.assign(menuContext, {
      type: '',
      targetType: '',
      actorIdx: -1,
      spellName: '',
      prevGameState: null,
    });
    combatSelection.charIdx = 0;
    combatSelection.actions = [];
    window.__targetTelemetry = [];
    __setTelemetryClientForTests({ capture: (name, properties) => window.__targetTelemetry.push({ name, properties }) });
    trackRunStart(state.currentRun || {}, state.party[0], state);
    updateUI();
  }, partyFactory);
}
async function clickCanvasMonster(page, layoutIndex = 0) {
  const point = await page.evaluate(async (index) => {
    const { dungeonRenderer } = await import('/src/renderer.js');
    const canvas = document.querySelector('#dungeon-canvas');
    const rect = canvas.getBoundingClientRect();
    const { state } = await import('/src/state.js');
    const regions = dungeonRenderer.getRenderInput().combatMonsters
      .map((monster, monsterIndex) => ({ monster, monsterIndex }))
      .filter(({ monster }) => monster.hp > 0);
    const target = regions[index];
    const layout = (await import('/src/renderer.js')).getCombatMonsterLayout(state.combatState.monsters)[index];
    const scale = Math.min(rect.width / 400, rect.height / 260);
    return {
      x: (layout.hitRegion.x + layout.hitRegion.width / 2) * scale + (rect.width - 400 * scale) / 2,
      y: (layout.hitRegion.y + layout.hitRegion.height / 2) * scale + (rect.height - 260 * scale) / 2,
      targetIndex: target.monsterIndex,
    };
  }, layoutIndex);
  await page.locator('#dungeon-canvas').click({ position: { x: point.x, y: point.y } });
  return point.targetIndex;
}

async function clickCanvasInternalPoint(page, internalPoint) {
  const point = await page.evaluate(({ x, y }) => {
    const rect = document.querySelector('#dungeon-canvas').getBoundingClientRect();
    const scale = Math.min(rect.width / 400, rect.height / 260);
    return {
      x: x * scale + (rect.width - 400 * scale) / 2,
      y: y * scale + (rect.height - 260 * scale) / 2,
    };
  }, internalPoint);
  await page.locator('#dungeon-canvas').click({ position: point });
}

for (const viewport of VIEWPORTS) {
  test(`単体敵の明確なCanvas空白は対象にしない (${viewport.width}px) @e2e @smoke`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await installCombat(page, ['vanguard']);
    await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const { updateUI } = await import('/src/ui.js');
      state.combatState.monsters = [state.combatState.monsters[0]];
      updateUI();
    });

    await page.locator('#btn-combat-fight').click();
    await clickCanvasInternalPoint(page, { x: 10, y: 10 });
    await expect(page.locator('#combat-overlay')).toBeVisible();
    await expect.poll(() => page.evaluate(async () => {
      const { combatSelection } = await import('/src/combat.js');
      return combatSelection.actions.length;
    })).toBe(0);

    await clickCanvasMonster(page);
    await expect(page.locator('#combat-overlay')).toBeHidden();
    await expect.poll(() => page.evaluate(async () => {
      const { combatSelection } = await import('/src/combat.js');
      return combatSelection.actions[0];
    })).toMatchObject({ type: 'fight', actorIdx: 0, targetIdx: 0 });
    expect(await page.evaluate(() => window.__targetTelemetry
      .filter((event) => event.name.startsWith('ux_decision_'))
      .map((event) => [event.name, event.properties.surface, event.properties.resolution]))).toEqual([
      ['ux_decision_opened', 'combat_target', undefined],
      ['ux_decision_resolved', 'combat_target', 'commit'],
    ]);
  });

  test(`攻撃後にCanvasの敵タップで行動を確定できる (${viewport.width}px) @e2e @smoke`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await installCombat(page, ['vanguard', 'arcana']);

    await page.locator('#btn-combat-fight').click();
    const overlay = page.locator('#combat-overlay');
    await expect(overlay).toBeVisible();
    await expect(overlay.locator('.combat-target-selection-message')).toHaveText('敵をタップして対象を選択');
    await expect(overlay.locator('.combat-target-card.enemy')).toHaveCount(0);
    await expect(page.locator('#dungeon-canvas')).toHaveAttribute('aria-describedby', 'combat-target-instructions');

    const targetIndex = await clickCanvasMonster(page);
    await expect(overlay).toBeHidden();
    await expect(page.locator('#combat-controls')).toBeVisible();
    await expect.poll(() => page.evaluate(async () => {
      const { combatSelection } = await import('/src/combat.js');
      return combatSelection.actions[0];
    })).toMatchObject({ type: 'fight', actorIdx: 0, targetIdx: targetIndex });
  });

  test(`単体魔法後にCanvasの敵タップで行動を確定できる (${viewport.width}px) @e2e @smoke`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await installCombat(page, ['arcana', 'vanguard']);
    await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      state.party[0].mp = state.party[0].maxMp = 10;
    });

    await page.locator('#btn-combat-spell').click();
    const halito = page.locator('#combat-overlay .combat-item-card.spell', {
      has: page.locator('.spell-name', { hasText: /^HALITO$/ }),
    });
    await expect(halito).toBeVisible();
    await halito.click();

    await expect(page.locator('#combat-overlay .combat-target-selection-message')).toHaveText('敵をタップして対象を選択');
    await clickCanvasMonster(page);
    await expect(page.locator('#combat-overlay')).toBeHidden();
    await expect.poll(() => page.evaluate(async () => {
      const { combatSelection } = await import('/src/combat.js');
      return combatSelection.actions[0];
    })).toMatchObject({ type: 'spell', actorIdx: 0, targetIdx: 0, spellName: 'HALITO' });
  });
}

test('敵対象Canvasはdead敵をhit-testせず、戻るは行動を確定しない @e2e @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installCombat(page, ['vanguard']);
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    state.combatState.monsters[0].hp = 0;
    const { updateUI } = await import('/src/ui.js');
    updateUI();
  });

  await page.locator('#btn-combat-fight').click();
  await expect(page.locator('#combat-overlay .combat-target-a11y')).toHaveCount(1);
  await expect(page.locator('#combat-overlay .combat-target-a11y')).toContainText('対象B');

  const deadCommit = await page.evaluate(async () => {
    const { commitCombatTarget } = await import('/src/combat_ui/combat_overlay.js');
    const { combatSelection } = await import('/src/combat.js');
    return { committed: commitCombatTarget(0), actionCount: combatSelection.actions.length };
  });
  expect(deadCommit).toEqual({ committed: false, actionCount: 0 });

  const deadTarget = await page.evaluate(async () => {
    const { dungeonRenderer } = await import('/src/renderer.js');
    const { state } = await import('/src/state.js');
    const rect = document.querySelector('#dungeon-canvas').getBoundingClientRect();
    const scale = Math.min(rect.width / 400, rect.height / 260);
    const layout = (await import('/src/renderer.js')).getCombatMonsterLayout(state.combatState.monsters);
    const point = {
      x: (layout[0].hitRegion.x + layout[0].hitRegion.width / 2) * scale + (rect.width - 400 * scale) / 2,
      y: (layout[0].hitRegion.y + layout[0].hitRegion.height / 2) * scale + (rect.height - 260 * scale) / 2,
    };
    return {
      point,
      target: dungeonRenderer.getCombatTargetAtClientPoint(rect.left + point.x, rect.top + point.y),
    };
  });
  expect(deadTarget.target).toBe(1);

  await page.locator('#combat-overlay .btn-combat-back').click();
  await expect(page.locator('#combat-overlay')).toBeHidden();
  await expect.poll(() => page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { combatSelection } = await import('/src/combat.js');
    return { gameState: state.gameState, actionCount: combatSelection.actions.length, deadHp: state.combatState.monsters[0].hp };
  })).toEqual({ gameState: 'combat', actionCount: 0, deadHp: 0 });
  expect(await page.evaluate(() => window.__targetTelemetry
    .filter((event) => event.name.startsWith('ux_decision_'))
    .map((event) => [event.name, event.properties.surface, event.properties.resolution]))).toEqual([
    ['ux_decision_opened', 'combat_target', undefined],
    ['ux_decision_resolved', 'combat_target', 'cancel'],
  ]);
});
