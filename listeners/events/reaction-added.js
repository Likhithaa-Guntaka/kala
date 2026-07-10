import { runBenvuAgent } from '../../agent/index.js';
import { sessionStore } from '../../thread-context/index.js';
import { getOrgTypeById } from '../org-types.js';
import { buildAgentReply } from '../views/feedback-builder.js';
import { grantCardsFor } from '../views/grant-results-builder.js';

/**
 * Reactions Benvu acts on. Each maps an emoji name to either an agent prompt
 * (built from the reacted message) or a fixed reply.
 * @type {Record<string, { kind: 'agent', prompt: (text: string) => string } | { kind: 'reply', text: string }>}
 */
const REACTION_ACTIONS = {
  clipboard: { kind: 'agent', prompt: (t) => `Summarize this message:\n\n${t}` },
  bell: { kind: 'reply', text: "What's the deadline for this? I'll set a reminder." },
  moneybag: { kind: 'agent', prompt: (t) => `Find grants related to the topic of this message:\n\n${t}` },
  memo: { kind: 'agent', prompt: (t) => `Draft a short report or document based on this message:\n\n${t}` },
};

// Guard against Socket Mode delivering the same reaction event more than once.
/** @type {Set<string>} */
const handled = new Set();

/**
 * Handle reaction_added events. When a human reacts to a message with one of the
 * trigger emojis, Benvu reads the message and replies in a thread on it.
 * @param {import('@slack/bolt').AllMiddlewareArgs & import('@slack/bolt').SlackEventMiddlewareArgs<'reaction_added'>} args
 * @returns {Promise<void>}
 */
export async function handleReactionAdded({ event, client, context, logger }) {
  // Only messages, and only the emojis we act on.
  if (event.item?.type !== 'message') return;
  const action = REACTION_ACTIONS[event.reaction];
  if (!action) return;

  const reactor = event.user;
  // Ignore Benvu's own reactions outright.
  if (!reactor || reactor === context.botUserId) return;

  const channelId = event.item.channel;
  const messageTs = event.item.ts;
  const dedupeKey = `${channelId}:${messageTs}:${event.reaction}:${reactor}`;
  if (handled.has(dedupeKey)) return;
  handled.add(dedupeKey);

  try {
    // Only respond to reactions from human users, not bots.
    const info = await client.users.info({ user: reactor });
    if (info.user?.is_bot || info.user?.id === 'USLACKBOT') return;

    // Bell is a simple question — no need to read the message.
    if (action.kind === 'reply') {
      await client.chat.postMessage({ channel: channelId, thread_ts: messageTs, text: action.text });
      return;
    }

    // Read the original message content.
    const history = await client.conversations.history({
      channel: channelId,
      latest: messageTs,
      inclusive: true,
      limit: 1,
    });
    const original = history.messages?.[0];
    const messageContent = (original?.text || '').trim();
    if (!messageContent) {
      await client.chat.postMessage({
        channel: channelId,
        thread_ts: messageTs,
        text: "I couldn't find any text in that message to work with — try reacting to a message with some text.",
      });
      return;
    }

    const orgType = getOrgTypeById(sessionStore.getOrgType(reactor))?.label;
    const deps = {
      client,
      userId: reactor,
      channelId,
      threadTs: messageTs,
      messageTs,
      userToken: context.userToken,
      orgType,
    };
    const { responseText, grants } = await runBenvuAgent(action.prompt(messageContent), undefined, deps);

    await client.chat.postMessage({
      channel: channelId,
      thread_ts: messageTs,
      text: responseText,
      blocks: buildAgentReply(responseText, grantCardsFor(grants, messageContent)),
    });
  } catch (e) {
    handled.delete(dedupeKey);
    logger.error(`Failed to handle reaction_added: ${e}`);
  }
}
