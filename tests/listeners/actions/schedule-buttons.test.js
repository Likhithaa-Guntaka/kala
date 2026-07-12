import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';

import {
  _resetScheduleChanges,
  ackSummary,
  addScheduleChange,
  getScheduleChange,
} from '../../../agent/tools/schedule-store.js';
import { handleScheduleAck } from '../../../listeners/actions/schedule-buttons.js';

describe('handleScheduleAck', () => {
  let fakeAck;
  let fakeRespond;
  let fakeLogger;

  beforeEach(() => {
    _resetScheduleChanges();
    fakeAck = mock.fn(async () => {});
    fakeRespond = mock.fn(async () => {});
    fakeLogger = { error: mock.fn() };
  });

  const clickBy = (userId, changeId) => ({
    ack: fakeAck,
    body: { user: { id: userId }, actions: [{ value: changeId }] },
    respond: fakeRespond,
    logger: fakeLogger,
  });

  it('records the clicker as confirmed and re-renders the card', async () => {
    const c = addScheduleChange({ change: 'x', people: ['<@U1>', '<@U2>'], channelId: 'C1' });
    await handleScheduleAck(clickBy('U1', c.id));

    assert.strictEqual(fakeAck.mock.callCount(), 1);
    assert.strictEqual(ackSummary(getScheduleChange(c.id)).acked, 1);
    const arg = fakeRespond.mock.calls[0].arguments[0];
    assert.strictEqual(arg.replace_original, true);
    assert.ok(arg.blocks.some((b) => b.type === 'section' && /1 of 2 confirmed/.test(b.text?.text || '')));
  });

  it('is idempotent on a repeat click', async () => {
    const c = addScheduleChange({ change: 'x', people: ['<@U1>'], channelId: 'C1' });
    await handleScheduleAck(clickBy('U1', c.id));
    await handleScheduleAck(clickBy('U1', c.id));
    assert.strictEqual(ackSummary(getScheduleChange(c.id)).acked, 1);
  });

  it('replies ephemerally when the change no longer exists', async () => {
    await handleScheduleAck(clickBy('U1', 'CHG-999'));
    const arg = fakeRespond.mock.calls[0].arguments[0];
    assert.strictEqual(arg.response_type, 'ephemeral');
    assert.match(arg.text, /couldn't find that schedule change/);
  });
});
