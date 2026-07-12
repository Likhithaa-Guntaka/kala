import { addRsvp } from '../../agent/tools/event-store.js';
import { buildRsvpMessageBlocks, buildRsvpText } from '../views/event-rsvp-builder.js';

/**
 * "I'll be there" — record the clicking user's RSVP and update the sign-up card
 * in place so the head count and name list stay live. Uses response_url (respond),
 * so it works on the posted card without extra scopes. A repeat click is a no-op.
 * @param {import('@slack/bolt').AllMiddlewareArgs & import('@slack/bolt').SlackActionMiddlewareArgs<import('@slack/bolt').BlockButtonAction>} args
 * @returns {Promise<void>}
 */
export async function handleRsvpGoing({ ack, body, respond, logger }) {
  await ack();
  try {
    const id = body.actions[0].value ?? '';
    const userId = body.user.id;
    const res = addRsvp(id, { userId });
    if (!res) {
      await respond({
        replace_original: false,
        response_type: 'ephemeral',
        text: "I couldn't find that event anymore.",
      });
      return;
    }
    // Re-render the card with the updated head count (idempotent on a repeat click).
    await respond({
      replace_original: true,
      text: buildRsvpText(res.event),
      blocks: buildRsvpMessageBlocks(res.event),
    });
  } catch (e) {
    logger.error(`Failed to record RSVP: ${e}`);
  }
}
