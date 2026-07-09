import { runBenvuAgent } from '../../agent/index.js';
import { sessionStore } from '../../thread-context/index.js';
import { getOrgTypeById } from '../org-types.js';
import { buildResponseBlocks } from '../views/feedback-builder.js';

/**
 * Maps a modal choice to the agent prompt built from the message text.
 * @type {Record<string, (t: string) => string>}
 */
const PROMPTS = {
  summarize: (t) => `Summarize this message:\n\n${t}`,
  grants: (t) => `Find grants related to this:\n\n${t}`,
  report: (t) => `Draft a short report or document based on this:\n\n${t}`,
  reminder: (t) => `Set a reminder based on this:\n\n${t}`,
};

/** @type {Array<{ text: { type: 'plain_text', text: string }, value: string }>} */
const CHOICES = [
  { text: { type: 'plain_text', text: 'Summarize' }, value: 'summarize' },
  { text: { type: 'plain_text', text: 'Find Related Grants' }, value: 'grants' },
  { text: { type: 'plain_text', text: 'Draft a Report' }, value: 'report' },
  { text: { type: 'plain_text', text: 'Set a Reminder' }, value: 'reminder' },
];

/** @param {string} s @param {number} max */
function truncate(s, max) {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * "Send to Benvu" message shortcut: opens a modal with the message pre-filled and
 * four action choices.
 * @param {import('@slack/bolt').AllMiddlewareArgs & import('@slack/bolt').SlackShortcutMiddlewareArgs<import('@slack/bolt').MessageShortcut>} args
 * @returns {Promise<void>}
 */
export async function handleSendToBenvuShortcut({ ack, shortcut, client, logger }) {
  await ack();

  try {
    const text = shortcut.message?.text || '';
    // private_metadata is capped at 3000 chars — keep the message text within it.
    const stored = truncate(text, 2800);

    await client.views.open({
      trigger_id: shortcut.trigger_id,
      view: {
        type: 'modal',
        callback_id: 'send_to_benvu_submit',
        private_metadata: JSON.stringify({ text: stored }),
        title: { type: 'plain_text', text: 'Send to Benvu' },
        submit: { type: 'plain_text', text: 'Submit' },
        close: { type: 'plain_text', text: 'Cancel' },
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Message:*\n${text ? truncate(text, 600) : '_(this message has no text)_'}`,
            },
          },
          {
            type: 'input',
            block_id: 'action',
            label: { type: 'plain_text', text: 'What should I do with it?' },
            element: { type: 'radio_buttons', action_id: 'choice', initial_option: CHOICES[0], options: CHOICES },
          },
        ],
      },
    });
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
    const thinking = await client.chat.postMessage({ channel: channelId, text: '⏳ _Benvu is working on that…_' });
    const thinkingTs = /** @type {string} */ (thinking.ts);

    const prompt = (PROMPTS[choice] || PROMPTS.summarize)(text);
    const orgType = getOrgTypeById(sessionStore.getOrgType(userId))?.label;
    const deps = {
      client,
      userId,
      channelId,
      threadTs: thinkingTs,
      messageTs: thinkingTs,
      userToken: context.userToken,
      orgType,
    };

    const { responseText } = await runBenvuAgent(prompt, undefined, deps);
    await client.chat.update({
      channel: channelId,
      ts: thinkingTs,
      text: responseText,
      blocks: buildResponseBlocks(responseText),
    });
  } catch (e) {
    logger.error(`Failed to process Send to Benvu submission: ${e}`);
  }
}
