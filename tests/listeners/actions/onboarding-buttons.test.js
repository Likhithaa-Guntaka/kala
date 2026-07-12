import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';

import { handlePromptButton } from '../../../listeners/actions/onboarding-buttons.js';
import { _resetPublishGen } from '../../../listeners/views/publish-home.js';

/**
 * The real runKalaAgent would call the Claude API, so we inject a fake runner via
 * handlePromptButton's second parameter (the codebase's dependency-injection seam,
 * mirroring runKalaAgent(text, sid, deps) itself). Node 20's test runner has no
 * module mocking, and message.test.js sidesteps the agent entirely by testing a
 * pure helper — neither applies here, since we need to drive the whole handler.
 */
describe('handlePromptButton (Home tab feedback banner)', () => {
  let fakeAck;
  let fakeContext;
  let fakeLogger;
  let fakeRunAgent;
  let callLog;
  let fakeClient;

  /** Build a client whose calls append to `callLog` so we can assert ordering. */
  function makeClient() {
    return {
      conversations: { open: mock.fn(async () => ({ channel: { id: 'D123' } })) },
      chat: {
        postMessage: mock.fn(async (/** @type {any} */ arg) => {
          // The reply is threaded (thread_ts); the opening echo is not.
          callLog.push(arg.thread_ts ? 'reply' : 'echo');
          return { ok: true, ts: '111.1' };
        }),
      },
      assistant: { threads: { setStatus: mock.fn(async () => ({ ok: true })) } },
      views: {
        publish: mock.fn(async () => {
          callLog.push('publish');
          return { ok: true };
        }),
      },
      users: { info: mock.fn(async () => ({ user: { profile: { first_name: 'A' } } })) },
    };
  }

  beforeEach(() => {
    _resetPublishGen();
    callLog = [];
    fakeAck = mock.fn(async () => {});
    fakeContext = { botUserId: 'U0BOT', userToken: 'xoxp-test' };
    fakeLogger = { error: mock.fn() };
    fakeRunAgent = mock.fn(async () => ({ responseText: 'Here you go.', sessionId: 'S1', grants: [] }));
    fakeClient = makeClient();
  });

  /** A Home-tab click has no originating channel. @param {{ channel?: any }} [over] */
  function bodyFrom(over = {}) {
    return { user: { id: 'U1' }, actions: [{ value: 'Draft our new season announcement' }], ...over };
  }

  it('clicked from Home (no channel): opens a DM and republishes Home with the notice banner, before the reply', async () => {
    await handlePromptButton(
      { ack: fakeAck, body: bodyFrom(), client: fakeClient, context: fakeContext, logger: fakeLogger },
      fakeRunAgent,
    );

    // A DM was opened (Home buttons have no channel of their own).
    assert.strictEqual(fakeClient.conversations.open.mock.callCount(), 1);

    // Home was republished with a banner carrying the confirmation copy.
    assert.strictEqual(fakeClient.views.publish.mock.callCount(), 1);
    const publishArg = fakeClient.views.publish.mock.calls[0].arguments[0];
    assert.strictEqual(publishArg.user_id, 'U1');
    assert.strictEqual(publishArg.view.type, 'home');
    const banner = publishArg.view.blocks.find(
      (/** @type {any} */ b) => b.type === 'section' && /Messages tab/i.test(b.text?.text || ''),
    );
    assert.ok(banner, 'a confirmation banner naming the Messages tab is present');

    // The banner lands before the (potentially slow) agent reply — not after.
    assert.ok(callLog.includes('publish') && callLog.includes('reply'), 'both banner and reply happened');
    assert.ok(callLog.indexOf('publish') < callLog.indexOf('reply'), 'banner is published before the reply is posted');
  });

  it('clicked from within the DM (channel present): no Home banner, just echo + reply', async () => {
    await handlePromptButton(
      {
        ack: fakeAck,
        body: bodyFrom({ channel: { id: 'D999' } }),
        client: fakeClient,
        context: fakeContext,
        logger: fakeLogger,
      },
      fakeRunAgent,
    );

    // No Home republish when the click already came from a message surface.
    assert.strictEqual(fakeClient.views.publish.mock.callCount(), 0);
    // No need to open a DM — one is already present.
    assert.strictEqual(fakeClient.conversations.open.mock.callCount(), 0);
    // The normal echo + reply still happen.
    assert.ok(callLog.includes('echo') && callLog.includes('reply'));
  });

  it('still posts the reply if the Home banner republish fails (best-effort banner)', async () => {
    fakeClient.views.publish = mock.fn(async () => {
      callLog.push('publish');
      throw new Error('publish failed');
    });

    await handlePromptButton(
      { ack: fakeAck, body: bodyFrom(), client: fakeClient, context: fakeContext, logger: fakeLogger },
      fakeRunAgent,
    );

    // The banner failure was caught and logged, and the agent reply still went out.
    assert.strictEqual(fakeLogger.error.mock.callCount(), 1);
    assert.ok(callLog.includes('reply'), 'reply posted despite the banner failure');
    assert.strictEqual(fakeRunAgent.mock.callCount(), 1);
  });
});
