/** How long to wait on users.info before giving up and greeting neutrally. */
const NAME_FETCH_TIMEOUT_MS = 2000;

/**
 * Fetch a user's first name for a personalized greeting, best-effort.
 *
 * Prefers the human-set display name, then the real name, then the profile's
 * first_name. Returns '' when the name can't be fetched — network error, missing
 * scope, unknown user, or the call taking longer than NAME_FETCH_TIMEOUT_MS — so
 * callers fall back to a neutral greeting and the Home tab never blocks on a slow
 * Slack API response.
 *
 * @param {import('@slack/web-api').WebClient} client
 * @param {string} userId
 * @param {number} [timeoutMs] - Override the 2s cap (used by tests).
 * @returns {Promise<string>}
 */
export async function fetchFirstName(client, userId, timeoutMs = NAME_FETCH_TIMEOUT_MS) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('users.info timed out')), timeoutMs);
  });
  try {
    const res = /** @type {any} */ (await Promise.race([client.users.info({ user: userId }), guard]));
    const profile = res.user?.profile;
    const full = (profile?.display_name || res.user?.real_name || profile?.real_name || '').trim();
    if (profile?.first_name?.trim()) return profile.first_name.trim();
    // Otherwise take the first whitespace-delimited token of the best full name.
    return full ? full.split(/\s+/)[0] : '';
  } catch {
    return '';
  } finally {
    // Clear on both paths: on success so the timer doesn't linger, on timeout
    // it's already fired and this is a harmless no-op.
    clearTimeout(timer);
  }
}
