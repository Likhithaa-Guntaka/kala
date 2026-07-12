import assert from 'node:assert';
import { describe, it } from 'node:test';

import { ARTS_CULTURE } from '../../listeners/arts-culture.js';

describe('ARTS_CULTURE', () => {
  it('has a label, primary actions, tailored prompts, and RTS prompts', () => {
    assert.strictEqual(ARTS_CULTURE.label, 'Arts & Culture');
    assert.ok(Array.isArray(ARTS_CULTURE.primaryActions) && ARTS_CULTURE.primaryActions.length >= 2);
    assert.ok(Array.isArray(ARTS_CULTURE.tailoredPrompts) && ARTS_CULTURE.tailoredPrompts.length > 0);
    // No more than 4, since suggested prompts are capped at Slack's limit.
    assert.ok(ARTS_CULTURE.tailoredPrompts.length <= 4);
    for (const p of ARTS_CULTURE.tailoredPrompts) assert.ok(typeof p === 'string' && p.length > 0);
    assert.ok(Array.isArray(ARTS_CULTURE.rtsPrompts) && ARTS_CULTURE.rtsPrompts.length > 0);
  });

  it('defaults grant search to the arts and humanities funding categories', () => {
    assert.deepStrictEqual(ARTS_CULTURE.defaultGrantCategories, ['AR', 'HU']);
    // Every code is one Grants.gov's live facet accepts.
    const VALID = new Set(['FN', 'ISS', 'HL', 'HO', 'ED', 'AR', 'HU', 'CD', 'ELT']);
    for (const code of ARTS_CULTURE.defaultGrantCategories) assert.ok(VALID.has(code), `unexpected code ${code}`);
    assert.strictEqual(ARTS_CULTURE.grantLabel, 'arts and culture');
  });

  it('describes an NEA 1:1 nonfederal funding match', () => {
    assert.strictEqual(ARTS_CULTURE.match.source, 'NEA');
    assert.strictEqual(ARTS_CULTURE.match.ratio, '1:1');
  });

  it('carries no emoji in its labels (views are emoji-free)', () => {
    const text = JSON.stringify(ARTS_CULTURE);
    // eslint-disable-next-line no-control-regex — match any non-ASCII (emoji) char.
    assert.ok(!/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text), 'no emoji in the config');
  });
});
