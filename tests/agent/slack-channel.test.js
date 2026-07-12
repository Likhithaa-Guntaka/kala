import assert from 'node:assert';
import { describe, it } from 'node:test';

import { isDmChannel } from '../../agent/slack-channel.js';

describe('isDmChannel', () => {
  it('is true for a 1:1 DM (im) id, which starts with "D"', () => {
    assert.strictEqual(isDmChannel('D123'), true);
  });

  it('is false for a public channel id (starts with "C")', () => {
    assert.strictEqual(isDmChannel('C123'), false);
  });

  it('is false for a private channel / group DM id (starts with "G")', () => {
    // Private channels are legitimate places to post a team card, so they must
    // not be flagged as DMs.
    assert.strictEqual(isDmChannel('G123'), false);
  });

  it('is false for an empty string', () => {
    assert.strictEqual(isDmChannel(''), false);
  });

  it('is false for undefined', () => {
    assert.strictEqual(isDmChannel(undefined), false);
  });

  it('is false for null', () => {
    assert.strictEqual(isDmChannel(null), false);
  });

  it('is case-sensitive: a lowercase "d" is not a Slack DM id', () => {
    // Real Slack ids are uppercase; guard against a loose match.
    assert.strictEqual(isDmChannel('d123'), false);
  });
});
