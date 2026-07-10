import assert from 'node:assert';
import { describe, it } from 'node:test';

import { getOrgTypeById, ORG_TYPES } from '../../../listeners/org-types.js';
import {
  buildOrgTypeActionsBlock,
  buildPromptActionsBlock,
  buildTailoredPromptsDmBlocks,
  buildWelcomeDmBlocks,
  PROMPT_ACTION_PREFIX,
} from '../../../listeners/views/onboarding-builder.js';
import { assertNoEmoji } from '../../helpers/no-emoji.js';

describe('buildOrgTypeActionsBlock', () => {
  it('is one actions block with a plain, emoji-free button per org type', () => {
    const b = buildOrgTypeActionsBlock();
    assert.strictEqual(b.type, 'actions');
    assert.strictEqual(b.block_id, 'org_type_select');
    assert.strictEqual(b.elements.length, ORG_TYPES.length);
    for (const el of b.elements) {
      assert.strictEqual(el.type, 'button');
      assert.ok(el.action_id.startsWith('orgtype_'));
      assert.strictEqual(el.style, undefined);
    }
    // Label is the plain org label, id rides in the value.
    const first = b.elements[0];
    assert.strictEqual(first.text.text, ORG_TYPES[0].label);
    assert.strictEqual(first.value, ORG_TYPES[0].id);
    assertNoEmoji(b);
  });
});

describe('buildPromptActionsBlock', () => {
  it('has three prompt buttons with prompt_run_ ids and the full prompt in value', () => {
    const org = getOrgTypeById('education');
    const b = buildPromptActionsBlock(org);
    assert.strictEqual(b.block_id, 'tailored_prompts');
    assert.strictEqual(b.elements.length, 3);
    b.elements.forEach((el, i) => {
      assert.strictEqual(el.action_id, `${PROMPT_ACTION_PREFIX}${i}`);
      assert.strictEqual(el.value, org.prompts[i]);
      assert.ok(el.text.text.length <= 75);
    });
    assertNoEmoji(b);
  });
});

describe('buildWelcomeDmBlocks', () => {
  it('opens with a header, an intro section, the picker, and a next-step context', () => {
    const blocks = buildWelcomeDmBlocks();
    assert.strictEqual(blocks[0].type, 'header');
    assert.ok(blocks.some((b) => b.type === 'section' && /what kind of organization/i.test(b.text.text)));
    assert.ok(blocks.some((b) => b.block_id === 'org_type_select'));
    assert.strictEqual(blocks.at(-1).type, 'context');
    assertNoEmoji(blocks);
  });
});

describe('buildTailoredPromptsDmBlocks', () => {
  it('confirms the org label without emoji and shows the prompt buttons', () => {
    const org = getOrgTypeById('arts_culture');
    const blocks = buildTailoredPromptsDmBlocks(org);
    assert.ok(blocks.some((b) => b.type === 'section' && b.text.text.includes(org.label)));
    assert.ok(blocks.some((b) => b.block_id === 'tailored_prompts'));
    assertNoEmoji(blocks);
  });
});
