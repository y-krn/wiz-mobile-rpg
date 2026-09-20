import { mkdirSync } from 'node:fs';
import { test, expect } from './fixtures/browser-health.js';
import {
  assertNamedInteractiveControls,
  assertNoHiddenSurfaceFocus,
  assertNoHorizontalOverflow,
  readFocusEvidence,
  readReducedMotionEvidence,
} from './golden-journey-helpers.js';
import { A11Y_LONG_EQUIPMENT_DESCRIPTION, A11Y_LONG_EQUIPMENT_NAME } from './accessibility-fixtures.js';
import { GOLDEN_JOURNEYS, GOLDEN_VIEWPORTS, RENDERER_CLASSIFICATIONS } from './golden-journeys.js';

const HIDDEN_SURFACES = ['#combat-overlay', '#equip-overlay', '#spell-overlay', '#result-overlay', '#submenu-controls'];

async function seedCombat(page) {
  await page.goto('/');
  await page.evaluate(async () => {
    const { state, createStartingKitCharacter } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    // Keep a second actor so the selected keyboard action remains observable
    // before round resolution clears the transient selection buffer.
    state.party = [createStartingKitCharacter('vanguard'), createStartingKitCharacter('vanguard')];
    state.map = [[{ walls: [false, false, false, false], type: 'empty' }]];
    state.visitedMap = [[true]];
    state.x = 0; state.y = 0; state.dir = 0;
    state.combatState = {
      phase: 'choose_actions',
      monsters: [
        { name: '対象A', hp: 10, maxHp: 10, magicResist: 0, tags: [] },
        { name: '対象B', hp: 8, maxHp: 8, magicResist: 0, tags: [] },
      ],
      roundNumber: 1, isAuto: false, pendingOutcome: null,
    };
    state.gameState = 'combat';
    state.transitioning = false;
    updateUI();
  });
}

const ENEMY_HP_VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

async function seedEnemyHpPresentation(page, renderer) {
  await page.goto(`/?renderer=${renderer}`);
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    const { state, createStartingKitCharacter } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    state.party = [createStartingKitCharacter('vanguard')];
    state.map = [[{ walls: [false, false, false, false], type: 'empty' }]];
    state.visitedMap = [[true]];
    state.x = 0; state.y = 0; state.dir = 0;
    state.combatState = {
      phase: 'choose_actions',
      monsters: [
        { name: '対象A', level: 1, hp: 4, maxHp: 10, magicResist: 0, tags: [] },
        { name: '対象B', level: 1, hp: 10, maxHp: 10, magicResist: 0, tags: [] },
      ],
      roundNumber: 1, isAuto: false, pendingOutcome: null,
    };
    state.gameState = 'combat';
    state.transitioning = false;
    updateUI();
  });
}

async function attachEnemyHpEvidence(page, testInfo, name) {
  mkdirSync('output/playwright', { recursive: true });
  const screenshot = await page.screenshot({ path: `output/playwright/${name}.png`, fullPage: true });
  await testInfo.attach(name, { body: screenshot, contentType: 'image/png' });
}

async function seedPortal(page) {
  await page.evaluate(async () => {
    const { createDefaultCurrentRun, createStartingKitCharacter, state } = await import('/src/state.js');
    const { openSubmenu } = await import('/src/navigation.js');
    state.party = [createStartingKitCharacter('vanguard')];
    state.party[0].hp = 12;
    state.currentRun = createDefaultCurrentRun();
    state.currentRun.runSeed = 'A11Y-PORTAL';
    state.currentRun.townInventory = ['TOWN_PORTAL'];
    state.currentRun.unbankedObjectLoot = [
      { id: 'a11y-loot-sword', item: { baseId: 'LONG_SWORD', instanceId: 'a11y-sword', identified: true } },
      { id: 'a11y-loot-potion', item: 'GREATER_HEAL' },
    ];
    state.inventory = ['TOWN_PORTAL'];
    state.floor = 5;
    state.gameState = 'explore';
    openSubmenu('milestone_portal', 'B5F帰還の門');
  });
}

