import { ARTS_CULTURE } from '../arts-culture.js';
import { buildAppHomeView } from './app-home-builder.js';
import { countClosingSoon } from './closing-soon.js';
import { fetchFirstName } from './user-name.js';

/**
 * Best-effort live "grants closing soon" count for arts and culture funding, or
 * null. Never throws and self-times-out inside countClosingSoon, so it can't delay
 * or break the render.
 * @returns {Promise<{ count: number, label: string } | null>}
 */
async function closingSoonForArts() {
  const count = await countClosingSoon(ARTS_CULTURE.defaultGrantCategories);
  return typeof count === 'number' && count > 0 ? { count, label: ARTS_CULTURE.grantLabel } : null;
}

/**
 * Per-user generation token. Every publishHome call takes the next token for its
 * user; after awaiting the (possibly slow) name fetch, it publishes only if no
 * newer call has started. Without this, a slow older refresh could finish last and
 * overwrite the tab with a stale snapshot taken before a newer refresh ran.
 * @type {Map<string, number>}
 */
const publishGen = new Map();

/**
 * Publish the App Home view for a user, guarded against stale overwrites: a
 * per-user generation guard means only the most recently started call for a user
 * actually publishes; superseded in-flight calls bail out. So overlapping refreshes
 * (a Home re-open, a banner update) can't land out of order.
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

  // Best-effort live "closing soon" count. Self-times-out and never throws, so a
  // slow or down Grants.gov omits the line instead of blocking Home.
  const closingSoon = await closingSoonForArts();
  // A newer publish may have started during the (bounded) count fetch — let it win.
  if (publishGen.get(userId) !== gen) return false;

  const view = buildAppHomeView(botUserId, { firstName, notice, closingSoon });
  await client.views.publish({ user_id: userId, view });
  return true;
}

/** Reset the generation map. Test helper. @returns {void} */
export function _resetPublishGen() {
  publishGen.clear();
}
