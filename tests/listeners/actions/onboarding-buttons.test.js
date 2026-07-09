import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';

import { handleMoreActionsSelect, handleOrgTypeSelected } from '../../../listeners/actions/onboarding-buttons.js';
import { CHANGE_ORG_VALUE } from '../../../listeners/views/app-home-builder.js';
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
  });

  describe('handleMoreActionsSelect', () => {
    it('clears the org type and republishes onboarding when "Change organization type" is picked', async () => {
      sessionStore.setOrgType('URESET', 'arts_culture');
      const body = {
        user: { id: 'URESET' },
        trigger_id: 'T1',
        actions: [{ selected_option: { value: CHANGE_ORG_VALUE } }],
      };
      await handleMoreActionsSelect({
        ack: fakeAck,
        body,
        client: fakeClient,
        context: fakeContext,
        logger: fakeLogger,
      });

      assert.strictEqual(sessionStore.getOrgType('URESET'), null);
      assert.strictEqual(fakeClient.views.publish.mock.callCount(), 1);
      assert.strictEqual(fakeClient.views.open.mock.callCount(), 0);
    });

    it('opens the issue modal when a regular action is picked', async () => {
      const body = {
        user: { id: 'UPICK' },
        trigger_id: 'T2',
        actions: [{ selected_option: { value: 'Summarize Meeting Notes' } }],
      };
      await handleMoreActionsSelect({
        ack: fakeAck,
        body,
        client: fakeClient,
        context: fakeContext,
        logger: fakeLogger,
      });

      assert.strictEqual(fakeClient.views.open.mock.callCount(), 1);
      const opened = fakeClient.views.open.mock.calls[0].arguments[0];
      assert.strictEqual(opened.trigger_id, 'T2');
      assert.strictEqual(opened.view.type, 'modal');
      assert.strictEqual(fakeClient.views.publish.mock.callCount(), 0);
    });
  });
});