async function seedEquipment(page) {
  await page.evaluate(async ({ name, description }) => {
    const { ITEMS } = await import('/src/data/items.js');
    const { createStartingKitCharacter, createDefaultCurrentRun, state } = await import('/src/state.js');
    const { openEquipOverlay } = await import('/src/equip.js');
    ITEMS.LONG_SWORD.name = name;
    ITEMS.LONG_SWORD.desc = description;
    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = createDefaultCurrentRun();
    state.inventory = [{
      kind: 'equipment', instanceId: 'a11y-long-sword', baseId: 'LONG_SWORD',
      rarity: 'rare', level: 1, identified: true, affixes: [],
    }];
    state.gameState = 'explore';
    await openEquipOverlay(0);
  }, { name: A11Y_LONG_EQUIPMENT_NAME, description: A11Y_LONG_EQUIPMENT_DESCRIPTION });
}

async function seedResult(page) {
  await page.evaluate(async ({ cause }) => {
    const { createDefaultCurrentRun, createStartingKitCharacter, state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const run = createDefaultCurrentRun();
    run.returnReason = 'gameover';
    run.deathLogs = [{ cause, floor: 3, type: 'environment', source: '毒霧' }];
    run.deepestFloor = 3;
    run.itemsFound = ['LONG_SWORD'];
    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = run;
    state.gameState = 'result';
    updateUI();
  }, { cause: '深層の毒霧に蝕まれ、帰還の翼を使う前に力尽きた。' });
}

test('Golden Journey registry carries a risk-based accessibility matrix without duplicating journeys @smoke', async () => {
  expect(GOLDEN_JOURNEYS).toHaveLength(10);
  expect(GOLDEN_VIEWPORTS.map(viewport => `${viewport.width}x${viewport.height}`)).toEqual([
    '320x568', '360x800', '390x844', '430x932',
  ]);
  for (const journey of GOLDEN_JOURNEYS) {
    expect(journey.a11y?.criticalStates?.length, `${journey.id} critical states`).toBeGreaterThan(0);
    expect(journey.a11y?.invariants?.length, `${journey.id} invariants`).toBeGreaterThan(0);
    expect(journey.a11y?.representative, `${journey.id} representative condition`).toBeTruthy();
    expect(RENDERER_CLASSIFICATIONS[journey.rendererClass]).toBeTruthy();
  }
  expect(new Set(GOLDEN_JOURNEYS.flatMap(journey => journey.a11y.invariants))).toEqual(new Set([
    'semantics', 'keyboard', 'zoom-text', 'focus', 'long-content', 'non-color', 'reduced-motion', 'renderer-equivalent',
  ]));
});

test('Preparation and Town keep named controls, keyboard focus entry, and contextual restoration at 390x844 @e2e @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const departure = page.locator('#btn-town-dungeon');
  await departure.focus();
  await departure.click();
  await expect(page.getByRole('button', { name: /鋼の前線キット/ }).first()).toBeVisible();
  await assertNamedInteractiveControls(page, '#submenu-controls');
  const entry = await readFocusEvidence(page);
  expect(entry.inDialog).toBeNull();
  expect(entry.id).not.toBe('btn-submenu-back');
  expect(entry.name).toContain('鋼の前線キット');
  const kit = page.getByRole('button', { name: /鋼の前線キット/ }).first();
  await kit.focus();
  await kit.press('Enter');
  const firstFloor = page.locator('[data-start-floor="1"]');
  await expect(firstFloor).toBeVisible();
  expect(await readFocusEvidence(page)).toMatchObject({ visible: true, inViewport: true });
  expect(await firstFloor.evaluate(element => element === document.activeElement)).toBe(true);
  await firstFloor.press('Enter');
  expect(await page.locator('[data-start-floor="1"]').evaluate(element => element === document.activeElement)).toBe(true);
  await page.locator('#btn-submenu-back').click();
  await expect(page.locator('#town-controls')).toBeVisible();
  expect(await readFocusEvidence(page)).toMatchObject({ id: 'btn-town-dungeon', visible: true, inViewport: true });
  await assertNoHiddenSurfaceFocus(page, HIDDEN_SURFACES);
});

