import { test, expect } from './fixtures/browser-health.js';

// Dungeon panels after the 2026-10 screen audit (#2034): they say what the
// choice needs and leave out mechanism notes and internal numbers.

async function seedRun(page, { floor = 1, visitedFloors = null, materials = {}, hp = null } = {}) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?renderer=pixi');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');
  await page.evaluate(async ({ floor, visitedFloors, materials, hp }) => {
    const { state, initNewGame, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { ensureRunFloor } = await import('/src/state/run_floor_state.js');
    const { updateUI } = await import('/src/ui.js');
    initNewGame();
    state.party = [createStartingKitCharacter('vanguard')];
    if (hp !== null) state.party[0].hp = hp;
    state.currentRun = createDefaultCurrentRun();
    state.currentRun.runSeed = 'panel-wording-2034';
    state.currentRun.startingKit = 'vanguard';
    state.currentRun.deepestFloor = floor;
    state.currentRun.materials = { ...materials };
    state.maps = [];
    state.visitedMaps = [];
    state.roamingMonsters = [];
    state.floor = floor;
    state._freshRunFloor = floor;
    ensureRunFloor(state, floor);
    state.dungeonMemory = {
      mapFragments: {},
      visitedFloors: visitedFloors || Array.from({ length: floor }, (_, index) => index + 1),
    };
    state.repelTurns = 999;
    state.gameState = 'explore';
    state.transitioning = false;
    updateUI();
  }, { floor, visitedFloors, materials, hp });
}

test('Trap panel names the trap, its effect and the odds, without internal numbers', async ({ page }) => {
  await seedRun(page);
  await page.evaluate(async () => {
    const { startTrapEncounter } = await import('/src/systems/traps.js');
    startTrapEncounter({ id: 'wording-trap', type: 'alarm', state: 'discovered', floorId: 'B1', difficulty: 25 }, null);
  });

  const info = page.locator('#trap-info');
  await expect(info).toBeVisible();
  await expect(page.locator('#trap-effect')).toHaveText('かかると: 警報が鳴り、魔物が集まって手強くなる');
  await expect(page.locator('#trap-success-rate')).toHaveText(/^解除の見込み: \d+%$/);
  await expect(page.locator('#trap-name')).not.toHaveText('罠');
  const text = await info.textContent();
  expect(text).not.toMatch(/難易度|危険度|状態:|予想効果|罠名|発見済み/);

  // A pitfall is crossed, not disarmed.
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { startTrapEncounter } = await import('/src/systems/traps.js');
    state.gameState = 'explore';
    startTrapEncounter({ id: 'wording-pit', type: 'pitfall', state: 'discovered', floorId: 'B1', difficulty: 25 }, null);
  });
  await expect(page.locator('#trap-effect')).toHaveText('かかると: 地下2階へ落ちる');
  await expect(page.locator('#trap-success-rate')).toHaveText(/^渡りきる見込み: \d+%$/);
});

test('Chest panel states the trap sign, the odds and the contents in plain words', async ({ page }) => {
  await seedRun(page);
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { openChestMenu } = await import('/src/chest.js');
    state.chestState = {
      x: state.x,
      y: state.y,
      trap: 'poison needle',
      trapSign: 'danger',
      trapSignAccuracy: 0.7,
      item: 'HEAL_POTION',
      lootHint: { label: '装備品の反応あり', aura: 'weak' },
    };
    state.gameState = 'combat';
    openChestMenu();
  });

  const panel = page.locator('.chest-info-panel');
  await expect(panel.locator('.chest-trap-sign')).toHaveText('罠の気配: 危険な気配（当てにならない）');
  await expect(panel.locator('.chest-disarm-chance')).toHaveText('開けるときに罠を外せる見込み: 約25%');
  await expect(panel.locator('.chest-loot-hint')).toHaveText('中身: 装備品の反応あり（魔力は弱い）');
  expect(await panel.textContent()).not.toMatch(/自動解除|宝気|魔力反応|見立て/);
});

