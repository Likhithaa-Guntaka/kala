import { suggestedPrompts } from '../suggested-prompts.js';

/**
 * Short greeting posted into a freshly-started assistant thread. Kept in English:
 * it fires before the user has written anything, so there's no language to mirror
 * yet — Kala switches to the user's language once they reply.
 */
const GREETING =
  "Hi, I'm Kala. Tell me what you need — find a grant, draft a report or donor note, " +
  "summarize meeting notes, or track a deadline — and I'll get started. You can write to me in any language.";

/**
 * Handle assistant_thread_started: when Slack opens a fresh assistant thread,
 * greet the user in that thread and pin the arts and culture suggested prompts.
 * Under agent_view this is the "new conversation" hook — older threads stay in the
 * Messages-tab timeline; this only seeds the new one.
 *
 * A raw event handler (not Bolt's Assistant class) is used to match the app's
 * existing listener style; Bolt omits its thread-bound `say` from raw
 * assistant-event args, so the greeting is posted with client.chat.postMessage
 * targeting the thread — functionally what the Assistant class's `say` does.
 * @param {import('@slack/bolt').AllMiddlewareArgs & import('@slack/bolt').SlackEventMiddlewareArgs<'assistant_thread_started'>} args
 * @returns {Promise<void>}
 */
export async function handleAssistantThreadStarted({ event, client, logger }) {
  try {
    const thread = event.assistant_thread;
    const channelId = thread?.channel_id;
    const threadTs = thread?.thread_ts;
    if (!channelId) return;

    const { title, prompts } = suggestedPrompts();

    await client.chat.postMessage({ channel: channelId, thread_ts: threadTs, text: GREETING });
    await client.assistant.threads.setSuggestedPrompts(
      // thread_ts is optional; under agent_view prompts pin to the top of the
      // Messages tab regardless. Cast until @slack/bolt's types catch up.
      /** @type {import('@slack/web-api').AssistantThreadsSetSuggestedPromptsArguments} */ ({
        channel_id: channelId,
        thread_ts: threadTs,
        title,
        prompts,
      }),
    );
  } catch (e) {
    logger.error(`Failed to handle assistant_thread_started: ${e}`);
  }
}
