import { test, expect } from './fixtures/browser-health.js';

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

async function seedPortalRun(page) {
  await page.evaluate(async () => {
    const { createDefaultCurrentRun, createStartingKitCharacter, state } = await import('/src/state.js');
    const { openSubmenu } = await import('/src/navigation.js');
    const { __setTelemetryClientForTests, trackRunStart } = await import('/src/telemetry.js');

    state.party = [createStartingKitCharacter('vanguard')];
    state.party[0].hp = 12;
    state.party[0].mp = 0;
    state.currentRun = createDefaultCurrentRun();
    state.currentRun.runSeed = 'PORTAL-WING-UI';
    state.currentRun.startedAt = 1;
    state.currentRun.materials = { '獣の牙': 3, '鉄片': 2 };
    state.currentRun.townInventory = ['TOWN_PORTAL'];
    state.currentRun.departureCraftItems = ['TOWN_PORTAL'];
    state.currentRun.unbankedObjectLoot = [
      { id: 'loot-sword', item: { baseId: 'LONG_SWORD', instanceId: 'sword-1', identified: true } },
      { id: 'loot-potion', item: 'GREATER_HEAL' },
      { id: 'loot-equipped', item: { baseId: 'SHORT_SWORD', instanceId: 'equipped-1', identified: true } },
    ];
    state.inventory = ['TOWN_PORTAL', 'GREATER_HEAL'];
    state.party[0].equipment.weapon = state.currentRun.unbankedObjectLoot[2].item;
    state.floor = 5;
    state.gameState = 'explore';
    window.__portalTelemetry = [];
    __setTelemetryClientForTests({ capture: (name, properties) => window.__portalTelemetry.push({ name, properties }) });
    trackRunStart(state.currentRun, state.party[0], state);
    openSubmenu('milestone_portal', 'B5F帰還の門');
  });
}

