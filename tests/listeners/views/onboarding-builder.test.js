import assert from 'node:assert';
import { describe, it } from 'node:test';

import { ARTS_CULTURE } from '../../../listeners/arts-culture.js';
import {
  buildPromptButtons,
  buildWelcomeDmBlocks,
  PROMPT_ACTION_PREFIX,
} from '../../../listeners/views/onboarding-builder.js';
import { assertNoEmoji } from '../../helpers/no-emoji.js';

describe('buildPromptButtons', () => {
  it('builds prompt buttons with prompt_run_ ids and the full prompt in value', () => {
    const b = buildPromptButtons(ARTS_CULTURE.tailoredPrompts, 'tailored_prompts');
    assert.strictEqual(b.block_id, 'tailored_prompts');
    assert.strictEqual(b.elements.length, ARTS_CULTURE.tailoredPrompts.length);
    b.elements.forEach((el, i) => {
      assert.strictEqual(el.action_id, `${PROMPT_ACTION_PREFIX}${i}`);
      assert.strictEqual(el.value, ARTS_CULTURE.tailoredPrompts[i]);
      assert.ok(el.text.text.length <= 75);
    });
    assertNoEmoji(b);
  });

  it('offsets the action_ids by startIndex so multiple rows coexist', () => {
    const b = buildPromptButtons(['a', 'b'], 'row2', 5);
    assert.strictEqual(b.elements[0].action_id, `${PROMPT_ACTION_PREFIX}5`);
    assert.strictEqual(b.elements[1].action_id, `${PROMPT_ACTION_PREFIX}6`);
  });
});

describe('buildWelcomeDmBlocks', () => {
  it('welcomes as an arts and culture assistant, with tailored prompts and no picker', () => {
    const blocks = buildWelcomeDmBlocks();
    assert.strictEqual(blocks[0].type, 'header');
    assert.strictEqual(blocks[0].text.text, 'Welcome to Kala');
    // Intro names the arts and culture focus — no org-type question.
    const intro = blocks.find((b) => b.type === 'section');
    assert.match(intro.text.text, /arts and culture nonprofits/i);
    assert.ok(!/what kind of/i.test(intro.text.text), 'no org-type question in the new copy');
    // No picker block; the tailored prompts appear directly so the user can start.
    assert.ok(!blocks.some((b) => b.block_id === 'org_type_select'), 'no org-type picker');
    const promptBlock = blocks.find((b) => b.block_id === 'tailored_prompts');
    assert.ok(promptBlock, 'tailored prompt buttons present');
    assert.strictEqual(promptBlock.elements.length, ARTS_CULTURE.tailoredPrompts.length);
    // Closing nudge invites a tap or a free-form message.
    const closing = blocks.at(-1);
    assert.strictEqual(closing.type, 'context');
    assert.match(closing.elements[0].text, /Tap one, or just type/);
    assertNoEmoji(blocks);
  });

  it('surfaces the operational-tracker feature prompts in their own row, with non-colliding ids', () => {
    const blocks = buildWelcomeDmBlocks();
    const featureBlock = blocks.find((b) => b.block_id === 'feature_prompts');
    assert.ok(featureBlock, 'feature prompt buttons present');
    assert.strictEqual(featureBlock.elements.length, ARTS_CULTURE.featurePrompts.length);
    // The engagement tracker starter is one of them.
    assert.ok(featureBlock.elements.some((el) => /engagement/i.test(el.value)));
    // Action ids are offset past the tailored row so the two rows never collide.
    const tailored = blocks.find((b) => b.block_id === 'tailored_prompts');
    const ids = [...tailored.elements, ...featureBlock.elements].map((e) => e.action_id);
    assert.strictEqual(new Set(ids).size, ids.length, 'no duplicate action_ids across rows');
  });
});
