import assert from 'node:assert';
import { beforeEach, describe, it } from 'node:test';

import {
  _resetEvents,
  addEvent,
  addRsvp,
  attendanceSummary,
  findEvents,
  getEvent,
  listEvents,
  rsvpCount,
  setActualAttendance,
} from '../../agent/tools/event-store.js';

const NOW = Date.parse('2026-07-11T12:00:00Z');

describe('event-store', () => {
  beforeEach(() => _resetEvents());

  it('creates an event with no RSVPs yet', () => {
    const e = addEvent({ title: 'Gallery Opening', date: '2026-07-14', channelId: 'C1', createdBy: 'U1', now: NOW });
    assert.match(e.id, /^EVT-\d+$/);
    assert.strictEqual(e.title, 'Gallery Opening');
    assert.strictEqual(e.date, '2026-07-14');
    assert.deepStrictEqual(e.rsvps, []);
    assert.strictEqual(e.createdAt, '2026-07-11');
  });

  it('scopes events to a channel', () => {
    addEvent({ title: 'A', channelId: 'C1' });
    addEvent({ title: 'B', channelId: 'C2' });
    assert.strictEqual(listEvents('C1').length, 1);
    assert.strictEqual(listEvents('C1')[0].title, 'A');
  });

  it('finds an event by title substring or exact id', () => {
    const e = addEvent({ title: 'Gallery Opening', channelId: 'C1' });
    assert.strictEqual(findEvents('C1', 'gallery')[0].id, e.id);
    assert.strictEqual(findEvents('C1', e.id)[0].id, e.id);
    assert.strictEqual(findEvents('C1', 'nope').length, 0);
  });

  describe('RSVPs', () => {
    it('adds a confirmed attendee and bumps the count', () => {
      const e = addEvent({ title: 'Opening', channelId: 'C1' });
      const res = addRsvp(e.id, { userId: 'U9' }, NOW);
      assert.strictEqual(res.added, true);
      assert.strictEqual(rsvpCount(getEvent(e.id)), 1);
      assert.strictEqual(getEvent(e.id).rsvps[0].who, '<@U9>');
      assert.strictEqual(getEvent(e.id).rsvps[0].at, '2026-07-11');
    });

    it('dedupes a repeat RSVP by Slack user id (button pressed twice)', () => {
      const e = addEvent({ title: 'Opening', channelId: 'C1' });
      assert.strictEqual(addRsvp(e.id, { userId: 'U9' }).added, true);
      assert.strictEqual(addRsvp(e.id, { userId: 'U9' }).added, false);
      assert.strictEqual(rsvpCount(getEvent(e.id)), 1);
    });

    it('dedupes a named RSVP case-insensitively (added by staff)', () => {
      const e = addEvent({ title: 'Opening', channelId: 'C1' });
      assert.strictEqual(addRsvp(e.id, { who: 'Sarah Kim' }).added, true);
      assert.strictEqual(addRsvp(e.id, { who: 'sarah kim' }).added, false);
      assert.strictEqual(rsvpCount(getEvent(e.id)), 1);
    });

    it('returns null when the event does not exist', () => {
      assert.strictEqual(addRsvp('EVT-999', { userId: 'U9' }), null);
    });
  });

  describe('attendance summary (for funder reports)', () => {
    it('reports confirmed RSVPs and their names, actual null until recorded', () => {
      const e = addEvent({ title: 'Gallery Opening', date: '2026-07-14', channelId: 'C1' });
      addRsvp(e.id, { who: 'Sarah Kim' });
      addRsvp(e.id, { userId: 'U9', who: 'Tom Ray' });
      const s = attendanceSummary(getEvent(e.id));
      assert.strictEqual(s.title, 'Gallery Opening');
      assert.strictEqual(s.date, '2026-07-14');
      assert.strictEqual(s.confirmed, 2);
      assert.strictEqual(s.actual, null);
      assert.deepStrictEqual(s.names, ['Sarah Kim', 'Tom Ray']);
    });

    it('records an actual head count that can differ from RSVPs', () => {
      const e = addEvent({ title: 'Opening', channelId: 'C1' });
      addRsvp(e.id, { who: 'Sarah' });
      setActualAttendance(e.id, 47);
      assert.strictEqual(attendanceSummary(getEvent(e.id)).actual, 47);
    });

    it('clamps a negative/fractional actual count to a sane integer', () => {
      const e = addEvent({ title: 'Opening', channelId: 'C1' });
      setActualAttendance(e.id, -5);
      assert.strictEqual(getEvent(e.id).actualAttendance, 0);
      setActualAttendance(e.id, 12.7);
      assert.strictEqual(getEvent(e.id).actualAttendance, 13);
    });
  });
});
