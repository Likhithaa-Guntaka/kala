import { runKalaAgent } from '../../agent/index.js';
import { buildAgentReply } from '../views/feedback-builder.js';
import { grantCardsFor } from '../views/grant-results-builder.js';

/**
 * Shared runner for slash commands: shows a "thinking" indicator, runs the
 * Kala agent with a crafted prompt, and posts the result in the channel where
 * the command was typed. Uses response_url (respond), so it works in any channel
 * without the bot needing to be a member.
 *
 * Note: Slack's native assistant thread status (assistant.threads.setStatus) only
 * applies to assistant threads / DMs, not slash commands in channels — so we show
 * a lightweight in-channel "thinking" message that is then replaced by the answer.
 *
 * @param {Object} args
 * @param {import('@slack/bolt').RespondFn} args.respond
 * @param {import('@slack/web-api').WebClient} args.client
 * @param {import('@slack/bolt').SlashCommand} args.command
 * @param {any} args.context
 * @param {string} args.prompt - The natural-language prompt to send to the agent.
 * @param {import('@slack/bolt').Logger} args.logger
 * @returns {Promise<void>}
 */
export async function runCommandAgent({ respond, client, command, context, prompt, logger }) {
  await respond({ response_type: 'in_channel', text: '_Kala is thinking…_' });

  try {
    const userId = command.user_id;
    const deps = {
      client,
      userId,
      channelId: command.channel_id,
      threadTs: '',
      messageTs: '',
      userToken: context.userToken,
    };

    const { responseText, grants } = await runKalaAgent(prompt, undefined, deps);
    await respond({
      replace_original: true,
      response_type: 'in_channel',
      text: responseText,
      blocks: buildAgentReply(responseText, grantCardsFor(grants, prompt)),
    });
  } catch (e) {
    logger.error(`Slash command agent failed: ${e}`);
    await respond({
      replace_original: true,
      response_type: 'ephemeral',
      text: 'Sorry, something went wrong on my end. Please try again in a moment.',
    });
  }
}
