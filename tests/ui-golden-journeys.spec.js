import { test, expect } from './fixtures/browser-health.js';
import { openDeparturePreparation } from './ui-ux-helpers.js';
import {
  assertNoHorizontalOverflow,
  expectStableSurfaceScreenshot,
  installJourneyRecorder,
  readJourneyEvidence,
  recordJourneyStep,
} from './golden-journey-helpers.js';
import { GOLDEN_JOURNEYS, GOLDEN_VIEWPORTS, RENDERER_CLASSIFICATIONS } from './golden-journeys.js';

test('Golden Journey registry names all player journeys, owners, and renderer boundaries @smoke', async () => {
  expect(GOLDEN_JOURNEYS).toHaveLength(10);
  expect(new Set(GOLDEN_JOURNEYS.map(journey => journey.id)).size).toBe(10);
  for (const journey of GOLDEN_JOURNEYS) {
    expect(journey.owner).toBeTruthy();
    expect(journey.entryPoints.length).toBeGreaterThan(0);
    expect(journey.fixture).toBeTruthy();
    expect(journey.viewportPolicy).toBeTruthy();
    expect(RENDERER_CLASSIFICATIONS[journey.rendererClass]).toBeTruthy();
    expect(journey.contract.length).toBeGreaterThan(0);
    expect(journey.responsiveness?.criticalTransitions.length, `${journey.id} responsiveness audit`).toBeGreaterThan(0);
    for (const transition of journey.responsiveness.criticalTransitions) {
      expect(['A', 'B', 'C', 'D']).toContain(transition.class);
      for (const field of ['trigger', 'acknowledgement', 'pending', 'resolution', 'rejected', 'duplicateRisk', 'backCancel', 'ownerTest', 'manualEvidence']) {
        expect(transition[field], `${journey.id} ${field}`).toBeTruthy();
      }
    }
  }
  expect(new Set(GOLDEN_JOURNEYS.flatMap(journey => journey.responsiveness.criticalTransitions.map(transition => transition.class)))).toEqual(new Set(['A', 'B', 'C', 'D']));
  expect(GOLDEN_VIEWPORTS.map(viewport => `${viewport.width}x${viewport.height}`)).toEqual([
    '320x568', '360x800', '390x844', '430x932',
  ]);
});

test('Fresh start reaches B1F with observable input feedback and no horizontal overflow @e2e @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installJourneyRecorder(page);
  await page.goto('/');
  await recordJourneyStep(page, 'town');
  await page.locator('#btn-town-dungeon').click();
  await recordJourneyStep(page, 'starting-kit');
  await page.getByRole('button', { name: /鋼の前線キット/ }).click();
  await recordJourneyStep(page, 'kit-selected');
  await page.getByRole('button', { name: /B1Fから開始/ }).click();
  await recordJourneyStep(page, 'floor-selected');
  await page.getByRole('button', { name: '迷宮へ向かう' }).click();
  await expect(page.locator('#explore-controls')).toBeVisible();
  const evidence = await readJourneyEvidence(page);
  expect(evidence.steps.map(step => step.name)).toEqual([
    'town', 'starting-kit', 'kit-selected', 'floor-selected',
  ]);
  expect(evidence.taps.filter(tap => tap.kind === 'back-cancel')).toHaveLength(0);
  expect(evidence.taps.length).toBe(4);
  await assertNoHorizontalOverflow(page, 'Fresh start to B1F');
});

test('Preparation start is a single synchronous world transition under replayed activation @e2e @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('#btn-town-dungeon').click();
  await page.getByRole('button', { name: /鋼の前線キット/ }).click();
  await page.getByRole('button', { name: /B1Fから開始/ }).click();

  const result = await page.locator('#btn-departure-start').evaluate(async button => {
    const { state } = await import('/src/state.js');
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const runAfterFirstActivation = state.currentRun;
    const seedAfterFirstActivation = state.currentRun?.runSeed;
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return {
      sameRunAfterReplay: state.currentRun === runAfterFirstActivation,
      sameRunSeedAfterReplay: state.currentRun?.runSeed === seedAfterFirstActivation,
      gameState: state.gameState,
      hasExploreControls: Boolean(document.querySelector('#explore-controls.active')),
      buttonDetached: !button.isConnected,
    };
  });

  expect(result).toEqual({
    sameRunAfterReplay: true,
    sameRunSeedAfterReplay: true,
    gameState: 'explore',
    hasExploreControls: true,
    buttonDetached: true,
  });
});

