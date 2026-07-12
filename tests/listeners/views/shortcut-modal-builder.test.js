import assert from 'node:assert';
import { describe, it } from 'node:test';

import {
  buildSendToKalaModal,
  CHOICES,
  SEND_TO_KALA_CALLBACK,
} from '../../../listeners/views/shortcut-modal-builder.js';
import { assertNoEmoji } from '../../helpers/no-emoji.js';

describe('buildSendToKalaModal', () => {
  it('is a modal with the right callback and a preview of the message', () => {
    const modal = buildSendToKalaModal('We should apply for the Ford grant.');
    assert.strictEqual(modal.type, 'modal');
    assert.strictEqual(modal.callback_id, SEND_TO_KALA_CALLBACK);
    const preview = modal.blocks.find((b) => b.type === 'section');
    assert.ok(preview.text.text.includes('Ford grant'));
  });

  it('carries the full message in private_metadata within Slack limits', () => {
    const long = 'x'.repeat(5000);
    const modal = buildSendToKalaModal(long);
    assert.ok(modal.private_metadata.length <= 3000);
    const meta = JSON.parse(modal.private_metadata);
    assert.ok(meta.text.length <= 2800);
  });

  it('has a required radio choice with the action options', () => {
    const modal = buildSendToKalaModal('hello');
    const input = modal.blocks.find((b) => b.block_id === 'action');
    assert.strictEqual(input.element.type, 'radio_buttons');
    assert.strictEqual(input.element.action_id, 'choice');
    assert.strictEqual(input.element.options.length, CHOICES.length);
    assert.ok(input.hint && input.hint.text.length > 0);
  });

  it('handles an empty message and shows a named submit button', () => {
    const modal = buildSendToKalaModal('');
    assert.strictEqual(modal.submit.text, 'Run');
    const preview = modal.blocks.find((b) => b.type === 'section');
    assert.ok(/no text/i.test(preview.text.text));
  });

  it('has no emoji anywhere', () => {
    assertNoEmoji(buildSendToKalaModal('any message'));
  });
});
