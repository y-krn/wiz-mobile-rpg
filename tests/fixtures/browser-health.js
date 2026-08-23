import { test as base, expect } from '@playwright/test';

const THIRD_PARTY_HOSTS = [
  'sentry.io',
  'ingest.sentry.io',
  'posthog.com',
  'app.posthog.com',
];

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function isAppOrigin(url, appOrigin) {
  return originOf(url) === appOrigin;
}

function isAllowedThirdParty(url) {
  try {
    const hostname = new URL(url).hostname;
    return THIRD_PARTY_HOSTS.some(host => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

function formatFailure(type, detail) {
  return `${type}: ${detail}`;
}

const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const configuredBaseURL = testInfo.project.use.baseURL;
    const appOrigin = configuredBaseURL ? originOf(configuredBaseURL) : null;
    const failures = [];
    const allowedConsoleErrorPatterns = testInfo.annotations
      .filter(annotation => annotation.type === 'browser-health:allow-console-error')
      .map(annotation => annotation.description || '')
      .filter(Boolean);
    const isStaleChestRegression = testInfo.title.includes('stale state');

    page.on('pageerror', error => {
      failures.push(formatFailure('pageerror', error.message));
    });

    page.on('console', message => {
      if (message.type() !== 'error') return;
      const location = message.location().url;
      const isAppError = !location || (appOrigin && isAppOrigin(location, appOrigin));
      const isAllowed = allowedConsoleErrorPatterns.some(pattern => message.text().includes(pattern)) || (
        isStaleChestRegression && message.text().includes('Failed to finish chest open transition')
      );
      if (isAppError && !isAllowed) {
        failures.push(formatFailure('console.error', message.text()));
      }
    });

    page.on('requestfailed', request => {
      const url = request.url();
      if (appOrigin && isAppOrigin(url, appOrigin) && !isAllowedThirdParty(url)) {
        failures.push(formatFailure(
          'requestfailed',
          `${request.method()} ${url} (${request.failure()?.errorText || 'unknown error'})`,
        ));
      }
    });

    await use(page);

    expect(failures, 'browser health failures').toEqual([]);
  },
});

export { isAllowedThirdParty, isAppOrigin, originOf, test, expect };
