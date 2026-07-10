import { runBenvuAgent } from '../../agent/index.js';
import { sessionStore } from '../../thread-context/index.js';
import { setAssistantStatus, statusForMessage } from '../assistant-status.js';
import { getOrgTypeById } from '../org-types.js';
import { buildAgentReply } from '../views/feedback-builder.js';
import { grantCardsFor } from '../views/grant-results-builder.js';
import { buildTailoredPromptsDmBlocks } from '../views/onboarding-builder.js';
import { publishHome } from '../views/publish-home.js';

/**
 * Re-publish the App Home view for a user (reflects their current org type),
 * guarded against stale overwrites by publishHome.
 * @param {import('@slack/web-api').WebClient} client
 * @param {any} context
 * @param {string} userId
 */
async function refreshAppHome(client, context, userId) {
  await publishHome(client, { userId, botUserId: context.botUserId });
}

/**
 * Whether our stored tailored-prompts DM is still the most recent message in that
 * DM. If it is, we can edit it in place; otherwise the user has chatted since and
 * we post fresh. On any error, treat it as not-latest (post fresh) rather than
 * risk editing a message that has scrolled away.
 * @param {import('@slack/web-api').WebClient} client
 * @param {{ channel: string, ts: string }} ref
 * @returns {Promise<boolean>}
 */
async function isOnboardingMsgStillLatest(client, ref) {
  try {
    const res = await client.conversations.history({ channel: ref.channel, limit: 1 });
    return res.messages?.[0]?.ts === ref.ts;
  } catch {
    return false;
  }
}

/**
 * Post the tailored-prompts DM on first onboarding, or on a later org change edit
 * the existing message in place — unless the user has chatted since (our message
 * is no longer the latest), in which case post a fresh one and re-point the ref.
 *
 * chat.update keeps the same message ts, so the prompt_run_* buttons stay wired:
 * their action_id and value are rebuilt from the new org, and Bolt matches them by
 * action_id regardless of the message being edited rather than replaced.
 * @param {import('@slack/web-api').WebClient} client
 * @param {string} userId
 * @param {import('../org-types.js').OrgType} org
 * @param {boolean} isFirstOnboarding
 * @returns {Promise<void>}
 */
async function postOrUpdateTailoredDm(client, userId, org, isFirstOnboarding) {
  const conversation = await client.conversations.open({ users: userId });
  const channelId = conversation.channel?.id;
  if (!channelId) return;

  const text = `Set up for ${org.label}.`;
  const blocks = buildTailoredPromptsDmBlocks(org);

  if (!isFirstOnboarding) {
    const ref = sessionStore.getOnboardingMessageRef(userId);
    if (ref && (await isOnboardingMsgStillLatest(client, ref))) {
      await client.chat.update({ channel: ref.channel, ts: ref.ts, text, blocks });
      return;
    }
    // No usable ref, or the DM has moved on — fall through and post fresh.
  }

  const res = await client.chat.postMessage({ channel: channelId, text, blocks });
  if (res.ts) {
    sessionStore.setOnboardingMessageRef(userId, { channel: channelId, ts: /** @type {string} */ (res.ts) });
  }
}

/**
 * Handle an org-type selection button. Stores the choice and refreshes the App
 * Home tab. On the FIRST time a user onboards (org type going from none to a real
 * value) it also sends the tailored-prompts DM; on a later change it only
 * refreshes the Home tab, so repeat changes don't re-post that DM.
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

    // The tailored DM should go out only on a user's first-ever onboarding, not
    // on later org-type changes. `getOrgType` can't tell those apart, because the
    // "Change organization type" flow clears the org type to null before the user
    // re-picks — so a dedicated onboarded flag (which clearOrgType never resets)
    // is the real signal.
    const isFirstOnboarding = !sessionStore.hasOnboarded(userId);
    logger.info(`[org-select] user=${userId} hasOnboarded=${!isFirstOnboarding} picking=${org.id}`);

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

    // Mark onboarded up front so a rapid second click can't double-post the DM.
    if (isFirstOnboarding) sessionStore.markOnboarded(userId);

    // First onboarding posts the tailored-prompts DM; a later change edits that
    // message in place (or posts fresh if the DM has since moved on) — never a
    // silent duplicate per switch.
    await postOrUpdateTailoredDm(client, userId, org, isFirstOnboarding);

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
