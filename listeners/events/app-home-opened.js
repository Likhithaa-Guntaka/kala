import { suggestedPrompts } from '../suggested-prompts.js';
import { publishHome } from '../views/publish-home.js';

/**
 * Handle app_home_opened events. Under agent_view, this event fires for both
 * the Home tab and the Messages tab (the agent DM). Branch on event.tab:
 *   - 'messages' → pin suggested prompts to the top of the DM
 *   - 'home'     → publish the App Home Block Kit view
 * @param {import('@slack/bolt').AllMiddlewareArgs & import('@slack/bolt').SlackEventMiddlewareArgs<'app_home_opened'>} args
 * @returns {Promise<void>}
 */
export async function handleAppHomeOpened({ client, event, context, logger }) {
  try {
    if (event.tab === 'messages') {
      const { title, prompts } = suggestedPrompts();
      await client.assistant.threads.setSuggestedPrompts(
        // Under agent_view, suggested prompts pin to the top of the Messages tab —
        // no thread_ts is required. Cast until @slack/bolt's types catch up.
        /** @type {import('@slack/web-api').AssistantThreadsSetSuggestedPromptsArguments} */ ({
          channel_id: event.channel,
          title,
          prompts,
        }),
      );
      // TODO(agent-dm-messages-tab): handle app_context_changed once Bolt supports it
      return;
    }

    const userId = /** @type {string} */ (context.userId);
    await publishHome(client, { userId, botUserId: context.botUserId });
  } catch (e) {
    logger.error(`Failed to handle app_home_opened: ${e}`);
  }
}
