import assert from 'node:assert';
import { describe, it } from 'node:test';

import { recordFeedback } from '../../../listeners/feedback-store.js';
import { buildFeedbackSummaryBlocks, buildHelpBlocks } from '../../../listeners/views/command-builder.js';
import { assertNoEmoji } from '../../helpers/no-emoji.js';

describe('buildHelpBlocks', () => {
  it('has a header and lists every command, with no emoji', () => {
    const blocks = buildHelpBlocks();
    assert.strictEqual(blocks[0].type, 'header');
    const text = blocks
      .filter((b) => b.type === 'section')
      .map((b) => b.text.text)
      .join('\n');
    for (const cmd of ['/grant', '/report', '/deadline', '/announce', '/kala']) {
      assert.ok(text.includes(cmd), `mentions ${cmd}`);
    }
    assertNoEmoji(blocks);
  });
});

describe('buildFeedbackSummaryBlocks', () => {
  it('renders a header and tallies once feedback exists, with no emoji', () => {
    recordFeedback({
      user_id: 'U1',
      message_summary: 'q',
      response_summary: 'a',
      rating: 'up',
      timestamp: '2026-07-09',
    });
    recordFeedback({
      user_id: 'U2',
      message_summary: 'q',
      response_summary: 'a',
      rating: 'down',
      timestamp: '2026-07-09',
    });
    const blocks = buildFeedbackSummaryBlocks();
    assert.strictEqual(blocks[0].type, 'header');
    const ctx = blocks.find((b) => b.type === 'context');
    assert.ok(/Helpful:/.test(ctx.elements[0].text));
    assert.ok(/Not helpful:/.test(ctx.elements[0].text));
    assertNoEmoji(blocks);
  });
});
