import { formatFeedbackSummary } from '../feedback-store.js';

/**
 * /benvu-feedback — (admin) show a summary of thumbs-up/down feedback.
 * Responds ephemerally, so the summary is only visible to whoever runs it.
 * @param {import('@slack/bolt').SlackCommandMiddlewareArgs & import('@slack/bolt').AllMiddlewareArgs} args
 * @returns {Promise<void>}
 */
export async function handleFeedbackAdminCommand({ ack, respond }) {
  await ack();
  await respond({ response_type: 'ephemeral', text: formatFeedbackSummary() });
}
