import { runCommandAgent } from './run-command-agent.js';

/**
 * /deadline [grant name] [deadline] — set a deadline reminder for a grant.
 * (Registered as /deadline because /remind is a reserved Slack built-in command.)
 * @param {import('@slack/bolt').SlackCommandMiddlewareArgs & import('@slack/bolt').AllMiddlewareArgs} args
 * @returns {Promise<void>}
 */
export async function handleRemindCommand({ command, ack, respond, client, context, logger }) {
  await ack();
  const details = (command.text || '').trim();
  if (!details) {
    await respond({
      response_type: 'ephemeral',
      text: 'Usage: `/deadline [grant name] [deadline]` — e.g. `/deadline Ford Foundation August 15`',
    });
    return;
  }
  await runCommandAgent({
    respond,
    client,
    command,
    context,
    prompt: `Set a grant deadline reminder for: ${details}`,
    logger,
  });
}
