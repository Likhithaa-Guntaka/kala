import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';

import { handleTrackEvent, handleTrackScheduleChange } from '../../agent/kala.js';
import { _resetEvents, listEvents } from '../../agent/tools/event-store.js';
import { _resetScheduleChanges, listScheduleChanges } from '../../agent/tools/schedule-store.js';

/** A deps object with a mocked Slack client, scoped to one channel. @param {string} channelId */
function makeDeps(channelId) {
  return {
    client: { chat: { postMessage: mock.fn(async () => ({ ok: true, ts: '111.1' })) } },
    userId: 'U1',
    channelId,
  };
}

describe('handleTrackEvent (DM guard + positive path)', () => {
  beforeEach(() => {
    _resetEvents();
  });

  it('posts the RSVP card and records the event in a public channel (C…)', async () => {
    const deps = makeDeps('C1');
    const res = await handleTrackEvent({ title: 'Gallery Opening', date: '2026-08-14' }, deps);
    // Card posted to the real channel.
    assert.strictEqual(deps.client.chat.postMessage.mock.callCount(), 1);
    assert.strictEqual(deps.client.chat.postMessage.mock.calls[0].arguments[0].channel, 'C1');
    // Record created in that channel.
    const events = listEvents('C1');
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].title, 'Gallery Opening');
    // Confirmation reads as success.
    assert.match(res.content[0].text, /Tracking RSVPs/);
  });

  it('is not blocked in a private channel / group (G…): still posts and records', async () => {
    const deps = makeDeps('G1');
    await handleTrackEvent({ title: 'Members Preview' }, deps);
    assert.strictEqual(deps.client.chat.postMessage.mock.callCount(), 1);
    assert.strictEqual(listEvents('G1').length, 1);
  });

  it('in a DM (D…): returns channel guidance, posts nothing, records nothing', async () => {
    const deps = makeDeps('D1');
    const res = await handleTrackEvent({ title: 'Gallery Opening' }, deps);
    assert.strictEqual(deps.client.chat.postMessage.mock.callCount(), 0);
    assert.strictEqual(listEvents('D1').length, 0);
    assert.match(res.content[0].text, /real channel/);
  });
});

describe('handleTrackScheduleChange (DM guard + positive path)', () => {
  beforeEach(() => {
    _resetScheduleChanges();
  });

  it('posts the Acknowledge card and records the change in a public channel (C…)', async () => {
    const deps = makeDeps('C1');
    const res = await handleTrackScheduleChange(
      { change: 'Tech rehearsal moved to 9am Saturday', who_must_confirm: ['<@U2>'] },
      deps,
    );
    assert.strictEqual(deps.client.chat.postMessage.mock.callCount(), 1);
    assert.strictEqual(deps.client.chat.postMessage.mock.calls[0].arguments[0].channel, 'C1');
    const changes = listScheduleChanges('C1');
    assert.strictEqual(changes.length, 1);
    assert.strictEqual(changes[0].change, 'Tech rehearsal moved to 9am Saturday');
    assert.match(res.content[0].text, /Tracking this schedule change/);
  });

  it('is not blocked in a private channel / group (G…): still posts and records', async () => {
    const deps = makeDeps('G1');
    await handleTrackScheduleChange({ change: 'Load-in starts at 7am' }, deps);
    assert.strictEqual(deps.client.chat.postMessage.mock.callCount(), 1);
    assert.strictEqual(listScheduleChanges('G1').length, 1);
  });

  it('in a DM (D…): returns channel guidance, posts nothing, records nothing', async () => {
    const deps = makeDeps('D1');
    const res = await handleTrackScheduleChange({ change: 'Tech rehearsal moved to 9am Saturday' }, deps);
    assert.strictEqual(deps.client.chat.postMessage.mock.callCount(), 0);
    assert.strictEqual(listScheduleChanges('D1').length, 0);
    assert.match(res.content[0].text, /real channel/);
  });
});
