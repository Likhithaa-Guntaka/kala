import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';
import { _resetPublishGen, publishHome } from '../../../listeners/views/publish-home.js';

describe('publishHome', () => {
  beforeEach(() => {
    _resetPublishGen();
  });

  it('publishes the arts and culture Home view once', async () => {
    const client = {
      users: { info: async () => ({ user: { profile: { first_name: 'Dee' } } }) },
      views: { publish: mock.fn(async () => ({ ok: true })) },
    };
    const ok = await publishHome(client, { userId: 'U', botUserId: 'B' });
    assert.strictEqual(ok, true);
    assert.strictEqual(client.views.publish.mock.callCount(), 1);
    const view = client.views.publish.mock.calls[0].arguments[0].view;
    assert.strictEqual(view.type, 'home');
    const footer = view.blocks
      .filter((b) => b.type === 'context')
      .flatMap((b) => b.elements.map((e) => e.text))
      .find((t) => /Tailored for/.test(t));
    assert.match(footer, /Arts & Culture/);
  });

  it('lets the newest call win: a slower older call is superseded and does not publish', async () => {
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
