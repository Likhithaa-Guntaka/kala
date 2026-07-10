import assert from 'node:assert';
import { describe, it } from 'node:test';

import { CATEGORIES } from '../../../listeners/views/app-home-builder.js';
import { buildIssueModal } from '../../../listeners/views/issue-modal-builder.js';
import { assertNoEmoji } from '../../helpers/no-emoji.js';

describe('buildIssueModal', () => {
  it('is a modal with the issue_submission callback and a clear title', () => {
    const modal = buildIssueModal();
    assert.strictEqual(modal.type, 'modal');
    assert.strictEqual(modal.callback_id, 'issue_submission');
    assert.ok(/how can benvu help/i.test(modal.title.text));
    assert.ok(modal.close);
  });

  it('names the submit button after the chosen action, not "Submit"', () => {
    assert.strictEqual(buildIssueModal('Find Grants').submit.text, 'Find grants');
    assert.strictEqual(buildIssueModal('Track a Deadline').submit.text, 'Track deadline');
    // Submit labels stay within Slack's 24-char cap.
    for (const c of CATEGORIES) assert.ok(buildIssueModal(c.value).submit.text.length <= 24);
  });

  it('pre-selects the given category and defaults sensibly', () => {
    assert.strictEqual(
      buildIssueModal('Draft a Report').blocks.find((b) => b.block_id === 'category_block').element.initial_option
        .value,
      'Draft a Report',
    );
    assert.strictEqual(
      buildIssueModal('Nonexistent').blocks.find((b) => b.block_id === 'category_block').element.initial_option.value,
      CATEGORIES[0].value,
    );
    assert.strictEqual(
      buildIssueModal(undefined).blocks.find((b) => b.block_id === 'category_block').element.initial_option.value,
      CATEGORIES[0].value,
    );
  });

  it('keeps the category and description input blocks with their action IDs', () => {
    const modal = buildIssueModal();
    assert.strictEqual(modal.blocks.length, 2);
    const [cat, desc] = modal.blocks;
    assert.strictEqual(cat.block_id, 'category_block');
    assert.strictEqual(cat.element.action_id, 'category_select');
    assert.strictEqual(cat.element.options.length, CATEGORIES.length);
    assert.strictEqual(desc.block_id, 'description_block');
    assert.strictEqual(desc.element.action_id, 'description_input');
  });

  it('marks the category required and the details optional, with a hint', () => {
    const modal = buildIssueModal();
    const cat = modal.blocks.find((b) => b.block_id === 'category_block');
    const desc = modal.blocks.find((b) => b.block_id === 'description_block');
    assert.notStrictEqual(cat.optional, true); // required (default)
    assert.strictEqual(desc.optional, true);
    assert.ok(desc.hint && /optional/i.test(desc.hint.text));
    assert.ok(desc.element.placeholder.text.length > 0);
  });

  it('has no emoji anywhere', () => {
    assertNoEmoji(buildIssueModal('Find Grants'));
  });
});
