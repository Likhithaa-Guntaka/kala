import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';

import {
  _resetScheduleChanges,
  ackSummary,
  addScheduleChange,
  getScheduleChange,
  setMessageRef,
} from '../../../agent/tools/schedule-store.js';
import { handleReactionAdded } from '../../../listeners/events/reaction-added.js';

describe('handleReactionAdded', () => {
  let client;
  let context;
  let logger;

  beforeEach(() => {
    client = {
      users: { info: mock.fn(async () => ({ user: { id: 'UHUMAN', is_bot: false } })) },
      conversations: { history: mock.fn(async () => ({ messages: [{ text: 'quarterly meeting notes' }] })) },
      chat: { postMessage: mock.fn(async () => ({ ok: true, ts: '1' })) },
    };
    context = { botUserId: 'UKALA' };
    logger = { error: mock.fn() };
  });

  const msg = (reaction, user = 'UHUMAN', ts = '100.1') => ({
    reaction,
    user,
    item: { type: 'message', channel: 'C1', ts },
  });

  it('ignores emojis it does not act on', async () => {
    await handleReactionAdded({ event: msg('thumbsup', 'UHUMAN', '1.1'), client, context, logger });
    assert.strictEqual(client.users.info.mock.callCount(), 0);
    assert.strictEqual(client.chat.postMessage.mock.callCount(), 0);
  });

  it('ignores reactions on non-message items', async () => {
    const event = { reaction: 'clipboard', user: 'UHUMAN', item: { type: 'file', file: 'F1' } };
    await handleReactionAdded({ event, client, context, logger });
    assert.strictEqual(client.chat.postMessage.mock.callCount(), 0);
  });

  it("ignores Kala's own reactions", async () => {
    await handleReactionAdded({ event: msg('moneybag', 'UKALA', '2.1'), client, context, logger });
    assert.strictEqual(client.users.info.mock.callCount(), 0);
    assert.strictEqual(client.chat.postMessage.mock.callCount(), 0);
  });

  it('ignores reactions from bot users', async () => {
    client.users.info = mock.fn(async () => ({ user: { id: 'UBOT', is_bot: true } }));
    await handleReactionAdded({ event: msg('moneybag', 'UBOTREACT', '3.1'), client, context, logger });
    assert.strictEqual(client.chat.postMessage.mock.callCount(), 0);
  });

  it('bell asks for the deadline in a thread', async () => {
    await handleReactionAdded({ event: msg('bell', 'UHUMAN', '4.1'), client, context, logger });
    assert.strictEqual(client.chat.postMessage.mock.callCount(), 1);
    const arg = client.chat.postMessage.mock.calls[0].arguments[0];
    assert.strictEqual(arg.channel, 'C1');
    assert.strictEqual(arg.thread_ts, '4.1');
    assert.ok(arg.text.includes('deadline'));
  });

  it('dedupes the same reaction event delivered twice (bell)', async () => {
    const event = msg('bell', 'UHUMAN', '5.1');
    await handleReactionAdded({ event, client, context, logger });
    await handleReactionAdded({ event, client, context, logger });
    assert.strictEqual(client.chat.postMessage.mock.callCount(), 1);
  });

  describe('schedule-change acknowledgment via reaction', () => {
    beforeEach(() => {
      _resetScheduleChanges();
      client.chat.update = mock.fn(async () => ({ ok: true }));
    });

    it('any reaction on a tracked change card records an ack and refreshes the card', async () => {
      const c = addScheduleChange({ change: 'Call time 8am', people: ['<@UHUMAN>', '<@U2>'], channelId: 'C1' });
      setMessageRef(c.id, { channel: 'C1', ts: '900.1' });

      // 'tada' is NOT an agent-trigger emoji — proves ANY reaction confirms.
      await handleReactionAdded({ event: msg('tada', 'UHUMAN', '900.1'), client, context, logger });

      assert.strictEqual(ackSummary(getScheduleChange(c.id)).acked, 1);
      assert.strictEqual(client.chat.update.mock.callCount(), 1, 'card refreshed in place');
      // It short-circuits before the agent-trigger path (no user lookup / no post).
      assert.strictEqual(client.users.info.mock.callCount(), 0);
      assert.strictEqual(client.chat.postMessage.mock.callCount(), 0);
    });

    it('dedupes the same acknowledgment reaction delivered twice', async () => {
      const c = addScheduleChange({ change: 'x', people: ['<@UHUMAN>'], channelId: 'C1' });
      setMessageRef(c.id, { channel: 'C1', ts: '902.1' });
      const event = msg('white_check_mark', 'UHUMAN', '902.1');
      await handleReactionAdded({ event, client, context, logger });
      await handleReactionAdded({ event, client, context, logger });
      assert.strictEqual(ackSummary(getScheduleChange(c.id)).acked, 1);
      assert.strictEqual(client.chat.update.mock.callCount(), 1);
    });

    it('leaves reactions on untracked messages to the normal trigger routing', async () => {
      await handleReactionAdded({ event: msg('thumbsup', 'UHUMAN', '903.1'), client, context, logger });
      assert.strictEqual(client.chat.update.mock.callCount(), 0);
    });
  });
});
