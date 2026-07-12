import { runKalaAgent } from '../../agent/index.js';
import { sessionStore } from '../../thread-context/index.js';
import { setAssistantStatus, statusForMessage } from '../assistant-status.js';
import { buildAgentReply } from '../views/feedback-builder.js';
import { grantCardsFor } from '../views/grant-results-builder.js';
import { publishHome } from '../views/publish-home.js';

/**
 * Handle a tailored example-prompt button. Runs the agent with that prompt and
 * replies in a DM, so onboarding suggestions are immediately actionable.
 * @param {import('@slack/bolt').AllMiddlewareArgs & import('@slack/bolt').SlackActionMiddlewareArgs<import('@slack/bolt').BlockButtonAction>} args
 * @param {typeof runKalaAgent} [runAgent] - Injectable agent runner; defaults to the real one (seam for tests).
 * @returns {Promise<void>}
 */
export async function handlePromptButton({ ack, body, client, context, logger }, runAgent = runKalaAgent) {
  await ack();

  try {
    const userId = body.user.id;
    const prompt = body.actions[0].value;
    if (!prompt) return;

    // Prompt buttons live in a DM message, but the same buttons on the App Home
    // tab have no channel — open a DM in that case. An absent originating channel
    // is also how we tell the click came from Home (Home has no channel) rather
    // than from inside the onboarding DM.
    const fromHome = !(/** @type {any} */ (body).channel?.id);
    let channelId = /** @type {any} */ (body).channel?.id;
    if (!channelId) {
      const conversation = await client.conversations.open({ users: userId });
      channelId = conversation.channel?.id;
    }
    if (!channelId) return;

    // Echo the chosen prompt so the DM reads like a normal conversation turn.
    const echo = await client.chat.postMessage({ channel: channelId, text: `*You:* ${prompt}` });
    const threadTs = /** @type {string} */ (echo.ts);

    // The App Home tab has no messages and can't switch the user's tab, so a Home
    // click otherwise gives no visible feedback while the agent works in the DM.
    // Republish Home with a transient confirmation banner (same mechanism as the
    // issue-modal flow), before the potentially slow agent run so it lands right
    // away. Best-effort — a banner failure must not break the reply.
    if (fromHome) {
      try {
        await publishHome(client, {
          userId,
          botUserId: context.botUserId,
          notice: 'Sent to your messages — open the Messages tab to see what I found.',
        });
      } catch (bannerErr) {
        logger.error(`Failed to show Home confirmation banner: ${bannerErr}`);
      }
    }

    // Show a native assistant-thread status while Kala works.
    await setAssistantStatus(client, channelId, threadTs, statusForMessage(prompt));

    const existingSessionId = sessionStore.getSession(channelId, threadTs);
    const deps = {
      client,
      userId,
      channelId,
      threadTs,
      messageTs: threadTs,
      userToken: context.userToken,
    };

    const { responseText, sessionId, grants } = await runAgent(prompt, existingSessionId ?? undefined, deps);

    // Clear the status, then post the answer with grant cards + feedback buttons.
    await setAssistantStatus(client, channelId, threadTs, '');
    await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: responseText,
      blocks: buildAgentReply(responseText, grantCardsFor(grants, prompt)),
    });

    if (sessionId) sessionStore.setSession(channelId, threadTs, sessionId);
  } catch (e) {
    logger.error(`Failed to run prompt button: ${e}`);
  }
}