test('Combat target selection exposes the player-known equivalent and restores combat context on Back at 390x844 @e2e @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await seedCombat(page);
  const fight = page.locator('#btn-combat-fight');
  await fight.focus();
  await fight.click();
  await expect(page.locator('#combat-overlay')).toBeVisible();
  await assertNamedInteractiveControls(page, '#combat-overlay');
  const modalButtons = page.locator('#combat-overlay button:visible');
  await modalButtons.first().focus();
  await page.keyboard.press('Shift+Tab');
  expect((await readFocusEvidence(page)).inDialog).toBe('combat-overlay');
  await modalButtons.last().focus();
  await page.keyboard.press('Tab');
  expect((await readFocusEvidence(page)).inDialog).toBe('combat-overlay');
  const focusEntry = await readFocusEvidence(page);
  expect(focusEntry).toMatchObject({ inDialog: 'combat-overlay', visible: true, inViewport: true });
  await expect(page.locator('.combat-target-a11y')).toHaveCount(2);
  await expect(page.locator('.combat-target-a11y').first()).toHaveText('対象A、健在、攻撃対象にする');
  await expect(page.locator('.combat-target-a11y').first()).not.toContainText(/HP\s*\d+\s*\/\s*\d+/);
  await expect(page.locator('#viewport-hud .combat-enemy-semantic')).not.toContainText(/HP\s*\d+\s*\/\s*\d+/);
  const instructions = page.locator('#combat-target-instructions');
  await expect(instructions).toHaveText('敵をタップして対象を選択');
  await expect(instructions).toHaveCSS('position', 'absolute');
  await expect(instructions).toHaveAttribute('role', 'status');
  await expect(instructions).toHaveAttribute('aria-live', 'polite');
  await expect.poll(() => instructions.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  })).toEqual({ width: 1, height: 1 });
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('aria-describedby', 'combat-target-instructions');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('aria-label', '敵対象選択。敵をタップして対象を選択');
  await page.locator('#combat-overlay .btn-combat-back').click();
  await expect(page.locator('#combat-overlay')).toBeHidden();
  expect(await readFocusEvidence(page)).toMatchObject({ id: 'btn-combat-fight', visible: true, inViewport: true });
  await assertNoHiddenSurfaceFocus(page, HIDDEN_SURFACES);
  await page.locator('#btn-combat-fight').click();
  const keyboardTarget = page.locator('.combat-target-a11y').first();
  await keyboardTarget.focus();
  await keyboardTarget.press('Enter');
  await expect(page.locator('#combat-overlay')).toBeHidden();
  await expect.poll(() => page.evaluate(async () => {
    const { combatSelection } = await import('/src/combat.js');
    return combatSelection.actions.length;
  })).toBe(1);
});

