import { addDeadline } from '../../agent/tools/deadline-store.js';
import { prettyDate } from '../views/deadline-reminder-builder.js';

/**
 * "Track deadline" button on a grant card: register the grant's deadline so the
 * scheduler nudges this channel before it's due.
 * @param {import('@slack/bolt').AllMiddlewareArgs & import('@slack/bolt').SlackActionMiddlewareArgs<import('@slack/bolt').BlockButtonAction>} args
 * @returns {Promise<void>}
 */
export async function handleGrantTrackDeadline({ ack, body, respond, logger }) {
  await ack();
  try {
    /** @type {{ t?: string, d?: string }} */
    const parsed = JSON.parse(body.actions[0].value || '{}');
    const title = parsed.t || 'Grant deadline';
    const dueDate = parsed.d;

    if (!dueDate) {
      await respond({
        response_type: 'ephemeral',
        replace_original: false,
        text: `I don't have a firm due date for "${title}", so I can't set an automatic reminder. Tell me the date and I'll track it.`,
      });
      return;
    }

    addDeadline({
      title,
      dueDate,
      channelId: /** @type {any} */ (body).channel?.id,
      createdBy: body.user.id,
    });

    await respond({
      response_type: 'ephemeral',
      replace_original: false,
      text: `Tracking *${title}* — I'll remind this channel before it's due on ${prettyDate(dueDate)}.`,
    });
  } catch (e) {
    logger.error(`Failed to track grant deadline: ${e}`);
  }
}
