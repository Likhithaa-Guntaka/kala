import assert from 'node:assert';
import { beforeEach, describe, it } from 'node:test';

import {
  _resetEngagements,
  addEngagement,
  describeEngagement,
  findEngagements,
  getOverdueEngagements,
  isOutstanding,
  isUnpaid,
  listEngagements,
  overdueReasons,
  updateEngagement,
} from '../../agent/tools/engagement-store.js';

const DAY = 86_400_000;
const NOW = Date.parse('2026-07-11T12:00:00Z');
const daysAgo = (n) => NOW - n * DAY;

describe('engagement-store', () => {
  beforeEach(() => _resetEngagements());

  it('adds an engagement with default (earliest) statuses', () => {
    const e = addEngagement({ artist: 'Maya Lin', project: 'Fall Show', channelId: 'C1', createdBy: 'U1', now: NOW });
    assert.match(e.id, /^ENG-\d+$/);
    assert.strictEqual(e.artist, 'Maya Lin');
    assert.strictEqual(e.project, 'Fall Show');
    assert.strictEqual(e.contractStatus, 'not_sent');
    assert.strictEqual(e.w9Status, 'missing');
    assert.strictEqual(e.invoiceStatus, 'not_submitted');
    assert.strictEqual(e.createdAt, '2026-07-11');
    assert.strictEqual(e.updatedAt, '2026-07-11');
  });

  it('scopes lists to a channel — teams do not see each other', () => {
    addEngagement({ artist: 'A', project: 'P', channelId: 'C1' });
    addEngagement({ artist: 'B', project: 'P', channelId: 'C2' });
    assert.strictEqual(listEngagements('C1').length, 1);
    assert.strictEqual(listEngagements('C1')[0].artist, 'A');
    assert.strictEqual(listEngagements('C2').length, 1);
  });

  it('finds engagements by artist or project substring (case-insensitive)', () => {
    addEngagement({ artist: 'Maya Lin', project: 'Fall Show', channelId: 'C1' });
    addEngagement({ artist: 'Jun Kaneko', project: 'Winter Gala', channelId: 'C1' });
    assert.strictEqual(findEngagements('C1', 'maya')[0].artist, 'Maya Lin');
    assert.strictEqual(findEngagements('C1', 'fall show')[0].artist, 'Maya Lin');
    assert.strictEqual(findEngagements('C1', 'gala')[0].artist, 'Jun Kaneko');
    assert.strictEqual(findEngagements('C1', '').length, 2, 'empty query returns all');
    assert.strictEqual(findEngagements('C1', 'nobody').length, 0);
  });

  it('updates only the provided status fields and bumps updatedAt', () => {
    const e = addEngagement({ artist: 'A', project: 'P', channelId: 'C1', now: daysAgo(3) });
    const updated = updateEngagement(e.id, { contractStatus: 'signed' }, NOW);
    assert.strictEqual(updated.contractStatus, 'signed');
    assert.strictEqual(updated.w9Status, 'missing', 'unspecified fields unchanged');
    assert.strictEqual(updated.invoiceStatus, 'not_submitted');
    assert.strictEqual(updated.updatedAt, '2026-07-11');
  });

  it('ignores invalid status values (no bad data stored)', () => {
    const e = addEngagement({ artist: 'A', project: 'P', channelId: 'C1' });
    const updated = updateEngagement(e.id, { contractStatus: /** @type {any} */ ('bogus') }, NOW);
    assert.strictEqual(updated.contractStatus, 'not_sent');
  });

  it('returns undefined when updating a missing engagement', () => {
    assert.strictEqual(updateEngagement('ENG-999', { w9Status: 'received' }), undefined);
  });

  it('stamps contractSentAt when the contract first enters "sent"', () => {
    const e = addEngagement({ artist: 'A', project: 'P', channelId: 'C1' });
    updateEngagement(e.id, { contractStatus: 'sent' }, daysAgo(10));
    assert.strictEqual(getStamp(e.id).contractSentAt, isoOf(daysAgo(10)));
    // Moving on to "signed" does not overwrite the sent stamp.
    updateEngagement(e.id, { contractStatus: 'signed' }, NOW);
    assert.strictEqual(getStamp(e.id).contractSentAt, isoOf(daysAgo(10)));
  });

  describe('outstanding / unpaid predicates', () => {
    it('isOutstanding is true until contract signed, W-9 received, and invoice paid', () => {
      const e = addEngagement({ artist: 'A', project: 'P', channelId: 'C1' });
      assert.strictEqual(isOutstanding(e), true);
      updateEngagement(e.id, { contractStatus: 'signed', w9Status: 'received' }, NOW);
      assert.strictEqual(isOutstanding(getStamp(e.id)), true, 'invoice still unpaid');
      updateEngagement(e.id, { invoiceStatus: 'paid' }, NOW);
      assert.strictEqual(isOutstanding(getStamp(e.id)), false);
    });

    it('isUnpaid tracks only the invoice', () => {
      const e = addEngagement({ artist: 'A', project: 'P', channelId: 'C1' });
      assert.strictEqual(isUnpaid(e), true);
      updateEngagement(e.id, { invoiceStatus: 'submitted' }, NOW);
      assert.strictEqual(isUnpaid(getStamp(e.id)), true);
      updateEngagement(e.id, { invoiceStatus: 'paid' }, NOW);
      assert.strictEqual(isUnpaid(getStamp(e.id)), false);
    });
  });

  describe('overdue rules', () => {
    it('flags a contract sent but unsigned beyond 7 days', () => {
      const e = addEngagement({ artist: 'A', project: 'P', channelId: 'C1' });
      updateEngagement(e.id, { contractStatus: 'sent' }, daysAgo(8));
      const reasons = overdueReasons(getStamp(e.id), NOW);
      assert.strictEqual(reasons.length, 1);
      assert.match(reasons[0], /contract sent 8 days ago, still unsigned/);
    });

    it('does not flag a contract sent only 7 days ago (needs to exceed the threshold)', () => {
      const e = addEngagement({ artist: 'A', project: 'P', channelId: 'C1' });
      updateEngagement(e.id, { contractStatus: 'sent' }, daysAgo(7));
      assert.strictEqual(overdueReasons(getStamp(e.id), NOW).length, 0);
    });

    it('flags an invoice submitted but unpaid beyond 14 days', () => {
      const e = addEngagement({ artist: 'A', project: 'P', channelId: 'C1' });
      updateEngagement(e.id, { invoiceStatus: 'submitted' }, daysAgo(20));
      const reasons = overdueReasons(getStamp(e.id), NOW);
      assert.match(reasons[0], /invoice submitted 20 days ago, still unpaid/);
    });

    it('does not flag a signed contract or a paid invoice', () => {
      const e = addEngagement({ artist: 'A', project: 'P', channelId: 'C1' });
      updateEngagement(e.id, { contractStatus: 'signed', invoiceStatus: 'paid' }, daysAgo(30));
      assert.strictEqual(overdueReasons(getStamp(e.id), NOW).length, 0);
    });

    it('getOverdueEngagements returns only channel-scoped flagged items with reasons', () => {
      const late = addEngagement({ artist: 'Late', project: 'P', channelId: 'C1' });
      updateEngagement(late.id, { invoiceStatus: 'submitted' }, daysAgo(30));
      const fine = addEngagement({ artist: 'Fine', project: 'P', channelId: 'C1' });
      updateEngagement(fine.id, { invoiceStatus: 'paid' }, daysAgo(30));
      addEngagement({ artist: 'OtherChannel', project: 'P', channelId: 'C2' });

      const overdue = getOverdueEngagements('C1', NOW);
      assert.strictEqual(overdue.length, 1);
      assert.strictEqual(overdue[0].engagement.artist, 'Late');
      assert.ok(overdue[0].reasons.length > 0);
    });
  });

  it('describeEngagement renders a readable one-line summary', () => {
    const e = addEngagement({ artist: 'Maya Lin', project: 'Fall Show', channelId: 'C1' });
    updateEngagement(e.id, { contractStatus: 'sent', w9Status: 'received' }, NOW);
    const line = describeEngagement(getStamp(e.id));
    assert.match(line, /Maya Lin/);
    assert.match(line, /Fall Show/);
    assert.match(line, /contract sent/);
    assert.match(line, /W-9 received/);
    assert.match(line, /invoice not submitted/);
  });
});

// Helpers — read the freshly-stored record and format ISO like the store does.
import { getEngagement } from '../../agent/tools/engagement-store.js';

/** @param {string} id */
function getStamp(id) {
  return /** @type {any} */ (getEngagement(id));
}
/** @param {number} ms */
function isoOf(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}
