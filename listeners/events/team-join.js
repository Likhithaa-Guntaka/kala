import { buildWelcomeDmBlocks } from '../views/onboarding-builder.js';

// Fallback text (shown in notifications and by clients that can't render blocks).
const WELCOME_FALLBACK = "Hi, I'm Benvu, your AI teammate for nonprofit work. What kind of organization are you?";

// Idempotency guard: Socket Mode can deliver the same event over more than one
// connection (and Slack may retry), which otherwise sends the welcome twice.
// Record each user synchronously before any await so the second delivery is dropped.
/** @type {Set<string>} */
const welcomed = new Set();

/**
 * Handle team_join events — fired when a new member joins the workspace.
 * Opens a DM with the new member and starts onboarding with native org-type buttons.
 * @param {import('@slack/bolt').AllMiddlewareArgs & import('@slack/bolt').SlackEventMiddlewareArgs<'team_join'>} args
 * @returns {Promise<void>}
 */
export async function handleTeamJoin({ event, client, logger }) {
  const { user } = event;
  // Skip bots/app installs — only welcome real people.
  if (!user?.id || user.is_bot) return;
  // Only welcome each member once, even if the event is delivered more than once.
  if (welcomed.has(user.id)) return;
  welcomed.add(user.id);

  try {
    // Open (or reuse) the DM channel with the new member, then send the welcome.
    const conversation = await client.conversations.open({ users: user.id });
    const channelId = conversation.channel?.id;
    if (!channelId) return;

    await client.chat.postMessage({
      channel: channelId,
      text: WELCOME_FALLBACK,
      blocks: buildWelcomeDmBlocks(),
    });
  } catch (e) {
    // Allow a genuine retry if the welcome failed to send.
    welcomed.delete(user.id);
    logger.error(`Failed to send welcome DM on team_join: ${e}`);
  }
}
