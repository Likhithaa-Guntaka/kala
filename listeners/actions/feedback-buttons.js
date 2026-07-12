import { attachComment, recordFeedback } from '../feedback-store.js';
import { buildFeedbackCommentModal } from '../views/feedback-builder.js';

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
 * Best-effort: the response is usually threaded under the user's message, so fetch
 * that parent to summarize what they asked.
 * @param {any} client
 * @param {string | undefined} channelId
 * @param {string | undefined} threadTs
 * @param {string | undefined} messageTs
 * @returns {Promise<string>}
 */
async function parentSummary(client, channelId, threadTs, messageTs) {
  if (!channelId || !threadTs || threadTs === messageTs) return '';
  try {
    const parent = await client.conversations.history({
      channel: channelId,
      latest: threadTs,
      limit: 1,
      inclusive: true,
    });
    return summarize(messageText(parent.messages?.[0]));
  } catch {
    return '';
  }
}

/**
 * Post the single acknowledgement Kala gives for feedback.
 * @param {any} client
 * @param {string | undefined} channelId
 * @param {string} userId
 * @param {string | undefined} threadTs
 * @returns {Promise<void>}
 */
async function thankUser(client, channelId, userId, threadTs) {
  if (!channelId) return;
  await client.chat
    .postEphemeral({ channel: channelId, user: userId, thread_ts: threadTs, text: 'Thanks for the feedback!' })
    .catch(() => {});
}

/**
 * Handle 👍 / 👎 feedback button clicks.
 *
 * Both ratings are logged immediately on click — a cancelled modal still means the
 * user was unhappy, and that signal shouldn't be lost. 👍 is a single click with no
 * follow-up. 👎 additionally opens a small modal asking an optional "What went
 * wrong?", whose text is attached to the already-recorded entry on submit.
 * @param {import('@slack/bolt').AllMiddlewareArgs & import('@slack/bolt').SlackActionMiddlewareArgs<import('@slack/bolt').BlockButtonAction>} args
 * @returns {Promise<void>}
 */
export async function handleFeedbackButton({ ack, body, client, logger }) {
  await ack();

  try {
    const userId = body.user.id;
    const rating = body.actions[0].value === 'down' ? 'down' : 'up';
    const channelId = body.channel?.id;
    const message = body.message;
    const threadTs = message?.thread_ts;
    const responseSummary = summarize(messageText(message));

    // Record the rating now, before any further round-trips.
    const entry = recordFeedback({
      user_id: userId,
      message_summary: '',
      response_summary: responseSummary,
      rating,
      timestamp: new Date().toISOString(),
    });
    logger.info(`Feedback recorded: ${rating} from ${userId}`);

    if (rating === 'down') {
      // Open the comment modal first — trigger_id expires quickly.
      await client.views.open({
        trigger_id: body.trigger_id,
        view: buildFeedbackCommentModal(JSON.stringify({ feedbackId: entry.id, channelId, threadTs })),
      });
      // Enrich afterwards; no deadline once the modal is up.
      entry.message_summary = await parentSummary(client, channelId, threadTs, message?.ts);
      return;
    }

    entry.message_summary = await parentSummary(client, channelId, threadTs, message?.ts);
    await thankUser(client, channelId, userId, threadTs);
  } catch (e) {
    logger.error(`Failed to handle feedback: ${e}`);
  }
}

/**
 * Handle submission of the 👎 comment modal. The rating was already logged on click,
 * so this only attaches the optional comment and thanks the user.
 * @param {import('@slack/bolt').AllMiddlewareArgs & import('@slack/bolt').SlackViewMiddlewareArgs<import('@slack/bolt').ViewSubmitAction>} args
 * @returns {Promise<void>}
 */
export async function handleFeedbackDownSubmit({ ack, body, view, client, logger }) {
  await ack();

  try {
    const userId = body.user.id;
    const comment = (view.state.values.comment?.text?.value || '').trim();
    /** @type {{ feedbackId?: number, channelId?: string, threadTs?: string }} */
    const meta = JSON.parse(view.private_metadata || '{}');

    if (comment) {
      attachComment(meta.feedbackId, comment);
      logger.info(`Feedback comment attached for ${userId}`);
    }

    await thankUser(client, meta.channelId, userId, meta.threadTs);
  } catch (e) {
    logger.error(`Failed to attach thumbs-down comment: ${e}`);
  }
}
