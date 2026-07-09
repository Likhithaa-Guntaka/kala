import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';

import { handleFeedbackButton, handleFeedbackDownSubmit } from '../../listeners/actions/feedback-buttons.js';
import { handleFeedbackAdminCommand } from '../../listeners/commands/feedback.js';
import {
  formatFeedbackSummary,
  getAllFeedback,
  recordFeedback,
  summarizeFeedback,
} from '../../listeners/feedback-store.js';
import { buildFeedbackBlocks, buildResponseBlocks } from '../../listeners/views/feedback-builder.js';

describe('feedback store', () => {
  it('records entries and aggregates up/down counts', () => {
    const before = summarizeFeedback().total;
    recordFeedback({ user_id: 'U1', message_summary: 'q', response_summary: 'a', rating: 'up', timestamp: 't' });
    recordFeedback({ user_id: 'U2', message_summary: 'q', response_summary: 'a', rating: 'down', timestamp: 't' });
    const s = summarizeFeedback();
    assert.strictEqual(s.total, before + 2);
    assert.ok(s.up >= 1 && s.down >= 1);
    assert.ok(getAllFeedback().length === s.total);
  });

  it('formats an empty summary before any feedback... or a populated one after', () => {
    const text = formatFeedbackSummary();
    assert.ok(text.includes('Benvu feedback'));
  });
});

describe('feedback buttons', () => {
  it('renders 👍 and 👎 as real action buttons', () => {
    const blocks = buildFeedbackBlocks();
    const actions = blocks.find((b) => b.type === 'actions' && b.block_id === 'feedback');
    assert.ok(actions);
    const ids = actions.elements.map((e) => e.action_id);
    assert.deepStrictEqual(ids, ['feedback_up', 'feedback_down']);
    assert.deepStrictEqual(
      actions.elements.map((e) => e.value),
      ['up', 'down'],
    );
  });

  it('buildResponseBlocks chunks long text and appends feedback', () => {
    const blocks = buildResponseBlocks('x'.repeat(6000));
    const sections = blocks.filter((b) => b.type === 'section');
    assert.strictEqual(sections.length, 3); // 2900 + 2900 + 200
    assert.ok(blocks.some((b) => b.block_id === 'feedback'));
  });
});

describe('handleFeedbackButton', () => {
  let ack;
  let client;
  let logger;

  beforeEach(() => {
    ack = mock.fn(async () => {});
    client = {
      conversations: { history: mock.fn(async () => ({ messages: [{ text: 'find grants for youth' }] })) },
      chat: { postEphemeral: mock.fn(async () => ({ ok: true })) },
    };
    logger = { info: mock.fn(), error: mock.fn() };
  });

  it('logs feedback and thanks the user', async () => {
    const before = getAllFeedback().length;
    const body = {
      user: { id: 'UCLICK' },
      actions: [{ value: 'up' }],
      channel: { id: 'C1' },
      message: { ts: '2.0', thread_ts: '1.0', text: 'Here are 4 grants...' },
    };
    await handleFeedbackButton({ ack, body, client, logger });

    assert.strictEqual(ack.mock.callCount(), 1);
    const all = getAllFeedback();
    assert.strictEqual(all.length, before + 1);
    const entry = all[all.length - 1];
    assert.strictEqual(entry.user_id, 'UCLICK');
    assert.strictEqual(entry.rating, 'up');
    assert.ok(entry.response_summary.includes('grants'));
    assert.ok(entry.message_summary.includes('youth'));
    assert.ok(entry.timestamp.length > 0);

    assert.strictEqual(client.chat.postEphemeral.mock.callCount(), 1);
    assert.strictEqual(client.chat.postEphemeral.mock.calls[0].arguments[0].text, 'Thanks for the feedback!');
  });

  it('👍 never opens a modal (single click, no friction)', async () => {
    client.views = { open: mock.fn(async () => ({ ok: true })) };
    const body = {
      user: { id: 'UUP' },
      trigger_id: 'T1',
      actions: [{ value: 'up' }],
      channel: { id: 'C1' },
      message: { ts: '2.0', text: 'ok' },
    };
    await handleFeedbackButton({ ack, body, client, logger });
    assert.strictEqual(client.views.open.mock.callCount(), 0);
  });

  it('👎 logs the rating immediately AND opens the comment modal', async () => {
    client.views = { open: mock.fn(async () => ({ ok: true })) };
    const before = getAllFeedback().length;
    const body = {
      user: { id: 'UDOWN' },
      trigger_id: 'T2',
      actions: [{ value: 'down' }],
      channel: { id: 'C1' },
      message: { ts: '2.0', thread_ts: '1.0', text: 'a bad answer' },
    };
    await handleFeedbackButton({ ack, body, client, logger });

    // The 👎 is recorded on click — a cancelled modal must not lose the signal.
    assert.strictEqual(getAllFeedback().length, before + 1);
    const entry = getAllFeedback().at(-1);
    assert.strictEqual(entry.rating, 'down');
    assert.ok(entry.id > 0);
    assert.strictEqual(entry.comment, undefined);

    assert.strictEqual(client.views.open.mock.callCount(), 1);
    const view = client.views.open.mock.calls[0].arguments[0].view;
    assert.strictEqual(view.callback_id, 'feedback_down_submit');
    assert.strictEqual(JSON.parse(view.private_metadata).feedbackId, entry.id);
    const input = view.blocks.find((b) => b.type === 'input');
    assert.strictEqual(input.optional, true);
    assert.ok(input.label.text.includes('What went wrong?'));
  });
});

