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
  await page.evaluate(() => document.activeElement?.blur());
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

async function inspectAccessibleSurface(page, surfaceSelector) {
  return page.locator(surfaceSelector).evaluate(surface => {
    const isVisible = element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const nameOf = element => {
      const labelledBy = element.getAttribute('aria-labelledby');
      const labelledText = labelledBy
        ? labelledBy.split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ')
        : '';
      return (element.getAttribute('aria-label') || labelledText || element.textContent || '').trim().replace(/\s+/g, ' ');
    };
    return [...surface.querySelectorAll('button, [role="button"], a[href], input, select, textarea, [role="checkbox"], [role="radio"], [role="tab"], [role="option"]')]
      .filter(isVisible)
      .map(element => ({
        tag: element.tagName.toLowerCase(),
        role: element.getAttribute('role') || (element.tagName.toLowerCase() === 'button' ? 'button' : null),
        name: nameOf(element),
        disabled: Boolean(element.disabled) || element.getAttribute('aria-disabled') === 'true',
        pressed: element.getAttribute('aria-pressed'),
        selected: element.getAttribute('aria-selected'),
        checked: element.getAttribute('aria-checked'),
        expanded: element.getAttribute('aria-expanded'),
        current: element.getAttribute('aria-current'),
        id: element.id,
      }));
  });
}

async function assertNamedInteractiveControls(page, surfaceSelector) {
  const controls = await inspectAccessibleSurface(page, surfaceSelector);
  expect(controls, `${surfaceSelector} should expose interactive controls`).not.toEqual([]);
  expect(controls.filter(control => !control.role || !control.name), `${surfaceSelector} controls need a meaningful name and role`).toEqual([]);
  for (const control of controls) {
    for (const state of ['pressed', 'selected', 'checked', 'expanded', 'current']) {
      if (control[state] !== null) {
        expect(['true', 'false', 'page', 'step', 'location', 'date', 'time'].includes(control[state]),
          `${surfaceSelector} ${control.id || control.name} has an invalid aria-${state}`).toBe(true);
      }
    }
  }
  return controls;
}

async function assertNoHiddenSurfaceFocus(page, surfaceSelectors) {
  const leak = await page.evaluate(selectors => {
    const active = document.activeElement;
    const isHidden = element => {
      if (!element || element === document.documentElement) return false;
      const style = getComputedStyle(element);
      return element.hidden || style.display === 'none' || style.visibility === 'hidden' || isHidden(element.parentElement);
    };
    return selectors
      .map(selector => document.querySelector(selector))
      .filter(Boolean)
      .filter(surface => isHidden(surface) && surface.contains(active))
      .map(surface => ({ id: surface.id, activeId: active?.id || '', activeLabel: active?.getAttribute('aria-label') || '' }));
  }, surfaceSelectors);
  expect(leak, 'focus must not remain inside a hidden surface').toEqual([]);
  return leak;
}

async function readFocusEvidence(page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    const rect = active?.getBoundingClientRect?.();
    return {
      id: active?.id || '',
      role: active?.getAttribute?.('role') || (active?.tagName === 'BUTTON' ? 'button' : ''),
      name: active?.getAttribute?.('aria-label') || active?.textContent?.trim().replace(/\s+/g, ' ') || '',
      inDialog: active?.closest?.('[role="dialog"]')?.id || null,
      viewport: { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
      visible: Boolean(active && getComputedStyle(active).display !== 'none' && getComputedStyle(active).visibility !== 'hidden'),
      inViewport: Boolean(rect && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth),
    };
  });
}

async function readReducedMotionEvidence(page) {
  return page.evaluate(() => {
    const resultRecord = document.querySelector('.result-record-new');
    const dock = document.querySelector('#controls-panel');
    return {
      prefersReducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      resultAnimation: resultRecord ? getComputedStyle(resultRecord).animationName : 'none',
      resultAnimationDuration: resultRecord ? getComputedStyle(resultRecord).animationDuration : '0s',
      dockTransitionDuration: dock ? getComputedStyle(dock).transitionDuration : '0s',
    };
  });
}

export {
  assertNoHorizontalOverflow,
  assertNamedInteractiveControls,
  assertNoHiddenSurfaceFocus,
  classifyTap,
  expectStableSurfaceScreenshot,
  inspectAccessibleSurface,
  installJourneyRecorder,
  readFocusEvidence,
  readJourneyEvidence,
  readReducedMotionEvidence,
  recordJourneyStep,
};
