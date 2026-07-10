import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';

import { handleChangeOrgType, handleOrgTypeSelected } from '../../../listeners/actions/onboarding-buttons.js';
import { sessionStore } from '../../../thread-context/index.js';

describe('onboarding action handlers', () => {
  let fakeAck;
  let fakeClient;
  let fakeContext;
  let fakeLogger;

  beforeEach(() => {
    fakeAck = mock.fn(async () => {});
    fakeClient = {
      conversations: { open: mock.fn(async () => ({ channel: { id: 'D1' } })) },
      chat: { postMessage: mock.fn(async () => ({ ok: true, ts: '1.1' })) },
      views: { publish: mock.fn(async () => ({ ok: true })), open: mock.fn(async () => ({ ok: true })) },
    };
    fakeContext = { botUserId: 'U0BOT', userToken: undefined };
    fakeLogger = { error: mock.fn() };
  });

  describe('handleOrgTypeSelected', () => {
    it('stores the org type, sends a tailored DM, and refreshes the home tab', async () => {
      const body = { user: { id: 'UONBOARD' }, actions: [{ value: 'education' }] };
      await handleOrgTypeSelected({ ack: fakeAck, body, client: fakeClient, context: fakeContext, logger: fakeLogger });

      assert.strictEqual(fakeAck.mock.callCount(), 1);
      assert.strictEqual(sessionStore.getOrgType('UONBOARD'), 'education');

      // Follow-up DM with tailored prompt buttons.
      assert.strictEqual(fakeClient.chat.postMessage.mock.callCount(), 1);
      const dm = fakeClient.chat.postMessage.mock.calls[0].arguments[0];
      assert.strictEqual(dm.channel, 'D1');
      assert.ok(Array.isArray(dm.blocks));
      const promptBlock = dm.blocks.find((b) => b.block_id === 'tailored_prompts');
      assert.strictEqual(promptBlock.elements.length, 3);

      // Home tab refreshed for the same user.
      assert.strictEqual(fakeClient.views.publish.mock.callCount(), 1);
      const publish = fakeClient.views.publish.mock.calls[0].arguments[0];
      assert.strictEqual(publish.user_id, 'UONBOARD');
      assert.strictEqual(publish.view.type, 'home');
    });

    it('ignores an unknown org type', async () => {
      const body = { user: { id: 'UBAD' }, actions: [{ value: 'not_a_type' }] };
      await handleOrgTypeSelected({ ack: fakeAck, body, client: fakeClient, context: fakeContext, logger: fakeLogger });
      assert.strictEqual(sessionStore.getOrgType('UBAD'), null);
      assert.strictEqual(fakeClient.chat.postMessage.mock.callCount(), 0);
    });

    it('does NOT re-post the tailored DM when changing an already-set org type', async () => {
      // Simulate a user who already onboarded, then picks a different type.
      sessionStore.setOrgType('UCHANGE', 'food_bank');
      const body = { user: { id: 'UCHANGE' }, actions: [{ value: 'education' }] };
      await handleOrgTypeSelected({ ack: fakeAck, body, client: fakeClient, context: fakeContext, logger: fakeLogger });

      // Stored the new type and refreshed the Home tab...
      assert.strictEqual(sessionStore.getOrgType('UCHANGE'), 'education');
      assert.strictEqual(fakeClient.views.publish.mock.callCount(), 1);
      // ...but did NOT clutter the DM with another "Set up for X" message.
      assert.strictEqual(fakeClient.chat.postMessage.mock.callCount(), 0);
    });
  });

  describe('handleChangeOrgType', () => {
    it('clears the org type and republishes the Home tab', async () => {
      sessionStore.setOrgType('URESET', 'arts_culture');
      const body = { user: { id: 'URESET' } };

      await handleChangeOrgType({ ack: fakeAck, body, client: fakeClient, context: fakeContext, logger: fakeLogger });

      assert.strictEqual(fakeAck.mock.callCount(), 1);
      assert.strictEqual(sessionStore.getOrgType('URESET'), null);
      assert.strictEqual(fakeClient.views.publish.mock.callCount(), 1);
      const publish = fakeClient.views.publish.mock.calls[0].arguments[0];
      assert.strictEqual(publish.user_id, 'URESET');
      assert.strictEqual(publish.view.type, 'home');
    });
  });
});
