import assert from 'node:assert';
import { describe, it } from 'node:test';

import { getOrgTypeById } from '../../listeners/org-types.js';
import {
  GENERIC_SUGGESTED_PROMPTS,
  SUGGESTED_PROMPTS_TITLE,
  suggestedPromptsForOrg,
} from '../../listeners/suggested-prompts.js';

describe('suggestedPromptsForOrg', () => {
  it('returns the generic prompts when no org type is known', () => {
    const { title, prompts } = suggestedPromptsForOrg(null);
    assert.strictEqual(title, SUGGESTED_PROMPTS_TITLE);
    assert.deepStrictEqual(prompts, GENERIC_SUGGESTED_PROMPTS);
  });

  it('falls back to generic prompts for an unknown org id', () => {
    const { prompts } = suggestedPromptsForOrg('not_a_real_org');
    assert.deepStrictEqual(prompts, GENERIC_SUGGESTED_PROMPTS);
  });

  it("tailors prompts to a known org type, reusing that org's tailored prompt copy", () => {
    const { prompts } = suggestedPromptsForOrg('education');
    const org = getOrgTypeById('education');
    // Each tailored prompt string becomes both the card title and the sent message.
    assert.deepStrictEqual(
      prompts,
      org.tailoredPrompts.slice(0, 4).map((message) => ({ title: message, message })),
    );
  });

  it('every prompt has a title and message (Slack requires both)', () => {
    for (const id of ['food_bank', 'education', 'general', null]) {
      for (const p of suggestedPromptsForOrg(id).prompts) {
        assert.ok(typeof p.title === 'string' && p.title.length > 0);
        assert.ok(typeof p.message === 'string' && p.message.length > 0);
      }
    }
  });

  it('never returns more than 4 prompts (Slack rejects >4)', () => {
    for (const id of ['food_bank', 'education', 'general', null]) {
      assert.ok(suggestedPromptsForOrg(id).prompts.length <= 4);
    }
  });
});
