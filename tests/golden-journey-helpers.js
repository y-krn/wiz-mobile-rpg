import { expect } from '@playwright/test';

function classifyTap(button) {
  const text = `${button.id} ${button.label} ${button.text}`.trim();
  if (/戻る|キャンセル|閉じる|やめる/.test(text)) return 'back-cancel';
  if (/確定|決定|帰還|深く|開始|出発|受け取る|持つ|捨てる|装備する|試す/.test(text)) return 'confirm';
  return 'primary';
}

async function installJourneyRecorder(page) {
  await page.addInitScript(() => {
    window.__goldenJourney = { taps: [], steps: [] };
    document.addEventListener('click', event => {
      const element = event.target.closest?.('button,[role="button"],a');
      if (!element) return;
      const button = {
        id: element.id || '',
        label: element.getAttribute('aria-label') || '',
        text: element.textContent?.trim().replace(/\s+/g, ' ') || '',
      };
      const text = `${button.id} ${button.label} ${button.text}`;
      const kind = /戻る|キャンセル|閉じる|やめる/.test(text)
        ? 'back-cancel'
        : /確定|決定|帰還|深く|開始|出発|受け取る|持つ|捨てる|装備する|試す/.test(text)
          ? 'confirm'
          : 'primary';
      window.__goldenJourney.taps.push({ ...button, kind, at: performance.now() });
    }, true);
  });
}

async function recordJourneyStep(page, name) {
  const state = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { menuContext } = await import('/src/navigation.js');
    const submenu = document.querySelector('#submenu-options');
    return {
      gameState: state.gameState,
      phase: state.combatState?.phase || null,
      menuType: menuContext.type || null,
      transitioning: Boolean(state.transitioning),
      pendingOutcome: state.combatState?.pendingOutcome?.kind || null,
      selectedActor: menuContext.actorIdx ?? null,
      selectedItem: menuContext.itemIdx ?? null,
      selectedSpell: menuContext.spellName || null,
      scrollTop: submenu ? Math.round(submenu.scrollTop) : null,
      activeElement: document.activeElement?.id || document.activeElement?.getAttribute('aria-label') || null,
      busyCount: document.querySelectorAll('[aria-busy="true"], :disabled').length,
    };
  });
  await page.evaluate(({ name, state }) => {
    window.__goldenJourney?.steps.push({ name, state, at: performance.now() });
  }, { name, state });
  return state;
}

async function readJourneyEvidence(page) {
  return page.evaluate(() => structuredClone(window.__goldenJourney || { taps: [], steps: [] }));
}

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll('body *')]
      .filter(element => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
          && (rect.left < -1 || rect.right > viewportWidth + 1);
      })
      .slice(0, 5)
      .map(element => ({ id: element.id, className: element.className, rect: element.getBoundingClientRect().toJSON() }));
    return { scrollWidth: document.documentElement.scrollWidth, clientWidth: viewportWidth, offenders };
  });
  expect(overflow.scrollWidth, `${label} should not create horizontal page overflow`).toBeLessThanOrEqual(overflow.clientWidth + 1);
  expect(overflow.offenders, `${label} should not clip visible controls horizontally`).toEqual([]);
  return overflow;
}

async function expectStableSurfaceScreenshot(page, name, surfaceSelector, maskSelectors = []) {
  const masks = maskSelectors
    .map(selector => page.locator(selector))
    .filter(Boolean);
  await expect(page.locator(surfaceSelector)).toHaveScreenshot(name, {
    animations: 'disabled',
    caret: 'hide',
    mask: masks,
    scale: 'css',
  });
}

export {
  assertNoHorizontalOverflow,
  classifyTap,
  expectStableSurfaceScreenshot,
  installJourneyRecorder,
  readJourneyEvidence,
  recordJourneyStep,
};
