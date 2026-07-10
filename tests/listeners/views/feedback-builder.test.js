import assert from 'node:assert';
import { describe, it } from 'node:test';

import {
  buildAgentReply,
  buildFeedbackBlocks,
  buildFeedbackCommentModal,
} from '../../../listeners/views/feedback-builder.js';
import { assertNoEmoji } from '../../helpers/no-emoji.js';

describe('buildFeedbackBlocks', () => {
  it('is one actions block with text-labeled Helpful / Not helpful buttons', () => {
    const [block] = buildFeedbackBlocks();
    assert.strictEqual(block.type, 'actions');
    assert.strictEqual(block.block_id, 'feedback');
    const [up, down] = block.elements;
    assert.strictEqual(up.text.text, 'Helpful');
    assert.strictEqual(down.text.text, 'Not helpful');
    // Action IDs and values are unchanged so the handler still logs correctly.
    assert.strictEqual(up.action_id, 'feedback_up');
    assert.strictEqual(up.value, 'up');
    assert.strictEqual(down.action_id, 'feedback_down');
    assert.strictEqual(down.value, 'down');
    assertNoEmoji(buildFeedbackBlocks());
  });
});

describe('buildAgentReply', () => {
  it('wraps text in sections and appends the feedback block', () => {
    const blocks = buildAgentReply('Here are three grants for you.');
    assert.strictEqual(blocks[0].type, 'section');
    assert.ok(blocks[0].text.text.includes('three grants'));
    assert.strictEqual(blocks.at(-1).type, 'actions');
    assert.strictEqual(blocks.at(-1).block_id, 'feedback');
  });

  it('splits long text across multiple sections under the 3000-char limit', () => {
    const blocks = buildAgentReply('a'.repeat(7000));
    const sections = blocks.filter((b) => b.type === 'section');
    assert.ok(sections.length >= 3);
    for (const s of sections) assert.ok(s.text.text.length <= 3000);
  });
});

describe('buildFeedbackCommentModal', () => {
  it('is a modal with an optional comment input and no emoji', () => {
    const modal = buildFeedbackCommentModal(JSON.stringify({ feedbackId: 1 }));
    assert.strictEqual(modal.type, 'modal');
    assert.strictEqual(modal.callback_id, 'feedback_down_submit');
    const input = modal.blocks.find((b) => b.block_id === 'comment');
    assert.strictEqual(input.optional, true);
    assertNoEmoji(modal);
  });
});
