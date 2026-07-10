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

  describe('seeded deadlines with variable HUD dates (Housing)', () => {
    const text = flagshipContext(getOrgTypeById('housing'));

    it('offers the 990 with the stated December fiscal-year assumption', () => {
      assert.match(text, /Form 990/);
      assert.match(text, /December/);
      assert.match(text, /May 15/);
    });

    it('frames HUD CoC and PIT dates as ask-the-user, never a fabricated fixed date', () => {
      assert.match(text, /Continuum of Care|CoC/);
      assert.match(text, /Point-in-Time|PIT/);
      // The variable-date items must tell the agent to ask for the current deadline.
      assert.match(text, /ask them for the current deadline/i);
      // No hardcoded month/day for the HUD items (only the 990's May 15 is fixed).
      assert.ok(!/January 2[0-9]|January 3[01]/.test(text), 'no fabricated PIT calendar date');
    });

    it('never instructs the agent to write a reminder without confirmation', () => {
      assert.match(text, /never create a reminder until the user confirms/i);
      assert.match(text, /track_deadline/);
    });
  });

  describe('academic-calendar seeded deadlines (Education)', () => {
    const text = flagshipContext(getOrgTypeById('education'));

    it('offers the 990 with the stated December fiscal-year assumption', () => {
      assert.match(text, /Form 990/);
      assert.match(text, /December/);
      assert.match(text, /May 15/);
    });

    it('adds academic-calendar framing (the seed_deadlines note)', () => {
      assert.match(text, /academic calendar/i);
      assert.match(text, /term|summer/i);
    });

    it('frames state performance and 21st CCLC dates as ask-the-user, not fabricated', () => {
      assert.match(text, /performance report/i);
      assert.match(text, /21st CCLC|Community Learning Centers/);
      assert.match(text, /ask them for the current deadline/i);
    });
  });

  describe('match tracker (Arts & Culture)', () => {
    const text = flagshipContext(getOrgTypeById('arts_culture'));

    it('is active for the arts_culture type', () => {
      assert.strictEqual(getOrgTypeById('arts_culture').flagship.kind, 'match_tracker');
      assert.notStrictEqual(text, '');
    });

    it('explains the NEA 1:1 nonfederal match and points at the track_match tool', () => {
      assert.match(text, /MATCH TRACKER/);
      assert.match(text, /NEA/);
      assert.match(text, /1:1/);
      assert.match(text, /nonfederal/i);
      assert.match(text, /track_match/);
    });

    it('records the running total as an absolute, not an increment', () => {
      assert.match(text, /not an increment/i);
    });

    it('stays latent — only surfaces when match or fundraising is in play', () => {
      assert.match(text, /only bring it up when match or fundraising/i);
    });
  });
});
