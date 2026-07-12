import { buildHelpBlocks } from '../views/command-builder.js';

export const HELP_TEXT = [
  "*Hi, I'm Kala.* I find grants, draft reports, and track deadlines, in any language.",
  '',
  '• `/grant [query]` — Find grant opportunities (e.g. `/grant youth education under $50k`)',
  '• `/report [description]` — Draft an impact report from what you accomplished',
  '• `/deadline [grant] [deadline]` — Set a grant deadline reminder',
  '• `/announce [details]` — Create a volunteer shift announcement',
  '• `/kala` — Show this help',
  '',
  'You can also DM me or mention @kala in any channel — in any language.',
].join('\n');

/**
 * /kala — show a help message listing all commands.
 * @param {import('@slack/bolt').SlackCommandMiddlewareArgs & import('@slack/bolt').AllMiddlewareArgs} args
 * @returns {Promise<void>}
 */
export async function handleKalaCommand({ ack, respond }) {
  await ack();
  await respond({ response_type: 'ephemeral', text: HELP_TEXT, blocks: buildHelpBlocks() });
}
