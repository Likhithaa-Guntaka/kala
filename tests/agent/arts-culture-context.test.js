import assert from 'node:assert';
import { describe, it } from 'node:test';

import { ARTS_CULTURE_CONTEXT } from '../../agent/kala.js';

describe('ARTS_CULTURE_CONTEXT', () => {
  it('frames Kala as an arts and culture specialist with arts-relevant metrics', () => {
    assert.match(ARTS_CULTURE_CONTEXT, /YOUR FOCUS: ARTS & CULTURE/);
    assert.match(ARTS_CULTURE_CONTEXT, /arts and culture nonprofits/i);
    // Impact language biases toward arts metrics, not generic service numbers.
    assert.match(ARTS_CULTURE_CONTEXT, /attendance|audience/i);
    assert.match(ARTS_CULTURE_CONTEXT, /artists supported|number of artists/i);
    assert.match(ARTS_CULTURE_CONTEXT, /community engagement|outreach/i);
  });

  it('explains the NEA 1:1 nonfederal match and points at the track_match tool', () => {
    assert.match(ARTS_CULTURE_CONTEXT, /MATCH TRACKER/);
    assert.match(ARTS_CULTURE_CONTEXT, /National Endowment for the Arts \(NEA\)/);
    assert.match(ARTS_CULTURE_CONTEXT, /1:1/);
    assert.match(ARTS_CULTURE_CONTEXT, /nonfederal/i);
    assert.match(ARTS_CULTURE_CONTEXT, /track_match/);
  });

  it('records the running total as an absolute, not an increment, and stays latent', () => {
    assert.match(ARTS_CULTURE_CONTEXT, /not an increment/i);
    assert.match(ARTS_CULTURE_CONTEXT, /only bring it up when match or fundraising/i);
  });
});
