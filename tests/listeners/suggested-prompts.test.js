import assert from 'node:assert';
import { describe, it } from 'node:test';

import { ARTS_CULTURE } from '../../listeners/arts-culture.js';
import { SUGGESTED_PROMPTS_TITLE, suggestedPrompts } from '../../listeners/suggested-prompts.js';

describe('suggestedPrompts', () => {
  it('reuses the arts and culture tailored prompts as both title and message', () => {
    const { title, prompts } = suggestedPrompts();
    assert.strictEqual(title, SUGGESTED_PROMPTS_TITLE);
    assert.deepStrictEqual(
      prompts,
      ARTS_CULTURE.tailoredPrompts.slice(0, 4).map((message) => ({ title: message, message })),
    );
  });

  it('every prompt has a title and message (Slack requires both)', () => {
    for (const p of suggestedPrompts().prompts) {
      assert.ok(typeof p.title === 'string' && p.title.length > 0);
      assert.ok(typeof p.message === 'string' && p.message.length > 0);
    }
  });

  it('never returns more than 4 prompts (Slack rejects >4)', () => {
    assert.ok(suggestedPrompts().prompts.length <= 4);
  });
});
