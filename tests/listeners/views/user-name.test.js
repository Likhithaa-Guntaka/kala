import assert from 'node:assert';
import { describe, it, mock } from 'node:test';

import { fetchFirstName } from '../../../listeners/views/user-name.js';

/** @param {any} user */
function clientReturning(user) {
  return { users: { info: mock.fn(async () => ({ user })) } };
}

describe('fetchFirstName', () => {
  it('prefers the profile first_name', async () => {
    const client = clientReturning({ profile: { first_name: 'Dedeepya', display_name: 'dee' }, real_name: 'X Y' });
    assert.strictEqual(await fetchFirstName(client, 'U1'), 'Dedeepya');
  });

  it('falls back to the first token of the display name', async () => {
    const client = clientReturning({ profile: { display_name: 'Sam Rivera' } });
    assert.strictEqual(await fetchFirstName(client, 'U1'), 'Sam');
  });

  it('falls back to the first token of the real name', async () => {
    const client = clientReturning({ real_name: 'Alex Chen' });
    assert.strictEqual(await fetchFirstName(client, 'U1'), 'Alex');
  });

  it('returns "" when there is no usable name', async () => {
    const client = clientReturning({ profile: {} });
    assert.strictEqual(await fetchFirstName(client, 'U1'), '');
  });

  it('returns "" when the API call throws', async () => {
    const client = {
      users: {
        info: mock.fn(async () => {
          throw new Error('missing_scope');
        }),
      },
    };
    assert.strictEqual(await fetchFirstName(client, 'U1'), '');
  });

  it('gives up and returns "" when users.info hangs past the timeout', async () => {
    // A call that never resolves — simulates a hung Slack API response.
    const client = { users: { info: mock.fn(() => new Promise(() => {})) } };
    const start = Date.now();
    // Use a short timeout so the test is fast; the real default is 2000ms.
    const result = await fetchFirstName(client, 'U1', 50);
    const elapsed = Date.now() - start;
    assert.strictEqual(result, '');
    assert.ok(elapsed < 1000, `should return promptly on hang, took ${elapsed}ms`);
  });
});
