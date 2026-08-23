import assert from 'node:assert/strict';
import { isAllowedThirdParty, isAppOrigin, originOf } from '../tests/fixtures/browser-health.js';

assert.equal(originOf('http://127.0.0.1:1234/src/main.js'), 'http://127.0.0.1:1234');
assert.equal(originOf('not a url'), null);
assert.equal(isAppOrigin('http://127.0.0.1:1234/src/main.js', 'http://127.0.0.1:1234'), true);
assert.equal(isAppOrigin('https://cdn.example.test/script.js', 'http://127.0.0.1:1234'), false);
assert.equal(isAllowedThirdParty('https://o123.ingest.sentry.io/api/123'), true);
assert.equal(isAllowedThirdParty('https://cdn.example.test/script.js'), false);

console.log('browser health helpers passed');
