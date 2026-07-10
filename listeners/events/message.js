import { runBenvuAgent } from '../../agent/index.js';
import { sessionStore } from '../../thread-context/index.js';
import { setAssistantStatus, statusForMessage } from '../assistant-status.js';
import { getOrgTypeById } from '../org-types.js';
import { buildFeedbackBlocks } from '../views/feedback-builder.js';

/**
 * @param {import('@slack/types').MessageEvent} event
 * @returns {event is import('@slack/types').GenericMessageEvent}
 */
function isGenericMessageEvent(event) {
  return !('subtype' in event && event.subtype !== undefined);
}

/**
 * @typedef {{ event_type: 'issue_submission', event_payload: { user_id: string } }} IssueSubmissionMetadata
 */

/**
 * @param {import('@slack/types').GenericMessageEvent} event
 * @returns {IssueSubmissionMetadata | null}
 */
function getIssueMetadata(event) {
  const metadata = /** @type {any} */ (event).metadata;
  return metadata?.event_type === 'issue_submission' ? metadata : null;
}

/**
 * Handle messages sent to Benvu via DM or in threads the bot is part of.
 * @param {import('@slack/bolt').AllMiddlewareArgs & import('@slack/bolt').SlackEventMiddlewareArgs<'message'>} args
 * @returns {Promise<void>}
 */
export async function handleMessage({ client, context, event, logger, say, sayStream }) {
  // Skip message subtypes (edits, deletes, etc.)
  if (!isGenericMessageEvent(event)) return;

  // Issue submissions are posted by the bot with metadata so the message
  // handler can run the agent on behalf of the original user.
  const issueMetadata = getIssueMetadata(event);

  // Skip bot messages that are not issue submissions.
  if (event.bot_id && !issueMetadata) return;

  const isDm = event.channel_type === 'im';
  const isThreadReply = !!event.thread_ts;

  if (isDm) {
    // DMs are always handled
  } else if (isThreadReply) {
    // Channel thread replies are handled only if the bot is already engaged
    const session = sessionStore.getSession(event.channel, /** @type {string} */ (event.thread_ts));
    if (session === null) return;
  } else {
    // Top-level channel messages are handled by app_mentioned
    return;
  }

  try {
    const channelId = event.channel;
    const text = event.text || '';
    const threadTs = event.thread_ts || event.ts;

    // For issue submissions the bot posted the message, so the real
    // user_id comes from the metadata rather than the event context.
    const userId = /** @type {string} */ (issueMetadata ? issueMetadata.event_payload.user_id : context.userId);

    const existingSessionId = sessionStore.getSession(channelId, threadTs);

    // Add eyes reaction only to the first message (DMs only — channel
    // threads already have the reaction from the initial app_mention)
    if (isDm && !existingSessionId) {
      await client.reactions.add({
        channel: channelId,
        timestamp: event.ts,
        name: 'eyes',
      });
    }

    // Show a native assistant-thread status while Benvu works.
    await setAssistantStatus(client, channelId, threadTs, statusForMessage(text));

    // Run the agent with deps for tool access
    const orgType = getOrgTypeById(sessionStore.getOrgType(userId))?.label;
    const deps = { client, userId, channelId, threadTs, messageTs: event.ts, userToken: context.userToken, orgType };
    const { responseText, sessionId: newSessionId } = await runBenvuAgent(text, existingSessionId ?? undefined, deps);

    // Clear the status, then stream the response in thread with feedback buttons.
    await setAssistantStatus(client, channelId, threadTs, '');
    const streamer = sayStream();
    await streamer.append({ markdown_text: responseText });
    const feedbackBlocks = buildFeedbackBlocks();
    await streamer.stop({ blocks: feedbackBlocks });

    // Store conversation session
    if (newSessionId) {
      sessionStore.setSession(channelId, threadTs, newSessionId);
    }
  } catch (e) {
    logger.error(`Failed to handle message: ${e}`);
    await say({
      text: 'Sorry, something went wrong on my end. Please try again in a moment.',
      thread_ts: event.thread_ts || event.ts,
    });
  }
}