describe('handleFeedbackDownSubmit', () => {
  const ack = mock.fn(async () => {});
  const logger = { info: mock.fn(), error: mock.fn() };

  /** Simulate a 👎 click, returning the recorded entry. */
  async function clickDown(userId) {
    const client = {
      views: { open: mock.fn(async () => ({ ok: true })) },
      conversations: { history: mock.fn(async () => ({ messages: [{ text: 'my question' }] })) },
      chat: { postEphemeral: mock.fn(async () => ({ ok: true })) },
    };
    const body = {
      user: { id: userId },
      trigger_id: 'T',
      actions: [{ value: 'down' }],
      channel: { id: 'C1' },
      message: { ts: '2.0', thread_ts: '1.0', text: 'a bad answer' },
    };
    await handleFeedbackButton({ ack: mock.fn(async () => {}), body, client, logger });
    return getAllFeedback().at(-1);
  }

  it('attaches the comment to the entry already logged on click (no duplicate)', async () => {
    const entry = await clickDown('UDOWN2');
    const countAfterClick = getAllFeedback().length;
    const client = { chat: { postEphemeral: mock.fn(async () => ({ ok: true })) } };

    await handleFeedbackDownSubmit({
      ack,
      body: { user: { id: 'UDOWN2' } },
      view: {
        private_metadata: JSON.stringify({ feedbackId: entry.id, channelId: 'C1', threadTs: '1.0' }),
        state: { values: { comment: { text: { value: '  it missed my state  ' } } } },
      },
      client,
      logger,
    });

    assert.strictEqual(getAllFeedback().length, countAfterClick, 'no duplicate entry');
    assert.strictEqual(entry.comment, 'it missed my state');
    assert.ok(entry.message_summary.includes('my question'));
    assert.strictEqual(client.chat.postEphemeral.mock.calls[0].arguments[0].text, 'Thanks for the feedback!');
  });

  it('leaves the 👎 logged when the comment is left blank', async () => {
    const entry = await clickDown('UDOWN3');
    const client = { chat: { postEphemeral: mock.fn(async () => ({ ok: true })) } };

    await handleFeedbackDownSubmit({
      ack,
      body: { user: { id: 'UDOWN3' } },
      view: { private_metadata: JSON.stringify({ feedbackId: entry.id }), state: { values: { comment: {} } } },
      client,
      logger,
    });

    assert.strictEqual(entry.rating, 'down');
    assert.strictEqual(entry.comment, undefined);
  });

  it('keeps the 👎 even if the user cancels the modal entirely', async () => {
    const before = getAllFeedback().length;
    const entry = await clickDown('UCANCEL');
    // User closes the modal — handleFeedbackDownSubmit never runs.
    assert.strictEqual(getAllFeedback().length, before + 1);
    assert.strictEqual(entry.rating, 'down');
  });
});

describe('/benvu-feedback', () => {
  it('acks and responds ephemerally with the summary', async () => {
    const ack = mock.fn(async () => {});
    const respond = mock.fn(async () => {});
    await handleFeedbackAdminCommand({ ack, respond });
    assert.strictEqual(ack.mock.callCount(), 1);
    const arg = respond.mock.calls[0].arguments[0];
    assert.strictEqual(arg.response_type, 'ephemeral');
    assert.ok(arg.text.includes('Benvu feedback'));
  });
});
