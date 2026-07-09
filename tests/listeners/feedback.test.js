import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';

import { handleFeedbackButton } from '../../listeners/actions/feedback-buttons.js';
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
