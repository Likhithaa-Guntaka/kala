import { runBenvuAgent } from '../../agent/index.js';
import { sessionStore } from '../../thread-context/index.js';
import { getOrgTypeById } from '../org-types.js';
import { buildAgentReply } from '../views/feedback-builder.js';
import { grantCardsFor } from '../views/grant-results-builder.js';
import { buildSendToBenvuModal } from '../views/shortcut-modal-builder.js';

/**
 * Maps a modal choice to the agent prompt built from the message text. Keys must
 * match the CHOICES values in the shortcut modal builder.
 * @type {Record<string, (t: string) => string>}
 */
const PROMPTS = {
  summarize: (t) => `Summarize this message:\n\n${t}`,
  grants: (t) => `Find grants related to this:\n\n${t}`,
  report: (t) => `Draft a short report or document based on this:\n\n${t}`,
  reminder: (t) => `Set a reminder based on this:\n\n${t}`,
};

/**
 * "Send to Benvu" message shortcut: opens a modal with the message pre-filled and
 * the action choices.
 * @param {import('@slack/bolt').AllMiddlewareArgs & import('@slack/bolt').SlackShortcutMiddlewareArgs<import('@slack/bolt').MessageShortcut>} args
 * @returns {Promise<void>}
 */
export async function handleSendToBenvuShortcut({ ack, shortcut, client, logger }) {
  await ack();

  try {
    const text = shortcut.message?.text || '';
    await client.views.open({ trigger_id: shortcut.trigger_id, view: buildSendToBenvuModal(text) });
  } catch (e) {
    logger.error(`Failed to open Send to Benvu modal: ${e}`);
  }
}

/**
 * Modal submission: run the chosen action and DM the result to the user.
 * @param {import('@slack/bolt').AllMiddlewareArgs & import('@slack/bolt').SlackViewMiddlewareArgs<import('@slack/bolt').ViewSubmitAction>} args
 * @returns {Promise<void>}
 */
export async function handleSendToBenvuSubmit({ ack, body, view, client, context, logger }) {
  await ack();

  try {
    const userId = body.user.id;
    const choice = view.state.values.action?.choice?.selected_option?.value || 'summarize';
    /** @type {{ text?: string }} */
    const meta = JSON.parse(view.private_metadata || '{}');
    const text = (meta.text || '').trim();

    const conversation = await client.conversations.open({ users: userId });
    const channelId = conversation.channel?.id;
    if (!channelId) return;

    if (!text) {
      await client.chat.postMessage({
        channel: channelId,
        text: "That message didn't have any text I could work with.",
      });
      return;
    }

    // Post a working indicator, then update it with the result.
    const thinking = await client.chat.postMessage({ channel: channelId, text: '_Benvu is working on that…_' });
    const thinkingTs = /** @type {string} */ (thinking.ts);

    const prompt = (PROMPTS[choice] || PROMPTS.summarize)(text);
    const orgTypeId = sessionStore.getOrgType(userId);
    const orgType = getOrgTypeById(orgTypeId)?.label;
    const deps = {
      client,
      userId,
      channelId,
      threadTs: thinkingTs,
      messageTs: thinkingTs,
      userToken: context.userToken,
      orgType,
      orgTypeId,
    };

    const { responseText, grants } = await runBenvuAgent(prompt, undefined, deps);
    await client.chat.update({
      channel: channelId,
      ts: thinkingTs,
      text: responseText,
      blocks: buildAgentReply(responseText, grantCardsFor(grants, text)),
    });
  } catch (e) {
    logger.error(`Failed to process Send to Benvu submission: ${e}`);
  }
}
