import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';

import { handleIssueSubmission } from '../../../listeners/views/issue-modal.js';

describe('handleIssueSubmission', () => {
  let fakeAck;
  let fakeBody;
  let fakeContext;
  let fakeClient;
  let fakeLogger;

  /** @param {string|undefined} description */
  function bodyWith(description) {
    return {
      view: {
        state: {
          values: {
            category_block: { category_select: { selected_option: { value: 'Find Grants' } } },
            description_block: { description_input: { value: description } },
          },
        },
      },
    };
  }

  beforeEach(() => {
    fakeAck = mock.fn(async () => {});
    fakeBody = bodyWith('Grants for youth education under $50k');
    fakeContext = { userId: 'U123', botUserId: 'U0BOT' };
    fakeClient = {
      conversations: { open: mock.fn(async () => ({ channel: { id: 'D123' } })) },
      chat: { postMessage: mock.fn(async () => ({ ok: true })) },
      views: { publish: mock.fn(async () => ({ ok: true })) },
      users: { info: mock.fn(async () => ({ user: { profile: { first_name: 'Dee' } } })) },
    };
    fakeLogger = { error: mock.fn() };
  });

  it('acknowledges the submission', async () => {
    await handleIssueSubmission({
      ack: fakeAck,
      body: fakeBody,
      client: fakeClient,
      context: fakeContext,
      logger: fakeLogger,
    });
    assert.strictEqual(fakeAck.mock.callCount(), 1);
  });

  it('opens a DM conversation with the user', async () => {
    await handleIssueSubmission({
      ack: fakeAck,
      body: fakeBody,
      client: fakeClient,
      context: fakeContext,
      logger: fakeLogger,
    });
    assert.strictEqual(fakeClient.conversations.open.mock.callCount(), 1);
    assert.strictEqual(fakeClient.conversations.open.mock.calls[0].arguments[0].users, 'U123');
  });

  it('posts a human parent message that names the category, not debug fields', async () => {
    await handleIssueSubmission({
      ack: fakeAck,
      body: fakeBody,
      client: fakeClient,
      context: fakeContext,
      logger: fakeLogger,
    });
    const msg = fakeClient.chat.postMessage.mock.calls[0].arguments[0];
    assert.strictEqual(msg.channel, 'D123');
    assert.ok(msg.text.includes('Find Grants'), 'names the category');
    assert.ok(/thread/i.test(msg.text), 'invites the user to the thread');
    // The old debug-looking text must be gone.
    assert.ok(!msg.text.includes('Category:'), 'no raw field labels');
    assert.ok(!msg.text.includes('Description:'), 'no raw field labels');
    assert.ok(!/undefined|null/.test(msg.text), 'never renders undefined/null');
  });

  it('carries the real request as the agent prompt in metadata (not the visible text)', async () => {
    await handleIssueSubmission({
      ack: fakeAck,
      body: fakeBody,
      client: fakeClient,
      context: fakeContext,
      logger: fakeLogger,
    });
    const msg = fakeClient.chat.postMessage.mock.calls[0].arguments[0];
    assert.strictEqual(msg.metadata.event_type, 'issue_submission');
    assert.strictEqual(msg.metadata.event_payload.user_id, 'U123');
    assert.strictEqual(msg.metadata.event_payload.prompt, 'Find Grants: Grants for youth education under $50k');
  });

  it('with the Details field left blank, prompt is just the category and text has no "undefined"', async () => {
    const body = bodyWith(undefined);
    await handleIssueSubmission({ ack: fakeAck, body, client: fakeClient, context: fakeContext, logger: fakeLogger });
    const msg = fakeClient.chat.postMessage.mock.calls[0].arguments[0];
    assert.ok(!/undefined|null/.test(msg.text));
    assert.strictEqual(msg.metadata.event_payload.prompt, 'Find Grants');
  });

  it('republishes the Home tab with a confirmation banner naming the category', async () => {
    await handleIssueSubmission({
      ack: fakeAck,
      body: fakeBody,
      client: fakeClient,
      context: fakeContext,
      logger: fakeLogger,
    });
    assert.strictEqual(fakeClient.views.publish.mock.callCount(), 1);
    const publish = fakeClient.views.publish.mock.calls[0].arguments[0];
    assert.strictEqual(publish.user_id, 'U123');
    assert.strictEqual(publish.view.type, 'home');
    const banner = publish.view.blocks.find((b) => b.type === 'section' && /messages tab/i.test(b.text?.text || ''));
    assert.ok(banner, 'a confirmation banner is present');
    assert.ok(banner.text.text.includes('Find Grants'), 'banner names the category');
  });

  it('still completes the submission if the Home banner republish fails', async () => {
    fakeClient.views.publish = mock.fn(async () => {
      throw new Error('publish failed');
    });
    await handleIssueSubmission({
      ack: fakeAck,
      body: fakeBody,
      client: fakeClient,
      context: fakeContext,
      logger: fakeLogger,
    });
    // DM was still posted; the banner failure was caught and logged, not thrown.
    assert.strictEqual(fakeClient.chat.postMessage.mock.callCount(), 1);
    assert.strictEqual(fakeLogger.error.mock.callCount(), 1);
  });

  it('logs error when conversations.open fails', async () => {
    fakeClient.conversations.open = mock.fn(async () => {
      throw new Error('API error');
    });
    await handleIssueSubmission({
      ack: fakeAck,
      body: fakeBody,
      client: fakeClient,
      context: fakeContext,
      logger: fakeLogger,
    });
    assert.strictEqual(fakeLogger.error.mock.callCount(), 1);
  });
});
