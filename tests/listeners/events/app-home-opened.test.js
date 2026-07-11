import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';

import { handleAppHomeOpened } from '../../../listeners/events/app-home-opened.js';
import { sessionStore } from '../../../thread-context/index.js';

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
    // A failed name fetch must not break the tab — it just greets neutrally.
    assert.strictEqual(fakeClient.views.publish.mock.callCount(), 1);
    assert.strictEqual(fakeLogger.error.mock.callCount(), 0);
  });

  it('still publishes the home view when users.info hangs (does not block the render)', async () => {
    // users.info never resolves — the 2s timeout in fetchFirstName must fire so
    // the Home tab renders with a neutral greeting instead of blocking forever.
    fakeClient.users.info = mock.fn(() => new Promise(() => {}));
    // Onboarded state so the greeting path (not the first-open picker) renders.
    sessionStore.setOrgType('U123', 'education');
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const event = { tab: 'home', channel: 'D123' };
      const pending = handleAppHomeOpened({
        client: fakeClient,
        event,
        context: fakeContext,
        logger: fakeLogger,
      });
      // Advance past the 2s name-fetch timeout instantly (no real wait).
      mock.timers.tick(2001);
      await pending;

      assert.strictEqual(fakeClient.views.publish.mock.callCount(), 1);
      assert.strictEqual(fakeLogger.error.mock.callCount(), 0);
      // The header stays the stable "Benvu" brand; the greeting is a bold section
      // beneath it (matching the branded-header redesign and its sibling tests).
      // With the name lookup timed out, that greeting falls back to the neutral
      // form (no ", Name!").
      const view = fakeClient.views.publish.mock.calls[0].arguments[0].view;
      const greeting = view.blocks.find(
        (b) => b.type === 'section' && /^\*Good (morning|afternoon|evening)/.test(b.text?.text || ''),
      );
      assert.ok(greeting, 'renders a neutral greeting section');
      assert.match(greeting.text.text, /^\*Good (morning|afternoon|evening)!\*$/);
    } finally {
      mock.timers.reset();
      sessionStore.clearOrgType('U123');
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
