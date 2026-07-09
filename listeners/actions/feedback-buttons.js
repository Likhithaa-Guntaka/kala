import { recordFeedback } from '../feedback-store.js';

/** Short one-line summary of some Slack text. @param {string} text */
function summarize(text) {
  return (text || '').replace(/\s+/g, ' ').trim().slice(0, 140);
}

/** Pull readable text out of a Slack message (text field or section blocks). @param {any} message */
function messageText(message) {
  if (message?.text) return message.text;
  /** @type {any[]} */
  const blocks = message?.blocks || [];
  return blocks
    .filter((b) => b.type === 'section' && b.text?.text)
    .map((b) => b.text.text)
    .join(' ');
}

/**
 * Handle 👍 / 👎 feedback button clicks: log the feedback and thank the user.
 * @param {import('@slack/bolt').AllMiddlewareArgs & import('@slack/bolt').SlackActionMiddlewareArgs<import('@slack/bolt').BlockButtonAction>} args
 * @returns {Promise<void>}
 */
export async function handleFeedbackButton({ ack, body, client, logger }) {
  await ack();

  try {
    const userId = body.user.id;
    const rating = /** @type {'up' | 'down'} */ (body.actions[0].value);
    const channelId = body.channel?.id;
    const message = body.message;
    const threadTs = message?.thread_ts;

    const responseSummary = summarize(messageText(message));

    // Best-effort: the response is usually threaded under the user's message, so
    // fetch that parent to summarize what they asked.
    let messageSummary = '';
    if (channelId && threadTs && threadTs !== message?.ts) {
      try {
        const parent = await client.conversations.history({
          channel: channelId,
          latest: threadTs,
          limit: 1,
          inclusive: true,
        });
        messageSummary = summarize(messageText(parent.messages?.[0]));
      } catch {
        // History not available on this surface — leave the message summary blank.
      }
    }

    recordFeedback({
      user_id: userId,
      message_summary: messageSummary,
      response_summary: responseSummary,
      rating,
      timestamp: new Date().toISOString(),
    });
    logger.info(`Feedback recorded: ${rating} from ${userId}`);

    if (channelId) {
      await client.chat
        .postEphemeral({ channel: channelId, user: userId, thread_ts: threadTs, text: 'Thanks for the feedback!' })
        .catch(() => {});
    }
  } catch (e) {
    logger.error(`Failed to handle feedback: ${e}`);
  }
}
