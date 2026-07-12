import { acknowledge } from '../../agent/tools/schedule-store.js';
import { buildScheduleAckBlocks, buildScheduleAckText } from '../views/schedule-ack-builder.js';

/**
 * "Acknowledge" — record the clicking user's confirmation and update the card in
 * place so the "X of Y confirmed" line and the still-waiting list stay live. Uses
 * response_url (respond), so it works on the posted card without extra scopes.
 * A repeat click is a no-op.
 * @param {import('@slack/bolt').AllMiddlewareArgs & import('@slack/bolt').SlackActionMiddlewareArgs<import('@slack/bolt').BlockButtonAction>} args
 * @returns {Promise<void>}
 */
export async function handleScheduleAck({ ack, body, respond, logger }) {
  await ack();
  try {
    const id = body.actions[0].value ?? '';
    const userId = body.user.id;
    const res = acknowledge(id, { userId });
    if (!res) {
      await respond({
        replace_original: false,
        response_type: 'ephemeral',
        text: "I couldn't find that schedule change anymore.",
      });
      return;
    }
    await respond({
      replace_original: true,
      text: buildScheduleAckText(res.record),
      blocks: buildScheduleAckBlocks(res.record),
    });
  } catch (e) {
    logger.error(`Failed to record schedule acknowledgment: ${e}`);
  }
}