for (const viewport of ENEMY_HP_VIEWPORTS) {
  test(`Enemy HP presentation stays proportional and non-exact for Canvas/Pixi at ${viewport.width}x${viewport.height} @e2e @smoke`, async ({ page }, testInfo) => {
    for (const renderer of ['canvas', 'pixi']) {
      await page.setViewportSize(viewport);
      await seedEnemyHpPresentation(page, renderer);
      await expect(page.locator('#viewport-panel')).toHaveAttribute('data-renderer', renderer);
      await expect(page.locator('#viewport-hud .combat-enemy-semantic')).not.toContainText(/HP\s*\d+\s*\/\s*\d+/);
      await expect(page.locator('#viewport-hud .combat-enemy-semantic')).toContainText('対象A、負傷、攻撃対象');
      await expect(page.locator('#viewport-hud .combat-enemy-semantic')).toContainText('対象B、健在、攻撃対象');
      await attachEnemyHpEvidence(page, testInfo, `issue-1404-${renderer}-${viewport.width}x${viewport.height}-combat`);

      await page.locator('#btn-combat-fight').click();
      await expect(page.locator('.combat-target-a11y')).toHaveCount(2);
      const targetLabels = await page.locator('.combat-target-a11y').allTextContents();
      expect(targetLabels.every(label => !/HP\s*\d+\s*\/\s*\d+/.test(label))).toBe(true);
      expect(targetLabels).toEqual([
        '対象A、負傷、攻撃対象にする',
        '対象B、健在、攻撃対象にする',
      ]);
      await attachEnemyHpEvidence(page, testInfo, `issue-1404-${renderer}-${viewport.width}x${viewport.height}-target`);
    }
  });
}

test('Equipment comparison preserves long Japanese content and critical actions at 320x568 with a text-scaling proxy @e2e @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await seedEquipment(page);
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const row = page.locator('.equip-bag-section .equip-item-row').first();
  await expect(row).toContainText(A11Y_LONG_EQUIPMENT_NAME);
  await row.click();
  await expect(page.locator('.equip-detail-name')).toContainText(A11Y_LONG_EQUIPMENT_NAME);
  await expect(page.locator('.equip-detail-desc')).toContainText(A11Y_LONG_EQUIPMENT_DESCRIPTION);
  await assertNamedInteractiveControls(page, '#equip-overlay');
  await assertNoHorizontalOverflow(page, 'equipment comparison text scaling proxy');
  const actions = page.locator('#equip-overlay .equip-detail-actions button, #btn-equip-close');
  for (const action of await actions.all()) {
    const box = await action.boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(-1);
    expect((box?.x || 0) + (box?.width || 0)).toBeLessThanOrEqual(321);
    expect(box?.y).toBeGreaterThanOrEqual(-1);
    expect((box?.y || 0) + (box?.height || 0)).toBeLessThanOrEqual(569);
  }
  await page.getByRole('button', { name: '一覧へ戻る' }).click();
  await page.locator('#btn-equip-close').click();
  await assertNoHiddenSurfaceFocus(page, HIDDEN_SURFACES);
});

test('Portal and Result retain non-color decision cues, live result semantics, and reduced-motion feedback @e2e @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await seedPortal(page);
  await assertNamedInteractiveControls(page, '#submenu-controls');
  const portalChoices = page.locator('.milestone-portal-choice');
  await expect(portalChoices).toHaveCount(2);
  expect(await portalChoices.allTextContents()).toEqual(expect.arrayContaining([
    '戦果をすべて持ち帰って帰還', '戦果を抱えてさらに進む',
  ]));
  await portalChoices.first().click();
  await expect(page.locator('.milestone-portal-confirmation')).toContainText('ここで帰還しますか？');
  await expect(page.locator('.milestone-portal-confirmation')).toHaveAttribute('aria-live', 'polite');
  await page.locator('#btn-portal-change').click();
  await expect(page.locator('.milestone-portal-choice')).toHaveCount(2);
  await seedResult(page);
  await assertNamedInteractiveControls(page, '#result-overlay');
  await expect(page.locator('#result-overlay')).toContainText('物は失う');
  await expect(page.locator('[data-result-outcome]')).toHaveAttribute('data-result-outcome', 'death');
  const motion = await readReducedMotionEvidence(page);
  expect(motion.prefersReducedMotion).toBe(true);
  expect(motion.resultAnimation).toBe('none');
  expect(motion.resultAnimationDuration).toBe('0s');
  await assertNoHiddenSurfaceFocus(page, HIDDEN_SURFACES);
});
