import { runCommandAgent } from './run-command-agent.js';

/**
 * /grant [query] — find grants matching the query.
 * @param {import('@slack/bolt').SlackCommandMiddlewareArgs & import('@slack/bolt').AllMiddlewareArgs} args
 * @returns {Promise<void>}
 */
export async function handleGrantCommand({ command, ack, respond, client, context, logger }) {
  await ack();
  const query = (command.text || '').trim();
  if (!query) {
    await respond({
      response_type: 'ephemeral',
      text: 'Usage: `/grant [what you are looking for]` — e.g. `/grant youth education under $50k`',
    });
    return;
  }
  await runCommandAgent({ respond, client, command, context, prompt: `Find grants for ${query}`, logger });
}
