import assert from 'node:assert';
import { describe, it } from 'node:test';

import { flagshipContext } from '../../agent/benvu.js';
import { getOrgTypeById } from '../../listeners/org-types.js';

describe('flagshipContext', () => {
  it('returns empty string for a type with no flagship', () => {
    // A type deepened without a flagship, or an unknown org, injects nothing.
    assert.strictEqual(flagshipContext(getOrgTypeById('general')), '');
    assert.strictEqual(flagshipContext(undefined), '');
    assert.strictEqual(flagshipContext({ flagship: { kind: 'none' } }), '');
  });

  it('injects the seeded-deadline offer for a seed_deadlines type (Food Bank)', () => {
    const text = flagshipContext(getOrgTypeById('food_bank'));
    assert.match(text, /OFFER/);
    assert.match(text, /track_deadline/);
    assert.match(text, /Form 990/);
    // Fiscal-year assumption must be stated, per the offered-not-assumed rule.
    assert.match(text, /December/);
    assert.match(text, /May 15/);
  });

  describe('privacy-aware mode (Crisis / Mental Health)', () => {
    const text = flagshipContext(getOrgTypeById('mental_health'));

    it('is active for the mental_health type', () => {
      assert.strictEqual(getOrgTypeById('mental_health').flagship.kind, 'privacy_mode');
      assert.notStrictEqual(text, '');
    });

    it('warns before drafting client identifiers and defaults to redaction', () => {
      assert.match(text, /PRIVACY-AWARE MODE/);
      assert.match(text, /warn the user/i);
      assert.match(text, /redact/i);
      // Uses a visible placeholder rather than inventing or echoing real identifiers.
      assert.match(text, /\[client name\]/);
    });

    it('instructs never to store or echo client identifiers (no PHI retention)', () => {
      assert.match(text, /never store or echo/i);
    });

    it('does not block the work — it is a caution, not a refusal', () => {
      assert.match(text, /never blocks the work/i);
    });
  });
});
