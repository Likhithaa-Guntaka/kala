import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';

import { handleSendToBenvuShortcut, handleSendToBenvuSubmit } from '../../../listeners/shortcuts/message-shortcut.js';

describe('Send to Benvu shortcut', () => {
  let ack;
  let logger;

  beforeEach(() => {
    ack = mock.fn(async () => {});
    logger = { error: mock.fn() };
  });

  describe('handleSendToBenvuShortcut', () => {
    it('opens a modal pre-filled with the message and four choices', async () => {
      const client = { views: { open: mock.fn(async () => ({ ok: true })) } };
      const shortcut = { trigger_id: 'T1', message: { text: 'These are our meeting notes.' } };
      await handleSendToBenvuShortcut({ ack, shortcut, client, logger });

      assert.strictEqual(ack.mock.callCount(), 1);
      assert.strictEqual(client.views.open.mock.callCount(), 1);
      const view = client.views.open.mock.calls[0].arguments[0].view;
      assert.strictEqual(view.callback_id, 'send_to_benvu_submit');
      assert.ok(view.private_metadata.includes('meeting notes'));

      const input = view.blocks.find((b) => b.type === 'input');
      assert.strictEqual(input.element.type, 'radio_buttons');
      assert.deepStrictEqual(
        input.element.options.map((o) => o.value),
        ['summarize', 'grants', 'report', 'reminder'],
      );
    });
  });

  describe('handleSendToBenvuSubmit', () => {
    it('DMs a note (and does not run the agent) when the message had no text', async () => {
      const client = {
        conversations: { open: mock.fn(async () => ({ channel: { id: 'D1' } })) },
        chat: {
          postMessage: mock.fn(async () => ({ ok: true, ts: '1' })),
          update: mock.fn(async () => ({ ok: true })),
        },
      };
      const args = {
        ack,
        body: { user: { id: 'U1' } },
        view: { private_metadata: JSON.stringify({ text: '' }), state: { values: { action: { choice: {} } } } },
        client,
        context: {},
        logger,
      };
      await handleSendToBenvuSubmit(args);

      assert.strictEqual(ack.mock.callCount(), 1);
      assert.strictEqual(client.chat.postMessage.mock.callCount(), 1);
      assert.ok(client.chat.postMessage.mock.calls[0].arguments[0].text.includes("didn't have any text"));
      assert.strictEqual(client.chat.update.mock.callCount(), 0);
    });
  });
});