test('Combat target Back cancels without committing and permits reselect @e2e @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installJourneyRecorder(page);
  await page.goto('/');
  await page.evaluate(async () => {
    const { state, createStartingKitCharacter } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    state.party = [createStartingKitCharacter('vanguard')];
    state.map = [[{ walls: [false, false, false, false], type: 'empty' }]];
    state.visitedMap = [[true]];
    state.x = 0; state.y = 0; state.dir = 0;
    state.combatState = {
      phase: 'choose_actions',
      monsters: [{ name: '対象A', hp: 10, maxHp: 10, magicResist: 0, tags: [] }],
      roundNumber: 1, isAuto: false, pendingOutcome: null,
    };
    state.gameState = 'combat';
    state.transitioning = false;
    updateUI();
  });
  await recordJourneyStep(page, 'combat');
  await page.locator('#btn-combat-fight').click();
  await expect(page.locator('#combat-overlay')).toBeVisible();
  await recordJourneyStep(page, 'target-selection');
  await page.locator('#combat-overlay .btn-combat-back').click();
  await expect(page.locator('#combat-overlay')).toBeHidden();
  const afterBack = await page.evaluate(async () => {
    const { combatSelection } = await import('/src/combat.js');
    const { state } = await import('/src/state.js');
    return { actionCount: combatSelection.actions.length, gameState: state.gameState };
  });
  expect(afterBack).toEqual({ actionCount: 0, gameState: 'combat' });
  await page.locator('#btn-combat-fight').click();
  await expect(page.locator('#combat-overlay')).toBeVisible();
  await recordJourneyStep(page, 'target-reselected');
  const evidence = await readJourneyEvidence(page);
  expect(evidence.taps.filter(tap => tap.kind === 'back-cancel')).toHaveLength(1);
  expect(evidence.steps.map(step => step.name)).toEqual(['combat', 'target-selection', 'target-reselected']);
});

test('Critical commit ignores repeated activation and applies one exploration cost @e2e @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installJourneyRecorder(page);
  await page.goto('/');
  await page.evaluate(async () => {
    const { createStartingKitCharacter, state } = await import('/src/state.js');
    const { openEquipOverlay } = await import('/src/equip.js');
    const character = createStartingKitCharacter('vanguard');
    character.equipment.weapon = 'DAGGER';
    state.party = [character];
    state.inventory = [{
      kind: 'equipment', instanceId: 'golden-journey-commit', baseId: 'SHORT_SWORD',
      rarity: 'rare', level: 1, identified: true, affixes: [],
    }];
    state.currentRun = { steps: 0, floorSteps: {}, materials: {}, runSeed: 'golden-journey-commit' };
    state.gameState = 'explore';
    await openEquipOverlay(0);
  });
  await page.locator('.equip-bag-section .equip-item-row', { hasText: 'ショートソード' }).click();
  await page.getByRole('button', { name: '装備する' }).click();
  const commit = page.locator('#btn-equip-commit');
  await commit.evaluate(button => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await expect(page.locator('#equip-overlay')).toBeHidden();
  await expect.poll(() => page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return {
      steps: state.currentRun.steps,
      weapon: state.party[0].equipment.weapon?.instanceId || state.party[0].equipment.weapon,
      inventory: state.inventory.map(item => item?.instanceId || item),
    };
  })).toEqual({ steps: 1, weapon: 'golden-journey-commit', inventory: ['DAGGER'] });
});

test('Stable DOM/CSS journey surfaces keep screenshot baselines separate from Dungeon View @visual @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expectStableSurfaceScreenshot(page, 'golden-town-390.png', '#town-controls');

  await openDeparturePreparation(page, { width: 390, height: 844 });
  await expect(page.getByRole('button', { name: /B1Fから開始/ })).toBeVisible();
  await expectStableSurfaceScreenshot(page, 'golden-preparation-390.png', '#submenu-controls');

  await page.evaluate(async () => {
    const { createDefaultCurrentRun, createStartingKitCharacter, state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const run = createDefaultCurrentRun();
    run.returnReason = 'milestone_portal';
    run.outcome = 'retreat';
    run.deepestFloor = 5;
    run.itemsFound = ['HEAL_POTION'];
    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = run;
    state.gameState = 'result';
    updateUI();
  });
  await expect(page.locator('#result-overlay')).toBeVisible();
  await expectStableSurfaceScreenshot(page, 'golden-result-390.png', '#result-overlay');
});

test('Critical short viewport controls remain reachable through the Golden Journey contract @e2e @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await expect(page.locator('#btn-town-dungeon')).toBeVisible();
  await assertNoHorizontalOverflow(page, 'Town at 320x568');
  await openDeparturePreparation(page, { width: 320, height: 568 });
  await expect(page.getByRole('button', { name: /B1Fから開始/ })).toBeVisible();
  await assertNoHorizontalOverflow(page, 'Preparation at 320x568');
});
