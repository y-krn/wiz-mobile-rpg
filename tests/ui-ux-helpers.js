import { expect } from '@playwright/test';

const VIEWPORTS = [
  { width: 390, height: 844, name: 'iPhone 13' },
  { width: 360, height: 800, name: 'Galaxy S20' },
  { width: 430, height: 932, name: 'iPhone 14 Pro Max' },
];

const SOLO_HUD_VIEWPORTS = [
  { width: 402, height: 874, name: 'iPhone 16 Pro standalone', safeArea: true },
  { width: 375, height: 667, name: 'iPhone SE' },
  ...VIEWPORTS,
];

const SOLO_HUD_STATES = ['town', 'explore', 'combat', 'submenu'];

async function startSoloRun(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('#btn-town-dungeon').click();
  await page.getByRole('button', { name: /鋼の前線キット/ }).click();
  await page.getByRole('button', { name: /B1Fから開始/ }).click();
  await page.getByRole('button', { name: '迷宮へ向かう' }).click();
  await expect(page.locator('#explore-controls')).toBeVisible();
}

async function openDeparturePreparation(page, vp, unlockedMilestones = []) {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.goto('/');
  await page.evaluate(async (milestones) => {
    const { state } = await import('/src/state.js');
    const { openSubmenu } = await import('/src/navigation.js');

    state.gameState = 'town';
    state.metaMaterials = {
      '獣の牙': 10,
      '硬い皮': 10,
      '毒腺': 3,
      '骨片': 3,
      '霊粉': 10,
      '鉄片': 10,
    };
    state.workshop = { ranks: {} };
    state.unlockedMilestones = milestones;
    openSubmenu('solo_start', '単独潜行');
  }, unlockedMilestones);
  await page.locator('.solo-starting-kit-option').first().click();
}

async function beginPendingOutcomePlayback(page, kind, floor = 1) {
  await page.addInitScript(() => {
    Math.random = () => 0.99;
  });
  return page.evaluate(async ({ outcomeKind, outcomeFloor }) => {
    const { state, saveAutosave } = await import('/src/state.js');
    const { playBattleLogs } = await import('/src/combat.js');

    if (outcomeKind === 'milestoneVictory' && !state.maps[outcomeFloor - 1]) {
      state.maps[outcomeFloor - 1] = structuredClone(state.maps[0]);
      state.visitedMaps[outcomeFloor - 1] = state.maps[outcomeFloor - 1]
        .map(row => row.map(() => false));
    }
    state.floor = outcomeFloor;
    state.gameState = 'combat';
    state.transitioning = false;
    state.combatState = {
      monsters: [{ name: '検証用モンスター', hp: 0, maxHp: 1 }],
      phase: 'choose_actions',
      isBoss: outcomeKind === 'milestoneVictory',
      isMidboss: outcomeKind === 'giveKey',
      isRoamingFlack: false,
      isAuto: false,
      pendingOutcome: outcomeKind === 'milestoneVictory'
        ? { kind: outcomeKind, floor: outcomeFloor, rewardsApplied: false }
        : {
            kind: outcomeKind,
            ...(outcomeKind === 'giveKey' ? { rewardsApplied: false } : {}),
          },
    };
    state.party[0].buffs = [];

    if (outcomeKind === 'giveKey') {
      state.inventory = state.inventory.filter(item => (
        (typeof item === 'object' ? item.baseId : item) !== 'DRAGON_KEY'
        && typeof item !== 'object'
      ));
      state.currentRun.itemsFound = state.currentRun.itemsFound.filter(item => item !== 'DRAGON_KEY');
      state.currentRun.equipmentFound = [];
      state.currentRun.materials['黒角'] = 0;
      state.map[state.y][state.x].event = 'midboss';
    } else if (outcomeKind === 'milestoneVictory') {
      state.currentRun.defeatedMilestones = [];
      state.unlockedMilestones = [];
      state.map[state.y][state.x].event = 'boss';
    }

    saveAutosave();
    const log = { msg: `検証: ${outcomeKind}` };
    if (outcomeKind === 'milestoneVictory') {
      log.milestoneVictory = outcomeFloor;
    } else {
      log[outcomeKind] = true;
    }
    const queue = ['giveKey', 'milestoneVictory'].includes(outcomeKind)
      ? [
          { msg: '検証: 先行攻撃ログ' },
          { msg: '検証: 撃破ログ' },
          { msg: '検証: 経験値ログ' },
          log,
        ]
      : [log];
    Math.random = () => 0.99;
    playBattleLogs(queue, 0);

    return {
      transitioning: state.transitioning,
      pendingOutcome: state.combatState?.pendingOutcome,
      savedPhase: JSON.parse(
        localStorage.getItem('mobile_wiz_rpg_autosave')
      ).combatState.phase,
    };
  }, { outcomeKind: kind, outcomeFloor: floor });
}


export {
  VIEWPORTS,
  SOLO_HUD_VIEWPORTS,
  SOLO_HUD_STATES,
  startSoloRun,
  openDeparturePreparation,
  beginPendingOutcomePlayback,
};
