import assert from 'node:assert';
import { beforeEach, describe, it } from 'node:test';

import {
  _resetScheduleChanges,
  acknowledge,
  ackSummary,
  addScheduleChange,
  findByMessage,
  findScheduleChanges,
  getScheduleChange,
  pending,
  personFromString,
  setMessageRef,
} from '../../agent/tools/schedule-store.js';

const NOW = Date.parse('2026-07-11T12:00:00Z');

describe('schedule-store', () => {
  beforeEach(() => _resetScheduleChanges());

  describe('personFromString', () => {
    it('parses a Slack mention into an id-keyed entry', () => {
      assert.deepStrictEqual(personFromString('<@U123>'), { key: 'U123', display: '<@U123>', id: 'U123' });
      assert.deepStrictEqual(personFromString('<@U123|ana>'), { key: 'U123', display: '<@U123>', id: 'U123' });
      assert.deepStrictEqual(personFromString('U123'), { key: 'U123', display: '<@U123>', id: 'U123' });
    });

    it('parses a plain name into a lowercased key', () => {
      assert.deepStrictEqual(personFromString('Ana Ruiz'), { key: 'ana ruiz', display: 'Ana Ruiz' });
    });
  });

  it('creates a change with a deduped roster, nobody acked yet', () => {
    const c = addScheduleChange({
      change: 'Tech rehearsal moved to 9am',
      people: ['<@U1>', '<@U2>', '<@U1>', 'Cara'],
      channelId: 'C1',
      createdBy: 'U0',
      now: NOW,
    });
    assert.match(c.id, /^CHG-\d+$/);
    assert.strictEqual(c.roster.length, 3, 'duplicate U1 collapsed');
    assert.ok(c.roster.every((r) => r.acked === false));
    assert.strictEqual(c.createdAt, '2026-07-11');
  });

  it('scopes and finds changes by id or text substring', () => {
    const c = addScheduleChange({ change: 'Load-in starts at 7am', people: ['<@U1>'], channelId: 'C1' });
    addScheduleChange({ change: 'Other channel', people: [], channelId: 'C2' });
    assert.strictEqual(findScheduleChanges('C1').length, 1);
    assert.strictEqual(findScheduleChanges('C1', 'load-in')[0].id, c.id);
    assert.strictEqual(findScheduleChanges('C1', c.id)[0].id, c.id);
    assert.strictEqual(findScheduleChanges('C1', 'nope').length, 0);
  });

  describe('acknowledgment', () => {
    it('marks a listed person acked (by id) and shrinks the pending list', () => {
      const c = addScheduleChange({ change: 'x', people: ['<@U1>', '<@U2>', '<@U3>'], channelId: 'C1' });
      const res = acknowledge(c.id, { userId: 'U2' }, NOW);
      assert.strictEqual(res.newlyAcked, true);
      assert.strictEqual(res.wasListed, true);
      assert.strictEqual(res.entry.ackedAt, '2026-07-11');
      const stillWaiting = pending(getScheduleChange(c.id)).map((r) => r.id);
      assert.deepStrictEqual(stillWaiting, ['U1', 'U3']);
    });

    it('matches a roster person by name too (staff marking someone verbally)', () => {
      const c = addScheduleChange({ change: 'x', people: ['Ana Ruiz', 'Ben'], channelId: 'C1' });
      const res = acknowledge(c.id, { name: 'ana ruiz' }, NOW);
      assert.strictEqual(res.wasListed, true);
      assert.strictEqual(ackSummary(getScheduleChange(c.id)).acked, 1);
    });

    it('is idempotent — acking twice does not change the tally', () => {
      const c = addScheduleChange({ change: 'x', people: ['<@U1>'], channelId: 'C1' });
      assert.strictEqual(acknowledge(c.id, { userId: 'U1' }).newlyAcked, true);
      assert.strictEqual(acknowledge(c.id, { userId: 'U1' }).newlyAcked, false);
      assert.strictEqual(ackSummary(getScheduleChange(c.id)).acked, 1);
    });

    it('counts an off-roster acknowledger as confirmed without inflating pending', () => {
      const c = addScheduleChange({ change: 'x', people: ['<@U1>'], channelId: 'C1' });
      const res = acknowledge(c.id, { userId: 'U9' }, NOW);
      assert.strictEqual(res.wasListed, false);
      const s = ackSummary(getScheduleChange(c.id));
      assert.strictEqual(s.acked, 1, 'U9 counts as confirmed');
      assert.deepStrictEqual(s.pending, ['<@U1>'], 'U1 still the only one pending');
    });

    it('returns null for an unknown change', () => {
      assert.strictEqual(acknowledge('CHG-999', { userId: 'U1' }), null);
    });
  });

  it('ackSummary reports totals and the who-hasn’t-confirmed list', () => {
    const c = addScheduleChange({
      change: 'Install week: doors at 8',
      people: ['<@U1>', '<@U2>', '<@U3>'],
      channelId: 'C1',
    });
    acknowledge(c.id, { userId: 'U1' }, NOW);
    const s = ackSummary(getScheduleChange(c.id));
    assert.strictEqual(s.total, 3);
    assert.strictEqual(s.acked, 1);
    assert.deepStrictEqual(s.confirmed, ['<@U1>']);
    assert.deepStrictEqual(s.pending, ['<@U2>', '<@U3>']);
  });

  it('finds a change by its posted message ref (for reaction acks)', () => {
    const c = addScheduleChange({ change: 'x', people: ['<@U1>'], channelId: 'C1' });
    setMessageRef(c.id, { channel: 'C1', ts: '111.222' });
    assert.strictEqual(findByMessage('C1', '111.222')?.id, c.id);
    assert.strictEqual(findByMessage('C1', 'nope'), undefined);
  });
});
