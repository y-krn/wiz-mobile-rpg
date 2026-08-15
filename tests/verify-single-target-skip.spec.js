import { test, expect } from '@playwright/test';

const MOBILE_VIEWPORT = { width: 390, height: 844 };
const OTHER_MOBILE_VIEWPORTS = [
  { width: 360, height: 800 },
  { width: 430, height: 932 }
];

async function openApp(page) {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
}

async function setupExplore(page, { partySize = 1, fullHp = false } = {}) {
  await page.evaluate(async ({ nextPartySize, nextFullHp }) => {
    const { state, initNewGame, createSoloCharacter } = await import('/src/state.js');
    const { executeEnterDungeon } = await import('/src/movement.js');
    const { spellMenuState } = await import('/src/spell_menu.js');
    const { updateUI } = await import('/src/ui.js');

    initNewGame();
    const first = createSoloCharacter('Priest');
    state.party = [first];
    executeEnterDungeon(1);

    const party = [first];
    for (let index = 1; index < nextPartySize; index++) {
      const ally = createSoloCharacter('Priest');
      ally.name = `Ally ${index}`;
      party.push(ally);
    }
    state.party = party;
    party.forEach((char, index) => {
      char.hp = nextFullHp ? char.maxHp : char.maxHp - index - 2;
    });
    spellMenuState.filter = 'all';
    spellMenuState.selectedKey = null;
    state.gameState = 'explore';
    updateUI();
  }, { nextPartySize: partySize, nextFullHp: fullHp });
}

async function setupCombat(page, { woundedCount = 1, deadSecond = false, spellKeys = null } = {}) {
  await page.evaluate(async ({ nextWoundedCount, nextDeadSecond, nextSpellKeys }) => {
    const { state, initNewGame, createSoloCharacter } = await import('/src/state.js');
    const { executeEnterDungeon } = await import('/src/movement.js');
    const { combatSelection } = await import('/src/combat.js');
    const { menuContext } = await import('/src/navigation.js');
    const { updateUI } = await import('/src/ui.js');

    initNewGame();
    const first = createSoloCharacter('Priest');
    state.party = [first];
    executeEnterDungeon(1);

    const second = createSoloCharacter('Priest');
    second.name = 'Ally 1';
    if (nextDeadSecond) {
      second.status = 'dead';
      second.hp = 0;
    } else if (nextWoundedCount > 1) {
      second.hp = second.maxHp - 3;
    }
    first.hp = nextWoundedCount > 0 ? first.maxHp - 2 : first.maxHp;
    if (nextSpellKeys) first.spells = nextSpellKeys;
    state.party = [first, second];
    state.inventory = ['HEAL_POTION'];
    state.combatState = {
      monsters: [{ name: '検証用モンスター', hp: 20, maxHp: 20 }],
      phase: 'choose_actions',
      isBoss: false,
      isMidboss: false,
      isRoamingFlack: false,
      isAuto: false,
      roundNumber: 1,
      pendingOutcome: null,
    };
    state.gameState = 'combat';
    state.transitioning = false;
    combatSelection.charIdx = 0;
    combatSelection.actions = [];
    menuContext.type = '';
    menuContext.spellName = '';
    updateUI();
  }, { nextWoundedCount: woundedCount, nextDeadSecond: deadSecond, nextSpellKeys: spellKeys });
}

test('explore skips a single valid target and keeps caster HP visible before casting', async ({ page }) => {
  await openApp(page);
  await setupExplore(page, { partySize: 1, fullHp: false });

  await page.locator('#btn-cast').click();
  await page.getByRole('button', { name: /^DIOS MP/ }).click();

  await expect(page.locator('#spell-overlay .spell-detail-caster-row')).toContainText('HP:');
  await expect(page.locator('#spell-overlay .spell-target-grid')).toHaveCount(0);

  const overlayAudit = await page.evaluate(() => {
    const panel = document.querySelector('#character-panel').getBoundingClientRect();
    const topElement = document.elementFromPoint(panel.left + panel.width / 2, panel.top + panel.height / 2);
    return {
      hudText: document.querySelector('#character-hud').textContent,
      coveringOverlay: topElement?.closest('#spell-overlay')?.id || null,
      detailText: document.querySelector('#spell-overlay .spell-detail-caster-row')?.textContent || ''
    };
  });
  expect(overlayAudit.coveringOverlay).toBe('spell-overlay');
  expect(overlayAudit.hudText).toContain('HP');
  expect(overlayAudit.detailText).toMatch(/HP:\s*\d+\/\d+/);

  await page.locator('#btn-spell-cast-action').click();
  await expect(page.locator('#spell-overlay')).toBeHidden();
  const result = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return { hp: state.party[0].hp, gameState: state.gameState };
  });
  expect(result.hp).toBeGreaterThan(5);
  expect(result.gameState).toBe('explore');
});

