import { sessionStore } from '../../thread-context/index.js';
import { buildAppHomeView } from './app-home-builder.js';
import { fetchFirstName } from './user-name.js';

/**
 * Per-user generation token. Every publishHome call takes the next token for its
 * user; after awaiting the (possibly slow) name fetch, it publishes only if no
 * newer call has started. Without this, a slow older refresh — e.g. the Home
 * refresh that runs after posting the onboarding DM — could finish last and
 * overwrite the tab with a stale snapshot taken before a newer refresh ran.
 * @type {Map<string, number>}
 */
const publishGen = new Map();

/**
 * Publish the App Home view for a user, guarded against stale overwrites.
 *
 * Two properties make concurrent refreshes safe:
 *  1. The org type is read AFTER the async name fetch, so a publish never carries
 *     a pre-await snapshot of the org type.
 *  2. A per-user generation guard means only the most recently started call for a
 *     user actually publishes; superseded in-flight calls bail out. So overlapping
 *     refreshes (change-org then re-pick, a Home re-open, a banner update) can't
 *     land out of order and show a stale org.
 *
 * @param {import('@slack/web-api').WebClient} client
 * @param {Object} opts
 * @param {string} opts.userId
 * @param {string | null} [opts.botUserId]
 * @param {string} [opts.notice] - Transient banner text (e.g. the issue-modal confirmation).
 * @returns {Promise<boolean>} whether a publish actually happened (false if superseded)
 */
export async function publishHome(client, { userId, botUserId = null, notice }) {
  const gen = (publishGen.get(userId) || 0) + 1;
  publishGen.set(userId, gen);

  const firstName = await fetchFirstName(client, userId);

  // A newer publish for this user started while we awaited — let it win.
  if (publishGen.get(userId) !== gen) return false;

  // Read the org type fresh, AFTER the await, so we never publish a stale snapshot.
  const orgType = sessionStore.getOrgType(userId);
  const view = buildAppHomeView(botUserId, orgType, { firstName, notice });
  await client.views.publish({ user_id: userId, view });
  return true;
}

/** Reset the generation map. Test helper. @returns {void} */
export function _resetPublishGen() {
  publishGen.clear();
}
