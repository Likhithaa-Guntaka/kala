import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';

import { handleChangeOrgType, handleOrgTypeSelected } from '../../../listeners/actions/onboarding-buttons.js';
import { _resetPublishGen } from '../../../listeners/views/publish-home.js';
import { sessionStore } from '../../../thread-context/index.js';

/** @param {number} ms */
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/** Read the org label out of a published Home view (or 'PICKER'/'?'). @param {any} view */
function orgLabelOf(view) {
  const ctx = (view.blocks || []).filter((b) => b.type === 'context').flatMap((b) => b.elements.map((e) => e.text));
  const line = ctx.find((t) => /Tailored for/.test(t));
  if (line) return line;
  return (view.blocks || []).some((b) => String(b.block_id || '').startsWith('org_type_select')) ? 'PICKER' : '?';
}

describe('onboarding action handlers', () => {
  let fakeAck;
  let fakeClient;
  let fakeContext;
  let fakeLogger;

  beforeEach(() => {
    fakeAck = mock.fn(async () => {});
    fakeClient = {
      conversations: {
        open: mock.fn(async () => ({ channel: { id: 'D1' } })),
        // Default: the latest message in the DM is our just-posted onboarding msg,
        // so a re-switch edits it in place. Individual tests override this.
        history: mock.fn(async () => ({ messages: [{ ts: '1.1' }] })),
      },
      chat: {
        postMessage: mock.fn(async () => ({ ok: true, ts: '1.1' })),
        update: mock.fn(async () => ({ ok: true })),
      },
      views: { publish: mock.fn(async () => ({ ok: true })), open: mock.fn(async () => ({ ok: true })) },
      users: { info: mock.fn(async () => ({ user: { profile: { first_name: 'Dee' } } })) },
    };
    fakeContext = { botUserId: 'U0BOT', userToken: undefined };
    fakeLogger = { error: mock.fn(), info: mock.fn() };
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

    it('first onboarding posts a new tailored DM and stores its message ref', async () => {
      const U = 'UFIRST';
      await handleOrgTypeSelected({
        ack: fakeAck,
        body: { user: { id: U }, actions: [{ value: 'food_bank' }] },
        client: fakeClient,
        context: fakeContext,
        logger: fakeLogger,
      });

      assert.strictEqual(fakeClient.chat.postMessage.mock.callCount(), 1);
      assert.strictEqual(fakeClient.chat.update.mock.callCount(), 0);
      assert.strictEqual(
        fakeClient.chat.postMessage.mock.calls[0].arguments[0].text,
        'Set up for Food Bank / Basic Needs.',
      );
      assert.deepStrictEqual(sessionStore.getOnboardingMessageRef(U), { channel: 'D1', ts: '1.1' });
    });

    it('re-switch with no other DM activity edits the message in place; ref ts unchanged', async () => {
      const U = 'UEDIT';
      const select = (value) =>
        handleOrgTypeSelected({
          ack: fakeAck,
          body: { user: { id: U }, actions: [{ value }] },
          client: fakeClient,
          context: fakeContext,
          logger: fakeLogger,
        });
      const change = () =>
        handleChangeOrgType({
          ack: fakeAck,
          body: { user: { id: U } },
          client: fakeClient,
          context: fakeContext,
          logger: fakeLogger,
        });

      await select('food_bank'); // posts, ref -> ts 1.1
      await change();
      await select('education'); // our msg (1.1) is still latest -> update in place
      await change();
      await select('mental_health'); // still latest -> update again

      assert.strictEqual(sessionStore.getOrgType(U), 'mental_health');
      // Posted exactly once; every later switch was an in-place edit — no duplicates.
      assert.strictEqual(fakeClient.chat.postMessage.mock.callCount(), 1);
      assert.strictEqual(fakeClient.chat.update.mock.callCount(), 2);
      const lastUpdate = fakeClient.chat.update.mock.calls.at(-1).arguments[0];
      assert.strictEqual(lastUpdate.channel, 'D1');
      assert.strictEqual(lastUpdate.ts, '1.1'); // same message edited, ts unchanged
      assert.strictEqual(lastUpdate.text, 'Set up for Mental Health / Crisis Support.');
      const promptBlock = lastUpdate.blocks.find((b) => b.block_id === 'tailored_prompts');
      assert.strictEqual(promptBlock.elements.length, 3); // prompt_run_* buttons still present
      // Ref still points at the same message.
      assert.deepStrictEqual(sessionStore.getOnboardingMessageRef(U), { channel: 'D1', ts: '1.1' });
    });

    it('re-switch after other DM activity posts a fresh message and re-points the ref', async () => {
      const U = 'UFRESH';
      // First post returns ts 100; a later fresh post returns ts 200.
      let n = 0;
      fakeClient.chat.postMessage = mock.fn(async () => ({ ok: true, ts: n++ === 0 ? '100' : '200' }));
      // The DM has moved on: the latest message is NOT our onboarding message.
      fakeClient.conversations.history = mock.fn(async () => ({ messages: [{ ts: '150' }] }));

      const select = (value) =>
        handleOrgTypeSelected({
          ack: fakeAck,
          body: { user: { id: U }, actions: [{ value }] },
          client: fakeClient,
          context: fakeContext,
          logger: fakeLogger,
        });
      const change = () =>
        handleChangeOrgType({
          ack: fakeAck,
          body: { user: { id: U } },
          client: fakeClient,
          context: fakeContext,
          logger: fakeLogger,
        });

      await select('food_bank'); // posts, ref -> ts 100
      assert.deepStrictEqual(sessionStore.getOnboardingMessageRef(U), { channel: 'D1', ts: '100' });

      await change();
      await select('education'); // latest (150) != ref (100) -> post fresh, ref -> 200

      assert.strictEqual(fakeClient.chat.postMessage.mock.callCount(), 2);
      assert.strictEqual(fakeClient.chat.update.mock.callCount(), 0);
      assert.strictEqual(
        fakeClient.chat.postMessage.mock.calls[1].arguments[0].text,
        'Set up for Education / Youth Programs.',
      );
      assert.deepStrictEqual(sessionStore.getOnboardingMessageRef(U), { channel: 'D1', ts: '200' });
    });

    it('Home shows the NEW org after a switch even if the first refresh is slow (race regression)', async () => {
      // Reproduces the display bug: the food_bank onboarding refresh awaits a slow
      // name fetch and, unfixed, publishes its stale snapshot last — clobbering the
      // Education view. The guarded publisher must make Education win.
      _resetPublishGen();
      const U = 'URACEINT';
      sessionStore.clearOrgType(U);

      const publishes = [];
      let infoCall = 0;
      const client = {
        conversations: { open: async () => ({ channel: { id: 'D1' } }) },
        chat: { postMessage: async () => ({ ok: true, ts: '1' }) },
        views: {
          publish: async (a) => {
            publishes.push(a.view);
            return { ok: true };
          },
        },
        users: {
          info: async () => {
            const n = infoCall++;
            await delay(n === 0 ? 60 : 2); // the first refresh (food_bank) is the slow one
            return { user: { profile: { first_name: 'Dee' } } };
          },
          profile: {
            set: async () => {
              throw new Error('not_allowed');
            },
          },
        },
      };
      const ctx = { botUserId: 'U0BOT' };
      const logger = { error: () => {}, info: () => {} };
      const sel = (v) =>
        handleOrgTypeSelected({
          ack: async () => {},
          body: { user: { id: U }, actions: [{ value: v }] },
          client,
          context: ctx,
          logger,
        });
      const chg = () =>
        handleChangeOrgType({ ack: async () => {}, body: { user: { id: U } }, client, context: ctx, logger });

      const p1 = sel('food_bank'); // first onboarding -> slow refresh
      await delay(10);
      const p2 = chg(); // clear -> picker
      await delay(10);
      const p3 = sel('education'); // switch
      await Promise.all([p1, p2, p3]);

      // The store was always correct; the bug was purely the last published view.
      assert.strictEqual(sessionStore.getOrgType(U), 'education');
      const last = publishes[publishes.length - 1];
      assert.match(orgLabelOf(last), /Education/, 'the last published Home view shows Education');
      assert.ok(!/Food Bank/.test(orgLabelOf(last)), 'the stale Food Bank view never lands last');
      sessionStore.clearOrgType(U);
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
