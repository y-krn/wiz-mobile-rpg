const ENABLED = process.env.ISSUE_1480_MEASUREMENT === '1';

function now() {
  return performance.now();
}

export function createIssue1480Measurement(page, testInfo) {
  const startedAt = performance.now();
  const phases = [];
  const waits = [];
  const clicks = [];
  let installed = false;

  async function install() {
    if (!ENABLED || installed) return;
    installed = true;
    await page.evaluate(() => {
      const probe = {
        active: true,
        armed: {},
        clicks: [],
        frames: { last: performance.now(), maxGap: 0, count: 0 },
        longTasks: [],
        milestones: {},
        stateTransitions: [],
      };
      window.__issue1480Probe = probe;
      const clickSelectors = [
        ['combat-run', '#btn-combat-run'],
        ['portal-entry', '#btn-move-forward'],
        ['portal-choice', '.milestone-portal-choice-card[data-portal-decision="return"] button'],
        ['portal-confirm', '#btn-portal-confirm'],
      ];
      const selectorFor = (target) => {
        for (const [name, selector] of clickSelectors) {
          if (target?.closest?.(selector)) return { name, selector };
        }
        return null;
      };
      document.addEventListener('click', (event) => {
        const match = selectorFor(event.target);
        if (!match) return;
        const pending = probe.clicks.find(click => click.name === match.name && !click.capture);
        if (pending) pending.capture = performance.now();
      }, true);
      document.addEventListener('click', (event) => {
        const match = selectorFor(event.target);
        if (!match) return;
        const pending = probe.clicks.find(click => click.name === match.name && click.capture && !click.bubble);
        if (pending) pending.bubble = performance.now();
      });
      if (typeof PerformanceObserver === 'function') {
        try {
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              probe.longTasks.push({ start: entry.startTime, duration: entry.duration });
            }
          });
          observer.observe({ type: 'longtask', buffered: true });
        } catch {
          // Long-task timing is optional browser evidence.
        }
      }
      const visible = (selector) => {
        const element = document.querySelector(selector);
        return Boolean(element && getComputedStyle(element).display !== 'none' &&
          getComputedStyle(element).visibility !== 'hidden');
      };
      const milestone = (group, name, condition) => {
        const key = `${group}:${name}`;
        if (probe.armed[group] && condition() && probe.milestones[key] == null) {
          probe.milestones[key] = performance.now();
        }
      };
      const sample = async () => {
        let state;
        let guarded;
        try {
          state = (await import('/src/state.js')).state;
          guarded = (await import('/src/controls_guard.js')).isControlsGuarded;
        } catch {
          return;
        }
        let previousState = probe.state;
        if (previousState !== state.gameState) {
          probe.stateTransitions.push({ from: previousState ?? null, to: state.gameState, at: performance.now() });
          probe.state = state.gameState;
        }
        const isGuarded = typeof guarded === 'function' ? guarded() : null;
        milestone('run', 'state-explore', () => state.gameState === 'explore');
        milestone('run', 'explore-controls-visible', () => visible('#explore-controls'));
        milestone('run', 'combat-overlay-hidden', () => !visible('#combat-overlay'));
        milestone('run', 'controls-guard-released', () => !state.transitioning && isGuarded === false);
        milestone('portal-entry', 'portal-ready', () => visible('#submenu-controls') &&
          visible('.milestone-portal-choice-card[data-portal-decision="return"] button') &&
          !state.transitioning && isGuarded === false);
        milestone('portal-choice', 'confirmation-dom-rendered', () => visible('.milestone-portal-confirmation'));
        milestone('portal-confirm', 'result-state', () => state.gameState === 'result');
        milestone('portal-confirm', 'result-overlay-visible', () => visible('#result-overlay'));
        if (probe.active) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
      const frame = (timestamp) => {
        if (!probe.active) return;
        const gap = timestamp - probe.frames.last;
        probe.frames.last = timestamp;
        probe.frames.maxGap = Math.max(probe.frames.maxGap, gap);
        probe.frames.count++;
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  }

  async function phase(name, fn) {
    await install();
    const start = now();
    const result = await fn();
    phases.push({ name, durationMs: now() - start });
    return result;
  }

  async function wait(name, fn) {
    await install();
    const start = now();
    const result = await fn();
    if (ENABLED) waits.push({ name, durationMs: now() - start });
    return result;
  }

  async function arm(group) {
    await install();
    if (!ENABLED) return;
    await page.evaluate((name) => {
      window.__issue1480Probe.armed[name] = performance.now();
    }, group);
  }

  async function click(name, locator) {
    await install();
    if (!ENABLED) return locator.click();
    const start = now();
    const browserClick = await page.evaluate((clickName) => {
      const probe = window.__issue1480Probe;
      const click = { name: clickName, start: performance.now(), capture: null, bubble: null };
      probe.clicks.unshift(click);
      return click.start;
    }, name);
    await locator.click();
    const end = now();
    const event = await page.evaluate((clickName) => {
      const click = window.__issue1480Probe.clicks.find(item => item.name === clickName && item.capture);
      return click ? { ...click, browserEnd: performance.now() } : null;
    }, name);
    clicks.push({
      name,
      clickCallMs: end - start,
      actionabilityMs: event?.capture == null ? null : event.capture - browserClick,
      synchronousHandlerMs: event?.capture == null || event?.bubble == null ? null : event.bubble - event.capture,
      postDispatchMs: event?.bubble == null || event.browserEnd == null ? null : event.browserEnd - event.bubble,
      browserStart: browserClick,
      capture: event?.capture ?? null,
      bubble: event?.bubble ?? null,
    });
  }

  async function finish(outcome) {
    if (!ENABLED) return;
    const browser = await page.evaluate(async (result) => {
      const probe = window.__issue1480Probe;
      probe.active = false;
      await new Promise(resolve => requestAnimationFrame(resolve));
      return {
        clicks: probe.clicks,
        frames: probe.frames,
        longTasks: probe.longTasks,
        milestones: probe.milestones,
        stateTransitions: probe.stateTransitions,
        outcome: result,
      };
    }, outcome);
    const summary = {
      test: testInfo.title,
      totalWallMs: performance.now() - startedAt,
      phases,
      waits,
      clicks,
      browser,
    };
    testInfo.attachments.push({
      name: 'issue-1480-timing.json',
      contentType: 'application/json',
      body: Buffer.from(JSON.stringify(summary, null, 2)),
    });
    console.log(`ISSUE_1480_TIMING ${JSON.stringify(summary)}`);
  }

  return { phase, wait, arm, click, finish };
}
