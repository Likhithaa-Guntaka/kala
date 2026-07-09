import { runCommandAgent } from './run-command-agent.js';

/**
 * /announce [details] — create a volunteer shift announcement.
 * @param {import('@slack/bolt').SlackCommandMiddlewareArgs & import('@slack/bolt').AllMiddlewareArgs} args
 * @returns {Promise<void>}
 */
export async function handleAnnounceCommand({ command, ack, respond, client, context, logger }) {
  await ack();
  const details = (command.text || '').trim();
  if (!details) {
    await respond({
      response_type: 'ephemeral',
      text: 'Usage: `/announce [event details]` — e.g. `/announce Food Distribution, Saturday Aug 16, 9am-noon, need 8 volunteers`',
    });
    return;
  }
  await runCommandAgent({
    respond,
    client,
    command,
    context,
    prompt: `Create a volunteer announcement for: ${details}`,
    logger,
  });
}
