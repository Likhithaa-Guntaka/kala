import { sessionStore } from '../../thread-context/index.js';
import { buildAppHomeView } from './app-home-builder.js';
import { fetchFirstName } from './user-name.js';

/**
 * Handle issue submission from the modal.
 *
 * Posts a short, human parent message to the user's DM (with the real request
 * carried in metadata), so the message event handler picks it up and runs the
 * agent — whose answer lands as a thread reply. Then republishes the Home tab
 * with a brief confirmation banner, since App Home has no ephemeral messages and
 * can't switch the user's tab; the banner clears on the next Home refresh.
 * @param {import('@slack/bolt').AllMiddlewareArgs & import('@slack/bolt').SlackViewMiddlewareArgs} args
 * @returns {Promise<void>}
 */
export async function handleIssueSubmission({ ack, body, client, context, logger }) {
  await ack();

  try {
    const userId = /** @type {string} */ (context.userId);
    const values = body.view.state.values;
    const category = /** @type {string} */ (values.category_block.category_select.selected_option?.value);
    const description = (values.description_block.description_input.value || '').trim();

    // Two distinct strings from one submission:
    //  - displayText: the human parent message the user sees in their DM.
    //  - agentPrompt: the real instruction the agent runs (never shown as debug
    //    text, and never the literal "undefined" when Details is left blank).
    const displayText = `On it — working on *${category}*. The full answer is in the thread below.`;
    const agentPrompt = description ? `${category}: ${description}` : category;

    // Open a DM with the user.
    const dm = await client.conversations.open({ users: userId });
    const channelId = /** @type {string} */ (dm.channel?.id);

    // Post the parent message with metadata so the message handler can identify
    // it, recover the original user, and run the agent on the real prompt.
    await client.chat.postMessage({
      channel: channelId,
      text: displayText,
      metadata: {
        event_type: 'issue_submission',
        event_payload: { user_id: userId, prompt: agentPrompt },
      },
    });

    // In-place confirmation on the Home tab (the only feasible signal there):
    // republish it with a transient banner. Best-effort — a failure here must not
    // fail the submission, since the DM has already been sent.
    try {
      const orgTypeId = sessionStore.getOrgType(userId);
      const firstName = await fetchFirstName(client, userId);
      const view = buildAppHomeView(context.botUserId, orgTypeId, {
        firstName,
        notice: `Sent to your messages — open the Messages tab to see what I found for *${category}*.`,
      });
      await client.views.publish({ user_id: userId, view });
    } catch (bannerErr) {
      logger.error(`Failed to show Home confirmation banner: ${bannerErr}`);
    }
  } catch (e) {
    logger.error(`Failed to handle issue submission: ${e}`);
  }
}
