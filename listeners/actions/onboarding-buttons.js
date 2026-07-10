import { runBenvuAgent } from '../../agent/index.js';
import { sessionStore } from '../../thread-context/index.js';
import { setAssistantStatus, statusForMessage } from '../assistant-status.js';
import { getOrgTypeById } from '../org-types.js';
import { buildAppHomeView } from '../views/app-home-builder.js';
import { buildAgentReply } from '../views/feedback-builder.js';
import { grantCardsFor } from '../views/grant-results-builder.js';
import { buildTailoredPromptsDmBlocks } from '../views/onboarding-builder.js';
import { fetchFirstName } from '../views/user-name.js';

/**
 * Re-publish the App Home view for a user (reflects their current org type).
 * @param {import('@slack/web-api').WebClient} client
 * @param {any} context
 * @param {string} userId
 */
async function refreshAppHome(client, context, userId) {
  const orgType = sessionStore.getOrgType(userId);
  const firstName = await fetchFirstName(client, userId);
  const view = buildAppHomeView(context.botUserId, orgType, { firstName });
  await client.views.publish({ user_id: userId, view });
}

/**
 * Handle an org-type selection button. Stores the choice, sends a tailored
 * follow-up DM, and refreshes the App Home tab.
 * @param {import('@slack/bolt').AllMiddlewareArgs & import('@slack/bolt').SlackActionMiddlewareArgs<import('@slack/bolt').BlockButtonAction>} args
 * @returns {Promise<void>}
 */
export async function handleOrgTypeSelected({ ack, body, client, context, logger }) {
  await ack();

  try {
    const userId = body.user.id;
    const orgTypeId = body.actions[0].value;
    const org = getOrgTypeById(orgTypeId);
    if (!org) return;

    // Durable persistence (survives restarts) is handled by the disk-backed store.
    sessionStore.setOrgType(userId, org.id);

    // Best-effort: also mirror the choice into the user's Slack profile custom field
    // "benvu_org_type". Bots generally can't write other users' profile fields (and
    // custom fields need an admin-defined field ID), so this is expected to no-op in
    // most workspaces — the disk store above is the source of truth.
    try {
      await client.users.profile.set({
        user: userId,
        profile: { fields: { benvu_org_type: { value: org.id, alt: '' } } },
      });
    } catch {
      // Not supported for this user/workspace — durable persistence already handled on disk.
    }

    // Follow-up DM with three tailored example prompts as native buttons.
    const conversation = await client.conversations.open({ users: userId });
    const channelId = conversation.channel?.id;
    if (channelId) {
      await client.chat.postMessage({
        channel: channelId,
        text: `Set up for ${org.label}.`,
        blocks: buildTailoredPromptsDmBlocks(org),
      });
    }

    await refreshAppHome(client, context, userId);
  } catch (e) {
    logger.error(`Failed to handle org-type selection: ${e}`);
  }
}

/**
 * Handle the App Home "Change organization type" button: clear the stored type
 * and re-render the onboarding picker.
 * @param {import('@slack/bolt').AllMiddlewareArgs & import('@slack/bolt').SlackActionMiddlewareArgs<import('@slack/bolt').BlockButtonAction>} args
 * @returns {Promise<void>}
 */
export async function handleChangeOrgType({ ack, body, client, context, logger }) {
  await ack();

  try {
    const userId = body.user.id;
    sessionStore.clearOrgType(userId);
    await refreshAppHome(client, context, userId);
  } catch (e) {
    logger.error(`Failed to change org type: ${e}`);
  }
}

/**
 * Handle a tailored example-prompt button. Runs the agent with that prompt and
 * replies in a DM, so onboarding suggestions are immediately actionable.
 * @param {import('@slack/bolt').AllMiddlewareArgs & import('@slack/bolt').SlackActionMiddlewareArgs<import('@slack/bolt').BlockButtonAction>} args
 * @returns {Promise<void>}
 */
export async function handlePromptButton({ ack, body, client, context, logger }) {
  await ack();

  try {
    const userId = body.user.id;
    const prompt = body.actions[0].value;
    if (!prompt) return;

    // Prompt buttons live in a DM message, but the same buttons on the App Home
    // tab have no channel — open a DM in that case.
    let channelId = /** @type {any} */ (body).channel?.id;
    if (!channelId) {
      const conversation = await client.conversations.open({ users: userId });
      channelId = conversation.channel?.id;
    }
    if (!channelId) return;

    // Echo the chosen prompt so the DM reads like a normal conversation turn.
    const echo = await client.chat.postMessage({ channel: channelId, text: `*You:* ${prompt}` });
    const threadTs = /** @type {string} */ (echo.ts);

    // Show a native assistant-thread status while Benvu works.
    await setAssistantStatus(client, channelId, threadTs, statusForMessage(prompt));

    const orgType = getOrgTypeById(sessionStore.getOrgType(userId))?.label;
    const existingSessionId = sessionStore.getSession(channelId, threadTs);
    const deps = {
      client,
      userId,
      channelId,
      threadTs,
      messageTs: threadTs,
      userToken: context.userToken,
      orgType,
    };

    const { responseText, sessionId, grants } = await runBenvuAgent(prompt, existingSessionId ?? undefined, deps);

    // Clear the status, then post the answer with grant cards + feedback buttons.
    await setAssistantStatus(client, channelId, threadTs, '');
    await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: responseText,
      blocks: buildAgentReply(responseText, grantCardsFor(grants, prompt)),
    });

    if (sessionId) sessionStore.setSession(channelId, threadTs, sessionId);
  } catch (e) {
    logger.error(`Failed to run prompt button: ${e}`);
  }
}
