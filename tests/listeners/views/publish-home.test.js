import assert from 'node:assert';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { _resetPublishGen, publishHome } from '../../../listeners/views/publish-home.js';
import { sessionStore } from '../../../thread-context/index.js';

/** Read the org label out of a published Home view (or 'PICKER'/'?'). @param {any} view */
function orgLabelOf(view) {
  const ctx = (view.blocks || []).filter((b) => b.type === 'context').flatMap((b) => b.elements.map((e) => e.text));
  const line = ctx.find((t) => /Tailored for/.test(t));
  if (line) return line;
  return (view.blocks || []).some((b) => String(b.block_id || '').startsWith('org_type_select')) ? 'PICKER' : '?';
}

describe('publishHome', () => {
  beforeEach(() => {
    _resetPublishGen();
    sessionStore.clearOrgType('U');
  });
  afterEach(() => sessionStore.clearOrgType('U'));

  it('reads the org type AFTER the await, so it never publishes a pre-await snapshot', async () => {
    sessionStore.setOrgType('U', 'food_bank');

    // Hold users.info open so we can change the org type mid-await, then release.
    let release;
    const client = {
      users: {
        info: () =>
          new Promise((r) => {
            release = () => r({ user: { profile: { first_name: 'Dee' } } });
          }),
      },
      views: { publish: mock.fn(async () => ({ ok: true })) },
    };

    const pending = publishHome(client, { userId: 'U', botUserId: 'B' });
    // The user switches org type while the name fetch is still in flight.
    sessionStore.setOrgType('U', 'education');
    release();
    const published = await pending;

    assert.strictEqual(published, true);
    assert.strictEqual(client.views.publish.mock.callCount(), 1);
    const view = client.views.publish.mock.calls[0].arguments[0].view;
    assert.match(orgLabelOf(view), /Education/, 'publishes the post-await org type, not the stale one');
  });

  it('lets the newest call win: a slower older call is superseded and does not publish', async () => {
    sessionStore.setOrgType('U', 'education');

    // First (older) call: its name fetch hangs until we release it.
    let releaseSlow;
    const slowClient = {
      users: {
        info: () =>
          new Promise((r) => {
            releaseSlow = () => r({ user: { profile: { first_name: 'A' } } });
          }),
      },
      views: { publish: mock.fn(async () => ({ ok: true })) },
    };
    // Second (newer) call: resolves immediately.
    const fastClient = {
      users: { info: async () => ({ user: { profile: { first_name: 'B' } } }) },
      views: { publish: mock.fn(async () => ({ ok: true })) },
    };

    const older = publishHome(slowClient, { userId: 'U', botUserId: 'X' }); // gen 1
    const newer = publishHome(fastClient, { userId: 'U', botUserId: 'X' }); // gen 2

    const newerResult = await newer;
    releaseSlow();
    const olderResult = await older;

    // Only the newest call publishes; the stale older one bails out.
    assert.strictEqual(newerResult, true);
    assert.strictEqual(olderResult, false);
    assert.strictEqual(fastClient.views.publish.mock.callCount(), 1);
    assert.strictEqual(slowClient.views.publish.mock.callCount(), 0);
  });

  it('publishes normally with a notice banner when there is no contention', async () => {
    sessionStore.setOrgType('U', 'education');
    const client = {
      users: { info: async () => ({ user: { profile: { first_name: 'Dee' } } }) },
      views: { publish: mock.fn(async () => ({ ok: true })) },
    };
    const ok = await publishHome(client, { userId: 'U', botUserId: 'B', notice: 'Sent to your messages.' });
    assert.strictEqual(ok, true);
    const view = client.views.publish.mock.calls[0].arguments[0].view;
    assert.ok(view.blocks.some((b) => b.type === 'section' && b.text?.text === 'Sent to your messages.'));
  });
});
