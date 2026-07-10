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

  describe('multilingual-first (Immigrant & Refugee)', () => {
    const text = flagshipContext(getOrgTypeById('immigrant_refugee'));

    it('is active for the immigrant_refugee type', () => {
      assert.strictEqual(getOrgTypeById('immigrant_refugee').flagship.kind, 'multilingual');
      assert.notStrictEqual(text, '');
    });

    it('makes summarize-then-translate the default framing for client-facing material', () => {
      assert.match(text, /MULTILINGUAL-FIRST/);
      assert.match(text, /summarize/i);
      assert.match(text, /translate/i);
    });

    it('asks which language rather than assuming one', () => {
      assert.match(text, /asking which language|which language if you are not sure/i);
    });

    it('stays latent — plain internal requests get a normal answer, not forced translation', () => {
      assert.match(text, /do not force it|just answer normally/i);
    });
  });
});
