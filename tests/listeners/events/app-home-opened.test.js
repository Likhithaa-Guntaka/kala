import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';

import { handleAppHomeOpened } from '../../../listeners/events/app-home-opened.js';

describe('handleAppHomeOpened', () => {
  let fakeClient;
  let fakeContext;
  let fakeLogger;

  beforeEach(() => {
    fakeClient = {
      views: { publish: mock.fn(async () => ({ ok: true })) },
      assistant: { threads: { setSuggestedPrompts: mock.fn(async () => ({ ok: true })) } },
      users: { info: mock.fn(async () => ({ user: { profile: { first_name: 'Dedeepya' } } })) },
    };
    fakeContext = { userId: 'U123', botUserId: 'U0BOT' };
    fakeLogger = { error: mock.fn() };
  });

  it('publishes the home view when event.tab === "home"', async () => {
    const event = { tab: 'home', channel: 'D123' };
    await handleAppHomeOpened({ client: fakeClient, event, context: fakeContext, logger: fakeLogger });
    assert.strictEqual(fakeClient.views.publish.mock.callCount(), 1);
    const callArgs = fakeClient.views.publish.mock.calls[0].arguments[0];
    assert.strictEqual(callArgs.user_id, 'U123');
    assert.strictEqual(callArgs.view.type, 'home');
    assert.strictEqual(fakeClient.assistant.threads.setSuggestedPrompts.mock.callCount(), 0);
  });

  it('sets suggested prompts when event.tab === "messages"', async () => {
    const event = { tab: 'messages', channel: 'D123' };
    await handleAppHomeOpened({ client: fakeClient, event, context: fakeContext, logger: fakeLogger });
    assert.strictEqual(fakeClient.assistant.threads.setSuggestedPrompts.mock.callCount(), 1);
    const callArgs = fakeClient.assistant.threads.setSuggestedPrompts.mock.calls[0].arguments[0];
    assert.strictEqual(callArgs.channel_id, 'D123');
    assert.ok(Array.isArray(callArgs.prompts));
    assert.ok(callArgs.prompts.length > 0);
    assert.strictEqual(fakeClient.views.publish.mock.callCount(), 0);
  });

  it('still publishes the home view when the name lookup fails', async () => {
    fakeClient.users.info = mock.fn(async () => {
      throw new Error('missing_scope');
    });
    const event = { tab: 'home', channel: 'D123' };
    await handleAppHomeOpened({ client: fakeClient, event, context: fakeContext, logger: fakeLogger });
    assert.strictEqual(fakeClient.views.publish.mock.callCount(), 1);
    assert.strictEqual(fakeLogger.error.mock.callCount(), 0);
  });

  it('still publishes the home view when users.info hangs (does not block the render)', async () => {
    fakeClient.users.info = mock.fn(() => new Promise(() => {}));
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const event = { tab: 'home', channel: 'D123' };
      const pending = handleAppHomeOpened({
        client: fakeClient,
        event,
        context: fakeContext,
        logger: fakeLogger,
      });
      mock.timers.tick(2001);
      await pending;

      assert.strictEqual(fakeClient.views.publish.mock.callCount(), 1);
      assert.strictEqual(fakeLogger.error.mock.callCount(), 0);
      const view = fakeClient.views.publish.mock.calls[0].arguments[0].view;
      const greeting = view.blocks.find(
        (b) => b.type === 'section' && /^\*Good (morning|afternoon|evening)!\*$/.test(b.text?.text || ''),
      );
      assert.ok(greeting, 'neutral greeting section present');
    } finally {
      mock.timers.reset();
    }
  });

  it('logs error when views.publish fails', async () => {
    fakeClient.views.publish = mock.fn(async () => {
      throw new Error('API error');
    });
    const event = { tab: 'home', channel: 'D123' };
    await handleAppHomeOpened({ client: fakeClient, event, context: fakeContext, logger: fakeLogger });
    assert.strictEqual(fakeLogger.error.mock.callCount(), 1);
  });
});
