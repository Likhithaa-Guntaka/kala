import assert from 'node:assert';
import { beforeEach, describe, it } from 'node:test';

import { _resetMatches, getMatch, matchStatus, setMatch } from '../../agent/tools/match-store.js';

describe('match-store', () => {
  beforeEach(() => _resetMatches());

  const who = { channelId: 'C1', userId: 'U1' };

  it('returns null before anything is tracked', () => {
    assert.strictEqual(getMatch(who), null);
  });

  it('stores and retrieves a match across separate calls (persists across turns)', () => {
    setMatch({ ...who, required: 50000, raised: 20000, campaign: 'NEA Challenge America' });
    // A later, independent read — the "next turn" — still sees it.
    const got = getMatch(who);
    assert.strictEqual(got.required, 50000);
    assert.strictEqual(got.raised, 20000);
    assert.strictEqual(got.campaign, 'NEA Challenge America');
  });

  it('merges partial updates: required first, raised later, keeps the campaign', () => {
    setMatch({ ...who, required: 40000, campaign: 'Season Fund' });
    setMatch({ ...who, raised: 10000 });
    const got = getMatch(who);
    assert.strictEqual(got.required, 40000);
    assert.strictEqual(got.raised, 10000);
    assert.strictEqual(got.campaign, 'Season Fund');
  });

  it('treats raised as an absolute total, not an increment (no double-counting)', () => {
    setMatch({ ...who, required: 30000, raised: 5000 });
    setMatch({ ...who, raised: 12000 });
    // Second write replaces rather than adds: 12000, not 17000.
    assert.strictEqual(getMatch(who).raised, 12000);
  });

  it('isolates records by channel+user, not by thread', () => {
    setMatch({ channelId: 'C1', userId: 'U1', required: 10000, raised: 1000 });
    setMatch({ channelId: 'C1', userId: 'U2', required: 20000, raised: 2000 });
    assert.strictEqual(getMatch({ channelId: 'C1', userId: 'U1' }).raised, 1000);
    assert.strictEqual(getMatch({ channelId: 'C1', userId: 'U2' }).raised, 2000);
  });

  describe('matchStatus', () => {
    it('computes remaining and percent from a record', () => {
      const s = matchStatus({ required: 50000, raised: 20000, campaign: 'X' });
      assert.strictEqual(s.remaining, 30000); // 50000 required − 20000 raised
      assert.strictEqual(s.percent, 40);
      assert.strictEqual(s.campaign, 'X');
    });

    it('never goes negative once the match is exceeded', () => {
      const s = matchStatus({ required: 10000, raised: 12000 });
      assert.strictEqual(s.remaining, 0);
      assert.strictEqual(s.percent, 120);
    });

    it('returns null percent when nothing is required yet (no divide-by-zero)', () => {
      const s = matchStatus({ required: 0, raised: 3000 });
      assert.strictEqual(s.percent, null);
      assert.strictEqual(s.remaining, 0);
    });

    it('returns null for a null record', () => {
      assert.strictEqual(matchStatus(null), null);
    });
  });
});
