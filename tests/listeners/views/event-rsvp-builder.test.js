import assert from 'node:assert';
import { beforeEach, describe, it } from 'node:test';

import { _resetEvents, addEvent, addRsvp, getEvent } from '../../../agent/tools/event-store.js';
import {
  buildRsvpMessageBlocks,
  buildRsvpText,
  EVENT_RSVP_ACTION,
} from '../../../listeners/views/event-rsvp-builder.js';

describe('event RSVP card', () => {
  beforeEach(() => _resetEvents());

  it('renders a header, an "I\'ll be there" button carrying the event id, and an empty-state line', () => {
    const e = addEvent({ title: 'Gallery Opening', date: '2026-07-14', channelId: 'C1' });
    const blocks = buildRsvpMessageBlocks(e);

    assert.strictEqual(blocks[0].type, 'header');
    assert.strictEqual(blocks[0].text.text, 'Gallery Opening');
    // Empty state before anyone RSVPs.
    assert.ok(blocks.some((b) => b.type === 'context' && /No RSVPs yet/.test(b.elements[0].text)));
    // The button uses the RSVP action and carries the event id as its value.
    const actionsBlock = blocks.find((b) => b.type === 'actions');
    const btn = actionsBlock.elements[0];
    assert.strictEqual(btn.action_id, EVENT_RSVP_ACTION);
    assert.strictEqual(btn.value, e.id);
    assert.strictEqual(btn.style, 'primary');
  });

  it('shows a live head count and names once people RSVP', () => {
    const e = addEvent({ title: 'Opening', channelId: 'C1' });
    addRsvp(e.id, { userId: 'U9' });
    addRsvp(e.id, { who: 'Sarah Kim' });
    const blocks = buildRsvpMessageBlocks(getEvent(e.id));
    const going = blocks.find((b) => b.type === 'section' && /going:/.test(b.text?.text || ''));
    assert.ok(going, 'a "going" section is present');
    assert.match(going.text.text, /\*2\* people are going/);
    assert.match(going.text.text, /<@U9>/);
    assert.match(going.text.text, /Sarah Kim/);
  });

  it('buildRsvpText gives a plain fallback with the count', () => {
    const e = addEvent({ title: 'Opening', date: '2026-07-14', channelId: 'C1' });
    assert.match(buildRsvpText(e), /RSVP for Opening \(2026-07-14\) — 0 going so far/);
  });
});