test('explore disables recovery when every ally is at full HP', async ({ page }) => {
  await openApp(page);
  await setupExplore(page, { partySize: 1, fullHp: true });

  await page.locator('#btn-cast').click();
  await page.getByRole('button', { name: /^DIOS MP/ }).click();
  await expect(page.locator('#btn-spell-cast-action')).toBeDisabled();
  await expect(page.locator('#spell-overlay')).toContainText('対象なし');
});

for (const viewport of OTHER_MOBILE_VIEWPORTS) {
  test(`single-target spell detail stays inside ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await openApp(page);
    await page.setViewportSize(viewport);
    await setupExplore(page, { partySize: 1, fullHp: false });

    await page.locator('#btn-cast').click();
    await page.getByRole('button', { name: /^DIOS MP/ }).click();
    const metrics = await page.evaluate(() => {
      const detail = document.querySelector('#spell-detail-panel').getBoundingClientRect();
      return {
        detailRight: detail.right,
        viewportWidth: document.documentElement.clientWidth,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
      };
    });
    expect(metrics.detailRight).toBeLessThanOrEqual(metrics.viewportWidth + 0.5);
    expect(metrics.horizontalOverflow).toBe(false);
  });
}

test('explore keeps the target screen when two valid allies remain', async ({ page }) => {
  await openApp(page);
  await setupExplore(page, { partySize: 2, fullHp: false });

  await page.locator('#btn-cast').click();
  await page.getByRole('button', { name: /^DIOS MP/ }).click();
  await page.locator('#btn-spell-cast-action').click();

  await expect(page.locator('#spell-overlay .spell-target-grid')).toBeVisible();
  await expect(page.locator('#spell-overlay .spell-target-card:not(.disabled)')).toHaveCount(2);
});

test('combat skips a single valid spell target and keeps enemy targeting available', async ({ page }) => {
  await openApp(page);
  await setupCombat(page, { woundedCount: 1, spellKeys: ['DIOS', 'BADIOS'] });

  await page.locator('#btn-combat-spell').click();
  await page.locator('#combat-overlay .combat-item-card.spell').filter({ has: page.locator('.spell-name').filter({ hasText: /^DIOS$/ }) }).click();
  await expect(page.locator('#combat-overlay')).toBeHidden();

  const spellAction = await page.evaluate(async () => {
    const { combatSelection } = await import('/src/combat.js');
    const { state } = await import('/src/state.js');
    return { action: combatSelection.actions[0], gameState: state.gameState };
  });
  expect(spellAction.action).toMatchObject({ type: 'spell', targetIdx: 0, spellName: 'DIOS' });
  expect(spellAction.gameState).toBe('combat');

  await page.locator('#btn-combat-spell').click();
  await page.locator('#combat-overlay .combat-item-card.spell').filter({ has: page.locator('.spell-name').filter({ hasText: /^BADIOS$/ }) }).click();
  await expect(page.locator('#combat-overlay')).toBeVisible();
  await expect(page.locator('#combat-overlay .combat-target-card.enemy')).toHaveCount(1);
});

test('combat keeps the target screen for two valid allies and disables full-HP targets', async ({ page }) => {
  await openApp(page);
  await setupCombat(page, { woundedCount: 2 });

  await page.locator('#btn-combat-spell').click();
  await page.locator('#combat-overlay .combat-item-card.spell').filter({ has: page.locator('.spell-name').filter({ hasText: /^DIOS$/ }) }).click();
  await expect(page.locator('#combat-overlay .combat-target-card.ally')).toHaveCount(2);
  await expect(page.locator('#combat-overlay .combat-target-card.ally:not(.blocked)')).toHaveCount(2);

  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { menuContext } = await import('/src/navigation.js');
    const { renderCombatOverlay } = await import('/src/combat_ui/combat_overlay.js');
    state.party[1].hp = state.party[1].maxHp;
    menuContext.type = 'combat_target';
    menuContext.targetType = 'ally';
    menuContext.spellName = 'DIOS';
    renderCombatOverlay();
  });
  await expect(page.locator('#combat-overlay .combat-target-card.ally.blocked')).toHaveCount(1);
});

test('combat disables recovery spells when no ally is a valid target and skips a single item target', async ({ page }) => {
  await openApp(page);
  await setupCombat(page, { woundedCount: 0, deadSecond: true });

  await page.locator('#btn-combat-spell').click();
  await expect(page.locator('#combat-overlay .combat-item-card.spell').filter({ has: page.locator('.spell-name').filter({ hasText: /^DIOS$/ }) })).toHaveClass(/disabled-unavailable/);
  await page.locator('#combat-overlay .btn-combat-back').click();
  await page.locator('#btn-combat-item').click();
  await page.locator('#combat-overlay .combat-item-card.item').filter({ hasText: '傷薬' }).click();

  const itemAction = await page.evaluate(async () => {
    const { combatSelection } = await import('/src/combat.js');
    return combatSelection.actions[0];
  });
  expect(itemAction).toMatchObject({ type: 'item', targetIdx: 0, itemKey: 'HEAL_POTION' });
  await expect(page.locator('#combat-overlay')).toBeHidden();
});
