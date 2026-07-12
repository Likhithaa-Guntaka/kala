import { runKalaAgent } from '../../agent/index.js';
import { sessionStore } from '../../thread-context/index.js';
import { setAssistantStatus, statusForMessage } from '../assistant-status.js';
import { buildFeedbackBlocks } from '../views/feedback-builder.js';
import { grantCardsFor } from '../views/grant-results-builder.js';

/**
 * Handle app_mention events and run the Kala agent.
 * @param {import('@slack/bolt').AllMiddlewareArgs & import('@slack/bolt').SlackEventMiddlewareArgs<'app_mention'>} args
 * @returns {Promise<void>}
 */
export async function handleAppMentioned({ client, context, event, logger, say, sayStream }) {
  try {
    const channelId = event.channel;
    const text = event.text || '';
    const threadTs = event.thread_ts || event.ts;
    const userId = /** @type {string} */ (context.userId);

    // Strip the bot mention from the text
    const cleanedText = text.replace(/<@[A-Z0-9]+>/g, '').trim();

    if (!cleanedText) {
      await say({
        text: "Hi! I'm Kala. Tell me what you need, in any language, and I'll help you find grants, draft reports, or track deadlines.",
        thread_ts: threadTs,
      });
      return;
    }

    // Add eyes reaction only to the first message (not threaded replies)
    if (!event.thread_ts) {
      await client.reactions.add({
        channel: channelId,
        timestamp: event.ts,
        name: 'eyes',
      });
    }

    // Show a native assistant-thread status while Kala works.
    await setAssistantStatus(client, channelId, threadTs, statusForMessage(cleanedText));

    // Get conversation session
    const existingSessionId = sessionStore.getSession(channelId, threadTs);

    // Run the agent with deps for tool access
    const deps = {
      client,
      userId,
      channelId,
      threadTs,
      messageTs: event.ts,
      userToken: context.userToken,
    };
    const {
      responseText,
      sessionId: newSessionId,
      grants,
    } = await runKalaAgent(cleanedText, existingSessionId ?? undefined, deps);

    // Clear the status before streaming the reply.
    await setAssistantStatus(client, channelId, threadTs, '');

    // Stream response in thread with grant cards (when the search ran) + feedback.
    const streamer = sayStream();
    await streamer.append({ markdown_text: responseText });
    await streamer.stop({ blocks: [...grantCardsFor(grants, cleanedText), ...buildFeedbackBlocks()] });

    // Store conversation session
    if (newSessionId) {
      sessionStore.setSession(channelId, threadTs, newSessionId);
    }
  } catch (e) {
    logger.error(`Failed to handle app mention: ${e}`);
    await say({
      text: 'Sorry, something went wrong on my end. Please try again in a moment.',
      thread_ts: event.thread_ts || event.ts,
    });
  }
}
