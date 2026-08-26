import { test, expect } from './fixtures/browser-health.js';

test('Incapacitated combatants advance the round without exposing action controls @e2e @smoke', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const result = await page.evaluate(async () => {
    const { createSoloCharacter, initNewGame, state } = await import('/src/state.js');
    const { menuContext } = await import('/src/navigation.js');
    const { applyStatusEffect, STATUS_EFFECT_IDS } = await import('/src/combat_logic/status_effects.js');
    const { advanceActionSelection, selectCombatAction, combatSelection } = await import('/src/combat.js');
    const { updateUI } = await import('/src/ui.js');

    initNewGame();
    const resetCombat = (statuses, isAuto = false) => {
      state.party = statuses.map((status, index) => {
        const actor = createSoloCharacter(index === 0 ? 'Fighter' : 'Priest');
        actor.hp = 99999;
        if (['sleep', 'paralyze', 'paralyzed'].includes(status)) {
          const effectId = status === 'sleep' ? STATUS_EFFECT_IDS.SLEEP : STATUS_EFFECT_IDS.PARALYZED;
          applyStatusEffect(actor, effectId, { remainingTurns: 2 });
        }
        return actor;
      });
      state.gameState = 'combat';
      state.transitioning = false;
      state.combatState = {
        phase: 'choose_actions',
        monsters: [{ name: '無害な検証敵', hp: 100, maxHp: 100, str: 0, agi: -100, traits: [] }],
        isAuto,
        roundNumber: 1,
        allParalyzedTurns: 0,
        pendingOutcome: null,
      };
      menuContext.type = '';
      menuContext.prevGameState = null;
      combatSelection.charIdx = 0;
      combatSelection.actions = [];
      updateUI();
    };

    const allIncapacitated = {};
    for (const status of ['sleep', 'paralyze', 'paralyzed']) {
      resetCombat([status]);
      const before = {
        combatControlsActive: document.getElementById('combat-controls').classList.contains('active'),
        prompt: document.getElementById('combat-prompt').textContent,
      };
      const originalSetTimeout = window.setTimeout;
      window.setTimeout = () => 0;
      try {
        advanceActionSelection();
      } finally {
        window.setTimeout = originalSetTimeout;
      }
      allIncapacitated[status] = {
        before,
        statusAfterRoundStarts: state.party[0].status,
        combatPhase: state.combatState.phase,
        transitioning: state.transitioning,
      };
      state.transitioning = false;
    }

    resetCombat(['sleep', 'ok']);
    const mixedBefore = document.getElementById('combat-prompt').textContent;
    const originalSetTimeout = window.setTimeout;
    window.setTimeout = () => 0;
    try {
      selectCombatAction('defend');
    } finally {
      window.setTimeout = originalSetTimeout;
    }
    const mixedAfterSelection = {
      actionCount: combatSelection.actions.length,
      actorIdx: combatSelection.actions[0]?.actorIdx,
      prompt: document.getElementById('combat-prompt').textContent,
    };

    return { allIncapacitated, mixedBefore, mixedAfterSelection };
  });

  for (const status of ['sleep', 'paralyze', 'paralyzed']) {
    expect(result.allIncapacitated[status]).toEqual({
      before: { combatControlsActive: false, prompt: '' },
      statusAfterRoundStarts: 'ok',
      combatPhase: 'resolving',
      transitioning: true,
    });
  }
  expect(result.mixedBefore).toContain('僧侶');
  expect(result.mixedAfterSelection).toEqual({
    actionCount: 1,
    actorIdx: 1,
    prompt: 'ターン解決中...',
  });
});
