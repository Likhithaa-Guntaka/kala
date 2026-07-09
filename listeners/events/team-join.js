import { buildWelcomeDmBlocks } from '../views/onboarding-builder.js';

// Fallback text (shown in notifications and by clients that can't render blocks).
const WELCOME_FALLBACK = "Hi! I'm Benvu 👋 your AI teammate for nonprofit work. What kind of organization are you?";

/**
 * Handle team_join events — fired when a new member joins the workspace.
 * Opens a DM with the new member and starts onboarding with native org-type buttons.
 * @param {import('@slack/bolt').AllMiddlewareArgs & import('@slack/bolt').SlackEventMiddlewareArgs<'team_join'>} args
 * @returns {Promise<void>}
 */
export async function handleTeamJoin({ event, client, logger }) {
  try {
    const { user } = event;
    // Skip bots/app installs — only welcome real people.
    if (!user?.id || user.is_bot) return;

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
    logger.error(`Failed to send welcome DM on team_join: ${e}`);
  }
}
