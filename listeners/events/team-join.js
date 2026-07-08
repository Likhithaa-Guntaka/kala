// Message DMed to every new workspace member so they discover Benvu on day one.
const WELCOME_MESSAGE = [
  "Hi! I'm Benvu 👋 I'm your AI teammate for nonprofit work. I can help you:",
  '- 🌱 Find grants',
  '- 📝 Draft impact reports',
  '- ⏰ Track deadlines',
  "Just message me anytime in any language. Try saying: 'find grants for youth education under $50k'",
].join('\n');

/**
 * Handle team_join events — fired when a new member joins the workspace.
 * Opens a DM with the new member and sends Benvu's welcome message.
 * @param {import('@slack/bolt').AllMiddlewareArgs & import('@slack/bolt').SlackEventMiddlewareArgs<'team_join'>} args
 * @returns {Promise<void>}
 */
export async function handleTeamJoin({ event, client, logger }) {
  try {
    const { user } = event;
    // Skip bots/app installs — only welcome real people.
    if (!user?.id || user.is_bot) return;

    // Open (or reuse) the DM channel with the new member, then post the welcome.
    const conversation = await client.conversations.open({ users: user.id });
    const channelId = conversation.channel?.id;
    if (!channelId) return;

    await client.chat.postMessage({ channel: channelId, text: WELCOME_MESSAGE });
  } catch (e) {
    logger.error(`Failed to send welcome DM on team_join: ${e}`);
  }
}