for (const viewport of VIEWPORTS) {
  test(`Portal decision is explicit and thumb-safe at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await seedPortalRun(page);
    // Revisit buckets compare Date.now() gaps; freeze it so slow CI stays in the immediate bucket.
    await page.clock.setFixedTime(new Date('2026-01-01T00:00:00Z'));

    // HP and MP stay on the adventurer panel under the menu; the portal does
    // not repeat them.
    await expect(page.locator('.milestone-portal-vitals')).toHaveCount(0);
    await expect(page.locator('#character-hud .hp-row .bar-value')).toHaveText('12/45');
    await expect(page.locator('#character-hud')).toBeVisible();
    await expect(page.locator('.milestone-portal-bag')).toHaveAttribute('aria-label', 'バッグ 2/20枠');
    const portalText = await page.locator('#submenu-options').textContent();
    expect(portalText).toContain('未使用品 1個');
    expect(portalText).toContain('賭け金');
    expect(portalText).not.toContain('まだ持ち帰っていない戦果');
    expect(portalText).not.toMatch(/object loot|\bReturn\b|\bPush\b|\brun\b/);
    // The dungeon ends on this floor (#2060): there is no next band to hint at.
    await expect(page.locator('[data-info-role="next-band-clue"]')).toHaveCount(0);

    const choices = page.locator('.milestone-portal-choice-card > .milestone-portal-choice');
    await expect(choices).toHaveCount(2);
    const choiceBoxes = await choices.evaluateAll(buttons => buttons.map(button => {
      const box = button.getBoundingClientRect();
      return { height: box.height, width: box.width };
    }));
    expect(choiceBoxes[0].height).toBeGreaterThanOrEqual(44);
    expect(choiceBoxes[1].height).toBeGreaterThanOrEqual(44);
    expect(choiceBoxes[0].height).toBeCloseTo(choiceBoxes[1].height, 1);
    expect(choiceBoxes[0].width).toBeCloseTo(choiceBoxes[1].width, 1);

    await page.locator('.milestone-portal-choice-card[data-portal-decision="return"] button').click();
    await page.locator('#btn-portal-change').click();
    await page.locator('.milestone-portal-choice-card[data-portal-decision="push"] button').click();
    await expect(page.locator('.milestone-portal-confirmation')).toContainText('まだこの階に残りますか？');
    await expect(page.locator('.milestone-portal-confirmation')).toContainText('素材と未使用の持ち込み品を賭けたまま');
    await page.locator('#btn-portal-confirm').click();
    await expect(page.locator('#explore-controls')).toBeVisible();
    const lootAfterPush = await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      return { count: state.currentRun.unbankedObjectLoot.length, inventory: state.inventory.slice() };
    });
    expect(lootAfterPush).toEqual({ count: 3, inventory: ['TOWN_PORTAL', 'GREATER_HEAL'] });

    await page.evaluate(async () => {
      const { openSubmenu } = await import('/src/navigation.js');
      openSubmenu('milestone_portal', 'B5F帰還の門');
    });
    await page.locator('.milestone-portal-choice-card[data-portal-decision="return"] button').click();
    await expect(page.locator('.milestone-portal-confirmation')).toContainText('ここで帰還しますか？');
    await page.locator('#btn-portal-confirm').click();
    await expect(page.locator('#result-overlay')).toBeVisible();
    await expect(page.locator('#result-overlay')).toContainText('帰還');
    expect(await page.evaluate(() => window.__portalTelemetry
      .filter((event) => event.name.startsWith('ux_decision_'))
      .map((event) => ({ name: event.name, surface: event.properties.surface, resolution: event.properties.resolution, revisit: event.properties.revisitBucket })))).toEqual([
      { name: 'ux_decision_opened', surface: 'portal', resolution: undefined, revisit: 'none' },
      { name: 'ux_decision_resolved', surface: 'portal', resolution: 'back', revisit: undefined },
      { name: 'ux_decision_opened', surface: 'portal', resolution: undefined, revisit: 'immediate' },
      { name: 'ux_decision_resolved', surface: 'portal', resolution: 'commit', revisit: undefined },
      { name: 'ux_decision_opened', surface: 'portal', resolution: undefined, revisit: 'immediate' },
      { name: 'ux_decision_resolved', surface: 'portal', resolution: 'commit', revisit: undefined },
    ]);
    expect(await page.evaluate(() => window.__portalTelemetry
      .filter((event) => event.name === 'portal_decision')
      .map((event) => event.properties.decision))).toEqual(['push', 'return']);
  });
}

test('Wing confirms only protected stakes, preserves the item on cancel, and banks all loot', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await seedPortalRun(page);
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { openSubmenu } = await import('/src/navigation.js');
    state.currentRun.departureCraftItems = ['TOWN_PORTAL', 'GREATER_HEAL'];
    state.storageMax = 0;
    state.gameState = 'explore';
    openSubmenu('item_inventory', 'バッグ');
  });

  await page.getByRole('button', { name: '帰還の翼' }).click();
  await expect(page.locator('#confirm-dialog')).toContainText('素材 5個');
  await expect(page.locator('#confirm-dialog')).toContainText('未使用の持ち込み品 1個');
  await expect(page.locator('#confirm-dialog')).toContainText('倉庫満杯のため未使用品 1個は戻らない');
  await page.locator('#btn-confirm-dialog-cancel').click();
  const afterCancel = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return { inventory: state.inventory.slice(), gameState: state.gameState };
  });
  expect(afterCancel.inventory).toEqual(['TOWN_PORTAL', 'GREATER_HEAL']);
  expect(afterCancel.gameState).toBe('submenu');

  await page.getByRole('button', { name: '帰還の翼' }).click();
  await page.locator('#btn-confirm-dialog-accept').click();
  await expect(page.locator('#result-overlay')).toBeVisible();
  const afterConfirm = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return {
      inventory: state.inventory.slice(),
      banked: state.currentRun.bankedObjectLoot.length,
      lost: state.currentRun.lostObjectLoot.length,
      equipped: state.party[0].equipment.weapon,
    };
  });
  expect(afterConfirm.inventory).toEqual([]);
  expect(afterConfirm.banked).toBe(3);
  expect(afterConfirm.lost).toBe(0);
  expect(afterConfirm.equipped).toBeNull();
  expect(await page.evaluate(() => window.__portalTelemetry
    .filter((event) => event.name === 'portal_decision')
    .map((event) => [event.properties.portalType, event.properties.decision, Object.hasOwn(event.properties, 'wingSalvageCount')]))).toEqual([
    ['return_wing', 'return', false],
  ]);
});

test('Stakes summary explains supply overflow when storage is full', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const text = await page.evaluate(async () => {
    const { createDefaultCurrentRun, state } = await import('/src/state.js');
    const { createRunStakesSummary } = await import('/src/ui/run_stakes.js');
    state.currentRun = createDefaultCurrentRun();
    state.currentRun.materials = {};
    state.currentRun.departureCraftItems = ['HEAL_POTION', 'GREATER_HEAL'];
    state.inventory = ['HEAL_POTION', 'GREATER_HEAL'];
    state.storage = [];
    state.storageMax = 1;
    return createRunStakesSummary().textContent;
  });

  expect(text).toContain('未使用品 2個');
  expect(text).toContain('倉庫満杯のため未使用品 1個は戻らない');
});

test('Combat Wing uses the same confirmation and return settlement', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await seedPortalRun(page);
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { combatSelection } = await import('/src/combat_ui/combat_state.js');
    const { updateUI } = await import('/src/ui.js');
    state.gameState = 'combat';
    state.combatState = {
      phase: 'choose_actions',
      roundNumber: 1,
      monsters: [{ name: 'Biter', level: 1, hp: 20, maxHp: 20 }]
    };
    combatSelection.charIdx = 0;
    combatSelection.actions = [];
    updateUI();
  });

  await page.locator('#btn-combat-item').click();
  await page.getByRole('button', { name: '帰還の翼' }).click();
  await expect(page.locator('#confirm-dialog')).toContainText('素材 5個');
  await page.locator('#btn-confirm-dialog-accept').click();
  await expect(page.locator('#result-overlay')).toBeVisible();
  const result = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return {
      reason: state.currentRun.returnReason,
      banked: state.currentRun.bankedObjectLoot.length,
      lost: state.currentRun.lostObjectLoot.length,
      inventory: state.inventory.slice()
    };
  });
  expect(result).toEqual({ reason: 'escape_scroll', banked: 3, lost: 0, inventory: [] });
  await expect(page.locator('#result-overlay')).toContainText('帰還の翼');
});
