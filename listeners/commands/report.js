import { runCommandAgent } from './run-command-agent.js';

/**
 * /report [description] — draft an impact report from a short description.
 * @param {import('@slack/bolt').SlackCommandMiddlewareArgs & import('@slack/bolt').AllMiddlewareArgs} args
 * @returns {Promise<void>}
 */
export async function handleReportCommand({ command, ack, respond, client, context, logger }) {
  await ack();
  const description = (command.text || '').trim();
  if (!description) {
    await respond({
      response_type: 'ephemeral',
      text: 'Usage: `/report [what you accomplished]` — e.g. `/report we tutored 150 students this semester`',
    });
    return;
  }
  await runCommandAgent({
    respond,
    client,
    command,
    context,
    prompt: `Draft an impact report based on this: ${description}`,
    logger,
  });
}
