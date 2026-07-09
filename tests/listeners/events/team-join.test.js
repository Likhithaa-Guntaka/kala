import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';

import { handleTeamJoin } from '../../../listeners/events/team-join.js';

describe('handleTeamJoin', () => {
  let fakeClient;
  let fakeLogger;

  beforeEach(() => {
    fakeClient = {
      conversations: { open: mock.fn(async () => ({ channel: { id: 'D999' } })) },
      chat: { postMessage: mock.fn(async () => ({ ok: true, ts: '1.1' })) },
    };
    fakeLogger = { error: mock.fn() };
  });

  it('opens a DM and sends the onboarding welcome with org-type buttons', async () => {
    // Distinct user id per test — the handler dedupes by user id across calls.
    const event = { type: 'team_join', user: { id: 'U_WELCOME' } };
    await handleTeamJoin({ event, client: fakeClient, logger: fakeLogger });

    assert.strictEqual(fakeClient.conversations.open.mock.callCount(), 1);
    assert.strictEqual(fakeClient.chat.postMessage.mock.callCount(), 1);
    const msg = fakeClient.chat.postMessage.mock.calls[0].arguments[0];
    assert.strictEqual(msg.channel, 'D999');
    assert.ok(msg.text.includes("I'm Benvu"), 'has fallback text');
    assert.ok(!msg.text.includes('👋'), 'no wave emoji in fallback');
    const orgBlock = msg.blocks.find((b) => b.block_id === 'org_type_select');
    assert.ok(orgBlock, 'includes the org-type question buttons');
    assert.ok(orgBlock.elements.every((el) => el.action_id.startsWith('orgtype_')));
  });

  it('welcomes each member only once, even if the event fires twice', async () => {
    const event = { type: 'team_join', user: { id: 'U_ONCE' } };
    await handleTeamJoin({ event, client: fakeClient, logger: fakeLogger });
    await handleTeamJoin({ event, client: fakeClient, logger: fakeLogger });
    assert.strictEqual(fakeClient.chat.postMessage.mock.callCount(), 1);
  });

  it('skips bot users', async () => {
    const event = { type: 'team_join', user: { id: 'U_BOT', is_bot: true } };
    await handleTeamJoin({ event, client: fakeClient, logger: fakeLogger });
    assert.strictEqual(fakeClient.conversations.open.mock.callCount(), 0);
    assert.strictEqual(fakeClient.chat.postMessage.mock.callCount(), 0);
  });

  it('does nothing when the user has no id', async () => {
    const event = { type: 'team_join', user: {} };
    await handleTeamJoin({ event, client: fakeClient, logger: fakeLogger });
    assert.strictEqual(fakeClient.chat.postMessage.mock.callCount(), 0);
  });

  it('logs an error and allows retry when the API call fails', async () => {
    fakeClient.conversations.open = mock.fn(async () => {
      throw new Error('API error');
    });
    const event = { type: 'team_join', user: { id: 'U_ERR' } };
    await handleTeamJoin({ event, client: fakeClient, logger: fakeLogger });
    assert.strictEqual(fakeLogger.error.mock.callCount(), 1);

    // The failed user is not marked welcomed, so a later attempt can succeed.
    fakeClient.conversations.open = mock.fn(async () => ({ channel: { id: 'D999' } }));
    await handleTeamJoin({ event, client: fakeClient, logger: fakeLogger });
    assert.strictEqual(fakeClient.chat.postMessage.mock.callCount(), 1);
  });
});
