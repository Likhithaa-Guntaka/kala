import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';

import { _resetEvents, addEvent, getEvent, rsvpCount } from '../../../agent/tools/event-store.js';
import { handleRsvpGoing } from '../../../listeners/actions/event-buttons.js';

describe('handleRsvpGoing', () => {
  let fakeAck;
  let fakeRespond;
  let fakeLogger;

  beforeEach(() => {
    _resetEvents();
    fakeAck = mock.fn(async () => {});
    fakeRespond = mock.fn(async () => {});
    fakeLogger = { error: mock.fn() };
  });

  const clickBy = (userId, eventId) => ({
    ack: fakeAck,
    body: { user: { id: userId }, actions: [{ value: eventId }] },
    respond: fakeRespond,
    logger: fakeLogger,
  });

  it('records the clicking user and re-renders the card with the new count', async () => {
    const e = addEvent({ title: 'Opening', channelId: 'C1' });
    await handleRsvpGoing(clickBy('U9', e.id));

    assert.strictEqual(fakeAck.mock.callCount(), 1);
    assert.strictEqual(rsvpCount(getEvent(e.id)), 1);
    // Updated the card in place with rebuilt blocks.
    const arg = fakeRespond.mock.calls[0].arguments[0];
    assert.strictEqual(arg.replace_original, true);
    assert.ok(Array.isArray(arg.blocks));
    assert.ok(arg.blocks.some((b) => b.type === 'section' && /going:/.test(b.text?.text || '')));
  });

  it('is idempotent — a second click by the same user does not double-count', async () => {
    const e = addEvent({ title: 'Opening', channelId: 'C1' });
    await handleRsvpGoing(clickBy('U9', e.id));
    await handleRsvpGoing(clickBy('U9', e.id));
    assert.strictEqual(rsvpCount(getEvent(e.id)), 1);
  });

  it('replies ephemerally when the event no longer exists', async () => {
    await handleRsvpGoing(clickBy('U9', 'EVT-999'));
    const arg = fakeRespond.mock.calls[0].arguments[0];
    assert.strictEqual(arg.response_type, 'ephemeral');
    assert.match(arg.text, /couldn't find that event/);
  });
});
