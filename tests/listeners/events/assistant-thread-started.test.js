import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';

import { handleAssistantThreadStarted } from '../../../listeners/events/assistant-thread-started.js';
import { getOrgTypeById } from '../../../listeners/org-types.js';
import { sessionStore } from '../../../thread-context/index.js';

describe('handleAssistantThreadStarted', () => {
  let fakeClient;
  let fakeLogger;

  const startedEvent = (over = {}) => ({
    type: 'assistant_thread_started',
    assistant_thread: { user_id: 'U123', channel_id: 'D123', thread_ts: '1700000000.000100', context: {}, ...over },
  });

  beforeEach(() => {
    fakeClient = {
      chat: { postMessage: mock.fn(async () => ({ ok: true, ts: '1700000000.000200' })) },
      assistant: { threads: { setSuggestedPrompts: mock.fn(async () => ({ ok: true })) } },
    };
    fakeLogger = { error: mock.fn() };
    sessionStore.clearOrgType('U123');
  });

  it('greets in the thread and pins prompts to the DM channel', async () => {
    await handleAssistantThreadStarted({ event: startedEvent(), client: fakeClient, logger: fakeLogger });

    assert.strictEqual(fakeClient.chat.postMessage.mock.callCount(), 1);
    const greet = fakeClient.chat.postMessage.mock.calls[0].arguments[0];
    assert.strictEqual(greet.channel, 'D123');
    assert.strictEqual(greet.thread_ts, '1700000000.000100');
    assert.ok(/Benvu/.test(greet.text));

    assert.strictEqual(fakeClient.assistant.threads.setSuggestedPrompts.mock.callCount(), 1);
    const prompts = fakeClient.assistant.threads.setSuggestedPrompts.mock.calls[0].arguments[0];
    assert.strictEqual(prompts.channel_id, 'D123');
    assert.ok(Array.isArray(prompts.prompts));
    assert.ok(prompts.prompts.length > 0 && prompts.prompts.length <= 4);
  });

  it("uses the user's org type to tailor the prompts when known", async () => {
    sessionStore.setOrgType('U123', 'education');
    try {
      await handleAssistantThreadStarted({ event: startedEvent(), client: fakeClient, logger: fakeLogger });
      const prompts = fakeClient.assistant.threads.setSuggestedPrompts.mock.calls[0].arguments[0].prompts;
      const org = getOrgTypeById('education');
      assert.deepStrictEqual(
        prompts,
        org.tailoredPrompts.slice(0, 4).map((message) => ({ title: message, message })),
      );
    } finally {
      sessionStore.clearOrgType('U123');
    }
  });

  it('does nothing when the event has no channel', async () => {
    const event = { type: 'assistant_thread_started', assistant_thread: undefined };
    await handleAssistantThreadStarted({ event, client: fakeClient, logger: fakeLogger });
    assert.strictEqual(fakeClient.chat.postMessage.mock.callCount(), 0);
    assert.strictEqual(fakeClient.assistant.threads.setSuggestedPrompts.mock.callCount(), 0);
    assert.strictEqual(fakeLogger.error.mock.callCount(), 0);
  });

  it('logs and swallows errors so a failed greeting never crashes the app', async () => {
    fakeClient.chat.postMessage = mock.fn(async () => {
      throw new Error('channel_not_found');
    });
    await handleAssistantThreadStarted({ event: startedEvent(), client: fakeClient, logger: fakeLogger });
    assert.strictEqual(fakeLogger.error.mock.callCount(), 1);
  });
});
