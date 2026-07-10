import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';

import { _resetDeadlines, getDueDeadlines, listDeadlines } from '../../../agent/tools/deadline-store.js';
import { handleGrantTrackDeadline } from '../../../listeners/actions/grant-buttons.js';

describe('handleGrantTrackDeadline', () => {
  let ack;
  let respond;
  let logger;

  beforeEach(() => {
    _resetDeadlines();
    ack = mock.fn(async () => {});
    respond = mock.fn(async () => {});
    logger = { error: mock.fn() };
  });

  it('registers the grant deadline bound to the channel and user', async () => {
    const body = {
      user: { id: 'U1' },
      channel: { id: 'C1' },
      actions: [{ value: JSON.stringify({ t: 'Youth Grant', d: '2026-08-09' }) }],
    };

    await handleGrantTrackDeadline({ ack, body, respond, logger });

    assert.strictEqual(ack.mock.callCount(), 1);
    const all = listDeadlines();
    assert.strictEqual(all.length, 1);
    assert.strictEqual(all[0].title, 'Youth Grant');
    assert.strictEqual(all[0].dueDate, '2026-08-09');
    assert.strictEqual(all[0].channelId, 'C1');
    assert.strictEqual(all[0].createdBy, 'U1');
    // Its due date is far off, so it isn't nudged yet.
    assert.strictEqual(getDueDeadlines().length, 0);

    const arg = respond.mock.calls[0].arguments[0];
    assert.ok(/tracking/i.test(arg.text));
  });

  it('asks for a date and tracks nothing when the grant has no ISO date', async () => {
    const body = {
      user: { id: 'U1' },
      channel: { id: 'C1' },
      actions: [{ value: JSON.stringify({ t: 'No Date Grant' }) }],
    };
    await handleGrantTrackDeadline({ ack, body, respond, logger });

    assert.strictEqual(listDeadlines().length, 0);
    const arg = respond.mock.calls[0].arguments[0];
    assert.ok(/date/i.test(arg.text));
  });
});