test('Loot panel gives a short prompt and splits the choice note, technique and description', async ({ page }) => {
  await seedRun(page);
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const rewards = await import('/src/pending_rewards.js');
    const sword = { kind: 'equipment', instanceId: 'wording-sword', baseId: 'SHORT_SWORD', identified: true, rarity: 'rare', tags: ['iron'], affixes: [{ type: 'atk', value: 2 }] };
    const robe = { kind: 'equipment', instanceId: 'wording-robe', baseId: 'ROBE', identified: true, rarity: 'magic', tags: ['spirit'], affixes: [{ type: 'mp', value: 1 }] };
    state.inventory = [];
    rewards.stagePendingRewardBundle(state, [
      { item: sword, role: 'seed' },
      { item: robe, role: 'seed' },
    ], { choiceRole: 'seed', choiceLimit: 1 });
    rewards.openPendingRewardMenu();
  });

  await expect(page.locator('#submenu-title')).toHaveText('見つけた戦果');
  await expect(page.locator('.pending-reward-intro')).toHaveText('持っていくものを決めてから先へ進む。置いていく品は持ち帰れない。');
  const firstCard = page.locator('.pending-reward-card').first();
  await expect(firstCard.locator('.pending-reward-choice-note')).toHaveText('この中から1つだけ持てる');
  await expect(firstCard.locator('.pending-reward-technique')).toHaveText(/^技「.+」: /);
  await expect(firstCard.locator('.pending-reward-desc').last()).toHaveText(/（希少／系統: 鉄）$/);
  const text = await page.locator('#submenu-options').textContent();
  expect(text).not.toMatch(/同じ取得イベント|確定するまでバッグに入りません|戦い方の芽|\[Rare\]|<系統/);
  // Nothing to give up from an empty bag.
  await expect(page.locator('#submenu-options h4')).toHaveCount(0);
});

test('Goal and stairs name an unreached floor by its number and state the stakes once', async ({ page }) => {
  await seedRun(page, { materials: { '獣の牙': 5, '鉄片': 3, '霊粉': 2 }, visitedFloors: [1] });

  const goal = page.locator('#goal-banner');
  await expect(goal).toContainText('目標: 階段を探して地下2階へ');
  await expect(goal).not.toContainText('???');
  await expect(goal).not.toContainText('探せ');

  await page.evaluate(async () => {
    const { openSubmenu } = await import('/src/navigation.js');
    // The caller's title still carries the stored label of the unreached floor.
    openSubmenu('stairs_down', '???（地下2階）への下り階段');
  });
  await expect(page.locator('#submenu-title')).toHaveText('地下2階への下り階段');
  await expect(page.getByRole('button', { name: '地下2階へ降りる' })).toBeVisible();
  await expect(page.getByRole('button', { name: '降りずに進む' })).toBeVisible();

  const stakes = page.locator('.run-stakes-summary');
  await expect(stakes.locator('.run-stakes-title')).toHaveText('今回の賭け金');
  const stakesText = await stakes.textContent();
  expect(stakesText.match(/素材 10個/g)).toHaveLength(1);
  expect(stakesText).not.toContain('未使用品');
});

test('Return portal shows both decisions without scrolling and does not repeat HP and MP', async ({ page }) => {
  await seedRun(page, { floor: 5, materials: { '獣の牙': 15, '鉄片': 12 }, hp: 16 });
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { openSubmenu } = await import('/src/navigation.js');
    state.currentRun.defeatedMilestones = [5];
    state.currentRun.guideFragments = 2;
    state.inventory = ['HEAL_POTION', 'TOWN_PORTAL'];
    openSubmenu('milestone_portal', '帰還の門');
  });

  const options = page.locator('#submenu-options');
  await expect(options.locator('.milestone-portal-vitals')).toHaveCount(0);
  const text = await options.textContent();
  expect(text).not.toMatch(/現在の状態|帰還で守られる賭け金|この帰還の門で決める|次の階層帯の兆候/);
  for (const decision of ['return', 'push']) {
    await expect(options.locator(`button[data-portal-decision="${decision}"]`)).toBeInViewport({ ratio: 1 });
  }
  await expect(page.locator('#character-hud .hp-row .bar-value')).toHaveText(/^16\//);
});
